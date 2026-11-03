// Video recipe «Stencil» (the bold poster «Stencil»): kraft card inside a
// thick black frame, the photos framed in black with an orange hard shadow,
// the words sprayed on through a stencil. Camera language: still frames,
// hard cuts (whip) between acts; things are stamped down and settle.
// Acts (see RS.motion.register): H the frame is traced, the photo framed, the
// headline sprayed on word by word; I and F his lines on a kraft board over
// the photo; M the benefits stamped (turned a little, then straight) beside a
// framed photo, a page at a time; V the next photo, the hazard tape runs
// across, the headline stamped; D the highlights as orange seals; L the
// positions on kraft plates; C the phone; K the poster: the headline, the
// photo, a black bar and the orange card rise from below (the number pulses);
// O back to the first frame.
(() => {
  const K = RS.motionKit, B = RS.boldKit, U = RS.util;
  const { win, expoOut, lerp, clamp } = K;
  const { INK } = B;
  const FRAME = 20; // the black frame's width (px)
  const SPRAY = 0.3; // one word's spray (s)
  const WORD = 0.11; // between two words (s)
  const TURN = [-2, 1.6, -1.2, 2, -1.6, 1.2].map((d) => (d * Math.PI) / 180);

  // a number in [0, 1) from two integers (the same every frame)
  const rand = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------------------------------------------------------------- the card
  // Kraft with faint diagonal stripes.
  function kraft(R, P) {
    const { ctx } = R, W = P.fmt.w, H = P.fmt.h;
    ctx.fillStyle = P.C.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let x = -H; x < W; x += 34) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
    ctx.stroke();
    ctx.restore();
  }
  // The black frame round the edge; k (0..1) of it traced from the top left.
  function frame(R, P, k = 1) {
    if (k <= 0) return;
    const { ctx } = R, W = P.fmt.w, H = P.fmt.h, len = 2 * (W + H);
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = FRAME * 2; ctx.lineCap = 'square';
    if (k < 1) ctx.setLineDash([len * k, len]);
    ctx.strokeRect(0, 0, W, H);
    ctx.restore();
  }
  // The black pill of the kicker (orange words) at (x, y)
  function pill(R, P, L, x, y) {
    B.hardBox(R.ctx, x, y, L.w + 56, L.vh + 36, { fill: INK, lw: 0, off: 0 });
    K.text(R, L, x + 28, y + 18, P.C.accent, 'left', 0, 'chamada');
  }

  // ---------------------------------------------------------------- the spray
  // The clip of a word being sprayed: dots filling its box as p goes 0 → 1.
  function wordClip(ctx, wd, L, i, p) {
    const top = wd.top - L.capPx * 0.25, h = L.lhPx + L.capPx * 0.1, x = wd.x - 6, w = wd.w + 12;
    if (p >= 1) { ctx.rect(x, top, w, h); return; }
    const r = Math.max(8, L.capPx * 0.13), n = Math.ceil((w * h) / (r * r * 1.4));
    for (let j = 0; j < n; j++) {
      const q = clamp((p * 1.3 - rand(i, j) * 0.9) / 0.4, 0, 1);
      if (q <= 0) continue;
      const cx = x + rand(j, i + 7) * w, cy = top + rand(j + 3, i) * h;
      ctx.moveTo(cx + r * q, cy); ctx.arc(cx, cy, r * q, 0, Math.PI * 2);
    }
  }
  // The spatter round a word, gone shortly after it is done.
  function spatter(ctx, wd, L, i, p, fade) {
    if (p <= 0 || fade >= 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - fade; ctx.fillStyle = INK;
    ctx.beginPath();
    for (let j = 0; j < 14; j++) {
      const a = rand(i, j + 50) * Math.PI * 2, d = (0.55 + rand(j, i + 9) * 0.5) * Math.max(wd.w, L.capPx) * 0.7 * Math.min(1, p * 2);
      const cx = wd.x + wd.w / 2 + Math.cos(a) * d, cy = wd.top + wd.h / 2 + Math.sin(a) * d * 0.6, r = 3 + rand(j + 11, i) * 7;
      ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }
  // A layout sprayed on word by word from t0; a plain text once all are done.
  function sprayText(R, L, x, y, color, lt, t0, tag) {
    const wds = K.words(L, x, y);
    const p = (i) => clamp((lt - t0 - i * WORD) / SPRAY, 0, 1);
    const done = wds.every((_, i) => p(i) >= 1);
    if (done) K.text(R, L, x, y, color, 'left', 0, tag);
    else {
      const { ctx } = R;
      ctx.save();
      ctx.beginPath();
      wds.forEach((wd, i) => { if (p(i) > 0) wordClip(ctx, wd, L, i, p(i)); });
      ctx.clip();
      B.quiet(R, false, () => K.text(R, L, x, y, color, 'left', 0, tag));
      ctx.restore();
    }
    wds.forEach((wd, i) => spatter(R.ctx, wd, L, i, p(i), win(lt, t0 + i * WORD + SPRAY, 0.25)));
  }
  // When the spray of a layout is done (s after t0).
  const sprayEnd = (L) => K.words(L, 0, 0).length * WORD + SPRAY;

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, W = Z.W;
    const small = Z.H <= 1100, story = Z.story;
    // H: the kicker and the headline at the top, the photo framed below
    P.kick = c.kicker ? K.fit(P, c.kicker, { font: F.bold, upper: true, maxSize: 54, minSize: 40, maxW: Z.w - 56, maxLines: 2 }) : null;
    const headMaxH = Z.cH * (story ? 0.32 : 0.36) - (P.kick ? P.kick.vh + 60 : 0);
    P.head = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 150, minSize: 56, maxW: Z.w, maxLines: 4, maxH: headMaxH, lh: 1.02 });
    P.kickY = Z.top + 10;
    P.headY = P.kickY + (P.kick ? P.kick.vh + 36 + 30 : 0);
    const phTop = P.headY + P.head.vh + 60;
    P.hPhoto = { x: Z.left + 10, y: phTop, w: Z.w - 30, h: Math.max(200, Z.bottom - 20 - phTop) };

    // M: a framed photo top right, the benefits under it, a page at a time
    const ph = story ? 560 : small ? 330 : 420;
    P.mPhoto = { x: W * 0.47, y: Z.top + 8, w: Z.left + Z.w - W * 0.47 - 10, h: ph };
    P.mTop = Z.top + ph + 70;
    const Ma = P.act('M');
    const rowOpt = { font: F.head, upper: P.upper, max: 68, w: Z.w, tile: small ? 84 : 100, pad: 22, gap: 26, maxH: Z.bottom - P.mTop };
    P.mPages = (Ma ? Ma.pages : []).map((items) => B.bulletRows(P, items, rowOpt));
    P.rowOpt = rowOpt;

    // V: the headline on a kraft board over the next photo
    const plate = U.mix(P.C.bg, '#FFFFFF', 0.25);
    P.plate = plate;
    P.vBoard = B.boardFit(Z.cH * 0.5, (k) => B.board(P, Z.w, [
      { text: c.headline || c.brandName || ' ', font: F.head, max: 120 * k, min: 56, color: INK, tag: 'título', upper: P.upper, lines: 4 },
    ], { box: { fill: plate, lw: 10, off: 18, shadow: P.C.accent } }));

    // D: the highlights as orange seals; L: the positions on kraft plates
    const room = Z.cH - 20;
    const fitStack = (make) => { for (let k = 1; ; k -= 0.08) { const st = B.stack(make(k), 50); if (B.stackH(st) <= room || k <= 0.5) return st; } };
    const Da = P.act('D'), La = P.act('L');
    P.Ds = (Da ? Da.pages : []).map((items) => fitStack((k) => items.map((i) => {
      const h = c.highlights[i], [vt, lt] = B.hlTags(h);
      return B.board(P, Z.w - 40, [
        { text: h.value || h.label, font: F.head, max: 170 * k, min: 64, color: INK, tag: vt, lines: 2 },
        { text: h.value ? h.label : '', font: F.bold, max: 64 * k, min: 44, color: INK, tag: lt, upper: P.upper, lines: 2 },
      ], { box: { fill: P.C.accent, lw: 10, off: 18, shadow: INK } });
    })));
    P.Ls = (La ? La.pages : []).map((items) => fitStack((k) => [
      ...(c.positionsTitle ? [B.board(P, Z.w, [{ text: c.positionsTitle, font: F.head, max: 76 * k, min: 44, color: P.C.accent, tag: 'título vagas', upper: P.upper, lines: 2 }], { box: { fill: INK, lw: 0, off: 0 } })] : []),
      ...items.map((i) => B.board(P, Z.w - 60, [{ text: c.positions[i], font: F.head, max: 76 * k, min: 44, color: INK, tag: 'vaga', upper: P.upper, lines: 2 }], { pad: 32, box: { fill: plate, lw: 8, off: 14, shadow: P.C.accent } })),
    ]));

    // I, F: his lines on a kraft board
    const lineB = (text, tag) => (text ? B.boardFit(Z.cH * 0.7, (k) => B.board(P, Z.w, [{ text, font: F.head, max: 96 * k, min: 48, color: INK, tag, lines: 6 }], { box: { fill: plate, lw: 10, off: 18, shadow: P.C.accent } })) : null);
    P.Ib = P.act('I') ? lineB(c.intro, 'intro') : null;
    P.Fb = P.act('F') ? lineB(c.closing, 'fecho') : null;

    // C: the phone
    const pw = Math.min(800, Z.w), phh = Math.min(1120, Z.cH - 60);
    P.chat = B.chat(P, (W - pw) / 2, Z.cy - phh / 2, pw, phh);

    // K: the orange card at the bottom, the headline and the photo above it;
    // when that leaves no room (square), the card on the right and they on the left
    const cardOpt = { font: F.head, bold: F.bold, upper: P.upper, qrMax: story ? 300 : small ? 170 : 230, numberMax: story ? 140 : 120 };
    P.card = B.card(P, { ...cardOpt, cx: W / 2, bottom: Z.bottom - 18, maxW: Z.w - 60, maxH: story ? 900 : small ? 560 : 720 });
    const topH = P.card.y - 70 - Z.top;
    if (topH >= 220) posterAbove(P, topH);
    else posterBeside(P, cardOpt);
  }
  // K, stacked: the headline left and the photo right above the card, the bar under it
  function posterAbove(P, topH) {
    const Z = P.Z, c = P.content, F = P.F, pw = Math.round(Z.w * 0.4);
    P.kPhoto = { x: Z.left + Z.w - pw, y: Z.top + 6, w: pw, h: topH - 16 };
    P.kHead = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 110, minSize: 48, maxW: Z.w - pw - 50, maxLines: 5, maxH: topH - 10, lh: 1.02 });
    P.kHeadY = Z.top + (topH - P.kHead.vh) / 2;
    P.kBar = { x: 0, y: P.card.y - 46 };
  }
  // K, side by side: the card on the right, the headline over the photo on the left
  function posterBeside(P, cardOpt) {
    const Z = P.Z, c = P.content, F = P.F;
    const cw = Math.round(Z.w * 0.56), cx = Z.left + Z.w - cw / 2;
    const at = (top) => B.card(P, { ...cardOpt, cx, top, maxW: cw - 92, maxH: Z.cH - 40, qrMax: 170, numberMax: 96 });
    P.card = at(Z.cy - at(0).h / 2);
    const lw = P.card.x - 50 - Z.left;
    P.kHead = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 96, minSize: 44, maxW: lw, maxLines: 5, maxH: Z.cH * 0.42, lh: 1.02 });
    P.kHeadY = Z.top + 10;
    const py = P.kHeadY + P.kHead.vh + 50;
    P.kPhoto = { x: Z.left + 6, y: py, w: lw - 16, h: Math.max(160, Z.bottom - 24 - py) };
    P.kBar = { x: P.card.x - 30, y: 0 };
  }

  // ---------------------------------------------------------------- the acts
  // H: the frame is traced, the photo stamps down, the headline is sprayed on
  function opener(R, P, lt) {
    const Z = P.Z;
    kraft(R, P);
    B.framed(R, P, B.photoOf(P, 0), P.hPhoto, { angle: 0.025, shadow: P.C.accent, off: 18, z: lerp(1.1, 1, expoOut(win(lt, 0, 1.6))) });
    if (P.kick) B.stamped(R, B.stamp(lt, 0.3, 0.25), Z.left + P.kick.w / 2, P.kickY + P.kick.vh / 2, () => pill(R, P, P.kick, Z.left, P.kickY));
    if (lt > 0) sprayText(R, P.head, Z.left, P.headY, INK, lt, P.kick ? 0.5 : 0.3, 'título');
    frame(R, P, B.slide(lt, 0, 0.6));
  }
  // M, a page: the framed photo slides in, the rows are stamped one after the other
  function benefits(R, P, A) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt;
    kraft(R, P);
    const k = pg.first ? B.slide(lt, 0.02, 0.35) : 1;
    ctx.save(); ctx.translate((1 - k) * (Z.W - P.mPhoto.x + 60), 0);
    B.framed(R, P, B.photoOf(P, 1 + pg.index), P.mPhoto, { angle: 0.025, shadow: P.C.accent, z: lerp(1.08, 1, expoOut(win(lt, 0, 1.6))) });
    ctx.restore();
    const M = P.mPages[pg.index];
    if (M) {
      let y = P.mTop;
      M.rows.forEach((row, j) => { stampRow(R, P, row, y, lt, 0.3 + j * 0.25, j); y += row.h + P.rowOpt.gap; });
    }
    frame(R, P);
  }
  // A benefit row stamped at t0: big and turned, then its size and straight
  function stampRow(R, P, row, y, lt, t0, j) {
    const s = B.stamp(lt, t0);
    if (s <= 0) return;
    const { ctx } = R, Z = P.Z, cx = Z.left + Z.w / 2, cy = y + row.h / 2;
    const turn = TURN[j % TURN.length] * (1 - expoOut(win(lt, t0, 0.5)));
    ctx.save();
    ctx.translate(cx, cy + B.shake(lt, t0 + B.STAMP, 6)); ctx.rotate(turn); ctx.translate(-cx, -cy);
    B.stamped(R, s, cx, cy, () => B.quiet(R, turn === 0, () => B.bulletRow(R, row, Z.left, y, Z.w, { ...P.rowOpt, k: 1, lt, t1: t0, ink: INK,
      color: () => INK, box: { fill: P.plate, lw: 8, off: 12, shadow: INK }, tileStyle: { ink: P.C.bg, line: INK, shadow: P.C.accent, off: 6, lw: 0 } })));
    ctx.restore();
  }
  // V: the next photo, the tape runs across side to side, the headline stamped
  function whole(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt, V = P.vBoard;
    B.photo(R, P, B.photoOf(P, 2), { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1, 1.1, win(lt, 0, A.d)));
    const y = Z.cy - V.h / 2;
    const tk = B.slide(lt, 0.05, 0.5);
    B.hazard(ctx, (tk - 1) * Z.W, y - 100, Z.W, 54, P.C.accent, INK, lt * 90);
    B.hazard(ctx, (1 - tk) * Z.W, y + V.h + 62, Z.W, 54, P.C.accent, INK, -lt * 90);
    ctx.save(); ctx.translate(0, B.shake(lt, 0.45 + B.STAMP));
    B.stamped(R, B.stamp(lt, 0.45), Z.W / 2, Z.cy, () => B.drawBoard(R, V, Z.left, y));
    ctx.restore();
    frame(R, P);
  }
  // D, L: a page of boards stamped one after the other (D's turned like seals)
  function boards(R, P, A, pages, turned) {
    const { ctx } = R, Z = P.Z, pg = K.page(A), lt = pg.lt;
    kraft(R, P);
    const st = pages[pg.index] || [];
    const top = Z.cy - B.stackH(st) / 2;
    st.forEach((r, j) => {
      const x = (Z.W - r.B.w) / 2, y = top + r.y, t0 = 0.12 + j * 0.22, cx = x + r.B.w / 2, cy = y + r.B.h / 2;
      ctx.save();
      ctx.translate(cx, cy + B.shake(lt, t0 + B.STAMP, 8)); ctx.rotate(turned ? TURN[j % TURN.length] : 0); ctx.translate(-cx, -cy);
      B.stamped(R, B.stamp(lt, t0), cx, cy, () => B.drawBoard(R, r.B, x, y));
      ctx.restore();
    });
    frame(R, P);
  }
  // I, F: his line on a kraft board over the photo
  const lineAct = (key, i) => (R, A) => {
    const P = R.P, Z = P.Z, Bd = P[key];
    B.photo(R, P, B.photoOf(P, i), { x: 0, y: 0, w: Z.W, h: Z.H }, lerp(1.06, 1, expoOut(win(A.lt, 0, 1))));
    if (Bd) B.stamped(R, B.stamp(A.lt, 0.1), Z.W / 2, Z.cy, () => B.drawBoard(R, Bd, Z.left, Z.cy - Bd.h / 2));
    frame(R, P);
  };
  // C: the phone on the kraft
  function chatAct(R, P, A) {
    kraft(R, P);
    B.chatPhone(R, P, P.chat, A.lt);
    frame(R, P);
  }
  // K: the poster. The headline and the photo stamp down, the black bar and
  // the orange card rise from below.
  function poster(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt;
    kraft(R, P);
    B.stamped(R, B.stamp(lt, 0.05), P.kPhoto.x + P.kPhoto.w / 2, P.kPhoto.y + P.kPhoto.h / 2,
      () => B.framed(R, P, B.photoOf(P, 0), P.kPhoto, { angle: 0.025, shadow: P.C.accent, z: lerp(1.06, 1, expoOut(win(lt, 0.05, 1.2))) }));
    B.stamped(R, B.stamp(lt, 0.15), Z.left + P.kHead.w / 2, P.kHeadY + P.kHead.vh / 2, () => K.text(R, P.kHead, Z.left, P.kHeadY, INK, 'left', 0, 'título'));
    const bar = P.kBar, rise = (1 - B.slide(lt, 0.2, 0.4)) * (Z.H - bar.y + 40);
    ctx.fillStyle = INK; ctx.fillRect(bar.x, bar.y + rise, Z.W - bar.x, Z.H - bar.y);
    B.drawCard(R, P, P.card, lt, 0.5, { panel: P.C.accent, box: '#FFFFFF', ink: INK, shadow: INK });
    frame(R, P);
  }

  function sound(P) {
    const H = P.act('H'), at = (k) => P.act(k);
    const hits = [0.3];
    B.pageStarts(P, 'M').forEach((t) => [0.3, 0.55, 0.8].forEach((d) => hits.push(t + d)));
    if (at('V')) hits.push(at('V').start + 0.75);
    for (const k of ['D', 'L']) B.pageStarts(P, k).forEach((t) => [0.42, 0.64, 0.86].forEach((d) => hits.push(t + d)));
    for (const k of ['I', 'F']) if (at(k)) hits.push(at(k).start + 0.4);
    if (at('K')) hits.push(at('K').start + 0.2, at('K').start + 0.8);
    // the spray: a hiss for every word of the headline
    const t0 = (H ? H.start : 0) + (P.kick ? 0.5 : 0.3);
    const n = Math.round(sprayEnd(P.head) / WORD);
    const hiss = Array.from({ length: Math.max(0, n - 2) }, (_, i) => ({ t: t0 + i * WORD, kind: 'noise', filter: 'highpass', f: 5000, dur: SPRAY * 0.8, gain: 0.12 }));
    return [...B.sound(P, hits), ...hiss].filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'stencil', name: 'Stencil', concept: 'Cartão kraft numa moldura preta grossa: as palavras são pintadas a spray e tudo o resto é carimbado.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Barlow Condensed', weight: 800 } },
    palettes: {
      light: { bg: '#C9A26A', ink: INK, main: INK, accent: '#FF7A00' },
    },
    bgModes: ['light'], photos: 3, travel: 'whip', pages: true,
    // every act arrives with the whip (none takes over from the one before)
    canonical: { M: null, V: null, D: null, L: null, C: null, K: null, O: null },
    needs: { V: ['M'] },
    colors(c) {
      // black words on the orange; the kraft stays kraft
      c.accent = U.ensureContrast(c.accent, INK, 5);
      c.ink = INK;
      c.tile = '#8A6B3E';
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => opener(R, R.P, A.lt),
      I: lineAct('Ib', 1),
      M: (R, A) => benefits(R, R.P, A),
      V: (R, A) => whole(R, R.P, A),
      D: (R, A) => boards(R, R.P, A, R.P.Ds, true),
      L: (R, A) => boards(R, R.P, A, R.P.Ls, false),
      F: lineAct('Fb', 2),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => poster(R, R.P, A),
      // O: the cut back to the first frame (the photo on the kraft, nothing sprayed yet)
      O: (R) => opener(R, R.P, 0),
    },
    sound,
  });
})();
