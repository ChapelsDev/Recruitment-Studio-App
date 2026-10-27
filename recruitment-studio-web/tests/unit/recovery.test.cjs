// Cross-device files and recovery exercised against IndexedDB transactions,
// with a separate database and VM for each simulated device. No browser data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const plain = (v) => JSON.parse(JSON.stringify(v));
const data = (label, type = 'image/png') => `data:${type};base64,${Buffer.from(label).toString('base64')}`;
const blob = (label, type = 'image/png') => new Blob([label], { type });
const file = (v) => new Blob([JSON.stringify(v)], { type: 'application/json' });
const TPL = { id: 'diagonal', trade: 'pedreiro', defaults: { primary: '#12325A', accent: '#F2B705', bg: '#FFFFFF', text: '#15171C', fonts: 'modern', upper: true, show: {} } };

function device(factory = new IDBFactory(), clock = { now: Date.now() }) {
  const sandbox = {
    indexedDB: factory, Blob, URL, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => data('thumbnail') }) },
    navigator: {}, console: { ...console, warn() {} },
    Date: class extends Date { static now() { return clock.now; } },
    createImageBitmap: async (b) => ({ width: 600, height: 900, bytes: await b.text() }),
    FileReader: class {
      readAsDataURL(b) { b.arrayBuffer().then((a) => { this.result = `data:${b.type};base64,${Buffer.from(a).toString('base64')}`; this.onload(); }); }
    },
    fetch: async (url) => {
      assert.match(url, /^data:/, 'tests must never fetch a remote resource');
      const [, type, bytes] = /^data:([^;]+);base64,(.*)$/.exec(url);
      return { blob: async () => new Blob([Buffer.from(bytes, 'base64')], { type }) };
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['util', 'trades', 'model', 'contact', 'workflow', 'reuse', 'production', 'motion', 'store', 'backup']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js', `${f}.js`), 'utf8'), ctx, { filename: `${f}.js` });
  }
  const RS = ctx.RS;
  RS.library.index = async () => ({ items: [] });
  const project = () => RS.model.newProject(TPL);
  return { RS, S: RS.store, M: RS.model, A: RS.assets, project, factory, clock, navigator: sandbox.navigator };
}

// 2026-10-27: the carousel (v2) keeps its chosen photo, and the pages of a
// Codex v1 carousel stay in `legacy` with their photos — both travel.
test('carousel photos (chosen, and the Codex pages kept in legacy) travel in project and workspace files and survive retained history cleanup', async () => {
  const d = device(), p = d.project();
  const v1 = { v: 1, locales: { 'pt-PT': { source: '', slides: [{ id: 'page', kind: 'cover', title: 'Capa', text: 'Texto pessoal', layout: 'bottom', photo: { asset: 'slide-photo', zoom: 2, fx: .2, fy: .8, adj: { b: .9, c: 1.2, s: .5 } } }] } } };
  p.carousel = { ...d.RS.model.cleanCarousel({ v: 2, style: 'notificacoes', photos: { mode: 'chosen', ids: ['wall-photo'], focus: { 'wall-photo': { x: .2, y: .7 } } } }, p), legacy: v1 };
  await d.S.putAsset({ id: 'slide-photo', kind: 'photo', blob: blob('page-bytes') });
  await d.S.putAsset({ id: 'wall-photo', kind: 'photo', blob: blob('wall-bytes') }); await d.S.putProject(p);
  const fileTarget = device(), imported = await fileTarget.A.importProjectFile(await d.A.exportProjectFile(p));
  const wall = imported.carousel.photos.ids[0];
  assert.notEqual(wall, 'wall-photo'); assert.deepEqual({ ...imported.carousel.photos.focus[wall] }, { x: .2, y: .7 });
  assert.equal(await (await fileTarget.S.getAsset(wall)).blob.text(), 'wall-bytes');
  const image = imported.carousel.legacy.locales['pt-PT'].slides[0].photo;
  assert.notEqual(image.asset, 'slide-photo'); assert.equal(image.zoom, 2); assert.equal(image.adj.s, .5);
  assert.equal(await (await fileTarget.S.getAsset(image.asset)).blob.text(), 'page-bytes');
  const backupTarget = device(); await backupTarget.RS.backup.restore(await backupTarget.RS.backup.inspect(await d.RS.backup.create()));
  const recovered = (await backupTarget.S.listProjects())[0];
  assert.equal(await (await backupTarget.S.getAsset(recovered.data.carousel.photos.ids[0])).blob.text(), 'wall-bytes');
  assert.equal(await (await backupTarget.S.getAsset(recovered.data.carousel.legacy.locales['pt-PT'].slides[0].photo.asset)).blob.text(), 'page-bytes');
  p.carousel = { ...p.carousel, photos: { mode: 'trades', ids: [], focus: {} } }; await d.S.putProject(p, null, { checkpoint: true }); await d.S.housekeeping();
  assert.ok(await d.S.getAsset('wall-photo'), 'history must retain the carousel photo');
  const portable = JSON.parse(await (await fileTarget.A.exportProjectFile(imported)).text()); portable.assets = {};
  await assert.rejects(d.A.importProjectFile(file(portable)), /incompleto/);
});

