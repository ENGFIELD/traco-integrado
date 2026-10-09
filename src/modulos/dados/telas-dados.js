/* Telas "Histórico de alterações" e "Lixeira" (v1.30 — fase B do plano).
 *
 * Histórico: lê os documentos do dia em auditoria/AAAA-MM-DD (um por dia, com a
 * lista de alterações) — abrir a tela lê no máximo um documento por dia do
 * período escolhido. Dá para ver tudo, filtrar por pessoa/área ou ver só o
 * histórico de uma ficha.
 * Lixeira: o que foi excluído (excluido:true) continua no banco; aqui aparece
 * com quem excluiu e quando, e pode ser restaurado.
 */
import { escapeHtml, fmtDateBR, rastRotulo } from "../comum/formatos.js";
import { diaAuditoria } from "./porteiro.js";

let ctx = null;
/** ctx: { db, todos: {fvs,rastreabilidade,plantas,entregasAco}, ctMap, tarefasMap,
 *         somenteLeitura, email, agora, abrir(col,id), switchView } */
export function iniciarTelasDados(c) { ctx = c; }

const AREAS = { fvs: "FVS", rastreabilidade: "Rastreabilidade", controleTecnologico: "Controle tecnológico", entregasAco: "Aço", tarefas: "Tarefas", plantas: "Plantas", cronogramas: "Cronograma", assinaturas: "Assinaturas" };
const ACOES = { criou: "criou", alterou: "alterou", excluiu: "excluiu", restaurou: "restaurou", apagou: "apagou" };
const CAMPOS = { fechado: "situação (aberta/fechada)", assinaturas: "assinaturas", naoConformidades: "não conformidades", linhas: "betonadas", checklist: "checklist", elementos: "elementos", travada: "trava da assinatura", revisao: "revisão", numero: "número", inspecionadoPor: "inspeção", mapeamento: "mapeamento", mapeamentosExtras: "plantas do mapeamento", status: "situação", concluida: "concluída", engenheiro: "engenheiro", local: "local", volume: "volume", slump: "slump", obs: "observação", observacoes: "observações", pecas: "peças" };

