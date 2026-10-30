// Interface on a small phone (run-mobile.html, opened in a 360 × 740 window): the
// editor's section bar floats over the screen like Instagram's — whole, above
// the bottom edge, on top of everything under it; the panel scrolls clear of
// it; it steps aside while a text is typed; messages show above it.
(() => {
  const { sleep, $, $$, byText, idle, waitFor } = window.H;
  const rect = (el) => el.getBoundingClientRect();
  const name = (b) => b.textContent.trim();

  // The bar floats (fixed) with room around it; every button is whole, big
  // enough to touch and not covered by anything.
  function checkBar() {
    const bar = $('.editor .rail');
    assert(bar, 'no section bar');
    assertEqual(getComputedStyle(bar).position, 'fixed');
    const r = rect(bar);
    assert(r.bottom <= innerHeight - 12, `the bar touches the bottom edge (${Math.round(innerHeight - r.bottom)} px left)`);
    assert(r.left >= 8 && r.right <= innerWidth - 8, 'the bar touches the sides');
    for (const b of $$('.editor .rail button')) {
      const q = rect(b);
      assert(q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5 && q.left >= r.left - 0.5 && q.right <= r.right + 0.5, `«${name(b)}» is cut`);
      assert(q.height >= 44 && q.width >= 44, `«${name(b)}» is too small to touch`);
      const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      assert(hit && b.contains(hit), `«${name(b)}» is covered by ${hit ? hit.className || hit.tagName : 'nothing'}`);
      // its word is whole inside it (so it never runs into the next one)
      const word = [...b.children].find((c) => c.tagName === 'SPAN' && c.textContent.trim());
      const range = document.createRange();
      range.selectNodeContents(word);
      const w = range.getBoundingClientRect();
      assert(w.left >= q.left - 0.5 && w.right <= q.right + 0.5, `the word «${name(b)}» spills out of its button (${Math.round(w.width)} px in ${Math.round(q.width)} px)`);
    }
    return r;
  }
  // Scrolled to its end, the panel's last block ends above the bar.
  async function clearOfBar(what) {
    const panel = $('.editor .panel');
    panel.scrollTop = panel.scrollHeight;
    await sleep(80);
    const last = panel.querySelector('.panel-inner').lastElementChild;
    const bar = checkBar();
    assert(rect(last).bottom <= bar.top - 4, `${what}: the last block ends under the bar (${Math.round(rect(last).bottom - bar.top)} px)`);
  }
  // What the home showed, from its very first paint (this case file loads before the app is ready).
  const homeSeen = [];
  const homeWatch = new MutationObserver(() => {
    const h = document.querySelector('.home');
    if (!h) return;
    const now = h.querySelector('.empty-site') ? 'site' : h.querySelector('.card-grid') ? 'grid' : 'none';
    if (homeSeen[homeSeen.length - 1] !== now) homeSeen.push(now);
  });
  homeWatch.observe(document.getElementById('app'), { childList: true, subtree: true });
  const section = async (label) => {
    byText('.editor .rail button', new RegExp(`^\\s*${label}\\s*$`)).click();
    await waitFor(() => $(`.panel[aria-label="${label}"]`), `the ${label} panel`);
    await sleep(350); // the panel's entrance
  };
  // the piece on screen (2026-10-27: Imagem · Carrossel · Vídeo in the top bar)
  const piece = async (label) => {
    const b = byText('.editor .topbar [aria-label="Peça"] [role="radio"]', new RegExp(`^\\s*${label}\\s*$`));
    if (b.getAttribute('aria-checked') !== 'true') b.click();
    await waitFor(() => (label === 'Vídeo' ? $('.video-stage') : label === 'Carrossel' ? $('.carousel-stage') : $('.workspace canvas.poster')), `the ${label} piece`);
    await sleep(350);
  };

  // the panel to one of its stops (2026-10-29: top · middle · bottom) through its chevron
  const toStop = async (stop) => {
    for (let i = 0; i < 3 && !$(`.editor.sheet-${stop}`); i++) { $('.sheet-toggle').click(); await sleep(450); }
    assert($(`.editor.sheet-${stop}`), `the panel did not reach ${stop}`);
  };

  test('home: no ads yet shows the building site and the button', async () => {
    await waitFor(() => $('.home') && idle(), 'home');
    assert(innerWidth <= 380 && $('.home-top').scrollWidth <= innerWidth, `the home is not phone-sized: ${innerWidth} px, its top bar ${$('.home-top').scrollWidth} px`);
    const site = await waitFor(() => $('.home .empty-site'), 'the building site');
    assert(site.querySelector('svg'), 'no drawing');
    const cta = site.querySelector('.new-ad');
    assert(cta && /Novo anúncio/.test(cta.textContent), 'the crane holds no «Novo anúncio» bubble');
    const plus = rect(cta.querySelector('.new-plus .ico')), circle = rect(cta.querySelector('.new-plus'));
    assert(plus.left >= circle.left && plus.right <= circle.right && plus.top >= circle.top && plus.bottom <= circle.bottom, 'the «+» is outside its circle');
    const r = rect(site);
    assert(r.left >= 0 && r.right <= innerWidth, `the site leaves the screen (${Math.round(r.left)}–${Math.round(r.right)})`);
    assert(/Ainda não há anúncios/.test($('.home').textContent), 'no words for the empty home');
    homeWatch.disconnect();
    assert(!homeSeen.includes('grid'), `the empty home showed the card grid first (${homeSeen.join(' → ')})`);
  });

  // «Instalar» lives in the home's ⋯ (2026-10-27): opens ⋯ (once) and gives the item
  const installBtn = () => { if (!$('.home-menu')) { const m = $('.home-top .home-more'); if (!m) return null; m.click(); } return $('.home-menu .install-item'); };
  test('mobile: the iPhone guide fits the phone', async () => {
    const realDetect = RS.install.detect;
    RS.install.detect = () => 'ios-safari';
    try {
      const b = await waitFor(installBtn, 'the install item');
      assert(rect(b).right <= innerWidth && $('.home-top').scrollWidth <= innerWidth, `the home bar is wider than the phone (${$('.home-top').scrollWidth} px)`);
      b.click();
      const steps = await waitFor(() => $$('.modal.install .install-step').length === 3 && $$('.modal.install .install-step'), 'the three steps');
      await sleep(450);
      for (const s of steps) {
        const r = rect(s);
        assert(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, `«${name(s)}» leaves the screen (${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}–${Math.round(r.bottom)})`);
      }
      const demo = $('.modal.install .install-demo');
      assert(demo, 'no drawing of the browser on the phone');
      const d = rect(demo);
      assert(d.left >= 0 && d.right <= innerWidth && d.top >= 0 && d.bottom <= innerHeight, `the drawing leaves the screen (${Math.round(d.left)}–${Math.round(d.right)} × ${Math.round(d.top)}–${Math.round(d.bottom)})`);
      assert(document.documentElement.scrollWidth <= innerWidth, 'the page slides sideways');
      $('.modal.install .modal-head .icon-btn').click();
      await waitFor(() => !$('.modal.install'), 'the guide to close');
    } finally { RS.install.detect = realDetect; }
  });

  test('mobile: the section bar floats above the bottom edge, whole and on top', async () => {
    assert(innerWidth <= 380, `the page is not phone-sized: ${innerWidth} × ${innerHeight}`);
    await waitFor(() => $('.home') && idle() && $('.new-ad'), 'home');
    $('.new-ad').click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
    $$('.tpl-card')[0].click();
    await waitFor(() => $('.editor') && idle(), 'editor');
    await sleep(400);
    checkBar();
    // «Balão» (2026-10-28): «Exportar» is in the top bar, not on the floating bar
    assertEqual($$('.editor .rail button').map(name), ['Oferta', 'Contactos', 'Fotos', 'Estilo']);
  });

  test('mobile: the editor is never wider than the phone', async () => {
    for (const mode of ['Imagem', 'Carrossel', 'Vídeo']) {
      await piece(mode);
      const wide = $$('.editor *').filter((e) => e.getClientRects().length && rect(e).right > screen.width + 0.5 && !e.closest('.chips-row, .locales-chips, .carousel-stage'));
      assert(document.documentElement.scrollWidth <= screen.width, `${mode}: the page is ${document.documentElement.scrollWidth} px wide on a ${screen.width} px phone (${wide.slice(0, 4).map((e) => e.className || e.tagName).join(', ')}; top bar: ${[...$('.topbar').children].map((e) => `${e.className || e.tagName} ${Math.round(rect(e).width)}`).join(' | ')})`);
    }
    await piece('Imagem');
  });

  test('mobile: every panel of the three pieces scrolls clear of the bar', async () => {
    for (const label of ['Oferta', 'Contactos', 'Fotos', 'Estilo']) {
      await section(label);
      await clearOfBar(label);
    }
    for (const p of ['Carrossel', 'Vídeo']) {
      await piece(p);
      for (const label of ['Fotos', 'Estilo', 'Sequência']) {
        await section(label);
        await clearOfBar(`${p} › ${label}`);
      }
    }
    await piece('Imagem');
    await section('Oferta');
  });

  // «Balão» (2026-10-28): row 1 is back, the name (two lines) and «Exportar»; row 2 the pieces;
  // the formats, the language, undo, redo and the ⋯ run along the poster's bottom edge
  // «Sem barra» (2026-10-29): ‹ (with the save dot), the pieces and «Exportar» float in one row
  // over the preview, each big enough to touch and on top; the name is in the ⋯
  test('mobile: the floating top is one row of ‹, the pieces and Exportar; the floating bar holds at most six', async () => {
    for (const p of ['Imagem', 'Carrossel', 'Vídeo']) {
      await piece(p);
      assert(!$('.editor .topbar .name-wrap'), `${p}: the name is still on top`);
      const back = $('.editor .topbar .tb-back'), pieces = $('.editor .topbar [aria-label="Peça"]'), exp = $('.editor .topbar .tb-right .btn.primary');
      const rb = rect(back), rp = rect(pieces), re = rect(exp);
      for (const [what, r] of [['back', rb], ['the pieces', rp], ['Exportar', re]]) {
        assert(r.left >= -0.5 && r.right <= innerWidth + 0.5, `${p}: ${what} leaves the screen (${Math.round(r.left)}–${Math.round(r.right)} of ${innerWidth})`);
      }
      assert(Math.abs(rb.top - re.top) < 8 && Math.abs((rp.top + rp.bottom) / 2 - (rb.top + rb.bottom) / 2) < 8 && rp.left >= rb.right && re.left >= rp.right, `${p}: back, the pieces and Exportar are not one row`);
      for (const b of [back, exp, ...pieces.querySelectorAll('[role="radio"]')]) {
        const q = rect(b);
        assert(q.width >= 40 && q.height >= 36, `${p}: «${b.getAttribute('aria-label') || name(b)}» is too small to touch (${Math.round(q.width)}×${Math.round(q.height)})`);
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        assert(hit && b.contains(hit), `${p}: «${b.getAttribute('aria-label') || name(b)}» is covered by ${hit ? hit.className || hit.tagName : 'nothing'}`);
      }
      checkBar();
      assert($$('.editor .rail button').length <= 6, `${p}: ${$$('.editor .rail button').length} buttons on the floating bar`);
    }
    await piece('Imagem');
  });

  test('mobile: the poster takes about half the screen', async () => {
    await piece('Imagem');
    await toStop('middle');
    await waitFor(() => $('.workspace canvas.poster') && rect($('.workspace canvas.poster')).height > 0, 'the poster');
    await sleep(300);
    const h = rect($('.workspace canvas.poster')).height;
    const parts = ['.topbar', '.preview-content', '.stage', '.stage-tools', '.stage-foot'].map((q) => `${q} ${$(q) ? Math.round(rect($(q)).height) : '-'}`).join(', ');
    assert(h >= 0.4 * innerHeight, `the poster is ${Math.round(h)} px tall on a ${innerHeight} px screen (${parts})`);
  });

  // the name, in the editor's ⋯ (2026-10-29): opens the ⋯ once and gives the field
  const nameField = async () => {
    if ($('.editor.sheet-top')) { document.activeElement && document.activeElement.blur(); await toStop('middle'); } // writing hides the tools row and its ⋯
    if (!$('.editor-menu .name-input')) { $('.editor .editor-more').click(); await waitFor(() => $('.editor-menu .name-input'), 'the name in the ⋯'); await sleep(250); }
    return $('.editor-menu .name-input');
  };
  const closeMenu = async () => { if ($('.editor-menu')) { $('.editor .editor-more').click(); await waitFor(() => !$('.editor-menu'), 'the ⋯ to close'); } };

  test('mobile: a long name stays in the ⋯ and keeps the top whole', async () => {
    await piece('Imagem');
    await toStop('middle');
    const field = await nameField();
    H.type(field, 'Pedreiros, serventes e mais 1, La Chaux-de-Fonds');
    field.blur();
    await sleep(300);
    const menu = rect($('.editor-menu'));
    assert(menu.left >= 0 && menu.right <= innerWidth + 0.5 && menu.top >= 0 && menu.bottom <= innerHeight, `the ⋯ leaves the screen (${Math.round(menu.left)}–${Math.round(menu.right)} × ${Math.round(menu.top)}–${Math.round(menu.bottom)})`);
    await closeMenu();
    const exp = rect($('.editor .topbar .tb-right .btn.primary'));
    assert(exp.left >= 0 && exp.right <= innerWidth + 0.5, `Exportar is cut (${Math.round(exp.left)}–${Math.round(exp.right)} of ${innerWidth})`);
    assert(document.documentElement.scrollWidth <= screen.width, `the page is ${document.documentElement.scrollWidth} px wide`);
  });

  // (the review found the row 377 px wide with two languages on a 360 px phone, 469 px in Story)
  test('mobile: with two languages, in Retrato and in Story, the stage tools stay on the phone', async () => {
    await piece('Imagem');
    await toStop('middle');
    if ($$('.stage-tools .locales-chips > *').length < 2) {
      $('.stage-tools .locales .chip.add').click();
      (await waitFor(() => $$('.editor .locales .menu [role="menuitem"]').find((b) => /Fran/.test(b.textContent)), 'French in the menu')).click();
      await waitFor(() => $$('.stage-tools .locales-chips > *').length >= 2, 'the second language');
      await sleep(400);
    }
    try {
      for (const fmt of ['Retrato', 'Story']) {
        $(`.stage-tools [role="radio"][aria-label^="${fmt}"]`).click();
        await sleep(600);
        assert(document.documentElement.scrollWidth <= screen.width, `${fmt}: the page is ${document.documentElement.scrollWidth} px wide on a ${screen.width} px phone`);
        for (const b of $$('.stage-tools button, .stage-tools label')) {
          if (!b.getClientRects().length) continue;
          const q = rect(b);
          assert(q.left >= -0.5 && q.right <= screen.width + 0.5, `${fmt}: «${b.getAttribute('aria-label') || name(b)}» is off the screen (${Math.round(q.left)}–${Math.round(q.right)} of ${screen.width})`);
        }
      }
    } finally {
      $('.stage-tools [role="radio"][aria-label^="Retrato"]').click();
      await sleep(400);
    }
  });

  // deferred minor (2026-10-29): on a phone the tape measure and its size stay on the poster
  test('mobile: Ilustrativo, the tape measure and its size stay on the poster in Story', async () => {
    await piece('Imagem');
    await toStop('middle');
    const before = RS.appearance.get().motion;
    RS.appearance.set({ motion: 'illustrative' });
    try {
      $('.stage-tools [role="radio"][aria-label^="Story"]').click();
      const tape = await waitFor(() => $('.tape-measure'), 'the tape measure', 1500);
      await sleep(300);
      const wrap = rect($('.workspace .poster-wrap')), t = rect(tape), d = rect(tape.querySelector('.dims'));
      assert(t.right <= screen.width + 0.5 && d.right <= screen.width + 0.5 && d.left >= -0.5, `the tape or its size is off the screen (${Math.round(t.right)}, ${Math.round(d.left)}–${Math.round(d.right)} of ${screen.width})`);
      assert(d.bottom <= wrap.bottom + 0.5, `the size sits under the poster, over the tools (${Math.round(d.bottom)} > ${Math.round(wrap.bottom)})`);
    } finally {
      RS.appearance.set({ motion: before });
      $('.stage-tools [role="radio"][aria-label^="Retrato"]').click();
      await sleep(1000);
    }
  });

  test('mobile: the name field is at least 16 px, so an iPhone does not zoom in', async () => {
    const f = await nameField();
    assert(parseFloat(getComputedStyle(f).fontSize) >= 16, `the name is ${getComputedStyle(f).fontSize}`);
    await closeMenu();
  });

  test('mobile: the top stop while writing', async () => {
    await section('Oferta');
    const field = await waitFor(() => $('#f-headline'), 'the headline');
    field.focus();
    await sleep(450);
    assert($('.editor.sheet-top'), 'writing did not take the panel to the top');
    const h = rect($('.workspace canvas.poster')).height;
    assert(h <= 0.22 * innerHeight, `the poster stays ${Math.round(h)} px tall while writing on a ${innerHeight} px screen`);
    field.blur();
    $('.sheet-toggle').click();
    await sleep(450);
    assert(!$('.editor.sheet-top'), 'the chevron did not bring the poster back');
    await toStop('middle');
  });

  // 2026-10-29: the preview ends where the panel starts and is clipped there, so nothing
  // of the stage (timeline, «Escolher capa», notes, chips) is ever drawn over the panel
  test('mobile: at every stop nothing of the stage reaches the panel', async () => {
    for (const p of ['Imagem', 'Carrossel', 'Vídeo']) {
      await piece(p);
      for (const stop of ['middle', 'top', 'bottom']) {
        await toStop(stop);
        await sleep(200);
        const shell = $('.preview-shell'), panel = $('.editor .panel');
        const sr = rect(shell), pr = rect(panel);
        assert(sr.bottom <= pr.top + 0.5, `${p} at ${stop}: the preview ends at ${Math.round(sr.bottom)}, under the panel's top ${Math.round(pr.top)}`);
        assertEqual(getComputedStyle(shell).overflow, 'hidden', `${p} at ${stop}: the preview is not clipped`);
        if (p === 'Carrossel' && stop !== 'top') {
          const count = await waitFor(() => { const c = $('.carousel-stage .cs-track .cs-badge'); return c && /^01 \/ 0\d/.test(c.textContent.trim()) && c; }, 'the counter «01 / 0N» on the slide');
          const cr = rect(count), sr = rect($('.carousel-stage .cs-main'));
          assert(cr.left >= sr.left && cr.right <= sr.right + 0.5 && cr.top >= sr.top - 0.5 && cr.bottom <= sr.bottom, 'the counter is off the slide');
          const row = $('.carousel-stage .tools-row');
          const rr = rect(row), out = [...row.querySelectorAll('button, .locales')].filter((e) => e.getClientRects().length && (rect(e).right > rr.right + 0.5 || rect(e).left < rr.left - 0.5));
          assert(rr.right <= innerWidth && !out.length, 'the carousel tools row cuts ' + out.map((e) => e.getAttribute('aria-label') || e.className).join(', '));
        }
        const main = $('.preview-shell canvas.poster, .preview-shell .cs-main');
        if (main && rect(main).height > 0) {
          const m = rect(main);
          assert(m.bottom <= pr.top + 0.5, `${p} at ${stop}: the picture runs under the panel (${Math.round(m.bottom)} > ${Math.round(pr.top)})`);
        }
      }
      await toStop('middle');
    }
    await piece('Imagem');
  });

  // 2026-10-29: the video is a player; its buttons fit it at every stop (fewer when it is small)
  test('mobile: the player fits its tier at every stop', async () => {
    await piece('Vídeo');
    for (const stop of ['middle', 'bottom', 'top']) {
      await toStop(stop);
      const player = await waitFor(() => $('.video-stage .player'), 'the player');
      player.click(); // the buttons up
      await waitFor(() => $('.player.ctl'), 'the buttons');
      await sleep(300);
      const c = rect($('.video-stage canvas.poster'));
      for (const b of $$('.player button, .player input')) {
        if (!b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') continue;
        const q = rect(b);
        assert(q.left >= c.left - 0.5 && q.right <= c.right + 0.5 && q.top >= c.top - 0.5 && q.bottom <= c.bottom + 0.5,
          `at ${stop} (${[...player.classList].join(' ')}): «${b.getAttribute('aria-label') || name(b)}» leaves the video (${Math.round(q.left)}–${Math.round(q.right)} × ${Math.round(q.top)}–${Math.round(q.bottom)} in ${Math.round(c.left)}–${Math.round(c.right)} × ${Math.round(c.top)}–${Math.round(c.bottom)})`);
      }
      if (stop === 'top') assert(!player.classList.contains('tier-full'), 'all the buttons on a strip of video');
    }
    await toStop('middle');
  });

  test('mobile: full screen covers the phone and stays vertical', async () => {
    await piece('Vídeo');
    await toStop('middle');
    $('.video-stage .player').click();
    (await waitFor(() => $('.player [aria-label="Ecrã inteiro"]'), '⛶')).click();
    await waitFor(() => $('.editor.player-full'), 'full screen');
    await sleep(400);
    const sh = rect($('.preview-shell')), c = rect($('.video-stage canvas.poster'));
    assert(sh.top <= 0.5 && sh.left <= 0.5 && sh.right >= innerWidth - 0.5 && sh.bottom >= innerHeight - 0.5, `the player does not cover the phone (${Math.round(sh.left)},${Math.round(sh.top)}–${Math.round(sh.right)},${Math.round(sh.bottom)})`);
    assert(c.height > c.width && c.height >= innerHeight * 0.85, `the video is ${Math.round(c.width)}×${Math.round(c.height)} in full screen`);
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight - 30);
    assert(hit && !hit.closest('.rail, .panel'), 'the bar or the panel shows through');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !$('.editor.player-full'), 'Escape to leave');
    await sleep(300);
    await piece('Imagem');
  });

  test('mobile: the panel follows the finger and snaps', async () => {
    await toStop('middle');
    const head = $('.sheet-head'), panel = $('.editor .panel');
    const h = rect(head), x = h.left + h.width / 3, y0 = h.top + h.height / 2;
    const ev = (type, y) => head.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }));
    ev('pointerdown', y0);
    for (let i = 1; i <= 8; i++) { ev('pointermove', y0 - 25 * i); await sleep(16); }
    assert(/^translateY\(-/.test(panel.style.transform), `the panel does not follow the finger (${panel.style.transform || 'no transform'})`);
    ev('pointerup', y0 - 200);
    await waitFor(() => $('.editor.sheet-top'), 'the panel to snap to the top');
    await sleep(500);
    assertEqual(panel.style.transform, '', 'the panel did not settle');
    await toStop('middle');
  });

  test('mobile: the bar steps aside while a text is typed and comes back', async () => {
    await section('Oferta');
    const field = await waitFor(() => $('.panel input[type="text"], .panel textarea'), 'a text field');
    field.focus();
    await sleep(450);
    const bar = $('.editor .rail');
    const gone = rect(bar).top >= innerHeight || getComputedStyle(bar).visibility === 'hidden';
    assert(gone, `the bar stays over the keyboard (top ${Math.round(rect(bar).top)} of ${innerHeight})`);
    field.blur();
    await sleep(450);
    checkBar();
  });

  test('mobile: the ad\'s name stays readable in the editor\'s ⋯', async () => {
    const field = await nameField();
    const w = rect(field).width;
    assert(w >= 200, `the name field is ${Math.round(w)} px wide`);
    await closeMenu();
  });

  test('mobile: «Definições» is in the editor\'s ⋯ and a sheet of the home, and both fit the phone', async () => {
    // the editor: ⋯ opens a menu inside the screen; «Definições» there opens the settings sheet
    $('.editor .editor-more').click();
    const menu = await waitFor(() => $('.editor .editor-menu'), 'the ⋯ menu');
    await sleep(250);
    const mr = rect(menu);
    assert(mr.left >= 0 && mr.right <= innerWidth && mr.bottom <= innerHeight, `the ⋯ menu leaves the screen: ${Math.round(mr.left)}–${Math.round(mr.right)} × ${Math.round(mr.top)}–${Math.round(mr.bottom)}`);
    for (const b of menu.querySelectorAll('[role="menuitem"]')) assert(rect(b).height >= 40, `«${name(b)}» is too small to touch`);
    byText('.editor .editor-menu [role="menuitem"]', /Definições/).click();
    const panel = await waitFor(() => $('.modal.settings .settings'), '«Definições» from the editor');
    await sleep(500);
    for (const b of panel.querySelectorAll('[role="radio"], label.switch')) {
      const r = rect(b);
      assert(r.height >= 40 && r.left >= 0 && r.right <= innerWidth, `«${name(b)}» is too small to touch or leaves the screen`);
    }
    assert(document.documentElement.scrollWidth <= innerWidth, 'the page slides sideways');
    $('.modal.settings .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal.settings'), 'the sheet to close');
    // the home: a button of the top bar opening a sheet
    $('.editor .topbar .btn.ghost').click();
    await waitFor(() => $('.home') && idle(), 'home');
    const btn = await waitFor(() => $('.home-top .home-more'), 'the home ⋯');
    assert($('.home-top').scrollWidth <= innerWidth && rect(btn).right <= innerWidth, `the home bar is wider than the phone (${$('.home-top').scrollWidth} px)`);
    btn.click();
    (await waitFor(() => byText('.home-menu [role="menuitem"]', /Definições/), '«Definições» in the home ⋯')).click();
    const sheet = await waitFor(() => $('.modal.settings'), 'the «Definições» sheet');
    await sleep(500);
    const r = rect(sheet);
    assert(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1, `the sheet leaves the screen: ${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}–${Math.round(r.bottom)}`);
    for (const b of sheet.querySelectorAll('[role="radio"], label.switch')) assert(rect(b).height >= 40, `«${name(b)}» is too small to touch`);
    $('.modal.settings .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal.settings'), 'the sheet to close');
    // back to the editor for the next cases
    $('.proj-open').click();
    await waitFor(() => $('.editor') && idle(), 'the editor');
    await sleep(400);
  });

  test('mobile: a sheet rises from the bottom with a spring', async () => {
    $('.editor .topbar .tb-right .btn.primary').click(); // «Balão»: «Exportar» is in the top bar
    const sheet = await waitFor(() => $('.modal.export'), 'the export sheet');
    const cs = getComputedStyle(sheet);
    assertEqual(cs.animationName, 'feel-sheet-in');
    assert(/linear\(|cubic-bezier\(0\.34/.test(cs.animationTimingFunction), `not a spring: ${cs.animationTimingFunction}`);
    await sleep(500);
    $('.modal.export .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal-back'), 'the sheet to close');
  });

  test('mobile: the iPhone switches sit over the floating bar\'s buttons', async () => {
    const off = RS.haptics.install(document, { mode: 'ios' });
    try {
      await sleep(50);
      for (const b of $$('.editor .rail button')) {
        const sw = b.querySelector('.haptic-switch');
        assert(sw, `«${name(b)}» has no switch`);
        const q = rect(b), r = rect(sw);
        assert(Math.abs(q.left - r.left) <= 1 && Math.abs(q.right - r.right) <= 1 && Math.abs(q.top - r.top) <= 1 && Math.abs(q.bottom - r.bottom) <= 1, `the switch does not cover «${name(b)}»`);
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        assert(hit && sw.contains(hit), `a tap on «${name(b)}» does not reach its switch (${hit ? hit.className || hit.tagName : 'nothing'})`);
      }
    } finally { off(); }
  });

  // 2026-10-29: an iPhone switch answers drags, so none sits where a scroll starts;
  // the app's own switches keep the system switch over their track only
  test('mobile: no hidden switch inside a scrolling area (iPhone path)', async () => {
    const off = RS.haptics.install(document, { mode: 'ios' });
    try {
      for (const p of ['Imagem', 'Vídeo']) {
        await piece(p);
        for (const label of ['Oferta', 'Estilo']) {
          await section(label);
          await sleep(80);
          assertEqual($$('.panel .haptic-switch').length, 0, `${p} › ${label}: switches inside the panel`);
          for (const sw of $$('.panel .switch')) {
            if (!sw.getClientRects().length) continue;
            const i = rect(sw.querySelector('input')), track = rect(sw.querySelector('.switch-ui'));
            assert(i.left >= track.left - 2 && i.right <= track.right + 2, `${p} › ${label}: a switch input spreads over its words (${Math.round(i.left)}–${Math.round(i.right)} vs ${Math.round(track.left)}–${Math.round(track.right)})`);
          }
        }
      }
      assert($$('.editor .rail .haptic-switch').length >= 4, 'the floating bar lost its ticks');
      await piece('Imagem');
    } finally { off(); }
  });

  test('mobile: messages show above the bar', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    const t = await waitFor(() => $('.toast'), 'the message');
    await sleep(350);
    assert(rect(t).bottom <= rect($('.editor .rail')).top - 4, 'the message covers the bar');
  });

  test('mobile: with 2 ads the first one shows on the home without scrolling, and no search', async () => {
    await H.goHome();
    const q = RS.model.newProject(RS.templates.list[1]); q.name = 'Segundo anúncio';
    await RS.store.putProject(q);
    // the home lists it once it opens again
    $('.new-ad').click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
    $('.gallery .gal-head .btn.ghost').click();
    await waitFor(() => $('.home') && idle() && $$('.proj-card').length >= 2, 'the home with 2 ads');
    window.scrollTo(0, 0);
    await sleep(400);
    const first = rect($('.proj-card'));
    assert(first.top < innerHeight - 60, `the first ad starts at ${Math.round(first.top)} px on a ${innerHeight} px screen`);
    assert(!$('#project-search'), 'the search shows with 2 ads');
    for (const b of $$('.proj-card .proj-more')) assert(rect(b).height >= 44 && rect(b).width >= 44, `«${b.getAttribute('aria-label')}» is too small to touch`);
  });

  // «Balão» (2026-10-28): on a phone a dialog is a sheet from the bottom with 24 px top corners
  test('mobile: dialogs are bottom sheets', async () => {
    if (!$('.editor')) {
      await H.goHome();
      $('.proj-open').click();
      await waitFor(() => $('.editor') && idle(), 'the editor');
    }
    $('.editor .topbar .tb-right .btn.primary').click();
    const sheet = await waitFor(() => $('.modal.export'), 'the export sheet');
    await sleep(600);
    const r = rect(sheet), cs = getComputedStyle(sheet);
    assert(Math.abs(r.bottom - innerHeight) <= 1, `the sheet ends at ${Math.round(r.bottom)} on a ${innerHeight} px screen`);
    assertEqual(cs.borderTopLeftRadius, '24px');
    assertEqual(cs.borderTopRightRadius, '24px');
    $('.modal.export .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal-back'), 'the sheet to close');
  });

  // 2026-10-29: an installed iPhone app draws the page under its status bar; --safe-top stands
  // for env(safe-area-inset-top) (0 in Edge) so the layout can be checked with a 47 px bar
  test('mobile: with a 47 px status bar the orange runs under it and nothing hides behind it', async () => {
    const root = document.documentElement;
    root.style.setProperty('--safe-top', '47px');
    try {
      await H.goHome();
      await sleep(400);
      const band = rect($('.home-band')), top = rect($('.home-top'));
      assert(band.top <= 0.5, `the orange band starts at ${Math.round(band.top)}`);
      assert(top.top >= 47, `the home's top row is under the status bar (${Math.round(top.top)})`);
      $('.new-ad').click();
      await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
      const strip = getComputedStyle(document.body, '::before');
      assertEqual(strip.height, '47px', 'the gallery has no strip under the status bar');
      assertEqual(strip.backgroundColor, 'rgb(242, 92, 5)');
      assert(rect($('.gal-top')).top >= 47, 'the gallery title is under the status bar');
      $('.gallery .gal-head .btn.ghost').click();
      await waitFor(() => $('.home') && idle(), 'home');
      $('.proj-open').click();
      await waitFor(() => $('.editor') && idle(), 'the editor');
      await sleep(400);
      assertEqual(getComputedStyle(document.body, '::before').display, 'none', 'the orange strip over the editor');
      for (const b of $$('.editor .topbar button')) if (b.getClientRects().length) assert(rect(b).top >= 47, `«${b.getAttribute('aria-label') || name(b)}» is under the status bar`);
      $('.editor .topbar .tb-right .btn.primary').click();
      const sheet = await waitFor(() => $('.modal.export'), 'the export sheet');
      await sleep(600);
      assert(rect(sheet).top >= 47, `the sheet rises under the status bar (${Math.round(rect(sheet).top)})`);
      $('.modal.export .modal-head .icon-btn').click();
      await waitFor(() => !$('.modal-back'), 'the sheet to close');
    } finally { root.style.removeProperty('--safe-top'); }
  });

  // «Carvão quente» (2026-10-29): in the dark the open tab and the chosen pills are filled orange
  // with black words; the glass over the poster keeps its white pill
  test('mobile: dark — the open tab and the chosen pills are orange with black words', async () => {
    const before = RS.appearance.get().theme;
    RS.appearance.set({ theme: 'dark' });
    try {
      await piece('Imagem');
      await section('Estilo');
      await H.settleAnimations();
      const tab = $('.editor .rail button.on');
      const pill = $('.editor .rail > .glide-pill');
      const fill = getComputedStyle(pill && pill.getClientRects().length ? pill : tab).backgroundColor;
      assertEqual(fill, 'rgb(242, 92, 5)', 'the open tab is not orange');
      assertEqual(getComputedStyle(tab).color, 'rgb(0, 0, 0)', 'the open tab words are not black');
      const on = $$('.panel .seg button.on').find((b) => b.getClientRects().length);
      if (on) assertEqual(getComputedStyle(on).color, 'rgb(0, 0, 0)', 'a chosen pill in the panel has no black words');
      const glass = $('.editor .topbar .seg button.on');
      assertEqual(getComputedStyle(glass).backgroundColor, 'rgb(255, 255, 255)', 'the piece over the poster lost its white pill');
      assert(!/rgb\(90, 46, 18\)/.test([...document.querySelectorAll('.editor *')].map((e) => getComputedStyle(e).backgroundColor).join(' ')), 'brown is still painted');
    } finally { RS.appearance.set({ theme: before }); await H.settleAnimations(); }
  });

  // 2026-10-29 (measured: «Estilo» scrolled at 10 fps with the video playing — every card on
  // screen played its own preview at 12 fps): on a phone the style cards are still pictures,
  // the stage plays the chosen one
  test('mobile: the style cards stand still on a phone', async () => {
    await piece('Vídeo');
    await section('Estilo');
    await toStop('middle');
    const stage = $('.video-stage');
    if (!stage.classList.contains('paused')) { $('.player-play').click(); await waitFor(() => $('.video-stage.paused'), 'the stage paused'); }
    // (every card first draws its still once, one per task: wait until none is waiting)
    await waitFor(() => $$('.motion-card canvas').length >= 2 && !$('.motion-card .motion-wait'), 'every card drawn', 30000);
    await sleep(800);
    const real = RS.motion.render;
    let calls = 0;
    RS.motion.render = function (...a) { calls++; return real.apply(this, a); };
    try { await sleep(1000); } finally { RS.motion.render = real; }
    assert(calls <= 2, `the cards drew ${calls} frames in a second with the video paused`);
    $('.player-play').click();
    await piece('Imagem');
  });

  // a blur over a video that redraws every frame is costly on an iPhone: solid while it plays
  test('mobile: while the video plays the floating bar has no blur', async () => {
    await piece('Vídeo');
    if ($('.video-stage.paused')) { $('.player-play').click(); await waitFor(() => !$('.video-stage.paused'), 'playing'); }
    await sleep(200);
    assertEqual(getComputedStyle($('.editor .rail')).backdropFilter, 'none');
    await piece('Imagem');
    await sleep(200);
    assert(getComputedStyle($('.editor .rail')).backdropFilter !== 'none', 'the bar lost its glass on the image');
  });

  // only transform and opacity move on the phone (no layout or paint animations)
  test('mobile: phone animations move only transform and opacity', async () => {
    const bad = new Set();
    const look = () => document.getAnimations().forEach((a) => {
      const props = (() => { try { return [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))]; } catch { return []; } })()
        .filter((p) => !['offset', 'easing', 'composite', 'computedOffset', 'transform', 'opacity', 'translate', 'scale', 'rotate', 'clipPath', 'clip-path', 'strokeDashoffset', 'stroke-dashoffset'].includes(p));
      const name = a.animationName || a.transitionProperty || a.id || 'animation';
      if (props.length && !/^(background-color|color|border-.*|box-shadow|fill|stroke)$/.test(a.transitionProperty || '')) bad.add(`${name} [${props.join(',')}]`);
    });
    await toStop('middle');
    $('.sheet-toggle').click(); await sleep(60); look(); await sleep(450);
    $('.sheet-toggle').click(); await sleep(60); look(); await sleep(450);
    await toStop('middle');
    await piece('Vídeo');
    $('.video-stage .player').click(); await sleep(60); look(); await sleep(300);
    await piece('Imagem'); await sleep(60); look();
    assertEqual([...bad], [], 'layout or paint animations on the phone');
  });

  // ---------------------------------------------------------------- final review fixes (2026-10-29)
  // the iPhone's hidden switches sit over their own button only: a tap reaches the button it is on
  test('mobile: on an iPhone every player button takes its own tap', async () => {
    const off = RS.haptics.install(document, { mode: 'ios' });
    try {
      await piece('Vídeo');
      await toStop('middle');
      const pl = await waitFor(() => $('.video-stage .player'), 'the player');
      if (!pl.classList.contains('ctl')) pl.click(); // (a tap on shown buttons hides them)
      await waitFor(() => $('.player.ctl'), 'the buttons');
      await sleep(300);
      for (const b of $$('.player button')) {
        if (!b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') continue;
        const q = rect(b);
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        assert(hit && b.contains(hit), `a tap on «${b.getAttribute('aria-label') || name(b)}» lands on ${hit ? (hit.closest('button') ? hit.closest('button').getAttribute('aria-label') || hit.closest('button').className : hit.className) : 'nothing'}`);
      }
    } finally { off(); await piece('Imagem'); }
  });

  test('mobile: light theme — the tools row is glass, its buttons are not white circles', async () => {
    const before = RS.appearance.get().theme;
    RS.appearance.set({ theme: 'light' });
    try {
      await piece('Imagem');
      await toStop('middle');
      await H.settleAnimations();
      for (const b of $$('.tools-row .icon-btn, .tools-row .more-btn')) {
        if (!b.getClientRects().length) continue;
        assert(getComputedStyle(b).backgroundColor !== 'rgb(255, 255, 255)', `«${b.getAttribute('aria-label')}» is a white circle on the glass`);
      }
      // the chosen format's pill is white with a dark icon on the glass
      const pill = $('.tools-row .glide-pill');
      if (pill && pill.getClientRects().length) assertEqual(getComputedStyle(pill).backgroundColor, 'rgb(255, 255, 255)', 'the chosen format pill on the glass');
    } finally { RS.appearance.set({ theme: before }); await H.settleAnimations(); }
  });

  test('mobile: the video ⋯ menu lies over the panel', async () => {
    await piece('Vídeo');
    await toStop('middle');
    $('.video-stage .player').click();
    (await waitFor(() => $('.player .editor-more'), 'the ⋯ in the player')).click();
    const menu = await waitFor(() => $('.player .editor-menu'), 'the menu');
    await sleep(300);
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const last = rect(items[items.length - 1]);
    const hit = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
    assert(hit && menu.contains(hit), `the menu's last item is covered by ${hit ? hit.className || hit.tagName : 'nothing'}`);
    $('.player .editor-more').click();
    await waitFor(() => !$('.player .editor-menu'), 'the menu to close');
    await piece('Imagem');
  });

  test('mobile: a save warning stays on screen while the video plays', async () => {
    const real = RS.store.putProject;
    const quick = RS.phone.HIDE_MS;
    RS.phone.HIDE_MS = 300;
    RS.store.putProject = async () => { throw new Error('Espaço insuficiente'); };
    try {
      await piece('Vídeo');
      await section('Oferta');
      const field = await waitFor(() => $('#f-headline'), 'the headline');
      H.type(field, field.value + ' já');
      field.blur();
      const banner = await waitFor(() => $('.topbar .save-recovery'), 'the save warning', 15000);
      if ($('.video-stage.paused')) $('.player-play').click();
      await sleep(900);
      const r = rect(banner), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      assert(hit && banner.contains(hit) && parseFloat(getComputedStyle(banner.closest('.topbar')).opacity) > 0.5, 'the save warning hid with the floating controls');
    } finally {
      RS.store.putProject = real; RS.phone.HIDE_MS = quick;
      const retry = $('.save-recovery button'); if (retry) retry.click();
      await waitFor(() => !$('.save-recovery'), 'the warning to clear', 15000);
      await piece('Imagem');
    }
  });

  test('mobile: a dialog opened in full screen shows over it', async () => {
    await piece('Vídeo');
    await toStop('middle');
    $('.video-stage .player').click();
    (await waitFor(() => $('.player [aria-label="Ecrã inteiro"]'), '⛶')).click();
    await waitFor(() => $('.editor.player-full'), 'full screen');
    (await waitFor(() => $('.player .editor-more'), 'the ⋯')).click();
    (await waitFor(() => byText('.editor-menu [role="menuitem"]', /Definições/), '«Definições»')).click();
    const sheet = await waitFor(() => $('.modal.settings'), 'the sheet');
    await sleep(600);
    const r = rect(sheet), hit = document.elementFromPoint(r.left + r.width / 2, r.top + 60);
    assert(hit && sheet.contains(hit), `the sheet is behind ${hit ? hit.className || hit.tagName : 'nothing'}`);
    $('.modal.settings .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal.settings'), 'the sheet to close');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !$('.editor.player-full'), 'leave full screen');
    await piece('Imagem');
  });

  // ---------------------------------------------------------------- deferred minors (2026-10-30)
  const dragHead = (y0, ys) => {
    const head = $('.sheet-head'), h = rect(head), x = h.left + h.width / 3;
    const ev = (type, y) => head.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 }));
    ev('pointerdown', y0);
    return { move: (y) => ev('pointermove', y), up: (y) => ev('pointerup', y) };
  };
  test('mobile: a drag right after a glide is not undone by it', async () => {
    await piece('Imagem');
    await toStop('top');
    $('.sheet-toggle').click(); // top → bottom: a glide starts
    await sleep(80);
    const h = rect($('.sheet-head')), y0 = h.top + h.height / 2;
    const d = dragHead(y0);
    for (let i = 1; i <= 6; i++) { d.move(y0 - 20 * i); await sleep(16); }
    await sleep(450); // past the glide's end
    assert(/^translateY\(-/.test($('.editor .panel').style.transform), `the glide's end undid the drag (${$('.editor .panel').style.transform || 'none'})`);
    d.up(y0 - 120);
    await sleep(500);
    await toStop('middle');
  });
  test('mobile: dragging the panel down, the poster follows with no empty band', async () => {
    await piece('Imagem');
    await toStop('middle');
    const h = rect($('.sheet-head')), y0 = h.top + h.height / 2;
    const d = dragHead(y0);
    for (let i = 1; i <= 6; i++) { d.move(y0 + 15 * i); await sleep(16); }
    await sleep(60);
    const shell = $('.preview-shell'), poster = rect($('.workspace canvas.poster')), panelTop = rect($('.editor .panel')).top;
    const visible = getComputedStyle(shell).overflow === 'visible' ? poster.bottom : Math.min(poster.bottom, rect(shell).bottom);
    assert(panelTop - visible < 40, `an empty band of ${Math.round(panelTop - visible)} px opens over the panel`);
    d.up(y0);
    await sleep(500);
    await toStop('middle');
  });
  test('mobile: with two languages both chips show in the image row', async () => {
    await piece('Imagem');
    await toStop('middle');
    if ($$('.tools-row .locales-chips > .chip').length < 2) {
      $('.tools-row .locales .chip.add').click();
      (await waitFor(() => $$('.editor .locales .menu [role="menuitem"]').find((b) => /Fran/.test(b.textContent)), 'French')).click();
      await waitFor(() => $$('.tools-row .locales-chips > .chip').length >= 2, 'two languages');
      await sleep(300);
    }
    const box = rect($('.tools-row .locales-chips'));
    for (const c of $$('.tools-row .locales-chips .chip-main')) {
      const r = rect(c);
      assert(r.left >= box.left - 0.5 && r.right <= box.right + 0.5, `«${c.textContent.trim()}» is hidden in the scrolling chips`);
    }
    const row = rect($('.tools-row'));
    for (const b of $$('.tools-row button')) if (b.getClientRects().length) assert(rect(b).right <= row.right + 0.5, `«${b.getAttribute('aria-label') || b.textContent.trim()}» leaves the row`);
  });

  // (last: it removes the ad's photo)
  test('mobile: without a photo the poster says how to add one', async () => {
    await piece('Imagem');
    await section('Fotos');
    const remove = byText('#editor-panel .btn', /Remover/);
    if (remove) { remove.click(); await sleep(400); }
    const hint = await waitFor(() => $('.stage-foot .stage-hint'), 'the hint');
    assert(/Sem fotografia/.test(hint.textContent), hint.textContent);
    assert(hint.getClientRects().length && rect(hint).height > 0, 'the «Sem fotografia» hint is hidden on the phone');
  });
})();
