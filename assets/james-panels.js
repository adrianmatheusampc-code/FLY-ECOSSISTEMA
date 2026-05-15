/* =====================================================================
   JAMES PANELS · SCHEMA REGISTRY
   Descreve cada TIPO DE PAINEL do ecossistema FLY:
     - schema (campos)
     - tabs disponíveis
     - KPIs
     - data source (onde busca/salva)
     - comandos do James que ativam o painel
     - correlações (quem mexe em quem)

   Como adicionar um painel novo:
     1. Adicione um objeto em PANEL_TYPES
     2. Implemente os handlers (create_*, update_*, query_*) em window.__jamesPanels.handlers
     3. James automaticamente reconhece comandos que batem nos triggers

   API pública:
     window.__jamesPanels = {
       types: { hierarchy, bases, ... },
       getType(id),
       listTypes(),
       handlers: { ... },             // ações executáveis por tipo
       runAction(typeId, action, params) → { ok, msg, data }
       describeForJames() → string    // resumo pro system prompt da IA
     };
   ===================================================================== */
(function jamesPanelsBoot() {
  'use strict';

  /* ----------------------------------------------------------
     UTILS
  ---------------------------------------------------------- */
  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function uuid(prefix) {
    return (prefix || 'p_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function dispatchUpdate(detail) {
    window.dispatchEvent(new CustomEvent('fly:data-update', { detail }));
  }
  function dispatchPanelUpdate(panelId, action, data) {
    window.dispatchEvent(new CustomEvent('fly:panel-update', {
      detail: { panel: panelId, action, data, timestamp: Date.now() },
    }));
  }
  function getMode() { return localStorage.getItem('fly_data_mode') || 'demo'; }
  function modeKey(base) { return `${base}_${getMode()}`; }

  /* =====================================================================
     PANEL TYPE 1 · HIERARCHY
     Estrutura corporativa, organograma, RH
  ===================================================================== */
  const HIERARCHY_TYPE = {
    id: 'hierarchy',
    name: 'Hierarquia',
    icon: '👥',
    description: 'Estrutura corporativa: organograma, funcionários, folha, performance.',

    // Tabs do painel (igual ao painel atual)
    tabs: [
      { id: 'organograma',  label: 'Organograma' },
      { id: 'funcionarios', label: 'Funcionários' },
      { id: 'financeiro',   label: 'Financeiro RH' },
      { id: 'crescimento',  label: 'Crescimento' },
      { id: 'contratacoes', label: 'Contratações' },
      { id: 'performance',  label: 'Performance' },
    ],

    // KPIs no topo do painel
    kpis: [
      { id: 'funcionarios',   label: 'Funcionários',   compute: (data) => data.length },
      { id: 'setores_ativos', label: 'Setores Ativos', compute: (data) => new Set(data.map(e => e.setor).filter(Boolean)).size },
      { id: 'folha_mensal',   label: 'Folha Mensal',   compute: (data) => data.reduce((a, e) => a + (e.salario || 0) + (e.comissao || 0) + (e.beneficios || 0), 0), format: 'money' },
      { id: 'status_ativo',   label: 'Status Ativo',   compute: (data) => `${data.filter(e => e.status === 'ativo').length}/${data.length}` },
    ],

    // Schema da entidade (cada funcionário)
    entity_schema: {
      id:          { type: 'string',  required: true,  primaryKey: true },
      nome:        { type: 'string',  required: true },
      cargo:       { type: 'string',  required: true },
      setor:       { type: 'string',  required: true },
      nivel:       { type: 'enum',    options: ['estagiario','junior','pleno','senior','coordenador','gerente','diretor','c_level','presidente'] },
      status:      { type: 'enum',    options: ['ativo','ferias','afastado'], default: 'ativo' },
      salario:     { type: 'number',  default: 0 },
      comissao:    { type: 'number',  default: 0 },
      beneficios:  { type: 'number',  default: 0 },
      superior:    { type: 'string',  description: 'id do superior direto' },
      cidade:      { type: 'string' },
      email:       { type: 'string' },
      telefone:    { type: 'string' },
      admissao:    { type: 'date' },
      avatar:      { type: 'string', description: 'URL ou iniciais' },
    },

    // Onde os dados vivem (localStorage + render)
    data_source: {
      topic: 'ESTRUTURA CORPORATIVA',
      item:  'HIERARQUIA',
      // Os dados são armazenados dentro de t.hier[year] no fly_7anos_data_v1
      // Override inline em fly_hierarquia_inline_v1
      ls_key_inline: 'fly_hierarquia_inline_v1',
      ls_key_main:   'fly_7anos_data_v1',
      modeAware: false,
      year_partitioned: true, // dados particionados por ano
    },

    // Triggers do James (palavras que ativam ações deste painel)
    triggers: {
      create:  ['contrata', 'contratar', 'admite', 'admitir', 'adiciona funcionario', 'novo funcionario', 'cria cargo', 'novo cargo', 'cadastra funcionario'],
      update:  ['promove', 'promover', 'muda salario', 'aumenta salario', 'altera setor', 'transfere', 'ativa funcionario', 'afasta', 'demite', 'desliga'],
      query:   ['quem é', 'quem e', 'quantos funcionarios', 'qual a folha', 'folha mensal', 'organograma'],
    },

    // O que dispara correlações em outros painéis
    correlations: {
      on_create: [
        { panel: 'cockpit',       field: 'headcount',       op: 'increment', amount: 1 },
        { panel: 'cofre',         field: 'custos_pessoal',  op: 'add',       amount: 'salario+comissao+beneficios' },
      ],
      on_update_salary: [
        { panel: 'cockpit',       field: 'folha_mensal',    op: 'recompute' },
        { panel: 'cofre',         field: 'custos_pessoal',  op: 'recompute' },
      ],
      on_delete: [
        { panel: 'cockpit',       field: 'headcount',       op: 'decrement', amount: 1 },
        { panel: 'cofre',         field: 'custos_pessoal',  op: 'recompute' },
      ],
    },

    // Exemplos de comandos pra mostrar ao usuário
    example_commands: [
      'James, contrata Pedro Silva como vendedor júnior em São Paulo, salário 3500',
      'James, promove a Maria pra coordenadora de marketing',
      'James, qual a folha mensal?',
      'James, quantos funcionários temos?',
      'James, afasta o João da equipe operacional',
    ],
  };

  /* =====================================================================
     PANEL TYPE 2 · BASES
     Bases operacionais (mapa + países + cidades + equipe)
  ===================================================================== */
  const BASES_TYPE = {
    id: 'bases',
    name: 'Bases',
    icon: '📍',
    description: 'Bases operacionais: mapa interativo, países, cidades, equipe, custos.',

    tabs: [
      { id: 'mapa',              label: 'Mapa Operacional' },
      { id: 'experiencia',       label: 'Experiência Visual' },
      { id: 'custo',             label: 'Custo das Bases' },
      { id: 'equipe',            label: 'Equipe' },
    ],

    kpis: [
      { id: 'bases_totais', label: 'Bases Totais', compute: (data) => data.length },
      { id: 'paises',       label: 'Países',       compute: (data) => new Set(data.map(b => b.pais).filter(Boolean)).size },
      { id: 'cidades',      label: 'Cidades',      compute: (data) => new Set(data.map(b => b.cidade).filter(Boolean)).size },
      { id: 'equipe_total', label: 'Equipe Total', compute: (data) => data.reduce((s, b) => s + (b.equipe_size || 0), 0) },
    ],

    entity_schema: {
      id:                   { type: 'string', required: true, primaryKey: true },
      nome:                 { type: 'string', required: true, description: 'Ex: "Base DXB Aeroporto"' },
      tipo:                 { type: 'enum',   options: ['aeroporto', 'cidade', 'hub', 'showroom', 'evento'], default: 'cidade' },
      pais:                 { type: 'string', required: true },
      cidade:               { type: 'string', required: true },
      endereco:             { type: 'string' },
      x:                    { type: 'number', description: 'Coord X no mapa (0-100%)' },
      y:                    { type: 'number', description: 'Coord Y no mapa (0-100%)' },
      responsavel:          { type: 'string' },
      telefone:             { type: 'string' },
      equipe_size:          { type: 'number', default: 0 },
      custo_implantacao:    { type: 'number', default: 0 },
      custo_operacional:    { type: 'number', default: 0 },
      data_abertura:        { type: 'date' },
      status:               { type: 'enum', options: ['planejada','em_construcao','ativa','pausada'], default: 'planejada' },
      photo:                { type: 'string', description: 'URL da foto' },
      notes:                { type: 'string' },
    },

    data_source: {
      topic: 'ESTRUTURA CORPORATIVA',
      item:  'ESTRUTURA DAS BASES FLY',
      ls_key: 'fly_basesfly_pins_v2',
      ls_key_visual: 'fly_basesfly_visual_v1',
      ls_key_custom_cities: 'fly_basesfly_custom_cities_v1',
      modeAware: false,
    },

    triggers: {
      create: ['cria base', 'cadastra base', 'abre base', 'nova base', 'inaugura base'],
      update: ['ativa base', 'pausa base', 'muda responsavel da base', 'altera base', 'fecha base'],
      query:  ['quantas bases', 'bases em', 'qual base', 'lista bases'],
    },

    correlations: {
      on_create: [
        { panel: 'cockpit',  field: 'bases_count',         op: 'increment', amount: 1 },
        { panel: 'war',      field: 'territory_potential', op: 'check',     hint: 'sugerir territorio WAR no mesmo país' },
        { panel: 'cofre',    field: 'investimento_capex',  op: 'add',       amount: 'custo_implantacao' },
      ],
      on_status_active: [
        { panel: 'cofre',    field: 'custos_operacional',  op: 'add_recurring', amount: 'custo_operacional' },
      ],
      on_delete: [
        { panel: 'cockpit',  field: 'bases_count',         op: 'decrement', amount: 1 },
      ],
    },

    example_commands: [
      'James, cadastra base Marina Premium em Dubai, responsável Carla, equipe 5',
      'James, abre base Galeão Aeroporto no Rio de Janeiro',
      'James, quantas bases temos no Brasil?',
      'James, ativa a base Burj Khalifa',
    ],
  };

  /* =====================================================================
     PANEL TYPE 3 · SELLERS (Vendedores / Rede Comercial)
  ===================================================================== */
  const SELLERS_TYPE = {
    id: 'sellers',
    name: 'Vendedores',
    icon: '🏆',
    description: 'Rede comercial: vendedores com comissão %, meta, ranking, total vendido.',

    tabs: [
      { id: 'lista',     label: 'Vendedores' },
      { id: 'ranking',   label: 'Ranking' },
      { id: 'comissoes', label: 'Comissões' },
      { id: 'metas',     label: 'Metas Individuais' },
    ],

    kpis: [
      { id: 'total',          label: 'Vendedores',      compute: (data) => data.length },
      { id: 'ativos',         label: 'Ativos',          compute: (data) => data.filter(s => s.status === 'ativo').length },
      { id: 'vendido_mes',    label: 'Vendido no Mês',  compute: (data) => data.reduce((s, x) => s + (x.vendido_mes || 0), 0), format: 'money' },
      { id: 'comissao_total', label: 'Comissão Total',  compute: (data) => data.reduce((s, x) => s + (x.comissao_acumulada || 0), 0), format: 'money' },
    ],

    entity_schema: {
      id:                  { type: 'string', required: true, primaryKey: true },
      nome:                { type: 'string', required: true },
      email:               { type: 'string' },
      telefone:            { type: 'string' },
      cidade:              { type: 'string' },
      cargo:               { type: 'string', default: 'Vendedor' },
      nivel:               { type: 'enum', options: ['junior','pleno','senior','coordenador'] },
      status:              { type: 'enum', options: ['ativo','ferias','inativo'], default: 'ativo' },
      comissao_percent:    { type: 'number', default: 5,  description: '% sobre venda' },
      meta_mes:            { type: 'number', default: 0 },
      vendido_mes:         { type: 'number', default: 0 },
      vendido_total:       { type: 'number', default: 0 },
      vendas_count:        { type: 'number', default: 0 },
      comissao_acumulada:  { type: 'number', default: 0 },
      ranking:             { type: 'number' },
      employee_id:         { type: 'string', description: 'vínculo opcional com funcionário da Hierarquia' },
    },

    data_source: {
      ls_key:    'fly_sellers_v1',
      modeAware: true,
    },

    triggers: {
      create: ['cadastra vendedor', 'novo vendedor', 'adiciona vendedor', 'cria vendedor'],
      update: ['promove vendedor', 'atualiza vendedor', 'muda comissao', 'altera meta'],
      query:  ['ranking de vendedores', 'top vendedor', 'quanto vendeu', 'comissao do'],
    },

    correlations: {
      on_create: [
        { panel: 'cockpit',   field: 'sellers_count',      op: 'increment', amount: 1 },
      ],
      on_sale_received: [
        { panel: 'self',      field: 'vendido_mes',        op: 'add',       amount: 'sale.amount' },
        { panel: 'self',      field: 'vendido_total',      op: 'add',       amount: 'sale.amount' },
        { panel: 'self',      field: 'vendas_count',       op: 'increment', amount: 1 },
        { panel: 'self',      field: 'comissao_acumulada', op: 'add',       amount: 'sale.amount * comissao_percent / 100' },
        { panel: 'cofre',     field: 'comissoes_devidas',  op: 'add',       amount: 'comissao' },
      ],
    },

    example_commands: [
      'James, cadastra vendedor Lucas Borges, comissão 8%, meta mensal 100 mil',
      'James, qual o ranking de vendedores?',
      'James, quanto o Lucas vendeu este mês?',
    ],
  };

  /* =====================================================================
     PANEL TYPE 4 · INFLUENCERS (Parceiros estratégicos)
  ===================================================================== */
  const INFLUENCERS_TYPE = {
    id: 'influencers',
    name: 'Influenciadores',
    icon: '⭐',
    description: 'Influencers/parceiros com @, comissão %, vendas geradas, ranking.',

    tabs: [
      { id: 'lista',     label: 'Influenciadores' },
      { id: 'ranking',   label: 'Ranking' },
      { id: 'comissoes', label: 'Comissões a Pagar' },
      { id: 'campanhas', label: 'Campanhas Ativas' },
    ],

    kpis: [
      { id: 'total',          label: 'Influencers',     compute: (data) => data.length },
      { id: 'ativos',         label: 'Ativos',          compute: (data) => data.filter(i => i.status === 'ativo').length },
      { id: 'vendas_geradas', label: 'Vendas Geradas',  compute: (data) => data.reduce((s, x) => s + (x.vendas_count || 0), 0) },
      { id: 'comissao_total', label: 'Comissão Total',  compute: (data) => data.reduce((s, x) => s + (x.comissao_acumulada || 0), 0), format: 'money' },
    ],

    entity_schema: {
      id:                  { type: 'string', required: true, primaryKey: true },
      nome:                { type: 'string', required: true },
      handle:              { type: 'string', required: true, description: '@usuario' },
      plataforma:          { type: 'enum', options: ['Instagram','TikTok','YouTube','Twitter','Facebook','Outro'], default: 'Instagram' },
      seguidores:          { type: 'number', default: 0 },
      tier:                { type: 'enum', options: ['nano','micro','mid','macro','mega'] },
      categoria:           { type: 'string', description: 'Lifestyle, Travel, etc' },
      cidade:              { type: 'string' },
      email:               { type: 'string' },
      telefone:            { type: 'string' },
      status:              { type: 'enum', options: ['ativo','negociando','pausado','encerrado'], default: 'ativo' },
      comissao_percent:    { type: 'number', default: 10, description: '% sobre vendas atribuídas' },
      comissao_modelo:     { type: 'enum', options: ['percent','fixo','hibrido'], default: 'percent' },
      comissao_fixa:       { type: 'number', default: 0 },
      vendas_count:        { type: 'number', default: 0 },
      vendido_total:       { type: 'number', default: 0 },
      comissao_acumulada:  { type: 'number', default: 0 },
      comissao_paga:       { type: 'number', default: 0 },
      leads_gerados:       { type: 'number', default: 0 },
      contrato_validade:   { type: 'date' },
      observacoes:         { type: 'string' },
    },

    data_source: {
      ls_key:    'fly_influencers_v1',
      modeAware: true,
    },

    triggers: {
      create: ['cadastra influencer', 'cadastra influenciador', 'novo influencer', 'novo parceiro'],
      update: ['atualiza influencer', 'paga comissao', 'pausa influencer'],
      query:  ['top influencer', 'ranking de influencers', 'quanto deve pra'],
    },

    correlations: {
      on_create: [
        { panel: 'cockpit',   field: 'influencers_count',  op: 'increment', amount: 1 },
      ],
      on_sale_attributed: [
        { panel: 'self',      field: 'vendas_count',       op: 'increment', amount: 1 },
        { panel: 'self',      field: 'vendido_total',      op: 'add',       amount: 'sale.amount' },
        { panel: 'self',      field: 'comissao_acumulada', op: 'compute',   formula: 'comissao_modelo' },
        { panel: 'cofre',     field: 'comissoes_devidas',  op: 'add',       amount: 'comissao' },
      ],
    },

    example_commands: [
      'James, cadastra influencer @joaodubai, Instagram, 250 mil seguidores, comissão 12%',
      'James, qual o top influencer?',
      'James, quanto a gente deve pro @joaodubai?',
    ],
  };

  /* =====================================================================
     PANEL TYPE 5 · METAS
  ===================================================================== */
  const METAS_TYPE = {
    id: 'metas',
    name: 'Metas',
    icon: '🎯',
    description: 'Metas globais, por produto, por vendedor, por período — com progresso automático.',

    tabs: [
      { id: 'globais',    label: 'Metas Globais' },
      { id: 'produtos',   label: 'Por Produto' },
      { id: 'vendedores', label: 'Por Vendedor' },
      { id: 'historico',  label: 'Histórico' },
    ],

    kpis: [
      { id: 'total',         label: 'Metas Ativas',    compute: (data) => data.filter(m => m.status === 'ativa').length },
      { id: 'batidas',       label: 'Batidas',         compute: (data) => data.filter(m => (m.realizado || 0) >= (m.alvo || 0) && m.alvo > 0).length },
      { id: 'em_risco',      label: 'Em Risco',        compute: (data) => data.filter(m => m.status === 'ativa' && progressOf(m) < 0.5 && daysLeft(m) < 15).length },
      { id: 'progresso_med', label: 'Progresso Médio', compute: (data) => {
        const ativas = data.filter(m => m.status === 'ativa' && m.alvo > 0);
        if (!ativas.length) return '0%';
        const avg = ativas.reduce((s, m) => s + Math.min(1, (m.realizado || 0) / m.alvo), 0) / ativas.length;
        return Math.round(avg * 100) + '%';
      }},
    ],

    entity_schema: {
      id:           { type: 'string', required: true, primaryKey: true },
      nome:         { type: 'string', required: true, description: 'Ex: "Meta de Receita Mensal"' },
      escopo:       { type: 'enum', options: ['empresa','produto','vendedor','influencer','base'], required: true },
      escopo_id:    { type: 'string', description: 'id do produto/vendedor/etc (vazio se escopo=empresa)' },
      escopo_nome:  { type: 'string' },
      tipo:         { type: 'enum', options: ['receita','vendas','clientes','lucro','custom'], required: true },
      periodo:      { type: 'enum', options: ['diaria','semanal','mensal','trimestral','anual','custom'], default: 'mensal' },
      data_inicio:  { type: 'date' },
      data_fim:     { type: 'date' },
      alvo:         { type: 'number', required: true, description: 'Valor a bater' },
      realizado:    { type: 'number', default: 0 },
      unidade:      { type: 'enum', options: ['BRL','count','percent'], default: 'BRL' },
      status:       { type: 'enum', options: ['ativa','batida','perdida','pausada','arquivada'], default: 'ativa' },
      responsavel:  { type: 'string' },
      observacoes:  { type: 'string' },
    },

    data_source: {
      ls_key:    'fly_metas_v1',
      modeAware: true,
    },

    triggers: {
      create: ['cria meta', 'nova meta', 'define meta', 'estabelece meta'],
      update: ['atualiza meta', 'pausa meta', 'arquiva meta'],
      query:  ['quanto falta pra bater', 'progresso da meta', 'metas em risco', 'minhas metas'],
    },

    correlations: {
      on_create: [
        { panel: 'cockpit', field: 'metas_count', op: 'increment', amount: 1 },
      ],
      on_sale_recorded: [
        { panel: 'self', field: 'realizado', op: 'add', amount: 'sale.amount', filter: 'matches escopo' },
      ],
      on_target_reached: [
        { panel: 'self', field: 'status', op: 'set', value: 'batida' },
      ],
    },

    example_commands: [
      'James, cria meta de receita mensal de 500 mil',
      'James, define meta de Dubai Explorer pra 50 vendas',
      'James, meta do Lucas é 100 mil este mês',
      'James, quanto falta pra bater a meta de receita?',
      'James, quais metas estão em risco?',
    ],
  };

  // Helpers para computar progresso de metas
  function progressOf(m) {
    if (!m || !m.alvo) return 0;
    return (m.realizado || 0) / m.alvo;
  }
  function daysLeft(m) {
    if (!m?.data_fim) return 9999;
    const fim = new Date(m.data_fim);
    const now = new Date();
    return Math.max(0, Math.ceil((fim - now) / (1000 * 60 * 60 * 24)));
  }

  /* =====================================================================
     REGISTRY
  ===================================================================== */
  const PANEL_TYPES = {
    hierarchy:    HIERARCHY_TYPE,
    bases:        BASES_TYPE,
    sellers:      SELLERS_TYPE,
    influencers:  INFLUENCERS_TYPE,
    metas:        METAS_TYPE,
  };

  /* =====================================================================
     HANDLERS · funções que executam ações de fato no localStorage
  ===================================================================== */

  // -------------------- HIERARCHY HANDLERS --------------------
  function _loadHierarchy() {
    // Tenta inline override primeiro
    const inline = readJSON('fly_hierarquia_inline_v1', null);
    if (inline && Object.keys(inline).length) return { source: 'inline', data: inline };
    // Fallback: dados do tópico ESTRUTURA CORPORATIVA → item HIERARQUIA
    const main = readJSON('fly_7anos_data_v1', null);
    if (main && main.topics) {
      const ec = main.topics.find(t => /ESTRUTURA\s+CORPORATIVA/i.test(t.name || ''));
      if (ec && ec.hier) return { source: 'main', data: ec.hier, topicRef: ec };
    }
    return { source: 'empty', data: { '2026': [], '2027': [], '2028': [] } };
  }

  function _saveHierarchy(hier) {
    // Salva inline (override sobre demo data)
    writeJSON('fly_hierarquia_inline_v1', hier);
    // Sync no Supabase se estiver disponível
    try { window.__flySync?.push?.('hierarchy_nodes', { id: 'hier_inline_singleton', payload: hier }); } catch (e) {}
    dispatchUpdate({ entity: 'hierarchy', action: 'update' });
    dispatchPanelUpdate('hierarchy', 'update', null);
  }

  function _currentYear() {
    const y = new Date().getFullYear();
    return String(y);
  }

  function createEmployee(params) {
    if (!params.nome) return { ok: false, msg: 'Nome do funcionário é obrigatório.' };
    const { source, data } = _loadHierarchy();
    const year = String(params.ano || _currentYear());
    if (!data[year]) data[year] = [];

    const employee = {
      id:         params.id || uuid('emp_'),
      nome:       params.nome,
      cargo:      params.cargo || 'A definir',
      setor:      params.setor || 'Geral',
      nivel:      params.nivel || 'pleno',
      status:     params.status || 'ativo',
      salario:    Number(params.salario) || 0,
      comissao:   Number(params.comissao) || 0,
      beneficios: Number(params.beneficios) || 0,
      superior:   params.superior || null,
      cidade:     params.cidade || '',
      email:      params.email || '',
      telefone:   params.telefone || '',
      admissao:   params.admissao || new Date().toISOString().slice(0, 10),
      avatar:     params.avatar || '',
      created_at: new Date().toISOString(),
      created_by: 'james',
    };

    data[year].unshift(employee);
    _saveHierarchy(data);
    // Cascata é disparada pelo cascade-watcher (intercepta o setItem)

    return {
      ok: true,
      msg: `${employee.nome} contratado(a) como ${employee.cargo} (${employee.setor}). Folha +R$ ${(employee.salario + employee.comissao + employee.beneficios).toLocaleString('pt-BR')}.`,
      data: employee,
    };
  }

  function updateEmployee(params) {
    if (!params.nome && !params.id) return { ok: false, msg: 'Nome ou ID necessário.' };
    const { data } = _loadHierarchy();
    const year = String(params.ano || _currentYear());
    const list = data[year] || [];

    const matchById   = params.id ? (e) => e.id === params.id : null;
    const matchByName = (e) => (e.nome || '').toLowerCase().includes(String(params.nome || '').toLowerCase());
    const idx = list.findIndex(matchById || matchByName);
    if (idx < 0) return { ok: false, msg: `Funcionário "${params.nome || params.id}" não encontrado em ${year}.` };

    const updates = {};
    ['cargo', 'setor', 'nivel', 'status', 'salario', 'comissao', 'beneficios', 'superior', 'cidade', 'email', 'telefone'].forEach(k => {
      if (params[k] !== undefined && params[k] !== null) updates[k] = params[k];
    });

    Object.assign(list[idx], updates, { updated_at: new Date().toISOString() });
    _saveHierarchy(data);
    // Cascata é disparada pelo cascade-watcher (compara antes/depois)

    return {
      ok: true,
      msg: `${list[idx].nome} atualizado(a). ${Object.keys(updates).join(', ')}.`,
      data: list[idx],
    };
  }

  function listEmployees(params) {
    const { data } = _loadHierarchy();
    const year = String(params?.ano || _currentYear());
    const list = (data[year] || []).filter(e => {
      if (params?.setor && e.setor?.toLowerCase() !== params.setor.toLowerCase()) return false;
      if (params?.status && e.status !== params.status) return false;
      return true;
    });
    return {
      ok: true,
      msg: `${list.length} funcionário(s)${params?.setor ? ' em ' + params.setor : ''} em ${year}.`,
      data: list,
    };
  }

  function queryHierarchyKpi(params) {
    const { data } = _loadHierarchy();
    const year = String(params?.ano || _currentYear());
    const list = data[year] || [];
    const folha = list.reduce((a, e) => a + (e.salario || 0) + (e.comissao || 0) + (e.beneficios || 0), 0);
    const setores = new Set(list.map(e => e.setor).filter(Boolean));
    const ativos = list.filter(e => e.status === 'ativo').length;
    return {
      ok: true,
      msg: `Chefe, em ${year}: ${list.length} funcionário(s), ${setores.size} setor(es), folha R$ ${folha.toLocaleString('pt-BR')}, ${ativos} ativo(s).`,
      data: { year, total: list.length, setores: setores.size, folha, ativos },
    };
  }

  // -------------------- BASES HANDLERS --------------------
  function _loadBases() {
    return readJSON('fly_basesfly_pins_v2', []);
  }

  function _saveBases(arr) {
    writeJSON('fly_basesfly_pins_v2', arr);
    try { window.__flySync?.push?.('bases', { id: 'bases_singleton', payload: arr }); } catch (e) {}
    dispatchUpdate({ entity: 'bases', action: 'update' });
    dispatchPanelUpdate('bases', 'update', null);
  }

  function createBase(params) {
    if (!params.nome) return { ok: false, msg: 'Nome da base é obrigatório.' };
    if (!params.pais && !params.cidade) return { ok: false, msg: 'País ou cidade necessário.' };

    const list = _loadBases();
    const base = {
      id:                params.id || uuid('base_'),
      nome:              params.nome,
      tipo:              params.tipo || 'cidade',
      pais:              params.pais || 'Brasil',
      cidade:            params.cidade || '',
      endereco:          params.endereco || '',
      x:                 Number(params.x) || 50,
      y:                 Number(params.y) || 50,
      responsavel:       params.responsavel || '',
      telefone:          params.telefone || '',
      equipe_size:       Number(params.equipe_size) || 0,
      custo_implantacao: Number(params.custo_implantacao) || 0,
      custo_operacional: Number(params.custo_operacional) || 0,
      data_abertura:     params.data_abertura || new Date().toISOString().slice(0, 10),
      status:            params.status || 'planejada',
      photo:             params.photo || '',
      notes:             params.notes || '',
      created_at:        new Date().toISOString(),
      created_by:        'james',
    };

    list.unshift(base);
    _saveBases(list);
    // Cascata é disparada pelo cascade-watcher

    return {
      ok: true,
      msg: `Base "${base.nome}" cadastrada em ${base.cidade || base.pais}. Status: ${base.status}.`,
      data: base,
    };
  }

  function updateBase(params) {
    if (!params.nome && !params.id) return { ok: false, msg: 'Nome ou ID da base necessário.' };
    const list = _loadBases();
    const matchById   = params.id ? (b) => b.id === params.id : null;
    const matchByName = (b) => (b.nome || '').toLowerCase().includes(String(params.nome || '').toLowerCase());
    const idx = list.findIndex(matchById || matchByName);
    if (idx < 0) return { ok: false, msg: `Base "${params.nome || params.id}" não encontrada.` };

    const updates = {};
    ['tipo', 'pais', 'cidade', 'endereco', 'responsavel', 'telefone', 'equipe_size',
     'custo_implantacao', 'custo_operacional', 'data_abertura', 'status', 'photo', 'notes'].forEach(k => {
      if (params[k] !== undefined && params[k] !== null) updates[k] = params[k];
    });

    Object.assign(list[idx], updates, { updated_at: new Date().toISOString() });
    _saveBases(list);
    // Cascata é disparada pelo cascade-watcher (detecta mudança de status, etc)

    return { ok: true, msg: `Base ${list[idx].nome} atualizada (${Object.keys(updates).join(', ')}).`, data: list[idx] };
  }

  function listBases(params) {
    const list = _loadBases().filter(b => {
      if (params?.pais && (b.pais || '').toLowerCase() !== params.pais.toLowerCase()) return false;
      if (params?.cidade && (b.cidade || '').toLowerCase() !== params.cidade.toLowerCase()) return false;
      if (params?.status && b.status !== params.status) return false;
      return true;
    });
    const filtros = [];
    if (params?.pais)   filtros.push(`em ${params.pais}`);
    if (params?.cidade) filtros.push(`em ${params.cidade}`);
    if (params?.status) filtros.push(`status ${params.status}`);
    return {
      ok: true,
      msg: `${list.length} base(s)${filtros.length ? ' ' + filtros.join(' ') : ''}.`,
      data: list,
    };
  }

  function queryBasesKpi() {
    const list = _loadBases();
    const paises = new Set(list.map(b => b.pais).filter(Boolean));
    const cidades = new Set(list.map(b => b.cidade).filter(Boolean));
    const equipe = list.reduce((s, b) => s + (b.equipe_size || 0), 0);
    return {
      ok: true,
      msg: `Chefe, temos ${list.length} base(s) em ${paises.size} país(es) e ${cidades.size} cidade(s). Equipe total: ${equipe}.`,
      data: { total: list.length, paises: paises.size, cidades: cidades.size, equipe },
    };
  }

  /* -------------------- SELLERS HANDLERS -------------------- */
  function _loadSellers() { return readJSON(modeKey('fly_sellers_v1'), []); }
  function _saveSellers(arr) {
    writeJSON(modeKey('fly_sellers_v1'), arr);
    try { window.__flySync?.push?.('sellers', { id: 'sellers_singleton', data_mode: getMode(), payload: arr }); } catch (e) {}
    dispatchUpdate({ entity: 'seller', action: 'update' });
    dispatchPanelUpdate('sellers', 'update', null);
  }

  function createSeller(params) {
    if (!params.nome) return { ok: false, msg: 'Nome do vendedor é obrigatório.' };
    const list = _loadSellers();
    const seller = {
      id:                 params.id || uuid('sel_'),
      nome:               params.nome,
      email:              params.email || '',
      telefone:           params.telefone || '',
      cidade:             params.cidade || '',
      cargo:              params.cargo || 'Vendedor',
      nivel:              params.nivel || 'pleno',
      status:             params.status || 'ativo',
      comissao_percent:   Number(params.comissao_percent) || 5,
      meta_mes:           Number(params.meta_mes) || 0,
      vendido_mes:        0,
      vendido_total:      0,
      vendas_count:       0,
      comissao_acumulada: 0,
      ranking:            null,
      employee_id:        params.employee_id || null,
      created_at:         new Date().toISOString(),
      created_by:         'james',
    };
    list.unshift(seller);
    _saveSellers(list);
    return { ok: true, msg: `Vendedor ${seller.nome} cadastrado (${seller.comissao_percent}% comissão${seller.meta_mes ? `, meta R$ ${seller.meta_mes.toLocaleString('pt-BR')}/mês` : ''}).`, data: seller };
  }

  function updateSeller(params) {
    if (!params.nome && !params.id) return { ok: false, msg: 'Nome ou ID necessário.' };
    const list = _loadSellers();
    const matchById = params.id ? (s) => s.id === params.id : null;
    const matchByName = (s) => (s.nome || '').toLowerCase().includes(String(params.nome || '').toLowerCase());
    const idx = list.findIndex(matchById || matchByName);
    if (idx < 0) return { ok: false, msg: `Vendedor "${params.nome || params.id}" não encontrado.` };
    const updates = {};
    ['cargo','nivel','status','comissao_percent','meta_mes','email','telefone','cidade','employee_id'].forEach(k => {
      if (params[k] !== undefined && params[k] !== null) updates[k] = params[k];
    });
    Object.assign(list[idx], updates, { updated_at: new Date().toISOString() });
    _saveSellers(list);
    return { ok: true, msg: `${list[idx].nome} atualizado.`, data: list[idx] };
  }

  function listSellers(params) {
    const list = _loadSellers().filter(s => {
      if (params?.status && s.status !== params.status) return false;
      return true;
    }).sort((a, b) => (b.vendido_mes || 0) - (a.vendido_mes || 0));
    return { ok: true, msg: `${list.length} vendedor(es).`, data: list };
  }

  function querySellersKpi() {
    const list = _loadSellers();
    const total = list.length;
    const ativos = list.filter(s => s.status === 'ativo').length;
    const vendido = list.reduce((s, x) => s + (x.vendido_mes || 0), 0);
    const comissao = list.reduce((s, x) => s + (x.comissao_acumulada || 0), 0);
    const top = [...list].sort((a, b) => (b.vendido_mes || 0) - (a.vendido_mes || 0))[0];
    return {
      ok: true,
      msg: `Chefe, ${total} vendedor(es) (${ativos} ativos). Vendido no mês: R$ ${vendido.toLocaleString('pt-BR')}. Comissões acumuladas: R$ ${comissao.toLocaleString('pt-BR')}.${top ? ` Top: ${top.nome} (R$ ${(top.vendido_mes || 0).toLocaleString('pt-BR')}).` : ''}`,
      data: { total, ativos, vendido, comissao, top },
    };
  }

  /* -------------------- INFLUENCERS HANDLERS -------------------- */
  function _loadInfluencers() { return readJSON(modeKey('fly_influencers_v1'), []); }
  function _saveInfluencers(arr) {
    writeJSON(modeKey('fly_influencers_v1'), arr);
    try { window.__flySync?.push?.('influencers', { id: 'influencers_singleton', data_mode: getMode(), payload: arr }); } catch (e) {}
    dispatchUpdate({ entity: 'influencer', action: 'update' });
    dispatchPanelUpdate('influencers', 'update', null);
  }

  function createInfluencer(params) {
    if (!params.nome && !params.handle) return { ok: false, msg: 'Nome ou @ do influencer é obrigatório.' };
    const list = _loadInfluencers();
    const inf = {
      id:                 params.id || uuid('inf_'),
      nome:               params.nome || params.handle,
      handle:             params.handle || params.nome,
      plataforma:         params.plataforma || 'Instagram',
      seguidores:         Number(params.seguidores) || 0,
      tier:               params.tier || _autoTier(Number(params.seguidores) || 0),
      categoria:          params.categoria || '',
      cidade:             params.cidade || '',
      email:              params.email || '',
      telefone:           params.telefone || '',
      status:             params.status || 'ativo',
      comissao_percent:   Number(params.comissao_percent) || 10,
      comissao_modelo:    params.comissao_modelo || 'percent',
      comissao_fixa:     Number(params.comissao_fixa) || 0,
      vendas_count:       0,
      vendido_total:      0,
      comissao_acumulada: 0,
      comissao_paga:      0,
      leads_gerados:      Number(params.leads_gerados) || 0,
      contrato_validade:  params.contrato_validade || null,
      observacoes:        params.observacoes || '',
      created_at:         new Date().toISOString(),
      created_by:         'james',
    };
    list.unshift(inf);
    _saveInfluencers(list);
    return { ok: true, msg: `Influencer ${inf.handle} cadastrado(a) (${inf.plataforma}, ${inf.tier}, ${inf.comissao_percent}%).`, data: inf };
  }

  function _autoTier(followers) {
    if (followers < 10000) return 'nano';
    if (followers < 100000) return 'micro';
    if (followers < 500000) return 'mid';
    if (followers < 1000000) return 'macro';
    return 'mega';
  }

  function updateInfluencer(params) {
    if (!params.nome && !params.id && !params.handle) return { ok: false, msg: 'Nome, @ ou ID necessário.' };
    const list = _loadInfluencers();
    const search = params.id || params.handle || params.nome;
    const sl = String(search).toLowerCase().replace('@','');
    const idx = list.findIndex(i => i.id === params.id || (i.handle || '').toLowerCase().replace('@','') === sl || (i.nome || '').toLowerCase().includes(sl));
    if (idx < 0) return { ok: false, msg: `Influencer "${search}" não encontrado.` };
    const updates = {};
    ['plataforma','seguidores','tier','categoria','status','comissao_percent','comissao_modelo','comissao_fixa','email','telefone','contrato_validade','observacoes'].forEach(k => {
      if (params[k] !== undefined && params[k] !== null) updates[k] = params[k];
    });
    Object.assign(list[idx], updates, { updated_at: new Date().toISOString() });
    _saveInfluencers(list);
    return { ok: true, msg: `Influencer ${list[idx].handle} atualizado.`, data: list[idx] };
  }

  function listInfluencers(params) {
    const list = _loadInfluencers().filter(i => {
      if (params?.status && i.status !== params.status) return false;
      if (params?.plataforma && i.plataforma !== params.plataforma) return false;
      return true;
    }).sort((a, b) => (b.vendido_total || 0) - (a.vendido_total || 0));
    return { ok: true, msg: `${list.length} influencer(s).`, data: list };
  }

  function queryInfluencersKpi() {
    const list = _loadInfluencers();
    const ativos = list.filter(i => i.status === 'ativo').length;
    const totalVendas = list.reduce((s, i) => s + (i.vendas_count || 0), 0);
    const totalReceita = list.reduce((s, i) => s + (i.vendido_total || 0), 0);
    const totalComissao = list.reduce((s, i) => s + (i.comissao_acumulada || 0), 0);
    const devido = totalComissao - list.reduce((s, i) => s + (i.comissao_paga || 0), 0);
    const top = [...list].sort((a, b) => (b.vendido_total || 0) - (a.vendido_total || 0))[0];
    return {
      ok: true,
      msg: `Chefe, ${list.length} influencer(s) (${ativos} ativos). ${totalVendas} venda(s) atribuída(s), R$ ${totalReceita.toLocaleString('pt-BR')} em receita. Comissão devida: R$ ${devido.toLocaleString('pt-BR')}.${top ? ` Top: ${top.handle} (R$ ${(top.vendido_total || 0).toLocaleString('pt-BR')}).` : ''}`,
      data: { total: list.length, ativos, vendas: totalVendas, receita: totalReceita, devido, top },
    };
  }

  /* -------------------- METAS HANDLERS -------------------- */
  function _loadMetas() { return readJSON(modeKey('fly_metas_v1'), []); }
  function _saveMetas(arr) {
    writeJSON(modeKey('fly_metas_v1'), arr);
    try { window.__flySync?.push?.('metas', { id: 'metas_singleton', data_mode: getMode(), payload: arr }); } catch (e) {}
    dispatchUpdate({ entity: 'meta', action: 'update' });
    dispatchPanelUpdate('metas', 'update', null);
  }

  function createMeta(params) {
    if (!params.alvo || Number(params.alvo) <= 0) return { ok: false, msg: 'Valor da meta (alvo) é obrigatório.' };
    if (!params.tipo) return { ok: false, msg: 'Tipo da meta é obrigatório (receita, vendas, clientes, lucro).' };
    const list = _loadMetas();
    const now = new Date();
    const meta = {
      id:           params.id || uuid('meta_'),
      nome:         params.nome || _defaultMetaNome(params),
      escopo:       params.escopo || 'empresa',
      escopo_id:    params.escopo_id || null,
      escopo_nome:  params.escopo_nome || null,
      tipo:         params.tipo,
      periodo:      params.periodo || 'mensal',
      data_inicio:  params.data_inicio || _periodStart(params.periodo || 'mensal', now),
      data_fim:     params.data_fim   || _periodEnd(params.periodo || 'mensal', now),
      alvo:         Number(params.alvo),
      realizado:    Number(params.realizado) || 0,
      unidade:      params.unidade || (params.tipo === 'receita' || params.tipo === 'lucro' ? 'BRL' : 'count'),
      status:       'ativa',
      responsavel:  params.responsavel || '',
      observacoes:  params.observacoes || '',
      created_at:   new Date().toISOString(),
      created_by:   'james',
    };
    list.unshift(meta);
    _saveMetas(list);
    const fmt = meta.unidade === 'BRL' ? `R$ ${meta.alvo.toLocaleString('pt-BR')}` : `${meta.alvo}`;
    return { ok: true, msg: `Meta "${meta.nome}" criada: ${fmt} ${meta.periodo}${meta.escopo_nome ? ' para ' + meta.escopo_nome : ''}.`, data: meta };
  }

  function _defaultMetaNome(p) {
    const escopo = p.escopo_nome || (p.escopo === 'empresa' ? 'Empresa' : (p.escopo || ''));
    const tipoMap = { receita: 'Receita', vendas: 'Vendas', clientes: 'Clientes', lucro: 'Lucro' };
    return `${tipoMap[p.tipo] || p.tipo} ${p.periodo || 'mensal'} — ${escopo}`;
  }

  function _periodStart(periodo, ref) {
    const d = new Date(ref);
    if (periodo === 'diaria')   { d.setHours(0,0,0,0); }
    if (periodo === 'semanal')  { const day = d.getDay(); d.setDate(d.getDate() - day); d.setHours(0,0,0,0); }
    if (periodo === 'mensal')   { d.setDate(1); d.setHours(0,0,0,0); }
    if (periodo === 'trimestral'){ const q = Math.floor(d.getMonth()/3)*3; d.setMonth(q,1); d.setHours(0,0,0,0); }
    if (periodo === 'anual')    { d.setMonth(0,1); d.setHours(0,0,0,0); }
    return d.toISOString().slice(0,10);
  }
  function _periodEnd(periodo, ref) {
    const d = new Date(ref);
    if (periodo === 'diaria')   { d.setHours(23,59,59,0); }
    if (periodo === 'semanal')  { const day = d.getDay(); d.setDate(d.getDate() + (6-day)); d.setHours(23,59,59,0); }
    if (periodo === 'mensal')   { d.setMonth(d.getMonth()+1, 0); d.setHours(23,59,59,0); }
    if (periodo === 'trimestral'){ const q = Math.floor(d.getMonth()/3)*3 + 3; d.setMonth(q, 0); d.setHours(23,59,59,0); }
    if (periodo === 'anual')    { d.setMonth(11,31); d.setHours(23,59,59,0); }
    return d.toISOString().slice(0,10);
  }

  function updateMeta(params) {
    if (!params.nome && !params.id) return { ok: false, msg: 'Nome ou ID da meta necessário.' };
    const list = _loadMetas();
    const idx = list.findIndex(m => m.id === params.id || (m.nome || '').toLowerCase().includes(String(params.nome || '').toLowerCase()));
    if (idx < 0) return { ok: false, msg: `Meta "${params.nome || params.id}" não encontrada.` };
    const updates = {};
    ['nome','alvo','realizado','periodo','data_inicio','data_fim','status','responsavel','observacoes'].forEach(k => {
      if (params[k] !== undefined && params[k] !== null) updates[k] = params[k];
    });
    Object.assign(list[idx], updates, { updated_at: new Date().toISOString() });
    _saveMetas(list);
    return { ok: true, msg: `Meta "${list[idx].nome}" atualizada.`, data: list[idx] };
  }

  function listMetas(params) {
    const list = _loadMetas().filter(m => {
      if (params?.escopo && m.escopo !== params.escopo) return false;
      if (params?.status && m.status !== params.status) return false;
      return true;
    });
    return { ok: true, msg: `${list.length} meta(s).`, data: list };
  }

  function queryMetasKpi() {
    const list = _loadMetas();
    const ativas = list.filter(m => m.status === 'ativa');
    if (!ativas.length) return { ok: true, msg: 'Chefe, sem metas ativas no momento.', data: { total: 0 } };
    const principais = ativas.slice(0, 3).map(m => {
      const pct = m.alvo > 0 ? Math.round(((m.realizado || 0) / m.alvo) * 100) : 0;
      return `${m.nome}: ${pct}%`;
    });
    return { ok: true, msg: `Chefe, ${ativas.length} meta(s) ativa(s). ${principais.join('; ')}.`, data: { ativas } };
  }

  /* =====================================================================
     ACTION RUNNER · ponto único de execução por tipo+ação
  ===================================================================== */
  const HANDLERS = {
    hierarchy: {
      create_employee:   createEmployee,
      update_employee:   updateEmployee,
      list_employees:    listEmployees,
      query_kpi:         queryHierarchyKpi,
    },
    bases: {
      create_base:       createBase,
      update_base:       updateBase,
      list_bases:        listBases,
      query_kpi:         queryBasesKpi,
    },
    sellers: {
      create_seller:     createSeller,
      update_seller:     updateSeller,
      list_sellers:      listSellers,
      query_kpi:         querySellersKpi,
    },
    influencers: {
      create_influencer: createInfluencer,
      update_influencer: updateInfluencer,
      list_influencers:  listInfluencers,
      query_kpi:         queryInfluencersKpi,
    },
    metas: {
      create_meta:       createMeta,
      update_meta:       updateMeta,
      list_metas:        listMetas,
      query_kpi:         queryMetasKpi,
    },
  };

  function runAction(typeId, actionId, params) {
    const type = PANEL_TYPES[typeId];
    if (!type) return { ok: false, msg: `Tipo de painel "${typeId}" não registrado.` };
    const handler = HANDLERS[typeId]?.[actionId];
    if (!handler) return { ok: false, msg: `Ação "${actionId}" não disponível em "${typeId}".` };
    try {
      return handler(params || {});
    } catch (e) {
      console.error('[JAMES Panels] Erro em', typeId, actionId, e);
      return { ok: false, msg: 'Erro: ' + (e.message || e) };
    }
  }

  /* =====================================================================
     DESCRITIVO PRO JAMES (system prompt da IA)
  ===================================================================== */
  function describeForJames() {
    const lines = ['', '=== TIPOS DE PAINEL DISPONÍVEIS ==='];
    for (const [id, t] of Object.entries(PANEL_TYPES)) {
      lines.push('');
      lines.push(`■ ${t.name} (id: ${id}) — ${t.description}`);
      lines.push(`  Tabs: ${t.tabs.map(x => x.label).join(', ')}`);
      lines.push(`  KPIs: ${t.kpis.map(x => x.label).join(', ')}`);
      lines.push(`  Triggers create: ${t.triggers.create.slice(0, 4).join(' / ')}`);
      lines.push(`  Exemplos:`);
      t.example_commands.slice(0, 2).forEach(ex => lines.push(`    - "${ex}"`));
    }
    return lines.join('\n');
  }

  /* =====================================================================
     API PÚBLICA
  ===================================================================== */
  window.__jamesPanels = {
    types: PANEL_TYPES,
    getType: (id) => PANEL_TYPES[id] || null,
    listTypes: () => Object.keys(PANEL_TYPES),
    handlers: HANDLERS,
    runAction,
    describeForJames,
    // Acessores convenientes
    hierarchy: {
      list:   (p) => listEmployees(p),
      create: (p) => createEmployee(p),
      update: (p) => updateEmployee(p),
      kpis:   () => queryHierarchyKpi(),
    },
    bases: {
      list:   (p) => listBases(p),
      create: (p) => createBase(p),
      update: (p) => updateBase(p),
      kpis:   () => queryBasesKpi(),
    },
    sellers: {
      list:   (p) => listSellers(p),
      create: (p) => createSeller(p),
      update: (p) => updateSeller(p),
      kpis:   () => querySellersKpi(),
    },
    influencers: {
      list:   (p) => listInfluencers(p),
      create: (p) => createInfluencer(p),
      update: (p) => updateInfluencer(p),
      kpis:   () => queryInfluencersKpi(),
    },
    metas: {
      list:   (p) => listMetas(p),
      create: (p) => createMeta(p),
      update: (p) => updateMeta(p),
      kpis:   () => queryMetasKpi(),
    },
  };

  console.log('[JAMES Panels] Schema Registry online.', Object.keys(PANEL_TYPES).length, 'tipo(s):',
    Object.keys(PANEL_TYPES).join(', '));
})();
