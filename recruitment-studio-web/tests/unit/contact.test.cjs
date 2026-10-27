// «Fala comigo»: numbers, pre-written messages and wa.me links.
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../load.cjs')('util.js', 'trades.js', 'model.js', 'contact.js');

const C = RS.contact;
const ad = (over = {}) => ({
  id: 'ad7k2qxyz', format: 'story', locale: 'pt-PT', locales: ['pt-PT'],
  trades: ['pedreiro', 'servente'], waTemplates: {},
  whatsapp: { country: '351', number: '912 345 678' },
  texts: { 'pt-PT': { waMessage: '' } },
  ...over,
});

test('digits: national numbers get the country code', () => {
  assert.equal(C.digits('351', '912 345 678'), '351912345678');
  assert.equal(C.digits('41', '079 123 45 67'), '41791234567');
  assert.equal(C.digits('39', '06 1234 5678'), '390612345678');
});

test('digits: +… and 00… are taken as international', () => {
  assert.equal(C.digits('351', '+351 912345678'), '351912345678');
  assert.equal(C.digits('351', '00351912345678'), '351912345678');
});

test('digits: a number typed with its country code but no + is not doubled', () => {
  assert.equal(C.digits('351', '351 912 345 678'), '351912345678');
  assert.equal(C.digits('351', '(+351) 912 345 678'), '351912345678');
  assert.equal(C.digits('41', '41 79 123 45 67'), '41791234567');
  assert.equal(C.digits('33', '33 6 12 34 56 78'), '33612345678');
  assert.equal(C.digits('34', '34 612 345 678'), '34612345678');
  assert.equal(C.digits('44', '44 7700 900123'), '447700900123');
  assert.equal(C.digits('49', '49 170 1234567'), '491701234567');
});

test('digits: national numbers that begin like the country code stay national', () => {
  assert.equal(C.digits('39', '393 123 4567'), '393931234567'); // Italian mobile 393…
  assert.equal(C.digits('41', '041 123 45 67'), '41411234567'); // Lucerne, with its 0
});

test('digits: a number that is too short gives null', () => {
  assert.equal(C.digits('351', '12'), null);
  assert.equal(C.display('351', '12'), '');
});

test('display: country code then groups of three', () => {
  assert.equal(C.display('351', '912345678'), '+351 912 345 678');
});

test('display: a number typed with another country\'s code is grouped after that code', () => {
  assert.equal(C.display('351', '+41 79 123 45 67'), '+41 791 234 567');
  assert.equal(C.display('351', '0033 6 12 34 56 78'), '+33 612 345 678');
});

test('defaultMessage: the {profissões} token also works without the tilde or with capitals', () => {
  assert.equal(C.defaultMessage(['pedreiro'], 'pt-PT', 'Vaga de {profissoes}!'), 'Vaga de pedreiro!');
  assert.equal(C.defaultMessage(['pedreiro'], 'pt-PT', 'Vaga de {Profissões}!'), 'Vaga de pedreiro!');
});

test('waLink: the message is encoded, empty message gives no text', () => {
  assert.equal(C.waLink('351912345678', 'Olá & bem-vindo? #1\nok'), 'https://wa.me/351912345678?text=Ol%C3%A1%20%26%20bem-vindo%3F%20%231%0Aok');
  assert.equal(C.waLink('351912345678', ''), 'https://wa.me/351912345678');
});

test('defaultMessage: names up to three trades in the ad language', () => {
  assert.equal(C.defaultMessage(['pedreiro', 'servente'], 'pt-PT'), 'Olá! Vi o anúncio para pedreiro e servente e tenho interesse.');
  assert.match(C.defaultMessage(['pedreiro'], 'de-CH'), /Maurer/);
});

test('defaultMessage: more than three trades gives the general message', () => {
  assert.equal(C.defaultMessage(['pedreiro', 'servente', 'ferro', 'pintor'], 'pt-PT'), 'Olá! Vi o vosso anúncio de emprego e tenho interesse.');
});

test('adMessage: a message the person wrote wins over the generated one', () => {
  const p = ad({ texts: { 'pt-PT': { waMessage: 'Quero trabalhar convosco.' } } });
  assert.equal(C.adMessage(p, 'pt-PT'), 'Quero trabalhar convosco.');
});

test('adMessage: an empty message follows the trades', () => {
  assert.equal(C.adMessage(ad({ trades: ['ferro'] }), 'pt-PT'), 'Olá! Vi o anúncio para armador de ferro e tenho interesse.');
});

test('adMessage: never carries the ad id, the format or a language code', () => {
  const msg = C.adMessage(ad(), 'pt-PT');
  assert.ok(!msg.includes('ad7k2qxyz'));
  assert.ok(!/story/i.test(msg));
  assert.ok(!msg.includes('pt-PT') && !/\bPT\b/.test(msg));
});

test('adLink: link with the message, null without a valid number', () => {
  assert.equal(C.adLink(ad(), 'pt-PT'), C.waLink('351912345678', 'Olá! Vi o anúncio para pedreiro e servente e tenho interesse.'));
  assert.equal(C.adLink(ad({ whatsapp: null }), 'pt-PT'), null);
  assert.equal(C.adLink(ad({ whatsapp: { country: '351', number: '1' } }), 'pt-PT'), null);
});

test('meetLink: the face-to-face message in the chosen language', () => {
  assert.equal(C.meetLink('351', '912345678', 'pt-PT'), C.waLink('351912345678', 'Olá, falámos agora há pouco.'));
});

test('COUNTRIES: Portugal first', () => {
  assert.equal(C.COUNTRIES[0].code, '351');
  assert.deepEqual(C.COUNTRIES.map((c) => c.code), ['351', '41', '49', '33', '352', '34', '39', '44']);
});
