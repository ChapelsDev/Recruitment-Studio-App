// The «Balão» editor (2026-10-28): a calm top bar in three groups, the formats
// and languages above the poster, panels without intro sentences, notes under
// the field that caused them, and «Exportar» the only orange control.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
const nameOf = (b) => b.getAttribute('aria-label') || text(b);
// the video drawn by a stand-in (real drawing is tested in Edge)
function stubVideo(RS) {
  RS.motion.prepare = (p, o) => ({ fmt: RS.model.FORMATS[o.format], locale: o.locale, style: { id: 'neon', name: 'Néon' }, timeline: { duration: 8, scenes: [{ kind: 'hook', start: 0, end: 8 }] } });
  RS.motion.render = () => {};
  RS.motion.leftOut = () => ({ benefits: 0, highlights: 0, positions: 0 });
  RS.motion.lengths = () => ({ options: [{ value: 'auto', seconds: 8, ok: true }, { value: 10, ok: true }], adds: 'benefits' });
}
// happy-dom lays nothing out: the stage gets a size so the poster is drawn (and reports)
function sizedStage(w) {
  w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { this.cb([{ contentRect: { width: 800, height: 900 } }]); } unobserve() {} disconnect() {} };
}
async function editor(t, width = 1280) {
  const a = await app(t, width, (p, RS, w) => { stubVideo(RS); sizedStage(w); });
  await a.click(a.$('.proj-open'));
  await a.until(() => a.$('.editor') && a.$('#f-headline'), 'the editor');
  return a;
}
const piece = (a, name) => a.$$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => text(b) === name);
async function goPiece(a, name) {
  await a.click(piece(a, name));
  await a.until(() => (name === 'Vídeo' ? a.$('.video-stage') : name === 'Carrossel' ? a.$('.carousel-stage') : a.$('.workspace')), `the ${name} piece`);
}
const railButtons = (a) => a.$$('.editor .rail button[role="tab"]');
const report = (a) => a.RS.engine.render().report;

test('the top bar in three groups', async (t) => {
  const a = await editor(t);
  assert.ok(a.$('.topbar .tb-left .name-wrap'), 'no name on the left');
  assert.ok(a.$('.topbar .tb-center [aria-label="Peça"]'), 'no pieces in the centre');
  const names = a.$$('.topbar .tb-right button').map(nameOf);
  assert.equal(names.length, 4, names.join(' | '));
  assert.match(names[0], /^Desfazer/); assert.match(names[1], /^Refazer/); assert.match(names[2], /^Mais opções/); assert.match(names[3], /Exportar/);
  assert.equal(a.$('.topbar .locales'), null, 'the languages are still in the top bar');
});

test('formats and languages above the poster, in every piece', async (t) => {
  const a = await editor(t);
  for (const name of ['Imagem', 'Carrossel', 'Vídeo']) {
    await goPiece(a, name);
    assert.ok(a.$('.stage-top [role="radiogroup"]'), `${name}: no formats above the poster`);
    assert.ok(a.$('.stage-top .locales'), `${name}: no languages above the poster`);
  }
});

test('the ⋯ holds «Comparar formatos»', async (t) => {
  const a = await editor(t);
  await a.click(a.$('.topbar .editor-more'));
  const item = a.$$('.editor-menu [role="menuitem"]').find((b) => text(b) === 'Comparar formatos');
  assert.ok(item, 'no «Comparar formatos» in the ⋯');
  assert.equal(text(a.$$('.editor-menu [role="menuitem"]')[0]), 'Comparar formatos');
  await a.click(item);
  await a.until(() => a.$('.format-comparison'), 'the comparison dialog');
});

test('panels open with their title only', async (t) => {
  const a = await editor(t);
  for (const name of ['Imagem', 'Carrossel', 'Vídeo']) {
    await goPiece(a, name);
    for (let i = 0; i < railButtons(a).length; i++) {
      const b = railButtons(a)[i];
      await a.click(b);
      await a.until(() => a.$('#editor-panel .panel-head'), `${name} › ${text(b)}`);
      assert.equal(a.$('#editor-panel .panel-head p'), null, `${name} › ${text(b)} still opens with a sentence`);
    }
  }
});

