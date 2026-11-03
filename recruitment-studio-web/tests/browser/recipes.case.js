// Video recipes: the framework in RS.motion (acts, travel moves, colours,
// photos) and the checks every recipe must pass (checkRecipe).
(() => {
  const M = () => RS.model;
  // Recipes whose own file is in place (each recipe task adds its id).
  const READY = ['tijolo', 'pixel', 'planta', 'apresentacao', 'colagem', 'numeros', 'partidas', 'notificacoes', 'grua', 'contrato', 'cracha', 'fita', 'esteira', 'metade', 'stencil', 'contraste', 'bd'];

  // ---------------------------------------------------------------- fixtures
  const LONG_HEAD = 'Procuramos pedreiros, serventes, cofragistas e armadores de ferro com experiência para obras na Suíça e em Portugal já';
  const LONG_WORD = 'Bauarbeiterunterkunftsverwaltungsgesellschaft inklusive';
  function fixture(kind, motion) {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = motion;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    p.brand = { ...p.brand, name: 'Construções Exemplo' };
    const t = p.texts['pt-PT'];
    if (kind === 'minimal') {
      t.kicker = ''; t.headline = 'Pedreiros';
      t.benefits = []; t.positions = []; t.contacts = [];
      p.whatsapp = null;
      p.offer = { ...M().DEFAULT_OFFER };
    }
    if (kind === 'long') {
      t.headline = LONG_HEAD;
      t.benefits[0].text = LONG_WORD;
      t.benefits[1].text = 'Alojamento pago perto da obra, transporte diário e refeições incluídas todos os dias';
      t.positions = Array.from({ length: 10 }, (_, i) => M().item(`Posição número ${i + 1} com experiência`));
      p.offer = { salary: '1 900,50', currency: '€', period: 'month', vacancies: '10+' };
    }
    if (kind === 'longword') t.headline = LONG_WORD; // one word too long for a line at the usual sizes
    if (kind === 'no-number') p.whatsapp = null;
    if (kind === 'big') p.offer = { salary: '1.900', currency: 'CHF', period: 'month', vacancies: '250' };
    // 10–30 s videos: more benefits, highlights and positions; the video's own texts
    if (kind === 'rich' || kind === 'many') {
      const many = kind === 'many';
      t.benefits = Array.from({ length: many ? 12 : 6 }, (_, i) => M().iconItem('check', BENEFITS[i % BENEFITS.length]));
      t.positions = Array.from({ length: many ? 10 : 5 }, (_, i) => M().item(POSITIONS[i % POSITIONS.length]));
      const own = [{ id: 'own1', role: 'own', value: '40 h', label: 'por semana' }];
      if (many) own.push({ id: 'own2', role: 'own', value: '5 dias', label: 'por semana' }, { id: 'own3', role: 'own', value: '22', label: 'dias de férias' });
      p.video.texts = { 'pt-PT': { highlights: { edits: {}, added: own, order: null } } };
      if (many) {
        t.intro = 'Tem experiência em obra e procura um novo desafio?';
        p.video.show = { ...p.video.show, closing: true };
        p.video.texts['pt-PT'].closing = 'Começa já na segunda-feira';
      }
    }
    if (kind === 'texts') {
      t.headline = 'Título da imagem XYZ';
      p.video.texts = { 'pt-PT': { headline: 'Venha trabalhar connosco', cta: 'Fala comigo', hint: 'Lê o código',
        highlights: { edits: { salary: { value: '1 900,50 €' } }, added: [{ id: 'own1', role: 'own', value: 'A combinar', label: 'alojamento' }], order: null } } };
    }
    return p;
  }
  const BENEFITS = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'];
  const POSITIONS = ['Pedreiro com experiência', 'Masseiro', 'Servente de obra', 'Ajudante de pedreiro', 'Cofragista', 'Armador de ferro', 'Carpinteiro', 'Canalizador', 'Eletricista', 'Pintor'];
  const photos = () => ({ hero: null, cards: [], full: Array.from({ length: 6 }, (_, i) => H.fakePhoto(i, 600, 900)) });
  const prep = (p, format = 'story', o = {}) => RS.motion.prepare(p, { format, locale: 'pt-PT', images: {}, photos: photos(), ...o });
  function canvasFor(format, scale) {
    const f = M().FORMATS[format];
    const c = document.createElement('canvas');
    c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
    return c;
  }
  const pixel = (c, x, y) => c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;

  // ---------------------------------------------------------------- a test-only recipe
  const COLORS = { H: '#FF0000', M: '#00FF00', V: '#0000FF', D: '#FFFF00', L: '#FF00FF', C: '#00FFFF', K: '#FFFFFF', O: '#FF0000' };
  const paint = (kind) => (R) => {
    R.ctx.fillStyle = COLORS[kind]; R.ctx.fillRect(0, 0, R.P.fmt.w, R.P.fmt.h);
    if (kind === 'H' || kind === 'O') RS.motionKit.text(R, R.P.test.head, 80, 800, '#000000', 'left', 0, 'título');
  };
  function registerTest() {
    if (RS.motion.styleOf('test-recipe').id === 'test-recipe') return;
    RS.motion.register({
      id: 'test-recipe', name: 'Teste', concept: 'Só para os testes.', test: true,
      font: { head: { family: 'Barlow Condensed', weight: 800 }, bold: { family: 'Barlow Condensed', weight: 700 } },
      palettes: { dark: { bg: '#000000', ink: '#FFFFFF', main: '#3366FF', accent: '#FFCC00' } }, bgModes: ['dark'],
      photos: 0, travel: 'whip',
      prepare(P) { P.test = { head: RS.motionKit.fit(P, P.content.headline, { font: P.F.head, maxSize: 120, minSize: 60, maxW: 900, maxLines: 3 }) }; },
      acts: { H: paint('H'), M: paint('M'), V: paint('V'), D: paint('D'), L: paint('L'), C: paint('C'), K: paint('K'), O: paint('O') },
      sound: (P) => Array.from({ length: Math.round(P.timeline.duration * 2) }, (_, b) => ({ t: b * 0.5, kind: 'kick' })),
    });
  }

  // A test model with pages (10–30 s): one colour per act, half as bright on
  // every other page; no intro or closing act of its own (the defaults draw them).
  const PAGE_DARK = (hex) => `#${hex.slice(1).match(/../g).map((x) => Math.round(parseInt(x, 16) * 0.5).toString(16).padStart(2, '0')).join('')}`;
  const near = (px, hex) => { const q = RS.util.hexToRgb(hex); return Math.abs(px[0] - q.r) + Math.abs(px[1] - q.g) + Math.abs(px[2] - q.b) < 60; };
  const paintPaged = (kind) => (R, A) => {
    const pg = RS.motionKit.page(A);
    R.ctx.fillStyle = pg.index % 2 ? PAGE_DARK(COLORS[kind]) : COLORS[kind];
    R.ctx.fillRect(0, 0, R.P.fmt.w, R.P.fmt.h);
    if (kind === 'H' || kind === 'O') RS.motionKit.text(R, R.P.test.head, 80, R.P.Z.cy - R.P.test.head.vh / 2, '#000000', 'left', 0, 'título');
    if (kind === 'D') pg.items.forEach((i, j) => {
      const h = R.P.content.highlights[i];
      const L = RS.motionKit.line(null, `${h.value} ${h.label}`.trim(), { font: R.P.F.head, size: 60 });
      RS.motionKit.text(R, L, 80, R.P.Z.cy - 60 + j * 90, '#000000', 'left', 0, 'destaque');
    });
  };
  function registerPages() {
    if (RS.motion.styleOf('test-pages').id === 'test-pages') return;
    RS.motion.register({
      id: 'test-pages', name: 'Teste com páginas', concept: 'Só para os testes.', test: true, pages: true,
      font: { head: { family: 'Barlow Condensed', weight: 800 }, bold: { family: 'Barlow Condensed', weight: 700 } },
      palettes: { dark: { bg: '#000000', ink: '#FFFFFF', main: '#3366FF', accent: '#FFCC00' } }, bgModes: ['dark'],
      photos: 0, travel: 'whip', labels: { gate: { 'pt-PT': 'EMBARQUE', 'de-CH': 'EINSTIEG' } },
      prepare(P) { P.test = { head: RS.motionKit.fit(P, P.content.headline, { font: P.F.head, maxSize: 120, minSize: 60, maxW: 900, maxLines: 3 }) }; },
      acts: { H: paintPaged('H'), M: paintPaged('M'), V: paintPaged('V'), D: paintPaged('D'), L: paintPaged('L'), C: paintPaged('C'), K: paintPaged('K'), O: paintPaged('O') },
      sound: (P) => Array.from({ length: Math.round(P.timeline.duration * 2) }, (_, b) => ({ t: b * 0.5, kind: 'kick' })),
    });
  }
  registerPages();
  const richAt = (motion, duration) => { const p = fixture('rich', motion); p.video.duration = duration; return p; };

  test('framework: pages arrive in A.pages and page() splits the act', () => {
    const P = prep(richAt('test-pages', 20));
    assertEqual(P.timeline.duration, 20);
    const m = P.act('M');
    assert(m.pages.length >= 2, `${m.pages.length} pages`);
    const pg = RS.motionKit.page({ ...m, lt: 2.5 });
    assertEqual([pg.index, pg.lt, pg.count, pg.first, pg.last], [1, 0.5, m.pages.length, false, m.pages.length === 2]);
    assertEqual(pg.items, m.pages[1]);
  });

  test('framework: a page change uses the travel move unless the recipe draws it', () => {
    const P = prep(richAt('test-pages', 20));
    const m = P.act('M');
    const c = canvasFor('story', 0.25);
    RS.motion.render(c.getContext('2d'), P, { t: m.start + 2 + 0.2, scale: 0.25 });
    const left = pixel(c, c.width * 0.05, c.height * 0.5), right = pixel(c, c.width * 0.95, c.height * 0.5);
    assert(near(left, COLORS.M), `the first page should be leaving on the left: ${left}`);
    assert(near(right, PAGE_DARK(COLORS.M)), `the second page should be coming in on the right: ${right}`);
  });

  test('framework: default intro and closing acts draw the person\'s lines', () => {
    const p = fixture('rich', 'test-pages');
    p.texts['pt-PT'].intro = 'Tem experiência em obra?';
    p.video.show = { ...p.video.show, intro: true, closing: true };
    p.video.texts['pt-PT'].closing = 'Começa já na segunda-feira';
    const P = prep(p);
    for (const [kind, tag, text] of [['I', 'intro', 'Tem experiência em obra?'], ['F', 'fecho', 'Começa já na segunda-feira']]) {
      const a = P.act(kind);
      assert(a, `no ${kind} act`);
      const boxes = [];
      RS.motion.render(canvasFor('story', 0.25).getContext('2d'), P, { t: a.end - 0.1, scale: 0.25, boxes });
      assertEqual(norm(boxes.filter((b) => b.tag === tag).map((b) => b.text).join(' ')), norm(text));
    }
  });

  test('framework: flip and page travels draw both acts', () => {
    const def = RS.motion.styleOf('test-pages').recipe;
    const old = def.travel;
    try {
      for (const kind of ['flip', 'page']) {
        def.travel = kind;
        const p = fixture('full', 'test-pages');
        p.video.duration = 10;
        p.video.show = { ...p.video.show, intro: false };
        const P = prep(p);
        const a = P.acts.find((x) => !x.bespoke && x.prev);
        assert(a, 'no act entered by a travel move');
        const c = canvasFor('story', 0.25);
        RS.motion.render(c.getContext('2d'), P, { t: a.start + 0.05, scale: 0.25 });
        const early = pixel(c, c.width * 0.5, c.height * 0.5);
        RS.motion.render(c.getContext('2d'), P, { t: a.start + 0.38, scale: 0.25 });
        const late = pixel(c, c.width * 0.5, c.height * 0.5);
        assert(near(early, COLORS[a.prev]), `${kind}: the previous act is not there at the start: ${early}`);
        assert(near(late, COLORS[a.kind]), `${kind}: the new act is not there at the end: ${late}`);
      }
    } finally {
      def.travel = old;
    }
  });

  test('framework: lengths() greys what cannot be filled', () => {
    const L = RS.motion.lengths(fixture('minimal', 'test-pages'), { locale: 'pt-PT' });
    const o30 = L.options.find((x) => x.value === 30);
    assert(o30 && !o30.ok && o30.missing > 0, JSON.stringify(L.options));
    assert(L.options.find((x) => x.value === 10).ok, '10 s is always there');
    assert(L.options.some((x) => x.value === 'auto'), 'no «Automática»');
  });

  test('framework: P.label gives the model\'s word in the video\'s language', () => {
    const p = M().addLocale(fixture('full', 'test-pages'), 'de-CH', 'pt-PT');
    assertEqual(prep(p).label('gate'), 'EMBARQUE');
    assertEqual(prep(p, 'story', { locale: 'de-CH' }).label('gate'), 'EINSTIEG');
  });

  test('framework: acts become the timeline scenes and the cuts', () => {
    registerTest();
    const P = prep(fixture('full', 'test-recipe'));
    assertEqual(P.timeline.scenes.map((s) => s.kind), ['hook', 'shapes', 'volume', 'data', 'list', 'chat', 'card', 'loop']);
    assertEqual(P.timeline.cuts, [2, 4, 6, 8, 10, 12, 14]);
    assertEqual(P.timeline.duration, 15);
    assert(Array.isArray(P.timeline.synth) && P.timeline.synth.length === 30, 'synth from the recipe');
    const s = RS.motion.styleOf('test-recipe');
    assert(s.recipe && s.durations.join() === '6,10,15', 'a recipe style with three durations');
  });

  test('framework: an act that does not follow its usual act starts with the travel move', () => {
    registerTest();
    const p = fixture('full', 'test-recipe');
    p.video.duration = 10;
    const P = prep(p);
    assertEqual(P.timeline.scenes.map((s) => s.kind), ['hook', 'shapes', 'data', 'card', 'loop']);
    const d = P.timeline.scenes[2];
    const c = canvasFor('story', 0.25);
    RS.motion.render(c.getContext('2d'), P, { t: d.start + 0.2, scale: 0.25 });
    const left = pixel(c, c.width * 0.1, c.height * 0.5), right = pixel(c, c.width * 0.9, c.height * 0.5);
    assert(left[1] > 200 && left[0] < 60, `left should still be the shapes act: ${left}`);
    assert(right[0] > 200 && right[1] > 200 && right[2] < 60, `right should be the data act: ${right}`);
    RS.motion.render(c.getContext('2d'), P, { t: d.start + 0.5, scale: 0.25 });
    const mid = pixel(c, c.width * 0.1, c.height * 0.5);
    assert(mid[0] > 200 && mid[1] > 200 && mid[2] < 60, `only the data act after the move: ${mid}`);
  });

  test('framework: brand colours and the highlight follow the ad; text keeps 4.5:1', () => {
    registerTest();
    const p = fixture('full', 'test-recipe');
    p.style.primary = '#12325A'; p.style.accent = '#F2B705';
    p.video.colors = 'brand';
    let C = RS.motion.colorsFor(RS.motion.styleOf('test-recipe'), p);
    assertEqual([C.main, C.accent], ['#12325A', '#F2B705']);
    p.video.accent = '#00E5FF';
    C = RS.motion.colorsFor(RS.motion.styleOf('test-recipe'), p);
    assertEqual([C.accent, C.accentChosen], ['#00E5FF', '#00E5FF']);
    assert(RS.util.contrast(C.ink, C.bg) >= 4.5, 'ink on the background');
    assertEqual(C.cta, '#25D366');
  });

  test('framework: boxes collect the recorded texts', () => {
    registerTest();
    const P = prep(fixture('full', 'test-recipe'));
    const boxes = [];
    RS.motion.render(canvasFor('story', 0.25).getContext('2d'), P, { t: 1, scale: 0.25, boxes });
    assert(boxes.some((b) => b.tag === 'título' && /Pedreiros/i.test(b.text)), JSON.stringify(boxes.map((b) => b.text)));
    assert(boxes[0].y > 700 && boxes[0].y < 900, `box in poster pixels: ${boxes[0].y}`);
  });

  test('framework: a continuous recipe takes every act as its own (no travel move)', () => {
    registerTest();
    const def = RS.motion.styleOf('test-recipe').recipe;
    def.continuous = true;
    try {
      const p = fixture('full', 'test-recipe'); p.video.duration = 10;
      const P = prep(p);
      assert(P.acts.every((a) => a.bespoke), JSON.stringify(P.acts.map((a) => [a.kind, a.bespoke])));
    } finally { def.continuous = false; }
  });

  test('framework: a recipe counts as left out only what its acts cannot show', () => {
    registerTest();
    const p = fixture('full', 'test-recipe');
    assert(p.texts['pt-PT'].benefits.length > 3, 'the fixture needs more than three benefits');
    assertEqual(RS.motion.leftOut(prep(p)).benefits, 0); // 15 s: the three ticked ones are in the video
    p.video.duration = 6;
    assertEqual(RS.motion.leftOut(prep(p)).benefits, 3); // 6 s: no benefits act
  });

  test('styles: «Contacto no fim» and «Código QR» also act on the seven styles', () => {
    const p = fixture('full', 'neon');
    const endOf = (P) => P.timeline.scenes.findIndex((x) => x.kind === 'end');
    const endLen = (P) => { const s = P.timeline.scenes[endOf(P)]; return s.end - s.start; };
    const two = endLen(prep(p));
    p.video.hold = 4;
    const four = endLen(prep(p));
    assert(four >= 4 && four > two, `the end card lasts ${two} s with «2 s» and ${four} s with «4 s»`);
    p.video.show = { ...p.video.show, qr: false };
    const P = prep(p);
    assert(!P.scenes[endOf(P)].items.some((x) => x.kind === 'qr'), 'the QR is still on the card');
  });

  // Codex (2026-10-26): chosen photos belong to the ad even outside the library
  // (imported, removed from «As minhas»), so photoIds keeps them as chosen.
  test('photos: chosen photos stay chosen, even outside the library', () => {
    const p = fixture('full', 'neon');
    const lib = [{ id: 'p1', cat: 'pedreiro' }, { id: 's1', cat: 'servente' }, { id: 'x1', cat: 'eletricista' }];
    p.video.photos = { mode: 'chosen', ids: ['x1', 'imported'] };
    assertEqual(RS.motion.photoIds(p, lib, []), ['x1', 'imported']);
  });
  test('photos: chosen photos that cannot be loaded are left out; none left falls back to the trades', async () => {
    const real = { index: RS.library.index, full: RS.library.full, userItems: RS.library.userItems, load: RS.assets.load };
    const url = H.fakePhoto(0, 60, 90).toDataURL('image/png');
    RS.library.index = async () => ({ items: [{ id: 'p1', cat: 'pedreiro' }, { id: 's1', cat: 'servente' }, { id: 'x1', cat: 'eletricista' }] });
    RS.library.full = async () => url;
    RS.library.userItems = async () => [];
    RS.assets.load = async () => null; // every non-library id is gone
    try {
      const p = fixture('full', 'colagem');
      p.video.photos = { mode: 'chosen', ids: ['gone'] };
      assertEqual((await RS.motion.recipePhotos(p, {})).map(RS.motion.photoIdOf), ['p1', 's1']);
      p.video.photos = { mode: 'chosen', ids: ['x1', 'gone'] };
      assertEqual((await RS.motion.recipePhotos(p, {})).map(RS.motion.photoIdOf), ['x1']);
    } finally {
      RS.library.index = real.index; RS.library.full = real.full; RS.library.userItems = real.userItems; RS.assets.load = real.load;
    }
  });

  test('framework: the seven styles stay after the recipes and Néon is the fallback', () => {
    assertEqual(RS.motion.styleOf('no-such').id, 'neon');
    const ids = RS.motion.STYLES.map((s) => s.id);
    for (const id of ['neon', 'obra', 'limpo', 'cinema', 'impacto', 'curto', 'poster']) assert(ids.includes(id), id);
  });

  // ---------------------------------------------------------------- the checks of every recipe
  const FORMATS = ['story', 'portrait', 'square'];
  // Every word a video may show: the ad's texts, the functional labels, the brand.
  function corpus(p, locale = 'pt-PT') {
    const t = p.texts[locale], S = M().STOCK, o = M().offerParts(p, locale);
    const parts = [t.kicker, t.headline, t.intro, t.badge, t.positionsTitle, ...(t.benefits || []).map((b) => b.text), ...(t.positions || []).map((x) => x.text), ...(t.contacts || []).map((x) => x.text),
      p.brand.name, S.waCta[locale], S.scanHint[locale], o.period, o.word, o.amount, `${o.count} ${o.word}`, o.count,
      p.whatsapp ? RS.contact.display(p.whatsapp.country, p.whatsapp.number) : '', RS.contact.adMessage(p, locale)];
    // the model's own words (board headers, «agora», …) in this language
    const def = RS.motion.styleOf(p.video.motion).recipe || {};
    const c = RS.motionTimeline.content(p, locale);
    for (const k of Object.keys(def.labels || {})) parts.push(c.labelFor(def.id, k, def.labels[k]));
    return parts.filter(Boolean).join('\n').toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ');
  }
  const norm = (s) => String(s).toLocaleLowerCase('pt-PT').replace(/-\s*/g, '').replace(/\s+/g, ' ').trim();
  const counting = (s) => /^[\d\s.,+]*(€|chf|£)?[\d\s.,+]*$/i.test(String(s).trim());
  function wordsOk(p, boxes, locale) {
    return wordsIn(corpus(p, locale), boxes);
  }
  // 10–30 s models: the words are those of the video («Textos do vídeo», which
  // start as the image's) plus the model's own labels in that language.
  function corpusV2(p, locale, id) {
    const c = RS.motionTimeline.content(p, locale);
    const def = RS.motion.styleOf(id).recipe || {};
    const labels = Object.keys(def.labels || {}).map((k) => c.labelFor(id, k, def.labels[k]));
    const parts = [c.kicker, c.headline, c.intro, c.closing, c.positionsTitle, ...c.benefits, ...c.positions, ...c.contacts, c.brandName, c.message,
      ...c.highlights.flatMap((h) => [h.value, h.label, `${h.value} ${h.label}`]),
      c.contact && c.contact.display, c.contact && c.contact.cta, c.contact && c.contact.hint, ...labels];
    return parts.filter(Boolean).join('\n').toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ');
  }
  function wordsIn(all, boxes) {
    const flat = all.replace(/-/g, '').replace(/ /g, '');
    for (const b of boxes) {
      const s = norm(b.text);
      if (!s || counting(b.text)) continue;
      if (!all.includes(s) && !flat.includes(s.replace(/ /g, ''))) return `«${b.text}» (${b.tag}) is not the ad's text`;
    }
    return null;
  }
  function framesDiffer(a, b) {
    const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let sum = 0;
    for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    return sum / (da.length / 4) / 3;
  }
  function changed(c, bg) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const [r, g, b] = RS.util.hexToRgb(bg) ? [RS.util.hexToRgb(bg).r, RS.util.hexToRgb(bg).g, RS.util.hexToRgb(bg).b] : [0, 0, 0];
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) > 40) n++;
    return n;
  }

  function checkRecipe(id) {
    // every check first needs the recipe itself (an unknown id falls back to Néon)
    const test = (name, fn) => window.test(name, async () => { assert(RS.motion.styleOf(id).id === id && RS.motion.styleOf(id).recipe, `${id} is not a registered recipe`); await fn(); });
    test(`${id}: every act draws, in every format and duration`, () => {
      for (const kind of ['full', 'minimal']) for (const format of FORMATS) for (const duration of [6, 10, 15]) {
        const p = fixture(kind, id); p.video.duration = duration;
        const P = prep(p, format);
        for (const s of P.timeline.scenes) {
          const c = canvasFor(format, 0.2);
          RS.motion.render(c.getContext('2d'), P, { t: (s.start + s.end) / 2, scale: 0.2 });
          assert(changed(c, P.C.bg) > 8, `${kind} ${format} ${duration} s ${s.kind}: nothing drawn`);
        }
      }
    });
    test(`${id}: Story texts stay in the safe zone and are the ad's own words`, () => {
      for (const kind of ['full', 'long', 'longword', 'no-number', 'big']) for (const duration of [6, 15]) {
        const p = fixture(kind, id); p.video.duration = duration;
        const P = prep(p);
        const c = canvasFor('story', 0.2);
        for (let t = 0; t < duration; t += 0.25) {
          const boxes = [];
          RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
          for (const b of boxes) assert(b.y >= 248 && b.y + b.h <= 1642 && b.x >= -2 && b.x + b.w <= 1082, `${kind} ${duration} s at ${t.toFixed(2)} s: «${b.text}» at y ${Math.round(b.y)}–${Math.round(b.y + b.h)}, x ${Math.round(b.x)}–${Math.round(b.x + b.w)}`);
          const bad = wordsOk(p, boxes);
          assert(!bad, `${kind} ${duration} s at ${t.toFixed(2)} s: ${bad}`);
        }
      }
    });
    test(`${id}: Retrato and Quadrado texts stay inside the frame`, () => {
      for (const kind of ['full', 'long', 'longword']) for (const format of ['portrait', 'square']) {
        const P = prep(fixture(kind, id), format);
        const f = M().FORMATS[format];
        const c = canvasFor(format, 0.2);
        for (let t = 0; t < 15; t += 0.5) {
          const boxes = [];
          RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
          for (const b of boxes) assert(b.y >= 20 && b.y + b.h <= f.h - 20 && b.x >= -2 && b.x + b.w <= f.w + 2, `${kind} ${format} at ${t} s: «${b.text}» out of the frame`);
        }
      }
    });
    test(`${id}: the salary and vacancies are shown as written`, () => {
      for (const kind of ['long', 'big']) {
        const p = fixture(kind, id);
        const P = prep(p);
        const data = P.timeline.scenes.find((s) => s.kind === 'data');
        assert(data, `${kind}: no data act`);
        const seen = [];
        const c = canvasFor('story', 0.2);
        for (let t = data.start; t < data.end; t += 0.1) { const boxes = []; RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes }); seen.push(...boxes.map((b) => norm(b.text))); }
        const o = M().offerParts(p, 'pt-PT');
        assert(seen.some((s) => s.includes(norm(o.amount))), `${kind}: «${o.amount}» never shown as written (${[...new Set(seen)].join(' | ')})`);
        assert(seen.some((s) => s.includes(norm(o.count))), `${kind}: «${o.count}» never shown`);
      }
    });
    test(`${id}: texts are at least 40 px`, () => {
      for (const kind of ['full', 'long', 'longword']) for (const format of FORMATS) {
        const P = prep(fixture(kind, id), format);
        assert(P.minTextSize >= 40, `${kind} ${format}: ${P.minTextSize.toFixed(1)} px`);
      }
    });
    test(`${id}: a German video stays in the zones with its own labels`, () => {
      const p = M().addLocale(fixture('full', id), 'de-CH', 'pt-PT');
      const P = RS.motion.prepare(p, { format: 'story', locale: 'de-CH', images: {}, photos: photos() });
      const c = canvasFor('story', 0.2);
      for (let t = 0; t < P.timeline.duration; t += 0.25) {
        const boxes = [];
        RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
        for (const b of boxes) assert(b.y >= 248 && b.y + b.h <= 1642 && b.x >= -2 && b.x + b.w <= 1082, `at ${t.toFixed(2)} s: «${b.text}» at y ${Math.round(b.y)}–${Math.round(b.y + b.h)}, x ${Math.round(b.x)}–${Math.round(b.x + b.w)}`);
        const bad = wordsOk(p, boxes, 'de-CH');
        assert(!bad, `at ${t.toFixed(2)} s: ${bad}`);
      }
    });
    test(`${id}: «Código QR» off leaves the card without a QR`, () => {
      const p = fixture('full', id);
      p.video.show = { ...p.video.show, qr: false };
      const P = prep(p);
      assert(!(P.card && P.card.qr), 'a QR is laid out on the card');
      const card = P.act('K');
      const c = canvasFor('story', 0.2);
      for (let t = card.start; t < card.end; t += 0.1) {
        const boxes = [];
        RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
        assert(!boxes.some((b) => b.tag === 'aponta'), `at ${t.toFixed(1)} s the QR hint is on the card`);
      }
    });
    test(`${id}: contacts hidden in the ad stay out of the video`, () => {
      const p = fixture('no-number', id);
      p.texts['pt-PT'].contacts = [M().iconItem('phone', '+41 79 000 00 00'), M().iconItem('mail', 'emprego@exemplo.pt')];
      p.show.contacts = false;
      const P = prep(p);
      const card = P.act('K');
      const c = canvasFor('story', 0.2);
      for (let t = card.start; t < card.end; t += 0.1) {
        const boxes = [];
        RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
        const shown = boxes.find((b) => /exemplo\.pt|79 000/.test(b.text));
        assert(!shown, `at ${t.toFixed(1)} s the hidden contact «${shown && shown.text}» is on the card`);
      }
    });
    test(`${id}: the last frame is the first frame`, () => {
      for (const kind of ['full', 'minimal', 'no-number']) for (const duration of [6, 10, 15]) {
        const p = fixture(kind, id); p.video.duration = duration;
        const P = prep(p);
        const a = canvasFor('story', 0.25), b = canvasFor('story', 0.25);
        RS.motion.render(a.getContext('2d'), P, { t: 0, scale: 0.25 });
        RS.motion.render(b.getContext('2d'), P, { t: duration - 1e-4, scale: 0.25 });
        const diff = framesDiffer(a, b);
        assert(diff < 1, `${kind} ${duration} s: first and last frames differ by ${diff.toFixed(2)}`);
      }
    });
    test(`${id}: a 1080 × 1920 frame draws in under 30 ms`, () => {
      const P = prep(fixture('full', id));
      const c = canvasFor('story', 1);
      const ctx = c.getContext('2d', { alpha: false });
      const flush = () => { if (window.VideoFrame) new VideoFrame(c, { timestamp: 0 }).close(); };
      for (let i = 0; i < 15; i++) RS.motion.render(ctx, P, { t: i, scale: 1 }); // warm-up
      flush();
      const n = 45, t0 = performance.now();
      for (let i = 0; i < n; i++) { RS.motion.render(ctx, P, { t: (i / n) * 15, scale: 1 }); flush(); }
      const avg = (performance.now() - t0) / n;
      assert(avg < 30, `average ${avg.toFixed(1)} ms per frame`);
    });
    test(`${id}: a kick on every beat and peaks ≤ −1 dBFS`, async () => {
      const P = prep(fixture('full', id));
      const kicks = new Set(P.timeline.synth.filter((e) => e.kind === 'kick').map((e) => Math.round(e.t * 2)));
      for (let b = 0; b < 30; b++) assert(kicks.has(b), `no kick on beat ${b}`);
      const buf = await RS.sound.renderGenerated(P.timeline);
      let peak = 0;
      for (let ch = 0; ch < 2; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
      assert(peak <= 0.8915 && peak > 0.2, `peak ${peak}`);
    });
  }
  for (const id of READY) checkRecipe(id);
  window.checkRecipe = checkRecipe;

  // ---------------------------------------------------------------- the checks at 10–30 s (models with pages)
  // Models in READY_V2 show every benefit, highlight and position in pages and
  // last 10–30 s or «Automática» (each recipe task adds its id).
  const READY_V2 = ['test-pages', 'tijolo', 'pixel', 'planta', 'apresentacao', 'colagem', 'numeros', 'partidas', 'notificacoes', 'grua', 'contrato', 'cracha', 'fita', 'esteira', 'metade', 'stencil', 'contraste', 'bd'];
  const DURS = [10, 20, 30, 'auto'];
  function checkRecipeV2(id) {
    const test = (name, fn) => window.test(name, async () => { assert(RS.motion.styleOf(id).id === id && RS.motion.styleOf(id).recipe && RS.motion.styleOf(id).recipe.pages, `${id} is not a model with pages`); await fn(); });
    const at = (kind, d) => { const p = fixture(kind, id); p.video.duration = d; return p; };
    const inZone = (b) => b.y >= 248 && b.y + b.h <= 1642 && b.x >= -2 && b.x + b.w <= 1082;
    test(`${id}: every page of every act draws, 10–30 s`, () => {
      for (const kind of ['rich', 'minimal', 'many']) for (const format of FORMATS) for (const d of DURS) {
        const P = prep(at(kind, d), format);
        const c = canvasFor(format, 0.2);
        for (const a of P.acts) for (let pg = 0; pg < (a.pages ? a.pages.length : 1); pg++) {
          const t = a.pages ? a.start + pg * 2 + 1.0 : (a.start + a.end) / 2;
          RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2 });
          assert(changed(c, P.C.bg) > 8, `${kind} ${format} ${d}: ${a.kind} page ${pg}: nothing drawn`);
        }
      }
    });
    test(`${id}: Story texts stay in the zone and are the video's words, 10–30 s`, () => {
      for (const kind of ['rich', 'many', 'texts', 'no-number', 'longword']) for (const d of [10, 30]) {
        const p = at(kind, d);
        const P = prep(p);
        const all = corpusV2(p, 'pt-PT', id);
        const c = canvasFor('story', 0.2);
        for (let t = 0; t < P.timeline.duration; t += 0.5) {
          const boxes = [];
          RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
          for (const b of boxes) assert(inZone(b), `${kind} ${d} s at ${t.toFixed(1)} s: «${b.text}» at y ${Math.round(b.y)}–${Math.round(b.y + b.h)}, x ${Math.round(b.x)}–${Math.round(b.x + b.w)}`);
          const bad = wordsIn(all, boxes);
          assert(!bad, `${kind} ${d} s at ${t.toFixed(1)} s: ${bad}`);
        }
      }
    });
    test(`${id}: Retrato and Quadrado texts stay inside the frame at 30 s`, () => {
      for (const kind of ['rich', 'many']) for (const format of ['portrait', 'square']) {
        const P = prep(at(kind, 30), format);
        const f = M().FORMATS[format];
        const c = canvasFor(format, 0.2);
        for (let t = 0; t < P.timeline.duration; t += 0.5) {
          const boxes = [];
          RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
          for (const b of boxes) assert(b.y >= 20 && b.y + b.h <= f.h - 20 && b.x >= -2 && b.x + b.w <= f.w + 2, `${kind} ${format} at ${t} s: «${b.text}» out of the frame`);
        }
      }
    });
    test(`${id}: highlights are shown as written`, () => {
      const P = prep(at('texts', 30));
      const d = P.act('D');
      assert(d, 'no highlights act');
      const seen = [];
      const c = canvasFor('story', 0.2);
      for (let t = d.start; t < d.end; t += 0.1) { const boxes = []; RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes }); seen.push(...boxes.map((b) => norm(b.text))); }
      assert(seen.some((s) => s.includes(norm('A combinar'))), `«A combinar» never shown (${[...new Set(seen)].join(' | ')})`);
      assert(seen.some((s) => s.includes(norm('1 900,50 €'))), `«1 900,50 €» never shown as written (${[...new Set(seen)].join(' | ')})`);
    });
    test(`${id}: the video's own texts are the ones shown`, () => {
      const P = prep(at('texts', 30));
      const seen = [];
      const c = canvasFor('story', 0.2);
      for (let t = 0; t < P.timeline.duration; t += 0.25) { const boxes = []; RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes }); seen.push(...boxes.map((b) => norm(b.text))); }
      assert(!seen.some((s) => s.includes('xyz')), 'the image\'s headline is in the video');
      assert(seen.some((s) => s.includes('venha')), 'the video\'s headline never shows');
    });
    test(`${id}: texts are at least 40 px, 10–30 s`, () => {
      for (const kind of ['rich', 'many', 'longword']) for (const format of FORMATS) {
        const P = prep(at(kind, 30), format);
        assert(P.minTextSize >= 40, `${kind} ${format}: ${P.minTextSize.toFixed(1)} px`);
      }
    });
    test(`${id}: the last frame is the first frame, 10–30 s`, () => {
      for (const kind of ['rich', 'minimal', 'no-number']) for (const d of DURS) {
        const P = prep(at(kind, d));
        const a = canvasFor('story', 0.25), b = canvasFor('story', 0.25);
        RS.motion.render(a.getContext('2d'), P, { t: 0, scale: 0.25 });
        RS.motion.render(b.getContext('2d'), P, { t: P.timeline.duration - 1e-4, scale: 0.25 });
        const diff = framesDiffer(a, b);
        assert(diff < 1, `${kind} ${d}: first and last frames differ by ${diff.toFixed(2)}`);
      }
    });
    test(`${id}: a 30 s frame draws in under 30 ms`, () => {
      const P = prep(at('rich', 30));
      const c = canvasFor('story', 1);
      const ctx = c.getContext('2d', { alpha: false });
      const flush = () => { if (window.VideoFrame) new VideoFrame(c, { timestamp: 0 }).close(); };
      for (let i = 0; i < 15; i++) RS.motion.render(ctx, P, { t: i * 2, scale: 1 }); // warm-up
      flush();
      const n = 60, t0 = performance.now();
      for (let i = 0; i < n; i++) { RS.motion.render(ctx, P, { t: (i / n) * P.timeline.duration, scale: 1 }); flush(); }
      const avg = (performance.now() - t0) / n;
      assert(avg < 30, `average ${avg.toFixed(1)} ms per frame`);
    });
    test(`${id}: a kick on every beat at 30 s`, async () => {
      const P = prep(at('rich', 30));
      const kicks = new Set(P.timeline.synth.filter((e) => e.kind === 'kick').map((e) => Math.round(e.t * 2)));
      for (let b = 0; b < P.timeline.duration * 2; b++) assert(kicks.has(b), `no kick on beat ${b}`);
      const buf = await RS.sound.renderGenerated(P.timeline);
      let peak = 0;
      for (let ch = 0; ch < 2; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
      assert(peak <= 0.8915 && peak > 0.2, `peak ${peak}`);
    });
  }
  for (const id of READY_V2) checkRecipeV2(id);
  window.checkRecipeV2 = checkRecipeV2;
})();

