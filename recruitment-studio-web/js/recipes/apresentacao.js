// Video recipe «Apresentação»: a product launch keynote. One idea per slide
// and nothing is cut: every element glides (critically damped spring) from
// one slide's layout to the next ("magic move"); the camera never moves.
// H: the headline arrives word group by word group; M: the accent bar becomes
// the benefit cards; V: the cards stand up in a ring and turn (2D → 3D), then
// fold into a dot; D: the dot opens into the salary, one dot per vacancy;
// L: the dots become the bullets of the positions; C: the phone rises and the
// ad's message is typed; K: the bubble becomes the button and the QR grows;
// O: the card leaves and the first word comes back as in the first frame.
// 10–30 s: M, D and L are slides of a page each — the cards glide to their
// new places, a data slide rises over the last, list rows change places.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { lerp, win, expoOut, expoIn, spring, rrect, clamp } = K;
  const MOVE = 0.45, LOOP = 0.9;

  // An element's state at time t: from keyframe to keyframe, each change
  // springs over `d` seconds (no overshoot). Colours are mixed.
  function track(keys, t) {
    let s = { ...keys[0] };
    for (let i = 1; i < keys.length; i++) {
      const k = keys[i];
      if (t < k.t) break;
      const e = spring(win(t, k.t, k.d || MOVE));
      const n = { ...s };
      for (const p in k) {
        if (p === 't' || p === 'd') continue;
        if (typeof k[p] === 'number') n[p] = lerp(s[p] != null ? s[p] : k[p], k[p], e);
        else if (typeof k[p] === 'string' && /^#/.test(k[p]) && s[p]) n[p] = U.mix(s[p], k[p], e);
        else n[p] = e >= 0.5 ? k[p] : s[p];
      }
      s = n;
    }
    return s;
  }
  const H6 = 1 / 240;
  function trackSpeed(keys, t) {
    const a = track(keys, t - H6), b = track(keys, t + H6);
    return Math.hypot(b.x - a.x, (b.top != null ? b.top - a.top : b.y - a.y)) / (2 * H6);
  }
  // the speed of a spring move of `dist` px that starts at t0 and lasts d
  const moveSpeed = (lt, t0, d, dist) => Math.abs(K.speed((x) => spring(win(x, t0, d)) * dist, lt));
  // a text sliding into view is recorded (for the checks) once it has settled
  function settled(R, k, draw) {
    const rr = R.rec;
    if (k < 0.95) R.rec = () => {};
    try { draw(); } finally { R.rec = rr; }
  }
  // a slide on its way out: drawn, never recorded
  const quietly = (R, draw) => settled(R, 0, draw);

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const CX = Z.W / 2, CY = Z.cy;
    P.CX = CX; P.OFF_UP = -(Z.H + 400); P.OFF_R = Z.W + 300;
    const Ma = P.act('M'), Da = P.act('D');

    // the headline, word by word: each word glides between the slides' layouts
    const words = String(c.headline || c.brandName || ' ').split(/\s+/).filter(Boolean);
    if (!words.length) words.push(' ');
    const up = (s) => (P.upper ? s.toLocaleUpperCase(P.locale) : s);
    const widest = Math.max(...words.map((w) => K.textWidth(up(w), { font: F.head, size: 100, track: 0 }) / 100));
    const cap = (Z.w * 0.98) / widest; // the largest size at which every word fits on a line
    const lay = (ids, size, min, lines, lh, maxH) => {
      const mx = Math.max(40, Math.min(size, cap)); // never under 40 px: a word too long is split instead
      const L = K.fit(P, ids.map((k) => words[k]).join(' '), { font: F.head, upper: P.upper, maxSize: mx, minSize: Math.max(40, Math.min(min, mx)), maxW: Z.w, maxLines: lines, lh, maxH });
      return { L, ws: K.words(L, Z.left, 0, 'center', Z.w) };
    };
    const all = words.map((_, i) => i);
    const full = lay(all, 140, 60, 4, 1.04, Z.cH * 0.6);
    const title = lay(all, 60, 40, 2, 1.1, Z.cH * 0.24);
    P.kicker = c.kicker ? K.fit(P, c.kicker, { font: F.bold, maxSize: 54, minSize: 40, maxW: Z.w, maxLines: 2 }) : null;
    const blockH = (P.kicker ? P.kicker.vh + 60 : 0) + full.L.vh + 70 + 18;
    P.hy = CY - blockH / 2 + (P.kicker ? P.kicker.vh + 60 : 0);
    P.kickerY = P.hy - 60 - (P.kicker ? P.kicker.vh : 0);
    P.barY = P.hy + full.L.vh + 70;
    P.titleTop = Z.top + 6;
    P.titleBottom = P.titleTop + title.L.vh;
    P.full = full; P.title = title;
    P.capK = full.L.capPx / full.L.size;
    P.barKeys = [{ t: 0, x: CX, y: P.barY, w: 0, h: 18, r: 9 }, { t: 1.52, x: CX - 220, y: P.barY, w: 440, h: 18, r: 9 }];

    // groups: the first word, then the next (short words join the word after), then the rest
    const groups = [[0]];
    let i = 1;
    if (i < words.length) { const g = []; while (i < words.length - 1 && words[i].length <= 2) g.push(i++); g.push(i++); groups.push(g); }
    if (i < words.length) groups.push(words.slice(i).map((_, k) => i + k));
    const place = (b, ids, top) => (b.ws.length === ids.length ? ids.map((k, j) => ({ id: k, x: b.ws[j].x, top: top + b.ws[j].top, size: b.L.size })) : null);
    const big = (ids, y) => { const b = lay(ids, 230, 70, 2, 1.02, Z.cH * 0.5); return place(b, ids, y - b.L.vh / 2); };
    const small = (ids, y) => place(lay(ids, 78, 40, 1, 1.05, 200), ids, y);
    const smallY = CY - Math.min(420, Z.cH * 0.43);
    P.k0 = big(groups[0], CY);
    const beats = groups.slice(1).map((g, b) => ({ tb: b * 0.5 + 0.02, line: small(groups.slice(0, b + 1).flat(), smallY), big: big(g, CY) }));
    // a word too long for a line at 40 px: whole lines glide instead of words
    P.simple = cap < 40 || !P.k0 || beats.some((b) => !b.line || !b.big) || full.ws.length !== words.length || title.ws.length !== words.length;
    if (!P.simple) {
      P.wordText = full.ws.map((w) => w.t);
      const pick = (s, color) => ({ x: s.x, top: s.top, size: s.size, color });
      P.wordKeys = words.map((_, id) => {
        const keys = [];
        const at = (list) => list.find((x) => x.id === id);
        if (groups[0].includes(id)) keys.push({ t: 0, ...pick(at(P.k0), C.ink) });
        for (const b of beats) {
          const s = at(b.line) || at(b.big);
          if (!s) continue;
          if (!keys.length) keys.push({ t: 0, ...pick(s, C.ink), x: s.x + P.OFF_R });
          keys.push({ t: b.tb, ...pick(s, at(b.line) ? C.soft : C.ink) });
        }
        const f = full.ws[id], tt = title.ws[id];
        keys.push({ t: 1.02, x: f.x, top: CY - full.L.vh / 2 + f.top, size: full.L.size, color: C.ink });
        keys.push({ t: 1.52, x: f.x, top: P.hy + f.top, size: full.L.size, color: C.ink });
        // the headline becomes the slide title; it leaves when the data opens
        if (Ma) keys.push({ t: Ma.start, x: tt.x, top: P.titleTop + tt.top, size: title.L.size, color: C.ink });
        if (Ma && Da && Da.bespoke) keys.push({ t: Da.start, x: tt.x, top: P.titleTop + tt.top + P.OFF_UP, size: title.L.size, color: C.ink, d: 0.4 });
        return keys;
      });
    }

    // the benefit cards, a slide per page (on the first, the accent bar becomes
    // the first card, then it splits; on the next, the cards glide to their
    // new places and their words change)
    const gap = 34;
    const layoutCards = (items) => {
      const n = items.length;
      const cardH = clamp((Z.bottom - (P.titleBottom + 60) - (n - 1) * gap) / Math.max(1, n), 150, 230);
      const cards = items.map((i, j) => ({
        L: K.fit(P, c.benefits[i], { font: F.bold, maxSize: 66, minSize: 40, maxW: Z.w - 250, maxLines: 2, lh: 1.1, maxH: cardH - 40 }),
        icon: c.icons[i] || 'check', fill: j % 2 ? C.cardB : C.cardA, ink: j % 2 ? C.cardBInk : C.cardAInk,
      }));
      const total = n * cardH + (n - 1) * gap;
      const top0 = Math.max(P.titleBottom + 60, Math.min(CY + 60 - total / 2, Z.bottom - total));
      cards.forEach((cd, j) => { cd.rect = { x: Z.left, y: top0 + j * (cardH + gap), w: Z.w, h: cardH, r: 44 }; });
      return cards;
    };
    P.cardPages = (Ma ? Ma.pages : []).map(layoutCards);
    // V turns the last slide's cards
    P.cards = P.cardPages[P.cardPages.length - 1] || [];
    if (Ma) {
      const bar = P.barKeys[1], first = P.cardPages[0];
      P.cardKeys = first.map((cd, j) => (j === 0
        ? [{ t: 0, x: bar.x, y: bar.y, w: bar.w, h: bar.h, r: bar.r }, { t: Ma.start, ...cd.rect }]
        : [{ t: 0, ...first[0].rect }, { t: Ma.start + j * 0.5, ...cd.rect }]));
    }

    // the highlights, a slide per page: a value opens from a dot and counts up
    // (a plain number) or shows as written, its label under it; the vacancies
    // as one dot each, then their words
    const hl = c.highlights;
    const layoutData = (items) => {
      const blocks = items.map((i) => {
        const h = hl[i];
        if (h.role === 'vacancies') {
          const vacN = h.count != null ? Math.min(24, h.count) : 0, per = vacN ? Math.min(vacN, 6) : 1;
          return { vac: true, hl: h, vacN, per, rowsN: vacN ? Math.ceil(vacN / per) : 0, L: K.fit(P, [h.value, h.label].filter(Boolean).join(' '), { font: F.head, maxSize: 96, minSize: 50, maxW: Z.w, maxLines: 2 }) };
        }
        const L = K.fit(P, h.value || h.label, { font: F.head, maxSize: items.length > 1 ? 210 : 250, minSize: 70, maxW: Z.w + 20, maxLines: 2, lh: 1 });
        const label = h.value && h.label ? K.fit(P, h.label, { font: F.bold, maxSize: 72, minSize: 40, maxW: Z.w, maxLines: 2 }) : null;
        return { hl: h, L, label, count: h.value && h.count != null ? h.count : null, H: L.vh + (label ? 40 + label.vh : 0) };
      });
      const fixed = blocks.reduce((a, b) => a + (b.vac ? 40 + b.L.vh : b.H), 0) + 100 * Math.max(0, blocks.length - 1);
      for (const b of blocks) if (b.vac) { b.dotStep = b.rowsN ? clamp((Z.cH - 40 - fixed) / b.rowsN, 60, 110) : 0; b.H = b.rowsN * b.dotStep + 40 + b.L.vh; }
      const H = blocks.reduce((a, b) => a + b.H, 0) + 100 * Math.max(0, blocks.length - 1);
      let y = CY - H / 2;
      for (const b of blocks) { b.y = y; y += b.H + 100; }
      return blocks;
    };
    P.dataPages = (Da ? Da.pages : []).map(layoutData);
    // the dot the cards fold into opens into the first value (or the first vacancy dot)
    const b0 = (P.dataPages[0] || [])[0];
    P.dotTarget = !b0 ? CY : b0.vac ? b0.y + 40 : b0.y + b0.L.vh / 2;
    // the vacancy dots that become the list's bullets: those of the last slide
    P.vacBlock = (P.dataPages[P.dataPages.length - 1] || []).find((b) => b.vac && b.vacN) || null;

    // the positions as a bulleted list, a slide per page
    const listTitle = c.positionsTitle ? K.fit(P, c.positionsTitle, { font: F.head, maxSize: 64, minSize: 40, maxW: Z.w, maxLines: 1 }) : null;
    P.listPages = (P.act('L') ? P.act('L').pages : []).map((idx) => {
      let size = 64, lgap = 62, pg;
      for (;;) {
        const items = idx.map((i) => K.fit(P, c.positions[i], { font: F.bold, maxSize: size, minSize: 40, maxW: Z.w - 100, maxLines: 2, lh: 1.08 }));
        let ly = 0;
        const itemY = items.map((L) => { const y = ly; ly += L.vh + lgap; return y; });
        pg = { title: listTitle, items, itemY, listH: ly - lgap + (listTitle ? listTitle.vh + 80 : 0) };
        if (pg.listH <= Z.cH * 0.92 || size <= 40) break;
        size = Math.max(40, size - 8); lgap = 40;
      }
      pg.listTop = CY - pg.listH / 2;
      return pg;
    });

    // the phone
    const ph = Math.min(1220, Z.cH - 10), pw = Math.min(780, Z.w);
    P.phone = { x: CX - pw / 2, y: CY - ph / 2, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: F.bold, fontStrong: F.head, radius: (80 * pw) / 780,
      colors: { screen: '#FFFFFF', head: C.phoneHead, headInk: '#FFFFFF', field: '#F1F1F1', fieldInk: '#0D0D0D', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: C.ink } });

    // the card
    const card = {};
    if (c.contact) {
      card.number = K.fit(P, c.contact.display, { font: F.head, maxSize: 120, minSize: 60, maxW: Z.w + 40, maxLines: 1 });
      card.cta = K.line(P, c.contact.cta, { font: F.bold, size: 62 });
      card.pill = { h: 150, w: Math.min(Z.w + 40, card.cta.w + 220) };
      card.hint = K.line(P, c.contact.hint, { font: F.bold, size: 46 });
      const rest = card.number.vh + 64 + card.pill.h + (c.qr ? 64 + 36 + card.hint.vh : 0);
      card.qr = c.qr ? clamp(Z.cH - rest - 40, 240, 460) : 0;
      let y = CY - (rest + card.qr) / 2;
      card.numberY = y; y += card.number.vh + 64;
      card.pillY = y; y += card.pill.h + 64;
      card.qrY = y; card.hintY = y + card.qr + 36;
    } else {
      // no WhatsApp number: the brand and the ad's own contacts (or its headline)
      const lines = P.content.contacts.slice(0, 3); // the ad's contacts, unless hidden
      card.lines = lines.map((s) => K.fit(P, s, { font: F.bold, maxSize: 72, minSize: 44, maxW: Z.w, maxLines: 2 }));
      card.tags = lines.map(() => 'contacto');
      if (c.brandName && c.showLogo) { card.lines.unshift(K.fit(P, c.brandName, { font: F.head, maxSize: 96, minSize: 50, maxW: Z.w, maxLines: 2 })); card.tags.unshift('marca'); }
      if (!card.lines.length) { card.lines = [K.fit(P, c.headline || ' ', { font: F.head, upper: P.upper, maxSize: 120, minSize: 60, maxW: Z.w, maxLines: 4 })]; card.tags = ['contacto']; }
      const H = card.lines.reduce((a, L) => a + L.vh + 50, -50);
      let y = CY - H / 2;
      card.linesY = card.lines.map((L) => { const r = y; y += L.vh + 50; return r; });
    }
    P.card = card;
  }

  // ---------------------------------------------------------------- the headline
  function drawWord(R, P, id, s) {
    const Z = P.Z, txt = P.wordText[id];
    if (s.x > Z.W || s.top > Z.H || s.top + s.size < 0) return;
    const L = { font: P.F.head, size: s.size, track: 0 };
    const w = K.textWidth(txt, L);
    if (s.x + w < 0) return;
    const capPx = s.size * P.capK;
    K.fillText(R.ctx, txt, s.x, s.top + capPx, L, s.color);
    R.rec(s.x, s.top, w, capPx, 'título', txt);
  }
  function lineAt(R, P, L, i, x, top) {
    const Z = P.Z;
    if (x > Z.W || top > Z.H || top + L.size < 0) return;
    K.fillText(R.ctx, L.lines[i], x, top + L.capPx, L, P.C.ink);
    R.rec(x, top, L.widths[i], L.capPx, 'título', L.lines[i]);
  }
  const lineX = (P, L, i) => P.Z.left + (P.Z.w - L.widths[i]) / 2;
  // whole lines instead of words (a word too long to glide on its own)
  function simpleHead(R, P, t) {
    const Ma = P.act('M'), Da = P.act('D');
    const full = P.full.L, title = P.title.L;
    const outFull = Ma ? spring(win(t, Ma.start, 0.4)) * P.OFF_UP : 0;
    if (outFull > P.OFF_UP + 1) full.lines.forEach((ln, i) => {
      const k = i === 0 ? 1 : spring(win(t, Math.min(i - 1, 2) * 0.5 + 0.02, MOVE));
      lineAt(R, P, full, i, lineX(P, full, i) + (1 - k) * P.OFF_R, P.hy + i * full.lhPx + outFull);
    });
    if (Ma && t >= Ma.start) {
      const k = spring(win(t, Ma.start + 0.05, MOVE)), out = Da && Da.bespoke ? spring(win(t, Da.start, 0.4)) * P.OFF_UP : 0;
      title.lines.forEach((ln, i) => lineAt(R, P, title, i, lineX(P, title, i) + (1 - k) * P.OFF_R, P.titleTop + i * title.lhPx + out));
    }
  }
  function simpleSpeed(P, t) {
    const Ma = P.act('M'), Da = P.act('D');
    let v = 0;
    for (let i = 1; i < 4; i++) v = Math.max(v, moveSpeed(t, (i - 1) * 0.5 + 0.02, MOVE, P.OFF_R));
    if (Ma) v = Math.max(v, moveSpeed(t, Ma.start, 0.4, -P.OFF_UP), moveSpeed(t, Ma.start + 0.05, MOVE, P.OFF_R));
    if (Da) v = Math.max(v, moveSpeed(t, Da.start, 0.4, -P.OFF_UP));
    return v;
  }
  const wordsSpeed = (P, t) => (P.simple ? simpleSpeed(P, t) : Math.max(0, ...P.wordKeys.map((k) => trackSpeed(k, t))));
  // the kicker, the accent bar and the headline at time t (H, then the slide title)
  function headScene(R, P, t) {
    const { ctx } = R, C = P.C, Z = P.Z;
    const Ma = P.act('M');
    if (P.kicker && t >= 1.5) {
      const k = spring(win(t, 1.52, 0.4)), out = Ma ? spring(win(t, Ma.start, 0.4)) * P.OFF_UP : 0;
      const y = P.kickerY + out;
      if (y + P.kicker.vh > -60) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, y - 40, Z.W, P.kicker.vh + 90); ctx.clip();
        settled(R, k, () => K.text(R, P.kicker, Z.left, y + (1 - k) * 90, C.accentText, 'center', Z.w, 'chamada'));
        ctx.restore();
      }
    }
    if (!Ma || t < Ma.start) {
      const b = track(P.barKeys, t);
      if (b.w > 2) { rrect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.fillStyle = C.accent; ctx.fill(); }
    }
    if (P.simple) simpleHead(R, P, t);
    else P.wordKeys.forEach((keys, id) => drawWord(R, P, id, track(keys, t)));
  }

  // ---------------------------------------------------------------- the benefit cards
  function card(R, P, cd, r, k) {
    const { ctx } = R;
    if (r.w < 2) return;
    rrect(ctx, r.x, r.y, r.w, r.h, r.r);
    ctx.fillStyle = cd.fill; ctx.fill();
    // the content rises in once the card has arrived
    if (k <= 0 || r.h < 100) return;
    ctx.save();
    rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.clip();
    const dy = (1 - k) * r.h;
    ctx.beginPath(); ctx.arc(r.x + 100, r.y + r.h / 2 + dy, 52, 0, Math.PI * 2); ctx.fillStyle = cd.ink; ctx.fill();
    E.drawIcon(ctx, cd.icon, r.x + 100, r.y + r.h / 2 + dy, 56, cd.fill, 2.6);
    settled(R, k, () => K.text(R, cd.L, r.x + 190, r.y + (r.h - cd.L.vh) / 2 + dy, cd.ink, 'left', 0, 'vantagem'));
    ctx.restore();
  }
  // M at lt: the first slide grows from the bar; each next slide is a magic
  // move — every card glides to its new place (an extra one splits from, or
  // folds into, the last), the old words drop away and the new ones rise
  function cardsLayer(R, P, lt) {
    const Ma = P.act('M');
    const pg = K.page({ ...Ma, lt });
    const list = P.cardPages[pg.index];
    if (pg.first) {
      list.forEach((cd, j) => {
        if (j > 0 && lt < j * 0.5) return;
        card(R, P, cd, track(P.cardKeys[j], Ma.start + lt), expoOut(win(lt, j * 0.5 + 0.12, 0.35)));
      });
      return;
    }
    const prev = P.cardPages[pg.index - 1], pl = pg.lt;
    const e = spring(win(pl, 0.1, MOVE));
    const shared = Math.min(prev.length, list.length), n = Math.max(prev.length, list.length);
    const order = [...Array(n).keys()].sort((a, b) => (b >= shared) - (a >= shared));
    for (const j of order) {
      const r = K.rectLerp(prev[Math.min(j, prev.length - 1)].rect, list[Math.min(j, list.length - 1)].rect, e);
      if (j < prev.length && pl < 0.3) card(R, P, prev[j], r, 1 - expoIn(win(pl, 0, 0.25)));
      else card(R, P, j < list.length ? list[j] : prev[j], r, j < list.length ? expoOut(win(pl, 0.4 + j * 0.15, 0.35)) : 0);
    }
  }
  const cardsSpeed = (P, lt) => { const pg = K.page({ ...P.act('M'), lt }); return pg.first ? 0 : moveSpeed(pg.lt, 0.1, MOVE, 300); };
  // the cards stand up in a ring and turn (2D → 3D); then fold into a dot
  function carousel(R, P, lt) {
    const { ctx } = R;
    const n = P.cards.length, CX = P.CX, CY = P.Z.cy, rad = P.Z.w * 0.35;
    const spread = spring(win(lt, 0, 0.5));
    const turn = spring(win(lt, 0.5, 0.45)) + spring(win(lt, 1.0, 0.45));
    const fold = spring(win(lt, 1.5, 0.4));
    const items = P.cards.map((cd, j) => {
      const flat = cd.rect;
      const a = (j / n) * Math.PI * 2 - turn * ((Math.PI * 2) / n);
      const z = Math.cos(a);
      return {
        cd, j, h: flat.h,
        scale: lerp(1, 0.6 + 0.3 * z, spread), sx: lerp(1, Math.max(0.1, Math.abs(Math.cos(a))), spread),
        cx: lerp(flat.x + flat.w / 2, CX + Math.sin(a) * rad, spread), cy: lerp(flat.y + flat.h / 2, CY + 60 - z * 60, spread), z: lerp(-j, z, spread),
      };
    }).sort((a, b) => a.z - b.z);
    const k = 1 - fold;
    if (k > 0.001) for (const it of items) {
      ctx.save();
      ctx.translate(lerp(it.cx, CX, fold), lerp(it.cy, P.dotTarget, fold));
      ctx.scale(it.sx * it.scale * k, it.scale * k);
      const rr = R.rec;
      if (!(it.z > 0.6 && fold < 0.1 && spread > 0.95) && spread > 0.05) R.rec = () => {};
      card(R, P, it.cd, { x: -P.Z.w / 2, y: -it.h / 2, w: P.Z.w, h: it.h, r: 44 }, 1);
      R.rec = rr;
      ctx.restore();
    }
    if (fold > 0) { ctx.beginPath(); ctx.arc(CX, P.dotTarget, 24 * fold, 0, Math.PI * 2); ctx.fillStyle = P.C.accent; ctx.fill(); }
  }
  const carouselSpeed = (P, lt) => Math.max(moveSpeed(lt, 0, 0.5, P.Z.w * 0.35), moveSpeed(lt, 0.5, 0.45, P.Z.w * 0.5), moveSpeed(lt, 1.0, 0.45, P.Z.w * 0.5), moveSpeed(lt, 1.5, 0.4, 400));

  // ---------------------------------------------------------------- data, dots, list
  // when block j of a data slide arrives
  const blockT0 = (first, j) => (j === 0 ? (first ? 0 : 0.15) : 1.0);
  // one data slide at its time lt (dy: the slide's vertical offset)
  function dataLayer(R, P, idx, lt, dy) {
    const { ctx } = R, C = P.C, Z = P.Z, CX = P.CX;
    (P.dataPages[idx] || []).forEach((b, j) => {
      const t0 = blockT0(idx === 0, j);
      if (b.vac) {
        if (lt < t0 + 0.5) return;
        const vk = spring(win(lt, t0 + 0.5, 0.4));
        const vy = b.y + b.rowsN * b.dotStep + 40 + dy;
        ctx.save(); ctx.beginPath(); ctx.rect(0, vy - 40, Z.W, b.L.vh + 90); ctx.clip();
        settled(R, vk, () => K.text(R, b.L, Z.left, vy + (1 - vk) * 120, C.ink, 'center', Z.w, 'vagas'));
        ctx.restore();
        return;
      }
      if (lt < t0) return;
      // the dot opens into the value, which counts up when it is a plain number
      const y = b.y + dy;
      const k = spring(win(lt, t0, 0.45));
      const n = b.count != null ? Math.round(b.count * expoOut(win(lt, t0, 0.7))) : null;
      const counting = n != null && n !== b.count;
      const L = counting ? K.line(null, `${b.hl.prefix}${n}${b.hl.suffix}`, { font: P.F.head, size: b.L.size }) : b.L;
      const s = lerp(0.15, 1, k);
      ctx.save(); ctx.translate(CX, y + b.L.vh / 2); ctx.scale(s, s);
      settled(R, counting ? 0 : k, () => K.text(R, L, -L.w / 2, -b.L.vh / 2, C.ink, 'center', L.w, b.hl.role === 'salary' ? 'salário' : 'destaque'));
      ctx.restore();
      if (b.label && lt >= t0 + 0.5) {
        const py = y + b.L.vh + 40, pk = spring(win(lt, t0 + 0.5, 0.4));
        ctx.save(); ctx.beginPath(); ctx.rect(0, py - 40, Z.W, b.label.vh + 90); ctx.clip();
        settled(R, pk, () => K.text(R, b.label, Z.left, py + (1 - pk) * 100, C.soft, 'center', Z.w, b.hl.role === 'salary' ? 'período' : 'rótulo'));
        ctx.restore();
      }
    });
  }
  // the vacancy dots of a data slide: a grid that fills one by one
  function vacDots(R, P, idx, lt, dy) {
    const { ctx } = R;
    (P.dataPages[idx] || []).forEach((b, j) => {
      if (!b.vac || !b.vacN || (b === P.vacBlock && idx === P.dataPages.length - 1)) return;
      const t0 = blockT0(idx === 0, j);
      for (let i = 0; i < b.vacN; i++) {
        const r = 30 * spring(win(lt, t0 + (i / b.vacN) * 0.4, 0.3));
        if (r > 0.5) { ctx.beginPath(); ctx.arc(dotX(P, b, i), dotY(b, i) + dy, r, 0, Math.PI * 2); ctx.fillStyle = P.C.accent; ctx.fill(); }
      }
    });
  }
  const dotX = (P, b, i) => P.CX + ((i % b.per) - (b.per - 1) / 2) * Math.min(120, (P.Z.w + 40) / b.per);
  const dotY = (b, i) => b.y + Math.floor(i / b.per) * b.dotStep + 40;
  const bulletY = (P, pg, i) => pg.listTop + (pg.title ? pg.title.vh + 80 : 0) + pg.itemY[i] + pg.items[i].capPx / 2;
  // The last slide's vacancy dots: a grid (data), then the first ones become
  // the bullets of the first list slide.
  function dotsLayer(R, P, ltD, toList, dy) {
    const b = P.vacBlock;
    if (!b) return;
    const j = P.dataPages[P.dataPages.length - 1].indexOf(b), t0 = blockT0(P.dataPages.length === 1, j);
    if (ltD < t0) return;
    const { ctx } = R;
    const n = b.vacN, list = P.listPages[0];
    for (let i = 0; i < n; i++) {
      const appear = spring(win(ltD, t0 + (i / n) * 0.4, 0.3));
      const gx = dotX(P, b, i), gy = dotY(b, i);
      let x = gx, y = gy, r = 30 * appear;
      if (list && i < list.items.length) { x = lerp(gx, P.Z.left + 40, toList); y = lerp(gy, bulletY(P, list, i), toList); r = lerp(r, 16, toList); } else r *= 1 - toList;
      y += dy;
      if (r > 0.5) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = P.C.accent; ctx.fill(); }
    }
  }
  const itemAt = (pg, i, first = true) => { const n = pg.items.length; return (first ? 0.1 : 0.4) + Math.min(3, Math.floor((i * 4) / Math.max(4, n))) * (first ? 0.5 : 0.4) + (n > 4 && i === n - 1 ? 0.12 : 0); };
  // one list slide; on the next slides the title stays, the old rows leave to
  // the left and the new ones come in from the right
  function listLayer(R, P, idx, lt, dy, fromDots) {
    const { ctx } = R, C = P.C, Z = P.Z;
    const pg = P.listPages[idx];
    if (!pg) return;
    const first = idx === 0;
    let y = pg.listTop + dy;
    if (pg.title) {
      const k = first ? spring(win(lt, 0, 0.4)) : 1;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y - 40, Z.W, pg.title.vh + 80); ctx.clip();
      settled(R, k, () => K.text(R, pg.title, Z.left, y + (1 - k) * 90, C.ink, 'left', 0, 'título vagas'));
      ctx.restore();
    }
    if (!first && lt < 0.4) {
      const old = P.listPages[idx - 1], out = spring(win(lt, 0, 0.35)) * -(Z.W + 200);
      const oy = old.listTop + (old.title ? old.title.vh + 80 : 0) + dy;
      old.items.forEach((L, i) => {
        settled(R, 0, () => K.text(R, L, Z.left + 100 + out, oy + old.itemY[i], C.soft, 'left', 0, 'vaga'));
        ctx.beginPath(); ctx.arc(Z.left + 40 + out, bulletY(P, old, i) + dy, 16, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
      });
    }
    y += pg.title ? pg.title.vh + 80 : 0;
    const dots = first && fromDots && P.vacBlock ? P.vacBlock.vacN : 0;
    pg.items.forEach((L, i) => {
      const t0 = itemAt(pg, i, first);
      if (lt < t0) return;
      const k = spring(win(lt, t0, 0.4));
      const later = pg.items.some((_, j) => j > i && lt >= itemAt(pg, j, first));
      settled(R, k, () => K.text(R, L, Z.left + 100 + (1 - k) * 700, y + pg.itemY[i], later ? C.soft : C.ink, 'left', 0, 'vaga'));
      // the bullet: the vacancy dot once it has arrived, else its own
      const r = i < dots ? (lt >= 0.5 ? 16 : 0) : 16 * k;
      if (r > 0.5) { ctx.beginPath(); ctx.arc(Z.left + 40 + (1 - k) * (i < dots ? 0 : 700), bulletY(P, pg, i) + dy, r, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill(); }
    });
  }
  const listSpeed = (P, idx, lt) => { const pg = P.listPages[idx]; return pg ? Math.max(idx > 0 ? moveSpeed(lt, 0, 0.35, P.Z.W + 200) : 0, ...pg.items.map((_, i) => moveSpeed(lt, itemAt(pg, i, idx === 0), 0.4, 700))) : 0; };

  // ---------------------------------------------------------------- phone and card
  function lateChat(R, P) {
    const rr = R.rec; R.rec = () => {};
    K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true });
    R.rec = rr;
  }
  const phoneDrop = (P) => P.Z.H - P.phone.y + 60;
  function cardLayer(R, P, lt, fromChat, dy) {
    const { ctx } = R, C = P.C, Cd = P.card, Z = P.Z, CX = P.CX;
    if (!Cd.number) {
      Cd.lines.forEach((L, i) => {
        const k = spring(win(lt, i * 0.3, 0.45));
        if (k <= 0) return;
        const y = Cd.linesY[i] + dy;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y - 40, Z.W, L.vh + 90); ctx.clip();
        settled(R, k, () => K.text(R, L, Z.left, y + (1 - k) * (L.vh + 60), C.ink, 'center', Z.w, Cd.tags[i]));
        ctx.restore();
      });
      return;
    }
    const ph = P.phone, ck = P.chat.k;
    const e = fromChat ? spring(win(lt, 0, 0.5)) : 1;
    // the number: it grows out of the chat header, or rises in place
    if (fromChat) {
      const s = lerp(Math.max(40, 42 * ck) / Cd.number.size, 1, e);
      ctx.save();
      ctx.translate(lerp(ph.x + 170 * ck, CX - Cd.number.w / 2, e), lerp(ph.y + P.chat.head / 2 + 16 * ck, Cd.numberY, e) + dy); ctx.scale(s, s);
      K.text(R, Cd.number, 0, 0, C.ink, 'left', 0, 'número');
      ctx.restore();
    } else {
      const nk = spring(win(lt, 0, 0.45));
      ctx.save(); ctx.beginPath(); ctx.rect(0, Cd.numberY - 30 + dy, Z.W, Cd.number.vh + 60); ctx.clip();
      settled(R, nk, () => K.text(R, Cd.number, CX - Cd.number.w / 2, Cd.numberY + (1 - nk) * (Cd.number.vh + 40) + dy, C.ink, 'left', 0, 'número'));
      ctx.restore();
    }
    // the button: the sent bubble becomes it, or it grows from its centre
    const fin = { x: CX - Cd.pill.w / 2, y: Cd.pillY, w: Cd.pill.w, h: Cd.pill.h, r: Cd.pill.h / 2 };
    const g = fromChat ? 1 : spring(win(lt, 0.15, 0.45));
    const r = fromChat ? K.rectLerp(P.chat.bubble, fin, e) : { ...fin, x: CX - (fin.w * g) / 2, w: fin.w * g };
    if (r.w > 4) {
      const press = lt >= 1.5 && lt < 1.75 ? 1 - 0.035 * (1 - expoOut(win(lt, 1.5, 0.25))) : 1;
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + dy); ctx.scale(press, press); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.fillStyle = C.cta; ctx.fill();
      ctx.save(); rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.clip();
      if (fromChat) { const mo = expoOut(win(lt, 0, 0.2)); if (mo < 1) P.chat.msg.draw(ctx, r.x + 40 * ck, r.y + 34 * ck + mo * r.h, C.ctaInk, 'left', 0); }
      if (lt >= 0.2) {
        const ck2 = spring(win(lt, 0.2, 0.35)), ty = r.y + (r.h - Cd.cta.vh) / 2 - (1 - ck2) * r.h;
        E.drawIcon(ctx, 'message-circle', r.x + 80, ty + Cd.cta.vh / 2, 66, C.ctaInk, 2.6);
        settled(R, ck2 * g, () => K.text(R, Cd.cta, r.x + 146, ty, C.ctaInk, 'left', 0, 'botão'));
      }
      ctx.restore();
      ctx.restore();
    }
    // the QR grows from its centre, then the hint
    if (Cd.qr && lt >= 0.5) {
      const q = spring(win(lt, 0.5, 0.45));
      if (q > 0.01) {
        ctx.save(); ctx.translate(CX, Cd.qrY + Cd.qr / 2 + dy); ctx.scale(q, q);
        ctx.drawImage(K.qrSprite(P.content.contact.link, Cd.qr, { dark: '#0D0D0D', light: C.qrLight, radius: 28 }), -Cd.qr / 2, -Cd.qr / 2, Cd.qr, Cd.qr);
        ctx.restore();
      }
    }
    if (Cd.qr && lt >= 1.0) {
      const hk = spring(win(lt, 1.0, 0.4));
      ctx.save(); ctx.beginPath(); ctx.rect(0, Cd.hintY - 40 + dy, Z.W, Cd.hint.vh + 90); ctx.clip();
      settled(R, hk, () => K.text(R, Cd.hint, CX - Cd.hint.w / 2, Cd.hintY + (1 - hk) * 90 + dy, C.soft, 'left', 0, 'aponta'));
      ctx.restore();
    }
  }
  // the first word, back where the video starts (it follows the card down by `away`)
  function firstWord(R, P, s, away) {
    if (s <= 0) return;
    if (P.simple) { const L = P.full.L; lineAt(R, P, L, 0, lineX(P, L, 0), P.hy - (1 - s) * away); return; }
    const k0 = P.k0.find((x) => x.id === 0);
    drawWord(R, P, 0, { x: k0.x, top: k0.top - (1 - s) * away, size: k0.size, color: P.C.ink });
  }

  // ---------------------------------------------------------------- the acts
  const acts = {
    H(R, A) {
      const { P } = R, t = A.start + A.lt;
      K.blurred(R, wordsSpeed(P, t), (g, d) => headScene(R, P, t - d), null);
    },
    M(R, A) {
      const { P } = R, t = A.start + A.lt;
      const v = Math.max(wordsSpeed(P, t), moveSpeed(A.lt, 0, 0.4, -P.OFF_UP), ...P.cardKeys.map((k) => trackSpeed(k, t)), cardsSpeed(P, A.lt));
      K.blurred(R, v, (g, d) => { headScene(R, P, t - d); cardsLayer(R, P, A.lt - d); }, null);
    },
    V(R, A) {
      const { P } = R, t = A.start + A.lt;
      K.blurred(R, carouselSpeed(P, A.lt), (g, d) => { headScene(R, P, t - d); carousel(R, P, A.lt - d); }, null);
    },
    D(R, A) {
      const { P } = R, t = A.start + A.lt;
      const pg = K.page(A), last = pg.index === P.dataPages.length - 1;
      // a next slide glides up into place as the one before leaves upwards
      const v = Math.max(A.bespoke && pg.first ? wordsSpeed(P, t) : 0, moveSpeed(pg.lt, blockT0(pg.first, 0), 0.45, 300), pg.first ? 0 : moveSpeed(pg.lt, 0, 0.45, P.Z.H));
      const moving = R.moving;
      if (!pg.first && pg.lt < 0.45) R.moving = true;
      K.blurred(R, v, (g, d) => {
        const l = pg.lt - d;
        if (A.bespoke && pg.first && l < 0.5) headScene(R, P, t - d);
        let dy = 0;
        if (!pg.first) {
          const e = spring(win(l, 0, 0.45));
          dy = (1 - e) * P.Z.H;
          if (e < 1) { const up = e * P.OFF_UP; quietly(R, () => { dataLayer(R, P, pg.index - 1, 9, up); vacDots(R, P, pg.index - 1, 9, up); }); }
        }
        dataLayer(R, P, pg.index, l, dy);
        vacDots(R, P, pg.index, l, dy);
        if (last) dotsLayer(R, P, l, 0, dy);
      }, null);
      R.moving = moving;
    },
    L(R, A) {
      const { P } = R, Da = P.act('D');
      const pg = K.page(A), bespoke = A.bespoke && pg.first;
      const lastD = P.dataPages.length - 1, ltD = Da ? Da.d - lastD * 2 : 0;
      const v = Math.max(listSpeed(P, pg.index, pg.lt), bespoke ? Math.max(moveSpeed(pg.lt, 0, 0.45, -P.OFF_UP), moveSpeed(pg.lt, 0, 0.5, 600)) : 0);
      K.blurred(R, v, (g, d) => {
        const l = pg.lt - d;
        if (bespoke) {
          const up = spring(win(l, 0, 0.45)) * P.OFF_UP;
          if (up > P.OFF_UP + 1) { dataLayer(R, P, lastD, ltD, up); vacDots(R, P, lastD, ltD, up); }
          if (l < 0.5) dotsLayer(R, P, ltD, spring(win(l, 0, 0.5)), 0);
        }
        listLayer(R, P, pg.index, l, 0, bespoke);
      }, null);
    },
    C(R, A) {
      const { P } = R, La = P.act('L');
      const v = A.bespoke ? Math.max(moveSpeed(A.lt, 0, 0.4, -P.OFF_UP), moveSpeed(A.lt, 0, 0.5, phoneDrop(P))) : 0;
      K.blurred(R, v, (g, d) => {
        const l = A.lt - d;
        if (A.bespoke) {
          const leave = spring(win(l, 0, 0.4)) * P.OFF_UP;
          const lastL = P.listPages.length - 1;
          if (leave > P.OFF_UP + 1) listLayer(R, P, lastL, La.d - lastL * 2, leave, La.bespoke && lastL === 0);
        }
        const up = A.bespoke ? spring(win(l, 0, 0.5)) : 1;
        R.ctx.save(); R.ctx.translate(0, (1 - up) * phoneDrop(P));
        K.chatDraw(R, P.chat, l, { type0: 0.55, type1: 1.3, send: 1.36 });
        R.ctx.restore();
      }, null);
    },
    K(R, A) {
      const { P } = R;
      const fromChat = A.bespoke && !!P.card.number;
      const v = fromChat ? Math.max(moveSpeed(A.lt, 0, 0.45, phoneDrop(P)), moveSpeed(A.lt, 0, 0.5, 800)) : moveSpeed(A.lt, 0, 0.45, 200);
      K.blurred(R, v, (g, d) => {
        const l = A.lt - d;
        if (fromChat) {
          const down = spring(win(l, 0, 0.45));
          if (down < 1) { R.ctx.save(); R.ctx.translate(0, down * phoneDrop(P)); lateChat(R, P); R.ctx.restore(); }
        }
        cardLayer(R, P, l, fromChat, 0);
      }, null);
    },
    O(R, A) {
      const { P } = R, Ka = P.act('K');
      const away = P.Z.H + 200, fromChat = Ka.bespoke && !!P.card.number;
      // one move down: the card leaves at the bottom, the first word comes in from the top
      const v = moveSpeed(A.lt, 0, LOOP, away);
      K.blurred(R, v, (g, d) => {
        const s = spring(win(A.lt - d, 0, LOOP));
        if (s * away < away - 100) cardLayer(R, P, Ka.d, fromChat, s * away);
        firstWord(R, P, s, away);
      }, null);
    },
  };

  // ---------------------------------------------------------------- sound: a clean keynote
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K'), O = P.act('O');
    const riserFrom = Math.max(0, Ka.start - 2);
    const roots = [65.41, 55, 43.65, 49];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 95, f1: 42, drop: 0.18, dur: 0.42, gain: 0.8 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 7000, dur: 0.05, gain: 0.05, attack: 0.01 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: roots[Math.floor(b / 4) % 4], wave: 'sine', dur: 0.45, gain: 0.3 });
    }
    // a soft chord on every slide change
    for (const t of P.timeline.cuts) for (const hz of [261.6, 329.6, 392]) ev.push({ t, kind: 'tone', hz, wave: 'triangle', dur: 0.6, gain: 0.1, lp: 2400 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 300, f1: 4000, gain: 0.18 });
    // a soft click on every magic move
    const clicks = [0.02, 0.52, 1.02, 1.52, Ka.start, Ka.start + 0.5, Ka.start + 1.0, O.start];
    const M = P.act('M'); if (M) P.cardPages.forEach((list, p) => list.forEach((_, j) => clicks.push(M.start + p * 2 + (p ? 0.4 + j * 0.15 : j * 0.5))));
    const V = P.act('V'); if (V) clicks.push(V.start, V.start + 0.5, V.start + 1.0, V.start + 1.5);
    const D = P.act('D'); if (D) P.dataPages.forEach((_, p) => clicks.push(D.start + p * 2, D.start + p * 2 + 0.5, D.start + p * 2 + 1.0, D.start + p * 2 + 1.5));
    const L = P.act('L'); if (L) P.listPages.forEach((pg, p) => pg.items.forEach((_, i) => clicks.push(L.start + p * 2 + itemAt(pg, i, p === 0))));
    // a soft chord on every new slide too
    for (const a of P.acts) if (a.pages) for (let p = 1; p < a.pages.length; p++) for (const hz of [261.6, 329.6, 392]) ev.push({ t: a.start + p * 2, kind: 'tone', hz, wave: 'triangle', dur: 0.5, gain: 0.07, lp: 2400 });
    for (const t0 of clicks) ev.push({ t: t0, kind: 'tone', hz: 2400, hz1: 1800, wave: 'sine', dur: 0.03, gain: 0.08 });
    const C = P.act('C');
    if (C) {
      for (let t = 0.55; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.06 });
      ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  RS.motion.register({
    id: 'apresentacao', name: 'Apresentação', concept: 'Um diapositivo, uma ideia: a obra apresentada como um lançamento.',
    font: { head: { family: 'Montserrat', weight: 800 }, bold: { family: 'Montserrat', weight: 700 } },
    palettes: {
      light: { bg: '#FFFFFF', ink: '#0D0D0D', main: '#0D0D0D', accent: '#E8470C' },
      dark: { bg: '#0D0D0D', ink: '#FFFFFF', main: '#FFFFFF', accent: '#FF6A2B' },
    },
    // 10–30 s: benefits, highlights and positions in slides; each next slide is the model's own move
    bgModes: ['light', 'dark'], photos: 0, travel: 'glide', needs: { V: ['M'] }, pages: true, pageMove: true,
    colors(c) {
      const dark = U.isDark(c.bg);
      const inkOn = (fill) => (U.contrast(fill, '#FFFFFF') >= 3 ? '#FFFFFF' : '#111111');
      c.soft = U.ensureContrast(U.mix(c.ink, c.bg, 0.42), c.bg, 4.5);
      c.accentText = U.ensureContrast(c.accent, c.bg, 4.5);
      c.cardA = c.accent; c.cardAInk = inkOn(c.cardA);
      c.cardB = U.contrast(c.main, c.bg) >= 1.5 ? c.main : c.ink; c.cardBInk = inkOn(c.cardB);
      c.phoneHead = U.isDark(c.main) ? c.main : '#0D0D0D';
      c.qrLight = dark ? '#FFFFFF' : U.mix(c.bg, '#000000', 0.06);
      return c;
    },
    prepare,
    acts,
    sound,
  });
})();
