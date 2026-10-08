/* Rótulo "BT n / NF" das áreas do mapeamento (v1.15).
 *
 * Uma regra só para o editor em tela cheia, o mapa da ficha e o PNG
 * exportado — o que aparece na tela é o que sai na impressão:
 *  - POSIÇÃO: o "centro visual" da área (o ponto mais distante das bordas,
 *    algoritmo polylabel). Em áreas em L ou em U a média dos cantos caía
 *    fora da área ou colada na borda; o centro visual fica sempre dentro.
 *  - TAMANHO: proporcional ao espaço livre nesse ponto, em unidades da
 *    planta, com mínimo e máximo pela largura da planta — nem gigante numa
 *    área grande, nem ilegível numa pequena.
 *
 * Sem dependências: roda no navegador e no Node (tests/rotulo-mapa.test.mjs).
 */

// distância (com sinal: + dentro, − fora) de (x,y) até o contorno do polígono
function distContorno(x, y, pol) {
  let dentro = false, min = Infinity;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
    let px = a[0], py = a[1], dx = b[0] - px, dy = b[1] - py;
    if (dx || dy) {
      const t = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy)));
      px += dx * t; py += dy * t;
    }
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < min) min = d;
  }
  return (dentro ? 1 : -1) * Math.sqrt(min);
}

// centroide de área (fallback e ponto de partida do polylabel)
function centroide(pol) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const f = pol[i][0] * pol[j][1] - pol[j][0] * pol[i][1];
    cx += (pol[i][0] + pol[j][0]) * f; cy += (pol[i][1] + pol[j][1]) * f; a += f * 3;
  }
  if (Math.abs(a) < 1e-9) return [pol.reduce((t, p) => t + p[0], 0) / pol.length, pol.reduce((t, p) => t + p[1], 0) / pol.length];
  return [cx / a, cy / a];
}

/** Centro visual de um polígono em px: { x, y, d } (d = distância até a borda) */
export function centroVisual(pol, precisao) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pol.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  const lado = Math.min(x1 - x0, y1 - y0);
  if (!(lado > 0)) return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, d: 0 };
  const prec = precisao || Math.max(lado / 200, 1e-6);
  const celula = (x, y, h) => { const d = distContorno(x, y, pol); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  const c0 = centroide(pol);
  let melhor = celula(c0[0], c0[1], 0);
  const meio = celula(x0 + (x1 - x0) / 2, y0 + (y1 - y0) / 2, 0);
  if (meio.d > melhor.d) melhor = meio;
  const fila = [];
  let h = lado / 2;
  for (let x = x0; x < x1; x += lado) for (let y = y0; y < y1; y += lado) fila.push(celula(x + h, y + h, h));
  let voltas = 0;
  while (fila.length && voltas++ < 5000) {
    // pega a célula mais promissora
    let k = 0;
    for (let i = 1; i < fila.length; i++) if (fila[i].max > fila[k].max) k = i;
    const c = fila.splice(k, 1)[0];
    if (c.d > melhor.d) melhor = c;
    if (c.max - melhor.d <= prec) continue;
    h = c.h / 2;
    fila.push(celula(c.x - h, c.y - h, h), celula(c.x + h, c.y - h, h), celula(c.x - h, c.y + h, h), celula(c.x + h, c.y + h, h));
  }
  return { x: melhor.x, y: melhor.y, d: Math.max(0, melhor.d) };
}

// espaço livre a partir de (x,y) até a borda, na horizontal e na vertical (o menor dos dois lados)
function folgas(x, y, pol) {
  let e = Infinity, d = Infinity, c = Infinity, b = Infinity;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const p = pol[i], q = pol[j];
    if ((p[1] > y) !== (q[1] > y)) { // aresta cruza a horizontal
      const xi = p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]);
      if (xi >= x) d = Math.min(d, xi - x); else e = Math.min(e, x - xi);
    }
    if ((p[0] > x) !== (q[0] > x)) { // aresta cruza a vertical
      const yi = p[1] + (x - p[0]) * (q[1] - p[1]) / (q[0] - p[0]);
      if (yi >= y) b = Math.min(b, yi - y); else c = Math.min(c, y - yi);
    }
  }
  return { meiaLarg: Math.min(e, d), meiaAlt: Math.min(c, b) };
}