// ---------------------------------------------------------------- Tijolo
(() => {
  const M = () => RS.model;
  const fixtureFull = () => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'tijolo';
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    return p;
  };
  test('tijolo: one lit window per vacancy (up to 24)', () => {
    for (const [count, lit] of [['12', 12], ['30', 24], ['várias', 0]]) {
      const p = fixtureFull();
      p.offer.vacancies = count;
      const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
      assertEqual(P.windows.filter((w) => w.lit >= 0).length, lit);
    }
  });
  test('tijolo: twelve benefits are all shown, page after page, inside the frame', () => {
    const p = fixtureFull();
    p.texts['pt-PT'].benefits = Array.from({ length: 12 }, (_, i) => M().iconItem('check', `Vantagem número ${i + 1}`));
    p.video.duration = 30;
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
    const m = P.act('M');
    const seen = new Set();
    const c = document.createElement('canvas'); c.width = 216; c.height = 384;
    for (let t = m.start; t < m.end; t += 0.1) {
      const boxes = [];
      RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
      for (const b of boxes) {
        if (b.tag !== 'vantagem') continue;
        assert(b.y >= 248 && b.y + b.h <= 1642 && b.x >= -2 && b.x + b.w <= 1082, `«${b.text}» out of the zone at ${t.toFixed(1)} s`);
        seen.add(b.text.toLocaleLowerCase('pt-PT'));
      }
    }
    for (let i = 1; i <= 12; i++) assert(seen.has(`vantagem número ${i}`), `«Vantagem número ${i}» never shown (${[...seen].join(' | ')})`);
  });
  test('tijolo: «Cor de destaque» colours the bricks', () => {
    const p = fixtureFull();
    p.video.accent = '#00E5FF';
    assertEqual(RS.motion.colorsFor(RS.motion.styleOf('tijolo'), p).main, '#00E5FF');
  });
  test('tijolo: a five-line headline makes five courses inside the frame', () => {
    const p = fixtureFull();
    p.texts['pt-PT'].headline = 'Procuramos pedreiros serventes cofragistas armadores de ferro e carpinteiros com experiência para obras grandes';
    for (const format of ['story', 'portrait', 'square']) {
      const P = RS.motion.prepare(p, { format, locale: 'pt-PT', images: {} });
      const courses = new Set(P.bricks.map((b) => b.course));
      assert(courses.size >= 4, `${format}: ${courses.size} courses`);
      for (const b of P.bricks) assert(b.x >= 0 && b.x + b.w <= P.fmt.w && b.y >= P.Z.top - 1 && b.y + b.h <= P.Z.bottom + 1, `${format}: brick «${b.t}» out of the zone`);
    }
  });
})();

