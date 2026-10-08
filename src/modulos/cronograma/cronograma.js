/* Aba Cronograma (v1.5): importação do MS Project (Excel), caminho crítico,
 * semana atual/próximas, atrasadas e árvore com barras.
 *
 * Firestore: cronogramas/atual  → { arquivo, importadoEm, importadoPor, linhas:[{a,b,c,d,e,f}] }
 *            cronogramas/v_<data> → cópia de cada versão enviada (histórico)
 *            cronogramas/progresso → { base: importadoEm, itens: { "<id>": { pct, em, por } } }
 *              % de avanço lançado no app por atividade. Vale só para a versão
 *              cujo importadoEm = base: enviar um cronograma novo recomeça do
 *              % que vier no arquivo (o progresso anterior fica no histórico).
 * As linhas são guardadas como vieram da planilha; o cálculo (hierarquia,
 * folgas, caminho crítico) é refeito no navegador a cada carregamento.
 */
import { lerCronograma, calcularFolgas, atividadesNoPeriodo, pctPrevisto, idxUtil, isoDeUtil } from "./cpm.js";
import { pintarIcones } from "../../ui/icones.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLS = ["a", "b", "c", "d", "e", "f"];

let ctx = null;            // { col, todayISO, nowISO, usuario, fmtDateBR, garantirLibs, erroAcesso }
let doc = null;            // cronogramas/atual
let prog = null;           // cronogramas/progresso
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
    cr.tarefas.forEach((t) => { t.pctArquivo = t.pct; });
  }
  aplicarProgresso();
}
export function definirProgresso(p) { prog = p || null; aplicarProgresso(); }

// Aplica o % lançado no app sobre o % do arquivo e recalcula os grupos
// (resumos) afetados pela média ponderada pela duração — mesmo critério do
// MS Project. Assim o Início, as metas e a estrutura usam o mesmo número.
function aplicarProgresso() {
  if (!cr) return;
  cr.tarefas.forEach((t) => { t.pct = t.pctArquivo; t.pctApp = null; });
  const itens = prog && doc && prog.base === doc.importadoEm ? prog.itens || {} : {};
  const afetados = new Set();
  Object.keys(itens).forEach((id) => {
    const t = cr.porId.get(Number(id)), v = itens[id];
    if (!t || t.resumo || !v || v.pct == null) return;
    t.pct = v.pct; t.pctApp = v;
    for (let p = t.pai; p != null; p = cr.porId.get(p).pai) afetados.add(p);
  });
  if (!afetados.size) return;
  const S = new Map(), W = new Map(); // soma (dur × %) e soma dur das folhas abaixo de cada resumo
  for (let i = cr.tarefas.length - 1; i >= 0; i--) {
    const t = cr.tarefas[i];
    if (!t.resumo) { S.set(t.id, (t.dur || 0) * t.pct); W.set(t.id, t.dur || 0); }
    else if (afetados.has(t.id) && W.get(t.id) > 0) t.pct = Math.round(S.get(t.id) / W.get(t.id));
    if (t.pai != null) { S.set(t.pai, (S.get(t.pai) || 0) + (S.get(t.id) || 0)); W.set(t.pai, (W.get(t.pai) || 0) + (W.get(t.id) || 0)); }
  }
}

