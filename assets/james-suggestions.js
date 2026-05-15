/* =====================================================================
   JAMES SUGGESTIONS · ENGINE INTELIGENTE DE RECOMENDAÇÕES

   Analisa o estado atual do ecossistema e gera sugestões priorizadas
   com ações executáveis. Roda quando:
     - O painel do James é aberto
     - Uma cascata de venda termina
     - O usuário pergunta "como tá indo"
     - A cada 5min em background

   Tipos de sugestão:
     'meta_close'     → meta perto de bater (>=70% e dias restantes <=15)
     'meta_at_risk'   → meta em risco (<50% e dias restantes <=10)
     'top_product'    → produto que mais converte
     'inactive_seller'→ vendedor sem venda há X dias
     'top_influencer' → influencer top performer (incentivar)
     'pending_commission' → comissão a pagar acumulada
     'cash_alert'     → caixa baixa
     'reconcile'      → vendas não atribuídas a vendedores
     'task_overdue'   → tarefas atrasadas

   API:
     window.__flySuggestions = {
       analyze() → array de sugestões priorizadas
       render(targetEl) → renderiza UI no elemento
       refresh() → recalcula e re-renderiza
     };
   ===================================================================== */
(function flySuggestionsBoot() {
  'use strict';

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }
  function getMode() { return localStorage.getItem('fly_data_mode') || 'demo'; }
  function modeKey(base) { return `${base}_${getMode()}`; }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function brl(n) { return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR'); }
  function daysBetween(a, b) {
    return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
  }

  /* ---------------------------------------------------------------
     ANALYZERS · cada um gera 0..N sugestões
  --------------------------------------------------------------- */

  // 1. Metas perto de bater ou em risco
  function analyzeMetas() {
    const metas = readJSON(modeKey('fly_metas_v1'), []);
    const out = [];
    metas.filter(m => m.status === 'ativa' && m.alvo > 0).forEach(m => {
      const pct = (m.realizado || 0) / m.alvo;
      const dias = m.data_fim ? Math.max(0, daysBetween(new Date(), m.data_fim)) : 999;
      const falta = Math.max(0, m.alvo - (m.realizado || 0));
      if (pct >= 0.7 && pct < 1 && dias <= 30) {
        out.push({
          id: 'meta_close_' + m.id,
          priority: 90 + Math.floor(pct * 10),
          icon: '🎯',
          color: '#6dffb0',
          title: `Meta "${m.nome}" a ${Math.round(pct * 100)}%`,
          message: `Faltam ${m.unidade === 'BRL' ? brl(falta) : falta + ' und'} em ${dias}d. ${
            m.escopo === 'produto' && m.escopo_nome ? `Recomendo focar em ${m.escopo_nome}.` :
            m.escopo === 'vendedor' && m.escopo_nome ? `Pressionar ${m.escopo_nome}.` :
            'Distribuir o esforço entre os top produtos.'
          }`,
          actions: [
            m.escopo === 'produto' && m.escopo_nome ? { label: `Abrir ${m.escopo_nome}`, cmd: `abre ${m.escopo_nome}` } : null,
            { label: 'Ver Metas', cmd: 'abre metas' },
            { label: 'Top produto', cmd: 'qual produto vendeu mais' },
          ].filter(Boolean),
        });
      } else if (pct < 0.5 && dias <= 10 && dias > 0) {
        out.push({
          id: 'meta_risk_' + m.id,
          priority: 95,
          icon: '⚠️',
          color: '#ff6464',
          title: `Meta "${m.nome}" em risco`,
          message: `Apenas ${Math.round(pct * 100)}% atingido com ${dias}d restantes. Falta ${m.unidade === 'BRL' ? brl(falta) : falta}.`,
          actions: [
            { label: 'Ver Metas', cmd: 'abre metas' },
            { label: 'Plano de ação', cmd: 'gera resumo da semana' },
          ],
        });
      } else if (pct >= 1) {
        out.push({
          id: 'meta_done_' + m.id,
          priority: 75,
          icon: '🥇',
          color: '#ffd070',
          title: `Meta "${m.nome}" BATIDA!`,
          message: `Realizado ${m.unidade === 'BRL' ? brl(m.realizado) : m.realizado}. Considere arquivar e criar a próxima.`,
          actions: [{ label: 'Criar próxima meta', cmd: 'abre metas' }],
        });
      }
    });
    return out;
  }

  // 2. Vendas não atribuídas a vendedores
  function analyzeReconcile() {
    const sales = readJSON(modeKey('fly_sales_v1'), []);
    const sellers = readJSON(modeKey('fly_sellers_v1'), []);
    if (!sales.length) return [];
    const sellerNames = new Set(sellers.map(s => (s.nome || '').toLowerCase()));
    const orphan = sales.filter(s => {
      if (!s.seller) return false; // nem tinha vendedor
      const sl = String(s.seller).toLowerCase();
      return !Array.from(sellerNames).some(n => n.includes(sl) || sl.includes(n));
    });
    if (orphan.length === 0) return [];
    return [{
      id: 'reconcile_sellers',
      priority: 70,
      icon: '🔄',
      color: '#40b4ff',
      title: `${orphan.length} venda(s) não atribuída(s) a vendedor`,
      message: `Existem vendas com vendedor mencionado mas sem cadastro. Reconcilia pra calcular comissões e ranking.`,
      actions: [
        { label: 'Reconciliar agora', action: 'reconcile_sellers' },
        { label: 'Ver Vendedores', cmd: 'abre vendedores' },
      ],
    }];
  }

  // 3. Comissões pendentes
  function analyzeCommissions() {
    const sellers = readJSON(modeKey('fly_sellers_v1'), []);
    const infs = readJSON(modeKey('fly_influencers_v1'), []);
    const sellerCommission = sellers.reduce((s, x) => s + (x.comissao_acumulada || 0), 0);
    const infCommission = infs.reduce((s, x) => s + ((x.comissao_acumulada || 0) - (x.comissao_paga || 0)), 0);
    const total = sellerCommission + infCommission;
    if (total < 1000) return [];
    return [{
      id: 'pending_commission',
      priority: 60,
      icon: '💸',
      color: '#ffaa44',
      title: `${brl(total)} em comissões a pagar`,
      message: `Vendedores: ${brl(sellerCommission)} · Influencers: ${brl(infCommission)}.`,
      actions: [
        { label: 'Ver Vendedores', cmd: 'abre vendedores' },
        { label: 'Ver Influencers', cmd: 'abre influencers' },
      ],
    }];
  }

  // 4. Vendedor inativo (sem venda no mês)
  function analyzeInactiveSellers() {
    const sellers = readJSON(modeKey('fly_sellers_v1'), []);
    const inativos = sellers.filter(s => s.status === 'ativo' && (s.vendido_mes || 0) === 0);
    if (inativos.length === 0) return [];
    return [{
      id: 'inactive_sellers',
      priority: 55,
      icon: '😴',
      color: '#ff9b3a',
      title: `${inativos.length} vendedor(es) sem venda no mês`,
      message: `Estão ativos mas sem produção: ${inativos.slice(0, 3).map(s => s.nome).join(', ')}${inativos.length > 3 ? '...' : ''}.`,
      actions: [{ label: 'Ver Vendedores', cmd: 'abre vendedores' }],
    }];
  }

  // 5. Top performer (incentivar / replicar)
  function analyzeTopPerformer() {
    const sellers = readJSON(modeKey('fly_sellers_v1'), []);
    if (!sellers.length) return [];
    const top = [...sellers].sort((a, b) => (b.vendido_mes || 0) - (a.vendido_mes || 0))[0];
    if (!top || !top.vendido_mes) return [];
    return [{
      id: 'top_seller',
      priority: 40,
      icon: '🏆',
      color: '#ffd070',
      title: `${top.nome} é o top vendedor do mês`,
      message: `${brl(top.vendido_mes)} em ${top.vendas_count || 0} venda(s). Comissão acumulada: ${brl(top.comissao_acumulada)}.`,
      actions: [{ label: 'Ranking completo', cmd: 'abre vendedores' }],
    }];
  }

  // 6. Caixa baixa
  function analyzeCashAlert() {
    const moves = readJSON(modeKey('fly_moves_v1'), []);
    if (!moves.length) return [];
    const balance = moves.reduce((s, m) => {
      if (m.movement_type === 'income') return s + (m.amount || 0);
      if (m.movement_type === 'expense') return s - (m.amount || 0);
      return s;
    }, 0);
    if (balance >= 50000) return [];
    if (balance < 0) {
      return [{
        id: 'cash_negative',
        priority: 100,
        icon: '🚨',
        color: '#ff4444',
        title: 'CAIXA NEGATIVO',
        message: `Saldo ${brl(balance)}. Ação urgente recomendada.`,
        actions: [{ label: 'Abrir Cofre', cmd: 'abre cofre' }],
      }];
    }
    return [{
      id: 'cash_low',
      priority: 80,
      icon: '⚠️',
      color: '#ff9b3a',
      title: 'Caixa baixa',
      message: `Saldo ${brl(balance)}. Considere acelerar cobranças ou ajustar gastos.`,
      actions: [{ label: 'Abrir Cofre', cmd: 'abre cofre' }],
    }];
  }

  // 7. Run rate de metas (projeção)
  function analyzeRunRate() {
    const metas = readJSON(modeKey('fly_metas_v1'), []).filter(m => m.status === 'ativa' && m.alvo > 0);
    const out = [];
    metas.forEach(m => {
      if (!m.data_inicio || !m.data_fim) return;
      const inicio = new Date(m.data_inicio), fim = new Date(m.data_fim), hoje = new Date();
      const diasPassados = Math.max(1, Math.round((hoje - inicio) / (1000 * 60 * 60 * 24)));
      const diasRestantes = Math.max(0, Math.round((fim - hoje) / (1000 * 60 * 60 * 24)));
      if (diasRestantes === 0 || diasPassados < 2) return; // skip se acabou ou começou agora
      const realizado = m.realizado || 0;
      const runRate = realizado / diasPassados;
      const projetado = realizado + runRate * diasRestantes;
      const pctProj = Math.round(projetado / m.alvo * 100);
      // Só sugere se a projeção tá BEM acima ou BEM abaixo
      if (pctProj >= 120) {
        out.push({
          id: 'runrate_high_' + m.id,
          priority: 50,
          icon: '📈',
          color: '#6dffb0',
          title: `"${m.nome}" projetada pra ${pctProj}%`,
          message: `No ritmo atual, vai fechar com folga em ${diasRestantes}d. Considere AUMENTAR a meta.`,
          actions: [
            { label: 'Aumentar meta em 20%', cmd: `aumenta a meta de ${m.escopo_nome || 'empresa'} em 20%` },
            { label: 'Ver Metas', cmd: 'abre metas' },
          ],
        });
      } else if (pctProj < 60 && diasRestantes <= 15) {
        out.push({
          id: 'runrate_low_' + m.id,
          priority: 88,
          icon: '📉',
          color: '#ff6464',
          title: `"${m.nome}" projetada pra apenas ${pctProj}%`,
          message: `Ritmo atual leva a ${pctProj}% em ${diasRestantes}d. Considere REDUZIR a meta ou plano de ação.`,
          actions: [
            { label: 'Reduzir meta em 20%', cmd: `diminui a meta de ${m.escopo_nome || 'empresa'} em 20%` },
            { label: 'Projetar agora', cmd: `projeta meta ${m.escopo_nome || ''}` },
          ],
        });
      }
    });
    return out;
  }

  // 8. Tarefas atrasadas
  function analyzeOverdueTasks() {
    const tasks = readJSON(modeKey('fly_tasks_v1'), []);
    const today = new Date().toISOString().slice(0, 10);
    const atrasadas = tasks.filter(t => t.status !== 'concluida' && t.prazo && t.prazo < today);
    if (atrasadas.length === 0) return [];
    return [{
      id: 'overdue_tasks',
      priority: 65,
      icon: '⏰',
      color: '#ff6464',
      title: `${atrasadas.length} tarefa(s) atrasada(s)`,
      message: atrasadas.slice(0, 2).map(t => `"${t.titulo || t.title}" (${t.prazo})`).join(' · '),
      actions: [{ label: 'Ver tarefas', cmd: 'lista tarefas' }],
    }];
  }

  /* ---------------------------------------------------------------
     ENGINE
  --------------------------------------------------------------- */
  const ANALYZERS = [
    analyzeMetas,
    analyzeRunRate,
    analyzeReconcile,
    analyzeCommissions,
    analyzeInactiveSellers,
    analyzeTopPerformer,
    analyzeCashAlert,
    analyzeOverdueTasks,
  ];

  function analyze() {
    const all = [];
    for (const fn of ANALYZERS) {
      try { all.push(...(fn() || [])); }
      catch (e) { console.warn('[Suggestions] erro em', fn.name, e); }
    }
    return all.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /* ---------------------------------------------------------------
     RENDER
  --------------------------------------------------------------- */
  function render(targetEl) {
    if (!targetEl) return;
    const list = analyze();
    if (!list.length) {
      targetEl.innerHTML = `
        <div class="sugg-empty">
          <span style="font-size:24px;">✨</span>
          <div>Tudo em ordem, Chefe. Sem alertas no momento.</div>
        </div>`;
      return;
    }
    targetEl.innerHTML = list.map(s => `
      <div class="sugg-card" data-sugg-id="${escHtml(s.id)}" style="border-left-color:${s.color};">
        <div class="sugg-card__head">
          <span class="sugg-icon" style="color:${s.color}">${s.icon}</span>
          <div class="sugg-card__title">${escHtml(s.title)}</div>
        </div>
        <div class="sugg-card__msg">${escHtml(s.message)}</div>
        <div class="sugg-card__actions">
          ${(s.actions || []).map(a => `
            <button class="sugg-btn"
              ${a.cmd ? `data-cmd="${escHtml(a.cmd)}"` : ''}
              ${a.action ? `data-action="${escHtml(a.action)}"` : ''}
            >${escHtml(a.label)}</button>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  /* ---------------------------------------------------------------
     INJETA CSS
  --------------------------------------------------------------- */
  function injectCSS() {
    if (document.getElementById('fly-suggestions-styles')) return;
    const s = document.createElement('style');
    s.id = 'fly-suggestions-styles';
    s.textContent = `
      .sugg-empty {
        padding: 32px 18px; text-align: center;
        color: rgba(255,255,255,0.5); display: flex;
        flex-direction: column; gap: 10px; align-items: center;
        font-size: 12px;
      }
      .sugg-card {
        background: rgba(0,0,0,0.35);
        border-left: 3px solid #ffd070;
        padding: 11px 13px;
        border-radius: 0 8px 8px 0;
        margin-bottom: 8px;
        animation: suggFadeIn 0.32s ease;
      }
      @keyframes suggFadeIn {
        from { opacity: 0; transform: translateX(-8px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .sugg-card__head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .sugg-icon { font-size: 16px; }
      .sugg-card__title { font-size: 12px; font-weight: 700; color: #fff; flex: 1; }
      .sugg-card__msg { font-size: 11px; color: rgba(255,255,255,0.65); line-height: 1.45; margin-bottom: 8px; }
      .sugg-card__actions { display: flex; flex-wrap: wrap; gap: 5px; }
      .sugg-btn {
        padding: 4px 10px; font-size: 10.5px;
        background: rgba(245,184,66,0.1);
        border: 1px solid rgba(245,184,66,0.3);
        color: #ffd070;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .sugg-btn:hover {
        background: rgba(245,184,66,0.22);
        border-color: rgba(245,184,66,0.55);
        color: #fff;
      }
    `;
    document.head.appendChild(s);
  }
  if (document.head) injectCSS();
  else document.addEventListener('DOMContentLoaded', injectCSS);

  /* ---------------------------------------------------------------
     CLICK GLOBAL HANDLER · botões de sugestão
  --------------------------------------------------------------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.sugg-btn');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    const action = btn.dataset.action;
    if (cmd && window.__james?.voice?.sendTextCommand) {
      window.__james.voice.sendTextCommand('james, ' + cmd);
    } else if (action === 'reconcile_sellers' && window.__flyReconcile) {
      const r = window.__flyReconcile.reconcileSellers();
      alert(`✓ ${r.matched} venda(s) reconciliada(s) com ${r.sellersUpdated} vendedor(es).`);
      // refresh sugestões
      const target = document.getElementById('jms-suggestions-host');
      if (target) render(target);
    }
  });

  /* ---------------------------------------------------------------
     AUTO-REFRESH
  --------------------------------------------------------------- */
  function refresh() {
    const target = document.getElementById('jms-suggestions-host');
    if (target) render(target);
  }
  // Refresh quando cascata roda
  window.addEventListener('fly:cascade-completed', () => setTimeout(refresh, 400));
  // Refresh quando dados mudam
  window.addEventListener('fly:data-update', refresh);
  // Refresh a cada 5min
  setInterval(refresh, 5 * 60 * 1000);

  /* ---------------------------------------------------------------
     API
  --------------------------------------------------------------- */
  window.__flySuggestions = { analyze, render, refresh };
  console.log('[FLY Suggestions] Engine online,', ANALYZERS.length, 'analyzers.');
})();