// ---------------------------------------------------------------- Píxel
(() => {
  const M = () => RS.model;
  const fixture = () => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'pixel';
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    return p;
  };
  test('pixel: an uppercase accent keeps its mark (Õ)', () => {
    const p = fixture();
    p.brand = { ...p.brand, name: 'Õ' };
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
    const s = P.card.brand;
    assert(s, 'no brand on the card');
    // the tilde sits above the capital: some lit cells above the letter's cap line
    const capTop = s.pad + 1;
    assert(s.cells.some(([, y]) => y < capTop), 'the tilde was cut');
  });
  test('pixel: the rolling score shows at most 25 different numbers', () => {
    const P = RS.motion.prepare(fixture(), { format: 'story', locale: 'pt-PT', images: {} });
    const D = P.act('D');
    const c = document.createElement('canvas'); c.width = 216; c.height = 384;
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const boxes = [];
      RS.motion.render(c.getContext('2d'), P, { t: D.start + (i / 300) * D.d, scale: 0.2, boxes });
      for (const b of boxes) if (b.tag === 'salário') seen.add(b.text);
    }
    // (values drawn while the room scrolls are not recorded: at least one must be seen)
    assert(seen.size >= 1 && seen.size <= 26, `${seen.size} different numbers (each one is a new sprite)`);
  });
  test('pixel: everything moves in whole 6 px steps', () => {
    const P = RS.motion.prepare(fixture(), { format: 'story', locale: 'pt-PT', images: {} });
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    const ctx = c.getContext('2d');
    const rects = [];
    const real = ctx.fillRect.bind(ctx), realImg = ctx.drawImage.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { const m = ctx.getTransform(); rects.push([m.a * x + m.e, m.d * y + m.f]); real(x, y, w, h); };
    ctx.drawImage = (img, ...a) => { const m = ctx.getTransform(); if (a.length === 2) rects.push([m.a * a[0] + m.e, m.d * a[1] + m.f]); realImg(img, ...a); };
    for (const t of [0.3, 2.2, 4.6, 6.3, 8.6, 10.2, 12.4, 14.3]) RS.motion.render(ctx, P, { t, scale: 1 });
    const off = rects.filter(([x, y]) => Math.abs(x / 6 - Math.round(x / 6)) > 0.01 || Math.abs(y / 6 - Math.round(y / 6)) > 0.01);
    assert(off.length === 0, `${off.length} draws off the grid, e.g. ${JSON.stringify(off.slice(0, 3))}`);
  });
  test('pixel: the intro and the closing line are typed in pixel letters', () => {
    const p = fixture();
    p.texts['pt-PT'].intro = 'Tem experiência em obra?';
    p.video.show = { ...p.video.show, intro: true, closing: true };
    p.video.texts = { 'pt-PT': { closing: 'Começa já na segunda-feira' } };
    p.video.duration = 30;
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
    const c = document.createElement('canvas'); c.width = 216; c.height = 384;
    const ctx = c.getContext('2d');
    let smooth = 0;
    const real = ctx.fillText.bind(ctx);
    ctx.fillText = (...a) => { smooth++; real(...a); };
    for (const kind of ['I', 'F']) {
      const a = P.act(kind);
      assert(a, `no ${kind} act`);
      const boxes = [];
      for (let t = a.start + 0.45; t < a.end; t += 0.25) RS.motion.render(ctx, P, { t, scale: 0.2, boxes });
      assert(boxes.some((b) => b.tag === (kind === 'I' ? 'intro' : 'fecho')), `${kind}: the line is never shown`);
    }
    assertEqual(smooth, 0, 'smooth letters in the intro or the closing line');
  });
  test('pixel: every page change keeps the 6 px grid', () => {
    const p = fixture();
    const t = p.texts['pt-PT'];
    t.benefits = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'].map((x) => M().iconItem('check', x));
    t.positions = ['Pedreiro', 'Masseiro', 'Servente', 'Ajudante', 'Cofragista', 'Armador de ferro', 'Carpinteiro'].map((x) => M().item(x));
    p.video.texts = { 'pt-PT': { highlights: { edits: {}, added: [{ id: 'o1', role: 'own', value: '40 h', label: 'por semana' }, { id: 'o2', role: 'own', value: '22', label: 'dias de férias' }], order: null } } };
    p.video.duration = 30;
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    const ctx = c.getContext('2d');
    const rects = [];
    const real = ctx.fillRect.bind(ctx), realImg = ctx.drawImage.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { const m = ctx.getTransform(); rects.push([m.a * x + m.e, m.d * y + m.f]); real(x, y, w, h); };
    ctx.drawImage = (img, ...a) => { const m = ctx.getTransform(); if (a.length === 2) rects.push([m.a * a[0] + m.e, m.d * a[1] + m.f]); realImg(img, ...a); };
    const changes = P.acts.filter((a) => a.pages && a.pages.length > 1).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    assert(changes.length >= 3, `${changes.length} page changes`);
    for (const t0 of changes) for (const dt of [0.05, 0.15, 0.25, 0.35]) RS.motion.render(ctx, P, { t: t0 + dt, scale: 1 });
    const off = rects.filter(([x, y]) => Math.abs(x / 6 - Math.round(x / 6)) > 0.01 || Math.abs(y / 6 - Math.round(y / 6)) > 0.01);
    assert(off.length === 0, `${off.length} draws off the grid, e.g. ${JSON.stringify(off.slice(0, 3))}`);
  });
})();

