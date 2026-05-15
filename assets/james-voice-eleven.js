/* =====================================================================
   JAMES VOICE · INTEGRAÇÃO ELEVENLABS (TTS + STT)
   MODO CLIENT-ONLY · sem backend (chama ElevenLabs direto do browser)

   ⚠️  A API key fica visível no código-fonte do site. Se essa chave
       vazar, qualquer pessoa pode usar o crédito da conta. Para
       rotar/atualizar a chave, edite ELEVEN_API_KEY abaixo e faça
       redeploy. Override em runtime via localStorage:
         localStorage.setItem('fly_eleven_key',     'sk_...')
         localStorage.setItem('fly_eleven_voice_id','xxxxxx')

   API pública:
     window.__jamesVoiceEleven = {
       speak(text, opts)         → Promise<HTMLAudioElement | null>
       stopSpeaking()
       isAvailable()             → boolean
       recordAndTranscribe(opts) → Promise<{ text, language_code }>
       stopRecording()
       isRecording()
       clearCache()
       setKey(key, voiceId?)     → atualiza em runtime + localStorage
     };
   ===================================================================== */
(function jamesVoiceElevenBoot() {
  'use strict';

  if (window.__jamesVoiceEleven) return;

  /* ---------------------------------------------------------------
     CONFIG · chave + voice id (hardcoded com override via localStorage)
  --------------------------------------------------------------- */
  const ELEVEN_API_KEY_DEFAULT  = 'sk_4a23b74a2d652a1c3caa7eddc81eff496eb361490022bc77';
  const ELEVEN_VOICE_ID_DEFAULT = 'ZYCQDYoXnl78dNdU6JeG';

  function getKey()     { return localStorage.getItem('fly_eleven_key')      || ELEVEN_API_KEY_DEFAULT; }
  function getVoiceId() { return localStorage.getItem('fly_eleven_voice_id') || ELEVEN_VOICE_ID_DEFAULT; }

  function setKey(key, voiceId) {
    if (key)     localStorage.setItem('fly_eleven_key', key);
    if (voiceId) localStorage.setItem('fly_eleven_voice_id', voiceId);
    _available = null; // força nova checagem
  }

  /* ---------------------------------------------------------------
     ENDPOINTS ElevenLabs
  --------------------------------------------------------------- */
  const TTS_URL = (voiceId) =>
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

  const DEFAULT_MODEL_TTS = 'eleven_flash_v2_5';
  const DEFAULT_MODEL_STT = 'scribe_v1';
  const DEFAULT_LANGUAGE  = 'por'; // ISO 639-3 = pt-BR

  const DEFAULT_VOICE_SETTINGS = {
    stability:        0.45,
    similarity_boost: 0.85,
    style:            0.35,
    use_speaker_boost: true,
  };

  /* ---------------------------------------------------------------
     CACHE de blobs (texto → URL) — economiza chamadas em frases comuns
  --------------------------------------------------------------- */
  const _audioCache = new Map();
  const CACHE_MAX = 30;

  function cacheKey(text, voiceId) {
    return (voiceId || 'default') + '::' + String(text).trim().toLowerCase();
  }
  function cacheSet(key, url) {
    if (_audioCache.size >= CACHE_MAX) {
      const firstKey = _audioCache.keys().next().value;
      try { URL.revokeObjectURL(_audioCache.get(firstKey)); } catch (e) {}
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
     STATUS · disponibilidade
  --------------------------------------------------------------- */
  let _available = null;
  function isAvailable() { return _available !== false && !!getKey() && !!getVoiceId(); }

  /* ---------------------------------------------------------------
     TTS · speak()
  --------------------------------------------------------------- */
  let _currentAudio = null;
  let _currentResolve = null;

  function stopSpeaking() {
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
    const apiKey  = getKey();
    const voiceId = opts.voice_id || getVoiceId();
    if (!apiKey || !voiceId) {
      console.warn('[JamesVoice] sem chave/voice_id — pulando ElevenLabs');
      _available = false;
      return null;
    }

    stopSpeaking();

    const key = cacheKey(text, voiceId);
    let url = _audioCache.get(key);

    if (!url) {
      try {
        const r = await fetch(TTS_URL(voiceId), {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: String(text),
            model_id: opts.model_id || DEFAULT_MODEL_TTS,
            voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...(opts.voice_settings || {}) },
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

    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      _currentAudio = audio;
      _currentResolve = resolve;

      const onStart = () => { try { opts.onStart?.(audio); } catch (e) {} };
      const onEnd   = () => {
        if (_currentAudio === audio)   _currentAudio = null;
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
        console.warn('[JamesVoice] play() bloqueado:', e?.message || e);
        onEnd();
      });

      const fallbackMs = Math.max(2500, String(text).length * 80);
      setTimeout(() => { if (_currentAudio === audio) onEnd(); }, fallbackMs);
    });
  }

  /* ---------------------------------------------------------------
     STT · recordAndTranscribe() com VAD
  --------------------------------------------------------------- */
  let _recState = {
    recorder: null, stream: null, audioCtx: null, analyser: null,
    chunks: [], isActive: false, silenceMs: 0, raf: 0, onLevel: null,
  };
  function isRecording() { return _recState.isActive; }

  function _cleanupRecording() {
    if (_recState.raf) cancelAnimationFrame(_recState.raf);
    _recState.raf = 0;
    try { _recState.stream?.getTracks?.().forEach(t => t.stop()); } catch (e) {}
    try { _recState.audioCtx?.close?.(); } catch (e) {}
    _recState.recorder = null;
    _recState.stream   = null;
    _recState.audioCtx = null;
    _recState.analyser = null;
    _recState.chunks   = [];
    _recState.isActive = false;
    _recState.silenceMs = 0;
  }

  function stopRecording() {
    if (_recState.recorder && _recState.recorder.state !== 'inactive') {
      try { _recState.recorder.stop(); } catch (e) {}
    } else {
      _cleanupRecording();
    }
  }

  async function recordAndTranscribe(opts = {}) {
    if (_recState.isActive) throw new Error('Já está gravando.');

    const apiKey  = getKey();
    if (!apiKey) throw new Error('Sem ELEVENLABS_API_KEY configurada.');

    const maxMs            = opts.maxMs            || 30000;
    const silenceMsTarget  = opts.silenceMs        || 1500;
    const silenceThreshold = opts.silenceThreshold || 0.015;
    const onLevel          = opts.onLevel  || null;
    const onStatus         = opts.onStatus || null;
    const languageCode     = opts.languageCode || DEFAULT_LANGUAGE;
    const modelId          = opts.modelId      || DEFAULT_MODEL_STT;

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

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    _recState = { recorder, stream, audioCtx, analyser, chunks, isActive: true, silenceMs: 0, raf: 0, onLevel };

    onStatus?.('recording');
    recorder.start(250);

    const startedAt = performance.now();

    return new Promise((resolve, reject) => {
      let resolved = false;
      const safeResolve = (v) => { if (!resolved) { resolved = true; resolve(v); } };
      const safeReject  = (e) => { if (!resolved) { resolved = true; reject(e); } };

      function tick() {
        if (!_recState.isActive) return;
        analyser.getByteTimeDomainData(data);
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

          // multipart/form-data via FormData (browser monta sozinho)
          const fd = new FormData();
          const ext = (blob.type.split(';')[0].split('/')[1] || 'webm').replace('mpeg', 'mp3');
          fd.append('file', blob, `audio.${ext}`);
          fd.append('model_id', modelId);
          fd.append('language_code', languageCode);

          const r = await fetch(STT_URL, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Accept': 'application/json' },
            body: fd,
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
    stopSpeaking,
    isAvailable,
    recordAndTranscribe,
    stopRecording,
    isRecording,
    clearCache,
    setKey,
  };

  console.log('[JamesVoice ElevenLabs] Online (modo client-only). TTS + STT prontos.');
})();
