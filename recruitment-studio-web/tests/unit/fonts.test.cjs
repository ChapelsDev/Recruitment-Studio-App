// The interface typeface (2026-10-28, «Balão»): Rubik ships inside the app,
// next to the poster fonts, which must stay byte-identical (the outputs do not change).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '../..');
const fontsCss = fs.readFileSync(path.join(root, 'assets/fonts.css'), 'utf8');
const appCss = fs.readFileSync(path.join(root, 'assets/app.css'), 'utf8');
// assets/fonts.css before Rubik was added (ledger, Task 0): only poster fonts
const POSTER_FONTS_SHA256 = '779dde8bc8bff6d5658baee7e7cbfb87f83da4d35dbed40e780b512db4c2cfff';

test('fonts.css carries Rubik 400–800 for latin and latin-ext', () => {
  const rules = fontsCss.split('\n').filter((l) => l.includes("font-family:'Rubik'"));
  for (const weight of [400, 500, 600, 700, 800]) {
    const mine = rules.filter((l) => l.includes(`font-weight:${weight};`) && l.includes('src:url(data:font/woff2;base64,'));
    assert.equal(mine.length, 2, `Rubik ${weight}: ${mine.length} rules`);
  }
  assert.equal(rules.length, 10);
});

test('the poster fonts are byte-identical', () => {
  const without = fontsCss.split('\n').filter((l) => !l.includes("font-family:'Rubik'")).join('\n');
  assert.equal(crypto.createHash('sha256').update(without).digest('hex'), POSTER_FONTS_SHA256);
});

test('the interface uses Rubik', () => {
  const rootBlock = appCss.match(/:root\s*\{([^}]*)\}/)[1];
  assert.match(rootBlock, /--ui:\s*'Rubik'/);
  assert.match(rootBlock, /--display:\s*'Rubik'/);
});
