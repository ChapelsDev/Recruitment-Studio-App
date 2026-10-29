// Actual Preact handlers and DOM with a simulated drawing engine. These tests
// cover editing/recovery flows; they do not assert browser layout or pixels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) {
  const end = Date.now() + 6000;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await pause(20); }
  throw new Error(`Timed out: ${label}`);
}
async function app(t, width = 1280, configure = () => {}) {
  const { Window } = await import('happy-dom');
  const errors = [];
  const w = new Window({ url: 'https://studio.test/', width, height: 900,
    console: { ...console, error: (...args) => errors.push(args.join(' ')) },
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableJavaScriptFileLoading: true, enableImageFileLoading: false, enableCSSFileLoading: false } });
  t.after(async () => { await w.happyDOM.close(); });
  Object.defineProperty(w, 'indexedDB', { value: new IDBFactory() });
  w.fetch = async () => { throw new Error('Network is disabled in UI tests'); };
  w.localStorage.setItem('rs-appearance', JSON.stringify({ theme: 'light', motion: 'calm', haptics: false }));
  w.sessionStorage.setItem('rs-intro', '1');
  w.document.body.innerHTML = '<div id="app"></div>';
  const load = (f) => w.eval(fs.readFileSync(path.join(__dirname, '../..', f), 'utf8'));
  load('vendor/htm-preact.umd.js');
  for (const f of ['appearance', 'util', 'trades', 'model', 'contact', 'workflow', 'workflow-ui', 'reuse', 'production', 'production-ui', 'carousel-ui', 'motion-timeline', 'icons', 'install', 'haptics', 'ui-motion']) load(`js/${f}.js`);
  const RS = w.RS;
  const report = { shrink: 1, photoUpscale: 0 };
  RS.engine = { SAFE: { top: 200, bottom: 300 }, loadFonts: async () => {}, setFont() {},
    render: () => ({ report, regions: [], photo: null }),
    renderToCanvas: () => ({ report, canvas: { toDataURL: () => 'data:image/png;base64,eA==' } }),
  };
  const context = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => context;
  load('js/templates.js'); load('js/motion.js'); load('js/store.js'); load('js/backup.js');
  RS.library.index = async () => ({ items: [] });
  RS.video = { support: async () => ({ method: null }) };
  const p = RS.model.addLocale(RS.model.newProject(RS.templates.list[0]), 'fr', 'pt-PT');
  p.locale = 'pt-PT'; p.name = 'Versão inicial'; p.nameAuto = false; // typed by hand
  await configure(p, RS);
  await RS.store.putProject(p);
  p.name = 'Anúncio atual';
  await RS.store.putProject(p);
  load('js/app.js');
  const $ = (sel) => w.document.querySelector(sel);
  const button = (sel, text) => [...w.document.querySelectorAll(sel)].find((el) => text.test(el.textContent.trim()));
  const click = async (el) => { assert.ok(el, 'control must exist'); el.click(); await pause(30); };
  const type = async (el, value) => { el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); await pause(30); };
  await until(() => $('.proj-open'), 'home');
  // ⋯ in the editor's top bar (2026-10-27): opens it and gives the item
  const menu = async (re) => { await click($('.editor-more')); await until(() => $('.editor-menu'), 'the ⋯ menu'); return button('.editor-menu [role="menuitem"]', re); };
  // the home's ⋯ (2026-10-27): Abrir ficheiro, Marcas e modelos, Cópias de segurança, Reciclagem, Definições
  const homeMenu = async (re) => { await click($('.home-top .home-more')); await until(() => $('.home-menu'), 'the home ⋯'); return button('.home-menu [role="menuitem"]', re); };
  return { w, RS, p, $, button, click, type, errors, menu, homeMenu };
}

test('UI: save multiple brands and a model, rename it, then create an independent ad from home', async (t) => {
  const a = await app(t), { $, button, click, type, RS, p, w } = a;
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click(await a.menu(/Marcas e modelos/)); await until(() => $('.library-save button:not(:disabled)'), 'library loaded');
  await type($('#reuse-name'), 'Brand One'); await click(button('.library-save button', /^Guardar marca$/));
  await until(() => $('.library-card'), 'first brand');
  await type($('#reuse-name'), 'Brand Two'); await click(button('.library-save button', /^Guardar marca$/));
  await until(async () => (await RS.store.getCatalog()).brands.length === 2, 'second brand');
  $('#reuse-kind').value = 'template'; $('#reuse-kind').dispatchEvent(new w.Event('change', { bubbles: true })); await pause(30);
  await type($('#reuse-name'), 'Base pessoal'); await click(button('.library-save button', /^Guardar modelo$/));
  await until(async () => (await RS.store.getCatalog()).templates.length === 1, 'template persisted');
  const card = [...w.document.querySelectorAll('.library-card')].find((c) => c.textContent.includes('Base pessoal'));
  await click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Mudar nome'));
  await type($('.library-rename input'), 'Base renovada'); await click(button('.library-rename button', /Guardar nome/));
  await until(async () => (await RS.store.getCatalog()).templates[0].name === 'Base renovada', 'renamed model');
  await click($('.reuse-dialog .modal-head button')); await click($('.topbar button[aria-label="Voltar aos anúncios"]')); await until(() => $('.home-top .home-more'), 'home');
  await click(await a.homeMenu(/Marcas e modelos/)); await until(() => button('.library-card button', /^Criar anúncio$/), 'create from personal model');
  await click(button('.library-card button', /^Criar anúncio$/)); await until(() => $('.editor'), 'new editor');
  assert.equal($('.name-input').value, 'Base renovada');
  const rows = await RS.store.listProjects(); assert.equal(rows.length, 2);
  assert.equal((await RS.store.getProject(p.id)).data.name, 'Anúncio atual');
  assert.deepEqual(a.errors, []);
});

