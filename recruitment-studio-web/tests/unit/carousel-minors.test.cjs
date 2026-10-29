// The carousel's small points left by the 2026-10-27 review (fixed 2026-10-28):
// the stage's press, the photo set, the style cards' photos, «Cancelar» on the
// ZIP, every palette in «Cores», nothing of the carousel worked out on «Imagem».
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const piece = (a, name) => a.$$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === name);
const railTab = (a, name) => a.$$('.rail [role="tab"]').find((b) => b.textContent.trim() === name);
// a photo style (the recipes are not loaded here): Notificações takes one photo
function photoStyle(RS) {
  const so = RS.motion.styleOf;
  RS.motion.styleOf = (id) => (id === 'notificacoes' ? { ...so('neon'), id, name: 'Notificações', recipe: { photos: 1 } } : so(id));
}
// the parts of the carousel's interface, drawn at once (no queue)
const parts = (a) => a.RS.carouselUI({ Icon: () => null, queueThumb: Object.assign((job, fn) => fn(), { cancel() {} }), afterPaint: async () => {} });
const mount = (a, vnode) => { const el = a.w.document.createElement('div'); a.w.document.body.appendChild(el); a.w.htmPreact.render(vnode, el); return el; };

test('carousel photos: the set is asked again once the ad\'s own photo has loaded (then kept)', async (t) => {
  const a = await app(t);
  photoStyle(a.RS);
  let asked = 0;
  a.RS.slides.photos = async (p, images) => { asked++; return images && images.photo ? ['own'] : []; };
  const ui = parts(a);
  const p = a.RS.model.normalize({ ...a.p, photo: { asset: 'a1' } });
  p.carousel = a.RS.model.cleanCarousel({ v: 2, style: 'notificacoes' }, p);
  assert.deepEqual(await ui.carouselPhotos(p, {}), []);
  assert.deepEqual(await ui.carouselPhotos(p, { photo: {} }), ['own']);
  await ui.carouselPhotos(p, { photo: {} });
  assert.equal(asked, 2);
});

test('carousel «Estilo»: the card of a photo style is drawn with the ad\'s photos', async (t) => {
  const a = await app(t);
  photoStyle(a.RS);
  let seen = null;
  a.RS.slides.photos = async () => ['own'];
  a.RS.slides.prepare = (q, o) => { seen = o.photos.full; return { fmt: a.RS.model.FORMATS.portrait, slides: [{ key: 'H', kind: 'H' }] }; };
  a.RS.slides.render = () => {};
  const ui = parts(a);
  const { html } = a.w.htmPreact;
  mount(a, html`<${ui.StyleCover} project=${a.RS.model.normalize(a.p)} images=${{ photo: {} }} style="notificacoes" />`);
  await a.until(() => seen, 'the card prepared');
  assert.deepEqual(seen, ['own']);
});

test('carousel stage: a press takes the pointer; a cancelled press is no swipe and no tap', async (t) => {
  const a = await app(t);
  const ui = parts(a);
  a.RS.slides.render = () => {};
  let fields = 0;
  const P = { fmt: a.RS.model.FORMATS.portrait, slides: [{ key: 'H', kind: 'H' }, { key: 'M', kind: 'M' }], carouselStyle: 'tijolo' };
  const { html } = a.w.htmPreact;
  const el = mount(a, html`<${ui.CarouselStage} project=${a.RS.model.normalize(a.p)} update=${() => {}} P=${P} mobile=${false} onField=${() => { fields++; }} />`);
  const c = await a.until(() => el.querySelector('.cs-main'), 'the stage');
  const captured = [];
  c.setPointerCapture = (id) => captured.push(id);
  const ev = (type, x) => c.dispatchEvent(new a.w.PointerEvent(type, { bubbles: true, pointerId: 7, clientX: x, clientY: 100 }));
  ev('pointerdown', 300);
  assert.deepEqual(captured, [7], 'the press did not take the pointer');
  ev('pointercancel', 300);
  ev('pointerup', 100);
  await a.pause(30);
  assert.match(el.querySelector('.cs-count').textContent.trim(), /^01/, 'a cancelled press moved the carousel');
  assert.equal(fields, 0);
  // a real swipe still moves it
  ev('pointerdown', 300); ev('pointerup', 100);
  await a.pause(30);
  assert.match(el.querySelector('.cs-count').textContent.trim(), /^02/);
});

