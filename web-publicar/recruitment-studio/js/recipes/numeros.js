// Video recipe «Números»: every number rolls like an odometer and takes the
// whole screen. Camera language: still; the screen is a counter — every text
// rolls up into place from a row of zeros, and a number's digits turn like an
// odometer's wheels (each wheel once more than the one on its left).
// Acts (see RS.motion.register): H the headline rolls up from zeros; D the
// highlights come first (a value rolls to its number, or rolls in whole, as
// written); M the benefits as a numbered list (the count goes on from page to
// page); V the total of benefits; L the positions, numbered; C the phone
// rolls up; K the card; O the card rolls away and the headline rolls back to
// zeros, the first frame. 10–30 s: M, D and L a page at a time.
(() => {
  const K = RS.motionKit, U = RS.util;
  const { win, expoOut, expoIn, expoInOut } = K;
  const ROW = 1.25; // a reel's row, in font sizes

  // ---------------------------------------------------------------- reels
  // A line of reels: every character rolls up into place from '0' (letters
  // turn a few rows of digits first); the digits of a number turn like an
  // odometer, left to right, 0.06 s apart; whole: the line rolls in whole.
  function reelLine(L, text, o = {}) {
    const chars = [...text];
    const at = (j) => K.textWidth(chars.slice(0, j).join(''), L);
    const cells = [];
    if (o.whole) cells.push({ x: 0, w: K.textWidth(text, L), travel: 1, delay: 0, dur: 0.45, glyph: (r) => (r === 0 ? text : '') });
    else {
      let digit = 0;
      chars.forEach((ch, j) => {
        if (!ch.trim()) return;
        const x = at(j), w = at(j + 1) - x;
        if (o.number && /\d/.test(ch)) {
          const d = Number(ch), travel = d + 10 * (digit + 1);
          cells.push({ x, w, travel, delay: digit * 0.06, dur: 0.65, glyph: (r) => String((((d - r) % 10) + 10) % 10) });
          digit++;
        } else {
          const travel = 3 + (j % 3);
          cells.push({ x, w, travel, delay: o.number ? digit * 0.06 : j * 0.03, dur: 0.45, glyph: (r) => (r === 0 ? ch : String((travel - r) % 10)) });
        }
      });
    }
    return { L, text, cells, w: K.textWidth(text, L) };
  }
  const glyphW = (L, g) => {
    if (!L.gw) L.gw = new Map();
    if (!L.gw.has(g)) L.gw.set(g, K.textWidth(g, L));
    return L.gw.get(g);
  };
  // The wheel's progress at lt (from t0), or `p` for every wheel (the loop).
  const progress = (c, lt, t0, p) => (p != null ? p : expoOut(win(lt, t0 + c.delay, c.dur)));
  // Draws a reel line with its top at (x, top); records it once every wheel has stopped.
  function drawReels(R, RL, x, top, lt, t0, color, tag, p) {
    const { ctx } = R, L = RL.L, rowH = L.size * ROW;
    let done = true;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 24, top - L.size * 0.36, RL.w + 48, L.capPx + L.size * 0.68); ctx.clip();
    for (const c of RL.cells) {
      const k = progress(c, lt, t0, p);
      if (k < 1) done = false;
      const o = c.travel * (1 - k), r0 = Math.floor(o), fr = o - r0;
      for (let r = r0; r <= Math.min(c.travel, r0 + 1); r++) {
        const g = c.glyph(r);
        if (!g) continue;
        K.fillText(ctx, g, x + c.x + (c.w - glyphW(L, g)) / 2, top + (fr - (r - r0)) * rowH + L.capPx, L, color);
      }
    }
    ctx.restore();
    if (done && tag) R.rec(x, top, RL.w, L.capPx, tag, RL.text);
    return done;
  }
  // how fast the fastest wheel of a line turns (px/s), for the motion blur
  function reelSpeed(RL, lt, t0, p) {
    if (p != null) return 0;
    const rowH = RL.L.size * ROW;
    let v = 0;
    for (const c of RL.cells) v = Math.max(v, Math.abs(K.speed((x) => c.travel * expoOut(win(x, t0 + c.delay, c.dur)), lt)) * rowH);
    return v;
  }
  // reel lines [{ RL, x, top, t0, color, tag, dy }] blurred by their fastest wheel
  function reels(R, items, lt, p) {
    if (!items.length) return;
    const v = Math.max(0, ...items.map((it) => reelSpeed(it.RL, lt, it.t0, p)));
    K.blurred(R, v, (g, d) => { for (const it of items) drawReels(R, it.RL, it.x, it.top + (it.dy || 0), lt - d, it.t0, it.color, it.tag, p); }, null);
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const CX = Z.W / 2;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    // H: the headline, a reel line per line; the kicker on a strip above it
    const head = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 170, minSize: 70, maxW: Z.w, maxLines: 4, lh: 1.14, maxH: Z.cH * 0.62 });
    const kicker = c.kicker ? K.fit(P, c.kicker, { font: F.head, upper: true, track: 0.04, maxSize: 56, minSize: 40, maxW: Z.w - 80, maxLines: 2, lh: 1.2 }) : null;
    const kh = kicker ? kicker.vh + 90 : 0;
    const top = Z.cy - (kh + head.vh) / 2;
    P.kicker = kicker && { L: kicker, top: top + 20, lines: kicker.lines.map((ln, i) => ({ RL: reelLine(kicker, ln), x: CX - kicker.widths[i] / 2, top: top + 20 + i * kicker.lhPx })) };
    P.head = head.lines.map((ln, i) => ({ RL: reelLine(head, ln), x: CX - head.widths[i] / 2, top: top + kh + i * head.lhPx, t0: Math.min(i, 2) * 0.5 }));

    // D: the highlights, a page at a time
    const hl = c.highlights;
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    P.dataPages = (Da ? Da.pages : []).map((items) => {
      const one = items.length === 1;
      const blocks = items.map((i) => {
        const h = hl[i], number = !!h.value && h.count != null;
        const L = K.fit(P, h.value || h.label, { font: F.head, maxSize: one ? 300 : 220, minSize: 90, maxW: Z.w, maxLines: number ? 1 : 2, lh: 1.04 });
        const label = h.value && h.label ? K.fit(P, h.label, { font: F.head, upper: P.upper, maxSize: 76, minSize: 44, maxW: Z.w, maxLines: 2, lh: 1.1 }) : null;
        return {
          hl: h, L, label, tag: tagOf(h), H: L.vh + (label ? 44 + label.vh : 0),
          lines: L.lines.map((ln, j) => ({ RL: reelLine(L, ln, { number, whole: !number }), w: L.widths[j] })),
          labels: label ? label.lines.map((ln, j) => ({ RL: reelLine(label, ln, { whole: true }), w: label.widths[j] })) : [],
        };
      });
      const H = blocks.reduce((a, b) => a + b.H, 0) + 110 * Math.max(0, blocks.length - 1);
      let y = Z.cy - H / 2;
      for (const b of blocks) { b.y = y; y += b.H + 110; }
      return blocks;
    });

    // M and L: numbered rows (the count goes on from page to page)
    const rowsOf = (items, texts, o) => {
      for (let size = o.idx; ; size -= 12) {
        const idxL = K.line(P, '00', { font: F.head, size });
        const textW = Z.w - idxL.w - 44;
        const rows = items.map((i) => {
          const L = K.fit(P, texts[i], { font: F.head, upper: P.upper, maxSize: o.text, minSize: 44, maxW: textW, maxLines: 3, lh: 1.06 });
          return { idx: reelLine(idxL, String(i + 1).padStart(2, '0'), { number: true }), L, lines: L.lines.map((ln) => reelLine(L, ln, { whole: true })), h: Math.max(idxL.vh, L.vh) };
        });
        const tH = o.title ? o.title.vh + 70 : 0;
        const H = rows.reduce((a, r) => a + r.h, 0) + o.gap * Math.max(0, rows.length - 1) + tH;
        if (H <= Z.cH * 0.94 || size <= 80) {
          let y = Z.cy - H / 2 + tH;
          for (const r of rows) { r.y = y; y += r.h + o.gap; }
          return { rows, idxL, textX: Z.left + idxL.w + 44, titleY: o.title ? Z.cy - H / 2 : null };
        }
      }
    };
    P.benPages = (Ma ? Ma.pages : []).map((items) => rowsOf(items, c.benefits, { idx: 230, text: 112, gap: 70 }));
    const title = c.positionsTitle ? K.fit(P, c.positionsTitle, { font: F.head, upper: P.upper, maxSize: 72, minSize: 44, maxW: Z.w, maxLines: 2, lh: 1.1 }) : null;
    P.posTitle = title && { L: title, lines: title.lines.map((ln) => reelLine(title, ln, { whole: true })) };
    P.posPages = (La ? La.pages : []).map((items) => rowsOf(items, c.positions, { idx: 170, text: 92, gap: 46, title }));

    // V: the total of benefits and its word
    const n = c.benefits.length;
    P.total = K.fit(P, String(n), { font: F.head, maxSize: 480, minSize: 200, maxW: Z.w, maxLines: 1 });
    P.totalRL = reelLine(P.total, String(n), { number: true });
    P.totalLabel = K.fit(P, P.label('benefits'), { font: F.head, upper: true, track: 0.04, maxSize: 110, minSize: 50, maxW: Z.w, maxLines: 2, lh: 1.05 });
    P.totalLabelRL = P.totalLabel.lines.map((ln) => reelLine(P.totalLabel, ln, { whole: true }));
    P.totalY = Z.cy - (P.total.vh + 60 + P.totalLabel.vh) / 2;

    // C: the phone (dark, framed in the highlight colour)
    const ph = Math.min(1220, Z.cH - 10), pw = Math.min(840, Z.w);
    P.phone = { x: CX - pw / 2, y: Z.cy - ph / 2, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.head, fontStrong: F.head, radius: (70 * pw) / 840,
      colors: { screen: '#141414', head: '#000000', headInk: '#FFFFFF', field: '#262626', fieldInk: '#FFFFFF', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: C.main } });
    // K: the card
    P.card = K.cardLayout(P, { font: F.head, bold: F.head, upper: P.upper });
  }

  // ---------------------------------------------------------------- the acts
  const headItems = (P) => P.head.map((h) => ({ RL: h.RL, x: h.x, top: h.top, t0: h.t0, color: P.C.main, tag: 'título' }));
  function hook(R, P, lt) {
    const { ctx } = R;
    const items = headItems(P);
    if (P.kicker && lt >= 1.5) {
      // the kicker's strip opens, its letters roll up
      const k = expoOut(win(lt, 1.5, 0.3)), L = P.kicker.L;
      const w = (L.w + 60) * k;
      ctx.fillStyle = P.C.main; ctx.fillRect(P.Z.W / 2 - w / 2, P.kicker.top - 22, w, L.vh + 44);
      if (lt >= 1.55) for (const k2 of P.kicker.lines) items.push({ RL: k2.RL, x: k2.x, top: k2.top, t0: 1.55, color: P.C.bg, tag: 'chamada' });
    }
    reels(R, items, lt);
  }
  // D, one page: each value rolls (a number) or rolls in whole; then its label
  function data(R, P, idx, lt) {
    const items = [];
    (P.dataPages[idx] || []).forEach((b, j) => {
      const t0 = (idx === 0 ? 0.1 : 0.4) + j * 0.6;
      if (lt < t0) return;
      b.lines.forEach((ln, i) => items.push({ RL: ln.RL, x: P.Z.W / 2 - ln.w / 2, top: b.y + i * b.L.lhPx, t0, color: P.C.main, tag: b.tag }));
      if (lt >= t0 + 0.4) b.labels.forEach((ln, i) => items.push({ RL: ln.RL, x: P.Z.W / 2 - ln.w / 2, top: b.y + b.L.vh + 44 + i * b.label.lhPx, t0: t0 + 0.4, color: P.C.ink, tag: b.hl.role === 'salary' ? 'período' : 'rótulo' }));
    });
    reels(R, items, lt);
  }
  // M and L, one page: the number of each row rolls, then its words (p: every wheel at p)
  function rows(R, P, pg, lt, first, tag, p) {
    const items = [];
    const base = first ? 0.05 : 0.4, step = pg.rows.length > 3 ? 0.3 : 0.45;
    if (pg.titleY != null && P.posTitle) P.posTitle.lines.forEach((RL, i) => items.push({ RL, x: P.Z.left, top: pg.titleY + i * P.posTitle.L.lhPx, t0: base, color: P.C.main, tag: 'título vagas' }));
    pg.rows.forEach((r, i) => {
      const t0 = base + i * step;
      if (p == null && lt < t0) return;
      items.push({ RL: r.idx, x: P.Z.left, top: r.y + (r.h - r.idx.L.vh) / 2, t0, color: P.C.main, tag: null });
      r.lines.forEach((RL, j) => items.push({ RL, x: pg.textX, top: r.y + (r.h - r.L.vh) / 2 + j * r.L.lhPx, t0: t0 + 0.15, color: P.C.ink, tag }));
    });
    reels(R, items, lt, p);
  }
  // a page of an act on its way out, upwards (drawn as it ended, not recorded)
  function leaving(R, lt, draw) {
    const { ctx } = R;
    const moving = R.moving; R.moving = true;
    ctx.save(); ctx.translate(0, expoIn(win(lt, 0, 0.4)) * -R.P.Z.H); draw(); ctx.restore();
    R.moving = moving;
  }
  // V: the last benefits roll up and away; the total rolls to the number of benefits
  function total(R, P, A) {
    const lt = A.lt, Z = P.Z;
    if (A.bespoke && lt < 0.45 && P.benPages.length) leaving(R, lt, () => rows(R, P, P.benPages[P.benPages.length - 1], 9, true, 'vantagem', 1));
    const items = [{ RL: P.totalRL, x: Z.W / 2 - P.totalRL.w / 2, top: P.totalY, t0: 0.15, color: P.C.main, tag: 'total' }];
    if (lt >= 0.7) P.totalLabelRL.forEach((RL, i) => items.push({ RL, x: Z.W / 2 - P.totalLabel.widths[i] / 2, top: P.totalY + P.total.vh + 60 + i * P.totalLabel.lhPx, t0: 0.7, color: P.C.ink, tag: 'rótulo' }));
    reels(R, items, lt);
  }
  // C: the last positions roll away; the phone rolls up from below
  function phone(R, P, A) {
    const lt = A.lt, Z = P.Z;
    if (A.bespoke && lt < 0.45 && P.posPages.length) leaving(R, lt, () => rows(R, P, P.posPages[P.posPages.length - 1], 9, true, 'vaga', 1));
    const k = A.bespoke ? expoOut(win(lt, 0.05, 0.45)) : 1;
    const moving = R.moving; if (k < 1) R.moving = true;
    K.blurred(R, A.bespoke ? Math.abs(K.speed((x) => expoOut(win(x, 0.05, 0.45)) * Z.H, lt)) : 0, (g, d) => {
      const kd = A.bespoke ? expoOut(win(lt - d, 0.05, 0.45)) : 1;
      g.save(); g.translate(0, (1 - kd) * Z.H); K.chatDraw(R, P.chat, lt - d, { type0: 0.55, type1: 1.3, send: 1.36 }); g.restore();
    }, null);
    R.moving = moving;
  }
  const cardInk = (P) => ({ ink: P.C.ink, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: P.C.main, qrDark: '#0B0B0B', qrLight: '#FFFFFF' });
  // K: the phone rolls up and away; the card's parts rise one after the other
  function card(R, P, A) {
    const lt = A.lt;
    if (A.bespoke && lt < 0.45) leaving(R, lt, () => { const rr = R.rec; R.rec = () => {}; K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true }); R.rec = rr; });
    K.cardDraw(R, P.card, lt, { ...cardInk(P), start: A.bespoke ? 0.2 : 0.05 });
  }
  // O: the card rolls up and away; the headline rolls back to its zeros (the first frame)
  function loop(R, P, A) {
    const lt = A.lt, Ka = P.act('K');
    if (lt < 0.45) leaving(R, lt, () => K.cardDraw(R, P.card, Ka.d, { ...cardInk(P), start: Ka.bespoke ? 0.2 : 0.05 }));
    if (lt >= 0.3) reels(R, headItems(P), lt, 1 - expoInOut(win(lt, 0.3, 0.6)));
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const bass = [55, 55, 73.42, 49];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 150, f1: 45, dur: 0.3, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 9000, dur: 0.03, gain: 0.06 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'square', dur: 0.22, gain: 0.12, lp: 600 });
    }
    // a hit on every act change and every new page; a riser into the card
    const turns = P.acts.filter((a) => a.pages).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...turns]) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 1400, dur: 0.22, gain: 0.35 }, { t, kind: 'kick', f0: 210, f1: 50, dur: 0.22, gain: 0.45 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 250, f1: 6000, gain: 0.24 });
    // the wheels: a run of ticks every time something rolls
    const ticks = (t0, d = 0.5, step = 0.035) => { for (let t = 0; t < d; t += step) ev.push({ t: t0 + t, kind: 'noise', filter: 'bandpass', f: 3800, q: 6, dur: 0.012, gain: 0.05 + 0.04 * (1 - t / d) }); };
    ticks(0.02, 0.4); ticks(0.52, 0.4); ticks(1.02, 0.4);
    const at = (kind) => P.act(kind);
    if (at('D')) P.dataPages.forEach((blocks, p) => blocks.forEach((b, j) => ticks(at('D').start + p * 2 + (p ? 0.4 : 0.1) + j * 0.6, b.count != null ? 0.7 : 0.25)));
    if (at('M')) P.benPages.forEach((pg, p) => pg.rows.forEach((r, i) => ticks(at('M').start + p * 2 + (p ? 0.4 : 0.05) + i * (pg.rows.length > 3 ? 0.3 : 0.45), 0.3, 0.05)));
    if (at('V')) ticks(at('V').start + 0.15, 0.6);
    const C = at('C');
    if (C) {
      for (let t = 0.55; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    ticks(at('O').start + 0.3, 0.6, 0.03);
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'numeros', name: 'Números', concept: 'Cada número roda como um conta-quilómetros e ocupa o ecrã inteiro.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Anton', weight: 400 } },
    palettes: { dark: { bg: '#0B0B0B', ink: '#FFFFFF', main: '#FFC400', accent: '#FFC400' } },
    bgModes: ['dark'], photos: 0, travel: 'crane', pages: true, slides: { V: true },
    // the numbers first: the highlights right after the hook; the total needs the benefits
    order: ['D', 'M', 'V', 'L', 'C', 'F'], needs: { V: ['M'] },
    labels: { benefits: { 'pt-PT': 'vantagens', 'de-CH': 'Vorteile', 'de-DE': 'Vorteile', fr: 'avantages', it: 'vantaggi', en: 'benefits', es: 'ventajas' } },
    colors(c) {
      if (c.accentPicked) c.main = c.accent;
      c.main = U.ensureContrast(c.main, c.bg, 4.5);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => hook(R, R.P, A.lt),
      D: (R, A) => { const pg = K.page(A); data(R, R.P, pg.index, pg.lt); },
      M: (R, A) => { const pg = K.page(A); rows(R, R.P, R.P.benPages[pg.index], pg.lt, pg.first, 'vantagem'); },
      V: (R, A) => total(R, R.P, A),
      L: (R, A) => { const pg = K.page(A); rows(R, R.P, R.P.posPages[pg.index], pg.lt, pg.first, 'vaga'); },
      C: (R, A) => phone(R, R.P, A),
      K: (R, A) => card(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