test('UI: common offer is saved once and changed salary prompts review of custom publication text', async (t) => {
  const { $, click, type, button, RS, p, menu } = await app(t);
  await click($('.proj-open')); await until(() => $('#f-offer-location'), 'offer form');
  await type($('#f-offer-salary'), '2400'); await type($('#f-offer-location'), 'Lausanne'); await type($('#f-offer-startDate'), '2026-11-10');
  // 2026-10-27: a new ad starts with the sheet on the image; the tap takes it off
  await click($('.offer-visibility input'));
  await until(async () => (await RS.store.getProject(p.id)).data.offer.startDate === '2026-11-10', 'common offer saved');
  assert.equal((await RS.store.getProject(p.id)).data.offer.visibility.image, false);
  await click($('.topbar button[title="Exportar (Ctrl+E)"]')); await until(() => $('.caption-text'), 'caption');
  await type($('.caption-text'), 'Texto que quero manter');
  await click($('.modal.export .modal-head .icon-btn')); await until(() => !$('.modal.export'), 'export closed');
  await type($('#f-offer-salary'), '2700');
  await until(() => $('.editor-more .more-count'), 'reminder counted on ⋯');
  await click(await menu(/Rever publicação · PT/)); await until(() => $('.caption-warning'), 'caption review warning');
  assert.equal($('.caption-text').value, 'Texto que quero manter');
  await click(button('.caption-warning button', /Confirmo/));
  await until(() => !$('.caption-warning'), 'review confirmed');
  assert.equal($('.caption-text').value, 'Texto que quero manter');
  await until(async () => RS.model.captionStatus((await RS.store.getProject(p.id)).data, 'pt-PT') === 'current', 'approval persisted');
});

// «Balão» (2026-10-28): «Recolher pré-visualização» became the sheet's handle (two stops)
test('UI: on a phone the sheet goes up while writing and comes back without changing the ad', async (t) => {
  const { $, click, type, RS, p } = await app(t, 390);
  await click($('.proj-open')); await until(() => $('.sheet-handle'), 'mobile editor');
  const headline = $('#f-headline').value;
  assert.equal($('.sheet-handle').getAttribute('aria-expanded'), 'true');
  await click($('.sheet-handle'));
  assert.ok($('.editor.sheet-strip'), 'the sheet did not go up'); assert.ok($('.workspace'), 'the poster left the screen');
  assert.equal($('.sheet-handle').getAttribute('aria-expanded'), 'false');
  await type($('.name-input'), 'Editado com mais espaço');
  await until(async () => (await RS.store.getProject(p.id)).name === 'Editado com mais espaço', 'save with the sheet up');
  await click($('.sheet-handle'));
  assert.equal($('.editor.sheet-strip'), null);
  assert.equal($('#f-headline').value, headline); assert.equal($('.name-input').value, 'Editado com mais espaço');
  assert.equal($('.preview-toggle'), null);
});

test('UI: desktop panel divider accepts keyboard and pointer input, clamps width and keeps its preference', async (t) => {
  const { $, click, w } = await app(t);
  await click($('.proj-open')); await until(() => $('.panel-divider'), 'desktop divider');
  const key = async (value) => { $('.panel-divider').dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); await pause(30); };
  await key('ArrowRight'); assert.equal($('.panel-divider').getAttribute('aria-valuenow'), '430');
  await key('Home'); await key('ArrowLeft'); assert.equal($('.panel-divider').getAttribute('aria-valuenow'), '300');
  await key('End'); assert.equal($('.panel-divider').getAttribute('aria-valuenow'), '580');
  const divider = $('.panel-divider');
  divider.dispatchEvent(new w.PointerEvent('pointerdown', { button: 0, pointerId: 7, clientX: 580, bubbles: true }));
  divider.dispatchEvent(new w.PointerEvent('pointermove', { pointerId: 7, clientX: 450, bubbles: true }));
  divider.dispatchEvent(new w.PointerEvent('pointerup', { pointerId: 7, bubbles: true })); await pause(30);
  assert.equal($('.panel-divider').getAttribute('aria-valuenow'), '450');
  await click($('.topbar button[aria-label="Voltar aos anúncios"]')); await until(() => $('.proj-open'), 'home');
  await until(() => $('.top-progress + .sr-only').textContent === '', 'home navigation finished');
  await click($('.proj-open')); await until(() => $('.panel-divider'), 'reopened');
  assert.equal($('.panel-divider').getAttribute('aria-valuenow'), '450');
  assert.equal($('.preview-toggle'), null);
});

test('UI: workspace backup cancellation, preview and copy restore remain explicit and refresh home', async (t) => {
  const { $, button, click, RS, w, homeMenu } = await app(t);
  let saved, writes = 0, accept = false;
  RS.util.saveBlob = async (blob, name) => { assert.match(name, /\.rsbackup$/); saved = blob; writes++; return accept; };
  await click(await homeMenu(/Cópias de segurança/));
  await until(() => $('.backup-storage'), 'storage info');
  await click(button('.backup-dialog button', /^Guardar cópia global$/));
  await until(() => writes === 1 && !$('.backup-dialog .modal-head button').disabled, 'cancelled save');
  assert.equal(await RS.store.getMeta('lastBackup'), undefined);
  accept = true; await click(button('.backup-dialog button', /^Guardar cópia global$/));
  await until(async () => await RS.store.getMeta('lastBackup'), 'backup date recorded');
  await until(() => writes === 2 && $('.backup-dialog .library-notice') && !$('.backup-dialog .modal-head button').disabled, 'export finished');
  let picks = 0;
  RS.util.pickFile = async () => { picks++; return saved; };
  await click(button('.backup-dialog button', /^Abrir cópia/));
  await until(() => { if ($('.backup-dialog .workflow-error')) throw new Error($('.backup-dialog .workflow-error').textContent); return $('.backup-preview'); }, 'restore preview').catch((e) => { throw new Error(`${e.message}; picks=${picks}; ${$('.backup-dialog').textContent}`); });
  assert.equal($('#backup-mode').value, 'copy');
  assert.equal((await RS.store.listProjects()).length, 1, 'preview must not import');
  await until(() => !button('.backup-preview button', /^Adicionar/).disabled, 'ready to restore');
  await click(button('.backup-preview button', /^Adicionar/));
  await until(() => $('.backup-dialog .library-notice')?.textContent.includes('Restauro concluído'), 'restore success');
  assert.equal((await RS.store.listProjects()).length, 2);
  await until(() => !$('.backup-dialog .modal-head button').disabled, 'restore finished');
  await click($('.backup-dialog .modal-head button'));
  assert.equal(w.document.querySelectorAll('.proj-open').length, 2);
});