test('a long title shows its note under the title', async (t) => {
  const a = await editor(t);
  report(a).shrink = 0.8;
  await a.type(a.$('#f-headline'), 'Oficiais, encarregados e serventes de construção civil');
  const note = await a.until(() => a.$('#f-headline').closest('.field').querySelector('.field-note'), 'the note under the title');
  assert.equal(text(note), 'Título longo, a letra ficou mais pequena.');
  assert.ok(note.classList.contains('say'));
  assert.equal(a.$('.ws-notes'), null, 'the old notes row is still under the poster');
});

test('a shrink from Estilo shows its note under the poster', async (t) => {
  const a = await editor(t);
  await a.click(railButtons(a).find((b) => text(b) === 'Estilo'));
  const control = await a.until(() => a.$('#editor-panel input[type="range"]'), 'a control in Estilo');
  report(a).shrink = 0.8;
  control.value = String(Number(control.value || 1) + 0.05);
  control.dispatchEvent(new a.w.Event('input', { bubbles: true }));
  const note = await a.until(() => a.$('.stage-note'), 'the note under the poster');
  assert.equal(text(note), 'Texto longo, a letra ficou mais pequena.');
});

test('«Exportar» is the only orange control', async (t) => {
  const a = await editor(t);
  const primaries = a.$$('.editor .btn.primary');
  assert.equal(primaries.length, 1, primaries.map(text).join(' | '));
  assert.match(text(primaries[0]), /Exportar/);
});

// ---------------------------------------------------------------- the phone (≤ 860 px)
// 2026-10-29 («Sem barra»): the name is in the ⋯, the save signal stays beside ‹
test('phone top bar: back, the save signal, Exportar; no Exportar in the floating bar; no «Recolher pré-visualização»', async (t) => {
  const a = await editor(t, 390);
  assert.ok(a.$('.topbar .tb-left .tb-back') && a.$('.topbar .tb-left .save-state'), 'no back or save signal on the left');
  assert.ok(!a.$('.topbar .name-wrap'), 'the name is still on top');
  const right = a.$$('.topbar .tb-right button').map(nameOf);
  assert.equal(right.length, 1, right.join(' | '));
  assert.match(right[0], /Exportar/);
  assert.equal(a.$('.rail .rail-export'), null, '«Exportar» is still in the floating bar');
  assert.equal(a.$('.preview-toggle'), null, '«Recolher pré-visualização» is still there');
});

test('phone: the stage tools row', async (t) => {
  const a = await editor(t, 390);
  const row = a.$('.stage-tools');
  assert.ok(row, 'no tools row on the stage');
  assert.ok(row.querySelector('[role="radiogroup"]'), 'no formats');
  assert.ok(row.querySelector('.locales'), 'no language');
  const names = [...row.querySelectorAll('button')].map(nameOf);
  assert.ok(names.some((n) => /^Desfazer/.test(n)) && names.some((n) => /^Refazer/.test(n)), names.join(' | '));
  await a.click(row.querySelector('.editor-more'));
  const items = a.$$('.editor-menu [role="menuitem"]').map(text);
  assert.ok(items.includes('Comparar formatos'), items.join(' | '));
  // 2026-10-29: the panel's bottom stop gives the preview its largest size
  assert.ok(!items.includes('Ampliar') && !items.includes('Reduzir'), items.join(' | '));
});

// 2026-10-29: three stops; the chevron goes up one stop at a time, then back to the bottom
test('phone: the chevron cycles the panel through its stops', async (t) => {
  const a = await editor(t, 390);
  assert.ok(a.$('.editor.sheet-middle'), 'the panel does not open at the middle');
  for (const stop of ['top', 'bottom', 'middle']) {
    await a.click(a.$('.sheet-toggle'));
    assert.ok(a.$(`.editor.sheet-${stop}`), `the chevron did not go to ${stop}`);
  }
});

test('phone: writing moves the sheet up', async (t) => {
  const a = await editor(t, 390);
  const field = a.$('#f-headline');
  field.dispatchEvent(new a.w.FocusEvent('focusin', { bubbles: true }));
  await a.pause(30);
  assert.ok(a.$('.editor.sheet-top'), 'writing did not move the sheet up');
});

