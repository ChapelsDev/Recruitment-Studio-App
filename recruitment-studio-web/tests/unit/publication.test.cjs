const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'workflow.js', 'reuse.js');
const M = RS.model, W = RS.workflow;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => M.addLocale(M.newProject(TPL), 'fr', 'pt-PT');
const records = (p) => [{ id: p.id, data: p, deletedAt: p.deletedAt }];

test('publication migration validates dates, channels, languages and safe links', () => {
  const p = project(); delete p.publication;
  assert.deepEqual(M.normalize(p).publication, { plannedDate: '', closeDate: '', channels: [], entries: {} });
  p.publication = { plannedDate: '2026-02-30', closeDate: '2026-12-20', channels: ['facebook', 'bad', 'facebook'], entries: { fr: { facebook: { published: true, date: '2026-10-20', url: 'javascript:alert(1)' }, other: { url: 'https://example.test/post' } }, xx: {} } };
  const plan = M.normalize(p).publication; assert.equal(plan.plannedDate, ''); assert.equal(plan.closeDate, '2026-12-20'); assert.deepEqual(plan.channels, ['facebook']);
  assert.equal(plan.entries.xx, undefined); assert.equal(plan.entries.fr.facebook.url, ''); assert.equal(plan.entries.fr.other.url, 'https://example.test/post');
  assert.equal(M.removeLocale(p, 'fr').publication.entries.fr, undefined);
});

test('publication tasks track each language and channel, changed published content, due dates and closure', () => {
  const p = project(); p.publication.plannedDate = '2026-10-26'; p.publication.closeDate = '2026-10-30'; p.publication.channels = ['facebook', 'instagram'];
  W.setPublished(p.publication, p, 'pt-PT', 'facebook', true, '2026-10-25');
  let tasks = W.publicationTasks(records(p), '2026-10-26');
  assert.equal(tasks.publish[0].details.length, 3); assert.equal(tasks.publish[0].due, true); assert.equal(tasks.close[0].due, false); assert.equal(tasks.review.length, 0);
  p.name = 'Internal label'; p.organization.campaign = 'Campaign'; assert.equal(W.publicationTasks(records(p)).review.length, 0);
  p.texts.fr.headline = 'Texte modifié'; assert.equal(W.publicationTasks(records(p)).review.length, 0, 'unpublished French changes do not stale Portuguese');
  p.texts['pt-PT'].headline = 'Título atualizado'; tasks = W.publicationTasks(records(p)); assert.deepEqual(tasks.review[0].details, ['PT · Facebook']);
  W.setPublished(p.publication, p, 'pt-PT', 'facebook', true); assert.equal(W.publicationTasks(records(p)).review.length, 0);
  assert.equal(p.publication.entries['pt-PT'].facebook.date, '2026-10-25', 'confirmation retains publication date');
  p.organization.status = 'closed'; assert.equal(Object.values(W.publicationTasks(records(p))).flat().length, 0);
  p.organization.status = 'published'; p.deletedAt = 1; assert.equal(Object.values(W.publicationTasks(records(p))).flat().length, 0);
});

test('portable rebase keeps current publication records current, without clearing genuine stale flags', () => {
  const p = project(); p.photo = { asset: 'old', zoom: 1, fx: .5, fy: .5 }; p.publication.channels = ['facebook'];
  W.setPublished(p.publication, p, 'pt-PT', 'facebook', true);
  const imported = M.normalize(p); imported.photo.asset = 'new'; W.rebasePublication(p, imported);
  assert.equal(W.publicationTasks(records(imported)).review.length, 0);
  p.texts['pt-PT'].headline = 'Changed'; const staleCopy = M.normalize(p); staleCopy.photo.asset = 'new'; W.rebasePublication(p, staleCopy);
  assert.equal(W.publicationTasks(records(staleCopy)).review.length, 1);
  const template = RS.reuse.captureTemplate(p, 'Base'); assert.deepEqual(template.project.publication.entries, {});
});
