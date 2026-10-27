// The export dialog (2026-10-27, Task 10): it exports the piece on screen and
// starts from «Para onde?»; «Pacote completo» is the campaign package.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const piece = (a, name) => a.$$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === name);
async function openExport(a, name) {
  await a.click(a.$('.proj-open')); await a.until(() => a.$('.editor'), 'editor');
  if (name) await a.click(piece(a, name));
  await a.click(a.$('.topbar button[title="Exportar (Ctrl+E)"]'));
  return a.until(() => a.$('.modal.export'), 'the export dialog');
}
const destinations = (a) => a.$$('.modal.export [aria-label="Para onde?"] [role="radio"]');
const labels = (a) => destinations(a).map((b) => b.querySelector('strong').textContent.trim());

test('export: no «Imagem ou vídeo» switch; «Imagem» starts from its three destinations, the first chosen', async (t) => {
  const a = await app(t);
  await openExport(a);
  assert.ok(!a.$('.modal.export .kind-switch'), 'a.$(.modal.export .kind-switch) is still there');
  assert.deepEqual(labels(a), ['Feed Instagram/Facebook', 'Stories / Estado do WhatsApp', 'Quadrado']);
  assert.equal(destinations(a)[0].getAttribute('aria-checked'), 'true');
  assert.match(a.$('#exp-title').textContent, /Exportar imagem/);
});

test('export: with the carousel on screen, the four carousel destinations; TikTok says it needs 4 images when there are fewer', async (t) => {
  const a = await app(t, 1280, (p, RS) => {
    p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo' }, p);
    RS.slides = { ...RS.slides, prepare: (q, o) => ({ fmt: RS.model.FORMATS[o.format], locale: o.locale, slides: [{ key: 'H' }, { key: 'K' }, { key: 'M' }] }), render() {}, photos: async () => [] };
  });
  await openExport(a, 'Carrossel');
  assert.match(a.$('#exp-title').textContent, /Exportar carrossel/);
  assert.deepEqual(labels(a), ['Instagram carrossel', 'Facebook', 'TikTok (fotografias)', 'Stories / Estado do WhatsApp']);
  await a.click(destinations(a)[2]);
  await a.until(() => /O TikTok pede pelo menos 4 imagens\./.test(a.$('.modal.export').textContent), 'the TikTok warning');
  await a.click(destinations(a)[1]);
  await a.until(() => /grelha/.test(a.$('.modal.export').textContent), 'the Facebook note');
  // «Escolher formatos» opens the manual choice
  await a.click(a.$$('.modal.export button').find((b) => /Escolher formatos/.test(b.textContent)));
  assert.ok(a.$('.modal.export .export-formats input[type="checkbox"]'), 'no manual formats');
});

test('export: two quick ticks in «Escolher formatos» both count (the second does not undo the first)', async (t) => {
  const a = await app(t);
  await openExport(a);
  await a.click(a.$$('.modal.export button').find((b) => /Escolher formatos/.test(b.textContent)));
  const box = (label) => a.$$('.modal.export .export-formats label').find((l) => l.querySelector('strong').textContent.trim() === label).querySelector('input');
  const feed = box(a.RS.model.FORMATS.portrait.label), square = box(a.RS.model.FORMATS.square.label);
  assert.equal(feed.checked, true); assert.equal(square.checked, false);
  // both in the same instant, before the dialog draws again
  feed.click(); square.click();
  await a.pause(100);
  assert.equal(box(a.RS.model.FORMATS.portrait.label).checked, false, 'the first tick was undone');
  assert.equal(box(a.RS.model.FORMATS.square.label).checked, true, 'the second tick was lost');
});

test('export: «Pacote completo» opens the campaign package, without a carousel mode', async (t) => {
  const a = await app(t);
  await openExport(a);
  await a.click(a.$$('.modal.export button').find((b) => /Pacote completo/.test(b.textContent)));
  const box = await a.until(() => a.$('.production-dialog'), 'the package dialog');
  assert.match(box.textContent, /Pacote completo/);
  assert.equal(a.$$('.production-dialog button').some((b) => /^\s*Carrossel\s*$/.test(b.textContent)), false);
  assert.ok(!a.$('.production-dialog .carousel-art-direction'), 'a.$(.production-dialog .carousel-art-direction) is still there');
});
