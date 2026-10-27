// The carousel piece in the editor (2026-10-27): one switch Imagem · Carrossel
// · Vídeo, the carousel stage and its controls. Drawing itself is tested in Edge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./ui-harness.cjs');

test('editor: one piece switch with Imagem, Carrossel and Vídeo; no «Converter em vídeo», no rail «Vídeo»', async (t) => {
  const { $, $$, click, until } = await app(t);
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  const groups = $$('.topbar [role="radiogroup"][aria-label="Peça"]');
  assert.equal(groups.length, 1);
  assert.deepEqual($$('.topbar [role="radiogroup"][aria-label="Peça"] [role="radio"]').map((b) => b.textContent.trim()), ['Imagem', 'Carrossel', 'Vídeo']);
  assert.equal($('.ws-convert'), null);
  assert.equal($$('.rail [role="tab"]').some((b) => b.textContent.trim() === 'Vídeo'), false);
});

test('editor: «Carrossel» shows the carousel stage and keeps the undo history', async (t) => {
  const { $, $$, click, type, key, w, until } = await app(t);
  await click($('.proj-open')); await until(() => $('#f-headline'), 'editor');
  await type($('#f-headline'), 'Título novo');
  const piece = (name) => $$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === name);
  await click(piece('Carrossel'));
  await until(() => $('.carousel-stage'), 'the carousel stage');
  assert.equal(piece('Carrossel').getAttribute('aria-checked'), 'true');
  assert.deepEqual($$('.carousel-stage [aria-label="Formato do carrossel"] [role="radio"]').map((b) => b.textContent.trim()), ['4:5', '1:1', '3:4', '9:16']);
  await key(w.document.body, 'z', { ctrlKey: true });
  await until(() => $('#f-headline') && $('#f-headline').value !== 'Título novo', 'undo in the carousel');
});

test('editor: the format chips change the carousel format', async (t) => {
  const { $, $$, click, RS, p, until } = await app(t);
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click($$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === 'Carrossel'));
  await until(() => $('.carousel-stage'), 'stage');
  await click($$('.carousel-stage [aria-label="Formato do carrossel"] [role="radio"]').find((b) => b.textContent.trim() === '3:4'));
  await until(async () => (await RS.store.getProject(p.id)).data.carousel?.format === 'feed34', 'format saved');
});

// ---------------------------------------------------------------- Task 7: the carousel's panels
const piece = ($$, name) => $$('.topbar [aria-label="Peça"] [role="radio"]').find((b) => b.textContent.trim() === name);
const railTab = ($$, name) => $$('.rail [role="tab"]').find((b) => b.textContent.trim() === name);
async function openCarousel(a, section) {
  const { $, $$, click, until } = a;
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click(piece($$, 'Carrossel')); await until(() => $('.carousel-stage'), 'stage');
  if (section) { await click(railTab($$, section)); await until(() => $('.carousel-panel'), `${section} panel`); }
}
const saved = async (RS, p, fn, until, label) => until(async () => { const d = (await RS.store.getProject(p.id)).data; return d.carousel && fn(d) && d; }, label);

test('carousel «Estilo»: «Do anúncio» first, then the six styles; «Recomendado» on Números with a salary; a pick is saved', async (t) => {
  const a = await app(t, 1280, (p) => { p.offer.salary = '1900'; }), { $$, click, RS, p, until } = a;
  await openCarousel(a, 'Estilo');
  const cards = $$('.carousel-panel .cstyle-card');
  assert.deepEqual(cards.map((c) => c.dataset.style), ['ad', 'tijolo', 'numeros', 'contrato', 'notificacoes', 'planta', 'apresentacao']);
  assert.match(cards.find((c) => c.dataset.style === 'numeros').textContent, /Recomendado/);
  await click(cards.find((c) => c.dataset.style === 'planta'));
  await saved(RS, p, (d) => d.carousel.style === 'planta', until, 'Planta saved');
});

