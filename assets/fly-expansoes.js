/* ====================================================================
   FLY · EXPANSÕES
   - CRM completo (clientes, score, jornada Dubai, interações)
   - Central de Projetos (timeline, milestones, riscos, contratos)
   - Ranking Fly Cup
   - Relatórios do Cofre
   - JAMES Chat (painel de texto)
   - Anexos em movimentações do Cofre (injetado via MutationObserver)
   ==================================================================== */
(function flyExpansoes() {
  const MODE = () => localStorage.getItem('fly_data_mode') || 'demo';
  const KEY = (k) => `${k}_${MODE()}`;
  const uid = (pref='id') => `${pref}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const fmtMoney = (n) => 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const fmtDate = (d) => { try { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; } catch(e) { return d; } };
  const read = (k) => { try { return JSON.parse(localStorage.getItem(KEY(k)) || '[]'); } catch(e) { return []; } };
  const write = (k, v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch(e) {} };
  const pushSupa = (table, record) => { try { window.__flySync?.push?.(table, record); } catch(e) {} };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ============================================================
     1 · CRM
     ============================================================ */
  const CRM_KEY = 'fly_customers_v1';
  const STAGES = [
    { id: 'lead_frio',    label: 'Lead Frio'    },
    { id: 'lead_quente',  label: 'Lead Quente'  },
    { id: 'qualificado',  label: 'Qualificado'  },
    { id: 'proposta',     label: 'Proposta'     },
    { id: 'fechado',      label: 'Fechado'      }
  ];
  const JOURNEY = [
    { id: 'interessado', label: 'Interessado' },
    { id: 'cotado',      label: 'Cotado'      },
    { id: 'reservado',   label: 'Reservado'   },
    { id: 'pago',        label: 'Pago'        },
    { id: 'viajou',      label: 'Viajou'      }
  ];

  function crmList() { return read(CRM_KEY); }
  function crmSave(customer) {
    const list = read(CRM_KEY);
    if (!customer.id) customer.id = uid('cust');
    if (!customer.created_at) customer.created_at = Date.now();
    customer.updated_at = Date.now();
    if (!customer.interactions) customer.interactions = [];
    const idx = list.findIndex(c => c.id === customer.id);
    if (idx >= 0) list[idx] = customer;
    else list.unshift(customer);
    write(CRM_KEY, list);
    pushSupa('customers', customer);
    window.dispatchEvent(new CustomEvent('fly:crm-update'));
    return customer;
  }
  function crmDelete(id) {
    write(CRM_KEY, read(CRM_KEY).filter(c => c.id !== id));
    window.dispatchEvent(new CustomEvent('fly:crm-update'));
  }
  function crmAddInteraction(id, interaction) {
    const list = read(CRM_KEY);
    const c = list.find(x => x.id === id);
    if (!c) return;
    c.interactions = c.interactions || [];
    c.interactions.unshift({
      id: uid('int'),
      date: interaction.date || new Date().toISOString(),
      type: interaction.type || 'note',
      text: interaction.text || '',
      outcome: interaction.outcome || ''
    });
    c.updated_at = Date.now();
    write(CRM_KEY, list);
    pushSupa('customers', c);
    window.dispatchEvent(new CustomEvent('fly:crm-update'));
  }

  window.__flyCRMAPI = {
    list: crmList,
    save: crmSave,
    delete: crmDelete,
    addInteraction: crmAddInteraction,
    stages: STAGES,
    journey: JOURNEY
  };

  /* ============================================================
     2 · PROJETOS
     ============================================================ */
  const PROJ_KEY = 'fly_projects_v1';
  const PROJ_STATUS = [
    { id: 'planejamento', label: 'Planejamento' },
    { id: 'em_andamento', label: 'Em Andamento' },
    { id: 'concluido',    label: 'Concluído'    },
    { id: 'pausado',      label: 'Pausado'      }
  ];

  function projList() { return read(PROJ_KEY); }
  function projSave(p) {
    const list = read(PROJ_KEY);
    if (!p.id) p.id = uid('proj');
    if (!p.created_at) p.created_at = Date.now();
    p.updated_at = Date.now();
    p.milestones = p.milestones || [];
    p.risks      = p.risks      || [];
    p.contracts  = p.contracts  || [];
    const idx = list.findIndex(x => x.id === p.id);
    if (idx >= 0) list[idx] = p;
    else list.unshift(p);
    write(PROJ_KEY, list);
    window.dispatchEvent(new CustomEvent('fly:projects-update'));
    return p;
  }
  function projDelete(id) {
    write(PROJ_KEY, read(PROJ_KEY).filter(p => p.id !== id));
    window.dispatchEvent(new CustomEvent('fly:projects-update'));
  }
  window.__flyProjectsAPI = { list: projList, save: projSave, delete: projDelete, statuses: PROJ_STATUS };

  /* ============================================================
     3 · RANKING FLY CUP
     ============================================================ */
  const CUP_RES_KEY = 'fly_cup_results_v1';
  const POINTS = { 1: 100, 2: 70, 3: 50 };
  const PART_POINTS = 10;

  function cupResults() { return read(CUP_RES_KEY); }
  function cupRecordResult(eventoId, results) {
    const all = read(CUP_RES_KEY);
    results.forEach(r => {
      all.unshift({
        id: uid('res'),
        evento_id: eventoId,
        atleta_id: r.atletaId,
        position: r.position || null,
        points: r.position && POINTS[r.position] ? POINTS[r.position] : PART_POINTS,
        date: Date.now()
      });
    });
    write(CUP_RES_KEY, all);
    window.dispatchEvent(new CustomEvent('fly:cup-ranking-update'));
  }
  function cupRanking(filter = {}) {
    const all = read(CUP_RES_KEY);
    const atletas = (window.__flyCupAPI?.atletas?.() || []);
    const totals = {};
    all.forEach(r => { totals[r.atleta_id] = (totals[r.atleta_id] || 0) + (r.points || 0); });
    let ranked = atletas
      .map(a => ({ ...a, points: totals[a.id] || 0 }))
      .filter(a => filter.modalidade ? a.modalidade === filter.modalidade : true)
      .filter(a => filter.polo_id   ? a.polo_id   === filter.polo_id   : true)
      .sort((a,b) => b.points - a.points);
    if (filter.top) ranked = ranked.slice(0, filter.top);
    return ranked;
  }
  window.__flyCupRankingAPI = { record: cupRecordResult, ranking: cupRanking, results: cupResults };

  /* ============================================================
     4 · MODAL DE EXPANSÕES (botão flutuante)
     ============================================================ */
  const overlayHTML = `
    <div id="flyExpModal" class="fly-exp-modal hidden" aria-hidden="true">
      <div class="fly-exp-modal__shell">
        <header class="fly-exp-modal__header">
          <nav class="fly-exp-modal__tabs">
            <button data-exp-tab="crm"        class="active">CRM</button>
            <button data-exp-tab="projetos">Projetos</button>
            <button data-exp-tab="ranking">Ranking Fly Cup</button>
            <button data-exp-tab="relatorios">Relatórios Cofre</button>
            <button data-exp-tab="james">JAMES Chat</button>
          </nav>
          <button class="fly-exp-modal__close" type="button" aria-label="Fechar">×</button>
        </header>
        <main class="fly-exp-modal__body" id="flyExpBody"></main>
      </div>
    </div>
    <button id="flyExpTrigger" class="fly-exp-trigger" type="button" title="Central de Expansões (CRM, Projetos, Relatórios)">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    </button>
  `;
  document.body.insertAdjacentHTML('beforeend', overlayHTML);

  const expModal = document.getElementById('flyExpModal');
  const expBody  = document.getElementById('flyExpBody');
  const expTrigger = document.getElementById('flyExpTrigger');
  let currentTab = 'crm';

  function openExp(tab) {
    currentTab = tab || currentTab;
    expModal.classList.remove('hidden');
    expModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('fly-exp-open');
    expModal.querySelectorAll('[data-exp-tab]').forEach(b => b.classList.toggle('active', b.dataset.expTab === currentTab));
    render();
  }
  function closeExp() {
    expModal.classList.add('hidden');
    expModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('fly-exp-open');
  }
  expTrigger.addEventListener('click', () => openExp());
  expModal.querySelector('.fly-exp-modal__close').addEventListener('click', closeExp);
  expModal.querySelectorAll('[data-exp-tab]').forEach(b => {
    b.addEventListener('click', () => { currentTab = b.dataset.expTab; openExp(currentTab); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !expModal.classList.contains('hidden')) closeExp(); });

  window.__flyExpOpen = openExp;

  /* ============================================================
     5 · RENDERIZADORES
     ============================================================ */
  function render() {
    if (currentTab === 'crm')        return renderCRM();
    if (currentTab === 'projetos')   return renderProjetos();
    if (currentTab === 'ranking')    return renderRanking();
    if (currentTab === 'relatorios') return renderRelatorios();
    if (currentTab === 'james')      return renderJamesChat();
  }

  /* ---- CRM ---- */
  function renderCRM() {
    const list = crmList();
    expBody.innerHTML = `
      <div class="fly-exp-grid">
        <aside class="fly-exp-list">
          <header><h3>Clientes (${list.length})</h3>
            <button class="fly-exp-btn-primary" id="crmNewBtn">+ Novo</button>
          </header>
          <div class="fly-exp-filters">
            <select id="crmFilterStage">
              <option value="">Todos os estágios</option>
              ${STAGES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}
            </select>
            <input id="crmFilterSearch" placeholder="Buscar nome...">
          </div>
          <ul class="fly-exp-rows" id="crmRows">
            ${list.map(c => crmRow(c)).join('') || '<li class="empty">Nenhum cliente. Clique em "+ Novo".</li>'}
          </ul>
        </aside>
        <section class="fly-exp-detail" id="crmDetail">
          <div class="fly-exp-empty">Selecione um cliente ou crie um novo.</div>
        </section>
      </div>
    `;
    document.getElementById('crmNewBtn').addEventListener('click', () => crmEdit({}));
    document.getElementById('crmFilterStage').addEventListener('change', applyCRMFilter);
    document.getElementById('crmFilterSearch').addEventListener('input', applyCRMFilter);
    bindCRMRows();
  }
  function crmRow(c) {
    const stage = STAGES.find(s => s.id === c.stage)?.label || '—';
    return `
      <li data-crm-id="${c.id}" class="fly-exp-row">
        <div class="fly-exp-row__main">
          <strong>${esc(c.name) || 'Sem nome'}</strong>
          <span class="fly-exp-stage stage-${c.stage || 'lead_frio'}">${esc(stage)}</span>
        </div>
        <div class="fly-exp-row__meta">
          ${esc(c.phone) || ''} ${c.instagram ? '· ' + esc(c.instagram) : ''}
          <span class="fly-exp-score">Score ${c.score || 0}</span>
        </div>
      </li>
    `;
  }
  function bindCRMRows() {
    document.querySelectorAll('[data-crm-id]').forEach(el => el.addEventListener('click', () => crmDetail(el.dataset.crmId)));
  }
  function applyCRMFilter() {
    const stage = document.getElementById('crmFilterStage').value;
    const q = document.getElementById('crmFilterSearch').value.toLowerCase();
    const list = crmList()
      .filter(c => stage ? c.stage === stage : true)
      .filter(c => q ? (c.name || '').toLowerCase().includes(q) : true);
    document.getElementById('crmRows').innerHTML = list.map(c => crmRow(c)).join('') || '<li class="empty">Nada encontrado.</li>';
    bindCRMRows();
  }
  function crmDetail(id) {
    const c = crmList().find(x => x.id === id);
    if (!c) return;
    const detail = document.getElementById('crmDetail');
    detail.innerHTML = `
      <header class="fly-exp-detail__head">
        <div>
          <h2>${esc(c.name) || 'Sem nome'}</h2>
          <small>${esc(c.phone) || ''} ${c.instagram ? '· ' + esc(c.instagram) : ''} ${c.email ? '· ' + esc(c.email) : ''}</small>
        </div>
        <div class="fly-exp-detail__actions">
          <button class="fly-exp-btn" id="crmEditBtn">Editar</button>
          <button class="fly-exp-btn-danger" id="crmDelBtn">Excluir</button>
        </div>
      </header>
      <div class="fly-exp-detail__kpi">
        <div><label>Score</label><strong>${c.score || 0}</strong></div>
        <div><label>Estágio</label><strong>${esc(STAGES.find(s=>s.id===c.stage)?.label) || '—'}</strong></div>
        <div><label>Jornada Dubai</label><strong>${esc(JOURNEY.find(j=>j.id===c.journey)?.label) || '—'}</strong></div>
        <div><label>Próxima Ação</label><strong>${esc(c.next_action) || '—'}</strong><small>${c.next_action_date ? fmtDate(c.next_action_date) : ''}</small></div>
      </div>
      ${c.notes ? `<div class="fly-exp-notes">${esc(c.notes)}</div>` : ''}
      <section class="fly-exp-interactions">
        <h3>Interações</h3>
        <form id="crmInteractionForm">
          <select name="type">
            <option value="note">Nota</option>
            <option value="call">Ligação</option>
            <option value="message">Mensagem</option>
            <option value="meeting">Reunião</option>
            <option value="proposta">Proposta enviada</option>
          </select>
          <input name="text" placeholder="O que aconteceu?" required>
          <button type="submit">Registrar</button>
        </form>
        <ul class="fly-exp-timeline">
          ${(c.interactions || []).map(i => `
            <li>
              <span class="fly-exp-timeline__date">${fmtDate(i.date)}</span>
              <span class="fly-exp-timeline__type">${esc(i.type)}</span>
              <span class="fly-exp-timeline__text">${esc(i.text)}</span>
            </li>
          `).join('') || '<li class="empty">Sem interações ainda.</li>'}
        </ul>
      </section>
    `;
    document.getElementById('crmEditBtn').addEventListener('click', () => crmEdit(c));
    document.getElementById('crmDelBtn').addEventListener('click', () => {
      if (!confirm('Excluir este cliente?')) return;
      crmDelete(c.id); renderCRM();
    });
    document.getElementById('crmInteractionForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      crmAddInteraction(c.id, { type: fd.get('type'), text: fd.get('text') });
      crmDetail(c.id);
    });
  }
  function crmEdit(c) {
    const detail = document.getElementById('crmDetail');
    detail.innerHTML = `
      <form id="crmForm" class="fly-exp-form">
        <h2>${c.id ? 'Editar' : 'Novo'} Cliente</h2>
        <div class="fly-exp-form__grid">
          <label>Nome*<input name="name" value="${esc(c.name)}" required></label>
          <label>Telefone<input name="phone" value="${esc(c.phone)}"></label>
          <label>Instagram<input name="instagram" value="${esc(c.instagram)}"></label>
          <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
          <label>Origem
            <select name="origin">
              <option ${!c.origin ? 'selected' : ''}>—</option>
              ${['Instagram','TikTok','Indicação','Site','YouTube','WhatsApp','Facebook'].map(o => `<option ${c.origin===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </label>
          <label>Estágio
            <select name="stage">${STAGES.map(s => `<option value="${s.id}" ${c.stage===s.id?'selected':''}>${esc(s.label)}</option>`).join('')}</select>
          </label>
          <label>Jornada Dubai
            <select name="journey">${JOURNEY.map(j => `<option value="${j.id}" ${c.journey===j.id?'selected':''}>${esc(j.label)}</option>`).join('')}</select>
          </label>
          <label>Score (0-100)<input name="score" type="number" min="0" max="100" value="${c.score || 0}"></label>
          <label>Próxima Ação<input name="next_action" value="${esc(c.next_action)}"></label>
          <label>Data Próxima Ação<input name="next_action_date" type="date" value="${c.next_action_date || ''}"></label>
          <label class="full">Notas<textarea name="notes" rows="3">${esc(c.notes)}</textarea></label>
        </div>
        <div class="fly-exp-form__actions">
          <button type="submit" class="fly-exp-btn-primary">Salvar</button>
          <button type="button" id="crmCancelBtn" class="fly-exp-btn">Cancelar</button>
        </div>
      </form>
    `;
    document.getElementById('crmCancelBtn').addEventListener('click', () => c.id ? crmDetail(c.id) : renderCRM());
    document.getElementById('crmForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = { ...c };
      fd.forEach((v, k) => { obj[k] = k === 'score' ? Number(v) : v; });
      const saved = crmSave(obj);
      renderCRM();
      setTimeout(() => crmDetail(saved.id), 100);
    });
  }

  /* ---- PROJETOS ---- */
  function renderProjetos() {
    const list = projList();
    expBody.innerHTML = `
      <div class="fly-exp-grid">
        <aside class="fly-exp-list">
          <header><h3>Projetos (${list.length})</h3>
            <button class="fly-exp-btn-primary" id="projNewBtn">+ Novo</button>
          </header>
          <ul class="fly-exp-rows">
            ${list.map(p => `
              <li class="fly-exp-row" data-proj-id="${p.id}">
                <div class="fly-exp-row__main">
                  <strong>${esc(p.name)}</strong>
                  <span class="fly-exp-stage status-${p.status}">${esc(PROJ_STATUS.find(s=>s.id===p.status)?.label) || '—'}</span>
                </div>
                <div class="fly-exp-row__meta">${esc(p.responsavel) || '—'} · ${p.progresso || 0}% · ${fmtMoney(p.orcamento || 0)}</div>
              </li>
            `).join('') || '<li class="empty">Nenhum projeto. Clique em "+ Novo".</li>'}
          </ul>
        </aside>
        <section class="fly-exp-detail" id="projDetail">
          <div class="fly-exp-empty">Selecione um projeto ou crie um novo.</div>
        </section>
      </div>
    `;
    document.getElementById('projNewBtn').addEventListener('click', () => projEdit({}));
    document.querySelectorAll('[data-proj-id]').forEach(el => el.addEventListener('click', () => projDetailView(el.dataset.projId)));
  }
  function projDetailView(id) {
    const p = projList().find(x => x.id === id);
    if (!p) return;
    const detail = document.getElementById('projDetail');
    const orc = Number(p.orcamento) || 0;
    const gasto = Number(p.gasto_real) || 0;
    const burnPct = orc > 0 ? Math.min(200, Math.round((gasto / orc) * 100)) : 0;
    detail.innerHTML = `
      <header class="fly-exp-detail__head">
        <div>
          <h2>${esc(p.name)}</h2>
          <small>${esc(p.responsavel) || '—'} · ${fmtDate(p.data_inicio)} → ${fmtDate(p.data_fim_prevista)}</small>
        </div>
        <div class="fly-exp-detail__actions">
          <button class="fly-exp-btn" id="projEditBtn">Editar</button>
          <button class="fly-exp-btn-danger" id="projDelBtn">Excluir</button>
        </div>
      </header>
      <div class="fly-exp-detail__kpi">
        <div><label>Status</label><strong>${esc(PROJ_STATUS.find(s=>s.id===p.status)?.label) || '—'}</strong></div>
        <div><label>Progresso</label><strong>${p.progresso || 0}%</strong>
          <div class="fly-bar"><div style="width:${p.progresso||0}%"></div></div>
        </div>
        <div><label>Orçamento</label><strong>${fmtMoney(orc)}</strong></div>
        <div><label>Gasto Real</label><strong>${fmtMoney(gasto)}</strong>
          <div class="fly-bar"><div style="width:${Math.min(100, burnPct)}%; background: ${burnPct > 100 ? '#e74c3c' : 'var(--gold)'}"></div></div>
        </div>
      </div>
      <section class="fly-exp-milestones">
        <h3>Milestones (Timeline)</h3>
        <div class="fly-exp-timeline-h">
          ${(p.milestones || []).slice().sort((a,b) => new Date(a.date) - new Date(b.date)).map(m => `
            <div class="fly-exp-milestone ${m.done ? 'done' : ''}">
              <span class="dot"></span>
              <strong>${esc(m.label)}</strong>
              <small>${fmtDate(m.date)}</small>
            </div>
          `).join('') || '<small class="empty">Sem milestones.</small>'}
        </div>
      </section>
      <section class="fly-exp-risks">
        <h3>Riscos</h3>
        <ul>${(p.risks || []).map(r => `<li>⚠️ ${esc(r)}</li>`).join('') || '<li class="empty">Sem riscos cadastrados.</li>'}</ul>
      </section>
      ${(p.contracts || []).length ? `
        <section class="fly-exp-contracts">
          <h3>Contratos (${p.contracts.length})</h3>
          <ul>${p.contracts.map((c, i) => `<li><a href="${c.data}" target="_blank" rel="noopener">${esc(c.name) || 'Contrato ' + (i+1)}</a></li>`).join('')}</ul>
        </section>
      ` : ''}
    `;
    document.getElementById('projEditBtn').addEventListener('click', () => projEdit(p));
    document.getElementById('projDelBtn').addEventListener('click', () => {
      if (!confirm('Excluir este projeto?')) return;
      projDelete(p.id); renderProjetos();
    });
  }
  function projEdit(p) {
    const detail = document.getElementById('projDetail');
    const milestonesText = (p.milestones || []).map(m => `${m.date || ''}|${m.label || ''}|${m.done ? '1' : '0'}`).join('\n');
    const risksText = (p.risks || []).join('\n');
    detail.innerHTML = `
      <form id="projForm" class="fly-exp-form">
        <h2>${p.id ? 'Editar' : 'Novo'} Projeto</h2>
        <div class="fly-exp-form__grid">
          <label class="full">Nome*<input name="name" value="${esc(p.name)}" required></label>
          <label>Responsável<input name="responsavel" value="${esc(p.responsavel)}"></label>
          <label>Status<select name="status">${PROJ_STATUS.map(s => `<option value="${s.id}" ${p.status===s.id?'selected':''}>${esc(s.label)}</option>`).join('')}</select></label>
          <label>Início<input name="data_inicio" type="date" value="${p.data_inicio || ''}"></label>
          <label>Fim Previsto<input name="data_fim_prevista" type="date" value="${p.data_fim_prevista || ''}"></label>
          <label>Progresso %<input name="progresso" type="number" min="0" max="100" value="${p.progresso || 0}"></label>
          <label>Orçamento<input name="orcamento" type="number" step="0.01" value="${p.orcamento || 0}"></label>
          <label>Gasto Real<input name="gasto_real" type="number" step="0.01" value="${p.gasto_real || 0}"></label>
          <label class="full">Milestones (uma por linha: <code>YYYY-MM-DD|Label|0ou1</code>)
            <textarea name="milestones" rows="4">${esc(milestonesText)}</textarea>
          </label>
          <label class="full">Riscos (um por linha)<textarea name="risks" rows="3">${esc(risksText)}</textarea></label>
          <label class="full">Anexar contrato (PDF/imagem)<input type="file" id="projContract" accept="image/*,application/pdf"></label>
        </div>
        <div class="fly-exp-form__actions">
          <button type="submit" class="fly-exp-btn-primary">Salvar</button>
          <button type="button" id="projCancelBtn" class="fly-exp-btn">Cancelar</button>
        </div>
      </form>
    `;
    document.getElementById('projCancelBtn').addEventListener('click', () => p.id ? projDetailView(p.id) : renderProjetos());
    document.getElementById('projForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const obj = { ...p };
      ['name','responsavel','status','data_inicio','data_fim_prevista'].forEach(k => obj[k] = fd.get(k) || '');
      ['progresso','orcamento','gasto_real'].forEach(k => obj[k] = Number(fd.get(k)) || 0);
      obj.milestones = String(fd.get('milestones') || '').split('\n').filter(Boolean).map(line => {
        const [date, label, done] = line.split('|');
        return { date: (date||'').trim(), label: (label||'').trim(), done: done === '1' };
      });
      obj.risks = String(fd.get('risks') || '').split('\n').map(s => s.trim()).filter(Boolean);
      obj.contracts = obj.contracts || [];
      const file = document.getElementById('projContract').files[0];
      if (file) {
        const data = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        obj.contracts.push({ name: file.name, data, size: file.size, added: Date.now() });
      }
      const saved = projSave(obj);
      renderProjetos();
      setTimeout(() => projDetailView(saved.id), 100);
    });
  }

  /* ---- RANKING ---- */
  function renderRanking() {
    const modalidades = window.__flyCupAPI?.modalidades?.() || [];
    const polos = window.__flyCupAPI?.polos?.() || [];
    expBody.innerHTML = `
      <div class="fly-exp-stack">
        <header class="fly-exp-header-bar">
          <h2>Ranking Fly Cup</h2>
          <div class="fly-exp-filters">
            <select id="rankMod"><option value="">Todas modalidades</option>${modalidades.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
            <select id="rankPolo"><option value="">Todos polos</option>${polos.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
            <select id="rankTop"><option value="10">Top 10</option><option value="25">Top 25</option><option value="0">Todos</option></select>
            <button class="fly-exp-btn-primary" id="rankAddBtn">+ Registrar Resultado</button>
          </div>
        </header>
        <table class="fly-exp-table" id="rankTable">
          <thead><tr><th>#</th><th>Atleta</th><th>Modalidade</th><th>Polo</th><th>Pontos</th></tr></thead>
          <tbody></tbody>
        </table>
        <small style="color:#888; padding: 10px;">Pontuação: 1º=100, 2º=70, 3º=50, participação=10.</small>
      </div>
    `;
    const update = () => {
      const filter = {
        modalidade: document.getElementById('rankMod').value,
        polo_id:    document.getElementById('rankPolo').value,
        top:        Number(document.getElementById('rankTop').value) || undefined
      };
      const r = cupRanking(filter);
      const poloMap = Object.fromEntries(polos.map(p => [p.id, p.nome]));
      const modMap  = Object.fromEntries(modalidades.map(m => [m.id, m.name]));
      document.querySelector('#rankTable tbody').innerHTML = r.map((a, i) => `
        <tr><td>${i+1}</td><td>${esc(a.nome)}</td><td>${esc(modMap[a.modalidade]) || '—'}</td><td>${esc(poloMap[a.polo_id]) || '—'}</td><td><strong>${a.points}</strong></td></tr>
      `).join('') || '<tr><td colspan="5" class="empty">Sem resultados. Clique em "+ Registrar".</td></tr>';
    };
    ['rankMod','rankPolo','rankTop'].forEach(id => document.getElementById(id).addEventListener('change', update));
    document.getElementById('rankAddBtn').addEventListener('click', renderRankingForm);
    update();
  }
  function renderRankingForm() {
    const eventos = window.__flyCupAPI?.eventos?.() || [];
    const atletas = window.__flyCupAPI?.atletas?.() || [];
    expBody.innerHTML = `
      <form id="rankForm" class="fly-exp-form" style="padding: 24px;">
        <h2>Registrar Resultado de Evento</h2>
        <label>Evento*<select name="evento" required>
          <option value="">Selecionar...</option>
          ${eventos.map(e => `<option value="${e.id}">${esc(e.nome)} (${fmtDate(e.data)})</option>`).join('')}
        </select></label>
        <fieldset class="fly-exp-rank-pos">
          <legend>Pódio</legend>
          <label>1º lugar (100pts)<select name="pos1"><option value="">—</option>${atletas.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label>
          <label>2º lugar (70pts)<select name="pos2"><option value="">—</option>${atletas.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label>
          <label>3º lugar (50pts)<select name="pos3"><option value="">—</option>${atletas.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label>
        </fieldset>
        <label>Participantes (10pts cada — segura Ctrl/Cmd para múltiplos)
          <select name="participantes" multiple size="6">${atletas.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select>
        </label>
        <div class="fly-exp-form__actions">
          <button type="submit" class="fly-exp-btn-primary">Salvar Resultado</button>
          <button type="button" id="rankCancelBtn" class="fly-exp-btn">Cancelar</button>
        </div>
      </form>
    `;
    document.getElementById('rankCancelBtn').addEventListener('click', renderRanking);
    document.getElementById('rankForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const eventoId = fd.get('evento');
      const results = [];
      for (const pos of ['pos1','pos2','pos3']) {
        const aid = fd.get(pos);
        if (aid) results.push({ atletaId: aid, position: Number(pos.replace('pos','')) });
      }
      const partSel = e.target.querySelector('select[name="participantes"]');
      Array.from(partSel.selectedOptions).forEach(opt => {
        if (!results.find(r => r.atletaId === opt.value)) results.push({ atletaId: opt.value });
      });
      cupRecordResult(eventoId, results);
      renderRanking();
    });
  }

  /* ---- RELATÓRIOS COFRE ---- */
  function readMoves() {
    try {
      const raw = localStorage.getItem(KEY('fly_moves_v1'));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function renderRelatorios() {
    const moves = readMoves();
    const monthFilter = document.getElementById('relMonthSel')?.value || '';
    const filtered = monthFilter ? moves.filter(m => (m.date || '').startsWith(monthFilter)) : moves;
    const expenses = filtered.filter(m => ['expense','credit_card_expense'].includes(m.movement_type));
    const incomes  = filtered.filter(m => m.movement_type === 'income');

    const byCat = {};
    expenses.forEach(m => { byCat[m.category || 'Sem categoria'] = (byCat[m.category || 'Sem categoria'] || 0) + Number(m.amount || 0); });
    const totalCat = Object.values(byCat).reduce((s,v) => s+v, 0);

    const byProj = {};
    filtered.forEach(m => { if (m.project_id) byProj[m.project_id] = (byProj[m.project_id] || 0) + Number(m.amount || 0); });

    const bySocio = {};
    filtered.forEach(m => {
      const p = m.partner || m.from_partner || 'Outros';
      bySocio[p] = bySocio[p] || { in: 0, out: 0 };
      if (m.movement_type === 'income') bySocio[p].in += Number(m.amount || 0);
      else if (['expense','credit_card_expense'].includes(m.movement_type)) bySocio[p].out += Number(m.amount || 0);
    });

    const flow = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = d.toISOString().slice(0,7);
      flow[k] = { in: 0, out: 0 };
    }
    moves.forEach(m => {
      const k = (m.date || '').slice(0,7);
      if (flow[k]) {
        if (m.movement_type === 'income') flow[k].in += Number(m.amount || 0);
        else if (['expense','credit_card_expense'].includes(m.movement_type)) flow[k].out += Number(m.amount || 0);
      }
    });

    const months = Array.from(new Set(moves.map(m => (m.date || '').slice(0,7)).filter(Boolean))).sort().reverse();

    expBody.innerHTML = `
      <div class="fly-exp-stack">
        <header class="fly-exp-header-bar">
          <h2>Relatórios do Cofre</h2>
          <select id="relMonthSel">
            <option value="">Tudo</option>
            ${months.map(m => `<option value="${m}" ${m===monthFilter?'selected':''}>${m}</option>`).join('')}
          </select>
        </header>
        <div class="fly-exp-reports">
          <div class="fly-exp-card">
            <h3>Gastos por Categoria</h3>
            ${Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat, v]) => `
              <div class="fly-exp-row-bar">
                <span>${esc(cat)}</span><strong>${fmtMoney(v)}</strong>
                <div class="fly-bar"><div style="width:${totalCat ? (v/totalCat*100) : 0}%"></div></div>
                <small>${totalCat ? (v/totalCat*100).toFixed(1) : 0}%</small>
              </div>
            `).join('') || '<small class="empty">Sem gastos.</small>'}
          </div>
          <div class="fly-exp-card">
            <h3>Gastos por Projeto</h3>
            ${Object.entries(byProj).sort((a,b) => b[1]-a[1]).map(([pid, v]) => `
              <div class="fly-exp-row-bar"><span>${esc(pid)}</span><strong>${fmtMoney(v)}</strong></div>
            `).join('') || '<small class="empty">Sem rateio por projeto.</small>'}
          </div>
          <div class="fly-exp-card">
            <h3>Movimentações por Sócio</h3>
            ${Object.entries(bySocio).map(([p, v]) => `
              <div class="fly-exp-row-socio">
                <strong>${esc(p)}</strong>
                <span class="in">↑ ${fmtMoney(v.in)}</span>
                <span class="out">↓ ${fmtMoney(v.out)}</span>
              </div>
            `).join('') || '<small class="empty">Sem dados por sócio.</small>'}
          </div>
          <div class="fly-exp-card fly-exp-card--wide">
            <h3>Fluxo de Caixa (12 meses)</h3>
            <table class="fly-exp-table">
              <thead><tr><th>Mês</th><th>Receita</th><th>Despesa</th><th>Saldo</th></tr></thead>
              <tbody>
                ${Object.entries(flow).map(([m, v]) => `
                  <tr>
                    <td>${m}</td>
                    <td class="in">${fmtMoney(v.in)}</td>
                    <td class="out">${fmtMoney(v.out)}</td>
                    <td><strong style="color:${v.in - v.out >= 0 ? '#4caf50' : '#e74c3c'}">${fmtMoney(v.in - v.out)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.getElementById('relMonthSel').addEventListener('change', renderRelatorios);
  }

  /* ---- JAMES CHAT ---- */
  const CHAT_KEY = 'fly_james_chat_v1';
  function chatHist() { try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch(e) { return []; } }
  function chatPush(msg) { const h = chatHist(); h.push(msg); localStorage.setItem(CHAT_KEY, JSON.stringify(h.slice(-50))); }
  function chatClear() { localStorage.removeItem(CHAT_KEY); }

  function renderJamesChat() {
    const history = chatHist();
    expBody.innerHTML = `
      <div class="fly-exp-stack fly-james-chat">
        <header class="fly-exp-header-bar">
          <h2>JAMES Chat</h2>
          <div class="fly-james-quick">
            <button data-james-q="quantas vendas eu fiz esse mês">Vendas do mês</button>
            <button data-james-q="qual o saldo do cofre">Saldo Cofre</button>
            <button data-james-q="quantos pontos tem no plano war">Plano WAR</button>
            <button data-james-q="quantos atletas tenho no fly cup">Atletas Cup</button>
            <button data-james-q="resume o dia pra mim">Resumo do dia</button>
            <button id="jamesClearBtn">Limpar</button>
          </div>
        </header>
        <ul class="fly-james-msgs" id="jamesMsgs">
          ${history.map(m => `
            <li class="fly-james-msg fly-james-msg--${m.role}">
              <strong>${m.role === 'user' ? 'Você' : 'JAMES'}</strong>
              <span>${esc(m.text)}</span>
            </li>
          `).join('') || '<li class="empty">Sem conversa ainda. Pergunta alguma coisa, chefe.</li>'}
        </ul>
        <form id="jamesForm" class="fly-james-form">
          <input id="jamesInput" placeholder="Pergunta pro JAMES..." autocomplete="off">
          <button type="submit" class="fly-exp-btn-primary">Enviar</button>
        </form>
      </div>
    `;
    const msgs = document.getElementById('jamesMsgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    async function ask(text) {
      if (!text || !text.trim()) return;
      chatPush({ role: 'user', text, t: Date.now() });
      let reply = '...';
      try {
        if (typeof window.__flyJamesAnswer === 'function') {
          reply = await window.__flyJamesAnswer(text);
        } else {
          reply = quickReply(text);
        }
      } catch (e) { reply = 'Não consegui responder agora: ' + e.message; }
      chatPush({ role: 'james', text: reply, t: Date.now() });
      renderJamesChat();
      try { window.__flyJamesSpeak?.(reply); } catch (e) {}
    }

    document.getElementById('jamesForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = document.getElementById('jamesInput').value;
      document.getElementById('jamesInput').value = '';
      ask(v);
    });
    document.querySelectorAll('[data-james-q]').forEach(b => b.addEventListener('click', () => ask(b.dataset.jamesQ)));
    document.getElementById('jamesClearBtn').addEventListener('click', () => { chatClear(); renderJamesChat(); });
  }
  function quickReply(text) {
    const t = text.toLowerCase();
    if (/saldo|cofre/.test(t) && window.__flyCofreAPI) {
      const total = (window.__flyCofreAPI.totalCaixaFly?.() || 0) + (window.__flyCofreAPI.totalCaixaPersonal?.() || 0);
      return `Caixa total consolidado: ${fmtMoney(total)}, chefe.`;
    }
    if (/vendas/.test(t) && window.__flySalesAPI?.stats) {
      const s = window.__flySalesAPI.stats(t);
      return s?.text || 'Sem vendas registradas.';
    }
    if (/clientes|crm/.test(t)) {
      const n = crmList().length;
      return `Você tem ${n} ${n===1?'cliente':'clientes'} cadastrados, chefe.`;
    }
    if (/projeto/.test(t)) {
      const n = projList().length;
      return `Você tem ${n} ${n===1?'projeto':'projetos'} cadastrados.`;
    }
    if (/atletas|cup/.test(t)) {
      const n = (window.__flyCupAPI?.atletas?.() || []).length;
      return `Fly Cup tem ${n} atletas.`;
    }
    if (/resume|resumo/.test(t)) {
      const c = crmList().length;
      const v = (window.__flySalesAPI?.list?.() || []).length;
      const p = projList().length;
      const a = (window.__flyCupAPI?.atletas?.() || []).length;
      return `Resumo de hoje, chefe: ${c} clientes no CRM, ${v} vendas registradas, ${p} projetos ativos, ${a} atletas no Fly Cup.`;
    }
    return 'Ainda não tenho contexto pra essa pergunta. Abre o JAMES standalone (orbe) pra ativar o LLM.';
  }

  /* ============================================================
     6 · ANEXOS COFRE — injeção automática no form de movimento
     ============================================================ */
  function injectCofreAttachment() {
    const obs = new MutationObserver(() => {
      // procura form de movimento dentro do cofre overlay
      const overlay = document.getElementById('cofreAeyOverlay');
      if (!overlay || overlay.classList.contains('hidden')) return;
      const form = overlay.querySelector('form.cofre-move-form, form#cofreMoveForm, form[data-cofre-form], form[name="cofreMove"]');
      if (!form || form.dataset.flyAttachInjected) return;

      const wrap = document.createElement('label');
      wrap.className = 'cofre-attach-label';
      wrap.innerHTML = `
        <span>📎 Anexar comprovante</span>
        <input type="file" name="attachment" accept="image/*,application/pdf">
        <div class="cofre-attach-preview" hidden></div>
      `;
      // tenta inserir antes do botão de submit
      const submitBtn = form.querySelector('button[type="submit"], [type="submit"]');
      if (submitBtn) submitBtn.parentNode.insertBefore(wrap, submitBtn);
      else form.appendChild(wrap);
      form.dataset.flyAttachInjected = '1';

      const fileInput = wrap.querySelector('input[type="file"]');
      const preview = wrap.querySelector('.cofre-attach-preview');
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files[0];
        if (!f) { preview.hidden = true; preview.innerHTML = ''; return; }
        const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        window.__flyLastAttachment = { name: f.name, data, type: f.type };
        preview.hidden = false;
        if (f.type.startsWith('image/')) preview.innerHTML = `<img src="${data}" alt="preview">`;
        else preview.innerHTML = `<a href="${data}" target="_blank" rel="noopener">📄 ${esc(f.name)}</a>`;
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  injectCofreAttachment();

  // viewer fullscreen pra comprovantes existentes
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-cofre-attachment]');
    if (!link) return;
    e.preventDefault();
    const url = link.getAttribute('data-cofre-attachment');
    const viewer = document.createElement('div');
    viewer.className = 'fly-attach-viewer';
    viewer.innerHTML = `
      <button class="fly-attach-viewer__close" type="button" aria-label="Fechar">×</button>
      ${url.startsWith('data:application/pdf') || url.includes('.pdf')
        ? `<iframe src="${url}"></iframe>`
        : `<img src="${url}" alt="Comprovante">`}
    `;
    document.body.appendChild(viewer);
    viewer.querySelector('.fly-attach-viewer__close').addEventListener('click', () => viewer.remove());
    viewer.addEventListener('click', (ev) => { if (ev.target === viewer) viewer.remove(); });
  });

  /* ============================================================
     7 · Wire global
     ============================================================ */
  window.addEventListener('fly:data-mode-change', () => {
    if (!expModal.classList.contains('hidden')) render();
  });
  window.addEventListener('fly:crm-update',         () => { if (currentTab === 'crm' && !expModal.classList.contains('hidden')) render(); });
  window.addEventListener('fly:projects-update',    () => { if (currentTab === 'projetos' && !expModal.classList.contains('hidden')) render(); });
  window.addEventListener('fly:cup-ranking-update', () => { if (currentTab === 'ranking' && !expModal.classList.contains('hidden')) render(); });

  console.log('[FLY] Expansões carregadas:', {
    CRM: !!window.__flyCRMAPI,
    Projetos: !!window.__flyProjectsAPI,
    Ranking: !!window.__flyCupRankingAPI,
    ChatJAMES: true,
    AnexosCofre: true
  });
})();
