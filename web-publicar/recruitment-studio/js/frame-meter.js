// A hidden frame meter (2026-10-29) for the owner's iPhone test — there is no Mac to
// measure the phone otherwise. Five taps on the version line in «Definições» show it:
// a small overlay with the frames per second and the frames over 50 ms («travões»)
// of the last 2 s. DOM only, so it never reaches an export; off by default; kept for
// the visit (sessionStorage).
window.RS = window.RS || {};
RS.frameMeter = (() => {
  const KEY = 'rs-meter';
  const WINDOW_MS = 2000;
  let raf = 0, timer = 0, box = null, frames = [];

  // { fps: mean frames per second, slow: frames longer than 50 ms }
  function summary(intervals) {
    if (!intervals.length) return { fps: 0, slow: 0 };
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return { fps: Math.round(1000 / mean), slow: intervals.filter((d) => d > 50).length };
  }
  const remember = (on) => { try { if (on) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch { /* blocked */ } };
  const on = () => !!box;

  function start(doc = document) {
    if (box) return;
    box = doc.createElement('div');
    box.className = 'frame-meter';
    box.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(box);
    frames = [];
    const tick = (now) => { frames.push(now); const from = now - WINDOW_MS; while (frames.length && frames[0] < from) frames.shift(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const show = () => {
      const s = summary(frames.slice(1).map((t, i) => t - frames[i]));
      if (box) box.textContent = `${s.fps} fps · ${s.slow} ${s.slow === 1 ? 'travão' : 'travões'}`;
    };
    show();
    timer = setInterval(show, 500);
    remember(true);
  }
  function stop() {
    cancelAnimationFrame(raf); clearInterval(timer);
    if (box) box.remove();
    box = null; frames = [];
    remember(false);
  }
  const toggle = () => (on() ? stop() : start());
  // a visit that had it on keeps it on
  if (typeof document !== 'undefined' && document.body) { try { if (sessionStorage.getItem(KEY)) start(); } catch { /* blocked */ } }

  return { summary, start, stop, on, toggle };
})();
