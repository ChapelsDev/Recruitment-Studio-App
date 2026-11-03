// Video recipe «Contraste» (the bold poster «Contraste»): black and white
// with one strong colour. The photos in grey, hard contrast; the headline
// slams down line by line on orange blocks; the benefits in white outline
// boxes; the hazard tape and the white box with the number. Camera language:
// still frames, hard cuts (whip) between acts; things land with a jolt.
// Acts (see RS.motion.register): H the grey photo zooms slowly, the black bar
// drops with its orange line and the kicker, the headline is stamped on
// orange blocks; I and F his lines on a black board over the photo; M the
// photo goes up into the top 40 % and fades to black, the benefits come in
// on the diagonal as a 2-column grid, a page at a time; V the next photo
// between black bands, the headline stamped on an orange board; D the
// highlights as orange blocks; L the positions in outline boxes; C the phone;
// K the poster: the photo, the headline blocks, the tape and the white card
// (orange outline, the number pulses); O back to the first frame.
(() => {
  const K = RS.motionKit, B = RS.boldKit;
  const { win, expoOut, lerp } = K;
  const { INK } = B;
  const LINE = 10; // the orange line under the bar (px)
  const STEP = 0.12; // between two lines / two cells (s)
  const WHITE = '#FFFFFF';

  // ---------------------------------------------------------------- pieces
  // A gradient to black over rect r, from its top + f·h down to its foot.
  function fade(R, r, f = 0.45) {
    const { ctx } = R, y0 = r.y + r.h * f;
    const g = ctx.createLinearGradient(0, y0, 0, r.y + r.h + 1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.fillRect(r.x, y0, r.w, r.y + r.h + 1 - y0);
  }
  // The grey photo i over rect r (zoom z), faded to black at its foot.
  function grey(R, P, i, r, z = 1, f = 0.45) {
    B.photo(R, P, B.photoOf(P, i), r, z, true);
    fade(R, r, f);
  }
  // The headline's blocks: one per line of L placed at (x, y).
  const pad = (L) => Math.round(L.capPx * 0.26);
  const lineBoxes = (L, x, y) => L.lines.map((_, i) => ({ x: x - pad(L) * 1.4, y: y + i * L.lhPx - pad(L), w: L.widths[i] + pad(L) * 2.8, h: L.capPx + pad(L) * 2 }));
  const blocksEnd = (L, t0) => t0 + (L.lines.length - 1) * STEP + B.STAMP;
  // The headline stamped line by line from t0, each on its orange block.
  function blocks(R, P, L, x, y, lt, t0, tag) {
    const { ctx } = R, boxes = lineBoxes(L, x, y);
    const box = (b) => B.hardBox(ctx, b.x, b.y, b.w, b.h, { fill: P.C.accent, lw: 6, off: 12, shadow: INK });
    if (lt >= blocksEnd(L, t0)) {
      boxes.forEach(box);
      K.text(R, L, x, y, INK, 'left', 0, tag);
      return;
    }
    B.quiet(R, false, () => boxes.forEach((b, i) => {
      const t = t0 + i * STEP, s = B.stamp(lt, t);
      ctx.save(); ctx.translate(B.shake(lt, t + B.STAMP, 6), 0);
      B.stamped(R, s, b.x + b.w / 2, b.y + b.h / 2, () => {
        box(b);
        ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
        K.text(R, L, x, y, INK, 'left', 0, tag);
        ctx.restore();
      });
      ctx.restore();
    }));
  }
  // The black bar from the top, the orange line under it, the kicker in it.
  function bar(R, P, k) {
    const { ctx } = R, Z = P.Z;
    if (k <= 0) return;
    ctx.save(); ctx.translate(0, -(1 - k) * (P.barH + LINE + 20));
    ctx.fillStyle = INK; ctx.fillRect(0, 0, Z.W, P.barH);
    ctx.fillStyle = P.C.accent; ctx.fillRect(0, P.barH, Z.W, LINE);
    if (P.kick) B.quiet(R, k >= 0.999, () => K.text(R, P.kick, Z.left, P.kickY, P.C.accent, 'left', 0, 'chamada'));
    ctx.restore();
  }

  // ---------------------------------------------------------------- the grid
  // The benefits of a page in 2 columns, each pair as tall as its taller cell;
  // the grid sits a little above the middle of the room under the photo.
  function grid(P, items, o) {
    for (let k = 1; ; k -= 0.08) {
      const { rows } = B.bulletRows(P, items, { ...o, max: o.max * k, maxH: Infinity });
      const pairs = [];
      for (let j = 0; j < rows.length; j += 2) pairs.push(Math.max(rows[j].h, rows[j + 1] ? rows[j + 1].h : 0));
      const h = pairs.reduce((a, x) => a + x, 0) + o.gap * Math.max(0, pairs.length - 1);
      if (h <= o.maxH || k <= 0.5) return { rows, pairs, h, top: o.top + Math.max(0, (o.maxH - h) * 0.4) };
    }
  }
  // Where each cell sits: { row, x, y, h }
  function cells(P, G) {
    const Z = P.Z, o = P.gridOpt, out = [];
    let y = G.top;
    G.pairs.forEach((h, r) => {
      const a = G.rows[r * 2], b = G.rows[r * 2 + 1];
      if (b) out.push({ row: a, x: Z.left, y, h }, { row: b, x: Z.left + o.w + o.colGap, y, h });
      else out.push({ row: a, x: Z.left + (Z.w - o.w) / 2, y, h });
      y += h + o.gap;
    });
    return out;
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, W = Z.W, H = Z.H;
    const small = H <= 1100, story = Z.story;
    // H: the bar with the kicker; the headline's blocks at the foot
    P.kick = c.kicker ? K.fit(P, c.kicker, { font: F.bold, upper: true, maxSize: 58, minSize: 40, maxW: Z.w, maxLines: 2 }) : null;
    P.barH = Z.top + Math.max(110, P.kick ? P.kick.vh + 70 : 0);
    P.kickY = Z.top + (P.barH - Z.top - (P.kick ? P.kick.vh : 0)) / 2;
    const head = (maxW, maxH, maxSize) => K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize, minSize: 56, maxW, maxLines: 4, maxH, lh: 1.34 });
    P.head = head(Z.w - 60, Z.cH * (story ? 0.4 : 0.46), 140);
    P.headX = Z.left + pad(P.head) * 1.4;
    P.headY = Z.bottom - 30 - pad(P.head) - P.head.vh;

    // M: the photo in the top 40 %, the benefits under it in 2 columns
    P.mPh = Math.round(H * 0.4);
    const gridTop = Math.max(Z.top, P.mPh + 40);
    const Ma = P.act('M');
    const colGap = 26;
    P.gridOpt = { font: F.head, upper: P.upper, max: 60, w: (Z.w - colGap) / 2, colGap, tile: small ? 72 : 84, pad: 22, gap: 26, top: gridTop, maxH: Z.bottom - gridTop };
    P.mPages = (Ma ? Ma.pages : []).map((items) => grid(P, items, P.gridOpt));

    // V: the headline on an orange board
    P.vBoard = B.boardFit(Z.cH * 0.5, (k) => B.board(P, Z.w, [
      { text: c.headline || c.brandName || ' ', font: F.head, max: 120 * k, min: 56, color: INK, tag: 'título', upper: P.upper, lines: 4 },
    ], { box: { fill: P.C.accent, lw: 10, off: 18, shadow: WHITE } }));

    // D: the highlights as orange blocks; L: the positions in outline boxes
    const room = Z.cH - 20;
    const fitStack = (make) => { for (let k = 1; ; k -= 0.08) { const st = B.stack(make(k), 40); if (B.stackH(st) <= room || k <= 0.5) return st; } };
    const Da = P.act('D'), La = P.act('L');
    P.Ds = (Da ? Da.pages : []).map((items) => fitStack((k) => items.map((i) => {
      const h = c.highlights[i], [vt, lt] = B.hlTags(h);
      return B.board(P, Z.w, [
        { text: h.value || h.label, font: F.head, max: 170 * k, min: 64, color: INK, tag: vt, lines: 2 },
        { text: h.value ? h.label : '', font: F.bold, max: 64 * k, min: 44, color: INK, tag: lt, upper: P.upper, lines: 2 },
      ], { box: { fill: P.C.accent, line: WHITE, lw: 8, off: 16, shadow: WHITE } });
    })));
    P.Ls = (La ? La.pages : []).map((items) => fitStack((k) => [
      ...(c.positionsTitle ? [B.board(P, Z.w, [{ text: c.positionsTitle, font: F.head, max: 76 * k, min: 44, color: P.C.accent, tag: 'título vagas', upper: P.upper, lines: 2 }], { box: { fill: INK, lw: 0, off: 0 } })] : []),
      ...items.map((i) => B.board(P, Z.w - 60, [{ text: c.positions[i], font: F.head, max: 76 * k, min: 44, color: WHITE, tag: 'vaga', upper: P.upper, lines: 2 }], { pad: 32, box: { fill: INK, line: WHITE, lw: 6, off: 14, shadow: P.C.accent } })),
    ]));

    // I, F: his lines on a black board with a white outline
    const lineB = (text, tag) => (text ? B.boardFit(Z.cH * 0.7, (k) => B.board(P, Z.w, [{ text, font: F.head, max: 96 * k, min: 48, color: WHITE, tag, lines: 6 }], { box: { fill: INK, line: WHITE, lw: 8, off: 18, shadow: P.C.accent } })) : null);
    P.Ib = P.act('I') ? lineB(c.intro, 'intro') : null;
    P.Fb = P.act('F') ? lineB(c.closing, 'fecho') : null;

    // C: the phone
    const pw = Math.min(800, Z.w), phh = Math.min(1120, Z.cH - 60);
    P.chat = B.chat(P, (W - pw) / 2, Z.cy - phh / 2, pw, phh);

    // K: the card at the bottom under the photo and the headline; when that
    // leaves no room (square), the card on the right and they on the left
    const cardOpt = { font: F.head, bold: F.bold, upper: P.upper, qrMax: story ? 300 : small ? 170 : 230, numberMax: story ? 140 : 120 };
    P.card = B.card(P, { ...cardOpt, cx: W / 2, bottom: Z.bottom - 18, maxW: Z.w - 60, maxH: story ? 900 : small ? 560 : 720 });
    const topH = P.card.y - 70 - Z.top;
    if (topH >= 220) posterAbove(P, topH, head);
    else posterBeside(P, cardOpt, head);
  }
  // K, stacked: the photo over the top, the headline's blocks above the tape and the card
  function posterAbove(P, topH, head) {
    const Z = P.Z;
    P.kHead = head(Z.w - 60, topH - 60, 110);
    P.kPhoto = { x: 0, y: 0, w: Z.W, h: P.card.y - 40 };
    P.kTape = { y: P.card.y - 62, h: 36 };
    P.kHeadX = Z.left + pad(P.kHead) * 1.4;
    P.kHeadY = P.kTape.y - 34 - pad(P.kHead) - P.kHead.vh;
  }
  // K, side by side: the tape on top, the card on the right, the photo and the headline on the left
  function posterBeside(P, cardOpt, head) {
    const Z = P.Z, cw = Math.round(Z.w * 0.56), cx = Z.left + Z.w - cw / 2;
    P.kTape = { y: Z.top, h: 36 };
    const top = Z.top + 80, at = (y) => B.card(P, { ...cardOpt, cx, top: y, maxW: cw - 92, maxH: Z.bottom - top - 20, qrMax: 170, numberMax: 96 });
    P.card = at(top + (Z.bottom - top - at(0).h) / 2);
    const lw = P.card.x - 40 - Z.left;
    P.kPhoto = { x: 0, y: 0, w: P.card.x - 30, h: Z.H };
    P.kHead = head(lw - 50, Z.cH * 0.5, 90);
    P.kHeadX = Z.left + pad(P.kHead) * 1.4;
    P.kHeadY = Z.bottom - 20 - pad(P.kHead) - P.kHead.vh;
  }

  // ---------------------------------------------------------------- the acts
  // H: the grey photo zooms slowly; the bar drops, the headline is stamped on
  function opener(R, P, lt, d = 1) {
    const Z = P.Z;
    grey(R, P, 0, { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1, 1.12, win(lt, 0, d)), 0.4);
    bar(R, P, B.slide(lt, 0.12, 0.35));
    if (lt > 0) blocks(R, P, P.head, P.headX, P.headY, lt, 0.5, 'título');
  }
  // M, a page: the photo goes up into the top 40 %, the cells come in on the diagonal
  function benefits(R, P, A) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt, o = P.gridOpt;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, Z.W, Z.H);
    const h = pg.first ? lerp(Z.H, P.mPh, B.slide(lt, 0, 0.45)) : P.mPh;
    grey(R, P, 1 + pg.index, { x: 0, y: 0, w: Z.W, h }, lerp(1.08, 1, expoOut(win(lt, 0, 1.6))), 0.35);
    ctx.fillStyle = P.C.accent; ctx.fillRect(0, h - LINE / 2, Z.W, LINE);
    const G = P.mPages[pg.index];
    if (!G) return;
    const t0 = pg.first ? 0.35 : 0.1;
    cells(P, G).forEach((cl, j) => {
      const t1 = t0 + j * STEP, k = B.slide(lt, t1, 0.35);
      if (k <= 0) return;
      ctx.save(); ctx.translate(-(1 - k) * Z.W * 0.7, (1 - k) * Z.H * 0.5);
      B.quiet(R, k >= 0.999, () => B.bulletRow(R, { ...cl.row, h: cl.h }, cl.x, cl.y, o.w, { ...o, k: 1, lt, t1: t1 + 0.35, ink: WHITE,
        color: () => P.C.accent, box: { fill: INK, line: WHITE, lw: 6, off: 10, shadow: P.C.accent }, tileStyle: { line: WHITE, off: 0, lw: 4 } }));
      ctx.restore();
    });
  }
  // V: the next photo between black bands; the headline stamped on its board
  function whole(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt, V = P.vBoard;
    grey(R, P, 2, { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1, 1.1, win(lt, 0, A.d)), 0.6);
    const bk = B.slide(lt, 0.05, 0.35), band = Z.top + 40;
    ctx.fillStyle = INK;
    ctx.fillRect(0, -(1 - bk) * band, Z.W, band);
    ctx.fillRect(0, Z.H - band + (1 - bk) * band, Z.W, band);
    const y = Z.cy - V.h / 2;
    const tk = B.slide(lt, 0.2, 0.4);
    if (tk > 0) B.hazard(ctx, (1 - tk) * -Z.W, y + V.h + 60, Z.W, 44, P.C.accent, INK, lt * 70);
    ctx.save(); ctx.translate(B.shake(lt, 0.4 + B.STAMP, 6), 0);
    B.stamped(R, B.stamp(lt, 0.4), Z.W / 2, Z.cy, () => B.drawBoard(R, V, Z.left, y));
    ctx.restore();
  }
  // D, L: a page of boards stamped one after the other on black
  function boards(R, P, A, pages) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, Z.W, Z.H);
    ctx.fillStyle = P.C.accent; ctx.fillRect(0, Z.top - 40, Z.W, LINE);
    const st = pages[pg.index] || [];
    const top = Z.cy - B.stackH(st) / 2;
    st.forEach((r, j) => {
      const x = (Z.W - r.B.w) / 2, y = top + r.y, t0 = 0.12 + j * 0.2;
      ctx.save(); ctx.translate(B.shake(lt, t0 + B.STAMP, 6), 0);
      B.stamped(R, B.stamp(lt, t0), x + r.B.w / 2, y + r.B.h / 2, () => B.drawBoard(R, r.B, x, y));
      ctx.restore();
    });
  }
  // I, F: his line on a black board over the grey photo
  const lineAct = (key, i) => (R, A) => {
    const P = R.P, Z = P.Z, Bd = P[key];
    grey(R, P, i, { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1.06, 1, expoOut(win(A.lt, 0, 1))), 0.5);
    if (!Bd) return;
    const y = Z.cy - Bd.h / 2;
    B.stamped(R, B.stamp(A.lt, 0.1), Z.W / 2, Z.cy, () => B.drawBoard(R, Bd, Z.left, y));
  };
  // C: the phone on black between two orange lines
  function chatAct(R, P, A) {
    const { ctx } = R, Z = P.Z;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, Z.W, Z.H);
    ctx.fillStyle = P.C.accent;
    ctx.fillRect(0, Z.top - 40, Z.W, LINE); ctx.fillRect(0, Z.bottom + 30, Z.W, LINE);
    B.chatPhone(R, P, P.chat, A.lt);
  }
  // K: the poster. The photo, the headline's blocks, the tape runs in, the card lands.
  function poster(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, Z.W, Z.H);
    grey(R, P, 0, P.kPhoto, lerp(1.06, 1, expoOut(win(lt, 0, 1.2))), 0.4);
    blocks(R, P, P.kHead, P.kHeadX, P.kHeadY, lt, 0.08, 'título');
    const tk = B.slide(lt, 0.3, 0.35);
    if (tk > 0) B.hazard(ctx, (1 - tk) * -Z.W, P.kTape.y, Z.W, P.kTape.h, P.C.accent, INK, lt * 50);
    B.drawCard(R, P, P.card, lt, 0.5, { panel: WHITE, line: P.C.accent, box: P.C.accent, ink: INK, shadow: P.C.accent });
  }

  function sound(P) {
    const at = (k) => P.act(k);
    const lines = (L, t0) => L.lines.map((_, i) => t0 + i * STEP + B.STAMP);
    const hits = lines(P.head, 0.5);
    B.pageStarts(P, 'M').forEach((t, i) => { const G = P.mPages[i]; if (G) G.rows.forEach((_, j) => hits.push(t + (i ? 0.1 : 0.35) + j * STEP + 0.35)); });
    if (at('V')) hits.push(at('V').start + 0.7);
    for (const k of ['D', 'L']) B.pageStarts(P, k).forEach((t) => [0.42, 0.62, 0.82].forEach((d) => hits.push(t + d)));
    for (const k of ['I', 'F']) if (at(k)) hits.push(at(k).start + 0.4);
    if (at('K')) hits.push(...lines(P.kHead, at('K').start + 0.08), at('K').start + 0.8);
    return B.sound(P, hits);
  }

  RS.motion.register({
    id: 'contraste', name: 'Contraste', concept: 'Preto e branco com uma cor forte: fotografia a cinzento, o título carimbado em blocos e a caixa branca do número.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Barlow Condensed', weight: 800 } },
    palettes: {
      dark: { bg: '#000000', ink: '#FFFFFF', main: '#000000', accent: '#FF6A00' },
    },
    bgModes: ['dark'], photos: 3, travel: 'whip', pages: true,
    // every act arrives with the whip (none takes over from the one before)
    canonical: { M: null, V: null, D: null, L: null, C: null, K: null, O: null },
    needs: { V: ['M'] },
    colors(c) {
      // black words on the colour blocks
      c.accent = RS.util.ensureContrast(c.accent, INK, 6);
      c.tile = '#3A3A3A';
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => opener(R, R.P, A.lt, A.d),
      I: lineAct('Ib', 1),
      M: (R, A) => benefits(R, R.P, A),
      V: (R, A) => whole(R, R.P, A),
      D: (R, A) => boards(R, R.P, A, R.P.Ds),
      L: (R, A) => boards(R, R.P, A, R.P.Ls),
      F: lineAct('Fb', 2),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => poster(R, R.P, A),
      // O: the cut back to the first frame (the grey photo before the bar drops)
      O: (R) => opener(R, R.P, 0),
    },
    sound,
  });
})();
