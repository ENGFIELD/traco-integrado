/* Peças da planta de forma (v1.37 — teste).
 *
 * A planta de forma em PDF traz o nome de cada peça escrito como texto
 * (P12, V105, L3, PAR2…), cada um na sua posição. Aqui:
 *  - lerPecasDaPagina: lê esses nomes e a posição (0..1, como as áreas do
 *    mapeamento) de uma página aberta no pdf.js;
 *  - pecasNaArea: dada uma área demarcada, quais peças estão dentro (ou
 *    encostadas na borda) — vão para "Peças concretadas" da BT.
 * Nada é desenhado: os nomes ficam "escondidos", só servem para preencher.
 *
 * Sem dependências: roda no navegador e no Node (tests/pecas-planta.test.mjs).
 */

// Pilar, viga, laje, parede, escada, cortina, bloco/baldrame… seguido do número (V105, V105a, P 12, L-3, VB2)
export const RE_PECA = /^(P|PP|V|VB|VA|L|LM|LE|PAR|PR|ESC|CT|CORT|B|BL|R)\s*-?\s*(\d{1,4}[A-Z]?)'?$/;

/** Nome de peça normalizado ("v 105a" → "V105A") ou "" se o texto não é uma peça. */
export function nomePeca(txt) {
  const t = String(txt || "").trim().toUpperCase().replace(/\s+/g, " ");
  const m = RE_PECA.exec(t);
  return m ? m[1] + m[2] : "";
}

/**
 * itens: [{ str, x, y, w, h }] em unidades da página (y para baixo), W, H: tamanho da página.
 * Junta "V" + "105" vizinhos na mesma linha. Devolve [{ n, x, y }] normalizado (0..1), sem repetir
 * o mesmo nome no mesmo lugar.
 */
export function pecasDosItens(itens, W, H) {
  const out = [];
  const add = (n, x, y) => {
    if (!n) return;
    if (out.some((p) => p.n === n && Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01)) return;
    out.push({ n, x, y });
  };
  itens.forEach((it, i) => {
    const s = String(it.str || "").trim();
    if (!s) return;
    const cx = (it.x + it.w / 2) / W, cy = (it.y - it.h / 2) / H;
    // o texto inteiro é uma peça; ou "V105 (14x60)": a primeira palavra é
    const n = nomePeca(s) || nomePeca(s.split(/[\s(]/)[0]);
    if (n) { add(n, cx, cy); return; }
    // "V" sozinho e o número logo depois, na mesma linha
    const prox = itens[i + 1];
    if (/^[A-Z]{1,4}$/i.test(s) && prox && /^-?\d{1,4}[A-Z]?$/i.test(String(prox.str || "").trim())
      && Math.abs(prox.y - it.y) < Math.max(it.h, 1) * 0.6 && prox.x - (it.x + it.w) < Math.max(it.h, 1) * 1.5) {
      const n2 = nomePeca(s + String(prox.str).trim());
      if (n2) add(n2, (it.x + (prox.x + prox.w - it.x) / 2) / W, cy);
    }
  });
  return out;
}

/** Lê as peças de uma página do pdf.js (página como o pdf.js a mostra, girada se for o caso). */
export async function lerPecasDaPagina(page) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const itens = tc.items.map((it) => {
    const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 0;
    return { str: it.str, x, y, w: it.width || 0, h };
  });
  return pecasDosItens(itens, vp.width, vp.height);
}

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
