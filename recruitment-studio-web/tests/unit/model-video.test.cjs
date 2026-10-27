// Offer fields (salary, vacancies) and the motion-video settings; old ads keep
// their animated poster.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js');

const M = RS.model;
const TPL = { id: 'diagonal', trade: 'obras', sample: 'construction', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const json = (o) => JSON.parse(JSON.stringify(o));

test('normalize: an old ad gets an empty offer and keeps its animated poster video', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  delete raw.offer;
  raw.video = { duration: 6, style: 'soft' };
  const p = M.normalize(raw);
  assert.deepEqual(p.offer, { salary: '', currency: '€', period: 'month', vacancies: '' });
  assert.equal(p.video.motion, 'poster');
  assert.equal(p.video.duration, 6);
  assert.equal(p.video.style, 'soft');
  assert.equal(p.video.sound, 'none'); // exported silent before, as before
});

test('normalize: an ad saved before videos existed also keeps the animated poster', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  delete raw.video;
  const p = M.normalize(raw);
  assert.equal(p.video.motion, 'poster');
  assert.equal(p.video.duration, 10);
});

test('normalize: unknown video values fall back; Curto is always 6 s', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { duration: 7, style: 'x', motion: 'curto', colors: 'x', accent: 'red', bg: 'x', font: 'nope', sound: 'loud', ownSound: 5 };
  const v = M.normalize(raw).video;
  assert.deepEqual(v, { duration: 6, style: 'dynamic', motion: 'curto', colors: 'style', accent: null, bg: 'dark', font: null, sound: 'generated', ownSound: null,
    show: { ...M.DEFAULT_VIDEO_SHOW }, texts: {}, hold: 2, photos: { mode: 'trades', ids: [] } });
  raw.video = { motion: 'neon', duration: 10, accent: '#C6F432', colors: 'brand', bg: 'light', font: 'bold', sound: 'own', ownSound: 'a1' };
  const w = M.normalize(raw).video;
  assert.equal(w.duration, 10);
  assert.equal(w.accent, '#C6F432');
  assert.equal(w.colors, 'brand');
  assert.equal(w.bg, 'light');
  assert.equal(w.sound, 'own');
  assert.equal(w.ownSound, 'a1');
});

test('normalize: a ready palette can colour the video', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'neon', duration: 15, colors: 'forest' };
  assert.equal(M.normalize(raw).video.colors, 'forest');
  raw.video.colors = 'no-such-palette';
  assert.equal(M.normalize(raw).video.colors, 'style');
});

test('normalize: own sound without a file falls back to the generated music', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'neon', duration: 15, sound: 'own', ownSound: null };
  assert.equal(M.normalize(raw).video.sound, 'generated');
});

test('newProject: Néon, «Automática», generated sound, empty offer', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  assert.equal(p.video.motion, 'neon');
  assert.equal(p.video.duration, 'auto');
  assert.equal(p.video.sound, 'generated');
  assert.equal(p.video.colors, 'style');
  assert.equal(p.video.bg, 'dark');
  assert.deepEqual(p.offer, { salary: '', currency: '€', period: 'month', vacancies: '' });
});

test('offerText: salary with its period and the vacancies, in the ad language', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
  assert.equal(M.offerText(p, 'pt-PT'), '1900 € por mês · 30 vagas');
  p.offer = { salary: '5200', currency: 'CHF', period: 'month', vacancies: '3' };
  assert.equal(M.offerText(p, 'de-CH'), 'CHF 5200 pro Monat · 3 Stellen');
  p.offer = { salary: '18', currency: '€', period: 'hour', vacancies: '' };
  assert.equal(M.offerText(p, 'en'), '€18 per hour');
  p.offer = { salary: '', currency: '€', period: 'month', vacancies: '1' };
  assert.equal(M.offerText(p, 'pt-PT'), '1 vaga');
});

test('offerText: null when salary and vacancies are empty', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  assert.equal(M.offerText(p, 'pt-PT'), null);
  p.offer = { salary: '  ', currency: '€', period: 'month', vacancies: ' ' };
  assert.equal(M.offerText(p, 'pt-PT'), null);
});

test('caption: the offer comes right after the headline', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
  const lines = M.caption(p, 'pt-PT').split('\n');
  assert.ok(lines[0].includes(p.texts['pt-PT'].headline.replace(/\s*\n\s*/g, ' ')));
  assert.equal(lines[1], '1900 € por mês · 30 vagas');
});

test('caption: no offer line without an offer', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  assert.ok(!M.caption(p, 'pt-PT').includes('por mês'));
});

