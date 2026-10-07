/* Busca global (Ctrl+K no PC, lupa no celular).
   Procura em fichas FVS, rastreabilidades (nº, local, NF, betoneira, peças),
   traços do controle tecnológico e telas do sistema. Os itens vêm do main.js
   (initBusca({ itens })), que conhece os dados carregados. */
import { pintarIcones } from "./icones.js";

// Sem acento, minúsculo, e "3º", "3°", "3⁰", "3o" viram todos "3o" (os dados
// têm as quatro formas digitadas).
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/(\d)\s*[º°⁰ªo](?![a-z])/g, "$1o");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function initBusca({ itens }) {
  const fundo = document.createElement("div");
  fundo.className = "ti-busca-fundo";
  fundo.hidden = true;
  fundo.innerHTML = `
    <div class="ti-busca-caixa" role="dialog" aria-label="Buscar">
      <div class="ti-busca-campo"><svg class="ti-i" data-i="search"></svg>
        <input type="search" placeholder="Buscar ficha, NF, betoneira, pavimento, peça…" autocomplete="off" enterkeyhint="search">
        <button type="button" class="ti-busca-x" aria-label="Fechar">Esc</button></div>
      <div class="ti-busca-res" role="listbox"></div>
    </div>`;
  document.body.appendChild(fundo);
  pintarIcones(fundo);
  const input = fundo.querySelector("input");
  const lista = fundo.querySelector(".ti-busca-res");
  let resultados = [], sel = 0;

  function abrir() {
    fundo.hidden = false;
    input.value = "";
    filtrar();
    setTimeout(() => input.focus(), 30);
  }
  function fechar() { fundo.hidden = true; }

  function filtrar() {
    const termos = norm(input.value).split(/\s+/).filter(Boolean);
    const todos = itens();
    resultados = (termos.length
      ? todos.filter((it) => { const h = norm(it.busca); return termos.every((t) => h.includes(t)); })
      : todos.filter((it) => it.grupo === "Telas" || it.grupo === "Ações")
    ).slice(0, 30);
    sel = 0;
    desenhar();
  }
  function desenhar() {
    if (!resultados.length) {
      lista.innerHTML = `<div class="ti-busca-vazio">Nada encontrado. Tente o nº da ficha, a NF, a betoneira ou o pavimento.</div>`;
      return;
    }
    let grupo = null, html = "";
    resultados.forEach((r, i) => {
      if (r.grupo !== grupo) { grupo = r.grupo; html += `<div class="ti-busca-grp">${esc(grupo)}</div>`; }
      html += `<div class="ti-busca-item${i === sel ? " sel" : ""}" role="option" data-i="${i}">
        <svg class="ti-i" data-i="${esc(r.icone || "file")}"></svg>
        <span class="t"><b>${esc(r.titulo)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>
        ${r.dir ? `<span class="d">${esc(r.dir)}</span>` : ""}</div>`;
    });
    lista.innerHTML = html;
    pintarIcones(lista);
    const s = lista.querySelector(".sel");
    if (s) s.scrollIntoView({ block: "nearest" });
  }
  function escolher(i) {
    const r = resultados[i];
    if (!r) return;
    fechar();
    r.abrir();
  }

  input.addEventListener("input", filtrar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(resultados.length - 1, sel + 1); desenhar(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); desenhar(); }
    else if (e.key === "Enter") { e.preventDefault(); escolher(sel); }
    else if (e.key === "Escape") { fechar(); }
  });
  lista.addEventListener("click", (e) => {
    const it = e.target.closest("[data-i].ti-busca-item");
    if (it) escolher(+it.getAttribute("data-i"));
  });
  fundo.addEventListener("click", (e) => { if (e.target === fundo || e.target.closest(".ti-busca-x")) fechar(); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-abrir-busca]")) abrir(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      if (document.getElementById("app-root").hidden) return;
      e.preventDefault();
      fundo.hidden ? abrir() : fechar();
    }
  });
}
