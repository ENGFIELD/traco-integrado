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
  // v1.36: "cabe" = a caixa nesse tamanho cabe dentro da área? (senão vai para fora, com linha)
  return { x: c.x, y: c.y, fs, fs2: fs * 0.8, w: larg * fs, h: alt * fs, cabe: cabe >= fs };
}

/* ---------------- v1.36: rótulos de todas as áreas juntas ----------------
 * Áreas pequenas: o rótulo não cabe dentro e cobria a planta e as áreas
 * vizinhas. Agora, quando não cabe, ele vai para FORA da área, num lugar
 * vazio (sem cobrir outra área nem outro rótulo), com uma linha fina e um
 * ponto na cor da BT ligando o rótulo à área.
 */
const sobrepoe = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const caixaDe = (r) => ({ x0: r.x - r.w / 2, y0: r.y - r.h / 2, x1: r.x + r.w / 2, y1: r.y + r.h / 2 });
function dentroPol(x, y, pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}

/**
 * areas: [{ pontos:[[u,v]…] }] (0..1) · W, H: planta em px · textosDe(area) → { bt, nf }
 * Devolve uma lista (mesma ordem; null para área inválida) com o mesmo formato
 * de rotuloArea e, quando o rótulo ficou fora: fora:true e (ax, ay) = ponto da
 * área onde a linha chega.
 */
export function planejarRotulos(areas, W, H, textosDe) {
  const pols = areas.map((a) => (a && a.pontos && a.pontos.length >= 3 ? a.pontos.map((p) => [p[0] * W, p[1] * H]) : null));
  const out = areas.map((a, i) => (pols[i] ? rotuloArea(a.pontos, W, H, textosDe(a)) : null));
  const ocupadas = [];
  out.forEach((r) => { if (r && r.cabe) ocupadas.push(caixaDe(r)); });
  // as menores primeiro escolhem lugar (são as que mais precisam ficar perto)
  const fora = out.map((r, i) => i).filter((i) => out[i] && !out[i].cabe);
  const tam = (i) => { const p = pols[i]; return (Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0]))) * (Math.max(...p.map((q) => q[1])) - Math.min(...p.map((q) => q[1]))); };
  fora.sort((i, j) => tam(i) - tam(j));
  fora.forEach((i) => {
    // fora da área o rótulo pode ser um pouco maior (não cobre nada): legível no celular
    const base = out[i], k = Math.max(1, (W * 0.0075) / base.fs);
    const r = Object.assign({}, base, { fs: base.fs * k, fs2: base.fs2 * k, w: base.w * k, h: base.h * k });
    const p = pols[i];
    const bx0 = Math.min(...p.map((q) => q[0])), bx1 = Math.max(...p.map((q) => q[0]));
    const by0 = Math.min(...p.map((q) => q[1])), by1 = Math.max(...p.map((q) => q[1]));
    let melhor = null;
    for (let anel = 0; anel < 6; anel++) {
      const folga = r.fs * (0.8 + anel * 1.6);
      for (let n = 0; n < 16; n++) {
        const ang = -Math.PI / 4 + (n * Math.PI) / 8; // começa em cima/direita
        const cs = Math.cos(ang), sn = Math.sin(ang);
        // sai do retângulo da área na direção escolhida e encosta a caixa do lado de fora
        const tx = cs > 1e-9 ? (bx1 - r.x) / cs : cs < -1e-9 ? (bx0 - r.x) / cs : Infinity;
        const ty = sn > 1e-9 ? (by1 - r.y) / sn : sn < -1e-9 ? (by0 - r.y) / sn : Infinity;
        const dist = Math.min(tx, ty) + Math.abs(cs) * r.w / 2 + Math.abs(sn) * r.h / 2 + folga;
        const x = r.x + cs * dist, y = r.y + sn * dist;
        const cx = { x0: x - r.w / 2, y0: y - r.h / 2, x1: x + r.w / 2, y1: y + r.h / 2 };
        if (cx.x0 < 0 || cx.y0 < 0 || cx.x1 > W || cx.y1 > H) continue; // fora da folha
        let custo = dist / r.fs; // linha curta é melhor
        ocupadas.forEach((o) => { custo += (sobrepoe(cx, o) / (r.fs * r.fs)) * 40; });
        // pontos da caixa que caem em cima de alguma área demarcada
        let emArea = 0;
        for (let u = 0; u <= 2; u++) for (let v = 0; v <= 2; v++) {
          const px = cx.x0 + (u * r.w) / 2, py = cx.y0 + (v * r.h) / 2;
          if (pols.some((q) => q && dentroPol(px, py, q))) emArea++;
        }
        custo += emArea * 6;
        // a linha não deve atravessar outra área (confunde de qual BT é o rótulo)
        const passos = Math.max(4, Math.ceil(dist / (r.fs * 0.5)));
        for (let t = 1; t < passos; t++) {
          const px = r.x + ((x - r.x) * t) / passos, py = r.y + ((y - r.y) * t) / passos;
          if (pols.some((q, j) => j !== i && q && dentroPol(px, py, q))) custo += 15;
          if (ocupadas.some((o) => px > o.x0 && px < o.x1 && py > o.y0 && py < o.y1)) custo += 15;
        }
        if (!melhor || custo < melhor.custo) melhor = { custo, x, y, cx };
      }
    }
    if (!melhor) return; // sem lugar na folha: fica no centro, como antes
    out[i] = Object.assign(r, { x: melhor.x, y: melhor.y, fora: true, ax: base.x, ay: base.y });
    ocupadas.push(melhor.cx);
  });
  return out;
}

