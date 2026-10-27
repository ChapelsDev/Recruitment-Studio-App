// Video recipe «Planta»: a blueprint filmed in one continuous camera move that
// follows a dimension line from the title block to the WhatsApp card and back.
// No cuts: every act is a station on the same sheet, so the recipe is
// `continuous` (its own camera whip is the travel move between any two acts).
// Stations: title block (H), a note (I his intro), a plan per page of
// benefits (M benefits in rooms, V the walls of the last one rise), a
// dimension per page of highlights (D: each value on its dimension line, one
// tick per vacancy), a legend per page of positions (L), a note (F his
// closing line), phone (C conversation, K card); O whips back to the title
// block. 10–30 s: every page is a station of its own along the line.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { lerp, win, expoOut, expoIn, expoInOut, spring } = K;
  // offsets from one station to the next (down, right, right, down, …)
  const STEPS = [[0, 2300], [2500, 0], [2500, 0], [0, 2400]];
  const WHIP = 0.36;
  // the station of an act's page (V raises the walls of the last plan)
  function stationOf(P, kind, page) {
    if (kind === 'H') return 'title';
    if (kind === 'I') return 'intro';
    if (kind === 'M') return `plan${page}`;
    if (kind === 'V') return `plan${Math.max(0, P.benPages.length - 1)}`;
    if (kind === 'D') return `dim${page}`;
    if (kind === 'L') return `legend${page}`;
    if (kind === 'F') return 'closing';
    return 'phone';
  }
  const typeOf = (s) => s.replace(/\d+$/, '');
  const pageOf = (s) => Number((/\d+$/.exec(s) || ['0'])[0]);

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    // the benefits in rooms, a plan per page
    P.bensOf = (items) => items.map((i) => ({ L: K.fit(P, c.benefits[i], { font: F.head, maxSize: 70, minSize: 40, maxW: 640, maxLines: 2, lh: 1.08 }), icon: c.icons[i] || 'check' }));
    P.benPages = (Ma ? Ma.pages : []).map(P.bensOf);
    // every act's page is a segment of the video at a station; the stations
    // that this video visits, in order
    P.segs = [];
    for (const a of P.acts) {
      if (a.kind === 'O') continue;
      const n = a.pages ? a.pages.length : 1;
      for (let p = 0; p < n; p++) P.segs.push({ kind: a.kind, page: p, start: a.start + p * 2, end: p === n - 1 ? a.end : a.start + (p + 1) * 2, st: stationOf(P, a.kind, p) });
    }
    P.order = [];
    for (const sg of P.segs) if (!P.order.includes(sg.st)) P.order.push(sg.st);
    P.st = {};
    let pos = [0, 0];
    P.order.forEach((s, i) => { if (i) { const d = STEPS[(i - 1) % STEPS.length]; pos = [pos[0] + d[0], pos[1] + d[1]]; } P.st[s] = pos; });
    P.arrive = {};
    for (const sg of P.segs) if (P.arrive[sg.st] == null) P.arrive[sg.st] = sg.start;
    // when the benefits of a plan arrive (its M page)
    P.planStart = {};
    for (const sg of P.segs) if (sg.kind === 'M') P.planStart[sg.st] = sg.start;

    // the title block
    P.head = K.fit(P, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: 118, minSize: 54, maxW: 800, maxLines: 4, lh: 1.04 });
    P.kicker = c.kicker ? K.fit(P, c.kicker, { font: F.head, upper: true, track: 0.12, maxSize: 44, minSize: 40, maxW: 760, maxLines: 2 }) : null;
    P.brand = c.showLogo && c.brandName ? K.fit(P, c.brandName, { font: F.bold, upper: true, track: 0.1, maxSize: 44, minSize: 40, maxW: 760, maxLines: 2 }) : null;
    const tb = { w: 900, top: P.kicker ? P.kicker.vh + 70 : 40, bottom: P.brand ? P.brand.vh + 56 : 30 };
    tb.h = tb.top + P.head.vh + 120 + tb.bottom;
    P.tb = tb;
    P.headY = -tb.h / 2 + tb.top + 60;
    P.headLines = P.head.lines.map((ln, i) => ({ text: ln, w: P.head.widths[i], y: P.headY + i * P.head.lhPx }));
    const l0 = P.headLines[0];
    P.cam0 = { x: 0, y: l0.y + P.head.capPx / 2, z: Math.min(1.35, (Z.w + 40) / (l0.w + 80)) };

    // the plan (its rooms are the page's benefits)
    P.plan = { w: 920, h: 900 };
    // a dimension per page of highlights: each value on its dimension line
    // (counting up when it is a plain number) with its label under it; the
    // vacancies on a ruler with one tick each
    const hl = c.highlights;
    const blockOf = (h) => {
      if (h.role === 'vacancies') {
        const L = K.fit(P, [h.value, h.label].filter(Boolean).join(' '), { font: F.head, maxSize: 120, minSize: 60, maxW: 860, maxLines: 2 });
        return { hl: h, vac: true, vacN: h.count != null ? Math.min(30, h.count) : 0, L, H: 110 + L.vh };
      }
      let amount = K.line(P, h.value || h.label, { font: F.head, size: 190 });
      let k = Math.min(1, 860 / amount.w);
      if (k < 0.55) { amount = K.fit(P, h.value || h.label, { font: F.head, maxSize: 150, minSize: 60, maxW: 860, maxLines: 2, lh: 1.04 }); k = 1; }
      const label = h.value && h.label ? K.fit(P, h.label, { font: F.bold, maxSize: 70, minSize: 40, maxW: 860, maxLines: 2 }) : null;
      return { hl: h, amount, k, label, count: h.value && h.count != null ? h.count : null, H: amount.vh * k + 100 + (label ? label.vh : 0) };
    };
    P.dimPages = (Da ? Da.pages : []).map((items) => {
      const blocks = items.map((i) => blockOf(hl[i]));
      const H = blocks.reduce((a, b) => a + b.H, 0) + 90 * Math.max(0, blocks.length - 1);
      let y = -H / 2;
      for (const b of blocks) { b.y = y; y += b.H + 90; }
      return { blocks, H };
    });
    // a legend per page of positions
    const legendTitle = c.positionsTitle ? K.fit(P, c.positionsTitle, { font: F.head, upper: true, track: 0.1, maxSize: 46, minSize: 40, maxW: 820, maxLines: 1 }) : null;
    P.legendPages = (La ? La.pages : []).map((items) => {
      const rows = items.map((i) => K.fit(P, c.positions[i], { font: F.bold, maxSize: 64, minSize: 40, maxW: 760, maxLines: 2, lh: 1.08 }));
      let ry = 0;
      const rowY = rows.map((L) => { const y = ry; ry += Math.max(120, L.vh + 64); return y; });
      return { title: legendTitle, rows, rowY, tableH: ry + (legendTitle ? legendTitle.vh + 70 : 0) };
    });
    // his intro and closing line, each a note on the sheet
    const noteOf = (text) => (text ? K.fit(P, text, { font: F.head, maxSize: 96, minSize: 48, maxW: 780, maxLines: 5, lh: 1.1, maxH: Z.cH * 0.6 }) : null);
    P.notes = { intro: P.act('I') ? noteOf(c.intro) : null, closing: P.act('F') ? noteOf(c.closing) : null };
    // the phone and the card (around the phone station)
    const S5 = P.st.phone || [0, 0];
    const ph = Math.min(1220, Z.cH - 10), pw = Math.min(840, Z.w);
    P.phone = { x: S5[0] - pw / 2, y: S5[1] - ph / 2, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.bold, fontStrong: F.head, radius: 70 * (pw / 880),
      colors: { screen: '#FFFFFF', head: P.C.main, headInk: '#FFFFFF', field: U.mix(P.C.main, '#FFFFFF', 0.9), fieldInk: P.C.main, bubble: P.C.cta, bubbleInk: P.C.ctaInk, send: P.C.cta, sendInk: P.C.ctaInk } });
    const card = {};
    if (c.contact) {
      card.number = K.fit(P, c.contact.display, { font: F.head, maxSize: 130, minSize: 64, maxW: 940, maxLines: 1 });
      card.cta = K.line(P, c.contact.cta, { font: F.head, size: 66 });
      card.pill = { h: 150, w: Math.min(960, card.cta.w + 210) };
      card.hint = K.line(P, c.contact.hint, { font: F.bold, size: 48 });
      const rest = card.number.vh + 60 + card.pill.h + 60 + 34 + card.hint.vh;
      card.qr = c.qr ? K.clamp(Z.cH - rest - 40, 240, 470) : 0;
      const H = rest + card.qr;
      let y = S5[1] - H / 2;
      card.numberY = y; y += card.number.vh + 60;
      card.pillY = y; y += card.pill.h + 60;
      card.qrY = y; card.hintY = y + card.qr + 34;
    } else {
      const lines = P.content.contacts.slice(0, 3); // the ad's contacts, unless hidden
      card.lines = lines.map((s) => K.fit(P, s, { font: F.bold, maxSize: 72, minSize: 44, maxW: 920, maxLines: 2 }));
      if (P.brand) card.lines.unshift(K.fit(P, c.brandName, { font: F.head, upper: true, maxSize: 90, minSize: 50, maxW: 920, maxLines: 2 }));
      if (!card.lines.length) card.lines = [K.fit(P, c.headline || ' ', { font: F.head, upper: P.upper, maxSize: 110, minSize: 60, maxW: 920, maxLines: 4 })];
      const H = card.lines.reduce((a, L) => a + L.vh + 50, -50);
      let y = S5[1] - H / 2;
      card.linesY = card.lines.map((L) => { const r = y; y += L.vh + 50; return r; });
    }
    P.card = card;
    P.keys = cameraKeys(P);
    P.camAt = (tt) => cam(P, tt);
  }

  // ---------------------------------------------------------------- the camera
  // One continuous move: slow drifts at the stations, whips between them
  // (centred on the act changes), and the long way back for the loop.
  function stationCam(P, s, kind) {
    const Z = P.Z, [x, y] = P.st[s];
    const fit = (w, h, zmax = 1) => Math.min(zmax, (Z.w + 80) / w, (Z.cH * 0.95) / h);
    const type = typeOf(s);
    if (type === 'title') return { x, y, z: fit(P.tb.w, P.tb.h) };
    if (type === 'plan') return kind === 'V' ? { x, y: y - 80, z: fit(P.plan.w, P.plan.h) * 0.84 } : { x, y, z: fit(P.plan.w, P.plan.h) * 0.98 };
    if (type === 'dim') return { x, y, z: fit(920, P.dimPages[pageOf(s)].H + 200) };
    if (type === 'legend') { const tH = P.legendPages[pageOf(s)].tableH; return { x, y: y - tH / 2 + Math.min(tH, Z.cH * 0.9) / 2, z: fit(920, Math.min(tH, Z.cH * 0.9) + 40) }; }
    if (type === 'intro' || type === 'closing') { const L = P.notes[type]; return { x, y, z: fit(940, (L ? L.vh : 100) + 260) }; }
    return { x, y, z: Math.min(1, (Z.cH * 0.98) / P.phone.h) };
  }
  function cameraKeys(P) {
    const keys = [{ t: 0, ...P.cam0 }];
    const L = P.headLines;
    const tbCam = stationCam(P, 'title');
    const lineCam = (i) => { const l = L[Math.min(i, L.length - 1)]; return { x: 0, y: l.y + P.head.capPx / 2, z: Math.min(1.15, (P.Z.w + 60) / (l.w + 120)) }; };
    keys.push({ t: 0.05, d: 0.4, ...lineCam(1) }, { t: 0.55, d: 0.4, ...lineCam(2) }, { t: 1.05, d: 0.4, ...tbCam, z: tbCam.z * 1.04 }, { t: 1.45, d: 0.4, ...tbCam, z: tbCam.z * 0.97, drift: true });
    let at = 'title';
    for (const sg of P.segs) {
      if (sg.kind === 'H') continue;
      const s = sg.st;
      const c = stationCam(P, s, sg.kind);
      if (s !== at) keys.push({ t: sg.start - WHIP / 2, d: WHIP, ...c });
      else keys.push({ t: sg.start, d: 0.5, ...c });
      // a slow drift until the page ends (the camera never stops)
      const tH = typeOf(s) === 'legend' ? P.legendPages[pageOf(s)].tableH : 0;
      const drift = sg.kind === 'L' ? { y: c.y + Math.max(40, tH - P.Z.cH * 0.9) } : sg.kind === 'K' ? { z: c.z * 0.98 } : { y: c.y + 24, z: c.z * 1.03 };
      keys.push({ t: sg.start + (s !== at ? WHIP / 2 : 0.5), d: Math.max(0.2, sg.end - sg.start - (s !== at ? WHIP : 0.5) - 0.18), ...c, ...drift, drift: true });
      at = s;
    }
    // the way back pulls out over the whole sheet, then dives into the title
    const O = P.act('O');
    const zFit = sheetFit(P), prevZ = keys[keys.length - 1].z;
    const arc = Math.max(0, (Math.log(prevZ) + Math.log(P.cam0.z)) / 2 - Math.log(zFit));
    keys.push({ t: O.start + 0.05, d: O.d - 0.07, ...P.cam0, arc });
    return keys;
  }
  // the zoom that shows every station of the sheet at once
  function sheetFit(P) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of P.order) { const [x, y] = P.st[s]; x0 = Math.min(x0, x - 500); x1 = Math.max(x1, x + 500); y0 = Math.min(y0, y - 650); y1 = Math.max(y1, y + 650); }
    return Math.min(P.Z.w / (x1 - x0), P.Z.cH / (y1 - y0));
  }
  function cam(P, t) {
    const Kk = P.keys;
    let c = { x: Kk[0].x, y: Kk[0].y, z: Kk[0].z };
    for (let i = 1; i < Kk.length; i++) {
      const k = Kk[i];
      if (t < k.t) break;
      const e = k.drift ? win(t, k.t, k.d) : expoInOut(win(t, k.t, k.d));
      const dip = k.arc ? k.arc * Math.sin(Math.PI * win(t, k.t, k.d)) : 0;
      c = { x: lerp(c.x, k.x, e), y: lerp(c.y, k.y, e), z: Math.exp(lerp(Math.log(c.z), Math.log(k.z), e) - dip) };
    }
    return c;
  }

  // ---------------------------------------------------------------- drawing helpers
  function grid(R, P, Kc) {
    const { ctx } = R;
    const hw = P.Z.W / 2 / Kc.z + 20, hh = P.Z.H / Kc.z;
    const x0 = Kc.x - hw, x1 = Kc.x + hw, y0 = Kc.y - hh, y1 = Kc.y + hh;
    ctx.lineWidth = 1.5 / Kc.z;
    for (const [step, color] of [[60, P.C.grid], [300, P.C.gridMajor]]) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    }
  }
  // a dimension line from a to b, drawn up to k, retracted from its start by s
  function cota(R, P, a, b, k, w = 4, s = 0) {
    if (k <= 0 || s >= 1) return;
    const { ctx } = R;
    const x0 = lerp(a[0], b[0], s), y0 = lerp(a[1], b[1], s), x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k);
    ctx.strokeStyle = P.C.ink; ctx.lineWidth = Math.max(w, 2.5 / (R.camZ || 1)); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const tick = (px, py) => { ctx.save(); ctx.translate(px, py); ctx.rotate(ang + Math.PI / 4); ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.stroke(); ctx.restore(); };
    if (s <= 0) tick(a[0], a[1]);
    if (k >= 1) tick(b[0], b[1]);
  }
  // outlines that draw themselves, then the fill sweeps in
  function drawnText(R, P, text, L, x, y, k, tag, color) {
    const { ctx } = R;
    if (k <= 0) return;
    const w = K.textWidth(text, L);
    E.setFont(ctx, L.font, L.size, L.track);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    // (k = 1 is the finished text: win(1, 0.55, 0.45) alone stops a hair short of 1)
    const outline = win(k, 0, 0.7), fill = k >= 1 ? 1 : win(k, 0.55, 0.45);
    if (fill < 1) {
      ctx.save();
      ctx.setLineDash([L.size * 3, L.size * 3]); ctx.lineDashOffset = L.size * 3 * (1 - outline);
      ctx.lineWidth = 2.5; ctx.strokeStyle = color || P.C.ink;
      ctx.strokeText(text, x, y + L.capPx);
      ctx.restore();
    }
    if (fill > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 4, y - L.size, (w + 8) * expoOut(fill), L.size * 2.2); ctx.clip();
      ctx.fillStyle = color || P.C.ink; ctx.fillText(text, x, y + L.capPx);
      ctx.restore();
    }
    if (fill >= 1) R.rec(x, y, w, L.capPx, tag, text);
  }
  function drawnBlock(R, P, L, cx, y, k, tag, color) {
    L.lines.forEach((ln, i) => drawnText(R, P, ln, L, cx - L.widths[i] / 2, y + i * L.lhPx, k, tag, color));
  }

  // ---------------------------------------------------------------- stations
  function titleBlock(R, P, t) {
    const { ctx } = R;
    const [sx, sy] = P.st.title, tb = P.tb;
    const x = sx - tb.w / 2, y = sy - tb.h / 2;
    ctx.strokeStyle = P.C.ink;
    ctx.lineWidth = 8; ctx.strokeRect(x, y, tb.w, tb.h);
    ctx.lineWidth = 2.5; ctx.strokeRect(x + 18, y + 18, tb.w - 36, tb.h - 36);
    if (P.kicker) { ctx.beginPath(); ctx.moveTo(x + 18, y + tb.top); ctx.lineTo(x + tb.w - 18, y + tb.top); ctx.stroke(); }
    if (P.brand) { ctx.beginPath(); ctx.moveTo(x + 18, y + tb.h - tb.bottom); ctx.lineTo(x + tb.w - 18, y + tb.h - tb.bottom); ctx.stroke(); }
    ctx.fillStyle = P.C.accent; ctx.beginPath(); ctx.moveTo(x + tb.w - 18, y + 18); ctx.lineTo(x + tb.w - 18, y + 78); ctx.lineTo(x + tb.w - 78, y + 18); ctx.closePath(); ctx.fill();
    // line 1 is there from the first frame; the loop leaves only line 1
    const visible = t < P.act('O').start;
    P.headLines.forEach((ln, i) => {
      const lx = sx - ln.w / 2;
      if (i === 0) drawnText(R, P, ln.text, P.head, lx, sy + ln.y, 1, 'título');
      else if (visible) drawnText(R, P, ln.text, P.head, lx, sy + ln.y, win(t, Math.min(i - 1, 2) * 0.5 + 0.04, 0.42), 'título');
    });
    if (P.kicker && visible) drawnBlock(R, P, P.kicker, sx, y + (tb.top - P.kicker.vh) / 2 + 4, win(t, Math.min(P.headLines.length - 1, 2) * 0.5 + 0.06, 0.35), 'chamada');
    if (P.brand && visible) drawnBlock(R, P, P.brand, sx, y + tb.h - tb.bottom + (tb.bottom - P.brand.vh) / 2, win(t, 1.5, 0.35), 'marca');
  }
  // plan → building: rooms split (M), walls rise and the view turns (V, on the last plan only)
  function planView(P, t, s) {
    const V = P.act('V');
    if (!V || stationOf(P, 'V', 0) !== s) return { tilt: 0, yaw: 0, height: 0 };
    const lt = t - V.start;
    const a = expoInOut(win(lt, 0, 0.55));
    const yaw = lerp(0, 0.5, expoInOut(win(lt, 0.5, 0.5))) + lerp(0, 0.35, expoInOut(win(lt, 1.0, 0.5)));
    const flat = expoIn(win(lt, 1.5, 0.35));
    return { tilt: a * 0.95, yaw: yaw * a, height: 260 * expoOut(win(lt, 0.05, 0.5)) * (1 - flat) };
  }
  function proj(V, cx, cy, X, Y, Zh) {
    const dx = X - cx, dy = Y - cy;
    const xr = dx * Math.cos(V.yaw) - dy * Math.sin(V.yaw), yr = dx * Math.sin(V.yaw) + dy * Math.cos(V.yaw);
    return [cx + xr, cy + yr * Math.cos(V.tilt) - Zh * Math.sin(V.tilt)];
  }
  // one plan station: its page of benefits, one room each
  function plan(R, P, t, s) {
    const { ctx } = R;
    const list = P.benPages[pageOf(s)] || [];
    const m0 = P.planStart[s];
    const t0 = P.arrive[s];
    const V = planView(P, t, s);
    const { w, h } = P.plan;
    const [cx, cy] = P.st[s];
    const pj = (X, Y, Zh) => proj(V, cx, cy, X, Y, Zh);
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const n = m0 != null ? Math.max(1, list.length) : 1;
    const split = (i) => (m0 != null ? expoOut(win(t, m0 + 0.5 + (i - 1) * 0.5, 0.35)) : 1);
    const walls = [[x0, y0, x0 + w, y0], [x0 + w, y0, x0 + w, y0 + h], [x0 + w, y0 + h, x0, y0 + h], [x0, y0 + h, x0, y0]];
    for (let i = 1; i < n; i++) { const k = split(i); if (k > 0) walls.push([x0, y0 + (h * i) / n, x0 + w * k, y0 + (h * i) / n]); }
    const draw = expoOut(win(t, t0 - 0.02, 0.4));
    // the floor carries the benefits
    ctx.save();
    const o = pj(x0, y0, 0), ex = pj(x0 + 1, y0, 0), ey = pj(x0, y0 + 1, 0);
    ctx.transform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]);
    ctx.beginPath(); ctx.rect(-30, -30, (w + 60) * draw, h + 60); ctx.clip();
    ctx.fillStyle = P.C.fill; ctx.fillRect(0, 0, w, h);
    if (m0 != null) list.forEach((b, i) => {
      const tb = m0 + 0.05 + i * 0.5;
      if (t < tb) return;
      let rooms = 1;
      for (let k = 1; k < list.length; k++) rooms += expoInOut(win(t, m0 + 0.5 + (k - 1) * 0.5, 0.35));
      const ry = (h / rooms) * (i + 0.5);
      const k = expoOut(win(t, tb + 0.05, 0.35));
      ctx.save();
      ctx.beginPath(); ctx.rect(0, ry - 150, w, 300); ctx.clip();
      ctx.translate(0, (1 - k) * 100);
      ctx.beginPath(); ctx.arc(110, ry, 50, 0, Math.PI * 2); ctx.fillStyle = P.C.accent; ctx.fill();
      E.drawIcon(ctx, b.icon, 110, ry, 54, P.C.bg, 2.6);
      K.text(R, b.L, 200, ry - b.L.vh / 2, P.C.ink, 'left', 0, 'vantagem');
      ctx.restore();
    });
    ctx.restore();
    const Hh = V.height;
    const faces = walls.map(([ax, ay, bx, by]) => {
      const pa = pj(ax, ay, 0), pb = pj(bx, by, 0), qa = pj(ax, ay, Hh), qb = pj(bx, by, Hh);
      return { pts: [pa, pb, qb, qa], depth: (pa[1] + pb[1]) / 2 };
    }).sort((a, b) => a.depth - b.depth);
    ctx.save();
    const p0 = pj(x0 - 30, y0 - 30, 0);
    if (draw < 1) { ctx.beginPath(); ctx.rect(p0[0], p0[1] - 400, (w + 60) * draw, h + 900); ctx.clip(); }
    ctx.lineJoin = 'round';
    for (const f of faces) {
      ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (const p of f.pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      // glass walls: the benefits on the floor stay readable through them
      if (Hh > 2) { ctx.globalAlpha = 0.5; ctx.fillStyle = P.C.wall; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = P.C.ink; ctx.lineWidth = Hh > 2 ? 3 : 12; ctx.stroke();
    }
    ctx.restore();
  }
  // A text that counts as shown only once it has arrived: drawn, not recorded.
  function quiet(R, fn) {
    const rr = R.rec;
    R.rec = () => {};
    try { fn(); } finally { R.rec = rr; }
  }
  // one dimension station: each highlight of its page on its beat
  function dimension(R, P, t, s) {
    const { ctx } = R;
    const pg = P.dimPages[pageOf(s)], lt = t - P.arrive[s];
    const [cx, cy] = P.st[s];
    pg.blocks.forEach((b, j) => {
      const t0 = 0.05 + j * 0.9;
      if (lt < t0) return;
      const y = cy + b.y;
      if (b.vac) {
        // the ruler: one tick per vacancy, then the words
        const ry = y + 70, n = b.vacN || 1, span = 860, step = span / Math.max(1, n);
        ctx.strokeStyle = P.C.ink; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx - span / 2, ry); ctx.lineTo(cx - span / 2 + span * expoOut(win(lt, t0, 0.3)), ry); ctx.stroke();
        if (b.vacN) for (let i = 0; i < n; i++) {
          const k = spring(win(lt, t0 + (i / n) * 0.42, 0.18));
          if (k <= 0) continue;
          ctx.fillStyle = P.C.accent; ctx.fillRect(cx - span / 2 + step * (i + 0.5) - step * 0.32, ry - 70 * k, step * 0.64, 70 * k);
        }
        if (lt >= t0 + 0.12) {
          const vk = expoOut(win(lt, t0 + 0.12, 0.3));
          ctx.save(); ctx.beginPath(); ctx.rect(cx - 460, ry - 6, 920, b.L.vh + 90); ctx.clip();
          const draw = () => K.text(R, b.L, cx - b.L.w / 2, ry + 40 - (1 - vk) * (b.L.vh + 50), P.C.ink, 'center', b.L.w, 'vagas');
          if (vk < 0.95) quiet(R, draw); else draw();
          ctx.restore();
        }
        return;
      }
      // the value over its dimension line (counting up when it is a plain number)
      const aH = b.amount.vh * b.k, ly = y + aH + 60;
      const k = expoOut(win(lt, t0, 0.6)), half = 430 * k;
      ctx.strokeStyle = P.C.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx - half, ly); ctx.lineTo(cx + half, ly); ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + sx * half, ly - 50); ctx.lineTo(cx + sx * half, ly + 50); ctx.stroke();
        ctx.save(); ctx.translate(cx + sx * half, ly); ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke(); ctx.restore();
      }
      const n = b.count != null ? Math.round(b.count * k) : null;
      const tag = b.hl.role === 'salary' ? 'salário' : 'destaque';
      ctx.save(); ctx.translate(cx, y); ctx.scale(b.k, b.k);
      if (n != null && n !== b.count) { const L = K.line(null, `${b.hl.prefix}${n}${b.hl.suffix}`, { font: P.F.head, size: b.amount.size }); L.draw(ctx, -L.w / 2, 0, P.C.ink, 'left', 0); }
      else K.text(R, b.amount, -b.amount.w / 2, 0, P.C.ink, 'center', b.amount.w, tag);
      ctx.restore();
      if (b.label && lt >= t0 + 0.45) {
        const pk = expoOut(win(lt, t0 + 0.45, 0.3));
        ctx.save(); ctx.beginPath(); ctx.rect(cx - 450, ly + 6, 900, b.label.vh + 110); ctx.clip();
        const draw = () => K.text(R, b.label, cx - b.label.w / 2, ly + 40 - (1 - pk) * 110, P.C.accent, 'center', b.label.w, b.hl.role === 'salary' ? 'período' : 'rótulo');
        if (pk < 0.95) quiet(R, draw); else draw();
        ctx.restore();
      }
    });
  }
  // one legend station: the table with its page of positions
  function legend(R, P, t, s) {
    const { ctx } = R;
    const pg = P.legendPages[pageOf(s)], lt = t - P.arrive[s];
    const [cx, cy] = P.st[s];
    const w = 900, x0 = cx - w / 2;
    let y = cy - pg.tableH / 2;
    ctx.strokeStyle = P.C.ink; ctx.lineWidth = 6;
    const open = expoOut(win(lt, -0.05, 0.4));
    ctx.strokeRect(x0, y, w, pg.tableH * open);
    if (pg.title) {
      if (lt >= 0) drawnBlock(R, P, pg.title, x0 + 40 + pg.title.w / 2, y + 34, win(lt, 0, 0.35), 'título vagas');
      y += pg.title.vh + 70;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w * open, y); ctx.stroke();
    }
    const n = pg.rows.length;
    pg.rows.forEach((Lr, i) => {
      const t0 = 0.1 + Math.min(3, Math.floor((i * 4) / Math.max(4, n))) * 0.5 + (n > 4 && i === n - 1 ? 0.12 : 0);
      if (lt < t0) return;
      const ry = y + pg.rowY[i], rh = Math.max(120, Lr.vh + 64);
      const k = expoOut(win(lt, t0, 0.3));
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, ry + rh); ctx.lineTo(x0 + w * k, ry + rh); ctx.stroke();
      ctx.fillStyle = P.C.accent; ctx.fillRect(x0 + 40, ry + rh / 2 - 14, 28 * k, 28);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, ry, w, rh); ctx.clip();
      K.text(R, Lr, x0 + 100, ry + (rh - Lr.vh) / 2 + (1 - k) * rh, P.C.ink, 'left', 0, 'vaga');
      ctx.restore();
    });
  }
  // a note on the sheet (his intro or closing line): the frame is drawn, then
  // the words are traced and filled, like the title
  function note(R, P, t, s) {
    const L = P.notes[s];
    if (!L) return;
    const { ctx } = R;
    const lt = t - P.arrive[s];
    const [cx, cy] = P.st[s];
    const w = 940, h = L.vh + 200, x0 = cx - w / 2, y0 = cy - h / 2;
    const open = expoOut(win(lt, -0.05, 0.4));
    ctx.strokeStyle = P.C.ink; ctx.lineWidth = 6;
    ctx.strokeRect(x0, y0, w * open, h);
    ctx.lineWidth = 2.5; ctx.strokeRect(x0 + 18, y0 + 18, (w - 36) * open, h - 36);
    ctx.fillStyle = P.C.accent; ctx.beginPath(); ctx.moveTo(x0 + 18, y0 + 18); ctx.lineTo(x0 + 78, y0 + 18); ctx.lineTo(x0 + 18, y0 + 78); ctx.closePath(); ctx.fill();
    drawnBlock(R, P, L, cx, cy - L.vh / 2, win(lt, 0.1, 1.0), s === 'intro' ? 'intro' : 'fecho');
  }
  function phone(R, P, t) {
    const { ctx } = R;
    const Ca = P.act('C'), Ka = P.act('K');
    const ph = P.phone;
    if (Ca && t < Ka.start) {
      const lt = t - Ca.start;
      const draw = expoOut(win(lt, -0.05, 0.4)), fill = expoInOut(win(lt, 0.3, 0.3));
      ctx.save();
      ctx.setLineDash([4000, 4000]); ctx.lineDashOffset = 4000 * (1 - draw);
      K.rrect(ctx, ph.x, ph.y, ph.w, ph.h, 70); ctx.strokeStyle = P.C.ink; ctx.lineWidth = 6; ctx.stroke();
      ctx.restore();
      cota(R, P, [ph.x, ph.y - 70], [ph.x + ph.w, ph.y - 70], draw, 3);
      cota(R, P, [ph.x + ph.w + 70, ph.y], [ph.x + ph.w + 70, ph.y + ph.h], draw, 3);
      if (fill > 0) {
        ctx.save();
        K.rrect(ctx, ph.x, ph.y, ph.w, ph.h, 70); ctx.clip();
        ctx.beginPath(); ctx.rect(ph.x, ph.y, ph.w, ph.h * fill); ctx.clip();
        K.chatDraw(R, P.chat, lt, { type0: 0.6, type1: 1.32, send: 1.37 });
        ctx.restore();
      }
      return;
    }
    cardAt(R, P, t);
  }
  function cardAt(R, P, t) {
    const { ctx } = R;
    const Ka = P.act('K'), Cd = P.card, ph = P.phone;
    const lt = t - Ka.start;
    const fromChat = !!P.act('C');
    const [cx] = P.st.phone;
    const e = fromChat ? expoInOut(win(lt, 0, 0.5)) : 1;
    if (fromChat && e < 1) {
      // the phone folds away; the header number grows; the bubble becomes the button
      ctx.save();
      K.rrect(ctx, ph.x, ph.y + ph.h * e, ph.w, ph.h * (1 - e), 70); ctx.clip();
      const rr = R.rec; R.rec = () => {};
      K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true });
      R.rec = rr;
      ctx.restore();
    }
    if (!Cd.number) {
      Cd.lines.forEach((L, i) => drawnBlock(R, P, L, cx, Cd.linesY[i], win(lt, i * 0.3, 0.45), 'contacto'));
      return;
    }
    const k = fromChat ? lerp(Math.max(40, 42 * P.chat.k) / Cd.number.size, 1, e) : 1;
    ctx.save();
    ctx.translate(fromChat ? lerp(ph.x + 170 * P.chat.k, cx - Cd.number.w / 2, e) : cx - Cd.number.w / 2, (fromChat ? lerp(ph.y + P.chat.head / 2 + 16, Cd.numberY, e) : Cd.numberY));
    ctx.scale(k, k);
    if (fromChat) K.text(R, Cd.number, 0, 0, P.C.ink, 'left', 0, 'número');
    else drawnText(R, P, Cd.number.lines[0], Cd.number, 0, 0, win(lt, 0, 0.45), 'número');
    ctx.restore();
    const fin = { x: cx - Cd.pill.w / 2, y: Cd.pillY, w: Cd.pill.w, h: Cd.pill.h, r: Cd.pill.h / 2 };
    const grow = fromChat ? 1 : spring(win(lt, 0.15, 0.4));
    const r = fromChat ? K.rectLerp(P.chat.bubble, fin, e) : { ...fin, w: fin.w * grow, x: cx - (fin.w * grow) / 2 };
    const press = lt >= 1.5 && lt < 2 ? 1 - 0.035 * (1 - expoOut(win(lt, 1.5, 0.25))) : 1;
    if (r.w > 4) {
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(press, press); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      K.rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.fillStyle = P.C.cta; ctx.fill();
      ctx.save(); K.rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.clip();
      const mo = expoIn(win(lt, 0, 0.2));
      if (fromChat && mo < 1) P.chat.msg.draw(ctx, r.x + 40, r.y + 34 + mo * r.h, P.C.ctaInk, 'left', 0);
      if (lt >= 0.2) {
        const ty = r.y + (r.h - Cd.cta.vh) / 2 - (1 - expoOut(win(lt, 0.2, 0.3))) * r.h;
        E.drawIcon(ctx, 'message-circle', r.x + 78, ty + Cd.cta.vh / 2, 66, P.C.ctaInk, 2.6);
        K.text(R, Cd.cta, r.x + 142, ty, P.C.ctaInk, 'left', 0, 'botão');
      }
      ctx.restore();
      ctx.restore();
    }
    // the QR is plotted column by column, like a drawing machine
    if (Cd.qr && lt >= 0.5) {
      const x = cx - Cd.qr / 2, n = E.qrModules(P.content.contact.link).n;
      if (lt >= 1.0) ctx.drawImage(K.qrSprite(P.content.contact.link, Cd.qr, { dark: P.C.qrInk, light: '#FFFFFF', radius: 18 }), x, Cd.qrY, Cd.qr, Cd.qr);
      else {
        const k2 = expoInOut(win(lt, 0.5, 0.45));
        K.rrect(ctx, x, Cd.qrY, Cd.qr, Cd.qr, 18); ctx.fillStyle = '#FFFFFF'; ctx.fill();
        K.qr(ctx, P.content.contact.link, x, Cd.qrY, Cd.qr, { tile: false, dark: P.C.qrInk, reveal: (row, col) => (col < k2 * n ? 1 : 0) });
        ctx.fillStyle = P.C.accent; ctx.fillRect(x + Cd.qr * 0.075 + Cd.qr * 0.85 * k2 - 3, Cd.qrY - 20, 6, Cd.qr + 40);
      }
    }
    if (Cd.qr && lt >= 1.0) {
      const hk = expoOut(win(lt, 1.0, 0.3));
      ctx.save(); ctx.beginPath(); ctx.rect(cx - 500, Cd.hintY - 40, 1000, Cd.hint.vh + 90); ctx.clip();
      K.text(R, Cd.hint, cx - Cd.hint.w / 2, Cd.hintY + (1 - hk) * 80, P.C.accent, 'left', 0, 'aponta');
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- the whole sheet
  function world(R) {
    const { ctx, P, t } = R;
    const Kc = cam(P, t);
    R.camZ = Kc.z;
    const speed = (f) => K.speed(f, t);
    const vx = speed((x) => { const c = cam(P, x); return c.x * c.z; }), vy = speed((x) => { const c = cam(P, x); return c.y * c.z; });
    const moving = R.moving;
    R.moving = moving || Math.hypot(vx, vy) > 300;
    ctx.save();
    ctx.translate(P.Z.W / 2, P.Z.cy); ctx.scale(Kc.z, Kc.z); ctx.translate(-Kc.x, -Kc.y);
    grid(R, P, Kc);
    // the dimension line the camera follows (drawn just ahead; gone when the loop closes)
    const O = P.act('O');
    const gone = expoInOut(win(t, O.start + 0.15, 0.75));
    const halfOf = (s) => {
      const type = typeOf(s);
      if (type === 'title') return [P.tb.w / 2 + 40, P.tb.h / 2 + 40];
      if (type === 'plan') return [P.plan.w / 2 + 60, P.plan.h / 2 + 60];
      if (type === 'legend') return [490, P.legendPages[pageOf(s)].tableH / 2 + 40];
      if (type === 'phone') return [P.phone.w / 2 + 60, P.phone.h / 2 + 120];
      if (type === 'dim') return [480, P.dimPages[pageOf(s)].H / 2 + 60];
      return [500, (P.notes[type] ? P.notes[type].vh : 100) / 2 + 140];
    };
    const edge = (s, toward) => {
      const [x, y] = P.st[s], half = halfOf(s);
      return [x + Math.sign(toward[0]) * half[0], y + Math.sign(toward[1]) * half[1]];
    };
    for (let i = 1; i < P.order.length; i++) {
      const a = P.st[P.order[i - 1]], b = P.st[P.order[i]];
      const dir = [b[0] - a[0], b[1] - a[1]];
      cota(R, P, edge(P.order[i - 1], dir), edge(P.order[i], [-dir[0], -dir[1]]), expoInOut(win(t, P.arrive[P.order[i]] - 0.45, 0.6)), 4, gone);
    }
    const last = P.st[P.order[P.order.length - 1]];
    cota(R, P, [last[0] - P.Z.w / 2, last[1] - P.Z.cH / 2], [P.tb.w / 2 + 60, P.tb.h / 2 + 60], expoInOut(win(t, O.start - 0.1, 0.5)), 3, gone);
    const near = (s, r) => { const [x, y] = P.st[s]; return Math.abs(x - Kc.x) < r + P.Z.W / 2 / Kc.z && Math.abs(y - Kc.y) < r + P.Z.H / Kc.z; };
    for (const s of P.order) {
      const type = typeOf(s);
      if (type === 'title') { if (near(s, 700)) titleBlock(R, P, t); continue; }
      if (t < P.arrive[s] - 0.6 || !near(s, type === 'plan' || type === 'phone' ? 900 : 700)) continue;
      if (type === 'plan') plan(R, P, t, s);
      else if (type === 'dim') dimension(R, P, t, s);
      else if (type === 'legend') legend(R, P, t, s);
      else if (type === 'phone') phone(R, P, t);
      else note(R, P, t, s);
    }
    ctx.restore();
    R.moving = moving;
    if (Math.hypot(vx, vy) > 400) K.smear(R, -vx, -vy);
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K'), O = P.act('O');
    const riserFrom = Math.max(0, Ka.start - 2);
    const roots = [65.41, 49, 55, 43.65];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 110, f1: 40, drop: 0.16, dur: 0.38, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 10000, dur: 0.03, gain: 0.05, pan: -0.2 });
      if (b % 2 === 0 && (t < riserFrom || t >= Ka.start)) ev.push({ t, kind: 'tone', hz: roots[Math.floor(b / 4) % 4], wave: 'sawtooth', dur: 0.95, gain: 0.14, lp: 420, attack: 0.05 });
    }
    for (const t of P.timeline.cuts) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 1200, dur: 0.3, gain: 0.3 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 200, f1: 5000, gain: 0.24 });
    // a whoosh on every whip of the camera
    const whips = P.keys.filter((k) => !k.drift && k.d <= WHIP + 1e-6).map((k) => k.t).concat([O.start + 0.05]);
    for (const t0 of whips) {
      const long = t0 === O.start + 0.05;
      ev.push({ t: Math.max(0, t0), kind: 'riser', f0: 300, f1: long ? 5000 : 3000, dur: long ? 0.45 : 0.18, gain: 0.3 });
      ev.push({ t: t0 + (long ? 0.45 : 0.18), kind: 'noise', filter: 'bandpass', f: 1800, q: 0.8, dur: long ? 0.45 : 0.22, gain: 0.18 });
    }
    for (const t0 of [0.04, 0.54, 1.04]) ev.push({ t: t0, kind: 'noise', filter: 'bandpass', f: 3200, q: 3, dur: 0.18, gain: 0.07, attack: 0.03 });
    // a tick per vacancy as the ruler fills
    P.dimPages.forEach((pg, p) => pg.blocks.forEach((b, j) => {
      if (b.vac) for (let i = 0; i < b.vacN; i++) ev.push({ t: P.arrive[`dim${p}`] + 0.05 + j * 0.9 + (i / b.vacN) * 0.42, kind: 'tone', hz: 1200, wave: 'sine', dur: 0.04, gain: 0.08 });
    }));
    const C = P.act('C'); if (C) { for (let t = 0.6; t < 1.32; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 }); ev.push({ t: C.start + 1.37, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 }); }
    if (P.card.qr) for (let k = 0; k < 9; k++) ev.push({ t: Ka.start + 0.5 + k * 0.05, kind: 'noise', filter: 'bandpass', f: 2600, q: 4, dur: 0.03, gain: 0.08 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'planta', name: 'Planta', concept: 'Uma só linha de cota leva-te do título até ao WhatsApp, sem cortes.',
    font: { head: { family: 'DM Sans', weight: 700 }, bold: { family: 'DM Sans', weight: 500 } },
    palettes: { dark: { bg: '#0F3B8C', ink: '#FFFFFF', main: '#0F3B8C', accent: '#FFD23F' } },
    // 10–30 s: every page is a station of its own on the sheet
    bgModes: ['dark'], photos: 0, travel: 'whip', continuous: true, pages: true,
    // the sheet is the main colour; lines and words white; the highlight readable on it
    colors(c) {
      c.bg = U.isDark(c.main) ? c.main : U.mix(c.main, '#000000', 0.55);
      c.ink = U.ensureContrast('#FFFFFF', c.bg, 4.5);
      c.accent = U.ensureContrast(c.accent, c.bg, 4.5);
      c.grid = 'rgba(255,255,255,0.10)'; c.gridMajor = 'rgba(255,255,255,0.20)';
      c.fill = U.mix(c.bg, '#FFFFFF', 0.12); c.wall = U.mix(c.bg, '#FFFFFF', 0.22);
      c.qrInk = U.isDark(c.bg) ? c.bg : '#111111';
      return c;
    },
    prepare,
    acts: { H: world, I: world, M: world, V: world, D: world, L: world, F: world, C: world, K: world, O: world },
    sound,
  });
})();
