// Bold poster templates drawn like their canvas designs: every element sits at
// its place in a 1080×1350 page (js/poster-kit.js), which is scaled into the
// square and the story while the background grows to fill them.
window.RS = window.RS || {};

(() => {
  const E = RS.engine;
  const U = RS.util;
  const K = RS.posterKit;
  const { define } = RS.templates;
  const { TL } = E;

  const INK = '#000000', DARK = '#111111', WHITE = '#FFFFFF', SHADE = '#222222';
  // Text on the accent: black on light accents, white on the others.
  const onAccent = (c) => U.onColor(c, INK);
  // Where the designs put white on the accent, as long as it stays readable.
  const whiteOn = (c) => (U.contrast(c, WHITE) >= 3 ? WHITE : INK);
  const { BRAND, sample, fillRect, area, part, headLine, company, phoneKey, bigPhone, stack } = K;

  // ---------------------------------------------------------------- Metade
  function metadeBack(S, ext) {
    const { ctx, theme: th } = S;
    fillRect(ctx, ...area(ext), th.bg);
    // the accent half, cut on a slant from y 560 (left) to 459 (right)
    const cut = (x) => 560 - (100.8 * x) / 1080;
    ctx.beginPath();
    ctx.moveTo(ext.x0, ext.y0); ctx.lineTo(ext.x1, ext.y0); ctx.lineTo(ext.x1, cut(ext.x1)); ctx.lineTo(ext.x0, cut(ext.x0));
    ctx.closePath();
    ctx.fillStyle = th.accent;
    ctx.fill();
  }

  function metadeTop(S) {
    const { ctx, theme: th } = S;
    const ink = onAccent(th.accent);
    const f = { fam: 'anton', size: 40, ls: 3 };
    const nameO = { fill: ink, padX: 20, padY: 4, color: th.accent };
    const kickO = { border: ink, bw: 6, padX: 18, color: ink };
    const hb = K.chipSize(ctx, 'X', f, nameO).h, hk = K.chipSize(ctx, 'X', f, kickO).h;
    const h = Math.max(hb, hk), yb = 40 + (h - hb) / 2;
    company(S, 44, yb, hb, th.accent, (name) => K.chip(ctx, name, 44, yb, K.fitted(S, name, f, 520).f, nameO));
    const kick = K.kicker(S);
    if (!kick) return;
    const fk = K.fitted(S, kick, f, 400).f;
    const sz = K.chipSize(ctx, kick, fk, kickO);
    const b = { x: 1036 - sz.w, y: 40 + (h - sz.h) / 2, w: sz.w, h: sz.h };
    part(S, 'kicker', TL.kicker, 0, 'rise', b, () => K.chip(ctx, kick, b.x, b.y, fk, kickO));
  }

  function metadeTitle(S) {
    const ctx = S.ctx, ink = onAccent(S.theme.accent);
    const [l1, l2] = K.headLines(S);
    const f1 = K.fitted(S, l1, { fam: 'anton', size: 172, lh: 0.88 }, 992).f;
    const f2 = K.fitted(S, l2, { fam: 'anton', size: 150, lh: 0.95, ls: 4 }, 992).f;
    const h1 = K.lineH(f1), h2 = l2 ? K.lineH(f2) : 0;
    S.hit('headline', 44, 140, 992, h1 + h2);
    headLine(S, 0, { x: 44, y: 140, w: 992, h: h1 }, () => K.text(ctx, l1, 44, 140, f1, { color: ink }));
    if (l2) headLine(S, 1, { x: 44, y: 140 + h1, w: 992, h: h2 }, () => K.text(ctx, l2, 44, 140 + h1, f2, { color: ink, stroke: [5, ink], hollow: true }));
  }

  function metadePhoto(S) {
    const ctx = S.ctx, b = { x: 560, y: 450, w: 484, h: 424 };
    K.turned(ctx, b, -2, () => {
      K.box(ctx, b.x, b.y, b.w, b.h, { fill: SHADE, border: WHITE, bw: 12, shadow: [16, 16, S.theme.accent] });
      K.photo(S, { x: 572, y: 462, w: 460, h: 400 }, { filter: 'contrast(1.15)' });
    });
  }

  function metadePerks(S) {
    const { ctx, theme: th } = S;
    const f = { fam: 'barlow', weight: 900, size: 30, lh: 1 };
    K.benefits(S).forEach((b, i) => {
      const y = 552 + i * 64;
      part(S, `benefit:${b.id}`, TL.benefits, i * TL.benefit, 'slide', { x: 44, y, w: 480, h: 56 }, () => {
        K.box(ctx, 44, y, 56, 56, { fill: th.accent, border: WHITE, bw: 4, shadow: [4, 4, WHITE] });
        K.icon(ctx, b.icon, 57, y + 13, 30, onAccent(th.accent));
        const t = K.fitted(S, K.up(S, b.text), f, 446);
        K.text(ctx, t.lines[0], 114, y + (56 - K.lineH(t.f)) / 2, t.f, { color: th.text });
      });
    });
  }

  function metadeHazard(S) {
    const { ctx, theme: th } = S;
    const b = { x: 44, y: 936, w: 992, h: 30 };
    E.enter(S, TL.bar, 0, 'grow', b, () => {
      K.box(ctx, b.x, b.y, b.w, b.h, { border: th.accent, bw: 4 });
      K.hazard(ctx, 48, 940, 984, 22, th.accent, th.bg, 26);
    });
  }

  function metadeCall(S) {
    const phone = K.phone(S);
    if (!phone) return;
    const { ctx, theme: th } = S;
    const ink = onAccent(th.accent), L = K.labels(S);
    const fl = K.fit(ctx, L.callNow, { fam: 'anton', size: 58, ls: 2, lh: 1 }, 798).f;
    const fp = K.fitted(S, phone, { fam: 'anton', size: 136, lh: 1.05 }, 912).f;
    const fr = K.fit(ctx, L.reply, { fam: 'barlow', weight: 900, size: 34, ls: 3 }, 912).f;
    const hp = K.lineH(fp);
    const top = 996 + (300 - (96 + hp + K.lineH(fr))) / 2;
    part(S, phoneKey(S), TL.contacts, 0, 'rise', { x: 44, y: 986, w: 992, h: 320 }, () => {
      K.box(ctx, 44, 986, 992, 320, { fill: th.accent, border: WHITE, bw: 10 });
      K.wa(ctx, 84, top, 96, { ring: ink, bw: 6, icon: 44, stroke: 2.4 });
      K.text(ctx, L.callNow, 198, top + (96 - K.lineH(fl)) / 2, fl, { color: ink });
      bigPhone(S, phone, 84, top + 96, fp, { color: ink, shadow: [6, 6, WHITE] });
      K.text(ctx, L.reply, 84, top + 96 + hp, fr, { color: ink });
    });
  }

  define({
    id: 'metade',
    name: 'Metade',
    description: 'Metade de cor com o título em grande, ícones em blocos, faixa de perigo e o telefone numa caixa.',
    icon: 'construction',
    trade: 'maquinas',
    defaults: { primary: '#000000', accent: '#FFC800', bg: '#000000', text: '#FFFFFF', fonts: 'impact', upper: true },
    brand: BRAND,
    texts: () => sample({ kicker: 'Suíça', headline: 'Operadores de grua', contactIcon: 'message-circle' }),
    theme(R, t) {
      const a = t.accent, ink = U.onColor(a);
      return {
        ...t, headline: ink, kicker: ink, kickerBg: ink, kickerFg: a, brand: ink, brandTag: ink, bar: ink,
        iconBg: a, iconFg: U.onColor(a), iconLine: '#FFFFFF', iconShadow: '#FFFFFF',
        boxBg: t.bg, boxLine: a, boxTitle: a, boxText: t.text, bullet: a,
        badgeBg: '#FFFFFF', badgeFg: DARK,
      };
    },
    render(R) {
      K.stage(R, metadeBack, (S) => {
        metadeTop(S);
        metadeTitle(S);
        metadePhoto(S);
        metadePerks(S);
        metadeHazard(S);
        metadeCall(S);
      });
    },
  });

  // ---------------------------------------------------------------- Stencil
  function stencilBack(S, ext) {
    const { ctx, theme: th } = S;
    const [x, y, w, h] = area(ext);
    fillRect(ctx, x, y, w, h, th.bg);
    // kraft lines: 2 px of shade every 9 px, counted from the bottom of the card
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let ly = 1330 + 9 * Math.ceil((ext.y1 - 1330) / 9); ly > ext.y0; ly -= 9) ctx.fillRect(x, ly - 2, w, 2);
    fillRect(ctx, x + 20, 970, w - 40, ext.y1 - 990, DARK);
    K.box(ctx, x, y, w, h, { border: DARK, bw: 20 });
  }

  function stencilTop(S) {
    const ctx = S.ctx;
    const fb = { fam: 'stencil', weight: 900, size: 54, ls: 4 };
    const fk = { fam: 'stencil', weight: 900, size: 44, ls: 3 };
    const h = Math.max(K.lineH(fb), K.lineH(fk)), yb = 48 + (h - K.lineH(fb)) / 2;
    company(S, 50, yb, K.lineH(fb), S.theme.bg, (name) => K.text(ctx, name, 50, yb, K.fitted(S, name, fb, 520).f, { color: DARK }));
    E.enter(S, TL.bar, 0, 'grow', { x: 50, y: 48 + h + 12, w: 980, h: 6 }, () => fillRect(ctx, 50, 48 + h + 12, 980, 6, DARK));
    const kick = K.kicker(S);
    if (!kick) return;
    const f = K.fitted(S, kick, fk, 440).f;
    const w = K.width(ctx, kick, f);
    const b = { x: 1030 - w, y: 48 + (h - K.lineH(f)) / 2, w, h: K.lineH(f) };
    part(S, 'kicker', TL.kicker, 0, 'rise', b, () => K.text(ctx, kick, 1030, b.y, f, { color: DARK, align: 'right' }));
  }

  function stencilTitle(S) {
    const s = K.up(S, S.t.headline).trim();
    const t = K.fitted(S, s, { fam: 'stencil', weight: 900, size: 150, lh: 0.9, ls: 1 }, 980);
    const b = { x: 50, y: 145, w: 980, h: K.lineH(t.f) };
    S.hit('headline', b.x, b.y, b.w, b.h);
    headLine(S, 0, b, () => K.text(S.ctx, t.lines[0], 50, 145, t.f, { color: DARK }));
  }

  // The "urgent" stamp, turned, at the right of the photo.
  function stencilStamp(S) {
    const s = K.badge(S);
    if (!s) return;
    const { ctx, theme: th } = S;
    const o = { border: th.accent, bw: 8, padX: 22, color: th.accent };
    const f = K.fitted(S, s, { fam: 'stencil', weight: 900, size: 74, ls: 4 }, 330).f;
    const sz = K.chipSize(ctx, s, f, o);
    const b = { x: 1010 - sz.w, y: 320, w: sz.w, h: sz.h };
    part(S, 'badge', TL.badge, 0, 'stamp', b, () => K.turned(ctx, b, -9, () => K.chip(ctx, s, b.x, b.y, f, o)));
  }

  function stencilPhoto(S) {
    K.box(S.ctx, 50, 320, 584, 494, { fill: SHADE, border: DARK, bw: 12, shadow: [14, 14, S.theme.accent] });
    K.photo(S, { x: 62, y: 332, w: 560, h: 470 }, { filter: 'sepia(0.25) contrast(1.15)' });
  }

  function stencilPerks(S) {
    const { ctx, theme: th } = S;
    const f = { fam: 'barlow', weight: 900, size: 30, lh: 1 };
    const rows = K.benefits(S).map((b) => {
      const t = K.fitted(S, K.up(S, b.text), f, 306, 3);
      const textH = t.lines.length * K.lineH(t.f);
      return { b, t, textH, h: Math.max(60, textH) };
    });
    const tops = stack(460, rows.map((r) => r.h), 12);
    rows.forEach(({ b, t, textH, h }, i) => {
      const y = tops[i];
      part(S, `benefit:${b.id}`, TL.benefits, i * TL.benefit, 'slide', { x: 650, y, w: 380, h }, () => {
        fillRect(ctx, 650, y + (h - 60) / 2, 60, 60, DARK);
        K.icon(ctx, b.icon, 662, y + (h - 60) / 2 + 12, 36, th.bg);
        K.block(ctx, t.lines, 724, y + (h - textH) / 2, t.f, { color: DARK });
      });
    });
  }

  function stencilCall(S) {
    const phone = K.phone(S);
    if (!phone) return;
    const { ctx, theme: th } = S;
    const L = K.labels(S);
    const fl = K.fit(ctx, L.callSend, { fam: 'stencil', weight: 900, size: 60, ls: 4 }, 876).f;
    const fp = K.fitted(S, phone, { fam: 'anton', size: 136, lh: 1.05 }, 980).f;
    const fr = K.fit(ctx, L.reply, { fam: 'barlow', weight: 900, size: 32, ls: 4 }, 980).f;
    const h1 = Math.max(88, K.lineH(fl)), hp = K.lineH(fp);
    const top = 970 + (360 - (h1 + hp + K.lineH(fr))) / 2;
    part(S, phoneKey(S), TL.contacts, 0, 'rise', { x: 20, y: 970, w: 1040, h: 360 }, () => {
      K.wa(ctx, 50, top + (h1 - 88) / 2, 88, { ring: th.bg, bw: 5, icon: 40, stroke: 2.4 });
      K.text(ctx, L.callSend, 154, top + (h1 - K.lineH(fl)) / 2, fl, { color: th.bg });
      bigPhone(S, phone, 50, top + h1, fp, { color: WHITE, shadow: [7, 7, th.accent] });
      K.text(ctx, L.reply, 50, top + h1 + hp, fr, { color: th.bg });
    });
  }

  define({
    id: 'stencil',
    name: 'Stencil',
    description: 'Cartão kraft com moldura preta, letras de stencil, carimbo e faixa escura com o telefone.',
    icon: 'droplets',
    trade: 'canalizador',
    defaults: { primary: '#111111', accent: '#D7261E', bg: '#C9A26A', text: '#111111', fonts: 'impact', upper: true },
    brand: BRAND,
    texts: () => sample({ kicker: 'Destino: Suíça', headline: 'Canalizadores', badge: 'Urgente', contactIcon: 'message-circle' }),
    theme(R, t) {
      return {
        ...t, headline: DARK, kicker: DARK, kickerBg: DARK, kickerFg: t.accent, brand: DARK, brandTag: DARK, bar: t.accent,
        iconBg: DARK, iconFg: t.bg, iconLine: DARK, iconShadow: t.accent,
        boxBg: U.mix(t.bg, '#FFFFFF', 0.25), boxLine: DARK, boxTitle: DARK, boxText: DARK, bullet: DARK,
        badgeBg: '#FFFFFF', badgeFg: DARK,
      };
    },
    render(R) {
      K.stage(R, stencilBack, (S) => {
        stencilTop(S);
        stencilTitle(S);
        stencilStamp(S);
        stencilPhoto(S);
        stencilPerks(S);
        stencilCall(S);
      });
    },
  });

  // ---------------------------------------------------------------- Contraste
  function contrasteBack(S, ext) {
    fillRect(S.ctx, ...area(ext), S.theme.bg);
  }

  // Black-and-white photo over the top, fading into the background.
  function contrastePhoto(S, ext) {
    const { ctx, theme: th } = S;
    const x = ext.x0, w = ext.x1 - ext.x0;
    K.photo(S, { x, y: 0, w, h: 900 }, { filter: 'grayscale(1) contrast(1.6) brightness(0.95)' });
    const g = ctx.createLinearGradient(0, 0, 0, 900);
    g.addColorStop(0.25, U.rgba(th.bg, 0));
    g.addColorStop(0.5, U.rgba(th.bg, 0.85));
    g.addColorStop(0.68, th.bg);
    fillRect(ctx, x, 0, w, 900, g);
  }

  function contrasteTop(S, ext) {
    const { ctx, theme: th } = S;
    const x = ext.x0, w = ext.x1 - ext.x0;
    fillRect(ctx, x, ext.y0, w, 102 - ext.y0, th.bg);
    fillRect(ctx, x, 102, w, 8, WHITE);
    const fb = { fam: 'archivo', size: 40, ls: 2 };
    const yb = (102 - K.lineH(fb)) / 2;
    company(S, 44, yb, K.lineH(fb), th.bg, (name) => K.text(ctx, name, 44, yb, K.fitted(S, name, fb, 600).f, { color: th.text }));
    const kick = K.kicker(S);
    if (!kick) return;
    const f = K.fitted(S, kick, { fam: 'anton', size: 44 }, 340).f;
    const o = { fill: th.accent, padX: 20, color: whiteOn(th.accent) };
    const sz = K.chipSize(ctx, kick, f, o);
    const b = { x: 1036 - sz.w, y: (102 - sz.h) / 2, w: sz.w, h: sz.h };
    part(S, 'kicker', TL.kicker, 0, 'rise', b, () => K.chip(ctx, kick, b.x, b.y, f, o));
  }

  function contrasteBadge(S) {
    const s = K.badge(S);
    if (!s) return;
    const { ctx, theme: th } = S;
    const f = K.fitted(S, s, { fam: 'archivo', size: 58 }, 860).f;
    const o = { fill: WHITE, border: INK, bw: 8, padX: 26, padY: 6, shadow: [12, 12, th.accent], color: INK };
    const sz = K.chipSize(ctx, s, f, o);
    const b = { x: 44, y: 180, w: sz.w, h: sz.h };
    part(S, 'badge', TL.badge, 0, 'stamp', b, () => K.turned(ctx, b, -3, () => K.chip(ctx, s, 44, 180, f, o)));
  }

  function contrasteTitle(S) {
    const { ctx, theme: th } = S;
    const [l1, l2] = K.headLines(S);
    const f1 = K.fitted(S, l1, { fam: 'archivo', size: 132, lh: 0.95, ls: -4 }, 992).f;
    const f2 = K.fitted(S, l2, { fam: 'archivo', size: 70, lh: 1.1 }, 952).f;
    const o = { fill: th.accent, padX: 20, color: whiteOn(th.accent) };
    const h1 = K.lineH(f1), y2 = 470 + h1 + 10, h2 = l2 ? K.lineH(f2) : 0;
    S.hit('headline', 44, 470, 992, y2 + h2 - 470);
    headLine(S, 0, { x: 44, y: 470, w: 992, h: h1 }, () => K.text(ctx, l1, 44, 470, f1, { color: th.text }));
    if (l2) headLine(S, 1, { x: 44, y: y2, w: 992, h: h2 }, () => K.chip(ctx, l2, 44, y2, f2, o));
  }

  function contrastePerks(S) {
    const { ctx, theme: th } = S;
    const f = { fam: 'barlow', weight: 900, size: 29, lh: 1 };
    K.benefits(S).forEach((b, i) => {
      const x = 44 + (i % 2) * 503, y = 730 + Math.floor(i / 2) * 90;
      part(S, `benefit:${b.id}`, TL.benefits, i * TL.benefit, 'slide', { x, y, w: 489, h: 78 }, () => {
        K.box(ctx, x, y, 489, 78, { border: th.text, bw: 5 });
        fillRect(ctx, x + 19, y + 13, 52, 52, th.accent);
        K.icon(ctx, b.icon, x + 29, y + 23, 32, whiteOn(th.accent));
        const t = K.fitted(S, K.up(S, b.text), f, 385);
        K.text(ctx, t.lines[0], x + 85, y + (78 - K.lineH(t.f)) / 2, t.f, { color: th.text });
      });
    });
  }

  // White box at the bottom: icon, "call or WhatsApp" and the number in big.
  function contrasteCall(S) {
    const phone = K.phone(S);
    if (!phone) return;
    const { ctx, theme: th } = S;
    const L = K.labels(S);
    const fl = K.fit(ctx, L.callOr, { fam: 'anton', size: 44, ls: 3 }, 838).f;
    const fp = K.fitted(S, phone, { fam: 'anton', size: 124, lh: 1.05 }, 916).f;
    const h1 = Math.max(64, K.lineH(fl)), h = 60 + h1 + K.lineH(fp), y = 1306 - h;
    const iy = y + 30 + (h1 - 64) / 2;
    part(S, phoneKey(S), TL.contacts, 0, 'rise', { x: 44, y, w: 992, h }, () => {
      fillRect(ctx, 44, y, 992, h, WHITE);
      K.box(ctx, 54, y + 10, 972, h - 20, { border: INK, bw: 6 });
      fillRect(ctx, 82, iy, 64, 64, th.accent);
      K.icon(ctx, 'phone', 95, iy + 13, 38, whiteOn(th.accent), 2.4);
      K.text(ctx, L.callOr, 160, y + 30 + (h1 - K.lineH(fl)) / 2, fl, { color: INK });
      bigPhone(S, phone, 82, y + 30 + h1, fp, { color: INK, shadow: [6, 6, th.accent] });
    });
  }

  define({
    id: 'contraste',
    name: 'Contraste',
    description: 'Fotografia a preto e branco, uma cor forte, carimbo branco e caixa branca com o telefone.',
    icon: 'hard-hat',
    trade: 'carpinteiro',
    defaults: { primary: '#000000', accent: '#FF1E1E', bg: '#000000', text: '#FFFFFF', fonts: 'impact', upper: true },
    brand: BRAND,
    texts: () => sample({ kicker: 'Suíça', headline: 'Carpinteiros de cofragem', badge: 'Vagas abertas', contactIcon: 'phone' }),
    theme(R, t) {
      const a = t.accent;
      return {
        ...t, headline: '#FFFFFF', kicker: U.onColor(a), kickerBg: a, kickerFg: U.onColor(a), brand: '#FFFFFF', brandTag: a, bar: a,
        iconBg: a, iconFg: U.onColor(a), iconLine: '#FFFFFF', iconShadow: a,
        boxBg: t.bg, boxLine: '#FFFFFF', boxTitle: a, boxText: '#FFFFFF', bullet: a,
        badgeBg: a, badgeFg: U.onColor(a),
      };
    },
    render(R) {
      K.stage(R, contrasteBack, (S, ext) => {
        contrastePhoto(S, ext);
        contrasteTop(S, ext);
        contrasteBadge(S);
        contrasteTitle(S);
        contrastePerks(S);
        contrasteCall(S);
      });
    },
  });

  // ---------------------------------------------------------------- BD
  function bdBack(S, ext) {
    fillRect(S.ctx, ...area(ext), S.theme.bg);
  }

  // Comic dots: one per `step` square from (x, y), cut to the box.
  function dots(ctx, x, y, w, h, step, r, color) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.beginPath();
    for (let cy = y + step / 2; cy < y + h + r; cy += step) {
      for (let cx = x + step / 2; cx < x + w + r; cx += step) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // First panel: the photo, with the company in a white label.
  function bdPhoto(S) {
    const ctx = S.ctx;
    fillRect(ctx, 26, 26, 581.36, 430, INK);
    K.photo(S, { x: 36, y: 36, w: 561.36, h: 410 }, { filter: 'contrast(1.2) saturate(1.2)' });
    const f = { fam: 'barlow', weight: 900, size: 26 };
    const o = { fill: WHITE, border: INK, bw: 5, padX: 14, padY: 4, color: INK };
    const h = K.chipSize(ctx, 'X', f, o).h;
    company(S, 69, 59, h - 18, WHITE,
      (name) => K.chip(ctx, name, 50, 50, K.fitted(S, name, f, 520).f, o),
      (lw) => K.box(ctx, 50, 50, lw + 38, h, { fill: WHITE, border: INK, bw: 5 }));
  }

  // Second panel: dots on the accent and the speech bubble with the badge.
  function bdBadge(S) {
    const { ctx, theme: th } = S;
    K.box(ctx, 623.36, 26, 430.64, 430, { fill: th.accent, border: INK, bw: 10 });
    dots(ctx, 633.36, 36, 410.64, 410, 22, 3.5, INK);
    const s = K.badge(S);
    if (!s) return;
    const cx = 838.68, cy = 241;
    const b = { x: cx - 177, y: cy - 147, w: 354, h: 294 };
    const t = K.fitted(S, s, { fam: 'bangers', size: 72, lh: 0.95, ls: 2 }, 300, 3);
    const textH = t.lines.length * K.lineH(t.f);
    part(S, 'badge', TL.badge, 0, 'stamp', b, () => K.turned(ctx, b, -4, () => {
      ctx.beginPath(); ctx.ellipse(cx, cy, 177, 147, 0, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy, 170, 140, 0, 0, Math.PI * 2); ctx.fillStyle = WHITE; ctx.fill();
      K.block(ctx, t.lines, cx, cy - textH / 2, t.f, { color: INK, align: 'center' });
    }));
  }

  function bdTitle(S) {
    const { ctx, theme: th } = S;
    fillRect(ctx, 26, 472, 1028, 260, INK);
    const kick = K.kicker(S);
    const fk = K.fitted(S, kick, { fam: 'bangers', size: 50, ls: 3 }, 948).f;
    const t = K.fitted(S, K.up(S, S.t.headline).trim(), { fam: 'anton', size: 150, lh: 0.92 }, 948);
    const hk = kick ? K.lineH(fk) : 0, hh = K.lineH(t.f);
    const top = 482 + (240 - hk - hh) / 2;
    if (kick) part(S, 'kicker', TL.kicker, 0, 'rise', { x: 66, y: top, w: K.width(ctx, kick, fk), h: hk }, () => K.text(ctx, kick, 66, top, fk, { color: th.accent }));
    const b = { x: 66, y: top + hk, w: 948, h: hh };
    S.hit('headline', b.x, b.y, b.w, b.h);
    headLine(S, 0, b, () => K.text(ctx, t.lines[0], 66, b.y, t.f, { color: WHITE, shadow: [9, 9, th.accent] }));
  }

  // Six panels, accent and white in turn, each with an icon and a perk.
  function bdPerks(S) {
    const { ctx, theme: th } = S;
    const f = { fam: 'bangers', size: 30, lh: 1, ls: 1 };
    const cw = (1028 - 28) / 3;
    K.benefits(S).forEach((b, i) => {
      const x = 26 + (i % 3) * (cw + 14), y = 748 + Math.floor(i / 3) * 126;
      const t = K.fitted(S, K.up(S, b.text), f, cw - 90, 3);
      const textW = Math.max(...t.lines.map((l) => K.width(ctx, l, t.f)));
      const textH = t.lines.length * K.lineH(t.f), left = x + (cw - (54 + textW)) / 2;
      part(S, `benefit:${b.id}`, TL.benefits, i * TL.benefit, 'pop', { x, y, w: cw, h: 114 }, () => {
        K.box(ctx, x, y, cw, 114, { fill: i % 2 ? WHITE : th.accent, border: INK, bw: 6 });
        K.icon(ctx, b.icon, left, y + 35, 44, INK);
        K.block(ctx, t.lines, left + 54, y + (114 - textH) / 2, t.f, { color: INK });
      });
    });
  }

  function bdCall(S) {
    const { ctx, theme: th } = S;
    K.box(ctx, 26, 1004, 1028, 320, { fill: th.accent, border: INK, bw: 10 });
    K.box(ctx, 36, 1014, 1008, 300, { border: WHITE, bw: 6 });
    const phone = K.phone(S);
    if (!phone) return;
    const L = K.labels(S);
    const fl = K.fit(ctx, L.callBoth, { fam: 'bangers', size: 52, ls: 3, lh: 1 }, 896).f;
    const fp = K.fitted(S, phone, { fam: 'anton', size: 138, lh: 1 }, 960).f;
    const hl = K.lineH(fl), h1 = Math.max(50, hl);
    const top = 1014 + (300 - h1 - K.lineH(fp)) / 2;
    const x1 = 540 - (64 + K.width(ctx, L.callBoth, fl)) / 2;
    part(S, phoneKey(S), TL.contacts, 0, 'rise', { x: 26, y: 1004, w: 1028, h: 320 }, () => {
      K.icon(ctx, 'phone', x1, top + (h1 - 50) / 2, 50, INK);
      K.text(ctx, L.callBoth, x1 + 64, top + (h1 - hl) / 2, fl, { color: INK });
      bigPhone(S, phone, 540, top + h1, fp, { color: WHITE, stroke: [7, INK], under: true, shadow: [8, 8, INK], align: 'center' });
    });
  }

  define({
    id: 'bd',
    name: 'Banda Desenhada',
    description: 'Vinhetas de banda desenhada: fotografia, balão de fala, seis quadros com ícones e o telefone.',
    icon: 'sparkles',
    trade: 'servente',
    defaults: { primary: '#000000', accent: '#FFDD00', bg: '#FFFFFF', text: '#000000', fonts: 'impact', upper: true },
    brand: BRAND,
    texts: () => sample({ kicker: 'Procuram-se na Suíça:', headline: 'Encarregados', badge: 'Precisamos\nde ti!', contactIcon: 'phone' }),
    theme(R, t) {
      return {
        ...t, headline: '#FFFFFF', kicker: t.accent, kickerBg: t.accent, kickerFg: U.onColor(t.accent), brand: DARK, brandTag: DARK, bar: t.accent,
        iconLine: DARK, iconShadow: DARK, iconBg: t.accent, iconFg: U.onColor(t.accent),
        boxBg: t.bg, boxLine: DARK, boxTitle: DARK, boxText: DARK, bullet: DARK,
        badgeBg: '#FFFFFF', badgeFg: DARK,
      };
    },
    render(R) {
      K.stage(R, bdBack, (S) => {
        bdPhoto(S);
        bdBadge(S);
        bdTitle(S);
        bdPerks(S);
        bdCall(S);
      });
    },
  });
})();
