/* =====================================================================
   JAMES ACTIONS — FASE 3
   Catálogo de ações executáveis no painel. Cada ação tem:
   - schema: descrição pra a IA saber quando usar
   - params: parâmetros aceitos
   - run: função que executa de fato
   ===================================================================== */
(function jamesActionsBoot() {
  'use strict';

  /* ----------------------------------------------------------
     UTILS internos
     ---------------------------------------------------------- */
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function getMode() {
    return localStorage.getItem('fly_data_mode') || 'demo';
  }
  function modeKey(base) {
    return `${base}_${getMode()}`;
  }
  function uuid() {
    return 'fly_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }
  function parseValue(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    const cleaned = String(str).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
    return Number(cleaned) || 0;
  }
  function dispatchUpdate(detail) {
    window.dispatchEvent(new CustomEvent('fly:data-update', { detail }));
  }

  /* ----------------------------------------------------------
     AÇÕES — Navegação (já existiam, redefinidas aqui pra centralizar)
     ---------------------------------------------------------- */
  const NAVIGATION = {
    open_cofre: {
      desc: 'Abre o Cofre AEY (painel financeiro)',
      params: {},
      run() {
        if (typeof window.__flyCofreOpen === 'function') { window.__flyCofreOpen(); return { ok: true, msg: 'Cofre AEY aberto.' }; }
        const btn = document.getElementById('cofreTriggerBtn') || document.querySelector('.cofre-trigger');
        if (btn) { btn.click(); return { ok: true, msg: 'Cofre AEY aberto.' }; }
        return { ok: false, msg: 'Cofre não disponível.' };
      },
    },
    open_dashboard: {
      desc: 'Abre o Dashboard Supremo (cockpit)',
      params: {},
      run() {
        if (typeof window.__flyDashboardOpen === 'function') { window.__flyDashboardOpen(); return { ok: true, msg: 'Dashboard aberto.' }; }
        const btn = document.getElementById('dashboardSupremoTrigger');
        if (btn) { btn.click(); return { ok: true, msg: 'Dashboard aberto.' }; }
        return { ok: false, msg: 'Dashboard não disponível.' };
      },
    },
    open_expansoes: {
      desc: 'Abre painel de Expansões (CRM, Projetos, Ranking, Relatórios)',
      params: { tab: 'crm | projetos | ranking | relatorios | james (opcional)' },
      run(p) {
        if (typeof window.__flyExpansoesOpen === 'function') { window.__flyExpansoesOpen(p?.tab); return { ok: true, msg: 'Expansões abertas.' }; }
        const btn = document.getElementById('flyExpTrigger');
        if (btn) { btn.click(); return { ok: true, msg: 'Expansões abertas.' }; }
        return { ok: false, msg: 'Expansões não disponível.' };
      },
    },
    set_data_mode: {
      desc: 'Muda o modo de dados (demo, operational, goal)',
      params: { mode: 'demo | operational | goal' },
      run(p) {
        const m = String(p?.mode || '').toLowerCase();
        if (!['demo', 'operational', 'goal'].includes(m)) return { ok: false, msg: 'Modo inválido. Use demo, operational ou goal.' };
        localStorage.setItem('fly_data_mode', m);
        window.dispatchEvent(new CustomEvent('fly:data-mode-change', { detail: { mode: m } }));
        return { ok: true, msg: `Modo trocado para ${m}.` };
      },
    },
    close_all: {
      desc: 'Fecha todos os overlays/modais abertos',
      params: {},
      run() {
        document.querySelectorAll('.modal, .overlay, .dash-overlay, .cofre-overlay, .fly-exp-modal').forEach(el => {
          el.classList.add('hidden');
        });
        return { ok: true, msg: 'Overlays fechados.' };
      },
    },
  };

  /* ----------------------------------------------------------
     AÇÕES — Cofre AEY (financeiro)
     ---------------------------------------------------------- */
  const COFRE = {
    add_movement: {
      desc: 'Adiciona movimento financeiro no Cofre AEY (receita, despesa, transferência)',
      params: {
        type: 'income | expense | internal_transfer | credit_card_expense',
        amount: 'número (R$)',
        description: 'texto descritivo',
        category: 'categoria (opcional)',
        partner: 'nome do sócio (opcional: Victor, Emanuel, Alen/Adrian, Juninho)',
        money_owner: 'fly | aey | personal | project (default: fly)',
      },
      run(p) {
        const m = {
          id: uuid(),
          movement_type: p.type || 'expense',
          amount: parseValue(p.amount),
          date: p.date || new Date().toISOString().slice(0, 10),
          description: p.description || '',
          category: p.category || 'outros',
          money_owner: p.money_owner || 'fly',
          partner: p.partner || null,
          status: 'confirmed',
          created_at: new Date().toISOString(),
        };
        if (m.amount <= 0) return { ok: false, msg: 'Valor inválido.' };

        // Salva no localStorage modo-aware
        const key = modeKey('fly_moves_v1');
        const arr = readJSON(key, []);
        arr.unshift(m);
        writeJSON(key, arr);

        // Tenta sync no Supabase (se rodando)
        try { window.__flySync?.push?.('money_movements', m); } catch (e) {}

        dispatchUpdate({ entity: 'cofre', action: 'add_movement', data: m });
        const tipo = ({ income: 'Receita', expense: 'Despesa', internal_transfer: 'Transferência', credit_card_expense: 'Despesa cartão' })[m.movement_type] || 'Movimento';
        return { ok: true, msg: `${tipo} de R$ ${m.amount.toFixed(2)} registrada: "${m.description}".` };
      },
    },

    get_balance: {
      desc: 'Consulta saldo do Cofre AEY',
      params: { partner: 'nome do sócio (opcional)' },
      run(p) {
        if (window.__flyCofreAPI) {
          const fly = window.__flyCofreAPI.totalCaixaFly?.() || 0;
          const pessoal = window.__flyCofreAPI.totalCaixaPersonal?.() || 0;
          const fatura = window.__flyCofreAPI.invoiceOpenTotal?.() || 0;
          if (p?.partner) {
            const saldo = window.__flyCofreAPI.partnerBalance?.(p.partner) || 0;
            return { ok: true, msg: `Saldo de ${p.partner}: R$ ${saldo.toFixed(2)}.` };
          }
          return { ok: true, msg: `Cofre Fly: R$ ${fly.toFixed(2)}. Pessoal total: R$ ${pessoal.toFixed(2)}. Fatura aberta: R$ ${fatura.toFixed(2)}.` };
        }
        // Fallback: lê do localStorage
        const moves = readJSON(modeKey('fly_moves_v1'), []);
        const total = moves.reduce((acc, m) => acc + (m.movement_type === 'income' ? m.amount : -m.amount), 0);
        return { ok: true, msg: `Saldo aproximado: R$ ${total.toFixed(2)} (${moves.length} movimentos).` };
      },
    },
  };

  /* ----------------------------------------------------------
     AÇÕES — Vendas / Clientes
     ---------------------------------------------------------- */
  const VENDAS = {
    add_customer: {
      desc: 'Cadastra novo cliente no CRM',
      params: {
        name: 'nome (obrigatório)',
        phone: 'telefone',
        instagram: '@usuario',
        email: 'email',
        stage: 'lead_frio | lead_quente | qualificado | proposta | fechado',
        desire_dubai: 'true | false',
        notes: 'observações',
      },
      run(p) {
        if (!p.name) return { ok: false, msg: 'Nome é obrigatório.' };
        const c = {
          id: uuid(),
          data_mode: getMode(),
          name: p.name,
          phone: p.phone || '',
          instagram: p.instagram || '',
          email: p.email || '',
          origin: p.origin || '',
          stage: p.stage || 'lead_frio',
          desire_dubai: !!p.desire_dubai,
          score: 0,
          notes: p.notes || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const key = modeKey('fly_customers_v1');
        const arr = readJSON(key, []);
        arr.unshift(c);
        writeJSON(key, arr);
        try { window.__flySync?.push?.('customers', c); } catch (e) {}
        dispatchUpdate({ entity: 'customer', action: 'add', data: c });
        return { ok: true, msg: `Cliente "${c.name}" cadastrado.` };
      },
    },

    add_sale: {
      desc: 'Registra nova venda',
      params: {
        name: 'nome do cliente (obrigatório)',
        product: 'produto/pacote (ex: Dubai Explorer)',
        amount: 'valor total (R$)',
        signal_amount: 'sinal pago (opcional)',
        payment_method: 'PIX | Cartão | Boleto | Transferência | Dinheiro',
        origin: 'Instagram | TikTok | Indicação | Site | WhatsApp',
        status: 'sinal_pago | pago | cancelado | agendado',
        travel_date: 'YYYY-MM-DD (opcional)',
        seller: 'vendedor (opcional)',
      },
      run(p) {
        if (!p.name) return { ok: false, msg: 'Nome do cliente é obrigatório.' };
        const s = {
          id: uuid(),
          data_mode: getMode(),
          name: p.name,
          phone: p.phone || '',
          instagram: p.instagram || '',
          origin: p.origin || '',
          product: p.product || 'Pacote',
          amount: parseValue(p.amount),
          signal: parseValue(p.signal_amount),
          payment_method: p.payment_method || '',
          travel_date: p.travel_date || null,
          seller: p.seller || '',
          status: p.status || 'sinal_pago',
          notes: p.notes || '',
          created_at: new Date().toISOString(),
        };
        const key = modeKey('fly_sales_v1');
        const arr = readJSON(key, []);
        arr.unshift(s);
        writeJSON(key, arr);
        try { window.__flySync?.push?.('sales', s); } catch (e) {}
        dispatchUpdate({ entity: 'sale', action: 'add', data: s });
        return { ok: true, msg: `Venda "${s.product}" para ${s.name} (R$ ${s.amount.toFixed(2)}) registrada.` };
      },
    },

    list_customers: {
      desc: 'Lista clientes (resumo)',
      params: { stage: 'filtro por estágio (opcional)', limit: 'quantidade (default 10)' },
      run(p) {
        const arr = readJSON(modeKey('fly_customers_v1'), []);
        let list = arr;
        if (p?.stage) list = list.filter(c => c.stage === p.stage);
        const lim = Math.min(p?.limit || 10, 20);
        const names = list.slice(0, lim).map(c => c.name).join(', ');
        return { ok: true, msg: `${list.length} cliente(s)${p?.stage ? ` no estágio ${p.stage}` : ''}. Primeiros: ${names || 'nenhum'}.` };
      },
    },
  };

  /* ----------------------------------------------------------
     AÇÕES — Fly Cup (atletas, polos, eventos)
     ---------------------------------------------------------- */
  const FLY_CUP = {
    add_polo: {
      desc: 'Cadastra novo polo do Fly Cup',
      params: {
        nome: 'nome do polo (obrigatório)',
        modalidade: 'futebol | futevolei | tenis | kart | surf | basquete | skate | paintball | airsoft | outros',
        cidade: 'cidade',
        responsavel: 'responsável',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        const polo = {
          id: uuid(),
          data_mode: getMode(),
          modalidade: p.modalidade || 'outros',
          nome: p.nome,
          cidade: p.cidade || '',
          responsavel: p.responsavel || '',
          atletas: 0,
          created_at: new Date().toISOString(),
        };
        const key = modeKey('fly_cup_polos_v1');
        const arr = readJSON(key, []);
        arr.unshift(polo);
        writeJSON(key, arr);
        try { window.__flySync?.push?.('fly_cup_polos', polo); } catch (e) {}
        dispatchUpdate({ entity: 'polo', action: 'add', data: polo });
        return { ok: true, msg: `Polo "${polo.nome}" (${polo.modalidade}) cadastrado.` };
      },
    },

    add_atleta: {
      desc: 'Cadastra atleta no Fly Cup',
      params: {
        nome: 'nome (obrigatório)',
        modalidade: 'futebol | futevolei | tenis | etc',
        polo_nome: 'nome do polo (opcional)',
        desire_dubai: 'true | false',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        // Tenta achar polo por nome
        let polo_id = null;
        if (p.polo_nome) {
          const polos = readJSON(modeKey('fly_cup_polos_v1'), []);
          const found = polos.find(x => (x.nome || '').toLowerCase() === p.polo_nome.toLowerCase());
          if (found) polo_id = found.id;
        }
        const atleta = {
          id: uuid(),
          data_mode: getMode(),
          polo_id,
          modalidade: p.modalidade || 'outros',
          nome: p.nome,
          desire_dubai: !!p.desire_dubai,
          ranking: null,
          created_at: new Date().toISOString(),
        };
        const key = modeKey('fly_cup_atletas_v1');
        const arr = readJSON(key, []);
        arr.unshift(atleta);
        writeJSON(key, arr);
        try { window.__flySync?.push?.('fly_cup_atletas', atleta); } catch (e) {}
        dispatchUpdate({ entity: 'atleta', action: 'add', data: atleta });
        return { ok: true, msg: `Atleta "${atleta.nome}" (${atleta.modalidade}) cadastrado.` };
      },
    },

    add_evento: {
      desc: 'Cadastra evento do Fly Cup',
      params: {
        nome: 'nome do evento (obrigatório)',
        modalidade: 'modalidade',
        data: 'YYYY-MM-DD',
        local: 'local',
        vagas: 'número de vagas',
        receita: 'receita projetada',
        custo: 'custo projetado',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        const evento = {
          id: uuid(),
          data_mode: getMode(),
          nome: p.nome,
          modalidade: p.modalidade || 'outros',
          data: p.data || null,
          local: p.local || '',
          vagas: Number(p.vagas) || 0,
          receita: parseValue(p.receita),
          custo: parseValue(p.custo),
          created_at: new Date().toISOString(),
        };
        const key = modeKey('fly_cup_eventos_v1');
        const arr = readJSON(key, []);
        arr.unshift(evento);
        writeJSON(key, arr);
        try { window.__flySync?.push?.('fly_cup_eventos', evento); } catch (e) {}
        dispatchUpdate({ entity: 'evento', action: 'add', data: evento });
        return { ok: true, msg: `Evento "${evento.nome}" cadastrado.` };
      },
    },
  };

  /* ----------------------------------------------------------
     AÇÕES — Plano WAR (territórios)
     ---------------------------------------------------------- */
  const WAR = {
    add_territory: {
      desc: 'Adiciona território no Plano WAR',
      params: {
        nome: 'nome do território (obrigatório)',
        status: 'planejado | ativo | conquistado | em_negociacao',
        layers: 'array de camadas (opcional)',
        notas: 'observações',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        const t = {
          id: uuid(),
          name: p.nome,
          status: p.status || 'planejado',
          layers: Array.isArray(p.layers) ? p.layers : [],
          notes: p.notas || '',
          created_at: new Date().toISOString(),
        };
        const key = modeKey('fly_war_territories_v1');
        const arr = readJSON(key, []);
        arr.unshift(t);
        writeJSON(key, arr);
        try { window.__flySync?.push?.('war_territories', { id: t.id, data_mode: getMode(), payload: t }); } catch (e) {}
        dispatchUpdate({ entity: 'war_territory', action: 'add', data: t });
        return { ok: true, msg: `Território "${t.name}" adicionado ao Plano WAR.` };
      },
    },
  };

  /* ----------------------------------------------------------
     AÇÕES — Projetos
     ---------------------------------------------------------- */
  const PROJETOS = {
    add_project: {
      desc: 'Cria novo projeto',
      params: {
        nome: 'nome do projeto (obrigatório)',
        status: 'status (planejamento, ativo, pausado, concluido)',
        descricao: 'descrição',
        orcamento: 'orçamento total',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        const proj = {
          id: uuid(),
          data_mode: getMode(),
          nome: p.nome,
          status: p.status || 'planejamento',
          descricao: p.descricao || '',
          orcamento: parseValue(p.orcamento),
          gasto: 0,
          created_at: new Date().toISOString(),
        };
        const key = modeKey('fly_projects_v1');
        const arr = readJSON(key, []);
        arr.unshift(proj);
        writeJSON(key, arr);
        dispatchUpdate({ entity: 'project', action: 'add', data: proj });
        return { ok: true, msg: `Projeto "${proj.nome}" criado.` };
      },
    },
  };

  /* ----------------------------------------------------------
     CATÁLOGO COMPLETO + RUNNER
     ---------------------------------------------------------- */
  const ALL_ACTIONS = Object.assign({}, NAVIGATION, COFRE, VENDAS, FLY_CUP, WAR, PROJETOS);

  function listActions() {
    return Object.entries(ALL_ACTIONS).map(([name, def]) => ({
      name,
      desc: def.desc,
      params: def.params || {},
    }));
  }

  function execute(actionName, params) {
    const def = ALL_ACTIONS[actionName];
    if (!def) return { ok: false, msg: `Ação desconhecida: ${actionName}` };
    try {
      const result = def.run(params || {});
      console.log(`[JAMES Actions] ${actionName}`, params, '→', result);
      return result || { ok: true, msg: 'Executado.' };
    } catch (e) {
      console.error(`[JAMES Actions] Erro em ${actionName}:`, e);
      return { ok: false, msg: 'Erro: ' + (e.message || e) };
    }
  }

  function buildActionsPromptSection() {
    const lines = ['', '=== AÇÕES EXECUTÁVEIS ===',
      'Você PODE executar ações no painel emitindo um bloco no formato:',
      '[ACTION:nome_acao]{"param1":"valor","param2":"valor"}',
      '',
      'Coloque o ACTION DEPOIS do texto da resposta. Use UMA ação por mensagem (ou múltiplas em sequência).',
      'Sempre confirme a ação no texto antes (ex: "Vou cadastrar o cliente Maria, Chefe."), e depois emita o ACTION.',
      'Se o usuário não der dados suficientes, PERGUNTE — não emita ACTION com dados inventados.',
      '',
      'AÇÕES DISPONÍVEIS:',
    ];
    for (const [name, def] of Object.entries(ALL_ACTIONS)) {
      lines.push(`- ${name}: ${def.desc}`);
      if (def.params && Object.keys(def.params).length) {
        const paramList = Object.entries(def.params).map(([k, v]) => `${k}=${v}`).join(', ');
        lines.push(`  params: ${paramList}`);
      }
    }
    lines.push('', 'EXEMPLOS:');
    lines.push('Chefe: "James, cadastra cliente João Silva, telefone 11999998888"');
    lines.push('Você: "Cliente João Silva cadastrado, Chefe. [ACTION:add_customer]{\\"name\\":\\"João Silva\\",\\"phone\\":\\"11999998888\\"}"');
    lines.push('');
    lines.push('Chefe: "Lança despesa de R$ 200 em combustível"');
    lines.push('Você: "Despesa registrada. [ACTION:add_movement]{\\"type\\":\\"expense\\",\\"amount\\":200,\\"description\\":\\"combustível\\",\\"category\\":\\"transporte\\"}"');
    return lines.join('\n');
  }

  // Expõe API
  window.__jamesActions = {
    list: listActions,
    execute,
    promptSection: buildActionsPromptSection,
    available: () => Object.keys(ALL_ACTIONS),
  };
})();
