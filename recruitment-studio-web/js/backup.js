// Portable workspace backups. Preparing/previewing never writes to storage.
window.RS = window.RS || {};
RS.backup = (() => {
  const U = RS.util, S = RS.store, M = RS.model, R = RS.reuse;
  const APP = 'recruitment-studio-workspace', VERSION = 1;
  const imageData = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]*={0,2}$/i;
  const mediaData = /^data:(image|audio)\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i;
  const invalid = () => new Error('A cópia está incompleta ou contém dados inválidos. Nenhum dado foi alterado.');
  const unique = (rows, key = 'id') => Array.isArray(rows) && rows.every((r) => r && typeof r[key] === 'string' && r[key]) && new Set(rows.map((r) => r[key])).size === rows.length;
  const thumbnail = (value) => typeof value === 'string' && imageData.test(value) ? value : null;
  function allProjects(records, catalog) {
    return [...records.flatMap((r) => [r.data, ...(r.history || []).map((v) => v.data)]), ...catalog.templates.map((t) => t.project)];
  }
  async function create({ history = true, trash = true, onProgress = () => {} } = {}) {
    const snapshot = await S.readWorkspace(), meta = new Map(snapshot.meta);
    const records = U.clone(snapshot.projects.filter((r) => trash || !r.deletedAt));
    for (const r of records) delete r.editor;
    if (!history) for (const r of records) r.history = [];
    const catalog = R.catalog(meta.get('catalog'), meta.get('brand'));
    const library = U.clone(meta.get('library') || []), lib = await RS.library.index();
    const items = [...lib.items, ...library], assets = new Map(snapshot.assets.map((a) => [a.id, a]));
    // Preserve automatic video selections and the supplied crop defaults.
    for (const p of allProjects(records, catalog)) {
      const beforePortable = U.clone(p);
      const normalized = M.normalize(p); Object.assign(p, normalized);
      const plan = RS.motion.photoPlan(p, lib.items, library);
      if (p.video.photos.mode === 'chosen') delete p.video.photos.snapshot;
      else p.video.photos.snapshot = { ...plan, key: M.photoSelectionKey(p) };
      const focus = {};
      for (const id of S.projectAssetIds(p)) {
        const item = items.find((it) => (it.asset || it.id) === id);
        if (!assets.has(id)) {
          if (!item?.id) throw new Error(`Falta um recurso de «${p.name || 'anúncio'}». Volte a escolhê-lo antes de criar a cópia.`);
          onProgress('A incluir fotografias da aplicação…');
          const data = await RS.library.full(id);
          assets.set(id, { id, kind: 'photo', blob: await U.dataURLToBlob(data) });
          if (!library.some((it) => it.asset === id)) library.push({ asset: id, cat: item.cat || 'geral', thumb: item.thumb || data, addedAt: Date.now() });
        }
        if (item) focus[id] = M.videoPhotoFocus(p, id, item);
      }
      p.video.photos.focus = { ...focus, ...p.video.photos.focus };
      RS.workflow?.rebasePublication(beforePortable, p);
    }
    for (const id of [...catalog.brands.map((b) => b.logo), ...library.map((it) => it.asset)].filter(Boolean)) {
      if (!assets.has(id)) throw new Error('Falta um recurso de uma marca ou da biblioteca. Corrija-o antes de criar a cópia.');
    }
    const required = new Set([...allProjects(records, catalog).flatMap(S.projectAssetIds),
      ...catalog.brands.map((b) => b.logo), ...library.map((it) => it.asset)].filter(Boolean));
    const encoded = [];
    for (const a of assets.values()) {
      if (!required.has(a.id)) continue;
      onProgress(`A incluir recurso ${encoded.length + 1} de ${required.size}…`);
      const { blob, ...props } = a;
      encoded.push({ ...props, kind: a.kind || (blob.type.startsWith('audio/') ? 'audio' : 'photo'), data: await U.blobToDataURL(blob) });
    }
    return new Blob([JSON.stringify({ app: APP, v: VERSION, savedAt: Date.now(), options: { history, trash }, projects: records, catalog, library, assets: encoded })], { type: 'application/json' });
  }
  async function inspect(file) {
    if (file.size > 768 * 1024 * 1024) throw new Error('Esta cópia excede 768 MB. Abra-a num computador ou use projetos .anuncio individuais.');
    let a;
    try { a = JSON.parse(await file.text()); } catch { throw invalid(); }
    if (!a || a.app !== APP) throw new Error('Escolha uma cópia global .rsbackup do Recruitment Studio.');
    if (a.v !== VERSION) throw new Error('Esta cópia precisa de uma versão mais recente do Recruitment Studio.');
    if (!unique(a.projects) || !unique(a.assets) || a.catalog?.v !== 1 || !unique(a.catalog.brands) || !unique(a.catalog.templates) || !unique(a.library, 'asset')) throw invalid();
    if (a.catalog.phrases && (!unique(a.catalog.phrases) || a.catalog.phrases.some((p) => !R.PHRASE_FIELDS[p.field] || typeof p.name !== 'string'))) throw invalid();
    a.catalog = R.catalog(a.catalog);
    for (const r of a.projects) {
      if (!r.data || r.data.id !== r.id || !Array.isArray(r.history) || r.history.some((v) => !v?.data)) throw invalid();
      r.data = M.normalize(r.data); r.thumb = thumbnail(r.thumb);
      r.history = r.history.map((v) => ({ ...v, data: M.normalize(v.data), thumb: thumbnail(v.thumb) }));
    }
    for (const t of a.catalog.templates) { if (!t.project) throw invalid(); t.project = M.normalize(t.project); t.thumb = thumbnail(t.thumb); }
    if (a.catalog.defaultBrandId && !a.catalog.brands.some((b) => b.id === a.catalog.defaultBrandId)) throw invalid();
    const media = new Map();
    for (const asset of a.assets) {
      if (!mediaData.test(asset.data || '') || !['photo', 'logo', 'audio'].includes(asset.kind)) throw invalid();
      const blob = await U.dataURLToBlob(asset.data);
      if (!blob.size || (asset.kind === 'audio') !== blob.type.startsWith('audio/')) throw invalid();
      const { data, ...props } = asset; media.set(asset.id, { ...props, blob, type: blob.type });
    }
    for (const p of allProjects(a.projects, a.catalog)) {
      for (const id of S.projectAssetIds(p)) if (!media.has(id)) throw invalid();
      if (p.video.ownSound && media.get(p.video.ownSound).kind !== 'audio') throw invalid();
      for (const id of [p.photo?.asset, p.logo?.asset, ...p.video.photos.ids, ...(p.video.photos.snapshot?.cards || []), ...(p.video.photos.snapshot?.full || []), p.video.photos.snapshot?.hero,
        ...M.carouselAssetIds(p)].filter(Boolean)) {
        if (media.get(id).kind === 'audio') throw invalid();
      }
    }
    for (const id of [...a.catalog.brands.map((b) => b.logo), ...a.library.map((it) => it.asset)].filter(Boolean)) {
      if (!media.has(id) || media.get(id).kind === 'audio') throw invalid();
    }
    for (const it of a.library) it.thumb = thumbnail(it.thumb) || a.assets.find((v) => v.id === it.asset).data;
    const current = await S.readWorkspace(), c = R.catalog(new Map(current.meta).get('catalog'), new Map(current.meta).get('brand'));
    const rows = (kind, incoming, previous) => incoming.map((r) => ({ kind, id: r.id, name: r.name || r.label || 'Sem nome', exists: previous.some((p) => p.id === r.id) }));
    return { archive: a, media: [...media.values()], current, signature: S.workspaceSignature(current),
      rows: [...rows('Anúncio', a.projects, current.projects), ...rows('Marca', a.catalog.brands, c.brands), ...rows('Modelo', a.catalog.templates, c.templates), ...rows('Texto', a.catalog.phrases, c.phrases)] };
  }
  function remapProject(source, ids) {
    const p = M.normalize(source), get = (id) => ids.get(id) || id;
    if (p.photo) p.photo.asset = get(p.photo.asset);
    if (p.logo) p.logo.asset = get(p.logo.asset);
    M.remapCarouselAssets(p, get);
    p.video.ownSound = get(p.video.ownSound);
    const ph = p.video.photos; ph.ids = ph.ids.map(get);
    if (ph.snapshot) ph.snapshot = { ...ph.snapshot, cards: ph.snapshot.cards.map(get), full: ph.snapshot.full.map(get), hero: get(ph.snapshot.hero) };
    ph.focus = Object.fromEntries(Object.entries(ph.focus || {}).map(([id, f]) => [get(id), f]));
    return RS.workflow ? RS.workflow.rebasePublication(source, p) : p;
  }
  async function restore(preview, mode = 'copy') {
    if (!['copy', 'replace'].includes(mode)) throw new Error('Escolha adicionar cópias ou substituir correspondências.');
    const a = U.clone(preview.archive), meta = new Map(preview.current.meta), now = Date.now();
    const ids = new Map(preview.media.map((v) => [v.id, U.uid()]));
    const assets = preview.media.map((v) => ({ ...v, id: ids.get(v.id) }));
    const projects = a.projects.map((r) => {
      const previous = preview.current.projects.find((p) => p.id === r.id), id = mode === 'copy' ? U.uid() : r.id;
      const data = remapProject(r.data, ids);
      data.id = id; data.deletedAt = r.deletedAt ? now : null; data.updatedAt = now;
      if (mode === 'copy' && previous) { data.name = `${data.name} (cópia)`; data.nameAuto = false; }
      let history = r.history.map((v) => ({ ...v, id: U.uid(), data: { ...remapProject(v.data, ids), id } }));
      if (mode === 'replace' && previous) {
        // Keep the version being replaced, even when the file omitted history.
        history = [...(!a.options?.history ? previous.history || [] : history), { id: U.uid(), savedAt: previous.savedAt, capturedAt: now, reason: 'Antes do restauro global', data: U.clone(previous.data), thumb: previous.thumb }].slice(-S.HISTORY_LIMIT);
      }
      return { ...r, id, data, history, name: data.name, deletedAt: data.deletedAt, updatedAt: now, savedAt: now };
    });
    const c = R.catalog(meta.get('catalog'), meta.get('brand')), brandIds = new Map();
    for (const kind of ['brands', 'templates', 'phrases']) for (const item of a.catalog[kind] || []) {
      const oldId = item.id; item.id = mode === 'copy' ? U.uid() : oldId;
      if (kind === 'brands') { brandIds.set(oldId, item.id); if (item.logo) item.logo = ids.get(item.logo); }
      else if (kind === 'templates') item.project = remapProject(item.project, ids);
      const at = c[kind].findIndex((v) => v.id === item.id);
      if (at < 0) c[kind].push(item); else c[kind][at] = item;
    }
    if ((!c.defaultBrandId || mode === 'replace') && a.catalog.defaultBrandId) c.defaultBrandId = brandIds.get(a.catalog.defaultBrandId);
    const library = [...(meta.get('library') || []), ...a.library.map((it) => ({ ...it, asset: ids.get(it.asset) }))];
    await S.restoreWorkspace(preview.signature, { projects, assets, meta: [['catalog', c], ['brand', R.defaultBrand(c)], ['library', library]] });
    return { projects: projects.length, brands: a.catalog.brands.length, templates: a.catalog.templates.length, assets: assets.length };
  }
  async function storageInfo() {
    await S.open();
    const storage = navigator.storage;
    const [estimate, persisted, last] = await Promise.all([
      storage?.estimate ? storage.estimate().catch(() => null) : null,
      storage?.persisted ? storage.persisted().catch(() => null) : null, S.getMeta('lastBackup')]);
    return { available: S.isPersistent(), usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted, last: last || null };
  }
  async function requestPersistence() {
    if (navigator.storage?.persist) await navigator.storage.persist();
    return storageInfo();
  }
  return { create, inspect, restore, storageInfo, requestPersistence, remapProject };
})();
