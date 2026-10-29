// The ad's automatic name (2026-10-28, «Balão»): its trades, plus the location
// from «Organizar»; names typed by hand are never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js');
const { app } = require('./ui-harness.cjs');

const M = RS.model;
const TPL = { id: 'diagonal', trade: 'obras', sample: 'construction', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const ad = (trades) => M.newProject(TPL, { trades });

test('one trade: its label', () => {
  assert.equal(ad(['pedreiro']).name, 'Pedreiros e masseiros');
});
test('two trades: the short plurals joined by «e»', () => {
  assert.equal(ad(['pedreiro', 'servente']).name, 'Pedreiros e serventes');
});
test('three trades: «e mais N»', () => {
  assert.equal(ad(['pedreiro', 'servente', 'pintor']).name, 'Pedreiros, serventes e mais 1');
});
test('with a location', () => {
  const p = ad(['pedreiro', 'servente']);
  p.organization = { location: 'Lausanne' };
  assert.equal(M.autoName(p), 'Pedreiros e serventes, Lausanne');
  assert.equal(M.applyAutoName(p).name, 'Pedreiros e serventes, Lausanne');
});
test('a renamed ad keeps its name', () => {
  const p = ad(['pedreiro']);
  p.name = 'Obra do Rui'; p.nameAuto = false;
  assert.equal(M.normalize(p).name, 'Obra do Rui');
  p.trades = ['pintor']; p.trade = 'pintor';
  assert.equal(M.applyTradeTexts(p).name, 'Obra do Rui');
});
test('an old automatic name follows the rule', () => {
  const p = ad(['obras']);
  delete p.nameAuto;
  p.name = p.texts['pt-PT'].headline;
  assert.equal(M.normalize(p).name, 'Obras gerais');
});
test('an old typed name stays', () => {
  const p = ad(['obras']);
  delete p.nameAuto;
  p.name = 'Lausanne março';
  const n = M.normalize(p);
  assert.equal(n.name, 'Lausanne março');
  assert.equal(n.nameAuto, false);
});

test('the headline no longer renames the ad', async (t) => {
  const a = await app(t, 1280, (p) => { p.nameAuto = true; });
  await a.click(a.$('.proj-open'));
  const field = await a.until(() => a.$('#f-headline'), 'the editor');
  await a.type(field, 'Novo título');
  assert.ok(!a.$('.name-input').value.includes('Novo título'), a.$('.name-input').value);
});

test('a location from «Organizar» joins the name', async (t) => {
  const a = await app(t, 1280, (p) => { p.nameAuto = true; });
  await a.RS.store.updateOrganization(a.p.id, { location: 'Genebra' });
  const rec = await a.RS.store.getProject(a.p.id);
  assert.equal(rec.name, `${a.RS.model.autoName({ ...rec.data, organization: {} })}, Genebra`);
});

test('duplicates show the template on the home', async (t) => {
  const a = await app(t, 1280, async (p, R) => {
    p.nameAuto = true; R.model.applyAutoName(p);
    const q = R.model.newProject(R.templates.list[0]);
    q.nameAuto = true;
    await R.store.putProject(R.model.normalize(q));
  });
  await a.until(() => a.$$('.proj-card').length === 2, 'two ads');
  const tpl = a.RS.templates.list[0].name;
  for (const meta of a.$$('.proj-card .proj-meta')) assert.ok(meta.textContent.trim().startsWith(`${tpl}, `), meta.textContent);
});
