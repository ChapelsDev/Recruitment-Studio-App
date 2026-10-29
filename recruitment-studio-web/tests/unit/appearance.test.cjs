// «Aparência»: theme and vibration settings, kept on the device.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('appearance.js');

const A = RS.appearance;
// A storage in memory, like localStorage.
const mem = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};

test('appearance: auto follows the device, a choice wins', () => {
  assert.equal(A.resolve('auto', true), 'dark'); assert.equal(A.resolve('auto', false), 'light');
  assert.equal(A.resolve('light', true), 'light'); assert.equal(A.resolve('dark', false), 'dark');
});

test('appearance: junk settings fall back to automatic with vibration on', () => {
  assert.deepEqual(A.load(mem({ 'rs-appearance': '{"theme":"neon","haptics":"x"}' })), { theme: 'auto', haptics: true, motion: null });
  assert.deepEqual(A.load(mem({ 'rs-appearance': 'not json' })), { theme: 'auto', haptics: true, motion: null });
  assert.deepEqual(A.load(mem()), { theme: 'auto', haptics: true, motion: null });
  assert.deepEqual(A.load({ getItem() { throw new Error('blocked'); } }), { theme: 'auto', haptics: true, motion: null });
});

test('appearance: saved settings come back', () => {
  const s = mem({}); A.save({ theme: 'dark', haptics: false, motion: 'sober' }, s);
  assert.deepEqual(A.load(s), { theme: 'dark', haptics: false, motion: 'sober' });
});

test('appearance: saving never throws', () => {
  assert.doesNotThrow(() => A.save({ theme: 'light', haptics: true }, { setItem() { throw new Error('full'); } }));
});

test('appearance: the bar colours of both themes', () => {
  assert.equal(A.KEY, 'rs-appearance');
  assert.deepEqual(A.DEFAULTS, { theme: 'auto', haptics: true, motion: null });
  assert.deepEqual(A.THEME_COLOR, { band: '#F25C05', surface: { light: '#FFFFFF', dark: '#292D32' } });
});

// «Balão» (2026-10-28): the home's orange band runs under the status bar; the editor's is the surface colour.
const barPage = () => {
  const metas = [{ content: '' }, { content: '' }];
  return { metas, doc: { documentElement: { dataset: {} }, querySelectorAll: () => metas, head: null } };
};
const plainWin = { matchMedia: () => ({ matches: false }) };
const colours = (metas) => metas.map((m) => m.content.toLowerCase());

test("appearance: setBar('band') paints every theme-color orange", () => {
  const { metas, doc } = barPage();
  const before = A.get();
  try {
    A.set({ theme: 'dark' });
    A.setBar('band', doc, plainWin);
    assert.deepEqual(colours(metas), ['#f25c05', '#f25c05']);
  } finally { A.set(before); A.setBar('surface', doc, plainWin); }
});

test("appearance: setBar('surface') follows the theme", () => {
  const { metas, doc } = barPage();
  const before = A.get();
  try {
    A.set({ theme: 'light' });
    A.setBar('surface', doc, plainWin);
    assert.deepEqual(colours(metas), ['#ffffff', '#ffffff']);
    A.set({ theme: 'dark' });
    A.apply(doc, plainWin);
    assert.deepEqual(colours(metas), ['#292d32', '#292d32']);
  } finally { A.set(before); }
});

test('appearance: only an installed app opens on the system\'s splash', () => {
  const win = (standalone) => ({ matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' && standalone }) });
  assert.equal(A.fromSplash(win(true), { protocol: 'https:' }), true, 'the installed app');
  assert.equal(A.fromSplash(win(false), { protocol: 'https:' }), false, 'a browser tab');
  assert.equal(A.fromSplash(win(true), { protocol: 'file:' }), false, 'the .exe window (an app window without a splash)');
  assert.equal(A.fromSplash({}, { protocol: 'https:' }), false);
});

test('appearance: the motion style — Ilustrativo on a new device, Calmo when it asks for less motion, a choice wins', () => {
  assert.equal(A.resolveMotion(null, false), 'illustrative');
  assert.equal(A.resolveMotion(null, true), 'calm');
  assert.equal(A.resolveMotion('sober', true), 'sober');
  assert.equal(A.resolveMotion('illustrative', true), 'illustrative');
  assert.equal(A.resolveMotion('calm', false), 'calm');
  assert.equal(A.resolveMotion('neon', false), 'illustrative');
  assert.deepEqual(A.MOTIONS, ['illustrative', 'sober', 'calm']);
  assert.equal(A.load(mem({ 'rs-appearance': '{"motion":"neon"}' })).motion, null, 'an unknown style is no choice');
});

test('appearance: <html data-motion> follows the choice, or the device while nothing is chosen', () => {
  const page = () => ({ documentElement: { dataset: {} }, querySelectorAll: () => [], head: null });
  const win = (reduced) => ({ matchMedia: (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' && reduced }) });
  const before = A.get();
  try {
    A.set({ motion: null });
    let d = page(); A.apply(d, win(false)); assert.equal(d.documentElement.dataset.motion, 'illustrative');
    d = page(); A.apply(d, win(true)); assert.equal(d.documentElement.dataset.motion, 'calm');
    A.set({ motion: 'sober' });
    d = page(); A.apply(d, win(true)); assert.equal(d.documentElement.dataset.motion, 'sober');
    A.set({ motion: 'neon' });
    assert.equal(A.get().motion, 'sober', 'junk keeps the current choice');
  } finally { A.set(before); }
});

// deferred minor (2026-10-29): the start screen is orange, so its status bar is too until a screen chooses
test('appearance: on start the status bar is orange until a screen chooses', () => {
  // a fresh copy of the script, as a page load gets (the other cases keep theirs)
  const file = require.resolve('../../js/appearance.js');
  delete require.cache[file];
  require(file);
  const fresh = RS.appearance;
  RS.appearance = A;
  const { metas, doc } = barPage();
  fresh.apply(doc, plainWin);
  assert.deepEqual(colours(metas), ['#f25c05', '#f25c05']);
});