// ---------------------------------------------------------------- Planta
(() => {
  const M = () => RS.model;
  test('planta: the camera never stops for more than 0.5 s outside the card', () => {
    for (const duration of [6, 10, 15]) {
      const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
      p.video.motion = 'planta'; p.video.duration = duration;
      p.whatsapp = { country: '351', number: '912345678' };
      p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
      const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
      const card = P.act('K');
      let still = 0, worst = 0, prev = P.camAt(0);
      for (let i = 1; i < Math.round(card.start * 30); i++) {
        const c = P.camAt(i / 30);
        const moved = Math.hypot((c.x - prev.x) * c.z, (c.y - prev.y) * c.z) + Math.abs(c.z - prev.z) * 1000;
        still = moved < 0.3 ? still + 1 : 0;
        worst = Math.max(worst, still);
        prev = c;
      }
      assert(worst <= 15, `${duration} s: the camera stood still for ${(worst / 30).toFixed(2)} s`);
    }
  });
  test('planta: the camera never stops for more than 0.5 s before the card at 30 s', () => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'planta'; p.video.duration = 30;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    const t = p.texts['pt-PT'];
    t.benefits = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo', 'Seguro de saúde'].map((x) => M().iconItem('check', x));
    t.positions = ['Pedreiro', 'Masseiro', 'Servente', 'Ajudante', 'Cofragista', 'Armador de ferro', 'Carpinteiro'].map((x) => M().item(x));
    p.video.texts = { 'pt-PT': { highlights: { edits: {}, added: [{ id: 'o1', role: 'own', value: '40 h', label: 'por semana' }, { id: 'o2', role: 'own', value: '22', label: 'dias de férias' }], order: null } } };
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
    assertEqual(P.timeline.duration, 30);
    // every page is a station of its own on the sheet
    const paged = P.acts.filter((a) => a.pages && a.pages.length > 1);
    assert(paged.length >= 2, 'too few acts with pages');
    for (const a of paged) for (let i = 1; i < a.pages.length; i++) {
      const c0 = P.camAt(a.start + i * 2 - 0.25), c1 = P.camAt(a.start + i * 2 + 0.6);
      assert(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 400, `${a.kind} page ${i + 1}: the camera did not travel to a new station`);
    }
    const card = P.act('K');
    let still = 0, worst = 0, prev = P.camAt(0);
    for (let i = 1; i < Math.round(card.start * 30); i++) {
      const c = P.camAt(i / 30);
      const moved = Math.hypot((c.x - prev.x) * c.z, (c.y - prev.y) * c.z) + Math.abs(c.z - prev.z) * 1000;
      still = moved < 0.3 ? still + 1 : 0;
      worst = Math.max(worst, still);
      prev = c;
    }
    assert(worst <= 15, `the camera stood still for ${(worst / 30).toFixed(2)} s`);
  });
})();