export function nomePessoa(email) {
  const u = String(email || "").split("@")[0];
  return u ? u.split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") : "alguém";
}
function hora(iso) { const d = new Date(iso); return isNaN(d) ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function emBR(iso) { const d = new Date(iso); return isNaN(d) ? "" : fmtDateBR(diaAuditoria(d)) + " às " + hora(iso); }

/** nome legível de um registro */
export function rotulo(col, id) {
  const t = ctx.todos || {};
  if (col === "fvs") { const f = t.fvs && t.fvs.get(id); return f ? (f.codigo || "FVS") + " · " + (f.numero || "s/ nº") + ((f.pavimentos || [])[0] ? " · " + f.pavimentos[0] : "") : "FVS (" + id + ")"; }
  if (col === "rastreabilidade") { const r = t.rastreabilidade && t.rastreabilidade.get(id); return r ? "Rastreabilidade " + rastRotulo(r) : "Rastreabilidade (" + id + ")"; }
  if (col === "controleTecnologico") { const n = ctx.ctMap && ctx.ctMap.get(id); return "CT · NF " + ((n && n.notaRemessa) || id.replace(/^nf_/, "")); }
  if (col === "entregasAco") { const e = t.entregasAco && t.entregasAco.get(id); return "Aço · " + ((e && (e.pedido || e.destino)) || id); }
  if (col === "plantas") { const p = t.plantas && t.plantas.get(id); return "Planta · " + ((p && p.nome) || id); }
  if (col === "tarefas") { const x = ctx.tarefasMap && ctx.tarefasMap.get(id); return "Tarefa · " + ((x && x.titulo) || id); }
  if (col === "cronogramas") return "Cronograma (" + id + ")";
  if (col === "assinaturas") return "Assinatura cadastrada";
  return col + " (" + id + ")";
}

// ---------------- Histórico ----------------
const cacheDias = new Map(); // dia → entradas (o de hoje é sempre relido)
const filtro = { dias: 7, pessoa: "", area: "", busca: "", col: "", id: "" };

async function lerDias(n) {
  const hoje = new Date(), dias = [];
  for (let i = 0; i < n; i++) { const d = new Date(hoje); d.setDate(hoje.getDate() - i); dias.push(diaAuditoria(d)); }
  const hojeId = dias[0];
  await Promise.all(dias.map(async (dia) => {
    if (dia !== hojeId && cacheDias.has(dia)) return;
    try {
      const s = await ctx.db().collection("auditoria").doc(dia).get();
      cacheDias.set(dia, s.exists ? (s.data().entradas || []) : []);
    } catch (e) { console.warn("histórico", dia, e && e.code); if (!cacheDias.has(dia)) cacheDias.set(dia, null); }
  }));
  return dias.map((dia) => ({ dia, entradas: cacheDias.get(dia) }));
}

/** abre o histórico já filtrado num registro (botão "Ver histórico" das fichas) */
export function verHistoricoDe(col, id) {
  Object.assign(filtro, { col, id, dias: 30, pessoa: "", area: "", busca: "" });
  ctx.switchView("historico");
}

export async function renderViewHistorico() {
  const c = document.getElementById("view-historico");
  if (!c) return;
  c.innerHTML = '<div class="pav-header"><h2>Histórico de alterações</h2></div><p class="view-desc">Carregando…</p>';
  const dias = await lerDias(filtro.dias);
  const todas = [];
  dias.forEach((d) => (d.entradas || []).forEach((e) => todas.push(e)));
  todas.sort((a, b) => String(b.em).localeCompare(String(a.em)));
  const pessoas = [...new Set(todas.map((e) => e.por).filter(Boolean))].sort();
  const busca = filtro.busca.trim().toLowerCase();
  const lista = todas.filter((e) => (!filtro.pessoa || e.por === filtro.pessoa) && (!filtro.area || e.col === filtro.area)
    && (!filtro.id || (e.col === filtro.col && e.id === filtro.id))
    && (!busca || (rotulo(e.col, e.id) + " " + nomePessoa(e.por) + " " + (e.campos || []).join(" ")).toLowerCase().includes(busca)));
  const falhou = dias.some((d) => d.entradas === null);
  const opt = (v, t, sel) => '<option value="' + escapeHtml(v) + '"' + (v === sel ? " selected" : "") + ">" + escapeHtml(t) + "</option>";
  let html = '<div class="pav-header"><h2>Histórico de alterações</h2><span class="pav-total">' + lista.length + " alteraç" + (lista.length === 1 ? "ão" : "ões") + "</span></div>"
    + '<p class="view-desc">Quem alterou o quê e quando, em todas as áreas. Nada é apagado: excluir manda para a <button type="button" class="linkish" data-ir-lixeira>lixeira</button>.</p>'
    + (filtro.id ? '<div class="banner">Mostrando só: <b>' + escapeHtml(rotulo(filtro.col, filtro.id)) + '</b> <button type="button" class="btn small" data-hist-todos>Ver tudo</button></div>' : "")
    + '<div class="eng-filtros hist-filtros">'
    + '<select data-hist="dias">' + opt("1", "Hoje", String(filtro.dias)) + opt("7", "Últimos 7 dias", String(filtro.dias)) + opt("30", "Últimos 30 dias", String(filtro.dias)) + opt("90", "Últimos 90 dias", String(filtro.dias)) + "</select>"
    + '<select data-hist="pessoa">' + opt("", "Todas as pessoas", filtro.pessoa) + pessoas.map((p) => opt(p, nomePessoa(p), filtro.pessoa)).join("") + "</select>"
    + '<select data-hist="area">' + opt("", "Todas as áreas", filtro.area) + Object.keys(AREAS).map((k) => opt(k, AREAS[k], filtro.area)).join("") + "</select>"
    + '<input type="search" data-hist="busca" placeholder="Buscar ficha, pessoa, campo…" value="' + escapeHtml(filtro.busca) + '">'
    + "</div>"
    + (falhou ? '<div class="banner">Parte do histórico não pôde ser lida agora (sem sinal?). Tente de novo mais tarde.</div>' : "");
  if (!lista.length) html += '<div class="dash-card"><div class="dash-vazio" style="padding:16px">Nenhuma alteração registrada neste período.</div></div>';
  else {
    let diaAtual = "";
    html += '<div class="dash-card hist-lista">';
    lista.slice(0, 500).forEach((e) => {
      const dia = diaAuditoria(new Date(e.em));
      if (dia !== diaAtual) { diaAtual = dia; html += '<div class="hist-dia">' + escapeHtml(fmtDateBR(dia)) + "</div>"; }
      const campos = (e.campos || []).map((k) => CAMPOS[k] || k);
      const abre = e.acao !== "apagou" && ["fvs", "rastreabilidade", "controleTecnologico"].includes(e.col);
      html += '<div class="hist-item"><span class="hist-hora">' + escapeHtml(hora(e.em)) + "</span>"
        + '<span class="hist-tx"><span class="hist-frase"><b>' + escapeHtml(nomePessoa(e.por)) + "</b> " + escapeHtml(ACOES[e.acao] || e.acao) + " "
        + (abre ? '<button type="button" class="linkish" data-hist-abrir="' + escapeHtml(e.col + "|" + e.id) + '">' + escapeHtml(rotulo(e.col, e.id)) + "</button>" : "<b>" + escapeHtml(rotulo(e.col, e.id)) + "</b>")
        + "</span>"
        + (campos.length && e.acao === "alterou" ? '<small>' + escapeHtml(campos.join(", ")) + "</small>" : "")
        + '</span><span class="hist-area">' + escapeHtml(AREAS[e.col] || e.col) + "</span></div>";
    });
    if (lista.length > 500) html += '<div class="dash-vazio" style="padding:12px 16px">Mostrando as 500 mais recentes — use os filtros para achar as outras.</div>';
    html += "</div>";
  }
  c.innerHTML = html;
  c.querySelectorAll("[data-hist]").forEach((el) => {
    const k = el.getAttribute("data-hist");
    el.addEventListener(k === "busca" ? "input" : "change", () => {
      filtro[k] = k === "dias" ? Number(el.value) : el.value;
      if (k === "busca") { clearTimeout(el._t); el._t = setTimeout(() => renderViewHistorico().then(() => { const b = c.querySelector('[data-hist="busca"]'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }), 300); }
      else renderViewHistorico();
    });
  });
  const todos = c.querySelector("[data-hist-todos]");
  if (todos) todos.addEventListener("click", () => { filtro.col = ""; filtro.id = ""; renderViewHistorico(); });
  const lix = c.querySelector("[data-ir-lixeira]");
  if (lix) lix.addEventListener("click", () => ctx.switchView("lixeira"));
  c.querySelectorAll("[data-hist-abrir]").forEach((b) => b.addEventListener("click", () => {
    const [col, id] = b.getAttribute("data-hist-abrir").split("|"); ctx.abrir(col, id);
  }));
}

// ---------------- Lixeira ----------------
export function itensNaLixeira() {
  const out = [];
  const t = ctx.todos || {};
  ["fvs", "rastreabilidade", "plantas", "entregasAco"].forEach((col) => {
    (t[col] || new Map()).forEach((x, id) => { if (x && x.excluido === true) out.push({ col, id, x }); });
  });
  return out.sort((a, b) => String(b.x.excluidoEm || "").localeCompare(String(a.x.excluidoEm || "")));
}

export function renderViewLixeira() {
  const c = document.getElementById("view-lixeira");
  if (!c) return;
  const itens = itensNaLixeira();
  let html = '<div class="pav-header"><h2>Lixeira</h2><span class="pav-total">' + itens.length + " ite" + (itens.length === 1 ? "m" : "ns") + "</span></div>"
    + '<p class="view-desc">O que foi excluído sai das telas, mas continua guardado no banco. Daqui dá para ver quem excluiu e restaurar.</p>';
  if (!itens.length) html += '<div class="dash-card"><div class="dash-vazio" style="padding:16px">A lixeira está vazia.</div></div>';
  else {
    html += '<div class="dash-card hist-lista">';
    itens.forEach((i) => {
      html += '<div class="hist-item"><span class="hist-tx"><b>' + escapeHtml(rotulo(i.col, i.id)) + "</b>"
        + "<small>excluído por " + escapeHtml(nomePessoa(i.x.excluidoPor)) + (i.x.excluidoEm ? " em " + escapeHtml(emBR(i.x.excluidoEm)) : "") + "</small></span>"
        + (ctx.somenteLeitura() ? "" : '<button type="button" class="btn small" data-restaurar="' + escapeHtml(i.col + "|" + i.id) + '">Restaurar</button>')
        + "</div>";
    });
    html += "</div>";
  }
  c.innerHTML = html;
  c.querySelectorAll("[data-restaurar]").forEach((b) => b.addEventListener("click", () => {
    const [col, id] = b.getAttribute("data-restaurar").split("|");
    b.disabled = true; b.textContent = "Restaurando…";
    // a tela atualiza na hora (o banco confirma depois — sem sinal, fica na fila de envio)
    ctx.db().collection(col).doc(id).set({ excluido: false, restauradoEm: ctx.agora(), restauradoPor: ctx.email() }, { merge: true })
      .catch((e) => { console.error(e); alert("Não foi possível restaurar: " + ((e && e.message) || "erro")); renderViewLixeira(); });
    setTimeout(renderViewLixeira, 100);
  }));
}
