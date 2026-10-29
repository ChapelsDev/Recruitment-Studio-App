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

test('dark tokens', () => {
  expectAll(block(":root[data-theme='dark']"), {
    '--chrome': '#1E2125', '--paper': '#292D32', '--field': '#292D32',
    '--ink': '#F3F4F5', '--ink-2': '#E9ECEF', '--muted': '#A6AEB8', '--line': '#383D43', '--line-2': '#474D55',
    '--signal': '#F25C05', '--on-signal': '#000000', '--signal-soft': '#5A2E12',
    '--say': '#383D44', '--say-ink': '#E9ECEF', '--pill-on': '#F3F4F5', '--pill-on-ink': '#1E2125',
    '--done': '#3DDC84', '--wa': '#25D366',
  });
});

test('the shapes', () => {
  expectAll(block(':root'), {
    '--r-bubble': '22px 22px 22px 6px', '--r-bubble-sm': '14px 14px 14px 4px', '--r-sheet': '24px', '--r-dialog': '20px',
  });
});

test('no --table: the stage sits on the page colour', () => {
  assert.ok(!/--table\b/.test(css), 'the dark light table is still there');
});
