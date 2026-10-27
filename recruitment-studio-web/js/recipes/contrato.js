// Video recipe «Contrato»: a work contract on a clipboard — the ad is written
// on it in blue ink, the benefits are ticked, a signature is drawn and a red
// stamp lands at the end. Camera language: top-down over the desk, a slow
// push on every page; the page turns between acts and pages. Acts (see
// RS.motion.register): H the headline written under the printed title; I and
// F his lines; M the benefits as clauses, each ticked; V the signature; D the
// highlights written large and underlined in red; L the positions; C the
// phone slides onto the desk; K the card printed on the page, the stamp; O
// the page turns back to the blank contract, the first frame.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, expoIn, rrect } = K;

  // ---------------------------------------------------------------- ink
  // A layout written in ink at (x, y): line after line, each traced (its
  // outline drawn by the pen), then filled; it counts as shown once written.
  // k: 0 → 1 over the whole layout. align: 'left' | 'center' in boxW.
  function ink(R, L, x, y, k, color, tag, align = 'left', boxW = 0) {
    if (k <= 0) return;
    const { ctx } = R, n = L.lines.length;
    E.setFont(ctx, L.font, L.size, L.track || 0);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    L.lines.forEach((ln, i) => {
      const kk = k >= 1 ? 1 : win(k, i / n, 1 / n);
      if (kk <= 0) return;
      const w = L.widths[i], lx = align === 'center' ? x + (boxW - w) / 2 : x, ly = y + i * L.lhPx;
      const outline = win(kk, 0, 0.7), fill = kk >= 1 ? 1 : win(kk, 0.55, 0.45);
      if (fill < 1) {
        ctx.save();
        ctx.setLineDash([L.size * 3, L.size * 3]); ctx.lineDashOffset = L.size * 3 * (1 - outline);
        ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.strokeText(ln, lx, ly + L.capPx);
        ctx.restore();
      }
      if (fill > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(lx - 6, ly - L.size, (w + 12) * expoOut(fill), L.size * 2.4); ctx.clip();
        ctx.fillStyle = color; ctx.fillText(ln, lx, ly + L.capPx);
        ctx.restore();
      }
      if (fill >= 1) R.rec(lx, ly, w, L.capPx, tag, ln);
    });
  }
  // a pen stroke along points [[x, y], …], drawn up to k
  function stroke(ctx, pts, k, color, width) {
    if (k <= 0) return;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    ctx.save();
    ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - k);
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  }
  const tickPts = (x, y, s) => [[x + s * 0.16, y + s * 0.52], [x + s * 0.4, y + s * 0.8], [x + s * 0.94, y + s * 0.08]];

  // ---------------------------------------------------------------- the page
  // The desk, the sheet with its clip, the printed title; push: the slow camera push (0 → 1).
  function page(R, P, push, draw) {
    const { ctx } = R, C = P.C, S = P.paper, Z = P.Z;
    ctx.fillStyle = C.desk; ctx.fillRect(0, 0, P.fmt.w, P.fmt.h);
    ctx.save();
    const z = 1 + 0.03 * push;
    ctx.translate(Z.W / 2, Z.cy); ctx.scale(z, z); ctx.translate(-Z.W / 2, -Z.cy);
    ctx.fillStyle = C.shadow; ctx.fillRect(S.x + 14, S.y + 18, S.w, S.h);
    ctx.fillStyle = C.bg; ctx.fillRect(S.x, S.y, S.w, S.h);
    // the clip
    rrect(ctx, Z.W / 2 - 150, S.y - 34, 300, 74, 16); ctx.fillStyle = C.clip; ctx.fill();
    rrect(ctx, Z.W / 2 - 70, S.y - 18, 140, 26, 13); ctx.fillStyle = C.desk; ctx.fill();
    // the printed title and its rule
    K.text(R, P.head, Z.left + 10, P.headY, C.ink, 'center', Z.w - 20, 'título contrato');
    ctx.fillStyle = C.ink; ctx.fillRect(Z.left + 10, P.ruleY, Z.w - 20, 4);
    if (draw) draw();
    ctx.restore();
  }
  // the light rule of the sheet under a line
  function rule(ctx, P, y) { ctx.fillStyle = P.C.rule; ctx.fillRect(P.left, y, P.width, 3); }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    P.paper = { x: Z.left - 50, y: Z.top - (Z.story ? 40 : 30), w: Z.w + 100, h: Z.cH + (Z.story ? 80 : 60) };
    P.head = K.fit(P, P.label('title'), { font: F.head, upper: true, track: 0.12, maxSize: 46, minSize: 40, maxW: Z.w - 40, maxLines: 2, lh: 1.15 });
    P.headY = Z.top + 14;
    P.ruleY = P.headY + P.head.vh + 26;
    P.top = P.ruleY + 56; P.bottom = Z.bottom - 24;
    P.left = Z.left + 10; P.width = Z.w - 20;
    const room = P.bottom - P.top, mid = (P.top + P.bottom) / 2;
    const fitText = (text, o) => K.fit(P, text, { font: F.head, maxW: P.width, lh: 1.08, ...o, maxSize: Math.max(o.minSize, o.maxSize) });
    // H: the kicker and the headline, written
    P.Hk = c.kicker ? fitText(c.kicker, { maxSize: 54, minSize: 40, maxLines: 2 }) : null;
    P.Hh = fitText(c.headline || c.brandName || ' ', { upper: P.upper, maxSize: 132, minSize: 60, maxLines: 5, maxH: room - (P.Hk ? P.Hk.vh + 50 : 0) });
    const hH = (P.Hk ? P.Hk.vh + 50 : 0) + P.Hh.vh;
    P.HkY = mid - hH / 2; P.HhY = P.HkY + (P.Hk ? P.Hk.vh + 50 : 0);
    // I, F: his lines
    const lineOf = (text) => (text ? fitText(text, { maxSize: 96, minSize: 48, maxLines: 7, maxH: room }) : null);
    P.Il = P.act('I') ? lineOf(c.intro) : null;
    P.Fl = P.act('F') ? lineOf(c.closing) : null;
    // M: a page of clauses, each with its box
    const BOX = 66;
    P.box = BOX;
    P.Ms = (Ma ? Ma.pages : []).map((items) => {
      for (let k = 1; ; k -= 0.1) {
        const rows = items.map((i) => ({ L: K.fit(P, c.benefits[i], { font: F.head, maxSize: Math.max(44, 86 * k), minSize: 44, maxW: P.width - BOX - 34, maxLines: 3, lh: 1.08 }) }));
        const H = rows.reduce((a, r) => a + Math.max(BOX, r.L.vh) + 56, -56) + 24;
        if (H <= room || k <= 0.6) {
          let y = mid - H / 2;
          for (const r of rows) { r.h = Math.max(BOX, r.L.vh); r.y = y; y += r.h + 56; }
          return rows;
        }
      }
    });
    // D: a page of highlights, written large and underlined
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    P.Ds = (Da ? Da.pages : []).map((items) => {
      for (let k = 1; ; k -= 0.1) {
        const blocks = items.map((i) => {
          const h = c.highlights[i];
          const V = K.fit(P, h.value || h.label, { font: F.head, maxSize: Math.max(70, 150 * k), minSize: 70, maxW: P.width, maxLines: 2, lh: 1.04 });
          const L = h.value && h.label ? K.fit(P, h.label, { font: F.head, maxSize: Math.max(44, 58 * k), minSize: 44, maxW: P.width, maxLines: 2, lh: 1.1 }) : null;
          return { h, V, L, tag: tagOf(h), labelTag: h.role === 'salary' ? 'período' : 'rótulo', H: V.vh + 40 + (L ? 30 + L.vh : 0) };
        });
        const H = blocks.reduce((a, b) => a + b.H, 0) + 80 * (blocks.length - 1);
        if (H <= room || k <= 0.5) {
          let y = mid - H / 2;
          for (const b of blocks) { b.y = y; y += b.H + 80; }
          return blocks;
        }
      }
    });
    // L: a page of positions under the title
    const lt = c.positionsTitle ? K.fit(P, c.positionsTitle, { font: F.head, upper: true, track: 0.06, maxSize: 50, minSize: 40, maxW: P.width, maxLines: 2 }) : null;
    P.Ls = (La ? La.pages : []).map((items) => {
      for (let k = 1; ; k -= 0.1) {
        const rows = items.map((i) => ({ L: K.fit(P, c.positions[i], { font: F.head, maxSize: Math.max(44, 82 * k), minSize: 44, maxW: P.width - 60, maxLines: 2, lh: 1.08 }) }));
        const H = (lt ? lt.vh + 50 : 0) + rows.reduce((a, r) => a + r.L.vh + 40, -40);
        if (H <= room || k <= 0.6) {
          let y = mid - H / 2;
          const titleY = y;
          if (lt) y += lt.vh + 50;
          for (const r of rows) { r.y = y; y += r.L.vh + 40; }
          return { title: lt, titleY, rows };
        }
      }
    });
    // V: the signature (the company, else the headline) over its line
    P.sig = K.fit(P, c.brandName || c.headline || ' ', { font: F.head, maxSize: 140, minSize: 60, maxW: P.width - 60, maxLines: 2, lh: 1.05 });
    P.sigLabel = K.fit(P, P.label('signature'), { font: F.head, maxSize: 48, minSize: 40, maxW: P.width, maxLines: 1 });
    P.sigLineY = mid + P.sig.vh / 2 + 30;
    P.sigY = P.sigLineY - 30 - P.sig.vh;

    // C: the phone on the desk
    const ph = Math.min(1180, Z.cH - 20), pw = Math.min(780, Z.w - 40);
    P.phone = { x: Z.W / 2 - pw / 2, y: Z.cy - ph / 2, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.head, fontStrong: F.head, radius: (64 * pw) / 780,
      colors: { screen: '#FFFFFF', head: P.C.ink, headInk: '#FFFFFF', field: '#EEF0F5', fieldInk: P.C.ink, bubble: P.C.cta, bubbleInk: P.C.ctaInk, send: P.C.cta, sendInk: P.C.ctaInk, frame: '#1E1E1E' } });
    // K: the card printed on the page and the stamp where it covers nothing of
    // it: above the card when the page leaves room, else beside the QR
    const ROT = -0.12;
    const stampIn = (w, h) => {
      for (let size = 64; size >= 40; size -= 6) {
        const L = K.fit(null, P.label('stamp'), { font: F.head, upper: true, track: 0.06, maxSize: size, minSize: Math.min(size, 40), maxW: Math.max(120, w - 120), maxLines: 2, lh: 1.05 });
        const sw = L.w + 90, sh = L.vh + 70;
        const rx = sw * Math.cos(-ROT) + sh * Math.sin(-ROT), ry = sw * Math.sin(-ROT) + sh * Math.cos(-ROT);
        if (rx <= w && ry <= h) return { L, sw, sh, rx, ry };
      }
      return null;
    };
    const place = (S, cx, cy) => ({ L: S.L, x: cx - S.sw / 2, y: cy - S.sh / 2, w: S.sw, h: S.sh, rot: ROT, box: { x: cx - S.rx / 2, y: cy - S.ry / 2, w: S.rx, h: S.ry } });
    let S = stampIn(Math.min(620, P.width), 200);
    let Cd = S && K.cardLayout(P, { font: F.head, bold: F.head, cy: 0, maxW: P.width - 40, maxH: room - S.ry - 60 });
    if (S && Cd.h <= room - S.ry - 50) {
      P.card = K.cardLayout(P, { font: F.head, bold: F.head, cy: P.top + S.ry + 50 + (room - S.ry - 50) / 2, maxW: P.width - 40, maxH: room - S.ry - 60 });
      P.stamp = place(S, P.left + P.width - S.rx / 2 - 10, P.top + S.ry / 2 + 10);
    } else {
      P.card = Cd = K.cardLayout(P, { font: F.head, bold: F.head, cy: mid, maxW: P.width - 40, maxH: room - 20 });
      // beside the QR: the QR moves left as far as the stamp needs
      S = Cd.qr ? stampIn(Math.max(0, P.width - Cd.qr - 40), Cd.qr + 30) : null;
      if (S) {
        Cd.qrCx = Math.max(P.left + Cd.qr / 2, Math.min(Cd.cx, P.left + P.width - S.rx - 24 - Cd.qr / 2));
        P.stamp = place(S, Cd.qrCx + Cd.qr / 2 + 24 + S.rx / 2, Cd.qrY + Cd.qr / 2);
      } else { S = stampIn(P.width, 220); P.stamp = place(S, P.left + P.width - S.rx / 2, Math.max(P.top, Cd.top - S.ry / 2)); }
    }
    K.fit(P, P.label('stamp'), { font: F.head, upper: true, track: 0.06, maxSize: P.stamp.L.size, minSize: P.stamp.L.size, maxW: 4000, maxLines: 2 }); // its size counts
  }

  // ---------------------------------------------------------------- the acts
  const push = (A) => win(A.lt, 0, A.d);
  function hook(R, P, A) {
    const lt = A.lt;
    page(R, P, push(A), () => {
      ink(R, P.Hh, P.left, P.HhY, win(lt, 0.15, Math.min(1.3, 0.45 * P.Hh.lines.length)), P.C.ink, 'título', 'center', P.width);
      if (P.Hk) ink(R, P.Hk, P.left, P.HkY, win(lt, 1.35, 0.4), P.C.accentInk, 'chamada', 'center', P.width);
    });
  }
  const lineAct = (key, tag) => (R, A) => {
    const P = R.P, L = P[key];
    page(R, P, push(A), () => { if (L) ink(R, L, P.left, (P.top + P.bottom) / 2 - L.vh / 2, win(A.lt, 0.15, 1.4), P.C.ink, tag, 'center', P.width); });
  };
  // M, a page: each clause written, then its box ticked
  function clauses(R, P, A) {
    const pg = K.page(A), lt = pg.lt, rows = P.Ms[pg.index] || [];
    page(R, P, win(lt, 0, 2), () => {
      const { ctx } = R, S = P.box;
      const step = Math.min(0.55, 1.6 / Math.max(1, rows.length));
      rows.forEach((r, j) => {
        const t0 = 0.12 + j * step;
        const by = r.y + (r.h - S) / 2;
        ctx.strokeStyle = P.C.ink; ctx.lineWidth = 5; ctx.strokeRect(P.left + 4, by, S, S);
        rule(ctx, P, r.y + r.h + 22);
        ink(R, r.L, P.left + S + 34, r.y + (r.h - r.L.vh) / 2, win(lt, t0, step * 0.7), P.C.ink, 'vantagem');
        const tk = win(lt, t0 + step * 0.7, 0.18);
        stroke(ctx, tickPts(P.left + 4, by, S), tk, P.C.ink, 9);
        if (tk >= 1) R.rec(P.left + 4, by, S, S, 'visto', '');
      });
    });
  }
  // V: the signature drawn over its line (the sheet leans back a little and returns)
  function signature(R, P, A) {
    const lt = A.lt, { ctx } = R, Z = P.Z;
    const tilt = 0.08 * Math.sin(Math.PI * win(lt, 0.05, 0.9));
    const moving = R.moving; if (tilt > 0.002) R.moving = true;
    ctx.save();
    if (tilt > 0) { ctx.translate(Z.W / 2, Z.cy); ctx.transform(1, 0, -tilt, 1 - tilt, 0, 0); ctx.translate(-Z.W / 2, -Z.cy); }
    page(R, P, push(A), () => {
      ctx.fillStyle = P.C.ink; ctx.fillRect(P.left + 30, P.sigLineY, P.width - 60, 4);
      K.text(R, P.sigLabel, P.left, P.sigLineY + 24, P.C.ink, 'center', P.width, 'assinatura');
      // a slanted hand
      const cy = P.sigY + P.sig.vh / 2;
      ctx.save(); ctx.translate(Z.W / 2, cy); ctx.transform(1, 0, -0.18, 1, 0, 0); ctx.translate(-Z.W / 2, -cy);
      ink(R, P.sig, P.left, P.sigY, win(lt, 0.55, 0.9), P.C.ink, P.content.brandName ? 'marca' : 'título', 'center', P.width);
      ctx.restore();
      stroke(ctx, [[P.left + 80, P.sigLineY - 14], [P.left + P.width - 80, P.sigLineY - 22]], win(lt, 1.45, 0.3), P.C.ink, 6);
    });
    ctx.restore();
    R.moving = moving;
  }
  // D, a page: each value written large, underlined in red, its label under it
  function values(R, P, A) {
    const pg = K.page(A), lt = pg.lt, blocks = P.Ds[pg.index] || [];
    page(R, P, win(lt, 0, 2), () => {
      const { ctx } = R;
      blocks.forEach((b, j) => {
        const t0 = 0.12 + j * 0.8;
        ink(R, b.V, P.left, b.y, win(lt, t0, 0.5), P.C.ink, b.tag, 'center', P.width);
        const uw = Math.max(...b.V.widths) + 40, uy = b.y + b.V.vh + 18;
        stroke(ctx, [[P.Z.W / 2 - uw / 2, uy + 6], [P.Z.W / 2, uy - 2], [P.Z.W / 2 + uw / 2, uy + 4]], win(lt, t0 + 0.5, 0.2), P.C.accent, 9);
        if (b.L) ink(R, b.L, P.left, uy + 40, win(lt, t0 + 0.55, 0.3), P.C.ink, b.labelTag, 'center', P.width);
      });
    });
  }
  // L, a page: the title printed; each position written after a dash
  function positions(R, P, A) {
    const pg = K.page(A), lt = pg.lt, S = P.Ls[pg.index];
    page(R, P, win(lt, 0, 2), () => {
      if (!S) return;
      const { ctx } = R;
      if (S.title) K.text(R, S.title, P.left, S.titleY, P.C.ink, 'center', P.width, 'título vagas');
      const step = Math.min(0.4, 1.5 / Math.max(1, S.rows.length));
      S.rows.forEach((r, j) => {
        const t0 = 0.12 + j * step;
        stroke(ctx, [[P.left + 6, r.y + r.L.capPx / 2 + 4], [P.left + 36, r.y + r.L.capPx / 2 + 4]], win(lt, t0, 0.1), P.C.ink, 6);
        ink(R, r.L, P.left + 60, r.y, win(lt, t0 + 0.05, step * 0.8), P.C.ink, 'vaga');
      });
    });
  }
  // C: the phone slides onto the desk, over the sheet
  function chatAct(R, P, A) {
    const lt = A.lt, Z = P.Z;
    page(R, P, push(A));
    const off = (x) => (1 - expoOut(win(x, 0, 0.45))) * (Z.W + 200);
    const moving = R.moving; if (lt < 0.45) R.moving = true;
    K.blurred(R, Math.abs(K.speed(off, lt)), (g, d) => { g.save(); g.translate(off(lt - d), 0); K.chatDraw(R, P.chat, lt - d, { type0: 0.6, type1: 1.3, send: 1.36 }); g.restore(); }, null);
    R.moving = moving;
  }
  const cardInk = (P) => ({ ink: P.C.ink, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: P.C.ink, qrDark: P.C.ink, qrLight: '#FFFFFF' });
  // the stamp: it lands at t0 (scale 1.5 → 1), in the highlight colour
  function stamp(R, P, lt, t0) {
    if (lt < t0) return;
    const { ctx } = R, S = P.stamp, C = P.C;
    const k = expoIn(win(lt, t0, 0.16)), z = 1.5 - 0.5 * k;
    const moving = R.moving; if (k < 1) R.moving = true;
    ctx.save();
    ctx.translate(S.x + S.w / 2, S.y + S.h / 2); ctx.rotate(S.rot); ctx.scale(z, z); ctx.translate(-S.w / 2, -S.h / 2);
    rrect(ctx, 0, 0, S.w, S.h, 18); ctx.lineWidth = 8; ctx.strokeStyle = C.accent; ctx.stroke();
    rrect(ctx, 12, 12, S.w - 24, S.h - 24, 12); ctx.lineWidth = 3; ctx.stroke();
    K.text(R, S.L, 45, 35, C.accent, 'center', S.w - 90, 'carimbo');
    ctx.restore();
    R.moving = moving;
  }
  // K: the phone slides off; the card is printed on the page; the stamp lands
  function card(R, P, A) {
    const lt = A.lt, Z = P.Z, { ctx } = R;
    page(R, P, push(A), () => {
      K.cardDraw(R, P.card, lt, { ...cardInk(P), start: A.bespoke ? 0.3 : 0.1 });
      stamp(R, P, lt, 1.05);
    });
    if (A.bespoke && lt < 0.4) {
      const m = R.moving; R.moving = true;
      const rr = R.rec; R.rec = () => {};
      ctx.save(); ctx.translate(expoIn(win(lt, 0, 0.36)) * (Z.W + 200), 0); K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true }); ctx.restore();
      R.rec = rr; R.moving = m;
    }
  }
  // O: the page is turned away to the left; under it, the blank contract — the first frame
  function loop(R, P, A) {
    const lt = A.lt, Ka = P.act('K'), { ctx } = R, W = P.fmt.w, H = P.fmt.h;
    page(R, P, 0);
    const e = expoIn(win(lt, 0.05, 0.4)) * 0.5 + expoOut(win(lt, 0.45, 0.45)) * 0.5;
    if (e >= 1) return;
    const moving = R.moving; R.moving = true;
    ctx.save(); ctx.translate(-W * 1.15 * e, H); ctx.rotate(-0.14 * e); ctx.translate(0, -H);
    const rr = R.rec; R.rec = () => {};
    page(R, P, 1, () => { K.cardDraw(R, P.card, Ka.d, { ...cardInk(P), start: Ka.bespoke ? 0.3 : 0.1 }); stamp(R, P, 9, 1.05); });
    R.rec = rr;
    ctx.restore();
    R.moving = moving;
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const chords = [[130.8, 164.8, 196], [110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8]];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 100, f1: 42, drop: 0.16, dur: 0.38, gain: 0.8 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 7000, dur: 0.04, gain: 0.04 });
      if (b % 4 === 0 && (t < riserFrom || t >= Ka.start)) for (const hz of chords[Math.floor(b / 4) % 4]) ev.push({ t, kind: 'tone', hz, wave: 'triangle', dur: 1.8, gain: 0.07, lp: 1800, attack: 0.02 });
    }
    // a page turn on every act change and new page; a riser into the card
    const turns = P.acts.filter((a) => a.pages).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...turns]) ev.push({ t, kind: 'noise', filter: 'bandpass', f: 2200, q: 0.8, dur: 0.32, gain: 0.3 }, { t, kind: 'kick', f0: 150, f1: 60, dur: 0.2, gain: 0.3 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 300, f1: 3500, gain: 0.18 });
    // the pen on paper
    const pen = (t0, d) => { for (let t = 0, i = 0; t < d; t += 0.07, i++) ev.push({ t: t0 + t, kind: 'noise', filter: 'bandpass', f: 3200 + (i % 3) * 400, q: 4, dur: 0.05, gain: 0.04 }); };
    pen(0.15, 1.3);
    const at = (k) => P.act(k);
    for (const k of ['I', 'F', 'V']) if (at(k)) pen(at(k).start + 0.2, 1.3);
    for (const k of ['M', 'D', 'L']) if (at(k)) at(k).pages.forEach((_, p) => pen(at(k).start + p * 2 + 0.12, 1.5));
    const C = at('C');
    if (C) {
      for (let t = 0.6; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    // the stamp
    ev.push({ t: Ka.start + 1.21, kind: 'kick', f0: 80, f1: 38, dur: 0.3, gain: 0.7 }, { t: Ka.start + 1.21, kind: 'noise', filter: 'lowpass', f: 900, dur: 0.15, gain: 0.4 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  const L7 = (pt, de, fr, it, en, es) => ({ 'pt-PT': pt, 'de-CH': de, 'de-DE': de, fr, it, en, es });
  RS.motion.register({
    id: 'contrato', name: 'Contrato', concept: 'Um contrato numa prancheta: vantagens marcadas a tinta azul, uma assinatura e um carimbo no fim.',
    font: { head: { family: 'DM Serif Display', weight: 400 }, bold: { family: 'DM Serif Display', weight: 400 } },
    palettes: { light: { bg: '#F3EEE3', ink: '#1B3A7A', main: '#1B3A7A', accent: '#C0392B' } },
    bgModes: ['light'], photos: 0, travel: 'page', pages: true, slides: { V: true },
    // every act is a new page of the contract (turned), except the card printed where the phone was
    canonical: { M: null, V: null, D: null, L: null, C: null },
    labels: {
      title: L7('CONTRATO DE TRABALHO', 'ARBEITSVERTRAG', 'CONTRAT DE TRAVAIL', 'CONTRATTO DI LAVORO', 'EMPLOYMENT CONTRACT', 'CONTRATO DE TRABAJO'),
      signature: L7('Assinatura', 'Unterschrift', 'Signature', 'Firma', 'Signature', 'Firma'),
      stamp: L7('CONTRATA-SE', 'WIR STELLEN EIN', 'ON RECRUTE', 'SI ASSUME', 'HIRING', 'SE CONTRATA'),
    },
    colors(c) {
      // the paper is the background; blue ink; the stamp in the highlight colour
      c.ink = U.ensureContrast(c.main, c.bg, 7);
      c.accent = U.ensureContrast(c.accent, c.bg, 3);
      c.accentInk = U.ensureContrast(c.accent, c.bg, 4.5);
      c.desk = U.mix(c.bg, '#000000', 0.16);
      c.shadow = U.mix(c.bg, '#000000', 0.3);
      c.clip = '#3A3D44';
      c.rule = U.mix(c.ink, c.bg, 0.82);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => hook(R, R.P, A),
      I: lineAct('Il', 'intro'),
      M: (R, A) => clauses(R, R.P, A),
      V: (R, A) => signature(R, R.P, A),
      D: (R, A) => values(R, R.P, A),
      L: (R, A) => positions(R, R.P, A),
      F: lineAct('Fl', 'fecho'),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => card(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
