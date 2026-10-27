// Motion video details: photo variety, what a video leaves out, the chosen
// highlight colour, shared layers, browsers without canvas filters.
(() => {
  const { fakePhoto } = window.H;
  function project(motion, over = {}) {
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = motion;
    p.video.bg = RS.motion.styleOf(motion).bgModes[0];
    Object.assign(p.video, over);
    return p;
  }
  const photos = (n) => ({ hero: fakePhoto(90, 1080, 1440), cards: Array.from({ length: n }, (_, i) => fakePhoto(i)) });
  const pixels = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const differ = (a, b) => { const x = pixels(a), y = pixels(b); let d = 0; for (let i = 0; i < x.length; i += 4 * 37) if (Math.abs(x[i] - y[i]) > 12) d++; return d; };
  const scene = (P, kind) => P.scenes[P.timeline.scenes.findIndex((s) => s.kind === kind)];

  test('motion: a photo used again gets another crop', () => {
    const P = RS.motion.prepare(project('neon'), { format: 'story', locale: 'pt-PT', photos: photos(2) });
    assert(P.card(0) !== P.card(2), 'the same card again');
    assert(differ(P.card(0), P.card(2)) > 20, 'the repeat looks the same');
  });

  test('motion: with fewer than 4 photos the photo scenes use fewer, larger cards', () => {
    const few = RS.motion.prepare(project('neon'), { format: 'story', locale: 'pt-PT', photos: photos(2) });
    const many = RS.motion.prepare(project('neon'), { format: 'story', locale: 'pt-PT', photos: photos(8) });
    const sf = scene(few, 'sphere') || scene(few, 'fan'), sm = scene(many, 'sphere') || scene(many, 'fan');
    assert(sf && sm, 'no photo scene');
    assert(sf.cards < sm.cards, `same number of cards (${sf.cards} vs ${sm.cards})`);
    assert(sf.size > sm.size, `cards not larger (${sf.size} vs ${sm.size})`);
  });

  test('motion: leftOut says what a short video could not show', () => {
    const p = project('curto');
    p.texts['pt-PT'].positions = ['Pedreiro', 'Servente', 'Ajudante'].map((x) => RS.model.item(x));
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photos(6) });
    const shown = P.timeline.scenes.filter((s) => s.kind === 'benefit').length;
    assertEqual(RS.motion.leftOut(P), { benefits: p.texts['pt-PT'].benefits.length - shown, highlights: 0, positions: 3, intro: false, chat: false, closing: false, offer: false });
    const full = RS.motion.prepare(project('neon'), { format: 'story', locale: 'pt-PT', photos: photos(6) });
    full.content.benefits = full.content.benefits.slice(0, full.timeline.scenes.filter((s) => s.kind === 'benefit').length);
    assertEqual(RS.motion.leftOut(full).benefits, 0);
  });

  test('colours: the highlight the person chose is kept next to the readable one', () => {
    const p = project('limpo', { bg: 'light', accent: '#FFF200' });
    const C = RS.motion.colorsFor(RS.motion.styleOf('limpo'), p);
    assertEqual(C.accentChosen, '#FFF200');
    assert(C.accent !== '#FFF200', 'yellow on white was not adjusted');
    assertEqual(RS.motion.colorsFor(RS.motion.styleOf('neon'), project('neon')).accentChosen, '#C6F432');
  });

  test('motion: grain and vignette layers are shared, and old ones let go', () => {
    const prep = (motion, format) => RS.motion.prepare(project(motion), { format, locale: 'pt-PT', photos: photos(0) });
    const a = prep('neon', 'story');
    assert(prep('neon', 'story').overlays === a.overlays, 'not shared');
    for (const f of ['portrait', 'square']) prep('neon', f);
    for (const f of ['story', 'portrait', 'square']) prep('limpo', f);
    assert(prep('neon', 'story').overlays !== a.overlays, 'old layers kept for ever');
  });

  test('motion: without canvas filters (older Safari) the photo behind the hook is still soft', () => {
    const proto = CanvasRenderingContext2D.prototype;
    const real = Object.getOwnPropertyDescriptor(proto, 'filter');
    Object.defineProperty(proto, 'filter', { configurable: true, get() { return 'none'; }, set() {} });
    let P;
    try {
      P = RS.motion.prepare(project('neon'), { format: 'story', locale: 'pt-PT', photos: photos(3) });
    } finally {
      Object.defineProperty(proto, 'filter', real);
    }
    const normal = RS.motion.prepare(project('neon'), { format: 'story', locale: 'pt-PT', photos: photos(3) });
    assert(P.hero.width < normal.hero.width / 2, `not softened: ${P.hero.width} px vs ${normal.hero.width} px`);
  });
})();
