// Motion video timeline (pure, no DOM): turns the ad's own words into scenes,
// cuts and sound events on a beat grid. Only the ad's texts are used; the few
// functional labels (call to action, camera hint, salary period, vacancies
// word) come from RS.model.STOCK in the ad's language.
window.RS = window.RS || {};

RS.motionTimeline = (() => {
  const PHOTO_SCENES = ['fan', 'sphere', 'tunnel'];
  // Base length of each scene, in seconds (stretched a little when time is left).
  const LENGTH = { fan: 1.5, sphere: 2, tunnel: 1.5, counter: 1.5, wall: 2, benefit: 1, benefitLong: 1.5 };
  const LONG_BENEFIT = 32; // characters

  const list = (items) => (items || []).map((x) => String(x.text || '').trim()).filter(Boolean);

  function brandOf(project) {
    const name = String((project.brand && project.brand.name) || '').trim();
    return name === RS.model.DEFAULT_BRAND.name ? '' : name;
  }

  // A highlight: value + label as written. Only a plain number, with at most
  // a currency or a unit around it («1900 €», «CHF 1900», «40 h»), counts up;
  // «1 900,50 €», «1.900», «10+», «A combinar» are shown exactly as written.
  const COUNTABLE = /^([^\d+,.]*?)(\d{1,7})([^\d+,.]*)$/;
  function highlight(id, role, value, label) {
    const v = String(value || '').trim(), l = String(label || '').trim();
    const m = COUNTABLE.exec(v);
    return { id, role, value: v, label: l, count: m ? Number(m[2]) : null, prefix: m ? m[1] : '', suffix: m ? m[3] : '' };
  }

  // The video's eye for a block: the person's choice (project.video.show),
  // else the image's own eye.
  function eye(project, key, piece = 'video') {
    const vs = (project[piece] && project[piece].show) || {};
    if (typeof vs[key] === 'boolean') return vs[key];
    return (project.show || {})[key] !== false;
  }

  // The carousel's closing line: its own, else (while empty) the video's when
  // the video shows one.
  function carouselClosing(project, locale) {
    const own = (((project.carousel || {}).texts || {})[locale] || {}).closing;
    if (typeof own === 'string' && own.trim()) return own;
    const v = project.video || {};
    if (!(v.show && v.show.closing === true)) return '';
    const line = ((v.texts || {})[locale] || {}).closing;
    return typeof line === 'string' ? line : '';
  }

  // What the image says in one language: where every text of the video
  // starts («Textos do vídeo» shows these until he changes them). Lists keep
  // only filled items; highlights are the salary, the vacancies and the badge.
  // piece: the offer sheet's switch that applies ('video' or 'carousel').
  function imageTexts(project, locale, piece = 'video') {
    const t = project.texts[locale] || project.texts[project.locales[0]];
    const show = project.show || {};
    const S = RS.model.STOCK;
    const o = RS.model.offerParts(project, locale, piece === 'carousel' ? 'carousel' : 'video');
    const filled = (items) => (items || []).filter((x) => String(x.text || '').trim());
    const highlights = [];
    if (o.salary) highlights.push({ id: 'salary', role: 'salary', value: o.amount, label: o.period });
    if (o.count) highlights.push({ id: 'vacancies', role: 'vacancies', value: o.count, label: o.word });
    if (o.location) highlights.push({ id: 'location', role: 'location', value: o.location, label: o.locationLabel });
    if (o.startDate) highlights.push({ id: 'startDate', role: 'startDate', value: o.startDate, label: o.startLabel });
    if (show.badge !== false && String(t.badge || '').trim()) highlights.push({ id: 'badge', role: 'badge', value: t.badge, label: '' });
    return {
      kicker: t.kicker || '', headline: t.headline || '', intro: t.intro || '', positionsTitle: t.positionsTitle || '',
      message: RS.contact ? RS.contact.adMessage(project, locale) : '',
      cta: S.waCta[locale] || S.waCta['pt-PT'], hint: S.scanHint[locale] || S.scanHint['pt-PT'],
      closing: '', brandName: brandOf(project),
      benefits: filled(t.benefits), highlights, positions: filled(t.positions), contacts: filled(t.contacts),
    };
  }

  // Everything the video says, in one language: the video's own texts
  // («Textos do vídeo», project.video.texts) where he wrote them, else the
  // image's; lists follow the image item by item (RS.model.mergeList); the
  // eyes hide blocks. The app adds only the labels he can also change.
  // piece: 'video' (default) or 'carousel' — each has its own texts and eyes
  // (project[piece].texts / .show), both following the image until changed.
  function content(project, locale, piece = 'video') {
    const show = project.show || {};
    const own = project[piece] || {};
    const vs = own.show || {};
    const vt = (own.texts || {})[locale] || {};
    const img = imageTexts(project, locale, piece);
    const pick = (key) => String(typeof vt[key] === 'string' ? vt[key] : img[key] || '').trim();
    const items = (key) => RS.model.mergeList(img[key], vt[key]).filter((x) => String(x.text || '').trim());
    const seen = (key) => eye(project, key, piece);
    const link = seen('contacts') && RS.contact ? RS.contact.adLink(project, locale) : null;
    const w = project.whatsapp;
    const benefits = seen('benefits') ? items('benefits') : [];
    // highlights: the salary, the vacancies and the badge of the image, then his own
    const highlights = vs.highlights === false ? [] : RS.model.mergeList(img.highlights, vt.highlights)
      .map((x) => highlight(x.id, x.role || 'own', x.value, x.label)).filter((x) => x.value || x.label);
    const salary = highlights.find((x) => x.role === 'salary' && x.value);
    const vacancies = highlights.find((x) => x.role === 'vacancies' && x.value);
    // The older styles have a number-only counter; public location/date use
    // their existing text cards, while recipes keep them in the highlights.
    const commonCards = piece === 'video' && !RS.model.RECIPES.includes(project.video?.motion) && project.video?.motion !== 'poster'
      ? highlights.filter((x) => ['location', 'startDate'].includes(x.role)).map((x) => ({ id: `offer:${x.id}`, text: `${x.label}: ${x.value}`, icon: x.role === 'location' ? 'map-pin' : 'calendar' })) : [];
    benefits.push(...commonCards);
    const brandName = pick('brandName');
    let headline = pick('headline');
    if (!headline) headline = brandName || (benefits[0] && benefits[0].text.trim()) || (highlights[0] ? [highlights[0].value, highlights[0].label].filter(Boolean).join(' ') : '');
    const models = vt.model || {};
    return {
      kicker: seen('kicker') ? pick('kicker') : '',
      headline,
      intro: seen('intro') ? pick('intro') : '',
      // the carousel's closing line shows when written; the video's has its own switch
      closing: piece === 'carousel' ? carouselClosing(project, locale).trim() : vs.closing === true ? pick('closing') : '',
      benefits: benefits.map((x) => String(x.text).trim()),
      benefitIds: benefits.map((x) => x.id),
      icons: benefits.map((x) => x.icon || 'check'),
      highlights,
      offer: salary ? { salary: salary.count != null ? String(salary.count) : salary.value, currency: RS.model.offerParts(project, locale).currency, periodLabel: salary.label, amount: salary.value } : null,
      vacancies: vacancies ? { count: vacancies.value, word: vacancies.label } : null,
      positionsTitle: pick('positionsTitle'),
      positions: seen('positions') ? items('positions').map((x) => String(x.text).trim()) : [],
      // the ad's other contacts (for a card without a WhatsApp number), unless hidden
      contacts: seen('contacts') ? items('contacts').map((x) => String(x.text).trim()) : [],
      message: pick('message'),
      qr: vs.qr !== false,
      chat: vs.chat !== false,
      contact: link ? {
        display: RS.contact.display(w.country, w.number),
        cta: pick('cta'),
        hint: pick('hint'),
        link,
      } : null,
      // The template's sample «A sua empresa» is not a company to show.
      brandName,
      showLogo: show.logo !== false,
      photos: 0,
      // A model's own words (board headers, «agora», …): his, else the model's translation.
      labelFor(modelId, key, defaults) {
        const own = models[modelId] && models[modelId][key];
        if (typeof own === 'string') return own;
        const d = defaults || {};
        return d[locale] || d['pt-PT'] || '';
      },
    };
  }

  // Middle scenes in the style's order, only those whose content exists. A style
  // may list 'benefit' several times: the benefits are shared out over those
  // slots in their order; every other scene appears once.
  function candidates(c, kinds, toBeats, need) {
    const out = [];
    const push = (kind, base, data) => out.push({ kind, n: Math.max(base, need(kind, data) || 0), data });
    const slots = kinds.filter((k) => k === 'benefit').length;
    let slot = 0;
    const seen = new Set();
    for (const kind of kinds) {
      if (kind !== 'benefit' && seen.has(kind)) continue;
      seen.add(kind);
      if (kind === 'benefit') {
        const n = c.benefits.length;
        const from = Math.ceil((slot * n) / slots), to = Math.ceil(((slot + 1) * n) / slots);
        slot++;
        c.benefits.slice(from, to).forEach((text, k) => push(kind, toBeats(text.length > LONG_BENEFIT ? LENGTH.benefitLong : LENGTH.benefit), { text, index: from + k, total: n }));
      } else if (kind === 'counter') {
        if (!c.offer && !c.vacancies) continue;
        const chips = [c.offer && `${c.offer.amount} ${c.offer.periodLabel}`, c.vacancies && `${c.vacancies.count} ${c.vacancies.word}`].filter(Boolean);
        push(kind, toBeats(LENGTH.counter), { offer: c.offer, vacancies: c.vacancies, chips });
      } else if (kind === 'wall') {
        if (c.positions.length >= 2) push(kind, toBeats(LENGTH.wall), { positions: c.positions });
      } else if (PHOTO_SCENES.includes(kind)) {
        if (c.photos > 0) push(kind, toBeats(LENGTH[kind]), { photos: c.photos });
      }
    }
    return out;
  }

  // When the scenes do not fit: the style's later photo scenes go first, then
  // the last benefits (the first one stays), then the wall, then the first
  // photo scene, then the first benefit, then the rest.
  function fit(mid, budget) {
    const used = () => mid.reduce((a, s) => a + s.n, 0);
    const firstPhoto = mid.find((s) => PHOTO_SCENES.includes(s.kind));
    const benefits = () => mid.filter((s) => s.kind === 'benefit').length;
    const dropLast = (pred) => {
      for (let i = mid.length - 1; i >= 0; i--) if (pred(mid[i])) { mid.splice(i, 1); return true; }
      return false;
    };
    const order = [
      (s) => PHOTO_SCENES.includes(s.kind) && s !== firstPhoto,
      (s) => s.kind === 'benefit' && benefits() > 1,
      (s) => s.kind === 'wall',
      (s) => s === firstPhoto,
      (s) => s.kind === 'benefit',
      () => true,
    ];
    while (used() > budget) {
      if (!order.some((pred) => dropLast(pred))) break;
    }
    return mid;
  }

  // minBeats(kind, data): beats a scene needs for its text (the renderer measures it).
  // hold: seconds the closing card stays (the person's «Contacto no fim»).
  function build(c, { duration, scenes, beat = 0.5, minBeats, hold = 0 }) {
    const need = minBeats || (() => 0);
    const toBeats = (sec) => Math.round(sec / beat);
    const total = toBeats(duration);
    const short = duration <= 6;
    const hookMin = toBeats(short ? 1.5 : 2);
    const endMin = Math.min(Math.max(toBeats(short ? 2 : 2.5), toBeats(hold)), total - hookMin);
    const hookData = { kicker: c.kicker, headline: c.headline };
    const hookBase = Math.min(Math.max(hookMin, need('hook', hookData) || 0), Math.max(hookMin, total - endMin));
    const mid = fit(candidates(c, scenes, toBeats, need), Math.max(0, total - hookBase - endMin));
    // Time left over: the middle scenes stretch up to half their length, then
    // the hook up to twice its length; the closing card takes the rest.
    let slack = total - hookBase - endMin - mid.reduce((a, s) => a + s.n, 0);
    const caps = mid.map((s) => s.n + Math.ceil(s.n / 2));
    for (let grew = true; slack > 0 && grew;) {
      grew = false;
      for (let i = 0; i < mid.length && slack > 0; i++) if (mid[i].n < caps[i]) { mid[i].n++; slack--; grew = true; }
    }
    const hookN = Math.max(hookBase, Math.min(hookMin * 2, hookBase + Math.max(0, slack)));
    slack -= hookN - hookBase;
    const endN = endMin + Math.max(0, slack);

    const seq = [
      { kind: 'hook', n: hookN, data: hookData },
      ...mid,
      { kind: 'end', n: endN, data: { contact: c.contact, brandName: c.brandName, showLogo: c.showLogo, photos: c.photos } },
    ];
    let at = 0;
    const out = seq.map((s) => {
      const scene = { kind: s.kind, start: at * beat, end: (at + s.n) * beat, data: s.data };
      at += s.n;
      return scene;
    });
    const cuts = out.slice(1).map((s) => s.start);

    const events = [];
    for (let i = 0; i < total; i++) events.push({ t: i * beat, type: 'kick' });
    for (const t of cuts) events.push({ t, type: 'whoosh' });
    for (const s of out) {
      if (s.kind !== 'counter') continue;
      events.push({ t: Math.min(s.end, s.start + 2 * beat), type: 'hit' });
      s.data.chips.forEach((_, i) => events.push({ t: s.start + 0.25 * (i + 1), type: 'pop' }));
    }
    const endStart = out[out.length - 1].start;
    if (endStart >= 1.5) events.push({ t: endStart - 1.5, type: 'riser' });
    events.sort((a, b) => a.t - b.t);
    return { duration, scenes: out, cuts, events };
  }

  // The lengths a style's information can fill (seconds, 10–30): «Automática»
  // is what its scenes need at their base length; the longest doubles the hook
  // and stretches the benefit scenes by half (more would only hold the card).
  function range(c, { scenes, beat = 0.5, minBeats, hold = 0 }) {
    const need = minBeats || (() => 0);
    const toBeats = (sec) => Math.round(sec / beat);
    const endMin = Math.max(toBeats(2.5), toBeats(hold));
    const hookBase = Math.max(toBeats(2), need('hook', { kicker: c.kicker, headline: c.headline }) || 0);
    const mid = candidates(c, scenes, toBeats, need);
    const base = hookBase + mid.reduce((a, s) => a + s.n, 0) + endMin;
    const most = hookBase * 2 + mid.reduce((a, s) => a + (s.kind === 'benefit' ? Math.ceil(s.n * 1.5) : s.n), 0) + endMin;
    const clampT = (x) => Math.max(10, Math.min(30, x));
    // most: the longest it can fill, in seconds, before the 10–30 s bounds
    return { auto: clampT(Math.ceil(base * beat)), max: clampT(most * beat), most: most * beat };
  }

  // The acts of a video recipe, on the beat: hook (H), shapes (M), 2D→3D (V),
  // data (D), list (L), conversation (C), card (K), loop (O). H and O are always
  // there; every middle act is one bar; the card is one bar («2 s») or two
  // («4 s»); middle acts that do not fit go by priority; spare beats go to the card.
  const ORDER = ['M', 'V', 'D', 'L', 'C'];
  function acts(available, { duration, hold = 2, priority = ['D', 'M', 'C', 'V', 'L'], beat = 0.5 }) {
    const total = Math.round(duration / beat);
    const H = 4, O = 2, BAR = 4;
    let K = Math.min(hold === 4 ? 8 : 4, total - H - O);
    let budget = total - H - O - K;
    const keep = new Set();
    for (const k of priority) if (available.includes(k) && budget >= BAR) { keep.add(k); budget -= BAR; }
    K += budget;
    const seq = [['H', H], ...ORDER.filter((k) => keep.has(k)).map((k) => [k, BAR]), ['K', K], ['O', O]];
    let at = 0;
    return seq.map(([kind, beats]) => {
      const a = { kind, beats, start: at * beat, end: (at + beats) * beat };
      at += beats;
      return a;
    });
  }

  // The acts of a model with pages of information, on the beat (a bar = 4
  // beats = 2 s per page): hook H, intro I, the middle acts in the model's
  // order (benefits M, showcase V, highlights D, positions L, conversation C,
  // closing line F), card K (hold 2 or 4 s), loop O. «Automática» gives the
  // time the information needs (10–30 s); a fixed length first gives each act
  // its first page (by priority), then the intro, then the remaining pages,
  // then more focus (fewer items per page), then a longer card. A length the
  // information cannot fill is unavailable: it falls back to the longest
  // offered length that can be filled.
  const MIDDLE = ['M', 'V', 'D', 'L', 'C', 'F'];
  const PAGE = { M: [3, 1], D: [2, 1], L: [5, 2] }; // items per page: normal, spacious
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
  function schedule(c, { duration = 'auto', hold = 2, order = MIDDLE, priority = ['D', 'M', 'C', 'V', 'L', 'F'], has = {}, beat = 0.5, offered = [10, 15, 20, 25, 30] } = {}) {
    const BAR = 4, H = 4, O = 2, KMAX = 8;
    const Kbase = hold === 4 ? 8 : 4;
    const n = { M: c.benefits.length, D: (c.highlights || []).length, L: c.positions.length };
    const avail = { I: !!c.intro, M: n.M > 0, V: true, D: n.D > 0, L: n.L >= 2, C: !!(c.contact && c.chat), F: !!c.closing };
    for (const k of Object.keys(has)) if (has[k] === false) avail[k] = false;
    const pagesAt = (k, which) => (PAGE[k] ? Math.max(1, Math.ceil(n[k] / PAGE[k][which])) : 1);
    const need = (which, k0) => H + O + k0 + Object.keys(avail).filter((k) => avail[k]).reduce((a, k) => a + pagesAt(k, which) * BAR, 0);
    const clampT = (x) => Math.max(10, Math.min(30, x));
    const auto = clampT(need(0, Kbase) * beat);
    const max = clampT(need(1, KMAX) * beat);
    let T = duration === 'auto' ? auto : Number(duration) || 15;
    if (T !== 6 && T > max) T = [...offered].filter((d) => d >= 10).reverse().find((d) => d <= max) || 10;
    // the beats of each act at T
    const total = Math.round(T / beat);
    let K = Math.min(Kbase, total - H - O);
    let budget = total - H - O - K;
    const pages = {};
    for (const k of priority) if (avail[k] && budget >= BAR) { pages[k] = 1; budget -= BAR; }
    if (avail.I && budget >= BAR) { pages.I = 1; budget -= BAR; }
    for (const which of [0, 1]) {
      for (const k of ['M', 'D', 'L']) while (pages[k] && pages[k] < pagesAt(k, which) && budget >= BAR) { pages[k]++; budget -= BAR; }
    }
    const grow = Math.max(0, Math.min(budget, KMAX - K));
    K += grow + (budget - grow);
    const items = (k) => {
      if (!PAGE[k]) return [[]];
      const shown = Math.min(n[k], pages[k] * PAGE[k][0] >= n[k] ? n[k] : pages[k] * PAGE[k][0]);
      return spread(shown, pages[k]);
    };
    const seq = [['H', H, null], ...(pages.I ? [['I', BAR, [[]]]] : []),
      ...order.filter((k) => pages[k]).map((k) => [k, pages[k] * BAR, items(k)]), ['K', K, null], ['O', O, null]];
    let at = 0;
    const acts = seq.map(([kind, beats, pg]) => {
      const a = { kind, beats, start: at * beat, end: (at + beats) * beat };
      if (pg) a.pages = pg;
      at += beats;
      return a;
    });
    const shownOf = (k) => (pages[k] ? items(k).reduce((x, p) => x + p.length, 0) : 0);
    const left = {
      benefits: n.M - shownOf('M'), highlights: n.D - shownOf('D'), positions: avail.L ? n.L - shownOf('L') : 0,
      chat: avail.C && !pages.C, closing: avail.F && !pages.F, intro: avail.I && !pages.I,
    };
    const lengths = [...offered.map((d) => ({ value: d, seconds: d, ok: d <= max || d <= 10, missing: d <= max || d <= 10 ? 0 : Math.ceil((d - max) / 2) })),
      { value: 'auto', seconds: auto, ok: true, missing: 0 }];
    return { duration: T, auto, max, lengths, acts, left };
  }

  return { content, imageTexts, carouselClosing, eye, build, range, acts, schedule, PHOTO_SCENES };
})();
