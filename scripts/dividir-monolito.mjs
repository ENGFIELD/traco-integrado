#!/usr/bin/env node
/**
 * Etapa 2.1 — divide o index.html monolítico (v1.1) no projeto Vite, SEM mudar
 * comportamento. Script de uso único, guardado para rastreabilidade.
 *
 * Entrada:  legado/index-v1.1.html
 * Saída:    index.html (casca), src/estilos/app.css, src/main.js,
 *           public/img/*.png (logos), public/modelos/*.xlsx (ex-base64)
 *
 * Cada substituição no código é conferida: se não encontrar exatamente o
 * trecho esperado, o script para com erro (nada é "adivinhado").
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// fileURLToPath decodifica o "Ç" de "TRAÇO INTEGRADO" corretamente.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");
const gravar = (p, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(raiz, p)), { recursive: true });
  fs.writeFileSync(path.join(raiz, p), conteudo);
  console.log("  gravado", p, typeof conteudo === "string" ? `(${conteudo.length} chars)` : `(${conteudo.length} bytes)`);
};
function entre(txt, ini, fim, desde = 0) {
  const a = txt.indexOf(ini, desde);
  if (a < 0) throw new Error("não achei: " + ini);
  const b = txt.indexOf(fim, a + ini.length);
  if (b < 0) throw new Error("não achei: " + fim);
  return { conteudo: txt.slice(a + ini.length, b), ini: a, fim: b + fim.length };
}
function trocarUmaVez(txt, de, para, nome) {
  const n = txt.split(de).length - 1;
  if (n !== 1) throw new Error(`patch "${nome}": esperava 1 ocorrência, achei ${n}`);
  return txt.replace(de, para);
}

const html = ler("legado/index-v1.1.html");

// ---------- head ----------
const head = entre(html, "<head>", "</head>").conteudo;
const css = entre(head, "<style>", "</style>").conteudo;
const headSemCss = head.replace("<style>" + css + "</style>", "").replace(/\n\s*\n/g, "\n");
gravar("src/estilos/app.css", "/* Estilos da v1.1, extraídos sem alteração (etapa 2.1). */\n" + css.replace(/^\n/, ""));

// ---------- body (marcação) ----------
const bodyIni = html.indexOf("<body>") + "<body>".length;
const primeiroScript = html.indexOf('<script src="https://www.gstatic.com');
let marcacao = html.slice(bodyIni, primeiroScript);
const ultimoScriptFim = html.lastIndexOf("</script>") + "</script>".length;
let rodape = html.slice(ultimoScriptFim, html.indexOf("</body>"));
rodape = trocarUmaVez(rodape, "build 2026-10-07 v1.1", "build 2026-10-07 v1.2", "build");

// logos base64 → arquivos
const logos = new Map();
marcacao = marcacao.replace(/<img class="(logo-light|logo-dark)" src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/g, (m, cls, b64) => {
  const buf = Buffer.from(b64, "base64");
  const h = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
  let nome = logos.get(h);
  if (!nome) {
    nome = `img/sig-${cls}-${h}.png`;
    logos.set(h, nome);
    gravar("public/" + nome, buf);
  }
  return `<img class="${cls}" src="/${nome}"`;
});

// ---------- scripts inline ----------
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (inline.length !== 3) throw new Error("esperava 3 scripts inline, achei " + inline.length);
let [bloco1, bloco2, bloco3] = inline;

// modelos .xlsx em base64 → public/modelos/
let nModelos = 0;
bloco2 = bloco2.replace(/var (\w+) = "([A-Za-z0-9+/=]{1000,})";/g, (m, nome, b64) => {
  gravar(`public/modelos/${nome}.xlsx`, Buffer.from(b64, "base64"));
  nModelos++;
  return `var ${nome} = "/modelos/${nome}.xlsx";`;
});
if (nModelos !== 19) throw new Error("esperava 19 modelos (FVS-04, FORM-15 e 17 tipos), achei " + nModelos);

// bibliotecas carregadas sob demanda
bloco2 = trocarUmaVez(bloco2, "JSZip.loadAsync(layout.b64, {base64:true})", "carregarModelo(layout.b64)", "modelo genérico");
bloco2 = trocarUmaVez(bloco2, "JSZip.loadAsync(FVS_TEMPLATE_B64, {base64:true})", "carregarModelo(FVS_TEMPLATE_B64)", "modelo FVS-04");
bloco2 = trocarUmaVez(bloco2, "JSZip.loadAsync(RAST_TEMPLATE_B64, {base64:true})", "carregarModelo(RAST_TEMPLATE_B64)", "modelo FORM-15");
bloco2 = trocarUmaVez(bloco2, "async function carregarPlantaNoCanvas(m){",
  "async function carregarPlantaNoCanvas(m){\n    try{ await garantirPdf(); }catch(ex){ console.error(ex); }", "pdf canvas");
bloco2 = trocarUmaVez(bloco2, "async function comprimirPlantaEmImagem(file){",
  "async function comprimirPlantaEmImagem(file){\n    try{ await garantirPdf(); }catch(ex){ console.error(ex); }", "pdf biblioteca");
bloco2 = trocarUmaVez(bloco2, "async function ctImportarArquivo(file){",
  "async function ctImportarArquivo(file){\n    try{ await garantirLibs(); }catch(ex){ console.error(ex); }", "import CT");
bloco2 = trocarUmaVez(bloco2, "async function gerarRelatorioNcWord(){",
  "async function gerarRelatorioNcWord(){\n    try{ await garantirLibs(); }catch(ex){ console.error(ex); }", "relatório Word");
bloco2 = trocarUmaVez(bloco2, 'm.querySelector("#btn-export").addEventListener("click", function(){',
  'm.querySelector("#btn-export").addEventListener("click", async function(){\n'
  + '      try{ await garantirLibs(); }catch(ex){ alert("Não foi possível carregar o gerador de Excel (verifique a internet)."); return; }', "botão exportar");

const main = `/* Traço Integrado — ponto de entrada (Vite).
   Etapa 2.1 (v1.2): o código da v1.1 roda aqui SEM mudança de comportamento.
   O que mudou é só a embalagem: CSS em arquivo próprio, logos e modelos
   Excel como arquivos (baixados só quando usados) e bibliotecas pesadas
   (Excel, ZIP, PDF) carregadas sob demanda — ver ./libs.js.
   Os blocos abaixo serão divididos em módulos (src/modulos/...) aos poucos,
   conforme cada área for sendo mexida nas próximas etapas. */
import "./estilos/app.css";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import { garantirLibs, garantirPdf, carregarModelo } from "./libs.js";

// Mantido no escopo global para depuração e testes automatizados.
window.firebase = firebase;

/* ===== bloco 1 — inicialização do Firebase ===== */
${bloco1.trim()}

/* ===== bloco 2 — aplicação ===== */
${bloco2.trim()}

/* ===== bloco 3 — PWA (instalar app) ===== */
${bloco3.trim()}
`;
gravar("src/main.js", main);

// ---------- casca index.html ----------
const casca = `<!doctype html>
<html lang="pt-BR">
<head>${headSemCss.replace(/\s+$/, "")}
</head>
<body>${marcacao.replace(/\s+$/, "")}

<!-- Chaves públicas do Firebase (arquivo separado de propósito, ver comentário dentro dele). -->
<script src="/firebase-config.js"></script>
<script type="module" src="/src/main.js"></script>
${rodape.trim()}
</body>
</html>
`;
gravar("index.html", casca);
console.log(`\nOK: ${logos.size} logo(s), ${nModelos} modelo(s) .xlsx, 8 patches aplicados.`);
