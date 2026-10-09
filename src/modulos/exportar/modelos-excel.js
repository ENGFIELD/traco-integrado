/* Exportação das FVS e da rastreabilidade (FORM-15) para Excel nos modelos
 * oficiais da SIG, com as assinaturas. Separado do main.js na v1.29 (fase A1). */
import { ensureAlignStyle, ensureColoredStyle, ensureWrapStyle, linhasQuebradas, safeName, triggerDownload, xmlAddMerge, xmlAddPageSetupLandscape, xmlGetCellStyleId, xmlRemoveMergesWithin, xmlSetCellRich, xmlSetCellStyleId, xmlSetCellText, xmlSetRowHeight } from "./xlsx-xml.js";
import { diffMin, fmtDateBR, fmtMin } from "../comum/formatos.js";
import { FVS_CHECKLIST, FVS_ELEMENTOS, TEMPO_MAX_MIN, getFvsTipo } from "../fvs/catalogo.js";
import { carregarModelo } from "../../libs.js";
import { adicionarAssinaturasXlsx, centralizarImagemNaCaixa } from "../assinatura/xlsx-assinatura.js";

// O que este módulo usa do app principal (ligado por iniciarModelosExcel() no main.js).
let ctx = null;
export function iniciarModelosExcel(c) { ctx = c; }

/* ---------------- Excel export — modelos oficiais reais ---------------- */
// Os dois arquivos que o Matheus enviou (FVS-04 e FORM-15) ficam embutidos aqui como
// base64. Em vez de reconstruir a planilha do zero, abrimos o arquivo original de
// verdade com o SheetJS e só escrevemos os valores nas células certas — layout,
// bordas, textos fixos, legenda e numeração de página continuam exatamente como no
// modelo oficial; só os campos preenchidos pelo usuário entram no lugar certo.
var FVS_TEMPLATE_B64 = "/modelos/FVS_TEMPLATE_B64.xlsx";
var RAST_TEMPLATE_B64 = "/modelos/RAST_TEMPLATE_B64.xlsx";

// Modelos oficiais .xlsx (convertidos a partir dos .xls originais enviados) dos
// 10 novos tipos de FVS, embutidos como base64 do mesmo jeito que o FVS_TEMPLATE_B64
// acima — preservam 100% do layout, bordas, cores, logo e paginação originais;
// exportFvsXlsxFromTemplate() só escreve texto/cor nas células certas.
var FVS_TPL_locacao_obra = "/modelos/FVS_TPL_locacao_obra.xlsx";
var FVS_TPL_escavacao = "/modelos/FVS_TPL_escavacao.xlsx";
var FVS_TPL_estaca_metalica = "/modelos/FVS_TPL_estaca_metalica.xlsx";
var FVS_TPL_estaca_raiz = "/modelos/FVS_TPL_estaca_raiz.xlsx";
var FVS_TPL_estaca_helice = "/modelos/FVS_TPL_estaca_helice.xlsx";
var FVS_TPL_estaca_escavada = "/modelos/FVS_TPL_estaca_escavada.xlsx";
var FVS_TPL_estaca_franki = "/modelos/FVS_TPL_estaca_franki.xlsx";
var FVS_TPL_sapata_isolada = "/modelos/FVS_TPL_sapata_isolada.xlsx";
var FVS_TPL_radier_armado = "/modelos/FVS_TPL_radier_armado.xlsx";
var FVS_TPL_bloco = "/modelos/FVS_TPL_bloco.xlsx";
var FVS_TPL_impermeabilizacao_rigida = "/modelos/FVS_TPL_impermeabilizacao_rigida.xlsx";
var FVS_TPL_montagem_estrutura_metalica = "/modelos/FVS_TPL_montagem_estrutura_metalica.xlsx";
var FVS_TPL_parede_diafragma = "/modelos/FVS_TPL_parede_diafragma.xlsx";
var FVS_TPL_cortina_atirantada = "/modelos/FVS_TPL_cortina_atirantada.xlsx";
var FVS_TPL_preservacao_produto_acabado = "/modelos/FVS_TPL_preservacao_produto_acabado.xlsx";
var FVS_TPL_protensao_cabos = "/modelos/FVS_TPL_protensao_cabos.xlsx";
var FVS_TPL_guarda_corpo = "/modelos/FVS_TPL_guarda_corpo.xlsx";

