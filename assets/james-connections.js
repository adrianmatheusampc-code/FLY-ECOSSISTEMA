/* =====================================================================
   JAMES CONNECTIONS · REGISTRY DECLARATIVO DE CONEXÕES ENTRE PAINÉIS

   Sistema central que descreve QUEM AFETA QUEM no ecossistema FLY.
   Outras partes do app (cascade, modal "Editar Item", James suggestions)
   leem deste registry — assim, ao adicionar painel novo, basta declarar
   as conexões aqui e o sistema todo entende.

   ESTRUTURA:
     CONNECTIONS = [
       { from, fromField, to, toField, kind, hint }
     ]

     kind:
       'attribution'    → resolve entidade (ex: sale.seller_name → seller.id)
       'metric_feed'    → contribui pra métrica acumulada (ex: sale.amount → cockpit.revenue)
       'recurring_cost' → cria movement recorrente no cofre
       'capex'          → custo de implantação único
       'commission'     → calculada por % ou modelo
       'meta_progress'  → contribui pro realizado de uma meta (filtra por escopo)
       'task_trigger'   → cria tarefas automaticamente

   API:
     window.__flyConnections = {
       all                    → array de todas as connections
       getOutgoing(panelId)   → connections que SAEM deste painel
       getIncoming(panelId)   → connections que CHEGAM neste painel
       describeForFormat(fmt) → resumo legível pro modal
       renderDiagramHTML(fmt) → HTML do diagrama "conectado com"
       suggestPanelsFor(fmt)  → painéis que faz sentido criar junto
     };
   ===================================================================== */