test('workspace backup travels with versions, trash, brands, templates, own audio and automatic stock photos', async () => {
  const d = device(), p = d.project(), R = d.RS.reuse;
  for (const id of ['main', 'logo', 'unused-library']) await d.S.putAsset({ id, kind: 'photo', blob: blob(id) });
  await d.S.putAsset({ id: 'sound', kind: 'audio', name: 'Som próprio', blob: blob('sound', 'audio/mpeg') });
  await d.S.setMeta('library', [{ asset: 'unused-library', cat: 'geral', thumb: data('thumb') }]);
  d.RS.library.index = async () => ({ items: [{ id: 'stock', cat: p.trade, thumb: data('stock'), fx: 0.2, fy: 0.3 }] });
  d.RS.library.full = async () => data('full-stock');
  p.photo = { asset: 'main', fx: 0.1, fy: 0.8 }; p.logo = { asset: 'logo' }; p.video.ownSound = 'sound';
  await d.S.putProject(p); p.name = 'Nova versão'; await d.S.putProject(p, null, { checkpoint: true });
  const deleted = d.project(); deleted.photo = { asset: 'trashed-only' };
  await d.S.putAsset({ id: 'trashed-only', kind: 'photo', blob: blob('trashed') });
  await d.S.putAsset({ id: 'orphan', kind: 'photo', blob: blob('orphan') });
  await d.S.putProject(deleted); await d.S.setDeleted(deleted.id, d.clock.now - 1000);
  const brand = R.captureBrand(p, 'Empresa'), template = R.captureTemplate(p, 'Modelo');
  await d.S.changeCatalog({ type: 'save', kind: 'brand', id: brand.id, value: brand });
  await d.S.changeCatalog({ type: 'save', kind: 'template', id: template.id, value: template });
  const before = d.S.workspaceSignature(await d.S.readWorkspace()), archive = await d.RS.backup.create();
  assert.equal(d.S.workspaceSignature(await d.S.readWorkspace()), before, 'preparing a backup must not change local data');
  const target = device(), preview = await target.RS.backup.inspect(archive);
  assert.equal(preview.rows.length, 4); assert.equal(preview.media.length, 6);
  await target.RS.backup.restore(preview);
  const rows = await target.S.listProjects(), restored = rows.find((r) => r.name === p.name);
  assert.notEqual(restored.id, p.id); assert.equal(restored.history.length, 1);
  assert.equal(rows.filter((r) => r.deletedAt).length, 1);
  assert.equal(await (await target.S.getAsset(restored.data.video.ownSound)).blob.text(), 'sound');
  assert.equal(await (await target.S.getAsset(restored.data.photo.asset)).blob.text(), 'main');
  assert.equal(restored.data.photo.fx, 0.1);
  const c = await target.S.getCatalog(); assert.equal(c.brands.length, 1); assert.equal(c.templates.length, 1);
  assert.equal(await (await target.S.getAsset(c.brands[0].logo)).blob.text(), 'logo');
  assert.notEqual(c.templates[0].project.photo.asset, 'main');
  await target.S.housekeeping();
  for (const id of target.S.projectAssetIds(restored.history[0].data)) assert.ok(await target.S.getAsset(id));
  const light = JSON.parse(await (await d.RS.backup.create({ history: false, trash: false })).text());
  assert.equal(light.projects.length, 1); assert.equal(light.projects[0].history.length, 0);
  assert.equal(light.assets.some((v) => ['trashed-only', 'orphan'].includes(v.id)), false);
});

test('concurrent editors claim atomically, reject stale writes and preserve the prior version on explicit takeover', async () => {
  const factory = new IDBFactory(), clock = { now: Date.now() }, first = device(factory, clock), second = device(factory, clock), p = first.project();
  const base = await first.S.putProject(p);
  const claims = await Promise.allSettled([first.S.claimEditor(p.id, 'first', base.revision), second.S.claimEditor(p.id, 'second', base.revision)]);
  assert.equal(claims.filter((v) => v.status === 'fulfilled').length, 1);
  const winner = claims[0].status === 'fulfilled' ? 'first' : 'second', loser = winner === 'first' ? 'second' : 'first';
  const a = plain(p); a.name = 'Guardado pela primeira janela';
  const saved = await first.S.putProject(a, null, { editorId: winner, expectedRevision: base.revision });
  const b = plain(p); b.name = 'Alterações locais da segunda janela';
  await assert.rejects(second.S.putProject(b, null, { editorId: loser, expectedRevision: base.revision }), (e) => e.code === 'EDITOR_CONFLICT' && e.current.revision === saved.revision);
  assert.equal((await first.S.getProject(p.id)).name, a.name);
  const takeover = await second.S.putProject(b, null, { editorId: loser, expectedRevision: saved.revision, takeover: true, checkpoint: true, reason: 'Antes da mudança de janela' });
  assert.ok(takeover.history.some((v) => v.data.name === a.name)); assert.equal(takeover.editor.id, loser);
  await assert.rejects(first.S.putProject(a, null, { editorId: winner, expectedRevision: saved.revision }), /versão mais recente/);
  await first.S.releaseEditor(p.id, winner); assert.equal((await first.S.getProject(p.id)).editor.id, loser, 'old window cannot release new owner');
  clock.now += first.S.EDITOR_LEASE_MS + 1; const reclaimed = await first.S.claimEditor(p.id, 'reopened', takeover.revision);
  assert.equal(reclaimed.revision, takeover.revision); assert.equal(reclaimed.editor.id, 'reopened');
  await assert.rejects(second.S.restoreVersion(p.id, takeover.history[0].id, { editorId: loser, expectedRevision: takeover.revision }), /versão mais recente/);
  await first.S.setDeleted(p.id, clock.now); await assert.rejects(first.S.putProject(a, null, { editorId: 'reopened', expectedRevision: reclaimed.revision }), /reciclagem/);
});

