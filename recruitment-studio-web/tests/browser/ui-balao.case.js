// «Balão» motion (2026-10-28): the poster changes — a new language retypes it, a new
// colour rolls down it, another format pulls a tape measure, undo winds back. Sóbrio and
// Calmo cross-fade. Runs after ui-feel.case.js in run-ui.html (ads exist by then).
(() => {
  const { sleep, $, $$, byText, waitFor } = window.H;
  async function inStyle(motion, fn) { const before = RS.appearance.get().motion; RS.appearance.set({ motion }); try { await fn(); } finally { RS.appearance.set({ motion: before }); } }
  // a case run alone (TEST_GREP) may find no ad yet
  async function ensureAd() {
    await H.goHome();
    if ($('.proj-open')) return;
    await RS.store.putProject(RS.model.newProject(RS.templates.list[0]));
    $('.new-ad').click();
    await waitFor(() => $$('.tpl-card').length && H.idle(), 'the gallery');
    $('.gallery .gal-head .btn.ghost').click();
    await waitFor(() => $('.proj-open') && H.idle(), 'an ad on the home');
  }
  async function editorOn(section = 'Oferta') {
    if (!$('.editor')) await ensureAd();
    for await (const s of H.visitScreens([`editor:Imagem/${section}`])) void s;
  }
  const colourInput = () => $('#editor-panel input[type="color"]');
  const setColour = (v) => { const el = colourInput(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const formatRadio = (label) => byText('.editor .stage-top [role="radio"]', new RegExp(label));
  async function addLanguage(re) {
    $('.editor .stage-top .locales .chip.add').click();
    (await waitFor(() => [...$$('.editor .locales .menu [role="menuitem"]')].find((b) => re.test(b.textContent)), 'the language in the menu')).click();
  }

  test('Ilustrativo: a new language greets and retypes the poster', async () => {
    await editorOn();
    await inStyle('illustrative', async () => {
      await addLanguage(/Italiano/);
      const g = await waitFor(() => $('.greet-bubble'), 'the greeting', 1500);
      assert(/Ciao/.test(g.textContent), g.textContent);
      await waitFor(() => $('.swap-old.type'), 'the poster retyping', 600);
      await waitFor(() => !$('.greet-bubble') && !$('.swap-old'), 'the moment to end', 2000);
    });
  });

  test('Ilustrativo: a new colour rolls down the poster', async () => {
    await editorOn('Estilo');
    await inStyle('illustrative', async () => {
      await waitFor(() => colourInput(), 'a colour');
      setColour('#0e6b4f');
      await waitFor(() => $('.swap-old.roll') && $('.roller'), 'the roller', 800);
      await waitFor(() => !$('.swap-old') && !$('.roller'), 'the roller to finish', 1500);
    });
  });

  test('Ilustrativo: another format pulls the tape measure', async () => {
    await editorOn();
    await inStyle('illustrative', async () => {
      formatRadio('Story').click();
      const tape = await waitFor(() => $('.tape-measure'), 'the tape measure', 1500);
      await sleep(600);
      assert(/1080 × 1920$/.test(((tape.querySelector('.dims') || {}).textContent || '').trim()), (tape.querySelector('.dims') || {}).textContent);
      await waitFor(() => !$('.tape-measure'), 'the tape to go', 1500);
      formatRadio('Retrato').click();
      await sleep(1200);
    });
  });

  test('undo says «Desfeito», redo says «Refeito»', async () => {
    await editorOn();
    await inStyle('sober', async () => {
      H.type($('#f-kicker'), `Vagas ${Date.now() % 1000}`);
      await sleep(300);
      $('.editor button[aria-label^="Desfazer"]').click();
      assert(/Desfeito/.test((await waitFor(() => $('.near-bubble'), '«Desfeito»', 800)).textContent));
      $('.editor button[aria-label^="Refazer"]').click();
      await waitFor(() => $('.near-bubble') && /Refeito/.test($('.near-bubble').textContent), '«Refeito»', 800);
    });
  });

  test('Calmo: the same changes only cross-fade', async () => {
    await editorOn('Estilo');
    await inStyle('calm', async () => {
      await waitFor(() => colourInput(), 'a colour');
      setColour('#1f3b66');
      await waitFor(() => $('.swap-old.fade'), 'a cross-fade', 800);
      assert(!$('.roller') && !$('.greet-bubble') && !$('.tape-measure'), 'an illustration in Calmo');
      await sleep(800);
    });
  });

  test('a newer change wins', async () => {
    await editorOn('Estilo');
    await inStyle('illustrative', async () => {
      await waitFor(() => colourInput(), 'a colour');
      let most = 0;
      const probe = setInterval(() => { most = Math.max(most, $$('.swap-old').length); }, 16);
      setColour('#aa3300'); await sleep(100); setColour('#0033aa');
      await sleep(1300); clearInterval(probe);
      assert(most <= 1, `${most} overlays at once`);
      assertEqual($$('.swap-old').length, 0);
      const c = $('.workspace canvas.poster');
      assertEqual(getComputedStyle(c).opacity, '1'); assertEqual(getComputedStyle(c).clipPath, 'none');
    });
  });

  test('a colour slider dragged leaves one overlay at a time', async () => {
    await editorOn('Estilo');
    await inStyle('illustrative', async () => {
      await waitFor(() => colourInput(), 'a colour');
      let most = 0;
      const probe = setInterval(() => { most = Math.max(most, $$('.swap-old').length); }, 16);
      for (let i = 0; i < 20; i++) { setColour(`#${(16 + i * 9).toString(16)}3366`); await sleep(50); }
      await sleep(1300); clearInterval(probe);
      assert(most <= 1, `${most} overlays at once`);
      assertEqual($$('.swap-old').length, 0);
    });
  });

  test('typing never waits for a swap', async () => {
    await editorOn();
    await inStyle('illustrative', async () => {
      // the last drawing of the editor's poster: it must show what was typed once the swap is over
      const render = RS.engine.render;
      let drawn = null;
      RS.engine.render = function (ctx, project, opts) { if (opts && opts.mode === 'editor') drawn = project.texts[project.locale].headline; return render.apply(this, arguments); };
      try {
        await addLanguage(/English/);
        const f = $('#f-headline');
        H.type(f, 'Builders wanted');
        assertEqual(f.value, 'Builders wanted');
        await waitFor(() => $('.swap-old'), 'the swap to start', 1500);
        await waitFor(() => !$('.swap-old'), 'the swap to end', 2000);
        await waitFor(() => drawn === 'Builders wanted', 'the poster to show the typed title', 1500);
        const c = $('.workspace canvas.poster');
        assertEqual(getComputedStyle(c).opacity, '1');
        assert(!c.classList.contains('swap-new'), 'the poster is still typing in');
      } finally { RS.engine.render = render; }
    });
  });

  // deferred minor (2026-10-29): a drawing that throws still lets the old poster go
  test('a poster drawing that fails leaves no old poster over the stage', async () => {
    await editorOn('Estilo');
    await inStyle('illustrative', async () => {
      await waitFor(() => colourInput(), 'a colour');
      const render = RS.engine.render;
      let threw = false;
      RS.engine.render = function (ctx, project, opts) { if (!threw && opts && opts.mode === 'editor') { threw = true; throw new Error('drawing failed (test)'); } return render.apply(this, arguments); };
      try {
        setColour('#335577');
        await waitFor(() => threw, 'the failing drawing', 2000);
        await sleep(1500);
        assert(!$('.swap-old') && !$('.roller'), 'the old poster stayed over the stage');
      } finally { RS.engine.render = render; }
      setColour('#3a6b4f');
      await sleep(900);
    });
  });

  // ---------------------------------------------------------------- WhatsApp, the spirit level, image to carousel
  const pieceRadio = (name) => byText('.editor .topbar [aria-label="Peça"] [role="radio"]', new RegExp(`^\\s*${name}\\s*$`));

  test('Ilustrativo: a complete number rings the poster button', async () => {
    await editorOn('Contactos');
    const sw = byText('.panel[aria-label="Contactos"] .switch', /Botão WhatsApp no anúncio/).querySelector('input');
    if (!sw.checked) { sw.click(); await sleep(300); }
    await inStyle('illustrative', async () => {
      const f = $('#f-contact-wa');
      H.type(f, '91'); await sleep(300);
      assert(!$('.wa-ring') && !$('.field-ok'), 'a ring or a ✓ for an incomplete number');
      H.type(f, '912 345 678');
      await waitFor(() => $('.wa-ring') && $('.chat-bubble'), 'the ring and the chat bubble', 1500);
      await waitFor(() => $('.chat-bubble') && $('.chat-bubble').textContent.trim().length > 3, 'the message in the bubble', 1500);
      assert($('.field-ok'), 'no ✓ by the number');
      await waitFor(() => !$('.wa-ring') && !$('.chat-bubble'), 'the ring and the bubble to go', 4000);
    });
  });

  test('opening an ad that already has a number does not ring', async () => {
    await H.saved((d) => d.whatsapp && d.whatsapp.number === '912 345 678');
    await H.goHome();
    await inStyle('illustrative', async () => {
      await editorOn('Contactos');
      await sleep(1200);
      assert(!$('.wa-ring') && !$('.chat-bubble'), 'a ring on opening the ad');
      assert($('.field-ok'), 'no ✓ by a complete number');
    });
  });

  // A press-drag-release on the poster's photo through made-up pointers (in client pixels).
  async function dragOnPoster(canvas, from, steps, onMoved = () => {}) {
    const ev = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, clientX: x, clientY: y }));
    canvas.setPointerCapture = () => {}; // a made-up pointer cannot be captured
    try {
      ev('pointerdown', from.x, from.y);
      for (const s of steps) ev('pointermove', from.x + s, from.y);
      await sleep(80); // held a moment: the stage has drawn what the drag shows
      onMoved();
      const last = steps[steps.length - 1];
      ev('pointerup', from.x + last, from.y);
    } finally { delete canvas.setPointerCapture; }
  }
  const step = (what, pr) => pr.catch((e) => { throw new Error(what + ': ' + e.message); });
  test('dragging the photo snaps to the centre', async () => {
    await editorOn('Fotos');
    await inStyle('illustrative', async () => {
      // a wide photo: it can always move sideways in its frame
      const before = ((await H.saved()).photo || {}).asset;
      const blob = await new Promise((r) => H.fakePhoto(5, 2400, 1200).toBlob(r, 'image/jpeg', 0.8));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'obra.jpg', { type: 'image/jpeg' }));
      $('.workspace .stage').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      let p = await step('the new photo', H.saved((d) => d.photo && d.photo.asset !== before));
      await sleep(500);
      const res = RS.engine.renderToCanvas(p, { scale: 0.2, mode: 'editor', images: { photo: await RS.assets.load(p.photo.asset) } });
      const g = res.regions.find((x) => x.key === 'photo');
      assert(g && res.photo && res.photo.dw > res.photo.rect.w, 'the photo cannot move sideways');
      const canvas = $('.workspace canvas.poster'), fmt = RS.model.FORMATS[p.format], r = canvas.getBoundingClientRect(), k = r.width / fmt.w;
      const from = { x: r.left + (g.x + g.w / 2) * k, y: r.top + (g.y + g.h / 2) * k };
      // away from the centre first
      await dragOnPoster(canvas, from, [10, 30, 40]);
      p = await step('the photo away from the centre', H.saved((d) => Math.abs(RS.model.photoForFormat(d.photo, d.format).fx - 0.5) > 0.01));
      const fx0 = RS.model.photoForFormat(p.photo, p.format).fx;
      // then back to 5 poster pixels from it
      const dx = ((fx0 - 0.5) * res.photo.dw - 5) * k;
      let guide = false, level = false;
      await dragOnPoster(canvas, from, [dx / 2, dx], () => { guide = !!$('.workspace .guide-v'); level = !!$('.workspace .spirit-level'); });
      await sleep(50);
      guide = guide || !!$('.workspace .guide-v'); level = level || !!$('.workspace .spirit-level');
      p = await step('the photo back on the centre', H.saved((d) => RS.model.photoForFormat(d.photo, d.format).fx === 0.5));
      assert(guide, 'no centre line while snapped');
      assert(level, 'no spirit level in Ilustrativo');
      await waitFor(() => !$('.workspace .spirit-level'), 'the spirit level to leave', 1500);
    });
  });

  test('Ilustrativo: image to carousel deals the slides', async () => {
    await editorOn();
    await inStyle('illustrative', async () => {
      pieceRadio('Carrossel').click();
      await waitFor(() => $('.carousel-stage.dealing'), 'the slides dealt', 1500);
      await waitFor(() => $('.carousel-stage') && !$('.carousel-stage.dealing'), 'the dealing to end', 1200);
      pieceRadio('Imagem').click();
      await waitFor(() => $('.workspace canvas.poster'), 'the image piece');
      await sleep(600);
    });
  });

  // ---------------------------------------------------------------- final review (2026-10-28)
  test('Ilustrativo: a palette rolls down the poster too', async () => {
    await editorOn('Estilo');
    await inStyle('illustrative', async () => {
      const pal = await waitFor(() => $$('#editor-panel .palette').find((b) => !b.classList.contains('on')), 'a palette');
      pal.click();
      await waitFor(() => $('.swap-old.roll') && $('.roller'), 'the roller', 800);
      await waitFor(() => !$('.swap-old') && !$('.roller'), 'the roller to finish', 1500);
    });
  });

  test('an undo on the carousel plays nothing on the image afterwards', async () => {
    await editorOn();
    await inStyle('illustrative', async () => {
      pieceRadio('Carrossel').click();
      await waitFor(() => $('.carousel-stage'), 'the carousel');
      await sleep(1100);
      H.type($('#f-kicker'), `Vagas ${Date.now() % 1000}`);
      await sleep(400);
      $('.editor button[aria-label^="Desfazer"]').click();
      await sleep(200);
      let seen = false;
      const probe = setInterval(() => { seen = seen || !!$('.swap-old'); }, 16);
      pieceRadio('Imagem').click();
      await waitFor(() => $('.workspace canvas.poster'), 'the image piece');
      await sleep(900); clearInterval(probe);
      assert(!seen, 'a stage swap played on the image after an undo on the carousel');
    });
  });

  // Orange is the main action's (and the home band's) only: no other visible part of
  // the editor is painted in the brand orange or the orange text colour.
  const ORANGES = ['rgb(242, 92, 5)', 'rgb(180, 68, 0)', 'rgb(255, 157, 92)'];
  function orangeIn(root) {
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      if (!el.getClientRects().length || el.closest('.btn.primary')) continue;
      const cs = getComputedStyle(el);
      const prop = ['backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'color', 'accentColor', 'fill', 'stroke'].find((k) => ORANGES.includes(cs[k]));
      if (prop) out.push(`${typeof el.className === 'string' ? el.className : el.tagName} ${prop}`);
    }
    return out;
  }
  test('orange in the editor is «Exportar» only', async () => {
    const seen = new Set();
    if (!$('.editor')) await ensureAd();
    for (const s of ['editor:Imagem/Oferta', 'editor:Imagem/Contactos', 'editor:Imagem/Fotos', 'editor:Imagem/Estilo', 'editor:Carrossel/Estilo', 'editor:Carrossel/Sequência', 'editor:Vídeo/Estilo', 'editor:Vídeo/Sequência']) {
      for await (const x of H.visitScreens([s])) void x;
      await sleep(300);
      orangeIn($('.editor')).forEach((o) => seen.add(`${s.replace('editor:', '')}: ${o}`));
    }
    for await (const x of H.visitScreens(['editor:Imagem/Oferta'])) void x;
    assert(!seen.size, `${seen.size} orange parts: ${[...seen].slice(0, 16).join(' | ')}`);
  });

  // owner (2026-10-28): Sóbrio and Calmo keep the spec's details — the size counts (Sóbrio)
  // or swaps (Calmo) on a format change; a new language's chip pops (Sóbrio)
  test('Sóbrio: another format counts the size', async () => {
    await editorOn();
    await inStyle('sober', async () => {
      formatRadio('Story').click();
      const r = await waitFor(() => $('.size-readout'), 'the size', 800);
      const first = r.textContent.trim();
      await sleep(600);
      assert(/1080 × 1920$/.test(r.textContent.trim()), r.textContent);
      assert(first !== '1080 × 1920', `the size did not count (${first})`);
      assert(!$('.tape-measure'), 'a tape measure in Sóbrio');
      await waitFor(() => !$('.size-readout'), 'the size to go', 1500);
      formatRadio('Retrato').click();
      await sleep(1000);
    });
  });

  test('Calmo: another format swaps the size at once', async () => {
    await editorOn();
    await inStyle('calm', async () => {
      formatRadio('Story').click();
      const r = await waitFor(() => $('.size-readout'), 'the size', 800);
      assert(/1080 × 1920$/.test(r.textContent.trim()), `the size counted in Calmo (${r.textContent})`);
      formatRadio('Retrato').click();
      await sleep(1000);
    });
  });

  test('Sóbrio: a new language pops its chip', async () => {
    await editorOn();
    await inStyle('sober', async () => {
      await addLanguage(/./);
      await waitFor(() => $('.editor .locales .chip.pop-once'), 'the new chip to pop', 800);
      assert(!$('.greet-bubble'), 'a greeting in Sóbrio');
      await sleep(500);
    });
  });

  test('Calmo: no dealing', async () => {
    await editorOn();
    await inStyle('calm', async () => {
      pieceRadio('Carrossel').click();
      let dealt = false;
      const probe = setInterval(() => { dealt = dealt || !!$('.carousel-stage.dealing'); }, 16);
      await waitFor(() => $('.carousel-stage'), 'the carousel', 1500);
      await sleep(700); clearInterval(probe);
      assert(!dealt, 'the slides were dealt in Calmo');
      pieceRadio('Imagem').click();
      await waitFor(() => $('.workspace canvas.poster'), 'the image piece');
    });
  });
})();
