// The home and «Começar por» (2026-10-27, Task 9): a quiet home (tools in ⋯,
// search and «Filtros» only when there are enough ads), a shortcut per piece
// on each card, and a gallery that starts an ad on the piece chosen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const more = async (a) => { await a.click(a.$('.home-top .home-more')); return a.until(() => a.$('.home-menu[role="menu"]'), 'the home ⋯'); };
const itemsOf = (a) => a.$$('.home-menu [role="menuitem"]').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
async function extraAds(RS, n, edit = () => {}) {
  for (let i = 0; i < n; i++) {
    const q = RS.model.newProject(RS.templates.list[i % RS.templates.list.length]);
    q.name = `Anúncio ${i + 2}`;
    edit(q, i);
    await RS.store.putProject(q);
  }
}
const piece = (a, name) => a.$$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === name);
// the video drawn by a stand-in (real drawing is tested in Edge)
function stubVideo(RS) {
  RS.motion.prepare = (p, o) => ({ fmt: RS.model.FORMATS[o.format], locale: o.locale, style: { id: 'neon', name: 'Néon' }, timeline: { duration: 8, scenes: [{ kind: 'hook', start: 0, end: 8 }] } });
  RS.motion.render = () => {};
  RS.motion.leftOut = () => ({ benefits: 0, highlights: 0, positions: 0 });
  RS.motion.lengths = () => ({ options: [{ value: 'auto', seconds: 8, ok: true }, { value: 10, ok: true }], adds: 'benefits' });
}

test('home: with 2 ads there is no search, no filters and no row of tools; ⋯ holds the tools and «Definições»', async (t) => {
  const a = await app(t, 1280, async (p, RS) => { await extraAds(RS, 1); });
  await a.until(() => a.$$('.proj-card').length === 2, 'two ads');
  assert.ok(!a.$('#project-search'), 'a.$(#project-search) is still there');
  assert.ok(!a.$('.home-filters'), 'a.$(.home-filters) is still there');
  assert.ok(!a.$('.home-tools'), 'a.$(.home-tools) is still there');
  assert.ok(!a.$('.home-top .settings-btn'), 'a.$(.home-top .settings-btn) is still there');
  assert.ok(a.$('.home-top button[aria-label="Mostrar QR"]'), 'no «Mostrar QR» on the home');
  await more(a);
  const items = itemsOf(a);
  assert.equal(items.length, 6, items.join(' | '));
  assert.deepEqual([...items.slice(0, 4), items[5]], ['Abrir ficheiro', 'Marcas e modelos', 'Cópias de segurança', 'Reciclagem', 'Definições']);
  assert.match(items[4], /^Instalar/);
  await a.click(a.$$('.home-menu [role="menuitem"]').find((b) => /Definições/.test(b.textContent)));
  await a.until(() => a.$('#settings-title'), 'the settings sheet');
});

test('home: 8 ads show the search and «Filtros» (folded); an active filter keeps them with 2 matches', async (t) => {
  const a = await app(t, 1280, async (p, RS) => { await extraAds(RS, 7, (q, i) => { if (i < 2) q.organization = { ...RS.model.cleanOrganization(q.organization), favorite: true }; }); });
  await a.until(() => a.$$('.proj-card').length === 8, 'eight ads');
  assert.ok(a.$('#project-search'), 'no search with 8 ads');
  const toggle = a.$$('.home-filters button').find((b) => /^Filtros/.test(b.textContent.trim()));
  assert.ok(toggle, 'no «Filtros»');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(a.$('#filter-status').closest('[hidden]'), 'the filters are not folded');
  await a.click(toggle);
  assert.ok(!a.$('#filter-status').closest('[hidden]'), 'a.$(#filter-status).closest([hidden]) is still there');
  await a.click(a.$('.favorite-filter'));
  await a.until(() => a.$$('.proj-card').length === 2, 'two favourites');
  // fewer than 8 ads now (6 to the recycle bin): the active filter keeps the search and «Filtros»
  const recs = await a.RS.store.listProjects();
  for (const r of recs.filter((x) => !(x.data.organization || {}).favorite)) await a.RS.store.setDeleted(r.id, Date.now());
  await a.click(a.$('.new-card'));
  await a.until(() => a.$('.gallery'), 'the gallery');
  await a.click(a.$('.gallery .gal-head .btn.ghost'));
  await a.until(() => a.$('.home') && a.$$('.proj-card').length === 2, 'the home with 2 ads');
  assert.ok(a.$('#project-search'), 'the search left with the filter on');
  assert.ok(a.$$('.home-filters button').find((b) => /^Filtros/.test(b.textContent.trim())), '«Filtros» left with the filter on');
});

test('home: each card opens the ad on a piece; «Abrir no carrossel» opens it on «Carrossel»', async (t) => {
  const a = await app(t);
  const card = a.$('.proj-card');
  for (const label of ['Abrir na imagem', 'Abrir no carrossel', 'Abrir no vídeo']) assert.ok(card.querySelector(`button[aria-label^="${label}"]`), `no «${label}»`);
  await a.click(card.querySelector('button[aria-label^="Abrir no carrossel"]'));
  await a.until(() => a.$('.editor') && a.$('.carousel-stage'), 'the editor on the carousel');
  assert.equal(piece(a, 'Carrossel').getAttribute('aria-checked'), 'true');
});

test('gallery: «Começar por» Carrossel › Contrato creates an ad on «Carrossel» with that style', async (t) => {
  const a = await app(t);
  await a.click(a.$('.new-card'));
  await a.until(() => a.$('.gallery'), 'the gallery');
  const start = a.$$('.gallery [aria-label="Começar por"] [role="radio"]');
  assert.deepEqual(start.map((b) => b.textContent.trim()), ['Imagem', 'Carrossel', 'Vídeo']);
  await a.click(start[1]);
  const cards = await a.until(() => a.$$('.gallery .gal-style-card').length === 7 && a.$$('.gallery .gal-style-card'), 'the carousel styles');
  assert.deepEqual(cards.map((c) => c.dataset.style), ['ad', 'tijolo', 'numeros', 'contrato', 'notificacoes', 'planta', 'apresentacao']);
  await a.click(cards.find((c) => c.dataset.style === 'contrato'));
  await a.until(() => a.$('.editor') && a.$('.carousel-stage'), 'the editor on the carousel');
  const recs = await a.RS.store.listProjects();
  const made = recs.sort((x, y) => y.updatedAt - x.updatedAt)[0].data;
  assert.equal(made.carousel.style, 'contrato');
  assert.equal(piece(a, 'Carrossel').getAttribute('aria-checked'), 'true');
});

test('gallery: «Começar por» Vídeo › Néon creates an ad on «Vídeo» with that model (the recipes are not loaded here)', async (t) => {
  const a = await app(t, 1280, (p, RS) => stubVideo(RS));
  await a.click(a.$('.new-card'));
  await a.until(() => a.$('.gallery'), 'the gallery');
  await a.click(a.$$('.gallery [aria-label="Começar por"] [role="radio"]').find((b) => b.textContent.trim() === 'Vídeo'));
  const card = await a.until(() => a.$$('.gallery .motion-card').find((c) => /Néon/.test(c.textContent)), 'Néon');
  await a.click(card);
  await a.until(() => a.$('.editor') && a.$('.video-stage'), 'the editor on the video');
  const recs = await a.RS.store.listProjects();
  const made = recs.sort((x, y) => y.updatedAt - x.updatedAt)[0].data;
  assert.equal(made.video.motion, 'neon');
  assert.equal(piece(a, 'Vídeo').getAttribute('aria-checked'), 'true');
});