test('editor heartbeat does not invalidate backup previews or leak session locks into backup files', async () => {
  const d = device(), p = d.project(); const rec = await d.S.putProject(p); await d.S.claimEditor(p.id, 'editor', rec.revision);
  const file = await d.RS.backup.create(); assert.equal(JSON.parse(await file.text()).projects[0].editor, undefined);
  const preview = await d.RS.backup.inspect(file); d.clock.now += 1000; await d.S.claimEditor(p.id, 'editor', rec.revision);
  await d.RS.backup.restore(preview, 'replace');
  const restored = await d.S.getProject(p.id); assert.ok(restored.revision > rec.revision);
  await assert.rejects(d.S.putProject(p, null, { editorId: 'editor', expectedRevision: rec.revision }), /versão mais recente/);
});

test('publication plans travel with projects and backups, restore with history and refuse stale planner writes', async () => {
  const d = device(), p = d.project(), W = d.RS.workflow;
  p.photo = { asset: 'published-photo' }; await d.S.putAsset({ id: 'published-photo', kind: 'photo', blob: blob('published') });
  p.publication.channels = ['facebook']; p.publication.plannedDate = '2026-10-26'; p.publication.closeDate = '2026-11-01';
  W.setPublished(p.publication, p, 'pt-PT', 'facebook', true);
  p.publication.entries['pt-PT'].facebook.url = 'https://example.test/post'; await d.S.putProject(p);
  const importedDevice = device(), imported = await importedDevice.A.importProjectFile(await d.A.exportProjectFile(p));
  assert.equal(imported.publication.entries['pt-PT'].facebook.url, 'https://example.test/post');
  assert.equal(importedDevice.RS.workflow.publicationTasks([{ id: imported.id, data: imported }]).review.length, 0);
  const other = device(); await other.RS.backup.restore(await other.RS.backup.inspect(await d.RS.backup.create()));
  assert.equal(other.RS.workflow.publicationTasks(await other.S.listProjects()).review.length, 0);
  const snapshot = plain(p); p.texts['pt-PT'].headline = 'New title'; await d.S.putProject(p);
  await assert.rejects(d.S.updatePublication(p.id, snapshot.publication, 'published', snapshot), /mudou noutra janela/);
  await d.S.updatePublication(p.id, { ...p.publication, closeDate: '2026-12-01' }, 'published', p);
  const history = await d.S.listVersions(p.id); const beforePlanning = history.find((v) => v.reason === 'Antes de planear a publicação');
  await d.S.restoreVersion(p.id, beforePlanning.id); assert.equal((await d.S.getProject(p.id)).data.publication.closeDate, '2026-11-01');
});

test('photo library reports individual imports, detects duplicate content and merges concurrent metadata writes', async () => {
  const d = device(), L = d.RS.library;
  const photo = (name, text = 'same-photo') => Object.assign(blob(text, 'image/jpeg'), { name });
  const results = await L.addUserPhotos([photo('Obra.jpg'), photo('Renomeada.jpg'), Object.assign(blob('pdf', 'application/pdf'), { name: 'Documento.pdf' })], 'pedreiro');
  assert.equal(results.added, 1); assert.equal(results.duplicates, 1); assert.equal(results.failed, 1);
  assert.equal(results.duplicateCheck, true); assert.match(results.items[2].reason, /Formato não suportado/);
  let items = await L.userItems(); assert.equal(items.length, 1); assert.equal(items[0].name, 'Obra'); assert.equal(items[0].originalName, 'Obra.jpg');
  assert.match(items[0].contentDigest, /^[a-f0-9]{64}$/);
  await Promise.all([L.saveMetadata(items[0].asset, { name: 'Eletricista', description: 'Capacete branco', tags: 'Norte, obra, Norte' }), L.saveMetadata(items[0].asset, { favorite: true })]);
  items = await L.userItems(); assert.equal(items[0].name, 'Eletricista'); assert.equal(items[0].favorite, true); assert.deepEqual(plain(items[0].tags), ['Norte', 'obra']);
  assert.equal(L.filter(items, { query: 'eletricista branco norte', favorite: true }).length, 1);
  assert.equal(L.filter(items, { tag: 'Sul' }).length, 0);
  const concurrent = await Promise.all([L.addUserPhotos([photo('Outro.jpg', 'other')]), L.addUserPhotos([photo('Copia.jpg', 'other')])]);
  assert.equal(concurrent.reduce((n, r) => n + r.added, 0), 1); assert.equal(concurrent.reduce((n, r) => n + r.duplicates, 0), 1);
});