/**
 * Posição e tamanho do rótulo de uma área.
 * pontos: [[x,y]…] normalizados (0..1) · W, H: tamanho da planta em px
 * textos: { bt: "BT 3", nf: "NF: 204254" | "" }
 * Devolve { x, y, fs, fs2, w, h } em px da planta (fs = fonte do "BT", fs2 = da NF).
 */
export function rotuloArea(pontos, W, H, textos) {
  const pol = pontos.map((p) => [p[0] * W, p[1] * H]);
  const c = centroVisual(pol);
  const nf = textos && textos.nf ? String(textos.nf) : "";
  const bt = textos && textos.bt ? String(textos.bt) : "BT";
  // largura/altura da caixa em "unidades de fonte" (fs = 1)
  const larg = Math.max(bt.length * 0.62, nf.length * 0.8 * 0.6) + 0.8;
  const alt = nf ? 2.6 : 1.5;
  // a caixa cabe no espaço livre em volta do centro visual (no mínimo, no círculo livre)
  const f = folgas(c.x, c.y, pol);
  const cabe = Math.max((2 * c.d) / Math.hypot(larg, alt), Math.min((2 * f.meiaLarg) / larg, (2 * f.meiaAlt) / alt) * 0.9);
  // v1.17: menor e discreto — no máximo ~40% do espaço livre e 1,1% da largura
  // da planta (antes 2,2%), para não cobrir o nome das vigas e as cotas.
  const min = W * 0.0055, max = W * 0.011;
  const fs = Math.max(min, Math.min(max, cabe * 0.4));
  return { x: c.x, y: c.y, fs, fs2: fs * 0.8, w: larg * fs, h: alt * fs };
}

// fundo do rótulo translúcido: a planta continua aparecendo por baixo
export const OPAC_FUNDO = 0.72;
const SVGNS = "http://www.w3.org/2000/svg";
/** Desenha o rótulo no SVG (coordenadas da planta). r = rotuloArea(...) */
export function rotuloSvg(svg, r, textos, cor) {
  const mk = (nome, at) => { const e = document.createElementNS(SVGNS, nome); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const nf = textos.nf || "";
  svg.appendChild(mk("rect", { x: r.x - r.w / 2, y: r.y - r.h / 2, width: r.w, height: r.h, rx: r.fs * 0.25, fill: "#fff", "fill-opacity": OPAC_FUNDO }));
  const t = mk("text", { x: r.x, y: nf ? r.y - r.fs * 0.55 : r.y, "text-anchor": "middle", "dominant-baseline": "central",
    "font-size": r.fs, "font-weight": 700, "font-family": "Arial, Helvetica, sans-serif", fill: cor });
  t.textContent = textos.bt;
  svg.appendChild(t);
  if (nf) {
    const t2 = mk("text", { x: r.x, y: r.y + r.fs * 0.7, "text-anchor": "middle", "dominant-baseline": "central",
      "font-size": r.fs2, "font-weight": 600, "font-family": "Arial, Helvetica, sans-serif", fill: "#1a1a1a" });
    t2.textContent = nf;
    svg.appendChild(t2);
  }
}
/** Desenha o rótulo num canvas 2D. (ox, oy) = onde a planta começa; k = escala planta → canvas */
export function rotuloCanvas(ctx, r, textos, cor, ox, oy, k) {
  const nf = textos.nf || "";
  const x = ox + r.x * k, y = oy + r.y * k, fs = r.fs * k, fs2 = r.fs2 * k, w = r.w * k, h = r.h * k;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255," + OPAC_FUNDO + ")";
  const rr = fs * 0.25;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, rr); else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = cor; ctx.font = "bold " + fs + "px Arial, Helvetica, sans-serif";
  ctx.fillText(textos.bt, x, nf ? y - fs * 0.55 : y);
  if (nf) { ctx.fillStyle = "#1a1a1a"; ctx.font = "600 " + fs2 + "px Arial, Helvetica, sans-serif"; ctx.fillText(nf, x, y + fs * 0.7); }
  ctx.restore();
}
