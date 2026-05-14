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
    function speak(text, onDone) {
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
      // Fallback caso onend não dispare (Safari bug)
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
        return { reply, isStop: true };
      }

      // Tenta IA real primeiro (Fase 2)
      if (window.__jamesBrain && window.__jamesBrain.isAvailable()) {
        try {
          const result = await window.__jamesBrain.generateRealResponse(userText);
          if (result && result.text) return { reply: result.text, isStop: false };
        } catch (e) {
          console.warn('[JAMES] IA real falhou, usando mock:', e?.message || e);
        }
      }

      // Fallback: mock brain
      const reply = jamesMockBrain.generateJamesResponse(userText);
      return { reply, isStop: false };
    }

    /* ----------------- Capture loop (escuta um comando) ----------------- */
    function captureOnce() {
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
        state.isListening = false;
        handlers.onListenEnd?.();
        const userText = text.trim();
        if (!userText) {
          if (state.isConversationActive) {
            // Sem fala — tenta de novo após pequeno delay
            setTimeout(() => { if (state.isConversationActive) captureOnce(); }, 800);
          } else {
            setStatus(STATUS.IDLE);
          }
          return;
        }

        addMessage('user', userText);
        handlers.onUserMessage?.(userText);

        // Pensando
        setStatus(STATUS.THINKING);
        handlers.onThinkStart?.();

        // Processa comando (real ou mock)
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
      });
      try { recog.start(); } catch (e) { /* ignored */ }
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

      <div class="jms-panel__actions">
        <button class="jms-btn jms-btn--primary" id="jms-activate" type="button">Ativar James</button>
        <button class="jms-btn jms-btn--danger" id="jms-stop" type="button">Encerrar</button>
        <button class="jms-btn jms-btn--ghost jms-btn--block" id="jms-fs-open" type="button">Tela Cheia</button>
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
          <h3>Comandos rápidos</h3>
          <div class="jms-quick">
            <button class="jms-quick__btn" data-cmd="Abrir Plano WAR">▸ Abrir Plano WAR</button>
            <button class="jms-quick__btn" data-cmd="Ver Fly Cup">▸ Ver Fly Cup</button>
            <button class="jms-quick__btn" data-cmd="Gerar relatório">▸ Gerar Relatório</button>
            <button class="jms-quick__btn" data-cmd="Consultar caixa">▸ Consultar Caixa</button>
            <button class="jms-quick__btn" data-cmd="Modo descanso">▸ Modo Descanso</button>
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

    // Cria o voice hook com handlers
    const voice = createJamesVoice({
      onStatusChange: updateStatusUI,
      onTranscript:   updateTranscript,
      onJamesMessage: (txt) => { updateReply(txt); },
      onMessage:      appendMessage,
      onUserMessage:  () => {},
      onListenStart:  () => { vizPanel.start(); vizFS.start(); },
      onListenEnd:    () => { /* fake/stop tratado em status */ },
      onSpeakStart:   () => {},
      onSpeakEnd:     () => {},
      onError:        setError,
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

    // Erro: se SR não disponível
    if (!voice.hasSR) {
      setError('Reconhecimento de voz não disponível neste navegador. Use Chrome ou Edge para melhor experiência.');
    }

    // Expor pra debug
    window.__james = {
      voice,
      open: () => setPanelOpen(true),
      close: () => setPanelOpen(false),
      fullscreen: () => setFullscreen(true),
      start: () => voice.startJames(),
      stop: () => voice.stopJames(),
      state: () => voice.getState(),
      messages: () => voice.getMessages(),
    };
  }

  // ----------------- Boot quando DOM pronto -----------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