test('photo usage includes current edits, historical versions, trash and personal models; portable metadata travels', async () => {
  const d = device(), L = d.RS.library, p = d.project();
  await d.S.putAsset({ id: 'picture', kind: 'photo', blob: blob('bytes') });
  await d.S.setMeta('library', [{ asset: 'picture', cat: 'pedreiro', thumb: data('thumb'), name: 'Capacete', description: 'Obra do Norte', tags: ['Norte'], favorite: true }]);
  p.photo = { asset: 'picture' }; await d.S.putProject(p);
  await d.S.changeCatalog({ type: 'save', kind: 'template', value: d.RS.reuse.captureTemplate(p, 'Modelo com foto') });
  const portable = await d.A.exportProjectFile(p); p.photo = null; await d.S.putProject(p, null, { checkpoint: true });
  let u = await L.usage('picture', p); assert.equal(u.projects[0].current, false); assert.equal(u.projects[0].history, true); assert.equal(u.templates.length, 1);
  p.photo = { asset: 'picture' }; u = await L.usage('picture', p); assert.equal(u.projects[0].current, true, 'unsaved editor changes count');
  await d.S.setDeleted(p.id, true); u = await L.usage('picture'); assert.equal(u.projects[0].trashed, true);
  const target = device(); await target.A.importProjectFile(portable);
  const imported = (await target.RS.library.userItems())[0]; assert.equal(imported.name, 'Capacete'); assert.equal(imported.description, 'Obra do Norte'); assert.equal(imported.favorite, true);
  const backupTarget = device(); await backupTarget.RS.backup.restore(await backupTarget.RS.backup.inspect(await d.RS.backup.create()));
  assert.equal((await backupTarget.RS.library.userItems())[0].tags[0], 'Norte');
  await L.removeUser('picture'); await d.S.housekeeping(); assert.ok(await d.S.getAsset('picture'), 'removing a library item must preserve media in history/templates');
});

test('workspace backup previews and restores reusable texts with context and wording approvals', async () => {
  const source = device(), target = device(), R = source.RS.reuse;
  const entry = R.cleanPhrase({ name: 'Alojamento', field: 'benefits', client: 'Norte', trade: 'pedreiro', values: { 'pt-PT': 'Alojamento', fr: 'Logement' }, approved: { 'pt-PT': 'Alojamento', fr: 'Logement' } });
  await source.S.updateCatalog((c) => R.mutate(c, { type: 'save', kind: 'phrase', value: entry, id: entry.id }));
  const archive = await source.RS.backup.create(), preview = await target.RS.backup.inspect(archive);
  assert.equal(preview.rows.find((r) => r.kind === 'Texto').name, 'Alojamento');
  await target.RS.backup.restore(preview);
  const restored = (await target.S.getCatalog()).phrases[0]; assert.notEqual(restored.id, entry.id); assert.equal(restored.client, 'Norte'); assert.equal(restored.approved.fr, 'Logement');
  await source.RS.backup.restore(await source.RS.backup.inspect(archive), 'replace'); assert.equal((await source.S.getCatalog()).phrases.length, 1);
});

test('workspace restore previews ID collisions, preserves unrelated work and checkpoints replaced ads', async () => {
  const source = device(), p = source.project(); await source.S.putProject(p);
  const archive = await source.RS.backup.create({ history: false, trash: false });
  p.name = 'Trabalho mais recente'; await source.S.putProject(p);
  const extra = source.project(); extra.name = 'Não incluído'; await source.S.putProject(extra);
  const copy = await source.RS.backup.inspect(archive);
  assert.equal(copy.rows[0].exists, true);
  await source.RS.backup.restore(copy, 'copy');
  assert.equal((await source.S.getProject(p.id)).name, p.name);
  assert.equal((await source.S.listProjects()).length, 3);
  const replace = await source.RS.backup.inspect(archive);
  await source.RS.backup.restore(replace, 'replace');
  const restored = await source.S.getProject(p.id);
  assert.notEqual(restored.name, p.name); assert.equal(restored.history.at(-1).data.name, p.name);
  assert.equal((await source.S.getProject(extra.id)).name, 'Não incluído');
  const newest = await source.S.restoreVersion(p.id, restored.history.at(-1).id);
  assert.equal(newest.data.name, p.name);
});

