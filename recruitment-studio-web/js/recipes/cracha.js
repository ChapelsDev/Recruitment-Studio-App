// Video recipe «Crachá»: a site ID badge comes out of a printer, hangs on its
// lanyard and turns in 3D to show the ad on its sides; the QR is on the badge.
// Camera language: the badge is the subject — it turns about its vertical
// axis from one side to the next (every act and every page), swings a little
// on its lanyard and settles; the printer's slot opens at the start and takes
// the badge back at the end. The photo spot shows a helmet, never a face.
// Acts (see RS.motion.register): H printed (the front: helmet, headline,
// kicker); I and F his lines; M the benefits; V a full turn of the front; D
// the highlights; L the positions; C the chat on the badge; K the card with
// the QR; O back into the printer, the first frame.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, expoIn, expoInOut, rrect } = K;
  const TURN = 0.45, BAND = 150, PAD = 54, SETTLE = 0.6;
  const CARD = '#FFFFFF', NAVY = '#16213A';

  // ---------------------------------------------------------------- the sides
  // A side: its texts and shapes at absolute places on the badge (as it hangs
  // at rest); drawn into the badge's turn.
  const item = (L, x, y, color, tag, align = 'left', boxW = 0) => ({ L, x, y, color, tag, align, boxW });
  function stack(blocks, top, h, gap) {
    const H = blocks.reduce((a, b) => a + b.h, 0) + gap * Math.max(0, blocks.length - 1);
    let y = top + (h - H) / 2;
    for (const b of blocks) { b.y = y; y += b.h + gap; }
    return H;
  }
  // make(k) with a smaller k until its height fits h (its sizes stay at or over their minimum)
  function fitTo(h, make) { for (let k = 1; ; k -= 0.08) { const s = make(k); if (s.h <= h || k <= 0.5) return s; } }
  const sz = (k, max, min) => Math.max(min, max * k);

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    const w = Math.min(780, Z.w - 20), h = Math.min(Z.cH - (Z.story ? 40 : 80), 1180);
    const B = { w, h, x: Z.W / 2 - w / 2, y: Z.top + (Z.cH - h) / 2 + (Z.story ? 20 : 40) };
    B.ix = B.x + PAD; B.iw = w - PAD * 2; B.iy = B.y + BAND + 36; B.ih = B.y + h - PAD - B.iy;
    P.B = B;
    P.slotY = B.y - 60;
    // the company on the band, under the clip: one line when it fits, else two
    const bandOf = (lines, max) => K.fit(null, c.brandName, { font: F.head, upper: true, track: 0.04, maxSize: max, minSize: 40, maxW: w - 120, maxLines: lines, lh: 1.02 });
    let band = c.brandName ? bandOf(1, 54) : null;
    if (band && band.lines.length > 1) band = bandOf(2, 42);
    P.band = band && K.fit(P, c.brandName, { font: F.head, upper: true, track: 0.04, maxSize: band.size, minSize: band.size, maxW: w - 120, maxLines: band.lines.length, lh: 1.02 });
    const cx = Z.W / 2;
    const fit = (t, o) => K.fit(P, t, { font: F.head, lh: 1.08, ...o, maxSize: Math.max(o.minSize, o.maxSize) });

    // H and V: the front — the helmet in the photo spot, the headline, the kicker
    P.front = fitTo(B.ih, (k) => {
      const spot = Math.min(300, B.ih * 0.34) * Math.max(0.7, k);
      const head = fit(c.headline || c.brandName || ' ', { upper: P.upper, maxSize: sz(k, 100, 48), minSize: 48, maxW: B.iw, maxLines: 4 });
      const kick = c.kicker ? fit(c.kicker, { font: F.bold, upper: true, track: 0.06, maxSize: sz(k, 46, 40), minSize: 40, maxW: B.iw, maxLines: 2 }) : null;
      const blocks = [{ h: spot }, { h: head.vh }, ...(kick ? [{ h: kick.vh }] : [])];
      const H = stack(blocks, B.iy, B.ih, 40);
      return { h: H, spot: { x: cx - spot / 2, y: blocks[0].y, s: spot }, items: [item(head, B.ix, blocks[1].y, C.navy, 'título', 'center', B.iw), ...(kick ? [item(kick, B.ix, blocks[2].y, C.accentInk, 'chamada', 'center', B.iw)] : [])] };
    });
    // I, F: his lines
    const lineSide = (t, tag) => fitTo(B.ih, (k) => { const L = fit(t, { maxSize: sz(k, 84, 48), minSize: 48, maxW: B.iw, maxLines: 9 }); const b = [{ h: L.vh }]; const H = stack(b, B.iy, B.ih, 0); return { h: H, items: [item(L, B.ix, b[0].y, C.navy, tag, 'center', B.iw)] }; });
    P.Is = c.intro && P.act('I') ? lineSide(c.intro, 'intro') : null;
    P.Fs = c.closing && P.act('F') ? lineSide(c.closing, 'fecho') : null;
    // M: a page of benefits, each with its tick
    P.Ms = (Ma ? Ma.pages : []).map((items) => fitTo(B.ih, (k) => {
      const rows = items.map((i) => ({ L: fit(c.benefits[i], { maxSize: sz(k, 66, 44), minSize: 44, maxW: B.iw - 96, maxLines: 3 }) }));
      rows.forEach((r) => { r.h = Math.max(70, r.L.vh); });
      const H = stack(rows, B.iy, B.ih, 46);
      return { h: H, ticks: rows.map((r) => ({ x: B.ix + 32, y: r.y + r.h / 2 })), items: rows.map((r) => item(r.L, B.ix + 96, r.y + (r.h - r.L.vh) / 2, C.navy, 'vantagem')) };
    }));
    // D: a page of highlights (a plain number counts up)
    const tagOf = (hl) => (hl.role === 'salary' ? 'salário' : hl.role === 'vacancies' ? 'vagas' : 'destaque');
    P.Ds = (Da ? Da.pages : []).map((items) => fitTo(B.ih, (k) => {
      const blocks = [];
      for (const i of items) {
        const hl = c.highlights[i];
        const V = fit(hl.value || hl.label, { maxSize: sz(k, 150, 64), minSize: 64, maxW: B.iw, maxLines: 2, lh: 1.02 });
        blocks.push({ h: V.vh, L: V, hl, tag: tagOf(hl), color: C.accentInk, count: hl.value && hl.count != null ? hl.count : null });
        if (hl.value && hl.label) { const L = fit(hl.label, { font: F.bold, maxSize: sz(k, 54, 44), minSize: 44, maxW: B.iw, maxLines: 2 }); blocks.push({ h: L.vh, L, tag: hl.role === 'salary' ? 'período' : 'rótulo', color: C.navy }); }
      }
      const H = stack(blocks, B.iy, B.ih, 26);
      return { h: H, items: blocks.map((b) => ({ ...item(b.L, B.ix, b.y, b.color, b.tag, 'center', B.iw), count: b.count, hl: b.hl })) };
    }));
    // L: a page of positions under the badge's «function» line
    P.Ls = (La ? La.pages : []).map((items) => fitTo(B.ih, (k) => {
      const head = fit(P.label('role'), { font: F.bold, upper: true, track: 0.08, maxSize: sz(k, 46, 40), minSize: 40, maxW: B.iw, maxLines: 1 });
      const title = c.positionsTitle ? fit(c.positionsTitle, { maxSize: sz(k, 58, 44), minSize: 44, maxW: B.iw, maxLines: 2 }) : null;
      const rows = items.map((i) => ({ L: fit(c.positions[i], { maxSize: sz(k, 62, 44), minSize: 44, maxW: B.iw - 90, maxLines: 2 }) }));
      rows.forEach((r) => { r.h = Math.max(64, r.L.vh); });
      const blocks = [{ h: head.vh }, ...(title ? [{ h: title.vh }] : []), ...rows];
      const H = stack(blocks, B.iy, B.ih, 34);
      return { h: H, hats: rows.map((r) => ({ x: B.ix + 30, y: r.y + r.h / 2 })), items: [
        item(head, B.ix, blocks[0].y, C.accentInk, 'função', 'center', B.iw),
        ...(title ? [item(title, B.ix, blocks[1].y, C.navy, 'título vagas', 'center', B.iw)] : []),
        ...rows.map((r) => item(r.L, B.ix + 90, r.y + (r.h - r.L.vh) / 2, C.navy, 'vaga')),
      ] };
    }));
    // C: the chat on the badge; K: the card with the QR on the badge
    P.chat = K.chatLayout(P, { x: B.ix - 20, y: B.iy - 10, w: B.iw + 40, h: B.ih + 20, font: F.bold, fontStrong: F.head, radius: 28,
      colors: { screen: '#F2F4F7', head: NAVY, headInk: '#FFFFFF', field: '#FFFFFF', fieldInk: NAVY, bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk } });
    P.card = K.cardLayout(P, { font: F.head, bold: F.bold, noBrand: true, cx, cy: B.iy + B.ih / 2, maxW: B.iw, maxH: B.ih - 10 });

    // every act and page is a side; each turns in from the one before
    P.segs = [];
    for (const a of P.acts) {
      const n = a.pages ? a.pages.length : 1;
      for (let p = 0; p < n; p++) P.segs.push({ kind: a.kind, page: p, start: a.start + p * 2, side: sideOf(P, a.kind, p) });
    }
  }
  function sideOf(P, kind, p) {
    if (kind === 'H' || kind === 'V') return { kind: 'front', S: P.front };
    if (kind === 'I') return { kind: 'line', S: P.Is };
    if (kind === 'F') return { kind: 'line', S: P.Fs };
    if (kind === 'M') return { kind: 'list', S: P.Ms[p] };
    if (kind === 'D') return { kind: 'values', S: P.Ds[p] };
    if (kind === 'L') return { kind: 'roles', S: P.Ls[p] };
    if (kind === 'C') return { kind: 'chat' };
    return { kind: 'card' };
  }

  // ---------------------------------------------------------------- the badge
  // A side's content at lt (seconds since it turned to us); settled: its texts count.
  function side(R, P, sd, lt, settled) {
    const { ctx } = R, C = P.C, S = sd.S;
    const rr = R.rec; if (!settled) R.rec = () => {};
    if (sd.kind === 'front' && S) {
      // the photo spot: a helmet, never a face
      const sp = S.spot;
      rrect(ctx, sp.x, sp.y, sp.s, sp.s, 26); ctx.fillStyle = C.spot; ctx.fill();
      E.drawIcon(ctx, 'hard-hat', sp.x + sp.s / 2, sp.y + sp.s / 2, sp.s * 0.6, C.accent, 2.2);
    }
    if (sd.kind === 'list' && S) for (const t of S.ticks) { ctx.beginPath(); ctx.arc(t.x, t.y, 30, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill(); E.drawIcon(ctx, 'check', t.x, t.y, 36, '#FFFFFF', 3); }
    if (sd.kind === 'roles' && S) for (const t of S.hats) E.drawIcon(ctx, 'hard-hat', t.x, t.y, 52, C.accent, 2.4);
    if (S && S.items) for (const it of S.items) {
      if (it.count != null) {
        // a plain number counts up (drawn, recorded only once it has arrived)
        const n = Math.round(it.count * expoOut(win(lt, 0.1, 0.7)));
        if (n !== it.count) { const L = K.line(null, `${it.hl.prefix}${n}${it.hl.suffix}`, { font: it.L.font, size: it.L.size }); L.draw(ctx, it.x + (it.boxW - L.w) / 2, it.y, it.color, 'left', 0); continue; }
      }
      K.text(R, it.L, it.x, it.y, it.color, it.align, it.boxW, it.tag);
    }
    if (sd.kind === 'chat') K.chatDraw(R, P.chat, lt, { type0: 0.3, type1: 0.95, send: 1.0 });
    if (sd.kind === 'card') K.cardDraw(R, P.card, lt, { ink: NAVY, ctaFill: C.cta, ctaInk: C.ctaInk, hintInk: NAVY, qrDark: NAVY, qrLight: '#FFFFFF', start: 0.05 });
    R.rec = rr;
  }
  // The badge hanging on its lanyard, its face scaled by sx (0: edge-on),
  // leaning by `lean`, swung by `swing` about the lanyard's top.
  function badge(R, P, sd, lt, sx, lean, swing, settled, straps = true) {
    const { ctx } = R, B = P.B, C = P.C, cx = P.Z.W / 2;
    ctx.save();
    ctx.translate(cx, -400); ctx.rotate(swing); ctx.translate(-cx, 400);
    if (straps) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 26; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(cx - 90, -10); ctx.lineTo(cx - 14, B.y + 26); ctx.moveTo(cx + 90, -10); ctx.lineTo(cx + 14, B.y + 26); ctx.stroke();
    }
    rrect(ctx, cx - 34, B.y - 18, 68, 60, 12); ctx.fillStyle = C.clip; ctx.fill();
    ctx.translate(cx, B.y + B.h / 2); ctx.transform(sx, lean, 0, 1, 0, 0); ctx.translate(-cx, -(B.y + B.h / 2));
    rrect(ctx, B.x + 10, B.y + 16, B.w, B.h, 40); ctx.fillStyle = C.shadow; ctx.fill();
    rrect(ctx, B.x, B.y, B.w, B.h, 40); ctx.fillStyle = CARD; ctx.fill();
    ctx.save(); rrect(ctx, B.x, B.y, B.w, B.h, 40); ctx.clip();
    ctx.fillStyle = C.accent; ctx.fillRect(B.x, B.y, B.w, BAND);
    ctx.restore();
    rrect(ctx, cx - 60, B.y + 24, 120, 26, 13); ctx.fillStyle = C.bg; ctx.fill(); // the slot for the clip
    if (P.band) { const rr = R.rec; if (!settled) R.rec = () => {}; K.text(R, P.band, B.x + 60, B.y + 58 + (BAND - 70 - P.band.vh) / 2, C.onAccent, 'center', B.w - 120, 'marca'); R.rec = rr; }
    side(R, P, sd, lt, settled);
    ctx.restore();
  }
  const swingAt = (x) => (x <= 0 ? 0 : 0.012 * Math.exp(-x / 0.22) * Math.sin(x * 11));
  // A segment at lt: the badge turns from the side before (0 → TURN), then swings and settles.
  function turnTo(R, P, prev, cur, lt) {
    const th = Math.PI * expoInOut(win(lt, 0, TURN));
    const turning = prev && th < Math.PI;
    const moving = R.moving;
    if (turning) R.moving = true;
    const settled = !turning && lt >= TURN + SETTLE && !R.moving;
    if (!prev || th >= Math.PI / 2) badge(R, P, cur, Math.max(0, lt - TURN), prev ? -Math.cos(th) : 1, prev ? -0.1 * Math.sin(th) : 0, swingAt(lt - TURN), settled);
    else badge(R, P, prev.sd, prev.lt, Math.cos(th), 0.1 * Math.sin(th), 0, false);
    R.moving = moving;
  }

  // ---------------------------------------------------------------- the printer
  function printer(R, P, dy) {
    const { ctx } = R, B = P.B, cx = P.Z.W / 2;
    const y = P.slotY - 130 + dy;
    rrect(ctx, cx - B.w / 2 - 70, y, B.w + 140, 130, 30); ctx.fillStyle = P.C.printer; ctx.fill();
    rrect(ctx, cx - B.w / 2 - 20, y + 96, B.w + 40, 16, 8); ctx.fillStyle = '#05080F'; ctx.fill();
    ctx.fillStyle = P.C.accent; ctx.beginPath(); ctx.arc(cx + B.w / 2 + 20, y + 44, 12, 0, Math.PI * 2); ctx.fill();
  }
  // the badge printed out of the slot (k: 0 → 1), its straps coming out with it
  function printed(R, P, k, lt, settled) {
    const { ctx } = R, B = P.B, cx = P.Z.W / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, P.slotY, P.fmt.w, P.fmt.h); ctx.clip();
    ctx.translate(0, -(1 - k) * (B.y + B.h - P.slotY + 20));
    const moving = R.moving; if (k < 1) R.moving = true;
    ctx.strokeStyle = P.C.accent; ctx.lineWidth = 26;
    ctx.beginPath(); ctx.moveTo(cx - 70, P.slotY - 200); ctx.lineTo(cx - 14, B.y + 26); ctx.moveTo(cx + 70, P.slotY - 200); ctx.lineTo(cx + 14, B.y + 26); ctx.stroke();
    badge(R, P, { kind: 'front', S: P.front }, lt, 1, 0, 0, settled && k >= 1, false);
    R.moving = moving;
    ctx.restore();
  }
  // H: the badge is printed
  function hook(R, P, A) {
    const lt = A.lt;
    printed(R, P, expoOut(win(lt, 0.12, 1.1)), lt, lt >= 1.35);
    printer(R, P, 0);
  }
  // the printer going up and away as the first turn starts
  const printerAway = (R, P, before, lt) => { if (before && before.kind === 'H' && lt < 0.45) printer(R, P, -expoIn(win(lt, 0, 0.4)) * (P.slotY + 20)); };

  // ---------------------------------------------------------------- the acts
  // every act after the first: its side turns in from the one before
  function segAct(R, A) {
    const P = R.P;
    const pg = A.pages ? K.page(A) : { index: 0, lt: A.lt };
    const i = P.segs.findIndex((s) => s.kind === A.kind && s.page === pg.index);
    const seg = P.segs[i], before = P.segs[i - 1];
    turnTo(R, P, before ? { sd: before.side, lt: 9 } : null, seg.side, pg.lt);
    printerAway(R, P, before, pg.lt);
  }
  // V: a full turn to the front, then it settles
  function fullTurn(R, P, A) {
    const lt = A.lt;
    const i = P.segs.findIndex((s) => s.kind === 'V'), before = P.segs[i - 1];
    const front = { kind: 'front', S: P.front };
    if (lt < 1.0) {
      const th = 2 * Math.PI * expoInOut(win(lt, 0, 1.0));
      const moving = R.moving; R.moving = true;
      badge(R, P, th < Math.PI / 2 && before ? before.side : front, 9, Math.max(1e-3, Math.abs(Math.cos(th))), -0.12 * Math.sin(th), 0, false);
      R.moving = moving;
      printerAway(R, P, before, lt);
      return;
    }
    badge(R, P, front, 9, 1, 0, swingAt(lt - 1.0), lt >= 1.0 + SETTLE && !R.moving);
  }
  // O: the printer comes back; the badge goes up into its slot — the first frame
  function loop(R, P, A) {
    const lt = A.lt, Ka = P.act('K');
    printed(R, P, 1 - expoInOut(win(lt, 0.3, 0.6)), Ka.d, false);
    printer(R, P, -(1 - expoOut(win(lt, 0, 0.32))) * (P.slotY + 20));
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const bass = [65.41, 55, 49, 58.27];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 140, f1: 45, dur: 0.3, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 9000, dur: 0.03, gain: 0.06 });
      if (b % 2 === 1) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 1800, q: 1, dur: 0.1, gain: 0.16 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'square', dur: 0.25, gain: 0.11, lp: 700 });
    }
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 300, f1: 5000, gain: 0.22 });
    // the printer feeding the badge; a whoosh for every turn, a soft hit when it faces us
    for (let t = 0.12; t < 1.2; t += 0.05) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 900, q: 6, dur: 0.04, gain: 0.08 });
    for (const s of P.segs.slice(1)) if (s.kind !== 'O') ev.push({ t: s.start, kind: 'riser', f0: 600, f1: 2400, dur: TURN, gain: 0.16 }, { t: s.start + TURN, kind: 'kick', f0: 160, f1: 60, dur: 0.16, gain: 0.32 });
    const C = P.act('C');
    if (C) {
      for (let t = 0.75; t < 1.4; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.45, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    const O = P.act('O');
    for (let t = 0.3; t < 0.9; t += 0.05) ev.push({ t: O.start + t, kind: 'noise', filter: 'bandpass', f: 900, q: 6, dur: 0.04, gain: 0.08 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  const L7 = (pt, de, fr, it, en, es) => ({ 'pt-PT': pt, 'de-CH': de, 'de-DE': de, fr, it, en, es });
  RS.motion.register({
    id: 'cracha', name: 'Crachá', concept: 'Um crachá de obra sai da impressora, vira em 3D e mostra o anúncio nas suas faces; o QR está no crachá.',
    font: { head: { family: 'DM Sans', weight: 700 }, bold: { family: 'DM Sans', weight: 500 } },
    palettes: { dark: { bg: '#16213A', ink: '#FFFFFF', main: '#FFFFFF', accent: '#F25C05' } },
    bgModes: ['dark'], photos: 0, travel: 'flip', pages: true, continuous: true,
    labels: { role: L7('FUNÇÃO', 'FUNKTION', 'POSTE', 'RUOLO', 'ROLE', 'PUESTO') },
    colors(c) {
      // a white badge with navy words; the band, the lanyard and the icons in the highlight colour
      c.navy = NAVY;
      c.accent = U.ensureContrast(c.accent, '#FFFFFF', 3);
      c.accentInk = U.ensureContrast(c.accent, '#FFFFFF', 4.5);
      c.onAccent = U.ensureContrast('#FFFFFF', c.accent, 3);
      c.spot = U.mix(c.accent, '#FFFFFF', 0.85);
      c.clip = '#B9C0CC';
      c.shadow = U.mix(c.bg, '#000000', 0.45);
      c.printer = U.mix(c.bg, '#FFFFFF', 0.12);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => hook(R, R.P, A),
      I: segAct, M: segAct, D: segAct, L: segAct, F: segAct, C: segAct, K: segAct,
      V: (R, A) => fullTurn(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
