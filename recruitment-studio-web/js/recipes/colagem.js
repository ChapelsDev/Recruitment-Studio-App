// Video recipe «Colagem»: the ad's letters are windows onto the job site. The
// photos stay fixed behind the screen; letters, tiles and cube faces are
// openings onto them, so the camera can push through a letter into a photo
// with no cut. Each photo's focus («Enquadrar») sits at the centre of the
// frame, or of its tile or face. Camera language: always forward (push-ins); one pull-out
// closes the loop. H: the headline lines open onto photos, the camera goes
// through a letter; M: that photo splits into a collage with the benefits on
// tape; V: the collage lines up and wraps into a cube, the camera pushes into
// a face; D: the salary on a black band, one photo tile per vacancy; L: the
// positions on tape; C: the phone comes forward; K: the camera pushes into
// the phone, the bubble becomes the button; O: a photo tile grows over the
// card and the camera comes out of the first line's letter. 10–30 s: I and F
// put his line on tape over a photo; M, D and L show a page at a time and the
// camera pushes through to the next page's photo.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { lerp, win, expoOut, expoIn, expoInOut, spring, rrect, clamp } = K;
  const TILE = 240, GAP = 12; // the strip the collage becomes before it wraps into a cube
  const SLOT = [1, 2, 3, 0]; // cube face k (front, right, back, left) ← strip slot

  // ---------------------------------------------------------------- photos
  // The box on the frame (px) around points drawn under the current transform.
  function onScreen(R, pts) {
    const m = R.ctx.getTransform();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      const sx = (m.a * x + m.c * y + m.e) / R.scale, sy = (m.b * x + m.d * y + m.f) / R.scale;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const corners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
  // A screen-fixed photo seen through a path (plain shapes: a clip is enough).
  // The photo's focus («Enquadrar») sits at the centre of `around` (the points
  // of a tile or face; the frame when none), so a tile shows its photo's
  // subject, and a tile that grows to the frame is the frame's photo.
  function photoIn(R, P, i, path, around) {
    const { ctx } = R, img = P.ph(i);
    const box = around ? onScreen(R, around) : null;
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.clip();
    ctx.setTransform(R.scale, 0, 0, R.scale, 0, 0);
    if (img) K.screenPhoto(ctx, img, P.fmt, R.t, P.timeline.duration, i, P.focusOf(img), box);
    else { ctx.fillStyle = P.C.tile; ctx.fillRect(0, 0, P.fmt.w, P.fmt.h); }
    ctx.restore();
  }
  const fullPhoto = (R, P, i) => photoIn(R, P, i, (g) => { g.save(); g.setTransform(R.scale, 0, 0, R.scale, 0, 0); g.rect(-20, -20, P.fmt.w + 40, P.fmt.h + 40); g.restore(); });
  // the photo of tile i of collage page p (page 1's first tile: the photo the camera came through)
  const tilePhoto = (P, i, p = 0) => (i === 0 && p === 0 ? P.throughPhoto : i + 3 + p * 4);

  // The deepest point inside a line's letters (a chamfer distance on its mask).
  function inside(L, ln) {
    const k = 0.25, w = Math.ceil(ln.w * k) + 8, h = Math.ceil(L.lhPx * k) + 8;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.scale(k, k);
    K.fillText(g, ln.text, 8, L.capPx + 4, L, '#fff');
    const d = g.getImageData(0, 0, w, h).data;
    const dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = d[i * 4 + 3] > 128 ? 1e6 : 0;
    for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - w] + 1, dist[i - w - 1] + 1.4, dist[i - w + 1] + 1.4); }
    for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x > 0; x--) { const i = y * w + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + w] + 1, dist[i + w + 1] + 1.4, dist[i + w - 1] + 1.4); }
    let best = 0, bi = -1;
    for (let i = 0; i < w * h; i++) if (dist[i] > best && dist[i] < 1e5) { best = dist[i]; bi = i; }
    if (bi < 0) return { x: ln.x + ln.w / 2, y: ln.top + L.capPx / 2, r: 6 };
    return { x: ln.x + (bi % w) / k - 8, y: ln.top + Math.floor(bi / w) / k - 4, r: best / k };
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    const CX = Z.W / 2;
    P.CX = CX;
    // from the camera's anchor (the zone's centre) to the farthest corner
    P.halfDiag = Math.hypot(CX, Math.max(Z.cy, Z.H - Z.cy));
    const ph = P.photos;
    P.ph = (i) => (ph.length ? ph[((i % ph.length) + ph.length) % ph.length] : null);
    // the headline, each line an opening onto its own photo
    const head = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 330, minSize: 110, maxW: Z.w + 60, maxLines: 4, lh: 0.98, maxH: Z.cH * 0.8 });
    P.head = head;
    P.kicker = c.kicker ? K.fit(P, c.kicker, { font: F.head, upper: true, track: 0.04, maxSize: 64, minSize: 40, maxW: Z.w - 60, maxLines: 2 }) : null;
    const kh = P.kicker ? P.kicker.vh + 80 : 0;
    P.headTop = Z.cy - (kh + head.vh) / 2 + kh;
    P.kickerY = P.headTop - kh + 20;
    P.lines = head.lines.map((ln, i) => ({ text: ln, w: head.widths[i], x: CX - head.widths[i] / 2, top: P.headTop + i * head.lhPx }));
    const l0 = P.lines[0];
    P.z0 = Math.min(1.6, (Z.w + 80) / l0.w, (Z.cH * 0.8) / head.capPx);
    P.cam0 = { x: CX, y: l0.top + head.capPx / 2, z: P.z0 };
    const bottom = P.lines[P.lines.length - 1].top + head.capPx, topAll = P.kicker ? P.kickerY - 30 : P.headTop;
    P.camAll = { x: CX, y: (topAll + bottom) / 2, z: Math.min(1, (Z.cH * 0.92) / (bottom - topAll), (Z.w + 80) / Math.max(...head.widths, P.kicker ? P.kicker.w + 60 : 0)) };
    // the points deep inside a letter that the camera goes through
    P.throughLine = Math.min(1, P.lines.length - 1);
    P.through = inside(head, P.lines[P.throughLine]);
    P.through0 = inside(head, l0);
    P.throughPhoto = P.throughLine;

    // benefits on yellow tape over the collage, a collage per page (the camera
    // pushes through the middle into the next one)
    const ROT = [-0.03, 0.025, -0.02];
    P.labelPages = (Ma ? Ma.pages : []).map((items) => {
      const labels = items.map((i, j) => ({ L: K.fit(P, c.benefits[i], { font: F.head, upper: P.upper, maxSize: 84, minSize: 50, maxW: Z.w - 100, maxLines: 2, lh: 1.02 }), rot: ROT[j % 3] }));
      let ly = 0;
      for (const lb of labels) { lb.h = lb.L.vh + 56; lb.w = lb.L.w + 70; lb.dy = ly; ly += lb.h + 40; }
      labels.forEach((lb) => { lb.y = Z.cy - (ly - 40) / 2 + lb.dy; });
      return labels;
    });
    P.lastM = Math.max(0, P.labelPages.length - 1);
    // the cube (from the last collage); which face is in front when the camera goes in
    P.S = Math.min(560, Z.cH * 0.46);
    P.lidHead = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 130, minSize: 50, maxW: P.S - 70, maxLines: 4, lh: 0.98, maxH: P.S - 60 });
    const st = cubeState(P, 1.99);
    P.front = st.faces.reduce((a, b) => (b.facing > a.facing ? b : a));
    P.stage = P.act('V') ? tilePhoto(P, P.front.slot, P.lastM) : P.throughPhoto;

    // the highlights, a page at a time over a photo: a value on a black band
    // (counting up when it is a plain number) with its label; the vacancies as
    // one photo tile each, then their words on a band
    const hl = c.highlights;
    const layoutNumbers = (items) => {
      const blocks = items.map((i) => {
        const h = hl[i];
        if (h.role === 'vacancies') {
          const vacN = h.count != null ? Math.min(24, h.count) : 0, per = vacN ? Math.min(vacN, 6) : 1;
          return { vac: true, hl: h, vacN, per, rows: vacN ? Math.ceil(vacN / per) : 0, L: K.fit(P, [h.value, h.label].filter(Boolean).join(' '), { font: F.head, upper: P.upper, maxSize: 150, minSize: 70, maxW: Z.w, maxLines: 2 }) };
        }
        const L = K.fit(P, h.value || h.label, { font: F.head, maxSize: items.length > 1 ? 240 : 300, minSize: 100, maxW: Z.w + 20, maxLines: 2, lh: 1 });
        const label = h.value && h.label ? K.fit(P, h.label, { font: F.head, upper: P.upper, maxSize: 92, minSize: 50, maxW: Z.w, maxLines: 2 }) : null;
        return { hl: h, L, label, count: h.value && h.count != null ? h.count : null, H: L.vh + (label ? label.vh + 30 : 0) + 120 };
      });
      const fixed = blocks.reduce((a, b) => a + (b.vac ? 20 + b.L.vh + 70 : b.H), 0) + 50 * Math.max(0, blocks.length - 1);
      for (const b of blocks) if (b.vac) { b.tile = b.rows ? clamp((Z.cH - 40 - fixed) / b.rows - 14, 60, 140) : 0; b.H = b.rows * (b.tile + 14) + 20 + b.L.vh + 70; }
      const H = blocks.reduce((a, b) => a + b.H, 0) + 50 * Math.max(0, blocks.length - 1);
      let y = Z.cy - H / 2;
      for (const b of blocks) { b.y = y; y += b.H + 50; }
      return blocks;
    };
    P.numPages = (Da ? Da.pages : []).map(layoutNumbers);

    // the positions, each on its own tape, a page at a time
    const posTitle = c.positionsTitle ? K.fit(P, c.positionsTitle, { font: F.head, upper: P.upper, maxSize: 70, minSize: 44, maxW: Z.w - 40, maxLines: 1 }) : null;
    P.posPages = (La ? La.pages : []).map((items) => {
      let size = 76, pgap = 26, pg;
      for (;;) {
        const pos = items.map((i, j) => ({ L: K.fit(P, c.positions[i], { font: F.head, upper: P.upper, maxSize: size, minSize: Math.min(46, size), maxW: Z.w - 80, maxLines: 2, lh: 1.02 }), rot: j % 2 ? 0.02 : -0.02 }));
        let py = 0;
        for (const p of pos) { p.h = p.L.vh + 48; p.w = p.L.w + 64; p.dy = py; py += p.h + pgap; }
        pg = { title: posTitle, pos, posH: py - pgap + (posTitle ? posTitle.vh + 60 : 0) };
        if (pg.posH <= Z.cH * 0.92 || size <= 40) break;
        size = Math.max(40, size - 8); pgap = 16;
      }
      pg.posTop = Z.cy - pg.posH / 2;
      return pg;
    });

    // his intro and closing line, a tape per line
    const tapesOf = (text) => {
      if (!text) return null;
      const L = K.fit(P, text, { font: F.head, upper: P.upper, maxSize: 96, minSize: 50, maxW: Z.w - 100, maxLines: 5, lh: 1.02, maxH: Z.cH * 0.6 });
      const list = L.lines.map((ln, i) => ({ L: K.line(P, ln, { font: F.head, size: L.size }), rot: ROT[i % 3] }));
      let y = 0;
      for (const tp of list) { tp.h = tp.L.vh + 56; tp.dy = y; y += tp.h + 30; }
      list.forEach((tp) => { tp.y = Z.cy - (y - 30) / 2 + tp.dy; });
      return list;
    };
    P.introTapes = P.act('I') ? tapesOf(c.intro) : null;
    P.closingTapes = P.act('F') ? tapesOf(c.closing) : null;

    // the photo behind each page: the one the camera went into, then a new one
    // on every page the camera pushes through to (the list starts on the last
    // numbers' photo: the numbers slide away over it)
    let shot = P.stage, k = 0;
    const next = () => P.stage + 5 + (k++) * 3;
    P.backD = P.numPages.map((_, p) => (p === 0 ? shot : (shot = next())));
    P.backL = P.posPages.map((_, p) => (p === 0 ? shot : (shot = next())));
    P.backEnd = shot;

    // the phone (dark screen, so the push-in lands on black)
    const phh = Math.min(1220, Z.cH - 10), pw = Math.min(800, Z.w);
    P.phone = { x: CX - pw / 2, y: Z.cy - phh / 2, w: pw, h: phh };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.head, fontStrong: F.head, radius: (70 * pw) / 800,
      colors: { screen: '#141414', head: '#000000', headInk: '#FFFFFF', field: '#262626', fieldInk: '#FFFFFF', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: C.accent } });

    // the card
    const card = {};
    if (c.contact) {
      card.number = K.fit(P, c.contact.display, { font: F.head, maxSize: 150, minSize: 70, maxW: Z.w + 40, maxLines: 1 });
      card.cta = K.line(P, c.contact.cta, { font: F.head, size: 74, upper: true });
      card.pill = { h: 160, w: Math.min(Z.w + 40, card.cta.w + 220) };
      card.hint = K.line(P, c.contact.hint, { font: F.head, size: 54, upper: P.upper });
      const rest = card.number.vh + 60 + card.pill.h + (c.qr ? 60 + 50 + card.hint.vh : 0);
      card.qr = c.qr ? clamp(Z.cH - rest - 40, 240, 450) : 0;
      card.h = rest + card.qr;
      let y = Z.cy - card.h / 2;
      card.numberY = y; y += card.number.vh + 60;
      card.pillY = y; y += card.pill.h + 60;
      card.qrY = y; card.hintY = y + card.qr + 50;
    } else {
      // no WhatsApp number: the brand and the ad's own contacts (or its headline), on tape
      const lines = P.content.contacts.slice(0, 3); // the ad's contacts, unless hidden
      card.lines = lines.map((s) => K.fit(P, s, { font: F.head, upper: P.upper, maxSize: 80, minSize: 48, maxW: Z.w - 80, maxLines: 2 }));
      card.tags = lines.map(() => 'contacto');
      if (c.brandName && c.showLogo) { card.lines.unshift(K.fit(P, c.brandName, { font: F.head, upper: P.upper, maxSize: 110, minSize: 50, maxW: Z.w - 80, maxLines: 2 })); card.tags.unshift('marca'); }
      if (!card.lines.length) { card.lines = [K.fit(P, c.headline || ' ', { font: F.head, upper: P.upper, maxSize: 120, minSize: 60, maxW: Z.w - 80, maxLines: 4 })]; card.tags = ['contacto']; }
      card.h = card.lines.reduce((a, L) => a + L.vh + 56 + 30, -30);
      let y = Z.cy - card.h / 2;
      card.linesY = card.lines.map((L) => { const r = y; y += L.vh + 56 + 30; return r; });
    }
    P.card = card;
    // the job's photos along the top and bottom edges, when the card leaves room
    const room = (Z.H - card.h) / 2 - 40;
    P.edge = room >= 120 ? Math.min(220, room) : 0;
  }

  // ---------------------------------------------------------------- H and the loop: letters
  const toScreen = (g, P, cam) => { g.translate(P.CX, P.Z.cy); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y); };
  const zIn = (r) => 2000 / Math.max(6, r);
  function headCam(P, t) {
    const n = P.lines.length, Z = P.Z;
    const fit = (upto) => {
      const ls = P.lines.slice(0, upto + 1);
      const top = ls[0].top, bottom = ls[ls.length - 1].top + P.head.capPx;
      return { x: P.CX, y: (top + bottom) / 2, z: Math.min(P.z0, (Z.w + 80) / Math.max(...ls.map((l) => l.w)), (Z.cH * 0.9) / (bottom - top)) };
    };
    let c = P.cam0;
    const step = (to, t0, d = 0.4) => { const e = expoInOut(win(t, t0, d)); c = { x: lerp(c.x, to.x, e), y: lerp(c.y, to.y, e), z: Math.exp(lerp(Math.log(c.z), Math.log(to.z), e)) }; };
    if (n > 1) step(fit(1), 0.02);
    if (n > 2) step(fit(Math.min(n - 1, 3)), 0.52);
    step(P.camAll, 1.02);
    // through the letter (the push accelerates into it)
    const e = expoIn(win(t, 1.5, 0.5));
    if (e > 0) c = { x: lerp(c.x, P.through.x, Math.min(1, e * 3)), y: lerp(c.y, P.through.y, Math.min(1, e * 3)), z: Math.exp(lerp(Math.log(c.z), Math.log(zIn(P.through.r)), e)) };
    return c;
  }
  // the loop: from deep inside the first line's letter back out to the first frame
  function loopCam(P, lt) {
    const e = expoOut(win(lt, 0.45, 0.5));
    return { x: lerp(P.through0.x, P.cam0.x, e), y: lerp(P.through0.y, P.cam0.y, e), z: Math.exp(lerp(Math.log(zIn(P.through0.r)), Math.log(P.cam0.z), e)) };
  }
  // screen speed of the camera (px/s): its move plus its zoom at the frame's edge
  function camSpeed(f, t) {
    const a = f(t - 1 / 240), b = f(t + 1 / 240), c = f(t);
    const v = Math.hypot((b.x - a.x) * c.z, (b.y - a.y) * c.z) * 120;
    return { v, vx: (b.x - a.x) * c.z * 120, vy: (b.y - a.y) * c.z * 120, zoom: Math.abs(Math.log(b.z / a.z)) * 120 * 900 };
  }
  function letters(R, P, cam, t, only0, kicker) {
    const { ctx } = R, L = P.head;
    // deep inside a letter the opening covers the frame: it is simply the photo
    const deep = (pt) => pt.r * cam.z > P.halfDiag + 20 && Math.hypot((pt.x - cam.x) * cam.z, (pt.y - cam.y) * cam.z) < 4;
    if (!only0 && deep(P.through)) { fullPhoto(R, P, P.throughPhoto); return; }
    if (only0 && deep(P.through0)) { fullPhoto(R, P, 0); return; }
    P.lines.forEach((ln, i) => {
      const t0 = Math.min(i - 1, 2) * 0.5 + 0.02;
      if (i > 0 && (only0 || t < t0)) return;
      const rise = i === 0 ? 0 : (1 - expoOut(win(t, t0, 0.32))) * 400;
      K.opening(R, P.ph(i), (g) => { g.save(); toScreen(g, P, cam); K.fillText(g, ln.text, ln.x, ln.top + L.capPx + rise, L, '#fff'); g.restore(); }, i, P.C.tile, P.focusOf(P.ph(i)));
      if (rise === 0 && cam.z < 3) { ctx.save(); toScreen(ctx, P, cam); R.rec(ln.x, ln.top, ln.w, L.capPx, 'título', ln.text); ctx.restore(); }
    });
    // the kicker slapped on yellow tape
    if (kicker && P.kicker && t >= 1.02) {
      const s = lerp(1.25, 1, expoOut(win(t, 1.02, 0.3)));
      ctx.save(); toScreen(ctx, P, cam);
      ctx.translate(P.CX, P.kickerY + P.kicker.vh / 2); ctx.rotate(-0.025); ctx.scale(s, s);
      const w = P.kicker.w + 60, h = P.kicker.vh + 40;
      ctx.fillStyle = P.C.accent; ctx.fillRect(-w / 2, -h / 2, w, h);
      K.text(R, P.kicker, -P.kicker.w / 2, -P.kicker.vh / 2, P.C.tapeInk, 'center', P.kicker.w, 'chamada');
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- M: the collage
  function slotRect(P, s) { return { x: P.CX - (4 * TILE + 3 * GAP) / 2 + s * (TILE + GAP), y: P.Z.cy - TILE / 2, w: TILE, h: TILE }; }
  // Tiles: 1 → 2 → 3 → 4 (the first collage; the next ones arrive split);
  // on the last collage they line up as a strip.
  function tiles(P, lt, first = true, last = true) {
    const W = P.Z.W, H = P.Z.H, G = 16;
    const split = (t0) => (first ? expoInOut(win(lt, t0, 0.36)) : 1);
    const s1 = split(0), s2 = split(0.5), s3 = split(1.0);
    const strip = last ? expoInOut(win(lt, 1.5, 0.45)) : 0;
    const mx = lerp(W, W / 2, s1), myR = lerp(H, H / 2, s2), myL = lerp(H, H / 2, s3);
    // photo 1 is the one the camera came through; the others arrive with their tiles
    const list = [
      { i: 0, x: 0, y: 0, w: mx - (G / 2) * s1, h: myL - (G / 2) * s3 },
      { i: 1, x: mx + G / 2, y: lerp(-H, 0, s1), w: W - mx - G / 2, h: myR - (G / 2) * s2 },
      { i: 2, x: mx + G / 2, y: myR + G / 2, w: W - mx - G / 2, h: H - myR - G / 2 },
      { i: 3, x: 0, y: myL + G / 2, w: mx - (G / 2) * s1, h: H - myL - G / 2 },
    ].filter((r, k) => k < 2 || (k === 2 ? s2 > 0 : s3 > 0));
    return list.map((r) => {
      const q = slotRect(P, r.i);
      return { i: r.i, x: lerp(r.x, q.x, strip), y: lerp(r.y, q.y, strip), w: lerp(r.w, q.w, strip), h: lerp(r.h, q.h, strip) };
    });
  }
  function tape(R, P, L, cx, cy, rot, tag) {
    const { ctx } = R;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    const w = L.w + 70, h = L.vh + 56;
    ctx.fillStyle = P.C.accent; ctx.fillRect(-w / 2, -h / 2, w, h);
    K.text(R, L, -L.w / 2, -L.vh / 2, P.C.tapeInk, 'center', L.w, tag);
    ctx.restore();
  }
  // when tape i of a collage page is slapped on
  const labelT0 = (first, i) => (first ? 0.05 + i * 0.5 : 0.4 + i * 0.45);
  function collage(R, P, idx, lt) {
    const first = idx === 0, last = idx === P.lastM;
    for (const r of tiles(P, lt, first, last)) if (r.w >= 1 && r.h >= 1) photoIn(R, P, tilePhoto(P, r.i, idx), (g) => g.rect(r.x, r.y, r.w, r.h), corners(r));
    // a benefit on yellow tape per beat; on the last collage the tapes then fly off
    const off = last ? expoIn(win(lt, 1.5, 0.35)) : 0;
    (P.labelPages[idx] || []).forEach((lb, i) => {
      const t0 = labelT0(first, i);
      if (lt < t0) return;
      const k = expoOut(win(lt, t0, 0.3)), side = i % 2 ? 1 : -1;
      if (off >= 1) return;
      tape(R, P, lb.L, P.CX + (1 - k) * side * 1300 - off * side * 1500, lb.y + lb.h / 2, lb.rot, 'vantagem');
    });
  }
  const collageSpeed = (P, idx, lt) => Math.max(...(idx === 0 ? [0, 0.5, 1.0] : []).map((t0) => Math.abs(K.speed((x) => expoInOut(win(x, t0, 0.36)) * P.Z.W / 2, lt))),
    idx === P.lastM ? Math.abs(K.speed((x) => expoInOut(win(x, 1.5, 0.45)) * 700, lt)) : 0, ...(P.labelPages[idx] || []).map((_, i) => Math.abs(K.speed((x) => expoOut(win(x, labelT0(idx === 0, i), 0.3)) * 1300, lt))),
    idx === P.lastM ? Math.abs(K.speed((x) => expoIn(win(x, 1.5, 0.35)) * 1500, lt)) : 0);

  // ---------------------------------------------------------------- V: the strip wraps into a cube
  function cubeState(P, lt) {
    const S = P.S, h = S / 2, CX = P.CX, CY = P.Z.cy;
    const fold = expoInOut(win(lt, 0, 0.5));
    const yaw = 0.62 + (Math.PI / 2) * (expoInOut(win(lt, 0.5, 0.45)) + expoInOut(win(lt, 1.0, 0.45)));
    const pitch = 0.42;
    const pr = (X, Y, Zc) => {
      const x1 = X * Math.cos(yaw) + Zc * Math.sin(yaw), z1 = -X * Math.sin(yaw) + Zc * Math.cos(yaw);
      return [CX + x1, CY + 40 - (Y * Math.cos(pitch) - z1 * Math.sin(pitch)), z1 * Math.cos(pitch) + Y * Math.sin(pitch)];
    };
    const faces = [0, 1, 2, 3].map((k) => {
      const a = (k * Math.PI) / 2;
      const nx = Math.sin(a), nz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
      const co = pr(nx * h - tx * h, h, nz * h - tz * h), cu = pr(nx * h + tx * h, h, nz * h + tz * h), cv = pr(nx * h - tx * h, -h, nz * h - tz * h);
      const s = SLOT[k], r = slotRect(P, s);
      const mix = (p, q) => [lerp(p[0], q[0], fold), lerp(p[1], q[1], fold)];
      return { k, slot: s, o: mix([r.x, r.y], co), u: mix([r.x + r.w, r.y], cu), v: mix([r.x, r.y + r.h], cv), facing: Math.cos(a + yaw), depth: lerp(0, (co[2] + cu[2] + cv[2]) / 3, fold) };
    });
    const top = { o: pr(-h, h, -h), u: pr(h, h, -h), v: pr(-h, h, h) };
    return { faces, top, fold, S };
  }
  function cube(R, P, lt) {
    const { ctx } = R;
    const st = cubeState(P, lt);
    // the camera pushes into the front face (its photo fills the screen)
    const push = expoIn(win(lt, 1.5, 0.5));
    if (push > 0.97) { fullPhoto(R, P, P.stage); return; }
    ctx.save();
    if (push > 0) {
      const f = P.front;
      const fx = f.o[0] + (f.u[0] - f.o[0]) / 2 + (f.v[0] - f.o[0]) / 2, fy = f.o[1] + (f.u[1] - f.o[1]) / 2 + (f.v[1] - f.o[1]) / 2;
      const z = Math.exp(lerp(0, Math.log(16), push));
      ctx.translate(P.CX, P.Z.cy); ctx.scale(z, z); ctx.translate(-lerp(P.CX, fx, Math.min(1, push * 4)), -lerp(P.Z.cy, fy, Math.min(1, push * 4)));
    }
    const list = st.faces.filter((f) => st.fold < 0.6 || f.facing > 0.01).sort((a, b) => a.depth - b.depth);
    for (const f of list) {
      const w = [f.u[0] + f.v[0] - f.o[0], f.u[1] + f.v[1] - f.o[1]];
      photoIn(R, P, tilePhoto(P, f.slot, P.lastM), (g) => { g.moveTo(f.o[0], f.o[1]); g.lineTo(f.u[0], f.u[1]); g.lineTo(w[0], w[1]); g.lineTo(f.v[0], f.v[1]); g.closePath(); }, [f.o, f.u, w, f.v]);
    }
    // the lid: the headline on yellow (the title gains volume)
    if (st.fold > 0.5 && push < 0.4) {
      const k = expoOut(win(st.fold, 0.5, 0.5));
      const { o, u, v } = st.top, S = st.S;
      const cxl = (u[0] + v[0]) / 2, cyl = (u[1] + v[1]) / 2;
      ctx.translate(cxl, cyl); ctx.scale(k, k); ctx.translate(-cxl, -cyl);
      ctx.transform((u[0] - o[0]) / S, (u[1] - o[1]) / S, (v[0] - o[0]) / S, (v[1] - o[1]) / S, o[0], o[1]);
      ctx.fillStyle = P.C.accent; ctx.fillRect(0, 0, S, S);
      const L = P.lidHead;
      const rr = R.rec; if (k < 0.95 || push > 0) R.rec = () => {};
      K.text(R, L, 35, (S - L.vh) / 2, P.C.tapeInk, 'center', S - 70, 'título');
      R.rec = rr;
    }
    ctx.restore();
  }
  const cubeSpeed = (P, lt) => Math.max(Math.abs(K.speed((x) => expoInOut(win(x, 0, 0.5)) * 400, lt)), ...[0.5, 1.0].map((t0) => Math.abs(K.speed((x) => expoInOut(win(x, t0, 0.45)) * P.S * 1.2, lt))));

  // ---------------------------------------------------------------- D: numbers
  // a text drawn now but recorded only once it has arrived
  function quietIf(R, cond, draw) {
    const rr = R.rec;
    if (cond) R.rec = () => {};
    try { draw(); } finally { R.rec = rr; }
  }
  // when block j of a numbers page arrives (a next page lands after the push)
  const numT0 = (first, j) => (j === 0 ? (first ? 0 : 0.35) : 1.0);
  function numbers(R, P, idx, lt, leave) {
    const { ctx } = R, C = P.C, Z = P.Z, CX = P.CX;
    (P.numPages[idx] || []).forEach((b, j) => {
      const t0 = numT0(idx === 0, j);
      if (lt < t0) return;
      let y = b.y;
      if (b.vac) {
        // one photo tile per vacancy; then the vacancies on a band
        const n = b.vacN, per = b.per, size = b.tile, gap = 14;
        const x0 = CX - (per * size + (per - 1) * gap) / 2;
        for (let i = 0; i < n; i++) {
          const k = spring(win(lt, t0 + (i / n) * 0.4, 0.25));
          if (k <= 0) continue;
          const x = x0 + (i % per) * (size + gap) + leave, yy = y + Math.floor(i / per) * (size + gap);
          ctx.save(); ctx.translate(x + size / 2, yy + size / 2); ctx.scale(k, k);
          ctx.fillStyle = C.accent; ctx.fillRect(-size / 2 - 6, -size / 2 - 6, size + 12, size + 12);
          const img = P.ph(i + 2);
          if (img) K.cover(ctx, img, -size / 2, -size / 2, size, size, P.focusOf(img)); else { ctx.fillStyle = C.tile; ctx.fillRect(-size / 2, -size / 2, size, size); }
          ctx.restore();
        }
        y += b.rows * (size + gap) + 20;
        const tb = t0 + (n ? 0.5 : 0);
        if (lt >= tb) {
          const vk = expoOut(win(lt, tb, 0.3));
          ctx.fillStyle = C.bg; ctx.fillRect(leave, y, Z.W * vk, b.L.vh + 70);
          if (vk > 0.9) K.text(R, b.L, Z.left + leave, y + 35, '#FFFFFF', 'center', Z.w, 'vagas');
        }
        return;
      }
      // a black band opens, the value counts up on it (or shows as written); then its label
      const bk = expoOut(win(lt, t0, 0.3));
      ctx.fillStyle = C.bg; ctx.fillRect(-leave, y, Z.W * bk, b.H);
      const n = b.count != null ? Math.round(b.count * expoOut(win(lt, t0 + 0.05, 0.7))) : null;
      const counting = n != null && n !== b.count;
      const L = counting ? K.line(null, `${b.hl.prefix}${n}${b.hl.suffix}`, { font: P.F.head, size: b.L.size }) : b.L;
      if (lt >= t0 + 0.05) quietIf(R, counting || bk < 0.95, () => K.text(R, L, Z.left - leave, y + 50, C.accentText, 'center', Z.w, b.hl.role === 'salary' ? 'salário' : 'destaque'));
      if (b.label && lt >= t0 + 0.5) {
        const pk = expoOut(win(lt, t0 + 0.5, 0.3)), ly = y + 50 + b.L.vh + 30;
        ctx.save(); ctx.beginPath(); ctx.rect(0, ly - b.label.size * 0.4, Z.W, b.label.vh + b.label.size * 0.75); ctx.clip();
        quietIf(R, pk < 0.95, () => K.text(R, b.label, Z.left - leave, ly + (1 - pk) * 120, '#FFFFFF', 'center', Z.w, b.hl.role === 'salary' ? 'período' : 'rótulo'));
        ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------- L: positions on tape
  const posAt = (pg, i, first = true) => { const n = pg.pos.length; return (first ? 0.1 : 0.4) + Math.min(3, Math.floor((i * 4) / Math.max(4, n))) * (first ? 0.5 : 0.4) + (n > 4 && i === n - 1 ? 0.12 : 0); };
  function positions(R, P, idx, lt, out) {
    const { ctx } = R, C = P.C, CX = P.CX;
    const pg = P.posPages[idx];
    if (!pg) return;
    // the camera pushes through the tapes (they grow past it)
    ctx.save();
    if (out > 0) { const z = 1 + out * 6; ctx.translate(CX, P.Z.cy); ctx.scale(z, z); ctx.translate(-CX, -P.Z.cy); }
    const rr = R.rec; if (out > 0) R.rec = () => {};
    let y = pg.posTop;
    if (pg.title) {
      const k = expoOut(win(lt, 0.02, 0.3));
      ctx.fillStyle = C.bg; ctx.fillRect(CX - (pg.title.w + 60) / 2, y - 20, (pg.title.w + 60) * k, pg.title.vh + 40);
      if (k > 0.9) K.text(R, pg.title, CX - pg.title.w / 2, y, '#FFFFFF', 'left', 0, 'título vagas');
      y += pg.title.vh + 60;
    }
    pg.pos.forEach((p, i) => {
      const t0 = posAt(pg, i, idx === 0);
      if (lt < t0) return;
      const k = expoOut(win(lt, t0, 0.3));
      const r2 = R.rec; if (k < 0.95) R.rec = () => {};
      tape(R, P, p.L, CX + (1 - k) * (i % 2 ? 1300 : -1300), y + p.dy + p.h / 2, p.rot, 'vaga');
      R.rec = r2;
    });
    R.rec = rr;
    ctx.restore();
  }
  const posSpeed = (P, idx, lt) => { const pg = P.posPages[idx]; return pg ? Math.max(0, ...pg.pos.map((_, i) => Math.abs(K.speed((x) => expoOut(win(x, posAt(pg, i, idx === 0), 0.3)) * 1300, lt)))) : 0; };

  // ---------------------------------------------------------------- K: the card
  function edges(R, P, lt) {
    if (!P.edge || lt < 1.0) return;
    const { ctx } = R, k = expoOut(win(lt, 1.0, 0.4)), size = P.edge, gap = 14, H = P.Z.H;
    for (let i = 0; i < 6; i++) {
      const x = i * (size + gap) - 40;
      for (const [img, xx, y] of [[P.ph(i), x, lerp(-size, 10, k)], [P.ph(i + 3), x + size / 2, lerp(H, H - size - 10, k)]]) {
        if (xx > P.Z.W) continue;
        if (img) K.cover(ctx, img, xx, y, size, size, P.focusOf(img)); else { ctx.fillStyle = P.C.tile; ctx.fillRect(xx, y, size, size); }
      }
    }
  }
  function cardLayer(R, P, lt, fromChat) {
    const { ctx } = R, C = P.C, Cd = P.card, Z = P.Z, CX = P.CX;
    edges(R, P, lt);
    if (!Cd.number) {
      Cd.lines.forEach((L, i) => {
        const k = expoOut(win(lt, i * 0.3, 0.3));
        if (k <= 0) return;
        const rr = R.rec; if (k < 0.95) R.rec = () => {};
        tape(R, P, L, CX + (1 - k) * (i % 2 ? 1300 : -1300), Cd.linesY[i] + (L.vh + 56) / 2, i % 2 ? 0.02 : -0.02, Cd.tags[i]);
        R.rec = rr;
      });
      return;
    }
    const ph = P.phone, ck = P.chat.k;
    const e = fromChat ? expoInOut(win(lt, 0, 0.5)) : 1;
    if (fromChat) {
      const kk = lerp(Math.max(40, 42 * ck) / Cd.number.size, 1, e);
      ctx.save(); ctx.translate(lerp(ph.x + 170 * ck, CX - Cd.number.w / 2, e), lerp(ph.y + P.chat.head / 2 + 16 * ck, Cd.numberY, e)); ctx.scale(kk, kk);
      K.text(R, Cd.number, 0, 0, '#FFFFFF', 'left', 0, 'número');
      ctx.restore();
    } else {
      const nk = expoOut(win(lt, 0, 0.35));
      ctx.save(); ctx.translate(CX, Cd.numberY + Cd.number.vh / 2); ctx.scale(lerp(1.3, 1, nk), lerp(1.3, 1, nk));
      const rr = R.rec; if (nk < 0.95) R.rec = () => {};
      K.text(R, Cd.number, -Cd.number.w / 2, -Cd.number.vh / 2, '#FFFFFF', 'left', 0, 'número');
      R.rec = rr;
      ctx.restore();
    }
    const fin = { x: CX - Cd.pill.w / 2, y: Cd.pillY, w: Cd.pill.w, h: Cd.pill.h, r: Cd.pill.h / 2 };
    const g = fromChat ? 1 : expoOut(win(lt, 0.15, 0.35));
    const r = fromChat ? K.rectLerp(P.chat.bubble, fin, e) : { ...fin, x: CX - (fin.w * g) / 2, w: fin.w * g };
    if (r.w > 4) {
      const press = lt >= 1.5 && lt < 1.75 ? 1 - 0.035 * (1 - expoOut(win(lt, 1.5, 0.25))) : 1;
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(press, press); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.fillStyle = C.cta; ctx.fill();
      ctx.save(); rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.clip();
      if (fromChat) { const mo = expoIn(win(lt, 0, 0.2)); if (mo < 1) P.chat.msg.draw(ctx, r.x + 40 * ck, r.y + 34 * ck + mo * r.h, C.ctaInk, 'left', 0); }
      if (lt >= 0.2) {
        const tk = expoOut(win(lt, 0.2, 0.3)), ty = r.y + (r.h - Cd.cta.vh) / 2 - (1 - tk) * r.h;
        E.drawIcon(ctx, 'message-circle', r.x + 82, ty + Cd.cta.vh / 2, 70, C.ctaInk, 2.6);
        const rr = R.rec; if (tk * g < 0.95) R.rec = () => {};
        K.text(R, Cd.cta, r.x + 150, ty, C.ctaInk, 'left', 0, 'botão');
        R.rec = rr;
      }
      ctx.restore();
      ctx.restore();
    }
    if (Cd.qr && lt >= 0.5) {
      const q = expoOut(win(lt, 0.5, 0.35));
      ctx.save(); ctx.translate(CX, Cd.qrY + Cd.qr / 2); ctx.scale(lerp(0.3, 1, q), lerp(0.3, 1, q));
      ctx.drawImage(K.qrSprite(P.content.contact.link, Cd.qr, { dark: '#0B0B0B', light: '#FFFFFF', radius: 0 }), -Cd.qr / 2, -Cd.qr / 2, Cd.qr, Cd.qr);
      ctx.restore();
    }
    if (Cd.qr && lt >= 1.5) {
      const hk = expoOut(win(lt, 1.5, 0.3));
      ctx.fillStyle = C.accent; ctx.fillRect(CX - (Cd.hint.w + 50) / 2, Cd.hintY - 16, (Cd.hint.w + 50) * hk, Cd.hint.vh + 32);
      if (hk > 0.9) K.text(R, Cd.hint, CX - Cd.hint.w / 2, Cd.hintY, C.tapeInk, 'left', 0, 'aponta');
    }
  }
  function lateChat(R, P) {
    const rr = R.rec; R.rec = () => {};
    K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true });
    R.rec = rr;
  }

  // I and F: his line slapped on tape over a photo, a tape per beat from alternating sides
  function tapedLine(R, P, list, photo, lt, tag) {
    fullPhoto(R, P, photo);
    if (!list) return;
    const step = Math.min(0.45, 1.3 / list.length);
    list.forEach((tp, i) => {
      const t0 = 0.1 + i * step;
      if (lt < t0) return;
      const k = expoOut(win(lt, t0, 0.3));
      quietIf(R, k < 0.95, () => tape(R, P, tp.L, P.CX + (1 - k) * (i % 2 ? 1300 : -1300), tp.y + tp.h / 2, tp.rot, tag));
    });
  }
  const tapedSpeed = (list, lt) => (list ? Math.max(0, ...list.map((_, i) => Math.abs(K.speed((x) => expoOut(win(x, 0.1 + i * Math.min(0.45, 1.3 / list.length), 0.3)) * 1300, lt)))) : 0);

  // ---------------------------------------------------------------- the acts
  const acts = {
    I(R, A) {
      const { P } = R;
      K.blurred(R, tapedSpeed(P.introTapes, A.lt), (g, d) => tapedLine(R, P, P.introTapes, P.throughPhoto, A.lt - d, 'intro'), null);
    },
    F(R, A) {
      const { P } = R;
      K.blurred(R, tapedSpeed(P.closingTapes, A.lt), (g, d) => tapedLine(R, P, P.closingTapes, P.backEnd, A.lt - d, 'fecho'), null);
    },
    H(R, A) {
      const { P } = R, t = A.lt;
      const cam = headCam(P, t), s = camSpeed((x) => headCam(P, x), t);
      const moving = R.moving;
      R.moving = moving || s.v > 300 || s.zoom > 300;
      letters(R, P, cam, t, false, true);
      R.moving = moving;
      if (s.v > 400) K.smear(R, -s.vx, -s.vy);
    },
    M(R, A) {
      const { P } = R, pg = K.page(A);
      K.blurred(R, collageSpeed(P, pg.index, pg.lt), (g, d) => collage(R, P, pg.index, pg.lt - d), null);
    },
    V(R, A) {
      const { P } = R;
      const push = expoIn(win(A.lt, 1.5, 0.5));
      const moving = R.moving;
      if (push > 0.05) R.moving = true;
      K.blurred(R, push > 0 ? 0 : cubeSpeed(P, A.lt), (g, d) => cube(R, P, A.lt - d), null);
      R.moving = moving;
    },
    D(R, A) {
      const { P } = R, pg = K.page(A);
      fullPhoto(R, P, P.backD[pg.index]);
      numbers(R, P, pg.index, pg.lt, 0);
    },
    L(R, A) {
      const { P } = R, pg = K.page(A), bespoke = A.bespoke && pg.first;
      const lastD = P.numPages.length - 1, Da = P.act('D');
      fullPhoto(R, P, P.backL[pg.index]);
      // the numbers slide away as the first tapes come in
      const v = Math.max(posSpeed(P, pg.index, pg.lt), bespoke ? Math.abs(K.speed((x) => expoIn(win(x, 0, 0.35)) * (P.Z.W + 300), pg.lt)) : 0);
      K.blurred(R, v, (g, d) => {
        const l = pg.lt - d;
        if (bespoke && l < 0.35) numbers(R, P, lastD, Da.d - lastD * 2, expoIn(win(l, 0, 0.35)) * (P.Z.W + 300));
        positions(R, P, pg.index, l, 0);
      }, null);
    },
    C(R, A) {
      const { P, ctx } = R, La = P.act('L');
      fullPhoto(R, P, P.backEnd);
      // the tapes fly past the camera; the phone comes forward from far away
      const lastL = P.posPages.length - 1;
      if (A.bespoke && A.lt < 0.35) positions(R, P, lastL, La.d - lastL * 2, expoIn(win(A.lt, 0, 0.35)));
      const k = A.bespoke ? expoOut(win(A.lt, 0, 0.45)) : 1, s = lerp(0.1, 1, k);
      ctx.save(); ctx.translate(P.CX, P.Z.cy); ctx.scale(s, s); ctx.translate(-P.CX, -P.Z.cy);
      const rr = R.rec; if (k < 0.98) R.rec = () => {};
      K.chatDraw(R, P.chat, A.lt, { type0: 0.55, type1: 1.3, send: 1.36 });
      R.rec = rr;
      ctx.restore();
    },
    K(R, A) {
      const { P, ctx } = R;
      const fromChat = A.bespoke && !!P.card.number;
      if (fromChat) {
        // the camera pushes into the phone's dark screen; the bubble stays and becomes the button
        const push = expoIn(win(A.lt, 0, 0.3));
        if (push < 1) {
          ctx.save(); ctx.translate(P.CX, P.Z.cy); ctx.scale(1 + push * 1.6, 1 + push * 1.6); ctx.translate(-P.CX, -P.Z.cy);
          fullPhoto(R, P, P.backEnd);
          lateChat(R, P);
          ctx.restore();
        }
      }
      cardLayer(R, P, A.lt, fromChat);
    },
    O(R, A) {
      const { P } = R, Ka = P.act('K');
      if (A.lt < 0.45) {
        // a photo tile of the frame grows over everything
        cardLayer(R, P, Ka.d, Ka.bespoke && !!P.card.number);
        const k = expoIn(win(A.lt, 0, 0.42)), e = P.edge;
        const x = lerp(e ? -40 : 0, -20, k), y = lerp(e ? 10 : 0, -20, k), w = lerp(e || 0, P.Z.W + 40, k), h = lerp(e || 0, P.Z.H + 40, k);
        if (w > 1 && h > 1) photoIn(R, P, 0, (g) => g.rect(x, y, w, h), corners({ x, y, w, h }));
        return;
      }
      // then the camera comes out of the first line's letter: the first frame
      const cam = loopCam(P, A.lt), s = camSpeed((x) => loopCam(P, x), A.lt);
      const moving = R.moving;
      R.moving = moving || s.v > 300 || s.zoom > 300;
      letters(R, P, cam, A.lt, true, false);
      R.moving = moving;
    },
  };

  // ---------------------------------------------------------------- sound: punchy
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K'), O = P.act('O');
    const riserFrom = Math.max(0, Ka.start - 2);
    const roots = [55, 55, 65.41, 49];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 160, f1: 44, drop: 0.11, dur: 0.3, gain: 0.8 });
      if (b % 2 === 1) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 1600, q: 1.2, dur: 0.12, gain: 0.22 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 8000, dur: 0.04, gain: 0.07 });
      if (t < riserFrom || t >= Ka.start) {
        const hz = roots[Math.floor(b / 4) % 4];
        ev.push({ t, kind: 'tone', hz, wave: 'sawtooth', dur: 0.22, gain: 0.16, lp: 700 });
        ev.push({ t: t + 0.25, kind: 'tone', hz: hz * 2, wave: 'sawtooth', dur: 0.15, gain: 0.1, lp: 900 });
      }
    }
    for (const t of P.timeline.cuts) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 1500, q: 0.7, dur: 0.18, gain: 0.4 }, { t, kind: 'kick', f0: 200, f1: 50, dur: 0.25, gain: 0.5 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 250, f1: 7000, gain: 0.28 });
    // tape slaps, the push-ins (a rush of air), typing, send
    const slap = (t) => ev.push({ t, kind: 'noise', filter: 'bandpass', f: 900, q: 1, dur: 0.1, gain: 0.35 });
    if (P.kicker) slap(1.02);
    const M = P.act('M'); if (M) P.labelPages.forEach((list, p) => list.forEach((_, i) => slap(M.start + p * 2 + labelT0(p === 0, i))));
    const L = P.act('L'); if (L) P.posPages.forEach((pg, p) => pg.pos.forEach((_, i) => slap(L.start + p * 2 + posAt(pg, i, p === 0))));
    if (P.card.qr) slap(Ka.start + 1.5);
    const rush = (t) => ev.push({ t, kind: 'riser', f0: 400, f1: 6000, dur: 0.45, gain: 0.22 });
    rush(1.5);
    // every new page: the camera pushes through to the next photo
    for (const a of P.acts) if (a.pages) for (let p = 1; p < a.pages.length; p++) rush(a.start + p * 2 - 0.2);
    const V = P.act('V'); if (V) rush(V.start + 1.5);
    if (Ka.bespoke) rush(Ka.start);
    rush(O.start);
    const C = P.act('C');
    if (C) {
      for (let t = 0.55; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'colagem', name: 'Colagem', concept: 'As letras do anúncio são janelas para a obra.',
    font: { head: { family: 'Anton', weight: 400 }, bold: { family: 'Anton', weight: 400 } },
    palettes: { dark: { bg: '#0B0B0B', ink: '#FFFFFF', main: '#FFFFFF', accent: '#FFC400' } },
    // 10–30 s: a collage, a numbers page or a list page at a time; the camera pushes through to the next
    bgModes: ['dark'], photos: 8, travel: 'push', pages: true,
    colors(c) {
      c.tapeInk = U.contrast(c.accent, '#0B0B0B') >= 4.5 ? '#0B0B0B' : '#FFFFFF';
      c.accentText = U.ensureContrast(c.accent, '#0B0B0B', 4.5);
      c.tile = '#3A3A3A';
      return c;
    },
    prepare,
    acts,
    sound,
  });
})();
