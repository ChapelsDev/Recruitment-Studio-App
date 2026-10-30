// The phone editor of 2026-10-29: no bar on top, a panel with three stops, the
// video as a player; and «Zonas» gone from the video on every screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
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
async function editor(t, width = 1280, more = () => {}) {
  const a = await app(t, width, (p, RS, w) => { stubVideo(RS); sizedStage(w); more(p, RS, w); });
  await a.click(a.$('.proj-open'));
  await a.until(() => a.$('.editor') && a.$('#f-headline'), 'the editor');
  return a;
}
const piece = (a, name) => a.$$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => text(b) === name || b.getAttribute('aria-label') === name);
async function goPiece(a, name) {
  await a.click(piece(a, name));
  await a.until(() => (name === 'Vídeo' ? a.$('.video-stage') : name === 'Carrossel' ? a.$('.carousel-stage') : a.$('.workspace')), `the ${name} piece`);
}

test('phone-editor: no «Zonas» on the video, PC or phone', async (t) => {
  for (const width of [1280, 390]) {
    const a = await editor(t, width);
    await goPiece(a, 'Vídeo');
    const zonas = a.$$('.video-stage button').filter((b) => /Zonas/.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '')));
    assert.equal(zonas.length, 0, `${width}: a «Zonas» button`);
    assert.ok(!a.$('.video-safe-guides'), `${width}: the safe-zone overlay`);
  }
});

test('phone-editor: the image keeps «Zonas do Instagram» on the PC in Story', async (t) => {
  const a = await editor(t, 1280);
  await a.click(a.$$('.stage-top [role="radiogroup"] [role="radio"]').find((b) => /^Story/.test(b.getAttribute('aria-label') || '')));
  await a.until(() => a.$$('.workspace .switch').some((l) => /Zonas do Instagram/.test(l.textContent)), '«Zonas do Instagram»');
});

// ---------------------------------------------------------------- the panel: three stops
const railButtons = (a) => a.$$('.editor .rail button[role="tab"]');
test('phone-editor: the panel opens at the middle stop with a draggable head', async (t) => {
  const a = await editor(t, 390);
  assert.ok(a.$('.editor.sheet-middle'), 'not at the middle');
  assert.ok(a.$('.panel .sheet-head .sheet-grip') && a.$('.panel .sheet-head h2'), 'no grip or title in the head');
  assert.equal(text(a.$('.panel .sheet-head h2')), 'Oferta');
  assert.equal(a.$('.sheet-toggle').getAttribute('aria-label'), 'Painel a meio. Subir.');
  assert.ok(!a.$('.sheet-handle'), 'the old handle is still there');
});

test('phone-editor: a section tapped on the bar raises a panel at the bottom', async (t) => {
  const a = await editor(t, 390);
  await a.click(a.$('.sheet-toggle')); await a.click(a.$('.sheet-toggle'));
  assert.ok(a.$('.editor.sheet-bottom'), 'not at the bottom');
  assert.equal(a.$('.sheet-toggle').getAttribute('aria-label'), 'Painel em baixo. Subir.');
  await a.click(railButtons(a).find((b) => text(b) === 'Contactos'));
  await a.until(() => a.$('.editor.sheet-middle'), 'the panel at the middle');
});

test('phone-editor: stops follow the window height', async (t) => {
  const a = await editor(t, 390);
  const want = (h) => `${a.RS.phone.stops(h, { safeTop: 0, barRoom: 104, head: 60 }).middle}px`;
  assert.equal(a.$('.editor').style.getPropertyValue('--sheet-y'), want(900));
  a.w.happyDOM.setViewport({ width: 390, height: 600 });
  a.w.dispatchEvent(new a.w.Event('resize'));
  await a.until(() => a.$('.editor').style.getPropertyValue('--sheet-y') === want(600), `--sheet-y ${want(600)}`);
});

test('phone-editor: the PC has no panel stops', async (t) => {
  const a = await editor(t, 1280);
  assert.ok(!a.$('.sheet-head'));
  assert.equal(a.$('.editor').style.getPropertyValue('--sheet-y'), '');
});

// ---------------------------------------------------------------- the carousel on the phone
// (the counter sits on the slide's corner, as Instagram's «1/8»: the tools row has no room for it)
test('phone-editor: the carousel has no arrows or dots on the phone; the counter is a badge on the slide', async (t) => {
  const a = await editor(t, 390);
  await goPiece(a, 'Carrossel');
  assert.equal(a.$$('.cs-nav button').length, 0, 'arrows on the phone');
  assert.ok(!a.$('.cs-dots'), 'dots on the phone');
  // (happy-dom prepares no slides: the «01 / 0N» text is checked in Edge, ui-mobile.case.js)
  await a.until(() => a.$('.carousel-stage .cs-track .cs-count.cs-badge'), 'the counter on the slide');
  assert.ok(!a.$('.carousel-stage .tools-row .cs-count'), 'a counter in the tools row');
});

