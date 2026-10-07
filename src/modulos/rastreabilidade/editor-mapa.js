/* Editor de mapeamento de concretagem em TELA CHEIA (v1.2).
 *
 * Substitui a demarcação dentro do formulário, que tinha zoom limitado (400%),
 * lento, e um defeito: depois de uma pinça, um dedo podia ficar "preso" na
 * contagem e os toques seguintes deixavam de marcar pontos.
 *
 * Gestos:
 *  - 1 dedo arrastando ......... move a planta
 *  - 2 dedos (pinça) ........... zoom em volta dos dedos (até 12×)
 *  - toque rápido .............. marca um ponto (só no modo "Nova área")
 *  - PC: roda do mouse = zoom no cursor; arrastar = mover; clique = ponto
 *
 * Cada área confirmada é SALVA na hora (opts.salvar), sem precisar lembrar de
 * apertar "Salvar" no formulário.
 *
 * Coordenadas continuam normalizadas (0..1) — mesmo formato da v1.1, então as
 * áreas já demarcadas abrem iguais e o "Exportar (PNG)" continua funcionando.
 */
import "../../estilos/editor-mapa.css";
import { garantirPdf } from "../../libs.js";

const ZOOM_MAX = 12;          // em relação ao "caber na tela"
const TOQUE_MAX_MOV = 10;     // px — acima disso é arrasto, não toque
const TOQUE_MAX_MS = 450;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * @param {object} opts
 *  mapeamento: objeto da ficha (mutado aqui: .areas)
 *  linhas: () => betonadas atuais [{seq, notaFiscal}]
 *  cor: (seq) => cor da BT
 *  salvar: async () => boolean   (grava a ficha; true se ok)
 *  titulo: texto do cabeçalho
 *  aoFechar: () => void
 */
