/* Comportamento da "casca" do app (v1.3): gaveta do menu no celular, folha
   "Criar novo", atalhos data-clicar e pintura dos ícones. A navegação entre
   telas continua sendo do main.js (switchView). */
import "../estilos/layout.css";
import { pintarIcones } from "./icones.js";

export function initLayout() {
  pintarIcones();
  const side = document.getElementById("ti-side");
  const fundo = document.getElementById("ti-side-fundo");
  const folha = document.getElementById("ti-folha-novo");

  const abrirMenu = () => { side.classList.add("aberto"); fundo.hidden = false; };
  const fecharMenu = () => { side.classList.remove("aberto"); fundo.hidden = true; };
  const fecharFolha = () => { folha.hidden = true; };

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-abrir-menu]")) { abrirMenu(); return; }
    if (t === fundo) { fecharMenu(); return; }
    // escolheu uma tela ou ação dentro da gaveta → fecha a gaveta
    if (t.closest(".ti-side .nav-btn, .ti-side-novo .btn, #btn-logout")) fecharMenu();
    if (t.closest("[data-abrir-novo]")) { folha.hidden = false; return; }
    if (t === folha || t.closest("[data-fechar-folha]")) { fecharFolha(); return; }
    const c = t.closest("[data-clicar]");
    if (c) {
      fecharFolha();
      const alvo = document.getElementById(c.getAttribute("data-clicar"));
      if (alvo) alvo.click();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { fecharMenu(); fecharFolha(); }
  });
}

// Avatar com as iniciais (ex.: "MA" para matheus.alves@...)
export function definirUsuario(email) {
  const av = document.getElementById("ti-avatar");
  if (!av) return;
  const nome = String(email || "").split("@")[0].split(/[._-]+/).filter(Boolean);
  av.textContent = ((nome[0] || "·")[0] + (nome[1] ? nome[1][0] : "")).toUpperCase();
}

// Contadores (bolinhas vermelhas) do menu
export function definirContador(chave, n) {
  document.querySelectorAll(`[data-cnt="${chave}"]`).forEach((el) => {
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = !n;
  });
}
