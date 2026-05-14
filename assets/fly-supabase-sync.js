// FLY · Sync localStorage ↔ Supabase
// Importa supabase-js direto do ESM CDN.
// Uso: configurar URL + anon key via UI; depois chamar window.__flySync.pullAll() e push() automático.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STATUS = {
  client: null,
  online: false,
  url: '',
  anonKey: '',
  lastError: null,
  lastSync: 0
};

const TABLES = [
  { name: 'partners',          lsKey: 'fly_partners_v1' },
  { name: 'wallets',           lsKey: 'fly_wallets_v1',           modeAware: true },
  { name: 'money_movements',   lsKey: 'fly_moves_v1',             modeAware: true },
  { name: 'customers',         lsKey: 'fly_customers_v1',         modeAware: true },
  { name: 'sales',             lsKey: 'fly_sales_v1',             modeAware: true },
  { name: 'fly_cup_polos',     lsKey: 'fly_cup_polos_v1',         modeAware: true },
  { name: 'fly_cup_eventos',   lsKey: 'fly_cup_eventos_v1',       modeAware: true },
  { name: 'fly_cup_atletas',   lsKey: 'fly_cup_atletas_v1',       modeAware: true },
  { name: 'war_territories',   lsKey: 'fly_war_territories_v1',   modeAware: true },
  { name: 'war_connections',   lsKey: 'fly_war_connections_v1',   modeAware: true }
];

function getMode() {
  return localStorage.getItem('fly_data_mode') || 'demo';
}

function fullKey(lsKey, modeAware) {
  if (!modeAware) return lsKey;
  return `${lsKey}_${getMode()}`;
}

