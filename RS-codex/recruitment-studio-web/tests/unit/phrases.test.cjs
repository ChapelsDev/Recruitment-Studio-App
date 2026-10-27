const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js', 'workflow.js', 'reuse.js');
const M = RS.model, R = RS.reuse, W = RS.workflow, T = RS.trades;
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };
const project = () => { const p = M.addLocale(M.newProject(TPL), 'fr', 'pt-PT'); p.organization.client = 'Norte'; return p; };
const phrase = () => R.cleanPhrase({ name: 'Alojamento', field: 'benefits', client: 'Norte', trade: 'pedreiro', values: { 'pt-PT': 'Alojamento incluído', fr: 'Logement inclus' }, approved: { 'pt-PT': 'Alojamento incluído', fr: 'Logement inclus' } });

test('reusable phrase approvals are bound to exact wording and catalog upgrades preserve existing libraries', () => {
  const p = phrase(); p.values.fr = 'Logement organisé';
  const q = R.cleanPhrase(p); assert.equal(q.approved.fr, undefined); assert.equal(q.approved['pt-PT'], p.values['pt-PT']);
  const c = R.catalog({ v: 1, brands: [{ id: 'brand' }], templates: [], defaultBrandId: 'brand' });
  assert.deepEqual(c.phrases, []); assert.equal(c.defaultBrandId, 'brand');
  R.mutate(c, { kind: 'phrase', type: 'save', value: q, id: q.id });
  assert.equal(c.phrases.length, 1); assert.equal(c.brands.length, 1);
  const draft = R.capturePhrase(project(), 'benefits'); assert.equal(Object.keys(draft.approved).length, 0);
});

test('suggestions require exact source, approved source and target, matching field, client and profession', () => {
  const p = project(), entry = phrase(), c = { phrases: [entry] };
  const find = (source = 'Alojamento incluído', field = 'benefits') => R.suggestPhrases(c, p, field, 'pt-PT', 'fr', source);
  assert.equal(find().length, 1); assert.equal(find('Alojamento incluido').length, 0); assert.equal(find('Alojamento não incluído').length, 0);
  assert.equal(find('Alojamento incluído', 'headline').length, 0);
  p.organization.client = 'Sul'; assert.equal(find().length, 0);
  entry.client = ''; assert.equal(find().length, 1);
  p.trades = ['eletricista']; assert.equal(find().length, 0);
  entry.trade = ''; assert.equal(find().length, 1);
  delete entry.approved.fr; assert.equal(find().length, 0);
});

test('inserting a phrase changes only approved selected languages and requires review in its new context', () => {
  const p = project(), entry = phrase(), originalPT = JSON.stringify(p.texts['pt-PT']);
  W.markReviewed(p, 'fr', 'benefits'); assert.equal(W.reviewRows(p, 'fr').find((r) => r.key === 'benefits').status, 'reviewed');
  R.applyPhrase(p, entry, ['fr']); assert.equal(p.texts.fr.benefits[0].text, 'Logement inclus');
  assert.equal(JSON.stringify(p.texts['pt-PT']), originalPT); assert.notEqual(W.reviewRows(p, 'fr').find((r) => r.key === 'benefits').status, 'reviewed');
  assert.ok(p.texts.fr.benefits[0].id); assert.equal(p.texts.fr.benefits[0].icon, 'check');
  entry.values.fr = 'Unapproved change'; R.applyPhrase(p, entry, ['fr']); assert.equal(p.texts.fr.benefits[0].text, 'Logement inclus');
});

test('all stock trades have complete Italian and Spanish text, and adding either language preserves custom wording', () => {
  for (const tr of T.list) for (const locale of ['it', 'es']) {
    const text = T.textsFor([tr.id], locale), source = T.textsFor([tr.id], 'pt-PT');
    for (const key of ['kicker', 'headline', 'intro', 'positionsTitle', 'badge']) { assert.ok(text[key]?.trim(), `${tr.id}/${locale}/${key}`); assert.notEqual(text[key], source[key]); }
    for (const key of ['benefits', 'positions', 'contacts']) assert.ok(text[key].every((v) => typeof v.text === 'string' && v.text.trim()));
    const translated = T.translate(source, tr.id, 'pt-PT', locale);
    assert.equal(translated.headline, text.headline);
    assert.deepEqual(translated.positions.map((x) => x.text), text.positions.map((x) => x.text));
    source.headline = 'Custom headline'; source.benefits[0].text = 'Custom benefit';
    const custom = T.translate(source, tr.id, 'pt-PT', locale);
    assert.equal(custom.headline, 'Custom headline'); assert.equal(custom.benefits[0].text, 'Custom benefit');
    assert.ok(T.hashtagsFor([tr.id], locale));
  }
});
