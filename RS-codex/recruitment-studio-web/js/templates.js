// The poster templates. Each one places the shared content (photo, logo,
// headline, benefits, positions, contacts, badge) in its own composition.
window.RS = window.RS || {};

RS.templates = (() => {
  const E = RS.engine;
  const U = RS.util;
  const list = [];
  const define = (t) => { list.push(t); return t; };

  const poly = (pts) => (ctx) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  const fillPoly = (ctx, pts, color) => { poly(pts)(ctx); ctx.fillStyle = color; ctx.fill(); };
  const vGradient = (ctx, x, y0, w, y1, stops) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, c] of stops) g.addColorStop(at, c);
    ctx.fillStyle = g;
    ctx.fillRect(x, Math.min(y0, y1), w, Math.abs(y1 - y0));
  };
  const SAFE_TOP = E.SAFE.top, SAFE_BOTTOM = E.SAFE.bottom;
  // Logo on top of a photo: on a white plate (`plate`), or white with a soft
  // shadow when it has transparency; opaque logos always get the plate.
  function logoOverPhoto(R, x, y, maxW, plate) {
    const img = R.images.logo;
    const tone = R.style.logoTone;
    if (plate || (img && tone === 'auto' && !E.analyseLogo(img).transparent)) {
      return E.logoAt(R, x, y, maxW, { plate: 18, logoBg: '#FFFFFF', brandColor: U.ensureContrast(R.theme.primary, '#FFFFFF', 3), brandTagColor: U.ensureContrast(R.theme.accent, '#FFFFFF', 3) });
    }
    return E.logoAt(R, x, y, maxW, {
      logoTone: tone === 'auto' ? 'white' : tone, logoBg: '#000000', shadow: true,
      brandColor: '#FFFFFF', brandTagColor: '#FFFFFF',
    });
  }

  // ------------------------------------------------------------ 1. Diagonal
  define({
    id: 'diagonal',
    name: 'Diagonal',
    description: 'Fotografia à direita com corte inclinado. O clássico dos anúncios de obra.',
    icon: 'hard-hat',
    sample: 'construction',
    trade: 'obras',
    defaults: { primary: '#0B2E6B', accent: '#2AA3F0', bg: '#FFFFFF', text: '#14213D', fonts: 'modern', upper: true },
    theme(R, t) {
      const boxBg = U.mix(t.accent, t.bg, 0.85);
      return {
        ...t, boxBg,
        kicker: U.ensureContrast(U.mix(t.primary, t.accent, 0.45), t.bg, 3.5),
        boxTitle: U.ensureContrast(U.mix(t.primary, t.accent, 0.5), boxBg, 3.5),
        boxText: U.ensureContrast(t.text, boxBg, 4.5),
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      const eT = W * (square ? 0.64 : 0.62), eB = W * (square ? 0.55 : 0.53);
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      E.photo(R, { x: eB, y: 0, w: W - eB, h: H }, poly([[eT, 0], [W, 0], [W, H], [eB, H]]));
      fillPoly(ctx, [[eT - 1, 0], [eT + 13, 0], [eB + 13, H], [eB - 1, H]], th.accent);
      if (story) {
        // Footer band in the strip Instagram covers, so the bottom never looks empty.
        ctx.fillStyle = th.primary; ctx.fillRect(0, H - SAFE_BOTTOM + 60, W, SAFE_BOTTOM - 60);
        ctx.fillStyle = th.accent; ctx.fillRect(0, H - SAFE_BOTTOM + 60, W, 10);
      }
      const padX = 64;
      const top = story ? SAFE_TOP : square ? 52 : 64;
      const bottom = story ? H - SAFE_BOTTOM : H - (square ? 48 : 60);
      const widthAt = (y) => eT + (eB - eT) * (y / H) - padX - 36;
      E.plan(R, { x: padX, y: top, w: widthAt(top), h: bottom - top, widthAt },
        { contactsAt: 'bottom', bar: true, iconStyle: 'solid', boxStyle: 'tint' }).draw();
      E.badge(R, W * 0.81, story ? H * 0.64 : H * 0.79, story ? 150 : square ? 112 : 130);
    },
  });

  // ------------------------------------------------------------ 2. Noite
  define({
    id: 'noite',
    name: 'Noite',
    description: 'Fundo escuro com a fotografia a fundir-se no texto. Forte e elegante.',
    icon: 'droplets',
    sample: 'logistics',
    trade: 'canalizador',
    defaults: { primary: '#16324F', accent: '#FFB81C', bg: '#0C1622', text: '#FFFFFF', fonts: 'modern', upper: true },
    theme(R, t) {
      const boxBg = U.mix(t.bg, '#FFFFFF', 0.08);
      const accent = U.ensureContrast(t.accent, t.bg, 4);
      return {
        ...t, boxBg,
        headline: U.ensureContrast(t.text, t.bg, 7),
        kicker: accent, brand: U.ensureContrast(t.text, t.bg, 7), brandTag: accent,
        iconBg: accent, iconFg: U.onColor(accent), iconSoft: U.mix(accent, t.bg, 0.8),
        boxTitle: accent, boxText: U.ensureContrast(t.text, boxBg, 4.5), bullet: accent,
        contactMain: accent, contactText: t.text, bar: accent,
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      if (story) {
        const ph = H * 0.4;
        E.photo(R, { x: 0, y: 0, w: W, h: ph });
        vGradient(ctx, 0, ph * 0.4, W, ph + 1, [[0, U.rgba(th.bg, 0)], [1, U.rgba(th.bg, 1)]]);
        const top = ph * 0.76;
        E.plan(R, { x: 72, y: top, w: W - 144, h: H - SAFE_BOTTOM - top },
          { contactsAt: 'bottom', bar: true, iconStyle: 'ring', boxStyle: 'tint' }).draw();
        E.badge(R, W - 190, SAFE_TOP + 150, 135);
        return;
      }
      const px = W * 0.4;
      E.photo(R, { x: px, y: 0, w: W - px, h: H });
      const g = ctx.createLinearGradient(px, 0, W * 0.74, 0);
      g.addColorStop(0, U.rgba(th.bg, 1)); g.addColorStop(0.3, U.rgba(th.bg, 0.82)); g.addColorStop(1, U.rgba(th.bg, 0));
      ctx.fillStyle = g; ctx.fillRect(px - 1, 0, W * 0.74 - px + 1, H);
      vGradient(ctx, px, H * 0.68, W - px, H, [[0, U.rgba(th.bg, 0)], [1, U.rgba(th.bg, 0.6)]]);
      const padX = 64, top = square ? 52 : 64, bottom = H - (square ? 48 : 60);
      E.plan(R, { x: padX, y: top, w: W * 0.57 - padX, h: bottom - top },
        { contactsAt: 'bottom', bar: true, iconStyle: 'ring', boxStyle: 'tint' }).draw();
      E.badge(R, W * 0.84, square ? 150 : 172, square ? 104 : 120);
    },
  });

  // ------------------------------------------------------------ 3. Faixa
  define({
    id: 'faixa',
    name: 'Faixa',
    description: 'Fotografia em cima e o título numa faixa inclinada, com contactos no rodapé.',
    icon: 'paint-roller',
    sample: 'hospitality',
    trade: 'pintor',
    defaults: { primary: '#0F4C5C', accent: '#FF7A59', bg: '#FFFFFF', text: '#1B2A33', fonts: 'modern', upper: true },
    theme(R, t) {
      return { ...t, iconBg: U.ensureContrast(t.primary, t.bg, 3), iconSoft: U.mix(t.primary, t.bg, 0.86) };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const photoH = H * (story ? 0.4 : square ? 0.29 : 0.44);
      E.photo(R, { x: 0, y: 0, w: W, h: photoH + 60 });
      const bandH = story ? 340 : square ? 236 : 290;
      const slope = square ? 40 : 56;
      const y0 = photoH - bandH * 0.5;
      const onBand = U.onColor(th.primary);
      fillPoly(ctx, [[0, y0 + slope], [W, y0], [W, y0 + bandH], [0, y0 + bandH + slope]], th.primary);
      fillPoly(ctx, [[0, y0 + slope - 12], [W, y0 - 12], [W, y0], [0, y0 + slope]], th.accent);
      E.plan(R, { x: 64, y: y0 + slope + 24, w: W - 128 - (square ? 150 : 190), h: bandH - slope - 48 }, {
        order: ['kicker', 'headline'], align: 'center', fill: false, headLines: square ? 2 : 3, report: false,
        theme: { kicker: U.ensureContrast(th.accent, th.primary, 3), headline: onBand },
      }).draw();
      logoOverPhoto(R, 64 + 6, story ? SAFE_TOP + 20 : 52 + 6, W * 0.42, true);
      const footerH = story ? 132 : square ? 100 : 118;
      const footerY = story ? H - SAFE_BOTTOM - footerH : H - footerH;
      const cTop = y0 + bandH + slope + (square ? 30 : 46);
      E.plan(R, { x: 64, y: cTop, w: W - 128, h: footerY - cTop - (square ? 26 : 40) }, {
        order: ['intro', 'benefits', 'positions'], benefitCols: 2, iconStyle: 'soft', boxStyle: 'tint', positionCols: 2,
      }).draw();
      const footer = U.mix(th.primary, '#000000', 0.18);
      ctx.fillStyle = footer; ctx.fillRect(0, footerY, W, H - footerY);
      E.contactsRow(R, { x: 64, y: footerY, w: W - 128, h: footerH },
        { color: U.onColor(footer), iconBg: th.accent, iconFg: U.onColor(th.accent) });
      E.badge(R, W - (square ? 120 : 150), y0 + bandH * 0.5, story ? 130 : square ? 92 : 112);
    },
  });

  // ------------------------------------------------------------ 4. Cartão
  define({
    id: 'cartao',
    name: 'Cartão',
    description: 'A fotografia ocupa tudo e a informação vive num cartão branco.',
    icon: 'hammer',
    sample: 'industry',
    trade: 'cofragem',
    defaults: { primary: '#1A3FB8', accent: '#FFD23F', bg: '#FFFFFF', text: '#16213A', fonts: 'geometric', upper: true },
    theme(R, t) {
      return { ...t, kickerBg: t.accent, kickerFg: U.onColor(t.accent) };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      E.photo(R, { x: 0, y: 0, w: W, h: H });
      const shade = U.mix(th.primary, '#000000', 0.55);
      vGradient(ctx, 0, 0, W, 320, [[0, 'rgba(0,0,0,0.45)'], [1, 'rgba(0,0,0,0)']]);
      vGradient(ctx, 0, H * 0.35, W, H, [[0, U.rgba(shade, 0)], [1, U.rgba(shade, 0.78)]]);
      const m = square ? 48 : 56;
      const cardX = m, cardW = W - 2 * m;
      const bottomM = story ? SAFE_BOTTOM : m;
      const pad = square ? 44 : 52;
      const rowH = square ? 76 : 88;
      const maxH = H * (story ? 0.5 : square ? 0.66 : 0.64);
      const p = E.plan(R, { x: cardX + pad, y: 0, w: cardW - 2 * pad, h: maxH - 2 * pad - rowH - 26 }, {
        order: ['kicker', 'headline', 'intro', 'benefits', 'positions'], fill: false,
        kickerStyle: 'pill', iconStyle: 'solid', boxStyle: 'rule', benefitCols: 2, positionCols: 2, iconMul: 0.86,
      });
      const hasContacts = R.show.contacts && ((R.t.contacts || []).some((c) => c.text.trim()) || E.qrText(R));
      const cardH = p.height + 2 * pad + (hasContacts ? rowH + 26 : 0);
      const cardY = H - bottomM - cardH;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 40 * R.scale; ctx.shadowOffsetY = 14 * R.scale;
      E.roundRect(ctx, cardX, cardY, cardW, cardH, 30);
      ctx.fillStyle = th.bg; ctx.fill();
      ctx.restore();
      p.draw(cardX + pad, cardY + pad, p.height);
      if (hasContacts) {
        const ly = cardY + pad + p.height + 24;
        ctx.fillStyle = U.mix(th.text, th.bg, 0.86); ctx.fillRect(cardX + pad, ly, cardW - 2 * pad, 2);
        E.contactsRow(R, { x: cardX + pad, y: ly + 2, w: cardW - 2 * pad, h: rowH }, {
          align: 'left', color: th.contactMain, iconBg: th.primary, iconFg: U.onColor(th.primary),
        });
      }
      logoOverPhoto(R, 64, story ? SAFE_TOP + 10 : 60, W * 0.46);
      E.badge(R, W - (square ? 140 : 170), story ? SAFE_TOP + 170 : square ? 150 : 190, story ? 135 : square ? 100 : 118);
    },
  });

  // ------------------------------------------------------------ 5. Sinal
  define({
    id: 'sinal',
    name: 'Sinal',
    description: 'Amarelo industrial e letra pesada. Impossível passar sem ver.',
    icon: 'flame',
    sample: 'metal',
    trade: 'serralheiro',
    defaults: { primary: '#141414', accent: '#FFC400', bg: '#FFC400', text: '#141414', fonts: 'impact', upper: true },
    theme(R, t) {
      const ink = U.ensureContrast(t.primary, t.bg, 4.5);
      return {
        ...t,
        headline: ink, kicker: ink, kickerBg: ink, kickerFg: U.ensureContrast(t.bg, ink, 4.5),
        brand: ink, brandTag: ink, iconBg: ink, iconFg: U.ensureContrast(t.bg, ink, 3),
        boxLine: ink, boxTitle: ink, boxText: U.ensureContrast(t.text, t.bg, 4.5), bullet: ink,
        contactMain: ink,
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      const ink = th.headline;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const footerH = story ? 150 : square ? 110 : 130;
      const footerY = story ? H - SAFE_BOTTOM - footerH : H - footerH;
      const stripeH = 28;
      const pb = footerY - stripeH;
      const xT = W * (square ? 0.55 : 0.53), xB = W * (square ? 0.46 : 0.43);
      E.photo(R, { x: xB, y: 0, w: W - xB, h: pb }, poly([[xT, 0], [W, 0], [W, pb], [xB, pb]]));
      ctx.save();
      ctx.lineWidth = 14; ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.moveTo(xT, -10); ctx.lineTo(xB, pb + 10); ctx.stroke();
      ctx.beginPath(); ctx.rect(0, pb, W, stripeH); ctx.clip();
      ctx.fillStyle = th.bg; ctx.fillRect(0, pb, W, stripeH);
      for (let x = -stripeH; x < W + stripeH; x += 56) fillPoly(ctx, [[x, pb + stripeH], [x + 28, pb + stripeH], [x + 28 + stripeH, pb], [x + stripeH, pb]], ink);
      ctx.restore();
      ctx.fillStyle = ink; ctx.fillRect(0, footerY, W, H - footerY);
      E.contactsRow(R, { x: 64, y: footerY, w: W - 128, h: footerH },
        { color: U.ensureContrast(th.bg, ink, 4.5), iconBg: th.bg, iconFg: ink });
      const padX = 64;
      const top = story ? SAFE_TOP : square ? 48 : 60;
      const bottom = pb - (square ? 34 : 46);
      const widthAt = (y) => xT + (xB - xT) * (y / pb) - padX - 44;
      E.plan(R, { x: padX, y: top, w: widthAt(top), h: bottom - top, widthAt }, {
        order: ['logo', 'kicker', 'headline', 'intro', 'benefits', 'positions'],
        kickerStyle: 'pill', pillRadius: 6, iconStyle: 'solid', boxStyle: 'outline', boxRadius: 6,
      }).draw();
      E.badge(R, W * 0.76, pb - (story ? 200 : square ? 130 : 160), story ? 140 : square ? 98 : 118, { bg: ink, fg: th.bg });
    },
  });

  // ------------------------------------------------------------ 6. Editorial
  define({
    id: 'editorial',
    name: 'Editorial',
    description: 'Claro e sereno, com serifa. Para escritório, saúde e serviços.',
    icon: 'pencil-ruler',
    sample: 'office',
    trade: 'pladur',
    defaults: { primary: '#17324D', accent: '#E86A33', bg: '#F3F5F8', text: '#1B2430', fonts: 'elegant', upper: false },
    theme(R, t) {
      return { ...t, boxLine: U.mix(t.primary, t.bg, 0.55), boxTitle: U.ensureContrast(t.accent, t.bg, 3.2), bullet: t.accent };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const m = square ? 48 : 56;
      if (story) {
        // Story: text in the middle, photo at the bottom where Instagram puts its reply bar.
        const photoY = H * 0.6;
        E.photo(R, { x: m, y: photoY, w: W - 2 * m, h: H - photoY + 60 }, (c) => E.roundRect(c, m, photoY, W - 2 * m, H - photoY + 60, 40));
        E.plan(R, { x: 72, y: SAFE_TOP, w: W - 144, h: photoY - 56 - SAFE_TOP }, {
          order: ['logo', 'kicker', 'headline', 'intro', 'benefits', 'positions', 'contacts'],
          contactsAt: 'bottom', iconStyle: 'soft', boxStyle: 'outline', benefitCols: 2, positionCols: 2,
        }).draw();
        E.badge(R, W - m - 140, photoY + 30, 112);
        return;
      }
      const py = m;
      const ph = H * (story ? 0.29 : square ? 0.33 : 0.36);
      E.photo(R, { x: m, y: py, w: W - 2 * m, h: ph }, (c) => E.roundRect(c, m, py, W - 2 * m, ph, 36));
      logoOverPhoto(R, m + 34, story ? SAFE_TOP + 16 : py + 34, W * 0.42, true);
      const r = square ? 88 : 104;
      E.badge(R, W - m - r - 28, py + ph - r - 28, r);
      const rowH = square ? 70 : 80;
      const bottom = story ? H - SAFE_BOTTOM : H - (square ? 40 : 52);
      const ruleY = bottom - rowH - 10;
      const cTop = py + ph + (square ? 40 : 56);
      E.plan(R, { x: m + 8, y: cTop, w: W - 2 * m - 16, h: ruleY - cTop - (square ? 20 : 30) }, {
        order: ['kicker', 'headline', 'intro', 'benefits', 'positions'],
        benefitCols: 2, iconStyle: 'soft', boxStyle: 'outline', headLines: square ? 2 : 3,
      }).draw();
      if (R.show.contacts && ((R.t.contacts || []).some((c) => c.text.trim()) || E.qrText(R))) {
        ctx.fillStyle = U.mix(th.primary, th.bg, 0.7); ctx.fillRect(m + 8, ruleY, W - 2 * m - 16, 2);
        E.contactsRow(R, { x: m + 8, y: ruleY + 8, w: W - 2 * m - 16, h: rowH }, {
          align: 'left', color: th.contactMain, iconStyle: 'soft',
        });
      }
    },
  });

  // ------------------------------------------------------------ decor shared by the trade templates
  // Seeded random numbers, so a texture is identical in the preview and the export.
  function mulberry32(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Caution tape across the poster, repeating the kicker ("ESTAMOS A RECRUTAR • ...").
  function cautionTape(R, cy, h, angle) {
    const { ctx, W, theme: th } = R;
    const yel = th.primary;
    const ink = U.onColor(yel, '#111111');
    const L = W * 1.4;
    const t = R.show.kicker ? (R.t.kicker || '').trim() : '';
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24 * R.scale; ctx.shadowOffsetY = 8 * R.scale;
    ctx.fillStyle = yel; ctx.fillRect(-L / 2, -h / 2, L, h);
    ctx.shadowColor = 'transparent';
    const sh = h * 0.2;
    ctx.save();
    ctx.beginPath(); ctx.rect(-L / 2, -h / 2, L, sh); ctx.rect(-L / 2, h / 2 - sh, L, sh); ctx.clip();
    for (let x = -L / 2 - h; x < L / 2; x += sh * 2) fillPoly(ctx, [[x, h / 2], [x + sh, h / 2], [x + sh + h, -h / 2], [x + h, -h / 2]], ink);
    ctx.restore();
    if (t) {
      const size = h * 0.4;
      E.setFont(ctx, R.fonts.sub, size, 0.08);
      const unit = `${t.toLocaleUpperCase(R.locale)}   •   `;
      const uw = ctx.measureText(unit).width;
      ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      // video: the tape text scrolls slowly to the left
      const shift = R.anim && uw > 0 ? -((R.anim.t * 70) % uw) : 0;
      for (let x = -L / 2 + 24 + shift; x < L / 2; x += uw) ctx.fillText(unit, x, size * 0.36);
    }
    ctx.restore();
    if (t) R.hit('kicker', 0, cy - h / 2 - 24, W, h + 48);
  }

  function blueprintGrid(R, color) {
    const { ctx, W, H } = R;
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 27) {
      ctx.strokeStyle = U.rgba(color, x % 135 === 0 ? 0.12 : 0.05);
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 27) {
      ctx.strokeStyle = U.rgba(color, y % 135 === 0 ? 0.12 : 0.05);
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  const concreteCache = new Map();
  function concrete(R) {
    const { ctx, W, H, theme: th } = R;
    const key = `${W}x${H}:${th.bg}`;
    let tex = concreteCache.get(key);
    if (!tex) {
      tex = document.createElement('canvas');
      tex.width = W; tex.height = H;
      const x = tex.getContext('2d');
      x.fillStyle = th.bg; x.fillRect(0, 0, W, H);
      const rnd = mulberry32(1337);
      const dark = U.mix(th.bg, '#000000', 0.5), light = U.mix(th.bg, '#FFFFFF', 0.6);
      for (let i = 0; i < 9; i++) {
        const cx = rnd() * W, cy = rnd() * H, r = 140 + rnd() * 280;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, U.rgba(rnd() < 0.5 ? dark : light, 0.12)); g.addColorStop(1, U.rgba(th.bg, 0));
        x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      const n = Math.round((W * H) / 520);
      for (let i = 0; i < n; i++) {
        x.globalAlpha = 0.05 + rnd() * 0.12;
        x.fillStyle = rnd() < 0.6 ? dark : light;
        x.beginPath(); x.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 2.2, 0, Math.PI * 2); x.fill();
      }
      if (concreteCache.size > 4) concreteCache.clear();
      concreteCache.set(key, tex);
    }
    ctx.drawImage(tex, 0, 0, W, H);
  }

  const hasContactRow = (R) => R.show.contacts && ((R.t.contacts || []).some((c) => c.text.trim()) || E.qrText(R));
  const safeTop = (R, normal) => (R.fmt.id === 'story' ? SAFE_TOP : normal);
  const safeBottom = (R, normal) => (R.fmt.id === 'story' ? R.H - SAFE_BOTTOM : R.H - normal);

  // ------------------------------------------------------------ 7. Estaleiro
  define({
    id: 'estaleiro',
    name: 'Estaleiro',
    description: 'Fita de sinalização com a chamada repetida e amarelo de obra.',
    icon: 'construction',
    trade: 'pedreiro',
    defaults: { primary: '#FFC400', accent: '#FF7A00', bg: '#17191C', text: '#FFFFFF', fonts: 'impact', upper: true },
    theme(R, t) {
      const y = U.ensureContrast(t.primary, t.bg, 4);
      const boxBg = U.mix(t.bg, '#FFFFFF', 0.07);
      return {
        ...t, boxBg,
        headline: U.ensureContrast(t.text, t.bg, 7), kicker: y, brand: '#FFFFFF', brandTag: y,
        iconBg: y, iconFg: U.onColor(y), iconSoft: U.mix(y, t.bg, 0.8),
        boxLine: y, boxTitle: y, boxText: U.ensureContrast(t.text, boxBg, 4.5), bullet: y,
        contactMain: y, contactText: t.text, bar: y, badgeBg: y, badgeFg: U.onColor(y),
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const ph = H * (story ? 0.4 : square ? 0.37 : 0.39);
      E.photo(R, { x: 0, y: 0, w: W, h: ph + 30 });
      vGradient(ctx, 0, ph * 0.5, W, ph + 31, [[0, U.rgba(th.bg, 0)], [1, U.rgba(th.bg, 1)]]);
      const tapeH = square ? 62 : 74;
      cautionTape(R, ph - tapeH * 0.2, tapeH, -0.035);
      logoOverPhoto(R, 70, story ? SAFE_TOP + 20 : 58, W * 0.42, true);
      const top = ph + tapeH * 0.5 + (square ? 34 : 50);
      E.plan(R, { x: 64, y: top, w: W - 128, h: safeBottom(R, square ? 44 : 56) - top }, {
        order: ['headline', 'intro', 'benefits', 'positions', 'contacts'], contactsAt: 'bottom',
        iconStyle: 'solid', boxStyle: 'outline', boxRadius: 4, benefitCols: 2, positionCols: 2, headLines: square ? 2 : 3,
      }).draw();
      E.badge(R, W - 150, story ? SAFE_TOP + 170 : square ? 128 : 160, story ? 130 : square ? 94 : 112);
    },
  });

  // ------------------------------------------------------------ 8. Planta
  define({
    id: 'planta',
    name: 'Planta',
    description: 'Fundo de planta técnica e fotografia num círculo cotado.',
    icon: 'pencil-ruler',
    trade: 'tecnico',
    defaults: { primary: '#0F3B6E', accent: '#FFD23F', bg: '#0F3B6E', text: '#FFFFFF', fonts: 'geometric', upper: true },
    theme(R, t) {
      const acc = U.ensureContrast(t.accent, t.bg, 4);
      const boxBg = U.mix(t.bg, '#FFFFFF', 0.06);
      return {
        ...t, boxBg,
        headline: U.ensureContrast(t.text, t.bg, 7), kicker: acc, brand: '#FFFFFF', brandTag: acc,
        iconBg: '#FFFFFF', iconFg: t.bg, iconSoft: U.mix('#FFFFFF', t.bg, 0.85),
        boxLine: U.mix(t.text, t.bg, 0.35), boxTitle: acc, boxText: U.ensureContrast(t.text, boxBg, 4.5), bullet: acc,
        contactMain: acc, contactText: t.text, bar: acc,
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      blueprintGrid(R, th.text);
      const r = W * (story ? 0.36 : square ? 0.29 : 0.33);
      const cx = W - r * 0.66;
      const cy = story ? SAFE_TOP + r * 0.92 : r * (square ? 0.98 : 1.06);
      E.photo(R, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, (c) => { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.closePath(); });
      ctx.save();
      ctx.lineWidth = 8; ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([6, 12]); ctx.lineWidth = 3; ctx.strokeStyle = th.accent;
      ctx.beginPath(); ctx.arc(cx, cy, r + 30, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const dy = cy + r + 58;
      ctx.strokeStyle = U.rgba('#FFFFFF', 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - r, dy); ctx.lineTo(W, dy); ctx.moveTo(cx - r, dy - 14); ctx.lineTo(cx - r, dy + 14); ctx.stroke();
      ctx.restore();
      const top = safeTop(R, square ? 52 : 64);
      const colW = Math.max(320, cx - r - 56 - 64);
      const clearY = dy + 24;
      E.plan(R, { x: 64, y: top, w: colW, h: safeBottom(R, square ? 48 : 60) - top, widthAt: (y) => (y < clearY ? colW : W - 128) }, {
        contactsAt: 'bottom', bar: true, iconStyle: 'ring', boxStyle: 'dashed', boxRadius: 6, benefitCols: 'auto',
      }).draw();
      E.badge(R, cx - r * 0.72, cy + r * 0.7, story ? 124 : square ? 90 : 108);
    },
  });

  // ------------------------------------------------------------ 9. Betão
  define({
    id: 'betao',
    name: 'Betão',
    description: 'Textura de cimento, laranja de obra e caixa escura. Robusto.',
    icon: 'construction',
    trade: 'ferro',
    defaults: { primary: '#1F1F1F', accent: '#F26B1D', bg: '#D7D4CE', text: '#1F1F1F', fonts: 'modern', upper: true },
    theme(R, t) {
      return {
        ...t,
        headline: U.ensureContrast(t.primary, t.bg, 7), kicker: U.ensureContrast(t.accent, t.bg, 3),
        brand: U.ensureContrast(t.primary, t.bg, 7), brandTag: U.ensureContrast(t.accent, t.bg, 3),
        bar: t.accent, iconBg: t.accent, iconFg: U.onColor(t.accent), badgeBg: t.accent, badgeFg: U.onColor(t.accent),
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      concrete(R);
      const ph = H * (story ? 0.44 : square ? 0.56 : 0.52);
      const xT = W * 0.38, xB = W * 0.5;
      E.photo(R, { x: xT, y: 0, w: W - xT, h: ph }, poly([[xT, 0], [W, 0], [W, ph], [xB, ph]]));
      ctx.save();
      ctx.lineWidth = 16; ctx.strokeStyle = th.accent;
      ctx.beginPath(); ctx.moveTo(xT - 8, -10); ctx.lineTo(xB - 8, ph); ctx.lineTo(W + 10, ph); ctx.stroke();
      ctx.restore();
      const top = safeTop(R, square ? 52 : 64);
      const edgeAt = (y) => xT + (xB - xT) * Math.min(1, Math.max(0, y / ph));
      E.plan(R, { x: 64, y: top, w: Math.max(300, edgeAt(top) - 108), h: safeBottom(R, square ? 48 : 60) - top, widthAt: (y) => (y < ph + 30 ? Math.max(300, edgeAt(y) - 108) : W - 128) }, {
        contactsAt: 'bottom', bar: true, iconStyle: 'square', boxStyle: 'solid', boxRadius: 6, benefitCols: 'auto',
      }).draw();
      E.badge(R, W - 150, ph - 120, story ? 126 : square ? 92 : 110);
    },
  });

  // ------------------------------------------------------------ 10. Divisão
  define({
    id: 'divisao',
    name: 'Divisão',
    description: 'Fotografia à esquerda com um corte em seta a apontar para a oferta.',
    icon: 'ruler',
    trade: 'ladrilhador',
    defaults: { primary: '#134E3A', accent: '#B5D334', bg: '#FFFFFF', text: '#14231C', fonts: 'modern', upper: true },
    theme(R, t) {
      return { ...t, kicker: U.ensureContrast(U.mix(t.primary, t.accent, 0.35), t.bg, 3.5) };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const px = W * (square ? 0.4 : 0.42), d = square ? 64 : 74;
      E.photo(R, { x: 0, y: 0, w: px + d, h: H }, poly([[0, 0], [px, 0], [px + d, H / 2], [px, H], [0, H]]));
      ctx.save();
      ctx.lineWidth = 12; ctx.lineJoin = 'miter'; ctx.strokeStyle = th.accent;
      ctx.beginPath(); ctx.moveTo(px + 16, -10); ctx.lineTo(px + d + 16, H / 2); ctx.lineTo(px + 16, H + 10); ctx.stroke();
      ctx.restore();
      const x0 = px + d + 50;
      const top = safeTop(R, square ? 52 : 64);
      E.plan(R, { x: x0, y: top, w: W - x0 - 56, h: safeBottom(R, square ? 48 : 60) - top }, {
        contactsAt: 'bottom', bar: true, iconStyle: 'solid', boxStyle: 'tint',
      }).draw();
      E.badge(R, px * 0.5, story ? H - SAFE_BOTTOM - 140 : H - (square ? 150 : 170), story ? 124 : square ? 92 : 108);
    },
  });

  // ------------------------------------------------------------ 11. Faísca
  define({
    id: 'faisca',
    name: 'Faísca',
    description: 'Recorte em relâmpago e amarelo elétrico. Feito para eletricistas.',
    icon: 'zap',
    trade: 'eletricista',
    defaults: { primary: '#FFE14D', accent: '#39D0FF', bg: '#0B0F19', text: '#FFFFFF', fonts: 'geometric', upper: true },
    theme(R, t) {
      const y = U.ensureContrast(t.primary, t.bg, 4);
      const boxBg = U.mix(t.bg, '#FFFFFF', 0.07);
      return {
        ...t, boxBg,
        headline: U.ensureContrast(t.text, t.bg, 7), kicker: y, brand: '#FFFFFF', brandTag: y,
        iconBg: y, iconFg: U.onColor(y), iconSoft: U.mix(y, t.bg, 0.8),
        boxLine: y, boxTitle: y, boxText: U.ensureContrast(t.text, boxBg, 4.5), bullet: y,
        contactMain: y, contactText: t.text, bar: y, badgeBg: y, badgeFg: U.onColor(y),
      };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const edge = [[0.6, 0], [0.53, 0.33], [0.61, 0.33], [0.52, 0.67], [0.6, 0.67], [0.52, 1]].map(([fx, fy]) => [W * fx, H * fy]);
      E.photo(R, { x: W * 0.5, y: 0, w: W * 0.5, h: H }, poly([...edge, [W, H], [W, 0]]));
      ctx.save();
      ctx.shadowColor = U.rgba(th.primary, 0.85); ctx.shadowBlur = 28 * R.scale;
      ctx.lineWidth = 9; ctx.lineJoin = 'miter'; ctx.strokeStyle = th.primary;
      ctx.beginPath(); edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.restore();
      // Leftmost point of the bolt edge at height y (the text column stops before it).
      const edgeAt = (y) => {
        let min = W;
        for (let i = 0; i < edge.length - 1; i++) {
          const [x1, y1] = edge[i], [x2, y2] = edge[i + 1];
          if (y < Math.min(y1, y2) - 1 || y > Math.max(y1, y2) + 1) continue;
          min = Math.min(min, y1 === y2 ? Math.min(x1, x2) : x1 + (x2 - x1) * ((y - y1) / (y2 - y1)));
        }
        return min;
      };
      const top = safeTop(R, square ? 52 : 64);
      E.plan(R, { x: 64, y: top, w: edgeAt(top) - 104, h: safeBottom(R, square ? 48 : 60) - top, widthAt: (y) => edgeAt(y) - 104 }, {
        contactsAt: 'bottom', bar: true, iconStyle: 'ring', boxStyle: 'tint',
      }).draw();
      E.badge(R, W * 0.82, story ? SAFE_TOP + 160 : square ? 140 : 170, story ? 128 : square ? 94 : 112);
    },
  });

  // ------------------------------------------------------------ 12. Moldura
  define({
    id: 'moldura',
    name: 'Moldura',
    description: 'Moldura grossa e placa de título sobre a fotografia. Clássico de oficina.',
    icon: 'ruler',
    trade: 'carpinteiro',
    defaults: { primary: '#B3261E', accent: '#F2B705', bg: '#FFFFFF', text: '#1E1E1E', fonts: 'impact', upper: true },
    theme(R, t) {
      return { ...t, kicker: U.ensureContrast(t.primary, t.bg, 3), iconBg: U.ensureContrast(t.primary, t.bg, 3), badgeBg: t.accent, badgeFg: U.onColor(t.accent) };
    },
    render(R) {
      const { ctx, W, H, fmt, theme: th } = R;
      const story = fmt.id === 'story', square = fmt.id === 'square';
      const f = square ? 28 : 34, cut = 110;
      ctx.fillStyle = th.primary; ctx.fillRect(0, 0, W, H);
      fillPoly(ctx, [[f, f], [W - f - cut, f], [W - f, f + cut], [W - f, H - f], [f, H - f]], th.bg);
      const ph = H * (story ? 0.38 : square ? 0.36 : 0.4);
      E.photo(R, { x: f, y: f, w: W - 2 * f, h: ph - f }, poly([[f, f], [W - f - cut, f], [W - f, f + cut], [W - f, ph], [f, ph]]));
      logoOverPhoto(R, f + 30, story ? SAFE_TOP + 10 : f + 30, W * 0.42, true);
      const plateW = W * (square ? 0.8 : 0.84) - f, pad = square ? 26 : 32;
      const p = E.plan(R, { x: f + pad + 14, y: 0, w: plateW - pad * 2 - 14, h: H * (square ? 0.22 : 0.2) }, {
        order: ['kicker', 'headline'], fill: false, report: false, headLines: square ? 2 : 3,
        theme: { kicker: U.ensureContrast(th.accent, th.primary, 3), headline: U.onColor(th.primary) },
      });
      const plateH = p.height + pad * 2;
      const plateY = ph - plateH * 0.45;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 30 * R.scale; ctx.shadowOffsetY = 10 * R.scale;
      ctx.fillStyle = th.primary; ctx.fillRect(f, plateY, plateW, plateH);
      ctx.restore();
      ctx.fillStyle = th.accent; ctx.fillRect(f, plateY, 14, plateH);
      p.draw(f + pad + 14, plateY + pad, p.height);
      const top = plateY + plateH + (square ? 30 : 44);
      E.plan(R, { x: f + 40, y: top, w: W - 2 * f - 80, h: (story ? H - SAFE_BOTTOM : H - f - (square ? 30 : 40)) - top }, {
        order: ['intro', 'benefits', 'positions', 'contacts'], contactsAt: 'bottom',
        iconStyle: 'solid', boxStyle: 'outline', benefitCols: 2, positionCols: 2,
      }).draw();
      E.badge(R, W - f - 140, story ? SAFE_TOP + 130 : f + 150, story ? 124 : square ? 90 : 108);
    },
  });

  const byId = Object.fromEntries(list.map((t) => [t.id, t]));
  return { list, get: (id) => byId[id] || list[0] };
})();
