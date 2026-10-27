// Local storage (IndexedDB), image import and project files.
// Everything stays on this computer, in this browser's profile.
window.RS = window.RS || {};

RS.store = (() => {
  const DB_NAME = 'recruitment-studio';
  const TRASH_DAYS = 30, HISTORY_LIMIT = 50, HISTORY_INTERVAL = 60 * 1000;
  const clone = (v) => RS.util.clone(v);
  const memory = { projects: new Map(), assets: new Map(), meta: new Map() };
  const EDITOR_LEASE_MS = 45000, listeners = new Set(), CHANGE_KEY = 'rs-project-change';
  let channel = null;
  const deliver = (message) => { for (const listener of listeners) { try { listener(message); } catch {} } };
  const storageChange = (event) => { if (event.key === CHANGE_KEY && event.newValue) { try { deliver(JSON.parse(event.newValue)); } catch {} } };
  function announce(rec, actor) {
    const message = { id: rec.id, revision: rec.revision || 0, actor: actor || '', editor: rec.editor?.id || '', nonce: RS.util.uid() };
    deliver(message);
    try { if (channel) channel.postMessage(message); else if (typeof BroadcastChannel !== 'undefined') { const sender = new BroadcastChannel(CHANGE_KEY); sender.postMessage(message); sender.close(); } } catch {}
    try { window.localStorage?.setItem(CHANGE_KEY, JSON.stringify(message)); } catch {}
    return rec;
  }
  function watchProjects(listener) {
    listeners.add(listener);
    if (listeners.size === 1) {
      try { if (typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel(CHANGE_KEY); channel.onmessage = (e) => deliver(e.data); } } catch {}
      window.addEventListener?.('storage', storageChange);
    }
    return () => { listeners.delete(listener); if (!listeners.size) { channel?.close(); channel = null; window.removeEventListener?.('storage', storageChange); } };
  }
  function editorConflict(current, reason) {
    const message = reason === 'deleted' ? 'Este anúncio está na reciclagem. Restaure-o antes de editar.' : reason === 'missing' ? 'Este anúncio já não está disponível.' : reason === 'owner' ? 'Este anúncio está aberto para edição noutra janela.' : 'Existe uma versão mais recente guardada noutra janela.';
    return Object.assign(new Error(message), { code: 'EDITOR_CONFLICT', reason, current: current ? clone(current) : null });
  }
  let dbPromise = null;
  let persistent = true;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (err) { reject(err); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((err) => {
        console.warn('IndexedDB unavailable, keeping data in memory only', err);
        persistent = false;
        return null;
      });
    }
    return dbPromise;
  }

  const wrap = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  async function run(store, mode, fn) {
    const db = await open();
    if (!db) return fn(null, memory[store]);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let result;
      Promise.resolve().then(() => fn(tx.objectStore(store), null)).then((v) => { result = v; }, (err) => { try { tx.abort(); } catch {} reject(err); });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  // ---------------------------------------------------------------- projects
  const listProjects = () => run('projects', 'readonly', (s, mem) => (s ? wrap(s.getAll()) : clone([...mem.values()])));
  const getProject = (id) => run('projects', 'readonly', (s, mem) => (s ? wrap(s.get(id)) : mem.has(id) ? clone(mem.get(id)) : undefined));
  const contentKey = (p) => JSON.stringify({ ...p, updatedAt: undefined, createdAt: undefined, deletedAt: undefined, locale: undefined });
  function addVersion(history, rec, reason, now) {
    const last = history[history.length - 1];
    if (last && contentKey(last.data) === contentKey(rec.data)) return history;
    return [...history, { id: RS.util.uid(), savedAt: rec.savedAt || rec.updatedAt || now, capturedAt: now, reason, data: clone(rec.data), thumb: rec.thumb || null }].slice(-HISTORY_LIMIT);
  }
  function projectRecord(project, thumb, prev, opts = {}) {
    const now = Date.now();
    let history = prev && Array.isArray(prev.history) ? prev.history : [];
    const last = history[history.length - 1];
    if (prev && contentKey(prev.data) !== contentKey(project) && (opts.checkpoint || !last || now - last.capturedAt >= HISTORY_INTERVAL)) {
      history = addVersion(history, prev, opts.reason || 'Automática', now);
    }
    const rec = {
      id: project.id, name: project.name, updatedAt: project.updatedAt, deletedAt: project.deletedAt || null,
      template: project.template, thumb: thumb || (prev && prev.thumb) || null, data: clone(project), history, savedAt: now,
      revision: (prev?.revision || 0) + 1, editor: prev?.editor || null,
    };
    if (opts.snapshotCurrent) rec.history = addVersion(history, rec, 'Guardada manualmente', now);
    return rec;
  }
  function putProject(project, thumb, opts = {}) {
    // Capture the value now: callers may continue typing while IndexedDB opens.
    const data = clone(project);
    return run('projects', 'readwrite', async (s, mem) => {
      const prev = s ? await wrap(s.get(data.id)) : mem.get(data.id);
      // An editor left open in another tab must not resurrect a trashed ad.
      if (prev && prev.deletedAt) throw editorConflict(prev, 'deleted');
      if (opts.editorId && !prev) throw editorConflict(null, 'missing');
      if (opts.expectedRevision !== undefined && (prev?.revision || 0) !== opts.expectedRevision) throw editorConflict(prev, 'revision');
      if (opts.editorId && !opts.takeover && prev.editor?.id !== opts.editorId) throw editorConflict(prev, 'owner');
      const rec = projectRecord(data, thumb, prev, opts);
      if (opts.editorId) rec.editor = { id: opts.editorId, expires: Date.now() + EDITOR_LEASE_MS };
      if (s) s.put(rec); else mem.set(rec.id, rec);
      return clone(rec);
    }).then((rec) => announce(rec, opts.editorId));
  }
  const removeProject = (id) => run('projects', 'readwrite', (s, mem) => (s ? s.delete(id) : mem.delete(id))).then(() => { announce({ id, revision: -1 }); });
  function changeProject(id, fn) {
    return run('projects', 'readwrite', async (s, mem) => {
      const rec = s ? await wrap(s.get(id)) : mem.has(id) ? clone(mem.get(id)) : null;
      if (!rec) throw new Error('O anúncio já não está disponível.');
      const next = fn(rec);
      if (s) s.put(next); else mem.set(id, next);
      return clone(next);
    }).then((rec) => announce(rec));
  }
  function claimEditor(id, editorId, expectedRevision) {
    return run('projects', 'readwrite', async (s, mem) => {
      const rec = s ? await wrap(s.get(id)) : mem.has(id) ? clone(mem.get(id)) : null;
      if (!rec || rec.deletedAt) throw editorConflict(rec, rec ? 'deleted' : 'missing');
      if (rec.editor?.id !== editorId && rec.editor?.expires > Date.now()) throw editorConflict(rec, 'owner');
      if (expectedRevision !== undefined && (rec.revision || 0) !== expectedRevision) throw editorConflict(rec, 'revision');
      rec.editor = { id: editorId, expires: Date.now() + EDITOR_LEASE_MS };
      if (s) s.put(rec); else mem.set(id, rec); return clone(rec);
    }).then((rec) => announce(rec, editorId));
  }
  function releaseEditor(id, editorId) {
    return run('projects', 'readwrite', async (s, mem) => {
      const rec = s ? await wrap(s.get(id)) : mem.has(id) ? clone(mem.get(id)) : null;
      if (rec?.editor?.id === editorId) { rec.editor = null; if (s) s.put(rec); else mem.set(id, rec); return clone(rec); }
      return null;
    }).then((rec) => { if (rec) announce(rec, editorId); });
  }
  const setDeleted = (id, deletedAt) => changeProject(id, (rec) => {
    const p = clone(rec.data);
    p.deletedAt = deletedAt || null;
    if (!deletedAt) p.updatedAt = Date.now();
    return projectRecord(p, rec.thumb, rec);
  });
  const saveVersion = (p, thumb, opts = {}) => putProject(p, thumb, { ...opts, checkpoint: true, snapshotCurrent: true });
  const updateOrganization = (id, patch) => changeProject(id, (rec) => {
    if (rec.deletedAt) throw new Error('Restaure primeiro o anúncio da reciclagem.');
    const p = clone(rec.data);
    p.organization = RS.model.cleanOrganization({ ...p.organization, ...patch });
    p.updatedAt = Date.now();
    return projectRecord(p, rec.thumb, rec, { checkpoint: true, reason: 'Antes de organizar' });
  });
  const listVersions = async (id) => {
    const rec = await getProject(id);
    return rec && Array.isArray(rec.history) ? [...rec.history].reverse() : [];
  };
  const updatePublication = (id, plan, status, expected) => changeProject(id, (rec) => {
    if (rec.deletedAt) throw new Error('Restaure primeiro o anúncio da reciclagem.');
    if (expected && contentKey(RS.model.normalize(rec.data)) !== contentKey(RS.model.normalize(expected))) throw new Error('O anúncio mudou noutra janela. Feche o planeamento e volte a abrir para rever os dados atuais.');
    const p = clone(rec.data); p.publication = RS.model.cleanPublication(plan, p.locales);
    p.organization = RS.model.cleanOrganization({ ...p.organization, status }); p.updatedAt = Date.now();
    return projectRecord(p, rec.thumb, rec, { checkpoint: true, reason: 'Antes de planear a publicação' });
  });
  const restoreVersion = (id, versionId, opts = {}) => changeProject(id, (rec) => {
    if (rec.deletedAt) throw new Error('Restaure primeiro o anúncio da reciclagem.');
    if (opts.editorId && (rec.editor?.id !== opts.editorId || (rec.revision || 0) !== opts.expectedRevision)) throw editorConflict(rec, 'revision');
    const version = (rec.history || []).find((v) => v.id === versionId);
    if (!version) throw new Error('Esta versão já não está disponível.');
    const p = RS.model.normalize(version.data);
    p.id = rec.id; p.createdAt = rec.data.createdAt; p.deletedAt = null; p.updatedAt = Date.now();
    return projectRecord(p, version.thumb, rec, { checkpoint: true, reason: 'Antes de restaurar' });
  });
  function projectAssetIds(p) {
    const ph = p.video && p.video.photos || {};
    const snapshot = ph.snapshot || {};
    return [...new Set([p.photo && p.photo.asset, p.logo && p.logo.asset, p.video && p.video.ownSound,
      ...(ph.ids || []), ...(snapshot.cards || []), ...(snapshot.full || []), snapshot.hero,
      ...Object.values(p.carousel?.locales || {}).flatMap((c) => (c.slides || []).map((s) => s.photo?.asset))].filter(Boolean))];
  }
  // Import is one transaction: a quota/error leaves neither half an ad nor
  // unreferenced assets behind. Existing ads and library items are preserved.
  async function importBundle(project, assets, libraryItems) {
    const db = await open();
    const rec = projectRecord(project, null, null);
    if (!db) {
      for (const a of assets) memory.assets.set(a.id, a);
      memory.meta.set('library', [...(memory.meta.get('library') || []), ...libraryItems]);
      memory.projects.set(rec.id, rec);
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Não foi possível importar o anúncio.'));
      const fail = (err) => { try { tx.abort(); } catch {} reject(err); };
      try {
        for (const a of assets) tx.objectStore('assets').put(a);
        tx.objectStore('projects').put(rec);
        const meta = tx.objectStore('meta');
        const req = meta.get('library');
        req.onsuccess = () => {
          try { meta.put([...(req.result || []), ...libraryItems], 'library'); } catch (err) { fail(err); }
        };
      } catch (err) { fail(err); }
    });
  }

  // ---------------------------------------------------------------- assets
  const putAsset = (a) => run('assets', 'readwrite', (s, mem) => (s ? s.put(a) : mem.set(a.id, a)));
  const getAsset = (id) => run('assets', 'readonly', (s, mem) => (s ? wrap(s.get(id)) : mem.get(id)));

  // ---------------------------------------------------------------- meta
  const getMeta = (key) => run('meta', 'readonly', (s, mem) => (s ? wrap(s.get(key)) : mem.get(key)));
  const setMeta = (key, value) => run('meta', 'readwrite', (s, mem) => (s ? s.put(value, key) : mem.set(key, value)));
  const updateLibrary = (fn) => run('meta', 'readwrite', async (s, mem) => {
    const previous = s ? await wrap(s.get('library')) : mem.get('library');
    const value = fn(clone(previous || []));
    if (s) s.put(value, 'library'); else mem.set('library', clone(value));
    return clone(value);
  });

  // Read/modify/write one catalogue transaction, including the legacy default.
  // Two open tabs can save different items without losing each other's changes.
  const updateCatalog = (fn = (c) => c) => run('meta', 'readwrite', async (s, mem) => {
    const [value, legacy] = s ? await Promise.all([wrap(s.get('catalog')), wrap(s.get('brand'))]) : [mem.get('catalog'), mem.get('brand')];
    const c = fn(RS.reuse.catalog(value, legacy));
    const brand = RS.reuse.defaultBrand(c);
    if (s) { s.put(c, 'catalog'); s.put(brand, 'brand'); }
    else { mem.set('catalog', clone(c)); mem.set('brand', clone(brand)); }
    return clone(c);
  });
  const getCatalog = () => updateCatalog();
  const changeCatalog = (action) => updateCatalog((c) => RS.reuse.mutate(c, action));
  const saveDefaultBrand = (brand) => updateCatalog((c) => {
    const id = c.defaultBrandId || RS.util.uid();
    return RS.reuse.mutate(c, { type: 'save', kind: 'brand', id, value: { ...brand, id, label: brand.label || brand.name || 'A minha marca' } });
  });

  // A backup observes one database transaction, never a mixture of edits.
  function readWorkspaceTransaction(tx) {
    return Promise.all([wrap(tx.objectStore('projects').getAll()), wrap(tx.objectStore('assets').getAll()),
      wrap(tx.objectStore('meta').getAllKeys()), wrap(tx.objectStore('meta').getAll())])
      .then(([projects, assets, keys, values]) => ({ projects, assets, meta: keys.map((k, i) => [k, values[i]]) }));
  }
  async function readWorkspace() {
    const db = await open();
    if (!db) return { projects: clone([...memory.projects.values()]), assets: [...memory.assets.values()], meta: clone([...memory.meta]) };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'assets', 'meta'], 'readonly');
      let snapshot;
      readWorkspaceTransaction(tx).then((s) => { snapshot = s; }, reject);
      tx.oncomplete = () => resolve(snapshot); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  }
  function workspaceSignature(s) {
    const sorted = (rows, key) => [...rows].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
    return JSON.stringify({ projects: sorted(s.projects.map(({ editor, ...r }) => r), (r) => r.id), meta: sorted(s.meta, (r) => r[0]),
      assets: sorted(s.assets.map(({ blob, ...a }) => ({ ...a, size: blob?.size, type: blob?.type })), (r) => r.id) });
  }
  async function restoreWorkspace(expected, changes) {
    const db = await open();
    if (!db) throw new Error('O navegador não permite guardar dados. Abra a cópia num navegador com armazenamento disponível.');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
      const fail = (e) => { try { tx.abort(); } catch {} reject(e); };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('O restauro foi cancelado; os dados anteriores mantêm-se.'));
      readWorkspaceTransaction(tx).then((current) => {
        if (workspaceSignature(current) !== expected) throw new Error('Os dados mudaram desde a pré-visualização. Abra novamente a cópia para rever o restauro.');
        for (const r of changes.projects) {
          const old = current.projects.find((p) => p.id === r.id);
          r.revision = Math.max(old?.revision || 0, r.revision || 0) + 1; r.editor = old?.editor || null;
          tx.objectStore('projects').put(r);
        }
        for (const a of changes.assets) tx.objectStore('assets').put(a);
        for (const [key, value] of changes.meta) tx.objectStore('meta').put(value, key);
      }).catch(fail);
    });
    for (const rec of changes.projects) announce(rec);
  }

  // Retained versions and the recycling bin own their assets too.
  async function housekeeping() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const cutoff = Date.now() - TRASH_DAYS * 86400000;
      const collect = (recs, brand, library, catalog, assetIds, removeAd, removeImage) => {
        const used = new Set();
        for (const r of recs) {
          if (r.deletedAt && r.deletedAt < cutoff) { removeAd(r.id); continue; }
          for (const p of [r.data, ...(r.history || []).map((v) => v.data)]) {
            for (const id of projectAssetIds(p)) used.add(id);
          }
        }
        if (brand && brand.logo) used.add(brand.logo);
        for (const b of catalog?.brands || []) if (b.logo) used.add(b.logo);
        for (const t of catalog?.templates || []) for (const id of projectAssetIds(t.project)) used.add(id);
        for (const it of library || []) used.add(it.asset);
        for (const id of assetIds) if (!used.has(id)) removeImage(id);
      };
      const db = await open();
      if (!db) {
        collect([...memory.projects.values()], memory.meta.get('brand'), memory.meta.get('library'), memory.meta.get('catalog'), [...memory.assets.keys()],
          (id) => memory.projects.delete(id), (id) => memory.assets.delete(id));
        return;
      }
      // Do not purge an ad restored (or an asset imported) by another tab
      // between reading its references and deleting the old records.
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
        const projects = tx.objectStore('projects'), assets = tx.objectStore('assets'), meta = tx.objectStore('meta');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        Promise.all([wrap(projects.getAll()), wrap(meta.get('brand')), wrap(meta.get('library')), wrap(meta.get('catalog')), wrap(assets.getAllKeys())])
          .then(([recs, brand, library, catalog, ids]) => collect(recs, brand, library, catalog, ids, (id) => projects.delete(id), (id) => assets.delete(id)))
          .catch((err) => { try { tx.abort(); } catch {} reject(err); });
      });
    } catch (err) {
      console.warn('Housekeeping skipped', err);
    }
  }

  return {
    open, isPersistent: () => persistent, listProjects, getProject, putProject, removeProject, setDeleted,
    putAsset, getAsset, getMeta, setMeta, housekeeping, importBundle, projectAssetIds,
    TRASH_DAYS, HISTORY_LIMIT, HISTORY_INTERVAL, saveVersion, listVersions, restoreVersion,
    updateOrganization, getCatalog, changeCatalog, saveDefaultBrand, updateCatalog, updatePublication,
    readWorkspace, workspaceSignature, restoreWorkspace, updateLibrary, claimEditor, releaseEditor, watchProjects, editorConflict, EDITOR_LEASE_MS,
  };
})();

