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

  test('home: no ads yet shows the building site and the button', async () => {
    await waitFor(() => $('.home') && idle(), 'home');
    assert(innerWidth <= 380 && $('.home-top').scrollWidth <= innerWidth, `the home is not phone-sized: ${innerWidth} px, its top bar ${$('.home-top').scrollWidth} px`);
    const site = await waitFor(() => $('.home .empty-site'), 'the building site');
    assert(site.querySelector('svg'), 'no drawing');
    const cta = site.querySelector('.new-card');
    assert(cta && /Criar anúncio/.test(cta.textContent), 'the crane holds no «Criar anúncio» card');
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
    await waitFor(() => $('.home') && idle() && $('.new-card'), 'home');
    $('.new-card').click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
    $$('.tpl-card')[0].click();
    await waitFor(() => $('.editor') && idle(), 'editor');
    await sleep(400);
    checkBar();
    assertEqual($$('.editor .rail button').map(name), ['Oferta', 'Contactos', 'Fotos', 'Estilo', 'Exportar']);
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

  test('mobile: the top bar\'s two rows fit the phone; the floating bar holds at most six in every piece', async () => {
    for (const p of ['Imagem', 'Carrossel', 'Vídeo']) {
      await piece(p);
      const back = rect($('.editor .topbar > .btn.ghost')), nameBox = rect($('.editor .topbar .name-wrap')), more = rect($('.editor .topbar .editor-more'));
      const row2 = rect($('.editor .topbar .tb-row'));
      // row 1: ‹ · name · ⋯ side by side; row 2 under it: piece · language · ↶ ↷
      for (const [what, r] of [['‹', back], ['the name', nameBox], ['⋯', more], ['the second row', row2]]) {
        assert(r.left >= -0.5 && r.right <= innerWidth + 0.5, `${p}: ${what} leaves the screen (${Math.round(r.left)}–${Math.round(r.right)} of ${innerWidth})`);
      }
      assert(Math.abs(back.top - more.top) < 12 && nameBox.left >= back.right - 1 && more.left >= nameBox.right - 1, `${p}: ‹, the name and ⋯ are not one row`);
      assert(row2.top >= Math.max(back.bottom, more.bottom) - 1, `${p}: the piece switch is not under the first row`);
      for (const el of $$('.editor .topbar .tb-row button')) {
        const r = rect(el);
        if (!el.closest('.locales-chips')) assert(r.left >= -0.5 && r.right <= innerWidth + 0.5, `${p}: «${name(el) || el.getAttribute('aria-label')}» leaves the screen`);
      }
      checkBar();
      assert($$('.editor .rail button').length <= 6, `${p}: ${$$('.editor .rail button').length} buttons on the floating bar`);
    }
    await piece('Imagem');
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

  test('mobile: the ad\'s name stays readable in the editor\'s top bar', async () => {
    const field = $('.editor .topbar .name-input');
    const w = rect(field).width;
    assert(w >= 48, `the name field is ${Math.round(w)} px wide (top bar: ${[...$('.editor .topbar').children].map((e) => `${e.className || e.tagName} ${Math.round(rect(e).width)}`).join(' | ')})`);
  });

  test('mobile: «Definições» is in the editor\'s ⋯ and a sheet of the home, and both fit the phone', async () => {
    // the editor: ⋯ opens a menu inside the screen; «Definições» there opens the settings sheet
    $('.editor .topbar .editor-more').click();
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
    byText('.editor .rail button', /Exportar/).click();
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
    $('.new-card').click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
    $('.gallery .gal-head .btn.ghost').click();
    await waitFor(() => $('.home') && idle() && $$('.proj-card').length >= 2, 'the home with 2 ads');
    window.scrollTo(0, 0);
    await sleep(400);
    const first = rect($('.proj-card'));
    assert(first.top < innerHeight - 60, `the first ad starts at ${Math.round(first.top)} px on a ${innerHeight} px screen`);
    assert(!$('#project-search'), 'the search shows with 2 ads');
    for (const b of $$('.proj-card .proj-pieces button')) assert(rect(b).height >= 44 && rect(b).width >= 44, `«${b.getAttribute('aria-label')}» is too small to touch`);
  });
})();
