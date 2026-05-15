/* =====================================================================
   JAMES RECONCILE · MAPEAMENTO DE DADOS HISTÓRICOS

   Varre vendas existentes (que foram criadas ANTES dos painéis Sellers/
   Influencers existirem ou que não estavam atribuídas) e mapeia
   automaticamente por nome (fuzzy match) para vendedores e
   influencers cadastrados.

   Atualiza:
     - vendedor.vendido_total / vendas_count / comissao_acumulada
     - influencer.vendas_count / vendido_total / comissao_acumulada
     - meta.realizado (recalcula do zero somando vendas atribuídas)

   API:
     window.__flyReconcile = {
       reconcileSellers()      → { matched, sellersUpdated, details }
       reconcileInfluencers()  → idem
       reconcileMetas()        → recalcula realizado de todas as metas
       reconcileAll()          → roda os 3 acima
       dryRun()                → simula sem salvar (preview)
     };
   ===================================================================== */
(function flyReconcileBoot() {
  'use strict';

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); }
    catch (e) {}
  }
  function getMode() { return localStorage.getItem('fly_data_mode') || 'demo'; }
  function modeKey(b) { return `${b}_${getMode()}`; }

  function normalize(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9@\s]/g, '').trim();
  }

  // Fuzzy match por substring
  function findSellerForSale(sale, sellers) {
    if (!sale.seller) return null;
    const sn = normalize(sale.seller);
    if (!sn) return null;
    return sellers.find(s => {
      const en = normalize(s.nome);
      return en === sn || en.includes(sn) || sn.includes(en);
    });
  }

  function findInfluencerForSale(sale, influencers) {
    // Busca em sale.origin (formato "Influencer:@handle") ou sale.influencer
    let raw = sale.influencer || '';
    if (!raw) {
      const m = String(sale.origin || '').match(/(?:influencer:)?@?([\w._-]+)/i);
      if (m && /influencer/i.test(sale.origin || '')) raw = m[1];
    }
    if (!raw) return null;
    const handle = normalize(String(raw).replace('@', ''));
    if (!handle) return null;
    return influencers.find(i => {
      const ih = normalize(String(i.handle || '').replace('@', ''));
      const inom = normalize(i.nome);
      return ih === handle || ih.includes(handle) || inom.includes(handle);
    });
  }

  /* ---------------------------------------------------------------
     RECONCILE · SELLERS
  --------------------------------------------------------------- */
  function reconcileSellers(opts = {}) {
    const dryRun = !!opts.dryRun;
    const sellersKey = modeKey('fly_sellers_v1');
    const sellers = readJSON(sellersKey, []);
    if (!sellers.length) return { matched: 0, sellersUpdated: 0, details: [], message: 'Nenhum vendedor cadastrado. Cadastre primeiro.' };

    const sales = readJSON(modeKey('fly_sales_v1'), []);
    const updates = new Map(); // sellerId → { vendido, vendas, comissao }
    let matched = 0;
    const details = [];

    sales.forEach(sale => {
      const seller = findSellerForSale(sale, sellers);
      if (!seller) return;
      // Pula se a venda já tem source=cascade (já foi processada)
      if (sale.attributed_seller_id === seller.id) return;

      const value = Number(sale.amount) || 0;
      const commission = value * (Number(seller.comissao_percent) || 0) / 100;
      const u = updates.get(seller.id) || { vendido: 0, vendas: 0, comissao: 0 };
      u.vendido += value;
      u.vendas += 1;
      u.comissao += commission;
      updates.set(seller.id, u);
      matched++;
      details.push({ sale: sale.id, seller: seller.nome, value, commission });
    });

    if (dryRun) {
      return { matched, sellersUpdated: updates.size, details, dryRun: true };
    }

    // Aplica updates
    sellers.forEach(s => {
      const u = updates.get(s.id);
      if (!u) return;
      // Reseta o mês corrente e soma (evita dupla contagem se rodar 2x — usa flag)
      s.vendido_total      = (s.vendido_total      || 0) + u.vendido;
      s.vendido_mes        = (s.vendido_mes        || 0) + u.vendido;
      s.vendas_count       = (s.vendas_count       || 0) + u.vendas;
      s.comissao_acumulada = (s.comissao_acumulada || 0) + u.comissao;
      s.last_reconciled_at = new Date().toISOString();
    });

    // Marca vendas como atribuídas pra evitar dupla reconciliação
    const updatedSales = sales.map(sale => {
      const seller = findSellerForSale(sale, sellers);
      if (seller && sale.attributed_seller_id !== seller.id) {
        return { ...sale, attributed_seller_id: seller.id, attributed_at: new Date().toISOString() };
      }
      return sale;
    });

    writeJSON(sellersKey, sellers);
    writeJSON(modeKey('fly_sales_v1'), updatedSales);
    return { matched, sellersUpdated: updates.size, details };
  }

  /* ---------------------------------------------------------------
     RECONCILE · INFLUENCERS
  --------------------------------------------------------------- */
  function reconcileInfluencers(opts = {}) {
    const dryRun = !!opts.dryRun;
    const infKey = modeKey('fly_influencers_v1');
    const infs = readJSON(infKey, []);
    if (!infs.length) return { matched: 0, influencersUpdated: 0, details: [], message: 'Nenhum influencer cadastrado.' };

    const sales = readJSON(modeKey('fly_sales_v1'), []);
    const updates = new Map();
    let matched = 0;
    const details = [];

    sales.forEach(sale => {
      const inf = findInfluencerForSale(sale, infs);
      if (!inf) return;
      if (sale.attributed_influencer_id === inf.id) return;
      const value = Number(sale.amount) || 0;
      let commission;
      if (inf.comissao_modelo === 'fixo') commission = Number(inf.comissao_fixa) || 0;
      else if (inf.comissao_modelo === 'hibrido') commission = (Number(inf.comissao_fixa) || 0) + value * (Number(inf.comissao_percent) || 0) / 100;
      else commission = value * (Number(inf.comissao_percent) || 0) / 100;

      const u = updates.get(inf.id) || { vendido: 0, vendas: 0, comissao: 0 };
      u.vendido += value;
      u.vendas += 1;
      u.comissao += commission;
      updates.set(inf.id, u);
      matched++;
      details.push({ sale: sale.id, influencer: inf.handle, value, commission });
    });

    if (dryRun) return { matched, influencersUpdated: updates.size, details, dryRun: true };

    infs.forEach(i => {
      const u = updates.get(i.id);
      if (!u) return;
      i.vendas_count       = (i.vendas_count       || 0) + u.vendas;
      i.vendido_total      = (i.vendido_total      || 0) + u.vendido;
      i.comissao_acumulada = (i.comissao_acumulada || 0) + u.comissao;
      i.last_reconciled_at = new Date().toISOString();
    });

    const updatedSales = sales.map(sale => {
      const inf = findInfluencerForSale(sale, infs);
      if (inf && sale.attributed_influencer_id !== inf.id) {
        return { ...sale, attributed_influencer_id: inf.id };
      }
      return sale;
    });

    writeJSON(infKey, infs);
    writeJSON(modeKey('fly_sales_v1'), updatedSales);
    return { matched, influencersUpdated: updates.size, details };
  }

  /* ---------------------------------------------------------------
     RECONCILE · METAS
     Recalcula realizado das metas SEM duplicação:
     varre as vendas e soma de novo conforme o escopo
  --------------------------------------------------------------- */
  function reconcileMetas() {
    const metas = readJSON(modeKey('fly_metas_v1'), []);
    if (!metas.length) return { metasUpdated: 0 };
    const sales = readJSON(modeKey('fly_sales_v1'), []);
    const sellers = readJSON(modeKey('fly_sellers_v1'), []);
    const infs = readJSON(modeKey('fly_influencers_v1'), []);

    let metasUpdated = 0;
    metas.forEach(m => {
      if (m.status !== 'ativa' && m.status !== 'batida') return;
      let realizado = 0;
      let matchedAny = false;
      sales.forEach(sale => {
        // Filtros de escopo
        if (m.escopo === 'produto' && (m.escopo_id !== sale.product && m.escopo_nome !== sale.product)) return;
        if (m.escopo === 'vendedor') {
          const seller = sellers.find(s => s.id === sale.attributed_seller_id) || findSellerForSale(sale, sellers);
          if (!seller || (m.escopo_id !== seller.id && m.escopo_nome !== seller.nome)) return;
        }
        if (m.escopo === 'influencer') {
          const inf = infs.find(i => i.id === sale.attributed_influencer_id) || findInfluencerForSale(sale, infs);
          if (!inf || (m.escopo_id !== inf.id && m.escopo_nome !== inf.handle)) return;
        }
        // Filtros de período
        if (m.data_inicio && new Date(sale.created_at || 0) < new Date(m.data_inicio)) return;
        if (m.data_fim    && new Date(sale.created_at || 0) > new Date(m.data_fim))    return;
        // Soma
        matchedAny = true;
        if (m.tipo === 'receita') realizado += Number(sale.amount) || 0;
        else if (m.tipo === 'lucro') realizado += Number(sale.profit) || (Number(sale.amount) || 0) * 0.4;
        else if (m.tipo === 'vendas') realizado += 1;
      });
      // Só sobrescreve se encontrou vendas matchando — caso contrário,
      // preserva o realizado importado de fontes legadas (metaReal)
      if (matchedAny && realizado !== m.realizado) {
        m.realizado = realizado;
        m.last_reconciled_at = new Date().toISOString();
        if (m.alvo > 0 && realizado >= m.alvo && m.status === 'ativa') m.status = 'batida';
        metasUpdated++;
      }
    });

    if (metasUpdated > 0) writeJSON(modeKey('fly_metas_v1'), metas);
    return { metasUpdated };
  }

  /* ---------------------------------------------------------------
     RECONCILE ALL · pipeline completo
  --------------------------------------------------------------- */
  function reconcileAll() {
    const a = reconcileSellers();
    const b = reconcileInfluencers();
    const c = reconcileMetas();
    return { sellers: a, influencers: b, metas: c };
  }

  function dryRun() {
    return {
      sellers:    reconcileSellers({ dryRun: true }),
      influencers: reconcileInfluencers({ dryRun: true }),
    };
  }

  /* =====================================================================
     RECONCILE LEGACY · varre fly_7anos_data_v1 (estrutura antiga)
     e extrai clientes, vendedores, influencers, metas pros painéis novos
  ===================================================================== */

  function _ensureSellers(name, opts = {}) {
    const sellersKey = modeKey('fly_sellers_v1');
    const sellers = readJSON(sellersKey, []);
    const found = sellers.find(s => normalize(s.nome) === normalize(name));
    if (found) return { seller: found, created: false };
    const seller = {
      id: 'sel_legacy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      nome: name,
      cargo: opts.cargo || 'Vendedor',
      cidade: opts.cidade || '',
      email: opts.email || '',
      telefone: opts.telefone || '',
      nivel: 'pleno',
      status: 'ativo',
      comissao_percent: Number(opts.comissao_percent) || 5,
      meta_mes: 0,
      vendido_mes: 0, vendido_total: 0, vendas_count: 0, comissao_acumulada: 0,
      created_at: new Date().toISOString(),
      created_by: 'reconcile-legacy',
    };
    sellers.unshift(seller);
    writeJSON(sellersKey, sellers);
    return { seller, created: true };
  }

  function _ensureInfluencer(handleOrName, opts = {}) {
    const k = modeKey('fly_influencers_v1');
    const list = readJSON(k, []);
    const handle = String(handleOrName || '').trim();
    const found = list.find(i => normalize(i.handle).replace('@','') === normalize(handle).replace('@',''));
    if (found) return { influencer: found, created: false };
    const inf = {
      id: 'inf_legacy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      nome: opts.nome || handle,
      handle: handle.startsWith('@') ? handle : '@' + handle,
      plataforma: opts.plataforma || 'Instagram',
      seguidores: Number(opts.seguidores) || 0,
      tier: 'micro',
      categoria: opts.categoria || '',
      cidade: '',
      email: '',
      telefone: '',
      status: 'ativo',
      comissao_percent: Number(opts.comissao_percent) || 10,
      comissao_modelo: 'percent',
      comissao_fixa: 0,
      vendas_count: 0, vendido_total: 0, comissao_acumulada: 0, comissao_paga: 0,
      leads_gerados: 0,
      contrato_validade: null,
      observacoes: 'Importado de marketing.influencers (legacy)',
      created_at: new Date().toISOString(),
      created_by: 'reconcile-legacy',
    };
    list.unshift(inf);
    writeJSON(k, list);
    return { influencer: inf, created: true };
  }

  function _ensureCustomer(name, opts = {}) {
    if (!name) return { customer: null, created: false };
    const k = modeKey('fly_customers_v1');
    const list = readJSON(k, []);
    const found = list.find(c => normalize(c.name) === normalize(name) || normalize(c.nome) === normalize(name));
    if (found) return { customer: found, created: false };
    const c = {
      id: 'cli_legacy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      data_mode: getMode(),
      name: name,
      phone: opts.phone || opts.telefone || '',
      instagram: opts.instagram || '',
      email: opts.email || '',
      origin: opts.origin || opts.origem || '',
      stage: opts.stage || 'fechado',
      desire_dubai: !!opts.desire_dubai,
      score: 0,
      notes: 'Importado de produto.clientes (legacy)',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(c);
    writeJSON(k, list);
    return { customer: c, created: true };
  }

  function _ensureMeta(params) {
    const k = modeKey('fly_metas_v1');
    const list = readJSON(k, []);
    // dedup por (escopo + escopo_nome + tipo + periodo)
    const found = list.find(m =>
      m.escopo === params.escopo &&
      normalize(m.escopo_nome) === normalize(params.escopo_nome) &&
      m.tipo === params.tipo &&
      m.periodo === (params.periodo || 'mensal')
    );
    if (found) {
      // Atualiza apenas se alvo for maior (evita sobrescrever meta editada)
      if (params.alvo > (found.alvo || 0)) {
        found.alvo = params.alvo;
        if (params.realizado) found.realizado = Math.max(found.realizado || 0, params.realizado);
        found.updated_at = new Date().toISOString();
        writeJSON(k, list);
      }
      return { meta: found, created: false };
    }
    const meta = {
      id: 'meta_legacy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      nome: params.nome || `${params.tipo} ${params.periodo || 'mensal'} — ${params.escopo_nome || ''}`.trim(),
      escopo: params.escopo,
      escopo_id: params.escopo_id || null,
      escopo_nome: params.escopo_nome || null,
      tipo: params.tipo,
      periodo: params.periodo || 'mensal',
      data_inicio: params.data_inicio || (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); })(),
      data_fim: params.data_fim || (() => { const d = new Date(); d.setMonth(d.getMonth()+1, 0); return d.toISOString().slice(0,10); })(),
      alvo: Number(params.alvo) || 0,
      realizado: Number(params.realizado) || 0,
      unidade: params.unidade || (params.tipo === 'receita' || params.tipo === 'lucro' ? 'BRL' : 'count'),
      status: 'ativa',
      observacoes: 'Importada de metaReal (legacy)',
      created_at: new Date().toISOString(),
      created_by: 'reconcile-legacy',
    };
    list.unshift(meta);
    writeJSON(k, list);
    return { meta, created: true };
  }

  function _updateProductMetrics(productName, addRevenue, addSales) {
    if (!productName) return;
    const k = modeKey('fly_product_metrics_v1');
    const m = readJSON(k, {});
    if (!m[productName]) m[productName] = { sales: 0, revenue: 0 };
    if (addRevenue) m[productName].revenue = Math.max(m[productName].revenue || 0, addRevenue);
    if (addSales)   m[productName].sales   = Math.max(m[productName].sales   || 0, addSales);
    m[productName].updated_at = new Date().toISOString();
    writeJSON(k, m);
  }

  function _extractItemsFromLegacyData() {
    // Estrutura conhecida: fly_7anos_data_v1.{ECOSSISTEMA FLY}.{PRODUTOS,PROJETOS,MARKETING,...}.items[]
    const root = readJSON('fly_7anos_data_v1', null);
    if (!root) return [];
    const allItems = [];
    function recurse(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.items)) {
        node.items.forEach(it => allItems.push(it));
      }
      for (const k of Object.keys(node)) {
        if (k === 'items' || k === 'banner') continue;
        const v = node[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) recurse(v);
      }
    }
    recurse(root);
    return allItems;
  }

  function reconcileLegacyProducts(opts = {}) {
    const dryRun = !!opts.dryRun;
    const items = _extractItemsFromLegacyData();
    if (!items.length) return { products_scanned: 0, message: 'Sem dados em fly_7anos_data_v1.' };

    const report = {
      products_scanned: items.length,
      sellers_created: 0,
      influencers_created: 0,
      customers_created: 0,
      metas_created: 0,
      product_metrics_updated: 0,
      details: [],
    };

    items.forEach(item => {
      if (!item || !item.name) return;
      const productName = item.name;
      const det = { product: productName, actions: [] };

      // ── 1) DADOS DUBAI (formato pacotes completo) ──
      const dubai = item.dubai || item.dubai_demo || item.dubai_operational;
      if (dubai && typeof dubai === 'object') {
        // Clientes do produto
        if (Array.isArray(dubai.clientes)) {
          dubai.clientes.forEach(c => {
            if (!c || !c.nome) return;
            if (!dryRun) {
              const r = _ensureCustomer(c.nome, { telefone: c.telefone, instagram: c.instagram, email: c.email, origem: c.origem });
              if (r.created) { report.customers_created++; det.actions.push(`+ cliente: ${c.nome}`); }
            } else {
              det.actions.push(`(dry) cliente: ${c.nome}`);
            }
          });
        }
        // Equipe (vendedores)
        if (Array.isArray(dubai.equipe)) {
          dubai.equipe.forEach(e => {
            if (!e || !e.nome) return;
            if (!dryRun) {
              const r = _ensureSellers(e.nome, { cargo: e.cargo, cidade: e.cidade, comissao_percent: e.comissao });
              if (r.created) { report.sellers_created++; det.actions.push(`+ vendedor: ${e.nome}`); }
            } else {
              det.actions.push(`(dry) vendedor: ${e.nome}`);
            }
          });
        }
        // Influencers
        if (dubai.marketing && Array.isArray(dubai.marketing.influencers)) {
          dubai.marketing.influencers.forEach(inf => {
            if (!inf) return;
            const handle = inf.instagram || inf.handle || inf.nome;
            if (!handle) return;
            if (!dryRun) {
              const r = _ensureInfluencer(handle, { nome: inf.nome, plataforma: 'Instagram', seguidores: inf.seguidores, comissao_percent: inf.comissao });
              if (r.created) { report.influencers_created++; det.actions.push(`+ influencer: ${handle}`); }
            } else {
              det.actions.push(`(dry) influencer: ${handle}`);
            }
          });
        }
        // Metas (metaReal.receita / metaReal.clientes / metaReal.lucro)
        if (dubai.metaReal && typeof dubai.metaReal === 'object') {
          const mr = dubai.metaReal;
          [['receita', 'BRL'], ['lucro', 'BRL'], ['clientes', 'count']].forEach(([tipo, unidade]) => {
            const sub = mr[tipo];
            if (!sub) return;
            const meta = Number(sub.meta || sub.alvo || 0);
            const real = Number(sub.real || sub.realizado || 0);
            if (meta <= 0) return;
            if (!dryRun) {
              const r = _ensureMeta({ escopo: 'produto', escopo_nome: productName, tipo, periodo: 'anual', alvo: meta, realizado: real, unidade });
              if (r.created) { report.metas_created++; det.actions.push(`+ meta ${tipo} ${productName}: ${meta}`); }
            } else {
              det.actions.push(`(dry) meta ${tipo}: ${meta}`);
            }
          });
        }
      }

      // ── 2) DADOS FORMATO PADRÃO (financeiro/performance) ──
      // Atualiza product_metrics com faturamento + número de clientes
      const fat   = Number(item.financeiro?.faturamento) || 0;
      const cli   = Number(item.performance?.clientes)   || 0;
      const vendas = Number(item.performance?.vendas_mes) || 0;
      if (fat > 0 || vendas > 0) {
        if (!dryRun) {
          _updateProductMetrics(productName, fat, vendas);
          report.product_metrics_updated++;
          det.actions.push(`product_metrics: revenue ${fat}, sales ${vendas}`);
        } else {
          det.actions.push(`(dry) product_metrics: revenue ${fat}, sales ${vendas}`);
        }
      }
      // Cria meta anual de receita do produto baseada em faturamento (se houver)
      if (fat > 0) {
        if (!dryRun) {
          // Como meta anual preliminar, usa faturamento * 12 (estimativa)
          const r = _ensureMeta({ escopo: 'produto', escopo_nome: productName, tipo: 'receita', periodo: 'mensal', alvo: fat, realizado: 0, unidade: 'BRL' });
          if (r.created) { report.metas_created++; det.actions.push(`+ meta receita mensal ${productName}`); }
        }
      }
      // Subitens com responsável → cadastra como vendedor
      if (Array.isArray(item.subitens)) {
        item.subitens.forEach(sub => {
          if (sub.responsavel && sub.responsavel.length > 2) {
            if (!dryRun) {
              const r = _ensureSellers(sub.responsavel, { cargo: 'Responsável ' + (sub.name || productName) });
              if (r.created) { report.sellers_created++; det.actions.push(`+ vendedor (subitem): ${sub.responsavel}`); }
            } else {
              det.actions.push(`(dry) vendedor: ${sub.responsavel}`);
            }
          }
        });
      }

      if (det.actions.length) report.details.push(det);
    });

    return report;
  }

  function reconcileEverything(opts = {}) {
    const dry = !!opts.dryRun;
    const legacy = reconcileLegacyProducts({ dryRun: dry });
    if (dry) {
      const sellers     = reconcileSellers({ dryRun: true });
      const influencers = reconcileInfluencers({ dryRun: true });
      return { dryRun: true, legacy, sellers, influencers };
    }
    // Aplica legacy primeiro (cria sellers/influencers/customers)
    // Depois reconcilia vendas existentes pra atribuir + atualizar metas
    const sellers     = reconcileSellers();
    const influencers = reconcileInfluencers();
    const metas       = reconcileMetas();
    return { legacy, sellers, influencers, metas };
  }

  /* ---------------------------------------------------------------
     API
  --------------------------------------------------------------- */
  window.__flyReconcile = {
    reconcileSellers,
    reconcileInfluencers,
    reconcileMetas,
    reconcileAll,
    reconcileLegacyProducts,
    reconcileEverything,
    dryRun,
    findSellerForSale,
    findInfluencerForSale,
  };

  console.log('[FLY Reconcile] Online.');
})();