export async function abrirEditorMapa(opts) {
  const mp = opts.mapeamento;
  if (!mp.areas) mp.areas = [];

  const raiz = document.createElement("div");
  raiz.className = "edmapa";
  raiz.innerHTML = `
    <div class="edmapa-topo">
      <button type="button" class="edmapa-btn" data-acao="fechar" aria-label="Concluir">✓ Concluir</button>
      <div class="edmapa-titulo">${esc(opts.titulo || "Mapeamento da concretagem")}</div>
      <span class="edmapa-salvo" data-salvo></span>
    </div>
    <div class="edmapa-palco" data-palco>
      <div class="edmapa-mundo" data-mundo>
        <canvas data-canvas></canvas>
        <svg data-svg preserveAspectRatio="none"></svg>
      </div>
      <div class="edmapa-carregando" data-carregando>Carregando planta…</div>
    </div>
    <div class="edmapa-zoom">
      <button type="button" class="edmapa-btn redondo" data-acao="zoom-mais" aria-label="Aproximar">+</button>
      <button type="button" class="edmapa-btn redondo" data-acao="zoom-menos" aria-label="Afastar">−</button>
      <button type="button" class="edmapa-btn redondo" data-acao="ajustar" aria-label="Ajustar à tela">⤢</button>
    </div>
    <div class="edmapa-base" data-base></div>
  `;
  document.body.appendChild(raiz);
  document.documentElement.classList.add("edmapa-aberto");

  const palco = raiz.querySelector("[data-palco]");
  const mundo = raiz.querySelector("[data-mundo]");
  const canvas = raiz.querySelector("[data-canvas]");
  const svg = raiz.querySelector("[data-svg]");
  const base = raiz.querySelector("[data-base]");
  const salvoEl = raiz.querySelector("[data-salvo]");

  // ---------- estado ----------
  let W = 1, H = 1;                    // tamanho da planta em px
  let s = 1, tx = 0, ty = 0, sFit = 1; // transformação mundo → tela
  let modo = "ver";                    // "ver" | "desenhar" | "escolher-bt"
  let pontos = [];                     // área em desenho (normalizada)
  let salvando = false, salvarDeNovo = false;

  // ---------- carregar planta ----------
  try {
    if (mp.tipo === "imagem") {
      const img = await new Promise((ok, erro) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.onload = () => ok(im);
        im.onerror = () => erro(new Error("falha ao carregar a imagem da planta"));
        im.src = mp.plantaUrl;
      });
      W = canvas.width = img.naturalWidth;
      H = canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
    } else {
      await garantirPdf();
      const pdf = await window.pdfjsLib.getDocument(mp.plantaUrl).promise;
      const pag = await pdf.getPage(Math.min(Math.max(mp.pagina || 1, 1), pdf.numPages));
      const v1 = pag.getViewport({ scale: 1 });
      // Resolução maior que a do formulário, para o zoom ficar nítido —
      // limitada a ~11 MP (limite de canvas do iPhone é 16,7 MP).
      const alvo = Math.min(4000, Math.floor(Math.sqrt(11e6 * v1.width / v1.height)));
      const vp = pag.getViewport({ scale: alvo / v1.width });
      W = canvas.width = Math.floor(vp.width);
      H = canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      // intent "print": não depende de requestAnimationFrame (renderiza mesmo
      // com a aba em segundo plano).
      await pag.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise;
    }
  } catch (ex) {
    console.error("editor de mapa:", ex);
    raiz.querySelector("[data-carregando]").textContent = "Não foi possível carregar a planta. Verifique a internet e tente de novo.";
  }
  raiz.querySelector("[data-carregando]").hidden = W > 1;
  mundo.style.width = W + "px";
  mundo.style.height = H + "px";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // ---------- transformação ----------
  let rafPendente = false;
  function aplicar() {
    if (rafPendente) return;
    rafPendente = true;
    requestAnimationFrame(() => {
      rafPendente = false;
      mundo.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      desenhar();
    });
  }
  function ajustar() {
    const r = palco.getBoundingClientRect();
    // Tela ainda sem tamanho (abrindo, girando o celular): tenta de novo já já.
    if (!r.width || !r.height) { setTimeout(ajustar, 100); return; }
    sFit = Math.min(r.width / W, r.height / H) * 0.96;
    s = sFit;
    tx = (r.width - W * s) / 2;
    ty = (r.height - H * s) / 2;
    aplicar();
  }
  function limitarZoom(v) { return Math.min(sFit * ZOOM_MAX, Math.max(sFit * 0.8, v)); }
  // Zoom mantendo fixo o ponto da tela (px, py)
  function zoomEm(px, py, novoS) {
    novoS = limitarZoom(novoS);
    const wx = (px - tx) / s, wy = (py - ty) / s;
    s = novoS;
    tx = px - wx * s;
    ty = py - wy * s;
    aplicar();
  }
  function centroPalco() {
    const r = palco.getBoundingClientRect();
    return [r.width / 2, r.height / 2];
  }
  function telaParaNorm(clientX, clientY) {
    const r = palco.getBoundingClientRect();
    const x = (clientX - r.left - tx) / s / W;
    const y = (clientY - r.top - ty) / s / H;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }

  // ---------- desenho (SVG em coordenadas da planta; traços com espessura fixa na tela) ----------
  const NS = "http://www.w3.org/2000/svg";
  function el(nome, attrs) {
    const e = document.createElementNS(NS, nome);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function desenhar() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const px = 1 / s; // 1 pixel de tela em unidades da planta
    if (!isFinite(px) || px <= 0) return;
    const pt = (p) => `${p[0] * W},${p[1] * H}`;
    mp.areas.forEach((a) => {
      if (!a.pontos || a.pontos.length < 3) return;
      svg.appendChild(el("polygon", { points: a.pontos.map(pt).join(" "), fill: a.cor, "fill-opacity": 0.32, stroke: a.cor, "stroke-width": 2.5 * px }));
      const cx = a.pontos.reduce((t, p) => t + p[0], 0) / a.pontos.length * W;
      const cy = a.pontos.reduce((t, p) => t + p[1], 0) / a.pontos.length * H;
      const fs = 15 * px, rotulo = "BT " + a.linhaSeq;
      const rw = rotulo.length * fs * 0.62 + fs, rh = fs * 1.6;
      svg.appendChild(el("rect", { x: cx - rw / 2, y: cy - rh / 2, width: rw, height: rh, rx: 4 * px, fill: "#fff", "fill-opacity": 0.9 }));
      const t = el("text", { x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "central", "font-size": fs, "font-weight": 700, fill: a.cor });
      t.textContent = rotulo;
      svg.appendChild(t);
    });
    if (pontos.length) {
      if (pontos.length > 1) {
        svg.appendChild(el("polyline", { points: pontos.map(pt).join(" ") + (pontos.length > 2 ? " " + pt(pontos[0]) : ""), fill: pontos.length > 2 ? "rgba(192,57,43,.15)" : "none", stroke: "#c0392b", "stroke-width": 2.5 * px, "stroke-dasharray": `${8 * px},${5 * px}` }));
      }
      pontos.forEach((p, i) => {
        svg.appendChild(el("circle", { cx: p[0] * W, cy: p[1] * H, r: (i === 0 ? 9 : 7) * px, fill: "#fff", stroke: "#c0392b", "stroke-width": 3 * px }));
      });
    }
  }

  // ---------- painel inferior ----------
  function linhasBT() {
    return (opts.linhas() || []).filter((l) => String(l.seq || "").trim() !== "");
  }
  function renderBase() {
    if (modo === "desenhar") {
      base.innerHTML = `
        <div class="edmapa-dica">Toque nos <b>cantos</b> da área concretada. Arraste para mover, use dois dedos para zoom.</div>
        <div class="edmapa-linha">
          <span class="edmapa-cont">${pontos.length} ponto(s)</span>
          <button type="button" class="edmapa-btn" data-acao="desfazer" ${pontos.length ? "" : "disabled"}>↶ Desfazer</button>
          <button type="button" class="edmapa-btn" data-acao="cancelar">Cancelar</button>
          <button type="button" class="edmapa-btn primario" data-acao="fechar-area" ${pontos.length >= 3 ? "" : "disabled"}>Fechar área</button>
        </div>`;
    } else if (modo === "escolher-bt") {
      const bts = linhasBT();
      base.innerHTML = `
        <div class="edmapa-dica">Esta área é de qual caminhão (BT)?</div>
        <div class="edmapa-bts">
          ${bts.length ? bts.map((l) => `<button type="button" class="edmapa-bt" data-bt="${esc(l.seq)}" style="--cor:${opts.cor(l.seq)}">
              <b>BT ${esc(l.seq)}</b><small>${l.notaFiscal ? "NF " + esc(l.notaFiscal) : "sem NF"}</small></button>`).join("")
            : `<div class="edmapa-dica">Nenhuma betonada (BT) lançada nesta ficha ainda. Cadastre as betonadas no formulário e volte aqui.</div>`}
        </div>
        <div class="edmapa-linha"><button type="button" class="edmapa-btn" data-acao="voltar-desenho">← Voltar aos pontos</button></div>`;
    } else {
      base.innerHTML = `
        <div class="edmapa-linha">
          <button type="button" class="edmapa-btn primario grande" data-acao="nova-area">+ Nova área</button>
        </div>
        <div class="edmapa-areas">
          ${mp.areas.length ? mp.areas.map((a, i) => {
            const l = (opts.linhas() || []).find((x) => String(x.seq) === String(a.linhaSeq));
            return `<span class="edmapa-chip" style="--cor:${a.cor}"><i></i>BT ${esc(a.linhaSeq)}${l && l.notaFiscal ? " · NF " + esc(l.notaFiscal) : ""}
              <button type="button" data-remover="${i}" aria-label="Remover área">✕</button></span>`;
          }).join("") : `<span class="edmapa-dica">Nenhuma área demarcada ainda.</span>`}
        </div>`;
    }
  }

  // ---------- salvar ----------
  async function salvarAgora() {
    if (salvando) { salvarDeNovo = true; return; }
    salvando = true;
    salvoEl.textContent = "Salvando…";
    salvoEl.className = "edmapa-salvo";
    let ok = false;
    try { ok = await opts.salvar(); } catch (ex) { console.error(ex); }
    salvando = false;
    salvoEl.textContent = ok ? "✓ Salvo" : "Não salvou — tente de novo";
    salvoEl.className = "edmapa-salvo " + (ok ? "ok" : "erro");
    if (salvarDeNovo) { salvarDeNovo = false; salvarAgora(); }
  }

  // ---------- ações ----------
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao],[data-bt],[data-remover]");
    if (!b || b.disabled) return;
    if (b.dataset.bt != null) {
      const seq = b.dataset.bt;
      mp.areas.push({ pontos: pontos.slice(), linhaSeq: seq, cor: opts.cor(seq) });
      pontos = [];
      modo = "ver";
      renderBase(); desenhar();
      salvarAgora();
      return;
    }
    if (b.dataset.remover != null) {
      const i = +b.dataset.remover;
      if (!confirm("Remover a área do BT " + mp.areas[i].linhaSeq + "?")) return;
      mp.areas.splice(i, 1);
      renderBase(); desenhar();
      salvarAgora();
      return;
    }
    const [cx, cy] = centroPalco();
    switch (b.dataset.acao) {
      case "zoom-mais": zoomEm(cx, cy, s * 1.6); break;
      case "zoom-menos": zoomEm(cx, cy, s / 1.6); break;
      case "ajustar": ajustar(); break;
      case "nova-area": modo = "desenhar"; pontos = []; renderBase(); desenhar(); break;
      case "desfazer": pontos.pop(); renderBase(); desenhar(); break;
      case "cancelar": modo = "ver"; pontos = []; renderBase(); desenhar(); break;
      case "fechar-area": if (pontos.length >= 3) { modo = "escolher-bt"; renderBase(); } break;
      case "voltar-desenho": modo = "desenhar"; renderBase(); break;
      case "fechar": fechar(); break;
    }
  });

  // ---------- gestos (pointer events, com limpeza garantida dos dedos) ----------
  const dedos = new Map(); // pointerId → {x,y}
  let gesto = null;        // {tipo:"toque"|"arrasto"|"pinca", ...}
  palco.addEventListener("pointerdown", (e) => {
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Captura o dedo para continuar recebendo o movimento mesmo fora da área;
    // alguns navegadores recusam — não pode impedir o gesto.
    try { palco.setPointerCapture(e.pointerId); } catch (ex) { /* segue sem captura */ }
    const r = palco.getBoundingClientRect();
    if (dedos.size === 1) {
      gesto = { tipo: "toque", x0: e.clientX, y0: e.clientY, t0: Date.now(), tx0: tx, ty0: ty };
    } else if (dedos.size === 2) {
      const [a, b] = [...dedos.values()];
      gesto = { tipo: "pinca", d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, s0: s,
        mx0: (a.x + b.x) / 2 - r.left, my0: (a.y + b.y) / 2 - r.top, tx0: tx, ty0: ty };
    }
  });
  palco.addEventListener("pointermove", (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesto) return;
    const r = palco.getBoundingClientRect();
    if (gesto.tipo === "pinca" && dedos.size >= 2) {
      const [a, b] = [...dedos.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const novoS = limitarZoom(gesto.s0 * d / gesto.d0);
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const wx = (gesto.mx0 - gesto.tx0) / gesto.s0, wy = (gesto.my0 - gesto.ty0) / gesto.s0;
      s = novoS; tx = mx - wx * s; ty = my - wy * s;
      aplicar();
    } else if (dedos.size === 1 && (gesto.tipo === "toque" || gesto.tipo === "arrasto")) {
      const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
      if (gesto.tipo === "toque" && Math.hypot(dx, dy) > TOQUE_MAX_MOV) gesto.tipo = "arrasto";
      if (gesto.tipo === "arrasto") { tx = gesto.tx0 + dx; ty = gesto.ty0 + dy; aplicar(); }
    }
  });
  function soltar(e) {
    if (!dedos.has(e.pointerId)) return;
    dedos.delete(e.pointerId);
    if (gesto && gesto.tipo === "toque" && dedos.size === 0 && e.type === "pointerup"
        && Date.now() - gesto.t0 < TOQUE_MAX_MS && modo === "desenhar") {
      pontos.push(telaParaNorm(e.clientX, e.clientY));
      renderBase(); desenhar();
    }
    if (dedos.size === 0) gesto = null;
    else if (dedos.size === 1) {
      // terminou a pinça com um dedo ainda na tela: continua como arrasto
      const [p] = [...dedos.values()];
      gesto = { tipo: "arrasto", x0: p.x, y0: p.y, t0: 0, tx0: tx, ty0: ty };
    }
  }
  palco.addEventListener("pointerup", soltar);
  palco.addEventListener("pointercancel", soltar);
  palco.addEventListener("lostpointercapture", soltar);
  palco.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = palco.getBoundingClientRect();
    zoomEm(e.clientX - r.left, e.clientY - r.top, s * Math.pow(1.0018, -e.deltaY));
  }, { passive: false });
  const aoRedimensionar = () => ajustar();
  window.addEventListener("resize", aoRedimensionar);

  // Botão Voltar do celular: o tratador de "voltar" da ficha (main.js) chama
  // esta função quando o editor está aberto — fecha o editor, não a ficha.
  window.__edmapaFechar = () => fechar();

  function fechar() {
    if (modo !== "ver" && pontos.length && !confirm("Descartar a área que está sendo desenhada?")) return;
    delete window.__edmapaFechar;
    window.removeEventListener("resize", aoRedimensionar);
    document.documentElement.classList.remove("edmapa-aberto");
    raiz.remove();
    if (opts.aoFechar) opts.aoFechar();
  }

  renderBase();
  ajustar();
}
