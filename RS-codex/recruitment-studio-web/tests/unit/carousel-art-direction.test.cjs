const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'workflow.js', 'production.js');
const M = RS.model, P = RS.production;
const FAMILIES = ['editorial', 'blueprint', 'signal', 'workshop', 'collage', 'atelier'];
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#F7F5F0', text: '#15171C', fonts: 'modern', upper: false, show: {} } };
const measure = (text, size) => Array.from(text).length * size * .53;
const compact = (text) => String(text).replace(/\s+/gu, '');
const copy = (value) => JSON.parse(JSON.stringify(value));
function project() {
  const p = M.addLocale(M.newProject(TPL), 'fr', 'pt-PT');
  p.id = 'carousel-art-direction-fixture';
  p.carousel = M.cleanCarousel(p.carousel, p.locales);
  return p;
}
function manual(p, slides) {
  p.carousel.locales['pt-PT'] = { source: P.carouselSource(p, 'pt-PT'), slides };
  return p;
}
function slide(extra = {}) {
  return { id: 'page-unique', title: 'Uma oportunidade à sua medida', text: 'Construa o próximo capítulo da sua carreira.', kind: 'intro', layout: 'text', hidden: false, qr: false, photo: null, ...extra };
}
function bodyRects(page) {
  if (page.itemCards?.length) return page.itemCards.map((card) => ({ x: card.textX, y: card.textY, w: card.textWidth, h: card.lines.length * card.lineHeight }));
  return [{ x: page.bodyX, y: page.top, w: page.bodyWidth, h: page.lines.length * page.lineHeight }];
}
function overlap(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > .1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > .1;
}
function contained(rect, bounds, label) {
  for (const value of Object.values(rect)) assert.ok(Number.isFinite(value), `${label}: finite geometry`);
  assert.ok(rect.w >= 0 && rect.h >= 0, `${label}: positive dimensions`);
  assert.ok(rect.x >= bounds.x - .1 && rect.y >= bounds.y - .1 && rect.x + rect.w <= bounds.x + bounds.w + .1 && rect.y + rect.h <= bounds.y + bounds.h + .1, `${label}: contained in its reserved area`);
}
function assertGeometry(page) {
  const fmt = M.FORMATS[page.format], label = `${page.art.id}/${page.format}/${page.layout}/${page.kind}`;
  const canvas = { x: 0, y: 0, w: fmt.w, h: fmt.h }, bodies = bodyRects(page);
  const titles = page.titleLines.map((line, i) => ({ x: page.titleX, y: page.titleTop + i * Math.ceil(page.titleSize * 1.15), w: measure(line, page.titleSize), h: Math.ceil(page.titleSize * 1.15) }));
  for (const body of bodies) contained(body, canvas, `${label} text`);
  for (const title of titles) contained(title, canvas, `${label} title`);
  if (page.itemCards?.length) {
    page.itemCards.forEach((card, index) => {
      contained({ x: card.x, y: card.y, w: card.w, h: card.h }, canvas, `${label} card`);
      contained(bodies[index], card, `${label} card text`);
      assert.ok(card.lines.every((line) => measure(line, card.size) <= card.textWidth + .1), `${label}: card lines fit`);
      for (const other of page.itemCards.slice(index + 1)) assert.equal(overlap(card, other), false, `${label}: separate cards`);
    });
  } else assert.ok(page.lines.every((line) => measure(line, page.size) <= page.bodyWidth + .1), `${label}: body lines fit`);
  if (page.photoRect) {
    contained(page.photoRect, canvas, `${label} photograph`);
    if (page.layout !== 'hero') for (const body of bodies) assert.equal(overlap(body, page.photoRect), false, `${label}: copy clears photograph`);
  }
  if (page.artRect) {
    contained(page.artRect, canvas, `${label} illustration`);
    for (const body of bodies) assert.equal(overlap(body, page.artRect), false, `${label}: copy clears illustration`);
    for (const title of titles) assert.equal(overlap(title, page.artRect), false, `${label}: title clears illustration`);
  }
  if (page.qr) {
    assert.ok(page.qrRect, `${label}: planned QR geometry is available to preview and export`);
    contained(page.qrRect, canvas, `${label} QR`);
    for (const body of bodies) assert.equal(overlap(body, page.qrRect), false, `${label}: copy clears QR`);
    for (const card of page.itemCards || []) assert.equal(overlap(card, page.qrRect), false, `${label}: cards clear QR`);
    if (page.artRect) assert.equal(overlap(page.artRect, page.qrRect), false, `${label}: illustration clears QR`);
    if (page.photoRect && page.layout !== 'hero') assert.equal(overlap(page.photoRect, page.qrRect), false, `${label}: photograph clears QR`);
  }
}