test('workspace rejects malformed media, missing historical assets and stale previews without writing', async () => {
  const d = device(), p = d.project(); await d.S.putProject(p);
  const raw = JSON.parse(await (await d.RS.backup.create()).text());
  raw.projects[0].history.push({ data: { ...p, photo: { asset: 'missing' } } });
  const before = d.S.workspaceSignature(await d.S.readWorkspace());
  await assert.rejects(d.RS.backup.inspect(file(raw)), /incompleta/);
  assert.equal(d.S.workspaceSignature(await d.S.readWorkspace()), before);
  raw.projects[0].history = []; raw.assets.push({ id: 'bad', kind: 'photo', data: 'https://invalid.test/secret' });
  await assert.rejects(d.RS.backup.inspect(file(raw)), /incompleta/);
  raw.assets = []; raw.v = 999; await assert.rejects(d.RS.backup.inspect(file(raw)), /mais recente/);
  const preview = await d.RS.backup.inspect(await d.RS.backup.create());
  p.name = 'Editado noutra janela'; await d.S.putProject(p);
  await assert.rejects(d.RS.backup.restore(preview), /mudaram/);
  assert.equal((await d.S.listProjects()).length, 1); assert.equal((await d.S.getProject(p.id)).name, p.name);
});

test('workspace quota failure rolls back ads, media and catalogue in the same transaction', async () => {
  const source = device(), p = source.project(); p.photo = { asset: 'photo' };
  await source.S.putAsset({ id: 'photo', blob: blob('photo'), kind: 'photo' }); await source.S.putProject(p);
  const target = device(), before = target.S.workspaceSignature(await target.S.readWorkspace());
  const preview = await target.RS.backup.inspect(await source.RS.backup.create()), original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...args) {
    if (this.name === 'assets') throw new DOMException('Disco cheio', 'QuotaExceededError');
    return original.call(this, value, ...args);
  };
  try { await assert.rejects(target.RS.backup.restore(preview), /Disco cheio/); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal(target.S.workspaceSignature(await target.S.readWorkspace()), before);
});

test('workspace reports actual browser persistence separately from IndexedDB availability', async () => {
  const d = device();
  assert.equal((await d.RS.backup.storageInfo()).persisted, null);
  d.navigator.storage = { estimate: async () => ({ usage: 123, quota: 500 }), persisted: async () => false, persist: async () => false };
  const info = await d.RS.backup.requestPersistence();
  assert.equal(info.available, true); assert.equal(info.persisted, false); assert.equal(info.usage, 123);
  const unavailable = device({ open() { throw new Error('Denied'); } });
  assert.equal((await unavailable.RS.backup.storageInfo()).available, false);
  const preview = await unavailable.RS.backup.inspect(await d.RS.backup.create());
  await assert.rejects(unavailable.RS.backup.restore(preview), /armazenamento disponível/);
});

test('catalog migrates legacy brand once, merges concurrent writes and retains reusable assets through cleanup', async () => {
  const d = device(), R = d.RS.reuse;
  await d.S.setMeta('brand', { name: 'Legacy', savedAt: 1, logo: 'legacy-logo' });
  await Promise.all([d.S.getCatalog(), d.S.getCatalog()]);
  assert.equal((await d.S.getCatalog()).brands.length, 1);
  const p = d.project(); p.logo = { asset: 'second-logo' }; p.photo = { asset: 'template-photo' }; p.video.ownSound = 'template-audio';
  const b = R.captureBrand(p, 'Second'), model = R.captureTemplate(p, 'Reusable');
  await Promise.all([d.S.changeCatalog({ type: 'save', kind: 'brand', id: b.id, value: b }), d.S.changeCatalog({ type: 'save', kind: 'template', id: model.id, value: model })]);
  const c = await d.S.getCatalog(); assert.equal(c.brands.length, 2); assert.equal(c.templates.length, 1);
  for (const id of ['legacy-logo', 'second-logo', 'template-photo', 'template-audio', 'orphan']) await d.S.putAsset({ id, blob: blob(id) });
  await d.S.putProject(p); await d.S.setDeleted(p.id, d.clock.now - 40 * 86400000); await d.S.housekeeping();
  assert.equal(await d.S.getProject(p.id), undefined); assert.equal(await d.S.getAsset('orphan'), undefined);
  for (const id of ['legacy-logo', 'second-logo', 'template-photo', 'template-audio']) assert.ok(await d.S.getAsset(id));
  await d.S.changeCatalog({ type: 'default', kind: 'brand', id: b.id }); assert.equal((await d.S.getMeta('brand')).id, b.id);
  await d.S.changeCatalog({ type: 'rename', kind: 'template', id: model.id, name: 'Renamed' });
  assert.equal((await d.S.getCatalog()).templates[0].name, 'Renamed');
  await d.S.changeCatalog({ type: 'remove', kind: 'brand', id: b.id }); assert.equal((await d.S.getMeta('brand')).name, 'Legacy');
  await d.S.changeCatalog({ type: 'remove', kind: 'template', id: model.id }); await d.S.housekeeping();
  assert.equal(await d.S.getAsset('second-logo'), undefined); assert.equal(await d.S.getAsset('template-photo'), undefined);
  await assert.rejects(d.S.changeCatalog({ type: 'save', kind: 'template', id: model.id, value: model, replace: true }), /removido/);
});

