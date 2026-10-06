# Diagnóstico técnico — Traço Integrado v1

> Data: 06/10/2026 · Base analisada: tag `v1-original` (build `2026-09-23b`)
> Escopo: leitura completa do código + regras do Firestore publicadas + configuração do Hosting.
> Nada foi alterado no sistema em produção durante este diagnóstico.

---

## 1. Estrutura de arquivos

```
traco-integrado/
├── index.html              1,44 MB — o sistema INTEIRO (HTML + CSS + JS) num arquivo só
│   ├── ~650 linhas de CSS
│   ├── ~4.200 linhas de JS (IIFE única, sem módulos)
│   ├── 4 logos SIG em base64 (~177 KB) — clara/escura, repetidas no login e no cabeçalho
│   └── 16 modelos .xlsx em base64 (~1,1 MB) — FVS-04, FORM-15 e 14 tipos de FVS/RVS
├── index-1.html            1,43 MB — cópia antiga do index (publicada no site, sem uso)
├── firebase-config.js      chaves públicas do app web (normal ficarem expostas)
├── firebase.json           Hosting com "public": "."  ← publica a pasta inteira
├── .firebaserc             projeto: traco-integrado-sig
├── manifest.json / sw.js   PWA mínima (o SW não faz cache nenhum)
├── icon-*.png, favicon-*, apple-touch-icon.png
├── 404.html                página padrão do Firebase, em inglês
├── PLACEHOLDER             PNG de 111 KB sem extensão (sobra)
├── Guia_Atualizacao_...docx
├── FVS'S/                  17 planilhas .xls/.xlsx originais dos modelos
├── PLANTAS/                16 PDFs de projeto estrutural (formas) — ~65 MB
├── backups/                7 cópias antigas do index.html
├── Claude outputs/         3 screenshots
└── scripts/                (novo, Fase 0) backup/restore do Firestore
```

Dependências externas, todas carregadas de CDN em tempo de execução:
Firebase 10.13 compat (app/auth/firestore), `xlsx-js-style@1.2.0`, `jszip@3.10.1`, `pdfjs-dist@3.11.174`, Google Fonts (Big Shoulders Display, IBM Plex Sans/Mono). Uploads de fotos e plantas vão para o **Cloudinary** (cloud `uyzrizru`, preset sem assinatura `Fotos FVS`).

Plano Firebase: **Spark** (faturamento desativado). Não há Storage, Functions nem regras versionadas no repositório (`firebase.json` só tem `hosting`).

---

## 2. Modelo de dados atual (Cloud Firestore)

Todas as coleções ficam na raiz, sem separação por obra e sem dono por registro.

### `fvs/{autoId}` — Fichas de Verificação de Serviço
| Campo | Tipo | Observação |
|---|---|---|
| `tipo` | string | `"fvs04"` ou chave de `FVS_TIPOS` (`estaca_raiz`, `bloco`…). Fichas antigas sem campo → tratado como `fvs04` |
| `codigo`, `numero`, `descricao`, `obra`, `local` | string | `local` é texto livre |
| `pavimentos` | string[] | “chips”; fichas antigas não têm → cai no `local` |
| `unidades` | string[] | estacas/sapatas/trechos (tipos dinâmicos) |
| `dataAbertura`, `dataConcretagem`, `dataFechamento` | string `AAAA-MM-DD` | |
| `inspecionadoPor`, `engenheiro` | string | só nome digitado, sem vínculo com usuário |
| `elementos` | `{pilares:bool, vigas:bool, …}` | só FVS 04 |
| `checklist` | `{ "cat-item": { grupo: "NA"\|"P"\|"X"\|"V" } }` | chave **posicional** (`"0-3"` = categoria 0, item 3); grupo = elemento, nome da unidade ou `_unico` |
| `naoConformidades` | array de `{descricao, correcao, concluida, dataConclusao, dataRegistro, anexos[{url,nome,tipo,tamanho,adicionadoEm}]}` | |
| `houveNC`, `ncDescricao`, `ncCorrecao`, `ncDataCorrecao` | legado | convertidos na leitura (`fichaNaoConformidades`) |
| `observacoes` | string | |
| `fechado` | bool | |
| `rastreabilidadeId` | string\|null | vínculo 1-1 com `rastreabilidade` |
| `createdAt`, `updatedAt` | string ISO | gerados no **relógio do celular**, não do servidor |
| `updatedByEmail` | string | último a salvar |