// ponto da borda da caixa do rótulo na direção da área (onde a linha termina)
export function pontaDaLinha(r) {
  const dx = r.ax - r.x, dy = r.ay - r.y;
  const t = Math.min(Math.abs(dx) > 1e-9 ? (r.w / 2) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? (r.h / 2) / Math.abs(dy) : Infinity, 1);
  return { x: r.x + dx * t, y: r.y + dy * t };
}

/* ---------------- v1.36: cores que não se confundem ----------------
 * Antes a cor vinha só do nº da BT (10 cores em ciclo): BT 1 e BT 11 ficavam
 * iguais, e tons parecidos (dois azuis, dois verdes) apareciam lado a lado.
 * Agora cada BT mantém a sua cor de sempre, a não ser que encoste numa BT
 * vizinha de cor igual ou parecida — aí ganha a cor mais diferente das
 * vizinhas. Só muda o desenho: nada é gravado.
 */
export const PALETA_MAPA = ["#2E5AAC", "#2E7D46", "#AD3A2C", "#B8860B", "#6A3FA0", "#0E7C86", "#C2410C", "#767A00", "#9C2F6B", "#3D5A80",
  "#D4006A", "#0077C8", "#5B3A1A", "#4A4A4A", "#E08A00", "#008F5A"];
function lab(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex || "")) || [0, "80", "80", "80"];
  const lin = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const r = lin(parseInt(m[1], 16)), g = lin(parseInt(m[2], 16)), b = lin(parseInt(m[3], 16));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** diferença entre duas cores como o olho vê (ΔE; abaixo de ~35 confunde num mapa) */
export function diferencaCor(a, b) { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
function distPol(A, B) {
  if (A.some((p) => dentroPol(p[0], p[1], B)) || B.some((p) => dentroPol(p[0], p[1], A))) return 0;
  let m = Infinity;
  [[A, B], [B, A]].forEach(([P, Q]) => P.forEach((p) => { for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) m = Math.min(m, distSeg(p, Q[j], Q[i])); }));
  return m;
}
const LIMIAR_VIZINHA = 0.035; // 3,5% da planta: perto o bastante para confundir
const DIFERENCA_MIN = 38;
/**
 * areas: [{ pontos (0..1), linhaSeq, cor }] · corPadrao(seq) → a cor de sempre da BT
 * Devolve Map(String(seq) → cor). Pontos normalizados: o resultado é o mesmo
 * na tela, no PNG e no PDF.
 */