test('UI: phone save failures stay actionable until retry succeeds; session-only storage never claims durable saving', async (t) => {
  const { $, click, type, RS, button, w, homeMenu } = await app(t, 360);
  const css = w.document.createElement('style'); css.textContent = fs.readFileSync(path.join(__dirname, '../../assets/app.css'), 'utf8'); w.document.head.append(css);
  assert.ok(await homeMenu(/Abrir ficheiro/), '«Abrir ficheiro» is not in the home ⋯');
  await click($('.home-top .home-more'));
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  const put = RS.store.putProject;
  RS.store.putProject = async () => { throw new Error('Espaço insuficiente'); };
  await type($('.name-input'), 'Alteração por guardar');
  await until(() => $('.save-recovery[role="alert"]'), 'persistent save error');
  assert.match($('.save-recovery').textContent, /Espaço insuficiente/);
  assert.equal($('.save-state').getAttribute('role'), 'status');
  assert.notEqual(w.getComputedStyle($('.save-state')).display, 'none', 'phone CSS must keep saving feedback visible');
  await type($('.name-input'), 'Outra alteração por guardar');
  assert.ok($('.save-recovery'), 'editing again must not dismiss a failed save');
  await until(() => $('.save-state.error') && button('.save-recovery button', /Tentar guardar novamente/)?.disabled === false, 'second failed save finished');
  RS.store.putProject = put;
  await click(button('.save-recovery button', /Tentar guardar novamente/));
  await until(() => !$('.save-recovery'), 'successful retry clears warning');
  assert.equal($('.save-state').textContent.trim(), 'Guardado');
  RS.store.isPersistent = () => false;
  await type($('.name-input'), 'Memória temporária');
  await until(() => $('.save-state').textContent.includes('Só nesta sessão'), 'session-only status');
  assert.match($('.save-recovery').textContent, /antes de fechar/);
  assert.ok(button('.save-recovery button', /Guardar ficheiro de segurança/));
});

test('UI: export focus stays inside the dialog and nested confirmation restores its trigger', async (t) => {
  const { $, click, type, button, w } = await app(t);
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  const trigger = $('.topbar button[title="Exportar (Ctrl+E)"]');
  trigger.focus(); await click(trigger); await until(() => $('.modal.export'), 'export dialog');
  // the last control: «Pacote completo», below the publication text (2026-10-27)
  const box = $('.modal.export'), first = box.querySelector('button'), last = button('.modal.export button', /Pacote completo/);
  const tab = (el, shiftKey = false) => { el.focus(); el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })); };
  tab(first, true); assert.ok(w.document.activeElement === last, 'Shift+Tab on the first control does not reach the last');
  tab(last); assert.ok(w.document.activeElement === first, 'Tab on the last control does not return to the first');
  $('.name-input').focus(); assert.ok(box.contains(w.document.activeElement), 'background cannot receive focus');
  await type($('.caption-text'), 'Texto próprio');
  const regenerate = button('.caption-head button', /^Regenerar$/);
  regenerate.focus(); await click(regenerate); await until(() => $('[role="alertdialog"]'), 'nested confirmation');
  const nested = $('[role="alertdialog"]');
  box.querySelector('button').focus(); assert.ok(nested.contains(w.document.activeElement));
  await click(button('[role="alertdialog"] button', /^Cancelar$/));
  await until(() => !$('[role="alertdialog"]'), 'confirmation closed');
  assert.equal(w.document.activeElement, regenerate);
  await click($('.modal.export button[aria-label="Fechar"]'));
  await until(() => !$('.modal.export'), 'export closed');
  assert.equal(w.document.activeElement, trigger);
});

test('UI: video scrubbing pauses playback, moment navigation works and the chosen frame/title are saved per language', async (t) => {
  const { $, click, type, button, RS, p, w } = await app(t);
  const frames = [];
  w.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() { this.callback([{ contentRect: { width: 700, height: 650 } }]); } disconnect() {} };
  const getContext = w.HTMLCanvasElement.prototype.getContext;
  w.HTMLCanvasElement.prototype.getContext = function () {
    const ctx = getContext.call(this), canvas = this;
    return new Proxy(ctx, { get: (target, key) => key === 'canvas' ? canvas : target[key] });
  };
  RS.engine.roundRect = () => {};
  RS.motion.prepare = (p, o) => ({ fmt: RS.model.FORMATS[o.format], locale: o.locale, style: { id: 'neon', name: 'Néon' }, timeline: { duration: 8, scenes: [{ kind: 'hook', start: 0, end: 2 }, { kind: 'benefit', start: 2, end: 5 }, { kind: 'end', start: 5, end: 8 }] } });
  RS.motion.render = (ctx, prepared, options) => { if (ctx.canvas.classList.contains('poster')) frames.push(options.t); };
  RS.motion.leftOut = () => ({ benefits: 0, highlights: 0, positions: 0 });
  RS.motion.lengths = () => ({ options: [{ value: 'auto', seconds: 8, ok: true }, { value: 10, ok: true }], adds: 'benefits' });
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click($('.mode-switch [aria-label="Vídeo"]'));
  await until(() => $('.video-scrubber input') && !$('.video-scrubber input').disabled, 'video prepared');
  await until(() => frames.length > 1, 'animation is running');
  await type($('.video-scrubber input'), '3');
  await until(() => frames.at(-1) === 3, 'chosen frame drawn on the stage');
  await pause(180);
  assert.ok($('.video-stage.paused')); assert.equal($('.video-scrubber input').value, '3');
  assert.equal(frames.at(-1), 3, 'an old animation frame must not replace the chosen instant');
  await click($('[aria-label="Momento seguinte"]')); assert.equal($('.video-scrubber input').value, '5');
  await click($('[aria-label="Momento anterior"]')); assert.equal($('.video-scrubber input').value, '2');
  await click(w.document.querySelectorAll('.video-stage .timeline-moment')[0]);
  assert.equal($('.video-scrubber input').value, '0');
  assert.equal($('.video-stage .timeline-moment').getAttribute('aria-current'), 'step');
  assert.ok($('.video-stage.paused'));
  await click(button('.video-stage button', /^Escolher capa$/)); await until(() => $('#cover-title') && !$('#cover-title').matches(':disabled'), 'cover editor');
  await until(() => $('.video-cover-preview canvas'), 'actual frame preview');
  await type($('#cover-time'), '4.2'); await type($('#cover-title'), 'Estamos a recrutar');
  $('#cover-placement').value = 'top'; $('#cover-placement').dispatchEvent(new w.Event('change', { bubbles: true })); await pause(30);
  await click(button('.video-cover-fields button', /^Guardar capa$/)); await until(() => !$('.video-cover-dialog'), 'cover saved');
  await until(async () => (await RS.store.getProject(p.id)).data.video.cover?.['pt-PT']?.time === 4.2, 'cover persisted');
  const stored = (await RS.store.getProject(p.id)).data;
  assert.equal(stored.video.cover['pt-PT'].title, 'Estamos a recrutar'); assert.equal(stored.video.cover['pt-PT'].placement, 'top');
  assert.equal(stored.video.cover.fr, undefined);
});