// ---------------------------------------------------------------- Apresentação
(() => {
  const M = () => RS.model;
  // the texts each act may show once its entrance is over
  const ACT_TAGS = { H: ['título', 'chamada'], I: ['intro'], M: ['título', 'vantagem'], V: ['título', 'vantagem'], D: ['salário', 'período', 'vagas', 'destaque', 'rótulo'], L: ['título vagas', 'vaga'],
    F: ['fecho'], C: ['chat-title', 'chat-number', 'chat-typing', 'chat-message'], K: ['número', 'botão', 'aponta', 'contacto', 'marca'], O: ['título'] };
  test('apresentacao: nothing is left on screen after it leaves, at 30 s', () => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'apresentacao'; p.video.duration = 30;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    const t = p.texts['pt-PT'];
    t.benefits = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'].map((x) => M().iconItem('check', x));
    t.positions = ['Pedreiro', 'Masseiro', 'Servente', 'Ajudante', 'Cofragista', 'Armador de ferro', 'Carpinteiro'].map((x) => M().item(x));
    p.video.texts = { 'pt-PT': { highlights: { edits: {}, added: [{ id: 'o1', role: 'own', value: '40 h', label: 'por semana' }, { id: 'o2', role: 'own', value: '22', label: 'dias de férias' }], order: null } } };
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
    const c = document.createElement('canvas'); c.width = 270; c.height = 480;
    const norm = (s) => String(s).toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ').trim();
    const C = P.content;
    // the words of one page: its benefits, positions or highlights
    const ofPage = (a, pg) => (a.kind === 'M' ? a.pages[pg].map((i) => C.benefits[i]) : a.kind === 'L' ? a.pages[pg].map((i) => C.positions[i])
      : a.kind === 'D' ? a.pages[pg].flatMap((i) => [C.highlights[i].value, C.highlights[i].label, `${C.highlights[i].value} ${C.highlights[i].label}`]) : null);
    const PAGE_TAGS = ['vantagem', 'vaga', 'salário', 'destaque', 'vagas', 'período', 'rótulo'];
    let pagesSeen = 0;
    for (const a of P.acts.slice(1)) {
      const n = a.pages ? a.pages.length : 1;
      if (n > 1) pagesSeen += n;
      for (let pg = 0; pg < n; pg++) for (const lt of [pg * 2 + 0.6, pg === n - 1 ? a.d - 0.05 : pg * 2 + 1.95]) {
        const boxes = [];
        RS.motion.render(c.getContext('2d'), P, { t: a.start + lt, scale: 0.25, boxes });
        const stray = boxes.filter((b) => !ACT_TAGS[a.kind].includes(b.tag));
        assert(!stray.length, `${a.name} at +${lt.toFixed(2)} s: ${stray.map((b) => `«${b.text}» (${b.tag})`).join(', ')}`);
        const own = n > 1 ? ofPage(a, pg) : null;
        if (own) for (const b of boxes.filter((x) => PAGE_TAGS.includes(x.tag))) {
          assert(own.some((w) => norm(w).includes(norm(b.text)) || norm(b.text).includes(norm(w))), `${a.name} page ${pg + 1} at +${lt.toFixed(2)} s: «${b.text}» belongs to another page`);
        }
      }
    }
    assert(pagesSeen >= 4, `${pagesSeen} pages`);
  });
  test('apresentacao: nothing is left on screen after it leaves (the list is gone before the phone)', () => {
    for (const duration of [6, 10, 15]) {
      const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
      p.video.motion = 'apresentacao'; p.video.duration = duration;
      p.whatsapp = { country: '351', number: '912345678' };
      p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
      const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {} });
      const c = document.createElement('canvas'); c.width = 270; c.height = 480;
      for (const a of P.acts.slice(1)) for (const lt of [0.6, a.d - 0.05]) {
        const boxes = [];
        RS.motion.render(c.getContext('2d'), P, { t: a.start + lt, scale: 0.25, boxes });
        const stray = boxes.filter((b) => !ACT_TAGS[a.kind].includes(b.tag));
        assert(!stray.length, `${duration} s ${a.name} at +${lt.toFixed(2)} s: ${stray.map((b) => `«${b.text}» (${b.tag})`).join(', ')}`);
      }
    }
  });
})();

