/* Programação e recebimento de aço (v1.5).
 *
 * Coleção Firestore: entregasAco/{id}
 *   pedido, fornecedor, destino (pavimento/elemento), dataPrevista, status
 *   ("programado" | "entregue" | "cancelado"), dataEntrega, notaFiscal,
 *   itens: [{ bitola, descricao, pesoKg }], pesoTotalKg, observacoes,
 *   criadoEm/Por, atualizadoEm/Por
 *
 * "Atrasada" não é gravado: é programada com dataPrevista < hoje.
 * Importação automática do pedido do fornecedor: ver importarPedido (a ser
 * ajustada ao modelo de pedido real enviado pela obra).
 */
import { pintarIcones } from "../../ui/icones.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BITOLAS = ["5,0", "6,3", "8,0", "10,0", "12,5", "16,0", "20,0", "25,0", "32,0"];
const kg = (n) => (n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("pt-BR") + " kg");
// "1.250,5" → 1250.5 ; "1250.5" → 1250.5 ; "1250" → 1250
const num = (v) => {
  if (v == null || String(v).trim() === "") return null;
  let t = String(v).trim().replace(/\s/g, "");
  t = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(t); return isNaN(n) ? null : n;
};
const numTela = (n) => (n == null || n === "" ? "" : String(n).replace(".", ","));

let ctx = null; // { col, lista(): [{id,...}], fmtDateBR, todayISO, nowISO, usuario(), erroAcesso() }
let filtro = { aba: "programadas", busca: "" };

export function initAco(contexto) { ctx = contexto; }

export function situacao(e, hoje) {
  if (e.status === "entregue") return "entregue";
  if (e.status === "cancelado") return "cancelado";
  return e.dataPrevista && e.dataPrevista < hoje ? "atrasada" : "programada";
}
export function pesoTotal(e) {
  if (e.pesoTotalKg != null) return e.pesoTotalKg;
  return (e.itens || []).reduce((s, i) => s + (num(i.pesoKg) || 0), 0);
}

// Próximas entregas (atrasadas primeiro, depois por data) — usado no Início
export function proximasEntregas(lista, hoje, max) {
  return lista.filter((e) => ["programada", "atrasada"].includes(situacao(e, hoje)))
    .sort((a, b) => (a.dataPrevista || "9999").localeCompare(b.dataPrevista || "9999"))
    .slice(0, max || 5);
}

