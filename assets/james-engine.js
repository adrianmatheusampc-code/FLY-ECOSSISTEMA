/* =====================================================================
   JAMES ENGINE — FASE 2 + 3
   Orquestrador central: comando → intent → entidades → plano → execução

   window.__jamesEngine = {
     process(command)    → Promise<EngineResult | null>
     confirm()           → Promise<EngineResult>  (executa op pendente)
     cancel()            → cancela op pendente
     correct(updates)    → corrige entidades da op pendente
     onStep(fn)          → subscreve atualizações de steps; retorna unsub()
     getContext()        → contexto operacional atual
     getHistory(n)       → últimos N logs do James
     hasPendingOp()      → boolean
     normalizeProduct(s) → string
     extractEntities(text, parsed) → objeto de entidades
   }

   EngineResult.type:
     'confirmation_request' — pede confirmação antes de executar
     'needs_info'           — falta dado obrigatório, pergunta ao usuário
     'executed'             — executado com sucesso (steps[])
     'cancelled'            — usuário cancelou
   ===================================================================== */
(function jamesEngineBoot() {
  'use strict';

  /* ---------------------------------------------------------------
     UTILS
  --------------------------------------------------------------- */
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function uuid() {
    return 'jop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function getMode() { return localStorage.getItem('fly_data_mode') || 'demo'; }
  function modeKey(base) { return `${base}_${getMode()}`; }
  function dispatchUpdate(detail) {
    window.dispatchEvent(new CustomEvent('fly:data-update', { detail }));
  }

  /* ---------------------------------------------------------------
     NORMALIZADOR DE PRODUTOS
     Aliases incluem variações faladas (voz transcreve em lowercase, sem acentos)
  --------------------------------------------------------------- */
  const PRODUCT_ALIASES = {
    // Dubai Explorer (pacote de entrada)
    'dubai explorer': 'Dubai Explorer',
    'dubai explorar': 'Dubai Explorer',
    'dubai explore':  'Dubai Explorer',
    'explorer':       'Dubai Explorer',
    'pacote de entrada': 'Dubai Explorer',
    'pacote basico':  'Dubai Explorer',
    'pacote inicial': 'Dubai Explorer',
    'entrada':        'Dubai Explorer',

    // Dubai GTA (grand tour)
    'dubai gta':      'Dubai GTA',
    'gta dubai':      'Dubai GTA',
    'gta':            'Dubai GTA',
    'grand tour':     'Dubai GTA',
    'grand tour dubai': 'Dubai GTA',
    'gtá':            'Dubai GTA',

    // Dubai in Love (lua de mel / casais)
    'dubai in love':  'Dubai in Love',
    'in love':        'Dubai in Love',
    'dubai love':     'Dubai in Love',
    'lua de mel':     'Dubai in Love',
    'pacote casal':   'Dubai in Love',
    'pacote romantico': 'Dubai in Love',

    // Billionaire (experiência VIP)
    'dubai billionaire': 'Billionaire',
    'dubai bilionario':  'Billionaire',
    'billionaire':    'Billionaire',
    'bilionario':     'Billionaire',
    'experiencia bilionario': 'Billionaire',
    'billionaire experience': 'Billionaire',
    'pacote vip':     'Billionaire',
    'vip dubai':      'Billionaire',
    'experience':     'Billionaire',

    // Outros produtos
    'fly cup':        'Fly Cup',
    'copa fly':       'Fly Cup',
    'cup':            'Fly Cup',
    'plano war':      'Plano WAR',
    'war':            'Plano WAR',
    'plano de guerra': 'Plano WAR',
  };

  function normalizeText(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[?!,.;:]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Capitaliza primeira letra de cada palavra (para nomes vindos de transcrição de voz)
  function titleCase(s) {
    if (!s) return s;
    return String(s).trim().toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function normalizeProduct(raw) {
    if (!raw) return null;
    const n = normalizeText(raw);
    if (PRODUCT_ALIASES[n]) return PRODUCT_ALIASES[n];
    for (const [alias, canonical] of Object.entries(PRODUCT_ALIASES)) {
      if (n.includes(alias) || (alias.length > 4 && alias.includes(n))) return canonical;
    }
    return raw.replace(/\b\w/g, c => c.toUpperCase());
  }

  /* ---------------------------------------------------------------
     EXTRATORES DE ENTIDADES
     IMPORTANTE: a transcrição de voz vem em lowercase sem acentos.
     Todos os matchers operam case-insensitive e usam normalizeText().
  --------------------------------------------------------------- */
  function extractValue(text) {
    const t = normalizeText(text);

    // "20 mil", "vinte mil" (textual ainda não suportado, foco em numérico)
    const milMatch = t.match(/(\d+(?:[.,]\d+)?)\s*mil/);
    if (milMatch) return parseFloat(milMatch[1].replace(',', '.')) * 1000;

    // "20k"
    const kMatch = t.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
    if (kMatch) return parseFloat(kMatch[1].replace(',', '.')) * 1000;

    // "R$ 20.000" ou "R$ 200,50" ou "R$ 20"
    const rMatch = t.match(/r\$\s*(\d[\d.,]*)/);
    if (rMatch) {
      const cleaned = rMatch[1].replace(/\.(?=\d{3})/g, '').replace(',', '.');
      return parseFloat(cleaned) || 0;
    }

    // Valor com contexto: "de 200", "valor 200", "por 500", "no valor de 1500"
    const ctxMatch = t.match(/\b(?:de|por|valor|preco|custo|sinal)\s+(?:r\$\s*)?(\d+(?:[.,]\d+)?)/);
    if (ctxMatch) {
      const cleaned = ctxMatch[1].replace(/\.(?=\d{3})/g, '').replace(',', '.');
      const n = parseFloat(cleaned) || 0;
      if (n >= 10) return n; // evita números pequenos demais (ex: data "2 dias")
    }

    // Números grandes (>= 1000) sem prefixo
    const numMatch = t.match(/\b(\d{4,}|\d+(?:\.\d{3})+)\b/);
    if (numMatch) return parseFloat(numMatch[1].replace(/\./g, '')) || 0;

    return null;
  }

  function extractPaymentMethod(text) {
    const t = normalizeText(text);
    if (/\bpix\b/.test(t)) return 'PIX';
    if (/\bcartao\b|\bcredito\b|\bdebito\b/.test(t)) return 'Cartão';
    if (/\bboleto\b/.test(t)) return 'Boleto';
    if (/\bdinheiro\b|\bespecie\b/.test(t)) return 'Dinheiro';
    if (/\btransferencia\b|\bted\b|\bdoc\b|\btransfer\b/.test(t)) return 'Transferência';
    return null;
  }

  function extractLeadSource(text) {
    const t = normalizeText(text);
    if (/instagram|insta\b/.test(t)) return 'Instagram';
    if (/tiktok|tik[\s-]?tok/.test(t)) return 'TikTok';
    if (/indicacao|indicado|referencia|amigo/.test(t)) return 'Indicação';
    if (/\bsite\b|\bgoogle\b/.test(t)) return 'Site';
    if (/whatsapp|wpp|\bzap\b/.test(t)) return 'WhatsApp';
    if (/youtube|\byt\b/.test(t)) return 'YouTube';
    if (/facebook|\bface\b/.test(t)) return 'Facebook';
    return null;
  }

  // Stop words: palavras que NÃO são nomes de pessoas mesmo capturadas pelas regex
  const NAME_STOP_WORDS_LIST = [
    // Comandos / verbos
    'james','registra','cria','cadastra','adiciona','coloca','muda','atualiza','seta','move',
    'abre','abra','abrir','leva','mostra','mostrar','vai','ver','consulta','consultar',
    'lembra','lembrar','agenda','marca','quero','preciso',
    // Verbos de venda (NÃO podem ser nomes)
    'comprou','compro','comprar','fechou','fechar','pagou','pagar','adquiriu','adquirir',
    'levou','levar','tirou','tirar','vendeu','vendi','vender','vendemos','recebeu','recebi','recebemos',
    'transferiu','transferir','depositou','depositar',
    // Pronomes / conectivos
    'chefe','sim','nao','ok','certo','isso','aqui','ali','la',
    'um','uma','uns','umas','o','a','os','as','de','do','da','dos','das','no','na','nos','nas',
    'para','pra','pro','com','por','em','sem','sobre','que','tem','foi','sao','seu','sua','meu','minha',
    // Entidades não-pessoais
    'cliente','venda','pacote','produto','tarefa','reuniao','contrato','documento',
    'valor','preco','custo','sinal','meta','origem','estagio','status','pipeline','funil','ranking',
    'entrada','saida','despesa','receita','lucro','caixa','saldo','faturamento','financeiro','cofre','aey',
    'relatorio','resumo','report','dashboard','cockpit','expansoes','crm','war','plano',
    'dia','semana','mes','ano','mesmo','passado','proximo','agora','hoje','amanha','ontem','depois',
    // Produtos / negocio
    'dubai','fly','cup','copa','billionaire','bilionario','explorer','gta','grand','tour','love','vip','experience',
    'trafego','pago','marketing','onboarding','contrato','proposta','ligar','enviar','mandar',
    'grupo','individual','casal','familia','sozinho','romantico',
    // Pagamentos / origens
    'instagram','insta','tiktok','whatsapp','wpp','zap','facebook','face','youtube','yt','site','google',
    'pix','cartao','credito','debito','boleto','dinheiro','especie','transferencia','ted','doc','transfer',
    // Frações de tempo
    'segundo','minuto','hora','manha','tarde','noite','final','semana',
  ];
  const NAME_STOP_WORDS = new Set(NAME_STOP_WORDS_LIST);

  function isValidName(candidate) {
    if (!candidate) return false;
    const words = candidate.trim().split(/\s+/);
    if (!words.length) return false;
    const first = normalizeText(words[0]);
    if (!first || first.length < 2) return false;
    if (NAME_STOP_WORDS.has(first)) return false;
    // Nome não pode ter mais de 3 palavras (Adrian Silva Junior é o limite)
    if (words.length > 3) return false;
    // Filtra qualquer palavra que seja stop-word
    for (const w of words) {
      if (NAME_STOP_WORDS.has(normalizeText(w))) return false;
    }
    return true;
  }

  // Captura UMA palavra após uma marca. Permite até 1 sobrenome se ambas válidas.
  function pickName(raw) {
    if (!raw) return null;
    // Primeiro: limpa conectivos no início ("o adrian", "a maria")
    let cleaned = raw.trim().replace(/^(o|a|os|as|um|uma|de|do|da|para|pra|pro)\s+/i, '').trim();
    if (!cleaned) return null;
    const words = cleaned.split(/\s+/);
    // Pega no máximo 2 palavras (nome + sobrenome) e descarta no primeiro stop-word
    const accepted = [];
    for (const w of words) {
      if (NAME_STOP_WORDS.has(normalizeText(w))) break;
      if (w.length < 2) break;
      accepted.push(w);
      if (accepted.length >= 2) break;
    }
    if (!accepted.length) return null;
    const candidate = accepted.join(' ');
    return isValidName(candidate) ? titleCase(candidate) : null;
  }

  function extractClientName(text) {
    const t = String(text || '');
    // Aceita lowercase (voz) e Capitalized (texto manual). Patterns ordenados por especificidade.
    const patterns = [
      // "o cliente chamado Adrian Silva" / "cliente adrian"
      /(?:o\s+)?cliente\s+(?:chamado\s+)?([a-zà-úA-ZÀ-Ú]{2,}(?:\s+[a-zà-úA-ZÀ-Ú]{2,})?)\b/i,
      // "Adrian comprou X" / "lucas fechou" — capitura a palavra ANTES do verbo
      /\b([a-zà-úA-ZÀ-Ú]{2,}(?:\s+[a-zà-úA-ZÀ-Ú]{2,})?)\s+(?:comprou|compro|fechou|pagou|adquiriu|levou|tirou)\b/i,
      // "vendi X para Adrian" — captura palavra após "para/pro/pra"
      /(?:para|pro|pra)\s+(?:o\s+|a\s+)?([a-zà-úA-ZÀ-Ú]{2,}(?:\s+[a-zà-úA-ZÀ-Ú]{2,})?)/i,
      // "cadastra cliente Adrian"
      /(?:cria|cadastra|registra|adiciona)\s+(?:o\s+|a\s+)?cliente\s+(?:chamado\s+)?([a-zà-úA-ZÀ-Ú]{2,}(?:\s+[a-zà-úA-ZÀ-Ú]{2,})?)\b/i,
      // "coloca Adrian como..."
      /(?:coloca|atualiza|muda|move|seta)\s+(?:o\s+|a\s+)?([a-zà-úA-ZÀ-Ú]{2,}(?:\s+[a-zà-úA-ZÀ-Ú]{2,})?)\s+(?:como|para|no|em)/i,
      // "ligar pro/para João" — captura SÓ a palavra logo após
      /\b(?:liga|ligar|chama|chamar|fala|falar)\s+(?:com\s+)?(?:o\s+|a\s+|pro\s+|pra\s+|para\s+)?([a-zà-úA-ZÀ-Ú]{2,}(?:\s+[a-zà-úA-ZÀ-Ú]{2,})?)\b/i,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (!m) continue;
      const name = pickName(m[1]);
      if (name) return name;
    }
    return null;
  }

  function extractProduct(text) {
    const tn = normalizeText(text);

    // 1) Busca por aliases — aliases ambíguos exigem contexto de produto
    const AMBIGUOUS_ALIASES = new Set(['entrada','war','gta','cup','vip','experience','love']);
    const aliases = Object.keys(PRODUCT_ALIASES).sort((a, b) => b.length - a.length);

    for (const alias of aliases) {
      // ORDEM CORRETA: primeiro escapa metachars regex, DEPOIS substitui espaços por \s+
      // (se invertido, o \\ de \\s+ é re-escapado virando \\\\s\\+)
      const escaped = alias
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');

      if (AMBIGUOUS_ALIASES.has(alias)) {
        // Contexto: trigger + opcional artigo/quantificador + alias
        // Ex: "vendeu um gta", "comprou o war", "abre fly cup", "pacote vip"
        const re = new RegExp(
          `\\b(?:dubai|pacote|produto|comprou|fechou|vendeu|vendi|adquiriu|abre|abra|abrir|ver|venda\\s+de|fly)\\s+(?:um\\s+|uma\\s+|o\\s+|a\\s+|de\\s+)?${escaped}\\b`,
          'i'
        );
        if (re.test(tn)) return PRODUCT_ALIASES[alias];
      } else {
        // Aliases não-ambíguos batem por boundary
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        if (re.test(tn)) return PRODUCT_ALIASES[alias];
      }
    }

    return null;
  }

  function extractPackageType(text) {
    const t = normalizeText(text);
    if (/\bgrupo\b/.test(t)) return 'Grupo';
    if (/\bindividual\b|\bsozinho\b/.test(t)) return 'Individual';
    if (/\bcasal\b/.test(t)) return 'Casal';
    if (/\bfamilia\b/.test(t)) return 'Família';
    return null;
  }

  function extractDate(text) {
    const t = normalizeText(text);
    const today = new Date();
    if (/\bhoje\b/.test(t)) return today.toISOString().slice(0, 10);
    if (/\bamanha\b/.test(t)) {
      const d = new Date(today); d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    const dmMatch = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (dmMatch) {
      const y = dmMatch[3] ? (dmMatch[3].length === 2 ? '20' + dmMatch[3] : dmMatch[3]) : today.getFullYear();
      return `${y}-${String(dmMatch[2]).padStart(2, '0')}-${String(dmMatch[1]).padStart(2, '0')}`;
    }
    return null;
  }

  function extractPeriod(text) {
    const t = normalizeText(text);
    if (/\bdia\b|\bhoje\b/.test(t)) return 'today';
    if (/\bsemana\b/.test(t)) return 'week';
    if (/\bano\b|\banual\b/.test(t)) return 'year';
    return 'month'; // padrão
  }

  function extractEntities(text, parsed) {
    const entities = {};
    const client = extractClientName(text);
    if (client) entities.client_name = client;
    const product = extractProduct(text);
    if (product) entities.product_name = product;
    const value = extractValue(text);
    if (value) entities.sale_value = value;
    const payment = extractPaymentMethod(text);
    if (payment) entities.payment_method = payment;
    const source = extractLeadSource(text);
    if (source) entities.lead_source = source;
    const pkg = extractPackageType(text);
    if (pkg) entities.package_type = pkg;
    const date = extractDate(text);
    if (date) entities.date = date;
    const period = extractPeriod(text);
    if (period) entities.period = period;
    // Para queries de Connection Registry: nome do painel referenciado
    // ("o que vendedores afeta?" → panel_name='sellers')
    if (parsed && (parsed.type === 'connection' || parsed.subtype?.startsWith?.('query_panel'))) {
      const panel = extractPanelName(text);
      if (panel) entities.panel_name = panel;
    }
    // Para metas: nome da meta ou escopo referenciado
    if (parsed && parsed.type === 'metas') {
      // Tenta capturar nome da meta após "meta de [X]" ou "meta [X]"
      const m = String(text || '').match(/\bmeta(?:\s+de)?\s+([a-zà-úA-ZÀ-Ú\s]{3,30}?)(?=\s+(?:pra|para|em|de\s+\d|$|,|\.))/i);
      if (m) entities.meta_name = m[1].trim();
    }
    entities.raw = text;
    return entities;
  }

  /* ---------------------------------------------------------------
     CONTEXTO OPERACIONAL (memória entre comandos)
     Persiste em localStorage para sobreviver a refreshes (TTL: 30 min)
  --------------------------------------------------------------- */
  const CTX_KEY = 'fly_james_context_v1';
  const CTX_TTL_MS = 30 * 60 * 1000; // 30 minutos

  let _ctx = (function loadCtx() {
    const stored = readJSON(CTX_KEY, null);
    if (!stored || !stored._updated) return {};
    if (Date.now() - stored._updated > CTX_TTL_MS) return {};
    return stored;
  })();

  function mergeContext(entities) {
    // Não armazena `raw` (campo descartável) no contexto
    const clean = { ...entities };
    delete clean.raw;
    Object.assign(_ctx, clean);
    _ctx._updated = Date.now();
    writeJSON(CTX_KEY, _ctx);
  }

  function resolveWithContext(entities) {
    const fresh = Date.now() - (_ctx._updated || 0) < CTX_TTL_MS;
    if (!fresh) return entities;
    // Herda do contexto o que não foi fornecido explicitamente
    if (!entities.client_name && _ctx.client_name) entities.client_name = _ctx.client_name;
    if (!entities.product_name && _ctx.product_name) entities.product_name = _ctx.product_name;
    return entities;
  }

  function clearContext() {
    _ctx = {};
    try { localStorage.removeItem(CTX_KEY); } catch (e) {}
  }

  /* ---------------------------------------------------------------
     PLANOS DE AÇÃO POR INTENÇÃO
  --------------------------------------------------------------- */
  const PLANS = {
    create_sale: {
      requiresConfirmation: true,
      riskLevel: 'medium',
      getSteps(e) {
        const steps = [
          {
            id: 'upsert_client', label: 'Identificando cliente',
            action: 'add_customer',
            getParams: (e) => ({ name: e.client_name, origin: e.lead_source, stage: 'fechado' }),
            skip: (e) => !e.client_name,
          },
          {
            id: 'create_sale', label: 'Criando venda',
            action: 'add_sale',
            getParams: (e) => ({
              name: e.client_name || 'Cliente', product: e.product_name || '',
              amount: e.sale_value || 0, payment_method: e.payment_method || '',
              origin: e.lead_source || '', travel_date: e.date || null,
            }),
          },
          {
            id: 'update_product', label: 'Atualizando produto',
            action: 'update_product_metrics',
            getParams: (e) => ({ product: e.product_name, sale_value: e.sale_value }),
            skip: (e) => !e.product_name,
          },
          {
            id: 'update_cockpit', label: 'Atualizando Cockpit',
            action: 'update_cockpit_metrics',
            getParams: (e) => ({ revenue_delta: e.sale_value || 0, sales_delta: 1 }),
          },
          {
            id: 'create_tasks', label: 'Criando tarefas de onboarding',
            action: 'create_task',
            getParams: (e) => ({
              title: `Enviar contrato para ${e.client_name || 'cliente'}`,
              client: e.client_name, product: e.product_name, type: 'contract',
            }),
            skip: (e) => !e.client_name,
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({
              command: cmd,
              summary: `Venda ${e.product_name || ''} para ${e.client_name || 'cliente'} — R$ ${(e.sale_value || 0).toLocaleString('pt-BR')}`,
            }),
          },
        ];
        return steps.filter(s => !s.skip || !s.skip(e));
      },
    },

    create_customer: {
      requiresConfirmation: false,
      riskLevel: 'safe',
      getSteps(e) {
        return [
          {
            id: 'upsert_client', label: 'Criando cliente no CRM',
            action: 'add_customer',
            getParams: (e) => ({ name: e.client_name, origin: e.lead_source, stage: 'lead_frio' }),
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({ command: cmd, summary: `Cliente criado: ${e.client_name}` }),
          },
        ];
      },
    },

    update_customer_stage: {
      requiresConfirmation: false,
      riskLevel: 'safe',
      getSteps(e) {
        return [
          {
            id: 'update_stage', label: 'Atualizando CRM',
            action: 'update_customer_stage',
            getParams: (e) => ({ name: e.client_name, stage: e.stage || 'cliente_ativo' }),
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({ command: cmd, summary: `CRM atualizado: ${e.client_name}` }),
          },
        ];
      },
    },

    update_customer_field: {
      requiresConfirmation: false,
      riskLevel: 'safe',
      getSteps(e) {
        return [
          {
            id: 'update_field', label: 'Atualizando dados do cliente',
            action: 'update_customer_field',
            getParams: (e) => ({ name: e.client_name, field: e.field, value: e.field_value }),
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({ command: cmd, summary: `Campo atualizado: ${e.client_name}` }),
          },
        ];
      },
    },

    create_expense: {
      requiresConfirmation: true,
      riskLevel: 'medium',
      getSteps(e) {
        return [
          {
            id: 'add_expense', label: 'Registrando despesa',
            action: 'add_movement',
            getParams: (e) => ({
              type: 'expense', amount: e.sale_value || 0,
              description: e.description || 'Despesa', category: e.category || 'outros',
            }),
          },
          {
            id: 'update_cockpit', label: 'Atualizando Cockpit',
            action: 'update_cockpit_metrics',
            getParams: (e) => ({ expense_delta: e.sale_value || 0 }),
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({ command: cmd, summary: `Despesa: R$ ${(e.sale_value || 0).toLocaleString('pt-BR')}` }),
          },
        ];
      },
    },

    create_income: {
      requiresConfirmation: true,
      riskLevel: 'medium',
      getSteps(e) {
        return [
          {
            id: 'add_income', label: 'Registrando entrada',
            action: 'add_movement',
            getParams: (e) => ({
              type: 'income', amount: e.sale_value || 0,
              description: e.description || 'Entrada', category: e.category || 'receita',
              payment_method: e.payment_method,
            }),
          },
          {
            id: 'update_cockpit', label: 'Atualizando Cockpit',
            action: 'update_cockpit_metrics',
            getParams: (e) => ({ revenue_delta: e.sale_value || 0 }),
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({ command: cmd, summary: `Entrada: R$ ${(e.sale_value || 0).toLocaleString('pt-BR')}` }),
          },
        ];
      },
    },

    create_transfer: {
      requiresConfirmation: true,
      riskLevel: 'medium',
      getSteps(e) {
        return [
          {
            id: 'add_transfer', label: 'Registrando transferência',
            action: 'add_movement',
            getParams: (e) => ({
              type: 'internal_transfer', amount: e.sale_value || 0,
              description: e.description || 'Transferência', category: 'transferencia',
            }),
          },
          {
            id: 'create_log', label: 'Salvando histórico',
            action: 'create_james_log',
            getParams: (e, cmd) => ({ command: cmd, summary: `Transferência: R$ ${(e.sale_value || 0).toLocaleString('pt-BR')}` }),
          },
        ];
      },
    },

    open_module: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          { id: 'navigate', label: 'Navegando', action: '__navigate', getParams: (e) => ({ module: e.raw }) },
        ];
      },
    },

    create_task: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          {
            id: 'create_task', label: 'Criando tarefa',
            action: 'create_task',
            getParams: (e) => ({ title: e.task_title || e.raw, client: e.client_name, date: e.date }),
          },
        ];
      },
    },

    create_reminder: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          {
            id: 'create_task', label: 'Criando lembrete',
            action: 'create_task',
            getParams: (e) => ({ title: e.raw, client: e.client_name, date: e.date, type: 'reminder' }),
          },
        ];
      },
    },

    create_followup: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          {
            id: 'create_task', label: 'Criando follow-up',
            action: 'create_task',
            getParams: (e) => ({
              title: `Follow-up: ${e.client_name || 'cliente'}`,
              client: e.client_name, date: e.date, type: 'followup',
            }),
          },
        ];
      },
    },

    query_financial: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          { id: 'query', label: 'Consultando financeiro', action: '__query_financial', getParams: (e) => ({ period: e.period }) },
        ];
      },
    },

    query_count: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps() {
        return [
          { id: 'query', label: 'Consultando dados', action: '__query_count', getParams: () => ({}) },
        ];
      },
    },

    query_top_product: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps() {
        return [
          { id: 'query', label: 'Consultando produtos', action: '__query_top_product', getParams: () => ({}) },
        ];
      },
    },

    query_who: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          { id: 'query', label: 'Buscando clientes', action: 'list_customers', getParams: (e) => ({ stage: 'fechado' }) },
        ];
      },
    },

    generate_report: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          { id: 'report', label: 'Gerando relatório', action: '__generate_report', getParams: (e) => ({ period: e.period, type: e.report_type || 'summary' }) },
        ];
      },
    },

    summarize: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [
          { id: 'report', label: 'Gerando resumo', action: '__generate_report', getParams: (e) => ({ period: e.period || 'today', type: 'summary' }) },
        ];
      },
    },

    delete: {
      requiresConfirmation: true, riskLevel: 'critical',
      getSteps() { return []; },
    },

    /* ── Connection Registry queries ── */
    query_panel_outgoing: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [{ id: 'q', label: 'Consultando conexões de saída', action: '__query_panel_outgoing', getParams: (e) => ({ panel: e.panel_name }) }];
      },
    },
    query_panel_incoming: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [{ id: 'q', label: 'Consultando conexões de entrada', action: '__query_panel_incoming', getParams: (e) => ({ panel: e.panel_name }) }];
      },
    },
    query_panel_connections: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [{ id: 'q', label: 'Mapeando conexões', action: '__query_panel_connections', getParams: (e) => ({ panel: e.panel_name }) }];
      },
    },
    query_panel_suggestions: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [{ id: 'q', label: 'Sugerindo painéis combinados', action: '__query_panel_suggestions', getParams: (e) => ({ panel: e.panel_name }) }];
      },
    },

    /* ── Manipulação de Metas ── */
    update_meta: {
      requiresConfirmation: true, riskLevel: 'medium',
      getSteps(e) {
        return [{ id: 'u', label: 'Atualizando meta', action: '__update_meta', getParams: (e) => ({ name: e.meta_name, alvo: e.sale_value, escopo_nome: e.product_name || e.client_name }) }];
      },
    },
    adjust_meta: {
      requiresConfirmation: true, riskLevel: 'medium',
      getSteps(e) {
        return [{ id: 'a', label: 'Ajustando meta', action: '__adjust_meta', getParams: (e) => ({ name: e.meta_name, delta_pct: e.delta_pct, delta_value: e.sale_value, direction: e.direction, escopo_nome: e.product_name || e.client_name }) }];
      },
    },
    pause_meta: {
      requiresConfirmation: true, riskLevel: 'medium',
      getSteps(e) {
        return [{ id: 'p', label: 'Pausando/arquivando meta', action: '__pause_meta', getParams: (e) => ({ name: e.meta_name, action: e.meta_action }) }];
      },
    },
    project_meta: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [{ id: 'p', label: 'Projetando meta (run rate)', action: '__project_meta', getParams: (e) => ({ name: e.meta_name }) }];
      },
    },
    query_meta_progress: {
      requiresConfirmation: false, riskLevel: 'safe',
      getSteps(e) {
        return [{ id: 'q', label: 'Consultando progresso', action: '__query_meta_progress', getParams: (e) => ({ name: e.meta_name }) }];
      },
    },
  };

  function planActions(parsed, entities) {
    const subtype = parsed.subtype || 'unknown';
    const plan = PLANS[subtype];
    if (!plan) return { subtype, steps: [], requiresConfirmation: false, riskLevel: 'safe' };
    return {
      subtype,
      steps: plan.getSteps(entities),
      requiresConfirmation: plan.requiresConfirmation,
      riskLevel: plan.riskLevel,
    };
  }

  /* ---------------------------------------------------------------
     DADOS OBRIGATÓRIOS FALTANDO
  --------------------------------------------------------------- */
  function getMissingRequired(subtype, entities) {
    const missing = [];
    if (subtype === 'create_sale') {
      if (!entities.client_name) missing.push({ key: 'client_name', question: 'Chefe, qual o nome do cliente?' });
      if (!entities.sale_value) missing.push({ key: 'sale_value', question: 'Chefe, qual foi o valor da venda?' });
      if (!entities.product_name) missing.push({ key: 'product_name', question: 'Chefe, qual produto o cliente comprou?' });
    }
    if (subtype === 'create_customer') {
      if (!entities.client_name) missing.push({ key: 'client_name', question: 'Chefe, qual o nome do cliente?' });
    }
    if (['create_expense', 'create_income'].includes(subtype)) {
      if (!entities.sale_value) missing.push({ key: 'sale_value', question: 'Chefe, qual o valor?' });
    }
    return missing;
  }

  /* ---------------------------------------------------------------
     TEXTO DE CONFIRMAÇÃO
  --------------------------------------------------------------- */
  function buildConfirmationText(subtype, entities) {
    const e = entities;
    const val = e.sale_value ? `R$ ${e.sale_value.toLocaleString('pt-BR')}` : '';

    if (subtype === 'create_sale') {
      const parts = [];
      if (e.client_name) parts.push(`cliente ${e.client_name}`);
      if (e.product_name) parts.push(e.product_name);
      if (e.package_type) parts.push(`em ${e.package_type}`);
      if (val) parts.push(val);
      if (e.payment_method) parts.push(e.payment_method);
      if (e.lead_source) parts.push(`origem: ${e.lead_source}`);
      return `Chefe, vou registrar uma venda — ${parts.join(', ')}. Isso vai atualizar o CRM, o produto, o faturamento e o Cockpit. Posso confirmar?`;
    }
    if (subtype === 'create_expense') {
      return `Chefe, vou registrar uma despesa de ${val}${e.description ? ` — "${e.description}"` : ''}. Posso confirmar?`;
    }
    if (subtype === 'create_income') {
      return `Chefe, vou registrar uma entrada de ${val}. Posso confirmar?`;
    }
    if (subtype === 'create_transfer') {
      return `Chefe, vou registrar uma transferência de ${val}. Posso confirmar?`;
    }
    if (subtype === 'delete') {
      return `Chefe, essa ação vai excluir dados permanentemente. Confirma que deseja continuar?`;
    }
    return `Chefe, vou executar essa operação. Posso confirmar?`;
  }

  /* ---------------------------------------------------------------
     SUGESTÕES PÓS-AÇÃO
  --------------------------------------------------------------- */
  function generateSuggestions(subtype, entities) {
    const s = [];
    if (subtype === 'create_sale') {
      if (entities.client_name) {
        s.push(`Criar follow-up de onboarding para ${entities.client_name}`);
        s.push(`Solicitar documentos de ${entities.client_name}`);
      }
      if (entities.product_name) s.push(`Ver métricas de ${entities.product_name}`);
      s.push('Gerar resumo do dia');
    }
    if (subtype === 'create_customer') {
      s.push('Registrar uma venda para este cliente');
      s.push('Adicionar ao funil do CRM');
    }
    if (['create_expense', 'create_income'].includes(subtype)) {
      s.push('Ver resumo financeiro do mês');
      s.push('Consultar saldo do Cofre');
    }
    return s;
  }

  /* ---------------------------------------------------------------
     TEXTO DE RESPOSTA (sem IA)
  --------------------------------------------------------------- */
  function buildResponseText(subtype, entities, results) {
    const ok = results.every(r => r?.ok !== false);
    const e = entities;
    const val = e.sale_value ? `R$ ${e.sale_value.toLocaleString('pt-BR')}` : '';

    if (!ok) {
      const err = results.find(r => r?.ok === false);
      return `Chefe, houve um problema: ${err?.msg || 'erro desconhecido'}.`;
    }

    if (subtype === 'create_sale') {
      const parts = [e.client_name, e.product_name, val].filter(Boolean);
      return `Venda registrada, Chefe. ${parts.join(' · ')}. CRM, produto, faturamento e Cockpit atualizados. Tudo sincronizado.`;
    }
    if (subtype === 'create_customer') return `Cliente ${e.client_name || ''} cadastrado no CRM, Chefe.`;
    if (subtype === 'create_expense') return `Despesa de ${val} registrada, Chefe. Cockpit atualizado.`;
    if (subtype === 'create_income') return `Entrada de ${val} registrada, Chefe. Cockpit atualizado.`;
    if (subtype === 'create_transfer') return `Transferência de ${val} registrada, Chefe.`;
    if (subtype === 'create_task' || subtype === 'create_reminder' || subtype === 'create_followup') {
      return `Criado, Chefe. Anotado na lista de tarefas.`;
    }
    const queryResult = results.find(r => r?.msg);
    if (queryResult?.msg) return queryResult.msg;
    return `Operação concluída, Chefe.`;
  }

  /* ---------------------------------------------------------------
     AÇÕES INTERNAS DO ENGINE
  --------------------------------------------------------------- */

  // Navegação modular
  const NAV_MAP = [
    { keys: ['plano war', 'war'], fn() { document.querySelector('[data-id="fly"]')?.click() || document.querySelector('.timeline-planet')?.click(); } },
    { keys: ['cofre', 'financeiro', 'caixa', 'aey'], fn() { (document.getElementById('cofreTriggerBtn') || document.querySelector('.cofre-trigger'))?.click(); } },
    { keys: ['dashboard', 'cockpit', 'supremo'], fn() { document.getElementById('dashboardSupremoTrigger')?.click(); } },
    { keys: ['expansoes', 'expansões'], fn() { (typeof window.__flyExpansoesOpen === 'function') ? window.__flyExpansoesOpen() : document.getElementById('flyExpTrigger')?.click(); } },
    { keys: ['crm', 'clientes', 'vendas'], fn() { window.__flyExpansoesOpen?.('crm'); } },
    { keys: ['fly cup', 'flycup', 'copa'], fn() { window.__flyExpansoesOpen?.('flycup'); } },
    { keys: ['relatorio', 'relatório', 'relatorios', 'reports'], fn() { window.__flyExpansoesOpen?.('relatorios'); } },
    { keys: ['projetos', 'projeto'], fn() { window.__flyExpansoesOpen?.('projetos'); } },
    { keys: ['ranking'], fn() { window.__flyExpansoesOpen?.('ranking'); } },
    { keys: ['james'], fn() { window.__james?.open?.(); } },
  ];

  function navigateTo(rawText) {
    if (!rawText) return false;
    const n = normalizeText(rawText);
    for (const entry of NAV_MAP) {
      if (entry.keys.some(k => n.includes(k))) {
        try { entry.fn(); return true; } catch (e) { return false; }
      }
    }
    return false;
  }

  function updateProductMetrics(productName, saleValue) {
    if (!productName) return { ok: true, msg: 'Produto não identificado, métricas não atualizadas.' };
    const key = modeKey('fly_product_metrics_v1');
    const metrics = readJSON(key, {});
    if (!metrics[productName]) metrics[productName] = { sales: 0, revenue: 0, updated_at: null };
    metrics[productName].sales += 1;
    metrics[productName].revenue += (saleValue || 0);
    metrics[productName].updated_at = new Date().toISOString();
    writeJSON(key, metrics);
    dispatchUpdate({ entity: 'product_metrics', product: productName });
    return { ok: true, msg: `Produto ${productName} atualizado.` };
  }

  function updateCockpitMetrics(params) {
    const key = modeKey('fly_cockpit_metrics_v1');
    const c = readJSON(key, { total_revenue: 0, total_expenses: 0, sales_count: 0 });
    if (params.revenue_delta) c.total_revenue += params.revenue_delta;
    if (params.expense_delta) c.total_expenses += params.expense_delta;
    if (params.sales_delta) c.sales_count += params.sales_delta;
    c.total_profit = c.total_revenue - c.total_expenses;
    c.updated_at = new Date().toISOString();
    writeJSON(key, c);
    dispatchUpdate({ entity: 'cockpit' });
    window.dispatchEvent(new CustomEvent('fly:cockpit-update', { detail: c }));
    return { ok: true, msg: 'Cockpit atualizado.' };
  }

  function createTask(params) {
    const key = modeKey('fly_tasks_v1');
    const tasks = readJSON(key, []);
    const task = {
      id: uuid(), title: params.title || 'Tarefa',
      client: params.client || null, product: params.product || null,
      date: params.date || new Date().toISOString().slice(0, 10),
      type: params.type || 'task', status: 'pending',
      created_at: new Date().toISOString(), created_by: 'james',
    };
    tasks.unshift(task);
    if (tasks.length > 200) tasks.splice(200);
    writeJSON(key, tasks);
    dispatchUpdate({ entity: 'task', action: 'add', data: task });
    return { ok: true, msg: `Tarefa "${task.title}" criada.` };
  }

  function updateCustomerStage(params) {
    if (!params.name) return { ok: false, msg: 'Nome necessário.' };
    const key = modeKey('fly_customers_v1');
    const customers = readJSON(key, []);
    const n = params.name.toLowerCase();
    const idx = customers.findIndex(c => c.name?.toLowerCase().includes(n));
    if (idx >= 0) {
      customers[idx].stage = params.stage || 'cliente_ativo';
      customers[idx].updated_at = new Date().toISOString();
      writeJSON(key, customers);
      dispatchUpdate({ entity: 'customer', action: 'update' });
      return { ok: true, msg: `${params.name} → estágio "${params.stage}".` };
    }
    return { ok: false, msg: `Cliente "${params.name}" não encontrado.` };
  }

  function updateCustomerField(params) {
    if (!params.name || !params.field) return { ok: false, msg: 'Nome e campo necessários.' };
    const key = modeKey('fly_customers_v1');
    const customers = readJSON(key, []);
    const n = params.name.toLowerCase();
    const idx = customers.findIndex(c => c.name?.toLowerCase().includes(n));
    if (idx >= 0) {
      customers[idx][params.field] = params.value;
      customers[idx].updated_at = new Date().toISOString();
      writeJSON(key, customers);
      dispatchUpdate({ entity: 'customer', action: 'update' });
      return { ok: true, msg: `"${params.field}" de ${params.name} atualizado.` };
    }
    return { ok: false, msg: `Cliente "${params.name}" não encontrado.` };
  }

  function queryFinancial(period) {
    const key = modeKey('fly_moves_v1');
    const moves = readJSON(key, []);
    const now = new Date();
    function inPeriod(m) {
      const d = new Date(m.date || m.created_at || 0);
      if (period === 'today') return d.toDateString() === now.toDateString();
      if (period === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
      if (period === 'year') return d.getFullYear() === now.getFullYear();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    const filtered = moves.filter(inPeriod);
    const revenue = filtered.filter(m => m.movement_type === 'income').reduce((s, m) => s + (m.amount || 0), 0);
    const expenses = filtered.filter(m => m.movement_type === 'expense').reduce((s, m) => s + (m.amount || 0), 0);
    const profit = revenue - expenses;

    // Também olha para métricas do cockpit
    const cockpit = readJSON(modeKey('fly_cockpit_metrics_v1'), null);
    const fmtBR = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const periodLabel = { today: 'hoje', week: 'esta semana', month: 'este mês', year: 'este ano' }[period] || period;

    let msg;
    if (filtered.length === 0 && cockpit?.total_revenue > 0) {
      msg = `Chefe, receita total acumulada: R$ ${fmtBR(cockpit.total_revenue)}. Despesas: R$ ${fmtBR(cockpit.total_expenses || 0)}. Lucro estimado: R$ ${fmtBR(cockpit.total_profit || 0)}.`;
    } else {
      msg = `Chefe, ${periodLabel}: faturamento R$ ${fmtBR(revenue)}, despesas R$ ${fmtBR(expenses)}, lucro estimado R$ ${fmtBR(profit)}.`;
    }
    return { ok: true, msg, data: { revenue, expenses, profit, period, count: filtered.length } };
  }

  function queryCount() {
    const sales = readJSON(modeKey('fly_sales_v1'), []);
    const customers = readJSON(modeKey('fly_customers_v1'), []);
    const polos = readJSON(modeKey('fly_cup_polos_v1'), []);
    const atletas = readJSON(modeKey('fly_cup_atletas_v1'), []);
    return {
      ok: true,
      msg: `Chefe, temos ${sales.length} vendas, ${customers.length} clientes, ${polos.length} polos e ${atletas.length} atletas cadastrados.`,
      data: { sales: sales.length, customers: customers.length, polos: polos.length, atletas: atletas.length },
    };
  }

  function queryTopProduct() {
    const sales = readJSON(modeKey('fly_sales_v1'), []);
    const metrics = readJSON(modeKey('fly_product_metrics_v1'), {});
    const combined = {};
    for (const s of sales) {
      const p = s.product || 'Desconhecido';
      if (!combined[p]) combined[p] = { sales: 0, revenue: 0 };
      combined[p].sales++;
      combined[p].revenue += (s.amount || 0);
    }
    for (const [p, m] of Object.entries(metrics)) {
      if (!combined[p]) combined[p] = { sales: 0, revenue: 0 };
      combined[p].revenue = Math.max(combined[p].revenue, m.revenue || 0);
    }
    const entries = Object.entries(combined).sort((a, b) => b[1].revenue - a[1].revenue);
    if (!entries.length) return { ok: true, msg: 'Chefe, ainda não há dados de produtos no sistema.', data: {} };
    const [top, topData] = entries[0];
    return {
      ok: true,
      msg: `Chefe, o produto que mais faturou foi ${top} — R$ ${topData.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${topData.sales} venda(s).`,
      data: { top, products: combined },
    };
  }

  function generateReport(params) {
    const period = params.period || 'month';
    const fin = queryFinancial(period);
    const counts = queryCount();
    const topProd = queryTopProduct();
    const periodLabel = { today: 'HOJE', week: 'SEMANA', month: 'MÊS', year: 'ANO' }[period] || 'PERÍODO';
    const fmtBR = (n) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const lines = [
      `📊 RELATÓRIO FLY — ${periodLabel}`,
      `💰 Faturamento: R$ ${fmtBR(fin.data?.revenue)}`,
      `📉 Despesas: R$ ${fmtBR(fin.data?.expenses)}`,
      `📈 Lucro estimado: R$ ${fmtBR(fin.data?.profit)}`,
      `🛒 Vendas: ${counts.data?.sales || 0}`,
      `👥 Clientes: ${counts.data?.customers || 0}`,
      topProd.data?.top ? `🏆 Produto top: ${topProd.data.top}` : null,
    ].filter(Boolean).join('\n');

    const shortMsg = `Chefe, ${fin.data?.revenue > 0 ? `faturamos R$ ${fmtBR(fin.data.revenue)} este mês` : 'sem faturamento registrado'}. ${counts.data?.sales || 0} vendas, ${counts.data?.customers || 0} clientes.${topProd.data?.top ? ` Top produto: ${topProd.data.top}.` : ''}`;

    return { ok: true, msg: shortMsg, data: { summary: lines, period, financial: fin.data, counts: counts.data, topProduct: topProd.data } };
  }

  function createLog(command, parsed, entities, plan, results, finalStatus) {
    const log = {
      id: uuid(),
      command: String(command || '').slice(0, 200),
      intent: `${parsed.type || '?'}/${parsed.subtype || '?'}`,
      entities: { ...entities },
      steps_planned: plan?.steps?.length || 0,
      steps_executed: results?.filter(r => r?.ok !== false).length || 0,
      status: finalStatus || 'completed',
      timestamp: new Date().toISOString(),
    };
    const logs = readJSON('fly_james_logs_v1', []);
    logs.unshift(log);
    if (logs.length > 150) logs.splice(150);
    writeJSON('fly_james_logs_v1', logs);
    dispatchUpdate({ entity: 'james_log', action: 'add', data: log });
    return log;
  }

  /* ---------------------------------------------------------------
     CONNECTION REGISTRY · queries
  --------------------------------------------------------------- */
  // Mapa de aliases pra traduzir o que o usuário fala → panel id do Registry
  const PANEL_ALIASES = {
    cockpit: 'cockpit', cockpits: 'cockpit', dashboard: 'cockpit',
    cofre: 'cofre', financeiro: 'cofre', caixa: 'cofre', aey: 'cofre',
    war: 'war', territorio: 'war', territorios: 'war', 'plano war': 'war',
    cup: 'flycup', flycup: 'flycup', 'fly cup': 'flycup', copa: 'flycup',
    crm: 'crm', clientes: 'customers', cliente: 'customers',
    venda: 'sales', vendas: 'sales',
    produto: 'products', produtos: 'products', pacote: 'products', pacotes: 'products',
    hierarquia: 'hierarchy', funcionario: 'hierarchy', funcionarios: 'hierarchy',
    base: 'bases', bases: 'bases',
    vendedor: 'sellers', vendedores: 'sellers', sellers: 'sellers',
    influencer: 'influencers', influenciador: 'influencers', influenciadores: 'influencers',
    meta: 'metas', metas: 'metas',
    tarefa: 'tasks', tarefas: 'tasks',
    projeto: 'projects', projetos: 'projects',
    marketing: 'marketing', campanha: 'marketing', campanhas: 'marketing',
  };

  function extractPanelName(text) {
    const t = normalizeText(text || '');
    // Tenta achar palavra-chave conhecida
    for (const [alias, panelId] of Object.entries(PANEL_ALIASES).sort((a, b) => b[0].length - a[0].length)) {
      if (new RegExp(`\\b${alias}\\b`, 'i').test(t)) return panelId;
    }
    return null;
  }

  function _conMeta(id) {
    return window.__flyConnections?.panelMeta?.[id] || { name: id, icon: '📋' };
  }

  function describeOutgoing(panelId) {
    if (!panelId) return { ok: false, msg: 'Chefe, qual painel você quer consultar? Ex: vendas, cofre, vendedores.' };
    const meta = _conMeta(panelId);
    const out = window.__flyConnections?.getOutgoing?.(panelId) || [];
    if (!out.length) return { ok: true, msg: `Chefe, ${meta.name} ${meta.icon} não tem conexões de saída registradas (ainda).` };
    const linhas = out.map(c => {
      const targetMeta = _conMeta(c.to);
      return `→ ${targetMeta.icon} ${targetMeta.name}: ${c.hint}`;
    }).join('\n');
    return {
      ok: true,
      msg: `Chefe, ${meta.icon} ${meta.name} afeta ${out.length} painel(éis):\n${linhas}`,
      data: { panelId, outgoing: out },
    };
  }

  function describeIncoming(panelId) {
    if (!panelId) return { ok: false, msg: 'Chefe, qual painel?' };
    const meta = _conMeta(panelId);
    const inc = window.__flyConnections?.getIncoming?.(panelId) || [];
    if (!inc.length) return { ok: true, msg: `Chefe, ${meta.name} ${meta.icon} não recebe dados de outros painéis (ainda).` };
    const linhas = inc.map(c => {
      const fromMeta = _conMeta(c.from);
      return `← ${fromMeta.icon} ${fromMeta.name}: ${c.hint}`;
    }).join('\n');
    return {
      ok: true,
      msg: `Chefe, ${meta.icon} ${meta.name} recebe dados de ${inc.length} painel(éis):\n${linhas}`,
      data: { panelId, incoming: inc },
    };
  }

  function describeConnections(panelId) {
    if (!panelId) return { ok: false, msg: 'Chefe, qual painel?' };
    const meta = _conMeta(panelId);
    const out = window.__flyConnections?.getOutgoing?.(panelId) || [];
    const inc = window.__flyConnections?.getIncoming?.(panelId) || [];
    if (!out.length && !inc.length) return { ok: true, msg: `Chefe, ${meta.name} ainda não tem conexões registradas.` };
    return {
      ok: true,
      msg: `Chefe, ${meta.icon} ${meta.name}: ${inc.length} entrada(s), ${out.length} saída(s). Use "o que ${meta.name} afeta" pra ver detalhes.`,
      data: { panelId, incoming: inc, outgoing: out },
    };
  }

  function describeSuggestions(panelId) {
    if (!panelId) return { ok: false, msg: 'Chefe, qual painel?' };
    const meta = _conMeta(panelId);
    const sugg = window.__flyConnections?.suggestPanelsFor?.(panelId) || [];
    if (!sugg.length) return { ok: true, msg: `Chefe, sem sugestões registradas pra ${meta.name}.` };
    return {
      ok: true,
      msg: `Chefe, painéis que combinam com ${meta.icon} ${meta.name}: ${sugg.map(s => `${s.meta.icon} ${s.meta.name}`).join(', ')}.`,
      data: { panelId, suggestions: sugg },
    };
  }

  /* ---------------------------------------------------------------
     METAS · alterar, ajustar, pausar, projetar
  --------------------------------------------------------------- */
  function _findMeta(name, escopo_nome) {
    const list = readJSON(modeKey('fly_metas_v1'), []);
    const n = normalizeText(name || escopo_nome || '');
    if (!n) return list[0] || null; // se não especificou, pega a primeira ativa
    return list.find(m =>
      normalizeText(m.nome).includes(n) ||
      normalizeText(m.escopo_nome || '').includes(n)
    ) || list.find(m => m.status === 'ativa') || null;
  }

  function _saveMetas(arr) {
    writeJSON(modeKey('fly_metas_v1'), arr);
    dispatchUpdate({ entity: 'meta', action: 'update' });
  }

  function updateMeta(params, entities) {
    const list = readJSON(modeKey('fly_metas_v1'), []);
    const meta = _findMeta(params.name, params.escopo_nome);
    if (!meta) return { ok: false, msg: 'Chefe, não encontrei a meta. Crie uma primeiro.' };
    const novoAlvo = Number(params.alvo);
    if (!novoAlvo || novoAlvo <= 0) return { ok: false, msg: 'Chefe, qual o novo valor da meta?' };
    const idx = list.findIndex(m => m.id === meta.id);
    const oldAlvo = list[idx].alvo;
    list[idx].alvo = novoAlvo;
    list[idx].updated_at = new Date().toISOString();
    // Re-checa se ficou batida com novo alvo
    if (novoAlvo > 0 && list[idx].realizado >= novoAlvo && list[idx].status === 'ativa') {
      list[idx].status = 'batida';
    }
    _saveMetas(list);
    const fmt = list[idx].unidade === 'BRL' ? `R$ ${novoAlvo.toLocaleString('pt-BR')}` : novoAlvo;
    return { ok: true, msg: `Meta "${list[idx].nome}" ajustada de ${list[idx].unidade === 'BRL' ? 'R$ ' + oldAlvo.toLocaleString('pt-BR') : oldAlvo} → ${fmt}.`, data: list[idx] };
  }

  function adjustMeta(params, entities) {
    const list = readJSON(modeKey('fly_metas_v1'), []);
    const meta = _findMeta(params.name, params.escopo_nome);
    if (!meta) return { ok: false, msg: 'Chefe, não encontrei a meta.' };
    const idx = list.findIndex(m => m.id === meta.id);

    // Detecta direção pelo comando (entities.raw)
    const raw = normalizeText(entities.raw || '');
    const isUp   = /\b(aumenta|sobe|cresce|incrementa)\b/.test(raw);
    const isDown = /\b(diminui|reduz|baixa|corta)\b/.test(raw);
    const direction = params.direction || (isUp ? 'up' : (isDown ? 'down' : 'up'));

    // Detecta % no texto cru
    const pctMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
    const valorMatch = raw.match(/(?:em|por|de|pra)\s+(\d+(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(?:mil|k\b)?/);

    let novoAlvo;
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1].replace(',', '.')) / 100;
      novoAlvo = direction === 'up' ? meta.alvo * (1 + pct) : meta.alvo * (1 - pct);
    } else if (params.sale_value) {
      novoAlvo = direction === 'up' ? meta.alvo + params.sale_value : meta.alvo - params.sale_value;
    } else {
      return { ok: false, msg: 'Chefe, em quanto ajustar? (Ex: "aumenta em 20%" ou "aumenta em 100 mil")' };
    }
    novoAlvo = Math.max(0, Math.round(novoAlvo));
    const oldAlvo = list[idx].alvo;
    list[idx].alvo = novoAlvo;
    list[idx].updated_at = new Date().toISOString();
    if (novoAlvo > 0 && list[idx].realizado >= novoAlvo && list[idx].status === 'ativa') list[idx].status = 'batida';
    _saveMetas(list);
    const fmt = list[idx].unidade === 'BRL' ? `R$ ${novoAlvo.toLocaleString('pt-BR')}` : novoAlvo;
    const oldFmt = list[idx].unidade === 'BRL' ? `R$ ${oldAlvo.toLocaleString('pt-BR')}` : oldAlvo;
    return { ok: true, msg: `Meta "${list[idx].nome}" ${direction === 'up' ? 'aumentada' : 'reduzida'}: ${oldFmt} → ${fmt}.`, data: list[idx] };
  }

  function pauseMeta(params, entities) {
    const list = readJSON(modeKey('fly_metas_v1'), []);
    const raw = normalizeText(entities.raw || '');
    // Special case: "arquiva metas batidas"
    if (/arquiv.*batida|batidas.*arquiv/.test(raw)) {
      let count = 0;
      list.forEach(m => { if (m.status === 'batida') { m.status = 'arquivada'; count++; } });
      _saveMetas(list);
      return { ok: true, msg: `${count} meta(s) batida(s) arquivada(s), Chefe.`, data: { count } };
    }
    const meta = _findMeta(params.name, params.escopo_nome);
    if (!meta) return { ok: false, msg: 'Chefe, qual meta?' };
    const idx = list.findIndex(m => m.id === meta.id);
    const novoStatus = /arquiv|encerr|finaliz/.test(raw) ? 'arquivada' : 'pausada';
    list[idx].status = novoStatus;
    list[idx].updated_at = new Date().toISOString();
    _saveMetas(list);
    return { ok: true, msg: `Meta "${list[idx].nome}" → status "${novoStatus}".`, data: list[idx] };
  }

  function projectMeta(params, entities) {
    const list = readJSON(modeKey('fly_metas_v1'), []);
    const meta = _findMeta(params.name, params.escopo_nome) || list.find(m => m.status === 'ativa');
    if (!meta || !meta.alvo) return { ok: false, msg: 'Chefe, sem meta ativa pra projetar.' };
    const inicio = new Date(meta.data_inicio || Date.now());
    const fim    = new Date(meta.data_fim    || Date.now());
    const hoje   = new Date();
    const totalDias    = Math.max(1, Math.round((fim - inicio) / (1000*60*60*24)));
    const diasPassados = Math.max(1, Math.round((hoje - inicio) / (1000*60*60*24)));
    const diasRestantes = Math.max(0, Math.round((fim - hoje) / (1000*60*60*24)));
    const realizado = meta.realizado || 0;
    const runRate = realizado / diasPassados; // por dia
    const projetado = realizado + (runRate * diasRestantes);
    const pctAtual = Math.round((realizado / meta.alvo) * 100);
    const pctProjetado = Math.round((projetado / meta.alvo) * 100);
    const fmt = (v) => meta.unidade === 'BRL' ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : Math.round(v);

    let recomendacao = '';
    if (pctProjetado >= 110) recomendacao = ` Vai bater com folga — considere AUMENTAR a meta em ${Math.round(pctProjetado - 100)}%.`;
    else if (pctProjetado >= 100) recomendacao = ` No ritmo certo pra bater no prazo. 🎯`;
    else if (pctProjetado >= 80) recomendacao = ` Quase lá. Acelera um pouco que bate.`;
    else if (pctProjetado >= 50) recomendacao = ` Em risco. Faltam ${diasRestantes}d e o ritmo atual leva só a ${pctProjetado}%.`;
    else recomendacao = ` ALERTA: ritmo muito baixo. Considere REDUZIR a meta ou plano de recuperação urgente.`;

    return {
      ok: true,
      msg: `Chefe, "${meta.nome}": ${fmt(realizado)} de ${fmt(meta.alvo)} (${pctAtual}%). Run rate: ${fmt(runRate)}/dia. Projeção em ${diasRestantes}d: ${fmt(projetado)} (${pctProjetado}%).${recomendacao}`,
      data: { meta, runRate, projetado, pctAtual, pctProjetado, diasRestantes },
    };
  }

  function queryMetaProgress(params, entities) {
    const list = readJSON(modeKey('fly_metas_v1'), []).filter(m => m.status === 'ativa');
    if (!list.length) return { ok: true, msg: 'Chefe, sem metas ativas no momento.' };
    const meta = params.name || params.escopo_nome ? _findMeta(params.name, params.escopo_nome) : null;
    if (meta) {
      const pct = meta.alvo ? Math.round((meta.realizado || 0) / meta.alvo * 100) : 0;
      const falta = Math.max(0, meta.alvo - (meta.realizado || 0));
      const fmt = meta.unidade === 'BRL' ? `R$ ${falta.toLocaleString('pt-BR')}` : falta;
      return { ok: true, msg: `Chefe, "${meta.nome}": ${pct}% atingido. Falta ${fmt} pra bater.`, data: meta };
    }
    const linhas = list.slice(0, 5).map(m => {
      const pct = m.alvo ? Math.round((m.realizado || 0) / m.alvo * 100) : 0;
      return `${m.nome}: ${pct}%`;
    }).join(' · ');
    return { ok: true, msg: `Chefe, ${list.length} meta(s) ativa(s) — ${linhas}`, data: { metas: list } };
  }

  /* ---------------------------------------------------------------
     STEP SYSTEM
  --------------------------------------------------------------- */
  const _stepListeners = [];

  function onStep(fn) {
    _stepListeners.push(fn);
    return () => { const i = _stepListeners.indexOf(fn); if (i >= 0) _stepListeners.splice(i, 1); };
  }

  function emitStep(step, status, detail) {
    for (const fn of _stepListeners) {
      try { fn({ step, status, detail }); } catch (e) {}
    }
  }

  /* ---------------------------------------------------------------
     EXECUTOR DE STEPS
  --------------------------------------------------------------- */
  async function runStep(step, entities, command) {
    emitStep(step, 'running', null);
    await new Promise(r => setTimeout(r, 180 + Math.random() * 120));

    const params = step.getParams(entities, command);
    const action = step.action;
    let result;

    // Ações internas do engine
    if (action === '__navigate') {
      const ok = navigateTo(params.module || entities.raw);
      result = { ok, msg: ok ? 'Navegação concluída.' : 'Módulo não encontrado. Tente: WAR, Cofre, Dashboard, CRM, Fly Cup.' };
    } else if (action === '__query_financial') {
      result = queryFinancial(params.period || 'month');
    } else if (action === '__query_count') {
      result = queryCount();
    } else if (action === '__query_top_product') {
      result = queryTopProduct();
    } else if (action === '__generate_report') {
      result = generateReport(params);
    } else if (action === 'update_product_metrics') {
      result = updateProductMetrics(params.product, params.sale_value);
    } else if (action === 'update_cockpit_metrics') {
      result = updateCockpitMetrics(params);
    } else if (action === 'create_task') {
      result = createTask(params);
    } else if (action === 'update_customer_stage') {
      result = updateCustomerStage(params);
    } else if (action === 'update_customer_field') {
      result = updateCustomerField(params);
    } else if (action === 'create_james_log') {
      // Log é criado ao final da operação completa — skip aqui
      result = { ok: true, msg: 'Log registrado.' };

    /* ── Connection Registry queries ── */
    } else if (action === '__query_panel_outgoing') {
      result = describeOutgoing(params.panel || extractPanelName(entities.raw));
    } else if (action === '__query_panel_incoming') {
      result = describeIncoming(params.panel || extractPanelName(entities.raw));
    } else if (action === '__query_panel_connections') {
      result = describeConnections(params.panel || extractPanelName(entities.raw));
    } else if (action === '__query_panel_suggestions') {
      result = describeSuggestions(params.panel || extractPanelName(entities.raw));

    /* ── Metas (alterar, ajustar, pausar, projetar) ── */
    } else if (action === '__update_meta') {
      result = updateMeta(params, entities);
    } else if (action === '__adjust_meta') {
      result = adjustMeta(params, entities);
    } else if (action === '__pause_meta') {
      result = pauseMeta(params, entities);
    } else if (action === '__project_meta') {
      result = projectMeta(params, entities);
    } else if (action === '__query_meta_progress') {
      result = queryMetaProgress(params, entities);

    } else if (window.__jamesActions?.execute) {
      // Delega para o catálogo de ações existente
      result = window.__jamesActions.execute(action, params);
    } else {
      result = { ok: false, msg: `Ação "${action}" não disponível.` };
    }

    const status = result?.ok !== false ? 'success' : 'error';
    emitStep(step, status, result?.msg);
    return { ...result, stepId: step.id };
  }

  /* ---------------------------------------------------------------
     PROCESSADOR PRINCIPAL
  --------------------------------------------------------------- */
  let _pendingOp = null;

  async function process(command) {
    if (!command || !command.trim()) return null;

    const parser = window.__jamesIntentParser;

    // ── Operação pendente: confirmação, cancelamento, correção, ou preenchimento de info ──
    if (_pendingOp) {
      const norm = normalizeText(command);

      // Sim → executa
      if (/\b(sim|confirma|confirmar|pode|vai|ok|certo|isso|feito|executa|bora|manda|tamo)\b/.test(norm)
          && _pendingOp.parsed?.subtype // não confirma se ainda está no needs_info inicial
          && !_pendingOp.awaitingInfo) {
        return await executeConfirmed();
      }

      // Não → cancela
      if (/^\s*(nao|n[aã]o|cancela|cancelar|para|desiste|errado|esquece|ignora)\b/.test(norm)) {
        _pendingOp = null;
        return { type: 'cancelled', text: 'Certo, Chefe. Operação cancelada.' };
      }

      // Extrai correções/dados novos da resposta
      const correction = extractEntities(command, {});
      const correctionKeys = Object.keys(correction).filter(
        k => k !== 'raw' && k !== 'period' && correction[k] !== null && correction[k] !== undefined
      );

      // Se o usuário deu uma resposta crua (ex: "Adrian", "Dubai Explorer"), tenta inferir pelo contexto
      // Quando estamos aguardando info de uma chave específica (awaitingInfo), interpretamos o input bruto
      if (_pendingOp.awaitingInfo && correctionKeys.length === 0) {
        const trimmed = command.trim();
        if (trimmed && trimmed.length > 1) {
          const key = _pendingOp.awaitingInfo;
          if (key === 'client_name') _pendingOp.entities.client_name = titleCase(trimmed);
          else if (key === 'product_name') _pendingOp.entities.product_name = normalizeProduct(trimmed) || titleCase(trimmed);
          else if (key === 'sale_value') {
            const v = extractValue(trimmed) || parseFloat(trimmed.replace(/[^\d.,]/g, '').replace(',', '.'));
            if (v) _pendingOp.entities.sale_value = v;
          }
          mergeContext(_pendingOp.entities);
        }
      } else if (correctionKeys.length > 0) {
        Object.assign(_pendingOp.entities, correction);
        mergeContext(_pendingOp.entities);
      }

      // Re-checa se ainda faltam entidades obrigatórias
      const stillMissing = getMissingRequired(_pendingOp.parsed.subtype, _pendingOp.entities);
      if (stillMissing.length > 0) {
        _pendingOp.awaitingInfo = stillMissing[0].key;
        return {
          type: 'needs_info',
          text: stillMissing[0].question,
          missingKey: stillMissing[0].key,
          entities: _pendingOp.entities,
        };
      }

      // Tudo preenchido — re-planeja e pede confirmação (se a intenção requerer)
      _pendingOp.plan = planActions(_pendingOp.parsed, _pendingOp.entities);
      _pendingOp.awaitingInfo = null;
      if (_pendingOp.plan.requiresConfirmation) {
        return {
          type: 'confirmation_request',
          text: buildConfirmationText(_pendingOp.parsed.subtype, _pendingOp.entities),
          entities: _pendingOp.entities,
          plan: _pendingOp.plan,
        };
      }
      // Não requer confirmação → executa direto
      return await executeConfirmed();
    }

    // ── Parse de intenção ──
    const parsed = parser
      ? parser.parseIntent(command)
      : { type: 'unknown', subtype: null, confidence: 0, category: 'unknown', requiresConfirmation: false };

    // Intenção desconhecida ou pergunta livre → deixa a IA tratar (engine retorna null)
    if (!parsed.subtype || parsed.type === 'unknown' || (parsed.type === 'query' && parsed.subtype === 'free_question')) {
      return null;
    }

    // ── Extração de entidades ──
    let entities = extractEntities(command, parsed);
    entities = resolveWithContext(entities);
    mergeContext(entities);

    // ── Entidades obrigatórias faltando? ──
    const missing = getMissingRequired(parsed.subtype, entities);
    if (missing.length > 0) {
      _pendingOp = {
        command, parsed, entities,
        plan: planActions(parsed, entities),
        awaitingInfo: missing[0].key,
      };
      return { type: 'needs_info', text: missing[0].question, missingKey: missing[0].key, entities };
    }

    // Plano de ação
    const plan = planActions(parsed, entities);

    // NAVEGAÇÃO: executa direto, sem confirmação
    if (parsed.subtype === 'open_module') {
      const ok = navigateTo(command.replace(/^(james[,\s]+)?/i, '')
        .replace(/^(abre|abra|abrir|vai|ir|leva|mostra|mostrar)\s+(?:o\s+|a\s+|pro?\s+|pra\s+|para\s+)?/i, '').trim());
      createLog(command, parsed, entities, plan, [{ ok }], 'completed');
      return {
        type: 'executed',
        text: ok ? 'Abrindo, Chefe.' : 'Chefe, não encontrei esse módulo. Tente: WAR, Cofre, Dashboard, CRM, Fly Cup.',
        steps: [],
        suggestions: [],
      };
    }

    // QUERIES / RELATÓRIOS: executa direto
    if (['query', 'report'].includes(parsed.type)) {
      const results = [];
      for (const step of plan.steps) {
        const r = await runStep(step, entities, command);
        results.push(r);
      }
      const responseText = results.find(r => r?.msg)?.msg || buildResponseText(parsed.subtype, entities, results);
      createLog(command, parsed, entities, plan, results, 'completed');
      return {
        type: 'executed',
        text: responseText,
        steps: plan.steps.map((s, i) => ({ ...s, status: results[i]?.ok !== false ? 'success' : 'error' })),
        suggestions: generateSuggestions(parsed.subtype, entities),
        data: results[0]?.data,
      };
    }

    // TAREFAS: executa direto
    if (parsed.type === 'task') {
      const results = [];
      for (const step of plan.steps) {
        const r = await runStep(step, entities, command);
        results.push(r);
      }
      createLog(command, parsed, entities, plan, results, 'completed');
      return {
        type: 'executed',
        text: buildResponseText(parsed.subtype, entities, results),
        steps: plan.steps.map((s, i) => ({ ...s, status: results[i]?.ok !== false ? 'success' : 'error' })),
        suggestions: [],
      };
    }

    // AÇÕES QUE PRECISAM DE CONFIRMAÇÃO
    if (plan.requiresConfirmation) {
      _pendingOp = { command, parsed, entities, plan };
      return {
        type: 'confirmation_request',
        text: buildConfirmationText(parsed.subtype, entities),
        entities,
        plan,
      };
    }

    // AÇÕES SEGURAS: executa direto
    const results = [];
    for (const step of plan.steps) {
      const r = await runStep(step, entities, command);
      results.push(r);
    }
    createLog(command, parsed, entities, plan, results, 'completed');
    return {
      type: 'executed',
      text: buildResponseText(parsed.subtype, entities, results),
      steps: plan.steps.map((s, i) => ({ ...s, status: results[i]?.ok !== false ? 'success' : 'error' })),
      suggestions: generateSuggestions(parsed.subtype, entities),
    };
  }

  async function executeConfirmed() {
    if (!_pendingOp) return null;
    const { command, parsed, entities, plan } = _pendingOp;
    _pendingOp = null;

    // Emite estado inicial de todos os steps
    for (const step of plan.steps) emitStep(step, 'pending', null);

    const results = [];
    for (const step of plan.steps) {
      const r = await runStep(step, entities, command);
      results.push(r);
    }

    createLog(command, parsed, entities, plan, results, 'completed');
    return {
      type: 'executed',
      text: buildResponseText(plan.subtype || parsed.subtype, entities, results),
      steps: plan.steps.map((s, i) => ({ ...s, status: results[i]?.ok !== false ? 'success' : 'error' })),
      suggestions: generateSuggestions(plan.subtype || parsed.subtype, entities),
    };
  }

  /* ---------------------------------------------------------------
     API PÚBLICA
  --------------------------------------------------------------- */
  window.__jamesEngine = {
    process,
    confirm: executeConfirmed,
    cancel() { _pendingOp = null; },
    correct(updates) {
      if (_pendingOp) { Object.assign(_pendingOp.entities, updates); mergeContext(_pendingOp.entities); }
    },
    onStep,
    getContext: () => ({ ..._ctx }),
    clearContext,
    getHistory: (limit) => readJSON('fly_james_logs_v1', []).slice(0, limit || 20),
    clearHistory() { try { localStorage.removeItem('fly_james_logs_v1'); } catch (e) {} },
    hasPendingOp: () => !!_pendingOp,
    getPendingOp: () => _pendingOp ? {
      subtype: _pendingOp.parsed?.subtype,
      entities: { ..._pendingOp.entities },
      awaitingInfo: _pendingOp.awaitingInfo,
    } : null,
    titleCase,
    normalizeProduct,
    extractEntities,
    generateReport,
    queryFinancial,
    queryTopProduct,
    queryCount,
  };

  console.log('[JAMES Engine] Fase 2+3 online. Pronto.');
})();