// final review (2026-10-28): choosing a colour or moving a slider needs the poster in view
test('phone: a colour or a slider keeps the poster in view', async (t) => {
  const a = await editor(t, 390);
  await a.click(railButtons(a).find((b) => text(b) === 'Estilo'));
  for (const sel of ['#editor-panel input[type="color"]', '#editor-panel input[type="range"]']) {
    const el = await a.until(() => a.$(sel), sel);
    el.dispatchEvent(new a.w.FocusEvent('focusin', { bubbles: true }));
    await a.pause(30);
    assert.ok(!a.$('.editor.sheet-top'), `${sel} moved the sheet up`); // (a DOM node in an assertion takes minutes to print)
  }
});

// owner (2026-10-28): a note stays under the field being written when the letters shrank
test('a shrink caused by the title stays under the title while another field is written', async (t) => {
  const a = await editor(t);
  report(a).shrink = 0.8;
  await a.type(a.$('#f-headline'), 'Oficiais, encarregados e serventes de construção civil');
  await a.until(() => a.$('#f-headline').closest('.field').querySelector('.field-note'), 'the note under the title');
  await a.type(a.$('#f-kicker'), 'Vagas abertas já');
  await a.pause(30);
  assert.ok(a.$('#f-headline').closest('.field').querySelector('.field-note'), 'the note left the title');
  assert.ok(!a.$('#f-kicker').closest('.field').querySelector('.field-note'), 'the note moved under the kicker');
});

test('a shrink from an Estilo button stays under the poster, also when the title is written afterwards', async (t) => {
  const a = await editor(t);
  report(a).shrink = 1;
  await a.type(a.$('#f-headline'), 'Pedreiros');
  await a.click(railButtons(a).find((b) => text(b) === 'Estilo'));
  const pal = await a.until(() => a.$$('#editor-panel .palette').find((b) => !b.classList.contains('on')), 'a palette');
  report(a).shrink = 0.8;
  await a.click(pal);
  await a.until(() => a.$('.stage-note'), 'the note under the poster');
  await a.click(railButtons(a).find((b) => text(b) === 'Oferta'));
  await a.until(() => a.$('#f-headline'), 'Oferta');
  await a.type(a.$('#f-headline'), 'Pedreiros e serventes');
  await a.pause(30);
  assert.ok(!a.$('#f-headline').closest('.field').querySelector('.field-note'), 'the Estilo note went under the title');
  assert.ok(a.$('.stage-note'), 'no note under the poster');
});

// ---------------------------------------------------------------- deferred minors (2026-10-29)
test('the WhatsApp ✓ pops only when the number is completed, not on load', async (t) => {
  const a = await app(t, 1280, (p, RS, w) => { stubVideo(RS); sizedStage(w); p.whatsapp = { country: '351', number: '912345678' }; });
  await a.click(a.$('.proj-open'));
  await a.until(() => a.$('.editor') && a.$('#f-headline'), 'the editor');
  await a.click(railButtons(a).find((b) => text(b) === 'Contactos'));
  const ok = await a.until(() => a.$('.field-ok'), 'the ✓ of a complete number');
  assert.ok(!ok.classList.contains('pop'), 'the ✓ pops on load');
  await a.type(a.$('#f-contact-wa'), '91');
  await a.type(a.$('#f-contact-wa'), '912 345 678');
  const again = await a.until(() => a.$('.field-ok'), 'the ✓ again');
  assert.ok(again.classList.contains('pop'), 'the ✓ does not pop when the number is completed');
});

test('an ad without trades: its automatic name follows the title as it is written', async (t) => {
  const a = await app(t, 1280, (p, RS, w) => { stubVideo(RS); sizedStage(w); p.trades = []; p.nameAuto = true; });
  await a.click(a.$('.proj-open'));
  await a.until(() => a.$('#f-headline'), 'the editor');
  await a.type(a.$('#f-headline'), 'Ajudantes de cozinha');
  await a.until(() => a.$('.topbar .name-input') && a.$('.topbar .name-input').value === 'Ajudantes de cozinha', 'the name to follow the title', 2000);
});
