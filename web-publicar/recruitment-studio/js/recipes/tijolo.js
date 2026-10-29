// Video recipe «Tijolo»: the brick becomes a word, the words become a building.
// Camera language: a crane (up, down, in, out); from the 2D→3D act on, one
// fixed axonometric angle. Acts (see RS.motion.register): H the wall of
// word-bricks, M benefit slabs (a page of up to three at a time, each new page
// built on top of the last), V the last page's slabs become floors, D the roof
// board (a page of highlights at a time) and one lit window per vacancy, L
// positions on the floors (a page at a time), C a window becomes the phone,
// K the card, O back to the first brick. 10–30 s.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { lerp, win, expoOut, expoIn, expoInOut, spring, rrect } = K;
  const D3 = 320; // building depth
  const EH = 150; // floors that drop on top
  const TH = -0.45, PH = 0.33; // axonometric yaw and pitch
  const INK = '#161412';

  // ---------------------------------------------------------------- projection
  const view = (a) => ({ c: Math.cos(TH * a), s: Math.sin(TH * a), cp: Math.cos(PH * a), sp: Math.sin(PH * a) });
  const pr = (V, X, Y, Z) => { const x1 = X * V.c + Z * V.s, z1 = -X * V.s + Z * V.c; return [x1, -Y * V.cp + z1 * V.sp]; };
  const scr = (P, V, Kc, X, Y, Z) => { const [sx, sy] = pr(V, X, Y, Z); return [(sx - Kc.x) * Kc.z + P.Z.W / 2, (sy - Kc.y) * Kc.z + P.Z.cy]; };
  function quad(ctx, pts, color) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  // The local frame of a front plane (Z = z; u → +X, v → −Y).
  function plane(P, ctx, V, Kc, X, Y, Z) {
    const o = scr(P, V, Kc, X, Y, Z), u = scr(P, V, Kc, X + 1, Y, Z), v = scr(P, V, Kc, X, Y - 1, Z);
    ctx.transform(u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]);
  }
  function box(P, ctx, V, Kc, b) {
    const Q = (X, Y, Z) => scr(P, V, Kc, X, Y, Z);
    const hw = P.bw / 2;
    if (V.s < -0.001) quad(ctx, [Q(hw, b.y1, 0), Q(hw, b.y1, -D3), Q(hw, b.y0, -D3), Q(hw, b.y0, 0)], P.C.side);
    if (V.sp > 0.001) quad(ctx, [Q(-hw, b.y1, -D3), Q(hw, b.y1, -D3), Q(hw, b.y1, 0), Q(-hw, b.y1, 0)], P.C.top);
    quad(ctx, [Q(-hw, b.y1, 0), Q(hw, b.y1, 0), Q(hw, b.y0, 0), Q(-hw, b.y0, 0)], P.C.main);
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F;
    const CX = Z.W / 2, CY = Z.cy;
    // H: the headline as a wall of word-bricks, the kicker above it
    const head = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 160, minSize: 60, maxW: Z.w - 120, maxLines: 4, lh: 1, maxH: Z.cH * 0.62 });
    const padX = head.size * 0.3, padY = head.size * 0.28, gap = 14;
    const bh = head.capPx + padY * 2;
    const kicker = c.kicker ? K.fit(P, c.kicker, { font: F.bold, upper: true, track: 0.08, maxSize: 52, minSize: 40, maxW: Z.w, maxLines: 2 }) : null;
    const courses = head.lines.length;
    const wallH = courses * bh + (courses - 1) * gap;
    const y0 = CY - ((kicker ? kicker.h + 40 : 0) + wallH) / 2;
    P.kicker = kicker && { L: kicker, y: y0 };
    const wy = y0 + (kicker ? kicker.h + 40 : 0);
    const ws = K.words(head, 0, 0);
    P.bricks = [];
    for (let i = 0; i < courses; i++) {
      const row = ws.filter((w) => w.line === i);
      const widths = row.map((w) => w.w + padX * 2);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
      const shift = total + 70 <= Z.w ? (i % 2 ? 34 : -34) : 0;
      let x = CX - total / 2 + shift;
      row.forEach((w, j) => { P.bricks.push({ t: w.t, x, y: wy + i * (bh + gap), w: widths[j], h: bh, course: i, k: j }); x += widths[j] + gap; });
    }
    P.head = head; P.padY = padY;
    const first = P.bricks.filter((b) => b.course === 0);
    const zoomOn = (x0, x1, yy0, yy1, zmax) => ({ x: (x0 + x1) / 2 - CX, y: (yy0 + yy1) / 2 - CY, z: Math.min(zmax, (Z.w + 20) / (x1 - x0), (Z.cH * 0.85) / (yy1 - yy0)) });
    P.k0 = zoomOn(Math.min(...first.map((b) => b.x)), Math.max(...first.map((b) => b.x + b.w)), first[0].y, first[0].y + bh, 1.5);
    // one event per beat: the next courses, then the kicker; the crane follows each
    P.events = [];
    for (let i = 1; i < courses; i++) P.events.push({ course: i });
    if (kicker) P.events.push({ kicker: true });
    P.events.forEach((e, i) => { e.beat = Math.min(i, 2); });
    const wx0 = Math.min(...P.bricks.map((x) => x.x)), wx1 = Math.max(...P.bricks.map((x) => x.x + x.w));
    const zWall = Math.min(1.5, (Z.w + 90) / (wx1 - wx0));
    P.hookCam = [P.k0];
    for (let b = 0; b < 3; b++) {
      const last = P.events.filter((e) => e.beat === b).pop();
      if (!last) { P.hookCam.push(P.hookCam[P.hookCam.length - 1]); continue; }
      const upto = last.kicker ? courses - 1 : last.course;
      P.hookCam.push(zoomOn(wx0, wx1, (last.kicker ? y0 : wy) - 60, wy + upto * (bh + gap) + bh + 60, last.kicker ? Math.min(1.2, zWall) : zWall));
    }
    P.hookCam.push({ x: 0, y: 0, z: 1 });

    // M: the benefits on slabs, a page at a time (up to three on a page)
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    const sgap = 28;
    const layoutSlabs = (items) => {
      const list = items.map((i) => {
        const L = K.fit(P, c.benefits[i], { font: F.bold, maxSize: 78, minSize: 46, maxW: Z.w - 230, maxLines: 2, lh: 1.04, maxH: 200 });
        return { L, h: Math.max(150, L.vh + 72), icon: c.icons[i] || 'check' };
      });
      let sy = CY - (list.reduce((a, s) => a + s.h, 0) + sgap * Math.max(0, list.length - 1)) / 2;
      for (const s of list) { s.x = Z.left; s.y = sy; s.w = Z.w; sy += s.h + sgap; }
      return list;
    };
    P.slabPages = (Ma ? Ma.pages : []).map(layoutSlabs);
    P.slabs = P.slabPages[0] || [];
    const lastSlabs = P.slabPages[P.slabPages.length - 1] || [];

    // V: the last page's slabs (or two plain floors) become floors; more drop
    // on top (five floors at least: a page of positions has up to five)
    P.bw = Z.w;
    const base = lastSlabs.length ? lastSlabs.map((s) => ({ h: s.h, slab: s })) : [{ h: 160, plain: true, y: CY - 165 }, { h: 160, plain: true, y: CY + 5 }];
    if (!lastSlabs.length) base.forEach((f) => { f.slab = { x: Z.left, y: f.y, w: Z.w, h: f.h, plain: true }; });
    const stackH = base.reduce((a, f) => a + f.h, 0);
    P.nExtra = Math.max(3, 5 - base.length);
    P.floors = [];
    for (let k = 0; k < P.nExtra; k++) P.floors.push({ h: EH, extra: true, k });
    P.floors.push(...base);
    let yb = stackH / 2;
    for (const f of P.floors.filter((x) => !x.extra)) { f.y1 = yb; f.y0 = yb - f.h; yb = f.y0; }
    let ye = stackH / 2;
    for (const f of P.floors.filter((x) => x.extra).reverse()) { f.y0 = ye; f.y1 = ye + f.h; ye = f.y1; }
    P.roofY = ye; P.bottomY = yb;
    // one lit window per vacancy (a unit chart), up to 24, once the vacancies are on the board
    const hl = c.highlights;
    const vi = hl.findIndex((h) => h.role === 'vacancies');
    P.vacPage = Da && vi >= 0 ? Da.pages.findIndex((pg) => pg.includes(vi)) : -1;
    P.litFrom = P.vacPage >= 0 ? rowT0(P.vacPage === 0, Da.pages[P.vacPage].indexOf(vi)) : 0;
    const n = P.vacPage >= 0 && hl[vi].count != null ? Math.min(24, hl[vi].count) : 0;
    P.perFloor = Math.max(1, Math.ceil(Math.max(n, 2 * P.floors.length) / P.floors.length));
    P.windows = [];
    P.floors.forEach((f, fi) => { for (let i = 0; i < P.perFloor; i++) P.windows.push({ fi, i, lit: P.windows.length < n ? P.windows.length : -1 }); });
    P.nLit = n;
    P.roofHead = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 150, minSize: 56, maxW: Z.w - 40, maxLines: 3, lh: 1.12 });
    P.roofSprites = sprites(P.roofHead, P.C);
    P.zRoof = -D3 * 0.45;

    // D: the board on the roof, a page of highlights at a time: each value as
    // written (a plain number counts up) with its label beside it, or under it
    // when the two do not fit on one line
    const bwid = Z.w - 20, avail = bwid - 80;
    const rowOf = (h) => {
      const vac = h.role === 'vacancies';
      const bigText = h.value || h.label, smallText = h.value ? h.label : '';
      const r = { hl: h, color: vac ? 'main' : 'ink', count: h.value && h.count != null ? h.count : null };
      r.big = K.line(P, bigText, { font: F.head, size: vac ? 200 : 180 });
      r.small = smallText ? K.line(P, smallText, vac ? { font: F.head, size: 110, upper: P.upper } : { font: F.bold, size: 84 }) : null;
      r.k = Math.min(1, avail / (r.big.w + (r.small ? 30 + r.small.w : 0)));
      if (r.k < 0.6) {
        r.stacked = true; r.k = 1;
        r.big = K.fit(P, bigText, { font: F.head, maxSize: 160, minSize: 60, maxW: avail, maxLines: 2, lh: 1 });
        r.small = smallText ? K.fit(P, smallText, { font: F.bold, upper: vac && P.upper, maxSize: 84, minSize: 44, maxW: avail, maxLines: 2, lh: 1.04 }) : null;
        r.h = r.big.vh + (r.small ? 24 + r.small.vh : 0);
      } else r.h = r.big.vh * r.k;
      return r;
    };
    P.boardPages = (Da ? Da.pages : []).map((items) => {
      const rows = items.map((i) => rowOf(hl[i]));
      return { rows, inner: rows.reduce((a, r) => a + r.h, 0) + 70 * Math.max(0, rows.length - 1) };
    });
    // one board for every page: as tall as the tallest
    P.board = { w: bwid, h: Math.max(0, ...P.boardPages.map((b) => b.inner)) + 120 };

    // L: the positions, a page at a time, written on the floors from the top
    P.posPages = (La ? La.pages : []).map((items) => items.map((idx, i) => ({
      L: K.fit(P, c.positions[idx], { font: F.bold, upper: P.upper, maxSize: 78, minSize: 40, maxW: Z.w - 100, maxLines: 2, lh: 1.02, maxH: P.floors[i].h - 30 }),
      floor: i,
    })));
    P.posMax = Math.max(0, ...P.posPages.map((p) => p.length));
    P.posBeat = (i, np) => (np <= 4 ? i : Math.min(3, Math.floor((i * 4) / np)));

    // C: the conversation
    const ph = Math.min(1220, Z.cH - 10), pw = Math.min(Z.w, 880);
    P.phone = { x: (Z.W - pw) / 2, y: Z.top + (Z.cH - ph) / 2, w: pw, h: ph };
    const dark = P.C.mode === 'dark';
    P.chat = K.chatLayout(P, { ...P.phone, font: F.bold, fontStrong: F.bold, radius: 64 * (pw / 880),
      colors: { screen: dark ? '#26221E' : P.C.bg, head: dark ? '#000000' : INK, headInk: '#FFFFFF', field: dark ? '#3A342E' : '#FFFFFF', fieldInk: dark ? '#F2EDE4' : INK, bubble: P.C.cta, bubbleInk: P.C.ctaInk, send: P.C.cta, sendInk: P.C.ctaInk, frame: dark ? '#000000' : INK } });

    // K: the card
    const card = {};
    if (c.showLogo && c.brandName) card.brand = K.fit(P, c.brandName, { font: F.bold, upper: true, track: 0.06, maxSize: 54, minSize: 40, maxW: Z.w, maxLines: 1 });
    if (c.contact) {
      card.number = K.fit(P, c.contact.display, { font: F.head, maxSize: 150, minSize: 70, maxW: Z.w + 20, maxLines: 1 });
      card.cta = K.line(P, c.contact.cta, { font: F.head, size: 76, upper: true, track: 0.02 });
      card.pill = { h: 160, w: Math.min(Z.w + 60, card.cta.w + 220) };
      card.hint = K.line(P, c.contact.hint, { font: F.bold, size: 52 });
      const others = (card.brand ? card.brand.vh + 54 : 0) + card.number.vh + 64 + card.pill.h + 64 + 36 + card.hint.vh;
      card.qr = c.qr ? K.clamp(Z.cH - others - 40, 240, 470) : 0;
    } else {
      // no WhatsApp number: the ad's own contacts, unless hidden (or its headline)
      const lines = P.content.contacts.slice(0, 3);
      card.lines = lines.map((s) => K.fit(P, s, { font: F.bold, maxSize: 72, minSize: 44, maxW: Z.w, maxLines: 2 }));
      if (!card.lines.length && !card.brand) card.lines = [K.fit(P, c.headline || ' ', { font: F.head, upper: P.upper, maxSize: 120, minSize: 60, maxW: Z.w, maxLines: 4 })];
    }
    const parts = [];
    if (card.brand) parts.push(['brandY', card.brand.vh + 54]);
    if (card.number) parts.push(['numberY', card.number.vh + 64], ['pillY', card.pill.h + (card.qr ? 64 : 0)]);
    if (card.qr) parts.push(['qrY', card.qr + 36 + card.hint.vh]);
    (card.lines || []).forEach((L, i) => parts.push([`line${i}`, L.vh + 40]));
    let cy0 = CY - parts.reduce((a, p) => a + p[1], 0) / 2;
    for (const [key, h] of parts) { card[key] = cy0; cy0 += h; }
    if (card.qr) card.hintY = card.qrY + card.qr + 36;
    P.card = card;
  }
  function sprites(L, C) {
    const mk = (color) => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(L.w + 8); cv.height = Math.ceil(L.h + 8 + L.size * 0.3);
      L.draw(cv.getContext('2d'), 4, 4 + L.size * 0.3, color, 'center', L.w);
      return cv;
    };
    return { front: mk(C.main), side: mk(C.mode === 'dark' ? '#000000' : INK), pad: L.size * 0.3 };
  }

  // ---------------------------------------------------------------- H: the wall
  function hookCam(P, t) {
    const Kc = P.hookCam;
    let cam = Kc[0];
    for (let b = 0; b < 4; b++) {
      const e = expoInOut(win(t, b * 0.5 + 0.02, 0.42));
      if (e <= 0) break;
      const z = Kc[b + 1];
      cam = { x: lerp(cam.x, z.x, e), y: lerp(cam.y, z.y, e), z: lerp(cam.z, z.z, e) };
    }
    return cam;
  }
  function drawBrick(R, P, b, x, y, w, h, textDY = 0) {
    const { ctx } = R;
    rrect(ctx, x, y, w, h, 10);
    ctx.fillStyle = P.C.main; ctx.fill();
    if (textDY >= h) return;
    ctx.save();
    rrect(ctx, x, y, w, h, 10); ctx.clip();
    const tw = K.textWidth(b.t, P.head);
    K.fillText(ctx, b.t, x + (w - tw) / 2, y + P.padY + P.head.capPx + textDY, P.head, P.C.onMain);
    ctx.restore();
    if (textDY === 0) R.rec(x + (w - tw) / 2, y + P.padY, tw, P.head.capPx, 'tijolo', b.t);
  }
  function wall(R, P, t) {
    const { ctx } = R;
    const Kc = hookCam(P, t);
    const CX = P.Z.W / 2, CY = P.Z.cy;
    const toScreenY = (y) => (y - CY - Kc.y) * Kc.z + CY;
    const camV = Math.abs(K.speed((x) => hookCam(P, x).y * hookCam(P, x).z, t));
    const moving = R.moving;
    R.moving = moving || camV > 300;
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(Kc.z, Kc.z); ctx.translate(-CX - Kc.x, -CY - Kc.y);
    for (const b of P.bricks) {
      const ev = P.events.find((e) => e.course === b.course);
      if (!ev) { drawBrick(R, P, b, b.x, b.y, b.w, b.h); continue; }
      const t0 = ev.beat * 0.5 + 0.02 + b.k * 0.06;
      if (t < t0) continue;
      const dir = b.course % 2 ? 1 : -1;
      const off = (x) => dir * 1500 * (1 - expoOut(win(x, t0, 0.34)));
      const band = { x: 0, y: toScreenY(b.y) - 20, w: P.Z.W, h: b.h * Kc.z + 40 };
      K.blurred(R, K.speed(off, t) * Kc.z, (g, d) => drawBrick(R, P, b, b.x + off(t - d), b.y, b.w, b.h), band);
    }
    const kev = P.events.find((e) => e.kicker);
    if (kev && t >= kev.beat * 0.5 + 0.04) {
      const kt = kev.beat * 0.5 + 0.04;
      const off = (x) => -1500 * (1 - expoOut(win(x, kt, 0.34)));
      const band = { x: 0, y: toScreenY(P.kicker.y) - 30, w: P.Z.W, h: P.kicker.L.h * Kc.z + 60 };
      K.blurred(R, K.speed(off, t) * Kc.z, (g, d) => K.text(R, P.kicker.L, P.Z.left + off(t - d), P.kicker.y, P.C.ink, 'center', P.Z.w, 'chamada'), band);
    }
    ctx.restore();
    R.moving = moving;
  }

  // ---------------------------------------------------------------- M: slabs
  // A text counts as shown once it has arrived: none of these draws records it.
  function quiet(R, fn) {
    const rr = R.rec;
    R.rec = () => {};
    try { fn(); } finally { R.rec = rr; }
  }
  const slabOf = (P, i) => P.slabs[Math.min(P.slabs.length - 1, Math.floor((i * P.slabs.length) / P.bricks.length))];
  // when the icon and the words of slab j arrive on its page
  const slabT0 = (first, j) => (first ? 0.5 + j * 0.5 : 0.3 + j * 0.4);
  function slabPage(R, P, list, lt, first) {
    for (const s of list) { rrect(R.ctx, s.x, s.y, s.w, s.h, 18); R.ctx.fillStyle = P.C.main; R.ctx.fill(); }
    list.forEach((s, j) => { const t0 = slabT0(first, j); if (lt >= t0) slabContent(R, P, s, s.x, s.y, expoOut(win(lt, t0, 0.36)), spring(win(lt, t0, 0.32))); });
  }
  function slabs(R, P, A) {
    const { ctx } = R;
    const pg = K.page(A), lt = pg.lt;
    const list = P.slabPages[pg.index] || [];
    if (!pg.first && lt < 0.4) {
      // the next floor is built on top: the page goes down, the new one comes down from above
      const H = P.fmt.h, off = (x) => H * expoInOut(win(x, 0, 0.4));
      const moving = R.moving;
      R.moving = true;
      K.blurred(R, K.speed(off, lt), (g, d) => {
        const o = off(lt - d);
        g.save(); g.translate(0, o); slabPage(R, P, P.slabPages[pg.index - 1], 9, pg.index === 1); g.restore();
        g.save(); g.translate(0, o - H); slabPage(R, P, list, lt - d, false); g.restore();
      }, null);
      R.moving = moving;
      return;
    }
    const bespoke = A.bespoke && pg.first;
    if (bespoke && lt < 0.6) {
      // the words drop out of the bricks, the bricks merge into the slabs
      const out = expoIn(win(lt, 0, 0.2));
      P.bricks.forEach((b, i) => {
        const s = slabOf(P, i);
        const r = K.rectLerp({ ...b, r: 10 }, { x: s.x, y: s.y, w: s.w, h: s.h, r: 18 }, expoInOut(win(lt, 0.05 + i * 0.025, 0.42)));
        drawBrick(R, P, b, r.x, r.y, r.w, r.h, out * b.h);
      });
      list.forEach((s, j) => { const t0 = slabT0(true, j); if (lt >= t0) slabContent(R, P, s, s.x, s.y, expoOut(win(lt, t0, 0.36)), spring(win(lt, t0, 0.32))); });
    } else slabPage(R, P, list, lt, pg.first);
    if (bespoke && P.kicker && lt < 0.4) {
      const off = (x) => -1500 * expoIn(win(x, 0, 0.32));
      K.blurred(R, K.speed(off, lt), (g, d) => K.text(R, P.kicker.L, P.Z.left + off(lt - d), P.kicker.y, P.C.ink, 'center', P.Z.w, 'chamada'), { x: 0, y: P.kicker.y - 30, w: P.Z.W, h: P.kicker.L.h + 60 });
    }
  }
  // icon square and text of a slab (front coordinates, local to the slab)
  function slabContent(R, P, s, lx, ly, k, iconK) {
    const { ctx } = R;
    const isz = 110;
    if (iconK > 0) {
      ctx.save();
      ctx.translate(lx + 26 + isz / 2, ly + s.h / 2); ctx.scale(iconK, iconK);
      rrect(ctx, -isz / 2, -isz / 2, isz, isz, 14); ctx.fillStyle = P.C.bg; ctx.fill();
      E.drawIcon(ctx, s.icon, 0, 0, isz * 0.56, P.C.main, 2.4);
      ctx.restore();
    }
    if (k > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(lx, ly, s.w, s.h); ctx.clip();
      const draw = () => K.text(R, s.L, lx + 26 + isz + 32, ly + (s.h - s.L.vh) / 2 + (1 - k) * s.h, P.C.onMain, 'left', 0, 'vantagem');
      if (k < 0.95) quiet(R, draw); else draw();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- V, D, L, C: the building
  // Floors in world coordinates: in V the gaps close and the extra floors drop.
  function floorsAt(P, act, lt) {
    if (act !== 'V') return P.floors.map((f) => ({ ...f }));
    const close = expoInOut(win(lt, 0, 0.5));
    return P.floors.map((f) => {
      if (!f.extra) {
        const oy1 = -(f.slab.y - P.Z.cy), oy0 = oy1 - f.h;
        return { ...f, y1: lerp(oy1, f.y1, close), y0: lerp(oy0, f.y0, close) };
      }
      const t0 = 0.5 + (P.nExtra - 1 - f.k) * 0.11;
      if (lt < t0) return null;
      const drop = 1500 * (1 - expoIn(win(lt, t0, 0.3)));
      return { ...f, y1: f.y1 + drop, y0: f.y0 + drop, falling: drop > 0 };
    });
  }
  function frameWorld(P, pts, maxW, maxH, zmax) {
    const V = view(1);
    const s = pts.map(([X, Y, Z]) => pr(V, X, Y, Z));
    const x0 = Math.min(...s.map((p) => p[0])), x1 = Math.max(...s.map((p) => p[0]));
    const y0 = Math.min(...s.map((p) => p[1])), y1 = Math.max(...s.map((p) => p[1]));
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.min(zmax, maxW / (x1 - x0), maxH / (y1 - y0)) };
  }
  const corners = (P, y0, y1) => { const h = P.bw / 2; return [[-h, y0, 0], [h, y0, 0], [h, y0, -D3], [-h, y1, 0], [h, y1, 0], [h, y1, -D3], [-h, y1, -D3]]; };
  function cams(P) {
    if (P.cams) return P.cams;
    const Z = P.Z, fl = P.floors, L = P.roofHead;
    const letters = [[-L.w / 2, P.roofY, P.zRoof], [L.w / 2, P.roofY, P.zRoof], [-L.w / 2, P.roofY + L.h, P.zRoof], [L.w / 2, P.roofY + L.h, P.zRoof]];
    const listFloors = Array.from({ length: P.posMax || 3 }, (_, i) => i);
    const ly0 = Math.min(...listFloors.map((i) => fl[i].y0)), ly1 = Math.max(...listFloors.map((i) => fl[i].y1));
    const w = windowQuad(P, P.floors.length - 1, P.perFloor - 1);
    const mid = w.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
    const [wx, wy] = pr(view(1), mid[0], mid[1], mid[2]);
    P.cams = {
      front: { x: 0, y: 0, z: 1 },
      roof: frameWorld(P, [...letters, [-P.bw / 2, fl[1].y0, 0], [P.bw / 2, fl[1].y0, 0]], Z.w + 80, Z.cH * 0.9, 1.15),
      upper: frameWorld(P, corners(P, fl[2].y0, P.roofY + P.board.h), Z.w + 80, Z.cH * 0.95, 1.05),
      list: frameWorld(P, corners(P, ly0, ly1), Z.w + 80, Z.cH * 0.92, 1.05),
      bottom: frameWorld(P, corners(P, P.bottomY, fl[fl.length - 2].y1), Z.w + 80, Z.cH * 0.9, 1.05),
      window: { x: wx, y: wy, z: 7 },
    };
    return P.cams;
  }
  // The crane, per act: V goes from the front to the roof; D to the upper
  // floors and the board; L frames the floors that get the positions; C goes
  // into a window.
  function camOf(P, act, lt) {
    const c = cams(P);
    const move = (a, b, t0, d) => { const e = expoInOut(win(lt, t0, d)); return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e) }; };
    if (act === 'V') return move(c.front, c.roof, 1.0, 0.45);
    if (act === 'D') return move(c.roof, c.upper, 0, 0.4);
    if (act === 'L') return move(c.upper, c.list, 0, 0.45);
    return move(c.list, c.window, 0, 0.45);
  }
  function windowQuad(P, fi, i, f) {
    f = f || P.floors[fi];
    const span = D3 / P.perFloor, hw = P.bw / 2;
    const u0 = span * i + span * 0.24, u1 = span * (i + 1) - span * 0.24;
    const h = f.y1 - f.y0, v0 = f.y1 - h * 0.25, v1 = f.y0 + h * 0.25;
    return [[hw, v0, -u0], [hw, v0, -u1], [hw, v1, -u1], [hw, v1, -u0]];
  }
  const litAt = (P, i) => (i / Math.max(1, P.nLit)) * 0.85;
  // window i is lit: from the vacancies' row on the board on (D), and after it
  const litNow = (P, act, pg, i) => act !== 'V' && P.vacPage >= 0
    && (act !== 'D' || pg.index > P.vacPage || (pg.index === P.vacPage && pg.lt >= P.litFrom + litAt(P, i)));
  function building(R, P, act, A) {
    const { ctx } = R;
    const lt = A.lt;
    // D and L: the camera follows the act, the board and the floors the page
    const pg = act === 'D' || act === 'L' ? K.page(A) : null;
    const V = view(act === 'V' ? expoInOut(win(lt, 0, 0.6)) : 1);
    const Kc = camOf(P, act, lt);
    const camV = K.speed((x) => { const k = camOf(P, act, x); return Math.hypot(k.x * k.z, k.y * k.z); }, lt);
    const moving = R.moving;
    R.moving = moving || Math.abs(camV) > 300;
    const fl = floorsAt(P, act, lt);
    const falling = [];
    const showBenefits = act === 'V' && P.act('M');
    for (let i = fl.length - 1; i >= 0; i--) {
      const f = fl[i];
      if (!f) continue;
      if (f.falling) { falling.push(i); continue; }
      box(P, ctx, V, Kc, f);
      floorFront(R, P, V, Kc, f, i, act, lt, showBenefits, pg);
      windows(R, P, V, Kc, f, i, act, lt, pg);
    }
    if (falling.length) {
      const vy = Math.max(...falling.map((i) => Math.abs(K.speed((x) => { const g = floorsAt(P, act, x)[i]; return g ? g.y1 : 0; }, lt)))) * Kc.z;
      K.blurred(R, vy, (g, d) => { const fd = floorsAt(P, act, lt - d); for (const i of falling) if (fd[i]) box(P, g, V, Kc, fd[i]); }, null);
    }
    roof(R, P, V, Kc, fl[0], act, A, pg);
    R.moving = moving;
    return { V, Kc, camV };
  }
  function floorFront(R, P, V, Kc, f, i, act, lt, showBenefits, pg) {
    const { ctx } = R;
    // L: this page's position on floor i arrives on its beat; the page
    // before slides down and out first
    let pos = null, k = 0, out = null;
    if (act === 'L') {
      const list = P.posPages[pg.index] || [];
      const j = list.findIndex((p) => p.floor === i);
      const beat = j >= 0 ? P.posBeat(j, list.length) : 0;
      const t0 = pg.first ? 0.1 + beat * 0.5 : 0.4 + beat * 0.4;
      if (j >= 0 && pg.lt >= t0) { pos = list[j]; k = expoOut(win(pg.lt, t0, 0.34)); }
      const prev = !pg.first && pg.lt < 0.35 ? (P.posPages[pg.index - 1] || []).find((p) => p.floor === i) : null;
      if (prev) out = { p: prev, k: expoIn(win(pg.lt, 0, 0.3)) };
    }
    const benefit = showBenefits && f.slab && !f.slab.plain && lt < 1.2;
    if (!benefit && !pos && !out) return;
    ctx.save();
    plane(P, ctx, V, Kc, -P.bw / 2, f.y1, 0);
    ctx.beginPath(); ctx.rect(0, 0, P.bw, f.h); ctx.clip();
    if (benefit) {
      const out = expoIn(win(lt, 1.0, 0.2));
      ctx.save(); ctx.translate(0, out * f.h);
      const rr = R.rec; if (out > 0) R.rec = () => {};
      slabContent(R, P, f.slab, 0, 0, 1, 1);
      R.rec = rr;
      ctx.restore();
    }
    if (out) quiet(R, () => K.text(R, out.p.L, 50, (f.h - out.p.L.vh) / 2 + out.k * f.h, P.C.onMain, 'left', 0, 'vaga'));
    if (pos) {
      const draw = () => K.text(R, pos.L, 50, (f.h - pos.L.vh) / 2 - (1 - k) * f.h, P.C.onMain, 'left', 0, 'vaga');
      if (k < 0.95) quiet(R, draw); else draw();
    }
    ctx.restore();
  }
  // windows on the right face: dark, then lit one by one with the count (D)
  function windows(R, P, V, Kc, f, fi, act, lt, pg) {
    if (act === 'V' && lt < 1.5) return;
    const { ctx } = R;
    for (const w of P.windows) {
      if (w.fi !== fi) continue;
      const k = act === 'V' ? spring(win(lt, 1.5 + (fi * P.perFloor + w.i) * 0.018, 0.26)) : 1;
      const q = windowQuad(P, fi, w.i, f).map(([X, Y, Z]) => scr(P, V, Kc, X, Y, Z));
      const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
      const lit = (w.lit >= 0 && litNow(P, act, pg, w.lit)) || (act === 'C' && fi === P.floors.length - 1 && w.i === P.perFloor - 1);
      quad(ctx, q.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]), lit ? '#FFFFFF' : INK);
    }
  }
  // the roof: the headline in volume (V), then the board (D)
  function roof(R, P, V, Kc, f0, act, A, pg) {
    if (!f0) return;
    const { ctx } = R;
    const lt = A.lt;
    const L = P.roofHead, sp = P.roofSprites;
    let rise = 0;
    if (act === 'V') rise = expoOut(win(lt, 1.0, 0.4));
    else if (act === 'D' && A.bespoke && pg.first) rise = 1 - expoIn(win(pg.lt, 0, 0.25));
    if (rise > 0.01) {
      const depth = 32, steps = 12;
      const X0 = -(L.w + 8) / 2, Y1 = f0.y1 + (sp.front.height) * rise;
      for (let s = steps; s >= 0; s--) {
        ctx.save();
        plane(P, ctx, V, Kc, X0, Y1, P.zRoof - (depth * s) / steps);
        ctx.scale(1, rise);
        ctx.drawImage(s === 0 ? sp.front : sp.side, 0, 0);
        if (s === 0 && rise > 0.95) R.rec(4, 4 + sp.pad, L.w, L.vh, 'título 3D', L.lines.join(' '));
        ctx.restore();
      }
    }
    if (act === 'D') {
      // page 1: the board goes up; later pages: the rows before go up and away, the new ones follow
      const up = pg.first ? expoOut(win(pg.lt, 0.12, 0.36)) : 1;
      const pages = [{ B: P.boardPages[pg.index], lt: pg.lt, t0: (i) => rowT0(pg.first, i) }];
      if (!pg.first && pg.lt < 0.4) pages.unshift({ B: P.boardPages[pg.index - 1], lt: pg.lt, out: true });
      if (up > 0.01) board(R, P, V, Kc, f0, up, pages);
    } else if (act === 'L' && A.bespoke && pg.first) {
      // the last page's board goes down
      const up = 1 - expoIn(win(pg.lt, 0, 0.3));
      if (up > 0.01) board(R, P, V, Kc, f0, up, [{ B: P.boardPages[P.boardPages.length - 1], lt: pg.lt, t0: () => -9 }]);
    }
  }
  // when row i of a page arrives on the board
  function rowT0(first, i) { return first ? (i === 0 ? 0.15 : 1.0) : (i === 0 ? 0.45 : 1.0); }
  function board(R, P, V, Kc, f0, up, pages) {
    const { ctx } = R, Bw = P.board.w, Bh = P.board.h;
    ctx.save();
    plane(P, ctx, V, Kc, -Bw / 2, f0.y1 + Bh * up, P.zRoof);
    ctx.beginPath(); ctx.rect(-6, -6, Bw + 12, Bh * up + 8); ctx.clip();
    rrect(ctx, 0, 0, Bw, Bh, 16); ctx.fillStyle = P.C.panel; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = P.C.panelEdge; ctx.stroke();
    for (const p of pages) if (p.B) boardRows(R, P, p);
    ctx.restore();
  }
  // The rows of one page, centred on the board: each comes up from below on
  // its beat, its number counting up, then its label; out: up and away.
  function boardRows(R, P, { B, lt, t0, out }) {
    const { ctx } = R, Bw = P.board.w;
    let y = 60 + (P.board.h - 120 - B.inner) / 2;
    B.rows.forEach((r, i) => {
      const s0 = out ? 0 : t0(i);
      const k = out ? 1 - expoIn(win(lt, i * 0.05, 0.3)) : expoOut(win(lt, s0, 0.3));
      if (k > 0) {
        const dy = (out ? -1 : 1) * (1 - k) * (r.h + 60);
        const cnt = !out && r.count != null ? Math.round(r.count * expoOut(win(lt, s0, i === 0 ? 0.85 : 0.6))) : null;
        const counting = cnt != null && cnt !== r.count;
        const sk = out ? 1 : expoOut(win(lt, s0 + 0.5, 0.3));
        const big = counting ? K.line(null, `${r.hl.prefix}${cnt}${r.hl.suffix}`, { font: r.big.font, size: r.big.size }) : r.big;
        const color = r.color === 'main' ? P.C.boardMain : P.C.boardInk;
        const draw = () => {
          ctx.save();
          ctx.beginPath(); ctx.rect(0, y - 40, Bw, r.h + 80); ctx.clip();
          if (r.stacked) {
            ctx.translate(0, y + dy);
            K.text(R, big, 40, 0, color, 'center', Bw - 80, 'número');
            if (r.small && sk > 0) {
              ctx.save(); ctx.beginPath(); ctx.rect(0, r.big.vh + 4, Bw, r.small.vh + r.small.size); ctx.clip();
              K.text(R, r.small, 40, r.big.vh + 24 + (1 - sk) * 140, P.C.boardInk, 'center', Bw - 80, 'rótulo');
              ctx.restore();
            }
          } else {
            const w = (r.big.w + (r.small ? 30 + r.small.w : 0)) * r.k;
            ctx.translate((Bw - w) / 2, y + dy); ctx.scale(r.k, r.k);
            K.text(R, big, 0, 0, color, 'left', 0, 'número');
            if (r.small && sk > 0) {
              ctx.save(); ctx.beginPath(); ctx.rect(r.big.w + 20, -r.small.size * 0.5, r.small.w + 30, r.big.vh + r.small.size); ctx.clip();
              K.text(R, r.small, r.big.w + 30, r.big.vh - r.small.vh + (1 - sk) * 140, P.C.boardInk, 'left', 0, 'rótulo');
              ctx.restore();
            }
          }
          ctx.restore();
        };
        // a row counts as shown once it has arrived, its number counted and its label in place
        if (out || k < 0.95 || counting || sk < 0.95) quiet(R, draw); else draw();
      }
      y += r.h + 70;
    });
  }

  // ---------------------------------------------------------------- C: the conversation
  function chat(R, P, A) {
    const lt = A.lt;
    const m = A.bespoke ? expoInOut(win(lt, 0, 0.45)) : 1;
    if (m < 1) {
      const { V, Kc } = building(R, P, 'C', A);
      const q = windowQuad(P, P.floors.length - 1, P.perFloor - 1).map(([X, Y, Z]) => scr(P, V, Kc, X, Y, Z));
      const ph = P.phone;
      const target = [[ph.x, ph.y], [ph.x + ph.w, ph.y], [ph.x + ph.w, ph.y + ph.h], [ph.x, ph.y + ph.h]];
      // the lit window turns to face us and becomes the phone
      quad(R.ctx, q.map((p, i) => [lerp(p[0], target[i][0], m), lerp(p[1], target[i][1], m)]), m > 0.6 ? P.chat.S.colors.screen : '#FFFFFF');
      return;
    }
    K.chatDraw(R, P.chat, lt, { type0: 0.55, type1: 1.3, send: 1.36 });
  }

  // ---------------------------------------------------------------- K: the card
  // Every card element at time lt of the card act (one layer; `fall` drops them in O).
  function cardLayer(R, P, g, lt, bespoke, fallAt = Infinity) {
    const Cd = P.card, c = P.content, Z = P.Z, CX = Z.W / 2;
    const e = expoInOut(win(lt, 0, 0.5));
    const fall = (k) => 1500 * expoIn(win(lt, fallAt + k * 0.04, 0.42));
    const enter = (k) => (bespoke ? 0 : (1 - expoOut(win(lt, k * 0.08, 0.45))) * 700);
    const ph = P.phone, head = P.chat.head;
    if (Cd.brand) {
      const L = Cd.brand;
      const x = bespoke ? lerp(ph.x + 170 * P.chat.k, CX - L.w / 2, e) : CX - L.w / 2;
      const y = (bespoke ? lerp(ph.y + head / 2 - 62, Cd.brandY, e) : Cd.brandY) + enter(0) + fall(0);
      K.text(R, L, x, y, P.C.ink, 'left', 0, 'marca');
    }
    if (Cd.number) {
      const L = Cd.number;
      const k = bespoke ? lerp(Math.max(40, 42 * P.chat.k) / L.size, 1, e) : 1;
      g.save();
      g.translate(bespoke ? lerp(ph.x + 170 * P.chat.k, CX - L.w / 2, e) : CX - L.w / 2, (bespoke ? lerp(ph.y + head / 2 + 16, Cd.numberY, e) : Cd.numberY) + enter(1) + fall(1));
      g.scale(k, k);
      K.text(R, L, 0, 0, P.C.ink, 'left', 0, 'número');
      g.restore();
    }
    if (Cd.pill) {
      // the sent bubble becomes the green button (pressed on the last beat of the bar)
      const fin = { x: CX - Cd.pill.w / 2, y: Cd.pillY, w: Cd.pill.w, h: Cd.pill.h, r: Cd.pill.h / 2 };
      const r = bespoke ? K.rectLerp(P.chat.bubble, fin, e) : { ...fin, w: fin.w * spring(win(lt, 0.15, 0.4)), x: CX - (fin.w * spring(win(lt, 0.15, 0.4))) / 2 };
      const press = lt >= 1.5 && lt < 2 ? 1 - 0.035 * (1 - expoOut(win(lt, 1.5, 0.25))) : 1;
      if (r.w > 4) {
        g.save();
        g.translate(r.x + r.w / 2, r.y + r.h / 2 + fall(2)); g.scale(press, press); g.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
        rrect(g, r.x, r.y, r.w, r.h, r.r); g.fillStyle = P.C.cta; g.fill();
        g.save(); rrect(g, r.x, r.y, r.w, r.h, r.r); g.clip();
        const ml = P.chat.msg, mo = expoIn(win(lt, 0, 0.2));
        if (bespoke && mo < 1) ml.draw(g, r.x + 40, r.y + 34 + mo * r.h, P.C.ctaInk, 'left', 0);
        if (lt >= 0.2) {
          const ty = r.y + (r.h - Cd.cta.vh) / 2 - (1 - expoOut(win(lt, 0.2, 0.3))) * r.h;
          E.drawIcon(g, 'message-circle', r.x + 80, ty + Cd.cta.vh / 2, 68, P.C.ctaInk, 2.6);
          K.text(R, Cd.cta, r.x + 146, ty, P.C.ctaInk, 'left', 0, 'botão');
        }
        g.restore();
        g.restore();
      }
    }
    if (Cd.qr && lt >= 0.5) {
      // its modules drop in, bottom row first, like bricks
      const x = CX - Cd.qr / 2, y = Cd.qrY + fall(3);
      const n = E.qrModules(c.contact.link).n;
      if (lt >= 0.5 + n * 0.012 + 0.1) g.drawImage(K.qrSprite(c.contact.link, Cd.qr, { dark: INK, light: '#FFFFFF', radius: 18 }), x, y, Cd.qr, Cd.qr);
      else {
        rrect(g, x, y, Cd.qr, Cd.qr, 18); g.fillStyle = '#FFFFFF'; g.fill();
        K.qr(g, c.contact.link, x, y, Cd.qr, { tile: false, dark: INK, reveal: (row) => { const t0 = 0.5 + (n - 1 - row) * 0.012; return lt >= t0 + 0.1 ? 1 : lt >= t0 ? expoIn(win(lt, t0, 0.1)) : 0; } });
      }
    }
    if (Cd.hint && Cd.qr && lt >= 1.0) {
      const slide = -1300 * (1 - expoOut(win(lt, 1.0, 0.32)));
      K.text(R, Cd.hint, CX - Cd.hint.w / 2 + slide, (Cd.qr ? Cd.hintY : Cd.pillY + Cd.pill.h + 50) + fall(4), P.C.ink, 'left', 0, 'aponta');
    }
    (Cd.lines || []).forEach((L, i) => K.text(R, L, P.Z.left, Cd[`line${i}`] + enter(i + 1) + fall(i + 1), P.C.ink, 'center', P.Z.w, 'contacto'));
  }
  function card(R, P, A) {
    const lt = A.lt;
    if (A.bespoke && lt < 0.6) {
      // the phone leaves downwards (its bubble stays: it becomes the button)
      const off = (x) => 1700 * expoIn(win(x, 0, 0.45));
      K.blurred(R, K.speed(off, lt), (g, d) => {
        g.save(); g.translate(0, off(lt - d));
        const rr = R.rec; R.rec = () => {};
        K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2.0, { type0: 0, type1: 0.01, send: -1, noBubble: true });
        R.rec = rr;
        g.restore();
      }, null);
    }
    const v = Math.max(Math.abs(K.speed((x) => expoInOut(win(x, 0, 0.5)) * 600, lt)), Math.abs(K.speed((x) => 1300 * expoOut(win(x, 1.0, 0.32)), lt)), A.bespoke ? 0 : Math.abs(K.speed((x) => 700 * expoOut(win(x, 0, 0.45)), lt)));
    K.blurred(R, v, (g, d) => cardLayer(R, P, g, lt - d, A.bespoke), null);
  }

  // ---------------------------------------------------------------- O: back to the first brick
  function loop(R, P, A) {
    const lt = A.lt;
    const Kact = P.act('K');
    const kEnd = Kact.d;
    // the card falls (one layer), then brick #1 comes down to where the video began
    const fall = (x) => 1500 * expoIn(win(x, 0, 0.5));
    if (lt < 0.62) K.blurred(R, Math.abs(K.speed(fall, lt)), (g, d) => cardLayer(R, P, g, kEnd + (lt - d), Kact.bespoke, kEnd), null);
    if (lt >= 0.38) {
      const Kc = P.k0, CX = P.Z.W / 2, CY = P.Z.cy;
      const off = (x) => -1500 * (1 - expoOut(win(x, 0.38, 0.45)));
      K.blurred(R, K.speed(off, lt), (g, d) => {
        g.save();
        g.translate(CX, CY + off(lt - d)); g.scale(Kc.z, Kc.z); g.translate(-CX - Kc.x, -CY - Kc.y);
        for (const b of P.bricks) if (b.course === 0) drawBrick(R, P, b, b.x, b.y, b.w, b.h);
        g.restore();
      }, null);
    }
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Kact = P.act('K');
    const riserFrom = Math.max(0, Kact.start - 2);
    const bass = [55, 43.65, 65.41, 49];
    const clack = (t, g = 0.28) => { ev.push({ t, kind: 'noise', filter: 'bandpass', f: 2600, q: 5, dur: 0.06, gain: g }); ev.push({ t, kind: 'tone', hz: 920, hz1: 640, wave: 'square', dur: 0.05, gain: 0.08 }); };
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 135, f1: 46, dur: 0.3, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 8000, dur: 0.035, gain: 0.07, pan: 0.3 });
      if (t < riserFrom || t >= Kact.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'triangle', dur: 0.4, gain: 0.32, lp: 500 });
    }
    for (const t of P.timeline.cuts) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 900, dur: 0.28, gain: 0.45 }, { t, kind: 'tone', hz: 98, hz1: 49, wave: 'triangle', dur: 0.4, gain: 0.35 });
    if (Kact.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Kact.start - riserFrom, f0: 300, f1: 6000, gain: 0.26 });
    for (const b of P.bricks) { const e = P.events.find((x) => x.course === b.course); if (e) clack(e.beat * 0.5 + 0.02 + b.k * 0.06 + 0.2); }
    const at = (kind, dt) => { const a = P.act(kind); return a ? a.start + dt : null; };
    // every new page of an act: a swoosh (M: the next floor drops on top)
    const swoosh = (t) => ev.push({ t, kind: 'noise', filter: 'lowpass', f: 1200, dur: 0.24, gain: 0.3 });
    for (const a of P.acts) if (a.pages) for (let p = 1; p < a.pages.length; p++) swoosh(a.start + p * 2);
    const M = P.act('M'); if (M) P.slabPages.forEach((list, p) => list.forEach((s, j) => clack(M.start + p * 2 + slabT0(p === 0, j) + 0.05, 0.2)));
    const V = P.act('V'); if (V) for (let k = 0; k < P.nExtra; k++) clack(V.start + 0.5 + (P.nExtra - 1 - k) * 0.11 + 0.3, 0.32);
    const D = P.act('D'); if (D) for (let i = 0; i < P.nLit; i++) ev.push({ t: D.start + P.vacPage * 2 + P.litFrom + litAt(P, i), kind: 'tone', hz: 660 + i * 40, wave: 'sine', dur: 0.06, gain: 0.1 });
    const C = P.act('C'); if (C) { for (let t = 0.55; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.08 }); ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.25 }); }
    if (P.card.qr) for (let r = 0; r < 8; r++) clack(at('K', 0.5 + r * 0.06), 0.16);
    const O = P.act('O'); ev.push({ t: O.start, kind: 'riser', f0: 3000, f1: 300, dur: 0.4, gain: 0.2 }); clack(O.start + 0.8, 0.3);
    return ev.filter((e) => e.t != null && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'tijolo', name: 'Tijolo', concept: 'O tijolo vira palavra, as palavras viram prédio.',
    font: { head: { family: 'Barlow Condensed', weight: 800 }, bold: { family: 'Barlow Condensed', weight: 700 } },
    palettes: {
      light: { bg: '#ECE6DA', ink: '#161412', main: '#C4502E', accent: '#C4502E' },
      dark: { bg: '#1A1714', ink: '#F2EDE4', main: '#C4502E', accent: '#E8A27A' },
    },
    // 10–30 s: benefits, highlights and positions in pages, each page drawn by the model
    bgModes: ['light', 'dark'], photos: 0, travel: 'crane', pages: true, pageMove: true, slides: { V: true },
    // colours that depend on the chosen ones: text on the bricks, the 3D faces, the board
    colors(c) {
      // the brick is the highlight: «Cor de destaque» colours the bricks
      if (c.accentPicked) c.main = c.accent;
      c.onMain = U.ensureContrast('#FFFFFF', c.main, 4.5);
      c.side = U.mix(c.main, '#000000', 0.32);
      c.top = U.mix(c.main, '#FFFFFF', 0.25);
      c.panel = c.mode === 'dark' ? '#F2EDE4' : '#FFFFFF';
      c.panelEdge = INK;
      c.boardInk = INK;
      c.boardMain = U.ensureContrast(c.main, c.panel, 3);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => wall(R, R.P, A.lt),
      M: (R, A) => slabs(R, R.P, A),
      V: (R, A) => building(R, R.P, 'V', A),
      D: (R, A) => building(R, R.P, 'D', A),
      L: (R, A) => building(R, R.P, 'L', A),
      C: (R, A) => chat(R, R.P, A),
      K: (R, A) => card(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
