// Texts per piece: the carousel and the video each follow the ad until changed
// («Só no carrossel» / «Só no vídeo»), with their own eyes; the carousel's
// closing line is its own, pre-filled from the video's when that one is on.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'motion-timeline.js');
const T = RS.motionTimeline, M = RS.model;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const L = 'pt-PT';
const project = () => {
  const p = M.newProject(TPL, { trades: ['pedreiro', 'servente'] });
  p.whatsapp = { country: '351', number: '912345678' };
  p.offer = { ...p.offer, salary: '1900', vacancies: '12' };
  return M.normalize(p);
};

test('the carousel follows the ad until changed, independently of the video', () => {
  const p = project();
  p.video.texts[L] = { headline: 'Só vídeo' };
  assert.equal(T.content(p, L, 'carousel').headline, p.texts[L].headline);
  p.carousel.texts[L] = { headline: 'Só carrossel' };
  assert.equal(T.content(p, L, 'carousel').headline, 'Só carrossel');
  assert.equal(T.content(p, L, 'video').headline, 'Só vídeo');
  assert.equal(p.texts[L].headline !== 'Só carrossel', true);
});

test('the carousel has its own eyes; by default it follows the image', () => {
  const p = project();
  p.show.benefits = false;
  assert.deepEqual(T.content(p, L, 'carousel').benefits, []);
  p.carousel.show = { benefits: true };
  assert.ok(T.content(p, L, 'carousel').benefits.length > 0);
  assert.equal(p.show.benefits, false);
});

test('carousel lists follow the image item by item', () => {
  const p = project();
  const first = p.texts[L].benefits[0];
  p.carousel.texts[L] = { benefits: { edits: { [first.id]: null }, added: [], order: null } };
  p.texts[L].benefits.push(M.iconItem('check', 'Alojamento pago'));
  const shown = T.content(p, L, 'carousel').benefits;
  assert.ok(shown.includes('Alojamento pago'));
  assert.ok(!shown.includes(first.text));
});

test('the carousel closing line is its own, else the video\'s when that one is on', () => {
  const p = project();
  assert.equal(T.carouselClosing(p, L), '');
  p.video.texts[L] = { closing: 'Na segunda' };
  assert.equal(T.carouselClosing(p, L), '');
  p.video.show = { ...p.video.show, closing: true };
  assert.equal(T.carouselClosing(p, L), 'Na segunda');
  p.carousel.texts[L] = { closing: 'Começa já' };
  assert.equal(T.carouselClosing(p, L), 'Começa já');
  assert.equal(T.content(p, L, 'carousel').closing, 'Começa já');
});

test('without a piece the content is the video\'s, exactly as before', () => {
  const p = project();
  p.video.texts[L] = { headline: 'Só vídeo', highlights: { edits: {}, added: [{ id: 'o1', role: 'own', value: '40 h', label: 'por semana' }], order: null } };
  const strip = (c) => JSON.parse(JSON.stringify(c));
  assert.deepEqual(strip(T.content(p, L)), strip(T.content(p, L, 'video')));
});

test('editing the image prunes carousel edits of items that are gone', () => {
  const p = project();
  const first = p.texts[L].benefits[0];
  p.carousel.texts[L] = { benefits: { edits: { [first.id]: 'Outra coisa' }, added: [], order: null } };
  p.texts[L].benefits = p.texts[L].benefits.slice(1);
  const q = M.pruneVideoTexts(p);
  // the only edit was of the gone item: nothing of it is left (the empty list goes too)
  assert.equal(((q.carousel.texts[L] || {}).benefits || { edits: {} }).edits[first.id], undefined);
  assert.equal(JSON.stringify(q.carousel.texts).includes('Outra coisa'), false);
});
