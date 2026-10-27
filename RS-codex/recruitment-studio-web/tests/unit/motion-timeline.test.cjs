// Motion video timeline: scenes from the ad's own words, on the beat.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'motion-timeline.js');

const T = RS.motionTimeline;
const M = RS.model;
const TPL = { id: 'diagonal', trade: 'obras', sample: 'construction', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const ORDER = ['hook', 'fan', 'benefit', 'counter', 'sphere', 'wall', 'tunnel', 'end'];

const base = (over = {}) => ({
  kicker: 'Estamos a recrutar', headline: 'Pedreiros e serventes', benefits: [], positions: [],
  offer: null, vacancies: null, contact: null, brandName: 'Obras Lda', showLogo: true, photos: 0, ...over,
});
const full = () => base({
  benefits: ['Alojamento pago', 'Início imediato', 'Ferramentas e EPI fornecidos'],
  positions: ['Pedreiro', 'Servente', 'Ajudante'],
  offer: { salary: '1900', currency: '€', periodLabel: 'por mês', amount: '1900 €' },
  vacancies: { count: '30', word: 'vagas' },
  contact: { display: '+351 912 345 678', cta: 'Manda mensagem', hint: 'Aponta a câmara', link: 'https://wa.me/351912345678' },
  photos: 6,
});
const onBeat = (x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;

test('build: every duration ends exactly at the duration, scenes back to back', () => {
  for (const duration of [6, 10, 15]) {
    for (const c of [base(), full()]) {
      const tl = T.build(c, { duration, scenes: ORDER });
      assert.equal(tl.duration, duration);
      assert.equal(tl.scenes[0].start, 0);
      assert.equal(tl.scenes[tl.scenes.length - 1].end, duration);
      for (let i = 1; i < tl.scenes.length; i++) assert.equal(tl.scenes[i].start, tl.scenes[i - 1].end);
    }
  }
});

test('build: hook first, end last with its minimum length', () => {
  for (const [duration, hook, endMin] of [[6, 1.5, 2], [10, 2, 2.5], [15, 2, 2.5]]) {
    const tl = T.build(full(), { duration, scenes: ORDER });
    assert.equal(tl.scenes[0].kind, 'hook');
    assert.ok(tl.scenes[0].end - tl.scenes[0].start >= hook);
    const end = tl.scenes[tl.scenes.length - 1];
    assert.equal(end.kind, 'end');
    assert.ok(end.end - end.start >= endMin, `end too short at ${duration} s`);
  }
});

test('build: a headline-only ad gives exactly hook + end', () => {
  for (const duration of [6, 10, 15]) {
    const tl = T.build(base({ kicker: '' }), { duration, scenes: ORDER });
    assert.deepEqual(tl.scenes.map((s) => s.kind), ['hook', 'end']);
  }
});

test('build: no counter without salary or vacancies, no photo scenes without photos', () => {
  const tl = T.build(base({ benefits: ['A', 'B'], positions: ['x', 'y'] }), { duration: 15, scenes: ORDER });
  const kinds = tl.scenes.map((s) => s.kind);
  assert.ok(!kinds.includes('counter'));
  for (const k of ['fan', 'sphere', 'tunnel']) assert.ok(!kinds.includes(k), k);
  assert.ok(kinds.includes('wall'));
  const one = T.build(base({ positions: ['só uma'] }), { duration: 15, scenes: ORDER });
  assert.ok(!one.scenes.some((s) => s.kind === 'wall'), 'wall needs two positions');
  const withOffer = T.build(base({ vacancies: { count: '3', word: 'vagas' } }), { duration: 15, scenes: ORDER });
  assert.ok(withOffer.scenes.some((s) => s.kind === 'counter'));
});

test('build: the style decides which scenes and in what order', () => {
  const tl = T.build(full(), { duration: 15, scenes: ['hook', 'benefit', 'counter', 'end'] });
  const kinds = [...new Set(tl.scenes.map((s) => s.kind))];
  assert.deepEqual(kinds, ['hook', 'benefit', 'counter', 'end']);
});

test('build: benefits spread over the style\'s benefit slots, in their order', () => {
  const c = full();
  c.benefits = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'];
  c.photos = 0;
  const tl = T.build(c, { duration: 15, scenes: ['hook', 'benefit', 'counter', 'benefit', 'wall', 'benefit', 'end'] });
  const kinds = tl.scenes.map((s) => (s.kind === 'benefit' ? s.data.text : s.kind));
  assert.deepEqual(kinds, ['hook', 'Um', 'Dois', 'counter', 'Três', 'Quatro', 'wall', 'Cinco', 'end']);
});

test('build: minBeats lengthens the scenes that have more text to show', () => {
  const c = full();
  c.photos = 0;
  const need = { hook: 7, benefit: 5, wall: 6 };
  const tl = T.build(c, { duration: 15, scenes: ORDER, minBeats: (kind) => need[kind] || 0 });
  const len = (s) => Math.round((s.end - s.start) / 0.5);
  assert.ok(len(tl.scenes[0]) >= 7, 'hook too short');
  for (const s of tl.scenes.filter((x) => x.kind === 'benefit')) assert.ok(len(s) >= 5, 'benefit too short');
  const wall = tl.scenes.find((s) => s.kind === 'wall');
  assert.ok(!wall || len(wall) >= 6, 'wall too short');
  assert.equal(tl.scenes[tl.scenes.length - 1].end, 15);
  assert.ok(tl.scenes[tl.scenes.length - 1].end - tl.scenes[tl.scenes.length - 1].start >= 2.5);
});

test('build: starts, ends and cuts are on the beat', () => {
  for (const duration of [6, 10, 15]) {
    const tl = T.build(full(), { duration, scenes: ORDER });
    for (const s of tl.scenes) assert.ok(onBeat(s.start) && onBeat(s.end), `${s.kind} ${s.start}-${s.end}`);
    for (const c of tl.cuts) assert.ok(onBeat(c));
    assert.deepEqual(tl.cuts, tl.scenes.slice(1).map((s) => s.start));
  }
});

test('build: benefit texts are kept exactly as written; long ones get 1.5 s', () => {
  const long = 'Alojamento pago perto da obra e transporte diário';
  const c = base({ benefits: ['alojamento PAGO', long] });
  const tl = T.build(c, { duration: 15, scenes: ORDER });
  const ben = tl.scenes.filter((s) => s.kind === 'benefit');
  assert.deepEqual(ben.map((s) => s.data.text), ['alojamento PAGO', long]);
  assert.ok(ben[1].end - ben[1].start >= 1.5);
  assert.ok(ben[0].end - ben[0].start >= 1);
});

test('build: when time runs out, photo scenes go first, then the last benefits', () => {
  const c = full();
  c.benefits = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis'];
  const tl = T.build(c, { duration: 6, scenes: ORDER });
  const kinds = tl.scenes.map((s) => s.kind);
  for (const k of ['fan', 'sphere', 'tunnel']) assert.ok(!kinds.includes(k), `${k} kept at 6 s`);
  const ben = tl.scenes.filter((s) => s.kind === 'benefit').map((s) => s.data.text);
  assert.deepEqual(ben, c.benefits.slice(0, ben.length), 'benefits are dropped from the end');
  const at15 = T.build(c, { duration: 15, scenes: ORDER }).scenes.map((s) => s.kind);
  assert.ok(at15.includes('fan') || at15.includes('sphere') || at15.includes('tunnel'), 'a photo scene fits at 15 s');
});

test('build: events — a kick every beat, a whoosh at every cut, a hit on the counter, a riser before the end', () => {
  const tl = T.build(full(), { duration: 15, scenes: ORDER });
  const of = (type) => tl.events.filter((e) => e.type === type).map((e) => e.t);
  assert.equal(of('kick').length, 30);
  assert.deepEqual(of('whoosh'), tl.cuts);
  const counter = tl.scenes.find((s) => s.kind === 'counter');
  assert.ok(of('hit').some((t) => t > counter.start && t <= counter.end));
  assert.equal(of('pop').length, counter.data.chips.length);
  const endStart = tl.scenes[tl.scenes.length - 1].start;
  assert.deepEqual(of('riser'), [endStart - 1.5]);
});

test('content: only the ad\'s own words, hidden blocks left out, labels in the ad language', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  const t = p.texts['pt-PT'];
  t.benefits[0].text = 'Casa PAGA';
  p.show.positions = false;
  p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
  p.whatsapp = { country: '351', number: '912345678' };
  const c = T.content(p, 'pt-PT');
  assert.equal(c.kicker, t.kicker);
  assert.equal(c.headline, t.headline);
  assert.equal(c.benefits[0], 'Casa PAGA');
  assert.deepEqual(c.positions, []);
  assert.deepEqual(c.offer, { salary: '1900', currency: '€', periodLabel: 'por mês', amount: '1900 €' });
  assert.deepEqual(c.vacancies, { count: '30', word: 'vagas' });
  assert.equal(c.contact.display, '+351 912 345 678');
  assert.equal(c.contact.cta, 'Manda mensagem');
  assert.equal(c.contact.hint, 'Aponta a câmara');
  assert.equal(c.contact.link, RS.contact.adLink(p, 'pt-PT'));
  assert.equal(c.brandName, '', 'the template placeholder «A sua empresa» is not the company');
  p.brand.name = 'Obras Silva';
  assert.equal(T.content(p, 'pt-PT').brandName, 'Obras Silva');
  assert.equal(c.showLogo, true);
  assert.equal(c.photos, 0);
});

test('content: no number, no offer → no contact, no counter data; German labels in de-CH', () => {
  const p = M.addLocale(M.newProject(TPL, { trades: ['pedreiro'] }), 'de-CH', 'pt-PT');
  p.offer = { salary: '5200', currency: 'CHF', period: 'month', vacancies: '' };
  const c = T.content(p, 'de-CH');
  assert.equal(c.contact, null);
  assert.equal(c.vacancies, null);
  assert.equal(c.offer.periodLabel, 'pro Monat');
  assert.equal(c.offer.amount, 'CHF 5200');
  p.show.logo = false;
  assert.equal(T.content(p, 'de-CH').showLogo, false);
});

// The act scheduler of the video recipes (H M V D L C K O on a 0.5 s beat).
const K = (list) => list.map((a) => `${a.kind}${a.beats}`).join(' ');
const ALL = ['M', 'V', 'D', 'L', 'C'];

test('acts: 15 s with everything = H M V D L C K O', () => {
  assert.equal(K(T.acts(ALL, { duration: 15, hold: 2 })), 'H4 M4 V4 D4 L4 C4 K4 O2');
});

test('acts: 10 s keeps D and M, the rest of the time goes to the card', () => {
  assert.equal(K(T.acts(ALL, { duration: 10, hold: 2 })), 'H4 M4 D4 K6 O2');
});

test('acts: 6 s is the hook, the card and the loop', () => {
  assert.equal(K(T.acts(ALL, { duration: 6, hold: 2 })), 'H4 K6 O2');
});

test('acts: a 4 s contact takes a bar from the lowest priority', () => {
  assert.equal(K(T.acts(ALL, { duration: 15, hold: 4 })), 'H4 M4 V4 D4 C4 K8 O2');
  assert.equal(K(T.acts(ALL, { duration: 6, hold: 4 })), 'H4 K6 O2');
});

test('acts: missing content leaves its time to the card; times are on the beat', () => {
  const a = T.acts(['V', 'C'], { duration: 15, hold: 2 });
  assert.equal(K(a), 'H4 V4 C4 K16 O2');
  assert.deepEqual(a.map((x) => x.start), [0, 2, 4, 6, 14]);
  assert.equal(a[a.length - 1].end, 15);
});

// ---------------------------------------------------------------- schedule
const cs = (over = {}) => ({ headline: 'Pedreiros', kicker: '', intro: '', closing: '', benefits: [], highlights: [], positions: [], contact: null, chat: true, ...over });
const Hl = (n) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, role: 'own', value: String(i + 1), label: 'x', count: i + 1, prefix: '', suffix: '' }));
const Bn = (n) => Array.from({ length: n }, (_, i) => `Vantagem ${i + 1}`);
const Ps = (n) => Array.from({ length: n }, (_, i) => `Função ${i + 1}`);
const WA = { display: '+351 912 345 678', cta: 'Manda mensagem', hint: 'Aponta a câmara', link: 'https://wa.me/351912345678' };
const kindsOf = (s) => s.acts.map((a) => a.kind);
const act = (s, kind) => s.acts.find((a) => a.kind === kind);

