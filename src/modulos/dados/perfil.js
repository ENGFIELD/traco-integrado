/* Tela "Meu perfil" (v1.38).
 *
 * Reúne o que é da própria pessoa:
 *  - nome que aparece no app (o do login; o cadastro da Equipe só o
 *    administrador muda);
 *  - perfil e permissões efetivas — lidos do mesmo cadastro que as regras do
 *    banco usam (firestore.rules). Só mostra: ninguém muda o próprio perfil;
 *  - assinatura (a mesma de antes: assinaturas/{uid}, que só a própria
 *    pessoa grava — regra do banco);
 *  - trocar a senha (pede a senha atual: o Firebase confere de novo quem é
 *    antes de trocar) ou receber o link por e-mail.
 * Nada aqui grava no banco além da assinatura (que já existia).
 */
import { escapeHtml } from "../comum/formatos.js";
import { PERFIS } from "./equipe.js";

const PAPEIS_ASSIN = { engenheiro: "Engenheiro(a) responsável", tecnico: "Técnico(a) — inspeção", estagiario: "Estagiário(a) — inspeção", encarregado: "Encarregado(a)" };

/**
 * O que a conta pode fazer, em linguagem simples.
 * c: { perfil, somenteLeitura, temCadastro, ativo, papelAssinatura }
 * Devolve [{ pode: bool, texto }]. Mesmas regras de firestore.rules e do app.
 */
export function permissoesDaConta(c) {
  const edita = !c.somenteLeitura;
  const admin = c.perfil === "admin" && edita;
  const papel = c.papelAssinatura || "";
  return [
    { pode: true, texto: "Ver fichas FVS, rastreabilidades, controle tecnológico, plantas, aço e cronograma" },
    { pode: edita, texto: "Criar e alterar fichas, rastreabilidades, resultados de CP, plantas e entregas de aço" },
    { pode: edita && !!papel, texto: papel === "engenheiro"
        ? "Assinar como engenharia (a ficha fica travada depois de assinada)"
        : papel ? "Assinar como " + (PAPEIS_ASSIN[papel] || papel).toLowerCase() + " (inspeção/coleta, não trava a ficha)"
        : "Assinar fichas (falta cadastrar a sua assinatura)" },
    { pode: edita && (c.perfil === "engenharia" || c.perfil === "admin"), texto: "Painel da engenharia (assinar em lote, pedir tarefas)" },
    { pode: admin, texto: "Tela Equipe: incluir pessoas, trocar perfil e desativar acesso" },
  ];
}

/** Mensagem clara para os erros do Firebase ao trocar a senha (sem detalhes internos). */
export function erroSenha(code) {
  return ({
    "auth/wrong-password": "A senha atual não confere.",
    "auth/invalid-credential": "A senha atual não confere.",
    "auth/invalid-login-credentials": "A senha atual não confere.",
    "auth/weak-password": "A senha nova é fraca demais. Use pelo menos 8 caracteres, com letras e números.",
    "auth/too-many-requests": "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
    "auth/requires-recent-login": "Por segurança, saia e entre de novo no app antes de trocar a senha.",
    "auth/network-request-failed": "Sem internet no momento. Tente de novo quando o sinal voltar.",
  })[code] || "Não foi possível trocar a senha agora. Tente de novo.";
}
/** Confere a senha nova antes de mandar ao Firebase; devolve a mensagem de erro ou "". */
export function validarSenhaNova(atual, nova, repetir) {
  if (!atual) return "Digite a sua senha atual.";
  if (String(nova).length < 8) return "A senha nova precisa ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(nova) || !/\d/.test(nova)) return "Use letras e números na senha nova.";
  if (nova === atual) return "A senha nova é igual à atual.";
  if (nova !== repetir) return "As duas senhas novas não são iguais.";
  return "";
}