// Decoded images kept in memory for drawing, and image import.
RS.assets = (() => {
  const U = RS.util;
  const cache = new Map();

  async function decode(blob) {
    if (blob.type === 'image/svg+xml') return rasterSvg(blob, 1600);
    try {
      return await createImageBitmap(blob);
    } catch {
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  async function rasterSvg(blob, longSide) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const w0 = img.naturalWidth || 800, h0 = img.naturalHeight || 400;
      const k = longSide / Math.max(w0, h0);
      const c = document.createElement('canvas');
      c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function load(id) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    const rec = await RS.store.getAsset(id);
    if (!rec) return null;
    const img = await decode(rec.blob);
    cache.set(id, img);
    return img;
  }

  const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality);
  });

  // Imports a file chosen by the person. Photos are kept up to 3200 px on the
  // long side (enough for 3x zoom on a story), logos up to 1600 px with transparency.
  async function importFile(file, kind) {
    const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif', 'image/bmp'];
    if (!okTypes.includes(file.type)) {
      throw new Error('Formato não suportado. Use uma imagem JPG, PNG, WebP ou SVG.');
    }
    let img;
    try {
      img = await decode(file);
    } catch {
      throw new Error('Não foi possível abrir esta imagem. Experimente guardá-la de novo como JPG ou PNG.');
    }
    const maxSide = kind === 'photo' ? 3200 : 1600;
    const w0 = img.width, h0 = img.height;
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    // Already the right size and type (e.g. a photo of the bundled library): kept
    // as it is, which skips a redraw, a re-encode and a second decode.
    if (k === 1 && file.type === (kind === 'photo' ? 'image/jpeg' : 'image/png')) {
      const id = U.uid();
      await RS.store.putAsset({ id, blob: file.slice(0, file.size, file.type), w: w0, h: h0, kind, type: file.type, name: file.name || '' });
      cache.set(id, img);
      return { id, w: w0, h: h0, img };
    }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const type = kind === 'photo' ? 'image/jpeg' : 'image/png';
    const blob = await toBlob(c, type, 0.92);
    const id = U.uid();
    await RS.store.putAsset({ id, blob, w: c.width, h: c.height, kind, type, name: file.name || '' });
    const decoded = await decode(blob);
    cache.set(id, decoded);
    return { id, w: c.width, h: c.height, img: decoded };
  }

  // The person's own sound for the video (MP3/M4A, kept as the original file).
  async function importAudio(file) {
    if (!/^audio\//.test(file.type || '') && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(file.name || '')) {
      throw new Error('Formato não suportado. Use um ficheiro de som MP3 ou M4A.');
    }
    const decoded = await RS.sound.decode(await file.arrayBuffer());
    const id = U.uid();
    const name = file.name || 'som';
    const type = file.type || 'audio/mpeg';
    await RS.store.putAsset({ id, blob: file.slice(0, file.size, type), kind: 'audio', type, name, duration: decoded.duration });
    return { id, duration: decoded.duration, name };
  }
  async function audioData(id) {
    const rec = id && (await RS.store.getAsset(id));
    if (!rec || rec.kind !== 'audio') throw new Error(RS.sound.BAD_FILE);
    return rec.blob.arrayBuffer();
  }
  // The own sound fitted to a video length, decoded once and kept for the
  // preview and every language and format (a long MP3 decodes to ~100 MB).
  const fitted = new Map();
  function fittedSound(id, duration) {
    const key = `${id}|${duration}`;
    if (!fitted.has(key)) {
      if (fitted.size >= 3) fitted.delete(fitted.keys().next().value);
      const p = audioData(id).then((data) => RS.sound.fitOwn(data, duration));
      p.catch(() => fitted.delete(key));
      fitted.set(key, p);
    }
    return fitted.get(key);
  }
  async function audioInfo(id) {
    const rec = id && (await RS.store.getAsset(id));
    return rec && rec.kind === 'audio' ? { id, name: rec.name || 'som', duration: rec.duration || 0 } : null;
  }

  // ---------------------------------------------------------------- project files (.anuncio)
  async function exportProjectFile(project) {
    const p = RS.model.normalize(project);
    const assets = Object.create(null);
    const [lib, mine] = await Promise.all([RS.library.index(), RS.library.userItems()]);
    const items = [...lib.items, ...mine];
    const plan = RS.motion.photoPlan(p, lib.items, mine);
    if (p.video.photos.mode === 'chosen') delete p.video.photos.snapshot;
    if (p.video.photos.mode !== 'chosen') p.video.photos.snapshot = { ...plan, key: RS.model.photoSelectionKey(p) };
    // Capture library crop defaults too: these must not depend on the library
    // shipped with another app version.
    const photoIds = new Set([...plan.cards, ...plan.full, plan.hero].filter(Boolean));
    const portableFocus = {};
    for (const id of RS.store.projectAssetIds(p)) {
      const item = items.find((it) => (it.asset || it.id) === id);
      let rec = await RS.store.getAsset(id);
      if (!rec && item && item.id) {
        rec = { kind: 'photo', blob: await U.dataURLToBlob(await RS.library.full(id)) };
      }
      if (!rec) throw new Error('Falta uma imagem ou som deste anúncio. Escolha o recurso de novo antes de guardar o ficheiro.');
      const data = await U.blobToDataURL(rec.blob);
      assets[id] = { kind: rec.kind, w: rec.w, h: rec.h, name: rec.name, duration: rec.duration, data,
        library: item?.asset || photoIds.has(id) ? { ...RS.library.metadata(item), cat: item && item.cat || 'geral', thumb: item && item.thumb || data } : null };
      if (photoIds.has(id)) {
        portableFocus[id] = RS.model.videoPhotoFocus(p, id, item);
      }
    }
    // Referenced photos take priority over old crop bookmarks at the model's
    // 64-photo limit when the file is normalised on the receiving device.
    p.video.photos.focus = { ...portableFocus, ...(p.video.photos.focus || {}) };
    RS.workflow?.rebasePublication(project, p);
    const json = JSON.stringify({ app: 'recruitment-studio', v: 2, savedAt: Date.now(), project: p, assets });
    return new Blob([json], { type: 'application/json' });
  }

  async function importProjectFile(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('Este ficheiro não é um projeto do Recruitment Studio.');
    }
    if (!parsed || parsed.app !== 'recruitment-studio' || !parsed.project) {
      throw new Error('Este ficheiro não é um projeto do Recruitment Studio.');
    }
    if (parsed.v != null && ![1, 2].includes(parsed.v)) throw new Error('Este ficheiro precisa de uma versão mais recente do Recruitment Studio.');
    const project = RS.model.normalize(parsed.project);
    const beforeRemap = U.clone(project);
    const idMap = Object.create(null), assets = [], libraryItems = [];
    const required = new Set(RS.store.projectAssetIds(project));
    for (const [oldId, a] of Object.entries(parsed.assets || {})) {
      if (!required.has(oldId)) continue;
      if (!a || typeof a.data !== 'string' || !/^data:(?:image|audio)\/[a-z0-9.+-]+;base64,/i.test(a.data)) {
        throw new Error('O ficheiro contém uma imagem ou som inválido.');
      }
      const blob = await U.dataURLToBlob(a.data);
      const id = U.uid();
      assets.push({ id, blob, w: a.w, h: a.h, kind: a.kind, type: blob.type, name: a.name, duration: a.duration });
      if (a.library && a.kind === 'photo') {
        const thumb = typeof a.library.thumb === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(a.library.thumb) ? a.library.thumb : a.data;
        libraryItems.push({ ...RS.library.metadata(a.library), asset: id, cat: typeof a.library.cat === 'string' ? a.library.cat : 'geral', thumb, addedAt: Date.now() });
      }
      idMap[oldId] = id;
    }
    if (parsed.v === 2 && [...required].some((id) => !idMap[id])) throw new Error('O ficheiro está incompleto: falta uma imagem ou som do anúncio.');
    if (project.video.ownSound) project.video.ownSound = idMap[project.video.ownSound] || null;
    if (!project.video.ownSound && project.video.sound === 'own') project.video.sound = 'generated';
    if (project.photo) project.photo.asset = idMap[project.photo.asset] || null;
    if (project.photo && !project.photo.asset) project.photo = null;
    if (project.logo) project.logo.asset = idMap[project.logo.asset] || null;
    if (project.logo && !project.logo.asset) project.logo = null;
    for (const c of Object.values(project.carousel?.locales || {})) for (const slide of c.slides) if (slide.photo?.asset) slide.photo.asset = idMap[slide.photo.asset] || slide.photo.asset;
    const ph = project.video.photos;
    ph.ids = ph.ids.map((id) => idMap[id] || id);
    if (ph.snapshot) {
      ph.snapshot = { key: RS.model.photoSelectionKey(project), cards: ph.snapshot.cards.map((id) => idMap[id] || id),
        full: ph.snapshot.full.map((id) => idMap[id] || id), hero: idMap[ph.snapshot.hero] || ph.snapshot.hero };
    }
    const focus = ph.focus;
    if (focus) {
      const out = {};
      for (const [id, f] of Object.entries(focus)) {
        out[idMap[id] || id] = f;
      }
      ph.focus = out;
    }
    project.id = U.uid();
    project.deletedAt = null;
    project.updatedAt = Date.now();
    RS.workflow?.rebasePublication(beforeRemap, project);
    await RS.store.importBundle(project, assets, libraryItems);
    return project;
  }

  // Dominant colours of a logo, darkest first (for "use my logo colours").
  function logoPalette(img) {
    const k = Math.min(1, 80 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max > 240 && min > 225) continue; // near white
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, sat: max - min };
      e.n++; e.r += r; e.g += g; e.b += b;
      buckets.set(key, e);
    }
    const colors = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 12)
      .map((e) => ({ hex: U.rgbToHex({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }), n: e.n, sat: e.sat }));
    const distinct = [];
    for (const c2 of colors) {
      if (distinct.every((d2) => U.contrast(d2.hex, c2.hex) > 1.35)) distinct.push(c2);
    }
    if (!distinct.length) return null;
    const byLum = [...distinct].sort((a, b) => U.luminance(a.hex) - U.luminance(b.hex));
    const primary = byLum[0].hex;
    const rest = distinct.filter((c2) => c2.hex !== primary).sort((a, b) => b.sat - a.sat);
    const accent = rest.length ? rest[0].hex : U.mix(primary, '#FFFFFF', 0.45);
    return { primary, accent };
  }

  return { load, importFile, importAudio, audioData, audioInfo, fittedSound, exportProjectFile, importProjectFile, logoPalette, cache, decode };
})();

