/* Aba Cronograma (v1.5): importação do MS Project (Excel), caminho crítico,
 * semana atual/próximas, atrasadas e árvore com barras.
 *
 * Firestore: cronogramas/atual  → { arquivo, importadoEm, importadoPor, linhas:[{a,b,c,d,e,f}] }
 *            cronogramas/v_<data> → cópia de cada versão enviada (histórico)
 * As linhas são guardadas como vieram da planilha; o cálculo (hierarquia,
 * folgas, caminho crítico) é refeito no navegador a cada carregamento.
 */
import { lerCronograma, calcularFolgas, atividadesNoPeriodo, pctPrevisto, idxUtil, isoDeUtil } from "./cpm.js";
import { pintarIcones } from "../../ui/icones.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLS = ["a", "b", "c", "d", "e", "f"];

let ctx = null;            // { col, todayISO, nowISO, usuario, fmtDateBR, garantirLibs, erroAcesso }
let doc = null;            // cronogramas/atual
let cr = null;             // cronograma calculado
let aba = "semana";
let busca = "";
let abertos = new Set();   // ids de resumos expandidos na árvore

export function initCronograma(contexto) { ctx = contexto; }
export function definirDocumento(d) {
  doc = d || null;
  cr = null;
  if (doc && Array.isArray(doc.linhas)) {
    const linhas = doc.linhas.map((o) => COLS.map((k) => o[k]));
    cr = lerCronograma(linhas);
    calcularFolgas(cr);
  }
}
export function cronogramaCarregado() { return cr; }

// ---------- semanas (segunda a domingo) ----------
export function semanaDe(iso, desloc) {
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + 7 * (desloc || 0));
  const ini = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 6);
  return { ini, fim: d.toISOString().slice(0, 10) };
}
// Situação de uma tarefa hoje
export function statusTarefa(t, hoje) {
  if (t.pct >= 100) return "concluida";
  const prev = pctPrevisto(t, hoje);
  if (t.fim && t.fim < hoje) return "atrasada";
  if (prev - t.pct >= 25) return "atrasada";
  if (t.ini && t.ini > hoje) return "futura";
  return "andamento";
}
export function critica(t) { return !t.resumo && t.pct < 100 && t.folga != null && t.folga <= 0; }

// Metas da semana para o Início: o que precisa andar/terminar nesta semana
export function metasDaSemana(hoje, max) {
  if (!cr) return null;
  const s = semanaDe(hoje, 0);
  const lista = atividadesNoPeriodo(cr, s.ini, s.fim).filter((t) => t.pct < 100)
    .map((t) => ({ t, crit: critica(t), terminaNaSemana: t.fim <= s.fim, prev: pctPrevisto(t, s.fim) }))
    .sort((a, b) => (b.crit - a.crit) || (b.terminaNaSemana - a.terminaNaSemana) || a.t.fim.localeCompare(b.t.fim));
  const atrasadas = cr.tarefas.filter((t) => !t.resumo && t.ini && statusTarefa(t, hoje) === "atrasada");
  return { semana: s, itens: lista.slice(0, max || 8), total: lista.length, criticas: lista.filter((x) => x.crit).length, atrasadas: atrasadas.length };
}

// Estrutura pelo cronograma: "Teto do X" → nível (00–27) do piso de cima
export function nivelDoTeto(nome) {
  const n = String(nome).toLowerCase();
  if (!/^\s*teto/.test(n)) return null;
  if (/subsolo/.test(n)) return 2;
  let m = n.match(/(\d+)\s*[ºo°⁰]?\s*embasamento/); if (m) return 2 + Number(m[1]);
  m = n.match(/(\d+)\s*[ºo°⁰]?\s*pavimento/); if (m) return 7 + Number(m[1]);
  if (/cobertura/.test(n)) return 25;
  if (/depend/.test(n)) return 26;
  if (/m[áa]quinas|reservat/.test(n)) return 27;
  return null;
}
/** nível do piso que DEVERIA estar concretado hoje segundo o cronograma */
export function estruturaPrevista(hoje) {
  if (!cr) return null;
  let previsto = null, real = null;
  cr.tarefas.forEach((t) => {
    if (!t.caminho.length || !/ESTRUTURA/i.test(t.caminho[0])) return;
    const nv = nivelDoTeto(t.nome); if (nv == null) return;
    if (t.fim && t.fim <= hoje) previsto = Math.max(previsto == null ? -1 : previsto, nv);
    if (t.pct >= 100) real = Math.max(real == null ? -1 : real, nv);
  });
  return { previsto, realCronograma: real };
}