test('UI: choosing a cover waits for photos instead of freezing the provisional timeline', async (t) => {
  const { $, click, button, RS } = await app(t);
  let finishPhotos;
  RS.motion.recipePhotos = () => new Promise((resolve) => { finishPhotos = resolve; });
  RS.motion.photoSet = async () => ({ hero: null, cards: [] });
  RS.engine.roundRect = () => {};
  RS.motion.prepare = (p, o) => ({ fmt: RS.model.FORMATS[o.format], locale: o.locale, style: { id: 'neon', name: 'Néon' }, timeline: { duration: o.photos?.full?.length ? 8 : 3, scenes: [] } });
  RS.motion.render = () => {};
  RS.motion.leftOut = () => ({ benefits: 0, highlights: 0, positions: 0 });
  RS.motion.lengths = () => ({ options: [{ value: 'auto', seconds: 8, ok: true }], adds: 'benefits' });
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click($('.mode-switch [aria-label="Vídeo"]'));
  await until(() => finishPhotos && $('.video-scrubber input') && !$('.video-scrubber input').disabled, 'provisional video');
  assert.equal(button('.video-stage button', /^Escolher capa$/).disabled, true, 'cover must not use the provisional three-second timeline');
  finishPhotos([{ width: 100, height: 100 }]);
  await until(() => button('.video-stage button', /^Escolher capa$/)?.disabled === false, 'complete video');
  await click(button('.video-stage button', /^Escolher capa$/));
  await until(() => $('#cover-time') && !$('#cover-time').matches(':disabled'), 'cover ready');
  assert.equal(Number($('#cover-time').max), 8 - 1 / 30);
});

test('UI: video has an explicit keyboard-operable pause and resume control', async (t) => {
  const { $, click, RS } = await app(t);
  RS.motion.prepare = () => null;
  RS.motion.lengths = () => ({ options: [{ value: 'auto', seconds: 12, ok: true }, { value: 10, ok: true }], adds: 'benefits' });
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click($('.mode-switch button[aria-label="Vídeo"]'));
  await until(() => $('.ws-pause'), 'pause control');
  await click($('.ws-pause'));
  assert.ok($('.video-stage.paused'));
  assert.equal($('.ws-pause').getAttribute('aria-label'), 'Continuar vídeo');
  await click($('.ws-pause'));
  assert.equal($('.video-stage.paused'), null);
  assert.equal($('.ws-pause').getAttribute('aria-label'), 'Pausar vídeo');
});

test('UI: «Pacote completo» settings persist, unsupported video blocks only its selected package, cancellation recovers controls', async (t) => {
  const a = await app(t, 360), { $, button, click, RS, w } = a;
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click($('.topbar button[title="Exportar (Ctrl+E)"]')); await until(() => $('.production-entry button'), 'export');
  await click($('.production-entry button')); await until(() => $('.production-dialog'), 'production');
  assert.match($('.production-dialog').textContent, /Pacote completo/);
  await until(() => $('.production-dialog [role="alert"]'), 'unsupported video message');
  assert.equal($('.production-actions button').disabled, true);
  const part = (start) => [...w.document.querySelectorAll('.production-options label')].find((l) => l.textContent.startsWith(start)).querySelector('input');
  await click(part('Vídeo')); assert.equal($('.production-actions button').disabled, false);
  await click(part('Projeto portátil')); assert.equal(part('Projeto portátil').checked, false);
  await click($('.production-dialog .modal-head button')); await click($('.topbar button[title="Exportar (Ctrl+E)"]')); await until(() => $('.production-entry button'), 'reopen export');
  await click($('.production-entry button')); await until(() => $('.production-dialog'), 'reopen production');
  assert.equal(part('Projeto portátil').checked, false); assert.equal(part('Vídeo').checked, false);
  let saves = 0; RS.util.saveBlob = async () => { saves++; return true; };
  RS.production.packageFiles = async (p, o, services) => new Promise((resolve, reject) => services.signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })), { once: true }));
  await click($('.production-actions button')); await until(() => button('.production-actions button', /Cancelar exportação/), 'cancel available');
  assert.equal($('.production-options').disabled, true);
  await click(button('.production-actions button', /Cancelar exportação/)); await until(() => !$('.production-actions button').disabled, 'export enabled again');
  assert.equal($('.production-options').disabled, false);
  assert.equal(saves, 0); assert.match($('.library-notice').textContent, /cancelada/); assert.deepEqual(a.errors, []);
});

test('UI: captions stay per language after closing export and reopening the ad; regenerate supports undo', async (t) => {
  const a = await app(t), { $, button, click, type, RS, p, w } = a;
  await click($('.proj-open'));
  await until(() => $('.editor'), 'editor');
  const exportAd = async () => {
    await click($('.topbar button[title="Exportar (Ctrl+E)"]'));
    await until(() => $('.caption-text'), 'export');
  };
  await exportAd();
  await type($('.caption-text'), 'Publicação personalizada PT');
  await click(button('.caption-head .seg button', /^FR$/));
  assert.equal(button('.caption-locales button', /^FR$/).getAttribute('aria-pressed'), 'true');
  assert.equal(button('.caption-locales button', /^PT$/).getAttribute('aria-pressed'), 'false');
  await type($('.caption-text'), 'Publication FR');
  await click(button('.caption-head .seg button', /^PT$/));
  assert.equal($('.caption-text').value, 'Publicação personalizada PT');
  await click($('.modal.export button[aria-label="Fechar"]'));
  await until(() => !$('.modal.export'), 'closed export');
  await click($('.topbar button[aria-label="Voltar aos anúncios"]'));
  await until(() => $('.proj-open') && !w.document.documentElement.classList.contains('is-busy'), 'home after edit');
  await click($('.proj-open'));
  await until(() => $('.editor'), 'reopened editor');
  await exportAd();
  assert.equal($('.caption-text').value, 'Publicação personalizada PT');
  await click(button('.caption-head button', /^Regenerar$/));
  await until(() => $('[role="alertdialog"]'), 'regenerate confirmation');
  await click(button('[role="alertdialog"] button', /^Regenerar$/));
  await until(() => !($('[role="alertdialog"]')), 'confirmation closed');
  assert.notEqual($('.caption-text').value, 'Publicação personalizada PT');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  await until(() => $('.caption-text').value === 'Publicação personalizada PT', 'undo caption regeneration');
  await until(async () => (await RS.store.getProject(p.id)).data.captions.fr === 'Publication FR', 'stored French caption');
  assert.deepEqual(a.errors, []);
});

