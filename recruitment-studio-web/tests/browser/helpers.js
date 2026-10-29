// Shared helpers for the browser cases (not shipped): DOM lookups, waiting on
// a condition instead of fixed pauses, synthetic photos and sounds, MP4 bytes.
window.H = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const byText = (sel, re) => $$(sel).find((e) => re.test(e.textContent));
  const idle = () => !document.documentElement.classList.contains('is-busy');
  async function waitFor(fn, what, ms = 15000) {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
      await sleep(40);
    }
  }
  // A person's next action is a later task: Preact has rendered by then.
  const settle = () => sleep(0);
  const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const pick = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
  // The newest saved ad once `check(data)` holds (autosave runs after edits stop).
  async function saved(check = () => true, name) {
    return waitFor(async () => {
      const recs = (await RS.store.listProjects()).filter((r) => !r.deletedAt && (!name || r.data.name === name)).sort((a, b) => b.updatedAt - a.updatedAt);
      return recs[0] && check(recs[0].data) ? recs[0].data : null;
    }, 'the ad to be saved', 8000);
  }
  // Coloured gradients with a shape: visible "photos" for the motion scenes.
  function fakePhoto(i, w = 360, h = 480) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, `hsl(${(i * 47) % 360} 60% 45%)`);
    gr.addColorStop(1, `hsl(${(i * 47 + 90) % 360} 60% 25%)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(w * 0.35, h * 0.4, w * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(w * 0.55, h * 0.6, w * 0.3, h * 0.25);
    return c;
  }
  // 16-bit PCM WAV of a mono tone.
  async function toneWav(seconds, rate = 44100, hz = 440) {
    const ac = new OfflineAudioContext(1, Math.round(seconds * rate), rate);
    const o = ac.createOscillator();
    o.frequency.value = hz;
    const g = ac.createGain(); g.gain.value = 0.5;
    o.connect(g).connect(ac.destination);
    o.start(0);
    const pcm = (await ac.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (at, s) => { for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return out.buffer;
  }
  // Index of an ASCII box name ("moov", "soun", …) in a file's bytes, or -1.
  function findBytes(b, s) {
    const k = [...s].map((c) => c.charCodeAt(0));
    outer: for (let i = 0; i < b.length - k.length; i++) {
      for (let j = 0; j < k.length; j++) if (b[i + j] !== k[j]) continue outer;
      return i;
    }
    return -1;
  }
  const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

  // ---------------------------------------------------------------- the premium feel
  // Resolves once every running animation and transition has finished (at most 1.5 s;
  // endless ones — spinners, shimmers — are left running).
  async function settleAnimations(max = 1500) {
    const t0 = Date.now();
    await sleep(30);
    while (Date.now() - t0 < max) {
      const busy = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
      if (!busy.length) return;
      await sleep(40);
    }
  }
  // CSS colour → [r, g, b, a] (rgb(), rgba() and color(srgb …) as browsers serialise them).
  function rgba(css) {
    let m = /^rgba?\(([^)]+)\)$/.exec(css);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = /^color\(srgb ([^)]+)\)$/.exec(css);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
    }
    return css === 'transparent' ? [0, 0, 0, 0] : null;
  }
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // The background a text sits on: the semi-transparent layers up its ancestors,
  // composited over the first opaque one (the page's when none is).
  // The gliding pill (RS.ui.glide) is a sibling under the chosen option: it counts
  // as that option's background where it covers the text's centre.
  function pillUnder(n, el) {
    const host = n.parentElement;
    if (!host || !host.classList.contains('has-glide')) return null;
    const pill = host.querySelector(':scope > .glide-pill');
    if (!pill || Number(getComputedStyle(pill).opacity) < 0.5) return null;
    const p = pill.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    return x >= p.left && x <= p.right && y >= p.top && y <= p.bottom ? rgba(getComputedStyle(pill).backgroundColor) : null;
  }
  function backdrop(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      for (const c of [rgba(getComputedStyle(n).backgroundColor), pillUnder(n, el)]) {
        if (!c || !c[3]) continue;
        layers.push(c);
        if (c[3] >= 0.99) break;
      }
      if (layers.length && layers[layers.length - 1][3] >= 0.99) break;
    }
    let base = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] < 0.99) base = rgba(getComputedStyle(document.body).backgroundColor) || base;
    return layers.reverse().reduce((acc, l) => over(l, acc), base);
  }
  const SKIP = 'canvas, .poster-wrap, .motion-card, .poster-thumb, .proj-thumb, .tpl-canvas, .lib-item, .sr-only, [aria-hidden="true"], [disabled], [aria-disabled="true"]';
  // Opacity of the element and its ancestors together.
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  // Every visible text under root that reads below WCAG AA: its own text (or an
  // input's value or placeholder) against the background it sits on. Dimmed states
  // (half transparent or less: hidden blocks, busy grids) are left out like disabled ones.
  function contrastIssues(root = document.body) {
    const out = [];
    const check = (el, color, text) => {
      const cs = getComputedStyle(el);
      const op = opacityOf(el);
      if (op <= 0.5) return;
      const fg = rgba(color);
      if (!fg || !fg[3]) return;
      const bg = backdrop(el);
      const ink = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const r = ratio(ink, bg);
      if (r < need) out.push({ text: text.trim().slice(0, 40), ratio: r, need, selector: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` });
    };
    for (const el of root.querySelectorAll('*')) {
      if (el.closest(SKIP) || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|range|color|file|hidden)$/.test(el.type)) {
        if (el.value) check(el, cs.color, el.value);
        else if (el.placeholder) check(el, getComputedStyle(el, '::placeholder').color, el.placeholder);
        continue;
      }
      if (el.tagName === 'SELECT') { check(el, cs.color, el.selectedOptions[0] ? el.selectedOptions[0].text : ''); continue; }
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join(' ');
      if (own) check(el, cs.color, own);
    }
    return out;
  }
  // Drives the app through its interface to each named screen and yields its name:
  // 'home', 'gallery', 'editor:<section>' or 'editor:<piece>/<section>' (the newest
  // ad; pieces Imagem · Carrossel · Vídeo, sections Oferta · Contactos · Fotos ·
  // Estilo · Sequência), 'export'.
  async function closeExport() {
    const x = $('.modal.export .modal-head .icon-btn');
    if (x) { x.click(); await waitFor(() => !$('.modal-back'), 'the export dialog to close', 4000); }
  }
  async function goHome() {
    // a case run alone (TEST_GREP) starts before the app has drawn its first screen
    await waitFor(() => $('.home') || $('.editor') || $('.gallery'), 'the app', 15000);
    await closeExport();
    if ($('.home')) return;
    const back = $('.editor .topbar .btn.ghost') || $('.gallery .gal-head .btn.ghost');
    back.click();
    await waitFor(() => $('.home') && idle(), 'the home screen', 15000);
  }
  async function* visitScreens(list) {
    for (const screen of list) {
      const [name, section] = screen.split(':');
      if (name === 'home') await goHome();
      else if (name === 'gallery') {
        await goHome();
        $('.new-ad').click();
        await waitFor(() => $$('.tpl-card').length && idle() && $$('.tpl-card .poster-thumb.drawn').length, 'the gallery', 20000);
      } else if (name === 'editor') {
        await closeExport();
        if (!$('.editor')) {
          await goHome();
          await waitFor(() => $('.proj-open'), 'an ad on the home screen');
          $('.proj-open').click();
          await waitFor(() => $('.editor') && idle(), 'the editor', 15000);
        }
        const [piece, sec] = section.includes('/') ? section.split('/') : [null, section];
        if (piece) {
          const p = byText('.editor .topbar [aria-label="Peça"] [role="radio"]', new RegExp(`^\\s*${piece}\\s*$`));
          if (p.getAttribute('aria-checked') !== 'true') p.click();
          await waitFor(() => (piece === 'Vídeo' ? $('.video-stage') : piece === 'Carrossel' ? $('.carousel-stage') : $('.workspace canvas.poster')), `the ${piece} piece`);
        }
        const b = byText('.editor .rail button', new RegExp(`^\\s*${sec}\\s*$`));
        if (b.getAttribute('aria-selected') !== 'true') b.click();
        await waitFor(() => $(`.panel[aria-label="${sec}"]`), `the ${sec} panel`);
      } else if (name === 'export') {
        if (!$('.editor')) throw new Error('export: open the editor first');
        if (!$('.modal.export')) $('.editor .topbar button[title^="Exportar"]').click();
        await waitFor(() => $('.modal.export') && !$('.modal-back.closing'), 'the export dialog');
      }
      await sleep(120);
      await settleAnimations();
      yield screen;
    }
  }
  return { sleep, $, $$, byText, idle, waitFor, settle, type, pick, saved, fakePhoto, toneWav, findBytes, bytesOf, settleAnimations, contrastIssues, visitScreens, closeExport, goHome, rgba };
})();
