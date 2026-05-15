/* =====================================================================
   JAMES V2 — FASE 1
   Assistente visual + por voz do Ecossistema Fly
   Arquitetura modular vanilla JS (sem React)
   =====================================================================

   Módulos internos:
   - types               (constantes de status)
   - jamesMockBrain      (generateJamesResponse)
   - useJamesVoice       (hook de voz — objeto com state e métodos)
   - JamesOrb            (componente orbe fixo)
   - JamesPanel          (componente painel compacto)
   - JamesFullscreen     (componente Command Center)
   - AudioVisualizer     (barras animadas com Web Audio API)
   - Boot                (inicialização e binding)
   ===================================================================== */

(function jamesV2Boot() {
  'use strict';

  /* =====================================================================
     TYPES & CONSTANTES
     ===================================================================== */
  const STATUS = Object.freeze({
    IDLE:       'idle',
    LISTENING:  'listening',
    THINKING:   'thinking',
    SPEAKING:   'speaking',
    ERROR:      'error',
  });

  const STATUS_LABELS = {
    [STATUS.IDLE]:      'Aguardando',
    [STATUS.LISTENING]: 'Ouvindo',
    [STATUS.THINKING]:  'Pensando',
    [STATUS.SPEAKING]:  'Respondendo',
    [STATUS.ERROR]:     'Erro',
  };

  const STOP_PHRASES = /^\s*(james[,\s]+)?(encerrar|descansar|pode parar|para[r]?|desligar|fica quieto|dorme|tchau james|adeus|fim|silencio|sil[eê]ncio)\b/i;

  /* =====================================================================
     MOCK BRAIN — generateJamesResponse(command: string): string
     ===================================================================== */
  const jamesMockBrain = {
    generateJamesResponse(command) {
      const t = String(command || '').toLowerCase();

      if (STOP_PHRASES.test(t)) {
        return 'Certo, Chefe. Vou ficar em modo de espera.';
      }
      if (/plano\s*war|guerra|territ[oó]rio/.test(t)) {
        return 'Entendido, Chefe. Na próxima fase eu poderei abrir o Plano WAR automaticamente. Por enquanto, estou registrando este comando como simulação.';
      }
      if (/fly\s*cup|atleta|esporte|modalidade/.test(t)) {
        return 'Comando recebido. A Fly Cup será uma das áreas prioritárias para integração com o James.';
      }
      if (/caixa|cofre|financeiro|saldo|dinheiro|aey/.test(t)) {
        return 'Entendido. Na próxima fase, poderei consultar o caixa e registrar movimentações financeiras no painel.';
      }
      if (/relat[oó]rio|report|dashboard|m[eé]tricas?|kpi/.test(t)) {
        return 'Perfeito, Chefe. Em breve poderei gerar relatórios automáticos com base nos dados do ecossistema.';
      }
      if (/venda|cliente|crm|lead/.test(t)) {
        return 'Anotado. Em breve eu poderei abrir a Central de Vendas e atualizar leads pra você, Chefe.';
      }
      if (/dubai|expans[aã]o|polo/.test(t)) {
        return 'Excelente foco, Chefe. Expansão para Dubai está no radar — em breve eu poderei gerenciar polos e conexões pelo painel.';
      }
      if (/^\s*(ol[aá]|oi|e\s?a[eí]|bom dia|boa tarde|boa noite|fala)\b/.test(t)) {
        return 'Olá, Chefe. Estou online e operacional. Diga o que precisa.';
      }
      if (/quem\s+(e|é|voce|vc)|james[,\s]*você|o que voc[eê] faz/.test(t)) {
        return 'Sou o James, assistente do Ecossistema Fly. Nesta fase ainda estou em modo simulado, mas em breve vou operar o painel inteiro com você.';
      }
      if (/obrigad[oa]|valeu|legal|massa|maneiro/.test(t)) {
        return 'Sempre às ordens, Chefe.';
      }
      return 'Entendido, Chefe. Nesta fase inicial ainda estou em modo simulado, mas já registrei seu comando.';
    },

    isStopCommand(command) {
      return STOP_PHRASES.test(String(command || ''));
    },
  };

  /* =====================================================================
     AUDIO VISUALIZER — barras animadas com Web Audio API
     ===================================================================== */
  function createAudioVisualizer(containerEl, barCount = 24) {
    const bars = [];
    containerEl.innerHTML = '';
    for (let i = 0; i < barCount; i++) {
      const b = document.createElement('div');
      b.className = 'jms-visualizer__bar';
      containerEl.appendChild(b);
      bars.push(b);
    }

    let audioCtx = null;
    let analyser = null;
    let stream = null;
    let raf = null;
    let fakeRaf = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        function tick() {
          analyser.getByteFrequencyData(data);
          for (let i = 0; i < bars.length; i++) {
            const v = data[Math.min(i, data.length - 1)] || 0;
            const h = 4 + (v / 255) * 52;
            bars[i].style.height = h + 'px';
            bars[i].style.opacity = String(0.4 + (v / 255) * 0.6);
          }
          raf = requestAnimationFrame(tick);
        }
        tick();
        return true;
      } catch (e) {
        startFake();
        return false;
      }
    }

    function startFake() {
      // Animação fake (quando não temos mic) — usada em modo speaking
      let t = 0;
      function tick() {
        t += 0.12;
        for (let i = 0; i < bars.length; i++) {
          const h = 6 + Math.abs(Math.sin(t + i * 0.4)) * 36;
          bars[i].style.height = h + 'px';
          bars[i].style.opacity = String(0.5 + Math.abs(Math.sin(t + i * 0.4)) * 0.4);
        }
        fakeRaf = requestAnimationFrame(tick);
      }
      tick();
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf); raf = null;
      if (fakeRaf) cancelAnimationFrame(fakeRaf); fakeRaf = null;
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
      analyser = null;
      bars.forEach(b => { b.style.height = '6px'; b.style.opacity = '0.4'; });
    }

    function reset() {
      bars.forEach(b => { b.style.height = '6px'; b.style.opacity = '0.5'; });
    }

    return { start, startFake, stop, reset };
  }

  /* =====================================================================
     VOICE HOOK — useJamesVoice (objeto reativo)
     ===================================================================== */
  function createJamesVoice(handlers = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasSR = !!SR;
    const hasTTS = 'speechSynthesis' in window;

    const state = {
      status: STATUS.IDLE,
      transcript: '',
      lastResponse: '',
      messages: [],
      isListening: false,
      isConversationActive: false,
      error: null,
    };

    // Voz masculina cacheada
    let _maleVoice = null;
    function pickMaleVoice() {
      if (_maleVoice) return _maleVoice;
      if (!hasTTS) return null;
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const PRIORITY = ['Felipe', 'Luciano', 'Joaquim', 'Daniel', 'Ricardo', 'Eduardo', 'Fernando', 'Diego', 'Diogo', 'Microsoft Daniel', 'Microsoft Ricardo'];
      const FEMALE = /\b(luciana|maria|paulina|monica|helena|samantha|victoria|karen|tessa|fiona|alice|joana|female|fem\b|woman)/i;
      for (const name of PRIORITY) {
        const v = voices.find(x => (x.name || '').toLowerCase().includes(name.toLowerCase()) && !FEMALE.test(x.name || ''));
        if (v) { _maleVoice = v; return v; }
      }
      const ptVoices = voices.filter(v => /^pt/i.test(v.lang));
      _maleVoice = ptVoices.find(v => !FEMALE.test(v.name || '')) || ptVoices[0] || voices[0];
      return _maleVoice;
    }
    if (hasTTS) {
      window.speechSynthesis.onvoiceschanged = () => { _maleVoice = null; pickMaleVoice(); };
      setTimeout(() => { _maleVoice = null; pickMaleVoice(); }, 250);
    }

    function setStatus(s) {
      state.status = s;
      handlers.onStatusChange?.(s);
    }

    function emitState() {
      handlers.onStateChange?.({ ...state });
    }

    function addMessage(role, content) {
      state.messages.push({
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        role,
        content,
        timestamp: new Date(),
      });
      handlers.onMessage?.(state.messages[state.messages.length - 1]);
    }

    function setError(msg) {
      state.error = msg;
      setStatus(STATUS.ERROR);
      handlers.onError?.(msg);
      emitState();
    }

    /* ----------------- TTS ----------------- */
    /* TTS — tenta ElevenLabs (voz oficial do James) primeiro; cai pra
       SpeechSynthesis do navegador como fallback se backend falhar.
       Pode ser desabilitado via localStorage.fly_tts_force_browser='1' */
    function speak(text, onDone) {
      if (!text) { onDone?.(); return; }
      const forceBrowser = localStorage.getItem('fly_tts_force_browser') === '1';
      const useEleven = !forceBrowser && window.__jamesVoiceEleven && window.__jamesVoiceEleven.speak;

      if (useEleven) {
        // Tenta ElevenLabs
        setStatus(STATUS.SPEAKING);
        handlers.onSpeakStart?.(text);
        try { window.speechSynthesis?.cancel?.(); } catch (e) {}
        const fallbackTimer = setTimeout(() => {
          // Se demorar demais, libera (continua tocando em background mas reabre o ciclo)
          handlers.onSpeakEnd?.(); onDone?.();
        }, Math.max(8000, text.length * 100));
        window.__jamesVoiceEleven.speak(text, {
          onStart: () => { /* já chamamos onSpeakStart acima */ },
          onEnd:   () => { clearTimeout(fallbackTimer); handlers.onSpeakEnd?.(); onDone?.(); },
        }).then((audio) => {
          if (audio === null) {
            // ElevenLabs falhou — usa fallback navegador
            clearTimeout(fallbackTimer);
            console.warn('[James] ElevenLabs indisponível — caindo pro SpeechSynthesis');
            speakBrowser(text, onDone);
          }
        }).catch((e) => {
          clearTimeout(fallbackTimer);
          console.warn('[James] ElevenLabs erro:', e?.message || e);
          speakBrowser(text, onDone);
        });
        return;
      }

      // Browser-only
      speakBrowser(text, onDone);
    }

    function speakBrowser(text, onDone) {
      if (!hasTTS) { onDone?.(); return; }
      try { window.speechSynthesis.cancel(); } catch (e) {}
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      u.rate = 1.08;
      u.pitch = 0.7;
      u.volume = 1;
      const v = pickMaleVoice();
      if (v) u.voice = v;
      setStatus(STATUS.SPEAKING);
      handlers.onSpeakStart?.(text);
      u.onend = () => { handlers.onSpeakEnd?.(); onDone?.(); };
      u.onerror = () => { handlers.onSpeakEnd?.(); onDone?.(); };
      window.speechSynthesis.speak(u);
      const fallbackTimer = setTimeout(() => { handlers.onSpeakEnd?.(); onDone?.(); }, Math.max(2500, text.length * 70));
      u.addEventListener('end', () => clearTimeout(fallbackTimer));
    }

    /* ----------------- Permissão de microfone ----------------- */
    async function ensureMicPermission() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        return true;
      } catch (e) {
        setError('Permissão de microfone negada. Ative o microfone nas configurações do navegador.');
        return false;
      }
    }

    /* ----------------- Speech Recognition ----------------- */
    let recog = null;
    let wakeRecog = null;
    let wakeEnabled = false;
    let errorCount = 0;
    let restartCooldown = false;

    function buildRecognizer(onFinalText, opts = {}) {
      const r = new SR();
      r.lang = 'pt-BR';
      r.continuous = !!opts.continuous;
      r.interimResults = true;
      let finalText = '';
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interim += res[0].transcript;
        }
        const live = (finalText + ' ' + interim).trim();
        if (!opts.silent) {
          state.transcript = live;
          handlers.onTranscript?.(live);
        }
        if (opts.onLive) opts.onLive(live);
      };
      r.onerror = (e) => {
        const code = e?.error || 'unknown';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setError('Permissão de microfone bloqueada. Ative o microfone para falar com James.');
          return;
        }
        if (code !== 'no-speech' && code !== 'aborted') {
          errorCount++;
          if (errorCount > 4) {
            setError('Erro no reconhecimento de voz. Tente reiniciar o James.');
            return;
          }
        }
      };
      r.onend = () => {
        const captured = finalText.trim() || state.transcript.trim();
        if (onFinalText) onFinalText(captured);
      };
      r._finalRef = () => finalText;
      return r;
    }

    function stopAllRecog() {
      try { recog?.stop?.(); } catch (e) {}
      try { wakeRecog?.stop?.(); } catch (e) {}
      recog = null;
      state.isListening = false;
    }

    /* ----------------- Wake word listener ----------------- */
    function startWakeListener() {
      if (!hasSR || wakeRecog || !wakeEnabled) return;
      try {
        wakeRecog = buildRecognizer(null, {
          continuous: true,
          silent: true,
          onLive: (txt) => {
            if (/\bjames\b/i.test(txt) && !state.isConversationActive) {
              try { wakeRecog?.stop?.(); } catch (e) {}
              handlers.onWakeWord?.();
              startJames();
            }
          },
        });
        wakeRecog.onend = () => {
          if (wakeEnabled && !state.isConversationActive && !restartCooldown) {
            setTimeout(() => { try { wakeRecog?.start?.(); } catch (e) {} }, 400);
          }
        };
        wakeRecog.start();
      } catch (e) {
        wakeRecog = null;
      }
    }

    function stopWakeListener() {
      wakeEnabled = false;
      try { wakeRecog?.stop?.(); } catch (e) {}
      wakeRecog = null;
    }

    /* ----------------- Processamento de comando (real ou mock) ----------------- */
    async function processCommand(userText) {
      // Verifica encerramento ANTES de chamar IA
      if (jamesMockBrain.isStopCommand(userText)) {
        const reply = jamesMockBrain.generateJamesResponse(userText);
        return { reply, isStop: true, source: 'stop' };
      }

      // ── FASE 2+3: Engine local primeiro ───────────────────────
      if (window.__jamesEngine) {
        try {
          const er = await window.__jamesEngine.process(userText);
          if (er !== null && er !== undefined) {
            handlers.onEngineResult?.(er);
            // Engine é autoridade para todos os tipos exceto null (passthrough para IA)
            return { reply: er.text || '…', isStop: false, source: 'engine', engineResult: er };
          }
          // er === null → engine delegou para IA (intenção desconhecida / pergunta livre)
        } catch (e) {
          console.warn('[JAMES Engine] Erro:', e?.message || e);
        }
      }
      // ──────────────────────────────────────────────────────────

      const hasBrain = !!window.__jamesBrain;
      const hasKeys  = hasBrain && window.__jamesBrain.isAvailable();

      // Tenta IA real (Fase 2)
      if (hasKeys) {
        try {
          handlers.onSourceChange?.('thinking-real');
          const result = await window.__jamesBrain.generateRealResponse(userText);
          if (result && result.text) {
            handlers.onSourceChange?.('real');
            return { reply: result.text, isStop: false, source: 'real', actions: result.actions };
          }
        } catch (e) {
          console.error('[JAMES] ERRO IA real:', e?.message || e);
          handlers.onIAError?.(e?.message || String(e));
        }
      }

      // Fallback: mock brain
      const reply = jamesMockBrain.generateJamesResponse(userText);
      handlers.onSourceChange?.('mock');
      return { reply, isStop: false, source: 'mock' };
    }

    /* ----------------- PROCESSAMENTO PÓS-CAPTURA (compartilhado) ----------------- */
    async function _handleUserText(rawText) {
      state.isListening = false;
      handlers.onListenEnd?.();
      const userText = (rawText || '').trim();
      if (!userText) {
        if (state.isConversationActive) {
          setTimeout(() => { if (state.isConversationActive) captureOnce(); }, 800);
        } else {
          setStatus(STATUS.IDLE);
        }
        return;
      }
      addMessage('user', userText);
      handlers.onUserMessage?.(userText);
      setStatus(STATUS.THINKING);
      handlers.onThinkStart?.();
      const result = await processCommand(userText);
      const reply = result.reply;
      state.lastResponse = reply;
      addMessage('james', reply);
      handlers.onJamesMessage?.(reply);
      if (result.isStop) {
        speak(reply, () => {
          state.isConversationActive = false;
          setStatus(STATUS.IDLE);
          emitState();
        });
        return;
      }
      speak(reply, () => {
        if (state.isConversationActive) {
          setTimeout(() => { if (state.isConversationActive) captureOnce(); }, 250);
        } else {
          setStatus(STATUS.IDLE);
        }
      });
    }

    /* ----------------- Capture loop (escuta um comando) -----------------
       Por padrão: Web Speech API do navegador.
       Se localStorage.fly_stt_use_eleven === '1' E backend disponível:
         Usa MediaRecorder + ElevenLabs Scribe (qualidade superior).
    ----------------- */
    async function captureOnceEleven() {
      try { wakeRecog?.stop?.(); } catch (e) {}
      state.transcript = '';
      handlers.onTranscript?.('');
      setStatus(STATUS.LISTENING);
      state.isListening = true;
      handlers.onListenStart?.();

      try {
        const result = await window.__jamesVoiceEleven.recordAndTranscribe({
          maxMs: 30000,
          silenceMs: 1500,
          languageCode: 'por',
          modelId: 'scribe_v1',
          onLevel: (v) => {
            // Atualiza transcript visual com indicador de volume
            // (o orbe pulsa porque setStatus(LISTENING) já dispara amplitude)
          },
          onStatus: (s) => {
            if (s === 'transcribing') {
              setStatus(STATUS.THINKING);
              handlers.onTranscript?.('Transcrevendo…');
            }
          },
        });
        const transcribed = (result?.text || '').trim();
        if (transcribed) {
          handlers.onTranscript?.(transcribed);
          state.transcript = transcribed;
        }
        await _handleUserText(transcribed);
      } catch (e) {
        console.warn('[James] Eleven STT falhou — caindo pro Web Speech:', e?.message || e);
        // Fallback: tenta Web Speech
        captureOnceBrowser();
      }
    }

    function captureOnceBrowser() {
      if (!hasSR) {
        setError('Reconhecimento de voz não disponível neste navegador. Use Chrome ou Edge para melhor experiência.');
        return;
      }
      try { wakeRecog?.stop?.(); } catch (e) {}
      state.transcript = '';
      handlers.onTranscript?.('');
      setStatus(STATUS.LISTENING);
      state.isListening = true;
      handlers.onListenStart?.();

      recog = buildRecognizer(async (text) => {
        await _handleUserText(text);
      });
      try { recog.start(); } catch (e) { /* ignored */ }
    }

    function captureOnce() {
      const useEleven = localStorage.getItem('fly_stt_use_eleven') === '1' &&
                        window.__jamesVoiceEleven?.recordAndTranscribe;
      if (useEleven) return captureOnceEleven();
      return captureOnceBrowser();
    }

    /* ----------------- API pública ----------------- */
    async function startJames(opts = {}) {
      if (state.isConversationActive) return;
      const ok = await ensureMicPermission();
      if (!ok) return;
      state.isConversationActive = true;
      state.error = null;
      errorCount = 0;
      wakeEnabled = true;
      const greeting = opts.greeting === false ? null : 'Fale comigo, Chefe.';
      handlers.onStart?.();
      if (greeting) {
        speak(greeting, () => captureOnce());
      } else {
        captureOnce();
      }
    }

    function stopJames(opts = {}) {
      const wasActive = state.isConversationActive;
      state.isConversationActive = false;
      stopAllRecog();
      try { window.speechSynthesis.cancel(); } catch (e) {}
      if (wasActive && opts.silent !== true) {
        const farewell = 'Certo, Chefe. Vou ficar em modo de espera.';
        state.lastResponse = farewell;
        addMessage('james', farewell);
        handlers.onJamesMessage?.(farewell);
        speak(farewell, () => {
          setStatus(STATUS.IDLE);
          handlers.onStop?.();
          // mantém wake listener ativo se possível
          if (wakeEnabled) startWakeListener();
        });
      } else {
        setStatus(STATUS.IDLE);
        handlers.onStop?.();
      }
    }

    function toggleJames() {
      if (state.isConversationActive) stopJames();
      else startJames();
    }

    async function sendTextCommand(text) {
      if (!text) return;
      addMessage('user', text);
      handlers.onUserMessage?.(text);
      setStatus(STATUS.THINKING);
      handlers.onThinkStart?.();

      const result = await processCommand(text);
      const reply = result.reply;
      state.lastResponse = reply;
      addMessage('james', reply);
      handlers.onJamesMessage?.(reply);

      speak(reply, () => {
        if (state.isConversationActive) {
          setTimeout(() => { if (state.isConversationActive) captureOnce(); }, 250);
        } else {
          setStatus(STATUS.IDLE);
        }
      });
    }

    function getState() { return { ...state }; }
    function getMessages() { return state.messages.slice(); }
    function clearMessages() { state.messages = []; handlers.onMessagesClear?.(); }
    function enableWakeWord() { wakeEnabled = true; startWakeListener(); }
    function disableWakeWord() { stopWakeListener(); }

    return {
      // capabilities
      hasSR, hasTTS,
      // state
      getState, getMessages, STATUS,
      // actions
      startJames, stopJames, toggleJames,
      sendTextCommand, speak,
      enableWakeWord, disableWakeWord,
      clearMessages,
      speakText: (text, onDone) => speak(text, onDone),
      // re-export
      generateResponse: jamesMockBrain.generateJamesResponse,
    };
  }

  /* =====================================================================
     WIREFRAME ORB — esfera 3D mesh dourada (canvas)
     ===================================================================== */
  function buildMeshOrb(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const PARTICLES = opts.particles || 1100;
    const OUTER_RING = opts.outerRing !== false;
    const points = [];

    // Distribuição via espiral de Fibonacci na esfera
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PARTICLES; i++) {
      const y = 1 - (i / (PARTICLES - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      points.push({
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        off: Math.random() * Math.PI * 2,
      });
    }

    // Pontos da névoa orbital externa
    const orbital = [];
    if (OUTER_RING) {
      for (let i = 0; i < 220; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1.18 + Math.random() * 0.18;
        orbital.push({
          baseR: r,
          a,
          speed: 0.002 + Math.random() * 0.004,
          size: 0.5 + Math.random() * 1.1,
          alpha: 0.25 + Math.random() * 0.5,
          off: Math.random() * Math.PI * 2,
        });
      }
    }

    let rotY = 0;
    let rotX = 0.4;
    let t = 0;
    let amplitude = 0;
    let targetAmp = 0;
    let raf = 0;
    let status = STATUS.IDLE;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || canvas.offsetWidth || canvas.width || 80;
      const h = canvas.clientHeight || canvas.offsetHeight || canvas.height || 80;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    let ro;
    try {
      ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
    } catch (e) {}

    // Pré-calcula vizinhos pra mesh wireframe (cada ponto liga aos K mais próximos)
    const K_NEIGHBORS = opts.kNeighbors || 4;
    const neighbors = [];
    for (let i = 0; i < PARTICLES; i++) {
      const dists = [];
      const pi = points[i];
      for (let j = 0; j < PARTICLES; j++) {
        if (j === i) continue;
        const pj = points[j];
        const dx = pi.x - pj.x, dy = pi.y - pj.y, dz = pi.z - pj.z;
        dists.push({ idx: j, d: dx*dx + dy*dy + dz*dz });
      }
      dists.sort((a, b) => a.d - b.d);
      neighbors.push(dists.slice(0, K_NEIGHBORS).map(x => x.idx));
    }

    function frame() {
      const w = canvas.clientWidth || canvas.offsetWidth;
      const h = canvas.clientHeight || canvas.offsetHeight;
      if (w < 10 || h < 10) { raf = requestAnimationFrame(frame); return; }

      const cx = w / 2;
      const cy = h / 2;

      amplitude += (targetAmp - amplitude) * 0.1;

      // LIMPA o canvas (transparente, sem quadrado preto)
      ctx.clearRect(0, 0, w, h);

      const pulse = 1 + Math.sin(t * 0.9) * 0.04 + amplitude * 0.18;
      const radius = Math.min(w, h) * 0.38 * pulse;

      const cy_ = Math.cos(rotY), sy_ = Math.sin(rotY);
      const cx_ = Math.cos(rotX), sx_ = Math.sin(rotX);

      // Calcula posições projetadas pra TODOS os pontos
      const proj = new Array(PARTICLES);
      for (let i = 0; i < PARTICLES; i++) {
        const p = points[i];
        let x = p.x * cy_ - p.z * sy_;
        let z = p.x * sy_ + p.z * cy_;
        let y = p.y;
        const y2 = y * cx_ - z * sx_;
        z = y * sx_ + z * cx_;
        y = y2;

        const wave = Math.sin(t * 1.4 + p.off + (x + y) * 2.2) * (0.08 + amplitude * 0.22);
        const r = radius * (1 + wave);
        const persp = 1.6 + z * 0.85;
        proj[i] = {
          px: cx + (x * r) / persp,
          py: cy + (y * r) / persp,
          depth: (z + 1) * 0.5,
        };
      }

      // Núcleo brilhante (radial gradient — NÃO fillRect, usa arc + clip)
      const coreR = radius * 0.6;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      const coreAlpha = 0.35 + amplitude * 0.4 + (status === STATUS.SPEAKING ? 0.18 : 0);
      grd.addColorStop(0,    `rgba(255, 240, 180, ${coreAlpha})`);
      grd.addColorStop(0.4,  'rgba(255, 200, 100, 0.16)');
      grd.addColorStop(0.75, 'rgba(255, 180, 70, 0.04)');
      grd.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'lighter';

      // Wireframe: linhas conectando vizinhos
      let hue, sat, light;
      if (status === STATUS.LISTENING)      { hue = 48; sat = 100; light = 60; }
      else if (status === STATUS.SPEAKING)  { hue = 32; sat = 100; light = 65; }
      else if (status === STATUS.THINKING)  { hue = 42; sat = 95;  light = 60; }
      else if (status === STATUS.ERROR)     { hue = 8;  sat = 80;  light = 55; }
      else                                  { hue = 42; sat = 92;  light = 55; }

      ctx.lineWidth = 0.6;
      for (let i = 0; i < PARTICLES; i++) {
        const a = proj[i];
        const nb = neighbors[i];
        for (let k = 0; k < nb.length; k++) {
          const j = nb[k];
          if (j < i) continue; // evita desenhar 2x
          const b = proj[j];
          const avgDepth = (a.depth + b.depth) * 0.5;
          const lineAlpha = (0.04 + avgDepth * 0.18) * (status === STATUS.SPEAKING ? 1.4 : status === STATUS.LISTENING ? 1.2 : 1);
          ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light + avgDepth * 15}%, ${lineAlpha})`;
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(b.px, b.py);
          ctx.stroke();
        }
      }

      // Pontos
      for (let i = 0; i < PARTICLES; i++) {
        const a = proj[i];
        const depth = a.depth;
        const size = 0.5 + depth * 1.6;
        const aBase = 0.3 + depth * 0.65;
        const hueShift = (Math.sin(t * 0.6 + points[i].off) * 8) | 0;
        ctx.fillStyle = `hsla(${hue + hueShift}, ${sat}%, ${light + depth * 18}%, ${aBase})`;
        ctx.beginPath();
        ctx.arc(a.px, a.py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Partículas orbitando (anel externo cósmico)
      if (OUTER_RING) {
        for (let i = 0; i < orbital.length; i++) {
          const o = orbital[i];
          o.a += o.speed * (1 + amplitude);
          const x = Math.cos(o.a) * o.baseR;
          const z = Math.sin(o.a) * o.baseR;
          const yWob = Math.sin(t * 0.4 + o.off) * 0.18;

          const y2 = yWob * cx_ - z * sx_;
          const zR = yWob * sx_ + z * cx_;

          const persp = 1.6 + zR * 0.85;
          const px = cx + (x * radius) / persp;
          const py = cy + (y2 * radius) / persp;
          const depth = (zR + 1) * 0.5;
          const a = o.alpha * (0.4 + depth * 0.7);

          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${60 + depth * 20}%, ${a})`;
          ctx.beginPath();
          ctx.arc(px, py, o.size * (0.6 + depth * 0.7), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'source-over';

      const spinMul = status === STATUS.THINKING ? 3 : status === STATUS.LISTENING ? 1.4 : status === STATUS.SPEAKING ? 1.8 : 1;
      rotY += 0.0045 * spinMul + amplitude * 0.003;
      rotX += 0.0018 * spinMul + amplitude * 0.0018;
      t += 0.024;

      raf = requestAnimationFrame(frame);
    }
    frame();

    return {
      setStatus(s) { status = s; },
      setAmplitude(v) { targetAmp = Math.max(0, Math.min(1, v)); },
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        if (ro) try { ro.disconnect(); } catch (e) {}
      },
    };
  }

  /* =====================================================================
     COMPONENTES DOM
     ===================================================================== */
  function buildOrb(container) {
    const btn = document.createElement('button');
    btn.id = 'jms-orb';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Ativar James');
    btn.setAttribute('data-status', STATUS.IDLE);
    btn.innerHTML = `
      <canvas class="jms-orb__canvas"></canvas>
      <span class="jms-orb__status-dot"></span>
      <span class="jms-orb__label">JAMES</span>
    `;
    container.appendChild(btn);
    // monta o mesh no canvas
    const canvas = btn.querySelector('.jms-orb__canvas');
    btn._mesh = buildMeshOrb(canvas, { particles: 350, kNeighbors: 3, outerRing: true });
    return btn;
  }

  // Power button: agora vive DENTRO do label do orbe (status do orbe)
  function buildPower() { return null; }

  function buildPanel(container) {
    const panel = document.createElement('div');
    panel.id = 'jms-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'James Assistente');
    panel.innerHTML = `
      <header class="jms-panel__header">
        <div class="jms-panel__title-block">
          <strong>JAMES</strong>
          <small>Assistente do Ecossistema Fly</small>
          <div class="jms-panel__status">
            <span class="jms-panel__status-led" id="jms-led"></span>
            <span id="jms-status-text">Aguardando</span>
            <span class="jms-panel__ai-badge" id="jms-ai-badge">MOCK</span>
          </div>
        </div>
        <button class="jms-panel__close" id="jms-close" type="button" aria-label="Fechar">×</button>
      </header>

      <div class="jms-panel__visual">
        <div class="jms-visualizer" id="jms-viz"></div>
      </div>

      <div class="jms-error hidden" id="jms-error"></div>

      <section class="jms-panel__section">
        <h4>Você disse:</h4>
        <div class="jms-panel__transcript empty" id="jms-transcript">Sua fala aparecerá aqui...</div>
      </section>

      <section class="jms-panel__section">
        <h4>James:</h4>
        <div class="jms-panel__reply empty" id="jms-reply">Aguardando comando.</div>
      </section>

      <!-- Input de texto pra digitar comando -->
      <div class="jms-panel__input-row">
        <input type="text" id="jms-text-input" placeholder="Digite uma pergunta pro James..." autocomplete="off" />
        <button class="jms-btn jms-btn--primary jms-send-btn" id="jms-text-send" type="button" aria-label="Enviar">↑</button>
      </div>

      <!-- Engine UI: detecção, confirmação, timeline, sugestões -->
      <div class="jms-engine-ui" id="jms-engine-ui">
        <div class="jms-engine-detected" id="jms-engine-detected">
          <div class="jms-engine-entities" id="jms-engine-entities"></div>
        </div>
        <div class="jms-engine-confirm" id="jms-engine-confirm">
          <p class="jms-engine-confirm__text" id="jms-engine-confirm-text"></p>
          <div class="jms-engine-confirm__btns">
            <button class="jms-btn jms-btn--primary jms-btn--sm" id="jms-confirm-yes" type="button">Confirmar</button>
            <button class="jms-btn jms-btn--ghost  jms-btn--sm" id="jms-confirm-no"  type="button">Cancelar</button>
          </div>
        </div>
        <div class="jms-engine-timeline" id="jms-engine-timeline">
          <ul class="jms-timeline-list" id="jms-timeline-list"></ul>
        </div>
        <div class="jms-engine-suggestions" id="jms-engine-suggestions">
          <p class="jms-suggestions-label">Próximos passos:</p>
          <div class="jms-suggestions-list" id="jms-suggestions-list"></div>
        </div>
      </div>

      <!-- 💡 Sugestões inteligentes do James (gerenciado por james-suggestions.js) -->
      <div class="jms-suggestions-section" id="jms-suggestions-section">
        <div class="jms-suggestions-header">
          <span class="jms-suggestions-title">💡 SUGESTÕES PRO CHEFE</span>
          <div style="display:flex; gap:6px;">
            <button class="jms-suggestions-refresh jms-reconcile-btn" id="jms-reconcile-btn" type="button" title="Importar dados legados de produtos para painéis novos" style="font-size:10px; width:auto; padding:0 9px; border-radius:11px;">🌐 Reconciliar</button>
            <button class="jms-suggestions-refresh" id="jms-suggestions-refresh" type="button" title="Atualizar sugestões">⟳</button>
          </div>
        </div>
        <div class="jms-suggestions-host" id="jms-suggestions-host"></div>
      </div>

      <div class="jms-panel__actions">
        <button class="jms-btn jms-btn--primary" id="jms-activate" type="button">🎤 Ativar Voz</button>
        <button class="jms-btn jms-btn--danger" id="jms-stop" type="button">Encerrar</button>
        <button class="jms-btn jms-btn--ghost" id="jms-fs-open" type="button">Tela Cheia</button>
        <button class="jms-btn jms-btn--ghost" id="jms-config-ai" type="button">⚙ Config</button>
      </div>

      <!-- Mini-form de configuração de IA (escondido por padrão) -->
      <div class="jms-config" id="jms-config-form" style="display:none;">
        <h4>🎙️ Voz Oficial do James (ElevenLabs)</h4>
        <small>Configurada no servidor (Vercel env vars). Botões abaixo testam.</small>
        <div class="jms-config__actions" style="margin-top:8px;">
          <button class="jms-btn jms-btn--primary" id="jms-test-voice" type="button">🔊 Testar Voz (TTS)</button>
          <button class="jms-btn jms-btn--ghost" id="jms-test-stt" type="button">🎤 Testar Microfone (STT)</button>
        </div>
        <div style="margin-top:10px; font-size:11px;">
          <label style="display:flex; align-items:center; gap:8px;">
            <span style="white-space:nowrap;">⚡ Velocidade da voz:</span>
            <input type="range" id="jms-voice-speed" min="0.7" max="1.2" step="0.02" value="1.12" style="flex:1; accent-color:#f5b842;" />
            <span id="jms-voice-speed-val" style="min-width:34px; color:#ffd770; font-weight:700;">1.12x</span>
          </label>
        </div>
        <div style="margin-top:8px; display:flex; gap:14px; flex-wrap:wrap; align-items:center; font-size:11px;">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="jms-stt-eleven-toggle" /> Usar ElevenLabs Scribe pra ouvir (melhor qualidade)
          </label>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="jms-tts-browser-toggle" /> Forçar voz do navegador (fallback)
          </label>
        </div>
        <div class="jms-config__status" id="jms-voice-status" style="margin-top:6px;"></div>

        <hr style="border:none; border-top:1px solid rgba(245,182,66,0.12); margin:14px 0 10px;">

        <h4>🧠 Conectar IA Real</h4>
        <small>Cole sua chave do Anthropic (Claude) — preferencial — ou OpenAI:</small>
        <input type="password" id="jms-key-anthropic" placeholder="sk-ant-..." autocomplete="off" />
        <input type="password" id="jms-key-openai" placeholder="sk-... (opcional, usado como fallback)" autocomplete="off" />
        <div class="jms-config__actions">
          <button class="jms-btn jms-btn--primary" id="jms-save-keys" type="button">Salvar e Testar</button>
          <button class="jms-btn jms-btn--ghost" id="jms-cancel-keys" type="button">Cancelar</button>
        </div>
        <div class="jms-config__status" id="jms-config-status"></div>

        <hr style="border:none; border-top:1px solid rgba(245,182,66,0.12); margin:14px 0 10px;">

        <h4>☁️ Conectar Supabase</h4>
        <small>Sincronizar dados entre dispositivos (opcional):</small>
        <div class="jms-sb-diag" id="jms-sb-diag"></div>
        <input type="url" id="jms-sb-url" placeholder="https://xxxxx.supabase.co" autocomplete="off" />
        <input type="password" id="jms-sb-key" placeholder="anon key (eyJhbGc...) — NÃO a chave do dashboard" autocomplete="off" />
        <div class="jms-config__actions">
          <button class="jms-btn jms-btn--primary" id="jms-save-sb" type="button">Conectar</button>
          <button class="jms-btn jms-btn--ghost" id="jms-test-sb" type="button">Testar</button>
          <button class="jms-btn jms-btn--danger" id="jms-disconnect-sb" type="button">Reset</button>
        </div>
        <div class="jms-config__status" id="jms-sb-status"></div>
        <small style="margin-top:8px; color:rgba(255,255,255,0.4);">
          💡 Achar a anon key: Supabase Dashboard → Settings → API → Project API keys → <strong>anon public</strong> (a chave começa com <code>eyJhbGc...</code>)
        </small>
      </div>
    `;
    container.appendChild(panel);
    return panel;
  }

  function buildFullscreen(container) {
    const fs = document.createElement('div');
    fs.id = 'jms-fullscreen';
    fs.setAttribute('role', 'dialog');
    fs.setAttribute('aria-label', 'James Command Center');
    fs.innerHTML = `
      <header class="jms-fs__header">
        <h1 class="jms-fs__title">James Command Center</h1>
        <p class="jms-fs__subtitle">Inteligência operacional do Ecossistema Fly</p>
      </header>

      <div class="jms-fs__big-orb" id="jms-fs-orb">
        <canvas class="jms-fs__big-orb-canvas"></canvas>
      </div>

      <div class="jms-fs__status">
        <span class="jms-fs__status-big" id="jms-fs-status">Aguardando comando</span>
        <span class="jms-panel__ai-badge" id="jms-fs-ai-badge" style="margin-left:14px;">MOCK</span>
      </div>

      <div class="jms-fs__grid">
        <div class="jms-card">
          <h3>Visualizer</h3>
          <div class="jms-card__visual">
            <div class="jms-visualizer" id="jms-fs-viz"></div>
          </div>
        </div>

        <div class="jms-card">
          <h3>Você está dizendo</h3>
          <div class="jms-card__content empty" id="jms-fs-transcript">Sua fala aparecerá aqui em tempo real…</div>
        </div>

        <div class="jms-card">
          <h3>Última resposta do James</h3>
          <div class="jms-card__content empty" id="jms-fs-reply">Aguardando comando.</div>
        </div>

        <div class="jms-card" style="grid-column: 1 / -1;">
          <h3>Histórico da conversa</h3>
          <div class="jms-history empty" id="jms-fs-history">Sem mensagens ainda.</div>
        </div>

        <div class="jms-card" style="grid-column: 1 / -1;">
          <h3>Execução James</h3>
          <div class="jms-fs-engine-ui" id="jms-fs-engine-ui">
            <ul class="jms-timeline-list" id="jms-fs-timeline-list"></ul>
            <div class="jms-fs-suggestions" id="jms-fs-suggestions"></div>
          </div>
        </div>

        <div class="jms-card" style="grid-column: 1 / -1;">
          <h3>Histórico de Operações James</h3>
          <div class="jms-ops-history" id="jms-ops-history">Carregando…</div>
        </div>

        <div class="jms-card" style="grid-column: 1 / -1;">
          <h3>Comandos rápidos</h3>
          <div class="jms-quick">
            <button class="jms-quick__btn" data-cmd="Abrir Plano WAR">▸ Plano WAR</button>
            <button class="jms-quick__btn" data-cmd="Abrir Fly Cup">▸ Fly Cup</button>
            <button class="jms-quick__btn" data-cmd="Gerar relatório do mês">▸ Relatório do Mês</button>
            <button class="jms-quick__btn" data-cmd="Quanto faturamos esse mês">▸ Faturamento</button>
            <button class="jms-quick__btn" data-cmd="Qual produto vendeu mais">▸ Top Produto</button>
            <button class="jms-quick__btn" data-cmd="Quantas vendas tivemos">▸ Total de Vendas</button>
            <button class="jms-quick__btn" data-cmd="Abrir cockpit">▸ Cockpit</button>
            <button class="jms-quick__btn" data-cmd="Modo descanso">▸ Descanso</button>
          </div>
        </div>
      </div>

      <footer class="jms-fs__footer">
        <button class="jms-btn jms-btn--primary" id="jms-fs-activate">Ativar James</button>
        <button class="jms-btn jms-btn--danger" id="jms-fs-stop">Encerrar Conversa</button>
        <button class="jms-btn jms-btn--ghost" id="jms-fs-close">Voltar ao painel</button>
      </footer>
    `;
    container.appendChild(fs);
    return fs;
  }

  /* =====================================================================
     BOOT — monta tudo, faz binding, gerencia estado
     ===================================================================== */
  function boot() {
    if (document.getElementById('jms-orb')) return; // já bootado

    const root = document.body;

    // Cria componentes
    const orbEl    = buildOrb(root);
    const panelEl  = buildPanel(root);
    const fsEl     = buildFullscreen(root);

    // Refs
    const $ = (id) => document.getElementById(id);
    const ui = {
      led:        $('jms-led'),
      statusText: $('jms-status-text'),
      transcript: $('jms-transcript'),
      reply:      $('jms-reply'),
      error:      $('jms-error'),
      activate:   $('jms-activate'),
      stop:       $('jms-stop'),
      fsOpen:     $('jms-fs-open'),
      close:      $('jms-close'),
      // FS
      fsOrb:        $('jms-fs-orb'),
      fsStatus:     $('jms-fs-status'),
      fsTranscript: $('jms-fs-transcript'),
      fsReply:      $('jms-fs-reply'),
      fsHistory:    $('jms-fs-history'),
      fsActivate:   $('jms-fs-activate'),
      fsStop:       $('jms-fs-stop'),
      fsClose:      $('jms-fs-close'),
    };

    // Visualizers
    const vizPanel = createAudioVisualizer($('jms-viz'), 24);
    const vizFS    = createAudioVisualizer($('jms-fs-viz'), 40);

    // Mesh do orbe grande (fullscreen)
    const fsCanvas = fsEl.querySelector('.jms-fs__big-orb-canvas');
    const fsMesh = buildMeshOrb(fsCanvas, { particles: 700, kNeighbors: 4, outerRing: true });

    // Estado da UI
    let panelOpen = false;

    function setPanelOpen(open) {
      panelOpen = open;
      panelEl.classList.toggle('open', open);
    }

    function setFullscreen(open) {
      fsEl.classList.toggle('open', open);
    }

    function updateStatusUI(status) {
      orbEl.setAttribute('data-status', status);
      ui.fsOrb.setAttribute('data-status', status);

      // Propaga status pros meshes (cor + velocidade de rotação)
      if (orbEl._mesh) orbEl._mesh.setStatus(status);
      if (fsMesh) fsMesh.setStatus(status);

      // Amplitude dos meshes
      const amp = status === STATUS.LISTENING ? 0.6 : status === STATUS.SPEAKING ? 0.85 : status === STATUS.THINKING ? 0.4 : 0.15;
      if (orbEl._mesh) orbEl._mesh.setAmplitude(amp);
      if (fsMesh) fsMesh.setAmplitude(amp);

      const label = STATUS_LABELS[status] || status;
      ui.statusText.textContent = label;
      ui.fsStatus.textContent = label;

      ui.led.className = 'jms-panel__status-led';
      if (status === STATUS.LISTENING) ui.led.classList.add('is-listening');
      else if (status === STATUS.THINKING) ui.led.classList.add('is-thinking');
      else if (status === STATUS.SPEAKING) ui.led.classList.add('is-speaking');
      else if (status === STATUS.ERROR) ui.led.classList.add('is-error');

      // Visualizer behavior por status
      if (status === STATUS.LISTENING) vizPanel.reset();
      if (status === STATUS.SPEAKING) { vizPanel.startFake(); vizFS.startFake(); }
      if (status === STATUS.IDLE || status === STATUS.ERROR) { vizPanel.stop(); vizFS.stop(); }
    }

    function updateTranscript(text) {
      const t = text || '';
      ui.transcript.textContent = t || 'Sua fala aparecerá aqui...';
      ui.transcript.classList.toggle('empty', !t);
      ui.fsTranscript.textContent = t || 'Sua fala aparecerá aqui em tempo real…';
      ui.fsTranscript.classList.toggle('empty', !t);
    }

    function updateReply(text) {
      const t = text || '';
      ui.reply.textContent = t || 'Aguardando comando.';
      ui.reply.classList.toggle('empty', !t);
      ui.fsReply.textContent = t || 'Aguardando comando.';
      ui.fsReply.classList.toggle('empty', !t);
    }

    function appendMessage(msg) {
      // Atualiza histórico no fullscreen
      ui.fsHistory.classList.remove('empty');
      if (ui.fsHistory.textContent.trim() === 'Sem mensagens ainda.') {
        ui.fsHistory.innerHTML = '';
      }
      const el = document.createElement('div');
      el.className = 'jms-msg jms-msg--' + (msg.role === 'james' ? 'james' : 'user');
      const time = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
      const t = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      el.innerHTML = `<span class="jms-msg__role">${msg.role === 'james' ? 'James' : 'Você'} · ${t}</span>${escapeHtml(msg.content)}`;
      ui.fsHistory.appendChild(el);
      ui.fsHistory.scrollTop = ui.fsHistory.scrollHeight;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function setError(msg) {
      if (!msg) {
        ui.error.classList.add('hidden');
        ui.error.textContent = '';
      } else {
        ui.error.classList.remove('hidden');
        ui.error.textContent = msg;
      }
    }

    function updatePowerButton(on) {
      // Atualiza status dot e label do orbe
      orbEl.querySelector('.jms-orb__status-dot').classList.toggle('on', on);
      const label = orbEl.querySelector('.jms-orb__label');
      if (label) label.textContent = on ? 'JAMES · ON' : 'JAMES';
      orbEl.classList.toggle('is-on', on);
    }

    // Atualiza badge IA conforme disponibilidade de chaves (panel + fullscreen)
    function updateAIBadge() {
      const has = !!(window.__jamesBrain && window.__jamesBrain.isAvailable());
      ['jms-ai-badge', 'jms-fs-ai-badge'].forEach(id => {
        const badge = $(id);
        if (!badge) return;
        if (!badge.classList.contains('is-thinking-frozen')) {
          badge.textContent = has ? 'IA REAL ✓' : 'MOCK';
          badge.classList.toggle('is-real', has);
          badge.classList.toggle('is-mock', !has);
        }
      });
    }
    updateAIBadge();
    setInterval(updateAIBadge, 2000);

    // Helper pra atualizar ambos
    function setAIBadge(text, isReal) {
      ['jms-ai-badge', 'jms-fs-ai-badge'].forEach(id => {
        const b = $(id);
        if (!b) return;
        b.textContent = text;
        b.classList.toggle('is-real', isReal);
        b.classList.toggle('is-mock', !isReal);
      });
    }

    /* =====================================================================
       ENGINE UI — helpers de confirmação, timeline e sugestões
    ===================================================================== */
    const $e = (id) => document.getElementById(id);

    function clearEngineUI() {
      $e('jms-engine-ui')?.classList.remove('has-content');
      [$e('jms-engine-detected'), $e('jms-engine-confirm'),
       $e('jms-engine-timeline'), $e('jms-engine-suggestions')].forEach(el => {
        el?.classList.remove('active');
      });
      const fsSug = $e('jms-fs-suggestions');
      if (fsSug) fsSug.innerHTML = '';
    }

    // Escape HTML para evitar XSS via texto extraído pelo engine
    function escHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function showEntityChips(entities) {
      const el = $e('jms-engine-entities');
      const section = $e('jms-engine-detected');
      if (!el || !section || !entities) return;
      const chips = [];
      if (entities.client_name)    chips.push({ k: 'Cliente',   v: entities.client_name });
      if (entities.product_name)   chips.push({ k: 'Produto',   v: entities.product_name });
      if (entities.sale_value)     chips.push({ k: 'Valor',     v: 'R$ ' + entities.sale_value.toLocaleString('pt-BR') });
      if (entities.payment_method) chips.push({ k: 'Pagamento', v: entities.payment_method });
      if (entities.lead_source)    chips.push({ k: 'Origem',    v: entities.lead_source });
      if (entities.package_type)   chips.push({ k: 'Tipo',      v: entities.package_type });
      if (entities.date)           chips.push({ k: 'Data',      v: entities.date });
      if (!chips.length) { section.classList.remove('active'); return; }
      el.innerHTML = chips.map(c =>
        `<span class="jms-entity-chip"><em>${escHtml(c.k)}:</em> ${escHtml(c.v)}</span>`
      ).join('');
      section.classList.add('active');
      $e('jms-engine-ui')?.classList.add('has-content');
    }

    function showConfirmCard(text, entities) {
      clearEngineUI();
      showEntityChips(entities || {});
      const ct = $e('jms-engine-confirm-text');
      if (ct) ct.textContent = text;
      $e('jms-engine-confirm')?.classList.add('active');
      $e('jms-engine-ui')?.classList.add('has-content');
      setPanelOpen(true);
    }

    function hideConfirmCard() {
      $e('jms-engine-confirm')?.classList.remove('active');
    }

    function buildStepLi(step, prefix) {
      return `<li class="jms-timeline-step jms-step--pending" id="${prefix}step-${escHtml(step.id)}">
        <span class="jms-step-icon">◯</span>
        <span class="jms-step-label">${escHtml(step.label)}</span>
      </li>`;
    }

    function showTimeline(steps) {
      const list = $e('jms-timeline-list');
      const section = $e('jms-engine-timeline');
      const fsList = $e('jms-fs-timeline-list');
      if (!steps || !steps.length) return;
      const panelHTML = steps.map(s => buildStepLi(s, 'jms-')).join('');
      const fsHTML    = steps.map(s => buildStepLi(s, 'jms-fs-')).join('');
      if (list) list.innerHTML = panelHTML;
      if (fsList) fsList.innerHTML = fsHTML;
      section?.classList.add('active');
      $e('jms-engine-ui')?.classList.add('has-content');
    }

    function updateTimelineStep(stepId, status, detail) {
      const icons = { pending: '◯', running: '⟳', success: '✓', error: '✗' };
      [`jms-step-${stepId}`, `jms-fs-step-${stepId}`].forEach(id => {
        const el = $e(id);
        if (!el) return;
        el.className = `jms-timeline-step jms-step--${status}`;
        const icon = el.querySelector('.jms-step-icon');
        if (icon) icon.textContent = icons[status] || '◯';
        if (detail) {
          let d = el.querySelector('.jms-step-detail');
          if (!d) { d = document.createElement('span'); d.className = 'jms-step-detail'; el.appendChild(d); }
          d.textContent = detail;
        }
      });
    }

    function showSuggestions(suggestions) {
      const list   = $e('jms-suggestions-list');
      const section = $e('jms-engine-suggestions');
      const fsSug  = $e('jms-fs-suggestions');
      if (!suggestions || !suggestions.length) return;
      const makeHtml = () => suggestions.map(s =>
        `<button class="jms-suggestion-btn" type="button" data-cmd="${escHtml(s)}">▸ ${escHtml(s)}</button>`
      ).join('');
      if (list)  { list.innerHTML = makeHtml(); section?.classList.add('active'); }
      if (fsSug) { fsSug.innerHTML = makeHtml(); }
      $e('jms-engine-ui')?.classList.add('has-content');
      // Botões são re-renderizados; binds vão por delegação no boot (handler no document)
    }

    // Delegação global de cliques em botões de sugestão (evita re-bind ao re-renderizar)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest?.('.jms-suggestion-btn');
      if (!btn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd || btn.textContent.replace(/^▸\s*/, '').trim();
      clearEngineUI();
      voice.sendTextCommand(cmd);
    });

    function renderOpsHistory() {
      const el = $e('jms-ops-history');
      if (!el || !window.__jamesEngine) return;
      const logs = window.__jamesEngine.getHistory(15);
      if (!logs.length) {
        el.innerHTML = '<p class="jms-ops-empty">Nenhuma operação ainda.</p>';
        return;
      }
      el.innerHTML = logs.map(log => {
        const t = new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const cls = log.status === 'completed' ? 'ok' : 'err';
        return `<div class="jms-ops-item jms-ops-item--${cls}">
          <span class="jms-ops-time">${t}</span>
          <span class="jms-ops-intent">${(log.intent || '?').split('/')[1] || log.intent}</span>
          <span class="jms-ops-cmd">${(log.command || '').slice(0, 55)}</span>
        </div>`;
      }).join('');
    }

    function onEngineResult(er) {
      if (!er) return;

      if (er.type === 'confirmation_request') {
        showConfirmCard(er.text, er.entities);
        return;
      }

      if (er.type === 'needs_info') {
        // Mostra entidades parciais já capturadas + a pergunta
        clearEngineUI();
        if (er.entities) showEntityChips(er.entities);
        const ct = $e('jms-engine-confirm-text');
        if (ct) {
          ct.textContent = er.text;
          $e('jms-engine-confirm')?.classList.add('active');
          // Esconde botões de confirmar/cancelar quando é needs_info (responde por voz/texto)
          const btns = document.querySelector('.jms-engine-confirm__btns');
          if (btns) btns.style.display = 'none';
          $e('jms-engine-ui')?.classList.add('has-content');
          setPanelOpen(true);
        }
        return;
      }

      if (er.type === 'executed') {
        hideConfirmCard();
        // Reabilita botões caso tenham sido escondidos no needs_info anterior
        const btns = document.querySelector('.jms-engine-confirm__btns');
        if (btns) btns.style.display = '';

        // Mostra chips se houver entidades extraídas
        const ctx = window.__jamesEngine?.getContext?.() || {};
        if (Object.keys(ctx).length > 1) showEntityChips(ctx);

        if (er.steps && er.steps.length) {
          showTimeline(er.steps);
          // Pequeno delay escalonado pra dar sensação de "rodando"
          er.steps.forEach((s, i) => {
            setTimeout(() => updateTimelineStep(s.id, s.status || 'success', null), 80 * i);
          });
        }
        if (er.suggestions && er.suggestions.length) {
          setTimeout(() => showSuggestions(er.suggestions), 600);
        }
        setTimeout(renderOpsHistory, 800);
        return;
      }

      if (er.type === 'cancelled') {
        clearEngineUI();
        return;
      }
    }

    // Subscreve step listener do engine — atualiza timeline em tempo real
    if (window.__jamesEngine) {
      window.__jamesEngine.onStep(({ step, status, detail }) => {
        if (status === 'pending') {
          // Cria elemento se não existir (timeline incremental)
          [
            { listId: 'jms-timeline-list',    section: 'jms-engine-timeline', prefix: 'jms-' },
            { listId: 'jms-fs-timeline-list', section: null,                  prefix: 'jms-fs-' },
          ].forEach(({ listId, section, prefix }) => {
            const list = $e(listId);
            const stepId = `${prefix}step-${step.id}`;
            if (list && !$e(stepId)) {
              const li = document.createElement('li');
              li.id = stepId;
              li.className = 'jms-timeline-step jms-step--pending';
              li.innerHTML = `<span class="jms-step-icon">◯</span><span class="jms-step-label">${escHtml(step.label)}</span>`;
              list.appendChild(li);
            }
            if (section) $e(section)?.classList.add('active');
          });
          $e('jms-engine-ui')?.classList.add('has-content');
        }
        updateTimelineStep(step.id, status, detail);
      });
    }

    // Atualiza histórico quando engine cria um log (real-time)
    window.addEventListener('fly:data-update', (e) => {
      if (e?.detail?.entity === 'james_log') {
        renderOpsHistory();
      }
    });

    /* ===================================================================== */

    // Cria o voice hook com handlers
    const voice = createJamesVoice({
      onStatusChange: updateStatusUI,
      onTranscript:   updateTranscript,
      onJamesMessage: (txt) => { updateReply(txt); },
      onMessage:      appendMessage,
      onUserMessage:  () => { clearEngineUI(); },
      onListenStart:  () => { vizPanel.start(); vizFS.start(); },
      onListenEnd:    () => { /* fake/stop tratado em status */ },
      onSpeakStart:   () => {},
      onSpeakEnd:     () => {},
      onError:        setError,
      onIAError:      (msg) => { setError('IA real falhou: ' + msg + ' (usando modo simulado)'); },
      onSourceChange: (src) => {
        if (src === 'thinking-real') setAIBadge('PENSANDO…', true);
        else if (src === 'real') setAIBadge('IA REAL ✓', true);
        else if (src === 'mock') setAIBadge('MOCK', false);
        else if (src === 'engine') setAIBadge('ENGINE ✓', true);
      },
      onEngineResult,
      onWakeWord:     () => { setPanelOpen(true); },
      onStart:        () => {
        setError(null);
        updatePowerButton(true);
        ui.activate.textContent = 'James ativo';
        ui.activate.disabled = true;
        ui.fsActivate.disabled = true;
      },
      onStop:         () => {
        updatePowerButton(false);
        ui.activate.textContent = 'Ativar James';
        ui.activate.disabled = false;
        ui.fsActivate.disabled = false;
      },
    });

    // ----- Bindings -----
    orbEl.addEventListener('click', () => {
      setPanelOpen(!panelOpen);
      if (!panelOpen) setTimeout(renderOpsHistory, 300);
    });

    // Confirma operação pendente (botão)
    $e('jms-confirm-yes')?.addEventListener('click', async () => {
      if (!window.__jamesEngine?.hasPendingOp()) return;
      hideConfirmCard();
      const er = await window.__jamesEngine.confirm();
      if (!er) return;
      onEngineResult(er);
      updateReply(er.text || 'Operação concluída, Chefe.');
      voice.speakText(er.text || 'Operação concluída.');
    });

    // Cancela operação pendente (botão)
    $e('jms-confirm-no')?.addEventListener('click', () => {
      window.__jamesEngine?.cancel();
      clearEngineUI();
      const msg = 'Certo, Chefe. Operação cancelada.';
      updateReply(msg);
      voice.speakText(msg);
    });

    ui.close.addEventListener('click', () => setPanelOpen(false));

    ui.activate.addEventListener('click', async () => {
      setPanelOpen(true);
      await voice.startJames();
    });
    ui.fsActivate.addEventListener('click', async () => {
      await voice.startJames();
    });

    ui.stop.addEventListener('click', () => voice.stopJames());
    ui.fsStop.addEventListener('click', () => voice.stopJames());

    ui.fsOpen.addEventListener('click', () => {
      setFullscreen(true);
    });
    ui.fsClose.addEventListener('click', () => setFullscreen(false));

    // Input de TEXTO — enviar pergunta por digitação
    const textInput = $('jms-text-input');
    const textSendBtn = $('jms-text-send');
    function sendTextFromInput() {
      const txt = textInput.value.trim();
      if (!txt) return;
      textInput.value = '';
      // Garante painel aberto
      setPanelOpen(true);
      voice.sendTextCommand(txt);
    }
    textInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextFromInput();
      }
    });
    textSendBtn?.addEventListener('click', sendTextFromInput);

    // ESC fecha fullscreen
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (fsEl.classList.contains('open')) setFullscreen(false);
        else if (panelEl.classList.contains('open')) setPanelOpen(false);
      }
    });

    // Comandos rápidos do command center
    fsEl.querySelectorAll('.jms-quick__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd || btn.textContent.trim();
        setFullscreen(true);
        voice.sendTextCommand(cmd);
      });
    });

    // Shift+click no orbe liga/desliga (atalho rápido)
    orbEl.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        voice.toggleJames();
      }
    }, true);

    /* ----- Configuração de IA dentro do painel ----- */
    const configBtn   = $('jms-config-ai');
    const configForm  = $('jms-config-form');
    const keyAnth     = $('jms-key-anthropic');
    const keyOA       = $('jms-key-openai');
    const saveKeysBtn = $('jms-save-keys');
    const cancelKeysBtn = $('jms-cancel-keys');
    const configStatus = $('jms-config-status');

    configBtn?.addEventListener('click', () => {
      configForm.style.display = configForm.style.display === 'none' ? 'block' : 'none';
      // Pré-popula com chaves atuais (mascaradas)
      if (window.__jamesBrain) {
        const k = window.__jamesBrain.getKeys();
        keyAnth.value = k.anthropic || '';
        keyOA.value = k.openai || '';
      }
      // Sincroniza toggles de voz com localStorage
      const sttToggle = $('jms-stt-eleven-toggle');
      const ttsToggle = $('jms-tts-browser-toggle');
      if (sttToggle) sttToggle.checked = localStorage.getItem('fly_stt_use_eleven') === '1';
      if (ttsToggle) ttsToggle.checked = localStorage.getItem('fly_tts_force_browser') === '1';
    });

    /* ----- Voz oficial do James (ElevenLabs) ----- */
    const testVoiceBtn = $('jms-test-voice');
    const testSttBtn   = $('jms-test-stt');
    const sttToggle    = $('jms-stt-eleven-toggle');
    const ttsToggleBr  = $('jms-tts-browser-toggle');
    const voiceStatus  = $('jms-voice-status');
    const speedSlider  = $('jms-voice-speed');
    const speedVal     = $('jms-voice-speed-val');

    function setVoiceStatus(html, color) {
      if (!voiceStatus) return;
      voiceStatus.innerHTML = `<span style="color:${color || '#ffd770'}">${html}</span>`;
    }

    // ----- Slider de velocidade da voz -----
    if (speedSlider && window.__jamesVoiceEleven?.getSpeed) {
      const cur = window.__jamesVoiceEleven.getSpeed();
      speedSlider.value = cur;
      if (speedVal) speedVal.textContent = cur.toFixed(2) + 'x';
    }
    speedSlider?.addEventListener('input', () => {
      if (speedVal) speedVal.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x';
    });
    speedSlider?.addEventListener('change', () => {
      const v = parseFloat(speedSlider.value);
      window.__jamesVoiceEleven?.setSpeed?.(v);
      setVoiceStatus(`✓ Velocidade ajustada para ${v.toFixed(2)}x. Próximas falas usam essa velocidade.`, '#6dffb0');
    });

    testVoiceBtn?.addEventListener('click', async () => {
      if (!window.__jamesVoiceEleven) {
        setVoiceStatus('⚠ Cliente ElevenLabs não carregado.', '#ff6464');
        return;
      }
      setVoiceStatus('🔊 Tocando teste pela voz oficial do James...');
      const text = 'Fale comigo, Chefe. James está online.';
      const audio = await window.__jamesVoiceEleven.speak(text, {
        onEnd: () => setVoiceStatus('✓ Voz oficial funcionando perfeitamente.', '#6dffb0'),
      });
      if (audio === null) {
        setVoiceStatus('⚠ ElevenLabs falhou — verifique env vars no Vercel (ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID). Fallback: voz do navegador.', '#ff9b3a');
        // Tenta browser como fallback no teste
        speakBrowser(text);
      }
    });

    testSttBtn?.addEventListener('click', async () => {
      if (!window.__jamesVoiceEleven) {
        setVoiceStatus('⚠ Cliente ElevenLabs não carregado.', '#ff6464');
        return;
      }
      setVoiceStatus('🎤 Fale alguma coisa pro James (até 30s, ou pare em silêncio)...');
      try {
        const result = await window.__jamesVoiceEleven.recordAndTranscribe({
          maxMs: 30000, silenceMs: 1500, languageCode: 'por', modelId: 'scribe_v1',
          onStatus: (s) => {
            if (s === 'recording')      setVoiceStatus('🔴 Gravando... fale agora.', '#ff6464');
            if (s === 'transcribing')   setVoiceStatus('💭 Transcrevendo via ElevenLabs Scribe...', '#40b4ff');
          },
        });
        const txt = (result?.text || '').trim() || '(silêncio)';
        setVoiceStatus(`✓ Você disse: "${txt}"`, '#6dffb0');
      } catch (e) {
        setVoiceStatus(`⚠ STT falhou: ${e?.message || e}`, '#ff6464');
      }
    });

    sttToggle?.addEventListener('change', () => {
      if (sttToggle.checked) localStorage.setItem('fly_stt_use_eleven', '1');
      else localStorage.removeItem('fly_stt_use_eleven');
      setVoiceStatus(sttToggle.checked
        ? '✓ STT via ElevenLabs Scribe ativado (qualidade superior).'
        : 'STT via ElevenLabs desativado — usando Web Speech API do navegador.', '#ffd770');
    });

    ttsToggleBr?.addEventListener('change', () => {
      if (ttsToggleBr.checked) localStorage.setItem('fly_tts_force_browser', '1');
      else localStorage.removeItem('fly_tts_force_browser');
      setVoiceStatus(ttsToggleBr.checked
        ? 'Voz do navegador FORÇADA (ignora ElevenLabs).'
        : '✓ Voz oficial ElevenLabs ativada (com fallback para navegador).', '#ffd770');
    });

    cancelKeysBtn?.addEventListener('click', () => {
      configForm.style.display = 'none';
      configStatus.textContent = '';
    });

    saveKeysBtn?.addEventListener('click', async () => {
      const ka = keyAnth.value.trim();
      const ko = keyOA.value.trim();
      if (!ka && !ko) {
        configStatus.innerHTML = '<span style="color:#ff8a8a">Cole pelo menos 1 chave (Anthropic ou OpenAI)</span>';
        return;
      }
      if (window.__jamesBrain) {
        window.__jamesBrain.setKey('anthropic', ka);
        window.__jamesBrain.setKey('openai', ko);
      } else {
        if (ka) localStorage.setItem('fly_james_anthropic_key', ka);
        if (ko) localStorage.setItem('fly_james_openai_key', ko);
      }
      configStatus.innerHTML = '<span style="color:#ffd770">Testando chave...</span>';
      try {
        const result = await window.__jamesBrain.generateRealResponse('Responda apenas "ok" se está online');
        if (result && result.text) {
          configStatus.innerHTML = '<span style="color:#6dffb0">✓ IA conectada! Resposta: "' + result.text.slice(0, 60) + '"</span>';
          updateAIBadge();
          setTimeout(() => { configForm.style.display = 'none'; configStatus.textContent = ''; }, 2500);
        } else {
          configStatus.innerHTML = '<span style="color:#ff8a8a">Resposta vazia. Verifique a chave.</span>';
        }
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('sobrecarregada') || msg.includes('529')) {
          configStatus.innerHTML = '<span style="color:#ffd770">⚠ Anthropic sobrecarregada agora. A chave foi salva — vai funcionar quando descongestionar. Cola uma OpenAI key como fallback se quiser.</span>';
          updateAIBadge();
        } else {
          configStatus.innerHTML = '<span style="color:#ff8a8a">Erro: ' + msg + '</span>';
        }
      }
    });

    /* ----- Conectar Supabase pelo painel do James ----- */
    const sbUrlInput = $('jms-sb-url');
    const sbKeyInput = $('jms-sb-key');
    const sbSaveBtn = $('jms-save-sb');
    const sbTestBtn = $('jms-test-sb');
    const sbDisconnectBtn = $('jms-disconnect-sb');
    const sbStatus = $('jms-sb-status');
    const sbDiag = $('jms-sb-diag');

    // Carrega config existente + roda diagnóstico
    function loadSupabaseConfig() {
      try {
        const sbCfg = JSON.parse(localStorage.getItem('fly_supabase_config') || 'null');
        if (sbCfg) {
          sbUrlInput.value = sbCfg.url || '';
          sbKeyInput.value = sbCfg.anonKey || '';
        }
      } catch (e) {}
    }
    loadSupabaseConfig();

    function diagnoseSupabase() {
      if (!sbDiag) return;
      const cfg = (() => {
        try { return JSON.parse(localStorage.getItem('fly_supabase_config') || 'null'); }
        catch (e) { return null; }
      })();
      const flySyncStatus = window.__flySync?.status?.();
      const syncStatusEl = document.getElementById('syncStatus');
      const oldSysStatus = syncStatusEl?.dataset?.status || 'desconhecido';

      let html = '<div style="font-size:10px; line-height:1.6; padding:8px 10px; background:rgba(0,0,0,0.3); border-radius:6px; margin-bottom:8px;">';
      html += '<strong style="color:#ffd770">Diagnóstico:</strong><br>';

      if (cfg) {
        html += `📁 Config local: <span style="color:#6dffb0">✓</span> (${cfg.url ? cfg.url.replace('https://','').slice(0,30) : '?'})<br>`;
        const keyType = (cfg.anonKey || '').startsWith('eyJ') ? '✓ formato JWT correto' : (cfg.anonKey || '').startsWith('sb_publishable') ? '⚠ formato publishable (antigo)' : '✗ formato desconhecido';
        const keyColor = keyType.startsWith('✓') ? '#6dffb0' : '#ff8a8a';
        html += `🔑 Chave: <span style="color:${keyColor}">${keyType}</span><br>`;
      } else {
        html += '📁 Config local: <span style="color:#ff8a8a">✗ sem config</span><br>';
      }

      html += `🔌 Sistema novo (sync.js): <span style="color:${flySyncStatus?.online ? '#6dffb0' : '#ff8a8a'}">${flySyncStatus?.online ? '✓ online' : '✗ offline'}</span><br>`;
      html += `🔌 Sistema antigo (index.html): <span style="color:${oldSysStatus === 'online' ? '#6dffb0' : '#ff8a8a'}">${oldSysStatus}</span><br>`;

      html += '</div>';
      sbDiag.innerHTML = html;
    }
    diagnoseSupabase();
    setInterval(diagnoseSupabase, 3000);

    sbSaveBtn?.addEventListener('click', async () => {
      const url = sbUrlInput.value.trim();
      const k = sbKeyInput.value.trim();
      if (!url || !k) {
        sbStatus.innerHTML = '<span style="color:#ff8a8a">Preencha URL e Anon Key</span>';
        return;
      }
      if (!/\.supabase\.co/i.test(url)) {
        sbStatus.innerHTML = '<span style="color:#ff8a8a">URL deve terminar em .supabase.co</span>';
        return;
      }
      if (!k.startsWith('eyJ')) {
        sbStatus.innerHTML = '<span style="color:#ffd770">⚠ A chave deve começar com "eyJ" (JWT). Você colou a chave certa? (NÃO use sb_publishable_)</span>';
        return;
      }
      // Salva config (afeta os 2 sistemas)
      localStorage.setItem('fly_supabase_config', JSON.stringify({ url, anonKey: k }));
      sbStatus.innerHTML = '<span style="color:#ffd770">Conectando…</span>';

      try {
        if (window.__flySync && typeof window.__flySync.init === 'function') {
          const ok = await window.__flySync.init({ url, anonKey: k });
          if (ok) {
            sbStatus.innerHTML = '<span style="color:#6dffb0">✓ Conectado! Recarregando pra aplicar no sistema todo…</span>';
            setTimeout(() => location.reload(), 1500);
          } else {
            sbStatus.innerHTML = '<span style="color:#ff8a8a">Falha. Verifique URL e Key.</span>';
          }
        } else {
          sbStatus.innerHTML = '<span style="color:#ffd770">Config salva. Recarregando…</span>';
          setTimeout(() => location.reload(), 1200);
        }
      } catch (e) {
        sbStatus.innerHTML = '<span style="color:#ff8a8a">Erro: ' + (e.message || e) + '</span>';
      }
    });

    sbTestBtn?.addEventListener('click', async () => {
      const url = sbUrlInput.value.trim() || (window.__flySync?.status?.()?.url);
      const k = sbKeyInput.value.trim();
      if (!url || !k) {
        sbStatus.innerHTML = '<span style="color:#ff8a8a">Preencha URL e Key pra testar</span>';
        return;
      }
      sbStatus.innerHTML = '<span style="color:#ffd770">Testando conexão direta…</span>';
      try {
        // Faz um fetch direto pra REST API do Supabase
        const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/', {
          headers: { 'apikey': k, 'Authorization': 'Bearer ' + k },
        });
        if (r.ok) {
          sbStatus.innerHTML = '<span style="color:#6dffb0">✓ Conexão OK (status ' + r.status + ')</span>';
        } else {
          const txt = await r.text().catch(() => '');
          sbStatus.innerHTML = `<span style="color:#ff8a8a">✗ Status ${r.status}: ${txt.slice(0,100)}</span>`;
        }
      } catch (e) {
        sbStatus.innerHTML = '<span style="color:#ff8a8a">Erro de rede: ' + (e.message || e) + '</span>';
      }
    });

    sbDisconnectBtn?.addEventListener('click', () => {
      if (confirm('RESET Supabase? Vai limpar configuração atual e recarregar. Dados continuam salvos localmente.')) {
        localStorage.removeItem('fly_supabase_config');
        sbUrlInput.value = '';
        sbKeyInput.value = '';
        sbStatus.innerHTML = '<span style="color:#ffd770">Resetado. Recarregando…</span>';
        setTimeout(() => location.reload(), 800);
      }
    });

    // Erro: se SR não disponível
    if (!voice.hasSR) {
      setError('Reconhecimento de voz não disponível neste navegador. Use Chrome ou Edge para melhor experiência.');
    }

    // Expor pra debug e integrações externas
    window.__james = {
      voice,
      open: () => { setPanelOpen(true); setTimeout(renderOpsHistory, 300); },
      close: () => setPanelOpen(false),
      fullscreen: () => setFullscreen(true),
      start: () => voice.startJames(),
      stop: () => voice.stopJames(),
      state: () => voice.getState(),
      messages: () => voice.getMessages(),
      engine: window.__jamesEngine,
      send: (txt) => { setPanelOpen(true); voice.sendTextCommand(txt); },
    };

    // Renderiza histórico ao abrir o fullscreen
    fsEl.addEventListener('transitionend', () => {
      if (fsEl.classList.contains('open')) renderOpsHistory();
    });

    // Atualiza ops history periodicamente quando painel ou fullscreen estiver aberto
    setInterval(() => {
      if (panelEl.classList.contains('open') || fsEl.classList.contains('open')) {
        renderOpsHistory();
      }
    }, 8000);

    // Renderiza o histórico no boot para mostrar logs anteriores
    renderOpsHistory();

    // 💡 Sugestões inteligentes — refresh quando painel abre + botão manual
    function refreshSuggestions() {
      const host = document.getElementById('jms-suggestions-host');
      if (!host || !window.__flySuggestions) return;
      window.__flySuggestions.render(host);
    }
    document.getElementById('jms-suggestions-refresh')?.addEventListener('click', refreshSuggestions);

    // 🌐 Botão Reconciliar — preview + confirmação + execução
    document.getElementById('jms-reconcile-btn')?.addEventListener('click', () => {
      if (!window.__flyReconcile) { alert('Reconciliador não disponível.'); return; }
      const dry = window.__flyReconcile.reconcileEverything({ dryRun: true });
      const legacy = dry.legacy || {};
      const sel = dry.sellers || {};
      const inf = dry.influencers || {};
      const lines = [
        `🔍 SIMULAÇÃO DE RECONCILIAÇÃO`,
        ``,
        `Importação de produtos legados (fly_7anos_data_v1):`,
        `  • ${legacy.products_scanned || 0} produto(s) varridos`,
        `  • ${legacy.sellers_created || 0} vendedor(es) novos`,
        `  • ${legacy.influencers_created || 0} influencer(s) novos`,
        `  • ${legacy.customers_created || 0} cliente(s) novos`,
        `  • ${legacy.metas_created || 0} meta(s) novas`,
        `  • ${legacy.product_metrics_updated || 0} produto(s) com métricas atualizadas`,
        ``,
        `Atribuição de vendas existentes:`,
        `  • ${sel.matched || 0} venda(s) → ${sel.sellersUpdated || 0} vendedor(es)`,
        `  • ${inf.matched || 0} venda(s) → ${inf.influencersUpdated || 0} influencer(s)`,
        ``,
        `Confirmar a execução?`,
      ].join('\n');
      if (!confirm(lines)) return;
      const result = window.__flyReconcile.reconcileEverything();
      const r = result.legacy || {};
      const s = result.sellers || {};
      const i = result.influencers || {};
      const m = result.metas || {};
      alert(
        `✓ RECONCILIAÇÃO CONCLUÍDA\n\n` +
        `Importados: ${r.sellers_created || 0} vendedor(es), ${r.influencers_created || 0} influencer(s), ${r.customers_created || 0} cliente(s), ${r.metas_created || 0} meta(s).\n` +
        `Atribuições: ${s.matched || 0} vendas→vendedores, ${i.matched || 0} vendas→influencers.\n` +
        `Metas recalculadas: ${m.metasUpdated || 0}.`
      );
      refreshSuggestions();
    });
    // Render inicial após pequeno delay (pra dar tempo dos modules carregarem)
    setTimeout(refreshSuggestions, 500);
    // Refresh quando painel é aberto
    orbEl.addEventListener('click', () => setTimeout(refreshSuggestions, 200));
  }

  // ----------------- Boot quando DOM pronto -----------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
