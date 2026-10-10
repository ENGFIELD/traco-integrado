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
 *  - segurar o dedo ............ abre a LUPA ao lado (v1.15): arraste para
 *                                 ajustar na mira e solte para marcar o ponto
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
import { planejarRotulos, rotuloSvg, coresDistintas } from "./rotulo-mapa.js";

const ZOOM_MAX = 30;          // em relação ao "caber na tela" (v1.17: 12 → 30, o zoom agora fica nítido)
const TOQUE_MAX_MOV = 10;     // px — acima disso é arrasto, não toque
const TOQUE_MAX_MS = 450;
const LUPA_MS = 280;          // segurar o dedo parado por esse tempo abre a lupa (modo "Nova área")
const LUPA_TAM = 150;         // px (tela)
const LUPA_ZOOM = 3;          // aumento da lupa em relação ao que está na tela

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
 *  modoPecas: true = desenhar as PEÇAS da planta (P12, V105…) em vez das BTs (v1.37):
 *             cada área recebe um nome digitado (guardado em linhaSeq)
 */
export async function abrirEditorMapa(opts) {
  const mp = opts.mapeamento;
  if (!mp.areas) mp.areas = [];
  const PECAS = !!opts.modoPecas;
  const nomeArea = (a) => (PECAS ? String(a.linhaSeq) : "BT " + a.linhaSeq);

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
        <canvas class="edmapa-detalhe" data-detalhe hidden></canvas>
        <svg data-svg preserveAspectRatio="none"></svg>
      </div>
      <div class="edmapa-carregando" data-carregando>Carregando planta…</div>
    </div>
    <div class="edmapa-zoom">
      <button type="button" class="edmapa-btn redondo" data-acao="zoom-mais" aria-label="Aproximar">+</button>
      <button type="button" class="edmapa-btn redondo" data-acao="zoom-menos" aria-label="Afastar">−</button>
      <button type="button" class="edmapa-btn redondo" data-acao="ajustar" aria-label="Ajustar à tela">⤢</button>
      <button type="button" class="edmapa-btn redondo" data-acao="rotulos" aria-label="Mostrar ou ocultar os rótulos" title="Mostrar / ocultar rótulos">Aa</button>
    </div>
    <div class="edmapa-base" data-base></div>
    <canvas class="edmapa-lupa" data-lupa hidden aria-hidden="true"></canvas>
  `;
  document.body.appendChild(raiz);
  document.documentElement.classList.add("edmapa-aberto");

  const palco = raiz.querySelector("[data-palco]");
  const mundo = raiz.querySelector("[data-mundo]");
  const canvas = raiz.querySelector("[data-canvas]");
  const svg = raiz.querySelector("[data-svg]");
  const base = raiz.querySelector("[data-base]");
  const salvoEl = raiz.querySelector("[data-salvo]");
  // aviso curto no topo (ex.: "BT 3: P12, V105 e L5 entraram nas peças")
  const avisoEl = document.createElement("div");
  avisoEl.className = "edmapa-aviso"; avisoEl.hidden = true;
  raiz.appendChild(avisoEl);
  let avisoTimer = null;
  function avisar(t) { avisoEl.textContent = t; avisoEl.hidden = false; clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { avisoEl.hidden = true; }, 6000); }
  const lupa = raiz.querySelector("[data-lupa]");
  const detalhe = raiz.querySelector("[data-detalhe]");

  // ---------- estado ----------
  let W = 1, H = 1;                    // tamanho da planta em px
  let s = 1, tx = 0, ty = 0, sFit = 1; // transformação mundo → tela
  let modo = "ver";                    // "ver" | "desenhar" | "escolher-bt"
  let pontos = [];                     // área em desenho (normalizada)
  // v1.37: editar uma área já feita (arrastar os cantos, trocar BT/nome, redesenhar) e rótulos ocultáveis
  let editIdx = -1, trocando = false, redesenhando = -1;
  let mostrarRotulos = true;
  try { mostrarRotulos = localStorage.getItem("traco-edmapa-rotulos") !== "0"; } catch (ex) { /* sem armazenamento */ }
  let salvando = false, salvarDeNovo = false;
  // v1.17: zoom nítido — página do PDF guardada para redesenhar só o trecho visível
  let pagPdf = null, escalaBase = 1, detInfo = null, detTimer = null, detTarefa = null, detGeracao = 0;

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
      pagPdf = pag; escalaBase = alvo / v1.width;
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
  // v1.37: diz logo ao abrir se a planta tem os nomes das peças (P, V, L…) para preencher sozinho
  if (opts.aoAbrir) Promise.resolve(opts.aoAbrir()).then((msg) => { if (msg) avisar(msg); }).catch((ex) => console.warn(ex));
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
      agendarDetalhe();
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

  // ---------- zoom nítido (v1.17) ----------
  // A planta de base tem resolução fixa (~4000 px); ao aproximar, ela fica
  // borrada. Parado o gesto, redesenhamos do próprio PDF só o trecho que está
  // na tela, na resolução da tela, e colocamos por cima (no mesmo lugar da planta).
  function agendarDetalhe() {
    if (!pagPdf) return;
    clearTimeout(detTimer);
    detTimer = setTimeout(renderDetalhe, 180);
  }
  async function renderDetalhe() {
    const dpr = window.devicePixelRatio || 1;
    let dens = s * dpr; // px do detalhe por px da planta de base
    if (dens <= 1.1) { detalhe.hidden = true; detInfo = null; return; }
    const r = palco.getBoundingClientRect();
    let x0 = Math.max(0, -tx / s), y0 = Math.max(0, -ty / s);
    let x1 = Math.min(W, (r.width - tx) / s), y1 = Math.min(H, (r.height - ty) / s);
    if (x1 <= x0 || y1 <= y0) return;
    const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15; // folga para arrastar um pouco sem perder nitidez
    x0 = Math.max(0, x0 - mx); y0 = Math.max(0, y0 - my); x1 = Math.min(W, x1 + mx); y1 = Math.min(H, y1 + my);
    const lim = 14e6; // limite de canvas do iPhone (~16,7 MP)
    if ((x1 - x0) * (y1 - y0) * dens * dens > lim) dens = Math.sqrt(lim / ((x1 - x0) * (y1 - y0)));
    if (dens <= 1.1) { detalhe.hidden = true; detInfo = null; return; }
    const ger = ++detGeracao;
    if (detTarefa) { try { detTarefa.cancel(); } catch (ex) { /* já terminou */ } }
    const off = document.createElement("canvas");
    off.width = Math.ceil((x1 - x0) * dens); off.height = Math.ceil((y1 - y0) * dens);
    const c = off.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, off.width, off.height);
    const vp = pagPdf.getViewport({ scale: escalaBase * dens, offsetX: -x0 * dens, offsetY: -y0 * dens });
    detTarefa = pagPdf.render({ canvasContext: c, viewport: vp });
    try { await detTarefa.promise; } catch (ex) { return; } // cancelado por um gesto novo
    if (ger !== detGeracao) return;
    detalhe.width = off.width; detalhe.height = off.height;
    detalhe.getContext("2d").drawImage(off, 0, 0);
    Object.assign(detalhe.style, { left: x0 + "px", top: y0 + "px", width: (x1 - x0) + "px", height: (y1 - y0) + "px" });
    detalhe.hidden = false;
    detInfo = { x0, y0, x1, y1, dens };
  }

  // ---------- desenho (SVG em coordenadas da planta; traços com espessura fixa na tela) ----------
  const NS = "http://www.w3.org/2000/svg";
  function el(nome, attrs) {
    const e = document.createElementNS(NS, nome);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  // v1.36: rótulos planejados juntos (os que não cabem vão para fora, com linha)
  // e cores que não se confundem entre vizinhas — refeitos só quando algo muda
  let cacheMapa = { chave: null, rotulos: [], cores: new Map() };
  function textosDe(a) {
    if (PECAS) return { bt: String(a.linhaSeq), nf: "" };
    const lin = (opts.linhas() || []).find((l) => String(l.seq) === String(a.linhaSeq));
    return { bt: "BT " + a.linhaSeq, nf: lin && String(lin.notaFiscal || "").trim() ? "NF: " + String(lin.notaFiscal).trim() : "" };
  }
  function planoMapa() {
    const chave = W + "x" + H + "|" + mp.areas.map((a) => { const t = textosDe(a); return t.bt + "|" + t.nf + "|" + (a.pontos || []).join(";"); }).join("#");
    if (cacheMapa.chave !== chave) {
      cacheMapa = { chave, rotulos: planejarRotulos(mp.areas, W, H, textosDe), cores: coresDistintas(mp.areas, opts.cor) };
    }
    return cacheMapa;
  }
  const corDe = (a) => planoMapa().cores.get(String(a.linhaSeq)) || a.cor;
  function desenhar() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const px = 1 / s; // 1 pixel de tela em unidades da planta
    if (!isFinite(px) || px <= 0) return;
    const pt = (p) => `${p[0] * W},${p[1] * H}`;
    const plano = planoMapa();
    mp.areas.forEach((a) => {
      if (!a.pontos || a.pontos.length < 3) return;
      svg.appendChild(el("polygon", { points: a.pontos.map(pt).join(" "), fill: corDe(a), "fill-opacity": 0.32, stroke: corDe(a), "stroke-width": 2.5 * px }));
    });
    // rótulos por cima de todas as áreas: "BT 1" e, embaixo, a NF da betonada
    if (mostrarRotulos) mp.areas.forEach((a, i) => {
      if (plano.rotulos[i]) rotuloSvg(svg, plano.rotulos[i], textosDe(a), corDe(a));
    });
    // área em edição: contorno destacado e uma bolinha em cada canto (arrastar para ajustar)
    const ed = modo === "editar" && mp.areas[editIdx];
    if (ed) {
      svg.appendChild(el("polygon", { points: ed.pontos.map(pt).join(" "), fill: "none", stroke: "#fff", "stroke-width": 6 * px }));
      svg.appendChild(el("polygon", { points: ed.pontos.map(pt).join(" "), fill: corDe(ed), "fill-opacity": 0.2, stroke: corDe(ed), "stroke-width": 3 * px, "stroke-dasharray": `${8 * px},${5 * px}` }));
      ed.pontos.forEach((p) => svg.appendChild(el("circle", { cx: p[0] * W, cy: p[1] * H, r: 10 * px, fill: "#fff", stroke: corDe(ed), "stroke-width": 3.5 * px })));
    }
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
        <div class="edmapa-dica">Toque nos <b>cantos</b> ${PECAS ? "da peça" : "da área concretada"}. <b>Segure o dedo</b> para abrir a lupa e acertar a linha. Arraste para mover, dois dedos para zoom.</div>
        <div class="edmapa-linha">
          <span class="edmapa-cont">${pontos.length} ponto(s)</span>
          <button type="button" class="edmapa-btn" data-acao="desfazer" ${pontos.length ? "" : "disabled"}>↶ Desfazer</button>
          <button type="button" class="edmapa-btn" data-acao="cancelar">Cancelar</button>
          <button type="button" class="edmapa-btn primario" data-acao="fechar-area" ${pontos.length >= 3 ? "" : "disabled"}>Fechar área</button>
        </div>`;
    } else if (modo === "escolher-bt" && PECAS) {
      base.innerHTML = `
        <div class="edmapa-dica">Qual é esta peça? (ex.: P12, V105, L3)</div>
        <div class="edmapa-linha">
          ${["P", "V", "L", "PAR", "ESC"].map((x) => `<button type="button" class="edmapa-btn" data-prefixo="${x}">${x}</button>`).join("")}
          <input type="text" class="edmapa-nome-peca" data-nome-peca autocomplete="off" autocapitalize="characters" placeholder="nome da peça" style="flex:1;min-width:110px;font-size:16px;padding:8px;border-radius:8px;border:0;">
        </div>
        <div class="edmapa-linha">
          <button type="button" class="edmapa-btn" data-acao="voltar-desenho">← Voltar aos pontos</button>
          <button type="button" class="edmapa-btn primario" data-acao="confirmar-peca">Guardar peça</button>
        </div>`;
      const inp = base.querySelector("[data-nome-peca]");
      setTimeout(() => inp.focus(), 50);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") base.querySelector('[data-acao="confirmar-peca"]').click(); });
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
    } else if (modo === "editar" && mp.areas[editIdx]) {
      const a = mp.areas[editIdx];
      const irmas = mp.areas.filter((x) => String(x.linhaSeq) === String(a.linhaSeq)).length;
      base.innerHTML = `
        <div class="edmapa-dica">Editando <b>${esc(nomeArea(a))}</b>${irmas > 1 ? " (" + irmas + " áreas — toque na outra para editá-la)" : ""}: arraste as bolinhas para ajustar os cantos.</div>
        <div class="edmapa-linha">
          <button type="button" class="edmapa-btn" data-acao="trocar">${PECAS ? "Trocar nome" : "Trocar BT"}</button>
          <button type="button" class="edmapa-btn" data-acao="redesenhar">Redesenhar</button>
          <button type="button" class="edmapa-btn" data-acao="excluir-area">Excluir</button>
          <button type="button" class="edmapa-btn primario" data-acao="pronto">✓ Pronto</button>
        </div>`;
    } else {
      // v1.37: uma linha por BT (ou peça), mesmo com várias áreas; tocar edita
      const grupos = [];
      mp.areas.forEach((a, i) => {
        const g = grupos.find((x) => String(x.seq) === String(a.linhaSeq));
        if (g) g.idx.push(i); else grupos.push({ seq: a.linhaSeq, idx: [i] });
      });
      base.innerHTML = `
        <div class="edmapa-linha">
          <button type="button" class="edmapa-btn primario grande" data-acao="nova-area">${PECAS ? "+ Nova peça" : "+ Nova área"}</button>
        </div>
        ${mp.areas.length ? `<div class="edmapa-dica">Toque numa ${PECAS ? "peça" : "área"} (aqui ou na planta) para editar.</div>` : ""}
        <div class="edmapa-areas">
          ${grupos.length ? grupos.map((g) => {
            const a = mp.areas[g.idx[0]];
            const l = (opts.linhas() || []).find((x) => String(x.seq) === String(a.linhaSeq));
            return `<span class="edmapa-chip" style="--cor:${corDe(a)}"><button type="button" class="edmapa-chip-nome" data-editar="${g.idx[0]}"><i></i>${esc(nomeArea(a))}${!PECAS && l && l.notaFiscal ? " · NF " + esc(l.notaFiscal) : ""}${g.idx.length > 1 ? " (" + g.idx.length + " áreas)" : ""}</button>
              <button type="button" data-remover="${g.idx.join(",")}" aria-label="Remover">✕</button></span>`;
          }).join("") : `<span class="edmapa-dica">Nenhuma ${PECAS ? "peça marcada" : "área demarcada"} ainda.</span>`}
        </div>`;
    }
  }

  let vertMexido = false, editIdxAnterior = -1;
  function editar(i) {
    if (!mp.areas[i]) return;
    editIdx = i; editIdxAnterior = i; trocando = false; modo = "editar";
    renderBase(); desenhar();
  }
  // área da planta no ponto (a menor que contém o ponto — a de cima)
  function areaNoPonto(u, v) {
    let melhor = -1, menor = Infinity;
    mp.areas.forEach((a, i) => {
      if (!a.pontos || a.pontos.length < 3) return;
      let d = false;
      for (let k = 0, j = a.pontos.length - 1; k < a.pontos.length; j = k++) {
        const p = a.pontos[k], q = a.pontos[j];
        if ((p[1] > v) !== (q[1] > v) && u < (q[0] - p[0]) * (v - p[1]) / (q[1] - p[1]) + p[0]) d = !d;
      }
      if (!d) return;
      let ar = 0;
      for (let k = 0, j = a.pontos.length - 1; k < a.pontos.length; j = k++) ar += (a.pontos[j][0] + a.pontos[k][0]) * (a.pontos[j][1] - a.pontos[k][1]);
      if (Math.abs(ar) < menor) { menor = Math.abs(ar); melhor = i; }
    });
    return melhor;
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
    const b = e.target.closest("[data-acao],[data-bt],[data-remover],[data-prefixo],[data-editar]");
    if (!b || b.disabled) return;
    if (b.dataset.prefixo != null) {
      const inp = base.querySelector("[data-nome-peca]");
      if (inp) { inp.value = b.dataset.prefixo; inp.focus(); }
      return;
    }
    if (b.dataset.editar != null) { editar(+b.dataset.editar); return; }
    if (b.dataset.acao === "confirmar-peca") {
      const inp = base.querySelector("[data-nome-peca]");
      const nome = String(inp ? inp.value : "").trim().toUpperCase().replace(/\s+/g, "");
      if (!nome) { if (inp) inp.focus(); return; }
      if (trocando && mp.areas[editIdx]) {
        trocando = false; Object.assign(mp.areas[editIdx], { linhaSeq: nome, cor: opts.cor(nome) });
        modo = "editar"; renderBase(); desenhar(); salvarAgora();
        return;
      }
      mp.areas.push({ pontos: pontos.slice(), linhaSeq: nome, cor: opts.cor(nome) });
      pontos = []; modo = "ver";
      renderBase(); desenhar(); salvarAgora();
      return;
    }
    if (b.dataset.bt != null && trocando && mp.areas[editIdx]) {
      const seq = b.dataset.bt, area = mp.areas[editIdx];
      trocando = false; Object.assign(area, { linhaSeq: seq, cor: opts.cor(seq) });
      modo = "editar"; renderBase(); desenhar();
      Promise.resolve(opts.aoMarcarArea ? opts.aoMarcarArea(area) : "").catch(() => "").then((msg) => { if (msg) avisar(msg); salvarAgora(); });
      return;
    }
    if (b.dataset.bt != null) {
      const seq = b.dataset.bt;
      const area = { pontos: pontos.slice(), linhaSeq: seq, cor: opts.cor(seq) };
      mp.areas.push(area);
      pontos = [];
      modo = "ver";
      renderBase(); desenhar();
      // v1.37: as peças da planta que caem dentro da área entram na BT antes de salvar
      Promise.resolve(opts.aoMarcarArea ? opts.aoMarcarArea(area) : "").catch((ex) => { console.error(ex); return ""; })
        .then((msg) => { if (msg) avisar(msg); renderBase(); salvarAgora(); });
      return;
    }
    if (b.dataset.remover != null) {
      const idx = String(b.dataset.remover).split(",").map(Number).filter((i) => mp.areas[i]);
      if (!idx.length) return;
      const nome = nomeArea(mp.areas[idx[0]]);
      if (!confirm(idx.length > 1 ? "Remover as " + idx.length + " áreas de " + nome + "?" : "Remover " + (PECAS ? "a peça " : "a área de ") + nome + "?")) return;
      idx.sort((x, y) => y - x).forEach((i) => mp.areas.splice(i, 1));
      editIdx = -1;
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
      case "cancelar":
        pontos = [];
        if (redesenhando >= 0) { editIdx = redesenhando; redesenhando = -1; modo = "editar"; } else modo = "ver";
        renderBase(); desenhar(); break;
      case "fechar-area":
        if (pontos.length < 3) break;
        if (redesenhando >= 0 && mp.areas[redesenhando]) { // redesenhar: mesma BT/peça, contorno novo
          const area = mp.areas[redesenhando];
          area.pontos = pontos.slice(); pontos = []; editIdx = redesenhando; redesenhando = -1; modo = "editar";
          renderBase(); desenhar();
          Promise.resolve(!PECAS && opts.aoMarcarArea ? opts.aoMarcarArea(area) : "").catch(() => "").then((msg) => { if (msg) avisar(msg); salvarAgora(); });
          break;
        }
        modo = "escolher-bt"; renderBase(); break;
      case "rotulos":
        mostrarRotulos = !mostrarRotulos;
        try { localStorage.setItem("traco-edmapa-rotulos", mostrarRotulos ? "1" : "0"); } catch (ex) { /* sem armazenamento */ }
        avisar(mostrarRotulos ? "Rótulos à mostra" : "Rótulos ocultos (toque em Aa para mostrar)");
        desenhar(); break;
      case "trocar": trocando = true; modo = "escolher-bt"; renderBase(); break;
      case "redesenhar": redesenhando = editIdx; pontos = []; modo = "desenhar"; renderBase(); desenhar(); break;
      case "excluir-area":
        if (!mp.areas[editIdx] || !confirm("Excluir " + (PECAS ? "a peça " : "esta área de ") + nomeArea(mp.areas[editIdx]) + "?")) break;
        mp.areas.splice(editIdx, 1); editIdx = -1; modo = "ver"; renderBase(); desenhar(); salvarAgora(); break;
      case "pronto": editIdx = -1; modo = "ver"; renderBase(); desenhar();
        if (vertMexido) { vertMexido = false; const a = mp.areas[editIdxAnterior]; if (a && !PECAS && opts.aoMarcarArea) Promise.resolve(opts.aoMarcarArea(a)).then((msg) => { if (msg) avisar(msg); salvarAgora(); }); }
        break;
      case "voltar-desenho": if (trocando) { trocando = false; modo = "editar"; } else modo = "desenhar"; renderBase(); break;
      case "fechar": fechar(); break;
    }
  });

  // ---------- lupa (v1.15) ----------
  // Mostra, ao lado do dedo, a planta ampliada em volta do ponto que vai ser
  // marcado, com uma mira no centro — o dedo não esconde mais a linha do projeto.
  function mostrarLupa(clientX, clientY) {
    const dpr = window.devicePixelRatio || 1;
    const tamPx = Math.round(LUPA_TAM * dpr);
    if (lupa.width !== tamPx || lupa.height !== tamPx) { lupa.width = tamPx; lupa.height = tamPx; }
    lupa.hidden = false;
    const r = palco.getBoundingClientRect();
    const wx = (clientX - r.left - tx) / s, wy = (clientY - r.top - ty) / s; // ponto na planta (px)
    const lado = LUPA_TAM / (s * LUPA_ZOOM);                                   // pedaço da planta mostrado
    const k = lupa.width / lado;                                               // planta → lupa
    const ox = wx - lado / 2, oy = wy - lado / 2;
    const c = lupa.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#fff"; c.fillRect(0, 0, lupa.width, lupa.height);
    try {
      c.imageSmoothingEnabled = true;
      const d = detInfo;
      if (d && !detalhe.hidden && ox >= d.x0 && oy >= d.y0 && ox + lado <= d.x1 && oy + lado <= d.y1)
        c.drawImage(detalhe, (ox - d.x0) * d.dens, (oy - d.y0) * d.dens, lado * d.dens, lado * d.dens, 0, 0, lupa.width, lupa.height);
      else c.drawImage(canvas, ox, oy, lado, lado, 0, 0, lupa.width, lupa.height);
    } catch (ex) { /* planta ainda não carregou */ }
    const P = (p) => [(p[0] * W - ox) * k, (p[1] * H - oy) * k];
    c.lineWidth = 2 * dpr;
    mp.areas.forEach((a) => {
      if (!a.pontos || a.pontos.length < 3) return;
      c.beginPath(); a.pontos.forEach((p, i) => { const q = P(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath();
      c.globalAlpha = 0.25; c.fillStyle = corDe(a); c.fill(); c.globalAlpha = 1; c.strokeStyle = corDe(a); c.stroke();
    });
    if (pontos.length) {
      c.strokeStyle = "#c0392b"; c.setLineDash([6 * dpr, 4 * dpr]);
      c.beginPath(); pontos.forEach((p, i) => { const q = P(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
      const fim = P([wx / W, wy / H]); c.lineTo(fim[0], fim[1]); c.stroke(); c.setLineDash([]);
      pontos.forEach((p) => { const q = P(p); c.beginPath(); c.arc(q[0], q[1], 4 * dpr, 0, 7); c.fillStyle = "#fff"; c.fill(); c.stroke(); });
    }
    // mira
    const m = lupa.width / 2, g = 6 * dpr, b = 22 * dpr;
    // contorno branco por baixo: a mira aparece também em cima de linhas e áreas vermelhas
    const mira = () => { c.beginPath(); c.moveTo(m - b, m); c.lineTo(m - g, m); c.moveTo(m + g, m); c.lineTo(m + b, m);
      c.moveTo(m, m - b); c.lineTo(m, m - g); c.moveTo(m, m + g); c.lineTo(m, m + b); c.stroke(); };
    c.lineCap = "round";
    c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 5 * dpr; mira();
    c.strokeStyle = "#111"; c.lineWidth = 2 * dpr; mira();
    c.beginPath(); c.arc(m, m, 3 * dpr, 0, 7); c.fillStyle = "#fff"; c.fill();
    c.beginPath(); c.arc(m, m, 1.8 * dpr, 0, 7); c.fillStyle = "#e11d48"; c.fill();
    // posição: ao lado do dedo (à esquerda; à direita se o dedo estiver perto da borda esquerda), um pouco acima
    const vw = window.innerWidth, vh = window.innerHeight, dist = LUPA_TAM * 0.75;
    let left = clientX - dist - LUPA_TAM / 2;
    if (left < 8) left = clientX + dist - LUPA_TAM / 2;
    let top = clientY - LUPA_TAM * 0.9;
    left = Math.max(8, Math.min(vw - LUPA_TAM - 8, left));
    top = Math.max(8, Math.min(vh - LUPA_TAM - 8, top));
    lupa.style.left = left + "px"; lupa.style.top = top + "px";
  }
  function esconderLupa() { lupa.hidden = true; }

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
      gesto = { tipo: "toque", x0: e.clientX, y0: e.clientY, t0: Date.now(), tx0: tx, ty0: ty, x: e.clientX, y: e.clientY };
      // editando: começar em cima de uma bolinha = arrastar aquele canto
      if (modo === "editar" && mp.areas[editIdx]) {
        let vi = -1, dmin = 26;
        mp.areas[editIdx].pontos.forEach((p, k) => {
          const d = Math.hypot(r.left + tx + p[0] * W * s - e.clientX, r.top + ty + p[1] * H * s - e.clientY);
          if (d < dmin) { dmin = d; vi = k; }
        });
        if (vi >= 0) { gesto.tipo = "vertice"; gesto.vi = vi; }
      }
      // segurar parado no modo "Nova área" (dedo ou caneta) → lupa
      if (modo === "desenhar" && e.pointerType !== "mouse") {
        const g = gesto;
        g.timer = setTimeout(() => {
          if (gesto === g && g.tipo === "toque" && dedos.size === 1) { g.tipo = "lupa"; mostrarLupa(g.x, g.y); }
        }, LUPA_MS);
      }
    } else if (dedos.size === 2) {
      if (gesto && gesto.timer) clearTimeout(gesto.timer);
      esconderLupa();
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
    } else if (dedos.size === 1 && gesto.tipo === "vertice" && mp.areas[editIdx]) {
      mp.areas[editIdx].pontos[gesto.vi] = telaParaNorm(e.clientX, e.clientY);
      vertMexido = true;
      desenhar();
    } else if (dedos.size === 1 && gesto.tipo === "lupa") {
      gesto.x = e.clientX; gesto.y = e.clientY;
      mostrarLupa(e.clientX, e.clientY);
    } else if (dedos.size === 1 && (gesto.tipo === "toque" || gesto.tipo === "arrasto")) {
      gesto.x = e.clientX; gesto.y = e.clientY;
      const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
      if (gesto.tipo === "toque" && Math.hypot(dx, dy) > TOQUE_MAX_MOV) { gesto.tipo = "arrasto"; clearTimeout(gesto.timer); }
      if (gesto.tipo === "arrasto") { tx = gesto.tx0 + dx; ty = gesto.ty0 + dy; aplicar(); }
    }
  });
  function soltar(e) {
    if (!dedos.has(e.pointerId)) return;
    dedos.delete(e.pointerId);
    if (gesto && gesto.timer) clearTimeout(gesto.timer);
    if (gesto && gesto.tipo === "lupa") {
      esconderLupa();
      // solta o dedo: marca o ponto na mira (pointercancel não marca)
      if (e.type === "pointerup" && dedos.size === 0 && modo === "desenhar") {
        pontos.push(telaParaNorm(gesto.x, gesto.y));
        renderBase(); desenhar();
      }
      if (dedos.size === 0) gesto = null;
      return;
    }
    if (gesto && gesto.tipo === "vertice") {
      if (dedos.size === 0) { gesto = null; salvarAgora(); }
      return;
    }
    if (gesto && gesto.tipo === "toque" && dedos.size === 0 && e.type === "pointerup"
        && Date.now() - gesto.t0 < TOQUE_MAX_MS && modo === "desenhar") {
      pontos.push(telaParaNorm(e.clientX, e.clientY));
      renderBase(); desenhar();
    } else if (gesto && gesto.tipo === "toque" && dedos.size === 0 && e.type === "pointerup"
        && Date.now() - gesto.t0 < TOQUE_MAX_MS && (modo === "ver" || modo === "editar")) {
      // tocar numa área (fora das bolinhas) = editar essa área
      const [u, v] = telaParaNorm(e.clientX, e.clientY);
      const i = areaNoPonto(u, v);
      if (i >= 0 && i !== editIdx) editar(i);
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
    if (modo !== "ver" && modo !== "editar" && pontos.length && !confirm("Descartar a área que está sendo desenhada?")) return;
    delete window.__edmapaFechar;
    clearTimeout(detTimer); detGeracao++;
    window.removeEventListener("resize", aoRedimensionar);
    document.documentElement.classList.remove("edmapa-aberto");
    raiz.remove();
    if (opts.aoFechar) opts.aoFechar();
  }

  renderBase();
  ajustar();
}
