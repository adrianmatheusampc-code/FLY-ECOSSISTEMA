/* =====================================================================
   JAMES INTENT PARSER — FASE 2
   Classifica a intenção do usuário a partir do texto natural.
   Funciona com regras (sem IA externa) e expõe um método pra plugar IA depois.

   Output: { type, subtype, confidence, category, requiresConfirmation,
             isAmbiguous, clarifyingQuestions, raw }
   ===================================================================== */
(function jamesIntentParserBoot() {
  'use strict';

  /* ----------------------------------------------------------
     Normalização de texto
     ---------------------------------------------------------- */
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
      .replace(/[?!,.;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ----------------------------------------------------------
     Padrões de Intenção
     Cada padrão tem: regex (ou keywords), type, subtype, category,
                       confidence base, requiresConfirmation
     ---------------------------------------------------------- */
  const PATTERNS = [
    /* === PACOTES · ALTA PRIORIDADE (vem antes de tudo pra não cair em CRM/vendas genéricos) ===
       Estes padrões só disparam quando há contexto claro de pacote/produto/passeio/passageiro
       ou quando o nome de um pacote (ex: "dubai", "explorer") aparece no comando. */
    {
      // "lista os pacotes" / "que pacotes temos"
      re: /\b(?:lista|liste|quais|que)\s+(?:os\s+|todos\s+os\s+)?pacotes?\b/i,
      type: 'pacote', subtype: 'pacote_list', category: 'pacotes',
      confidence: 0.97, requiresConfirmation: false,
    },
    {
      // "resumo/dados/status do pacote X" / "como está o dubai"
      re: /\b(?:resumo|resumo\s+geral|dados|status|como\s+(?:t[áa]|est[áa]))\s+(?:do\s+|da\s+|de\s+|no\s+)?(?:pacote\s+|produto\s+)?(?:dubai|explorer|maldivas|safari|aspen|paris|miami|jap[ãa]o|tail[âa]ndia|patag[ôo]nia|machu|fly\s+\w+)/i,
      type: 'pacote', subtype: 'pacote_query', category: 'pacotes',
      confidence: 0.96, requiresConfirmation: false,
    },
    {
      // "edita/muda/atualiza o produto/nome/duração/descrição/banner do [pacote]"
      re: /\b(?:edita|edit[ae]r|muda|altera|atualiza|seta|define)\s+(?:o\s+|a\s+)?(?:nome|titulo|t[íi]tulo|dura[cç][ãa]o|tipo|descri[cç][ãa]o|banner|produto)\b/i,
      type: 'pacote', subtype: 'pacote_edit_produto', category: 'pacotes',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "adiciona/cria passeio/experiência [nome]"
      re: /\b(?:adicion[ae]|cria|cadastra|inclui|p[ôo]e|coloca)\s+(?:um\s+|uma\s+|novo\s+|nova\s+)?(?:passeio|experiencia|experi[êe]ncia|atra[cç][ãa]o|tour)\b/i,
      type: 'pacote', subtype: 'pacote_add_experiencia', category: 'pacotes',
      confidence: 0.96, requiresConfirmation: false,
    },
    {
      // "remove/exclui passeio/experiência"
      re: /\b(?:remove|exclui|tira|apag[ae]|deleta)\s+(?:o\s+|a\s+)?(?:passeio|experiencia|experi[êe]ncia|atra[cç][ãa]o|tour)\b/i,
      type: 'pacote', subtype: 'pacote_remove_experiencia', category: 'pacotes',
      confidence: 0.97, requiresConfirmation: true,
    },
    {
      // "adiciona [hospedagem/transporte/refeição/incluso] no pacote"
      re: /\b(?:adicion[ae]|inclui|coloca)\s+(?:um\s+|uma\s+|no\s+)?(?:incluso|item\s+incluso|hospedagem|transporte|refei[cç][ãa]o|suporte|seguro)\b/i,
      type: 'pacote', subtype: 'pacote_add_incluso', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "adiciona custo do pacote / voo / hotel / passeio / passagem"
      // Custos DO PACOTE (por viagem) — voo, hotel, alimentação, jet ski, etc.
      // Tem prioridade sobre o padrão genérico "adiciona custo"
      re: /\b(?:adicion[ae]|cria|cadastra|inclui|lan[cç][ae])\s+(?:um\s+|uma\s+|novo\s+|nova\s+|o\s+|a\s+)?(?:custo\s+do\s+pacote|voo|passagem|hotel|hospedagem|jet\s*ski|deserto|safari|burj|aquaventure|museu|cruise|alimenta[cç][ãa]o|ingresso|transfer|carro\s+de\s+passeio|passeio|atra[cç][ãa]o)\b/i,
      type: 'pacote', subtype: 'pacote_add_custo_pacote', category: 'pacotes',
      confidence: 0.97, requiresConfirmation: false,
    },
    {
      // "adiciona custo fixo / mensal / gráfica / marketing / funcionário"
      re: /\b(?:adicion[ae]|cria|cadastra|inclui|lan[cç][ae])\s+(?:um\s+|uma\s+|novo\s+|nova\s+)?custo(?:\s+(?:fixo|vari[áa]vel|mensal|recorrente))?\b/i,
      type: 'pacote', subtype: 'pacote_add_custo', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "define / atualiza preços do pacote (solo R$X, duo R$Y, grupo R$Z)"
      re: /\b(?:define|seta|atualiza|muda|altera|coloca)\s+(?:o\s+|os\s+)?(?:pre[çc]o|valor|preco\s+de\s+venda)/i,
      type: 'pacote', subtype: 'pacote_set_preco', category: 'pacotes',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "remove custo X"
      re: /\b(?:remove|exclui|tira|apag[ae]|deleta)\s+(?:o\s+|um\s+)?custo\b/i,
      type: 'pacote', subtype: 'pacote_remove_custo', category: 'pacotes',
      confidence: 0.97, requiresConfirmation: true,
    },
    {
      // "edita hotel/localização/transporte base do pacote"
      re: /\b(?:edita|edit[ae]r|muda|altera|atualiza|troca)\s+(?:o\s+|a\s+)?(?:hotel|localiza[cç][ãa]o|transporte\s+base|base\s+operacional)\b/i,
      type: 'pacote', subtype: 'pacote_edit_base_operacional', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "adiciona dia [N] ao roteiro" / "novo dia no roteiro"
      re: /\b(?:adicion[ae]|cria|inclui|coloca|insere)\s+(?:um\s+)?(?:dia|roteiro)\b|\bnovo\s+dia\s+(?:no\s+)?roteiro\b/i,
      type: 'pacote', subtype: 'pacote_add_roteiro_dia', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "adiciona checklist [X]"
      re: /\b(?:adicion[ae]|cria|inclui|coloca)\s+(?:um\s+|no\s+)?(?:checklist|check\s*list|item\s+(?:do\s+|no\s+)?checklist)\b/i,
      type: 'pacote', subtype: 'pacote_add_checklist', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "marca/finaliza/desmarca [X] no checklist" / "[X] está feito"
      re: /\b(?:marca|finaliza|conclu[ií]|desmarca|risca)\s+(?:o\s+|a\s+)?(?:item\s+|checklist)|\bcheck(?:list)?\s+(?:do\s+|no\s+)/i,
      type: 'pacote', subtype: 'pacote_toggle_checklist', category: 'pacotes',
      confidence: 0.93, requiresConfirmation: false,
    },
    {
      // "adiciona [função] [nome] na equipe do pacote" / "coloca X como guia"
      re: /\b(?:adicion[ae]|cria|cadastra|inclui|coloca)\s+(?:.+?\s+)?(?:na\s+equipe|como\s+(?:l[íi]der|guia|motorista|suporte))\b|\b(?:adicion[ae]|cadastra)\s+(?:um\s+|uma\s+)?(?:l[íi]der|guia|motorista)\s+(?:de\s+viagem|local)?/i,
      type: 'pacote', subtype: 'pacote_add_equipe', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "remove [X] da equipe"
      re: /\b(?:remove|exclui|tira|demite|desliga)\s+(?:.+?\s+)?da\s+equipe\b/i,
      type: 'pacote', subtype: 'pacote_remove_equipe', category: 'pacotes',
      confidence: 0.97, requiresConfirmation: true,
    },
    {
      // "adiciona/cadastra passageiro [nome]" / "[nome] comprou o dubai"
      re: /\b(?:adicion[ae]|cria|cadastra|registr[ae])\s+(?:um\s+|uma\s+|novo\s+|nova\s+)?(?:passageiro|comprador|viajante)\b/i,
      type: 'pacote', subtype: 'pacote_add_cliente', category: 'pacotes',
      confidence: 0.96, requiresConfirmation: false,
    },
    {
      // "[nome] comprou o pacote/dubai/explorer X"
      re: /\b\w[\w\s]*?\s+(?:comprou|fechou|levou|adquiriu)\s+(?:o\s+|a\s+|um\s+|uma\s+)?(?:pacote|dubai|explorer|maldivas|safari|aspen|paris|miami|jap[ãa]o|tail[âa]ndia|patag[ôo]nia|machu|fly\s+\w+)/i,
      type: 'pacote', subtype: 'pacote_add_cliente', category: 'pacotes',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "atualiza ticket [médio] do pacote" / "muda preço do dubai pra R$"
      re: /\b(?:atualiza|muda|altera|seta|define)\s+(?:o\s+)?(?:ticket(?:\s+m[ée]dio)?|pre[cç]o)\b/i,
      type: 'pacote', subtype: 'pacote_update_ticket', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "atualiza meta do pacote" / "define meta de clientes/receita/lucro do dubai"
      re: /\b(?:atualiza|muda|altera|seta|define|ajusta)\s+(?:a\s+|as\s+)?metas?\s+(?:de\s+|do\s+|da\s+)?(?:clientes?|receita|lucro|pacote|produto|dubai|explorer)\b/i,
      type: 'pacote', subtype: 'pacote_update_meta', category: 'pacotes',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "lança [N] clientes/R$ no mês [X]" / "registra realizado de maio"
      re: /\b(?:lan[cç][ae]|registr[ae]|atualiza|fech[ae])\s+(?:o\s+)?(?:realizado|m[êe]s|fechamento)\b/i,
      type: 'pacote', subtype: 'pacote_lancar_mensal', category: 'pacotes',
      confidence: 0.93, requiresConfirmation: false,
    },
    {
      // "adiciona influencer [nome] ao pacote"
      re: /\b(?:adicion[ae]|cadastra|inclui|registr[ae])\s+(?:um\s+|uma\s+|novo\s+|nova\s+)?influencer\b/i,
      type: 'pacote', subtype: 'pacote_add_influencer', category: 'pacotes',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "adiciona campanha [nome]"
      re: /\b(?:adicion[ae]|cria|cadastra|lan[cç][ae])\s+(?:uma\s+|nova\s+)?campanha\b/i,
      type: 'pacote', subtype: 'pacote_add_campanha', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "adiciona upsell/extra [nome]" / "vende skydive"
      re: /\b(?:adicion[ae]|cria|cadastra|inclui)\s+(?:um\s+|uma\s+|novo\s+|nova\s+)?(?:upsell|extra|adicional)\b/i,
      type: 'pacote', subtype: 'pacote_add_upsell', category: 'pacotes',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "atualiza conteúdo/fotos/vídeos/reels do pacote"
      re: /\b(?:atualiza|muda|altera|seta)\s+(?:o\s+|os\s+|as\s+)?(?:conteudo|conte[úu]do|fotos|videos|v[íi]deos|reels)\b/i,
      type: 'pacote', subtype: 'pacote_update_conteudo', category: 'pacotes',
      confidence: 0.93, requiresConfirmation: false,
    },
    {
      // "atualiza retenção / recompra"
      re: /\b(?:atualiza|muda|seta|define)\s+(?:a\s+)?(?:reten[cç][ãa]o|recompra)\b/i,
      type: 'pacote', subtype: 'pacote_update_retencao', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "atualiza forecast/conversão/leads/churn do pacote"
      re: /\b(?:atualiza|muda|seta|define|ajusta)\s+(?:o\s+|a\s+|as\s+)?(?:forecast|premissa|taxa\s+de\s+convers[ãa]o|convers[ãa]o|leads\s+(?:por\s+m[êe]s|\/m[êe]s)|churn)\b/i,
      type: 'pacote', subtype: 'pacote_update_forecast', category: 'pacotes',
      confidence: 0.94, requiresConfirmation: false,
    },
    {
      // "adiciona linha na DRE / custo direto / administrativo / DRE"
      re: /\b(?:adicion[ae]|cria|inclui|lan[cç][ae])\s+(?:uma\s+|na\s+)?(?:linha\s+(?:na\s+|do\s+|da\s+)?dre|custo\s+direto|administrativo|marketing)\b|\bdre\s+(?:adiciona|atualiza|inclui)/i,
      type: 'pacote', subtype: 'pacote_update_dre', category: 'pacotes',
      confidence: 0.93, requiresConfirmation: false,
    },

    /* === QUERIES (ALTA PRIORIDADE — vem antes de vendas para "qual produto vendeu mais" etc) === */
    {
      // "qual produto vendeu/vende/teve/tem mais"
      re: /\bqual\s+produto\s+(?:vendeu|vende|teve|tem|fatur[ao])\s+(?:mais|menos)/i,
      type: 'query', subtype: 'query_top_product', category: 'reports',
      confidence: 0.97, requiresConfirmation: false,
    },
    {
      // "qual o top produto", "qual produto top"
      re: /\bqual\s+(?:o\s+)?(?:top\s+produto|produto\s+top|melhor\s+produto)/i,
      type: 'query', subtype: 'query_top_product', category: 'reports',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "quanto faturamos esse mês" / "quanto a gente faturou"
      re: /\bquanto\s+(?:a\s+gente\s+|nos\s+|n[oó]s\s+)?(?:faturamos|faturou|faturamento|fatura|recebemos|recebeu|ganhamos|ganhou)/i,
      type: 'query', subtype: 'query_financial', category: 'reports',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "quantas vendas tivemos"
      re: /\bquantas?\s+(?:vendas|clientes|atletas|polos|eventos|tarefas)\s+(?:tivemos|temos|fizemos|tem)?/i,
      type: 'query', subtype: 'query_count', category: 'reports',
      confidence: 0.92, requiresConfirmation: false,
    },

    /* === VENDAS === */
    {
      // "X comprou Y por Z"  /  "X fechou Y"  /  "vendeu Y pro X por Z"
      re: /\b(\w[\w\s]*?)\s+(?:comprou|compro|adquiriu|fechou|levou|pegou|tirou)\b/i,
      type: 'sale', subtype: 'create_sale', category: 'sales',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\b(?:registr[oa]|adicion[ea]|lan[cç][ae]|cria)\s+(?:uma\s+)?venda\b/i,
      type: 'sale', subtype: 'create_sale', category: 'sales',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\b(?:vendeu|vendi|vendemos)\s+(?:um|uma|o|a)?\s*\b/i,
      type: 'sale', subtype: 'create_sale', category: 'sales',
      confidence: 0.88, requiresConfirmation: false,
    },

    /* === CLIENTES / CRM === */
    {
      re: /\b(?:cri[ae]|cadastr[ae]|adicion[ea]|registr[ae]|lan[cç][ae])\s+(?:um\s+|uma\s+)?cliente\b/i,
      type: 'customer', subtype: 'create_customer', category: 'crm',
      confidence: 0.92, requiresConfirmation: false,
    },
    {
      re: /\b(?:coloca|deixa|marca|muda|atualiza|move)\s+(?:o\s+|a\s+)?(\w[\w\s]*?)\s+(?:como|para|pra|no?)\s+(lead_frio|lead_quente|qualificado|proposta|fechado|negocia[cç][aã]o|funil|cliente ativo)/i,
      type: 'customer', subtype: 'update_customer_stage', category: 'crm',
      confidence: 0.88, requiresConfirmation: false,
    },
    {
      re: /\b(?:adicion[ae]|seta|coloca|atualiza)\s+(?:o\s+)?instagram\s+(?:do|de|da)\s+/i,
      type: 'customer', subtype: 'update_customer_field', category: 'crm',
      confidence: 0.87, requiresConfirmation: false,
    },

    /* === FINANCEIRO === */
    {
      re: /\b(?:lan[cç][ae]|registr[ae]|adicion[ea]|paga)\s+(?:uma\s+)?despes[ae]\b/i,
      type: 'payment', subtype: 'create_expense', category: 'financial',
      confidence: 0.92, requiresConfirmation: false, // confirma se valor > threshold
    },
    {
      re: /\b(?:recebi|recebem[oa]s|entrou|chegou)\s+(?:r\$|reais)?\s*[\d.,]+/i,
      type: 'payment', subtype: 'create_income', category: 'financial',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\b(?:registr[ae]|adicion[ea]|cria)\s+(?:uma\s+)?entrada\b/i,
      type: 'payment', subtype: 'create_income', category: 'financial',
      confidence: 0.88, requiresConfirmation: false,
    },
    {
      re: /\badicion[ea]\s+\d+(?:\s*(?:mil|k|reais|r\$))?\s+(?:no|ao|em)\s+faturamento\b/i,
      type: 'payment', subtype: 'create_income', category: 'financial',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\btransfer[eê]ncia\s+(?:de\s+)?(?:r\$|reais)?\s*[\d.,]+\s+(?:para|pra|pro)\b/i,
      type: 'payment', subtype: 'create_transfer', category: 'financial',
      confidence: 0.88, requiresConfirmation: false,
    },

    /* === QUERIES (perguntas) === */
    {
      re: /\b(?:quanto|qual)\s+(?:foi|fica|sera|sao)\s*(?:o|a)?\s*(?:faturamento|receita|lucro|caixa|saldo)/i,
      type: 'query', subtype: 'query_financial', category: 'reports',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\bquantas?\s+(?:vendas|clientes|atletas|polos|eventos)/i,
      type: 'query', subtype: 'query_count', category: 'reports',
      confidence: 0.88, requiresConfirmation: false,
    },
    {
      re: /\bquem\s+(?:comprou|fechou|tem|s[aã]o)\b/i,
      type: 'query', subtype: 'query_who', category: 'reports',
      confidence: 0.85, requiresConfirmation: false,
    },
    {
      re: /\bqual\s+produto\s+(?:vendeu|vende|teve|tem)\s+mais/i,
      type: 'query', subtype: 'query_top_product', category: 'reports',
      confidence: 0.88, requiresConfirmation: false,
    },

    /* === NAVEGAÇÃO === */
    {
      re: /\b(?:abre|abra|abrir|vai|ir|leva|mostra|mostrar)\s+(?:o\s+|a\s+|pro\s+|pra\s+|para\s+)?(plano\s+war|war|cofre|aey|dashboard|cockpit|expansoes|expansões|crm|fly\s+cup|fly\s*cup|produtos|cliente|clientes|financeiro|vendas)/i,
      type: 'navigation', subtype: 'open_module', category: 'navigation',
      confidence: 0.95, requiresConfirmation: false,
    },

    /* === VOZ · teste / status === */
    {
      // "testa sua voz" / "testar voz" / "fala alguma coisa"
      re: /\b(?:test[ae]r?|provar?)\s+(?:a\s+)?(?:sua\s+)?voz\b|\bfala\s+(?:alguma\s+coisa|qualquer\s+coisa|teste)/i,
      type: 'voice', subtype: 'test_voice', category: 'admin',
      confidence: 0.95, requiresConfirmation: false,
    },

    /* === RECONCILE · importar dados legados / reconciliar vendas === */
    {
      // "preview reconcile" / "simular reconcile" / "preview da importação"
      re: /\b(?:preview|simul[ae]|dry\s*run|simulacao)\s+(?:do?\s+|da\s+)?(?:reconcile|reconciliar|reconcilia[cç][ãa]o|import)/i,
      type: 'reconcile', subtype: 'preview_reconcile', category: 'admin',
      confidence: 0.95, requiresConfirmation: false,
    },
    {
      // "reconcilia tudo" / "importa dados antigos" / "reconcilia produtos legados"
      re: /\b(?:reconcilia|reconciliar|importa|import[ae]r|sincroniza)\s+(?:tudo|todos|dados|produtos|pacotes|legad[oa]s?|antigos?|hist[óo]ricos?)/i,
      type: 'reconcile', subtype: 'reconcile_all', category: 'admin',
      confidence: 0.94, requiresConfirmation: true,
    },
    {
      // "reconcilia vendas" / "atribui vendas aos vendedores"
      re: /\b(?:reconcilia|atribui|matche?ia)\s+(?:as\s+)?vendas/i,
      type: 'reconcile', subtype: 'reconcile_sales', category: 'admin',
      confidence: 0.92, requiresConfirmation: true,
    },

    /* === CONNECTION REGISTRY · "o que X afeta?", "quem alimenta X?" === */
    {
      // "o que [painel] afeta", "o que [painel] atualiza", "o que sai de [painel]"
      re: /\b(?:o\s+que|quais)\s+(?:o\s+|a\s+)?(?:painel\s+)?(\w+)\s+(?:afeta|atualiza|alimenta|impacta|conect[a-z]+|sai)/i,
      type: 'connection', subtype: 'query_panel_outgoing', category: 'meta',
      confidence: 0.93, requiresConfirmation: false,
    },
    {
      // "quem alimenta [painel]", "quem afeta [painel]", "de onde vem [painel]"
      re: /\b(?:quem|o\s+que|de\s+onde)\s+(?:alimenta|afeta|chega|entra|vem)\s+(?:em\s+|no\s+|na\s+|pra\s+|para\s+)?(?:o\s+|a\s+)?(?:painel\s+)?(\w+)/i,
      type: 'connection', subtype: 'query_panel_incoming', category: 'meta',
      confidence: 0.93, requiresConfirmation: false,
    },
    {
      // "como [painel] está conectado", "conexões de [painel]"
      re: /\b(?:como\s+(?:o\s+|a\s+)?(?:painel\s+)?(\w+)\s+(?:est[áa]|tá|fica)?\s*conect|conex[ãa]o.{0,20}(\w+)|painel\s+(\w+)\s+conex)/i,
      type: 'connection', subtype: 'query_panel_connections', category: 'meta',
      confidence: 0.92, requiresConfirmation: false,
    },
    {
      // "o que combina com [painel]", "que painel combina com X"
      re: /\b(?:o\s+que|que\s+pain[éie]l|quais\s+pain[éie]is)\s+(?:combina|funciona\s+bem)\s+com\s+(\w+)/i,
      type: 'connection', subtype: 'query_panel_suggestions', category: 'meta',
      confidence: 0.9, requiresConfirmation: false,
    },

    /* === ALTERAÇÃO DE METAS · ajusta, aumenta, diminui, pausa, arquiva === */
    {
      // "ajusta a meta de [X] pra [Y]"
      re: /\b(?:ajusta|altera|muda|atualiza|seta|define)\s+(?:a\s+)?meta\b/i,
      type: 'metas', subtype: 'update_meta', category: 'metas',
      confidence: 0.93, requiresConfirmation: true,
    },
    {
      // "aumenta a meta em X%" ou "diminui meta em Y"
      re: /\b(?:aumenta|sobe|cresce|incrementa|diminui|reduz|baixa|corta)\s+(?:a\s+)?meta\b/i,
      type: 'metas', subtype: 'adjust_meta', category: 'metas',
      confidence: 0.92, requiresConfirmation: true,
    },
    {
      // "pausa a meta", "arquiva metas batidas"
      re: /\b(?:pausa|pausar|para|arquiv[ae]|encerra|finaliza)\s+(?:a\s+|as\s+)?meta/i,
      type: 'metas', subtype: 'pause_meta', category: 'metas',
      confidence: 0.91, requiresConfirmation: true,
    },
    {
      // "recalcula meta", "ajusta meta automaticamente", "projeta meta"
      re: /\b(?:recalcula|projeta|simul[ae]|run\s*rate)\s+(?:a\s+|as\s+)?meta/i,
      type: 'metas', subtype: 'project_meta', category: 'metas',
      confidence: 0.93, requiresConfirmation: false,
    },
    {
      // "quanto falta pra bater a meta de [X]" / "como tá a meta"
      re: /\b(?:quanto\s+falta\s+(?:pra\s+|para\s+)?bater|como\s+(?:t[áa]|est[áa])\s+(?:a\s+)?meta|progresso\s+da\s+meta)/i,
      type: 'metas', subtype: 'query_meta_progress', category: 'metas',
      confidence: 0.94, requiresConfirmation: false,
    },

    /* === HIERARQUIA (RH) === */
    {
      // "contrata Pedro como vendedor", "admite Maria"
      re: /\b(?:contrata|contratar|admite|admitir)\s+/i,
      type: 'hierarchy', subtype: 'create_employee', category: 'rh',
      confidence: 0.94, requiresConfirmation: true,
    },
    {
      re: /\b(?:adicion[ae]|cria|cadastra)\s+(?:um\s+|uma\s+|novo\s+|nova\s+)?(?:funcionario|cargo|colaborador)/i,
      type: 'hierarchy', subtype: 'create_employee', category: 'rh',
      confidence: 0.92, requiresConfirmation: true,
    },
    {
      // "promove Maria pra coordenadora", "muda salario do João"
      re: /\b(?:promove|promover|aumenta\s+salario|muda\s+salario|altera\s+setor|transfere)\s+/i,
      type: 'hierarchy', subtype: 'update_employee', category: 'rh',
      confidence: 0.9, requiresConfirmation: true,
    },
    {
      // "afasta o João", "demite", "desliga"
      re: /\b(?:afasta|afastar|demite|demitir|desliga|desligar)\s+/i,
      type: 'hierarchy', subtype: 'update_employee', category: 'rh',
      confidence: 0.88, requiresConfirmation: true,
    },
    {
      // "qual a folha mensal", "quantos funcionarios"
      re: /\b(?:qual\s+(?:a\s+)?folha|folha\s+(?:mensal|de)|quantos\s+funcionarios|quem\s+(?:e|é)\s+o)/i,
      type: 'hierarchy', subtype: 'query_hierarchy', category: 'rh',
      confidence: 0.92, requiresConfirmation: false,
    },

    /* === BASES OPERACIONAIS === */
    {
      // "cria base", "abre base", "cadastra base", "nova base"
      re: /\b(?:cri[ae]|cadastra|abre|abrir|nova|inaugura)\s+(?:uma\s+)?base\b/i,
      type: 'bases', subtype: 'create_base', category: 'operacao',
      confidence: 0.94, requiresConfirmation: true,
    },
    {
      // "ativa base X", "pausa base X"
      re: /\b(?:ativa|pausa|fecha|altera|atualiza)\s+(?:a\s+)?base\b/i,
      type: 'bases', subtype: 'update_base', category: 'operacao',
      confidence: 0.9, requiresConfirmation: true,
    },
    {
      // "quantas bases", "lista bases", "bases em Dubai"
      re: /\b(?:quantas\s+bases|lista\s+(?:as\s+)?bases|bases\s+em|qual\s+base)/i,
      type: 'bases', subtype: 'query_bases', category: 'operacao',
      confidence: 0.92, requiresConfirmation: false,
    },

    /* === TAREFAS === */
    {
      re: /\b(?:cri[ae]|adicion[ea]|registr[ae])\s+(?:uma\s+)?tarefa\b/i,
      type: 'task', subtype: 'create_task', category: 'tasks',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\b(?:me\s+)?lembra(?:r)?\s+(?:de|que|pra)\b/i,
      type: 'task', subtype: 'create_reminder', category: 'tasks',
      confidence: 0.88, requiresConfirmation: false,
    },
    {
      re: /\badicion[ea]\s+follow[- ]?up\b/i,
      type: 'task', subtype: 'create_followup', category: 'tasks',
      confidence: 0.88, requiresConfirmation: false,
    },

    /* === RELATÓRIOS === */
    {
      re: /\bger[ae]\s+(?:um\s+)?(?:resumo|relatorio|relatório|report)/i,
      type: 'report', subtype: 'generate_report', category: 'reports',
      confidence: 0.9, requiresConfirmation: false,
    },
    {
      re: /\b(?:resume|sintetiza)\s+(?:o|a)?\s*(?:faturamento|vendas|mes|semana|dia)/i,
      type: 'report', subtype: 'summarize', category: 'reports',
      confidence: 0.85, requiresConfirmation: false,
    },

    /* === AÇÕES SENSÍVEIS === */
    {
      re: /\b(?:excluir|exclui|apag[ae]|deleta|remover|remove|cancela)\s+/i,
      type: 'admin', subtype: 'delete', category: 'admin',
      confidence: 0.95, requiresConfirmation: true, // SEMPRE confirma
    },
    {
      re: /\bmuda\s+(?:o\s+)?modo\b/i,
      type: 'admin', subtype: 'change_data_mode', category: 'admin',
      confidence: 0.9, requiresConfirmation: true,
    },
  ];

  /* ----------------------------------------------------------
     Parser principal — rule-based
     ---------------------------------------------------------- */
  function parseCommandWithRules(rawCommand) {
    const text = String(rawCommand || '').trim();
    if (!text) {
      return {
        type: 'unknown', subtype: null, confidence: 0,
        category: 'unknown', requiresConfirmation: false,
        isAmbiguous: true,
        clarifyingQuestions: ['Não entendi, Chefe. Pode repetir?'],
        raw: text,
      };
    }

    const normalized = normalize(text);
    const matches = [];

    for (const p of PATTERNS) {
      if (p.re.test(text) || p.re.test(normalized)) {
        matches.push(p);
      }
    }

    if (matches.length === 0) {
      // Sem padrão — talvez seja uma pergunta livre ou comando ambíguo
      // Tenta detectar pergunta por "?" ou palavras-chave
      if (/\?$/.test(text.trim()) || /\b(o que|qual|quais|como|por que|porque)\b/i.test(text)) {
        return {
          type: 'query', subtype: 'free_question', category: 'reports',
          confidence: 0.5, requiresConfirmation: false,
          isAmbiguous: false, clarifyingQuestions: [],
          raw: text,
        };
      }
      return {
        type: 'unknown', subtype: null, confidence: 0.2,
        category: 'unknown', requiresConfirmation: false,
        isAmbiguous: true,
        clarifyingQuestions: ['Chefe, não entendi o comando. Pode reformular?'],
        raw: text,
      };
    }

    // Pega o match com maior confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    const best = matches[0];

    return {
      type: best.type,
      subtype: best.subtype,
      confidence: best.confidence,
      category: best.category,
      requiresConfirmation: best.requiresConfirmation,
      isAmbiguous: false,
      clarifyingQuestions: [],
      raw: text,
      allMatches: matches.map(m => ({ type: m.type, subtype: m.subtype, conf: m.confidence })),
    };
  }

  /* ----------------------------------------------------------
     Wrapper — futuro hook pra IA real (placeholder)
     ---------------------------------------------------------- */
  async function parseCommandWithAI(rawCommand) {
    // Quando houver IA conectada, esta função pode chamar o brain pra parsing.
    // Por ora, delega pro parser local.
    return parseCommandWithRules(rawCommand);
  }

  /* ----------------------------------------------------------
     API
     ---------------------------------------------------------- */
  window.__jamesIntentParser = {
    parseIntent: parseCommandWithRules,
    parseCommandWithRules,
    parseCommandWithAI,
    normalize,
    PATTERNS, // exposto pra debug
  };
})();
