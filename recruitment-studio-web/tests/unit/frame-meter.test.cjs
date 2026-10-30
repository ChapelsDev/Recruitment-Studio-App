// RS.frameMeter (2026-10-29): a hidden meter for the owner's iPhone test (no Mac to
// measure it otherwise) — frames per second and the frames over 50 ms.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('frame-meter.js');

test('frame-meter: fps and slow frames from the frame intervals', () => {
  assert.deepEqual(RS.frameMeter.summary([16, 16, 17, 100]), { fps: 27, slow: 1 });
  assert.deepEqual(RS.frameMeter.summary([16.7, 16.7, 16.6]), { fps: 60, slow: 0 });
  assert.deepEqual(RS.frameMeter.summary([]), { fps: 0, slow: 0 });
});