test('schedule: «Automática» gives the time the information needs', () => {
  const s = T.schedule(cs({ benefits: Bn(3), highlights: Hl(2), positions: Ps(3), contact: WA }), { duration: 'auto' });
  assert.deepEqual(kindsOf(s), ['H', 'M', 'V', 'D', 'L', 'C', 'K', 'O']);
  assert.equal(s.auto, 15);
  assert.equal(s.duration, 15);
  assert.equal(s.acts[s.acts.length - 1].end, 15);
  assert.deepEqual(act(s, 'M').pages, [[0, 1, 2]]);
});

test('schedule: a longer video shows more, not slower', () => {
  const s = T.schedule(cs({ benefits: Bn(6), highlights: Hl(2), positions: Ps(3), contact: WA }), { duration: 20 });
  assert.equal(s.duration, 20);
  const m = act(s, 'M');
  assert.ok(m.pages.length >= 2, `${m.pages.length} pages`);
  assert.ok(m.pages.every((p) => p.length <= 3));
  assert.deepEqual(m.pages.flat(), [0, 1, 2, 3, 4, 5]);
  for (const a of s.acts) if (a.pages) assert.equal(a.beats, a.pages.length * 4, a.kind);
  assert.equal(s.acts[s.acts.length - 1].end, 20);
});