### `rastreabilidade/{autoId}` — FORM-15
`numero, obra, blocoPav, pavimentos[], data, projetoReferencia, slumpAprovado, fckSolicitado, acoesCorretivas, responsavelColeta, engenheiro, fechado, dataFechamento, fvsId, createdAt, updatedAt, updatedByEmail`
- `linhas[]` (betonadas): `seq, notaFiscal, betoneira, lacre, volBetoneira, volAcumulado, fornecedor, nSerieCP, nCPs, slump, saidaUsina, chegadaObra, lancInicial, lancFinal, aguaFolga, aguaLanc, pecas` — **tudo string**, inclusive volumes e slump.
- `mapeamento`: `{plantaUrl, plantaNome, pagina, areas[{pontos[[x,y]], linhaSeq, cor}]}` (planta PDF no Cloudinary).

### `controleTecnologico/{"nf_"+notaRemessa}` — importado da planilha do laboratório
`notaRemessa, local, volume, fck, laboratorio, concreteira, dataConcretagem, numCps, slump, data7/14/28/63, cpsConforme, r3, r7, r7b, r14, r14b, r28, r28b, r63, r63b, observacao, criadoEm, atualizadoEm, atualizadoPor`
- Documento especial `_meta` (última importação) fica **na mesma coleção** dos dados.

### `plantas/{id}`
Prevista nas regras, mas **não é usada** pelo código atual.

Não existem coleções de usuários, obras, perfis ou auditoria.

---

## 3. Regras de segurança do Firestore (publicadas em 23/09/2026)

```
fvs, rastreabilidade, controleTecnologico, plantas:
    allow read, write: if request.auth != null;
qualquer outra coleção: negado
```

Teste feito: acesso **sem login** às 4 coleções → `403` (bloqueado). ✅

### Falhas
1. **Qualquer usuário logado pode apagar tudo.** `write` inclui `delete`, e não há papéis. Um celular perdido com a sessão aberta, ou um usuário mal-intencionado, apaga todas as fichas com um script de 5 linhas. A exclusão é física e não há lixeira nem histórico (ver 6.1).
2. **Não há validação de dados.** Qualquer campo, de qualquer tipo e tamanho, é aceito. Um cliente com erro pode gravar `checklist: null` e “quebrar” a ficha para todos.
3. **Não há autoria confiável.** `updatedByEmail` e `updatedAt` vêm do navegador e podem ser falsificados; não servem como trilha de auditoria para PBQP-H.
4. **⚠️ A VERIFICAR NO CONSOLE: o cadastro público pode estar aberto.** A `apiKey` é pública (isso é normal). Mas, se em *Authentication → Configurações → Ações do usuário* a opção **“Ativar criação (inscrição)”** estiver ligada, qualquer pessoa cria uma conta pela API e, pela regra acima, passa a **ler e apagar todos os dados**. Não consegui confirmar isso daqui; confira e desligue. É o item mais urgente deste documento.
5. As regras existem só no console, não no repositório: não há versionamento nem testes, e um `firebase deploy` futuro com outro arquivo pode sobrescrevê-las.

---

## 4. Bugs encontrados

