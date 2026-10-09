/* Equipe e perfis guardados no banco (v1.31 — fase B1 do plano).
 *
 * Antes os perfis ficavam escritos no código (era preciso publicar uma versão
 * para incluir alguém). Agora ficam em equipe/{e-mail}: { nome, email, perfil,
 * ativo }. O administrador muda pela tela Equipe; as regras do banco
 * (firestore.rules) leem o mesmo cadastro.
 *
 * Segurança: quem não está no cadastro continua como antes (edita tudo).
 * O cadastro serve para dar perfil, deixar "só visualiza" (qualidade) ou
 * desativar o acesso de alguém.
 */
import { escapeHtml } from "../comum/formatos.js";

export const PERFIS = {
  admin: "Administrador",
  engenharia: "Engenharia (assina e acompanha)",
  estagiario: "Estagiário(a) — preenche tudo",
  qualidade: "Qualidade — só visualiza",
};
// a equipe de hoje (a mesma que estava no código até a v1.30)
export const EQUIPE_INICIAL = [
  { email: "matheus.alves@sig.eng.br", nome: "Matheus Alves", perfil: "admin" },
  { email: "suellen.alves@sig.eng.br", nome: "Suellen Alves", perfil: "engenharia" },
  { email: "alice.soares@sig.eng.br", nome: "Alice Soares", perfil: "estagiario" },
  { email: "jessica.araujo@sig.eng.br", nome: "Jessica Araujo", perfil: "qualidade" },
];
const ADMIN_FIXO = "matheus.alves@sig.eng.br"; // igual a firestore.rules: nunca perde o acesso de administrador

export const normEmail = (e) => String(e || "").trim().toLowerCase();

