/* =====================================================================
   FLY OPERATIONS — Operational Playbooks (cérebro operacional da Fly)
   Versão 1.0 · FLY Ecossistema

   ARQUITETURA (sem duplicar dados):
   - Um playbook por produto (chaveado por slug do produto).
   - A CENTRAL macro (formato de painel "Operações", dentro da Estrutura
     Corporativa) usa TODOS os playbooks + dados de operação ao vivo.
   - A página de cada pacote (formato PACOTES · aba "Operação") usa
     APENAS o playbook daquele produto. Mesma fonte → zero duplicação.

   API · window.__flyOps
     getPlaybook(slug)        → playbook do produto (ou gerado)
     listPlaybooks()          → todos os playbooks
     slugify(name)            → 'Dubai Explorer' → 'dubai-explorer'
     renderGeneral(host)      → central macro (Estrutura Corporativa)
     renderPackage(host,slug,{presentation}) → operação de 1 pacote
     liveData()               → clientes/escala/ocorrências/logs (mock)
   ===================================================================== */
(function flyOperationsBoot() {
  'use strict';
  if (window.__flyOps) return;

  /* ================================================================
     UTIL
     ================================================================ */
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ================================================================
     PLAYBOOKS — mock rico p/ os 3 pacotes-chave + gerador p/ o resto
     ================================================================ */
  const GLOBAL_JOURNEY = [
    'Venda fechada', 'Onboarding', 'Coleta de documentos', 'Confirmação passaporte',
    'Emissão de passagem', 'Reserva de hotel', 'Reserva de passeios', 'Grupo WhatsApp',
    'Envio do roteiro', 'Confirmação pré-embarque', 'Cliente sai de casa', 'Uber p/ aeroporto',
    'Chegada ao aeroporto', 'Check-in', 'Embarque', 'Voo', 'Chegada em Dubai', 'Imigração',
    'Bagagem', 'Transfer p/ hotel', 'Check-in hotel', 'Execução dos passeios',
    'Dias livres c/ suporte', 'Check-out', 'Transfer retorno', 'Embarque volta',
    'Chegada ao Brasil', 'Pós-venda', 'Depoimento', 'Próxima experiência',
  ];

  const GLOBAL_CONTINGENCIES = [
    { problem: 'Cliente esqueceu passaporte', sev: 'crit', call: 'Coordenador + cliente',
      steps: ['Manter cliente calmo', 'Confirmar tempo até casa', 'Ver limite de check-in', 'Acionar familiar/motoboy/Uber Flash', 'Acionar cia aérea se preciso', 'Registrar ocorrência', 'Escalar coordenador'] },
    { problem: 'Cliente perdeu o voo', sev: 'crit', call: 'Coordenador + Financeiro',
      steps: ['Abrir ocorrência crítica', 'Acionar cia aérea', 'Ver remarcação', 'Calcular custo', 'Acionar financeiro', 'Atualizar transfer/hotel Dubai'] },
    { problem: 'Mala extraviada', sev: 'alta', call: 'Base Aeroporto Dubai',
      steps: ['Cliente abre registro no aeroporto', 'Fotografar comprovante', 'Coletar protocolo', 'Acionar cia + seguro', 'Kit emergência', 'Atualizar hotel'] },
    { problem: 'Cliente atrasado p/ passeio', sev: 'media', call: 'Base Passeios',
      steps: ['Ver tolerância do fornecedor', 'Acionar motorista', 'Recalcular rota', 'Avisar fornecedor', 'Remarcar se possível'] },
    { problem: 'Cliente passou mal', sev: 'crit', call: 'Operador emergência + seguro',
      steps: ['Identificar gravidade', 'Acionar seguro/médico', 'Enviar funcionário disponível', 'Avisar liderança', 'Acompanhar até resolução'] },
  ];

  const GLOBAL_CHECKLISTS = [
    { name: 'Pré-embarque', phase: 'pre', items: ['Passaporte válido', 'Passagem emitida', 'Hotel confirmado', 'Passeios confirmados', 'Transfer confirmado', 'Grupo WhatsApp criado', 'Cliente recebeu roteiro', 'Contatos de emergência enviados', 'Mala confirmada', 'Saída de casa confirmada'] },
    { name: 'Aeroporto Brasil', phase: 'aeroporto', items: ['Cliente saiu de casa', 'Chegou ao aeroporto', 'Check-in realizado', 'Mala despachada', 'Portão confirmado', 'Embarcou'] },
    { name: 'Chegada Dubai', phase: 'chegada', items: ['Desembarcou', 'Passou imigração', 'Pegou bagagem', 'Encontrou motorista', 'Entrou no transfer', 'Chegou ao hotel', 'Check-in realizado'] },
    { name: 'Passeio', phase: 'passeio', items: ['Cliente avisado', 'Horário confirmado', 'Motorista confirmado', 'Voucher confirmado', 'Base responsável definida', 'Cliente chegou', 'Passeio realizado', 'Cliente retornou'] },
  ];

  function baseRoles() {
    return [
      { role: 'Coordenador de operação', phase: 'Todas', risk: 'Falha geral', backup: 'Liderança' },
      { role: 'Suporte WhatsApp', phase: 'Pré-embarque → fim', risk: 'Cliente sem resposta', backup: 'Coordenador' },
      { role: 'Suporte pré-embarque', phase: 'Dia 0–1', risk: 'Documento/voo', backup: 'Coordenador' },
      { role: 'Base aeroporto Dubai', phase: 'Chegada', risk: 'Cliente perdido', backup: 'Concierge' },
      { role: 'Motorista / transfer', phase: 'Transfer', risk: 'Atraso', backup: 'Motorista reserva' },
      { role: 'Concierge cidade', phase: 'Hotel/passeios', risk: 'Suporte local', backup: 'Coordenador' },
      { role: 'Suporte passeios', phase: 'Passeios', risk: 'Atraso/cancelamento', backup: 'Concierge' },
      { role: 'Operador de emergência', phase: 'Sob demanda', risk: 'Crise', backup: 'Liderança' },
    ];
  }

  function genericPlaybook(name) {
    const slug = slugify(name);
    return {
      id: 'pb-' + slug, productSlug: slug, productName: name, packageType: 'Pacote',
      title: name + ' · Operação', complexity: 'média', duration: '7-8 dias',
      customerProfile: 'Cliente Fly premium',
      description: 'Playbook operacional padrão Fly aplicado a ' + name + '. Documentos, aeroporto, voo, chegada, transfer, hotel, passeios e retorno seguem o padrão global; passeios e nível de atendimento variam pelo pacote.',
      resumo: { nivel: 'Premium', clienteIdeal: 'Experiência Dubai', bases: 6, funcionarios: 6, etapas: GLOBAL_JOURNEY.length, riscos: 'Documento · Voo · Transfer' },
      jornada: GLOBAL_JOURNEY.map((t, i) => ({ etapa: t, resp: i < 16 ? 'Suporte Brasil' : 'Base Dubai', status: 'pendente' })),
      roteiro: [
        { dia: 0, fase: 'Pré-embarque', titulo: 'Confirmações', desc: 'Documentos, passaporte, passagem, hotel, roteiro, WhatsApp, saída de casa' },
        { dia: 1, fase: 'Saída do Brasil', titulo: 'Aeroporto', desc: 'Uber, check-in, despacho, embarque acompanhados' },
        { dia: 2, fase: 'Chegada Dubai', titulo: 'Transfer + hotel', desc: 'Imigração, bagagem, motorista, check-in' },
        { dia: 3, fase: 'Operação', titulo: 'Passeios do pacote', desc: 'Execução com base e checklist por passeio' },
      ],
      bases: ['Suporte Brasil', 'Aeroporto Brasil', 'Aeroporto Dubai', 'Hotel', 'Cidade', 'Passeios', 'WhatsApp', 'Emergência'].map(b => ({ name: 'Base ' + b, type: b, priority: 'normal' })),
      roles: baseRoles(),
      checklists: GLOBAL_CHECKLISTS,
      processos: ['Cliente sai de casa', 'Cliente chega ao aeroporto', 'Cliente embarca', 'Cliente chega em Dubai', 'Check-in', 'Passeio', 'Retorno'].map(p => ({ nome: p, global: true })),
      contingencias: GLOBAL_CONTINGENCIES,
      experiencia: ['Segurança', 'Suporte próximo', 'Padrão acima de agência comum'],
      metricas: { clientesAtivos: 0, vendas: 0, receita: 0, ocorrencias: 0, satisfacao: '—', nps: '—' },
    };
  }

  const PLAYBOOKS = {
    'dubai-explorer': {
      id: 'pb-dubai-explorer', productSlug: 'dubai-explorer', productName: 'Dubai Explorer',
      packageType: 'Pacote de entrada premium', complexity: 'média', duration: '8 dias / 7 noites',
      customerProfile: 'Primeira viagem a Dubai',
      title: 'Dubai Explorer · Operação',
      description: 'Primeira experiência Fly com padrão superior a qualquer agência tradicional. Suporte humanizado do Brasil ao retorno, encantamento sem operação excessivamente cara.',
      resumo: { nivel: 'Entrada premium', clienteIdeal: '1ª viagem Dubai', bases: 8, funcionarios: 6, etapas: 30, riscos: 'Insegurança · Idioma · Documento' },
      jornada: GLOBAL_JOURNEY.map((t, i) => ({ etapa: t, resp: i < 16 ? 'Suporte Brasil' : (i < 22 ? 'Base Aeroporto Dubai' : 'Concierge cidade'), base: i < 16 ? 'Brasil' : 'Dubai', status: i < 3 ? 'ok' : 'pendente', risco: (t.includes('passaporte') || t.includes('Voo')) ? 'alto' : 'baixo' })),
      roteiro: [
        { dia: 0, fase: 'Pré-embarque', titulo: 'Confirmações finais', desc: 'Documentos, passaporte, passagem, hotel, roteiro, grupo WhatsApp, horário de saída, mala/carregador/cartão/celular' },
        { dia: 1, fase: 'Saída do Brasil', titulo: 'Aeroporto Brasil', desc: 'Cliente sai de casa · suporte confirma Uber · acompanha chegada · check-in · despacho · embarque' },
        { dia: 2, fase: 'Chegada Dubai', titulo: 'Transfer + hotel', desc: 'Base Aeroporto Dubai acompanha · imigração · bagagem · motorista · hotel · base cidade assume · check-in' },
        { dia: 3, fase: 'Operação', titulo: '1º passeio', desc: 'Bom dia · horário/motorista/voucher confirmados · base acompanha execução · orientação do dia seguinte' },
        { dia: 4, fase: 'Operação', titulo: 'Passeios clássicos', desc: 'Burj Khalifa · deserto · Aquaventure · Museu do Futuro · confirmar transfers e vouchers' },
        { dia: 7, fase: 'Retorno', titulo: 'Check-out', desc: 'Confirmar check-out · transfer aeroporto · bagagem · embarque · agradecimento · abrir pós-venda' },
      ],
      bases: [
        { name: 'Base Suporte Brasil', type: 'WhatsApp/remoto', priority: 'alta' },
        { name: 'Base Aeroporto Brasil', type: 'Aeroporto', priority: 'alta' },
        { name: 'Base Aeroporto Dubai', type: 'Aeroporto', priority: 'alta' },
        { name: 'Base Hotel', type: 'Hotel', priority: 'normal' },
        { name: 'Base Cidade', type: 'Cidade', priority: 'normal' },
        { name: 'Base Passeios', type: 'Passeios', priority: 'normal' },
        { name: 'Base WhatsApp', type: 'Suporte', priority: 'alta' },
        { name: 'Base Emergência', type: 'Emergência', priority: 'crítica' },
      ],
      roles: baseRoles(),
      checklists: GLOBAL_CHECKLISTS.concat([
        { name: 'Suporte 1ª viagem', phase: 'extra', items: ['Explicar roteiro com calma', 'Confirmar que entendeu imigração', 'Tradutor/frases prontas', 'Check-in assistido remoto'] },
      ]),
      processos: [
        { nome: 'Conduzir cliente de 1ª viagem', global: false },
        { nome: 'Explicar o roteiro', global: false },
        { nome: 'Suporte humanizado', global: false },
        { nome: 'Encantar sem operação cara', global: false },
        { nome: 'Cliente sai de casa', global: true },
        { nome: 'Cliente chega ao aeroporto', global: true },
        { nome: 'Cliente chega em Dubai', global: true },
      ],
      contingencias: GLOBAL_CONTINGENCIES.concat([
        { problem: 'Cliente inseguro (1ª viagem)', sev: 'media', call: 'Suporte WhatsApp', steps: ['Ligar/áudio acalmando', 'Passo a passo do aeroporto', 'Acompanhar em tempo real'] },
        { problem: 'Cliente não fala inglês', sev: 'media', call: 'Concierge', steps: ['Enviar frases prontas', 'Tradutor no WhatsApp', 'Motorista bilíngue'] },
        { problem: 'Cliente perdido no aeroporto', sev: 'alta', call: 'Base Aeroporto Dubai', steps: ['Pedir localização/foto', 'Guiar por áudio', 'Enviar staff ao ponto'] },
      ]),
      experiencia: ['Sensação de segurança', '1ª experiência premium', 'Encantamento', '"Não estou sozinho em Dubai"'],
      metricas: { clientesAtivos: 3, vendas: 18, receita: 486000, ocorrencias: 1, satisfacao: '94%', nps: 81 },
    },

    'dubai-gta': {
      id: 'pb-dubai-gta', productSlug: 'dubai-gta', productName: 'Dubai GTA',
      packageType: 'Pacote aventura/adrenalina', complexity: 'alta', duration: '7 dias / 6 noites',
      customerProfile: 'Cliente aventura · adrenalina · status',
      title: 'Dubai GTA · Operação',
      description: 'Dia de adrenalina coordenado: supercarros, jet ski/jet car, deserto, vida noturna. Múltiplas experiências no mesmo dia exigem coordenação fina e segurança.',
      resumo: { nivel: 'Aventura premium', clienteIdeal: 'Adrenalina/status', bases: 11, funcionarios: 8, etapas: 30, riscos: 'Experiência cancelada · Habilitação · Horário' },
      jornada: GLOBAL_JOURNEY.map((t, i) => ({ etapa: t, resp: i < 16 ? 'Suporte Brasil' : 'Base Experiências', base: i < 16 ? 'Brasil' : 'Dubai', status: 'pendente', risco: i > 20 ? 'alto' : 'baixo' })),
      roteiro: [
        { dia: 0, fase: 'Pré-embarque', titulo: 'Confirmações + habilitação', desc: 'Documentos + validar habilitação p/ supercarro + termos de risco' },
        { dia: 1, fase: 'Saída', titulo: 'Aeroporto', desc: 'Padrão global de embarque' },
        { dia: 2, fase: 'Chegada', titulo: 'Transfer + hotel', desc: 'Padrão global de chegada' },
        { dia: 3, fase: 'Adrenalina', titulo: 'Supercarros + autódromo', desc: 'Confirmar carro, seguro, regras de segurança, horário crítico' },
        { dia: 4, fase: 'Adrenalina', titulo: 'Jet ski/Jet car + deserto', desc: 'Coordenar múltiplas experiências no mesmo dia' },
        { dia: 5, fase: 'Noite', titulo: 'Vida noturna', desc: 'Reserva, motorista dedicado, retorno seguro' },
        { dia: 6, fase: 'Retorno', titulo: 'Check-out', desc: 'Padrão global de retorno' },
      ],
      bases: ['Suporte Brasil', 'Aeroporto Brasil', 'Aeroporto Dubai', 'Hotel', 'Cidade', 'Passeios', 'WhatsApp', 'Emergência', 'Supercarros', 'Autódromo', 'Jet Ski/Jet Car', 'Vida Noturna', 'Experiências Radicais']
        .map(b => ({ name: 'Base ' + b, type: b, priority: /Supercarros|Radicais|Emerg/.test(b) ? 'crítica' : 'normal' })),
      roles: baseRoles().concat([
        { role: 'Responsável experiências radicais', phase: 'Dias 3-5', risk: 'Segurança/atraso', backup: 'Coordenador' },
        { role: 'Responsável supercarros', phase: 'Dia 3', risk: 'Carro indisponível', backup: 'Concierge premium' },
        { role: 'Responsável vida noturna', phase: 'Dia 5', risk: 'Reserva/segurança', backup: 'Concierge' },
      ]),
      checklists: GLOBAL_CHECKLISTS.concat([
        { name: 'Experiências radicais', phase: 'extra', items: ['Termo de risco assinado', 'Habilitação validada', 'Seguro confirmado', 'Briefing de segurança', 'Horário crítico travado'] },
        { name: 'Supercarro', phase: 'extra', items: ['Carro confirmado', 'Caução/seguro', 'Rota definida', 'Combustível', 'Backup de carro'] },
      ]),
      processos: [
        { nome: 'Operar dia de adrenalina', global: false },
        { nome: 'Confirmar supercarro', global: false },
        { nome: 'Lidar com atraso em experiência', global: false },
        { nome: 'Coordenar múltiplas experiências no dia', global: false },
        { nome: 'Cliente sai de casa', global: true },
        { nome: 'Cliente chega em Dubai', global: true },
      ],
      contingencias: GLOBAL_CONTINGENCIES.concat([
        { problem: 'Experiência radical cancelada', sev: 'alta', call: 'Resp. experiências', steps: ['Acionar fornecedor backup', 'Reordenar o dia', 'Compensar c/ alternativa', 'Comunicar cliente'] },
        { problem: 'Supercarro indisponível', sev: 'alta', call: 'Resp. supercarros', steps: ['Acionar carro backup', 'Renegociar horário', 'Upgrade se possível'] },
        { problem: 'Cliente sem habilitação válida', sev: 'media', call: 'Coordenador', steps: ['Trocar p/ experiência de passageiro', 'Realocar atividade', 'Registrar'] },
      ]),
      experiencia: ['Adrenalina', 'Liberdade', 'Status', 'Sensação de filme/game em Dubai'],
      metricas: { clientesAtivos: 2, vendas: 9, receita: 387000, ocorrencias: 1, satisfacao: '90%', nps: 76 },
    },

    'dubai-billionaire': {
      id: 'pb-dubai-billionaire', productSlug: 'dubai-billionaire', productName: 'Dubai Billionaire',
      packageType: 'Pacote VIP / luxo', complexity: 'crítica', duration: '7 dias / 6 noites',
      customerProfile: 'Alto padrão · exige invisibilidade operacional',
      title: 'Dubai Billionaire · Operação',
      description: 'Cliente de alto padrão: confirmação dupla de tudo, atendimento prioritário e invisível, plano B obrigatório executado sem o cliente perceber, relatório diário para a liderança.',
      resumo: { nivel: 'VIP/Luxo', clienteIdeal: 'Alto padrão', bases: 12, funcionarios: 8, etapas: 30, riscos: 'Reserva premium · Upgrade · Motorista' },
      jornada: GLOBAL_JOURNEY.map((t, i) => ({ etapa: t, resp: 'Concierge dedicado', base: i < 16 ? 'Brasil' : 'Dubai', status: 'pendente', risco: 'alto' })),
      roteiro: [
        { dia: 0, fase: 'Pré-embarque', titulo: 'Confirmação dupla', desc: 'Tudo confirmado e reconfirmado · plano B montado · concierge dedicado escalado' },
        { dia: 1, fase: 'Saída', titulo: 'Aeroporto assistido', desc: 'Check-in assistido · sala VIP · acompanhamento próximo' },
        { dia: 2, fase: 'Chegada', titulo: 'Transfer premium', desc: 'Carro premium · fast-track imigração · hotel 5★ check-in assistido' },
        { dia: 3, fase: 'Luxo', titulo: 'Experiências premium', desc: 'Yacht · supercarros premium · reservas de luxo · tudo pré-confirmado' },
        { dia: 6, fase: 'Retorno', titulo: 'Check-out assistido', desc: 'Relatório final · transfer premium · agradecimento personalizado' },
      ],
      bases: ['Suporte Brasil', 'Aeroporto Dubai', 'VIP', 'Concierge dedicado', 'Supercarros Premium', 'Yacht', 'Segurança', 'Hotel 5★', 'Atendimento prioritário', 'Emergência', 'Cidade', 'WhatsApp']
        .map(b => ({ name: 'Base ' + b, type: b, priority: 'crítica' })),
      roles: [
        { role: 'Coordenador VIP', phase: 'Todas', risk: 'Qualquer falha', backup: 'Liderança' },
        { role: 'Concierge dedicado', phase: 'Todas', risk: 'Cliente insatisfeito', backup: 'Coordenador VIP' },
        { role: 'Motorista premium', phase: 'Transfers', risk: 'Atraso', backup: 'Motorista premium reserva' },
        { role: 'Segurança (se necessário)', phase: 'Sob demanda', risk: 'Segurança', backup: 'Coordenador VIP' },
        { role: 'Suporte 24h', phase: 'Todas', risk: 'Resposta lenta', backup: 'Concierge' },
        { role: 'Responsável luxo/experiências', phase: 'Passeios', risk: 'Reserva indisponível', backup: 'Coordenador VIP' },
        { role: 'Gerente de relacionamento', phase: 'Todas', risk: 'Relacionamento', backup: 'Liderança' },
      ],
      checklists: GLOBAL_CHECKLISTS.concat([
        { name: 'VIP', phase: 'extra', items: ['Confirmação dupla de tudo', 'Concierge dedicado escalado', 'Plano B montado', 'Sala VIP', 'Relatório diário p/ liderança'] },
        { name: 'Plano B obrigatório', phase: 'extra', items: ['Carro backup', 'Reserva backup', 'Experiência substituta', 'Contato fornecedor alternativo'] },
      ]),
      processos: [
        { nome: 'Operar cliente de alto padrão', global: false },
        { nome: 'Antecipar problemas', global: false },
        { nome: 'Confirmação dupla de tudo', global: false },
        { nome: 'Manter atendimento prioritário', global: false },
        { nome: 'Relatório diário p/ liderança', global: false },
        { nome: 'Executar plano B sem o cliente perceber', global: false },
      ],
      contingencias: GLOBAL_CONTINGENCIES.concat([
        { problem: 'Cliente insatisfeito com hotel', sev: 'crit', call: 'Coordenador VIP', steps: ['Resolver sem desgaste', 'Upgrade imediato', 'Compensação', 'Relatório liderança'] },
        { problem: 'Reserva premium indisponível', sev: 'crit', call: 'Resp. luxo', steps: ['Acionar plano B pré-montado', 'Substituir sem o cliente perceber', 'Comunicar como "novidade"'] },
        { problem: 'Motorista premium atrasou', sev: 'alta', call: 'Coordenador VIP', steps: ['Acionar motorista reserva', 'Avisar concierge', 'Compensar tempo'] },
      ]),
      experiencia: ['Exclusividade', 'Poder', 'Luxo', 'Atendimento invisível', 'Tudo resolvido antes do cliente pedir'],
      metricas: { clientesAtivos: 1, vendas: 4, receita: 612000, ocorrencias: 0, satisfacao: '98%', nps: 92 },
    },
  };
  // aliases comuns
  PLAYBOOKS['dubai-bilionario'] = PLAYBOOKS['dubai-billionaire'];
  PLAYBOOKS['billionaire'] = PLAYBOOKS['dubai-billionaire'];

  function getPlaybook(nameOrSlug) {
    const slug = slugify(nameOrSlug);
    if (PLAYBOOKS[slug]) return PLAYBOOKS[slug];
    // match parcial (ex: "dubai explorer 2026")
    const hit = Object.keys(PLAYBOOKS).find(k => slug.indexOf(k) === 0 || k.indexOf(slug) === 0);
    if (hit) return PLAYBOOKS[hit];
    return genericPlaybook(nameOrSlug || 'Pacote');
  }
  function listPlaybooks() {
    const seen = {};
    return Object.values(PLAYBOOKS).filter(p => (seen[p.id] ? false : (seen[p.id] = true)));
  }

  /* ================================================================
     DADOS AO VIVO (mock — pronto p/ trocar por Supabase)
     ================================================================ */
  const STATUS_CLI = ['Pré-embarque', 'Indo p/ aeroporto', 'Embarcado', 'Chegou em Dubai', 'Em transfer', 'Check-in hotel', 'Em passeio', 'Livre', 'Em suporte', 'Retornando'];
  function liveData() {
    return {
      clientes: [
        { nome: 'Adrian Matheus', pacote: 'Dubai Explorer', ida: '18/05', volta: '25/05', status: 'Indo p/ aeroporto', local: 'Galeão · RJ', proximo: 'Confirmar chegada ao aeroporto', resp: 'João', base: 'Suporte Brasil' },
        { nome: 'Marina Costa', pacote: 'Dubai Billionaire', ida: '17/05', volta: '24/05', status: 'Em passeio', local: 'Palm Jumeirah', proximo: 'Yacht 16h', resp: 'Concierge VIP', base: 'Base VIP' },
        { nome: 'Rafael Lima', pacote: 'Dubai GTA', ida: '16/05', volta: '23/05', status: 'Livre', local: 'Downtown', proximo: 'Supercarro amanhã 09h', resp: 'Bruno', base: 'Base Supercarros' },
        { nome: 'Juliana Reis', pacote: 'Dubai Explorer', ida: '15/05', volta: '22/05', status: 'Check-in hotel', local: 'Novotel Al Barsha', proximo: 'Briefing roteiro', resp: 'Carla', base: 'Base Hotel' },
        { nome: 'Pedro Alves', pacote: 'Dubai Family', ida: '19/05', volta: '27/05', status: 'Pré-embarque', local: 'São Paulo · BR', proximo: 'Confirmar documentos', resp: 'João', base: 'Suporte Brasil' },
      ],
      escala: [
        { nome: 'João', funcao: 'Suporte WhatsApp', base: 'Suporte Brasil', idiomas: 'PT/EN', status: 'Em atendimento', cliente: 'Adrian' },
        { nome: 'Carla', funcao: 'Concierge cidade', base: 'Base Hotel', idiomas: 'PT/EN/AR', status: 'Disponível', cliente: '—' },
        { nome: 'Bruno', funcao: 'Resp. supercarros', base: 'Base Supercarros', idiomas: 'PT/EN', status: 'Aguardando cliente', cliente: 'Rafael' },
        { nome: 'Yara', funcao: 'Base aeroporto Dubai', base: 'Aeroporto Dubai', idiomas: 'EN/AR', status: 'Disponível', cliente: '—' },
        { nome: 'Concierge VIP', funcao: 'Concierge dedicado', base: 'Base VIP', idiomas: 'PT/EN', status: 'Em atendimento', cliente: 'Marina' },
        { nome: 'Lucas', funcao: 'Motorista/transfer', base: 'Base Cidade', idiomas: 'EN', status: 'Em deslocamento', cliente: 'Marina' },
        { nome: 'Sofia', funcao: 'Operador emergência', base: 'Base Emergência', idiomas: 'PT/EN', status: 'Disponível', cliente: '—' },
        { nome: 'Tariq', funcao: 'Suporte passeios', base: 'Base Passeios', idiomas: 'EN/AR', status: 'Disponível', cliente: '—' },
      ],
      ocorrencias: [
        { cliente: 'Rafael Lima', pacote: 'Dubai GTA', tipo: 'Passeio', sev: 'media', status: 'Em andamento', desc: 'Supercarro remarcado p/ amanhã 09h', resp: 'Bruno' },
        { cliente: 'Adrian Matheus', pacote: 'Dubai Explorer', tipo: 'Documento', sev: 'baixa', status: 'Resolvida', desc: 'Dúvida sobre visto on-arrival — esclarecida', resp: 'João' },
      ],
      logs: [
        { h: '08:42', user: 'João', cli: 'Adrian', acao: 'Cliente saiu de casa', st: 'ok' },
        { h: '08:55', user: 'Sistema', cli: 'Adrian', acao: 'Uber confirmado p/ Galeão', st: 'ok' },
        { h: '09:10', user: 'Concierge VIP', cli: 'Marina', acao: 'Yacht reconfirmado 16h', st: 'ok' },
        { h: '09:25', user: 'Bruno', cli: 'Rafael', acao: 'Ocorrência: supercarro remarcado', st: 'warn' },
        { h: '09:40', user: 'James', cli: '—', acao: 'Resumo operacional gerado', st: 'ok' },
      ],
    };
  }

  /* ================================================================
     CSS (injeta uma vez · preto/dourado centro de comando)
     ================================================================ */
  function injectCSS() {
    if (document.getElementById('flyops-css')) return;
    const s = document.createElement('style');
    s.id = 'flyops-css';
    s.textContent = `
      .flyops{--g:#c6a85a;--gb:#f5b842;color:#e8dfc8;font-family:inherit;padding:4px 2px 60px}
      .flyops-hero{background:linear-gradient(135deg,rgba(198,168,90,.14),rgba(0,0,0,.5));border:1px solid rgba(198,168,90,.3);border-radius:16px;padding:22px 24px;margin-bottom:18px;position:relative;overflow:hidden}
      .flyops-hero h1{font-size:26px;letter-spacing:3px;color:#fff;margin:0 0 6px;font-weight:800}
      .flyops-hero .sub{color:var(--g);font-size:12px;letter-spacing:2px;text-transform:uppercase}
      .flyops-hero .desc{color:rgba(232,223,200,.7);font-size:13px;margin-top:10px;max-width:880px;line-height:1.6}
      .flyops-pitch{background:rgba(198,168,90,.08);border-left:3px solid var(--gb);padding:12px 16px;border-radius:8px;margin:14px 0;font-size:13px;color:#f0e6cc;font-style:italic}
      .flyops-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:14px 0}
      .flyops-card{background:rgba(0,0,0,.45);border:1px solid rgba(198,168,90,.22);border-radius:12px;padding:14px}
      .flyops-card .ic{font-size:18px}.flyops-card .n{font-size:24px;font-weight:800;color:#fff;margin:6px 0 2px}
      .flyops-card .l{font-size:10.5px;letter-spacing:1px;color:rgba(232,223,200,.55);text-transform:uppercase}
      .flyops-sec{margin:26px 0 10px;display:flex;align-items:center;gap:10px}
      .flyops-sec h2{font-size:15px;letter-spacing:2px;color:var(--gb);margin:0;text-transform:uppercase;font-weight:700}
      .flyops-sec .line{flex:1;height:1px;background:rgba(198,168,90,.18)}
      .flyops-tbl{width:100%;border-collapse:collapse;font-size:12.5px;background:rgba(0,0,0,.35);border-radius:10px;overflow:hidden}
      .flyops-tbl th{background:rgba(198,168,90,.1);color:var(--g);text-align:left;padding:9px 12px;font-size:10.5px;letter-spacing:1px;text-transform:uppercase}
      .flyops-tbl td{padding:9px 12px;border-top:1px solid rgba(255,255,255,.05);color:#ddd2b4}
      .flyops-tbl tr:hover td{background:rgba(198,168,90,.05)}
      .flyops-pill{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px}
      .fp-ok{background:rgba(109,255,176,.15);color:#6dffb0}
      .fp-warn{background:rgba(255,193,71,.16);color:#ffcf6b}
      .fp-crit{background:rgba(255,118,118,.16);color:#ff8c8c}
      .fp-info{background:rgba(126,207,255,.14);color:#8fd0ff}
      .flyops-tl{position:relative;padding-left:26px;margin:12px 0}
      .flyops-tl::before{content:'';position:absolute;left:8px;top:4px;bottom:4px;width:2px;background:rgba(198,168,90,.3)}
      .flyops-tl-i{position:relative;margin-bottom:12px;padding:10px 14px;background:rgba(0,0,0,.4);border:1px solid rgba(198,168,90,.16);border-radius:10px}
      .flyops-tl-i::before{content:'';position:absolute;left:-22px;top:16px;width:10px;height:10px;border-radius:50%;background:var(--gb);box-shadow:0 0 8px rgba(245,184,66,.5)}
      .flyops-tl-i .t{font-weight:700;color:#fff;font-size:13px}
      .flyops-tl-i .m{font-size:11px;color:rgba(232,223,200,.6);margin-top:3px}
      .flyops-grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
      .flyops-box{background:rgba(0,0,0,.4);border:1px solid rgba(198,168,90,.18);border-radius:12px;padding:14px}
      .flyops-box h3{margin:0 0 8px;font-size:13px;color:var(--gb);letter-spacing:1px}
      .flyops-box ul{margin:6px 0 0;padding-left:18px;font-size:12px;color:#ddd2b4;line-height:1.7}
      .flyops-acc{border:1px solid rgba(198,168,90,.18);border-radius:10px;margin-bottom:8px;overflow:hidden}
      .flyops-acc-h{padding:12px 14px;background:rgba(198,168,90,.07);cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:700;color:#fff;font-size:13px}
      .flyops-acc-b{padding:12px 14px;display:none;border-top:1px solid rgba(198,168,90,.12)}
      .flyops-acc.open .flyops-acc-b{display:block}
      .flyops-btn{background:rgba(198,168,90,.12);border:1px solid rgba(198,168,90,.35);color:var(--gb);border-radius:8px;padding:8px 16px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:700;letter-spacing:1px}
      .flyops-btn:hover{background:rgba(198,168,90,.22)}
      .flyops-btn.primary{background:var(--gb);color:#1a1407}
      .flyops-present{position:fixed;inset:0;background:#070707;z-index:2147483000;overflow:auto;padding:48px 6vw}
      .flyops-present .close{position:fixed;top:20px;right:24px}
    `;
    document.head.appendChild(s);
  }

  /* ================================================================
     RENDER HELPERS
     ================================================================ */
  function sevPill(s) {
    const m = { baixa: 'fp-info', media: 'fp-warn', alta: 'fp-warn', crit: 'fp-crit', crítica: 'fp-crit' };
    const lbl = { baixa: 'BAIXA', media: 'MÉDIA', alta: 'ALTA', crit: 'CRÍTICA', 'crítica': 'CRÍTICA' };
    return `<span class="flyops-pill ${m[s] || 'fp-info'}">${lbl[s] || String(s).toUpperCase()}</span>`;
  }
  function sec(title) { return `<div class="flyops-sec"><h2>${esc(title)}</h2><div class="line"></div></div>`; }

  function pkgResumoCards(p) {
    const r = p.resumo;
    const items = [
      ['📦', p.productName, 'Pacote'], ['⭐', r.nivel, 'Nível'],
      ['🎯', p.customerProfile, 'Cliente ideal'], ['⏱', p.duration, 'Duração'],
      ['🧩', p.complexity, 'Complexidade'], ['📍', r.bases, 'Bases'],
      ['👥', r.funcionarios, 'Funcionários'], ['🗺️', r.etapas, 'Etapas'],
      ['⚠️', r.riscos, 'Riscos principais'], ['✅', 'Ativo', 'Playbook'],
    ];
    return `<div class="flyops-cards">${items.map(([ic, n, l]) =>
      `<div class="flyops-card"><div class="ic">${ic}</div><div class="n" style="font-size:${String(n).length > 10 ? '14px' : '24px'}">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>`;
  }

  function pkgBody(p, opts) {
    opts = opts || {};
    const journeyHTML = p.jornada.map(j =>
      `<div class="flyops-tl-i"><div class="t">${esc(j.etapa)} ${j.risco === 'alto' ? sevPill('alta') : ''}</div>
       <div class="m">Responsável: <b>${esc(j.resp)}</b> · Base: ${esc(j.base || '—')} · ${j.status === 'ok' ? '<span class="flyops-pill fp-ok">OK</span>' : '<span class="flyops-pill fp-info">PENDENTE</span>'}</div></div>`).join('');
    const roteiroHTML = p.roteiro.map(r =>
      `<div class="flyops-tl-i"><div class="t">DIA ${esc(r.dia)} · ${esc(r.fase)} — ${esc(r.titulo)}</div><div class="m">${esc(r.desc)}</div></div>`).join('');
    const basesHTML = `<table class="flyops-tbl"><tr><th>Base</th><th>Tipo</th><th>Prioridade</th></tr>${p.bases.map(b =>
      `<tr><td>${esc(b.name)}</td><td>${esc(b.type)}</td><td>${sevPill(b.priority === 'normal' ? 'baixa' : b.priority)}</td></tr>`).join('')}</table>`;
    const rolesHTML = `<table class="flyops-tbl"><tr><th>Função</th><th>Atua em</th><th>Risco que cobre</th><th>Plano B</th></tr>${p.roles.map(r =>
      `<tr><td>${esc(r.role)}</td><td>${esc(r.phase)}</td><td>${esc(r.risk)}</td><td>${esc(r.backup)}</td></tr>`).join('')}</table>`;
    const checksHTML = `<div class="flyops-grid2">${p.checklists.map(c =>
      `<div class="flyops-box"><h3>${esc(c.name)}</h3><ul>${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>`;
    const procHTML = `<div class="flyops-grid2">${p.processos.map(pr =>
      `<div class="flyops-box"><h3>${esc(pr.nome)}</h3><span class="flyops-pill ${pr.global ? 'fp-info' : 'fp-ok'}">${pr.global ? 'GLOBAL' : 'ESPECÍFICO'}</span></div>`).join('')}</div>`;
    const contHTML = p.contingencias.map(c =>
      `<div class="flyops-acc"><div class="flyops-acc-h" data-acc>${esc(c.problem)} ${sevPill(c.sev)}</div>
       <div class="flyops-acc-b"><div class="m" style="color:var(--g);font-size:11px;margin-bottom:6px">Acionar: ${esc(c.call)}</div><ol style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#ddd2b4">${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div></div>`).join('');
    const expHTML = `<div class="flyops-cards">${p.experiencia.map(e =>
      `<div class="flyops-card"><div class="ic">✨</div><div class="n" style="font-size:14px">${esc(e)}</div></div>`).join('')}</div>`;
    const m = p.metricas;
    const metHTML = `<div class="flyops-cards">${[
      ['👥', m.clientesAtivos, 'Clientes ativos'], ['🛒', m.vendas, 'Vendas'],
      ['💰', 'R$ ' + (m.receita || 0).toLocaleString('pt-BR'), 'Receita'],
      ['⚠️', m.ocorrencias, 'Ocorrências'], ['😊', m.satisfacao, 'Satisfação'], ['📈', m.nps, 'NPS'],
    ].map(([ic, n, l]) => `<div class="flyops-card"><div class="ic">${ic}</div><div class="n" style="font-size:${String(n).length > 9 ? '15px' : '24px'}">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>`;

    return `
      ${opts.presentation ? `<div class="flyops-pitch">A Fly não vende apenas pacotes. A Fly opera experiências ponta a ponta, com processos, bases, pessoas, tecnologia e suporte em cada etapa da jornada.</div>` : ''}
      ${sec('1 · Resumo Operacional')}${pkgResumoCards(p)}
      <p class="flyops-hero-desc" style="color:rgba(232,223,200,.7);font-size:13px;line-height:1.6">${esc(p.description)}</p>
      ${sec('2 · Jornada do Cliente')}<div class="flyops-tl">${journeyHTML}</div>
      ${sec('3 · Roteiro Dia a Dia')}<div class="flyops-tl">${roteiroHTML}</div>
      ${sec('4 · Bases Fly Envolvidas')}${basesHTML}
      ${sec('5 · Funções & Responsáveis')}${rolesHTML}
      ${sec('6 · Checklists Operacionais')}${checksHTML}
      ${sec('7 · Processos Padrão')}${procHTML}
      ${sec('8 · Contingências')}${contHTML}
      ${sec('9 · Experiência do Cliente')}${expHTML}
      ${sec('10 · Métricas Operacionais')}${metHTML}
      ${sec('11 · Integração com James')}<div class="flyops-box"><ul>
        <li>"James, abre a operação do ${esc(p.productName)}"</li>
        <li>"James, mostra o roteiro operacional do ${esc(p.productName)}"</li>
        <li>"James, quais bases atendem o ${esc(p.productName)}?"</li>
        <li>"James, prepara apresentação operacional do ${esc(p.productName)} para investidor"</li>
      </ul></div>`;
  }

  function wireAcc(host) {
    host.querySelectorAll('[data-acc]').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  }

  /* ================================================================
     RENDER · OPERAÇÃO DE 1 PACOTE (usado na aba "Operação" do PACOTES)
     ================================================================ */
  function renderPackage(host, nameOrSlug, opts) {
    if (!host) return;
    opts = opts || {};
    injectCSS();
    const p = getPlaybook(nameOrSlug);
    host.classList.add('flyops');
    host.innerHTML = `
      <div class="flyops-hero">
        <div class="sub">Operação do Pacote · Playbook vinculado</div>
        <h1>🗺️ ${esc(p.productName)}</h1>
        <div class="sub" style="color:rgba(232,223,200,.5)">${esc(p.packageType)} · ${esc(p.duration)} · complexidade ${esc(p.complexity)}</div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="flyops-btn primary" data-present>🎬 Modo Apresentação</button>
          <button class="flyops-btn" data-open-geral>🛰️ Ver Operação Geral</button>
        </div>
      </div>
      ${pkgBody(p, opts)}`;
    wireAcc(host);
    const pres = host.querySelector('[data-present]');
    if (pres) pres.addEventListener('click', () => openPresentation(p));
    const og = host.querySelector('[data-open-geral]');
    if (og) og.addEventListener('click', () => {
      try { window.__jamesContext && window.__jamesContext.trackAction && window.__jamesContext.trackAction('open_ops_geral', { from: p.productSlug }); } catch (e) {}
      alert('A Operação Geral fica em Estrutura Corporativa → item com formato de painel "Operações".');
    });
  }

  function openPresentation(p) {
    injectCSS();
    const ov = document.createElement('div');
    ov.className = 'flyops flyops-present';
    ov.innerHTML = `
      <button class="flyops-btn close" data-close>✕ Fechar</button>
      <div class="flyops-hero">
        <div class="sub">FLY COMPANY · OPERAÇÃO PONTA A PONTA</div>
        <h1>${esc(p.productName)}</h1>
        <div class="flyops-pitch">A Fly não vende apenas pacotes. A Fly opera experiências ponta a ponta, com processos, bases, pessoas, tecnologia e suporte em cada etapa da jornada.</div>
      </div>
      ${pkgBody(p, { presentation: true })}`;
    document.body.appendChild(ov);
    wireAcc(ov);
    ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  }

  /* ================================================================
     RENDER · CENTRAL MACRO (formato "Operações" · Estrutura Corp.)
     ================================================================ */
  function renderGeneral(host) {
    if (!host) return;
    injectCSS();
    const L = liveData();
    const playbooks = listPlaybooks();
    const disp = L.escala.filter(e => e.status === 'Disponível').length;
    const atend = L.escala.filter(e => e.status === 'Em atendimento').length;
    const ocAbertas = L.ocorrencias.filter(o => o.status !== 'Resolvida').length;
    host.classList.add('flyops');

    const cards = [
      ['🧳', L.clientes.length, 'Clientes em viagem'],
      ['🛫', L.clientes.filter(c => /aeroporto|Pré/.test(c.status)).length, 'Embarcando hoje'],
      ['🛬', L.clientes.filter(c => /Chegou|transfer|Check-in/.test(c.status)).length, 'Chegando em Dubai'],
      ['🗺️', L.clientes.filter(c => c.status === 'Em passeio').length, 'Em passeio agora'],
      ['🟢', disp, 'Funcionários disponíveis'],
      ['🎧', atend, 'Em atendimento'],
      ['📍', new Set(L.escala.map(e => e.base)).size, 'Bases ativas'],
      ['⚠️', ocAbertas, 'Ocorrências abertas'],
    ];

    const cliRows = L.clientes.map((c, i) => `<tr>
      <td><b>${esc(c.nome)}</b></td><td>${esc(c.pacote)}</td><td>${esc(c.ida)}→${esc(c.volta)}</td>
      <td><span class="flyops-pill fp-info">${esc(c.status)}</span></td><td>${esc(c.local)}</td>
      <td>${esc(c.proximo)}</td><td>${esc(c.resp)}</td><td>${esc(c.base)}</td>
      <td><button class="flyops-btn" data-cli="${i}" style="padding:4px 10px;font-size:10px">Ver operação</button></td></tr>`).join('');

    const escRows = L.escala.map(e => {
      const st = e.status === 'Disponível' ? 'fp-ok' : (e.status === 'Em atendimento' ? 'fp-warn' : 'fp-info');
      return `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.funcao)}</td><td>${esc(e.base)}</td><td>${esc(e.idiomas)}</td><td><span class="flyops-pill ${st}">${esc(e.status)}</span></td><td>${esc(e.cliente)}</td></tr>`;
    }).join('');

    const ocRows = L.ocorrencias.map(o => `<tr><td><b>${esc(o.cliente)}</b></td><td>${esc(o.pacote)}</td><td>${esc(o.tipo)}</td><td>${sevPill(o.sev)}</td><td><span class="flyops-pill ${o.status === 'Resolvida' ? 'fp-ok' : 'fp-warn'}">${esc(o.status)}</span></td><td>${esc(o.desc)}</td><td>${esc(o.resp)}</td></tr>`).join('');

    const logRows = L.logs.map(l => `<tr><td>${esc(l.h)}</td><td>${esc(l.user)}</td><td>${esc(l.cli)}</td><td>${esc(l.acao)}</td><td><span class="flyops-pill ${l.st === 'ok' ? 'fp-ok' : 'fp-warn'}">${l.st.toUpperCase()}</span></td></tr>`).join('');

    const pbAcc = playbooks.map(p => `<div class="flyops-acc"><div class="flyops-acc-h" data-acc>📦 ${esc(p.productName)} <span class="flyops-pill fp-info">${esc(p.complexity)} · ${p.bases.length} bases</span></div><div class="flyops-acc-b">
      <div class="m" style="color:rgba(232,223,200,.7);font-size:12px;margin-bottom:8px">${esc(p.description)}</div>
      <button class="flyops-btn" data-pb="${esc(p.productSlug)}">Abrir playbook completo</button></div></div>`).join('');

    host.innerHTML = `
      <div class="flyops-hero">
        <div class="sub">Estrutura Corporativa · Centro de Comando</div>
        <h1>🛰️ OPERAÇÕES FLY</h1>
        <div class="desc">O cérebro operacional da Fly. Quem atende, onde, quando, como, o que fazer se der errado e qual o próximo passo do cliente — do Brasil ao retorno. Cada pacote tem seu playbook; aqui é a visão macro de todos.</div>
      </div>
      ${sec('1 · Visão Geral da Operação')}
      <div class="flyops-cards">${cards.map(([ic, n, l]) => `<div class="flyops-card"><div class="ic">${ic}</div><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')}</div>
      ${sec('2 · Clientes em Viagem')}
      <table class="flyops-tbl"><tr><th>Cliente</th><th>Pacote</th><th>Datas</th><th>Status</th><th>Local</th><th>Próximo passo</th><th>Resp.</th><th>Base</th><th></th></tr>${cliRows}</table>
      ${sec('3 · Roteiros por Pacote (Playbooks)')}
      ${pbAcc}
      ${sec('4 · Escala de Funcionários')}
      <table class="flyops-tbl"><tr><th>Nome</th><th>Função</th><th>Base</th><th>Idiomas</th><th>Status</th><th>Cliente</th></tr>${escRows}</table>
      ${sec('5 · Contingências & Ocorrências')}
      <table class="flyops-tbl"><tr><th>Cliente</th><th>Pacote</th><th>Tipo</th><th>Gravidade</th><th>Status</th><th>Descrição</th><th>Resp.</th></tr>${ocRows}</table>
      ${sec('6 · Logs Operacionais')}
      <table class="flyops-tbl"><tr><th>Hora</th><th>Usuário</th><th>Cliente</th><th>Ação</th><th>Status</th></tr>${logRows}</table>
      ${sec('7 · Integração com James')}
      <div class="flyops-box"><ul>
        <li>"James, me mostra clientes embarcando hoje"</li>
        <li>"James, quem atende o Adrian hoje?"</li>
        <li>"James, qual base cobre o Dubai Explorer amanhã?"</li>
        <li>"James, abre uma ocorrência: cliente esqueceu passaporte"</li>
        <li>"James, qual o processo se o cliente perder o voo?"</li>
      </ul></div>`;
    wireAcc(host);
    host.querySelectorAll('[data-pb]').forEach(b => b.addEventListener('click', () => {
      const p = getPlaybook(b.dataset.pb);
      openPresentation(p);
    }));
    host.querySelectorAll('[data-cli]').forEach(b => b.addEventListener('click', () => {
      const c = L.clientes[+b.dataset.cli];
      openPresentation(getPlaybook(c.pacote));
    }));
  }

  /* ================================================================
     API
     ================================================================ */
  window.__flyOps = {
    slugify, getPlaybook, listPlaybooks, liveData,
    renderGeneral, renderPackage, openPresentation,
  };
  console.log('[FlyOps] ✅ playbooks operacionais prontos:', Object.keys(PLAYBOOKS).join(', '));
})();