test('carousel art direction remains stable after saving, switching languages and editing copy', () => {
  const p = project(), before = P.artDirection(p);
  assert.ok(FAMILIES.includes(before.id));
  assert.ok(before.label && before.description && before.motifLabel);
  assert.deepEqual(P.artDirection(copy(p)), before);
  assert.equal(P.artDirection(M.normalize(copy(p))).seed, before.seed);
  p.locale = 'fr'; p.texts.fr.headline = 'Une nouvelle annonce avec un autre texte'; p.updatedAt += 1000;
  assert.equal(P.artDirection(p).seed, before.seed);
  const plans = ['pt-PT', 'fr'].map((locale) => P.plan(p, locale, 'portrait', measure));
  assert.ok(plans.flat().every((page) => page.art.id === before.id && page.art.seed === before.seed));
  const other = copy(p); other.id = 'another-independent-ad';
  assert.notEqual(P.artDirection(other).seed, before.seed);
  p.carousel.variation = 1;
  assert.notEqual(P.artDirection(p).seed, before.seed);
  assert.equal(P.artDirection(p).id, before.id);
});

test('automatic direction follows the chosen template while an explicit direction survives template changes', () => {
  const p = project();
  const expected = { diagonal: 'editorial', divisao: 'editorial', editorial: 'editorial', planta: 'blueprint', cartao: 'blueprint', sinal: 'signal', estaleiro: 'signal', betao: 'workshop', noite: 'workshop', faixa: 'collage', faisca: 'collage', moldura: 'atelier' };
  for (const [template, family] of Object.entries(expected)) {
    p.template = template;
    assert.equal(P.artDirection(p).id, family, template);
  }
  p.carousel.style = 'atelier'; p.template = 'faisca';
  assert.equal(P.artDirection(p).id, 'atelier');
  p.template = 'planta';
  assert.equal(P.artDirection(p).id, 'atelier');
});

test('the trade changes the drawing without discarding the selected art direction', () => {
  let p = project(); p.carousel.style = 'blueprint';
  const masonry = P.artDirection(p);
  p = M.setTrades(p, ['eletricista']);
  const electrical = P.artDirection(p);
  assert.equal(electrical.id, masonry.id);
  assert.notEqual(electrical.motifLabel, masonry.motifLabel);
  for (const trade of ['obras', 'pedreiro', 'cofragem', 'ferro', 'eletricista', 'canalizador', 'pintor', 'carpinteiro', 'serralheiro', 'ladrilhador', 'telhados', 'maquinas', 'pladur', 'servente', 'tecnico']) {
    const direction = P.artDirection(M.setTrades(p, [trade]));
    assert.ok(direction.motifLabel && direction.description, `${trade}: identified drawing`);
    assert.equal(direction.id, 'blueprint');
  }
});

test('normalization and manual slide edits retain art choices, authored copy and photo adjustments', () => {
  const p = project(), photo = { asset: 'custom-photo', fx: .2, fy: .8, zoom: 1.7, flip: true, adj: { b: .8, c: 1.3, s: .4 } };
  p.carousel.style = 'collage'; p.carousel.variation = 321;
  P.personalize(p, 'pt-PT', 'portrait', measure);
  const first = P.authored(p, 'pt-PT').slides[0];
  P.changeSlide(p, 'pt-PT', { type: 'patch', id: first.id, patch: { text: 'Conteúdo da equipa, escrito à mão 😀', photo, layout: 'side' } });
  const saved = M.normalize(copy(p)), restored = P.authored(saved, 'pt-PT').slides[0];
  assert.equal(saved.carousel.style, 'collage'); assert.equal(saved.carousel.variation, 321);
  assert.equal(restored.text, 'Conteúdo da equipa, escrito à mão 😀');
  assert.deepEqual(restored.photo, photo); assert.equal(restored.layout, 'side');
  saved.style.primary = '#50328A'; saved.style.accent = '#C8EB73'; saved.style.fonts = 'elegant';
  saved.carousel.style = 'atelier';
  const page = P.plan(saved, 'pt-PT', 'square', measure).find((page) => page.slideId === restored.id);
  assert.equal(page.art.id, 'atelier'); assert.equal(page.layout, 'side'); assert.deepEqual(page.photo, photo);
  assert.equal(P.authored(saved, 'pt-PT').slides[0].text, restored.text);
  const legacy = copy(p); delete legacy.carousel.style; delete legacy.carousel.variation;
  assert.equal(M.normalize(legacy).carousel.style, 'auto'); assert.equal(M.normalize(legacy).carousel.variation, 0);
  const malformed = copy(p); malformed.carousel.style = 'missing-style'; malformed.carousel.variation = Infinity;
  assert.equal(M.normalize(malformed).carousel.style, 'auto'); assert.equal(M.normalize(malformed).carousel.variation, 0);
});