| # | Bug | Onde | Efeito |
|---|---|---|---|
| B1 | **Fichas somem da lista.** A consulta é `fvs.orderBy("dataConcretagem").limit(500)`, e o Firestore **exclui** documentos que não têm o campo usado no `orderBy`. O mesmo vale para `rastreabilidade.orderBy("data")`. | `subscribeCollections` | FVS antigas ou importadas sem `dataConcretagem` não aparecem em lugar nenhum. A partir de 500 registros, os mais antigos também somem, sem aviso. |
| B2 | **Data “de amanhã” à noite.** `todayISO()` usa `toISOString()`, que é UTC. No Rio (UTC-3), entre 21h e 0h retorna o dia seguinte. | `todayISO` | Data de abertura, fechamento e registro de NC errada em concretagens noturnas; “dias em aberto” e pendências de CP calculados com 1 dia de diferença. |
| B3 | **Salvamento sobrescreve o documento inteiro** com `set(draft.data)` a partir de uma cópia feita ao abrir o modal. | `saveDraft` | Duas pessoas editando a mesma ficha: a última apaga o que a outra fez, sem aviso. |
| B4 | **Erros de salvamento são silenciosos.** `saveDraft`, exclusão e vínculos são `async` sem `try/catch`. | `saveDraft`, `persistLink`… | Sem rede ou com permissão negada, o modal fecha (ou fica parado) e o usuário acha que salvou. |
| B5 | **Exclusão deixa vínculo órfão.** Excluir uma FVS não limpa `rastreabilidade.fvsId` (e vice-versa). | `btn-delete` | A rastreabilidade continua “vinculada” a algo que não existe e não aparece mais no seletor “Vincular existente” (filtro `!r.fvsId`). |
| B6 | **Vincular não desfaz o vínculo anterior.** `persistLink` grava os dois lados, mas não limpa o parceiro antigo, se existia. | `persistLink` | Vínculos cruzados e inconsistentes. |
| B7 | **Listener duplicado.** `subscribeCollections` cancela `unsubFvs` e `unsubRast`, mas não `unsubCt`. | `subscribeCollections` | Em re-login sem recarregar a página, a coleção CT é escutada duas vezes (mais leituras e renders). |
| B8 | **Respostas do checklist dependem da posição.** As chaves `"categoria-item"` são índices. Inserir ou remover um item de um modelo desloca as respostas das fichas já preenchidas para o item errado. | `FVS_CHECKLIST`, `FVS_TIPOS` | Hoje é latente; fica **crítico** na Fase 4.1 (modelos configuráveis). |
| B9 | **Renomear ou remover unidade perde respostas.** As respostas são gravadas pelo nome digitado (`"Estaca 3"`). | tipos dinâmicos | Dados órfãos no `checklist` e respostas “sumindo” ao corrigir um nome. |
| B10 | Inconsistência no reconhecimento de pavimento: o código `201` vira rank 6, mas o texto “1º Pav Tipo” vira rank 7. | `pavimentoRank` | A mesma laje pode cair em dois grupos diferentes nos filtros e relatórios (confirmar a numeração oficial com a obra). |
| B11 | Os números da rastreabilidade (volume, slump, água) são texto livre. | `blankLinha` | Não dá para somar volume nem validar slump ou água; vírgula vs. ponto. |
| B12 | `_meta` dentro de `controleTecnologico` e limite de 2.000 documentos sem paginação. | CT | O mesmo problema de B1 quando passar de 2.000 traços. |

---

## 5. Gargalos de performance

1. **1,44 MB de HTML em todo acesso, em 4G de canteiro.** 1,1 MB são os modelos Excel em base64, que só são usados ao clicar em “Exportar”. Base64 de .zip quase não comprime: são cerca de 1 MB trafegado e todo o JS é interpretado antes da tela de login.
2. **Nada é cacheado.** O service worker repassa tudo para a rede, e não há `Cache-Control` configurado no Hosting. Cada abertura do app baixa tudo de novo.
3. **Um único script bloqueante de 4.200 linhas, mais 6 bibliotecas de CDN** (pdf.js tem cerca de 300 KB e só serve para o mapeamento), todas carregadas no início.
4. **Re-render total a cada evento:**
   - qualquer alteração no banco reconstrói lista, KPIs e a tela aberta (`render()` chama `buildRows()` três a quatro vezes);
   - cada toque em NA/P/X/V recria o HTML inteiro do modal;
   - na rastreabilidade, “+ Adicionar betonada” **baixa e renderiza o PDF da planta de novo** a cada clique.
5. **Escuta tudo em tempo real** (500 + 500 + 2.000 documentos) assim que faz login, mesmo para quem só quer ver o painel. Com o tempo, isso consome a cota gratuita de leituras.
6. As fotos do relatório Word são baixadas do Cloudinary na hora; com muitas NCs, o relatório demora.

---

## 6. Riscos de perda de dados

1. **Exclusão física e definitiva** (“Excluir definitivamente este registro?”), sem lixeira, sem histórico e sem backup automático. Hoje **não existe nenhum backup dos dados** (o script da Fase 0 ainda não foi rodado).
2. **Tocar fora do modal ou apertar Esc fecha a ficha e descarta tudo o que foi digitado, sem perguntar.** No celular o modal é uma folha que sobe de baixo, e um toque na faixa escura de cima já apaga o rascunho. Não há rascunho salvo localmente.
3. **Sem persistência offline.** Sem sinal (subsolo), o Firestore em memória até enfileira a gravação, mas:
   - se a aba ou o app for fechado antes de voltar o sinal, **a alteração se perde**;
   - não há indicador de “pendente de envio”: o selo “sincronizado” só reflete o login, não a conexão real.
4. Sobrescrita entre usuários (B3) e falhas silenciosas (B4).
5. **Fotos e plantas fora do Google.** Ficam no Cloudinary com preset sem assinatura:
   - qualquer pessoa que leia o código pode enviar arquivos para a conta (abuso de cota);
   - as URLs são públicas (qualquer um com o link vê a foto);
   - fotos removidas no app continuam lá;
   - se a conta gratuita for suspensa ou excluída, todas as evidências das NCs somem dos relatórios.
