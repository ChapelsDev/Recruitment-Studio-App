// Manual QA fixture. No mock fetch, cache, worker or application state.
// Do not publish; tools/build-web.mjs excludes tests/.
(() => {
  const state = document.getElementById('state');
  const events = document.getElementById('events');
  const evict = document.getElementById('evict');
  const allowed = location.origin === 'http://127.0.0.1:18973';
  let currentCache = null;
  const log = (value) => { events.textContent += `${new Date().toISOString()} ${JSON.stringify(value)}\n`; };
  async function inspect() {
    if (!allowed) throw new Error('Apenas a origem de teste autorizada.');
    const names = (await caches.keys()).filter((name) => /^recruitment-studio-v\d+$/.test(name));
    if (names.length !== 1) throw new Error(`Esperada uma cache ativa; encontradas: ${names.join(', ')}`);
    currentCache = names[0];
    const cache = await caches.open(currentCache);
    const photos = (await cache.keys()).filter((req) => new URL(req.url).pathname.startsWith('/photos/full/')).map((req) => req.url).sort();
    const registration = await navigator.serviceWorker.getRegistration('/');
    state.textContent = JSON.stringify({ origin: location.origin, cache: currentCache, worker: registration?.active?.scriptURL, photos: photos.length, firstPhotos: photos.slice(0, 2) }, null, 2);
    evict.disabled = photos.length < 2;
    return photos;
  }
  document.getElementById('inspect').onclick = () => inspect().catch((e) => { state.textContent = e.message; });
  evict.onclick = async () => {
    evict.disabled = true;
    try {
      const photos = await inspect();
      const cache = await caches.open(currentCache);
      const removed = [];
      for (const url of photos.slice(0, 2)) if (await cache.delete(url)) removed.push(url);
      log({ removed });
      await inspect();
    } catch (e) { state.textContent = e.message; }
  };
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'rs-offline-status') log(event.data.state);
  });
  inspect().catch((e) => { state.textContent = e.message; });
})();
