// Fixed-layout posters: the canvas designs drawn at their own coordinates in a
// 1080×1350 space and scaled into the square and story formats. Text follows
// the CSS box model (line boxes, letter-spacing, hard shadows, outlines) so the
// posters look like the HTML designs they come from.
window.RS = window.RS || {};

RS.posterKit = (() => {
  const E = RS.engine;
  const DW = 1080, DH = 1350;
  const mctx = document.createElement('canvas').getContext('2d');

  // ---------------------------------------------------------------- stage
  // back(S, ext) paints the background over the whole visible area `ext` (wider
  // in square, taller in story); body(S, ext) draws the design. S is R seen in
  // design units: hits, the photo and its report are mapped back to the format.
  function stage(R, back, body) {
    const k = Math.min(R.W / DW, R.H / DH);
    const ox = (R.W - DW * k) / 2, oy = (R.H - DH * k) / 2;
    const map = (c) => c.transform(k, 0, 0, k, ox, oy);
    const S = Object.create(R);
    Object.assign(S, {
      W: DW, H: DH, fmtMul: 1, photoInfo: null,
      hit: (key, x, y, w, h, clip) => R.hit(key, ox + x * k, oy + y * k, w * k, h * k,
        clip && ((c) => { c.save(); map(c); clip(c); c.restore(); })),
    });
    const ext = { x0: -ox / k, y0: -oy / k, x1: DW + ox / k, y1: DH + oy / k };
    const ctx = R.ctx, upscale = R.report.photoUpscale;
    R.report.photoUpscale = 0;
    ctx.save();
    map(ctx);
    try { back(S, ext); body(S, ext); } finally { ctx.restore(); }
    R.report.photoUpscale = Math.max(upscale, R.report.photoUpscale * k);
    const p = S.photoInfo;
    if (p) R.photoInfo = { rect: { x: ox + p.rect.x * k, y: oy + p.rect.y * k, w: p.rect.w * k, h: p.rect.h * k }, dw: p.dw * k, dh: p.dh * k };
  }

  // ---------------------------------------------------------------- text
  const FAMILY = {
    anton: 'Anton', barlow: 'Barlow Condensed', stencil: 'Big Shoulders Stencil Display',
    archivo: 'Archivo Black', bangers: 'Bangers', marker: 'Permanent Marker',
  };
  // f: { fam, size, weight, ls (px), lh (× size; none = the font's own), italic }
  const css = (f) => `${f.italic ? 'italic ' : ''}${f.weight || 400} ${f.size}px "${FAMILY[f.fam] || f.fam}", "Arial Narrow", Arial, sans-serif`;
  function font(ctx, f) {
    ctx.font = css(f);
    ctx.letterSpacing = `${f.ls || 0}px`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  const sized = (f, k) => (k === 1 ? f : { ...f, size: f.size * k, ls: (f.ls || 0) * k });

  // Ascent and descent of the font (per px of size), as CSS uses for line boxes.
  const VM = new Map();
  function vmetrics(f) {
    const key = `${f.fam}|${f.weight || 400}|${f.italic ? 1 : 0}`;
    const known = VM.get(key);
    if (known) return known;
    const ref = { ...f, size: 100, ls: 0 };
    font(mctx, ref);
    const m = mctx.measureText('Hg');
    const v = m.fontBoundingBoxAscent ? { a: m.fontBoundingBoxAscent / 100, d: m.fontBoundingBoxDescent / 100 } : { a: 0.95, d: 0.25 };
    if (document.fonts && document.fonts.check(css(ref))) VM.set(key, v);
    return v;
  }
  function lineH(f) {
    if (f.lh) return f.lh * f.size;
    const v = vmetrics(f);
    return (v.a + v.d) * f.size;
  }
  function baseline(f) {
    const v = vmetrics(f);
    return (lineH(f) - (v.a + v.d) * f.size) / 2 + v.a * f.size;
  }
  function width(ctx, s, f) {
    font(ctx, f);
    return ctx.measureText(s).width;
  }

  // One line of text in a CSS line box starting at `top`. x is the left edge,
  // the centre or the right edge (o.align). o: { color, align, shadow: [dx, dy,
  // color], stroke: [width, color], under (stroke below the fill), hollow }.
  function text(ctx, s, x, top, f, o = {}) {
    font(ctx, f);
    const w = ctx.measureText(s).width;
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const y = top + baseline(f);
    const stroke = (dx, dy, color) => {
      ctx.lineWidth = o.stroke[0];
      ctx.strokeStyle = color;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 3;
      ctx.strokeText(s, left + dx, y + dy);
    };
    const fill = (dx, dy, color) => { ctx.fillStyle = color; ctx.fillText(s, left + dx, y + dy); };
    if (o.shadow) {
      const [dx, dy, c] = o.shadow;
      if (o.stroke) stroke(dx, dy, c);
      if (!o.hollow) fill(dx, dy, c);
    }
    if (o.stroke && (o.under || o.hollow)) stroke(0, 0, o.stroke[1]);
    if (!o.hollow) fill(0, 0, o.color);
    if (o.stroke && !o.under && !o.hollow) stroke(0, 0, o.stroke[1]);
    return { x: left, y: top, w, h: lineH(f) };
  }

  // Greedy word wrap that keeps the line breaks typed by the person.
  function wrap(ctx, s, f, maxW) {
    font(ctx, f);
    return String(s).split('\n').flatMap((para) => para.split(/\s+/).filter(Boolean).reduce((lines, word) => {
      const last = lines[lines.length - 1];
      const next = last ? `${last} ${word}` : word;
      return last && ctx.measureText(next).width > maxW ? [...lines, word] : [...lines.slice(0, -1), next];
    }, ['']));
  }

  // Shrinks f until `s` fits maxLines lines of maxW. Returns { f, lines, k }.
  function fit(ctx, s, f, maxW, maxLines = 1) {
    if (maxLines === 1) {
      const one = String(s).replace(/\s*\n\s*/g, ' ');
      const w = width(ctx, one, f);
      const k = w > maxW ? maxW / w : 1;
      return { f: sized(f, k), lines: [one], k };
    }
    for (let k = 1; ; k *= 0.95) {
      const g = sized(f, k);
      const lines = wrap(ctx, s, g, maxW);
      const wide = Math.max(0, ...lines.map((l) => width(ctx, l, g)));
      if ((lines.length <= maxLines && wide <= maxW + 0.5) || k < 0.42) return { f: g, lines, k };
    }
  }

  // Text the person typed: shrunk to fit, and reported when it had to shrink.
  function fitted(S, s, f, maxW, maxLines = 1) {
    const out = fit(S.ctx, s, f, maxW, maxLines);
    if (out.k < 0.97) S.noteScale(out.k);
    return out;
  }

  // Lines stacked in CSS line boxes. Returns the height used.
  function block(ctx, lines, x, top, f, o = {}) {
    const lh = lineH(f);
    lines.forEach((l, i) => text(ctx, l, x, top + i * lh, f, o));
    return lines.length * lh;
  }

  const up = (R, s) => (R.style.upper === false ? String(s || '') : String(s || '').toLocaleUpperCase(R.locale));

  // ---------------------------------------------------------------- icons
  // The canvas icon set (24-unit view box, round caps and joins).
  const ICON_D = {
    banknote: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M14.5 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0z',
    house: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
    filecheck: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15l2 2 4-4',
    filetext: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    hardhat: 'M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M4 15v-3a6 6 0 0 1 6-6 M14 6a6 6 0 0 1 6 6v3',
    calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18',
    coins: 'M14 8a6 6 0 1 1-12 0a6 6 0 1 1 12 0z M18.09 10.37A6 6 0 1 1 10.34 18 M7 6h1v4 M16.71 13.88l.7.71-2.82 2.82',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    chat: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    crane: 'M7 22V3 M3 6h18 M7 3 3 6 M7 3l11 3 M17 6v7 M15 13h4v2.5a2 2 0 0 1-4 0 M4 22h6',
  };
  // App icon names that have a canvas version.
  const ALIAS = {
    'file-text': 'filetext', 'clipboard-check': 'filecheck', 'file-check': 'filecheck', 'hard-hat': 'hardhat',
    'message-circle': 'chat', home: 'house', 'calendar-days': 'calendar', construction: 'crane',
  };
  const PATHS = new Map();
  // Icon in the size×size square at (x, y); other app icons come from the engine.
  function icon(ctx, name, x, y, size, color, stroke = 2.6) {
    const key = ALIAS[name] || name;
    if (!ICON_D[key]) {
      E.drawIcon(ctx, name || 'check', x + size / 2, y + size / 2, size, color, stroke);
      return;
    }
    if (!PATHS.has(key)) PATHS.set(key, new Path2D(ICON_D[key]));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.stroke(PATHS.get(key));
    ctx.restore();
  }

  // ---------------------------------------------------------------- shapes
  const shrinkR = (r, d) => (Array.isArray(r) ? r.map((v) => Math.max(0, v - d)) : Math.max(0, r - d));
  // Rounded-rectangle path; r is a number or [tl, tr, br, bl].
  function rr(ctx, x, y, w, h, r = 0) {
    ctx.beginPath();
    if (r && ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  // A CSS box (border-box size): o { fill, border, bw, r, shadow: [dx, dy, color] }.
  // Returns the padding box.
  function box(ctx, x, y, w, h, o = {}) {
    const bw = o.bw || 0, r = o.r || 0;
    const inner = { x: x + bw, y: y + bw, w: w - 2 * bw, h: h - 2 * bw };
    if (o.shadow) { rr(ctx, x + o.shadow[0], y + o.shadow[1], w, h, r); ctx.fillStyle = o.shadow[2]; ctx.fill(); }
    if (bw && o.fill) {
      rr(ctx, x, y, w, h, r); ctx.fillStyle = o.border; ctx.fill();
    } else if (bw) {
      rr(ctx, x, y, w, h, r);
      if (ctx.roundRect && r) ctx.roundRect(inner.x, inner.y, inner.w, inner.h, shrinkR(r, bw)); else ctx.rect(inner.x, inner.y, inner.w, inner.h);
      ctx.fillStyle = o.border; ctx.fill('evenodd');
    }
    if (o.fill) { rr(ctx, inner.x, inner.y, inner.w, inner.h, shrinkR(r, bw)); ctx.fillStyle = o.fill; ctx.fill(); }
    return inner;
  }
  // Text in a CSS box: o { fill, border, bw, padX, padY, r, shadow, color, textShadow }.
  function chipSize(ctx, s, f, o = {}) {
    const edge = (o.padX || 0) + (o.bw || 0);
    return { w: width(ctx, s, f) + 2 * edge, h: lineH(f) + 2 * ((o.padY || 0) + (o.bw || 0)) };
  }
  function chip(ctx, s, x, y, f, o = {}) {
    const { w, h } = chipSize(ctx, s, f, o);
    const bw = o.bw || 0;
    box(ctx, x, y, w, h, { fill: o.fill, border: o.border, bw, r: o.r, shadow: o.shadow });
    text(ctx, s, x + bw + (o.padX || 0), y + bw + (o.padY || 0), f, { color: o.color, shadow: o.textShadow });
    return { x, y, w, h };
  }
  function circle(ctx, cx, cy, r, color) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  // Runs draw() turned by `deg` about the centre of the box.
  function turned(ctx, b, deg, draw) {
    if (!deg) return draw();
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(-b.x - b.w / 2, -b.y - b.h / 2);
    try { return draw(); } finally { ctx.restore(); }
  }

  // Green WhatsApp disc, d wide: o { ring, bw, icon, stroke }.
  function wa(ctx, x, y, d, o = {}) {
    const bw = o.bw != null ? o.bw : Math.max(4, Math.round(d / 17));
    const ic = o.icon || Math.round(d * 0.52);
    circle(ctx, x + d / 2, y + d / 2, d / 2, o.ring || '#FFFFFF');
    circle(ctx, x + d / 2, y + d / 2, d / 2 - bw, '#25D366');
    icon(ctx, 'chat', x + (d - ic) / 2, y + (d - ic) / 2, ic, '#FFFFFF', o.stroke || 2.6);
  }

  // Swiss flag with a 3 px white border; s is the red square. Returns its size.
  function flag(ctx, x, y, s) {
    const bar = Math.round(s * 0.22), len = Math.round(s * 0.62);
    const a = Math.round((s - bar) / 2), b = Math.round((s - len) / 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, s + 6, s + 6);
    ctx.fillStyle = '#D52B1E'; ctx.fillRect(x + 3, y + 3, s, s);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 3 + a, y + 3 + b, bar, len);
    ctx.fillRect(x + 3 + b, y + 3 + a, len, bar);
    return s + 6;
  }

  // Rough brush-stroke shape (percent of the box).
  const BRUSH = [[0, 12], [3, 0], [9, 8], [15, 2], [24, 6], [33, 0], [45, 5], [56, 1], [68, 7], [79, 0], [90, 6], [97, 1], [100, 14], [98, 40], [100, 70], [97, 100], [88, 92], [77, 100], [65, 94], [52, 100], [40, 93], [28, 100], [17, 94], [7, 100], [1, 88], [2, 55]];
  function brush(ctx, b, color) {
    ctx.beginPath();
    BRUSH.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](b.x + (b.w * px) / 100, b.y + (b.h * py) / 100));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // repeating-linear-gradient(-45deg, a 0 n, b n 2n) over the box.
  function hazard(ctx, x, y, w, h, a, b, n) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
    const step = n * Math.SQRT2;
    ctx.beginPath();
    // colour b where x + y (local) lies in [u - step, u]
    for (let u = w + h - step; u > 0; u -= 2 * step) {
      ctx.moveTo(x + u - step, y); ctx.lineTo(x + u, y); ctx.lineTo(x + u - h, y + h); ctx.lineTo(x + u - step - h, y + h); ctx.closePath();
    }
    ctx.fillStyle = b;
    ctx.fill();
    ctx.restore();
  }

  // Flyer bullet: round icon over the left end of a rounded bar.
  // o: { h, barH, fs, circle, iconColor, bar, color, ring, halo: [w, color], barBorder: [w, color] }
  function pill(S, x, y, w, label, ic, o) {
    const ctx = S.ctx, h = o.h, bh = o.barH, r = bh / 2;
    const bx = x + h / 2, by = y + (h - bh) / 2, bw = w - h / 2;
    if (o.barBorder) {
      const [t, c] = o.barBorder;
      rr(ctx, bx, by, bw, bh, [0, r, r, 0]); ctx.fillStyle = c; ctx.fill();
      rr(ctx, bx, by + t, bw - t, bh - 2 * t, [0, r - t, r - t, 0]);
    } else {
      rr(ctx, bx, by, bw, bh, [0, r, r, 0]);
    }
    ctx.fillStyle = o.bar || '#FFFFFF'; ctx.fill();
    const tx = bx + h / 2 + 16, maxW = bw - (h / 2 + 16) - 14;
    const f = { fam: 'barlow', weight: 900, size: o.fs, ls: 0.5, lh: 1 };
    const t = fitted(S, label, f, maxW);
    text(ctx, t.lines[0], tx, by + (bh - lineH(t.f)) / 2, t.f, { color: o.color || '#000000' });
    if (o.halo) circle(ctx, x + h / 2, y + h / 2, h / 2 + o.halo[0], o.halo[1]);
    circle(ctx, x + h / 2, y + h / 2, h / 2, o.ring || '#FFFFFF');
    circle(ctx, x + h / 2, y + h / 2, h / 2 - 5, o.circle);
    const is = Math.round(h * 0.5);
    icon(ctx, ic, x + (h - is) / 2, y + (h - is) / 2, is, o.iconColor || '#FFFFFF');
  }

  // Photo cover-fitted into the box: o { filter (CSS), r (rounded corners) }.
  function photo(S, b, o = {}) {
    const ctx = S.ctx;
    ctx.save();
    if (o.filter) ctx.filter = o.filter;
    E.photo(S, b, o.r ? (c) => rr(c, b.x, b.y, b.w, b.h, o.r) : undefined);
    ctx.restore();
  }

  // The logo image fitted to height h (and maxW). Returns its width, 0 without one.
  function logo(S, x, y, h, maxW, bg) {
    const img = S.show.logo && S.images.logo;
    if (!img) return 0;
    const ar = img.width / img.height;
    const lw = Math.min(h * ar, maxW), lh = lw / ar;
    S.ctx.drawImage(E.logoSource(img, bg, S.style.logoTone), x, y + (h - lh) / 2, lw, lh);
    S.hit('logo', x, y, lw, h);
    return lw;
  }

  // ---------------------------------------------------------------- content
  // Fixed words of the designs, per language.
  const LABELS = {
    pt: { callNow: 'LIGA JÁ OU WHATSAPP', callOr: 'LIGA OU WHATSAPP', callSend: 'LIGA OU MANDA WHATSAPP', swiss: 'SUÍÇA', reply: 'RESPONDEMOS A TODOS', callBoth: 'LIGA JÁ! WHATSAPP OU CHAMADA', waOnly: 'SÓ WHATSAPP', cv: 'ENVIE O SEU CURRÍCULO OU CV PELO WHATSAPP', ask: ['TEM', 'EXPERIÊNCIA?', 'LIGUE', 'JÁ!'] },
    de: { callNow: 'JETZT ANRUFEN ODER WHATSAPP', callOr: 'ANRUF ODER WHATSAPP', callSend: 'ANRUFEN ODER WHATSAPP', swiss: 'SCHWEIZ', reply: 'WIR ANTWORTEN ALLEN', callBoth: 'JETZT MELDEN! WHATSAPP ODER ANRUF', waOnly: 'NUR WHATSAPP', cv: 'SCHICKEN SIE IHREN LEBENSLAUF PER WHATSAPP', ask: ['MIT', 'ERFAHRUNG?', 'JETZT', 'ANRUFEN!'] },
    fr: { callNow: 'APPELEZ OU WHATSAPP', callOr: 'APPEL OU WHATSAPP', callSend: 'APPELEZ OU ÉCRIVEZ SUR WHATSAPP', swiss: 'SUISSE', reply: 'NOUS RÉPONDONS À TOUS', callBoth: 'APPELEZ ! WHATSAPP OU APPEL', waOnly: 'WHATSAPP UNIQUEMENT', cv: 'ENVOYEZ VOTRE CV PAR WHATSAPP', ask: ['DE', "L'EXPÉRIENCE ?", 'APPELEZ', 'VITE !'] },
    it: { callNow: 'CHIAMA O WHATSAPP', callOr: 'CHIAMATA O WHATSAPP', callSend: 'CHIAMA O SCRIVI SU WHATSAPP', swiss: 'SVIZZERA', reply: 'RISPONDIAMO A TUTTI', callBoth: 'CHIAMA! WHATSAPP O CHIAMATA', waOnly: 'SOLO WHATSAPP', cv: 'INVIA IL TUO CURRICULUM SU WHATSAPP', ask: ['HAI', 'ESPERIENZA?', 'CHIAMA', 'SUBITO!'] },
    en: { callNow: 'CALL NOW OR WHATSAPP', callOr: 'CALL OR WHATSAPP', callSend: 'CALL OR SEND A WHATSAPP', swiss: 'SWITZERLAND', reply: 'WE REPLY TO EVERYONE', callBoth: 'CALL NOW! WHATSAPP OR PHONE', waOnly: 'WHATSAPP ONLY', cv: 'SEND YOUR CV BY WHATSAPP', ask: ['GOT', 'EXPERIENCE?', 'CALL', 'NOW!'] },
    es: { callNow: 'LLAMA YA O WHATSAPP', callOr: 'LLAMA O WHATSAPP', callSend: 'LLAMA O ESCRIBE POR WHATSAPP', swiss: 'SUIZA', reply: 'RESPONDEMOS A TODOS', callBoth: '¡LLAMA YA! WHATSAPP O LLAMADA', waOnly: 'SOLO WHATSAPP', cv: 'ENVÍA TU CURRÍCULUM POR WHATSAPP', ask: ['¿TIENES', 'EXPERIENCIA?', '¡LLAMA', 'YA!'] },
  };
  const labels = (R) => LABELS[String(R.locale || 'pt').slice(0, 2)] || LABELS.pt;

  // The number shown in big: the first contact, else the WhatsApp number.
  function phone(R) {
    if (!R.show.contacts) return '';
    const c = (R.t.contacts || []).find((x) => x.text.trim());
    if (c) return c.text.trim();
    const w = R.project.whatsapp;
    return w && w.number && RS.contact ? RS.contact.display(w.country, w.number) : '';
  }
  // Two headline lines: as typed, else the first word and the rest.
  function headLines(R) {
    const s = up(R, R.t.headline).trim();
    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) return [lines[0], lines.slice(1).join(' ')];
    const words = s.split(/\s+/).filter(Boolean);
    return words.length > 1 ? [words[0], words.slice(1).join(' ')] : [s, ''];
  }
  const benefits = (R) => (R.show.benefits ? (R.t.benefits || []).filter((b) => b.text.trim()).slice(0, 6) : []);
  const positions = (R) => (R.show.positions ? (R.t.positions || []).filter((p) => p.text.trim()) : []);
  const kicker = (R) => (R.show.kicker ? up(R, R.t.kicker).trim() : '');
  const badge = (R) => (R.show.badge ? up(R, R.t.badge).trim() : '');
  const brandName = (R) => (R.show.logo ? up(R, R.brand.name).trim() : '');

  // The words of the canvas designs, for a new ad made from one of them.
  const BRAND = { name: 'Igor Ferreira' };
  const PHONE = '+41 78 756 02 00';
  const PERKS = [
    ['banknote', 'Bons salários'],
    ['house', 'Organizamos alojamento'],
    ['clipboard-check', 'Contrato de trabalho'],
    ['calendar', 'Pagamento semanal ou mensal'],
    ['hard-hat', 'Com experiência'],
    ['coins', '35 CHF a 45 CHF por hora'],
  ];
  function sample(o) {
    const uid = RS.util.uid;
    return {
      kicker: o.kicker || '',
      headline: o.headline,
      intro: o.intro || '',
      benefits: PERKS.map(([icon, text], i) => ({ id: uid(), key: `bold:${i}`, icon, text })),
      positionsTitle: 'Procuramos:',
      positions: (o.positions || []).map((text) => ({ id: uid(), text })),
      contacts: [{ id: uid(), icon: o.contactIcon || 'message-circle', text: PHONE }],
      badge: o.badge || '',
    };
  }

  // ---------------------------------------------------------------- parts
  function fillRect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  const area = (ext) => [ext.x0, ext.y0, ext.x1 - ext.x0, ext.y1 - ext.y0];

  // An element with its entrance; its hit area is there even before it shows.
  function part(S, key, slot, delay, fx, b, draw) {
    if (key) S.hit(key, b.x, b.y, b.w, b.h);
    return E.enter(S, slot, delay, fx, b, draw);
  }
  const headLine = (S, i, b, draw) => E.enter(S, E.TL.headline, i * E.TL.line, 'reveal', b, draw);

  // The company at (x, y), h tall: the logo image (over back(width) when given),
  // else its name drawn by drawName(name), which returns the box it used.
  function company(S, x, y, h, bg, drawName, back) {
    if (!S.show.logo) return;
    E.enter(S, E.TL.logo, 0, 'fade', { x, y, w: 420, h }, () => {
      const img = S.images.logo;
      if (img) {
        if (back) back(Math.min(h * (img.width / img.height), 420));
        logo(S, x, y, h, 420, bg);
        return;
      }
      const name = brandName(S);
      if (!name) return;
      const r = drawName(name);
      S.hit('logo', r.x, r.y, r.w, r.h);
    });
  }

  // The key of the contact shown in big (the first one with text).
  function phoneKey(S) {
    const c = (S.t.contacts || []).find((x) => x.text.trim());
    return c ? `contact:${c.id}` : 'contact:wa';
  }

  // The phone number in big, with its pulse at the end of the video.
  function bigPhone(S, s, x, top, f, o) {
    const w = width(S.ctx, s, f);
    const left = o.align === 'center' ? x - w / 2 : x;
    E.pulse(S, { x: left, y: top, w, h: lineH(f) }, () => text(S.ctx, s, x, top, f, o));
  }

  // Top of each row of a list whose rows are `heights` tall with `gap` between.
  const stack = (top, heights, gap) => heights.map((_, i) => top + heights.slice(0, i).reduce((s, h) => s + h + gap, 0));

  return {
    DW, DH, stage, font, sized, lineH, baseline, width, text, wrap, fit, fitted, block, up, icon,
    rr, box, chipSize, chip, circle, turned, wa, flag, brush, hazard, pill, photo, logo,
    labels, phone, headLines, benefits, positions, kicker, badge, brandName,
    BRAND, PHONE, PERKS, sample, fillRect, area, part, headLine, company, phoneKey, bigPhone, stack,
  };
})();
