// Teste das peças lidas da planta de forma (v1.37): node tests/pecas-planta.test.mjs
import { pecasNaArea } from "../src/modulos/rastreabilidade/pecas-planta.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

const area = [[0.05, 0.05], [0.2, 0.05], [0.2, 0.2], [0.05, 0.2]];
const pecas = [{ n: "V105", x: 0.11, y: 0.095 }, { n: "P12", x: 0.203, y: 0.1 }, { n: "L3", x: 0.12, y: 0.15 }, { n: "P40", x: 0.6, y: 0.6 }];
ok(pecasNaArea(area, pecas).join(",") === "P12,V105,L3", "área: peças dentro e encostadas na borda, ordem P → V → L (" + pecasNaArea(area, pecas).join(",") + ")");

// peças desenhadas à mão (v1.37): entram se pelo menos 30% delas estiver dentro da área
const desenhadas = [
  { n: "V20", pontos: [[0.1, 0.5], [0.5, 0.5], [0.5, 0.52], [0.1, 0.52]] },   // viga: metade dentro
  { n: "P5", pontos: [[0.31, 0.45], [0.33, 0.45], [0.33, 0.48], [0.31, 0.48]] }, // pilar todo dentro
  { n: "V21", pontos: [[0.1, 0.6], [0.5, 0.6], [0.5, 0.62], [0.1, 0.62]] },   // viga: só 10% dentro
  { n: "L8", pontos: [[0.6, 0.6], [0.9, 0.6], [0.9, 0.9], [0.6, 0.9]] },     // laje fora
];
const areaBt = [[0.3, 0.4], [0.7, 0.4], [0.7, 0.605], [0.3, 0.605]];
ok(pecasNaArea(areaBt, desenhadas).join(",") === "P5,V20", "peças desenhadas: entra o pilar todo dentro e a viga com metade dentro; não entra a viga com só uma ponta (" + pecasNaArea(areaBt, desenhadas).join(",") + ")");

// laje com pilares no meio: a área dos pilares é descontada e os pilares não entram junto com a laje
{
  const laje = { n: "L4", pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.3], [0.1, 0.3]] };
  const pil = [0.15, 0.25, 0.35, 0.45].map((x, i) => ({ n: "P" + (i + 1), pontos: [[x - 0.02, 0.18], [x + 0.02, 0.18], [x + 0.02, 0.22], [x - 0.02, 0.22]] }));
  const todas = [laje, ...pil];
  const btLaje = [[0.08, 0.08], [0.52, 0.08], [0.52, 0.32], [0.08, 0.32]];
  ok(pecasNaArea(btLaje, todas).join(",") === "L4", "BT da laje: entra a L4 e não os pilares de dentro (" + pecasNaArea(btLaje, todas).join(",") + ")");
  const btPilar = [[0.12, 0.17], [0.18, 0.17], [0.18, 0.23], [0.12, 0.23]];
  ok(pecasNaArea(btPilar, todas).join(",") === "P1", "BT só do pilar: entra o P1 e não a laje (" + pecasNaArea(btPilar, todas).join(",") + ")");
  // 30% da laje: com o desconto dos pilares, a parte de laje de verdade é que conta
  const metade = [[0.08, 0.08], [0.24, 0.08], [0.24, 0.32], [0.08, 0.32]];
  ok(pecasNaArea(metade, todas).includes("L4"), "BT com ~35% da laje (descontados os pilares) → a laje entra");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
