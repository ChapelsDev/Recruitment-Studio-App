// Shipped assets: the stylesheet's motion rules (and, later, icons and manifest).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(app, 'assets', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Every `@keyframes <name> { … }` block, with its body (braces matched).
function keyframes(text) {
  const out = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = re.lastIndex;
    for (; i < text.length && depth; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; }
    out.push({ name: m[1], body: text.slice(re.lastIndex, i - 1) });
  }
  return out;
}
const CHEAP = ['transform', 'opacity', 'clip-path', 'stroke-dashoffset'];
// The properties a keyframes body animates that are not cheap to animate.
const costly = (body) => [...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]).filter((p) => !CHEAP.includes(p));

test('assets: the keyframes check catches a costly property', () => {
  const [k] = keyframes('@keyframes feel-x { from { width: 0; opacity: 0 } to { width: 10px; } }');
  assert.equal(k.name, 'feel-x');
  assert.deepEqual(costly(k.body), ['width', 'width']);
});

test('assets: feel- keyframes animate only cheap properties', () => {
  const feel = keyframes(css).filter((k) => k.name.startsWith('feel-'));
  assert.ok(feel.length > 0, 'no feel- keyframes');
  for (const k of feel) assert.deepEqual(costly(k.body), [], `@keyframes ${k.name}`);
});

// ---------------------------------------------------------------- the icon «Balão a entrar»
const zlib = require('node:zlib');
// A small PNG reader: size, and the pixels of 8-bit RGB/RGBA non-interlaced files.
function readPng(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
  let pos = 8, w = 0, h = 0, type = 0, depth = 0;
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), name = b.toString('latin1', pos + 4, pos + 8), data = b.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const at = (x, y) => {
    if (!px) decode();
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
  let px = null;
  function decode() {
    assert.equal(depth, 8, 'only 8-bit PNGs are read here');
    const ch = type === 6 ? 4 : type === 2 ? 3 : 0;
    assert.ok(ch, `colour type ${type}`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(w * h * ch);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? out[y * stride + x - ch] : 0, up = y ? out[(y - 1) * stride + x] : 0, c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0;
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
        out[y * stride + x] = (line[x] + pred) & 255;
      }
    }
    px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) for (let k = 0; k < 4; k++) px[i * 4 + k] = k < ch ? out[i * ch + k] : 255;
  }
  return { w, h, at };
}
const icons = path.join(app, 'assets', 'icons');
const white = ([r, g, b, a]) => r > 235 && g > 235 && b > 235 && a > 240;
const black = ([r, g, b, a]) => r < 50 && g < 50 && b < 50 && a > 240;
const orange = ([r, g, b, a]) => r > 200 && g > 60 && g < 160 && b < 80 && a > 240;

test('assets: the icon masters exist', () => {
  for (const f of ['icon.svg', 'icon-small.svg', 'icon-maskable.svg']) {
    const svg = fs.readFileSync(path.join(app, 'assets', 'brand', f), 'utf8');
    assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/, f);
  }
});

test('assets: every icon exists at its size', () => {
  for (const s of [16, 24, 32, 48, 64, 128, 180, 192, 256, 512]) {
    const p = readPng(path.join(icons, `icon-${s}.png`));
    assert.deepEqual([p.w, p.h], [s, s], `icon-${s}.png`);
  }
  const m = readPng(path.join(icons, 'maskable-512.png'));
  assert.deepEqual([m.w, m.h], [512, 512]);
});

test('assets: the icon is the bubble entering from its corner', () => {
  const p = readPng(path.join(icons, 'icon-512.png'));
  assert.ok(white(p.at(60, 60)), `no white bubble in the top-left corner: ${p.at(60, 60)}`);
  assert.ok(black(p.at(206, 158)), `no black typing dot: ${p.at(206, 158)}`);
  assert.ok(orange(p.at(470, 300)), `no orange on the right: ${p.at(470, 300)}`);
  assert.equal(p.at(2, 2)[3], 0, 'the rounded corner is not transparent');
  // the platforms cut their own shape: the maskable icon fills the whole square
  const m = readPng(path.join(icons, 'maskable-512.png'));
  for (const [x, y] of [[2, 2], [509, 2], [2, 509], [509, 509]]) assert.equal(m.at(x, y)[3], 255, `maskable corner ${x},${y}`);
  assert.ok(orange(m.at(20, 256)), `maskable: no orange at the edge: ${m.at(20, 256)}`);
  // the small icon still reads at 16 px: white and dark pixels, not one blob
  const s = readPng(path.join(icons, 'icon-16.png'));
  let w = 0, k = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = s.at(x, y); if (white(c)) w++; if (c[0] < 90 && c[1] < 90 && c[2] < 90 && c[3] > 200) k++; }
  assert.ok(w >= 10 && k >= 3, `16 px: ${w} white and ${k} dark pixels`);
});

test('assets: the manifest lists 192, 512 and a maskable icon that exist', () => {
  const man = JSON.parse(fs.readFileSync(path.join(app, 'manifest.webmanifest'), 'utf8'));
  const by = (size, purpose) => man.icons.find((i) => i.sizes === size && (i.purpose || 'any') === purpose);
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const i = by(size, purpose);
    assert.ok(i, `no ${purpose} ${size} icon`);
    assert.ok(fs.existsSync(path.join(app, i.src)), `${i.src} is missing`);
  }
});

