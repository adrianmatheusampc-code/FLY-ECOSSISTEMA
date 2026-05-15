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
     AÇÕES — Tarefas, Métricas, Relatórios, Logs (FASE 2+3)
     ---------------------------------------------------------- */
  const FASE3 = {
    create_task: {
      desc: 'Cria tarefa ou lembrete',
      params: { title: 'título (obrigatório)', client: 'cliente', product: 'produto', date: 'YYYY-MM-DD', type: 'task | reminder | followup | contract' },
      run(p) {
        if (!p.title) return { ok: false, msg: 'Título obrigatório.' };
        const key = `fly_tasks_v1_${getMode()}`;
        const tasks = readJSON(key, []);
        const task = {
          id: uuid(), title: p.title, client: p.client || null, product: p.product || null,
          date: p.date || new Date().toISOString().slice(0, 10),
          type: p.type || 'task', status: 'pending',
          created_at: new Date().toISOString(), created_by: 'james',
        };
        tasks.unshift(task);
        if (tasks.length > 200) tasks.splice(200);
        writeJSON(key, tasks);
        dispatchUpdate({ entity: 'task', action: 'add', data: task });
        return { ok: true, msg: `Tarefa "${task.title}" criada.` };
      },
    },

    update_product_metrics: {
      desc: 'Atualiza métricas de um produto (vendas + faturamento)',
      params: { product: 'nome do produto (obrigatório)', sale_value: 'valor (R$)', sales_delta: 'incremento de vendas (default 1)' },
      run(p) {
        if (!p.product) return { ok: true, msg: 'Produto não informado.' };
        const key = `fly_product_metrics_v1_${getMode()}`;
        const metrics = readJSON(key, {});
        if (!metrics[p.product]) metrics[p.product] = { sales: 0, revenue: 0 };
        metrics[p.product].sales += (p.sales_delta || 1);
        metrics[p.product].revenue += parseValue(p.sale_value);
        metrics[p.product].updated_at = new Date().toISOString();
        writeJSON(key, metrics);
        dispatchUpdate({ entity: 'product_metrics', product: p.product });
        return { ok: true, msg: `Produto ${p.product} atualizado: ${metrics[p.product].sales} venda(s), R$ ${metrics[p.product].revenue.toFixed(2)} em receita.` };
      },
    },

    update_cockpit_metrics: {
      desc: 'Atualiza métricas do Cockpit (receita, despesas, vendas)',
      params: { revenue_delta: 'incremento receita', expense_delta: 'incremento despesa', sales_delta: 'incremento de vendas' },
      run(p) {
        const key = `fly_cockpit_metrics_v1_${getMode()}`;
        const c = readJSON(key, { total_revenue: 0, total_expenses: 0, sales_count: 0 });
        if (p.revenue_delta) c.total_revenue += parseValue(p.revenue_delta);
        if (p.expense_delta) c.total_expenses += parseValue(p.expense_delta);
        if (p.sales_delta) c.sales_count += Number(p.sales_delta) || 0;
        c.total_profit = c.total_revenue - c.total_expenses;
        c.updated_at = new Date().toISOString();
        writeJSON(key, c);
        dispatchUpdate({ entity: 'cockpit' });
        window.dispatchEvent(new CustomEvent('fly:cockpit-update', { detail: c }));
        return { ok: true, msg: `Cockpit: receita R$ ${c.total_revenue.toFixed(2)}, lucro R$ ${c.total_profit.toFixed(2)}.` };
      },
    },

    get_cockpit_metrics: {
      desc: 'Consulta métricas do Cockpit',
      params: {},
      run() {
        const key = `fly_cockpit_metrics_v1_${getMode()}`;
        const c = readJSON(key, { total_revenue: 0, total_expenses: 0, sales_count: 0, total_profit: 0 });
        return {
          ok: true,
          msg: `Cockpit: receita total R$ ${(c.total_revenue || 0).toFixed(2)}, despesas R$ ${(c.total_expenses || 0).toFixed(2)}, lucro R$ ${(c.total_profit || 0).toFixed(2)}, ${c.sales_count || 0} venda(s).`,
        };
      },
    },

    navigate_to: {
      desc: 'Navega para um módulo do painel (cofre, war, dashboard, crm, fly cup...)',
      params: { module: 'nome do módulo' },
      run(p) {
        if (!p.module) return { ok: false, msg: 'Módulo não especificado.' };
        if (window.__jamesEngine?.process) return { ok: true, msg: 'Delegando ao engine.' };
        return { ok: false, msg: 'Engine não disponível.' };
      },
    },

    list_tasks: {
      desc: 'Lista tarefas pendentes',
      params: { client: 'filtro por cliente (opcional)', type: 'filtro por tipo (opcional)', limit: 'quantidade (default 10)' },
      run(p) {
        const key = `fly_tasks_v1_${getMode()}`;
        const tasks = readJSON(key, []);
        let list = tasks.filter(t => t.status === 'pending');
        if (p.client) list = list.filter(t => (t.client || '').toLowerCase().includes(p.client.toLowerCase()));
        if (p.type) list = list.filter(t => t.type === p.type);
        const lim = Math.min(p.limit || 10, 30);
        const names = list.slice(0, lim).map(t => `"${t.title}"`).join(', ');
        return { ok: true, msg: `${list.length} tarefa(s) pendente(s). ${names ? 'Próximas: ' + names : ''}` };
      },
    },

    create_james_log: {
      desc: 'Registra operação no histórico do James',
      params: { command: 'comando original', summary: 'resumo da operação' },
      run(p) {
        const key = 'fly_james_logs_v1';
        const logs = readJSON(key, []);
        logs.unshift({
          id: uuid(), command: p.command || '', summary: p.summary || 'Operação registrada',
          timestamp: new Date().toISOString(), created_by: 'james',
        });
        if (logs.length > 150) logs.splice(150);
        writeJSON(key, logs);
        return { ok: true, msg: 'Log salvo.' };
      },
    },
  };

  /* ----------------------------------------------------------
     AÇÕES — Painel de Pacotes (Dubai Explorer e demais format='pacotes')
     Operam via window.__flyPacoteAPI exposto em index.html.
     Cada ação resolve o pacote alvo (parâmetro `pacote` por nome, ou
     o pacote aberto agora via currentItem()), carrega o D (referência
     viva), modifica, e chama save() — que persiste e re-renderiza.
     ---------------------------------------------------------- */
  function _normName(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  function _resolvePacote(p) {
    const api = window.__flyPacoteAPI;
    if (!api) return { err: 'Painel de Pacotes não disponível.' };
    let item = null;
    if (p && p.pacote) {
      item = api.find(p.pacote);
      if (!item) return { err: `Pacote "${p.pacote}" não encontrado. Pacotes disponíveis: ${api.list().map(x => x.name).join(', ') || '(nenhum)'}.` };
    } else {
      item = api.currentItem && api.currentItem();
      if (!item) return { err: 'Nenhum pacote aberto. Diga o nome do pacote (ex: "Dubai Explorer") ou abra o painel.' };
    }
    const D = api.load(item);
    if (!D) return { err: 'Erro ao carregar dados do pacote.' };
    return { api, item, D };
  }

  function _findIndexByName(arr, nameField, query) {
    if (!Array.isArray(arr)) return -1;
    const target = _normName(query);
    if (!target) return -1;
    // exato → contém
    let idx = arr.findIndex(x => _normName(x?.[nameField]) === target);
    if (idx === -1) idx = arr.findIndex(x => _normName(x?.[nameField]).includes(target));
    return idx;
  }

  const PACOTES = {
    pacote_list: {
      desc: 'Lista todos os pacotes disponíveis no sistema',
      params: {},
      run() {
        const api = window.__flyPacoteAPI;
        if (!api) return { ok: false, msg: 'Painel de Pacotes não disponível.' };
        const list = api.list();
        if (!list.length) return { ok: true, msg: 'Nenhum pacote cadastrado ainda.' };
        const names = list.map(x => `"${x.name}"`).join(', ');
        return { ok: true, msg: `${list.length} pacote(s): ${names}.` };
      },
    },

    pacote_query: {
      desc: 'Resumo geral de um pacote (clientes pagos, receita, custos, equipe, experiências)',
      params: { pacote: 'nome do pacote (opcional se houver um aberto)' },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { item, D } = r;
        const clientes = D.clientes || [];
        const pagos = clientes.filter(c => c.status === 'pago' || c.status === 'confirmado').length;
        const cancelados = clientes.filter(c => c.status === 'cancelado').length;
        const ticket = Number(D.vendas?.ticketMedio) || 0;
        const receita = pagos * ticket;
        const fixos = (D.custos?.fixos || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
        const variaveis = (D.custos?.variaveis || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
        const exps = (D.produto?.experiencias || []).length;
        const equipe = (D.equipe || []).length;
        const checklist = D.operacao?.checklist || [];
        const feitos = checklist.filter(c => c.done).length;
        const metaCli = D.metaReal?.clientes?.meta || 0;
        const realCli = D.metaReal?.clientes?.real || 0;
        const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR');
        return {
          ok: true,
          msg: `📦 "${item.name}": ${pagos} cliente(s) pago(s)${cancelados ? `, ${cancelados} cancelado(s)` : ''} · receita ${fmt(receita)} · ticket ${fmt(ticket)} · custos ${fmt(fixos + variaveis)} (fixo ${fmt(fixos)} + variável ${fmt(variaveis)}) · ${exps} experiência(s) · ${equipe} pessoa(s) na equipe · checklist ${feitos}/${checklist.length} · meta clientes: ${realCli}/${metaCli}.`,
        };
      },
    },

    pacote_edit_produto: {
      desc: 'Edita campos gerais do produto (nome, duração, tipo, descrição, banner)',
      params: {
        pacote: 'nome do pacote (opcional se houver um aberto)',
        nome: 'novo nome do produto',
        duracao: 'ex: "7 dias / 6 noites"',
        tipo: 'ex: "Aventura · Premium"',
        descricao: 'texto descritivo do pacote',
        banner: 'URL ou dataURL da imagem do banner',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.produto) D.produto = {};
        const changes = [];
        if (p.nome) { D.produto.nome = p.nome; changes.push(`nome="${p.nome}"`); }
        if (p.duracao) { D.produto.duracao = p.duracao; changes.push(`duração="${p.duracao}"`); }
        if (p.tipo) { D.produto.tipo = p.tipo; changes.push(`tipo="${p.tipo}"`); }
        if (p.descricao) { D.produto.descricao = p.descricao; changes.push('descrição atualizada'); }
        if (p.banner) { D.produto.banner = p.banner; changes.push('banner atualizado'); }
        if (!changes.length) return { ok: false, msg: 'Nenhum campo informado para atualizar.' };
        api.save(item);
        return { ok: true, msg: `Produto "${item.name}" atualizado: ${changes.join(', ')}.` };
      },
    },

    pacote_add_experiencia: {
      desc: 'Adiciona experiência/passeio ao produto (ex: Burj Khalifa, Safari)',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome do passeio (obrigatório)',
        desc: 'descrição curta (opcional)',
        icon: 'emoji do ícone (opcional, ex: 🏜️)',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do passeio é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.produto) D.produto = {};
        if (!Array.isArray(D.produto.experiencias)) D.produto.experiencias = [];
        D.produto.experiencias.push({ nome: p.nome, desc: p.desc || '', icon: p.icon || '📍' });
        api.save(item);
        return { ok: true, msg: `Passeio "${p.nome}" adicionado ao ${item.name}.` };
      },
    },

    pacote_remove_experiencia: {
      desc: 'Remove experiência/passeio do pacote por nome (fuzzy)',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome do passeio a remover (obrigatório)',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do passeio é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        const arr = D.produto?.experiencias;
        const idx = _findIndexByName(arr, 'nome', p.nome);
        if (idx === -1) return { ok: false, msg: `Passeio "${p.nome}" não encontrado em ${item.name}.` };
        const removed = arr.splice(idx, 1)[0];
        api.save(item);
        return { ok: true, msg: `Passeio "${removed.nome}" removido do ${item.name}.` };
      },
    },

    pacote_add_incluso: {
      desc: 'Adiciona item ao "O que está incluso" (ex: Hospedagem, Transporte, Refeições)',
      params: {
        pacote: 'nome do pacote (opcional)',
        lbl: 'rótulo (ex: Hospedagem, Passagem aérea)',
        val: 'detalhes (ex: "Atlantis · Suíte Ocean View · 6 noites")',
      },
      run(p) {
        if (!p.lbl) return { ok: false, msg: 'Rótulo é obrigatório (ex: Hospedagem).' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.produto) D.produto = {};
        if (!Array.isArray(D.produto.incluso)) D.produto.incluso = [];
        D.produto.incluso.push({ lbl: p.lbl, val: p.val || '' });
        api.save(item);
        return { ok: true, msg: `Incluso "${p.lbl}${p.val ? `: ${p.val}` : ''}" adicionado ao ${item.name}.` };
      },
    },

    pacote_remove_incluso: {
      desc: 'Remove item do "O que está incluso" por rótulo (fuzzy)',
      params: { pacote: 'nome do pacote (opcional)', lbl: 'rótulo a remover (obrigatório)' },
      run(p) {
        if (!p.lbl) return { ok: false, msg: 'Rótulo é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        const arr = D.produto?.incluso;
        const idx = _findIndexByName(arr, 'lbl', p.lbl);
        if (idx === -1) return { ok: false, msg: `Item "${p.lbl}" não encontrado.` };
        const removed = arr.splice(idx, 1)[0];
        api.save(item);
        return { ok: true, msg: `Item incluso "${removed.lbl}" removido do ${item.name}.` };
      },
    },

    pacote_add_custo: {
      desc: 'Adiciona custo (fixo ou variável) ao pacote',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome do custo (obrigatório, ex: Hotel, Passagem aérea)',
        valor: 'valor R$ (obrigatório)',
        tipo: 'fixo | variavel (default: fixo)',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do custo é obrigatório.' };
        const valor = parseValue(p.valor);
        if (valor <= 0) return { ok: false, msg: 'Valor inválido.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.custos) D.custos = { fixos: [], variaveis: [] };
        const isFix = !p.tipo || /fix/i.test(String(p.tipo));
        const arr = isFix
          ? (D.custos.fixos || (D.custos.fixos = []))
          : (D.custos.variaveis || (D.custos.variaveis = []));
        arr.push({ nome: p.nome, valor });
        api.save(item);
        return { ok: true, msg: `Custo ${isFix ? 'fixo' : 'variável'} "${p.nome}" (R$ ${valor.toLocaleString('pt-BR')}) adicionado ao ${item.name}.` };
      },
    },

    pacote_remove_custo: {
      desc: 'Remove custo do pacote por nome (busca em fixos e variáveis)',
      params: { pacote: 'nome do pacote (opcional)', nome: 'nome do custo (obrigatório)' },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do custo é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        let removed = null;
        let tipo = '';
        for (const k of ['fixos', 'variaveis']) {
          const arr = D.custos?.[k];
          const idx = _findIndexByName(arr, 'nome', p.nome);
          if (idx !== -1) { removed = arr.splice(idx, 1)[0]; tipo = k === 'fixos' ? 'fixo' : 'variável'; break; }
        }
        if (!removed) return { ok: false, msg: `Custo "${p.nome}" não encontrado em ${item.name}.` };
        api.save(item);
        return { ok: true, msg: `Custo ${tipo} "${removed.nome}" removido do ${item.name}.` };
      },
    },

    pacote_edit_base_operacional: {
      desc: 'Edita a base operacional do pacote (hotel, localização, transporte base)',
      params: {
        pacote: 'nome do pacote (opcional)',
        hotel: 'nome e endereço do hotel',
        localizacao: 'descrição da localização',
        transporteBase: 'descrição do transporte base',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.operacao) D.operacao = {};
        if (!D.operacao.base) D.operacao.base = {};
        const changes = [];
        if (p.hotel) { D.operacao.base.hotel = p.hotel; changes.push('hotel'); }
        if (p.localizacao) { D.operacao.base.localizacao = p.localizacao; changes.push('localização'); }
        if (p.transporteBase) { D.operacao.base.transporteBase = p.transporteBase; changes.push('transporte base'); }
        if (!changes.length) return { ok: false, msg: 'Nenhum campo informado.' };
        api.save(item);
        return { ok: true, msg: `Base operacional do ${item.name} atualizada: ${changes.join(', ')}.` };
      },
    },

    pacote_add_roteiro_dia: {
      desc: 'Adiciona dia ao roteiro operacional do pacote',
      params: {
        pacote: 'nome do pacote (opcional)',
        dia: 'número do dia (ex: 1, 2, 3) — opcional, usa próximo se omitir',
        hora: 'horário (ex: 09h ou 14:00)',
        titulo: 'título do dia (obrigatório, ex: "Chegada DXB")',
        desc: 'descrição detalhada',
      },
      run(p) {
        if (!p.titulo) return { ok: false, msg: 'Título do dia é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.operacao) D.operacao = {};
        if (!Array.isArray(D.operacao.roteiro)) D.operacao.roteiro = [];
        const proximo = D.operacao.roteiro.reduce((m, r) => Math.max(m, Number(r.dia) || 0), 0) + 1;
        const dia = Number(p.dia) || proximo;
        D.operacao.roteiro.push({ dia, hora: p.hora || '09h', titulo: p.titulo, desc: p.desc || '' });
        D.operacao.roteiro.sort((a, b) => (Number(a.dia) || 0) - (Number(b.dia) || 0));
        api.save(item);
        return { ok: true, msg: `Dia ${dia} "${p.titulo}" adicionado ao roteiro do ${item.name}.` };
      },
    },

    pacote_add_checklist: {
      desc: 'Adiciona item ao checklist operacional do pacote',
      params: {
        pacote: 'nome do pacote (opcional)',
        item: 'texto do item (obrigatório, ex: "Seguro viagem")',
        done: 'true | false (default: false)',
      },
      run(p) {
        if (!p.item) return { ok: false, msg: 'Texto do item é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.operacao) D.operacao = {};
        if (!Array.isArray(D.operacao.checklist)) D.operacao.checklist = [];
        D.operacao.checklist.push({ item: p.item, done: String(p.done) === 'true' });
        api.save(item);
        return { ok: true, msg: `Checklist "${p.item}" adicionado ao ${item.name}.` };
      },
    },

    pacote_toggle_checklist: {
      desc: 'Marca ou desmarca item do checklist operacional (fuzzy por texto)',
      params: {
        pacote: 'nome do pacote (opcional)',
        item: 'texto do item a alternar (obrigatório, fuzzy)',
        done: 'true | false (opcional — alterna se omitido)',
      },
      run(p) {
        if (!p.item) return { ok: false, msg: 'Texto do item é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        const list = D.operacao?.checklist || [];
        const idx = _findIndexByName(list, 'item', p.item);
        if (idx === -1) return { ok: false, msg: `Item "${p.item}" não encontrado no checklist.` };
        const c = list[idx];
        c.done = (p.done === undefined || p.done === null) ? !c.done : (String(p.done) === 'true');
        api.save(item);
        return { ok: true, msg: `Checklist "${c.item}" marcado como ${c.done ? 'feito ✅' : 'pendente ⬜'}.` };
      },
    },

    pacote_add_equipe: {
      desc: 'Adiciona membro à equipe do pacote (líder, guia, motorista, suporte, etc)',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome da pessoa (obrigatório)',
        funcao: 'função (ex: Líder de viagem, Guia local, Motorista, Suporte BR)',
        contato: 'telefone/WhatsApp',
        status: 'confirmado | pendente (default: confirmado)',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!Array.isArray(D.equipe)) D.equipe = [];
        D.equipe.push({
          nome: p.nome,
          funcao: p.funcao || 'Suporte',
          contato: p.contato || '',
          status: p.status || 'confirmado',
          foto: '',
        });
        api.save(item);
        return { ok: true, msg: `${p.funcao || 'Membro'} "${p.nome}" adicionado à equipe do ${item.name}.` };
      },
    },

    pacote_remove_equipe: {
      desc: 'Remove membro da equipe por nome (fuzzy)',
      params: { pacote: 'nome do pacote (opcional)', nome: 'nome da pessoa (obrigatório)' },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        const arr = D.equipe;
        const idx = _findIndexByName(arr, 'nome', p.nome);
        if (idx === -1) return { ok: false, msg: `"${p.nome}" não está na equipe do ${item.name}.` };
        const removed = arr.splice(idx, 1)[0];
        api.save(item);
        return { ok: true, msg: `${removed.funcao || 'Membro'} "${removed.nome}" removido da equipe do ${item.name}.` };
      },
    },

    pacote_add_cliente: {
      desc: 'Registra cliente/passageiro vendido no pacote',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome do cliente (obrigatório)',
        origem: 'origem (ex: Instagram, Tráfego Pago, Indicação, Influenciador, Orgânico)',
        status: 'pago | pendente | cancelado (default: pago)',
        tipoQuarto: 'tipo de quarto (ex: Ocean View, Suíte Royal)',
        recorrente: 'true | false (cliente recorrente)',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do cliente é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!Array.isArray(D.clientes)) D.clientes = [];
        D.clientes.push({
          nome: p.nome,
          origem: p.origem || 'Orgânico',
          status: p.status || 'pago',
          tipoQuarto: p.tipoQuarto || '',
          recorrente: String(p.recorrente) === 'true',
        });
        // Atualiza contagem de origem em vendas.origem
        if (p.origem) {
          if (!D.vendas) D.vendas = { ticketMedio: 0, origem: {} };
          if (!D.vendas.origem) D.vendas.origem = {};
          D.vendas.origem[p.origem] = (Number(D.vendas.origem[p.origem]) || 0) + 1;
        }
        api.save(item);
        return { ok: true, msg: `Cliente "${p.nome}" registrado no ${item.name} (${p.status || 'pago'}${p.origem ? ' · ' + p.origem : ''}).` };
      },
    },

    pacote_update_ticket: {
      desc: 'Atualiza o ticket médio (preço de venda) do pacote',
      params: { pacote: 'nome do pacote (opcional)', valor: 'novo ticket médio R$ (obrigatório)' },
      run(p) {
        const valor = parseValue(p.valor);
        if (valor <= 0) return { ok: false, msg: 'Valor inválido.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.vendas) D.vendas = { origem: {} };
        D.vendas.ticketMedio = valor;
        api.save(item);
        return { ok: true, msg: `Ticket médio do ${item.name} atualizado para R$ ${valor.toLocaleString('pt-BR')}.` };
      },
    },

    pacote_update_meta: {
      desc: 'Atualiza metas anuais do pacote (clientes, receita, lucro)',
      params: {
        pacote: 'nome do pacote (opcional)',
        clientes: 'meta anual de clientes (número)',
        receita: 'meta anual de receita R$',
        lucro: 'meta anual de lucro R$',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.metaReal) D.metaReal = { ano: new Date().getFullYear(), clientes: { mensal: {} }, receita: { mensal: {} }, lucro: { mensal: {} } };
        const changes = [];
        if (p.clientes !== undefined && p.clientes !== '') {
          D.metaReal.clientes = D.metaReal.clientes || { mensal: {} };
          D.metaReal.clientes.meta = Number(p.clientes) || 0;
          changes.push(`clientes=${p.clientes}`);
        }
        if (p.receita !== undefined && p.receita !== '') {
          D.metaReal.receita = D.metaReal.receita || { mensal: {} };
          D.metaReal.receita.meta = parseValue(p.receita);
          changes.push(`receita=R$${parseValue(p.receita).toLocaleString('pt-BR')}`);
        }
        if (p.lucro !== undefined && p.lucro !== '') {
          D.metaReal.lucro = D.metaReal.lucro || { mensal: {} };
          D.metaReal.lucro.meta = parseValue(p.lucro);
          changes.push(`lucro=R$${parseValue(p.lucro).toLocaleString('pt-BR')}`);
        }
        if (!changes.length) return { ok: false, msg: 'Nenhuma meta informada.' };
        api.save(item);
        return { ok: true, msg: `Metas do ${item.name} atualizadas: ${changes.join(', ')}.` };
      },
    },

    pacote_lancar_mensal: {
      desc: 'Lança realizado mensal no pacote (clientes/receita/lucro de um mês específico)',
      params: {
        pacote: 'nome do pacote (opcional)',
        mes: 'número do mês 1-12 (default: mês atual)',
        clientes: 'clientes reais no mês',
        receita: 'receita real no mês R$',
        lucro: 'lucro real no mês R$',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        const mesNum = p.mes ? Number(p.mes) : new Date().getMonth() + 1;
        if (mesNum < 1 || mesNum > 12) return { ok: false, msg: 'Mês inválido (use 1-12).' };
        const mk = String(mesNum).padStart(2, '0');
        if (!D.metaReal) D.metaReal = { ano: new Date().getFullYear() };
        for (const k of ['clientes', 'receita', 'lucro']) {
          if (!D.metaReal[k]) D.metaReal[k] = { mensal: {} };
          if (!D.metaReal[k].mensal) D.metaReal[k].mensal = {};
        }
        const changes = [];
        const sumReal = (obj) => Object.values(obj).reduce((a, b) => a + (Number(b) || 0), 0);
        if (p.clientes !== undefined && p.clientes !== '') {
          D.metaReal.clientes.mensal[mk] = Number(p.clientes) || 0;
          D.metaReal.clientes.real = sumReal(D.metaReal.clientes.mensal);
          changes.push(`${p.clientes} cliente(s)`);
        }
        if (p.receita !== undefined && p.receita !== '') {
          D.metaReal.receita.mensal[mk] = parseValue(p.receita);
          D.metaReal.receita.real = sumReal(D.metaReal.receita.mensal);
          changes.push(`R$${parseValue(p.receita).toLocaleString('pt-BR')} receita`);
        }
        if (p.lucro !== undefined && p.lucro !== '') {
          D.metaReal.lucro.mensal[mk] = parseValue(p.lucro);
          D.metaReal.lucro.real = sumReal(D.metaReal.lucro.mensal);
          changes.push(`R$${parseValue(p.lucro).toLocaleString('pt-BR')} lucro`);
        }
        if (!changes.length) return { ok: false, msg: 'Nenhum valor mensal informado.' };
        const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        api.save(item);
        return { ok: true, msg: `${meses[mesNum - 1]} do ${item.name}: ${changes.join(', ')}.` };
      },
    },

    pacote_add_influencer: {
      desc: 'Adiciona influencer ao marketing do pacote',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome do influencer (obrigatório)',
        instagram: '@usuario',
        seguidores: 'número de seguidores',
        leads: 'leads gerados',
        vendas: 'vendas geradas',
        receita: 'receita gerada R$',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do influencer é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.marketing) D.marketing = {};
        if (!Array.isArray(D.marketing.influencers)) D.marketing.influencers = [];
        D.marketing.influencers.push({
          nome: p.nome,
          instagram: p.instagram || '',
          seguidores: Number(p.seguidores) || 0,
          leads: Number(p.leads) || 0,
          vendas: Number(p.vendas) || 0,
          receita: parseValue(p.receita),
          foto: '',
        });
        api.save(item);
        return { ok: true, msg: `Influencer "${p.nome}" adicionado ao marketing do ${item.name}.` };
      },
    },

    pacote_add_campanha: {
      desc: 'Adiciona campanha de marketing ao pacote',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome da campanha (obrigatório)',
        investido: 'valor investido R$',
        retorno: 'retorno gerado R$',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome da campanha é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.marketing) D.marketing = {};
        if (!Array.isArray(D.marketing.campanhas)) D.marketing.campanhas = [];
        D.marketing.campanhas.push({
          nome: p.nome,
          investido: parseValue(p.investido),
          retorno: parseValue(p.retorno),
        });
        api.save(item);
        return { ok: true, msg: `Campanha "${p.nome}" adicionada ao ${item.name}.` };
      },
    },

    pacote_add_upsell: {
      desc: 'Adiciona extra/upsell ao pacote (ex: Yacht +1 dia, Skydive)',
      params: {
        pacote: 'nome do pacote (opcional)',
        nome: 'nome do extra (obrigatório)',
        preco: 'preço unitário R$',
        vendidos: 'quantidade vendida',
      },
      run(p) {
        if (!p.nome) return { ok: false, msg: 'Nome do extra é obrigatório.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.upsell) D.upsell = {};
        if (!Array.isArray(D.upsell.extras)) D.upsell.extras = [];
        const preco = parseValue(p.preco);
        const vendidos = Number(p.vendidos) || 0;
        D.upsell.extras.push({ nome: p.nome, preco, vendidos, receita: preco * vendidos });
        api.save(item);
        return { ok: true, msg: `Extra "${p.nome}" (R$ ${preco.toLocaleString('pt-BR')} × ${vendidos}) adicionado ao ${item.name}.` };
      },
    },

    pacote_update_conteudo: {
      desc: 'Atualiza números de conteúdo produzido (fotos, vídeos, reels) e melhor conteúdo',
      params: {
        pacote: 'nome do pacote (opcional)',
        fotos: 'quantidade de fotos',
        videos: 'quantidade de vídeos',
        reels: 'quantidade de reels',
        melhor: 'descrição do melhor conteúdo',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.conteudo) D.conteudo = {};
        const changes = [];
        if (p.fotos !== undefined && p.fotos !== '') { D.conteudo.fotos = Number(p.fotos) || 0; changes.push(`${p.fotos} foto(s)`); }
        if (p.videos !== undefined && p.videos !== '') { D.conteudo.videos = Number(p.videos) || 0; changes.push(`${p.videos} vídeo(s)`); }
        if (p.reels !== undefined && p.reels !== '') { D.conteudo.reels = Number(p.reels) || 0; changes.push(`${p.reels} reel(s)`); }
        if (p.melhor) { D.conteudo.melhorConteudo = p.melhor; changes.push('melhor conteúdo'); }
        if (!changes.length) return { ok: false, msg: 'Nenhum dado de conteúdo informado.' };
        api.save(item);
        return { ok: true, msg: `Conteúdo do ${item.name} atualizado: ${changes.join(', ')}.` };
      },
    },

    pacote_update_retencao: {
      desc: 'Atualiza dados de retenção do pacote (recompra, upgrade)',
      params: {
        pacote: 'nome do pacote (opcional)',
        voltaram: 'clientes que repetiram a compra',
        novosCompraram: 'novos clientes que compraram outro pacote depois',
        recompraOutroPacote: 'clientes que migraram para outro pacote',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.retencao) D.retencao = {};
        const changes = [];
        if (p.voltaram !== undefined && p.voltaram !== '') { D.retencao.voltaram = Number(p.voltaram) || 0; changes.push(`voltaram=${p.voltaram}`); }
        if (p.novosCompraram !== undefined && p.novosCompraram !== '') { D.retencao.novosCompraram = Number(p.novosCompraram) || 0; changes.push(`novosCompraram=${p.novosCompraram}`); }
        if (p.recompraOutroPacote !== undefined && p.recompraOutroPacote !== '') { D.retencao.recompraOutroPacote = Number(p.recompraOutroPacote) || 0; changes.push(`recompraOutroPacote=${p.recompraOutroPacote}`); }
        if (!changes.length) return { ok: false, msg: 'Nenhum dado de retenção informado.' };
        api.save(item);
        return { ok: true, msg: `Retenção do ${item.name} atualizada: ${changes.join(', ')}.` };
      },
    },

    pacote_update_forecast: {
      desc: 'Atualiza premissas do forecast (taxa conversão, leads/mês, aumento preço, churn)',
      params: {
        pacote: 'nome do pacote (opcional)',
        taxa_conversao: 'taxa de conversão % (ex: 18)',
        leads_mes: 'leads por mês',
        aumento_preco: '% de aumento de preço',
        churn: 'taxa de churn %',
      },
      run(p) {
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.forecast) D.forecast = {};
        if (!D.forecast.premissas) D.forecast.premissas = {};
        const changes = [];
        if (p.taxa_conversao !== undefined && p.taxa_conversao !== '') { D.forecast.premissas.taxaConversao = Number(p.taxa_conversao) || 0; changes.push(`conversão ${p.taxa_conversao}%`); }
        if (p.leads_mes !== undefined && p.leads_mes !== '') { D.forecast.premissas.leadsMes = Number(p.leads_mes) || 0; changes.push(`${p.leads_mes} leads/mês`); }
        if (p.aumento_preco !== undefined && p.aumento_preco !== '') { D.forecast.premissas.aumentoPreco = Number(p.aumento_preco) || 0; changes.push(`+${p.aumento_preco}% preço`); }
        if (p.churn !== undefined && p.churn !== '') { D.forecast.premissas.taxaChurn = Number(p.churn) || 0; changes.push(`churn ${p.churn}%`); }
        if (!changes.length) return { ok: false, msg: 'Nenhuma premissa informada.' };
        api.save(item);
        return { ok: true, msg: `Forecast do ${item.name} atualizado: ${changes.join(', ')}.` };
      },
    },

    pacote_update_dre: {
      desc: 'Adiciona linha à DRE do pacote (custos diretos, marketing ou administrativo)',
      params: {
        pacote: 'nome do pacote (opcional)',
        bloco: 'custosDiretos | marketing | administrativo (obrigatório)',
        lbl: 'rótulo da linha (obrigatório)',
        val: 'valor R$ (obrigatório)',
      },
      run(p) {
        if (!p.bloco || !['custosDiretos', 'marketing', 'administrativo'].includes(p.bloco)) {
          return { ok: false, msg: 'Bloco inválido. Use: custosDiretos, marketing ou administrativo.' };
        }
        if (!p.lbl) return { ok: false, msg: 'Rótulo é obrigatório.' };
        const val = parseValue(p.val);
        if (val <= 0) return { ok: false, msg: 'Valor inválido.' };
        const r = _resolvePacote(p);
        if (r.err) return { ok: false, msg: r.err };
        const { api, item, D } = r;
        if (!D.dre) D.dre = { custosDiretos: [], marketing: [], administrativo: [] };
        if (!Array.isArray(D.dre[p.bloco])) D.dre[p.bloco] = [];
        D.dre[p.bloco].push({ lbl: p.lbl, val });
        api.save(item);
        return { ok: true, msg: `DRE/${p.bloco} do ${item.name}: linha "${p.lbl}" (R$ ${val.toLocaleString('pt-BR')}) adicionada.` };
      },
    },
  };

  /* ----------------------------------------------------------
     CATÁLOGO COMPLETO + RUNNER
     ---------------------------------------------------------- */
  const ALL_ACTIONS = Object.assign({}, NAVIGATION, COFRE, VENDAS, FLY_CUP, WAR, PROJETOS, FASE3, PACOTES);

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
