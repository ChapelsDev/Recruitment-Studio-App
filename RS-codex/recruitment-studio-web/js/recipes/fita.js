// Video recipe «Fita métrica»: a tape measure unrolls across the screen; every
// piece of the ad is a mark on it and the salary is the measurement. Camera
// language: a horizontal track along the tape (every act and page whips
// sideways to the next stretch); the tape runs out of its case at the start
// and goes back in at the end. Acts (see RS.motion.register): H the tape runs
// out, the headline is read above it; I and F his lines; M the benefits as
// numbered marks; V the tape runs off to the horizon under the company's
// name; D every highlight is read under a cursor (the tape slides until its
// mark is there); L the positions; C the chat; K the card over the tape; O
// the tape goes back into its case — the first frame.
(() => {
  const K = RS.motionKit, U = RS.util;
  const { win, expoOut, expoIn, expoInOut, lerp, rrect } = K;
  const TH = 170, MAJOR = 200; // the tape's height, the px between two numbers

  // ---------------------------------------------------------------- the tape
  // A stretch of tape from x0 to x1 (screen) at y; shift: the world x at
  // screen 0; unit: the value of one number step; flags: [{ wx, L }] marks
  // printed with their own words.
  function tape(R, P, x0, x1, y, h, shift, unit, o = {}) {
    const { ctx } = R, C = P.C;
    if (x1 <= x0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y, x1 - x0, h); ctx.clip();
    ctx.fillStyle = C.main; ctx.fillRect(x0, y, x1 - x0, h);
    ctx.fillStyle = C.edge; ctx.fillRect(x0, y, x1 - x0, 6); ctx.fillRect(x0, y + h - 6, x1 - x0, 6);
    const step = MAJOR / 10;
    ctx.fillStyle = C.tick;
    for (let wx = Math.floor((x0 + shift) / step) * step; wx <= x1 + shift; wx += step) {
      const k = Math.round(wx / step);
      ctx.fillRect(wx - shift - 2, y + 6, 4, k % 10 === 0 ? h * 0.42 : k % 5 === 0 ? h * 0.3 : h * 0.18);
    }
    const flags = o.flags || [];
    for (let wx = Math.floor((x0 + shift) / MAJOR) * MAJOR; wx <= x1 + shift + MAJOR; wx += MAJOR) {
      const n = Math.round(wx / MAJOR) * unit;
      if (n < 0 || flags.some((f) => Math.abs(f.wx - wx) < MAJOR * 0.6)) continue;
      K.fillText(ctx, String(n), wx - shift + 10, y + h - 30, P.tapeL, C.tick);
    }
    for (const f of flags) {
      const sx = f.wx - shift;
      if (sx < x0 - 900 || sx > x1 + 100) continue;
      ctx.fillStyle = C.tick; ctx.fillRect(sx - 3, y + 6, 6, h * 0.5);
      f.L.draw(ctx, sx + 12, y + h - 30 - f.L.capPx, C.tick, 'left', 0);
    }
    ctx.restore();
  }
  // the tape measure's case (its mouth at (mx, my): where the tape comes out)
  function tapeCase(R, P, mx, my) {
    const { ctx } = R, C = P.C, s = P.caseS;
    const x = mx - s, y = my - s / 2;
    rrect(ctx, x + 10, y + 14, s, s, 60); ctx.fillStyle = C.shadow; ctx.fill();
    rrect(ctx, x, y, s, s, 60); ctx.fillStyle = C.caseBody; ctx.fill();
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.34, 0, Math.PI * 2); ctx.fillStyle = C.main; ctx.fill();
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.12, 0, Math.PI * 2); ctx.fillStyle = C.caseBody; ctx.fill();
    rrect(ctx, x + s * 0.3, y - 22, s * 0.36, 34, 12); ctx.fillStyle = C.caseBody; ctx.fill(); // the lock
    ctx.fillRect(mx - 8, my - TH / 2 - 10, 26, TH + 20); // the mouth
  }
  // the tape run out of its case to `end` (screen x), the hook at its end
  function pulled(R, P, end) {
    const { ctx } = R;
    tape(R, P, P.mouthX, end, P.tapeY, TH, -P.mouthX, 1);
    ctx.fillStyle = P.C.tick; ctx.fillRect(end - 4, P.tapeY - 16, 26, TH + 32);
    tapeCase(R, P, P.mouthX, P.tapeY + TH / 2);
  }

  // ---------------------------------------------------------------- prepare
  // the largest round step (1, 2, 5 × 10ⁿ) that divides n at least six times
  const niceUnit = (n) => {
    let best = 1;
    for (const m of [1, 2, 5]) for (let e = 1; e <= 1e6; e *= 10) { const u = m * e; if (n % u === 0 && n / u >= 6 && u > best) best = u; }
    return best;
  };
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    P.tapeL = K.line(null, '0', { font: F.head, size: 46 });
    P.caseS = Z.story ? 300 : 240;
    P.tapeY = Z.bottom - TH - 30;
    P.mouthX = Z.left + P.caseS - 60;
    const top = Z.top + 10, room = P.tapeY - 50 - top;
    P.area = { top, room };
    const fit = (t, o) => K.fit(P, t, { font: F.head, lh: 1.04, maxW: Z.w, ...o, maxSize: Math.max(o.minSize, o.maxSize) });
    // H: the kicker and the headline above the tape
    P.Hk = c.kicker ? fit(c.kicker, { upper: true, track: 0.06, maxSize: 54, minSize: 40, maxLines: 2 }) : null;
    P.Hh = fit(c.headline || c.brandName || ' ', { upper: P.upper, maxSize: 170, minSize: 64, maxLines: 5, maxH: room - (P.Hk ? P.Hk.vh + 40 : 0) });
    const hH = (P.Hk ? P.Hk.vh + 40 : 0) + P.Hh.vh;
    P.HkY = top + (room - hH) / 2; P.HhY = P.HkY + (P.Hk ? P.Hk.vh + 40 : 0);
    const lineOf = (t) => (t ? fit(t, { maxSize: 110, minSize: 50, maxLines: 7, maxH: room }) : null);
    P.Il = P.act('I') ? lineOf(c.intro) : null;
    P.Fl = P.act('F') ? lineOf(c.closing) : null;
    // M, L: numbered rows above the tape, each number on a flag
    const rowsOf = (texts, items, o) => {
      for (let k = 1; ; k -= 0.08) {
        const flag = K.line(P, '00', { font: F.head, size: Math.max(44, 64 * k) });
        const title = o.title ? fit(o.title, { upper: true, track: 0.04, maxSize: Math.max(44, 60 * k), minSize: 44, maxLines: 2 }) : null;
        const rows = items.map((i) => ({ L: fit(texts[i], { upper: P.upper, maxSize: Math.max(44, o.max * k), minSize: 44, maxW: Z.w - flag.w - 70, maxLines: 3 }), n: String(i + 1).padStart(2, '0') }));
        rows.forEach((r) => { r.h = Math.max(flag.vh + 30, r.L.vh); r.nL = K.line(null, r.n, { font: F.head, size: 46 }); });
        const H = (title ? title.vh + 40 : 0) + rows.reduce((a, r) => a + r.h + 34, -34);
        if (H <= room || k <= 0.5) {
          let y = top + (room - H) / 2;
          const titleY = y;
          if (title) y += title.vh + 40;
          for (const r of rows) { r.y = y; y += r.h + 34; }
          return { title, titleY, rows, flag };
        }
      }
    };
    P.Ms = (Ma ? Ma.pages : []).map((items) => rowsOf(c.benefits, items, { max: 110 }));
    P.Ls = (La ? La.pages : []).map((items) => rowsOf(c.positions, items, { max: 96, title: c.positionsTitle }));
    // D: every highlight read under a cursor (its own stretch of tape)
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    P.Ds = (Da ? Da.pages : []).map((items) => {
      for (let k = 1; ; k -= 0.08) {
        const blocks = items.map((i) => {
          const h = c.highlights[i], count = h.value && h.count != null ? h.count : null;
          const V = fit(h.value || h.label, { maxSize: Math.max(70, 150 * k), minSize: 70, maxLines: 2 });
          const L = h.value && h.label ? fit(h.label, { font: F.bold, upper: P.upper, maxSize: Math.max(44, 58 * k), minSize: 44, maxLines: 2 }) : null;
          const unit = count != null ? niceUnit(count) : 1;
          const target = count != null ? (count / unit) * MAJOR : 14 * MAJOR;
          const flagL = count == null ? K.line(P, h.value || h.label, { font: F.head, size: 46 }) : null;
          const sh = 130;
          return { h, V, L, count, unit, target, flagL, sh, tag: tagOf(h), labelTag: h.role === 'salary' ? 'período' : 'rótulo', H: V.vh + 20 + (L ? L.vh + 26 : 0) + 40 + sh };
        });
        const H = blocks.reduce((a, b) => a + b.H, 0) + 70 * (blocks.length - 1);
        if (H <= Z.cH - 20 || k <= 0.5) {
          let y = Z.top + (Z.cH - H) / 2;
          for (const b of blocks) { b.y = y; b.stripY = y + b.H - b.sh; y += b.H + 70; }
          return blocks;
        }
      }
    });
    // V: the company (else the headline) over the tape running to the horizon
    P.Vt = fit(c.brandName || c.headline || ' ', { upper: P.upper, maxSize: 150, minSize: 60, maxLines: 3, maxH: Z.cH * 0.4 });
    // C: the phone; K: the card above the tape
    const ph = Math.min(1180, Z.cH - 20), pw = Math.min(800, Z.w);
    P.phone = { x: Z.W / 2 - pw / 2, y: Z.cy - ph / 2, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.bold, fontStrong: F.head, radius: (64 * pw) / 800,
      colors: { screen: '#FFFFFF', head: '#111111', headInk: '#FFFFFF', field: '#EFEDE6', fieldInk: '#111111', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: '#111111' } });
    P.card = K.cardLayout(P, { font: F.head, bold: F.bold, upper: P.upper, cy: top + room / 2, maxH: room - 10 });
  }

  // ---------------------------------------------------------------- the acts
  const reveal = (R, x0, x1, draw) => { const { ctx } = R; ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, Math.max(0, x1 - x0), R.P.fmt.h); ctx.clip(); draw(); ctx.restore(); };
  const settle = (R, ok, draw) => { const rr = R.rec; if (!ok) R.rec = () => {}; try { draw(); } finally { R.rec = rr; } };
  // H: the tape runs out; the headline is read as it passes; the kicker after
  function hook(R, P, A) {
    const lt = A.lt, Z = P.Z;
    const e = expoOut(win(lt, 0.1, 0.9));
    const end = lerp(P.mouthX, Z.W + 40, e);
    pulled(R, P, end);
    settle(R, e >= 1, () => reveal(R, 0, lerp(Z.left - 20, Z.W + 40, e), () => K.text(R, P.Hh, Z.left, P.HhY, P.C.ink, 'center', Z.w, 'título')));
    if (P.Hk && lt >= 1.1) { const k = expoOut(win(lt, 1.1, 0.4)); settle(R, k >= 1, () => reveal(R, 0, lerp(Z.left, Z.left + Z.w + 20, k), () => K.text(R, P.Hk, Z.left, P.HkY, P.C.ink, 'center', Z.w, 'chamada'))); }
  }
  // I, F: his line, read as the tape runs on under it
  const lineAct = (key, tag) => (R, A) => {
    const P = R.P, L = P[key], Z = P.Z, lt = A.lt;
    tape(R, P, 0, Z.W, P.tapeY, TH, 4000 + lerp(0, 1600, expoOut(win(lt, 0, 1.2))), 1);
    if (!L) return;
    const k = expoOut(win(lt, 0.1, 1.0));
    settle(R, k >= 1, () => reveal(R, 0, lerp(Z.left - 20, Z.W, k), () => K.text(R, L, Z.left, P.area.top + (P.area.room - L.vh) / 2, P.C.ink, 'center', Z.w, tag)));
  };
  // M, L, a page: numbered rows; the tape below shows their marks
  function rowsAct(R, P, A, pages, tag) {
    const pg = K.page(A), lt = pg.lt, S = pages[pg.index], Z = P.Z, { ctx } = R;
    if (!S) return;
    const base = 8000 + pg.index * 2400, gap = Math.min(520, (Z.w - 200) / Math.max(1, S.rows.length - 1));
    const flags = S.rows.map((r, j) => ({ wx: base + 260 + j * gap, L: r.nL }));
    tape(R, P, 0, Z.W, P.tapeY, TH, base, 1, { flags });
    if (S.title) settle(R, lt >= 0.4, () => K.text(R, S.title, Z.left, S.titleY, P.C.ink, 'center', Z.w, 'título vagas'));
    const step = Math.min(0.42, 1.4 / Math.max(1, S.rows.length));
    S.rows.forEach((r, j) => {
      const t0 = 0.15 + j * step;
      if (lt < t0) return;
      const k = expoOut(win(lt, t0, 0.35));
      const x = Z.left + (1 - k) * (Z.w + 200), fy = r.y + (r.h - S.flag.vh - 30) / 2;
      rrect(ctx, x, fy, S.flag.w + 30, S.flag.vh + 30, 10); ctx.fillStyle = P.C.main; ctx.fill();
      K.fillText(ctx, r.n, x + 15, fy + 15 + S.flag.capPx, S.flag, P.C.tick);
      settle(R, k >= 0.98, () => K.text(R, r.L, x + S.flag.w + 60, r.y + (r.h - r.L.vh) / 2, P.C.ink, 'left', 0, tag));
      // the leader from the row down to its mark
      const fx = flags[j].wx - base;
      ctx.strokeStyle = P.C.tick; ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(fx, r.y + r.h + 8); ctx.lineTo(fx, P.tapeY - 8); ctx.stroke(); ctx.setLineDash([]);
    });
  }
  // V: the tape runs off to the horizon under the company's name
  function horizon(R, P, A) {
    const { ctx } = R, Z = P.Z, C = P.C, lt = A.lt;
    const vy = Z.top + P.Vt.vh + 120, by = Z.bottom + 40;
    const run = 900 * expoOut(win(lt, 0, 1.6));
    const near = Z.w + 160, far = 20;
    ctx.beginPath(); ctx.moveTo(Z.W / 2 - near / 2, by); ctx.lineTo(Z.W / 2 + near / 2, by); ctx.lineTo(Z.W / 2 + far / 2, vy); ctx.lineTo(Z.W / 2 - far / 2, vy); ctx.closePath();
    ctx.fillStyle = C.main; ctx.fill();
    ctx.fillStyle = C.tick;
    for (let i = 0; i < 40; i++) {
      // ticks across the tape, closer together toward the horizon
      const d = ((i * 60 + run) % 2400) / 2400, depth = Math.pow(d, 2.2);
      const y = lerp(vy, by, depth), wd = lerp(far, near, depth);
      ctx.fillRect(Z.W / 2 - wd / 2, y, wd * (i % 5 === 0 ? 0.42 : 0.22), Math.max(1.5, 5 * depth));
    }
    const k = expoOut(win(lt, 0.2, 0.6));
    settle(R, k >= 1, () => reveal(R, 0, lerp(Z.left - 20, Z.W, k), () => K.text(R, P.Vt, Z.left, Z.top + 40, C.ink, 'center', Z.w, P.content.brandName ? 'marca' : 'título')));
  }
  // D, a page: each value read under its cursor — the tape slides until its mark is there
  function readings(R, P, A) {
    const pg = K.page(A), lt = pg.lt, blocks = P.Ds[pg.index] || [], Z = P.Z, { ctx } = R, C = P.C;
    const cx = Z.W / 2;
    blocks.forEach((b, j) => {
      const t0 = 0.1 + j * 0.25;
      const pos = (x) => b.target * expoOut(win(x, t0, 1.0));
      const e = expoOut(win(lt, t0, 1.0));
      const moving = R.moving; if (e < 1) R.moving = true;
      K.blurred(R, Math.abs(K.speed(pos, lt)), (g, d) => tape(R, P, -20, Z.W + 20, b.stripY, b.sh, pos(lt - d) - cx, b.unit, { flags: b.flagL ? [{ wx: b.target, L: b.flagL }] : [] }), { x: 0, y: b.stripY, w: Z.W, h: b.sh });
      R.moving = moving;
      // the cursor; the reading on the tape under it counts once the tape has stopped
      ctx.fillStyle = C.cursor; ctx.fillRect(cx - 3, b.stripY - 26, 6, b.sh + 40);
      ctx.beginPath(); ctx.moveTo(cx - 20, b.stripY - 30); ctx.lineTo(cx + 20, b.stripY - 30); ctx.lineTo(cx, b.stripY - 6); ctx.closePath(); ctx.fill();
      if (e >= 1) R.rec(cx + 10, b.stripY + b.sh - 30 - P.tapeL.capPx, 200, P.tapeL.capPx, 'leitura', b.count != null ? String(b.count) : b.flagL.lines.join(' '));
      // the reading above: a plain number follows the tape, anything else shows once it stops
      if (b.count != null && e < 1) {
        const L = K.line(null, `${b.h.prefix}${Math.round(b.count * e)}${b.h.suffix}`, { font: b.V.font, size: b.V.size });
        L.draw(ctx, Z.left + (Z.w - L.w) / 2, b.y, C.ink, 'left', 0);
      } else if (e >= 1) K.text(R, b.V, Z.left, b.y, C.ink, 'center', Z.w, b.tag);
      if (b.L && e >= 1) K.text(R, b.L, Z.left, b.y + b.V.vh + 26, C.soft, 'center', Z.w, b.labelTag);
    });
  }
  const cardInk = (P) => ({ ink: P.C.ink, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: P.C.ink, qrDark: '#111111', qrLight: '#FFFFFF' });
  // K: the tape out under the card
  function card(R, P, A) {
    pulled(R, P, P.Z.W + 40);
    K.cardDraw(R, P.card, A.lt, { ...cardInk(P), start: 0.1 });
  }
  // O: the card goes up and away; the tape goes back into its case — the first frame
  function loop(R, P, A) {
    const lt = A.lt, Z = P.Z, Ka = P.act('K');
    if (lt < 0.4) {
      const moving = R.moving; R.moving = true;
      K.cardDraw(R, P.card, Ka.d, { ...cardInk(P), start: 0.1, dy: -expoIn(win(lt, 0, 0.36)) * Z.H });
      R.moving = moving;
    }
    pulled(R, P, lerp(Z.W + 40, P.mouthX, expoInOut(win(lt, 0.2, 0.7))));
  }
  const chatAct = (R, A) => K.chatDraw(R, R.P.chat, A.lt, { type0: 0.55, type1: 1.3, send: 1.36 });

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const bass = [55, 61.74, 65.41, 49];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 135, f1: 44, dur: 0.3, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 8500, dur: 0.03, gain: 0.06 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'triangle', dur: 0.4, gain: 0.3, lp: 500 });
    }
    // a whip on every act change and every new page; a riser into the card
    const turns = P.acts.filter((a) => a.pages).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...turns]) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 1500, q: 0.7, dur: 0.2, gain: 0.32 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 250, f1: 6000, gain: 0.24 });
    // the tape running out (and back in): a fast ratchet; a ding when a reading stops
    const ratchet = (t0, d) => { for (let t = 0; t < d; t += 0.025) ev.push({ t: t0 + t, kind: 'noise', filter: 'bandpass', f: 3000, q: 8, dur: 0.01, gain: 0.05 }); };
    ratchet(0.1, 0.8);
    const D = P.act('D');
    if (D) P.Ds.forEach((blocks, p) => blocks.forEach((b, j) => { ratchet(D.start + p * 2 + 0.1 + j * 0.25, 0.7); ev.push({ t: D.start + p * 2 + 1.1 + j * 0.25, kind: 'tone', hz: 1046.5, wave: 'sine', dur: 0.12, gain: 0.12 }); }));
    const C = P.act('C');
    if (C) {
      for (let t = 0.55; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    const O = P.act('O');
    ratchet(O.start + 0.2, 0.7);
    ev.push({ t: O.start + 0.9, kind: 'kick', f0: 200, f1: 70, dur: 0.08, gain: 0.4 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'fita', name: 'Fita métrica', concept: 'Uma fita métrica desenrola-se no ecrã: cada informação é uma marca; o salário é a medida.',
    font: { head: { family: 'Barlow Condensed', weight: 700 }, bold: { family: 'Barlow Condensed', weight: 700 } },
    palettes: { light: { bg: '#F4F1EA', ink: '#111111', main: '#F7C600', accent: '#111111' } },
    bgModes: ['light'], photos: 0, travel: 'whip', pages: true,
    colors(c) {
      // the tape in the main colour with black ticks; the cursor in the highlight colour
      c.tick = '#111111';
      c.edge = U.mix(c.main, '#000000', 0.18);
      c.cursor = c.accentPicked ? U.ensureContrast(c.accent, c.bg, 3) : '#D62828';
      c.soft = U.ensureContrast(U.mix(c.ink, c.bg, 0.35), c.bg, 4.5);
      c.caseBody = '#1C1C1C';
      c.shadow = U.mix(c.bg, '#000000', 0.2);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => hook(R, R.P, A),
      I: lineAct('Il', 'intro'),
      M: (R, A) => rowsAct(R, R.P, A, R.P.Ms, 'vantagem'),
      V: (R, A) => horizon(R, R.P, A),
      D: (R, A) => readings(R, R.P, A),
      L: (R, A) => rowsAct(R, R.P, A, R.P.Ls, 'vaga'),
      F: lineAct('Fl', 'fecho'),
      C: chatAct,
      K: (R, A) => card(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
