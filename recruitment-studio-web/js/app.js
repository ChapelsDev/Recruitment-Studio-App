// Interface: opening animation, home, template gallery, editor with live
// preview, photo library, export. Works with mouse, keyboard and touch.
(() => {
  const { html, render, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, createContext, useContext } = window.htmPreact;
  const U = RS.util, M = RS.model, E = RS.engine, T = RS.templates, S = RS.store, A = RS.assets, L = RS.library, TR = RS.trades, C = RS.contact;
  const { CountUp, TypingLoader, CraneProgress, Celebration, useDelayed } = RS.ui;
  const W = RS.workflow;
  const { Modal, OrganizationDialog, HomeFilters, TranslationDialog } = RS.workflowUI({ Icon, ListEditor });
  const { ReuseDialog, ProductionDialog, BackupDialog, VideoCoverDialog, FormatComparison, VideoTimeline } = RS.productionUI({ Icon, Modal, PhotoLibrary, confirmDialog, toast, makeThumb, videoPhotos, afterPaint: () => afterPaint() });
  const { PieceSwitch, CarouselStage, useCarousel, CarouselStylePanel, CarouselSequencePanel, CarouselPhotosPanel, StyleCover, styleName, drawSlide } = RS.carouselUI({ Icon, queueThumb, afterPaint: () => afterPaint(), Group, VideoTexts, PhotoLibrary, VideoPhotos, FramePhoto, FocusThumb, BodyLayer });

  // ============================================================== motion + small helpers
  // «Calmo» (chosen in «Definições», or the device asks for reduced motion): no flights
  const reducedMotion = () => document.documentElement.dataset.motion === 'calm';
  // Resolves once the current state is on screen: a loading state is painted
  // before slow work (decoding, saving, rendering) starts. A hidden or throttled
  // window may draw one frame per second, so it never waits more than 50 ms.
  const afterPaint = () => new Promise((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50);
  });
  // Runs a state change inside a View Transition: screens cross-fade and the
  // poster morphs between gallery, home and editor. Falls back to an instant change.
  // Never wait for a frame inside the callback: the browser draws no frames while
  // it runs, so requestAnimationFrame only fired at Chrome's 4-second timeout and
  // every screen change froze for 4 s. One macrotask lets Preact write the DOM.
  const domFlushed = () => new Promise((r) => setTimeout(r, 0));
  // While a screen change animates, the wait before it is over: no loader then.
  const navAnim = { on: false, subs: new Set() };
  const setNavAnim = (on) => { navAnim.on = on; navAnim.subs.forEach((f) => f(on)); };
  // the screen change animating now: a new tap makes it jump to its end (App.run)
  let navVT = null;
  function transition(fn) {
    if (!document.startViewTransition || reducedMotion()) return Promise.resolve(fn());
    setNavAnim(true);
    // Ilustrativo: the crane's hook hangs over the poster and travels with it
    const hook = RS.ui.illustrative() && posterNow() ? RS.ui.craneHook() : null;
    if (hook) hook.place(posterNow());
    const vt = document.startViewTransition(async () => { await fn(); await domFlushed(); if (hook && !hook.place(posterNow())) hook.el.remove(); });
    navVT = vt;
    vt.finished.catch(() => {}).then(() => { if (navVT === vt) navVT = null; });
    vt.finished.catch(() => {}).then(() => setNavAnim(false));
    // A transition the browser skips (a phone turned mid-way) rejects all three
    // promises; the screen has changed anyway, so none of them is an error.
    if (vt.ready) vt.ready.catch(() => {});
    if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
    return vt.finished.catch(() => {}).then(() => { markPoster(null); if (hook && hook.el.isConnected) hook.leave(); });
  }
  // the element that is the poster in a screen change: a card marked by markPoster, or the editor's
  const posterNow = () => document.querySelector('[style*="view-transition-name: poster"]') || document.querySelector('.poster-wrap');
  function useMedia(query) {
    const [match, setMatch] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
      const mq = window.matchMedia(query);
      const on = () => setMatch(mq.matches);
      mq.addEventListener('change', on);
      return () => mq.removeEventListener('change', on);
    }, [query]);
    return match;
  }
  function pickFiles(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.name = 'files'; input.accept = accept; input.multiple = true;
      input.tabIndex = -1; input.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;';
      const finish = (files) => { input.remove(); resolve(files); };
      input.onchange = () => finish([...(input.files || [])]);
      input.addEventListener('cancel', () => finish([])); document.body.appendChild(input);
      input.click();
    });
  }

  // «Definições»: the gear (Lucide «settings», ISC) is not in the generated icon set
  if (!RS.ICON_PATHS.settings) RS.ICON_PATHS.settings = 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z';
  function Icon({ name, size = 18, stroke = 2 }) {
    return html`<svg class="ico" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width=${stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d=${RS.ICON_PATHS[name] || ''} /></svg>`;
  }
  if (!RS.ICON_PATHS.pause) RS.ICON_PATHS.pause = 'M8 5v14M16 5v14';
  // the phone player's ⛶ (in and out of full screen)
  if (!RS.ICON_PATHS['maximize-2']) RS.ICON_PATHS['maximize-2'] = 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7';
  if (!RS.ICON_PATHS['minimize-2']) RS.ICON_PATHS['minimize-2'] = 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7';
  function Spinner({ large }) {
    return html`<span class=${'spinner' + (large ? ' lg' : '')} aria-hidden="true"></span>`;
  }
  function useProjectFile() {
    const [fileSaving, setFileSaving] = useState(false);
    const pending = useRef(false);
    const saveFile = async (project) => {
      if (pending.current) return;
      pending.current = true; setFileSaving(true);
      try {
        const snapshot = M.normalize(project);
        await afterPaint();
        const blob = await A.exportProjectFile(snapshot);
        const ok = await U.saveBlob(blob, `${U.slug(snapshot.name)}.anuncio`, [{ description: 'Projeto Recruitment Studio', accept: { 'application/json': ['.anuncio'] } }]);
        if (ok) toast('Projeto guardado com as imagens e o som. Pode abri-lo noutro aparelho.');
      } catch (err) { toast(err.message || 'Não foi possível guardar o ficheiro.', { kind: 'error' }); }
      finally { pending.current = false; setFileSaving(false); }
    };
    return { fileSaving, saveFile };
  }
  // In Ilustrativo the icon is drawn inline so its three dots can type now and then.
  const WM_LIVE = html`<svg class="wm-mark wm-live" viewBox="0 0 512 512" width="26" height="26" aria-hidden="true" focusable="false">
    <rect width="512" height="512" rx="104" fill="#f26a14" /><g clip-path="inset(0 round 104px)"><g transform="rotate(10 200 180)">
      <rect x="-60" y="-40" width="500" height="370" rx="120" fill="#fff" /><path d="M290 300 L450 455 L390 290 Z" fill="#fff" />
      <circle class="wm-dot" cx="105" cy="150" r="50" fill="#111317" /><circle class="wm-dot" cx="235" cy="150" r="50" fill="#111317" /><circle class="wm-dot" cx="365" cy="150" r="50" fill="#111317" />
    </g></g></svg>`;
  function Wordmark({ small }) {
    const live = RS.ui.useMotionStyle() === 'illustrative';
    return html`<span class=${'wordmark' + (small ? ' small' : '')}>${live ? WM_LIVE : html`<img class="wm-mark" src="assets/brand/icon-small.svg" alt="" width="26" height="26" />`}Recruitment Studio</span>`;
  }
  // The home band's mark (on the orange): the icon's white bubble and its three dots,
  // which type now and then in Ilustrativo.
  function BandMark() {
    const live = RS.ui.useMotionStyle() === 'illustrative';
    return html`<span class="wordmark band-mark"><svg class=${'band-glyph' + (live ? ' wm-live' : '')} viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
      <path d="M5 4h22a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H13l-6 5v-5H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="#fff" />
      <circle class="wm-dot" cx="10" cy="13.5" r="2" fill="#000" /><circle class="wm-dot" cx="16" cy="13.5" r="2" fill="#000" /><circle class="wm-dot" cx="22" cy="13.5" r="2" fill="#000" />
    </svg>Recruitment Studio</span>`;
  }
  function useSize(ref) {
    const [size, setSize] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
      if (!ref.current) return undefined;
      const ro = new ResizeObserver(([entry]) => {
        const r = entry.contentRect;
        setSize({ w: Math.round(r.width), h: Math.round(r.height) });
      });
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    return size;
  }
  // Delays unmounting so an element can play its exit animation.
  function useClosing(onClose, ms = 170) {
    const [closing, setClosing] = useState(false);
    const close = useCallback((...args) => {
      if (closing) return;
      if (reducedMotion()) { onClose(...args); return; }
      setClosing(true);
      setTimeout(() => onClose(...args), ms);
    }, [closing, onClose]);
    return [closing, close];
  }

  // ---------------------------------------------------------------- toasts
  const toastBus = { list: [], subs: new Set() };
  const emitToasts = () => toastBus.subs.forEach((f) => f([...toastBus.list]));
  function leaveToast(id) {
    toastBus.list = toastBus.list.map((x) => (x.id === id ? { ...x, leaving: true } : x));
    emitToasts();
    setTimeout(() => { toastBus.list = toastBus.list.filter((x) => x.id !== id); emitToasts(); }, RS.ui.illustrative() ? 440 : 200);
  }
  function toast(message, opts = {}) {
    const t = { id: U.uid(), message, ...opts };
    toastBus.list = [...toastBus.list.slice(-2), t];
    emitToasts();
    setTimeout(() => leaveToast(t.id), opts.action ? 7000 : 4200);
  }
  function Toasts() {
    const [list, setList] = useState([]);
    useEffect(() => { toastBus.subs.add(setList); return () => toastBus.subs.delete(setList); }, []);
    return html`<div class="toasts" role="status" aria-live="polite">
      ${list.map((t) => html`<div key=${t.id} class=${'toast' + (t.kind === 'error' ? ' error' : '') + (t.leaving ? ' leave' : '')}>
        <${Icon} name=${t.kind === 'error' ? 'circle-alert' : 'check'} size=${18} />
        <span>${t.message}</span>
        ${t.action && html`<button class="toast-action" onClick=${() => { t.onAction(); leaveToast(t.id); }}>${t.action}</button>`}
      </div>`)}
    </div>`;
  }

  // ---------------------------------------------------------------- confirm dialog
  const dialogBus = { sub: null };
  function confirmDialog(opts) {
    return new Promise((resolve) => { if (dialogBus.sub) dialogBus.sub({ ...opts, resolve }); else resolve(false); });
  }
  function DialogHost() {
    const [d, setD] = useState(null);
    useEffect(() => { dialogBus.sub = setD; return () => { dialogBus.sub = null; }; }, []);
    if (!d) return null;
    return html`<${ConfirmBox} key=${d.title} d=${d} onDone=${() => setD(null)} />`;
  }
  function ConfirmBox({ d, onDone }) {
    const okRef = useRef();
    const prevFocus = useRef(document.activeElement);
    const [closing, close] = useClosing((v) => { d.resolve(v); onDone(); if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus(); });
    useEffect(() => { if (okRef.current) okRef.current.focus(); }, []);
    return html`<div class=${'modal-back' + (closing ? ' closing' : '')} onMouseDown=${(e) => { if (e.target === e.currentTarget) close(false); }}
      onKeyDown=${(e) => { if (e.key === 'Escape') close(false); }}>
      <div class="modal small" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">${d.title}</h2>
        ${d.body && html`<p>${d.body}</p>`}
        <div class="modal-actions">
          <button class="btn ghost" onClick=${() => close(false)}>${d.cancel || 'Cancelar'}</button>
          <button ref=${okRef} class=${'btn ' + (d.danger ? 'danger' : 'primary')} onClick=${() => close(true)}>${d.confirm || 'Confirmar'}</button>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- poster thumbnail
  // Heavy drawing (thumbnails, the video styles' previews) waits in one queue and
  // runs one job per task at the browser's lowest priority: a screen full of them
  // opens at once (each shimmers until drawn), and a tap between two jobs is
  // answered before the next — on a slow phone one poster takes up to a second,
  // and a queue run inside the frames kept a tap waiting for several of them.
  const thumbJobs = new Map();
  let thumbTask = false;
  const later = (fn) => {
    if (window.scheduler && typeof window.scheduler.postTask === 'function') window.scheduler.postTask(fn, { priority: 'background' }).catch(() => {});
    else setTimeout(fn, 0);
  };
  // a finger moving (a scroll, a drag) goes first: the queue waits until it has been still
  // for 250 ms (2026-10-29: a card prepared mid-scroll was a long task under the finger)
  let lastGesture = -1e9;
  const gesture = () => { lastGesture = performance.now(); };
  for (const t of ['touchstart', 'touchmove', 'wheel', 'scroll']) window.addEventListener(t, gesture, { passive: true, capture: true });
  function runThumbJob() {
    const wait = 250 - (performance.now() - lastGesture);
    if (wait > 0) { setTimeout(runThumbJob, wait); return; } // (still the queue's turn: thumbTask stays true)
    thumbTask = false;
    const next = thumbJobs.entries().next();
    if (next.done) return;
    const [key, job] = next.value;
    thumbJobs.delete(key);
    try { job(); } catch (err) { console.error(err); }
    if (thumbJobs.size) { thumbTask = true; later(runThumbJob); }
  }
  function queueThumb(key, job) {
    thumbJobs.delete(key);
    thumbJobs.set(key, job);
    if (!thumbTask) { thumbTask = true; later(runThumbJob); }
  }
  queueThumb.cancel = (key) => thumbJobs.delete(key);
  // `pending`: the images are still arriving; keep the shimmer instead of drawing
  // the placeholder illustration for a moment.
  function PosterThumb({ project, format, images, width, locale, vt, pending }) {
    const ref = useRef();
    const key = useRef(null);
    if (!key.current) key.current = {};
    const [drawn, setDrawn] = useState(false);
    const fmt = M.FORMATS[format || project.format];
    useEffect(() => {
      if (!width || pending) return undefined;
      const job = key.current;
      queueThumb(job, () => {
        const c = ref.current;
        if (!c) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const k = width / fmt.w;
        c.width = Math.round(fmt.w * k * dpr);
        c.height = Math.round(fmt.h * k * dpr);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        E.render(ctx, project, { format: fmt.id, locale, images: images || {}, scale: k * dpr, mode: 'thumb' });
        setDrawn(true);
      });
      return () => thumbJobs.delete(job);
    }, [project, fmt.id, images, width, locale, pending]);
    return html`<canvas ref=${ref} class=${'poster-thumb' + (drawn ? ' drawn' : '')} data-vt=${vt || ''}
      style=${`width:${width}px;height:${Math.round(width * fmt.h / fmt.w)}px`} aria-hidden="true"></canvas>`;
  }
  // Photos for the motion styles: the ad's photo, then the library photos of
  // its trades (RS.motion.photoSet); loaded once per ad look.
  const photoSets = new Map();
  function motionPhotos(project, images) {
    const key = `${(project.trades || []).join(',')}|${project.photo ? project.photo.asset : ''}|${images && images.photo ? 'p' : ''}|${JSON.stringify(M.photoSnapshot(project))}`;
    if (!photoSets.has(key)) {
      if (photoSets.size > 6) photoSets.clear();
      photoSets.set(key, (async () => {
        const [lib, mine] = await Promise.all([L.index().catch(() => ({ items: [] })), L.userItems().catch(() => [])]);
        return RS.motion.photoSet(project, images || {}, [...lib.items, ...mine]);
      })().catch(() => ({ hero: null, cards: [] })));
    }
    return photoSets.get(key);
  }
  const NO_PHOTOS = { hero: null, cards: [] };
  // Photos of a video: the styles' cards (the trades' library, or the photos
  // chosen in «Fotografias») and up to eight full-size photos for the recipes.
  const videoSets = new Map();
  const chosenPhotos = (project) => {
    const ph = project.video && project.video.photos;
    return ph && ph.mode === 'chosen' ? ph.ids : null;
  };
  const videoPhotosKey = (project, images) => `${(project.trades || []).join(',')}|${project.photo ? project.photo.asset : ''}|${images && images.photo ? 'p' : ''}|${(chosenPhotos(project) || []).join(',')}|${JSON.stringify(M.photoSnapshot(project))}`;
  function videoPhotos(project, images) {
    const key = videoPhotosKey(project, images);
    if (!videoSets.has(key)) {
      if (videoSets.size > 6) videoSets.clear();
      const chosen = !!chosenPhotos(project);
      videoSets.set(key, (async () => {
        const [set, full] = await Promise.all([chosen ? null : motionPhotos(project, images), RS.motion.recipePhotos(project, images || {}).catch(() => [])]);
        return chosen ? { hero: full[0] || null, cards: full, full } : { ...set, full };
      })().catch(() => NO_PHOTOS));
    }
    return videoSets.get(key);
  }
  // Everything the video reads from the ad (not its name, not the dates): a
  // prepared video is only made again when this changes.
  const videoKey = (p) => JSON.stringify([{ ...p.video, cover: undefined }, p.texts, p.offer, p.whatsapp, p.waTemplates, p.brand, p.logo, p.photo, p.style, p.show, p.locales, p.locale, p.trades, p.trade]);
  // the gallery's cards are too small for «Enquadrar»: a framing does not prepare them again
  const cardKey = (p) => {
    const ph = p.video && p.video.photos;
    return videoKey(ph && ph.focus ? { ...p, video: { ...p.video, photos: { ...ph, focus: undefined } } } : p); // left out as when none
  };
  function useVideoPhotos(project, images, on = true) {
    const [set, setSet] = useState(null);
    const key = videoPhotosKey(project, images);
    useEffect(() => {
      if (!on) return undefined;
      let live = true;
      videoPhotos(project, images).then((photos) => { if (live) setSet({ key, photos }); });
      return () => { live = false; };
    }, [key, on]);
    return set?.key === key ? set.photos : null;
  }
  // Plays a prepared video (RS.motion) in a loop, with a short pause on the
  // last frame, until the returned function is called. `clock` (seconds) drives
  // it instead when its sound plays; `fps` limits small previews.
  function playMotion(P, draw, { clock, onEnd, fps } = {}) {
    let raf = 0, last = 0;
    const t0 = performance.now();
    const d = P.timeline.duration;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (fps && now - last < 1000 / fps) return;
      last = now;
      let t;
      if (clock) { t = clock(); if (t > d + 0.6 && onEnd) onEnd(); } else t = ((now - t0) / 1000) % (d + 0.8);
      draw(Math.max(0, Math.min(t, d - 0.01)));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }
  // Animated preview of a video (export dialog, style gallery). `prepared` is
  // an RS.motion.prepare result; `still` (seconds) shows one frame instead.
  function VideoPreview({ prepared: P, width, still, clock, onEnd, fps }) {
    const ref = useRef();
    const fmt = P.fmt;
    useEffect(() => {
      const c = ref.current;
      if (!c || !width) return undefined;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = width / fmt.w;
      c.width = Math.round(fmt.w * k * dpr);
      c.height = Math.round(fmt.h * k * dpr);
      const ctx = c.getContext('2d');
      const draw = (t) => RS.motion.render(ctx, P, { t, scale: k * dpr });
      if (still != null) { draw(still); return undefined; }
      return playMotion(P, draw, { clock, onEnd, fps });
    }, [P, width, still, clock]);
    return html`<canvas ref=${ref} class="poster-thumb drawn" data-motion=${P.style.id} style=${`width:${width}px;height:${Math.round(width * fmt.h / fmt.w)}px`} aria-hidden="true"></canvas>`;
  }
  // The value, once it has stopped changing for `ms` (a colour being dragged).
  function useSettled(value, ms) {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
      if (settled === value) return undefined;
      const id = setTimeout(() => setSettled(value), ms);
      return () => clearTimeout(id);
    }, [value, ms]);
    return settled;
  }
  // Gallery of the motion styles, each one moving while it is on screen. The
  // cards follow what the video shows (not the ad's name) once the edits
  // settle: every model is prepared again, so not on every key.
  function MotionCard({ style, project: live, images, photos, on, onPick, disabled, width = 62 }) {
    const project = useSettled(live, 300);
    // on a phone the cards are still pictures (2026-10-29: eight cards playing at 12 fps took the
    // phone's whole time while «Estilo» scrolled); the stage plays the chosen one
    const phone = useMedia('(max-width: 860px)');
    const ref = useRef();
    const [visible, setVisible] = useState(false);
    useEffect(() => {
      if (!window.IntersectionObserver) { setVisible(true); return undefined; }
      const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
      io.observe(ref.current);
      return () => io.disconnect();
    }, []);
    // prepared in the drawing queue, one card per task: the panel shows at once and
    // a tap is never kept waiting for twenty videos (the card shimmers until then)
    const [P, setP] = useState(null);
    useEffect(() => {
      const job = {};
      queueThumb(job, () => {
        const v = project.video;
        const p = { ...project, video: { ...v, motion: style.id, duration: style.durations.includes(v.duration) ? v.duration : style.defaultDuration, bg: style.bgModes.includes(v.bg) ? v.bg : style.bgModes[0] } };
        setP(RS.motion.prepare(p, { format: 'story', locale: project.locale, images: images || {}, photos: photos || NO_PHOTOS, lite: true }));
      });
      return () => thumbJobs.delete(job);
    }, [cardKey(project), style, images, photos]);
    return html`<button ref=${ref} type="button" role="radio" aria-checked=${on} class=${'motion-card' + (on ? ' on' : '')} disabled=${disabled} onClick=${onPick}>
      ${P ? html`<${VideoPreview} prepared=${P} width=${width} still=${visible && !phone ? null : 1.2} fps=${12} />`
        : html`<span class="poster-thumb motion-wait" style=${`width:${width}px;height:${Math.round(width * 16 / 9)}px`} aria-hidden="true"></span>`}
      <span>${style.name}</span>
    </button>`;
  }
  function MotionPicker({ project, images, photos, value, onChange, disabled, list, label, cardWidth }) {
    return html`<div class="motion-picker" role="radiogroup" aria-label=${label || 'Estilo do vídeo'}>
      ${(list || RS.motion.STYLES).map((s) => html`<${MotionCard} key=${s.id} style=${s} project=${project} images=${images} photos=${photos}
        on=${value === s.id} disabled=${disabled} onPick=${() => onChange(s)} width=${cardWidth} />`)}
    </div>`;
  }
  function makeThumb(project, images) {
    const { canvas } = E.renderToCanvas(project, { format: 'portrait', images, scale: 300 / 1080, mode: 'thumb' });
    return canvas.toDataURL('image/jpeg', 0.82);
  }
  function applyBrand(project, brand) {
    return RS.reuse.applyBrand(project, brand);
  }
  // Marks one element as the poster that morphs into the next screen.
  function markPoster(el) { document.querySelectorAll('[style*="view-transition-name"]').forEach((n) => { n.style.viewTransitionName = ''; }); if (el) el.style.viewTransitionName = 'poster'; }
  // The home list as last seen: back from the editor, the cards are on screen at once
  // (the poster shrinks into its card in the same View Transition).
  const homeCache = { recs: null };
  const listHome = async () => (await S.listProjects()).filter((r) => !r.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  function keepInHome(rec) {
    if (!homeCache.recs || !rec) return;
    homeCache.recs = [rec, ...homeCache.recs.filter((r) => r.id !== rec.id)].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ============================================================== «Definições»
  // A new theme grows as a circle from the option tapped (a View Transition);
  // in calm mode, or without View Transitions, it changes at once. Choosing what
  // is already on screen changes nothing.
  function changeTheme(patch, from) {
    const AP = RS.appearance;
    const root = document.documentElement;
    const next = { ...AP.get(), ...patch };
    const same = AP.resolve(next.theme, window.matchMedia('(prefers-color-scheme: dark)').matches) === root.dataset.theme;
    if (same || reducedMotion()) { AP.set(patch); return; }
    if (RS.ui.illustrative()) {
      // under the sky the colours change at once (no ~200 colour transitions running there)
      RS.ui.nightfall(AP.resolve(next.theme, window.matchMedia('(prefers-color-scheme: dark)').matches) === 'dark', () => {
        root.classList.add('theme-switching');
        AP.set(patch);
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
      });
      return;
    }
    if (!document.startViewTransition) { AP.set(patch); return; }
    const r = from ? from.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty('--reveal-x', `${x}px`);
    root.style.setProperty('--reveal-y', `${y}px`);
    root.style.setProperty('--reveal-r', `${Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)))}px`);
    root.classList.add('theme-switching');
    const vt = document.startViewTransition(() => { AP.set(patch); });
    if (vt.ready) vt.ready.catch(() => {});
    if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
    vt.finished.catch(() => {}).then(() => root.classList.remove('theme-switching'));
  }
  const THEME_OPTIONS = [['auto', 'Automático', 'monitor-smartphone'], ['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon']];
  const MOTION_OPTIONS = [
    ['illustrative', 'Ilustrativo', 'A obra a acontecer em cada toque e em cada ecrã: a app viva, mesmo parada.'],
    ['sober', 'Sóbrio', 'Rápido e discreto no dia a dia; a grua e os tijolos só nas esperas e nas vitórias.'],
    ['calm', 'Calmo', 'Só esbatidos: nada voa, salta nem balança.'],
  ];
  // A small live picture of each style (decorative: the words say it).
  const MOTION_PREVIEW = {
    illustrative: html`<span class="ms-preview ms-illustrative" aria-hidden="true"><i class="ms-hook"></i><i class="ms-b b1"></i><i class="ms-b b2"></i><i class="ms-b b3"></i><i class="ms-b hop"></i></span>`,
    sober: html`<span class="ms-preview ms-sober" aria-hidden="true"><i class="ms-slot s1"></i><i class="ms-slot s2"></i><i class="ms-pill"></i></span>`,
    calm: html`<span class="ms-preview ms-calm" aria-hidden="true"><i class="ms-card-a"></i><i class="ms-card-b"></i></span>`,
  };
  // The motion style, the theme and the vibration — the home's «Definições» sheet
  // and the editor's «Definições» tab. Every choice applies at once and is kept on
  // this device (RS.appearance).
  function OfflinePanel() {
    const [state, setState] = useState(null), [working, setWorking] = useState(false);
    useEffect(() => RS.offline.subscribe(setState), []);
    const action = async (prepare) => { if (working) return; setWorking(true); try { await (prepare ? RS.offline.prepare() : RS.offline.check()); } finally { setWorking(false); } };
    const running = working || state?.running;
    return html`<section class="settings-group offline-panel"><h3>Disponível sem rede</h3>
      ${!state ? html`<p role="status">A verificar recursos guardados…</p>` : state.mode === 'file' ? html`<p>Esta cópia abre diretamente da pasta do computador. Mantenha a pasta completa para usar a aplicação e as fotografias sem rede.</p>` : html`
        <p role="status">${state.error || (state.appReady ? state.controlled ? 'Aplicação disponível offline.' : 'Aplicação preparada. Reabra para confirmar o funcionamento offline.' : 'A aplicação ainda não está totalmente preparada.')}</p>
        ${state.mode === 'web' && html`<p>Fotografias: ${state.photosReady || 0} de ${state.photosTotal === null ? 'total por verificar' : state.photosTotal} disponíveis.</p>
          <progress aria-label="Recursos disponíveis offline" value=${(state.coreReady || 0) + (state.photosReady || 0)} max=${(state.coreTotal || 0) + (state.photosTotal || 0) || 1}></progress>`}
        <div class="row-btns"><button class="btn ghost sm" disabled=${running} onClick=${() => action(false)}>Verificar novamente</button><button class="btn primary sm" disabled=${running || state.mode !== 'web'} onClick=${() => action(true)}>${running ? 'A preparar…' : state.errors?.length ? 'Repetir recursos em falta' : 'Preparar todos os recursos'}</button></div>
        ${state.errors?.length > 0 && html`<details class="offline-errors"><summary>${state.errors.length} recursos não foram guardados</summary><ul>${state.errors.slice(0, 8).map((e, i) => html`<li key=${i}>${e.url.includes('/photos/full/') ? `Fotografia ${e.url.split('/').pop().replace(/\.js$/, '')}` : 'Recurso da aplicação'}: ${e.reason}</li>`)}</ul>${state.errors.length > 8 && html`<p>E mais ${state.errors.length - 8}. A repetição tenta todos os recursos em falta.</p>`}</details>`}
        <p class="settings-note">Prepare os recursos com ligação à rede antes de sair. A preparação explícita descarrega as fotografias mesmo com a poupança de dados ativa.</p>
      `}
      <p class="settings-note">Os anúncios e recursos próprios ficam no armazenamento deste navegador. Use também uma cópia de segurança externa.</p>
    </section>`;
  }
  function SettingsPanel() {
    const [s, setS] = useState(() => RS.appearance.get());
    useEffect(() => RS.appearance.subscribe(setS), []);
    const style = document.documentElement.dataset.motion; // as applied (a device asking for less motion: Calmo)
    return html`<div class="settings">
      <section class="settings-group">
        <h3>Movimento</h3>
        <div class="motion-styles" role="radiogroup" aria-label="Movimento">
          ${MOTION_OPTIONS.map(([v, label, text]) => html`<button key=${v} type="button" role="radio" aria-checked=${style === v} class=${'ms-card' + (style === v ? ' on' : '')}
            onClick=${() => RS.appearance.set({ motion: v })}>${MOTION_PREVIEW[v]}<span class="ms-words"><strong>${label}</strong><span>${text}</span></span></button>`)}
        </div>
        ${s.motion === null && style === 'calm' && html`<p class="settings-note">Este aparelho pede menos movimento: fica no Calmo até escolher outro.</p>`}
      </section>
      <section class="settings-group">
        <h3>Tema</h3>
        <div class="seg settings-themes" role="radiogroup" aria-label="Tema">
          ${THEME_OPTIONS.map(([v, label, icon]) => html`<button key=${v} type="button" role="radio" aria-checked=${s.theme === v} class=${s.theme === v ? 'on' : ''}
            onClick=${(e) => changeTheme({ theme: v }, e.currentTarget)}><${Icon} name=${icon} size=${18} /><span>${label}</span></button>`)}
        </div>
        <p class="settings-note">${s.theme === 'auto' ? 'Segue o telemóvel ou o computador, também quando muda à noite.' : 'Fica assim neste aparelho.'}</p>
      </section>
      <section class="settings-group">
        <label class="switch settings-haptics"><input id="f-haptics" type="checkbox" checked=${s.haptics}
          onChange=${(e) => RS.appearance.set({ haptics: e.target.checked })} /><span class="switch-ui"></span> Vibração</label>
        <p class="settings-note">Um toque leve no telemóvel quando carrega nos botões.</p>
      </section>
      <${OfflinePanel} />
      <${SettingsVersion} />
    </div>`;
  }
  // The version of the copy in use (the offline cache's name); five quick taps on it show
  // or hide the hidden frame meter (RS.frameMeter) for a test on the phone.
  function SettingsVersion() {
    const [version, setVersion] = useState('');
    const taps = useRef([]);
    useEffect(() => {
      if (!window.caches || !/^https?:$/.test(location.protocol)) return;
      caches.keys().then((keys) => {
        const k = keys.filter((x) => x.startsWith('recruitment-studio-')).pop();
        if (k) setVersion(k.slice('recruitment-studio-'.length));
      }).catch(() => {});
    }, []);
    const tap = () => {
      const now = Date.now();
      taps.current = taps.current.filter((t) => now - t < 3000).concat(now);
      if (taps.current.length >= 5) { taps.current = []; RS.frameMeter.toggle(); }
    };
    return html`<p class="settings-version" onClick=${tap}>Versão ${version || 'deste computador'}</p>`;
  }
  // The home's «Definições»: a dialog (a sheet rising from the bottom on a phone).
  function SettingsSheet({ onClose }) {
    const [closing, close] = useClosing(onClose);
    const prevFocus = useRef(document.activeElement);
    const boxRef = useRef();
    useEffect(() => {
      const x = boxRef.current && boxRef.current.querySelector('.modal-head .icon-btn');
      if (x && window.matchMedia('(hover: hover)').matches) x.focus();
      return () => { if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus(); };
    }, []);
    return html`<div class=${'modal-back' + (closing ? ' closing' : '')} onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown=${(e) => { if (e.key === 'Escape') close(); }}>
      <div class="modal settings-sheet settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref=${boxRef}>
        <header class="modal-head">
          <h2 id="settings-title">Definições</h2>
          <button class="icon-btn" aria-label="Fechar" onClick=${() => close()}><${Icon} name="x" /></button>
        </header>
        <div class="settings-body"><${SettingsPanel} /></div>
      </div>
    </div>`;
  }

  // ============================================================== install as an app
  // The browser's own install (Android, Chrome and Edge) and the «installed» moment.
  const installBus = { evt: null, subs: new Set() };
  const welcomeBus = { subs: new Set() };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installBus.evt = e; installBus.subs.forEach((f) => f(true)); });
  window.addEventListener('appinstalled', () => { installBus.evt = null; installBus.subs.forEach((f) => f(false)); RS.install.markWelcomed(); welcomeBus.subs.forEach((f) => f(true)); });
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const PHONES = new Set(['ios-safari', 'ios-other', 'ios-inapp', 'android-inapp', 'android', 'firefox-android', 'samsung']);
  // «Instalar»: one tap where the browser installs by itself; otherwise the sheet
  // with the steps of the browser in use and, on a computer, the QR for the phone.
  // On the .exe (file://) and in an installed computer app: «Instalar no telemóvel».
  // Installing: offered (not on a phone that already has the app), its words, the
  // action, and the guide sheet it opens (to render where the offer is).
  function useInstall() {
    const [, setCan] = useState(!!installBus.evt);
    const [sheet, setSheet] = useState(null);
    useEffect(() => { installBus.subs.add(setCan); return () => installBus.subs.delete(setCan); }, []);
    const p = RS.install.detect();
    const phone = PHONES.has(p);
    const offered = !(p === 'installed' && RS.install.phone(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints }));
    const toPhone = p === 'file' || p === 'installed';
    const label = toPhone ? 'Instalar no telemóvel' : 'Instalar';
    async function install() {
      const e = installBus.evt;
      if (e && !toPhone) {
        installBus.evt = null;
        setCan(false);
        e.prompt();
        try { await e.userChoice; } catch { /* closed */ }
        if (!phone) setSheet(RS.install.detect()); // then the phone, from the same sheet
        return;
      }
      setSheet(RS.install.detect());
    }
    return { offered, label, toPhone, install, title: toPhone ? 'Um código QR para instalar a app no telemóvel' : 'Instalar o Recruitment Studio neste aparelho',
      sheet: sheet && html`<${InstallSheet} platform=${sheet} onClose=${() => setSheet(null)} />` };
  }
  // The guide's drawing (RS.install.DEMOS): the browser in use with its bar, the
  // menu or the confirmation each step opens, and a finger (on a computer, the
  // pointer) that goes to what to tap and taps it. Decorative: the steps beside it
  // say the same in words.
  function InstallDemo({ demo, step }) {
    const [where, arg] = demo.taps[step] || ['none'];
    const ref = useRef();
    const placed = useRef(false);
    const [finger, setFinger] = useState(null);
    // Where the thing to tap is, from the layout (a menu still springing in has
    // not reached its place on screen yet; the finger goes where it will be).
    useLayoutEffect(() => {
      const box = ref.current;
      const hit = box && box.querySelector('.demo-hit');
      if (!hit) { setFinger((f) => (f ? { ...f, off: true, first: false } : f)); return; }
      let x = hit.offsetWidth / 2, y = hit.offsetHeight / 2;
      for (let n = hit; n && n !== box; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      setFinger({ x: Math.round(x), y: Math.round(y), first: !placed.current });
      placed.current = true;
    }, [step]);
    const hitIf = (on) => (on ? ' demo-hit' : '');
    const menu = where === 'menu' && html`<span class=${'demo-menu demo-in ' + (demo.bar === 'bottom' ? 'from-bottom' : 'from-top')}>
      ${demo.menu.map((row, i) => html`<span key=${i} class=${'demo-row' + hitIf(arg === i)}>${row}</span>`)}</span>`;
    const tool = (name, i) => html`<span key=${i} class=${'demo-tool' + hitIf(where === 'tool' && arg === i)}>
      ${demo.bar === 'menu' ? name : html`<${Icon} name=${name} size=${13} stroke=${2.2} />`}
      ${demo.bar === 'menu' && demo.menuFrom === i && menu}</span>`;
    const dialog = where === 'dialog' && html`<span class=${'demo-dialog demo-in' + (demo.device === 'computer' && demo.bar === 'top' ? ' anchored' : '')}>
      <img src="assets/brand/icon-small.svg" alt="" width="22" height="22" />
      <b>Recruitment Studio</b>
      <span class="demo-btns"><span class="demo-btn">Cancelar</span><span class=${'demo-btn primary' + hitIf(true)}>${arg}</span></span></span>`;
    const page = html`<span class="demo-page"><i class="demo-app"></i><i></i><i></i><i class="short"></i></span>`;
    const bar = html`<span class="demo-bar">
      ${demo.device === 'computer' && html`<span class="demo-dots"><i></i><i></i><i></i></span>`}
      <span class="demo-url">….ts.net${demo.device === 'computer' && demo.bar === 'top' && html`<span class="demo-tools">${demo.tools.map(tool)}</span>`}</span>
      ${demo.device === 'phone' && html`<span class="demo-tools">${demo.tools.map(tool)}</span>`}</span>`;
    return html`<div class=${`install-demo ${demo.device} bar-${demo.bar}`} ref=${ref} aria-hidden="true">
      ${demo.bar === 'menu' && html`<span class="demo-osbar">${demo.tools.map(tool)}</span>`}
      <span class="demo-screen">
        ${demo.bar !== 'bottom' && bar}
        ${page}
        ${demo.bar === 'bottom' && bar}
        ${demo.bar !== 'menu' && menu}
        ${demo.device === 'phone' && dialog}
      </span>
      ${demo.device === 'computer' && dialog}
      ${finger && !finger.off && html`<span key=${`tap${step}`} class="demo-tap" style=${`transform:translate(${finger.x}px, ${finger.y}px)`}></span>`}
      ${finger && html`<span class=${'demo-finger' + (finger.first ? ' first' : '') + (finger.off ? ' off' : '')} style=${`transform:translate(${finger.x}px, ${finger.y}px)`}>
        <i key=${step}>${demo.device === 'computer' && html`<svg viewBox="0 0 16 20" width="16" height="20"><path d="M1 1v15l4-3.6L7.6 19l2.6-1.2-2.5-5.6H13z" /></svg>`}</i></span>`}
    </div>`;
  }
  function InstallSheet({ platform: p, onClose }) {
    const [closing, close] = useClosing(onClose);
    const phone = PHONES.has(p);
    const toPhone = p === 'file' || p === 'installed';
    const steps = RS.install.STEPS[toPhone ? 'file' : p] || RS.install.STEPS.other;
    const demo = toPhone ? null : RS.install.DEMOS[p] || null;
    // the step being shown goes round, the finger tapping each button in turn
    const [now, setNow] = useState(0);
    useEffect(() => {
      const id = setInterval(() => setNow((n) => (n + 1) % steps.length), 2000);
      return () => clearInterval(id);
    }, [steps.length]);
    const [address, setAddress] = useState(() => (phone ? null : RS.install.appAddress()));
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const qrRef = useRef();
    const fieldRef = useRef();
    useEffect(() => {
      const cv = qrRef.current;
      if (!cv || !address) return;
      cv.width = cv.height = 600;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 600, 600);
      RS.engine.drawQR({ ctx, hit() {} }, address, 0, 0, 600, { dark: '#0B1220', light: '#FFFFFF' });
    }, [address]);
    function useAddress(e) {
      e.preventDefault();
      const r = RS.install.checkAddress(fieldRef.current ? fieldRef.current.value : draft);
      if (!r.ok) { setError(r.error); return; }
      RS.install.rememberAddress(r.url);
      setError('');
      setAddress(r.url);
    }
    const prevFocus = useRef(document.activeElement);
    const boxRef = useRef();
    useEffect(() => {
      const f = boxRef.current && (boxRef.current.querySelector('#f-app-url') || boxRef.current.querySelector('.modal-head .icon-btn'));
      if (f && window.matchMedia('(hover: hover)').matches) f.focus();
      return () => { if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus(); };
    }, []);
    const list = (cls) => html`<ol class=${'install-steps ' + cls}>${steps.map((st, i) => html`<li key=${i} class=${'install-step' + (i === now ? ' now' : '')}>
      <span class="install-ico" aria-hidden="true"><${Icon} name=${st.icon} size=${20} /></span><span>${st.text}</span></li>`)}</ol>`;
    return html`<div class=${'modal-back' + (closing ? ' closing' : '')} onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown=${(e) => { if (e.key === 'Escape') close(); }}>
      <div class="modal install" role="dialog" aria-modal="true" aria-labelledby="install-title" ref=${boxRef}>
        <header class="modal-head">
          <h2 id="install-title">${toPhone ? 'Instalar no telemóvel' : 'Instalar o Recruitment Studio'}</h2>
          <button class="icon-btn" aria-label="Fechar" onClick=${() => close()}><${Icon} name="x" /></button>
        </header>
        <div class="install-body">
          ${!toPhone && html`<section class="install-guide">
            <h3>${phone ? 'Neste telemóvel' : 'Neste computador'}</h3>
            ${demo && html`<${InstallDemo} demo=${demo} step=${now} />`}
            ${list('guide')}
            <p class="install-note">Depois abre como uma app, sem a barra do navegador, e funciona sem rede.</p>
          </section>`}
          ${!phone && html`<section class=${'install-phone' + (toPhone ? ' to-phone' : '')}>
            <h3>No telemóvel</h3>
            ${address ? html`<div class="install-qr-col"><figure class="install-qr" data-link=${address} role="img" aria-label=${`Código QR para abrir ${address} no telemóvel`}><canvas ref=${qrRef}></canvas></figure>
              <p class="install-note"><${Icon} name="smartphone" size=${16} /> Aponte a câmara do telemóvel. O telemóvel precisa do Tailscale ligado.</p>
              <p class="install-url">${address}${p === 'file' && html` <button type="button" class="btn link sm" onClick=${() => { setDraft(address); setAddress(null); }}>Mudar</button>`}</p></div>
              ${toPhone && list('phone')}`
            : html`<form class="install-ask" onSubmit=${useAddress}>
              <label for="f-app-url">Endereço da app</label>
              <input ref=${fieldRef} id="f-app-url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://….ts.net" value=${draft}
                onInput=${(e) => { setDraft(e.target.value); setError(''); }} />
              ${error ? html`<small class="field-hint warn">${error}</small>`
                : html`<small class="field-hint">O endereço da cópia publicada no seu Tailscale. Fica guardado neste computador.</small>`}
              <button class="btn primary" type="submit"><${Icon} name="qr-code" /> Mostrar QR</button>
            </form>`}
          </section>`}
        </div>
      </div>
    </div>`;
  }
  // The first opening as an installed app: the icon arrives and the app says hello.
  function Welcome({ onDone }) {
    useEffect(() => { RS.haptics.success(); }, []);
    const btnRef = useRef();
    useEffect(() => { if (btnRef.current) btnRef.current.focus(); }, []);
    return html`<div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onKeyDown=${(e) => { if (e.key === 'Escape') onDone(); }}>
      <div class="welcome-card">
        <img class="welcome-icon" src="assets/brand/icon.svg" alt="" width="88" height="88" />
        <h2 id="welcome-title" class="sr-only">Bem-vindo ao Recruitment Studio</h2>
        <${Celebration} title="BEM-VINDO" detail="O Recruitment Studio já está no seu ecrã principal." duration=${2400} />
        <button ref=${btnRef} class="btn primary lg" onClick=${onDone}>Começar</button>
      </div>
    </div>`;
  }

  // ============================================================== home
  // Recovery is available on the home screen (also on phones) and in the editor.
  function RecoveryDialog({ projectId, onClose, onRestore, onSnapshot, editorOptions }) {
    const trash = !projectId;
    const [rows, setRows] = useState(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const pending = useRef(false), modal = useRef();
    const previousFocus = useRef(document.activeElement);
    const date = (ts) => new Date(ts).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
    const read = async () => trash
      ? (await S.listProjects()).filter((r) => r.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt)
      : S.listVersions(projectId);
    useEffect(() => {
      let live = true;
      read().then((r) => { if (live) setRows(r); }).catch((err) => { if (live) setError(err.message); });
      if (modal.current) modal.current.focus();
      return () => { live = false; if (previousFocus.current && previousFocus.current.isConnected) previousFocus.current.focus(); };
    }, [projectId]);
    const close = () => { if (!pending.current) onClose(); };
    async function action(fn) {
      if (pending.current) return;
      pending.current = true; setWorking(true); setError(''); setNotice('');
      try { await fn(); setRows(await read()); }
      catch (err) { setError(err.message || 'Não foi possível concluir. Tente de novo.'); }
      finally { pending.current = false; setWorking(false); }
    }
    const restore = (row) => action(async () => {
      const rec = trash ? await S.setDeleted(row.id, null) : await S.restoreVersion(projectId, row.id, editorOptions ? editorOptions() : {});
      if (onRestore) await onRestore(rec);
      setNotice(trash ? 'Anúncio restaurado' : 'Versão restaurada. A versão anterior continua no histórico.');
    });
    const snapshot = () => action(async () => {
      if (onSnapshot) await onSnapshot();
      else {
        const rec = await S.getProject(projectId);
        if (!rec) throw new Error('O anúncio já não está disponível.');
        await S.saveVersion(rec.data, rec.thumb);
      }
      setNotice('Versão guardada no histórico');
    });
    const keys = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key !== 'Tab') return;
      const nodes = [...modal.current.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modal.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modal.current)) { e.preventDefault(); first.focus(); }
    };
    return html`<div class="modal-back" onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown=${keys}>
      <section ref=${modal} class="modal recovery" role="dialog" aria-modal="true" aria-labelledby="recovery-title" tabIndex="-1" aria-busy=${working}>
        <header class="modal-head"><h2 id="recovery-title">${trash ? 'Reciclagem' : 'Histórico de versões'}</h2>
          <button class="icon-btn" aria-label="Fechar recuperação" disabled=${working} onClick=${close}><${Icon} name="x" /></button></header>
        <div class="recovery-body">
          <p>${trash ? `Os anúncios ficam aqui durante ${S.TRASH_DAYS} dias, com as imagens, o som e as versões.`
            : `Até ${S.HISTORY_LIMIT} versões por anúncio. As alterações automáticas são agrupadas por minuto. Restaurar conserva a versão atual no histórico.`}</p>
          ${!trash && html`<button class="btn ghost recovery-save" disabled=${working} onClick=${snapshot}><${Icon} name="save" /> Guardar versão atual</button>`}
          ${error && html`<p class="recovery-error" role="alert">${error}</p>`}
          ${notice && html`<p class="recovery-notice" role="status">${notice}</p>`}
          ${!rows && !error ? html`<p role="status">A carregar…</p>` : rows && !rows.length ? html`<p class="recovery-empty">${trash ? 'A reciclagem está vazia.' : 'Ainda não há versões anteriores. Pode guardar uma versão agora.'}</p>` : null}
          <ul class="recovery-list">${(rows || []).map((r) => html`<li key=${r.id}>
            ${r.thumb && html`<img class="recovery-thumb" src=${r.thumb} alt="" loading="lazy" />`}
            <div class="recovery-info"><strong>${r.data.name || 'Sem título'}</strong>
              <span>${date(trash ? r.deletedAt : r.savedAt)}</span>
              <small>${trash ? `Disponível por mais ${Math.max(0, Math.ceil((r.deletedAt + S.TRASH_DAYS * 86400000 - Date.now()) / 86400000))} dias` : r.reason}</small>
            </div>
            <button class="btn ghost sm" disabled=${working} onClick=${() => restore(r)} aria-label=${`Restaurar ${trash ? 'anúncio' : 'versão'} ${r.data.name || ''} de ${date(trash ? r.deletedAt : r.savedAt)}`}><${Icon} name="rotate-ccw" size=${16} /> Restaurar</button>
          </li>`)}</ul>
        </div>
      </section>
    </div>`;
  }

  function Home({ onNew, onOpen, busy, brand, setBrand }) {
    const { fileSaving, saveFile } = useProjectFile();
    const inst = useInstall();
    const [recs, setRecs] = useState(homeCache.recs);
    const [menu, setMenu] = useState(null);
    const [reading, setReading] = useState(false);
    const [meet, setMeet] = useState(false);
    const [settings, setSettings] = useState(false);
    const [recovery, setRecovery] = useState(null);
    const [organizing, setOrganizing] = useState(null);
    const [reuseOpen, setReuseOpen] = useState(false);
    const [backupOpen, setBackupOpen] = useState(false);
    const [filters, setFilters] = useState(homeCache.filters || { ...W.DEFAULT_FILTERS });
    const changeFilters = (next) => { homeCache.filters = next; setFilters(next); };
    const shown = useMemo(() => W.selectProjects(recs || [], filters), [recs, filters]);
    // search and «Filtros» once there are enough ads to need them (always while a filter is on)
    const allFilters = { ...W.DEFAULT_FILTERS, ...filters };
    const filtering = Object.keys(W.DEFAULT_FILTERS).some((k) => allFilters[k] !== W.DEFAULT_FILTERS[k]);
    const findable = !!recs && (recs.length >= 8 || filtering);
    async function favorite(rec) {
      try { await S.updateOrganization(rec.id, { favorite: !M.cleanOrganization(rec.data.organization).favorite }); await refresh(); }
      catch (err) { toast(err.message, { kind: 'error' }); }
    }
    const live = RS.ui.useMotionStyle() === 'illustrative';
    const gridRef = useRef();
    RS.ui.useFlip(gridRef);
    useEffect(() => (live ? RS.ui.leanCards(gridRef.current) : undefined), [live, recs && recs.length]);
    // A number typed in «Mostrar QR» is kept in «A minha marca» (only the number).
    async function keepNumber(whatsapp) {
      const b = { ...(brand || {}), whatsapp };
      setBrand(RS.reuse.defaultBrand(await S.saveDefaultBrand(b)));
    }
    // Version of the published copy (the offline cache name), to check an update arrived.
    const [version, setVersion] = useState('');
    useEffect(() => {
      if (!window.caches || !/^https?:$/.test(location.protocol)) return;
      caches.keys().then((keys) => {
        const k = keys.filter((x) => x.startsWith('recruitment-studio-')).pop(); // newest last
        if (k) setVersion(k.slice('recruitment-studio-'.length));
      }).catch(() => {});
    }, []);
    const refresh = useCallback(async () => {
      homeCache.recs = await listHome();
      setRecs(homeCache.recs);
    }, []);
    useEffect(() => { refresh(); }, []);
    useEffect(() => {
      if (!menu) return undefined;
      const close = () => setMenu(null);
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }, [menu]);

    async function openFile() {
      if (reading || busy) return;
      const f = await U.pickFile('.anuncio,application/json');
      if (!f) return;
      setReading(true);
      try {
        await afterPaint();
        const p = await A.importProjectFile(f);
        await S.putProject(p);
        setReading(false);
        onOpen(p, `open:${p.id}`);
      } catch (err) {
        setReading(false);
        toast(err.message, { kind: 'error' });
      }
    }
    async function duplicate(rec) {
      const p = U.clone(rec.data);
      p.id = U.uid(); p.name = `${rec.data.name} (cópia)`; p.nameAuto = false;
      p.createdAt = p.updatedAt = Date.now();
      p.organization = { ...M.cleanOrganization(p.organization), status: 'draft', favorite: false };
      p.publication = M.cleanPublication();
      await S.putProject(p, rec.thumb);
      refresh();
      toast('Anúncio duplicado');
    }
    async function remove(rec) {
      // Ilustrativo: the card crumbles into bricks; the others glide into its place
      const card = document.querySelector(`.proj-card[data-id="${CSS.escape(rec.id)}"]`);
      if (card && RS.ui.illustrative()) { RS.ui.crumble(card.querySelector('.proj-thumb'), rec.thumb); card.classList.add('crumbling'); }
      try {
        await S.setDeleted(rec.id, Date.now());
      } catch (err) {
        console.error(err);
        if (card) card.classList.remove('crumbling');
        toast('Não foi possível eliminar o anúncio.', { kind: 'error' });
        return;
      }
      refresh();
      toast(`«${rec.name}» foi movido para a reciclagem`, { action: 'Anular', onAction: async () => {
        try { await S.setDeleted(rec.id, null); await refresh(); } catch (err) { toast(err.message, { kind: 'error' }); }
      } });
    }

    // «Balão»: the call to action is a white speech bubble on the orange band (on the
    // crane's hook while there are no ads)
    const newAd = html`<button class=${'new-ad' + (busy === 'gallery' ? ' busy' : '')} onClick=${() => { if (!busy || navAnim.on) onNew(); }} aria-busy=${busy === 'gallery'}>
      <span class="new-plus" aria-hidden="true">${busy === 'gallery' ? html`<${Spinner} />` : html`<${Icon} name="plus" size=${20} stroke=${2.6} />`}</span>
      <span>${busy === 'gallery' ? 'A abrir os modelos…' : 'Novo anúncio'}</span>
    </button>`;
    const total = recs ? recs.length : 0;
    const device = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'telemóvel' : 'computador';
    const count = total === 1 ? `1 oferta guardada neste ${device}` : `${total} ofertas guardadas neste ${device}`;
    // the same name twice: the template tells the two cards apart
    const names = useMemo(() => {
      const n = new Map();
      for (const r of shown) n.set(r.name, (n.get(r.name) || 0) + 1);
      return n;
    }, [shown]);
    const metaOf = (r) => {
      const langs = M.languagesLine(r.data.locales || []);
      const when = U.relativeDay(r.updatedAt);
      return names.get(r.name) > 1 ? `${T.get(r.template).name}, ${langs.charAt(0).toLowerCase()}${langs.slice(1)}, ${when}` : `${langs}, ${when}`;
    };
    useEffect(() => { RS.appearance.setBar('band'); return () => RS.appearance.setBar('surface'); }, []);
    return html`<div class="home screen">
      ${live && html`<div class="home-ambient" aria-hidden="true">
        <svg class="amb-crane" viewBox="0 0 220 220"><path d="M40 220V22M56 220V22M40 38L56 54L40 70L56 86L40 102L56 118L40 134L56 150L40 166L56 182L40 198L56 214M40 22L48 2L56 22M48 2V22M4 22H216M56 32H206L216 22M48 2L216 22M48 2L4 22" /></svg>
        <span class="amb-load"><i></i><b></b></span>
      </div>`}
      <header class="home-band">
        <div class="home-top">
          <${BandMark} />
          <div class="spacer"></div>
          ${reading && html`<span class="project-file-status" role="status"><${Spinner} /> A abrir…</span>`}
          <button class="icon-btn home-qr" onClick=${() => setMeet(true)} aria-label="Mostrar QR" title="Mostrar QR: o seu WhatsApp para mostrar cara a cara"><${Icon} name="qr-code" /><span class="sr-only">Mostrar QR</span></button>
          <${MoreMenu} where="home" items=${[
            { label: reading ? 'A abrir…' : 'Abrir ficheiro', icon: 'folder-open', disabled: reading, title: 'Abrir um anúncio guardado num ficheiro (.anuncio)', onClick: openFile },
            { label: 'Marcas e modelos', icon: 'copy', onClick: () => setReuseOpen(true) },
            { label: 'Cópias de segurança', icon: 'save', onClick: () => setBackupOpen(true) },
            { label: 'Reciclagem', icon: 'trash-2', onClick: () => setRecovery({ id: null }) },
            inst.offered && { label: inst.label, icon: inst.toPhone ? 'smartphone' : 'download', cls: 'install-item', title: inst.title, onClick: inst.install },
            { label: 'Definições', icon: 'settings', title: 'Movimento, tema e vibração', onClick: () => setSettings(true) },
          ].filter(Boolean)} />
        </div>
        <div class="band-row">
          <div class="band-words">
            <h1>Os seus anúncios</h1>
            <p class="home-count">${recs ? count : ' '}${fileSaving ? html` <span class="project-file-status" role="status"><${Spinner} /> A preparar projeto…</span>` : ''}</p>
          </div>
          ${recs && recs.length > 0 && newAd}
        </div>
      </header>
      ${inst.sheet}
      ${settings && html`<${SettingsSheet} onClose=${() => setSettings(false)} />`}
      ${backupOpen && html`<${BackupDialog} onClose=${() => setBackupOpen(false)} onRestore=${async () => { setBrand(RS.reuse.defaultBrand(await S.getCatalog())); await refresh(); }} />`}
      ${reuseOpen && html`<${ReuseDialog} onChange=${setBrand} onClose=${() => setReuseOpen(false)} onUse=${async (p) => { await S.putProject(p); await onOpen(p); }} />`}
      ${meet && html`<${MeetQR} whatsapp=${brand && brand.whatsapp} onNumber=${keepNumber} keptIn="na sua marca" onClose=${() => setMeet(false)} />`}
      ${recovery && html`<${RecoveryDialog} projectId=${recovery.id} onClose=${() => setRecovery(null)} onRestore=${() => refresh()} />`}
      ${organizing && html`<${OrganizationDialog} project=${organizing.data} onClose=${() => setOrganizing(null)} onSave=${async (o) => { await S.updateOrganization(organizing.id, o); await refresh(); }} />`}
      <main class="home-main">
        ${findable && recs.length > 0 && html`<${HomeFilters} records=${recs} filters=${filters} onChange=${changeFilters} /><p class="filter-count" role="status">${shown.length} de ${recs.length} anúncios</p>`}
        ${!recs ? null : !recs.length ? html`<${EmptySite}>${newAd}<//>` : html`<div ref=${gridRef} class=${'card-grid stagger' + (busy === 'gallery' || (busy && busy.startsWith('open:')) ? ' is-busy' : '')}>
          ${shown.map((r, i) => {
            const org = M.cleanOrganization(r.data.organization);
            const open = (piece) => { if (busy && !navAnim.on) return; onOpen(r.data, `open:${r.id}`, piece); };
            return html`<div key=${r.id} data-id=${r.id} data-flip=${r.id} class=${'proj-card' + (busy === `open:${r.id}` ? ' busy' : '')} style=${`--i:${Math.min(i + 1, 10)}`}>
            <button class="proj-open" onClick=${(e) => { if (busy && !navAnim.on) return; markPoster(e.currentTarget.querySelector('.proj-thumb')); onOpen(r.data, `open:${r.id}`); }}
              aria-label=${`Abrir ${r.name}`} aria-busy=${busy === `open:${r.id}`}
              aria-describedby=${[org.status !== 'draft' && `proj-st-${r.id}`, org.favorite && `proj-fav-${r.id}`, `proj-meta-${r.id}`].filter(Boolean).join(' ')}>
              <span class="proj-thumb">${r.thumb ? html`<img src=${r.thumb} alt="" />` : html`<span class="proj-thumb-empty"><${Icon} name="image" size=${28} /></span>`}
                ${busy === `open:${r.id}` && html`<span class="busy-veil"><${Spinner} large /> A abrir…</span>`}
                ${org.status !== 'draft' && html`<span id=${`proj-st-${r.id}`} class=${`proj-status ${org.status}`}>${org.status === 'published' || org.status === 'ready' ? html`<${Icon} name="check" size=${13} stroke=${2.6} />` : ''}${M.STATUSES[org.status]}</span>`}
                ${org.favorite && html`<span id=${`proj-fav-${r.id}`} class="proj-fav-mark" role="img" aria-label="Favorito"><${Icon} name="star" size=${13} /></span>`}</span>
              <span class="proj-name">${r.name || 'Sem título'}</span>
              <span id=${`proj-meta-${r.id}`} class="proj-meta">${metaOf(r)}</span>
              ${org.campaign && html`<span class="project-campaign">${org.campaign}</span>`}
            </button>
            <button class="proj-more icon-btn" aria-label=${`Mais ações para ${r.name}`} aria-expanded=${menu === r.id}
              onClick=${(e) => { e.stopPropagation(); setMenu(menu === r.id ? null : r.id); }}><${Icon} name="ellipsis" /></button>
            ${menu === r.id && html`<div class="menu pop" role="menu">
              <button role="menuitem" onClick=${() => open('image')}><${Icon} name="image" /> Abrir na imagem</button>
              <button role="menuitem" onClick=${() => open('carousel')}><${Icon} name="layers" /> Abrir no carrossel</button>
              <button role="menuitem" onClick=${() => open('video')}><${Icon} name="video" /> Abrir no vídeo</button>
              <button role="menuitem" onClick=${() => favorite(r)}><${Icon} name="star" /> ${org.favorite ? 'Tirar dos favoritos' : 'Marcar como favorito'}</button>
              <button role="menuitem" onClick=${() => setOrganizing(r)}><${Icon} name="folder-open" /> Organizar anúncio</button>
              <button role="menuitem" onClick=${() => duplicate(r)}><${Icon} name="copy" /> Duplicar</button>
              <button role="menuitem" disabled=${fileSaving} onClick=${() => saveFile(r.data)}><${Icon} name="save" /> Guardar ficheiro do projeto</button>
              <button role="menuitem" onClick=${() => setRecovery({ id: r.id })}><${Icon} name="clock" /> Histórico de versões</button>
              <button role="menuitem" class="danger" onClick=${() => remove(r)}><${Icon} name="trash-2" /> Mover para a reciclagem</button>
            </div>`}
          </div>`;
          })}
        </div>`}
        ${recs && recs.length > 0 && !shown.length && html`<p class="workflow-empty">Nenhum anúncio corresponde aos filtros. <button class="btn link" onClick=${() => changeFilters({ ...W.DEFAULT_FILTERS })}>Limpar filtros</button></p>`}
        ${recs && !recs.length && html`<p class="home-empty">Ainda não há anúncios. O primeiro demora dois minutos.</p>`}
        ${!S.isPersistent() && html`<p class="home-warn"><${Icon} name="triangle-alert" /> Este navegador não permite guardar dados. Use «Guardar ficheiro do projeto» (no ⋯ de cada anúncio) para não perder o trabalho.</p>`}
        ${version && html`<p class="home-version">Versão ${version}</p>`}
      </main>
    </div>`;
  }

  // No ads yet: a building site where the crane's hook holds the call to action.
  function EmptySite({ children }) {
    const zig = [];
    for (let x = 68; x < 318; x += 10) zig.push(`L${x + 5} ${(x - 68) % 20 ? 34 : 24}`);
    return html`<div class="empty-site">
      <svg class="site-crane" viewBox="0 0 340 110" aria-hidden="true" focusable="false">
        <path class="steel" d=${'M52 24V110M68 24V110M52 34L68 46L52 58L68 70L52 82L68 94L52 106M52 24L60 4L68 24M10 24H330M68 34H322L330 24M60 4L330 24M60 4L10 24M68 34' + zig.join('')} />
        <rect class="signal" x="14" y="26" width="26" height="14" rx="2" />
        <rect class="steel" x="70" y="36" width="14" height="12" rx="2" />
        <rect class="signal" x="162" y="33" width="16" height="7" rx="2" />
        <path class="steel thin" d="M170 40V110" />
      </svg>
      <div class="site-load">
        <svg viewBox="0 0 220 40" aria-hidden="true" focusable="false">
          <path class="hook" d="M110 0V10M110 10c-6 0-6 9 0 9s6-5 4-7" />
          <path class="steel thin" d="M110 19L12 40M110 19L208 40" />
        </svg>
        ${children}
      </div>
    </div>`;
  }

  // ============================================================== template gallery
  // The ad's trades: several can be chosen, the first is the main one (its ready
  // texts are used). withTemplate adds «Do modelo» (none chosen: the template's trade).
  function TradePicker({ value, onChange, withTemplate }) {
    const list = value || [];
    const toggle = (id) => onChange(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    return html`<div class="chips-row" role="group" aria-label="Profissões">
      ${withTemplate && html`<button aria-pressed=${!list.length} class=${'tchip' + (!list.length ? ' on' : '')} onClick=${() => onChange([])}>
        <${Icon} name="layout-template" size=${15} /> Do modelo</button>`}
      ${TR.list.map((t) => {
        const i = list.indexOf(t.id);
        return html`<button key=${t.id} aria-pressed=${i >= 0} class=${'tchip' + (i >= 0 ? ' on' : '')} onClick=${() => toggle(t.id)}
          title=${i === 0 ? 'Profissão principal: os textos prontos vêm desta' : ''}>
          <${Icon} name=${t.icon} size=${15} /> ${t.label}${i === 0 && list.length > 1 ? html` <small class="tchip-main">principal</small>` : ''}</button>`;
      })}
    </div>`;
  }
  const tradesLabel = (ids) => {
    const first = TR.get(ids[0]);
    return first ? `${first.label}${ids.length > 1 ? ` +${ids.length - 1}` : ''}` : '';
  };

  function Gallery({ brand: initialBrand, onBack, onCreate, busy }) {
    useLayoutEffect(() => { window.scrollTo(0, 0); }, []);
    const [brand, setBrand] = useState(initialBrand), [brands, setBrands] = useState([]);
    useEffect(() => { let live = true; S.getCatalog().then((c) => { if (live) { setBrands(c.brands); const selected = c.brands.find((b) => b.id === initialBrand?.id) || RS.reuse.defaultBrand(c); setBrand(selected); setUseBrand(!!selected); } }).catch(() => {}); return () => { live = false; }; }, []);
    const [format, setFormat] = useState('portrait');
    // «Começar por»: the piece the new ad opens on (Imagem: the poster templates;
    // Carrossel: «Do anúncio» and the six styles; Vídeo: the video models)
    const [start, setStart] = useState('image');
    const [trades, setTrades] = useState([]);
    const trade = trades[0] || '';
    const [useBrand, setUseBrand] = useState(!!brand);
    // undefined = still loading; null = none.
    const [logo, setLogo] = useState(brand && brand.logo ? undefined : null);
    const [lib, setLib] = useState(null);
    const [libPhoto, setLibPhoto] = useState(null);
    const gridRef = useRef();
    const size = useSize(gridRef);
    const small = size.w && size.w < 700;
    useEffect(() => {
      if (!brand || !brand.logo) { setLogo(null); return; }
      let live = true; setLogo(undefined);
      A.load(brand.logo).then((img) => { if (live) setLogo(img || null); }).catch(() => { if (live) setLogo(null); });
      return () => { live = false; };
    }, [brand]);
    useEffect(() => { L.index().then(setLib); }, []);
    // With a bundled library, every preview shows a real photo of the chosen trade.
    const pick = useMemo(() => {
      if (!lib) return null;
      const cat = trade ? TR.get(trade).photo : null;
      return lib.items.find((it) => !cat || it.cat === cat) || (cat ? null : lib.items[0]) || null;
    }, [trade, lib]);
    useEffect(() => {
      if (!pick) { setLibPhoto(null); return undefined; }
      let alive = true;
      // The small photo from the index shows at once; the full one replaces it.
      U.dataURLToBlob(pick.thumb).then(A.decode)
        .then((img) => { if (alive) setLibPhoto((cur) => (cur && cur.id === pick.id && cur.full ? cur : { id: pick.id, img })); })
        .catch(() => { if (alive) setLibPhoto((cur) => cur || { id: pick.id, img: null }); });
      L.fileFor(pick.id).then(A.decode)
        .then((img) => { if (alive) setLibPhoto({ id: pick.id, img, full: true }); })
        .catch(() => {});
      return () => { alive = false; };
    }, [pick]);
    const waiting = !lib || (!!pick && !libPhoto) || (useBrand && logo === undefined);
    const creating = !!busy && busy.startsWith('create:');
    const samples = useMemo(() => T.list.map((t) => {
      const p = M.newProject(t, { format, trades: trades.length ? trades : undefined });
      return useBrand ? applyBrand(p, brand) : p;
    }), [format, trades.join(), useBrand, brand]);
    const cols = size.w > 1100 ? 4 : size.w > 760 ? 3 : 2;
    const gap = small ? 12 : 24;
    const pad = small ? 8 : 12;
    const cardW = size.w ? Math.floor((size.w - (cols - 1) * gap) / cols) : 0;
    const images = useMemo(() => ({ logo: useBrand ? logo || null : null, photo: libPhoto ? libPhoto.img : null }), [useBrand, logo, libPhoto]);
    // a carousel style or a video recipe starts from the poster template that goes with it
    const templateFor = (recipeId) => T.list.find((t) => M.TEMPLATE_RECIPE[t.id] === recipeId) || T.list[0];
    // one trade for every carousel cover and video model (the chosen ones, else the first
    // template's), and the ad made from a card keeps the trade its cover showed
    const startTrades = trades.length ? trades : [T.list[0].trade];
    const startSamples = useMemo(() => (start === 'image' ? {} : Object.fromEntries(['ad', ...M.CAROUSEL_STYLE_IDS].map((id) => {
      const p = M.newProject(id === 'ad' ? T.list[0] : templateFor(id), { format, trades: startTrades });
      return [id, useBrand ? applyBrand(p, brand) : p];
    }))), [start, format, startTrades.join(), useBrand, brand]);
    const startWith = (e, t, extra) => {
      if (busy && !navAnim.on) return;
      markPoster(e.currentTarget.querySelector('canvas'));
      onCreate(t, format, useBrand ? brand : null, startTrades, pick && pick.id, extra);
    };
    const coverW = Math.max(60, Math.min(cardW - pad * 2 - 2, 300));
    const motionList = RS.motion.STYLES.filter((s) => !s.test);
    const TITLE = { image: 'Escolha um modelo', carousel: 'Escolha um carrossel', video: 'Escolha um vídeo' };
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onBack(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    return html`<div class="gallery screen">
      <header class="gal-top">
        <div class="gal-head">
          <button class="btn ghost" onClick=${onBack} disabled=${creating} aria-label="Voltar aos anúncios"><${Icon} name="chevron-left" /> <span class="hide-sm">Anúncios</span></button>
          <div class="gal-title">
            <h1>${TITLE[start]}</h1>
            <p>Escolha também a função: os textos chegam prontos e pode mudar tudo depois. As outras peças do anúncio ficam prontas a usar.</p>
          </div>
          <div class="spacer"></div>
          ${brand && html`<label class="switch"><input type="checkbox" checked=${useBrand} onChange=${(e) => setUseBrand(e.target.checked)} /><span class="switch-ui"></span> <span class="hide-sm">Usar a minha marca</span><span class="show-sm">Marca</span></label>`}
          ${brands.length > 1 && html`<select class="gallery-brand" aria-label="Marca para o novo anúncio" disabled=${!useBrand || creating} value=${brand?.id || ''} onChange=${(e) => setBrand(brands.find((b) => b.id === e.target.value))}>${brands.map((b) => html`<option key=${b.id} value=${b.id}>${b.label}</option>`)}</select>`}
          ${start === 'image' && html`<${FormatSwitch} value=${format} onChange=${setFormat} compact=${small} />`}
        </div>
        <div class="gal-start">
          <span class="gal-start-label" id="gal-start-label">Começar por</span>
          <div class="seg" role="radiogroup" aria-label="Começar por">
            ${[['image', 'Imagem', 'image'], ['carousel', 'Carrossel', 'layers'], ['video', 'Vídeo', 'video']].map(([v, l, icon]) => html`<button key=${v} type="button" role="radio"
              aria-checked=${start === v} class=${start === v ? 'on' : ''} disabled=${creating} onClick=${() => setStart(v)}><${Icon} name=${icon} size=${16} /> ${l}</button>`)}
          </div>
        </div>
        <${TradePicker} value=${trades} onChange=${setTrades} withTemplate />
      </header>
      <div class="gal-body" ref=${gridRef}>
      ${start === 'carousel' && html`<div class=${'gal-grid gal-styles stagger' + (creating ? ' is-busy' : '')} style=${`grid-template-columns:repeat(${cols},1fr);gap:${gap}px`}>
        ${['ad', ...M.CAROUSEL_STYLE_IDS].map((id, i) => {
          const t = id === 'ad' ? T.list[0] : templateFor(id);
          const mine = busy === `create:${id}`;
          return html`<button key=${id} class=${'tpl-card gal-style-card' + (mine ? ' busy' : '')} data-style=${id} style=${`--i:${i};padding:${pad}px`} aria-busy=${mine}
            onClick=${(e) => startWith(e, t, { piece: 'carousel', style: id })}>
            <span class="tpl-canvas gal-cover">${cardW > pad * 2 && startSamples[id] && html`<${StyleCover} project=${startSamples[id]} images=${images} style=${id} width=${coverW} />`}
              ${mine && html`<span class="busy-veil"><${Spinner} large /> A preparar o anúncio…</span>`}</span>
            <span class="tpl-meta"><strong>${styleName(id)}</strong><span>${id === 'ad' ? 'A capa é o cartaz do anúncio; os diapositivos seguem-no.' : RS.motion.styleOf(id).concept || ''}</span></span>
          </button>`;
        })}
      </div>`}
      ${start === 'video' && html`<div class=${'gal-videos' + (creating ? ' is-busy' : '')}>
        ${startSamples.ad && html`<${MotionPicker} project=${startSamples.ad} images=${images} value=${null} list=${motionList} label="Modelos de vídeo" cardWidth=${small ? 96 : 132} disabled=${creating}
          onChange=${(st) => { if (busy && !navAnim.on) return; onCreate(templateFor(st.id), format, useBrand ? brand : null, startTrades, pick && pick.id, { piece: 'video', motion: st.id }); }} />`}
      </div>`}
      ${start === 'image' && html`<div class=${'gal-grid stagger' + (creating ? ' is-busy' : '')} style=${`grid-template-columns:repeat(${cols},1fr);gap:${gap}px`}>
        ${T.list.map((t, i) => {
          const mine = busy === `create:${t.id}`;
          return html`<button key=${t.id} class=${'tpl-card' + (mine ? ' busy' : '')} style=${`--i:${i};padding:${pad}px`} aria-busy=${mine}
          onClick=${(e) => { if (busy && !navAnim.on) return; markPoster(e.currentTarget.querySelector('canvas')); onCreate(t, format, useBrand ? brand : null, trades.length ? trades : [t.trade], pick && pick.id); }}>
          <span class="tpl-canvas">${cardW > pad * 2 && html`<${PosterThumb} project=${samples[i]} format=${format} images=${images} pending=${waiting} width=${cardW - pad * 2 - 2} />`}
            ${mine && html`<span class="busy-veil"><${Spinner} large /> A preparar o anúncio…</span>`}</span>
          <span class="tpl-meta"><strong>${t.name}</strong><span>${t.description}</span></span>
          <span class="tpl-trade"><${Icon} name=${TR.get(trade || t.trade).icon} size=${14} /> ${tradesLabel(trades.length ? trades : [t.trade])}</span>
        </button>`;
        })}
      </div>`}
      </div>
    </div>`;
  }

  function FormatSwitch({ value, onChange, compact }) {
    return html`<div class="seg" role="radiogroup" aria-label="Formato">
      ${M.FORMAT_ORDER.map((id) => {
        const f = M.FORMATS[id];
        return html`<button key=${id} role="radio" aria-checked=${value === id} class=${value === id ? 'on' : ''}
          onClick=${() => onChange(id)} title=${`${f.label} · ${f.w} × ${f.h} · ${f.hint}`} aria-label=${`${f.label} ${f.w} por ${f.h}`}>
          <${Icon} name=${f.icon} size=${16} /> ${!compact && html`<span>${f.label}</span><small>${f.w}×${f.h}</small>`}
        </button>`;
      })}
    </div>`;
  }

  // ============================================================== editor
  // The rail: what the ad says (Oferta, Contactos, Fotos — shared by the three
  // pieces), how the piece on screen looks (Estilo) and how it unfolds
  // (Sequência: the carousel's slides, the video's length, texts and sound).
  const RAIL = [
    { id: 'oferta', label: 'Oferta', icon: 'type' },
    { id: 'contactos', label: 'Contactos', icon: 'phone' },
    { id: 'fotos', label: 'Fotos', icon: 'image' },
    { id: 'estilo', label: 'Estilo', icon: 'palette' },
    { id: 'sequencia', label: 'Sequência', icon: 'list', pieces: ['carousel', 'video'] },
  ];
  const railFor = (mode) => RAIL.filter((t) => !t.pieces || t.pieces.includes(mode));
  // a tapped slide text → its block in «Sequência» and the field to focus
  const carouselFocus = (key) => {
    const kind = key.split(':')[0];
    if (kind === 'x') return { block: key, field: `cx-${key.slice(2)}`, at: Date.now() };
    const block = { headline: 'H', kicker: 'H', intro: 'I', benefit: 'M', highlight: 'D', position: 'L', message: 'C', closing: 'F', contact: 'K' }[kind] || 'H';
    // a list item: its own row (vt-benefits-<id>, vt-highlights-<id>, vt-positions-<id>)
    const list = { benefit: 'benefits', highlight: 'highlights', position: 'positions' }[kind];
    const field = list ? `vt-${list}-${key.slice(kind.length + 1)}`
      : { headline: 'vt-headline', kicker: 'vt-kicker', intro: 'vt-intro', message: 'vt-message', closing: 'vt-closing' }[kind] || null;
    return { block, field, at: Date.now() };
  };
  const REGION_LABELS = {
    kicker: 'Chamada', headline: 'Título', intro: 'Introdução', positionsTitle: 'Título das vagas',
    badge: 'Selo', logo: 'Logótipo', photo: 'Fotografia · arraste para enquadrar', qr: 'Código QR',
    benefit: 'Vantagem', position: 'Vaga', contact: 'Contacto',
  };
  const regionLabel = (key) => REGION_LABELS[key] || REGION_LABELS[key.split(':')[0]] || '';
  const fieldId = (key) => 'f-' + key.replace(':', '-');

  function Editor({ initial, initialRevision = 0, initialPiece, brand, setBrand, onExit }) {
    const { fileSaving, saveFile: downloadProject } = useProjectFile();
    const [project, setProject] = useState(initial);
    const [tab, setTab] = useState('oferta');
    // Images preloaded before opening (App.open / create) are used straight away.
    const cached = (ref) => (ref && A.cache.get(ref.asset)) || null;
    const [images, setImages] = useState(() => ({ photo: cached(initial.photo), logo: cached(initial.logo) }));
    const [imgLoading, setImgLoading] = useState(false);
    const [imgBusy, setImgBusy] = useState(null); // 'photo' | 'logo' while a file is being prepared
    const imgBusyRef = useRef(null);
    const [leaving, setLeaving] = useState(false);
    const [saveState, setSaveState] = useState('saved');
    const [saveError, setSaveError] = useState('');
    const [conflict, setConflict] = useState(null), [resolvingConflict, setResolvingConflict] = useState(false);
    const session = useRef({ token: U.uid(), revision: initialRevision, ready: null, blocked: null, disposed: false, resolving: false });
    const [saves, setSaves] = useState(0); // each save draws its check again
    const [exportOpen, setExportOpen] = useState(false);
    const [reuseOpen, setReuseOpen] = useState(false), [productionOpen, setProductionOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [coverAt, setCoverAt] = useState(null);
    const [comparisonOpen, setComparisonOpen] = useState(false);
    const [organizationOpen, setOrganizationOpen] = useState(false);
    const [reviewLocale, setReviewLocale] = useState(null);
    const [meetOpen, setMeetOpen] = useState(false);
    const [guides, setGuides] = useState(true);
    const [report, setReport] = useState(null);
    const [lastField, setLastField] = useState(null); // the panel field last written in
    // the field being written when the letters shrank: the note stays under it while they stay smaller
    // (null: the cause was Estilo or the format, the note goes under the poster)
    const noteCause = useRef({ on: false, field: null });
    useEffect(() => { RS.appearance.setBar('surface'); }, []);
    // the phone's panel under the preview (2026-10-29): three stops — 'top' (writing, the
    // preview a strip), 'middle' (where it opens), 'bottom' (the preview at its largest);
    // a drag on its head follows the finger and snaps (RS.phone)
    const [sheet, setSheet] = useState('middle');
    const [stopsPx, setStopsPx] = useState(null);
    const sheetDrag = useRef(null), sheetPanel = useRef(null), sheetPreview = useRef(null), sheetProbe = useRef(null);
    const flipFrom = useRef(null), lastSheetY = useRef(null), settleTimer = useRef(0);
    const [settleTick, setSettleTick] = useState(0);
    const [panelWidth, setPanelWidth] = useState(() => { try { return U.clamp(Number(localStorage.getItem('rs-panel-width')) || 410, 300, 580); } catch { return 410; } });
    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
    const panelDrag = useRef(null);
    const panelMax = Math.min(580, Math.max(300, viewportWidth - 410));
    const shownPanelWidth = Math.min(panelWidth, panelMax);
    useEffect(() => { const resize = () => setViewportWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
    useEffect(() => { try { localStorage.setItem('rs-panel-width', String(panelWidth)); } catch {} }, [panelWidth]);
    const resizePanel = (value) => setPanelWidth(U.clamp(Math.round(value), 300, panelMax));
    const [mode, setMode] = useState(['image', 'carousel', 'video'].includes(initialPiece) ? initialPiece : 'image'); // the piece on screen
    const [vFormat, setVFormat] = useState('story'); // the format the «Vídeo» stage plays (Reels and Stories are 9:16)
    const mobile = useMedia('(max-width: 860px)');
    // the stops for this window: the status bar's height and the home indicator's room
    // come from a hidden probe sized with var(--safe-top) and the bottom inset
    useLayoutEffect(() => {
      if (!mobile) { setStopsPx(null); return undefined; }
      const measure = () => {
        const probe = sheetProbe.current;
        const head = document.querySelector('.editor .sheet-head');
        setStopsPx(RS.phone.stops(window.innerHeight, {
          safeTop: probe ? probe.offsetHeight : 0,
          barRoom: 104 + (probe ? probe.offsetWidth : 0),
          head: (head && head.offsetHeight) || 60,
        }));
      };
      measure();
      const vv = window.visualViewport;
      window.addEventListener('resize', measure);
      if (vv) vv.addEventListener('resize', measure);
      return () => { window.removeEventListener('resize', measure); if (vv) vv.removeEventListener('resize', measure); };
    }, [mobile]);
    const sheetY = mobile && stopsPx ? stopsPx[sheet] : null;
    // FLIP: the panel and the preview start where they were (the finger, or the last stop)
    // and glide to the new stop with transform only; Calmo jumps
    useLayoutEffect(() => {
      const panel = sheetPanel.current, pv = sheetPreview.current;
      const from = flipFrom.current != null ? flipFrom.current : lastSheetY.current;
      flipFrom.current = null;
      lastSheetY.current = sheetY;
      if (!panel || !pv || sheetY == null) return undefined;
      const clear = () => { panel.classList.remove('settling'); pv.classList.remove('settling'); panel.style.transform = ''; pv.style.transform = ''; };
      if (from == null || from === sheetY || document.documentElement.dataset.motion === 'calm') { clear(); return undefined; }
      panel.classList.remove('settling'); pv.classList.remove('settling');
      panel.style.transform = `translateY(${from - sheetY}px)`;
      pv.style.transformOrigin = '50% 0';
      pv.style.transform = `scale(${Math.max(0.05, from - 8) / Math.max(1, sheetY - 8)})`;
      void panel.offsetHeight; // the start position is laid out before the glide
      panel.classList.add('settling'); pv.classList.add('settling');
      panel.style.transform = ''; pv.style.transform = '';
      settleTimer.current = setTimeout(clear, 420);
      return () => clearTimeout(settleTimer.current);
    }, [sheetY, settleTick]);
    // the head follows the finger: transform only while it moves, a stop when it lets go
    const sheetDown = (e) => {
      if (sheetY == null || (e.target.closest && e.target.closest('.sheet-toggle')) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // a glide still running ends here: its last step must not undo this drag (deferred minor)
      clearTimeout(settleTimer.current);
      if (sheetPanel.current) sheetPanel.current.classList.remove('settling');
      if (sheetPreview.current) sheetPreview.current.classList.remove('settling');
      sheetDrag.current = { id: e.pointerId, startY: e.clientY, y0: sheetY, y: sheetY, t: performance.now(), v: 0, moved: false };
      if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ } }
    };
    const sheetMove = (e) => {
      const d = sheetDrag.current;
      if (!d || d.id !== e.pointerId || !stopsPx) return;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dy) < 4) return;
      if (!d.moved) { const ed = e.currentTarget.closest && e.currentTarget.closest('.editor'); if (ed) ed.classList.add('sheet-dragging'); }
      d.moved = true;
      const y = U.clamp(d.y0 + dy, stopsPx.top - 40, stopsPx.bottom + 40), now = performance.now();
      d.v = (y - d.y) / Math.max(1, now - d.t); d.t = now; d.y = y;
      const panel = sheetPanel.current, pv = sheetPreview.current;
      if (panel) { panel.classList.remove('settling'); panel.style.transform = `translateY(${y - d.y0}px)`; }
      if (pv) { pv.classList.remove('settling'); pv.style.transformOrigin = '50% 0'; pv.style.transform = `scale(${Math.max(0.05, y - 8) / Math.max(1, d.y0 - 8)})`; }
    };
    const sheetUp = (e) => {
      const d = sheetDrag.current;
      if (!d || d.id !== e.pointerId) return;
      sheetDrag.current = null;
      const ed = e.currentTarget.closest && e.currentTarget.closest('.editor');
      if (ed) ed.classList.remove('sheet-dragging');
      if (!d.moved) return;
      flipFrom.current = d.y;
      setSheet(RS.phone.snap(d.y, d.v, stopsPx));
      setSettleTick((n) => n + 1);
    };
    const hist = useRef({ past: [], future: [], lastKey: null, lastAt: 0 });
    const swapRef = useRef(null); // the next render's stage swap (RS.ui.stageSwap kind)
    const projRef = useRef(project);
    const imgRef = useRef(images);
    const saveTimer = useRef(null), saveQueue = useRef(Promise.resolve());
    const historyActive = useRef(false);
    historyActive.current = historyOpen;
    const checkpoint = useRef(true);
    projRef.current = project;
    imgRef.current = images;
    function blockConflict(err) {
      if (session.current.disposed) return;
      session.current.blocked = err; clearTimeout(saveTimer.current); setConflict(err); setSaveState('error'); setSaveError(err.message);
    }
    function ensureSession() {
      const s = session.current;
      if (!s.ready) s.ready = S.claimEditor(projRef.current.id, s.token, s.revision).then((rec) => {
        s.revision = rec.revision || 0; return rec;
      }).catch((err) => {
        s.ready = null;
        if (err.code === 'EDITOR_CONFLICT') blockConflict(err);
        else { setSaveState('error'); setSaveError(err.message); }
        return null;
      });
      return s.ready;
    }
    useEffect(() => {
      const s = session.current; s.disposed = false; ensureSession();
      const verify = async () => {
        if (s.blocked || s.resolving || historyActive.current || s.disposed) return;
        await saveQueue.current.catch(() => {}); await ensureSession();
        if (s.blocked || s.resolving || s.disposed) return;
        try { await S.claimEditor(projRef.current.id, s.token, s.revision); }
        catch (e) { if (e.reason === 'revision' && e.current?.editor?.id === s.token && e.current.revision === s.revision) return; if (e.code === 'EDITOR_CONFLICT') blockConflict(e); }
      };
      const stop = S.watchProjects((event) => { if (event.id === projRef.current.id && event.actor !== s.token) verify(); });
      const timer = setInterval(verify, 10000);
      window.addEventListener('focus', verify);
      return () => { s.disposed = true; stop(); clearInterval(timer); window.removeEventListener('focus', verify); const id = projRef.current.id; saveQueue.current.catch(() => {}).then(() => s.ready).then(() => S.releaseEditor(id, s.token)).catch(() => {}); };
    }, []);

    const photoId = project.photo && project.photo.asset;
    const logoId = project.logo && project.logo.asset;
    useEffect(() => {
      let alive = true;
      if ((photoId && !A.cache.has(photoId)) || (logoId && !A.cache.has(logoId))) setImgLoading(true);
      (async () => {
        const [photo, logo] = await Promise.all([A.load(photoId), A.load(logoId)]);
        if (alive) setImages({ photo, logo });
      })().catch((err) => console.error(err)).finally(() => { if (alive) setImgLoading(false); });
      return () => { alive = false; };
    }, [photoId, logoId]);

    const update = useCallback((fn, opts = {}) => {
      if (session.current.resolving) return;
      // «Balão»: how the poster moves to its new look (a colour rolls down; see RS.ui.stageSwap)
      if (opts.swap) swapRef.current = opts.swap;
      else if (typeof opts.coalesce === 'string' && opts.coalesce.startsWith('color:')) swapRef.current = 'roll';
      setProject((prev) => {
        const next = U.clone(prev);
        fn(next);
        // an image item deleted takes its video edit with it (nothing left to «Repor»)
        M.pruneVideoTexts(next);
        // an automatic name follows every change it is made of (trades, location, or the title of an ad without trades)
        M.applyAutoName(next);
        next.updatedAt = Date.now();
        const h = hist.current, now = Date.now();
        if (!(opts.coalesce && h.lastKey === opts.coalesce && now - h.lastAt < 1200)) {
          h.past.push(prev);
          if (h.past.length > 150) h.past.shift();
        }
        h.future = [];
        h.lastKey = opts.coalesce || null;
        h.lastAt = now;
        return next;
      });
    }, []);
    const undo = useCallback(() => {
      if (session.current.resolving) return;
      const h = hist.current;
      if (!h.past.length) return;
      swapRef.current = 'rewind';
      RS.ui.sayNear(document.querySelector('.editor button[aria-label^="Desfazer"]'), 'Desfeito');
      setProject((cur) => { h.future.push(cur); h.lastKey = null; return h.past.pop(); });
    }, []);
    const redo = useCallback(() => {
      if (session.current.resolving) return;
      const h = hist.current;
      if (!h.future.length) return;
      swapRef.current = 'rewind';
      RS.ui.sayNear(document.querySelector('.editor button[aria-label^="Refazer"]'), 'Refeito');
      setProject((cur) => { h.past.push(cur); h.lastKey = null; return h.future.pop(); });
    }, []);

    const persist = useCallback((manual = false) => {
      if (session.current.resolving) return Promise.reject(new Error('Aguarde a conclusão da escolha para voltar a guardar.'));
      clearTimeout(saveTimer.current);
      const p = projRef.current, imgs = imgRef.current;
      setSaveState('saving');
      const job = saveQueue.current.catch(() => {}).then(async () => {
        const s = session.current;
        if (s.blocked) throw s.blocked;
        if (!await ensureSession()) throw s.blocked || new Error('Não foi possível confirmar a edição nesta janela. Tente guardar novamente.');
        if (s.blocked) throw s.blocked;
        const thumb = makeThumb(p, imgs);
        const options = { checkpoint: checkpoint.current, editorId: s.token, expectedRevision: s.revision };
        const rec = manual ? await S.saveVersion(p, thumb, options) : await S.putProject(p, thumb, options);
        s.revision = rec.revision;
        // The first changed save in each editing session preserves its baseline.
        if (JSON.stringify(p) !== JSON.stringify(initial)) checkpoint.current = false;
        if (projRef.current === p) { setSaveState('saved'); setSaveError(''); setSaves((n) => n + 1); }
        return rec;
      });
      saveQueue.current = job;
      return job.catch((err) => { if (err.code === 'EDITOR_CONFLICT') blockConflict(err); else { setSaveState('error'); setSaveError(err.message || 'Não foi possível guardar.'); } throw err; });
    }, []);
    useEffect(() => {
      if (historyOpen || session.current.blocked) return undefined;
      setSaveState('saving');
      saveTimer.current = setTimeout(() => persist().catch((err) => { if (err.code !== 'EDITOR_CONFLICT') console.error(err); }), 700);
      return () => clearTimeout(saveTimer.current);
    }, [project, images, historyOpen]);
    useEffect(() => {
      const flush = () => { if (!historyActive.current && !session.current.blocked && !session.current.resolving) persist().catch((err) => { if (err.code !== 'EDITOR_CONFLICT') console.error(err); }); };
      const hide = () => { if (document.visibilityState === 'hidden') flush(); };
      document.addEventListener('visibilitychange', hide);
      window.addEventListener('pagehide', flush);
      RS.beforeReload = persist;
      return () => {
        document.removeEventListener('visibilitychange', hide);
        window.removeEventListener('pagehide', flush);
        if (RS.beforeReload === persist) delete RS.beforeReload;
      };
    }, []);
    async function openHistory() {
      try { await persist(); setExportOpen(false); setHistoryOpen(true); }
      catch (err) { toast('Não foi possível guardar as alterações. Tente de novo antes de restaurar uma versão.', { kind: 'error' }); }
    }
    async function restored(rec) {
      // Loading a version is already committed. Nothing from the old editor
      // queue may overwrite it, and its images must be decoded for the preview.
      clearTimeout(saveTimer.current);
      const p = M.normalize(rec.data);
      session.current.revision = rec.revision || 0;
      hist.current = { past: [], future: [], lastKey: null, lastAt: 0 };
      projRef.current = p;
      setProject(p);
      setSaveState('saved');
      checkpoint.current = true;
    }
    async function resolveConflict(action) {
      const s = session.current; if (s.resolving) return;
      s.resolving = true; setResolvingConflict(true); clearTimeout(saveTimer.current);
      try {
        await saveQueue.current.catch(() => {});
        const local = U.clone(projRef.current), remote = await S.getProject(local.id);
        if (action === 'copy') {
          const copy = U.clone(local); copy.id = U.uid(); copy.name = `${local.name} (cópia)`; copy.nameAuto = false;
          copy.createdAt = copy.updatedAt = Date.now(); copy.deletedAt = null; copy.organization = { ...M.cleanOrganization(copy.organization), status: 'draft', favorite: false }; copy.publication = M.cleanPublication();
          let rec = await S.putProject(copy, makeThumb(copy, imgRef.current));
          rec = await S.claimEditor(copy.id, s.token, rec.revision);
          await S.releaseEditor(local.id, s.token); s.blocked = null; s.ready = Promise.resolve(rec); setConflict(null); setSaveError('');
          await restored(rec); keepInHome(rec); toast('As alterações desta janela foram guardadas numa cópia.');
        } else if (action === 'reload') {
          if (!remote || remote.deletedAt) throw S.editorConflict(remote, remote ? 'deleted' : 'missing');
          if (!await confirmDialog({ title: 'Recarregar a versão guardada?', body: 'Os textos e ajustes desta janela serão substituídos. Para os conservar num anúncio separado, cancele e escolha Guardar como cópia.', confirm: 'Recarregar' })) return;
          const latest = await S.getProject(local.id); if (!latest || latest.deletedAt) throw S.editorConflict(latest, latest ? 'deleted' : 'missing');
          await restored(latest); s.blocked = null; s.ready = null; setConflict(null); setSaveError('');
          await ensureSession();
        } else {
          if (!remote || remote.deletedAt) throw S.editorConflict(remote, remote ? 'deleted' : 'missing');
          if (!await confirmDialog({ title: 'Continuar a edição nesta janela?', body: 'Esta janela passa a guardar as suas alterações. A versão atualmente guardada será conservada no histórico. A outra janela terá de recarregar ou guardar uma cópia.', confirm: 'Continuar nesta janela' })) return;
          const rec = await S.putProject(local, makeThumb(local, imgRef.current), { editorId: s.token, expectedRevision: remote.revision || 0, takeover: true, checkpoint: true, reason: 'Antes da mudança de janela' });
          s.blocked = null; s.ready = Promise.resolve(rec); setConflict(null); setSaveError(''); await restored(rec); keepInHome(rec);
        }
      } catch (e) { if (e.code === 'EDITOR_CONFLICT') blockConflict(e); else toast(e.message || 'Não foi possível resolver o conflito.', { kind: 'error' }); }
      finally { s.resolving = false; setResolvingConflict(false); }
    }

    async function exit() {
      if (leaving || session.current.resolving) return;
      RS.ui.flushExits(); // a row still leaving goes before the ad is saved
      setLeaving(true);
      await afterPaint();
      try {
        if (session.current.blocked) {
          if (!await confirmDialog({ title: 'Sair sem guardar esta edição?', body: 'As alterações desta janela serão descartadas. A versão guardada mantém-se. Para conservar esta edição, cancele e escolha Guardar como cópia ou Guardar ficheiro de segurança.', confirm: 'Sair sem guardar' })) { setLeaving(false); return; }
          const latest = await S.getProject(projRef.current.id);
          if (latest) keepInHome(latest);
        } else keepInHome(await persist());
      }
      catch (err) { setLeaving(false); toast('Não foi possível guardar. O anúncio continua aberto; tente de novo ou guarde um ficheiro.', { kind: 'error' }); return; }
      if ((await onExit(projRef.current.id)) === false) setLeaving(false);
    }

    useEffect(() => {
      const onKey = (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (k === 's') { e.preventDefault(); persist().then(() => toast(S.isPersistent() ? 'Anúncio guardado neste aparelho.' : 'O anúncio está apenas nesta sessão. Guarde um ficheiro para o conservar.')).catch((err) => toast(err.message, { kind: 'error' })); }
        else if (k === 'e') { e.preventDefault(); setExportOpen(true); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    const focusField = useCallback((key) => {
      // the photo and the logo live in «Fotos»; the WhatsApp button, the other contacts and the QR in «Contactos»
      setTab(key === 'photo' || key === 'logo' ? 'fotos' : key === 'qr' || key.split(':')[0] === 'contact' ? 'contactos' : 'oferta');
      const go = (tries) => {
        const el = document.getElementById(fieldId(key));
        if (!el) { if (tries > 0) requestAnimationFrame(() => go(tries - 1)); return; }
        // a folded block opens first, then the field is shown
        if (el.closest('.group.folded')) { RS.ui.openField(el.id); if (tries > 0) requestAnimationFrame(() => go(tries - 1)); return; }
        el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        el.focus({ preventScroll: true });
        if (el.select) el.select();
        const row = el.closest('.field, .li') || el;
        row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
      };
      requestAnimationFrame(() => go(8));
    }, []);

    // Upright photos: faces sit in the top third, so the default framing is higher.
    const setPhotoAsset = useCallback((assetId, w, h) => {
      update((p) => { p.photo = { asset: assetId, zoom: 1, fx: 0.5, fy: w && h > w * 1.3 ? 0.36 : 0.5, flip: false, adj: { ...M.DEFAULT_FX } }; });
    }, []);
    // One image at a time: a second click while one is being prepared is ignored.
    const withImgBusy = async (kind, fn) => {
      if (imgBusyRef.current) return;
      imgBusyRef.current = kind;
      setImgBusy(kind);
      try {
        await afterPaint();
        await fn();
      } catch (err) {
        toast(err.message, { kind: 'error' });
      } finally {
        imgBusyRef.current = null;
        setImgBusy(null);
      }
    };
    const choosePhoto = useCallback(async (file) => {
      if (imgBusyRef.current) return;
      const f = file || await U.pickFile('image/*');
      if (!f) return;
      if (f.then) f.catch(() => {}); // handled below; avoids an "uncaught" warning meanwhile
      await withImgBusy('photo', async () => {
        // `f` may be a promise: a library photo still loading shows the busy state too.
        const a = await A.importFile(await f, 'photo');
        setPhotoAsset(a.id, a.w, a.h);
        toast('Fotografia aplicada. Arraste-a no anúncio para a enquadrar.');
      });
    }, []);
    const chooseLogo = useCallback(async (file) => {
      if (imgBusyRef.current) return;
      const f = file || await U.pickFile('image/*');
      if (!f) return;
      await withImgBusy('logo', async () => {
        const a = await A.importFile(f, 'logo');
        update((p) => { p.logo = { asset: a.id }; p.show.logo = true; });
        toast('Logótipo adicionado');
      });
    }, []);

    const saveFile = () => downloadProject(projRef.current);

    const panelProps = { project, update, images, brand, setBrand, choosePhoto, chooseLogo, setPhotoAsset, imgBusy, onReuse: () => setReuseOpen(true) };
    const stageBusy = imgBusy === 'photo' ? 'A preparar a fotografia…' : imgBusy === 'logo' ? 'A preparar o logótipo…' : imgLoading ? 'A carregar as imagens…' : null;
    // «Vídeo»: the video of the ad, prepared once for the panel and the stage.
    const video = mode === 'video';
    // the phone's video player: the floating top shows and hides with its buttons
    // (chromeOn), and ⛶ fills the screen, still vertical (playerFull: a history entry,
    // so the phone's back gesture leaves it; Escape too)
    const [chromeOn, setChromeOn] = useState(true);
    const [playerFull, setPlayerFull] = useState(false);
    const setFull = (on) => {
      if (on) { try { history.pushState({ rsPlayerFull: true }, ''); } catch { /* no history here */ } setPlayerFull(true); return; }
      setPlayerFull(false);
      if (history.state && history.state.rsPlayerFull) history.back();
    };
    useEffect(() => {
      if (!playerFull) return undefined;
      const pop = () => setPlayerFull(false);
      const key = (e) => { if (e.key === 'Escape') setFull(false); };
      window.addEventListener('popstate', pop);
      window.addEventListener('keydown', key);
      return () => { window.removeEventListener('popstate', pop); window.removeEventListener('keydown', key); };
    }, [playerFull]);
    // leaving the video (or the phone width) in full screen also takes its history entry back,
    // and so does closing the editor (deferred minor, 2026-10-30)
    useEffect(() => { if (!video || !mobile) { if (playerFull) setFull(false); setChromeOn(true); } }, [video, mobile]);
    useEffect(() => () => { if (history.state && history.state.rsPlayerFull) history.back(); }, []);
    const vPhotos = useVideoPhotos(project, images, video);
    // prepared again only when something the video shows changes (not the ad's name)
    const vKey = videoKey(project);
    // Prepared in the next task, not while the tap is answered: a video takes half a
    // second to prepare (two on a phone), so «Vídeo» shows its panel at once; the
    // stage keeps the last video until the new one is ready (no flash, no wait per key).
    const [vPrep, setVPrep] = useState(null); // { P, and what it was prepared from }
    useEffect(() => {
      if (!video) return undefined;
      const from = { vKey, vFormat, images, vPhotos };
      // after the panel has been painted (a timer alone could run before the frame and hide it)
      let live = true;
      afterPaint().then(() => { if (live) setVPrep({ ...from, P: RS.motion.prepare(project, { format: vFormat, locale: project.locale, images, photos: vPhotos || NO_PHOTOS }) }); });
      return () => { live = false; };
    }, [video, vKey, vFormat, images, vPhotos]);
    const vP = vPrep && vPrep.P;
    // the export may show the stage's video only if the ad has not changed since (an edit in «Imagem» does not prepare it)
    const vFresh = !imgLoading && vPhotos && vPrep && vPrep.vKey === vKey && vPrep.vFormat === vFormat && vPrep.images === images && vPrep.vPhotos === vPhotos ? vPrep.P : null;
    // «Definições» (in ⋯): the settings sheet, over the editor
    const [settingsOpen, setSettingsOpen] = useState(false);
    // a piece and a section are independent: «Oferta» and «Contactos» never change the piece
    // «Balão» (Ilustrativo): the image becomes a carousel by dealing its slides; back, they gather
    const [pieceMove, setPieceMove] = useState(null);
    const changeMode = (m) => { setPieceMove(RS.ui.illustrative() && m !== mode && (mode === 'image' || m === 'image') ? { from: mode, to: m } : null); setMode(m); };
    // a section chosen while the panel sits at the bottom brings it up to the middle
    const goTab = (id) => { setTab(id); if (sheet === 'bottom') setSheet('middle'); };
    // «Carrossel»: the carousel of the ad, prepared after the frame
    const carouselOn = mode === 'carousel';
    const cP = useCarousel(project, images, carouselOn);
    // a tap on a slide text opens its block in «Sequência» at that field
    const [cFocus, setCFocus] = useState(null);
    // «Imagem» has no «Sequência»
    useEffect(() => { if (mode === 'image' && tab === 'sequencia') setTab('oferta'); }, [mode]);
    const review = () => setReviewLocale(project.locale);
    const resolveCheck = (check) => {
      setExportOpen(false);
      if (check.review) { setReviewLocale(check.locale); return; }
      update((p) => { if (check.locale) p.locale = check.locale; if (check.format && !check.videoTab) p.format = check.format; }, { coalesce: 'check-navigation' });
      if (check.videoTab) {
        // the video's length, texts and ending are in «Sequência», its model and colours in «Estilo»
        changeMode('video'); setTab(check.videoTab === 'aspeto' ? 'estilo' : 'sequencia'); if (check.format) setVFormat(check.format);
        const reveal = (tries) => {
          const id = check.videoTab === 'modelo' ? 'video-duration' : check.field === 'headline' ? 'vt-headline' : 'vt-block-contacts';
          const el = document.getElementById(id);
          if (!el) { if (tries) requestAnimationFrame(() => reveal(tries - 1)); return; }
          RS.ui.openField(id);
          el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
          const control = el.matches('input, textarea') ? el : el.querySelector('input, button[role="radio"], .add-row');
          if (control) control.focus({ preventScroll: true });
        };
        requestAnimationFrame(() => reveal(8));
      }
      else { changeMode('image'); focusField(check.field || 'headline'); }
    };
    // ⋯: the ad's file and history, the QR, its organisation, what waits for a review, models and settings
    const pendingReview = project.locales.length > 1 ? project.locales.flatMap((code) => RS.workflow.reviewRows(project, code)).filter((r) => r.status !== 'reviewed').length : 0;
    const staleCaptions = project.locales.filter((l) => ['stale', 'unverified'].includes(M.captionStatus(project, l)));
    const menuItems = [
      mode === 'image' && { label: 'Comparar formatos', icon: 'scaling', title: 'A mesma língua nos três formatos', onClick: () => setComparisonOpen(true) },
      { label: fileSaving ? 'A preparar projeto…' : 'Guardar ficheiro', icon: 'save', disabled: fileSaving, title: 'Guardar uma cópia do projeto num ficheiro (.anuncio)', onClick: saveFile },
      { label: 'Histórico de versões', icon: 'clock', onClick: openHistory },
      { label: 'Mostrar QR', icon: 'qr-code', title: 'O seu WhatsApp para mostrar cara a cara', onClick: () => setMeetOpen(true) },
      { label: 'Organizar', icon: 'folder-open', onClick: () => setOrganizationOpen(true) },
      project.locales.length > 1 && { label: `Rever traduções${pendingReview ? ` (${pendingReview})` : ''}`, icon: 'languages', count: pendingReview, onClick: review },
      ...staleCaptions.map((l) => ({ key: `caption-${l}`, label: `Rever publicação · ${M.localeInfo(l).short}`, icon: 'triangle-alert', count: 1, cls: 'caption-reminder',
        onClick: () => { update((p) => { p.locale = l; }); setExportOpen(true); } })),
      { label: 'Marcas e modelos', icon: 'copy', onClick: () => setReuseOpen(true) },
      { label: 'Definições', icon: 'settings', title: 'Movimento, tema e vibração', onClick: () => setSettingsOpen(true) },
    ].filter(Boolean);
    // the top bar: ‹ · name · [piece · language · ↶ ↷] · ⋯ · Exportar (on a phone the
    // bracketed group is a second row: .tb-row)
    const sectionInfo = railFor(mode).find((t) => t.id === tab) || RAIL[0];
    const videoSection = video && ['fotos', 'estilo', 'sequencia'].includes(tab);
    // a note goes under its field while that field is on screen, else under the poster
    const shrinking = !!noteFor(report, null);
    if (shrinking !== noteCause.current.on) noteCause.current = { on: shrinking, field: shrinking ? lastField : null };
    const note = noteFor(report, noteCause.current.field);
    if (note && note.field && ![...document.querySelectorAll('[data-note-host]')].some((el) => el.dataset.noteHost === note.field)) note.field = null;
    const langs = html`<${LocaleSwitcher} project=${project} update=${update} />`;
    const undoRedo = html`<button class="icon-btn" onClick=${undo} disabled=${!hist.current.past.length} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)"><${Icon} name="undo-2" /></button>
      <button class="icon-btn" onClick=${redo} disabled=${!hist.current.future.length} aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)"><${Icon} name="redo-2" /></button>`;
    // on a phone the ⋯ sits by the poster with undo and redo, and also enlarges it
    const stageMenu = [menuItems[0] && menuItems[0].label === 'Comparar formatos' ? menuItems[0] : null,
      mode === 'image' && project.format === 'story' ? { label: guides ? 'Esconder zonas do Instagram' : 'Mostrar zonas do Instagram', icon: 'smartphone', onClick: () => setGuides(!guides) } : null,
      ...menuItems.filter((it) => it.label !== 'Comparar formatos')].filter(Boolean);
    // the save signal: a dot (and the two ticks) with its words; on a phone (2026-10-29: no
    // bar on top) the dot stays beside ‹ and the words go into the ⋯ with the ad's name
    const saveWords = saveState === 'saving' ? 'A guardar…' : saveState === 'error' ? 'Não foi possível guardar' : S.isPersistent() ? 'Guardado' : 'Só nesta sessão';
    const saveTicks = saveState === 'saved' && saves > 0 && S.isPersistent() && html`<svg key=${saves} class="save-ticks" viewBox="0 0 26 16" aria-hidden="true" focusable="false"><path class="k1" d="M2 9l4 4 8-10" pathLength="100" /><path class="k2" d="M11 12l1 1 8-10" pathLength="100" /></svg>`;
    const saveSignal = html`<span class=${'save-state ' + saveState} role="status" aria-live="polite" aria-atomic="true"><span class="save-dot" aria-hidden="true"></span>${saveTicks}<span class="save-words">${saveWords}</span></span>`;
    const nameHead = html`<label class="menu-name"><span>Nome do anúncio</span>
      <textarea class="name-input" name="project-name" rows="2" value=${project.name} aria-label="Nome do anúncio (só para si, não aparece na imagem)"
        onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        onInput=${(e) => { const v = e.target.value.replace(/[\r\n]+/g, ' '); update((p) => { p.name = v; p.nameAuto = false; }, { coalesce: 'name' }); }} /></label>
      <span class=${'menu-save ' + saveState} aria-hidden="true">${saveWords}</span>`;
    const stageTools = mobile ? html`${undoRedo}<${MoreMenu} items=${stageMenu} where="editor" head=${nameHead} />` : null;
    const SHEET_LABEL = { bottom: 'Painel em baixo. Subir.', middle: 'Painel a meio. Subir.', top: 'Painel em cima. Baixar.' };
    return html`<div class=${'editor screen' + (video ? ' video-mode' : '') + (mobile ? ` sheet-${sheet}` : '') + (mobile && video && !chromeOn ? ' chrome-off' : '') + (mobile && video && playerFull ? ' player-full' : '')}
      style=${{ '--editor-panel-width': `${shownPanelWidth}px`, ...(sheetY != null ? { '--sheet-y': `${sheetY}px` } : {}) }}>
      ${mobile && html`<i class="safe-probe" ref=${sheetProbe} aria-hidden="true"></i>`}
      <header class=${'topbar' + (saveError || !S.isPersistent() ? ' has-save-warning' : '')}>
        <div class="tb-left">
        <button class="btn ghost tb-back" onClick=${exit} disabled=${leaving} aria-busy=${leaving} aria-label=${leaving ? 'A guardar e a voltar aos anúncios' : 'Voltar aos anúncios'}>
          ${leaving ? html`<${Spinner} />` : html`<${Icon} name="chevron-left" />`}</button>
        ${mobile ? saveSignal : html`<div class="name-wrap">
          <input class="name-input" name="project-name" value=${project.name} aria-label="Nome do anúncio (só para si, não aparece na imagem)"
            title="Nome do anúncio (só para si, não aparece na imagem)"
            onInput=${(e) => update((p) => { p.name = e.target.value; p.nameAuto = false; }, { coalesce: 'name' })} />
          ${saveSignal}
        </div>`}
        </div>
        <div class="tb-center">
          <${PieceSwitch} mode=${mode} onChange=${changeMode} />
        </div>
        <div class="tb-right">
          ${!mobile && undoRedo}
          ${!mobile && html`<${MoreMenu} items=${menuItems} where="editor" />`}
          <button class="btn primary" onClick=${() => setExportOpen(true)} title="Exportar (Ctrl+E)" aria-label="Exportar"><${Icon} name="download" /> <span>Exportar</span></button>
        </div>
        ${!conflict && (saveError || !S.isPersistent()) && html`<div class="save-recovery" role="alert">
          <span>${!S.isPersistent() ? 'Este navegador está a guardar apenas nesta sessão. Guarde um ficheiro antes de fechar.' : 'As alterações ainda não estão guardadas. ' + saveError}</span>
          ${S.isPersistent() && html`<button class="btn ghost sm" disabled=${saveState === 'saving'} onClick=${() => persist().catch(() => {})}>Tentar guardar novamente</button>`}
          <button class="btn ghost sm" disabled=${fileSaving} onClick=${saveFile}>Guardar ficheiro de segurança</button>
        </div>`}
        ${conflict && html`<div class="editor-conflict" role="alert"><strong>Gravação suspensa</strong><span>${conflict.message} As alterações desta janela continuam aqui.</span>
          ${conflict.current && html`<small>Guardado: ${conflict.current.name} · ${new Date(conflict.current.savedAt || conflict.current.updatedAt).toLocaleString('pt-PT')}</small>`}
          <div class="row-btns"><button class="btn ghost sm" disabled=${resolvingConflict || !conflict.current || !!conflict.current.deletedAt} onClick=${() => resolveConflict('reload')}>Recarregar guardada</button><button class="btn primary sm" disabled=${resolvingConflict} onClick=${() => resolveConflict('copy')}>Guardar como cópia</button><button class="btn ghost sm" disabled=${resolvingConflict || !conflict.current || !!conflict.current.deletedAt} onClick=${() => resolveConflict('takeover')}>Continuar nesta janela</button><button class="btn ghost sm" disabled=${fileSaving} onClick=${saveFile}>Guardar ficheiro de segurança</button></div>
        </div>`}
      </header>
      <${NoteContext.Provider} value=${note}>
      <div class="editor-body" inert=${resolvingConflict ? '' : undefined}>
        <nav class="rail" role="tablist" aria-label="Secções do editor">
          ${railFor(mode).map((t) => html`<button key=${t.id} role="tab" aria-selected=${sectionInfo.id === t.id} class=${sectionInfo.id === t.id ? 'on' : ''} onClick=${() => goTab(t.id)}>
            <${Icon} name=${t.icon} size=${20} /><span>${t.label}</span>
          </button>`)}
        </nav>
        <aside id="editor-panel" key=${`${mode}:${sectionInfo.id}`} ref=${sheetPanel} class=${'panel' + (videoSection ? ' video-panel' : '')} role="tabpanel" aria-label=${sectionInfo.label}
          onInput=${(e) => setLastField(sectionInfo.id === 'estilo' || !e.target || !e.target.id ? null : e.target.id)}
          onClick=${(e) => { if (sectionInfo.id === 'estilo' && e.target.closest && e.target.closest('button')) setLastField(null); }}
          onfocusin=${(e) => { if (mobile && e.target && e.target.matches && e.target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="file"]), textarea')) setSheet('top'); }}>
          ${mobile && html`<div class="sheet-head" onPointerDown=${sheetDown} onPointerMove=${sheetMove} onPointerUp=${sheetUp} onPointerCancel=${sheetUp}>
            <span class="sheet-grip" aria-hidden="true"></span>
            <h2>${sectionInfo.label}</h2>
            <button type="button" class=${'icon-btn sheet-toggle' + (sheet === 'top' ? '' : ' up')} aria-label=${SHEET_LABEL[sheet]} title=${SHEET_LABEL[sheet]} aria-controls="editor-preview"
              onClick=${() => setSheet(RS.phone.next(sheet))}><${Icon} name="chevron-down" /></button>
          </div>`}
          ${sectionInfo.id === 'oferta' && html`<${TextPanel} ...${panelProps} />`}
          ${sectionInfo.id === 'contactos' && html`<${ContactsPanel} ...${panelProps} />`}
          ${videoSection ? html`<${VideoPanel} project=${project} update=${update} images=${images} photos=${vPhotos} P=${vP} vKey=${vKey}
            section=${sectionInfo.id} onSection=${goTab} onEditImage=${() => { changeMode('image'); setTab('oferta'); }} />`
          : carouselOn ? html`
            ${sectionInfo.id === 'fotos' && html`<${CarouselPhotosPanel} project=${project} update=${update} images=${images} onStyle=${() => setTab('estilo')} />`}
            ${sectionInfo.id === 'estilo' && html`<${CarouselStylePanel} project=${project} update=${update} images=${images} hasPhotos=${!!(project.photo && project.photo.asset)} />`}
            ${sectionInfo.id === 'sequencia' && html`<${CarouselSequencePanel} project=${project} update=${update} focus=${cFocus} />`}`
          : html`
            ${sectionInfo.id === 'fotos' && html`<${ImagesPanel} ...${panelProps} />`}
            ${sectionInfo.id === 'estilo' && html`<${LookPanel} ...${panelProps} />`}`}
        </aside>
        ${!mobile && html`<div class="panel-divider" role="separator" tabIndex="0" aria-orientation="vertical" aria-label="Largura do painel de edição" aria-controls="editor-panel" aria-valuemin="300" aria-valuemax=${panelMax} aria-valuenow=${shownPanelWidth} aria-valuetext=${`${shownPanelWidth} píxeis`} title="Arraste ou use as setas para ajustar. Duplo clique para repor."
          onPointerDown=${(e) => { if (e.button !== 0) return; panelDrag.current = { x: e.clientX, width: shownPanelWidth, id: e.pointerId }; e.currentTarget.setPointerCapture?.(e.pointerId); e.currentTarget.focus(); e.preventDefault(); }}
          onPointerMove=${(e) => { const d = panelDrag.current; if (d && d.id === e.pointerId) resizePanel(d.width + e.clientX - d.x); }}
          onPointerUp=${() => { panelDrag.current = null; }} onPointerCancel=${() => { panelDrag.current = null; }}
          onDblClick=${() => resizePanel(410)} onKeyDown=${(e) => { const next = { ArrowLeft: shownPanelWidth - (e.shiftKey ? 10 : 20), ArrowRight: shownPanelWidth + (e.shiftKey ? 10 : 20), Home: 300, End: panelMax }[e.key]; if (next != null) { e.preventDefault(); resizePanel(next); } }}></div>`}
        <div class="preview-shell">
          <div id="editor-preview" class="preview-content" ref=${sheetPreview}>
        ${(carouselOn ? html`<${CarouselStage} project=${project} update=${update} P=${cP} mobile=${mobile} deal=${!!pieceMove && pieceMove.from === 'image' && pieceMove.to === 'carousel'} topRight=${langs} tools=${stageTools} onField=${(key) => { setTab('sequencia'); setCFocus(carouselFocus(key)); }} />`
        : video ? html`<${VideoStage} P=${vP} project=${project} format=${vFormat} setFormat=${setVFormat} mobile=${mobile} topRight=${langs} tools=${stageTools} quiet=${exportOpen || productionOpen || reuseOpen || coverAt !== null} onCover=${setCoverAt} coverReady=${!!vFresh} onControls=${setChromeOn} full=${playerFull} setFull=${setFull} />`
        : html`<${Workspace} project=${project} images=${images} update=${update} onSelect=${focusField}
          guides=${guides} setGuides=${setGuides} report=${report} onReport=${setReport} busy=${stageBusy} note=${note} topRight=${langs} tools=${stageTools} swapRef=${swapRef} gather=${!!pieceMove && pieceMove.from === 'carousel' && pieceMove.to === 'image'} onCause=${() => setLastField(null)}
          choosePhoto=${choosePhoto} chooseLogo=${chooseLogo} mobile=${mobile}
          onConvert=${() => changeMode('video')} onCompare=${() => setComparisonOpen(true)} />`)}
          </div>
        </div>
      </div>
      <//>
      ${historyOpen && html`<${RecoveryDialog} projectId=${project.id} onClose=${() => setHistoryOpen(false)} onRestore=${restored} onSnapshot=${() => persist(true)} editorOptions=${() => ({ editorId: session.current.token, expectedRevision: session.current.revision })} />`}
      ${organizationOpen && html`<${OrganizationDialog} project=${project} onClose=${() => setOrganizationOpen(false)} onSave=${(o) => update((p) => { p.organization = o; M.applyAutoName(p); })} />`}
      ${reviewLocale && html`<${TranslationDialog} project=${project} update=${update} initialLocale=${reviewLocale} onClose=${() => setReviewLocale(null)} onEditVideo=${(code) => { setReviewLocale(null); resolveCheck({ locale: code, videoTab: 'textos' }); }} />`}
      ${reuseOpen && html`<${ReuseDialog} project=${project} images=${images} update=${update} onChange=${setBrand} onClose=${() => setReuseOpen(false)} />`}
      ${productionOpen && html`<${ProductionDialog} project=${project} update=${update} images=${images} onClose=${() => setProductionOpen(false)} />`}
      ${coverAt !== null && html`<${VideoCoverDialog} project=${project} update=${update} images=${images} prepared=${vFresh} initialTime=${coverAt} onClose=${() => setCoverAt(null)} />`}
      ${comparisonOpen && html`<${FormatComparison} project=${project} images=${images} update=${update} onClose=${() => setComparisonOpen(false)} onEdit=${(format) => { update((p) => { p.format = format; }); setComparisonOpen(false); focusField('photo'); }} />`}
      ${exportOpen && html`<${ExportDialog} project=${project} update=${update} images=${images} saveFile=${saveFile} fileSaving=${fileSaving} mobile=${mobile} onHistory=${openHistory} onResolve=${resolveCheck} onProduction=${() => { setExportOpen(false); setProductionOpen(true); }}
        piece=${mode} videoFormat=${vFormat} prepared=${vFresh} onClose=${(to) => { setExportOpen(false); if (to === 'video') changeMode('video'); }} />`}
      ${meetOpen && html`<${MeetQR} whatsapp=${project.whatsapp} keptIn="neste anúncio" onClose=${() => setMeetOpen(false)}
        onNumber=${(w) => update((p) => { p.whatsapp = w; })} />`}
      ${settingsOpen && html`<${SettingsSheet} onClose=${() => setSettingsOpen(false)} />`}
    </div>`;
  }

  // ⋯ of a top bar (the editor's, the home's): items { label, icon, onClick, count?,
  // cls?, title?, disabled? }; the button shows the sum of the counts (what waits
  // for a review). where: 'editor' | 'home' (its classes: .<where>-more, .<where>-menu).
  // head: what sits above the items (on a phone the editor's ⋯ starts with the ad's name)
  function MoreMenu({ items, where, head = null }) {
    const [open, setOpen] = useState(false);
    const pop = RS.ui.useLeaving(open, 140);
    const ref = useRef();
    const total = items.reduce((n, it) => n + (it.count || 0), 0);
    useEffect(() => {
      if (!open) return undefined;
      const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('pointerdown', onDoc);
      const first = ref.current && ref.current.querySelector('.more-menu [role="menuitem"]:not(:disabled)');
      if (first && window.matchMedia('(hover: hover)').matches) first.focus();
      return () => document.removeEventListener('pointerdown', onDoc);
    }, [open]);
    // ↑ ↓ Home End move between the items; Escape closes and gives the focus back to ⋯
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); const b = ref.current && ref.current.querySelector('.more-btn'); if (b) b.focus(); return; }
      if (e.target && e.target.matches && e.target.matches('input, textarea')) return; // the arrows move inside a field being written
      const all = [...ref.current.querySelectorAll('.more-menu [role="menuitem"]:not(:disabled)')];
      const i = all.indexOf(document.activeElement);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (to === undefined || !all.length) return;
      e.preventDefault();
      all[(to + all.length) % all.length].focus();
    };
    const label = total ? `Mais opções (${total} por rever)` : 'Mais opções';
    return html`<div class=${`more-wrap ${where}-more-wrap`} ref=${ref} onKeyDown=${onKey}>
      <button class=${`icon-btn more-btn ${where}-more`} aria-haspopup="menu" aria-expanded=${open} aria-label=${label} title=${label} onClick=${() => setOpen(!open)}>
        <${Icon} name="ellipsis" />${total > 0 && html`<span class="more-count" aria-hidden="true">${total}</span>`}</button>
      ${pop.mounted && html`<div class=${`menu right pop more-menu ${where}-menu` + (pop.leaving ? ' leaving' : '')} role="menu" aria-label="Mais opções">
        ${head && html`<div class="menu-head" role="presentation">${head}</div>`}
        ${items.map((it) => html`<button key=${it.key || it.label} role="menuitem" class=${it.cls || ''} disabled=${it.disabled} title=${it.title || ''}
          onClick=${() => {
            // the focus goes back to ⋯ first: a sheet the item opens returns it there when it closes
            setOpen(false); const b = ref.current && ref.current.querySelector('.more-btn'); if (b) b.focus(); it.onClick();
          }}><${Icon} name=${it.icon} /> ${it.label}</button>`)}
      </div>`}
    </div>`;
  }

  // ---------------------------------------------------------------- languages
  function LocaleSwitcher({ project, update }) {
    const [open, setOpen] = useState(false);
    const pop = RS.ui.useLeaving(open, 140);
    const ref = useRef();
    useEffect(() => {
      if (!open) return undefined;
      const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('pointerdown', onDoc);
      return () => document.removeEventListener('pointerdown', onDoc);
    }, [open]);
    const missing = M.LOCALES.filter((l) => !project.locales.includes(l.code));
    async function removeLocale(code) {
      const ok = await confirmDialog({
        title: `Remover ${M.localeInfo(code).label}?`,
        body: 'Os textos desta língua são apagados deste anúncio. Pode desfazer com Ctrl+Z.',
        confirm: 'Remover língua', danger: true,
      });
      if (ok) update((p) => { Object.assign(p, M.removeLocale(p, code)); });
    }
    return html`<div class="locales" ref=${ref}>
      <span class="locales-label">Língua</span>
      <div class="locales-chips">
        ${project.locales.map((code) => {
          const l = M.localeInfo(code);
          const on = code === project.locale;
          // a language with translations to review is marked (⋯ › «Rever traduções»)
          const toReview = project.locales.length > 1 && RS.workflow.reviewRows(project, code).some((r) => r.status !== 'reviewed');
          return html`<span key=${code} data-code=${code} class=${'chip' + (on ? ' on' : '')}>
            <button class="chip-main" aria-pressed=${on} title=${`Editar em ${l.label}${toReview ? ' · traduções por rever' : ''}`} onClick=${() => update((p) => { p.locale = code; }, { coalesce: 'locale' })}>${l.short}${toReview && html`<span class="chip-dot"><span class="sr-only"> (traduções por rever)</span></span>`}</button>
            ${project.locales.length > 1 && on && html`<button class="chip-x" aria-label=${`Remover ${l.label}`} onClick=${() => removeLocale(code)}><${Icon} name="x" size=${12} stroke=${2.6} /></button>`}
          </span>`;
        })}
      </div>
      ${missing.length > 0 && html`<button class="chip add" aria-label="Adicionar língua" aria-expanded=${open} onClick=${() => setOpen(!open)}><${Icon} name="plus" size=${14} stroke=${2.4} /></button>`}
      ${pop.mounted && html`<div class=${'menu right pop' + (pop.leaving ? ' leaving' : '')} role="menu">
        <p class="menu-note">Os textos são traduzidos quando ainda são os textos prontos; o resto é copiado para traduzir.</p>
        ${missing.map((l) => html`<button key=${l.code} role="menuitem" onClick=${() => {
          setOpen(false);
          update((p) => { Object.assign(p, M.addLocale(p, l.code, p.locale)); }, { swap: 'type' });
          RS.ui.greet(document.querySelector('.editor .locales .chip.add'), l.code);
          toast(`${l.label} adicionado. Confira e traduza os textos à esquerda.`);
        }}><span class="menu-code">${l.short}</span> ${l.label}</button>`)}
      </div>`}
    </div>`;
  }

  // ---------------------------------------------------------------- form building blocks
  // where: what the eye shows or hides the block in («anúncio» or «vídeo»).
  // Blocks fold (accordions); which ones are folded is kept on this device
  // ('rs-groups': { block: open }). A block is open unless it says `closed`.
  const FOLD_KEY = 'rs-groups';
  const folds = (() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch { saved = {}; }
    const subs = new Set();
    return {
      open: (k, dflt) => (typeof saved[k] === 'boolean' ? saved[k] : dflt),
      set(k, open) {
        saved = { ...saved, [k]: open };
        try { localStorage.setItem(FOLD_KEY, JSON.stringify(saved)); } catch { /* kept for this visit */ }
        subs.forEach((f) => f());
      },
      sub(f) { subs.add(f); return () => subs.delete(f); },
    };
  })();
  // Opens the folded block holding a field (a tap on the poster's text, say); returns the field.
  RS.ui.openField = (fid) => {
    const el = document.getElementById(fid);
    const g = el && el.closest('.group.folded');
    if (g) folds.set(g.dataset.fold, true);
    return el;
  };
  let groupSeq = 0;
  // fold: the block's name for the memory (default: its id or where + title); summary: shown while folded.
  // `closed` is read when the block appears: a change later (a model picked) folds nothing under a tap.
  function Group({ title, hint, show, onToggle, children, id, where = 'anúncio', fold, closed = false, summary }) {
    const key = fold || id || `${where}:${title}`;
    const [, redraw] = useState(0);
    useEffect(() => folds.sub(() => redraw((n) => n + 1)), []);
    const first = useRef(closed);
    const open = folds.open(key, !first.current);
    const bodyId = useRef(null);
    if (!bodyId.current) bodyId.current = `grp-${++groupSeq}`;
    return html`<section class=${'group' + (show === false ? ' hidden-block' : '') + (open ? '' : ' folded')} id=${id} data-fold=${key}>
      <header class="group-head">
        <h3><button type="button" class="group-toggle" aria-expanded=${open} aria-controls=${bodyId.current} onClick=${() => folds.set(key, !open)}>
          <${Icon} name="chevron-down" size=${18} /><span>${title}</span></button></h3>
        ${!open && summary && html`<span class="group-summary">${summary}</span>`}
        ${onToggle && html`<button class="eye" aria-pressed=${show !== false} onClick=${() => onToggle(show === false)}
          title=${show === false ? `Mostrar no ${where}` : `Ocultar do ${where} (o texto fica guardado)`}>
          <${Icon} name=${show === false ? 'eye-off' : 'eye'} size=${17} /> <span>${show === false ? 'Oculto' : 'Visível'}</span>
        </button>`}
      </header>
      <div class="group-fold" id=${bodyId.current} hidden=${!open}>
        ${hint && html`<p class="group-hint">${hint}</p>`}
        <div class="group-body">${children}</div>
      </div>
    </section>`;
  }
  function AutoTextarea({ id, value, onInput, onBlur, placeholder, rows = 1 }) {
    const ref = useRef();
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);
    return html`<textarea ref=${ref} id=${id} rows=${rows} value=${value} placeholder=${placeholder} onInput=${onInput} onBlur=${onBlur}></textarea>`;
  }
  // «Balão» (2026-10-28): what the app says about the poster sits under the field that
  // caused it, in a grey bubble; under the poster when the cause was Estilo or a format.
  const NoteContext = createContext(null);
  function noteFor(report, lastField) {
    if (!report || !(report.shrink < 0.97 || (report.minTextSize > 0 && report.minTextSize < 26))) return null;
    return { field: lastField || null, text: lastField === 'f-headline' ? 'Título longo, a letra ficou mais pequena.' : 'Texto longo, a letra ficou mais pequena.' };
  }
  function Field({ label, id, value, onInput, multiline, placeholder, hint, type = 'text' }) {
    const note = useContext(NoteContext);
    return html`<div class="field" data-note-host=${id}>
      <label for=${id}>${label}</label>
      ${multiline
        ? html`<${AutoTextarea} id=${id} value=${value} onInput=${onInput} placeholder=${placeholder} />`
        : html`<input id=${id} type=${type} value=${value} onInput=${onInput} placeholder=${placeholder} />`}
      ${hint && html`<small class="field-hint">${hint}</small>`}
      ${note && note.field === id && html`<p class="say field-note" role="status">${note.text}</p>`}
    </div>`;
  }
  function EyeMini({ on, onClick, what }) {
    return html`<button class="eye mini" aria-pressed=${on} onClick=${onClick} title=${on ? `Ocultar ${what}` : `Mostrar ${what}`} aria-label=${on ? `Ocultar ${what}` : `Mostrar ${what}`}>
      <${Icon} name=${on ? 'eye' : 'eye-off'} size=${16} /></button>`;
  }

  function IconPicker({ value, onChange, label }) {
    const [open, setOpen] = useState(false);
    const pop = RS.ui.useLeaving(open, 140);
    const [q, setQ] = useState('');
    const ref = useRef();
    const searchRef = useRef();
    useEffect(() => {
      if (!open) return undefined;
      if (searchRef.current && window.matchMedia('(hover: hover)').matches) searchRef.current.focus();
      const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
      document.addEventListener('pointerdown', onDoc);
      document.addEventListener('keydown', onKey, true);
      return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey, true); };
    }, [open]);
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const list = RS.ICON_CATALOG.filter((i) => !q || norm(`${i.label} ${i.tags}`).includes(norm(q)));
    return html`<div class="ip" ref=${ref}>
      <button class="ip-btn" aria-label=${`Mudar ícone de ${label}`} title="Mudar ícone" aria-expanded=${open} onClick=${() => setOpen(!open)}>
        <${Icon} name=${value || 'circle-check'} size=${19} />
      </button>
      ${pop.mounted && html`<div class=${'ip-pop pop' + (pop.leaving ? ' leaving' : '')} role="dialog" aria-label="Escolher ícone">
        <div class="ip-search"><${Icon} name="search" size=${16} />
          <input ref=${searchRef} name="icon-search" aria-label="Procurar ícone" placeholder="Procurar: salário, carro, casa…" value=${q} onInput=${(e) => setQ(e.target.value)} />
          <button class="icon-btn subtle show-sm" aria-label="Fechar" onClick=${() => setOpen(false)}><${Icon} name="x" size=${16} /></button>
        </div>
        <div class="ip-grid">
          ${list.map((i) => html`<button key=${i.id} class=${'ip-item' + (i.id === value ? ' on' : '')} title=${i.label}
            onClick=${() => { onChange(i.id); setOpen(false); }}><${Icon} name=${i.id} size=${22} /><span>${i.label}</span></button>`)}
          ${!list.length && html`<p class="ip-empty">Nenhum ícone com «${q}».</p>`}
        </div>
      </div>`}
    </div>`;
  }

  // Editable list. Reorder by dragging the handle (mouse or finger) or with Alt + arrows.
  function ListEditor({ items, onChange, withIcon, addLabel, prefix, placeholder, coalesce, defaultIcon, itemLabel }) {
    const [drag, setDrag] = useState(null);
    const listRef = useRef();
    const pendingFocus = useRef(null);
    const exits = RS.ui.useExits();
    const arrived = RS.ui.useArrivals(items.map((it) => it.id));
    RS.ui.useFlip(listRef);
    // the removal runs after the row's exit, on the list as it is then
    const latest = useRef({ items, onChange });
    latest.current = { items, onChange };
    useEffect(() => {
      if (!pendingFocus.current) return;
      const el = document.getElementById(pendingFocus.current);
      pendingFocus.current = null;
      if (el) el.focus();
    });
    const move = (from, to) => {
      if (to < 0 || to >= items.length || from === to) return;
      const next = [...items];
      next.splice(to, 0, next.splice(from, 1)[0]);
      onChange(next);
    };
    const setItem = (i, patch, key) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)), key);
    const remove = (i) => {
      const id = items[i].id;
      exits.exit(id, () => latest.current.onChange(latest.current.items.filter((x) => x.id !== id)));
    };
    const add = () => {
      const it = withIcon ? M.iconItem(defaultIcon || 'circle-check', '') : M.item('');
      pendingFocus.current = `${prefix}-${it.id}`;
      onChange([...items, it]);
    };
    const down = (i) => (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const rows = [...listRef.current.querySelectorAll(':scope > .li')];
      const rects = rows.map((r) => r.getBoundingClientRect());
      const step = rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height + 8;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: i, to: i, y0: e.clientY, dy: 0, mids: rects.map((r) => r.top + r.height / 2), step });
    };
    const moveDrag = (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y0;
      const center = drag.mids[drag.from] + dy;
      let to = 0;
      drag.mids.forEach((m, j) => { if (j !== drag.from && center > m) to++; });
      setDrag({ ...drag, dy, to });
    };
    const up = () => {
      if (!drag) return;
      const { from, to } = drag;
      setDrag(null);
      if (to !== from) move(from, to);
    };
    const shift = (i) => {
      if (!drag) return '';
      if (i === drag.from) return `transform:translateY(${drag.dy}px)`;
      if (drag.from < drag.to && i > drag.from && i <= drag.to) return `transform:translateY(${-drag.step}px)`;
      if (drag.from > drag.to && i >= drag.to && i < drag.from) return `transform:translateY(${drag.step}px)`;
      return 'transform:none';
    };
    return html`<div class=${'list' + (drag ? ' sorting' : '')} ref=${listRef}>
      ${items.map((it, i) => html`<div key=${it.id} data-flip=${it.id} class=${'li' + (arrived(it.id) ? ' fresh' : '') + (drag && drag.from === i ? ' lifted' : '') + (exits.leaving(it.id) ? ' leaving' : '')} style=${shift(i)}>
        <button class="handle" aria-label=${`Mover ${itemLabel.toLowerCase()} ${i + 1} (Alt + setas)`} title="Arraste para reordenar"
          onPointerDown=${down(i)} onPointerMove=${moveDrag} onPointerUp=${up} onPointerCancel=${up}
          onKeyDown=${(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(i, i + (e.key === 'ArrowUp' ? -1 : 1)); } }}>
          <${Icon} name="grip-vertical" size=${16} />
        </button>
        ${withIcon && html`<${IconPicker} value=${it.icon} label=${it.text || itemLabel} onChange=${(icon) => setItem(i, { icon })} />`}
        <input id=${`${prefix}-${it.id}`} type="text" value=${it.text} placeholder=${placeholder} aria-label=${`${itemLabel} ${i + 1}`}
          onInput=${(e) => setItem(i, { text: e.target.value }, `${coalesce}:${it.id}`)}
          onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button class="icon-btn subtle" aria-label=${`Remover ${itemLabel.toLowerCase()} ${i + 1}`} title="Remover" onClick=${() => remove(i)}><${Icon} name="x" size=${16} /></button>
      </div>`)}
      <button class="add-row" data-flip="end" onClick=${add}><${Icon} name="plus" size=${16} stroke=${2.4} /> ${addLabel}</button>
    </div>`;
  }

  // «Fala comigo»: the recruiter's WhatsApp number, the pill switch and the message
  // the candidate sends (generated until the person writes their own; «Repor»).
  // The start of a message, at most `n` characters, cut at a word (the chat bubble on the poster).
  function messageStart(s, n = 40) {
    const one = String(s || '').replace(/\s+/g, ' ').trim();
    if (one.length <= n) return one;
    const head = one.slice(0, n - 1);
    const cut = head.lastIndexOf(' ');
    return `${(cut > n / 3 ? head.slice(0, cut) : head).replace(/[\s,.;:!?-]+$/, '')}…`;
  }
  function WhatsAppFields({ project, update }) {
    const w = project.whatsapp || { country: '351', number: '' };
    const t = project.texts[project.locale];
    const valid = !w.number.trim() || !!C.digits(w.country, w.number);
    const complete = !!w.number.trim() && valid;
    // the ✓ pops when the person completes the number, not when an ad opens with one
    const [popOk, setPopOk] = useState(false);
    // «Balão»: a number the person completes rings the poster's WhatsApp button (Workspace listens)
    const setW = (patch, coalesce) => {
      const next = { ...w, ...patch };
      if (!C.digits(w.country, w.number) && C.digits(next.country, next.number)) { setPopOk(true); RS.ui.emit('wa-complete', { message: messageStart(C.adMessage(project, project.locale)) }); }
      update((p) => { p.whatsapp = { country: '351', number: '', ...(p.whatsapp || {}), ...patch }; }, coalesce ? { coalesce } : {});
    };
    // An empty message means "generated", so an emptied field would snap back
    // to the generated text while the person writes: until they leave the
    // field (or change language) it stays as they left it.
    const [draft, setDraft] = useState(null);
    useEffect(() => setDraft(null), [project.locale]);
    const blank = (s) => !(s || '').trim();
    const message = draft !== null && blank(draft) && blank(t.waMessage) ? draft : C.adMessage(project, project.locale);
    return html`<div class="wa-fields">
      <div class="field">
        <label for="f-contact-wa"><${Icon} name="message-circle" size=${15} /> O seu WhatsApp</label>
        <div class="wa-number">
          <select name="wa-country" aria-label="Indicativo do país" value=${w.country} onChange=${(e) => setW({ country: e.target.value })}>
            ${C.COUNTRIES.map((c) => html`<option key=${c.code} value=${c.code}>${c.label}</option>`)}
          </select>
          <input id="f-contact-wa" type="tel" inputmode="tel" autocomplete="tel" value=${w.number} placeholder="912 345 678"
            onInput=${(e) => { const v = e.target.value; setW({ number: v }, 'wa-number'); }} />
          ${complete && html`<span class=${'field-ok' + (popOk ? ' pop' : '')} aria-hidden="true"><${Icon} name="check" size=${16} /></span>`}
        </div>
        ${valid ? html`<small class="field-hint">Os candidatos falam consigo no WhatsApp com um toque.</small>`
          : html`<small class="field-hint warn">Número incompleto: confirme o indicativo e os algarismos.</small>`}
      </div>
      <label class="switch"><input type="checkbox" checked=${project.show.waCta !== false} onChange=${(e) => { const on = e.target.checked; update((p) => { p.show.waCta = on; }); }} /><span class="switch-ui"></span> Botão WhatsApp no anúncio</label>
      <div class="field">
        <label for="f-wa-message">Mensagem que o candidato envia</label>
        <${AutoTextarea} id="f-wa-message" value=${message}
          onBlur=${() => setDraft(null)}
          onInput=${(e) => { const v = e.target.value; setDraft(v); update((p) => { p.texts[p.locale].waMessage = v; }, { coalesce: 'wa-message' }); }} />
        <div class="wa-msg-foot">
          <small class="field-hint">${t.waMessage ? 'Escrita por si.' : 'Escrita pela app: acompanha as profissões e a língua.'}</small>
          <button id="f-wa-reset" class="btn link sm" disabled=${!t.waMessage} onClick=${() => update((p) => { p.texts[p.locale].waMessage = ''; })}>
            <${Icon} name="rotate-ccw" size=${14} /> Repor</button>
        </div>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- «Mostrar QR»
  // Full screen, for face-to-face moments: the other person points the camera
  // and WhatsApp opens with "Olá, falámos agora há pouco." in the chosen
  // language. Without a number it asks for it first; onNumber keeps it
  // (in the brand from the home screen, in the ad from the editor).
  function MeetQR({ whatsapp, onNumber, keptIn, onClose }) {
    const [locale, setLocale] = useState('pt-PT');
    const [w, setW] = useState(() => ({ country: '351', number: '', ...(whatsapp || {}) }));
    const [shown, setShown] = useState(() => !!(whatsapp && C.digits(whatsapp.country, whatsapp.number)));
    const valid = !!C.digits(w.country, w.number);
    const link = shown ? C.meetLink(w.country, w.number, locale) : null;
    const [closing, close] = useClosing(onClose);
    const boxRef = useRef();
    const canvasRef = useRef();
    const prevFocus = useRef(document.activeElement);
    useEffect(() => {
      const field = boxRef.current && boxRef.current.querySelector('#meet-number');
      (field || boxRef.current).focus();
      return () => { if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus(); };
    }, []);
    useEffect(() => {
      const cv = canvasRef.current;
      if (!cv || !link) return;
      cv.width = cv.height = 1000;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 1000, 1000);
      RS.engine.drawQR({ ctx, hit() {} }, link, 0, 0, 1000, { dark: '#0B1220', light: '#FFFFFF' });
    }, [link]);
    function submit(e) {
      e.preventDefault();
      if (!valid) return;
      const kept = { country: w.country, number: w.number.trim() };
      setW(kept);
      onNumber(kept);
      setShown(true);
    }
    return html`<div ref=${boxRef} class=${'meet' + (closing ? ' closing' : '')} role="dialog" aria-modal="true" aria-labelledby="meet-title" tabindex="-1"
      onKeyDown=${(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <header class="meet-head">
        <h2 id="meet-title"><${Icon} name="message-circle" size=${22} /> WhatsApp</h2>
        <button class="icon-btn meet-close" aria-label="Fechar" onClick=${() => close()}><${Icon} name="x" /></button>
      </header>
      ${shown ? html`<div class="meet-body">
        <div class="chips-row small meet-langs" role="radiogroup" aria-label="Língua da mensagem">
          ${M.LOCALES.map((l) => html`<button key=${l.code} role="radio" aria-checked=${locale === l.code} title=${l.label}
            class=${'tchip' + (locale === l.code ? ' on' : '')} onClick=${() => setLocale(l.code)}>${l.short}</button>`)}
        </div>
        <figure class="meet-qr" data-link=${link} role="img" aria-label=${`Código QR do WhatsApp ${C.display(w.country, w.number)}`}>
          <canvas ref=${canvasRef}></canvas>
        </figure>
        <p class="meet-hint" lang=${locale}>${M.STOCK.scanHint[locale]}</p>
        <p class="meet-number">${C.display(w.country, w.number)}</p>
        <p class="meet-msg">O WhatsApp abre com: «${M.STOCK.waMeet[locale]}»</p>
      </div>` : html`<form class="meet-body meet-ask" onSubmit=${submit}>
        <p>Escreva o seu número de WhatsApp para mostrar o QR. Fica guardado ${keptIn}.</p>
        <div class="wa-number">
          <select name="meet-country" aria-label="Indicativo do país" value=${w.country} onChange=${(e) => { const v = e.target.value; setW((o) => ({ ...o, country: v })); }}>
            ${C.COUNTRIES.map((c) => html`<option key=${c.code} value=${c.code}>${c.label}</option>`)}
          </select>
          <input id="meet-number" type="tel" inputmode="tel" autocomplete="tel" aria-label="Número de WhatsApp" placeholder="912 345 678" value=${w.number}
            onInput=${(e) => { const v = e.target.value; setW((o) => ({ ...o, number: v })); }} />
        </div>
        <button class="btn primary lg" type="submit" disabled=${!valid}><${Icon} name="qr-code" /> Mostrar QR</button>
      </form>`}
    </div>`;
  }

  // ---------------------------------------------------------------- Texto
  const PERIOD_LABELS = { hour: 'hora', day: 'dia', week: 'semana', month: 'mês' };
  function TextPanel({ project, update }) {
    const t = project.texts[project.locale];
    const set = (key) => (e) => {
      const value = e.target.value;
      update((p) => {
        p.texts[p.locale][key] = value;
      }, { coalesce: `text:${key}` });
    };
    const show = (key) => (v) => update((p) => { p.show[key] = v; });
    const setList = (key) => (items, coalesce) => update((p) => { p.texts[p.locale][key] = items; }, coalesce ? { coalesce } : {});
    // Offer (salary, vacancies): one for every language of the ad.
    const offer = project.offer || M.DEFAULT_OFFER;
    const offerLine = M.offerText(project, project.locale);
    const setOffer = (key, typing) => (e) => {
      const value = e.target.value;
      update((p) => { p.offer = { ...M.DEFAULT_OFFER, ...(p.offer || {}), [key]: value }; }, typing ? { coalesce: `offer:${key}` } : {});
    };
    // Ready texts of the chosen trades: the main trade's texts with every trade's
    // positions; contacts, QR link and WhatsApp message stay.
    async function useTradeTexts() {
      const ids = project.trades || [];
      if (!ids.length) return;
      // Only the languages with ready texts change; the others keep the person's.
      const short = (codes) => codes.map((c) => M.localeInfo(c).short).join(', ');
      const ready = M.readyTextLocales(project);
      const others = project.locales.filter((c) => !ready.includes(c));
      const ok = await confirmDialog({
        title: `Usar os textos prontos de «${tradesLabel(ids)}»?`,
        body: `Substitui título, introdução, vantagens, vagas e selo em ${short(ready)}.${others.length ? ` ${short(others)} não ${others.length > 1 ? 'têm' : 'tem'} textos prontos e fica como está.` : ''} Os contactos, o QR e a mensagem do WhatsApp ficam. Pode desfazer com Ctrl+Z.`,
        confirm: 'Usar estes textos',
      });
      if (!ok) return;
      update((p) => { Object.assign(p, M.applyTradeTexts(p)); });
      toast('Textos prontos aplicados');
    }
    return html`<div class="panel-inner">
      <div class="panel-head">
        <h2>Oferta</h2>
      </div>
      <${Group} title="Profissões do anúncio" fold="texto:profissoes" closed summary=${project.trades.length ? tradesLabel(project.trades) : 'Nenhuma'}>
        <div class="preset">
          <${TradePicker} value=${project.trades} onChange=${(ids) => update((p) => { Object.assign(p, M.setTrades(p, ids)); })} />
          ${project.trades.length > 0 && html`<button class="btn ghost sm" onClick=${useTradeTexts}><${Icon} name="wand-sparkles" size=${15} /> Usar os textos prontos destas profissões</button>`}
        </div>
      <//>
      <${Group} title="Título">
        <div class="field-with-eye">
          <${Field} label="Chamada" id="f-kicker" value=${t.kicker} onInput=${set('kicker')} placeholder="Ex.: Estamos a recrutar" />
          <${EyeMini} on=${project.show.kicker} onClick=${() => show('kicker')(!project.show.kicker)} what="chamada" />
        </div>
        <${Field} label="Título principal" id="f-headline" multiline value=${t.headline} onInput=${set('headline')}
          placeholder="Ex.: Pedreiros, cofragistas e serventes" hint="Enter muda de linha. O tamanho da letra ajusta-se sozinho." />
        <div class="field-with-eye">
          <${Field} label="Introdução" id="f-intro" multiline value=${t.intro} onInput=${set('intro')} placeholder="Ex.: Tem experiência em obra e procura um novo desafio?" />
          <${EyeMini} on=${project.show.intro} onClick=${() => show('intro')(!project.show.intro)} what="introdução" />
        </div>
      <//>
      <${Group} title="Vantagens" show=${project.show.benefits} onToggle=${show('benefits')} hint="Toque no ícone para o trocar. Enter acrescenta outra linha.">
        <${ListEditor} items=${t.benefits} onChange=${setList('benefits')} withIcon prefix="f-benefit" coalesce="benefit" itemLabel="Vantagem"
          addLabel="Adicionar vantagem" placeholder="Ex.: Alojamento pago" />
      <//>
      <${Group} title="Vagas" show=${project.show.positions} onToggle=${show('positions')}>
        <${Field} label="Título da caixa" id="f-positionsTitle" value=${t.positionsTitle} onInput=${set('positionsTitle')} placeholder="Ex.: Procuramos:" />
        <${ListEditor} items=${t.positions} onChange=${setList('positions')} prefix="f-position" coalesce="position" itemLabel="Vaga"
          addLabel="Adicionar vaga" placeholder="Ex.: Pedreiro com experiência" />
      <//>
      <${Group} title="Ficha da oferta (opcional)" hint="Preencha uma vez para todas as línguas e escolha as peças onde aparece. Os rótulos e a data adaptam-se à língua.">
        <div class="offer-row">
          <div class="field">
            <label for="f-offer-salary">Salário</label>
            <input id="f-offer-salary" type="text" inputmode="decimal" value=${offer.salary} placeholder="Ex.: 1900" onInput=${setOffer('salary', true)} />
          </div>
          <div class="field">
            <label for="f-offer-currency">Moeda</label>
            <select id="f-offer-currency" value=${offer.currency} onChange=${setOffer('currency')}>
              ${M.CURRENCIES.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="f-offer-period">Por</label>
            <select id="f-offer-period" value=${offer.period} onChange=${setOffer('period')}>
              ${M.PERIODS.map((k) => html`<option key=${k} value=${k}>${PERIOD_LABELS[k]}</option>`)}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="f-offer-vacancies">Número de vagas</label>
          <input id="f-offer-vacancies" type="text" inputmode="numeric" value=${offer.vacancies} placeholder="Ex.: 30" onInput=${setOffer('vacancies', true)} />
        </div>
        <${Field} label="Localização pública" id="f-offer-location" value=${offer.location || ''} onInput=${setOffer('location', true)} placeholder="Ex.: Lausanne, Suíça" hint="Escreva a cidade ou região que quer divulgar." />
        <div class="field"><label for="f-offer-startDate">Data de início</label><input id="f-offer-startDate" type="date" value=${offer.startDate || ''} onInput=${setOffer('startDate', true)} /></div>
        <fieldset class="offer-visibility"><legend>Mostrar a ficha em</legend>${Object.entries(M.OFFER_OUTPUTS).map(([key, label]) => html`<label key=${key}><input type="checkbox" checked=${M.offerVisible(project, key)} onChange=${(e) => { const checked = e.target.checked; update((p) => { p.offer.visibility = { ...M.DEFAULT_OFFER.visibility, ...p.offer.visibility, [key]: checked }; }); }} />${label}</label>`)}</fieldset>
        ${offerLine && html`<small class="field-hint">${offerLine}</small>`}
      <//>
      <${Group} title="Selo" show=${project.show.badge} onToggle=${show('badge')} hint="Um destaque curto num círculo sobre a fotografia.">
        <${Field} label="Texto do selo" id="f-badge" value=${t.badge} onInput=${set('badge')} placeholder="Ex.: Início imediato" />
      <//>
    </div>`;
  }

  // ---------------------------------------------------------------- Contactos
  function ContactsPanel({ project, update }) {
    const t = project.texts[project.locale];
    const show = (key) => (v) => update((p) => { p.show[key] = v; });
    // A contact holding the WhatsApp number is drawn once, on the green button.
    const wa = project.whatsapp;
    const waOwn = wa && C.digits(wa.country, wa.number);
    const waTwin = waOwn && project.show.waCta !== false && (t.contacts || []).find((c) => C.digits(wa.country, c.text) === waOwn);
    return html`<div class="panel-inner">
      <div class="panel-head"><h2>Contactos</h2></div>
      <${Group} title="O seu WhatsApp">
        <${WhatsAppFields} project=${project} update=${update} />
      <//>
      <${Group} title="Outros contactos" show=${project.show.contacts} onToggle=${show('contacts')} hint="O botão do WhatsApp aparece primeiro; depois estes. Oculto, o anúncio fica sem contactos nem QR.">
        <${ListEditor} items=${t.contacts} onChange=${(items, coalesce) => update((p) => { p.texts[p.locale].contacts = items; }, coalesce ? { coalesce } : {})}
          withIcon defaultIcon="phone" prefix="f-contact" coalesce="contact" itemLabel="Contacto" addLabel="Adicionar contacto" placeholder="Telefone, email ou site" />
        ${waTwin && html`<small class="field-hint">«${waTwin.text.trim()}» é o mesmo número do WhatsApp: no anúncio aparece uma vez, no botão verde.</small>`}
      <//>
      <${Group} title="Código QR">
        <div class="field qr-mode">
          <div class="qr-mode-row">
            <div class="seg small" role="radiogroup" aria-label="O que o QR abre">
              <button role="radio" id=${project.qrMode !== 'link' ? 'f-qr' : undefined} aria-checked=${project.qrMode !== 'link'} class=${project.qrMode !== 'link' ? 'on' : ''} onClick=${() => update((p) => { p.qrMode = 'whatsapp'; })}>WhatsApp (recomendado)</button>
              <button role="radio" aria-checked=${project.qrMode === 'link'} class=${project.qrMode === 'link' ? 'on' : ''} onClick=${() => update((p) => { p.qrMode = 'link'; })}>Link</button>
            </div>
            <${EyeMini} on=${project.show.qr !== false} onClick=${() => show('qr')(project.show.qr === false)} what="código QR" />
          </div>
          ${project.qrMode === 'link'
            ? html`<${Field} label="Link do QR" id="f-qr" value=${t.qr || ''} type="url" placeholder="Ex.: o site ou um formulário" hint="Vazio = sem QR."
              onInput=${(e) => { const v = e.target.value; update((p) => { p.texts[p.locale].qr = v; }, { coalesce: 'text:qr' }); }} />`
            : html`<small class="field-hint">${C.adLink(project, project.locale) ? 'O QR abre o WhatsApp com a mensagem acima. Ideal para cartazes impressos e para mostrar ao vivo.' : 'Escreva o seu WhatsApp acima para o QR aparecer.'}</small>`}
        </div>
      <//>
    </div>`;
  }

  // ---------------------------------------------------------------- Imagens
  function DropZone({ id, label, sub, onFile, img, kind, busy, busyLabel }) {
    const [over, setOver] = useState(false);
    const ref = useRef();
    useEffect(() => {
      if (!img || !ref.current) return;
      const c = ref.current;
      const k = Math.min(1, 640 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    }, [img]);
    return html`<button id=${id} class=${'drop' + (over ? ' over' : '') + (img ? ' has' : '') + (busy ? ' busy' : '') + ` ${kind}`}
      onClick=${() => { if (!busy) onFile(); }} aria-busy=${!!busy}
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && !busy) onFile(f); }}>
      ${img ? html`<canvas ref=${ref} aria-hidden="true"></canvas><span class="drop-swap"><${Icon} name="refresh-cw" size=${15} /> Substituir</span>`
        : html`<span class="drop-empty"><${Icon} name="image-plus" size=${26} /><strong>${label}</strong><small>${sub}</small></span>`}
      ${busy && html`<span class="busy-veil"><${Spinner} large /> ${busyLabel}</span>`}
    </button>`;
  }
  function Slider({ label, value, min, max, step, onInput, format, id }) {
    return html`<div class="slider">
      <label for=${id}><span>${label}</span><output>${format ? format(value) : value}</output></label>
      <input id=${id} type="range" min=${min} max=${max} step=${step} value=${value} onInput=${(e) => onInput(parseFloat(e.target.value))} />
    </div>`;
  }
  const pct = (v) => `${Math.round(v * 100)}%`;

  function PhotoDetails({ item, project, onSave, onClose }) {
    const [draft, setDraft] = useState(() => ({ ...L.metadata(item), cat: item.cat || 'geral' })), [tags, setTags] = useState((item.tags || []).join(', '));
    const [usage, setUsage] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const running = useRef(false);
    useEffect(() => { let live = true; L.usage(item.asset, project).then((u) => { if (live) setUsage(u); }).catch((e) => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
    const save = async () => {
      if (running.current) return; running.current = true; setBusy(true); setError('');
      try { onSave(await L.saveMetadata(item.asset, { name: draft.name, description: draft.description, favorite: draft.favorite, cat: draft.cat, tags })); onClose(); }
      catch (e) { setError(e.message || 'Não foi possível guardar.'); }
      finally { setBusy(false); running.current = false; }
    };
    return html`<${Modal} title="Detalhes da fotografia" className="photo-details" busy=${busy} onClose=${onClose}><div class="library-body">
      <img class="photo-details-image" src=${item.thumb} alt=${draft.description || L.label(item)} />
      <fieldset disabled=${busy}><div class="field"><label for="asset-name">Nome</label><input id="asset-name" value=${draft.name} maxLength="120" onInput=${(e) => setDraft({ ...draft, name: e.target.value })} /></div>
      <div class="field"><label for="asset-description">Descrição</label><textarea id="asset-description" value=${draft.description} rows="3" maxLength="600" onInput=${(e) => setDraft({ ...draft, description: e.target.value })} /></div>
      <div class="field"><label for="asset-tags">Etiquetas (separadas por vírgulas)</label><input id="asset-tags" value=${tags} onInput=${(e) => setTags(e.target.value)} /></div>
      <div class="field"><label for="asset-category">Profissão</label><select id="asset-category" value=${draft.cat} onChange=${(e) => setDraft({ ...draft, cat: e.target.value })}><option value="geral">Geral</option>${TR.list.map((t) => html`<option key=${t.id} value=${t.photo}>${t.label}</option>`)}</select></div>
      <label class="check"><input type="checkbox" checked=${draft.favorite} onChange=${(e) => setDraft({ ...draft, favorite: e.target.checked })} /> Favorita</label>
      <button class="btn primary" onClick=${save}>Guardar detalhes</button></fieldset>
      ${draft.originalName && html`<p class="field-hint">Ficheiro original: ${draft.originalName}</p>`}
      <section class="photo-usage"><h3>Utilização</h3>${usage ? html`${usage.projects.length || usage.templates.length ? html`<ul>${usage.projects.map((p) => html`<li key=${p.id}>${p.name} · ${p.trashed ? 'Reciclagem' : 'Anúncio'}${p.current ? '' : ' · só no histórico'}${p.current && p.history ? ' e histórico' : ''}</li>`)}${usage.templates.map((t) => html`<li key=${t.id}>${t.name} · Modelo pessoal</li>`)}</ul>` : html`<p>Não está usada em anúncios ou modelos guardados.</p>`}` : html`<p>A verificar utilização…</p>`}</section>
      ${error && html`<p class="workflow-error" role="alert">${error}</p>`}
    </div><//>`;
  }
  function PhotoLibrary({ project, setPhotoAsset, choosePhoto, imgBusy }) {
    const [lib, setLib] = useState(null);
    const [mine, setMine] = useState([]);
    const tradeCat = project.trade && TR.get(project.trade) ? TR.get(project.trade).photo : null;
    const [cat, setCat] = useState('auto');
    const [busy, setBusy] = useState(null);
    const [adding, setAdding] = useState(null); // { done, total }
    const [query, setQuery] = useState(''), [favorite, setFavorite] = useState(false), [tag, setTag] = useState('');
    const [details, setDetails] = useState(null), [importResult, setImportResult] = useState(null), [libError, setLibError] = useState('');
    const importPending = useRef(false);
    useEffect(() => { L.index().then(setLib); L.userItems().then(setMine).catch((e) => setLibError(e.message)); }, []);
    const bundled = lib ? lib.items : [];
    const present = useMemo(() => new Set(bundled.map((i) => i.cat)), [lib]);
    // «Deste anúncio»: the library photos of every trade of the ad.
    const adCats = (project.trades || []).map((id) => TR.get(id) && TR.get(id).photo).filter(Boolean);
    const hasAd = adCats.some((c) => present.has(c));
    const effective = cat === 'auto' ? (hasAd ? 'ad' : tradeCat && present.has(tradeCat) ? tradeCat : (bundled.length ? 'all' : 'mine')) : cat;
    const cats = [
      ...(hasAd ? [{ id: 'ad', label: 'Deste anúncio' }] : []),
      ...(bundled.length ? [{ id: 'all', label: 'Todas' }] : []),
      ...TR.list.filter((t) => present.has(t.photo)).map((t) => ({ id: t.photo, label: t.label })),
      ...(present.has('geral') ? [{ id: 'geral', label: 'Gerais' }] : []),
      { id: 'mine', label: `As minhas (${mine.length})` },
    ];
    const items = L.filter(effective === 'mine'
      ? mine.map((m) => ({ ...m, key: m.asset }))
      : bundled.filter((i) => effective === 'all' || (effective === 'ad' ? adCats.includes(i.cat) : i.cat === effective)).map((i) => ({ ...i, key: i.id, name: `${TR.list.find((t) => t.photo === i.cat)?.label || 'Fotografia'} · ${i.id}` })), { query, favorite: effective === 'mine' && favorite, tag: effective === 'mine' ? tag : '' });
    const locked = !!(busy || imgBusy);
    const libWait = useDelayed(!lib, 300);
    async function pick(it) {
      if (locked) return;
      setBusy(it.key);
      try {
        if (it.asset) { setPhotoAsset(it.asset); toast('Fotografia aplicada'); }
        else await choosePhoto(L.fileFor(it.id).catch(() => { throw new Error('Não foi possível abrir esta fotografia.'); }));
      } catch (err) {
        console.error(err);
        toast('Não foi possível abrir esta fotografia.', { kind: 'error' });
      } finally {
        setBusy(null);
      }
    }
    async function addMine() {
      if (locked || importPending.current) return;
      importPending.current = true;
      try {
        const files = await pickFiles('image/*'); if (!files.length) return;
        setBusy('adding'); setAdding({ done: 0, total: files.length }); setImportResult(null); setLibError('');
        const result = await L.addUserPhotos(files, tradeCat || 'geral', (done) => setAdding({ done, total: files.length }));
        setMine(await L.userItems());
        setCat('mine'); setQuery(''); setFavorite(false); setTag(''); setImportResult(result);
      } catch (err) {
        setLibError(err.message || 'Não foi possível guardar as fotografias.');
      } finally {
        importPending.current = false; setBusy(null);
        setAdding(null);
      }
    }
    async function removeMine(it) {
      const ok = await confirmDialog({ title: 'Tirar da biblioteca?', body: 'A fotografia sai da biblioteca. Os anúncios que já a usam ficam iguais.', confirm: 'Tirar', danger: true });
      if (!ok) return;
      try { await L.removeUser(it.asset); setMine(await L.userItems()); } catch (e) { setLibError(e.message); }
    }
    return html`<div class="library">
      <div class="chips-row small" role="radiogroup" aria-label="Categoria">
        ${cats.map((c) => html`<button key=${c.id} role="radio" aria-checked=${effective === c.id} class=${'tchip' + (effective === c.id ? ' on' : '')} onClick=${() => setCat(c.id)}>${c.label}</button>`)}
      </div>
      <label class="lib-search">Pesquisar fotografias<input type="search" value=${query} placeholder="Nome, descrição, etiquetas…" onInput=${(e) => setQuery(e.target.value)} /></label>
      ${effective === 'mine' && html`<div class="library-filters"><label class="check"><input type="checkbox" checked=${favorite} onChange=${(e) => setFavorite(e.target.checked)} /> Só favoritas</label><label>Etiqueta<select value=${tag} onChange=${(e) => setTag(e.target.value)}><option value="">Todas</option>${[...new Set(mine.flatMap((m) => m.tags || []))].sort().map((t) => html`<option key=${t} value=${t}>${t}</option>`)}</select></label></div>`}
      ${libWait && html`<${TypingLoader} label="A carregar a biblioteca…" />`}
      ${!lib ? html`<div class="lib-grid" aria-busy="true" aria-label="A carregar a biblioteca">
        ${[0, 1, 2, 3, 4, 5].map((i) => html`<span key=${i} class="lib-skel"></span>`)}
      </div>` : items.length ? html`<div class=${'lib-grid' + (effective === 'mine' ? ' own-photos' : '') + (locked ? ' is-busy' : '')}>
        ${items.map((it) => html`<div key=${it.key} class="lib-cell">
          <button class=${'lib-item' + (busy === it.key ? ' busy' : '')} onClick=${() => pick(it)} aria-busy=${busy === it.key}
            aria-label=${busy === it.key ? 'A aplicar esta fotografia' : `Usar ${L.label(it)}${it.description ? ' — ' + it.description : ''}`}>
            <img src=${it.thumb} alt="" loading="lazy" />
          </button>
          ${it.asset && html`<span class="lib-name" title=${L.label(it)}>${L.label(it)}</span><div class="lib-meta-actions"><button class="btn ghost sm" aria-pressed=${!!it.favorite} aria-label=${`Favorita: ${L.label(it)}`} disabled=${locked} onClick=${async () => { try { setMine(await L.saveMetadata(it.asset, { favorite: !it.favorite })); } catch (e) { setLibError(e.message); } }}><${Icon} name="star" size=${15} /></button><button class="btn ghost sm" disabled=${locked} onClick=${() => setDetails(it)}>Detalhes</button></div>
            <button class="lib-remove" aria-label=${`Tirar ${L.label(it)} da biblioteca`} onClick=${() => removeMine(it)}><${Icon} name="x" size=${13} stroke=${2.6} /></button>`}
        </div>`)}
      </div>` : html`<p class="lib-empty">${query || favorite || tag ? 'Não há fotografias para estes filtros.' : effective === 'mine'
        ? 'Ainda não guardou fotografias suas. Acrescente as que usa muitas vezes e ficam aqui para todos os anúncios.'
        : 'A biblioteca embutida ainda não tem fotografias.'}</p>`}
      <button class="btn ghost sm" onClick=${addMine} disabled=${locked} aria-busy=${!!adding}>
        ${adding ? html`<${Spinner} />` : html`<${Icon} name="image-plus" size=${16} />`}
        ${adding ? (adding.total > 1 ? `A adicionar ${Math.min(adding.done + 1, adding.total)} de ${adding.total}…` : 'A adicionar…') : 'Adicionar fotografias à biblioteca'}</button>
      ${libError && html`<p class="workflow-error" role="alert">${libError}</p>`}
      ${importResult && html`<div class="library-import-result"><p role="status">${importResult.added} adicionadas · ${importResult.duplicates} duplicadas · ${importResult.failed} rejeitadas.</p>${!importResult.duplicateCheck && html`<p>Este navegador não permite verificar duplicados. Os ficheiros válidos foram adicionados.</p>`}<details open=${importResult.failed > 0 || importResult.duplicates > 0}><summary>Resultado por ficheiro</summary><ul>${importResult.items.map((it, i) => html`<li key=${i}><strong>${it.name}</strong>: ${it.reason}</li>`)}</ul></details></div>`}
      ${details && html`<${BodyLayer}><${PhotoDetails} item=${details} project=${project} onSave=${setMine} onClose=${() => setDetails(null)} /><//>`}
    </div>`;
  }

  function ImagesPanel({ project, update, images, choosePhoto, chooseLogo, setPhotoAsset, imgBusy }) {
    const ph = M.photoForFormat(project.photo, project.format);
    const st = project.style;
    const adj = ph ? { ...M.DEFAULT_FX, ...(ph.adj || {}) } : M.DEFAULT_FX;
    const setAdj = (k) => (v) => update((p) => { p.photo.adj = { ...M.DEFAULT_FX, ...(p.photo.adj || {}), [k]: v }; }, { coalesce: `adj-${k}` });
    return html`<div class="panel-inner">
      <div class="panel-head"><h2>Fotos</h2></div>
      <${Group} title="Fotografia">
        <${DropZone} id="f-photo" kind="photo" label="Escolher fotografia" sub="JPG, PNG ou WebP. No telemóvel pode tirar uma na hora." img=${images.photo} onFile=${choosePhoto}
          busy=${imgBusy === 'photo'} busyLabel="A preparar a fotografia…" />
        ${ph && html`<div class="photo-tools">
          <${Slider} id="photo-zoom" label="Aproximar" value=${ph.zoom} min=${1} max=${3} step=${0.01} format=${pct}
            onInput=${(v) => update((p) => M.setPhotoFrame(p, p.format, { zoom: v }), { coalesce: 'zoom' })} />
          <div class="row-btns">
            <button class="btn ghost sm" onClick=${() => update((p) => M.setPhotoFrame(p, p.format, { zoom: 1, fx: .5, fy: .5 }))}><${Icon} name="crosshair" size=${16} /> Centrar</button>
            <button class="btn ghost sm" aria-pressed=${!!ph.flip} onClick=${() => update((p) => { p.photo.flip = !p.photo.flip; })}><${Icon} name="flip-horizontal-2" size=${16} /> Espelhar</button>
            <button class="btn ghost sm danger-text" onClick=${() => update((p) => { p.photo = null; })}><${Icon} name="trash-2" size=${16} /> Remover</button>
          </div>
          <p class="tip"><${Icon} name="hand" size=${15} /> Enquadramento de ${M.FORMATS[project.format].label}. Arraste a fotografia para a enquadrar. Ctrl + roda do rato, ou dois dedos, aproxima. Use Comparar formatos para ajustar também pelo teclado.</p>
          <details class="adjust">
            <summary><${Icon} name="sliders-horizontal" size=${16} /> Ajustar a fotografia</summary>
            <${Slider} id="adj-b" label="Brilho" value=${adj.b} min=${0.7} max=${1.35} step=${0.01} format=${pct} onInput=${setAdj('b')} />
            <${Slider} id="adj-c" label="Contraste" value=${adj.c} min=${0.7} max=${1.4} step=${0.01} format=${pct} onInput=${setAdj('c')} />
            <${Slider} id="adj-s" label="Cor" value=${adj.s} min=${0} max=${1.6} step=${0.01} format=${pct} onInput=${setAdj('s')} />
            <div class="row-btns">
              <button class="btn ghost sm" onClick=${() => update((p) => { p.photo.adj = { b: 1.04, c: 1.12, s: 1.15 }; })}><${Icon} name="wand-sparkles" size=${16} /> Realçar</button>
              <button class="btn ghost sm" onClick=${() => update((p) => { p.photo.adj = { ...M.DEFAULT_FX }; })}><${Icon} name="rotate-ccw" size=${16} /> Repor</button>
            </div>
          </details>
        </div>`}
      <//>
      <${Group} title="Biblioteca de fotografias" hint="Toque numa fotografia para a usar neste anúncio.">
        <${PhotoLibrary} project=${project} setPhotoAsset=${setPhotoAsset} choosePhoto=${choosePhoto} imgBusy=${imgBusy} />
      <//>
      <${Group} title="Logótipo" show=${project.show.logo} onToggle=${(v) => update((p) => { p.show.logo = v; })}>
        <${DropZone} id="f-logo" kind="logo" label="Escolher logótipo" sub="PNG com fundo transparente fica melhor." img=${images.logo} onFile=${chooseLogo}
          busy=${imgBusy === 'logo'} busyLabel="A preparar o logótipo…" />
        ${project.logo && html`<div class="photo-tools">
          <${Slider} id="logo-size" label="Tamanho" value=${st.logoScale} min=${0.5} max=${1.8} step=${0.01} format=${pct}
            onInput=${(v) => update((p) => { p.style.logoScale = v; }, { coalesce: 'logoScale' })} />
          <div class="field"><label>Cor do logótipo</label>
            <div class="seg small wrap" role="radiogroup" aria-label="Cor do logótipo">
              ${[['auto', 'Automática'], ['original', 'Original'], ['white', 'Branco'], ['dark', 'Escuro']].map(([v, l]) => html`<button key=${v} role="radio" aria-checked=${st.logoTone === v} class=${st.logoTone === v ? 'on' : ''} onClick=${() => update((p) => { p.style.logoTone = v; })}>${l}</button>`)}
            </div>
            <small class="field-hint">Automática: fica branco sobre fundos escuros quando o logótipo tem transparência.</small>
          </div>
          <button class="btn ghost sm danger-text" onClick=${() => update((p) => { p.logo = null; })}><${Icon} name="trash-2" size=${16} /> Remover logótipo</button>
        </div>`}
        ${!project.logo && html`<div class="brand-fields">
          <p class="group-hint">Sem logótipo? O nome da empresa aparece no lugar dele.</p>
          <${Field} label="Nome da empresa" id="f-brand-name" value=${project.brand.name} placeholder="Ex.: Timework"
            onInput=${(e) => { const v = e.target.value; update((p) => { p.brand.name = v; }, { coalesce: 'brandName' }); }} />
          <${Field} label="Frase da marca (opcional)" id="f-brand-tag" value=${project.brand.tagline} placeholder="Ex.: Recrutamento e seleção"
            onInput=${(e) => { const v = e.target.value; update((p) => { p.brand.tagline = v; }, { coalesce: 'brandTag' }); }} />
          <${Slider} id="brand-size" label="Tamanho" value=${st.logoScale} min=${0.5} max=${1.8} step=${0.01} format=${pct}
            onInput=${(v) => update((p) => { p.style.logoScale = v; }, { coalesce: 'logoScale' })} />
        </div>`}
      <//>
    </div>`;
  }

  // ---------------------------------------------------------------- Aspeto
  function ColorField({ label, value, onChange, id }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    return html`<div class="color-field">
      <label for=${id}>${label}</label>
      <div class="color-row">
        <span class="swatch" style=${`background:${value}`}><input type="color" name=${`${id}-picker`} value=${U.normHex(value).toLowerCase()} aria-label=${`${label}: escolher cor`}
          onInput=${(e) => onChange(e.target.value.toUpperCase(), true)} /></span>
        <input id=${id} class="hex" type="text" value=${draft} spellcheck="false" maxlength="7"
          onInput=${(e) => { const v = e.target.value; setDraft(v); if (U.isHex(v) && v.replace('#', '').length === 6) onChange(U.normHex(v)); }}
          onBlur=${() => setDraft(value)} />
      </div>
    </div>`;
  }

  // the template (folded, saying which one), then the colours, the letter, the sizes and the brand
  function LookPanel({ project, update, images, brand, setBrand, onReuse }) {
    const st = project.style;
    const tpl = T.get(project.template);
    const setColor = (key) => (v, live) => update((p) => { p.style[key] = v; if (key === 'primary' || key === 'accent') p.style.customColors = true; }, { coalesce: live ? `color:${key}` : undefined, swap: 'roll' });
    return html`<div class="panel-inner">
      <div class="panel-head"><h2>Estilo</h2></div>
      <${Group} title="Modelo" fold="aspeto:modelo" closed summary=${tpl.name} hint="Troque de composição. O texto, as imagens e as cores da marca mantêm-se.">
        <${TemplateGallery} project=${project} update=${update} images=${images} />
      <//>
      <${Group} title="Cores da marca">
        <div class="palettes" role="list">
          ${M.PALETTES.map((pl) => {
            const on = U.normHex(st.primary) === U.normHex(pl.primary) && U.normHex(st.accent) === U.normHex(pl.accent);
            return html`<button key=${pl.id} role="listitem" class=${'palette' + (on ? ' on' : '')} title=${pl.name} aria-label=${`Paleta ${pl.name}`}
              onClick=${() => update((p) => { p.style.primary = pl.primary; p.style.accent = pl.accent; p.style.customColors = true; }, { swap: 'roll' })}>
              <span style=${`background:${pl.primary}`}></span><span style=${`background:${pl.accent}`}></span>
            </button>`;
          })}
        </div>
        ${images.logo && html`<button class="btn ghost sm" onClick=${() => {
          const pal = A.logoPalette(images.logo);
          if (!pal) { toast('Não encontrámos cores fortes no logótipo.', { kind: 'error' }); return; }
          update((p) => { p.style.primary = pal.primary; p.style.accent = pal.accent; p.style.customColors = true; }, { swap: 'roll' });
          toast('Cores tiradas do logótipo');
        }}><${Icon} name="pipette" size=${16} /> Usar as cores do logótipo</button>`}
        <div class="color-grid">
          <${ColorField} id="c-primary" label="Principal" value=${st.primary} onChange=${setColor('primary')} />
          <${ColorField} id="c-accent" label="Destaque" value=${st.accent} onChange=${setColor('accent')} />
          <${ColorField} id="c-bg" label="Fundo" value=${st.bg} onChange=${setColor('bg')} />
          <${ColorField} id="c-text" label="Texto" value=${st.text} onChange=${setColor('text')} />
        </div>
        <button class="btn link sm" onClick=${() => update((p) => { const d = tpl.defaults; Object.assign(p.style, { primary: d.primary, accent: d.accent, bg: d.bg, text: d.text, customColors: false }); }, { swap: 'roll' })}>
          <${Icon} name="rotate-ccw" size=${15} /> Repor as cores do modelo ${tpl.name}
        </button>
      <//>
      <${Group} title="Letra">
        <div class="fonts">
          ${Object.entries(M.FONTS).map(([id, f]) => html`<button key=${id} class=${'font-card' + (st.fonts === id ? ' on' : '')} aria-pressed=${st.fonts === id}
            onClick=${() => update((p) => { p.style.fonts = id; p.style.upper = id !== 'elegant'; })}>
            <span class="font-sample" style=${`font-family:'${f.head.family}';font-weight:${f.head.weight}`}>${id === 'elegant' ? 'Vagas' : 'VAGAS'}</span>
            <span class="font-name">${f.label}</span>
          </button>`)}
        </div>
        <label class="switch"><input type="checkbox" checked=${st.upper} onChange=${(e) => update((p) => { p.style.upper = e.target.checked; })} /><span class="switch-ui"></span> Título em maiúsculas</label>
      <//>
      <${Group} title="Tamanhos" hint="Valores máximos: se o texto não couber, a letra encolhe sozinha.">
        <${Slider} id="s-text" label="Texto" value=${st.textScale} min=${0.7} max=${1.3} step=${0.01} format=${pct}
          onInput=${(v) => update((p) => { p.style.textScale = v; }, { coalesce: 'textScale' })} />
        <${Slider} id="s-head" label="Título" value=${st.headScale} min=${0.6} max=${1.4} step=${0.01} format=${pct}
          onInput=${(v) => update((p) => { p.style.headScale = v; }, { coalesce: 'headScale' })} />
      <//>
      <${Group} title="Marcas e modelos pessoais" hint="Guarde várias identidades e anúncios completos para reutilizar.">
        <button class="btn ghost" onClick=${onReuse}><${Icon} name="copy" /> Abrir biblioteca pessoal</button>
      <//>
    </div>`;
  }

  // «Modelo» in «Aspeto»: the thumbnails are drawn once the block is open (it has a width)
  function TemplateGallery({ project, update, images }) {
    const ref = useRef();
    const size = useSize(ref);
    const w = size.w ? Math.floor((size.w - 16) / 2) : 0;
    const variants = useMemo(() => (w > 0 ? T.list.map((t) => M.applyTemplate(project, t)) : []), [project, w > 0]);
    return html`<div class="tpl-mini-grid" ref=${ref}>
      ${T.list.map((t, i) => html`<button key=${t.id} class=${'tpl-mini' + (project.template === t.id ? ' on' : '')} aria-pressed=${project.template === t.id}
        onClick=${() => transition(() => update((p) => { Object.assign(p, M.applyTemplate(p, t)); }))}>
        ${w > 0 && html`<${PosterThumb} project=${variants[i]} images=${images} width=${w} />`}
        <span>${t.name}</span>
      </button>`)}
    </div>`;
  }

  // ---------------------------------------------------------------- workspace (live preview)
  function Workspace({ project, images, update, onSelect, guides, setGuides, report, onReport, choosePhoto, chooseLogo, mobile, busy, onConvert, onCompare, note, topRight, tools, swapRef, gather = false, onCause = () => {} }) {
    const lastFmt = useRef(null);
    // «Balão» (Ilustrativo): a number just completed rings the poster's WhatsApp button and a chat
    // bubble types the start of its message; the button appears with the number, so the ring
    // waits for the render that draws it (for a second at most)
    const waPending = useRef(null);
    const [waMoment, setWaMoment] = useState(null);
    useEffect(() => RS.ui.on('wa-complete', ({ message }) => { if (RS.ui.illustrative()) waPending.current = { message, at: Date.now() }; }), []);
    useEffect(() => {
      if (!waMoment) return undefined;
      const typed = setTimeout(() => setWaMoment((m) => (m && m.id === waMoment.id ? { ...m, typing: false } : m)), 600);
      const gone = setTimeout(() => setWaMoment((m) => (m && m.id === waMoment.id ? null : m)), 2500);
      return () => { clearTimeout(typed); clearTimeout(gone); };
    }, [waMoment && waMoment.id]);
    // dragging the photo: the centre lines while it sits on the centre, and in Ilustrativo a spirit level
    const [level, setLevel] = useState(null);
    const levelTimer = useRef(0);
    useEffect(() => () => clearTimeout(levelTimer.current), []);
    // back from the carousel in Ilustrativo the slides gather into the poster
    const [gathering, setGathering] = useState(gather);
    useEffect(() => { if (!gathering) return undefined; const t = setTimeout(() => setGathering(false), 500); return () => clearTimeout(t); }, [gathering]);
    const wrapRef = useRef();
    const canvasRef = useRef();
    const regionsRef = useRef([]);
    const infoRef = useRef(null);
    const dragRef = useRef(null);
    const pointers = useRef(new Map());
    const pinch = useRef(null);
    const scratch = useMemo(() => document.createElement('canvas').getContext('2d'), []);
    const [hover, setHover] = useState(null);
    const [dropping, setDropping] = useState(false);
    const size = useSize(wrapRef);
    const fmt = M.FORMATS[project.format];
    const margin = mobile ? 24 : 72;
    const k = size.w ? Math.max(0.05, Math.min((size.w - margin) / fmt.w, (size.h - (mobile ? 16 : 48)) / fmt.h)) : 0;
    const cssW = Math.round(fmt.w * k), cssH = Math.round(fmt.h * k);

    useEffect(() => {
      if (!k || !canvasRef.current) return undefined;
      const id = requestAnimationFrame(() => {
        const c = canvasRef.current;
        if (!c) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.round(cssW * dpr), phh = Math.round(cssH * dpr);
        // «Balão»: a change asked to move (a new language, colour, format, undo) leaves under a copy of the old poster;
        // the first drawing of this stage has no old poster (a change made on the carousel or the video waits for nothing)
        const kind = swapRef && lastFmt.current ? swapRef.current : null;
        if (swapRef) swapRef.current = null;
        const swap = kind ? RS.ui.stageSwap(c.parentElement, c, kind, { from: lastFmt.current && [lastFmt.current.w, lastFmt.current.h], to: [fmt.w, fmt.h] }) : null;
        lastFmt.current = fmt;
        if (c.width !== pw) c.width = pw;
        if (c.height !== phh) c.height = phh;
        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        // a drawing that fails is reported, and the old poster still leaves (never left over the stage)
        let res;
        try { res = E.render(ctx, project, { images, scale: (cssW / fmt.w) * dpr, mode: 'editor', guides }); }
        catch (err) { console.error('The poster could not be drawn', err); }
        finally { if (swap) swap.commit(); }
        if (!res) return;
        regionsRef.current = res.regions;
        infoRef.current = res.photo;
        onReport(res.report);
        const wa = waPending.current;
        if (wa) {
          const g = res.regions.find((r) => r.key === 'contact:wa');
          if (g) { waPending.current = null; RS.haptics.tick(); setWaMoment({ id: Date.now(), g, message: wa.message, typing: true }); }
          else if (Date.now() - wa.at > 1000) waPending.current = null;
        }
      });
      return () => cancelAnimationFrame(id);
    }, [project, images, k, guides]);

    const toPoster = (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * fmt.w, y: ((e.clientY - r.top) / r.height) * fmt.h };
    };
    const hitTest = (pt) => {
      const regs = regionsRef.current;
      for (let i = regs.length - 1; i >= 0; i--) {
        const g = regs[i];
        if (pt.x < g.x || pt.y < g.y || pt.x > g.x + g.w || pt.y > g.y + g.h) continue;
        if (g.clip) { g.clip(scratch); if (!scratch.isPointInPath(pt.x, pt.y)) continue; }
        return g;
      }
      return null;
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2 && project.photo) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { d0: dist(a, b), z0: M.photoForFormat(project.photo, project.format).zoom };
        dragRef.current = null;
        setLevel(null);
        return;
      }
      const pt = toPoster(e);
      const frame = M.photoForFormat(project.photo, project.format);
      dragRef.current = { start: pt, g: hitTest(pt), moved: false, fx: frame?.fx, fy: frame?.fy };
    }
    function onPointerMove(e) {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const zoom = U.clamp(pinch.current.z0 * (dist(a, b) / pinch.current.d0), 1, 3);
        update((p) => M.setPhotoFrame(p, p.format, { zoom }), { coalesce: 'zoom' });
        return;
      }
      const pt = toPoster(e);
      const d = dragRef.current;
      if (d && d.g && d.g.key === 'photo' && project.photo && infoRef.current) {
        const dx = pt.x - d.start.x, dy = pt.y - d.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        if (!d.moved) return;
        const { rect, dw, dh } = infoRef.current;
        const fxMin = rect.w / 2 / dw, fyMin = rect.h / 2 / dh;
        const s = M.snapPhotoFrame(U.clamp(d.fx - dx / dw, fxMin, 1 - fxMin), U.clamp(d.fy - dy / dh, fyMin, 1 - fyMin), { dw, dh });
        // only an axis the photo can move along has a centre to settle on
        const x = s.x && dw - rect.w > 1, y = s.y && dh - rect.h > 1;
        if ((x && !d.snapX) || (y && !d.snapY)) RS.haptics.tick();
        d.snapX = x; d.snapY = y;
        clearTimeout(levelTimer.current);
        setLevel({ x, y, rect, offset: U.clamp(((s.fx - 0.5) * dw) / (rect.w / 2), -1, 1), leaving: false });
        update((p) => M.setPhotoFrame(p, p.format, { fx: s.fx, fy: s.fy }), { coalesce: 'photo-drag' });
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const g = hitTest(pt);
      if (!hover || !g || hover.key !== g.key || hover.x !== g.x || hover.y !== g.y) setHover(g);
    }
    function onPointerUp(e) {
      pointers.current.delete(e.pointerId);
      if (pinch.current) { if (pointers.current.size < 2) pinch.current = null; dragRef.current = null; return; }
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (d.moved) {
        // the lines go with the finger; the spirit level leaves a moment later
        setLevel((v) => v && { ...v, leaving: true });
        clearTimeout(levelTimer.current);
        levelTimer.current = setTimeout(() => setLevel(null), 300);
      }
      if (!d.moved && d.g) {
        if (d.g.key === 'photo' && !project.photo) choosePhoto();
        else onSelect(d.g.key);
      }
    }
    function onWheel(e) {
      if (!e.ctrlKey || !project.photo) return;
      const g = hitTest(toPoster(e));
      if (!g || g.key !== 'photo') return;
      e.preventDefault();
      update((p) => M.setPhotoFrame(p, p.format, { zoom: M.photoForFormat(p.photo, p.format).zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06) }), { coalesce: 'zoom' });
    }
    function onDrop(e) {
      e.preventDefault();
      setDropping(false);
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      const g = canvasRef.current ? hitTest(toPoster(e)) : null;
      if (g && g.key === 'logo') chooseLogo(f); else choosePhoto(f);
    }

    const cursor = hover ? (hover.key === 'photo' ? (project.photo ? 'grab' : 'pointer') : 'pointer') : 'default';
    const showBusy = useDelayed(!!busy, 300);
    // the app speaking about the poster: grey bubbles under it (a note about a field sits under that field)
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const hint = !project.photo ? (touch ? 'Sem fotografia: toque no cartaz para escolher uma.' : 'Sem fotografia: arraste uma para o anúncio.')
      : touch ? 'Toque num texto do cartaz para o mudar.' : 'Clique num texto do cartaz para o mudar.';
    // the formats and the language: above the poster on a computer, along its bottom edge
    // on a phone (with undo, redo and the ⋯)
    const formats = html`<div class="stage-left">
          <${FormatSwitch} value=${project.format} compact=${mobile} onChange=${(f) => { onCause(); update((p) => { p.format = f; }, { coalesce: 'format', swap: 'tape' }); }} />
          ${project.format === 'story' && !mobile && html`<label class="switch dark"><input type="checkbox" checked=${guides} onChange=${(e) => setGuides(e.target.checked)} /><span class="switch-ui"></span> <span class="hide-sm">Zonas do Instagram</span><span class="show-sm">Zonas</span></label>`}
        </div>`;
    return html`<main class="workspace">
      ${!mobile && html`<div class="ws-bar stage-top">${formats}<div class="stage-right">${topRight}</div></div>`}
      <div class=${'stage' + (dropping ? ' dropping' : '')} ref=${wrapRef}
        onDragOver=${(e) => { e.preventDefault(); setDropping(true); }} onDragLeave=${(e) => { if (e.currentTarget === e.target) setDropping(false); }} onDrop=${onDrop}>
        ${showBusy && html`<div class="stage-busy"><${TypingLoader} label=${busy} /></div>`}
        ${k > 0 && html`<div class=${'poster-wrap' + (busy ? ' loading' : '') + (gathering ? ' gather' : '')} style=${`width:${cssW}px;height:${cssH}px`}>
          <canvas ref=${canvasRef} class="poster" style=${`width:${cssW}px;height:${cssH}px;cursor:${cursor}`}
            role="img" aria-label=${`Pré-visualização do anúncio, formato ${fmt.label} ${fmt.w} por ${fmt.h}`}
            onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp}
            onPointerLeave=${() => { if (!dragRef.current) setHover(null); }} onWheel=${onWheel}
            onDblClick=${(e) => { const g = hitTest(toPoster(e)); if (g && g.key === 'photo') choosePhoto(); }}></canvas>
          ${hover && html`<div class="hover-box" style=${`left:${hover.x * k - 4}px;top:${hover.y * k - 4}px;width:${hover.w * k + 8}px;height:${hover.h * k + 8}px`}>
            <span class=${'hover-label' + (hover.y * k < 30 ? ' below' : '')}>${regionLabel(hover.key)}</span>
          </div>`}
          ${level && !level.leaving && level.x && html`<i class="guide-v" aria-hidden="true" style=${`left:${(level.rect.x + level.rect.w / 2) * k}px;top:${level.rect.y * k}px;height:${level.rect.h * k}px`}></i>`}
          ${level && !level.leaving && level.y && html`<i class="guide-h" aria-hidden="true" style=${`top:${(level.rect.y + level.rect.h / 2) * k}px;left:${level.rect.x * k}px;width:${level.rect.w * k}px`}></i>`}
          ${level && RS.ui.illustrative() && html`<${RS.ui.SpiritLevel} offset=${level.offset} snapped=${level.x} leaving=${level.leaving} />`}
          ${waMoment && html`<i class="wa-ring" aria-hidden="true" style=${`left:${waMoment.g.x * k}px;top:${waMoment.g.y * k}px;width:${waMoment.g.w * k}px;height:${waMoment.g.h * k}px`}></i>
            <span class=${'chat-bubble' + (waMoment.g.y * k < 60 ? ' below' : '')} aria-hidden="true"
              style=${waMoment.g.y * k < 60 ? `left:${waMoment.g.x * k}px;top:${(waMoment.g.y + waMoment.g.h) * k + 10}px` : `left:${waMoment.g.x * k}px;bottom:${cssH - waMoment.g.y * k + 10}px`}>
              ${waMoment.typing ? html`<span class="typing-dots"><i></i><i></i><i></i></span>` : waMoment.message}</span>`}
        </div>`}
        ${dropping && html`<div class="drop-hint"><${Icon} name="image-plus" size=${22} /> Largue para usar como fotografia (ou sobre o logótipo para o substituir)</div>`}
      </div>
      ${mobile && html`<div class="stage-tools tools-row">${formats}<div class="stage-right">${topRight}${tools}</div></div>`}
      <div class="stage-foot" aria-live="polite">
        ${note && note.field === null && html`<p class="say stage-note">${note.text}</p>`}
        ${report && report.photoUpscale > 1.6 && html`<p class="say stage-note">Fotografia com pouca resolução neste formato.</p>`}
        <p class=${'say stage-hint' + (project.photo ? '' : ' no-photo')}>${hint}</p>
      </div>
    </main>`;
  }

  // ---------------------------------------------------------------- «Vídeo»: the stage
  // The video plays in a loop in the chosen format; «Ouvir» plays it with its
  // sound; a click pauses and resumes it. An edit keeps the time it was at.
  const SOUND_NAMES = { generated: 'música da app', own: 'som próprio', none: 'sem som' };
  // quiet: something else needs the attention (the export dialog): «Ouvir» stops.
  function VideoStage({ P, project, format, setFormat, mobile, quiet, onCover, coverReady, topRight, tools, onControls, full = false, setFull = () => {} }) {
    const wrapRef = useRef();
    const canvasRef = useRef();
    const at = useRef(0); // the time on screen
    const playbackFrame = useRef(0);
    const seekTarget = useRef(null);
    const size = useSize(wrapRef);
    const fmt = M.FORMATS[format];
    // (⛶ on a phone: the video takes the whole screen, edge to edge)
    const margin = mobile ? (full ? 0 : 24) : 72;
    const k = size.w ? Math.max(0, Math.min((size.w - margin) / fmt.w, (size.h - (mobile ? (full ? 0 : 16) : 48)) / fmt.h)) : 0;
    const cssW = Math.round(fmt.w * k), cssH = Math.round(fmt.h * k);
    const vid = project.video || M.DEFAULT_VIDEO;
    const [paused, setPaused] = useState(false);
    const [listening, setListening] = useState(false);
    const [clock, setClock] = useState(null);
    const [position, setPosition] = useState(0), [seekTick, setSeekTick] = useState(0);
    const lastPosition = useRef(0);
    const seek = (value) => { cancelAnimationFrame(playbackFrame.current); at.current = seekTarget.current = RS.production.frameTime(P, Number(value)); setPosition(at.current); setListening(false); setPaused(true); setSeekTick((v) => v + 1); };
    useEffect(() => { at.current = RS.production.frameTime(P, at.current); if (seekTarget.current !== null) seekTarget.current = RS.production.frameTime(P, seekTarget.current); setPosition(at.current); }, [P]);
    // «Ouvir» ends with the sound switched off, and while the export dialog is open
    useEffect(() => { if (vid.sound === 'none' || quiet) setListening(false); }, [vid.sound, quiet]);
    useEffect(() => { if (quiet) setPaused(true); }, [quiet]);
    useEffect(() => {
      if (!listening || !P || vid.sound === 'none') { setClock(null); return undefined; }
      let pv = null, live = true;
      (async () => {
        let src = P.timeline;
        if (vid.sound === 'own') {
          try {
            src = await A.fittedSound(vid.ownSound, P.timeline.duration);
          } catch (err) {
            toast(err.message || 'Não foi possível ler este ficheiro de som.', { kind: 'error' });
            setListening(false);
            return;
          }
        }
        if (!live || seekTarget.current !== null) return;
        pv = RS.sound.preview(src, RS.production.frameTime(P, at.current));
        setPaused(false);
        setClock(() => pv.time);
      })();
      return () => { live = false; if (pv) pv.stop(); };
    }, [listening, P, vid.sound, vid.ownSound]);
    useEffect(() => {
      const c = canvasRef.current;
      if (!P || !k || !c) return undefined;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
      if (c.width !== pw) c.width = pw;
      if (c.height !== ph) c.height = ph;
      const ctx = c.getContext('2d');
      const d = P.timeline.duration;
      const draw = (t) => { at.current = t; RS.motion.render(ctx, P, { t, scale: (cssW / fmt.w) * dpr }); if (performance.now() - lastPosition.current > 150) { lastPosition.current = performance.now(); setPosition(t); } };
      if (paused) { draw(RS.production.frameTime(P, seekTarget.current ?? at.current)); return undefined; }
      // the loop keeps going from where it was, with a short pause on the last frame
      const start = performance.now() - at.current * 1000;
      const tick = (now) => {
        if (seekTarget.current !== null) return;
        playbackFrame.current = requestAnimationFrame(tick);
        let t;
        if (clock) { t = clock(); if (t > d + 0.6) setListening(false); } else t = ((now - start) / 1000) % (d + 0.8);
        draw(Math.max(0, Math.min(t, d - 0.01)));
      };
      playbackFrame.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(playbackFrame.current);
    }, [P, k, cssW, cssH, paused, clock, seekTick]);
    const toggle = () => { seekTarget.current = null; if (listening) setListening(false); setPaused((p) => !p); };
    // the phone (2026-10-29): the video is a player — a tap shows its buttons, a tap on the
    // picture hides them, and while it plays they hide after RS.phone.HIDE_MS without a
    // touch; the editor's floating top goes with them (onControls)
    const [ctl, setCtl] = useState(true);
    const [poke, setPoke] = useState(0);
    const wake = () => { setCtl(true); setPoke((n) => n + 1); };
    const held = useRef(false); // a finger on the player: its buttons stay
    // (final review: no timer before there is a video to tap; a held finger, a focus inside
    // or an open menu keep the buttons up)
    useEffect(() => {
      if (!mobile || !ctl || paused || !P || !k) return undefined;
      const t = setTimeout(() => {
        const pl = wrapRef.current && wrapRef.current.querySelector('.player');
        if (held.current || (pl && (pl.querySelector('.menu') || pl.contains(document.activeElement)))) { setPoke((n) => n + 1); return; }
        setCtl(false);
      }, RS.phone.HIDE_MS);
      return () => clearTimeout(t);
    }, [mobile, ctl, paused, poke, P, k]);
    useEffect(() => { if (onControls) onControls(!mobile || ctl); }, [mobile, ctl]);
    useEffect(() => () => { if (onControls) onControls(true); }, []);
    if (mobile) {
      const tier = RS.phone.tier(cssW);
      const d = P ? P.timeline.duration : 0;
      const moments = P ? RS.production.videoMoments(P) : [];
      const marks = RS.phone.ticks(moments, d);
      const now = moments.filter((m) => m.time <= position + 0.01).pop();
      const max = P ? RS.production.frameTime(P, d) : 1;
      const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      // a tap on a control keeps the buttons up; a tap on the picture shows or hides them
      const onLayer = (e) => {
        if (e.target.closest && e.target.closest('button, input, select, .locales, .menu')) { wake(); return; }
        if (ctl) setCtl(false); else wake();
      };
      return html`<main class=${'workspace video-stage phone-player' + (paused ? ' paused' : '')}>
        <div class="stage" ref=${wrapRef}>
          ${!P && html`<p class="say player-wait" role="status">A preparar o vídeo…</p>`}
          ${k > 0 && P && html`<div class="poster-wrap" style=${`width:${cssW}px;height:${cssH}px`}>
            <canvas ref=${canvasRef} class="poster" data-motion=${P.style.id} style=${`width:${cssW}px;height:${cssH}px`}
              role="img" aria-label=${`Vídeo ${P.style.name}, formato ${fmt.label}.`}></canvas>
            <div class=${`player tier-${tier}` + (ctl ? ' ctl' : '')} role="group" aria-label="Leitor do vídeo" onClick=${onLayer}
              onfocusin=${wake} onPointerDown=${() => { held.current = true; if (ctl) setPoke((n) => n + 1); }}
              onPointerUp=${() => { held.current = false; }} onPointerCancel=${() => { held.current = false; }}>
              <div class="player-top">
                ${tier === 'full' && html`<${FormatSwitch} value=${format} compact=${true} onChange=${(f) => transition(() => setFormat(f))} />`}
                ${tier !== 'minimal' && topRight}
                <span class="player-gap"></span>
                ${tier !== 'minimal' && vid.sound !== 'none' && html`<button type="button" class=${'player-btn' + (listening ? ' on' : '')} aria-pressed=${listening}
                  aria-label=${listening ? 'Parar o som' : 'Ouvir o vídeo'} onClick=${() => { seekTarget.current = null; setListening(!listening); }}><${Icon} name=${listening ? 'square' : 'volume-2'} size=${16} /></button>`}
              </div>
              <button type="button" class="player-play" aria-label=${paused ? 'Continuar vídeo' : 'Pausar vídeo'} onClick=${toggle}><${Icon} name=${paused ? 'play' : 'pause'} size=${26} /></button>
              <div class="player-bottom">
                ${tier !== 'minimal' && html`<div class="player-times"><span class="player-time">${mmss(Math.min(position, d))} / ${mmss(d)}</span>
                  ${tier === 'full' && now && html`<span class="player-moment">${now.label.replace(/^\d+\.\s*/, '')}</span>`}</div>`}
                ${tier !== 'minimal' && html`<div class="player-bar" style=${`--p:${max ? (Math.min(position, max) / max) * 100 : 0}%`}>
                  <input class="player-seek" type="range" min="0" max=${max} step=${1 / 30} value=${Math.min(position, max)} disabled=${!P}
                    aria-label="Instante da pré-visualização do vídeo" aria-valuetext=${`${Math.min(position, d).toFixed(1)} de ${d} segundos`}
                    onInput=${(e) => seek(Number(e.target.value))} />
                  ${marks.map((m) => html`<i key=${m.at} class="player-tick" style=${`left:${m.at * 100}%`} title=${m.label} aria-hidden="true"></i>`)}
                </div>`}
                <div class="player-actions">
                  ${tier === 'full' && html`<button type="button" class="player-btn player-cover" aria-label="Escolher capa" disabled=${!coverReady}
                    title=${coverReady ? 'Escolher o fotograma da capa' : 'A preparar as imagens e o vídeo…'} onClick=${() => onCover(at.current)}><${Icon} name="image" size=${15} /><span>Capa</span></button>`}
                  <span class="player-gap"></span>
                  ${tier !== 'minimal' && tools}
                  <button type="button" class="player-btn player-full-btn" aria-label=${full ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'}
                    onClick=${() => setFull(!full)}><${Icon} name=${full ? 'minimize-2' : 'maximize-2'} size=${16} /></button>
                </div>
              </div>
              <i class="player-progress" aria-hidden="true" style=${`width:${max ? (Math.min(position, max) / max) * 100 : 0}%`}></i>
            </div>
          </div>`}
        </div>
      </main>`;
    }
    return html`<main class=${'workspace video-stage' + (paused ? ' paused' : '')}>
      <div class="ws-bar stage-top">
        <${FormatSwitch} value=${format} compact=${mobile} onChange=${(f) => transition(() => setFormat(f))} />
        <button class="btn sm ws-pause" onClick=${toggle} aria-label=${paused ? 'Continuar vídeo' : 'Pausar vídeo'} title=${paused ? 'Continuar vídeo' : 'Pausar vídeo'}><${Icon} name=${paused ? 'play' : 'pause'} size=${16} /></button>
        ${vid.sound !== 'none' && html`<button class=${'btn sm ws-listen' + (listening ? ' on' : '')} aria-pressed=${listening} aria-label=${listening ? 'Parar o som' : 'Ouvir o vídeo'} onClick=${() => { seekTarget.current = null; setListening(!listening); }}
          title=${listening ? 'Parar o som' : 'Ver o vídeo com o som'}>
          <${Icon} name=${listening ? 'square' : 'volume-2'} size=${15} /><span class="hide-sm">${listening ? 'Parar' : 'Ouvir'}</span></button>`}
        <div class="stage-right">${topRight}${tools}</div>
      </div>
      <div class="stage" ref=${wrapRef}>
        ${k > 0 && P && html`<div class="poster-wrap" style=${`width:${cssW}px;height:${cssH}px`}>
          <canvas ref=${canvasRef} class="poster" data-motion=${P.style.id} style=${`width:${cssW}px;height:${cssH}px;cursor:pointer`}
            role="img" aria-label=${`Vídeo ${P.style.name}, formato ${fmt.label}. Clique para ${paused ? 'continuar' : 'pausar'}.`}
            onClick=${toggle}></canvas>
          ${paused && html`<span class="stage-paused" aria-hidden="true"><${Icon} name="play" size=${30} /></span>`}
        </div>`}
      </div>
      <${VideoTimeline} prepared=${P} position=${position} onSeek=${seek} />
      <div class="ws-notes" aria-live="polite">
        <span class="note info"><${Icon} name="video" size=${15} /> <span>${P ? html`${P.style.name} · <${CountUp} value=${P.timeline.duration} /> s · ${SOUND_NAMES[vid.sound] || ''}` : 'A preparar o vídeo…'}</span></span>
        <button class="btn sm ws-pause" disabled=${!coverReady} title=${coverReady ? 'Escolher o fotograma da capa' : 'A preparar as imagens e o vídeo…'} onClick=${() => onCover(at.current)}>Escolher capa</button>
      </div>
    </main>`;
  }

  // ---------------------------------------------------------------- «Vídeo»: the panel
  // Draws its children at the end of <body>, out of the panel (whose blocks
  // animate and fold): a dialog's fixed overlay then covers the whole window.
  function BodyLayer({ children }) {
    const host = useRef(null);
    useLayoutEffect(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      host.current = el;
      return () => { render(null, el); el.remove(); host.current = null; };
    }, []);
    useLayoutEffect(() => { if (host.current) render(children, host.current); });
    return null;
  }
  // A photo of the video in a square, cropped around its point («Enquadrar»).
  function FocusThumb({ img, focus }) {
    const ref = useRef();
    useEffect(() => {
      const c = ref.current;
      if (!c || !img) return;
      c.width = c.height = 192;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 192, 192);
      RS.motionKit.cover(g, img, 0, 0, 192, 192, focus);
    }, [img, focus.x, focus.y]);
    return html`<canvas ref=${ref} aria-hidden="true"></canvas>`;
  }
  // The photos the video uses, as the stage has them (a recipe's full photos,
  // as many as it shows; a style's hero, and its cards when it has them: not
  // Cinema's or Impacto's), once each, with their ids.
  function videoPhotoList(photos, style) {
    if (!photos) return null;
    const recipe = style.recipe;
    const imgs = recipe ? (photos.full && photos.full.length ? photos.full : photos.cards || []).slice(0, recipe.photos)
      : [photos.hero, ...(style.fx.cards ? photos.cards || [] : [])];
    const out = [];
    for (const img of imgs) {
      const id = img && RS.motion.photoIdOf(img);
      if (id && !out.some((x) => x.id === id)) out.push({ id, img });
    }
    return out;
  }
  const FOCUS_STEP = 0.02;
  const r3 = (v) => Math.round(U.clamp(v, 0, 1) * 1000) / 1000;
  // «Enquadrar»: the photo large, with the point the video keeps in the centre
  // (of the frame, of a tile, of a card). Dragged with a mouse, a finger or a
  // pen, or moved with the arrow keys (Shift: bigger steps); «Centrar» goes
  // back to the default point. Every change is saved and reaches the stage: a
  // drag when it ends, the arrow keys once they stop (the video is prepared once).
  const FOCUS_KEYS_SAVE = 280;
  // piece: whose point it is ('video': video.photos.focus; 'carousel': carousel.photos.focus)
  function FramePhoto({ project, update, photo, onClose, piece = 'video' }) {
    const [closing, close] = useClosing(onClose);
    const view = piece === 'carousel' ? M.carouselFocusView(project) : project;
    const setFocus = (p, f) => (piece === 'carousel' ? M.setCarouselPhotoFocus(p, photo.id, f) : M.setVideoPhotoFocus(p, photo.id, f));
    const stored = RS.motion.photoFocus(view, photo.img) || { x: 0.5, y: 0.4 };
    const [pt, setPt] = useState(stored);
    const cur = useRef(pt);
    const canvasRef = useRef();
    const dotRef = useRef();
    const held = useRef(false);
    const later = useRef(0); // the arrow keys' move, saved once they stop
    const save = (f) => update((p) => { setFocus(p, f); }, { coalesce: `${piece}-focus` });
    const wait = () => { clearTimeout(later.current); later.current = 0; };
    const flush = () => { if (later.current) { wait(); save(cur.current); } };
    useEffect(() => flush, []); // closed before the keys' move was saved
    // the ad changed under the dialog (Ctrl+Z): the point follows it, unless it is being moved
    useEffect(() => {
      if (held.current || later.current || (cur.current.x === stored.x && cur.current.y === stored.y)) return;
      cur.current = stored;
      setPt(stored);
    }, [stored.x, stored.y]);
    useEffect(() => {
      const c = canvasRef.current, img = photo.img;
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const k = Math.min(1, 1200 / Math.max(iw, ih, 1));
      c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      if (dotRef.current) dotRef.current.focus();
    }, [photo.img]);
    const place = (f, keep = true) => {
      cur.current = f;
      setPt(f);
      if (keep) save(f);
    };
    const at = (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      return { x: r3((e.clientX - r.left) / r.width), y: r3((e.clientY - r.top) / r.height) };
    };
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      wait(); // the drag saves where it ends
      held.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
      if (dotRef.current) dotRef.current.focus();
      place(at(e), false);
    };
    const move = (e) => { if (held.current) place(at(e), false); };
    const up = (e) => { if (!held.current) return; held.current = false; place(at(e)); };
    // the browser took the pointer over (a scroll): its event has no place on the photo, the last point stays
    const cancel = () => { if (!held.current) return; held.current = false; place(cur.current); };
    const onKey = (e) => {
      const s = e.shiftKey ? FOCUS_STEP * 5 : FOCUS_STEP;
      const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
      if (!d) return;
      e.preventDefault();
      place({ x: r3(cur.current.x + d[0]), y: r3(cur.current.y + d[1]) }, false);
      wait();
      later.current = setTimeout(() => { later.current = 0; save(cur.current); }, FOCUS_KEYS_SAVE);
    };
    // «Centrar»: the photo's own default (the ad's framing, a library photo's, a little above the middle)
    const centre = () => {
      wait();
      update((p) => { setFocus(p, null); });
      place(RS.motion.photoFocus({ photo: project.photo }, photo.img) || { x: 0.5, y: 0.4 }, false);
    };
    const pc = (v) => Math.round(v * 100);
    // Ctrl+Z / Ctrl+Y (the editor's, on the window) undo the keys' move too: it is saved first
    return html`<div class=${'modal-back' + (closing ? ' closing' : '')} onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown=${(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) flush(); }}>
      <div class="modal frame-sheet" role="dialog" aria-modal="true" aria-labelledby="frame-title">
        <header class="modal-head">
          <h2 id="frame-title">Enquadrar fotografia</h2>
          <button class="icon-btn" aria-label="Fechar" onClick=${() => close()}><${Icon} name="x" /></button>
        </header>
        <div class="frame-body">
          <p class="frame-hint" id="frame-hint">Arraste o ponto para o que deve ficar ao centro, como a cara de quem está na fotografia. Com o teclado, mova-o com as setas.</p>
          <div class="frame-photo" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${cancel}>
            <canvas ref=${canvasRef} aria-hidden="true"></canvas>
            <div ref=${dotRef} class="frame-dot" role="slider" tabindex="0" aria-label="Ponto que fica ao centro" aria-describedby="frame-hint"
              aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pc(pt.x)} aria-valuetext=${`${pc(pt.x)} % da esquerda, ${pc(pt.y)} % do topo`}
              style=${`left:${pt.x * 100}%;top:${pt.y * 100}%`} onKeyDown=${onKey} onBlur=${flush}></div>
          </div>
          <div class="frame-actions">
            <button type="button" class="btn ghost" onClick=${centre}><${Icon} name="crosshair" size=${16} /> Centrar</button>
            <button type="button" class="btn primary" onClick=${() => close()}><${Icon} name="check" size=${16} /> Feito</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  // «Fotografias»: the photos the video uses, each with «Enquadrar». style:
  // the model (RS.motion.styleOf; a recipe's has its definition in .recipe).
  function VideoFraming({ project, update, photos, style }) {
    const [open, setOpen] = useState(null); // { id, img, from }
    const list = videoPhotoList(photos, style);
    const shut = () => {
      const { id, from } = open;
      setOpen(null);
      const b = from && from.isConnected ? from : document.querySelector(`.vf-item[data-photo-id="${CSS.escape(id)}"]`);
      if (b) requestAnimationFrame(() => b.focus());
    };
    if (!list) return html`<div class="vf-grid" aria-busy="true" aria-label="A carregar as fotografias do vídeo">${[0, 1, 2].map((i) => html`<span key=${i} class="lib-skel"></span>`)}</div>`;
    if (!list.length) return null;
    return html`<div class="video-framing">
      <p class="vf-head">No vídeo: toque numa fotografia para a enquadrar.</p>
      <div class="vf-grid">${list.map((it, i) => html`<button key=${it.id} type="button" class="vf-item" data-photo-id=${it.id}
          aria-label=${`Enquadrar a fotografia ${i + 1} do vídeo`} onClick=${(e) => setOpen({ ...it, from: e.currentTarget })}>
          <${FocusThumb} img=${it.img} focus=${RS.motion.photoFocus(project, it.img) || { x: 0.5, y: 0.4 }} />
          <span class="vf-label"><${Icon} name="crosshair" size=${14} /> Enquadrar</span></button>`)}</div>
      ${open && html`<${BodyLayer}><${FramePhoto} key=${open.id} project=${project} update=${update} photo=${open} onClose=${shut} /><//>`}
    </div>`;
  }
  // Photos the person picks for the video (library and «As minhas», up to eight,
  // in the order picked). The carousel uses it too: max = its style's photos,
  // where = 'carrossel' (with one photo, another tap replaces it).
  function VideoPhotos({ project, ids, onChange, max = M.MAX_VIDEO_PHOTOS, where = 'vídeo' }) {
    const [lib, setLib] = useState(null);
    const [mine, setMine] = useState([]);
    const [query, setQuery] = useState(''), [favorite, setFavorite] = useState(false);
    useEffect(() => {
      L.index().then(setLib).catch(() => setLib({ items: [] }));
      L.userItems().then(setMine).catch(() => {});
    }, []);
    const adCats = (project.trades || []).map((id) => TR.get(id) && TR.get(id).photo).filter(Boolean);
    const bundled = lib ? lib.items : [];
    const list = L.filter([...bundled.filter((i) => adCats.includes(i.cat)), ...bundled.filter((i) => !adCats.includes(i.cat))]
      .map((i) => ({ ...i, key: i.id, name: `${TR.list.find((t) => t.photo === i.cat)?.label || 'Fotografia'} · ${i.id}` }))
      .concat(mine.map((m) => ({ ...m, key: m.asset }))), { query, favorite });
    const full = max > 1 && ids.length >= max;
    const toggle = (key) => onChange(ids.includes(key) ? ids.filter((x) => x !== key) : max === 1 ? [key] : [...ids, key]);
    return html`<div class="video-photos">
      <label class="lib-search">Pesquisar fotografias do ${where}<input type="search" value=${query} onInput=${(e) => setQuery(e.target.value)} /></label><label class="check"><input type="checkbox" checked=${favorite} onChange=${(e) => setFavorite(e.target.checked)} /> Só as minhas favoritas</label>
      ${!lib ? html`<div class="lib-grid" aria-busy="true" aria-label="A carregar a biblioteca">${[0, 1, 2, 3, 4, 5].map((i) => html`<span key=${i} class="lib-skel"></span>`)}</div>`
      : html`<div class="lib-grid">${list.map((it) => {
        const n = ids.indexOf(it.key) + 1;
        return html`<button key=${it.key} type="button" class=${'lib-item' + (n ? ' picked' : '')} aria-pressed=${n > 0} disabled=${!n && full}
          aria-label=${n ? `${L.label(it)}, fotografia ${n} do ${where} (tocar para tirar)` : `Usar ${L.label(it)} no ${where}`} onClick=${() => toggle(it.key)}>
          <img src=${it.thumb} alt="" loading="lazy" />${n > 0 && html`<span class="pick-n" aria-hidden="true">${n}</span>`}</button>`;
      })}</div>`}
      ${lib && !list.length && html`<p class="lib-empty">Não há fotografias para estes filtros.</p>`}
      <small class="field-hint"><${CountUp} value=${ids.length} duration=${300} /> de ${max}. ${max > 1 ? `Entram no ${where} por esta ordem. ` : 'Outro toque troca-a. '}A pesquisa não retira fotografias já escolhidas.</small>
    </div>`;
  }
  // The video's sections of the rail: «Estilo» (the recipes and styles, colours,
  // letters, background), «Sequência» (the length, «Textos do vídeo», sound and
  // ending) and «Fotos» (the photos and «Enquadrar»). onSection: go to another one.
  function VideoPanel({ project, update, images, photos, P, vKey, section, onSection, onEditImage }) {
    const vid = project.video || M.DEFAULT_VIDEO;
    const style = RS.motion.styleOf(vid.motion);
    const recipe = !!style.recipe;
    // only the settings that act on this video: «Cartaz animado» plays the poster as it is
    const poster = !!style.poster;
    const usesPhotos = recipe ? style.recipe.photos > 0 : !poster;
    const setVideo = (patch, coalesce) => update((p) => { p.video = { ...M.DEFAULT_VIDEO, ...(p.video || {}), ...patch }; }, coalesce ? { coalesce } : {});
    const setShow = (patch) => update((p) => {
      p.video = { ...M.DEFAULT_VIDEO, ...(p.video || {}) };
      p.video.show = { ...M.DEFAULT_VIDEO_SHOW, ...(p.video.show || {}), ...patch };
    });
    // The length stays when the new model has it («Automática» too) — but Curto's 6 s is Curto's own.
    const pick = (s) => {
      const has = vid.duration === 'auto' ? s.durations.length > 1 : s.durations.includes(vid.duration);
      const keep = has && !(style.id === 'curto' && s.id !== 'curto');
      setVideo({ motion: s.id, duration: keep ? vid.duration : s.defaultDuration, bg: s.bgModes[0] });
    };
    const shown = RS.motion.STYLES.filter((s) => !s.test);
    const seg = (items, value, onPick, aria) => html`<div class="seg small" role="radiogroup" aria-label=${aria}>
      ${items.map(([v, l, title]) => html`<button key=${v} role="radio" aria-checked=${value === v} class=${value === v ? 'on' : ''} title=${title || ''}
        onClick=${() => onPick(v)}>${l}</button>`)}</div>`;
    // «Fotografias»: the trades' photos, or the ones picked
    const [choosing, setChoosing] = useState(() => !!chosenPhotos(project));
    const picked = chosenPhotos(project) || [];
    // the list changes, each photo's point («Enquadrar») stays
    const setPhotoList = (mode, ids) => update((p) => {
      p.video = { ...M.DEFAULT_VIDEO, ...(p.video || {}) };
      p.video.photos = { ...(p.video.photos || {}), mode, ids };
    });
    const setPhotos = (mode) => {
      setChoosing(mode === 'chosen');
      if (mode === 'trades') setPhotoList('trades', []);
    };
    // «Som»: the person's own file
    const [soundInfo, setSoundInfo] = useState(null);
    useEffect(() => {
      let live = true;
      if (vid.ownSound) A.audioInfo(vid.ownSound).then((i) => { if (live) setSoundInfo(i); });
      else setSoundInfo(null);
      return () => { live = false; };
    }, [vid.ownSound]);
    async function chooseOwnSound() {
      const f = await U.pickFile('audio/*,.mp3,.m4a');
      if (!f) return;
      try {
        const a = await A.importAudio(f);
        setVideo({ sound: 'own', ownSound: a.id });
        setSoundInfo({ id: a.id, name: a.name, duration: a.duration });
        toast(`Som «${a.name}» pronto. Fica ajustado à duração do vídeo.`);
      } catch (err) {
        toast(err.message || 'Não foi possível ler este ficheiro de som.', { kind: 'error' });
        setVideo({ sound: 'generated' });
      }
    }
    // «Um som meu» asks for a file the first time (and when it is already chosen).
    const pickSound = (v) => {
      if (v === 'own' && (!vid.ownSound || vid.sound === 'own')) { chooseOwnSound(); return; }
      setVideo({ sound: v });
    };
    // What this video cannot show (too little time, or no such scene in the style).
    const lost = P && RS.motion.leftOut(P);
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const lostText = lost && [
      lost.benefits && count(lost.benefits, 'vantagem', 'vantagens'),
      lost.highlights && count(lost.highlights, 'destaque', 'destaques'),
      lost.positions && count(lost.positions, 'vaga da lista', 'vagas da lista'),
      lost.intro && 'a introdução',
      lost.chat && 'a conversa no WhatsApp',
      lost.closing && 'a frase final',
    ].filter(Boolean);
    const several = lostText && (lostText.length > 1 || lost.benefits > 1 || lost.highlights > 1 || lost.positions > 1);
    const listed = lostText && (lostText.length > 1 ? `${lostText.slice(0, -1).join(', ')} e ${lostText[lostText.length - 1]}` : lostText[0]);
    // at the longest length (or on «Automática», which already gives all it can) only fewer lines help
    const longest = Math.max(...style.durations);
    const advice = style.durations.length === 1 ? 'Escolha outro modelo, com mais tempo.'
      : vid.duration !== 'auto' && P && P.timeline.duration < longest ? 'Escolha «Automática» ou uma duração maior.'
      : 'Tire algumas linhas dos textos, mais abaixo, ou escolha outro modelo.';
    const lostNote = lostText && lostText.length > 0 && html`<p class="video-note"><${Icon} name="info" size=${15} /> <span>Não cabe tudo em ${P.timeline.duration} s: ${several ? 'ficam' : 'fica'} de fora ${listed}. ${advice}</span></p>`;
    const gallery = (list, label) => html`<${MotionPicker} project=${project} images=${images} photos=${photos} value=${vid.motion} onChange=${pick} list=${list} label=${label} />`;
    // «Receitas» and «Estilos» fold: when the tab opens, the one holding the chosen model is open
    // and the other names it; a pick changes neither (the card tapped stays where it is)
    const galleryGroup = (title, mine) => html`<${Group} title=${title} fold=${`video:${title === 'Receitas' ? 'receitas' : 'estilos'}`} closed=${!mine}
      summary=${mine ? style.name : `Em uso: ${style.name}`}>${gallery(shown.filter((s) => !!s.recipe === (title === 'Receitas')), title)}<//>`;
    // «Fotografias» (part of the model): the trades' photos or the ones picked, each with «Enquadrar»
    const photosBlock = usesPhotos && html`<${Group} where="vídeo" title="Fotografias">
      ${seg([['trades', 'Das funções do anúncio'], ['chosen', 'Escolher']], choosing ? 'chosen' : 'trades', setPhotos, 'Fotografias do vídeo')}
      <${VideoFraming} project=${project} update=${update} photos=${photos} style=${style} />
      ${choosing && html`<${VideoPhotos} project=${project} ids=${picked} onChange=${(ids) => setPhotoList(ids.length ? 'chosen' : 'trades', ids)} />`}
    <//>`;
    const vs = vid.show || M.DEFAULT_VIDEO_SHOW;
    const [title] = { estilo: ['Estilo', 'O modelo do vídeo, as cores e a letra.'], sequencia: ['Sequência', 'A duração, os textos e o som do vídeo.'],
      fotos: ['Fotos', 'As fotografias do vídeo e o enquadramento de cada uma.'] }[section] || ['Vídeo', ''];
    // «Fotos» of a model without photos says so and where to change it
    const noPhotos = poster ? html`<div class="video-note"><${Icon} name="info" size=${15} />
        <span>O Cartaz animado usa a fotografia da imagem. <button type="button" class="btn link sm" onClick=${onEditImage}>Editar a imagem</button></span></div>`
      : html`<div class="video-note"><${Icon} name="info" size=${15} />
        <span>Este estilo não usa fotografias. <button type="button" class="btn link sm" onClick=${() => onSection('estilo')}>Mudar de estilo</button></span></div>`;
    return html`<div class="panel-inner">
      <div class="panel-head"><h2>${title}</h2>
        <span class="panel-meta">${style.name}${P ? html`, <${CountUp} value=${P.timeline.duration} /> s` : ''}</span></div>
      <div class="video-section" data-section=${section}>
        ${section === 'fotos' && (photosBlock || noPhotos)}
        ${section === 'estilo' && html`
          ${galleryGroup('Receitas', recipe)}
          ${galleryGroup('Estilos', !recipe)}
          <p class="field-hint">${style.concept || ''}</p>`}
        ${section === 'sequencia' && html`
          <${Group} id="video-duration" where="vídeo" title="Duração">
            <${VideoLengths} project=${project} P=${P} vKey=${vKey} onPick=${(d) => setVideo({ duration: d })} />
            ${lostNote}
          <//>
          <${VideoTexts} project=${project} update=${update} style=${style} onEditImage=${onEditImage} />`}
        ${section === 'estilo' && html`
          ${poster ? html`<${Group} where="vídeo" title="Animação">
            ${seg([['dynamic', 'Dinâmico', 'Entradas rápidas, selo a carimbar e contacto a pulsar'], ['soft', 'Suave', 'Só aparições suaves e movimentos curtos']], vid.style, (s) => setVideo({ style: s }), 'Animação do cartaz')}
          <//>` : html`<${Group} where="vídeo" title="Cores">
            <div class="video-colors">
              ${seg([['style', recipe ? 'Cores da receita' : 'Cores do estilo'], ['brand', 'Cores da marca', 'As cores principal e de destaque do anúncio']], vid.colors === 'brand' || vid.colors === 'style' ? vid.colors : null, (c) => setVideo({ colors: c }), 'Cores do vídeo')}
            </div>
            <div class="palettes video-palettes" role="radiogroup" aria-label="Paletas prontas">
              ${M.PALETTES.map((pl) => html`<button key=${pl.id} type="button" role="radio" aria-checked=${vid.colors === pl.id} class=${'palette' + (vid.colors === pl.id ? ' on' : '')}
                title=${pl.name} aria-label=${`Paleta ${pl.name}`} onClick=${() => setVideo({ colors: pl.id })}>
                <span style=${`background:${pl.primary}`}></span><span style=${`background:${pl.accent}`}></span></button>`)}
            </div>
            <div class="video-accent">
              <${ColorField} id="f-video-accent" label="Cor de destaque" value=${(P && P.C && P.C.accentChosen) || style.palette.accent}
                onChange=${(v, live) => setVideo({ accent: v }, live ? 'video-accent' : undefined)} />
              ${vid.accent && html`<button type="button" class="btn link sm" onClick=${() => setVideo({ accent: null })}><${Icon} name="rotate-ccw" size=${14} /> Repor</button>`}
            </div>
            ${P && P.C && P.C.accent !== P.C.accentChosen && html`<small class="field-hint">No vídeo fica <span class="hex-chip" style=${`background:${P.C.accent}`}></span> ${P.C.accent} para se ler bem neste fundo.</small>`}
            <small class="field-hint">O botão do WhatsApp fica sempre verde.</small>
          <//>`}
          ${!poster && html`<${Group} where="vídeo" title="Letra">
            <select id="f-video-font" aria-label="Letra do vídeo" value=${vid.font || ''} onChange=${(e) => setVideo({ font: e.target.value || null })}>
              <option value="">${recipe ? 'Da receita' : 'Do estilo'}</option>
              ${Object.entries(M.FONTS).map(([id, f]) => html`<option key=${id} value=${id}>${f.label}</option>`)}
            </select>
          <//>`}
          ${style.bgModes.length > 1 && html`<${Group} where="vídeo" title="Fundo">
            ${seg([['light', 'Claro'], ['dark', 'Escuro']], style.bgModes.includes(vid.bg) ? vid.bg : style.bgModes[0], (b) => setVideo({ bg: b }), 'Fundo do vídeo')}
          <//>`}`}
        ${section === 'sequencia' && html`
          <${Group} where="vídeo" title="Som">
            ${seg(SOUND_OPTIONS, vid.sound, pickSound, 'Som do vídeo')}
            ${vid.sound === 'own' && soundInfo && html`<p class="sound-file"><${Icon} name="music" size=${15} /> <span>${soundInfo.name} · ${Math.round(soundInfo.duration)} s</span>
              <button type="button" class="btn link sm" onClick=${chooseOwnSound}>Trocar</button></p>`}
            <small class="field-hint">${vid.sound === 'none' ? 'Sem som: junte a música na app do Instagram, que tem músicas licenciadas e dá mais alcance.'
              : vid.sound === 'own' ? 'Use só músicas que pode publicar. O som é ajustado à duração do vídeo, com um final suave.'
              : 'Música criada pela app: pode publicar sem problemas de direitos.'} «Ouvir» está por cima do vídeo.</small>
          <//>
          ${!poster && html`<${Group} where="vídeo" title="Contacto no fim" hint="O cartão do WhatsApp fica parado no fim, para dar tempo de o ler.">
            ${seg([[2, '2 s'], [4, '4 s']], vid.hold === 4 ? 4 : 2, (h) => setVideo({ hold: h }), 'Tempo do contacto no fim')}
            <label class="switch video-qr"><input type="checkbox" checked=${vs.qr !== false} onChange=${(e) => setShow({ qr: e.target.checked })} /><span class="switch-ui"></span> Código QR no cartão</label>
          <//>`}
          ${poster && html`<p class="field-hint">O Cartaz animado acaba como a imagem: o contacto e o código QR são os dela.</p>`}`}
      </div>
    </div>`;
  }

  // «Duração»: 10–30 s and «Automática · N s» (and 6 s where the model has
  // it). A length the information cannot fill is greyed, with how much more
  // to write: a video is never stretched, slowed down or repeated.
  function VideoLengths({ project, P, vKey, onPick }) {
    const vid = project.video || M.DEFAULT_VIDEO;
    // a style is measured with the photos the stage uses
    const photos = P && P.content ? P.content.photos : undefined;
    const L = useMemo(() => RS.motion.lengths(project, { locale: project.locale, photos }), [vKey, photos]);
    // what makes a video longer: a style grows with benefits, a recipe with benefits or highlights
    const more = (n, adds = L.adds) => (adds === 'benefits' ? `${n} ${n === 1 ? 'vantagem' : 'vantagens'}`
      : `${n} ${n === 1 ? 'vantagem ou destaque' : 'vantagens ou destaques'}`);
    const why = (o) => `Escreva mais ${more(o.missing)} para chegar aos ${o.value} s`;
    // the ad's other languages: a fixed length one of them cannot fill is named
    // (measured once the edits settle; «Automática» fits each language by itself)
    const settled = useSettled(project, 300);
    const others = useMemo(() => {
      const d = (settled.video || {}).duration;
      if (typeof d !== 'number' || d <= 10) return [];
      return settled.locales.filter((code) => code !== settled.locale).map((code) => {
        const Lc = RS.motion.lengths(settled, { locale: code, photos });
        const o = Lc.options.find((x) => x.value === d);
        return o && !o.ok ? { code, missing: o.missing, adds: Lc.adds, d } : null;
      }).filter(Boolean);
    }, [videoKey(settled), photos]);
    const auto = L.options.find((o) => o.value === 'auto');
    const fixed = L.options.filter((o) => o.value !== 'auto');
    const chosen = L.options.find((o) => o.value === vid.duration);
    const value = chosen ? vid.duration : auto ? 'auto' : fixed[0].value;
    const lost = fixed.filter((o) => !o.ok);
    const worst = lost[lost.length - 1];
    const radio = (o, label, cls) => html`<button key=${o.value} type="button" role="radio" aria-checked=${value === o.value}
      class=${(cls || '') + (value === o.value ? ' on' : '')} disabled=${!o.ok} title=${o.ok ? '' : why(o)} onClick=${() => onPick(o.value)}>${label}</button>`;
    return html`<div class="lengths" role="radiogroup" aria-label="Duração do vídeo">
        ${auto && radio(auto, html`<span>Automática</span><small>· <${CountUp} value=${auto.seconds} /> s</small>`, 'len-auto')}
        <div class="seg small len-fixed">${fixed.map((o) => radio(o, `${o.value} s`))}</div>
      </div>
      ${auto && html`<small class="field-hint">«Automática» dá o tempo que os textos pedem, entre 10 e 30 s.</small>`}
      ${chosen && !chosen.ok && P && html`<p class="video-note"><${Icon} name="info" size=${15} /> <span>Com estes textos o vídeo só chega aos ${P.timeline.duration} s.</span></p>`}
      ${worst && html`<p class="length-note"><${Icon} name="pencil" size=${14} /> <span>${why(worst)}.</span></p>`}
      ${others.map((x) => {
        const l = M.localeInfo(x.code);
        return html`<p key=${x.code} class="length-note length-other"><${Icon} name="languages" size=${14} /> <span>Em ${l.label} (${l.short}) faltam ${more(x.missing, x.adds)} para chegar aos ${x.d} s.</span></p>`;
      })}`;
  }

  // «Textos do vídeo», one language at a time: every field starts as the
  // image's and follows it until he changes it here (for the video only);
  // lists follow the image item by item. Model words are under «Textos do modelo».
  const MODEL_WORDS = {
    board: 'Cabeçalho do painel', benefit: 'Linha das vantagens', role: 'Função', gate: 'Embarque', pass: 'Título do cartão',
    clock: 'Hora no ecrã', now: 'Quando chega a mensagem', title: 'Título do contrato', signature: 'Linha da assinatura',
    stamp: 'Carimbo', benefits: 'Palavra «vantagens»',
  };
  const VIDEO_LISTS = ['benefits', 'highlights', 'positions', 'contacts'];
  // piece: 'video' or 'carousel' (each has its own texts and eyes, following the
  // ad until changed); only: the blocks to show (a carousel slide's own texts).
  function VideoTexts({ project, update, style, lostNote, onEditImage, piece = 'video', only = null }) {
    const isVideo = piece === 'video';
    if (style.poster) {
      return html`<div class="video-note"><${Icon} name="info" size=${15} />
        <span>O Cartaz animado mostra a imagem tal como está: mude os textos na imagem. <button type="button" class="btn link sm" onClick=${onEditImage}>Editar a imagem</button></span></div>`;
    }
    const code = project.locale;
    const loc = M.localeInfo(code);
    const vid = isVideo ? project.video || M.DEFAULT_VIDEO : M.cleanCarousel(project.carousel, project);
    const vs = vid.show || (isVideo ? M.DEFAULT_VIDEO_SHOW : {});
    const vt = (vid.texts || {})[code] || {};
    // the piece's own record, ready to be changed
    const ownOf = (p) => {
      const o = isVideo ? { ...M.DEFAULT_VIDEO, ...(p.video || {}) } : { ...M.cleanCarousel(p.carousel, p) };
      o.show = isVideo ? { ...M.DEFAULT_VIDEO_SHOW, ...(o.show || {}) } : { ...(o.show || {}) };
      p[piece] = o;
      return o;
    };
    const img = RS.motionTimeline.imageTexts(project, code, piece);
    const def = style.recipe;
    // a change to this language's texts; an emptied text stays (it blanks the
    // field in the video), lists and model words left with nothing are dropped
    const edit = (fn, coalesce) => update((p) => {
      const rec = ownOf(p);
      const all = { ...(rec.texts || {}) };
      const cur = { ...(all[code] || {}) };
      fn(cur, p);
      for (const k of VIDEO_LISTS) {
        const l = cur[k];
        if (l && !Object.keys(l.edits || {}).length && !(l.added || []).length && !(l.order || []).length) delete cur[k];
      }
      if (cur.model) {
        for (const id of Object.keys(cur.model)) if (!Object.keys(cur.model[id]).length) delete cur.model[id];
        if (!Object.keys(cur.model).length) delete cur.model;
      }
      if (Object.keys(cur).length) all[code] = cur; else delete all[code];
      rec.texts = all;
    }, coalesce ? { coalesce } : {});
    const eyeOn = (key) => (typeof vs[key] === 'boolean' ? vs[key] : (project.show || {})[key] !== false);
    const setEye = (key, on) => update((p) => { const rec = ownOf(p); rec.show = { ...rec.show, [key]: on }; });
    const own = (key) => typeof vt[key] === 'string';
    const word = isVideo ? 'vídeo' : 'carrossel'; // the piece these texts belong to, in the sentences
    const text = (key, label, o = {}) => html`<${VtField} id=${`vt-${key}`} label=${label} solo=${o.solo} multiline=${o.multiline} blank=${o.blank || `Fica em branco no ${word}.`}
      value=${own(key) ? vt[key] : !isVideo && key === 'closing' ? RS.motionTimeline.carouselClosing(project, code) : img[key]} edited=${own(key) && o.reset !== false} placeholder=${o.placeholder || ''} hint=${o.hint}
      ownLabel=${isVideo ? 'Só no vídeo' : 'Só no carrossel'}
      onInput=${(v) => edit((c, p) => { if (o.onType) o.onType(c, p, v); c[key] = v; }, `vt:${code}:${key}`)}
      onReset=${() => edit((c) => { delete c[key]; })} />`;
    // a style shows the salary and the vacancies only (its counter): no highlights of his own there
    const fixedHl = !def;
    const listItems = (kind) => (kind === 'highlights' && fixedHl ? img.highlights.filter((x) => x.role === 'salary' || x.role === 'vacancies') : img[kind]);
    const list = (kind, addLabel, itemLabel, placeholder) => html`<${VtList} where=${word} kind=${kind} items=${listItems(kind)} override=${vt[kind]} hl=${kind === 'highlights'}
      own=${!(kind === 'highlights' && fixedHl)} addLabel=${addLabel} itemLabel=${itemLabel} placeholder=${placeholder} onChange=${(fn, coalesce) => edit((c) => { c[kind] = fn(c[kind]); }, coalesce)} />`;
    // in «Sequência» (only) the row's eye is the block's: the cover's «Chamada» keeps its own
    const block = (key, title, eyeKey, body, hint) => {
      if (only && !only.includes(key)) return null;
      const eye = only && eyeKey !== 'kicker' ? null : eyeKey;
      return html`<${Group} id=${`vt-block-${key}`} title=${title} where=${isVideo ? 'vídeo' : 'carrossel'} hint=${hint}
        show=${eye ? eyeOn(eye) : undefined} onToggle=${eye ? (on) => setEye(eye, on) : undefined}>${body}<//>`;
    };
    // the closing line shows once he writes it (it has no image text)
    const showClosing = (c, p, v) => {
      if (isVideo && v.trim() && !String(vt.closing || '').trim()) p.video.show.closing = true;
    };
    const words = def && def.labels ? Object.keys(def.labels) : [];
    const mine = (vt.model || {})[def ? def.id : ''] || {};
    const setWord = (key, v) => edit((c) => {
      const m = { ...(c.model || {}) };
      m[def.id] = { ...(m[def.id] || {}) };
      if (v === undefined) delete m[def.id][key]; else m[def.id][key] = v;
      c.model = m;
    }, v === undefined ? undefined : `vt:${code}:model:${key}`);
    const resetAll = () => {
      edit((c) => { for (const k of Object.keys(c)) delete c[k]; });
      toast(`Os textos do vídeo em ${loc.label} voltaram a ser os da imagem. Pode desfazer com Ctrl+Z.`);
    };
    return html`<div class="vt-panel">
      ${!only && html`<div class="vt-top">
        <div class="vt-langs">
          <span class="vt-langs-label">Língua</span>
          <div class="texts-locales chips-row small" role="radiogroup" aria-label="Língua dos textos do vídeo">
            ${project.locales.map((c) => {
              const l = M.localeInfo(c);
              return html`<button key=${c} type="button" role="radio" aria-checked=${c === code} class=${'tchip' + (c === code ? ' on' : '')}
                title=${`Textos do vídeo em ${l.label}`} onClick=${() => update((p) => { p.locale = c; }, { coalesce: 'locale' })}>${l.short}</button>`;
            })}
          </div>
        </div>
        <button type="button" class="btn link sm vt-reset-all" disabled=${!Object.keys(vt).length} onClick=${resetAll}
          title=${`Todos os textos do vídeo em ${loc.label} voltam a ser os do anúncio`}><${Icon} name="rotate-ccw" size=${14} /> Repor tudo do anúncio</button>
      </div>`}
      ${!only && html`<p class="group-hint vt-intro">Começam iguais aos da imagem. O que mudar aqui fica só no vídeo em ${loc.label}.</p>`}
      ${lostNote}
      ${block('kicker', 'Chamada', 'kicker', text('kicker', 'Chamada', { solo: true }))}
      ${block('headline', 'Título', null, text('headline', 'Título', { solo: true, multiline: true, blank: `Em branco: o ${word} mostra o nome da empresa ou a primeira vantagem.` }))}
      ${def && block('intro', 'Introdução', 'intro', text('intro', 'Introdução', { solo: true, multiline: true }))}
      ${block('benefits', 'Vantagens', 'benefits', list('benefits', 'Adicionar vantagem', 'Vantagem', 'Ex.: Carrinha da empresa'))}
      ${block('highlights', 'Destaques', 'highlights', list('highlights', 'Adicionar destaque', 'Destaque'),
        fixedHl ? `Este estilo mostra o salário e as vagas. As receitas mostram também o selo e os seus destaques.`
          : 'Números em destaque, como «1900 €» · «por mês» ou «40 h» · «por semana». Só um número simples conta até ao valor.')}
      ${block('positions', 'Vagas', 'positions', html`
        ${text('positionsTitle', 'Título da lista', { placeholder: (M.STOCK.positionsTitle || {})[code] || '' })}
        ${list('positions', 'Adicionar vaga', 'Vaga', 'Ex.: Pintor de construção civil')}`)}
      ${def && block('chat', 'Conversa no WhatsApp', 'chat', text('message', 'Mensagem', { solo: true, multiline: true }),
        isVideo ? 'A mensagem que aparece a ser escrita e enviada no vídeo.' : 'A mensagem que aparece na conversa do carrossel.')}
      ${block('contacts', 'Contactos', 'contacts', list('contacts', 'Adicionar contacto', 'Contacto', 'Ex.: emprego@empresa.pt'),
        `Oculto, o ${word} também acaba sem o cartão do WhatsApp.`)}
      ${block('button', 'Botão e dica', null, html`
        ${text('cta', 'Botão do WhatsApp')}
        ${text('hint', 'Dica do código QR')}`)}
      ${def && block('closing', 'Frase final', 'closing', text('closing', 'Frase final', { solo: true, reset: false, placeholder: 'Ex.: Começa já na segunda-feira', onType: showClosing }),
        'Uma frase sua antes do contacto.')}
      ${block('brand', 'Nome da empresa', null, text('brandName', 'Nome da empresa', { solo: true, placeholder: 'Nome da empresa' }))}
      ${words.length > 0 && block('model', 'Textos do modelo', null, words.map((key) => {
        const d = def.labels[key] || {};
        const mineSet = typeof mine[key] === 'string';
        return html`<${VtField} key=${key} id=${`vt-model-${key}`} label=${MODEL_WORDS[key] || d['pt-PT'] || key} value=${mineSet ? mine[key] : (d[code] || d['pt-PT'] || '')}
          edited=${mineSet} resetLabel="Repor" blank="Em branco: o modelo não mostra esta palavra." onInput=${(v) => setWord(key, v)} onReset=${() => setWord(key, undefined)} />`;
      }), `Palavras que só o modelo ${style.name} usa, já traduzidas.`)}
    </div>`;
  }
  // One text of the video: the image's until he writes his own («Repor da imagem»).
  // blank: what an emptied text does in the video (said under the field)
  function VtField({ id, label, value, edited, onInput, onReset, multiline, placeholder, hint, solo, resetLabel = 'Repor do anúncio', ownLabel = 'Só no vídeo', blank = 'Fica em branco no vídeo.' }) {
    return html`<div class=${'field vt-field' + (edited ? ' edited' : '') + (solo ? ' solo' : '')}>
      <div class="vt-label"><label for=${id} class=${solo ? 'sr-only' : ''}>${label}</label>
        ${edited && html`<span class="vt-own">${ownLabel}</span>`}
        ${edited && onReset && html`<button type="button" class="btn link sm vt-reset" onClick=${onReset} title="Voltar ao texto de origem"><${Icon} name="rotate-ccw" size=${13} /> ${resetLabel}</button>`}</div>
      ${multiline ? html`<${AutoTextarea} id=${id} value=${value} placeholder=${placeholder} onInput=${(e) => onInput(e.target.value)} />`
        : html`<input id=${id} type="text" value=${value} placeholder=${placeholder} onInput=${(e) => onInput(e.target.value)} />`}
      ${edited && !String(value || '').trim() && html`<small class="field-hint vt-blank">${blank}</small>`}
      ${hint && html`<small class="field-hint">${hint}</small>`}
    </div>`;
  }
  // A list of the video: the image's items (changed, taken out and brought
  // back one by one) and his own; a highlight is a value and a label.
  const HL_ROLES = { salary: 'Salário', vacancies: 'Vagas', badge: 'Selo' };
  // examples in the empty fields: value · label of each kind of highlight
  const HL_EXAMPLES = { salary: ['1900 €', 'por mês'], vacancies: ['12', 'vagas'], badge: ['Início imediato', 'opcional'], own: ['40 h', 'por semana'] };
  // own: his own items can be added (and are shown)
  // where: the piece the list belongs to ('vídeo' | 'carrossel'), in its words
  function VtList({ kind, items, override, onChange, hl, addLabel, itemLabel, placeholder, own = true, where = 'vídeo' }) {
    const ov = override || {};
    const edits = ov.edits || {};
    const added = ov.added || [];
    const pendingFocus = useRef(null);
    const listRef = useRef();
    const exits = RS.ui.useExits();
    const arrived = RS.ui.useArrivals([...items.map((it) => it.id), ...(own ? added.map((it) => it.id) : [])]);
    RS.ui.useFlip(listRef);
    useEffect(() => {
      if (!pendingFocus.current) return;
      const el = document.getElementById(pendingFocus.current);
      pendingFocus.current = null;
      if (el) el.focus();
    });
    // each change applies to the list as saved, so two quick edits never undo each other
    const change = (fn, coalesce) => onChange((l) => {
      const next = { edits: { ...((l && l.edits) || {}) }, added: [...((l && l.added) || [])], order: (l && l.order) || null };
      fn(next);
      return next;
    }, coalesce);
    const has = (id) => Object.prototype.hasOwnProperty.call(edits, id);
    // patch: { text } | { value } | { label }; null takes the item out of the video
    const editImage = (id, patch, coalesce) => change((l) => {
      if (patch === null) l.edits[id] = null;
      else l.edits[id] = hl ? { ...(l.edits[id] || {}), ...patch } : patch.text;
    }, coalesce);
    const resetImage = (id) => change((l) => { delete l.edits[id]; });
    const editAdded = (id, patch, coalesce) => change((l) => { l.added = l.added.map((x) => (x.id === id ? { ...x, ...patch } : x)); }, coalesce);
    const removeAdded = (id) => exits.exit(id, () => change((l) => { l.added = l.added.filter((x) => x.id !== id); }));
    const add = () => {
      const id = M.item('').id;
      pendingFocus.current = `vt-${kind}-${id}`;
      change((l) => { l.added.push(hl ? { id, role: 'own', value: '', label: '' } : { id, text: '' }); });
    };
    const name = (it) => (hl ? [it.value, it.label].filter(Boolean).join(' ') : it.text) || itemLabel;
    const fields = (it, cur, onEdit) => (hl ? html`
        <input id=${`vt-${kind}-${it.id}`} class="vt-hl-value" type="text" value=${cur.value} placeholder=${(HL_EXAMPLES[it.role] || HL_EXAMPLES.own)[0]}
          aria-label=${`Valor: ${HL_ROLES[it.role] || itemLabel}`} onInput=${(e) => onEdit({ value: e.target.value }, 'value')} />
        <input id=${`vt-${kind}-${it.id}-label`} class="vt-hl-label" type="text" value=${cur.label} placeholder=${(HL_EXAMPLES[it.role] || HL_EXAMPLES.own)[1]}
          aria-label=${`Legenda: ${HL_ROLES[it.role] || itemLabel}`} onInput=${(e) => onEdit({ label: e.target.value }, 'label')} />`
      : html`<input id=${`vt-${kind}-${it.id}`} type="text" value=${cur.text} placeholder=${placeholder} aria-label=${itemLabel}
          onInput=${(e) => onEdit({ text: e.target.value }, 'text')} />`);
    return html`<div class="vt-list" ref=${listRef}>
      ${items.map((it) => {
        const e = has(it.id) ? edits[it.id] : undefined;
        if (e === null) {
          return html`<div key=${it.id} data-flip=${it.id} class=${'vt-row removed' + (arrived(it.id) ? ' fresh' : '')}>
            <span class="vt-gone">${name(it)}</span>
            <button type="button" class="btn link sm vt-restore" onClick=${() => resetImage(it.id)}><${Icon} name="rotate-ccw" size=${13} /> Voltar a pôr</button>
          </div>`;
        }
        const cur = hl ? { ...it, ...(e || {}) } : { text: typeof e === 'string' ? e : it.text };
        return html`<div key=${it.id} data-flip=${it.id} class=${'vt-row' + (arrived(it.id) ? ' fresh' : '') + (e !== undefined ? ' edited' : '') + (hl ? ' vt-hl' : '')}>
          ${hl && HL_ROLES[it.role] && html`<span class="vt-origin">${HL_ROLES[it.role]}</span>`}
          ${fields(it, cur, (patch, f) => editImage(it.id, patch, `vt:${kind}:${it.id}:${f}`))}
          ${e !== undefined && html`<button type="button" class="icon-btn subtle vt-reset" aria-label=${`Repor do anúncio: ${name(it)}`} title="Repor do anúncio"
            onClick=${() => resetImage(it.id)}><${Icon} name="rotate-ccw" size=${15} /></button>`}
          <button type="button" class="icon-btn subtle vt-remove" aria-label=${`Tirar do ${where}: ${name(cur)}`} title=${`Tirar do ${where} (fica na imagem)`}
            onClick=${() => editImage(it.id, null)}><${Icon} name="x" size=${16} /></button>
        </div>`;
      })}
      ${own && added.map((it) => html`<div key=${it.id} data-flip=${it.id} class=${'vt-row own' + (arrived(it.id) ? ' fresh' : '') + (hl ? ' vt-hl' : '') + (exits.leaving(it.id) ? ' leaving' : '')}>
        ${hl && html`<span class="vt-origin">Seu</span>`}
        ${fields(it, it, (patch, f) => editAdded(it.id, patch, `vt:${kind}:${it.id}:${f}`))}
        <button type="button" class="icon-btn subtle vt-remove" aria-label=${`Apagar: ${name(it)}`} title="Apagar"
          onClick=${() => removeAdded(it.id)}><${Icon} name="x" size=${16} /></button>
      </div>`)}
      ${own && html`<button type="button" class="add-row vt-add" data-flip="end" onClick=${add}><${Icon} name="plus" size=${16} stroke=${2.4} /> ${addLabel}</button>`}
    </div>`;
  }
  const SOUND_OPTIONS = [['generated', 'Música da app', 'Ritmo e efeitos criados pela app, sem direitos de autor'], ['own', 'Um som meu', 'Um ficheiro MP3 ou M4A seu'], ['none', 'Sem som', 'Junte a música depois, na app do Instagram']];

  // ---------------------------------------------------------------- export
  const EXPORT_NAMES = { square: 'quadrado', portrait: 'retrato', story: 'story', feed34: '3x4' };
  // one slide of the export preview (the carousel's own drawing, small)
  function SlideThumb({ P, index, width }) {
    const ref = useRef();
    useEffect(() => { try { drawSlide(ref.current, P, index, width); } catch (err) { console.error(err); } }, [P, index, width]);
    return html`<canvas ref=${ref} class="export-slide" aria-hidden="true"></canvas>`;
  }

  // The dialog opens on the editor's tab; the video itself is shaped in «Vídeo»
  // («Mudar o vídeo» goes there: onClose('video')).
  // The export of the piece on screen (piece: 'image' | 'carousel' | 'video'). It starts
  // from where it goes («Para onde?», RS.production.DESTINATIONS); «Escolher formatos»
  // opens the formats one by one. «Pacote completo» (below) is the campaign package.
  function ExportDialog({ project, update, images, onClose, saveFile, fileSaving, mobile, piece, videoFormat, prepared, onHistory, onResolve, onProduction }) {
    const kind = piece === 'video' || piece === 'carousel' ? piece : 'image';
    // the previews are drawn once the dialog has arrived: drawing them during its
    // entrance stalled the sheet on a phone (half a second while it rose)
    const [entered, setEntered] = useState(false);
    useEffect(() => { const id = setTimeout(() => setEntered(true), 520); return () => clearTimeout(id); }, []);
    const arrived = (e) => { if (e.target === e.currentTarget) setEntered(true); };
    const DESTS = RS.production.DESTINATIONS[kind];
    const carouselFormat = M.cleanCarousel(project.carousel, project).format;
    const [dest, setDest] = useState(DESTS[0].id);
    const destination = DESTS.find((d) => d.id === dest) || DESTS[0];
    const destFormats = destination.formats.map((f) => (f === 'piece' ? carouselFormat : f));
    // «Escolher formatos»: the formats one by one (starting from the destination's)
    const [manual, setManual] = useState(null); // null = from the destination
    const FORMAT_LIST = kind === 'carousel' ? M.CAROUSEL_FORMATS : M.FORMAT_ORDER;
    const [locales, setLocales] = useState([project.locale]);
    const [type, setType] = useState('png');
    const [busy, setBusy] = useState(null); // { action, label, pct }
    const busyRef = useRef(false);
    // «PRONTO»: the file's name on screen, then `then` (today's message) and the dialog closes
    const [done, setDone] = useState(null);
    const thenRef = useRef(null);
    const celebrate = (name, then) => { RS.haptics.success(); thenRef.current = then; setDone({ name }); };
    const flush = () => { const t = thenRef.current; thenRef.current = null; if (t) t(); };
    useEffect(() => flush, []); // closed during «PRONTO»: the message still comes
    const abortRef = useRef(null);
    const [vSupport, setVSupport] = useState(null);
    useEffect(() => { RS.video.support().then(setVSupport).catch(() => setVSupport({ method: null })); }, []);
    const video = kind === 'video', carousel = kind === 'carousel';
    const formats = manual || destFormats;
    const setFormats = setManual;
    const vid = project.video || M.DEFAULT_VIDEO;
    const vStyle = RS.motion.styleOf(vid.motion);
    const vPhotos = useVideoPhotos(project, images, video);
    const [capLocale, setCapLocale] = useState(project.locale);
    const caption = M.publicationText(project, capLocale);
    const customCaption = typeof (project.captions || {})[capLocale] === 'string';
    const captionState = M.captionStatus(project, capLocale);
    const setCaption = (text) => update((p) => M.setPublicationText(p, capLocale, text), { coalesce: `caption:${capLocale}` });
    async function regenerateCaption() {
      const code = capLocale;
      const ok = await confirmDialog({ title: 'Regenerar o texto da publicação?', body: 'O texto desta língua volta a acompanhar o anúncio. Pode desfazer com Ctrl+Z.', confirm: 'Regenerar' });
      if (ok) update((p) => M.setPublicationText(p, code, null));
    }
    const [closing, close] = useClosing(onClose);
    const prevFocus = useRef(document.activeElement);
    const firstRef = useRef();
    useEffect(() => { if (firstRef.current && !mobile) firstRef.current.focus(); return () => { if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus(); }; }, []);
    // from the latest list (two quick ticks in a row both count); list: the one shown when none is kept yet
    const toggle = (list, set, v) => set((cur) => { const l = Array.isArray(cur) ? cur : list; return l.includes(v) ? l.filter((x) => x !== v) : [...l, v]; });
    const combos = [];
    for (const l of project.locales) if (locales.includes(l)) for (const f of FORMAT_LIST) if (formats.includes(f)) combos.push({ l, f });
    const canShare = typeof navigator.canShare === 'function';
    const first = combos[0];
    // the stage's video when it is the same (format and language): preparing it again took two seconds on a phone
    const P0 = useMemo(() => {
      if (!(video && first && entered)) return null;
      if (prepared && first.f === videoFormat && first.l === project.locale) return prepared;
      return RS.motion.prepare(project, { format: first.f, locale: first.l, images, photos: vPhotos || NO_PHOTOS });
    }, [video, videoKey(project), first && first.f, first && first.l, images, vPhotos, entered, prepared]);

    const [cPrep, setCPrep] = useState(null); // { key, P }: the carousel shown and counted
    const cKey = first ? `${first.f}:${first.l}:${JSON.stringify([videoKey(project), project.carousel])}` : '';
    useEffect(() => {
      if (!carousel || !first || !entered || !RS.slides) return undefined;
      let live = true;
      (async () => {
        const full = await RS.slides.photos(project, images);
        if (!live) return;
        const P = RS.slides.prepare(project, { format: first.f, locale: first.l, images, photos: { hero: null, cards: [], full } });
        if (live) setCPrep({ key: cKey, P });
      })().catch((err) => console.error(err));
      return () => { live = false; };
    }, [carousel, entered, cKey, images]);
    const cP = cPrep && cPrep.key === cKey ? cPrep.P : null;
    const notes = RS.production.destinationNotes(kind, manual ? null : dest, cP ? cP.slides.length : Infinity);

    const [checkState, setCheckState] = useState({ reports: [], pending: true, error: false });
    const checkKey = JSON.stringify([kind, formats, locales, videoKey(project)]);
    useEffect(() => {
      let live = true;
      setCheckState({ reports: [], pending: !!combos.length, error: false, key: checkKey });
      if (entered) (async () => {
        const reports = [];
        for (const c of combos) {
          await afterPaint(); if (!live) return;
          reports.push(video && vid.motion !== 'poster'
            ? { ...c, prepared: c.l === first.l && c.f === first.f && P0 ? P0 : RS.motion.prepare(project, { format: c.f, locale: c.l, images, photos: vPhotos || NO_PHOTOS }) }
            : carousel ? { ...c } // the slides keep their texts in their frames by themselves
            : { ...c, report: E.renderToCanvas(project, { format: c.f, locale: c.l, images, scale: 0.12, mode: 'thumb' }).report });
          setCheckState({ reports: [...reports], pending: reports.length < combos.length, error: false, key: checkKey });
        }
      })().catch((err) => { console.error(err); if (live) setCheckState({ reports: [], pending: false, error: true, key: checkKey }); });
      return () => { live = false; };
    }, [entered, checkKey, images, vPhotos, P0]);
    const checkReports = checkState.key === checkKey ? checkState.reports : [];
    const checking = !!combos.length && (checkState.key !== checkKey || checkState.pending);
    const checks = useMemo(() => W.preflight(project, { kind: video ? 'video' : 'image', combos: carousel ? [] : combos, reports: checkReports }), [project, kind, formats.join(), locales.join(), checkReports]);

    const ext = type === 'png' ? 'png' : 'jpg';
    const baseName = (c) => `${U.slug(project.name)}-${M.localeInfo(c.l).short.toLowerCase()}-${EXPORT_NAMES[c.f]}`;
    const fileName = (c) => `${baseName(c)}.${ext}`;
    const encode = (c) => new Promise((resolve, reject) => {
      const { canvas } = E.renderToCanvas(project, { format: c.f, locale: c.l, images, scale: 1, mode: 'export' });
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type === 'png' ? 'image/png' : 'image/jpeg', 0.93);
    });

    // Runs one export action at a time; the button shows its progress.
    async function busyRun(action, fn) {
      if (busyRef.current || done) return;
      busyRef.current = true;
      try {
        await fn((label, pct = null) => setBusy({ action, label, pct }));
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    }
    // Renders every chosen image, painting the progress before each one.
    async function encodeAll(step, verb) {
      const blobs = [];
      for (let i = 0; i < combos.length; i++) {
        step(combos.length > 1 ? `${verb} ${i + 1} de ${combos.length}…` : `${verb}…`);
        await afterPaint();
        blobs.push(await encode(combos[i]));
      }
      return blobs;
    }
    // Videos: one after the other, with the percentage on the button and Cancelar.
    // Each video: the motion style (RS.motion) drawn frame by frame, with the
    // generated music, the person's own sound fitted to it, or no sound.
    async function makeVideos(step) {
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      const blobs = [];
      try {
        const photos = vid.motion === 'poster' ? NO_PHOTOS : await videoPhotos(project, images);
        for (let i = 0; i < combos.length; i++) {
          const c = combos[i];
          const what = combos.length > 1 ? `A criar ${i + 1} de ${combos.length}` : 'A criar o vídeo';
          step(`${what}…`, 0);
          await afterPaint();
          const P = RS.motion.prepare(project, { format: c.f, locale: c.l, images, photos });
          let audio = null;
          if (vid.sound === 'generated') audio = await RS.sound.renderGenerated(P.timeline);
          else if (vid.sound === 'own') audio = await A.fittedSound(vid.ownSound, P.timeline.duration);
          if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
          blobs.push(await RS.video.create(project, {
            format: c.f, locale: c.l, images, duration: P.timeline.duration, style: vid.style, signal, audio,
            frame: (ctx, t) => RS.motion.render(ctx, P, { t, scale: 1 }),
            onProgress: (x) => step(`${what}…`, Math.round(x * 100)),
          }));
        }
      } finally {
        abortRef.current = null;
      }
      return blobs.map((blob, i) => ({ blob, name: `${baseName(combos[i])}.${RS.video.extOf(blob)}` }));
    }
    const silentNote = (out) => {
      if (out.some((v) => v.blob.silent)) toast('O vídeo saiu sem som: este navegador não consegue juntar o som. Junte a música na app do Instagram.', { kind: 'error' });
    };
    const videoFailed = (err) => {
      if (err && err.name === 'AbortError') { toast('Vídeo cancelado.'); return; }
      RS.haptics.error();
      console.error(err);
      if (err && err.message === RS.sound.BAD_FILE) {
        toast('Não foi possível ler o seu som. Escolha-o de novo em «Um som meu» ou use «Música da app».', { kind: 'error' });
        return;
      }
      toast(err && err.message && /navegador/.test(err.message) ? err.message : 'Não foi possível criar o vídeo. Tente de novo.', { kind: 'error' });
    };
    const downloadVideo = () => combos.length && busyRun('download', async (step) => {
      let out;
      try { out = await makeVideos(step); } catch (err) { videoFailed(err); return; }
      try {
        step('A guardar…');
        if (out.length === 1) {
          const { blob, name } = out[0];
          const ok = await U.saveBlob(blob, name, [{ description: 'Vídeo', accept: { [blob.type]: [`.${RS.video.extOf(blob)}`] } }]);
          if (ok) celebrate(name, () => { toast('Vídeo guardado. Está pronto para os Reels e as Stories.'); silentNote(out); });
        } else {
          const files = [];
          for (const v of out) files.push({ name: v.name, bytes: new Uint8Array(await v.blob.arrayBuffer()) });
          const zipName = `${U.slug(project.name)}-videos.zip`;
          const ok = await U.saveBlob(U.zip(files), zipName, [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }]);
          if (ok) celebrate(zipName, () => { toast(`${files.length} vídeos guardados num ZIP.`); silentNote(out); });
        }
      } catch (err) {
        console.error(err);
        RS.haptics.error();
        toast('Não foi possível guardar o vídeo. Tente de novo.', { kind: 'error' });
      }
    });
    const shareVideo = () => combos.length && busyRun('share', async (step) => {
      let out;
      try { out = await makeVideos(step); } catch (err) { videoFailed(err); return; }
      try {
        const files = out.map((v) => new File([v.blob], v.name, { type: v.blob.type }));
        if (!navigator.canShare({ files })) throw new Error('share');
        step('A abrir a partilha…');
        try { await navigator.clipboard.writeText(caption); } catch { /* optional */ }
        await navigator.share({ files, text: caption });
        toast('Partilhado. O texto da publicação também foi copiado.');
        silentNote(out);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        RS.haptics.error();
        toast('Este aparelho não deixou partilhar o vídeo. Use «Descarregar».', { kind: 'error' });
      }
    });
    const cancelExport = () => { if (abortRef.current) abortRef.current.abort(); };

    // The carousel: its slides numbered from 01, a folder per language (and per
    // format, when more than one is chosen), with the publication text, in a ZIP.
    async function carouselOut(step, signal) {
      const out = [];
      for (const f of formats) {
        const ls = combos.filter((c) => c.f === f).map((c) => c.l);
        if (!ls.length) continue;
        const files = await RS.production.carouselFiles(project, { locales: ls, format: f, type: ext, images, signal,
          onProgress: (label, x) => step(label, x != null ? Math.round(x * 100) : null), yieldUI: afterPaint });
        for (const file of files) {
          if (file.name.endsWith('/publicacao.txt')) { if (!out.some((x) => x.name === file.name)) out.push(file); }
          else out.push(formats.length > 1 ? { ...file, name: file.name.replace('/carrossel/', `/carrossel-${EXPORT_NAMES[f] || f}/`) } : file);
        }
      }
      return out;
    }
    // (Cancelar stops the making: nothing is saved)
    const downloadCarousel = () => combos.length && busyRun('download', async (step) => {
      abortRef.current = new AbortController();
      step('A preparar…');
      try {
        const files = await carouselOut(step, abortRef.current.signal);
        step('A guardar…');
        const zipName = `${U.slug(project.name)}-carrossel.zip`;
        const ok = await U.saveBlob(U.zip(files), zipName, [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }]);
        const n = files.filter((f) => !f.name.endsWith('.txt')).length;
        if (ok) celebrate(zipName, () => toast(`Carrossel guardado: ${n} ${n === 1 ? 'imagem' : 'imagens'}, numeradas pela ordem de publicação.`));
      } catch (err) {
        if (err && err.name === 'AbortError') { toast('Carrossel cancelado.'); return; }
        console.error(err);
        RS.haptics.error();
        toast('Não foi possível criar o carrossel. Tente de novo.', { kind: 'error' });
      }
    });
    // shares the slides of the first language and format (one post)
    const shareCarousel = () => combos.length && busyRun('share', async (step) => {
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      step('A preparar…');
      try {
        const files = (await RS.production.carouselFiles(project, { locales: [first.l], format: first.f, type: ext, images, signal, onProgress: (label) => step(label), yieldUI: afterPaint }))
          .filter((f) => !f.name.endsWith('.txt')).map((f) => new File([f.bytes], f.name.split('/').pop(), { type: ext === 'png' ? 'image/png' : 'image/jpeg' }));
        if (!navigator.canShare({ files })) throw new Error('share');
        step('A abrir a partilha…');
        try { await navigator.clipboard.writeText(caption); } catch { /* optional */ }
        await navigator.share({ files, text: caption });
        toast('Partilhado. O texto da publicação também foi copiado.');
      } catch (err) {
        // (Cancelar while making says so; closing the share sheet says nothing)
        if (err && err.name === 'AbortError') { if (signal.aborted) toast('Carrossel cancelado.'); return; }
        console.error(err);
        RS.haptics.error();
        toast('Este aparelho não deixou partilhar. Use «Descarregar».', { kind: 'error' });
      }
    });

    const download = () => combos.length && busyRun('download', async (step) => {
      try {
        const blobs = await encodeAll(step, 'A preparar');
        step('A guardar…');
        if (combos.length === 1) {
          const blob = blobs[0];
          const ok = await U.saveBlob(blob, fileName(combos[0]), [{ description: `Imagem ${ext.toUpperCase()}`, accept: { [blob.type]: [`.${ext}`] } }]);
          if (ok) celebrate(fileName(combos[0]), () => toast('Imagem guardada. Está pronta para publicar.'));
        } else {
          const files = [];
          for (let i = 0; i < combos.length; i++) files.push({ name: fileName(combos[i]), bytes: new Uint8Array(await blobs[i].arrayBuffer()) });
          const zipName = `${U.slug(project.name)}-imagens.zip`;
          const ok = await U.saveBlob(U.zip(files), zipName, [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }]);
          if (ok) celebrate(zipName, () => toast(`${files.length} imagens guardadas num ZIP.`));
        }
      } catch (err) {
        console.error(err);
        RS.haptics.error();
        toast('Não foi possível criar a imagem. Tente de novo.', { kind: 'error' });
      }
    });
    // Shares straight to Instagram, Facebook, WhatsApp... (phone share sheet / Windows share).
    const share = () => combos.length && busyRun('share', async (step) => {
      try {
        const blobs = await encodeAll(step, 'A preparar');
        const files = blobs.map((b, i) => new File([b], fileName(combos[i]), { type: b.type }));
        if (!navigator.canShare({ files })) throw new Error('share');
        step('A abrir a partilha…');
        try { await navigator.clipboard.writeText(caption); } catch { /* optional */ }
        await navigator.share({ files, text: caption });
        toast('Partilhado. O texto da publicação também foi copiado.');
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        RS.haptics.error();
        toast('Este aparelho não deixou partilhar. Use «Descarregar».', { kind: 'error' });
      }
    });
    const copyImage = () => busyRun('copy', async (step) => {
      try {
        step('A copiar…');
        await afterPaint();
        const blob = await new Promise((resolve, reject) => {
          const { canvas } = E.renderToCanvas(project, { images, scale: 1, mode: 'export' });
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png');
        });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Imagem copiada. Cole-a no Facebook ou no Instagram com Ctrl+V.');
      } catch (err) {
        console.error(err);
        toast('Este navegador não deixou copiar a imagem. Use «Descarregar».', { kind: 'error' });
      }
    });
    const doing = (action) => busy && busy.action === action;
    // the busy words, with the percentage counting up (videos)
    const busyText = () => html`${busy.label}${busy.pct != null ? html` <${CountUp} value=${busy.pct} duration=${300} />%` : ''}`;
    async function copyCaption() {
      try { await navigator.clipboard.writeText(caption); toast('Texto da publicação copiado'); }
      catch { toast('Não foi possível copiar. Selecione o texto e copie.', { kind: 'error' }); }
    }
    // For the Instagram Story link sticker (Instagram has no links in captions).
    const waLink = C.adLink(project, capLocale);
    async function copyWaLink() {
      try { await navigator.clipboard.writeText(waLink); toast('Link do WhatsApp copiado. Na Story do Instagram, cole-o no autocolante «Link».'); }
      catch { toast('Não foi possível copiar o link. Copie-o do texto da publicação.', { kind: 'error' }); }
    }

    const thumbW = mobile ? (combos.length > 1 ? 120 : 190) : combos.length > 2 ? 150 : 210;
    const label = carousel ? 'Descarregar carrossel (ZIP)' : combos.length > 1 ? `Descarregar ${combos.length} imagens (ZIP)` : 'Descarregar imagem';
    const fmtName = (f) => `${M.FORMATS[f].label} ${M.FORMATS[f].w}×${M.FORMATS[f].h}`;
    const vLabel = combos.length > 1 ? `Criar ${combos.length} vídeos (ZIP)` : 'Criar vídeo';
    const noVideo = video && vSupport && !vSupport.method;
    return html`<div class=${'modal-back' + (closing ? ' closing' : '')} onMouseDown=${(e) => { if (e.target === e.currentTarget && !busy) close(); }}
      onKeyDown=${(e) => { if (e.key === 'Escape' && !busy) close(); }}>
      <div class="modal export" role="dialog" aria-modal="true" aria-labelledby="exp-title" onAnimationEnd=${arrived}>
        <header class="modal-head">
          <h2 id="exp-title">${video ? 'Exportar vídeo' : carousel ? 'Exportar carrossel' : 'Exportar imagem'}</h2>
          <div class="spacer"></div>
          <button class="icon-btn" aria-label="Fechar" onClick=${() => close()} disabled=${!!busy}><${Icon} name="x" /></button>
        </header>
        <div class="export-body">
          <div class="export-preview">
            ${done ? html`<${Celebration} detail=${done.name} onDone=${() => { flush(); close(); }} />`
            : busy && (busy.action === 'download' || busy.action === 'share') ? html`<${CraneProgress} progress=${busy.pct != null ? busy.pct / 100 : null} label=${busy.label} />`
            : !combos.length ? html`<p class="muted">Escolha pelo menos um formato e uma língua.</p>`
            : carousel ? html`<figure class="export-slides" key=${'c' + combos[0].l + combos[0].f}>
                <div class="export-slide-row">${cP ? cP.slides.slice(0, mobile ? 4 : 6).map((_, i) => html`<${SlideThumb} key=${i} P=${cP} index=${i} width=${mobile ? 74 : 96} />`) : html`<span class="poster-thumb motion-wait" style=${`width:${mobile ? 74 : 96}px;height:${Math.round((mobile ? 74 : 96) * M.FORMATS[combos[0].f].h / M.FORMATS[combos[0].f].w)}px`}></span>`}</div>
                <figcaption>${cP ? `${cP.slides.length} ${cP.slides.length === 1 ? 'diapositivo' : 'diapositivos'}` : 'A preparar…'} · ${M.FORMATS[combos[0].f].label} · ${M.localeInfo(combos[0].l).short}</figcaption>
              </figure>
              ${combos.length > 1 && html`<p class="muted">e mais ${combos.length - 1} ${combos.length - 1 === 1 ? 'carrossel' : 'carrosséis'} (outras línguas ou formatos)</p>`}`
            : video ? html`<figure key=${'v' + combos[0].l + combos[0].f}>
                ${P0 && html`<${VideoPreview} prepared=${P0} width=${mobile ? 170 : 230} still=${busy ? P0.timeline.duration - 0.01 : null} />`}
                <figcaption>${M.FORMATS[combos[0].f].label} · ${M.localeInfo(combos[0].l).short} · ${P0 ? P0.timeline.duration : vid.duration} s · ${vStyle.name}</figcaption>
              </figure>
              ${combos.length > 1 && html`<p class="muted">e mais ${combos.length - 1} ${combos.length - 1 === 1 ? 'vídeo' : 'vídeos'}</p>`}`
            : html`${combos.slice(0, 6).map((c) => html`<figure key=${c.l + c.f}>
              <${PosterThumb} project=${project} format=${c.f} locale=${c.l} images=${images} width=${thumbW} pending=${!entered} />
              <figcaption>${M.FORMATS[c.f].label} · ${M.localeInfo(c.l).short}</figcaption>
            </figure>`)}
            ${combos.length > 6 && html`<p class="muted">e mais ${combos.length - 6}…</p>`}`}
          </div>
          <div class="export-options">
            <fieldset class="export-dest"><legend>Para onde?</legend>
              <div class="dest-list" role="radiogroup" aria-label="Para onde?">
                ${DESTS.map((d, i) => html`<button key=${d.id} type="button" role="radio" ref=${i === 0 ? firstRef : null} aria-checked=${!manual && dest === d.id} class=${'dest' + (!manual && dest === d.id ? ' on' : '')}
                  disabled=${!!busy || !!done} onClick=${() => { setDest(d.id); setManual(null); }}>
                  <strong>${d.label}</strong><small>${d.formats.map((f) => fmtName(f === 'piece' ? carouselFormat : f)).join(' · ')}</small></button>`)}
              </div>
              ${notes.map((n) => html`<p key=${n} class=${'video-note' + (/pede pelo menos/.test(n) ? ' warn' : '')}><${Icon} name=${/pede pelo menos/.test(n) ? 'triangle-alert' : 'info'} size=${15} /> <span>${n}</span></p>`)}
              <button type="button" class="btn link sm export-pick" aria-expanded=${!!manual} disabled=${!!busy || !!done} onClick=${() => setManual(manual ? null : [...destFormats])}>
                <${Icon} name="sliders-horizontal" size=${14} /> Escolher formatos</button>
              ${manual && html`<div class="export-formats">${FORMAT_LIST.map((f) => html`<label key=${f} class="check"><input type="checkbox" checked=${formats.includes(f)} disabled=${!!busy || !!done} onChange=${() => toggle(formats, setFormats, f)} />
                <span><strong>${M.FORMATS[f].label}</strong> ${M.FORMATS[f].w}×${M.FORMATS[f].h} · ${video && f === 'story' ? 'Reels e Stories' : M.FORMATS[f].hint}</span></label>`)}</div>`}
            </fieldset>
            ${project.locales.length > 1 && html`<fieldset><legend>Línguas</legend>
              ${project.locales.map((l) => html`<label key=${l} class="check"><input type="checkbox" checked=${locales.includes(l)} disabled=${!!busy || !!done} onChange=${() => toggle(locales, setLocales, l)} />
                <span><strong>${M.localeInfo(l).short}</strong> ${M.localeInfo(l).label}</span></label>`)}
            </fieldset>`}
            ${video ? html`
              <fieldset><legend>Ficheiro</legend>
                <p class="video-file"><${Icon} name="video" size=${16} /> <span><strong>MP4</strong> · ${vStyle.name} · ${P0 ? P0.timeline.duration : vid.duration} s · ${SOUND_NAMES[vid.sound] || ''}</span></p>
                <button type="button" class="btn link sm" disabled=${!!busy || !!done} onClick=${() => close('video')}><${Icon} name="sliders-horizontal" size=${14} /> Mudar o vídeo</button>
              </fieldset>
              ${noVideo ? html`<p class="video-note warn"><${Icon} name="triangle-alert" size=${15} /> Este navegador não consegue criar vídeo. Use o Microsoft Edge ou o Google Chrome atualizados.</p>`
                : html`<p class="video-note"><${Icon} name="info" size=${15} /> ${vid.sound === 'none' ? 'Sem som: junte a música na app do Instagram, que tem músicas licenciadas e dá mais alcance.'
                  : vid.sound === 'own' ? 'Use só músicas que pode publicar. O som é ajustado à duração do vídeo, com um final suave.'
                  : 'Música criada pela app: pode publicar sem problemas de direitos.'}${vSupport && (vSupport.method === 'recorder' || (vid.sound !== 'none' && !vSupport.aac)) ? ' Neste navegador o vídeo é gravado em tempo real: demora o mesmo que o vídeo.' : ''}</p>`}`
            : html`<fieldset><legend>Ficheiro</legend>
              <div class="seg small" role="radiogroup" aria-label="Tipo de ficheiro">
                <button role="radio" aria-checked=${type === 'png'} class=${type === 'png' ? 'on' : ''} onClick=${() => setType('png')}>PNG · máxima nitidez</button>
                <button role="radio" aria-checked=${type === 'jpg'} class=${type === 'jpg' ? 'on' : ''} onClick=${() => setType('jpg')}>JPG · mais leve</button>
              </div>
            </fieldset>`}
            <section class="preflight" aria-label="Verificação antes de exportar">
              ${checking && html`<p class="field-hint" role="status">A verificar a composição (${checkReports.length}/${combos.length})…</p>`}
              ${checkState.error && html`<p class="field-hint" role="alert">Não foi possível verificar todas as composições. Confirme a pré-visualização antes de exportar.</p>`}
              ${checks.length > 0 ? html`<details class="preflight-fold"><summary>${checks.length} ${checks.length === 1 ? 'ponto a confirmar' : 'pontos a confirmar'}</summary><p class="field-hint">Pode exportar mesmo assim.</p><ul class="checks">${checks.map((c) => html`<li key=${c.id} class=${c.kind}><${Icon} name="triangle-alert" size=${15} /><div><span>${c.text}</span><button class="btn link sm" disabled=${!!busy || !!done} onClick=${() => { if (c.caption) { setCapLocale(c.locale); requestAnimationFrame(() => document.querySelector('.caption-text')?.focus()); } else onResolve(c); }}>${c.review ? 'Rever tradução' : 'Verificar'}</button></div></li>`)}</ul></details>`
                : !checking && !checkState.error && html`<p class="field-hint">${!combos.length ? 'Escolha um formato e uma língua.' : 'Sem avisos automáticos. Confirme o conteúdo na pré-visualização.'}</p>`}
            </section>
            ${video ? html`<div class=${'export-actions' + (busy ? ' is-busy' : '')}>
              ${canShare && mobile && html`<button class=${'btn primary lg' + (doing('share') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length || noVideo} aria-busy=${doing('share')} onClick=${shareVideo}>
                ${doing('share') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="external-link" /> Partilhar vídeo`}</button>`}
              <button class=${'btn lg ' + (canShare && mobile ? 'ghost' : 'primary') + (doing('download') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length || noVideo} aria-busy=${doing('download')} onClick=${downloadVideo}>
                ${doing('download') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="video" /> ${canShare && mobile ? 'Descarregar' : vLabel}`}</button>
              ${canShare && !mobile && html`<button class=${'btn ghost' + (doing('share') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length || noVideo} aria-busy=${doing('share')} onClick=${shareVideo} title="Abre a partilha do Windows">
                ${doing('share') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="external-link" /> Partilhar`}</button>`}
              ${busy && html`<button class="btn ghost danger-text" onClick=${cancelExport}><${Icon} name="x" /> Cancelar</button>`}
              ${mobile && !busy && html`<button class="btn ghost" onClick=${saveFile} disabled=${fileSaving} aria-busy=${!!fileSaving}>${fileSaving ? html`<${Spinner} /> A preparar projeto…` : html`<${Icon} name="save" /> Guardar projeto`}</button>`}
            </div>` : carousel ? html`<div class=${'export-actions' + (busy ? ' is-busy' : '')}>
              ${canShare && mobile && html`<button class=${'btn primary lg' + (doing('share') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length} aria-busy=${doing('share')} onClick=${shareCarousel}>
                ${doing('share') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="external-link" /> Partilhar`}</button>`}
              <button class=${'btn lg ' + (canShare && mobile ? 'ghost' : 'primary') + (doing('download') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length} aria-busy=${doing('download')} onClick=${downloadCarousel}>
                ${doing('download') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="download" /> ${label}`}</button>
              ${canShare && !mobile && html`<button class=${'btn ghost' + (doing('share') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length} aria-busy=${doing('share')} onClick=${shareCarousel} title="Abre a partilha do Windows">
                ${doing('share') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="external-link" /> Partilhar`}</button>`}
              ${busy && html`<button class="btn ghost danger-text" onClick=${cancelExport}><${Icon} name="x" /> Cancelar</button>`}
            </div>` : html`<div class=${'export-actions' + (busy ? ' is-busy' : '')}>
              ${canShare && mobile && html`<button class=${'btn primary lg' + (doing('share') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length} aria-busy=${doing('share')} onClick=${share}>
                ${doing('share') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="external-link" /> Partilhar`}</button>`}
              <button class=${'btn lg ' + (canShare && mobile ? 'ghost' : 'primary') + (doing('download') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length} aria-busy=${doing('download')} onClick=${download}>
                ${doing('download') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="download" /> ${label}`}</button>
              ${canShare && !mobile && html`<button class=${'btn ghost' + (doing('share') ? ' busy' : '')} disabled=${!!busy || !!done || !combos.length} aria-busy=${doing('share')} onClick=${share} title="Abre a partilha do Windows">
                ${doing('share') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="external-link" /> Partilhar`}</button>`}
              ${!mobile && html`<button class=${'btn ghost' + (doing('copy') ? ' busy' : '')} disabled=${!!busy || !!done} aria-busy=${doing('copy')} onClick=${copyImage} title="Copia a imagem do formato e língua que está a ver">
                ${doing('copy') ? html`<${Spinner} /> ${busyText()}` : html`<${Icon} name="clipboard-copy" /> Copiar imagem`}</button>`}
              ${mobile && html`<button class="btn ghost" disabled=${!!busy || !!done || fileSaving} aria-busy=${!!fileSaving} onClick=${saveFile}>${fileSaving ? html`<${Spinner} /> A preparar projeto…` : html`<${Icon} name="save" /> Guardar projeto`}</button>`}
            </div>`}
          </div>
        </div>
        <section class="caption">
          <div class="caption-head">
            <h3>Texto para a publicação</h3>
            ${project.locales.length > 1 && html`<div class="seg small caption-locales" role="group" aria-label="Língua do texto da publicação">${project.locales.map((l) => html`<button key=${l} class=${capLocale === l ? 'on' : ''} aria-pressed=${capLocale === l} title=${M.localeInfo(l).label} onClick=${() => setCapLocale(l)}>${M.localeInfo(l).short}</button>`)}</div>`}
            <div class="spacer"></div>
            ${waLink && html`<button class="btn ghost sm" onClick=${copyWaLink} title="Para o autocolante «Link» das Stories do Instagram"><${Icon} name="message-circle" size=${16} /> Copiar link do WhatsApp</button>`}
            <button class="btn ghost sm" onClick=${copyCaption}><${Icon} name="copy" size=${16} /> Copiar texto</button>
            <button class="btn ghost sm" disabled=${!customCaption || !!busy} onClick=${regenerateCaption}><${Icon} name="rotate-ccw" size=${16} /> Regenerar</button>
          </div>
          ${['stale', 'unverified'].includes(captionState) && html`<div class="caption-warning" role="status"><p>${captionState === 'stale' ? 'A oferta ou os contactos mudaram desde a última edição deste texto. Confirme os dados antes de publicar.' : 'Este texto personalizado ainda não foi confirmado com os dados atuais.'} O seu texto foi mantido.</p><button class="btn ghost sm" disabled=${!!busy} onClick=${() => update((p) => M.confirmPublicationText(p, capLocale))}>Confirmo que o texto está atualizado</button></div>`}
          <textarea class="caption-text" name="caption" value=${caption} onInput=${(e) => setCaption(e.target.value)} aria-label="Texto para a publicação" disabled=${!!busy}></textarea>
          <div class="caption-footer"><small class="field-hint">${customCaption ? 'Texto personalizado guardado neste anúncio, nesta língua.' : 'Texto automático: acompanha as alterações do anúncio até o editar.'}</small>
            <button class="btn ghost sm" disabled=${!!busy} onClick=${onHistory}><${Icon} name="clock" size=${16} /> Histórico de versões</button></div>
        </section>
        <div class="production-entry"><button class="btn ghost" disabled=${!!busy || !!done} onClick=${onProduction}><${Icon} name="package" /> Pacote completo</button><span class="field-hint">Imagem, carrossel, vídeo e textos de todas as línguas num único ZIP.</span></div>
      </div>
    </div>`;
  }

  // ============================================================== app
  const BUSY_LABELS = { gallery: 'A abrir os modelos', create: 'A preparar o anúncio', open: 'A abrir o anúncio', nav: 'A abrir' };
  // Thin bar at the top while a screen is opening.
  function TopProgress({ busy }) {
    const [anim, setAnim] = useState(navAnim.on);
    useEffect(() => { navAnim.subs.add(setAnim); return () => navAnim.subs.delete(setAnim); }, []);
    const show = useDelayed(!!busy && !anim, 300);
    return html`<div class=${'top-progress' + (show ? ' on' : '')} aria-hidden="true">${show && html`<${TypingLoader} bar />`}</div>
      <div class="sr-only" role="status" aria-live="polite">${busy ? `${BUSY_LABELS[busy.split(':')[0]] || 'A abrir'}…` : ''}</div>`;
  }

  function App() {
    const [ready, setReady] = useState(false);
    const [route, setRoute] = useState({ name: 'home' });
    const [brand, setBrand] = useState(null);
    // One navigation at a time: while a screen opens, further clicks are ignored
    // and the clicked element shows its own loading state.
    const [busy, setBusy] = useState(null);
    const busyRef = useRef(null);
    const runRef = useRef(null); // the navigation running now
    // One navigation at a time; but a new tap wins over a screen change that is only
    // animating (spec: «a new touch wins»): the animation jumps to its end, then the tap runs.
    const run = useCallback(async (key, fn) => {
      if (busyRef.current) {
        if (!navAnim.on || !navVT || !runRef.current) return false;
        try { navVT.skipTransition(); } catch { /* already over */ }
        await runRef.current;
        if (busyRef.current) return false;
      }
      busyRef.current = key;
      setBusy(key);
      const job = (async () => {
        try {
          await afterPaint();
          await fn();
          return true;
        } catch (err) {
          console.error(err);
          toast('Não foi possível abrir. Tente de novo.', { kind: 'error' });
          return false;
        } finally {
          busyRef.current = null;
          setBusy(null);
        }
      })();
      runRef.current = job;
      return job;
    }, []);
    useEffect(() => { document.documentElement.classList.toggle('is-busy', !!busy); }, [busy]);
    const routeRef = useRef(route);
    routeRef.current = route;
    // Outside the editor the page simply reloads into the new version; in the
    // editor the person chooses when (the last keystrokes may still be saving).
    const newVersionReady = () => {
      try {
        const last = Number(sessionStorage.getItem('rs-updated') || 0);
        if (Date.now() - last < 15000) return; // never loop
        sessionStorage.setItem('rs-updated', String(Date.now()));
      } catch { /* private mode: still fine, controllerchange fires once */ }
      if (routeRef.current.name === 'editor') {
        toast('Há uma versão nova da aplicação.', { action: 'Atualizar', onAction: async () => {
          try { if (RS.beforeReload) await RS.beforeReload(); location.reload(); }
          catch (err) { toast('Não foi possível guardar. A atualização fica para mais tarde.', { kind: 'error' }); }
        } });
      } else {
        toast('Versão nova instalada. A atualizar…');
        setTimeout(() => location.reload(), 900);
      }
    };
    // the welcome: the first opening as an installed app (https), or right after installing
    const [welcome, setWelcome] = useState(() => RS.install.shouldWelcome({ standalone: standalone(), protocol: location.protocol }));
    useEffect(() => { welcomeBus.subs.add(setWelcome); return () => welcomeBus.subs.delete(setWelcome); }, []);
    const [intro, setIntro] = useState(() => {
      try { return !sessionStorage.getItem('rs-intro') && !reducedMotion(); } catch { return !reducedMotion(); }
    });
    useEffect(() => {
      (async () => {
        await E.loadFonts();
        await S.open();
        const catalog = await S.getCatalog();
        await S.housekeeping();
        // the home opens on its real contents (an empty profile: the building site, not the cards first)
        homeCache.recs = await listHome().catch(() => null);
        setBrand(RS.reuse.defaultBrand(catalog));
        setReady(true);
      })().catch((err) => { console.error(err); setReady(true); });
      // Installable and offline-capable when served over http(s) (e.g. on a phone).
      if (/^https?:$/.test(location.protocol)) {
        const link = document.createElement('link');
        link.rel = 'manifest'; link.href = 'manifest.webmanifest';
        document.head.appendChild(link);
        if ('serviceWorker' in navigator) {
          const sw = navigator.serviceWorker;
          // A new publish: its worker takes over (skipWaiting + claim) and the page
          // moves to it at once, instead of showing the old copy until the next opening.
          // The first takeover of a first visit is the install, not an update.
          let controlled = !!sw.controller;
          sw.addEventListener('controllerchange', () => { if (controlled) newVersionReady(); controlled = true; });
          sw.register('sw.js')
            .then((reg) => {
              // An installed app stays open in the background: check again when it comes back.
              document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
              return sw.ready;
            })
            .then((reg) => { const c = navigator.connection; if (reg.active && !(c && c.saveData)) reg.active.postMessage('cache-photos'); })
            .catch((err) => console.warn('Service worker', err));
        }
      }
    }, []);
    const go = (r, key = 'nav') => run(key, () => transition(() => setRoute(r)));
    // back from the editor: in the new view the ad's card is the poster
    const backFrom = (id) => run('nav', () => transition(async () => {
      setRoute({ name: 'home' });
      await domFlushed();
      markPoster(id ? document.querySelector(`.proj-card[data-id="${CSS.escape(id)}"] .proj-thumb`) : null);
    }));

    // The slow part (photo, saving) runs before the screen change, while the
    // card shows "A preparar o anúncio…"; the change itself is then instant.
    // start: { piece, style (carousel), motion (video) } from the gallery's «Começar por»
    const create = (template, format, selectedBrand, trades, photoId, start = {}) => run(`create:${start.style || start.motion || template.id}`, async () => {
      let p = M.newProject(template, { format, trades });
      if (selectedBrand) p = applyBrand(p, selectedBrand);
      if (start.piece === 'carousel' && start.style) p.carousel = M.cleanCarousel({ ...p.carousel, style: start.style }, p);
      if (start.piece === 'video' && start.motion) {
        const st = RS.motion.styleOf(start.motion);
        p.video = { ...p.video, motion: st.id, duration: st.defaultDuration, bg: st.bgModes[0] };
      }
      if (photoId) {
        try {
          const a = await A.importFile(await L.fileFor(photoId), 'photo');
          p.photo = { asset: a.id, zoom: 1, fx: 0.5, fy: a.h > a.w * 1.3 ? 0.36 : 0.5, flip: false, adj: { ...M.DEFAULT_FX } };
        } catch (err) { console.warn('Library photo not applied', err); }
      }
      const rec = await S.putProject(p);
      await transition(() => setRoute({ name: 'editor', project: p, revision: rec.revision, piece: start.piece }));
    });
    // Photo and logo are decoded before the editor opens, so it opens complete.
    const open = (data, key = 'open', piece) => run(key, async () => {
      const rec = await S.getProject(data.id);
      if (!rec || rec.deletedAt) throw new Error('Este anúncio já não está disponível. Atualize a lista de anúncios.');
      const p = M.normalize(rec.data);
      await Promise.all([A.load(p.photo && p.photo.asset), A.load(p.logo && p.logo.asset)]).catch((err) => console.warn(err));
      await transition(() => setRoute({ name: 'editor', project: p, revision: rec.revision || 0, piece }));
    });
    const endIntro = useCallback(() => {
      try { sessionStorage.setItem('rs-intro', '1'); } catch { /* private mode */ }
      setIntro(false);
    }, []);

    // The start screen in index.html stays until the app is ready, then fades.
    useEffect(() => {
      if (!ready) return undefined;
      const boot = document.getElementById('boot');
      if (boot) { boot.classList.add('out'); setTimeout(() => boot.remove(), 320); }
      // Warm the photo library while the person looks at the home screen.
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
      idle(() => L.index().then((lib) => { if (lib.items[0]) L.full(lib.items[0].id).catch(() => {}); }));
      return undefined;
    }, [ready]);

    if (!ready) return html`<div class="splash"><${Wordmark} /><span class="splash-bar"></span></div>`;
    return html`
      ${route.name === 'home' && html`<${Home} busy=${busy} brand=${brand} setBrand=${setBrand} onNew=${() => go({ name: 'gallery' }, 'gallery')} onOpen=${open} />`}
      ${route.name === 'gallery' && html`<${Gallery} busy=${busy} brand=${brand} onBack=${() => go({ name: 'home' })} onCreate=${create} />`}
      ${route.name === 'editor' && html`<${Editor} key=${route.project.id} initial=${route.project} initialRevision=${route.revision} initialPiece=${route.piece} brand=${brand} setBrand=${setBrand} onExit=${backFrom} />`}
      <${TopProgress} busy=${busy} />
      <${Toasts} />
      <${DialogHost} />
      ${intro && html`<${RS.ui.Opening} onDone=${endIntro} />`}
      ${welcome && html`<${Welcome} onDone=${() => setWelcome(false)} />`}`;
  }

  // a tick under the finger (Android vibration, iPhone switches; quiet on a PC)
  RS.haptics.install();
  // Ilustrativo: a brick jumps out of a main control when it is pressed
  RS.ui.tapBubbles(document);
  // iPhone Safari applies :active (the press of every button) only on pages that listen to touches
  document.addEventListener('touchstart', () => {}, { passive: true });
  // the «selected» pill glides in every segmented control, tab row and section bar
  RS.ui.autoGlide(document);
  // pop-ups grow from the button that opened them
  RS.ui.autoOrigin(document);
  U.installModalFocus(document);
  render(html`<${App} />`, document.getElementById('app'));
})();