6. Datas de auditoria vindas do relógio do celular (`nowISO()`), que pode estar errado.

---

## 7. Problemas de UX no celular

1. **Rastreabilidade no celular é praticamente inutilizável.**
   - A tabela de betonadas tem 18 colunas e `min-width:1180px`: é preciso rolar para os lados dentro de um modal.
   - Inputs de 64px.
   - O botão ✕ “remover linha” fica colado nos campos e não pede confirmação.
2. **Alvos de toque pequenos:**
   - botões NA/P/X/V de 34×30 px (40×36 no celular), com 4 px de espaço entre eles; com luva, erra-se o botão;
   - ✕ de anexo com 18 px;
   - chips de 7 px de padding.
3. **Navegação:**
   - abas no topo com rolagem horizontal escondida;
   - em telas pequenas, o cabeçalho (logo + sync + usuário + tema + instalar + sair + 5 abas + 2 botões) ocupa boa parte da tela e é `sticky`;
   - não há navegação inferior.
4. **Botões “← Voltar” sempre levam ao Painel**, não à tela anterior. O botão Voltar do Android fecha o app em vez de fechar o modal.
5. **Rodapé do modal:**
   - “Excluir” fica ao lado de “Exportar” e na mesma linha de “Salvar”;
   - não há “Salvar” fixo enquanto se rola uma ficha longa (o rodapé é `sticky`, mas com `flex-wrap` vira duas linhas e cobre conteúdo).
6. **Diálogos nativos** `alert()`/`confirm()` com aparência do sistema operacional, fora da identidade visual.
7. **Download no iPhone com o app instalado** (modo standalone): `a.download` com blob abre a pré-visualização e às vezes não oferece “Salvar em Arquivos”. É preciso usar a Web Share API (`navigator.share({files})`). *Testar em aparelho real.*
8. **Fontes Wingdings 2** para ✓ não existem em Android/iOS: aparece a letra “P” ou “V” crua.
9. **Sem feedback de salvamento:** não há spinner nem toast de “salvo”; o botão não é desativado durante o envio, e dois toques criam **duas fichas** (`col.add` duas vezes).
10. `theme-color` diferente entre o HTML (`#141414`) e o manifest (`#1C4E63`), e a splash do iOS não está configurada.
11. A tela de login não tem “mostrar senha”, e a mensagem de erro de rede pode confundir em subsolo.

---

## 8. Segurança e privacidade (além das regras)

| Item | Risco |
|---|---|
| **`firebase.json` com `"public": "."`** publica na internet: `PLANTAS/` (65 MB de projeto estrutural), `FVS'S/`, `backups/` (7 versões antigas do código), `Guia_...docx`, `index-1.html`, `PLACEHOLDER`, `Claude outputs/` | Projeto estrutural e documentos internos acessíveis a quem adivinhar a URL (ex.: `/PLANTAS/PDM-EST-EX-009-PB-TIP-FORM_R02.PDF`). Se uma chave de serviço ou backup do Firestore for salvo dentro da pasta, **também seria publicado** no próximo deploy. |
| Preset Cloudinary sem assinatura no código | Upload anônimo para a conta; fotos de obra com URL pública. |
| Sem cabeçalhos de segurança (CSP, X-Frame-Options, etc.) | O app pode ser embutido em iframe de terceiros (clickjacking). Baixo impacto. |
| Uso consistente de `escapeHtml` nos `innerHTML` | ✅ Não encontrei XSS evidente. `href` de anexos aceita qualquer URL salva no banco, o que é baixo risco hoje, porque só usuários logados gravam. |

---

## 9. Dívida técnica

1. **Monólito de 1,44 MB:**
   - HTML, CSS, JS, imagens e 16 planilhas num arquivo só;
   - impossível revisar diffs no git (linhas de 50 mil caracteres);
   - qualquer mudança de CSS exige baixar de novo o 1 MB de modelos;
   - há cópias manuais do arquivo em `backups/` no lugar de versionamento.
2. **Sem testes, sem lint, sem build.** Nenhum teste de regras, de exportação Excel ou E2E. As exportações dependem de endereços de célula escritos à mão (`FVS_LAYOUTS`), e um modelo atualizado quebra sem ninguém perceber.
3. **Firebase SDK “compat” (v8 API)**, mais pesado e sem tree-shaking. A versão modular reduz cerca de 60% do JS do Firebase.
4. **Regras de negócio espalhadas na UI:**
   - `fvsStatus`, `rastStatus` e as pendências de CT são calculados no cliente a cada render, sem estado persistido;
   - não há como consultar no banco “NCs vencidas”.
