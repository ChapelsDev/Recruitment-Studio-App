// «Enquadrar»: the point of each video photo that the video centres
// (video.photos.focus), kept clean by normalize, and its defaults.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js');

const M = RS.model;
const TPL = { id: 'diagonal', trade: 'obras', sample: 'construction', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const json = (o) => JSON.parse(JSON.stringify(o));
const raw = (photos) => { const r = json(M.newProject(TPL, { trades: ['pedreiro'] })); r.video = { motion: 'colagem', duration: 15, photos }; return r; };

test('normalize: a photo\'s focus is kept, in both modes', () => {
  const chosen = M.normalize(raw({ mode: 'chosen', ids: ['a', 'b'], focus: { a: { x: 0.2, y: 0.9 } } })).video.photos;
  assert.deepEqual(chosen, { mode: 'chosen', ids: ['a', 'b'], focus: { a: { x: 0.2, y: 0.9 } } });
  const trades = M.normalize(raw({ mode: 'trades', ids: [], focus: { 'pedreiro-1a2b': { x: 0.5, y: 0.3 } } })).video.photos;
  assert.deepEqual(trades, { mode: 'trades', ids: [], focus: { 'pedreiro-1a2b': { x: 0.5, y: 0.3 } } });
});

test('normalize: a focus is clamped to the photo and junk is dropped', () => {
  const focus = {
    a: { x: 1.5, y: -1 }, // outside the photo: clamped
    b: { x: 0.25, y: 0.75, zoom: 3 }, // extra keys go
    '': { x: 0.5, y: 0.5 }, // no id
    c: 'x', d: null, e: { x: NaN, y: 0.5 }, f: { x: '0.3', y: 0.4 }, g: { x: Infinity, y: 0.1 }, h: { y: 0.2 },
  };
  const v = M.normalize(raw({ mode: 'trades', ids: [], focus })).video;
  assert.deepEqual(v.photos.focus, { a: { x: 1, y: 0 }, b: { x: 0.25, y: 0.75 } });
});

test('normalize: no focus, an empty one or a broken one leaves the photos as before', () => {
  for (const focus of [undefined, {}, null, 'x', [{ x: 0.5, y: 0.5 }], { a: null }]) {
    assert.deepEqual(M.normalize(raw({ mode: 'trades', ids: [], focus })).video.photos, { mode: 'trades', ids: [] }, JSON.stringify(focus));
  }
});

test('normalize: «Escolher» without photos goes back to the trades but keeps the focus', () => {
  const v = M.normalize(raw({ mode: 'chosen', ids: [], focus: { a: { x: 0.1, y: 0.2 } } })).video;
  assert.deepEqual(v.photos, { mode: 'trades', ids: [], focus: { a: { x: 0.1, y: 0.2 } } });
});

test('normalize: at most 64 photos keep a focus', () => {
  const focus = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`p${i}`, { x: 0.5, y: 0.5 }]));
  assert.equal(Object.keys(M.normalize(raw({ mode: 'trades', ids: [], focus })).video.photos.focus).length, 64);
});

test('videoPhotoFocus: the person\'s point, else the ad\'s framing, a library photo\'s or a little above the middle', () => {
  const p = M.normalize(raw({ mode: 'trades', ids: [], focus: { lib1: { x: 0.8, y: 0.2 } } }));
  p.photo = { asset: 'own', zoom: 1, fx: 0.3, fy: 0.6, flip: false };
  assert.deepEqual(M.videoPhotoFocus(p, 'lib1', { id: 'lib1', fy: 0.36 }), { x: 0.8, y: 0.2 });
  assert.deepEqual(M.videoPhotoFocus(p, 'own'), { x: 0.3, y: 0.6 });
  assert.deepEqual(M.videoPhotoFocus(p, 'lib2', { id: 'lib2', fy: 0.36 }), { x: 0.5, y: 0.36 });
  assert.deepEqual(M.videoPhotoFocus(p, 'mine'), { x: 0.5, y: 0.4 });
  assert.deepEqual(M.videoPhotoFocus(p, 'mine', { asset: 'mine', cat: 'geral' }), { x: 0.5, y: 0.4 });
  // the person's point wins over the ad's framing too
  p.video.photos.focus.own = { x: 0.9, y: 0.1 };
  assert.deepEqual(M.videoPhotoFocus(p, 'own'), { x: 0.9, y: 0.1 });
  // a project without video settings
  assert.deepEqual(M.videoPhotoFocus({}, 'x'), { x: 0.5, y: 0.4 });
});

test('setVideoPhotoFocus: sets, replaces and clears one photo\'s point', () => {
  const p = M.normalize(raw({ mode: 'chosen', ids: ['a'] }));
  M.setVideoPhotoFocus(p, 'a', { x: 0.25, y: 1.4 });
  assert.deepEqual(p.video.photos, { mode: 'chosen', ids: ['a'], focus: { a: { x: 0.25, y: 1 } } });
  M.setVideoPhotoFocus(p, 'b', { x: 0.5, y: 0.5 });
  M.setVideoPhotoFocus(p, 'a', null); // «Centrar»: back to the default
  assert.deepEqual(p.video.photos.focus, { b: { x: 0.5, y: 0.5 } });
  M.setVideoPhotoFocus(p, 'b', null);
  assert.deepEqual(p.video.photos, { mode: 'chosen', ids: ['a'] });
});
