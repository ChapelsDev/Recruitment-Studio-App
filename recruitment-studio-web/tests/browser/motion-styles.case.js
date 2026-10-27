// The other motion styles and the colour options.
(() => {
  const FORMATS = ['story', 'portrait', 'square'];
  const IDS = ['neon', 'obra', 'limpo', 'cinema', 'impacto', 'curto', 'poster'];
  const { fakePhoto } = window.H;
  function project(kind, motion) {
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    const t = p.texts['pt-PT'];
    p.video.motion = motion;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
    if (kind === 'minimal') {
      t.kicker = ''; t.headline = 'Pedreiros'; t.benefits = []; t.positions = []; t.contacts = [];
      p.whatsapp = null; p.offer = { ...RS.model.DEFAULT_OFFER };
    }
    if (kind === 'long') {
      t.headline = 'Procuramos pedreiros, serventes, cofragistas e armadores de ferro com experiência para obras na Suíça e em Portugal já';
      t.benefits[0].text = 'Alojamento pago perto da obra, transporte diário e refeições incluídas todos os dias';
      t.positions = Array.from({ length: 10 }, (_, i) => RS.model.item(`Posição número ${i + 1} com experiência`));
    }
    return p;
  }
  const photosFor = (kind) => (kind === 'minimal' ? { hero: null, cards: [] } : { hero: fakePhoto(99, 1080, 1440), cards: Array.from({ length: 6 }, (_, i) => fakePhoto(i)) });
  const canvasFor = (format, scale) => {
    const f = RS.model.FORMATS[format];
    const c = document.createElement('canvas');
    c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
    return c;
  };
  const pixel = (c, x, y) => [...c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data];

  test('styles: the seven styles are there, Curto is 6 s only', () => {
    assertEqual(RS.motion.STYLES.filter((s) => !s.recipe).map((s) => s.id).sort(), [...IDS].sort());
    assertEqual(RS.motion.styleOf('curto').durations, [6]);
    assertEqual(RS.motion.styleOf('limpo').bgModes, ['light', 'dark']);
  });

  test('styles: every style, format and fixture renders every scene', () => {
    for (const id of IDS) {
      for (const kind of ['full', 'minimal', 'long']) {
        for (const format of FORMATS) {
          const P = RS.motion.prepare(project(kind, id), { format, locale: 'pt-PT', photos: photosFor(kind) });
          for (const s of P.timeline.scenes) {
            const c = canvasFor(format, 0.2);
            RS.motion.render(c.getContext('2d'), P, { t: (s.start + s.end) / 2, scale: 0.2 });
          }
        }
      }
    }
  });

  test('styles: Impacto has no photo scenes, even with photos', () => {
    const P = RS.motion.prepare(project('full', 'impacto'), { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
    const kinds = P.timeline.scenes.map((s) => s.kind);
    for (const k of ['fan', 'sphere', 'tunnel']) assert(!kinds.includes(k), `${k} in Impacto`);
  });

  test('styles: Curto makes a 6 s video whatever the duration asked', () => {
    const p = project('full', 'curto');
    p.video.duration = 15;
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
    assertEqual(P.timeline.duration, 6);
  });

  test('styles: the benefit counter counts only the benefits the video shows', () => {
    const P = RS.motion.prepare(project('full', 'curto'), { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
    const shown = P.timeline.scenes.filter((s) => s.kind === 'benefit').length;
    const i = P.timeline.scenes.findIndex((s) => s.kind === 'benefit');
    assert(shown < project('full', 'curto').texts['pt-PT'].benefits.length, 'Curto should drop benefits');
    assertEqual(P.scenes[i].index.lines[0], `01 / ${String(shown).padStart(2, '0')}`);
  });

  test('colours: «Cores da marca» tints the background with the ad\'s primary colour', () => {
    const p = project('minimal', 'neon');
    p.style.primary = '#12325A';
    p.video.colors = 'brand';
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('minimal') });
    const c = canvasFor('story', 0.25);
    RS.motion.render(c.getContext('2d'), P, { t: P.timeline.scenes[1].start + 1, scale: 0.25 });
    const [r, g, b] = pixel(c, c.width * 0.5, c.height * 0.78);
    assert(b > r + 12 && b > g, `not blue-ish: ${r},${g},${b}`);
    p.video.colors = 'style';
    const S = RS.motion.colorsFor(RS.motion.styleOf('neon'), p);
    assertEqual(S.accent, '#C6F432');
  });

  test('colours: a ready palette gives its two colours to the video', () => {
    const p = project('full', 'neon');
    const pal = RS.model.PALETTES.find((x) => x.id === 'forest');
    p.video.colors = 'forest';
    const C = RS.motion.colorsFor(RS.motion.styleOf('neon'), p);
    assertEqual(C.bg0, RS.util.normHex(pal.primary));
    assertEqual(C.accent, RS.util.ensureContrast(pal.accent, C.bg0, 4.5));
  });

  test('colours: Obra\'s caution tape follows a new highlight colour on the same canvas', () => {
    const c = canvasFor('story', 0.5);
    const ctx = c.getContext('2d');
    const p = project('minimal', 'obra');
    // Two highlights already readable on Obra's dark background (not adjusted).
    p.video.accent = '#00E5FF';
    const P1 = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('minimal') });
    RS.motion.render(ctx, P1, { t: 1, scale: 0.5 });
    p.video.accent = '#7CFF00';
    const P2 = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('minimal') });
    assertEqual(P2.C.accent, '#7CFF00');
    RS.motion.render(ctx, P2, { t: 1, scale: 0.5 });
    const y = Math.round((P2.Z.top + 34 + 14) * 0.5);
    const row = ctx.getImageData(0, y, c.width, 1).data;
    let lime = 0, cyan = 0;
    for (let i = 0; i < row.length; i += 4) {
      if (row[i] > 80 && row[i] < 170 && row[i + 1] > 190 && row[i + 2] < 70) lime++;
      if (row[i] < 60 && row[i + 1] > 170 && row[i + 2] > 190) cyan++;
    }
    assert(lime > 20, `tape not in the new colour (${lime} lime pixels)`);
    assert(cyan === 0, `tape still in the old colour (${cyan} cyan pixels)`);
  });

  test('colours: «Cor de destaque» overrides the highlight; text keeps 4.5:1', () => {
    const p = project('full', 'limpo');
    p.video.bg = 'light';
    p.video.accent = '#FFF200'; // yellow on a light background
    const C = RS.motion.colorsFor(RS.motion.styleOf('limpo'), p);
    assert(RS.util.contrast(C.ink, C.bg0) >= 4.5, 'ink on background');
    assert(RS.util.contrast(C.accent, C.bg0) >= 4.5, `accent ${C.accent} on ${C.bg0}`);
    assert(!RS.util.isDark(C.bg0), 'light background for Limpo claro');
    p.video.bg = 'dark';
    assert(RS.util.isDark(RS.motion.colorsFor(RS.motion.styleOf('limpo'), p).bg0), 'dark background for Limpo escuro');
    p.video.bg = 'light';
    assert(RS.util.isDark(RS.motion.colorsFor(RS.motion.styleOf('obra'), p).bg0), 'Obra has no light mode');
  });

  test('poster: «Cartaz animado» music is a plain beat, with no effects for cuts it does not have', () => {
    const P = RS.motion.prepare(project('full', 'poster'), { format: 'story', locale: 'pt-PT', photos: photosFor('full'), images: {} });
    assertEqual(P.timeline.cuts, []);
    assertEqual([...new Set(P.timeline.events.map((e) => e.type))], ['kick']);
    assert(P.timeline.plain === true, 'not marked plain');
  });

  test('poster: «Cartaz animado» frames are the engine\'s animated poster', () => {
    const p = project('full', 'poster');
    p.video.duration = 10;
    const P = RS.motion.prepare(p, { format: 'portrait', locale: 'pt-PT', photos: photosFor('full'), images: {} });
    assertEqual(P.timeline.duration, 10);
    const a = canvasFor('portrait', 0.3), b = canvasFor('portrait', 0.3);
    const A = RS.engine.animState({ duration: 10, style: p.video.style });
    const engineFrame = (t) => {
      A.t = t;
      const ctx = b.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = p.style.bg; ctx.fillRect(0, 0, b.width, b.height);
      RS.engine.render(ctx, p, { format: 'portrait', locale: 'pt-PT', images: {}, scale: 0.3, mode: 'export', anim: A, camera: P.posterCamera && P.posterCamera(t) });
    };
    engineFrame(0.5); RS.motion.render(a.getContext('2d'), P, { t: 0.5, scale: 0.3 }); // warm-up
    for (const t of [0.5, 2.5, 6]) {
      engineFrame(t);
      RS.motion.render(a.getContext('2d'), P, { t, scale: 0.3 });
      const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
      const db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) diff++;
      assert(diff < da.length / 4 / 1000, `${diff} pixels differ at ${t} s`);
    }
  });
  // ---------------------------------------------------------------- 10–30 s
  const rich = (motion) => {
    const p = project('full', motion);
    const t = p.texts['pt-PT'];
    t.benefits = Array.from({ length: 12 }, (_, i) => RS.model.iconItem('check', ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'][i % 6] + (i >= 6 ? ' já' : '')));
    t.positions = Array.from({ length: 10 }, (_, i) => RS.model.item(`Posição número ${i + 1}`));
    return p;
  };
  test('styles: 30 s gives more benefit and photo scenes than 15 s', () => {
    const count = (P) => P.timeline.scenes.filter((s) => s.kind === 'benefit' || ['fan', 'sphere', 'tunnel'].includes(s.kind)).length;
    for (const id of ['neon', 'obra']) {
      const p = rich(id);
      p.video.duration = 15;
      const P15 = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
      p.video.duration = 30;
      const P30 = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
      assertEqual(P30.timeline.duration, 30);
      assert(count(P30) > count(P15), `${id}: ${count(P30)} scenes at 30 s, ${count(P15)} at 15 s`);
      p.video.duration = 'auto';
      const PA = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
      assert(PA.timeline.duration >= 10 && PA.timeline.duration <= 30, `${id}: «Automática» gave ${PA.timeline.duration} s`);
    }
  });
  test('styles: the video\'s texts reach the styles', () => {
    const p = project('full', 'neon');
    p.texts['pt-PT'].headline = 'Título da imagem XYZ';
    p.video.texts = { 'pt-PT': { headline: 'Venha trabalhar connosco', cta: 'Fala comigo' } };
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
    const all = JSON.stringify(P.scenes).toLocaleLowerCase('pt-PT');
    assert(all.includes('venha') && !all.includes('xyz'), 'the video\'s headline is not the one shown');
    assert(all.includes('fala comigo'), 'the video\'s button text is not the one shown');
    const q = project('full', 'obra');
    q.whatsapp = null;
    q.video.texts = { 'pt-PT': { contacts: { edits: {}, added: [{ id: 'c9', text: 'obra@exemplo.pt' }], order: null } } };
    const Q = RS.motion.prepare(q, { format: 'story', locale: 'pt-PT', photos: photosFor('full') });
    assert(Q.contacts.includes('obra@exemplo.pt'), `the video's own contact is not on the card: ${JSON.stringify(Q.contacts)}`);
  });
  test('styles: «Cartaz animado» lasts the chosen 10–30 s', () => {
    assertEqual(RS.motion.styleOf('poster').durations, [6, 10, 15, 20, 25, 30]);
    const p = project('full', 'poster');
    p.video.duration = 30;
    const P = RS.motion.prepare(p, { format: 'portrait', locale: 'pt-PT', photos: photosFor('full'), images: {} });
    assertEqual([P.timeline.duration, P.anim.duration], [30, 30]);
    assert(P.anim.k > RS.engine.animState({ duration: 15 }).k, 'the entrances do not spread over the length');
    const c0 = P.posterCamera(0), c1 = P.posterCamera(29.9);
    assert(c1.z > c0.z, 'no slow camera move');
  });
  test('styles: lengths() for a style greys what cannot be filled', () => {
    const L = RS.motion.lengths(project('minimal', 'neon'), { locale: 'pt-PT' });
    const o30 = L.options.find((x) => x.value === 30);
    assert(o30 && !o30.ok && o30.missing > 0, JSON.stringify(L.options));
    assert(L.options.find((x) => x.value === 10).ok, '10 s is always there');
    assert(L.options.some((x) => x.value === 'auto'), 'no «Automática»');
    const R = RS.motion.lengths(rich('neon'), { locale: 'pt-PT' });
    assert(R.options.find((x) => x.value === 30).ok, `a rich ad fills 30 s: ${JSON.stringify(R.options)}`);
    assertEqual(RS.motion.lengths(project('full', 'curto'), { locale: 'pt-PT' }).options.map((x) => x.value), [6]);
  });
  test('lengths: writing the missing benefits makes a greyed length available', () => {
    for (const id of ['neon', 'obra', 'cinema', 'tijolo', 'numeros', 'esteira']) {
      const p = project('full', id);
      const t = p.texts['pt-PT'];
      t.benefits = t.benefits.slice(0, 1);
      t.positions = [];
      const L = RS.motion.lengths(p, { locale: 'pt-PT', photos: 6 });
      // a style only grows with benefits; a recipe with benefits or highlights (one page each)
      assertEqual(L.adds, RS.motion.styleOf(id).recipe ? 'items' : 'benefits');
      for (const o of L.options.filter((x) => x.value !== 'auto' && !x.ok)) {
        const q = JSON.parse(JSON.stringify(p));
        q.texts['pt-PT'].benefits.push(...Array.from({ length: o.missing }, (_, i) => RS.model.iconItem('check', `Vantagem extra ${i + 1}`)));
        const M = RS.motion.lengths(q, { locale: 'pt-PT', photos: 6 });
        assert(M.options.find((x) => x.value === o.value).ok, `${id}: ${o.missing} more benefits do not reach ${o.value} s (max ${M.max} s)`);
      }
      assert(L.options.some((x) => !x.ok), `${id}: the test ad fills every length`);
    }
  });
  test('poster: the slow push-in never takes a text out of the zones', () => {
    const sx = (r, z, c) => c + (r - c) * z;
    for (const tpl of RS.templates.list) {
      for (const format of ['story', 'portrait', 'square']) {
        const p = RS.model.newProject(tpl, { trades: ['pedreiro', 'servente'] });
        p.whatsapp = { country: '351', number: '912345678' };
        p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
        p.format = format;
        p.video.motion = 'poster'; p.video.duration = 30;
        const P = RS.motion.prepare(p, { format, locale: 'pt-PT', images: {} });
        const f = RS.model.FORMATS[format];
        const top = format === 'story' ? RS.engine.SAFE.top : 0, bottom = format === 'story' ? f.h - RS.engine.SAFE.bottom : f.h;
        const c = document.createElement('canvas'); c.width = 54; c.height = 96;
        const { regions } = RS.engine.render(c.getContext('2d'), p, { format, locale: 'pt-PT', images: {}, scale: 0.05, mode: 'export' });
        const cam = P.posterCamera(30);
        const z = cam.z, ax = cam.ax != null ? cam.ax : f.w / 2, ay = cam.ay != null ? cam.ay : f.h / 2;
        // the push-in stays where the poster leaves room (a Story poster that fills its zones stands still)
        if (format === 'portrait' && tpl.id === 'diagonal') assert(z > 1.05, `${tpl.id} ${format}: no push-in left (z ${z})`);
        for (const g of regions) {
          if (g.key === 'photo' || g.y < top - 0.5 || g.y + g.h > bottom + 0.5 || g.x < -0.5 || g.x + g.w > f.w + 0.5) continue;
          const y0 = sx(g.y, z, ay), y1 = sx(g.y + g.h, z, ay), x0 = sx(g.x, z, ax), x1 = sx(g.x + g.w, z, ax);
          assert(y0 >= top - 0.5 && y1 <= bottom + 0.5 && x0 >= -0.5 && x1 <= f.w + 0.5,
            `${tpl.id} ${format}: «${g.key}» leaves the zone at the end of the push-in (z ${z.toFixed(3)}: ${Math.round(y0)}–${Math.round(y1)})`);
        }
      }
    }
  });
})();
