/* Uso do Cloudinary (v1.37): quanto do plano gratuito já foi gasto e o que
 * está guardado lá (fotos das NCs, plantas, PDFs).
 *
 * SÓ LEITURA: não apaga nem altera nada. A chave vem dos segredos do GitHub
 * (CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) e nunca é impressa.
 * Uso: node scripts/uso-cloudinary.mjs   (roda no workflow "Uso do Cloudinary")
 */
import fs from "node:fs";

const NUVEM = process.env.CLOUDINARY_CLOUD_NAME || "uyzrizru";
const CHAVE = process.env.CLOUDINARY_API_KEY, SEGREDO = process.env.CLOUDINARY_API_SECRET;
if (!CHAVE || !SEGREDO) { console.error("Faltam os segredos CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no GitHub."); process.exit(1); }
const AUT = "Basic " + Buffer.from(CHAVE + ":" + SEGREDO).toString("base64");
const api = async (caminho) => {
  const r = await fetch("https://api.cloudinary.com/v1_1/" + NUVEM + caminho, { headers: { Authorization: AUT } });
  if (!r.ok) throw new Error(caminho + " → HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
};
const mb = (b) => (b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";
const gb = (b) => (b / 1073741824).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " GB";
const linhas = [];
const diz = (t = "") => { linhas.push(t); console.log(t); };

const uso = await api("/usage");
const cred = uso.credits || {};
diz("## Uso do Cloudinary (" + NUVEM + ") — plano " + (uso.plan || "?"));
diz("Atualizado pelo Cloudinary em: " + (uso.last_updated || "?"));
diz("");
diz("| Item | Uso |");
diz("|---|---|");
diz("| **Créditos do mês** | **" + (cred.usage ?? "?") + " de " + (cred.limit ?? "?") + " (" + (cred.used_percent ?? "?") + "%)** |");
if (uso.storage) diz("| Guardado (storage) | " + gb(uso.storage.usage || 0) + " |");
if (uso.bandwidth) diz("| Baixado no mês (bandwidth) | " + gb(uso.bandwidth.usage || 0) + " |");
if (uso.transformations) diz("| Transformações no mês | " + (uso.transformations.usage ?? 0) + " |");
if (uso.resources != null) diz("| Arquivos guardados | " + uso.resources + " |");
diz("");

// o que está guardado, por tipo
const todos = [];
for (const tipo of ["image", "raw", "video"]) {
  let cursor = "";
  do {
    const r = await api("/resources/" + tipo + "?max_results=500" + (cursor ? "&next_cursor=" + encodeURIComponent(cursor) : ""));
    (r.resources || []).forEach((x) => todos.push({ tipo, id: x.public_id, formato: x.format || (x.public_id.split(".").pop()), bytes: x.bytes || 0, em: (x.created_at || "").slice(0, 10) }));
    cursor = r.next_cursor || "";
  } while (cursor);
}
const grupo = {};
todos.forEach((x) => { const k = x.tipo === "raw" ? "documento (" + x.formato + ")" : x.tipo + " (" + (x.formato || "?") + ")"; grupo[k] = grupo[k] || { n: 0, b: 0 }; grupo[k].n++; grupo[k].b += x.bytes; });
diz("### O que está guardado");
diz("| Tipo | Arquivos | Tamanho |");
diz("|---|---|---|");
Object.entries(grupo).sort((a, b) => b[1].b - a[1].b).forEach(([k, v]) => diz("| " + k + " | " + v.n + " | " + mb(v.b) + " |"));
diz("| **Total** | **" + todos.length + "** | **" + mb(todos.reduce((t, x) => t + x.bytes, 0)) + "** |");
diz("");
const porMes = {};
todos.forEach((x) => { const m = x.em.slice(0, 7) || "?"; porMes[m] = porMes[m] || { n: 0, b: 0 }; porMes[m].n++; porMes[m].b += x.bytes; });
diz("### Enviados por mês");
diz("| Mês | Arquivos | Tamanho |");
diz("|---|---|---|");
Object.keys(porMes).sort().forEach((m) => diz("| " + m + " | " + porMes[m].n + " | " + mb(porMes[m].b) + " |"));
diz("");
diz("### Os 15 maiores arquivos");
diz("| Arquivo | Tipo | Tamanho | Enviado em |");
diz("|---|---|---|---|");
todos.sort((a, b) => b.bytes - a.bytes).slice(0, 15).forEach((x) => diz("| " + x.id + " | " + x.formato + " | " + mb(x.bytes) + " | " + x.em + " |"));

if (Number(cred.used_percent) >= 80) {
  console.log("::warning::Cloudinary: " + cred.used_percent + "% dos créditos do mês já usados — hora de levar as plantas para o Drive.");
  diz(""); diz("⚠️ **Mais de 80% dos créditos do mês usados.**");
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join("\n") + "\n");
