// Carousel slide mode (RS.slides): every slide is a recipe act page drawn at
// its settled instant; the carousel's own texts; blocks, order, hiding, the
// 20-slide cap; the videos stay exactly as they were.
(() => {
  const M = () => RS.model;
  const STYLES = ['tijolo', 'numeros', 'contrato', 'notificacoes', 'planta', 'apresentacao'];
  const FORMATS = ['portrait', 'square', 'feed34', 'story'];
  const L = 'pt-PT';
  const BENEFITS = ['Remuneração acima da média', 'Início imediato', 'Ferramentas e EPI fornecidos', 'Alojamento pago', 'Transporte para a obra', 'Contrato sem termo'];
  const POSITIONS = ['Pedreiro com experiência', 'Masseiro', 'Servente de obra', 'Ajudante de pedreiro', 'Cofragista', 'Armador de ferro', 'Carpinteiro', 'Canalizador', 'Eletricista', 'Pintor'];

  function fixture(kind, style) {
    let p = M().newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.whatsapp = { country: '351', number: '912345678' };
    p.offer = { ...p.offer, salary: '1900', currency: '€', period: 'month', vacancies: '12' };
    p.brand = { ...p.brand, name: 'Construções Exemplo' };
    const t = p.texts[L];
    if (kind === 'minimal') {
      t.kicker = ''; t.intro = ''; t.headline = 'Pedreiros'; t.badge = '';
      t.benefits = []; t.positions = []; t.contacts = [];
      p.whatsapp = null; p.offer = { ...M().DEFAULT_OFFER };
    }
    if (kind === 'no-number') p.whatsapp = null;
    if (kind === 'long') {
      t.headline = 'Procuramos pedreiros, serventes, cofragistas e armadores de ferro com experiência para obras na Suíça e em Portugal já';
      t.benefits[1].text = 'Alojamento pago perto da obra, transporte diário e refeições incluídas todos os dias';
      t.positions = Array.from({ length: 10 }, (_, i) => M().item(`Posição número ${i + 1} com experiência`));
    }
    if (kind === 'rich' || kind === 'huge') {
      const n = kind === 'huge' ? 45 : 6, m = kind === 'huge' ? 30 : 5;
      t.intro = 'Tem experiência em obra e procura um novo desafio?';
      t.benefits = Array.from({ length: n }, (_, i) => M().iconItem('check', `${BENEFITS[i % BENEFITS.length]}${i >= BENEFITS.length ? ` ${i}` : ''}`));
      t.positions = Array.from({ length: m }, (_, i) => M().item(`${POSITIONS[i % POSITIONS.length]}${i >= POSITIONS.length ? ` ${i}` : ''}`));
    }
    p = M().normalize(p);
    p.carousel = M().cleanCarousel({ v: 2, style, cover: 'style' }, p);
    return p;
  }
  const photos = () => ({ hero: null, cards: [], full: Array.from({ length: 3 }, (_, i) => H.fakePhoto(i, 600, 900)) });
  const prep = (p, format = 'portrait', locale = L) => RS.slides.prepare(p, { format, locale, images: {}, photos: photos() });
  function canvasFor(format, scale) {
    const f = M().FORMATS[format];
    const c = document.createElement('canvas');
    c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
    return c;
  }
  function changed(c, bg) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const q = RS.util.hexToRgb(bg) || { r: 0, g: 0, b: 0 };
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i] - q.r) + Math.abs(d[i + 1] - q.g) + Math.abs(d[i + 2] - q.b) > 40) n++;
    return n;
  }
  function share(c, test) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
    return n / (d.length / 4);
  }
  function differ(a, b) {
    const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) n++;
    return n / (da.length / 4);
  }
  const norm = (s) => String(s).toLocaleLowerCase('pt-PT').replace(/-\s*/g, '').replace(/\s+/g, ' ').trim();
  const counting = (s) => /^[\d\s.,+]*(€|chf|£)?[\d\s.,+]*$/i.test(String(s).trim());
  function corpus(p, locale, id) {
    const c = RS.motionTimeline.content(p, locale, 'carousel');
    const def = RS.motion.styleOf(id).recipe || {};
    const labels = Object.keys(def.labels || {}).map((k) => c.labelFor(id, k, def.labels[k]));
    const extra = Object.values((p.carousel.texts[locale] || {}).extra || {});
    const parts = [c.kicker, c.headline, c.intro, c.closing, c.positionsTitle, ...c.benefits, ...c.positions, ...c.contacts, c.brandName, c.message,
      ...c.highlights.flatMap((h) => [h.value, h.label, `${h.value} ${h.label}`]),
      c.contact && c.contact.display, c.contact && c.contact.cta, c.contact && c.contact.hint, ...labels, ...extra];
    return parts.filter(Boolean).join('\n').toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ');
  }
  function wordsOk(p, boxes, id, locale = L) {
    const all = corpus(p, locale, id), flat = all.replace(/-/g, '').replace(/ /g, '');
    for (const b of boxes) {
      const s = norm(b.text);
      if (!s || counting(b.text)) continue;
      if (!all.includes(s) && !flat.includes(s.replace(/ /g, ''))) return `«${b.text}» (${b.tag}) is not the ad's text`;
    }
    return null;
  }
  const draw = (P, i, scale = 0.2, boxes) => { const c = canvasFor(P.fmt.id, scale); RS.slides.render(c.getContext('2d'), P, i, { scale, boxes }); return c; };

  for (const id of STYLES) {
    test(`slides ${id}: every slide draws, in every format, with the ad's words inside the frame`, () => {
      for (const kind of ['full', 'long', 'rich']) for (const format of FORMATS) {
        const p = fixture(kind, id), P = prep(p, format), f = M().FORMATS[format];
        assert(P.slides.length >= 2, `${kind} ${format}: ${P.slides.length} slides`);
        P.slides.forEach((s, i) => {
          const boxes = [];
          const c = draw(P, i, 0.2, boxes);
          assert(changed(c, P.C.bg) > 8, `${kind} ${format} slide ${i + 1} (${s.key}): nothing drawn`);
          for (const b of boxes) assert(b.y >= 20 && b.y + b.h <= f.h - 20 && b.x >= -2 && b.x + b.w <= f.w + 2, `${kind} ${format} slide ${i + 1} (${s.key}): «${b.text}» out of the frame`);
          const bad = wordsOk(p, boxes, id);
          assert(!bad, `${kind} ${format} slide ${i + 1} (${s.key}): ${bad}`);
        });
        assert(P.minTextSize >= 40, `${kind} ${format}: text of ${P.minTextSize.toFixed(1)} px`);
      }
    });
    test(`slides ${id}: every slide is settled (every word and tick arrived, nothing moving)`, () => {
      // A slow camera push or drift is no defect in a still; words or ticks still
      // arriving, a number still rolling or a blurred move are: the texts the
      // recipe records (it records only settled, unblurred texts) are the same
      // one and a half frames earlier, and there are some.
      const def = RS.motion.styleOf(id).recipe;
      for (const kind of ['full', 'rich']) {
        const P = prep(fixture(kind, id));
        const texts = (t) => { const boxes = []; RS.motion.render(canvasFor('portrait', 0.2).getContext('2d'), P, { t, scale: 0.2, boxes }); return boxes.map((b) => `${b.tag}:${b.text}`).sort().join(' | '); };
        P.slides.forEach((s, i) => {
          if (s.t == null || (def.slideActs && def.slideActs[s.kind])) return; // drawn still by the recipe itself
          const at = texts(s.t);
          assert(at, `${kind} slide ${i + 1} (${s.key}): no settled text`);
          assertEqual(at, texts(s.t - 0.05), `${kind} slide ${i + 1} (${s.key}): its words are still arriving`);
        });
      }
    });
    test(`slides ${id}: the offer slide shows the salary and the vacancies; the contact slide the green button`, () => {
      const p = fixture('full', id), P = prep(p);
      const at = (key) => P.slides.findIndex((s) => s.key === key);
      const boxes = [];
      draw(P, at('D'), 0.25, boxes);
      const seen = boxes.map((b) => norm(b.text)).join(' | ');
      assert(seen.includes('1900'), `no salary on the offer slide (${seen})`);
      assert(seen.includes('12'), `no vacancies on the offer slide (${seen})`);
      const k = draw(P, at('K'), 0.25);
      const green = share(k, (r, g, b) => Math.abs(r - 0x25) + Math.abs(g - 0xD3) + Math.abs(b - 0x66) < 60);
      assert(green >= 0.01, `contact slide: ${(green * 100).toFixed(2)} % WhatsApp green`);
      // the QR: the contact slide with the QR differs from the same slide without it
      const q = RS.util.clone(p); q.carousel.show = { ...q.carousel.show, qr: false };
      const Q = prep(q), noQr = canvasFor('portrait', 0.25);
      RS.slides.render(noQr.getContext('2d'), Q, Q.slides.findIndex((s) => s.key === 'K'), { scale: 0.25 });
      assert(differ(k, noQr) > 0.01, 'contact slide: no QR');
    });
    test(`slides ${id}: blocks follow the content, the order and the eyes`, () => {
      const keys = (p) => RS.slides.plan(p, L).blocks.filter((b) => !b.hidden).map((b) => b.key);
      const full = fixture('full', id);
      assertEqual(keys(full).includes('V'), ['tijolo', 'numeros', 'contrato'].includes(id), 'V only in Tijolo, Números and Contrato');
      assertEqual(keys(full)[0], 'H'); assertEqual(keys(full).at(-1), 'K');
      const noNumber = keys(fixture('no-number', id));
      assert(!noNumber.includes('C') && noNumber.includes('K'), `no number: ${noNumber.join(' ')}`);
      const minimal = RS.slides.plan(fixture('minimal', id), L);
      assert(!minimal.blocks.some((b) => b.key === 'K' || b.key === 'C'), 'minimal: a contact or chat block');
      // a headline-only ad: one slide (flagged as too few), or two where the style's moment shows
      assert(minimal.slides.length >= 1 && minimal.few === (minimal.slides.length < 2), 'minimal: «few» does not match the slide count');
      const p = fixture('full', id);
      // the full key list, as «Sequência» writes it, with K and D moved up
      const natural = RS.slides.plan(p, L).blocks.map((b) => b.key);
      p.carousel.blocks = { order: ['H', 'K', 'D', ...natural.filter((k) => !['H', 'K', 'D'].includes(k))], hidden: [] };
      const ordered = RS.slides.plan(p, L).slides.map((s) => s.key);
      assertEqual(ordered.slice(0, 3), ['H', 'K', 'D']);
      p.carousel.blocks.hidden = ['D'];
      assert(!RS.slides.plan(p, L).slides.some((s) => s.key === 'D'), 'a hidden block still has slides');
    });
  }

  test('slides: never more than 20; what does not fit is named', () => {
    for (const id of STYLES) {
      const plan = RS.slides.plan(fixture('huge', id), L);
      assert(plan.slides.length <= 20, `${id}: ${plan.slides.length} slides`);
      assert(plan.left.length > 0, `${id}: nothing named as left out`);
    }
  });

  test('slides: a text slide of his own is drawn with his words', () => {
    const p = fixture('full', 'planta');
    p.carousel.extra = [{ id: 'a1' }];
    p.carousel.blocks = { order: ['H', 'x:a1', 'K'], hidden: [] };
    p.carousel.texts[L] = { ...(p.carousel.texts[L] || {}), extra: { a1: 'Começa já na segunda-feira' } };
    const P = prep(p);
    const i = P.slides.findIndex((s) => s.key === 'x:a1');
    assert(i === 1, 'the extra slide is not second');
    const boxes = [];
    draw(P, i, 0.25, boxes);
    assert(boxes.some((b) => norm(b.text).includes('começa já')), 'the extra text is not drawn');
  });

  test('slides: a tap on the cover headline names the headline', () => {
    const P = prep(fixture('full', 'apresentacao'));
    const boxes = [];
    draw(P, 0, 1, boxes);
    const head = norm(P.content.headline);
    const b = boxes.find((x) => head.includes(norm(x.text)) && norm(x.text).length > 3);
    assert(b, 'no headline box on the cover');
    assertEqual(RS.slides.hit(P, 0, b.x + b.w / 2, b.y + b.h / 2), 'headline');
  });

  test('slides: «Do anúncio» draws the poster as the cover', () => {
    const p = fixture('full', 'ad');
    p.carousel.style = 'ad';
    const P = prep(p);
    const c = draw(P, 0, 0.2);
    const poster = RS.engine.renderToCanvas(p, { format: 'portrait', locale: L, images: {}, scale: 0.2 }).canvas;
    assert(differ(c, poster) < 0.01, 'the cover is not the poster');
  });

  test('slides: Notificações without a photo has the trade drawing as wallpaper; its video keeps the plain screen', () => {
    const p = fixture('full', 'notificacoes');
    const P = RS.slides.prepare(p, { format: 'portrait', locale: L, images: {}, photos: { hero: null, cards: [], full: [] } });
    const lower = (c) => { const g = c.getContext('2d'), d = g.getImageData(0, Math.round(c.height * 0.75), c.width, Math.round(c.height * 0.2)).data, q = RS.util.hexToRgb(P.C.bg); let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - q.r) + Math.abs(d[i + 1] - q.g) + Math.abs(d[i + 2] - q.b) > 24) n++; return n / (d.length / 4); };
    const k = P.slides.findIndex((s) => s.key === 'I');
    assert(lower(draw(P, k)) > 0.01, 'no drawing on the carousel wallpaper');
    const v = fixture('full', 'notificacoes'); v.video.motion = 'notificacoes';
    const V = RS.motion.prepare(v, { format: 'portrait', locale: L, images: {}, photos: { hero: null, cards: [], full: [] } });
    const c = canvasFor('portrait', 0.2);
    RS.motion.render(c.getContext('2d'), V, { t: V.act('I').start + 1.5, scale: 0.2 });
    assert(lower(c) < 0.01, 'the video\'s screen changed');
  });

  test('slides: the videos stay exactly as they were', () => {
    for (const id of STYLES) {
      const bare = fixture('full', id); bare.video.motion = id;
      const withCarousel = RS.util.clone(bare);
      withCarousel.carousel = { ...withCarousel.carousel, style: 'numeros', bg: 'light', accent: '#FF0000', texts: { [L]: { headline: 'Só carrossel' } }, show: { benefits: false } };
      const a = RS.motion.prepare(bare, { format: 'story', locale: L, images: {}, photos: photos() });
      const b = RS.motion.prepare(withCarousel, { format: 'story', locale: L, images: {}, photos: photos() });
      for (const t of [0.5, 3, 6.5, 9, a.timeline.duration - 0.2]) {
        const ca = canvasFor('story', 0.15), cb = canvasFor('story', 0.15);
        RS.motion.render(ca.getContext('2d'), a, { t, scale: 0.15 });
        RS.motion.render(cb.getContext('2d'), b, { t, scale: 0.15 });
        assertEqual(differ(ca, cb), 0, `${id} at ${t} s: the video changed`);
      }
    }
  });
})();
