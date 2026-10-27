// The premium feel: appearance (theme, vibration), motion, loaders, haptics,
// export moment, install and opening. Runs last in run-ui.html (after
// ui-minor.case.js: the editor of «Anúncio antigo» may be open).
(() => {
  const { sleep, $, $$, byText, idle, waitFor } = window.H;

  test('appearance: the theme is on <html> before the app\'s first paint', () => {
    assert(['light', 'dark'].includes(window.__themeAtHead), `no theme at <head>: ${window.__themeAtHead}`);
  });

  test('appearance: choosing «Escuro» sets the theme, the bar colour and keeps it', async () => {
    RS.appearance.set({ theme: 'dark' });
    assertEqual(document.documentElement.dataset.theme, 'dark');
    assertEqual(document.querySelector('meta[name="theme-color"]').content, '#0f1114');
    assertEqual(JSON.parse(localStorage.getItem('rs-appearance')).theme, 'dark');
    RS.appearance.set({ theme: 'light' });
    assertEqual(document.documentElement.dataset.theme, 'light');
    assertEqual(document.querySelector('meta[name="theme-color"]').content, '#ffffff');
    RS.appearance.set({ theme: 'auto' });
  });

  test('appearance: subscribers hear a change and the calm mode is on <html>', async () => {
    const heard = [];
    const off = RS.appearance.subscribe((s) => heard.push(s.theme));
    RS.appearance.set({ theme: 'dark' });
    off();
    RS.appearance.set({ theme: 'auto' });
    assertEqual(heard, ['dark']);
    assertEqual(window.__motionAtHead, 'sober', 'the motion style is not on <html> before the first paint');
    assert(['illustrative', 'sober', 'calm'].includes(document.documentElement.dataset.motion), `data-motion: ${document.documentElement.dataset.motion}`);
  });

  test('theme: every text on home, gallery, editor and export reads at AA in both themes', async () => {
    const seen = {};
    for (const theme of ['light', 'dark']) {
      RS.appearance.set({ theme }); await H.settleAnimations();
      for await (const screen of H.visitScreens(['home', 'gallery', 'editor:Imagem/Oferta', 'editor:Imagem/Contactos', 'editor:Imagem/Estilo', 'editor:Vídeo/Estilo', 'export'])) {
        const bad = H.contrastIssues(document.body);
        assert(!bad.length, `${theme} ${screen}: ${bad.slice(0, 5).map((b) => `«${b.text}» ${b.selector} ${b.ratio.toFixed(2)} < ${b.need}`).join('; ')}`);
        seen[`${theme} ${screen}`] = getComputedStyle(document.body).backgroundColor;
      }
    }
    RS.appearance.set({ theme: 'auto' });
    // the two themes really differ
    assert(seen['light home'] !== seen['dark home'], `the page has the same background in both themes: ${seen['light home']}`);
  });

  test('theme: the ad looks the same in both themes', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const project = (await H.saved()) || null;
    assert(project, 'no saved ad');
    const look = () => {
      const { canvas } = RS.engine.renderToCanvas(RS.model.normalize(project), { format: 'portrait', images: {}, scale: 0.25, mode: 'export' });
      return {
        poster: canvas.toDataURL(),
        stage: getComputedStyle($('.editor .workspace')).backgroundColor,
        bar: getComputedStyle($('.editor .ws-bar .seg button.on')).backgroundColor + getComputedStyle($('.editor .ws-bar .seg button.on')).color,
      };
    };
    RS.appearance.set({ theme: 'light' }); await H.settleAnimations();
    const light = look();
    RS.appearance.set({ theme: 'dark' }); await H.settleAnimations();
    const dark = look();
    RS.appearance.set({ theme: 'auto' });
    assert(light.poster === dark.poster, 'the poster is drawn differently in the dark theme');
    assertEqual(dark.stage, light.stage, 'the preview table changed colour');
    assertEqual(dark.bar, light.bar, 'the preview bar changed colour');
  });

  // «Definições»: a sheet from the home top bar, and the same sheet from the editor's ⋯.
  const openSettings = async (where = '.home-top') => {
    if (where === '.home-top') {
      await H.goHome();
      const btn = await waitFor(() => $('.home-top .home-more'), 'the home ⋯');
      if (!$('.modal.settings')) {
        btn.focus(); btn.click(); // a real tap or click leaves the focus on the button
        (await waitFor(() => byText('.home-menu [role="menuitem"]', /Definições/), '«Definições» in the home ⋯')).click();
      }
      return waitFor(() => !$('.modal-back.closing') && $('.modal.settings .settings'), '«Definições» on the home');
    }
    if (!$('.editor .editor-menu')) $('.editor .topbar .editor-more').click();
    (await waitFor(() => byText('.editor .editor-menu [role="menuitem"]', /Definições/), '«Definições» in ⋯')).click();
    return waitFor(() => !$('.modal-back.closing') && $('.modal.settings .settings'), '«Definições» from the editor');
  };
  const closeSettings = async () => {
    const x = $('.modal.settings .modal-head .icon-btn');
    if (x) { x.click(); await waitFor(() => !$('.modal.settings'), '«Definições» to close', 4000); }
  };
  const themeOption = (label) => byText('.settings [role="radiogroup"][aria-label="Tema"] [role="radio"]', new RegExp(label));
  const motionOption = (label) => byText('.settings [role="radiogroup"][aria-label="Movimento"] [role="radio"]', new RegExp(label));

  test('settings: the home opens «Definições» with the motion style, the theme and the vibration', async () => {
    RS.appearance.set({ theme: 'light', haptics: true, motion: 'sober' });
    await openSettings('.home-top');
    assert(!$('.home-top .settings-btn'), '«Definições» is still a button of the home bar (it is in ⋯)');
    assertEqual($$('.settings [role="radiogroup"][aria-label="Movimento"] [role="radio"]').map((b) => b.querySelector('strong').textContent.trim()), ['Ilustrativo', 'Sóbrio', 'Calmo']);
    assertEqual(motionOption('Sóbrio').getAttribute('aria-checked'), 'true', '«Sóbrio» is not the style chosen');
    assert($$('.settings .ms-preview').length === 3, 'the styles have no live preview');
    motionOption('Calmo').click();
    await waitFor(() => document.documentElement.dataset.motion === 'calm', 'the calm style on <html>');
    assertEqual(JSON.parse(localStorage.getItem('rs-appearance')).motion, 'calm', 'the style is not kept');
    motionOption('Ilustrativo').click();
    await waitFor(() => document.documentElement.dataset.motion === 'illustrative', 'the illustrative style on <html>');
    motionOption('Sóbrio').click();
    await waitFor(() => document.documentElement.dataset.motion === 'sober', 'back to Sóbrio');
    assertEqual($$('.settings [role="radiogroup"][aria-label="Tema"] [role="radio"]').map((b) => b.textContent.trim()), ['Automático', 'Claro', 'Escuro']);
    themeOption('Escuro').click();
    await waitFor(() => document.documentElement.dataset.theme === 'dark', 'the dark theme');
    await waitFor(() => themeOption('Escuro').getAttribute('aria-checked') === 'true', '«Escuro» chosen');
    const haptics = $('#f-haptics');
    assert(haptics && haptics.checked, '«Vibração» is not on by default');
    haptics.click();
    assertEqual(RS.appearance.get().haptics, false);
    haptics.click();
    assertEqual(RS.appearance.get().haptics, true);
    themeOption('Automático').click();
    await waitFor(() => RS.appearance.get().theme === 'auto', 'back to automatic');
    $('.modal.settings').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !$('.modal.settings'), '«Definições» to close on Escape', 4000);
    assertEqual(document.activeElement, $('.home-top .home-more'), 'the focus goes back to ⋯');
  });

  test('settings: the theme change grows from the option', async () => {
    RS.appearance.set({ theme: 'light' });
    const real = document.startViewTransition;
    const calls = [];
    document.startViewTransition = function (cb) { calls.push(cb); return real.call(document, cb); };
    try {
      await openSettings('.home-top');
      const b = themeOption('Escuro');
      const r = b.getBoundingClientRect();
      b.click();
      await waitFor(() => document.documentElement.dataset.theme === 'dark', 'the dark theme');
      assertEqual(calls.length, 1, 'no view transition');
      const st = document.documentElement.style;
      assertEqual(Math.round(parseFloat(st.getPropertyValue('--reveal-x'))), Math.round(r.left + r.width / 2));
      assertEqual(Math.round(parseFloat(st.getPropertyValue('--reveal-y'))), Math.round(r.top + r.height / 2));
      // choosing what is already on screen changes nothing and runs no transition
      themeOption('Escuro').click();
      await sleep(60);
      assertEqual(calls.length, 1, 'a transition for nothing');
    } finally {
      document.startViewTransition = real;
      RS.appearance.set({ theme: 'auto' });
      await closeSettings();
    }
  });

  test('settings: the editor\'s ⋯ opens «Definições» over the stage as it is', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
    const panel = await openSettings('.editor');
    assert(motionOption('Ilustrativo') && themeOption('Claro') && panel.querySelector('#f-haptics'), 'the editor\'s «Definições» lack a group');
    assert($('.editor .video-stage'), 'opening «Definições» changed the stage from the video');
    assert(!byText('.editor .rail button', /Definições/), '«Definições» is still in the rail');
    assertEqual(byText('.editor .rail button', /^\s*Estilo\s*$/).getAttribute('aria-selected'), 'true', 'the open section changed');
    motionOption('Calmo').click();
    await waitFor(() => document.documentElement.dataset.motion === 'calm', 'Calmo from the editor');
    motionOption('Sóbrio').click();
    await waitFor(() => document.documentElement.dataset.motion === 'sober', 'Sóbrio from the editor');
    await closeSettings();
    assert($('.editor .video-panel .video-section[data-section="estilo"]'), 'the panel under «Definições» changed');
  });

  // ---------------------------------------------------------------- motion foundation
  const inside = (a, b, tol = 1.5) => a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
  const pillOf = (container) => container.querySelector(':scope > .glide-pill');
  const transformRuns = (el) => el.getAnimations().some((a) => a.transitionProperty === 'transform');

  test('motion: a choice slides the pill to it', async () => {
    RS.appearance.set({ theme: 'light' });
    await openSettings('.home-top');
    const seg = $('.settings [role="radiogroup"][aria-label="Tema"]');
    const pill = await waitFor(() => pillOf(seg), 'the gliding pill');
    await H.settleAnimations();
    assert(inside(pill.getBoundingClientRect(), themeOption('Claro').getBoundingClientRect()), 'the pill is not under «Claro»');
    // «Automático» on a light device: the same theme, so no View Transition in the way
    themeOption('Automático').click();
    await waitFor(() => transformRuns(pill), 'the pill to move through a transition', 1000);
    await H.settleAnimations();
    assert(inside(pill.getBoundingClientRect(), themeOption('Automático').getBoundingClientRect()), 'the pill did not end under «Automático»');
    await closeSettings();
  });

  test('motion: quick choices leave the pill under the last one', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
    const rail = $('.editor .rail');
    const pill = await waitFor(() => pillOf(rail), 'the rail\'s pill');
    const tab = (name) => byText('.editor .rail [role="tab"]', new RegExp(`^\\s*${name}\\s*$`));
    for (const name of ['Sequência', 'Fotos', 'Oferta', 'Sequência', 'Fotos']) { tab(name).click(); await sleep(10); }
    await waitFor(() => $('.editor .panel[aria-label="Fotos"]'), 'the «Fotos» panel');
    await H.settleAnimations();
    const p = pill.getBoundingClientRect(), t = tab('Fotos').getBoundingClientRect();
    assert(p.top >= t.top - 1 && p.bottom <= t.bottom + 1 && p.height > t.height / 2, `the pill is not on «Fotos» (${Math.round(p.top)}–${Math.round(p.bottom)} vs ${Math.round(t.top)}–${Math.round(t.bottom)})`);
    tab('Estilo').click();
    await waitFor(() => $('.editor .panel[aria-label="Estilo"]'), 'the «Estilo» panel');
  });

  // A model whose «Automática» length differs from the current one by a few seconds.
  async function modelWithOtherLength(min = 4) {
    const project = await H.saved();
    const auto = (id) => {
      const p = { ...project, video: { ...project.video, motion: id, duration: 'auto' } };
      const o = RS.motion.lengths(p, { locale: p.locale }).options.find((x) => x.value === 'auto');
      return o ? o.seconds : null;
    };
    const now = auto(project.video.motion);
    const other = RS.motion.STYLES.filter((s) => !s.test && s.durations.length > 1 && s.id !== project.video.motion)
      .find((s) => auto(s.id) != null && Math.abs(auto(s.id) - now) >= min);
    assert(other, 'no model with another automatic length');
    return other;
  }
  // «Estilo» says the length in its head («Tijolo · 14 s»), counting as the model changes
  const autoSeconds = () => Number((/·\s*(\d+)\s*s/.exec($('.video-panel .panel-head p').textContent) || [])[1]);
  async function chooseAuto() {
    for await (const s of H.visitScreens(['editor:Vídeo/Sequência'])) void s;
    const b = await waitFor(() => byText('.video-panel .lengths button', /Automática/), '«Automática»');
    if (b.getAttribute('aria-checked') !== 'true') b.click();
    await waitFor(() => byText('.video-panel .lengths button', /Automática/).getAttribute('aria-checked') === 'true', '«Automática»');
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
  }

  test('motion: the length of «Automática» counts up when the model changes', async () => {
    await chooseAuto();
    await H.settleAnimations();
    const before = autoSeconds();
    const other = await modelWithOtherLength();
    byText('.video-panel .motion-card', new RegExp(other.name)).click();
    const seen = new Set();
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) { seen.add(autoSeconds()); await new Promise((r) => requestAnimationFrame(r)); }
    const after = autoSeconds();
    assert(after !== before, `the length did not change (${before} s)`);
    const between = [...seen].filter((v) => v > Math.min(before, after) && v < Math.max(before, after));
    assert(between.length > 0, `no value between ${before} and ${after}: ${[...seen].join(', ')}`);
  });

  test('motion: a counting number sits in the sentence like a word', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
    const note = await waitFor(() => $('.video-stage .ws-notes .note.info'), 'the stage note');
    await H.settleAnimations();
    assert(/^\S+ · \d+ s · /.test(note.textContent.trim()), `«${note.textContent.trim()}»`);
    // one run of text: the number is not a flex item of the note (the note's gap would split the sentence)
    for (const num of $$('.ws-notes .note .count-up')) assert(!num.parentElement.classList.contains('note'), `«${num.parentElement.textContent.trim()}»: the number is a flex item of the note`);
  });

  test('motion: calm mode shows the value at once and keeps no flights', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
    document.documentElement.dataset.motion = 'calm';
    try {
      await chooseAuto();
      await H.settleAnimations();
      const before = autoSeconds();
      const other = await modelWithOtherLength();
      byText('.video-panel .motion-card', new RegExp(other.name)).click();
      // every frame shows the old length or the new one, never one in between
      const seen = new Set();
      const t0 = performance.now();
      while (performance.now() - t0 < 1200) { seen.add(autoSeconds()); await new Promise((r) => requestAnimationFrame(r)); }
      const after = autoSeconds();
      assert(after !== before, `the length did not change (${before} s)`);
      assertEqual([...seen].filter((v) => v !== before && v !== after), [], 'the length still counted in calm mode');
      const pill = pillOf($('.editor .rail'));
      assert(pill, 'no pill');
      assert(!/transform|all/.test(getComputedStyle(pill).transitionProperty), `the pill still flies: ${getComputedStyle(pill).transitionProperty}`);
    } finally {
      RS.appearance.apply();
    }
  });

  // ---------------------------------------------------------------- things that open and close
  test('motion: a menu grows from its button', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const plus = await waitFor(() => $('.editor .locales .chip.add'), 'the «+» language chip');
    plus.click();
    const menu = await waitFor(() => $('.editor .locales .menu'), 'the language menu');
    const anim = menu.getAnimations().map((a) => a.animationName);
    assert(anim.includes('feel-pop-in'), `the menu does not grow in: ${anim.join(', ') || 'no animation'}`);
    const [ox, oy] = getComputedStyle(menu).transformOrigin.split(' ').map(parseFloat);
    await H.settleAnimations();
    const m = menu.getBoundingClientRect(), c = plus.getBoundingClientRect();
    assert(Math.abs(ox - (c.left + c.width / 2 - m.left)) <= 2 && Math.abs(oy - (c.top + c.height / 2 - m.top)) <= 2,
      `it grows from ${Math.round(ox)}, ${Math.round(oy)} instead of the «+» at ${Math.round(c.left + c.width / 2 - m.left)}, ${Math.round(c.top + c.height / 2 - m.top)}`);
    plus.click();
    await waitFor(() => !$('.editor .locales .menu'), 'the menu to close');
  });

  test('motion: a removed row leaves before it goes', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo/Sequência'])) void s;
    await waitFor(() => $('#vt-block-benefits .vt-add'), 'the benefits list');
    const rows = () => $$('#vt-block-benefits .vt-row');
    const n = rows().length;
    $('#vt-block-benefits .vt-add').click();
    const row = await waitFor(() => rows().length === n + 1 && rows()[n], 'a new row');
    assert(row.getAnimations().some((a) => a.animationName === 'feel-row-in'), 'the new row does not grow in');
    row.querySelector('.vt-remove').click();
    await H.settle();
    assert(row.isConnected && row.classList.contains('leaving'), 'the row went at once');
    await sleep(300);
    assert(!row.isConnected && rows().length === n, 'the row is still there after 300 ms');
  });

  test('motion: a toast leaves with its own animation', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    // Codex: Ctrl+S saves now and says so
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    const t = await waitFor(() => byText('.toast', /Anúncio guardado neste aparelho/), 'the message');
    assert(t.getAnimations().some((a) => a.animationName === 'feel-toast-in'), 'the message does not spring in');
    await waitFor(() => t.classList.contains('leave'), 'the message to leave', 6000);
    assert(t.isConnected, 'the message went before leaving');
    assert(t.getAnimations().some((a) => a.animationName === 'feel-toast-out'), 'the message does not spring out');
    await waitFor(() => !t.isConnected, 'the message to go', 1000);
  });

  // ---------------------------------------------------------------- the card that becomes the editor
  // Records the name the given element carries when a View Transition starts
  // (old view) and once its update has run (new view).
  function watchTransition(pick) {
    const real = document.startViewTransition;
    const seen = { calls: 0, before: null, after: null };
    document.startViewTransition = function (cb) {
      seen.calls++;
      const el = pick();
      seen.before = el ? el.style.viewTransitionName : null;
      return real.call(document, async () => { await cb(); const e = pick(); seen.after = e ? e.style.viewTransitionName : null; });
    };
    return { seen, restore: () => { document.startViewTransition = real; } };
  }

  test('motion: opening an ad grows its card into the editor', async () => {
    await H.goHome();
    const card = await waitFor(() => $('.proj-card[data-id]'), 'an ad card with its id');
    const w = watchTransition(() => card.querySelector('.proj-thumb'));
    try {
      card.querySelector('.proj-open').click();
      await waitFor(() => $('.editor') && idle(), 'the editor');
    } finally { w.restore(); }
    assertEqual(w.seen.before, 'poster', 'the card\'s thumbnail was not the poster when the transition started');
  });

  test('motion: leaving the editor shrinks the poster back into its card', async () => {
    await H.goHome();
    const card = await waitFor(() => $('.proj-card[data-id]'), 'an ad card with its id');
    const id = card.dataset.id;
    card.querySelector('.proj-open').click();
    await waitFor(() => $('.editor') && idle(), 'the editor');
    const w = watchTransition(() => $(`.proj-card[data-id="${id}"] .proj-thumb`));
    try {
      $('.editor .topbar .btn.ghost').click();
      await waitFor(() => $('.home') && idle(), 'home');
    } finally { w.restore(); }
    assert(w.seen.calls >= 1, 'no view transition');
    assertEqual(w.seen.after, 'poster', 'the card was not the poster in the new view');
    await H.settleAnimations();
    assertEqual($(`.proj-card[data-id="${id}"] .proj-thumb`).style.viewTransitionName, '', 'the name stays after the transition');
  });

  test('motion: a double click opens one editor', async () => {
    await H.goHome();
    const open = await waitFor(() => $('.proj-open'), 'an ad');
    open.click();
    await sleep(30);
    if (open.isConnected) open.click();
    await waitFor(() => $('.editor') && idle(), 'the editor');
    await sleep(300);
    assertEqual($$('.editor').length, 1);
  });

  // ---------------------------------------------------------------- loaders
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  test('loaders: a quick wait shows nothing, a longer one draws the dimension line', async () => {
    const realLoad = RS.assets.load;
    // opens the first ad with its images taking `ms` to load; true if a loader showed
    const openWith = async (ms) => {
      await H.goHome();
      RS.assets.load = async (...a) => { await sleep(ms); return realLoad.apply(RS.assets, a); };
      let saw = false;
      $('.proj-open').click();
      while (!($('.editor') && idle())) { if ($('.cota-loader')) saw = true; await frame(); }
      RS.assets.load = realLoad;
      return saw;
    };
    try {
      assert(!(await openWith(150)), 'a loader showed for a 150 ms wait');
      assert(await openWith(1000), 'no loader for a one-second wait');
    } finally { RS.assets.load = realLoad; }
  });

  // Applies a library photo with the import taking 1.2 s; `check` gets the stage's loader.
  async function slowPhoto(check) {
    for await (const s of H.visitScreens(['editor:Imagem/Fotos'])) void s;
    const item = await waitFor(() => $('.library .lib-item'), 'a library photo', 15000);
    const real = RS.assets.importFile;
    RS.assets.importFile = async (...a) => { await sleep(1200); return real.apply(RS.assets, a); };
    try {
      item.click();
      check(await waitFor(() => $('.stage-busy .brick-loader'), 'the bricks on the stage', 3000));
      await waitFor(() => !$('.stage-busy'), 'the photo to be ready', 15000);
    } finally { RS.assets.importFile = real; }
  }

  test('loaders: preparing a photo lays bricks', async () => {
    await slowPhoto((loader) => {
      assert(/A preparar a fotografia/.test(loader.closest('.stage-busy').textContent), loader.closest('.stage-busy').textContent);
      const bricks = loader.querySelectorAll('.brick');
      assert(bricks.length >= 4, `only ${bricks.length} bricks`);
      assert([...bricks].some((b) => b.getAnimations().length), 'the bricks do not move');
    });
  });

  test('loaders: calm mode keeps the words and drops the bounce', async () => {
    document.documentElement.dataset.motion = 'calm';
    try {
      await slowPhoto((loader) => {
        assert(/A preparar a fotografia/.test(loader.closest('.stage-busy').textContent), 'the words are gone');
        for (const b of loader.querySelectorAll('.brick')) {
          for (const a of b.getAnimations()) assert(!a.effect.getKeyframes().some((k) => 'transform' in k), `a brick still bounces (${a.animationName})`);
        }
      });
    } finally { RS.appearance.apply(); }
  });

  // ---------------------------------------------------------------- haptics
  // records navigator.vibrate while fn runs
  async function vibrations(fn) {
    const calls = [];
    const real = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
    navigator.vibrate = (p) => { calls.push(p); return true; };
    try { await fn(calls); } finally { if (real) Object.defineProperty(navigator, 'vibrate', real); else delete navigator.vibrate; }
    return calls;
  }

  test('haptics: a tap on a real action ticks once and typing never does', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    RS.appearance.set({ haptics: true });
    const off = RS.haptics.install(document, { mode: 'android' });
    try {
      await vibrations(async (calls) => {
        $('.editor .topbar button[title^="Exportar"]').click();
        await waitFor(() => $('.modal.export'), 'the export dialog');
        assertEqual(calls, [8], 'one tick for «Exportar»');
        await H.closeExport();
        calls.length = 0;
        H.type($('#f-kicker'), 'Estamos a recrutar já');
        await sleep(100);
        assertEqual(calls, [], 'typing vibrated');
        RS.appearance.set({ haptics: false });
        $('.editor .topbar button[title^="Exportar"]').click();
        await waitFor(() => $('.modal.export'), 'the export dialog');
        assertEqual(calls, [], '«Vibração» is off but it vibrated');
        await H.closeExport();
      });
    } finally { off(); RS.appearance.set({ haptics: true }); }
  });

  // what the Tab key goes through, in order
  const tabOrder = () => $$('a[href], button, input, select, textarea, [tabindex]').filter((e) => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);

  test('haptics: an iPhone tap runs the action once and the switches are hidden from assistive tech', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const before = tabOrder();
    const off = RS.haptics.install(document, { mode: 'ios' });
    try {
      await H.settle();
      const chip = await waitFor(() => $$('.panel .preset .tchip').find((c) => c.getAttribute('aria-pressed') === 'false' && c.querySelector('.haptic-switch')), 'a trade chip with its switch');
      const label = chip.querySelector('.haptic-switch');
      label.click();
      await waitFor(() => chip.getAttribute('aria-pressed') === 'true', 'the trade to be chosen');
      await sleep(150);
      assertEqual(chip.getAttribute('aria-pressed'), 'true', 'the tap ran twice');
      const switches = $$('.haptic-switch');
      assert(switches.length > 10, `only ${switches.length} switches`);
      for (const sw of switches) {
        assertEqual(sw.getAttribute('aria-hidden'), 'true');
        const input = sw.querySelector('input[type="checkbox"]');
        assert(input && input.hasAttribute('switch') && input.tabIndex === -1, 'a switch is in the Tab order');
      }
      assert($$('.switch input[type="checkbox"]').every((i) => i.hasAttribute('switch')), 'the app\'s switches are not iOS switches');
      const after = tabOrder();
      assertEqual(after.length, before.length, 'the Tab order changed');
      assert(after.every((e, i) => e === before[i]), 'the Tab order changed');
      chip.querySelector('.haptic-switch').click(); // the trade back off
      await waitFor(() => chip.getAttribute('aria-pressed') === 'false', 'the trade to be taken off');
    } finally { off(); }
    assertEqual($$('.haptic-switch').length, 0, 'the switches stay after uninstall');
  });

  // ---------------------------------------------------------------- the export moment
  // Runs fn with the downloads kept (not saved) and RS.haptics.success/error counted.
  async function exporting(fn) {
    const files = [];
    const count = { success: 0, error: 0 };
    const real = { save: RS.util.saveBlob, success: RS.haptics.success, error: RS.haptics.error };
    RS.util.saveBlob = async (blob, name) => { files.push({ blob, name }); return true; };
    RS.haptics.success = () => { count.success++; };
    RS.haptics.error = () => { count.error++; };
    try { await fn(files, count); } finally { Object.assign(RS.util, { saveBlob: real.save }); Object.assign(RS.haptics, { success: real.success, error: real.error }); }
  }
  // A new ad from the first template: the export cases do not depend on what
  // earlier cases left in «Anúncio antigo» (its own sound is deleted on purpose).
  let fresh = false;
  async function freshAd() {
    if (fresh) return;
    await H.goHome();
    $('.new-card').click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'the gallery');
    $$('.tpl-card')[0].click();
    await waitFor(() => $('.editor') && idle(), 'the new ad in the editor', 20000);
    fresh = true;
  }
  async function openExport(kind) {
    await freshAd();
    // the dialog exports the piece on screen (2026-10-27)
    for await (const s of H.visitScreens([kind === 'video' ? 'editor:Vídeo/Estilo' : 'editor:Imagem/Oferta', 'export'])) void s;
    await waitFor(() => (kind === 'video' ? /Exportar vídeo/ : /Exportar imagem/).test($('#exp-title').textContent), kind);
  }
  const crawlCount = () => { const c = $('.modal.export .crane .count-up'); return c ? Number(c.textContent) : null; };

  test('export: the crane shows the video\'s progress', async () => {
    await openExport('video');
    await exporting(async (files) => {
      byText('.modal.export .export-actions button', /Criar vídeo/).click();
      await waitFor(() => $('.modal.export .export-preview .crane'), 'the crane');
      let rose = false;
      const t0 = performance.now();
      while (!files.length && !rose && performance.now() - t0 < 120000) {
        const n = crawlCount();
        if (n != null && n > 0) rose = true;
        await frame();
      }
      const state = async () => `after ${Math.round(performance.now() - t0)} ms: count ${crawlCount()}, button «${($('.modal.export [aria-busy="true"]') || {}).textContent || '—'}», files ${files.length}, messages ${$$('.toast').map((t) => `«${t.textContent.trim()}»`).join(' ') || '—'}, video ${JSON.stringify((await H.saved()).video).slice(0, 160)}`;
      assert(rose && !files.length, `the count did not rise before the file arrived (${await state()})`);
      await waitFor(() => files.length === 1, 'the video', 120000);
      await waitFor(() => !$('.modal.export'), 'the dialog to close', 8000);
    });
  });

  test('export: «PRONTO» before the dialog closes, then the toast', async () => {
    await openExport('image');
    await exporting(async (files, count) => {
      byText('.modal.export .export-actions button', /Descarregar/).click();
      const cel = await waitFor(() => $('.modal.export .celebration'), '«PRONTO»', 15000);
      assert(/PRONTO/.test(cel.textContent), cel.textContent);
      assert(cel.textContent.includes(files[0].name), `the file's name is not in «${cel.textContent}»`);
      assertEqual(count.success, 1, 'the «ready» vibration');
      assert(!byText('.toast', /Imagem guardada/), 'the message came before «PRONTO» ended');
      // during «PRONTO» the actions rest (a tap would do nothing); the X still closes
      assert(byText('.modal.export .export-actions button', /Descarregar/).disabled, '«Descarregar» looks ready during «PRONTO»');
      assert(!$('.modal.export .modal-head .icon-btn').disabled, 'the X cannot close «PRONTO»');
      await waitFor(() => !$('.modal.export'), 'the dialog to close', 5000);
      await waitFor(() => byText('.toast', /Imagem guardada/), 'the message');
      assertEqual(count.error, 0);
    });
  });

  test('export: cancelling stops the crane and celebrates nothing', async () => {
    await openExport('video');
    await exporting(async (files, count) => {
      const start = byText('.modal.export .export-actions button', /Criar vídeo/);
      assert(start && !start.disabled, `«Criar vídeo» is ${start ? 'disabled' : 'missing'}: ${$('.modal.export .export-actions').textContent.trim()}`);
      start.click();
      await waitFor(() => $('.modal.export .crane'), `the crane (button «${start.textContent.trim()}», messages ${$$('.toast').map((t) => t.textContent.trim()).join(' | ')})`);
      byText('.modal.export button', /Cancelar/).click();
      let celebrated = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 3000 && $('.modal.export .crane')) { if ($('.celebration')) celebrated = true; await frame(); }
      await sleep(600);
      assert(!$('.modal.export .crane'), 'the crane is still working');
      assert(!celebrated && !$('.celebration'), 'it celebrated a cancelled video');
      assertEqual(files.length, 0);
      assertEqual(count, { success: 0, error: 0 });
      await H.closeExport();
    });
  });

  test('export: a failed export vibrates the error once', async () => {
    await openExport('image');
    await exporting(async (files, count) => {
      RS.util.saveBlob = async () => { throw new Error('disk full'); };
      byText('.modal.export .export-actions button', /Descarregar/).click();
      await waitFor(() => byText('.toast', /Não foi possível criar a imagem/), 'the message');
      assertEqual(count, { success: 0, error: 1 });
      assert(!$('.celebration'), 'it celebrated a failure');
      await H.closeExport();
    });
  });

  // ---------------------------------------------------------------- the new icon
  test('icon: the wordmark carries the new icon', async () => {
    await H.goHome();
    const img = $('.home-top .wordmark img.wm-mark');
    assert(img, 'no icon in the wordmark');
    assert(/assets\/brand\/icon-small\.svg$/.test(img.getAttribute('src')), img.getAttribute('src'));
    await waitFor(() => img.complete && img.naturalWidth > 0, 'the icon to load');
    assertEqual(img.getAttribute('alt'), '');
  });

  // ---------------------------------------------------------------- install anywhere
  // «Instalar» lives in the home's ⋯ (2026-10-27): opens ⋯ (once) and gives the item
  const installBtn = () => { if (!$('.home-menu')) { const m = $('.home-top .home-more'); if (!m) return null; m.click(); } return $('.home-menu .install-item'); };
  async function closeInstall() {
    const x = $('.modal.install .modal-head .icon-btn');
    if (x) { x.click(); await waitFor(() => !$('.modal.install'), 'the install sheet to close', 4000); }
  }

  test('install: on the .exe the button offers the phone and asks for the address once', async () => {
    await H.goHome();
    try { localStorage.removeItem('rs-app-url'); } catch { /* none */ }
    const b = await waitFor(installBtn, 'the install button');
    assert(/Instalar no telemóvel/.test(b.textContent + (b.getAttribute('aria-label') || '')), `the button says «${b.textContent.trim()}»`);
    b.click();
    const field = await waitFor(() => $('.modal.install #f-app-url'), 'the address field');
    assertEqual(field.getAttribute('placeholder'), 'https://….ts.net');
    H.type(field, 'http://100.64.0.1:8080');
    byText('.modal.install button', /Mostrar QR/).click();
    await waitFor(() => byText('.modal.install .field-hint.warn', /https/), 'the https warning');
    assert(!$('.modal.install .install-qr'), 'a QR for an http address');
    H.type(field, 'https://x.tailfc994f.ts.net');
    byText('.modal.install button', /Mostrar QR/).click();
    const qr = await waitFor(() => $('.modal.install .install-qr'), 'the QR');
    assertEqual(qr.dataset.link, 'https://x.tailfc994f.ts.net/');
    assert(/Tailscale/.test($('.modal.install').textContent), 'no word about Tailscale');
    await closeInstall();
    (await waitFor(installBtn, 'the install item')).click();
    await waitFor(() => $('.modal.install .install-qr'), 'the QR again');
    assert(!$('.modal.install #f-app-url'), 'the address was asked again');
    await closeInstall();
    try { localStorage.removeItem('rs-app-url'); } catch { /* none */ }
  });

  test('install: a browser that can install installs in one tap', async () => {
    await H.goHome();
    const realDetect = RS.install.detect;
    RS.install.detect = () => 'desktop-chromium';
    let prompts = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { prompts++; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    try {
      window.dispatchEvent(e);
      const b = await waitFor(() => installBtn() && /^\s*Instalar\s*$/.test(installBtn().textContent) && installBtn(), 'the one-tap «Instalar»');
      b.click();
      assertEqual(prompts, 1, 'the browser\'s install did not open on the first tap');
      // then the phone: the QR of this copy, from the same sheet
      await waitFor(() => $('.modal.install'), 'the sheet for the phone');
      await closeInstall();
    } finally { RS.install.detect = realDetect; }
  });

  test('install: the guide shows the steps of the browser in use', async () => {
    await H.goHome();
    const realDetect = RS.install.detect;
    RS.install.detect = () => 'ios-safari';
    try {
      (await waitFor(installBtn, 'the install item')).click();
      const steps = await waitFor(() => $$('.modal.install .install-step').length && $$('.modal.install .install-step'), 'the steps');
      assertEqual(steps.map((s) => s.textContent.trim()), RS.install.STEPS['ios-safari'].map((s) => s.text));
      await waitFor(() => $('.modal.install .install-step.now'), 'the step being shown');
      await closeInstall();
    } finally { RS.install.detect = realDetect; }
  });

  test('install: the welcome after installing celebrates once', async () => {
    const real = RS.haptics.success;
    let ok = 0;
    RS.haptics.success = () => { ok++; };
    try {
      try { localStorage.removeItem('rs-welcomed'); } catch { /* none */ }
      window.dispatchEvent(new Event('appinstalled'));
      const w = await waitFor(() => $('.welcome'), 'the welcome');
      // the installed window that opens next must not welcome again
      assert(localStorage.getItem('rs-welcomed'), 'the welcome is not remembered after «appinstalled»');
      assert(/BEM-VINDO/.test(w.textContent), w.textContent);
      assert(w.querySelector('img[src$="icon.svg"]'), 'no icon entering');
      assertEqual(ok, 1);
      byText('.welcome button', /Começar/).click();
      await waitFor(() => !$('.welcome'), 'the welcome to close', 3000);
    } finally { RS.haptics.success = real; }
  });

  // ---------------------------------------------------------------- the opening
  test('opening: the boot screen shows the new icon in the page theme', () => {
    assert(!window.__bootError, window.__bootError);
    assertEqual(window.__bootHasIcon, true, 'the start screen has no bubble with three dots');
    assert(window.__bootBg && window.__bootBg !== 'rgba(0, 0, 0, 0)', `the start screen has no background: ${window.__bootBg}`);
    assertEqual(window.__bootBg, window.__bootChrome, 'the start screen is not in the page theme');
  });

  // Renders the opening alone; resolves with what happened.
  async function opening(fn) {
    const box = document.createElement('div');
    document.body.appendChild(box);
    let done = 0;
    try { sessionStorage.removeItem('rs-intro'); } catch { /* none */ }
    window.htmPreact.render(window.htmPreact.html`<${RS.ui.Opening} onDone=${() => { done++; }} />`, box);
    try { await fn(box, () => done); } finally {
      window.htmPreact.render(null, box);
      box.remove();
      try { sessionStorage.setItem('rs-intro', '1'); } catch { /* none */ }
    }
  }

  test('opening: a key or a tap skips it at once', async () => {
    await opening(async (box, done) => {
      const o = await waitFor(() => box.querySelector('.opening'), 'the opening');
      assert(o.querySelector('svg.boot-icon') && /Recruitment Studio/.test(o.textContent), 'the opening does not continue the start screen');
      await sleep(150);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const t0 = performance.now();
      await waitFor(() => done() === 1, 'the opening to end on a key', 600);
      assert(performance.now() - t0 < 600, 'the key did not skip it at once');
    });
    await opening(async (box, done) => {
      (await waitFor(() => box.querySelector('.opening'), 'the opening')).click();
      await waitFor(() => done() === 1, 'the opening to end on a tap', 600);
    });
  });

  test('opening: it takes over from the start screen without a jump', async () => {
    await opening(async (box) => {
      const o = await waitFor(() => box.querySelector('.opening .boot-icon'), 'the opening');
      const r = o.getBoundingClientRect();
      const [left, top, width] = window.__bootIconBox;
      assertEqual([Math.round(r.top), Math.round(r.width)], [top, width], 'the icon moves when the opening takes over');
      assert(Math.abs(r.left - left) <= 10, `the icon moves sideways (${Math.round(r.left)} vs ${left})`); // a scrollbar may take a few pixels
    });
  });

  test('opening: it never lasts more than 2.6 s', async () => {
    await opening(async (box, done) => {
      await waitFor(() => box.querySelector('.opening'), 'the opening');
      await waitFor(() => done() === 1, 'the opening to end by itself', 3200);
    });
  });

  test('opening: calm mode does not move', async () => {
    document.documentElement.dataset.motion = 'calm';
    try {
      await opening(async (box) => {
        const o = await waitFor(() => box.querySelector('.opening'), 'the opening');
        await sleep(100);
        const moving = o.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect.getKeyframes().some((k) => 'transform' in k));
        assertEqual(moving.map((a) => a.animationName || a.id), [], 'things still move in calm mode');
        assert(/Recruitment Studio/.test(o.textContent), 'the name is missing');
      });
    } finally { RS.appearance.apply(); }
  });

  // ---------------------------------------------------------------- final review fixes
  test('haptics: an iPhone tap on a submit button sends its form once', async () => {
    const off = RS.haptics.install(document, { mode: 'ios' });
    const form = document.createElement('form');
    let sent = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); sent++; });
    form.innerHTML = '<input name="n" value="912345678"><button class="btn primary" type="submit">Mostrar QR</button>';
    document.body.appendChild(form);
    try {
      const sw = await waitFor(() => form.querySelector('button > .haptic-switch input'), 'the switch on the submit button');
      sw.click(); // the tap lands on the switch itself
      await H.settle();
      assertEqual(sent, 1, 'a tap on the switch did not send the form once');
      form.querySelector('.haptic-switch').click(); // the tap lands on its label
      await H.settle();
      assertEqual(sent, 2, 'a tap on the label did not send the form once');
    } finally { off(); form.remove(); }
  });

  test('motion: the pill moves only with cheap properties and ends exactly on the choice', async () => {
    RS.appearance.set({ theme: 'light' });
    await openSettings('.home-top');
    const pill = await waitFor(() => pillOf($('.settings [role="radiogroup"][aria-label="Tema"]')), 'the pill');
    const props = getComputedStyle(pill).transitionProperty.split(',').map((p) => p.trim());
    assert(props.every((p) => p === 'transform' || p === 'opacity'), `the pill animates ${props.join(', ')}`);
    themeOption('Automático').click(); // a wider option than «Claro»
    await H.settleAnimations();
    const p = pill.getBoundingClientRect(), o = themeOption('Automático').getBoundingClientRect();
    assert(Math.abs(p.left - o.left) <= 1 && Math.abs(p.width - o.width) <= 1 && Math.abs(p.height - o.height) <= 1, `the pill is ${Math.round(p.width)}×${Math.round(p.height)} at ${Math.round(p.left)}, the choice ${Math.round(o.width)}×${Math.round(o.height)} at ${Math.round(o.left)}`);
    RS.appearance.set({ theme: 'auto' });
    await closeSettings();
  });

  // ---------------------------------------------------------------- the minors left by the round
  // The active time of an element's `name` animation (negative while still in its delay).
  const phase = (el, name) => {
    const a = el.getAnimations().find((x) => x.animationName === name);
    return a ? a.effect.getComputedTiming().localTime - a.effect.getTiming().delay : NaN;
  };

  test('opening: it carries on in the start screen\'s phase, whenever the start screen began', async () => {
    // a start screen whose animations began now, long after the page's start (a slow phone)
    const fake = document.createElement('div');
    fake.id = 'boot';
    fake.innerHTML = '<svg class="boot-icon" viewBox="0 0 512 512"><g class="boot-bubble"><circle class="boot-dot" cx="110" cy="150" r="32"/></g></svg>';
    document.body.appendChild(fake);
    try {
      await sleep(900);
      await opening(async (box) => {
        const dot = await waitFor(() => box.querySelector('.opening .boot-dot'), 'the opening');
        await sleep(60);
        const d = phase(dot, 'feel-dot-type') - phase(fake.querySelector('.boot-dot'), 'feel-dot-type');
        assert(Math.abs(d) < 80, `the opening's dots are ${Math.round(d)} ms away from the start screen's`);
      });
    } finally { fake.remove(); }
  });

  test('motion: a row removed just before leaving the editor stays removed', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const list = await waitFor(() => { const i = $('.editor input[id^="f-benefit-"]'); return i && i.closest('.list'); }, 'the benefits list');
    list.querySelector(':scope > .add-row').click();
    const field = await waitFor(() => { const all = list.querySelectorAll(':scope > .li input[type="text"]'); return all[all.length - 1] === document.activeElement && all[all.length - 1]; }, 'the new row');
    H.type(field, 'Vantagem que sai à pressa');
    await H.saved((d) => Object.values(d.texts).some((t) => t.benefits.some((b) => b.text === 'Vantagem que sai à pressa')));
    field.closest('.li').querySelector('button[aria-label^="Remover"]').click();
    $('.editor .topbar .btn.ghost').click(); // back to the ads at once, within the row's exit
    await waitFor(() => $('.home') && idle(), 'home');
    await H.saved((d) => !Object.values(d.texts).some((t) => t.benefits.some((b) => b.text === 'Vantagem que sai à pressa')));
  });

  test('motion: rows already in a list do not grow in again when its panel opens', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Estilo'])) void s;
    byText('.editor .rail button', /^\s*Oferta\s*$/).click();
    const rows = await waitFor(() => $$('.editor .panel[aria-label="Oferta"] .li').length && $$('.editor .panel[aria-label="Oferta"] .li'), 'the rows');
    const growing = rows.filter((r) => r.getAnimations().some((a) => a.animationName === 'feel-row-in'));
    assertEqual(growing.length, 0, 'rows that were already there grow in');
    const list = $('.editor input[id^="f-benefit-"]').closest('.list');
    const n = list.querySelectorAll(':scope > .li').length;
    list.querySelector(':scope > .add-row').click();
    const added = await waitFor(() => { const all = list.querySelectorAll(':scope > .li'); return all.length === n + 1 && all[n]; }, 'the new row');
    assert(added.getAnimations().some((a) => a.animationName === 'feel-row-in'), 'the added row does not grow in');
    added.querySelector('button[aria-label^="Remover"]').click();
    await waitFor(() => !added.isConnected, 'the new row to go');
  });

  test('install: an installed app on a laptop with a touch screen still offers the phone', async () => {
    const realDetect = RS.install.detect;
    RS.install.detect = () => 'installed';
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 10, configurable: true });
    try {
      for await (const s of H.visitScreens(['gallery', 'home'])) void s; // the home bar drawn again
      const b = await waitFor(installBtn, 'the install button', 3000);
      assert(/Instalar no telemóvel/.test(b.textContent), `the item says «${b.textContent.trim()}»`);
      $('.home-top .home-more').click(); // ⋯ closed again
    } finally {
      RS.install.detect = realDetect;
      delete navigator.maxTouchPoints;
      for await (const s of H.visitScreens(['gallery', 'home'])) void s; // the next cases find the real home bar
    }
  });

  test('install: the guide draws the browser and taps each step\'s button', async () => {
    await H.goHome();
    const realDetect = RS.install.detect;
    RS.install.detect = () => 'ios-safari';
    try {
      (await waitFor(installBtn, 'the install item')).click();
      const demo = await waitFor(() => $('.modal.install .install-demo'), 'the drawing of the browser');
      assertEqual(demo.getAttribute('aria-hidden'), 'true', 'the drawing is read aloud (the steps already say it)');
      const now = () => $$('.modal.install .install-step').findIndex((s) => s.classList.contains('now'));
      const tapped = new Map();
      for (let k = 0; k < 3; k++) {
        const step = await waitFor(() => (now() >= 0 && !tapped.has(now()) ? now() + 1 : 0), 'the next step', 4000) - 1;
        await sleep(800); // the finger's way there
        const hit = demo.querySelector('.demo-hit');
        assert(hit, `step ${step + 1}: nothing to tap in the drawing`);
        const f = demo.querySelector('.demo-finger').getBoundingClientRect(), h = hit.getBoundingClientRect();
        const x = f.left + f.width / 2, y = f.top + f.height / 2;
        assert(x >= h.left - 2 && x <= h.right + 2 && y >= h.top - 2 && y <= h.bottom + 2, `step ${step + 1}: the finger (${Math.round(x)}, ${Math.round(y)}) is not on what to tap`);
        tapped.set(step, hit);
      }
      assertEqual(new Set(tapped.values()).size, 3, 'the finger taps the same thing in two steps');
      assert(tapped.get(0).closest('.demo-bar'), 'on an iPhone, «Partilhar» is in Safari\'s bar');
      assert(/Adicionar ao ecrã principal/.test(tapped.get(1).textContent), `step 2 taps «${tapped.get(1).textContent}»`);
      await closeInstall();
    } finally { RS.install.detect = realDetect; }
  });

  test('install: calm mode shows the finger on the button, without movement', async () => {
    await H.goHome();
    const realDetect = RS.install.detect;
    RS.install.detect = () => 'android';
    document.documentElement.dataset.motion = 'calm';
    try {
      (await waitFor(installBtn, 'the install item')).click();
      const demo = await waitFor(() => $('.modal.install .install-demo .demo-hit') && $('.modal.install .install-demo'), 'the drawing');
      await sleep(100);
      const moving = demo.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect.getKeyframes().some((kf) => 'transform' in kf));
      assertEqual(moving.map((a) => a.animationName || a.transitionProperty), [], 'things move in calm mode');
      await closeInstall();
    } finally { RS.install.detect = realDetect; RS.appearance.apply(); }
  });

  test('haptics: on an iPhone a tap anywhere on one of the app\'s switches lands on the switch', async () => {
    await H.goHome();
    const off = RS.haptics.install(document, { mode: 'ios' });
    try {
      await openSettings('.home-top');
      const sw = await waitFor(() => $('.settings .switch'), 'the «Vibração» switch');
      const input = sw.querySelector('input[type="checkbox"]');
      const at = (el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); };
      assertEqual(at(sw.querySelector('.switch-ui')), input, 'a tap on the track misses the switch');
      const words = document.createRange();
      words.selectNodeContents(sw);
      const r = [...words.getClientRects()].pop();
      assertEqual(document.elementFromPoint(r.right - 4, r.top + r.height / 2), input, 'a tap on «Vibração» misses the switch');
    } finally {
      off();
      await closeSettings();
    }
  });

  // ---------------------------------------------------------------- smoothness (motion styles round, task 3)
  test('smooth: a theme change runs no colour transitions under the reveal', async () => {
    RS.appearance.set({ theme: 'light' });
    const real = document.startViewTransition;
    let vt = null;
    document.startViewTransition = function (cb) { vt = real.call(document, cb); return vt; };
    try {
      await openSettings('.home-top');
      themeOption('Escuro').click();
      await waitFor(() => vt, 'the view transition');
      await vt.updateCallbackDone.catch(() => {});
      await new Promise((r) => requestAnimationFrame(r));
      const colours = document.getAnimations().filter((a) => a.transitionProperty && /color|background|border|shadow|fill|stroke/.test(a.transitionProperty));
      assertEqual(colours.length, 0, `${colours.length} colour transitions under the reveal (${colours.slice(0, 3).map((a) => a.transitionProperty).join(', ')})`);
      await vt.finished.catch(() => {});
    } finally {
      document.startViewTransition = real;
      RS.appearance.set({ theme: 'auto' });
      await closeSettings();
    }
  });

  test('smooth: a new tap wins over a screen change that is still animating', async () => {
    await H.goHome();
    await H.settleAnimations();
    $('.home .new-card').click();
    // «Anúncios» of the gallery, tapped while the gallery is still arriving
    const back = await waitFor(() => document.documentElement.classList.contains('is-busy') && $('.gallery .gal-head .btn.ghost'), 'the gallery arriving', 5000);
    assert(document.documentElement.classList.contains('is-busy'), 'the screen change was over before the tap: nothing tested');
    back.click();
    await waitFor(() => $('.home') && !$('.gallery') && idle(), 'the home: the tap on «Anúncios» was dropped', 4000);
  });

  // ---------------------------------------------------------------- smoothness (task 4)
  // RS.motion.prepare as slow as on a mid-range phone, for the length of fn
  async function slowPrepare(ms, fn) {
    const real = RS.motion.prepare;
    const calls = [];
    RS.motion.prepare = function (...a) { calls.push(performance.now()); const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } return real.apply(this, a); };
    try { return await fn(calls); } finally { RS.motion.prepare = real; }
  }

  test('smooth: «Vídeo» shows its panel at once and the style cards fill in after', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Estilo'])) void s;
    await slowPrepare(40, async (calls) => {
      // the first frame drawn with the panel (a task run before the frame would delay it)
      let shownAt = 0;
      const watch = () => { if ($('.video-panel .video-section')) shownAt = performance.now(); else requestAnimationFrame(watch); };
      const t0 = performance.now();
      byText('.editor .topbar [aria-label="Peça"] [role="radio"]', /^\s*Vídeo\s*$/).click();
      requestAnimationFrame(watch);
      await waitFor(() => shownAt, 'the «Vídeo» panel', 8000);
      const took = shownAt - t0;
      assert(took < 400, `the panel took ${Math.round(took)} ms to show (${calls.length} videos prepared before it)`);
      await waitFor(() => $$('.video-panel .motion-card').length > 3 && $$('.video-panel .motion-card').every((c) => c.querySelector('canvas')), 'every style card drawn', 20000);
    });
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
  });

  test('smooth: the export previews are drawn once the dialog has arrived', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const real = RS.engine.render;
    const at = [];
    RS.engine.render = function (...a) { at.push(performance.now()); return real.apply(this, a); };
    let arrived = 0;
    const onEnd = (e) => { if (!arrived && e.target.matches && e.target.matches('.modal.export')) arrived = performance.now(); };
    document.addEventListener('animationend', onEnd, true);
    try {
      $('.editor .topbar button[title^="Exportar"]').click();
      await waitFor(() => $('.modal.export .export-preview canvas.poster-thumb.drawn'), 'the previews drawn', 8000);
      assert(arrived, 'the dialog has no entrance');
      const early = at.filter((t) => t < arrived - 5);
      assertEqual(early.length, 0, `${early.length} previews drawn during the dialog's entrance`);
    } finally { RS.engine.render = real; document.removeEventListener('animationend', onEnd, true); }
    await H.closeExport();
  });

  // ---------------------------------------------------------------- «Ilustrativo» (tasks 5–12)
  // Runs fn in a motion style, then back to «Sóbrio» (the style of the other cases).
  async function inStyle(style, fn) {
    RS.appearance.set({ motion: style });
    try { return await fn(); } finally { RS.appearance.set({ motion: 'sober' }); }
  }
  const named = (name, list = document.getAnimations()) => list.filter((a) => a.animationName === name);
  const press = (el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'mouse', isPrimary: true }));
  };

  test('illustrative: a tap on a main button lays a brick, only in Ilustrativo', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const btn = $('.editor .topbar button[title^="Exportar"]');
    await inStyle('sober', async () => { press(btn); await sleep(60); assertEqual($$('.fx-brick').length, 0, 'a brick in Sóbrio'); });
    await inStyle('illustrative', async () => {
      press(btn);
      const brick = await waitFor(() => $('.fx-brick'), 'a brick', 500);
      assertEqual(brick.closest('[aria-hidden="true"]') !== null, true, 'the brick is read aloud');
      assertEqual(getComputedStyle(brick.parentElement).pointerEvents, 'none', 'the brick catches taps');
      await waitFor(() => !$('.fx-brick'), 'the brick to go', 2000);
    });
  });

  test('illustrative: opening an ad, the crane hoists it into the editor (and back)', async () => {
    await H.goHome();
    await inStyle('illustrative', async () => {
      const seen = { hook: false, hoist: false };
      const watch = setInterval(() => {
        if ($('.vt-hook')) seen.hook = true;
        if (named('feel-hoist').length) seen.hoist = true;
      }, 16);
      try {
        (await waitFor(() => $('.proj-card .proj-open'), 'an ad')).click();
        await waitFor(() => $('.editor') && idle(), 'the editor');
        await sleep(200);
      } finally { clearInterval(watch); }
      assert(seen.hoist, 'the poster was not hoisted');
      assert(seen.hook, 'no crane hook came for the poster');
      await waitFor(() => !$('.vt-hook'), 'the hook to go away', 2500);
      const top = await waitFor(() => named('feel-build-top').length || $('.editor .topbar'), 'the top bar');
      assert(top, 'no top bar');
    });
    await inStyle('sober', async () => {
      $('.editor .topbar .btn.ghost').click();
      let hoist = false;
      const watch = setInterval(() => { if (named('feel-hoist').length || $('.vt-hook')) hoist = true; }, 16);
      try { await waitFor(() => $('.home') && idle(), 'home'); await sleep(200); } finally { clearInterval(watch); }
      assert(!hoist, 'Sóbrio hoisted the poster');
    });
  });

  test('illustrative: the chosen pill swings when it stops and the panel arrives like bricks', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    await inStyle('illustrative', async () => {
      const rail = $('.editor .rail');
      const pill = await waitFor(() => rail.querySelector(':scope > .glide-pill'), 'the pill');
      byText('.editor .rail button', /^\s*Estilo\s*$/).click();
      await waitFor(() => $('.editor .panel[aria-label="Estilo"]'), 'the Estilo panel');
      assert(named('feel-brick-drop').length > 0, 'the panel does not arrive like bricks');
      await waitFor(() => pill.getAnimations().some((a) => a.effect.getKeyframes().some((k) => 'rotate' in k || 'translate' in k)), 'the pill to swing or bounce when it stops', 1500);
    });
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
  });

  test('illustrative: a new row is laid with mortar and a removed one tips over and falls', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    await inStyle('illustrative', async () => {
      const list = $('.editor input[id^="f-benefit-"]').closest('.list');
      const n = list.querySelectorAll(':scope > .li').length;
      list.querySelector(':scope > .add-row').click();
      const row = await waitFor(() => { const all = list.querySelectorAll(':scope > .li'); return all.length === n + 1 && all[n]; }, 'the new row');
      const anims = row.getAnimations({ subtree: true });
      assert(named('feel-row-lay', anims).length, 'the new row is not laid like a brick');
      assert(anims.some((a) => a.animationName === 'feel-mortar' && a.effect.pseudoElement === '::after'), 'no line of mortar');
      row.querySelector('button[aria-label^="Remover"]').click();
      await H.settle();
      assert(named('feel-row-tip', row.getAnimations()).length, 'the removed row does not tip over');
      await sleep(300);
      assert(row.isConnected, 'the row went before its fall');
      await waitFor(() => !row.isConnected, 'the row to go', 1500);
    });
  });

  test('illustrative: the home is alive — the crane swings, the dots type, the cards lean', async () => {
    await H.goHome();
    await inStyle('sober', async () => { await H.settle(); assert(!$('.home-ambient'), 'Sóbrio has the ambient crane'); });
    await inStyle('illustrative', async () => {
      const amb = await waitFor(() => $('.home .home-ambient'), 'the crane in the background');
      assertEqual(amb.getAttribute('aria-hidden'), 'true');
      assert(amb.getAnimations({ subtree: true }).some((a) => a.playState === 'running'), 'the crane stands still');
      assert(named('feel-wm-type', $('.home-top .wordmark').getAnimations({ subtree: true })).length, 'the icon\'s dots do not type');
      const card = await waitFor(() => $('.home .proj-card'), 'an ad card');
      const r = card.getBoundingClientRect();
      card.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.right - 4, clientY: r.top + 4, pointerType: 'mouse' }));
      await waitFor(() => parseFloat(card.style.getPropertyValue('--ry')) > 0, 'the card to lean towards the pointer', 1000);
      card.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }));
      await waitFor(() => !parseFloat(card.style.getPropertyValue('--ry') || '0'), 'the card to straighten', 1000);
    });
  });

  test('illustrative: changing theme, night falls on the site', async () => {
    RS.appearance.set({ theme: 'light' });
    await inStyle('illustrative', async () => {
      await openSettings('.home-top');
      themeOption('Escuro').click();
      const scene = await waitFor(() => $('.nightfall'), 'the night scene', 500);
      assertEqual(scene.getAttribute('aria-hidden'), 'true');
      await waitFor(() => document.documentElement.dataset.theme === 'dark', 'the dark theme under the scene', 2000);
      await waitFor(() => !$('.nightfall'), 'the scene to end by itself', 3000);
      // dawn, ended at once by a key
      themeOption('Claro').click();
      await waitFor(() => $('.nightfall'), 'the dawn scene', 500);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => !$('.nightfall') && document.documentElement.dataset.theme === 'light', 'a key to end the scene with the theme set', 400);
    });
    RS.appearance.set({ theme: 'auto' });
    await closeSettings();
  });

  test('illustrative: messages hang from the hook and errors come as a sign behind the site tape', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    await inStyle('illustrative', async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
      const t = await waitFor(() => byText('.toast', /Anúncio guardado neste aparelho/), 'the message');
      assert(named('feel-hang-in', t.getAnimations()).length, 'the message does not come down on the hook');
      await waitFor(() => t.classList.contains('leave'), 'the message to leave', 6000);
      assert(named('feel-hoist-out', t.getAnimations()).length, 'the crane does not take the message away');
      await sleep(250);
      assert(t.isConnected, 'the message went before the crane took it');
      await waitFor(() => !t.isConnected, 'the message to go', 1500);
    });
  });

  test('illustrative: «Guardado» draws a check with the trowel', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    await inStyle('illustrative', async () => {
      H.type($('#f-kicker'), `Estamos a recrutar ${Date.now() % 1000}`);
      await waitFor(() => $('.editor .save-state.saved .save-check'), 'the check after saving', 5000);
      assert(named('feel-check-draw', $('.editor .save-state').getAnimations({ subtree: true })).length, 'the check is not drawn');
    });
  });

  test('illustrative: a deleted ad crumbles into bricks and is deleted once', async () => {
    await H.goHome();
    const before = (await RS.store.listProjects()).filter((r) => !r.deletedAt).length;
    await inStyle('illustrative', async () => {
      const card = await waitFor(() => $$('.home .proj-card')[0], 'an ad card');
      const id = card.dataset.id;
      card.querySelector('.proj-more').click();
      (await waitFor(() => byText('.proj-card .menu [role="menuitem"]', /Mover para a reciclagem/), 'the card menu')).click();
      await waitFor(() => $$('.fx-piece').length >= 4, 'the card to crumble', 1000);
      await waitFor(() => !$$('.fx-piece').length, 'the bricks to fall away', 2500);
      await waitFor(async () => (await RS.store.listProjects()).filter((r) => !r.deletedAt).length === before - 1, 'one ad deleted', 3000);
      const undo = await waitFor(() => byText('.toast .toast-action', /Anular/), '«Anular»');
      undo.click();
      await waitFor(() => $(`.proj-card[data-id="${id}"]`), 'the ad back after «Anular»', 3000);
    });
  });

  test('smooth: exporting the video on screen does not prepare it again', async () => {
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
    await waitFor(() => $('.video-stage canvas[data-motion]'), 'the stage playing');
    // full preparations only (the style cards of the panel may still be filling in, «lite»)
    const real = RS.motion.prepare;
    let full = 0;
    RS.motion.prepare = function (p, o) { if (!(o && o.lite)) full++; return real.call(this, p, o); };
    try {
      $('.editor .topbar button[title^="Exportar"]').click();
      await waitFor(() => $('.modal.export .export-preview canvas[data-motion]'), 'the video preview', 8000);
      assertEqual(full, 0, 'the export dialog prepared the stage\'s video again');
    } finally { RS.motion.prepare = real; }
    await H.closeExport();
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
  });

  // ---------------------------------------------------------------- final review fixes (motion styles round)
  test('review: in Ilustrativo the install sheet is above the home, not under its cards', async () => {
    await H.goHome();
    await inStyle('illustrative', async () => {
      const b = await waitFor(installBtn, 'the install item');
      b.click();
      const sheet = await waitFor(() => $('.modal.install'), 'the install sheet');
      await H.settleAnimations();
      const r = sheet.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      assert(hit && sheet.contains(hit), `the middle of the sheet is covered by ${hit ? hit.className || hit.tagName : 'nothing'}`);
      $('.modal.install .modal-head .icon-btn').click();
      await waitFor(() => !$('.modal.install'), 'the sheet to close', 4000);
    });
  });

  test('review: exporting right after an edit of the ad prepares the video afresh', async () => {
    // «Oferta» on «Vídeo»: the edit and the export happen before the stage has prepared again
    for await (const s of H.visitScreens(['editor:Vídeo/Oferta'])) void s;
    await waitFor(() => $('.video-stage canvas[data-motion]'), 'the stage playing');
    const real = RS.motion.prepare;
    let full = 0;
    RS.motion.prepare = function (p, o) { if (!(o && o.lite)) full++; return real.call(this, p, o); };
    try {
      H.type($('#f-kicker'), `Mudou depois do vídeo ${Date.now() % 1000}`);
      $('.editor .topbar button[title^="Exportar"]').click();
      await waitFor(() => $('.modal.export'), 'the export dialog');
      await waitFor(() => $('.modal.export .export-preview canvas[data-motion]'), 'the video preview', 8000);
      assert(full > 0, 'the export showed the video prepared before the edit');
    } finally { RS.motion.prepare = real; }
    await H.closeExport();
  });

  test('review: an ad tapped while the home is still arriving opens', async () => {
    for await (const s of H.visitScreens(['gallery'])) void s;
    $('.gallery .gal-head .btn.ghost').click();
    const open = await waitFor(() => document.documentElement.classList.contains('is-busy') && $('.home .proj-card .proj-open'), 'the home arriving', 5000);
    assert(document.documentElement.classList.contains('is-busy'), 'the screen change was over before the tap: nothing tested');
    open.click();
    await waitFor(() => $('.editor') && idle(), 'the editor: the tap on the ad was dropped', 6000);
  });

  // ---------------------------------------------------------------- organisation: blocks fold (accordions)
  const groupBy = (re) => $$('.editor .panel .group').find((g) => re.test(g.querySelector('.group-toggle').textContent));
  test('organize: «Profissões do anúncio» starts folded, says what is chosen and opens on a tap', async () => {
    try { localStorage.removeItem('rs-groups'); } catch { /* none */ }
    for await (const s of H.visitScreens(['editor:Imagem/Estilo', 'editor:Imagem/Oferta'])) void s;
    const g = await waitFor(() => groupBy(/Profissões do anúncio/), 'the «Profissões do anúncio» block');
    const t = g.querySelector('.group-toggle');
    assertEqual(t.getAttribute('aria-expanded'), 'false', '«Profissões do anúncio» is open at first');
    assert(!g.querySelector('.tchip').getClientRects().length, 'the trade chips show while folded');
    assert(g.querySelector('.group-summary') && g.querySelector('.group-summary').textContent.trim().length > 2, 'the folded block does not say which trades are chosen');
    t.click();
    await waitFor(() => t.getAttribute('aria-expanded') === 'true' && g.querySelector('.tchip').getClientRects().length, 'the chips to show');
    assert(document.getElementById(t.getAttribute('aria-controls')), 'the toggle controls nothing');
    t.click();
    await waitFor(() => t.getAttribute('aria-expanded') === 'false', 'folded again');
  });

  test('organize: every block folds and the panel remembers it', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const g = await waitFor(() => groupBy(/^\s*Vantagens/), 'the «Vantagens» block');
    assertEqual(g.querySelector('.group-toggle').getAttribute('aria-expanded'), 'true', '«Vantagens» is folded at first');
    g.querySelector('.group-toggle').click();
    await waitFor(() => !g.querySelector('.group-body').getClientRects().length, '«Vantagens» to fold');
    for await (const s of H.visitScreens(['editor:Imagem/Estilo', 'editor:Imagem/Oferta'])) void s;
    const again = groupBy(/^\s*Vantagens/);
    assertEqual(again.querySelector('.group-toggle').getAttribute('aria-expanded'), 'false', 'the fold was forgotten');
    assert(again.querySelector('.eye'), 'the eye («Visível») is gone from a folded block');
    again.querySelector('.group-toggle').click();
    await waitFor(() => again.querySelector('.group-body').getClientRects().length, '«Vantagens» to open again');
  });

  test('organize: a tap on a text of the poster opens its folded block', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    const g = groupBy(/^\s*Título/);
    g.querySelector('.group-toggle').click();
    await waitFor(() => g.querySelector('.group-toggle').getAttribute('aria-expanded') === 'false', '«Título» folded');
    RS.ui.openField('f-headline');
    await waitFor(() => g.querySelector('.group-toggle').getAttribute('aria-expanded') === 'true' && $('#f-headline').getClientRects().length, '«Título» to open for its field', 2000);
  });

  // A tap where the editor's poster shows `key`: a point of its region that no
  // later region covers (as the editor's hit test reads them).
  async function tapPoster(key) {
    const p = await H.saved();
    const regs = RS.engine.renderToCanvas(p, { scale: 0.2, mode: 'editor' }).regions;
    const scratch = document.createElement('canvas').getContext('2d');
    const hit = (x, y) => {
      for (let i = regs.length - 1; i >= 0; i--) {
        const g = regs[i];
        if (x < g.x || y < g.y || x > g.x + g.w || y > g.y + g.h) continue;
        if (g.clip) { g.clip(scratch); if (!scratch.isPointInPath(x, y)) continue; }
        return g;
      }
      return null;
    };
    const reg = regs.find((r) => r.key === key);
    assert(reg, `no ${key} on the poster`);
    let pt = null;
    for (let i = 1; i < 10 && !pt; i++) for (let j = 1; j < 10 && !pt; j++) {
      const x = reg.x + (reg.w * j) / 10, y = reg.y + (reg.h * i) / 10;
      if (hit(x, y) && hit(x, y).key === key) pt = { x, y };
    }
    assert(pt, `the ${key} is covered everywhere`);
    const canvas = await waitFor(() => $('.workspace canvas.poster'), 'the poster');
    const fmt = RS.model.FORMATS[p.format], r = canvas.getBoundingClientRect();
    const at = { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: r.left + (pt.x / fmt.w) * r.width, clientY: r.top + (pt.y / fmt.h) * r.height };
    canvas.setPointerCapture = () => {}; // a made-up pointer cannot be captured
    try {
      canvas.dispatchEvent(new PointerEvent('pointerdown', at));
      canvas.dispatchEvent(new PointerEvent('pointerup', at));
    } finally { delete canvas.setPointerCapture; }
  }
  async function fold(panel, re) {
    for await (const s of H.visitScreens([`editor:${panel}`])) void s;
    const g = await waitFor(() => groupBy(re), `the ${re} block`);
    const t = g.querySelector('.group-toggle');
    if (t.getAttribute('aria-expanded') === 'true') t.click();
    await waitFor(() => t.getAttribute('aria-expanded') === 'false', `${re} folded`);
  }
  async function opensAt(panel, re, id) {
    await waitFor(() => $(`.editor .panel[aria-label="${panel}"]`), `the ${panel} panel`);
    const g = await waitFor(() => groupBy(re), `the ${re} block`);
    await waitFor(() => g.querySelector('.group-toggle').getAttribute('aria-expanded') === 'true', `${re} to open`, 2000);
    await waitFor(() => document.activeElement && document.activeElement.id === id, `#${id} in focus (${document.activeElement && document.activeElement.id})`, 2000);
    assert(g.contains(document.activeElement), `#${id} is not in ${re}`);
  }
  test('organize: a tap on the poster\'s photo or logo opens its folded block in «Fotos»', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Fotos'])) void s;
    if (!(await H.saved()).photo) {
      (await waitFor(() => $('.library .lib-item'), 'a photo of the library')).click();
      await H.saved((d) => !!d.photo);
    }
    if (!(await H.saved()).logo && !((await H.saved()).brand.name || '').trim()) {
      H.type(await waitFor(() => $('#f-brand-name'), 'the company name'), 'Timework');
      await H.saved((d) => d.brand.name === 'Timework');
    }
    for (const [key, re, id] of [['photo', /^\s*Fotografia\s*$/, 'f-photo'], ['logo', /^\s*Logótipo\s*$/, 'f-logo']]) {
      await fold('Imagem/Fotos', re);
      for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
      await tapPoster(key);
      await opensAt('Fotos', re, id);
    }
  });

  test('organize: a tap on the poster\'s QR (WhatsApp mode) opens «Código QR» in «Contactos»', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Contactos'])) void s;
    if (!((await H.saved()).whatsapp || {}).number) {
      H.type(await waitFor(() => $('#f-contact-wa'), 'the WhatsApp number'), '912345678');
      await H.saved((d) => d.whatsapp && d.whatsapp.number === '912345678');
    }
    const wa = byText('.panel .qr-mode .seg button', /WhatsApp/);
    if (wa.getAttribute('aria-checked') !== 'true') wa.click();
    await H.saved((d) => d.qrMode === 'whatsapp' && d.show.qr !== false && d.show.contacts !== false);
    await fold('Imagem/Contactos', /^\s*Código QR\s*$/);
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    await tapPoster('qr');
    await opensAt('Contactos', /^\s*Código QR\s*$/, 'f-qr');
  });

  test('organize: no two blocks share a fold memory (the sections of the three pieces)', async () => {
    const seen = new Map(), clash = [];
    const note = (where) => {
      const keys = $$('.editor .panel .group').map((g) => g.dataset.fold);
      assert(keys.length, `no blocks in ${where}`);
      for (const k of keys) {
        if (keys.filter((x) => x === k).length > 1) clash.push(`${k} twice in ${where}`);
        else if (seen.has(k) && seen.get(k) !== where) clash.push(`${k} in ${seen.get(k)} and in ${where}`);
        seen.set(k, where);
      }
    };
    for (const panel of ['Imagem/Oferta', 'Imagem/Contactos', 'Imagem/Fotos', 'Imagem/Estilo', 'Carrossel/Estilo']) {
      for await (const s of H.visitScreens([`editor:${panel}`])) void s;
      note(panel);
    }
    for await (const s of H.visitScreens(['editor:Vídeo/Estilo'])) void s;
    // a model with its own colours and letter (the animated poster has neither)
    if (RS.motion.styleOf((await H.saved()).video.motion).poster) {
      byText('.video-panel .motion-card', /Néon/).click();
      await H.saved((d) => d.video.motion === 'neon');
    }
    for (const name of ['Estilo', 'Sequência']) {
      for await (const s of H.visitScreens([`editor:Vídeo/${name}`])) void s;
      note(`Vídeo › ${name}`);
    }
    assert(!clash.length, clash.join('; '));
  });

  test('calm: the new moments are cross-fades in Calmo', async () => {
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
    await inStyle('calm', async () => {
      press($('.editor .topbar button[title^="Exportar"]'));
      await sleep(60);
      assertEqual($$('.fx-brick').length, 0, 'a brick in Calmo');
      byText('.editor .rail button', /^\s*Estilo\s*$/).click();
      await waitFor(() => $('.editor .panel[aria-label="Estilo"]'), 'the Estilo panel');
      const moving = document.getAnimations().filter((a) => a.playState === 'running' && a.animationName && a.animationName !== 'spin' && a.effect.getKeyframes().some((k) => 'transform' in k || 'translate' in k || 'rotate' in k));
      assertEqual(moving.map((a) => a.animationName), [], 'things fly in Calmo');
    });
    for await (const s of H.visitScreens(['editor:Imagem/Oferta'])) void s;
  });
})();
