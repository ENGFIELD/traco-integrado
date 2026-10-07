/* Teste de aceite da etapa 2.1 — roda DENTRO da página (v1.1 e v1.2), contra
   os emuladores com a cópia dos dados.
   Para cada ficha: abre, clica em "Exportar Excel", captura o .xlsx gerado e
   calcula um resumo (SHA-256) do CONTEÚDO de cada arquivo interno do .xlsx.
   Compara-se o conteúdo (e não os bytes do .zip) porque o .zip guarda a
   data/hora da geração, que naturalmente muda a cada exportação.
   Uso: colar no console (ou via automação) e chamar
     await window.__exportsResumo("fvs")   // ou "rast"
*/
window.__exportsResumo = async function (tipo) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // O teste abre/fecha dezenas de fichas em sequência: desliga o histórico
  // (botão Voltar) para não interferir — não afeta a exportação.
  history.pushState = () => {};
  history.back = () => {};
  window.confirm = () => true;
  window.alert = (m) => console.warn("ALERT:", m);
  let capturado = null;
  URL.createObjectURL = (blob) => { capturado = blob; return "blob:capturado"; };
  const clickOriginal = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.href.indexOf("blob:capturado") === -1) clickOriginal.call(this); };

  async function hex(buf) {
    const h = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
  async function resumoXlsx(blob) {
    const zip = await window.JSZip.loadAsync(await blob.arrayBuffer());
    const nomes = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    const partes = [];
    for (const n of nomes) partes.push(n + ":" + (await hex(await zip.file(n).async("uint8array"))));
    return { arquivos: nomes.length, resumo: await hex(new TextEncoder().encode(partes.join("|"))) };
  }

  const attr = tipo === "fvs" ? "data-open-fvs" : "data-open-rast";
  document.querySelector('[data-view="board"],#btn-nav-board').click();
  await wait(300);
  const ids = [...new Set([...document.querySelectorAll("[" + attr + "]")].map((b) => b.getAttribute(attr)))].sort();
  const out = {};
  for (const id of ids) {
    document.querySelector("[" + attr + '="' + id + '"]').click();
    await wait(250);
    capturado = null;
    document.getElementById("btn-export").click();
    for (let i = 0; i < 80 && !capturado; i++) await wait(100);
    out[id] = capturado ? await resumoXlsx(capturado) : { erro: "nada exportado" };
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wait(150);
  }
  return out;
};
