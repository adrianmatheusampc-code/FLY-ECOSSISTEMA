/* =====================================================================
   FLY MEDIA — Upload por LINK (tira mídia do localStorage)
   Versão 1.0 · FLY Ecossistema

   PROBLEMA QUE RESOLVE:
   o app guardava foto/vídeo/PDF como base64 dentro do localStorage
   (~5 MB de teto). Agora a mídia vai pra nuvem e o app guarda só a URL.

   ROTEAMENTO:
   - Imagens → Cloudinary (unsigned upload, comprime/otimiza sozinho)
   - PDF / vídeo-arquivo → Supabase Storage (bucket fly-media)
   - Vídeo pesado → link YouTube/Vimeo (toEmbed)

   API · window.__flyMedia
     uploadImage(file)            → Promise<url>   (Cloudinary)
     uploadToStorage(file, opts)  → Promise<url>   (Supabase Storage)
     upload(file)                 → Promise<{url,type,provider}>
     optimize(url)                → url (injeta f_auto,q_auto no Cloudinary)
     toEmbed(url)                 → url de embed (YouTube/Vimeo) | null
     isEmbedUrl(s) / isDataUrl(s) / isHttpUrl(s) → boolean
     migrate({onProgress})        → Promise<report>  (base64 → link)
   ===================================================================== */
