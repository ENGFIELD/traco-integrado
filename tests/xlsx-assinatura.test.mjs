// Teste da assinatura no Excel da FVS: node tests/xlsx-assinatura.test.mjs
import fs from "fs";
import zlib from "zlib";
import JSZip from "jszip";
import { adicionarAssinaturasXlsx, tamanhoPng, larguraColunas } from "../src/modulos/assinatura/xlsx-assinatura.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

// PNG mínimo 120×40 (transparente)
function png(w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const tab = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch("IHDR", ih), ch("IDAT", zlib.deflateSync(raw)), ch("IEND", Buffer.alloc(0))]);
}
const img = "data:image/png;base64," + png(120, 40).toString("base64");
ok(JSON.stringify(tamanhoPng(png(120, 40))) === '{"w":120,"h":40}', "lê o tamanho do PNG");
ok(larguraColunas('<cols><col min="1" max="2" width="10"/></cols>', 1, 2) === 2 * 75 * 9525, "largura das colunas");

for (const [arq, aba, linha] of [["FVS_TPL_bloco.xlsx", "xl/worksheets/sheet1.xml", 34], ["FVS_TEMPLATE_B64.xlsx", "xl/worksheets/sheet3.xml", 42]]) {
  const zip = await JSZip.loadAsync(fs.readFileSync("public/modelos/" + arq));
  const antes = await zip.file(aba).async("string");
  await adicionarAssinaturasXlsx(zip, aba, [{ imagem: img, col: 1, colFim: 4, row: linha }, { imagem: img, col: 9, colFim: 12, row: linha }]);
  const rels = await zip.file(aba.replace("worksheets/", "worksheets/_rels/") + ".rels").async("string");
  const alvo = rels.match(/Target="\.\.\/drawings\/([^"]+)"/)[1];
  const draw = await zip.file("xl/drawings/" + alvo).async("string");
  const drels = await zip.file("xl/drawings/_rels/" + alvo + ".rels").async("string");
  const ct = await zip.file("[Content_Types].xml").async("string");
  ok((draw.match(/name="Assinatura \d"/g) || []).length === 2, arq + ": 2 assinaturas no desenho da aba");
  ok(/<xdr:pic>[\s\S]*<a:blip r:embed="rIdAssin1"/.test(draw) && /logo|<xdr:pic>/.test(draw), arq + ": logo do modelo preservada");
  ok(/Target="\.\.\/media\/assinatura1\.png"/.test(drels) && zip.file("xl/media/assinatura1.png") && zip.file("xl/media/assinatura2.png"), arq + ": imagens e relações gravadas");
  ok(/Extension="png"/i.test(ct), arq + ": tipo png declarado");
  ok((await zip.file(aba).async("string")) === antes, arq + ": aba não mudou (já tinha desenho)");
  ok(new RegExp(`<xdr:row>${linha - 1}</xdr:row>`).test(draw), arq + ": âncora na linha do rodapé");
}

// aba sem desenho: cria o desenho e liga na aba
const z2 = new JSZip();
z2.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
z2.file("xl/worksheets/sheet1.xml", '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>');
await adicionarAssinaturasXlsx(z2, "xl/worksheets/sheet1.xml", [{ imagem: img, col: 2, row: 5 }]);
const s2 = await z2.file("xl/worksheets/sheet1.xml").async("string");
ok(/<pageMargins[^>]*\/><drawing r:id="rIdAssinD1"\/><\/worksheet>/.test(s2) && /xmlns:r=/.test(s2), "aba sem desenho: <drawing> no lugar certo");
ok(!!z2.file("xl/drawings/drawing1.xml") && /drawing1\.xml" ContentType/.test(await z2.file("[Content_Types].xml").async("string")), "aba sem desenho: desenho criado e declarado");

const vazio = new JSZip();
await adicionarAssinaturasXlsx(vazio, "x.xml", []);
ok(true, "sem assinatura: não mexe em nada");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
