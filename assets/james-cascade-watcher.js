/* =====================================================================
   FLY CASCADE WATCHER
   Monkey-patch do localStorage.setItem que intercepta TODAS as escritas
   nas chaves monitoradas, calcula o diff (added/updated/removed) e
   dispara o evento da cascata correto — independente de quem escreveu.

   Funciona para:
     - James API (window.__jamesPanels.*)
     - UI nativa dos painéis (forms HTML)
     - Sync vindo do Supabase
     - Edição manual via console
     - Importação de CSV (futuro)

   PROTEÇÕES:
     - Anti-loop: chaves de OUTPUT da cascata (cockpit, moves, logs)
       não são monitoradas
     - Flag _silent: durante a cascata, escritas internas não re-disparam
     - Diff inteligente: ignora mudanças só de timestamp (updated_at)
     - Idempotência: comparação por id da entidade

   PARA ADICIONAR PAINEL NOVO:
     Basta adicionar uma entrada em WATCHERS = { ... }

   IMPORTANTE: Este script DEVE carregar ANTES de qualquer outro
   que escreva no localStorage.
   ===================================================================== */
(function flyCascadeWatcher() {
  'use strict';

  if (window.__flyCascadeWatcherInstalled) return;
  window.__flyCascadeWatcherInstalled = true;

  // IMPORTANTE: outro script (indicador de uso de storage) sobrescreveu
  // localStorage.setItem direto na instância. Patches no Storage.prototype
  // são ignorados quando a instância tem própria override.
  // Solução: patchar a INSTÂNCIA também (capturando o setItem atual).
  let _silent = false; // anti-loop flag

  /* ---------------------------------------------------------------
     UTILS
  --------------------------------------------------------------- */
  function readJSON(raw) {
    try { return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  // Remove sufixo de modo (_demo, _operational, _goal) pra agrupar chaves
  function getBaseKey(key) {
    return String(key || '').replace(/_(demo|operational|goal)$/, '');
  }

  // Achata estrutura aninhada de hierarquia { '2026': [...], '2027': [...] }
  function flattenHierarchy(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const out = [];
    for (const year of Object.keys(obj)) {
      const arr = obj[year] || [];
      if (Array.isArray(arr)) {
        arr.forEach(emp => emp && emp.id && out.push({ ...emp, _year: year }));
      }
    }
    return out;
  }

  // Compara dois objetos ignorando campos voláteis (timestamps, sync flags)
  const VOLATILE_FIELDS = new Set([
    'updated_at', 'lastModified', '_ts', '_lastUpdated', '_synced_at',
    'created_at',  // criado_at não muda em update; se mudou, é entidade diferente
  ]);
  function clean(o) {
    if (!o || typeof o !== 'object') return o;
    const c = { ...o };
    VOLATILE_FIELDS.forEach(k => delete c[k]);
    return c;
  }
  function hasMeaningfulDiff(a, b) {
    return JSON.stringify(clean(a)) !== JSON.stringify(clean(b));
  }

  // Diff genérico de array por id
  function diffArrayById(oldArr, newArr) {
    const oldList = Array.isArray(oldArr) ? oldArr : [];
    const newList = Array.isArray(newArr) ? newArr : [];
    const oldMap = new Map(oldList.filter(x => x && x.id).map(x => [x.id, x]));
    const newMap = new Map(newList.filter(x => x && x.id).map(x => [x.id, x]));

    const added = [];
    const updated = [];
    const removed = [];

    for (const [id, item] of newMap) {
      const old = oldMap.get(id);
      if (!old) added.push(item);
      else if (hasMeaningfulDiff(old, item)) updated.push({ before: old, after: item });
    }
    for (const [id, item] of oldMap) {
      if (!newMap.has(id)) removed.push(item);
    }
    return { added, updated, removed };
  }

  /* ---------------------------------------------------------------
     EMISSOR (com proteção anti-loop)
  --------------------------------------------------------------- */
  function emitCascade(eventName, payload) {
    if (!window.__flyCascade?.emit) return;
    try {
      _silent = true;
      window.__flyCascade.emit(eventName, payload);
    } catch (e) {
      console.error('[Cascade Watcher] erro emitindo', eventName, e);
    } finally {
      _silent = false;
    }
  }

  /* ---------------------------------------------------------------
     WATCHERS · 1 handler por chave-base
     Para adicionar painel novo, basta criar entry aqui.
  --------------------------------------------------------------- */
  const WATCHERS = {

    // Hierarquia (estrutura aninhada por ano)
    'fly_hierarquia_inline_v1': (oldVal, newVal) => {
      const oldEmps = flattenHierarchy(oldVal);
      const newEmps = flattenHierarchy(newVal);
      const diff = diffArrayById(oldEmps, newEmps);
      diff.added.forEach(emp => emitCascade('fly:employee-created', emp));
      diff.updated.forEach(d => emitCascade('fly:employee-updated', d));
      diff.removed.forEach(emp => emitCascade('fly:employee-deleted', emp));
    },

    // Bases (array simples)
    'fly_basesfly_pins_v2': (oldVal, newVal) => {
      const diff = diffArrayById(oldVal, newVal);
      diff.added.forEach(b => {
        emitCascade('fly:base-created', b);
        if (b.status === 'ativa') emitCascade('fly:base-status-active', b);
      });
      diff.updated.forEach(d => {
        // Mudança de status pra ativa
        if (d.before.status !== 'ativa' && d.after.status === 'ativa') {
          emitCascade('fly:base-status-active', d.after);
        }
        emitCascade('fly:base-updated', d);
      });
      diff.removed.forEach(b => emitCascade('fly:base-deleted', b));
    },

    // Clientes (mode-aware: getBaseKey já remove _demo/_operational/_goal)
    'fly_customers_v1': (oldVal, newVal) => {
      const diff = diffArrayById(oldVal, newVal);
      diff.added.forEach(c => emitCascade('fly:customer-created', c));
      diff.updated.forEach(d => emitCascade('fly:customer-updated', d));
      diff.removed.forEach(c => emitCascade('fly:customer-deleted', c));
    },

    // Vendas (mode-aware) — dispara a cascata de 18 efeitos
    'fly_sales_v1': (oldVal, newVal) => {
      const diff = diffArrayById(oldVal, newVal);
      diff.added.forEach(s => emitCascade('fly:sale-recorded', s));
    },

    // Vendedores (mode-aware)
    'fly_sellers_v1': (oldVal, newVal) => {
      const diff = diffArrayById(oldVal, newVal);
      diff.added.forEach(s => emitCascade('fly:seller-created', s));
      diff.updated.forEach(d => emitCascade('fly:seller-updated', d));
      diff.removed.forEach(s => emitCascade('fly:seller-deleted', s));
    },

    // Influencers (mode-aware)
    'fly_influencers_v1': (oldVal, newVal) => {
      const diff = diffArrayById(oldVal, newVal);
      diff.added.forEach(i => emitCascade('fly:influencer-created', i));
      diff.updated.forEach(d => emitCascade('fly:influencer-updated', d));
      diff.removed.forEach(i => emitCascade('fly:influencer-deleted', i));
    },

    // Metas (mode-aware)
    'fly_metas_v1': (oldVal, newVal) => {
      const diff = diffArrayById(oldVal, newVal);
      diff.added.forEach(m => emitCascade('fly:meta-created', m));
      diff.updated.forEach(d => {
        // Detecta meta batida (status passou pra "batida")
        if (d.before.status !== 'batida' && d.after.status === 'batida') {
          emitCascade('fly:meta-reached', d.after);
        }
        emitCascade('fly:meta-updated', d);
      });
      diff.removed.forEach(m => emitCascade('fly:meta-deleted', m));
    },
  };

  /* ---------------------------------------------------------------
     CHAVES SILENCIOSAS · output da cascata, NUNCA monitorar
  --------------------------------------------------------------- */
  const SILENT_KEYS = new Set([
    'fly_cockpit_metrics_v1',
    'fly_moves_v1',
    'fly_product_metrics_v1',
    'fly_james_logs_v1',
    'fly_james_context_v1',
    'fly_changelog_v1',
    'fly_sync_status_v1',
  ]);

  /* ---------------------------------------------------------------
     MONKEY-PATCH (2 níveis: Storage.prototype + instância localStorage)

     Por quê 2 níveis? Outros scripts do app fizeram override DIRETO
     em localStorage.setItem (não no prototype). Propriedades de
     instância têm precedência sobre prototype, então o patch só no
     prototype é silenciosamente ignorado para localStorage.
  --------------------------------------------------------------- */
  function makeWrapped(origSetItem, isInstance) {
    return function(key, value) {
      // Resolve "this" — se for chamada de instância, this===localStorage
      const target = isInstance ? window.localStorage : this;

      // Só intercepta localStorage
      if (target !== window.localStorage) {
        return origSetItem.call(target, key, value);
      }

      // Anti-loop
      if (_silent) {
        return origSetItem.call(target, key, value);
      }

      const baseKey = getBaseKey(key);

      // Chaves de output da cascata: escreve direto
      if (SILENT_KEYS.has(baseKey)) {
        return origSetItem.call(target, key, value);
      }

      const watcher = WATCHERS[baseKey];
      if (!watcher) {
        return origSetItem.call(target, key, value);
      }

      // Chave monitorada: captura antes, salva, calcula diff
      let oldVal = null;
      try { oldVal = readJSON(target.getItem(key)); } catch (e) {}

      origSetItem.call(target, key, value);

      const newVal = readJSON(value);
      try {
        watcher(oldVal, newVal);
      } catch (e) {
        console.error('[Cascade Watcher] handler error em', baseKey, e);
      }
    };
  }

  // Patch 1: Storage.prototype.setItem (cobre sessionStorage e localStorage padrão)
  const _origProtoSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = makeWrapped(_origProtoSetItem, false);

  // Patch 2: localStorage.setItem na INSTÂNCIA (caso outro script tenha
  // sobrescrito antes — é o caso do indicador de uso de storage)
  const _origInstSetItem = window.localStorage.setItem.bind(window.localStorage);
  try {
    window.localStorage.setItem = makeWrapped(_origInstSetItem, true);
  } catch (e) {
    console.warn('[Cascade Watcher] não foi possível patchar localStorage.setItem na instância:', e);
  }

  /* ---------------------------------------------------------------
     API PÚBLICA · debug + extensão
  --------------------------------------------------------------- */
  window.__flyCascadeWatcher = {
    monitoredKeys: Object.keys(WATCHERS),
    silentKeys: Array.from(SILENT_KEYS),
    isSilent: () => _silent,

    // Adiciona watcher novo em runtime (pra painéis criados depois)
    register(baseKey, handler) {
      if (typeof handler !== 'function') throw new Error('handler must be function');
      WATCHERS[baseKey] = handler;
      console.log('[Cascade Watcher] watcher registrado:', baseKey);
    },

    // Marca chave como silenciosa (não dispara cascata ao escrever)
    markSilent(baseKey) {
      SILENT_KEYS.add(baseKey);
    },

    // Helpers expostos pra outros watchers usarem
    diffArrayById,
    hasMeaningfulDiff,
    flattenHierarchy,
  };

  console.log('[FLY Cascade Watcher] Online. Monitorando:', Object.keys(WATCHERS).join(', '));
})();