let ctx = null;
/**
 * ctx: { firebase, auth, email, perfil, somenteLeitura, cadastro (equipe ou null),
 *        minhaAssinatura, abrirAssinatura(), aoMudarNome(nome), switchView }
 */
export function iniciarPerfil(c) { ctx = c; }

export function renderViewPerfil(el) {
  if (!el || !ctx) return;
  const u = ctx.auth.currentUser;
  if (!u) return;
  const cad = ctx.cadastro;
  const assin = ctx.minhaAssinatura;
  const perms = permissoesDaConta({ perfil: ctx.perfil, somenteLeitura: ctx.somenteLeitura, temCadastro: !!cad,
    ativo: !cad || cad.ativo !== false, papelAssinatura: assin && assin.papel });
  const situacao = ctx.somenteLeitura ? (cad && cad.ativo === false ? "Acesso desativado — só visualiza" : "Só visualiza") : "Pode editar";
  el.innerHTML = `
    <div class="pav-header"><h2>Meu perfil</h2></div>
    <p class="view-desc">Seus dados de acesso, o que a sua conta pode fazer, a sua assinatura e a troca de senha.</p>
    <div class="perfil-grid">
      <section class="perfil-card" aria-labelledby="pf-dados">
        <h3 id="pf-dados">Dados</h3>
        <div class="field"><label for="pf-nome">Nome que aparece no app</label>
          <div class="perfil-linha"><input type="text" id="pf-nome" maxlength="60" autocomplete="name" value="${escapeHtml(u.displayName || "")}" placeholder="Seu nome">
          <button type="button" class="btn" id="pf-salvar-nome">Salvar nome</button></div></div>
        <div class="field"><label>E-mail de acesso</label><div class="perfil-valor">${escapeHtml(u.email || "")}</div>
          <small class="hint">O e-mail só pode ser trocado pelo administrador.</small></div>
        ${cad && cad.nome && cad.nome !== u.displayName ? `<div class="field"><label>Nome no cadastro da equipe</label><div class="perfil-valor">${escapeHtml(cad.nome)}</div></div>` : ""}
        <div class="hint" data-msg-nome role="status"></div>
      </section>

      <section class="perfil-card" aria-labelledby="pf-perm">
        <h3 id="pf-perm">Acesso e permissões</h3>
        <div class="perfil-selos"><span class="pill ${ctx.somenteLeitura ? "aberto" : "concluido"}"><span class="dot"></span>${escapeHtml(situacao)}</span>
          <span class="perfil-perfil">${escapeHtml(PERFIS[ctx.perfil] || ctx.perfil)}</span></div>
        <ul class="perfil-perms">${perms.map((p) => `<li class="${p.pode ? "sim" : "nao"}"><span aria-hidden="true">${p.pode ? "✓" : "—"}</span><span><span class="sr">${p.pode ? "Pode: " : "Não pode: "}</span>${escapeHtml(p.texto)}</span></li>`).join("")}</ul>
        <small class="hint">${cad ? "Definido na tela Equipe pelo administrador." : "Você ainda não está no cadastro da equipe: vale a regra antiga (edita tudo)."} Para mudar o perfil, fale com o administrador.</small>
      </section>

      <section class="perfil-card" aria-labelledby="pf-assin">
        <h3 id="pf-assin">Assinatura</h3>
        ${assin && assin.imagem
          ? `<div class="perfil-assin"><img src="${escapeHtml(assin.imagem)}" alt="Sua assinatura"><div><b>${escapeHtml(assin.nome || "")}</b><small>${escapeHtml(PAPEIS_ASSIN[assin.papel] || assin.papel || "")}${assin.crea ? " · " + escapeHtml(assin.crea) : ""}</small></div></div>`
          : `<div class="hint">Você ainda não cadastrou a sua assinatura. Ela é usada nas FVS e rastreabilidades (Excel e assinatura em lote).</div>`}
        <button type="button" class="btn ${assin ? "" : "primary"}" id="pf-assin-btn"${ctx.somenteLeitura ? " disabled" : ""}>${assin ? "Trocar assinatura" : "Cadastrar assinatura"}</button>
      </section>

      <section class="perfil-card" aria-labelledby="pf-senha">
        <h3 id="pf-senha">Trocar senha</h3>
        <form id="pf-form-senha" autocomplete="on" novalidate>
          <input type="email" autocomplete="username" value="${escapeHtml(u.email || "")}" hidden readonly>
          <div class="field"><label for="pf-atual">Senha atual</label><input type="password" id="pf-atual" autocomplete="current-password" required></div>
          <div class="field"><label for="pf-nova">Senha nova</label><input type="password" id="pf-nova" autocomplete="new-password" minlength="8" required aria-describedby="pf-regra"></div>
          <div class="field"><label for="pf-repetir">Repita a senha nova</label><input type="password" id="pf-repetir" autocomplete="new-password" minlength="8" required></div>
          <small class="hint" id="pf-regra">Pelo menos 8 caracteres, com letras e números.</small>
          <label class="perfil-ver"><input type="checkbox" id="pf-mostrar"> mostrar as senhas</label>
          <div class="perfil-linha"><button type="submit" class="btn primary" id="pf-trocar">Trocar senha</button>
            <button type="button" class="btn ghost" id="pf-link">Receber link por e-mail</button></div>
          <div class="perfil-msg" data-msg-senha role="status" aria-live="polite"></div>
        </form>
      </section>
    </div>`;

  const msgNome = el.querySelector("[data-msg-nome]");
  el.querySelector("#pf-salvar-nome").addEventListener("click", async () => {
    const nome = el.querySelector("#pf-nome").value.trim().replace(/\s+/g, " ");
    if (nome.length < 2) { msgNome.textContent = "Escreva o seu nome."; return; }
    try {
      await u.updateProfile({ displayName: nome });
      ctx.aoMudarNome(nome);
      msgNome.textContent = "Nome salvo.";
    } catch (ex) { console.warn("perfil nome", ex && ex.code); msgNome.textContent = "Não foi possível salvar o nome agora. Tente de novo."; }
  });
  el.querySelector("#pf-assin-btn").addEventListener("click", () => ctx.abrirAssinatura());

  const form = el.querySelector("#pf-form-senha"), msg = el.querySelector("[data-msg-senha]");
  const aviso = (t, ok) => { msg.textContent = t; msg.className = "perfil-msg " + (ok ? "ok" : "erro"); };
  el.querySelector("#pf-mostrar").addEventListener("change", (e) => {
    form.querySelectorAll('input[type="password"],input[data-era-senha]').forEach((i) => { i.setAttribute("data-era-senha", "1"); i.type = e.target.checked ? "text" : "password"; });
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const atual = el.querySelector("#pf-atual").value, nova = el.querySelector("#pf-nova").value, rep = el.querySelector("#pf-repetir").value;
    const erro = validarSenhaNova(atual, nova, rep);
    if (erro) { aviso(erro, false); return; }
    const bt = el.querySelector("#pf-trocar");
    bt.disabled = true; aviso("Trocando…", true);
    try {
      const cred = ctx.firebase.auth.EmailAuthProvider.credential(u.email, atual);
      await u.reauthenticateWithCredential(cred);
      await u.updatePassword(nova);
      form.reset();
      aviso("Senha trocada. Use a senha nova no próximo acesso.", true);
    } catch (ex) {
      aviso(erroSenha(ex && ex.code), false);
    } finally { bt.disabled = false; }
  });
  el.querySelector("#pf-link").addEventListener("click", async () => {
    try { await ctx.auth.sendPasswordResetEmail(u.email); aviso("Enviamos para " + u.email + " um link para criar uma senha nova.", true); }
    catch (ex) { aviso(erroSenha(ex && ex.code), false); }
  });
}