test('carousel «Estilo»: in 3:4 the poster cover is unavailable and says why', async (t) => {
  const a = await app(t, 1280, (p, RS) => { p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo', format: 'feed34' }, p); }), { $, $$ } = a;
  await openCarousel(a, 'Estilo');
  const poster = $$('.carousel-panel [role="radio"]').find((b) => /cartaz do anúncio/i.test(b.textContent));
  assert.ok(poster && poster.disabled, 'the poster cover is not disabled in 3:4');
  assert.match($('.carousel-panel').textContent, /Indisponível em 3:4/);
});

test('carousel «Sequência»: Alt+↑ moves a block, the eye hides it, both saved', async (t) => {
  const a = await app(t, 1280, (p, RS) => { p.whatsapp = { country: '351', number: '912345678' }; p.carousel = RS.model.cleanCarousel({ v: 2, style: 'apresentacao' }, p); }), { $, $$, key, click, RS, p, until } = a;
  await openCarousel(a, 'Sequência');
  const row = (k) => $(`.carousel-panel .cseq-row[data-key="${k}"]`);
  await until(() => row('K'), 'the Contacto row');
  await key(row('K').querySelector('.cseq-handle'), 'ArrowUp', { altKey: true });
  await saved(RS, p, (d) => Array.isArray(d.carousel.blocks.order) && d.carousel.blocks.order.indexOf('K') >= 0 && d.carousel.blocks.order.indexOf('K') < d.carousel.blocks.order.length - 1, until, 'order saved');
  await click(row('M').querySelector('.cseq-eye'));
  await saved(RS, p, (d) => d.carousel.blocks.hidden.includes('M'), until, 'hidden saved');
});

test('carousel «Sequência»: «Vagas» hidden on the image starts hidden; showing it in the carousel leaves the image hidden', async (t) => {
  const a = await app(t, 1280, (p, RS) => {
    p.texts['pt-PT'].positions = [{ id: 'p1', text: 'Pedreiro' }, { id: 'p2', text: 'Servente' }];
    p.show = { ...p.show, positions: false };
    p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo' }, p);
  }), { $, click, RS, p, until } = a;
  await openCarousel(a, 'Sequência');
  const row = await until(() => $('.carousel-panel .cseq-row[data-key="L"]'), 'the Vagas row');
  assert.ok(row.classList.contains('hidden-block'), '«Vagas» does not start hidden');
  await click(row.querySelector('.cseq-eye'));
  const d = await saved(RS, p, (x) => (x.carousel.show || {}).positions === true, until, 'shown in the carousel');
  assert.equal(d.show.positions, false);
  assert.ok(!d.carousel.blocks.hidden.includes('L'));
  const plan = RS.slides.plan(RS.model.normalize(d), 'pt-PT', 'portrait');
  assert.ok(plan.slides.some((s) => s.key === 'L'), 'no «Vagas» slide');
  // one eye per block: the row's (no second «Visível» inside the open row)
  await click(row.querySelector('.cseq-open'));
  await until(() => $('.carousel-panel #vt-block-positions'), 'the open Vagas row');
  assert.equal($('.carousel-panel #vt-block-positions').closest('.cseq-row').querySelectorAll('[aria-pressed]').length, 1);
});

test('carousel «Sequência»: a cover text of its own shows «Só no carrossel»; the image and the video keep theirs; «Repor do anúncio» removes it', async (t) => {
  const a = await app(t, 1280, (p, RS) => { p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo' }, p); }), { $, $$, click, type, RS, p, until } = a;
  await openCarousel(a, 'Sequência');
  await click(await until(() => $('.carousel-panel .cseq-row[data-key="H"] .cseq-open'), 'the Capa row'));
  const field = await until(() => $('.carousel-panel #vt-headline'), 'the cover headline field');
  await type(field, 'Só para o carrossel');
  const d = await saved(RS, p, (x) => (x.carousel.texts['pt-PT'] || {}).headline === 'Só para o carrossel', until, 'carousel text saved');
  assert.notEqual(d.texts['pt-PT'].headline, 'Só para o carrossel');
  assert.equal((d.video.texts['pt-PT'] || {}).headline, undefined);
  assert.match($('.carousel-panel').textContent, /Só no carrossel/);
  await click($$('.carousel-panel .vt-reset').find((b) => /Repor do anúncio/.test(b.textContent)));
  await saved(RS, p, (x) => !(x.carousel.texts['pt-PT'] || {}).headline, until, 'reset saved');
});

test('carousel «Sequência»: «Acrescentar diapositivo de texto» adds a slide whose text is per language', async (t) => {
  const a = await app(t, 1280, (p, RS) => { p.carousel = RS.model.cleanCarousel({ v: 2, style: 'planta' }, p); }), { $, $$, click, type, RS, p, until } = a;
  await openCarousel(a, 'Sequência');
  await click($$('.carousel-panel button').find((b) => /Acrescentar diapositivo de texto/.test(b.textContent)));
  const d = await saved(RS, p, (x) => x.carousel.extra.length === 1, until, 'extra saved');
  const id = d.carousel.extra[0].id;
  await type(await until(() => $(`.carousel-panel #cx-${id}`), 'its text field'), 'Começa já');
  const e = await saved(RS, p, (x) => ((x.carousel.texts['pt-PT'] || {}).extra || {})[id] === 'Começa já', until, 'its text saved');
  assert.equal(((e.carousel.texts.fr || {}).extra || {})[id], undefined);
});

// Final review (2026-10-27)
test('carousel «Sequência»: a block that appears after the order was set lands at its place, before «Contacto»', async (t) => {
  const a = await app(t), RS = a.RS;
  const p = RS.model.normalize(JSON.parse(JSON.stringify(a.p)));
  p.texts['pt-PT'].intro = '';
  p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo' }, p);
  const keys = () => RS.slides.plan(p, 'pt-PT').blocks.map((b) => b.key);
  const before = keys();
  assert.ok(!before.includes('I') && before[0] === 'H' && before[before.length - 1] === 'K', before.join());
  // the person reordered the middle: the order is pinned
  const middle = before.slice(1, -1).reverse();
  p.carousel.blocks.order = ['H', ...middle, 'K'];
  p.texts['pt-PT'].intro = 'Tem experiência em obra?';
  const after = keys();
  assert.equal(after.indexOf('I'), 1, after.join());
  assert.deepEqual(after.filter((k) => k !== 'I'), ['H', ...middle, 'K']);
});

test('carousel «Sequência»: the rows speak of the carousel, not of the video', async (t) => {
  const a = await app(t, 1280, (p, RS) => { p.carousel = RS.model.cleanCarousel({ v: 2, style: 'tijolo' }, p); }), { $, $$, click, until } = a;
  await openCarousel(a, 'Sequência');
  await click(await until(() => $('.carousel-panel .cseq-row[data-key="M"] .cseq-open'), 'the Vantagens row'));
  const remove = await until(() => $('.carousel-panel .cseq-panel .vt-remove') || $('.carousel-panel .vt-remove'), 'a remove button');
  assert.match(remove.getAttribute('title'), /carrossel/);
  assert.doesNotMatch($('.carousel-panel').textContent + $$('.carousel-panel [title]').map((e) => e.getAttribute('title')).join(' '), /vídeo/);
});

test('carousel «Fotos»: «Escolher» takes a photo of the app\'s library; another tap replaces it (the style takes one)', async (t) => {
  const a = await app(t, 1280, (p, RS) => {
    p.carousel = RS.model.cleanCarousel({ v: 2, style: 'notificacoes' }, p);
    // (the recipes are not loaded here: a one-photo style stands in for Notificações)
    const real = RS.motion.styleOf;
    RS.motion.styleOf = (id) => (id === 'notificacoes' ? { ...real(id), id, name: 'Notificações', recipe: { id, photos: 1 } } : real(id));
    RS.library.index = async () => ({ items: [{ id: 'lib-a', cat: 'obra', thumb: 'data:image/png;base64,eA==' }, { id: 'lib-b', cat: 'obra', thumb: 'data:image/png;base64,eA==' }] });
  }), { $$, click, until, RS, p } = a;
  await openCarousel(a, 'Fotos');
  await click($$('.carousel-panel [role="radio"]').find((b) => /Escolher/.test(b.textContent)));
  const items = await until(() => $$('.carousel-panel .lib-item').length === 2 && $$('.carousel-panel .lib-item'), 'the library photos');
  await click(items[0]);
  const d = await saved(RS, p, (x) => x.carousel.photos.mode === 'chosen' && x.carousel.photos.ids.length === 1, until, 'a library photo chosen');
  const first = d.carousel.photos.ids[0];
  assert.ok(['lib-a', 'lib-b'].includes(first), first);
  await click($$('.carousel-panel .lib-item')[1]);
  await saved(RS, p, (x) => x.carousel.photos.ids.length === 1 && x.carousel.photos.ids[0] !== first, until, 'replaced by the other one');
});
