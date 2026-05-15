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
        if (m.tipo === 'receita') realizado += Number(sale.amount) || 0;
        else if (m.tipo === 'lucro') realizado += Number(sale.profit) || (Number(sale.amount) || 0) * 0.4;
        else if (m.tipo === 'vendas') realizado += 1;
      });
      if (realizado !== m.realizado) {
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

  /* ---------------------------------------------------------------
     API
  --------------------------------------------------------------- */
  window.__flyReconcile = {
    reconcileSellers,
    reconcileInfluencers,
    reconcileMetas,
    reconcileAll,
    dryRun,
    findSellerForSale,
    findInfluencerForSale,
  };

  console.log('[FLY Reconcile] Online.');
})();
