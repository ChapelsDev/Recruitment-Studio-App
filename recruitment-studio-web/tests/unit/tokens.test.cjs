// The «Balão» colours and shapes (2026-10-28): the token values of the spec, in
// both themes, under the stylesheet's existing names plus the new ones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../../assets/app.css'), 'utf8');
const block = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `no block ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};
const value = (text, name) => {
  const m = text.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim().toLowerCase() : null;
};
const expectAll = (text, map) => {
  for (const [name, want] of Object.entries(map)) assert.equal(value(text, name), want.toLowerCase(), name);
};

test('light tokens', () => {
  expectAll(block(':root, .meet'), {
    '--chrome': '#EEF0F2', '--paper': '#FFFFFF', '--raised': '#FFFFFF', '--field': '#FFFFFF',
    '--ink': '#000000', '--ink-2': '#1E242A', '--muted': '#59626D', '--line': '#E1E4E8', '--line-2': '#D2D7DC',
    '--signal': '#F25C05', '--on-signal': '#000000', '--signal-soft': '#FFE3D1',
    '--say': '#E4E8EB', '--say-ink': '#1E242A', '--pill-on': '#000000', '--pill-on-ink': '#FFFFFF',
    '--done': '#128C4A', '--wa': '#25D366',
  });
});

// «Carvão quente» (2026-10-29): warm charcoal, a step up for panels and cards, the chosen
// things a filled orange pill with black text, nothing brown
test('dark tokens', () => {
  const dark = block(":root[data-theme='dark']");
  expectAll(dark, {
    '--chrome': '#13100E', '--paper': '#1F1A16', '--raised': '#2B241F', '--field': '#181411',
    '--ink': '#FAF5F0', '--ink-2': '#F0E8E1', '--muted': '#CDBFB3', '--line': '#372E28', '--line-2': '#4A3F37', '--line-3': '#5E5148',
    '--signal': '#F25C05', '--on-signal': '#000000', '--signal-soft': '#2B241F',
    '--say': '#2B241F', '--say-ink': '#F0E8E1', '--pill-on': '#F25C05', '--pill-on-ink': '#000000',
    '--seg': '#2B241F', '--seg-on': '#F25C05', '--on-ink': '#13100E',
    '--done': '#3DDC84', '--wa': '#25D366',
  });
  assert.ok(/--elev-hl:/.test(dark) && /--elev-shadow:/.test(dark), 'no depth tokens');
  assert.ok(!/#5A2E12/i.test(css), 'the brown is still in the stylesheet');
});

test('the shapes', () => {
  expectAll(block(':root'), {
    '--r-bubble': '22px 22px 22px 6px', '--r-bubble-sm': '14px 14px 14px 4px', '--r-sheet': '24px', '--r-dialog': '20px',
  });
});

test('no --table: the stage sits on the page colour', () => {
  assert.ok(!/--table\b/.test(css), 'the dark light table is still there');
});
