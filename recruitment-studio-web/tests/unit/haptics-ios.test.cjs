// iPhone ticks (2026-10-29): the hidden switches go only where a finger never starts
// a scroll — the floating bar, the editor's floating controls, the player, the big
// buttons fixed under a sheet. Nothing inside a scrolling area gets one, so a
// scroll that starts on a card scrolls instead of opening it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function page(t) {
  const { Window } = require('happy-dom');
  const w = new Window({ url: 'https://studio.test/', width: 390, height: 844, settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
  w.localStorage.setItem('rs-appearance', JSON.stringify({ haptics: true }));
  for (const f of ['appearance.js', 'haptics.js']) w.eval(fs.readFileSync(path.join(__dirname, '../../js', f), 'utf8'));
  return w;
}
// (booleans in the asserts: a failing assert would print a whole happy-dom node and hang)
const tick = () => new Promise((r) => setTimeout(r, 0));

test('haptics-ios: switches only on the allowed controls', async (t) => {
  const w = await page(t), doc = w.document;
  doc.body.innerHTML = `<div class="editor"><header class="topbar"><button id="b">‹</button></header><nav class="rail"><button id="r">Oferta</button></nav>
    <aside class="panel"><button class="btn" id="p">Escolher</button><button class="motion-card" id="c">Tijolo</button></aside></div>
    <div class="home-main"><button class="proj-open" id="h">Eletricistas</button><button class="btn" id="hb">Novo</button></div>
    <div class="modal"><div class="export-body"><button class="btn" id="m">Feed</button></div><div class="export-actions"><button class="btn" id="s">Partilhar</button></div></div>`;
  const stop = w.RS.haptics.install(doc, { mode: 'ios' });
  try {
    for (const id of ['r', 'b']) assert.ok(doc.querySelector(`#${id} > .haptic-switch`), `#${id} keeps its tick`);
    for (const id of ['p', 'c', 'h', 'hb', 'm']) assert.equal(!!doc.querySelector(`#${id} > .haptic-switch`), false, `#${id} is inside a scrolling area`);
    assert.ok(doc.querySelector('#s > .haptic-switch'), 'the big action fixed under the sheet keeps its tick');
  } finally { stop(); await w.happyDOM.close(); }
});

test('haptics-ios: controls added later inside a panel stay bare', async (t) => {
  const w = await page(t), doc = w.document;
  doc.body.innerHTML = '<div class="editor"><aside class="panel"></aside><nav class="rail"></nav></div>';
  const stop = w.RS.haptics.install(doc, { mode: 'ios' });
  try {
    const b = doc.createElement('button'); b.className = 'btn'; doc.querySelector('.panel').appendChild(b);
    const r = doc.createElement('button'); doc.querySelector('.rail').appendChild(r);
    await tick();
    assert.equal(!!b.querySelector('.haptic-switch'), false, 'a panel button got a switch');
    assert.ok(r.querySelector('.haptic-switch'), 'a new floating-bar button got none');
  } finally { stop(); await w.happyDOM.close(); }
});

// deferred minor (2026-10-30): changes inside a scrolling area are not even scanned
test('haptics-ios: a change inside a panel is not scanned', async (t) => {
  const w = await page(t), doc = w.document;
  doc.body.innerHTML = '<div class="editor"><aside class="panel"><div id="box"></div></aside><nav class="rail"></nav></div>';
  const stop = w.RS.haptics.install(doc, { mode: 'ios' });
  try {
    const box = doc.getElementById('box');
    let scans = 0;
    const real = w.Element.prototype.querySelectorAll;
    w.Element.prototype.querySelectorAll = function (...x) { scans++; return real.apply(this, x); };
    try {
      for (let i = 0; i < 5; i++) { const d = doc.createElement('div'); d.innerHTML = '<span>texto</span>'; box.appendChild(d); }
      await tick();
    } finally { w.Element.prototype.querySelectorAll = real; }
    assert.equal(scans, 0, `a panel change was scanned ${scans} times`);
  } finally { stop(); await w.happyDOM.close(); }
});