test('schedule: spare time becomes one benefit per page, then a longer card', () => {
  const two = T.schedule(cs({ benefits: Bn(2), highlights: Hl(1), contact: WA }), { duration: 15 });
  assert.deepEqual(act(two, 'M').pages, [[0], [1]]);
  assert.equal(act(two, 'K').beats, 4);
  const one = T.schedule(cs({ benefits: Bn(1), highlights: Hl(1), contact: WA }), { duration: 15 });
  assert.equal(act(one, 'K').beats, 8);
});

test('schedule: lengths the information cannot fill are unavailable', () => {
  const s = T.schedule(cs({ benefits: Bn(2), highlights: Hl(1), contact: WA }), { duration: 'auto' });
  assert.equal(s.max, 17);
  const L = Object.fromEntries(s.lengths.map((x) => [x.value, x]));
  assert.deepEqual([L[10].ok, L[15].ok, L[20].ok, L[30].ok], [true, true, false, false]);
  assert.equal(L[20].missing, 2);
  assert.equal(L.auto.seconds, s.auto);
  assert.ok(T.schedule(cs({}), { duration: 10 }).lengths.find((x) => x.value === 10).ok, '10 s is always there');
});

test('schedule: a very long ad is capped at 30 s and reports what is left out', () => {
  const s = T.schedule(cs({ benefits: Bn(12), highlights: Hl(6), positions: Ps(10), intro: 'Tem experiência?', closing: 'Começa já', contact: WA }), { duration: 'auto' });
  assert.equal(s.duration, 30);
  assert.equal(s.acts[s.acts.length - 1].end, 30);
  const left = s.left.benefits + s.left.highlights + s.left.positions + (s.left.chat ? 1 : 0) + (s.left.closing ? 1 : 0) + (s.left.intro ? 1 : 0);
  assert.ok(left > 0, JSON.stringify(s.left));
});

