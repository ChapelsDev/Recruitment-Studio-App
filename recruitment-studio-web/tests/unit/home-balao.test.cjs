// The «Balão» home (2026-10-28): the orange band with «Novo anúncio», cards
// told apart by name, languages and date, and one ⋯ per card.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
const cardOf = (a, name) => a.$$('.proj-card').find((c) => text(c.querySelector('.proj-name')) === name);
async function openMore(a, card) {
  await a.click(card.querySelector('.proj-more'));
  return a.until(() => card.querySelector('[role="menu"]'), 'the card ⋯');
}
const items = (menu) => [...menu.querySelectorAll('[role="menuitem"]')].map(text);
async function secondAd(RS, edit = () => {}) {
  const q = RS.model.newProject(RS.templates.list[1]);
  q.name = 'Segundo anúncio'; q.nameAuto = false;
  edit(q);
  await RS.store.putProject(q);
}

test('relativeDay: local calendar days in words', async (t) => {
  const a = await app(t);
  const U = a.RS.util;
  const now = new Date(2026, 9, 28, 12, 0).getTime();
  const daysAgo = (n, h = 12) => new Date(2026, 9, 28 - n, h, 0).getTime();
  assert.equal(U.relativeDay(daysAgo(0, 8), now), 'hoje');
  assert.equal(U.relativeDay(daysAgo(1, 23), now), 'ontem');
  assert.equal(U.relativeDay(daysAgo(3), now), 'há 3 dias');
  assert.equal(U.relativeDay(daysAgo(7), now), 'há 1 semana');
  assert.equal(U.relativeDay(daysAgo(14), now), 'há 2 semanas');
  assert.equal(U.relativeDay(daysAgo(40), now), 'há 1 mês');
  assert.equal(U.relativeDay(daysAgo(400), now), 'há 1 ano');
});

test('languagesLine: the languages in Portuguese words', async (t) => {
  const a = await app(t);
  const M = a.RS.model;
  assert.equal(M.languagesLine(['pt-PT']), 'Português');
  assert.equal(M.languagesLine(['pt-PT', 'fr']), 'Português e francês');
  assert.equal(M.languagesLine(['fr', 'pt-PT', 'de-CH']), 'Francês, português e alemão (Suíça)');
});

test('the band: heading, count, Novo anúncio, QR and ⋯', async (t) => {
  const a = await app(t, 1280, async (p, RS) => { await secondAd(RS); });
  await a.until(() => a.$$('.proj-card').length === 2, 'two ads');
  assert.equal(text(a.$('.home-band h1')), 'Os seus anúncios');
  assert.equal(text(a.$('.home-count')), '2 ofertas guardadas neste computador');
  assert.equal(text(a.$('.new-ad')), 'Novo anúncio');
  assert.ok(a.$('.home-band .home-qr'), 'the QR button left the band');
  assert.ok(a.$('.home-band .home-more'), 'the ⋯ left the band');
  assert.ok(!a.$('.new-card'), 'the old «Criar anúncio» card is still there');
});

test('a card has one ⋯ and its items open the pieces', async (t) => {
  const a = await app(t);
  const card = cardOf(a, 'Anúncio de teste');
  const buttons = [...card.querySelectorAll('button')].map((b) => b.className.split(' ')[0]);
  assert.deepEqual(buttons, ['proj-open', 'proj-more']);
  const menu = await openMore(a, card);
  assert.deepEqual(items(menu).slice(0, 4), ['Abrir na imagem', 'Abrir no carrossel', 'Abrir no vídeo', 'Marcar como favorito']);
});

test('favourite from the ⋯', async (t) => {
  const a = await app(t);
  let card = cardOf(a, 'Anúncio de teste');
  let menu = await openMore(a, card);
  await a.click([...menu.querySelectorAll('[role="menuitem"]')].find((b) => text(b) === 'Marcar como favorito'));
  await a.until(() => cardOf(a, 'Anúncio de teste').querySelector('.proj-fav-mark'), 'the favourite mark');
  card = cardOf(a, 'Anúncio de teste');
  assert.equal(card.querySelector('.proj-fav-mark').getAttribute('aria-label'), 'Favorito');
  menu = await openMore(a, card);
  assert.ok(items(menu).includes('Tirar dos favoritos'));
});

test('the status tag only when it is not a draft', async (t) => {
  const a = await app(t, 1280, async (p, RS) => { await secondAd(RS, (q) => { q.organization = { status: 'ready' }; }); });
  await a.until(() => a.$$('.proj-card').length === 2, 'two ads');
  assert.equal(cardOf(a, 'Anúncio de teste').querySelector('.proj-status'), null);
  assert.equal(text(cardOf(a, 'Segundo anúncio').querySelector('.proj-status')), 'Pronto');
});

test('the meta line: languages and the day in words', async (t) => {
  const a = await app(t);
  assert.equal(text(cardOf(a, 'Anúncio de teste').querySelector('.proj-meta')), 'Português e francês, hoje');
});

test('«Abrir no carrossel» opens the carousel piece', async (t) => {
  const a = await app(t);
  const menu = await openMore(a, cardOf(a, 'Anúncio de teste'));
  await a.click([...menu.querySelectorAll('[role="menuitem"]')].find((b) => text(b) === 'Abrir no carrossel'));
  const radio = await a.until(() => a.$$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => text(b) === 'Carrossel'), 'the editor');
  assert.equal(radio.getAttribute('aria-checked'), 'true');
});

test('empty home: the crane holds «Novo anúncio»', async (t) => {
  const a = await app(t);
  const menu = await openMore(a, cardOf(a, 'Anúncio de teste'));
  await a.click([...menu.querySelectorAll('[role="menuitem"]')].find((b) => text(b) === 'Mover para a reciclagem'));
  await a.until(() => a.$('.empty-site .new-ad'), 'the empty building site');
  assert.equal(text(a.$('.home-empty')), 'Ainda não há anúncios. O primeiro demora dois minutos.');
});

// final review (2026-10-28): the card's open button speaks its status, favourite and meta line
test('a screen reader hears the status, the favourite and the meta line of a card', async (t) => {
  const a = await app(t, 1280, async (p, RS) => { await secondAd(RS, (q) => { q.organization = { status: 'ready', favorite: true }; }); });
  const open = cardOf(a, 'Segundo anúncio').querySelector('.proj-open');
  const ids = (open.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const said = ids.map((id) => { const el = a.w.document.getElementById(id); return el ? (el.getAttribute('aria-label') || text(el)) : ''; }).join(' | ');
  assert.match(said, /Pronto/);
  assert.match(said, /Favorito/);
  assert.match(said, /Português/);
});
