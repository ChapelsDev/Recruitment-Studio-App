const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'motion-timeline.js', 'workflow.js');
const M = RS.model, W = RS.workflow;
const template = { id: 'diagonal', trade: 'pedreiro', defaults: { show: {}, fonts: 'modern' } };
const project = () => M.newProject(template);
const bilingual = () => M.addLocale(project(), 'fr', 'pt-PT');
const row = (p, key) => W.reviewRows(p, 'fr').find((r) => r.key === key);
const check = (p, options = {}) => W.preflight(p, { combos: [{ l: 'pt-PT', f: 'portrait' }], ...options });
const record = (p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, deletedAt: p.deletedAt, data: p });

test('campaigns: normalizes old and malformed metadata without changing poster content', () => {
  const p = project(), text = JSON.stringify(p.texts);
  delete p.organization;
  assert.equal(M.normalize(p).organization.status, 'draft');
  p.organization = { campaign: ' Norte ', tags: ['Urgente', 'urgente', '', null, 'Suíça', 'suica'], status: 'oops', favorite: 'true' };
  const n = M.normalize(p);
  assert.deepEqual(n.organization, { campaign: 'Norte', client: '', location: '', tags: ['Urgente', 'Suíça'], status: 'draft', favorite: false });
  assert.equal(JSON.stringify(n.texts), text);
});

test('campaigns: combined accent-insensitive search, filters and sort exclude trash', () => {
  const a = project(), b = project(), c = project();
  a.name = 'Zebra'; a.updatedAt = 1;
  a.organization = M.cleanOrganization({ campaign: 'Outono', client: 'Construção Norte', location: 'Suíça', tags: ['urgente'], favorite: true, status: 'ready' });
  b.name = 'Álfa'; b.updatedAt = 2; b.organization = M.cleanOrganization({ campaign: 'Verão' });
  c.deletedAt = 5;
  const rs = [record(c), record(a), record(b)];
  assert.deepEqual(W.selectProjects(rs, { query: 'construcao suica', campaign: 'Outono', tag: 'urgente', favorite: true, status: 'ready' }).map((r) => r.id), [a.id]);
  assert.deepEqual(W.selectProjects(rs, { sort: 'name' }).map((r) => r.id), [b.id, a.id]);
  assert.deepEqual(W.selectProjects(rs, { sort: 'oldest' }).map((r) => r.id), [a.id, b.id]);
  assert.deepEqual(W.selectProjects(rs, { status: 'published' }), []);
  assert.deepEqual(W.facets(rs), { campaigns: ['Outono', 'Verão'], tags: ['urgente'] });
});

test('review: detects copied, missing, source changes, target changes and explicit confirmation', () => {
  let p = project(); p.texts['pt-PT'].intro = 'Alojamento perto da obra';
  p = M.addLocale(p, 'fr', 'pt-PT');
  assert.equal(row(p, 'intro').status, 'copied');
  p.texts.fr.intro = '';
  assert.equal(row(p, 'intro').status, 'missing');
  p.texts.fr.intro = 'Logement à proximité du chantier';
  W.markReviewed(p, 'fr', 'intro');
  assert.equal(row(p, 'intro').status, 'reviewed');
  p.texts['pt-PT'].intro += ' e transporte';
  assert.equal(row(p, 'intro').status, 'stale');
  W.markReviewed(p, 'fr', 'intro');
  p.texts.fr.intro += ' et transport';
  assert.equal(row(p, 'intro').status, 'pending');
  W.markReviewed(p, 'fr', 'intro');
  assert.equal(row(M.normalize(p), 'intro').status, 'reviewed');
});

test('review: changing a source before the first review is still detected', () => {
  const p = bilingual(); p.texts['pt-PT'].headline = 'Novas funções';
  assert.equal(row(p, 'headline').status, 'stale');
  assert.notEqual(row(p, 'intro').status, 'stale');
});

test('review: list additions, order and removal invalidate only the affected review', () => {
  const p = bilingual(); W.markReviewed(p, 'fr', 'benefits'); W.markReviewed(p, 'fr', 'headline');
  p.texts['pt-PT'].benefits.reverse();
  assert.equal(row(p, 'benefits').status, 'stale');
  W.markReviewed(p, 'fr', 'benefits');
  p.texts['pt-PT'].benefits.push(M.item('Transporte pago'));
  assert.equal(row(p, 'benefits').status, 'stale');
  W.markReviewed(p, 'fr', 'benefits'); p.texts['pt-PT'].benefits = [];
  assert.equal(row(p, 'benefits').status, 'stale');
  assert.equal(row(p, 'headline').status, 'reviewed');
});

test('review: custom and intentionally empty captions are reviewed without overwriting the other language', () => {
  const p = bilingual(); const pt = M.publicationText(p, 'pt-PT');
  W.editTranslation(p, 'fr', 'caption', ''); W.markReviewed(p, 'fr', 'caption');
  assert.equal(row(p, 'caption').status, 'reviewed');
  assert.equal(M.publicationText(p, 'fr'), ''); assert.equal(M.publicationText(p, 'pt-PT'), pt);
  M.setPublicationText(p, 'pt-PT', 'Nouvelle publication');
  assert.equal(row(p, 'caption').status, 'stale');
});