test('normalize: video eyes, hold and photos get defaults and stay clean', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'tijolo', duration: 10, show: { benefits: 'x', chat: false, closing: true, foo: true }, hold: 9, photos: { mode: 'chosen', ids: ['a', 3, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] } };
  const v = M.normalize(raw).video;
  assert.equal(v.motion, 'tijolo');
  assert.deepEqual(v.show, { ...M.DEFAULT_VIDEO_SHOW, chat: false, closing: true });
  assert.equal(v.hold, 2);
  assert.deepEqual(v.photos, { mode: 'chosen', ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
});

test('normalize: an ad without the new fields gets them', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'neon', duration: 15 };
  const v = M.normalize(raw).video;
  assert.deepEqual(v.show, M.DEFAULT_VIDEO_SHOW);
  assert.deepEqual(v.texts, {});
  assert.equal(v.hold, 2);
  assert.deepEqual(v.photos, { mode: 'trades', ids: [] });
});

test('normalize: new ads start at «Automática»', () => {
  assert.equal(M.newProject(TPL, { trades: ['pedreiro'] }).video.duration, 'auto');
  assert.deepEqual(M.DURATIONS, [6, 10, 15, 20, 25, 30]);
});

test('normalize: lengths 6–30 and auto are kept, others fall back to 15', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  for (const [d, want] of [[20, 20], [25, 25], [30, 30], ['auto', 'auto'], [12, 15], ['x', 15]]) {
    raw.video = { motion: 'neon', duration: d };
    assert.equal(M.normalize(raw).video.duration, want, String(d));
  }
  raw.video = { motion: 'curto', duration: 30 };
  assert.equal(M.normalize(raw).video.duration, 6);
});

test('normalize: an ad saved with include keeps the same video', () => {
  const raw = json(M.addLocale(M.newProject(TPL, { trades: ['pedreiro'] }), 'fr', 'pt-PT'));
  const pt = raw.texts['pt-PT'].benefits, fr = raw.texts.fr.benefits;
  raw.video = { motion: 'tijolo', duration: 15, include: { benefits: [pt[1].id], offer: false, positions: true, chat: false, qr: false } };
  const p = M.normalize(raw);
  assert.equal(p.video.include, undefined);
  assert.equal(p.video.show.highlights, false);
  assert.equal(p.video.show.chat, false);
  assert.equal(p.video.show.qr, false);
  assert.equal(p.video.show.positions, null); // still follows the image
  assert.deepEqual(M.mergeList(p.texts['pt-PT'].benefits, p.video.texts['pt-PT'].benefits).map((x) => x.text), [pt[1].text]);
  assert.deepEqual(M.mergeList(p.texts.fr.benefits, p.video.texts.fr.benefits).map((x) => x.text), [fr[1].text]);
  // nothing ticked = no benefits; no choice = no override
  raw.video.include = { benefits: [] };
  assert.deepEqual(M.mergeList(raw.texts['pt-PT'].benefits, M.normalize(raw).video.texts['pt-PT'].benefits), []);
  raw.video.include = { benefits: null };
  assert.deepEqual(M.normalize(raw).video.texts, {});
});

const it = (id, text) => ({ id, text });
test('mergeList: edits, removals, additions and order', () => {
  const img = [it('a', 'A'), it('b', 'B'), it('c', 'C')];
  const out = M.mergeList(img, { edits: { b: 'B!', c: null }, added: [it('x', 'X')], order: ['x', 'a', 'b'] });
  assert.deepEqual(out.map((x) => x.text), ['X', 'A', 'B!']);
  assert.deepEqual(out.map((x) => [x.from, !!x.edited]), [['own', false], ['image', false], ['image', true]]);
  assert.deepEqual(M.mergeList(img).map((x) => x.text), ['A', 'B', 'C']);
  // highlights: an edit changes the value and/or the label of an image item
  const hl = M.mergeList([{ id: 'salary', role: 'salary', value: '1900 €', label: 'por mês' }], { edits: { salary: { value: '2000 €' } }, added: [{ id: 'h1', role: 'own', value: '40 h', label: 'por semana' }], order: null });
  assert.deepEqual(hl.map((x) => [x.value, x.label]), [['2000 €', 'por mês'], ['40 h', 'por semana']]);
});

test('mergeList: orphan edits are ignored and new image items appear', () => {
  const out = M.mergeList([it('a', 'A'), it('n', 'N'), it('b', 'B')], { edits: { gone: 'Z' }, added: [], order: ['b', 'a'] });
  assert.deepEqual(out.map((x) => x.text).sort(), ['A', 'B', 'N']);
  assert.ok(out.findIndex((x) => x.id === 'b') < out.findIndex((x) => x.id === 'a'));
});

