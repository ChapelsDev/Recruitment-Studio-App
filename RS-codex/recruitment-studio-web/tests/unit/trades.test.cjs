// Trades: singular nouns for messages and several trades per ad.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js');

const T = RS.trades;

test('nouns: one singular noun per trade, in the ad language', () => {
  assert.deepEqual(T.nouns(['pedreiro', 'servente'], 'pt-PT'), ['pedreiro', 'servente']);
  assert.deepEqual(T.nouns(['pedreiro'], 'de-CH'), ['Maurer']);
});

test('nouns: every trade has a noun in pt, de, fr, it, en and es', () => {
  for (const tr of T.list) {
    for (const locale of ['pt-PT', 'de-DE', 'fr', 'it', 'en', 'es']) {
      const [noun] = T.nouns([tr.id], locale);
      assert.ok(noun && noun.trim(), `${tr.id} has no noun in ${locale}`);
    }
  }
});

test('textsFor: main trade texts with every trade\'s positions, no duplicates', () => {
  const t = T.textsFor(['pedreiro', 'servente'], 'pt-PT');
  const texts = t.positions.map((p) => p.text);
  assert.ok(texts.includes('Pedreiro com experiência'));
  assert.ok(texts.includes('Ajudante de pedreiro'));
  assert.equal(texts.filter((x) => x === 'Servente de obra').length, 1);
  assert.equal(t.headline, T.texts('pedreiro', 'pt-PT').headline);
  for (const p of t.positions) assert.match(p.key, /^pos:(pedreiro|servente):\d+$/);
});

test('translate: merged positions of every trade are translated', () => {
  const src = T.textsFor(['pedreiro', 'servente'], 'pt-PT');
  const out = T.translate(src, ['pedreiro', 'servente'], 'pt-PT', 'de-CH');
  assert.ok(out.positions.map((p) => p.text).includes('Maurerhilfe'));
});

test('translate: a position the person changed stays as written', () => {
  const src = T.textsFor(['pedreiro', 'servente'], 'pt-PT');
  src.positions[0].text = 'Pedreiro para Zurique';
  const out = T.translate(src, ['pedreiro', 'servente'], 'pt-PT', 'de-CH');
  assert.equal(out.positions[0].text, 'Pedreiro para Zurique');
});

test('translate: old pos<i> keys still mean the first trade', () => {
  const src = T.texts('pintor', 'pt-PT');
  src.positions = [{ id: 'x', key: 'pos1', text: 'Estucador' }];
  const out = T.translate(src, 'pintor', 'pt-PT', 'de-CH');
  assert.equal(out.positions[0].text, 'Gipser');
});

test('hashtagsFor: general tags once, then each trade\'s tag', () => {
  const h = T.hashtagsFor(['pedreiro', 'servente'], 'pt-PT');
  assert.ok(h.includes('#pedreiro'));
  assert.ok(h.includes('#servente'));
  assert.equal(h.split(' ').filter((x) => x === '#emprego').length, 1);
});