test('review: deleting and re-adding languages removes obsolete approvals and handles legacy ads', () => {
  const p = bilingual(); W.markReviewed(p, 'fr', 'headline');
  const removed = M.removeLocale(p, 'fr'); assert.equal(removed.translationReview.fr, undefined);
  const added = M.addLocale(removed, 'fr', 'pt-PT'); assert.notEqual(row(added, 'headline').status, 'reviewed');
  const primaryRemoved = M.normalize(M.removeLocale(p, 'pt-PT'));
  assert.deepEqual(W.reviewRows(primaryRemoved, 'fr'), []);
  delete p.translationReview;
  assert.notEqual(row(M.normalize(p), 'headline').status, 'reviewed');
});

test('review: separate video text edits reopen review; inherited text needs no duplicate block', () => {
  const p = bilingual(); assert.equal(row(p, 'video'), undefined);
  p.video.texts.fr = { headline: 'Postes ouverts' };
  W.markReviewed(p, 'fr', 'video'); assert.equal(row(p, 'video').status, 'reviewed');
  p.video.texts.fr.headline = 'Postes urgents'; assert.equal(row(p, 'video').status, 'pending');
  p.video.texts['pt-PT'] = { headline: 'Vagas urgentes' }; assert.equal(row(p, 'video').status, 'stale');
});

test('preflight: sample contacts do not count as usable and their action targets the sample field', () => {
  const p = project(), cs = check(p);
  assert.ok(cs.some((x) => x.id === 'example:pt-PT' && x.field === `contact:${p.texts['pt-PT'].contacts[0].id}`));
  assert.ok(cs.some((x) => x.id === 'contact:pt-PT'));
  p.texts['pt-PT'].contacts = [M.iconItem('mail', 'candidaturas@obras.test')];
  assert.ok(!check(p).some((x) => x.id.startsWith('contact:') || x.id.startsWith('example:')));
  p.show.contacts = false;
  assert.ok(check(p).some((x) => x.id === 'contact:pt-PT'));
});

test('preflight: respects hidden WhatsApp, invalid QR and only the selected languages', () => {
  const p = bilingual(); p.texts['pt-PT'].contacts = [];
  p.whatsapp = { country: '351', number: '912345678' };
  assert.ok(!check(p).some((x) => x.id === 'contact:pt-PT'));
  p.show.qr = false; p.show.waCta = false;
  assert.ok(check(p).some((x) => x.id === 'contact:pt-PT'));
  p.show.qr = true; p.qrMode = 'link'; p.texts['pt-PT'].qr = 'javascript:alert(1)';
  assert.ok(check(p).some((x) => x.id === 'qr:pt-PT'));
  assert.ok(!check(p).some((x) => x.id === 'translation:fr'));
  assert.ok(check(p, { combos: [{ l: 'fr', f: 'story' }] }).some((x) => x.id === 'translation:fr'));
  assert.deepEqual(check(p, { combos: [] }), []);
});

test('preflight: video uses its own visible contacts and layout reports carry the right format', () => {
  const p = project(); p.show.contacts = false; p.video.show.contacts = true;
  p.video.texts['pt-PT'] = { contacts: { edits: Object.fromEntries(p.texts['pt-PT'].contacts.map((x) => [x.id, null])), added: [M.item('jobs@obras.test')] } };
  assert.ok(!check(p, { kind: 'video' }).some((x) => x.id.startsWith('contact:') || x.id.startsWith('example:')));
  p.video.show.contacts = false;
  assert.ok(check(p, { kind: 'video' }).some((x) => x.id === 'contact:pt-PT'));
  const cs = check(p, { reports: [{ l: 'pt-PT', f: 'story', report: { shrink: .5, photoUpscale: 2 } }] });
  assert.equal(cs.find((x) => x.id.startsWith('small:')).format, 'story');
});

test('preflight: video omissions carry locale and format and are not poster warnings', () => {
  const p = bilingual(), old = RS.motion;
  RS.motion = { leftOut: () => ({ benefits: 3, positions: 2, highlights: 1, intro: false, closing: false }) };
  try {
    const options = { kind: 'video', combos: [{ l: 'fr', f: 'story' }], reports: [{ l: 'fr', f: 'story', prepared: { style: { recipe: false }, content: { intro: 'Intro', closing: '' } } }] };
    const warn = check(p, options).find((c) => c.id === 'omitted:fr:story');
    assert.equal(warn.locale, 'fr'); assert.equal(warn.format, 'story'); assert.equal(warn.videoTab, 'modelo');
    assert.match(warn.text, /3 vantagens.*2 vagas.*1 destaque.*introdução/);
    p.video.motion = 'poster'; assert.ok(!check(p, options).some((c) => c.id.startsWith('omitted:')));
    p.whatsapp = { country: '351', number: '1' };
    assert.ok(check(p).some((c) => c.id === 'whatsapp:pt-PT' && c.field === 'contact:wa'));
  } finally { RS.motion = old; }
});