test('schedule: Números can play the highlights first', () => {
  const s = T.schedule(cs({ benefits: Bn(3), highlights: Hl(2), positions: Ps(3), contact: WA }), { duration: 'auto', order: ['D', 'M', 'V', 'L', 'C', 'F'] });
  assert.deepEqual(kindsOf(s).slice(0, 3), ['H', 'D', 'M']);
});

test('schedule: a saved length that cannot be filled any more falls back', () => {
  const s = T.schedule(cs({ benefits: Bn(2), highlights: Hl(1), contact: WA }), { duration: 30 });
  assert.equal(s.duration, 15);
});

test('schedule: intro and closing get a bar of their own, a recipe may switch acts off', () => {
  const s = T.schedule(cs({ benefits: Bn(1), intro: 'Tem experiência?', closing: 'Começa já', contact: WA }), { duration: 'auto', has: { V: false } });
  assert.deepEqual(kindsOf(s), ['H', 'I', 'M', 'C', 'F', 'K', 'O']);
});

function sample() {
  const p = M.newProject(TPL, { trades: ['pedreiro', 'servente'] });
  p.whatsapp = { country: '351', number: '912345678' };
  p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
  return p;
}

const only = (items, keep) => ({ edits: Object.fromEntries(items.filter((_, i) => !keep.includes(i)).map((x) => [x.id, null])), added: [], order: null });

