/* Coloca a imagem das assinaturas dentro do Excel exportado da FVS (v1.15).
 *
 * Trabalha direto no pacote .xlsx (JSZip): acrescenta as imagens em xl/media,
 * as âncoras no desenho (drawing) da aba — criando o desenho se a aba não
 * tiver — e as relações. Não mexe em nada que já existe no modelo oficial.
 *
 * Sem dependências além do objeto JSZip recebido: roda no navegador e no Node
 * (tests/xlsx-assinatura.test.mjs).
 */

const EMU_PT = 12700;           // 1 ponto = 12.700 EMU
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

/** data:image/png;base64,… → Uint8Array */
export function bytesDoDataUrl(dataUrl) {
  const b64 = String(dataUrl || "").split(",")[1] || "";
  if (typeof atob === "function") {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}
/** largura e altura de um PNG (cabeçalho IHDR) */
export function tamanhoPng(bytes) {
  const u = (i) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  return { w: u(16) || 1, h: u(20) || 1 };
}
// "../drawings/drawing3.xml" visto de xl/worksheets/ → "xl/drawings/drawing3.xml"
function resolver(base, alvo) {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = base.split("/"); partes.pop();
  alvo.split("/").forEach((p) => { if (p === "..") partes.pop(); else if (p !== ".") partes.push(p); });
  return partes.join("/");
}
const relsDe = (path) => { const p = path.split("/"), f = p.pop(); return p.join("/") + "/_rels/" + f + ".rels"; };
const relsVazio = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
function novoRid(relsXml, prefixo) {
  let n = 1;
  while (relsXml.indexOf(`Id="${prefixo}${n}"`) !== -1) n++;
  return prefixo + n;
}
function addRel(relsXml, id, tipo, alvo) {
  return relsXml.replace("</Relationships>", `<Relationship Id="${id}" Type="${tipo}" Target="${alvo}"/></Relationships>`);
}
// Ordem dos filhos de <worksheet>: <drawing> vem depois destes (CT_Worksheet)
const ANTES_DE_DRAWING = ["sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios", "autoFilter", "sortState", "dataConsolidate",
  "customSheetViews", "mergeCells", "phoneticPr", "conditionalFormatting", "dataValidations", "hyperlinks", "printOptions",
  "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags"];
function inserirDrawingNaAba(sheetXml, rid) {
  if (!/xmlns:r=/.test(sheetXml.slice(0, 600))) sheetXml = sheetXml.replace(/<worksheet\b/, `<worksheet xmlns:r="${NS_R}"`);
  const tag = `<drawing r:id="${rid}"/>`;
  // depois do último elemento que precisa vir antes
  let pos = -1;
  ANTES_DE_DRAWING.forEach((n) => {
    const re = new RegExp(`<${n}\\b[^>]*\\/>|<\\/${n}>`, "g");
    let m; while ((m = re.exec(sheetXml))) pos = Math.max(pos, m.index + m[0].length);
  });
  if (pos < 0) pos = sheetXml.indexOf("</sheetData>") + "</sheetData>".length;
  return sheetXml.slice(0, pos) + tag + sheetXml.slice(pos);
}
/** altura (pt) da linha r (1-based) da aba; padrão 15 pt */
export function alturaLinha(sheetXml, r) {
  const m = sheetXml.match(new RegExp(`<row\\b[^>]*\\br="${r}"[^>]*>`));
  const ht = m && m[0].match(/\bht="([\d.]+)"/);
  if (ht) return Number(ht[1]);
  const pad = sheetXml.match(/<sheetFormatPr\b[^>]*defaultRowHeight="([\d.]+)"/);
  return pad ? Number(pad[1]) : 15;
}

/** largura (EMU) das colunas c0..c1 (1-based), pelas <col> da aba; padrão 8,43 caracteres */
export function larguraColunas(sheetXml, c0, c1) {
  const cols = [];
  (sheetXml.match(/<col\b[^>]*\/>/g) || []).forEach((t) => {
    const min = +((t.match(/\bmin="(\d+)"/) || [])[1] || 0), max = +((t.match(/\bmax="(\d+)"/) || [])[1] || 0);
    const w = +((t.match(/\bwidth="([\d.]+)"/) || [])[1] || 8.43);
    cols.push({ min, max, w });
  });
  let tot = 0;
  for (let c = c0; c <= c1; c++) {
    const def = cols.find((x) => c >= x.min && c <= x.max);
    const ch = def ? def.w : 8.43;
    tot += Math.round(ch * 7 + 5) * 9525; // caracteres → px (Calibri 11) → EMU
  }
  return tot;
}

/**
 * zip: JSZip do .xlsx · sheetPath: "xl/worksheets/sheet1.xml" (o arquivo já
 * gravado no zip, com o texto final) · assinaturas: [{ imagem (data:image/png),
 * col (1-based), colFim (última coluna do campo, 1-based), row (1-based) }]
 * A imagem fica dentro da célula indicada, entre o nome e a linha de assinatura
 * do modelo, com altura proporcional à da linha.
 */
export async function adicionarAssinaturasXlsx(zip, sheetPath, assinaturas) {
  const lista = (assinaturas || []).filter((a) => a && a.imagem && /^data:image\/png/.test(a.imagem));
  if (!lista.length) return;
  let sheetXml = await zip.file(sheetPath).async("string");
  const sheetRelsPath = relsDe(sheetPath);
  let sheetRels = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath).async("string") : relsVazio();
  let ct = await zip.file("[Content_Types].xml").async("string");

  // desenho da aba (usa o que existe — no modelo FVS 04 é o da logo)
  let drawingPath = null;
  const mDraw = sheetRels.match(new RegExp(`<Relationship\\b[^>]*Type="${REL_DRAWING.replace(/[/.]/g, "\\$&")}"[^>]*>`));
  if (mDraw && /<drawing\b/.test(sheetXml)) drawingPath = resolver(sheetPath, mDraw[0].match(/Target="([^"]+)"/)[1]);
  let drawingXml;
  if (drawingPath && zip.file(drawingPath)) {
    drawingXml = await zip.file(drawingPath).async("string");
  } else {
    let n = 1; while (zip.file(`xl/drawings/drawing${n}.xml`)) n++;
    drawingPath = `xl/drawings/drawing${n}.xml`;
    drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}"></xdr:wsDr>`;
    const rid = novoRid(sheetRels, "rIdAssinD");
    sheetRels = addRel(sheetRels, rid, REL_DRAWING, "../drawings/" + drawingPath.split("/").pop());
    sheetXml = inserirDrawingNaAba(sheetXml, rid);
    ct = ct.replace("</Types>", `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  if (!/xmlns:r=/.test(drawingXml.slice(0, 600))) drawingXml = drawingXml.replace(/<xdr:wsDr\b/, `<xdr:wsDr xmlns:r="${NS_R}"`);
  const drawingRelsPath = relsDe(drawingPath);
  let drawingRels = zip.file(drawingRelsPath) ? await zip.file(drawingRelsPath).async("string") : relsVazio();
  if (!/Extension="png"/i.test(ct)) ct = ct.replace("</Types>", `<Default Extension="png" ContentType="image/png"/></Types>`);

  // ids de objeto livres no desenho
  let idObj = 1000;
  (drawingXml.match(/<xdr:cNvPr\b[^>]*\bid="(\d+)"/g) || []).forEach((t) => { idObj = Math.max(idObj, Number(t.match(/id="(\d+)"/)[1]) + 1); });

  let ancoras = "";
  lista.forEach((a, i) => {
    const bytes = bytesDoDataUrl(a.imagem), tam = tamanhoPng(bytes);
    let n = 1; while (zip.file(`xl/media/assinatura${n}.png`)) n++;
    const media = `xl/media/assinatura${n}.png`;
    zip.file(media, bytes);
    const rid = novoRid(drawingRels, "rIdAssin");
    drawingRels = addRel(drawingRels, rid, REL_IMAGE, "../media/" + media.split("/").pop());
    // tamanho: ~1/3 da altura da linha (máx. 1,3 cm), largura pela proporção (máx. 4,5 cm)
    const htPt = alturaLinha(sheetXml, a.row);
    // a.alt / a.pe (opcionais): altura da imagem e posição do pé, em fração da altura da linha
    let hEmu = Math.min(htPt * (a.alt || 0.34) * EMU_PT, 468000);
    let wEmu = hEmu * tam.w / tam.h;
    if (wEmu > 1620000) { wEmu = 1620000; hEmu = wEmu * tam.h / tam.w; }
    // no meio do campo (entre o nome e a linha "____" do modelo)
    const larg = larguraColunas(sheetXml, a.col, a.colFim || a.col);
    const offX = Math.max(0, Math.round((larg - wEmu) / 2));
    // o pé da assinatura encosta na linha "____" (que fica a ~2/3 da altura do campo)
    const pe = a.pe || 0.68;
    const offY = Math.round(Math.max(htPt * (a.pe ? 0.2 : 0.3) * EMU_PT, htPt * pe * EMU_PT - hEmu));
    ancoras += `<xdr:oneCellAnchor><xdr:from><xdr:col>${a.col - 1}</xdr:col><xdr:colOff>${offX}</xdr:colOff><xdr:row>${a.row - 1}</xdr:row><xdr:rowOff>${offY}</xdr:rowOff></xdr:from>`
      + `<xdr:ext cx="${Math.round(wEmu)}" cy="${Math.round(hEmu)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${idObj + i}" name="Assinatura ${i + 1}"/>`
      + `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
      + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(wEmu)}" cy="${Math.round(hEmu)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  });
  drawingXml = drawingXml.replace("</xdr:wsDr>", ancoras + "</xdr:wsDr>");

  zip.file(sheetPath, sheetXml);
  zip.file(sheetRelsPath, sheetRels);
  zip.file(drawingPath, drawingXml);
  zip.file(drawingRelsPath, drawingRels);
  zip.file("[Content_Types].xml", ct);
}

/** v1.20: centraliza a 1ª imagem do desenho (ex.: logo da SIG) na caixa das colunas
 * c0..c1 (1-based) da linha r (1-based). Devolve o XML do desenho alterado. */
export function centralizarImagemNaCaixa(drawingXml, sheetXml, c0, c1, r) {
  return drawingXml.replace(/<xdr:oneCellAnchor>([\s\S]*?)<\/xdr:oneCellAnchor>/, (anc, corpo) => {
    const ext = /<xdr:ext cx="(\d+)" cy="(\d+)"\/>/.exec(corpo);
    if (!ext) return anc;
    const larg = larguraColunas(sheetXml, c0, c1), alt = alturaLinha(sheetXml, r) * EMU_PT;
    const offX = Math.max(0, Math.round((larg - Number(ext[1])) / 2)), offY = Math.max(0, Math.round((alt - Number(ext[2])) / 2));
    return anc.replace(/<xdr:from>[\s\S]*?<\/xdr:from>/, `<xdr:from><xdr:col>${c0 - 1}</xdr:col><xdr:colOff>${offX}</xdr:colOff><xdr:row>${r - 1}</xdr:row><xdr:rowOff>${offY}</xdr:rowOff></xdr:from>`);
  });
}