// ---------------------------------------------------------------- Colagem
(() => {
  const M = () => RS.model;
  const fixture = (duration) => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'colagem'; p.video.duration = duration;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    return p;
  };
  const prep = (duration, full) => RS.motion.prepare(fixture(duration), { format: 'story', locale: 'pt-PT', images: {}, photos: { hero: null, cards: [], full } });
  const frame = (P, t) => { const c = document.createElement('canvas'); c.width = 270; c.height = 480; RS.motion.render(c.getContext('2d'), P, { t, scale: 0.25 }); return c.getContext('2d').getImageData(0, 0, 270, 480).data; };
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
  const drawn = (d, bg) => { const c = RS.util.hexToRgb(bg); let n = 0; for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i] - c.r) + Math.abs(d[i + 1] - c.g) + Math.abs(d[i + 2] - c.b) > 40) n++; return n; };
  test('colagem: the intro and the closing line are on tape over a photo', () => {
    const p = fixture(30);
    p.texts['pt-PT'].intro = 'Tem experiência em obra?';
    p.video.show = { ...p.video.show, intro: true, closing: true };
    p.video.texts = { 'pt-PT': { closing: 'Começa já na segunda-feira' } };
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {}, photos: { hero: null, cards: [], full: [] } });
    const bg = RS.util.hexToRgb(P.C.bg);
    for (const [kind, tag] of [['I', 'intro'], ['F', 'fecho']]) {
      const a = P.act(kind);
      assert(a, `no ${kind} act`);
      const d = frame(P, a.start + 1.5);
      let on = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 53) { n++; if (Math.abs(d[i] - bg.r) + Math.abs(d[i + 1] - bg.g) + Math.abs(d[i + 2] - bg.b) > 40) on++; }
      assert(on / n > 0.5, `${kind}: only ${Math.round((on / n) * 100)} % of the frame is a photo`);
      const boxes = [];
      RS.motion.render(document.createElement('canvas').getContext('2d'), P, { t: a.end - 0.1, scale: 0.25, boxes });
      assert(boxes.some((b) => b.tag === tag), `${kind}: the line is never shown`);
    }
  });
  test('colagem: every page lands on a photo (one photo and none too)', () => {
    for (const full of [[H.fakePhoto(3, 600, 900)], []]) {
      const p = fixture(30);
      const t = p.texts['pt-PT'];
      t.benefits = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'].map((x) => M().iconItem('check', x));
      t.positions = ['Pedreiro', 'Masseiro', 'Servente', 'Ajudante', 'Cofragista', 'Armador de ferro', 'Carpinteiro'].map((x) => M().item(x));
      p.video.texts = { 'pt-PT': { highlights: { edits: {}, added: [{ id: 'o1', role: 'own', value: '40 h', label: 'por semana' }, { id: 'o2', role: 'own', value: '22', label: 'dias de férias' }], order: null } } };
      const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', images: {}, photos: { hero: null, cards: [], full } });
      const bg = RS.util.hexToRgb(P.C.bg);
      let pages = 0;
      for (const a of P.acts) if (a.pages && a.pages.length > 1) for (let pg = 0; pg < a.pages.length; pg++) {
        pages++;
        const d = frame(P, a.start + pg * 2 + 0.6);
        let on = 0, n = 0;
        for (let i = 0; i < d.length; i += 4 * 53) { n++; if (Math.abs(d[i] - bg.r) + Math.abs(d[i + 1] - bg.g) + Math.abs(d[i + 2] - bg.b) > 40) on++; }
        assert(on / n > 0.5, `${full.length} photo(s), ${a.name} page ${pg + 1}: only ${Math.round((on / n) * 100)} % of the frame is a photo`);
      }
      assert(pages >= 4, `${pages} pages`);
    }
  });
  test('colagem: works with one photo and with none', () => {
    for (const full of [[H.fakePhoto(3, 600, 900)], []]) for (const duration of [6, 10, 15]) {
      const P = prep(duration, full);
      for (const s of P.timeline.scenes) assert(drawn(frame(P, (s.start + s.end) / 2), P.C.bg) > 8, `${full.length} photo(s), ${duration} s ${s.kind}: nothing drawn`);
      const d = diff(frame(P, 0), frame(P, duration - 1e-4));
      assert(d < 1, `${full.length} photo(s), ${duration} s: first and last frames differ by ${d.toFixed(2)}`);
    }
  });
  test('colagem: the push through the letter lands on the same photo', () => {
    const P = prep(15, Array.from({ length: 6 }, (_, i) => H.fakePhoto(i, 600, 900)));
    // into the headline's letter → the collage's first tile; into the cube → the numbers; the grown tile → out of the first letter
    for (const [name, t] of [['letter', P.act('M').start], ['cube', P.act('D').start], ['loop', P.act('O').start + 0.45]]) {
      const d = diff(frame(P, t - 0.004), frame(P, t + 0.004));
      assert(d < 6, `${name}: the frames before and after the push differ by ${d.toFixed(2)}`);
    }
    // and a different photo would not pass for it
    const other = diff(frame(P, P.act('M').start + 0.004), frame(P, P.act('D').start + 0.004));
    assert(other >= 6, `the photos are not told apart (${other.toFixed(2)})`);
  });
})();

