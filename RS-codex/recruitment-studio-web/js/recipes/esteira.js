// Video recipe «Esteira»: a conveyor belt carries a box for every part of the
// ad; a press stamps each one; the last box opens into the contact. Camera
// language: a fixed factory side view; the belt moves one box along at every
// act and every page (a box comes in from the left as the one before leaves
// on the right); the press comes down on the box that stops under it.
// Acts (see RS.motion.register): H the headline's box; I and F his lines; M
// the benefits; V the box turns round on the belt; D the highlights; L the
// positions; C a box opens and the phone rises out of it; K the card rises
// from it; O the card goes back in, the box closes and leaves — the empty
// belt, the first frame.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, expoIn, expoInOut, lerp, rrect } = K;
  const MOVE = 0.45, HIT = 0.62, PERIOD = 60, DEPTH = 46, BAND = 120, PADB = 46;

  // ---------------------------------------------------------------- layout helpers
  const item = (L, x, y, color, tag, align = 'left', boxW = 0) => ({ L, x, y, color, tag, align, boxW });
  function stack(blocks, top, gap) {
    let y = top;
    for (const b of blocks) { b.y = y; y += b.h + gap; }
    return blocks.reduce((a, b) => a + b.h, 0) + gap * Math.max(0, blocks.length - 1);
  }
  function fitTo(h, make) { for (let k = 1; ; k -= 0.08) { const s = make(k); if (s.h <= h || k <= 0.5) return s; } }
  const sz = (k, max, min) => Math.max(min, max * k);

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    P.beltY = Z.bottom - (Z.story ? 130 : 100);
    P.low = Z.story ? 240 : 150;
    const bw = Z.w - 40, bx = Z.W / 2 - bw / 2 - DEPTH / 2;
    P.bw = bw; P.bx = bx;
    P.travel = PERIOD * Math.ceil(((Z.W + bw) / 2 + 160) / PERIOD); // a box's way along the belt
    const maxH = P.beltY - (Z.top + 150);
    const iw = bw - 80, ix = bx + 40;
    const fit = (t, o) => K.fit(P, t, { font: F.head, lh: 1.04, maxW: iw, ...o, maxSize: Math.max(o.minSize, o.maxSize) });
    // a box: its height and its texts, placed from its top (y = 0) down
    // (a box is at least 62 % of the height it may have; its words in its middle)
    const box = (make) => fitTo(maxH, (k) => {
      const s = make(k), gap = s.gap || 28;
      const H = s.blocks.reduce((a, b) => a + b.h, 0) + gap * Math.max(0, s.blocks.length - 1);
      const h = Math.max(BAND + 10 + H + PADB, Math.min(maxH, maxH * 0.62));
      stack(s.blocks, BAND + 10 + (h - (BAND + 10 + H + PADB)) / 2, gap);
      return { ...s, h: BAND + 10 + H + PADB > maxH ? BAND + 10 + H + PADB : h };
    });
    const ink = C.boxInk;
    P.Hb = box((k) => {
      const kick = c.kicker ? fit(c.kicker, { upper: true, track: 0.04, maxSize: sz(k, 54, 40), minSize: 40, maxLines: 2 }) : null;
      const head = fit(c.headline || c.brandName || ' ', { upper: P.upper, maxSize: sz(k, 140, 60), minSize: 60, maxLines: 5 });
      const blocks = [...(kick ? [{ h: kick.vh, L: kick, tag: 'chamada' }] : []), { h: head.vh, L: head, tag: 'título' }];
      return { blocks, items: () => blocks.map((b) => item(b.L, ix, b.y, ink, b.tag, 'center', iw)) };
    });
    const lineBox = (t, tag) => (t ? box((k) => { const L = fit(t, { maxSize: sz(k, 96, 48), minSize: 48, maxLines: 7 }); const blocks = [{ h: L.vh, L }]; return { blocks, items: () => [item(L, ix, blocks[0].y, ink, tag, 'center', iw)] }; }) : null);
    P.Ib = P.act('I') ? lineBox(c.intro, 'intro') : null;
    P.Fb = P.act('F') ? lineBox(c.closing, 'fecho') : null;
    const rowsBox = (texts, items, o) => box((k) => {
      const title = o.title ? fit(o.title, { upper: true, track: 0.04, maxSize: sz(k, 60, 44), minSize: 44, maxLines: 2 }) : null;
      const rows = items.map((i) => { const L = fit(texts[i], { upper: P.upper, maxSize: sz(k, o.max, 44), minSize: 44, maxW: iw - 86, maxLines: 3 }); return { h: Math.max(64, L.vh), L }; });
      const blocks = [...(title ? [{ h: title.vh, L: title, title: true }] : []), ...rows];
      return {
        blocks, gap: 30, icon: o.icon,
        items: () => blocks.map((b) => (b.title ? item(b.L, ix, b.y, ink, 'título vagas', 'center', iw) : item(b.L, ix + 86, b.y + (b.h - b.L.vh) / 2, ink, o.tag))),
        icons: () => rows.map((r) => ({ x: ix + 32, y: r.y + r.h / 2 })),
      };
    });
    P.Ms = (Ma ? Ma.pages : []).map((items) => rowsBox(c.benefits, items, { max: 100, tag: 'vantagem', icon: 'check' }));
    P.Ls = (La ? La.pages : []).map((items) => rowsBox(c.positions, items, { max: 90, tag: 'vaga', icon: 'hard-hat', title: c.positionsTitle }));
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    P.Ds = (Da ? Da.pages : []).map((items) => box((k) => {
      const blocks = [];
      for (const i of items) {
        const h = c.highlights[i];
        blocks.push({ L: fit(h.value || h.label, { maxSize: sz(k, 150, 70), minSize: 70, maxLines: 2, lh: 1 }), tag: tagOf(h), count: h.value && h.count != null ? h.count : null, hl: h });
        if (h.value && h.label) blocks.push({ L: fit(h.label, { upper: P.upper, maxSize: sz(k, 58, 44), minSize: 44, maxLines: 2 }), tag: h.role === 'salary' ? 'período' : 'rótulo' });
      }
      blocks.forEach((b) => { b.h = b.L.vh; });
      return { blocks, gap: 22, items: () => blocks.map((b) => ({ ...item(b.L, ix, b.y, ink, b.tag, 'center', iw), count: b.count, hl: b.hl })) };
    }));
    P.Vb = box((k) => { const L = fit(c.brandName || c.headline || ' ', { upper: P.upper, maxSize: sz(k, 150, 60), minSize: 60, maxLines: 3 }); const blocks = [{ h: L.vh, L }]; return { blocks, items: () => [item(L, ix, blocks[0].y, ink, c.brandName ? 'marca' : 'título', 'center', iw)] }; });
    P.stampL = K.fit(P, P.label('stamp'), { font: F.head, upper: true, track: 0.06, maxSize: 56, minSize: 40, maxW: Math.min(560, bw - 260), maxLines: 1 });

    // C, K: a low box opens; the phone, then the card, rise out of it
    const boxTop = P.beltY - P.low, sunk = boxTop + 60; // what rises keeps its foot inside the box
    const ph = Math.min(1100, sunk - Z.top - 10), pw = Math.min(760, Z.w - 40);
    P.phone = { x: Z.W / 2 - pw / 2 - DEPTH / 2, y: sunk - ph, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.head, fontStrong: F.head, radius: (64 * pw) / 760,
      colors: { screen: '#FFFFFF', head: '#111315', headInk: '#FFFFFF', field: '#ECEDEE', fieldInk: '#111315', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: '#111315' } });
    const panelW = Z.w, room = boxTop - Z.top - 50, cx = Z.W / 2 - DEPTH / 2;
    let card = K.cardLayout(P, { font: F.head, bold: F.head, upper: P.upper, maxW: panelW - 80, maxH: room, cx, cy: Z.top + 20 + room / 2 });
    if (card.h > room) card = K.cardLayout(P, { font: F.head, bold: F.head, upper: P.upper, noBrand: true, maxW: panelW - 80, maxH: room, cx, cy: Z.top + 20 + room / 2 });
    P.card = card;
    P.panel = { x: cx - panelW / 2, y: card.top - 30, w: panelW, h: sunk - (card.top - 30) };

    // the belt's moves: every act and page brings a box (K reuses C's)
    P.segs = [];
    let moves = 0;
    for (const a of P.acts) {
      if (a.kind === 'O') continue;
      const n = a.pages ? a.pages.length : 1;
      for (let p = 0; p < n; p++) {
        const moving = !(a.kind === 'K' && P.act('C'));
        P.segs.push({ kind: a.kind, page: p, start: a.start + p * 2, box: boxOf(P, a.kind, p), moves: moving, before: moves });
        if (moving) moves++;
      }
    }
    P.moves = moves;
  }
  function boxOf(P, kind, p) {
    if (kind === 'H') return P.Hb;
    if (kind === 'I') return P.Ib;
    if (kind === 'F') return P.Fb;
    if (kind === 'M') return P.Ms[p];
    if (kind === 'D') return P.Ds[p];
    if (kind === 'L') return P.Ls[p];
    if (kind === 'V') return P.Vb;
    return { low: true, h: P.low };
  }

  // ---------------------------------------------------------------- the factory
  function belt(R, P, offset) {
    const { ctx } = R, C = P.C, y = P.beltY, W = P.fmt.w;
    ctx.fillStyle = C.frame; ctx.fillRect(0, y + 40, W, 24);
    for (let x = 60; x < W; x += 240) ctx.fillRect(x, y + 64, 26, P.fmt.h - y);
    ctx.fillStyle = C.beltBody; ctx.fillRect(0, y, W, 40);
    ctx.fillStyle = C.beltLine;
    const o = ((offset % PERIOD) + PERIOD) % PERIOD;
    for (let x = -PERIOD + o; x < W; x += PERIOD) ctx.fillRect(x, y + 6, 14, 28);
    for (let x = 40; x < W; x += 160) { ctx.beginPath(); ctx.arc(x, y + 52, 18, 0, Math.PI * 2); ctx.fillStyle = C.roller; ctx.fill(); ctx.beginPath(); ctx.arc(x, y + 52, 6, 0, Math.PI * 2); ctx.fillStyle = C.frame; ctx.fill(); }
  }
  // the press: its head comes down by `down` (0 up, 1 on the box's top)
  function press(R, P, down, boxTop) {
    const { ctx } = R, C = P.C, cx = P.Z.W / 2 - DEPTH / 2, hw = 170, hh = 96;
    const restY = P.Z.top - (P.Z.story ? 60 : 30);
    const y = lerp(restY, boxTop - hh, down);
    ctx.fillStyle = C.frame; ctx.fillRect(cx - 22, -20, 44, y + 20);
    rrect(ctx, cx - hw, y, hw * 2, hh, 14); ctx.fillStyle = C.press; ctx.fill();
    ctx.save(); rrect(ctx, cx - hw, y, hw * 2, hh, 14); ctx.clip();
    ctx.fillStyle = C.hazard;
    for (let x = cx - hw - 60; x < cx + hw; x += 60) { ctx.beginPath(); ctx.moveTo(x, y + hh); ctx.lineTo(x + 30, y + hh); ctx.lineTo(x + 60, y + hh - 26); ctx.lineTo(x + 30, y + hh - 26); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // A box with its front at x, h tall, standing on the belt; returns its top.
  // o = { stamped, lt, settled, open (0–1), inside(y) }
  function boxDraw(R, P, B, x, h, o) {
    const { ctx } = R, C = P.C, w = P.bw, y = P.beltY - h;
    ctx.fillStyle = C.boxSide;
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + DEPTH, y - DEPTH * 0.6); ctx.lineTo(x + w + DEPTH, P.beltY - DEPTH * 0.6); ctx.lineTo(x + w, P.beltY); ctx.closePath(); ctx.fill();
    const open = o.open || 0;
    ctx.fillStyle = open > 0 ? C.boxInside : C.boxTop;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + DEPTH, y - DEPTH * 0.6); ctx.lineTo(x + w + DEPTH, y - DEPTH * 0.6); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    if (o.inside) o.inside(y); // what rises out of the box, behind its front
    if (open > 0) {
      // the flaps swing up and out
      ctx.fillStyle = C.boxTop;
      const fh = 120 * open;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - fh * 0.5, y - fh); ctx.lineTo(x + w * 0.3 - fh * 0.5, y - fh); ctx.lineTo(x + w * 0.3, y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w * 0.7, y); ctx.lineTo(x + w * 0.7 + fh * 0.5, y - fh); ctx.lineTo(x + w + fh * 0.5, y - fh); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = C.box; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.boxTape; ctx.fillRect(x + w / 2 - 40, y, 80, Math.min(h, 70));
    if (!B || B.low) return y;
    const rr = R.rec; if (!o.settled) R.rec = () => {};
    ctx.save(); ctx.translate(x - P.bx, y);
    if (B.icons) for (const ic of B.icons()) { ctx.beginPath(); ctx.arc(ic.x, ic.y, 28, 0, Math.PI * 2); ctx.fillStyle = C.boxInk; ctx.fill(); E.drawIcon(ctx, B.icon, ic.x, ic.y, 34, C.box, 3); }
    for (const it of B.items()) {
      if (it.count != null) {
        // a plain number counts up (drawn, recorded once it has arrived)
        const n = Math.round(it.count * expoOut(win(o.lt, MOVE, 0.7)));
        if (n !== it.count) { const L = K.line(null, `${it.hl.prefix}${n}${it.hl.suffix}`, { font: it.L.font, size: it.L.size }); L.draw(ctx, it.x + (it.boxW - L.w) / 2, it.y, it.color, 'left', 0); continue; }
      }
      K.text(R, it.L, it.x, it.y, it.color, it.align, it.boxW, it.tag);
    }
    // the stamp, once the press has come down
    if (o.stamped) {
      const S = P.stampL, sw = S.w + 70, sh = S.vh + 50, sx = P.bx + w / 2 - sw / 2, sy = (BAND - sh) / 2;
      ctx.save(); ctx.translate(sx + sw / 2, sy + sh / 2); ctx.rotate(-0.06); ctx.translate(-sw / 2, -sh / 2);
      rrect(ctx, 0, 0, sw, sh, 10); ctx.lineWidth = 7; ctx.strokeStyle = C.boxInk; ctx.stroke();
      K.text(R, S, 35, 25, C.boxInk, 'left', 0, 'carimbo');
      ctx.restore();
    }
    ctx.restore();
    R.rec = rr;
    return y;
  }

  // ---------------------------------------------------------------- the acts
  const beltAt = (P, seg, lt) => P.travel * (seg.before + (seg.moves ? expoInOut(win(lt, 0, MOVE)) : 0));
  const segOf = (P, A) => {
    const pg = A.pages ? K.page(A) : { index: 0, lt: A.lt };
    const i = P.segs.findIndex((s) => s.kind === A.kind && s.page === pg.index);
    return { seg: P.segs[i], before: P.segs[i - 1], lt: pg.lt };
  };
  // the box before, off to the right with the belt
  const leaving = (R, P, before, e) => { if (before && e < 1) boxDraw(R, P, before.box, P.bx + e * P.travel, before.box.h, { stamped: !before.box.low, lt: 9, open: before.box.low ? 1 : 0 }); };
  // A belt act: this box comes to the press as the one before leaves; the press stamps it.
  function beltAct(R, A) {
    const P = R.P, { seg, before, lt } = segOf(P, A);
    const e = expoInOut(win(lt, 0, MOVE));
    const moving = R.moving; if (e < 1) R.moving = true;
    belt(R, P, beltAt(P, seg, lt));
    leaving(R, P, before, e);
    const B = seg.box;
    const top = boxDraw(R, P, B, P.bx - (1 - e) * P.travel, B.h, { stamped: lt >= HIT, lt, settled: e >= 1 && lt >= HIT + 0.05 });
    R.moving = moving;
    const down = lt < HIT ? expoIn(win(lt, HIT - 0.14, 0.14)) : 1 - expoOut(win(lt, HIT, 0.22));
    press(R, P, e >= 1 ? down : 0, top);
  }
  // V: the box comes to the press, is stamped, then turns round on the belt
  function turnAct(R, A) {
    const P = R.P, lt = A.lt, { ctx } = R;
    if (lt < 0.85) { beltAct(R, A); return; }
    const { seg } = segOf(P, A);
    belt(R, P, beltAt(P, seg, lt));
    const th = 2 * Math.PI * expoInOut(win(lt, 0.85, 0.9));
    const moving = R.moving; if (th > 0 && th < 2 * Math.PI) R.moving = true;
    const cx = P.bx + P.bw / 2;
    ctx.save(); ctx.translate(cx, 0); ctx.scale(Math.max(0.02, Math.abs(Math.cos(th))), 1); ctx.translate(-cx, 0);
    const top = boxDraw(R, P, P.Vb, P.bx, P.Vb.h, { stamped: true, lt: 9, settled: !R.moving });
    ctx.restore();
    R.moving = moving;
    press(R, P, 0, top);
  }
  // C: a low box comes and opens; the phone rises out of it; the chat plays
  function chatAct(R, A) {
    const P = R.P, { ctx } = R, { seg, before, lt } = segOf(P, A);
    const e = expoInOut(win(lt, 0, MOVE));
    belt(R, P, beltAt(P, seg, lt));
    const moving = R.moving; if (e < 1) R.moving = true;
    leaving(R, P, before, e);
    const rise = expoOut(win(lt, 0.6, 0.4));
    boxDraw(R, P, seg.box, P.bx - (1 - e) * P.travel, P.low, { open: expoOut(win(lt, MOVE, 0.2)), lt, inside: (y) => {
      if (rise <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, P.fmt.w, y + 4); ctx.clip();
      ctx.translate(0, (1 - rise) * (P.phone.h + 80));
      const m = R.moving; if (rise < 1) R.moving = true;
      K.chatDraw(R, P.chat, lt, { type0: 1.0, type1: 1.5, send: 1.55 });
      R.moving = m;
      ctx.restore();
    } });
    R.moving = moving;
    press(R, P, 0, P.beltY - P.low);
  }
  const cardInk = (P) => ({ ink: P.C.panelInk, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: P.C.panelInk, qrDark: '#111315', qrLight: '#FFFFFF' });
  // the card's panel risen out of the box by k (hidden below the box's top)
  function panel(R, P, y, k, lt, start, settled) {
    if (k <= 0) return;
    const { ctx } = R, S = P.panel;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, P.fmt.w, y + 4); ctx.clip();
    ctx.translate(0, (1 - k) * (S.h + 80));
    rrect(ctx, S.x, S.y, S.w, S.h, 30); ctx.fillStyle = P.C.panel; ctx.fill();
    const rr = R.rec; if (!settled) R.rec = () => {};
    K.cardDraw(R, P.card, lt, { ...cardInk(P), start });
    R.rec = rr;
    ctx.restore();
  }
  // K: the phone goes back into the box, the card rises out of it
  function cardAct(R, A) {
    const P = R.P, { ctx } = R, { seg, before, lt } = segOf(P, A);
    const same = !seg.moves;
    const e = same ? 1 : expoInOut(win(lt, 0, MOVE));
    belt(R, P, beltAt(P, seg, lt));
    const moving = R.moving; if (e < 1) R.moving = true;
    if (!same) leaving(R, P, before, e);
    const t0 = same ? 0.3 : MOVE + 0.15;
    const k = expoOut(win(lt, t0, 0.4));
    boxDraw(R, P, { low: true }, P.bx - (1 - e) * P.travel, P.low, { open: same ? 1 : expoOut(win(lt, MOVE, 0.2)), lt, inside: (y) => {
      if (same && lt < 0.32) {
        const sink = expoIn(win(lt, 0, 0.3));
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, P.fmt.w, y + 4); ctx.clip(); ctx.translate(0, sink * (P.phone.h + 80));
        const m = R.moving; R.moving = true; const rr = R.rec; R.rec = () => {};
        K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true });
        R.rec = rr; R.moving = m; ctx.restore();
      }
      panel(R, P, y, k, lt, t0 + 0.35, k >= 1 && !R.moving);
    } });
    R.moving = moving;
    press(R, P, 0, P.beltY - P.low);
  }
  // O: the card goes back into the box, the box closes and leaves — the empty belt
  function loop(R, A) {
    const P = R.P, lt = A.lt, Ka = P.act('K');
    const kSeg = P.segs.find((s) => s.kind === 'K');
    const e = expoInOut(win(lt, 0.45, 0.5));
    belt(R, P, P.travel * (P.moves + e));
    const moving = R.moving; R.moving = true;
    const k = 1 - expoIn(win(lt, 0, 0.32));
    boxDraw(R, P, { low: true }, P.bx + e * P.travel, P.low, { open: 1 - expoInOut(win(lt, 0.28, 0.18)), lt: 9, inside: (y) => panel(R, P, y, k, Ka.d, (kSeg && !kSeg.moves ? 0.3 : MOVE + 0.15) + 0.35, false) });
    R.moving = moving;
    press(R, P, 0, P.beltY - P.low);
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const bass = [55, 55, 65.41, 49];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 150, f1: 44, drop: 0.1, dur: 0.3, gain: 0.85 });
      if (b % 2 === 1) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 1500, q: 1, dur: 0.12, gain: 0.2 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 8000, dur: 0.04, gain: 0.06 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'sawtooth', dur: 0.22, gain: 0.14, lp: 650 });
    }
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 250, f1: 6500, gain: 0.26 });
    // the belt moving (a motor), the press (a hiss, a slam)
    for (const s of P.segs) {
      if (s.moves) ev.push({ t: s.start, kind: 'riser', f0: 180, f1: 420, dur: MOVE, gain: 0.14, wave: 'sawtooth', lp: 900 });
      if (!s.box.low) ev.push({ t: s.start + HIT - 0.14, kind: 'noise', filter: 'highpass', f: 3000, dur: 0.14, gain: 0.1 }, { t: s.start + HIT, kind: 'kick', f0: 110, f1: 38, dur: 0.3, gain: 0.7 }, { t: s.start + HIT, kind: 'noise', filter: 'lowpass', f: 800, dur: 0.14, gain: 0.4 });
    }
    const C = P.act('C');
    if (C) {
      for (let t = 1.0; t < 1.5; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.55, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    ev.push({ t: P.act('O').start + 0.45, kind: 'riser', f0: 180, f1: 420, dur: 0.5, gain: 0.14, wave: 'sawtooth', lp: 900 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  const L7 = (pt, de, fr, it, en, es) => ({ 'pt-PT': pt, 'de-CH': de, 'de-DE': de, fr, it, en, es });
  RS.motion.register({
    id: 'esteira', name: 'Esteira', concept: 'Uma passadeira leva caixas com as palavras do anúncio; uma prensa carimba-as; a última caixa abre-se no contacto.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Anton', weight: 400 } },
    palettes: { dark: { bg: '#2B2F33', ink: '#FFFFFF', main: '#F25C05', accent: '#F25C05' } },
    bgModes: ['dark'], photos: 0, travel: 'whip', pages: true, continuous: true,
    labels: { stamp: L7('CONTRATADO', 'EINGESTELLT', 'EMBAUCHÉ', 'ASSUNTO', 'HIRED', 'CONTRATADO') },
    colors(c) {
      // the boxes in the main colour with black words; the press hazard-striped
      if (c.accentPicked) c.main = c.accent;
      c.box = c.main;
      c.boxInk = U.contrast(c.main, '#111315') >= 4.5 ? '#111315' : '#FFFFFF';
      c.boxTop = U.mix(c.main, '#FFFFFF', 0.18);
      c.boxSide = U.mix(c.main, '#000000', 0.3);
      c.boxInside = U.mix(c.main, '#000000', 0.55);
      c.boxTape = U.mix(c.main, '#000000', 0.12);
      c.frame = '#16181A'; c.beltBody = '#1E2124'; c.beltLine = '#3A3F44'; c.roller = '#555B61';
      c.press = '#3B4046'; c.hazard = c.main;
      c.panel = '#FFFFFF'; c.panelInk = '#111315';
      return c;
    },
    prepare,
    acts: { H: beltAct, I: beltAct, M: beltAct, D: beltAct, L: beltAct, F: beltAct, V: turnAct, C: chatAct, K: cardAct, O: loop },
    sound,
  });
})();
