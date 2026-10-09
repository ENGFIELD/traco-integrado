# Plano da v2 — Traço Integrado

> Fase 2 · 07/10/2026 · base: produção `v1.1` (tag `producao-2026-10-07-v1.1`)
> Premissas já decididas com o Matheus:
> **custo zero** (plano Spark), **fotos adiadas** (o Cloudinary atual continua),
> publicação **sempre via link de teste** e depois "publica",
> **nenhum dado apagado** e migrações aditivas com `--dry-run`.

---

## 0. Resumo em 1 minuto

| Tema | Proposta |
|---|---|
| Código | Sai do `index.html` de 1,46 MB e passa para **módulos JavaScript com Vite**, sem framework. O deploy continua no Firebase Hosting. A abertura cai para cerca de 250 KB, e os modelos Excel e o pdf.js só baixam quando forem usados. |
| Dados | **`obras/{obraId}/…`**. Os dados atuais são **copiados** para `obras/belavista-ipanema/…` com os mesmos IDs. As coleções antigas ficam intactas, somente leitura, como garantia. |
| Perfis | Documento `usuarios/{uid}` com o papel **por obra**: Admin, Engenheiro, Técnico/Estagiário, Encarregado, Visualizador. As regras do Firestore conferem o papel em cada gravação. |
| Auditoria | Toda gravação leva junto, no mesmo lote, um registro em `auditoria`: quem, quando e o diff. **As regras rejeitam gravação sem auditoria.** O registro de auditoria não pode ser editado nem apagado. |
| Exclusão | **Lixeira.** Excluir marca `excluidoEm`, e a ficha some das listas, mas pode ser restaurada por 30 dias. Exclusão física só por script do Admin, depois de 30 dias e com backup antes. |
| Checklist | As respostas passam a ser gravadas por **ID fixo do item**, não pela posição. Isso é pré-requisito do editor de modelos de FVS (Fase 4.1). |
| Plano Firebase | Continua **Spark (grátis)**. Tudo acima funciona sem Cloud Functions. O consumo previsto está em cerca de 10% das cotas (seção 7). |
| Fotos | Ficam no Cloudinary atual, com o envio isolado num único módulo (`anexos.js`). Quando você decidir migrar para o Firebase Storage, basta trocar esse arquivo. |

---

## 1. Organização do código

### Por que Vite (e por que sem framework)
| Problema hoje | Com Vite + módulos |
|---|---|
| 1,46 MB baixados a cada abertura, sendo 1,1 MB de modelos Excel | Os modelos viram arquivos `.xlsx` normais em `public/modelos/`, baixados **só ao exportar** |
| pdf.js (cerca de 300 KB) carregado sempre | `import()` sob demanda, só ao abrir o mapeamento ou cadastrar uma planta |
| SDK Firebase "compat" (o mais pesado) | SDK **modular v11**, que leva só o que o app usa (cerca de 60% menor) |
| Diff ilegível no git (linhas de 50 mil caracteres) | Arquivos pequenos e revisáveis |
| Sem cache: cada abertura baixa tudo de novo | Arquivos com hash no nome, cache permanente; o HTML continua `no-cache` |
| Sem offline | Plugin PWA (Workbox) monta o service worker de verdade (Fase 3) |

**Sem React/Vue:** o app atual é JavaScript puro e funciona bem. Reescrever num framework seria trocar tudo de uma vez, com alto risco. Vite é **só a ferramenta de build**: o código continua JavaScript puro, agora dividido em arquivos. O resultado continua sendo HTML/CSS/JS estático, publicado do mesmo jeito (`dist/` em vez de `public/`).