test('install: the manifest describes the app for the install sheet', () => {
  const man = JSON.parse(fs.readFileSync(path.join(app, 'manifest.webmanifest'), 'utf8'));
  assert.equal(man.id, './');
  assert.ok(man.description && man.description.length > 20, 'a short description');
  assert.equal(man.display, 'standalone');
  const shots = man.screenshots || [];
  for (const [form, size] of [['narrow', '1080x1920'], ['wide', '1920x1080']]) {
    const s = shots.find((x) => x.form_factor === form);
    assert.ok(s, `no ${form} screenshot`);
    assert.equal(s.sizes, size);
    assert.ok(s.label, `the ${form} screenshot has no label`);
    const p = readPng(path.join(app, s.src));
    assert.deepEqual(`${p.w}x${p.h}`, size, s.src);
  }
  // before the page runs, the bar is the icon's orange (the home band; «Balão», 2026-10-28)
  const index = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
  assert.match(index, /<meta name="theme-color" content="#F25C05" media="\(prefers-color-scheme: light\)">/);
  assert.match(index, /<meta name="theme-color" content="#F25C05" media="\(prefers-color-scheme: dark\)">/);
});

test('assets: the page links an SVG favicon, a 180 px Apple icon and the manifest', () => {
  const index = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
  assert.match(index, /<link rel="icon" type="image\/svg\+xml" href="assets\/brand\/icon-small\.svg">/);
  assert.match(index, /<link rel="icon" type="image\/png" sizes="32x32" href="assets\/icons\/icon-32\.png">/);
  assert.match(index, /<link rel="apple-touch-icon" sizes="180x180" href="assets\/icons\/icon-180\.png">/);
  // the manifest is linked by the app when it is served over http(s) (a file:// page cannot read it)
  assert.match(fs.readFileSync(path.join(app, 'js', 'app.js'), 'utf8'), /link\.rel = 'manifest'; link\.href = 'manifest\.webmanifest';/);
});

test('assets: the motion tokens', () => {
  const token = (name) => { const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css); return m && m[1].trim(); };
  assert.equal(token('--dur-press'), '120ms');
  assert.equal(token('--dur-fast'), '160ms');
  assert.equal(token('--dur-normal'), '260ms');
  assert.equal(token('--dur-slow'), '420ms');
  assert.match(token('--ease-spring'), /^linear\(0, /);
  // browsers without linear() get a spring-like curve instead
  assert.match(css, /@supports not \(transition-timing-function: linear\(0, 1\)\)\s*\{\s*:root\s*\{\s*--ease-spring:\s*cubic-bezier\(/);
});

test('install: an installed app fades in from the orange splash', () => {
  const man = JSON.parse(fs.readFileSync(path.join(app, 'manifest.webmanifest'), 'utf8'));
  // the manifest has one colour: the icon's orange (the splash), in both themes
  assert.equal(man.background_color, '#F25C05');
  const rule = /html\.from-splash #boot::before\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'no splash layer on the start screen');
  assert.match(rule[1], new RegExp(`background:\\s*${man.background_color}`), 'the layer is not the splash colour');
  const anim = /animation:\s*([\w-]+)/.exec(rule[1]);
  assert.ok(anim, 'the splash layer does not fade');
  const k = keyframes(css).find((x) => x.name === anim[1]);
  assert.ok(k && /opacity:\s*0/.test(k.body), `@keyframes ${anim[1]} does not fade out`);
});

test('motion: taps go through a screen change that is animating (a new tap wins)', () => {
  assert.match(css, /::view-transition\s*\{[^}]*pointer-events:\s*none/);
});

test('motion: iPhone Safari applies :active (the press) only when the page listens to touches', () => {
  const js = fs.readFileSync(path.join(app, 'js', 'app.js'), 'utf8');
  assert.match(js, /document\.addEventListener\('touchstart', [^,]+, \{ passive: true \}\)/);
});

// deferred minor (2026-10-29): the pieces the «Balão» round replaced leave no CSS behind
test('assets: no rules left for the replaced loaders, stamp, bricks and trowel', () => {
  for (const c of ['cota-loader', 'cota-line', 'cota-tick', 'cota-arrow', 'cota-label', 'cota', 'brick-loader', 'bricks', 'brick', 'brick-label', 'stamp', 'celebration-bricks', 'fx-brick', 'save-check', 'save-trowel', 'ws-tip']) {
    assert.ok(!new RegExp(`\\.${c}(?![\\w-])`).test(css), `.${c} is still in app.css`);
  }
});
test('assets: every feel- keyframes is used by an animation', () => {
  for (const k of keyframes(css).filter((x) => x.name.startsWith('feel-'))) {
    assert.ok(new RegExp(`animation(-name)?\\s*:[^;}]*\\b${k.name}(?![\\w-])`).test(css), `@keyframes ${k.name} is never used`);
  }
});
