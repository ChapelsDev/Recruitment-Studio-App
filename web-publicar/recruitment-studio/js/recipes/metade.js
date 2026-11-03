// Video recipe «Metade» (the bold poster «Metade»): the ad's photo, and the
// highlight colour comes down over its top half on a diagonal with a thick
// black edge; everything else is stamped on. Camera language: still frames,
// hard cuts (whip) between acts; things land with a jolt.
// Acts (see RS.motion.register): H the photo, the half comes down with the
// headline; I and F his lines on a block over the photo; M the benefits as
// black rows with icon tiles beside a framed photo, a page at a time; V the
// next photo, the headline stamped on it, the hazard tape runs; D the
// highlights on colour blocks; L the positions on plates; C the phone; K the
// poster: the half with the headline, the photo, the card with the number in
// its own box (it pulses); O back to the first frame.
(() => {
  const K = RS.motionKit, B = RS.boldKit, U = RS.util;
  const { win, expoOut, lerp } = K;
  const { INK, TILES } = B;
  const EDGE = 14;

  // ---------------------------------------------------------------- the half
  // The highlight colour over the top: from the frame's top to yl (left) and yr (right).
  function half(R, P, yl, yr) {
    const { ctx } = R, W = P.fmt.w;
    ctx.fillStyle = P.C.accent;
    ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(W + 20, -20); ctx.lineTo(W + 20, yr); ctx.lineTo(-20, yl); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = EDGE;
    ctx.beginPath(); ctx.moveTo(-20, yl); ctx.lineTo(W + 20, yr); ctx.stroke();
  }
  // the kicker's pill (black, the highlight colour's words) at (x, y)
  function pill(R, P, L, x, y) {
    const { ctx } = R;
    B.hardBox(ctx, x, y, L.w + 56, L.vh + 36, { fill: INK, lw: 0, off: 0 });
    K.text(R, L, x + 28, y + 18, P.C.accent, 'left', 0, 'chamada');
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, W = Z.W;
    const small = Z.H <= 1100, story = Z.story;
    // H: the kicker and the headline in the half
    P.kick = c.kicker ? K.fit(P, c.kicker, { font: F.bold, upper: true, maxSize: 54, minSize: 40, maxW: Z.w - 56, maxLines: 2 }) : null;
    const headMaxH = Z.cH * (story ? 0.34 : 0.4) - (P.kick ? P.kick.vh + 60 : 0);
    P.head = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 150, minSize: 56, maxW: Z.w, maxLines: 4, maxH: headMaxH, lh: 1.02 });
    P.kickY = Z.top + 10;
    P.headY = P.kickY + (P.kick ? P.kick.vh + 36 + 34 : 0);
    const end = P.headY + P.head.vh;
    P.halfL = end + 150; P.halfR = end + 50;

    // M: a framed photo top right, the benefits under it, a page at a time
    const ph = story ? 560 : small ? 330 : 420;
    P.mPhoto = { x: W * 0.47, y: Z.top + 8, w: Z.left + Z.w - W * 0.47, h: ph };
    P.mTop = Z.top + ph + 70;
    const Ma = P.act('M');
    const rowOpt = { font: F.head, upper: P.upper, max: 68, w: Z.w, tile: small ? 84 : 100, pad: 22, gap: 26, maxH: Z.bottom - P.mTop };
    P.mPages = (Ma ? Ma.pages : []).map((items) => B.bulletRows(P, items, rowOpt));
    P.rowOpt = rowOpt;

    // V: the headline on a black board over the next photo
    P.vBoard = B.boardFit(Z.cH * 0.5, (k) => B.board(P, Z.w, [
      { text: c.headline || c.brandName || ' ', font: F.head, max: 120 * k, min: 56, color: '#FFFFFF', tag: 'título', upper: P.upper, lines: 4 },
    ], { box: { fill: INK, lw: 0, off: 18, shadow: P.C.accent } }));

    // D: the highlights on colour blocks; L: the positions on plates
    const room = Z.cH - 20;
    const fitStack = (make) => { for (let k = 1; ; k -= 0.08) { const st = B.stack(make(k)); if (B.stackH(st) <= room || k <= 0.5) return st; } };
    const Da = P.act('D'), La = P.act('L');
    P.Ds = (Da ? Da.pages : []).map((items) => fitStack((k) => items.map((i) => {
      const h = c.highlights[i], [vt, lt] = B.hlTags(h);
      return B.board(P, Z.w, [
        { text: h.value || h.label, font: F.head, max: 170 * k, min: 64, color: INK, tag: vt, lines: 2 },
        { text: h.value ? h.label : '', font: F.bold, max: 64 * k, min: 44, color: INK, tag: lt, upper: P.upper, lines: 2 },
      ], { box: { fill: P.C.accent, lw: 10, off: 18, shadow: '#FFFFFF' } });
    })));
    P.Ls = (La ? La.pages : []).map((items) => fitStack((k) => [
      ...(c.positionsTitle ? [B.board(P, Z.w, [{ text: c.positionsTitle, font: F.head, max: 76 * k, min: 44, color: P.C.accent, tag: 'título vagas', upper: P.upper, lines: 2 }], { box: { fill: INK, lw: 0, off: 0 } })] : []),
      ...items.map((i) => B.board(P, Z.w - 60, [{ text: c.positions[i], font: F.head, max: 76 * k, min: 44, color: INK, tag: 'vaga', upper: P.upper, lines: 2 }], { pad: 32, box: { fill: '#FFFFFF', lw: 10, off: 14, shadow: INK } })),
    ]));

    // I, F: his lines on a block of the highlight colour
    const lineB = (text, tag) => (text ? B.boardFit(Z.cH * 0.7, (k) => B.board(P, Z.w, [{ text, font: F.head, max: 96 * k, min: 48, color: INK, tag, lines: 6 }], { box: { fill: P.C.accent, lw: 10, off: 18, shadow: INK } })) : null);
    P.Ib = P.act('I') ? lineB(c.intro, 'intro') : null;
    P.Fb = P.act('F') ? lineB(c.closing, 'fecho') : null;

    // C: the phone
    const pw = Math.min(800, Z.w), phh = Math.min(1120, Z.cH - 60);
    P.chat = B.chat(P, (W - pw) / 2, Z.cy - phh / 2, pw, phh);

    // K: the card at the bottom, the half with the headline and the photo above it
    P.card = B.card(P, { cx: W / 2, bottom: Z.bottom - 18, maxW: Z.w - 60, maxH: story ? 900 : small ? 560 : 720,
      font: F.head, bold: F.bold, upper: P.upper, qrMax: story ? 300 : small ? 170 : 230, numberMax: story ? 140 : 120 });
    const topH = P.card.y - 70 - Z.top;
    P.kHalf = topH >= 220;
    if (P.kHalf) {
      const pw2 = Math.round(Z.w * 0.4);
      P.kPhoto = { x: Z.left + Z.w - pw2, y: Z.top + 6, w: pw2, h: topH - 10 };
      P.kHead = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 110, minSize: 48, maxW: Z.w - pw2 - 50, maxLines: 5, maxH: topH - 20, lh: 1.02 });
      P.kHeadY = Z.top + (topH - P.kHead.vh) / 2;
    }
    P.kTape = { y: P.card.y - 58, h: 36 };
  }

  // ---------------------------------------------------------------- the acts
  // H: the photo; the half comes down with the kicker and the headline
  function opener(R, P, lt) {
    const { ctx } = R, Z = P.Z;
    const z = lerp(1.14, 1, expoOut(win(lt, 0, 1.4)));
    B.photo(R, P, B.photoOf(P, 0), { x: 0, y: 0, w: Z.W, h: Z.H }, z);
    const k = B.slide(lt, 0.12, 0.34);
    if (k <= 0) return;
    const j = B.shake(lt, 0.46, 10);
    ctx.save(); ctx.translate(0, j);
    const lift = (1 - k) * (P.halfL + 40);
    half(R, P, P.halfL - lift, P.halfR - lift);
    // the kicker stamps, the headline rises from under a clip
    if (P.kick) B.stamped(R, B.stamp(lt, 0.5, 0.25), Z.left + P.kick.w / 2, P.kickY + P.kick.vh / 2, () => pill(R, P, P.kick, Z.left, P.kickY));
    const r = B.slide(lt, P.kick ? 0.62 : 0.5, 0.36);
    if (r > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, P.headY - 20, Z.W, P.head.vh + 40); ctx.clip();
      B.quiet(R, r >= 0.999, () => K.text(R, P.head, Z.left, P.headY + (1 - r) * (P.head.vh + 30), INK, 'left', 0, 'título'));
      ctx.restore();
    }
    ctx.restore();
    // the tape at the foot of the frame
    const tk = B.slide(lt, 0.85, 0.4);
    if (tk > 0) B.hazard(ctx, -40 + (1 - tk) * -Z.W, Z.bottom - 46, Z.W + 80, 46, P.C.accent, INK, lt * 60);
  }
  // M, a page: the framed photo, the rows slide in one after the other
  function benefits(R, P, A) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt;
    ctx.fillStyle = P.C.accent; ctx.fillRect(0, 0, Z.W, Z.H);
    B.hazard(ctx, Z.left - 10, P.mPhoto.y + 30, P.mPhoto.x - Z.left - 40, 70, P.C.accent, INK, lt * 40);
    const s = pg.first ? B.stamp(lt, 0.05) : 1;
    B.stamped(R, s, P.mPhoto.x + P.mPhoto.w / 2, P.mPhoto.y + P.mPhoto.h / 2, () => B.framed(R, P, B.photoOf(P, 1 + pg.index), P.mPhoto, { angle: -0.035, z: lerp(1.08, 1, expoOut(win(lt, 0, 1.6))) }));
    const M = P.mPages[pg.index];
    if (!M) return;
    let y = P.mTop;
    M.rows.forEach((row, j) => {
      const t1 = 0.3 + j * 0.25;
      B.bulletRow(R, row, Z.left, y, Z.w, { ...P.rowOpt, k: B.slide(lt, t1, 0.3), lt, t1: t1 + 0.3, ink: '#FFFFFF',
        color: (i) => TILES[i % TILES.length], box: { fill: INK, lw: 0, off: 12, shadow: '#FFFFFF' }, tileStyle: { line: '#FFFFFF', off: 0, lw: 5 } });
      y += row.h + P.rowOpt.gap;
    });
  }
  // V: the next photo, the headline stamped on it, the tape runs across
  function whole(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt, V = P.vBoard;
    B.photo(R, P, B.photoOf(P, 2), { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1, 1.1, win(lt, 0, A.d)));
    const y = Z.cy - V.h / 2;
    const tk = B.slide(lt, 0.1, 0.4);
    B.hazard(ctx, (1 - tk) * Z.W, y - 90, Z.W, 50, P.C.accent, INK, lt * 80);
    B.hazard(ctx, -(1 - tk) * Z.W, y + V.h + 58, Z.W, 50, P.C.accent, INK, -lt * 80);
    const s = B.stamp(lt, 0.4);
    ctx.save(); ctx.translate(0, B.shake(lt, 0.7));
    B.stamped(R, s, Z.W / 2, Z.cy, () => B.drawBoard(R, V, Z.left, y));
    ctx.restore();
  }
  // D, L: a page of boards stamped one after the other
  function boards(R, P, A, pages, bg) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, Z.W, Z.H);
    const st = pages[pg.index] || [];
    const top = Z.cy - B.stackH(st) / 2;
    st.forEach((r, j) => {
      const x = (Z.W - r.B.w) / 2, y = top + r.y, t0 = 0.12 + j * 0.22;
      ctx.save(); ctx.translate(0, B.shake(lt, t0 + B.STAMP, 8));
      B.stamped(R, B.stamp(lt, t0), x + r.B.w / 2, y + r.B.h / 2, () => B.drawBoard(R, r.B, x, y));
      ctx.restore();
    });
  }
  // I, F: his line on a block over the photo
  const lineAct = (key, i) => (R, A) => {
    const P = R.P, Z = P.Z, Bd = P[key];
    B.photo(R, P, B.photoOf(P, i), { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1.06, 1, expoOut(win(A.lt, 0, 1))));
    if (!Bd) return;
    const y = Z.cy - Bd.h / 2;
    B.stamped(R, B.stamp(A.lt, 0.1), Z.W / 2, Z.cy, () => B.drawBoard(R, Bd, Z.left, y));
  };
  // C: the phone over the colour, a tape top and bottom
  function chatAct(R, P, A) {
    const { ctx } = R, Z = P.Z;
    ctx.fillStyle = P.C.accent; ctx.fillRect(0, 0, Z.W, Z.H);
    B.hazard(ctx, 0, Z.top - 70, Z.W, 44, P.C.accent, INK, A.lt * 60);
    B.hazard(ctx, 0, Z.bottom + 26, Z.W, 44, P.C.accent, INK, -A.lt * 60);
    B.chatPhone(R, P, P.chat, A.lt);
  }
  // K: the poster. The half with the headline and the photo stamp in, then the card.
  function poster(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, Z.W, Z.H);
    if (P.kHalf) {
      const k = B.slide(lt, 0.05, 0.3), lift = (1 - k) * (P.card.y + 40);
      const yr = P.card.y - 110, yl = P.card.y - 40;
      ctx.save(); ctx.translate(0, B.shake(lt, 0.35, 8));
      half(R, P, yl - lift, yr - lift);
      B.stamped(R, B.stamp(lt, 0.2), P.kPhoto.x + P.kPhoto.w / 2, P.kPhoto.y + P.kPhoto.h / 2,
        () => B.framed(R, P, B.photoOf(P, 0), P.kPhoto, { angle: -0.035, z: lerp(1.06, 1, expoOut(win(lt, 0.2, 1.2))) }));
      const r = B.slide(lt, 0.3, 0.3);
      if (r > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, P.kHeadY - 20, P.kPhoto.x - 10, P.kHead.vh + 40); ctx.clip();
        B.quiet(R, r >= 0.999, () => K.text(R, P.kHead, Z.left, P.kHeadY + (1 - r) * (P.kHead.vh + 30), INK, 'left', 0, 'título'));
        ctx.restore();
      }
      ctx.restore();
    } else {
      B.photo(R, P, B.photoOf(P, 0), { x: 0, y: 0, w: Z.W, h: P.card.y - 40 }, 1);
    }
    const tk = B.slide(lt, 0.3, 0.35);
    if (tk > 0) B.hazard(ctx, (1 - tk) * -Z.W, P.kTape.y, Z.W, P.kTape.h, P.C.accent, INK, lt * 50);
    B.drawCard(R, P, P.card, lt, 0.4, { panel: '#FFFFFF', box: P.C.accent, ink: INK, shadow: P.C.accent });
  }

  function sound(P) {
    const hits = [0.46, 0.75];
    const at = (k) => P.act(k);
    B.pageStarts(P, 'M').forEach((t) => [0.35, 0.6, 0.85].forEach((d) => hits.push(t + d)));
    if (at('V')) hits.push(at('V').start + 0.7);
    for (const k of ['D', 'L']) B.pageStarts(P, k).forEach((t) => [0.42, 0.64, 0.86].forEach((d) => hits.push(t + d)));
    for (const k of ['I', 'F']) if (at(k)) hits.push(at(k).start + 0.4);
    if (at('K')) hits.push(at('K').start + 0.35, at('K').start + 0.7);
    return B.sound(P, hits);
  }

  RS.motion.register({
    id: 'metade', name: 'Metade', concept: 'A cor de destaque desce sobre metade da fotografia; tudo o resto é carimbado com contorno preto.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Barlow Condensed', weight: 800 } },
    palettes: {
      dark: { bg: '#111111', ink: '#FFFFFF', main: '#111111', accent: '#FFC800' },
    },
    bgModes: ['dark'], photos: 3, travel: 'whip', pages: true,
    // every act arrives with the whip (none takes over from the one before)
    canonical: { M: null, V: null, D: null, L: null, C: null, K: null, O: null },
    needs: { V: ['M'] },
    colors(c) {
      // the half in the highlight colour, black words on it
      c.accent = U.ensureContrast(c.accent, INK, 7);
      c.tile = '#3A3A3A';
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => opener(R, R.P, A.lt),
      I: lineAct('Ib', 1),
      M: (R, A) => benefits(R, R.P, A),
      V: (R, A) => whole(R, R.P, A),
      D: (R, A) => boards(R, R.P, A, R.P.Ds, INK),
      L: (R, A) => boards(R, R.P, A, R.P.Ls, R.P.C.accent),
      F: lineAct('Fb', 2),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => poster(R, R.P, A),
      // O: the cut back to the first frame (the photo before the half comes down)
      O: (R) => opener(R, R.P, 0),
    },
    sound,
  });
})();
