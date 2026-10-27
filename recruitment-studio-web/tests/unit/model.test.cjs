// Project fields for «Fala comigo» and several trades; old ads keep working.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js');

const M = RS.model;
const TPL = { id: 'diagonal', trade: 'obras', sample: 'construction', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };

function oldAd() {
  const p = M.newProject(TPL, { trade: 'pintor' });
  delete p.trades; delete p.whatsapp; delete p.waTemplates; delete p.qrMode;
  delete p.show.waCta;
  p.texts['pt-PT'].qr = 'https://x.pt';
  delete p.texts['pt-PT'].waMessage;
  p.trade = 'pintor';
  return JSON.parse(JSON.stringify(p));
}

test('normalize: an old ad gets the new fields and keeps its QR link', () => {
  const p = M.normalize(oldAd());
  assert.deepEqual(p.trades, ['pintor']);
  assert.equal(p.trade, 'pintor');
  assert.equal(p.qrMode, 'link');
  assert.equal(p.whatsapp, null);
  assert.deepEqual(p.waTemplates, {});
  assert.equal(p.show.waCta, true);
  for (const code of p.locales) assert.equal(p.texts[code].waMessage, '');
});

test('normalize: an ad without a QR link uses the WhatsApp QR mode', () => {
  const raw = oldAd();
  raw.texts['pt-PT'].qr = '';
  assert.equal(M.normalize(raw).qrMode, 'whatsapp');
});

test('newProject: several trades, the first is the main one', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro', 'servente'] });
  assert.deepEqual(p.trades, ['pedreiro', 'servente']);
  assert.equal(p.trade, 'pedreiro');
  const texts = p.texts['pt-PT'].positions.map((x) => x.text);
  assert.ok(texts.includes('Pedreiro com experiência') && texts.includes('Ajudante de pedreiro'));
  assert.equal(p.texts['pt-PT'].waMessage, '');
});

test('caption: carries the WhatsApp link and the number when there is a number', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  p.whatsapp = { country: '351', number: '912345678' };
  const c = M.caption(p, 'pt-PT');
  assert.ok(c.includes('https://wa.me/351912345678?text='));
  assert.ok(c.includes('+351 912 345 678'));
});

test('caption: no WhatsApp link without a number', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  assert.ok(!M.caption(p, 'pt-PT').includes('wa.me'));
});

test('setTrades: a generated message follows the new trades', () => {
  const p = M.setTrades(M.newProject(TPL, { trades: ['pedreiro'] }), ['ferro']);
  assert.deepEqual(p.trades, ['ferro']);
  assert.equal(p.trade, 'ferro');
  assert.match(RS.contact.adMessage(p, 'pt-PT'), /armador de ferro/);
});

test('setTrades: a message the person wrote stays', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  p.texts['pt-PT'].waMessage = 'Mensagem minha.';
  const q = M.setTrades(p, ['ferro']);
  assert.equal(RS.contact.adMessage(q, 'pt-PT'), 'Mensagem minha.');
});

test('caption: a contact with the WhatsApp number is not listed a second time', () => {
  const p = M.newProject(TPL, { trades: ['pedreiro'] });
  p.whatsapp = { country: '351', number: '912345678' };
  p.texts['pt-PT'].contacts = [M.iconItem('phone', '912 345 678'), M.iconItem('mail', 'emprego@obras.pt')];
  const c = M.caption(p, 'pt-PT');
  assert.equal(c.match(/912 345 678/g).length, 1);
  assert.ok(c.includes('emprego@obras.pt'));
  p.texts['pt-PT'].contacts = [M.iconItem('phone', '+351 912 345 678')];
  assert.ok(!M.caption(p, 'pt-PT').includes('Candidate-se já:'), 'a heading with nothing under it');
});

test('applyTradeTexts: explicit replacement now includes Spanish while preserving contacts and WhatsApp', () => {
  let p = M.newProject(TPL, { trades: ['pedreiro'] });
  p = M.addLocale(p, 'es', 'pt-PT');
  p.texts.es.headline = 'Buscamos albañiles';
  p.texts['pt-PT'].headline = 'O meu título';
  p.texts['pt-PT'].waMessage = 'A minha mensagem';
  p.texts['pt-PT'].qr = 'https://exemplo.pt';
  const q = M.applyTradeTexts(M.setTrades(p, ['servente']));
  assert.equal(q.texts.es.headline, 'Peones y ayudantes de obra');
  assert.notEqual(q.texts['pt-PT'].headline, 'O meu título');
  assert.ok(q.texts['pt-PT'].positions.some((x) => /servente/i.test(x.text)));
  assert.equal(q.texts['pt-PT'].waMessage, 'A minha mensagem');
  assert.equal(q.texts['pt-PT'].qr, 'https://exemplo.pt');
  assert.deepEqual(M.readyTextLocales(q), ['pt-PT', 'es']);
});

test('addLocale: merged positions of every trade are translated', () => {
  const p = M.addLocale(M.newProject(TPL, { trades: ['pedreiro', 'servente'] }), 'de-CH', 'pt-PT');
  assert.ok(p.texts['de-CH'].positions.map((x) => x.text).includes('Maurerhilfe'));
  assert.equal(p.texts['de-CH'].waMessage, '');
});