// ---------- tela ----------
export function renderViewCronograma(container) {
  const hoje = ctx.todayISO();
  let corpo;
  if (ctx.erroAcesso()) corpo = `<div class="banner">Esta área ainda não foi liberada no banco de dados (regras de segurança). Ela passa a funcionar quando a versão for publicada.</div>`;
  if (!cr) {
    container.innerHTML = cabecalho() + (corpo || "") + `<div class="empty-state"><div class="big">Nenhum cronograma enviado</div>
      <p>Envie a exportação do MS Project em Excel (colunas: Atividade, % concluída, Predecessoras, Início, Duração, Término).</p></div>`;
    ligarCabecalho(container); return;
  }
  const geral = cr.tarefas.find((t) => t.nivel === 0) || cr.tarefas[0];
  const fim = cr.tarefas.reduce((m, t) => (t.fim > m ? t.fim : m), "");
  const s0 = semanaDe(hoje, 0), s4 = semanaDe(hoje, 3);
  const semana = atividadesNoPeriodo(cr, s0.ini, s0.fim).filter((t) => t.pct < 100);
  const proximas = atividadesNoPeriodo(cr, semanaDe(hoje, 1).ini, s4.fim).filter((t) => t.pct < 100);
  const atrasadas = cr.tarefas.filter((t) => !t.resumo && t.ini && statusTarefa(t, hoje) === "atrasada");
  const criticas = cr.tarefas.filter(critica);
  // Avanço ponderado pela duração (mesmo critério do MS Project): real × previsto para hoje
  const folhas = cr.tarefas.filter((t) => !t.resumo && t.ini && t.fim && t.dur > 0);
  const somaD = folhas.reduce((a, t) => a + t.dur, 0) || 1;
  const realPond = Math.round(folhas.reduce((a, t) => a + t.dur * t.pct, 0) / somaD);
  const prevPond = Math.round(folhas.reduce((a, t) => a + t.dur * pctPrevisto(t, hoje), 0) / somaD);
  const kpis = `<div class="dash-kpis">
    <div class="dash-kpi-card tone-info"><div class="n">${realPond}<small style="font-size:15px">%</small></div><div class="l">Obra concluída</div><div class="d">previsto para hoje: ${prevPond}% · MS Project: ${geral.pct}%</div></div>
    <button type="button" class="dash-kpi-card tone-pendente" data-cr-aba="semana"><div class="n">${semana.length}</div><div class="l">Atividades nesta semana</div><div class="d">${semana.filter(critica).length} no caminho crítico</div></button>
    <button type="button" class="dash-kpi-card tone-nc" data-cr-aba="atrasadas"><div class="n">${atrasadas.length}</div><div class="l">Atividades atrasadas</div><div class="d">término vencido ou ≥25% abaixo do previsto</div></button>
    <button type="button" class="dash-kpi-card tone-ok" data-cr-aba="critico"><div class="n">${ctx.fmtDateBR(fim)}</div><div class="l">Término previsto</div><div class="d">${criticas.length} atividades críticas pendentes</div></button></div>`;
  const abas = [["semana", `Esta semana (${semana.length})`], ["proximas", `Próximas 3 semanas (${proximas.length})`], ["critico", `Caminho crítico (${criticas.length})`], ["atrasadas", `Atrasadas (${atrasadas.length})`], ["tudo", "Cronograma completo"]];
  let lista;
  if (aba === "semana") lista = linhas(semana, hoje, `Semana de ${ctx.fmtDateBR(s0.ini)} a ${ctx.fmtDateBR(s0.fim)}`);
  else if (aba === "proximas") lista = porSemana(proximas, hoje);
  else if (aba === "critico") lista = linhas(criticas.sort((a, b) => a.ini.localeCompare(b.ini)), hoje, "Sequência de atividades sem folga até o Habite-se — qualquer atraso aqui atrasa a obra");
  else if (aba === "atrasadas") lista = linhas(atrasadas.sort((a, b) => a.fim.localeCompare(b.fim)), hoje, "Atividades com término vencido ou bem abaixo do % previsto para hoje");
  else lista = arvore(hoje);
  container.innerHTML = cabecalho() + (corpo || "") + kpis
    + `<div class="ct-filtros"><div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" data-cr-busca placeholder="Filtrar atividade, pavimento, serviço…" value="${esc(busca)}"></div></div>
       <div class="chips" role="group">${abas.map(([k, l]) => `<button type="button" class="chip" data-cr-aba="${k}" aria-pressed="${aba === k}">${l}</button>`).join("")}</div>
       <div class="cr-lista">${lista}</div>`;
  ligarCabecalho(container);
  container.querySelectorAll("[data-cr-aba]").forEach((b) => b.addEventListener("click", () => { aba = b.dataset.crAba; renderViewCronograma(container); }));
  const bi = container.querySelector("[data-cr-busca]");
  bi.addEventListener("input", () => { busca = bi.value; const p = bi.selectionStart; renderViewCronograma(container); const n = container.querySelector("[data-cr-busca]"); n.focus(); n.setSelectionRange(p, p); });
  container.querySelectorAll("[data-cr-abrir]").forEach((el) => el.addEventListener("click", () => {
    const id = +el.dataset.crAbrir; abertos.has(id) ? abertos.delete(id) : abertos.add(id); renderViewCronograma(container);
  }));
}

