/* Peças da planta de forma (v1.37).
 *
 * As peças (P12, V105, L3…) são desenhadas uma vez na planta, em "Marcar
 * peças" (tela Plantas). Ao demarcar uma concretagem, pecasNaArea diz quais
 * peças estão dentro da área — vão para "Peças concretadas" da BT.
 * As peças ficam "escondidas" no mapeamento: só servem para preencher.
 *
 * Sem dependências: roda no navegador e no Node (tests/pecas-planta.test.mjs).
 */

function dentro(x, y, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}
function distBorda(x, y, pol) {
  let m = Infinity;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[j], b = pol[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    m = Math.min(m, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
  }
  return m;
}
// fração da peça (polígono) que cai dentro da área — amostra pontos dentro da peça
export function fracaoDentro(peca, area) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  peca.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  let total = 0, den = 0;
  const N = 12;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / (N + 1), y = y0 + ((y1 - y0) * (j + 0.5)) / (N + 1);
    if (!dentro(x, y, peca)) continue;
    total++; if (dentro(x, y, area)) den++;
  }
  if (!total) { // peça muito fina: usa os cantos
    peca.forEach((p) => { total++; if (dentro(p[0], p[1], area) || distBorda(p[0], p[1], area) < 0.002) den++; });
  }
  return total ? den / total : 0;
}
const ORDEM = (n) => (/^P/.test(n) ? 0 : /^V/.test(n) ? 1 : /^L/.test(n) ? 2 : 3);
/**
 * Peças dentro da área (pontos 0..1). Cada peça é um nome com posição
 * ({ n, x, y }, lido do PDF) ou uma peça desenhada à mão ({ n, pontos }).
 * Nome: dentro ou até tol da borda (o rótulo da viga fica ao lado dela).
 * Peça desenhada: entra se pelo menos 30% dela estiver dentro da área.
 */
export function pecasNaArea(pontos, pecas, tol = 0.006) {
  const nomes = new Set();
  (pecas || []).forEach((p) => {
    if (p.pontos && p.pontos.length >= 3) { if (fracaoDentro(p.pontos, pontos) >= 0.3) nomes.add(p.n); return; }
    if (dentro(p.x, p.y, pontos) || distBorda(p.x, p.y, pontos) <= tol) nomes.add(p.n);
  });
  return [...nomes].sort((a, b) => ORDEM(a) - ORDEM(b) || a.localeCompare(b, "pt-BR", { numeric: true }));
}
