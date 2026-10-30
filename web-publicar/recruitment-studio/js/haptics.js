// Haptics: a short tick under the finger on real actions, and «ready» / «error»
// patterns. Android: navigator.vibrate. iPhone (iOS 17.4+): a web page cannot
// vibrate from script, only a real tap on an <input type="checkbox" switch>
// gives the system's tick — so each tick-bearing control carries an invisible
// switch under the finger (hidden from assistive technology and from Tab).
// PC: quiet. «Vibração» off (RS.appearance) silences everything.
window.RS = window.RS || {};
RS.haptics = (() => {
  const PATTERNS = Object.freeze({ tick: 8, success: Object.freeze([12, 60, 18]), error: Object.freeze([30, 50, 30]) });
  const TICK_SELECTOR = '.btn, .icon-btn, .chip-main, .tchip, .seg button, .rail button, .video-tabs [role="tab"], .motion-card, .ms-card, .tpl-card, .proj-open, .lengths button, .eye, .add-row, .palette, .vt-remove, .vt-restore';
  const SWITCHES = '.switch input[type="checkbox"]';
  // iPhone: a native switch answers drags, so one under a finger that starts a scroll
  // takes the gesture (and opens the card). Only controls where no scroll starts
  // get one: the floating bar, the editor's floating controls, the video player,
  // the big buttons fixed under a sheet. Nothing inside a scrolling area.
  const IOS_SELECTOR = '.editor .rail button, .editor .topbar button, .editor .topbar [role="radio"], .player button, .player [role="radio"], .export-actions .btn';
  const SCROLLERS = '.panel, .gallery, .home-main, .modal, .menu, .lib-grid, .ip-pop';
  const inScroller = (el) => !!el.closest(SCROLLERS) && !el.closest('.export-actions');
  const tickable = (el) => el.matches(IOS_SELECTOR) && !inScroller(el);

  // 'ios' on iPhone / iPad (iPadOS says «Macintosh» but has touch) from iOS 17.4;
  // 'android' where vibrate works on a phone or tablet; 'none' elsewhere (a PC, even with touch).
  function mode(ua = '', env = {}) {
    const touch = (env.maxTouchPoints || 0) > 0;
    const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch);
    if (apple) {
      let m = /Macintosh/.test(ua) ? null : /OS (\d+)[_.](\d+)/.exec(ua);
      if (!m) m = /Version\/(\d+)\.(\d+)/.exec(ua);
      const v = m ? Number(m[1]) + Number(m[2]) / 100 : 0;
      return v >= 17.04 ? 'ios' : 'none';
    }
    // a computer with a touch screen (Windows, Mac, Linux, ChromeOS) has vibrate but no motor: quiet
    const computer = /Windows NT|Macintosh|X11|CrOS/.test(ua) && !/Android/i.test(ua);
    return env.vibrate && (/Android/i.test(ua) || (touch && !computer)) ? 'android' : 'none';
  }
  const nav = () => (typeof navigator !== 'undefined' ? navigator : null);
  function detect() {
    const n = nav();
    return n ? mode(n.userAgent, { vibrate: typeof n.vibrate === 'function', maxTouchPoints: n.maxTouchPoints || 0 }) : 'none';
  }
  let current = 'none';
  const on = () => !RS.appearance || RS.appearance.get().haptics !== false;
  // Script vibration: Android only (an iPhone ticks through its switches).
  function play(pattern) {
    const n = nav();
    if (current !== 'android' || !on() || !n || typeof n.vibrate !== 'function') return;
    try { n.vibrate(pattern); } catch { /* not allowed now */ }
  }
  const tick = () => play(PATTERNS.tick);
  const success = () => play(PATTERNS.success);
  const error = () => play(PATTERNS.error);

  // ---------------------------------------------------------------- iPhone: the hidden switches
  function decorate(el) {
    if (el.disabled || el.querySelector(':scope > .haptic-switch')) return;
    const label = document.createElement('label');
    label.className = 'haptic-switch';
    label.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    // A tap on the switch itself is one click that reaches the control. A tap
    // on the label is the label's click plus the switch's own: that second one
    // stops here, so the control's action runs once.
    let viaLabel = false;
    label.addEventListener('click', (e) => { if (e.target === label) viaLabel = true; });
    // A tap on the switch itself takes the activation from the control around it:
    // a submit button sends its form here. (A click on the label leaves it to the
    // button, as without the switch.)
    input.addEventListener('click', (e) => {
      if (viaLabel) { viaLabel = false; e.stopPropagation(); return; }
      if (el.type === 'submit' && el.form && !el.disabled) el.form.requestSubmit(el);
    });
    // the hidden switch never takes the focus from the page
    label.addEventListener('mousedown', (e) => e.preventDefault());
    el.appendChild(label);
  }
  const undecorate = (el) => { const l = el.querySelector(':scope > .haptic-switch'); if (l) l.remove(); };

  // Starts the haptics for the page; returns a function that stops them.
  // opts.mode replaces the detection (tests).
  function install(root = typeof document !== 'undefined' ? document : null, opts = {}) {
    const before = current;
    current = opts.mode || detect();
    const stops = [];
    if (root && current === 'android') {
      const onClick = (e) => { const el = e.target.closest && e.target.closest(TICK_SELECTOR); if (el && !el.disabled) tick(); };
      const onChange = (e) => { if (e.target.matches && e.target.matches(SWITCHES)) tick(); };
      root.addEventListener('click', onClick, true);
      root.addEventListener('change', onChange, true);
      stops.push(() => { root.removeEventListener('click', onClick, true); root.removeEventListener('change', onChange, true); });
    } else if (root && current === 'ios') {
      const marked = new Set();
      const scan = (node) => {
        if (node.nodeType !== 1 || node.classList.contains('haptic-switch') || !on()) return;
        // the app's own switches, found by class (cheap: most changes are inside panels)
        const labels = node.classList.contains('switch') ? [node] : node.getElementsByClassName('switch');
        for (const l of labels) { const i = l.querySelector(':scope > input[type="checkbox"]'); if (i && !i.hasAttribute('switch')) { i.setAttribute('switch', ''); marked.add(i); } }
        if (node.matches(SWITCHES) && !node.hasAttribute('switch')) { node.setAttribute('switch', ''); marked.add(node); }
        // most changes happen inside a panel or a sheet's body: nothing there ticks
        if (inScroller(node) && !node.querySelector('.export-actions')) return;
        if (tickable(node)) decorate(node);
        node.querySelectorAll(IOS_SELECTOR).forEach((el) => { if (tickable(el)) decorate(el); });
      };
      const clear = () => root.querySelectorAll('.haptic-switch').forEach((l) => l.remove());
      const top = root.nodeType === 9 ? root.documentElement : root;
      // the app's own switches spread their input over the whole control (track and
      // words), so the tap lands on the system switch itself, which is what ticks
      const page = (root.nodeType === 9 ? root : root.ownerDocument).documentElement;
      page.classList.add('haptics-ios');
      scan(top);
      const mo = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'childList') r.addedNodes.forEach(scan);
          else if (tickable(r.target)) { if (r.target.disabled) undecorate(r.target); else if (on()) decorate(r.target); }
        }
      });
      mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
      // «Vibração» off: no switches, so no tick
      const unsub = RS.appearance ? RS.appearance.subscribe((s) => { if (s.haptics) scan(top); else clear(); }) : () => {};
      stops.push(() => { mo.disconnect(); unsub(); clear(); marked.forEach((i) => i.removeAttribute('switch')); page.classList.remove('haptics-ios'); });
    }
    return () => { stops.forEach((f) => f()); current = before; };
  }

  return { PATTERNS, TICK_SELECTOR, IOS_SELECTOR, SCROLLERS, mode, detect, tick, success, error, install };
})();