test('all art directions paginate authored Unicode content without loss in every format and layout', () => {
  const p = project(), text = 'Construção à medida 😀 — experiência, precisão e equipa. '.repeat(40) + 'https://exemplo.test/' + 'candidatura'.repeat(20);
  manual(p, [slide({ text, title: 'Uma equipa. Muitas possibilidades.' })]);
  for (const family of FAMILIES) for (const format of ['portrait', 'square']) for (const layout of Object.keys(M.CAROUSEL_LAYOUTS)) {
    p.carousel.style = family; p.carousel.locales['pt-PT'].slides[0].layout = layout;
    const pages = P.plan(p, 'pt-PT', format, measure);
    assert.ok(pages.length > 1, `${family}/${format}/${layout}: readable pagination`);
    assert.equal(compact(pages.flatMap((page) => page.lines).join('')), compact(text));
    assert.ok(pages.every((page, i) => page.art.id === family && page.index === i + 1 && page.total === pages.length));
    for (const page of pages) {
      assert.equal(compact(page.titleLines.join('')), compact(p.carousel.locales['pt-PT'].slides[0].title));
      assertGeometry(page);
    }
  }
});

test('automatic benefits and vacancies remain complete and geometrically separate across all directions', () => {
  const p = project(), t = p.texts['pt-PT'];
  t.benefits = Array.from({ length: 8 }, (_, i) => M.item(`Vantagem ${i + 1}: acompanhamento, formação e uma equipa próxima ${'com experiência '.repeat(i % 3)}`));
  t.positions = Array.from({ length: 6 }, (_, i) => M.item(`Profissional ${i + 1} com experiência em ${i % 2 ? 'estruturas metálicas e acabamentos' : 'construção e instalações'}`));
  for (const family of FAMILIES) for (const format of ['portrait', 'square']) {
    p.carousel.style = family;
    const pages = P.plan(p, 'pt-PT', format, measure);
    for (const [kind, items] of [['benefits', t.benefits], ['positions', t.positions]]) {
      const section = pages.filter((page) => page.kind === kind);
      assert.equal(compact(section.flatMap((page) => page.lines).join('')), compact(items.map((item) => item.text).join('')), `${family}/${format}/${kind}: complete copy`);
      section.forEach(assertGeometry);
    }
  }
});

test('contact compositions reserve separate areas for copy, photographs and the QR code', () => {
  const p = project(); RS.engine = { qrText: ({ show }) => show.qr && show.contacts ? 'https://example.test/candidatura' : '' };
  manual(p, [slide({ kind: 'contact', title: 'Fale com a nossa equipa', text: 'emprego@example.test\n\n+351 912 345 678\n\nA sua experiência faz a diferença.', qr: true, photo: { asset: 'photo', fx: .4, fy: .4, zoom: 1, flip: false, adj: { b: 1, c: 1, s: 1 } } })]);
  for (const family of FAMILIES) for (const format of ['portrait', 'square']) for (const layout of Object.keys(M.CAROUSEL_LAYOUTS)) {
    p.carousel.style = family; p.carousel.locales['pt-PT'].slides[0].layout = layout;
    const pages = P.plan(p, 'pt-PT', format, measure);
    assert.equal(pages.filter((page) => page.qr).length, 1, `${family}/${format}/${layout}: one QR`);
    assert.ok(pages.at(-1).qr, `${family}/${format}/${layout}: QR remains on final continuation`);
    pages.forEach(assertGeometry);
  }
});

