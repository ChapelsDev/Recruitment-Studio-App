// «Enquadrar»: each video photo carries its id, the video centres the point
// the person chose (video.photos.focus): in Colagem's tiles at the tile's
// centre, with no jump where a tile becomes the whole frame.
(() => {
  const M = () => RS.model;
  const MARK = { x: 0.72, y: 0.28 };
  // A grey photo with a bright green dot at (fx, fy).
  function marked(fx = MARK.x, fy = MARK.y, w = 600, h = 900) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#505050'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#00FF00'; g.beginPath(); g.arc(fx * w, fy * h, 26, 0, Math.PI * 2); g.fill();
    return c;
  }
  // Centre of the green pixels inside a rectangle of image data (null when none).
  function dot(d, W, r) {
    let sx = 0, sy = 0, n = 0;
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(d.length / 4 / W, Math.ceil(r.y + r.h)); y++) {
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.w)); x++) {
        const i = (y * W + x) * 4;
        if (d[i + 1] > 180 && d[i] < 110 && d[i + 2] < 110) { sx += x; sy += y; n++; }
      }
    }
    return n > 3 ? { x: sx / n, y: sy / n, n } : null;
  }
  const colagem = (duration = 15) => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'colagem'; p.video.duration = duration;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    p.texts['pt-PT'].benefits = [M().iconItem('check', 'Alojamento')];
    return p;
  };
  const prep = (p, full) => RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {}, photos: { hero: full[0] || null, cards: full, full } });
  const SCALE = 0.25;
  const frame = (P, t) => {
    const c = document.createElement('canvas'); c.width = 270; c.height = 480;
    RS.motion.render(c.getContext('2d'), P, { t, scale: SCALE });
    return c.getContext('2d').getImageData(0, 0, 270, 480).data;
  };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };

  test('focus: the recipes\' photos carry their ids (the ad\'s photo first)', async () => {
    const p = colagem();
    p.photo = { asset: 'own-photo', zoom: 1, fx: 0.3, fy: 0.6, flip: false };
    const own = marked();
    const full = await RS.motion.recipePhotos(p, { photo: own });
    assert(full[0] === own, 'the ad\'s photo is not first');
    assertEqual(RS.motion.photoIdOf(full[0]), 'own-photo');
    // the styles' set too: the ad's photo, then the library thumbnails by id
    const thumb = H.fakePhoto(1).toDataURL('image/jpeg', 0.7);
    const set = await RS.motion.photoSet(p, { photo: own }, [{ id: 'pedreiro-1', cat: RS.trades.get('pedreiro').photo, thumb, fy: 0.36 }]);
    assertEqual(set.cards.map((im) => RS.motion.photoIdOf(im)), ['own-photo', 'pedreiro-1']);
    assertEqual(RS.motion.photoIdOf(H.fakePhoto(2)), null);
  });

  test('focus: P.focusOf gives the person\'s point, else the ad\'s framing, a library photo\'s, else a little above the middle', () => {
    const p = colagem();
    p.photo = { asset: 'own-photo', zoom: 1, fx: 0.3, fy: 0.6, flip: false };
    const own = RS.motion.tagPhoto(marked(), 'own-photo');
    const lib = RS.motion.tagPhoto(marked(), 'lib-1', { id: 'lib-1', fy: 0.36 });
    const mine = RS.motion.tagPhoto(marked(), 'mine-1');
    const loose = H.fakePhoto(3);
    p.video.photos = { mode: 'trades', ids: [], focus: { 'mine-1': { x: 0.9, y: 0.1 } } };
    const P = prep(p, [own, lib, mine, loose]);
    assertEqual(P.focusOf(own), { x: 0.3, y: 0.6 });
    assertEqual(P.focusOf(lib), { x: 0.5, y: 0.36 });
    assertEqual(P.focusOf(mine), { x: 0.9, y: 0.1 });
    assertEqual(P.focusOf(loose), { x: 0.5, y: 0.4 });
  });

  test('focus: screenPhoto brings the point to the centre of its box; centred on the frame it draws as before', () => {
    const fmt = M().FORMATS.story;
    const W = 270, Hh = 480;
    const draw = (focus, box) => {
      const c = document.createElement('canvas'); c.width = W; c.height = Hh;
      const g = c.getContext('2d'); g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      RS.motionKit.screenPhoto(g, marked(), fmt, 0.7, 15, 0, focus, box);
      return g.getImageData(0, 0, W, Hh).data;
    };
    const box = { x: 0, y: 0, w: fmt.w / 2 - 8, h: fmt.h / 2 - 8 };
    const r = { x: 0, y: 0, w: box.w * SCALE, h: box.h * SCALE };
    const at = dot(draw(MARK, box), W, r);
    assert(at, 'the dot is not in the box');
    const cx = (box.x + box.w / 2) * SCALE, cy = (box.y + box.h / 2) * SCALE;
    assert(Math.hypot(at.x - cx, at.y - cy) < 4, `the dot is at ${at.x.toFixed(1)}, ${at.y.toFixed(1)}, not at the box's centre ${cx}, ${cy}`);
    // the frame's centre on the photo's centre: the same pixels as without a focus
    assertEqual(diff(draw({ x: 0.5, y: 0.5 }, null), draw(null, null)) < 0.01, true, 'a centred focus changes the full-frame photo');
  });

  test('focus: Colagem puts the chosen point of a photo at the centre of its tile', () => {
    const p = colagem();
    const img = RS.motion.tagPhoto(marked(), 'marked');
    const tile = { x: 0, y: 0, w: (1080 / 2 - 8) * SCALE, h: (1920 / 2 - 8) * SCALE };
    const centre = { x: tile.w / 2, y: tile.h / 2 };
    const at = (focus) => {
      p.video.photos = focus ? { mode: 'trades', ids: [], focus: { marked: focus } } : { mode: 'trades', ids: [] };
      const P = prep(p, [img]);
      const M2 = P.act('M');
      assert(M2, 'no collage');
      return dot(frame(P, M2.start + 1.42), 270, tile);
    };
    const on = at(MARK);
    assert(on, 'the chosen point is not in the first tile');
    assert(Math.hypot(on.x - centre.x, on.y - centre.y) < 6, `the chosen point is at ${on.x.toFixed(1)}, ${on.y.toFixed(1)}, not at the tile's centre ${centre.x.toFixed(1)}, ${centre.y.toFixed(1)}`);
    const off = at(null);
    assert(!off || Math.hypot(off.x - centre.x, off.y - centre.y) > 20, 'without a chosen point the dot is centred anyway: nothing tested');
  });

  test('focus: Colagem with chosen points has no jump where a tile becomes the frame', () => {
    const p = colagem();
    const pts = [[0.72, 0.28], [0.2, 0.8], [0.9, 0.1], [0.35, 0.5], [0.6, 0.65], [0.1, 0.3]];
    const full = pts.map(([x, y], i) => RS.motion.tagPhoto(H.fakePhoto(i, 600, 900), `ph${i}`));
    p.video.photos = { mode: 'trades', ids: [], focus: Object.fromEntries(pts.map(([x, y], i) => [`ph${i}`, { x, y }])) };
    const P = prep(p, full);
    const Ma = P.act('M');
    for (const [name, t] of [['letter', Ma.start], ['split 2', Ma.start + 0.5], ['split 3', Ma.start + 1.0], ['strip to cube', P.act('V').start], ['cube', P.act('D').start], ['loop', P.act('O').start + 0.45]]) {
      const d = diff(frame(P, t - 0.004), frame(P, t + 0.004));
      assert(d < 6, `${name}: the frames before and after differ by ${d.toFixed(2)}`);
    }
    const d = diff(frame(P, 0), frame(P, P.timeline.duration - 1e-4));
    assert(d < 1, `first and last frames differ by ${d.toFixed(2)}`);
  });

  // .anuncio: the file's images come back with new ids; the framing follows them
  test('focus: a saved .anuncio opened again keeps the framing of the ad\'s photo and of a chosen own photo', async () => {
    const png = await new Promise((r) => marked().toBlob(r, 'image/png'));
    const S = RS.store;
    const before = await S.getMeta('library');
    try {
      // «As minhas»: two photos on this device, one of them also the ad's photo
      for (const id of ['mine-ad', 'mine-2', 'file-ad']) await S.putAsset({ id, blob: png, w: 600, h: 900, kind: 'photo', type: 'image/png' });
      await S.setMeta('library', [{ asset: 'mine-ad', cat: 'geral', thumb: '' }, { asset: 'mine-2', cat: 'geral', thumb: '' }]);
      const round = async (p) => RS.assets.importProjectFile(new File([await RS.assets.exportProjectFile(p)], 'x.anuncio', { type: 'application/json' }));
      const p = colagem();
      p.photo = { asset: 'mine-ad', zoom: 1, fx: 0.3, fy: 0.6, flip: false };
      p.video.photos = { mode: 'chosen', ids: ['mine-ad', 'mine-2', 'pedreiro-1'], focus: { 'mine-ad': { x: 0.2, y: 0.8 }, 'mine-2': { x: 0.7, y: 0.1 }, 'pedreiro-1': { x: 0.4, y: 0.3 } } };
      const q = await round(p);
      assert(q.photo && q.photo.asset && q.photo.asset !== 'mine-ad', 'the ad\'s photo kept its old id: nothing tested');
      assertEqual(M().videoPhotoFocus(q, q.photo.asset), { x: 0.2, y: 0.8 }, 'the ad\'s photo lost its framing');
      // the chosen photos are the library's and «As minhas» on this device: as they were, with their points
      assertEqual(q.video.photos.ids, ['mine-ad', 'mine-2', 'pedreiro-1']);
      for (const id of ['mine-ad', 'mine-2', 'pedreiro-1']) assertEqual(q.video.photos.focus[id], p.video.photos.focus[id], `${id} lost its framing`);
      // an ad's photo that came from a file (not in «As minhas»): its point moves to the new id
      const f = colagem();
      f.photo = { asset: 'file-ad', zoom: 1, fx: 0.5, fy: 0.5, flip: false };
      f.video.photos = { mode: 'trades', ids: [], focus: { 'file-ad': { x: 0.9, y: 0.15 } } };
      const g = await round(f);
      assertEqual(g.video.photos.focus, { [g.photo.asset]: { x: 0.9, y: 0.15 } });
    } finally {
      await S.setMeta('library', before || []);
    }
  });
})();
