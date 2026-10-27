// Interface: «Vídeo» › «Modelo» › «Fotografias» lists the photos the video
// uses; «Enquadrar» opens a dialog with the photo and a point to drag (or move
// with the arrow keys) to what must stay in the centre; the stage follows.
// Runs after ui-feel.case.js (any screen: it opens the newest ad itself).
(() => {
  const { sleep, $, $$, byText, waitFor, saved } = window.H;
  async function videoTab(name) {
    const b = await waitFor(() => byText('.video-panel .video-tabs [role="tab"]', new RegExp(`^\\s*${name}\\s*$`)), `the ${name} tab`);
    if (b.getAttribute('aria-selected') !== 'true') b.click();
    return waitFor(() => $(`.video-panel [role="tabpanel"][aria-labelledby="${b.id}"]`), `the ${name} tab open`);
  }
  // the «Fotografias» block (in «Modelo», after the galleries), opened when it is folded
  async function photosGroup() {
    await videoTab('Modelo');
    const g = await waitFor(() => $$('.video-panel .group').find((x) => /^\s*Fotografias\s*$/.test(x.querySelector('h3').textContent)), 'the «Fotografias» block');
    const t = g.querySelector('.group-toggle');
    if (t && t.getAttribute('aria-expanded') === 'false') { t.click(); await waitFor(() => t.getAttribute('aria-expanded') === 'true', '«Fotografias» to open'); }
    return g;
  }
  const items = () => $$('.video-panel .vf-item');
  const dialog = () => $('.modal.frame-sheet');
  async function open(btn) {
    btn.click();
    const d = await waitFor(() => dialog() && !$('.modal-back.closing') && dialog().querySelector('.frame-photo canvas'), 'the «Enquadrar» dialog');
    await waitFor(() => d.closest('.modal').querySelector('.frame-photo').getBoundingClientRect().width > 40, 'the photo in the dialog');
    return dialog();
  }
  const focusOf = (d, id) => d.video.photos.focus && d.video.photos.focus[id];
  const near = (a, b) => Math.abs(a - b) < 0.03;
  let id = null, btn = null;

  test('framing: «Fotografias» lists the photos of the video, each with «Enquadrar»', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo'])) void s;
    await videoTab('Modelo');
    const card = byText('.video-panel .motion-card', /Colagem/);
    if (card.getAttribute('aria-checked') !== 'true') card.click();
    await saved((d) => d.video.motion === 'colagem');
    await photosGroup();
    const list = await waitFor(() => (items().length ? items() : null), 'the video\'s photos', 20000);
    assert(list.length <= RS.model.MAX_VIDEO_PHOTOS, `${list.length} photos listed`);
    for (const it of list) {
      assert(it.dataset.photoId, 'a photo without its id');
      assert(/^Enquadrar a fotografia \d+/.test(it.getAttribute('aria-label') || ''), `«${it.getAttribute('aria-label')}»`);
      assert(/Enquadrar/.test(it.textContent), 'no «Enquadrar» on the thumbnail');
      assert(it.querySelector('canvas').getAttribute('aria-hidden') === 'true', 'the thumbnail is not hidden from screen readers');
    }
    btn = list[0];
    id = btn.dataset.photoId;
  });

  test('framing: dragging the point saves it for that photo and the stage is prepared again', async () => {
    const real = RS.motion.prepare;
    const seen = [];
    RS.motion.prepare = (p, o) => { seen.push(p.video && p.video.photos && p.video.photos.focus ? p.video.photos.focus[id] : null); return real(p, o); };
    try {
      const d = await open(btn);
      assertEqual(d.getAttribute('role'), 'dialog');
      assertEqual(d.getAttribute('aria-modal'), 'true');
      assertEqual(document.getElementById(d.getAttribute('aria-labelledby')).textContent.trim(), 'Enquadrar fotografia');
      assert(d.querySelector('.modal-head .icon-btn[aria-label="Fechar"]'), 'no «Fechar»');
      assertEqual(d.querySelector('.frame-photo canvas').getAttribute('aria-hidden'), 'true');
      const stage = d.querySelector('.frame-photo');
      const r = stage.getBoundingClientRect();
      const ev = (type, fx, fy) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
      ev('pointerdown', 0.6, 0.6);
      ev('pointermove', 0.45, 0.65);
      ev('pointermove', 0.3, 0.7);
      ev('pointerup', 0.3, 0.7);
      const data = await saved((x) => focusOf(x, id) && near(focusOf(x, id).x, 0.3) && near(focusOf(x, id).y, 0.7));
      assert(Object.keys(data.video.photos.focus).length === 1, JSON.stringify(data.video.photos.focus));
      await waitFor(() => seen.some((f) => f && near(f.x, 0.3) && near(f.y, 0.7)), 'the stage to be prepared with the new point', 8000);
      const dotEl = d.querySelector('.frame-dot');
      assert(Math.abs(parseFloat(dotEl.style.left) - 30) < 3 && Math.abs(parseFloat(dotEl.style.top) - 70) < 3, `the point is drawn at ${dotEl.style.left}, ${dotEl.style.top}`);
    } finally {
      RS.motion.prepare = real;
    }
  });

  test('framing: the arrow keys move the point; Escape closes and gives the focus back', async () => {
    const d = dialog();
    const dotEl = d.querySelector('.frame-dot');
    assertEqual(dotEl.getAttribute('role'), 'slider');
    assert(/Ponto/.test(dotEl.getAttribute('aria-label') || ''), dotEl.getAttribute('aria-label'));
    dotEl.focus();
    const before = dotEl.getAttribute('aria-valuetext');
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowUp']) dotEl.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await saved((x) => focusOf(x, id) && near(focusOf(x, id).x, 0.34) && near(focusOf(x, id).y, 0.68));
    assert(dotEl.getAttribute('aria-valuetext') !== before, 'the point does not say where it is');
    dotEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitFor(() => !dialog() && !$('.modal-back'), 'the dialog to close');
    await waitFor(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.photoId === id, 'the focus back on «Enquadrar»', 3000);
  });

  test('framing: the point stays when the photos change between the trades and «Escolher»', async () => {
    const g = await photosGroup();
    byText('.video-panel .seg button', /Escolher/).click();
    const lib = await waitFor(() => { const l = $$('.video-panel .video-photos .lib-item'); return l.length ? l : null; }, 'the photos to pick from', 15000);
    const free = lib.find((b) => b.getAttribute('aria-pressed') !== 'true');
    free.click();
    await saved((x) => x.video.photos.mode === 'chosen' && focusOf(x, id));
    byText('.video-panel .seg button', /Das funções do anúncio/).click();
    const data = await saved((x) => x.video.photos.mode === 'trades');
    assert(focusOf(data, id), 'the point was lost');
    assert(g.isConnected, 'the block was replaced');
  });

  test('framing: «Centrar» goes back to the default point and «Feito» closes', async () => {
    await photosGroup();
    const b = await waitFor(() => items()[0], 'the video\'s photos listed again', 15000);
    const pid = b.dataset.photoId;
    const d = await open(b);
    const dotEl = d.querySelector('.frame-dot');
    const start = dotEl.getAttribute('aria-valuetext');
    dotEl.focus();
    for (let i = 0; i < 5; i++) dotEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await saved((x) => !!focusOf(x, pid));
    byText('.modal.frame-sheet button', /Centrar/).click();
    await saved((x) => !focusOf(x, pid));
    // the photo's own default: where it started unless it had been framed before
    await waitFor(() => (pid === id ? dotEl.getAttribute('aria-valuetext') !== start : dotEl.getAttribute('aria-valuetext') === start), `the point back at the default (${dotEl.getAttribute('aria-valuetext')}, started at ${start})`, 3000);
    byText('.modal.frame-sheet button', /Feito/).click();
    await waitFor(() => !dialog() && !$('.modal-back'), 'the dialog to close');
    assert(!d.isConnected, 'the dialog is still there');
    await sleep(50);
  });

  // RS.motion.prepare counted: the stage's video and the gallery's cards (lite), from a quiet start
  async function counting(fn) {
    const real = RS.motion.prepare;
    const n = { stage: 0, cards: 0 };
    RS.motion.prepare = (p, o) => { if (o && o.lite) n.cards++; else n.stage++; return real(p, o); };
    try {
      await waitFor(async () => { const a = n.stage + n.cards; await sleep(500); return a === n.stage + n.cards; }, 'the video and the gallery to settle', 20000);
      n.stage = 0; n.cards = 0;
      await fn(n);
    } finally { RS.motion.prepare = real; }
  }
  const at = (dotEl) => ({ x: parseFloat(dotEl.style.left) / 100, y: parseFloat(dotEl.style.top) / 100 });

  test('framing: the arrow keys move the point at once and save it when they stop (the video is prepared once)', async () => {
    await photosGroup();
    const b = await waitFor(() => items()[0], 'the video\'s photos', 15000);
    const pid = b.dataset.photoId;
    const d = await open(b);
    const dotEl = d.querySelector('.frame-dot');
    await counting(async (n) => {
      const start = at(dotEl);
      const dir = start.x > 0.5 ? -1 : 1, key = dir < 0 ? 'ArrowLeft' : 'ArrowRight';
      const want = start.x + dir * 0.1;
      dotEl.focus();
      for (let i = 0; i < 5; i++) {
        dotEl.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: i > 0, bubbles: true, cancelable: true }));
        await sleep(70);
        assert(Math.abs(at(dotEl).x - (start.x + dir * 0.02 * (i + 1))) < 0.006, `key ${i + 1}: the point is at ${at(dotEl).x} (from ${start.x})`);
      }
      await H.saved((x) => focusOf(x, pid) && near(focusOf(x, pid).x, want) && near(focusOf(x, pid).y, start.y));
      await sleep(900); // the stage would be prepared after each saved step
      assert(n.stage <= 1, `the video was prepared ${n.stage} times for 5 keys`);
      assertEqual(n.cards, 0, 'the gallery\'s cards were prepared again for a framing');
    });
  });

  test('framing: a cancelled drag keeps the last point reached, not the corner', async () => {
    const d = dialog();
    const stage = d.querySelector('.frame-photo');
    const r = stage.getBoundingClientRect();
    const pid = $$('.video-panel .vf-item')[0].dataset.photoId;
    const ev = (type, fx, fy) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
    ev('pointerdown', 0.6, 0.6);
    ev('pointermove', 0.4, 0.3);
    // the browser takes the touch over (a scroll): the event has no place on the photo
    stage.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 }));
    const data = await H.saved((x) => focusOf(x, pid) && (near(focusOf(x, pid).x, 0.4) || focusOf(x, pid).x < 0.05));
    assertEqual([focusOf(data, pid).x, focusOf(data, pid).y].map((v) => Math.round(v * 100)), [40, 30], 'the point saved after the cancel');
    const dotEl = d.querySelector('.frame-dot');
    assert(near(at(dotEl).x, 0.4) && near(at(dotEl).y, 0.3), `the point is drawn at ${dotEl.style.left}, ${dotEl.style.top}`);
  });

  test('framing: Ctrl+Z with the dialog open puts the point back where the ad has it', async () => {
    const d = dialog();
    const stage = d.querySelector('.frame-photo');
    const dotEl = d.querySelector('.frame-dot');
    const pid = $$('.video-panel .vf-item')[0].dataset.photoId;
    await sleep(1300); // a new step of the history (framings in a row make one)
    const r = stage.getBoundingClientRect();
    const ev = (type, fx, fy) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
    ev('pointerdown', 0.7, 0.8);
    ev('pointerup', 0.7, 0.8);
    await H.saved((x) => focusOf(x, pid) && near(focusOf(x, pid).x, 0.7) && near(focusOf(x, pid).y, 0.8));
    dotEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await H.saved((x) => focusOf(x, pid) && near(focusOf(x, pid).x, 0.4) && near(focusOf(x, pid).y, 0.3));
    await waitFor(() => near(at(dotEl).x, 0.4) && near(at(dotEl).y, 0.3), `the point back at 40 %, 30 % (it is at ${dotEl.style.left}, ${dotEl.style.top})`, 3000);
    byText('.modal.frame-sheet button', /Feito/).click();
    await waitFor(() => !dialog() && !$('.modal-back'), 'the dialog to close');
  });

  test('framing: «Cinema» lists only the photo it shows; a style with cards lists them too', async () => {
    await videoTab('Modelo');
    byText('.video-panel .motion-card', /Cinema/).click();
    await H.saved((x) => x.video.motion === 'cinema');
    await photosGroup();
    await waitFor(() => items().length === 1, `Cinema's one photo (${items().length} listed)`, 20000);
    byText('.video-panel .motion-card', /Néon/).click();
    await H.saved((x) => x.video.motion === 'neon');
    await waitFor(() => items().length > 1, `Néon's photos (${items().length} listed)`, 20000);
  });
})();
