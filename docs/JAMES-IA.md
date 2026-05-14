# JAMES — IA do Ecossistema FLY

JAMES é o assistente de voz do ecossistema, com **3 níveis de inteligência**:

| Nível | O que faz | Como funciona |
|---|---|---|
| **1 — Lookup** | Responde perguntas sobre dados que já existem no sistema (vendas, Cofre, Plano WAR, Fly Cup). | Funções determinísticas em JS lendo `localStorage`. Funciona offline. |
| **2 — LLM** | Conversa livre, raciocínio, explicação, brainstorm. | Chama OpenAI ou Anthropic via API key que **você** cola. |
| **3 — Execução** | Cria venda, lança movimento no Cofre, abre telas. | Parser regex + APIs internas (`__flyCofreAPI`, `__flySalesAPI`, etc). |

## Como ativar Nível 2 (ChatGPT / Claude)

1. Clica no JAMES (botão no canto inferior direito ou diz "James" em voz alta).
2. Dentro da tela do JAMES, clica no ícone de **engrenagem** (canto sup direito do palco).
3. Cola sua chave de API:
   - **OpenAI** (`sk-...`) → para GPT-4o / GPT-4o-mini
   - **Anthropic** (`sk-ant-...`) → para Claude 3.5 Sonnet
4. Clica em **Salvar**.
5. Pronto — sempre que o Nível 1 não souber responder, JAMES recorre ao LLM com **todo o contexto FLY injetado no system prompt** (saldos, vendas, atletas, Plano WAR).

A key fica **só no seu navegador** (`localStorage`), nunca sobe pro servidor.

### Onde pegar as keys

- **OpenAI**: https://platform.openai.com/api-keys (precisa de cartão e tem custo por uso — ~US$0.001 por mensagem com GPT-4o-mini).
- **Anthropic**: https://console.anthropic.com/settings/keys (também pago, mas com US$5 grátis no início).

> **Dica de chefe**: começa com OpenAI GPT-4o-mini. É barato, rápido e mais que suficiente pra conversar e raciocinar sobre seus dados.

## Como ele conversa contigo

JAMES tem **persona fixa** injetada no system prompt:

```
Você é JAMES, assistente do Ecossistema FLY (turismo de luxo
focado em Dubai). Trate o usuário como "chefe". Seja direto,
gravidade britânica + carinho brasileiro. Pode ser sarcástico
levemente quando algo é óbvio. Sempre que houver dados,
referencie números reais do sistema.

DADOS DISPONÍVEIS:
- Vendas: {{salesJson}}
- Cofre: saldo Fly R$ {{cofreFly}}, saldo Pessoal R$ {{cofrePersonal}}
- Plano WAR: {{warPoints}} pontos, {{warConnections}} conexões
- Fly Cup: {{cupModalidades}} modalidades, {{cupAtletas}} atletas
```

Você pode editar essa persona direto no `index.html` (procura por `SYSTEM_PROMPT` ou pela seção `// JAMES LLM`).

## Como pedir dados pro JAMES

Exemplos que funcionam **agora** (Nível 1):

- "Quantas vendas eu fiz esse mês?"
- "Qual o saldo do Cofre?"
- "Quantos pontos tem no Plano WAR?"
- "Quantos atletas tenho no Fly Cup?"
- "Lista os clientes que querem ir pra Dubai."

Exemplos que precisam de Nível 2 (LLM):

- "Me dá uma análise da minha base de clientes."
- "Que estratégia uso pra dobrar vendas em Maio?"
- "Resume a semana pra mim."

Exemplos que precisam de Nível 3 (execução por voz):

- "James, registra venda de Dubai Explorer pro João Silva, R$ 5.000 de sinal, veio do Instagram."
- "James, lança despesa de R$ 200 em combustível no Cofre."
- "James, transfere R$ 1.000 do Victor pro Emanuel."
- "James, abre o Cofre."
- "James, abre o Plano WAR."

## Comando por voz (wake word)

Diga **"James"** em voz alta a qualquer momento — ele acorda sozinho (precisa de permissão de microfone na primeira vez).

Pra falar manualmente, clica no orbe que pulsa ou no botão "Falar".

## Roadmap

- [x] Nível 1 (lookup local)
- [x] Nível 2 (LLM com contexto)
- [x] Nível 3 (executar venda, executar movimento Cofre)
- [ ] Nível 3.5 (executar atleta Fly Cup, criar polo, criar projeto)
- [ ] Memória persistente entre sessões (histórico de conversa)
- [ ] JAMES embarcado dentro do Dashboard Supremo (modo executivo)