test('phone-editor: the PC keeps the carousel arrows and dots', async (t) => {
  const a = await editor(t, 1280);
  await goPiece(a, 'Carrossel');
  await a.until(() => a.$$('.cs-nav button').length === 2 && a.$('.cs-dots'), 'arrows and dots on the PC');
});

// ---------------------------------------------------------------- «Sem barra»: the floating top
test('phone-editor: no name in the floating top; ‹, pieces, Exportar', async (t) => {
  const a = await editor(t, 390);
  assert.ok(!a.$('.topbar .name-wrap'), 'the name is still on top');
  assert.ok(a.$('.topbar .tb-back') && a.$('.topbar [aria-label="Peça"]'), 'no back or pieces');
  assert.equal(a.$('.topbar .btn.primary').getAttribute('aria-label'), 'Exportar');
});

test('phone-editor: the name is in the ⋯; the save signal stays beside ‹', async (t) => {
  const a = await editor(t, 390);
  assert.equal(a.$('.topbar .tb-left .save-state').getAttribute('role'), 'status', 'no save signal beside ‹');
  assert.ok(!a.$('.name-input'), 'a name field outside the ⋯');
  await a.click(a.$('.editor-more'));
  const field = await a.until(() => a.$('.editor-menu .name-input'), 'the name in the ⋯');
  assert.equal(field.value, 'Anúncio de teste');
  assert.ok(a.$('.editor-menu .menu-save'), 'no save words in the ⋯');
  await a.type(field, 'Nome novo');
  await a.until(async () => (await a.RS.store.getProject(a.p.id)).name === 'Nome novo', 'the new name saved');
});

test('phone-editor: the image tools row floats over the preview', async (t) => {
  const a = await editor(t, 390);
  const row = a.$('.workspace .stage-tools.tools-row');
  assert.ok(row, 'no tools row');
  assert.ok(row.querySelector('[role="radiogroup"]') && row.querySelector('.locales') && row.querySelector('.editor-more'), 'formats, language or ⋯ missing');
});

test('phone-editor: the save warning shows without a top bar', async (t) => {
  const a = await editor(t, 390);
  a.RS.store.putProject = async () => { throw new Error('Espaço insuficiente'); };
  await a.type(a.$('#f-headline'), 'Outro título');
  await a.until(() => a.$('.topbar .save-recovery[role="alert"]'), 'the save warning');
});

test('phone-editor: «Converter em vídeo» does not come back', async (t) => {
  const a = await editor(t, 390);
  await a.click(a.$('.editor-more'));
  await a.until(() => a.$('.editor-menu'), 'the ⋯ menu');
  assert.ok(!a.$$('button').some((b) => /Converter em vídeo/.test(b.textContent + ' ' + (b.getAttribute('aria-label') || ''))));
});

// ---------------------------------------------------------------- the video as a player (phone)
const quick = (p, RS) => { RS.phone.HIDE_MS = 200; };
test('phone-editor: the video is a player, no timeline card', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.until(() => a.$('.video-stage .player'), 'the player');
  assert.ok(!a.$('.video-stage .video-timeline'), 'the timeline card is still there');
  assert.ok(!a.$('.video-stage .ws-notes'), 'the notes row is still there');
  assert.ok(a.$('.player [aria-label="Escolher capa"]') && a.$('.player [aria-label="Ecrã inteiro"]'), 'no «Capa» or ⛶');
  assert.ok(a.$('.player input.player-seek[type="range"]'), 'no seek bar');
});

test('phone-editor: buttons hide after the delay while playing, with the floating top', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.until(() => a.$('.player.ctl'), 'the buttons on arrival');
  await a.until(() => !a.$('.player.ctl') && a.$('.editor.chrome-off'), 'the buttons and the top to hide');
  await a.click(a.$('.player'));
  await a.until(() => a.$('.player.ctl') && !a.$('.editor.chrome-off'), 'a tap to bring everything back');
});

test('phone-editor: paused video keeps every button', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.until(() => a.$('.player-play'), 'the play button');
  await a.click(a.$('.player-play'));
  await a.until(() => a.$('.video-stage.paused'), 'paused');
  await a.pause(450);
  assert.ok(a.$('.player.ctl'), 'the buttons hid while paused');
  assert.ok(!a.$('.editor.chrome-off'), 'the top hid while paused');
});

