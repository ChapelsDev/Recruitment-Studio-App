// Video recipe «Píxel»: 8-bit. Every pixel is a brick; at the end the pixels
// of the sent message become the QR that opens the conversation. Camera
// language: a fixed console screen; a scene changes by scrolling the whole
// "room" in pixel steps. Everything sits on a 6 px grid.
// Acts: H the headline sweeps in line by line, M benefits as pixel icons, V the
// headline in voxels, D the highlights (a rolling score, one helmet per
// vacancy), L a menu with the positions, C a pixel phone, K the card, O the
// QR's pixels fly back into the first line. 10–30 s: M, D and L show their
// content a page at a time; a new page scrolls the room in.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { lerp, win, expoOut, expoIn, expoInOut } = K;
  const PX = 6;
  const DARK = '#0A0A0F';
  const snap = (v) => Math.round(v);

  // ---------------------------------------------------------------- pixel sprites
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  function threshold(g, w, h, cut) {
    const d = g.getImageData(0, 0, w, h);
    for (let i = 3; i < d.data.length; i += 4) {
      const on = d.data[i] > cut;
      d.data[i - 3] = d.data[i - 2] = d.data[i - 1] = 255;
      d.data[i] = on ? 255 : 0;
    }
    g.putImageData(d, 0, 0);
    const cells = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d.data[(y * w + x) * 4 + 3]) cells.push([x, y]);
    return cells;
  }
  // Text drawn at cell size and thresholded: crisp pixel letters in any
  // language, with room above the capitals (Õ, É) and below (Ç).
  function ptext(P, text, o) {
    const L = K.fit(null, text, { font: o.font || P.F.bold, upper: !!o.upper, maxSize: o.size, minSize: o.min || Math.max(8, Math.round(o.size * 0.6)), maxW: o.maxW, maxLines: o.maxLines || 1, lh: o.lh || 1.18, locale: P.locale, track: o.track || 0 });
    P.minTextSize = Math.min(P.minTextSize, L.size * PX);
    const pad = Math.ceil(L.size * 0.28);
    const w = Math.ceil(L.w) + 2, h = Math.ceil(L.h) + pad + 3;
    const cv = canvas(w, h);
    const g = cv.getContext('2d');
    L.draw(g, 1, pad, '#fff', o.align || 'center', L.w);
    const cells = threshold(g, w, h, o.cut || 120);
    const edge = (i) => (i === 0 ? 0 : i >= L.lines.length ? h : Math.round(pad + i * L.lhPx - L.size * 0.26));
    const lines = L.lines.map((ln, i) => ({ x0: 1 + (o.align === 'left' ? 0 : (L.w - L.widths[i]) / 2), w: L.widths[i] + 1, y0: edge(i), y1: edge(i + 1), n: [...ln].length }));
    return { L, cv, w, h, cells, lines, pad, text: L.lines.join(' '), tints: new Map() };
  }
  function picon(name, size, stroke = 2.6) {
    const cv = canvas(size, size);
    const g = cv.getContext('2d');
    g.scale(size / 24, size / 24);
    g.lineWidth = stroke; g.lineCap = 'square'; g.lineJoin = 'miter'; g.strokeStyle = '#fff';
    g.stroke(E.iconPath(name));
    g.setTransform(1, 0, 0, 1, 0, 0);
    return { cv, w: size, h: size, cells: threshold(g, size, size, 90), tints: new Map() };
  }
  // a coloured copy already enlarged to screen pixels (drawn 1:1 afterwards)
  function tint(s, color) {
    let c = s.tints.get(color);
    if (!c) {
      c = canvas(s.w * PX, s.h * PX);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(s.cv, 0, 0, s.w * PX, s.h * PX);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      s.tints.set(color, c);
    }
    return c;
  }
  // sprite at cell (cx, cy); `upto` reveals it line by line (type-on, with a caret)
  function blit(R, s, cx, cy, color, tag, upto = 1) {
    const { ctx } = R;
    ctx.imageSmoothingEnabled = false;
    const img = tint(s, color);
    if (upto >= 1) ctx.drawImage(img, snap(cx) * PX, snap(cy) * PX);
    else if (s.lines) {
      const total = s.lines.reduce((a, l) => a + l.n, 0);
      let left = upto * total;
      for (const l of s.lines) {
        if (left <= 0) break;
        const k = Math.min(1, left / l.n);
        left -= l.n;
        const sw = Math.ceil(l.x0 + l.w * k);
        ctx.drawImage(img, 0, l.y0 * PX, sw * PX, (l.y1 - l.y0) * PX, snap(cx) * PX, (snap(cy) + l.y0) * PX, sw * PX, (l.y1 - l.y0) * PX);
        if (k < 1) { ctx.fillStyle = color; ctx.fillRect((snap(cx) + sw + 1) * PX, (snap(cy) + l.y0 + s.pad) * PX, PX * 2, Math.max(1, l.y1 - l.y0 - s.pad - 2) * PX); }
      }
    }
    if (tag && upto >= 1 && s.L) R.rec(snap(cx) * PX, (snap(cy) + s.pad) * PX, s.w * PX, (s.h - s.pad - 2) * PX, tag, s.text);
  }
  const cell = (ctx, x, y, color) => { ctx.fillStyle = color; ctx.fillRect(snap(x) * PX, snap(y) * PX, PX, PX); };
  // pixels travelling from one set of cells to another (across, then down)
  function morph(R, from, to, lt, t0, dur, color, stagger = 0.25) {
    const { ctx } = R;
    if (!from.length || !to.length) return;
    const n = Math.max(from.length, to.length);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = from[i % from.length], b = to[i % to.length];
      const k = expoInOut(win(lt, t0 + (i / n) * dur * stagger, dur * (1 - stagger)));
      const x = k < 0.5 ? lerp(a[0], b[0], k * 2) : b[0];
      const y = k < 0.5 ? a[1] : lerp(a[1], b[1], (k - 0.5) * 2);
      ctx.fillRect(snap(x) * PX, snap(y) * PX, PX, PX);
    }
  }
  const at = (s, cx, cy) => s.cells.map(([x, y]) => [x + cx, y + cy]);
  function shuffle(list, seed = 7) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { seed = (seed * 16807) % 2147483647; const j = seed % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function frameBox(ctx, x, y, w, h, color, th = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(x * PX, y * PX, w * PX, PX * th); ctx.fillRect(x * PX, (y + h - th) * PX, w * PX, PX * th);
    ctx.fillRect(x * PX, y * PX, PX * th, h * PX); ctx.fillRect((x + w - th) * PX, y * PX, PX * th, h * PX);
  }
  // the largest size (in cells) whose layout fits `room` cells
  function sized(make, from, to, room) {
    let s = make(from);
    for (let size = from - 1; size >= to && s.fit > room; size--) s = make(size);
    return s;
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const GW = Math.round(Z.W / PX), GH = Math.round(Z.H / PX);
    const top = Math.ceil(Z.top / PX), bottom = Math.floor(Z.bottom / PX), zh = bottom - top, cy = Math.round(Z.cy / PX);
    P.G = { GW, GH, top, bottom, zh, cy };
    // H: one sprite per line of the headline, the kicker, a loading bar
    const headAt = (size) => {
      const L = K.fit(null, c.headline || c.brandName || ' ', { font: F.head, upper: P.upper, maxSize: size, minSize: 8, maxW: GW - 20, maxLines: 4, lh: 1.15, locale: P.locale });
      return { L, fit: (Math.round(L.lhPx) + 2) * L.lines.length + 34 };
    };
    const hd = sized(headAt, 30, 10, zh - 6);
    P.head = hd.L.lines.map((ln) => ptext(P, ln, { font: F.head, size: hd.L.size, min: hd.L.size, maxW: 400 }));
    P.kicker = c.kicker ? ptext(P, c.kicker, { size: 11, min: 8, maxW: GW - 20, upper: true, track: 0.06 }) : null;
    const lineH = Math.round(hd.L.lhPx) + 2;
    const blockH = (P.kicker ? P.kicker.h + 6 : 0) + lineH * P.head.length + 14;
    let y = Math.round(cy - blockH / 2);
    P.kickerY = y; if (P.kicker) y += P.kicker.h + 6;
    P.headY = P.head.map((s, i) => y + i * lineH);
    P.headX = P.head.map((s) => Math.round((GW - s.w) / 2));
    P.firstY = Math.round(cy - P.head[0].h / 2);
    P.bar = { x: Math.round(GW / 6), y: y + lineH * P.head.length + 4, w: Math.round((GW * 2) / 3), h: 6 };
    P.barCells = [];
    for (let yy = 1; yy < P.bar.h - 1; yy++) for (let xx = 1; xx < P.bar.w - 1; xx++) P.barCells.push([P.bar.x + xx, P.bar.y + yy]);
    P.firstCells = at(P.head[0], P.headX[0], P.firstY);

    // M: the benefits, a page at a time: one or two as a big pixel icon over
    // its words; three as an inventory (icon on the left, words on the right)
    const sF = Math.min(1, zh / 215);
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    const colAt = (items) => (size) => {
      const list = items.map((i) => ({ icon: picon(c.icons[i] || 'check', Math.round(44 * sF), 2.3), tx: ptext(P, c.benefits[i], { size, min: 8, maxW: GW - 20, maxLines: 3 }) }));
      return { list, fit: list.reduce((a, b) => a + b.icon.h + 6 + b.tx.h + 20, 0) - 20 };
    };
    const inner = (b) => Math.max(b.icon.h, b.tx.h - b.tx.pad);
    const rowAt = (items) => (size) => {
      const isz = Math.max(16, Math.round(size * 1.9));
      const list = items.map((i) => ({ icon: picon(c.icons[i] || 'check', isz, 2.3), tx: ptext(P, c.benefits[i], { size, min: 8, maxW: GW - 28 - isz, maxLines: 3, align: 'left' }) }));
      return { list, rows: true, fit: list.reduce((a, b) => a + inner(b) + 14, 0) - 14 };
    };
    P.benPages = (Ma ? Ma.pages : []).map((items) => {
      const bn = items.length <= 2 ? sized(colAt(items), Math.round(19 * Math.max(0.75, sF)), 8, zh - 4) : sized(rowAt(items), Math.round(17 * Math.max(0.75, sF)), 8, zh - 4);
      let by = Math.round(cy - bn.fit / 2);
      if (bn.rows) {
        const x0 = Math.round((GW - (bn.list[0].icon.w + 8 + Math.max(...bn.list.map((b) => b.tx.w)))) / 2);
        for (const b of bn.list) {
          const h = inner(b);
          b.ix = x0; b.iy = by + Math.round((h - b.icon.h) / 2);
          b.tx0 = x0 + b.icon.w + 8; b.ty = by + Math.round((h - (b.tx.h - b.tx.pad)) / 2) - b.tx.pad;
          by += h + 14;
        }
      } else for (const b of bn.list) { b.iy = by; b.ix = Math.round((GW - b.icon.w) / 2); b.ty = by + b.icon.h + 6; b.tx0 = Math.round((GW - b.tx.w) / 2); by = b.ty + b.tx.h + 20; }
      return bn.list;
    });
    P.bensLast = P.benPages[P.benPages.length - 1] || [];

    // V: the whole headline as one sprite, extruded into voxels
    P.headAll = ptext(P, c.headline || c.brandName || ' ', { font: F.head, size: Math.max(hd.L.size, Math.round(30 * Math.max(0.7, sF))), min: 10, maxW: GW - 24, maxLines: 4, upper: P.upper, lh: 1.12 });
    P.headAllX = Math.round((GW - P.headAll.w) / 2);
    P.headAllY = Math.round(cy - P.headAll.h / 2);

    // D: the highlights, a page at a time: the salary with a coin, the
    // vacancies with one helmet each, the badge with a medal, his own with a
    // star; a plain number rolls up, anything else is typed as written
    const hl = c.highlights;
    P.helmet = picon('hard-hat', 12, 2.6);
    const hlAt = (items) => (size) => {
      const blocks = items.map((i) => {
        const h = hl[i], vac = h.role === 'vacancies';
        const b = { hl: h, vac, count: h.value && h.count != null ? h.count : null };
        b.icon = vac ? null : picon(h.role === 'salary' ? 'coins' : h.role === 'badge' ? 'award' : 'star', Math.max(12, Math.round(size * 0.65)), 2.6);
        if (vac) {
          b.vacN = b.count != null ? Math.min(24, b.count) : 0;
          b.per = Math.min(Math.max(b.vacN, 1), 12);
          b.helmH = b.vacN ? Math.ceil(b.vacN / b.per) * 14 + 6 : 0;
          b.value = ptext(P, [h.value, h.label].filter(Boolean).join(' '), { font: F.head, size: Math.max(10, Math.round(size * 0.6)), min: 8, maxW: GW - 20, maxLines: 2 });
          b.H = b.helmH + b.value.h;
        } else {
          b.value = ptext(P, h.value || h.label, { font: F.head, size, min: Math.max(8, Math.round(size * 0.5)), maxW: GW - 24, maxLines: 2 });
          b.label = h.value && h.label ? ptext(P, h.label, { size: Math.max(8, Math.round(size * 0.34)), min: 8, maxW: GW - 20, maxLines: 2 }) : null;
          b.H = b.icon.h + 6 + b.value.h + (b.label ? 2 + b.label.h : 0);
        }
        return b;
      });
      return { blocks, fit: blocks.reduce((a, b) => a + b.H, 0) + 16 * Math.max(0, blocks.length - 1) };
    };
    P.dataPages = (Da ? Da.pages : []).map((items) => {
      const pg = sized(hlAt(items), Math.round(40 * Math.max(0.75, sF)), 12, zh - 6);
      let y = Math.round(cy - pg.fit / 2);
      for (const b of pg.blocks) { b.y = y; y += b.H + 16; }
      return pg.blocks;
    });

    // L: the positions in a menu box, a page at a time
    const menuAt = (items) => (size) => {
      const title = c.positionsTitle ? ptext(P, c.positionsTitle, { size: Math.min(14, size), min: 8, maxW: GW - 40 }) : null;
      const list = items.map((i) => ptext(P, c.positions[i], { size, min: 8, maxW: GW - 42, maxLines: 2, align: 'left' }));
      let my = 0;
      const rows = list.map((s) => { const r = my; my += s.h + 3; return r; });
      return { title, items: list, rows, fit: (title ? title.h + 8 : 0) + my + 12 };
    };
    P.menuPages = (La ? La.pages : []).map((items) => {
      const mn = sized(menuAt(items), 15, 8, zh - 6);
      const box = { x: 10, w: GW - 20, h: mn.fit };
      box.y = Math.round(cy - box.h / 2);
      return { title: mn.title, items: mn.items, rows: mn.rows, box };
    });
    // I, F: his intro and closing lines in pixel letters
    const lineOf = (text) => (text ? sized((size) => { const s = ptext(P, text, { size, min: size, maxW: GW - 20, maxLines: 5, lh: 1.2 }); return { s, fit: s.h }; }, 18, 8, zh - 10).s : null);
    P.introS = P.act('I') ? lineOf(c.intro) : null;
    P.closingS = P.act('F') ? lineOf(c.closing) : null;

    // the phone grows from the last menu box (or from the middle)
    P.box = P.menuPages.length ? P.menuPages[P.menuPages.length - 1].box : { x: 10, w: GW - 20, h: 24, y: cy - 12 };

    // C: a pixel phone with the conversation
    const phH = Math.min(206, zh - 4);
    P.phone = { x: 14, y: Math.round(cy - phH / 2), w: GW - 28, h: phH };
    P.chatTitle = c.brandName ? ptext(P, c.brandName, { size: 11, min: 8, maxW: P.phone.w - 48, align: 'left' }) : null;
    P.chatNumber = c.contact ? ptext(P, c.contact.display, { size: 10, min: 8, maxW: P.phone.w - 48, align: 'left' }) : null;
    P.avatar = picon('hard-hat', 16, 2.4);
    const msgAt = (size) => { const m = ptext(P, c.message || ' ', { size, min: size, maxW: P.phone.w - 48, maxLines: 7, align: 'left', lh: 1.25 }); return { m, fit: 30 + 2 * (m.h + 12) + 12 }; };
    P.msg = sized(msgAt, 13, 8, phH).m;
    P.fieldH = P.msg.h + 8;
    P.field = { x: P.phone.x + 4, y: P.phone.y + P.phone.h - P.fieldH - 4, w: P.phone.w - 30, h: P.fieldH };
    P.bubble = { x: P.phone.x + P.phone.w - P.msg.w - 12, y: P.field.y - P.msg.h - 18, w: P.msg.w + 8, h: P.msg.h + 10 };

    // K: the card (number, button, QR, hint) or, without a number, the ad's contacts
    P.card = {};
    if (c.showLogo && c.brandName) P.card.brand = ptext(P, c.brandName, { size: 11, min: 8, maxW: GW - 20, upper: true, track: 0.06 });
    if (c.contact) {
      P.number = ptext(P, c.contact.display, { font: F.head, size: 24, min: 9, maxW: GW - 16 });
      P.cta = ptext(P, c.contact.cta, { size: 13, min: 8, maxW: GW - 60, upper: true });
      P.hint = ptext(P, c.contact.hint, { size: 11, min: 8, maxW: GW - 20 });
      const m = E.qrModules(c.contact.link);
      const rest = (P.card.brand ? P.card.brand.h + 4 : 0) + P.number.h + 6 + P.cta.h + 18 + 5 + P.hint.h;
      P.mod = c.qr ? (m.n * 2 + 8 <= zh - rest - 4 ? 2 : 1) : 0;
      P.qrSize = c.qr ? m.n * P.mod + 8 : 0;
      P.qrX = Math.round((GW - P.qrSize) / 2);
      const total = rest + (c.qr ? P.qrSize + 8 : 0);
      let yy = Math.round(cy - total / 2);
      if (P.card.brand) { P.brandY = yy; yy += P.card.brand.h + 4; }
      P.numberY = yy; yy += P.number.h + 6;
      P.btn = { w: P.cta.w + 26, h: P.cta.h + 10 }; P.btn.x = Math.round((GW - P.btn.w) / 2); P.btn.y = yy; yy += P.btn.h + 8;
      P.qrY = yy; if (c.qr) yy += P.qrSize + 5;
      P.hintY = yy;
      P.qrCells = [];
      if (c.qr) for (let r = 0; r < m.n; r++) for (let q = 0; q < m.n; q++) if (m.grid[r * m.n + q]) {
        for (let a = 0; a < P.mod; a++) for (let b = 0; b < P.mod; b++) P.qrCells.push([P.qrX + 4 + q * P.mod + b, P.qrY + 4 + r * P.mod + a]);
      }
      P.qrFrom = shuffle(at(P.msg, P.bubble.x + 4, P.bubble.y + 5));
      if (c.qr) {
        P.qrImg = canvas(P.qrSize * PX, P.qrSize * PX);
        const qg = P.qrImg.getContext('2d');
        qg.fillStyle = '#FFFFFF'; qg.fillRect(0, 0, P.qrSize * PX, P.qrSize * PX);
        qg.fillStyle = DARK;
        for (const [x, yq] of P.qrCells) qg.fillRect((x - P.qrX) * PX, (yq - P.qrY) * PX, PX, PX);
      }
    } else {
      const lines = P.content.contacts.slice(0, 3); // the ad's contacts, unless hidden
      P.card.lines = lines.map((s) => ptext(P, s, { size: 13, min: 8, maxW: GW - 20, maxLines: 2 }));
      if (!P.card.lines.length && !P.card.brand) P.card.lines = [ptext(P, c.headline || ' ', { font: F.head, size: 20, min: 9, maxW: GW - 20, maxLines: 4, upper: P.upper })];
      const total = (P.card.brand ? P.card.brand.h + 8 : 0) + P.card.lines.reduce((a, s) => a + s.h + 6, 0);
      let yy = Math.round(cy - total / 2);
      if (P.card.brand) { P.brandY = yy; yy += P.card.brand.h + 8; }
      P.card.linesY = P.card.lines.map((s) => { const r = yy; yy += s.h + 6; return r; });
    }
    // the cells the loop flies from: the QR, else the card's own text
    P.endCells = P.qrCells && P.qrCells.length ? P.qrCells : (P.card.lines || []).flatMap((s, i) => at(s, Math.round((GW - s.w) / 2), P.card.linesY[i])).concat(P.card.brand ? at(P.card.brand, Math.round((GW - P.card.brand.w) / 2), P.brandY) : []);
  }

  // ---------------------------------------------------------------- acts
  const scrollUp = (P, lt) => Math.round(expoInOut(win(lt, 0, 0.32)) * P.G.GH);
  function hook(R, P, lt, oy = 0) {
    P.head.forEach((s, i) => {
      if (i === 0) { blit(R, s, P.headX[0], snap(lerp(P.firstY, P.headY[0], expoOut(win(lt, 0.02, 0.3)))) + oy, P.C.main, 'título'); return; }
      const t0 = Math.min(i - 1, 2) * 0.5 + 0.04;
      if (lt >= t0) blit(R, s, P.headX[i], P.headY[i] + oy, P.C.main, 'título', expoOut(win(lt, t0, 0.3)));
    });
    if (P.kicker) {
      const t0 = Math.min(P.head.length - 1, 2) * 0.5 + 0.04;
      if (lt >= t0) blit(R, P.kicker, Math.round((P.G.GW - P.kicker.w) / 2), P.kickerY + oy, P.C.ink, 'chamada', win(lt, t0, 0.35));
    }
    if (lt >= 1.5) {
      const { ctx } = R, b = P.bar;
      frameBox(ctx, b.x, b.y + oy, b.w, b.h, P.C.ink, 1);
      const fill = Math.floor(expoOut(win(lt, 1.5, 0.4)) * 12) / 12;
      ctx.fillStyle = P.C.accent;
      ctx.fillRect((b.x + 1) * PX, (b.y + 1 + oy) * PX, Math.round((b.w - 2) * fill) * PX, (b.h - 2) * PX);
    }
  }
  // M, one page: the first icon (on the first page, from the loading bar's
  // pixels), each next icon from the pixels of the one before, then its words
  function benefits(R, P, idx, lt, bespoke) {
    const GH = P.G.GH;
    const list = P.benPages[idx] || [];
    const oy = bespoke ? GH - scrollUp(P, lt) : 0;
    if (bespoke && lt < 0.4) hook(R, P, 1.99, oy - GH);
    const gap = list.length >= 3 ? 0.5 : 1.0, base = idx === 0 ? 0 : 0.3;
    list.forEach((b, j) => {
      const t0 = base + j * gap;
      const hop = (x) => (lt >= x && Math.floor((lt - x) / 0.125) % 2 ? 2 : 0);
      if (j === 0 && bespoke && lt < 0.5) morph(R, P.barCells.map(([x, y]) => [x, y + oy - GH]), at(b.icon, b.ix, b.iy + oy), lt, 0.05, 0.4, P.C.main);
      else if (j > 0 && lt >= t0 && lt < t0 + 0.45) { const a = list[j - 1]; morph(R, at(a.icon, a.ix, a.iy + oy), at(b.icon, b.ix, b.iy + oy), lt, t0, 0.4, P.C.main); }
      else if (lt >= t0) blit(R, b.icon, b.ix, b.iy + oy - hop(t0 + 0.5), P.C.main);
      const tt = t0 + (j === 0 && bespoke ? 0.3 : 0.2);
      if (lt >= tt) blit(R, b.tx, b.tx0, b.ty + oy, P.C.ink, 'vantagem', expoOut(win(lt, tt, 0.35)));
    });
  }
  function voxels(R, P, s, cx, cy, depth, ang) {
    const front = tint(s, P.C.main), side = tint(s, P.C.accent);
    const { ctx } = R;
    ctx.imageSmoothingEnabled = false;
    for (let k = depth; k >= 1; k--) ctx.drawImage(side, (cx + Math.round(Math.cos(ang) * k)) * PX, (cy + Math.round(Math.sin(ang) * k)) * PX);
    ctx.drawImage(front, cx * PX, cy * PX);
    R.rec(cx * PX, (cy + s.pad) * PX, s.w * PX, (s.h - s.pad - 2) * PX, 'título 3D', s.text);
  }
  // V: the room scrolls back to the title, which gains volume, turns, then sinks
  function volume(R, P, lt, bespoke) {
    const GH = P.G.GH;
    const oy = bespoke ? -GH + scrollUp(P, lt) : 0;
    if (bespoke && lt < 0.4) { const off = oy + GH; for (const b of P.bensLast) { blit(R, b.icon, b.ix, b.iy + off, P.C.main); blit(R, b.tx, b.tx0, b.ty + off, P.C.ink); } }
    const depth = Math.floor(expoOut(win(lt, 0.3, 0.3)) * 6) + Math.floor(expoOut(win(lt, 1.0, 0.3)) * 4);
    const ang = lerp(lerp(Math.PI * 0.25, Math.PI * 0.75, expoInOut(win(lt, 0.5, 0.35))), Math.PI * 0.25, expoInOut(win(lt, 1.0, 0.35)));
    const ground = P.headAllY + P.headAll.h + 1 + oy;
    const sink = Math.floor(expoIn(win(lt, 1.5, 0.3)) * (P.headAll.h + 14));
    const { ctx } = R;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, P.Z.W, ground * PX); ctx.clip();
    voxels(R, P, P.headAll, P.headAllX, P.headAllY + oy + sink, depth, ang);
    ctx.restore();
    ctx.fillStyle = P.C.accent;
    ctx.fillRect(0, ground * PX, P.Z.W, PX * 2);
  }
  const scoreCache = new Map();
  function scoreAt(P, s, size) {
    const key = `${s}|${size}`;
    if (!scoreCache.has(key)) { if (scoreCache.size > 60) scoreCache.clear(); scoreCache.set(key, ptext({ ...P, minTextSize: Infinity }, s, { font: P.F.head, size, min: size, maxW: 400 })); }
    return scoreCache.get(key);
  }
  // D, one page: each highlight on its beat — its icon, the value rolling up
  // in 24 steps (each value is a pixel sprite, so they stay few) or typed as
  // written, then its label; the vacancies as one helmet each, then the words
  function data(R, P, idx, lt, bespoke) {
    const GH = P.G.GH, GW = P.G.GW;
    const oy = bespoke ? GH - scrollUp(P, lt) : 0;
    if (bespoke && lt < 0.4) { const { ctx } = R; ctx.fillStyle = P.C.accent; ctx.fillRect(0, (P.headAllY + P.headAll.h + 1 + oy - GH) * PX, P.Z.W, PX * 2); }
    const blocks = P.dataPages[idx] || [];
    const base = idx === 0 ? 0.1 : 0.35;
    blocks.forEach((b, j) => {
      const t0 = base + j * 0.8;
      if (lt < t0) return;
      let y = b.y + oy;
      if (b.vac) {
        const n = b.vacN, hw = P.helmet.w + 1, x0 = Math.round((GW - b.per * hw) / 2);
        for (let i = 0; i < n; i++) { if (lt < t0 + (i / n) * 0.4) break; blit(R, P.helmet, x0 + (i % b.per) * hw, y + Math.floor(i / b.per) * (P.helmet.h + 2), P.C.cta); }
        y += b.helmH;
        const tt = t0 + (n ? 0.45 : 0);
        if (lt >= tt) blit(R, b.value, Math.round((GW - b.value.w) / 2), y, P.C.ink, 'vagas', win(lt, tt, 0.25));
        return;
      }
      blit(R, b.icon, Math.round((GW - b.icon.w) / 2), y - (Math.floor((lt - t0) / 0.125) % 2 ? 2 : 0), P.C.main);
      y += b.icon.h + 6;
      const tag = b.hl.role === 'salary' ? 'salário' : 'destaque';
      if (b.count != null) {
        const n = Math.round(b.count * (Math.round(expoOut(win(lt, t0, 0.7)) * 24) / 24));
        if (n !== b.count) { const s = scoreAt(P, `${b.hl.prefix}${n}${b.hl.suffix}`, b.value.L.size); blit(R, s, Math.round((GW - s.w) / 2), y, P.C.main); }
        else blit(R, b.value, Math.round((GW - b.value.w) / 2), y, P.C.main, tag);
      } else blit(R, b.value, Math.round((GW - b.value.w) / 2), y, P.C.main, tag, expoOut(win(lt, t0, 0.35)));
      y += b.value.h + 2;
      if (b.label && lt >= t0 + 0.4) blit(R, b.label, Math.round((GW - b.label.w) / 2), y, P.C.ink, b.hl.role === 'salary' ? 'período' : 'rótulo', win(lt, t0 + 0.4, 0.25));
    });
  }
  // L, one page: the menu box opens (on the first page); the cursor goes down
  // one row per beat
  function menu(R, P, idx, lt, bespoke) {
    const { ctx } = R;
    const GH = P.G.GH;
    const page = P.menuPages[idx];
    if (!page) return;
    const oy = bespoke ? GH - scrollUp(P, lt) : 0;
    if (bespoke && lt < 0.4 && P.dataPages.length) { ctx.save(); ctx.translate(0, (oy - GH) * PX); data(R, P, P.dataPages.length - 1, 1.99, false); ctx.restore(); }
    const B = page.box;
    const open = idx > 0 ? B.h : Math.max(4, Math.floor(expoOut(win(lt, 0.05, 0.3)) * B.h));
    const by = B.y + oy + Math.round((B.h - open) / 2);
    ctx.fillStyle = P.C.bg; ctx.fillRect(B.x * PX, by * PX, B.w * PX, open * PX);
    frameBox(ctx, B.x, by, B.w, open, P.C.ink);
    if (open < B.h) return;
    let y = B.y + oy + 5;
    if (page.title) { blit(R, page.title, B.x + 8, y, P.C.accent, 'título vagas'); y += page.title.h + 3; }
    const nb = page.items.length;
    const sel = Math.min(nb - 1, Math.floor((lt / 0.5) * Math.max(1, nb / 4)));
    page.items.forEach((s, i) => {
      const ry = y + page.rows[i];
      blit(R, s, B.x + 16, ry, i === sel ? P.C.main : P.C.ink, 'vaga');
      if (i === sel && Math.floor(lt / 0.125) % 4 !== 3) for (let k = 0; k < 4; k++) for (let q = -k; q <= k; q++) cell(ctx, B.x + 6 + (3 - k), ry + s.pad + 3 + q, P.C.main);
    });
  }
  function phone(R, P, A) {
    const { ctx } = R;
    const lt = A.lt, B = P.box, ph = P.phone;
    const k = A.bespoke ? expoInOut(win(lt, 0, 0.35)) : 1;
    if (k < 1) {
      if (lt < 0.1) { menu(R, P, P.menuPages.length - 1, 1.99, false); return; }
      frameBox(ctx, Math.round(lerp(B.x, ph.x, k)), Math.round(lerp(B.y, ph.y, k)), Math.round(lerp(B.w, ph.w, k)), Math.round(lerp(B.h, ph.h, k)), P.C.ink);
      return;
    }
    chat(R, P, lt, {});
  }
  function chat(R, P, lt, o) {
    const { ctx } = R;
    const ph = P.phone;
    frameBox(ctx, ph.x, ph.y, ph.w, ph.h, P.C.ink);
    ctx.fillStyle = P.C.accent; ctx.fillRect((ph.x + 2) * PX, (ph.y + 2) * PX, (ph.w - 4) * PX, 28 * PX);
    blit(R, P.avatar, ph.x + 6, ph.y + 8, P.C.ink);
    if (!o.noHeader) {
      if (P.chatTitle) blit(R, P.chatTitle, ph.x + 26, ph.y + 3, P.C.ink, 'chat-title');
      if (P.chatNumber) blit(R, P.chatNumber, ph.x + 26, ph.y + 14, P.C.ink, 'chat-number');
    }
    const f = P.field;
    frameBox(ctx, f.x, f.y, f.w, f.h, P.C.ink);
    const sb = { x: ph.x + ph.w - 22, y: f.y + f.h - 18, s: 16 };
    ctx.fillStyle = P.C.cta; ctx.fillRect(sb.x * PX, sb.y * PX, sb.s * PX, sb.s * PX);
    for (let kx = 0; kx < 6; kx++) for (let q = -kx; q <= kx; q++) cell(ctx, sb.x + 3 + (6 - kx), sb.y + 8 + q, DARK);
    if (lt < 1.36) {
      const typed = win(lt, 0.5, 0.8);
      if (typed > 0) blit(R, P.msg, f.x + 4, f.y + 4 - P.msg.pad, P.C.ink, 'chat-typing', typed);
    } else if (!o.noBubble) {
      const y = Math.round(lerp(f.y + 4, P.bubble.y + 5, expoOut(win(lt, 1.36, 0.25))));
      ctx.fillStyle = P.C.cta; ctx.fillRect(P.bubble.x * PX, (y - 5) * PX, P.bubble.w * PX, P.bubble.h * PX);
      blit(R, P.msg, P.bubble.x + 4, y - P.msg.pad, DARK, 'chat-message');
      if (lt >= 1.6) for (const dx of [0, 5]) for (let q = 0; q < 3; q++) cell(ctx, P.bubble.x + P.bubble.w - 12 + dx + q, y - 5 + P.bubble.h - 4 - (2 - q), DARK);
    }
  }
  // K: the card (bespoke: the bubble's pixels fly to the QR, the header number
  // grows); O draws its end state while its words wipe away
  function cardState(R, P, lt, bespoke, wiping = -1) {
    const { ctx } = R;
    const GW = P.G.GW;
    if (P.number) {
      const g = bespoke ? expoInOut(win(lt, 0, 0.4)) : 1;
      if (P.card.brand) blit(R, P.card.brand, Math.round(bespoke ? lerp(P.phone.x + 26, (GW - P.card.brand.w) / 2, g) : (GW - P.card.brand.w) / 2), Math.round(bespoke ? lerp(P.phone.y + 3, P.brandY, g) : P.brandY), P.C.ink, 'marca');
      if (bespoke && g < 1 && P.chatNumber) blit(R, P.chatNumber, Math.round(lerp(P.phone.x + 26, (GW - P.chatNumber.w) / 2, g)), Math.round(lerp(P.phone.y + 14, P.numberY, g)), P.C.ink);
      else if (bespoke || lt >= 0.1) blit(R, P.number, Math.round((GW - P.number.w) / 2), P.numberY - (bespoke ? 0 : Math.round((1 - expoOut(win(lt, 0.1, 0.3))) * 20)), P.C.ink, 'número');
      if (P.qrSize) {
        if (lt < 0.95) {
          if (bespoke) morph(R, P.qrFrom, P.qrCells, lt, 0, 0.95, lt < 0.6 ? P.C.cta : '#FFFFFF', 0.5);
          else { const rows = Math.floor(win(lt, 0, 0.95) * P.qrSize); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(P.qrX * PX, P.qrY * PX, P.qrSize * PX, rows * PX); ctx.fillStyle = DARK; for (const [x, y] of P.qrCells) if (y < P.qrY + rows) ctx.fillRect(x * PX, y * PX, PX, PX); }
        }
        if (lt >= 0.7 && lt < 0.95 && bespoke) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(P.qrX * PX, P.qrY * PX, P.qrSize * PX, P.qrSize * PX); morph(R, P.qrFrom, P.qrCells, lt, 0, 0.95, DARK, 0.5); }
        if (lt >= 0.95) ctx.drawImage(P.qrImg, P.qrX * PX, P.qrY * PX);
      }
      if (lt >= 1.0) {
        const b = P.btn;
        const press = lt >= 1.5 && lt < 1.62 ? 1 : 0;
        ctx.fillStyle = P.C.cta; ctx.fillRect(b.x * PX, (b.y + press) * PX, b.w * PX, b.h * PX);
        blit(R, P.cta, b.x + 20, b.y + 5 + press - P.cta.pad, DARK, 'botão', win(lt, 1.0, 0.25));
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 10; xx++) if ((yy > 0 && yy < 7) || (xx > 0 && xx < 9)) cell(ctx, b.x + 5 + xx, b.y + Math.round(b.h / 2) - 5 + yy + press, DARK);
        cell(ctx, b.x + 6, b.y + Math.round(b.h / 2) + 3 + press, DARK);
      }
      if (lt >= 1.5 && P.qrSize) blit(R, P.hint, Math.round((GW - P.hint.w) / 2), P.hintY, P.C.ink, 'aponta', win(lt, 1.5, 0.25));
    } else {
      const k = bespoke ? 1 : expoOut(win(lt, 0, 0.3));
      if (P.card.brand) blit(R, P.card.brand, Math.round((GW - P.card.brand.w) / 2), P.brandY + Math.round((1 - k) * 20), P.C.ink, 'marca');
      P.card.lines.forEach((s, i) => { if (lt >= i * 0.25) blit(R, s, Math.round((GW - s.w) / 2), P.card.linesY[i], P.C.ink, 'contacto', win(lt, i * 0.25, 0.3)); });
    }
    if (wiping >= 0) {
      // the words wipe away in steps (the QR's pixels stay: they fly in O)
      const k = Math.floor(wiping * 8) / 8;
      ctx.fillStyle = P.C.bg;
      const bottomOfWords = P.qrSize ? P.qrY : P.G.bottom;
      ctx.fillRect(0, 0, P.Z.W, bottomOfWords * PX * k);
      if (P.qrSize) ctx.fillRect(0, (P.hintY - 1) * PX, P.Z.W * k, 40 * PX);
    }
  }
  function card(R, P, A) {
    const lt = A.lt;
    if (A.bespoke && lt < 0.4) {
      // the phone's frame wipes away in steps, top to bottom
      const wipe = Math.floor(expoIn(win(lt, 0, 0.4)) * 30) / 30;
      R.ctx.save();
      R.ctx.beginPath(); R.ctx.rect(0, (P.phone.y + P.phone.h * wipe) * PX, P.Z.W, P.Z.H); R.ctx.clip();
      chat(R, P, 2, { noHeader: true, noBubble: true });
      R.ctx.restore();
    }
    cardState(R, P, lt, A.bespoke);
  }
  function loop(R, P, A) {
    const lt = A.lt;
    const Kact = P.act('K');
    if (lt < 0.3) cardState({ ...R, rec: () => {} }, P, Kact.d, Kact.bespoke, win(lt, 0, 0.3));
    if (lt < 0.9) morph(R, P.endCells, P.firstCells, lt, 0.02, 0.86, lt < 0.4 ? (P.qrSize ? '#FFFFFF' : P.C.ink) : P.C.main, 0.4);
    else blit(R, P.head[0], P.headX[0], P.firstY, P.C.main, 'título');
  }

  // While a room scrolls, its texts are in motion (not checked as settled texts).
  function scrolling(R, A, draw) {
    const moving = R.moving;
    if (A.bespoke && A.lt < 0.33) R.moving = true;
    try { draw(); } finally { R.moving = moving; }
  }
  // I, F: the line typed on with the caret, centred in the zone
  function typedLine(R, P, s, lt, tag) {
    if (!s) return;
    blit(R, s, Math.round((P.G.GW - s.w) / 2), Math.round(P.G.cy - s.h / 2), P.C.ink, tag, win(lt, 0.1, 1.2));
  }
  // An act of pages draws its page at the page's time; the act's own entrance
  // only on its first page (the next pages arrive with the room's scroll).
  function paged(R, A, draw) {
    const pg = K.page(A);
    scrolling(R, A, () => draw(pg.index, pg.lt, A.bespoke && pg.first));
  }

  // ---------------------------------------------------------------- sound: chiptune
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Kact = P.act('K');
    const riserFrom = Math.max(0, Kact.start - 2);
    const roots = [110, 87.31, 130.81, 98];
    const blip = (t, hz, g = 0.06, d = 0.05) => ev.push({ t, kind: 'tone', hz, wave: 'square', dur: d, gain: g });
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5, root = roots[Math.floor(b / 4) % 4];
      ev.push({ t, kind: 'kick', f0: 180, f1: 50, drop: 0.08, dur: 0.18, gain: 0.8, wave: 'square' });
      ev.push({ t: t + 0.25, kind: 'noise', f: 9000, dur: 0.03, gain: 0.06 });
      if (t >= riserFrom && t < Kact.start) continue;
      ev.push({ t, kind: 'tone', hz: root, wave: 'square', dur: 0.2, gain: 0.07, lp: 1800 });
      ev.push({ t: t + 0.25, kind: 'tone', hz: root * 1.5, wave: 'square', dur: 0.14, gain: 0.05, lp: 2200 });
    }
    // every cut and every new page: the room scrolls with a chirp
    const pageTurns = P.acts.filter((x) => x.pages).flatMap((x) => x.pages.slice(1).map((_, i) => x.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...pageTurns]) {
      ev.push({ t, kind: 'noise', filter: 'lowpass', f: 3000, dur: 0.18, gain: 0.35 });
      [523.3, 659.3, 784].forEach((hz, i) => ev.push({ t: t + i * 0.06, kind: 'tone', hz, wave: 'square', dur: 0.16, gain: 0.08 }));
    }
    if (Kact.start >= 2) ev.push({ t: riserFrom, kind: 'riser', wave: 'square', f0: 220, f1: 1760, dur: Kact.start - riserFrom, gain: 0.07, lp: 4000 });
    for (let i = 1; i < P.head.length; i++) blip(Math.min(i - 1, 2) * 0.5 + 0.04, 880);
    for (let k = 0; k < 12; k++) blip(1.5 + k * 0.03, 440 + k * 60, 0.04, 0.03);
    const a = (kind) => P.act(kind);
    // M: a blip per icon; D: a coin chime per value and a blip per helmet; L: the cursor on the beat
    if (a('M')) P.benPages.forEach((list, p) => list.forEach((b, j) => blip(a('M').start + p * 2 + (p === 0 ? 0 : 0.3) + j * (list.length >= 3 ? 0.5 : 1.0) + 0.05, 660)));
    if (a('D')) P.dataPages.forEach((blocks, p) => blocks.forEach((b, j) => {
      const t0 = a('D').start + p * 2 + (p === 0 ? 0.1 : 0.35) + j * 0.8;
      if (b.vac) for (let i = 0; i < b.vacN; i++) blip(t0 + (i / b.vacN) * 0.4, 523 + i * 30, 0.05, 0.04);
      else ev.push({ t: t0, kind: 'tone', hz: 987.8, wave: 'square', dur: 0.08, gain: 0.08 }, { t: t0 + 0.08, kind: 'tone', hz: 1318.5, wave: 'square', dur: 0.3, gain: 0.08 });
    }));
    if (a('L')) for (let b = 0; b < a('L').beats; b++) blip(a('L').start + b * 0.5 + 0.02, 1046, 0.07, 0.04);
    if (a('C')) { for (let t = 0.5; t < 1.3; t += 0.07) blip(a('C').start + t, 1568, 0.035, 0.02); ev.push({ t: a('C').start + 1.36, kind: 'tone', hz: 400, hz1: 1600, wave: 'square', dur: 0.12, gain: 0.07 }); }
    for (let k = 0; k < 10; k++) blip(Kact.start + k * 0.09, [523, 659, 784, 1046][k % 4], 0.05, 0.06);
    blip(Kact.start + 1.5, 1046, 0.08, 0.08);
    const O = a('O');
    for (let k = 0; k < 8; k++) blip(O.start + 0.05 + k * 0.1, [1046, 784, 659, 523][k % 4], 0.05, 0.06);
    return ev.filter((e) => e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'pixel', name: 'Píxel', concept: 'Cada píxel é um tijolo: no fim, os píxeis formam o QR que te liga à obra.',
    font: { head: { family: 'Barlow', weight: 700 }, bold: { family: 'Barlow', weight: 700 } },
    palettes: { dark: { bg: DARK, ink: '#FFFFFF', main: '#FFD23F', accent: '#2E6BFF' } },
    // 10–30 s: benefits, highlights and positions in pages; a new page scrolls the room in
    bgModes: ['dark'], photos: 0, travel: 'scroll', pages: true,
    colors(c) {
      c.main = U.ensureContrast(c.main, c.bg, 4.5);
      c.accent = U.ensureContrast(c.accent, c.bg, 3);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => hook(R, R.P, A.lt),
      I: (R, A) => typedLine(R, R.P, R.P.introS, A.lt, 'intro'),
      F: (R, A) => typedLine(R, R.P, R.P.closingS, A.lt, 'fecho'),
      M: (R, A) => paged(R, A, (i, lt, b) => benefits(R, R.P, i, lt, b)),
      V: (R, A) => scrolling(R, A, () => volume(R, R.P, A.lt, A.bespoke)),
      D: (R, A) => paged(R, A, (i, lt, b) => data(R, R.P, i, lt, b)),
      L: (R, A) => paged(R, A, (i, lt, b) => menu(R, R.P, i, lt, b)),
      C: (R, A) => phone(R, R.P, A),
      K: (R, A) => card(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