test('content: the video\'s eyes and lists hide benefits, highlights, positions and the QR', () => {
  const p = sample();
  const items = p.texts['pt-PT'].benefits;
  p.video.show = { ...p.video.show, highlights: false, positions: false, chat: false, qr: false };
  p.video.texts = { 'pt-PT': { benefits: only(items, [1, 3]) } };
  const c = T.content(p, 'pt-PT');
  assert.deepEqual(c.benefits, [items[1].text, items[3].text]);
  assert.deepEqual(c.benefitIds, [items[1].id, items[3].id]);
  assert.deepEqual(c.icons, [items[1].icon, items[3].icon]);
  assert.deepEqual(c.highlights, []);
  assert.equal(c.offer, null);
  assert.equal(c.vacancies, null);
  assert.deepEqual(c.positions, []);
  assert.equal(c.qr, false);
  assert.equal(c.chat, false);
  assert.match(c.message, /pedreiro/);
});

test('content: video texts win over the image, per language', () => {
  const p = M.addLocale(sample(), 'fr', 'pt-PT');
  p.video.texts = { 'pt-PT': { headline: 'Novo título', kicker: 'Chamada minha', intro: 'Intro minha', positionsTitle: 'Procuro:' } };
  const c = T.content(p, 'pt-PT');
  assert.deepEqual([c.headline, c.kicker, c.intro, c.positionsTitle], ['Novo título', 'Chamada minha', 'Intro minha', 'Procuro:']);
  assert.equal(T.content(p, 'fr').headline, p.texts.fr.headline.trim());
});

test('content: every list follows the image item by item', () => {
  const p = sample();
  const b = p.texts['pt-PT'].benefits;
  p.video.texts = { 'pt-PT': { benefits: { edits: { [b[0].id]: 'Editado no vídeo' }, added: [{ id: 'x1', text: 'Meu' }], order: null } } };
  b[1].text = 'Mudado na imagem';
  const c = T.content(p, 'pt-PT');
  assert.equal(c.benefits[0], 'Editado no vídeo');
  assert.equal(c.benefits[1], 'Mudado na imagem');
  assert.equal(c.benefits[c.benefits.length - 1], 'Meu');
  assert.equal(c.icons[c.icons.length - 1], 'check');
});

test('content: highlights start from salary, vacancies and badge', () => {
  const p = sample();
  p.texts['pt-PT'].badge = '';
  const h = T.content(p, 'pt-PT').highlights;
  assert.deepEqual(h.map((x) => [x.role, x.value, x.label, x.count]), [['salary', '1900 €', 'por mês', 1900], ['vacancies', '12', 'vagas', 12]]);
  p.texts['pt-PT'].badge = 'Início imediato';
  assert.deepEqual(T.content(p, 'pt-PT').highlights[2], { id: 'badge', role: 'badge', value: 'Início imediato', label: '', count: null, prefix: '', suffix: '' });
  p.show.badge = false;
  assert.equal(T.content(p, 'pt-PT').highlights.length, 2);
});

test('content: highlights keep their text; only plain numbers count', () => {
  const p = sample();
  p.texts['pt-PT'].badge = '';
  p.video.texts = { 'pt-PT': { highlights: { edits: { salary: { value: '1 900,50 €' }, vacancies: { value: '10+' } }, added: [
    { id: 'a', role: 'own', value: 'A combinar', label: 'salário' },
    { id: 'b', role: 'own', value: '', label: 'Alojamento pago' },
    { id: 'e', role: 'own', value: '', label: '' },
    { id: 'c', role: 'own', value: '40 h', label: 'por semana' },
  ], order: null } } };
  const c = T.content(p, 'pt-PT');
  assert.deepEqual(c.highlights.map((x) => [x.value, x.count]), [['1 900,50 €', null], ['10+', null], ['A combinar', null], ['', null], ['40 h', 40]]);
  assert.deepEqual([c.highlights[4].prefix, c.highlights[4].suffix], ['', ' h']);
  assert.equal(c.offer.amount, '1 900,50 €');
  assert.equal(c.vacancies.count, '10+');
});

