/* =====================================================================
   JAMES BRAIN — FASE 2
   Conexão com IA real (Anthropic Claude / OpenAI) + executor de comandos
   ===================================================================== */
(function jamesBrainReal() {
  'use strict';

  /* ----------------------------------------------------------
     1 · STORAGE de chaves de API
     ---------------------------------------------------------- */
  function getKeys() {
    return {
      openai:    localStorage.getItem('fly_james_openai_key')    || '',
      anthropic: localStorage.getItem('fly_james_anthropic_key') || '',
    };
  }
  function setKey(provider, value) {
    const k = provider === 'anthropic' ? 'fly_james_anthropic_key' : 'fly_james_openai_key';
    localStorage.setItem(k, value || '');
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

    return ctx;
  }

  /* ----------------------------------------------------------
     3 · SYSTEM PROMPT
     ---------------------------------------------------------- */
  function buildSystemPrompt(context) {
    return `Você é JAMES, assistente de IA do Ecossistema Fly (turismo de luxo focado em Dubai, com Plano WAR de expansão, Cofre AEY financeiro entre sócios, Fly Cup de eventos esportivos, Central de Vendas e CRM).

PERSONALIDADE:
- Trate o usuário sempre como "Chefe".
- Tom executivo, direto, confiante. Levemente sarcástico quando óbvio.
- Respostas CURTAS pra voz (1-3 frases, máx 50 palavras).
- Português brasileiro. Sem markdown, sem listas longas, sem emojis.
- Quando tiver dado real, CITE o número. Quando não tiver, diga "não tenho esse dado cadastrado".
- NUNCA invente dados.

CAPACIDADES DE EXECUÇÃO:
Quando o Chefe pedir pra ABRIR alguma tela, você PODE responder com um comando especial no final da resposta no formato:
[ACTION:nome_da_acao]

Ações disponíveis:
- [ACTION:open_cofre]      — abre o Cofre AEY
- [ACTION:open_war]        — abre o Plano WAR
- [ACTION:open_dashboard]  — abre o Dashboard Supremo
- [ACTION:open_expansoes]  — abre painel de Expansões (CRM, Projetos, Ranking, etc)
- [ACTION:close_all]       — fecha overlays abertos

Exemplo:
Usuário: "James, abre o cofre"
Você: "Abrindo o Cofre AEY agora, Chefe. [ACTION:open_cofre]"

DADOS ATUAIS DO ECOSSISTEMA (JSON):
${JSON.stringify(context, null, 2)}

Modo de dados: ${context.mode}`;
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
    if (!text) return { cleanText: '', actions: [] };
    const actionRegex = /\[ACTION:([a-z_]+)\]/gi;
    const actions = [];
    const cleanText = text.replace(actionRegex, (_, name) => {
      actions.push(name.toLowerCase());
      return '';
    }).trim();
    // Executa
    for (const a of actions) {
      try {
        const fn = ACTIONS[a];
        if (fn) {
          const ok = fn();
          console.log('[JAMES Brain] Ação:', a, ok ? '✓ executada' : '⚠ não disponível');
        } else {
          console.warn('[JAMES Brain] Ação desconhecida:', a);
        }
      } catch (e) {
        console.error('[JAMES Brain] Erro ao executar', a, e);
      }
    }
    return { cleanText, actions };
  }

  /* ----------------------------------------------------------
     5 · CHAMADA À IA (Anthropic preferencial, OpenAI fallback)
     ---------------------------------------------------------- */
  let conversationHistory = []; // multi-turn

  async function callAnthropic(userText, systemPrompt, key) {
    // Mantém últimas 6 mensagens pra contexto
    const recent = conversationHistory.slice(-6);
    const messages = recent.concat([{ role: 'user', content: userText }]);

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
        max_tokens: 250,
        system: systemPrompt,
        messages,
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error(`Anthropic ${r.status}: ${err.slice(0, 200)}`);
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
        max_tokens: 250,
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
  async function generateRealResponse(userText) {
    const keys = getKeys();
    if (!keys.anthropic && !keys.openai) {
      return null; // sem IA, usa mock
    }
    const ctx = buildFlyContext();
    const sys = buildSystemPrompt(ctx);

    let replyRaw;
    try {
      if (keys.anthropic) {
        replyRaw = await callAnthropic(userText, sys, keys.anthropic);
      } else {
        replyRaw = await callOpenAI(userText, sys, keys.openai);
      }
    } catch (e) {
      console.error('[JAMES Brain Real] Erro:', e);
      throw e;
    }

    // Parseia e executa ações
    const { cleanText, actions } = parseAndExecuteActions(replyRaw);

    // Salva no histórico (sem ACTION tags)
    conversationHistory.push({ role: 'user', content: userText });
    conversationHistory.push({ role: 'assistant', content: cleanText });
    if (conversationHistory.length > 14) conversationHistory = conversationHistory.slice(-14);

    return { text: cleanText, actions };
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
