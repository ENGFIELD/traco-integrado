/* Planta com só algumas BTs em destaque (v1.36).
 *
 * Usada no controle tecnológico ("No mapa: abaixo do fck") e na aba de CT da
 * ficha de concretagem: abre a planta demarcada na rastreabilidade e desenha
 * SÓ a(s) BT(s) pedida(s) — por exemplo a da nota que não atingiu o fck —,
 * com o rótulo "BT n · NF x" e o resultado. As outras BTs não aparecem.
 *
 * Só leitura: não grava nada.
 */
import { planejarRotulos, rotuloSvg, rotuloCanvas } from "./rotulo-mapa.js";
import { garantirPdf } from "../../libs.js";

const NS = "http://www.w3.org/2000/svg";
const cachePdf = new Map(); // url → promessa do documento (abre cada planta uma vez só)

async function desenharPlanta(mp, canvas, larguraAlvo) {
  if (mp.tipo === "imagem") {
    const img = await new Promise((ok, erro) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => ok(im);
      im.onerror = () => erro(new Error("não consegui abrir a imagem da planta"));
      im.src = mp.plantaUrl;
    });
    const k = Math.min(1, larguraAlvo / img.naturalWidth);
    canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return;
  }
  await garantirPdf();
  if (!cachePdf.has(mp.plantaUrl)) cachePdf.set(mp.plantaUrl, window.pdfjsLib.getDocument(mp.plantaUrl).promise);
  let pdf;
  try { pdf = await cachePdf.get(mp.plantaUrl); } catch (ex) { cachePdf.delete(mp.plantaUrl); throw ex; }
  const pag = await pdf.getPage(Math.min(Math.max(mp.pagina || 1, 1), pdf.numPages));
  const v1 = pag.getViewport({ scale: 1 });
  const vp = pag.getViewport({ scale: Math.min(3, larguraAlvo / v1.width) });
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  const c = canvas.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height);
  await pag.render({ canvasContext: c, viewport: vp }).promise;
}

/**
 * host: elemento onde a planta aparece
 * opts: { mp: mapeamento (plantaUrl, tipo, pagina), areas: [{ pontos, linhaSeq }],
 *         textos(area) → { bt, nf }, cor: "#c0392b", titulo: texto do PNG baixado,
 *         nomeArquivo }
 */
export async function mostrarPlantaDestaque(host, opts) {
  const cor = opts.cor || "#C0392B";
  host.innerHTML = '<div class="pd-barra"><button type="button" class="btn small" data-pd-zoom>Aproximar na BT</button>'
    + '<button type="button" class="btn ghost small" data-pd-png>Baixar imagem</button>'
    + '<span class="hint" data-pd-msg>Carregando a planta…</span></div>'
    + '<div class="pd-scroll"><div class="pd-palco"><canvas></canvas><svg preserveAspectRatio="none"></svg></div></div>';
  const msg = host.querySelector("[data-pd-msg]"), palco = host.querySelector(".pd-palco"), rolo = host.querySelector(".pd-scroll");
  const canvas = palco.querySelector("canvas"), svg = palco.querySelector("svg");
  try {
    await desenharPlanta(opts.mp, canvas, 2400);
  } catch (ex) {
    console.error("planta em destaque", ex);
    msg.textContent = "Não consegui abrir a planta (" + (ex && ex.message ? ex.message : "erro") + "). Tente de novo com internet.";
    host.querySelectorAll("[data-pd-zoom],[data-pd-png]").forEach((b) => { b.disabled = true; });
    return false;
  }
  const W = canvas.width, H = canvas.height;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  palco.style.aspectRatio = W + " / " + H;
  const areas = opts.areas.filter((a) => a.pontos && a.pontos.length >= 3);
  areas.forEach((a) => {
    const pol = document.createElementNS(NS, "polygon");
    pol.setAttribute("points", a.pontos.map((p) => p[0] * W + "," + p[1] * H).join(" "));
    pol.setAttribute("fill", cor); pol.setAttribute("fill-opacity", "0.38");
    pol.setAttribute("stroke", cor); pol.setAttribute("stroke-width", Math.max(3, W * 0.004));
    svg.appendChild(pol);
  });
  const rotulos = planejarRotulos(areas, W, H, opts.textos);
  rotulos.forEach((r, i) => { if (r) rotuloSvg(svg, r, opts.textos(areas[i]), cor); });
  msg.textContent = "";

  // aproximar: a BT ocupa a tela; "Planta inteira" volta
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  areas.forEach((a) => a.pontos.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
  rotulos.forEach((r) => { if (r) { x0 = Math.min(x0, (r.x - r.w / 2) / W); x1 = Math.max(x1, (r.x + r.w / 2) / W); y0 = Math.min(y0, (r.y - r.h / 2) / H); y1 = Math.max(y1, (r.y + r.h / 2) / H); } });
  let perto = false;
  const btZoom = host.querySelector("[data-pd-zoom]");
  const aplicar = () => {
    if (!perto || x1 <= x0) { palco.style.width = "100%"; btZoom.textContent = "Aproximar na BT"; return; }
    // zoom em que a BT (com o rótulo) ocupa ~60% da largura e da altura visíveis, no máximo 4×
    const vw = rolo.clientWidth || 1, vh = rolo.clientHeight || vw * 0.7;
    const zL = 0.6 / Math.max(x1 - x0, 0.01), zA = (0.6 * vh) / (Math.max(y1 - y0, 0.01) * vw * H / W);
    const z = Math.max(1, Math.min(4, zL, zA));
    palco.style.width = (z * 100) + "%";
    btZoom.textContent = "Planta inteira";
    requestAnimationFrame(() => {
      rolo.scrollLeft = ((x0 + x1) / 2) * palco.clientWidth - rolo.clientWidth / 2;
      rolo.scrollTop = ((y0 + y1) / 2) * palco.clientHeight - rolo.clientHeight / 2;
    });
  };
  btZoom.addEventListener("click", () => { perto = !perto; aplicar(); });
  if (!areas.length) btZoom.disabled = true;
  else { perto = true; aplicar(); }

  host.querySelector("[data-pd-png]").addEventListener("click", () => {
    const topo = Math.round(W * 0.03);
    const out = document.createElement("canvas");
    out.width = W; out.height = H + topo;
    const c = out.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height);
    c.fillStyle = "#1a1a1a"; c.font = "bold " + Math.round(topo * 0.5) + "px Arial, Helvetica, sans-serif";
    c.fillText(opts.titulo || "", Math.round(topo * 0.4), Math.round(topo * 0.68));
    c.drawImage(canvas, 0, topo);
    areas.forEach((a) => {
      c.beginPath();
      a.pontos.forEach((p, i) => { const x = p[0] * W, y = topo + p[1] * H; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.closePath();
      c.globalAlpha = 0.38; c.fillStyle = cor; c.fill(); c.globalAlpha = 1;
      c.strokeStyle = cor; c.lineWidth = Math.max(3, W * 0.004); c.stroke();
    });
    rotulos.forEach((r, i) => { if (r) rotuloCanvas(c, r, opts.textos(areas[i]), cor, 0, topo, 1); });
    out.toBlob((blob) => {
      if (!blob) { msg.textContent = "Não consegui gerar a imagem neste aparelho."; return; }
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = (opts.nomeArquivo || "planta") + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  });
  return true;
}