test('UI: recovery restores versions and trashed ads through their visible controls on a phone', async (t) => {
  const a = await app(t, 390), { $, button, click, RS, p } = a;
  await click($('.proj-more'));
  await click(button('.proj-card .menu button', /Histórico de versões/));
  await until(() => $('.recovery-list li'), 'version history');
  assert.match($('.recovery-list').textContent, /Versão inicial/);
  await click($('.recovery-list li button'));
  await until(async () => (await RS.store.getProject(p.id)).data.name === 'Versão inicial', 'restored version');
  await until(() => !$('.recovery button[aria-label="Fechar recuperação"]').disabled, 'version restoration finished');
  await click($('.recovery button[aria-label="Fechar recuperação"]'));
  await click($('.proj-more'));
  await click(button('.proj-card .menu button', /Mover para a reciclagem/));
  await until(() => !$('.proj-open'), 'removed from active ads');
  await click(await a.homeMenu(/Reciclagem/));
  await until(() => $('.recovery-list li'), 'trash');
  await until(() => !$('.recovery-list li button').disabled, 'trash restore available');
  assert.match($('.recovery-body').textContent, /30 dias/);
  await click($('.recovery-list li button'));
  await until(() => $('.recovery-empty'), 'empty trash');
  assert.match($('.recovery-notice').textContent, /Anúncio restaurado/);
  await click($('.recovery button[aria-label="Fechar recuperação"]'));
  await until(() => $('.proj-open'), 'restored card');
  assert.equal((await RS.store.getProject(p.id)).deletedAt, null);
  assert.deepEqual(a.errors, []);
});

test('UI: restoring from the editor cannot be overwritten by an earlier autosave', async (t) => {
  const a = await app(t), { $, button, click, type, RS, p } = a;
  await click($('.proj-open'));
  await until(() => $('.editor'), 'editor');
  await type($('.name-input'), 'Alteração ainda por guardar');
  await click(await a.menu(/Histórico de versões/));
  await until(() => $('.recovery-list li'), 'history after save');
  const initial = [...a.w.document.querySelectorAll('.recovery-list li')].find((li) => /Versão inicial/.test(li.textContent));
  await click(initial.querySelector('button'));
  await until(() => $('.name-input').value === 'Versão inicial', 'editor restored');
  await click($('.recovery button[aria-label="Fechar recuperação"]'));
  await pause(1000);
  assert.equal((await RS.store.getProject(p.id)).data.name, 'Versão inicial');
  assert.ok((await RS.store.listVersions(p.id)).some((v) => v.data.name === 'Alteração ainda por guardar'));
  assert.deepEqual(a.errors, []);
});

test('UI: phone export opens history and saves a manual version of the edited caption', async (t) => {
  const a = await app(t, 390), { $, button, click, type, RS, p } = a;
  await click($('.proj-open'));
  await until(() => $('.editor'), 'editor');
  await click($('.topbar .btn.primary'));
  await until(() => $('.caption-text'), 'phone export');
  await type($('.caption-text'), 'Texto a preservar');
  await click(button('.caption-footer button', /Histórico/));
  await until(() => $('.recovery-save'), 'phone history');
  await click($('.recovery-save'));
  await until(async () => (await RS.store.listVersions(p.id)).some((v) => v.data.captions['pt-PT'] === 'Texto a preservar'), 'manual caption version');
  await until(() => $('.recovery-notice') && /Versão guardada/.test($('.recovery-notice').textContent), 'inline confirmation');
  assert.ok(!$('.modal.export'));
  assert.deepEqual(a.errors, []);
});

test('UI: a save failure keeps the edited ad open instead of silently losing changes', async (t) => {
  const a = await app(t), { $, click, type, RS } = a;
  await click($('.proj-open'));
  await until(() => $('.editor'), 'editor');
  await type($('.name-input'), 'Alteração por guardar');
  const original = RS.store.putProject;
  RS.store.putProject = async () => { throw new Error('QuotaExceededError'); };
  await click($('.topbar button[aria-label="Voltar aos anúncios"]'));
  await until(() => $('.save-state.error'), 'save error');
  assert.ok($('.editor'));
  assert.equal($('.name-input').value, 'Alteração por guardar');
  assert.match($('.toasts').textContent, /continua aberto/);
  RS.store.putProject = original;
  await click($('.topbar button[aria-label="Voltar aos anúncios"]'));
  await until(() => $('.proj-open'), 'retry save and exit');
});

test('UI: portable export shows progress, prevents repeat clicks and allows retry after failure', async (t) => {
  const { $, button, click, RS } = await app(t, 390);
  await click($('.proj-open'));
  await until(() => $('.editor'), 'editor');
  await click($('.topbar .btn.primary'));
  let calls = 0, fail;
  RS.assets.exportProjectFile = () => { calls++; return new Promise((_, reject) => { fail = reject; }); };
  await click(button('.export-actions button', /^Guardar projeto$/));
  await until(() => fail, 'export started');
  const busy = button('.export-actions button', /A preparar projeto/);
  assert.ok(busy.disabled);
  assert.equal(busy.getAttribute('aria-busy'), 'true');
  await click(busy);
  assert.equal(calls, 1);
  fail(new Error('Falta uma imagem de teste'));
  await until(() => button('.export-actions button', /^Guardar projeto$/), 'retry available');
  assert.match($('.toasts').textContent, /Falta uma imagem/);
  let exported;
  RS.assets.exportProjectFile = async (p) => { exported = p; return new Blob(['test']); };
  RS.util.saveBlob = async () => false; // cancel the native save dialog
  await click(button('.export-actions button', /^Guardar projeto$/));
  await until(() => exported && !button('.export-actions button', /^Guardar projeto$/).disabled, 'retry completed');
  assert.equal(exported.name, 'Anúncio atual');
});