export function renderViewAco(container) {
  const hoje = ctx.todayISO();
  const todas = ctx.lista();
  const em7 = addDias(hoje, 7);
  const prog = todas.filter((e) => situacao(e, hoje) === "programada");
  const atras = todas.filter((e) => situacao(e, hoje) === "atrasada");
  const entregues = todas.filter((e) => e.status === "entregue");
  const mes = hoje.slice(0, 7);
  const kgMes = entregues.filter((e) => (e.dataEntrega || "").slice(0, 7) === mes).reduce((s, e) => s + pesoTotal(e), 0);
  const kgProg = prog.concat(atras).reduce((s, e) => s + pesoTotal(e), 0);
  const semana = prog.filter((e) => e.dataPrevista && e.dataPrevista <= em7).length;

  const termo = filtro.busca.trim().toLowerCase();
  const daAba = (filtro.aba === "entregues" ? entregues : (filtro.aba === "todas" ? todas : atras.concat(prog)))
    .filter((e) => !termo || [e.pedido, e.fornecedor, e.destino, e.notaFiscal, e.observacoes].join(" ").toLowerCase().includes(termo))
    .sort((a, b) => filtro.aba === "entregues"
      ? (b.dataEntrega || "").localeCompare(a.dataEntrega || "")
      : (a.dataPrevista || "9999").localeCompare(b.dataPrevista || "9999"));

  container.innerHTML = `
    <div class="pav-header"><h2>Entregas de aço</h2><span class="pav-total">${todas.length} pedido(s)</span></div>
    <p class="view-desc">Programação de entregas de aço e recebimentos na obra. As próximas entregas aparecem também no Início.</p>
    ${ctx.erroAcesso() ? `<div class="banner">Esta área ainda não foi liberada no banco de dados (regras de segurança). Ela passa a funcionar quando a versão for publicada.</div>` : ""}
    <div class="dash-kpis">
      <button type="button" class="dash-kpi-card tone-nc" data-aco-aba="programadas"><div class="n">${atras.length}</div><div class="l">Entregas atrasadas</div><div class="d">data prevista já passou</div></button>
      <button type="button" class="dash-kpi-card tone-pendente" data-aco-aba="programadas"><div class="n">${semana}</div><div class="l">Chegam nos próximos 7 dias</div><div class="d">${prog.length} programada(s) no total</div></button>
      <button type="button" class="dash-kpi-card tone-info" data-aco-aba="programadas"><div class="n">${Math.round(kgProg / 1000 * 10) / 10}<small style="font-size:15px"> t</small></div><div class="l">A receber</div><div class="d">${kg(kgProg)}</div></button>
      <button type="button" class="dash-kpi-card tone-ok" data-aco-aba="entregues"><div class="n">${Math.round(kgMes / 1000 * 10) / 10}<small style="font-size:15px"> t</small></div><div class="l">Recebido neste mês</div><div class="d">${entregues.length} entrega(s) no total</div></button>
    </div>
    <div class="ct-acoes">
      <button class="btn primary" type="button" data-aco-nova><svg class="ti-i" data-i="plus"></svg>Programar entrega</button>
      <button class="btn" type="button" data-aco-importar title="Importar o pedido do fornecedor"><svg class="ti-i" data-i="file"></svg>Importar pedido…</button>
      <input type="file" data-aco-arquivo accept=".pdf,.xlsx,.xls,.csv" hidden>
      <div class="ct-acoes-info"><span data-aco-msg></span></div>
    </div>
    <div class="ct-filtros">
      <div class="search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" data-aco-busca placeholder="Buscar pedido, fornecedor, destino, NF…" value="${esc(filtro.busca)}"></div>
      <div class="ct-visao" role="group">
        ${[["programadas", `A receber (${atras.length + prog.length})`], ["entregues", `Entregues (${entregues.length})`], ["todas", "Todas"]]
          .map(([k, l]) => `<button type="button" class="chip" data-aco-aba="${k}" aria-pressed="${filtro.aba === k}">${l}</button>`).join("")}
      </div>
    </div>
    <div class="aco-lista">${daAba.length ? daAba.map((e) => cartao(e, hoje)).join("") : `<div class="empty-state"><div class="big">Nada por aqui</div><p>Toque em "Programar entrega" para cadastrar o primeiro pedido.</p></div>`}</div>`;
  pintarIcones(container);

  container.querySelectorAll("[data-aco-aba]").forEach((b) => b.addEventListener("click", () => { filtro.aba = b.dataset.acoAba; renderViewAco(container); }));
  container.querySelector("[data-aco-busca]").addEventListener("input", (ev) => {
    filtro.busca = ev.target.value;
    const pos = ev.target.selectionStart;
    renderViewAco(container);
    const i = container.querySelector("[data-aco-busca]"); i.focus(); i.setSelectionRange(pos, pos);
  });
  container.querySelector("[data-aco-nova]").addEventListener("click", () => abrirFicha(null, container));
  const arq = container.querySelector("[data-aco-arquivo]");
  container.querySelector("[data-aco-importar]").addEventListener("click", () => arq.click());
  arq.addEventListener("change", () => {
    const f = arq.files && arq.files[0]; arq.value = "";
    if (f) container.querySelector("[data-aco-msg]").textContent =
      `Recebi "${f.name}". A leitura automática do pedido será ativada assim que o modelo do fornecedor for configurado — por enquanto, cadastre em "Programar entrega".`;
  });
  container.querySelectorAll("[data-aco-abrir]").forEach((c) => c.addEventListener("click", () => abrirFicha(c.dataset.acoAbrir, container)));
}

