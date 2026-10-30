// RS.phone (2026-10-29): where the phone panel stops and how it snaps.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('phone.js');

test('phone: stops on a 740 px phone', () => {
  assert.deepEqual(RS.phone.stops(740, { safeTop: 0, barRoom: 104, head: 60 }), { top: 163, middle: 414, bottom: 576 });
});

test('phone: stops on an iPhone 15 (844, safe top 59)', () => {
  assert.deepEqual(RS.phone.stops(844, { safeTop: 59, barRoom: 138, head: 60 }), { top: 186, middle: 473, bottom: 646 });
});

test('phone: stops stay in order on a very short window', () => {
  const s = RS.phone.stops(420, { safeTop: 0, barRoom: 104, head: 60 });
  assert.ok(s.top < s.middle && s.middle < s.bottom, JSON.stringify(s));
});

test('phone: snap follows position and flicks', () => {
  const s = { top: 163, middle: 414, bottom: 576 };
  assert.equal(RS.phone.snap(400, 0, s), 'middle');
  assert.equal(RS.phone.snap(300, 0, s), 'middle');
  assert.equal(RS.phone.snap(280, 0, s), 'top');
  assert.equal(RS.phone.snap(420, 1.2, s), 'bottom'); // a quick flick down goes on
  assert.equal(RS.phone.snap(420, -1.2, s), 'top');
});

test('phone: the toggle cycles up, then back to the bottom', () => {
  assert.deepEqual(['bottom', 'middle', 'top'].map((s) => RS.phone.next(s)), ['middle', 'top', 'bottom']);
});

// ---------------------------------------------------------------- the video player (2026-10-29)
test('phone: player tiers', () => {
  assert.deepEqual([300, 230, 229, 120, 119].map((w) => RS.phone.tier(w)), ['full', 'full', 'reduced', 'reduced', 'minimal']);
});

test('phone: ticks skip the start and drop the numbers', () => {
  assert.deepEqual(RS.phone.ticks([{ time: 0, label: '1. Abertura' }, { time: 2, label: '2. Introdução' }, { time: 7.5, label: '3. Vantagens' }], 15),
    [{ at: 2 / 15, label: 'Introdução' }, { at: 0.5, label: 'Vantagens' }]);
});

test('phone: the buttons hide after 3 s', () => {
  assert.equal(RS.phone.HIDE_MS, 3000);
});
