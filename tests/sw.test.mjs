// Teste do service worker (public/sw.js) com rede e cache simulados: node tests/sw.test.mjs
import fs from "node:fs";
let online = true, ouvintes = {}, falhas = 0;
const lojas = new Map();
const caches = {
  async open(n) { if (!lojas.has(n)) lojas.set(n, new Map()); const m = lojas.get(n);
    return { put: async (req, resp) => m.set(new URL(req.url || req, "http://x").pathname, resp), match: async (req) => m.get(new URL(req.url || req, "http://x").pathname) }; },
  async keys() { return [...lojas.keys()]; }, async delete(n) { return lojas.delete(n); },
};
let versaoServidor = "A";
const fetch = async (req) => { if (!online) throw new TypeError("offline"); return { ok: true, corpo: versaoServidor + ":" + new URL(req.url).pathname, clone() { return this; } }; };
const self = { location: { origin: "http://x" }, addEventListener: (t, f) => (ouvintes[t] = f), skipWaiting() {}, clients: { claim: async () => {} } };
new Function("self", "caches", "fetch", "URL", fs.readFileSync("public/sw.js", "utf8"))(self, caches, fetch, URL);
const pedir = async (url, extra = {}) => { let p = null; ouvintes.fetch({ request: { url, method: "GET", mode: "cors", ...extra }, respondWith: (x) => (p = x) }); return p ? p.then((r) => r.corpo, (e) => "ERRO") : "IGNORADO"; };
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) falhas++; };

ok(await pedir("http://x/", { mode: "navigate" }) === "A:/", "online: página vem da rede");
versaoServidor = "B";
ok(await pedir("http://x/", { mode: "navigate" }) === "B:/", "versão nova publicada aparece na hora (rede primeiro)");
ok(await pedir("http://x/assets/index-1.js") === "B:/assets/index-1.js", "asset baixado");
versaoServidor = "C";
ok(await pedir("http://x/assets/index-1.js") === "B:/assets/index-1.js", "asset com hash vem do cache (não baixa de novo)");
online = false;
ok(await pedir("http://x/?v=2", { mode: "navigate" }) === "B:/", "sem sinal: abre a última versão guardada");
ok(await pedir("http://x/assets/index-1.js") === "B:/assets/index-1.js", "sem sinal: JS do cache");
ok(await pedir("http://x/assets/nunca-baixado.js") === "ERRO", "sem sinal e sem cache: erro normal de rede");
ok(await pedir("https://firestore.googleapis.com/x") === "IGNORADO", "Firestore não passa pelo service worker");
ok(await pedir("http://x/api", { method: "POST" }) === "IGNORADO", "POST não passa pelo service worker");
ok(await pedir("http://x/__/firebase/init.json") === "IGNORADO", "/__/ do Hosting ignorado");
lojas.set("traco-v1.15-assets", new Map()); lojas.set("traco-v1.1-assets", new Map());
await new Promise((r) => ouvintes.activate({ waitUntil: (p) => p.then(r) }));
ok(!lojas.has("traco-v1.15-assets") && !lojas.has("traco-v1.1-assets") && lojas.has("traco-v1.16-assets"), "caches de versões antigas são limpos");
console.log(falhas ? falhas + " falha(s)" : "Tudo certo."); process.exit(falhas ? 1 : 0);