test('campaign and review metadata survive storage, portable transfer and version restoration', async () => {
  const d = device(), p = d.M.addLocale(d.project(), 'fr', 'pt-PT');
  d.RS.workflow.markReviewed(p, 'fr', 'headline');
  await d.S.putProject(p);
  await d.S.updateOrganization(p.id, { campaign: 'Suíça 2026', tags: ['Urgente'], favorite: true, status: 'ready' });
  const organized = (await d.S.getProject(p.id)).data;
  assert.equal(organized.organization.campaign, 'Suíça 2026');
  // A stale card only updates its organisation; newer editor content is kept.
  organized.texts.fr.headline = 'Nouveau titre';
  await d.S.putProject(organized);
  const current = await d.S.updateOrganization(p.id, { status: 'published' });
  assert.equal(current.data.texts.fr.headline, 'Nouveau titre');
  const other = device();
  const imported = await other.A.importProjectFile(await d.A.exportProjectFile(current.data));
  assert.deepEqual(plain(imported.organization), plain(current.data.organization));
  assert.equal(other.RS.workflow.reviewRows(imported, 'fr').find((r) => r.key === 'headline').status, 'pending');
  imported.texts['pt-PT'].headline = 'Novo original';
  assert.equal(other.RS.workflow.reviewRows(imported, 'fr').find((r) => r.key === 'headline').status, 'stale');
  const baseline = (await d.S.listVersions(p.id)).find((v) => v.data.organization.campaign === '');
  const restored = await d.S.restoreVersion(p.id, baseline.id);
  assert.equal(restored.data.organization.campaign, '');
  assert.equal(d.RS.workflow.reviewRows(restored.data, 'fr').find((r) => r.key === 'headline').status, 'reviewed');
  await d.S.setDeleted(p.id, Date.now());
  await assert.rejects(d.S.updateOrganization(p.id, { status: 'ready' }), /Restaure/);
});

test('captions: custom and empty texts survive storage, file transfer and regeneration per language', async () => {
  const d = device();
  const p = d.M.addLocale(d.project(), 'fr', 'pt-PT');
  d.M.setPublicationText(p, 'pt-PT', 'Texto PT escrito por mim');
  d.M.setPublicationText(p, 'fr', '');
  p.texts['pt-PT'].headline = 'Outra profissão';
  await d.S.putProject(p);
  const reopened = device(d.factory);
  const stored = reopened.M.normalize((await reopened.S.getProject(p.id)).data);
  assert.equal(reopened.M.publicationText(stored, 'pt-PT'), 'Texto PT escrito por mim');
  assert.equal(reopened.M.publicationText(stored, 'fr'), '');
  const other = device();
  const imported = await other.A.importProjectFile(await d.A.exportProjectFile(stored));
  assert.deepEqual(plain(imported.captions), { 'pt-PT': 'Texto PT escrito por mim', fr: '' });
  other.M.setPublicationText(imported, 'pt-PT', null);
  assert.equal(other.M.publicationText(imported, 'pt-PT'), other.M.caption(imported, 'pt-PT'));
  assert.equal(other.M.publicationText(imported, 'fr'), '');
  assert.equal(other.M.removeLocale(imported, 'fr').captions.fr, undefined);
  const raw = plain(imported); delete raw.captions;
  assert.deepEqual(plain(other.M.normalize(raw).captions), {});
});

test('portable: chosen own and bundled photos, sound, logo, order and crop travel to an empty device', async () => {
  const d = device(), p = d.project();
  for (const id of ['main', 'second', 'logo']) await d.S.putAsset({ id, blob: blob(id), kind: id === 'logo' ? 'logo' : 'photo' });
  await d.S.putAsset({ id: 'sound', blob: blob('music', 'audio/mpeg'), kind: 'audio', duration: 20 });
  await d.S.setMeta('library', [{ asset: 'second', cat: 'pedreiro', thumb: data('second') }]);
  d.RS.library.index = async () => ({ items: [{ id: 'stock', cat: 'pedreiro', thumb: data('stock thumb'), fy: 0.25 }] });
  d.RS.library.full = async (id) => { assert.equal(id, 'stock'); return data('stock full'); };
  p.photo = { asset: 'main', fx: 0.3, fy: 0.7 };
  p.logo = { asset: 'logo' };
  p.video.sound = 'own'; p.video.ownSound = 'sound';
  p.video.photos = { mode: 'chosen', ids: ['second', 'stock', 'main'], focus: { second: { x: 0.2, y: 0.8 } } };
  const before = JSON.stringify(p);
  const archive = await d.A.exportProjectFile(p);
  assert.equal(JSON.stringify(p), before, 'export mutated the working project');
  const encoded = JSON.parse(await archive.text());
  assert.equal(encoded.v, 2);
  assert.equal(Object.keys(encoded.assets).length, 5, 'shared main photo must be stored once');
  const target = device();
  const q = await target.A.importProjectFile(archive);
  assert.notEqual(q.id, p.id);
  assert.equal(q.video.photos.ids[2], q.photo.asset);
  assert.deepEqual(plain(q.video.photos.focus[q.video.photos.ids[0]]), { x: 0.2, y: 0.8 });
  assert.deepEqual(plain(q.video.photos.focus[q.video.photos.ids[1]]), { x: 0.5, y: 0.25 });
  assert.deepEqual(plain(q.video.photos.focus[q.photo.asset]), { x: 0.3, y: 0.7 });
  assert.equal(await (await target.S.getAsset(q.video.ownSound)).blob.text(), 'music');
  // Removing the images from the photo library must not remove them from the ad.
  await target.S.setMeta('library', []);
  await target.S.housekeeping();
  const photos = await target.RS.motion.recipePhotos(q, {});
  assert.deepEqual(Array.from(photos, (im) => im.bytes), ['second', 'stock full', 'main']);
  const again = device();
  const round = await again.A.importProjectFile(await target.A.exportProjectFile(q));
  assert.equal((await again.S.getAsset(round.logo.asset)).kind, 'logo');
});