5. Checklists (`FVS_CHECKLIST`, `FVS_TIPOS`) estão **no código**: criar um tipo de FVS exige programador e deploy.
6. Datas como string, números como string, e timestamps do cliente em vez de `serverTimestamp()`.
7. Estado global mutável (`draft`, `mapaEstado`, `filters`) compartilhado por todas as telas.
8. Obra fixa no código (`DEFAULT_OBRA`): **não suporta uma segunda obra**.
9. Arquivos mortos: `index-1.html`, `PLACEHOLDER`, coleção `plantas` nas regras sem uso, `404.html` padrão em inglês.
10. O controle tecnológico depende do layout exato da planilha do laboratório (colunas fixas a partir da linha 7). Se o laboratório mudar uma coluna, a importação grava dados no campo errado sem avisar.

---

## 10. Lista priorizada

### 🔴 Crítico (resolver antes de qualquer funcionalidade nova)
| # | Item | Seção |
|---|---|---|
| C1 | Conferir e **desligar o cadastro público** no Firebase Auth (*Ações do usuário → Ativar criação*) | 3.4 |
| C2 | **Rodar o backup do Firestore** (script da Fase 0) e agendar backup periódico | 6.1 |
| C3 | Tirar do site público `PLANTAS/`, `FVS'S/`, `backups/`, docx e cópias: Hosting passa a publicar só uma pasta `public/` (ou `dist/`) | 8 |
| C4 | Fichas que **não aparecem** (`orderBy` sem o campo + `limit(500)`) | B1 |
| C5 | **Rascunho perdido** ao tocar fora do modal ou apertar Esc; criar autosave local | 6.2 |
| C6 | Exclusão física → **lixeira (soft delete)** + regras que proíbem `delete` direto | 3.1, 6.1 |

### 🟠 Alto
| # | Item | Seção |
|---|---|---|
| A1 | Regras por perfil, validação de campos e versionamento das regras no repositório, com testes no emulador | 3 |
| A2 | Erros de salvamento visíveis, botão bloqueado durante o envio (evita fichas duplicadas) e toast de confirmação | B4, 7.9 |
| A3 | Sobrescrita entre usuários: gravar com `update` por campo, em transação ou com verificação de versão | B3 |
| A4 | Persistência offline real (IndexedDB) + indicador de “X alterações pendentes” | 6.3 |
| A5 | Data local correta (`todayISO`) e `serverTimestamp()` nos campos de auditoria | B2, 6.6 |
| A6 | Chaves estáveis no checklist (id por item) **antes** do editor de modelos da Fase 4.1, com migração | B8, B9 |
| A7 | Decidir o destino das fotos: Cloudinary assinado vs. Firebase Storage (Blaze), ver Fase 2 | 6.5 |
| A8 | Separar o monólito e carregar os modelos Excel e o pdf.js só quando forem usados (−1,1 MB na abertura) | 5.1, 9.1 |
| A9 | Rastreabilidade no celular em formato de **cartões por betonada**, não tabela de 18 colunas | 7.1 |

### 🟡 Médio
| # | Item | Seção |
|---|---|---|
| M1 | Vínculos órfãos e vínculo anterior não desfeito | B5, B6 |
| M2 | Listener CT duplicado; `_meta` separado da coleção | B7, B12 |
| M3 | Campos numéricos da rastreabilidade como número (volume, slump, água), com migração | B11 |
| M4 | Reconhecimento de pavimento (201 vs. “1º Pav Tipo”): substituir o texto livre pelo cadastro estruturado torre → pavimento → local | B10 |
| M5 | Alvos de toque ≥ 44 px, navegação inferior, Voltar do Android fechando o modal, diálogos próprios no lugar de `alert`/`confirm` | 7 |
| M6 | Download no iOS via Web Share API; trocar Wingdings por ícones SVG | 7.7, 7.8 |
| M7 | Re-render do modal inteiro e PDF recarregado a cada clique | 5.4 |
| M8 | Validar o cabeçalho da planilha do laboratório antes de importar | 9.10 |
| M9 | Limpeza: `index-1.html`, `PLACEHOLDER`, 404 em português, `theme-color` consistente, cabeçalhos de segurança no Hosting | 9.9, 7.10, 8 |

---

### Próximo passo
Com a sua aprovação, sigo para a **Fase 2 (Arquitetura e plano, `docs/PLANO_V2.md`)**. Os itens **C1 e C2 dependem de você** (console do Firebase e chave de serviço) e convém fazê-los já, independentemente das fases.
