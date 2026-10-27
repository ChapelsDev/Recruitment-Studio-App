// Export by destination and the carousel's files (2026-10-27, Task 10).
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'reuse.js', 'production.js');
const M = RS.model, P = RS.production;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => M.addLocale(M.newProject(TPL), 'fr', 'pt-PT');
// the carousel drawn by a stand-in (real drawing is tested in Edge): n slides per language
function stubSlides(n) {
  RS.slides = { prepare: (p, o) => ({ fmt: M.FORMATS[o.format], locale: o.locale, slides: Array.from({ length: n }, (_, i) => ({ key: 'M', page: i })) }), render() {} };
}

test('destinations: each piece starts from where it goes (spec §5)', () => {
  const rows = (k) => P.DESTINATIONS[k].map((d) => [d.label, d.formats.join()]);
  assert.deepEqual(rows('image'), [['Feed Instagram/Facebook', 'portrait'], ['Stories / Estado do WhatsApp', 'story'], ['Quadrado', 'square']]);
  assert.deepEqual(rows('carousel'), [['Instagram carrossel', 'piece'], ['Facebook', 'portrait'], ['TikTok (fotografias)', 'story'], ['Stories / Estado do WhatsApp', 'story']]);
  assert.deepEqual(rows('video'), [['Reels / Stories / TikTok / Estado do WhatsApp', 'story'], ['Feed', 'portrait'], ['Quadrado', 'square']]);
  assert.match(P.DESTINATIONS.carousel[1].note, /grelha/);
  assert.equal(P.DESTINATIONS.carousel[2].minSlides, 4);
});

test('destinations: TikTok under 4 slides warns; Facebook says several photos publish as a grid', () => {
  assert.ok(P.destinationNotes('carousel', 'tiktok', 3).includes('O TikTok pede pelo menos 4 imagens.'));
  assert.equal(P.destinationNotes('carousel', 'tiktok', 4).includes('O TikTok pede pelo menos 4 imagens.'), false);
  assert.ok(P.destinationNotes('carousel', 'facebook', 7).some((n) => /grelha/.test(n)));
  assert.deepEqual(P.destinationNotes('image', 'feed', 1), []);
});

test('carousel files: numbered from 01 in each language, with the publication text', async () => {
  stubSlides(7);
  const p = project(); p.captions.fr = 'Publication';
  const drawn = [];
  const files = await P.carouselFiles(p, { locales: ['pt-PT', 'fr'], format: 'portrait', slideBlob: async (Pr, i, type) => { drawn.push([Pr.locale, i, type]); return new Blob(['x']); } });
  const names = files.map((f) => f.name);
  for (const l of ['pt-PT', 'fr']) {
    for (let i = 1; i <= 7; i++) assert.ok(names.includes(`${l}/carrossel/${String(i).padStart(2, '0')}.png`), `${l} ${i}: ${names.join()}`);
    assert.ok(names.includes(`${l}/publicacao.txt`));
  }
  assert.equal(drawn.length, 14);
  assert.equal(new TextDecoder().decode(files.find((f) => f.name === 'fr/publicacao.txt').bytes), 'Publication');
  const jpg = await P.carouselFiles(p, { locales: ['fr'], format: 'story', type: 'jpg', slideBlob: async () => new Blob(['x']) });
  assert.ok(jpg.some((f) => f.name === 'fr/carrossel/01.jpg'), jpg.map((f) => f.name).join());
});

test('campaign: its carousel has the same names, in the carousel\'s own format', async () => {
  stubSlides(5);
  const p = project(); p.carousel = M.cleanCarousel({ v: 2, style: 'tijolo', format: 'feed34' }, p);
  const formats = [];
  const result = await P.packageFiles(p, { mode: 'campaign', parts: { feed: false, story: false, cover: false, video: false, project: false, carousel: true, text: true } },
    { slideBlob: async (Pr) => { formats.push(Pr.fmt.id); return new Blob(['x']); }, carouselPhotos: async () => [] });
  const names = result.files.map((f) => f.name);
  assert.ok(names.includes('pt-PT/carrossel/01.png') && names.includes('fr/carrossel/05.png'), names.join());
  assert.ok(!names.some((n) => /carrossel\/00\d/.test(n)), names.join());
  assert.deepEqual([...new Set(formats)], ['feed34']);
  assert.equal(result.manifest.carouselFormat, 'feed34');
  assert.deepEqual({ ...result.manifest.slides }, { 'pt-PT': 5, fr: 5 });
});

test('the old carousel composer is gone (v1 pages live on only in carousel.legacy)', () => {
  for (const k of ['plan', 'renderSlide', 'slideImages', 'personalize', 'changeSlide', 'authored', 'carouselSource', 'artDirection']) assert.equal(P[k], undefined, k);
  assert.equal(M.CAROUSEL_LAYOUTS, undefined); assert.equal(M.CAROUSEL_STYLES, undefined);
});

test('a Codex v1 carousel opens with its style mapped and keeps its pages in legacy through save and reopen', () => {
  const p = project();
  p.carousel = { v: 1, style: 'blueprint', locales: { 'pt-PT': { source: '', slides: [{ id: 'a', kind: 'cover', title: 'Capa', text: 'Texto', layout: 'text', photo: null }] } } };
  const once = M.normalize(JSON.parse(JSON.stringify(p)));
  assert.equal(once.carousel.v, 2); assert.equal(once.carousel.style, 'planta');
  assert.equal(once.carousel.legacy.locales['pt-PT'].slides[0].text, 'Texto');
  const again = M.normalize(JSON.parse(JSON.stringify(once)));
  assert.equal(again.carousel.style, 'planta'); assert.equal(again.carousel.legacy.locales['pt-PT'].slides[0].text, 'Texto');
});