/** Avanço da obra hoje (ponderado pela duração): real × previsto — usado na aba e no Início */
export function avancoObra(hoje) {
  if (!cr) return null;
  const folhas = cr.tarefas.filter((t) => !t.resumo && t.ini && t.fim && t.dur > 0);
  const somaD = folhas.reduce((a, t) => a + t.dur, 0) || 1;
  return {
    real: Math.round(folhas.reduce((a, t) => a + t.dur * t.pct, 0) / somaD),
    previsto: Math.round(folhas.reduce((a, t) => a + t.dur * pctPrevisto(t, hoje), 0) / somaD),
    lancadasNoApp: cr.tarefas.filter((t) => t.pctApp).length,
  };
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
  const av = avancoObra(hoje), realPond = av.real, prevPond = av.previsto;
  const kpis = `<div class="dash-kpis">
    <div class="dash-kpi-card tone-info"><div class="n">${realPond}<small style="font-size:15px">%</small></div><div class="l">Obra concluída</div><div class="d">previsto para hoje: ${prevPond}%${av.lancadasNoApp ? ` · ${av.lancadasNoApp} atividade(s) atualizada(s) no app` : ` · MS Project: ${geral.pct}%`}</div></div>
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
  container.querySelectorAll("[data-cr-pct]").forEach((el) => el.addEventListener("click", (ev) => {
    ev.stopPropagation(); editarPct(+el.dataset.crPct, container);
  }));
  container.querySelectorAll("[data-cr-abrir]").forEach((el) => el.addEventListener("click", () => {
    const id = +el.dataset.crAbrir; abertos.has(id) ? abertos.delete(id) : abertos.add(id); renderViewCronograma(container);
  }));
}

function cabecalho() {
  const info = doc ? `Versão de ${esc(doc.arquivo || "")} · enviada ${esc(String(doc.importadoEm || "").slice(0, 10).split("-").reverse().join("/"))} por ${esc(doc.importadoPor || "")}` : "Nenhum cronograma enviado ainda.";
  return `<div class="pav-header"><h2>Cronograma</h2></div>
    <p class="view-desc">Cronograma da obra (MS Project). Toque no % de uma atividade para atualizar o avanço pelo app — o Início e as metas usam esse valor. Enviar um cronograma novo recomeça do % que vier no arquivo.</p>
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
    ${t.resumo ? `<div class="cr-prog">${barraHtml(t, hoje)}<small>${t.pct}% · prev. ${pctPrevisto(t, hoje)}%</small></div>`
      : `<button type="button" class="cr-prog cr-prog-edit" data-cr-pct="${t.id}" title="Atualizar o % desta atividade">${barraHtml(t, hoje)}<small>${t.pct}% · prev. ${pctPrevisto(t, hoje)}%${t.pctApp ? ` <span class="cr-app">✎ app</span>` : ""} <span class="cr-lapis">editar</span></small></button>`}
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
        <div class="cr-no-nome">${t.resumo ? `<span class="cr-seta">${abertos.has(t.id) || t0 ? "▾" : "▸"}</span>` : ""}${esc(t.nome)}${t.resumo ? `<small>${t.pct}%</small>` : `<button type="button" class="cr-pct-mini" data-cr-pct="${t.id}" title="Atualizar %">${t.pct}%${t.pctApp ? " ✎" : ""}</button>`}</div>
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
    // guarda o progresso lançado no app junto da versão que está saindo (histórico)
    if (doc && prog && prog.base === doc.importadoEm && prog.itens && Object.keys(prog.itens).length) {
      const anterior = "p_" + String(doc.importadoEm).replace(/[^\d]/g, "").slice(0, 14);
      await ctx.col.doc(anterior).set(prog);
    }
    await Promise.all([ctx.col.doc("atual").set(dados), ctx.col.doc(versao).set(dados),
      ctx.col.doc("progresso").set({ base: dados.importadoEm, itens: {} })]);
    msg.className = "ct-import-msg ok";
    msg.textContent = `Cronograma atualizado: ${teste.tarefas.length} atividades, ${teste.tarefas.filter(critica).length} no caminho crítico. A versão anterior foi guardada no histórico.`;
  } catch (ex) {
    console.error(ex);
    msg.className = "ct-import-msg err";
    msg.textContent = "Não foi possível importar: " + (ex && ex.message ? ex.message : "erro desconhecido") + ".";
  }
}