function cabecalho() {
  const info = doc ? `Versão de ${esc(doc.arquivo || "")} · enviada ${esc(String(doc.importadoEm || "").slice(0, 10).split("-").reverse().join("/"))} por ${esc(doc.importadoPor || "")}` : "Nenhum cronograma enviado ainda.";
  return `<div class="pav-header"><h2>Cronograma</h2></div>
    <p class="view-desc">Cronograma da obra (MS Project). O caminho crítico é recalculado a cada versão enviada; as metas da semana aparecem no Início.</p>
    <div class="ct-acoes"><button class="btn primary" type="button" data-cr-enviar><svg class="ti-i" data-i="file"></svg>${doc ? "Enviar cronograma atualizado…" : "Enviar cronograma…"}</button>
      <input type="file" data-cr-arquivo accept=".xlsx,.xls" hidden>
      <div class="ct-acoes-info"><span>${info}</span><div class="ct-import-msg" data-cr-msg></div></div></div>`;
}
function ligarCabecalho(container) {
  pintarIcones(container);
  const arq = container.querySelector("[data-cr-arquivo]");
  container.querySelector("[data-cr-enviar]").addEventListener("click", () => arq.click());
  arq.addEventListener("change", () => { const f = arq.files && arq.files[0]; arq.value = ""; if (f) importar(f, container); });
}

