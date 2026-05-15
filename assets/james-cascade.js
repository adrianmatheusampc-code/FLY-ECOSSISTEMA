/* =====================================================================
   JAMES CASCADE ENGINE
   Event bus central — cada evento dispara N efeitos colaterais em
   painéis correlacionados.

   PRINCÍPIO:
     "Quando um dado entra em qualquer lugar, ele REFLETE em todos
     os lugares relacionados."

   EVENTOS QUE ESCUTA:
     fly:employee-created   → cockpit headcount + cofre custo pessoal
     fly:employee-updated   → recalcula folha mensal no cockpit
     fly:employee-deleted   → decrementa headcount + remove movement
     fly:base-created       → cockpit bases_count + cofre capex + sugestão WAR
     fly:base-status-active → cofre custo operacional recorrente
     fly:base-deleted       → decrementa bases_count
     fly:sale-recorded      → 18 efeitos (clientes, produto, cockpit, vendedor,
                              influencer, WAR, CRM pipeline, cofre, tasks,
                              ranking, log, dashboard) [stub para Fase B]

   API:
     window.__flyCascade = {
       emit(event, payload),
       listen(event, fn),       // adiciona listener custom
       getHistory(limit),       // últimos eventos disparados
       getCockpit(),            // estado atual do cockpit estendido
       pulsePanel(panelId),     // dispara animação visual
     };

   EVENTOS EMITIDOS (downstream):
     fly:cockpit-update      → cockpit recebeu update
     fly:cofre-update        → cofre recebeu update
     fly:panel-pulse         → animação visual de painel
     fly:cascade-step        → cada etapa da cascata (timeline)
   ===================================================================== */
