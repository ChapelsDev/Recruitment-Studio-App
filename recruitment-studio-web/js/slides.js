// Carousel slides: the video recipes in «slide mode». A carousel is a list of
// blocks (the recipe's acts: H cover, D offer, I intro, M benefits, L
// positions, V the style's moment, C chat, F closing, K contact, plus the
// person's own text slides); each block gives one slide per page. Every slide
// is the recipe's own drawing of that act page at its settled instant (or the
// recipe's still drawing for it, def.slideActs). The carousel's texts follow
// the ad until changed (RS.motionTimeline.content(..., 'carousel')).
window.RS = window.RS || {};

RS.slides = (() => {
  const M = RS.model;
  const PAGE_S = 2; // one act page = one slide (RS.motionKit's page length)
  const MAX_SLIDES = 20; // Instagram's limit
  // items per slide: the recipes' normal page sizes; a list of positions takes
  // fewer lines on the shorter formats
  const PER_PAGE = { M: 3, D: 2, L: 5 };
  const L_PER_FORMAT = { story: 5, portrait: 4, feed34: 4, square: 3 };
  const perPage = (format) => ({ ...PER_PAGE, L: L_PER_FORMAT[format] || 4 });
  const MIDDLE = ['M', 'V', 'D', 'L', 'C', 'F'];
  const MULTI = ['M', 'L', 'D'];
  // seconds of a one-page act before its still instant: long enough for its
  // own entrance (typing, a stamp, a counter) to finish
  const ONE_PAGE_S = { H: 4, I: 3, V: 4, C: 4, F: 3, K: 4 };
  // a list's last page stays longer: its last item finishes arriving (a page
  // can only end on time when another page follows)
  const LAST_PAGE_TAIL = 1.5;

  const styleFor = (project) => RS.motion.styleOf(M.carouselRecipe(project));
  const carousel = (project) => project.carousel || M.DEFAULT_CAROUSEL;
  function spread(n, pages) {
    const out = [];
    let at = 0;
    for (let p = 0; p < pages; p++) {
      const size = Math.floor(n / pages) + (p < n % pages ? 1 : 0);
      out.push(Array.from({ length: size }, (_, i) => at + i));
      at += size;
    }
    return out;
  }
  // A block's eye (project.show on the image, project.carousel.show here): a
  // block whose eye is off is a hidden row, never a missing one.
  const BLOCK_EYE = { I: 'intro', M: 'benefits', D: 'highlights', L: 'positions', C: 'chat', K: 'contacts' };
  const eyeOff = (project, key) => !!BLOCK_EYE[key] && !RS.motionTimeline.eye(project, BLOCK_EYE[key], 'carousel');
  // The blocks this carousel can show, in the style's own order (counted with
  // every eye open).
  function available(project, locale, def) {
    const cs = carousel(project);
    const open = { ...project, carousel: { ...cs, show: { ...(cs.show || {}), ...Object.fromEntries(Object.values(BLOCK_EYE).map((k) => [k, true])) } } };
    const c = RS.motionTimeline.content(open, locale, 'carousel');
    const n = { M: c.benefits.length, D: c.highlights.length, L: c.positions.length };
    const has = {
      H: true, D: n.D > 0, I: !!c.intro, M: n.M > 0, L: n.L >= 2,
      V: !!(def.slides && def.slides.V), C: !!(c.contact && c.chat), F: !!c.closing, K: !!c.contact || c.contacts.length > 0,
    };
    for (const [k, needs] of Object.entries(def.needs || {})) if (!needs.every((x) => has[x])) has[k] = false;
    const order = ['H', ...(has.I ? ['I'] : []), ...(def.order || MIDDLE).filter((k) => MIDDLE.includes(k)), 'K'];
    return { c, n, has, order: order.filter((k, i) => order.indexOf(k) === i) };
  }

  // The blocks, their slides (≤ 20) and what did not fit. `few`: fewer than
  // two slides (Instagram needs at least two).
  function plan(project, locale, format) {
    const style = styleFor(project), def = style.recipe || {};
    const cs = carousel(project);
    const PER = perPage(format || cs.format);
    const { n, has, order: natural } = available(project, locale, def);
    const extras = (cs.extra || []).map((x) => `x:${x.id}`);
    const known = [...natural.filter((k) => has[k]), ...extras];
    const chosen = (cs.blocks && cs.blocks.order) || [];
    // the person's order; a block that appears later (an intro written, a number
    // added…) goes to its natural place — before the next block that follows it
    // in the style's order, and never after «Contacto»
    const ordered = chosen.filter((k) => known.includes(k));
    for (const k of known) {
      if (ordered.includes(k)) continue;
      let at = ordered.findIndex((x) => !x.startsWith('x:') && known.indexOf(x) > known.indexOf(k));
      if (at < 0) at = ordered.indexOf('K');
      ordered.splice(at < 0 ? ordered.length : at, 0, k);
    }
    const hidden = new Set((cs.blocks && cs.blocks.hidden) || []);
    const pagesOf = (k) => (PER[k] ? Math.max(1, Math.ceil(n[k] / PER[k])) : 1);
    const blocks = ordered.map((key) => {
      const x = key.startsWith('x:');
      return { key, kind: x ? 'X' : key, label: x ? 'Diapositivo de texto' : M.CAROUSEL_BLOCK_LABELS[key], hidden: hidden.has(key) || eyeOff(project, key), eye: BLOCK_EYE[key] || null, pages: pagesOf(key) };
    });
    // more than 20: the longest lists give up their last pages first; the contact stays
    const shown = blocks.filter((b) => !b.hidden);
    const pages = Object.fromEntries(shown.map((b) => [b.key, b.pages]));
    const left = [];
    let total = shown.reduce((a, b) => a + pages[b.key], 0);
    while (total > MAX_SLIDES) {
      const k = MULTI.filter((x) => pages[x] > 1).sort((a, b) => pages[b] - pages[a])[0];
      const drop = k || [...shown].reverse().map((b) => b.key).find((x) => x !== 'K' && x !== 'H' && pages[x] > 0);
      if (!drop) break;
      pages[drop]--;
      total--;
    }
    for (const b of shown) {
      const items = PER[b.key] ? n[b.key] : 1;
      const kept = PER[b.key] ? Math.min(items, pages[b.key] * PER[b.key]) : pages[b.key] ? 1 : 0;
      if (kept < items) left.push({ key: b.key, label: b.label, count: items - kept });
    }
    const slides = [];
    for (const b of shown) for (let p = 0; p < pages[b.key]; p++) slides.push({ key: b.key, kind: b.kind, page: p, pages: pages[b.key] });
    return { blocks, slides, left, few: slides.length < 2, pagesOf: pages, counts: n, perPage: PER };
  }

  // The carousel's photos: its style's own choice (the trades' or «Escolher»), taken
  // as the video's recipes take them; none for a style without photos. The stage
  // and the export both use these (preview pixels = exported pixels).
  function photos(project, images) {
    const def = styleFor(project).recipe;
    if (!def || !def.photos || !RS.motion.recipePhotos) return Promise.resolve([]);
    return RS.motion.recipePhotos({ ...project, video: { ...project.video, photos: carousel(project).photos } }, images || {}, def.photos).catch(() => []);
  }

  // Lays the slides out as acts (one 2 s page per slide) and prepares the recipe.
  function prepare(project, o = {}) {
    const locale = o.locale || project.locale;
    const format = o.format || carousel(project).format;
    const style = styleFor(project);
    const pl = plan(project, locale, format);
    const PER = pl.perPage;
    // the acts in the slides' order; the recipe's showpiece (V) and its loop
    // (O) are there even when they are no slide, as the recipes expect them
    const def = style.recipe;
    const kinds = [];
    for (const s of pl.slides) if (s.kind !== 'X' && !kinds.includes(s.kind)) kinds.push(s.kind);
    const needsV = Object.entries(def.needs || {}).filter(([k]) => k === 'V').every(([, needs]) => needs.every((x) => kinds.includes(x) || (x === 'M' && pl.counts.M > 0)));
    if (!kinds.includes('V') && needsV) {
      const after = kinds.indexOf('M');
      kinds.splice(after >= 0 ? after + 1 : Math.max(1, kinds.indexOf('K')), 0, 'V');
    }
    kinds.push('O');
    const acts = [];
    let at = 0;
    for (const kind of kinds) {
      const count = pl.pagesOf[kind] || 1;
      const items = PER[kind] ? spread(Math.min(pl.counts[kind], count * PER[kind]), count) : null;
      const d = kind === 'O' ? 1 : PER[kind] ? count * PAGE_S + LAST_PAGE_TAIL : ONE_PAGE_S[kind] || PAGE_S;
      const a = { kind, beats: Math.round(d * 2), start: at, end: at + d };
      if (items) a.pages = items;
      else if (!['H', 'K', 'O'].includes(kind)) a.pages = [[]];
      acts.push(a);
      at = a.end;
    }
    const slideOf = pl.slides.map((s) => {
      if (s.kind === 'X') return { ...s, t: null };
      const a = acts.find((x) => x.kind === s.kind);
      const end = PER[s.kind] && s.page < s.pages - 1 ? a.start + (s.page + 1) * PAGE_S : a.end;
      // the still instant: just before the page ends, or before the recipe's own
      // move to the next station (def.slideLead, a continuous camera)
      return { ...s, t: end - (def.slideLead || 1 / 30) };
    });
    const P = RS.motion.prepareRecipe(project, { format, locale, images: o.images || {}, photos: o.photos, lite: o.lite, piece: 'carousel', acts }, style);
    // the person's own text slides: the default intro line, his words
    const texts = ((carousel(project).texts || {})[locale] || {}).extra || {};
    for (const s of slideOf) {
      if (s.kind !== 'X') continue;
      const words = String(texts[s.key.slice(2)] || '').trim();
      P[`${s.key}L`] = words ? RS.motionKit.fit(P, words, { font: P.F.head, upper: false, maxSize: 96, minSize: 48, maxW: P.Z.w, maxLines: 6, lh: 1.1, maxH: P.Z.cH * 0.8 }) : null;
    }
    P.slides = slideOf;
    P.slidePlan = pl;
    P.slideCover = M.carouselCover(project);
    return P;
  }

  const SETTLED = 99; // seconds into a line act: every word has arrived
  function render(ctx, P, index, o = {}) {
    const s = P.slides[index];
    if (!s) return;
    const scale = o.scale || 1;
    if (index === 0 && s.kind === 'H' && P.slideCover === 'poster' && RS.engine) {
      const r = RS.engine.renderToCanvas(P.project, { format: P.fmt.id, locale: P.locale, images: P.images, scale });
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(r.canvas, 0, 0); ctx.restore();
      if (o.regions) o.regions.push(...(r.regions || []));
      return;
    }
    if (s.kind === 'X') {
      RS.motion.render(ctx, P, { t: 0, scale, boxes: o.boxes, draw: (R) => RS.motion.lineAct(`${s.key}L`, 'texto')(R, { lt: SETTLED }) });
      return;
    }
    const own = P.recipe.slideActs && P.recipe.slideActs[s.kind];
    RS.motion.render(ctx, P, { t: s.t, scale, boxes: o.boxes, draw: own || undefined });
  }

  // The content key under a point of a slide (1080-px coordinates), for a tap.
  const norm = (x) => String(x || '').toLocaleLowerCase('pt-PT').replace(/\s+/g, ' ').trim();
  function hit(P, index, x, y) {
    const s = P.slides[index];
    if (!s) return null;
    const c = document.createElement('canvas');
    c.width = P.fmt.w; c.height = P.fmt.h;
    const boxes = [], regions = [];
    render(c.getContext('2d'), P, index, { scale: 1, boxes, regions });
    const inside = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    const region = regions.filter(inside).pop();
    if (region) return region.key;
    const box = boxes.filter(inside).pop();
    if (!box) return null;
    if (s.kind === 'X') return s.key;
    const t = norm(box.text), C = P.content;
    if (!t) return null;
    const has = (whole) => whole && norm(whole).includes(t);
    if (has(C.headline)) return 'headline';
    if (has(C.kicker)) return 'kicker';
    if (has(C.intro)) return 'intro';
    if (has(C.closing)) return 'closing';
    const b = C.benefits.findIndex(has);
    if (b >= 0) return `benefit:${C.benefitIds[b]}`;
    const h = C.highlights.find((x) => has(x.value) || has(x.label) || has(`${x.value} ${x.label}`));
    if (h) return `highlight:${h.id}`;
    const p = C.positions.findIndex(has);
    if (p >= 0) return `position:${C.positionIds ? C.positionIds[p] : p}`;
    if (has(C.message)) return 'message';
    if (C.contact && (has(C.contact.display) || has(C.contact.cta) || has(C.contact.hint))) return 'contact';
    if (C.contacts.some(has)) return 'contact';
    return null;
  }

  return { plan, prepare, render, hit, photos, MAX_SLIDES };
})();
