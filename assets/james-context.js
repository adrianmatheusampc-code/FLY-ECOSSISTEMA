/* =====================================================================
   JAMES CONTEXT — Sistema Global de Contexto Navegacional
   Versão: 1.0 · FLY Ecossistema

   O James "assiste" o Chefe: sabe em tempo real onde ele está, qual
   item abriu, qual aba clicou, o que fez por último — e usa isso pra
   responder e dar dicas com base no que está na tela AGORA.

   --------------------------------------------------------------------
   ESTRUTURA DE ARQUIVOS SUGERIDA (vanilla JS, sem framework)
   --------------------------------------------------------------------
     assets/
       james-context.js   ← ESTE arquivo (provider global + hook + debug)
       james-brain-real.js ← consome o contexto no system prompt
       james-v2.js         ← UI/voz do James
     index.html            ← carrega james-context.js ANTES dos outros

   --------------------------------------------------------------------
   API PÚBLICA · window.__jamesContext
   --------------------------------------------------------------------
     getContext()              → snapshot completo (imutável)
     update(patch)             → mescla campos no contexto
     trackNavigation(mod,page) → registra troca de módulo/página
     trackEntity(type,id,name) → registra card/item selecionado
     trackTab(tab)             → registra troca de aba
     trackAction(type,detail)  → registra ação genérica
     addScreenshot(b64,label)  → guarda print TEMPORÁRIO (sessão)
     getScreenshotsRaw()       → prints com base64 real (p/ Vision)
     purgeScreenshots()        → descarta todos os prints
     addSessionNote(txt)       → anota algo na memória de sessão
     clearSession()            → zera memória temporária + prints
     onUpdate(fn)              → assina mudanças; retorna unsubscribe()
     useJamesContext()         → hook estilo React (objeto de helpers)
     toggleDebug()/showDebug() → painel de debug flutuante

   Evento global emitido a cada mudança:
     window.addEventListener('fly:context-update', e => e.detail)
   ===================================================================== */