function filtrar(ts) {
  const t = busca.trim().toLowerCase();
  return t ? ts.filter((x) => (x.nome + " " + x.caminho.join(" ")).toLowerCase().includes(t)) : ts;
}
function barraHtml(t, hoje) {
  const prev = pctPrevisto(t, hoje);
  return `<div class="cr-barra" title="real ${t.pct}% · previsto hoje ${prev}%"><i class="real" style="width:${t.pct}%"></i><i class="prev" style="left:${prev}%"></i></div>`;
}
function linha(t, hoje) {
  const st = statusTarefa(t, hoje);
  const rot = { concluida: "Concluída", atrasada: "Atrasada", futura: "A iniciar", andamento: "Em andamento" }[st];
  const tom = { concluida: "concluido", atrasada: "has-nc", futura: "vinculo", andamento: "pendente" }[st];
  return `<div class="cr-item ${critica(t) ? "critica" : ""}">
    <div class="cr-nome"><small>${esc(t.caminho.join(" › "))}</small><b>${esc(t.nome)}</b></div>
    <div class="cr-datas">${ctx.fmtDateBR(t.ini).slice(0, 5)} → ${ctx.fmtDateBR(t.fim).slice(0, 5)}<small>${t.dur ? String(t.dur).replace(".", ",") + " d" : ""}</small></div>
    <div class="cr-prog">${barraHtml(t, hoje)}<small>${t.pct}% · prev. ${pctPrevisto(t, hoje)}%</small></div>
    <div class="cr-tags">${critica(t) ? `<span class="pill has-nc"><span class="dot"></span>Crítica</span>` : (t.folga != null && t.pct < 100 ? `<span class="cr-folga">folga ${t.folga} d</span>` : "")}<span class="pill ${tom}"><span class="dot"></span>${rot}</span></div>
  </div>`;
}
function linhas(ts, hoje, titulo) {
  const f = filtrar(ts);
  return `<div class="cr-sub">${esc(titulo)} — ${f.length} atividade(s)</div>` + (f.length ? f.slice(0, 300).map((t) => linha(t, hoje)).join("") : `<div class="dash-vazio">Nenhuma atividade.</div>`);
}
function porSemana(ts, hoje) {
  let html = "";
  for (let k = 1; k <= 3; k++) {
    const s = semanaDe(hoje, k);
    const daSemana = ts.filter((t) => t.ini <= s.fim && t.fim >= s.ini);
    html += linhas(daSemana, hoje, `Semana de ${ctx.fmtDateBR(s.ini)} a ${ctx.fmtDateBR(s.fim)}`);
  }
  return html;
}
function arvore(hoje) {
  const t0 = busca.trim().toLowerCase();
  const visiveis = cr.tarefas.filter((t) => {
    if (t0) return !t.resumo && (t.nome + " " + t.caminho.join(" ")).toLowerCase().includes(t0);
    if (t.nivel <= 1) return true;
    let p = t.pai; // visível se todos os ancestrais (a partir do nível 1) estão abertos
    while (p != null) { const pt = cr.porId.get(p); if (pt.nivel >= 1 && !abertos.has(p)) return false; p = pt.pai; }
    return true;
  });
  const ini = cr.tarefas.reduce((m, t) => (t.ini && (!m || t.ini < m) ? t.ini : m), "");
  const fim = cr.tarefas.reduce((m, t) => (t.fim > m ? t.fim : m), "");
  const a = idxUtil(ini), b = idxUtil(fim), h = idxUtil(hoje);
  const pos = (iso) => ((idxUtil(iso) - a) / Math.max(1, b - a) * 100);
  return `<div class="cr-sub">Toque num grupo para abrir · linha vermelha = hoje · barra cheia = concluído</div><div class="cr-arvore">`
    + visiveis.map((t) => `<div class="cr-no n${Math.min(t.nivel, 4)} ${critica(t) ? "critica" : ""}" ${t.resumo ? `data-cr-abrir="${t.id}"` : ""}>
        <div class="cr-no-nome">${t.resumo ? `<span class="cr-seta">${abertos.has(t.id) || t0 ? "▾" : "▸"}</span>` : ""}${esc(t.nome)}<small>${t.pct}%</small></div>
        <div class="cr-gantt"><i class="hoje" style="left:${(h - a) / Math.max(1, b - a) * 100}%"></i>
          ${t.ini && t.fim ? `<i class="bar ${t.resumo ? "resumo" : ""}" style="left:${pos(t.ini)}%;width:${Math.max(0.4, pos(t.fim) - pos(t.ini))}%"><i style="width:${t.pct}%"></i></i>` : ""}</div>
      </div>`).join("") + `</div>`;
}

// ---------- importação ----------
async function importar(arquivo, container) {
  const msg = container.querySelector("[data-cr-msg]");
  msg.className = "ct-import-msg"; msg.textContent = "Lendo " + arquivo.name + "…";
  try {
    await ctx.garantirLibs();
    const wb = window.XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhasPlan = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: true });
    const teste = lerCronograma(linhasPlan);
    if (teste.tarefas.length < 5 || !teste.tarefas.some((t) => t.ini && t.fim)) throw new Error("não reconheci as colunas (Atividade, % concluída, Predecessoras, Início, Duração, Término)");
    calcularFolgas(teste);
    const dados = {
      arquivo: arquivo.name, importadoEm: ctx.nowISO(), importadoPor: ctx.usuario(),
      totalTarefas: teste.tarefas.length,
      linhas: linhasPlan.map((r) => { const o = {}; COLS.forEach((k, i) => { o[k] = r && r[i] != null ? String(r[i]) : ""; }); return o; }),
    };
    const tamanho = JSON.stringify(dados).length;
    if (tamanho > 900000) throw new Error("arquivo grande demais para guardar (" + Math.round(tamanho / 1024) + " KB)");
    msg.textContent = "Salvando " + teste.tarefas.length + " atividades…";
    const versao = "v_" + dados.importadoEm.replace(/[^\d]/g, "").slice(0, 14);
    await Promise.all([ctx.col.doc("atual").set(dados), ctx.col.doc(versao).set(dados)]);
    msg.className = "ct-import-msg ok";
    msg.textContent = `Cronograma atualizado: ${teste.tarefas.length} atividades, ${teste.tarefas.filter(critica).length} no caminho crítico. A versão anterior foi guardada no histórico.`;
  } catch (ex) {
    console.error(ex);
    msg.className = "ct-import-msg err";
    msg.textContent = "Não foi possível importar: " + (ex && ex.message ? ex.message : "erro desconhecido") + ".";
  }
}