### Estrutura proposta
```
TRAÇO INTEGRADO/
├── index.html                 casca mínima (login + raiz do app)
├── src/
│   ├── main.js                inicialização, roteamento entre telas
│   ├── firebase.js            initializeApp, auth, firestore (+ emulador no localhost)
│   ├── estado.js              obra atual, usuário, papel, caches em memória
│   ├── dados/                 TODA leitura/gravação passa por aqui
│   │   ├── repositorio.js     salvar(), excluir(), restaurar() → sempre com auditoria
│   │   ├── auditoria.js       cálculo do diff
│   │   ├── rascunho.js        autosave local (o que já existe na v1.1)
│   │   └── migracoes/         leitura tolerante de formatos antigos
│   ├── modulos/
│   │   ├── fvs/               lista, ficha, modelos (tipos), export Excel
│   │   ├── rastreabilidade/   betonadas, mapeamento, export FORM-15
│   │   ├── controle-tecnologico/
│   │   ├── nao-conformidades/
│   │   ├── plantas/
│   │   └── painel/
│   ├── ui/                    modal, toast, diálogo de confirmação, chips, ícones
│   ├── util/                  datas (fuso local), números BR, pavimentos
│   └── estilos/               tokens.css (cores/fontes atuais), componentes.css
├── public/
│   ├── modelos/               FVS-04.xlsx, FORM-15.xlsx, RVS-*.xlsx (ex-base64)
│   └── icons/, manifest.webmanifest
├── firestore.rules
├── firestore.indexes.json
├── tests/
│   ├── regras/                testes das regras no emulador (@firebase/rules-unit-testing)
│   └── e2e/                   Playwright (Fase 5)
├── scripts/                   backup, restore, seed, migração, usuários, limpeza da lixeira
└── docs/
```

### Como migrar o código sem quebrar (estratégia em 2 passos)
1. **v1.2: "mesmo app, nova embalagem".** O código atual é dividido em módulos **sem mudar comportamento**, e os modelos Excel saem do base64 para arquivos. Teste de aceite: os exports `.xlsx` gerados pela v1.2 têm de ser **idênticos byte a byte** aos da v1.1 para as mesmas fichas. Eu gero os dois e comparo automaticamente.
2. **v2.0:** multi-obra, perfis, auditoria e lixeira em cima da base já modular.

Cada passo vai primeiro ao link de teste.

---

## 2. Novo modelo de dados (multi-obra)

```
usuarios/{uid}                       perfil global (nome, cargo, e-mail, ativo)
  obras: { "belavista-ipanema": "admin", ... }   papel por obra

obras/{obraId}                        dados da obra (nome, endereço, cliente, logo, pavimentos[])
  membros/{uid}                       espelho do papel (para listar a equipe da obra)
  fvs/{id}                            ← cópia de /fvs
  rastreabilidade/{id}                ← cópia de /rastreabilidade
  controleTecnologico/{id}            ← cópia de /controleTecnologico (sem o _meta)
  plantas/{id}                        ← cópia de /plantas
  config/importacaoCT                 ← antigo controleTecnologico/_meta
  modelosFvs/{modeloId}               modelos de checklist versionados (Fase 4.1)
  locais/{localId}                    torre/bloco → pavimento → ambiente (Fase 3/4.1)
  auditoria/{id}                      log imutável (seção 4)
```

### Campos novos (aditivos) em todo documento de dados
| Campo | Tipo | Valor padrão na migração |
|---|---|---|
| `obraId` | string | `"belavista-ipanema"` |
| `criadoEm` / `atualizadoEm` | **Timestamp do servidor** | derivados de `createdAt`/`updatedAt` (ISO), que **continuam existindo** |
| `criadoPor` / `atualizadoPor` | `{uid, nome}` | `updatedByEmail` vira o uid correspondente; se não achar, `{uid:null, nome:email}` |
| `excluidoEm` / `excluidoPor` | Timestamp / `{uid,nome}` ou `null` | `null` |
| `versao` | número | `1` (incrementa a cada gravação, o que permite detectar edição simultânea) |
| `schema` | número | `2` |

Nenhum campo existente é renomeado nem removido. A v2 lê os nomes antigos e, quando houver, os novos.

