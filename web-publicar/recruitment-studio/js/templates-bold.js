// Bold poster templates: thick black outlines, hard shadows, colour blocks and a
// big phone box. Added to the same list as js/templates.js, with the same content.
window.RS = window.RS || {};

(() => {
  const E = RS.engine;
  const U = RS.util;
  const { define, kit } = RS.templates;
  const { fillPoly, logoOverPhoto, hasContactRow, safeTop, safeBottom } = kit;

  const INK = '#111111';
  const TILES = ['#E63946', '#1D4ED8', '#16A34A', '#F97316', '#7C3AED', '#0891B2'];
  const COMIC = ['#FF5A5F', '#FFFFFF', '#4ADE80', '#FFFFFF', '#FFB020', '#A78BFA'];

  // Layout band of the poster (story keeps clear of the Instagram overlays).
  function frame(R, margin) {
    const top = safeTop(R, margin), bottom = safeBottom(R, margin);
    return { top, bottom, at: (f) => top + (bottom - top) * f };
  }

  // Rectangle with a hard offset shadow and a thick outline.
  function hardBox(ctx, x, y, w, h, o) {
    if (o.shadow && o.off) { ctx.fillStyle = o.shadow; ctx.fillRect(x + o.off, y + o.off, w, h); }
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); }
    if (o.lw) { ctx.lineWidth = o.lw; ctx.strokeStyle = o.line; ctx.strokeRect(x + o.lw / 2, y + o.lw / 2, w - o.lw, h - o.lw); }
  }

  // Diagonal hazard stripes.
  function hazard(ctx, x, y, w, h, a, b) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = b;
    const step = Math.max(h, 20) * 1.2;
    for (let sx = x - h; sx < x + w + h; sx += step * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, y + h); ctx.lineTo(sx + h, y); ctx.lineTo(sx + h + step, y); ctx.lineTo(sx + step, y + h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Photo inside a thick border with a hard shadow, slightly turned.
  function framedPhoto(R, r, o) {
    const ctx = R.ctx;
    const b = o.border, off = o.off || 0;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    ctx.rotate(o.angle || 0);
    ctx.translate(-r.x - r.w / 2, -r.y - r.h / 2);
    if (off) { ctx.fillStyle = o.shadow; ctx.fillRect(r.x + off, r.y + off, r.w, r.h); }
    ctx.fillStyle = o.line; ctx.fillRect(r.x, r.y, r.w, r.h);
    E.photo(R, { x: r.x + b, y: r.y + b, w: r.w - 2 * b, h: r.h - 2 * b });
    ctx.restore();
  }

  // Big contacts inside a box. Returns false (and draws nothing) without contacts.
  function contactBox(R, r, o) {
    if (!hasContactRow(R)) return false;
    hardBox(R.ctx, r.x, r.y, r.w, r.h, o);
    const pad = (o.lw || 0) + 26;
    E.contactsRow(R, { x: r.x + pad, y: r.y + pad * 0.7, w: r.w - pad * 2, h: r.h - pad * 1.4 }, {
      color: o.text, iconBg: o.iconBg, iconFg: o.iconFg, sizeMul: o.sizeMul || 2.1,
    });
    return true;
  }

  const showBadge = (R) => R.show.badge && (R.t.badge || '').trim();

  // Badge text on a skewed band (flyers).
  function badgeBand(R, x, y, w, h, bg, fg) {
    const t = showBadge(R);
    if (!t) return false;
    const ctx = R.ctx, sk = h * 0.35;
    fillPoly(ctx, [[x + sk, y], [x + w, y], [x + w - sk, y + h], [x, y + h]], bg);
    let L = null;
    for (let size = h * 0.62; size > h * 0.2; size *= 0.94) {
      L = E.textLayout(t, { font: R.fonts.head, size, lh: 1, upper: true, maxW: w - sk * 2 - 20, locale: R.locale });
      if (L.lines.length === 1 && !L.broken) break;
    }
    L.draw(ctx, x + sk, y + (h - L.vh) / 2, fg, 'center', w - sk * 2);
    R.hit('badge', x, y, w, h);
    return true;
  }

  // ------------------------------------------------------------ Metade
  define({
    id: 'metade',
    name: 'Metade',
    description: 'Bloco de cor em cima, preto em baixo, ícones em blocos e o telefone em grande.',
    icon: 'construction',
    trade: 'maquinas',
    defaults: { primary: '#000000', accent: '#FFC800', bg: '#000000', text: '#FFFFFF', fonts: 'impact', upper: true },
    theme(R, t) {
      const a = t.accent, ink = U.onColor(a);
      return {
        ...t, headline: ink, kicker: ink, kickerBg: ink, kickerFg: a, brand: ink, brandTag: ink, bar: ink,
        iconBg: a, iconFg: U.onColor(a), iconLine: '#FFFFFF', iconShadow: '#FFFFFF',
        boxBg: t.bg, boxLine: a, boxTitle: a, boxText: t.text, bullet: a,
        badgeBg: '#FFFFFF', badgeFg: INK,
      };
    },
    render(R) {
      const { ctx, W, theme: th } = R;
      const { top, bottom, at } = frame(R, R.fmt.id === 'square' ? 36 : 44);
      const pad = 48, ink = U.onColor(th.accent);
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, R.H);
      const cutL = at(0.37), cutR = at(0.3);
      fillPoly(ctx, [[0, 0], [W, 0], [W, cutR], [0, cutL]], th.accent);
      E.plan(R, { x: pad, y: top, w: W - pad * 2, h: cutR - top - 30 }, {
        order: ['logo', 'kicker', 'headline'], kickerStyle: 'pill', pillRadius: 0, headLines: 3, fill: false,
      }).draw();
      const hasBox = hasContactRow(R);
      const colBottom = hasBox ? at(0.77) : bottom;
      framedPhoto(R, { x: W * 0.6, y: cutR - 10, w: W * 0.36, h: at(0.62) - cutR }, { border: 12, line: '#FFFFFF', shadow: th.accent, off: 16, angle: -0.035 });
      E.plan(R, { x: pad, y: cutL + 24, w: W * 0.56 - pad, h: colBottom - cutL - 24 }, {
        order: ['intro', 'benefits', 'positions'], iconStyle: 'block', iconMul: 0.8, boxStyle: 'outline', boxRadius: 0,
      }).draw();
      if (hasBox) {
        hazard(ctx, pad, at(0.785), W - pad * 2, 22, th.accent, '#000000');
        contactBox(R, { x: pad, y: at(0.82), w: W - pad * 2, h: bottom - at(0.82) }, { fill: th.accent, line: '#FFFFFF', lw: 10, text: ink, iconBg: ink, iconFg: th.accent });
      }
      E.badge(R, W * 0.86, cutR - 30, 92, { rotate: 0.12 });
    },
  });

  // ------------------------------------------------------------ Stencil
  define({
    id: 'stencil',
    name: 'Stencil',
    description: 'Cartão kraft com moldura preta grossa, fotografia com sombra e faixa de contacto.',
    icon: 'droplets',
    trade: 'canalizador',
    defaults: { primary: '#111111', accent: '#FF7A00', bg: '#C9A26A', text: '#111111', fonts: 'impact', upper: true },
    theme(R, t) {
      return {
        ...t, headline: INK, kicker: INK, kickerBg: INK, kickerFg: t.accent, brand: INK, brandTag: INK, bar: t.accent,
        iconBg: INK, iconFg: t.bg, iconLine: INK, iconShadow: t.accent,
        boxBg: U.mix(t.bg, '#FFFFFF', 0.25), boxLine: INK, boxTitle: INK, boxText: INK, bullet: INK,
        badgeBg: '#FFFFFF', badgeFg: INK,
      };
    },
    render(R) {
      const { ctx, W, H, theme: th } = R;
      const { top, bottom, at } = frame(R, R.fmt.id === 'square' ? 50 : 56);
      const f = 20, pad = 56;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 6;
      for (let x = -H; x < W; x += 34) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
      E.plan(R, { x: pad, y: top, w: W - pad * 2, h: at(0.34) - top }, {
        order: ['logo', 'kicker', 'headline', 'bar'], kickerStyle: 'pill', pillRadius: 0, headLines: 3, fill: false,
      }).draw();
      const hasBox = hasContactRow(R);
      const midTop = at(0.37), midBottom = hasBox ? at(0.79) : bottom;
      framedPhoto(R, { x: W * 0.55, y: midTop, w: W * 0.45 - pad, h: (midBottom - midTop) * 0.86 }, { border: 12, line: INK, shadow: th.accent, off: 14, angle: 0.025 });
      E.plan(R, { x: pad, y: midTop, w: W * 0.5 - pad, h: midBottom - midTop }, {
        order: ['intro', 'benefits', 'positions'], iconStyle: 'block', iconMul: 0.86, boxStyle: 'outline', boxRadius: 0,
      }).draw();
      if (hasBox) {
        const y = at(0.83);
        ctx.fillStyle = INK; ctx.fillRect(0, y - 10, W, 10);
        contactBox(R, { x: f, y, w: W - 2 * f, h: H - f - y }, { fill: th.accent, text: INK, iconBg: INK, iconFg: th.accent });
      }
      ctx.lineWidth = 2 * f; ctx.strokeStyle = INK; ctx.strokeRect(0, 0, W, H);
      E.badge(R, W * 0.57, midTop + 10, 86, { rotate: -0.16 });
    },
  });

  // ------------------------------------------------------------ Contraste
  define({
    id: 'contraste',
    name: 'Contraste',
    description: 'Preto e branco com uma cor forte: fotografia a cinzento, faixa de perigo e caixa branca.',
    icon: 'hard-hat',
    trade: 'carpinteiro',
    defaults: { primary: '#000000', accent: '#FF6A00', bg: '#000000', text: '#FFFFFF', fonts: 'impact', upper: true },
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
      const { ctx, W, H, theme: th } = R;
      const { top, bottom, at } = frame(R, R.fmt.id === 'square' ? 40 : 48);
      const pad = 48;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const ph = at(0.4);
      ctx.filter = 'grayscale(1) contrast(1.15)';
      E.photo(R, { x: 0, y: 0, w: W, h: ph });
      ctx.filter = 'none';
      const g = ctx.createLinearGradient(0, ph * 0.45, 0, ph + 1);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g; ctx.fillRect(0, ph * 0.45, W, ph * 0.55 + 1);
      const barH = top + 96;
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, barH);
      ctx.fillStyle = th.accent; ctx.fillRect(0, barH, W, 8);
      logoOverPhoto(R, pad, top + 8, W * 0.4, false);
      E.plan(R, { x: pad, y: at(0.27), w: W - pad * 2, h: at(0.5) - at(0.27) }, {
        order: ['kicker', 'headline', 'intro'], kickerStyle: 'pill', pillRadius: 0, headLines: 3, fill: false,
      }).draw();
      const hasBox = hasContactRow(R);
      E.plan(R, { x: pad, y: at(0.52), w: W - pad * 2, h: (hasBox ? at(0.79) : bottom) - at(0.52) }, {
        order: ['benefits', 'positions'], benefitCols: 2, positionCols: 2, iconStyle: 'block', iconMul: 0.8, boxStyle: 'outline', boxRadius: 0,
      }).draw();
      if (hasBox) {
        hazard(ctx, 0, at(0.805), W, 20, th.accent, '#000000');
        contactBox(R, { x: pad, y: at(0.84), w: W - pad * 2, h: bottom - at(0.84) }, { fill: '#FFFFFF', line: th.accent, lw: 10, text: INK, iconBg: th.accent, iconFg: U.onColor(th.accent) });
      }
      E.badge(R, W - 150, barH + 120, 96, { rotate: 0.14 });
    },
  });

  // ------------------------------------------------------------ Banda desenhada
  function halftone(ctx, x, y, w, h, color) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = color;
    for (let yy = y; yy < y + h + 16; yy += 16) {
      for (let xx = x + ((yy - y) / 16 % 2) * 8; xx < x + w + 16; xx += 16) {
        ctx.beginPath(); ctx.arc(xx, yy, 1.5 + 4 * ((xx - x) / w), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  define({
    id: 'bd',
    name: 'Banda Desenhada',
    description: 'Vinhetas de banda desenhada com contornos grossos e balão de fala.',
    icon: 'sparkles',
    trade: 'servente',
    defaults: { primary: '#111111', accent: '#3DDCFF', bg: '#FFFFFF', text: '#111111', fonts: 'impact', upper: true },
    theme(R, t) {
      return {
        ...t, headline: '#FFFFFF', kicker: t.accent, kickerBg: t.accent, kickerFg: U.onColor(t.accent), brand: INK, brandTag: INK, bar: t.accent,
        iconLine: INK, iconShadow: INK, iconBg: t.accent, iconFg: U.onColor(t.accent),
        boxBg: t.bg, boxLine: INK, boxTitle: INK, boxText: INK, bullet: INK,
        badgeBg: '#FFFFFF', badgeFg: INK,
      };
    },
    render(R) {
      const { ctx, W, H, theme: th } = R;
      const { top, bottom, at } = frame(R, R.fmt.id === 'square' ? 24 : 30);
      const m = 28, gap = 14, lw = 9;
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
      const panel = (x, y, w, h, fill) => {
        ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
        return () => { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); };
      };
      const hasBox = hasContactRow(R);
      const y1 = top, y2 = at(0.3), y3 = at(0.47), y4 = hasBox ? at(0.84) : bottom;
      const leftW = (W - 2 * m - gap) * 0.6;
      E.photo(R, { x: m, y: y1, w: leftW, h: y2 - y1 });
      const strokes = [() => { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.strokeRect(m + lw / 2, y1 + lw / 2, leftW - lw, y2 - y1 - lw); }];
      const rx = m + leftW + gap, rw = W - m - rx;
      strokes.push(panel(rx, y1, rw, y2 - y1, th.accent));
      halftone(ctx, rx, y1, rw, y2 - y1, 'rgba(0,0,0,0.18)');
      strokes.push(panel(m, y2 + gap, W - 2 * m, y3 - y2 - gap, INK));
      strokes.push(panel(m, y3 + gap, W - 2 * m, y4 - y3 - gap, '#FFFFFF'));
      if (hasBox) strokes.push(panel(m, y4 + gap, W - 2 * m, bottom - y4 - gap, th.accent));
      strokes.forEach((s) => s());
      logoOverPhoto(R, m + 24, y1 + 24, leftW * 0.6, true);
      const ip = 34;
      E.plan(R, { x: m + ip, y: y2 + gap + ip * 0.7, w: W - 2 * (m + ip), h: y3 - y2 - gap - ip * 1.4 }, {
        order: ['kicker', 'headline'], kickerStyle: 'pill', pillRadius: 0, headLines: 3, align: 'center',
      }).draw();
      E.plan(R, { x: m + ip, y: y3 + gap + ip * 0.7, w: W - 2 * (m + ip), h: y4 - y3 - gap - ip * 1.4 }, {
        order: ['intro', 'benefits', 'positions'], benefitCols: 2, positionCols: 2, iconStyle: 'block', iconColors: COMIC, iconMul: 0.86, boxStyle: 'outline', boxRadius: 0,
      }).draw();
      if (hasBox) {
        E.contactsRow(R, { x: m + ip, y: y4 + gap + 20, w: W - 2 * (m + ip), h: bottom - y4 - gap - 40 }, {
          color: INK, iconBg: INK, iconFg: th.accent, sizeMul: 2.1,
        });
      }
      if (showBadge(R)) {
        const r = Math.min(rw, y2 - y1) * 0.4, cx = rx + rw / 2, cy = y1 + (y2 - y1) / 2;
        fillPoly(ctx, [[cx - r * 0.6, cy + r * 0.6], [cx - r * 1.25, cy + r * 1.25], [cx - r * 0.1, cy + r * 0.9]], INK);
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
        E.badge(R, cx, cy, r, { rotate: 0 });
      }
    },
  });

  // ------------------------------------------------------------ Panfletos
  // Brush-stroke band behind the headline: jagged ends, fixed shape.
  function brush(ctx, x, y, w, h, color) {
    const n = 6, j = h / n;
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([x + (i % 2 ? 18 : 0), y + i * j]);
    for (let i = n; i >= 0; i--) pts.push([x + w - (i % 2 ? 0 : 22), y + i * j]);
    fillPoly(ctx, pts, color);
  }

  function flyerBack(R, back) {
    const { ctx, W, H, theme: th } = R;
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    if (back === 'radial') {
      const g = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, H * 0.8);
      g.addColorStop(0, U.mix(th.bg, '#FFFFFF', 0.82)); g.addColorStop(1, U.rgba(th.bg, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (back === 'grid') {
      ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 2;
      for (let x = 0; x < W; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.fillStyle = th.accent; ctx.fillRect(0, 0, W, 22);
    } else if (back === 'hazard') {
      hazard(ctx, 0, 0, W, 26, th.accent, INK);
    }
  }

  const FLYERS = [
    { id: 'panfleto-azul', name: 'Panfleto Azul', icon: 'users', trade: 'obras', back: 'radial',
      defaults: { primary: '#0B1F4D', accent: '#38D3FF', bg: '#0B1F4D', text: '#FFFFFF', fonts: 'impact', upper: true } },
    { id: 'panfleto-laranja', name: 'Panfleto Laranja', icon: 'construction', trade: 'maquinas', back: 'hazard',
      defaults: { primary: '#1B1B1D', accent: '#FF7A1A', bg: '#1B1B1D', text: '#FFFFFF', fonts: 'impact', upper: true } },
    { id: 'panfleto-suica', name: 'Panfleto Suíça', icon: 'hammer', trade: 'cofragem', back: 'grid',
      defaults: { primary: '#D52B1E', accent: '#D52B1E', bg: '#FFFFFF', text: '#111111', fonts: 'impact', upper: true } },
    { id: 'panfleto-verde', name: 'Panfleto Verde', icon: 'shovel', trade: 'servente', back: 'radial',
      defaults: { primary: '#14532D', accent: '#A3E635', bg: '#14532D', text: '#FFFFFF', fonts: 'impact', upper: true } },
  ];

  FLYERS.forEach((v) => define({
    id: v.id,
    name: v.name,
    description: 'Panfleto cheio: título em pincelada, muitos pontos com ícones e o WhatsApp em grande.',
    icon: v.icon,
    trade: v.trade,
    defaults: v.defaults,
    theme(R, t) {
      const a = t.accent, ink = U.onColor(a), light = U.onColor(t.bg) !== '#FFFFFF';
      const text = U.ensureContrast(t.text, t.bg, 4.5);
      return {
        ...t, text, headline: ink, kicker: ink, kickerBg: ink, kickerFg: a, bar: a,
        brand: light ? INK : '#FFFFFF', brandTag: light ? U.ensureContrast(a, t.bg, 3) : a,
        iconBg: a, iconFg: ink, iconLine: light ? INK : '#FFFFFF', iconShadow: light ? INK : '#000000',
        boxBg: t.bg, boxLine: light ? INK : a, boxTitle: U.ensureContrast(a, t.bg, 3), boxText: text, bullet: U.ensureContrast(a, t.bg, 3),
        badgeBg: a, badgeFg: ink,
      };
    },
    render(R) {
      const { ctx, W, theme: th } = R;
      const { top, bottom, at } = frame(R, R.fmt.id === 'square' ? 40 : 48);
      const pad = 48, ink = U.onColor(th.accent);
      flyerBack(R, v.back);
      E.plan(R, { x: pad, y: top, w: W * 0.6, h: at(0.1) }, { order: ['logo'], fill: false }).draw();
      const p = E.plan(R, { x: 0, y: 0, w: W - 2 * pad - 80, h: at(0.24) - at(0.1) }, {
        order: ['kicker', 'headline'], fill: false, report: false, headLines: 3, align: 'center',
      });
      const bandY = at(0.12), bandH = p.height + 52;
      brush(ctx, pad - 10, bandY, W - 2 * pad + 20, bandH, th.accent);
      p.draw(pad + 40, bandY + 26, p.height);
      const hasBox = hasContactRow(R), hasBand = !!showBadge(R);
      const boxY = hasBand ? at(0.84) : at(0.79);
      const midTop = bandY + bandH + 30, midBottom = (hasBand ? at(0.75) : hasBox ? boxY - 24 : bottom);
      const phW = W * 0.36, phH = Math.min(midBottom - midTop, phW * 1.3), phX = W - pad - phW;
      ctx.fillStyle = th.iconShadow; E.roundRect(ctx, phX + 12, midTop + 12, phW, phH, 28); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; E.roundRect(ctx, phX, midTop, phW, phH, 28); ctx.fill();
      E.photo(R, { x: phX + 10, y: midTop + 10, w: phW - 20, h: phH - 20 }, (c) => E.roundRect(c, phX + 10, midTop + 10, phW - 20, phH - 20, 20));
      E.plan(R, { x: pad, y: midTop, w: phX - pad - 30, h: midBottom - midTop }, {
        order: ['intro', 'benefits', 'positions'], iconStyle: 'solid', iconColors: TILES, iconMul: 0.86, boxStyle: 'outline', boxRadius: 14,
      }).draw();
      if (hasBand) badgeBand(R, pad, at(0.765), W - 2 * pad, at(0.825) - at(0.765), th.accent, ink);
      if (hasBox) {
        const h = bottom - boxY;
        ctx.fillStyle = th.iconShadow; E.roundRect(ctx, pad + 10, boxY + 10, W - 2 * pad, h, 30); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; E.roundRect(ctx, pad, boxY, W - 2 * pad, h, 30); ctx.fill();
        ctx.lineWidth = 8; ctx.strokeStyle = th.accent; E.roundRect(ctx, pad + 4, boxY + 4, W - 2 * pad - 8, h - 8, 26); ctx.stroke();
        E.contactsRow(R, { x: pad + 30, y: boxY + 16, w: W - 2 * pad - 60, h: h - 32 }, { color: INK, iconBg: '#25D366', iconFg: '#FFFFFF', sizeMul: 2.1 });
      }
    },
  }));
})();
