// Video recipe «Grua»: a tower crane lowers every piece of the ad on its hook
// and sets it on the building. Camera language: a fixed side view; the
// camera follows the hook up and down (the building rises page by page);
// what hangs swings like a pendulum and settles within half a second.
// Acts (see RS.motion.register): H the headline's board comes down; I and F
// his lines on a board; M every benefit is a floor set on the building; V the
// finished building, seen whole, gains its depth; D the highlights on signs
// hung one under the other; L the positions on plates; C the hook lowers the
// phone; K the card's board; O the board is lifted away and the headline's
// board comes back down to where the video began.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, expoIn, expoInOut, lerp, rrect } = K;
  const JIB = 56, SLING = 64, DROP = 0.42, FRAME = 10;

  // ---------------------------------------------------------------- motion
  // A load's swing (radians) x seconds after it starts to come down: a
  // pendulum that settles within half a second of arriving.
  const swing = (x, a = 0.07) => (x <= 0 ? 0 : a * Math.exp(-Math.max(0, x - DROP) / 0.12) * Math.sin(x * 17) * Math.min(1, x / 0.15));
  // the hook's height while a load comes down from above the frame (from) to its place (to)
  const down = (lt, t0, from, to) => lerp(from, to, expoOut(win(lt, t0, DROP)));

  // ---------------------------------------------------------------- the crane
  function lattice(ctx, x, y, w, h, vertical, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 4; ctx.beginPath();
    if (vertical) for (let yy = y; yy < y + h; yy += w) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + w); ctx.moveTo(x, yy + w); ctx.lineTo(x + w, yy + w); }
    else for (let xx = x, k = 0; xx < x + w; xx += h, k++) { ctx.moveTo(xx, y + (k % 2 ? 0 : h)); ctx.lineTo(xx + h, y + (k % 2 ? h : 0)); }
    ctx.stroke();
  }
  // The mast on the left, the jib along the top, the trolley over tx and the
  // cable down to the hook at (tx, hy) (the point the slings hang from).
  function crane(R, P, tx, hy) {
    const { ctx } = R, C = P.C;
    lattice(ctx, P.mastX, P.jibY + JIB, 84, P.fmt.h - P.jibY, true, C.main);
    lattice(ctx, -60, P.jibY, P.fmt.w + 120, JIB, false, C.main);
    // the cab at the top of the mast
    rrect(ctx, P.mastX - 10, P.jibY + JIB, 104, 86, 10); ctx.fillStyle = C.main; ctx.fill();
    ctx.fillStyle = C.glass; ctx.fillRect(P.mastX + 8, P.jibY + JIB + 16, 68, 40);
    // the trolley, the cable, the hook block
    ctx.fillStyle = C.steel; ctx.fillRect(tx - 40, P.jibY + JIB, 80, 26);
    ctx.strokeStyle = C.steel; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(tx - 10, P.jibY + JIB + 26); ctx.lineTo(tx - 10, hy - 52); ctx.moveTo(tx + 10, P.jibY + JIB + 26); ctx.lineTo(tx + 10, hy - 52); ctx.stroke();
    rrect(ctx, tx - 30, hy - 56, 60, 44, 8); ctx.fillStyle = C.main; ctx.fill();
    ctx.lineWidth = 9; ctx.strokeStyle = C.steel; ctx.beginPath(); ctx.arc(tx, hy - 4, 14, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke();
  }
  // a load of size w × h hanging from the hook at (hx, hy), swung by theta; draw() at its top-left
  function hanging(R, P, hx, hy, theta, w, h, draw) {
    const { ctx } = R;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(theta);
    ctx.strokeStyle = P.C.steel; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-w / 2 + 30, SLING); ctx.moveTo(0, 0); ctx.lineTo(w / 2 - 30, SLING); ctx.stroke();
    ctx.translate(-w / 2, SLING);
    draw();
    ctx.restore();
  }
  // A board (framed in the crane's colour, four bolts) with its texts; they
  // count as shown once it has settled.
  function board(R, P, B, settled) {
    const { ctx } = R, C = P.C;
    rrect(ctx, 0, 0, B.w, B.h, 18); ctx.fillStyle = C.main; ctx.fill();
    rrect(ctx, FRAME, FRAME, B.w - FRAME * 2, B.h - FRAME * 2, 12); ctx.fillStyle = B.fill || '#FFFFFF'; ctx.fill();
    ctx.fillStyle = C.steel;
    for (const [x, y] of [[26, 26], [B.w - 26, 26], [26, B.h - 26], [B.w - 26, B.h - 26]]) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
    const rr = R.rec; if (!settled) R.rec = () => {};
    for (const t of B.texts) {
      if (t.count != null) {
        // a plain number counts up (drawn, recorded only once it has arrived)
        const n = Math.round(t.count * expoOut(win(B.lt || 0, 0.25, 0.7)));
        if (n !== t.count) { const L = K.line(null, `${t.hl.prefix}${n}${t.hl.suffix}`, { font: t.L.font, size: t.L.size }); L.draw(ctx, (B.w - L.w) / 2, t.y, t.color, 'left', 0); continue; }
      }
      K.text(R, t.L, B.pad, t.y, t.color, 'center', B.w - B.pad * 2, t.tag);
    }
    R.rec = rr;
  }
  // a board from texts [{ text, font, max, min, color, tag, lines, upper, count?, hl? }], width w
  function makeBoard(P, w, parts, o = {}) {
    const pad = 46;
    let y = pad;
    const texts = parts.filter((p) => p.text).map((p) => {
      const min = p.min || 44;
      const L = K.fit(P, p.text, { font: p.font, upper: !!p.upper, maxSize: Math.max(min, p.max), minSize: min, maxW: w - pad * 2, maxLines: p.lines || 3, lh: 1.06 });
      const t = { L, y, color: p.color, tag: p.tag, count: p.count, hl: p.hl };
      y += L.vh + 22;
      return t;
    });
    return { w, h: y - 22 + pad, pad, texts, fill: o.fill };
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    P.jibY = Z.top - (Z.story ? 30 : 0);
    P.mastX = 18;
    P.hookTop = P.jibY + JIB + 150; // the hook's highest place in the frame
    const bw = Z.w - 40;
    P.cx = Z.W / 2;
    const room = Z.bottom - (P.hookTop + SLING) - 10; // what a load may measure
    const fitBoard = (make) => { for (let k = 1; ; k -= 0.1) { const B = make(k); if (B.h <= room || k <= 0.6) return B; } };
    // H: the headline (the kicker above it, in the highlight colour)
    P.Hb = fitBoard((k) => makeBoard(P, bw, [
      { text: c.kicker, font: F.bold, max: 50 * k, min: 40, color: C.accentInk, tag: 'chamada', upper: true, lines: 2 },
      { text: c.headline || c.brandName || ' ', font: F.head, max: 120 * k, min: 56, color: C.boardInk, tag: 'título', upper: P.upper, lines: 4 },
    ]));
    P.Hfrom = P.hookTop - 40 - P.Hb.h * 0.5; // high under the jib (the first frame)
    P.Hto = Z.cy - P.Hb.h / 2 - SLING;
    const lineBoard = (text, tag) => (text ? fitBoard((k) => makeBoard(P, bw, [{ text, font: F.head, max: 90 * k, min: 48, color: C.boardInk, tag, lines: 6 }])) : null);
    P.Ib = P.act('I') ? lineBoard(c.intro, 'intro') : null;
    P.Fb = P.act('F') ? lineBoard(c.closing, 'fecho') : null;

    // M: every benefit a floor of the building, bottom up, in pages
    const fw = Z.w - 120, fx = Z.left + 120;
    P.building = { x: fx, w: fw };
    P.floors = [];
    let wy = 0;
    (Ma ? Ma.pages : []).forEach((items, p) => items.forEach((i) => {
      const L = K.fit(P, c.benefits[i], { font: F.head, upper: P.upper, maxSize: 66, minSize: 44, maxW: fw - 90, maxLines: 3, lh: 1.05 });
      const h = Math.max(150, L.vh + 70);
      P.floors.push({ L, h, y0: wy, page: p, icon: c.icons[i] || 'check' });
      wy += h + 14;
    }));
    P.ground = Z.bottom;
    // the camera per page: the top of the page's floors stays under the hook's room
    P.camOf = (p) => {
      const top = Math.max(0, ...P.floors.filter((f) => f.page <= p).map((f) => f.y0 + f.h));
      return Math.max(0, top - (P.ground - (P.hookTop + SLING + 60)));
    };

    // D: the highlights on signs hung one under the other; L: the positions on plates
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    const chain = (boards) => { let y = 0; return boards.map((B) => { const r = { B, y }; y += B.h + 40; return r; }); };
    const chainH = (ch) => ch.reduce((a, r) => Math.max(a, r.y + r.B.h), 0);
    const fitChain = (make) => { for (let k = 1; ; k -= 0.1) { const ch = chain(make(k)); if (chainH(ch) <= room || k <= 0.5) return ch; } };
    P.Ds = (Da ? Da.pages : []).map((items) => fitChain((k) => items.map((i) => {
      const h = c.highlights[i];
      return makeBoard(P, bw, [
        { text: h.value || h.label, font: F.head, max: 150 * k, min: 64, color: C.boardMain, tag: tagOf(h), lines: 2, count: h.value && h.count != null ? h.count : null, hl: h },
        { text: h.value ? h.label : '', font: F.bold, max: 64 * k, min: 44, color: C.boardInk, tag: h.role === 'salary' ? 'período' : 'rótulo', upper: P.upper, lines: 2 },
      ]);
    })));
    P.Ls = (La ? La.pages : []).map((items) => fitChain((k) => [
      ...(c.positionsTitle ? [makeBoard(P, bw, [{ text: c.positionsTitle, font: F.head, max: 64 * k, min: 44, color: C.boardInk, tag: 'título vagas', upper: P.upper, lines: 2 }], { fill: C.main })] : []),
      ...items.map((i) => makeBoard(P, bw - 80, [{ text: c.positions[i], font: F.head, max: 64 * k, min: 44, color: '#FFFFFF', tag: 'vaga', upper: P.upper, lines: 2 }], { fill: C.plate })),
    ]));
    P.chainTo = (ch) => Z.cy - chainH(ch) / 2 - SLING;

    // C: the phone; K: the card's board
    const ph = Math.min(1120, room - 10), pw = Math.min(800, Z.w);
    P.phone = { w: pw, h: ph };
    P.phoneTo = Z.cy - ph / 2 - SLING;
    P.chat = K.chatLayout(P, { x: 0, y: 0, w: pw, h: ph, font: F.bold, fontStrong: F.head, radius: (64 * pw) / 800,
      colors: { screen: '#FFFFFF', head: '#14202B', headInk: '#FFFFFF', field: '#EEF1F4', fieldInk: '#14202B', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: '#14202B' } });
    const cardW = Z.w + 20, cardRoom = room - 40;
    const probe = K.cardLayout(P, { font: F.head, bold: F.bold, upper: P.upper, maxW: cardW - 120, maxH: cardRoom - 120, cx: cardW / 2, cy: 0 });
    P.cardB = { w: cardW, h: probe.h + 120 };
    P.card = K.cardLayout(P, { font: F.head, bold: F.bold, upper: P.upper, maxW: cardW - 120, maxH: cardRoom - 120, cx: cardW / 2, cy: P.cardB.h / 2 });
    P.cardTo = Z.cy - P.cardB.h / 2 - SLING;
  }

  // ---------------------------------------------------------------- the acts
  // a load coming down from above the frame at t0 (settled once it has arrived and stopped swinging)
  function lowering(R, P, lt, t0, to, w, h, draw) {
    const hy = down(lt, t0, -h - SLING - 60, to);
    const settled = lt >= t0 + DROP + 0.5;
    const moving = R.moving; if (!settled) R.moving = true;
    crane(R, P, P.cx, hy);
    hanging(R, P, P.cx, hy, swing(lt - t0), w, h, () => draw(settled));
    R.moving = moving;
  }
  // a load lifted up and out of the frame (from its place at `at`)
  function lifting(R, P, lt, at, w, h, draw) {
    const hy = lerp(at, -h - SLING - 120, expoIn(win(lt, 0, 0.36)));
    const moving = R.moving; R.moving = true;
    crane(R, P, P.cx, hy);
    hanging(R, P, P.cx, hy, 0, w, h, () => draw(false));
    R.moving = moving;
  }
  // H: the headline's board comes down from under the jib and settles
  function hook(R, P, A) {
    const lt = A.lt;
    const hy = down(lt, 0.1, P.Hfrom, P.Hto);
    const th = swing(lt - 0.1) * (1 - win(lt, 0.9, 0.2));
    const settled = lt >= 1.1;
    const moving = R.moving; if (!settled) R.moving = true;
    crane(R, P, P.cx, hy);
    hanging(R, P, P.cx, hy, th, P.Hb.w, P.Hb.h, () => board(R, P, P.Hb, settled));
    R.moving = moving;
  }
  // I, F: his line on a board
  const lineAct = (key) => (R, A) => {
    const P = R.P, B = P[key];
    if (!B) { crane(R, P, P.cx, P.hookTop); return; }
    lowering(R, P, A.lt, 0.1, P.Z.cy - B.h / 2 - SLING, B.w, B.h, (s) => board(R, P, B, s));
  };
  // a floor of the building at (x, y); its words count as shown once it is set and in the zone
  function floor(R, P, f, x, y, settled) {
    const { ctx } = R, C = P.C;
    ctx.fillStyle = C.accent; ctx.fillRect(x, y, P.building.w, f.h);
    ctx.fillStyle = C.slab; ctx.fillRect(x, y, P.building.w, 14);
    ctx.fillStyle = C.under; ctx.fillRect(x, y + f.h - 8, P.building.w, 8);
    E.drawIcon(ctx, f.icon, x + 48, y + f.h / 2 + 4, 46, '#FFFFFF', 2.4);
    const rr = R.rec; if (!settled) R.rec = () => {};
    K.text(R, f.L, x + 90, y + 7 + (f.h - f.L.vh) / 2, '#FFFFFF', 'left', 0, 'vantagem');
    R.rec = rr;
  }
  const floorY = (P, f, cam) => P.ground - (f.y0 + f.h - cam);
  function buildingAt(R, P, cam, placed) {
    const { ctx } = R, Z = P.Z;
    ctx.fillStyle = P.C.ground; ctx.fillRect(0, P.ground + cam, P.fmt.w, P.fmt.h); // the ground
    for (const f of placed) {
      const y = floorY(P, f, cam);
      if (y > P.fmt.h || y + f.h < 0) continue;
      floor(R, P, f, P.building.x, y, !R.moving && y >= Z.top && y + f.h <= Z.bottom);
    }
  }
  // M, a page: the camera rises to the top of the building; each floor comes down and is set on it
  function floorsAct(R, P, A) {
    const pg = K.page(A), lt = pg.lt;
    const cam = pg.first ? P.camOf(0) : lerp(P.camOf(pg.index - 1), P.camOf(pg.index), expoInOut(win(lt, 0, 0.42)));
    const moving = R.moving;
    if (!pg.first && lt < 0.42) R.moving = true;
    const mine = P.floors.filter((f) => f.page === pg.index);
    const base = pg.first ? 0.1 : 0.35, step = Math.min(0.55, 1.5 / Math.max(1, mine.length));
    const tOf = (f) => base + mine.indexOf(f) * step;
    buildingAt(R, P, cam, P.floors.filter((f) => f.page < pg.index || (f.page === pg.index && lt >= tOf(f) + DROP)));
    const hx = P.building.x + P.building.w / 2;
    const load = mine.find((f) => lt >= tOf(f) && lt < tOf(f) + DROP);
    if (load) {
      const t0 = tOf(load);
      const hy = down(lt, t0, -load.h - SLING - 60, floorY(P, load, cam) - SLING);
      const m2 = R.moving; R.moving = true;
      crane(R, P, hx, hy);
      hanging(R, P, hx, hy, swing(lt - t0) * 0.6, P.building.w, load.h, () => floor(R, P, load, 0, 0, false));
      R.moving = m2;
    } else {
      // between loads the hook goes back up for the next one
      const last = mine.filter((f) => lt >= tOf(f) + DROP).pop();
      const at = last ? floorY(P, last, cam) - SLING : P.hookTop;
      const since = last ? lt - (tOf(last) + DROP) : 0;
      crane(R, P, hx, lerp(at, -SLING - 80, expoIn(win(since, 0, 0.3))));
    }
    R.moving = moving;
  }
  // V: the finished building, seen whole; its floors gain their depth
  function wholeAct(R, P, A) {
    const lt = A.lt, { ctx } = R, Z = P.Z;
    const top = Math.max(...P.floors.map((f) => f.y0 + f.h));
    const camEnd = P.camOf(Math.max(...P.floors.map((f) => f.page)));
    const fit = Math.min(1, (P.ground - Z.top - 40) / top);
    const k = expoInOut(win(lt, 0.1, 0.7));
    const s = lerp(1, fit, k), cam = lerp(camEnd, 0, k);
    const moving = R.moving; if (k > 0 && k < 1) R.moving = true;
    crane(R, P, P.building.x + P.building.w / 2, -SLING - 80);
    ctx.save();
    const ox = P.building.x + P.building.w / 2;
    ctx.translate(ox, P.ground); ctx.scale(s, s); ctx.translate(-ox, -P.ground);
    // the depth: a side face grows on every floor
    const d = 60 * expoOut(win(lt, 0.8, 0.5));
    if (d > 0) for (const f of P.floors) {
      const y = floorY(P, f, cam), x = P.building.x + P.building.w;
      ctx.fillStyle = P.C.side; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d, y - d * 0.6); ctx.lineTo(x + d, y + f.h - d * 0.6); ctx.lineTo(x, y + f.h); ctx.closePath(); ctx.fill();
    }
    buildingAt(R, P, cam, P.floors);
    ctx.restore();
    R.moving = moving;
  }
  // D, L: a page's chain of signs comes down (the page before is lifted away)
  function chainDraw(R, P, ch, settled, lt) {
    const { ctx } = R;
    ch.forEach((r, j) => {
      ctx.save(); ctx.translate((ch[0].B.w - r.B.w) / 2, r.y);
      if (j) { ctx.strokeStyle = P.C.steel; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(r.B.w / 2 - 60, -40); ctx.lineTo(r.B.w / 2 - 60, 0); ctx.moveTo(r.B.w / 2 + 60, -40); ctx.lineTo(r.B.w / 2 + 60, 0); ctx.stroke(); }
      r.B.lt = lt;
      board(R, P, r.B, settled);
      ctx.restore();
    });
  }
  const chainHeight = (ch) => ch.reduce((a, r) => Math.max(a, r.y + r.B.h), 0);
  function chainAct(R, P, A, pages) {
    const pg = K.page(A), lt = pg.lt;
    const ch = pages[pg.index];
    if (!pg.first && lt < 0.36) { const old = pages[pg.index - 1]; lifting(R, P, lt, P.chainTo(old), old[0].B.w, chainHeight(old), () => chainDraw(R, P, old, false, 9)); return; }
    const t0 = pg.first ? 0.1 : 0.36;
    lowering(R, P, lt, t0, P.chainTo(ch), ch[0].B.w, chainHeight(ch), (s) => chainDraw(R, P, ch, s, lt - t0));
  }
  // C: the hook lowers the phone, lets go and goes back up; the chat plays
  function chatAct(R, P, A) {
    const lt = A.lt, { ctx } = R, S = P.phone;
    const hy = lt < 0.55 ? down(lt, 0.05, -S.h - SLING - 60, P.phoneTo) : lerp(P.phoneTo, -SLING - 80, expoIn(win(lt, 0.55, 0.3)));
    const moving = R.moving; if (lt < 0.55) R.moving = true;
    crane(R, P, P.cx, hy);
    const draw = () => K.chatDraw(R, P.chat, lt, { type0: 0.8, type1: 1.4, send: 1.45 });
    if (lt < 0.55) hanging(R, P, P.cx, hy, swing(lt - 0.05) * 0.5, S.w, S.h, draw);
    else { ctx.save(); ctx.translate(P.cx - S.w / 2, P.phoneTo + SLING); draw(); ctx.restore(); }
    R.moving = moving;
  }
  const cardInk = (P) => ({ ink: P.C.boardInk, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: P.C.boardInk, qrDark: '#14202B', qrLight: '#FFFFFF' });
  function cardBoard(R, P, settled, lt, start) {
    board(R, P, { w: P.cardB.w, h: P.cardB.h, pad: 0, texts: [] }, settled);
    const rr = R.rec; if (!settled) R.rec = () => {};
    K.cardDraw(R, P.card, lt, { ...cardInk(P), start });
    R.rec = rr;
  }
  // K: the phone goes up and away; the card's board comes down
  function cardAct(R, P, A) {
    const lt = A.lt, B = P.cardB;
    if (A.bespoke && lt < 0.36) {
      const { ctx } = R;
      const m = R.moving; R.moving = true;
      const rr = R.rec; R.rec = () => {};
      ctx.save(); ctx.translate(P.cx - P.phone.w / 2, P.phoneTo + SLING - expoIn(win(lt, 0, 0.34)) * (P.phoneTo + SLING + P.phone.h + 40));
      K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true });
      ctx.restore(); R.rec = rr; R.moving = m;
    }
    const t0 = A.bespoke ? 0.3 : 0.1;
    lowering(R, P, lt, t0, P.cardTo, B.w, B.h, (s) => cardBoard(R, P, s, lt, t0 + 0.35));
  }
  // O: the card's board is lifted away; the headline's board comes down to where the video began
  function loop(R, P, A) {
    const lt = A.lt, B = P.cardB, Ka = P.act('K');
    if (lt < 0.38) { lifting(R, P, lt, P.cardTo, B.w, B.h, () => cardBoard(R, P, false, Ka.d, (Ka.bespoke ? 0.3 : 0.1) + 0.35)); return; }
    const hy = lerp(-P.Hb.h - SLING - 60, P.Hfrom, expoOut(win(lt, 0.38, 0.5)));
    const moving = R.moving; if (lt < 0.9) R.moving = true;
    crane(R, P, P.cx, hy);
    hanging(R, P, P.cx, hy, swing(lt - 0.38, 0.04) * (1 - win(lt, 0.8, 0.15)), P.Hb.w, P.Hb.h, () => board(R, P, P.Hb, false));
    R.moving = moving;
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const bass = [55, 65.41, 49, 55];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 125, f1: 42, dur: 0.34, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 7500, dur: 0.035, gain: 0.06 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'sawtooth', dur: 0.4, gain: 0.12, lp: 480 });
    }
    const turns = P.acts.filter((a) => a.pages).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...turns]) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 1000, dur: 0.28, gain: 0.32 }, { t, kind: 'tone', hz: 98, hz1: 49, wave: 'triangle', dur: 0.35, gain: 0.3 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 220, f1: 4500, gain: 0.22 });
    // the winch while a load comes down, a thud when it lands
    const load = (t0) => { ev.push({ t: t0, kind: 'noise', filter: 'bandpass', f: 600, q: 3, dur: DROP, gain: 0.12 }); ev.push({ t: t0 + DROP, kind: 'kick', f0: 90, f1: 40, dur: 0.25, gain: 0.5 }, { t: t0 + DROP, kind: 'noise', filter: 'lowpass', f: 700, dur: 0.12, gain: 0.3 }); };
    load(0.1);
    const at = (k) => P.act(k);
    if (at('I')) load(at('I').start + 0.1);
    if (at('F')) load(at('F').start + 0.1);
    const M = at('M');
    if (M) for (let p = 0; p < M.pages.length; p++) { const mine = P.floors.filter((f) => f.page === p), step = Math.min(0.55, 1.5 / Math.max(1, mine.length)); mine.forEach((_, j) => load(M.start + p * 2 + (p ? 0.35 : 0.1) + j * step)); }
    for (const k of ['D', 'L']) if (at(k)) at(k).pages.forEach((_, p) => load(at(k).start + p * 2 + (p ? 0.36 : 0.1)));
    const C = at('C');
    if (C) {
      load(C.start + 0.05);
      for (let t = 0.8; t < 1.4; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.45, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    load(Ka.start + (Ka.bespoke ? 0.3 : 0.1));
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'grua', name: 'Grua', concept: 'Uma grua desce cada informação no gancho e assenta-a no prédio.',
    font: { head: { family: 'Barlow Condensed', weight: 800 }, bold: { family: 'Barlow Condensed', weight: 700 } },
    palettes: {
      light: { bg: '#CFE3F5', ink: '#14202B', main: '#F2B705', accent: '#C4502E' },
      dark: { bg: '#0E1A26', ink: '#F2F4F7', main: '#F2B705', accent: '#E8A27A' },
    },
    bgModes: ['light', 'dark'], photos: 0, travel: 'crane', pages: true, pageMove: true, needs: { V: ['M'] },
    colors(c) {
      // the crane in the main colour; the floors in the highlight; the boards white with dark ink
      c.steel = c.mode === 'dark' ? '#C9D2DC' : '#2B3742';
      c.glass = c.mode === 'dark' ? '#16324A' : '#9CC3E4';
      c.ground = c.mode === 'dark' ? '#05090E' : '#14202B';
      c.plate = '#14202B';
      c.boardInk = '#14202B';
      c.boardMain = U.ensureContrast(c.accent, '#FFFFFF', 4.5);
      c.accentInk = U.ensureContrast(c.accent, '#FFFFFF', 4.5);
      c.accent = U.ensureContrast(c.accent, '#FFFFFF', 3);
      c.slab = U.mix(c.accent, '#000000', 0.35);
      c.under = U.mix(c.accent, '#000000', 0.15);
      c.side = U.mix(c.accent, '#000000', 0.3);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => hook(R, R.P, A),
      I: lineAct('Ib'),
      M: (R, A) => floorsAct(R, R.P, A),
      V: (R, A) => wholeAct(R, R.P, A),
      D: (R, A) => chainAct(R, R.P, A, R.P.Ds),
      L: (R, A) => chainAct(R, R.P, A, R.P.Ls),
      F: lineAct('Fb'),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => cardAct(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
