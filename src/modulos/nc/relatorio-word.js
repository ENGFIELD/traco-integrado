/* Relatório de não conformidades em Word (.docx), com fotos embutidas.
 * Separado do main.js na v1.29 (fase A1). */
import { DEFAULT_OBRA } from "../fvs/catalogo.js";
import { fmtDateBR, todayISO } from "../comum/formatos.js";
import { triggerDownload } from "../exportar/xlsx-xml.js";
import { garantirLibs } from "../../libs.js";

// O que este módulo usa do app principal (ligado por iniciarRelatorioWord() no main.js).
let ctx = null;
export function iniciarRelatorioWord(c) { ctx = c; }

/* ---------------- relatório de não conformidades em .docx (Word) ---------------- */
// Gera um .docx de verdade (não um .rtf) manipulando o XML do Office Open
// XML diretamente via JSZip — a mesma técnica já usada pra exportação em
// Excel deste app, só que pro formato do Word. Isso dá um documento com
// cara de relatório formal (faixa colorida, tabelas com cabeçalho, cores
// de situação), que abre no Word sem nenhum aviso de compatibilidade,
// pronto pra ser enviado a uma empreiteira — com exatamente as não
// conformidades que batem com os filtros ativos no momento do clique.
var DOCX_COR_FAIXA = "1A1A1A";   // --accent-strong (identidade Belavista Consórcio: preto/grafite)
var DOCX_COR_ACCENT = "404040";  // --accent
var DOCX_COR_RUIM = "AD3A2C";    // --bad
var DOCX_COR_BOM = "2E7D46";     // --good
var DOCX_COR_CINZA_CLARO = "F2F2F2";
var DOCX_COR_BORDA = "BFBFBF";
var DOCX_LARGURA_UTIL = 9906; // twips (~ A4 menos margens de 1000 twips de cada lado)