test('portable: automatic video photo selection remains frozen across different libraries', async () => {
  const d = device(), p = d.project();
  await d.S.putAsset({ id: 'own', blob: blob('own'), kind: 'photo' });
  p.photo = { asset: 'own', fx: 0.4, fy: 0.6 };
  d.RS.library.index = async () => ({ items: [
    { id: 'a', cat: 'pedreiro', thumb: data('a'), fy: 0.2 }, { id: 'b', cat: 'obras', thumb: data('b') },
  ] });
  d.RS.library.full = async (id) => data(id);
  const target = device();
  const q = await target.A.importProjectFile(await d.A.exportProjectFile(p));
  assert.equal(q.video.photos.mode, 'trades');
  assert.ok(target.M.photoSnapshot(q));
  const set = await target.RS.motion.photoSet(q, {}, [{ id: 'different', cat: 'pedreiro', thumb: data('different') }]);
  assert.deepEqual(Array.from(set.cards, (im) => im.bytes), ['own', 'a', 'b']);
  assert.equal(set.hero.bytes, 'own');
  const full = await target.RS.motion.recipePhotos(q, {});
  assert.deepEqual(Array.from(full, (im) => im.bytes), ['own', 'a', 'b']);
  q.trades = ['pintor'];
  assert.equal(target.M.photoSnapshot(q), null, 'a changed trade must use its new photos');
});

test('portable: incomplete or unsafe archives fail before writing any data; v1 still opens', async () => {
  const d = device(), p = d.project();
  p.photo = { asset: 'missing' };
  await assert.rejects(d.A.exportProjectFile(p), /Falta uma imagem/);
  await assert.rejects(d.A.importProjectFile(file({ app: 'recruitment-studio', v: 2, project: p, assets: {} })), /incompleto/);
  await assert.rejects(d.A.importProjectFile(file({ app: 'recruitment-studio', v: 2, project: p, assets: { missing: { data: 'https://example.com/private.png' } } })), /inválido/);
  await assert.rejects(d.A.importProjectFile(file({ app: 'recruitment-studio', v: 99, project: p })), /mais recente/);
  assert.equal((await d.S.listProjects()).length, 0);
  const old = d.project(); delete old.captions;
  const loaded = await d.A.importProjectFile(file({ app: 'recruitment-studio', v: 1, project: old, assets: {} }));
  assert.deepEqual(plain(loaded.captions), {});
  assert.equal((await d.S.listProjects()).length, 1);
});

test('history: automatic saves group by minute; manual versions persist and restoration is reversible', async () => {
  const d = device(), p = d.project();
  p.name = 'Primeira'; await d.S.putProject(p);
  p.name = 'Segunda'; await d.S.putProject(p);
  p.name = 'Terceira'; await d.S.putProject(p);
  assert.deepEqual(Array.from(await d.S.listVersions(p.id), (v) => v.data.name), ['Primeira']);
  d.clock.now += 61000;
  p.name = 'Quarta'; await d.S.putProject(p);
  assert.deepEqual(Array.from(await d.S.listVersions(p.id), (v) => v.data.name), ['Terceira', 'Primeira']);
  await d.S.saveVersion(p);
  await d.S.saveVersion(p);
  assert.equal((await d.S.listVersions(p.id)).length, 3, 'identical manual snapshots must not duplicate');
  const reopened = device(d.factory, d.clock);
  const first = (await reopened.S.listVersions(p.id)).find((v) => v.data.name === 'Primeira');
  p.name = 'Antes de restaurar'; await reopened.S.putProject(p);
  const restored = await reopened.S.restoreVersion(p.id, first.id);
  assert.equal(restored.data.name, 'Primeira');
  assert.equal(restored.id, p.id);
  const savedCurrent = (await reopened.S.listVersions(p.id)).find((v) => v.data.name === 'Antes de restaurar');
  assert.ok(savedCurrent);
  assert.equal((await reopened.S.restoreVersion(p.id, savedCurrent.id)).data.name, 'Antes de restaurar');
});

