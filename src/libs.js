/* Bibliotecas pesadas carregadas só quando forem usadas.
   Antes (v1.1) Excel/ZIP/PDF vinham de CDN em toda abertura do app (~1,5 MB
   somando os modelos embutidos). Agora cada uma é baixada na primeira vez que
   a pessoa exporta, importa a planilha do laboratório ou abre uma planta — e
   fica em cache depois. As versões são as mesmas da v1.1 (ver package.json).

   O código da v1.1 usa os nomes globais JSZip, XLSX e pdfjsLib; por isso cada
   biblioteca é publicada em window ao carregar. */
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";

export async function garantirLibs() {
  if (!window.JSZip) {
    const m = await import("jszip");
    window.JSZip = m.default || m;
  }
  if (!window.XLSX) {
    const m = await import("xlsx-js-style");
    window.XLSX = m.default && m.default.utils ? m.default : m;
  }
}

export async function garantirPdf() {
  if (window.pdfjsLib) return;
  const m = await import("pdfjs-dist");
  const lib = m.default && m.default.getDocument ? m.default : m;
  lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  window.pdfjsLib = lib;
}

// Abre um modelo oficial .xlsx (public/modelos/) como ZIP para o export
// "cirúrgico" de XML — o mesmo que a v1.1 fazia a partir do base64 embutido.
export async function carregarModelo(url) {
  await garantirLibs();
  const r = await fetch(url);
  if (!r.ok) throw new Error("modelo Excel não encontrado: " + url + " (HTTP " + r.status + ")");
  return window.JSZip.loadAsync(await r.arrayBuffer());
}
