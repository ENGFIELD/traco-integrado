/* Pendências da desforma por foto (v1.36).
 *
 * Como o dono trabalha: anda pela obra andar por andar, tira fotos do que a
 * empresa de forma (Freiba) precisa corrigir depois da desforma e manda num
 * grupo de WhatsApp. Essas pendências pertencem à FVS 04 (Forma, Desforma,
 * Armação e Concretagem) da concretagem daquele local — categoria "Desforma"
 * do checklist.
 *
 * Aqui: escolhe o pavimento → a concretagem → tira as fotos e escreve uma
 * linha de cada → "Gravar": cada foto vira uma não conformidade na FVS 04 da
 * concretagem (se a concretagem ainda não tem FVS 04, ela é criada e ligada)
 * → "Enviar no WhatsApp": as fotos e a lista vão juntas, pelo compartilhar do
 * celular. As pendências já registradas aparecem embaixo, com "Resolvida".
 *
 * Nada é apagado: só acrescenta não conformidades (campo origem:"desforma").
 */

let ctx = null;
export function iniciarDesforma(c) { ctx = c; }

const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; };

export const ELEMENTOS_DESFORMA = ["Pilar", "Viga", "Laje", "Parede", "Escada", "Fundo de laje", "Borda / testeira", "Outro"];
export const RESPONSAVEL_PADRAO = "Freiba";

/** Texto da mensagem para a empresa de forma (o mesmo vai junto com as fotos). */
export function mensagemDesforma(o) {
  const linhas = [];
  linhas.push("*Pendências da desforma* — " + (o.pavimento || "local não informado"));
  linhas.push("Concretagem de " + (dataBR(o.dataConcretagem) || "—") + (o.fvs ? " · " + o.fvs : ""));
  linhas.push("");
  (o.itens || []).forEach((it, i) => {
    const desc = String(it.descricao || "").trim() || "ver foto";
    linhas.push((i + 1) + ". " + (it.elemento ? it.elemento + ": " : "") + desc + (it.temFoto ? " (foto " + (i + 1) + ")" : ""));
  });
  linhas.push("");
  if (o.prazo) linhas.push("Prazo para corrigir: " + dataBR(o.prazo));
  linhas.push("Responsável: " + (o.responsavel || RESPONSAVEL_PADRAO) + ". Favor avisar quando estiver corrigido.");
  return linhas.join("\n");
}

/** Concretagens de um pavimento, da mais nova para a mais antiga. rasts: [{ id, r }] */
export function concretagensDoPavimento(rasts, pavimento, compativeis, pavimentosDe) {
  if (!pavimento) return [];
  return (rasts || []).filter((x) => pavimentosDe(x.r).some((p) => compativeis(p, pavimento)))
    .sort((a, b) => String(b.r.data || "").localeCompare(String(a.r.data || "")));
}

/** Não conformidade nova, no mesmo formato das outras (campos novos só acrescentam). */
export function ncDaDesforma(it, comum) {
  const desc = (it.elemento ? it.elemento + ": " : "") + (String(it.descricao || "").trim() || "Falha após a desforma (ver foto)");
  return {
    descricao: desc, correcao: String(it.correcao || "").trim() || "Corrigir conforme a foto",
    concluida: false, dataConclusao: "", dataRegistro: comum.hoje, anexos: it.anexos || [],
    prazo: comum.prazo || "", responsavel: comum.responsavel || RESPONSAVEL_PADRAO,
    origem: "desforma", etapa: "Desforma", elemento: it.elemento || "",
    rastreabilidadeId: comum.rastId || "", registradaPor: comum.email || "", registradaEm: comum.agora,
  };
}

