/* Exportar o mapeamento em PDF VETORIAL (v1.17).
 *
 * Em vez de uma foto da planta (PNG), usa a PRÓPRIA página do PDF do projeto
 * e desenha por cima as áreas de cada BT e os rótulos, também como vetores.
 * Resultado: a mesma nitidez do projeto em qualquer zoom e na impressão
 * (A1/A0), e arquivo pequeno. Uma faixa é acrescentada embaixo da folha com o
 * título e a legenda das BTs.
 *
 * As coordenadas das áreas (0..1, sobre a página como o pdf.js a mostra) são
 * convertidas para o sistema do PDF com viewport.convertToPdfPoint — funciona
 * também em páginas giradas (/Rotate).
 */
import { planejarRotulos, pontaDaLinha, OPAC_FUNDO } from "./rotulo-mapa.js";

const corRgb = (lib, hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex || "")) || [0, "33", "33", "33"];
  return lib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
};
// texto do PDF padrão (WinAnsi): troca o que a fonte não tem
const limpar = (t) => String(t == null ? "" : t).replace(/[^\x20-\x7E -ÿ—–·]/g, "?");

/**
 * opts: {
 *   bytes: ArrayBuffer do PDF da planta, pagina: nº da página (1…),
 *   pdfjsPage: a mesma página aberta no pdf.js (para converter as coordenadas),
 *   areas: [{ pontos:[[u,v]…], cor, linhaSeq }], textos: (area) => { bt, nf },
 *   titulo, subtitulo, legenda: [{ cor, texto }]
 * } → Uint8Array do PDF novo
 */
