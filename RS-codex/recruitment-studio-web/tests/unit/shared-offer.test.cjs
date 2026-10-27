const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'motion-timeline.js', 'workflow.js', 'reuse.js', 'production.js');
const M = RS.model;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => { const p = M.newProject(TPL); Object.assign(p.offer, { salary: '2400', vacancies: '3', location: 'Lausanne', startDate: '2026-11-10' }); return p; };

test('common offer migrates older ads without changing image visibility and rejects invalid dates', () => {
  const p = project(); p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '2' };
  const q = M.normalize(p);
  assert.equal(q.offer.location, ''); assert.equal(q.offer.startDate, '');
  assert.equal(M.offerText(q, 'pt-PT', 'image'), null);
  assert.equal(M.offerText(q, 'pt-PT', 'video'), '1900 € por mês · 2 vagas');
  q.offer.startDate = '2026-02-30'; assert.equal(M.normalize(q).offer.startDate, '');
  q.offer.startDate = 'not-a-date'; assert.equal(M.normalize(q).offer.startDate, '');
  const other = project(); other.offer.visibility.image = true; assert.equal(project().offer.visibility.image, false, 'new ads must not share visibility objects');
});

test('common offer controls each output independently and projects into hidden intro without mutating editable text', () => {
  const p = project(), original = JSON.stringify(p.texts); p.show.intro = false;
  p.offer.visibility.image = true;
  const image = M.offerProjection(p, 'pt-PT');
  assert.equal(image.show.intro, true); assert.match(image.t.intro, /2400.*Lausanne.*2026/);
  assert.equal(image.t.intro.includes(p.texts['pt-PT'].intro), false);
  assert.equal(JSON.stringify(p.texts), original);
  assert.match(M.caption(p, 'pt-PT'), /Lausanne/);
  p.offer.visibility.caption = false; assert.equal(M.caption(p, 'pt-PT').includes('Lausanne'), false);
  assert.match(M.offerProjection(p, 'pt-PT').t.intro, /Lausanne/);
  const pages = () => RS.production.plan(p, 'pt-PT', 'portrait', (s, size) => s.length * size * 0.4).flatMap((v) => v.lines).join(' ');
  assert.match(pages(), /Lausanne/); p.offer.visibility.carousel = false; assert.equal(pages().includes('Lausanne'), false);
});

test('common offer uses localized labels and reaches recipe highlights and older video text cards', () => {
  const p = project();
  for (const locale of ['pt-PT', 'de-CH', 'de-DE', 'fr', 'es', 'it', 'en']) {
    const o = M.offerParts(p, locale); assert.match(o.startDate, /2026/); assert.ok(o.locationLabel && o.startLabel);
  }
  let content = RS.motionTimeline.content(p, 'pt-PT');
  assert.ok(content.benefits.some((v) => v.includes('Lausanne')));
  assert.ok(content.benefitIds.includes('offer:startDate'));
  p.video.motion = 'tijolo'; content = RS.motionTimeline.content(p, 'pt-PT');
  assert.equal(content.highlights.find((v) => v.id === 'location').value, 'Lausanne');
  assert.equal(content.benefits.some((v) => v.includes('Lausanne')), false, 'recipes must not duplicate common fields as benefits');
  p.offer.visibility.video = false; content = RS.motionTimeline.content(p, 'pt-PT');
  assert.equal(content.offer, null); assert.equal(content.vacancies, null);
  assert.equal(content.highlights.some((v) => ['location', 'startDate', 'salary', 'vacancies'].includes(v.id)), false);
  assert.equal(M.offerProjection(p, 'pt-PT', 'video').t.intro.includes('Lausanne'), false);
});

test('custom publication text warns on offer/contact changes, survives normalization and can be confirmed without rewriting', () => {
  let p = M.addLocale(project(), 'fr', 'pt-PT');
  M.setPublicationText(p, 'pt-PT', 'Texto próprio'); M.setPublicationText(p, 'fr', 'Texte personnalisé');
  assert.equal(M.captionStatus(p, 'pt-PT'), 'current');
  p = M.normalize(p); assert.equal(M.captionStatus(p, 'pt-PT'), 'current');
  p.name = 'Só o nome interno'; assert.equal(M.captionStatus(p, 'pt-PT'), 'current');
  p.offer.salary = '2600'; assert.equal(M.captionStatus(p, 'pt-PT'), 'stale'); assert.equal(M.captionStatus(p, 'fr'), 'stale');
  assert.equal(M.publicationText(p, 'pt-PT'), 'Texto próprio');
  M.confirmPublicationText(p, 'pt-PT'); assert.equal(M.captionStatus(p, 'pt-PT'), 'current'); assert.equal(M.captionStatus(p, 'fr'), 'stale');
  p.texts['pt-PT'].contacts[0].text = 'novo@example.test'; assert.equal(M.captionStatus(p, 'pt-PT'), 'stale');
  const warnings = RS.workflow.preflight(p, { combos: [{ l: 'pt-PT', f: 'portrait' }] });
  assert.ok(warnings.some((v) => v.caption && v.locale === 'pt-PT'));
  M.setPublicationText(p, 'pt-PT', null); assert.equal(M.captionStatus(p, 'pt-PT'), 'automatic');
  assert.equal(p.captionSources['pt-PT'], undefined);
  delete p.captionSources.fr; assert.equal(M.captionStatus(M.normalize(p), 'fr'), 'unverified');
});

test('changing a brand reopens caption review while preserving the custom text and approvals of unrelated languages', () => {
  const p = project(); M.setPublicationText(p, 'pt-PT', 'Texto com contactos antigos');
  const changed = RS.reuse.applyBrand(p, { savedAt: 1, name: 'Nova empresa', contacts: [{ icon: 'mail', text: 'equipa@example.test' }] });
  assert.equal(M.captionStatus(changed, 'pt-PT'), 'stale');
  assert.equal(M.publicationText(changed, 'pt-PT'), 'Texto com contactos antigos');
});
