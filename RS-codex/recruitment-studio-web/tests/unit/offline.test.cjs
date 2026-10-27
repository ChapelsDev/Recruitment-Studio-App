const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function worker() {
  const root = 'https://studio.test/app/', listeners = {}, stores = new Map(), requests = [], messages = [], failures = new Set();
  const key = (url) => new URL(typeof url === 'string' ? url : url.url, root).href;
  const fetch = async (req) => {
    const url = key(req); requests.push(url);
    if (failures.has(url)) throw new TypeError('Network unavailable');
    return new Response(url.endsWith('/photos/library.js') ? 'RS.PHOTO_LIBRARY={"items":[{"id":"one"},{"id":"two"}]};' : 'resource', { status: 200 });
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map()); const rows = stores.get(name);
      return { match: async (u) => rows.get(key(u))?.clone(), put: async (u, r) => { rows.set(key(u), r.clone()); },
        addAll: async (urls) => { for (const u of urls) rows.set(key(u), (await fetch(u)).clone()); } };
    }, keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name),
  };
  const sandbox = { caches, fetch, URL, AbortController, setTimeout, clearTimeout,
    Request: class { constructor(url, options = {}) { this.url = key(url); Object.assign(this, options); } },
    self: { location: { origin: 'https://studio.test' }, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (msg) => messages.push(msg) }] } } };
  const context = vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8'), context);
  const name = vm.runInContext('CACHE', context);
  async function trigger(type, extra = {}) {
    const waits = []; let response;
    listeners[type]({ ...extra, waitUntil: (p) => waits.push(p), respondWith: (p) => { response = p; } });
    const res = response ? await response : undefined; await Promise.all(waits); return res;
  }
  async function message(type) { const replies = []; await trigger('message', { data: { type }, ports: [{ postMessage: (p) => replies.push(p), close() {} }] }); return replies.at(-1); }
  return { trigger, message, name, stores, requests, messages, failures, key, caches };
}

test('offline readiness measures shell and photos separately, reports interrupted preparation and resumes only missing resources', async () => {
  const w = worker(); let state = (await w.message('rs-offline-query')).state;
  assert.equal(state.appReady, false); assert.equal(state.photosTotal, null); assert.equal(w.requests.length, 0, 'checking must not download');
  await w.trigger('install'); state = (await w.message('rs-offline-query')).state;
  assert.equal(state.appReady, true); assert.equal(state.photosReady, 0); assert.equal(state.photosTotal, 2);
  w.failures.add(w.key('./photos/full/two.js')); const partial = await w.message('rs-offline-prepare');
  assert.equal(partial.done, true); assert.equal(partial.state.photosReady, 1); assert.equal(partial.state.running, false); assert.equal(partial.state.errors.length, 1);
  assert.ok(w.messages.some((m) => m.state.running));
  const before = w.requests.length; w.failures.clear(); const complete = await w.message('rs-offline-prepare');
  assert.equal(complete.state.photosReady, 2); assert.equal(complete.state.errors.length, 0);
  assert.deepEqual(w.requests.slice(before), [w.key('./photos/full/two.js')]);
});

test('activation preserves other apps caches and fetch uses only this version; cache eviction is reflected in readiness', async () => {
  const w = worker(); await w.trigger('install');
  await w.caches.open('other-app'); await w.caches.open('recruitment-studio-old'); await w.trigger('activate');
  assert.ok(w.stores.has('other-app')); assert.equal(w.stores.has('recruitment-studio-old'), false);
  const missing = w.key('./js/app.js'); w.stores.get(w.name).delete(missing);
  assert.equal((await w.message('rs-offline-query')).state.appReady, false);
  await (await w.caches.open('other-app')).put(missing, new Response('wrong-version'));
  const res = await w.trigger('fetch', { request: { method: 'GET', url: missing } });
  assert.equal(await res.text(), 'resource'); assert.equal((await w.message('rs-offline-query')).state.appReady, true);
});

test('offline bridge distinguishes disk copies and forwards actual worker progress without claiming availability early', async () => {
  const states = [], commands = [], handlers = {};
  class Channel {
    constructor() { this.port1 = { close() {}, onmessage: null }; this.port2 = { close() {}, postMessage: (data) => queueMicrotask(() => this.port1.onmessage({ data })) }; }
  }
  const worker = { postMessage: ({ type }, [port]) => { commands.push(type); port.postMessage({ state: { appReady: false, photosReady: 1, photosTotal: 2, running: true } }); port.postMessage({ state: { appReady: true, photosReady: 2, photosTotal: 2, running: false }, done: true }); } };
  const sandbox = { navigator: { serviceWorker: { controller: worker, getRegistration: async () => ({ active: worker }), addEventListener: (name, fn) => { handlers[name] = fn; } } }, location: { protocol: 'https:' }, MessageChannel: Channel, setTimeout, clearTimeout };
  sandbox.window = sandbox; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../js/install.js'), 'utf8'), sandbox);
  const stop = sandbox.RS.offline.subscribe((s) => states.push(s)); await sandbox.RS.offline.prepare();
  assert.ok(commands.includes('rs-offline-prepare')); assert.ok(states.some((s) => !s.appReady && s.running)); assert.equal(states.at(-1).controlled, true); stop();
  sandbox.location.protocol = 'file:'; assert.equal((await sandbox.RS.offline.check()).mode, 'file');
  sandbox.location.protocol = 'https:'; sandbox.navigator.serviceWorker = undefined; assert.equal((await sandbox.RS.offline.check()).mode, 'unavailable');
});