// Exportação "genérica" para os tipos de FVS novos (Locação, Escavação,
// Estacas, Sapata, Radier, Bloco) que ainda não têm um modelo .xlsx
// pixel-perfect embutido — gera uma planilha simples, mas com todos os
// dados e o resultado do checklist por unidade, para não travar o botão
// "Exportar Excel" nesses tipos enquanto os modelos oficiais não são
// replicados (etapa futura).
// ---------------------------------------------------------------------------
// Exportação em réplica exata dos modelos oficiais dos 10 novos tipos de FVS.
//
// Cada linha de FVS_LAYOUTS abaixo mapeia, célula por célula, onde cada campo
// do app cai dentro do .xlsx oficial daquele tipo (extraído diretamente dos
// arquivos .xls originais enviados) — mesma técnica de patch cirúrgico de XML
// já usada em FVS_TEMPLATE_B64/exportFvsXlsx acima, só que parametrizada para
// não repetir a lógica 10 vezes. Croquis/desenhos dos modelos (ex.: caixa de
// "CROQUI" da Locação da Obra) nunca são tocados — ficam em branco, para
// preencher à mão ou anexar em papel, como o modelo original já previa.
//
// "single": ficha sem unidades (ex.: Locação da Obra) — 1 marcação por item,
//   em itemCells[i] (lista de endereços de célula daquele item; mais de 1
//   endereço quando o modelo mescla a célula de resposta em várias linhas).
// "dynamic": ficha com unidades (estacas/sapata/radier/bloco/trecho) — cada
//   unidade ocupa 1 coluna a partir de startCol; itemRows[i] é a lista de
//   linhas daquele item (mais de 1 número quando o modelo mescla o texto do
//   item em várias linhas); unidadesRow é a linha onde o nome de cada unidade
//   (ex.: "Estaca 3") é escrito, na mesma coluna da marcação.
function colLetter(n){
  var s="";
  while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); }
  return s;
}
var FVS_LAYOUTS = {
  locacao_obra: {
    b64: FVS_TPL_locacao_obra, mode:"single",
    header: [ {field:"obra", cell:"B4", prefix:"Obra: "}, {field:"local", cell:"H5", prefix:"LOCAL: "} ],
    itemCells: [ ["H7","H8"], ["H9","H10"], ["H11"], ["H12"] ],
    nc: { rows:[17,19], cols:{desc:[2,6], correcao:[7,13], data:[14,17]} },
    obs: { rows:[21,24], cols:[2,17] },
    footer: { row:25, cols:{ inspecionado:[2,5], dataAbertura:[6,8], engenheiro:[9,12], dataFechamento:[13,17] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da FVS: " } }
  },
  escavacao: {
    b64: FVS_TPL_escavacao, mode:"dynamic", startCol:10, unidadesRow:7,
    bannerFix: { removeRegion:[6,10,7,26], newMergeRef:"J6:Z6" },
    header: [ {field:"obra", cell:"B5"}, {field:"local", cell:"J6", prefix:"LOCAL: "} ],
    itemRows: [ [8],[9],[10],[11,12,13],[14],[15],[16] ],
    nc: { rows:[20,24], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
    obs: { rows:[25,32], cols:[1,26] },
    footer: { row:33, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  estaca_metalica: {
    b64: FVS_TPL_estaca_metalica, mode:"dynamic", startCol:10, unidadesRow:7,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [8],[9],[10],[11],[12] ],
    nc: { rows:[17,20], cols:{desc:[1,8], correcao:[9,16], data:[17,25]} },
    obs: { rows:[21,27], cols:[1,25] },
    footer: { row:29, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:null, dataFechamento:[17,25] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", dataFechamento:"Data de fechamento da RVS: " } }
  },
  estaca_raiz: {
    b64: FVS_TPL_estaca_raiz, mode:"dynamic", startCol:10, unidadesRow:7,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J4"} ],
    itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15] ],
    nc: { rows:[18,24], cols:{desc:[1,7], correcao:[8,15], data:[16,24]} },
    obs: { rows:[25,31], cols:[1,24] },
    footer: { row:32, cols:{ inspecionado:[1,4], dataAbertura:[5,9], engenheiro:[10,16], dataFechamento:[17,24] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  estaca_helice: {
    b64: FVS_TPL_estaca_helice, mode:"dynamic", startCol:10, unidadesRow:7,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J4"} ],
    itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15] ],
    nc: { rows:[18,24], cols:{desc:[1,7], correcao:[8,15], data:[16,24]} },
    obs: { rows:[25,31], cols:[1,24] },
    footer: { row:32, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,16], dataFechamento:[17,24] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  estaca_franki: {
    b64: FVS_TPL_estaca_franki, mode:"dynamic", startCol:13, unidadesRow:6,
    bannerFix: { removeRegion:[6,10,6,26], newMergeRef:"J6:L6" },
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [7],[8],[9],[10],[11],[12] ],
    nc: { rows:[16,20], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
    obs: { rows:[21,27], cols:[1,26] },
    footer: { row:29, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  estaca_escavada: {
    b64: FVS_TPL_estaca_escavada, mode:"dynamic", startCol:13, unidadesRow:6,
    bannerFix: { removeRegion:[6,10,6,26], newMergeRef:"J6:L6" },
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [7],[8],[9],[10],[11],[12],[13],[14],[15],[16],[17] ],
    nc: { rows:[21,33], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
    obs: null,
    footer: { row:34, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  sapata_isolada: {
    b64: FVS_TPL_sapata_isolada, mode:"dynamic", startCol:10, unidadesRow:7,
    header: [ {field:"obra", cell:"C4"}, {field:"local", cell:"L4"} ],
    itemRows: [ [8,9],[10],[11],[12],[13],[14],[15],[16,17] ],
    nc: { rows:[20,26], cols:{desc:[1,7], correcao:[8,15], data:[16,23]} },
    obs: { rows:[27,33], cols:[1,23] },
    footer: { row:34, cols:{ inspecionado:[1,5], dataAbertura:[6,9], engenheiro:[10,16], dataFechamento:[17,23] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ASST. ENGENHEIRO DA OBRA", dataFechamento:"Data de fechamento da RVS: " } }
  },
  radier_armado: {
    b64: FVS_TPL_radier_armado, mode:"dynamic", startCol:10, unidadesRow:7,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [8],[9],[10],[11],[12],[13] ],
    nc: { rows:[17,21], cols:{desc:[1,8], correcao:[9,17], data:[18,25]} },
    obs: { rows:[22,28], cols:[1,25] },
    footer: { row:30, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,25] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  bloco: {
    b64: FVS_TPL_bloco, mode:"dynamic", startCol:10, unidadesRow:6,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J5", prefix:"LOCAL: "} ],
    itemRows: [ [7],[8],[9],[10],[11],[12],[13],[14],[15],[16],[17] ],
    nc: { rows:[20,25], cols:{desc:[1,6], correcao:[7,12], data:[13,14]} },
    obs: { rows:[26,33], cols:[1,14] },
    footer: { row:34, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,12], dataFechamento:[13,14] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da FVS: " } }
  },
  impermeabilizacao_rigida: {
    b64: FVS_TPL_impermeabilizacao_rigida, mode:"dynamic", startCol:8, unidadesRow:7,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J5"} ],
    itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15] ],
    nc: { rows:[19,22], cols:{desc:[1,6], correcao:[7,15]} },
    obs: { rows:[24,29], cols:[1,15] },
    footer: { row:30, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,15], dataFechamento:null },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", engenheiro:"ENGENHEIRO" } }
  },
  montagem_estrutura_metalica: {
    b64: FVS_TPL_montagem_estrutura_metalica, mode:"dynamic", unidadesRow:6,
    unitCols: [ [9,10,11], [13,14], [15,16] ],
    header: [ {field:"obra", cell:"A4", prefix:"OBRA: "}, {field:"local", cell:"K5"} ],
    itemRows: [ [7],[8],[9],[10],[11],[12],[13],[14],[15],[16],[17],[18],[19] ],
    nc: { rows:[24,29], cols:{desc:[1,7], correcao:[8,13], data:[14,17]} },
    obs: { rows:[31,34], cols:[1,17] },
    footer: { row:36, cols:{ inspecionado:[1,4], dataAbertura:[5,9], engenheiro:null, dataFechamento:[14,17] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da FVS: ", dataFechamento:"Data de fechamento da FVS: " } }
  },
  parede_diafragma: {
    b64: FVS_TPL_parede_diafragma, mode:"dynamic", startCol:10, unidadesRow:7,
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15],[16] ],
    nc: { rows:[21,24], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
    obs: { rows:[26,31], cols:[1,26] },
    footer: { row:33, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  cortina_atirantada: {
    b64: FVS_TPL_cortina_atirantada, mode:"dynamic", startCol:10,
    unidadesRow: [ {row:7, prefix:"PAINEL: "}, {row:22, prefix:"TIRANTE Nº "} ],
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"J6", prefix:"CORTINA: "} ],
    itemRows: [ [8],[9],[10],[11],[12],[13],[14],[15],[16],[17],[18],[19],[20],[23],[24],[25],[26],[27],[28] ],
    nc: { rows:[33,36], cols:{desc:[1,8], correcao:[9,17], data:[18,22]} },
    obs: { rows:[38,43], cols:[1,22] },
    footer: { row:45, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,22] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  protensao_cabos: {
    b64: FVS_TPL_protensao_cabos, mode:"dynamic", startCol:10, unidadesRow:6,
    bannerFix: { removeRegion:[6,10,6,23] },
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [7,8],[9],[10],[11],[12],[13],[14] ],
    nc: { rows:[18,21], cols:{desc:[1,8], correcao:[9,15], data:[16,23]} },
    obs: { rows:[23,27], cols:[1,23] },
    footer: { row:28, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,15], dataFechamento:[16,23] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  guarda_corpo: {
    b64: FVS_TPL_guarda_corpo, mode:"dynamic", startCol:10, unidadesRow:6,
    bannerFix: { removeRegion:[6,10,6,23] },
    header: [ {field:"obra", cell:"B4"}, {field:"local", cell:"L5"} ],
    itemRows: [ [7,8,9,10],[11],[12],[13],[14] ],
    nc: { rows:[18,21], cols:{desc:[1,8], correcao:[9,15], data:[16,23]} },
    obs: { rows:[23,28], cols:[1,23] },
    footer: { row:29, cols:{ inspecionado:[1,4], dataAbertura:[5,8], engenheiro:[9,15], dataFechamento:[16,23] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  },
  preservacao_produto_acabado: {
    b64: FVS_TPL_preservacao_produto_acabado, mode:"single",
    header: [ {field:"obra", cell:"B5"}, {field:"local", cell:"J6", prefix:"LOCAL: "} ],
    itemCells: [
      ["J8"],["J9"],["J10"],["J11"],["J12"],["J13"],["J14"],["J15"],["J16"],["J17"],
      ["J18"],["J19"],["J20"],["J21"],["J22"],["J23"],["J24"],["J25"],["J26"],["J27"],
      ["J28"],["J29"],["J30"],["J31"],["J32"],["J33"],["J34"],["J35"],["J36"],["J37"]
    ],
    nc: { rows:[41,47], cols:{desc:[1,8], correcao:[9,17], data:[18,26]} },
    obs: { rows:[49,54], cols:[1,26] },
    footer: { row:55, cols:{ inspecionado:[1,5], dataAbertura:[6,10], engenheiro:[11,17], dataFechamento:[18,26] },
      labels:{ inspecionado:" Inspecionado  por: ", dataAbertura:"Data de abertura da RVS: ", engenheiro:"ENGENHEIRO", dataFechamento:"Data de fechamento da RVS: " } }
  }
};

var STATUS_FILL_FVS = {NA:"E9E9E4", P:"DDEFE1", X:"F5DEDA", V:"E9E9E7"};
var STATUS_FONT_FVS = {NA:"666666", P:"1B5E20", X:"8E1B0F", V:"1A1A1A"};
var STATUS_FONT_NAME_FVS = {NA:"Calibri", P:"Wingdings 2", X:"Calibri", V:"Wingdings 2"};

function paintMark(sheetXml, state, addrs, v){
  sheetXml = xmlSetCellText(sheetXml, addrs[0], v);
  addrs.forEach(function(addr){
    var base = xmlGetCellStyleId(sheetXml, addr);
    var ns = ensureColoredStyle(state, base, STATUS_FILL_FVS[v], STATUS_FONT_FVS[v], STATUS_FONT_NAME_FVS[v]);
    sheetXml = xmlSetCellStyleId(sheetXml, addr, ns);
  });
  return sheetXml;
}

function fillChecklistItemsTemplate(sheetXml, state, d, layout, tipoInfo){
  var flat = 0;
  if(layout.mode==="single"){
    tipoInfo.checklist.forEach(function(cat, ci){
      cat.itens.forEach(function(it, ii){
        var key = ci+"-"+ii;
        var v = (d.checklist[key]||{})["_unico"];
        var addrs = layout.itemCells[flat];
        if(v && STATUS_FILL_FVS[v] && addrs) sheetXml = paintMark(sheetXml, state, addrs, v);
        flat++;
      });
    });
  } else {
    var unidades = d.unidades||[];
    // colUnidade: por padrão, cada unidade ocupa 1 coluna a partir de
    // startCol. Modelos com grade irregular (ex.: 3 vãos de largura
    // desigual) podem informar layout.unitCols = [[c1,c2,...], ...] — um
    // grupo de colunas por unidade; usamos sempre a 1ª coluna do grupo
    // (a célula mesclada já cobre visualmente as demais).
    function colUnidade(ui){
      if(layout.unitCols){
        var grp = layout.unitCols[ui];
        return grp ? grp[0] : null;
      }
      return layout.startCol+ui;
    }
    if(layout.unidadesRow){
      // unidadesRow pode ser um único número (padrão) ou uma lista de
      // linhas — cada uma um número, ou {row, prefix} quando o modelo
      // já tem um rótulo impresso na célula (ex.: "PAINEL:", "TIRANTE Nº")
      // e o valor deve ser escrito logo após esse rótulo.
      var uRows = Array.isArray(layout.unidadesRow) ? layout.unidadesRow : [layout.unidadesRow];
      uRows.forEach(function(ur){
        var rowNum = (ur && typeof ur === "object") ? ur.row : ur;
        var prefix = (ur && typeof ur === "object" && ur.prefix) ? ur.prefix : "";
        unidades.forEach(function(u, ui){
          var col = colUnidade(ui);
          if(col==null) return;
          sheetXml = xmlSetCellText(sheetXml, colLetter(col)+rowNum, prefix+u);
        });
      });
    }
    tipoInfo.checklist.forEach(function(cat, ci){
      cat.itens.forEach(function(it, ii){
        var key = ci+"-"+ii;
        var porUnidade = d.checklist[key]||{};
        var rows = layout.itemRows[flat];
        unidades.forEach(function(u, ui){
          var v = porUnidade[u];
          var col = colUnidade(ui);
          if(v && STATUS_FILL_FVS[v] && rows && col!=null){
            var addrs = rows.map(function(r){ return colLetter(col)+r; });
            sheetXml = paintMark(sheetXml, state, addrs, v);
          }
        });
        flat++;
      });
    });
  }
  return sheetXml;
}

// Concatena todas as não conformidades da ficha (agora uma lista, ver
// fichaNaoConformidades()) em texto de múltiplas linhas — o modelo impresso
// continua tendo só uma área fixa por campo (descrição/correção/data), então
// em vez de reservar uma linha por não conformidade no layout, cada célula
// recebe o texto de todas elas, numeradas, separadas por linha em branco.
function textoNcConcatenado(ncs, campo){
  if(!ncs.length) return "";
  if(ncs.length===1) return ncs[0][campo]||"";
  return ncs.map(function(nc, i){ return (i+1)+") "+(nc[campo]||""); }).join("\n\n");
}
// v1.15: última assinatura de cada papel (a da revisão atual) e o texto "assinado em …"
function assinaturaDoPapel(d, papel){
  // v1.17: o campo "Inspecionado por" recebe técnico(a) OU estagiário(a)
  var papeis = papel==="tecnico" ? ["tecnico","estagiario"] : [papel];
  return (d.assinaturas||[]).filter(function(s){ return papeis.indexOf(s.papel)!==-1; }).slice(-1)[0] || null;
}
function textoAssinado(d, papel, nome){
  var a = assinaturaDoPapel(d, papel);
  if(!a) return nome||"";
  return (nome||a.nome||"")+(a.crea ? " · "+a.crea : "");
}
// linha que vai embaixo do traço de assinatura: "assinado eletronicamente em 08/10/2026 13:53"
function rodapeAssinado(d, papel){
  var a = assinaturaDoPapel(d, papel);
  if(!a || !a.em) return "";
  var t = new Date(a.em); if(isNaN(t)) return "";
  var z = function(n){ return String(n).padStart(2,"0"); };
  return "\nassinado eletronicamente em "+z(t.getDate())+"/"+z(t.getMonth()+1)+"/"+t.getFullYear()+" "+z(t.getHours())+":"+z(t.getMinutes());
}
// imagens das assinaturas para o Excel: inspeção (técnico) e engenharia, nos campos do rodapé
function assinaturasParaXlsx(d, insp, eng, row){
  var out = [], t = assinaturaDoPapel(d, "tecnico"), e = assinaturaDoPapel(d, "engenheiro");
  if(t && t.imagem && insp) out.push({ imagem:t.imagem, col:insp[0], colFim:insp[1], row:row });
  if(e && e.imagem && eng) out.push({ imagem:e.imagem, col:eng[0], colFim:eng[1], row:row });
  return out;
}
function fillNcObsFooterTemplate(sheetXml, state, d, layout){
  var ncs = ctx.fichaNaoConformidades(d);
  if(layout.nc && ncs.length){
    var nc = layout.nc;
    [["desc", textoNcConcatenado(ncs,"descricao")], ["correcao", textoNcConcatenado(ncs,"correcao")],
     ["data", ncs.map(function(n){ return n.concluida && n.dataConclusao ? fmtDateBR(n.dataConclusao) : "Em aberto"; }).join("\n")]].forEach(function(pair){
      var cc = nc.cols[pair[0]];
      var addr = colLetter(cc[0])+nc.rows[0];
      sheetXml = xmlSetCellText(sheetXml, addr, pair[1]);
      sheetXml = xmlRemoveMergesWithin(sheetXml, nc.rows[0], cc[0], nc.rows[1], cc[1]);
      sheetXml = xmlAddMerge(sheetXml, addr+":"+colLetter(cc[1])+nc.rows[1]);
      var base = xmlGetCellStyleId(sheetXml, addr);
      var ns = ensureWrapStyle(state, base);
      sheetXml = xmlSetCellStyleId(sheetXml, addr, ns);
    });
  }
  if(layout.obs && d.observacoes){
    var obs = layout.obs;
    var addr = colLetter(obs.cols[0])+obs.rows[0];
    sheetXml = xmlSetCellText(sheetXml, addr, d.observacoes);
    sheetXml = xmlRemoveMergesWithin(sheetXml, obs.rows[0], obs.cols[0], obs.rows[1], obs.cols[1]);
    sheetXml = xmlAddMerge(sheetXml, addr+":"+colLetter(obs.cols[1])+obs.rows[1]);
    var base = xmlGetCellStyleId(sheetXml, addr);
    var ns = ensureWrapStyle(state, base);
    sheetXml = xmlSetCellStyleId(sheetXml, addr, ns);
  }
  if(layout.footer){
    var f = layout.footer, r = f.row, L = f.labels;
    if(f.cols.inspecionado) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.inspecionado[0])+r, (L.inspecionado||"")+textoAssinado(d, "tecnico", d.inspecionadoPor)+"\n\n___________________________"+rodapeAssinado(d, "tecnico"));
    if(f.cols.dataAbertura) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.dataAbertura[0])+r, (L.dataAbertura||"")+(d.dataAbertura?fmtDateBR(d.dataAbertura):"_______ / _______ / _______"));
    if(f.cols.engenheiro) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.engenheiro[0])+r, (L.engenheiro||"ENGENHEIRO")+": "+textoAssinado(d, "engenheiro", d.engenheiro)+"\n\n__________________________________"+rodapeAssinado(d, "engenheiro"));
    if(f.cols.dataFechamento) sheetXml = xmlSetCellText(sheetXml, colLetter(f.cols.dataFechamento[0])+r, (L.dataFechamento||"")+(d.dataFechamento?fmtDateBR(d.dataFechamento):"_______/_______/_______"));
  }
  return sheetXml;
}

function exportFvsXlsxFromTemplate(d){
  var layout = FVS_LAYOUTS[d.tipo];
  var tipoInfo = getFvsTipo(d.tipo);
  if(!layout || !tipoInfo){ exportFvsXlsxGenerico(d); return; }
  carregarModelo(layout.b64).then(function(zip){
    return Promise.all([
      zip.file("xl/worksheets/sheet1.xml").async("string"),
      zip.file("xl/styles.xml").async("string")
    ]).then(function(res){
      var sheetXml = res[0], stylesXml = res[1];
      var state = { stylesXml: stylesXml, styleCache: {} };

      if(layout.bannerFix){
        // bannerFix pode ser um único ajuste ou uma lista deles (quando mais
        // de uma faixa mesclada precisa ser desfeita antes de liberar as
        // colunas de unidade para escrita individual).
        var fixes = Array.isArray(layout.bannerFix) ? layout.bannerFix : [layout.bannerFix];
        fixes.forEach(function(bf){
          var rr = bf.removeRegion;
          sheetXml = xmlRemoveMergesWithin(sheetXml, rr[0], rr[1], rr[2], rr[3]);
          if(bf.newMergeRef) sheetXml = xmlAddMerge(sheetXml, bf.newMergeRef);
        });
      }

      layout.header.forEach(function(h){
        sheetXml = xmlSetCellText(sheetXml, h.cell, (h.prefix||"")+(d[h.field]||""));
      });

      sheetXml = fillChecklistItemsTemplate(sheetXml, state, d, layout, tipoInfo);
      sheetXml = fillNcObsFooterTemplate(sheetXml, state, d, layout);

      stylesXml = state.stylesXml;
      zip.file("xl/worksheets/sheet1.xml", sheetXml);
      zip.file("xl/styles.xml", stylesXml);
      // v1.15: imagem das assinaturas no rodapé do modelo
      var ft = layout.footer;
      var assinXlsx = ft ? assinaturasParaXlsx(d, ft.cols.inspecionado, ft.cols.engenheiro, ft.row) : [];
      return adicionarAssinaturasXlsx(zip, "xl/worksheets/sheet1.xml", assinXlsx)
        .then(function(){ return zip.generateAsync({type:"blob"}); });
    });
  }).then(function(blob){
    triggerDownload(blob, safeName(tipoInfo.codigo)+"_"+safeName(d.numero)+".xlsx");
  }).catch(function(err){
    console.error("Falha ao exportar FVS ("+d.tipo+"):", err);
    alert("Não foi possível gerar o Excel desta ficha. Tente novamente.");
  });
}

function exportFvsXlsxGenerico(d){
  try{
    var tipoInfo = getFvsTipo(d.tipo);
    var isSingle = tipoInfo && tipoInfo.unidades && tipoInfo.unidades.mode==="single";
    var unidades = isSingle ? ["Resultado"] : (d.unidades||[]).slice();

    var rows = [];
    rows.push([(tipoInfo?tipoInfo.codigo+" — "+tipoInfo.titulo:d.codigo+" — "+d.descricao)]);
    rows.push(["Obra", d.obra||"", "Local", d.local||""]);
    rows.push(["Nº da ficha", d.numero||"", "Data de abertura", d.dataAbertura?fmtDateBR(d.dataAbertura):""]);
    rows.push(["Inspecionado por", textoAssinado(d, "tecnico", d.inspecionadoPor)+rodapeAssinado(d, "tecnico").replace("\n"," — "), "Engenheiro responsável", textoAssinado(d, "engenheiro", d.engenheiro)+rodapeAssinado(d, "engenheiro").replace("\n"," — ")]);
    rows.push(["Data de concretagem", d.dataConcretagem?fmtDateBR(d.dataConcretagem):"", "Data de fechamento", d.dataFechamento?fmtDateBR(d.dataFechamento):""]);
    rows.push([]);

    if(!isSingle && unidades.length===0){
      rows.push(["(nenhuma unidade adicionada nesta ficha)"]);
    } else if(tipoInfo){
      rows.push(["Item","Método / Critério","Tolerância"].concat(unidades));
      tipoInfo.checklist.forEach(function(cat, ci){
        if(cat.cat) rows.push([cat.cat]);
        cat.itens.forEach(function(it, ii){
          var key=ci+"-"+ii;
          var porGrupo = d.checklist[key] || {};
          var line = [it.n||"", it.m||"", it.tol||""];
          unidades.forEach(function(u){
            var gk = isSingle ? "_unico" : u;
            line.push(porGrupo[gk] || "");
          });
          rows.push(line);
        });
      });
    }

    rows.push([]);
    var ncsGenerico = ctx.fichaNaoConformidades(d);
    if(ncsGenerico.length){
      rows.push(["Não conformidades ("+ncsGenerico.length+")"]);
      ncsGenerico.forEach(function(nc, ni){
        rows.push(["Não conformidade "+(ni+1)+" — descrição", nc.descricao||""]);
        rows.push(["Não conformidade "+(ni+1)+" — correção proposta", nc.correcao||""]);
        rows.push(["Não conformidade "+(ni+1)+" — situação", nc.concluida ? "Concluída em "+(nc.dataConclusao?fmtDateBR(nc.dataConclusao):"") : "Em aberto"]);
      });
    }
    if(d.observacoes) rows.push(["Observações", d.observacoes]);

    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{wch:34},{wch:40},{wch:14}].concat(unidades.map(function(){ return {wch:16}; }));
    if(ws["A1"]) ws["A1"].s = {font:{bold:true, sz:13}};
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, safeName(tipoInfo?tipoInfo.codigo:"FVS").slice(0,31));
    var wbout = XLSX.write(wb, {bookType:"xlsx", type:"array"});
    triggerDownload(new Blob([wbout], {type:"application/octet-stream"}), "FVS_"+safeName(d.codigo)+"_"+safeName(d.numero)+".xlsx");
  }catch(err){
    console.error("Falha ao exportar FVS (tipo novo):", err);
    alert("Não foi possível gerar o Excel desta ficha. Tente novamente.");
  }
}

function exportFvsXlsx(d){
  if(d.tipo && d.tipo!=="fvs04"){
    if(FVS_LAYOUTS[d.tipo]) exportFvsXlsxFromTemplate(d); else exportFvsXlsxGenerico(d);
    return;
  }
  carregarModelo(FVS_TEMPLATE_B64).then(function(orig){
    var sheetFile = "xl/worksheets/sheet3.xml"; // aba "FVS 04" do modelo oficial (as outras 2 abas são exemplos, descartadas abaixo)
    return Promise.all([
      orig.file(sheetFile).async("string"),
      orig.file("xl/worksheets/_rels/sheet3.xml.rels").async("string"),
      orig.file("xl/styles.xml").async("string"),
      orig.file("xl/theme/theme1.xml").async("string"),
      orig.file("xl/drawings/drawing3.xml").async("string"),
      orig.file("xl/drawings/_rels/drawing3.xml.rels").async("string"),
      orig.file("xl/media/image2.png").async("uint8array"),
      orig.file("xl/sharedStrings.xml").async("string")
    ]).then(function(res){
      var sheetXml = res[0], sheetRelsXml = res[1], stylesXml = res[2], themeXml = res[3],
          drawingXml = res[4], drawingRelsXml = res[5], imageBytes = res[6], sharedStringsXml = res[7];
      var state = { stylesXml: stylesXml, styleCache: {} };

      sheetXml = xmlSetCellText(sheetXml, "B4", (d.obra||"") + (d.numero ? "   |   Nº da ficha: "+d.numero : ""));
      sheetXml = xmlSetCellText(sheetXml, "L5", (d.local||"") + (d.dataConcretagem ? "   |   Concretagem: "+fmtDateBR(d.dataConcretagem) : ""));

      // O modelo reserva 5 blocos de colunas ao lado de cada item do checklist
      // (cabeçalho "LOCAL:" na linha 6) — um por elemento estrutural. Cada
      // bloco recebe seu cabeçalho fixo, e cada item do checklist é marcado
      // com o resultado (NA/Aprovado/Reprovado/Reinspecionado, mesma cor da
      // legenda impressa) só nos elementos marcados nesta ficha — os demais
      // ficam em branco. Como cada bloco é uma mesclagem (ex: J6:L6), o estilo
      // novo é aplicado em todas as colunas por trás dela, não só na primeira.
      var STATUS_FILL = {NA:"E9E9E4", P:"DDEFE1", X:"F5DEDA", V:"E9E9E7"};
      var STATUS_FONT = {NA:"666666", P:"1B5E20", X:"8E1B0F", V:"1A1A1A"};
      // A legenda impressa do modelo oficial não usa a letra "P" nem "V" como
      // texto comum — ela usa esses mesmos caracteres só que na fonte "Wingdings
      // 2", que troca o glifo por um símbolo (✓ para aprovado, e o símbolo de
      // reinspecionado/aprovado). Para a marcação do checklist bater com a
      // legenda, usamos a mesma fonte nesses dois casos; NA e X continuam em
      // texto normal (Calibri), igual à legenda também os mostra.
      var STATUS_FONT_NAME = {NA:"Calibri", P:"Wingdings 2", X:"Calibri", V:"Wingdings 2"};

      FVS_ELEMENTOS.forEach(function(el){
        sheetXml = xmlSetCellText(sheetXml, el.cols[0]+"6", el.label.toUpperCase());
      });

      var flat = 0;
      FVS_CHECKLIST.forEach(function(cat, ci){
        cat.itens.forEach(function(it, ii){
          var row = 7 + flat; // linha 7 do modelo = primeiro item do checklist
          var key = ci+"-"+ii;
          var porElemento = d.checklist[key] || {};
          FVS_ELEMENTOS.forEach(function(el){
            if(!(d.elementos||{})[el.key]) return; // elemento não avaliado nesta ficha — coluna fica em branco
            var v = porElemento[el.key];
            if(!v || !STATUS_FILL[v]) return;
            var cols = el.cols;
            sheetXml = xmlSetCellText(sheetXml, cols[0]+row, v);
            cols.forEach(function(col){
              var addr = col+row;
              var baseStyle = xmlGetCellStyleId(sheetXml, addr);
              var newStyle = ensureColoredStyle(state, baseStyle, STATUS_FILL[v], STATUS_FONT[v], STATUS_FONT_NAME[v]);
              sheetXml = xmlSetCellStyleId(sheetXml, addr, newStyle);
            });
          });
          flat++;
        });
      });

      // O modelo traz o bloco de não-conformidade/observação pré-dividido em
      // várias mesclagens pequenas (uma por linha, pensadas para preenchimento à
      // mão) — troca por uma mesclagem única alta, com quebra de linha, para o
      // texto digitado caber e alinhar como no restante do sistema.
      var ncsFvs04 = ctx.fichaNaoConformidades(d);
      if(ncsFvs04.length){
        sheetXml = xmlSetCellText(sheetXml, "A29", textoNcConcatenado(ncsFvs04,"descricao"));
        sheetXml = xmlSetCellText(sheetXml, "I29", textoNcConcatenado(ncsFvs04,"correcao"));
        sheetXml = xmlSetCellText(sheetXml, "R29", ncsFvs04.map(function(n){ return n.concluida && n.dataConclusao ? fmtDateBR(n.dataConclusao) : "Em aberto"; }).join("\n"));
        sheetXml = xmlRemoveMergesWithin(sheetXml, 29,1,33,8);
        sheetXml = xmlAddMerge(sheetXml, "A29:H33");
        sheetXml = xmlRemoveMergesWithin(sheetXml, 29,9,33,17);
        sheetXml = xmlAddMerge(sheetXml, "I29:Q33");
        sheetXml = xmlRemoveMergesWithin(sheetXml, 29,18,33,25);
        sheetXml = xmlAddMerge(sheetXml, "R29:Y33");
        ["A29","I29","R29"].forEach(function(addr){
          var baseStyle = xmlGetCellStyleId(sheetXml, addr);
          var newStyle = ensureWrapStyle(state, baseStyle);
          sheetXml = xmlSetCellStyleId(sheetXml, addr, newStyle);
        });
      }

      if(d.observacoes){
        sheetXml = xmlSetCellText(sheetXml, "A35", d.observacoes);
        sheetXml = xmlRemoveMergesWithin(sheetXml, 35,1,41,25);
        sheetXml = xmlAddMerge(sheetXml, "A35:Y41");
        var baseStyleObs = xmlGetCellStyleId(sheetXml, "A35");
        var newStyleObs = ensureWrapStyle(state, baseStyleObs);
        sheetXml = xmlSetCellStyleId(sheetXml, "A35", newStyleObs);
      }

      sheetXml = xmlSetCellText(sheetXml, "A42", " Inspecionado por: "+textoAssinado(d, "tecnico", d.inspecionadoPor)+"\n\n___________________________"+rodapeAssinado(d, "tecnico"));
      sheetXml = xmlSetCellText(sheetXml, "F42", "Data de abertura da FVS: \n\n"+(d.dataAbertura ? fmtDateBR(d.dataAbertura) : "_______ / _______ / _______"));
      sheetXml = xmlSetCellText(sheetXml, "K42", "ENGENHEIRO: "+textoAssinado(d, "engenheiro", d.engenheiro)+"\n\n__________________________________"+rodapeAssinado(d, "engenheiro"));
      sheetXml = xmlSetCellText(sheetXml, "S42", "Data de fechamento da FVS: \n\n"+(d.dataFechamento ? fmtDateBR(d.dataFechamento) : "_______/_______/_______"));

      stylesXml = state.stylesXml;

      // O arquivo original traz 3 abas (2 são exemplos preenchidos de outra
      // obra); montamos um pacote .xlsx novo e mínimo contendo só a aba "FVS 04"
      // preenchida — reaproveitando sem qualquer alteração os arquivos internos
      // de estilo, tema, logo e tabela de textos do modelo oficial.
      var out = new JSZip();
      out.file("[Content_Types].xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
        '<Default Extension="xml" ContentType="application/xml"/>'+
        '<Default Extension="png" ContentType="image/png"/>'+
        '<Default Extension="jpeg" ContentType="image/jpeg"/>'+
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
        '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
        '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+
        '<Override PartName="/xl/drawings/drawing3.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'+
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'+
        '</Types>');
      out.file("_rels/.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'+
        '</Relationships>');
      out.file("xl/workbook.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
        '<sheets><sheet name="FVS 04" sheetId="1" r:id="rId1"/></sheets></workbook>');
      out.file("xl/_rels/workbook.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>'+
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'+
        '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'+
        '</Relationships>');
      out.file(sheetFile, sheetXml);
      out.file("xl/worksheets/_rels/sheet3.xml.rels", sheetRelsXml);
      out.file("xl/styles.xml", stylesXml);
      out.file("xl/theme/theme1.xml", themeXml);
      out.file("xl/drawings/drawing3.xml", drawingXml);
      out.file("xl/drawings/_rels/drawing3.xml.rels", drawingRelsXml);
      out.file("xl/media/image2.png", imageBytes);
      out.file("xl/sharedStrings.xml", sharedStringsXml);

      // v1.15: imagem das assinaturas nos campos "Inspecionado por" (A42:E42) e "ENGENHEIRO" (K42:R42)
      return adicionarAssinaturasXlsx(out, sheetFile, assinaturasParaXlsx(d, [1,5], [11,18], 42))
        .then(function(){ return out.generateAsync({type:"blob"}); });
    });
  }).then(function(blob){
    triggerDownload(blob, "FVS_"+safeName(d.codigo)+"_"+safeName(d.numero)+".xlsx");
  }).catch(function(err){
    console.error("Falha ao exportar FVS:", err);
    alert("Não foi possível gerar o Excel da FVS. Tente novamente.");
  });
}

function exportRastXlsx(d){
  carregarModelo(RAST_TEMPLATE_B64).then(function(zip){
    return Promise.all([
      zip.file("xl/worksheets/sheet1.xml").async("string"),
      zip.file("xl/styles.xml").async("string")
    ]).then(function(res){
      var sheetXml = res[0], stylesXml = res[1];
      var state = { stylesXml: stylesXml, styleCache: {} };

      // v1.20: o modelo da SIG usa letra de 5 a 6,5 pt nesses campos (feitos para
      // escrever à mão). O rótulo continua como no modelo e o valor preenchido sai
      // em 9 pt negrito, legível na impressão, sem mudar as alturas das linhas.
      var rotulo = function(t, sz){ return { t:t, sz:sz||5.5, b:true }; };
      var valor = function(t){ return { t:t||"", sz:9, b:true }; };
      sheetXml = xmlSetCellRich(sheetXml, "N1", [rotulo("NOME DA OBRA: ", 6.5), valor(d.obra)]);
      sheetXml = xmlSetCellText(sheetXml, "U1", (d.blocoPav ? "  "+d.blocoPav : ""));
      sheetXml = xmlSetCellRich(sheetXml, "D2", [rotulo("Projeto de Referência: "), valor(d.projetoReferencia)]);
      sheetXml = xmlSetCellRich(sheetXml, "J2", [rotulo("Slump (aprovado pela obra): "), valor(d.slumpAprovado)]);
      sheetXml = xmlSetCellRich(sheetXml, "L2", [rotulo("FCK solicitado: "), valor(d.fckSolicitado)]);

      var ROWS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]; // 17 betonadas no modelo impresso
      (d.linhas||[]).slice(0, ROWS.length).forEach(function(l, idx){
        var r = ROWS[idx];
        var gasto = diffMin(l.saidaUsina, l.lancFinal);
        var over = gasto!=null && gasto>TEMPO_MAX_MIN;
        sheetXml = xmlSetCellText(sheetXml, "A"+r, l.seq||"");
        sheetXml = xmlSetCellText(sheetXml, "C"+r, l.notaFiscal||"");
        sheetXml = xmlSetCellText(sheetXml, "D"+r, l.betoneira||"");
        sheetXml = xmlSetCellText(sheetXml, "E"+r, l.lacre||"");
        sheetXml = xmlSetCellText(sheetXml, "F"+r, l.volBetoneira||"");
        sheetXml = xmlSetCellText(sheetXml, "G"+r, l.volAcumulado||"");
        sheetXml = xmlSetCellText(sheetXml, "H"+r, l.fornecedor||"");
        sheetXml = xmlSetCellText(sheetXml, "I"+r, l.nSerieCP||"");
        sheetXml = xmlSetCellText(sheetXml, "J"+r, l.nCPs||"");
        sheetXml = xmlSetCellText(sheetXml, "K"+r, l.slump||"");
        sheetXml = xmlSetCellText(sheetXml, "L"+r, l.saidaUsina||"");
        sheetXml = xmlSetCellText(sheetXml, "M"+r, l.chegadaObra||"");
        sheetXml = xmlSetCellText(sheetXml, "N"+r, l.lancInicial||"");
        sheetXml = xmlSetCellText(sheetXml, "O"+r, l.lancFinal||"");
        sheetXml = xmlSetCellText(sheetXml, "P"+r, fmtMin(gasto));
        if(over){
          var baseStyle = xmlGetCellStyleId(sheetXml, "P"+r);
          var newStyle = ensureColoredStyle(state, baseStyle, "F5DEDA", "8E1B0F");
          sheetXml = xmlSetCellStyleId(sheetXml, "P"+r, newStyle);
        }
        sheetXml = xmlSetCellText(sheetXml, "Q"+r, l.aguaFolga||"");
        sheetXml = xmlSetCellText(sheetXml, "R"+r, l.aguaLanc||"");
        sheetXml = xmlSetCellText(sheetXml, "S"+r, l.pecas||"");
        // v1.23: peças concretadas longas quebram em várias linhas na caixa S:Y —
        // a linha da betonada cresce para mostrar todas (antes ficavam escondidas)
        var nLinhas = linhasQuebradas(l.pecas||"", 33);
        if(nLinhas > 1) sheetXml = xmlSetRowHeight(sheetXml, r, Math.min(90, nLinhas * 12.75 + 1.5));
      });

      sheetXml = xmlSetCellText(sheetXml, "L23", d.acoesCorretivas||"");
      // A célula já vem com quebra de linha automática no próprio modelo
      // (herdada do estilo original), mas a linha 23 é fixada em só 9pt de
      // altura — o suficiente para uma anotação curta feita à mão, mas não
      // para um texto de observações/ações corretivas mais longo digitado
      // no sistema, que ficaria cortado visualmente mesmo com a quebra
      // ligada. Aumenta só a altura dessa linha quando o texto não cabe,
      // sem tocar em colunas, mesclagens ou qualquer outro elemento do
      // layout da planilha.
      if(d.acoesCorretivas && d.acoesCorretivas.length > 40){
        var linhasEstimadasL23 = Math.ceil(d.acoesCorretivas.length / 70);
        var alturaL23 = Math.min(90, Math.max(9, linhasEstimadasL23 * 13));
        sheetXml = xmlSetRowHeight(sheetXml, 23, alturaL23);
      }
      if(d.dataFechamento) sheetXml = xmlSetCellText(sheetXml, "B25", fmtDateBR(d.dataFechamento));
      // v1.20: rótulo do modelo → nome (9 pt) logo ABAIXO → assinatura embaixo do nome.
      // Coleta (estagiário/técnico) em E25:J25; engenheiro(a) em K25 — o nome não vai
      // mais para a caixa ao lado (S25), fica embaixo do próprio rótulo.
      var assinT = assinaturaDoPapel(d, "tecnico"), assinE = assinaturaDoPapel(d, "engenheiro");
      var quando = function(a){ if(!a || !a.em) return ""; var t = new Date(a.em); return isNaN(t) ? "" : "   assinado eletronicamente em "+t.toLocaleDateString("pt-BR"); };
      sheetXml = xmlSetCellRich(sheetXml, "E25", [rotulo("RESPONSÁVEL PELA COLETA DOS DADOS (LETRA DE FORMA):", 5.5), valor("\n"+textoAssinado(d, "tecnico", d.responsavelColeta)), { t:quando(assinT), sz:6 }]);
      sheetXml = xmlSetCellRich(sheetXml, "K25", [rotulo("NOME ENGENHEIRO RESPONSÁVEL (LETRA DE FORMA):", 5.5), valor("\n"+textoAssinado(d, "engenheiro", d.engenheiro)), { t:quando(assinE), sz:6 }]);
      sheetXml = xmlSetCellText(sheetXml, "S25", "");
      ["E25","K25"].forEach(function(addr){
        sheetXml = xmlSetCellStyleId(sheetXml, addr, ensureAlignStyle(state, xmlGetCellStyleId(sheetXml, addr), { wrapText:"1", vertical:"top", indent:"0" }));
      });
      // nome + espaço para a assinatura embaixo dele
      sheetXml = xmlSetRowHeight(sheetXml, 25, (assinT || assinE) ? 62 : 30);

      sheetXml = xmlAddPageSetupLandscape(sheetXml);

      stylesXml = state.stylesXml;
      zip.file("xl/worksheets/sheet1.xml", sheetXml);
      zip.file("xl/styles.xml", stylesXml);

      // v1.18: imagem das assinaturas — coleta (E25:J25) e engenheiro (S25:Y25)
      // v1.20: logo da SIG centralizada na caixa A1:C1
      var desenho = zip.file("xl/drawings/drawing1.xml");
      var centralizar = desenho ? desenho.async("string").then(function(dx){
        zip.file("xl/drawings/drawing1.xml", centralizarImagemNaCaixa(dx, sheetXml, 1, 3, 1));
      }) : Promise.resolve();
      return centralizar.then(function(){
        return adicionarAssinaturasXlsx(zip, "xl/worksheets/sheet1.xml", assinaturasParaXlsx(d, [5,10], [11,18], 25).map(function(a){ return Object.assign(a, { pe:0.97, alt:0.5 }); }));
      })
        .then(function(){ return zip.generateAsync({type:"blob"}); });
    });
  }).then(function(blob){
    triggerDownload(blob, "Rastreabilidade_"+(d.data||"sem_data")+"_"+safeName(d.blocoPav||"").slice(0,30)+".xlsx");
  }).catch(function(err){
    console.error("Falha ao exportar Rastreabilidade:", err);
    alert("Não foi possível gerar o Excel de Rastreabilidade. Tente novamente.");
  });
}

export { assinaturaDoPapel, exportFvsXlsx, exportRastXlsx };
