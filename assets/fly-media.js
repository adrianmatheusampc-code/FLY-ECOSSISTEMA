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

  /* =================================================================
     8 · API PÚBLICA
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
  };

  console.log('[FlyMedia] ✅ online — fotos→Cloudinary · PDF/vídeo→Supabase · link YT/Vimeo');
})();
