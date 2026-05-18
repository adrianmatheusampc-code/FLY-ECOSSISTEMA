/* =====================================================================
   JAMES BRAIN — FASE 2
   Conexão com IA real (Anthropic Claude / OpenAI) + executor de comandos
   ===================================================================== */
(function jamesBrainReal() {
  'use strict';

  /* ----------------------------------------------------------
     1 · STORAGE de chaves de API
     A chave CRUA fica só em localStorage local (fly_james_*_key),
     NUNCA sincronizada. O que sincroniza entre aparelhos é um
     pacote EMBARALHADO (fly_james_keys_v1) — não é cripto militar,
     mas impede que alguém com a anon key leia a chave crua direto
     da tabela pública. O site ainda está atrás de senha (Basic
     Auth), então o JS com o desembaralhador não é público.
     ---------------------------------------------------------- */
  var J_SYNC_KEY = 'fly_james_keys_v1';
  var J_PASS = 'fly7anos::james::v1::shuffle::Nf83@x';
  function _xor(str, pass) {
    var o = '';
    for (var i = 0; i < str.length; i++) o += String.fromCharCode(str.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
    return o;
  }
  function _obf(s) { if (!s) return ''; try { return btoa(unescape(encodeURIComponent(_xor(s, J_PASS)))); } catch (e) { return ''; } }
  function _deobf(s) { if (!s) return ''; try { return _xor(decodeURIComponent(escape(atob(s))), J_PASS); } catch (e) { return ''; } }

  // Reconcilia chave crua local <-> pacote sincronizado.
  // Roda barato a cada getKeys (robusto a ordem de load/pull).
  function reconcileKeys() {
    try {
      var a = localStorage.getItem('fly_james_anthropic_key') || '';
      var o = localStorage.getItem('fly_james_openai_key') || '';
      var bundleRaw = localStorage.getItem(J_SYNC_KEY);
      var bundle = null;
      if (bundleRaw) { try { bundle = JSON.parse(bundleRaw); } catch (e) {} }
      // Caso 1: não tenho chave local mas chegou o pacote (de outro
      // aparelho via sync) -> desembaralha e popula a chave local.
      if (!a && !o && bundle) {
        var ba = _deobf(bundle.a || ''), bo = _deobf(bundle.o || '');
        if (ba) localStorage.setItem('fly_james_anthropic_key', ba);
        if (bo) localStorage.setItem('fly_james_openai_key', bo);
        return;
      }
      // Caso 2: tenho chave local -> garante que o pacote sincronizado
      // reflete ela (auto-migra deste PC pra todos os aparelhos).
      if (a || o) {
        var want = JSON.stringify({ a: _obf(a), o: _obf(o) });
        if (bundleRaw !== want) localStorage.setItem(J_SYNC_KEY, want);
      }
    } catch (e) {}
  }

  function getKeys() {
    reconcileKeys();
    return {
      openai:    localStorage.getItem('fly_james_openai_key')    || '',
      anthropic: localStorage.getItem('fly_james_anthropic_key') || '',
    };
  }
  function setKey(provider, value) {
    const k = provider === 'anthropic' ? 'fly_james_anthropic_key' : 'fly_james_openai_key';
    localStorage.setItem(k, value || '');
    // Atualiza o pacote sincronizado na hora (propaga pros sócios).
    try {
      var a = localStorage.getItem('fly_james_anthropic_key') || '';
      var o = localStorage.getItem('fly_james_openai_key') || '';
      localStorage.setItem(J_SYNC_KEY, JSON.stringify({ a: _obf(a), o: _obf(o) }));
    } catch (e) {}
  }

  /* ----------------------------------------------------------
     2 · CONTEXTO do FLY — coleta snapshot pra system prompt
     ---------------------------------------------------------- */
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }

  function buildFlyContext() {
    const mode = localStorage.getItem('fly_data_mode') || 'demo';

    const ctx = { mode };

    // Cofre AEY
    try {
      if (window.__flyCofreAPI) {
        ctx.cofre = {
          mode: window.__flyCofreAPI.mode?.(),
          caixa_fly: window.__flyCofreAPI.totalCaixaFly?.(),
          caixa_pessoal_total: window.__flyCofreAPI.totalCaixaPersonal?.(),
          fatura_aberta_total: window.__flyCofreAPI.invoiceOpenTotal?.(),
          socios: window.__flyCofreAPI.partners?.()?.map(p => ({
            nome: p,
            saldo: window.__flyCofreAPI.partnerBalance?.(p),
          })),
        };
      }
    } catch (e) {}

    // Plano WAR
    try {
      const wars = readJSON(`fly_war_territories_v1_${mode}`, null) || readJSON('fly_war_territories_v1', []) || [];
      const flows = readJSON(`fly_war_connections_v1_${mode}`, null) || readJSON('fly_war_connections_v1', []) || [];
      ctx.war = {
        pontos: wars.length,
        conexoes: flows.length,
        territorios: wars.slice(0, 10).map(x => ({ nome: x.name, layers: x.layers, status: x.status })),
      };
    } catch (e) {}

    // Vendas/Customers
    try {
      const sales = readJSON(`fly_sales_v1_${mode}`, null) || readJSON('fly_sales_v1', []) || [];
      const customers = readJSON(`fly_customers_v1_${mode}`, null) || readJSON('fly_customers_v1', []) || [];
      ctx.vendas = {
        total: sales.length,
        ultimas: sales.slice(0, 5).map(s => ({ nome: s.name, produto: s.product, valor: s.amount, status: s.status })),
      };
      ctx.clientes = {
        total: customers.length,
        querem_dubai: customers.filter(c => c.desire_dubai).length,
      };
    } catch (e) {}

    // Fly Cup
    try {
      const polos = readJSON(`fly_cup_polos_v1_${mode}`, null) || readJSON('fly_cup_polos_v1', []) || [];
      const atletas = readJSON(`fly_cup_atletas_v1_${mode}`, null) || readJSON('fly_cup_atletas_v1', []) || [];
      ctx.flyCup = {
        polos: polos.length,
        atletas: atletas.length,
        modalidades: [...new Set(polos.map(p => p.modalidade))].filter(Boolean),
      };
    } catch (e) {}

    // CONTEXTO NAVEGACIONAL — onde o Chefe está AGORA (JamesContext)
    try {
      if (window.__jamesContext) {
        ctx.navegacao = window.__jamesContext.getContext();
      }
    } catch (e) {}

    // OPERAÇÕES — estado do sistema operacional vivo (FlyOps)
    try {
      if (window.__flyOps && window.__flyOps.summary) {
        ctx.operacoes = window.__flyOps.summary();
      }
    } catch (e) {}

    return ctx;
  }

  /* ----------------------------------------------------------
     3 · SYSTEM PROMPT
     ---------------------------------------------------------- */
  function buildSystemPrompt(context) {
    const actionsPrompt = (window.__jamesActions && typeof window.__jamesActions.promptSection === 'function')
      ? window.__jamesActions.promptSection()
      : '';

    // PDFs anexados na sessão (se houver) — injetados como contexto
    const docsPrompt = (window.__jamesPdfReader && typeof window.__jamesPdfReader.buildContextSection === 'function')
      ? window.__jamesPdfReader.buildContextSection()
      : '';

    // CONTEXTO DE TELA — o James "vê" onde o Chefe está navegando
    const nav = context.navegacao || null;
    const navPrompt = nav ? `

CONTEXTO DE TELA AGORA (o Chefe está vendo isto neste momento):
- Módulo atual: ${nav.currentModule}
- Página atual: ${nav.currentPage}
- Aba ativa: ${nav.currentTab || '(nenhuma)'}
- Item/entidade aberto: ${nav.selectedEntity ? `${nav.selectedEntity.type} "${nav.selectedEntity.name}" (id: ${nav.selectedEntity.id})` : '(nenhum)'}
- Última ação do Chefe: ${nav.lastUserAction ? nav.lastUserAction.type : '(nenhuma)'}
- Telas recentes: ${(nav.recentNavigation || []).slice(-5).map(n => `${n.module}/${n.page}`).join(' → ') || '(início)'}
- Prints enviados nesta sessão: ${nav.uploadedScreenshots && nav.uploadedScreenshots.length ? nav.uploadedScreenshots.length + ' (analise as imagens anexadas)' : 'nenhum'}

REGRA DE CONSCIÊNCIA DE TELA:
- SEMPRE responda levando em conta o módulo, página, aba e entidade acima.
- Se o Chefe disser "esse produto", "essa tela", "aqui", "isso" — ele se refere ao item/aba acima.
- Quando fizer sentido, dê uma DICA curta e proativa do que ele pode fazer nessa tela.
- Se houver prints anexados, descreva o que vê e oriente com base na imagem real.` : '';

    return `Você é JAMES, assistente de IA do Ecossistema Fly (turismo de luxo focado em Dubai, com Plano WAR de expansão, Cofre AEY financeiro entre sócios, Fly Cup de eventos esportivos, Central de Vendas e CRM).

PERSONALIDADE:
- Trate o usuário sempre como "Chefe".
- Tom executivo, direto, confiante. Levemente sarcástico quando óbvio.
- Respostas CURTAS pra voz (1-3 frases, máx 50 palavras).
- Português brasileiro. Sem markdown, sem listas longas, sem emojis.
- Quando tiver dado real, CITE o número. Quando não tiver, diga "não tenho esse dado cadastrado".
- NUNCA invente dados.

REGRA CRÍTICA DE EXECUÇÃO:
- Quando o Chefe pedir pra CADASTRAR, LANÇAR, ADICIONAR, CRIAR, ABRIR, MUDAR algo no painel,
  você DEVE executar a ação correspondente usando o formato [ACTION:nome]{json_params}.
- SEMPRE confirme a ação no texto ANTES de emitir o ACTION.
- Se faltar dado essencial (nome, valor), PERGUNTE primeiro. Não invente.
- Você pode emitir múltiplas ACTIONs em sequência se precisar.
${actionsPrompt}

DADOS ATUAIS DO ECOSSISTEMA (JSON):
${JSON.stringify(context, null, 2)}

Modo de dados: ${context.mode}${navPrompt}${docsPrompt}`;
  }

  /* ----------------------------------------------------------
     4 · EXECUTOR de comandos no painel
     ---------------------------------------------------------- */
  const ACTIONS = {
    open_cofre() {
      if (typeof window.__flyCofreOpen === 'function') { window.__flyCofreOpen(); return true; }
      // fallback: dispara click no botão se existir
      const btn = document.getElementById('cofreTriggerBtn') || document.querySelector('.cofre-trigger');
      if (btn) { btn.click(); return true; }
      return false;
    },
    open_war() {
      // Plano WAR — tenta vários hooks conhecidos
      if (typeof window.__flyDashboardOpen === 'function') { window.__flyDashboardOpen(); return true; }
      const trigger = document.querySelector('[data-id="fly"]') || document.querySelector('.timeline-planet');
      if (trigger) { trigger.click(); return true; }
      return false;
    },
    open_dashboard() {
      if (typeof window.__flyDashboardOpen === 'function') { window.__flyDashboardOpen(); return true; }
      const btn = document.getElementById('dashboardSupremoTrigger');
      if (btn) { btn.click(); return true; }
      return false;
    },
    open_expansoes() {
      if (typeof window.__flyExpansoesOpen === 'function') { window.__flyExpansoesOpen(); return true; }
      const btn = document.getElementById('flyExpTrigger');
      if (btn) { btn.click(); return true; }
      return false;
    },
    close_all() {
      // Tenta fechar tudo aberto
      document.querySelectorAll('.modal, .overlay, .dash-overlay, .cofre-overlay').forEach(el => {
        el.classList.add('hidden');
      });
      return true;
    },
  };

  function parseAndExecuteActions(text) {
    if (!text) return { cleanText: '', actions: [], results: [] };
    // Regex: captura [ACTION:nome]{json_params_opcional}
    // Aceita JSON com chaves dentro (pra params aninhados)
    const actionRegex = /\[ACTION:([a-z_]+)\](\s*\{[\s\S]*?\})?/gi;
    const actions = [];
    const results = [];

    const cleanText = text.replace(actionRegex, (match, name, jsonStr) => {
      const actionName = name.toLowerCase();
      let params = {};
      if (jsonStr) {
        try {
          params = JSON.parse(jsonStr.trim());
        } catch (e) {
          console.warn('[JAMES Brain] JSON inválido em', actionName, ':', jsonStr);
        }
      }
      actions.push({ name: actionName, params });
      return '';
    }).trim();

    // Executa usando o novo sistema __jamesActions (FASE 3) ou fallback ACTIONS antigo
    for (const a of actions) {
      try {
        let result = null;
        if (window.__jamesActions && typeof window.__jamesActions.execute === 'function') {
          result = window.__jamesActions.execute(a.name, a.params);
        } else if (ACTIONS[a.name]) {
          const ok = ACTIONS[a.name](a.params);
          result = { ok: !!ok, msg: ok ? 'Executado.' : 'Não disponível.' };
        } else {
          result = { ok: false, msg: 'Ação desconhecida: ' + a.name };
        }
        results.push({ name: a.name, params: a.params, result });
        console.log('[JAMES Brain] Ação:', a.name, a.params, '→', result);
      } catch (e) {
        console.error('[JAMES Brain] Erro ao executar', a.name, e);
        results.push({ name: a.name, params: a.params, result: { ok: false, msg: 'Erro: ' + e.message } });
      }
    }
    return { cleanText, actions: actions.map(a => a.name), results };
  }

  /* ----------------------------------------------------------
     5 · CHAMADA À IA (Anthropic preferencial, OpenAI fallback)
     ---------------------------------------------------------- */
  let conversationHistory = []; // multi-turn

  async function callAnthropic(userText, systemPrompt, key, attempt = 1, images = null) {
    // Mantém últimas 6 mensagens pra contexto
    const recent = conversationHistory.slice(-6);
    // Se há imagens, monta content array com blocos image + text (Claude Vision)
    let userContent;
    if (Array.isArray(images) && images.length) {
      userContent = images.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 },
      })).concat([{ type: 'text', text: userText || 'Leia essa imagem e me diga o que tem nela.' }]);
    } else {
      userContent = userText;
    }
    const messages = recent.concat([{ role: 'user', content: userContent }]);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        // Alto o suficiente pra concluir tarefas grandes (vários [ACTION]
        // em sequência) sem cortar no meio. A fala continua curta porque
        // o texto falado é separado das ACTIONs.
        max_tokens: 4000,
        system: systemPrompt,
        messages,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');

      // 529 = overloaded, 429 = rate limit, 503 = unavailable → RETRY
      if ((r.status === 529 || r.status === 429 || r.status === 503) && attempt < 3) {
        const delay = attempt === 1 ? 1500 : 4000;
        console.warn(`[JAMES Brain] Anthropic ${r.status} (sobrecarregado). Tentativa ${attempt + 1}/3 em ${delay}ms...`);
        await new Promise(rs => setTimeout(rs, delay));
        return callAnthropic(userText, systemPrompt, key, attempt + 1, images);
      }

      // Erro detalhado pro usuário
      let msg = `Anthropic ${r.status}`;
      if (r.status === 529) msg = 'Anthropic está sobrecarregada agora. Tente em alguns segundos.';
      else if (r.status === 401) msg = 'Chave Anthropic inválida. Verifique.';
      else if (r.status === 400) msg = 'Requisição inválida ao Anthropic.';
      throw new Error(msg + ' — ' + errText.slice(0, 150));
    }

    const j = await r.json();
    return j.content?.[0]?.text?.trim() || '';
  }

  async function callOpenAI(userText, systemPrompt, key) {
    const recent = conversationHistory.slice(-6);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recent,
      { role: 'user', content: userText },
    ];
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.4,
        max_tokens: 4000,
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error(`OpenAI ${r.status}: ${err.slice(0, 200)}`);
    }
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || '';
  }

  /* ----------------------------------------------------------
     6 · API PÚBLICA
     ---------------------------------------------------------- */
  async function generateRealResponse(userText, opts) {
    // Curto-circuito de OPERAÇÕES — só dispara em padrões claros
    // (criar operação de cliente / consultas de hoje/semana). Qualquer
    // outra coisa cai no fluxo normal da IA.
    try {
      if (window.__flyOps && window.__flyOps.james) {
        const r = window.__flyOps.james(userText);
        if (r && r.ok) return { text: r.msg, actions: ['ops'], results: [{ name: 'ops', result: r }] };
      }
    } catch (e) {}

    const keys = getKeys();
    if (!keys.anthropic && !keys.openai) {
      return null; // sem IA, usa mock
    }
    let images = (opts && Array.isArray(opts.images)) ? opts.images : null;

    // Prints temporários da sessão (JamesContext) → vão pro Vision e depois
    // são DESCARTADOS (regra: print só vive na sessão, nunca persiste).
    let _purgeShots = false;
    try {
      if (window.__jamesContext && typeof window.__jamesContext.getScreenshotsRaw === 'function') {
        const shots = window.__jamesContext.getScreenshotsRaw();
        if (shots && shots.length) {
          const shotImgs = shots.map(s => {
            const raw = String(s.data || '');
            const m = raw.match(/^data:(image\/[a-z.+-]+);base64,(.*)$/i);
            return {
              base64: m ? m[2] : raw,
              mediaType: m ? m[1] : 'image/jpeg',
            };
          });
          images = (images || []).concat(shotImgs);
          _purgeShots = true;
        }
      }
    } catch (e) {}

    const ctx = buildFlyContext();
    const sys = buildSystemPrompt(ctx);

    let replyRaw;
    let lastError = null;

    // Tenta Anthropic primeiro (suporta visão se houver imagens)
    if (keys.anthropic) {
      try {
        replyRaw = await callAnthropic(userText, sys, keys.anthropic, 1, images);
      } catch (e) {
        console.warn('[JAMES Brain] Anthropic falhou:', e.message);
        lastError = e;
        replyRaw = null;
      }
    }

    // Fallback: OpenAI se Anthropic falhou e tem chave OA
    // (não passamos imagens pra OpenAI — fallback só pra texto)
    if (!replyRaw && keys.openai && !images) {
      try {
        console.log('[JAMES Brain] Tentando fallback OpenAI...');
        replyRaw = await callOpenAI(userText, sys, keys.openai);
        lastError = null;
      } catch (e) {
        console.error('[JAMES Brain] OpenAI também falhou:', e.message);
        lastError = e;
        replyRaw = null;
      }
    }

    // Se ambas falharam, propaga o erro
    if (!replyRaw) {
      if (lastError) throw lastError;
      throw new Error('Sem resposta da IA');
    }

    // Parseia e executa ações
    const { cleanText, actions, results } = parseAndExecuteActions(replyRaw);

    // Append feedback das ações executadas no texto final (pro user ver/ouvir)
    let finalText = cleanText;
    if (results && results.length) {
      const feedback = results
        .filter(r => r.result && r.result.msg)
        .map(r => (r.result.ok ? '✓ ' : '⚠ ') + r.result.msg)
        .join(' ');
      if (feedback) {
        finalText = (cleanText ? cleanText + ' ' : '') + feedback;
      }
    }

    // Salva no histórico (sem ACTION tags, com feedback)
    conversationHistory.push({ role: 'user', content: userText });
    conversationHistory.push({ role: 'assistant', content: finalText });
    if (conversationHistory.length > 14) conversationHistory = conversationHistory.slice(-14);

    // Print analisado → descartado (não persiste nada sensível)
    if (_purgeShots) {
      try { window.__jamesContext?.purgeScreenshots?.(); } catch (e) {}
    }

    return { text: finalText, actions, results };
  }

  function clearHistory() {
    conversationHistory = [];
  }

  function isAvailable() {
    const keys = getKeys();
    return !!(keys.anthropic || keys.openai);
  }

  // Expõe API global
  window.__jamesBrain = {
    generateRealResponse,
    isAvailable,
    clearHistory,
    getKeys,
    setKey,
    buildFlyContext,
    executeAction(name) { return ACTIONS[name]?.() || false; },
    listActions: () => Object.keys(ACTIONS),
  };
})();
