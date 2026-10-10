// Teste das peças lidas da planta de forma (v1.37): node tests/pecas-planta.test.mjs
import { pecasNaArea } from "../src/modulos/rastreabilidade/pecas-planta.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

const area = [[0.05, 0.05], [0.2, 0.05], [0.2, 0.2], [0.05, 0.2]];
const pecas = [{ n: "V105", x: 0.11, y: 0.095 }, { n: "P12", x: 0.203, y: 0.1 }, { n: "L3", x: 0.12, y: 0.15 }, { n: "P40", x: 0.6, y: 0.6 }];
ok(pecasNaArea(area, pecas).join(",") === "P12,V105,L3", "área: peças dentro e encostadas na borda, ordem P → V → L (" + pecasNaArea(area, pecas).join(",") + ")");

// v1.38 (regra do dono): qualquer pedaço da peça dentro da área conta — pilar, viga e laje
{
  const desenhadas = [
    { n: "V20", pontos: [[0.1, 0.5], [0.5, 0.5], [0.5, 0.52], [0.1, 0.52]] },   // viga: metade dentro
    { n: "P5", pontos: [[0.31, 0.45], [0.33, 0.45], [0.33, 0.48], [0.31, 0.48]] }, // pilar todo dentro
    { n: "V21", pontos: [[0.1, 0.6], [0.5, 0.6], [0.5, 0.62], [0.1, 0.62]] },   // viga: só uma pontinha dentro
    { n: "L8", pontos: [[0.75, 0.6], [0.9, 0.6], [0.9, 0.9], [0.75, 0.9]] },   // laje fora
  ];
  const areaBt = [[0.3, 0.4], [0.7, 0.4], [0.7, 0.605], [0.3, 0.605]];
  ok(pecasNaArea(areaBt, desenhadas).join(",") === "P5,V20,V21", "uma pontinha basta: entra a viga com só a ponta dentro; laje de fora não (" + pecasNaArea(areaBt, desenhadas).join(",") + ")");
  // área atravessa peças sem nenhum canto dentro uma da outra (só as bordas se cruzam)
  const faixa = [[0.0, 0.505], [1.0, 0.505], [1.0, 0.51], [0.0, 0.51]];
  ok(pecasNaArea(faixa, desenhadas).join(",") === "V20", "área que só cruza a peça (sem canto dentro) também conta");
  // o caso do dono: área passando por L4, V4a, L3 e P3
  const L4 = { n: "L4", pontos: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]] };
  const L3 = { n: "L3", pontos: [[0.32, 0.1], [0.5, 0.1], [0.5, 0.3], [0.32, 0.3]] };
  const V4a = { n: "V4A", pontos: [[0.3, 0.1], [0.32, 0.1], [0.32, 0.3], [0.3, 0.3]] };
  const P3 = { n: "P3", pontos: [[0.29, 0.29], [0.33, 0.29], [0.33, 0.33], [0.29, 0.33]] };
  const area = [[0.25, 0.2], [0.36, 0.2], [0.36, 0.3], [0.25, 0.3]];
  ok(pecasNaArea(area, [L4, L3, V4a, P3]).join(",") === "P3,V4A,L3,L4", "área sobre L4, V4a, L3 e P3 → as quatro entram (" + pecasNaArea(area, [L4, L3, V4a, P3]).join(",") + ")");
  // área só dentro do pilar que fica no meio da laje: só o pilar
  const laje = { n: "L9", pontos: [[0.6, 0.1], [0.9, 0.1], [0.9, 0.3], [0.6, 0.3]] };
  const pil = { n: "P9", pontos: [[0.7, 0.15], [0.74, 0.15], [0.74, 0.19], [0.7, 0.19]] };
  ok(pecasNaArea([[0.705, 0.155], [0.735, 0.155], [0.735, 0.185], [0.705, 0.185]], [laje, pil]).join(",") === "P9", "área só no pilar do meio da laje → só o pilar");
  ok(pecasNaArea([[0.65, 0.12], [0.85, 0.12], [0.85, 0.28], [0.65, 0.28]], [laje, pil]).join(",") === "P9,L9", "área da laje com o pilar dentro → laje e pilar");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