test('history: at most 50 versions, including checkpoints, and old asset references stay alive', async () => {
  const d = device(), p = d.project();
  await d.S.putAsset({ id: 'only-in-history', kind: 'photo', blob: blob('history') });
  p.video.photos = { mode: 'chosen', ids: ['only-in-history'] };
  await d.S.putProject(p);
  p.video.photos = { mode: 'trades', ids: [] };
  p.name = 'Sem fotografia'; await d.S.putProject(p);
  await d.S.housekeeping();
  assert.ok(await d.S.getAsset('only-in-history'));
  for (let i = 0; i < 60; i++) { p.name = `Versão ${i}`; await d.S.saveVersion(p); }
  assert.equal((await d.S.listVersions(p.id)).length, 50);
  await d.S.housekeeping();
  assert.equal(await d.S.getAsset('only-in-history'), undefined);
});

test('history: restoring an older version recovers captions, languages, photo and audio together', async () => {
  const d = device();
  const p = d.M.addLocale(d.project(), 'fr', 'pt-PT');
  await d.S.putAsset({ id: 'old-photo', kind: 'photo', blob: blob('photo') });
  await d.S.putAsset({ id: 'old-sound', kind: 'audio', blob: blob('sound', 'audio/mpeg') });
  p.photo = { asset: 'old-photo', fx: 0.1, fy: 0.9 };
  p.video.sound = 'own'; p.video.ownSound = 'old-sound';
  p.captions = { 'pt-PT': 'Texto antigo', fr: 'Texte ancien' };
  await d.S.putProject(p);
  const changed = d.M.removeLocale(p, 'fr');
  changed.photo = null; changed.video.ownSound = null; changed.video.sound = 'none'; changed.captions['pt-PT'] = 'Novo';
  await d.S.putProject(changed);
  await d.S.housekeeping();
  const old = (await d.S.listVersions(p.id))[0];
  const restored = (await d.S.restoreVersion(p.id, old.id)).data;
  assert.deepEqual(plain(restored.locales), ['pt-PT', 'fr']);
  assert.deepEqual(plain(restored.captions), { 'pt-PT': 'Texto antigo', fr: 'Texte ancien' });
  assert.equal(restored.photo.asset, 'old-photo');
  assert.equal(restored.video.ownSound, 'old-sound');
  assert.equal(restored.video.sound, 'own');
  assert.ok(await d.S.getAsset(restored.photo.asset));
  assert.ok(await d.S.getAsset(restored.video.ownSound));
});

test('trash: restart preserves ads and assets for 30 days, restore keeps history, stale edits cannot resurrect', async () => {
  const d = device(), p = d.project();
  await d.S.putAsset({ id: 'video-only', kind: 'photo', blob: blob('photo') });
  p.video.photos = { mode: 'chosen', ids: ['video-only'] };
  await d.S.putProject(p);
  p.name = 'Nova'; await d.S.putProject(p);
  await d.S.setDeleted(p.id, d.clock.now);
  await assert.rejects(d.S.putProject(p), /reciclagem/);
  d.clock.now += 29 * 86400000;
  const reopened = device(d.factory, d.clock);
  await reopened.S.housekeeping();
  assert.ok(await reopened.S.getProject(p.id));
  assert.ok(await reopened.S.getAsset('video-only'));
  const restored = await reopened.S.setDeleted(p.id, null);
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.history.length, 1);
  await reopened.S.setDeleted(p.id, d.clock.now);
  d.clock.now += 30 * 86400000 + 1;
  await reopened.S.housekeeping();
  assert.equal(await reopened.S.getProject(p.id), undefined);
  assert.equal(await reopened.S.getAsset('video-only'), undefined);
});

test('import: a failed transaction rolls back every asset, the project and library changes', async () => {
  const d = device(), p = d.project();
  await d.S.setMeta('library', [{ asset: 'existing' }]);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, ...args) {
    if (this.name === 'assets' && value.id === 'fails') throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return original.call(this, value, ...args);
  };
  try {
    await assert.rejects(d.S.importBundle(p, [{ id: 'first', blob: blob('first') }, { id: 'fails', blob: blob('last') }], [{ asset: 'first' }]), /Quota/);
  } finally { IDBObjectStore.prototype.put = original; }
  assert.equal(await d.S.getAsset('first'), undefined);
  assert.equal(await d.S.getProject(p.id), undefined);
  assert.deepEqual(plain(await d.S.getMeta('library')), [{ asset: 'existing' }]);
});

test('memory fallback: saved projects and versions do not alias the editor objects', async () => {
  const d = device(null), p = d.project();
  p.name = 'Antes'; await d.S.putProject(p);
  p.name = 'Depois'; await d.S.putProject(p);
  assert.equal((await d.S.listVersions(p.id))[0].data.name, 'Antes');
  const rec = await d.S.getProject(p.id); rec.data.name = 'Mutação externa';
  assert.equal((await d.S.getProject(p.id)).data.name, 'Depois');
});