### Checklist com ID fixo de item
Hoje: `checklist["0-3"]["vigas"] = "X"`, onde a chave é a posição do item no modelo.
v2: cada item de modelo ganha um `itemId` estável (ex.: `fvs04.forma.prumo`), e a ficha passa a gravar:
```
modeloId: "fvs04", modeloVersao: 1,
respostas: { "fvs04.forma.prumo": { "vigas": "X" } }
```
- A migração gera `respostas` a partir de `checklist` usando a ordem **atual** do código, a mesma que gerou os dados. `checklist` é mantido como estava.
- Ficha nova grava nos dois formatos durante a transição, para que a v1.1 continue lendo, caso seja preciso voltar.
- O export Excel passa a localizar a célula pelo `itemId`, e o layout dos modelos não muda.
- Hoje só estão em uso **FVS 04 (32 fichas)** e **Blocos (11 fichas)**, então a conversão é pequena e fácil de conferir uma a uma.

### Números da rastreabilidade
São adicionados `volumeM3`, `slumpCm`, `aguaFolgaL`, `aguaLancL` e `minutosUsinaLanc` (número), calculados dos textos atuais (vírgula ou ponto). Os campos texto continuam e seguem sendo os exibidos. Os novos servem para somas, alertas e gráficos (Fase 4.3).

### Script de migração `scripts/migrar-v2.js`
- **Idempotente:** pode rodar 10 vezes, e o resultado é o mesmo. Usa os mesmos IDs; se o destino já existe com `schema: 2`, pula.
- `--dry-run` (padrão): lista o que faria, conta documentos e mostra 3 exemplos antes/depois.
- `--aplicar`: só funciona se existir backup de **menos de 1 hora** em `backups/`.
- **Nunca grava nas coleções antigas.** Depois da migração, as regras deixam `/fvs`, `/rastreabilidade` etc. **somente leitura**: ficam como garantia por 90 dias e só são removidas com sua autorização explícita.
- Roda primeiro no emulador com a cópia dos dados; os testes comparam a contagem e todos os campos.

### Plano de volta (rollback)
| Momento | Como voltar |
|---|---|
| Antes de publicar | Nada a fazer: só o link de teste mudou |
| Logo após publicar | Republicar a v1.1. As coleções antigas estão intactas, e o que foi lançado na v2 nesse meio-tempo é copiado de volta pelo `scripts/reverter-v2.js` (com `--dry-run`) |

---

## 3. Perfis de acesso

### Onde guardar o papel: documento `usuarios/{uid}` (e não custom claims)
| | Documento `usuarios/{uid}` | Custom claims |
|---|---|---|
| Alterar papel | Pelo próprio app (tela Equipe, só Admin) | Só via script com Admin SDK (sem Cloud Functions no Spark) |
| Efeito | Imediato | Só depois que o token do usuário renova (até 1 h) |
| Custo | +1 leitura por gravação, nas regras (`get()`), irrelevante no volume de vocês | Zero |
| Papel por obra | Natural (`obras: {id: papel}`) | Limite de 1.000 bytes no token |

**Recomendação: documento.** Criar o **login** (e-mail e senha) continua sendo feito pelo console do Firebase ou por `scripts/usuarios.js`, já que o cadastro público está desligado. O app cuida só do **papel**.

### Matriz de permissões
| Ação | Admin | Engenheiro | Técnico / Estagiário | Encarregado | Visualizador (cliente / fiscalização) |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver tudo da obra | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar e editar FVS, rastreabilidade, RDO | ✅ | ✅ | ✅ | ⚠️ só RDO e pendências | ❌ |
| **Fechar** FVS e **assinar como engenheiro** | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reabrir ficha fechada | ✅ | ✅ | ❌ | ❌ | ❌ |
| Abrir NC | ✅ | ✅ | ✅ | ✅ | ❌ |
| Encerrar NC (verificação de eficácia) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Marcar pendência "corrigida" | ✅ | ✅ | ✅ | ✅ (da própria empresa) | ❌ |
| Importar planilha do laboratório / cadastrar plantas | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mandar para a lixeira | ✅ | ✅ | ⚠️ só o que ele criou, se ainda aberto | ❌ | ❌ |
| Restaurar da lixeira | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar modelos de FVS, equipe e papéis | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver auditoria (histórico) | ✅ | ✅ | ✅ (do registro) | ❌ | ❌ |
| Exportar Excel/PDF | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Excluir definitivamente** | ❌ ninguém pelo app (só script do Admin, após 30 dias, com backup) |

