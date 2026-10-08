/* Assinatura eletrônica (v1.15 — Fase 2, itens 8 e 9 do plano).
 *
 * Cadastro: cada pessoa desenha a assinatura na tela (dedo ou caneta) ou
 * importa uma foto da assinatura no papel; o fundo claro é removido e a imagem
 * é recortada e reduzida (PNG de ~10–30 KB). Fica em assinaturas/<uid>:
 *   { nome, papel, crea, email, imagem (data:image/png), atualizadoEm }
 * Só a própria pessoa grava a sua (firestore.rules).
 *
 * Na FVS, cada assinatura vira uma entrada em fvs.assinaturas[] com uma CÓPIA
 * da imagem — se a pessoa trocar a assinatura depois, as fichas antigas
 * continuam com a de antes. Ver main.js (assinarFvs / novaRevisaoFvs).
 *
 * Valor legal: assinatura eletrônica simples (Lei 14.063/2020).
 */

export const PAPEIS = {
  engenheiro: "Engenheiro(a) responsável",
  tecnico: "Técnico(a) — inspeção",
  estagiario: "Estagiário(a) — inspeção",
  encarregado: "Encarregado(a)",
};
const TINTA = "#1a2a4a"; // azul-escuro de caneta: aparece bem no papel e na tela clara e escura (fundo branco da caixa)
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Recorta as margens vazias (transparentes) e reduz para no máximo maxW × maxH. Devolve data:image/png ou "" se vazio */
export function recortarAssinatura(src, maxW, maxH) {
  maxW = maxW || 600; maxH = maxH || 220;
  const ctx = src.getContext("2d");
  const { width: w, height: h } = src;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return "";
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const k = Math.min(1, maxW / cw, maxH / ch);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const o = out.getContext("2d");
  o.imageSmoothingQuality = "high";
  o.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/* Foto da assinatura no papel → só o traço: o que é claro (papel) vira
 * transparente; o resto vira tinta, com a opacidade pela escuridão (borda suave). */
function limparFundo(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h), p = d.data;
  // limiar automático: média de brilho da imagem (o papel domina a foto)
  let soma = 0;
  for (let i = 0; i < p.length; i += 4) soma += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  const media = soma / (p.length / 4), corte = Math.min(215, media * 0.82), cheio = corte * 0.55;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (l >= corte) { p[i + 3] = 0; continue; }
    const a = l <= cheio ? 255 : Math.round(255 * (corte - l) / (corte - cheio));
    p[i] = 0x1a; p[i + 1] = 0x2a; p[i + 2] = 0x4a; p[i + 3] = a;
  }
  ctx.putImageData(d, 0, 0);
}

/**
 * Tela de cadastro da assinatura.
 * opts: { atual (assinaturas/<uid> ou null), emailNome (sugestão de nome), salvar: async (dados) => void }
 */
