// «Definições»: the motion style (Ilustrativo · Sóbrio · Calmo), the theme
// (Automático · Claro · Escuro) and the vibration switch, kept on this device.
// Loaded in <head>, before the stylesheet, so the page is painted in its theme
// and style from the first frame (no flash of the light theme).
// Sets <html data-theme="light|dark"> and <html data-motion="illustrative|sober|calm">.
window.RS = window.RS || {};
RS.appearance = (() => {
  const KEY = 'rs-appearance';
  // motion null = not chosen: Calmo when the device asks for less motion, else Ilustrativo
  const DEFAULTS = Object.freeze({ theme: 'auto', haptics: true, motion: null });
  const MOTIONS = Object.freeze(['illustrative', 'sober', 'calm']);
  // the browser bar (and the phone's status bar) in each theme
  const THEME_COLOR = Object.freeze({ light: '#ffffff', dark: '#0f1114' });
  const THEMES = ['auto', 'light', 'dark'];
  // localStorage itself can throw (blocked storage, some private modes)
  const local = () => { try { return window.localStorage || null; } catch { return null; } };

  // Only known values are kept; anything else falls back to the defaults.
  function clean(s, base = DEFAULTS) {
    const o = s && typeof s === 'object' ? s : {};
    return {
      theme: THEMES.includes(o.theme) ? o.theme : base.theme,
      haptics: typeof o.haptics === 'boolean' ? o.haptics : base.haptics,
      motion: MOTIONS.includes(o.motion) || o.motion === null ? o.motion : base.motion,
    };
  }
  function load(storage = local()) {
    try {
      const raw = storage ? storage.getItem(KEY) : null;
      return clean(raw ? JSON.parse(raw) : null);
    } catch {
      return { ...DEFAULTS };
    }
  }
  function save(settings, storage = local()) {
    try { if (storage) storage.setItem(KEY, JSON.stringify(clean(settings))); } catch { /* full or blocked: kept for this visit only */ }
  }
  // An installed app opens on the system's splash, drawn in the manifest's one
  // colour (the dark one); a browser tab and the .exe's app window (file://) have none.
  const fromSplash = (win, loc) => !!(loc && /^https?:$/.test(loc.protocol) && win && win.matchMedia && win.matchMedia('(display-mode: standalone)').matches);
  const resolveMotion = (choice, prefersReduced) => (MOTIONS.includes(choice) ? choice : prefersReduced ? 'calm' : 'illustrative');
  const resolve = (theme, prefersDark) => (theme === 'light' || theme === 'dark' ? theme : prefersDark ? 'dark' : 'light');

  let current = load();
  const subs = new Set();
  const media = (win, q) => (win && win.matchMedia ? win.matchMedia(q) : null);

  function apply(doc = document, win = window) {
    const dark = media(win, '(prefers-color-scheme: dark)');
    const calm = media(win, '(prefers-reduced-motion: reduce)');
    const theme = resolve(current.theme, !!(dark && dark.matches));
    const root = doc.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = resolveMotion(current.motion, !!(calm && calm.matches));
    // a chosen theme wins over the device's: every theme-color meta follows it
    let metas = doc.querySelectorAll('meta[name="theme-color"]');
    if (!metas.length && doc.head) {
      const m = doc.createElement('meta');
      m.name = 'theme-color';
      doc.head.appendChild(m);
      metas = [m];
    }
    for (const m of metas) m.content = THEME_COLOR[theme];
    return theme;
  }
  const notify = () => subs.forEach((fn) => { try { fn({ ...current }); } catch (err) { console.error(err); } });
  const get = () => ({ ...current });
  function set(patch) {
    current = clean({ ...current, ...(patch || {}) }, current);
    save(current);
    if (typeof document !== 'undefined') apply();
    notify();
    return get();
  }
  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    apply();
    // the light start screen begins in the splash's colour and fades to its own
    if (fromSplash(window, window.location)) document.documentElement.classList.add('from-splash');
    const follow = (q, fn) => {
      const mq = media(window, q);
      if (!mq) return;
      if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
    };
    // «Automático» changes by itself when the device does (at night, say)
    follow('(prefers-color-scheme: dark)', () => { if (current.theme === 'auto') { apply(); notify(); } });
    follow('(prefers-reduced-motion: reduce)', () => { if (current.motion === null) { apply(); notify(); } });
    // another window of the app changed it
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      current = load();
      apply();
      notify();
    });
  }

  return { KEY, DEFAULTS, MOTIONS, THEME_COLOR, load, save, resolve, resolveMotion, fromSplash, apply, get, set, subscribe };
})();
