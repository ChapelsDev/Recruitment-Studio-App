// Interface motion (RS.ui): the gliding «selected» pill of segmented controls,
// tabs and the section bar, numbers that count instead of jumping, and small
// hooks for waits and exits. Motion only moves what is cheap to animate
// (transform, opacity); in «Calmo» (html[data-motion="calm"]) values show
// at once and nothing flies.
window.RS = window.RS || {};
RS.ui = (() => {
  const { html, useState, useEffect, useLayoutEffect, useRef } = window.htmPreact;
  // the motion style on <html> (js/appearance.js): 'illustrative' | 'sober' | 'calm'
  const style = () => document.documentElement.dataset.motion || 'sober';
  const calm = () => style() === 'calm';
  const illustrative = () => style() === 'illustrative';

  // ---------------------------------------------------------------- the gliding pill
  const SELECTED = '[aria-checked="true"],[aria-selected="true"],.on';
  const HOSTS = '.seg, .mode-switch, .kind-switch, .video-tabs, .rail, .texts-locales';
  const hosts = new Map(); // container → { update, cleanup }
  const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => entries.forEach((e) => { const h = hosts.get(e.target); if (h) h.update(); })) : null;
  // Where the pill sits under the chosen child, in the container's coordinates:
  // the tabs get an underline, everything else a pill the size of the child.
  function box(container, el) {
    if (container.classList.contains('video-tabs')) return { x: el.offsetLeft + 8, y: el.offsetTop + el.offsetHeight - 3, w: Math.max(0, el.offsetWidth - 16), h: 3 };
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  }
  // One .glide-pill per container, moved (transform + size) under the child
  // that matches `selector`. Returns a function that removes it.
  function glide(container, selector = SELECTED) {
    if (hosts.has(container)) return hosts.get(container).cleanup;
    const pill = document.createElement('span');
    pill.className = 'glide-pill';
    pill.setAttribute('aria-hidden', 'true');
    // Positioning belongs in CSS: an inline relative position would override
    // the phone's fixed navigation after resizing a desktop editor.
    container.classList.add('has-glide');
    let placed = false;
    function update() {
      if (!container.isConnected) return;
      if (pill.parentNode !== container) container.appendChild(pill); // a re-render may have dropped it
      const on = [...container.children].find((c) => c !== pill && c.matches(selector));
      if (!on || !on.offsetWidth) { pill.style.opacity = '0'; placed = false; return; }
      const b = box(container, on);
      pill.style.opacity = '1';
      if (!placed || calm()) {
        // the first placement (and the return after hiding) does not fly in from 0,0
        pill.style.transition = 'none';
        pill.style.width = `${b.w}px`;
        pill.style.height = `${b.h}px`;
        pill.style.transform = `translate(${b.x}px, ${b.y}px)`;
        void pill.offsetWidth;
        pill.style.transition = '';
        placed = true;
        return;
      }
      // where the pill is on screen now (mid-flight too), in the container's coordinates
      const m = new DOMMatrixReadOnly(getComputedStyle(pill).transform);
      const w0 = pill.offsetWidth * m.a, h0 = pill.offsetHeight * m.d;
      pill.style.transition = 'none';
      pill.style.width = `${b.w}px`;
      pill.style.height = `${b.h}px`;
      pill.style.transform = `translate(${m.e}px, ${m.f}px) scale(${b.w ? w0 / b.w : 1}, ${b.h ? h0 / b.h : 1})`;
      void pill.offsetWidth;
      pill.style.transition = '';
      pill.style.transform = `translate(${b.x}px, ${b.y}px)`;
      if (illustrative()) settle(pill, Math.abs(b.x - m.e) >= Math.abs(b.y - m.f));
    }
    function cleanup() {
      hosts.delete(container);
      if (sizes) sizes.unobserve(container);
      pill.remove();
      container.classList.remove('has-glide');
    }
    hosts.set(container, { update, cleanup });
    if (sizes) sizes.observe(container);
    update();
    return cleanup;
  }
  // Ilustrativo: the pill hangs like the crane's trolley — once it stops it swings
  // (a bar across) or bounces (the desktop rail, top to bottom). Individual
  // rotate / translate, so the glide's own transform is left alone.
  function settle(pill, across) {
    const go = (e) => {
      if (e.propertyName !== 'transform') return;
      pill.removeEventListener('transitionend', go);
      if (pill.__settle) pill.__settle.cancel();
      pill.style.transformOrigin = across ? '50% -10px' : '';
      const a = across
        ? pill.animate([{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '5deg' }, { rotate: '-2.5deg' }, { rotate: '1deg' }, { rotate: '0deg' }], { duration: 760, easing: 'ease-out' })
        : pill.animate([{ translate: '0 0' }, { translate: '0 5px' }, { translate: '0 -2px' }, { translate: '0 0' }], { duration: 420, easing: 'ease-out' });
      pill.__settle = a;
      a.onfinish = a.oncancel = () => { if (pill.__settle === a) { pill.style.transformOrigin = ''; pill.__settle = null; } };
    };
    pill.addEventListener('transitionend', go);
  }
  // Every host under root, now and later: one MutationObserver adds pills to new
  // containers and moves them when a choice changes.
  function autoGlide(root = document) {
    const scan = (node) => {
      if (node.nodeType !== 1) return;
      if (node.matches(HOSTS)) glide(node);
      node.querySelectorAll(HOSTS).forEach((n) => glide(n));
    };
    const drop = (node) => {
      if (node.nodeType !== 1 || node.classList.contains('glide-pill')) return;
      for (const [c, h] of hosts) if (node === c || node.contains(c)) h.cleanup();
    };
    scan(root.nodeType === 9 ? root.documentElement : root);
    const mo = new MutationObserver((records) => {
      const touched = new Set();
      for (const r of records) {
        if (r.type === 'childList') {
          r.removedNodes.forEach(drop);
          r.addedNodes.forEach(scan);
          if (hosts.has(r.target)) touched.add(r.target);
        } else {
          const t = r.target;
          if (hosts.has(t)) touched.add(t);
          if (t.parentElement && hosts.has(t.parentElement)) touched.add(t.parentElement);
        }
      }
      touched.forEach((c) => { const h = hosts.get(c); if (h) h.update(); });
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-checked', 'aria-selected'] });
    return () => { mo.disconnect(); [...hosts.values()].forEach((h) => h.cleanup()); };
  }

  // ---------------------------------------------------------------- numbers that count
  const easeOut = (k) => 1 - (1 - k) ** 3;
  // A number counts from the value it showed to the new one; anything that is
  // not a number shows as written; calm mode shows the value at once.
  function CountUp({ value, duration = 600, format = String }) {
    const [shown, setShown] = useState(value);
    const shownRef = useRef(value);
    useEffect(() => {
      const from = typeof shownRef.current === 'number' ? shownRef.current : NaN;
      const set = (v) => { shownRef.current = v; setShown(v); };
      if (typeof value !== 'number' || !Number.isFinite(from) || from === value || calm()) { set(value); return undefined; }
      const whole = Number.isInteger(from) && Number.isInteger(value);
      const t0 = performance.now();
      let raf = 0;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / duration);
        const v = from + (value - from) * easeOut(k);
        set(k < 1 ? (whole ? Math.round(v) : Math.round(v * 10) / 10) : value);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [value]);
    return html`<span class="count-up">${format(shown)}</span>`;
  }

  // ---------------------------------------------------------------- waits
  // True only once `flag` has stayed true for `ms`: short waits show nothing.
  function useDelayed(flag, ms = 300) {
    const [on, setOn] = useState(false);
    useEffect(() => {
      if (!flag) { setOn(false); return undefined; }
      const id = setTimeout(() => setOn(true), ms);
      return () => clearTimeout(id);
    }, [flag, ms]);
    return flag && on;
  }

  // Waits («Balão», 2026-10-28): the icon's three dots typing in a grey bubble, with the
  // words on long waits. `bar`: the small one at the top of the screen, without words.
  function TypingLoader({ label, bar }) {
    return html`<span class=${'typing-loader' + (bar ? ' bar' : '')} role=${bar ? null : 'status'}>
      <span class="say typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      ${label && html`<span class="typing-label">${label}</span>`}
    </span>`;
  }

  // ---------------------------------------------------------------- the export moment
  // A tower crane on the preview table (the same drawing in both themes).
  const JIB = (() => {
    let d = 'M30 168V22M42 168V22M30 34L42 46L30 58L42 70L30 82L42 94L30 106L42 118L30 130L42 142L30 154L42 166M30 22L36 6L42 22M36 6V22M8 22H228M42 30H222L228 22M36 6L228 22M36 6L8 22M42 30';
    for (let x = 42; x < 222; x += 10) d += `L${x + 5} ${(x - 42) % 20 ? 30 : 22}`;
    return d;
  })();
  const craneArt = (cable, load) => html`<svg class="crane-art" viewBox="0 0 240 170" aria-hidden="true" focusable="false">
    <path class="crane-steel" d=${JIB} />
    <path class="crane-steel thin" d="M0 168.5H240" />
    <rect class="crane-signal" x="10" y="24" width="18" height="10" rx="2" />
    <rect class="crane-signal" x="113" y="29" width="14" height="5" rx="1.5" />
    ${cable}
    ${load}
  </svg>`;
  // the file on the hook: a white sheet with a play mark
  const fileLoad = html`<g class="crane-sway">
    <path class="crane-hook" d="M120 0V7M120 7c-4 0-4 6 0 6s4-3 3-5" />
    <path class="crane-steel thin" d="M120 13L104 21M120 13L136 21" />
    <rect class="crane-file" x="102" y="21" width="36" height="44" rx="4" />
    <path class="crane-play" d="M115 36v14l11-7z" />
  </g>`;
  // The crane hoists the file while a girder fills: progress 0..1 (or null:
  // steps only, the load bobs), the percentage counting up beside the words.
  function CraneProgress({ progress, label }) {
    const p = progress == null ? null : Math.max(0, Math.min(1, progress));
    const top = 40 + 62 * (1 - (p == null ? 0.5 : p)); // where the load hangs
    return html`<div class=${'crane' + (p == null ? ' steps' : '')} role="status">
      ${craneArt(
        html`<path class="crane-steel thin crane-cable" d="M120 34V102" style=${`transform:scaleY(${(top - 34) / 68})`} />`,
        html`<g class="crane-hoist" style=${`transform:translateY(${top}px)`}>${fileLoad}</g>`,
      )}
      <span class="crane-girder" aria-hidden="true"><span style=${p == null ? '' : `transform:scaleX(${p})`}></span></span>
      <p class="crane-count">${p != null && html`<span class="crane-pct"><${CountUp} value=${Math.round(p * 100)} duration=${300} />%</span>`}<span>${label}</span></p>
    </div>`;
  }
  // The moment it is ready: the load sways and settles, a black bubble says «Pronto»
  // with the two ticks, small bubbles rise; onDone after `duration`.
  function Celebration({ title = 'Pronto', detail, onDone, duration = 1400 }) {
    const done = useRef(onDone);
    done.current = onDone;
    useEffect(() => {
      const id = setTimeout(() => { if (done.current) done.current(); }, duration);
      return () => clearTimeout(id);
    }, []);
    return html`<div class="celebration" role="status">
      <div class="celebration-art">
        ${craneArt(html`<path class="crane-steel thin" d="M120 34V40" />`, html`<g style="transform:translateY(40px)"><g class="celebration-load">${fileLoad}</g></g>`)}
        <span class="ready-bubble">${title}<svg class="ticks" viewBox="0 0 26 16" aria-hidden="true" focusable="false"><path d="M2 9l4 4 8-10" /><path d="M11 12l1 1 8-10" /></svg></span>
      </div>
      <span class="celebration-bubbles" aria-hidden="true">${[0, 1, 2].map((i) => html`<i key=${i} style=${`--i:${i}`}></i>`)}</span>
      ${detail && html`<p class="celebration-detail">${detail}</p>`}
    </div>`;
  }

  // ---------------------------------------------------------------- the opening
  // A first opening carries on from the start screen (#boot in index.html): the
  // same drawing, its animations shifted by the time already gone, so nothing
  // jumps; then the words, and it steps aside — at most 2.6 s after the page
  // started (a little under a second when the app was slow), at once on a key or a tap.
  const openingIcon = html`<svg class="boot-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="opening-or" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a3a"/><stop offset="1" stop-color="#dc4a00"/></linearGradient>
        <radialGradient id="opening-glow" cx=".25" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <clipPath id="opening-sq"><rect width="512" height="512" rx="114"/></clipPath>
      </defs>
      <rect width="512" height="512" rx="114" fill="url(#opening-or)"/>
      <rect width="512" height="512" rx="114" fill="url(#opening-glow)"/>
      <g clip-path="url(#opening-sq)"><g class="boot-bubble"><g transform="rotate(10 160 160)">
        <rect x="-150" y="-110" width="530" height="410" rx="124" fill="#fff"/>
        <path d="M250 270 L430 430 L330 240 Z" fill="#fff"/>
        <circle class="boot-dot" cx="110" cy="150" r="32" fill="#111317"/>
        <circle class="boot-dot" cx="205" cy="150" r="32" fill="#111317"/>
        <circle class="boot-dot" cx="300" cy="150" r="32" fill="#111317"/>
      </g></g></g>
    </svg>`;
  // The start screen's animations began when it was first styled — on a slow phone
  // well after the page's start: the opening shifts its own by that moment
  // (document timeline time, the clock of performance.now()).
  function bootShift() {
    const boot = document.getElementById('boot');
    const a = boot && boot.getAnimations ? boot.getAnimations({ subtree: true }).find((x) => x.animationName === 'feel-dot-type' && x.startTime != null) : null;
    return Math.round((a ? a.startTime : 0) - performance.now());
  }
  function Opening({ onDone, max = 2600 }) {
    const [out, setOut] = useState(false);
    const ended = useRef(false);
    const shift = useRef(null);
    if (shift.current === null) shift.current = bootShift();
    const done = useRef(onDone);
    done.current = onDone;
    const finish = () => {
      if (ended.current) return;
      ended.current = true;
      setOut(true);
      setTimeout(() => { if (done.current) done.current(); }, calm() ? 0 : 400);
    };
    useEffect(() => {
      const t = setTimeout(finish, Math.max(900, max - performance.now()));
      const key = () => finish();
      document.addEventListener('keydown', key);
      return () => { clearTimeout(t); document.removeEventListener('keydown', key); };
    }, []);
    return html`<div class=${'opening' + (out ? ' out' : '')} style=${`--boot-shift:${shift.current}ms`} onClick=${finish} role="presentation">
      ${openingIcon}
      <span class="boot-name">Recruitment Studio</span>
      <p class="opening-tag">Anúncios de recrutamento prontos a publicar</p>
    </div>`;
  }

  // ---------------------------------------------------------------- things that open and close
  // Something that plays its exit before it goes: `mounted` stays true for `ms`
  // after `open` turns false, with `leaving` true meanwhile (class .leaving).
  function useLeaving(open, ms = 200) {
    const [staying, setStaying] = useState(false);
    const was = useRef(open);
    useEffect(() => {
      if (open) { was.current = true; setStaying(false); return undefined; }
      if (!was.current) return undefined;
      was.current = false;
      setStaying(true);
      const id = setTimeout(() => setStaying(false), ms);
      return () => clearTimeout(id);
    }, [open]);
    return { mounted: open || staying, leaving: !open && staying };
  }
  // Rows of a list that leave before they go: exit(id, done) marks the row as
  // leaving and calls done() (the real removal) `ms` later, once per row. A list
  // that goes (another panel) removes its leaving rows at once; flushExits() does
  // it for every list (before the editor saves and closes).
  const pendingExits = new Set();
  // how long a row takes to leave: it tips over and falls in Ilustrativo
  const exitMs = () => (illustrative() ? 440 : calm() ? 160 : 200);
  function useExits(ms) {
    const [gone, setGone] = useState(() => new Set());
    const runs = useRef(new Map()); // id → the removal, run once
    const alive = useRef(true);
    const exit = (id, done) => {
      if (runs.current.has(id)) return;
      let timer = 0;
      const run = () => {
        if (runs.current.get(id) !== run) return;
        clearTimeout(timer);
        runs.current.delete(id);
        pendingExits.delete(run);
        done();
        if (alive.current) setGone((s) => { const n = new Set(s); n.delete(id); return n; });
      };
      runs.current.set(id, run);
      pendingExits.add(run);
      setGone((s) => new Set(s).add(id));
      timer = setTimeout(run, ms || exitMs());
    };
    useEffect(() => () => { alive.current = false; [...runs.current.values()].forEach((run) => run()); }, []);
    return { leaving: (id) => gone.has(id), exit };
  }
  const flushExits = () => [...pendingExits].forEach((run) => run());
  // Rows that arrive while their list is on screen (added, brought back) grow in;
  // the rows a list opens with are already there and do not. `keys`: the rows' keys now.
  function useArrivals(keys) {
    const seen = useRef(null);
    const fresh = useRef(new Set());
    const now = new Set(keys);
    if (seen.current === null) seen.current = now;
    else {
      for (const k of now) if (!seen.current.has(k)) { seen.current.add(k); fresh.current.add(k); }
      // a row that went is forgotten: brought back, it grows in again
      for (const k of seen.current) if (!now.has(k)) { seen.current.delete(k); fresh.current.delete(k); }
    }
    return (k) => fresh.current.has(k);
  }
  // The spring of the stylesheet (linear() where the browser has it).
  const spring = () => getComputedStyle(document.documentElement).getPropertyValue('--ease-spring').trim() || 'ease-out';
  // When rows are added to or removed from a list, the rows that stay glide to
  // their new place instead of jumping (children marked data-flip="<key>").
  function useFlip(ref) {
    const prev = useRef(null);
    useLayoutEffect(() => {
      const box = ref.current;
      if (!box) return;
      const now = new Map();
      for (const el of box.children) if (el.dataset && el.dataset.flip) now.set(el.dataset.flip, el);
      const old = prev.current;
      prev.current = new Map([...now].map(([k, el]) => [k, [el.offsetLeft, el.offsetTop]]));
      if (!old || calm()) return;
      const keys = [...now.keys()].filter((k) => k !== 'end');
      const changed = keys.length !== [...old.keys()].filter((k) => k !== 'end').length || keys.some((k) => !old.has(k));
      if (!changed) return;
      const easing = spring();
      for (const [k, el] of now) {
        if (!old.has(k)) continue;
        const [ox, oy] = old.get(k);
        const dx = ox - el.offsetLeft, dy = oy - el.offsetTop;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: illustrative() ? 420 : 260, easing });
      }
    });
  }
  // Pop-ups grow from the button that opened them: every new .pop gets its
  // transform-origin at the centre of the [aria-expanded="true"] button beside it.
  // «Balão»: a pop-up grows from its corner nearest the button that opened it, and
  // that corner takes the bubble's small radius (data-corner: tl, tr, bl, br)
  function originFor(pop, trigger) {
    const t = trigger.getBoundingClientRect(), p = pop.getBoundingClientRect();
    const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
    const right = Math.abs(cx - p.right) < Math.abs(cx - p.left), bottom = Math.abs(cy - p.bottom) < Math.abs(cy - p.top);
    pop.style.transformOrigin = `${right ? '100%' : '0'} ${bottom ? '100%' : '0'}`;
    pop.dataset.corner = (bottom ? 'b' : 't') + (right ? 'r' : 'l');
  }
  function autoOrigin(root = document) {
    const place = (node) => {
      if (node.nodeType !== 1) return;
      const pops = node.matches('.pop') ? [node] : [...node.querySelectorAll('.pop')];
      for (const pop of pops) {
        const trigger = pop.parentElement && pop.parentElement.querySelector(':scope > [aria-expanded="true"]');
        if (trigger) originFor(pop, trigger);
      }
    };
    const mo = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(place)));
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }

  // ---------------------------------------------------------------- «Ilustrativo»: the site in every touch
  // A fixed layer above everything for bricks and falling pieces: decorative, never in the way.
  function fxLayer() {
    let l = document.getElementById('fx-layer');
    if (!l) {
      l = document.createElement('div');
      l.id = 'fx-layer';
      l.setAttribute('aria-hidden', 'true');
      document.body.appendChild(l);
    }
    return l;
  }
  // «Balão» stage swaps: the poster changes under a copy of its old self, which leaves the
  // way the change goes — type (a new language: wiped out, then typed in), roll (a new
  // colour: a painter's roller), tape (another format: a tape measure and the size counting),
  // rewind (undo). Sóbrio and Calmo cross-fade. A newer swap on the same poster wins.
  const swaps = new WeakMap();
  function stageSwap(wrap, canvas, kind, opts = {}) {
    const none = { commit() {}, cancel() {} };
    if (!wrap || !canvas || !canvas.width) return none;
    const prev = swaps.get(wrap);
    if (prev) prev.cancel();
    const mode = illustrative() ? kind : 'fade';
    const old = document.createElement('canvas');
    old.width = canvas.width; old.height = canvas.height;
    try { old.getContext('2d').drawImage(canvas, 0, 0); } catch { return none; }
    old.className = `swap-old ${mode}`;
    old.setAttribute('aria-hidden', 'true');
    wrap.appendChild(old);
    const extras = [];
    let timer = 0, raf = 0;
    const api = {
      commit() {
        if (mode === 'roll') extras.push(Object.assign(document.createElement('i'), { className: 'roller' }));
        // another format: its size counts up (Ilustrativo on the tape measure, Sóbrio in a grey
        // bubble under the poster); Calmo swaps the numbers at once
        const countSize = (el, instant) => {
          const [w, h0] = opts.from || [0, 0], h1 = (opts.to || [0, 0])[1], start = performance.now();
          const tick = (now) => { const k = instant ? 1 : Math.min(1, (now - start) / 400); el.textContent = `${(opts.to || [w])[0]} × ${Math.round(h0 + (h1 - h0) * easeOut(k))}`; if (k < 1) raf = requestAnimationFrame(tick); };
          tick(start);
        };
        if (mode === 'tape') {
          const t = Object.assign(document.createElement('i'), { className: 'tape-measure' });
          const dims = Object.assign(document.createElement('span'), { className: 'dims' });
          t.appendChild(dims); extras.push(t);
          countSize(dims, false);
        } else if (kind === 'tape') {
          const readout = Object.assign(document.createElement('span'), { className: 'say size-readout' });
          extras.push(readout);
          countSize(readout, calm());
        }
        extras.forEach((x) => { x.setAttribute('aria-hidden', 'true'); wrap.appendChild(x); });
        if (mode === 'type') canvas.classList.add('swap-new');
        old.classList.add('go');
        timer = setTimeout(api.cancel, mode === 'type' ? 900 : mode === 'roll' ? 700 : mode === 'tape' || kind === 'tape' ? 900 : 400);
      },
      cancel() {
        clearTimeout(timer); cancelAnimationFrame(raf);
        old.remove(); extras.forEach((x) => x.remove()); canvas.classList.remove('swap-new');
        if (swaps.get(wrap) === api) swaps.delete(wrap);
      },
    };
    swaps.set(wrap, api);
    return api;
  }
  // Ilustrativo: a greeting in the new language rises from where it was added.
  const GREETINGS = { 'pt-PT': 'Olá', fr: 'Bonjour', 'de-CH': 'Hallo', 'de-DE': 'Hallo', it: 'Ciao', en: 'Hello', es: 'Hola' };
  // Sóbrio: the new language's chip pops instead (it renders after the change: looked for a few frames)
  function popChip(locale, tries = 10) {
    const chip = document.querySelector(`.editor .locales .chip[data-code="${locale}"]`);
    if (!chip) { if (tries > 0) requestAnimationFrame(() => popChip(locale, tries - 1)); return; }
    chip.classList.remove('pop-once'); void chip.offsetWidth; chip.classList.add('pop-once');
    setTimeout(() => chip.classList.remove('pop-once'), 450);
  }
  function greet(el, locale) {
    if (style() === 'sober') { popChip(locale); return; }
    if (!illustrative() || !el) return;
    const r = el.getBoundingClientRect();
    const b = Object.assign(document.createElement('span'), { className: 'say greet-bubble', textContent: GREETINGS[locale] || 'Olá' });
    b.style.left = `${Math.round(r.left)}px`; b.style.top = `${Math.round(r.top - 38)}px`;
    fxLayer().appendChild(b);
    const a = b.animate([{ transform: 'translateY(8px) scale(0.4)', opacity: 0 }, { transform: 'translateY(-4px) scale(1.06)', opacity: 1, offset: 0.25 },
      { transform: 'translateY(-10px)', opacity: 1, offset: 0.7 }, { transform: 'translateY(-26px)', opacity: 0 }], { duration: 950, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
    a.onfinish = a.oncancel = () => b.remove();
  }
  // The app says a word beside a control (a grey bubble): «Desfeito», «Refeito».
  function sayNear(el, text, ms = 1200) {
    if (!el) return;
    document.querySelectorAll('.near-bubble').forEach((x) => x.remove());
    const r = el.getBoundingClientRect();
    const b = Object.assign(document.createElement('span'), { className: 'say near-bubble', textContent: text });
    b.setAttribute('role', 'status');
    b.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 120)))}px`; b.style.top = `${Math.round(r.bottom + 6)}px`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), ms);
    if (illustrative()) { el.classList.remove('spin-once'); void el.offsetWidth; el.classList.add('spin-once'); setTimeout(() => el.classList.remove('spin-once'), 600); }
  }
  // A field tells the stage that something worth showing happened (a WhatsApp number
  // just became complete): on(name, fn) returns the function that stops listening.
  const listeners = new Map();
  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name).delete(fn);
  }
  function emit(name, detail) {
    // a listener's failure never breaks the field that spoke
    (listeners.get(name) || []).forEach((fn) => { try { fn(detail); } catch (err) { console.error(err); } });
  }
  // Ilustrativo: a builder's spirit level under the poster while its photo is dragged;
  // the bubble follows the photo's distance from the centre (offset −1…1), the marks
  // turn green when it settles there.
  function SpiritLevel({ offset = 0, snapped = false, leaving = false }) {
    const o = Math.max(-1, Math.min(1, offset || 0));
    return html`<div class=${'spirit-level' + (snapped ? ' snapped' : '') + (leaving ? ' leaving' : '')} aria-hidden="true">
      <i class="level-mark"></i><i class="level-mark"></i>
      <span class="level-bubble" style=${`transform: translateX(${(o * 30).toFixed(1)}px)`}></span>
    </div>`;
  }
  // A press on a main control («Balão»): a small white bubble with three dots leaves
  // the control's top-left corner and rises, like a message sent (the press itself is CSS).
  const BUBBLE_ON = '.btn.primary, .new-ad, .tpl-card';
  function tapBubbles(root = document) {
    const onDown = (e) => {
      if (!illustrative() || (e.button && e.button !== 0)) return;
      const el = e.target.closest && e.target.closest(BUBBLE_ON);
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const b = document.createElement('i');
      b.className = 'fx-bubble';
      b.innerHTML = '<span></span><span></span><span></span>';
      b.style.left = `${Math.round(r.left + 6)}px`;
      b.style.top = `${Math.round(r.top - 28)}px`;
      fxLayer().appendChild(b);
      const a = b.animate([
        { transform: 'translate(0, 24px) scale(0.3)', opacity: 0 },
        { transform: 'translate(-2px, 0) scale(1.06)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-4px, -10px) scale(1)', opacity: 1, offset: 0.45 },
        { transform: 'translate(-8px, -50px) scale(0.92)', opacity: 0 },
      ], { duration: 580, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
      a.onfinish = a.oncancel = () => b.remove();
    };
    root.addEventListener('pointerdown', onDown, true);
    return () => root.removeEventListener('pointerdown', onDown, true);
  }
  // A deleted card cracks and crumbles into bricks that fall; the pieces carry
  // its picture (el: the picture's box, picture: its image).
  function crumble(el, picture) {
    if (!illustrative() || !el) return;
    const r = el.getBoundingClientRect();
    const layer = fxLayer();
    const cols = 2, rows = 3, w = r.width / cols, h = r.height / rows;
    for (let i = 0; i < cols * rows; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      const p = document.createElement('i');
      p.className = 'fx-piece';
      Object.assign(p.style, {
        left: `${r.left + cx * w}px`, top: `${r.top + cy * h}px`, width: `${w + 0.5}px`, height: `${h + 0.5}px`,
        backgroundImage: picture ? `url("${picture}")` : '', backgroundSize: `${r.width}px ${r.height}px`, backgroundPosition: `${-cx * w}px ${-cy * h}px`,
      });
      layer.appendChild(p);
      const dir = cx ? 1 : -1, fall = innerHeight - r.top + 60, turn = dir * (18 + i * 9);
      const a = p.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dir * 3}px, -4px) rotate(${dir * 2}deg)`, opacity: 1, offset: 0.14 },
        { transform: `translate(${dir * (10 + cy * 7)}px, ${fall}px) rotate(${turn}deg)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${dir * (10 + cy * 7)}px, ${fall + 20}px) rotate(${turn}deg)`, opacity: 0 },
      ], { duration: 820 + cy * 60, delay: 80 + (rows - 1 - cy) * 55 + cx * 25, easing: 'cubic-bezier(0.55, 0, 0.8, 0.45)', fill: 'backwards' });
      a.onfinish = a.oncancel = () => p.remove();
    }
  }
  // «Abrir o editor»: a crane hook takes part in the screen change (its own
  // view-transition group): it hangs over the old poster, travels with it to the
  // new one, then goes up. place(el) hangs it over el; leave() takes it away.
  function craneHook() {
    const h = document.createElement('div');
    h.className = 'vt-hook';
    h.setAttribute('aria-hidden', 'true');
    h.appendChild(document.createElement('i')).className = 'vt-cable';
    h.appendChild(document.createElement('b')).className = 'vt-claw';
    document.body.appendChild(h);
    const place = (el) => {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect();
      h.style.left = `${Math.round(r.left + r.width / 2 - 8)}px`;
      h.style.top = `${Math.round(r.top - h.offsetHeight + 6)}px`;
      return true;
    };
    const leave = () => {
      h.style.viewTransitionName = 'none'; // a quick next screen change gets its own hook (a name twice aborts it)
      const a = h.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-55vh)', opacity: 0 }], { duration: 460, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards' });
      a.onfinish = a.oncancel = () => h.remove();
    };
    return { el: h, place, leave };
  }
  // «Mudar de tema»: night falls on the site (or the day breaks). The sky rises
  // over the screen, the sun sets (or rises) behind the crane, the crane's lights
  // come on; the theme changes under the sky (apply), which then fades away.
  // A key or a tap ends it at once, with the theme set.
  let scene = null;
  const SKY = '<i class="nf-sky"></i><i class="nf-sun"></i><i class="nf-moon"></i>'
    + '<svg class="nf-crane" viewBox="0 0 220 170"><path d="M40 170V22M54 170V22M40 36L54 50L40 64L54 78L40 92L54 106L40 120L54 134L40 148L54 162M40 22L47 4L54 22M47 4V22M6 22H214M54 31H204L214 22M47 4L214 22M47 4L6 22M150 31V80M141 80H159V96H141Z"/></svg>'
    + '<i class="nf-lamp a"></i><i class="nf-lamp b"></i><i class="nf-lamp c"></i>';
  function nightfall(toNight, apply) {
    if (scene) scene.end();
    const el = document.createElement('div');
    el.className = `nightfall ${toNight ? 'to-night' : 'to-day'}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = SKY;
    document.body.appendChild(el);
    let applied = false;
    const set = () => { if (!applied) { applied = true; apply(); } };
    const timers = [setTimeout(set, 560), setTimeout(() => el.classList.add('out'), 950), setTimeout(() => end(), 1550)];
    function end() {
      timers.forEach(clearTimeout);
      set();
      el.remove();
      document.removeEventListener('keydown', end, true);
      document.removeEventListener('pointerdown', end, true);
      if (scene && scene.el === el) scene = null;
    }
    document.addEventListener('keydown', end, true);
    document.addEventListener('pointerdown', end, true);
    scene = { el, end };
  }
  // «O início, vivo»: cards lean towards the pointer (a mouse or pen), or with the
  // phone where it tells its tilt without asking (Android); straight again on leave.
  function leanCards(grid, selector = '.proj-card') {
    if (!grid) return () => {};
    const lean = (card, x, y) => { card.style.setProperty('--ry', (x * 9).toFixed(2)); card.style.setProperty('--rx', (-y * 7).toFixed(2)); };
    const straight = (card) => { card.style.removeProperty('--ry'); card.style.removeProperty('--rx'); };
    const onMove = (e) => {
      if (!illustrative() || e.pointerType === 'touch') return;
      const card = e.target.closest && e.target.closest(selector);
      if (!card || !grid.contains(card)) return;
      const r = card.getBoundingClientRect();
      lean(card, (e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
    };
    const onLeave = (e) => { if (e.target.matches && e.target.matches(selector)) straight(e.target); };
    let raf = 0;
    const onTilt = (e) => {
      if (!illustrative() || e.gamma == null || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const x = Math.max(-1, Math.min(1, e.gamma / 30)) / 2, y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) / 2;
        grid.querySelectorAll(selector).forEach((c) => lean(c, x, y));
      });
    };
    grid.addEventListener('pointermove', onMove);
    grid.addEventListener('pointerleave', onLeave, true);
    window.addEventListener('deviceorientation', onTilt);
    return () => { grid.removeEventListener('pointermove', onMove); grid.removeEventListener('pointerleave', onLeave, true); window.removeEventListener('deviceorientation', onTilt); cancelAnimationFrame(raf); };
  }
  // The motion style now, re-rendering when «Definições» changes it.
  function useMotionStyle() {
    const [st, setSt] = useState(style);
    useEffect(() => (RS.appearance ? RS.appearance.subscribe(() => setSt(style())) : undefined), []);
    return st;
  }

  return { glide, autoGlide, CountUp, useDelayed, TypingLoader, CraneProgress, Celebration, Opening, useLeaving, useExits, flushExits, useArrivals, useFlip, autoOrigin, calm, illustrative, style, exitMs, tapBubbles, stageSwap, greet, sayNear, on, emit, SpiritLevel, crumble, craneHook, nightfall, leanCards, useMotionStyle };
})();