function cartao(e, hoje) {
  const st = situacao(e, hoje);
  const pill = { programada: "pendente", atrasada: "has-nc", entregue: "concluido", cancelado: "vinculo" }[st];
  const rot = { programada: "Programada", atrasada: "Atrasada", entregue: "Entregue", cancelado: "Cancelada" }[st];
  const quando = st === "entregue" ? "entregue em " + ctx.fmtDateBR(e.dataEntrega) : "prevista " + ctx.fmtDateBR(e.dataPrevista);
  const bitolas = (e.itens || []).filter((i) => i.bitola).map((i) => "Ø" + i.bitola).join(" · ");
  return `<div class="aco-card ${st}" data-aco-abrir="${esc(e.id)}">
    <div class="aco-data"><b>${esc((st === "entregue" ? e.dataEntrega : e.dataPrevista) ? ctx.fmtDateBR(st === "entregue" ? e.dataEntrega : e.dataPrevista).slice(0, 5) : "—")}</b><small>${esc(st === "entregue" ? "entregue" : "prevista")}</small></div>
    <div class="aco-corpo"><b>Pedido ${esc(e.pedido || "s/ nº")} · ${esc(e.fornecedor || "fornecedor?")}</b>
      <small>${esc(e.destino || "sem destino")} · ${esc(quando)}${e.notaFiscal ? " · NF " + esc(e.notaFiscal) : ""}</small>
      ${bitolas ? `<small class="aco-bitolas">${esc(bitolas)}</small>` : ""}</div>
    <div class="aco-peso"><b>${kg(pesoTotal(e))}</b><span class="pill ${pill}"><span class="dot"></span>${rot}</span></div>
  </div>`;
}

