// Offline cache, used only when the app is served over http(s) (e.g. installed
// on a phone). tools/build-web.mjs rewrites CACHE and CORE for each publish, so
// phones pick up new versions by themselves.
const CACHE = 'recruitment-studio-v34';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './assets/app.css', './assets/fonts.css', './assets/icons/icon-32.png', './assets/icons/icon-64.png', './assets/icons/icon-180.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './vendor/htm-preact.umd.js', './vendor/qrcode.js', './vendor/mp4-muxer.js',
  './js/appearance.js', './js/icons.js', './js/util.js', './js/trades.js', './js/model.js', './js/contact.js', './js/workflow.js', './js/workflow-ui.js', './js/motion-timeline.js', './js/engine.js', './js/templates.js', './js/motion-kit.js', './js/motion.js', './js/recipes/tijolo.js', './js/recipes/pixel.js', './js/recipes/planta.js', './js/recipes/apresentacao.js', './js/recipes/colagem.js', './js/recipes/numeros.js', './js/recipes/partidas.js', './js/recipes/notificacoes.js', './js/recipes/grua.js', './js/recipes/contrato.js', './js/recipes/cracha.js', './js/recipes/fita.js', './js/recipes/esteira.js', './js/slides.js', './js/sound.js', './js/store.js', './js/video.js', './js/install.js', './js/haptics.js', './js/phone.js', './js/frame-meter.js', './js/ui-motion.js', './js/reuse.js', './js/production.js', './js/production-ui.js', './js/carousel-ui.js', './js/app.js',
  './photos/library.js', './js/backup.js', './js/carousel-art.js',
];

let preparing = null, preparationErrors = [];
const progressPorts = new Set();
async function photoURLs(cache) {
  const index = await cache.match('./photos/library.js');
  if (!index?.ok) return null;
  return [...new Set([...(await index.clone().text()).matchAll(/"id"\s*:\s*"([a-zA-Z0-9_-]+)"/g)].map((m) => `./photos/full/${m[1]}.js`))];
}
async function offlineStatus() {
  const cache = await caches.open(CACHE), urls = await photoURLs(cache);
  const count = async (list) => (await Promise.all(list.map(async (url) => !!(await cache.match(url))?.ok))).filter(Boolean).length;
  const coreReady = await count(CORE), photosReady = await count(urls || []);
  const errors = [];
  for (const error of preparationErrors) if (!error.url || !(await cache.match(error.url))?.ok) errors.push(error);
  return { version: CACHE, coreReady, coreTotal: CORE.length, appReady: coreReady === CORE.length,
    photosReady, photosTotal: urls?.length ?? null, running: !!preparing, errors };
}
async function broadcastStatus() {
  const state = await offlineStatus(), message = { type: 'rs-offline-status', state };
  for (const port of progressPorts) { try { port.postMessage(message); } catch {} }
  for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage(message);
  return state;
}
function prepareOffline() {
  if (preparing) return preparing;
  preparationErrors = [];
  preparing = (async () => {
    const cache = await caches.open(CACHE);
    async function ensure(url) {
      if ((await cache.match(url))?.ok) return;
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(new Request(url, { cache: 'reload', signal: controller.signal }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await cache.put(url, res);
      } catch (e) { preparationErrors.push({ url, reason: e.name === 'AbortError' ? 'A ligação demorou demasiado.' : e.name === 'QuotaExceededError' ? 'Não há espaço disponível no navegador.' : e.name === 'TypeError' ? 'Falha de ligação. Tente novamente com rede.' : e.message || 'Não foi possível obter este recurso.' }); }
      finally { clearTimeout(timer); }
      await broadcastStatus();
    }
    await broadcastStatus();
    for (const url of CORE) await ensure(url);
    const photos = await photoURLs(cache);
    if (photos) for (const url of photos) await ensure(url);
  })().catch((e) => { preparationErrors.push({ url: '', reason: e.message || 'Não foi possível preparar os recursos.' }); }).finally(async () => {
    preparing = null; await broadcastStatus();
  });
  return preparing;
}
self.addEventListener('message', (e) => {
  const command = typeof e.data === 'string' ? e.data : e.data?.type, port = e.ports?.[0];
  if (!['cache-photos', 'rs-offline-prepare', 'rs-offline-query'].includes(command)) return;
  if (port) progressPorts.add(port);
  e.waitUntil((async () => {
    try {
      if (command !== 'rs-offline-query') await prepareOffline();
      const state = await offlineStatus(); port?.postMessage({ type: 'rs-offline-status', state, done: true });
    } catch (error) { port?.postMessage({ error: error.message, done: true }); }
    finally { if (port) { progressPorts.delete(port); port.close(); } }
  })());
});

// `cache: 'reload'`: the new copy comes from the server, never from the
// browser's HTTP cache (some servers let it keep old files for a while).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('recruitment-studio-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache first; anything else (photos of the library) is cached the first time it is used.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(e.request)) || fetch(e.request).then((res) => {
    if (res.ok) e.waitUntil(cache.put(e.request, res.clone()).catch(() => {}));
    return res;
  })));
});

