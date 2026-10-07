// Service worker mínimo do Traço Integrado.
// Único propósito: satisfazer o requisito de "instalável" dos navegadores
// (Chrome/Edge/Android) para que o botão "Instalar app" funcione e o app
// possa ser adicionado à tela de início. Não faz cache de nada de propósito,
// para nunca servir uma versão antiga da ficha/app — sempre busca da rede.
self.addEventListener("install", function(event){
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function(event){
  event.respondWith(fetch(event.request));
});
