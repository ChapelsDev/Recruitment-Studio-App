const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'workflow.js', 'production.js');
const M = RS.model, P = RS.production;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const measure = (s, size) => Array.from(s).length * size * .53;
const project = () => M.addLocale(M.newProject(TPL), 'fr', 'pt-PT');
const authored = (p) => P.authored(p, 'pt-PT').slides;
const edit = (p, action) => P.changeSlide(p, 'pt-PT', action);

test('custom carousel preserves automatic mode in other languages and accepts ordering, hiding and new content', () => {
  const p = project(), french = JSON.stringify(P.plan(p, 'fr', 'portrait', measure));
  P.personalize(p, 'pt-PT', 'portrait', measure);
  const first = authored(p)[0], second = authored(p)[1];
  edit(p, { type: 'patch', id: first.id, patch: { title: 'A nossa oportunidade', text: 'Texto exclusivo', layout: 'side' } });
  edit(p, { type: 'move', id: second.id, delta: -1 });
  assert.equal(authored(p)[0].id, second.id);
  edit(p, { type: 'patch', id: second.id, patch: { hidden: true } });
  const pages = P.plan(p, 'pt-PT', 'square', measure);
  assert.equal(pages[0].slideId, first.id); assert.equal(pages[0].bodyWidth, 548);
  assert.equal(pages.some((v) => v.slideId === second.id), false);
  edit(p, { type: 'add' }); assert.equal(authored(p).at(-1).title, 'Nova página');
  assert.equal(JSON.stringify(P.plan(p, 'fr', 'portrait', measure)), french);
  assert.equal(P.authored(M.normalize(p), 'pt-PT').slides[0].hidden, true);
  assert.equal(P.authored(M.removeLocale(p, 'fr'), 'fr'), null);
});

test('splitting and joining preserve text and distinct titles, keep QR on the last split and reject hidden joins', () => {
  const p = project(); P.personalize(p, 'pt-PT', 'portrait', measure);
  const id = authored(p)[0].id;
  edit(p, { type: 'patch', id, patch: { title: 'Primeira', text: 'Primeiro texto. Segundo texto.', qr: true } });
  edit(p, { type: 'split', id, at: 16 });
  assert.equal(authored(p)[0].qr, false); assert.equal(authored(p)[1].qr, true);
  edit(p, { type: 'patch', id: authored(p)[1].id, patch: { title: 'Segunda' } });
  edit(p, { type: 'join', id });
  assert.equal(authored(p)[0].text, 'Primeiro texto.\n\nSegunda\n\nSegundo texto.');
  assert.equal(authored(p)[0].qr, true);
  assert.throws(() => edit(p, { type: 'split', id, at: 0 }), /cursor/);
  edit(p, { type: 'patch', id: authored(p)[1].id, patch: { hidden: true } });
  assert.throws(() => edit(p, { type: 'join', id }), /Mostre/);
});

test('custom long text and calls paginate without ellipsis in both formats and every composition', () => {
  const p = project(); P.personalize(p, 'pt-PT', 'portrait', measure);
  const slide = authored(p)[0]; p.carousel.locales['pt-PT'].slides = [slide];
  slide.title = 'Uma chamada longa '.repeat(6).trim(); slide.text = 'Texto muito longo com 😀 e palavras. '.repeat(120).trim();
  for (const format of ['square', 'portrait']) for (const layout of Object.keys(M.CAROUSEL_LAYOUTS)) {
    slide.layout = layout;
    const pages = P.plan(p, 'pt-PT', format, measure);
    assert.ok(pages.length > 1);
    assert.equal(pages.flatMap((s) => s.lines).join(' ').replace(/\s+/g, ' '), slide.text);
    assert.equal(pages[0].titleLines.join(' '), slide.title);
    assert.ok(pages.every((s, i) => s.index === i + 1 && s.total === pages.length));
    assert.ok(pages.every((s) => s.lines.every((line) => measure(line, s.size) <= s.bodyWidth)));
    assert.ok(pages.every((s) => s.top + s.lines.length * s.lineHeight <= (s.photoRect && layout === 'bottom' ? s.photoRect.y - 40 : M.FORMATS[format].h - 135)));
  }
  slide.hidden = true; assert.throws(() => P.plan(p, 'pt-PT', 'square', measure), /pelo menos um/);
});

test('carousel review detects later contacts changes without overwriting personal pages', () => {
  const p = project(); P.personalize(p, 'pt-PT', 'portrait', measure);
  const before = JSON.stringify(authored(p)); p.texts['pt-PT'].contacts[0].text = 'novos@example.test';
  assert.ok(P.checks(p, { mode: 'carousel', locales: ['pt-PT'] }).some((v) => /carrossel personalizado/.test(v.text)));
  assert.equal(JSON.stringify(authored(p)), before);
  p.carousel.locales['pt-PT'].source = P.carouselSource(p, 'pt-PT');
  assert.equal(P.checks(p, { mode: 'carousel', locales: ['pt-PT'] }).some((v) => /carrossel personalizado/.test(v.text)), false);
});

test('new compositions keep body, photograph and QR apart in both formats', () => {
  const p = project();
  RS.engine = { qrText: () => 'https://example.test/candidatura' };
  P.personalize(p, 'pt-PT', 'portrait', measure);
  const slide = authored(p)[0]; p.carousel.locales['pt-PT'].slides = [slide];
  slide.title = 'Fale connosco'; slide.text = 'Equipa de construção\n\nemprego@example.test'; slide.kind = 'contact'; slide.qr = true;
  for (const format of ['portrait', 'square']) for (const layout of Object.keys(M.CAROUSEL_LAYOUTS)) {
    slide.layout = layout;
    for (const page of P.plan(p, 'pt-PT', format, measure)) {
      const bodyEnd = page.top + page.lines.length * page.lineHeight, panelTop = M.FORMATS[format].h - 410;
      assert.ok(bodyEnd <= panelTop - 40, `${format}/${layout}: copy clears QR`);
      if (layout === 'side') assert.ok(page.photoRect.y + page.photoRect.h <= panelTop - 40);
      assert.ok(page.lines.every((text) => measure(text, page.size) <= page.bodyWidth));
    }
  }
});

test('slide rendering uses its own photo and the shared crop/adjustment renderer; missing photos fail explicitly', async () => {
  const p = project(); P.personalize(p, 'pt-PT', 'portrait', measure);
  const s = authored(p)[0]; s.photo = { asset: 'own', zoom: 2, fx: .1, fy: .8, flip: true, adj: { b: .8, c: 1.4, s: .5 } };
  const own = { width: 1600, height: 900 }, calls = [], draws = [];
  RS.assets = { load: async (id) => id === 'own' ? own : null };
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 30 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args) => draws.push([key, ...args]), set: () => true });
  global.document = { createElement: () => ({ getContext: () => ctx }) };
  RS.engine = { setFont() {}, photo: (r, rect) => calls.push({ photo: r.project.photo, image: r.images.photo, rect }), drawQR() {} };
  const page = P.plan(p, 'pt-PT', 'portrait', measure)[0], images = await P.slideImages(p, page);
  P.renderSlide(p, page, images);
  assert.equal(calls[0].image, own); assert.deepEqual(calls[0].photo, s.photo);
  s.photo.asset = 'missing'; await assert.rejects(P.slideImages(p, { ...page, photo: s.photo }), /Falta/);
  assert.equal((await P.slideImages(p, { ...page, photo: false })).photo, null);
});
