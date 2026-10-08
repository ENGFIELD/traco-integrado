# Assistente inteligente no Traço Integrado — investigação

> 08/10/2026 · proposta para decisão (nada implementado ainda)

## 1. O que o assistente faria (exemplos reais da obra)

| Você pergunta / pede | O assistente consulta | Responde |
|---|---|---|
| "Quais CPs rompem esta semana e de quais lajes?" | Controle tecnológico + rastreabilidades | Lista por dia, com NF, peças e laboratório |
| "O que atrasou no caminho crítico?" | Cronograma (atividades críticas atrasadas) | Atividades, quantos dias e o que elas empurram |
| "Resuma as NCs abertas da FREIBA" | Não conformidades | Resumo por pavimento, há quantos dias abertas |
| "Monte o texto do diário de obra de hoje" | Concretagens, FVS, NCs e entregas de aço do dia | Rascunho pronto para revisar e salvar |
| "O fck do 3º pavimento está ok?" | CT + rastreabilidade do pavimento | Resultados por idade e alertas abaixo do fck |
| "Quanto concreto já foi para o 2º embasamento?" | Betonadas das rastreabilidades | Total em m³, por data e por BT |

Ele **lê** o que o usuário já tem permissão para ver. Qualquer ação de gravação (criar NC, salvar RDO) só acontece depois de **confirmação na tela**.

## 2. Três níveis — do grátis ao com IA

### Nível 1 — "Assistente de regras" (grátis, sem IA)
Parte disso já existe no Início da v1.5, porque o sistema já sabe:
- CPs atrasados e a romper na semana, resultados abaixo do fck;
- metas da semana e atividades atrasadas do caminho crítico;
- entregas de aço atrasadas, pavimento previsto × executado.

**Próximo passo barato:** um cartão **"Hoje você precisa…"** no topo do Início, com 3 a 5 ações priorizadas, por exemplo "Romper CPs da NF 204964 (7 dias)", "Teto do 3º pavimento atrasado 1 dia — crítico" ou "Entrega Gerdau prevista amanhã". Pode ter também notificação no celular (Fase 4.8). **Custo: R$ 0.**

### Nível 2 — Assistente com IA, só leitura (recomendado como piloto)
Um chat dentro do app (botão no canto, também por voz no celular) que entende perguntas livres em português e **busca os dados certos sozinho**.

### Nível 3 — Assistente que executa (depois do piloto)
Igual ao nível 2, mas podendo **preparar** registros: rascunho de RDO, abrir uma NC a partir de um resultado abaixo do fck, programar uma entrega de aço a partir do PDF do pedido. Sempre com **"Revisar e salvar"** por uma pessoa.

## 3. Como funciona com segurança (arquitetura proposta)

```
Celular / PC (app)                Intermediário (Cloudflare Worker, grátis)        Anthropic (Claude API)
──────────────────                ─────────────────────────────────────────        ──────────────────────
pergunta + login Firebase  ──▶  confere o login (token do Firebase)        ──▶  modelo decide quais
                                 guarda a CHAVE da API (secreta)                   "ferramentas" usar
                                 limita perguntas por pessoa/dia
ferramenta roda NO APP     ◀──  repassa o pedido de ferramenta            ◀──  ex.: buscar_cps(semana)
(dados que a pessoa já vê)
resultado da ferramenta    ──▶  repassa                                    ──▶  monta a resposta
resposta na tela           ◀──                                             ◀──
```