test('UI: organise, combine filters, favourite and duplicate as a draft', async (t) => {
  const { $, w, RS, p, button, click, type, errors } = await app(t, 1280, async (_, RS) => {
    for (let i = 0; i < 7; i++) { const q = RS.model.newProject(RS.templates.list[i % RS.templates.list.length]); q.name = `Outro anúncio ${i + 1}`; await RS.store.putProject(q); }
  });
  const select = async (selector, value) => { const el = $(selector); el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); await pause(30); };
  await click($('.proj-more')); await click(button('.menu button', /Organizar anúncio/));
  await type($('#org-campaign'), 'Campanha Norte'); await type($('#org-client'), 'Construção');
  await type($('#org-location'), 'Suíça'); await type($('#org-tags'), 'urgente, obra');
  await select('#org-status', 'published'); await click(button('.organization button', /^Guardar organização$/));
  await until(() => !$('.organization') && $('.proj-status') && /Publicado/.test($('.proj-status').textContent), 'saved organization');
  await click($('.proj-more')); await click(button('.menu button', /^Marcar como favorito$/)); await until(() => $('.proj-fav-mark'), 'favourite');
  await type($('#project-search'), 'construcao suica'); await select('#filter-status', 'published');
  await click($('.favorite-filter')); assert.equal(w.document.querySelectorAll('.proj-open').length, 1);
  await select('#filter-status', 'ready'); assert.equal(w.document.querySelectorAll('.proj-open').length, 0);
  await click($('.clear-filters')); await click($('.proj-more')); await click(button('.menu button', /^Duplicar$/));
  await until(() => w.document.querySelectorAll('.proj-open').length === 9, 'duplicate');
  const copy = (await RS.store.listProjects()).find((r) => / \(cópia\)$/.test(r.data.name));
  assert.equal(copy.data.organization.status, 'draft'); assert.equal(copy.data.organization.favorite, false);
  assert.equal(copy.data.organization.campaign, 'Campanha Norte'); assert.deepEqual(errors, []);
});

test('UI: reviewed translations become stale after source edits and review supports undo', async (t) => {
  const { $, w, button, click, type, RS, p, errors, menu } = await app(t, 390);
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  const openReview = async () => { await click(await menu(/Rever traduções/)); await until(() => $('#review-headline'), 'review'); };
  await openReview(); await type($('#review-headline'), 'Postes ouverts en Suisse');
  await click($('[data-review-field="headline"] footer button'));
  await until(() => $('[data-review-field="headline"]').classList.contains('reviewed'), 'reviewed headline');
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  await until(() => !$('[data-review-field="headline"]').classList.contains('reviewed'), 'undo review');
  await click($('[data-review-field="headline"] footer button'));
  await click($('.translations button[aria-label="Fechar rever traduções"]'));
  await type($('#f-headline'), 'Vagas em França'); await openReview();
  assert.match($('[data-review-field="headline"] .review-status').textContent, /Original alterado/);
  assert.equal($('#review-headline').value, 'Postes ouverts en Suisse');
  await until(async () => (await RS.store.getProject(p.id)).data.translationReview.fr.fields.headline.reviewed, 'review saved');
  assert.deepEqual(errors, []);
});

test('UI: export warnings target a contact and the selected translation; edits refresh the warnings', async (t) => {
  const { $, w, button, click, type, errors } = await app(t);
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  const exportAd = async () => { await click($('.topbar button[title="Exportar (Ctrl+E)"]')); await until(() => $('.preflight'), 'preflight'); };
  await exportAd();
  const example = [...w.document.querySelectorAll('.checks li')].find((x) => /contactos de exemplo/.test(x.textContent));
  await click(example.querySelector('button'));
  await until(() => $('.panel[aria-label="Contactos"]'), 'contacts panel');
  assert.match(w.document.activeElement.id, /^f-contact-/);
  const inputs = [...w.document.querySelectorAll('input[id^="f-contact-"]')].filter((el) => el.id !== 'f-contact-wa');
  await type(inputs[0], '+351 912 345 678'); await type(inputs[1], 'jobs@obras.test');
  await exportAd(); assert.doesNotMatch($('.preflight').textContent, /contactos de exemplo|não há um contacto/);
  const fr = [...w.document.querySelectorAll('.export-options fieldset')].find((el) => el.querySelector('legend').textContent === 'Línguas').querySelectorAll('input')[1];
  await click(fr); await until(() => button('.checks button', /Rever tradução/), 'French warning');
  await click(button('.checks button', /Rever tradução/)); await until(() => $('.translations'), 'review from export');
  assert.equal($('#review-locale').value, 'fr'); assert.ok(!$('.modal.export')); assert.deepEqual(errors, []);
});

test('UI: concurrent changes suspend saves and saving a copy preserves both windows work', async (t) => {
  const { $, RS, p, button, click, type, errors } = await app(t);
  await click($('.proj-open')); await until(async () => (await RS.store.getProject(p.id)).editor, 'editor ownership');
  const rec = await RS.store.getProject(p.id), remote = RS.util.clone(rec.data); remote.texts['pt-PT'].headline = 'Versão da outra janela';
  await RS.store.putProject(remote, null, { editorId: 'other-window', expectedRevision: rec.revision, takeover: true, checkpoint: true });
  await until(() => $('.editor-conflict'), 'conflict notice');
  await type($('#f-headline'), 'Alterações que quero conservar'); await pause(800);
  assert.equal((await RS.store.getProject(p.id)).data.texts['pt-PT'].headline, 'Versão da outra janela');
  await click(button('.editor-conflict button', /^Guardar como cópia$/));
  await until(() => !$('.editor-conflict') && /cópia/.test($('.name-input').value), 'copy active');
  const all = await RS.store.listProjects(), copy = all.find((r) => r.id !== p.id);
  assert.equal(all.length, 2); assert.equal(copy.data.texts['pt-PT'].headline, 'Alterações que quero conservar');
  assert.equal((await RS.store.getProject(p.id)).data.texts['pt-PT'].headline, 'Versão da outra janela');
  assert.equal(copy.editor.id === 'other-window', false); assert.deepEqual(errors, []);
});