### O que as regras garantem (resumo)
- Sem login ou sem papel na obra, **nada** é lido.
- `delete` é **proibido para todos** nas coleções de dados; excluir é sempre `update` com `excluidoEm`.
- `atualizadoEm == request.time` (horário do servidor, não do celular) e `atualizadoPor.uid == request.auth.uid` (ninguém grava em nome de outro).
- `versao` tem de ser a anterior + 1. Isso **bloqueia a sobrescrita silenciosa** entre duas pessoas: quem salvar por último recebe "esta ficha foi alterada por Fulano às 14:32. Ver diferenças?".
- Campos com tipo e tamanho validados (strings de até 5.000 caracteres, listas de até 300 itens).
- Ficha fechada só muda com papel Engenheiro ou Admin.
- `usuarios/{uid}`: cada um lê o próprio; só Admin altera `obras` (papéis), e **ninguém pode se promover**.

### Testes das regras (no emulador)
`tests/regras/*.test.js` com `@firebase/rules-unit-testing`: **um teste por linha da matriz**, de cada papel, em sentido positivo e negativo. Exemplos: "Visualizador não grava", "Técnico não fecha ficha", "ninguém apaga", "gravar sem auditoria é rejeitado", "atualizadoEm do celular é rejeitado". Esses testes rodam antes de **toda** publicação.

---

## 4. Auditoria e lixeira (sem Cloud Functions)

Sem Functions, não existe gatilho no servidor. A solução é **o próprio app gravar a auditoria, e as regras recusarem qualquer gravação que venha sem ela**:

```
lote atômico (batch):
  1. obras/X/fvs/abc            ← dados + ultimaAuditoria: "aud_123"
  2. obras/X/auditoria/aud_123  ← { colecao, docId, acao, por{uid,nome}, em: serverTime,
                                    diff: { campo: [antes, depois], ... } }
regras:
  fvs: só aceita se existsAfter(auditoria/aud_123) e o registro aponta para este doc
  auditoria: só create; por.uid == auth.uid; em == request.time; update/delete proibidos
```
- **Diff:** só os campos que mudaram, com caminho legível (ex.: `respostas › Prumo › Vigas: "" → "X"`), limitado a 20 KB por registro.
- **Ações registradas:** `criar`, `editar`, `fechar`, `reabrir`, `excluir` (lixeira), `restaurar`, `vincular`, `importar`.
- **Tela "Histórico"** em cada ficha: linha do tempo com quem, quando e o que mudou.
- **Lixeira:** tela própria com o que foi excluído nos últimos 30 dias, por quem, e o botão Restaurar. Depois de 30 dias continua lá, marcado como "vencido". A limpeza definitiva é feita por `scripts/limpar-lixeira.js` (`--dry-run` + backup obrigatório), **só quando você pedir**.
- **Funciona offline:** o lote vai inteiro para a fila e é aplicado de uma vez quando o sinal volta.

---

## 5. Plano do Firebase, custos e fotos

**Hoje: Spark (grátis), confirmado.** Nada desta fase exige o Blaze.

| Item | Situação |
|---|---|
| Hosting | 10 GB armazenados e 360 MB/dia de tráfego grátis. A v2 com cache fica em menos de 1 MB por usuário por dia |
| Firestore | Ver seção 7 |
| Authentication | Grátis até 50 mil usuários ativos por mês |
| Fotos e anexos | **Cloudinary atual**, sem mudança. O código de envio fica isolado em `src/dados/anexos.js` (uma função `enviarArquivo()`) |

**Quando você quiser fotos de verdade (Fase 3 ou 4):**
- **Opção A, Blaze + Storage:** custo previsto em torno de R$ 0, com cerca de 1,6 GB por ano em 10 fotos/dia a 2048 px; os 5 GB grátis duram cerca de 3 anos.
  - Configurar **alerta de orçamento de R$ 10** (Google Cloud → Faturamento → Orçamentos e alertas, avisos em 50%, 90% e 100%).
  - Bucket em `us-east1`.
  - Regras: só usuário logado, só imagem ou PDF, até 10 MB.