// Photo library: photos bundled with the app (built by tools/build-photos.mjs into
// photos/) plus photos the person adds (kept as assets in IndexedDB).
// Bundled photos are JS files with data URLs: loaded with <script>, never <img>,
// because an image read from file:// would block the export.
RS.library = (() => {
  const U = RS.util;
  const waiting = new Map();
  RS.photoData = (id, data) => { const w = waiting.get(id); if (w) w.resolve(data); };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error(`Not found: ${src}`)); };
      document.head.appendChild(s);
    });
  }

  let indexPromise = null;
  function index() {
    if (!indexPromise) {
      indexPromise = loadScript('photos/library.js')
        .then(() => RS.PHOTO_LIBRARY || { items: [] })
        .catch(() => ({ items: [] }));
    }
    return indexPromise;
  }

  const fullCache = new Map();
  function full(id) {
    if (fullCache.has(id)) return fullCache.get(id);
    const p = new Promise((resolve, reject) => {
      waiting.set(id, { resolve });
      loadScript(`photos/full/${id}.js`).catch(reject);
    }).finally(() => waiting.delete(id));
    fullCache.set(id, p);
    p.catch(() => fullCache.delete(id));
    return p;
  }

  // A bundled photo as a File, ready for RS.assets.importFile.
  async function fileFor(id) {
    const blob = await U.dataURLToBlob(await full(id));
    return new File([blob], `${id}.jpg`, { type: blob.type || 'image/jpeg' });
  }

  function metadata(item = {}) {
    item ||= {};
    const tags = Array.isArray(item.tags) ? item.tags : String(item.tags || '').split(',');
    return { name: String(item.name || '').trim().slice(0, 120), description: String(item.description || '').trim().slice(0, 600),
      originalName: String(item.originalName || '').slice(0, 240), tags: [...new Set(tags.map((v) => String(v).trim().slice(0, 40)).filter(Boolean))].slice(0, 24), favorite: item.favorite === true,
      sourceDigest: /^[a-f0-9]{64}$/.test(item.sourceDigest || '') ? item.sourceDigest : '', contentDigest: /^[a-f0-9]{64}$/.test(item.contentDigest || '') ? item.contentDigest : '' };
  }
  const userItems = async () => ((await RS.store.getMeta('library')) || []).map((it) => ({ ...it, ...metadata(it) }));
  const label = (it) => it.name || it.originalName || `Fotografia ${String(it.asset || it.id || '').slice(-6)}`;
  function filter(items, { query = '', favorite = false, tag = '' } = {}) {
    const terms = RS.model.foldText(query).split(/\s+/).filter(Boolean);
    return items.filter((it) => (!favorite || it.favorite) && (!tag || it.tags?.includes(tag)) && terms.every((s) => RS.model.foldText([label(it), it.description, ...(it.tags || []), RS.trades.list.find((t) => t.photo === it.cat)?.label].join(' ')).includes(s)));
  }
  async function saveMetadata(asset, patch) {
    return RS.store.updateLibrary((list) => {
      const item = list.find((it) => it.asset === asset); if (!item) throw new Error('Esta fotografia já foi retirada da biblioteca.');
      const allowed = Object.fromEntries(['name', 'description', 'tags', 'favorite', 'cat'].filter((k) => k in patch).map((k) => [k, patch[k]]));
      Object.assign(item, allowed, metadata({ ...item, ...allowed })); return list;
    });
  }
  async function usage(asset, current) {
    const [records, catalogue] = await Promise.all([RS.store.listProjects(), RS.store.getCatalog()]);
    const uses = (p) => p && RS.store.projectAssetIds(p).includes(asset);
    const projects = records.map((r) => ({ id: r.id, name: current?.id === r.id ? current.name : r.name, trashed: !!r.deletedAt,
      current: uses(current?.id === r.id ? current : r.data), history: (r.history || []).some((v) => uses(v.data)) })).filter((r) => r.current || r.history);
    if (current && !records.some((r) => r.id === current.id) && uses(current)) projects.push({ id: current.id, name: current.name, current: true, history: false, trashed: false });
    return { projects, templates: catalogue.templates.filter((t) => uses(t.project)).map((t) => ({ id: t.id, name: t.name })) };
  }
  async function fingerprint(blob) {
    if (!globalThis.crypto?.subtle) return '';
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    return Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
  }

  async function thumbOf(img) {
    const k = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  }

  // Detailed results for each selected file. Existing metadata is merged in one
  // transaction; duplicate checks run again inside it to cover concurrent imports.
  async function addUserPhotos(files, cat, onProgress) {
    const result = { added: 0, duplicates: 0, failed: 0, items: [], duplicateCheck: !!globalThis.crypto?.subtle };
    for (const item of await userItems()) if (!item.contentDigest && result.duplicateCheck) {
      const rec = await RS.store.getAsset(item.asset);
      if (rec?.blob) {
        const digest = await fingerprint(rec.blob);
        await RS.store.updateLibrary((rows) => { const it = rows.find((v) => v.asset === item.asset); if (it && !it.contentDigest) it.contentDigest = digest; return rows; });
      }
    }
    for (const [i, f] of [...files].entries()) {
      if (onProgress) onProgress(i);
      try {
        const sourceDigest = await fingerprint(f), list = await userItems();
        const existing = sourceDigest && list.find((it) => it.sourceDigest === sourceDigest || it.contentDigest === sourceDigest);
        if (existing) { result.duplicates++; result.items.push({ name: f.name, status: 'duplicate', asset: existing.asset, reason: `Já existe: ${label(existing)}` }); continue; }
        const a = await RS.assets.importFile(f, 'photo');
        const rec = await RS.store.getAsset(a.id), contentDigest = await fingerprint(rec.blob), thumb = await thumbOf(a.img);
        let duplicate = null;
        await RS.store.updateLibrary((rows) => {
          duplicate = rows.find((it) => sourceDigest && it.sourceDigest === sourceDigest || contentDigest && it.contentDigest === contentDigest);
          if (!duplicate) rows.unshift({ asset: a.id, cat: cat || 'geral', thumb, addedAt: Date.now(), ...metadata({ name: String(f.name || 'Fotografia').replace(/\.[^.]+$/, ''), originalName: f.name, sourceDigest, contentDigest }) });
          return rows;
        });
        if (duplicate) { result.duplicates++; result.items.push({ name: f.name, status: 'duplicate', asset: duplicate.asset, reason: `Já existe: ${label(duplicate)}` }); }
        else { result.added++; result.items.push({ name: f.name, status: 'added', asset: a.id, reason: 'Adicionada' }); }
      } catch (err) {
        result.failed++; result.items.push({ name: f.name, status: 'failed', reason: err.message || 'Não foi possível importar este ficheiro.' });
      }
    }
    return result;
  }

  async function removeUser(asset) {
    await RS.store.updateLibrary((rows) => rows.filter((x) => x.asset !== asset));
  }

  return { index, full, fileFor, userItems, addUserPhotos, removeUser, metadata, label, filter, saveMetadata, usage };
})();
