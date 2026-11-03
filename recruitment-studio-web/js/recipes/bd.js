// Video recipe «BD» (the bold poster «Banda Desenhada»): a comic page.
// Panels with thick black borders and white gutters pop in one after the
// other; the cyan panels carry halftone dots; the kicker and his lines are
// said in speech balloons that grow out of their tails. Camera language:
// still frames, hard cuts (whip) between acts; panels pop, words are stamped.
// Acts (see RS.motion.register): H the photo's panel, then the cyan one with
// the kicker's balloon, the black one with the headline (and, when tall, a
// second photo); I and F his lines in a balloon over the photo; M the
// benefits as white panels with comic tiles under a photo panel, a page at
// a time; V the next photo, the headline in a big balloon; D the highlights
// on cyan panels, a little turned; L the positions as captions; C the phone;
// K the poster: the photo, the headline's black panel, the card with the
// number in a cyan box (it pulses); O back to the first frame.
(() => {
  const K = RS.motionKit, B = RS.boldKit;
  const { win, expoOut, lerp, rrect } = K;
  const { INK, COMIC } = B;
  const LW = 9; // the panels' border (px)
  const GAP = 16; // the gutter between panels (px)
  const WHITE = '#FFFFFF';
  const DOTS = 'rgba(0,0,0,0.16)';
  const TURN = [-0.025, 0.02, -0.015, 0.025];

  // ---------------------------------------------------------------- panels
  // A panel pops (a little big → its size); a balloon grows out of its tail.
  const pop = (lt, t0) => B.stamp(lt, t0, 0.28, 1.18);
  const grow = (lt, t0) => B.stamp(lt, t0, 0.32, 0.15);
  function outline(ctx, r) {
    ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.lineJoin = 'miter';
    ctx.strokeRect(r.x + LW / 2, r.y + LW / 2, r.w - LW, r.h - LW);
  }
  // A flat panel (with halftone dots when dotted).
  function panel(ctx, r, fill, dotted = false) {
    ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h);
    if (dotted) B.halftone(ctx, r.x, r.y, r.w, r.h, DOTS);
    outline(ctx, r);
  }
  function photoPanel(R, P, i, r, z = 1) {
    B.photo(R, P, B.photoOf(P, i), r, z);
    outline(R.ctx, r);
  }
  // Draws inside r scaled by s about its centre (nothing at 0; texts once settled).
  const popped = (R, s, r, draw) => B.stamped(R, s, r.x + r.w / 2, r.y + r.h / 2, draw);
  // The page: white with faint dots, or the colour with its dots.
  function page(R, P, fill) {
    const { ctx } = R, Z = P.Z;
    ctx.fillStyle = fill; ctx.fillRect(0, 0, Z.W, Z.H);
    B.halftone(ctx, 0, 0, Z.W, Z.H, fill === WHITE ? 'rgba(0,0,0,0.05)' : DOTS, 26);
  }

  // ---------------------------------------------------------------- balloons
  // A text fitted in a balloon: { L, w, h, tag }
  function fitBalloon(P, text, o) {
    const L = K.fit(P, text, { font: o.font, upper: !!o.upper, maxSize: o.max, minSize: o.min || 44, maxW: o.maxW - 120, maxLines: o.lines || 4, maxH: o.maxH - 80, lh: 1.06 });
    const px = 44 + L.capPx * 0.5, py = 34 + L.capPx * 0.3;
    return { L, w: L.w + px * 2, h: L.vh + py * 2, tag: o.tag };
  }
  // The balloon placed with its top-left at (x, y) and its tail's tip at tip.
  const place = (b, x, y, tip) => ({ ...b, r: { x, y, w: b.w, h: b.h }, tip });
  // White, black outline, hard shadow; the tail joins the body without a seam.
  function balloonShape(ctx, b, fill, off = 0, stroke = 0) {
    const r = b.r, rad = Math.min(r.w, r.h) * 0.38;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = b.tip.x - cx, dy = b.tip.y - cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const bw = Math.min(r.w, r.h) * 0.16, bx = cx + ux * Math.min(r.w, r.h) * 0.2, by = cy + uy * Math.min(r.w, r.h) * 0.2;
    const body = () => rrect(ctx, r.x + off, r.y + off, r.w, r.h, rad);
    const tail = () => { ctx.beginPath(); ctx.moveTo(bx - uy * bw + off, by + ux * bw + off); ctx.lineTo(b.tip.x + off, b.tip.y + off); ctx.lineTo(bx + uy * bw + off, by - ux * bw + off); ctx.closePath(); };
    for (const path of [body, tail]) {
      path();
      if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
      else { ctx.fillStyle = fill; ctx.fill(); }
    }
  }
  function balloon(R, b) {
    const { ctx } = R;
    balloonShape(ctx, b, INK, 12);
    balloonShape(ctx, b, INK, 0, LW * 2);
    balloonShape(ctx, b, WHITE);
    K.text(R, b.L, b.r.x, b.r.y + (b.h - b.L.vh) / 2, INK, 'center', b.w, b.tag);
  }
  // The balloon grows out of its tail from t0.
  const balloonAt = (R, b, lt, t0) => B.stamped(R, grow(lt, t0), b.tip.x, b.tip.y, () => balloon(R, b));
  // His line (or the headline) in a balloon over a photo panel, high up, the tail down to the left.
  function overPhoto(P, text, o) {
    const Z = P.Z, b = fitBalloon(P, text, { ...o, maxW: P.pw - 40, maxH: Z.cH * 0.55 });
    const x = P.x0 + (P.pw - b.w) / 2, y = Z.top + 50;
    return place(b, x, y, { x: P.x0 + P.pw * 0.28, y: y + b.h + 110 });
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, W = Z.W;
    const small = Z.H <= 1100, story = Z.story;
    const x0 = Math.max(24, Z.left - 24), pw = W - x0 * 2, total = Z.bottom - Z.top;
    P.x0 = x0; P.pw = pw;
    const headline = c.headline || c.brandName || ' ';
    // H: the photo and the cyan panel side by side, the headline's black panel under them
    P.head = K.fit(P, headline, { font: F.head, upper: P.upper, maxSize: 140, minSize: 56, maxW: pw - 100, maxLines: 4, maxH: total * 0.3, lh: 1.02 });
    const hp = P.head.vh + 110, rem = total - hp - GAP;
    const r1 = rem > 900 ? Math.round(rem * 0.55 - GAP / 2) : rem;
    const lw = Math.round((pw - GAP) * 0.58);
    P.hPhoto = { x: x0, y: Z.top, w: lw, h: r1 };
    P.hCyan = { x: x0 + lw + GAP, y: Z.top, w: pw - lw - GAP, h: r1 };
    P.hHead = { x: x0, y: Z.top + r1 + GAP, w: pw, h: hp };
    const lowY = P.hHead.y + hp + GAP;
    P.hLow = rem > 900 ? { x: x0, y: lowY, w: pw, h: Z.bottom - lowY } : null;
    if (c.kicker) {
      const cy = P.hCyan, b = fitBalloon(P, c.kicker, { font: F.bold, upper: true, max: 60, min: 40, maxW: cy.w + 60, maxH: r1 * 0.6, lines: 4, tag: 'chamada' });
      const y = cy.y + Math.max(30, (cy.h - b.h) / 2 - 50);
      P.kick = place(b, cy.x + (cy.w - b.w) / 2, y, { x: cy.x - 6, y: Math.min(cy.y + cy.h - 30, y + b.h + 80) });
    } else P.kick = null;

    // M: a photo panel at the top, the benefits as white panels under it, a page at a time
    const ph = story ? 560 : small ? 300 : 400;
    P.mPhoto = { x: x0, y: Z.top, w: pw, h: ph };
    P.mTop = Z.top + ph + GAP + 10;
    const Ma = P.act('M');
    const rowOpt = { font: F.head, upper: P.upper, max: story ? 84 : 68, w: pw, tile: small ? 84 : 100, pad: 22, gap: GAP + 8, maxH: Z.bottom - P.mTop };
    P.mPages = (Ma ? Ma.pages : []).map((items) => B.bulletRows(P, items, rowOpt));
    P.rowOpt = rowOpt;

    // V: the headline in a big balloon over the next photo
    P.vPanel = { x: x0, y: Z.top, w: pw, h: total };
    P.vBal = overPhoto(P, headline, { font: F.head, upper: P.upper, max: 120, min: 56, tag: 'título' });

    // D: the highlights on cyan panels; L: the positions as captions
    const room = total - 20;
    const fitStack = (make) => { for (let k = 1; ; k -= 0.08) { const st = B.stack(make(k), 40); if (B.stackH(st) <= room || k <= 0.5) return st; } };
    const Da = P.act('D'), La = P.act('L');
    P.Ds = (Da ? Da.pages : []).map((items) => fitStack((k) => items.map((i) => {
      const h = c.highlights[i], [vt, lt] = B.hlTags(h);
      return B.board(P, pw - 40, [
        { text: h.value || h.label, font: F.head, max: 170 * k, min: 64, color: INK, tag: vt, lines: 2 },
        { text: h.value ? h.label : '', font: F.bold, max: 64 * k, min: 44, color: INK, tag: lt, upper: P.upper, lines: 2 },
      ], { box: { fill: P.C.accent, line: INK, lw: LW, off: 16, shadow: INK } });
    })));
    P.Ls = (La ? La.pages : []).map((items) => fitStack((k) => [
      ...(c.positionsTitle ? [B.board(P, pw, [{ text: c.positionsTitle, font: F.head, max: 76 * k, min: 44, color: P.C.accent, tag: 'título vagas', upper: P.upper, lines: 2 }], { box: { fill: INK, lw: 0, off: 0 } })] : []),
      ...items.map((i) => B.board(P, pw - 60, [{ text: c.positions[i], font: F.head, max: 76 * k, min: 44, color: INK, tag: 'vaga', upper: P.upper, lines: 2 }], { pad: 32, box: { fill: WHITE, line: INK, lw: LW, off: 12, shadow: INK } })),
    ]));

    // I, F: his lines in a balloon over the photo
    const lineB = (text, tag) => (text ? overPhoto(P, text, { font: F.head, max: 96, min: 48, lines: 6, tag }) : null);
    P.Ib = P.act('I') ? lineB(c.intro, 'intro') : null;
    P.Fb = P.act('F') ? lineB(c.closing, 'fecho') : null;

    // C: the phone
    const cw = Math.min(800, Z.w), chh = Math.min(1120, Z.cH - 60);
    P.chat = B.chat(P, (W - cw) / 2, Z.cy - chh / 2, cw, chh);

    // K: the card at the bottom, the photo and the headline's panel above it;
    // when that leaves no room (square), the card on the right and they on the left
    const cardOpt = { font: F.head, bold: F.bold, upper: P.upper, qrMax: story ? 300 : small ? 170 : 230, numberMax: story ? 140 : 120 };
    P.card = B.card(P, { ...cardOpt, cx: W / 2, bottom: Z.bottom - 14, maxW: pw - 92, maxH: story ? 900 : small ? 560 : 720 });
    if (!posterAbove(P, headline)) posterBeside(P, cardOpt, headline);
  }
  // K, stacked: the photo panel, the headline's black panel, the card; false when they do not fit
  function posterAbove(P, headline) {
    const Z = P.Z, topH = P.card.y - 30 - Z.top;
    const L = K.fit(P, headline, { font: P.F.head, upper: P.upper, maxSize: 110, minSize: 48, maxW: P.pw - 100, maxLines: 4, maxH: topH * 0.45, lh: 1.02 });
    const hh = L.vh + 90, hy = P.card.y - 30 - hh, phH = hy - GAP - Z.top;
    if (phH < 180) return false;
    P.kHead = L;
    P.kHeadP = { x: P.x0, y: hy, w: P.pw, h: hh };
    P.kPhoto = { x: P.x0, y: Z.top, w: P.pw, h: phH };
    return true;
  }
  // K, side by side: the card on the right, the photo and the headline's panel on the left
  function posterBeside(P, cardOpt, headline) {
    const Z = P.Z, cw = Math.round(P.pw * 0.56), cx = P.x0 + P.pw - cw / 2;
    const at = (top) => B.card(P, { ...cardOpt, cx, top, maxW: cw - 92, maxH: Z.cH - 40, qrMax: 170, numberMax: 96 });
    P.card = at(Z.cy - at(0).h / 2);
    const lw = P.card.x - GAP - 10 - P.x0;
    P.kHead = K.fit(P, headline, { font: P.F.head, upper: P.upper, maxSize: 90, minSize: 44, maxW: lw - 70, maxLines: 5, maxH: Z.cH * 0.45, lh: 1.02 });
    const hh = P.kHead.vh + 80;
    P.kHeadP = { x: P.x0, y: Z.bottom - hh, w: lw, h: hh };
    P.kPhoto = { x: P.x0, y: Z.top, w: lw, h: Z.bottom - hh - GAP - Z.top };
  }

  // ---------------------------------------------------------------- the acts
  // A headline on its black panel, stamped from t0 once the panel is in.
  function headPanel(R, L, r, lt, t0, t1) {
    popped(R, pop(lt, t0), r, () => {
      panel(R.ctx, r, INK);
      B.stamped(R, B.stamp(lt, t1), r.x + r.w / 2, r.y + r.h / 2, () => K.text(R, L, r.x, r.y + (r.h - L.vh) / 2, WHITE, 'center', r.w, 'título'));
    });
  }
  // H: the photo's panel; the cyan one, the headline's, the balloon pop in after it
  function opener(R, P, lt) {
    const { ctx } = R, C = P.C;
    page(R, P, WHITE);
    photoPanel(R, P, 0, P.hPhoto, lerp(1.12, 1, expoOut(win(lt, 0, 1.5))));
    popped(R, pop(lt, 0.15), P.hCyan, () => panel(ctx, P.hCyan, C.accent, true));
    if (P.hLow) popped(R, pop(lt, 0.35), P.hLow, () => photoPanel(R, P, 1, P.hLow, lerp(1.08, 1, expoOut(win(lt, 0.35, 1.4)))));
    headPanel(R, P.head, P.hHead, lt, 0.25, 0.5);
    if (P.kick) balloonAt(R, P.kick, lt, 0.7);
    else {
      const cy = P.hCyan, s = Math.min(cy.w, cy.h) * 0.42;
      B.stamped(R, B.stamp(lt, 0.7), cy.x + cy.w / 2, cy.y + cy.h / 2, () => B.tile(ctx, cy.x + cy.w / 2, cy.y + cy.h / 2, s, 'hard-hat', WHITE, { line: INK, shadow: INK }));
    }
  }
  // M, a page: the photo panel, the benefit panels pop in one after the other
  function benefits(R, P, A) {
    const pg = K.page(A), lt = pg.lt, o = P.rowOpt;
    page(R, P, P.C.accent);
    const z = lerp(1.08, 1, expoOut(win(lt, 0, 1.6)));
    popped(R, pg.first ? pop(lt, 0.05) : 1, P.mPhoto, () => photoPanel(R, P, 1 + pg.index, P.mPhoto, z));
    const M = P.mPages[pg.index];
    if (!M) return;
    let y = P.mTop + Math.max(0, (P.Z.bottom - P.mTop - M.h) * 0.4);
    M.rows.forEach((row, j) => {
      const t1 = 0.3 + j * 0.22, r = { x: P.x0, y, w: P.pw, h: row.h };
      popped(R, pop(lt, t1), r, () => B.bulletRow(R, row, P.x0, y, P.pw, { ...o, k: 1, lt, t1: t1 + 0.28, ink: INK,
        color: (i) => COMIC[i % COMIC.length], box: { fill: WHITE, line: INK, lw: LW, off: 10, shadow: INK }, tileStyle: { line: INK, off: 0, lw: 5 } }));
      y += row.h + o.gap;
    });
  }
  // V: the next photo in one panel, the headline's balloon grows on it
  function whole(R, P, A) {
    page(R, P, WHITE);
    photoPanel(R, P, 2, P.vPanel, lerp(1, 1.1, win(A.lt, 0, A.d)));
    balloonAt(R, P.vBal, A.lt, 0.35);
  }
  // D, L: a page of panels popping in one after the other (turned a little when turn)
  function boards(R, P, A, pages, fill, turn) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt;
    page(R, P, fill);
    const st = pages[pg.index] || [];
    const top = Z.cy - B.stackH(st) / 2;
    st.forEach((r, j) => {
      const x = (Z.W - r.B.w) / 2, y = top + r.y, t0 = 0.12 + j * 0.2, cx = x + r.B.w / 2, cy = y + r.B.h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(turn ? TURN[j % TURN.length] : 0); ctx.translate(-cx, -cy);
      B.stamped(R, B.stamp(lt, t0), cx, cy, () => B.drawBoard(R, r.B, x, y));
      ctx.restore();
    });
  }
  // I, F: his line in a balloon over the photo
  const lineAct = (key, i) => (R, A) => {
    const P = R.P, b = P[key];
    page(R, P, WHITE);
    photoPanel(R, P, i, P.vPanel, lerp(1.06, 1, expoOut(win(A.lt, 0, 1))));
    if (b) balloonAt(R, b, A.lt, 0.1);
  };
  // C: the phone on the dotted colour
  function chatAct(R, P, A) {
    page(R, P, P.C.accent);
    B.chatPhone(R, P, P.chat, A.lt);
  }
  // K: the poster. The photo and the headline's panel pop in, the card lands.
  function poster(R, P, A) {
    const lt = A.lt;
    page(R, P, WHITE);
    popped(R, pop(lt, 0.05), P.kPhoto, () => photoPanel(R, P, 0, P.kPhoto, lerp(1.06, 1, expoOut(win(lt, 0.05, 1.2)))));
    headPanel(R, P.kHead, P.kHeadP, lt, 0.15, 0.3);
    B.drawCard(R, P, P.card, lt, 0.45, { panel: WHITE, line: INK, box: P.C.accent, ink: INK, shadow: INK });
  }

  function sound(P) {
    const at = (k) => P.act(k);
    const hits = [0.15, 0.25, 0.8, 1.0];
    B.pageStarts(P, 'M').forEach((t, i) => { const M = P.mPages[i]; if (M) M.rows.forEach((_, j) => hits.push(t + 0.3 + j * 0.22)); });
    if (at('V')) hits.push(at('V').start + 0.6);
    for (const k of ['D', 'L']) B.pageStarts(P, k).forEach((t) => [0.42, 0.62, 0.82].forEach((d) => hits.push(t + d)));
    for (const k of ['I', 'F']) if (at(k)) hits.push(at(k).start + 0.4);
    if (at('K')) hits.push(at('K').start + 0.15, at('K').start + 0.6, at('K').start + 0.75);
    return B.sound(P, hits);
  }

  RS.motion.register({
    id: 'bd', name: 'Banda Desenhada', concept: 'Uma página de banda desenhada: vinhetas de contorno grosso entram uma a uma, pontos de meio-tom e balões de fala.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Rubik', weight: 800 } },
    palettes: {
      light: { bg: '#FFFFFF', ink: INK, main: INK, accent: '#3DDCFF' },
    },
    bgModes: ['light'], photos: 3, travel: 'whip', pages: true,
    // every act arrives with the whip (none takes over from the one before)
    canonical: { M: null, V: null, D: null, L: null, C: null, K: null, O: null },
    needs: { V: ['M'] },
    colors(c) {
      // black words on the cyan panels
      c.accent = RS.util.ensureContrast(c.accent, INK, 7);
      c.tile = '#BDBDBD';
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => opener(R, R.P, A.lt),
      I: lineAct('Ib', 1),
      M: (R, A) => benefits(R, R.P, A),
      V: (R, A) => whole(R, R.P, A),
      D: (R, A) => boards(R, R.P, A, R.P.Ds, WHITE, true),
      L: (R, A) => boards(R, R.P, A, R.P.Ls, R.P.C.accent, false),
      F: lineAct('Fb', 2),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => poster(R, R.P, A),
      // O: the cut back to the first frame (the photo's panel alone on the page)
      O: (R) => opener(R, R.P, 0),
    },
    sound,
  });
})();