test('content: the button, the hint and the message are his', () => {
  const p = sample();
  p.video.texts = { 'pt-PT': { cta: 'Fala comigo', hint: 'Lê o código', message: 'Olá, quero a vaga', brandName: 'Obras do Zé' } };
  const c = T.content(p, 'pt-PT');
  assert.deepEqual([c.contact.cta, c.contact.hint, c.message, c.brandName], ['Fala comigo', 'Lê o código', 'Olá, quero a vaga', 'Obras do Zé']);
});

test('content: the video\'s eyes start from the image\'s', () => {
  const p = sample();
  p.show.benefits = false;
  assert.deepEqual(T.content(p, 'pt-PT').benefits, []);
  p.video.show = { ...p.video.show, benefits: true };
  assert.equal(T.content(p, 'pt-PT').benefits.length, p.texts['pt-PT'].benefits.filter((x) => x.text.trim()).length);
  p.video.texts = { 'pt-PT': { closing: 'Começa segunda' } };
  assert.equal(T.content(p, 'pt-PT').closing, ''); // the closing line starts hidden
  p.video.show.closing = true;
  assert.equal(T.content(p, 'pt-PT').closing, 'Começa segunda');
});

test('content: an empty video headline falls back to the brand, then the first benefit', () => {
  const p = sample();
  p.brand = { ...p.brand, name: 'Obras Lda' };
  p.video.texts = { 'pt-PT': { headline: '' } };
  assert.equal(T.content(p, 'pt-PT').headline, 'Obras Lda');
  p.brand = { ...p.brand, name: M.DEFAULT_BRAND.name };
  assert.equal(T.content(p, 'pt-PT').headline, p.texts['pt-PT'].benefits[0].text.trim());
});

test('content: model labels are translated and editable', () => {
  const p = M.addLocale(sample(), 'fr', 'pt-PT');
  const d = { 'pt-PT': 'EMBARQUE', fr: 'EMBARQUEMENT' };
  assert.equal(T.content(p, 'pt-PT').labelFor('partidas', 'gate', d), 'EMBARQUE');
  assert.equal(T.content(p, 'fr').labelFor('partidas', 'gate', d), 'EMBARQUEMENT');
  p.video.texts = { fr: { model: { partidas: { gate: 'PORTE' } } } };
  assert.equal(T.content(p, 'fr').labelFor('partidas', 'gate', d), 'PORTE');
  assert.equal(T.content(p, 'fr').labelFor('partidas', 'other', { 'pt-PT': 'X' }), 'X');
});

test('content: the ad\'s contacts come with it, unless the block is hidden', () => {
  const p = sample();
  p.texts['pt-PT'].contacts = [M.iconItem('mail', ' emprego@exemplo.pt '), M.iconItem('phone', '  ')];
  assert.deepEqual(T.content(p, 'pt-PT').contacts, ['emprego@exemplo.pt']);
  p.show.contacts = false;
  assert.deepEqual(T.content(p, 'pt-PT').contacts, []);
});

test('content: removing every benefit leaves none', () => {
  const p = sample();
  p.video.texts = { 'pt-PT': { benefits: only(p.texts['pt-PT'].benefits, []) } };
  assert.deepEqual(T.content(p, 'pt-PT').benefits, []);
});

test('content: with no choice the benefits are all there, chat and QR on', () => {
  const p = sample();
  const c = T.content(p, 'pt-PT');
  assert.equal(c.benefits.length, p.texts['pt-PT'].benefits.length);
  assert.equal(c.qr, true);
  assert.equal(c.chat, true);
  assert.ok(c.offer && c.vacancies);
});

test('build: the closing card of the styles lasts the chosen hold', () => {
  const p = sample();
  const c = T.content(p, 'pt-PT');
  const tl = T.build(c, { duration: 15, scenes: ['hook', 'benefit', 'counter', 'benefit', 'wall', 'benefit', 'end'], hold: 4 });
  const end = tl.scenes[tl.scenes.length - 1];
  assert.ok(end.end - end.start >= 4, `end card ${end.end - end.start} s`);
});