export function coresDistintas(areas, corPadrao) {
  const porSeq = new Map();
  (areas || []).forEach((a) => {
    if (!a || !a.pontos || a.pontos.length < 3) return;
    const k = String(a.linhaSeq);
    if (!porSeq.has(k)) porSeq.set(k, []);
    porSeq.get(k).push(a.pontos);
  });
  const seqs = [...porSeq.keys()].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b));
  const viz = new Map(seqs.map((s) => [s, new Set()]));
  for (let i = 0; i < seqs.length; i++) for (let j = i + 1; j < seqs.length; j++) {
    const perto = porSeq.get(seqs[i]).some((A) => porSeq.get(seqs[j]).some((B) => distPol(A, B) < LIMIAR_VIZINHA));
    if (perto) { viz.get(seqs[i]).add(seqs[j]); viz.get(seqs[j]).add(seqs[i]); }
  }
  const cor = new Map(), uso = new Map();
  seqs.forEach((s) => {
    const usadas = [...viz.get(s)].filter((v) => cor.has(v)).map((v) => cor.get(v));
    const minDif = (c) => usadas.reduce((m, u) => Math.min(m, diferencaCor(c, u)), Infinity);
    let c = corPadrao(s);
    if (minDif(c) < DIFERENCA_MIN) {
      let melhor = c, nota = -1;
      PALETA_MAPA.forEach((p) => {
        const n = Math.min(minDif(p), 120) - (uso.get(p) || 0) * 2;
        if (n > nota) { nota = n; melhor = p; }
      });
      c = melhor;
    }
    cor.set(s, c);
    uso.set(c, (uso.get(c) || 0) + 1);
  });
  return cor;
}

// fundo do rótulo translúcido: a planta continua aparecendo por baixo
export const OPAC_FUNDO = 0.72;
const SVGNS = "http://www.w3.org/2000/svg";
/** Desenha o rótulo no SVG (coordenadas da planta). r = rotuloArea(...) */
export function rotuloSvg(svg, r, textos, cor) {
  const mk = (nome, at) => { const e = document.createElementNS(SVGNS, nome); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const nf = textos.nf || "";
  if (r.fora) { // v1.36: rótulo fora da área — linha e ponto na cor da BT
    const p = pontaDaLinha(r);
    svg.appendChild(mk("line", { x1: r.ax, y1: r.ay, x2: p.x, y2: p.y, stroke: cor, "stroke-width": r.fs * 0.1 }));
    svg.appendChild(mk("circle", { cx: r.ax, cy: r.ay, r: r.fs * 0.22, fill: cor, stroke: "#fff", "stroke-width": r.fs * 0.06 }));
  }
  svg.appendChild(mk("rect", { x: r.x - r.w / 2, y: r.y - r.h / 2, width: r.w, height: r.h, rx: r.fs * 0.25, fill: "#fff", "fill-opacity": r.fora ? 0.95 : OPAC_FUNDO,
    stroke: r.fora ? cor : "none", "stroke-width": r.fs * 0.08 }));
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
  if (r.fora) { // v1.36: rótulo fora da área — linha e ponto na cor da BT
    const p = pontaDaLinha(r);
    ctx.strokeStyle = cor; ctx.lineWidth = fs * 0.1;
    ctx.beginPath(); ctx.moveTo(ox + r.ax * k, oy + r.ay * k); ctx.lineTo(ox + p.x * k, oy + p.y * k); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox + r.ax * k, oy + r.ay * k, fs * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = cor; ctx.fill(); ctx.lineWidth = fs * 0.06; ctx.strokeStyle = "#fff"; ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255," + (r.fora ? 0.95 : OPAC_FUNDO) + ")";
  const rr = fs * 0.25;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, rr); else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  if (r.fora) { ctx.strokeStyle = cor; ctx.lineWidth = fs * 0.08; ctx.stroke(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = cor; ctx.font = "bold " + fs + "px Arial, Helvetica, sans-serif";
  ctx.fillText(textos.bt, x, nf ? y - fs * 0.55 : y);
  if (nf) { ctx.fillStyle = "#1a1a1a"; ctx.font = "600 " + fs2 + "px Arial, Helvetica, sans-serif"; ctx.fillText(nf, x, y + fs * 0.7); }
  ctx.restore();
}
