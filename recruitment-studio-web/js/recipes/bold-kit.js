// Shared pieces of the bold recipes (Metade, Stencil, Contraste, BD and the
// Panfletos): thick black outlines, hard shadows (never blurred), flat colour
// blocks, icon tiles, the hazard tape and the big phone box. Every recipe
// starts from the ad's photos; without one (tests) a plain tile stands in.
// Motion is hard: things are stamped (big → their size, a short shake) or
// slid in on expoOut; a text counts as shown once its piece has landed.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, lerp, rrect, clamp } = K;
  const INK = '#111111';
  const TILES = ['#E63946', '#1D4ED8', '#16A34A', '#F97316', '#7C3AED', '#0891B2'];
  const COMIC = ['#FF5A5F', '#FFFFFF', '#4ADE80', '#FFFFFF', '#FFB020', '#A78BFA'];
  const STAMP = 0.3;

  // ---------------------------------------------------------------- motion
  // A stamp at t0: 0 before, then its scale (from → 1 on expoOut; a pop below 1).
  const stamp = (lt, t0, d = STAMP, from = 1.7) => { const x = win(lt, t0, d); return x <= 0 ? 0 : lerp(from, 1, expoOut(x)); };
  // The jolt after a stamp lands at t (px), gone within 0.2 s.
  const shake = (lt, t, a = 12) => (lt < t ? 0 : a * Math.exp(-(lt - t) / 0.06) * Math.sin((lt - t) * 70));
  // A slide: 0 → 1 on expoOut from t0.
  const slide = (lt, t0, d = 0.35) => expoOut(win(lt, t0, d));
  // A pulse on the half-second beat (0..1, 1 on the beat).
  const pulse = (lt) => Math.exp(-((lt % 0.5) / 0.12));
  // Draws without recording its texts (and as moving) until settled.
  function quiet(R, settled, draw) {
    if (settled) { draw(); return; }
    const rr = R.rec, mv = R.moving;
    R.rec = () => {}; R.moving = true;
    try { draw(); } finally { R.rec = rr; R.moving = mv; }
  }
  // Scales the drawing about (cx, cy) by s (nothing at 0); settled at 1.
  function stamped(R, s, cx, cy, draw) {
    if (s <= 0) return;
    const { ctx } = R;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    quiet(R, s === 1, draw);
    ctx.restore();
  }

  // ---------------------------------------------------------------- blocks
  // A box with a hard offset shadow and a thick outline. o = { fill, line, lw, off, shadow, r }
  function hardBox(ctx, x, y, w, h, o = {}) {
    const r = o.r || 0, lw = o.lw != null ? o.lw : 8, off = o.off != null ? o.off : 14;
    const path = (dx) => { if (r) rrect(ctx, x + dx, y + dx, w, h, r); else { ctx.beginPath(); ctx.rect(x + dx, y + dx, w, h); } };
    if (off) { path(off); ctx.fillStyle = o.shadow || INK; ctx.fill(); }
    path(0);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = o.line || INK; ctx.lineJoin = 'miter'; ctx.stroke(); }
  }
  // Diagonal hazard stripes in a rectangle; phase moves them along (px).
  function hazard(ctx, x, y, w, h, a, b, phase = 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = a; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = b;
    const step = Math.max(h, 20) * 1.2, p = ((phase % (step * 2)) + step * 2) % (step * 2);
    for (let sx = x - h - step * 2 + p; sx < x + w + h; sx += step * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, y + h); ctx.lineTo(sx + h, y); ctx.lineTo(sx + h + step, y); ctx.lineTo(sx + step, y + h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Halftone dots over a rectangle (comic panels).
  function halftone(ctx, x, y, w, h, color, gap = 22) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = color;
    for (let yy = y, row = 0; yy < y + h + gap; yy += gap, row++) {
      for (let xx = x + (row % 2 ? gap / 2 : 0); xx < x + w + gap; xx += gap) {
        const r = gap * 0.18 * (0.4 + (0.6 * (yy - y)) / h);
        ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- photos
  // The video's photo i (they repeat when fewer).
  const photoOf = (P, i) => (P.photos.length ? P.photos[i % P.photos.length] : null);
  // A photo covering rect, zoomed by z about its focus; a plain tile without one.
  function photo(R, P, img, r, z = 1, gray = false) {
    const { ctx } = R;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    if (!img) { ctx.fillStyle = P.C.tile || '#3A3A3A'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore(); return; }
    if (gray) ctx.filter = 'grayscale(1) contrast(1.15)';
    const w = r.w * z, h = r.h * z;
    K.cover(ctx, img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h, P.focusOf(img));
    ctx.filter = 'none';
    ctx.restore();
  }
  // The photo filling the frame, slowly breathing with the video (loops).
  function photoFull(R, P, img, k = 0) {
    const { ctx } = R;
    if (!img) { ctx.fillStyle = P.C.tile || '#3A3A3A'; ctx.fillRect(0, 0, P.fmt.w, P.fmt.h); return; }
    ctx.save(); K.screenPhoto(ctx, img, P.fmt, R.t, P.timeline.duration, k, P.focusOf(img)); ctx.restore();
  }
  // A photo in a thick border with a hard shadow, turned by angle. o = { border, line, off, shadow, angle, z, gray, r }
  function framed(R, P, img, r, o = {}) {
    const { ctx } = R, b = o.border != null ? o.border : 12;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(o.angle || 0); ctx.translate(-r.x - r.w / 2, -r.y - r.h / 2);
    hardBox(ctx, r.x, r.y, r.w, r.h, { fill: o.line || INK, lw: 0, off: o.off != null ? o.off : 16, shadow: o.shadow || INK, r: o.r || 0 });
    const inner = { x: r.x + b, y: r.y + b, w: r.w - b * 2, h: r.h - b * 2 };
    if (o.r) { ctx.save(); rrect(ctx, inner.x, inner.y, inner.w, inner.h, Math.max(0, o.r - b)); ctx.clip(); photo(R, P, img, inner, o.z || 1, o.gray); ctx.restore(); }
    else photo(R, P, img, inner, o.z || 1, o.gray);
    ctx.restore();
  }

  // ---------------------------------------------------------------- tiles, boards
  // An icon on a square colour block with an outline (cx, cy its centre).
  function tile(ctx, cx, cy, s, icon, fill, o = {}) {
    hardBox(ctx, cx - s / 2, cy - s / 2, s, s, { fill, lw: o.lw != null ? o.lw : 6, off: o.off != null ? o.off : 8, shadow: o.shadow, line: o.line, r: o.r || 0 });
    E.drawIcon(ctx, icon || 'check', cx, cy, s * 0.58, o.ink || U.onColor(fill, INK), 2.6);
  }
  // A board: texts stacked in a box. parts [{ text, font, max, min, color, tag, lines, upper }]
  function board(P, w, parts, o = {}) {
    const pad = o.pad || 40, gap = o.gap || 16;
    let y = pad;
    const texts = parts.filter((p) => p.text).map((p) => {
      const min = p.min || 44;
      const L = K.fit(P, p.text, { font: p.font, upper: !!p.upper, maxSize: Math.max(min, p.max), minSize: min, maxW: w - pad * 2, maxLines: p.lines || 3, lh: p.lh || 1.04 });
      const t = { L, y, color: p.color, tag: p.tag, align: p.align || o.align || 'center' };
      y += L.vh + gap;
      return t;
    });
    return { w, h: y - gap + pad, pad, texts, box: o.box || {} };
  }
  // A board fitted to a height: its sizes shrink (k) until it fits.
  function boardFit(maxH, make) {
    for (let k = 1; ; k -= 0.08) { const B = make(k); if (B.h <= maxH || k <= 0.5) return B; }
  }
  function drawBoard(R, B, x, y, settled = true) {
    const { ctx } = R;
    hardBox(ctx, x, y, B.w, B.h, B.box);
    quiet(R, settled, () => {
      for (const t of B.texts) K.text(R, t.L, x + B.pad, y + t.y, t.color, t.align, B.w - B.pad * 2, t.tag);
    });
  }
  // Stacked boards (gap between) and their height.
  const stack = (boards, gap = 34) => { let y = 0; return boards.map((B) => { const r = { B, y }; y += B.h + gap; return r; }); };
  const stackH = (st) => st.reduce((a, r) => Math.max(a, r.y + r.B.h), 0);

  // ---------------------------------------------------------------- benefits
  // A benefit row: the icon tile and the words beside it. Rows per page fit the height.
  function bulletRows(P, items, o) {
    const c = P.content;
    const make = (k) => items.map((i) => {
      const L = K.fit(P, c.benefits[i], { font: o.font, upper: !!o.upper, maxSize: Math.max(44, o.max * k), minSize: 44, maxW: o.w - o.tile - 40 - (o.pad || 0) * 2, maxLines: 3, lh: 1.04 });
      return { i, L, icon: c.icons[i] || 'check', h: Math.max(o.tile, L.vh) + (o.pad || 0) * 2 };
    });
    for (let k = 1; ; k -= 0.08) {
      const rows = make(k), h = rows.reduce((a, r) => a + r.h, 0) + o.gap * Math.max(0, rows.length - 1);
      if (h <= o.maxH || k <= 0.5) return { rows, h };
    }
  }
  // A row at (x, y) of width w: o = { tile, pad, color(i), ink, box, k (0..1 in) }
  function bulletRow(R, row, x, y, w, o) {
    const { ctx } = R, k = o.k;
    if (k <= 0) return;
    const dx = (1 - k) * -(w + x + 40);
    ctx.save(); ctx.translate(dx, 0);
    if (o.box) hardBox(ctx, x, y, w, row.h, o.box);
    const pad = o.pad || 0;
    const ts = o.tile * (k < 1 ? 1 : stamp(o.lt, o.t1, 0.22) || 1);
    tile(ctx, x + pad + o.tile / 2, y + row.h / 2, ts, row.icon, o.color(row.i), o.tileStyle || {});
    quiet(R, k === 1, () => K.text(R, row.L, x + pad + o.tile + 32, y + (row.h - row.L.vh) / 2, o.ink, 'left', 0, 'vantagem'));
    ctx.restore();
  }

  // ---------------------------------------------------------------- the card
  // The contact card on a white panel; the number in a big box of its own
  // that pulses on the beat. o = { cx, top, maxW, maxH, font, bold, upper, qrMax, numberMax }
  function card(P, o) {
    const CL = K.cardLayout(P, { font: o.font, bold: o.bold, upper: o.upper, maxW: o.maxW, maxH: o.maxH, cx: o.cx, cy: 0, qrMax: o.qrMax, numberMax: o.numberMax });
    const pad = 46;
    const h = CL.h + pad * 2 + (CL.number ? 40 : 0);
    const top = o.bottom != null ? o.bottom - h : o.top;
    const cy = top + h / 2 + (CL.number ? 20 : 0);
    const L = K.cardLayout(P, { font: o.font, bold: o.bold, upper: o.upper, maxW: o.maxW, maxH: o.maxH, cx: o.cx, cy, qrMax: o.qrMax, numberMax: o.numberMax });
    return { L, x: o.cx - o.maxW / 2 - pad, y: top, w: o.maxW + pad * 2, h };
  }
  // c = { panel, line (its outline), box (behind the number: the ink must read on it), ink, shadow } colours; lt the act's time, t0 when the card lands
  function drawCard(R, P, CD, lt, t0, c) {
    const { ctx } = R, L = CD.L, C = P.C;
    const s = stamp(lt, t0);
    if (s <= 0) return;
    const j = shake(lt, t0 + STAMP);
    ctx.save(); ctx.translate(0, j);
    stamped(R, s, CD.x + CD.w / 2, CD.y + CD.h / 2, () => {
      hardBox(ctx, CD.x, CD.y, CD.w, CD.h, { fill: c.panel || '#FFFFFF', line: c.line, lw: 10, off: 18, shadow: c.shadow || INK });
    });
    if (s === 1 && L.number) {
      const bw = Math.min(CD.w - 40, L.number.w + 80), bh = L.number.vh + 60;
      const p = lt > t0 + 0.8 ? pulse(lt - t0) : 0;
      const bx = L.cx - bw / 2, by = L.numberY - 30;
      ctx.save(); ctx.translate(L.cx, by + bh / 2); ctx.scale(1 + 0.03 * p, 1 + 0.03 * p); ctx.translate(-L.cx, -(by + bh / 2));
      hardBox(ctx, bx, by, bw, bh, { fill: c.box, lw: 8, off: 10 + 6 * p, shadow: INK });
      ctx.restore();
    }
    if (s === 1) {
      K.cardDraw(R, L, lt, { ink: c.ink || INK, ctaFill: C.cta, ctaInk: C.ctaInk, hintInk: c.ink || INK, qrDark: INK, qrLight: '#FFFFFF', start: t0 + STAMP, step: 0.08 });
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the chat
  function chat(P, x, y, w, h) {
    return K.chatLayout(P, { x, y, w, h, font: P.F.bold, fontStrong: P.F.head, radius: (64 * w) / 800,
      colors: { screen: '#FFFFFF', head: INK, headInk: '#FFFFFF', field: '#EEF1F4', fieldInk: INK, bubble: P.C.cta, bubbleInk: P.C.ctaInk, send: P.C.cta, sendInk: P.C.ctaInk, frame: INK } });
  }
  // The phone slides up hard from below and plays its chat.
  function chatPhone(R, P, CH, lt) {
    const { ctx } = R, S = CH.S;
    const k = slide(lt, 0.05, 0.4);
    const dy = (1 - k) * (P.fmt.h - S.y + 40);
    ctx.save(); ctx.translate(0, dy);
    hardBox(ctx, S.x - 14, S.y - 14, S.w + 28, S.h + 28, { fill: INK, lw: 0, off: 22, shadow: P.C.shadowOnBg || INK, r: (70 * S.w) / 800 });
    quiet(R, k >= 0.999, () => K.chatDraw(R, CH, lt, { type0: 0.7, type1: 1.3, send: 1.4 }));
    ctx.restore();
  }

  // ---------------------------------------------------------------- sound
  // The bold beat: a kick on every half second, a clap on the off-beat, a
  // saw bass, a hit at every cut and at every stamp (times in s).
  function sound(P, hits = []) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const bass = [55, 55, 73.42, 65.41];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 140, f1: 45, dur: 0.3, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', filter: 'bandpass', f: 1800, q: 1.2, dur: 0.06, gain: 0.1 });
      ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'square', dur: 0.32, gain: 0.08, lp: 420 });
    }
    for (const t of P.timeline.cuts) ev.push({ t, kind: 'noise', filter: 'highpass', f: 2500, dur: 0.18, gain: 0.22 });
    for (const t of hits) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 900, dur: 0.14, gain: 0.32 }, { t, kind: 'tone', hz: 110, hz1: 55, wave: 'triangle', dur: 0.2, gain: 0.26 });
    if (Ka && Ka.start >= 1.5) ev.push({ t: Ka.start - 1.5, kind: 'riser', dur: 1.5, f0: 300, f1: 5000, gain: 0.18 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }
  // The start of every page of an act (s), shifted by dt.
  const pageStarts = (P, kind, dt = 0) => { const a = P.act(kind); return a ? (a.pages && a.pages.length ? a.pages : [[]]).map((_, p) => a.start + p * K.PAGE_S + dt) : []; };

  // The tag of a highlight's value and its label.
  const hlTags = (h) => [h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque', h.role === 'salary' ? 'período' : 'rótulo'];
  // A colour that reads on bg (the given one when it does).
  const readable = (fg, bg, min = 4.5) => U.ensureContrast(fg, bg, min);

  RS.boldKit = {
    INK, TILES, COMIC, STAMP,
    stamp, shake, slide, pulse, quiet, stamped,
    hardBox, hazard, halftone, photoOf, photo, photoFull, framed,
    tile, board, boardFit, drawBoard, stack, stackH, bulletRows, bulletRow,
    card, drawCard, chat, chatPhone, sound, pageStarts, hlTags, readable, clamp,
  };
})();
