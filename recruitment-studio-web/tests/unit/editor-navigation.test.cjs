// The editor's navigation (2026-10-27, Task 8): one rail for the three pieces
// (Oferta · Contactos · Fotos · Estilo, + Sequência on Carrossel and Vídeo),
// the management tools in ⋯, «Definições» out of the rail.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const piece = ($$, name) => $$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === name);
const railNames = ($$) => $$('.rail [role="tab"]').map((b) => b.textContent.trim());
const railTab = ($$, name) => $$('.rail [role="tab"]').find((b) => b.textContent.trim() === name);
async function open(a) { await a.click(a.$('.proj-open')); await a.until(() => a.$('.editor'), 'editor'); }
async function openMenu(a) {
  await a.click(a.$('.editor-more'));
  return a.until(() => a.$('.editor-menu[role="menu"]'), 'the ⋯ menu');
}
const items = (a) => a.$$('.editor-menu [role="menuitem"]').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
// the video drawn by a stand-in (real drawing is tested in Edge); counts the preparations
function stubVideo(RS) {
  const calls = { prepare: 0 };
  RS.motion.prepare = (p, o) => { calls.prepare++; return { fmt: RS.model.FORMATS[o.format], locale: o.locale, style: { id: 'neon', name: 'Néon' }, timeline: { duration: 8, scenes: [{ kind: 'hook', start: 0, end: 8 }] } }; };
  RS.motion.render = () => {};
  RS.motion.leftOut = () => ({ benefits: 0, highlights: 0, positions: 0 });
  RS.motion.lengths = () => ({ options: [{ value: 'auto', seconds: 8, ok: true }, { value: 10, ok: true }], adds: 'benefits' });
  return calls;
}

test('rail: Imagem has Oferta, Contactos, Fotos, Estilo; Carrossel and Vídeo add Sequência; no «Definições» or «Vídeo»', async (t) => {
  const a = await app(t), { $$, click } = a;
  await open(a);
  assert.deepEqual(railNames($$), ['Oferta', 'Contactos', 'Fotos', 'Estilo']);
  await click(piece($$, 'Carrossel'));
  assert.deepEqual(railNames($$), ['Oferta', 'Contactos', 'Fotos', 'Estilo', 'Sequência']);
  await click(piece($$, 'Vídeo'));
  assert.deepEqual(railNames($$), ['Oferta', 'Contactos', 'Fotos', 'Estilo', 'Sequência']);
  assert.equal($$('.rail button').some((b) => /Definições/.test(b.textContent)), false);
});

test('rail: on a phone the floating bar holds at most six buttons in every piece; «Exportar» is in the top bar', async (t) => {
  const a = await app(t, 390), { $$, click } = a;
  await open(a);
  for (const name of ['Imagem', 'Carrossel', 'Vídeo']) {
    await click(piece($$, name));
    assert.ok($$('.rail button').length <= 6, `${name}: ${$$('.rail button').length} buttons`);
    // «Balão» (2026-10-28): «Exportar» left the floating bar for the top bar
    assert.ok(!$$('.rail button').some((b) => /Exportar/.test(b.textContent)), `${name}: Exportar still in the floating bar`);
    assert.ok($$('.topbar .btn.primary').some((b) => /Exportar/.test(b.textContent)), `${name}: no Exportar in the top bar`);
  }
});

test('⋯: no management buttons in the panels; the menu lists «Comparar formatos» and the eight items with their counts', async (t) => {
  const a = await app(t, 1280, (p) => { p.captions = { 'pt-PT': 'Texto meu' }; }), { $, $$, RS, p } = a;
  await open(a);
  assert.ok(!$('.project-tools'), '$(.project-tools) is still there');
  const data = (await RS.store.getProject(p.id)).data;
  const pending = data.locales.flatMap((c) => RS.workflow.reviewRows(data, c)).filter((r) => r.status !== 'reviewed').length;
  assert.ok(pending > 0, 'the fixture has translations to review');
  assert.equal($('.topbar .editor-more .more-count').textContent.trim(), String(pending + 1));
  await openMenu(a);
  // «Balão» (2026-10-28): «Comparar formatos» left the stage for the top of the ⋯
  assert.deepEqual(items(a), ['Comparar formatos', 'Guardar ficheiro', 'Histórico de versões', 'Mostrar QR', 'Organizar', `Rever traduções (${pending})`, 'Rever publicação · PT', 'Marcas e modelos', 'Definições']);
  // the language with something to review is marked on its chip
  assert.ok($$('.locales .chip').find((c) => /FR/.test(c.textContent)).querySelector('.chip-dot'));
  // Codex pin: the removed tools stay removed
  assert.equal($$('.editor-menu button').some((b) => /Planear publicação|Textos guardados/.test(b.textContent)), false);
});

test('⋯: «Definições» opens the settings sheet; «Mostrar QR» opens the QR', async (t) => {
  const a = await app(t), { $, $$, click, until } = a;
  await open(a);
  await openMenu(a);
  await click($$('.editor-menu [role="menuitem"]').find((b) => /Definições/.test(b.textContent)));
  await until(() => $('#settings-title'), 'the settings sheet');
  await click($('.settings-sheet .modal-head .icon-btn'));
  await until(() => !$('#settings-title'), 'settings closed');
  await openMenu(a);
  await click($$('.editor-menu [role="menuitem"]').find((b) => /Mostrar QR/.test(b.textContent)));
  await until(() => $('.meet'), 'the QR');
});

test('Vídeo: «Oferta» shows the ad\'s texts while the video stays on the stage; typing prepares it again once', async (t) => {
  const a = await app(t), { $, $$, click, type, until, pause, RS } = a;
  const calls = stubVideo(RS);
  await open(a);
  await click(piece($$, 'Vídeo'));
  await until(() => $('.video-stage') && calls.prepare > 0, 'the video stage');
  await click(railTab($$, 'Oferta'));
  await until(() => $('#f-headline'), 'the ad texts');
  assert.ok($('.video-stage'), 'the video left the stage');
  assert.equal(piece($$, 'Vídeo').getAttribute('aria-checked'), 'true');
  await pause(200);
  const before = calls.prepare;
  await type($('#f-headline'), 'Pedreiros em Lausanne');
  await until(() => calls.prepare > before, 'the video prepared again');
  await pause(300);
  assert.equal(calls.prepare, before + 1);
  assert.ok($('.video-stage'));
});

test('Vídeo: «Sequência» holds the length, the texts and the sound, without inner tabs; «Estilo» the models; «Fotos» the photos', async (t) => {
  const a = await app(t), { $, $$, click, until, RS } = a;
  stubVideo(RS);
  await open(a);
  await click(piece($$, 'Vídeo'));
  await click(railTab($$, 'Sequência'));
  await until(() => $('#video-duration'), 'Duração');
  assert.ok($('.vt-panel'), 'the video texts');
  assert.ok($$('.group h3').some((h) => /Som/.test(h.textContent)), 'Som');
  assert.ok(!$('.video-tabs'), '$(.video-tabs) is still there');
  await click(railTab($$, 'Estilo'));
  await until(() => $$('.group h3').some((h) => /Receitas/.test(h.textContent)), 'Receitas');
  assert.ok(!$('#video-duration'), '$(#video-duration) is still there');
  await click(railTab($$, 'Fotos'));
  await until(() => $('.panel h2') && /Fotos/.test($('.panel h2').textContent), 'Fotos');
});
