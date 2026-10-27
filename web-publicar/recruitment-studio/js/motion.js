// Motion-graphics video styles: draws one frame of a style at time t, built
// only from the ad's own words (RS.motionTimeline) with the engine's text
// fitting, in poster pixels (1080 wide). The throwaway prototype in
// .superpowers/brainstorm was the visual reference.
//   prepare(project, { format, locale, photos, images }) -> P   (once per video)
//   render(ctx, P, { t, scale, layer })                          (every frame)
// layer 'text' draws only the texts (tests check the Instagram safe zones).
window.RS = window.RS || {};

RS.motion = (() => {
  const E = RS.engine, M = RS.model, U = RS.util, TL = RS.motionTimeline;

  const CTA = '#25D366';
  const NEON_TINTS = { hook: '#13254a', fan: '#1a1f3a', benefit: '#14223f', counter: '#0f2a2e', sphere: '#251a44', wall: '#1b1530', tunnel: '#2a1a10', end: '#0f2a1c' };
  // fx: grain, glitch (RGB split on cuts), flash (a flash of colour on cuts),
  // labels (small top labels + progress), cards (photo cards in the scenes),
  // tape (caution tape bands), letterbox + kenburns (full photo behind the text),
  // flip (every other scene on the highlight colour), vignette.
  const STYLES = [
    {
      id: 'neon', name: 'Néon', durations: [6, 10, 15, 20, 25, 30], defaultDuration: 15,
      scenes: ['hook', 'fan', 'benefit', 'counter', 'sphere', 'benefit', 'wall', 'tunnel', 'benefit', 'end'],
      palettes: { dark: { bg0: '#13254a', bg1: '#04060c', ink: '#F2F4F7', accent: '#C6F432', cta: CTA } },
      tints: NEON_TINTS, // a different tint per scene, as in the prototype
      font: 'modern', bgModes: ['dark'], textScale: 1,
      fx: { grain: true, glitch: true, labels: true, cards: true, vignette: true },
    },
    {
      id: 'obra', name: 'Obra', durations: [6, 10, 15, 20, 25, 30], defaultDuration: 15,
      scenes: ['hook', 'benefit', 'counter', 'fan', 'benefit', 'wall', 'benefit', 'end'],
      palettes: { dark: { bg0: '#3a3832', bg1: '#0f0f0d', ink: '#FFFFFF', accent: '#FFC400', cta: CTA } },
      font: 'impact', bgModes: ['dark'], textScale: 1.08,
      fx: { grain: true, flash: true, labels: true, cards: true, tape: true, vignette: true },
    },
    {
      id: 'limpo', name: 'Limpo', durations: [6, 10, 15, 20, 25, 30], defaultDuration: 15,
      scenes: ['hook', 'benefit', 'counter', 'fan', 'benefit', 'wall', 'benefit', 'end'],
      palettes: {
        light: { bg0: '#FFFFFF', bg1: '#E3EAF3', ink: '#0F1B2D', accent: '#1E5EFF', cta: CTA },
        dark: { bg0: '#17253f', bg1: '#070c16', ink: '#F2F4F7', accent: '#6E9DFF', cta: CTA },
      },
      font: 'geometric', bgModes: ['light', 'dark'], textScale: 0.92,
      fx: { flash: true, labels: true, cards: true, soft: true },
    },
    {
      id: 'cinema', name: 'Cinema', durations: [6, 10, 15, 20, 25, 30], defaultDuration: 15,
      scenes: ['hook', 'benefit', 'counter', 'benefit', 'wall', 'benefit', 'end'],
      palettes: { dark: { bg0: '#1a1a1a', bg1: '#000000', ink: '#FFFFFF', accent: '#F2B705', cta: CTA } },
      font: 'elegant', bgModes: ['dark'], textScale: 1,
      fx: { grain: true, labels: false, letterbox: true, kenburns: true, vignette: true, soft: true },
    },
    {
      id: 'impacto', name: 'Impacto', durations: [6, 10, 15, 20, 25, 30], defaultDuration: 10,
      scenes: ['hook', 'benefit', 'counter', 'benefit', 'wall', 'benefit', 'end'],
      palettes: { dark: { bg0: '#141414', bg1: '#000000', ink: '#FFFFFF', accent: '#FF3D2E', cta: CTA } },
      font: 'impact', bgModes: ['dark'], textScale: 1.3,
      fx: { labels: true, flip: true },
    },
    {
      id: 'curto', name: 'Curto', durations: [6], defaultDuration: 6,
      scenes: ['hook', 'benefit', 'counter', 'end'],
      palettes: { dark: { bg0: '#122a3a', bg1: '#03070c', ink: '#F2F4F7', accent: '#2EE6D6', cta: CTA } },
      tints: { hook: '#122a3a', benefit: '#1a1f3a', counter: '#251a44', end: '#0f2a1c' },
      font: 'modern', bgModes: ['dark'], textScale: 1.05,
      fx: { grain: true, glitch: true, labels: true, cards: true, vignette: true },
    },
    {
      // The ad's own animated poster (RS.engine with `anim`), unchanged.
      id: 'poster', name: 'Cartaz animado', durations: [6, 10, 15, 20, 25, 30], defaultDuration: 10,
      scenes: ['hook', 'end'], palettes: { dark: { bg0: '#13254a', bg1: '#04060c', ink: '#F2F4F7', accent: '#C6F432', cta: CTA } },
      font: 'modern', bgModes: ['dark'], textScale: 1, fx: {}, poster: true,
    },
  ];
  for (const s of STYLES) s.palette = s.palettes[s.bgModes[0]];
  // The video recipes (js/recipes/) are added in front of these by register().
  const styleOf = (id) => STYLES.find((s) => s.id === id) || STYLES.find((s) => s.id === 'neon');

  // Colours of a style for an ad: the style's own («Cores do estilo») or the
  // ad's primary and accent («Cores da marca»); «Cor de destaque» overrides the
  // highlight; «Fundo» claro/escuro where the style has both. Text ≥ 4.5:1.
  function colorsFor(style, project) {
    if (style.recipe) return recipeColors(style, project);
    const v = project.video || {};
    const mode = style.bgModes.includes(v.bg) ? v.bg : style.bgModes[0];
    const base = style.palettes[mode] || style.palette;
    // «Cores da marca» = the ad's primary and accent; a ready palette works the same way.
    const pal = v.colors === 'brand' ? (project.style || {}) : M.PALETTES.find((x) => x.id === v.colors);
    const c = { ...base, mode, tints: style.tints && !pal && mode === 'dark' ? style.tints : null };
    if (pal) {
      const primary = pal.primary || base.bg0;
      if (mode === 'light') { c.bg0 = U.mix(primary, '#FFFFFF', 0.93); c.bg1 = U.mix(primary, '#FFFFFF', 0.8); }
      else { c.bg0 = U.isDark(primary) ? primary : U.mix(primary, '#000000', 0.55); c.bg1 = U.mix(primary, '#000000', 0.85); }
      if (pal.accent) c.accent = pal.accent;
    }
    if (v.accent) c.accent = v.accent;
    c.accentChosen = U.normHex(c.accent); // shown in «Cor de destaque»
    c.ink = U.ensureContrast(c.ink, c.bg0, 4.5);
    c.accent = U.ensureContrast(c.accent, c.bg0, 4.5);
    return c;
  }

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const ex = (x) => { x = clamp(x, 0, 1); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
  const back = (x) => { x = clamp(x, 0, 1); return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2); };
  const prog = (t, a, d) => clamp((t - a) / d, 0, 1);
  const rgba = (hex, a) => { const c = U.hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; };
  const MONO = { family: 'Barlow', weight: 600 };

  // Text zones: Instagram covers the top 250 px and the bottom 280 px of a Story.
  function zones(fmt) {
    const story = fmt.id === 'story';
    const top = (story ? E.SAFE.top : 0) + (story ? 48 : 56);
    const bottom = (story ? fmt.h - E.SAFE.bottom : fmt.h) - (story ? 48 : 56);
    const cTop = top + 72, cBottom = bottom - 56;
    return {
      W: fmt.w, H: fmt.h, story, top, bottom, cTop, cBottom, cH: cBottom - cTop, cy: (cTop + cBottom) / 2,
      left: 80, w: fmt.w - 160,
      big: story ? 200 : fmt.h > 1200 ? 170 : 150,
    };
  }

  // Largest layout of `text` within maxW × maxH and maxLines, no word broken;
  // null when even minSize does not fit.
  function fitBox(text, o) {
    let maxSize = o.maxSize;
    for (let k = 0; k < 6; k++) {
      const L = E.fitHeadline(text, { font: o.font, lh: o.lh || 1.05, track: o.track || 0, upper: !!o.upper, locale: o.locale, maxW: o.maxW, maxLines: o.maxLines, maxSize, minSize: o.minSize });
      const fits = L.lines.length <= o.maxLines && !L.broken;
      if (fits && L.h <= o.maxH) return L;
      if (!fits || L.size <= o.minSize + 0.5) return null;
      maxSize = Math.max(o.minSize, L.size * Math.min(0.97, o.maxH / L.h));
    }
    return null;
  }
  // One layout, or two halves (shown over two beats) when the text is too long.
  function pages(P, text, o) {
    const opts = { locale: P.locale, maxW: P.Z.w, ...o };
    const one = fitBox(text, opts);
    if (one) return keep(P, [one]);
    const words = String(text).replace(/\s*\n\s*/g, ' ').split(' ').filter(Boolean);
    if (words.length > 1) {
      let best = 1, diff = Infinity;
      const total = words.join(' ').length;
      for (let i = 1; i < words.length; i++) {
        const d = Math.abs(words.slice(0, i).join(' ').length - total / 2);
        if (d < diff) { diff = d; best = i; }
      }
      const halves = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
      const fitted = halves.map((h) => fitBox(h, opts) || forced(h, opts));
      return keep(P, fitted);
    }
    return keep(P, [forced(text, opts)]);
  }
  // One layout that keeps every word, for the places that cannot show a text
  // in two halves: more lines if needed, else the smallest size wrapped freely.
  function whole(P, text, o) {
    const opts = { locale: P.locale, maxW: P.Z.w, ...o };
    const L = fitBox(text, opts) || fitBox(text, { ...opts, maxLines: opts.maxLines + 2, maxH: opts.maxH * 1.4 }) || forced(text, opts);
    return keep(P, [L])[0];
  }
  const forced = (text, o) => E.textLayout(text, { font: o.font, size: o.minSize, lh: o.lh || 1.05, track: o.track || 0, upper: !!o.upper, locale: o.locale, maxW: o.maxW });
  function keep(P, list) {
    for (const L of list) P.minTextSize = Math.min(P.minTextSize, L.size);
    return list;
  }
  const label = (text, size, upper = true) => E.textLayout(text, { font: MONO, size, lh: 1, track: 0.12, upper, maxW: Infinity, locale: 'pt-PT' });

  // ---------------------------------------------------------------- photos
  // Cards for the photo scenes: the ad's photo, the trades' library photos,
  // the person's own photos of those trades, then related trades; at most 16.
  const RELATED = ['obras', 'servente'];
  function loadImage(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }
  // Each photo keeps its id (library id, «As minhas» or the ad's photo asset)
  // and library item: «Enquadrar» (video.photos.focus) is looked up by it.
  const TAGS = new WeakMap();
  function tagPhoto(img, id, item = null) {
    if (img && id) TAGS.set(img, { id, item });
    return img;
  }
  const photoIdOf = (img) => (img && TAGS.has(img) ? TAGS.get(img).id : null);
  // The point of a photo the video keeps in the centre (RS.model.videoPhotoFocus),
  // or null for a photo without an id.
  function photoFocus(project, img) {
    const tag = img && TAGS.get(img);
    return tag ? M.videoPhotoFocus(project, tag.id, tag.item) : null;
  }
  const ownPhoto = (project, images) => (images && images.photo ? tagPhoto(images.photo, project.photo && project.photo.asset) : null);
  async function photoSet(project, images, libraryItems) {
    const cats = (project.trades || []).map((id) => RS.trades.get(id) && RS.trades.get(id).photo).filter(Boolean);
    const items = libraryItems || [];
    const picked = [];
    const add = (pred) => { for (const it of items) if (picked.length < 16 && !picked.includes(it) && it.thumb && pred(it)) picked.push(it); };
    for (const cat of cats) add((it) => !it.asset && it.cat === cat);
    for (const cat of cats) add((it) => it.asset && it.cat === cat);
    for (const cat of RELATED) add((it) => it.cat === cat);
    const own = ownPhoto(project, images);
    const cards = own ? [own] : [];
    const loaded = await Promise.all(picked.slice(0, 16 - cards.length).map(async (it) => tagPhoto(await loadImage(it.thumb), it.asset || it.id, it)));
    for (const im of loaded) if (im) cards.push(im);
    // The full photo behind the hook (and Cinema's whole video): the ad's own,
    // else the first library photo in full size (thumbnails are too small).
    let hero = own;
    const first = picked[0];
    if (!hero && first && !first.asset && first.id && RS.library && RS.library.full) {
      try {
        const url = await Promise.race([RS.library.full(first.id), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
        hero = tagPhoto(await loadImage(url), first.id, first);
      } catch { hero = null; }
    }
    return { hero: hero || cards[0] || null, cards };
  }

  // Each card is drawn once into a sprite (white frame, rounded, soft shadow);
  // repeats of the same photo get a different crop (around its focus, when it has one).
  const CARD_W = 300, CARD_H = 390, PAD = 26;
  function sprite(img, variant, focus) {
    const c = document.createElement('canvas');
    c.width = CARD_W + PAD * 2; c.height = CARD_H + PAD * 2;
    const g = c.getContext('2d');
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 22; g.shadowOffsetY = 10;
    E.roundRect(g, PAD, PAD, CARD_W, CARD_H, CARD_W * 0.06);
    g.fillStyle = '#fff'; g.fill();
    g.shadowColor = 'transparent';
    const b = CARD_W * 0.035;
    g.save();
    E.roundRect(g, PAD + b, PAD + b, CARD_W - 2 * b, CARD_H - 2 * b, CARD_W * 0.04);
    g.clip();
    cover(g, img, PAD + b, PAD + b, CARD_W - 2 * b, CARD_H - 2 * b, variant, focus);
    g.restore();
    return c;
  }
  // focus ({ x, y }, 0..1): the point as near the crop's centre as the photo
  // allows, the repeats' crops shifted beside it; without one, the old crops.
  function cover(g, im, x, y, w, h, variant = 0, focus = null) {
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    if (!iw || !ih) return;
    const v = variant % 3;
    const zoom = 1 + v * 0.18;
    const k = Math.max(w / iw, h / ih) * zoom;
    const sw = w / k, sh = h / k;
    if (focus) {
      const ox = [0, -0.25, 0.25][v] * (iw - sw), oy = [0, 0.15, -0.05][v] * (ih - sh);
      g.drawImage(im, clamp(focus.x * iw - sw / 2 + ox, 0, iw - sw), clamp(focus.y * ih - sh / 2 + oy, 0, ih - sh), sw, sh, x, y, w, h);
      return;
    }
    const fx = [0.5, 0.25, 0.75][v], fy = [0.35, 0.5, 0.3][v];
    g.drawImage(im, (iw - sw) * fx, (ih - sh) * fy, sw, sh, x, y, w, h);
  }
  function filtersWork() {
    const g = document.createElement('canvas').getContext('2d');
    g.filter = 'blur(1px)';
    return g.filter === 'blur(1px)';
  }
  // The photo behind the hook, soft: a blur filter at quarter size, or (where
  // canvas filters do nothing, Safari before 18) a much smaller copy that the
  // browser smooths when it is drawn large.
  function blurredHero(img, fmt, focus) {
    const blur = filtersWork();
    const c = document.createElement('canvas');
    const k = blur ? 4 : 14;
    c.width = Math.round(fmt.w / k); c.height = Math.round(fmt.h / k);
    const g = c.getContext('2d');
    if (blur) g.filter = 'blur(3px) saturate(0.8)';
    cover(g, img, -8, -8, c.width + 16, c.height + 16, 0, focus);
    if (blur) g.filter = 'none';
    return c;
  }

  // Grain and vignette, drawn once at half size in four grain variants.
  // Sprites and overlays are shared by every prepare of the same photos /
  // format and look (the export dialog prepares one per style for its gallery).
  // A photo used again (fewer photos than cards) gets another crop.
  const spriteCache = new WeakMap();
  function spriteFor(photos, k, variant, focus) {
    let m = spriteCache.get(photos);
    if (!m) { m = new Map(); spriteCache.set(photos, m); }
    const key = `${k * 3 + variant}${focus ? `|${focus.x},${focus.y}` : ''}`;
    let sp = m.get(key);
    if (!sp) {
      if (m.size > 96) m.clear(); // points moved many times
      sp = sprite(photos.cards[k], variant, focus); m.set(key, sp);
    }
    return sp;
  }
  // The four most recent looks are kept (about 8 MB each for a Story).
  const overlayCache = new Map();
  function overlaysFor(fmt, fx, mode) {
    const key = `${fmt.id}|${!!fx.grain}|${!!fx.vignette}|${mode}`;
    let layers = overlayCache.get(key);
    if (layers) overlayCache.delete(key);
    else layers = overlays(fmt, fx, mode);
    overlayCache.set(key, layers);
    while (overlayCache.size > 4) overlayCache.delete(overlayCache.keys().next().value);
    return layers;
  }
  function overlays(fmt, fx, mode) {
    const out = [];
    const w = Math.round(fmt.w / 2), h = Math.round(fmt.h / 2);
    for (let v = 0; v < 4; v++) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (fx.grain) {
        const d = g.createImageData(w, h);
        let seed = v * 7919 + 1;
        for (let i = 0; i < d.data.length; i += 4) {
          seed = (seed * 16807) % 2147483647;
          const val = (seed / 2147483647) * 255;
          d.data[i] = d.data[i + 1] = d.data[i + 2] = val;
          d.data[i + 3] = 14;
        }
        g.putImageData(d, 0, 0);
      }
      const vg = g.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.82);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, mode === 'light' ? 'rgba(15,27,45,.10)' : fx.vignette ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.25)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
      out.push(c);
    }
    return out;
  }

  // ---------------------------------------------------------------- prepare
  // A style's length: Curto's 6 s; «Automática» (what the information needs);
  // a chosen length the information can fill, else the longest that it can.
  function styleDuration(style, v, rng) {
    if (style.durations.length === 1) return style.durations[0];
    if (v.duration === 'auto') return rng.auto;
    const d = style.durations.includes(v.duration) ? v.duration : style.defaultDuration;
    if (d <= 10 || d <= rng.max) return d;
    return style.durations.filter((x) => x >= 10 && x <= rng.max).pop() || 10;
  }
  const POSTER_RANGE = { auto: 10, max: 30 };
  // «Cartaz animado»: a slow push-in over the whole length (1 → zoom.z, at
  // most 1.06) about the point zoom.ax, zoom.ay.
  const posterCamera = (duration, t, zoom = { z: 1.06 }) => ({ z: 1 + (zoom.z - 1) * clamp(t / duration, 0, 1), ax: zoom.ax, ay: zoom.ay });
  // How far the push-in may go, and about which point: the poster's texts
  // (title, logo, contacts, badge… — the photo is the background) grow into
  // the free room above and below them (and at the sides) in proportion, so
  // none leaves the Instagram zones in Story, or the frame, by the end. The
  // poster's boxes come from one tiny render.
  let zoomCanvas = null;
  function posterZoom(project, fmt, locale, images) {
    if (!zoomCanvas) { zoomCanvas = document.createElement('canvas'); zoomCanvas.width = 54; zoomCanvas.height = 96; }
    const { regions } = E.render(zoomCanvas.getContext('2d'), project, { format: fmt.id, locale, images, scale: 0.05, mode: 'export' });
    const story = fmt.id === 'story';
    const top = story ? E.SAFE.top : 0, bottom = story ? fmt.h - E.SAFE.bottom : fmt.h;
    const slack = 0.5;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const g of regions || []) {
      if (g.key === 'photo') continue;
      // a box already outside has nothing to keep in
      if (g.y < top - slack || g.y + g.h > bottom + slack || g.x < -slack || g.x + g.w > fmt.w + slack) continue;
      x0 = Math.min(x0, g.x); x1 = Math.max(x1, g.x + g.w); y0 = Math.min(y0, g.y); y1 = Math.max(y1, g.y + g.h);
    }
    if (x1 <= x0 || y1 <= y0) return { z: 1.06, ax: fmt.w / 2, ay: fmt.h / 2 };
    // content [a, b] inside [lo, hi]: the zoom that fills the room, and the point it grows from
    const fit = (lo, hi, a, b) => {
      const sa = Math.max(0, a - lo), sb = Math.max(0, hi - b);
      return { z: 1 + (sa + sb) / (b - a), at: sa + sb > 0 ? a + ((b - a) * sa) / (sa + sb) : (a + b) / 2 };
    };
    const X = fit(0, fmt.w, x0, x1), Y = fit(top, bottom, y0, y1);
    return { z: Math.max(1, Math.min(1.06, X.z, Y.z)), ax: X.at, ay: Y.at };
  }

  function prepare(project, o) {
    const fmt = M.FORMATS[o.format] || M.FORMATS.story;
    const v = project.video || M.DEFAULT_VIDEO;
    const style = styleOf(v.motion);
    if (style.recipe) return prepareRecipe(project, o, style);
    const photos = o.photos || { hero: null, cards: [] };
    const locale = o.locale || project.locale;
    const c = TL.content(project, locale);
    c.photos = photos.cards.length;
    if (!style.fx.cards) c.photos = 0;
    if (style.poster) {
      // «Cartaz animado»: the engine draws the ad's own poster with its animation,
      // spread over the length, under a slow camera move. Its music is a plain
      // beat: the poster has no cuts for whooshes and hits.
      const duration = styleDuration(style, v, POSTER_RANGE);
      const built = TL.build(c, { duration, scenes: style.scenes });
      const timeline = { ...built, cuts: [], events: built.events.filter((e) => e.type === 'kick'), plain: true };
      const zoom = posterZoom(project, fmt, locale, o.images || {});
      return { project, fmt, style, timeline, content: c, locale, Z: zones(fmt), minTextSize: 0, images: o.images || {}, anim: E.animState({ duration, style: v.style }), posterCamera: (t) => posterCamera(duration, t, zoom) };
    }
    const P = styleFrame(project, o, style, c, fmt, photos);
    // Scenes with more to read get more beats (the texts are measured first).
    const hold = v.hold === 4 ? 4 : 2, minBeats = (kind, data) => needBeats(P, kind, data);
    const duration = styleDuration(style, v, TL.range(c, { scenes: style.scenes, hold, minBeats }));
    const timeline = TL.build(c, { duration, scenes: style.scenes, hold, minBeats });
    P.timeline = timeline;
    P.scenes = timeline.scenes.map((s) => LAYOUT[s.kind](P, s));
    P.sceneColors = timeline.scenes.map((s, i) => sceneColors(P, i));
    if (!Number.isFinite(P.minTextSize)) P.minTextSize = 0;
    return P;
  }
  // A style's frame state before its timeline: fonts, colours, zones, photos
  // and the ad's other contacts (the video's, unless hidden).
  function styleFrame(project, o, style, c, fmt, photos) {
    const v = project.video || M.DEFAULT_VIDEO;
    const locale = o.locale || project.locale;
    const contacts = c.contacts;
    const F = M.FONTS[v.font] || M.FONTS[style.font] || M.FONTS.modern;
    const C = colorsFor(style, project);
    const logoImg = c.showLogo && o.images && o.images.logo ? o.images.logo : null;
    const P = {
      project, fmt, style, timeline: null, content: c, contacts, locale, F, C, Z: zones(fmt), minTextSize: Infinity, ts: style.textScale || 1,
      upper: project.style && project.style.upper !== false,
      sprites: style.fx.cards ? photos.cards : [],
      few: photos.cards.length < 4, // fewer, larger cards in the photo scenes
      hero: photos.hero ? blurredHero(photos.hero, fmt, photoFocus(project, photos.hero)) : null,
      photo: style.fx.kenburns ? photos.hero : null,
      photoFocus: style.fx.kenburns && photos.hero ? photoFocus(project, photos.hero) : null,
      logo: logoImg ? E.logoSource(logoImg, C.bg1, project.style.logoTone) : null,
      overlays: o.lite ? null : overlaysFor(fmt, style.fx, C.mode),
      buffers: null,
    };
    // Sprites repeat to fill the scenes that need many cards.
    P.card = (i) => {
      const n = P.sprites.length, j = ((i % n) + n) % n;
      return spriteFor(photos, j, Math.floor(Math.abs(i) / n) % 3, photoFocus(project, photos.cards[j]));
    };
    P.Z.big *= P.ts;
    return P;
  }

  // Time to read: 1 beat (0.5 s) per 18 characters, at least 1 s per page of a
  // long text and per group of the wall.
  // The wall: two positions at a time, more when there are many (at most
  // three groups, so ten positions take 3 s).
  const WALL_PER = 2, WALL_GROUPS = 3;
  const wallPer = (n) => Math.max(WALL_PER, Math.ceil(n / WALL_GROUPS));
  const CHARS_PER_BEAT = 18;
  function needBeats(P, kind, data) {
    const read = (text, cap) => Math.min(cap, Math.ceil(String(text || '').length / CHARS_PER_BEAT));
    if (kind === 'hook') return Math.min(10, Math.max(LAYOUT.hook(P, { data }).head.length * 2 + 1, read(data.headline, 10)));
    if (kind === 'benefit') return Math.min(8, Math.max(LAYOUT.benefit(P, { data }).text.length * 2, read(data.text, 8)));
    if (kind === 'wall') return Math.ceil(data.positions.length / wallPer(data.positions.length)) * 2;
    return 0;
  }

  const LAYOUT = {
    hook(P, s) {
      const { F, Z } = P;
      const kicker = s.data.kicker ? whole(P, s.data.kicker, { font: F.sub, track: F.subTrack, upper: true, lh: 1.1, maxSize: 52, minSize: 40, maxLines: 2, maxH: 130 }) : null;
      const text = s.data.headline || P.content.brandName || s.data.kicker || ' ';
      const room = Z.cH - (kicker ? kicker.h + 44 : 0) - 64;
      const head = pages(P, text, { font: F.head, lh: F.headLH, track: F.headTrack, upper: P.upper, maxSize: Z.big, minSize: 48, maxLines: Z.story ? 6 : 4, maxH: room / 1.12 });
      return { kicker, head };
    },
    benefit(P, s) {
      const { F, Z } = P;
      const text = pages(P, s.data.text, { font: F.head, lh: F.headLH, track: F.headTrack, upper: false, maxSize: (Z.story ? 150 : 130) * P.ts, minSize: 48, maxLines: 4, maxH: Z.cH * 0.5 / 1.12 });
      // "01 / 03" counts the benefits this video shows (short videos show fewer).
      const shown = P.timeline ? P.timeline.scenes.filter((x) => x.kind === 'benefit').length : s.data.total; // while measuring, before the timeline
      return { text, index: label(`${String(s.data.index + 1).padStart(2, '0')} / ${String(shown).padStart(2, '0')}`, 30) };
    },
    counter(P, s) {
      const { F, Z } = P;
      const d = s.data;
      const out = {};
      if (d.offer) {
        out.amount = whole(P, d.offer.amount, { font: F.head, lh: 1, upper: false, maxSize: Z.story ? 280 : 230, minSize: 60, maxLines: 1, maxH: 320 });
        out.period = whole(P, d.offer.periodLabel, { font: F.strong, lh: 1.1, maxSize: 72, minSize: 40, maxLines: 1, maxH: 100 });
        out.numeric = /^\d{1,7}$/.test(d.offer.salary.replace(/[\s.]/g, '')) ? Number(d.offer.salary.replace(/[\s.]/g, '')) : null;
      }
      if (d.vacancies) {
        const big = !d.offer;
        out.vacancies = whole(P, big ? `+${d.vacancies.count}` : `${d.vacancies.count} ${d.vacancies.word}`, {
          font: big ? F.head : F.strong, lh: 1, maxSize: big ? (Z.story ? 280 : 230) : 60, minSize: 40, maxLines: 1, maxH: big ? 320 : 90,
        });
        if (big) out.word = whole(P, d.vacancies.word, { font: F.strong, lh: 1.1, maxSize: 72, minSize: 40, maxLines: 1, maxH: 100 });
      }
      return out;
    },
    wall(P, s) {
      const { F, Z } = P;
      const list = s.data.positions;
      const groups = [];
      const per = wallPer(list.length);
      for (let i = 0; i < list.length; i += per) groups.push(list.slice(i, i + per));
      const bandH = Math.min(Z.cH * 0.62, 760);
      return {
        bandH,
        card: P.few ? 320 : 250,
        groups: groups.map((g) => g.map((text) => whole(P, text, { font: F.head, lh: F.headLH, track: F.headTrack, upper: P.upper, maxSize: 150 * P.ts, minSize: 44, maxLines: 2, maxH: (bandH - 24 * (g.length - 1)) / g.length }))),
      };
    },
    tunnel(P) {
      const { F, Z } = P;
      const v = P.content.vacancies;
      const cards = { cards: P.few ? 16 : 34, size: P.few ? 340 : 260 };
      if (!v) return cards;
      return {
        ...cards,
        count: whole(P, `+${v.count}`, { font: F.head, lh: 1, maxSize: Z.story ? 280 : 220, minSize: 60, maxLines: 1, maxH: 320 }),
        word: whole(P, v.word, { font: F.strong, lh: 1.1, maxSize: 72, minSize: 40, maxLines: 1, maxH: 100 }),
      };
    },
    fan: (P) => ({ cards: P.few ? 3 : Math.min(7, Math.max(3, P.sprites.length)), size: (P.Z.story ? 360 : 300) * (P.few ? 1.25 : 1) }),
    sphere: (P) => ({ cards: P.few ? 14 : 42, size: P.few ? 230 : 150 }),
    end(P, s) {
      const { F, Z } = P;
      const d = s.data;
      const out = { items: [], ring: { cards: P.few ? 8 : 14, size: P.few ? 250 : 190 } };
      if (d.showLogo && P.logo) out.items.push({ kind: 'logo', h: Z.story ? 150 : 120 });
      else if (d.showLogo && d.brandName) out.items.push({ kind: 'text', L: whole(P, d.brandName, { font: F.head, lh: F.headLH, upper: P.upper, maxSize: 110, minSize: 48, maxLines: 2, maxH: 230 }), color: 'ink' });
      if (d.contact) {
        out.items.push({ kind: 'text', L: whole(P, d.contact.display, { font: F.head, lh: 1, maxSize: 120, minSize: 56, maxLines: 1, maxH: 140 }), color: 'ink' });
        const cta = whole(P, `${d.contact.cta}  →`, { font: F.strong, lh: 1, maxSize: 56, minSize: 40, maxLines: 1, maxH: 80, maxW: Z.w - 160 });
        const ph = Math.max(110, cta.size * 2.1);
        out.items.push({ kind: 'pill', L: cta, h: ph, img: pillSprite(cta.w + ph * 1.3, ph, P.C.cta) });
        const qs = Z.story ? 230 : Z.H > 1200 ? 200 : 170;
        if (P.content.qr !== false) out.items.push({ kind: 'qr', s: qs, link: d.contact.link, hint: label(d.contact.hint, 30), img: qrSprite(d.contact.link, qs) });
      } else if (P.contacts.length) {
        for (const text of P.contacts.slice(0, 3)) out.items.push({ kind: 'text', L: whole(P, text, { font: F.strong, lh: 1.1, maxSize: 64, minSize: 40, maxLines: 2, maxH: 160 }), color: 'ink' });
      }
      if (out.items.length < 2 && P.content.headline) {
        out.items.push({ kind: 'text', L: whole(P, P.content.headline, { font: F.head, lh: F.headLH, upper: P.upper, maxSize: 110, minSize: 48, maxLines: 4, maxH: 480 }), color: 'accent' });
      }
      // Stack them in the zone, centred, with even gaps.
      const hOf = (it) => (it.kind === 'text' ? it.L.h : it.kind === 'qr' ? it.s + 56 : it.h);
      const total = out.items.reduce((a, it) => a + hOf(it), 0);
      const gap = clamp((Z.cH - total) / (out.items.length + 1), 24, 90);
      let y = Z.cy - (total + gap * (out.items.length - 1)) / 2;
      for (const it of out.items) { it.y = y; y += hOf(it) + gap; }
      return out;
    },
  };

  function qrSprite(link, size) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size);
    E.drawQR({ ctx: c.getContext('2d'), theme: { primary: '#000' }, hit() {} }, link, 0, 0, size, { dark: '#0B1A10', light: '#FFFFFF' });
    return c;
  }
  const GLOW = 50;
  function pillSprite(w, h, color) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w + GLOW * 2); c.height = Math.ceil(h + GLOW * 2);
    const g = c.getContext('2d');
    E.roundRect(g, GLOW, GLOW, w, h, h / 2);
    g.fillStyle = color; g.shadowColor = rgba(color, 0.55); g.shadowBlur = GLOW; g.fill();
    return c;
  }

  // ---------------------------------------------------------------- drawing
  function sceneAt(tl, t) {
    for (let i = tl.scenes.length - 1; i >= 0; i--) if (t >= tl.scenes[i].start) return i;
    return 0;
  }
  // Text helper: block L at (x, y) top-left of its box, centred in boxW;
  // enters with a slam (scale + blur) at t0 and lifts out at tOut.
  function slam(R, L, y, color, t0, tOut, o = {}) {
    const p = prog(R.lt, t0, 0.42);
    if (p <= 0) return;
    const out = tOut != null ? prog(R.lt, tOut, 0.22) : 0;
    if (out >= 1) return;
    const { ctx } = R;
    const Z = R.P.Z;
    const soft = R.P.style.fx.soft;
    const s = lerp(soft ? 1.03 : o.from || 1.12, 1, ex(p));
    const cx = Z.W / 2, cy = y + L.h / 2;
    ctx.save();
    ctx.translate(cx, cy - out * 40);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = Math.min(1, p * 2.4) * (1 - out);
    if (!R.textOnly && !soft && p < 0.5) ctx.filter = `blur(${((1 - p / 0.5) * 12).toFixed(1)}px)`;
    if (!R.textOnly && R.C.mode !== 'light' && !R.flat) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 36; }
    L.draw(ctx, Z.left, y, R.textOnly ? '#fff' : color, 'center', Z.w);
    ctx.restore();
  }
  function fade(R, L, x, y, color, a, align = 'left', boxW = 0) {
    if (a <= 0) return;
    const { ctx } = R;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    L.draw(ctx, x, y, R.textOnly ? '#fff' : color, align, boxW);
    ctx.restore();
  }
  function card(R, i, cx, cy, w, rot = 0, a = 1, shade = 0) {
    if (R.textOnly || a <= 0 || w < 4 || !R.P.sprites || !R.P.sprites.length) return;
    const { ctx } = R;
    const k = w / CARD_W, h = CARD_H * k;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(R.P.card(i), -w / 2 - PAD * k, -h / 2 - PAD * k, (CARD_W + PAD * 2) * k, (CARD_H + PAD * 2) * k);
    if (shade > 0.02) {
      E.roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.06);
      ctx.fillStyle = `rgba(6,9,18,${shade.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }
  const gradCache = new WeakMap();
  function background(R, kind) {
    const { ctx, P } = R;
    const Z = P.Z, C = R.C;
    if (P.photo) { kenBurns(R); return; }
    if (R.flat || P.style.fx.flip) { ctx.fillStyle = C.bg0; ctx.fillRect(0, 0, Z.W, Z.H); return; }
    const tint = (C.tints && C.tints[kind]) || C.bg0;
    let map = gradCache.get(ctx);
    if (!map) { map = new Map(); gradCache.set(ctx, map); }
    const key = `${tint}|${C.bg1}|${Z.W}x${Z.H}`;
    let g = map.get(key);
    if (!g) {
      if (map.size > 24) map.clear();
      g = ctx.createRadialGradient(Z.W / 2, Z.H * 0.42, 60, Z.W / 2, Z.H * 0.5, Z.H * 0.78);
      g.addColorStop(0, tint);
      g.addColorStop(1, C.bg1);
      map.set(key, g);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, Z.W, Z.H);
  }
  // Cinema: the full photo behind every scene, slowly zooming and panning.
  function kenBurns(R) {
    const { ctx, P } = R;
    const Z = P.Z;
    const i = P.timeline.scenes.indexOf(R.s);
    const k = R.lt / Math.max(0.1, R.d);
    const zoom = 1.06 + 0.12 * k;
    const dir = i % 2 ? 1 : -1;
    ctx.save();
    ctx.translate(Z.W / 2 + dir * 40 * k, Z.H / 2 + (i % 3 - 1) * 24 * k);
    ctx.scale(zoom, zoom);
    cover(ctx, P.photo, -Z.W / 2, -Z.H / 2, Z.W, Z.H, 0, P.photoFocus);
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0, 0, Z.H);
    g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.5, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,.8)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, Z.W, Z.H);
  }
  // Impacto: every other scene on the highlight colour, with dark words.
  function sceneColors(P, i) {
    if (!P.style.fx.flip || i % 2 === 0) return P.C;
    const ink = U.ensureContrast('#111111', P.C.accent, 4.5);
    return { ...P.C, bg0: P.C.accent, bg1: P.C.accent, ink, accent: ink, tints: null, mode: 'dark' };
  }
  // Obra: caution tape bands that slide along.
  const tapeCache = new WeakMap();
  function tape(R, y, h, dir) {
    const { ctx, P } = R;
    // One pattern per canvas and colour (the highlight can change on the same canvas).
    let byColor = tapeCache.get(ctx);
    if (!byColor) { byColor = new Map(); tapeCache.set(ctx, byColor); }
    let pat = byColor.get(R.C.accent);
    if (!pat) {
      const c = document.createElement('canvas');
      c.width = 72; c.height = 72;
      const g = c.getContext('2d');
      g.fillStyle = '#111111'; g.fillRect(0, 0, 72, 72);
      g.fillStyle = R.C.accent;
      for (const x0 of [-72, 0, 72]) { g.beginPath(); g.moveTo(x0, 72); g.lineTo(x0 + 36, 0); g.lineTo(x0 + 72, 0); g.lineTo(x0 + 36, 72); g.closePath(); g.fill(); }
      pat = ctx.createPattern(c, 'repeat');
      byColor.set(R.C.accent, pat);
    }
    const off = ((R.t * 140 * dir) % 72 + 72) % 72;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, P.Z.W, h); ctx.clip();
    ctx.translate(off, y);
    ctx.fillStyle = pat;
    ctx.fillRect(-off - 72, 0, P.Z.W + 144, h);
    ctx.restore();
  }
  // Obra and Limpo: a flash of colour on every cut instead of the RGB split.
  function flash(R) {
    const cut = R.P.timeline.cuts.find((c) => R.t >= c && R.t < c + 0.16);
    if (cut == null) return;
    const k = 1 - (R.t - cut) / 0.16;
    const soft = R.P.style.fx.soft;
    R.ctx.save();
    R.ctx.globalAlpha = (soft ? 0.2 : 0.42) * k;
    R.ctx.fillStyle = soft && R.C.mode === 'light' ? R.C.accent : soft ? '#FFFFFF' : R.C.accent;
    R.ctx.fillRect(0, 0, R.P.Z.W, R.P.Z.H);
    R.ctx.restore();
  }
  function heroBg(R, alpha, zoom) {
    if (R.textOnly || !R.P.hero) return;
    const { ctx } = R;
    const Z = R.P.Z;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Z.W / 2, Z.H / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(R.P.hero, -Z.W / 2, -Z.H / 2, Z.W, Z.H);
    ctx.restore();
  }
  function shadeAll(R, color) {
    if (R.textOnly) return;
    R.ctx.fillStyle = color;
    R.ctx.fillRect(0, 0, R.P.Z.W, R.P.Z.H);
  }
  // Pages of a long text share the scene: one beat each.
  function pageAt(R, list, start, end) {
    const n = list.length;
    const span = (end - start) / n;
    const i = clamp(Math.floor((R.lt - start) / span), 0, n - 1);
    return { L: list[i], t0: start + i * span, tOut: i < n - 1 ? start + (i + 1) * span - 0.22 : null };
  }

  // Points on a sphere (golden angle), per number of cards.
  const SPH = new Map();
  const spherePoints = (n) => {
    if (!SPH.has(n)) SPH.set(n, Array.from({ length: n }, (_, i) => { const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963; return [Math.cos(th) * r, y, Math.sin(th) * r]; }));
    return SPH.get(n);
  };

  const DRAW = {
    hook(R) {
      const { P, lt, d } = R;
      const { Z } = P, C = R.C;
      const S = R.S;
      if (!P.photo) {
        heroBg(R, P.style.fx.flip ? 0 : 0.42, 1 + lt * 0.03);
        shadeAll(R, C.mode === 'light' ? 'rgba(255,255,255,.72)' : 'rgba(4,7,14,.45)');
      }
      const headH = Math.max(...S.head.map((L) => L.h));
      const blockH = (S.kicker ? S.kicker.h + 44 : 0) + headH + 40;
      let y = Z.cy - blockH / 2;
      if (S.kicker) {
        fade(R, S.kicker, Z.left, y, C.accent, prog(lt, 0.35, 0.4) * (1 - prog(lt, d - 0.22, 0.22)), 'center', Z.w);
        y += S.kicker.h + 44;
      }
      const pg = pageAt(R, S.head, 0.12, d);
      const tOut = pg.tOut != null ? pg.tOut : d - 0.22;
      slam(R, pg.L, y + (headH - pg.L.h) / 2, C.ink, pg.t0, tOut);
      const u = ex(prog(lt, 0.55, 0.5)) * (1 - prog(lt, d - 0.22, 0.2));
      if (u > 0 && !R.textOnly) {
        R.ctx.fillStyle = C.accent;
        R.ctx.fillRect(Z.W / 2 - 260 * u, y + headH + 26, 520 * u, 14);
      }
    },
    fan(R) {
      const { P, lt, d } = R;
      const Z = P.Z;
      const n = R.S.cards, w = R.S.size;
      const baseY = Z.story ? Z.H * 0.98 : Z.H * 1.02;
      const r = Z.story ? 560 : Z.H * 0.42;
      for (let i = 0; i < n; i++) {
        const p = ex(prog(lt, 0.05 + i * 0.05, 0.6));
        const ang = lerp(0, (i - (n - 1) / 2) * 0.17, p);
        const lift = lerp(500, 0, eo(prog(lt, i * 0.04, 0.45)));
        R.ctx.save();
        R.ctx.translate(Z.W / 2, baseY + lift);
        R.ctx.rotate(ang);
        card(R, i, 0, -r, w, 0, 1 - prog(lt, d - 0.15, 0.15));
        R.ctx.restore();
      }
      // A design-tool selection frame on the middle card (no words).
      const sel = prog(lt, 0.75, 0.3) * (1 - prog(lt, d - 0.3, 0.15));
      if (sel > 0 && !R.textOnly) {
        const { ctx } = R;
        const bw = w + 20, bh = (CARD_H / CARD_W) * w + 20;
        const bx = Z.W / 2 - bw / 2, by = baseY - r - bh / 2;
        ctx.save();
        ctx.globalAlpha = sel;
        ctx.strokeStyle = R.C.accent; ctx.lineWidth = 4; ctx.strokeRect(bx, by, bw, bh);
        for (const [hx, hy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
          ctx.fillStyle = '#fff'; ctx.fillRect(hx - 9, hy - 9, 18, 18); ctx.strokeRect(hx - 9, hy - 9, 18, 18);
        }
        ctx.restore();
      }
    },
    sphere(R) {
      const { P, lt } = R;
      const Z = P.Z;
      const Rad = Math.min(440, Z.cH * 0.42), cx = Z.W / 2, cy = Z.cy;
      const grow = ex(prog(lt, 0, 0.6));
      const a = lt * 1.1 + 0.6, tilt = 0.32;
      const pts = spherePoints(R.S.cards).map(([x, y, z], i) => {
        const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
        const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt), z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
        const f = 900 / (900 + z2 * Rad);
        return { i, x: cx + x1 * Rad * f * grow, y: cy + y2 * Rad * f * grow, z: z2, f };
      }).sort((p, q) => q.z - p.z);
      for (const p of pts) card(R, p.i, p.x, p.y, R.S.size * p.f * grow, 0, 1, clamp((p.z + 0.2) * 0.55, 0, 0.75));
    },
    benefit(R) {
      const { P, lt, d } = R;
      const { Z } = P, C = R.C;
      const S = R.S;
      // Photo cards drifting behind, dimmed.
      if (P.sprites.length) {
        for (let i = 0; i < 4; i++) {
          const y = ((i * 560 + lt * 160) % (Z.H + 600)) - 300;
          const edge = clamp((y - Z.cTop) / 220, 0, 1) * clamp((Z.cBottom - y) / 220, 0, 1);
          card(R, i + R.s.data.index * 3, i % 2 ? Z.W - 150 : 150, y, 240, i % 2 ? 0.06 : -0.05, 0.35 * edge, 0.5);
        }
      }
      const textH = Math.max(...S.text.map((L) => L.h));
      const y0 = Z.cy - (textH + 140) / 2;
      fade(R, S.index, Z.left, y0, rgba(C.ink, 0.7), prog(lt, 0.05, 0.25) * (1 - prog(lt, d - 0.2, 0.2)), 'center', Z.w);
      if (!R.textOnly) {
        const k = back(prog(lt, 0.1, 0.35)) * (1 - prog(lt, d - 0.2, 0.2));
        if (k > 0) {
          const { ctx } = R;
          ctx.save();
          ctx.translate(Z.W / 2, y0 + 76);
          ctx.scale(k, k);
          ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
          E.drawIcon(ctx, 'check', 0, 0, 34, C.bg1, 3.2);
          ctx.restore();
        }
      }
      const pg = pageAt(R, S.text, 0.15, d);
      const tOut = pg.tOut != null ? pg.tOut : d - 0.22;
      slam(R, pg.L, y0 + 140 + (textH - pg.L.h) / 2, C.ink, pg.t0, tOut, { from: 1.08 });
    },
    counter(R) {
      const { P, lt, d } = R;
      const { Z } = P, C = R.C;
      const S = R.S;
      if (P.sprites.length) {
        for (let col = 0; col < 2; col++) for (let i = 0; i < 5; i++) {
          const y = ((i * 420 + lt * (col ? 260 : -200)) % 2100 + 2100) % 2100 - 200;
          card(R, i * 2 + col + 3, Z.W - 110 + col * 170, y, 170, col ? 0.05 : -0.04, 0.45, 0.45);
        }
      }
      const out = 1 - prog(lt, d - 0.2, 0.2);
      const parts = [S.amount, S.period, S.vacancies, S.word].filter(Boolean);
      const total = parts.reduce((a, L) => a + L.h, 0) + 36 * (parts.length - 1);
      let y = Z.cy - total / 2;
      const { ctx } = R;
      if (S.amount) {
        const p = prog(lt, 0.1, 0.25) * out;
        if (p > 0) {
          let L = S.amount;
          if (S.numeric != null && lt < 1.2) {
            const n = Math.round(S.numeric * ex(prog(lt, 0.1, 1.1)));
            const o = R.s.data.offer;
            L = E.textLayout(o.amount.replace(o.salary, String(n)), { font: P.F.head, size: S.amount.size, lh: 1, maxW: Infinity, locale: P.locale });
          }
          ctx.save();
          if (!R.textOnly) { ctx.shadowColor = rgba(C.accent, 0.35); ctx.shadowBlur = 60; }
          fade(R, L, Z.left, y, C.accent, p, 'center', Z.w);
          ctx.restore();
        }
        y += S.amount.h + 36;
      }
      if (S.period) {
        const q = prog(lt, 0.7, 0.35) * out;
        fade(R, S.period, Z.left, y - (1 - eo(q)) * 30, C.ink, q, 'center', Z.w);
        y += S.period.h + 36;
      }
      if (S.vacancies) {
        const q = prog(lt, S.amount ? 0.9 : 0.1, 0.3) * out;
        if (S.word) {
          ctx.save();
          if (!R.textOnly) { ctx.shadowColor = rgba(C.accent, 0.35); ctx.shadowBlur = 60; }
          fade(R, S.vacancies, Z.left, y, C.accent, q, 'center', Z.w);
          ctx.restore();
          y += S.vacancies.h + 36;
          fade(R, S.word, Z.left, y, C.ink, prog(lt, 0.6, 0.3) * out, 'center', Z.w);
        } else {
          // A chip that pops in.
          const s = lerp(0.6, 1, back(q));
          const w = S.vacancies.w + 70, h = S.vacancies.vh + 54;
          ctx.save();
          ctx.translate(Z.W / 2, y + S.vacancies.vh / 2);
          ctx.scale(s, s);
          if (!R.textOnly && q > 0) {
            ctx.globalAlpha = Math.min(1, q * 2);
            E.roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
            ctx.fillStyle = C.accent; ctx.fill();
          }
          ctx.translate(-Z.W / 2, -(y + S.vacancies.vh / 2));
          fade(R, S.vacancies, Z.left, y, U.ensureContrast(C.bg1, C.accent, 4.5), q, 'center', Z.w);
          ctx.restore();
        }
      }
    },
    wall(R) {
      const { P, lt, d } = R;
      const { Z } = P, C = R.C;
      const S = R.S;
      const { ctx } = R;
      if (P.sprites.length && !R.textOnly) {
        ctx.save();
        ctx.translate(Z.W / 2, Z.H / 2); ctx.rotate(-0.2); ctx.translate(-Z.W / 2, -Z.H / 2);
        const cw = S.card, step = cw * 1.2, cols = Math.ceil(2100 / step);
        const rows = Math.ceil(Z.H / step) + 1;
        for (let r = 0; r < rows; r++) {
          const dir = r % 2 ? 1 : -1, y = Z.H * 0.08 + r * step;
          for (let i = 0; i < cols; i++) {
            const x = ((i * step + lt * 380 * dir) % 2100 + 2100) % 2100 - 500;
            card(R, r * 3 + i, x, y, cw, 0, 0.9, 0.35);
          }
        }
        ctx.restore();
      }
      if (!R.textOnly) {
        const g = ctx.createLinearGradient(0, Z.cy - S.bandH / 2 - 120, 0, Z.cy + S.bandH / 2 + 120);
        g.addColorStop(0, rgba(C.bg1, 0)); g.addColorStop(0.5, rgba(C.bg1, 0.85)); g.addColorStop(1, rgba(C.bg1, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, Z.cy - S.bandH / 2 - 120, Z.W, S.bandH + 240);
      }
      const n = S.groups.length;
      const span = d / n;
      const gi = clamp(Math.floor(lt / span), 0, n - 1);
      const group = S.groups[gi];
      const total = group.reduce((a, L) => a + L.h, 0) + 24 * (group.length - 1);
      let y = Z.cy - total / 2;
      const local = { ...R, lt: lt - gi * span };
      group.forEach((L, k) => {
        const color = (gi + k) % 3 === 2 ? C.accent : C.ink;
        slam(local, L, y, color, 0.05 + k * 0.06, gi < n - 1 ? span - 0.18 : d - gi * span - 0.2, { from: 1.06 });
        y += L.h + 24;
      });
    },
    tunnel(R) {
      const { P, lt, d } = R;
      const { Z } = P, C = R.C;
      const S = R.S;
      const cx = Z.W / 2, cy = Z.cy, N = S.cards, Zd = 3400;
      if (!R.textOnly && P.sprites.length) {
        const cards = [];
        for (let i = 0; i < N; i++) {
          const z = (((i / N) * Zd - lt * 1500) % Zd + Zd) % Zd + 120;
          const a = i * 0.74 + lt * 0.9, f = 700 / z;
          cards.push({ i, z, x: cx + Math.cos(a) * 520 * f, y: cy + Math.sin(a) * 520 * f, f, rot: a + Math.PI / 2 });
        }
        cards.sort((p, q) => q.z - p.z);
        for (const c of cards) card(R, c.i, c.x, c.y, S.size * c.f, c.rot * 0.15, clamp((Zd - c.z) / 900, 0, 1) * clamp((c.z - 120) / 200, 0, 1), clamp(c.z / Zd, 0, 0.7));
      }
      if (S.count) {
        const k = prog(lt, 0.25, 0.25) * (1 - prog(lt, d - 0.2, 0.2));
        const v = P.content.vacancies;
        const n = /^\d+$/.test(v.count) ? Math.round(Number(v.count) * ex(prog(lt, 0.25, 0.5))) : null;
        const L = n != null && lt < 0.8 ? E.textLayout(`+${n}`, { font: P.F.head, size: S.count.size, lh: 1, maxW: Infinity, locale: P.locale }) : S.count;
        const y = Z.cy - (S.count.h + 30 + S.word.h) / 2;
        R.ctx.save();
        if (!R.textOnly) { R.ctx.shadowColor = rgba(C.accent, 0.4); R.ctx.shadowBlur = 60; }
        fade(R, L, Z.left, y, C.accent, k, 'center', Z.w);
        R.ctx.restore();
        fade(R, S.word, Z.left, y + S.count.h + 30, C.ink, k, 'center', Z.w);
      }
    },
    end(R) {
      const { P, lt } = R;
      const { Z } = P, C = R.C;
      const S = R.S;
      const { ctx } = R;
      // Ring of photos behind.
      if (P.sprites.length && !R.textOnly) {
        const cx = Z.W / 2, cy = Z.cy + Z.cH * 0.08, Rad = Math.min(430, Z.W * 0.4), N = S.ring.cards;
        const ring = [];
        for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + lt * 0.7; ring.push({ i, x: Math.sin(a), z: Math.cos(a) }); }
        ring.sort((p, q) => p.z - q.z);
        const grow = ex(prog(lt, 0, 0.7));
        for (const c of ring) {
          const f = 0.62 + 0.38 * (c.z + 1) / 2;
          card(R, c.i, cx + c.x * Rad * grow, cy + c.z * 70, S.ring.size * f, 0, (0.3 + 0.7 * (c.z + 1) / 2) * 0.4, (1 - (c.z + 1) / 2) * 0.5 + 0.35);
        }
      }
      S.items.forEach((it, k) => {
        const p = prog(lt, 0.1 + k * 0.25, 0.4);
        if (p <= 0) return;
        const dy = (1 - eo(p)) * 30;
        if (it.kind === 'logo') {
          if (R.textOnly) return;
          const img = P.logo, h = it.h, w = Math.min(Z.w, (img.width / img.height) * h);
          const hh = (img.height / img.width) * w;
          ctx.save(); ctx.globalAlpha = p;
          ctx.drawImage(img, Z.W / 2 - w / 2, it.y + (h - hh) / 2 + dy, w, hh);
          ctx.restore();
        } else if (it.kind === 'text') {
          fade(R, it.L, Z.left, it.y + dy, it.color === 'accent' ? C.accent : C.ink, p, 'center', Z.w);
        } else if (it.kind === 'pill') {
          const pulse = lt > 1.1 ? 1 + 0.035 * Math.max(0, Math.sin((lt - 1.1) * Math.PI * 2)) : 1;
          const s = lerp(0.5, 1, back(p)) * pulse;
          const w = it.L.w + it.h * 1.3, h = it.h, cy = it.y + h / 2;
          ctx.save();
          ctx.translate(Z.W / 2, cy); ctx.scale(s, s);
          if (!R.textOnly) {
            if (lt > 1.1) {
              for (let r = 0; r < 2; r++) {
                const rp = (lt * 0.9 + r * 0.5) % 1;
                ctx.save();
                ctx.globalAlpha = (1 - rp) * 0.5;
                E.roundRect(ctx, -w / 2 - rp * 50, -h / 2 - rp * 30, w + rp * 100, h + rp * 60, h / 2 + rp * 30);
                ctx.strokeStyle = C.cta; ctx.lineWidth = 6; ctx.stroke();
                ctx.restore();
              }
            }
            ctx.globalAlpha = Math.min(1, p * 2);
            ctx.drawImage(it.img, -w / 2 - GLOW, -h / 2 - GLOW);
          }
          ctx.globalAlpha = Math.min(1, p * 2);
          it.L.draw(ctx, -it.L.w / 2, -it.L.vh / 2, R.textOnly ? '#fff' : '#062B14', 'left', 0);
          ctx.restore();
        } else if (it.kind === 'qr') {
          if (!R.textOnly) {
            ctx.save(); ctx.globalAlpha = p;
            ctx.drawImage(it.img, Z.W / 2 - it.s / 2, it.y + dy, it.s, it.s);
            ctx.restore();
          }
          fade(R, it.hint, Z.left, it.y + it.s + 26 + dy, rgba(C.ink, 0.75), p, 'center', Z.w);
        }
      });
    },
  };

  // RGB split + flash on every cut (as in the prototype).
  function buffersFor(P, w, h) {
    if (!P.buffers || P.buffers.w !== w || P.buffers.h !== h) {
      const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      P.buffers = { w, h, buf: mk(), tint: mk() };
    }
    return P.buffers;
  }
  function glitch(R) {
    const cut = R.P.timeline.cuts.find((c) => R.t >= c && R.t < c + 0.13);
    if (cut == null) return;
    const k = 1 - (R.t - cut) / 0.13;
    const cv = R.ctx.canvas, w = cv.width, h = cv.height;
    const { buf, tint } = buffersFor(R.P, w, h);
    const b = buf.getContext('2d');
    b.clearRect(0, 0, w, h); b.drawImage(cv, 0, 0);
    const g = tint.getContext('2d');
    const { ctx } = R;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    for (const [col, dx] of [['#ff0040', 26 * k * R.scale], ['#00e5ff', -26 * k * R.scale]]) {
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); g.drawImage(buf, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.55 * k; ctx.drawImage(tint, dx, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.18 * k; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // Grain, vignette, small labels (the ad's kicker, the brand), progress bar.
  function overlay(R) {
    const { ctx, P, t } = R;
    const { Z } = P, C = R.C;
    if (!R.textOnly) {
      if (P.overlays) ctx.drawImage(P.overlays[Math.floor(t * 30) % 4], 0, 0, Z.W, Z.H);
      if (P.style.fx.tape) { tape(R, Z.top + 34, 28, 1); tape(R, Z.bottom - 66, 28, -1); }
      if (P.style.fx.letterbox) {
        const bar = Math.round(Z.H * 0.07);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, Z.W, bar); ctx.fillRect(0, Z.H - bar, Z.W, bar);
      }
    }
    if (!P.style.fx.labels) return;
    if (!P.labels) {
      P.labels = {
        left: P.content.kicker ? label(`● ${P.content.kicker}`, 24) : null,
        right: P.content.showLogo && !P.logo && P.content.brandName ? label(P.content.brandName, 24) : null,
      };
    }
    const last = R.s.kind === 'end';
    const y = Z.top;
    if (P.labels.left) fade(R, P.labels.left, Z.left - 16, y, rgba(C.ink, 0.78), 1);
    if (!last && P.labels.right) fade(R, P.labels.right, Z.left, y, rgba(C.ink, 0.55), 1, 'right', Z.w + 16);
    if (!last && P.logo && !R.textOnly) {
      const h = 52, w = Math.min(220, (P.logo.width / P.logo.height) * h);
      ctx.drawImage(P.logo, Z.W - 64 - w, y - 6, w, (P.logo.height / P.logo.width) * w);
    }
    if (!R.textOnly) {
      ctx.fillStyle = rgba(C.ink, 0.14); ctx.fillRect(64, Z.bottom - 30, Z.W - 128, 4);
      ctx.fillStyle = C.accent; ctx.fillRect(64, Z.bottom - 30, (Z.W - 128) * clamp(t / P.timeline.duration, 0, 1), 4);
    }
    const code = label(`${t.toFixed(1).padStart(4, '0')}s / ${P.timeline.duration.toFixed(1)}s`, 22, false);
    fade(R, code, Z.left - 16, Z.bottom - 14, rgba(C.ink, 0.5), 1, 'right', Z.w + 32);
  }

  function render(ctx, P, o = {}) {
    if (P.recipe) { renderRecipe(ctx, P, o); return; }
    const scale = o.scale || 1;
    const t = clamp(o.t || 0, 0, P.timeline.duration - 1e-6);
    const textOnly = o.layer === 'text';
    if (P.style.poster) {
      P.anim.t = t;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = P.project.style.bg || '#FFFFFF';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      E.render(ctx, P.project, { format: P.fmt.id, locale: P.locale, images: P.images, scale, mode: 'export', anim: P.anim, camera: P.posterCamera ? P.posterCamera(t) : null });
      ctx.restore();
      return;
    }
    const i = sceneAt(P.timeline, t);
    const s = P.timeline.scenes[i];
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    if (textOnly) ctx.clearRect(0, 0, P.Z.W, P.Z.H);
    const R = { ctx, P, t, lt: t - s.start, d: s.end - s.start, s, S: P.scenes[i], textOnly, scale, C: P.sceneColors[i], flat: !!P.style.fx.flip };
    if (!textOnly) background(R, s.kind);
    DRAW[s.kind](R);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    if (!textOnly && P.style.fx.glitch) glitch(R);
    if (!textOnly && P.style.fx.flash) flash(R);
    overlay(R);
    ctx.restore();
  }

  // What the video has to say but does not show (too little time, or a style
  // without that scene): how many benefits, highlights and positions, and
  // whether the intro, the WhatsApp conversation and the closing line are out
  // (offer: the salary or the vacancies never appear).
  function leftOut(P) {
    const none = { benefits: 0, highlights: 0, positions: 0, intro: false, chat: false, closing: false, offer: false };
    if (P.style.poster) return none;
    if (P.recipe && P.schedule) {
      const l = P.schedule.left;
      return { ...none, benefits: l.benefits, highlights: l.highlights, positions: l.positions, intro: !!l.intro, chat: !!l.chat, closing: !!l.closing, offer: l.highlights > 0 };
    }
    if (P.recipe) {
      const has = (k) => P.acts.some((a) => a.kind === k);
      const offer = !!(P.content.offer || P.content.vacancies) && !has('D');
      return {
        ...none,
        // a recipe without pages shows the benefits in its one act; only a missing act leaves them out
        benefits: has('M') ? 0 : P.content.benefits.length,
        highlights: offer ? P.content.highlights.length : 0,
        positions: P.content.positions.length && !has('L') ? P.content.positions.length : 0,
        offer,
      };
    }
    // a style shows the salary and the vacancies (its counter), never the intro or the closing line
    const has = (kind) => P.timeline.scenes.some((x) => x.kind === kind);
    const c = P.content;
    const offer = !!(c.offer || c.vacancies) && !has('counter') && !(c.vacancies && has('tunnel'));
    return {
      ...none,
      benefits: Math.max(0, c.benefits.length - P.timeline.scenes.filter((x) => x.kind === 'benefit').length),
      highlights: offer ? [c.offer, c.vacancies].filter(Boolean).length : 0,
      positions: c.positions.length && !has('wall') ? c.positions.length : 0,
      offer,
    };
  }

  // ================================================================ video recipes
  // A recipe (js/recipes/<id>.js) is a chain of acts: hook (H), shapes (M),
  // 2D→3D (V), data (D), list (L), conversation (C), card (K), loop (O).
  // RS.motionTimeline.acts picks them for the duration, the content and the
  // contact hold; each act draws itself from (R, A), A = { kind, start, end, d,
  // lt, prev, next, bespoke }. An act whose predecessor is not its usual one
  // (bespoke false) starts with the recipe's travel move.
  const KIT = () => RS.motionKit;
  const ACT_NAMES = { H: 'hook', I: 'intro', M: 'shapes', V: 'volume', D: 'data', L: 'list', C: 'chat', F: 'closing', K: 'card', O: 'loop' };
  const CANONICAL = { M: 'H', V: 'M', D: 'V', L: 'D', C: 'L', K: 'C', O: 'K' };
  const TRAVEL = 0.4;

  // The acts a model with pages can play for this content (its needs applied).
  function hasFor(def, c) {
    const has = { M: c.benefits.length > 0, V: true, D: c.highlights.length > 0, L: c.positions.length >= 2, C: !!(c.contact && c.chat), F: !!c.closing, I: !!c.intro };
    for (const [k, needs] of Object.entries(def.needs || {})) if (!needs.every((n) => has[n])) has[k] = false;
    return has;
  }
  const scheduleOptions = (def, c, v, style) => ({ duration: v.duration, hold: v.hold, order: def.order, has: hasFor(def, c), offered: style.durations.filter((d) => d >= 10) });
  // The lengths «Duração» offers for this ad: those the information can fill
  // (ok), how many more items the others need, and «Automática». adds: what
  // makes a video longer — 'items' (a recipe: a benefit or a highlight is one
  // more page of 2 s) or 'benefits' (a style: a short benefit scene adds 1.5 s
  // at the longest).
  function lengths(project, o = {}) {
    const v = project.video || M.DEFAULT_VIDEO;
    const style = styleOf(v.motion);
    const def = style.recipe;
    if (def && def.pages) {
      const c = TL.content(project, o.locale || project.locale);
      const S = TL.schedule(c, { ...scheduleOptions(def, c, v, style), duration: 'auto' });
      return { auto: S.auto, max: S.max, adds: 'items', options: [...(style.durations.includes(6) ? [{ value: 6, seconds: 6, ok: true, missing: 0 }] : []), ...S.lengths] };
    }
    if (def || style.durations.length === 1) return { auto: style.defaultDuration, max: Math.max(...style.durations), adds: def ? 'items' : 'benefits', options: style.durations.map((d) => ({ value: d, seconds: d, ok: true, missing: 0 })) };
    // a style: its scenes measured on a Story frame, with the library's photos when it shows photos
    let rng = POSTER_RANGE;
    if (!style.poster) {
      const c = TL.content(project, o.locale || project.locale);
      c.photos = style.fx.cards ? (o.photos != null ? o.photos : 6) : 0;
      const P = styleFrame(project, { ...o, lite: true }, style, c, M.FORMATS.story, { hero: null, cards: [] });
      rng = TL.range(c, { scenes: style.scenes, hold: v.hold === 4 ? 4 : 2, minBeats: (kind, data) => needBeats(P, kind, data) });
    }
    const options = style.durations.map((d) => {
      const ok = d <= 10 || d <= rng.max;
      return { value: d, seconds: d, ok, missing: ok ? 0 : Math.ceil((d - (rng.most != null ? rng.most : rng.max)) / 1.5) };
    });
    return { auto: rng.auto, max: rng.max, adds: 'benefits', options: [...options, { value: 'auto', seconds: rng.auto, ok: true, missing: 0 }] };
  }
  // Default intro (I) and closing line (F): the person's words rising into
  // place one after the other on the beat, in the model's colours and letter.
  function lineAct(key, tag) {
    return (R, A) => {
      const P = R.P, L = P[key];
      if (!L) return;
      const { ctx } = R;
      const top = P.Z.cy - L.vh / 2;
      const ws = KIT().words(L, P.Z.left, top, 'center', P.Z.w);
      const step = Math.min(0.22, 1.2 / Math.max(1, ws.length));
      const k = (i) => KIT().spring(KIT().win(A.lt, 0.05 + i * step, 0.4));
      ws.forEach((w, i) => {
        const e = k(i);
        if (e <= 0) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(w.x - 10, w.top - L.size * 0.45, w.w + 20, L.capPx + L.size * 0.8); ctx.clip();
        KIT().fillText(ctx, w.t, w.x, w.base + (1 - e) * L.lhPx, L, P.C.ink);
        ctx.restore();
      });
      // a line counts as shown once all its words have arrived
      L.lines.forEach((ln, li) => {
        const idx = ws.map((w, i) => (w.line === li ? i : -1)).filter((i) => i >= 0);
        if (idx.length && idx.every((i) => k(i) >= 0.95)) R.rec(P.Z.left + (P.Z.w - L.widths[li]) / 2, top + li * L.lhPx, L.widths[li], L.capPx, tag, ln);
      });
    };
  }
  const DEFAULT_ACTS = { I: lineAct('introL', 'intro'), F: lineAct('closingL', 'fecho') };
  const actOf = (def, kind) => (def.acts && def.acts[kind]) || DEFAULT_ACTS[kind];

  function register(def) {
    const old = STYLES.findIndex((s) => s.id === def.id);
    if (old >= 0) STYLES.splice(old, 1);
    const bgModes = def.bgModes || ['dark'];
    const entry = {
      id: def.id, name: def.name, concept: def.concept, recipe: def, durations: def.pages ? [6, 10, 15, 20, 25, 30] : [6, 10, 15], defaultDuration: 15,
      bgModes, palettes: def.palettes, palette: def.palettes[bgModes[0]], font: null, fx: {}, scenes: [], test: !!def.test,
    };
    // recipes first, in the order of RS.model.RECIPES
    const order = (id) => { const i = M.RECIPES.indexOf(id); return i < 0 ? 99 : i; };
    let at = 0;
    while (at < STYLES.length && STYLES[at].recipe && order(STYLES[at].id) <= order(def.id)) at++;
    STYLES.splice(at, 0, entry);
    return entry;
  }

  // The recipe's colours (bg, ink, main, accent): its own, the ad's brand
  // colours (main = primary, accent = accent) or a ready palette, then the
  // highlight; WhatsApp green for the button; ink readable on the background.
  function recipeColors(style, project) {
    const v = project.video || {};
    const mode = style.bgModes.includes(v.bg) ? v.bg : style.bgModes[0];
    const c = { ...style.palettes[mode], mode };
    const pal = v.colors === 'brand' ? (project.style || {}) : M.PALETTES.find((x) => x.id === v.colors);
    if (pal) {
      if (pal.primary) c.main = U.normHex(pal.primary);
      if (pal.accent) c.accent = U.normHex(pal.accent);
    }
    if (v.accent) c.accent = U.normHex(v.accent);
    c.accentChosen = U.normHex(c.accent);
    c.accentPicked = !!v.accent; // «Cor de destaque» chosen by the person

    c.cta = CTA; c.ctaInk = '#062B14';
    c.ink = U.ensureContrast(c.ink, c.bg, 4.5);
    return style.recipe.colors ? style.recipe.colors(c) : c;
  }

  const FOCUS = Object.freeze({ x: 0.5, y: 0.4 }); // a photo without an id: a little above the middle
  function prepareRecipe(project, o, style) {
    const def = style.recipe;
    const v = project.video || M.DEFAULT_VIDEO;
    const fmt = M.FORMATS[o.format] || M.FORMATS.story;
    const locale = o.locale || project.locale;
    const c = TL.content(project, locale);
    // a model without pages (until it gets its 10–30 s) shows up to three benefits in 6–15 s
    if (!def.pages) { c.benefits = c.benefits.slice(0, 3); c.benefitIds = c.benefitIds.slice(0, 3); c.icons = c.icons.slice(0, 3); }
    const font = M.FONTS[v.font];
    const ph = o.photos || {};
    const P = {
      project, locale, fmt, Z: KIT().zones(fmt), content: c, C: recipeColors(style, project),
      F: font ? { head: font.head, bold: font.strong } : { ...def.font }, style, recipe: def, lite: !!o.lite, images: o.images || {},
      photos: ((ph.full && ph.full.length ? ph.full : ph.cards) || []).filter(Boolean), minTextSize: Infinity, upper: !project.style || project.style.upper !== false,
    };
    // the point of each photo the video keeps in the centre («Enquadrar», else its default)
    const focus = new Map();
    P.focusOf = (img) => {
      if (!img) return FOCUS;
      if (!focus.has(img)) focus.set(img, photoFocus(project, img) || FOCUS);
      return focus.get(img);
    };
    let list, duration;
    if (def.pages) {
      P.schedule = TL.schedule(c, scheduleOptions(def, c, v, style));
      list = P.schedule.acts;
      duration = P.schedule.duration;
    } else {
      duration = [6, 10, 15].includes(v.duration) ? v.duration : 15;
      const has = { M: c.benefits.length > 0, V: true, D: !!(c.offer || c.vacancies), L: c.positions.length >= 2, C: !!(c.contact && c.chat) };
      for (const [k, needs] of Object.entries(def.needs || {})) if (!needs.every((n) => has[n])) has[k] = false;
      list = TL.acts(Object.keys(has).filter((k) => has[k]), { duration, hold: v.hold });
    }
    // the intro and the closing line always enter with the travel move
    const canon = { ...CANONICAL, I: null, F: null, ...(def.canonical || {}) };
    P.acts = list.map((a, i) => ({
      ...a, d: a.end - a.start, name: ACT_NAMES[a.kind], prev: i ? list[i - 1].kind : null, next: list[i + 1] ? list[i + 1].kind : null,
      // a continuous recipe (one camera move over one world) follows any act itself
      bespoke: i === 0 || !!def.continuous || canon[a.kind] === list[i - 1].kind,
    }));
    P.act = (kind) => P.acts.find((a) => a.kind === kind) || null;
    P.timeline = { duration, scenes: P.acts.map((a) => ({ kind: a.name, act: a.kind, start: a.start, end: a.end, data: {} })), cuts: P.acts.slice(1).map((a) => a.start), events: [], synth: [] };
    // the model's own words in this language (his, else the model's translation)
    P.label = (key) => c.labelFor(def.id, key, (def.labels || {})[key]);
    // the default intro and closing acts: the person's line, centred in the zone
    const lineLayout = (text) => KIT().fit(P, text, { font: P.F.head, upper: false, maxSize: 96, minSize: 48, maxW: P.Z.w, maxLines: 5, lh: 1.1, maxH: P.Z.cH * 0.7 });
    if (P.act('I') && !def.acts.I) P.introL = lineLayout(c.intro);
    if (P.act('F') && !def.acts.F) P.closingL = lineLayout(c.closing);
    def.prepare(P);
    P.timeline.synth = def.sound(P);
    if (!Number.isFinite(P.minTextSize)) P.minTextSize = 0;
    return P;
  }

  function renderRecipe(ctx, P, o) {
    const scale = o.scale || 1;
    const t = clamp(o.t || 0, 0, P.timeline.duration - 1e-6);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.imageSmoothingEnabled = true;
    const R = { ctx, P, t, scale, boxes: o.boxes || null, recording: true, moving: false, lite: P.lite };
    R.rec = KIT().recorder(R);
    ctx.fillStyle = P.C.bg; ctx.fillRect(0, 0, P.fmt.w, P.fmt.h);
    let i = P.acts.length - 1;
    while (i > 0 && t < P.acts[i].start) i--;
    const A = { ...P.acts[i], lt: t - P.acts[i].start };
    const def = P.recipe;
    // a new page of the same act arrives with the travel move, unless the model draws it
    const pg = def.pages && !def.pageMove && !def.continuous && A.pages && A.pages.length > 1 ? KIT().page(A) : null;
    if (!A.bespoke && A.prev && A.lt < TRAVEL) travel(R, P, P.acts[i - 1], A);
    else if (pg && pg.index > 0 && pg.lt < TRAVEL) travelMove(R, P, { ...A, lt: pg.index * KIT().PAGE_S - 1e-3 }, A, pg.lt);
    else actOf(def, A.kind)(R, A);
    ctx.restore();
  }

  // The recipe's travel move between two acts that do not follow each other
  // in the full chain: crane (vertical), scroll (vertical, 6 px steps), whip
  // (horizontal), glide (vertical on a spring), push (into a growing opening).
  function travel(R, P, prev, A) {
    travelMove(R, P, { ...prev, d: prev.end - prev.start, lt: prev.end - prev.start - 1e-3 }, A, A.lt);
  }
  // The move from prevA (drawn as it is) to A, lt seconds into the move. Also
  // used between two pages of one act. flip: the frame folds over its
  // horizontal axis and unfolds as the new one; page: the old page is turned
  // away to the left over the new one.
  function travelMove(R, P, prevA, A, lt) {
    const { ctx } = R;
    const def = P.recipe, kind = def.travel || 'crane';
    const W = P.fmt.w, H = P.fmt.h;
    const k = clamp(lt / TRAVEL, 0, 1);
    const draw = (a) => actOf(def, a.kind)(R, a);
    const moving = R.moving;
    R.moving = true;
    try {
      if (kind === 'flip') {
        const first = k < 0.5;
        const sy = first ? 1 - KIT().expoIn(k * 2) : KIT().expoOut((k - 0.5) * 2);
        ctx.save(); ctx.translate(0, H / 2); ctx.scale(1, Math.max(0.001, sy)); ctx.translate(0, -H / 2);
        draw(first ? prevA : A);
        ctx.restore();
        return;
      }
      if (kind === 'page') {
        draw(A);
        const e = KIT().expoInOut(k);
        ctx.save(); ctx.translate(-W * 1.15 * e, H); ctx.rotate(-0.14 * e); ctx.translate(0, -H);
        ctx.fillStyle = P.C.bg; ctx.fillRect(0, 0, W, H);
        draw(prevA);
        ctx.restore();
        return;
      }
      if (kind === 'push') {
        const z = 1 + 0.9 * KIT().expoIn(k);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); draw(prevA); ctx.restore();
        const s = KIT().expoInOut(k);
        ctx.save();
        ctx.beginPath(); ctx.rect(W / 2 - (W * s) / 2, H / 2 - (H * s) / 2, W * s, H * s); ctx.clip();
        ctx.fillStyle = P.C.bg; ctx.fillRect(0, 0, W, H);
        draw(A);
        ctx.restore();
        return;
      }
      const ease = (x) => (kind === 'glide' ? KIT().spring(x) : KIT().expoInOut(x));
      const across = kind === 'whip';
      const off = (x) => -(across ? W : H) * ease(x);
      let d = off(k);
      if (kind === 'scroll') d = Math.round(d / 6) * 6;
      ctx.save(); ctx.translate(across ? d : 0, across ? 0 : d); draw(prevA); ctx.restore();
      ctx.save();
      ctx.translate(across ? d + W : 0, across ? 0 : d + H);
      ctx.fillStyle = P.C.bg; ctx.fillRect(0, 0, W, H);
      draw(A);
      ctx.restore();
      if (kind === 'whip' || kind === 'crane') {
        const v = KIT().speed((x) => off(clamp(x / TRAVEL, 0, 1)), lt);
        KIT().smear(R, across ? v : 0, across ? 0 : v);
      }
    } finally {
      R.moving = moving;
    }
  }

  // Photos for the recipes: the ones the person chose (still there), else the
  // library photos of the ad's trades, then their own photos of those trades.
  const RELATED_TRADES = ['obras', 'servente'];
  function photoIds(project, library, mine) {
    const v = project.video || {};
    const lib = library || [], own = mine || [];
    if (v.photos && v.photos.mode === 'chosen') {
      const ok = v.photos.ids.filter((id) => lib.some((it) => it.id === id) || own.some((it) => it.asset === id));
      if (ok.length) return ok;
    }
    const cats = (project.trades || []).map((id) => RS.trades.get(id) && RS.trades.get(id).photo).filter(Boolean);
    const out = [];
    for (const cat of cats) for (const it of lib) if (it.cat === cat && !out.includes(it.id)) out.push(it.id);
    for (const cat of cats) for (const it of own) if (it.cat === cat && !out.includes(it.asset)) out.push(it.asset);
    if (out.length < M.MAX_VIDEO_PHOTOS) for (const cat of RELATED_TRADES) for (const it of lib) if (it.cat === cat && !out.includes(it.id) && !cats.includes(cat)) out.push(it.id);
    return out;
  }
  // Up to n full-size photos (the ad's own photo first, unless photos were
  // chosen), each with its id (photoIdOf).
  async function recipePhotos(project, images, n = M.MAX_VIDEO_PHOTOS) {
    const [lib, mine] = await Promise.all([RS.library.index().catch(() => ({ items: [] })), RS.library.userItems().catch(() => [])]);
    const chosen = project.video && project.video.photos && project.video.photos.mode === 'chosen';
    const own = ownPhoto(project, images);
    const out = own && !chosen ? [own] : [];
    for (const id of photoIds(project, lib.items, mine)) {
      if (out.length >= n) break;
      try {
        const item = lib.items.find((it) => it.id === id);
        const im = item ? await loadImage(await RS.library.full(id)) : await RS.assets.load(id);
        if (im) out.push(tagPhoto(im, id, item || mine.find((it) => it.asset === id)));
      } catch { /* a photo that cannot be read is left out */ }
    }
    return out;
  }

  return { STYLES, styleOf, colorsFor, photoSet, prepare, render, leftOut, lengths, register, photoIds, recipePhotos, tagPhoto, photoIdOf, photoFocus, TRAVEL };
})();