- **A chave da API nunca vai para o navegador.** Ela fica num intermediário. O Cloudflare Worker tem plano grátis de 100 mil requisições por dia e **não exige o Blaze do Firebase**. Com o Blaze, poderia ser uma Cloud Function.
- **As ferramentas rodam no próprio app,** sobre os dados que aquela pessoa já tem permissão de ler. O intermediário não recebe acesso ao banco, e a Jéssica, por exemplo, só consegue perguntar sobre o que ela já vê.
- **O intermediário fixa** o modelo, o tamanho máximo da resposta e as instruções do sistema, e **limita quantas perguntas cada usuário faz por dia**. No painel da Anthropic também dá para definir um **limite de gasto mensal**.
- **Ferramentas previstas** (todas só leitura no nível 2): `buscar_fvs`, `buscar_rastreabilidades`, `controle_tecnologico` (por NF, período ou pavimento), `nao_conformidades`, `cronograma_semana` / `caminho_critico`, `entregas_aco`, `avanco_estrutura`.
- **Privacidade:** os dados vão para a Anthropic só durante a pergunta. Pela política comercial da Anthropic, dados enviados pela API **não são usados para treinar modelos** por padrão. Confirme nos termos vigentes antes de ativar.

## 4. Custo estimado (preços oficiais de 25/09/2026, por milhão de tokens)

| Modelo | Entrada | Saída | Perfil |
|---|---|---|---|
| Claude Opus 5.5 | US$ 4,00 | US$ 20,00 | O mais capaz desta lista; padrão recomendado pela Anthropic |
| Claude Sonnet 5.5 | US$ 2,00 | US$ 10,00 | Rápido e capaz para o dia a dia |
| Claude Haiku 4.5 | US$ 1,00 | US$ 5,00 | Mais simples e mais barato |

**Premissas por pergunta:** cerca de 15 mil tokens de entrada (instruções, ferramentas e dados consultados, com 2 a 3 idas e voltas) e cerca de 1 mil de saída. O **cache** das instruções reduz bastante a parte repetida; os valores abaixo são **sem cache**, ou seja, pessimistas.

| Uso | Perguntas/mês | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|---|---|
| Piloto: 4 pessoas × 5 perguntas/dia | ~440 | ~US$ 35 | ~US$ 18 | ~US$ 9 |
| Uso intenso: 4 pessoas × 20 perguntas/dia | ~1.760 | ~US$ 140 | ~US$ 70 | ~US$ 35 |

*(Cálculo: Opus ≈ 15k × US$ 4/M + 1k × US$ 20/M ≈ US$ 0,08 por pergunta; Sonnet ≈ US$ 0,04; Haiku ≈ US$ 0,02. Com cache, a conta costuma cair perto da metade. Os valores reais dependem do tamanho das perguntas e serão medidos no piloto.)*

- A API da Anthropic **não tem plano grátis**: é pré-paga ou com cartão. O limite de gasto mensal configurado no painel impede surpresas.
- O **Cloudflare Worker** (intermediário) é grátis nesse volume.
- **Alternativa sem custo de IA:** o Google oferece um nível gratuito do Gemini via Firebase. Nesse nível gratuito, porém, os termos do Google permitem usar os dados enviados para melhorar os produtos deles, o que é ruim para dados de obra e de cliente. Se quiser considerar, eu levanto os termos atualizados.

## 5. Plano sugerido

| Fase | Entrega | Custo |
|---|---|---|
| A | Cartão **"Hoje você precisa…"** no Início (regras, sem IA) | R$ 0 |
| B | **Piloto do chat** só leitura para 1 ou 2 pessoas, com limite de 10 perguntas/dia e teto de gasto de US$ 20 no mês. Mede custo e utilidade reais. | ~US$ 10–20 |
| C | Liberar para a equipe e acrescentar o nível 3 (rascunhos com "Revisar e salvar") | conforme a medição da fase B |

**O que preciso de você para a fase B:**
1. Criar uma conta na Anthropic (console.anthropic.com), definir o limite de gasto e gerar uma chave de API. **Não me envie a chave pelo chat:** eu te passo onde colar, direto no intermediário.
2. Criar uma conta grátis na Cloudflare (para o intermediário).
3. Escolher o modelo do piloto. O recomendado é o Opus 5.5, pela qualidade das respostas; Sonnet 5.5 ou Haiku 4.5 custam menos.
