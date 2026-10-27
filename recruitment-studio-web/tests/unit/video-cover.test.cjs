const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'production.js');
const M = RS.model, P = RS.production;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => M.addLocale(M.newProject(TPL), 'fr', 'pt-PT');
const prepared = { fmt: M.FORMATS.story, timeline: { duration: 8, scenes: [{ kind: 'hook', start: 0, end: 2 }, { kind: 'benefit', start: 2, end: 5 }, { kind: 'end', start: 5, end: 8 }] } };

test('video moments represent both scene and recipe timelines and clamp to an actual export frame', () => {
  assert.deepEqual(P.videoMoments(prepared).map((m) => m.time), [0, 2, 5]);
  assert.match(P.videoMoments(prepared)[2].label, /Contactos/);
  assert.match(P.videoMoments({ ...prepared, acts: [{ kind: 'D', start: 3, end: 5 }] })[0].label, /Destaques/);
  assert.equal(P.frameTime(prepared, -4), 0); assert.equal(P.frameTime(prepared, 100), 8 - 1 / 30);
  assert.equal(P.frameTime(prepared, 'invalid'), 0); assert.deepEqual(P.videoMoments(null), []);
});

test('cover choices normalize independently per language and survive portable project normalization', () => {
  const p = project(); p.video.cover = { 'pt-PT': { time: 4.5, title: 'Chamada', placement: 'top' }, fr: { time: 2, title: 'Texte', placement: 'bottom' }, xx: { time: 1 }, en: { time: 'bad' } };
  const q = M.normalize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(q.video.cover['pt-PT'], { time: 4.5, title: 'Chamada', placement: 'top' });
  assert.equal(q.video.cover.xx, undefined); assert.equal(q.video.cover.en, undefined);
  assert.equal(M.removeLocale(q, 'fr').video.cover.fr, undefined);
  assert.equal(p.video.cover.fr.title, 'Texte');
});

test('cover renderer uses the chosen video frame in 9:16 and adds only the cover title within the safe area', () => {
  const draws = [], frames = [], boxes = [], p = project();
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? (s) => ({ width: s.length * 32 }) : (...args) => draws.push([key, ...args]), set: () => true });
  global.document = { createElement: () => ({ getContext: () => ctx }) };
  RS.engine = { setFont() {}, roundRect: (...args) => boxes.push(args.slice(1)) };
  RS.motion = { render: (context, movie, options) => frames.push({ context, movie, options }) };
  const before = JSON.stringify(p), canvas = P.renderVideoCover(p, prepared, { time: 3.25, title: 'Estamos a recrutar', placement: 'bottom' });
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920); assert.equal(frames[0].options.t, 98 / 30);
  assert.equal(frames[0].movie, prepared); assert.ok(draws.some((v) => v[0] === 'fillText' && v[1] === 'Estamos a recrutar'));
  const [x, y, width, height] = boxes[0]; assert.equal(x, 72); assert.equal(width, 936); assert.ok(y >= 250 && y + height <= 1640);
  assert.equal(JSON.stringify(p), before);
  assert.throws(() => P.renderVideoCover(p, { ...prepared, fmt: M.FORMATS.square }, {}), /9:16/);
});

test('campaign cover uses its saved frame and shares preparation with the video; unchosen languages keep automatic covers', async () => {
  const p = project(); p.video.motion = 'poster'; p.video.sound = 'none'; p.video.cover = { 'pt-PT': { time: 20, title: 'Chamada PT', placement: 'top' } };
  const prepares = [], covers = [], posters = [];
  RS.motion = { prepare: (p, o) => { prepares.push(o.locale); return { ...prepared, locale: o.locale }; }, render() {} };
  RS.video = { support: async () => ({ method: 'recorder' }), extOf: () => 'webm', create: async () => new Blob(['video']) };
  const parts = Object.fromEntries(Object.keys(P.PARTS).map((k) => [k, ['cover', 'video'].includes(k)]));
  const result = await P.packageFiles(p, { mode: 'campaign', parts }, {
    imageBlob: async (format, locale) => { posters.push(locale); return new Blob(['poster']); },
    coverBlob: async (p, movie, choice) => { covers.push({ locale: movie.locale, choice }); return new Blob(['frame']); },
  });
  assert.deepEqual(prepares, ['pt-PT', 'fr']); assert.deepEqual(posters, ['fr']); assert.equal(covers.length, 1);
  assert.equal(covers[0].choice.time, 8 - 1 / 30); assert.equal(covers[0].choice.title, 'Chamada PT');
  assert.equal(result.manifest.covers['pt-PT'].type, 'frame'); assert.equal(result.manifest.covers.fr.type, 'poster');
  assert.ok(result.manifest.warnings.some((s) => /instante da capa/.test(s)));
});
