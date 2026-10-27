const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'workflow.js');
const M = RS.model;
const TPL = { id: 'test', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => { const p = M.newProject(TPL); p.photo = { asset: 'photo', zoom: 1.2, fx: .3, fy: .6, adj: { b: 1.1 } }; return p; };

test('format crops are independent, inherit older framing and survive portable normalization', () => {
  const p = project();
  assert.equal(M.photoForFormat(p.photo, 'story').fx, .3);
  M.setPhotoFrame(p, 'story', { fx: .8, zoom: 2 });
  assert.equal(M.photoForFormat(p.photo, 'portrait').fx, .3);
  assert.equal(p.photo.zoom, 1.2);
  const q = M.normalize(JSON.parse(JSON.stringify(p)));
  assert.equal(M.photoForFormat(q.photo, 'story').zoom, 2);
  assert.equal(M.photoForFormat(q.photo, 'story').fy, .6);
  assert.equal(M.photoForFormat(q.photo, 'story').adj.b, 1.1);
  M.setPhotoFrame(q, 'story', null); assert.equal(M.photoForFormat(q.photo, 'story').zoom, 1.2);
  M.setPhotoFrame(q, 'square', { zoom: 99, fx: NaN, fy: -1 });
  assert.deepEqual(q.photo.frames.square, { zoom: 3, fx: .5, fy: 0 });
  q.photo.frames.unknown = { zoom: 3 }; assert.equal(M.normalize(q).photo.frames.unknown, undefined);
});

test('absolute legibility warns without relative shrinking, for images and video, only where measured', () => {
  const p = project(), combo = { l: 'pt-PT', f: 'story' };
  let checks = RS.workflow.preflight(p, { combos: [combo], reports: [{ ...combo, report: { shrink: 1, minTextSize: 22 } }] });
  assert.match(checks.find((c) => c.id.startsWith('legibility')).text, /22 px.*7.3/);
  assert.equal(checks.some((c) => c.id.startsWith('small:')), false);
  p.video.motion = 'poster';
  checks = RS.workflow.preflight(p, { kind: 'video', combos: [combo], reports: [{ ...combo, prepared: { minTextSize: 20 } }] });
  assert.ok(checks.some((c) => c.id.startsWith('legibility')));
  for (const minTextSize of [0, 26, 40, undefined]) {
    assert.equal(RS.workflow.preflight(p, { combos: [combo], reports: [{ ...combo, report: { minTextSize } }] }).some((c) => c.id.startsWith('legibility')), false);
  }
});

test('engine measures only drawn text at poster size and exports each format crop', () => {
  const draws = [], ctx = new Proxy({ font: '20px sans-serif' }, { get(target, key) {
    if (key === 'measureText') return (s) => ({ width: s.length * (parseFloat(target.font.match(/[\d.]+px/)?.[0]) || 20) / 2, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 });
    if (key === 'drawImage') return (...args) => draws.push(args);
    return key in target ? target[key] : () => {};
  } });
  global.document = { createElement: () => ({ getContext: () => ctx }) };
  require('../../js/engine.js');
  const E = RS.engine, p = project(), font = M.FONTS.modern.body;
  RS.templates = { get: () => ({ render(R) {
    E.textLayout('A rejected measuring candidate', { font, size: 5, lh: 1, maxW: 600 });
    E.textLayout(' ', { font, size: 6, lh: 1, maxW: 600 }).draw(R.ctx, 0, 0, '#000');
    E.textLayout('Decorative', { font, size: 7, lh: 1, maxW: 600, report: false }).draw(R.ctx, 0, 0, '#000');
    E.textLayout('Offer body', { font, size: 30, lh: 1, maxW: 600 }).draw(R.ctx, 0, 0, '#000');
    E.textLayout('Contact', { font, size: 24, lh: 1, maxW: 600 }).drawLine(R.ctx, 0, 0, 0, '#000');
    E.photo(R, { x: 0, y: 0, w: 400, h: 400 });
  } }) };
  M.setPhotoFrame(p, 'story', { zoom: 2, fx: .8 });
  const original = JSON.stringify(p), images = { photo: { width: 1000, height: 1000 } };
  for (const scale of [.2, 1]) assert.equal(E.render(ctx, p, { format: 'story', images, scale }).report.minTextSize, 24);
  assert.equal(draws[0][3], 800); assert.equal(draws[0][1], -400);
  E.render(ctx, p, { format: 'portrait', images }); assert.equal(draws[2][3], 480);
  assert.equal(JSON.stringify(p), original);
});