test('UI: reloading shows the saved version, then explicit takeover preserves it in history', async (t) => {
  const { $, RS, p, button, click, type, errors } = await app(t);
  await click($('.proj-open')); await until(async () => (await RS.store.getProject(p.id)).editor, 'editor ownership');
  const rec = await RS.store.getProject(p.id), remote = RS.util.clone(rec.data); remote.texts['pt-PT'].headline = 'Título guardado remotamente';
  await RS.store.putProject(remote, null, { editorId: 'second-window', expectedRevision: rec.revision, takeover: true, checkpoint: true });
  await until(() => $('.editor-conflict'), 'conflict'); await type($('#f-headline'), 'Rascunho local');
  await click(button('.editor-conflict button', /^Recarregar guardada$/)); await until(() => $('[role="alertdialog"]'), 'reload confirmation');
  await click(button('[role="alertdialog"] button', /^Recarregar$/));
  await until(() => $('#f-headline')?.value === 'Título guardado remotamente' && $('.editor-conflict button')?.disabled === false, 'saved data loaded');
  assert.ok($('.editor-conflict'), 'the other window still owns the ad');
  await type($('#f-headline'), 'Título escolhido nesta janela');
  await click(button('.editor-conflict button', /^Continuar nesta janela$/)); await until(() => $('[role="alertdialog"]'), 'takeover confirmation');
  await click(button('[role="alertdialog"] button', /^Continuar nesta janela$/)); await until(() => !$('.editor-conflict'), 'takeover done');
  const saved = await RS.store.getProject(p.id);
  assert.equal(saved.data.texts['pt-PT'].headline, 'Título escolhido nesta janela');
  assert.ok(saved.history.some((v) => v.data.texts['pt-PT'].headline === 'Título guardado remotamente')); assert.deepEqual(errors, []);
});

test('UI: leaving a conflicted editor requires confirmation and never replaces the saved version', async (t) => {
  const { $, RS, p, button, click, type, errors } = await app(t);
  await click($('.proj-open')); await until(async () => (await RS.store.getProject(p.id)).editor, 'editor ownership');
  const rec = await RS.store.getProject(p.id), remote = RS.util.clone(rec.data); remote.texts['pt-PT'].headline = 'Edição preservada';
  await RS.store.putProject(remote, null, { editorId: 'second-window', expectedRevision: rec.revision, takeover: true });
  await until(() => $('.editor-conflict'), 'conflict'); await type($('#f-headline'), 'Rascunho apenas local');
  await click($('.topbar button[aria-label="Voltar aos anúncios"]')); await until(() => $('[role="alertdialog"]'), 'leave confirmation');
  await click(button('[role="alertdialog"] button', /^Cancelar$/));
  assert.equal($('#f-headline').value, 'Rascunho apenas local');
  await click($('.topbar button[aria-label="Voltar aos anúncios"]')); await until(() => $('[role="alertdialog"]'), 'leave confirmation again');
  await click(button('[role="alertdialog"] button', /^Sair sem guardar$/)); await until(() => $('.home-top .home-more'), 'home');
  const saved = await RS.store.getProject(p.id);
  assert.equal(saved.data.texts['pt-PT'].headline, 'Edição preservada'); assert.equal(saved.editor.id, 'second-window'); assert.deepEqual(errors, []);
});

test('UI: offline settings show partial readiness, retry failures and display completion from worker state', async (t) => {
  const { $, RS, button, click, errors, homeMenu } = await app(t);
  let receive, prepares = 0;
  const partial = { mode: 'web', controlled: true, appReady: true, coreReady: 10, coreTotal: 10, photosReady: 1, photosTotal: 3, errors: [{ url: './photos/full/photo.js', reason: 'Falha de ligação' }], running: false };
  RS.offline.subscribe = (fn) => { receive = fn; fn(partial); return () => {}; };
  RS.offline.prepare = async () => { prepares++; receive({ ...partial, running: true }); await pause(60); receive({ ...partial, photosReady: 3, errors: [], running: false }); };
  await click(await homeMenu(/Definições/)); await until(() => $('.offline-panel')?.textContent.includes('1 de 3'), 'offline state');
  assert.match($('.offline-panel').textContent, /Aplicação disponível offline/); assert.match($('.offline-panel').textContent, /1 de 3/);
  assert.match($('.offline-errors').textContent, /Falha de ligação/);
  await click(button('.offline-panel button', /Repetir recursos em falta/)); await until(() => /3 de 3/.test($('.offline-panel').textContent), 'all photos available');
  assert.equal(prepares, 1); assert.equal($('.offline-errors'), null); assert.equal($('.offline-panel progress').value, 13);
  receive({ mode: 'file' }); await pause(30); assert.match($('.offline-panel').textContent, /pasta completa/); assert.deepEqual(errors, []);
});

test('UI: removed planning and phrase tools stay absent while existing saved data survives editing', async (t) => {
  const { $, RS, p, button, click, type, errors, menu } = await app(t, 390, async (p, RS) => {
    p.publication = RS.model.cleanPublication({ plannedDate: '2026-11-10', channels: ['facebook'] }, p.locales);
    await RS.store.updateCatalog((c) => RS.reuse.mutate(c, { type: 'save', kind: 'phrase', value: RS.reuse.capturePhrase(p, 'headline', 'Conservar texto') }));
  });
  const before = (await RS.store.getProject(p.id)).data.publication;
  await click($('.proj-more'));
  assert.equal(button('.menu button', /Planear publicação/), undefined);
  assert.equal($('.publication-tasks'), null);
  await click($('.proj-more')); await click($('.proj-open')); await until(() => $('#f-headline'), 'editor');
  assert.ok(await menu(/Organizar/)); assert.ok(button('.editor-menu [role="menuitem"]', /Marcas e modelos/));
  assert.equal(button('.editor-menu button', /Textos guardados|Planear publicação/), undefined);
  await click($('.editor-more'));
  await type($('#f-headline'), 'Nova oferta');
  await until(async () => (await RS.store.getProject(p.id)).data.texts['pt-PT'].headline === 'Nova oferta', 'saved');
  assert.equal(JSON.stringify((await RS.store.getProject(p.id)).data.publication), JSON.stringify(before));
  assert.equal((await RS.store.getCatalog()).phrases[0].name, 'Conservar texto'); assert.deepEqual(errors, []);
});

