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
     REGISTRY
  ===================================================================== */
  const PANEL_TYPES = {
    hierarchy: HIERARCHY_TYPE,
    bases:     BASES_TYPE,
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
  };

  console.log('[JAMES Panels] Schema Registry online.', Object.keys(PANEL_TYPES).length, 'tipo(s):',
    Object.keys(PANEL_TYPES).join(', '));
})();
