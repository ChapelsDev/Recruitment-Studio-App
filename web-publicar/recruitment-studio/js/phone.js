// The phone editor (≤ 860 px, 2026-10-29): where the panel under the preview stops
// and how a drag snaps to a stop. Pure helpers; js/app.js lays the editor out from
// them (the panel's top edge is --sheet-y, the preview fills the space above it).
window.RS = window.RS || {};
RS.phone = (() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // The y of the panel's top edge, in px from the top of the screen, at each stop:
  // 'top' (writing: the preview is a strip), 'middle' (where it opens: about half),
  // 'bottom' (only the panel's head above the floating bar: the preview at its largest).
  // o.safeTop: the status bar's height; o.barRoom: the room the floating bar takes at
  // the bottom; o.head: the panel head's height.
  function stops(viewH, o) {
    const top = Math.max(o.safeTop + 120, Math.round(0.22 * viewH));
    let bottom = viewH - o.barRoom - o.head;
    if (bottom < top + 80) bottom = top + 80; // a window too short for three stops keeps them apart
    const middle = clamp(Math.round(0.56 * viewH), top + 40, bottom - 40);
    return { top, middle, bottom };
  }
  // The stop a drag that let go at y with this speed (px/ms, + downwards) ends at:
  // the nearest to where it was heading (a quick flick goes on to the next one).
  function snap(y, velocity, s) {
    const aim = y + (velocity || 0) * 180;
    return Object.keys(s).reduce((a, b) => (Math.abs(s[b] - aim) < Math.abs(s[a] - aim) ? b : a));
  }
  // The chevron's cycle: up one stop at a time, then from the top back to the bottom.
  const NEXT = Object.freeze({ bottom: 'middle', middle: 'top', top: 'bottom' });
  const next = (stop) => NEXT[stop] || 'middle';
  // ---------------------------------------------------------------- the video as a player
  // A tap shows the buttons; while it plays they hide after HIDE_MS without a touch
  // (writable: the tests shorten it).
  const api = { stops, snap, next, HIDE_MS: 3000 };
  // How many buttons fit on the player: all of them, fewer, or only pause, the bar and ⛶.
  api.tier = (width) => (width >= 230 ? 'full' : width >= 120 ? 'reduced' : 'minimal');
  // The video's moments as marks on the seek bar (the start needs none), without «N. ».
  api.ticks = (moments, duration) => (duration > 0 ? moments : [])
    .filter((m) => m.time > 0.05)
    .map((m) => ({ at: m.time / duration, label: String(m.label).replace(/^\d+\.\s*/, '') }));
  return api;
})();