- **Opção B, sem cartão:** Cloudinary + Google Apps Script como "porteiro" (assina o envio e confere o login), com cópia automática para o PC.
- Nos dois casos, as fotos antigas são copiadas para o novo destino e os links antigos continuam funcionando.

---

## 6. Backups automáticos (sem custo)

- **Tarefa agendada do Windows** (“Ao fazer logon” e diariamente às 12h): roda `backup-firestore.js` e guarda os últimos 30 backups diários e 12 mensais em `backups/`.
- **Antes de toda publicação ou migração:** backup obrigatório. O script de deploy (`scripts/publicar.ps1`) recusa seguir sem backup recente.
- **Restore testado:** já validado no emulador (523/523 documentos em 07/10).
- **Mais tarde:** copiar `backups/` para o Google Drive pelo "Drive para computador", para ter uma cópia fora do PC, também de graça.

---

## 7. Cotas gratuitas do Firestore: estimativa

| Cota Spark / dia | Limite | v1.1 hoje (estimado) | v2 (estimado) |
|---|---|---|---|
| Leituras | 50.000 | Cada abertura do app lê **todos** os ~525 docs (incluindo os 429 do CT). Com 4 pessoas × 8 aberturas, dá **~17.000/dia (34%)** | Persistência offline + cache + CT só quando a tela é aberta: **~2.000 a 4.000/dia (≤ 8%)** |
| Gravações | 20.000 | < 200 | < 500 (auditoria dobra as gravações; continua desprezível) |
| Armazenamento | 1 GiB | ~0,5 MB | Cerca de 20 MB/ano com auditoria |

**Achado importante:** do jeito que está hoje, cada abertura do app já consome cerca de 525 leituras. Com a equipe crescendo para 10 pessoas, o sistema chegaria perto do limite diário, e o Firestore **para de responder até a meia-noite** (horário do Pacífico) quando a cota grátis acaba. A v2 resolve isso com:
- cache offline (só baixa o que mudou);
- telas pesadas carregadas sob demanda;
- listas paginadas (ex.: auditoria e CT de 50 em 50);
- **`firestore.indexes.json`** com os índices das consultas novas (por obra, situação, data, pavimento).

---

## 8. Ordem de execução proposta

| Etapa | Entrega | Vai ao ar? |
|---|---|---|
| **2.1** | Projeto Vite + módulos (v1.2: mesmo comportamento) + modelos Excel como arquivos + teste de exports idênticos | Link de teste e depois "publica" |
| **2.2** | `usuarios`, papéis, regras novas + testes das regras | Só no emulador |
| **2.3** | Repositório com auditoria, lixeira, versão e `serverTimestamp` | Só no emulador |
| **2.4** | `migrar-v2.js` (dry-run e depois emulador com cópia) + checklist por `itemId` | Só no emulador |
| **2.5** | Telas: Equipe (papéis), Histórico, Lixeira, seletor de obra | Link de teste |
| **2.6** | **Virada:** backup, migração em produção, publicação da v2, regras novas | Com sua autorização, num fim de dia sem concretagem |

Depois vem a **Fase 3** (offline completo, PWA, layout mobile da prévia, fotos e assinatura).

---

## 8.1 Andamento

