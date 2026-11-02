// Test helper (not shipped): the whole app in happy-dom with a simulated
// drawing engine (as tests/unit/recovery-ui.test.cjs does), for the interface
// tests of the 2026-10-27 round. Real canvas drawing is tested in Edge.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await pause(20); }
  throw new Error(`Timed out: ${label}`);
}
const SCRIPTS = ['appearance', 'util', 'trades', 'model', 'contact', 'workflow', 'workflow-ui', 'reuse', 'production', 'production-ui', 'carousel-ui', 'motion-timeline', 'slides', 'icons', 'install', 'haptics', 'phone', 'frame-meter', 'ui-motion'];
async function app(t, width = 1280, configure = () => {}) {
  const { Window } = await import('happy-dom');
  const errors = [];
  const w = new Window({ url: 'https://studio.test/', width, height: 900,
    console: { ...console, error: (...args) => errors.push(args.join(' ')) },
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableJavaScriptFileLoading: true, enableImageFileLoading: false, enableCSSFileLoading: false } });
  t.after(async () => { await w.happyDOM.close(); });
  Object.defineProperty(w, 'indexedDB', { value: new IDBFactory() });
  w.fetch = async () => { throw new Error('Network is disabled in UI tests'); };
  w.localStorage.setItem('rs-appearance', JSON.stringify({ theme: 'light', motion: 'calm', haptics: false }));
  w.sessionStorage.setItem('rs-intro', '1');
  w.document.body.innerHTML = '<div id="app"></div>';
  const load = (f) => w.eval(fs.readFileSync(path.join(__dirname, '../..', f), 'utf8'));
  load('vendor/htm-preact.umd.js');
  for (const f of SCRIPTS) load(`js/${f}.js`);
  const RS = w.RS;
  const report = { shrink: 1, photoUpscale: 0 };
  RS.engine = { SAFE: { top: 200, bottom: 300 }, loadFonts: async () => {}, setFont() {},
    render: () => ({ report, regions: [], photo: null }),
    renderToCanvas: () => ({ report, canvas: { toDataURL: () => 'data:image/png;base64,eA==' } }),
  };
  const context = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => context;
  load('js/templates.js'); load('js/templates-bold.js'); load('js/motion.js'); load('js/store.js'); load('js/backup.js');
  RS.library.index = async () => ({ items: [] });
  RS.video = { support: async () => ({ method: null }) };
  const p = RS.model.addLocale(RS.model.newProject(RS.templates.list[0]), 'fr', 'pt-PT');
  p.locale = 'pt-PT'; p.name = 'Anúncio de teste'; p.nameAuto = false; // a name typed by hand
  await configure(p, RS, w);
  await RS.store.putProject(p);
  load('js/app.js');
  const $ = (sel) => w.document.querySelector(sel);
  const $$ = (sel) => [...w.document.querySelectorAll(sel)];
  const button = (sel, text) => $$(sel).find((el) => text.test(el.textContent.trim()) || text.test(el.getAttribute('aria-label') || ''));
  const click = async (el) => { assert.ok(el, 'control must exist'); el.click(); await pause(30); };
  const type = async (el, value) => { el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); await pause(30); };
  const key = async (el, k, opts = {}) => { el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts })); await pause(30); };
  await until(() => $('.proj-open'), 'home');
  return { w, RS, p, $, $$, button, click, type, key, errors, until, pause };
}
module.exports = { app, until, pause };
