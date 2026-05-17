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

     Voice atual: voz própria criada via Instant Voice Clone no free tier
     da ElevenLabs (My6nGPXbjD5XyteAZ4FM). Funciona via API gratuitamente
     porque é IVC do próprio user (não é library/professional).

     Pra trocar a voz sem mexer no código:
       window.__jamesVoiceEleven.setKey(null, 'NOVO_VOICE_ID')
  --------------------------------------------------------------- */
  const ELEVEN_API_KEY_DEFAULT  = '9f754f7bc45eed1c7da0b8ff35319d7dd8e62b5b76f0ea04eed91b34c0523b27';
  const ELEVEN_VOICE_ID_DEFAULT = 'My6nGPXbjD5XyteAZ4FM'; // JAMES — voz oficial (TRAVADA)

  // VOZ TRAVADA: o James fala SÓ com esta voz ElevenLabs. Ignoramos
  // qualquer override antigo de voice_id no localStorage e limpamos
  // chaves obsoletas pra nenhuma outra voz competir.
  try {
    ['fly_eleven_voice_id', 'fly_tts_force_browser', 'fly_tts_eleven_only'].forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    const savedKey = localStorage.getItem('fly_eleven_key');
    if (savedKey && savedKey !== ELEVEN_API_KEY_DEFAULT) {
      localStorage.removeItem('fly_eleven_key'); // descarta chave antiga
    }
  } catch (e) {}

  function getKey()     { return localStorage.getItem('fly_eleven_key') || ELEVEN_API_KEY_DEFAULT; }
  // voice_id é IMUTÁVEL — sempre a voz oficial do James.
  function getVoiceId() { return ELEVEN_VOICE_ID_DEFAULT; }

  function setKey(key /*, voiceId ignorado de propósito */) {
    if (key) localStorage.setItem('fly_eleven_key', key);
    _available = null; // força nova checagem
  }

  /* ---------------------------------------------------------------
     ENDPOINTS ElevenLabs
  --------------------------------------------------------------- */
  const TTS_URL = (voiceId) =>
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

  // Multilingual_v2 fala em português com qualquer voz (incluindo as premade
  // em inglês). flash_v2_5 também aceita pt-BR mas tem qualidade menor.
  const DEFAULT_MODEL_TTS = 'eleven_multilingual_v2';
  const DEFAULT_MODEL_STT = 'scribe_v1';
  const DEFAULT_LANGUAGE  = 'por'; // ISO 639-3 = pt-BR

  // similarity_boost alto = mais fiel à gravação original (IVC)
  // speed: 0.7 (lento) … 1.0 (normal) … 1.2 (rápido) — configurável
  const DEFAULT_VOICE_SETTINGS = {
    stability:        0.40,
    similarity_boost: 0.92,
    style:            0.30,
    use_speaker_boost: true,
    speed:            1.12,
  };

  function getSpeed() {
    const s = parseFloat(localStorage.getItem('fly_eleven_speed'));
    if (!isNaN(s) && s >= 0.7 && s <= 1.2) return s;
    return DEFAULT_VOICE_SETTINGS.speed;
  }
  function setSpeed(v) {
    const s = Math.max(0.7, Math.min(1.2, parseFloat(v) || 1.0));
    localStorage.setItem('fly_eleven_speed', String(s));
    clearCache(); // áudios antigos têm a velocidade antiga
    return s;
  }

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
    const voiceId = getVoiceId(); // SEMPRE a voz oficial do James (travada)
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
            voice_settings: {
              ...DEFAULT_VOICE_SETTINGS,
              speed: getSpeed(),
              ...(opts.voice_settings || {}),
            },
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
    setSpeed,
    getSpeed,
  };

  console.log('[JamesVoice ElevenLabs] Online (modo client-only). TTS + STT prontos. Speed:', getSpeed());
})();
