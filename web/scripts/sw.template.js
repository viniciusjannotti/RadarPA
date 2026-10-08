// Service worker do Radar PA — TEMPLATE. O build gera public/sw.js trocando
// __VERSAO__ por uma versão única (scripts/gerar-sw.ts); não edite public/sw.js.
//
// Política de privacidade do cache: NADA com dados (páginas autenticadas, /api) é
// guardado — depois de "Sair", nada fica legível no aparelho. Só entram em cache os
// assets estáticos com hash, os ícones e a página /offline. Cada build tem seu próprio
// cache e o do build anterior é apagado na ativação (sem acúmulo nem /offline velha).
const VERSAO = "__VERSAO__";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function ehAssetEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: sempre rede; sem rede, a página offline (nunca uma página antiga com dados).
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Assets estáticos: cache primeiro (com hash no nome; ícones mudam junto com a versão).
  if (ehAssetEstatico(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          // Só respostas completas (206 parcial quebraria o put); falha de cota não
          // pode derrubar a resposta, e o waitUntil mantém o SW vivo até gravar.
          if (res.status === 200) {
            const copia = res.clone();
            event.waitUntil(
              caches
                .open(VERSAO)
                .then((cache) => cache.put(req, copia))
                .catch(() => {}),
            );
          }
          return res;
        });
      }),
    );
  }
  // Todo o resto (inclusive /api e payloads RSC): rede, sem cache.
});
