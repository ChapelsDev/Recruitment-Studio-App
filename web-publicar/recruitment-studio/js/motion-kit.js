// Shared helpers of the video recipes (js/recipes/): easing as functions of
// time, text fitted from the ad's own words, motion blur in proportion to
// speed, the WhatsApp conversation, QR codes and photo openings. Everything a
// recipe draws is a function of time: render(t) keeps no state between frames.
// R (per frame) = { ctx, P, t, scale, rec, boxes, recording, moving, lite }.
window.RS = window.RS || {};

RS.motionKit = (() => {
  const E = RS.engine;
  const W = 1080;

  // ---------------------------------------------------------------- time and easing
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const win = (t, a, d) => clamp((t - a) / d, 0, 1);
  const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x, 0, 1)));
  const expoIn = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * (clamp(x, 0, 1) - 1)));
  const expoInOut = (x) => {
    x = clamp(x, 0, 1);
    if (x === 0 || x === 1) return x;
    return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
  };
  // Critically damped spring: no overshoot, no bounce; 1 at x = 1.
  const SPRING_W = 8;
  const SPRING_END = 1 - (1 + SPRING_W) * Math.exp(-SPRING_W);
  const spring = (x) => { x = clamp(x, 0, 1); return Math.min(1, (1 - (1 + SPRING_W * x) * Math.exp(-SPRING_W * x)) / SPRING_END); };
  // Speed of an eased move (units per second).
  const speed = (f, t, h = 1 / 240) => (f(t + h) - f(t - h)) / (2 * h);

  // Text zone of a format: Instagram covers the top 250 px and the bottom
  // 280 px of a Story; the feed formats keep 56 px margins.
  function zones(fmt) {
    const story = fmt.id === 'story';
    const top = story ? 298 : 56, bottom = story ? fmt.h - 328 : fmt.h - 56;
    return { W: fmt.w, H: fmt.h, story, top, bottom, cy: (top + bottom) / 2, cH: bottom - top, left: 80, w: fmt.w - 160 };
  }

  // ---------------------------------------------------------------- text
  const mctx = document.createElement('canvas').getContext('2d');
  const noteSize = (P, L) => { if (P && L.size < P.minTextSize) P.minTextSize = L.size; return L; };
  function fitBox(text, o) {
    let maxSize = o.maxSize;
    const maxH = o.maxH || Infinity;
    for (let k = 0; k < 6; k++) {
      const L = E.fitHeadline(text, { font: o.font, lh: o.lh || 1.05, track: o.track || 0, upper: !!o.upper, locale: o.locale, maxW: o.maxW, maxLines: o.maxLines, maxSize, minSize: o.minSize });
      const fits = L.lines.length <= o.maxLines && !L.broken;
      if (fits && L.h <= maxH) return L;
      if (!fits || L.size <= o.minSize + 0.5) return null;
      maxSize = Math.max(o.minSize, L.size * Math.min(0.97, maxH / L.h));
    }
    return null;
  }
  // The largest layout that keeps every word (never dropped, never cut): more
  // lines when needed, else the smallest size wrapped freely.
  function fit(P, text, o) {
    const opts = { locale: (P && P.locale) || 'pt-PT', ...o };
    const L = fitBox(text, opts) || fitBox(text, { ...opts, maxLines: opts.maxLines + 2, maxH: (opts.maxH || Infinity) * 1.4 })
      || E.textLayout(text, { font: opts.font, size: opts.minSize, lh: opts.lh || 1.05, track: opts.track || 0, upper: !!opts.upper, locale: opts.locale, maxW: opts.maxW });
    L.font = opts.font; L.track = opts.track || 0;
    return noteSize(P, L);
  }
  // One line at a fixed size (labels, numbers).
  function line(P, text, o) {
    const L = E.textLayout(text, { font: o.font, size: o.size, lh: o.lh || 1, track: o.track || 0, upper: !!o.upper, locale: o.locale || (P && P.locale) || 'pt-PT', maxW: Infinity });
    L.font = o.font; L.track = o.track || 0;
    return o.note === false ? L : noteSize(P, L);
  }
  // Word boxes of a layout placed at (x, y) (y = top of the cap line).
  function words(L, x, y, align = 'left', boxW = 0) {
    E.setFont(mctx, L.font, L.size, L.track);
    const sp = mctx.measureText(' ').width;
    const out = [];
    L.lines.forEach((ln, i) => {
      let lx = x;
      if (align === 'center') lx = x + (boxW - L.widths[i]) / 2;
      else if (align === 'right') lx = x + boxW - L.widths[i];
      const base = y + L.capPx + i * L.lhPx;
      for (const wd of ln.split(' ')) {
        if (!wd) continue;
        const w = mctx.measureText(wd).width;
        out.push({ t: wd, x: lx, base, top: base - L.capPx, w, h: L.capPx, line: i });
        lx += w + sp;
      }
    });
    return out;
  }
  function fillText(ctx, text, x, base, L, color) {
    E.setFont(ctx, L.font, L.size, L.track);
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(text, x, base);
  }
  const textWidth = (text, L) => { E.setFont(mctx, L.font, L.size, L.track); return mctx.measureText(text).width; };

  // R.rec(x, y, w, h, tag, text): a settled, readable text, in poster pixels
  // after the current transform (the tests check zones and words with them).
  // Texts in motion (a blurred layer), faint or off the frame are skipped.
  function recorder(R) {
    return (x, y, w, h, tag, text) => {
      if (!R.boxes || !R.recording || R.moving) return;
      if (R.ctx.globalAlpha < 0.6) return;
      const m = R.ctx.getTransform();
      const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => [(m.a * px + m.c * py + m.e) / R.scale, (m.b * px + m.d * py + m.f) / R.scale]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), pts, tag: tag || '', text: text == null ? '' : String(text) };
      const fw = R.P && R.P.fmt ? R.P.fmt.w : W, fh = R.P && R.P.fmt ? R.P.fmt.h : 1920;
      if (b.x > fw || b.y > fh || b.x + b.w < 0 || b.y + b.h < 0) return;
      R.boxes.push(b);
    };
  }
  // Draws a layout and records it.
  function text(R, L, x, y, color, align = 'left', boxW = 0, tag) {
    L.draw(R.ctx, x, y, color, align, boxW);
    const bx = align === 'center' ? x + (boxW - L.w) / 2 : align === 'right' ? x + boxW - L.w : x;
    R.rec(bx, y, L.w, L.vh, tag, L.lines.join(' '));
  }

  // ---------------------------------------------------------------- motion blur
  // A layer drawn at a few instants within the shutter (half a frame at 30 fps)
  // and averaged: blur along the movement, in proportion to its speed.
  const SHUTTER = 1 / 60;
  const bufs = new Map();
  function buffers(w, h) {
    const key = `${w}x${h}`;
    let b = bufs.get(key);
    if (!b) {
      const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      b = { acc: mk(), tmp: mk() };
      if (bufs.size > 2) bufs.clear();
      bufs.set(key, b);
    }
    return b;
  }
  const samplesFor = (v) => clamp(Math.round((Math.abs(v) * SHUTTER) / 6), 1, 7);
  // drawCopy(ctx, s): the layer as it was s seconds ago; bbox in poster px.
  function blurred(R, v, drawCopy, bbox) {
    const big = !bbox || bbox.w * bbox.h > 0.4 * W * W * 1.78;
    const n = R.lite ? 1 : big ? Math.min(5, samplesFor(v)) : samplesFor(v);
    if (n <= 1) { drawCopy(R.ctx, 0); return; }
    const cv = R.ctx.canvas;
    const { acc, tmp } = buffers(cv.width, cv.height);
    const a = acc.getContext('2d'), g = tmp.getContext('2d');
    const tf = R.ctx.getTransform();
    let bx = 0, by = 0, bw = cv.width, bh = cv.height;
    if (bbox) {
      const k = R.scale;
      bx = clamp(Math.floor(bbox.x * k), 0, cv.width); by = clamp(Math.floor(bbox.y * k), 0, cv.height);
      bw = clamp(Math.ceil((bbox.x + bbox.w) * k), 0, cv.width) - bx; bh = clamp(Math.ceil((bbox.y + bbox.h) * k), 0, cv.height) - by;
      if (bw <= 0 || bh <= 0) return;
    }
    a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1; a.clearRect(bx, by, bw, bh);
    const ctx0 = R.ctx, moving = R.moving;
    R.moving = true;
    try {
      for (let k = 0; k < n; k++) {
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
        g.clearRect(bx, by, bw, bh);
        g.setTransform(tf);
        R.ctx = g;
        drawCopy(g, (SHUTTER * k) / (n - 1));
        R.ctx = ctx0;
        a.globalCompositeOperation = 'lighter'; a.globalAlpha = 1 / n;
        a.drawImage(tmp, bx, by, bw, bh, bx, by, bw, bh);
      }
    } finally {
      R.ctx = ctx0; R.moving = moving;
    }
    ctx0.save(); ctx0.setTransform(1, 0, 0, 1, 0, 0); ctx0.globalAlpha = 1; ctx0.globalCompositeOperation = 'source-over';
    ctx0.drawImage(acc, bx, by, bw, bh, bx, by, bw, bh);
    ctx0.restore();
  }
  // Whole-frame blur for camera moves: the drawn frame averaged with copies
  // moved back along the camera's screen velocity (poster px per second).
  function smear(R, vx, vy) {
    if (R.lite) return;
    const n = clamp(Math.round((Math.hypot(vx, vy) * SHUTTER) / 8), 1, 12);
    if (n <= 1) return;
    const cv = R.ctx.canvas;
    const { tmp } = buffers(cv.width, cv.height);
    const g = tmp.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'copy';
    g.drawImage(cv, 0, 0);
    g.globalCompositeOperation = 'source-over';
    const ctx = R.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = 1; k < n; k++) {
      const s = (SHUTTER * k) / (n - 1);
      ctx.globalAlpha = 1 / (k + 1);
      ctx.drawImage(tmp, -vx * s * R.scale, -vy * s * R.scale);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- shapes
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)));
  }
  const rectLerp = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), r: lerp(a.r || 0, b.r || 0, t) });
  // A paper plane and the double tick (drawn here: no brand artwork).
  function plane(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s / 24, s / 24);
    ctx.beginPath();
    ctx.moveTo(-9, -8); ctx.lineTo(10, 0); ctx.lineTo(-9, 8); ctx.lineTo(-6.5, 0.9); ctx.lineTo(3, 0); ctx.lineTo(-6.5, -0.9); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  function ticks(ctx, x, y, s, color, two = true) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s / 24, s / 24);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(1, 12); ctx.lineTo(5.5, 16.5); ctx.lineTo(14, 7); ctx.stroke();
    if (two) { ctx.beginPath(); ctx.moveTo(10, 15.5); ctx.lineTo(11.2, 16.5); ctx.lineTo(20, 7); ctx.stroke(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- QR
  // reveal(row, col, n) -> 0..1 (the module's scale) for QRs that build up.
  function qr(ctx, link, x, y, size, o = {}) {
    const m = E.qrModules(link);
    if (!m) return null;
    const quiet = size * 0.075;
    const cell = (size - quiet * 2) / m.n;
    if (o.tile !== false) { rrect(ctx, x, y, size, size, o.radius != null ? o.radius : size * 0.06); ctx.fillStyle = o.light || '#FFFFFF'; ctx.fill(); }
    ctx.fillStyle = o.dark || '#000000';
    for (let r = 0; r < m.n; r++) {
      for (let c = 0; c < m.n; c++) {
        if (!m.grid[r * m.n + c]) continue;
        const k = o.reveal ? o.reveal(r, c, m.n) : 1;
        if (k <= 0) continue;
        if (k >= 1) ctx.fillRect(x + quiet + c * cell, y + quiet + r * cell, cell + 0.5, cell + 0.5);
        else { const s = cell * k, off = (cell - s) / 2; ctx.fillRect(x + quiet + c * cell + off, y + quiet + r * cell + off, s, s); }
      }
    }
    return { n: m.n, cell, quiet };
  }
  // The finished QR drawn once (a full QR is about 900 rectangles).
  const qrCache = new Map();
  function qrSprite(link, size, o = {}) {
    const key = `${link}|${size}|${o.dark}|${o.light}|${o.radius}`;
    let c = qrCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(size);
      qr(c.getContext('2d'), link, 0, 0, size, o);
      if (qrCache.size > 20) qrCache.clear();
      qrCache.set(key, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- the conversation
  // The candidate's side of a WhatsApp chat: the ad's own message is typed in
  // the field and sent. S = { x, y, w, h, radius, font, fontStrong, colors:
  // { screen, head, headInk, field, fieldInk, bubble, bubbleInk, send, sendInk, frame? } }.
  function chatLayout(P, S) {
    const c = P.content;
    const k = S.w / 880;
    const inner = S.w - 64 * k;
    const title = c.brandName || (c.contact && c.contact.display) || '';
    const L = {
      S, k, head: Math.round(176 * k),
      title: title ? fit(P, title, { font: S.fontStrong || S.font, maxSize: Math.max(44, 56 * k), minSize: 40, maxW: S.w - 250 * k, maxLines: 1 }) : null,
      sub: c.brandName && c.contact ? line(P, c.contact.display, { font: S.font, size: Math.max(40, 42 * k) }) : null,
      msg: fit(P, c.message || '', { font: S.font, maxSize: Math.max(48, 64 * k), minSize: 40, maxW: inner - 150 * k, maxLines: 6, lh: 1.2 }),
    };
    L.fieldH = Math.max(120 * k, L.msg.h + 70 * k);
    L.bubbleW = Math.min(inner - 30 * k, L.msg.w + 80 * k);
    L.bubbleH = L.msg.h + 104 * k;
    L.fieldY = S.y + S.h - L.fieldH - 26 * k;
    L.bubble = { x: S.x + S.w - 30 * k - L.bubbleW, y: L.fieldY - 44 * k - L.bubbleH, w: L.bubbleW, h: L.bubbleH, r: 34 * k };
    return L;
  }
  // tl: { type0, type1 (typing), send (the message moves into the bubble), noBubble } in seconds of lt.
  function chatDraw(R, L, lt, tl) {
    const { ctx } = R;
    const S = L.S, C = S.colors, k = L.k;
    const { x, y, w, h } = S;
    ctx.save();
    rrect(ctx, x, y, w, h, S.radius);
    ctx.fillStyle = C.screen; ctx.fill();
    ctx.clip();
    // header: a helmet in a circle (never a face), the brand and the number
    ctx.fillStyle = C.head; ctx.fillRect(x, y, w, L.head);
    const av = 100 * k;
    ctx.beginPath(); ctx.arc(x + 40 * k + av / 2, y + L.head / 2, av / 2, 0, Math.PI * 2); ctx.fillStyle = C.headInk; ctx.fill();
    E.drawIcon(ctx, 'hard-hat', x + 40 * k + av / 2, y + L.head / 2, av * 0.56, C.head, 2.2);
    if (L.title) {
      const ty = L.sub ? y + L.head / 2 - L.title.vh - 8 * k : y + (L.head - L.title.vh) / 2;
      text(R, L.title, x + 170 * k, ty, C.headInk, 'left', 0, 'chat-title');
      if (L.sub) text(R, L.sub, x + 170 * k, y + L.head / 2 + 16 * k, C.headInk, 'left', 0, 'chat-number');
    }
    const chars = [...L.msg.lines.join(' ')].length;
    const typed = Math.floor(chars * win(lt, tl.type0, tl.type1 - tl.type0));
    const field = { x: x + 26 * k, y: L.fieldY, w: w - (52 + 130) * k, h: L.fieldH, r: Math.min(44 * k, L.fieldH / 2) };
    rrect(ctx, field.x, field.y, field.w, field.h, field.r); ctx.fillStyle = C.field; ctx.fill();
    const sb = 116 * k, sx = x + w - 26 * k - sb, sy = L.fieldY + L.fieldH - sb - 2 * k;
    const press = lt >= tl.send - 0.12 && lt < tl.send + 0.12 ? 0.92 : 1;
    ctx.save(); ctx.translate(sx + sb / 2, sy + sb / 2); ctx.scale(press, press);
    ctx.beginPath(); ctx.arc(0, 0, sb / 2, 0, Math.PI * 2); ctx.fillStyle = C.send; ctx.fill();
    plane(ctx, 2 * k, 0, 46 * k, C.sendInk);
    ctx.restore();
    const sent = win(lt, tl.send, 0.32);
    if (sent <= 0) {
      if (typed > 0) drawPartial(R, L.msg, field.x + 36 * k, field.y + (field.h - L.msg.vh) / 2, C.fieldInk, typed, lt);
    } else if (!tl.noBubble) {
      const e = expoOut(sent);
      const b = rectLerp({ ...field, w: Math.min(field.w, L.bubbleW) }, L.bubble, e);
      rrect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.fillStyle = C.bubble; ctx.fill();
      const tx = lerp(field.x + 36 * k, L.bubble.x + 40 * k, e), ty = lerp(field.y + (field.h - L.msg.vh) / 2, L.bubble.y + 34 * k, e);
      text(R, L.msg, tx, ty, C.bubbleInk, 'left', 0, 'chat-message');
      if (lt >= tl.send + 0.25) ticks(ctx, L.bubble.x + L.bubble.w - 76 * k, L.bubble.y + L.bubble.h - 58 * k, 46 * k, C.bubbleInk, lt >= tl.send + 0.4);
    }
    ctx.restore();
    if (C.frame) { rrect(ctx, x, y, w, h, S.radius); ctx.lineWidth = 10 * k; ctx.strokeStyle = C.frame; ctx.stroke(); }
  }
  // The first n characters of a layout (lines as laid out), with a caret.
  function drawPartial(R, L, x, y, color, n, lt) {
    const { ctx } = R;
    let left = n, cx = x, cy = y;
    const shown = [];
    for (let i = 0; i < L.lines.length && left > 0; i++) {
      const ln = [...L.lines[i]];
      const part = ln.slice(0, left).join('');
      left -= ln.length + 1;
      fillText(ctx, part, x, y + L.capPx + i * L.lhPx, L, color);
      shown.push(part);
      cx = x + textWidth(part, L); cy = y + i * L.lhPx;
    }
    R.rec(x, y, L.w, L.vh, 'chat-typing', shown.join(' '));
    if (Math.floor(lt * 4) % 2 === 0) { ctx.fillStyle = color; ctx.fillRect(cx + 4, cy - 4, 4, L.capPx + 10); }
  }

  // ---------------------------------------------------------------- photo openings
  // A photo fixed to the screen, gently drifting (the same at 0 s and at the end).
  // focus (the point of the photo to keep in view, 0..1): brought to the centre
  // of box (screen px; the frame when none, only its part on the frame counts),
  // zooming in up to ZOOM_MAX as the box gets smaller than the frame, never an
  // edge inside the box. Without a focus: centred on the frame, as before.
  const ZOOM_MAX = 2;
  function screenPhoto(ctx, img, fmt, t, duration, k = 0, focus = null, box = null) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const a = (2 * Math.PI * t) / duration + k;
    const base = Math.max(fmt.w / iw, fmt.h / ih) * (1.06 + 0.02 * Math.sin(a));
    const jx = 14 * Math.sin(a), jy = 10 * Math.cos(a);
    if (!focus) {
      const w = iw * base, h = ih * base;
      ctx.drawImage(img, fmt.w / 2 - w / 2 + jx, fmt.h / 2 - h / 2 + jy, w, h);
      return;
    }
    const x0 = clamp(box ? box.x : 0, 0, fmt.w), y0 = clamp(box ? box.y : 0, 0, fmt.h);
    const x1 = clamp(box ? box.x + box.w : fmt.w, 0, fmt.w), y1 = clamp(box ? box.y + box.h : fmt.h, 0, fmt.h);
    const bw = x1 - x0, bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;
    const fx = clamp(focus.x, 0, 1), fy = clamp(focus.y, 0, 1);
    // the scale that lets the point sit at the box's centre (a whole frame never zooms)
    const need = Math.max(bw / (2 * iw * Math.max(0.01, Math.min(fx, 1 - fx))), bh / (2 * ih * Math.max(0.01, Math.min(fy, 1 - fy))));
    const room = 1 + (ZOOM_MAX - 1) * (1 - (bw * bh) / (fmt.w * fmt.h));
    const s = base * clamp(need / base, 1, room);
    const w = iw * s, h = ih * s;
    ctx.drawImage(img, clamp(x0 + bw / 2 - fx * w + jx, x1 - w, x0), clamp(y0 + bh / 2 - fy * h + jy, y1 - h, y0), w, h);
  }
  // An opening onto a screen-fixed photo: shape(g) fills the opening on a
  // screen-size buffer, the photo is kept only there, the buffer goes on the
  // frame. Without a photo the opening is a plain tile in `fallback`. focus:
  // the photo's point kept at the frame's centre (see screenPhoto).
  const masks = new Map();
  function opening(R, img, shape, k = 0, fallback = '#3A3A3A', focus = null) {
    const cv = R.ctx.canvas;
    const key = `${cv.width}x${cv.height}`;
    let m = masks.get(key);
    if (!m) { m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height; if (masks.size > 2) masks.clear(); masks.set(key, m); }
    const g = m.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, m.width, m.height);
    g.setTransform(R.ctx.getTransform()); // the opening moves with the frame's transform (travel moves)
    g.fillStyle = '#FFFFFF';
    shape(g);
    g.globalCompositeOperation = 'source-in';
    g.setTransform(R.scale, 0, 0, R.scale, 0, 0);
    if (img) screenPhoto(g, img, R.P.fmt, R.t, R.P.timeline.duration, k, focus);
    else { g.fillStyle = fallback; g.fillRect(0, 0, R.P.fmt.w, R.P.fmt.h); }
    g.globalCompositeOperation = 'source-over';
    const ctx = R.ctx;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(m, 0, 0); ctx.restore();
  }
  // A photo covering a rectangle (tiles, thumbnails). fy: a focus ({ x, y },
  // 0..1: that point as near the centre as the photo allows) or, a number,
  // where the crop sits from top to bottom, centred across.
  function cover(ctx, img, x, y, w, h, fy = 0.4) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const k = Math.max(w / iw, h / ih);
    const sw = w / k, sh = h / k;
    if (fy && typeof fy === 'object') ctx.drawImage(img, clamp(fy.x * iw - sw / 2, 0, iw - sw), clamp(fy.y * ih - sh / 2, 0, ih - sh), sw, sh, x, y, w, h);
    else ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * fy, sw, sh, x, y, w, h);
  }

  // The page of an act at its local time: a page lasts a bar (2 s); items are
  // the indices of the act's content shown on that page.
  const PAGE_S = 2;
  function page(A) {
    const pages = A.pages && A.pages.length ? A.pages : [[]];
    const lt = A.lt || 0;
    const index = clamp(Math.floor(lt / PAGE_S), 0, pages.length - 1);
    return { index, count: pages.length, lt: lt - index * PAGE_S, items: pages[index], first: index === 0, last: index === pages.length - 1 };
  }

  // ---------------------------------------------------------------- the card
  // The contact card of a model (its frame is the model's own): the WhatsApp
  // number, the button with the call (the video's words), the QR with its
  // hint; without a number, the brand and the ad's other contacts (the
  // video's, unless hidden), else its headline. o = { font, bold, upper, cx,
  // cy, maxW, maxH, numberMax, qrMax }. Positions are absolute.
  function cardLayout(P, o) {
    const c = P.content, Z = P.Z;
    const cx = o.cx != null ? o.cx : Z.W / 2, cy = o.cy != null ? o.cy : Z.cy;
    const maxW = o.maxW || Z.w, maxH = o.maxH || Z.cH - 20;
    const L = { cx, maxW, parts: [] };
    const add = (key, h, gap) => L.parts.push({ key, h, gap });
    if (c.showLogo && c.brandName && !o.noBrand) { L.brand = fit(P, c.brandName, { font: o.bold, upper: true, track: 0.06, maxSize: 52, minSize: 40, maxW, maxLines: 2 }); add('brand', L.brand.vh, 44); }
    if (c.contact) {
      L.number = fit(P, c.contact.display, { font: o.font, maxSize: o.numberMax || 130, minSize: 60, maxW: maxW + 20, maxLines: 1 });
      L.cta = fit(P, c.contact.cta, { font: o.font, upper: !!o.upper, maxSize: 64, minSize: 40, maxW: Math.min(maxW + 40, 940) - 170, maxLines: 2 });
      L.pill = { w: Math.min(maxW + 40, L.cta.w + 210), h: Math.max(150, L.cta.vh + 76) };
      add('number', L.number.vh, 50); add('pill', L.pill.h, 50);
      if (c.qr) {
        L.hint = fit(P, c.contact.hint, { font: o.bold, maxSize: 46, minSize: 40, maxW, maxLines: 2 });
        const others = L.parts.reduce((a, p) => a + p.h + p.gap, 0) + 30 + L.hint.vh;
        L.qr = clamp(maxH - others, 220, o.qrMax || 440);
        add('qr', L.qr, 30); add('hint', L.hint.vh, 0);
      }
    } else {
      L.lines = c.contacts.slice(0, 3).map((s) => fit(P, s, { font: o.bold, maxSize: 70, minSize: 44, maxW, maxLines: 2 }));
      if (!L.lines.length && !L.brand) L.lines = [fit(P, c.headline || ' ', { font: o.font, upper: !!o.upper, maxSize: 110, minSize: 56, maxW, maxLines: 4 })];
      L.lines.forEach((ln, i) => add(`line${i}`, ln.vh, 36));
    }
    if (L.parts.length) L.parts[L.parts.length - 1].gap = 0;
    L.h = L.parts.reduce((a, p) => a + p.h + p.gap, 0);
    let y = cy - L.h / 2;
    for (const p of L.parts) { L[`${p.key}Y`] = y; y += p.h + p.gap; }
    L.top = cy - L.h / 2;
    return L;
  }
  // The card at lt seconds of its act: its parts rise into place one after
  // the other (from clips: no fades), the QR grows, the button is pressed on
  // the last beat of the first bar. A text counts as shown once it has
  // arrived. o = { ink, ctaFill, ctaInk, hintInk, qrDark, qrLight, start (s), step (s), dy }.
  function cardDraw(R, CL, lt, o) {
    const { ctx } = R, Z = R.P.Z, c = R.P.content;
    const t0 = o.start || 0, step = o.step != null ? o.step : 0.12, dy = o.dy || 0;
    const settle = (k, draw) => { const rr = R.rec; if (k < 0.95) R.rec = () => {}; try { draw(); } finally { R.rec = rr; } };
    const rise = (i, y, h, draw) => {
      const k = expoOut(win(lt, t0 + i * step, 0.35));
      if (k <= 0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y - 30 + dy, Z.W, h + 60); ctx.clip();
      settle(k, () => draw(y + dy + (1 - k) * (h + 40)));
      ctx.restore();
    };
    let i = 0;
    if (CL.brand) rise(i++, CL.brandY, CL.brand.vh, (y) => text(R, CL.brand, CL.cx - CL.maxW / 2, y, o.ink, 'center', CL.maxW, 'marca'));
    if (CL.number) {
      rise(i++, CL.numberY, CL.number.vh, (y) => text(R, CL.number, CL.cx - CL.number.w / 2, y, o.ink, 'left', 0, 'número'));
      const g = spring(win(lt, t0 + i++ * step, 0.4));
      if (g > 0.01) {
        const P0 = CL.pill, press = lt >= t0 + 1.5 && lt < t0 + 1.75 ? 1 - 0.035 * (1 - expoOut(win(lt, t0 + 1.5, 0.25))) : 1;
        const w = P0.w * g, x = CL.cx - w / 2, y = CL.pillY + dy;
        ctx.save(); ctx.translate(CL.cx, y + P0.h / 2); ctx.scale(press, press); ctx.translate(-CL.cx, -(y + P0.h / 2));
        rrect(ctx, x, y, w, P0.h, P0.h / 2); ctx.fillStyle = o.ctaFill; ctx.fill();
        if (g > 0.9) {
          const ix = CL.cx - (CL.cta.w + 90) / 2;
          E.drawIcon(ctx, 'message-circle', ix + 32, y + P0.h / 2, 64, o.ctaInk, 2.6);
          settle(g, () => text(R, CL.cta, ix + 90, y + (P0.h - CL.cta.vh) / 2, o.ctaInk, 'left', 0, 'botão'));
        }
        ctx.restore();
      }
      if (CL.qr) {
        const q = spring(win(lt, t0 + i++ * step + 0.1, 0.45));
        if (q > 0.01) {
          // (a model may move the QR off the middle: CL.qrCx)
          ctx.save(); ctx.translate(CL.qrCx != null ? CL.qrCx : CL.cx, CL.qrY + CL.qr / 2 + dy); ctx.scale(q, q);
          ctx.drawImage(qrSprite(c.contact.link, CL.qr, { dark: o.qrDark || '#0B0B0B', light: o.qrLight || '#FFFFFF', radius: 22 }), -CL.qr / 2, -CL.qr / 2, CL.qr, CL.qr);
          ctx.restore();
        }
        rise(i++, CL.hintY, CL.hint.vh, (y) => text(R, CL.hint, CL.cx - CL.maxW / 2, y, o.hintInk || o.ink, 'center', CL.maxW, 'aponta'));
      }
    }
    (CL.lines || []).forEach((L, j) => rise(i++, CL[`line${j}Y`], L.vh, (y) => text(R, L, CL.cx - CL.maxW / 2, y, o.ink, 'center', CL.maxW, 'contacto')));
  }

  return {
    page, PAGE_S, cardLayout, cardDraw,
    clamp, lerp, win, expoOut, expoIn, expoInOut, spring, speed, zones,
    fit, line, words, fillText, textWidth, recorder, text,
    blurred, smear, rrect, rectLerp, plane, ticks, qr, qrSprite, chatLayout, chatDraw, opening, cover, screenPhoto,
  };
})();