// ---------------------------------------------------------------- the eight new models
(() => {
  const M = () => RS.model;
  const base = (motion, duration = 30) => {
    const p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = motion; p.video.duration = duration;
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    return p;
  };
  const prepOf = (p, format = 'story') => RS.motion.prepare(p, { format, locale: 'pt-PT', images: {}, photos: { hero: null, cards: [], full: [] } });
  const canvas = (w = 216, h = 384) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------------------------------------------------------------- Números
  test('numeros: the highlights come right after the hook', () => {
    const P = prepOf(base('numeros'));
    const after = P.acts.filter((a) => a.kind !== 'H' && a.kind !== 'I');
    assertEqual(after[0].kind, 'D');
  });
  test('numeros: «1 900,50 €» never rolls', () => {
    const p = base('numeros');
    p.offer = { salary: '1 900,50', currency: '€', period: 'month', vacancies: '' };
    const P = prepOf(p);
    const d = P.act('D');
    const c = canvas(), ctx = c.getContext('2d');
    const drawn = new Set();
    const real = ctx.fillText.bind(ctx);
    ctx.fillText = (s, ...a) => { drawn.add(String(s)); real(s, ...a); };
    for (let t = d.start; t < d.end; t += 1 / 30) RS.motion.render(ctx, P, { t, scale: 0.2 });
    const numbers = [...drawn].filter((s) => /\d/.test(s));
    assert(numbers.length && numbers.every((s) => s === '1 900,50 €'), `drawn while it should stand still: ${numbers.join(' | ')}`);
  });

  // ---------------------------------------------------------------- Partidas
  // the rows an act shows once its flaps have stopped, in order
  const rowsShown = (P, kind, tags) => {
    const a = P.act(kind), seen = [];
    const c = canvas();
    for (let t = a.start; t < a.end; t += 0.05) {
      const boxes = [];
      RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes });
      for (const b of boxes) if (tags.includes(b.tag) && !seen.some((s) => s.text === b.text && Math.abs(s.y - b.y) < 2)) seen.push(b);
    }
    return seen;
  };
  const up = (s) => s.toLocaleUpperCase('pt-PT').replace(/\s+/g, ' ').trim();
  test('partidas: every flap stops on the text as written', () => {
    const p = base('partidas');
    p.texts['pt-PT'].headline = 'Pedreiros já, obra em Lisboa';
    p.video.texts = { 'pt-PT': { highlights: { edits: { salary: { value: '1 900,50 €' } }, added: [{ id: 'o1', role: 'own', value: 'A combinar', label: 'alojamento' }], order: null } } };
    const P = prepOf(p);
    assertEqual(up(rowsShown(P, 'H', ['título']).map((b) => b.text).join(' ')), up('Pedreiros já, obra em Lisboa'));
    const values = rowsShown(P, 'D', ['salário', 'destaque', 'vagas']).map((b) => up(b.text));
    for (const v of ['1 900,50 €', 'A COMBINAR', '12']) assert(values.includes(up(v)), `«${v}» not on the board: ${values.join(' | ')}`);
  });
  test('partidas: a long benefit takes more rows, never cut', () => {
    const p = base('partidas');
    const long = 'Alojamento pago perto da obra, transporte diário e refeições incluídas todos os dias da semana';
    p.texts['pt-PT'].benefits = [M().iconItem('check', long)];
    const P = prepOf(p);
    const rows = rowsShown(P, 'M', ['vantagem']).sort((a, b) => a.y - b.y);
    assert(rows.length >= 3, `${rows.length} rows`);
    assertEqual(up(rows.map((b) => b.text).join(' ')), up(long));
    for (const b of rows) assert(b.y >= 248 && b.y + b.h <= 1642 && b.x >= -2 && b.x + b.w <= 1082, `«${b.text}» out of the zone`);
  });

  // ---------------------------------------------------------------- Notificações
  test('notificacoes: works without a photo', () => {
    const P = prepOf(base('notificacoes', 15));
    const c = canvas();
    for (const a of P.acts) {
      RS.motion.render(c.getContext('2d'), P, { t: (a.start + a.end) / 2, scale: 0.2 });
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const bg = RS.util.hexToRgb(P.C.bg);
      let on = 0;
      for (let i = 0; i < d.length; i += 4 * 17) if (Math.abs(d[i] - bg.r) + Math.abs(d[i + 1] - bg.g) + Math.abs(d[i + 2] - bg.b) > 30) on++;
      assert(on > 8, `${a.name}: nothing drawn`);
    }
    const px = c.getContext('2d').getImageData(2, 2, 1, 1).data, bg = RS.util.hexToRgb(P.C.bg);
    assert(Math.abs(px[0] - bg.r) + Math.abs(px[1] - bg.g) + Math.abs(px[2] - bg.b) < 12, `the wallpaper without a photo is not the background: ${[...px]}`);
  });
  test('notificacoes: a notification never covers the clock in the Story zone', () => {
    const p = base('notificacoes');
    const t = p.texts['pt-PT'];
    t.benefits = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'].map((x) => M().iconItem('check', x));
    t.positions = ['Pedreiro', 'Masseiro', 'Servente', 'Ajudante', 'Cofragista', 'Armador de ferro', 'Carpinteiro'].map((x) => M().item(x));
    const P = prepOf(p);
    const c = canvas();
    const at = (time) => { const boxes = []; RS.motion.render(c.getContext('2d'), P, { t: time, scale: 0.2, boxes }); return boxes; };
    const clock = at(0.2).find((b) => b.tag === 'relógio');
    assert(clock, 'no clock on the lock screen');
    const OWN = ['vantagem', 'destaque', 'salário', 'vagas', 'rótulo', 'período', 'vaga', 'título vagas', 'título', 'chamada', 'intro', 'fecho'];
    const end = P.act('C').start;
    let seen = 0;
    for (let time = 0; time < end; time += 0.25) for (const b of at(time)) {
      if (!OWN.includes(b.tag)) continue;
      seen++;
      assert(b.y >= clock.y + clock.h, `at ${time.toFixed(2)} s «${b.text}» (${b.tag}) covers the clock`);
    }
    assert(seen > 20, `${seen} notification texts seen`);
  });

  // ---------------------------------------------------------------- Grua
  const richOf = (motion) => {
    const p = base(motion);
    const t = p.texts['pt-PT'];
    t.benefits = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo', 'Seguro de saúde'].map((x) => M().iconItem('check', x));
    t.positions = ['Pedreiro', 'Masseiro', 'Servente', 'Ajudante', 'Cofragista', 'Armador de ferro', 'Carpinteiro'].map((x) => M().item(x));
    p.video.texts = { 'pt-PT': { highlights: { edits: {}, added: [{ id: 'o1', role: 'own', value: '40 h', label: 'por semana' }, { id: 'o2', role: 'own', value: '22', label: 'dias de férias' }], order: null } } };
    return p;
  };
  test('grua: every page hangs inside the frame', () => {
    for (const format of ['story', 'square']) {
      const P = prepOf(richOf('grua'), format);
      const f = M().FORMATS[format];
      const c = canvas();
      const TAGS = { M: ['vantagem'], D: ['salário', 'destaque', 'vagas'], L: ['vaga'] };
      for (const kind of ['M', 'D', 'L']) {
        const a = P.act(kind);
        assert(a, `no ${kind} act`);
        a.pages.forEach((items, pg) => {
          const boxes = [];
          RS.motion.render(c.getContext('2d'), P, { t: a.start + pg * 2 + 1.95, scale: 0.2, boxes });
          const own = boxes.filter((b) => TAGS[kind].includes(b.tag));
          assert(own.length >= items.length, `${format} ${kind} page ${pg + 1}: ${own.length} of ${items.length} pieces set down`);
          const zone = format === 'story' ? [248, 1642] : [20, f.h - 20];
          for (const b of boxes) assert(b.y >= zone[0] && b.y + b.h <= zone[1] && b.x >= -2 && b.x + b.w <= f.w + 2, `${format} ${kind} page ${pg + 1}: «${b.text}» out of the frame`);
        });
      }
    }
  });
  test('grua: more benefits, more floors', () => {
    const few = base('grua');
    few.texts['pt-PT'].benefits = few.texts['pt-PT'].benefits.slice(0, 2);
    const P2 = prepOf(few), P7 = prepOf(richOf('grua'));
    assertEqual(P2.floors.length, 2);
    assertEqual(P7.floors.length, 7);
  });

  // ---------------------------------------------------------------- Contrato
  test('contrato: every tick lands on its benefit\'s line', () => {
    const P = prepOf(richOf('contrato'));
    const a = P.act('M');
    const c = canvas();
    a.pages.forEach((items, pg) => {
      const boxes = [];
      RS.motion.render(c.getContext('2d'), P, { t: a.start + pg * 2 + 1.95, scale: 0.2, boxes });
      const ticks = boxes.filter((b) => b.tag === 'visto'), lines = boxes.filter((b) => b.tag === 'vantagem');
      assertEqual(ticks.length, items.length, `page ${pg + 1}: ticks`);
      // the tick's box and the lines of its clause overlap in height, the clause on its right
      for (const k of ticks) assert(lines.some((l) => l.y < k.y + k.h && k.y < l.y + l.h && l.x > k.x + k.w), `page ${pg + 1}: a tick at y ${Math.round(k.y)}–${Math.round(k.y + k.h)} is beside no benefit`);
    });
  });
  test('contrato: the stamp never covers the number or the QR', () => {
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const format of ['story', 'portrait', 'square']) for (const qr of [true, false]) {
      const p = base('contrato', 15);
      p.video.show = { ...p.video.show, qr };
      const P = prepOf(p, format);
      const S = P.stamp.box, Cd = P.card;
      assert(!hit(S, { x: Cd.cx - Cd.number.w / 2, y: Cd.numberY, w: Cd.number.w, h: Cd.number.vh }), `${format}${qr ? '' : ' without QR'}: the stamp covers the number`);
      if (Cd.qr) assert(!hit(S, { x: (Cd.qrCx != null ? Cd.qrCx : Cd.cx) - Cd.qr / 2, y: Cd.qrY, w: Cd.qr, h: Cd.qr }), `${format}: the stamp covers the QR`);
      const f = M().FORMATS[format];
      assert(S.x >= 0 && S.y >= 0 && S.x + S.w <= f.w && S.y + S.h <= f.h, `${format}: the stamp is out of the frame`);
    }
  });

  // ---------------------------------------------------------------- Crachá
  test('cracha: no face — the badge shows the helmet icon', () => {
    const P = prepOf(base('cracha', 15));
    assertEqual(P.recipe.photos, 0);
    const icons = [];
    const real = RS.engine.drawIcon;
    RS.engine.drawIcon = (ctx, name, ...a) => { icons.push(name); return real(ctx, name, ...a); };
    try {
      const c = canvas();
      for (let t = 0.2; t < P.act('H').end; t += 0.25) RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2 });
    } finally { RS.engine.drawIcon = real; }
    assert(icons.includes('hard-hat'), `the photo spot shows ${[...new Set(icons)].join(', ') || 'nothing'}`);
  });
  test('cracha: both sides stay readable (text recorded only when facing)', () => {
    const P = prepOf(richOf('cracha'));
    const c = canvas();
    const at = (t) => { const boxes = []; RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes }); return boxes; };
    const OWN = ['vantagem', 'destaque', 'salário', 'vagas', 'vaga', 'rótulo', 'período', 'título', 'chamada', 'marca', 'título vagas', 'função'];
    let turns = 0;
    for (const a of P.acts) if (a.pages) a.pages.forEach((items, pg) => {
      const t0 = a.start + pg * 2;
      const turning = at(t0 + 0.22).filter((b) => OWN.includes(b.tag));
      assert(!turning.length, `${a.name} page ${pg + 1}: «${turning.map((b) => b.text).join(' | ')}» recorded while the badge turns`);
      const facing = at(t0 + 1.6).filter((b) => OWN.includes(b.tag));
      assert(facing.length >= items.length, `${a.name} page ${pg + 1}: ${facing.length} texts once the badge faces us`);
      turns++;
    });
    assert(turns >= 4, `${turns} sides`);
  });

  // ---------------------------------------------------------------- Fita métrica
  test('fita: the salary reading matches the highlight as written', () => {
    for (const [salary, value, reading] of [['1900', '1900 €', '1900'], ['1 900,50', '1 900,50 €', '1 900,50 €']]) {
      const p = base('fita', 15);
      p.offer = { salary, currency: '€', period: 'month', vacancies: '' };
      const P = prepOf(p);
      const d = P.act('D');
      const boxes = [];
      RS.motion.render(canvas().getContext('2d'), P, { t: d.start + 1.95, scale: 0.2, boxes });
      const shown = boxes.find((b) => b.tag === 'salário'), under = boxes.find((b) => b.tag === 'leitura');
      assert(shown && shown.text === value, `«${value}»: the reading box says ${shown && shown.text}`);
      assert(under && under.text === reading, `«${value}»: the tape under the cursor says ${under && under.text}`);
    }
  });

  // ---------------------------------------------------------------- Esteira
  test('esteira: every box is stamped once and leaves the frame', () => {
    const P = prepOf(richOf('esteira'));
    const c = canvas();
    const at = (t) => { const boxes = []; RS.motion.render(c.getContext('2d'), P, { t, scale: 0.2, boxes }); return boxes; };
    const norm = (s) => String(s).toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ').trim();
    const C = P.content;
    let boxes = 0;
    for (const [kind, texts, tag] of [['M', C.benefits, 'vantagem'], ['L', C.positions, 'vaga']]) {
      const a = P.act(kind);
      a.pages.forEach((items, pg) => {
        boxes++;
        const t0 = a.start + pg * 2;
        const stamps = at(t0 + 1.6).filter((b) => b.tag === 'carimbo');
        assertEqual(stamps.length, 1, `${kind} page ${pg + 1}: stamps on the belt`);
        const next = t0 + 2 + 0.5;
        if (pg + 1 < a.pages.length) {
          const left = at(next).filter((b) => b.tag === tag).map((b) => norm(b.text));
          const mine = items.map((i) => norm(texts[i]));
          assert(!left.some((s) => mine.some((m) => m.includes(s))), `${kind} page ${pg + 1}: its box is still in the frame at the next page («${left.join(' | ')}»)`);
        }
      });
    }
    assert(boxes >= 4, `${boxes} boxes`);
  });
})();