export function abrirCadastroAssinatura(opts) {
  const a = opts.atual || {};
  const ov = document.createElement("div");
  ov.className = "overlay ct-ficha-ov";
  ov.innerHTML = `<div class="modal assin-modal" role="dialog" aria-modal="true" aria-labelledby="assin-tit">
    <div class="modal-head"><h2 id="assin-tit">Minha assinatura</h2><button class="close-x" data-fechar aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <p class="view-desc">Cadastre uma vez e use para assinar as FVS. A ficha guarda uma cópia da assinatura, com data e hora. Vale como assinatura eletrônica simples (Lei 14.063/2020).</p>
      <div class="grid3">
        <div class="field"><label for="assin-nome">Nome completo</label><input id="assin-nome" type="text" autocomplete="name" value="${esc(a.nome || opts.emailNome || "")}"></div>
        <div class="field"><label for="assin-papel">Como você assina as fichas</label><select id="assin-papel">
          ${Object.keys(PAPEIS).map((k) => `<option value="${k}"${(a.papel || "engenheiro") === k ? " selected" : ""}>${PAPEIS[k]}</option>`).join("")}</select></div>
        <div class="field"><label for="assin-crea">CREA / CFT (opcional)</label><input id="assin-crea" type="text" inputmode="numeric" value="${esc(a.crea || "")}"></div>
      </div>
      ${a.imagem ? `<div class="assin-atual"><span>Assinatura atual:</span><img src="${esc(a.imagem)}" alt="Assinatura atual"></div>` : ""}
      <div class="assin-pad-caixa">
        <canvas class="assin-pad" aria-label="Assine aqui com o dedo, a caneta ou o mouse"></canvas>
        <div class="assin-linha">Assine aqui</div>
      </div>
      <div class="assin-acoes">
        <button type="button" class="btn" data-limpar>Limpar</button>
        <label class="btn" for="assin-arquivo">Importar foto da assinatura</label>
        <input type="file" id="assin-arquivo" accept="image/*" hidden>
        <small class="assin-msg" data-msg></small>
      </div>
    </div>
    <div class="modal-foot"><div></div><div style="display:flex;gap:10px;"><button class="btn" data-fechar>Cancelar</button><button class="btn primary" data-salvar>Salvar assinatura</button></div></div>
  </div>`;
  document.body.appendChild(ov);
  const cv = ov.querySelector(".assin-pad"), msg = ov.querySelector("[data-msg]");
  const ctx = cv.getContext("2d");
  let vazio = true, desenhando = false, ult = null;
  function ajustar() {
    const d = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = TINTA; ctx.lineWidth = 2.6;
    vazio = true;
  }
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointerdown", (e) => { e.preventDefault(); desenhando = true; ult = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (ex) { /* sem captura */ }
    ctx.beginPath(); ctx.arc(ult.x, ult.y, 1.3, 0, 7); ctx.fillStyle = TINTA; ctx.fill(); vazio = false; });
  cv.addEventListener("pointermove", (e) => {
    if (!desenhando) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ult = p; vazio = false;
  });
  ["pointerup", "pointercancel"].forEach((n) => cv.addEventListener(n, () => { desenhando = false; }));
  ov.querySelector("[data-limpar]").addEventListener("click", () => { ajustar(); msg.textContent = ""; });
  ov.querySelector("#assin-arquivo").addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      URL.revokeObjectURL(url);
      ajustar();
      const d = window.devicePixelRatio || 1, W = cv.width / d, H = cv.height / d;
      const k = Math.min(W / img.width, H / img.height) * 0.92, w = img.width * k, h = img.height * k;
      const aux = document.createElement("canvas");
      aux.width = Math.max(1, Math.round(w * d)); aux.height = Math.max(1, Math.round(h * d));
      const ax = aux.getContext("2d");
      ax.drawImage(img, 0, 0, aux.width, aux.height);
      limparFundo(ax, aux.width, aux.height);
      ctx.drawImage(aux, (W - w) / 2, (H - h) / 2, w, h);
      vazio = false;
      msg.textContent = "Foto importada: o fundo do papel foi removido. Confira antes de salvar.";
    };
    img.onerror = () => { URL.revokeObjectURL(url); msg.textContent = "Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG."; };
    img.src = url;
  });
  const fechar = () => { ov.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = (ev) => { if (ev.key === "Escape") fechar(); };
  document.addEventListener("keydown", tecla);
  ov.addEventListener("click", async (ev) => {
    if (ev.target === ov || ev.target.closest("[data-fechar]")) return fechar();
    const b = ev.target.closest("[data-salvar]");
    if (!b) return;
    const nome = ov.querySelector("#assin-nome").value.trim();
    if (!nome) { msg.textContent = "Informe o nome completo."; return; }
    let imagem = a.imagem || "";
    if (!vazio) imagem = recortarAssinatura(cv);
    if (!imagem) { msg.textContent = "Assine no quadro ou importe uma foto da assinatura."; return; }
    b.disabled = true; msg.textContent = "Salvando…";
    try {
      await opts.salvar({ nome, papel: ov.querySelector("#assin-papel").value, crea: ov.querySelector("#assin-crea").value.trim(), imagem });
      fechar();
    } catch (ex) {
      console.error(ex);
      b.disabled = false;
      msg.textContent = "Não foi possível salvar: " + (ex && ex.code === "permission-denied" ? "o banco ainda não aceita assinaturas (falta publicar as regras)." : (ex && ex.message ? ex.message : "erro desconhecido"));
    }
  });
  requestAnimationFrame(ajustar);
}

/** Bloco "Assinaturas" de uma ficha (HTML). assinaturas: fvs.assinaturas */
export function assinaturasHtml(assinaturas, fmtDataHora) {
  const lista = Array.isArray(assinaturas) ? assinaturas : [];
  if (!lista.length) return `<div class="hint">Nenhuma assinatura ainda.</div>`;
  return `<div class="assin-lista">${lista.map((s) => `<div class="assin-item">
      ${s.imagem ? `<img src="${esc(s.imagem)}" alt="Assinatura de ${esc(s.nome)}">` : ""}
      <div class="assin-info"><b>${esc(s.nome)}</b><span>${esc(PAPEIS[s.papel] || s.papel || "")}${s.crea ? " · " + esc(s.crea) : ""}</span>
        <small>assinou em ${esc(fmtDataHora(s.em))}</small></div></div>`).join("")}</div>`;
}