function docxEscape(s){
  return String(s==null?"":s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function docxRun(text, opts){
  opts = opts||{};
  var rpr = "";
  if(opts.bold) rpr += "<w:b/>";
  if(opts.italic) rpr += "<w:i/>";
  if(opts.color) rpr += '<w:color w:val="'+opts.color+'"/>';
  if(opts.sz) rpr += '<w:sz w:val="'+opts.sz+'"/><w:szCs w:val="'+opts.sz+'"/>';
  var rprXml = rpr ? "<w:rPr>"+rpr+"</w:rPr>" : "";
  var linhas = String(text==null?"":text).split("\n");
  return linhas.map(function(linha, i){
    return (i>0 ? "<w:br/>" : "") + "<w:r>"+rprXml+'<w:t xml:space="preserve">'+docxEscape(linha)+"</w:t></w:r>";
  }).join("");
}
function docxPar(text, opts){
  opts = opts||{};
  var ppr = "";
  if(opts.align) ppr += '<w:jc w:val="'+opts.align+'"/>';
  if(opts.shd) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="'+opts.shd+'"/>';
  ppr += '<w:spacing w:before="'+(opts.spacingBefore||0)+'" w:after="'+(opts.spacingAfter!=null?opts.spacingAfter:120)+'"/>';
  if(opts.borderBottom) ppr += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="'+opts.borderBottom+'"/></w:pBdr>';
  var run = text==="" ? "" : docxRun(text, opts);
  return "<w:p><w:pPr>"+ppr+"</w:pPr>"+run+"</w:p>";
}
function docxCell(innerXml, opts){
  opts = opts||{};
  var tcpr = '<w:tcW w:w="'+opts.width+'" w:type="dxa"/>';
  if(opts.shd) tcpr += '<w:shd w:val="clear" w:color="auto" w:fill="'+opts.shd+'"/>';
  tcpr += '<w:vAlign w:val="'+(opts.vAlign||"center")+'"/>';
  return "<w:tc><w:tcPr>"+tcpr+"</w:tcPr>"+innerXml+"</w:tc>";
}
function docxCelTexto(text, width, parOpts, cellOpts){
  var opts = Object.assign({spacingBefore:30, spacingAfter:30}, parOpts||{});
  return docxCell(docxPar(text, opts), Object.assign({width:width}, cellOpts||{}));
}
function docxTable(colWidths, rows){
  var totalW = colWidths.reduce(function(a,b){ return a+b; }, 0);
  var grid = colWidths.map(function(w){ return '<w:gridCol w:w="'+w+'"/>'; }).join("");
  var trs = rows.map(function(cells){ return "<w:tr>"+cells.join("")+"</w:tr>"; }).join("");
  var borda = ' w:val="single" w:sz="4" w:space="0" w:color="'+DOCX_COR_BORDA+'"/>';
  return "<w:tbl>"
    + '<w:tblPr><w:tblW w:w="'+totalW+'" w:type="dxa"/>'
    + "<w:tblBorders>"
      + "<w:top"+borda+"<w:left"+borda+"<w:bottom"+borda+"<w:right"+borda
      + "<w:insideH"+borda+"<w:insideV"+borda
    + "</w:tblBorders>"
    + '<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar>'
    + "</w:tblPr>"
    + "<w:tblGrid>"+grid+"</w:tblGrid>"
    + trs
    + "</w:tbl>";
}
function docxCabecalhoTabela(labels, widths){
  return labels.map(function(label, i){
    return docxCelTexto(label, widths[i], {bold:true, color:"FFFFFF", sz:17, align:"center"}, {shd:DOCX_COR_FAIXA});
  });
}

/* ---------------- fotos/documentos anexados às NCs, embutidos no .docx ----------------
   Cada foto anexada é redimensionada pelo próprio Cloudinary (sem recorte,
   preservando a proporção original, sempre convertida pra JPG — não
   importa o formato original) só pra limitar o tamanho do arquivo: assim
   o Word sempre recebe um JPG de resolução previsível, mesmo que o anexo
   original seja HEIC/PNG/WEBP. No relatório a foto entra em tamanho
   grande — o suficiente pra ser analisada de verdade, não só uma
   miniatura de referência — numa seção própria "Registro fotográfico"
   logo depois da tabela de cada pavimento, e continua clicável, abrindo a
   foto original (em tamanho cheio) no navegador. Documentos que não são
   foto (PDF, etc.) entram como um link com o nome do arquivo — não dá pra
   "desenhar" um PDF como imagem. */
var DOCX_ANEXO_FOTO_MAX_PX = 1600;
var DOCX_ANEXO_FOTO_MAX_CX = 5040000; // ~14cm de largura máxima no documento
var DOCX_ANEXO_FOTO_MAX_CY = 6480000; // ~18cm de altura máxima no documento
function docxUrlFotoRelatorio(url){
  // c_limit (sem recorte) com largura E altura máximas: o Cloudinary só
  // reduz a imagem (nunca aumenta) até caber nesse quadro, preservando a
  // proporção original — diferente do antigo c_fill, que recortava um
  // quadrado fixo.
  var transform = "c_limit,w_"+DOCX_ANEXO_FOTO_MAX_PX+",h_"+DOCX_ANEXO_FOTO_MAX_PX+",q_auto:good,f_jpg";
  return url.indexOf("/image/upload/")!==-1 ? url.replace("/image/upload/", "/image/upload/"+transform+"/") : url;
}
async function docxBaixarComoBlob(url){
  var resp = await fetch(url);
  if(!resp.ok) throw new Error("HTTP "+resp.status);
  return await resp.blob();
}
// Mede a foto já baixada (largura/altura reais em pixels) carregando-a
// numa <img> na própria página — assim dá pra calcular o tamanho de
// exibição no Word preservando a proporção original (sem esticar/achatar
// a imagem). Se por algum motivo não conseguir medir, retorna null e o
// chamador usa um tamanho padrão.
function docxMedirImagem(blob){
  return new Promise(function(resolve){
    try{
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function(){
        var w = img.naturalWidth||0, h = img.naturalHeight||0;
        URL.revokeObjectURL(url);
        resolve((w&&h) ? {w:w, h:h} : null);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    }catch(ex){ resolve(null); }
  });
}
// Calcula o tamanho de exibição (em EMU) da foto no documento, tipo
// "object-fit: contain" dentro de um quadro máximo de
// DOCX_ANEXO_FOTO_MAX_CX x DOCX_ANEXO_FOTO_MAX_CY, preservando a proporção
// real da imagem.
function docxCalcularExtentImagem(pxW, pxH){
  if(!pxW || !pxH){
    return { cx: DOCX_ANEXO_FOTO_MAX_CX, cy: Math.round(DOCX_ANEXO_FOTO_MAX_CX*0.75) };
  }
  var r = pxW/pxH;
  var cx = DOCX_ANEXO_FOTO_MAX_CX, cy = Math.round(cx/r);
  if(cy > DOCX_ANEXO_FOTO_MAX_CY){ cy = DOCX_ANEXO_FOTO_MAX_CY; cx = Math.round(cy*r); }
  return { cx:cx, cy:cy };
}
function docxImagemInlineXml(relId, idNum, nomeAlt, hlinkRelId, cx, cy){
  cx = cx || DOCX_ANEXO_FOTO_MAX_CX;
  cy = cy || Math.round(DOCX_ANEXO_FOTO_MAX_CX*0.75);
  var cNvPr = '<pic:cNvPr id="'+idNum+'" name="'+docxEscape(nomeAlt)+'">'
    + (hlinkRelId ? '<a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:id="'+hlinkRelId+'"/>' : '')
    + '</pic:cNvPr>';
  return '<w:r><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="45720" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
      + '<wp:extent cx="'+cx+'" cy="'+cy+'"/>'
      + '<wp:docPr id="'+idNum+'" name="'+docxEscape(nomeAlt)+'"/>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
          + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            + '<pic:nvPicPr>'+cNvPr+'<pic:cNvPicPr/></pic:nvPicPr>'
            + '<pic:blipFill><a:blip r:embed="'+relId+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
          + '</pic:pic>'
        + '</a:graphicData>'
      + '</a:graphic>'
    + '</wp:inline>'
  + '</w:drawing></w:r>';
}
function docxParImagem(drawingRunXml, opts){
  opts = opts||{};
  var ppr = '<w:jc w:val="'+(opts.align||"center")+'"/>'
    + '<w:spacing w:before="'+(opts.spacingBefore!=null?opts.spacingBefore:60)+'" w:after="'+(opts.spacingAfter!=null?opts.spacingAfter:200)+'"/>';
  return "<w:p><w:pPr>"+ppr+"</w:pPr>"+drawingRunXml+"</w:p>";
}
function docxHyperlinkRunXml(relId, texto, opts){
  opts = opts||{};
  var rpr = '<w:rPr><w:color w:val="'+DOCX_COR_ACCENT+'"/><w:u w:val="single"/>'+(opts.sz?'<w:sz w:val="'+opts.sz+'"/><w:szCs w:val="'+opts.sz+'"/>':'')+'</w:rPr>';
  return '<w:hyperlink r:id="'+relId+'"><w:r>'+rpr+'<w:t xml:space="preserve">'+docxEscape(texto)+'</w:t></w:r></w:hyperlink>';
}
// Baixa (melhor esforço) todas as fotos/documentos anexados às NCs do
// relatório atual, preparando as relações (rels) e os arquivos de mídia
// que vão dentro do .docx. Uma foto que não pode ser baixada (rede caiu,
// link expirou etc.) é simplesmente pulada — não trava o relatório
// inteiro por causa de uma foto só.
async function docxPrepararAnexosNc(todas){
  var proximoRelId = 2; // rId1 já é usado pelo relacionamento com styles.xml
  var proximoDocPrId = 1;
  var extraRels = [];  // {id, type:"image"|"hyperlink", target}
  var mediaFiles = []; // {name, buffer}
  var anexoInfo = new Map(); // chave "fichaId:idx:ai" -> {relIdImagem?, relIdLink?, docPrId?}
  var tarefas = [];

  todas.forEach(function(item){
    (item.anexos||[]).forEach(function(a, ai){
      var chave = item.fichaId+":"+item.idx+":"+ai;
      if(ctx.ncAnexoEhImagem(a)){
        tarefas.push((async function(){
          try{
            var blob = await docxBaixarComoBlob(docxUrlFotoRelatorio(a.url));
            var dims = await docxMedirImagem(blob);
            var extent = docxCalcularExtentImagem(dims&&dims.w, dims&&dims.h);
            var buffer = await blob.arrayBuffer();
            var relIdImg = "rId"+(proximoRelId++);
            var relIdLink = "rId"+(proximoRelId++);
            var nomeArquivo = "image"+mediaFiles.length+".jpg";
            mediaFiles.push({ name:nomeArquivo, buffer:buffer });
            extraRels.push({ id:relIdImg, type:"image", target:"media/"+nomeArquivo });
            extraRels.push({ id:relIdLink, type:"hyperlink", target:a.url });
            anexoInfo.set(chave, { relIdImagem:relIdImg, relIdLink:relIdLink, docPrId:(proximoDocPrId++), cx:extent.cx, cy:extent.cy });
          }catch(ex){
            console.error("relatório NC: não foi possível baixar a foto", a.url, ex);
          }
        })());
      } else {
        var relIdLink2 = "rId"+(proximoRelId++);
        extraRels.push({ id:relIdLink2, type:"hyperlink", target:a.url });
        anexoInfo.set(chave, { relIdLink:relIdLink2 });
      }
    });
  });

  await Promise.all(tarefas);
  return { extraRels:extraRels, mediaFiles:mediaFiles, anexoInfo:anexoInfo };
}
// Monta a seção "Registro fotográfico" de um grupo (pavimento): pra cada
// item que tem foto/documento anexado, imprime um mini-título (ficha +
// descrição da NC) seguido da(s) foto(s) em tamanho grande — o suficiente
// pra analisar de verdade os detalhes da não conformidade — e dos links
// dos documentos que não são foto. Fica separada da tabela principal
// (que continua enxuta, só com o texto) pra dar espaço de verdade às
// fotos. Retorna "" se nenhum item do grupo tiver anexo.
function docxSecaoRegistroFotografico(itens, anexoInfo){
  var partes = "";
  itens.forEach(function(item){
    var algumAnexo = (item.anexos||[]).some(function(a, ai){ return anexoInfo.get(item.fichaId+":"+item.idx+":"+ai); });
    if(!algumAnexo) return;
    var f = item.ficha;
    partes += docxPar("Ficha "+(f.numero||"s/ nº")+" — "+(item.descricao||"—"),
      {bold:true, sz:17, color:DOCX_COR_ACCENT, spacingBefore:160, spacingAfter:80, borderBottom:DOCX_COR_BORDA});
    (item.anexos||[]).forEach(function(a, ai){
      var info = anexoInfo.get(item.fichaId+":"+item.idx+":"+ai);
      if(!info) return; // sem info = download falhou (melhor esforço) ou não tinha url
      if(info.relIdImagem){
        partes += docxParImagem(docxImagemInlineXml(info.relIdImagem, info.docPrId, a.nome||"foto", info.relIdLink, info.cx, info.cy));
        partes += docxPar("Clique na imagem para abrir a foto original em tamanho cheio.", {italic:true, color:"7F7F7F", sz:13, align:"center", spacingBefore:0, spacingAfter:180});
      } else if(info.relIdLink){
        partes += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="160"/></w:pPr>'+docxHyperlinkRunXml(info.relIdLink, "📎 "+(a.nome||"documento"), {sz:16})+'</w:p>';
      }
    });
  });
  if(!partes) return "";
  return docxPar("Registro fotográfico", {bold:true, color:"FFFFFF", shd:DOCX_COR_ACCENT, sz:19, spacingBefore:60, spacingAfter:80}) + partes;
}
async function gerarRelatorioNcWord(){
  try{ await garantirLibs(); }catch(ex){ console.error(ex); }
  var rel = ctx.buildRelatorioNc();
  var todas = rel.todas;
  var grupos = rel.grupos.filter(function(g){ return g.itens.length>0; });
  var abertas = todas.filter(function(i){ return !i.concluida; }).length;
  var concluidas = todas.length - abertas;

  if(todas.length===0){
    alert("Nenhuma não conformidade encontrada com os filtros atuais — ajuste os filtros antes de gerar o relatório.");
    return;
  }

  // Baixar as fotos anexadas pode levar alguns segundos (depende da
  // internet e de quantas NCs têm foto) — trava o botão nesse meio tempo
  // pra não deixar a pessoa achar que travou ou clicar duas vezes.
  var btnRelatorio = document.getElementById("btn-relatorio-nc");
  var btnRelatorioTextoOriginal = btnRelatorio ? btnRelatorio.textContent : "";
  if(btnRelatorio){ btnRelatorio.disabled = true; btnRelatorio.textContent = "Gerando relatório… (baixando fotos)"; }
  var anexosPreparados;
  try{
    anexosPreparados = await docxPrepararAnexosNc(todas);
  } finally {
    if(btnRelatorio){ btnRelatorio.disabled = false; btnRelatorio.textContent = btnRelatorioTextoOriginal; }
  }
  var extraRelsAnexos = anexosPreparados.extraRels;
  var mediaFilesAnexos = anexosPreparados.mediaFiles;
  var anexoInfoMap = anexosPreparados.anexoInfo;

  var agora = new Date();
  function pad2(n){ return String(n).length<2?"0"+n:String(n); }
  var geradoEm = pad2(agora.getDate())+"/"+pad2(agora.getMonth()+1)+"/"+agora.getFullYear()+" às "+pad2(agora.getHours())+":"+pad2(agora.getMinutes());
  var destinatario = (ctx.filtrosNc.destinatario||"").trim();

  var body = "";

  // ---- faixa de cabeçalho (letterhead) ----
  body += docxPar("TRAÇO INTEGRADO", {align:"center", shd:DOCX_COR_FAIXA, color:"FFFFFF", bold:true, sz:40, spacingBefore:120, spacingAfter:20});
  body += docxPar((DEFAULT_OBRA||"").toUpperCase(), {align:"center", shd:DOCX_COR_FAIXA, color:"FFFFFF", sz:19, spacingBefore:0, spacingAfter:120});
  body += docxPar("", {spacingAfter:120});
  body += docxPar("RELATÓRIO DE NÃO CONFORMIDADES", {align:"center", bold:true, color:DOCX_COR_FAIXA, sz:34, spacingAfter:20});
  body += docxPar("Documento para acompanhamento e notificação de não conformidades de execução", {align:"center", italic:true, color:"595959", sz:17, spacingAfter:220});

  // ---- bloco de identificação do documento ----
  var infoLinhas = [["Gerado em", geradoEm], ["Elaborado por", ctx.currentUserEmail||"—"]];
  if(destinatario) infoLinhas.push(["Empreiteira / Destinatário", destinatario]);
  infoLinhas.push(["Filtros aplicados", ctx.descricaoFiltrosNc()]);
  body += docxTable([2200, DOCX_LARGURA_UTIL-2200], infoLinhas.map(function(par){
    return [
      docxCelTexto(par[0], 2200, {bold:true, sz:17}, {shd:DOCX_COR_CINZA_CLARO, vAlign:"top"}),
      docxCelTexto(par[1], DOCX_LARGURA_UTIL-2200, {sz:17}, {vAlign:"top"})
    ];
  }));
  body += docxPar("", {spacingAfter:160});

  // ---- resumo (total / em aberto / concluídas) ----
  var wResumo = Math.floor(DOCX_LARGURA_UTIL/3);
  body += docxTable([wResumo, wResumo, DOCX_LARGURA_UTIL-2*wResumo], [
    docxCabecalhoTabela(["TOTAL NO RELATÓRIO","EM ABERTO","CONCLUÍDAS"], [wResumo, wResumo, DOCX_LARGURA_UTIL-2*wResumo]),
    [
      docxCelTexto(String(todas.length), wResumo, {align:"center", bold:true, sz:36, color:DOCX_COR_FAIXA, spacingBefore:80, spacingAfter:80}),
      docxCelTexto(String(abertas), wResumo, {align:"center", bold:true, sz:36, color:DOCX_COR_RUIM, spacingBefore:80, spacingAfter:80}),
      docxCelTexto(String(concluidas), DOCX_LARGURA_UTIL-2*wResumo, {align:"center", bold:true, sz:36, color:DOCX_COR_BOM, spacingBefore:80, spacingAfter:80})
    ]
  ]);
  body += docxPar("", {spacingAfter:220});

  // ---- detalhe por pavimento ----
  var wCols = [1500, 3006, 3006, 1100, 1294]; // Ficha / Descrição / Correção / Situação / Dias-Data
  grupos.forEach(function(g, gi){
    var abertasG = g.itens.filter(function(i){ return !i.concluida; }).length;
    var concluidasG = g.itens.length - abertasG;
    body += docxPar(g.label.toUpperCase()+"   ·   "+g.itens.length+" NC(s)   ·   "+abertasG+" em aberto   ·   "+concluidasG+" concluída(s)",
      {bold:true, color:"FFFFFF", shd:DOCX_COR_ACCENT, sz:19, spacingBefore:gi>0?160:0, spacingAfter:80});

    var linhasTabela = [docxCabecalhoTabela(["Ficha","Descrição da NC","Correção proposta","Situação","Dias / Conclusão"], wCols)];
    g.itens.forEach(function(item){
      var f = item.ficha;
      var fichaTxt = (f.descricao||f.codigo||"FVS")+"\nNº "+(f.numero||"s/ nº");
      var sitTxt = item.concluida ? "Concluída" : "Em aberto";
      var sitCor = item.concluida ? DOCX_COR_BOM : DOCX_COR_RUIM;
      var diasTxt = item.concluida
        ? "Concluída em\n"+(item.dataConclusao?fmtDateBR(item.dataConclusao):"—")
        : (item.diasAberto!=null ? item.diasAberto+" dia(s)\nem aberto" : "—");
      linhasTabela.push([
        docxCelTexto(fichaTxt, wCols[0], {sz:16, bold:true}),
        docxCelTexto(item.descricao||"—", wCols[1], {sz:16}),
        docxCelTexto(item.correcao||"—", wCols[2], {sz:16}),
        docxCelTexto(sitTxt, wCols[3], {sz:16, bold:true, color:sitCor, align:"center"}),
        docxCelTexto(diasTxt, wCols[4], {sz:15, align:"center"})
      ]);
    });
    body += docxTable(wCols, linhasTabela);
    body += docxSecaoRegistroFotografico(g.itens, anexoInfoMap);
  });

  // ---- encerramento / recebimento ----
  body += docxPar("", {spacingAfter:260});
  body += docxPar("Recebimento", {bold:true, color:DOCX_COR_FAIXA, sz:22, spacingAfter:140, borderBottom:DOCX_COR_BORDA});
  body += docxPar("Empreiteira / responsável: "+(destinatario||"______________________________________________"), {sz:17, spacingAfter:200});
  body += docxPar("Assinatura: ___________________________________________________     Data: ____ / ____ / ______", {sz:17, spacingAfter:160});
  body += docxPar("Documento gerado automaticamente pelo sistema Traço Integrado, a partir dos registros de campo cadastrados nas fichas FVS.", {italic:true, color:"7F7F7F", sz:14, spacingAfter:0});

  var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + "<w:body>"
    + body
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="1000" w:bottom="900" w:left="1000" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    + "</w:body></w:document>";

  var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + (mediaFilesAnexos.length ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : '')
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + "</Types>";

  var rootRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    + "</Relationships>";

  var docRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + extraRelsAnexos.map(function(r){
        if(r.type==="image"){
          return '<Relationship Id="'+r.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="'+docxEscape(r.target)+'"/>';
        }
        return '<Relationship Id="'+r.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+docxEscape(r.target)+'" TargetMode="External"/>';
      }).join("")
    + "</Relationships>";

  var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + "</w:styles>";

  var coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + "<dc:title>Relatório de Não Conformidades</dc:title>"
    + "<dc:creator>Traço Integrado</dc:creator>"
    + "</cp:coreProperties>";

  var appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Traço Integrado</Application></Properties>';

  var zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.folder("_rels").file(".rels", rootRelsXml);
  zip.folder("word").file("document.xml", documentXml);
  zip.folder("word").file("styles.xml", stylesXml);
  zip.folder("word/_rels").file("document.xml.rels", docRelsXml);
  zip.folder("docProps").file("core.xml", coreXml);
  zip.folder("docProps").file("app.xml", appXml);
  if(mediaFilesAnexos.length){
    var pastaMedia = zip.folder("word/media");
    mediaFilesAnexos.forEach(function(m){ pastaMedia.file(m.name, m.buffer); });
  }

  zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}).then(function(blob){
    triggerDownload(blob, "Relatorio_NaoConformidades_"+todayISO()+".docx");
  });
}

export { gerarRelatorioNcWord };
