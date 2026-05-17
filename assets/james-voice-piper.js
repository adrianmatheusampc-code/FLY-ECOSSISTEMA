/* =====================================================================
   JAMES VOICE · PIPER TTS (OFFLINE / LOCAL · custo ZERO por caractere)
   Fallback automático quando o ElevenLabs falha ou fica sem cota.

   Roda 100% no navegador via WebAssembly (onnxruntime-web). O modelo
   de voz pt-BR é baixado UMA vez (~60-80MB) e fica em cache no browser
   — depois disso é instantâneo e funciona offline, sem custo nenhum.

   API (espelha __jamesVoiceEleven pra encaixar na mesma cadeia):
     window.__jamesVoicePiper = {
       speak(text, opts)  → Promise<HTMLAudioElement | null>
       stopSpeaking()
       isSupported()      → boolean
       preload(onProg)    → Promise<boolean>  (baixa o modelo antes)
       isReady()          → boolean (modelo já em memória)
       getVoiceId() / setVoiceId(id)
     };
   ===================================================================== */
(function jamesVoicePiperBoot() {
  'use strict';
  if (window.__jamesVoicePiper) return;

  /* ---------------------------------------------------------------
     CONFIG — voz pt-BR masculina (override via localStorage)
     pt_BR-faber-medium  → masculina, qualidade média (boa) · padrão
     pt_BR-edresson-low  → masculina, qualidade baixa (alternativa)
  --------------------------------------------------------------- */
  const DEFAULT_VOICE = 'pt_BR-faber-medium';
  function getVoiceId() { return localStorage.getItem('fly_piper_voice') || DEFAULT_VOICE; }
  function setVoiceId(id) {
    if (id) { localStorage.setItem('fly_piper_voice', id); _session = null; _ready = false; }
  }

  // CDNs ESM tentados em ordem (hedge contra um cair / versão quebrada)
  const LIB_URLS = [
    'https://esm.sh/@mintplex-labs/piper-tts-web@1.0.4',
    'https://esm.sh/@mintplex-labs/piper-tts-web',
    'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web/+esm',
  ];

  let _lib = null;       // módulo Piper carregado
  let _libPromise = null;
  let _session = null;   // TtsSession (mantém modelo quente)
  let _ready = false;    // modelo já carregado em memória
  let _currentAudio = null;

  function isSupported() {
    return typeof WebAssembly === 'object' && typeof URL.createObjectURL === 'function';
  }
  function isReady() { return _ready; }

  /* ---------------------------------------------------------------
     CARREGA A LIB (dynamic import, tenta múltiplos CDNs)
  --------------------------------------------------------------- */
  async function loadLib() {
    if (_lib) return _lib;
    if (_libPromise) return _libPromise;
    _libPromise = (async () => {
      let lastErr;
      for (const url of LIB_URLS) {
        try {
          const mod = await import(/* @vite-ignore */ url);
          if (mod && (mod.predict || mod.TtsSession || (mod.default && mod.default.predict))) {
            _lib = mod.default && mod.default.predict ? mod.default : mod;
            console.log('[JamesVoice Piper] lib carregada de', url);
            return _lib;
          }
        } catch (e) {
          lastErr = e;
          console.warn('[JamesVoice Piper] falhou', url, e && e.message);
        }
      }
      throw lastErr || new Error('Piper lib indisponível');
    })();
    return _libPromise;
  }

  /* ---------------------------------------------------------------
     SESSÃO — baixa o modelo (1x) e mantém quente
  --------------------------------------------------------------- */
  async function ensureSession(onProgress) {
    if (_session && _ready) return _session;
    const lib = await loadLib();
    const voiceId = getVoiceId();
    if (lib.TtsSession) {
      _session = new lib.TtsSession({
        voiceId,
        progress: (p) => {
          // p pode ser número 0-100 ou objeto {loaded,total}
          let pct = null;
          if (typeof p === 'number') pct = Math.round(p);
          else if (p && p.total) pct = Math.round((p.loaded / p.total) * 100);
          if (pct != null && onProgress) onProgress(pct);
        },
        logger: () => {},
      });
      // primeira predição força o download/carga do modelo
      await _session.predict(' ');
      _ready = true;
      return _session;
    }
    // sem TtsSession → usa predict() one-shot (sem cache de modelo em sessão)
    _session = {
      predict: (t) => lib.predict({ text: t, voiceId }, (p) => {
        const pct = typeof p === 'number' ? Math.round(p)
          : (p && p.total ? Math.round((p.loaded / p.total) * 100) : null);
        if (pct != null && onProgress) onProgress(pct);
      }),
    };
    _ready = true;
    return _session;
  }

  async function preload(onProgress) {
    if (!isSupported()) return false;
    try { await ensureSession(onProgress); return true; }
    catch (e) { console.warn('[JamesVoice Piper] preload falhou:', e && e.message); return false; }
  }

  /* ---------------------------------------------------------------
     CACHE de áudio (texto → objectURL) — frases repetidas instantâneas
  --------------------------------------------------------------- */
  const _cache = new Map();
  const CACHE_MAX = 24;
  function cacheKey(t) { return getVoiceId() + '::' + String(t).trim().toLowerCase(); }
  function cacheSet(k, url) {
    if (_cache.size >= CACHE_MAX) {
      const f = _cache.keys().next().value;
      try { URL.revokeObjectURL(_cache.get(f)); } catch (e) {}
      _cache.delete(f);
    }
    _cache.set(k, url);
  }

  /* ---------------------------------------------------------------
     STOP
  --------------------------------------------------------------- */
  function stopSpeaking() {
    if (_currentAudio) {
      try { _currentAudio.pause(); _currentAudio.currentTime = 0; } catch (e) {}
      _currentAudio = null;
    }
  }

  /* ---------------------------------------------------------------
     SPEAK — sintetiza local e toca. Mesma assinatura do Eleven.
  --------------------------------------------------------------- */
  async function speak(text, opts = {}) {
    if (!text || !String(text).trim()) return null;
    if (!isSupported()) { console.warn('[JamesVoice Piper] WASM indisponível'); return null; }

    stopSpeaking();

    const key = cacheKey(text);
    let url = _cache.get(key);

    if (!url) {
      try {
        const session = await ensureSession(opts.onProgress);
        const wav = await session.predict(String(text));
        const blob = (wav instanceof Blob) ? wav : new Blob([wav], { type: 'audio/wav' });
        url = URL.createObjectURL(blob);
        cacheSet(key, url);
      } catch (e) {
        console.warn('[JamesVoice Piper] síntese falhou:', e && e.message || e);
        return null;
      }
    }

    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      _currentAudio = audio;
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        if (_currentAudio === audio) _currentAudio = null;
        try { opts.onEnd && opts.onEnd(audio); } catch (e) {}
        resolve(audio);
      };
      audio.addEventListener('play', () => { try { opts.onStart && opts.onStart(audio); } catch (e) {} }, { once: true });
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      audio.play().catch((e) => { console.warn('[JamesVoice Piper] play bloqueado:', e && e.message); finish(); });
      // rede de segurança
      setTimeout(finish, Math.max(4000, String(text).length * 90));
    });
  }

  window.__jamesVoicePiper = {
    speak,
    stopSpeaking,
    isSupported,
    isReady,
    preload,
    getVoiceId,
    setVoiceId,
  };

  console.log('[JamesVoice Piper] ✅ pronto (offline · custo zero · carrega modelo sob demanda)');
})();