function abrirFicha(id, container) {
  const atual = id ? ctx.lista().find((e) => e.id === id) : null;
  const e = JSON.parse(JSON.stringify(atual || { status: "programado", dataPrevista: ctx.todayISO(), itens: [{ bitola: "", pesoKg: "" }] }));
  if (!e.itens || !e.itens.length) e.itens = [{ bitola: "", pesoKg: "" }];
  const ov = document.createElement("div");
  ov.className = "overlay ct-ficha-ov";
  const linhaItem = (it, i) => `<div class="aco-item" data-i="${i}">
      <div class="field"><label>Bitola (mm)</label><select data-it="bitola"><option value="">—</option>${BITOLAS.map((b) => `<option${it.bitola === b ? " selected" : ""}>${b}</option>`).join("")}</select></div>
      <div class="field"><label>Descrição</label><input data-it="descricao" value="${esc(it.descricao || "")}" placeholder="ex.: CA-50 barra 12 m / cortado e dobrado"></div>
      <div class="field"><label>Peso (kg)</label><input data-it="pesoKg" inputmode="decimal" value="${esc(numTela(it.pesoKg))}"></div>
      <button type="button" class="rm-line" data-rm-item="${i}" aria-label="Remover item">✕</button></div>`;
  const desenhar = () => {
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${atual ? "Pedido " + esc(e.pedido || "") : "Programar entrega de aço"}</h2><button class="close-x" data-fechar aria-label="Fechar">✕</button></div>
      <div class="modal-body">
        <fieldset><legend>Pedido</legend><div class="grid3">
          <div class="field"><label>Nº do pedido</label><input data-f="pedido" value="${esc(e.pedido || "")}"></div>
          <div class="field"><label>Fornecedor</label><input data-f="fornecedor" value="${esc(e.fornecedor || "")}" placeholder="ex.: Gerdau, ArcelorMittal"></div>
          <div class="field"><label>Destino (pavimento / elemento)</label><input data-f="destino" value="${esc(e.destino || "")}" placeholder="ex.: 4º Pav. Tipo — lajes"></div>
          <div class="field"><label>Data prevista de entrega</label><input type="date" data-f="dataPrevista" value="${esc(e.dataPrevista || "")}"></div>
          <div class="field"><label>Situação</label><select data-f="status">
            ${[["programado", "Programada"], ["entregue", "Entregue"], ["cancelado", "Cancelada"]].map(([v, l]) => `<option value="${v}"${e.status === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="field" data-so-entregue ${e.status === "entregue" ? "" : "hidden"}><label>Data da entrega</label><input type="date" data-f="dataEntrega" value="${esc(e.dataEntrega || "")}"></div>
          <div class="field" data-so-entregue ${e.status === "entregue" ? "" : "hidden"}><label>Nota fiscal</label><input data-f="notaFiscal" value="${esc(e.notaFiscal || "")}"></div>
        </div></fieldset>
        <fieldset><legend>Itens <span style="font-weight:400;color:var(--text-muted);font-size:11.5px;">— total <b data-total>${kg(somaItens(e.itens))}</b></span></legend>
          <div class="aco-itens">${e.itens.map(linhaItem).join("")}</div>
          <button type="button" class="btn ghost" data-add-item style="margin-top:8px">+ Adicionar bitola</button></fieldset>
        <fieldset><legend>Observações</legend><div class="field"><textarea data-f="observacoes">${esc(e.observacoes || "")}</textarea></div></fieldset>
        ${atual && atual.atualizadoEm ? `<div class="last-updated">Última atualização: ${esc(atual.atualizadoPor || "")} · ${esc(String(atual.atualizadoEm).slice(0, 16).replace("T", " "))}</div>` : ""}
      </div>
      <div class="modal-foot"><div>${atual && e.status !== "entregue" ? `<button class="btn" data-receber>✓ Marcar como entregue hoje</button>` : ""}</div>
        <div style="display:flex;gap:10px"><button class="btn" data-fechar>Cancelar</button><button class="btn primary" data-salvar>Salvar</button></div></div></div>`;
  };
  const lerTela = () => {
    ov.querySelectorAll("[data-f]").forEach((el) => { e[el.dataset.f] = el.value.trim(); });
    e.itens = [...ov.querySelectorAll(".aco-item")].map((row) => ({
      bitola: row.querySelector('[data-it="bitola"]').value,
      descricao: row.querySelector('[data-it="descricao"]').value.trim(),
      pesoKg: num(row.querySelector('[data-it="pesoKg"]').value),
    }));
  };
  desenhar();
  document.body.appendChild(ov);
  document.body.style.overflow = "hidden";
  let sujo = false;
  const fechar = () => {
    if (sujo && !confirm("Descartar as alterações deste pedido?")) return;
    ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", tecla);
    // a atualização do banco pode ter chegado com a ficha aberta — redesenha a lista
    if (container && container.isConnected && !container.hidden) renderViewAco(container);
  };
  const tecla = (ev) => { if (ev.key === "Escape") fechar(); };
  document.addEventListener("keydown", tecla);
  ov.addEventListener("input", () => { sujo = true; lerTela(); ov.querySelector("[data-total]").textContent = kg(somaItens(e.itens)); });
  ov.addEventListener("change", (ev) => {
    if (ev.target.matches('[data-f="status"]')) ov.querySelectorAll("[data-so-entregue]").forEach((x) => { x.hidden = ev.target.value !== "entregue"; });
  });
  ov.addEventListener("click", async (ev) => {
    if (ev.target === ov || ev.target.closest("[data-fechar]")) return fechar();
    if (ev.target.closest("[data-add-item]")) { lerTela(); e.itens.push({ bitola: "", pesoKg: "" }); desenhar(); return; }
    const rm = ev.target.closest("[data-rm-item]");
    if (rm) { lerTela(); e.itens.splice(+rm.dataset.rmItem, 1); if (!e.itens.length) e.itens.push({ bitola: "", pesoKg: "" }); desenhar(); sujo = true; return; }
    if (ev.target.closest("[data-receber]")) {
      lerTela(); e.status = "entregue"; if (!e.dataEntrega) e.dataEntrega = ctx.todayISO(); desenhar(); sujo = true;
      ov.querySelector('[data-f="notaFiscal"]').focus(); return;
    }
    const sb = ev.target.closest("[data-salvar]");
    if (sb) {
      lerTela();
      if (!e.fornecedor && !e.pedido) { alert("Informe ao menos o nº do pedido ou o fornecedor."); return; }
      if (e.status === "entregue" && !e.dataEntrega) e.dataEntrega = ctx.todayISO();
      const dados = { ...e, itens: e.itens.filter((i) => i.bitola || i.descricao || i.pesoKg != null), pesoTotalKg: somaItens(e.itens),
        atualizadoEm: ctx.nowISO(), atualizadoPor: ctx.usuario() };
      delete dados.id;
      if (!atual) { dados.criadoEm = ctx.nowISO(); dados.criadoPor = ctx.usuario(); }
      sb.disabled = true; sb.textContent = "Salvando…";
      try {
        const ref = atual ? ctx.col.doc(atual.id) : ctx.col.doc();
        const envio = ref.set(dados, { merge: true });
        const r = await Promise.race([envio.then(() => "ok"), new Promise((res) => setTimeout(() => res("pendente"), 10000))]);
        if (r === "pendente") alert("Sem conexão no momento — o pedido será enviado automaticamente quando o sinal voltar. Mantenha o app aberto.");
        sujo = false; fechar();
      } catch (ex) {
        console.error(ex);
        alert("Não foi possível salvar: " + (ex && ex.message ? ex.message : "erro desconhecido"));
        sb.disabled = false; sb.textContent = "Salvar";
      }
    }
  });
}

function somaItens(itens) { return (itens || []).reduce((s, i) => s + (num(i.pesoKg) || 0), 0); }
function addDias(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
