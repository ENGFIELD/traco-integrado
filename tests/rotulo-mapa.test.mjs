// Teste do rótulo BT do mapeamento: node tests/rotulo-mapa.test.mjs
import { centroVisual, rotuloArea } from "../src/modulos/rastreabilidade/rotulo-mapa.js";

let falhas = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };
const dentro = (x, y, pol) => { let d = false; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) { const a = pol[i], b = pol[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) d = !d; } return d; };

// retângulo: centro no meio
const ret = [[0, 0], [100, 0], [100, 50], [0, 50]];
const c1 = centroVisual(ret);
ok(Math.abs(c1.x - 50) < 2 && Math.abs(c1.y - 25) < 1 && Math.abs(c1.d - 25) < 1, `retângulo → (${c1.x.toFixed(1)}, ${c1.y.toFixed(1)}) d=${c1.d.toFixed(1)}`);

// L (como o BT 3 do print): a média dos cantos cai fora / na quina
const L = [[0, 0], [30, 0], [30, 70], [100, 70], [100, 100], [0, 100]];
const media = [L.reduce((t, p) => t + p[0], 0) / L.length, L.reduce((t, p) => t + p[1], 0) / L.length];
const c2 = centroVisual(L);
ok(dentro(c2.x, c2.y, L) && c2.d >= 14, `L → centro visual dentro da área, ${c2.d.toFixed(1)} da borda (média dos cantos: ${media.map((v) => v.toFixed(0))})`);

// tamanho: limitado pela largura da planta
const W = 4000, H = 2800;
const grande = rotuloArea([[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]], W, H, { bt: "BT 1", nf: "NF: 204254" });
ok(Math.abs(grande.fs - W * 0.011) < 0.01, "área enorme → fonte no máximo (" + grande.fs.toFixed(0) + " px)");
const pequena = rotuloArea([[0.5, 0.5], [0.51, 0.5], [0.51, 0.51], [0.5, 0.51]], W, H, { bt: "BT 1", nf: "" });
ok(Math.abs(pequena.fs - W * 0.0055) < 0.01, "área minúscula → fonte no mínimo (" + pequena.fs.toFixed(0) + " px)");
const media2 = rotuloArea([[0.4, 0.4], [0.5, 0.4], [0.5, 0.46], [0.4, 0.46]], W, H, { bt: "BT 2", nf: "NF: 1234" });
ok(media2.fs > W * 0.0055 && media2.fs < W * 0.011 && media2.w / 2 < 200 && media2.h / 2 < 84, "área média → caixa cabe na área (fonte " + media2.fs.toFixed(0) + " px)");
ok(Math.abs(media2.x - 1800) < 5 && Math.abs(media2.y - 1204) < 5, "área média → rótulo no meio");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