(function jamesContextBoot() {
  'use strict';

  if (window.__jamesContext) return; // singleton

  /* ===================================================================
     1 · CONSTANTES
     =================================================================== */
  const MAX_NAV          = 20; // tamanho máx do histórico de navegação
  const MAX_SCREENSHOTS  = 6;  // prints temporários simultâneos
  const MAX_NOTES        = 50; // anotações de sessão

  // Tópico (key no app) → módulo legível pro James
  const TOPIC_MODULE_MAP = {
    'PRODUTOS':              'produtos',
    'MARCAS / PRODUTOS FLY': 'produtos',
    'ESTRUTURA CORPORATIVA': 'estrutura',
    'PROJETOS':              'projetos',
    'MARKETING':             'marketing',
    'TIMES E PESSOAS':       'times',
    'TIMES':                 'times',
    'PESSOAS':               'times',
    'ESTRATÉGIA':            'estrategia',
    'ESTRATEGIA':            'estrategia',
    'BASES FLY':             'bases',
    'BASES':                 'bases',
    'VENDAS':                'vendas',
    'CENTRAL DE VENDAS':     'vendas',
    'FINANCEIRO':            'financeiro',
    'COFRE AEY':             'financeiro',
    'CAIXA':                 'caixa',
    'INFLUENCIADORES':       'influenciadores',
    'SELLERS':               'vendedores',
    'VENDEDORES':            'vendedores',
    'METAS':                 'metas',
    'EVENTOS':               'eventos',
    'FLY CUP':               'flycup',
    'PLANO WAR':             'war',
    'DASHBOARD':             'dashboard',
    'DASHBOARD SUPREMO':     'dashboard',
  };

  // Módulo → tipo da entidade selecionada (selectedEntity.type)
  const ENTITY_TYPE_MAP = {
    'produtos':        'produto',
    'projetos':        'projeto',
    'marketing':       'campanha',
    'times':           'colaborador',
    'estrutura':       'unidade',
    'bases':           'base',
    'vendas':          'venda',
    'vendedores':      'vendedor',
    'influenciadores': 'influenciador',
    'metas':           'meta',
    'eventos':         'evento',
    'flycup':          'evento',
    'war':             'territorio',
    'financeiro':      'movimentacao',
    'caixa':           'movimentacao',
  };

  /* ===================================================================
     2 · ESTADO INTERNO (a "BASE DO JAMES")
     =================================================================== */
  const _state = {
    currentModule: 'home',          // dashboard, produtos, vendas, financeiro...
    currentPage:   'grid',          // nome da tela atual (grid/topic/item/...)
    currentTab:    null,            // aba dentro da página
    selectedEntity: null,           // { type, id, name, ... }
    recentNavigation: [],           // últimas telas visitadas
    uploadedScreenshots: [],        // prints TEMPORÁRIOS (só sessão)
    lastUserAction: null,           // última ação do usuário
    jamesMemorySession: {           // memória volátil — NÃO persiste
      startedAt: Date.now(),
      interactions: 0,
      notes: [],
    },
  };

  let _subscribers = [];

  /* ===================================================================
     3 · UTILS
     =================================================================== */
  function slugify(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function safeText(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  /* ===================================================================
     4 · SNAPSHOT / EMIT
     =================================================================== */
  // getContext() devolve uma cópia. Os prints vêm com base64 OMITIDO —
  // o James só recebe a imagem real via getScreenshotsRaw() (Vision).
  function getContext() {
    return {
      currentModule:  _state.currentModule,
      currentPage:    _state.currentPage,
      currentTab:     _state.currentTab,
      selectedEntity: _state.selectedEntity ? { ..._state.selectedEntity } : null,
      recentNavigation: _state.recentNavigation.map(n => ({ ...n })),
      uploadedScreenshots: _state.uploadedScreenshots.map(s => ({
        id: s.id, label: s.label, addedAt: s.addedAt, data: '[base64_omitido]',
      })),
      lastUserAction: _state.lastUserAction ? { ..._state.lastUserAction } : null,
      jamesMemorySession: {
        startedAt: _state.jamesMemorySession.startedAt,
        interactions: _state.jamesMemorySession.interactions,
        notes: _state.jamesMemorySession.notes.map(n => ({ ...n })),
      },
    };
  }

  let _emitScheduled = false;
  function emit() {
    // debounce em microtask: várias mudanças no mesmo tick = 1 emit
    if (_emitScheduled) return;
    _emitScheduled = true;
    Promise.resolve().then(() => {
      _emitScheduled = false;
      const snap = getContext();
      _subscribers.forEach(fn => { try { fn(snap); } catch (e) {} });
      try {
        window.dispatchEvent(new CustomEvent('fly:context-update', { detail: snap }));
      } catch (e) {}
      _renderDebugPanel();
    });
  }

  /* ===================================================================
     5 · MUTADORES
     =================================================================== */
  function update(patch) {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(_state, patch);
    emit();
  }

  function _pushNav(module, page) {
    const last = _state.recentNavigation[_state.recentNavigation.length - 1];
    if (last && last.module === module && last.page === page) return;
    _state.recentNavigation.push({ module, page, at: Date.now() });
    if (_state.recentNavigation.length > MAX_NAV) _state.recentNavigation.shift();
  }

  function trackNavigation(module, page, extra = {}) {
    const prev = _state.currentModule;
    _state.currentModule = module || _state.currentModule;
    _state.currentPage   = page   || _state.currentPage;
    if (extra.resetTab)    _state.currentTab = null;
    if (extra.resetEntity) _state.selectedEntity = null;
    if (extra.tab !== undefined)            _state.currentTab     = extra.tab;
    if (extra.selectedEntity !== undefined) _state.selectedEntity = extra.selectedEntity;
    _pushNav(_state.currentModule, _state.currentPage);
    _state.lastUserAction = {
      type: 'navigate', from: prev, to: _state.currentModule,
      page: _state.currentPage, at: Date.now(),
    };
    emit();
  }

  function trackEntity(type, id, name, extra = {}) {
    if (!name && !id) return;
    _state.selectedEntity = {
      type: type || ENTITY_TYPE_MAP[_state.currentModule] || 'item',
      id:   id || slugify(name),
      name: name || id,
      ...extra,
    };
    _state.lastUserAction = {
      type: 'select_entity', entity: { ..._state.selectedEntity }, at: Date.now(),
    };
    emit();
  }

  function trackTab(tab) {
    if (!tab || tab === _state.currentTab) return;
    _state.currentTab = tab;
    _state.lastUserAction = { type: 'tab_switch', tab, at: Date.now() };
    emit();
  }

  function trackAction(type, detail = {}) {
    _state.lastUserAction = { type, ...detail, at: Date.now() };
    _state.jamesMemorySession.interactions++;
    emit();
  }

  /* ===================================================================
     6 · SCREENSHOTS TEMPORÁRIOS
     Regra: print é salvo SÓ na sessão. Analisado, exibido como preview
     e descartado (purge) — nunca persiste em localStorage/Supabase.
     =================================================================== */
  function addScreenshot(base64, label = '') {
    if (!base64) return null;
    const item = {
      id: 'scr_' + Date.now().toString(36),
      label: label || ('Print ' + (_state.uploadedScreenshots.length + 1)),
      data: base64, // só vive na memória desta aba
      addedAt: Date.now(),
    };
    _state.uploadedScreenshots.push(item);
    if (_state.uploadedScreenshots.length > MAX_SCREENSHOTS) {
      _state.uploadedScreenshots.shift();
    }
    _state.lastUserAction = { type: 'screenshot_added', label: item.label, at: Date.now() };
    emit();
    return item.id;
  }

  // Retorna os prints com o base64 REAL — uso exclusivo do James Vision.
  function getScreenshotsRaw() {
    return _state.uploadedScreenshots.map(s => ({ ...s }));
  }

  function purgeScreenshots() {
    _state.uploadedScreenshots = [];
    _state.lastUserAction = { type: 'screenshots_purged', at: Date.now() };
    emit();
  }

  /* ===================================================================
     7 · MEMÓRIA DE SESSÃO (volátil)
     =================================================================== */
  function addSessionNote(note) {
    if (!note) return;
    _state.jamesMemorySession.notes.push({ note: String(note).slice(0, 280), at: Date.now() });
    if (_state.jamesMemorySession.notes.length > MAX_NOTES) {
      _state.jamesMemorySession.notes.shift();
    }
    emit();
  }

  function clearSession() {
    _state.jamesMemorySession = { startedAt: Date.now(), interactions: 0, notes: [] };
    _state.uploadedScreenshots = [];
    _state.lastUserAction = { type: 'session_cleared', at: Date.now() };
    emit();
  }

  /* ===================================================================
     8 · ASSINANTES / HOOK
     =================================================================== */
  function onUpdate(fn) {
    if (typeof fn !== 'function') return () => {};
    _subscribers.push(fn);
    try { fn(getContext()); } catch (e) {} // emite estado atual na hora
    return () => { _subscribers = _subscribers.filter(s => s !== fn); };
  }

  // Hook estilo React (mas vanilla): retorna helpers + getter de contexto.
  // Uso numa página de Produtos:
  //   const jc = window.__jamesContext.useJamesContext();
  //   jc.trackNavigation('produtos', 'lista-produtos');
  //   jc.trackEntity('produto', 'dubai-explorer', 'Dubai Explorer');
  function useJamesContext() {
    return {
      get context()        { return getContext(); },
      getContext,
      update,
      trackNavigation,
      trackEntity,
      trackTab,
      trackAction,
      addScreenshot,
      getScreenshotsRaw,
      purgeScreenshots,
      addSessionNote,
      clearSession,
      onUpdate,
    };
  }

  /* ===================================================================
     9 · DETECÇÃO AUTOMÁTICA DE NAVEGAÇÃO
     O app é uma SPA vanilla: switchTo() troca body.classList entre
     detail-mode / topic-mode / item-mode (grid = sem classe).
     Observamos isso + o conteúdo de #topicView / #itemView.
     =================================================================== */
  function extractTopicName() {
    const tv = document.getElementById('topicView');
    if (!tv) return null;
    return safeText(tv.querySelector('.topic-banner h1, h1'))
        || safeText(tv.querySelector('.topic-title, [class*="title"]'))
        || null;
  }

  function extractItemName() {
    const iv = document.getElementById('itemView');
    if (!iv) return null;
    return safeText(iv.querySelector('.dbx-hero-content h1, .hier-item-title, .pk-title, h1'))
        || safeText(iv.querySelector('[class*="-title"]'))
        || null;
  }

  function currentBodyView() {
    const c = document.body.classList;
    if (c.contains('item-mode'))   return 'item';
    if (c.contains('topic-mode'))  return 'topic';
    if (c.contains('detail-mode')) return 'detail';
    return 'grid';
  }

  let _lastView = null;

  function syncFromDOM() {
    const view = currentBodyView();

    if (view === 'grid') {
      if (_lastView !== 'grid') {
        trackNavigation('home', 'grid', { resetTab: true, resetEntity: true });
      }
      _lastView = 'grid';
      return;
    }

    if (view === 'detail') {
      if (_lastView !== 'detail') {
        trackNavigation('ecossistema', 'detail', { resetTab: true, resetEntity: true });
      }
      _lastView = 'detail';
      return;
    }

    if (view === 'topic') {
      const topic = extractTopicName();
      const mod = topic
        ? (TOPIC_MODULE_MAP[topic.toUpperCase()] || slugify(topic))
        : 'topic';
      if (_lastView !== 'topic' || mod !== _state.currentModule) {
        trackNavigation(mod, 'topic', { resetTab: true, resetEntity: true });
      }
      _lastView = 'topic';
      return;
    }

    if (view === 'item') {
      const itemName = extractItemName();
      if (itemName) {
        const type = ENTITY_TYPE_MAP[_state.currentModule] || 'item';
        const id = slugify(itemName);
        if (!_state.selectedEntity || _state.selectedEntity.id !== id) {
          _state.selectedEntity = { type, id, name: itemName };
        }
      }
      if (_lastView !== 'item') {
        _state.currentPage = 'item';
        _state.lastUserAction = {
          type: 'open_item',
          entity: _state.selectedEntity ? { ..._state.selectedEntity } : null,
          at: Date.now(),
        };
        _pushNav(_state.currentModule, 'item');
        emit();
      }
      _lastView = 'item';
      return;
    }
  }

  function setupObservers() {
    // body.classList → nível de navegação
    new MutationObserver(() => setTimeout(syncFromDOM, 60))
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // conteúdo de topic/item troca sem mudar classe (ex: trocar de produto)
    ['topicView', 'itemView'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        new MutationObserver(() => setTimeout(syncFromDOM, 80))
          .observe(el, { childList: true });
      }
    });
  }

  /* ===================================================================
     10 · DELEGAÇÃO DE CLIQUES — tabs, cards, navegação
     Capture phase pra registrar ANTES de qualquer stopPropagation().
     =================================================================== */
  function setupClickDelegation() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;

      // ---- ABAS: qualquer elemento com [data-tab] ----
      const tabEl = t.closest('[data-tab]');
      if (tabEl && tabEl.dataset.tab) {
        trackTab(tabEl.dataset.tab);
        return;
      }

      // ---- BOTÕES DE SEÇÃO DO DASHBOARD ----
      const dashBtn = t.closest('[data-dash-section]');
      if (dashBtn) {
        const sec = dashBtn.dataset.dashSection;
        trackNavigation(sec || 'dashboard', 'dashboard', { resetTab: true });
        return;
      }

      // ---- CARDS / ITENS clicáveis ----
      const card = t.closest(
        '.card, .grid-card, .prod-card, .pk-card, .hier-row, .inf-row, ' +
        '.sel-row, .met-row, .sidebar-pin-row, .war-territory-row, ' +
        '[data-item-id], [data-item-name], [data-entity]'
      );
      if (card) {
        const name =
          card.dataset.itemName ||
          card.dataset.entity ||
          safeText(card.querySelector(
            'h3, h4, .card-title, .name, .inf-name, .sel-name, ' +
            '.hier-name, .sidebar-pin-name, .prod-card-title'
          )) ||
          card.dataset.id ||
          '';
        if (name && name.length < 120) {
          const type = ENTITY_TYPE_MAP[_state.currentModule] || 'item';
          trackEntity(type, card.dataset.itemId || card.dataset.id || slugify(name), name);
        }
      }
    }, true);
  }

  /* ===================================================================
     11 · PAINEL DE DEBUG (flutuante, arrastável, minimizável)
     =================================================================== */
  let _panel = null;
  let _collapsed = false;

  function injectCSS() {
    if (document.getElementById('jcd-style')) return;
    const s = document.createElement('style');
    s.id = 'jcd-style';
    s.textContent = `
      #james-context-debug{position:fixed;top:80px;right:24px;width:266px;
        background:rgba(10,12,20,.94);border:1px solid rgba(198,168,90,.32);
        border-radius:12px;font-family:'SF Mono',ui-monospace,Consolas,monospace;
        font-size:11px;color:#d6c8a4;z-index:2147483600;
        box-shadow:0 10px 38px rgba(0,0,0,.6);backdrop-filter:blur(12px);
        user-select:none;transition:opacity .15s}
      #james-context-debug.jcd-collapsed .jcd-body{display:none}
      #james-context-debug .jcd-head{display:flex;align-items:center;gap:6px;
        padding:9px 12px;border-bottom:1px solid rgba(198,168,90,.16);cursor:move}
      #james-context-debug .jcd-dot{width:7px;height:7px;border-radius:50%;
        background:#6dffb0;box-shadow:0 0 8px #6dffb0;animation:jcdpulse 2s infinite}
      @keyframes jcdpulse{0%,100%{opacity:1}50%{opacity:.35}}
      #james-context-debug .jcd-ttl{flex:1;font-size:10px;letter-spacing:1.6px;
        color:#c6a85a;font-weight:700}
      #james-context-debug .jcd-tg{background:none;border:1px solid rgba(198,168,90,.3);
        color:#c6a85a;border-radius:5px;width:20px;height:20px;cursor:pointer;
        font-size:13px;line-height:1;padding:0;display:flex;align-items:center;
        justify-content:center}
      #james-context-debug .jcd-body{padding:10px 12px}
      #james-context-debug .jcd-r{display:flex;gap:6px;margin-bottom:5px;align-items:flex-start}
      #james-context-debug .jcd-k{color:rgba(214,200,164,.5);min-width:74px;flex-shrink:0}
      #james-context-debug .jcd-v{color:#ecd9a6;font-weight:600;flex:1;
        word-break:break-word}
      #james-context-debug .jcd-mod{color:#7ecfff}
      #james-context-debug .jcd-ent{color:#a8e6cf}
      #james-context-debug .jcd-act{color:#ffb347}
      #james-context-debug .jcd-warn{color:#ff7676}
      #james-context-debug .jcd-nul{color:rgba(214,200,164,.25);font-style:italic}
      #james-context-debug .jcd-sep{height:1px;background:rgba(198,168,90,.12);margin:8px 0}
      #james-context-debug .jcd-nav{color:#9bb8d4;line-height:1.7;padding-left:6px;
        border-left:2px solid rgba(198,168,90,.22);font-size:10px}
      #james-context-debug .jcd-np{color:rgba(155,184,212,.5)}
      #james-context-debug .jcd-btns{display:flex;gap:6px;margin-top:9px}
      #james-context-debug .jcd-b{flex:1;background:rgba(198,168,90,.1);
        border:1px solid rgba(198,168,90,.25);color:#c6a85a;border-radius:6px;
        padding:5px;font-size:10px;cursor:pointer;font-family:inherit}
      #james-context-debug .jcd-b:hover{background:rgba(198,168,90,.22)}
    `;
    document.head.appendChild(s);
  }

  function createPanel() {
    if (_panel || !document.body) return;
    injectCSS();
    const p = document.createElement('div');
    p.id = 'james-context-debug';
    p.innerHTML =
      '<div class="jcd-head">' +
        '<span class="jcd-dot"></span>' +
        '<span class="jcd-ttl">JAMES · VENDO A TELA</span>' +
        '<button class="jcd-tg" title="Minimizar">—</button>' +
      '</div>' +
      '<div class="jcd-body" id="jcd-body"></div>';
    document.body.appendChild(p);
    _panel = p;

    p.querySelector('.jcd-tg').addEventListener('click', () => {
      _collapsed = !_collapsed;
      p.classList.toggle('jcd-collapsed', _collapsed);
      p.querySelector('.jcd-tg').textContent = _collapsed ? '+' : '—';
    });

    // arrastar pela barra de título
    let drag = false, ox = 0, oy = 0;
    const head = p.querySelector('.jcd-head');
    head.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('jcd-tg')) return;
      drag = true; ox = e.clientX - p.offsetLeft; oy = e.clientY - p.offsetTop;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      p.style.left = (e.clientX - ox) + 'px';
      p.style.top  = (e.clientY - oy) + 'px';
      p.style.right = 'auto'; p.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => { drag = false; });

    _renderDebugPanel();
  }

  function _renderDebugPanel() {
    if (!_panel) return;
    const body = _panel.querySelector('#jcd-body');
    if (!body) return;
    const c = getContext();

    const ent = c.selectedEntity
      ? '<span class="jcd-v jcd-ent">' + c.selectedEntity.type + ' · ' +
        c.selectedEntity.name + '</span>'
      : '<span class="jcd-v jcd-nul">nenhuma</span>';
    const tab = c.currentTab
      ? '<span class="jcd-v">' + c.currentTab + '</span>'
      : '<span class="jcd-v jcd-nul">—</span>';
    const act = c.lastUserAction
      ? '<span class="jcd-v jcd-act">' + c.lastUserAction.type + '</span>'
      : '<span class="jcd-v jcd-nul">—</span>';
    const scr = c.uploadedScreenshots.length
      ? '<span class="jcd-v jcd-warn">' + c.uploadedScreenshots.length +
        ' print(s) temporário(s)</span>'
      : '<span class="jcd-v jcd-nul">nenhum</span>';
    const nav = c.recentNavigation.slice(-5).reverse()
      .map(n => n.module + ' <span class="jcd-np">[' + n.page + ']</span>')
      .join('<br>') || '<span class="jcd-nul">sem histórico</span>';

    body.innerHTML =
      '<div class="jcd-r"><span class="jcd-k">Módulo</span><span class="jcd-v jcd-mod">' + c.currentModule + '</span></div>' +
      '<div class="jcd-r"><span class="jcd-k">Página</span><span class="jcd-v">' + c.currentPage + '</span></div>' +
      '<div class="jcd-r"><span class="jcd-k">Aba</span>' + tab + '</div>' +
      '<div class="jcd-r"><span class="jcd-k">Entidade</span>' + ent + '</div>' +
      '<div class="jcd-r"><span class="jcd-k">Última ação</span>' + act + '</div>' +
      '<div class="jcd-r"><span class="jcd-k">Prints</span>' + scr + '</div>' +
      '<div class="jcd-sep"></div>' +
      '<div class="jcd-r" style="flex-direction:column;gap:4px">' +
        '<span class="jcd-k">Histórico</span>' +
        '<div class="jcd-nav">' + nav + '</div>' +
      '</div>' +
      '<div class="jcd-sep"></div>' +
      '<div class="jcd-r"><span class="jcd-k">Interações</span><span class="jcd-v">' +
        c.jamesMemorySession.interactions + '</span></div>' +
      '<div class="jcd-btns">' +
        '<button class="jcd-b" data-jcd="reset">Reset Sessão</button>' +
        '<button class="jcd-b" data-jcd="purge">Limpar Prints</button>' +
      '</div>';

    body.querySelector('[data-jcd="reset"]').onclick = clearSession;
    body.querySelector('[data-jcd="purge"]').onclick = purgeScreenshots;
  }

  function showDebug() {
    if (!_panel) createPanel();
    _collapsed = false;
    if (_panel) {
      _panel.classList.remove('jcd-collapsed');
      _panel.querySelector('.jcd-tg').textContent = '—';
    }
    _renderDebugPanel();
  }
  function hideDebug() {
    if (_panel) { _panel.classList.add('jcd-collapsed'); _collapsed = true; }
  }
  function toggleDebug() { _collapsed ? showDebug() : hideDebug(); }

  /* ===================================================================
     12 · BOOT
     =================================================================== */
  function boot() {
    setupClickDelegation();
    setupObservers();
    syncFromDOM();
    // painel some discreto no canto; abre com __jamesContext.showDebug()
    setTimeout(createPanel, 400);

    // o James avisa quando o Chefe fala/escreve com ele
    window.addEventListener('fly:james-message', (e) => {
      _state.jamesMemorySession.interactions++;
      _state.lastUserAction = {
        type: 'james_message',
        text: (e.detail && e.detail.text ? String(e.detail.text) : '').slice(0, 100),
        at: Date.now(),
      };
      emit();
    });

    console.log('[JAMES Context] ✅ online — o James está vendo a tela do Chefe.');
  }

  /* ===================================================================
     13 · API PÚBLICA
     =================================================================== */
  window.__jamesContext = {
    getContext,
    update,
    trackNavigation,
    trackEntity,
    trackTab,
    trackAction,
    addScreenshot,
    getScreenshotsRaw,
    purgeScreenshots,
    addSessionNote,
    clearSession,
    onUpdate,
    useJamesContext,
    showDebug,
    hideDebug,
    toggleDebug,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