(function jamesConnectionsBoot() {
  'use strict';

  /* ---------------------------------------------------------------
     METADADOS DE PAINÉIS · usado pra labels e ícones no diagrama
  --------------------------------------------------------------- */
  const PANEL_META = {
    cockpit:     { name: 'Cockpit',       icon: '🎛️',  color: '#ffd070' },
    cofre:       { name: 'Cofre AEY',     icon: '💰',  color: '#6dffb0' },
    war:         { name: 'Plano WAR',     icon: '🌐',  color: '#ff9b3a' },
    flycup:      { name: 'Fly Cup',       icon: '🏐',  color: '#ff6464' },
    crm:         { name: 'CRM',           icon: '📇',  color: '#ffaa44' },
    customers:   { name: 'Clientes',      icon: '👤',  color: '#ffaa44' },
    sales:       { name: 'Vendas',        icon: '💎',  color: '#f5b842' },
    products:    { name: 'Produtos',      icon: '📦',  color: '#f5b842' },
    hierarchy:   { name: 'Hierarquia',    icon: '👥',  color: '#a88cff' },
    bases:       { name: 'Bases',         icon: '📍',  color: '#40b4ff' },
    sellers:     { name: 'Vendedores',    icon: '🏆',  color: '#ffc850' },
    influencers: { name: 'Influencers',   icon: '⭐',  color: '#ff50b4' },
    metas:       { name: 'Metas',         icon: '🎯',  color: '#6dffb0' },
    tasks:       { name: 'Tarefas',       icon: '📝',  color: '#aaaaaa' },
    projects:    { name: 'Projetos',      icon: '🚀',  color: '#ff8844' },
    marketing:   { name: 'Marketing',     icon: '📣',  color: '#ff44aa' },
  };

  /* ---------------------------------------------------------------
     CONNECTIONS · declarativo
  --------------------------------------------------------------- */
  const CONNECTIONS = [
    /* ── VENDA dispara cascata em massa ── */
    { from: 'sales', fromField: 'amount',         to: 'cockpit',     toField: 'total_revenue',     kind: 'metric_feed',
      hint: 'Cada venda soma na receita total do Cockpit' },
    { from: 'sales', fromField: '*',              to: 'cockpit',     toField: 'sales_count',       kind: 'metric_feed',
      hint: 'Cada venda incrementa o contador de vendas' },
    { from: 'sales', fromField: 'product',        to: 'products',    toField: 'sales+revenue',     kind: 'metric_feed',
      hint: 'Atualiza métricas do produto vendido' },
    { from: 'sales', fromField: 'amount',         to: 'cofre',       toField: 'income_movement',   kind: 'metric_feed',
      hint: 'Receita entra como movement no Cofre' },
    { from: 'sales', fromField: 'seller',         to: 'sellers',     toField: 'vendido+comissao',  kind: 'attribution',
      hint: 'Atribui ao vendedor (busca por nome) e calcula comissão %' },
    { from: 'sales', fromField: 'origin',         to: 'influencers', toField: 'vendas+comissao',   kind: 'attribution',
      hint: 'Detecta @influencer na origem e calcula comissão' },
    { from: 'sales', fromField: 'amount',         to: 'metas',       toField: 'realizado',         kind: 'meta_progress',
      hint: 'Atualiza progresso de TODAS as metas que matcham (empresa, produto, vendedor, influencer)' },
    { from: 'sales', fromField: '*',              to: 'tasks',       toField: 'create',            kind: 'task_trigger',
      hint: 'Cria 3 tarefas pós-venda: contrato (1d), documentos (3d), onboarding (7d)' },
    { from: 'sellers',     fromField: 'comissao_percent', to: 'cofre', toField: 'commission_owed', kind: 'commission',
      hint: 'Comissão devida ao vendedor entra como expense_movement' },
    { from: 'influencers', fromField: 'comissao_percent', to: 'cofre', toField: 'commission_owed', kind: 'commission',
      hint: 'Comissão devida ao influencer entra como expense_movement' },

    /* ── HIERARQUIA dispara cockpit + cofre ── */
    { from: 'hierarchy', fromField: '*',           to: 'cockpit', toField: 'headcount',        kind: 'metric_feed',
      hint: 'Cada funcionário incrementa o headcount' },
    { from: 'hierarchy', fromField: 'salario+comissao+beneficios', to: 'cockpit', toField: 'monthly_payroll', kind: 'metric_feed',
      hint: 'Soma na folha mensal' },
    { from: 'hierarchy', fromField: 'salario+comissao+beneficios', to: 'cofre',   toField: 'recurring_cost',  kind: 'recurring_cost',
      hint: 'Cria movement recorrente mensal de pessoal' },

    /* ── BASES dispara cockpit + cofre + war ── */
    { from: 'bases', fromField: '*',                  to: 'cockpit', toField: 'bases_count',         kind: 'metric_feed',
      hint: 'Cada base incrementa o contador' },
    { from: 'bases', fromField: 'custo_implantacao',  to: 'cockpit', toField: 'bases_capex_total',   kind: 'metric_feed',
      hint: 'Soma no capex acumulado' },
    { from: 'bases', fromField: 'custo_implantacao',  to: 'cofre',   toField: 'capex_movement',      kind: 'capex',
      hint: 'Custo de implantação entra como expense' },
    { from: 'bases', fromField: 'custo_operacional',  to: 'cofre',   toField: 'recurring_opex',      kind: 'recurring_cost',
      hint: 'Quando base vira ativa, cria movement recorrente operacional' },
    { from: 'bases', fromField: 'pais',               to: 'war',     toField: 'territory_suggest',   kind: 'attribution',
      hint: 'Sugere criar território WAR no mesmo país' },

    /* ── METAS recebe de várias fontes ── */
    { from: 'metas', fromField: '*', to: 'cockpit', toField: 'metas_count', kind: 'metric_feed',
      hint: 'Cada meta criada incrementa contador' },
    { from: 'metas', fromField: 'status:batida', to: 'cockpit', toField: 'metas_batidas', kind: 'metric_feed',
      hint: 'Quando atinge 100%, status vira "batida"' },

    /* ── SELLERS / INFLUENCERS metric counts ── */
    { from: 'sellers',     fromField: '*', to: 'cockpit', toField: 'sellers_count',     kind: 'metric_feed',
      hint: 'Cada vendedor cadastrado incrementa contador' },
    { from: 'influencers', fromField: '*', to: 'cockpit', toField: 'influencers_count', kind: 'metric_feed',
      hint: 'Cada influencer cadastrado incrementa contador' },
  ];

  /* ---------------------------------------------------------------
     QUERIES no registry
  --------------------------------------------------------------- */
  function getOutgoing(panelId) {
    return CONNECTIONS.filter(c => c.from === panelId);
  }
  function getIncoming(panelId) {
    return CONNECTIONS.filter(c => c.to === panelId);
  }
  function describeForFormat(format) {
    const out = getOutgoing(format);
    const inc = getIncoming(format);
    if (!out.length && !inc.length) return null;
    return {
      format,
      meta: PANEL_META[format] || { name: format, icon: '📋', color: '#aaa' },
      outgoing: out,
      incoming: inc,
    };
  }

  function suggestPanelsFor(format) {
    // Painéis que fazem sentido criar JUNTO com este
    const suggestions = {
      sales:       ['sellers', 'influencers', 'metas', 'customers'],
      sellers:     ['metas', 'sales'],
      influencers: ['metas', 'sales'],
      metas:       ['sales', 'sellers', 'influencers'],
      hierarchy:   ['cofre'],
      bases:       ['war', 'cofre'],
    };
    return (suggestions[format] || []).map(id => ({
      id,
      meta: PANEL_META[id] || { name: id, icon: '📋', color: '#aaa' },
    }));
  }

  /* ---------------------------------------------------------------
     RENDER · diagrama HTML do "conectado com" pro modal
  --------------------------------------------------------------- */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderDiagramHTML(format) {
    const desc = describeForFormat(format);
    if (!desc) return '';
    const meta = desc.meta;
    const outgoing = desc.outgoing;
    const incoming = desc.incoming;

    const renderArrow = (c, direction) => {
      const target = direction === 'out' ? c.to : c.from;
      const m = PANEL_META[target] || { name: target, icon: '📋', color: '#aaa' };
      const kindLabel = ({
        attribution:    'atribuição',
        metric_feed:    'métrica',
        recurring_cost: 'custo recorrente',
        capex:          'capex',
        commission:     'comissão',
        meta_progress:  'progresso de meta',
        task_trigger:   'tarefas auto',
      })[c.kind] || c.kind;
      return `
        <div class="conn-arrow conn-arrow--${direction}">
          <span class="conn-icon" style="color:${m.color}">${m.icon}</span>
          <span class="conn-name">${escHtml(m.name)}</span>
          <span class="conn-kind">${escHtml(kindLabel)}</span>
          <span class="conn-hint" title="${escHtml(c.hint)}">${escHtml(c.hint || '')}</span>
        </div>`;
    };

    const sugg = suggestPanelsFor(format);
    return `
      <div class="conn-diagram">
        <div class="conn-header">
          <span class="conn-icon-big" style="color:${meta.color}">${meta.icon}</span>
          <div>
            <div class="conn-title">${escHtml(meta.name)}</div>
            <div class="conn-sub">${incoming.length} entradas · ${outgoing.length} saídas</div>
          </div>
        </div>

        ${incoming.length ? `
          <div class="conn-section">
            <div class="conn-section-label">↓ RECEBE DADOS DE</div>
            ${incoming.map(c => renderArrow(c, 'in')).join('')}
          </div>` : ''}

        ${outgoing.length ? `
          <div class="conn-section">
            <div class="conn-section-label">↑ ATUALIZA AUTOMATICAMENTE</div>
            ${outgoing.map(c => renderArrow(c, 'out')).join('')}
          </div>` : ''}

        ${sugg.length ? `
          <div class="conn-section conn-section--suggest">
            <div class="conn-section-label">💡 PAINÉIS QUE COMBINAM</div>
            <div class="conn-suggestions">
              ${sugg.map(s => `<span class="conn-tag" style="border-color:${s.meta.color}40; color:${s.meta.color}">${s.meta.icon} ${escHtml(s.meta.name)}</span>`).join('')}
            </div>
          </div>` : ''}
      </div>
    `;
  }

  /* ---------------------------------------------------------------
     INJETA CSS DO DIAGRAMA (uma vez)
  --------------------------------------------------------------- */
  function injectCSS() {
    if (document.getElementById('fly-connections-styles')) return;
    const s = document.createElement('style');
    s.id = 'fly-connections-styles';
    s.textContent = `
      .conn-diagram {
        margin-top: 12px;
        padding: 14px;
        background: rgba(245,184,66,0.04);
        border: 1px solid rgba(245,184,66,0.2);
        border-radius: 10px;
        font-size: 11px;
      }
      .conn-header {
        display: flex; align-items: center; gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(245,184,66,0.15);
      }
      .conn-icon-big { font-size: 24px; }
      .conn-title { font-weight: 700; color: #fff; font-size: 13px; }
      .conn-sub { color: rgba(255,255,255,0.5); font-size: 10px; margin-top: 2px; }
      .conn-section { margin-bottom: 10px; }
      .conn-section:last-child { margin-bottom: 0; }
      .conn-section-label {
        font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
        color: rgba(245,184,66,0.65); margin-bottom: 6px;
      }
      .conn-arrow {
        display: grid;
        grid-template-columns: 22px 110px 90px 1fr;
        gap: 8px; align-items: center;
        padding: 5px 8px; border-radius: 5px;
        background: rgba(0,0,0,0.2);
        margin-bottom: 3px;
      }
      .conn-arrow:hover { background: rgba(245,184,66,0.06); }
      .conn-icon { font-size: 14px; text-align: center; }
      .conn-name { font-weight: 600; color: #fff; }
      .conn-kind {
        font-size: 9px; padding: 2px 6px; border-radius: 3px;
        background: rgba(245,184,66,0.12); color: rgba(245,184,66,0.85);
        text-align: center; text-transform: uppercase; letter-spacing: 0.5px;
      }
      .conn-hint { font-size: 10px; color: rgba(255,255,255,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .conn-section--suggest {
        margin-top: 14px; padding-top: 10px;
        border-top: 1px dashed rgba(245,184,66,0.18);
      }
      .conn-suggestions { display: flex; flex-wrap: wrap; gap: 4px; }
      .conn-tag {
        padding: 3px 9px; border-radius: 12px;
        background: rgba(0,0,0,0.3); border: 1px solid; font-size: 10px;
      }
    `;
    document.head.appendChild(s);
  }
  if (document.head) injectCSS();
  else document.addEventListener('DOMContentLoaded', injectCSS);

  /* ---------------------------------------------------------------
     API PÚBLICA
  --------------------------------------------------------------- */
  window.__flyConnections = {
    all: CONNECTIONS,
    panelMeta: PANEL_META,
    getOutgoing,
    getIncoming,
    describeForFormat,
    renderDiagramHTML,
    suggestPanelsFor,
    register(connection) {
      CONNECTIONS.push(connection);
      console.log('[FLY Connections] connection registrada:', connection);
    },
  };

  console.log('[FLY Connections] Registry online:', CONNECTIONS.length, 'connections,', Object.keys(PANEL_META).length, 'painéis.');
})();
