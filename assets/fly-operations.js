/* =====================================================================
   FLY OPERATIONS — Sistema Operacional VIVO (editável · por data · James)
   Versão 2.0 · FLY Ecossistema

   - PLAYBOOK do pacote = modelo padrão (etapas com dia relativo).
   - OPERAÇÃO REAL do cliente = execução com datas reais calculadas a
     partir da data de ida. Tudo editável pelo painel e pelo James.
   - Data Operacional global (default 18/05/2026) = "hoje" do sistema.
   - Persistência em localStorage (estrutura pronta p/ Supabase).

   API pública · window.__flyOps  (mantém nomes antigos + novos)
     renderGeneral(host)            → central macro (Estrutura Corp.)
     renderPackage(host, slug)      → operação do pacote
     getPlaybook / listPlaybooks / slugify / openPresentation
     state()                        → STATE atual (somente leitura)
     addClientOperation(payload)    → cria cliente + gera operação
     james(cmd)                     → comandos do James (texto)
     summary()                      → resumo p/ contexto do James
   ===================================================================== */
(function flyOperationsBoot() {
  'use strict';
  if (window.__flyOps && window.__flyOps.__v2) return;

  /* ============ UTIL ============ */
  const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
  function toISO(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function fmtBR(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  function weekday(iso) { return DOW[parseISO(iso).getDay()]; }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

  /* ============ PERSISTÊNCIA ============ */
  const KEY = 'fly_ops_v1';
  let STATE = null;

  function defaultEmployees() {
    return [
      { id: uid('emp'), name: 'João', role: 'Suporte WhatsApp', base: 'Suporte Brasil', langs: 'PT/EN', status: 'Disponível', whatsapp: '', notes: '' },
      { id: uid('emp'), name: 'Carla', role: 'Concierge cidade', base: 'Base Hotel', langs: 'PT/EN/AR', status: 'Disponível', whatsapp: '', notes: '' },
      { id: uid('emp'), name: 'Bruno', role: 'Resp. supercarros', base: 'Base Supercarros', langs: 'PT/EN', status: 'Disponível', whatsapp: '', notes: '' },
      { id: uid('emp'), name: 'Yara', role: 'Base aeroporto Dubai', base: 'Aeroporto Dubai', langs: 'EN/AR', status: 'Disponível', whatsapp: '', notes: '' },
      { id: uid('emp'), name: 'Concierge VIP', role: 'Concierge dedicado', base: 'Base VIP', langs: 'PT/EN', status: 'Disponível', whatsapp: '', notes: '' },
      { id: uid('emp'), name: 'Lucas', role: 'Motorista/transfer', base: 'Base Cidade', langs: 'EN', status: 'Disponível', whatsapp: '', notes: '' },
      { id: uid('emp'), name: 'Sofia', role: 'Operador emergência', base: 'Base Emergência', langs: 'PT/EN', status: 'Disponível', whatsapp: '', notes: '' },
    ];
  }
  function defaultBases() {
    return ['Suporte Brasil|WhatsApp/remoto|Brasil', 'Aeroporto Brasil|Aeroporto|Brasil', 'Aeroporto Dubai|Aeroporto|Dubai',
      'Base Hotel|Hotel|Dubai', 'Base Cidade|Cidade|Dubai', 'Base Passeios|Passeios|Dubai', 'Base WhatsApp|Suporte|Remoto',
      'Base Emergência|Emergência|Dubai', 'Base VIP|VIP|Dubai', 'Base Supercarros|Experiências|Dubai']
      .map(s => { const [name, type, loc] = s.split('|'); return { id: uid('base'), name, type, location: loc, status: 'ativa', capacity: '—', notes: '' }; });
  }
  function defaultProcesses() {
    return [
      { id: uid('proc'), title: 'Cliente saiu de casa p/ aeroporto', category: 'Pré-embarque', risk: 'media', global: true, product: '', steps: ['Confirmar horário de saída', 'Confirmar endereço', 'Confirmar passaporte/documentos', 'Confirmar bagagem', 'Acompanhar Uber', 'Enviar mensagem padrão', 'Monitorar chegada'] },
      { id: uid('proc'), title: 'Cliente esqueceu passaporte em casa', category: 'Emergência', risk: 'crit', global: true, product: '', steps: ['Manter cliente calmo', 'Confirmar tempo até casa', 'Ver limite de check-in', 'Acionar familiar/motoboy/Uber Flash', 'Acionar cia aérea', 'Registrar ocorrência', 'Escalar coordenador'] },
      { id: uid('proc'), title: 'Cliente perdeu o voo', category: 'Voo', risk: 'crit', global: true, product: '', steps: ['Abrir ocorrência crítica', 'Acionar cia aérea', 'Ver remarcação', 'Calcular custo', 'Acionar financeiro', 'Atualizar transfer/hotel Dubai'] },
      { id: uid('proc'), title: 'Cliente chegou em Dubai', category: 'Chegada', risk: 'baixa', global: true, product: '', steps: ['Confirmar desembarque', 'Imigração', 'Bagagem', 'Conectar com motorista', 'Base aeroporto assume', 'Registrar horário real'] },
    ];
  }
  function defaultContingencies() {
    return [
      { id: uid('cont'), title: 'Funcionário faltou', sev: 'alta', global: true, product: '', call: 'Coordenador', steps: ['Verificar backup da mesma base', 'Se não houver, acionar coordenador', 'Redistribuir cliente p/ base mais próxima', 'Atualizar operação do cliente', 'Avisar equipe', 'Registrar log', 'Mensagem de tranquilização se impactar cliente'] },
      { id: uid('cont'), title: 'Mala extraviada', sev: 'alta', global: true, product: '', call: 'Base Aeroporto Dubai', steps: ['Cliente abre registro no aeroporto', 'Fotografar comprovante', 'Coletar protocolo', 'Acionar cia + seguro', 'Kit emergência', 'Atualizar hotel'] },
      { id: uid('cont'), title: 'Cliente passou mal', sev: 'crit', global: true, product: '', call: 'Operador emergência + seguro', steps: ['Identificar gravidade', 'Acionar seguro/médico', 'Enviar funcionário disponível', 'Avisar liderança', 'Acompanhar até resolução'] },
    ];
  }
  function defaultChecklists() {
    return [
      { id: uid('chk'), name: 'Pré-embarque', phase: 'pre', global: true, product: '', items: ['Passaporte válido', 'Passagem emitida', 'Hotel confirmado', 'Passeios confirmados', 'Transfer confirmado', 'Grupo WhatsApp criado', 'Roteiro enviado', 'Contatos de emergência', 'Mala confirmada', 'Saída de casa confirmada'] },
      { id: uid('chk'), name: 'Aeroporto Brasil', phase: 'aeroporto', global: true, product: '', items: ['Cliente saiu de casa', 'Chegou ao aeroporto', 'Check-in realizado', 'Mala despachada', 'Portão confirmado', 'Embarcou'] },
      { id: uid('chk'), name: 'Chegada Dubai', phase: 'chegada', global: true, product: '', items: ['Desembarcou', 'Passou imigração', 'Pegou bagagem', 'Encontrou motorista', 'Entrou no transfer', 'Chegou ao hotel', 'Check-in'] },
    ];
  }

  // Etapas-modelo do playbook (com dia relativo à ida)
  function defaultStepTemplates() {
    return [
      { phase: 'Pré-embarque', title: 'Onboarding & documentos', rel: -7, time: '10:00', baseType: 'Suporte Brasil', role: 'Suporte WhatsApp', checklist: 'Pré-embarque' },
      { phase: 'Pré-embarque', title: 'Confirmar passaporte & passagem', rel: -5, time: '11:00', baseType: 'Suporte Brasil', role: 'Suporte pré-embarque', checklist: 'Pré-embarque' },
      { phase: 'Pré-embarque', title: 'Confirmação pré-embarque (hotel/passeios/transfer)', rel: -2, time: '15:00', baseType: 'Suporte Brasil', role: 'Coordenador', checklist: 'Pré-embarque' },
      { phase: 'Pré-embarque', title: 'Lembrete mala/passaporte/saída de casa', rel: -1, time: '18:00', baseType: 'Base WhatsApp', role: 'Suporte WhatsApp', checklist: 'Pré-embarque' },
      { phase: 'Embarque', title: 'Cliente sai de casa + Uber', rel: 0, time: '06:00', baseType: 'Suporte Brasil', role: 'Suporte WhatsApp', checklist: 'Aeroporto Brasil' },
      { phase: 'Embarque', title: 'Aeroporto: check-in + despacho + embarque', rel: 0, time: '09:00', baseType: 'Aeroporto Brasil', role: 'Suporte pré-embarque', checklist: 'Aeroporto Brasil' },
      { phase: 'Chegada Dubai', title: 'Chegada Dubai: imigração + bagagem + transfer', rel: 1, time: '08:00', baseType: 'Aeroporto Dubai', role: 'Base aeroporto Dubai', checklist: 'Chegada Dubai' },
      { phase: 'Chegada Dubai', title: 'Check-in no hotel', rel: 1, time: '14:00', baseType: 'Base Hotel', role: 'Concierge cidade', checklist: 'Chegada Dubai' },
      { phase: 'Operação', title: 'Roteiro / passeios — dia 1', rel: 2, time: '09:00', baseType: 'Base Passeios', role: 'Suporte passeios', checklist: '' },
      { phase: 'Operação', title: 'Roteiro / passeios — dia 2', rel: 3, time: '09:00', baseType: 'Base Passeios', role: 'Suporte passeios', checklist: '' },
      { phase: 'Operação', title: 'Dia livre com suporte', rel: 4, time: '10:00', baseType: 'Base Cidade', role: 'Concierge cidade', checklist: '' },
      { phase: 'Retorno', title: 'Check-out + transfer aeroporto', rel: 'end', time: '10:00', baseType: 'Base Hotel', role: 'Concierge cidade', checklist: '' },
      { phase: 'Retorno', title: 'Embarque de volta', rel: 'end', time: '14:00', baseType: 'Aeroporto Dubai', role: 'Base aeroporto Dubai', checklist: '' },
      { phase: 'Pós-venda', title: 'Pós-venda + depoimento + próxima viagem', rel: 'end+2', time: '15:00', baseType: 'Suporte Brasil', role: 'Coordenador', checklist: '' },
    ];
  }

  // Playbooks-base (editáveis depois via STATE)
  function defaultPlaybooks() {
    const mk = (slug, name, type, dur, prof, desc, exp) => ({
      id: 'pb-' + slug, productSlug: slug, productName: name, packageType: type, duration: dur,
      complexity: type.includes('VIP') ? 'crítica' : (slug.includes('gta') ? 'alta' : 'média'),
      customerProfile: prof, description: desc, version: 1,
      stepTemplates: defaultStepTemplates(), experiencia: exp,
      metricas: { clientesAtivos: 0, vendas: 0, receita: 0, ocorrencias: 0, satisfacao: '—', nps: '—' },
    });
    const list = [
      mk('dubai-explorer', 'Dubai Explorer', 'Pacote de entrada premium', '8 dias / 7 noites', '1ª viagem a Dubai',
        'Primeira experiência Fly com padrão superior a qualquer agência tradicional. Suporte humanizado do Brasil ao retorno.',
        ['Segurança', '1ª experiência premium', 'Encantamento', '"Não estou sozinho em Dubai"']),
      mk('dubai-gta', 'Dubai GTA', 'Pacote aventura/adrenalina', '7 dias / 6 noites', 'Adrenalina · status',
        'Dia de adrenalina coordenado: supercarros, jet ski/jet car, deserto, vida noturna.',
        ['Adrenalina', 'Liberdade', 'Status', 'Sensação de filme/game em Dubai']),
      mk('dubai-billionaire', 'Dubai Billionaire', 'Pacote VIP / luxo', '7 dias / 6 noites', 'Alto padrão',
        'Confirmação dupla de tudo, atendimento prioritário e invisível, plano B obrigatório, relatório diário.',
        ['Exclusividade', 'Poder', 'Luxo', 'Atendimento invisível']),
    ];
    const out = {};
    list.forEach(p => { out[p.productSlug] = p; });
    return out;
  }

  function seed() {
    return {
      __v: 2,
      opDate: '2026-05-18',
      editMode: true,
      playbooks: defaultPlaybooks(),
      operations: [],   // client_operations (com steps embutidos)
      processes: defaultProcesses(),
      contingencies: defaultContingencies(),
      checklists: defaultChecklists(),
      bases: defaultBases(),
      employees: defaultEmployees(),
      logs: [],
    };
  }
  function load() {
    if (STATE) return STATE;
    try {
      const raw = localStorage.getItem(KEY);
      STATE = raw ? JSON.parse(raw) : seed();
      if (!STATE || STATE.__v !== 2) STATE = seed();
    } catch (e) { STATE = seed(); }
    return STATE;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(STATE)); } catch (e) {} dispatch(); }
  function dispatch() { try { window.dispatchEvent(new CustomEvent('fly:ops-update')); } catch (e) {} }
  function log(action, desc, by) {
    load().logs.unshift({ id: uid('log'), at: Date.now(), opDate: STATE.opDate, action, desc: desc || '', by: by || 'painel' });
    if (STATE.logs.length > 200) STATE.logs.length = 200;
  }

  /* ============ ENGINE: gerar operação por data ============ */
  function resolveRel(rel, startISO, endISO) {
    if (rel === 'end') return endISO || startISO;
    if (typeof rel === 'string' && rel.indexOf('end+') === 0) return addDays(endISO || startISO, parseInt(rel.slice(4), 10) || 0);
    return addDays(startISO, Number(rel) || 0);
  }
  function autoStatus(op) {
    const t = STATE.opDate, s = op.tripStart, e = op.tripEnd;
    if (op.statusManual) return op.status;
    if (t < s) return 'Pré-embarque';
    if (t === s) return 'Embarque';
    if (t === addDays(s, 1)) return 'Chegada Dubai';
    if (t > s && t <= e) return 'Em viagem';
    if (t > e) return 'Pós-venda';
    return 'Confirmado';
  }
  function generateOperation(payload) {
    load();
    const pb = getPlaybook(payload.product);
    const start = payload.tripStart, end = payload.tripEnd || addDays(start, 7);
    const op = {
      id: uid('op'), clientName: payload.clientName, phone: payload.phone || '', instagram: payload.instagram || '',
      product: pb.productName, productSlug: pb.productSlug, playbookId: pb.id, playbookVersion: pb.version || 1,
      tripType: payload.tripType || 'solo', origin: payload.origin || '', hotel: payload.hotel || '',
      leadSource: payload.leadSource || '', tripStart: start, tripEnd: end,
      baseId: payload.baseId || '', employeeId: payload.employeeId || '',
      status: 'Confirmado', statusManual: false, notes: payload.notes || '',
      createdAt: Date.now(),
      steps: (pb.stepTemplates || defaultStepTemplates()).map((t, i) => ({
        id: uid('st'), order: i, title: t.title, phase: t.phase,
        scheduledDate: resolveRel(t.rel, start, end), scheduledTime: t.time || '',
        baseType: t.baseType || '', role: t.role || '', checklistName: t.checklist || '',
        status: 'pendente', completedAt: null, employeeId: '', baseId: '', notes: '',
        checkDone: {},
      })),
    };
    op.status = autoStatus(op);
    STATE.operations.unshift(op);
    log('op_create', `Operação criada: ${op.clientName} · ${op.product} · ida ${fmtBR(start)}`, payload.by);
    save();
    return op;
  }

  /* ============ MUTADORES (CRUD + James) ============ */
  function setOpDate(iso) { load().opDate = iso; STATE.operations.forEach(o => { o.status = autoStatus(o); }); log('opdate', 'Data operacional: ' + fmtBR(iso)); save(); }
  function shiftOpDate(n) { setOpDate(addDays(load().opDate, n)); }
  function getOp(id) { return load().operations.find(o => o.id === id); }
  function deleteOp(id) { const o = getOp(id); load().operations = STATE.operations.filter(x => x.id !== id); if (o) log('op_delete', 'Operação removida: ' + o.clientName); save(); }
  function updateStep(opId, stepId, patch) {
    const o = getOp(opId); if (!o) return; const s = o.steps.find(x => x.id === stepId); if (!s) return;
    Object.assign(s, patch);
    if (patch.status === 'concluido' && !s.completedAt) s.completedAt = Date.now();
    log('step_update', `${o.clientName} · etapa "${s.title}" → ${patch.status || 'editada'}`, patch.by);
    save();
  }
  function addStep(opId, after) {
    const o = getOp(opId); if (!o) return;
    const idx = after != null ? o.steps.findIndex(x => x.id === after) : o.steps.length - 1;
    o.steps.splice(idx + 1, 0, { id: uid('st'), order: 0, title: 'Nova etapa', phase: 'Operação', scheduledDate: STATE.opDate, scheduledTime: '', baseType: '', role: '', checklistName: '', status: 'pendente', completedAt: null, employeeId: '', baseId: '', notes: '', checkDone: {} });
    o.steps.forEach((s, i) => s.order = i);
    log('step_add', o.clientName + ' · etapa adicionada'); save();
  }
  function removeStep(opId, stepId) { const o = getOp(opId); if (!o) return; o.steps = o.steps.filter(s => s.id !== stepId); log('step_del', o.clientName + ' · etapa removida'); save(); }

  // CRUD genérico p/ bibliotecas
  const COLL = { processes: 'processes', contingencies: 'contingencies', checklists: 'checklists', bases: 'bases', employees: 'employees' };
  function upsert(kind, obj) {
    load(); const arr = STATE[COLL[kind]]; if (!arr) return;
    if (obj.id) { const i = arr.findIndex(x => x.id === obj.id); if (i >= 0) arr[i] = obj; else arr.push(obj); }
    else { obj.id = uid(kind); arr.unshift(obj); }
    log(kind + '_save', (obj.title || obj.name) + ' salvo'); save(); return obj;
  }
  function removeEntity(kind, id) { load(); STATE[COLL[kind]] = (STATE[COLL[kind]] || []).filter(x => x.id !== id); log(kind + '_del', 'item removido'); save(); }

  function getPlaybook(nameOrSlug) {
    load(); const slug = slugify(nameOrSlug);
    if (STATE.playbooks[slug]) return STATE.playbooks[slug];
    const hit = Object.keys(STATE.playbooks).find(k => slug.indexOf(k) === 0 || k.indexOf(slug) === 0);
    if (hit) return STATE.playbooks[hit];
    // gera e persiste um playbook genérico p/ qualquer produto novo
    const name = nameOrSlug || 'Pacote';
    const pb = { id: 'pb-' + slug, productSlug: slug, productName: name, packageType: 'Pacote', duration: '7-8 dias', complexity: 'média', customerProfile: 'Cliente Fly premium', description: 'Playbook padrão Fly aplicado a ' + name + '.', version: 1, stepTemplates: defaultStepTemplates(), experiencia: ['Segurança', 'Suporte próximo', 'Padrão acima de agência comum'], metricas: { clientesAtivos: 0, vendas: 0, receita: 0, ocorrencias: 0, satisfacao: '—', nps: '—' } };
    STATE.playbooks[slug] = pb; save(); return pb;
  }
  function listPlaybooks() { load(); return Object.values(STATE.playbooks); }
  function savePlaybook(pb) { load(); pb.version = (pb.version || 1) + 1; STATE.playbooks[pb.productSlug] = pb; log('pb_save', pb.productName + ' · playbook v' + pb.version); save(); }

  /* ============ JAMES ============ */
  function summary() {
    load(); const t = STATE.opDate;
    const viajando = STATE.operations.filter(o => o.tripStart <= t && o.tripEnd >= t);
    const embarcando = STATE.operations.filter(o => o.tripStart === t);
    return {
      dataOperacional: t, diaSemana: weekday(t),
      clientesEmViagem: viajando.length, embarcandoHoje: embarcando.length,
      operacoes: STATE.operations.length, funcionarios: STATE.employees.length,
      bases: STATE.bases.length, processos: STATE.processes.length,
      contingencias: STATE.contingencies.length,
      clientes: STATE.operations.slice(0, 12).map(o => ({ nome: o.clientName, pacote: o.product, ida: o.tripStart, status: autoStatus(o) })),
    };
  }
  function james(cmd) {
    const t = String(cmd || '').toLowerCase();
    // adiciona cliente X no PACOTE viajando dia D
    let m = t.match(/(adiciona|cria|gera).*(cliente|opera[çc][aã]o).*?\b([a-zà-ú][\wà-ú\s]{1,40}?)\b.*?(no|para|pra)\s+([\wà-ú\s]{3,40}?)\s+(viajando|via?gem|dia)\s+(?:dia\s+)?(\d{1,2})\s*(?:de\s+)?([\wç]+)?/i);
    if (m) {
      const nome = m[3].trim().replace(/\b\w/g, c => c.toUpperCase());
      const pacote = m[5].trim();
      const dia = parseInt(m[7], 10);
      const meses = { janeiro: 1, fevereiro: 2, marco: 3, 'março': 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
      const mes = meses[(m[8] || '').toLowerCase()] || parseInt((STATE.opDate).split('-')[1], 10);
      const ano = parseInt(STATE.opDate.split('-')[0], 10);
      const startISO = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      const op = generateOperation({ clientName: nome, product: pacote, tripStart: startISO, tripEnd: addDays(startISO, 7), by: 'James' });
      return { ok: true, msg: `Operação criada: ${nome} · ${op.product} · ida ${fmtBR(startISO)}. ${op.steps.length} etapas geradas.` };
    }
    if (/(o que (temos|tem) hoje|opera[çc][aã]o de hoje|clientes? (de )?hoje)/.test(t)) {
      const s = summary();
      return { ok: true, msg: `Hoje (${fmtBR(s.dataOperacional)}, ${s.diaSemana}): ${s.clientesEmViagem} em viagem, ${s.embarcandoHoje} embarcando, ${s.operacoes} operações no total.` };
    }
    if (/clientes? (que )?viaj(a|am).*(semana|essa semana)/.test(t)) {
      const ini = STATE.opDate, fim = addDays(ini, 7);
      const list = STATE.operations.filter(o => o.tripStart >= ini && o.tripStart <= fim);
      return { ok: true, msg: list.length ? ('Viajando essa semana: ' + list.map(o => `${o.clientName} (${o.product}, ${fmtBR(o.tripStart)})`).join('; ')) : 'Ninguém viajando nos próximos 7 dias.' };
    }
    return { ok: false, msg: 'Comando de operação não reconhecido. Ex: "James, adiciona o cliente Adrian no Dubai Explorer viajando dia 25 de maio".' };
  }

  /* ============ CSS ============ */
  function injectCSS() {
    if (document.getElementById('flyops-css')) return;
    const s = document.createElement('style'); s.id = 'flyops-css';
    s.textContent = `
      .flyops{--g:#c6a85a;--gb:#f5b842;color:#e8dfc8;font-family:inherit;padding:4px 2px 70px}
      .flyops-hero{background:linear-gradient(135deg,rgba(198,168,90,.14),rgba(0,0,0,.5));border:1px solid rgba(198,168,90,.3);border-radius:16px;padding:20px 22px;margin-bottom:14px}
      .flyops-hero h1{font-size:24px;letter-spacing:3px;color:#fff;margin:0 0 4px;font-weight:800}
      .flyops-hero .sub{color:var(--g);font-size:11px;letter-spacing:2px;text-transform:uppercase}
      .flyops-hero .desc{color:rgba(232,223,200,.7);font-size:12.5px;margin-top:8px;max-width:880px;line-height:1.55}
      .flyops-datebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:rgba(0,0,0,.5);border:1px solid rgba(198,168,90,.3);border-radius:12px;padding:12px 16px;margin-bottom:14px}
      .flyops-datebar .dt{font-size:18px;font-weight:800;color:#fff}
      .flyops-datebar .dw{color:var(--g);font-size:12px;letter-spacing:1px}
      .flyops-pitch{background:rgba(198,168,90,.08);border-left:3px solid var(--gb);padding:11px 15px;border-radius:8px;margin:12px 0;font-size:12.5px;color:#f0e6cc;font-style:italic}
      .flyops-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:12px 0}
      .flyops-card{background:rgba(0,0,0,.45);border:1px solid rgba(198,168,90,.22);border-radius:12px;padding:13px}
      .flyops-card .ic{font-size:17px}.flyops-card .n{font-size:22px;font-weight:800;color:#fff;margin:5px 0 2px}
      .flyops-card .l{font-size:10px;letter-spacing:1px;color:rgba(232,223,200,.55);text-transform:uppercase}
      .flyops-sec{margin:24px 0 8px;display:flex;align-items:center;gap:10px}
      .flyops-sec h2{font-size:14px;letter-spacing:2px;color:var(--gb);margin:0;text-transform:uppercase;font-weight:700}
      .flyops-sec .line{flex:1;height:1px;background:rgba(198,168,90,.18)}
      .flyops-tbl{width:100%;border-collapse:collapse;font-size:12px;background:rgba(0,0,0,.35);border-radius:10px;overflow:hidden}
      .flyops-tbl th{background:rgba(198,168,90,.1);color:var(--g);text-align:left;padding:8px 11px;font-size:10px;letter-spacing:1px;text-transform:uppercase}
      .flyops-tbl td{padding:8px 11px;border-top:1px solid rgba(255,255,255,.05);color:#ddd2b4}
      .flyops-tbl tr:hover td{background:rgba(198,168,90,.05)}
      .flyops-pill{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700}
      .fp-ok{background:rgba(109,255,176,.15);color:#6dffb0}.fp-warn{background:rgba(255,193,71,.16);color:#ffcf6b}
      .fp-crit{background:rgba(255,118,118,.16);color:#ff8c8c}.fp-info{background:rgba(126,207,255,.14);color:#8fd0ff}
      .flyops-tl{position:relative;padding-left:24px;margin:10px 0}
      .flyops-tl::before{content:'';position:absolute;left:7px;top:4px;bottom:4px;width:2px;background:rgba(198,168,90,.3)}
      .flyops-tl-i{position:relative;margin-bottom:10px;padding:10px 13px;background:rgba(0,0,0,.4);border:1px solid rgba(198,168,90,.16);border-radius:10px}
      .flyops-tl-i::before{content:'';position:absolute;left:-20px;top:15px;width:9px;height:9px;border-radius:50%;background:var(--gb)}
      .flyops-tl-i.done::before{background:#6dffb0}.flyops-tl-i.late::before{background:#ff8c8c}
      .flyops-tl-i .t{font-weight:700;color:#fff;font-size:12.5px}
      .flyops-tl-i .m{font-size:11px;color:rgba(232,223,200,.6);margin-top:3px}
      .flyops-grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
      .flyops-box{background:rgba(0,0,0,.4);border:1px solid rgba(198,168,90,.18);border-radius:12px;padding:13px}
      .flyops-box h3{margin:0 0 7px;font-size:12.5px;color:var(--gb);letter-spacing:1px}
      .flyops-box ul{margin:5px 0 0;padding-left:17px;font-size:11.5px;color:#ddd2b4;line-height:1.65}
      .flyops-btn{background:rgba(198,168,90,.12);border:1px solid rgba(198,168,90,.35);color:var(--gb);border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:700;letter-spacing:.5px}
      .flyops-btn:hover{background:rgba(198,168,90,.22)}.flyops-btn.primary{background:var(--gb);color:#1a1407}
      .flyops-btn.sm{padding:4px 9px;font-size:10px}
      .flyops-btn.danger{border-color:rgba(255,118,118,.4);color:#ff9b9b}
      .flyops-acc{border:1px solid rgba(198,168,90,.18);border-radius:10px;margin-bottom:8px;overflow:hidden}
      .flyops-acc-h{padding:11px 13px;background:rgba(198,168,90,.07);cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-items:center;font-weight:700;color:#fff;font-size:12.5px}
      .flyops-acc-b{padding:12px 13px;display:none;border-top:1px solid rgba(198,168,90,.12)}
      .flyops-acc.open .flyops-acc-b{display:block}
      .flyops-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:2147483200;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 16px}
      .flyops-modal{background:#0c0d12;border:1px solid rgba(198,168,90,.35);border-radius:16px;max-width:560px;width:100%;padding:22px}
      .flyops-modal h3{margin:0 0 14px;color:var(--gb);font-size:15px;letter-spacing:1px}
      .flyops-modal label{display:block;font-size:10.5px;color:var(--g);letter-spacing:1px;text-transform:uppercase;margin:10px 0 4px}
      .flyops-modal input,.flyops-modal select,.flyops-modal textarea{width:100%;background:rgba(0,0,0,.5);border:1px solid rgba(198,168,90,.25);color:#fff;border-radius:8px;padding:9px 11px;font-size:13px;font-family:inherit;box-sizing:border-box}
      .flyops-modal textarea{min-height:64px;resize:vertical}
      .flyops-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .flyops-modal .acts{display:flex;gap:10px;margin-top:18px;justify-content:flex-end}
      .flyops-present{position:fixed;inset:0;background:#070707;z-index:2147483000;overflow:auto;padding:44px 6vw}
      .flyops-present .close{position:fixed;top:18px;right:22px}
      .flyops-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}
    `;
    document.head.appendChild(s);
  }

  /* ============ MODAIS ============ */
  function modal(title, bodyHTML, onSave) {
    const bg = document.createElement('div'); bg.className = 'flyops-modal-bg flyops';
    bg.innerHTML = `<div class="flyops-modal"><h3>${esc(title)}</h3><div class="flyops-mbody">${bodyHTML}</div>
      <div class="acts"><button class="flyops-btn" data-cancel>Cancelar</button><button class="flyops-btn primary" data-ok>Salvar</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('[data-cancel]').onclick = close;
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    bg.querySelector('[data-ok]').onclick = () => { if (onSave(bg) !== false) close(); };
    return bg;
  }
  function field(label, name, val, type) {
    if (type === 'textarea') return `<label>${esc(label)}</label><textarea name="${name}">${esc(val || '')}</textarea>`;
    if (type === 'date') return `<label>${esc(label)}</label><input type="date" name="${name}" value="${esc(val || '')}">`;
    return `<label>${esc(label)}</label><input name="${name}" value="${esc(val || '')}" type="${type || 'text'}">`;
  }
  function selField(label, name, val, opts) {
    return `<label>${esc(label)}</label><select name="${name}">${opts.map(o => `<option ${String(o) === String(val) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  const V = (bg, n) => { const el = bg.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };

  function openAddClient(slug, after) {
    load();
    const pbs = listPlaybooks().map(p => p.productName);
    const start = STATE.opDate;
    modal('+ Adicionar Cliente em Viagem', `
      ${field('Nome do cliente', 'clientName', '')}
      <div class="row">${field('Telefone', 'phone', '')}${field('Instagram', 'instagram', '')}</div>
      ${selField('Pacote comprado', 'product', slug ? getPlaybook(slug).productName : pbs[0], pbs)}
      <div class="row">${selField('Tipo', 'tripType', 'grupo', ['solo', 'duo', 'grupo', 'personalizado'])}${field('Origem do lead', 'leadSource', 'Instagram')}</div>
      <div class="row">${field('Data de ida', 'tripStart', addDays(start, 7), 'date')}${field('Data de volta', 'tripEnd', addDays(start, 14), 'date')}</div>
      <div class="row">${field('Aeroporto origem', 'origin', 'GRU')}${field('Hotel', 'hotel', '')}</div>
      ${field('Observações', 'notes', '', 'textarea')}
    `, (bg) => {
      const name = V(bg, 'clientName'); if (!name) { alert('Informe o nome do cliente.'); return false; }
      const op = generateOperation({
        clientName: name, phone: V(bg, 'phone'), instagram: V(bg, 'instagram'),
        product: V(bg, 'product'), tripType: V(bg, 'tripType'), leadSource: V(bg, 'leadSource'),
        tripStart: V(bg, 'tripStart'), tripEnd: V(bg, 'tripEnd'), origin: V(bg, 'origin'),
        hotel: V(bg, 'hotel'), notes: V(bg, 'notes'),
      });
      if (typeof after === 'function') after(op);
    });
  }

  function openStepEditor(opId, stepId) {
    const o = getOp(opId); const s = o.steps.find(x => x.id === stepId); if (!s) return;
    const emps = ['—'].concat(STATE.employees.map(e => e.name));
    const bs = ['—'].concat(STATE.bases.map(b => b.name));
    modal('Editar etapa', `
      ${field('Título', 'title', s.title)}
      <div class="row">${field('Data', 'scheduledDate', s.scheduledDate, 'date')}${field('Horário', 'scheduledTime', s.scheduledTime)}</div>
      <div class="row">${selField('Status', 'status', s.status, ['pendente', 'em_andamento', 'concluido', 'pulado', 'problema'])}${field('Fase', 'phase', s.phase)}</div>
      <div class="row">${selField('Base responsável', 'baseName', (STATE.bases.find(b => b.id === s.baseId) || {}).name || s.baseType || '—', bs)}${selField('Funcionário', 'empName', (STATE.employees.find(e => e.id === s.employeeId) || {}).name || '—', emps)}</div>
      ${field('Observações', 'notes', s.notes, 'textarea')}
    `, (bg) => {
      const bn = V(bg, 'baseName'), en = V(bg, 'empName');
      updateStep(opId, stepId, {
        title: V(bg, 'title'), scheduledDate: V(bg, 'scheduledDate'), scheduledTime: V(bg, 'scheduledTime'),
        status: V(bg, 'status'), phase: V(bg, 'phase'), notes: V(bg, 'notes'),
        baseId: (STATE.bases.find(b => b.name === bn) || {}).id || '',
        employeeId: (STATE.employees.find(e => e.name === en) || {}).id || '',
      });
    });
  }

  // Editor genérico de biblioteca
  function openEntityEditor(kind, id) {
    load(); const arr = STATE[COLL[kind]] || [];
    const cur = id ? Object.assign({}, arr.find(x => x.id === id)) : {};
    let body = '';
    if (kind === 'employees') body = `${field('Nome', 'name', cur.name)}<div class="row">${field('Função', 'role', cur.role)}${field('Base', 'base', cur.base)}</div><div class="row">${field('WhatsApp', 'whatsapp', cur.whatsapp)}${field('Idiomas', 'langs', cur.langs)}</div>${selField('Status', 'status', cur.status || 'Disponível', ['Disponível', 'Em atendimento', 'Em deslocamento', 'De folga', 'Indisponível'])}${field('Observações', 'notes', cur.notes, 'textarea')}`;
    else if (kind === 'bases') body = `${field('Nome', 'name', cur.name)}<div class="row">${field('Tipo', 'type', cur.type)}${field('Localização', 'location', cur.location)}</div><div class="row">${selField('Status', 'status', cur.status || 'ativa', ['ativa', 'inativa', 'sobrecarregada'])}${field('Capacidade', 'capacity', cur.capacity)}</div>${field('Observações', 'notes', cur.notes, 'textarea')}`;
    else if (kind === 'checklists') body = `${field('Nome', 'name', cur.name)}<div class="row">${field('Fase', 'phase', cur.phase)}${field('Produto (vazio = global)', 'product', cur.product)}</div>${field('Itens (1 por linha)', 'items', (cur.items || []).join('\n'), 'textarea')}`;
    else if (kind === 'processes') body = `${field('Nome', 'title', cur.title)}<div class="row">${field('Categoria', 'category', cur.category)}${selField('Risco', 'risk', cur.risk || 'media', ['baixa', 'media', 'alta', 'crit'])}</div>${field('Produto (vazio = global)', 'product', cur.product)}${field('Passo a passo (1 por linha)', 'steps', (cur.steps || []).join('\n'), 'textarea')}`;
    else body = `${field('Título', 'title', cur.title)}<div class="row">${selField('Gravidade', 'sev', cur.sev || 'media', ['baixa', 'media', 'alta', 'crit'])}${field('Acionar', 'call', cur.call)}</div>${field('Produto (vazio = global)', 'product', cur.product)}${field('Solução passo a passo (1 por linha)', 'steps', (cur.steps || []).join('\n'), 'textarea')}`;
    modal((id ? 'Editar' : 'Novo') + ' · ' + kind, body, (bg) => {
      const obj = Object.assign({}, cur);
      if (kind === 'employees') Object.assign(obj, { name: V(bg, 'name'), role: V(bg, 'role'), base: V(bg, 'base'), whatsapp: V(bg, 'whatsapp'), langs: V(bg, 'langs'), status: V(bg, 'status'), notes: V(bg, 'notes') });
      else if (kind === 'bases') Object.assign(obj, { name: V(bg, 'name'), type: V(bg, 'type'), location: V(bg, 'location'), status: V(bg, 'status'), capacity: V(bg, 'capacity'), notes: V(bg, 'notes') });
      else if (kind === 'checklists') Object.assign(obj, { name: V(bg, 'name'), phase: V(bg, 'phase'), product: V(bg, 'product'), global: !V(bg, 'product'), items: V(bg, 'items').split('\n').map(x => x.trim()).filter(Boolean) });
      else if (kind === 'processes') Object.assign(obj, { title: V(bg, 'title'), category: V(bg, 'category'), risk: V(bg, 'risk'), product: V(bg, 'product'), global: !V(bg, 'product'), steps: V(bg, 'steps').split('\n').map(x => x.trim()).filter(Boolean) });
      else Object.assign(obj, { title: V(bg, 'title'), sev: V(bg, 'sev'), call: V(bg, 'call'), product: V(bg, 'product'), global: !V(bg, 'product'), steps: V(bg, 'steps').split('\n').map(x => x.trim()).filter(Boolean) });
      upsert(kind, obj);
    });
  }

  /* ============ RENDER HELPERS ============ */
  function sevPill(s) {
    const m = { baixa: 'fp-info', media: 'fp-warn', alta: 'fp-warn', crit: 'fp-crit' };
    return `<span class="flyops-pill ${m[s] || 'fp-info'}">${String(s || '').toUpperCase()}</span>`;
  }
  function sec(t) { return `<div class="flyops-sec"><h2>${esc(t)}</h2><div class="line"></div></div>`; }
  function dateBar(host, rerender) {
    const t = STATE.opDate;
    return `<div class="flyops-datebar">
      <div><div class="dt">📅 ${fmtBR(t)}</div><div class="dw">Data Operacional · ${weekday(t)}</div></div>
      <div style="flex:1"></div>
      <button class="flyops-btn sm" data-d="-1">◀ Dia</button>
      <button class="flyops-btn sm" data-d="today">Hoje</button>
      <button class="flyops-btn sm" data-d="1">Dia ▶</button>
      <button class="flyops-btn sm" data-d="set">Alterar data</button>
    </div>`;
  }
  function wireDateBar(host, rerender) {
    host.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.d;
      if (v === 'today') setOpDate('2026-05-18');
      else if (v === 'set') { const x = prompt('Data operacional (AAAA-MM-DD):', STATE.opDate); if (x && /^\d{4}-\d{2}-\d{2}$/.test(x)) setOpDate(x); }
      else shiftOpDate(parseInt(v, 10));
      rerender();
    }));
  }
  function wireAcc(host) { host.querySelectorAll('[data-acc]').forEach(h => h.addEventListener('click', e => { if (e.target.closest('.flyops-btn')) return; h.parentElement.classList.toggle('open'); })); }

  /* ============ RENDER · OPERAÇÃO DO CLIENTE ============ */
  function renderClientOp(host, opId, backFn) {
    const o = getOp(opId); if (!o) { host.innerHTML = '<p style="color:#c6a85a;padding:30px">Operação não encontrada.</p>'; return; }
    o.status = autoStatus(o);
    const t = STATE.opDate;
    const stepsHTML = o.steps.slice().sort((a, b) => (a.scheduledDate + a.scheduledTime).localeCompare(b.scheduledDate + b.scheduledTime)).map(s => {
      const late = s.status !== 'concluido' && s.status !== 'pulado' && s.scheduledDate < t;
      const cls = s.status === 'concluido' ? 'done' : (late ? 'late' : '');
      const emp = (STATE.employees.find(e => e.id === s.employeeId) || {}).name;
      const base = (STATE.bases.find(b => b.id === s.baseId) || {}).name || s.baseType;
      return `<div class="flyops-tl-i ${cls}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div class="t">${esc(s.title)} <span class="flyops-pill ${s.status === 'concluido' ? 'fp-ok' : (late ? 'fp-crit' : 'fp-info')}">${esc(s.status)}</span></div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button class="flyops-btn sm" data-edit="${s.id}">✎</button>
            <button class="flyops-btn sm" data-done="${s.id}">✓</button>
            <button class="flyops-btn sm danger" data-rm="${s.id}">✕</button>
          </div>
        </div>
        <div class="m">📅 ${fmtBR(s.scheduledDate)} ${esc(s.scheduledTime)} · ${esc(s.phase)} · base: ${esc(base || '—')} · resp: ${esc(emp || s.role || '—')}${s.notes ? ' · 📝 ' + esc(s.notes) : ''}</div>
      </div>`;
    }).join('');
    host.innerHTML = `
      <div class="flyops-hero">
        <div class="sub">Operação do Cliente</div>
        <h1>🧳 ${esc(o.clientName)}</h1>
        <div class="sub" style="color:rgba(232,223,200,.6)">${esc(o.product)} · ${fmtBR(o.tripStart)} → ${fmtBR(o.tripEnd)} · <span class="flyops-pill fp-info">${esc(o.status)}</span></div>
        <div class="flyops-toolbar">
          <button class="flyops-btn" data-back>← Voltar</button>
          <button class="flyops-btn" data-addstep>+ Adicionar etapa</button>
          <button class="flyops-btn danger" data-delop>Excluir operação</button>
        </div>
      </div>
      ${sec('Timeline da operação · datas reais')}
      <div class="flyops-tl">${stepsHTML || '<p style="color:#c6a85a">Sem etapas.</p>'}</div>`;
    host.querySelector('[data-back]').onclick = backFn;
    host.querySelector('[data-addstep]').onclick = () => { addStep(o.id); renderClientOp(host, opId, backFn); };
    host.querySelector('[data-delop]').onclick = () => { if (confirm('Excluir a operação de ' + o.clientName + '?')) { deleteOp(o.id); backFn(); } };
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { openStepEditor(o.id, b.dataset.edit); setTimeout(() => renderClientOp(host, opId, backFn), 50); });
    host.querySelectorAll('[data-done]').forEach(b => b.onclick = () => { updateStep(o.id, b.dataset.done, { status: 'concluido' }); renderClientOp(host, opId, backFn); });
    host.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (confirm('Remover etapa?')) { removeStep(o.id, b.dataset.rm); renderClientOp(host, opId, backFn); } });
    window.addEventListener('fly:ops-update', function _u() { if (!document.body.contains(host)) { window.removeEventListener('fly:ops-update', _u); return; } }, { once: true });
  }

  /* ============ RENDER · CENTRAL MACRO ============ */
  function renderGeneral(host) {
    if (!host) return; injectCSS(); load(); host.classList.add('flyops');
    const rerender = () => renderGeneral(host);
    const t = STATE.opDate;
    const ops = STATE.operations;
    const viajando = ops.filter(o => o.tripStart <= t && o.tripEnd >= t);
    const embarcando = ops.filter(o => o.tripStart === t);
    const chegando = ops.filter(o => o.tripStart === addDays(t, -1));
    const disp = STATE.employees.filter(e => e.status === 'Disponível').length;
    const ed = STATE.editMode;

    const cards = [['🧳', viajando.length, 'Em viagem hoje'], ['🛫', embarcando.length, 'Embarcando hoje'],
      ['🛬', chegando.length, 'Chegando Dubai'], ['📋', ops.length, 'Operações totais'],
      ['🟢', disp, 'Func. disponíveis'], ['📍', STATE.bases.length, 'Bases'],
      ['📑', STATE.processes.length, 'Processos'], ['⚠️', STATE.contingencies.length, 'Contingências']];

    const cliRows = ops.length ? ops.map(o => `<tr>
      <td><b>${esc(o.clientName)}</b></td><td>${esc(o.product)}</td><td>${fmtBR(o.tripStart)}→${fmtBR(o.tripEnd)}</td>
      <td><span class="flyops-pill fp-info">${esc(autoStatus(o))}</span></td>
      <td>${esc((o.steps.find(s => s.status !== 'concluido') || {}).title || 'Concluída')}</td>
      <td><button class="flyops-btn sm" data-op="${o.id}">Abrir operação</button></td></tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:rgba(232,223,200,.5);padding:18px">Nenhum cliente. Clique em "+ Adicionar Cliente em Viagem".</td></tr>';

    // Calendário: hoje + 7 dias
    let cal = '';
    for (let i = 0; i < 8; i++) {
      const d = addDays(t, i);
      const evs = [];
      ops.forEach(o => o.steps.forEach(s => { if (s.scheduledDate === d) evs.push(`${esc(o.clientName)}: ${esc(s.title)} ${esc(s.scheduledTime)}`); }));
      cal += `<div class="flyops-box"><h3>${i === 0 ? 'HOJE · ' : ''}${fmtBR(d)} · ${weekday(d)}</h3>${evs.length ? '<ul>' + evs.map(e => `<li>${e}</li>`).join('') + '</ul>' : '<div style="color:rgba(232,223,200,.4);font-size:11px">Sem eventos</div>'}</div>`;
    }

    const lib = (title, kind, rows) => `${sec(title)}${ed ? `<div class="flyops-toolbar"><button class="flyops-btn sm" data-new="${kind}">+ Novo</button></div>` : ''}<table class="flyops-tbl">${rows}</table>`;
    const procRows = `<tr><th>Processo</th><th>Categoria</th><th>Risco</th><th>Escopo</th>${ed ? '<th></th>' : ''}</tr>` + STATE.processes.map(p => `<tr><td>${esc(p.title)}</td><td>${esc(p.category)}</td><td>${sevPill(p.risk)}</td><td>${p.global ? 'Global' : esc(p.product)}</td>${ed ? `<td><button class="flyops-btn sm" data-ed="processes:${p.id}">✎</button> <button class="flyops-btn sm danger" data-del="processes:${p.id}">✕</button></td>` : ''}</tr>`).join('');
    const contRows = `<tr><th>Contingência</th><th>Gravidade</th><th>Acionar</th><th>Escopo</th>${ed ? '<th></th>' : ''}</tr>` + STATE.contingencies.map(c => `<tr><td>${esc(c.title)}</td><td>${sevPill(c.sev)}</td><td>${esc(c.call)}</td><td>${c.global ? 'Global' : esc(c.product)}</td>${ed ? `<td><button class="flyops-btn sm" data-ed="contingencies:${c.id}">✎</button> <button class="flyops-btn sm danger" data-del="contingencies:${c.id}">✕</button></td>` : ''}</tr>`).join('');
    const chkRows = `<tr><th>Checklist</th><th>Fase</th><th>Itens</th><th>Escopo</th>${ed ? '<th></th>' : ''}</tr>` + STATE.checklists.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.phase)}</td><td>${(c.items || []).length}</td><td>${c.global ? 'Global' : esc(c.product)}</td>${ed ? `<td><button class="flyops-btn sm" data-ed="checklists:${c.id}">✎</button> <button class="flyops-btn sm danger" data-del="checklists:${c.id}">✕</button></td>` : ''}</tr>`).join('');
    const baseRows = `<tr><th>Base</th><th>Tipo</th><th>Local</th><th>Status</th>${ed ? '<th></th>' : ''}</tr>` + STATE.bases.map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.type)}</td><td>${esc(b.location)}</td><td><span class="flyops-pill ${b.status === 'ativa' ? 'fp-ok' : 'fp-warn'}">${esc(b.status)}</span></td>${ed ? `<td><button class="flyops-btn sm" data-ed="bases:${b.id}">✎</button> <button class="flyops-btn sm danger" data-del="bases:${b.id}">✕</button></td>` : ''}</tr>`).join('');
    const empRows = `<tr><th>Nome</th><th>Função</th><th>Base</th><th>Status</th>${ed ? '<th></th>' : ''}</tr>` + STATE.employees.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(e.role)}</td><td>${esc(e.base)}</td><td><span class="flyops-pill ${e.status === 'Disponível' ? 'fp-ok' : 'fp-warn'}">${esc(e.status)}</span></td>${ed ? `<td><button class="flyops-btn sm" data-ed="employees:${e.id}">✎</button> <button class="flyops-btn sm danger" data-del="employees:${e.id}">✕</button></td>` : ''}</tr>`).join('');
    const logRows = `<tr><th>Quando</th><th>Por</th><th>Ação</th><th>Detalhe</th></tr>` + STATE.logs.slice(0, 20).map(l => `<tr><td>${new Date(l.at).toLocaleString('pt-BR')}</td><td>${esc(l.by)}</td><td>${esc(l.action)}</td><td>${esc(l.desc)}</td></tr>`).join('');

    host.innerHTML = `
      <div class="flyops-hero">
        <div class="sub">Estrutura Corporativa · Centro de Comando</div>
        <h1>🛰️ OPERAÇÕES FLY</h1>
        <div class="desc">Sistema operacional vivo: data programável, clientes geram operação automática por data, tudo editável pelo painel e pelo James.</div>
        <div class="flyops-toolbar">
          <button class="flyops-btn primary" data-addcli>+ Adicionar Cliente em Viagem</button>
          <button class="flyops-btn" data-toggle>${ed ? '👁 Modo Apresentação' : '✎ Modo Edição'}</button>
        </div>
      </div>
      ${dateBar(host, rerender)}
      ${sec('Visão Geral · pela data operacional')}
      <div class="flyops-cards">${cards.map(([i, n, l]) => `<div class="flyops-card"><div class="ic">${i}</div><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}</div>
      ${sec('Clientes em Viagem')}
      <table class="flyops-tbl"><tr><th>Cliente</th><th>Pacote</th><th>Datas</th><th>Status</th><th>Próximo passo</th><th></th></tr>${cliRows}</table>
      ${sec('Calendário Operacional · hoje + 7 dias')}
      <div class="flyops-grid2">${cal}</div>
      ${lib('Biblioteca de Processos', 'processes', procRows)}
      ${lib('Contingências', 'contingencies', contRows)}
      ${lib('Checklists', 'checklists', chkRows)}
      ${lib('Bases Fly', 'bases', baseRows)}
      ${lib('Funcionários', 'employees', empRows)}
      ${sec('Logs Operacionais')}<table class="flyops-tbl">${logRows}</table>
      ${sec('Integração com James')}<div class="flyops-box"><ul>
        <li>"James, adiciona o cliente Adrian no Dubai Explorer viajando dia 25 de maio"</li>
        <li>"James, mostra o que temos hoje na operação"</li>
        <li>"James, quais clientes viajam essa semana?"</li></ul></div>`;

    wireDateBar(host, rerender);
    host.querySelector('[data-addcli]').onclick = () => openAddClient(null, rerender);
    host.querySelector('[data-toggle]').onclick = () => { STATE.editMode = !STATE.editMode; save(); rerender(); };
    host.querySelectorAll('[data-op]').forEach(b => b.onclick = () => renderClientOp(host, b.dataset.op, rerender));
    host.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { openEntityEditor(b.dataset.new); setTimeout(rerender, 60); });
    host.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.ed.split(':'); openEntityEditor(k, id); setTimeout(rerender, 60); });
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.del.split(':'); if (confirm('Remover item?')) { removeEntity(k, id); rerender(); } });
  }

  /* ============ RENDER · OPERAÇÃO DO PACOTE ============ */
  function pkgBody(pb, presentation) {
    load();
    const ops = STATE.operations.filter(o => o.productSlug === pb.productSlug);
    const stepsHTML = (pb.stepTemplates || []).map(s => `<div class="flyops-tl-i"><div class="t">${esc(s.title)} <span class="flyops-pill fp-info">dia ${esc(String(s.rel))}</span></div><div class="m">${esc(s.phase)} · ${esc(s.time)} · base: ${esc(s.baseType)} · resp: ${esc(s.role)}${s.checklist ? ' · checklist: ' + esc(s.checklist) : ''}</div></div>`).join('');
    const expHTML = `<div class="flyops-cards">${(pb.experiencia || []).map(e => `<div class="flyops-card"><div class="ic">✨</div><div class="n" style="font-size:13px">${esc(e)}</div></div>`).join('')}</div>`;
    const m = pb.metricas || {};
    const liveOps = ops.length ? `<table class="flyops-tbl"><tr><th>Cliente</th><th>Ida</th><th>Status</th></tr>${ops.map(o => `<tr><td>${esc(o.clientName)}</td><td>${fmtBR(o.tripStart)}</td><td><span class="flyops-pill fp-info">${esc(autoStatus(o))}</span></td></tr>`).join('')}</table>` : '<p style="color:rgba(232,223,200,.5);font-size:12px">Nenhuma operação ativa deste pacote ainda.</p>';
    return `
      ${presentation ? `<div class="flyops-pitch">A Fly não vende apenas pacotes. A Fly opera experiências ponta a ponta, com processos, bases, pessoas, tecnologia e suporte em cada etapa da jornada.</div>` : ''}
      ${sec('Resumo Operacional')}
      <div class="flyops-cards">
        <div class="flyops-card"><div class="ic">📦</div><div class="n" style="font-size:14px">${esc(pb.productName)}</div><div class="l">Pacote</div></div>
        <div class="flyops-card"><div class="ic">⭐</div><div class="n" style="font-size:13px">${esc(pb.packageType)}</div><div class="l">Nível</div></div>
        <div class="flyops-card"><div class="ic">⏱</div><div class="n" style="font-size:14px">${esc(pb.duration)}</div><div class="l">Duração</div></div>
        <div class="flyops-card"><div class="ic">🧩</div><div class="n" style="font-size:14px">${esc(pb.complexity)}</div><div class="l">Complexidade</div></div>
        <div class="flyops-card"><div class="ic">🗺️</div><div class="n">${(pb.stepTemplates || []).length}</div><div class="l">Etapas</div></div>
        <div class="flyops-card"><div class="ic">📌</div><div class="n">v${pb.version || 1}</div><div class="l">Versão playbook</div></div>
      </div>
      <p style="color:rgba(232,223,200,.7);font-size:12.5px;line-height:1.55">${esc(pb.description)}</p>
      ${sec('Operações ativas deste pacote')}${liveOps}
      ${sec('Playbook · etapas modelo (dia relativo à ida)')}<div class="flyops-tl">${stepsHTML}</div>
      ${sec('Experiência do Cliente')}${expHTML}
      ${sec('Métricas Operacionais')}
      <div class="flyops-cards">
        <div class="flyops-card"><div class="ic">👥</div><div class="n">${ops.length}</div><div class="l">Operações</div></div>
        <div class="flyops-card"><div class="ic">😊</div><div class="n" style="font-size:16px">${esc(m.satisfacao || '—')}</div><div class="l">Satisfação</div></div>
        <div class="flyops-card"><div class="ic">📈</div><div class="n" style="font-size:16px">${esc(m.nps || '—')}</div><div class="l">NPS</div></div>
      </div>`;
  }
  function renderPackage(host, nameOrSlug) {
    if (!host) return; injectCSS(); load(); host.classList.add('flyops');
    const pb = getPlaybook(nameOrSlug);
    const rerender = () => renderPackage(host, nameOrSlug);
    host.innerHTML = `
      <div class="flyops-hero">
        <div class="sub">Operação do Pacote · playbook vinculado</div>
        <h1>🗺️ ${esc(pb.productName)}</h1>
        <div class="flyops-toolbar">
          <button class="flyops-btn primary" data-present>🎬 Modo Apresentação</button>
          <button class="flyops-btn" data-addcli>+ Cliente neste pacote</button>
          <button class="flyops-btn" data-editpb>✎ Editar Playbook</button>
        </div>
      </div>
      ${pkgBody(pb, false)}`;
    wireAcc(host);
    host.querySelector('[data-present]').onclick = () => openPresentation(pb);
    host.querySelector('[data-addcli]').onclick = () => openAddClient(pb.productSlug, rerender);
    host.querySelector('[data-editpb]').onclick = () => {
      modal('Editar Playbook · ' + pb.productName, `${field('Nome', 'productName', pb.productName)}${field('Tipo/Nível', 'packageType', pb.packageType)}<div class="row">${field('Duração', 'duration', pb.duration)}${field('Complexidade', 'complexity', pb.complexity)}</div>${field('Perfil do cliente', 'customerProfile', pb.customerProfile)}${field('Descrição', 'description', pb.description, 'textarea')}<p style="font-size:11px;color:rgba(232,223,200,.5)">Edições afetam novas operações. Operações já criadas não mudam.</p>`, (bg) => {
        pb.productName = V(bg, 'productName'); pb.packageType = V(bg, 'packageType'); pb.duration = V(bg, 'duration');
        pb.complexity = V(bg, 'complexity'); pb.customerProfile = V(bg, 'customerProfile'); pb.description = V(bg, 'description');
        savePlaybook(pb); rerender();
      });
    };
  }
  function openPresentation(pb) {
    injectCSS(); load();
    const ov = document.createElement('div'); ov.className = 'flyops flyops-present';
    ov.innerHTML = `<button class="flyops-btn close" data-close>✕ Fechar</button>
      <div class="flyops-hero"><div class="sub">FLY COMPANY · OPERAÇÃO PONTA A PONTA</div><h1>${esc(pb.productName)}</h1></div>
      ${pkgBody(pb, true)}`;
    document.body.appendChild(ov);
    ov.querySelector('[data-close]').onclick = () => ov.remove();
  }

  /* ============ API ============ */
  window.__flyOps = {
    __v2: true, slugify, getPlaybook, listPlaybooks, openPresentation,
    renderGeneral, renderPackage,
    state: () => load(), summary, james,
    addClientOperation: (p) => generateOperation(p),
    setOpDate, shiftOpDate, upsert, removeEntity, savePlaybook,
    liveData: () => ({ clientes: load().operations }), // compat
  };
  load();
  console.log('[FlyOps v2] ✅ sistema operacional vivo · data', STATE.opDate, '·', STATE.operations.length, 'operações');
})();