(function jamesCascadeBoot() {
  'use strict';

  /* ---------------------------------------------------------------
     UTILS
  --------------------------------------------------------------- */
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function uuid(prefix) {
    return (prefix || 'csc_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }
  function getMode() { return localStorage.getItem('fly_data_mode') || 'demo'; }
  function modeKey(base) { return `${base}_${getMode()}`; }
  function emitDom(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /* ---------------------------------------------------------------
     COCKPIT ESTENDIDO
     Schema completo: receita, despesas, vendas, headcount, folha,
     bases_count, capex acumulado, custos operacionais recorrentes.
  --------------------------------------------------------------- */
  function loadCockpit() {
    return readJSON(modeKey('fly_cockpit_metrics_v1'), {
      total_revenue: 0,
      total_expenses: 0,
      total_profit: 0,
      sales_count: 0,
      headcount: 0,
      monthly_payroll: 0,
      bases_count: 0,
      bases_capex_total: 0,
      bases_opex_monthly: 0,
      updated_at: null,
    });
  }

  function saveCockpit(c) {
    c.total_profit = (c.total_revenue || 0) - (c.total_expenses || 0);
    c.updated_at = new Date().toISOString();
    writeJSON(modeKey('fly_cockpit_metrics_v1'), c);
    emitDom('fly:cockpit-update', c);
    emitDom('fly:panel-pulse', { panel: 'cockpit' });
    emitDom('fly:data-update', { entity: 'cockpit' });
  }

  /* ---------------------------------------------------------------
     COFRE — registro de movements gerados por cascata
  --------------------------------------------------------------- */
  function addCofreMovement(payload) {
    const key = modeKey('fly_moves_v1');
    const arr = readJSON(key, []);
    const m = {
      id: uuid('move_'),
      movement_type: payload.type || 'expense',
      amount: Number(payload.amount) || 0,
      date: payload.date || new Date().toISOString().slice(0, 10),
      description: payload.description || '',
      category: payload.category || 'cascata',
      money_owner: payload.money_owner || 'fly',
      partner: payload.partner || null,
      status: 'confirmed',
      recurring: !!payload.recurring,
      source: 'cascade',
      source_event: payload.source_event || null,
      source_entity_id: payload.source_entity_id || null,
      created_at: new Date().toISOString(),
      created_by: 'james-cascade',
    };
    arr.unshift(m);
    if (arr.length > 500) arr.splice(500);
    writeJSON(key, arr);
    try { window.__flySync?.push?.('money_movements', m); } catch (e) {}
    emitDom('fly:cofre-update', { action: 'add_movement', data: m });
    emitDom('fly:panel-pulse', { panel: 'cofre' });
    emitDom('fly:data-update', { entity: 'cofre', action: 'add_movement', data: m });
    return m;
  }

  /* ---------------------------------------------------------------
     CASCATA · HISTÓRICO E TIMELINE
  --------------------------------------------------------------- */
  const _cascadeHistory = [];

  function logCascadeStep(step) {
    const entry = {
      id: uuid('step_'),
      timestamp: Date.now(),
      ...step,
    };
    _cascadeHistory.unshift(entry);
    if (_cascadeHistory.length > 200) _cascadeHistory.length = 200;
    emitDom('fly:cascade-step', entry);
  }

  /* =====================================================================
     LISTENERS · HIERARQUIA → outros painéis
  ===================================================================== */
  function onEmployeeCreated(employee) {
    if (!employee) return;
    const fullCost = (employee.salario || 0) + (employee.comissao || 0) + (employee.beneficios || 0);

    // 1) COCKPIT: incrementa headcount + soma na folha
    const c = loadCockpit();
    c.headcount = (c.headcount || 0) + 1;
    c.monthly_payroll = (c.monthly_payroll || 0) + fullCost;
    saveCockpit(c);
    logCascadeStep({
      event: 'fly:employee-created',
      panel: 'cockpit',
      action: 'increment',
      detail: `headcount +1 (${employee.nome}); folha +R$ ${fullCost.toLocaleString('pt-BR')}`,
    });

    // 2) COFRE: cria movement de custo de pessoal (recorrente mensal)
    if (fullCost > 0) {
      addCofreMovement({
        type: 'expense',
        amount: fullCost,
        description: `Folha mensal — ${employee.nome} (${employee.cargo})`,
        category: 'pessoal',
        recurring: true,
        source_event: 'fly:employee-created',
        source_entity_id: employee.id,
      });
      logCascadeStep({
        event: 'fly:employee-created',
        panel: 'cofre',
        action: 'add_movement',
        detail: `movement recorrente R$ ${fullCost.toLocaleString('pt-BR')}/mês`,
      });
    }

    // 3) JAMES LOG (audit)
    emitDom('fly:cascade-completed', {
      event: 'fly:employee-created',
      entity: employee,
      panels_updated: ['cockpit', 'cofre'],
    });
  }

  function onEmployeeUpdated({ before, after }) {
    if (!after) return;
    const beforeCost = before ? (before.salario || 0) + (before.comissao || 0) + (before.beneficios || 0) : 0;
    const afterCost  = (after.salario || 0) + (after.comissao || 0) + (after.beneficios || 0);
    const delta = afterCost - beforeCost;

    if (delta !== 0) {
      const c = loadCockpit();
      c.monthly_payroll = (c.monthly_payroll || 0) + delta;
      saveCockpit(c);
      logCascadeStep({
        event: 'fly:employee-updated',
        panel: 'cockpit',
        action: 'recompute_payroll',
        detail: `folha ${delta > 0 ? '+' : ''}R$ ${delta.toLocaleString('pt-BR')} (${after.nome})`,
      });
    }

    // Status afastado/demitido pode pausar/remover movement (futuro)
    if (before?.status !== after.status) {
      logCascadeStep({
        event: 'fly:employee-updated',
        panel: 'hierarchy',
        action: 'status_change',
        detail: `${after.nome}: ${before?.status || '?'} → ${after.status}`,
      });
    }
  }

  function onEmployeeDeleted(employee) {
    if (!employee) return;
    const fullCost = (employee.salario || 0) + (employee.comissao || 0) + (employee.beneficios || 0);
    const c = loadCockpit();
    c.headcount = Math.max(0, (c.headcount || 0) - 1);
    c.monthly_payroll = Math.max(0, (c.monthly_payroll || 0) - fullCost);
    saveCockpit(c);
    logCascadeStep({
      event: 'fly:employee-deleted',
      panel: 'cockpit',
      action: 'decrement',
      detail: `headcount -1 (${employee.nome}); folha -R$ ${fullCost.toLocaleString('pt-BR')}`,
    });
  }

  /* =====================================================================
     LISTENERS · BASES → outros painéis
  ===================================================================== */
  function onBaseCreated(base) {
    if (!base) return;

    // 1) COCKPIT: incrementa bases_count + soma capex
    const c = loadCockpit();
    c.bases_count = (c.bases_count || 0) + 1;
    c.bases_capex_total = (c.bases_capex_total || 0) + (Number(base.custo_implantacao) || 0);
    saveCockpit(c);
    logCascadeStep({
      event: 'fly:base-created',
      panel: 'cockpit',
      action: 'increment',
      detail: `bases +1 (${base.nome}); capex +R$ ${(base.custo_implantacao || 0).toLocaleString('pt-BR')}`,
    });

    // 2) COFRE: se houver custo de implantação, cria movement de despesa
    if (base.custo_implantacao && base.custo_implantacao > 0) {
      addCofreMovement({
        type: 'expense',
        amount: base.custo_implantacao,
        description: `Implantação — ${base.nome} (${base.cidade || base.pais})`,
        category: 'capex_bases',
        source_event: 'fly:base-created',
        source_entity_id: base.id,
      });
      logCascadeStep({
        event: 'fly:base-created',
        panel: 'cofre',
        action: 'add_movement',
        detail: `capex R$ ${base.custo_implantacao.toLocaleString('pt-BR')}`,
      });
    }

    // 3) WAR: sugerir território no mesmo país (não cria automaticamente — só sugere)
    try {
      const wars = readJSON(modeKey('fly_war_territories_v1'), []) || [];
      const existsTerritory = wars.some(t =>
        (t.payload?.pais || t.pais || '').toLowerCase() === (base.pais || '').toLowerCase()
      );
      if (!existsTerritory && base.pais) {
        emitDom('fly:cascade-suggestion', {
          source: 'base-created',
          panel: 'war',
          message: `Sugiro criar território WAR em ${base.pais} (base ${base.nome} foi criada lá)`,
          payload: { pais: base.pais, baseId: base.id, baseName: base.nome },
        });
        logCascadeStep({
          event: 'fly:base-created',
          panel: 'war',
          action: 'suggest_territory',
          detail: `Sugestão: criar território em ${base.pais}`,
        });
      }
    } catch (e) {}

    emitDom('fly:cascade-completed', {
      event: 'fly:base-created',
      entity: base,
      panels_updated: ['cockpit', 'cofre', 'war'],
    });
  }

  function onBaseStatusActive(base) {
    if (!base) return;
    if (base.custo_operacional && base.custo_operacional > 0) {
      addCofreMovement({
        type: 'expense',
        amount: base.custo_operacional,
        description: `Operacional mensal — ${base.nome}`,
        category: 'opex_bases',
        recurring: true,
        source_event: 'fly:base-status-active',
        source_entity_id: base.id,
      });
      const c = loadCockpit();
      c.bases_opex_monthly = (c.bases_opex_monthly || 0) + base.custo_operacional;
      saveCockpit(c);
      logCascadeStep({
        event: 'fly:base-status-active',
        panel: 'cofre',
        action: 'add_recurring',
        detail: `opex recorrente R$ ${base.custo_operacional.toLocaleString('pt-BR')}/mês — ${base.nome}`,
      });
    }
  }

  function onBaseDeleted(base) {
    if (!base) return;
    const c = loadCockpit();
    c.bases_count = Math.max(0, (c.bases_count || 0) - 1);
    c.bases_capex_total = Math.max(0, (c.bases_capex_total || 0) - (base.custo_implantacao || 0));
    if (base.status === 'ativa') {
      c.bases_opex_monthly = Math.max(0, (c.bases_opex_monthly || 0) - (base.custo_operacional || 0));
    }
    saveCockpit(c);
    logCascadeStep({
      event: 'fly:base-deleted',
      panel: 'cockpit',
      action: 'decrement',
      detail: `bases -1 (${base.nome})`,
    });
  }

  /* =====================================================================
     LISTENERS · VENDAS → 18 efeitos (Fase B — stub funcional)
     Quando Vendedores/Influencers/Metas existirem, completar.
  ===================================================================== */
  function onSaleRecorded(sale) {
    if (!sale) return;
    const value = Number(sale.amount) || 0;
    const profit = Number(sale.profit) || (value * 0.4);

    // 1) COCKPIT
    const c = loadCockpit();
    c.total_revenue += value;
    c.sales_count += 1;
    saveCockpit(c);
    logCascadeStep({
      event: 'fly:sale-recorded',
      panel: 'cockpit',
      action: 'increment',
      detail: `receita +R$ ${value.toLocaleString('pt-BR')}; vendas +1`,
    });

    // 2) PRODUCT METRICS
    if (sale.product) {
      const pmKey = modeKey('fly_product_metrics_v1');
      const pm = readJSON(pmKey, {});
      if (!pm[sale.product]) pm[sale.product] = { sales: 0, revenue: 0 };
      pm[sale.product].sales += 1;
      pm[sale.product].revenue += value;
      pm[sale.product].updated_at = new Date().toISOString();
      writeJSON(pmKey, pm);
      emitDom('fly:panel-pulse', { panel: 'product:' + sale.product });
      logCascadeStep({
        event: 'fly:sale-recorded',
        panel: 'product',
        action: 'increment',
        detail: `${sale.product}: +1 venda, +R$ ${value.toLocaleString('pt-BR')}`,
      });
    }

    // 3) COFRE: receita
    addCofreMovement({
      type: 'income',
      amount: value,
      description: `Venda — ${sale.product || 'Pacote'} para ${sale.name || 'cliente'}`,
      category: 'venda',
      source_event: 'fly:sale-recorded',
      source_entity_id: sale.id,
    });
    logCascadeStep({
      event: 'fly:sale-recorded',
      panel: 'cofre',
      action: 'add_movement',
      detail: `receita R$ ${value.toLocaleString('pt-BR')}`,
    });

    // 4) VENDEDOR (stub — quando módulo existir)
    if (sale.seller) {
      emitDom('fly:cascade-suggestion', {
        source: 'sale-recorded',
        panel: 'sellers',
        message: `Vendedor ${sale.seller} ainda não tem cadastro. Quer criar?`,
        payload: { name: sale.seller },
      });
    }

    // 5) INFLUENCER (stub — quando módulo existir)
    if (/^influencer:/i.test(sale.origin || '')) {
      const handle = sale.origin.replace(/^influencer:/i, '').trim();
      emitDom('fly:cascade-suggestion', {
        source: 'sale-recorded',
        panel: 'influencers',
        message: `Influencer ${handle} gerou venda. Cadastrar para gerar comissão?`,
        payload: { handle, sale_id: sale.id, value },
      });
    }

    emitDom('fly:cascade-completed', {
      event: 'fly:sale-recorded',
      entity: sale,
      panels_updated: ['cockpit', 'product_metrics', 'cofre'],
    });
  }

  /* =====================================================================
     EVENT BUS — registra todos os listeners
  ===================================================================== */
  const LISTENERS = {
    'fly:employee-created':    [onEmployeeCreated],
    'fly:employee-updated':    [onEmployeeUpdated],
    'fly:employee-deleted':    [onEmployeeDeleted],
    'fly:base-created':        [onBaseCreated],
    'fly:base-status-active':  [onBaseStatusActive],
    'fly:base-deleted':        [onBaseDeleted],
    'fly:sale-recorded':       [onSaleRecorded],
  };

  function emit(eventName, payload) {
    const fns = LISTENERS[eventName] || [];
    for (const fn of fns) {
      try { fn(payload); }
      catch (e) { console.error('[Cascade] erro em', eventName, e); }
    }
    // Re-emite pra qualquer listener externo (window.addEventListener)
    emitDom(eventName, payload);
  }

  function listen(eventName, fn) {
    if (!LISTENERS[eventName]) LISTENERS[eventName] = [];
    LISTENERS[eventName].push(fn);
    return () => {
      const i = LISTENERS[eventName].indexOf(fn);
      if (i >= 0) LISTENERS[eventName].splice(i, 1);
    };
  }

  /* =====================================================================
     ANIMAÇÃO VISUAL · pulse-gold
     Aplica classe .fly-cascade-pulse no card do painel afetado
  ===================================================================== */
  function pulsePanel(panelId, scope) {
    const targets = [];
    // Tenta achar o card no DOM por ID conhecido
    const map = {
      cockpit: ['#dashboardSupremoTrigger', '.cockpit-card', '[data-section="cockpit"]'],
      cofre:   ['#cofreTriggerBtn', '.cofre-trigger', '[data-section="cofre"]'],
      hierarchy: ['.hier-module', '.hier-hero', '[data-section="hierarquia"]'],
      bases:   ['.bases-module', '.bases-hero', '[data-section="bases"]'],
      war:     ['.timeline-planet', '[data-id="fly"]'],
    };
    const selectors = map[panelId] || [`[data-panel="${panelId}"]`];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => targets.push(el));
    }
    targets.forEach(el => {
      el.classList.add('fly-cascade-pulse');
      setTimeout(() => el.classList.remove('fly-cascade-pulse'), 1400);
    });
  }

  // Listener global pra animar tudo que receber pulse
  window.addEventListener('fly:panel-pulse', (e) => {
    pulsePanel(e?.detail?.panel);
  });

  /* =====================================================================
     INJETAR CSS DO PULSE (uma vez)
  ===================================================================== */
  function injectPulseCSS() {
    if (document.getElementById('fly-cascade-styles')) return;
    const style = document.createElement('style');
    style.id = 'fly-cascade-styles';
    style.textContent = `
      @keyframes flyCascadePulse {
        0%   { box-shadow: 0 0 0 0 rgba(245,184,66,0.55), 0 0 22px 0 rgba(245,184,66,0.4); }
        50%  { box-shadow: 0 0 0 8px rgba(245,184,66,0.18), 0 0 36px 6px rgba(245,184,66,0.7); }
        100% { box-shadow: 0 0 0 0 rgba(245,184,66,0), 0 0 0 0 rgba(245,184,66,0); }
      }
      .fly-cascade-pulse {
        animation: flyCascadePulse 1.4s ease-out;
        position: relative;
        z-index: 50;
      }
    `;
    document.head.appendChild(style);
  }
  if (document.head) injectPulseCSS();
  else document.addEventListener('DOMContentLoaded', injectPulseCSS);

  /* =====================================================================
     API PÚBLICA
  ===================================================================== */
  window.__flyCascade = {
    emit,
    listen,
    pulsePanel,
    getCockpit: loadCockpit,
    getHistory: (limit) => _cascadeHistory.slice(0, limit || 50),
    addCofreMovement, // exposed for advanced use
    // Expor handlers para testar isoladamente
    handlers: {
      onEmployeeCreated, onEmployeeUpdated, onEmployeeDeleted,
      onBaseCreated, onBaseStatusActive, onBaseDeleted,
      onSaleRecorded,
    },
  };

  console.log('[FLY Cascade] Engine online. Listeners registrados:',
    Object.keys(LISTENERS).join(', '));
})();