test('export: a carousel ZIP being made can be cancelled; nothing is saved', async (t) => {
  let saved = 0, signal = null;
  const a = await app(t, 1280, (p, RS) => {
    p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo' }, p);
    RS.slides = { ...RS.slides, prepare: (q, o) => ({ fmt: RS.model.FORMATS[o.format], locale: o.locale, slides: [{ key: 'H' }, { key: 'K' }, { key: 'M' }] }), render() {}, photos: async () => [] };
    RS.production.carouselFiles = (q, o) => new Promise((resolve, reject) => {
      signal = o.signal || null;
      if (signal) signal.addEventListener('abort', () => { const e = new Error('Cancelado'); e.name = 'AbortError'; reject(e); });
    });
    RS.util.saveBlob = async () => { saved++; return true; };
  });
  await a.click(a.$('.proj-open')); await a.until(() => a.$('.editor'), 'editor');
  await a.click(piece(a, 'Carrossel'));
  await a.click(a.$('.topbar button[title="Exportar (Ctrl+E)"]'));
  await a.until(() => a.$('.modal.export'), 'the export dialog');
  await a.click(a.$('.modal.export .export-actions .btn.lg'));
  const cancel = await a.until(() => a.$$('.modal.export .export-actions button').find((b) => /Cancelar/.test(b.textContent)), '«Cancelar» while the ZIP is made');
  await a.click(cancel);
  await a.until(() => /Carrossel cancelado\./.test(a.w.document.body.textContent), 'the «Carrossel cancelado.» note');
  assert.ok(signal && signal.aborted, 'the making was not stopped');
  assert.equal(saved, 0);
  await a.until(() => !a.$$('.modal.export .export-actions button').some((b) => /Cancelar/.test(b.textContent)), 'the buttons back');
});

test('carousel «Estilo» › «Cores»: every ready palette is offered; a pick is saved', async (t) => {
  const a = await app(t);
  await a.click(a.$('.proj-open')); await a.until(() => a.$('.editor'), 'editor');
  await a.click(piece(a, 'Carrossel'));
  await a.click(railTab(a, 'Estilo'));
  await a.until(() => a.$('.cstyle-panel'), 'the style panel');
  const swatches = () => a.$$('.cstyle-panel [aria-label="Paletas prontas"] [role="radio"]');
  if (!swatches().length) {
    const head = a.$$('.cstyle-panel .group h3, .cstyle-panel .group button').find((x) => /^\s*Cores/.test(x.textContent));
    if (head) await a.click(head.closest('button') || head);
  }
  const list = await a.until(() => swatches().length && swatches(), 'the palettes');
  assert.equal(list.length, a.RS.model.PALETTES.length);
  const last = a.RS.model.PALETTES.at(-1);
  await a.click(list.at(-1));
  await a.until(async () => (await a.RS.store.getProject(a.p.id)).data.carousel?.colors === last.id, 'the palette saved');
});

test('editor: on «Imagem» nothing of the carousel is worked out while typing', async (t) => {
  const a = await app(t);
  await a.click(a.$('.proj-open')); await a.until(() => a.$('#f-headline'), 'editor');
  const J = a.w.JSON, real = J.stringify;
  let keyed = 0;
  J.stringify = function (v, ...rest) { if (Array.isArray(v) && v[0] && v[0].v === 2 && v[0].blocks) keyed++; return real.call(this, v, ...rest); };
  t.after(() => { J.stringify = real; });
  await a.type(a.$('#f-headline'), 'Outro título');
  await a.type(a.$('#f-headline'), 'Mais outro título');
  await a.pause(100);
  assert.equal(keyed, 0);
});