| Etapa | Situação |
|---|---|
| 2.1 | ✅ **Publicada (v1.2)** em 07/10/2026. 86/86 exports idênticos à v1.1. Junto foi o editor de mapeamento em tela cheia, com correção: áreas nunca eram salvas porque o Firestore não aceita lista dentro de lista. |
| 2.2 | ✅ Concluída no emulador em 07/10/2026: `firestore.v2.rules` + **40 testes** (`npm run test:regras`, 40/40 ok); `scripts/usuarios.js definir-papeis` (simulação conferida contra as 4 contas reais, **nada gravado em produção**). |
| 2.3 | Em andamento. **v1.28 (fase A do plano de arquitetura):** porteiro único de gravação (`src/modulos/dados/porteiro.js`: toda gravação carimba quando/quem e passa pela checagem de "só visualização"); excluir FVS, rastreabilidade e planta vai para a lixeira (`excluido:true`, nada é apagado); sincronização que baixa só o que mudou em FVS, rastreabilidade, plantas, aço e tarefas (`src/modulos/dados/sincronia.js`); teste de ponta a ponta no navegador (`tests/e2e/roteiro.mjs`) rodando em todo pull request. Falta: histórico de alterações (auditoria), tela da lixeira e horário do servidor. **v1.29 (fase A1):** `src/main.js` de 7.310 para 4.392 linhas — saíram para módulos o catálogo das FVS (`modulos/fvs/catalogo.js`), formatos de data/texto (`modulos/comum/formatos.js`), ferramentas de XML do Excel (`modulos/exportar/xlsx-xml.js`), exportação nos modelos oficiais (`modulos/exportar/modelos-excel.js`), relatório de NC em Word (`modulos/nc/relatorio-word.js`) e a tela do controle tecnológico (`modulos/ct/tela-ct.js`). Exportações conferidas idênticas às da v1.28 (Excel byte a byte; Word igual fora a hora de emissão). |
| 2.3+ | **v1.30 (fase B do plano de arquitetura):** histórico de alterações — o porteiro registra cada gravação (quem, quando, ação, campos que mudaram) em `auditoria/AAAA-MM-DD` (um documento por dia, lista que só cresce; regras em `firestore.rules`); telas **Histórico** (filtros por período, pessoa, área, busca, e "Ver histórico" em cada ficha) e **Lixeira** (restaurar); backup diário automático (`.github/workflows/backup-diario.yml`, 90 dias) e a publicação só faz backup se não houver um das últimas 20 h (economia da cota grátis). Falta: tela Equipe com os perfis no banco (B1). |

**Levar para a v2 (2.4–2.6), surgidos nas v1.5–v1.9:** coleções `entregasAco`, `cronogramas` (inclui `progresso` e `p_<data>`) e `planilhasModelo` precisam entrar em `firestore.v2.rules`; a lista de contas só de visualização que está em `firestore.rules` (v1.9, Jéssica) passa a ser o papel `visualizador`.

**Limitação conhecida da 2.2:** hoje as NCs ficam dentro da ficha FVS (lista `naoConformidades`). Por isso a regra "só Engenheiro/Admin encerra NC" é garantida **pela tela**, não pelo banco. Ela passa a ser garantida pelo banco quando as NCs ganharem coleção própria (Fase 4.2).

## 9. Decisões (aprovadas pelo Matheus em 07/10/2026)

| # | Decisão |
|---|---|
| 1 | Vite + módulos, sem framework: **aprovado** |
| 2 | Papéis iniciais da obra `belavista-ipanema` (contas conferidas no Firebase Auth: só estas 4 existem): |
|   | `matheus.alves@sig.eng.br`: Estagiário / Desenvolvedor, **admin** |
|   | `suellen.alves@sig.eng.br`: Engenheira Civil, **admin** (controle total) |
|   | `alice.soares@sig.eng.br`: Estagiária, **tecnico** (edita FVS, rastreabilidade e CT) |
|   | `jessica.araujo@sig.eng.br`: Analista de Qualidade, **visualizador** |
| 3 | Lixeira de 30 dias, exclusão definitiva só por script do Admin: **aprovado** |
| 4 | Coleções antigas somente leitura por 90 dias depois da virada: **aprovado** |
| 5 | Matriz de permissões da seção 3: **aprovada sem mudanças** |
| 6 | ID da obra `belavista-ipanema`: **aprovado** |

### Perguntas originais


1. **Vite + módulos (sem framework):** aprova?
2. **Papéis da equipe atual:** me passe os 4 e-mails e o papel de cada um (Admin, Engenheiro, Técnico/Estagiário, Encarregado ou Visualizador). Hoje só 1 e-mail aparece como autor das edições.
3. **Lixeira de 30 dias** com exclusão definitiva só por script do Admin: ok?
4. **Coleções antigas guardadas como somente leitura por 90 dias** depois da virada: ok, ou prefere outro prazo?
5. **Matriz de permissões (seção 3):** quer mudar algo? Exemplos: o Encarregado poder criar FVS, ou o Técnico poder fechar ficha.
6. **ID da obra:** `belavista-ipanema` está bom?