export async function mapaEmPdf(opts) {
  const lib = await import("pdf-lib");
  const { PDFDocument, StandardFonts, degrees, rgb } = lib;
  const origem = await PDFDocument.load(opts.bytes, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const [pag] = await doc.copyPages(origem, [Math.max(0, (opts.pagina || 1) - 1)]);
  doc.addPage(pag);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const vp = opts.pdfjsPage.getViewport({ scale: 1 });
  const W = vp.width, H = vp.height;
  const P = (u, v) => vp.convertToPdfPoint(u * W, v * H); // → [x, y] no PDF
  const rot = ((vp.rotation % 360) + 360) % 360;           // giro com que a página é mostrada
  const th = (rot * Math.PI) / 180;
  // vetor (dx, dy) "da tela" (x → direita, y ↑) para o PDF, considerando o giro
  const R = (dx, dy) => [dx * Math.cos(th) - dy * Math.sin(th), dx * Math.sin(th) + dy * Math.cos(th)];
  const borda = Math.max(0.8, W * 0.0011);

  // 1) áreas
  opts.areas.forEach((a) => {
    if (!a.pontos || a.pontos.length < 3) return;
    const pts = a.pontos.map((p) => P(p[0], p[1]));
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + (-p[1]).toFixed(2)).join(" ") + " Z";
    pag.drawSvgPath(path, { x: 0, y: 0, color: corRgb(lib, a.cor), opacity: 0.3, borderColor: corRgb(lib, a.cor), borderWidth: borda, borderOpacity: 1 });
  });
  // 2) rótulos (por cima de todas as áreas)
  // v1.36: planejados juntos — o rótulo que não cabe na área vai para fora, com linha
  const plano = planejarRotulos(opts.areas, W, H, opts.textos);
  opts.areas.forEach((a, i) => {
    const r = plano[i];
    if (!r) return;
    const t = opts.textos(a);
    const c = vp.convertToPdfPoint(r.x, r.y);
    const em = (dx, dy) => { const v = R(dx, dy); return { x: c[0] + v[0], y: c[1] + v[1] }; };
    if (r.fora) {
      const pa = vp.convertToPdfPoint(r.ax, r.ay), pp = pontaDaLinha(r), pb = vp.convertToPdfPoint(pp.x, pp.y);
      pag.drawLine({ start: { x: pa[0], y: pa[1] }, end: { x: pb[0], y: pb[1] }, thickness: r.fs * 0.1, color: corRgb(lib, a.cor) });
      pag.drawCircle({ x: pa[0], y: pa[1], size: r.fs * 0.22, color: corRgb(lib, a.cor), borderColor: rgb(1, 1, 1), borderWidth: r.fs * 0.06 });
    }
    const canto = em(-r.w / 2, -r.h / 2);
    pag.drawRectangle({ x: canto.x, y: canto.y, width: r.w, height: r.h, rotate: degrees(rot), color: rgb(1, 1, 1), opacity: r.fora ? 0.95 : OPAC_FUNDO,
      ...(r.fora ? { borderColor: corRgb(lib, a.cor), borderWidth: r.fs * 0.08 } : {}) });
    const bt = limpar(t.bt), nf = limpar(t.nf || "");
    const wBt = negrito.widthOfTextAtSize(bt, r.fs);
    const p1 = em(-wBt / 2, (nf ? 0.55 * r.fs : 0) - 0.35 * r.fs);
    pag.drawText(bt, { x: p1.x, y: p1.y, size: r.fs, font: negrito, color: corRgb(lib, a.cor), rotate: degrees(rot) });
    if (nf) {
      const wNf = negrito.widthOfTextAtSize(nf, r.fs2);
      const p2 = em(-wNf / 2, -0.7 * r.fs - 0.35 * r.fs2);
      pag.drawText(nf, { x: p2.x, y: p2.y, size: r.fs2, font: negrito, color: rgb(0.1, 0.1, 0.1), rotate: degrees(rot) });
    }
  });
  // 3) faixa com título e legenda embaixo da folha (página sem giro)
  if (rot === 0) {
    const mb = pag.getMediaBox();
    const faixa = Math.max(40, mb.height * 0.055), fsT = faixa * 0.26, fsL = faixa * 0.2, m = faixa * 0.3;
    pag.setMediaBox(mb.x, mb.y - faixa, mb.width, mb.height + faixa);
    const cb = pag.getCropBox();
    if (cb) pag.setCropBox(cb.x, Math.min(cb.y, mb.y) - faixa, cb.width, cb.height + faixa);
    pag.drawRectangle({ x: mb.x, y: mb.y - faixa, width: mb.width, height: faixa, color: rgb(1, 1, 1) });
    pag.drawLine({ start: { x: mb.x, y: mb.y }, end: { x: mb.x + mb.width, y: mb.y }, thickness: 0.6, color: rgb(0.6, 0.6, 0.6) });
    const yT = mb.y - m - fsT * 0.8;
    pag.drawText(limpar(opts.titulo), { x: mb.x + m, y: yT, size: fsT, font: negrito, color: rgb(0.1, 0.1, 0.1) });
    let x = mb.x + m + negrito.widthOfTextAtSize(limpar(opts.titulo), fsT) + m * 1.5;
    if (opts.subtitulo) {
      pag.drawText(limpar(opts.subtitulo), { x, y: yT, size: fsL, font: normal, color: rgb(0.4, 0.4, 0.4) });
    }
    let xl = mb.x + m;
    const yL = mb.y - faixa + m * 0.9;
    (opts.legenda || []).forEach((l) => {
      const txt = limpar(l.texto), lw = negrito.widthOfTextAtSize(txt, fsL);
      if (xl + fsL * 1.4 + lw > mb.x + mb.width - m) return; // não cabe mais na linha
      pag.drawRectangle({ x: xl, y: yL - fsL * 0.1, width: fsL, height: fsL, color: corRgb(lib, l.cor) });
      pag.drawText(txt, { x: xl + fsL * 1.4, y: yL, size: fsL, font: negrito, color: rgb(0.1, 0.1, 0.1) });
      xl += fsL * 1.4 + lw + m * 1.2;
    });
  }
  doc.setTitle(limpar(opts.titulo));
  doc.setCreator("Traço Integrado");
  return doc.save();
}
