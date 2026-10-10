// Teste do rótulo BT do mapeamento: node tests/rotulo-mapa.test.mjs
import { centroVisual, rotuloArea, planejarRotulos, coresDistintas, diferencaCor } from "../src/modulos/rastreabilidade/rotulo-mapa.js";

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

// v1.36: área pequena demais → rótulo fora, sem cobrir a área vizinha nem o outro rótulo
{
  const grandeA = { pontos: [[0.3, 0.3], [0.6, 0.3], [0.6, 0.6], [0.3, 0.6]], linhaSeq: 1 };
  const miuda = { pontos: [[0.6, 0.4], [0.606, 0.4], [0.606, 0.43], [0.6, 0.43]], linhaSeq: 2 };
  const txt = (a) => ({ bt: "BT " + a.linhaSeq, nf: "NF: 20425" + a.linhaSeq });
  const [r1, r2] = planejarRotulos([grandeA, miuda], W, H, txt);
  ok(!r1.fora && r1.cabe, "área grande → rótulo dentro");
  ok(r2.fora === true, "área miúda → rótulo vai para fora");
  const caixa = (r) => [r.x - r.w / 2, r.y - r.h / 2, r.x + r.w / 2, r.y + r.h / 2];
  const c2 = caixa(r2), c1 = caixa(r1);
  const cruza = !(c2[2] <= c1[0] || c2[0] >= c1[2] || c2[3] <= c1[1] || c2[1] >= c1[3]);
  ok(!cruza, "rótulo de fora não cobre o rótulo da área grande");
  const cantos = [[c2[0], c2[1]], [c2[2], c2[1]], [c2[0], c2[3]], [c2[2], c2[3]]];
  const polG = grandeA.pontos.map((p) => [p[0] * W, p[1] * H]);
  ok(!cantos.some((p) => dentro(p[0], p[1], polG)), "rótulo de fora não cai em cima da área vizinha");
  ok(c2[0] >= 0 && c2[1] >= 0 && c2[2] <= W && c2[3] <= H, "rótulo de fora dentro da folha");
  ok(Math.abs(r2.ax - (0.603 * W)) < 30 && dentro(r2.ax, r2.ay, miuda.pontos.map((p) => [p[0] * W, p[1] * H])), "linha sai de dentro da área miúda");
}
// v1.36: cores — BT 1 e BT 11 (mesma cor no ciclo) encostadas ficam diferentes; longe, cada uma com a sua
{
  const PAL = ["#2E5AAC", "#2E7D46", "#AD3A2C", "#B8860B", "#6A3FA0", "#0E7C86", "#C2410C", "#767A00", "#9C2F6B", "#3D5A80"];
  const padrao = (s) => PAL[(parseInt(s, 10) - 1) % PAL.length];
  const q = (x, y, seq) => ({ pontos: [[x, y], [x + 0.1, y], [x + 0.1, y + 0.1], [x, y + 0.1]], linhaSeq: seq });
  let cores = coresDistintas([q(0.1, 0.1, 1), q(0.2, 0.1, 11), q(0.8, 0.8, 3)], padrao);
  ok(cores.get("1") === "#2E5AAC" && cores.get("3") === "#AD3A2C", "BT sem vizinha parecida mantém a cor de sempre");
  ok(diferencaCor(cores.get("1"), cores.get("11")) >= 38, "BT 1 e BT 11 encostadas → cores bem diferentes (" + cores.get("11") + ")");
  cores = coresDistintas([q(0.1, 0.1, 1), q(0.2, 0.1, 10)], padrao); // azul e azul-acinzentado
  ok(diferencaCor(cores.get("1"), cores.get("10")) >= 38, "dois azuis lado a lado → um deles troca (" + cores.get("10") + ")");
  cores = coresDistintas([q(0.1, 0.1, 1), q(0.5, 0.5, 11)], padrao);
  ok(cores.get("11") === "#2E5AAC", "BT 11 longe da BT 1 → pode repetir a cor");
  const muitas = []; for (let i = 0; i < 12; i++) muitas.push(q(0.05 + (i % 4) * 0.1, 0.05 + Math.floor(i / 4) * 0.1, i + 1));
  cores = coresDistintas(muitas, padrao);
  let pior = Infinity;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    const vizinhas = Math.abs((i % 4) - (j % 4)) <= 1 && Math.abs(Math.floor(i / 4) - Math.floor(j / 4)) <= 1 && i !== j;
    if (vizinhas) pior = Math.min(pior, diferencaCor(cores.get(String(i + 1)), cores.get(String(j + 1))));
  }
  ok(pior >= 25, "grade de 12 BTs encostadas → vizinhas sempre distinguíveis (pior ΔE " + pior.toFixed(0) + ")");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
