// Install anywhere: the platform, its own steps, the app's address for the phone, the welcome.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('install.js');

const I = RS.install;
const mem = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const UA = {
  instagramIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_1; pt_PT; pt-PT; scale=3.00; 1179x2556)',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
};
const web = { standalone: false, protocol: 'https:', maxTouchPoints: 0, prompt: false };
const phone = { ...web, maxTouchPoints: 5 };

test('install: platform says file for the .exe window', () => {
  // the .exe opens the files in an Edge «app» window: standalone, but never installed
  assert.equal(I.platform(UA.edgeWindows, { ...web, protocol: 'file:', standalone: true }), 'file');
  assert.equal(I.platform(UA.edgeWindows, { ...web, protocol: 'file:' }), 'file');
  assert.equal(I.platform(UA.androidChrome, { ...phone, standalone: true }), 'installed');
});

test('install: every browser gets its own steps', () => {
  const table = [
    [UA.instagramIphone, phone, 'ios-inapp'],
    [UA.facebookAndroid, phone, 'android-inapp'],
    [UA.iosSafari, phone, 'ios-safari'],
    [UA.chromeIos, phone, 'ios-other'],
    [UA.ipadOs, phone, 'ios-safari'],
    [UA.macSafari, web, 'mac-safari'],
    [UA.androidChrome, { ...phone, prompt: true }, 'android'],
    [UA.edgeWindows, web, 'desktop-chromium'],
    [UA.firefoxAndroid, phone, 'firefox-android'],
    [UA.samsung, phone, 'samsung'],
    [UA.firefoxWindows, web, 'firefox-desktop'],
  ];
  for (const [ua, env, want] of table) assert.equal(I.platform(ua, env), want, ua);
  for (const p of ['file', 'ios-inapp', 'android-inapp', 'ios-safari', 'ios-other', 'mac-safari', 'android', 'desktop-chromium', 'firefox-android', 'samsung', 'firefox-desktop', 'other']) {
    assert.ok(Array.isArray(I.STEPS[p]) && I.STEPS[p].length > 0, `no steps for ${p}`);
    for (const s of I.STEPS[p]) assert.ok(s.icon && s.text, `${p}: a step without icon or words`);
  }
  assert.match(I.STEPS['ios-safari'].map((s) => s.text).join(' '), /Partilhar.*Adicionar ao ecrã principal/);
  assert.match(I.STEPS['mac-safari'].map((s) => s.text).join(' '), /Adicionar à Dock/);
  assert.match(I.STEPS['ios-inapp'].map((s) => s.text).join(' '), /Safari/);
  assert.match(I.STEPS['android-inapp'].map((s) => s.text).join(' '), /Chrome/);
  assert.match(I.STEPS.samsung.map((s) => s.text).join(' '), /Ecrã principal/);
});

test('install: only an https address is kept', () => {
  assert.equal(I.checkAddress('http://100.64.0.1:8080').ok, false);
  assert.ok(I.checkAddress('http://100.64.0.1:8080').error);
  assert.equal(I.checkAddress('https://localhost/').ok, false, 'a host without a dot');
  assert.equal(I.checkAddress('').ok, false);
  assert.deepEqual(I.checkAddress('https://x.tailfc994f.ts.net/index.html'), { ok: true, url: 'https://x.tailfc994f.ts.net/' });
  assert.deepEqual(I.checkAddress('  https://x.tailfc994f.ts.net  '), { ok: true, url: 'https://x.tailfc994f.ts.net/' });
  assert.deepEqual(I.checkAddress('x.tailfc994f.ts.net/app/index.html?v=2#top'), { ok: true, url: 'https://x.tailfc994f.ts.net/app/' });
});

test('install: the app\'s address — the page\'s own folder on https, the one typed on the .exe', () => {
  assert.equal(I.appAddress({ protocol: 'https:', origin: 'https://x.tailfc994f.ts.net', pathname: '/index.html' }, mem()), 'https://x.tailfc994f.ts.net/');
  assert.equal(I.appAddress({ protocol: 'https:', origin: 'https://x.tailfc994f.ts.net', pathname: '/rs/' }, mem()), 'https://x.tailfc994f.ts.net/rs/');
  const s = mem();
  const file = { protocol: 'file:', origin: 'null', pathname: '/C:/Apps/recruitment-studio-web/index.html' };
  assert.equal(I.appAddress(file, s), null);
  I.rememberAddress('https://x.tailfc994f.ts.net/', s);
  assert.equal(I.appAddress(file, s), 'https://x.tailfc994f.ts.net/');
  assert.doesNotThrow(() => I.rememberAddress('https://x.tailfc994f.ts.net/', { setItem() { throw new Error('blocked'); } }));
});

test('install: the welcome after installing is not shown again in the new window', () => {
  const s = mem();
  I.markWelcomed(s);
  assert.equal(I.shouldWelcome({ standalone: true, protocol: 'https:', storage: s }), false);
  assert.doesNotThrow(() => I.markWelcomed({ setItem() { throw new Error('blocked'); } }));
});

test('install: the welcome shows once', () => {
  const s = mem();
  assert.equal(I.shouldWelcome({ standalone: false, protocol: 'https:', storage: s }), false);
  assert.equal(I.shouldWelcome({ standalone: true, protocol: 'file:', storage: s }), false, 'the .exe window is not an installed app');
  assert.equal(I.shouldWelcome({ standalone: true, protocol: 'https:', storage: s }), true);
  assert.equal(I.shouldWelcome({ standalone: true, protocol: 'https:', storage: s }), false);
});

test('install: a computer with a touch screen is still a computer', () => {
  assert.equal(I.phone(UA.edgeWindows, { maxTouchPoints: 10 }), false, 'a Windows laptop with a touch screen');
  assert.equal(I.phone(UA.macSafari, { maxTouchPoints: 0 }), false);
  assert.equal(I.phone(UA.ipadOs, { maxTouchPoints: 5 }), true, 'an iPad says «Macintosh» but has touch');
  assert.equal(I.phone(UA.iosSafari, phone), true);
  assert.equal(I.phone(UA.androidChrome, phone), true);
  assert.equal(I.phone(UA.firefoxAndroid, phone), true);
  assert.equal(I.phone(UA.samsung, phone), true);
});

test('install: every guide with a drawing taps one thing per step', () => {
  const WITH = ['ios-safari', 'ios-other', 'ios-inapp', 'android-inapp', 'mac-safari', 'android', 'desktop-chromium', 'firefox-android', 'samsung'];
  for (const p of WITH) {
    const d = I.DEMOS[p];
    assert.ok(d, `${p}: no drawing`);
    assert.equal(d.taps.length, I.STEPS[p].length, `${p}: ${d.taps.length} taps for ${I.STEPS[p].length} steps`);
    for (const [where, i] of d.taps) {
      if (where === 'tool') assert.ok(d.tools[i], `${p}: no tool ${i}`);
      if (where === 'menu') assert.ok(d.menu && d.menu[i], `${p}: no menu row ${i}`);
      if (where === 'dialog') assert.ok(typeof i === 'string' && i, `${p}: the dialog's button has no words`);
    }
  }
  // a guide that only says where to go has nothing to draw
  for (const p of ['firefox-desktop', 'other', 'file', 'installed']) assert.equal(I.DEMOS[p], undefined, p);
});
