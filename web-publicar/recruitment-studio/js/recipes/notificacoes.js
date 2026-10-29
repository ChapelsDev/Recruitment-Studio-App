// Video recipe «Notificações»: a phone's lock screen at 07:00 — every piece
// of the ad arrives as a notification; WhatsApp's opens the chat. Camera
// language: the phone is the frame (the wallpaper is a trade photo, darkened;
// the clock stays at the top); notifications slide up and stack, are swiped
// away, and one push goes into the WhatsApp notification. One continuous
// screen: every act takes over from the one before. Acts (see
// RS.motion.register): H the headline's notification; I and F his lines; M
// the benefits; V they gather into a stack that tilts back; D the
// highlights; L the positions; C WhatsApp's notification opens the chat; K
// the card on the wallpaper; O the card slides away, the clock comes back —
// the first frame. 10–30 s: M, D and L a page at a time.
(() => {
  const K = RS.motionKit, E = RS.engine, U = RS.util;
  const { win, expoOut, expoIn, expoInOut, spring, lerp, rrect } = K;
  const CARD = '#FFFFFF', CARD_INK = '#10141C', CARD_SOFT = '#5B6472', RADIUS = 44, PAD = 40, ICON = 96;

  // ---------------------------------------------------------------- the lock screen
  function wallpaper(R, P) {
    const { ctx } = R, img = P.photos[0];
    if (!img) {
      // a carousel without a photo: the ad's trade drawing in the lower screen,
      // faint behind the notifications (the video keeps its plain screen)
      const card = P.act('K');
      if (P.piece === 'carousel' && RS.carouselArt && !(card && R.t >= card.start)) { // the contact card stays clear
        const W = P.fmt.w, H = P.fmt.h, size = Math.min(W, H * 0.62);
        ctx.save(); ctx.globalAlpha = 0.4;
        RS.carouselArt.draw(ctx, { x: (W - size) / 2, y: H - size - H * 0.04, w: size, h: size, ink: P.C.ink, accent: P.C.accent, paper: P.C.bg,
          seed: (P.project.trades || [])[0] || 'obras', mode: 'line', trade: (P.project.trades || [])[0] || 'obras' });
        ctx.restore();
      }
      return; // else the background colour, drawn by the framework
    }
    ctx.save(); K.screenPhoto(ctx, img, P.fmt, R.t, P.timeline.duration, 0, P.focusOf(img)); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, P.fmt.w, P.fmt.h);
  }
  // the clock at the top (dy: on its way in from above)
  function clock(R, P, dy = 0) {
    const moving = R.moving; if (dy) R.moving = true;
    K.text(R, P.clock, P.Z.left, P.clockY + dy, P.C.ink, 'center', P.Z.w, 'relógio');
    R.moving = moving;
  }

  // ---------------------------------------------------------------- notifications
  // A notification: an app icon, a header line (his words), «agora», the title
  // (and a label under a value).
  // compact (a dense page): the icon beside the title, no header line.
  function note(P, o, compact) {
    const F = P.F, w = P.Z.w + 40;
    const head = o.head && !compact ? K.fit(P, o.head, { font: F.bold, maxSize: 44, minSize: 40, maxW: w - PAD * 2 - ICON - 24 - P.now.w - 24, maxLines: 2, lh: 1.1 }) : null;
    const tw = compact ? w - PAD * 2 - 64 - 24 : w - PAD * 2;
    const title = K.fit(P, o.title, { font: F.head, maxSize: Math.max(44, o.size || 58), minSize: 44, maxW: tw, maxLines: o.lines || 4, lh: 1.12 });
    const label = o.label ? K.fit(P, o.label, { font: F.bold, maxSize: 54, minSize: 40, maxW: tw, maxLines: 2, lh: 1.1 }) : null;
    const body = title.vh + (label ? 16 + label.vh : 0);
    const headH = compact ? 0 : Math.max(ICON, head ? head.vh : 0);
    const h = compact ? PAD + Math.max(64, body) + PAD : PAD + headH + 24 + body + PAD;
    return { w, h, head, title, label, headH, compact, body, icon: o.icon || 'check', iconBg: o.iconBg || P.C.accent, tag: o.tag, headTag: o.headTag || 'cabeçalho', labelTag: o.labelTag, count: o.count, hl: o.hl, titleInk: o.titleInk || CARD_INK };
  }
  // A notification at (x, y), scale s about its top centre; its texts count as
  // shown once it has arrived (settled).
  function drawNote(R, P, N, x, y, s, settled, lt) {
    const { ctx } = R;
    const rr = R.rec;
    if (!settled) R.rec = () => {};
    ctx.save();
    ctx.translate(x + N.w / 2, y); ctx.scale(s, s); ctx.translate(-(x + N.w / 2), -y);
    rrect(ctx, x, y, N.w, N.h, RADIUS); ctx.fillStyle = CARD; ctx.fill();
    const isz = N.compact ? 64 : ICON;
    const ix = x + PAD, iy = N.compact ? y + (N.h - isz) / 2 : y + PAD + (N.headH - ICON) / 2;
    rrect(ctx, ix, iy, isz, isz, 18); ctx.fillStyle = N.iconBg; ctx.fill();
    E.drawIcon(ctx, N.icon, ix + isz / 2, iy + isz / 2, isz * 0.58, '#FFFFFF', 2.4);
    if (N.head) K.text(R, N.head, ix + ICON + 24, y + PAD + (N.headH - N.head.vh) / 2, CARD_SOFT, 'left', 0, N.headTag);
    if (!N.compact) K.text(R, P.now, x + N.w - PAD - P.now.w, y + PAD + (N.headH - P.now.vh) / 2, CARD_SOFT, 'left', 0, 'agora');
    const tx = N.compact ? ix + isz + 24 : x + PAD;
    const ty = N.compact ? y + (N.h - N.body) / 2 : y + PAD + N.headH + 24;
    // a plain number counts up (drawn, recorded only once it has arrived)
    const n = N.count != null ? Math.round(N.count * expoOut(win(lt, 0.2, 0.7))) : null;
    if (n != null && n !== N.count) { const L = K.line(null, `${N.hl.prefix}${n}${N.hl.suffix}`, { font: N.title.font, size: N.title.size }); L.draw(ctx, tx, ty, N.titleInk, 'left', 0); }
    else K.text(R, N.title, tx, ty, N.titleInk, 'left', 0, N.tag);
    if (N.label) K.text(R, N.label, tx, ty + N.title.vh + 16, CARD_SOFT, 'left', 0, N.labelTag || 'rótulo');
    ctx.restore();
    R.rec = rr;
  }
  // a stack of notifications from the top of the stack area, down
  function stack(P, notes, gap = 24) {
    let y = P.stackTop;
    return notes.map((N) => { const c = { N, x: P.Z.left - 20, y, s: 1 }; y += N.h + gap; return c; });
  }
  // Notifications that fit under the clock: smaller titles, then compact
  // ones, until they do. make(k, compact) → notes. Only the sizes chosen count
  // as the video's text sizes.
  function fitStack(P, make) {
    const min = P.minTextSize;
    const tries = [];
    for (const compact of [false, true]) for (let k = 1; k >= 0.6; k -= 0.1) tries.push([k, compact]);
    let pick = tries[tries.length - 1];
    for (const [k, compact] of tries) {
      const cards = stack(P, make(k, compact), compact ? 18 : 24);
      const last = cards[cards.length - 1];
      if (!last || last.y + last.N.h <= P.Z.bottom) { pick = [k, compact]; break; }
    }
    P.minTextSize = min;
    return stack(P, make(pick[0], pick[1]), pick[1] ? 18 : 24);
  }
  // cards sliding up from below into place, one after the other (start, step in s)
  function enter(R, P, cards, lt, start, step = 0.32) {
    const Z = P.Z;
    const kOf = (j, x) => spring(win(x, start + j * step, 0.5));
    const v = Math.max(0, ...cards.map((c, j) => Math.abs(K.speed((x) => (1 - kOf(j, x)) * (Z.H - c.y), lt))));
    K.blurred(R, v, (g, d) => cards.forEach((c, j) => {
      const k = kOf(j, lt - d);
      if (k <= 0) return;
      drawNote(R, P, c.N, c.x, c.y + (1 - k) * (Z.H - c.y + 40), c.s, k >= 0.98 && !R.moving, lt - d - start - j * step);
    }), null);
  }
  // cards swiped away to the left, one after the other
  function leave(R, P, cards, lt) {
    const Z = P.Z;
    const off = (j, x) => expoIn(win(x, j * 0.05, 0.34)) * -(Z.W + 120);
    const moving = R.moving; R.moving = true;
    K.blurred(R, Math.max(0, ...cards.map((_, j) => Math.abs(K.speed((x) => off(j, x), lt)))), (g, d) => cards.forEach((c, j) => drawNote(R, P, c.N, c.x + off(j, lt - d), c.y, c.s, false, 9)), null);
    R.moving = moving;
  }

  // ---------------------------------------------------------------- prepare
  function prepare(P) {
    const Z = P.Z, c = P.content, F = P.F, C = P.C;
    const Ma = P.act('M'), Da = P.act('D'), La = P.act('L');
    P.now = K.line(P, P.label('now'), { font: F.bold, size: 44 });
    P.clock = K.fit(P, P.label('clock'), { font: F.head, maxSize: Math.min(210, Z.cH * 0.14), minSize: 80, maxW: Z.w, maxLines: 1 });
    P.clockY = Z.top + 10;
    P.stackTop = P.clockY + P.clock.vh + 60;
    const from = c.brandName || '';
    // H: the headline (his kicker in the header, else the company)
    P.Hs = fitStack(P, (k, cp) => [note(P, { head: c.kicker || from, headTag: c.kicker ? 'chamada' : 'cabeçalho', title: c.headline || c.brandName || ' ', size: 98 * k, lines: 5, icon: 'hard-hat', tag: 'título' }, cp)]);
    P.Is = c.intro && P.act('I') ? fitStack(P, (k, cp) => [note(P, { head: from, title: c.intro, size: 78 * k, lines: 6, icon: 'message-circle', tag: 'intro' }, cp)]) : null;
    P.Fs = c.closing && P.act('F') ? fitStack(P, (k, cp) => [note(P, { head: from, title: c.closing, size: 78 * k, lines: 6, icon: 'calendar-check', tag: 'fecho' }, cp)]) : null;
    // M: a page of benefits, D: a page of highlights, L: a page of positions
    P.Ms = (Ma ? Ma.pages : []).map((items) => fitStack(P, (k, cp) => items.map((i) => note(P, { head: from, title: c.benefits[i], size: 74 * k, icon: c.icons[i] || 'check', tag: 'vantagem' }, cp))));
    const tagOf = (h) => (h.role === 'salary' ? 'salário' : h.role === 'vacancies' ? 'vagas' : 'destaque');
    const iconOf = (h) => (h.role === 'salary' ? 'coins' : h.role === 'vacancies' ? 'users' : h.role === 'badge' ? 'award' : 'star');
    P.Ds = (Da ? Da.pages : []).map((items) => fitStack(P, (k, cp) => items.map((i) => {
      const h = c.highlights[i];
      return note(P, { head: from, title: h.value || h.label, label: h.value ? h.label : '', size: 132 * k, lines: 2, icon: iconOf(h), tag: tagOf(h), labelTag: h.role === 'salary' ? 'período' : 'rótulo', count: h.value && h.count != null ? h.count : null, hl: h, titleInk: C.accentInk }, cp);
    })));
    P.Ls = (La ? La.pages : []).map((items) => fitStack(P, (k, cp) => items.map((i) => note(P, { head: c.positionsTitle || from, headTag: c.positionsTitle ? 'título vagas' : 'cabeçalho', title: c.positions[i], size: 66 * k, lines: 3, icon: 'hard-hat', tag: 'vaga' }, cp))));
    // V: the last benefits gather into a stack
    const last = P.Ms[P.Ms.length - 1] || [];
    P.deck = last.map((cd, j) => ({ ...cd, y: P.stackTop + j * 26, s: Math.pow(0.94, j) }));

    // C: WhatsApp's notification, then the chat across the screen
    P.wa = stack(P, [note(P, { head: from || (c.contact && c.contact.display) || '', title: c.message || ' ', size: 60, lines: 4, icon: 'message-circle', iconBg: C.cta, tag: 'chat-preview' })])[0];
    P.chatRect = { x: Z.left - 40, y: Z.top - 10, w: Z.w + 80, h: Z.cH + 20 };
    P.chat = K.chatLayout(P, { ...P.chatRect, font: F.bold, fontStrong: F.head, radius: 48,
      colors: { screen: '#F2F4F7', head: '#1F2C34', headInk: '#FFFFFF', field: '#FFFFFF', fieldInk: CARD_INK, bubble: C.cta, bubbleInk: C.ctaInk, send: C.cta, sendInk: C.ctaInk } });
    // K: the card, on the wallpaper
    P.card = K.cardLayout(P, { font: F.head, bold: F.bold, cy: Z.cy });
  }

  // ---------------------------------------------------------------- the acts
  // What an act ends with (what the next act takes over from).
  function endOf(P, kind) {
    if (kind === 'H') return { cards: P.Hs, clock: true };
    if (kind === 'I') return { cards: P.Is || [], clock: true };
    if (kind === 'F') return { cards: P.Fs || [], clock: true };
    if (kind === 'M') return { cards: P.Ms[P.Ms.length - 1] || [], clock: true };
    if (kind === 'V') return { cards: P.deck, clock: true };
    if (kind === 'D') return { cards: P.Ds[P.Ds.length - 1] || [], clock: true };
    if (kind === 'L') return { cards: P.Ls[P.Ls.length - 1] || [], clock: true };
    if (kind === 'C') return { chat: true };
    return { card: true };
  }
  const cardInk = (P) => ({ ink: P.C.ink, ctaFill: P.C.cta, ctaInk: P.C.ctaInk, hintInk: P.C.ink, qrDark: '#0B0B0B', qrLight: '#FFFFFF' });
  // the chat (or the card) going down and away at the start of an act
  function dropAway(R, P, before, lt) {
    const { ctx } = R, Z = P.Z;
    const dy = expoIn(win(lt, 0, 0.36)) * Z.H;
    if (dy >= Z.H) return;
    const moving = R.moving; R.moving = true;
    const rr = R.rec; R.rec = () => {};
    if (before.chat) { ctx.save(); ctx.translate(0, dy); K.chatDraw(R, { ...P.chat, title: null, sub: null }, 2, { type0: 0, type1: 0.01, send: -1, noBubble: true }); ctx.restore(); }
    else if (before.card) K.cardDraw(R, P.card, 9, { ...cardInk(P), start: 0.25, dy });
    R.rec = rr; R.moving = moving;
  }
  // what was there goes: notifications are swiped away, the chat or the card goes down
  function away(R, P, before, lt) {
    if (!before || lt >= 0.5) return;
    if (before.cards) leave(R, P, before.cards, lt);
    else dropAway(R, P, before, lt);
  }
  // A lock-screen act: the wallpaper, the clock (back from above after the
  // chat or the card), what was there taken away, its notifications.
  function lockAct(R, P, A, pages) {
    const pg = A.pages ? K.page(A) : { index: 0, lt: A.lt, first: true };
    const lt = pg.lt;
    wallpaper(R, P);
    const before = pg.first ? (A.prev ? endOf(P, A.prev) : null) : { cards: pages[pg.index - 1], clock: true };
    const back = before && !before.clock;
    clock(R, P, back ? -(1 - expoOut(win(lt, 0, 0.45))) * (P.clockY + P.clock.vh + 40) : 0);
    away(R, P, before, lt);
    const cards = pages[pg.index] || [];
    enter(R, P, cards, lt, before ? 0.25 : 0.3, cards.length > 3 ? 0.25 : 0.32);
  }
  // V: the last benefits gather into a stack, which tilts back and returns
  function deckAct(R, P, A) {
    const lt = A.lt, { ctx } = R;
    wallpaper(R, P); clock(R, P);
    const from = P.Ms[P.Ms.length - 1] || [];
    const k = expoInOut(win(lt, 0.1, 0.6));
    const tilt = 0.16 * Math.sin(Math.PI * win(lt, 0.8, 1.0));
    const moving = R.moving;
    if (k < 1 || tilt > 0.005) R.moving = true;
    ctx.save();
    if (tilt > 0) { const cy = P.stackTop; ctx.translate(0, cy); ctx.transform(1, 0, -tilt * 0.4, 1 - tilt, 0, 0); ctx.translate(0, -cy); }
    for (let j = from.length - 1; j >= 0; j--) {
      const a = from[j], b = P.deck[j];
      drawNote(R, P, a.N, a.x, lerp(a.y, b.y, k), lerp(1, b.s, k), j === 0 && !R.moving, 9);
    }
    ctx.restore();
    R.moving = moving;
  }
  // C: WhatsApp's notification arrives; a push into it opens the chat
  function chatAct(R, P, A) {
    const lt = A.lt, { ctx } = R;
    const push = expoInOut(win(lt, 0.6, 0.4));
    if (push < 1) {
      wallpaper(R, P); clock(R, P);
      away(R, P, A.prev ? endOf(P, A.prev) : null, lt);
      enter(R, P, [P.wa], lt, 0.2);
    }
    if (push > 0) {
      const r = K.rectLerp({ x: P.wa.x, y: P.wa.y, w: P.wa.N.w, h: P.wa.N.h, r: RADIUS }, { ...P.chatRect, r: 48 }, push);
      ctx.save(); rrect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.clip();
      const moving = R.moving; if (push < 1) R.moving = true;
      const sx = r.w / P.chatRect.w, sy = r.h / P.chatRect.h;
      ctx.translate(r.x - P.chatRect.x * sx, r.y - P.chatRect.y * sy); ctx.scale(sx, sy);
      K.chatDraw(R, P.chat, lt, { type0: 1.0, type1: 1.55, send: 1.6 });
      R.moving = moving;
      ctx.restore();
    }
  }
  // K: what was there goes away; the card rises on the wallpaper
  function cardAct(R, P, A) {
    const lt = A.lt;
    wallpaper(R, P);
    away(R, P, A.prev ? endOf(P, A.prev) : null, lt);
    K.cardDraw(R, P.card, lt, { ...cardInk(P), start: 0.25 });
  }
  // O: the card goes down and away; the clock comes back from above — the first frame
  function loop(R, P, A) {
    const lt = A.lt;
    wallpaper(R, P);
    dropAway(R, P, { card: true }, lt);
    clock(R, P, -(1 - expoOut(win(lt, 0.35, 0.5))) * (P.clockY + P.clock.vh + 40));
  }

  // ---------------------------------------------------------------- sound
  function sound(P) {
    const ev = [];
    const beats = Math.round(P.timeline.duration * 2);
    const Ka = P.act('K');
    const riserFrom = Math.max(0, Ka.start - 2);
    const keys = [[220, 277.2], [196, 246.9], [174.6, 220], [196, 246.9]];
    for (let b = 0; b < beats; b++) {
      const t = b * 0.5;
      ev.push({ t, kind: 'kick', f0: 120, f1: 42, dur: 0.34, gain: 0.82 });
      ev.push({ t: t + 0.25, kind: 'noise', f: 9500, dur: 0.025, gain: 0.05 });
      if (b % 2 === 0 && (t < riserFrom || t >= Ka.start)) for (const hz of keys[Math.floor(b / 4) % 4]) ev.push({ t, kind: 'tone', hz, wave: 'sine', dur: 0.9, gain: 0.09, attack: 0.04 });
    }
    // a soft hit on every act change and new page; a riser into the card
    const turns = P.acts.filter((a) => a.pages).flatMap((a) => a.pages.slice(1).map((_, i) => a.start + (i + 1) * 2));
    for (const t of [...P.timeline.cuts, ...turns]) ev.push({ t, kind: 'noise', filter: 'lowpass', f: 1600, dur: 0.2, gain: 0.26 }, { t, kind: 'kick', f0: 180, f1: 60, dur: 0.2, gain: 0.35 });
    if (Ka.start >= 2) ev.push({ t: riserFrom, kind: 'riser', dur: Ka.start - riserFrom, f0: 400, f1: 4000, gain: 0.18 });
    // a «ding» for every notification that arrives
    const ding = (t) => ev.push({ t, kind: 'tone', hz: 1318.5, wave: 'sine', dur: 0.14, gain: 0.11 }, { t: t + 0.09, kind: 'tone', hz: 1760, wave: 'sine', dur: 0.22, gain: 0.09 });
    const arrivals = (cards, t0, step) => (cards || []).forEach((_, j) => ding(t0 + j * step + 0.2));
    arrivals(P.Hs, 0.3, 0.32);
    const at = (k) => P.act(k);
    if (at('I')) arrivals(P.Is, at('I').start + 0.25, 0.32);
    if (at('F')) arrivals(P.Fs, at('F').start + 0.25, 0.32);
    for (const [k, list] of [['M', P.Ms], ['D', P.Ds], ['L', P.Ls]]) if (at(k)) list.forEach((cards, p) => arrivals(cards, at(k).start + p * 2 + 0.25, cards.length > 3 ? 0.25 : 0.32));
    const C = at('C');
    if (C) {
      ding(C.start + 0.4);
      ev.push({ t: C.start + 0.6, kind: 'riser', f0: 500, f1: 3000, dur: 0.35, gain: 0.16 });
      for (let t = 1.0; t < 1.55; t += 0.06) ev.push({ t: C.start + t, kind: 'noise', filter: 'bandpass', f: 4200, q: 2, dur: 0.02, gain: 0.07 });
      ev.push({ t: C.start + 1.6, kind: 'tone', hz: 700, hz1: 1300, wave: 'sine', dur: 0.12, gain: 0.22 });
    }
    return ev.filter((e) => e.t >= 0 && e.t < P.timeline.duration);
  }

  const L7 = (pt, de, fr, it, en, es) => ({ 'pt-PT': pt, 'de-CH': de, 'de-DE': de, fr, it, en, es });
  RS.motion.register({
    id: 'notificacoes', name: 'Notificações', concept: 'Um ecrã bloqueado às 07:00: cada vantagem chega como notificação; a do WhatsApp abre a conversa.',
    font: { head: { family: 'DM Sans', weight: 700 }, bold: { family: 'DM Sans', weight: 500 } },
    palettes: { dark: { bg: '#10141C', ink: '#FFFFFF', main: '#FFFFFF', accent: '#4DA3FF' } },
    bgModes: ['dark'], photos: 1, travel: 'glide', pages: true, continuous: true, needs: { V: ['M'] },
    labels: { clock: L7('07:00', '07:00', '07:00', '07:00', '07:00', '07:00'), now: L7('agora', 'jetzt', 'maintenant', 'ora', 'now', 'ahora') },
    colors(c) {
      // the app icons in the highlight colour; a value in it where it reads on white
      c.accentInk = U.ensureContrast(c.accent, '#FFFFFF', 4.5);
      return c;
    },
    prepare,
    acts: {
      H: (R, A) => lockAct(R, R.P, A, [R.P.Hs]),
      I: (R, A) => lockAct(R, R.P, A, [R.P.Is || []]),
      M: (R, A) => lockAct(R, R.P, A, R.P.Ms),
      V: (R, A) => deckAct(R, R.P, A),
      D: (R, A) => lockAct(R, R.P, A, R.P.Ds),
      L: (R, A) => lockAct(R, R.P, A, R.P.Ls),
      F: (R, A) => lockAct(R, R.P, A, [R.P.Fs || []]),
      C: (R, A) => chatAct(R, R.P, A),
      K: (R, A) => cardAct(R, R.P, A),
      O: (R, A) => loop(R, R.P, A),
    },
    sound,
  });
})();
