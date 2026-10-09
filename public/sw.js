// Service worker do Traço Integrado (v1.13).
//
// Antes (v1.0–v1.8) ele só repassava tudo para a rede: o app não abria sem
// sinal na obra e baixava tudo de novo a cada visita. Agora:
//  - Página (index.html, navegação): REDE PRIMEIRO. Com sinal, sempre vem a
//    versão nova; sem sinal, abre a última versão guardada.
//  - /assets/* (JS/CSS com hash no nome, nunca mudam): CACHE PRIMEIRO.
//  - Modelos .xlsx, ícones, manifest: rede primeiro, cache como reserva.
//  - Firestore, Auth, Cloudinary e qualquer outro domínio, e tudo que não for
//    GET: não passa pelo service worker (o Firestore tem o próprio cache).
const VERSAO = "traco-v1.32";
const CACHE_ASSETS = VERSAO + "-assets";
const CACHE_PAGINAS = VERSAO + "-paginas";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function redePrimeiro(req, cacheNome) {
  const cache = await caches.open(cacheNome);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    const guardada = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (guardada) return guardada;
    if (req.mode === "navigate") { const raiz = await cache.match("/"); if (raiz) return raiz; }
    throw e;
  }
}
async function cachePrimeiro(req) {
  const cache = await caches.open(CACHE_ASSETS);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const resp = await fetch(req);
  if (resp && resp.ok) cache.put(req, resp.clone());
  return resp;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Firestore/Auth/CDN: direto
  if (url.pathname.startsWith("/__/")) return;               // config reservada do Hosting
  if (url.pathname.startsWith("/assets/")) { event.respondWith(cachePrimeiro(req)); return; }
  event.respondWith(redePrimeiro(req, CACHE_PAGINAS));
});