test('headline and body size customizations reach the carousel without changing authored content', () => {
  const p = project();
  manual(p, [slide({ kind: 'cover', layout: 'hero', title: 'Junte-se à equipa', text: 'O seu próximo passo' }), slide({ id: 'body-page', kind: 'intro', text: 'Uma nova oportunidade.' })]);
  p.style.headScale = .6; p.style.textScale = .7;
  const small = P.plan(p, 'pt-PT', 'portrait', measure);
  p.style.headScale = 1.4; p.style.textScale = 1.3;
  const large = P.plan(p, 'pt-PT', 'portrait', measure);
  assert.ok(large.find((page) => page.kind === 'cover').size > small.find((page) => page.kind === 'cover').size, 'headline follows chosen scale');
  assert.ok(large.find((page) => page.kind === 'intro').size > small.find((page) => page.kind === 'intro').size, 'body follows chosen scale');
  assert.equal(compact(large.flatMap((page) => page.lines).join('')), compact(small.flatMap((page) => page.lines).join('')));
  large.forEach(assertGeometry);
});

test('large typography and long translated titles remain inside reserved photo and QR geometry', () => {
  const p = project();
  RS.engine = { qrText: () => 'https://example.test/candidatura' };
  p.style.headScale = 1.4; p.style.textScale = 1.3; p.style.fonts = 'geometric';
  manual(p, [slide({ kind: 'contact', title: 'Votre prochaine étape professionnelle commence avec une équipe qui valorise votre expérience et vos compétences.', text: 'Contactez notre équipe pour en savoir davantage sur cette opportunité.\n\nrecrutement@example.test\n\n+41 79 123 45 67', qr: true })]);
  const original = p.carousel.locales['pt-PT'].slides[0].text;
  for (const family of FAMILIES) for (const format of ['portrait', 'square']) for (const layout of Object.keys(M.CAROUSEL_LAYOUTS)) {
    p.carousel.style = family; p.carousel.locales['pt-PT'].slides[0].layout = layout;
    const pages = P.plan(p, 'pt-PT', format, measure);
    assert.equal(compact(pages.flatMap((page) => page.lines).join('')), compact(original));
    pages.forEach(assertGeometry);
  }
});

test('manual lists with 120-character titles and large copy keep every card inside the square page, with or without QR', () => {
  const p = project(), title = 'Uma oportunidade para profissionais experientes que valorizam uma equipa próxima e projetos feitos com rigor. '.repeat(2).slice(0, 120);
  const items = ['Remuneração adequada à experiência', 'Projetos de construção na sua região', 'Uma equipa próxima e experiente', 'Formação para evoluir no seu ofício'];
  p.style.textScale = 1.3;
  RS.engine = { qrText: () => 'https://example.test/candidatura' };
  for (const family of FAMILIES) for (const kind of ['benefits', 'positions']) for (const qr of [false, true]) {
    p.carousel.style = family;
    manual(p, [slide({ title, text: items.join('\n\n'), kind, layout: 'text', qr })]);
    const pages = P.plan(p, 'pt-PT', 'square', measure);
    assert.equal(compact(pages.flatMap((page) => page.lines).join('')), compact(items.join('')));
    assert.equal(pages.filter((page) => page.qr).length, Number(qr));
    for (const page of pages) {
      assert.equal(compact(page.titleLines.join('')), compact(title));
      assert.ok(page.itemCards?.length, `${family}/${kind}: list retains its cards`);
      assertGeometry(page);
    }
  }
});

test('removing a section title never puts the body or list cards over the illustration', () => {
  const p = project();
  for (const family of FAMILIES) for (const format of ['square', 'portrait']) for (const kind of ['intro', 'benefits']) for (const textScale of [.7, 1, 1.3]) {
    p.carousel.style = family; p.style.textScale = textScale;
    const text = kind === 'intro' ? 'Experiência que constrói o futuro.' : 'Equipa próxima\n\nFormação contínua\n\nProjetos na região\n\nContrato estável';
    manual(p, [slide({ title: '', text, kind, layout: 'text' })]);
    const pages = P.plan(p, 'pt-PT', format, measure);
    assert.equal(compact(pages.flatMap((page) => page.lines).join('')), compact(text));
    assert.ok(pages.every((page) => page.titleLines.length === 0));
    pages.forEach(assertGeometry);
  }
});

