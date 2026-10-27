// Motion video renderer and the Néon style: every scene draws, texts stay in
// the Instagram safe zone, are at least 40 px, and a frame is fast enough.
(() => {
  const FORMATS = ['story', 'portrait', 'square'];
  const LONG_HEAD = 'Procuramos pedreiros, serventes, cofragistas e armadores de ferro com experiência para obras na Suíça e em Portugal já';
  const LONG_BEN = 'Alojamento pago perto da obra, transporte diário e refeições incluídas todos os dias';

  const { fakePhoto } = window.H;
  // Every motion style (the animated poster draws the still poster's layout).
  const MOTIONS = RS.motion.STYLES.filter((s) => !s.poster && !s.recipe).map((s) => s.id); // the recipes have their own checks (recipes.case.js)
  function project(kind, motion = 'neon') {
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = motion;
    p.video.bg = RS.motion.styleOf(motion).bgModes[0];
    const t = p.texts['pt-PT'];
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
    if (kind === 'minimal') {
      t.kicker = '';
      t.headline = 'Pedreiros';
      t.benefits = []; t.positions = []; t.contacts = [];
      p.whatsapp = null;
      p.offer = { ...RS.model.DEFAULT_OFFER };
    }
    if (kind === 'long') {
      t.headline = LONG_HEAD;
      t.benefits[0].text = LONG_BEN;
      t.positions = Array.from({ length: 10 }, (_, i) => RS.model.item(`Posição número ${i + 1} com experiência`));
    }
    return p;
  }
  const photosFor = (kind) => (kind === 'minimal' ? { hero: null, cards: [] } : { hero: fakePhoto(99, 1080, 1440), cards: Array.from({ length: 8 }, (_, i) => fakePhoto(i)) });
  function canvasFor(format, scale = 1) {
    const f = RS.model.FORMATS[format];
    const c = document.createElement('canvas');
    c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
    return c;
  }
  // A few pixels spread over the frame: drawing must change them.
  function drawn(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 997) if (d[i + 3] > 0 && (d[i] + d[i + 1] + d[i + 2]) > 0) lit++;
    return lit;
  }
  // Text-only layer: no text pixel above y0 or below y1.
  function textOutside(c, y0, y1) {
    const g = c.getContext('2d');
    const rows = [[0, y0], [y1, c.height]];
    for (const [a, b] of rows) {
      if (b <= a) continue;
      const d = g.getImageData(0, a, c.width, b - a).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return Math.floor(i / 4 / c.width) + a;
    }
    return -1;
  }

  test('motion: Néon is a style with the prototype colours', () => {
    const neon = RS.motion.STYLES.find((s) => s.id === 'neon');
    assert(neon, 'no neon style');
    assertEqual(neon.palette.accent, '#C6F432');
    assertEqual(neon.palette.cta, '#25D366');
    assert(neon.scenes[0] === 'hook' && neon.scenes[neon.scenes.length - 1] === 'end', 'scenes must start with hook and end with end');
  });

  test('motion: photoSet puts the ad photo first, then the trades\' library photos, at most 16', async () => {
    const p = project('full');
    const cats = p.trades.map((id) => RS.trades.get(id).photo);
    const thumb = fakePhoto(1).toDataURL('image/jpeg', 0.7);
    const items = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, cat: cats[0], thumb })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, cat: 'eletricista-x', thumb })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, cat: cats[1], thumb })),
    ];
    const hero = fakePhoto(50, 900, 1200);
    const set = await RS.motion.photoSet(p, { photo: hero }, items);
    assert(set.hero === hero, 'the ad photo is the hero');
    assert(set.cards[0] === hero, 'the ad photo is the first card');
    assertEqual(set.cards.length, 16);
    const none = await RS.motion.photoSet(RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro'] }), {}, []);
    assertEqual(none.cards.length, 0);
  });

  test('motion: every scene of every fixture and format draws', () => {
    for (const kind of ['full', 'minimal', 'long']) {
      for (const format of FORMATS) {
        const P = RS.motion.prepare(project(kind), { format, locale: 'pt-PT', photos: photosFor(kind) });
        for (const s of P.timeline.scenes) {
          const c = canvasFor(format, 0.25);
          RS.motion.render(c.getContext('2d'), P, { t: (s.start + s.end) / 2, scale: 0.25 });
          assert(drawn(c) > 20, `${kind} ${format} ${s.kind}: nothing drawn`);
        }
      }
    }
  });

  test('motion: a near-empty ad gives hook + closing card', () => {
    const P = RS.motion.prepare(project('minimal'), { format: 'story', locale: 'pt-PT', photos: photosFor('minimal') });
    assertEqual(P.timeline.scenes.map((s) => s.kind), ['hook', 'end']);
  });

  test('motion: in every style, story texts stay between y = 250 and y = 1640, at every moment', () => {
    for (const motion of MOTIONS) {
      for (const kind of ['full', 'minimal', 'long']) {
        const P = RS.motion.prepare(project(kind, motion), { format: 'story', locale: 'pt-PT', photos: photosFor(kind) });
        for (const s of P.timeline.scenes) {
          for (const t of [s.start + 0.04, s.start + 0.2, (s.start + s.end) / 2, s.end - 0.05]) {
            const c = canvasFor('story', 0.5);
            RS.motion.render(c.getContext('2d'), P, { t, scale: 0.5, layer: 'text' });
            const y = textOutside(c, 125, 820);
            assert(y < 0, `${motion} ${kind} ${s.kind} at ${t.toFixed(2)} s: text at y = ${y * 2}`);
          }
        }
      }
    }
  });

  test('motion: in every style, the person\'s texts are at least 40 px, long ones split over two beats', () => {
    for (const motion of MOTIONS) {
      for (const kind of ['full', 'long']) {
        for (const format of FORMATS) {
          const P = RS.motion.prepare(project(kind, motion), { format, locale: 'pt-PT', photos: photosFor(kind) });
          assert(P.minTextSize >= 40, `${motion} ${kind} ${format}: ${P.minTextSize.toFixed(1)} px`);
        }
      }
    }
    const P = RS.motion.prepare(project('long'), { format: 'story', locale: 'pt-PT', photos: photosFor('long') });
    const ben = P.timeline.scenes.find((s) => s.kind === 'benefit' && s.data.text === LONG_BEN);
    assert(ben, 'long benefit kept');
  });

  test('motion: a 1080 × 1920 frame renders in under 25 ms on average', () => {
    const P = RS.motion.prepare(project('full'), { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
    const c = canvasFor('story', 1);
    const ctx = c.getContext('2d', { alpha: false });
    RS.motion.render(ctx, P, { t: 0.5, scale: 1 }); // warm-up
    const n = 60;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) RS.motion.render(ctx, P, { t: (i / n) * P.timeline.duration, scale: 1 });
    ctx.getImageData(0, 0, 1, 1); // wait for the drawing to finish
    const avg = (performance.now() - t0) / n;
    assert(avg < 25, `average ${avg.toFixed(1)} ms per frame`);
  });
})();
