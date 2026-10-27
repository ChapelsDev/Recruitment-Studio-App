// Haptics: Android vibrates, iPhone ticks on real taps (hidden switches), PC is quiet.
const test = require('node:test');
const assert = require('node:assert/strict');

// a phone's navigator, recording what it is asked to vibrate
const calls = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: '', maxTouchPoints: 5, vibrate: (p) => { calls.push(p); return true; } } });
const RS = require('../load.cjs')('appearance.js', 'haptics.js');
const H = RS.haptics;

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1',
  iphone174: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphone173: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
};

test('haptics: Android vibrates, iPhone ticks on taps, PC is quiet', () => {
  const phone = { vibrate: true, maxTouchPoints: 5 };
  assert.equal(H.mode(UA.androidChrome, phone), 'android');
  assert.equal(H.mode(UA.androidFirefox, phone), 'android');
  assert.equal(H.mode(UA.samsung, phone), 'android');
  assert.equal(H.mode(UA.iphone26, { vibrate: false, maxTouchPoints: 5 }), 'ios');
  assert.equal(H.mode(UA.iphone174, { vibrate: false, maxTouchPoints: 5 }), 'ios');
  assert.equal(H.mode(UA.chromeIos, { vibrate: false, maxTouchPoints: 5 }), 'ios');
  // iPadOS says «Macintosh» but has a touch screen
  assert.equal(H.mode(UA.ipadOs, { vibrate: false, maxTouchPoints: 5 }), 'ios');
  // before the switch control (iOS 17.4) there is nothing to tick with
  assert.equal(H.mode(UA.iphone173, { vibrate: false, maxTouchPoints: 5 }), 'none');
  assert.equal(H.mode(UA.macSafari, { vibrate: false, maxTouchPoints: 0 }), 'none');
  // desktop Chrome and Edge have navigator.vibrate, but no motor: quiet
  assert.equal(H.mode(UA.edgeWindows, { vibrate: true, maxTouchPoints: 0 }), 'none');
  // a Windows laptop with a touch screen (or Edge without a window, which says 255 touch points) is still a PC
  assert.equal(H.mode(UA.edgeWindows, { vibrate: true, maxTouchPoints: 255 }), 'none');
});

test('haptics: patterns', () => {
  assert.deepEqual(H.PATTERNS, { tick: 8, success: [12, 60, 18], error: [30, 50, 30] });
});

test('haptics: Android plays the patterns, vibration off is quiet', () => {
  H.install(null, { mode: 'android' });
  RS.appearance.set({ haptics: true });
  calls.length = 0;
  H.tick(); H.success(); H.error();
  assert.deepEqual(calls, [8, [12, 60, 18], [30, 50, 30]]);
  RS.appearance.set({ haptics: false });
  calls.length = 0;
  H.tick(); H.success(); H.error();
  assert.deepEqual(calls, []);
  RS.appearance.set({ haptics: true });
});

test('haptics: on iPhone and on PC nothing vibrates from script', () => {
  for (const mode of ['ios', 'none']) {
    H.install(null, { mode });
    calls.length = 0;
    H.tick(); H.success(); H.error();
    assert.deepEqual(calls, [], mode);
  }
});
