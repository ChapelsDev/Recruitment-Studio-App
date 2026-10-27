// Interface: the editor's «Vídeo» mode (the panel's four tabs: recipes and
// styles with their lengths, «Textos do vídeo» per language, the look, sound
// and end; the moving stage with «Ouvir»), «Converter em vídeo» and the
// trimmed export dialog.
// Runs after ui-offer.case.js (the editor of «Anúncio antigo» is open).
(() => {
  const { sleep, $, $$, byText, waitFor, settle, type, saved, toneWav, findBytes, bytesOf } = window.H;
  const ad = (check) => saved(check, 'Anúncio antigo');
  async function closeDialog() {
    await waitFor(() => !$('.modal-back.closing'), 'the dialog to finish closing', 3000);
    if (!$('.modal.export')) return;
    $('.modal.export .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal.export'), 'the dialog to close', 3000);
  }
  async function mode(name) {
    await closeDialog();
    const b = byText('.topbar .mode-switch button', new RegExp(name));
    if (b.getAttribute('aria-checked') !== 'true') b.click();
    return waitFor(() => (name === 'Vídeo' ? $('.video-panel .video-tabs') : $('.panel:not(.video-panel)')), `the ${name} mode`);
  }
  // A tab of the «Vídeo» panel: «Modelo», «Textos», «Aspeto», «Som e fim».
  async function vtab(name) {
    const b = await waitFor(() => byText('.video-panel .video-tabs [role="tab"]', new RegExp(`^\\s*${name}\\s*$`)), `the ${name} tab`);
    if (b.getAttribute('aria-selected') !== 'true') b.click();
    return waitFor(() => $(`.video-panel [role="tabpanel"][aria-labelledby="${b.id}"]`), `the ${name} tab open`);
  }
  const prep = (p, locale) => RS.motion.prepare(p, { format: 'story', locale, images: {}, photos: { hero: null, cards: [] } });
  async function exportDialog() {
    await closeDialog();
    byText('.topbar .btn', /^\s*Exportar\s*$/).click();
    return waitFor(() => $('.modal.export'), 'the export dialog');
  }
  const pressed = (re) => byText('.modal.export .kind-switch button', re).getAttribute('aria-checked') === 'true';
  const files = [];
  const realSave = RS.util.saveBlob;

  test('video: «Vídeo» shows the panel and the moving stage', async () => {
    RS.util.saveBlob = async (blob, name) => { files.push({ blob, name }); return true; };
    await mode('Vídeo');
    await vtab('Modelo');
    assertEqual($$('.video-panel .motion-card').length, RS.motion.STYLES.filter((s) => !s.test).length);
    // the two galleries are blocks of «Modelo», before «Duração»
    const heads = $$('.video-panel .group h3').map((h) => h.textContent.trim());
    assertEqual(heads.slice(0, 2), ['Receitas', 'Estilos']);
    assertEqual(heads[heads.length - 1], 'Duração');
    const c = await waitFor(() => $('.video-stage canvas[data-motion]'), 'the stage playing');
    const a = c.toDataURL();
    await sleep(400);
    assert(c.toDataURL() !== a, 'the stage does not move');
  });

  test('video: the panel has four tabs and remembers the open one', async () => {
    assertEqual($('.video-panel .video-tabs').getAttribute('role'), 'tablist');
    assertEqual($$('.video-panel .video-tabs [role="tab"]').map((t) => t.textContent.trim()), ['Modelo', 'Textos', 'Aspeto', 'Som e fim']);
    const end = await vtab('Som e fim');
    assert(/Som/.test(end.textContent), 'no sound in «Som e fim»');
    await mode('Imagem');
    await mode('Vídeo');
    const tab = byText('.video-panel .video-tabs [role="tab"]', /Som e fim/);
    assertEqual(tab.getAttribute('aria-selected'), 'true');
    // the arrow keys move between the tabs
    tab.focus();
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await waitFor(() => byText('.video-panel .video-tabs [role="tab"]', /Aspeto/).getAttribute('aria-selected') === 'true', '«Aspeto» after ←');
    await vtab('Modelo');
  });

  test('video: picking «Tijolo» saves it and the stage follows', async () => {
    byText('.video-panel .motion-card', /Tijolo/).click();
    await ad((d) => d.video.motion === 'tijolo' && d.video.bg === 'light');
    await waitFor(() => $('.video-stage canvas[data-motion="tijolo"]'), 'Tijolo on the stage');
  });

  test('video: the gallery with the chosen model is open, the other folded and naming it; a pick folds nothing', async () => {
    const gallery = (name) => $$('.video-panel .group').find((g) => g.querySelector('h3').textContent.trim() === name);
    const state = (g) => g.querySelector('.group-toggle').getAttribute('aria-expanded');
    const summary = (g) => (g.querySelector('.group-summary') || { textContent: '' }).textContent;
    // the tab opened again (Tijolo was picked with the tab open: that folded nothing)
    await vtab('Textos');
    await vtab('Modelo');
    await waitFor(() => state(gallery('Receitas')) === 'true' && state(gallery('Estilos')) === 'false', 'Receitas open, Estilos folded');
    assert(/Tijolo/.test(summary(gallery('Estilos'))), `the folded «Estilos» says «${summary(gallery('Estilos'))}»`);
    assert(gallery('Receitas').querySelector('.motion-card.on'), 'the open gallery does not hold the choice');
    // a style chosen: «Estilos» opened by hand, Néon tapped — «Receitas» above it stays as it was and the card stays put
    gallery('Estilos').querySelector('.group-toggle').click();
    await waitFor(() => state(gallery('Estilos')) === 'true', 'Estilos open');
    await H.settleAnimations(); // the block unfolds
    const neon = byText('.video-panel .motion-card', /Néon/);
    const top = neon.getBoundingClientRect().top;
    neon.click();
    await ad((d) => d.video.motion === 'neon');
    await H.settleAnimations();
    assertEqual(state(gallery('Receitas')), 'true', '«Receitas» folded under the tap');
    assert(Math.abs(neon.getBoundingClientRect().top - top) < 2, `the tapped card moved from ${top} to ${neon.getBoundingClientRect().top}`);
    // the next time the tab opens, the gallery holding the model opens and the other («Receitas», never folded by hand) names it
    await vtab('Textos');
    await vtab('Modelo');
    await waitFor(() => state(gallery('Estilos')) === 'true' && state(gallery('Receitas')) === 'false', 'Estilos open, Receitas folded');
    assert(/Néon/.test(summary(gallery('Receitas'))), `the folded «Receitas» says «${summary(gallery('Receitas'))}»`);
    gallery('Receitas').querySelector('.group-toggle').click();
    await waitFor(() => state(gallery('Receitas')) === 'true', 'Receitas open again');
    byText('.video-panel .motion-card', /Tijolo/).click();
    await ad((d) => d.video.motion === 'tijolo');
  });

  test('video: clicking the stage pauses and resumes it', async () => {
    const c = $('.video-stage canvas[data-motion]');
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await waitFor(() => $('.video-stage.paused'), 'paused');
    const a = c.toDataURL();
    await sleep(300);
    assertEqual(c.toDataURL(), a);
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await waitFor(() => !$('.video-stage.paused'), 'playing again');
  });

  test('video: «Converter em vídeo» opens «Vídeo» with the image\'s texts', async () => {
    await mode('Imagem');
    (await waitFor(() => $('.workspace .ws-convert'), '«Converter em vídeo»')).click();
    await waitFor(() => $('.video-panel .video-tabs'), '«Vídeo»');
    await vtab('Textos');
    const d = await ad();
    const f = await waitFor(() => $('#vt-headline'), 'the title field');
    assertEqual(f.value, d.texts['pt-PT'].headline);
    assert(!d.video.texts['pt-PT'], 'the image texts were copied into the video');
  });

  test('video: a text changed in «Textos» is saved for that language only and reaches the stage', async () => {
    await vtab('Textos');
    type($('#vt-headline'), 'Pintores, venham já');
    let d = await ad((x) => x.video.texts['pt-PT'] && x.video.texts['pt-PT'].headline === 'Pintores, venham já');
    assert(d.texts['pt-PT'].headline !== 'Pintores, venham já', 'the image title changed too');
    assertEqual(prep(d, 'pt-PT').content.headline, 'Pintores, venham já');
    // a second language has its own texts
    $('.topbar .locales .chip.add').click();
    (await waitFor(() => byText('.locales .menu [role="menuitem"]', /Français/), 'French in the menu')).click();
    const fr = await waitFor(() => byText('.video-panel .texts-locales button', /^\s*FR\s*$/), 'the FR chip');
    if (fr.getAttribute('aria-checked') !== 'true') fr.click();
    d = await ad((x) => x.locales.includes('fr') && x.locale === 'fr');
    await waitFor(() => $('#vt-headline').value === d.texts.fr.headline, 'the French image title');
    type($('#vt-headline'), 'Peintres, venez');
    d = await ad((x) => x.video.texts.fr && x.video.texts.fr.headline === 'Peintres, venez');
    assertEqual(d.video.texts['pt-PT'].headline, 'Pintores, venham já');
    assertEqual(prep(d, 'fr').content.headline, 'Peintres, venez');
    assertEqual(prep(d, 'pt-PT').content.headline, 'Pintores, venham já');
    byText('.video-panel .texts-locales button', /^\s*PT\s*$/).click();
    await ad((x) => x.locale === 'pt-PT');
    await waitFor(() => $('#vt-headline').value === 'Pintores, venham já', 'the Portuguese video title');
  });

  test('video: a highlight can be added («40 h» · «por semana») and an image item removed and brought back', async () => {
    await vtab('Textos');
    const rows = (k) => $$(`#vt-block-${k} .vt-row`);
    const n = rows('highlights').length;
    $('#vt-block-highlights .vt-add').click();
    const row = await waitFor(() => rows('highlights').length === n + 1 && rows('highlights')[n], 'a new highlight');
    const [value, label] = row.querySelectorAll('input');
    type(value, '40 h');
    type(label, 'por semana');
    let d = await ad((x) => { const h = x.video.texts['pt-PT'] && x.video.texts['pt-PT'].highlights; return h && h.added.some((a) => a.value === '40 h' && a.label === 'por semana'); });
    const h = RS.motionTimeline.content(d, 'pt-PT').highlights.find((x) => x.value === '40 h');
    assert(h && h.label === 'por semana' && h.count === 40, JSON.stringify(h));
    // an image benefit taken out of the video, then brought back
    const first = d.texts['pt-PT'].benefits.find((b) => b.text.trim());
    rows('benefits')[0].querySelector('.vt-remove').click();
    d = await ad((x) => { const b = x.video.texts['pt-PT'].benefits; return b && b.edits[first.id] === null; });
    assert(!RS.motionTimeline.content(d, 'pt-PT').benefits.includes(first.text.trim()), 'the benefit is still in the video');
    assert(d.texts['pt-PT'].benefits.some((b) => b.id === first.id), 'the benefit left the image too');
    (await waitFor(() => $('#vt-block-benefits .vt-row.removed .vt-restore'), '«Voltar a pôr»')).click();
    d = await ad((x) => { const b = x.video.texts['pt-PT'].benefits; return !b || !(first.id in b.edits); });
    assert(RS.motionTimeline.content(d, 'pt-PT').benefits.includes(first.text.trim()), 'the benefit did not come back');
  });

  test('video: «Repor da imagem» brings the image\'s text back', async () => {
    await vtab('Textos');
    const reset = await waitFor(() => $('#vt-headline').closest('.vt-field').querySelector('.vt-reset'), '«Repor da imagem» on the edited title');
    assert(/Repor da imagem/.test(reset.textContent), reset.textContent);
    reset.click();
    const d = await ad((x) => !(x.video.texts['pt-PT'] && 'headline' in x.video.texts['pt-PT']));
    await waitFor(() => $('#vt-headline').value === d.texts['pt-PT'].headline, 'the image title back in the field');
    assert(!$('#vt-headline').closest('.vt-field').querySelector('.vt-reset'), '«Repor da imagem» is still there');
    // «Repor tudo da imagem»: every text of this language follows the image again
    type($('#vt-kicker'), 'Só no vídeo');
    await ad((x) => x.video.texts['pt-PT'] && x.video.texts['pt-PT'].kicker === 'Só no vídeo');
    $('.video-panel .vt-reset-all').click();
    const e = await ad((x) => !x.video.texts['pt-PT']);
    assertEqual(e.video.texts.fr.headline, 'Peintres, venez');
    await waitFor(() => $('#vt-kicker').value === (e.texts['pt-PT'].kicker || ''), 'the image kicker back');
  });

  test('video: lengths that cannot be filled are greyed with how much to write', async () => {
    await vtab('Textos');
    const eyes = (on) => ['benefits', 'highlights', 'positions'].forEach((k) => {
      const eye = $(`#vt-block-${k} .group-head .eye`);
      if ((eye.getAttribute('aria-pressed') === 'true') !== on) eye.click();
    });
    eyes(false);
    const d = await ad((x) => x.video.show.benefits === false && x.video.show.highlights === false && x.video.show.positions === false);
    const L = RS.motion.lengths(d, { locale: 'pt-PT' });
    const lost = L.options.filter((o) => !o.ok);
    assert(lost.length > 0, `every length can be filled: up to ${L.max} s`);
    await vtab('Modelo');
    await waitFor(() => byText('.video-panel .lengths button', new RegExp(`^\\s*${lost[0].value} s\\s*$`)).disabled, `${lost[0].value} s greyed`);
    for (const o of L.options.filter((x) => x.value !== 'auto')) {
      const b = byText('.video-panel .lengths button', new RegExp(`^\\s*${o.value} s\\s*$`));
      assert(b, `no ${o.value} s`);
      assertEqual(b.disabled, !o.ok);
      if (!o.ok) assert(new RegExp(`Escreva mais ${o.missing} vantage(m|ns) ou destaques? para chegar aos ${o.value} s`).test(b.title), b.title);
    }
    const worst = lost[lost.length - 1];
    const note = $('.video-panel .length-note');
    assert(note && note.textContent.includes(`para chegar aos ${worst.value} s`), note ? note.textContent : 'no note');
    await vtab('Textos');
    eyes(true);
    await ad((x) => x.video.show.benefits === true && x.video.show.highlights === true && x.video.show.positions === true);
  });

  test('video: «Automática» shows its length', async () => {
    await vtab('Modelo');
    byText('.video-panel .lengths button', /Automática/).click();
    const d = await ad((x) => x.video.duration === 'auto');
    const L = RS.motion.lengths(d, { locale: 'pt-PT' });
    await waitFor(() => new RegExp(`Automática\\s*·\\s*${L.auto}\\s*s`).test(byText('.video-panel .lengths button', /Automática/).textContent), `«Automática · ${L.auto} s»`);
    await waitFor(() => $('.video-stage .ws-notes').textContent.includes(`· ${L.auto} s ·`), 'the stage at that length');
    // another model keeps «Automática»
    byText('.video-panel .motion-card', /Partidas/).click();
    await ad((x) => x.video.motion === 'partidas' && x.video.duration === 'auto');
    byText('.video-panel .motion-card', /Tijolo/).click();
    await ad((x) => x.video.motion === 'tijolo' && x.video.duration === 'auto');
  });

  test('video: «Contacto no fim» 4 s is saved', async () => {
    await vtab('Som e fim');
    byText('.video-panel .seg button', /^\s*4 s\s*$/).click();
    await ad((d) => d.video.hold === 4);
  });

  test('video: «Cartaz animado» says its texts come from the image', async () => {
    await vtab('Modelo');
    byText('.video-panel .motion-card', /Cartaz animado/).click();
    await ad((d) => d.video.motion === 'poster');
    const panel = await vtab('Textos');
    await waitFor(() => /O Cartaz animado mostra a imagem tal como está: mude os textos na imagem/.test(panel.textContent), 'the note');
    assert(!$('#vt-headline'), 'the video texts are offered for «Cartaz animado»');
  });

  test('video: the panel shows only what acts on the chosen recipe or style', async () => {
    const groups = async (tab) => { await vtab(tab); await settle(); return $$('.video-panel .group h3').map((h) => h.textContent.trim()); };
    // «Cartaz animado», chosen above
    assert(!(await groups('Modelo')).includes('Fotografias'), '«Cartaz animado» offers «Fotografias»');
    assertEqual(await groups('Aspeto'), ['Animação']);
    assert(!(await groups('Som e fim')).includes('Contacto no fim'), '«Cartaz animado» offers «Contacto no fim»');
    await vtab('Modelo');
    byText('.video-panel .motion-card', /Tijolo/).click();
    await ad((d) => d.video.motion === 'tijolo');
    assert(!(await groups('Modelo')).includes('Fotografias'), 'Tijolo uses no photos but offers «Fotografias»');
    assert((await groups('Som e fim')).includes('Contacto no fim'), 'Tijolo without «Contacto no fim»');
    await vtab('Modelo');
    byText('.video-panel .motion-card', /Colagem/).click();
    await ad((d) => d.video.motion === 'colagem');
    // «Fotografias» is part of the model: after the galleries, before «Duração»; «Aspeto» is the look only
    await waitFor(async () => JSON.stringify(await groups('Modelo')) === JSON.stringify(['Receitas', 'Estilos', 'Fotografias', 'Duração']), 'Colagem with «Fotografias» in «Modelo»');
    assertEqual(await groups('Aspeto'), ['Cores', 'Letra']);
    await vtab('Modelo');
  });

  test('video: «Escolher» photos keeps the picked ids', async () => {
    await vtab('Modelo');
    byText('.video-panel .seg button', /Escolher/).click();
    const items = await waitFor(() => { const l = $$('.video-panel .video-photos .lib-item'); return l.length >= 3 ? l : null; }, 'the photos to pick from');
    items[0].click();
    await waitFor(() => $$('.video-panel .video-photos .lib-item[aria-pressed="true"]').length === 1, 'one picked');
    $$('.video-panel .video-photos .lib-item')[2].click();
    const v = (await ad((d) => d.video.photos.mode === 'chosen' && d.video.photos.ids.length === 2)).video;
    assertEqual(new Set(v.photos.ids).size, 2);
  });

  test('video: changing the duration while «Ouvir» plays stops the old sound', async () => {
    const real = RS.sound.preview;
    const calls = [];
    RS.sound.preview = (src, at) => {
      const pv = real(src, at);
      const c = { stopped: false };
      calls.push(c);
      return { time: pv.time, stop() { c.stopped = true; pv.stop(); } };
    };
    try {
      await vtab('Modelo');
      byText('.video-stage button', /Ouvir/).click();
      await waitFor(() => calls.length === 1, 'the sound to start');
      byText('.video-panel .lengths button', /^\s*6 s\s*$/).click();
      await waitFor(() => calls.length === 2, 'the sound to start again');
      assert(calls[0].stopped, 'the old sound kept playing');
      byText('.video-stage button', /Parar/).click();
      await waitFor(() => calls[1].stopped, 'the sound to stop after «Parar»', 3000);
    } finally {
      RS.sound.preview = real;
    }
  });

  test('video: dragging the highlight colour redraws the gallery once, after the drag', async () => {
    const real = RS.motion.prepare;
    let lite = 0;
    RS.motion.prepare = (p, o) => { if (o && o.lite) lite++; return real(p, o); };
    try {
      await vtab('Aspeto');
      const picker = await waitFor(() => $('.video-panel input[type="color"]'), 'the colour picker');
      for (let i = 0; i < 10; i++) {
        picker.value = `#${(0x20a0f0 + i * 0x0a0a00).toString(16).slice(-6)}`;
        picker.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(20); // a drag: one colour every 20 ms
      }
      // the gallery lives in «Modelo»: it follows the colour when it is shown again
      await sleep(600);
      assertEqual(lite, 0);
      await vtab('Modelo');
      await waitFor(() => lite > 0, 'the gallery to follow');
      await sleep(600); // longer than the gallery's settle time: no more redraws come
      const cards = RS.motion.STYLES.filter((s) => !s.test).length;
      assert(lite <= cards, `${lite} gallery redraws for one drag (${cards} cards)`);
    } finally {
      RS.motion.prepare = real;
    }
  });

  test('video: the panel speaks Portuguese', async () => {
    let txt = $('.video-panel .video-tabs').textContent;
    for (const tab of ['Modelo', 'Textos', 'Aspeto', 'Som e fim']) txt += ` ${(await vtab(tab)).textContent}`;
    for (const w of ['Style', 'Recipe', 'Duration', 'Sound', 'Colors', 'Colours', 'Font', 'Background', 'Photos', 'Listen', 'Music', 'Texts', 'Reset', 'Auto', 'Highlights', 'Benefits']) {
      assert(!new RegExp(`\\b${w}\\b`).test(txt), `English word «${w}»`);
    }
    for (const w of ['Receitas', 'Estilos', 'Duração', 'Automática', 'Língua', 'Título', 'Vantagens', 'Destaques', 'Vagas', 'Contactos', 'Botão e dica',
      'Frase final', 'Nome da empresa', 'Repor tudo da imagem', 'Cores', 'Letra', 'Fotografias', 'Contacto no fim', 'Som']) {
      assert(txt.includes(w), `missing «${w}»`);
    }
  });

  test('video: the tabs work at 390 px (scrollable row, no overlap)', async () => {
    const panel = $('.video-panel');
    const old = panel.getAttribute('style');
    panel.style.width = '358px'; // a 390 px phone less its 16 px gutters
    try {
      await settle();
      const row = $('.video-panel .video-tabs');
      const ox = getComputedStyle(row).overflowX;
      assert(ox === 'auto' || ox === 'scroll', `the tabs row does not scroll (${ox})`);
      assert(row.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 0.5, 'the tabs leave the panel');
      const tabs = $$('.video-panel .video-tabs [role="tab"]').map((t) => t.getBoundingClientRect());
      for (let i = 1; i < tabs.length; i++) assert(tabs[i].left >= tabs[i - 1].right - 0.5, `tab ${i + 1} overlaps tab ${i}`);
      assert(tabs.every((r) => r.height >= 40), 'a tab is too small to touch');
      assert(document.documentElement.scrollWidth <= window.innerWidth, 'the page scrolls sideways');
    } finally {
      if (old === null) panel.removeAttribute('style'); else panel.setAttribute('style', old);
    }
  });

  test('video: «Exportar» opens the dialog on «Vídeo», without style, colours or sound', async () => {
    await exportDialog();
    assert(pressed(/Vídeo/), 'not on «Vídeo»');
    assert(!$('.modal.export .motion-picker'), 'the style gallery is still there');
    const legends = $$('.modal.export legend').map((l) => l.textContent.trim());
    for (const w of ['Estilo', 'Duração', 'Cores', 'Som']) assert(!legends.includes(w), `«${w}» is still in the dialog`);
    byText('.modal.export button', /Mudar o vídeo/).click();
    await waitFor(() => !$('.modal.export') && $('.video-panel'), 'back to «Vídeo»');
  });

  test('video: «Sem som» makes an MP4 without a sound track', async () => {
    await mode('Vídeo');
    await vtab('Som e fim');
    byText('.video-panel .seg button', /Sem som/).click();
    await ad((d) => d.video.sound === 'none');
    await exportDialog();
    files.length = 0;
    byText('.modal.export .export-actions button', /Criar vídeo/).click();
    await waitFor(() => files.length === 1, 'the video', 120000);
    assert(findBytes(await bytesOf(files[0].blob), 'soun') < 0, 'a sound track in «Sem som»');
  });

  test('video: «Um som meu» with a WAV makes an MP4 with a sound track', async () => {
    await mode('Vídeo');
    await vtab('Som e fim');
    const realPick = RS.util.pickFile;
    RS.util.pickFile = async () => new File([await toneWav(3, 44100, 330)], 'minha-musica.wav', { type: 'audio/wav' });
    try {
      byText('.video-panel .seg button', /Um som meu/).click();
      await waitFor(() => /minha-musica\.wav/.test($('.video-panel').textContent), 'the file name');
    } finally {
      RS.util.pickFile = realPick;
    }
    const v = (await ad((d) => d.video.sound === 'own' && d.video.ownSound)).video;
    assert(v.ownSound, 'no sound kept');
    await exportDialog();
    files.length = 0;
    byText('.modal.export .export-actions button', /Criar vídeo/).click();
    await waitFor(() => files.length === 1, 'the video', 120000);
    assert(findBytes(await bytesOf(files[0].blob), 'soun') > 0, 'no sound track');
  });

  test('video: a file that is not sound is refused and the app music comes back', async () => {
    await mode('Vídeo');
    await vtab('Som e fim');
    const realPick = RS.util.pickFile;
    RS.util.pickFile = async () => new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'estragado.mp3', { type: 'audio/mpeg' });
    try {
      byText('.video-panel .sound-file button', /Trocar/).click();
      await waitFor(() => byText('.toast', /Não foi possível ler este ficheiro de som/), 'the message');
    } finally {
      RS.util.pickFile = realPick;
    }
    const app = await waitFor(() => byText('.video-panel .seg button', /Música da app/), '«Música da app»');
    await waitFor(() => app.getAttribute('aria-checked') === 'true', '«Música da app» chosen again');
  });

  test('video: cancelling during the export saves nothing', async () => {
    await exportDialog();
    files.length = 0;
    byText('.modal.export .export-actions button', /Criar vídeo/).click();
    (await waitFor(() => byText('.modal.export button', /Cancelar/), '«Cancelar»')).click();
    await waitFor(() => !$('.modal.export .export-actions.is-busy'), 'the export to stop', 30000);
    await sleep(300); // nothing may arrive late
    assertEqual(files.length, 0);
  });

  test('video: «Sem som» stops «Ouvir» and choosing music again does not start it', async () => {
    await mode('Vídeo');
    await vtab('Som e fim');
    const real = RS.sound.preview;
    let calls = 0;
    RS.sound.preview = (src, at) => { calls++; return real(src, at); };
    try {
      byText('.video-stage button', /Ouvir/).click();
      await waitFor(() => calls === 1, 'the sound to start');
      byText('.video-panel .seg button', /Sem som/).click();
      await ad((d) => d.video.sound === 'none');
      byText('.video-panel .seg button', /Música da app/).click();
      await ad((d) => d.video.sound === 'generated');
      await sleep(600);
      assertEqual(calls, 1);
      assert(!$('.video-stage .ws-listen.on'), '«Ouvir» is still on');
    } finally {
      RS.sound.preview = real;
    }
  });

  test('video: opening «Exportar» stops «Ouvir»', async () => {
    await mode('Vídeo');
    const real = RS.sound.preview;
    const calls = [];
    RS.sound.preview = (src, at) => {
      const pv = real(src, at);
      const c = { stopped: false };
      calls.push(c);
      return { time: pv.time, stop() { c.stopped = true; pv.stop(); } };
    };
    try {
      byText('.video-stage button', /Ouvir/).click();
      await waitFor(() => calls.length === 1, 'the sound to start');
      byText('.topbar .btn', /^\s*Exportar\s*$/).click();
      await waitFor(() => $('.modal.export'), 'the export dialog');
      await waitFor(() => calls[0].stopped, 'the sound to stop', 3000);
    } finally {
      RS.sound.preview = real;
    }
    await closeDialog();
  });

  test('video: typing the ad\'s name does not prepare the video again', async () => {
    await mode('Vídeo');
    const input = $('.name-input');
    const typeName = async (value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await sleep(40); };
    const real = RS.motion.prepare;
    let n = 0;
    RS.motion.prepare = (p, o) => { if (!(o && o.lite)) n++; return real(p, o); };
    try {
      for (const s of ['Anúncio antigo t', 'Anúncio antigo te', 'Anúncio antigo tes', 'Anúncio antigo test']) await typeName(s);
      await sleep(500);
      assertEqual(n, 0);
    } finally {
      RS.motion.prepare = real;
      await typeName('Anúncio antigo');
      await ad((d) => d.name === 'Anúncio antigo');
    }
  });

  test('video: «Exportar» from «Imagem» opens on «Imagem»', async () => {
    await mode('Imagem');
    await exportDialog();
    assert(pressed(/Imagem/), 'not on «Imagem»');
    await closeDialog();
  });

  test('editor: «Ver animação» is gone', async () => {
    assert(!$('.ws-play'), 'the «Ver animação» button is still there');
    assert(!/Ver animação/.test($('.editor').textContent), '«Ver animação» is still written');
    RS.util.saveBlob = realSave;
  });
})();
