// Offline cache, used only when the app is served over http(s) (e.g. installed
// on a phone). tools/build-web.mjs rewrites CACHE and CORE for each publish, so
// phones pick up new versions by themselves.
const CACHE = 'recruitment-studio-5cd6c3441b';
const CORE = [
  "./",
  "./assets/app.css",
  "./assets/app.ico",
  "./assets/brand/icon-maskable.svg",
  "./assets/brand/icon-small.svg",
  "./assets/brand/icon.svg",
  "./assets/fonts.css",
  "./assets/icons/icon-128.png",
  "./assets/icons/icon-16.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-24.png",
  "./assets/icons/icon-256.png",
  "./assets/icons/icon-32.png",
  "./assets/icons/icon-48.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-64.png",
  "./assets/icons/maskable-512.png",
  "./assets/screenshots/phone.png",
  "./assets/screenshots/wide.png",
  "./index.html",
  "./js/app.js",
  "./js/appearance.js",
  "./js/contact.js",
  "./js/engine.js",
  "./js/haptics.js",
  "./js/icons.js",
  "./js/install.js",
  "./js/model.js",
  "./js/motion-kit.js",
  "./js/motion-timeline.js",
  "./js/motion.js",
  "./js/recipes/apresentacao.js",
  "./js/recipes/colagem.js",
  "./js/recipes/contrato.js",
  "./js/recipes/cracha.js",
  "./js/recipes/esteira.js",
  "./js/recipes/fita.js",
  "./js/recipes/grua.js",
  "./js/recipes/notificacoes.js",
  "./js/recipes/numeros.js",
  "./js/recipes/partidas.js",
  "./js/recipes/pixel.js",
  "./js/recipes/planta.js",
  "./js/recipes/tijolo.js",
  "./js/sound.js",
  "./js/store.js",
  "./js/templates.js",
  "./js/trades.js",
  "./js/ui-motion.js",
  "./js/util.js",
  "./js/video.js",
  "./manifest.webmanifest",
  "./photos/library.js",
  "./vendor/htm-preact.umd.js",
  "./vendor/mp4-muxer.js",
  "./vendor/qrcode.js"
];

// After install, the page asks for the full photo library so everything works
// without a connection. Photos already cached are skipped.
async function cachePhotos() {
  const cache = await caches.open(CACHE);
  const index = (await cache.match('./photos/library.js')) || (await fetch('./photos/library.js'));
  if (!index || !index.ok) return;
  const ids = [...(await index.clone().text()).matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    const url = `./photos/full/${id}.js`;
    if (await cache.match(url)) continue;
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    } catch {
      return; // offline again: carry on next time
    }
  }
}
self.addEventListener('message', (e) => { if (e.data === 'cache-photos') e.waitUntil(cachePhotos()); });

// `cache: 'reload'`: the new copy comes from the server, never from the
// browser's HTTP cache (some servers let it keep old files for a while).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache first; anything else (photos of the library) is cached the first time it is used.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
