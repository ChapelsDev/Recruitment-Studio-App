// The carousel piece's data (v2): defaults, the Codex v1 migration, cleaning,
// the recipe behind «Do anúncio», the cover, recommendations, the offer default.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js');
const M = RS.model;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => M.newProject(TPL);

test('a new carousel is «Do anúncio» with the defaults', () => {
  const p = project();
  assert.deepEqual(M.cleanCarousel(undefined, p), { ...M.DEFAULT_CAROUSEL, style: 'ad' });
  assert.equal(M.DEFAULT_CAROUSEL.v, 2);
  assert.equal(M.DEFAULT_CAROUSEL.format, 'portrait');
});

test('a new carousel starts from the video when the video uses one of the six styles', () => {
  const p = project();
  Object.assign(p.video, { motion: 'numeros', bg: 'light', accent: '#FF0000', colors: 'brand', font: 'elegant' });
  const c = M.cleanCarousel(undefined, p);
  assert.equal(c.style, 'numeros'); assert.equal(c.bg, 'light'); assert.equal(c.accent, '#FF0000');
  assert.equal(c.colors, 'brand'); assert.equal(c.font, 'elegant');
});

test('a Codex v1 carousel maps its direction to a recipe and keeps everything under legacy', () => {
  const p = project();
  const v1 = { v: 1, style: 'workshop', variation: 3, locales: { 'pt-PT': { slides: [{ id: 's1', title: 'A', text: 'B' }], source: 'x' } } };
  const c = M.cleanCarousel(v1, p);
  assert.equal(c.style, 'tijolo'); assert.equal(c.v, 2);
  assert.deepEqual(c.legacy, v1);
  assert.equal('locales' in c, false);
  const map = { editorial: 'apresentacao', blueprint: 'planta', signal: 'numeros', workshop: 'tijolo', collage: 'notificacoes', atelier: 'contrato', auto: 'ad' };
  for (const [from, to] of Object.entries(map)) assert.equal(M.cleanCarousel({ v: 1, style: from, locales: {} }, p).style, to, from);
});

test('cleaning drops unknown values and keeps block keys known and unique', () => {
  const p = project();
  const c = M.cleanCarousel({ v: 2, style: 'zz', format: 'huge', cover: 'nope', extra: [{ id: 'a' }, { id: 7 }, ...Array.from({ length: 12 }, (_, i) => ({ id: `e${i}` }))],
    blocks: { order: ['H', 'Q', 'D', 'H', 'x:a', 'x:gone'], hidden: ['M', 'M', 'zz', 'x:a'] } }, p);
  assert.equal(c.style, 'ad'); assert.equal(c.format, 'portrait'); assert.equal(c.cover, 'style');
  assert.ok(c.extra.length <= 10); assert.ok(c.extra.every((x) => typeof x.id === 'string'));
  assert.deepEqual(c.blocks.order, ['H', 'D', 'x:a']);
  assert.deepEqual(c.blocks.hidden, ['M', 'x:a']);
});

test('3:4 exists for the carousel only; the image formats are unchanged', () => {
  assert.deepEqual(M.FORMATS.feed34, { id: 'feed34', w: 1080, h: 1440, label: '3:4', hint: 'Carrossel 3:4', icon: 'rectangle-vertical' });
  assert.deepEqual(M.FORMAT_ORDER, ['square', 'portrait', 'story']);
  assert.deepEqual(M.CAROUSEL_FORMATS, ['portrait', 'square', 'feed34', 'story']);
  assert.deepEqual(M.CAROUSEL_STYLE_IDS, ['tijolo', 'numeros', 'contrato', 'notificacoes', 'planta', 'apresentacao']);
  assert.deepEqual(M.CAROUSEL_BLOCKS, ['H', 'D', 'I', 'M', 'L', 'V', 'C', 'F', 'K']);
  assert.equal(M.CAROUSEL_BLOCK_LABELS.V, 'Momento do estilo');
});

test('«Do anúncio» uses the recipe of the template and the poster as cover, except in 3:4', () => {
  const p = M.normalize(project());
  assert.equal(M.carouselRecipe(p), M.TEMPLATE_RECIPE.diagonal);
  assert.equal(M.carouselCover(p), 'poster');
  p.carousel.format = 'feed34';
  assert.equal(M.carouselCover(p), 'style');
  p.carousel = { ...p.carousel, style: 'planta', cover: 'poster', format: 'portrait' };
  assert.equal(M.carouselRecipe(p), 'planta'); assert.equal(M.carouselCover(p), 'poster');
  p.template = 'unknown'; p.carousel.style = 'ad';
  assert.equal(M.carouselRecipe(p), 'apresentacao');
});

test('new ads show the offer sheet on the image; old ads keep theirs', () => {
  assert.equal(project().offer.visibility.image, true);
  const old = project(); delete old.offer.visibility;
  assert.equal(M.normalize(old).offer.visibility.image, false);
});

test('every project gets a v2 carousel and normalizing twice changes nothing', () => {
  const p = project(); delete p.carousel;
  assert.equal(M.normalize(p).carousel.v, 2);
  const v1 = project(); v1.carousel = { v: 1, style: 'atelier', variation: 1, locales: {} };
  const once = M.normalize(v1);
  assert.deepEqual(M.normalize(once), once);
  assert.equal(once.carousel.style, 'contrato');
});

test('recommendations follow the content', () => {
  const p = project();
  p.offer = { ...p.offer, salary: '1900' };
  assert.equal(M.recommendCarousel(p, 'pt-PT')[0], 'numeros');
  const q = project();
  q.texts['pt-PT'].positions = ['A', 'B', 'C', 'D'].map((x) => M.item(x));
  assert.ok(M.recommendCarousel(q, 'pt-PT').includes('contrato'));
  const r = project();
  assert.ok(M.recommendCarousel(r, 'pt-PT', { photos: false }).includes('planta'));
  assert.ok(M.recommendCarousel(r, 'pt-PT', { photos: false }).includes('tijolo'));
  assert.ok(M.recommendCarousel(r, 'pt-PT', { photos: true }).includes('notificacoes'));
  const all = M.recommendCarousel(p, 'pt-PT', { photos: true });
  assert.equal(new Set(all).size, all.length);
});

// Final review (2026-10-27): history snapshots and not-yet-opened ads keep the
// raw Codex v1 shape; clean-up and backups must still see its slide photos.
test('the asset bookkeeping sees the photos of a raw (not yet migrated) Codex v1 carousel', () => {
  const p = project();
  p.carousel = { v: 1, style: 'blueprint', locales: { 'pt-PT': { source: '', slides: [{ id: 'a', kind: 'cover', title: 'Capa', text: 'x', layout: 'bottom', photo: { asset: 'raw-slide', zoom: 1 } }] } } };
  assert.ok(M.carouselAssetIds(p).includes('raw-slide'), 'a raw v1 slide photo is not kept alive');
  M.remapCarouselAssets(p, (id) => (id === 'raw-slide' ? 'new-id' : id));
  assert.equal(p.carousel.locales['pt-PT'].slides[0].photo.asset, 'new-id');
});