test('cleanVideoTexts: junk is dropped', () => {
  const long = 'x'.repeat(1000);
  const t = M.cleanVideoTexts({
    'pt-PT': {
      headline: long, kicker: 5, nope: 'x',
      benefits: { edits: { a: 'A', b: null, c: 7 }, added: Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, text: 'T' })), order: ['a', 3] },
      highlights: { edits: { salary: { value: '2000 €', label: 7 } }, added: [{ id: 'h1', value: '40 h', label: 'por semana', role: 'x' }] },
      model: { partidas: { gate: 'PORTA', n: 5 } },
    },
    xx: { headline: 'gone' },
  }, ['pt-PT']);
  const v = t['pt-PT'];
  assert.equal(v.headline.length, 400);
  assert.equal(v.kicker, undefined);
  assert.equal(v.nope, undefined);
  assert.equal(t.xx, undefined);
  assert.deepEqual(v.benefits.edits, { a: 'A', b: null });
  assert.equal(v.benefits.added.length, 40);
  assert.deepEqual(v.benefits.order, ['a']);
  assert.deepEqual(v.highlights.edits, { salary: { value: '2000 €' } });
  assert.deepEqual(v.highlights.added, [{ id: 'h1', role: 'own', value: '40 h', label: 'por semana' }]);
  assert.deepEqual(v.model, { partidas: { gate: 'PORTA' } });
});

test('pruneVideoTexts: edits of image items that are gone are dropped; his own items and the highlights stay', () => {
  const p = json(M.addLocale(M.newProject(TPL, { trades: ['pedreiro'] }), 'fr', 'pt-PT'));
  const b = p.texts['pt-PT'].benefits;
  p.video.texts = {
    'pt-PT': {
      headline: 'Só no vídeo',
      benefits: { edits: { [b[0].id]: 'Mudada', gone1: 'Velha', gone2: null }, added: [it('own1', 'Minha')], order: ['gone1', 'own1', b[0].id] },
      positions: { edits: { gone3: 'X' }, added: [], order: null },
      highlights: { edits: { salary: { value: '2000 €' }, badge: null }, added: [], order: null },
    },
    fr: { benefits: { edits: { gone4: null }, added: [], order: null } },
    es: { headline: 'idioma que já não existe' },
  };
  M.pruneVideoTexts(p);
  const v = p.video.texts['pt-PT'];
  assert.deepEqual(v.benefits.edits, { [b[0].id]: 'Mudada' });
  assert.deepEqual(v.benefits.added, [it('own1', 'Minha')]);
  assert.deepEqual(v.benefits.order, ['own1', b[0].id]);
  assert.equal(v.positions, undefined); // nothing left: follows the image again
  assert.deepEqual(v.highlights.edits, { salary: { value: '2000 €' }, badge: null }); // the role items come and go with the offer
  assert.equal(v.headline, 'Só no vídeo');
  assert.equal(p.video.texts.fr, undefined);
  assert.equal(p.video.texts.es, undefined);
});

test('applyTradeTexts and normalize leave no edits of items that are gone', () => {
  const p = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  const first = p.texts['pt-PT'].benefits[0];
  p.video.texts = { 'pt-PT': { benefits: { edits: { [first.id]: 'Mudada' }, added: [], order: null } } };
  const q = M.applyTradeTexts(p); // the ready texts get new item ids
  assert.ok(!q.texts['pt-PT'].benefits.some((x) => x.id === first.id));
  assert.equal(q.video.texts['pt-PT'], undefined);
  const raw = json(p);
  raw.texts['pt-PT'].benefits = raw.texts['pt-PT'].benefits.slice(1); // deleted on the image
  assert.equal(M.normalize(raw).video.texts['pt-PT'], undefined);
});

test('normalize: «Escolher» without photos goes back to the trades\' photos; hold 4 is kept', () => {
  const raw = json(M.newProject(TPL, { trades: ['pedreiro'] }));
  raw.video = { motion: 'colagem', duration: 15, hold: 4, photos: { mode: 'chosen', ids: [] } };
  const v = M.normalize(raw).video;
  assert.equal(v.hold, 4);
  assert.deepEqual(v.photos, { mode: 'trades', ids: [] });
});

test('model: the recipes are motions, in their order', () => {
  const ids = ['tijolo', 'pixel', 'planta', 'apresentacao', 'colagem', 'numeros', 'partidas', 'notificacoes', 'grua', 'contrato', 'cracha', 'fita', 'esteira'];
  for (const id of ids) assert.ok(M.MOTIONS.includes(id), id);
  assert.deepEqual(M.RECIPES, ids);
});
