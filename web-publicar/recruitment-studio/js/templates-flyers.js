// Flyer templates drawn like their canvas designs (js/poster-kit.js): brush
// headlines, a row of icon bullets, "change your life", the WhatsApp number in
// a box and the "send your CV" pill at the bottom.
window.RS = window.RS || {};

(() => {
  const E = RS.engine;
  const U = RS.util;
  const K = RS.posterKit;
  const { define } = RS.templates;
  const { TL } = E;
  const { BRAND, sample, fillRect, area, part, headLine, phoneKey, bigPhone } = K;

  const INK = '#000000', DARK = '#111111', WHITE = '#FFFFFF';
  // The design's dark ink on the accent, white when the accent is dark too.
  const inkOn = (c, ink) => (U.contrast(c, ink) >= 3 ? ink : WHITE);
  const same = (a, b) => String(a || '').toUpperCase() === b;
  // The design's own shades for its default background; mixed from another one.
  const shades = (bg, own) => (same(bg, own.bg) ? own : { bg, light: U.mix(bg, WHITE, 0.12), deep: U.mix(bg, INK, 0.3) });

  const NAME = { fam: 'anton', size: 44, ls: 3, lh: 1 };
  const SWISS = { fam: 'anton', size: 40, ls: 2, lh: 1 };
  const WA_ONLY = { fam: 'barlow', weight: 900, size: 26, ls: 4, lh: 1 };
  const CV = { fam: 'barlow', weight: 900, size: 38, ls: 0.5, lh: 1 };
  const LIFE = { fam: 'barlow', weight: 900, italic: true, ls: 1, lh: 1 };

  const words = (S) => K.up(S, S.t.headline).trim().replace(/\s*\n\s*/g, ' ');

  // ---------------------------------------------------------------- pieces
  // The company, 60 tall: the logo image, else the hard-hat disc and the name
  // (o.disc false: the name alone, o.f its font). x is the right edge when `right`.
  function mark(S, x, y, right, o) {
    if (!S.show.logo) return;
    const ctx = S.ctx, img = S.images.logo;
    if (img) {
      const lw = Math.min(60 * (img.width / img.height), 420), left = right ? x - lw : x;
      E.enter(S, TL.logo, 0, 'fade', { x: left, y, w: lw, h: 60 }, () => K.logo(S, left, y, 60, 420, o.bg));
      return;
    }
    const name = K.brandName(S);
    if (!name) return;
    const disc = o.disc !== false, pad = disc ? 74 : 0;
    const f = K.fitted(S, name, o.f || NAME, 560).f;
    const w = pad + K.width(ctx, name, f), left = right ? x - w : x;
    const b = { x: left, y, w, h: 60 };
    S.hit('logo', b.x, b.y, b.w, b.h);
    E.enter(S, TL.logo, 0, 'fade', b, () => {
      if (disc) {
        K.circle(ctx, left + 30, y + 30, 30, o.circle);
        K.icon(ctx, 'hardhat', left + 13, y + 13, 34, o.icon);
      }
      K.text(ctx, name, left + pad, y + (60 - K.lineH(f)) / 2, f, { color: o.color });
    });
  }

  // Swiss flag and "SWITZERLAND", 48 tall.
  function swiss(S, x, y, right, color) {
    const ctx = S.ctx, s = K.labels(S).swiss;
    const f = K.fit(ctx, s, SWISS, 300).f;
    const w = 60 + K.width(ctx, s, f), left = right ? x - w : x;
    E.enter(S, TL.logo, 0, 'fade', { x: left, y, w, h: 48 }, () => {
      K.flag(ctx, left, y, 42);
      K.text(ctx, s, left + 60, y + (48 - K.lineH(f)) / 2, f, { color });
    });
  }

  // One headline line on a brush stroke turned by `deg`.
  function brushLine(S, i, b, deg, color, s, f, ink) {
    if (!s) return;
    const ctx = S.ctx;
    const t = K.fitted(S, s, f, b.w - 16);
    headLine(S, i, b, () => K.turned(ctx, b, deg, () => {
      K.brush(ctx, b, color);
      K.text(ctx, t.lines[0], b.x + b.w / 2, b.y + (b.h - K.lineH(t.f)) / 2, t.f, { color: ink, align: 'center' });
    }));
  }

  // The trade in big next to its icon, centred in the box b (the kicker).
  function tradeTitle(S, b, ic, size, f, color, iconColor, gap) {
    const kick = K.kicker(S);
    if (!kick) return;
    const ctx = S.ctx;
    const t = K.fitted(S, kick, f, b.w - size - gap - 40);
    const w = size + gap + K.width(ctx, t.lines[0], t.f), x = b.x + (b.w - w) / 2;
    S.hit('kicker', b.x, b.y, b.w, b.h);
    E.enter(S, TL.kicker, 0, 'rise', b, () => {
      K.icon(ctx, ic, x, b.y + (b.h - size) / 2, size, iconColor);
      K.text(ctx, t.lines[0], x + size + gap, b.y + (b.h - K.lineH(t.f)) / 2, t.f, { color });
    });
  }

  // The bullets: pill(i) gives each one's box and look.
  function bullets(S, pill) {
    K.benefits(S).forEach((b, i) => {
      const p = pill(i);
      part(S, `benefit:${b.id}`, TL.benefits, i * TL.benefit, 'slide', { x: p.x, y: p.y, w: p.w, h: p.h },
        () => K.pill(S, p.x, p.y, p.w, K.up(S, b.text), b.icon, p));
    });
  }

  // Photo in a framed box (o: fill, border, bw, r, shadow).
  function framed(S, x, y, w, h, o) {
    const inner = K.box(S.ctx, x, y, w, h, o);
    K.photo(S, inner, { r: o.r ? o.r - o.bw : 0 });
  }

  // The badge ("change your life") on a band slanted by skewX(-12deg); the text stays upright.
  function slantBand(S, b, color, size, ink) {
    const s = K.badge(S);
    if (!s) return;
    const ctx = S.ctx;
    const f = K.fitted(S, s, { ...LIFE, size }, b.w - 80).f;
    const cx = b.x + b.w / 2;
    part(S, 'badge', TL.badge, 0, 'stamp', b, () => {
      ctx.save();
      ctx.translate(cx, b.y + b.h / 2);
      ctx.transform(1, 0, Math.tan((-12 * Math.PI) / 180), 1, 0, 0);
      fillRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, color);
      ctx.restore();
      K.text(ctx, s, cx, b.y + (b.h - K.lineH(f)) / 2, f, { color: ink, align: 'center' });
    });
  }

  // "WhatsApp only" over the number, next to the WhatsApp disc, centred in the
  // box drawn by frame() (which returns its padding box).
  function waBox(S, b, frame, o) {
    const num = K.phone(S);
    if (!num) return;
    const ctx = S.ctx, label = K.labels(S).waOnly;
    part(S, phoneKey(S), TL.contacts, 0, 'rise', b, () => {
      const p = frame();
      const fp = K.fitted(S, num, { fam: 'anton', size: o.fs, lh: 0.95 }, p.w - o.d - 24 - 60).f;
      const fl = K.fit(ctx, label, WA_ONLY, p.w - o.d - 84).f;
      const colW = Math.max(K.width(ctx, num, fp), K.width(ctx, label, fl));
      const x = p.x + (p.w - (o.d + 24 + colW)) / 2, tx = x + o.d + 24;
      const top = p.y + (p.h - K.lineH(fl) - K.lineH(fp)) / 2;
      K.wa(ctx, x, p.y + (p.h - o.d) / 2, o.d, { ring: o.ring });
      K.text(ctx, label, tx, top, fl, { color: o.label });
      bigPhone(S, num, tx, top + K.lineH(fl), fp, { color: o.phone });
    });
  }

  // "Send your CV by WhatsApp" pill at the bottom.
  function cvPill(S, o) {
    if (!K.phone(S)) return;
    const ctx = S.ctx, s = K.labels(S).cv;
    const b = { x: 100, y: 1270, w: 880, h: 58 };
    const f = K.fit(ctx, s, CV, b.w - 108).f;
    const x = 540 - (50 + K.width(ctx, s, f)) / 2;
    E.enter(S, TL.contacts, TL.contact, 'rise', b, () => {
      K.box(ctx, b.x, b.y, b.w, b.h, { fill: o.bg, border: o.border, bw: 4, r: 29 });
      K.icon(ctx, 'filetext', x, b.y + 11, 36, o.color);
      K.text(ctx, s, x + 50, b.y + (b.h - K.lineH(f)) / 2, f, { color: o.color });
    });
  }

  // repeating-linear-gradient(135deg, color 0 on, transparent on period) over the page.
  function stripes(ctx, ext, color, on, period) {
    const [x, y, w, h] = area(ext);
    const a = on * Math.SQRT2, p = period * Math.SQRT2, y1 = y + h;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.beginPath();
    for (let u = Math.floor((x + y) / p) * p; u < x + w + y1; u += p) {
      ctx.moveTo(u - y, y); ctx.lineTo(u + a - y, y); ctx.lineTo(u + a - y1, y1); ctx.lineTo(u - y1, y1); ctx.closePath();
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // radial-gradient(circle at px% py%, light, bg at mid, deep) over the page.
  function glow(ctx, ext, px, py, mid, p) {
    const cx = 1080 * px, cy = 1350 * py;
    const r = Math.max(...[[0, 0], [1080, 0], [0, 1350], [1080, 1350]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, p.light);
    g.addColorStop(mid, p.bg);
    g.addColorStop(1, p.deep);
    fillRect(ctx, ...area(ext), g);
  }

  // Shared look of the four flyers (used by the editor, the video and the sheet).
  function theme(R, t) {
    const a = t.accent, ink = U.onColor(a), light = U.onColor(t.bg) !== WHITE;
    const text = U.ensureContrast(t.text, t.bg, 4.5);
    return {
      ...t, text, headline: ink, kicker: ink, kickerBg: ink, kickerFg: a, bar: a,
      brand: light ? INK : WHITE, brandTag: light ? U.ensureContrast(a, t.bg, 3) : a,
      iconBg: a, iconFg: ink, iconLine: light ? INK : WHITE, iconShadow: INK,
      boxBg: t.bg, boxLine: light ? INK : a, boxTitle: U.ensureContrast(a, t.bg, 3), boxText: text, bullet: U.ensureContrast(a, t.bg, 3),
      badgeBg: a, badgeFg: ink,
    };
  }
  const flyer = (o) => define({
    description: 'Panfleto cheio: título em pincelada, muitos pontos com ícones e o WhatsApp em grande.',
    brand: BRAND,
    theme,
    ...o,
    defaults: { fonts: 'impact', upper: true, ...o.defaults },
  });
  const LIFE_TEXT = 'Mude a sua vida!';

  // ---------------------------------------------------------------- Azul
  const AZUL = { bg: '#0B2545', light: '#15407A', deep: '#061A33' };

  // The positions in a row with dots between (the kicker when there are none).
  function azulJobs(S, ext, p) {
    const ctx = S.ctx, a = S.theme.accent;
    fillRect(ctx, ext.x0, 426, ext.x1 - ext.x0, 82, a);
    fillRect(ctx, ext.x0, 430, ext.x1 - ext.x0, 74, p.deep);
    const jobs = K.positions(S).map((q) => ({ key: `position:${q.id}`, s: K.up(S, q.text) }));
    const kick = K.kicker(S);
    const items = jobs.length ? jobs : kick ? [{ key: 'kicker', s: kick }] : [];
    if (!items.length) return;
    const f0 = { fam: 'barlow', weight: 900, size: 42, ls: 1, lh: 1 };
    const sep = 50, natural = items.reduce((s, it) => s + K.width(ctx, it.s, f0), 0);
    const k = Math.min(1, (1000 - sep * (items.length - 1)) / natural);
    if (k < 0.97) S.noteScale(k);
    const f = K.sized(f0, k);
    const ws = items.map((it) => K.width(ctx, it.s, f));
    let x = 540 - (ws.reduce((s, w) => s + w, 0) + sep * (items.length - 1)) / 2;
    const top = 430 + (74 - K.lineH(f)) / 2;
    items.forEach((it, i) => {
      const left = x;
      part(S, it.key, TL.positions, i * TL.position, 'rise', { x: left, y: top, w: ws[i], h: K.lineH(f) }, () => {
        K.text(ctx, it.s, left, top, f, { color: WHITE });
        if (i) K.circle(ctx, left - sep / 2, 467, 7, a);
      });
      x += ws[i] + sep;
    });
  }

  flyer({
    id: 'panfleto-azul',
    name: 'Panfleto Azul',
    icon: 'users',
    trade: 'obras',
    defaults: { primary: '#0B2545', accent: '#38D3FF', bg: '#0B2545', text: '#FFFFFF' },
    texts: () => sample({ headline: 'Recrutamento imediato', positions: ['Cofradores', 'Operadores de grua', 'Ajudantes'], badge: LIFE_TEXT }),
    render(R) {
      K.stage(R, (S, ext) => {
        glow(S.ctx, ext, 0.75, 0.45, 0.55, shades(S.theme.bg, AZUL));
        stripes(S.ctx, ext, 'rgba(255,255,255,0.035)', 2, 16);
      }, (S, ext) => {
        const a = S.theme.accent, p = shades(S.theme.bg, AZUL), ink = inkOn(a, p.bg), on = U.onColor(p.bg, DARK);
        mark(S, 40, 30, false, { circle: a, icon: ink, color: on, bg: p.bg });
        swiss(S, 1040, 36, true, on);
        const [l1, l2] = K.headLines(S);
        S.hit('headline', 70, 108, 940, 298);
        brushLine(S, 0, { x: 70, y: 108, w: 940, h: 178 }, 0, WHITE, l1, { fam: 'anton', size: 144, lh: 1 }, p.bg);
        brushLine(S, 1, { x: 290, y: 270, w: 500, h: 136 }, -2, a, l2, { fam: 'anton', size: 112, lh: 1 }, ink);
        azulJobs(S, ext, p);
        bullets(S, (i) => ({ x: 40, y: 524 + i * 86, w: 590, h: 64, barH: 52, fs: 32, circle: a, iconColor: ink, color: p.deep }));
        framed(S, 656, 524, 384, 496, { fill: p.light, border: WHITE, bw: 8, r: 26, shadow: [12, 12, a] });
        slantBand(S, { x: 40, y: 1036, w: 1000, h: 80 }, a, 70, ink);
        waBox(S, { x: 40, y: 1130, w: 1000, h: 124 }, () => K.box(S.ctx, 40, 1130, 1000, 124, { fill: WHITE, border: a, bw: 6, r: 62 }),
          { d: 92, ring: p.bg, label: '#1D6FE0', phone: p.deep, fs: 100 });
        cvPill(S, { bg: '#2F9BFF', color: '#04121F', border: WHITE });
      });
    },
  });

  // ---------------------------------------------------------------- Laranja
  const LARANJA = { bg: '#1B1B1D', light: '#2A2A2D', deep: '#000000' };

  // "MUDE A SUA" in white and the last word in the accent, on a black band.
  function laranjaLife(S, ext) {
    const s = K.badge(S);
    if (!s) return;
    const ctx = S.ctx, a = S.theme.accent;
    const cut = s.lastIndexOf(' ');
    const head = cut > 0 ? s.slice(0, cut + 1) : '', tail = cut > 0 ? s.slice(cut + 1) : s;
    const f = K.fitted(S, s, { ...LIFE, size: 76 }, 1000).f;
    const wh = K.width(ctx, head, f), x = 540 - (wh + K.width(ctx, tail, f)) / 2;
    const b = { x: ext.x0, y: 994, w: ext.x1 - ext.x0, h: 90 };
    part(S, 'badge', TL.badge, 0, 'stamp', b, () => {
      fillRect(ctx, b.x, 994, b.w, 90, a);
      fillRect(ctx, b.x, 1000, b.w, 78, INK);
      const top = 1000 + (78 - K.lineH(f)) / 2;
      if (head) K.text(ctx, head, x, top, f, { color: WHITE });
      K.text(ctx, tail, x + wh, top, f, { color: a });
    });
  }

  flyer({
    id: 'panfleto-laranja',
    name: 'Panfleto Laranja',
    icon: 'construction',
    trade: 'maquinas',
    defaults: { primary: '#1B1B1D', accent: '#FF7A1A', bg: '#1B1B1D', text: '#FFFFFF' },
    texts: () => sample({ headline: 'Recrutamento imediato', kicker: 'Operadores de grua', badge: LIFE_TEXT }),
    render(R) {
      K.stage(R, (S, ext) => {
        const [x, y, w] = area(ext);
        fillRect(S.ctx, ...area(ext), S.theme.bg);
        stripes(S.ctx, ext, 'rgba(255,255,255,0.03)', 2, 14);
        K.hazard(S.ctx, x, y, w, 18, S.theme.accent, INK, 24);
      }, (S, ext) => {
        const a = S.theme.accent, p = shades(S.theme.bg, LARANJA), ink = inkOn(a, DARK), on = U.onColor(p.bg, DARK);
        swiss(S, 40, 44, false, on);
        mark(S, 1040, 38, true, { circle: a, icon: ink, color: on, bg: p.bg });
        S.hit('headline', 40, 112, 1000, 160);
        brushLine(S, 0, { x: 40, y: 112, w: 1000, h: 160 }, -1.5, a, words(S), { fam: 'anton', size: 94, lh: 1 }, ink);
        if (K.kicker(S)) {
          K.box(S.ctx, 40, 292, 1000, 124, { fill: WHITE });
          fillRect(S.ctx, 40, 292, 20, 124, a);
        }
        tradeTitle(S, { x: 60, y: 292, w: 980, h: 124 }, 'crane', 84, { fam: 'anton', size: 100, lh: 1 }, DARK, DARK, 20);
        framed(S, 40, 444, 400, 532, { fill: p.light, border: a, bw: 8, r: 20 });
        bullets(S, (i) => ({ x: 466, y: 444 + i * 86, w: 574, h: 66, barH: 54, fs: 31, circle: i % 2 ? DARK : a, iconColor: i % 2 ? a : ink, color: DARK }));
        laranjaLife(S, ext);
        waBox(S, { x: 40, y: 1102, w: 1000, h: 140 }, () => K.box(S.ctx, 40, 1102, 1000, 140, { fill: a, border: WHITE, bw: 6, r: 22 }),
          { d: 100, ring: DARK, label: ink, phone: ink, fs: 100 });
        cvPill(S, { bg: '#2E8BFF', color: INK, border: INK });
      });
    },
  });

  // ---------------------------------------------------------------- Suíça
  // Graph paper: 2 px lines every 40 px.
  function grid(ctx, ext, color) {
    const [x, y, w, h] = area(ext);
    ctx.fillStyle = color;
    for (let gx = Math.floor(x / 40) * 40; gx < ext.x1; gx += 40) ctx.fillRect(gx, y, 2, h);
    for (let gy = Math.floor(y / 40) * 40; gy < ext.y1; gy += 40) ctx.fillRect(x, gy, w, 2);
  }

  // "Vacancies in Switzerland", underlined in the accent (the intro).
  function suicaIntro(S) {
    if (!S.show.intro) return;
    const s = K.up(S, S.t.intro).trim();
    if (!s) return;
    const ctx = S.ctx;
    const f = K.fitted(S, s, { fam: 'anton', size: 50, lh: 1.1 }, 430).f;
    const w = K.width(ctx, s, f), h = K.lineH(f);
    part(S, 'intro', TL.intro, 0, 'rise', { x: 50, y: 300, w, h: h + 8 }, () => {
      K.text(ctx, s, 50, 300, f, { color: S.theme.text });
      fillRect(ctx, 50, 300 + h, w, 8, S.theme.accent);
    });
  }

  // "Change your life" with a marker highlight under its lower half.
  function suicaLife(S) {
    const s = K.badge(S);
    if (!s) return;
    const ctx = S.ctx, th = S.theme;
    const f = K.fitted(S, s, { ...LIFE, size: 84, ls: 0 }, 952).f;
    const w = K.width(ctx, s, f) + 48, h = K.lineH(f);
    const b = { x: 540 - w / 2, y: 1004 + (90 - h) / 2, w, h };
    part(S, 'badge', TL.badge, 0, 'stamp', b, () => {
      fillRect(ctx, b.x, b.y + h * 0.56, w, h * 0.44, th.accent);
      K.text(ctx, s, 540, b.y, f, { color: th.text, align: 'center' });
    });
  }

  flyer({
    id: 'panfleto-suica',
    name: 'Panfleto Suíça',
    icon: 'hammer',
    trade: 'cofragem',
    defaults: { primary: '#D52B1E', accent: '#D52B1E', bg: '#FFFFFF', text: '#111111' },
    texts: () => sample({ headline: 'Recrutamento imediato', kicker: 'Cofradores de cofragem', intro: 'Vagas na Suíça', badge: LIFE_TEXT }),
    render(R) {
      K.stage(R, (S, ext) => {
        const bg = S.theme.bg;
        fillRect(S.ctx, ...area(ext), bg);
        grid(S.ctx, ext, same(bg, WHITE) ? '#EFEFEF' : U.mix(bg, INK, 0.063));
      }, (S, ext) => {
        const { ctx, theme: th } = S;
        const a = th.accent, white = inkOn(a, WHITE) === WHITE ? WHITE : INK;
        fillRect(ctx, ext.x0, ext.y0, ext.x1 - ext.x0, 96 - ext.y0, a);
        mark(S, 40, 18, false, { disc: false, f: { fam: 'anton', size: 46, ls: 3 }, color: U.onColor(a, DARK), bg: a });
        swiss(S, 1040, 24, true, U.onColor(a, DARK));
        const [l1, l2] = K.headLines(S);
        S.hit('headline', 40, 116, 1000, 274);
        brushLine(S, 0, { x: 40, y: 116, w: 1000, h: 160 }, 0, DARK, l1, { fam: 'marker', size: 110, lh: 1 }, WHITE);
        suicaIntro(S);
        brushLine(S, 1, { x: 500, y: 262, w: 540, h: 128 }, 2, a, l2, { fam: 'marker', size: 92, lh: 1 }, white);
        if (K.kicker(S)) fillRect(ctx, 40, 410, 1000, 112, DARK);
        tradeTitle(S, { x: 40, y: 410, w: 1000, h: 112 }, 'hardhat', 64, { fam: 'anton', size: 86, lh: 1 }, WHITE, a, 18);
        bullets(S, (i) => ({ x: 40, y: 548 + i * 74, w: 590, h: 66, barH: 54, fs: 32, circle: a, halo: [3, DARK], barBorder: [3, DARK], color: DARK }));
        framed(S, 654, 548, 386, 436, { fill: '#DDDDDD', border: DARK, bw: 8, shadow: [12, 12, a] });
        suicaLife(S);
        waBox(S, { x: 40, y: 1106, w: 1000, h: 140 }, () => K.box(ctx, 40, 1106, 1000, 140, { fill: WHITE, border: DARK, bw: 6, shadow: [10, 10, a] }),
          { d: 100, ring: DARK, label: U.ensureContrast(a, WHITE, 3), phone: DARK, fs: 104 });
        cvPill(S, { bg: '#2F80ED', color: INK, border: DARK });
      });
    },
  });

  // ---------------------------------------------------------------- Verde
  const VERDE = { bg: '#0E3B2E', light: '#14533F', deep: '#082A20' };
  const DOTS = ['#F97316', '#0891B2', '#E63946', '#7C3AED', '#2563EB', '#DB2777'];

  // The trade on a white slanted band: polygon(2% 0, 100% 0, 98% 100%, 0 100%).
  function verdeBand(S, ink) {
    if (!K.kicker(S)) return;
    const ctx = S.ctx;
    ctx.beginPath();
    ctx.moveTo(60, 280); ctx.lineTo(1040, 280); ctx.lineTo(1020, 400); ctx.lineTo(40, 400);
    ctx.closePath();
    ctx.fillStyle = WHITE;
    ctx.fill();
    tradeTitle(S, { x: 40, y: 280, w: 1000, h: 120 }, 'hardhat', 72, { fam: 'anton', size: 108, lh: 1 }, ink, ink, 18);
  }

  // Round sticker: "Got experience? Call now!", turned 8°.
  function verdeSticker(S) {
    const ctx = S.ctx, a = S.theme.accent, ask = K.labels(S).ask;
    const cx = 898, cy = 584, b = { x: 780, y: 466, w: 236, h: 236 };
    const f0 = { fam: 'anton', size: 32, lh: 1.02 };
    const k = Math.min(1, ...ask.map((l) => 196 / K.width(ctx, l, f0)));
    const f = K.sized(f0, k), lh = K.lineH(f);
    E.enter(S, TL.badge, TL.line, 'stamp', b, () => K.turned(ctx, b, 8, () => {
      K.circle(ctx, cx + 8, cy + 8, 118, INK);
      K.circle(ctx, cx, cy, 118, a);
      K.circle(ctx, cx, cy, 110, WHITE);
      ask.forEach((l, i) => K.text(ctx, l, cx, cy - (lh * ask.length) / 2 + i * lh, f, { color: i < 2 ? INK : '#16A34A', align: 'center' }));
    }));
  }

  flyer({
    id: 'panfleto-verde',
    name: 'Panfleto Verde',
    icon: 'shovel',
    trade: 'servente',
    defaults: { primary: '#0E3B2E', accent: '#A3E635', bg: '#0E3B2E', text: '#FFFFFF' },
    texts: () => sample({ headline: 'Recrutamento imediato', kicker: 'Ajudantes de obra', badge: LIFE_TEXT }),
    render(R) {
      K.stage(R, (S, ext) => glow(S.ctx, ext, 0.3, 0.3, 0.6, shades(S.theme.bg, VERDE)), (S) => {
        const a = S.theme.accent, p = shades(S.theme.bg, VERDE), ink = inkOn(a, p.bg), on = U.onColor(p.bg, DARK);
        mark(S, 40, 30, false, { circle: a, icon: ink, color: on, bg: p.bg });
        swiss(S, 1040, 36, true, on);
        S.hit('headline', 40, 104, 1000, 156);
        brushLine(S, 0, { x: 40, y: 104, w: 1000, h: 156 }, -1.5, a, words(S), { fam: 'anton', size: 94, lh: 1 }, ink);
        verdeBand(S, p.bg);
        framed(S, 40, 420, 1000, 268, { fill: p.light, border: WHITE, bw: 6, r: 24 });
        verdeSticker(S);
        bullets(S, (i) => ({ x: 40 + (i % 2) * 510, y: 724 + Math.floor(i / 2) * 86, w: 490, h: 64, barH: 52, fs: 28, circle: DOTS[i], ring: a, color: INK }));
        slantBand(S, { x: 40, y: 1012, w: 1000, h: 82 }, a, 72, ink);
        waBox(S, { x: 40, y: 1110, w: 1000, h: 136 }, () => K.box(S.ctx, 40, 1110, 1000, 136, { fill: WHITE, border: a, bw: 6, r: 68 }),
          { d: 100, ring: p.bg, label: p.bg, phone: INK, fs: 100 });
        cvPill(S, { bg: '#3B82F6', color: INK, border: WHITE });
      });
    },
  });
})();
