/* =====================================================================
   JAMES VOICE · INTEGRAÇÃO ELEVENLABS (TTS + STT)

   API pública:
     window.__jamesVoiceEleven = {
       speak(text, opts)        → Promise<HTMLAudioElement | null>
       isAvailable()            → boolean (true se API responde)
       recordAndTranscribe(opts)→ inicia gravação com VAD; resolve com texto
       stopRecording()          → para gravação manual
       isRecording()            → boolean
       clearCache()             → limpa o cache de blobs em memória
     };

   FLUXO:
     1. speak(text)    → POST /api/james/voice → toca mp3 com voz oficial
     2. recordAndTranscribe() → MediaRecorder → POST /api/james/transcribe → texto

   FALLBACK:
     speak() retorna null se ElevenLabs falhar — caller deve cair pro
     SpeechSynthesis do navegador.
   ===================================================================== */
(function jamesVoiceElevenBoot() {
  'use strict';

  if (window.__jamesVoiceEleven) return;

  const TTS_URL = '/api/james/voice';
  const STT_URL = '/api/james/transcribe';

  /* ---------------------------------------------------------------
     STATUS · disponibilidade da API (probe leve)
  --------------------------------------------------------------- */
  let _available = null; // null = unknown, true/false depois do probe
  let _probing = null;
  async function checkAvailable() {
    if (_available !== null) return _available;
    if (_probing) return _probing;
    _probing = (async () => {
      try {
        // probe rápido: chama com texto curto e timeout
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const r = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'ok' }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        _available = r.ok || r.status === 200;
      } catch (e) {
        _available = false;
      }
      _probing = null;
      return _available;
    })();
    return _probing;
  }

  /* ---------------------------------------------------------------
     CACHE de blobs (texto → URL) pra economizar API calls em frases comuns
  --------------------------------------------------------------- */
  const _audioCache = new Map();   // key=textNorm → objectURL
  const CACHE_MAX = 30;

  function cacheKey(text, voiceId) {
    return (voiceId || 'default') + '::' + String(text).trim().toLowerCase();
  }

  function cacheSet(key, url) {
    if (_audioCache.size >= CACHE_MAX) {
      const firstKey = _audioCache.keys().next().value;
      const oldUrl = _audioCache.get(firstKey);
      try { URL.revokeObjectURL(oldUrl); } catch (e) {}
      _audioCache.delete(firstKey);
    }
    _audioCache.set(key, url);
  }

  function clearCache() {
    for (const url of _audioCache.values()) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }
    _audioCache.clear();
  }

  /* ---------------------------------------------------------------
     SPEAK · chama backend, toca mp3, resolve quando termina
  --------------------------------------------------------------- */
  let _currentAudio = null;
  let _currentResolve = null;

  function stopCurrent() {
    if (_currentAudio) {
      try { _currentAudio.pause(); _currentAudio.currentTime = 0; } catch (e) {}
      _currentAudio = null;
    }
    if (_currentResolve) {
      try { _currentResolve(null); } catch (e) {}
      _currentResolve = null;
    }
  }

  async function speak(text, opts = {}) {
    if (!text || !String(text).trim()) return null;
    stopCurrent(); // interrompe áudio anterior

    // Cache hit
    const key = cacheKey(text, opts.voice_id);
    let url = _audioCache.get(key);

    if (!url) {
      try {
        const r = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: String(text),
            voice_id: opts.voice_id,
            model_id: opts.model_id,
            voice_settings: opts.voice_settings,
          }),
        });
        if (!r.ok) {
          let info = '';
          try { info = (await r.text()).slice(0, 200); } catch (e) {}
          console.warn('[JamesVoice] TTS HTTP', r.status, info);
          _available = false;
          return null;
        }
        const blob = await r.blob();
        url = URL.createObjectURL(blob);
        cacheSet(key, url);
        _available = true;
      } catch (e) {
        console.warn('[JamesVoice] TTS fetch falhou:', e?.message || e);
        _available = false;
        return null;
      }
    }

    // Toca
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      _currentAudio = audio;
      _currentResolve = resolve;

      // Hooks pra integrar visual (orbe pulsando, status SPEAKING)
      const onStart = () => { try { opts.onStart?.(audio); } catch (e) {} };
      const onEnd   = () => {
        if (_currentAudio === audio) _currentAudio = null;
        if (_currentResolve === resolve) _currentResolve = null;
        try { opts.onEnd?.(audio); } catch (e) {}
        resolve(audio);
      };
      audio.addEventListener('play',  onStart, { once: true });
      audio.addEventListener('ended', onEnd,   { once: true });
      audio.addEventListener('error', () => {
        console.warn('[JamesVoice] Audio playback error');
        onEnd();
      }, { once: true });

      audio.play().catch((e) => {
        // Autoplay bloqueado: usuário precisa ter interagido com a página
        console.warn('[JamesVoice] play() bloqueado:', e?.message || e);
        onEnd();
      });

      // Fallback timer: garante resolver mesmo se 'ended' não disparar
      const fallbackMs = Math.max(2500, String(text).length * 80);
      setTimeout(() => { if (_currentAudio === audio) onEnd(); }, fallbackMs);
    });
  }

  /* ---------------------------------------------------------------
     STT · grava com VAD (voice activity detection) + transcreve
  --------------------------------------------------------------- */
  let _recState = {
    recorder:  null,
    stream:    null,
    audioCtx:  null,
    analyser:  null,
    chunks:    [],
    isActive:  false,
    silenceMs: 0,
    raf:       0,
    onLevel:   null, // callback de volume (0..1) pra o orbe
  };

  function isRecording() { return _recState.isActive; }

  function _cleanupRecording() {
    if (_recState.raf) cancelAnimationFrame(_recState.raf);
    _recState.raf = 0;
    try { _recState.recorder?.stream?.getTracks?.().forEach(t => t.stop()); } catch (e) {}
    try { _recState.stream?.getTracks?.().forEach(t => t.stop()); } catch (e) {}
    try { _recState.audioCtx?.close?.(); } catch (e) {}
    _recState.recorder  = null;
    _recState.stream    = null;
    _recState.audioCtx  = null;
    _recState.analyser  = null;
    _recState.chunks    = [];
    _recState.isActive  = false;
    _recState.silenceMs = 0;
  }

  function stopRecording() {
    if (_recState.recorder && _recState.recorder.state !== 'inactive') {
      try { _recState.recorder.stop(); } catch (e) {}
    } else {
      _cleanupRecording();
    }
  }

  /**
   * recordAndTranscribe(opts)
   *   opts.maxMs           → tempo máximo de gravação (default 30000)
   *   opts.silenceMs       → ms de silêncio pra encerrar (default 1500)
   *   opts.silenceThreshold→ threshold de RMS (0..1, default 0.015)
   *   opts.onLevel(v)      → callback do volume (0..1) — pra animar orbe
   *   opts.onStatus(s)     → 'recording' | 'transcribing' | 'done' | 'error'
   *   opts.languageCode    → ISO 639-3 (default 'por' = pt-BR)
   *   opts.modelId         → default 'scribe_v1'
   *
   * Retorna Promise<{ text, language_code }>
   */
  async function recordAndTranscribe(opts = {}) {
    if (_recState.isActive) {
      throw new Error('Já está gravando.');
    }

    const maxMs            = opts.maxMs            || 30000;
    const silenceMsTarget  = opts.silenceMs        || 1500;
    const silenceThreshold = opts.silenceThreshold || 0.015;
    const onLevel          = opts.onLevel  || null;
    const onStatus         = opts.onStatus || null;
    const languageCode     = opts.languageCode || 'por';
    const modelId          = opts.modelId      || 'scribe_v1';

    // 1) Pede permissão e abre stream
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      onStatus?.('error');
      throw new Error('Permissão de microfone negada.');
    }

    // 2) Decide o melhor MIME suportado
    const candidateMimes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    const mimeType = candidateMimes.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    // 3) VAD via AnalyserNode
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    _recState = { recorder, stream, audioCtx, analyser, chunks, isActive: true, silenceMs: 0, raf: 0, onLevel };

    onStatus?.('recording');
    recorder.start(250); // grava em chunks de 250ms

    const startedAt = performance.now();

    return new Promise((resolve, reject) => {
      let resolved = false;
      function safeResolve(v) { if (!resolved) { resolved = true; resolve(v); } }
      function safeReject(e)  { if (!resolved) { resolved = true; reject(e); } }

      function tick() {
        if (!_recState.isActive) return;
        analyser.getByteTimeDomainData(data);
        // RMS aproximado
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        if (onLevel) try { onLevel(Math.min(1, rms * 4)); } catch (e) {}

        const elapsed = performance.now() - startedAt;
        if (rms < silenceThreshold) _recState.silenceMs += 16;
        else _recState.silenceMs = 0;

        if (elapsed > maxMs || (_recState.silenceMs > silenceMsTarget && elapsed > 800)) {
          // Encerra: precisa de pelo menos 800ms de áudio antes de aceitar silêncio
          stopRecording();
          return;
        }
        _recState.raf = requestAnimationFrame(tick);
      }
      tick();

      recorder.onstop = async () => {
        if (resolved) { _cleanupRecording(); return; }
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          _cleanupRecording();
          if (blob.size < 1024) {
            onStatus?.('error');
            return safeReject(new Error('Áudio muito curto.'));
          }
          onStatus?.('transcribing');
          const url = `${STT_URL}?model_id=${encodeURIComponent(modelId)}&language_code=${encodeURIComponent(languageCode)}`;
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'audio/webm' },
            body: blob,
          });
          if (!r.ok) {
            let info = ''; try { info = (await r.text()).slice(0, 200); } catch (e) {}
            onStatus?.('error');
            return safeReject(new Error(`STT HTTP ${r.status}: ${info}`));
          }
          const json = await r.json();
          onStatus?.('done');
          safeResolve({ text: String(json.text || '').trim(), language_code: json.language_code || languageCode });
        } catch (e) {
          onStatus?.('error');
          safeReject(e);
        }
      };

      recorder.onerror = (e) => {
        _cleanupRecording();
        onStatus?.('error');
        safeReject(new Error('MediaRecorder error: ' + (e?.error?.message || 'unknown')));
      };
    });
  }

  /* ---------------------------------------------------------------
     API PÚBLICA
  --------------------------------------------------------------- */
  window.__jamesVoiceEleven = {
    speak,
    stopSpeaking: stopCurrent,
    isAvailable: () => _available,
    checkAvailable,
    recordAndTranscribe,
    stopRecording,
    isRecording,
    clearCache,
  };

  console.log('[JamesVoice ElevenLabs] Online. TTS + STT prontos.');
})();
