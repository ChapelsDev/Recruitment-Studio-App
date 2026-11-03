// Poster engine: canvas drawing, automatic text fitting, photo framing.
// All layout happens in poster pixels (1080 wide), so the preview and the
// exported file are the same picture at different scales.
window.RS = window.RS || {};

RS.engine = (() => {
  const U = RS.util;
  const M = RS.model;

  // ---------------------------------------------------------------- fonts and measuring
  const mctx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  const metricCache = new Map();
  const drawingReports = new WeakMap();
  function noteText(ctx, text, options) {
    const report = drawingReports.get(ctx);
    if (report && options.report !== false && String(text || '').trim()) report.minTextSize = Math.min(report.minTextSize, options.size);
  }

  const fontCss = (spec, size) => `${spec.weight} ${size.toFixed(2)}px "${spec.family}", "Segoe UI", Arial, sans-serif`;
  function setFont(ctx, spec, size, trackEm) {
    ctx.font = fontCss(spec, size);
    ctx.letterSpacing = `${((trackEm || 0) * size).toFixed(2)}px`;
  }
  function measure(text) {
    const key = mctx.font + '|' + mctx.letterSpacing + '|' + text;
    let w = widthCache.get(key);
    if (w === undefined) {
      if (widthCache.size > 20000) widthCache.clear();
      w = mctx.measureText(text).width;
      widthCache.set(key, w);
    }
    return w;
  }
  function metrics(spec) {
    const key = spec.family + spec.weight;
    let m = metricCache.get(key);
    if (!m) {
      setFont(mctx, spec, 100, 0);
      const cap = mctx.measureText('H').actualBoundingBoxAscent / 100;
      const g = mctx.measureText('gjpqy');
      m = { cap: cap || 0.7, desc: (g.actualBoundingBoxDescent || 20) / 100 };
      metricCache.set(key, m);
    }
    return m;
  }

  let fontsReady = null;
  // index.html loads fonts.css without blocking the first paint (the start screen
  // shows at once); wait for it before collecting the faces.
  function fontSheet() {
    const link = document.getElementById('fonts-css');
    if (!link) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { if (link.media === 'print') link.media = 'all'; resolve(); };
      if (link.sheet) { done(); return; } // already loaded (its load event may have passed)
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
    });
  }
  function loadFonts() {
    if (!fontsReady) {
      fontsReady = (async () => {
        await fontSheet();
        void document.documentElement.offsetHeight; // style update: registers the @font-face rules
        const faces = [];
        document.fonts.forEach((f) => faces.push(f));
        await Promise.all(faces.map((f) => f.load().catch(() => null)));
        await document.fonts.ready;
        widthCache.clear();
        metricCache.clear();
      })();
    }
    return fontsReady;
  }

  // ---------------------------------------------------------------- text layout
  // Splits a word that is wider than the line, preferring - and / as break points.
  // `hard` is set when a piece had to be cut mid-word (a hyphen is added).
  function splitWord(word, maxW) {
    const parts = [];
    parts.hard = false;
    let rest = word;
    while (rest && measure(rest) > maxW) {
      let cut = -1;
      for (let i = rest.length - 1; i > 0; i--) {
        if ((rest[i - 1] === '-' || rest[i - 1] === '/') && measure(rest.slice(0, i)) <= maxW) { cut = i; break; }
      }
      if (cut < 0) {
        let i = 1;
        while (i < rest.length && measure(rest.slice(0, i + 1) + '-') <= maxW) i++;
        parts.hard = true;
        parts.push(rest.slice(0, i) + '-');
        rest = rest.slice(i);
      } else {
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function wrap(text, maxW) {
    const lines = [];
    let broken = false;
    for (const para of String(text).split('\n')) {
      const words = para.split(/[ \t]+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const word of words) {
        const cand = line ? line + ' ' + word : word;
        if (measure(cand) <= maxW) { line = cand; continue; }
        if (line) lines.push(line);
        if (measure(word) > maxW) {
          const parts = splitWord(word, maxW);
          if (parts.hard) broken = true;
          for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
          line = parts[parts.length - 1];
        } else {
          line = word;
        }
      }
      lines.push(line);
    }
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    for (let i = 0; i < lines.length - 1; i++) {
      const m = /^(.*\S)\s+(\S{1,2})$/.exec(lines[i]);
      if (!m || !lines[i + 1]) continue;
      const next = m[2] + ' ' + lines[i + 1];
      if (measure(next) <= maxW) { lines[i] = m[1]; lines[i + 1] = next; }
    }
    return { lines, broken };
  }

  // o: { font, size, lh, track, upper, maxW, locale, balance }
  // Block height runs from the cap line of the first line to just below the
  // last baseline, so gaps between blocks are what the eye sees.
  function textLayout(text, o) {
    const t = o.upper ? String(text).toLocaleUpperCase(o.locale || 'pt-PT') : String(text);
    setFont(mctx, o.font, o.size, o.track);
    let res = wrap(t, o.maxW);
    if (o.balance && res.lines.length > 1 && !res.broken) {
      let lo = o.maxW * 0.45, hi = o.maxW;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const r = wrap(t, mid);
        if (r.lines.length <= res.lines.length && !r.broken) hi = mid; else lo = mid;
      }
      res = wrap(t, hi);
    }
    const m = metrics(o.font);
    const lhPx = o.size * o.lh;
    const capPx = m.cap * o.size;
    const lastLine = res.lines[res.lines.length - 1] || '';
    const tail = /[gjpqyçÇ,;Q]/.test(lastLine) ? m.desc * o.size * 0.92 : o.size * 0.06;
    const widths = res.lines.map((l) => measure(l));
    const n = res.lines.length;
    const vh = n ? capPx + (n - 1) * lhPx : 0;
    return {
      lines: res.lines, widths, broken: res.broken, size: o.size,
      w: widths.length ? Math.max(...widths) : 0,
      h: n ? vh + tail : 0,
      vh, capPx, lhPx,
      // One line on its own (the video brings a headline in line by line).
      drawLine(ctx, i, x, y, color) {
        noteText(ctx, res.lines[i], o);
        setFont(ctx, o.font, o.size, o.track);
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(res.lines[i], x, y + capPx + i * lhPx);
      },
      draw(ctx, x, y, color, align, boxW) {
        noteText(ctx, res.lines.join(''), o);
        setFont(ctx, o.font, o.size, o.track);
        ctx.fillStyle = color;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        for (let i = 0; i < n; i++) {
          let lx = x;
          if (align === 'center') lx = x + (boxW - widths[i]) / 2;
          else if (align === 'right') lx = x + boxW - widths[i];
          ctx.fillText(res.lines[i], lx, y + capPx + i * lhPx);
        }
      },
    };
  }

  // Largest size (<= maxSize) that keeps the text within maxLines without
  // breaking a word; lines are then balanced.
  function fitHeadline(text, o) {
    const ok = (size) => {
      const L = textLayout(text, { ...o, size, balance: false });
      return L.lines.length <= o.maxLines && !L.broken;
    };
    let best = null;
    if (ok(o.maxSize)) best = o.maxSize;
    else {
      let lo = o.minSize, hi = o.maxSize;
      if (ok(lo)) {
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (ok(mid)) lo = mid; else hi = mid;
        }
        best = lo;
      }
    }
    const size = best || o.minSize;
    const orphan = (L) => L.lines.length > 1 && L.lines.some((l) => l.trim().length <= 3);
    let L = textLayout(text, { ...o, size, balance: true });
    if (best && orphan(L)) {
      for (let k = 1; k <= 10; k++) {
        const c = textLayout(text, { ...o, size: size * Math.pow(0.97, k), balance: true });
        if (!orphan(c) && c.lines.length <= o.maxLines && !c.broken) { L = c; break; }
      }
    }
    return L;
  }

  // Single line shrunk to fit the width (phones and e-mails never wrap).
  function lineLayout(text, o) {
    setFont(mctx, o.font, o.size, o.track);
    const w = measure(o.upper ? text.toLocaleUpperCase(o.locale) : text);
    const size = w > o.maxW ? Math.max(o.size * 0.5, o.size * (o.maxW / w)) : o.size;
    return textLayout(text, { ...o, size, maxW: Infinity });
  }

  // ---------------------------------------------------------------- shapes and icons
  const pathCache = new Map();
  function iconPath(name) {
    let p = pathCache.get(name);
    if (!p) {
      p = new Path2D(RS.ICON_PATHS[name] || RS.ICON_PATHS['circle-check'] || '');
      pathCache.set(name, p);
    }
    return p;
  }
  function drawIcon(ctx, name, cx, cy, size, color, stroke = 2.1) {
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.stroke(iconPath(name));
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  }
  // `color` (optional) recolours this one badge, e.g. multicoloured benefit icons.
  function iconBadge(ctx, R, name, cx, cy, d, style, color) {
    const th = color ? { ...R.theme, iconBg: color, iconFg: U.onColor(color) } : R.theme;
    switch (style) {
      case 'block': {
        // Square tile with a thick outline and a hard offset shadow (bold posters).
        const c = th.iconBg, line = th.iconLine || '#000000';
        const off = d * 0.1, sd = d - off, x0 = cx - d / 2, y0 = cy - d / 2, lw = Math.max(3, d * 0.07);
        ctx.fillStyle = th.iconShadow || line; ctx.fillRect(x0 + off, y0 + off, sd, sd);
        ctx.fillStyle = c; ctx.fillRect(x0, y0, sd, sd);
        ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.strokeRect(x0 + lw / 2, y0 + lw / 2, sd - lw, sd - lw);
        drawIcon(ctx, name, x0 + sd / 2, y0 + sd / 2, sd * 0.56, th.iconFg, 2.4);
        break;
      }
      case 'ring':
        ctx.beginPath(); ctx.arc(cx, cy, d / 2 - d * 0.03, 0, Math.PI * 2);
        ctx.lineWidth = d * 0.06; ctx.strokeStyle = th.iconBg; ctx.stroke();
        drawIcon(ctx, name, cx, cy, d * 0.48, th.iconBg, 2.1);
        break;
      case 'soft':
        ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
        ctx.fillStyle = th.iconSoft; ctx.fill();
        drawIcon(ctx, name, cx, cy, d * 0.52, th.iconBg, 2.3);
        break;
      case 'square':
        roundRect(ctx, cx - d / 2, cy - d / 2, d, d, d * 0.26);
        ctx.fillStyle = th.iconBg; ctx.fill();
        drawIcon(ctx, name, cx, cy, d * 0.54, th.iconFg, 2.3);
        break;
      case 'plain':
        drawIcon(ctx, name, cx, cy, d * 0.78, th.iconBg, 2);
        break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
        ctx.fillStyle = th.iconBg; ctx.fill();
        drawIcon(ctx, name, cx, cy, d * 0.54, th.iconFg, 2.3);
    }
  }

  // ---------------------------------------------------------------- QR code
  const qrCache = new Map();
  function qrModules(text) {
    if (!window.qrcode) return null;
    if (qrCache.has(text)) return qrCache.get(text);
    let m = null;
    try {
      if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      const n = q.getModuleCount();
      const grid = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = q.isDark(r, c) ? 1 : 0;
      m = { n, grid };
    } catch (err) {
      console.warn('QR code not generated', err);
    }
    if (qrCache.size > 40) qrCache.clear();
    qrCache.set(text, m);
    return m;
  }
  // QR: the ad's WhatsApp link in «WhatsApp» mode, otherwise the link typed in «Link».
  const qrText = (R) => {
    if (R.show.qr === false || !R.show.contacts) return '';
    if (R.project && R.project.qrMode === 'whatsapp') return (RS.contact && RS.contact.adLink(R.project, R.locale)) || '';
    return R.t.qr && R.t.qr.trim() ? R.t.qr.trim() : '';
  };

  // «Fala comigo» pill: "Manda mensagem · +351 912 345 678" on WhatsApp green,
  // first in the contacts, only when the ad has a valid number and the pill is on.
  // { text, cta, number } (cta and number apart for the two-line pill), or null.
  const WA_GREEN = '#25D366', WA_INK = '#062B14';
  function waPill(R) {
    const w = R.project && R.project.whatsapp;
    if (!R.show.contacts || R.show.waCta === false || !w || !RS.contact) return null;
    const number = RS.contact.display(w.country, w.number);
    if (!number) return null;
    const S = RS.model.STOCK;
    const cta = S.waCta[R.locale] || S.waCta['pt-PT'];
    return { text: `${cta} · ${number}`, cta, number };
  }
  // With the pill on, a contact holding the same number would show it twice.
  function notWaNumber(R) {
    const w = R.project && R.project.whatsapp;
    const own = w && RS.contact.digits(w.country, w.number);
    return (c) => !own || RS.contact.digits(w.country, c.text) !== own;
  }
  // `e`: the height of a one-line pill (its ends); a two-line pill is taller.
  function drawWaPill(ctx, x, y, w, h, L, e = h) {
    roundRect(ctx, x, y, w, h, e / 2);
    ctx.fillStyle = WA_GREEN; ctx.fill();
    drawIcon(ctx, 'message-circle', x + e * 0.52, y + h / 2, e * 0.5, WA_INK, 2.4);
    L.draw(ctx, x + e * 0.95, y + (h - L.vh) / 2, WA_INK);
  }
  // Pill within `avail`: the text shrinks (padding kept) until the ends (0.95e
  // before the text, 0.45e after) and the text fit; k = text size / `size`.
  function fitPill(R, text, size, d, avail) {
    const o = { font: R.fonts.strong, size, lh: 1.1, maxW: Infinity, locale: R.locale };
    const pad = size * 0.9, floor = d * 1.02;
    const lay = (L) => {
      const e = Math.max(floor, L.capPx + pad), ph = Math.max(e, L.vh + pad);
      return { pill: true, L, k: L.size / size, e, rd: ph, rh: ph, pw: e * 1.4 + L.w };
    };
    let P = lay(textLayout(text, o));
    if (P.pw > avail) {
      const L = P.L;
      const k = Math.min((avail - 1.4 * pad) / (1.4 * L.capPx + L.w), (avail - 1.4 * floor) / L.w);
      P = lay(textLayout(text, { ...o, size: size * Math.max(0.1, k) }));
      if (P.pw > avail) P = lay(textLayout(text, { ...o, size: P.L.size * Math.max(0.1, (avail - P.e * 1.4) / P.L.w) }));
    }
    return P;
  }
  // White tile with a quiet zone, so it scans on any background.
  function drawQR(R, text, x, y, size, o = {}) {
    const m = qrModules(text);
    if (!m) return;
    const ctx = R.ctx;
    const quiet = size * 0.075;
    const cell = (size - quiet * 2) / m.n;
    roundRect(ctx, x, y, size, size, size * 0.08);
    ctx.fillStyle = o.light || '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = o.dark || U.ensureContrast(R.theme.primary, '#FFFFFF', 7);
    for (let r = 0; r < m.n; r++) {
      for (let c = 0; c < m.n; c++) {
        if (m.grid[r * m.n + c]) ctx.fillRect(x + quiet + c * cell, y + quiet + r * cell, cell + 0.4, cell + 0.4);
      }
    }
    R.hit('qr', x, y, size, size);
  }

  // ---------------------------------------------------------------- images
  const logoInfo = new WeakMap();
  const logoTinted = new WeakMap();
  function analyseLogo(img) {
    let info = logoInfo.get(img);
    if (info) return info;
    const k = Math.min(1, 96 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0, clear = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) { clear++; continue; }
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    info = {
      transparent: clear / (d.length / 4) > 0.08,
      color: n ? U.rgbToHex({ r: r / n, g: g / n, b: b / n }) : '#000000',
    };
    logoInfo.set(img, info);
    return info;
  }
  function tinted(img, color) {
    let map = logoTinted.get(img);
    if (!map) { map = {}; logoTinted.set(img, map); }
    if (!map[color]) {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      map[color] = c;
    }
    return map[color];
  }
  // Picks the original logo, a white version or a dark version so it reads on `bg`.
  function logoSource(img, bg, tone) {
    if (tone === 'white') return tinted(img, '#FFFFFF');
    if (tone === 'dark') return tinted(img, '#111827');
    if (tone === 'original') return img;
    const info = analyseLogo(img);
    if (!info.transparent || U.contrast(info.color, bg) >= 2.2) return img;
    return tinted(img, U.isDark(bg) ? '#FFFFFF' : '#111827');
  }

  // ---------------------------------------------------------------- base sizes
  // Sizes at scale 1 for a 1080-wide poster. The fitter scales all of them together.
  const BASE = {
    logoH: 96, brandName: 56, brandTag: 17,
    kicker: 40, headMax: 106, headMin: 34, headLines: 4,
    barW: 92, barH: 8,
    intro: 34,
    benefit: 31, iconD: 70, rowGap: 18,
    boxTitle: 29, boxItem: 30, boxPad: 30,
    contactMain: 50, contactSub: 38, contactD: 60,
    gaps: { afterLogo: 52, kickerHead: 12, bar: 26, intro: 26, benefits: 38, positions: 36, contacts: 36, def: 30 },
  };

  function baseTheme(st) {
    const bg = U.normHex(st.bg);
    const text = U.ensureContrast(st.text, bg, 4.5);
    const primary = U.normHex(st.primary);
    const accent = U.normHex(st.accent);
    const boxBg = U.mix(accent, bg, 0.86);
    return {
      bg, text, primary, accent,
      headline: U.ensureContrast(primary, bg, 3),
      kicker: U.ensureContrast(accent, bg, 3),
      kickerBg: accent, kickerFg: U.onColor(accent),
      bar: accent,
      brand: U.ensureContrast(primary, bg, 3), brandTag: U.ensureContrast(accent, bg, 3),
      iconBg: U.ensureContrast(primary, bg, 2), iconFg: U.onColor(primary), iconSoft: U.mix(primary, bg, 0.82),
      boxBg, boxLine: U.ensureContrast(primary, bg, 3),
      boxTitle: U.ensureContrast(accent, boxBg, 3.2), boxText: U.ensureContrast(text, boxBg, 4.5),
      bullet: U.ensureContrast(primary, boxBg, 2.5),
      contactMain: U.ensureContrast(primary, bg, 4.5), contactText: text,
      badgeBg: accent, badgeFg: U.onColor(accent),
    };
  }

  // ---------------------------------------------------------------- animation (video ads)
  // R.anim is null for still images: every helper below then simply draws.
  // Slots are [start, length] in seconds of a 10-second video, in reading
  // order; `k` shortens or stretches the entrances for other lengths so the
  // complete poster always holds at the end.
  const TL = {
    logo: [0.2, 0.6], kicker: [0.4, 0.5], headline: [0.55, 0.62], line: 0.09, bar: [1.05, 0.45],
    intro: [1.3, 0.55], benefits: [1.8, 0.5], benefit: 0.16, positions: [3.4, 0.55], position: 0.08,
    badge: [4.3, 0.65], contacts: [5.0, 0.5], contact: 0.12, qr: [5.35, 0.55], pulse: [6.5, 0.6],
  };
  // o: { duration (s), style: 'dynamic' | 'soft' }. `t` is set before each frame.
  function animState(o = {}) {
    const duration = o.duration || 10;
    // up to 15 s as before; a longer video spreads the entrances over its length
    const k = duration > 15 ? (1.25 * duration) / 15 : U.clamp((duration - 2.5) / 6.5, 0.55, 1.25);
    return { t: 0, duration, soft: o.style === 'soft', k, plans: [], planIdx: 0 };
  }
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeBack = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  function phase(A, slot, delay = 0) {
    const start = (slot[0] + delay) * A.k;
    const len = slot[1] * (A.soft ? 1.5 : 1) * U.clamp(A.k, 0.8, 1);
    return U.clamp((A.t - start) / len, 0, 1);
  }
  function scaleAt(ctx, b, s, rot) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
  }
  // Draws with an entrance effect; nothing before it starts. box: { x, y, w, h }.
  // Suave turns pops into fades and halves the moves.
  function enter(R, slot, delay, fx, box, draw) {
    const A = R.anim;
    if (!A) return draw();
    const p = phase(A, slot, delay);
    if (p <= 0) return null;
    if (p >= 1) return draw();
    const ctx = R.ctx;
    const e = easeOut(p);
    const kind = A.soft ? ({ pop: 'fade', stamp: 'fade', reveal: 'rise' }[fx] || fx) : fx;
    const dist = A.soft ? 0.5 : 1;
    ctx.save();
    if (kind !== 'reveal') ctx.globalAlpha *= Math.min(1, p * 1.8);
    if (kind === 'rise') ctx.translate(0, (1 - e) * 44 * dist);
    else if (kind === 'slide') ctx.translate((1 - e) * -36 * dist, 0);
    else if (kind === 'pop') scaleAt(ctx, box, 0.35 + 0.65 * easeBack(p));
    else if (kind === 'stamp') scaleAt(ctx, box, 1.6 - 0.6 * easeBack(p), (1 - e) * 0.3);
    else if (kind === 'grow') { ctx.translate(box.x, 0); ctx.scale(Math.max(0.001, e), 1); ctx.translate(-box.x, 0); }
    else if (kind === 'reveal') {
      // the line rises from behind a mask the size of the line
      ctx.beginPath(); ctx.rect(box.x - 40, box.y - box.h * 0.35, box.w + 80, box.h * 1.55); ctx.clip();
      ctx.translate(0, (1 - e) * box.h * 1.25);
    }
    const out = draw();
    ctx.restore();
    return out;
  }
  // One short beat on the main contact once everything is in (Dinâmico only).
  function pulse(R, box, draw) {
    const A = R.anim;
    if (!A || A.soft) return draw();
    const p = phase(A, TL.pulse);
    if (p <= 0 || p >= 1) return draw();
    R.ctx.save();
    scaleAt(R.ctx, box, 1 + 0.07 * Math.sin(Math.PI * p));
    const out = draw();
    R.ctx.restore();
    return out;
  }
  // Whole stack blocks that come in as one piece (the others animate their parts).
  const BLOCK_FX = { logo: [TL.logo, 'fade'], kicker: [TL.kicker, 'rise'], bar: [TL.bar, 'grow'], intro: [TL.intro, 'rise'] };

  // ---------------------------------------------------------------- stack blocks
  const MAKERS = {
    logo(R, w, s, o) {
      if (!R.show.logo) return null;
      const img = R.images.logo;
      if (img) {
        const maxH = BASE.logoH * s * R.style.logoScale * (o.logoMul || 1);
        const ar = img.width / img.height;
        let h = maxH, lw = h * ar;
        if (lw > w * 0.85) { lw = w * 0.85; h = lw / ar; }
        return {
          key: 'logo', h, bw: lw,
          draw(ctx, x, y) {
            ctx.drawImage(logoSource(img, o.logoBg || R.theme.bg, o.logoTone || R.style.logoTone), x, y, lw, h);
            R.hit('logo', x, y, lw, h);
          },
        };
      }
      const name = (R.brand.name || '').trim();
      if (!name) return null;
      const k = R.style.logoScale * (o.logoMul || 1);
      const nameL = lineLayout(name, { font: R.fonts.head, size: BASE.brandName * s * k, lh: 1, track: R.fonts.headTrack, maxW: w, locale: R.locale });
      const tag = (R.brand.tagline || '').trim();
      const tagL = tag ? lineLayout(tag, { font: R.fonts.sub, size: BASE.brandTag * s * k, lh: 1.2, track: 0.16, upper: true, maxW: w, locale: R.locale, report: false }) : null;
      const gap = 12 * s * k;
      const h = nameL.h + (tagL ? gap + tagL.h : 0);
      return {
        key: 'logo', h, bw: Math.max(nameL.w, tagL ? tagL.w : 0),
        draw(ctx, x, y) {
          nameL.draw(ctx, x, y, o.brandColor || R.theme.brand);
          if (tagL) tagL.draw(ctx, x, y + nameL.h + gap, o.brandTagColor || R.theme.brandTag);
          R.hit('logo', x, y, Math.max(nameL.w, tagL ? tagL.w : 0), h);
        },
      };
    },

    kicker(R, w, s, o) {
      const t = (R.t.kicker || '').trim();
      if (!R.show.kicker || !t) return null;
      const size = BASE.kicker * s * (o.kickerMul || 1);
      const pill = o.kickerStyle === 'pill';
      const px = size * 0.5, py = size * 0.34;
      const L = textLayout(t, { font: R.fonts.sub, size, lh: 1.12, track: R.fonts.subTrack, upper: true, maxW: pill ? w - 2 * px : w, locale: R.locale });
      const h = pill ? L.vh + 2 * py : L.h;
      return {
        key: 'kicker', h,
        draw(ctx, x, y) {
          if (pill) {
            roundRect(ctx, x, y, L.w + 2 * px, h, o.pillRadius != null ? o.pillRadius * s : h / 2);
            ctx.fillStyle = R.theme.kickerBg; ctx.fill();
            L.draw(ctx, x + px, y + py, R.theme.kickerFg);
            R.hit('kicker', x, y, L.w + 2 * px, h);
          } else {
            L.draw(ctx, x, y, R.theme.kicker);
            R.hit('kicker', x, y, L.w, L.h);
          }
        },
      };
    },

    headline(R, w, s, o) {
      const t = (R.t.headline || '').trim();
      if (!t) return null;
      const L = fitHeadline(t, {
        font: R.fonts.head, lh: R.fonts.headLH, track: R.fonts.headTrack, upper: R.style.upper, locale: R.locale,
        maxSize: BASE.headMax * s * R.style.headScale * (o.headMul || 1),
        minSize: Math.max(16, BASE.headMin * s),
        maxW: w, maxLines: o.headLines || R.headLines,
      });
      return {
        key: 'headline', h: L.h,
        draw(ctx, x, y) {
          const color = o.headColor || R.theme.headline;
          if (R.anim) {
            for (let i = 0; i < L.lines.length; i++) {
              const box = { x, y: y + i * L.lhPx, w: L.widths[i], h: L.capPx * 1.3 };
              enter(R, TL.headline, i * TL.line, 'reveal', box, () => L.drawLine(ctx, i, x, y, color));
            }
            return;
          }
          L.draw(ctx, x, y, color);
          R.hit('headline', x, y, L.w, L.h);
        },
      };
    },

    bar(R, w, s, o) {
      if (!o.bar) return null;
      const bw = BASE.barW * s, bh = BASE.barH * s;
      return {
        key: 'bar', h: bh,
        draw(ctx, x, y) { roundRect(ctx, x, y, bw, bh, bh / 2); ctx.fillStyle = R.theme.bar; ctx.fill(); },
      };
    },

    intro(R, w, s, o) {
      const t = (R.t.intro || '').trim();
      if (!R.show.intro || !t) return null;
      const L = textLayout(t, { font: { family: R.fonts.body.family, weight: 600 }, size: BASE.intro * s, lh: R.fonts.bodyLH, maxW: w, locale: R.locale });
      return {
        key: 'intro', h: L.h,
        draw(ctx, x, y) { L.draw(ctx, x, y, o.introColor || R.theme.text); R.hit('intro', x, y, L.w, L.h); },
      };
    },

    benefits(R, w, s, o) {
      if (!R.show.benefits) return null;
      const items = (R.t.benefits || []).filter((b) => b.text.trim());
      if (!items.length) return null;
      const want = o.benefitCols === 'auto' ? (w > 700 ? 2 : 1) : o.benefitCols;
      const cols = want && items.length > 1 ? want : 1;
      const colGap = 34 * s;
      const colW = (w - colGap * (cols - 1)) / cols;
      const d = BASE.iconD * s * (o.iconMul || 1);
      const gx = 22 * s;
      const size = BASE.benefit * s;
      const rows = items.map((b) => ({ b, L: textLayout(b.text, { font: R.fonts.body, size, lh: 1.17, maxW: colW - d - gx, locale: R.locale }) }));
      const rowGap = BASE.rowGap * s;
      const placed = [];
      let y = 0;
      for (let i = 0; i < rows.length; i += cols) {
        const chunk = rows.slice(i, i + cols);
        const rh = Math.max(...chunk.map((r) => Math.max(d, r.L.vh + size * 0.1)));
        chunk.forEach((r, j) => placed.push({ ...r, x: j * (colW + colGap), y, rh }));
        y += rh + rowGap;
      }
      return {
        key: 'benefits', h: y - rowGap,
        draw(ctx, x, y0) {
          placed.forEach((p, i) => {
            const cy = y0 + p.y + p.rh / 2;
            const delay = i * TL.benefit;
            enter(R, TL.benefits, delay, 'pop', { x: x + p.x, y: cy - d / 2, w: d, h: d },
              () => iconBadge(ctx, R, p.b.icon || 'circle-check', x + p.x + d / 2, cy, d, o.iconStyle, o.iconColors && o.iconColors[i % o.iconColors.length]));
            enter(R, TL.benefits, delay + 0.06, 'slide', null,
              () => p.L.draw(ctx, x + p.x + d + gx, cy - p.L.vh / 2, o.benefitColor || R.theme.text));
            R.hit(`benefit:${p.b.id}`, x + p.x, y0 + p.y, colW, p.rh);
          });
        },
      };
    },

    positions(R, w, s, o) {
      if (!R.show.positions) return null;
      const title = (R.t.positionsTitle || '').trim();
      const items = (R.t.positions || []).filter((it) => it.text.trim());
      if (!title && !items.length) return null;
      const style = o.boxStyle || 'tint';
      const pad = style === 'none' ? 0 : BASE.boxPad * s;
      const innerW = w - 2 * pad;
      const titleL = title ? textLayout(title, { font: R.fonts.sub, size: BASE.boxTitle * s, lh: 1.1, track: R.fonts.subTrack, upper: true, maxW: innerW, locale: R.locale }) : null;
      const cols = o.positionCols || (items.length > 3 && innerW > 620 ? 2 : 1);
      const colGap = 28 * s;
      const colW = (innerW - colGap * (cols - 1)) / cols;
      const dot = 5.5 * s, dotGap = 20 * s;
      const size = BASE.boxItem * s;
      const itemLs = items.map((it) => ({ it, L: textLayout(it.text, { font: R.fonts.body, size, lh: 1.15, maxW: colW - dotGap, locale: R.locale }) }));
      const itemGap = 11 * s;
      const placed = [];
      let gy = 0;
      for (let i = 0; i < itemLs.length; i += cols) {
        const chunk = itemLs.slice(i, i + cols);
        const rh = Math.max(...chunk.map((r) => r.L.h));
        chunk.forEach((r, j) => placed.push({ ...r, x: j * (colW + colGap), y: gy }));
        gy += rh + itemGap;
      }
      const gridH = placed.length ? gy - itemGap : 0;
      const titleGap = titleL && placed.length ? 18 * s : 0;
      const h = pad * 2 + (titleL ? titleL.h : 0) + titleGap + gridH;
      const th = R.theme;
      const solid = style === 'solid';
      const boxFill = solid ? th.primary : th.boxBg;
      const titleColor = solid ? U.ensureContrast(th.accent, th.primary, 3) : th.boxTitle;
      const textColor = solid ? U.onColor(th.primary) : th.boxText;
      const bulletColor = solid ? th.accent : th.bullet;
      return {
        key: 'positions', h,
        draw(ctx, x, y) {
          const ix = x + pad + (style === 'rule' ? 22 * s : 0);
          const itemsY = y + pad + (titleL ? titleL.h + titleGap : 0);
          // video: the box and its title come in first, then the items one by one
          enter(R, TL.positions, 0, 'rise', null, () => {
            if (style === 'tint' || solid) {
              roundRect(ctx, x, y, w, h, (o.boxRadius != null ? o.boxRadius : 18) * s);
              ctx.fillStyle = boxFill; ctx.fill();
            } else if (style === 'outline' || style === 'dashed') {
              const lw = 3.5 * s;
              roundRect(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, (o.boxRadius != null ? o.boxRadius : 18) * s);
              ctx.lineWidth = lw; ctx.strokeStyle = th.boxLine;
              if (style === 'dashed') { ctx.setLineDash([12 * s, 9 * s]); ctx.fillStyle = th.boxBg; ctx.fill(); }
              ctx.stroke();
              ctx.setLineDash([]);
            } else if (style === 'rule') {
              ctx.fillStyle = th.accent; ctx.fillRect(x, y, 6 * s, h);
            }
            if (titleL) {
              titleL.draw(ctx, ix, y + pad, titleColor);
              R.hit('positionsTitle', ix, y + pad, titleL.w, titleL.h);
            }
          });
          placed.forEach((p, i) => {
            const px = ix + p.x, py = itemsY + p.y;
            enter(R, TL.positions, 0.45 + i * TL.position, 'slide', null, () => {
              ctx.beginPath(); ctx.arc(px + dot, py + p.L.capPx / 2 + 1 * s, dot, 0, Math.PI * 2);
              ctx.fillStyle = bulletColor; ctx.fill();
              p.L.draw(ctx, px + dotGap, py, textColor);
            });
            R.hit(`position:${p.it.id}`, px, py, colW, p.L.h);
          });
        },
      };
    },

    contacts(R, w, s, o) {
      if (!R.show.contacts) return null;
      const pill = waPill(R);
      const items = (R.t.contacts || []).filter((c) => c.text.trim()).filter(pill ? notWaNumber(R) : () => true);
      const qr = qrText(R);
      if (!items.length && !qr && !pill) return null;
      const qrSize = qr ? Math.min(w * 0.34, 168 * s) : 0;
      const fullW = w;
      if (qr) w -= qrSize + 24 * s;
      const d = BASE.contactD * s;
      const gx = 20 * s;
      const rowGap = 14 * s;
      const rows = items.map((c, i) => {
        const main = i === 0;
        const rd = main ? d : d * 0.84;
        const lo = {
          font: main ? R.fonts.strong : { family: R.fonts.body.family, weight: 600 },
          size: (main ? BASE.contactMain : BASE.contactSub) * s, lh: 1.1, locale: R.locale,
        };
        // one line within maxW: below half size it keeps shrinking, never past the column
        const fit = (maxW) => {
          const L = lineLayout(c.text, { ...lo, maxW });
          return L.w > maxW + 1 ? textLayout(c.text, { ...lo, size: L.size * maxW / L.w, maxW: Infinity }) : L;
        };
        let L = fit(w - rd - gx);
        // beside the QR it keeps 0.6 of its size, else it takes a full row below the QR
        const below = !!qr && L.size < lo.size * 0.6;
        if (below) L = fit(fullW - rd - gx);
        return { c, L, main, rd, rh: Math.max(rd, L.vh), below };
      });
      let topH = 0;
      if (pill) {
        // the main way to reach the recruiter: as large as the main contact. Beside
        // the QR while the text keeps 3/4 of its size, else on its own row across
        // the full width (above the QR), else «Manda mensagem» over the number.
        const size = BASE.contactMain * s * 0.84;
        let P = fitPill(R, pill.text, size, d, w);
        if (qr && P.k < 0.75) P = { ...fitPill(R, pill.text, size, d, fullW), own: true };
        if (P.k < 0.75) {
          const two = fitPill(R, `${pill.cta}\n${pill.number}`, size, d, fullW);
          if (two.k > P.k) P = { ...two, own: P.own };
        }
        if (P.own) topH = P.rh + rowGap;
        rows.unshift(P);
      }
      const side = rows.filter((r) => !r.own && !r.below);
      const rowsH = side.length ? side.reduce((a, r) => a + r.rh, 0) + rowGap * (side.length - 1) : 0;
      const lowH = Math.max(rowsH, qrSize);
      const h = topH + lowH + rows.reduce((a, r) => a + (r.below ? rowGap + r.rh : 0), 0);
      return {
        key: 'contacts', h,
        draw(ctx, x, y) {
          // the QR and the rows beside it share the part below a pill on its own row;
          // the rows too long for beside it come after, each across the full width
          const lowY = y + topH;
          if (qr) {
            const qx = x + fullW - qrSize, qy = lowY + (lowH - qrSize) / 2;
            enter(R, TL.qr, 0, 'pop', { x: qx, y: qy, w: qrSize, h: qrSize }, () => drawQR(R, qr, qx, qy, qrSize));
          }
          let cy = lowY + (lowH - rowsH) / 2, by = lowY + lowH + rowGap;
          rows.forEach((r, i) => {
            const rowY = r.own ? y : r.below ? by : cy;
            const mid = rowY + r.rh / 2;
            const box = { x, y: rowY, w: r.pill ? r.pw : r.rd + gx + r.L.w, h: r.rh };
            const drawRow = r.pill ? () => drawWaPill(ctx, x, rowY, r.pw, r.rh, r.L, r.e) : () => {
              iconBadge(ctx, R, r.c.icon || 'phone', x + r.rd / 2, mid, r.rd, o.contactIcon || o.iconStyle);
              r.L.draw(ctx, x + r.rd + gx, mid - r.L.vh / 2, r.main ? (o.contactMainColor || R.theme.contactMain) : (o.contactColor || R.theme.contactText));
            };
            enter(R, TL.contacts, i * TL.contact, 'rise', box, () => (i === 0 ? pulse(R, box, drawRow) : drawRow()));
            R.hit(r.pill ? 'contact:wa' : `contact:${r.c.id}`, x, rowY, box.w, r.rh);
            if (r.below) by += r.rh + rowGap;
            else if (!r.own) cy += r.rh + rowGap;
          });
        },
      };
    },
  };

  function gapBetween(prev, key) {
    const g = BASE.gaps;
    if (prev === 'logo') return { gap: g.afterLogo, elastic: true };
    if (prev === 'kicker' && key === 'headline') return { gap: g.kickerHead, elastic: false };
    if (key === 'bar') return { gap: g.bar, elastic: false };
    if (prev === 'bar') return { gap: g.bar, elastic: true };
    return { gap: g[key] != null ? g[key] : g.def, elastic: true };
  }

  function buildStack(R, area, o, s, extra) {
    const order = o.order || ['logo', 'kicker', 'headline', 'bar', 'intro', 'benefits', 'positions', 'contacts'];
    const bottomKey = o.contactsAt === 'bottom' ? 'contacts' : null;
    const widthAt = (yy) => (area.widthAt ? Math.min(area.widthAt(area.y + yy), area.widthAt(area.y + yy + 160)) : area.w);
    const top = [];
    let y = 0, elastic = 0, prev = null;
    for (const key of order) {
      if (key === bottomKey || !MAKERS[key]) continue;
      const g = prev ? gapBetween(prev, key) : { gap: 0, elastic: false };
      const w = widthAt(y + g.gap * s);
      const blk = MAKERS[key](R, w, s, o);
      if (!blk) continue;
      const gap = prev ? g.gap * s + (g.elastic ? extra : 0) : 0;
      if (prev && g.elastic) elastic++;
      y += gap;
      blk.y = y; blk.w = w;
      top.push(blk);
      y += blk.h;
      prev = key;
    }
    let bottom = null;
    let need = y;
    if (bottomKey && order.includes(bottomKey)) {
      const w = widthAt(area.h - 180);
      bottom = MAKERS[bottomKey](R, w, s, o);
      if (bottom) {
        bottom.w = w;
        need = y + (top.length ? BASE.gaps.contacts * s : 0) + bottom.h;
      }
    }
    return { top, bottom, need, elastic };
  }

  // Plans a stack inside `area`: finds the largest common scale that fits,
  // then lets the spare room breathe between blocks. Never fails: very long
  // text simply gets smaller, and the report says by how much.
  function plan(R, area, o = {}) {
    // Video: the fitting gives the same result on every frame, so each stack is
    // planned once per video (templates call plan in the same order every frame).
    const A = R.anim;
    if (!A) return planNow(R, area, o);
    const i = A.planIdx++;
    if (!A.plans[i]) A.plans[i] = planNow(R, area, o);
    return A.plans[i];
  }
  function planNow(R, area, o) {
    // `o.theme` overrides colours for this stack only (e.g. white text on a band).
    const themed = (fn) => {
      if (!o.theme) return fn();
      const prev = R.theme;
      R.theme = { ...prev, ...o.theme };
      try { return fn(); } finally { R.theme = prev; }
    };
    const intended = R.style.textScale * (o.sizeMul || 1) * R.fmtMul;
    const build = (s, extra) => themed(() => buildStack(R, area, o, s, extra));
    let s = intended;
    let L = build(s, 0);
    if (L.need > area.h) {
      let lo = 0.2, hi = intended;
      let lowL = build(lo, 0);
      if (lowL.need > area.h) { s = lo; L = lowL; } else {
        for (let i = 0; i < 13; i++) {
          const mid = (lo + hi) / 2;
          const m = build(mid, 0);
          if (m.need <= area.h) { lo = mid; lowL = m; } else hi = mid;
        }
        s = lo; L = lowL;
      }
    }
    if (o.fill !== false) {
      const left = area.h - L.need;
      if (left > 1 && L.elastic) {
        const extra = Math.min(left / (L.elastic + (L.bottom ? 1.5 : 0.5)), (o.maxExtra || 80) * s);
        const L2 = build(s, extra);
        if (L2.need <= area.h + 0.5) L = L2;
      }
    }
    // Display blocks sized by design (e.g. a headline band) do not count as "shrunk".
    if (o.report !== false) R.noteScale(s / intended);
    return {
      s, height: L.need,
      draw(x = area.x, y = area.y, h = area.h) {
        themed(() => {
          const ctx = R.ctx;
          let y0 = y;
          if (o.align === 'center' && !L.bottom) y0 = y + Math.max(0, (h - L.need) / 2);
          if (o.align === 'end' && !L.bottom) y0 = y + Math.max(0, h - L.need);
          for (const b of L.top) {
            const fx = R.anim && BLOCK_FX[b.key];
            if (fx) enter(R, fx[0], 0, fx[1], { x, y: y0 + b.y, w: b.bw || b.w, h: b.h }, () => b.draw(ctx, x, y0 + b.y, b.w));
            else b.draw(ctx, x, y0 + b.y, b.w);
          }
          if (L.bottom) L.bottom.draw(ctx, x, (o.fill === false ? y0 + L.need - L.bottom.h : y + h - L.bottom.h), L.bottom.w);
        });
      },
    };
  }

  // Contacts laid out side by side (footer bands). Shrinks, then wraps to two rows.
  function contactsRow(R, area, o = {}) {
    if (!R.show.contacts) return;
    const qr = qrText(R);
    if (qr) {
      const qs = Math.min(area.h - 8, 150);
      const qx = area.x + area.w - qs, qy = area.y + (area.h - qs) / 2;
      enter(R, TL.qr, 0, 'pop', { x: qx, y: qy, w: qs, h: qs }, () => drawQR(R, qr, qx, qy, qs, o.qr));
      area = { ...area, w: area.w - qs - 28 };
    }
    const pill = waPill(R);
    const contacts = (R.t.contacts || []).filter((c) => c.text.trim()).filter(pill ? notWaNumber(R) : () => true);
    const items = pill ? [{ pill: true, text: pill.text }, ...contacts] : contacts;
    if (!items.length) return;
    const ctx = R.ctx;
    const font = { family: R.fonts.body.family, weight: 700 };
    const measureRow = (list, size) => {
      const d = size * 1.45, gx = size * 0.5, between = size * 1.3;
      const cells = list.map((c) => {
        const L = textLayout(c.text, { font, size, lh: 1.1, maxW: Infinity, locale: R.locale });
        return { c, L, d, gx, w: c.pill ? d * 0.95 + L.w + d * 0.5 : d + gx + L.w };
      });
      return { cells, w: cells.reduce((a, c) => a + c.w, 0) + between * (cells.length - 1), between, d };
    };
    const base = BASE.contactSub * R.fmtMul * R.style.textScale * (o.sizeMul || 1);
    let rows = [items];
    let size = base;
    let m = measureRow(items, size);
    if (m.w > area.w && items.length > 1) {
      const k = area.w / m.w;
      if (k < 0.8) rows = [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))];
    }
    const measured = () => rows.map((r) => measureRow(r, size));
    let ms = measured();
    const widest = Math.max(...ms.map((r) => r.w));
    if (widest > area.w) { size *= area.w / widest; ms = measured(); }
    const rowH = ms[0].d;
    const gapY = size * 0.5;
    const totalH = rowH * ms.length + gapY * (ms.length - 1);
    if (totalH > area.h) { size *= area.h / totalH; ms = measured(); }
    const rh = ms[0].d;
    let y = area.y + (area.h - (rh * ms.length + size * 0.5 * (ms.length - 1))) / 2;
    const th = R.theme;
    const iconTheme = { ...th, iconBg: o.iconBg || th.iconBg, iconFg: o.iconFg || th.iconFg, iconSoft: th.iconSoft };
    let n = 0;
    for (const r of ms) {
      let x = o.align === 'left' ? area.x : area.x + (area.w - r.w) / 2;
      for (const cell of r.cells) {
        const cy = y + rh / 2;
        const cx = x;
        const box = { x: cx, y, w: cell.w, h: rh };
        const rowY = y;
        const drawCell = cell.c.pill ? () => drawWaPill(ctx, cx, rowY, cell.w, rh, cell.L) : () => {
          const prevTheme = R.theme; R.theme = iconTheme;
          iconBadge(ctx, R, cell.c.icon || 'phone', cx + cell.d / 2, cy, cell.d, o.iconStyle || 'solid');
          R.theme = prevTheme;
          cell.L.draw(ctx, cx + cell.d + cell.gx, cy - cell.L.vh / 2, o.color || th.text);
        };
        const first = n === 0;
        enter(R, TL.contacts, n * TL.contact, 'rise', box, () => (first ? pulse(R, box, drawCell) : drawCell()));
        R.hit(cell.c.pill ? 'contact:wa' : `contact:${cell.c.id}`, x, y, cell.w, rh);
        x += cell.w + r.between;
        n++;
      }
      y += rh + size * 0.5;
    }
  }

  // Round stamp with short text (e.g. "Início imediato").
  function badge(R, cx, cy, r, o = {}) {
    const t = (R.t.badge || '').trim();
    if (!R.show.badge || !t) return;
    const ctx = R.ctx;
    const bg = o.bg || R.theme.badgeBg;
    const fg = o.fg || U.onColor(bg);
    const font = R.fonts.sub;
    let L = null;
    for (let size = r * 0.4; size >= r * 0.12; size *= 0.94) {
      L = textLayout(t, { font, size, lh: 1.02, track: 0.02, upper: true, maxW: r * 1.42, balance: true, locale: R.locale });
      if (L.lines.length <= 3 && !L.broken && L.vh <= r * 1.1) break;
    }
    enter(R, TL.badge, 0, 'stamp', { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, () => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(o.rotate != null ? o.rotate : -0.14);
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = 26 * R.scale;
      ctx.shadowOffsetY = 8 * R.scale;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, r * 0.018); ctx.strokeStyle = U.rgba(fg, 0.45); ctx.stroke();
      L.draw(ctx, -r * 0.71, -L.vh / 2, fg, 'center', r * 1.42);
      ctx.restore();
    });
    R.hit('badge', cx - r, cy - r, r * 2, r * 2);
  }

  // Cover-fits the photo into `rect` around its focal point, clipped by `clip`.
  function photo(R, rect, clip) {
    const ctx = R.ctx;
    const img = R.images.photo;
    const p = M.photoForFormat(R.project.photo, R.fmt?.id) || { zoom: 1, fx: 0.5, fy: img && img.height > img.width * 1.3 ? 0.36 : 0.5, flip: false };
    ctx.save();
    if (clip) { clip(ctx); ctx.clip(); } else { ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip(); }
    if (img) {
      const base = Math.max(rect.w / img.width, rect.h / img.height);
      // video: slow push-in (100 % → 108 %) around the focal point (Ken Burns)
      const kb = R.anim ? 1 + 0.08 * easeInOut(U.clamp(R.anim.t / R.anim.duration, 0, 1)) : 1;
      const sc = base * U.clamp(p.zoom || 1, 1, 4) * kb;
      const dw = img.width * sc, dh = img.height * sc;
      const dx = U.clamp(rect.x + rect.w / 2 - p.fx * dw, rect.x + rect.w - dw, rect.x);
      const dy = U.clamp(rect.y + rect.h / 2 - p.fy * dh, rect.y + rect.h - dh, rect.y);
      const adj = p.adj || {};
      const fx = [];
      if (adj.b && adj.b !== 1) fx.push(`brightness(${adj.b})`);
      if (adj.c && adj.c !== 1) fx.push(`contrast(${adj.c})`);
      if (adj.s && adj.s !== 1) fx.push(`saturate(${adj.s})`);
      // the person's adjustments go after a filter the template set (black and white…)
      const set = ctx.filter && ctx.filter !== 'none' ? [ctx.filter] : [];
      if (fx.length) ctx.filter = [...set, ...fx].join(' ');
      if (p.flip) {
        ctx.translate(dx + dw, dy); ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, dw, dh);
      } else {
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      R.report.photoUpscale = Math.max(R.report.photoUpscale, sc);
      R.photoInfo = { rect, dw, dh };
    } else {
      placeholder(R, rect);
      R.photoInfo = { rect, dw: rect.w, dh: rect.h };
    }
    ctx.restore();
    R.hit('photo', rect.x, rect.y, rect.w, rect.h, clip);
  }

  function placeholder(R, rect) {
    const ctx = R.ctx, th = R.theme;
    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    g.addColorStop(0, U.mix(th.primary, '#FFFFFF', 0.12));
    g.addColorStop(1, U.mix(th.primary, th.accent, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 3;
    for (let k = -rect.h; k < rect.w; k += 34) {
      ctx.beginPath(); ctx.moveTo(rect.x + k, rect.y + rect.h); ctx.lineTo(rect.x + k + rect.h, rect.y); ctx.stroke();
    }
    ctx.restore();
    const size = Math.min(rect.w, rect.h) * 0.46;
    const cx = rect.x + rect.w * 0.56, cy = rect.y + rect.h * 0.46;
    const trade = R.project.trade && RS.trades && RS.trades.get(R.project.trade);
    drawIcon(ctx, (trade && trade.icon) || R.template.icon || 'briefcase', cx, cy, size, 'rgba(255,255,255,0.22)', 1.1);
    if (R.mode === 'editor') {
      const label = 'Arraste aqui a sua fotografia';
      const size2 = 24;
      setFont(ctx, { family: 'DM Sans', weight: 600 }, size2, 0);
      const tw = ctx.measureText(label).width;
      const pw = tw + 96, ph = 60;
      const px = cx - pw / 2, py = cy + size * 0.62;
      roundRect(ctx, px, py, pw, ph, ph / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
      drawIcon(ctx, 'image-plus', px + 38, py + ph / 2, 28, th.primary, 2);
      ctx.fillStyle = th.primary; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(label, px + 64, py + ph / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Logo or brand name at a fixed spot (templates that keep it out of the stack).
  function logoAt(R, x, y, maxW, o = {}) {
    const blk = MAKERS.logo(R, maxW, R.fmtMul * (o.sizeMul || 1), o);
    if (!blk) return null;
    enter(R, TL.logo, 0, 'fade', null, () => {
      if (o.plate) {
        const pad = o.plate * R.fmtMul;
        roundRect(R.ctx, x - pad, y - pad, blk.bw + pad * 2, blk.h + pad * 2, (o.plateRadius || 14) * R.fmtMul);
        R.ctx.fillStyle = o.plateColor || '#FFFFFF';
        R.ctx.fill();
      }
      if (o.shadow) {
        R.ctx.save();
        R.ctx.shadowColor = 'rgba(0,0,0,0.5)';
        R.ctx.shadowBlur = 18 * R.scale;
        R.ctx.shadowOffsetY = 2 * R.scale;
        blk.draw(R.ctx, x, y, maxW);
        R.ctx.restore();
      } else {
        blk.draw(R.ctx, x, y, maxW);
      }
    });
    return blk;
  }

  // Instagram covers the top and bottom of a story with its own interface.
  const SAFE = { top: 250, bottom: 280 };
  function storyGuides(R) {
    const { ctx, W, H } = R;
    const B = SAFE.bottom;
    ctx.save();
    ctx.fillStyle = 'rgba(242,92,5,0.10)';
    ctx.fillRect(0, 0, W, SAFE.top);
    ctx.fillRect(0, H - B, W, B);
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(242,92,5,0.9)';
    ctx.beginPath(); ctx.moveTo(0, SAFE.top); ctx.lineTo(W, SAFE.top); ctx.moveTo(0, H - B); ctx.lineTo(W, H - B); ctx.stroke();
    ctx.setLineDash([]);
    setFont(ctx, { family: 'DM Sans', weight: 600 }, 26, 0);
    ctx.fillStyle = 'rgba(242,92,5,1)';
    ctx.fillText('Zona coberta pelo Instagram', 40, SAFE.top - 24);
    ctx.fillText('Zona coberta pelo Instagram', 40, H - B + 46);
    ctx.restore();
  }

  // ---------------------------------------------------------------- render entry point
  // opts: { format, locale, images: {photo, logo}, scale, mode: 'editor'|'export'|'thumb', guides,
  //         anim: animState() with `t` set (video frames; one state per video, same ctx every frame) }
  function render(ctx, project, opts = {}) {
    const fmt = M.FORMATS[opts.format || project.format] || M.FORMATS.portrait;
    const template = RS.templates.get(project.template);
    const locale = opts.locale || project.locale;
    const offer = M.offerProjection(project, locale, opts.output || (opts.anim ? 'video' : 'image'));
    const style = project.style;
    const scale = opts.scale || 1;
    const regions = [];
    const anim = opts.anim || null;
    if (anim) anim.planIdx = 0;
    const R = {
      ctx, W: fmt.w, H: fmt.h, fmt, project, template, locale, scale, anim,
      mode: opts.mode || 'export',
      t: offer.t,
      show: offer.show, brand: project.brand || {}, style,
      fonts: M.FONTS[style.fonts] || M.FONTS.modern,
      images: opts.images || {},
      fmtMul: fmt.id === 'story' ? 1.06 : 1,
      headLines: fmt.id === 'story' ? 5 : fmt.id === 'square' ? 3 : 4,
      report: { shrink: 1, photoUpscale: 0, minTextSize: Infinity },
      photoInfo: null,
      // video frames need no click areas (and cached stacks would keep adding them)
      hit: anim ? () => {} : (key, x, y, w, h, clip) => { regions.push({ key, x, y, w, h, clip }); },
      noteScale(k) { R.report.shrink = Math.min(R.report.shrink, k); },
    };
    R.theme = template.theme ? template.theme(R, baseTheme(style)) : baseTheme(style);
    ctx.save();
    // camera: { z, ax?, ay? } a push-in about (ax, ay), the centre by default
    // (the animated poster in a video)
    const cam = opts.camera || {};
    const z = cam.z || 1;
    const ax = cam.ax != null ? cam.ax : fmt.w / 2, ay = cam.ay != null ? cam.ay : fmt.h / 2;
    ctx.setTransform(scale * z, 0, 0, scale * z, scale * (1 - z) * ax, scale * (1 - z) * ay);
    ctx.imageSmoothingQuality = 'high';
    const previousReport = drawingReports.get(ctx);
    drawingReports.set(ctx, R.report);
    try { template.render(R); }
    finally {
      if (previousReport) drawingReports.set(ctx, previousReport); else drawingReports.delete(ctx);
      ctx.restore();
    }
    if (!Number.isFinite(R.report.minTextSize)) R.report.minTextSize = 0;
    if (R.mode === 'editor' && opts.guides && fmt.id === 'story') {
      ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0); storyGuides(R); ctx.restore();
    }
    return { regions, report: R.report, photo: R.photoInfo, width: fmt.w, height: fmt.h };
  }

  function renderToCanvas(project, opts = {}) {
    const fmt = M.FORMATS[opts.format || project.format];
    const k = opts.scale || 1;
    const c = document.createElement('canvas');
    c.width = Math.round(fmt.w * k);
    c.height = Math.round(fmt.h * k);
    const result = render(c.getContext('2d'), project, { ...opts, scale: k });
    return { canvas: c, ...result };
  }

  return {
    SAFE, loadFonts, render, renderToCanvas, animState, plan, contactsRow, badge, photo, logoAt, drawIcon, roundRect, drawQR, qrText, setFont,
    textLayout, fitHeadline, baseTheme, BASE, iconPath, analyseLogo, logoSource, qrModules, enter, pulse, TL,
  };
})();
