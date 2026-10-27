const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'reuse.js', 'production.js');
const M = RS.model, P = RS.production, R = RS.reuse;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => M.addLocale(M.newProject(TPL), 'fr', 'pt-PT');
const measure = (s, size) => Array.from(s).length * size * .53;
const blob = (s = 'png') => new Blob([s]);

test('brands apply fonts and locale contacts, clearing previous company links and video contact overrides', () => {
  const p = project(); p.brand.name = 'Nord'; p.style.fonts = 'elegant'; p.style.upper = false;
  p.texts.fr.contacts = [M.iconItem('mail', 'bonjour@example.test')];
  const b = R.captureBrand(p, 'Nord FR');
  const old = project(); old.logo = { asset: 'old-logo' }; old.whatsapp = { country: 'PT', number: '912345678' };
  old.texts.fr.qr = 'https://old.test'; old.texts.fr.waMessage = 'Old'; old.video.texts.fr = { contacts: { added: [{ id: 'old', text: 'old@test.test' }] }, brandName: 'Old', headline: 'Keep title' };
  const next = R.applyBrand(old, b);
  assert.equal(next.style.fonts, 'elegant'); assert.equal(next.style.upper, false);
  assert.equal(next.texts.fr.contacts[0].text, 'bonjour@example.test');
  assert.equal(next.logo, null); assert.equal(next.whatsapp, null); assert.equal(next.texts.fr.qr, ''); assert.equal(next.texts.fr.waMessage, '');
  assert.equal(next.video.texts.fr.contacts, undefined); assert.equal(next.video.texts.fr.brandName, undefined); assert.equal(next.video.texts.fr.headline, 'Keep title');
  next.texts.fr.contacts[0].text = 'changed'; assert.equal(b.contactsByLocale.fr[0].text, 'bonjour@example.test'); assert.equal(old.texts.fr.qr, 'https://old.test');
});
test('personal templates retain multilingual copy and media but create independent drafts', () => {
  const p = project(); p.captions.fr = ''; p.captions['pt-PT'] = 'Custom'; p.photo = { asset: 'photo' }; p.video.ownSound = 'sound';
  p.organization = M.cleanOrganization({ campaign: 'Old', status: 'published', favorite: true });
  const template = R.captureTemplate(p, 'Base pessoal', 'thumb'), a = R.instantiate(template), b = R.instantiate(template);
  assert.notEqual(a.id, b.id); assert.notEqual(a.id, p.id); assert.equal(a.name, 'Base pessoal');
  assert.equal(a.photo.asset, 'photo'); assert.equal(a.video.ownSound, 'sound'); assert.deepEqual(a.captions, p.captions);
  assert.equal(a.organization.status, 'draft'); assert.equal(a.organization.campaign, ''); assert.equal(a.organization.favorite, false);
  a.texts.fr.headline = 'Changed'; assert.notEqual(template.project.texts.fr.headline, a.texts.fr.headline);
});
test('brand rejects an incomplete WhatsApp number; locale message templates survive applying the brand', () => {
  const p = project(); p.whatsapp = { country: '351', number: '12' };
  assert.throws(() => R.captureBrand(p, 'Invalid'), /Complete/);
  p.whatsapp = { country: '351', number: '912345678' }; p.waTemplates.fr = 'Bonjour, {profissões}';
  const b = R.captureBrand(p, 'Valid'), applied = R.applyBrand(project(), b);
  assert.equal(applied.waTemplates.fr, 'Bonjour, {profissões}'); assert.match(RS.contact.adMessage(applied, 'fr'), /^Bonjour,/);
});
test('carousel wraps long words without losing Unicode characters', () => {
  const text = 'A'.repeat(180) + '😀'.repeat(14);
  const lines = P.wrap(text, (s) => Array.from(s).length, 13);
  assert.equal(lines.join(''), text); assert.ok(lines.every((s) => Array.from(s).length <= 13));
});
test('carousel paginates long content, honors hidden sections and keeps every list item', () => {
  const p = project(), t = p.texts.fr; t.benefits = Array.from({ length: 33 }, (_, i) => M.item(`Avantage ${i} ` + 'mot '.repeat(80)));
  p.show.intro = false; p.show.positions = false; p.show.badge = false;
  const pages = P.plan(p, 'fr', 'square', measure);
  assert.ok(pages.length > 20); assert.ok(!pages.some((s) => ['intro', 'positions'].includes(s.kind)));
  const joined = pages.filter((s) => s.kind === 'benefits').flatMap((s) => s.lines).join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(joined, t.benefits.map((v) => v.text.trim()).join(' '));
  assert.ok(pages.every((s, i) => s.index === i + 1 && s.total === pages.length));
  assert.ok(pages.every((s) => s.lines.every((line) => measure(line, s.size) <= 912)));
  assert.throws(() => P.plan(p, 'xx', 'square', measure), /língua/);
});
test('carousel respects QR visibility and puts QR only on the final contact slide', () => {
  const p = project(); RS.engine = { qrText: ({ show }) => show.qr && show.contacts ? 'https://example.test' : '' };
  p.texts.fr.contacts = Array.from({ length: 20 }, (_, i) => M.iconItem('mail', `contact${i}@example.test`));
  const pages = P.plan(p, 'fr', 'portrait', measure);
  assert.equal(pages.filter((s) => s.qr).length, 1); assert.equal(pages.at(-1).qr, 'https://example.test');
  p.show.contacts = false; assert.ok(!P.plan(p, 'fr', 'portrait', measure).some((s) => s.kind === 'contact' || s.qr));
});
function adapters(extra = {}) { return { measure, imageBlob: async (f, l) => blob(f + l), slideBlob: async (s, l) => blob(s.index + l), ...extra }; }
test('campaign ZIP contains selected languages, numbered slides, exact captions and portable project', async () => {
  const p = project(); p.captions.fr = 'Publication française ✨'; p.captions['pt-PT'] = '';
  RS.assets = { exportProjectFile: async (v) => blob(JSON.stringify({ project: v })) };
  const result = await P.packageFiles(p, { mode: 'campaign', parts: { video: false } }, adapters());
  const names = result.files.map((f) => f.name);
  for (const l of p.locales) for (const f of ['feed.png', 'story.png', 'cover.png', 'publicacao.txt', 'carrossel/001.png']) assert.ok(names.includes(`${l}/${f}`));
  assert.ok(names.includes('projeto.anuncio')); assert.ok(names.includes('manifesto.json')); assert.ok(names.includes('LEIA-ME.txt'));
  const txt = (n) => new TextDecoder().decode(result.files.find((f) => f.name === n).bytes);
  assert.equal(txt('fr/publicacao.txt'), p.captions.fr); assert.equal(txt('pt-PT/publicacao.txt'), '');
  assert.equal(new DataView(await result.blob.arrayBuffer()).getUint32(0, true), 0x04034b50);
  const subset = await P.packageFiles(p, { mode: 'carousel', locales: ['fr'], format: 'square' }, adapters());
  assert.ok(subset.files.every((f) => !f.name.startsWith('pt-PT/'))); assert.ok(!subset.files.some((f) => f.name.endsWith('feed.png')));
});
test('package uses a fixed snapshot, rejects empty selections and never returns a partial failed export', async () => {
  const p = project(); p.captions.fr = 'Before';
  const result = await P.packageFiles(p, { mode: 'carousel', locales: ['fr'] }, adapters({ yieldUI: async () => { p.captions.fr = 'After'; } }));
  assert.equal(new TextDecoder().decode(result.files.find((f) => f.name === 'fr/publicacao.txt').bytes), 'Before');
  await assert.rejects(P.packageFiles(p, { mode: 'carousel', locales: [] }, adapters()), /língua/);
  await assert.rejects(P.packageFiles(p, { mode: 'campaign', parts: Object.fromEntries(Object.keys(P.PARTS).map((k) => [k, false])) }, adapters()), /peça/);
  await assert.rejects(P.packageFiles(p, { mode: 'carousel' }, adapters({ slideBlob: async () => { throw Error('Render failed'); } })), /Render failed/);
});
test('cancellation prevents the next renderer and aborts the package', async () => {
  const signal = new AbortController(); let called = 0;
  await assert.rejects(P.packageFiles(project(), { mode: 'carousel' }, adapters({ signal: signal.signal, yieldUI: async () => signal.abort(), slideBlob: async () => { called++; return blob(); } })), { name: 'AbortError' });
  assert.equal(called, 0);
});
test('campaign creates each video using actual extension, soundtrack and timeline; silent fallback fails explicitly', async () => {
  const p = project(); p.video.sound = 'generated'; p.video.motion = 'poster';
  const calls = [], audio = { samples: 'test' };
  RS.motion = { prepare: (p, o) => ({ timeline: { duration: 8 }, locale: o.locale }), render() {} };
  RS.sound = { renderGenerated: async () => audio };
  RS.video = { support: async () => ({ method: 'recorder' }), extOf: () => 'webm', create: async (p, o) => { calls.push(o); return blob('video'); } };
  const parts = Object.fromEntries(Object.keys(P.PARTS).map((k) => [k, k === 'video']));
  const result = await P.packageFiles(p, { mode: 'campaign', parts }, adapters());
  assert.equal(calls.length, 2); assert.ok(calls.every((v) => v.format === 'story' && v.duration === 8 && v.audio === audio));
  assert.ok(result.files.some((f) => f.name === 'fr/video.webm'));
  RS.video.create = async () => Object.assign(blob('silent'), { silent: true });
  await assert.rejects(P.packageFiles(p, { mode: 'campaign', parts }, adapters()), /sem o som escolhido/);
  RS.video.support = async () => ({ method: null });
  await assert.rejects(P.packageFiles(p, { mode: 'campaign', parts }, adapters()), /não cria vídeo/);
});