test('UI: photo search, metadata, favorites, usage and per-file import feedback', async (t) => {
  const { $, w, RS, button, click, type, errors } = await app(t, 390, async (p, RS) => {
    p.photo = { asset: 'own-photo', zoom: 1, fx: .5, fy: .5 };
    RS.assets.load = async () => ({ width: 900, height: 600 });
    await RS.store.setMeta('library', [{ asset: 'own-photo', name: 'Obra', description: '', tags: [], thumb: 'data:image/png;base64,eA==', cat: 'pedreiro' }]);
  });
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click(button('.rail button', /^Fotos$/)); await until(() => $('.lib-cell'), 'photo library');
  await type($('.lib-search input'), 'não existe'); assert.equal($('.lib-cell'), null);
  await type($('.lib-search input'), 'obra'); await click(button('.lib-meta-actions button', /Detalhes/));
  await until(() => $('#asset-name'), 'metadata form'); await until(() => $('.photo-usage li'), 'usage');
  assert.match($('.photo-usage').textContent, /Anúncio atual/);
  await type($('#asset-name'), 'Eletricista com capacete'); await type($('#asset-description'), 'Capacete branco na obra do Norte'); await type($('#asset-tags'), 'Norte, capacete');
  await click($('.photo-details input[type="checkbox"]')); await click(button('.photo-details button', /Guardar detalhes/));
  await until(() => !$('.photo-details'), 'saved metadata'); await type($('.lib-search input'), 'branco norte');
  assert.match($('.lib-item').getAttribute('aria-label'), /Eletricista com capacete.*Capacete branco/);
  await click($('.library-filters input')); assert.ok($('.lib-cell'));
  await click($('.lib-meta-actions [aria-pressed]')); await until(() => !$('.lib-cell'), 'unfavorite filters immediately');
  assert.equal((await RS.library.userItems())[0].favorite, false);
  await click(button('.library > button', /Adicionar fotografias/)); await until(() => $('input[name="files"]'), 'attached chooser');
  $('input[name="files"]').dispatchEvent(new w.Event('cancel')); await until(() => !$('input[name="files"]'), 'cancel cleanup');
  RS.library.addUserPhotos = async () => ({ added: 0, duplicates: 1, failed: 1, duplicateCheck: true, items: [{ name: 'Copia.jpg', reason: 'Já existe: Eletricista com capacete' }, { name: 'Erro.pdf', reason: 'Formato não suportado' }] });
  await click(button('.library > button', /Adicionar fotografias/)); await until(() => $('input[name="files"]'), 'chooser reopened');
  const chooser = $('input[name="files"]'); Object.defineProperty(chooser, 'files', { value: [new w.File(['x'], 'Copia.jpg', { type: 'image/jpeg' })] }); chooser.dispatchEvent(new w.Event('change'));
  await until(() => $('.library-import-result'), 'import report');
  assert.match($('.library-import-result').textContent, /1 duplicadas.*1 rejeitadas/); assert.match($('.library-import-result').textContent, /Erro.pdf.*Formato não suportado/);
  assert.deepEqual(errors, []);
});

test('UI: existing approved translations remain available in translation review', async (t) => {
  const { $, RS, button, click, errors, menu } = await app(t, 1280, async (p, RS) => {
    const phrase = RS.reuse.capturePhrase(p, 'headline', 'Oferta revista');
    phrase.values.fr = 'Postes ouverts en Suisse'; phrase.approved = { ...phrase.values };
    await RS.store.updateCatalog((c) => RS.reuse.mutate(c, { type: 'save', kind: 'phrase', value: phrase }));
  });
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  await click(await menu(/Rever traduções/));
  await until(() => $('.phrase-suggestion button'), 'exact source suggestion');
  await click($('.phrase-suggestion button'));
  assert.equal($('#review-headline').value, 'Postes ouverts en Suisse');
  assert.equal($('[data-review-field="headline"]').classList.contains('reviewed'), false);
  await click($('[data-review-field="headline"] footer button'));
  await click(button('[data-review-field="headline"] footer button', /Guardar tradução aprovada/));
  await until(() => $('.translations .library-notice'), 'stored pair');
  assert.equal((await RS.store.getCatalog()).phrases.length, 1);
  assert.deepEqual(errors, []);
});

test('UI: compare formats edits one crop, can copy to all, and selects the format for continued editing', async (t) => {
  const { $, w, RS, p, button, click, type, errors } = await app(t, 390, (p, RS) => {
    p.photo = { asset: 'test-photo', zoom: 1, fx: .5, fy: .5 };
    RS.assets.load = async () => ({ width: 1000, height: 1000 });
  });
  await click($('.proj-open')); await until(() => $('.editor'), 'editor');
  // «Balão» (2026-10-28): «Comparar formatos» is in the ⋯
  await click($('.editor-more')); await click(button('.editor-menu button', /^Comparar formatos$/)); await until(() => $('#frame-story-zoom'), 'comparison');
  assert.equal(w.document.querySelectorAll('.format-card').length, 3);
  await type($('#frame-story-zoom'), '2'); await type($('#frame-story-fx'), '.8');
  assert.equal($('#frame-portrait-zoom').value, '1'); assert.equal($('#frame-square-fx').value, '0.5');
  const story = w.document.querySelectorAll('.format-card')[2];
  await click([...story.querySelectorAll('button')].find((b) => /Aplicar aos três/.test(b.textContent)));
  assert.equal($('#frame-portrait-zoom').value, '2'); assert.equal($('#frame-square-fx').value, '0.8');
  await click([...story.querySelectorAll('button')].find((b) => /Usar enquadramento original/.test(b.textContent)));
  assert.equal($('#frame-story-zoom').value, '1'); assert.equal($('#frame-portrait-zoom').value, '2');
  await click([...story.querySelectorAll('button')].find((b) => /^Editar/.test(b.textContent)));
  await until(() => !$('.format-comparison') && $('#photo-zoom'), 'image controls');
  assert.equal($('#photo-zoom').value, '1');
  await until(async () => (await RS.store.getProject(p.id)).data.format === 'story', 'saved selection');
  const saved = (await RS.store.getProject(p.id)).data;
  assert.equal(saved.photo.frames.portrait.zoom, 2); assert.equal(saved.photo.frames.story, undefined);
  assert.deepEqual(errors, []);
});

test('UI: file chooser is attached to the document and cancellation cleans it up', async (t) => {
  const { $, RS, w } = await app(t);
  const result = RS.util.pickFile('.anuncio');
  const input = $('input[type="file"]');
  assert.ok(input && input.isConnected);
  input.dispatchEvent(new w.Event('cancel'));
  assert.equal(await result, null);
  assert.equal($('input[type="file"]'), null);
});
