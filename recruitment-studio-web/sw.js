// Offline cache, used only when the app is served over http(s) (e.g. installed
// on a phone). tools/build-web.mjs rewrites CACHE and CORE for each publish, so
// phones pick up new versions by themselves.
const CACHE = 'recruitment-studio-v3';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './assets/app.css', './assets/fonts.css', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './vendor/htm-preact.umd.js', './vendor/qrcode.js', './vendor/mp4-muxer.js',
  './js/appearance.js', './js/icons.js', './js/util.js', './js/trades.js', './js/model.js', './js/contact.js', './js/motion-timeline.js', './js/engine.js', './js/templates.js', './js/motion-kit.js', './js/motion.js', './js/recipes/tijolo.js', './js/recipes/pixel.js', './js/recipes/planta.js', './js/recipes/apresentacao.js', './js/recipes/colagem.js', './js/recipes/numeros.js', './js/recipes/partidas.js', './js/recipes/notificacoes.js', './js/recipes/grua.js', './js/recipes/contrato.js', './js/recipes/cracha.js', './js/recipes/fita.js', './js/recipes/esteira.js', './js/sound.js', './js/store.js', './js/video.js', './js/install.js', './js/haptics.js', './js/ui-motion.js', './js/app.js',
  './photos/library.js',
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