// Foto do celular (3–12 MB) → JPEG de até 1600 px (~300 KB): sobe rápido no 4G e não estoura a cota
export async function reduzirFoto(file, max = 1600, qualidade = 0.8) {
  if (!/^image\//.test(file.type || "") || /gif|svg/.test(file.type)) return file;
  try {
    let fonte, w, h;
    if (window.createImageBitmap) {
      fonte = await createImageBitmap(file, { imageOrientation: "from-image" });
      w = fonte.width; h = fonte.height;
    } else {
      const url = URL.createObjectURL(file);
      fonte = await new Promise((ok, erro) => { const im = new Image(); im.onload = () => ok(im); im.onerror = erro; im.src = url; });
      w = fonte.naturalWidth; h = fonte.naturalHeight;
      URL.revokeObjectURL(url);
    }
    const k = Math.min(1, max / Math.max(w, h));
    if (k === 1 && file.size < 900000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(fonte, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", qualidade));
    if (!blob) return file;
    return new File([blob], String(file.name || "foto").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (ex) {
    console.warn("reduzirFoto", ex);
    return file;
  }
}

// compartilhar (WhatsApp etc.): fotos + texto; sem suporte a arquivos, só o texto
async function compartilhar(arquivos, texto, titulo) {
  try { await navigator.clipboard.writeText(texto); } catch (ex) { /* sem permissão: segue */ }
  const dados = { title: titulo, text: texto };
  if (arquivos.length && navigator.canShare && navigator.canShare({ files: arquivos })) dados.files = arquivos;
  if (navigator.share) {
    try { await navigator.share(dados); return dados.files ? "fotos" : "texto"; } catch (ex) { if (ex && ex.name === "AbortError") return "cancelado"; }
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  return "link";
}

/**
 * Abre a tela. alvo: { rastId } | { fvsId } | {} (escolher pavimento e concretagem)
 */
export function abrirDesforma(alvo) {
  alvo = alvo || {};
  if (ctx.somenteLeitura) { alert("Sua conta é só de visualização."); return; }
  let rastId = alvo.rastId || null, fvsId = alvo.fvsId || null;
  if (fvsId && !rastId) { const f = ctx.fvsMap.get(fvsId); rastId = (f && f.rastreabilidadeId) || null; }
  let pavimento = "";
  let itens = []; // { arquivo, previa, descricao, elemento }
  let enviados = null; // { arquivos, texto } depois de gravar
  let responsavel = RESPONSAVEL_PADRAO, prazo = "";
  try { responsavel = localStorage.getItem("traco-desforma-resp") || RESPONSAVEL_PADRAO; } catch (ex) { /* sem armazenamento */ }
  const hoje = ctx.todayISO();

  const ov = document.createElement("div");
  ov.className = "overlay ct-ficha-ov";
  ov.innerHTML = '<div class="modal dsf" role="dialog" aria-modal="true" aria-labelledby="dsf-tit">'
    + '<div class="modal-head"><h2 id="dsf-tit">Pendências da desforma</h2><button class="close-x" data-fechar aria-label="Fechar">✕</button></div>'
    + '<div class="modal-body" data-corpo></div>'
    + '<div class="modal-foot" data-pe></div></div>';
  document.body.appendChild(ov);
  document.body.style.overflow = "hidden";
  const corpo = ov.querySelector("[data-corpo]"), pe = ov.querySelector("[data-pe]");
  const tecla = (e) => { if (e.key === "Escape") fechar(); };
  document.addEventListener("keydown", tecla);
  function fechar() {
    if (itens.length && !enviados && !confirm("As fotos ainda não foram gravadas. Sair mesmo assim?")) return;
    itens.forEach((it) => { if (it.previa) URL.revokeObjectURL(it.previa); });
    ov.remove(); document.removeEventListener("keydown", tecla);
    if (document.getElementById("overlay").hidden) document.body.style.overflow = "";
  }

  const fvsDaRast = () => {
    const r = rastId && ctx.rastMap.get(rastId);
    if (fvsId && ctx.fvsMap.get(fvsId)) return fvsId;
    if (r && r.fvsId && ctx.fvsMap.get(r.fvsId)) return r.fvsId;
    let achou = null;
    ctx.fvsMap.forEach((f, id) => { if (!achou && f.rastreabilidadeId === rastId && (f.tipo || "fvs04") === "fvs04") achou = id; });
    return achou;
  };

  function passoEscolher() {
    const todas = [];
    ctx.rastMap.forEach((r, id) => todas.push({ id, r }));
    const lista = concretagensDoPavimento(todas, pavimento, ctx.pavimentosCompativeis, ctx.pavimentosDaRast).slice(0, 10);
    corpo.innerHTML = '<p class="view-desc">De qual pavimento são as fotos? Escolha a concretagem que foi desformada — as pendências entram na FVS 04 dela.</p>'
      + '<div class="field"><label>Pavimento</label><div data-pav>' + ctx.pavSelectsHtml(pavimento, "", "Selecione o pavimento…") + '</div></div>'
      + (pavimento ? (lista.length ? '<div class="dsf-concs">' + lista.map((x) => {
        const f = x.r.fvsId && ctx.fvsMap.get(x.r.fvsId);
        return '<button type="button" class="dsf-conc" data-rast="' + esc(x.id) + '"><b>' + esc(dataBR(x.r.data)) + '</b><span>' + esc(ctx.pavimentosDaRast(x.r).join(" / ") || x.r.blocoPav || "") + '</span>'
          + '<small>' + (f ? esc((f.codigo || "FVS 04") + " nº " + (f.numero || "s/ nº")) : "sem FVS 04 — será criada") + '</small></button>';
      }).join("") + '</div>' : '<div class="hint">Nenhuma concretagem registrada nesse pavimento.</div>') : '');
    pe.innerHTML = '<div></div><div><button class="btn" data-fechar>Cancelar</button></div>';
    const caixa = corpo.querySelector("[data-pav]");
    caixa.addEventListener("change", () => { pavimento = ctx.lerPavSelects(caixa, ""); passoEscolher(); });
    corpo.querySelectorAll("[data-rast]").forEach((b) => b.addEventListener("click", () => { rastId = b.getAttribute("data-rast"); passoFotos(); }));
  }

  function existentesHtml(fid) {
    const f = fid && ctx.fvsMap.get(fid);
    if (!f) return "";
    const lista = ctx.fichaNaoConformidades(f).map((n, i) => ({ n, i })).filter((x) => x.n.origem === "desforma" || /desforma/i.test(x.n.etapa || ""));
    if (!lista.length) return "";
    const abertas = lista.filter((x) => !x.n.concluida);
    return '<fieldset><legend>Já registradas nesta FVS (' + abertas.length + ' em aberto de ' + lista.length + ')</legend>'
      + '<div class="dsf-exist">' + lista.map((x) => {
        const foto = (x.n.anexos || []).find((a) => /^image\//.test(a.tipo || ""));
        return '<div class="dsf-ex' + (x.n.concluida ? " ok" : "") + '">'
          + (foto ? '<a href="' + esc(foto.url) + '" target="_blank" rel="noopener"><img src="' + esc(foto.url) + '" alt=""></a>' : '<span class="dsf-semfoto">sem foto</span>')
          + '<div><div>' + esc(x.n.descricao) + '</div><small>' + esc(dataBR(x.n.dataRegistro)) + (x.n.prazo ? " · prazo " + esc(dataBR(x.n.prazo)) : "")
          + (x.n.concluida ? " · resolvida " + esc(dataBR(x.n.dataConclusao)) : "") + '</small></div>'
          + (x.n.concluida ? '<span class="pill concluido"><span class="dot"></span>Resolvida</span>' : '<button type="button" class="btn small" data-resolver="' + x.i + '">Resolvida ✓</button>')
          + '</div>';
      }).join("") + '</div>'
      + (abertas.length ? '<button type="button" class="btn ghost" data-reenviar>Enviar de novo as ' + abertas.length + ' em aberto (WhatsApp)…</button>' : '')
      + '</fieldset>';
  }

  function cabecalho() {
    const r = ctx.rastMap.get(rastId);
    const fid = fvsDaRast(), f = fid && ctx.fvsMap.get(fid);
    return { r, fid, f, pav: r ? (ctx.pavimentosDaRast(r).join(" / ") || r.blocoPav || "") : "", fvsTxt: f ? (f.codigo || "FVS 04") + " nº " + (f.numero || "s/ nº") : "" };
  }

  function passoFotos() {
    const h = cabecalho();
    if (!h.r) { passoEscolher(); return; }
    corpo.innerHTML = '<div class="dsf-topo"><div><b>' + esc(h.pav || "Local") + '</b> · concretagem de ' + esc(dataBR(h.r.data))
      + '<small>' + (h.f ? 'Entra na ' + esc(h.fvsTxt) + (h.f.travada ? " (assinada — a pendência entra mesmo assim)" : "") : 'Esta concretagem ainda não tem FVS 04: ela será criada e ligada ao gravar') + '</small></div>'
      + (alvo.rastId || alvo.fvsId ? '' : '<button type="button" class="btn ghost small" data-trocar>Trocar</button>') + '</div>'
      + '<div class="dsf-add"><label class="btn primary dsf-foto-btn">📷 Tirar / escolher fotos<input type="file" accept="image/*" capture="environment" multiple hidden data-fotos></label>'
      + '<label class="btn ghost">🖼 Da galeria<input type="file" accept="image/*" multiple hidden data-fotos></label>'
      + '<button type="button" class="btn ghost" data-sem-foto>+ Pendência sem foto</button></div>'
      + '<div class="dsf-itens">' + itens.map((it, k) => '<div class="dsf-item" data-k="' + k + '">'
        + (it.previa ? '<img src="' + it.previa + '" alt="Foto ' + (k + 1) + '">' : '<span class="dsf-semfoto">sem foto</span>')
        + '<div class="dsf-campos"><select data-campo="elemento" aria-label="Elemento"><option value="">Elemento…</option>'
          + ELEMENTOS_DESFORMA.map((e) => '<option' + (it.elemento === e ? " selected" : "") + '>' + e + '</option>').join("") + '</select>'
        + '<textarea data-campo="descricao" rows="2" placeholder="O que corrigir? ex.: bicheira no pilar P12, rebarba na viga V5">' + esc(it.descricao) + '</textarea></div>'
        + '<button type="button" class="close-x" data-tirar="' + k + '" aria-label="Tirar esta pendência">✕</button></div>').join("") + '</div>'
      + (itens.length ? '' : '<div class="hint">Tire as fotos do que precisa ser corrigido. Cada foto vira uma pendência na FVS — escreva uma linha do que fazer.</div>')
      + '<div class="grid2" style="margin-top:12px;"><div class="field"><label>Responsável (empresa de forma)</label><input type="text" data-comum="responsavel" value="' + esc(responsavel) + '"></div>'
      + '<div class="field"><label>Prazo para corrigir</label><input type="date" data-comum="prazo" value="' + esc(prazo) + '"></div></div>'
      + '<div class="dsf-msg hint" data-msg></div>'
      + existentesHtml(h.fid);
    pe.innerHTML = '<div></div><div style="display:flex;gap:10px;"><button class="btn" data-fechar>Fechar</button>'
      + '<button class="btn primary" data-gravar' + (itens.length ? "" : " disabled") + '>Gravar ' + itens.length + ' pendência(s) na FVS</button></div>';
    const tr = corpo.querySelector("[data-trocar]");
    if (tr) tr.addEventListener("click", () => { if (itens.length && !confirm("Trocar a concretagem? As fotos continuam.")) return; rastId = null; fvsId = null; passoEscolher(); });
    corpo.querySelectorAll("[data-fotos]").forEach((inp) => inp.addEventListener("change", () => {
      Array.from(inp.files || []).forEach((f) => itens.push({ arquivo: f, previa: URL.createObjectURL(f), descricao: "", elemento: "" }));
      inp.value = ""; passoFotos();
    }));
    corpo.querySelector("[data-sem-foto]").addEventListener("click", () => { itens.push({ arquivo: null, previa: "", descricao: "", elemento: "" }); passoFotos(); });
    corpo.querySelectorAll(".dsf-item").forEach((box) => {
      const it = itens[+box.getAttribute("data-k")];
      box.querySelectorAll("[data-campo]").forEach((el) => el.addEventListener("input", () => { it[el.getAttribute("data-campo")] = el.value; }));
      box.querySelector("[data-campo=elemento]").addEventListener("change", (e) => { it.elemento = e.target.value; });
    });
    corpo.querySelectorAll("[data-tirar]").forEach((b) => b.addEventListener("click", () => {
      const it = itens.splice(+b.getAttribute("data-tirar"), 1)[0];
      if (it && it.previa) URL.revokeObjectURL(it.previa);
      passoFotos();
    }));
    corpo.querySelectorAll("[data-comum]").forEach((el) => el.addEventListener("input", () => {
      if (el.getAttribute("data-comum") === "responsavel") responsavel = el.value; else prazo = el.value;
    }));
    corpo.querySelectorAll("[data-resolver]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      await ctx.ncGravarNaFicha(h.fid, (lista) => {
        const n = lista[+b.getAttribute("data-resolver")];
        if (!n) return false;
        n.concluida = true; n.dataConclusao = hoje;
      });
      ctx.aposAlterarFvs(h.fid);
      passoFotos();
    }));
    const re = corpo.querySelector("[data-reenviar]");
    if (re) re.addEventListener("click", () => prepararReenvio(h));
  }

  async function prepararReenvio(h) {
    const msg = corpo.querySelector("[data-msg]");
    const abertas = ctx.fichaNaoConformidades(h.f).filter((n) => !n.concluida && (n.origem === "desforma" || /desforma/i.test(n.etapa || "")));
    msg.textContent = "Preparando as fotos…";
    const arquivos = [];
    for (let i = 0; i < abertas.length; i++) {
      const foto = (abertas[i].anexos || []).find((a) => /^image\//.test(a.tipo || ""));
      if (!foto) continue;
      try { const b = await (await fetch(foto.url)).blob(); arquivos.push(new File([b], "pendencia_" + (i + 1) + ".jpg", { type: b.type || "image/jpeg" })); } catch (ex) { console.warn(ex); }
    }
    const texto = mensagemDesforma({ pavimento: h.pav, dataConcretagem: h.r.data, fvs: h.fvsTxt, prazo: abertas.reduce((m, n) => m || n.prazo, ""),
      responsavel: (abertas[0] && abertas[0].responsavel) || responsavel,
      itens: abertas.map((n) => ({ descricao: n.descricao, temFoto: (n.anexos || []).some((a) => /^image\//.test(a.tipo || "")) })) });
    msg.innerHTML = arquivos.length + " foto(s) prontas. ";
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary"; b.textContent = "Enviar no WhatsApp";
    b.addEventListener("click", async () => { const r = await compartilhar(arquivos, texto, "Pendências da desforma"); avisoEnvio(msg, r); });
    msg.appendChild(b);
  }

  function avisoEnvio(msg, r) {
    const t = { fotos: "Enviado. Se o texto não apareceu junto das fotos no WhatsApp, cole (o texto já está copiado).",
      texto: "Este aparelho não manda fotos pelo compartilhar: foi só o texto (também copiado). Anexe as fotos no WhatsApp.",
      link: "Abri o WhatsApp com o texto (também copiado). Anexe as fotos por lá.", cancelado: "Envio cancelado." }[r] || "";
    const p = document.createElement("div"); p.className = "hint"; p.textContent = t;
    msg.appendChild(p);
  }

  async function gravar(botao) {
    const h = cabecalho(), msg = corpo.querySelector("[data-msg]");
    botao.disabled = true;
    try { localStorage.setItem("traco-desforma-resp", responsavel || RESPONSAVEL_PADRAO); } catch (ex) { /* sem armazenamento */ }
    const arquivos = [];
    // 1) fotos: reduz e envia (cada uma vira o anexo da sua pendência)
    for (let k = 0; k < itens.length; k++) {
      const it = itens[k];
      it.anexos = it.anexos || [];
      if (!it.arquivo || it.anexos.length) { if (it.arquivoReduzido) arquivos.push(it.arquivoReduzido); continue; }
      msg.textContent = "Enviando foto " + (k + 1) + " de " + itens.length + "…";
      try {
        const red = await reduzirFoto(it.arquivo);
        it.arquivoReduzido = new File([red], "pendencia_" + (k + 1) + ".jpg", { type: red.type || "image/jpeg" });
        it.anexos = [await ctx.ncUploadAnexo(it.arquivoReduzido)];
        arquivos.push(it.arquivoReduzido);
      } catch (ex) {
        console.error(ex);
        msg.textContent = "Não consegui enviar a foto " + (k + 1) + " (" + (ex && ex.message ? ex.message : "sem internet?") + "). Nada foi gravado ainda — tente de novo.";
        botao.disabled = false;
        return;
      }
    }
    // 2) grava as pendências na FVS 04 (cria a FVS se a concretagem não tiver)
    msg.textContent = "Gravando na FVS…";
    const comum = { hoje, prazo, responsavel, rastId, email: ctx.currentUserEmail || "", agora: ctx.nowISO() };
    const novas = itens.map((it) => ncDaDesforma(it, comum));
    let fid = h.fid, fvsTxt = h.fvsTxt;
    try {
      if (fid) {
        await ctx.ncGravarNaFicha(fid, (lista) => { novas.forEach((n) => lista.push(n)); });
      } else {
        const criada = await ctx.criarFvs04DaRast(rastId, novas);
        fid = criada.id; fvsTxt = criada.rotulo;
      }
      fvsId = fid;
      ctx.aposAlterarFvs(fid);
    } catch (ex) {
      console.error(ex);
      msg.textContent = "Não foi possível gravar: " + (ex && ex.message ? ex.message : "erro desconhecido");
      botao.disabled = false;
      return;
    }
    const texto = mensagemDesforma({ pavimento: h.pav, dataConcretagem: h.r.data, fvs: fvsTxt, prazo, responsavel,
      itens: itens.map((it) => ({ descricao: it.descricao, elemento: it.elemento, temFoto: !!it.arquivo })) });
    enviados = { arquivos, texto };
    itens.forEach((it) => { if (it.previa) URL.revokeObjectURL(it.previa); });
    const n = itens.length;
    itens = [];
    passoEnviar(n, fvsTxt);
  }

  function passoEnviar(n, fvsTxt) {
    corpo.innerHTML = '<div class="dsf-ok"><b>' + n + ' pendência(s) gravada(s) na ' + esc(fvsTxt || "FVS 04") + '.</b>'
      + '<p>Agora mande para a empresa de forma: o botão abre o compartilhar do celular — escolha o WhatsApp e o grupo. As fotos e a lista vão juntas.</p>'
      + '<pre class="dsf-texto">' + esc(enviados.texto) + '</pre>'
      + '<div class="dsf-msg" data-msg></div></div>';
    pe.innerHTML = '<div><button class="btn ghost" data-mais>Registrar mais</button></div><div style="display:flex;gap:10px;"><button class="btn" data-fechar>Fechar</button>'
      + '<button class="btn primary" data-enviar>Enviar no WhatsApp' + (enviados.arquivos.length ? ' (' + enviados.arquivos.length + ' foto' + (enviados.arquivos.length === 1 ? "" : "s") + ')' : '') + '</button></div>';
  }

  ov.addEventListener("click", async (e) => {
    if (e.target === ov || e.target.closest("[data-fechar]")) { fechar(); return; }
    const g = e.target.closest("[data-gravar]");
    if (g && !g.disabled) { await gravar(g); return; }
    if (e.target.closest("[data-enviar]") && enviados) {
      const r = await compartilhar(enviados.arquivos, enviados.texto, "Pendências da desforma");
      avisoEnvio(corpo.querySelector("[data-msg]"), r);
      return;
    }
    if (e.target.closest("[data-mais]")) { enviados = null; passoFotos(); }
  });

  if (rastId && ctx.rastMap.get(rastId)) passoFotos(); else passoEscolher();
}