function readLocal(lsKey, modeAware) {
  try {
    const raw = localStorage.getItem(fullKey(lsKey, modeAware));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function writeLocal(lsKey, modeAware, data) {
  try {
    localStorage.setItem(fullKey(lsKey, modeAware), JSON.stringify(data));
    // dispara evento pra UI refrescar
    window.dispatchEvent(new CustomEvent('fly:sync-update', { detail: { lsKey, count: data.length } }));
  } catch (e) {
    console.error('[FlySync] writeLocal error:', e);
  }
}

function loadConfig() {
  try {
    const raw = localStorage.getItem('fly_supabase_config');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveConfig(url, anonKey) {
  localStorage.setItem('fly_supabase_config', JSON.stringify({ url, anonKey }));
}

async function init({ url, anonKey } = {}) {
  if (!url || !anonKey) {
    const cfg = loadConfig();
    if (cfg) { url = cfg.url; anonKey = cfg.anonKey; }
  }
  if (!url || !anonKey) {
    STATUS.online = false;
    renderIndicator();
    return false;
  }
  try {
    STATUS.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    STATUS.url = url;
    STATUS.anonKey = anonKey;
    STATUS.online = true;
    saveConfig(url, anonKey);
    renderIndicator();
    // pull inicial
    await pullAll();
    // subscribe realtime
    subscribeAll();
    return true;
  } catch (e) {
    STATUS.lastError = String(e);
    STATUS.online = false;
    renderIndicator();
    return false;
  }
}

async function pullTable(t) {
  if (!STATUS.client) return;
  try {
    const { data, error } = await STATUS.client.from(t.name).select('*');
    if (error) throw error;
    // se mode-aware, filtra pelo modo atual
    let rows = data || [];
    if (t.modeAware) rows = rows.filter(r => !r.data_mode || r.data_mode === getMode());
    writeLocal(t.lsKey, t.modeAware, rows);
  } catch (e) {
    console.warn('[FlySync] pull', t.name, e?.message || e);
  }
}

async function pullAll() {
  if (!STATUS.client) return;
  await Promise.all(TABLES.map(pullTable));
  STATUS.lastSync = Date.now();
  renderIndicator();
}

async function push(tableName, record) {
  const t = TABLES.find(x => x.name === tableName);
  if (!t) return null;
  // sempre escreve local primeiro
  const local = readLocal(t.lsKey, t.modeAware);
  const idx = local.findIndex(r => r.id === record.id);
  if (idx >= 0) local[idx] = record;
  else local.unshift(record);
  writeLocal(t.lsKey, t.modeAware, local);
  // server
  if (!STATUS.client || !STATUS.online) return record;
  try {
    const payload = t.modeAware ? { ...record, data_mode: getMode() } : record;
    const { data, error } = await STATUS.client.from(t.name).upsert(payload).select().single();
    if (error) throw error;
    return data || record;
  } catch (e) {
    console.warn('[FlySync] push', tableName, e?.message || e);
    return record;
  }
}

async function pushAll() {
  if (!STATUS.client) return;
  for (const t of TABLES) {
    const local = readLocal(t.lsKey, t.modeAware);
    if (!local.length) continue;
    try {
      const payload = t.modeAware ? local.map(r => ({ ...r, data_mode: getMode() })) : local;
      await STATUS.client.from(t.name).upsert(payload);
    } catch (e) {
      console.warn('[FlySync] pushAll', t.name, e?.message || e);
    }
  }
  STATUS.lastSync = Date.now();
  renderIndicator();
}

function subscribeAll() {
  if (!STATUS.client) return;
  TABLES.forEach(t => {
    try {
      STATUS.client
        .channel(`realtime:${t.name}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: t.name }, () => {
          pullTable(t);
        })
        .subscribe();
    } catch (e) {
      console.warn('[FlySync] subscribe', t.name, e?.message || e);
    }
  });
}

/* ===== UI: indicador + modal de configuração ===== */
function renderIndicator() {
  let el = document.getElementById('flySyncIndicator');
  if (!el) {
    el = document.createElement('button');
    el.id = 'flySyncIndicator';
    el.className = 'fly-sync-indicator';
    el.type = 'button';
    el.addEventListener('click', openConfigModal);
    document.body.appendChild(el);
  }
  el.classList.toggle('online', STATUS.online);
  const ago = STATUS.lastSync ? Math.round((Date.now() - STATUS.lastSync) / 1000) : null;
  el.innerHTML = `
    <span class="fly-sync-dot"></span>
    <span class="fly-sync-label">${STATUS.online ? 'Supabase ON' : 'Supabase OFF'}</span>
    ${ago !== null ? `<span class="fly-sync-meta">${ago}s</span>` : ''}
  `;
}

function openConfigModal() {
  let modal = document.getElementById('flySyncModal');
  if (modal) { modal.classList.remove('hidden'); return; }
  modal = document.createElement('div');
  modal.id = 'flySyncModal';
  modal.className = 'fly-sync-modal';
  const cfg = loadConfig() || {};
  modal.innerHTML = `
    <div class="fly-sync-modal__panel">
      <header>
        <h3>Conectar Supabase</h3>
        <button class="fly-sync-modal__close" type="button" aria-label="Fechar">×</button>
      </header>
      <label>Project URL
        <input id="flySyncUrl" type="url" placeholder="https://xxxx.supabase.co" value="${cfg.url || ''}">
      </label>
      <label>Anon Key
        <input id="flySyncKey" type="password" placeholder="eyJhbGciOi..." value="${cfg.anonKey || ''}">
      </label>
      <div class="fly-sync-modal__actions">
        <button class="fly-sync-modal__save" type="button">Conectar</button>
        <button class="fly-sync-modal__pull" type="button">Forçar Pull</button>
        <button class="fly-sync-modal__push" type="button">Forçar Push</button>
        <button class="fly-sync-modal__clear" type="button">Desconectar</button>
      </div>
      <small class="fly-sync-modal__hint">Suas credenciais ficam só no navegador. Schema em <code>db/schema.sql</code>.</small>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.fly-sync-modal__close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  modal.querySelector('.fly-sync-modal__save').addEventListener('click', async () => {
    const url = modal.querySelector('#flySyncUrl').value.trim();
    const key = modal.querySelector('#flySyncKey').value.trim();
    if (!url || !key) return;
    const ok = await init({ url, anonKey: key });
    if (ok) modal.classList.add('hidden');
  });
  modal.querySelector('.fly-sync-modal__pull').addEventListener('click', pullAll);
  modal.querySelector('.fly-sync-modal__push').addEventListener('click', pushAll);
  modal.querySelector('.fly-sync-modal__clear').addEventListener('click', () => {
    localStorage.removeItem('fly_supabase_config');
    STATUS.client = null; STATUS.online = false;
    renderIndicator();
    modal.classList.add('hidden');
  });
}

/* ===== boot ===== */
window.__flySync = {
  init,
  pullAll,
  pushAll,
  push,
  status: () => ({ ...STATUS, mode: getMode() }),
  configure: openConfigModal,
  tables: TABLES.map(t => t.name)
};

// auto-init se já tiver config salva
document.addEventListener('DOMContentLoaded', () => {
  renderIndicator();
  const cfg = loadConfig();
  if (cfg?.url && cfg?.anonKey) init(cfg).catch(console.error);
});

// re-pull quando trocar de modo
window.addEventListener('fly:data-mode-change', () => { if (STATUS.online) pullAll(); });