/** cadastro da pessoa: do banco, senão da lista inicial, senão null */
export function cadastroDe(email, equipe) {
  const e = normEmail(email);
  if (equipe && equipe.size) return equipe.get(e) || null;
  return EQUIPE_INICIAL.find((x) => x.email === e) || null;
}
/** perfil de quem entrou (quem não está no cadastro é estagiário, como antes) */
export function perfilDe(email, equipe) {
  const c = cadastroDe(email, equipe);
  if (normEmail(email) === ADMIN_FIXO) return "admin";
  return (c && c.ativo !== false && PERFIS[c.perfil] && c.perfil) || "estagiario";
}
/** só visualiza? (perfil qualidade ou acesso desativado) */
export function soVisualiza(email, equipe) {
  if (normEmail(email) === ADMIN_FIXO) return false;
  const c = cadastroDe(email, equipe);
  return !!c && (c.perfil === "qualidade" || c.ativo === false);
}
/** pessoas que recebem tarefas da engenharia */
export function recebemTarefas(equipe) {
  const lista = equipe && equipe.size ? [...equipe.values()] : EQUIPE_INICIAL;
  return lista.filter((x) => x.ativo !== false && (x.perfil === "estagiario" || x.perfil === "admin"))
    .map((x) => ({ email: x.email, nome: x.nome || x.email }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
/** confere os dados de uma pessoa nova; devolve a mensagem de erro ou "" */
export function validarPessoa(p, equipe) {
  const email = normEmail(p.email);
  if (!String(p.nome || "").trim()) return "Escreva o nome.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "E-mail inválido.";
  if (!PERFIS[p.perfil]) return "Escolha o perfil.";
  if (equipe && equipe.has(email)) return "Essa pessoa já está na equipe.";
  return "";
}

// ---------------- tela ----------------
let ctx = null;
/** ctx: { db, equipe(): Map, email(), agora(), criarLogin(email): Promise<string> } */
export function iniciarEquipe(c) { ctx = c; }

export function renderViewEquipe() {
  const c = document.getElementById("view-equipe");
  if (!c) return;
  // a tela se redesenha quando o banco confirma; não perde o que já foi digitado
  const digitado = {};
  ["eq-nome", "eq-email", "eq-perfil", "eq-criar-login"].forEach((id) => { const el = c.querySelector("#" + id); if (el) digitado[id] = el.type === "checkbox" ? el.checked : el.value; });
  const focado = document.activeElement && c.contains(document.activeElement) ? document.activeElement.id : "";
  const equipe = ctx.equipe();
  const eu = normEmail(ctx.email());
  const admin = perfilDe(eu, equipe) === "admin";
  const vazia = !equipe.size;
  const lista = vazia ? EQUIPE_INICIAL : [...equipe.values()].sort((a, b) => (a.ativo === false) - (b.ativo === false) || String(a.nome).localeCompare(String(b.nome)));
  const optPerfil = (sel) => Object.keys(PERFIS).map((k) => '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + escapeHtml(PERFIS[k]) + "</option>").join("");
  let html = '<div class="pav-header"><h2>Equipe</h2><span class="pav-total">' + lista.filter((x) => x.ativo !== false).length + " pessoas</span></div>"
    + '<p class="view-desc">Quem usa o sistema e o que cada um pode fazer. ' + (admin ? "Mudanças valem na hora, sem versão nova." : "Só o administrador altera.") + "</p>";
  if (vazia) {
    html += '<div class="banner">A equipe ainda não está guardada no banco — abaixo está a lista que vinha no código.'
      + (admin ? ' <button type="button" class="btn small primary" data-eq-salvar-inicial>Guardar esta equipe no banco</button>' : "") + "</div>";
  }
  html += '<div class="dash-card hist-lista">';
  lista.forEach((p) => {
    const ativo = p.ativo !== false, proprio = p.email === eu;
    const podeMexer = admin && !vazia && !proprio;
    html += '<div class="hist-item eq-item' + (ativo ? "" : " inativo") + '"><span class="hist-tx"><b>' + escapeHtml(p.nome || p.email) + (proprio ? " (você)" : "") + "</b><small>" + escapeHtml(p.email) + (podeMexer ? "" : " · " + escapeHtml(PERFIS[p.perfil] || p.perfil || "")) + (ativo ? "" : " · acesso desativado") + "</small></span>"
      + (podeMexer
        ? '<select data-eq-perfil="' + escapeHtml(p.email) + '" aria-label="Perfil">' + optPerfil(p.perfil) + "</select>"
          + '<button type="button" class="btn small" data-eq-ativo="' + escapeHtml(p.email) + '">' + (ativo ? "Desativar" : "Reativar") + "</button>"
        : "")
      + "</div>";
  });
  html += "</div>";
  if (admin && !vazia) {
    html += '<div class="dash-card" style="margin-top:14px"><div class="dash-card-h"><h3>Incluir pessoa</h3></div><div class="eq-nova">'
      + '<input type="text" id="eq-nome" placeholder="Nome" autocomplete="off">'
      + '<input type="email" id="eq-email" placeholder="E-mail (o mesmo do login)" autocomplete="off">'
      + '<select id="eq-perfil">' + optPerfil("estagiario") + "</select>"
      + '<label class="eq-login"><input type="checkbox" id="eq-criar-login" checked> Criar o login e mandar e-mail para a pessoa criar a senha</label>'
      + '<button type="button" class="btn primary" data-eq-incluir>Incluir</button>'
      + '<div class="hint" id="eq-msg"></div></div></div>';
  }
  c.innerHTML = html;
  Object.keys(digitado).forEach((id) => { const el = c.querySelector("#" + id); if (el) { if (el.type === "checkbox") el.checked = digitado[id]; else el.value = digitado[id]; } });
  if (focado) { const el = c.querySelector("#" + focado); if (el) el.focus(); }

  const gravar = (email, dados) => ctx.db().collection("equipe").doc(email).set(dados, { merge: true })
    .catch((e) => { console.error(e); alert("Não foi possível salvar: " + ((e && e.message) || "erro")); });
  const btIni = c.querySelector("[data-eq-salvar-inicial]");
  if (btIni) btIni.addEventListener("click", () => {
    btIni.disabled = true;
    EQUIPE_INICIAL.forEach((p) => gravar(p.email, Object.assign({ ativo: true }, p)));
    setTimeout(renderViewEquipe, 300);
  });
  c.querySelectorAll("[data-eq-perfil]").forEach((s) => s.addEventListener("change", () => {
    gravar(s.getAttribute("data-eq-perfil"), { perfil: s.value }); setTimeout(renderViewEquipe, 200);
  }));
  c.querySelectorAll("[data-eq-ativo]").forEach((b) => b.addEventListener("click", () => {
    const email = b.getAttribute("data-eq-ativo"), p = equipe.get(email) || {};
    if (p.ativo !== false && !confirm("Desativar o acesso de " + (p.nome || email) + "? A pessoa passa a só visualizar até ser reativada.")) return;
    gravar(email, { ativo: p.ativo === false }); setTimeout(renderViewEquipe, 200);
  }));
  const inc = c.querySelector("[data-eq-incluir]");
  if (inc) inc.addEventListener("click", async () => {
    const msg = c.querySelector("#eq-msg");
    const p = { nome: c.querySelector("#eq-nome").value.trim(), email: normEmail(c.querySelector("#eq-email").value), perfil: c.querySelector("#eq-perfil").value };
    const erro = validarPessoa(p, equipe);
    if (erro) { msg.textContent = erro; return; }
    inc.disabled = true; msg.textContent = "Incluindo…";
    gravar(p.email, Object.assign({ ativo: true }, p));
    let aviso = p.nome + " incluído(a) na equipe.";
    if (c.querySelector("#eq-criar-login").checked) {
      try { aviso += " " + await ctx.criarLogin(p.email); }
      catch (e) { aviso += " Não deu para criar o login (" + ((e && e.code) || (e && e.message) || "erro") + ") — crie no Firebase Authentication."; }
    }
    ["#eq-nome", "#eq-email"].forEach((sel) => { const el = c.querySelector(sel); if (el) el.value = ""; });
    renderViewEquipe();
    const m2 = document.querySelector("#view-equipe #eq-msg"); if (m2) m2.textContent = aviso;
  });
}
