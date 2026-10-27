// Video recipe «Partidas»: an airport departures board — every line of the ad
// flips in letter by letter on split-flap cells; boarding is WhatsApp.
// Camera language: a fixed board; rows flip (each cell turns through a few
// letters to its own); the board folds over between acts and pages; the card
// is a boarding pass with the QR. Acts (see RS.motion.register): H the board
// (header, kicker, headline); I and F his lines; M the benefits (numbered
// rows); V the company on big flaps, the board turning in 3D; D the
// highlights (values on big flaps, as written); L the positions; C the gate
// row over the phone; K the boarding pass; O the pass folds away into the
// empty board, the first frame. 10–30 s: M, D and L a page at a time.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, expoIn, rrect } = K;
  const FLIP = 0.05; // seconds per flip
  const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVZ0123456789';
  const FLAP = '#1B1D22', HAIR = '#0B0C0F', PASS = '#F5F5F0', PASS_INK = '#0E0F12';

  // ---------------------------------------------------------------- rows of flaps
  // Text → rows of at most `cols` characters (a word longer than a row is split, never cut).
  function wrap(text, cols) {
    const out = [];
    let cur = '';
    for (const w of String(text).split(/\s+/).filter(Boolean)) {
      const ch = [...w];
      if (ch.length > cols) {
        if (cur) { out.push(cur); cur = ''; }
        for (let i = 0; i < ch.length; i += cols) { const part = ch.slice(i, i + cols).join(''); if (i + cols >= ch.length) cur = part; else out.push(part); }
        continue;
      }
      const next = cur ? `${cur} ${w}` : w;
      if ([...next].length <= cols) cur = next; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  }
  const upper = (P, s) => String(s || '').toLocaleUpperCase(P.locale);
  const seedOf = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) % 9973; return h; };
  // A row of `cols` flaps across the zone; segs = [{ col, text, color, tag }]; fill: every flap in that colour.
  function row(P, cols, segs, fill) {
    const cw = P.Z.w / cols, L = K.line(P, 'A', { font: P.F.head, size: cw * 1.1 });
    const cells = Array.from({ length: cols }, (_, j) => ({ col: j, ch: ' ', color: P.C.ink, flap: fill || FLAP }));
    const key = segs.map((s) => s.text).join('|');
    for (const s of segs) [...s.text].forEach((c, i) => {
      const cell = cells[s.col + i];
      if (!cell) return;
      const n = 4 + ((seedOf(key) + s.col + i) % 5);
      cell.ch = c; cell.color = s.color; cell.n = n;
      cell.seq = [' ', ...Array.from({ length: n - 1 }, (_, k) => LETTERS[(seedOf(key) * 7 + (s.col + i) * 13 + k * 5) % LETTERS.length]), c];
    });
    return { cols, cw, ch: Math.round(cw * 1.36), L, cells, segs };
  }
  // the rows of a text: wrapped; the first may carry an index (in the highlight colour)
  function textRows(P, text, cols, o) {
    const at = o.index ? [...o.index].length + 1 : 0;
    const t = upper(P, text);
    const rows = wrap(t, cols - at).map((ln, i) => row(P, cols, [
      ...(i === 0 && o.index ? [{ col: 0, text: o.index, color: P.C.main, tag: null }] : []),
      { col: at, text: ln, color: o.color, tag: o.tag },
    ], o.fill));
    // a word longer than a row: the screen tries smaller flaps first
    if (rows.length && t.split(/\s+/).some((w) => [...w].length > cols - at)) rows[0].split = true;
    return rows;
  }
  // groups of rows stacked in the middle of the zone; more columns (smaller
  // flaps, never under 40 px) when they do not fit
  function screen(P, build) {
    const Z = P.Z;
    for (let k = 1; ; k *= 1.12) {
      const groups = build((cols) => Math.min(25, Math.round(cols * k))).filter((g) => g.length);
      const h = groups.reduce((a, g) => a + g.reduce((b, r) => b + r.ch, 0) + 10 * (g.length - 1), 0) + 34 * Math.max(0, groups.length - 1);
      const split = groups.some((g) => g.some((r) => r.split));
      if ((h <= Z.cH * 0.97 && !split) || k > 2.6) {
        let y = Z.cy - h / 2;
        const rows = [];
        groups.forEach((g) => { for (const r of g) { r.y = y; y += r.ch + 10; rows.push(r); } y += 24; });
        return { rows, h, top: Z.cy - h / 2 };
      }
    }
  }

  // ---------------------------------------------------------------- drawing flaps
  const gw = (L, g) => { if (!L.gw) L.gw = new Map(); if (!L.gw.has(g)) L.gw.set(g, K.textWidth(g, L)); return L.gw.get(g); };
  function glyph(ctx, L, g, x, y, w, h, color) {
    if (g && g !== ' ') K.fillText(ctx, g, x + (w - gw(L, g)) / 2, y + h / 2 + L.capPx / 2, L, color);
  }
  // One split-flap cell turning from a to b (f: 0 → 1): the top flap falls
  // (a's top half folding down), then b's bottom half unfolds.
  function cell(ctx, L, x, y, w, h, a, b, f, color, flap) {
    rrect(ctx, x, y, w, h, 6); ctx.fillStyle = flap; ctx.fill();
    const mid = y + h / 2;
    const half = (top, draw) => { ctx.save(); ctx.beginPath(); ctx.rect(x, top ? y : mid, w, h / 2); ctx.clip(); draw(); ctx.restore(); };
    if (f <= 0 || a === b) glyph(ctx, L, b, x, y, w, h, color);
    else {
      half(true, () => glyph(ctx, L, b, x, y, w, h, color));
      half(false, () => glyph(ctx, L, a, x, y, w, h, color));
      const s = f < 0.5 ? 1 - f * 2 : f * 2 - 1, top = f < 0.5;
      half(top, () => {
        ctx.translate(0, mid); ctx.scale(1, Math.max(0.02, s)); ctx.translate(0, -mid);
        ctx.fillStyle = flap; ctx.fillRect(x, top ? y : mid, w, h / 2);
        glyph(ctx, L, top ? a : b, x, y, w, h, color);
      });
    }
    ctx.fillStyle = HAIR; ctx.fillRect(x, mid - 1.5, w, 3);
  }
  // A row at lt (from its own start): every cell flips 4–8 times, left to
  // right; the row's texts count as shown once its last flap has stopped.
  function drawRow(R, r, lt) {
    const { ctx } = R, x0 = R.P.Z.left;
    let end = 0;
    for (const c of r.cells) {
      const x = x0 + c.col * r.cw + 2, w = r.cw - 4;
      if (c.ch === ' ') { cell(ctx, r.L, x, r.y, w, r.ch, ' ', ' ', 0, c.color, c.flap); continue; }
      const start = c.col * 0.025, tau = (lt - start) / FLIP;
      end = Math.max(end, start + c.n * FLIP);
      if (tau >= c.n) cell(ctx, r.L, x, r.y, w, r.ch, c.ch, c.ch, 0, c.color, c.flap);
      else if (tau <= 0) cell(ctx, r.L, x, r.y, w, r.ch, ' ', ' ', 0, c.color, c.flap);
      else { const s = Math.floor(tau); cell(ctx, r.L, x, r.y, w, r.ch, c.seq[s], c.seq[s + 1], tau - s, c.color, c.flap); }
    }
    if (lt >= end) for (const s of r.segs) if (s.tag) R.rec(x0 + s.col * r.cw, r.y + (r.ch - r.L.capPx) / 2, [...s.text].length * r.cw, r.L.capPx, s.tag, s.text);
  }
  // A screen of rows: row i starts `step` after the one before (base: when the first starts).
  const stepOf = (S) => Math.min(0.2, 1.0 / Math.max(1, S.rows.length));
  function drawScreen(R, S, lt, base) {
    const step = stepOf(S);
    S.rows.forEach((r, i) => drawRow(R, r, lt - base - i * step));
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    const head = (text, cols) => textRows(P, text, cols, { color: C.boardInk, tag: 'quadro', fill: C.main });
    // H: the board's header, the kicker, the headline on bigger flaps
    P.Hs = screen(P, (k) => {
      const big = textRows(P, c.headline || c.brandName || ' ', k(8), { color: C.ink, tag: 'título' });
      return [head(P.label('board'), k(12)), c.kicker ? textRows(P, c.kicker, k(12), { color: C.main, tag: 'chamada' }) : [], big.length <= 5 ? big : textRows(P, c.headline || c.brandName || ' ', k(12), { color: C.ink, tag: 'título' })];
    });
    // I, F: his lines
    P.Is = c.intro && P.act('I') ? screen(P, (k) => [textRows(P, c.intro, k(12), { color: C.ink, tag: 'intro' })]) : null;
    P.Fs = c.closing && P.act('F') ? screen(P, (k) => [textRows(P, c.closing, k(12), { color: C.ink, tag: 'fecho' })]) : null;
    // M: a page of benefits under the column's header, numbered
    P.Ms = (Ma ? Ma.pages : []).map((items) => screen(P, (k) => [head(P.label('benefit'), k(12)), ...items.map((i) => textRows(P, c.benefits[i], k(12), { color: C.ink, tag: 'vantagem', index: String(i + 1).padStart(2, '0') }))]));
    // D: a page of highlights, each value on big flaps (as written), its label under it
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    P.Ds = (Da ? Da.pages : []).map((items) => screen(P, (k) => items.map((i) => {
      const h = c.highlights[i];
      return [...textRows(P, h.value || h.label, k(10), { color: C.main, tag: tagOf(h) }), ...(h.value && h.label ? textRows(P, h.label, k(12), { color: C.ink, tag: h.role === 'salary' ? 'período' : 'rótulo' }) : [])];
    })));
    // L: a page of positions under the title (or the board's «function» column)
    P.Ls = (La ? La.pages : []).map((items) => screen(P, (k) => [head(c.positionsTitle || P.label('role'), k(12)), ...items.map((i) => textRows(P, c.positions[i], k(12), { color: C.ink, tag: 'vaga' }))]));
    // V: the company (else the headline) on big flaps
    P.Vs = screen(P, (k) => [textRows(P, c.brandName || c.headline || ' ', k(7), { color: C.main, tag: c.brandName ? 'marca' : 'título' })]);

    // C: the gate row over the phone
    const gate = screen(P, (k) => [head(P.label('gate'), k(12))]);
    P.gate = gate.rows[0];
    P.gate.y = Z.top + 4;
    const phTop = P.gate.y + P.gate.ch + 30, ph = Math.min(1180, Z.bottom - phTop - 4), pw = Math.min(820, Z.w);
    P.phone = { x: Z.W / 2 - pw / 2, y: phTop, w: pw, h: ph };
    P.chat = K.chatLayout(P, { ...P.phone, font: P.F.bold, fontStrong: P.F.head, radius: (64 * pw) / 820,
      colors: { screen: '#15171C', head: '#0B0C0F', headInk: '#FFFFFF', field: '#262931', fieldInk: '#FFFFFF', bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk, frame: C.main } });

    // K: the boarding pass — a stub with its title, the perforation, the card
    const passHead = K.fit(P, upper(P, P.label('pass')), { font: P.F.head, maxSize: 60, minSize: 40, maxW: Z.w - 60, maxLines: 2, lh: 1.1 });
    const head0 = passHead.vh + 70;
    const probe = K.cardLayout(P, { font: P.F.head, bold: P.F.bold, upper: P.upper, maxW: Z.w - 100, maxH: Z.cH - head0 - 150 });
    const passH = head0 + 50 + probe.h + 70;
    const passY = Z.cy - passH / 2;
    P.pass = { x: Z.left - 20, y: passY, w: Z.w + 40, h: passH, head: head0, title: passHead };
    P.card = K.cardLayout(P, { font: P.F.head, bold: P.F.bold, upper: P.upper, maxW: Z.w - 100, maxH: Z.cH - head0 - 150, cy: passY + head0 + 50 + probe.h / 2 });
  }

  // ---------------------------------------------------------------- the acts
  // a page's screen: the first page starts at once; the next ones once the board has folded over
  const paged = (screens) => (R, A) => { const pg = K.page(A); const S = screens(R.P)[pg.index]; if (S) drawScreen(R, S, pg.lt, pg.first ? 0.05 : 0.3); };
  // the board turning in 3D (V): the whole screen leans away and back on a vertical axis
  function turning(R, P, A) {
    const { ctx } = R, Z = P.Z, lt = A.lt;
    const a = 0.42 * Math.sin(Math.PI * win(lt, 0.2, 1.6));
    const moving = R.moving;
    if (Math.abs(a) > 0.01) R.moving = true;
    ctx.save();
    ctx.translate(Z.W / 2, Z.cy); ctx.transform(Math.cos(a), Math.sin(a) * 0.18, 0, 1, 0, 0); ctx.translate(-Z.W / 2, -Z.cy);
    drawScreen(R, P.Vs, lt, 0.05);
    ctx.restore();
    R.moving = moving;
  }
  // a frame folding shut (k 0 → 1) about its middle
  function fold(R, P, k, draw) {
    if (k >= 1) return;
    const { ctx } = R, cy = P.Z.cy;
    const moving = R.moving; R.moving = true;
    ctx.save(); ctx.translate(0, cy); ctx.scale(1, Math.max(0.001, 1 - k)); ctx.translate(0, -cy); draw(); ctx.restore();
    R.moving = moving;
  }
  function chatAct(R, P, A) {
    drawRow(R, P.gate, A.lt - 0.05);
    K.chatDraw(R, P.chat, A.lt, { type0: 0.55, type1: 1.3, send: 1.36 });
  }
  // the boarding pass at lt (unfold 0 → 1 from its middle)
  function pass(R, P, lt, open, start) {
    const { ctx } = R, S = P.pass;
    const moving = R.moving;
    if (open < 1) R.moving = true;
    ctx.save();
    const cy = S.y + S.h / 2;
    ctx.translate(0, cy); ctx.scale(1, Math.max(0.001, open)); ctx.translate(0, -cy);
    rrect(ctx, S.x, S.y, S.w, S.h, 36); ctx.fillStyle = PASS; ctx.fill();
    // the stub: its title on the highlight colour
    ctx.save(); rrect(ctx, S.x, S.y, S.w, S.h, 36); ctx.clip();
    ctx.fillStyle = P.C.main; ctx.fillRect(S.x, S.y, S.w, S.head);
    ctx.restore();
    K.text(R, S.title, S.x + 40, S.y + (S.head - S.title.vh) / 2, P.C.boardInk, 'center', S.w - 80, 'cartão');
    // the perforation: a dashed line between two notches
    const py = S.y + S.head;
    ctx.fillStyle = P.C.bg;
    for (const nx of [S.x, S.x + S.w]) { ctx.beginPath(); ctx.arc(nx, py, 22, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#B9B6AC'; ctx.lineWidth = 4; ctx.setLineDash([14, 12]);
    ctx.beginPath(); ctx.moveTo(S.x + 34, py); ctx.lineTo(S.x + S.w - 34, py); ctx.stroke(); ctx.setLineDash([]);
    K.cardDraw(R, P.card, lt, { ink: PASS_INK, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: PASS_INK, qrDark: PASS_INK, qrLight: '#FFFFFF', start });
    ctx.restore();
    R.moving = moving;
  }
  // K: the phone folds shut, the pass unfolds; its parts rise
  function card(R, P, A) {
    const lt = A.lt;
    if (A.bespoke && lt < 0.3) fold(R, P, expoIn(win(lt, 0, 0.28)), () => { const rr = R.rec; R.rec = () => {}; K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true }); R.rec = rr; });
    const open = A.bespoke ? expoOut(win(lt, 0.25, 0.3)) : 1;
    if (open > 0) pass(R, P, lt, open, A.bespoke ? 0.45 : 0.15);
  }
  // O: the pass folds shut; the empty board unfolds — the first frame
  function loop(R, P, A) {
    const lt = A.lt, Ka = P.act('K');
    if (lt < 0.36) fold(R, P, expoIn(win(lt, 0, 0.34)), () => pass(R, P, Ka.d, 1, Ka.bespoke ? 0.45 : 0.15));
    else {
      const open = expoOut(win(lt, 0.36, 0.4));
      const { ctx } = R, cy = P.Z.cy;
      const moving = R.moving; if (open < 1) R.moving = true;
      ctx.save(); ctx.translate(0, cy); ctx.scale(1, Math.max(0.001, open)); ctx.translate(0, -cy);
      drawScreen(R, P.Hs, -1, 0);
      ctx.restore();
      R.moving = moving;
    }
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const bass = [49, 49, 65.41, 55];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 130, f1: 44, dur: 0.32, gain: 0.85 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 8500, dur: 0.03, gain: 0.06 });
      if (t < riserFrom || t >= Ka.start) ev.push({ t, kind: 'tone', hz: bass[Math.floor(b / 4) % 4], wave: 'triangle', dur: 0.42, gain: 0.3, lp: 520 });
    }
    // the board folding over (every act change and every new page); a riser into the pass
    const turns = P.acts.filter((a) => a.pages).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...turns]) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 1100, dur: 0.26, gain: 0.34 }, { t, kind: 'tone', hz: 110, hz1: 55, wave: 'triangle', dur: 0.3, gain: 0.3 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 300, f1: 5000, gain: 0.22 });
    // the flaps: a clatter of clicks as every row turns
    const clatter = (S, t0) => {
      if (!S) return;
      const step = stepOf(S);
      S.rows.forEach((r, i) => { for (let k = 0; k < 6; k++) ev.push({ t: t0 + i * step + k * 0.045, kind: 'noise', filter: 'bandpass', f: 2600 + (k % 3) * 500, q: 5, dur: 0.012, gain: 0.07 }); });
    };
    clatter(P.Hs, 0.05);
    const at = (k) => P.act(k);
    if (at('I')) clatter(P.Is, at('I').start + 0.05);
    if (at('F')) clatter(P.Fs, at('F').start + 0.05);
    if (at('V')) clatter(P.Vs, at('V').start + 0.05);
    for (const [k, list] of [['M', P.Ms], ['D', P.Ds], ['L', P.Ls]]) if (at(k)) list.forEach((S, p) => clatter(S, at(k).start + p * 2 + (p ? 0.3 : 0.05)));
    const C = at('C');
    if (C) {
      for (let t = 0.55; t < 1.3; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.36, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    // the boarding chime on the pass
    ev.push({ t: Ka.start + 0.3, kind: 'tone', hz: 659.3, wave: 'sine', dur: 0.35, gain: 0.16 }, { t: Ka.start + 0.62, kind: 'tone', hz: 523.3, wave: 'sine', dur: 0.5, gain: 0.16 });
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  const L7 = (pt, de, fr, it, en, es) => ({ 'pt-PT': pt, 'de-CH': de, 'de-DE': de, fr, it, en, es });
  RS.motion.register({
    id: 'partidas', name: 'Partidas', concept: 'Um painel de partidas: cada linha do anúncio vira letra a letra; o embarque é no WhatsApp.',
    font: { head: { family: 'Barlow Condensed', weight: 700 }, bold: { family: 'Barlow Condensed', weight: 700 } },
    palettes: { dark: { bg: '#0E0F12', ink: '#F5F5F0', main: '#FFD23F', accent: '#FFD23F' } },
    bgModes: ['dark'], photos: 0, travel: 'flip', pages: true,
    labels: {
      board: L7('PARTIDAS', 'ABFAHRT', 'DÉPARTS', 'PARTENZE', 'DEPARTURES', 'SALIDAS'),
      benefit: L7('VANTAGEM', 'VORTEIL', 'AVANTAGE', 'VANTAGGIO', 'BENEFIT', 'VENTAJA'),
      role: L7('FUNÇÃO', 'FUNKTION', 'POSTE', 'RUOLO', 'ROLE', 'PUESTO'),
      gate: L7('EMBARQUE', 'EINSTIEG', 'EMBARQUEMENT', 'IMBARCO', 'BOARDING', 'EMBARQUE'),
      pass: L7('CARTÃO DE EMBARQUE', 'BORDKARTE', "CARTE D'EMBARQUEMENT", "CARTA D'IMBARCO", 'BOARDING PASS', 'TARJETA DE EMBARQUE'),
    },
    colors(c) {
      if (c.accentPicked) c.main = c.accent;
      c.main = U.ensureContrast(c.main, c.bg, 4.5);
      c.boardInk = U.ensureContrast('#0E0F12', c.main, 4.5);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => drawScreen(R, R.P.Hs, A.lt, 0.05),
      I: (R, A) => R.P.Is && drawScreen(R, R.P.Is, A.lt, 0.05),
      M: paged((P) => P.Ms),
      V: (R, A) => turning(R, R.P, A),
      D: paged((P) => P.Ds),
      L: paged((P) => P.Ls),
      F: (R, A) => R.P.Fs && drawScreen(R, R.P.Fs, A.lt, 0.05),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => card(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
