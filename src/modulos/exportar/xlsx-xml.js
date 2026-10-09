/* Ferramentas para escrever nas planilhas .xlsx (o XML por dentro do arquivo):
 * texto, estilo, mesclagem, altura de linha, orientação da página e download.
 * Separado do main.js na v1.29 (fase A1). */

/* ---------------- Excel export (SheetJS / xlsx-js-style) ---------------- */
var THIN={style:"thin",color:{rgb:"BFBFBF"}};
var BORDER_ALL={top:THIN,bottom:THIN,left:THIN,right:THIN};
function styleAddr(ws,r,c,style){
  var addr = XLSX.utils.encode_cell({r:r,c:c});
  if(!ws[addr]) ws[addr] = {t:"s", v:""};
  ws[addr].s = Object.assign({}, ws[addr].s||{}, style);
}
function safeName(s){ return String(s||"sem_numero").replace(/[^\w-]+/g,"_").slice(0,40); }

// ---------------------------------------------------------------------------
// Exportação para Excel — geração via manipulação direta do XML (JSZip), sem
// passar pelo SheetJS/xlsx-js-style para ler+regravar o arquivo.
//
// Por quê: a biblioteca xlsx-js-style (edição gratuita) não preserva bordas,
// cores de preenchimento nem imagens/desenhos ao ler um arquivo existente e
// regravá-lo (mesmo pedindo {cellStyles:true}) — foi por isso que a logo da SIG
// sumia e, mais grave, todo o layout visual (faixas coloridas, bordas da
// tabela, células mescladas em negrito) saía diferente do modelo oficial.
//
// A solução: um arquivo .xlsx é só um .zip com arquivos XML dentro. Em vez de
// deixar uma biblioteca "reinterpretar" o arquivo, nós abrimos o .zip do
// modelo oficial (o base64 embutido), pegamos o texto bruto do XML da aba que
// interessa e da tabela de estilos, e fazemos apenas substituições cirúrgicas
// nesse texto: escrever o valor de uma célula, ou trocar o índice de estilo de
// uma célula por um novo estilo (clonado do original, só mudando a cor). Todo
// o resto do arquivo — bordas, fontes, a logo, os desenhos, a paginação —
// nunca é tocado, então fica garantidamente idêntico ao modelo.
// ---------------------------------------------------------------------------

