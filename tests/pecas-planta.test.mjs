// Teste das peças lidas da planta de forma (v1.37): node tests/pecas-planta.test.mjs
import { nomePeca, pecasDosItens, pecasNaArea, lerPecasDaPagina } from "../src/modulos/rastreabilidade/pecas-planta.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import pdfjsMod from "pdfjs-dist/legacy/build/pdf.js";
const pdfjs = pdfjsMod.getDocument ? pdfjsMod : pdfjsMod.default;

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

ok(nomePeca("V105") === "V105" && nomePeca("p 12") === "P12" && nomePeca("L-3") === "L3" && nomePeca("V105a") === "V105A" && nomePeca("PAR2") === "PAR2", "nomes de peça reconhecidos (V105, P 12, L-3, V105a, PAR2)");
ok(nomePeca("14x60") === "" && nomePeca("COTA") === "" && nomePeca("N+3,15") === "" && nomePeca("2") === "", "cotas e textos soltos não viram peça");

const itens = [{ str: "V", x: 100, y: 100, w: 8, h: 10 }, { str: "105", x: 109, y: 100, w: 20, h: 10 }, { str: "P12", x: 300, y: 300, w: 20, h: 10 }, { str: "V7 (14x60)", x: 500, y: 100, w: 60, h: 10 }];
const ps = pecasDosItens(itens, 1000, 1000);
ok(ps.map((p) => p.n).sort().join(",") === "P12,V105,V7", "junta “V” + “105” e lê “V7 (14x60)” (" + ps.map((p) => p.n).join(",") + ")");

const area = [[0.05, 0.05], [0.2, 0.05], [0.2, 0.2], [0.05, 0.2]];
const pecas = [{ n: "V105", x: 0.11, y: 0.095 }, { n: "P12", x: 0.203, y: 0.1 }, { n: "L3", x: 0.12, y: 0.15 }, { n: "P40", x: 0.6, y: 0.6 }];
ok(pecasNaArea(area, pecas).join(",") === "P12,V105,L3", "área: peças dentro e encostadas na borda, ordem P → V → L (" + pecasNaArea(area, pecas).join(",") + ")");

// PDF de verdade: textos com posição → lidos pelo pdf.js na mesma posição (0..1) que as áreas usam
const doc = await PDFDocument.create();
const pag = doc.addPage([1000, 700]);
const f = await doc.embedFont(StandardFonts.Helvetica);
pag.drawText("P12", { x: 100, y: 600, size: 12, font: f }); // perto do canto de cima à esquerda
pag.drawText("V105", { x: 500, y: 350, size: 12, font: f });
pag.drawText("L3", { x: 800, y: 100, size: 12, font: f });
pag.drawText("ESCALA 1:50", { x: 50, y: 30, size: 12, font: f });
const bytes = await doc.save();
const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true, isEvalSupported: false }).promise;
const lidas = await lerPecasDaPagina(await pdf.getPage(1));
const P = Object.fromEntries(lidas.map((p) => [p.n, p]));
ok(lidas.length === 3 && P.P12 && P.V105 && P.L3, "PDF: lê P12, V105 e L3 (e ignora “ESCALA 1:50”)");
ok(P.P12 && Math.abs(P.P12.x - 0.111) < 0.02 && Math.abs(P.P12.y - 0.137) < 0.02, "PDF: posição de P12 certa (topo à esquerda) → " + (P.P12 ? P.P12.x.toFixed(3) + "," + P.P12.y.toFixed(3) : "-"));
ok(pecasNaArea([[0.45, 0.45], [0.6, 0.45], [0.6, 0.55], [0.45, 0.55]], lidas).join(",") === "V105", "PDF: área desenhada em volta da V105 pega só a V105");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