test('slide rendering preserves photo format and logo tone while a large logo stays inside the header', () => {
  const p = project(), previousDocument = global.document, previousEngine = RS.engine;
  const image = { width: 900, height: 1600 }, logo = { width: 120, height: 400 }, source = { tintedLogo: true };
  const photos = [], tones = [], images = [], rules = [], path = [];
  const ctx = new Proxy({
    measureText: () => ({ width: 30 }),
    beginPath() { path.length = 0; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    stroke() { if (path.length === 2 && path[0][1] === path[1][1]) rules.push([...path[0], ...path[1]]); },
    drawImage: (...args) => images.push(args),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  global.document = { createElement: () => ({ getContext: () => ctx }) };
  RS.engine = { setFont() {}, drawQR() {}, photo: (context) => photos.push(context), logoSource: (image, background, tone) => { tones.push({ image, background, tone }); return source; } };
  try {
    p.carousel.style = 'atelier'; p.style.logoScale = 1.8; p.style.logoTone = 'white';
    p.photo = { asset: 'photo', zoom: 1, fx: .5, fy: .5, frames: { square: { zoom: 1.8, fx: .2, fy: .7 } } };
    manual(p, [slide({ kind: 'cover', layout: 'hero', text: 'O seu próximo passo' })]);
    for (const format of ['square', 'portrait']) {
      const page = P.plan(p, 'pt-PT', format, measure)[0];
      P.renderSlide(p, page, { photo: image, logo });
      assert.equal(photos.at(-1).fmt.id, format);
      assert.deepEqual(photos.at(-1).project.photo, p.photo);
    }
    assert.ok(tones.every((call) => call.image === logo && call.tone === 'white'));
    const logoDraws = images.filter(([image]) => image === source), headerRule = Math.min(...rules.filter(([x1, y1, x2]) => x2 - x1 > 800 && y1 < 200).map(([, y]) => y));
    assert.equal(logoDraws.length, 2); assert.ok(Number.isFinite(headerRule));
    for (const [, , y, , height] of logoDraws) assert.ok(y + height < headerRule, 'large logo remains above the header rule');
    p.show.logo = false;
    P.renderSlide(p, P.plan(p, 'pt-PT', 'square', measure)[0], { photo: image, logo });
    assert.equal(images.filter(([image]) => image === source).length, 2, 'hidden logo is not drawn');
  } finally { global.document = previousDocument; RS.engine = previousEngine; }
});

test('technical covers and narrow body columns keep Portuguese words whole with wide type at maximum scale', () => {
  const p = project(), wideMeasure = (text, size) => Array.from(text).length * size * .67;
  p.carousel.style = 'blueprint'; p.style.fonts = 'geometric'; p.style.headScale = 1.4; p.style.textScale = 1.3;
  const headline = 'ELETRICISTAS ESPECIALIZADOS', body = 'Acompanhamento profissional. Responsabilidade e reconhecimento.';
  manual(p, [slide({ kind: 'cover', layout: 'hero', text: headline }), slide({ id: 'body-words', kind: 'intro', layout: 'side', text: body })]);
  for (const format of ['square', 'portrait']) {
    const pages = P.plan(p, 'pt-PT', format, wideMeasure);
    for (const [kind, text] of [['cover', headline], ['intro', body]]) {
      const section = pages.filter((page) => page.kind === kind);
      assert.deepEqual(section.flatMap((page) => page.lines.flatMap((line) => line.split(/\s+/).filter(Boolean))), text.split(/\s+/), `${format}/${kind}: ordinary words are never split into fragments`);
      assert.ok(section.every((page) => page.lines.every((line) => wideMeasure(line, page.size) <= page.bodyWidth + .1)));
      section.forEach(assertGeometry);
    }
  }
});

test('list cards preserve wide Portuguese words without overflow when large typography needs more width', () => {
  const p = project(), wideMeasure = (text, size) => Array.from(text).length * size * .67;
  const items = ['Interdisciplinaridade', 'Responsabilidade profissional', 'Desenvolvimento contínuo', 'Reconhecimento da experiência'];
  p.style.fonts = 'geometric'; p.style.textScale = 1.3;
  manual(p, [slide({ kind: 'benefits', layout: 'text', text: items.join('\n\n') })]);
  for (const family of FAMILIES) {
    p.carousel.style = family;
    const pages = P.plan(p, 'pt-PT', 'square', wideMeasure);
    assert.deepEqual(pages.flatMap((page) => page.lines.flatMap((line) => line.split(/\s+/).filter(Boolean))), items.join(' ').split(/\s+/), `${family}: list words remain whole`);
    for (const page of pages) {
      assert.ok(page.itemCards.every((card) => card.lines.every((line) => wideMeasure(line, card.size) <= card.textWidth + .1)), `${family}: wide words fit inside cards`);
      assertGeometry(page);
    }
  }
});