test('phone-editor: full screen hides the top, the panel and the bar; Escape leaves', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.click(await a.until(() => a.$('.player [aria-label="Ecrã inteiro"]'), '⛶'));
  await a.until(() => a.$('.editor.player-full'), 'full screen');
  assert.ok(a.$('.player [aria-label="Sair do ecrã inteiro"] path').getAttribute('d'), 'the ⛶ icon is empty');
  assert.ok(a.$('.player [aria-label="Sair do ecrã inteiro"]'), 'no way out');
  a.w.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await a.until(() => !a.$('.editor.player-full'), 'Escape to leave');
});

test('phone-editor: the PC keeps the timeline card and «Escolher capa»', async (t) => {
  const a = await editor(t, 1280);
  await goPiece(a, 'Vídeo');
  await a.until(() => a.$('.video-stage .video-timeline'), 'the timeline card');
  assert.ok(a.$$('.video-stage button').some((b) => b.textContent.trim() === 'Escolher capa'));
  assert.ok(!a.$('.video-stage .player'), 'a player on the PC');
});

// ---------------------------------------------------------------- the hidden frame meter
test('phone-editor: five taps on the version in «Definições» show and hide the frame meter', async (t) => {
  const a = await app(t, 390);
  await a.click(a.$('.home-top .home-more'));
  await a.click(await a.until(() => a.$$('.home-menu [role="menuitem"]').find((b) => /Definições/.test(b.textContent)), '«Definições» in the ⋯'));
  const v = await a.until(() => a.$('.settings .settings-version'), 'the version line');
  for (let i = 0; i < 5; i++) await a.click(v);
  await a.until(() => a.$('.frame-meter'), 'the meter');
  for (let i = 0; i < 5; i++) await a.click(v);
  await a.until(() => !a.$('.frame-meter'), 'the meter to go');
});

// ---------------------------------------------------------------- final review fixes (2026-10-29)
test('phone-editor: without a prepared video the floating top stays', async (t) => {
  const a = await editor(t, 390, (p, RS) => { RS.phone.HIDE_MS = 200; RS.motion.prepare = () => null; });
  await goPiece(a, 'Vídeo');
  await a.pause(500);
  assert.ok(!a.$('.editor.chrome-off'), 'the ‹, the pieces and Exportar hid with no video to tap');
  assert.ok(/A preparar o vídeo/.test(text(a.$('.video-stage'))), 'no word while the video is prepared');
});

test('phone-editor: a focus or a held finger on the player keeps its buttons up', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.until(() => a.$('.player'), 'the player');
  await a.until(() => !a.$('.player.ctl'), 'the buttons to hide');
  a.$('.player-play').dispatchEvent(new a.w.FocusEvent('focusin', { bubbles: true }));
  await a.until(() => a.$('.player.ctl'), 'a focus to bring them back');
  // a finger held on a button keeps them up (no pointerup yet)
  a.$('.player-play').dispatchEvent(new a.w.PointerEvent('pointerdown', { bubbles: true }));
  await a.pause(450);
  assert.ok(a.$('.player.ctl'), 'the buttons hid under a held finger');
  a.$('.player-play').dispatchEvent(new a.w.PointerEvent('pointerup', { bubbles: true }));
  await a.until(() => !a.$('.player.ctl'), 'the buttons to hide after the finger lifts');
});

test('phone-editor: a menu open in the player keeps its buttons up', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.click(await a.until(() => a.$('.player .editor-more'), 'the ⋯ in the player'));
  await a.until(() => a.$('.player .editor-menu'), 'the menu');
  await a.pause(450);
  assert.ok(a.$('.player.ctl'), 'the buttons hid under an open menu');
});

test('phone-editor: the carousel keeps previous/next for screen readers on the phone', async (t) => {
  const a = await editor(t, 390);
  await goPiece(a, 'Carrossel');
  const next = await a.until(() => a.$('.carousel-stage button[aria-label="Diapositivo seguinte"]'), 'next');
  assert.ok(next.classList.contains('sr-only'), 'the arrows are visible again');
  assert.ok(a.$('.carousel-stage button.sr-only[aria-label="Diapositivo anterior"]'), 'no previous');
});

// ---------------------------------------------------------------- deferred minors (2026-10-30)
test('phone-editor: leaving the video while in full screen leaves no history entry', async (t) => {
  const a = await editor(t, 390, quick);
  await goPiece(a, 'Vídeo');
  await a.click(await a.until(() => a.$('.player [aria-label="Ecrã inteiro"]'), '⛶'));
  await a.until(() => a.$('.editor.player-full'), 'full screen');
  assert.ok(a.w.history.state && a.w.history.state.rsPlayerFull, 'no history entry for full screen');
  await goPiece(a, 'Imagem');
  await a.until(() => !(a.w.history.state && a.w.history.state.rsPlayerFull), 'the full-screen entry gone');
});
