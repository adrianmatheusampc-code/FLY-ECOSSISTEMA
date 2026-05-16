/* =====================================================================
   JAMES PDF READER — FASE 4
   Lê PDFs no browser via pdf.js (CDN, lazy-load), converte pra markdown,
   detecta tipo do documento (pacote/fatura/contrato/proposta) e mantém
   uma sessão de docs anexados pra alimentar o brain como contexto.

   Docs ficam SÓ EM MEMÓRIA (não persiste). Fechou o navegador → some.
   ===================================================================== */
(function jamesPdfReaderBoot() {
  'use strict';
  if (window.__jamesPdfReader) return;

  const MAX_CHARS_PER_DOC = 200000;   // ~50k tokens, cabe no context window do Claude Sonnet
  const PDFJS_VERSION = '4.5.136';
  const PDFJS_URL    = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
  const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

  const docs = []; // session-only
  let pdfjsLib = null;
  let loadingPromise = null;

  /* ----------------------------------------------------------
     Carrega pdf.js só quando precisar (lazy)
     ---------------------------------------------------------- */
  async function ensurePdfJs() {
    if (pdfjsLib) return pdfjsLib;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const mod = await import(PDFJS_URL);
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      pdfjsLib = mod;
      return mod;
    })();
    return loadingPromise;
  }

  /* ----------------------------------------------------------
     Detecção heurística de tipo do documento
     ---------------------------------------------------------- */
  function detectType(text) {
    const t = String(text || '').toLowerCase();
    const has = (re) => re.test(t);

    if (has(/\b(roteiro|dia\s+\d+|hospedagem|passagem\s+a[ée]rea|atlantis|burj|noites?\s+em|experi[êe]ncias?\s+inclus|incluso\s*:?)/) &&
        has(/\b(turismo|viagem|pacote|destino|tour|safari|yacht|deserto)/)) {
      return 'pacote';
    }
    if (has(/\bnf-?e\b|nota\s+fiscal|chave\s+de\s+acesso|cnpj.*tomador|c[oó]digo\s+do\s+produto|fatura\s+n[º°]/)) {
      return 'fatura';
    }
    if (has(/\bcl[áa]usula\s+\w+|contrat[oa]nte|contratad[oa]|pelo\s+presente\s+instrumento|partes\s+(?:abaixo|qualificadas)|considerando\s+que/)) {
      return 'contrato';
    }
    if (has(/proposta\s+comercial|or[çc]amento\s+n[º°]|cota[çc][ãa]o|validade\s+da\s+proposta|investimento\s+total/)) {
      return 'proposta';
    }
    if (has(/curr[íi]culo|curriculum|experi[êe]ncia\s+profissional|forma[çc][ãa]o\s+acad[êe]mica/)) {
      return 'curriculo';
    }
    return 'desconhecido';
  }

  function tipoLabel(tipo) {
    return ({
      pacote: 'pacote de viagem / roteiro',
      fatura: 'nota fiscal / fatura',
      contrato: 'contrato',
      proposta: 'proposta comercial',
      curriculo: 'currículo',
      desconhecido: 'documento (tipo não identificado)',
    })[tipo] || 'documento';
  }

  /* ----------------------------------------------------------
     Extrai texto de um PDF e converte pra markdown simples
     ---------------------------------------------------------- */
  async function extractPdf(file, onProgress) {
    if (!file) throw new Error('Nenhum arquivo informado.');
    if (!/\.pdf$/i.test(file.name)) throw new Error('Só PDFs são suportados (.pdf).');
    if (file.size > 30 * 1024 * 1024) throw new Error('PDF maior que 30 MB — muito grande.');

    onProgress?.({ phase: 'loading_lib' });
    const lib = await ensurePdfJs();

    onProgress?.({ phase: 'reading' });
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const totalPages = pdf.numPages;

    const pageMd = [];
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.({ phase: 'extracting', page: i, total: totalPages });
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Junta items respeitando quebras de linha aproximadas (Y diferente = nova linha)
      let lastY = null;
      let pageText = '';
      for (const item of content.items) {
        const str = (item.str || '').trim();
        if (!str) continue;
        const y = item.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
          pageText += '\n';
        }
        pageText += (pageText.endsWith('\n') || !pageText ? '' : ' ') + str;
        lastY = y;
      }
      pageText = pageText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (pageText) pageMd.push(`### Página ${i}\n\n${pageText}`);
    }

    let markdown = pageMd.join('\n\n---\n\n').trim();
    let truncated = false;
    if (markdown.length > MAX_CHARS_PER_DOC) {
      markdown = markdown.slice(0, MAX_CHARS_PER_DOC) + '\n\n[... DOCUMENTO TRUNCADO — limite de ' + MAX_CHARS_PER_DOC + ' caracteres ...]';
      truncated = true;
    }

    const words = markdown.split(/\s+/).filter(Boolean).length;
    const tipo = detectType(markdown);

    return {
      id: 'doc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      name: file.name,
      size: file.size,
      pages: totalPages,
      chars: markdown.length,
      words,
      tipo,
      tipoLabel: tipoLabel(tipo),
      truncated,
      markdown,
      addedAt: new Date().toISOString(),
    };
  }

  /* ----------------------------------------------------------
     Gestão da sessão (docs anexados em memória)
     ---------------------------------------------------------- */
  function attachDoc(doc) {
    if (!doc || !doc.id) throw new Error('Doc inválido.');
    docs.push(doc);
    window.dispatchEvent(new CustomEvent('fly:james-doc-attached', { detail: doc }));
    return doc;
  }

  function removeDoc(id) {
    const idx = docs.findIndex(d => d.id === id || d.name === id);
    if (idx !== -1) {
      const removed = docs.splice(idx, 1)[0];
      window.dispatchEvent(new CustomEvent('fly:james-doc-removed', { detail: removed }));
      return removed;
    }
    return null;
  }

  function getAttachedDocs() { return docs.slice(); }
  function clearDocs() {
    docs.length = 0;
    window.dispatchEvent(new CustomEvent('fly:james-docs-cleared'));
  }

  /* ----------------------------------------------------------
     Seção que o brain inclui no system prompt
     ---------------------------------------------------------- */
  function buildContextSection() {
    if (!docs.length) return '';
    const lines = [
      '',
      '=== DOCUMENTOS ANEXADOS PELO CHEFE ===',
      'O Chefe anexou os PDFs abaixo na sessão. USE o conteúdo deles para responder perguntas,',
      'resumir, ou extrair dados estruturados pra emitir ACTIONs (criar pacote, lançar despesa,',
      'cadastrar cliente, etc). Sempre que possível, cite trechos curtos como evidência.',
      '',
    ];
    for (const d of docs) {
      lines.push(`--- DOCUMENTO: "${d.name}" · ${d.pages} pág · ${d.words} palavras · tipo: ${d.tipo} ---`);
      lines.push(d.markdown);
      lines.push('--- FIM DO DOCUMENTO ---');
      lines.push('');
    }
    return lines.join('\n');
  }

  /* ----------------------------------------------------------
     Prompt automático que o James "fala consigo mesmo" após anexar
     pra fazer resumo + sugerir ação extração automática.
     ---------------------------------------------------------- */
  function buildAttachIntroPrompt(doc) {
    const tipoHint = ({
      pacote: 'É um pacote/roteiro de viagem. Se houver dados estruturados (nome do pacote, duração, hotel, experiências, custos, preço), SUGIRA emitir pacote_edit_produto / pacote_add_experiencia / pacote_add_custo. Pergunte ANTES de emitir.',
      fatura: 'É uma fatura/nota fiscal. Se houver fornecedor, valor e descrição, SUGIRA emitir add_movement (despesa) no Cofre AEY. Pergunte ANTES de emitir.',
      contrato: 'É um contrato. Identifique contratante/contratado, valor, prazo. NÃO emita ACTION — só explique o que viu.',
      proposta: 'É uma proposta comercial. Se houver cliente, produto e valor, SUGIRA emitir add_customer e/ou add_sale. Pergunte ANTES de emitir.',
      curriculo: 'É um currículo. Identifique nome, função, contato. SUGIRA emitir create_employee se fizer sentido. Pergunte ANTES.',
      desconhecido: 'Tipo não identificado. Faça resumo curto e pergunte o que o Chefe quer fazer com ele.',
    })[doc.tipo] || 'Faça um resumo curto e pergunte o que o Chefe quer fazer.';

    return `O Chefe acabou de anexar o PDF "${doc.name}" (${doc.pages} página(s), ${doc.words} palavras, tipo detectado: ${doc.tipoLabel}). ${tipoHint}\n\nFaça um resumo CURTO (máximo 2 frases) do conteúdo e termine perguntando o que o Chefe quer fazer com o documento. NÃO emita ACTION ainda — espere confirmação.`;
  }

  /* ----------------------------------------------------------
     API pública
     ---------------------------------------------------------- */
  window.__jamesPdfReader = {
    extractPdf,
    attachDoc,
    removeDoc,
    getAttachedDocs,
    clearDocs,
    buildContextSection,
    buildAttachIntroPrompt,
    detectType,
    tipoLabel,
    MAX_CHARS_PER_DOC,
  };
})();