function xmlEscape(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
// Escreve um texto numa célula existente (endereço tipo "B4"), preservando o
// estilo (atributo s="N") que a célula já tinha. Usa t="inlineStr" (texto
// embutido direto na célula) em vez de shared-strings ou t="str" — mais simples
// de gerar e 100% aceito tanto pelo Excel quanto pelo LibreOffice.
function xmlSetCellText(xml, addr, text){
  var re = new RegExp('<c r="'+addr+'"([^>]*?)(/>|>[\\s\\S]*?</c>)');
  var m = re.exec(xml);
  if(!m) return xml;
  var attrs = m[1].replace(/\st="[^"]*"/, "");
  var newCell = '<c r="'+addr+'"'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(text)+'</t></is></c>';
  return xml.slice(0, m.index) + newCell + xml.slice(m.index + m[0].length);
}
// v1.20: texto com partes de tamanhos diferentes na mesma célula — o rótulo do
// modelo continua pequeno e o valor preenchido sai em letra legível.
// partes: [{ t:"texto", sz:9, b:true, fonte:"Calibri" }]
function xmlSetCellRich(xml, addr, partes){
  var re = new RegExp('<c r="'+addr+'"([^>]*?)(/>|>[\\s\\S]*?</c>)');
  var m = re.exec(xml);
  if(!m) return xml;
  var attrs = m[1].replace(/\st="[^"]*"/, "");
  var runs = partes.filter(function(p){ return p.t; }).map(function(p){
    return '<r><rPr>'+(p.b?'<b/>':'')+'<sz val="'+(p.sz||9)+'"/><rFont val="'+(p.fonte||"Calibri")+'"/></rPr><t xml:space="preserve">'+xmlEscape(p.t)+'</t></r>';
  }).join("");
  var newCell = '<c r="'+addr+'"'+attrs+' t="inlineStr"><is>'+runs+'</is></c>';
  return xml.slice(0, m.index) + newCell + xml.slice(m.index + m[0].length);
}
function xmlGetCellStyleId(xml, addr){
  var re = new RegExp('<c r="'+addr+'"([^>]*?)(?:/>|>)');
  var m = re.exec(xml);
  if(!m) return "0";
  var sm = /\ss="(\d+)"/.exec(m[1]);
  return sm ? sm[1] : "0";
}
function xmlSetCellStyleId(xml, addr, newStyleId){
  var re = new RegExp('(<c r="'+addr+'")([^>]*?)((?:/>|>[\\s\\S]*?</c>))');
  return xml.replace(re, function(full, head, attrs, tail){
    attrs = /\ss="\d+"/.test(attrs) ? attrs.replace(/\ss="\d+"/, ' s="'+newStyleId+'"') : (attrs+' s="'+newStyleId+'"');
    return head+attrs+tail;
  });
}
function xfParts(xfXml){
  var selfClose = /^<xf\b([^>]*)\/>$/.exec(xfXml);
  if(selfClose) return {attrs: selfClose[1], children: null};
  var open = /^<xf\b([^>]*)>([\s\S]*)<\/xf>$/.exec(xfXml);
  return {attrs: open[1], children: open[2]};
}
function xfBuild(attrs, children){
  return children==null ? ('<xf'+attrs+'/>') : ('<xf'+attrs+'>'+children+'</xf>');
}
function xfSetAttr(attrs, name, value){
  var re = new RegExp('\\s'+name+'="[^"]*"');
  return re.test(attrs) ? attrs.replace(re, ' '+name+'="'+value+'"') : (attrs+' '+name+'="'+value+'"');
}
function getXfByIndex(stylesXml, idx){
  var m = /<cellXfs count="\d+"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  var list = m[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
  return list[parseInt(idx,10)] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
}
// Lê o tamanho (<sz val="...">) da fonte de índice fontId em <fonts> do
// styles.xml — usado para herdar o tamanho de letra já usado na célula
// original em vez de forçar um tamanho fixo (ver ensureColoredStyle).
function getFontSizeByFontId(stylesXml, fontId){
  var m = /<fonts count="\d+"[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
  if(!m) return null;
  var list = m[1].match(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g) || [];
  var fontXml = list[parseInt(fontId,10)];
  if(!fontXml) return null;
  var sm = /<sz val="([^"]+)"/.exec(fontXml);
  return sm ? sm[1] : null;
}
function bumpBlock(stylesXml, tag, newEntryXml){
  // Alguns modelos convertidos a partir de PDF (LibreOffice) gravam
  // atributos extras nessas tags (ex.: <fonts count="17" x14ac:knownFonts="1">),
  // então o count="N" nem sempre é seguido direto de ">".
  var re = new RegExp('<'+tag+' count="(\\d+)"[^>]*>([\\s\\S]*?)</'+tag+'>');
  var m = re.exec(stylesXml);
  var n = parseInt(m[1],10);
  var newXml = stylesXml.slice(0,m.index) + '<'+tag+' count="'+(n+1)+'">'+m[2]+newEntryXml+'</'+tag+'>' + stylesXml.slice(m.index+m[0].length);
  return {xml:newXml, index:n};
}
// Clona o estilo de uma célula (base) trocando só a cor da fonte/preenchimento —
// usado para marcar visualmente o "X" nas colunas de status do checklist (NA/
// Aprovado/Reprovado/Reinspecionado) com a mesma cor da legenda impressa.
// "state" é um objeto {stylesXml, styleCache} compartilhado durante uma
// exportação inteira, para não duplicar o mesmo estilo repetidas vezes.
function ensureColoredStyle(state, baseStyleId, fillRgb, fontRgb, fontName){
  fontName = fontName || "Calibri";
  var key = "c|"+baseStyleId+"|"+fillRgb+"|"+fontRgb+"|"+fontName;
  if(state.styleCache[key]!=null) return state.styleCache[key];
  var parts = xfParts(getXfByIndex(state.stylesXml, baseStyleId));
  // Herda o tamanho de fonte que a própria célula já tinha no modelo original,
  // em vez de forçar um tamanho fixo — antes isso deixava as marcações do
  // checklist (P/X/V/NA) menores do que o resto da ficha em quase todos os
  // tipos de FVS, mesmo quando o modelo original usava 12pt/14pt ali.
  var baseFontIdMatch = /\sfontId="(\d+)"/.exec(parts.attrs);
  var baseFontSize = getFontSizeByFontId(state.stylesXml, baseFontIdMatch ? baseFontIdMatch[1] : "0") || "10";
  var r1 = bumpBlock(state.stylesXml, "fonts", '<font><b/><sz val="'+baseFontSize+'"/><color rgb="FF'+fontRgb+'"/><name val="'+xmlEscape(fontName)+'"/></font>');
  state.stylesXml = r1.xml; var newFontId = r1.index;
  var r2 = bumpBlock(state.stylesXml, "fills", '<fill><patternFill patternType="solid"><fgColor rgb="FF'+fillRgb+'"/><bgColor indexed="64"/></patternFill></fill>');
  state.stylesXml = r2.xml; var newFillId = r2.index;
  var attrs = parts.attrs;
  attrs = xfSetAttr(attrs, "fontId", newFontId);
  attrs = xfSetAttr(attrs, "fillId", newFillId);
  attrs = xfSetAttr(attrs, "applyFont", "true");
  attrs = xfSetAttr(attrs, "applyFill", "true");
  var newXf = xfBuild(attrs, parts.children);
  var r3 = bumpBlock(state.stylesXml, "cellXfs", newXf);
  state.stylesXml = r3.xml;
  state.styleCache[key] = r3.index;
  return r3.index;
}
// Clona o estilo de uma célula (base) ligando a quebra de linha automática —
// usado nos campos onde rótulo+valor dividem a mesma célula mesclada (ver
// explicação em exportRastXlsx) e nos blocos de texto livre da FVS.
function ensureWrapStyle(state, baseStyleId){
  var key = "w|"+baseStyleId;
  if(state.styleCache[key]!=null) return state.styleCache[key];
  var baseXf = getXfByIndex(state.stylesXml, baseStyleId);
  var parts = xfParts(baseXf);
  var attrs = xfSetAttr(parts.attrs, "applyAlignment", "true");
  var children = parts.children;
  if(children==null){
    children = '<alignment wrapText="true"/>';
  } else if(/<alignment\b[^>]*\/>/.test(children)){
    children = children.replace(/<alignment\b([^>]*)\/>/, function(full,a){
      a = /wrapText="[^"]*"/.test(a) ? a.replace(/wrapText="[^"]*"/,'wrapText="true"') : a+' wrapText="true"';
      return '<alignment'+a+'/>';
    });
  } else if(/<alignment\b[^>]*>[\s\S]*?<\/alignment>/.test(children)){
    children = children.replace(/<alignment\b([^>]*)>/, function(full,a){
      a = /wrapText="[^"]*"/.test(a) ? a.replace(/wrapText="[^"]*"/,'wrapText="true"') : a+' wrapText="true"';
      return '<alignment'+a+'>';
    });
  } else {
    children = '<alignment wrapText="true"/>' + children;
  }
  var newXf = xfBuild(attrs, children);
  var r = bumpBlock(state.stylesXml, "cellXfs", newXf);
  state.stylesXml = r.xml;
  state.styleCache[key] = r.index;
  return r.index;
}
// v1.19: estilo com alinhamento sob medida (ex.: { shrinkToFit:"1", wrapText:"0", vertical:"top" }).
// "Reduzir para caber" mantém o texto numa linha só, sem mudar a altura da linha
// do modelo da SIG — a impressão fica igual ao papel.
function ensureAlignStyle(state, baseStyleId, alin){
  var key = "a|"+baseStyleId+"|"+JSON.stringify(alin);
  if(state.styleCache[key]!=null) return state.styleCache[key];
  var parts = xfParts(getXfByIndex(state.stylesXml, baseStyleId));
  var attrs = xfSetAttr(parts.attrs, "applyAlignment", "true");
  var children = parts.children || "";
  var aplicar = function(a){
    Object.keys(alin).forEach(function(k){
      var re = new RegExp('\\s'+k+'="[^"]*"');
      a = re.test(a) ? a.replace(re, ' '+k+'="'+alin[k]+'"') : a+' '+k+'="'+alin[k]+'"';
    });
    return a;
  };
  if(/<alignment\b[^>]*\/>/.test(children)) children = children.replace(/<alignment\b([^>]*)\/>/, function(f, a){ return '<alignment'+aplicar(a)+'/>'; });
  else if(/<alignment\b[^>]*>/.test(children)) children = children.replace(/<alignment\b([^>]*)>/, function(f, a){ return '<alignment'+aplicar(a)+'>'; });
  else children = '<alignment'+aplicar("")+'/>' + children;
  var r = bumpBlock(state.stylesXml, "cellXfs", xfBuild(attrs, children));
  state.stylesXml = r.xml;
  state.styleCache[key] = r.index;
  return r.index;
}
function xmlSetRowHeight(xml, rowNum, pts){
  var re = new RegExp('<row r="'+rowNum+'"([^>]*)>');
  var m = re.exec(xml);
  if(!m) return xml;
  var attrs = m[1].replace(/\sht="[^"]*"/, "").replace(/\scustomHeight="[^"]*"/, "");
  attrs += ' ht="'+pts+'" customHeight="true"';
  return xml.slice(0, m.index) + '<row r="'+rowNum+'"'+attrs+'>' + xml.slice(m.index+m[0].length);
}
function colRowFromRef(ref){
  var m = /^([A-Z]+)(\d+)$/.exec(ref);
  var col=0; for(var i=0;i<m[1].length;i++) col = col*26 + (m[1].charCodeAt(i)-64);
  return {col:col, row:parseInt(m[2],10)};
}
function xmlAddMerge(sheetXml, ref){
  if(new RegExp('<mergeCell ref="'+ref+'"/>').test(sheetXml)) return sheetXml;
  if(/<mergeCells count="(\d+)">/.test(sheetXml)){
    return sheetXml.replace(/<mergeCells count="(\d+)">/, function(full, n){
      return '<mergeCells count="'+(parseInt(n,10)+1)+'">';
    }).replace('</mergeCells>', '<mergeCell ref="'+ref+'"/></mergeCells>');
  } else {
    return sheetXml.replace('</sheetData>', '</sheetData><mergeCells count="1"><mergeCell ref="'+ref+'"/></mergeCells>');
  }
}
// O modelo original tem várias linhas mescladas separadamente (uma por linha,
// pensadas para preenchimento à mão) onde nós precisamos de um único bloco alto
// para o texto digitado quebrar linha normalmente — remove as mesclagens
// pequenas dentro do retângulo indicado (linhas/colunas 1-based) antes de
// adicionar a mesclagem única consolidada com xmlAddMerge.
function xmlRemoveMergesWithin(sheetXml, r1,c1,r2,c2){
  if(!/<mergeCells /.test(sheetXml)) return sheetXml;
  return sheetXml.replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/, function(full, n, body){
    var kept = [];
    var re = /<mergeCell ref="([^"]+)"\/>/g, mm;
    while((mm = re.exec(body))){
      var ref = mm[1];
      var parts = ref.split(":");
      var a = colRowFromRef(parts[0]), b = colRowFromRef(parts[1]||parts[0]);
      var inside = (a.row>=r1 && b.row<=r2 && a.col>=c1 && b.col<=c2);
      if(!inside) kept.push(mm[0]);
    }
    if(kept.length===0) return "";
    return '<mergeCells count="'+kept.length+'">'+kept.join("")+'</mergeCells>';
  });
}
// O modelo da Rastreabilidade não vem com paginação definida (imprime cortado
// em várias páginas retrato) — injeta orientação paisagem/ajuste de largura.
// O modelo da FVS-04 já traz essa configuração certa, então isso é ignorado.
// quantas linhas um texto ocupa numa caixa de ~larg caracteres (quebra por palavra, como o Excel)
function linhasQuebradas(texto, larg){
  var total = 0;
  String(texto||"").split(/\n/).forEach(function(par){
    var n = 1, atual = 0;
    par.split(/\s+/).filter(Boolean).forEach(function(w){
      var t = w.length;
      if(atual === 0) atual = t;
      else if(atual + 1 + t <= larg) atual += 1 + t;
      else { n++; atual = t; }
      while(atual > larg){ n++; atual -= larg; }
    });
    total += n;
  });
  return Math.max(1, total);
}
function xmlAddPageSetupLandscape(sheetXml){
  var xml = sheetXml;
  if(/<pageSetup\b/.test(xml)) return xml;
  if(!/<sheetPr>/.test(xml)){
    xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  }
  var setup = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>';
  if(/<pageMargins[^>]*\/>/.test(xml)){
    xml = xml.replace(/(<pageMargins[^>]*\/>)/, "$1"+setup);
  } else {
    xml = xml.replace("</worksheet>", setup+"</worksheet>");
  }
  return xml;
}
function triggerDownload(blob, filename){
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}

export { ensureAlignStyle, ensureColoredStyle, ensureWrapStyle, linhasQuebradas, safeName, triggerDownload, xmlAddMerge, xmlAddPageSetupLandscape, xmlGetCellStyleId, xmlRemoveMergesWithin, xmlSetCellRich, xmlSetCellStyleId, xmlSetCellText, xmlSetRowHeight };