(function flyMediaBoot() {
  'use strict';
  if (window.__flyMedia) return;

  /* =================================================================
     1 · CONFIG
     ================================================================= */
  const CFG = {
    cloudinary: {
      cloudName: 'dacoj1w24',
      uploadPreset: 'ecossistema',
      get imgEndpoint() {
        return `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
      },
      get autoEndpoint() {
        return `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`;
      },
    },
    supabase: {
      url: 'https://ezfmvblirhmootdvqmsr.supabase.co',
      anonKey: 'sb_publishable_4OChxaBFpGLW8crLQJGzxQ_HiSPmJ6t',
      bucket: 'fly-media',
    },
    maxStorageFileMB: 50, // teto p/ Supabase Storage (vídeo/PDF)
  };

  /* =================================================================
     2 · UTILS
     ================================================================= */
  function isDataUrl(s)  { return typeof s === 'string' && /^data:[^;]+;base64,/.test(s); }
  function isHttpUrl(s)  { return typeof s === 'string' && /^https?:\/\//.test(s); }
  function uid()         { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function slug(str) {
    return String(str || 'file')
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  // data:URL → Blob (pra migração)
  function dataUrlToBlob(dataUrl) {
    const [head, b64] = String(dataUrl).split(',');
    const mime = (head.match(/data:([^;]+)/) || [, 'application/octet-stream'])[1];
    const bin = atob(b64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* =================================================================
     3 · CLOUDINARY (imagens) — unsigned upload
     ================================================================= */
  // Injeta otimização automática: Cloudinary serve WebP/AVIF comprimido.
  function optimize(url) {
    if (!url || !/res\.cloudinary\.com/.test(url)) return url;
    if (/\/upload\/(f_auto|q_auto)/.test(url)) return url; // já otimizado
    return url.replace('/upload/', '/upload/f_auto,q_auto/');
  }

  async function uploadImage(file) {
    if (!file) throw new Error('sem arquivo');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CFG.cloudinary.uploadPreset);
    fd.append('folder', 'fly');
    const r = await fetch(CFG.cloudinary.imgEndpoint, { method: 'POST', body: fd });
    if (!r.ok) {
      let info = ''; try { info = (await r.text()).slice(0, 240); } catch (e) {}
      throw new Error(`Cloudinary ${r.status}: ${info}`);
    }
    const j = await r.json();
    if (!j.secure_url) throw new Error('Cloudinary sem secure_url');
    return optimize(j.secure_url);
  }

  /* =================================================================
     4 · SUPABASE STORAGE (PDF / vídeo-arquivo)
     ================================================================= */
  let _supa = null;
  function supa() {
    if (_supa) return _supa;
    if (!window.supabase || !window.supabase.createClient) return null;
    // Mesmo storageKey do app → reaproveita a sessão logada (uploads autenticados)
    _supa = window.supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fly-supa-auth' },
    });
    return _supa;
  }

  async function uploadToStorage(file, opts = {}) {
    if (!file) throw new Error('sem arquivo');
    const mb = file.size / (1024 * 1024);
    if (mb > CFG.maxStorageFileMB) {
      throw new Error(`Arquivo grande demais (${mb.toFixed(0)}MB · máx ${CFG.maxStorageFileMB}MB). Use link do YouTube/Vimeo pra vídeo.`);
    }
    const client = supa();
    if (!client) throw new Error('Supabase indisponível');
    const folder = opts.folder || 'docs';
    const path = `${folder}/${uid()}-${slug(file.name || 'arquivo')}`;
    const { error } = await client.storage
      .from(CFG.supabase.bucket)
      .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if (error) throw new Error('Supabase Storage: ' + (error.message || error));
    const { data } = client.storage.from(CFG.supabase.bucket).getPublicUrl(path);
    if (!data || !data.publicUrl) throw new Error('Storage sem publicUrl');
    return data.publicUrl;
  }

  /* =================================================================
     5 · UPLOAD AUTO-ROTEADO
     ================================================================= */
  async function upload(file) {
    if (!file) throw new Error('sem arquivo');
    const t = file.type || '';
    if (t.startsWith('image/')) {
      return { url: await uploadImage(file), type: 'image', provider: 'cloudinary' };
    }
    if (t === 'application/pdf') {
      return { url: await uploadToStorage(file, { folder: 'pdf' }), type: 'pdf', provider: 'supabase' };
    }
    if (t.startsWith('video/')) {
      return { url: await uploadToStorage(file, { folder: 'video' }), type: 'video', provider: 'supabase' };
    }
    return { url: await uploadToStorage(file, { folder: 'misc' }), type: 'file', provider: 'supabase' };
  }

  /* =================================================================
     6 · VÍDEO POR LINK (YouTube / Vimeo)
     ================================================================= */
  function toEmbed(url) {
    if (!url) return null;
    const s = String(url).trim();
    let m;
    if ((m = s.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i)))
      return `https://www.youtube.com/embed/${m[1]}`;
    if ((m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i)))
      return `https://player.vimeo.com/video/${m[1]}`;
    if (/player\.vimeo\.com|youtube\.com\/embed/i.test(s)) return s; // já é embed
    return null;
  }
  function isEmbedUrl(s) { return !!toEmbed(s); }

  function videoEmbedHTML(url, attrs = '') {
    const e = toEmbed(url);
    if (!e) return '';
    return `<iframe src="${e}" ${attrs} frameborder="0" ` +
           `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
           `allowfullscreen style="width:100%;height:100%;border:0;border-radius:inherit;"></iframe>`;
  }

  /* =================================================================
     7 · MIGRAÇÃO base64 → link
     Varre o localStorage, acha strings data:image/ e data:video/,
     sobe pra nuvem e troca pela URL. Roda no navegador do Chefe
     (precisa estar logado p/ os dados estarem carregados).
     ================================================================= */
  async function _walkAndUpload(node, stats, onProgress) {
    if (typeof node === 'string') {
      if (isDataUrl(node) && /^data:(image|video)\//.test(node)) {
        stats.found++;
        try {
          const blob = dataUrlToBlob(node);
          const ext = (blob.type.split('/')[1] || 'bin').split('+')[0];
          const f = new File([blob], `migrado-${uid()}.${ext}`, { type: blob.type });
          const isImg = blob.type.startsWith('image/');
          const url = isImg ? await uploadImage(f) : await uploadToStorage(f, { folder: 'video' });
          stats.migrated++;
          stats.bytesSaved += node.length;
          onProgress && onProgress({ ...stats });
          return url;
        } catch (e) {
          stats.failed++;
          console.warn('[FlyMedia] migração falhou num item:', e.message);
          onProgress && onProgress({ ...stats });
          return node; // mantém base64 se falhar (não perde nada)
        }
      }
      return node;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = await _walkAndUpload(node[i], stats, onProgress);
      return node;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) node[k] = await _walkAndUpload(node[k], stats, onProgress);
      return node;
    }
    return node;
  }

  async function migrate(opts = {}) {
    const onProgress = opts.onProgress || null;
    const stats = { keys: 0, found: 0, migrated: 0, failed: 0, bytesSaved: 0 };
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));

    for (const key of keys) {
      let raw;
      try { raw = localStorage.getItem(key); } catch (e) { continue; }
      if (!raw || raw.indexOf('data:image/') === -1 && raw.indexOf('data:video/') === -1) continue;

      stats.keys++;
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (e) {
        // valor é a própria data:URL crua (não-JSON)
        if (isDataUrl(raw)) {
          const newVal = await _walkAndUpload(raw, stats, onProgress);
          if (newVal !== raw) { try { localStorage.setItem(key, newVal); } catch (e2) {} }
        }
        continue;
      }
      const migrated = await _walkAndUpload(parsed, stats, onProgress);
      try { localStorage.setItem(key, JSON.stringify(migrated)); } catch (e) {}
    }
    console.log('[FlyMedia] Migração concluída:', stats);
    return stats;
  }

  /* -----------------------------------------------------------------
     AUTO-SWEEP · migração SILENCIOSA em background (sem botão)
     Roda sozinha: ao carregar, após uploads e periodicamente.
     Só age se houver base64 sobrando. Seguro contra corrida:
     relê a chave antes de gravar e pula se o app mexeu nela.
     ----------------------------------------------------------------- */
  let _sweeping = false;
  function _hasBase64Anywhere() {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      let v; try { v = localStorage.getItem(k); } catch (e) { continue; }
      if (v && (v.indexOf('data:image/') !== -1 || v.indexOf('data:video/') !== -1)) return true;
    }
    return false;
  }

  async function autoSweep() {
    if (_sweeping) return null;
    if (!navigator.onLine) return null;
    if (!_hasBase64Anywhere()) return null; // nada a fazer (no-op instantâneo)
    _sweeping = true;
    const stats = { keys: 0, found: 0, migrated: 0, failed: 0, bytesSaved: 0 };
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));

      for (const key of keys) {
        let rawBefore;
        try { rawBefore = localStorage.getItem(key); } catch (e) { continue; }
        if (!rawBefore ||
            (rawBefore.indexOf('data:image/') === -1 && rawBefore.indexOf('data:video/') === -1)) continue;

        stats.keys++;
        let migratedStr;
        try {
          const parsed = JSON.parse(rawBefore);
          const out = await _walkAndUpload(parsed, stats, null);
          migratedStr = JSON.stringify(out);
        } catch (e) {
          if (isDataUrl(rawBefore)) migratedStr = await _walkAndUpload(rawBefore, stats, null);
          else continue;
        }
        // Guarda anti-corrida: o app pode ter regravado a chave enquanto
        // subíamos. Se mudou, não sobrescreve — próximo sweep pega.
        let rawNow;
        try { rawNow = localStorage.getItem(key); } catch (e) { rawNow = rawBefore; }
        if (rawNow === rawBefore && migratedStr && migratedStr !== rawBefore) {
          try { localStorage.setItem(key, migratedStr); } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 60)); // não trava a UI
      }
      if (stats.migrated) console.log('[FlyMedia] auto-sweep:', stats);
    } finally {
      _sweeping = false;
    }
    return stats;
  }

  let _sweepDebounce = null;
  function scheduleSweep(delay) {
    clearTimeout(_sweepDebounce);
    _sweepDebounce = setTimeout(() => { autoSweep(); }, delay || 4000);
  }

  function setupAutoSweep() {
    // 1) pouco depois do app carregar (deixa assentar)
    setTimeout(() => autoSweep(), 7000);
    // 2) depois de qualquer upload (caso o fallback base64 tenha disparado)
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'file') scheduleSweep(6000);
    }, true);
    // 3) ronda leve periódica — no-op instantâneo se não houver base64
    setInterval(() => { if (!_sweeping) autoSweep(); }, 90000);
    // 4) volta a varrer quando a conexão voltar
    window.addEventListener('online', () => scheduleSweep(3000));
  }

  /* =================================================================
     8 · COLAR IMAGEM (Ctrl+V) → upload
     Igual ao Claude: copia imagem do Google/qualquer lugar e cola.
     A imagem colada é injetada no MESMO input que o Chefe clicou,
     e dispara o 'change' — reaproveita TODO o pipeline existente
     (que já manda pro Cloudinary).
     ================================================================= */
  let _lastFileInput = null;
  let _lastFileInputAt = 0;
  const FRESH_MS = 3 * 60 * 1000; // alvo "fresco" por 3 min após o clique

  function _acceptsImage(input) {
    const acc = (input.getAttribute('accept') || '').toLowerCase();
    return !acc || acc.indexOf('image') !== -1 || acc.indexOf('*') !== -1;
  }

  // Captura QUALQUER clique em input[type=file] (inclusive .click()
  // disparado por botões 📷) — fase de captura pega antes de tudo.
  function _trackFileInputs() {
    document.addEventListener('click', (e) => {
      const inp = e.target && e.target.closest && e.target.closest('input[type="file"]');
      if (inp && _acceptsImage(inp)) {
        _lastFileInput = inp;
        _lastFileInputAt = Date.now();
      }
    }, true);
  }

  function _resolveTargetInput() {
    // 1) o input que o Chefe clicou há pouco (mais confiável)
    if (_lastFileInput &&
        document.contains(_lastFileInput) &&
        !_lastFileInput.disabled &&
        (Date.now() - _lastFileInputAt) < FRESH_MS &&
        _acceptsImage(_lastFileInput)) {
      return _lastFileInput;
    }
    // 2) fallback: input de imagem dentro de um modal/overlay aberto
    const open = document.querySelector(
      '.modal:not(.hidden), .cofre-overlay:not(.hidden), .dash-overlay:not(.hidden), ' +
      '[class*="modal"]:not(.hidden), [class*="overlay"]:not(.hidden)'
    );
    if (open) {
      const inputs = open.querySelectorAll('input[type="file"]');
      for (let i = inputs.length - 1; i >= 0; i--) {
        if (_acceptsImage(inputs[i])) return inputs[i];
      }
    }
    return null;
  }

  // Toast simples (feedback do colar)
  let _toastEl = null;
  function toast(msg, kind) {
    if (!_toastEl) {
      const st = document.createElement('style');
      st.textContent =
        '#flymedia-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%)' +
        ' translateY(20px);background:rgba(10,12,20,.96);color:#ecd9a6;' +
        'border:1px solid rgba(198,168,90,.4);border-radius:30px;padding:10px 20px;' +
        "font:600 13px/1 'SF Pro Text',system-ui,sans-serif;z-index:2147483646;" +
        'box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;pointer-events:none;' +
        'transition:opacity .2s,transform .2s;backdrop-filter:blur(10px)}' +
        '#flymedia-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}' +
        '#flymedia-toast.warn{border-color:#ffb347;color:#ffb347}' +
        '#flymedia-toast.err{border-color:#ff7676;color:#ff7676}';
      document.head.appendChild(st);
      _toastEl = document.createElement('div');
      _toastEl.id = 'flymedia-toast';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.className = (kind === 'warn' ? 'warn' : kind === 'err' ? 'err' : '') + ' on';
    clearTimeout(_toastEl._t);
    _toastEl._t = setTimeout(() => { _toastEl.className = _toastEl.className.replace('on', '').trim(); }, 3200);
  }

  function setupPasteUpload() {
    _trackFileInputs();
    document.addEventListener('paste', (e) => {
      const cd = e.clipboardData || window.clipboardData;
      if (!cd) return;

      // Extrai imagem do clipboard (bytes reais)
      let blob = null;
      if (cd.items) {
        for (const it of cd.items) {
          if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
            blob = it.getAsFile(); break;
          }
        }
      }
      if (!blob && cd.files && cd.files.length) {
        for (const f of cd.files) {
          if (f.type && f.type.indexOf('image/') === 0) { blob = f; break; }
        }
      }
      if (!blob) return; // sem imagem → deixa o paste normal (texto etc.)

      const target = _resolveTargetInput();
      if (!target) {
        e.preventDefault();
        toast('Clique no botão de foto (📷) primeiro, depois cole (Ctrl+V).', 'warn');
        return;
      }

      e.preventDefault();
      try {
        const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
        const file = new File([blob], `colado-${Date.now()}.${ext}`, { type: blob.type });
        const dt = new DataTransfer();
        dt.items.add(file);
        target.files = dt.files;
        target.dispatchEvent(new Event('input',  { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        toast('📋 Imagem colada — enviando pra nuvem…');
      } catch (err) {
        console.warn('[FlyMedia] paste falhou:', err);
        toast('Não consegui colar aqui. Use o botão 📷 e escolha o arquivo.', 'err');
      }
    });
  }

  /* =================================================================
     9 · API PÚBLICA
     ================================================================= */
  window.__flyMedia = {
    config: CFG,
    uploadImage,
    uploadToStorage,
    upload,
    optimize,
    toEmbed,
    isEmbedUrl,
    videoEmbedHTML,
    isDataUrl,
    isHttpUrl,
    migrate,
    autoSweep,
    toast,
  };

  function _bootFlyMedia() {
    setupPasteUpload();
    setupAutoSweep();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootFlyMedia);
  } else {
    _bootFlyMedia();
  }

  console.log('[FlyMedia] ✅ online — fotos→Cloudinary · PDF/vídeo→Supabase · link YT/Vimeo · colar Ctrl+V · auto-sweep base64 ON');
})();
