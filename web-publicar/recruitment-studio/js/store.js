// Local storage (IndexedDB), image import and project files.
// Everything stays on this computer, in this browser's profile.
window.RS = window.RS || {};

RS.store = (() => {
  const DB_NAME = 'recruitment-studio';
  const memory = { projects: new Map(), assets: new Map(), meta: new Map() };
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
      Promise.resolve(fn(tx.objectStore(store), null)).then((v) => { result = v; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  // ---------------------------------------------------------------- projects
  const listProjects = () => run('projects', 'readonly', (s, mem) => (s ? wrap(s.getAll()) : [...mem.values()]));
  const getProject = (id) => run('projects', 'readonly', (s, mem) => (s ? wrap(s.get(id)) : mem.get(id)));
  function putProject(project, thumb) {
    return run('projects', 'readwrite', async (s, mem) => {
      const prev = s ? await wrap(s.get(project.id)) : mem.get(project.id);
      const rec = {
        id: project.id, name: project.name, updatedAt: project.updatedAt, deletedAt: project.deletedAt || null,
        template: project.template, thumb: thumb || (prev && prev.thumb) || null, data: project,
      };
      if (s) s.put(rec); else mem.set(rec.id, rec);
      return rec;
    });
  }
  const removeProject = (id) => run('projects', 'readwrite', (s, mem) => (s ? s.delete(id) : mem.delete(id)));
  async function setDeleted(id, deletedAt) {
    const rec = await getProject(id);
    if (!rec) return;
    rec.data.deletedAt = deletedAt;
    await putProject(rec.data, rec.thumb);
  }

  // ---------------------------------------------------------------- assets
  const putAsset = (a) => run('assets', 'readwrite', (s, mem) => (s ? s.put(a) : mem.set(a.id, a)));
  const getAsset = (id) => run('assets', 'readonly', (s, mem) => (s ? wrap(s.get(id)) : mem.get(id)));
  const listAssetIds = () => run('assets', 'readonly', (s, mem) => (s ? wrap(s.getAllKeys()) : [...mem.keys()]));
  const removeAsset = (id) => run('assets', 'readwrite', (s, mem) => (s ? s.delete(id) : mem.delete(id)));

  // ---------------------------------------------------------------- meta
  const getMeta = (key) => run('meta', 'readonly', (s, mem) => (s ? wrap(s.get(key)) : mem.get(key)));
  const setMeta = (key, value) => run('meta', 'readwrite', (s, mem) => (s ? s.put(value, key) : mem.set(key, value)));

  // Removes posters deleted more than a minute ago and images nobody uses.
  async function housekeeping() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const recs = await listProjects();
      const cutoff = Date.now() - 60 * 1000;
      for (const r of recs) if (r.deletedAt && r.deletedAt < cutoff) await removeProject(r.id);
      const live = (await listProjects()).filter((r) => !r.deletedAt || r.deletedAt >= cutoff);
      const used = new Set();
      for (const r of live) {
        if (r.data.photo) used.add(r.data.photo.asset);
        if (r.data.logo) used.add(r.data.logo.asset);
        if (r.data.video && r.data.video.ownSound) used.add(r.data.video.ownSound);
      }
      const brand = await getMeta('brand');
      if (brand && brand.logo) used.add(brand.logo);
      for (const it of (await getMeta('library')) || []) used.add(it.asset);
      for (const id of await listAssetIds()) if (!used.has(id)) await removeAsset(id);
    } catch (err) {
      console.warn('Housekeeping skipped', err);
    }
  }

  return {
    open, isPersistent: () => persistent, listProjects, getProject, putProject, removeProject, setDeleted,
    putAsset, getAsset, getMeta, setMeta, housekeeping,
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
      await RS.store.putAsset({ id, blob: file.slice(0, file.size, file.type), w: w0, h: h0, kind, type: file.type });
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
    await RS.store.putAsset({ id, blob, w: c.width, h: c.height, kind, type });
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
    const assets = {};
    const sound = project.video && project.video.ownSound ? { asset: project.video.ownSound } : null;
    for (const ref of [project.photo, project.logo, sound]) {
      if (!ref) continue;
      const rec = await RS.store.getAsset(ref.asset);
      if (rec) assets[rec.id] = { kind: rec.kind, w: rec.w, h: rec.h, name: rec.name, duration: rec.duration, data: await U.blobToDataURL(rec.blob) };
    }
    const json = JSON.stringify({ app: 'recruitment-studio', v: 1, savedAt: Date.now(), project, assets });
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
    const project = RS.model.normalize(parsed.project);
    const idMap = {};
    for (const [oldId, a] of Object.entries(parsed.assets || {})) {
      const blob = await U.dataURLToBlob(a.data);
      const id = U.uid();
      await RS.store.putAsset({ id, blob, w: a.w, h: a.h, kind: a.kind, type: blob.type, name: a.name, duration: a.duration });
      idMap[oldId] = id;
    }
    if (project.video.ownSound) project.video.ownSound = idMap[project.video.ownSound] || null;
    if (!project.video.ownSound && project.video.sound === 'own') project.video.sound = 'generated';
    if (project.photo) project.photo.asset = idMap[project.photo.asset] || null;
    if (project.photo && !project.photo.asset) project.photo = null;
    if (project.logo) project.logo.asset = idMap[project.logo.asset] || null;
    if (project.logo && !project.logo.asset) project.logo = null;
    // «Enquadrar»: a point follows its photo to the new id. The chosen photos (library
    // and «As minhas») are not in the file: they stay as they are on this device, so a
    // point of one of «As minhas» stays too, even when it was also the ad's photo.
    const focus = project.video.photos.focus;
    if (focus) {
      const mine = new Set(((await RS.store.getMeta('library')) || []).map((it) => it.asset));
      const out = {};
      for (const [id, f] of Object.entries(focus)) {
        if (!idMap[id] || mine.has(id)) out[id] = f;
        if (idMap[id]) out[idMap[id]] = f;
      }
      project.video.photos.focus = out;
    }
    project.id = U.uid();
    project.deletedAt = null;
    project.updatedAt = Date.now();
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

  const userItems = async () => (await RS.store.getMeta('library')) || [];

  async function thumbOf(img) {
    const k = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  }

  // Adds the person's own photos; returns how many were accepted.
  // onProgress(done) is called before each file.
  async function addUserPhotos(files, cat, onProgress) {
    const list = await userItems();
    let added = 0;
    for (const [i, f] of [...files].entries()) {
      if (onProgress) onProgress(i);
      try {
        const a = await RS.assets.importFile(f, 'photo');
        list.unshift({ asset: a.id, cat: cat || 'geral', thumb: await thumbOf(a.img), addedAt: Date.now() });
        added++;
      } catch (err) {
        console.warn('Photo skipped', f.name, err);
      }
    }
    await RS.store.setMeta('library', list);
    return added;
  }

  async function removeUser(asset) {
    await RS.store.setMeta('library', (await userItems()).filter((x) => x.asset !== asset));
  }

  return { index, full, fileFor, userItems, addUserPhotos, removeUser };
})();