// ---------- atualizar o % de uma atividade pelo app ----------
function editarPct(id, container) {
  const t = cr && cr.porId.get(id);
  if (!t || t.resumo) return;
  const hoje = ctx.todayISO();
  const ov = document.createElement("div");
  ov.className = "overlay ct-ficha-ov";
  ov.innerHTML = `<div class="modal cr-pct-modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>Avanço da atividade</h2><button class="close-x" data-fechar aria-label="Fechar">✕</button></div>
    <div class="modal-body">
      <p class="cr-pct-nome"><small>${esc(t.caminho.join(" › "))}</small><b>${esc(t.nome)}</b><span>${ctx.fmtDateBR(t.ini)} → ${ctx.fmtDateBR(t.fim)} · previsto para hoje: ${pctPrevisto(t, hoje)}%</span></p>
      <div class="cr-pct-valor"><input type="number" min="0" max="100" step="1" inputmode="numeric" data-pct value="${t.pct}"><span>%</span></div>
      <input type="range" min="0" max="100" step="5" data-pct-range value="${t.pct}" aria-label="% concluído">
      <div class="chips">${[0, 25, 50, 75, 100].map((v) => `<button type="button" class="chip" data-pct-rapido="${v}">${v === 100 ? "Concluída (100%)" : v + "%"}</button>`).join("")}</div>
      <p class="view-desc" style="margin-top:10px">No arquivo do MS Project: ${t.pctArquivo}%.${t.pctApp ? ` Atualizado no app por ${esc(t.pctApp.por || "")} em ${ctx.fmtDateBR(String(t.pctApp.em || "").slice(0, 10))}.` : ""}</p>
      <div class="ct-import-msg" data-pct-msg></div>
    </div>
    <div class="modal-foot"><div>${t.pctApp ? `<button class="btn" data-pct-arquivo>Voltar ao % do arquivo</button>` : ""}</div>
      <div><button class="btn" data-fechar>Cancelar</button><button class="btn primary" data-pct-salvar>Salvar</button></div></div>
  </div>`;
  document.body.appendChild(ov);
  const num = ov.querySelector("[data-pct]"), rng = ov.querySelector("[data-pct-range]");
  const fechar = () => { ov.remove(); document.removeEventListener("keydown", tecla); };
  const tecla = (ev) => { if (ev.key === "Escape") fechar(); };
  document.addEventListener("keydown", tecla);
  num.addEventListener("input", () => { rng.value = num.value; });
  rng.addEventListener("input", () => { num.value = rng.value; });
  const gravar = async (valor, botao) => {
    botao.disabled = true;
    const item = valor == null ? { pct: null, em: ctx.nowISO(), por: ctx.usuario() } : { pct: valor, em: ctx.nowISO(), por: ctx.usuario() };
    try {
      const envio = ctx.col.doc("progresso").set({ base: doc.importadoEm, itens: { [String(id)]: item } }, { merge: true });
      const r = await Promise.race([envio.then(() => "ok"), new Promise((res) => setTimeout(() => res("pendente"), 10000))]);
      if (r === "pendente") alert("Sem conexão no momento — o % será enviado quando o sinal voltar. Mantenha o app aberto.");
      fechar();
    } catch (ex) {
      console.error(ex);
      ov.querySelector("[data-pct-msg]").textContent = "Não foi possível salvar: " + (ex && ex.message ? ex.message : "erro desconhecido");
      botao.disabled = false;
    }
  };
  ov.addEventListener("click", (ev) => {
    if (ev.target === ov || ev.target.closest("[data-fechar]")) return fechar();
    const r = ev.target.closest("[data-pct-rapido]");
    if (r) { num.value = rng.value = r.dataset.pctRapido; return; }
    const a = ev.target.closest("[data-pct-arquivo]");
    if (a) return gravar(null, a);
    const sv = ev.target.closest("[data-pct-salvar]");
    if (sv) {
      const v = Math.round(Number(String(num.value).replace(",", ".")));
      if (isNaN(v) || v < 0 || v > 100) { ov.querySelector("[data-pct-msg]").textContent = "Informe um valor de 0 a 100."; return; }
      gravar(v, sv);
    }
  });
  num.focus(); num.select();
}
