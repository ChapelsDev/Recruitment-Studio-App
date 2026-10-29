// Interface: the editor's «Vídeo» piece (since 2026-10-27 its sections are the
// rail's: «Estilo» = recipes, styles and the look; «Sequência» = the length,
// «Textos do vídeo» per language, sound and end; «Fotos» = the photos), the
// moving stage with «Ouvir» and the trimmed export dialog.
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
    const b = byText('.topbar [aria-label="Peça"] [role="radio"]', new RegExp(name));
    if (b.getAttribute('aria-checked') !== 'true') b.click();
    return waitFor(() => (name === 'Vídeo' ? $('.video-stage') : $('.workspace canvas.poster')), `the ${name} piece`);
  }
  // A section of the rail on «Vídeo»: «Estilo», «Sequência», «Fotos».
  const SECTION = { Estilo: 'estilo', 'Sequência': 'sequencia', Fotos: 'fotos' };
  async function vtab(name) {
    const b = await waitFor(() => byText('.editor .rail [role="tab"]', new RegExp(`^\\s*${name}\\s*$`)), `the ${name} section`);
    if (b.getAttribute('aria-selected') !== 'true') b.click();
    return waitFor(() => $(`.video-panel .video-section[data-section="${SECTION[name]}"]`), `the ${name} section open`);
  }
  const prep = (p, locale) => RS.motion.prepare(p, { format: 'story', locale, images: {}, photos: { hero: null, cards: [] } });
  async function exportDialog() {
    await closeDialog();
    byText('.topbar .btn', /^\s*Exportar\s*$/).click();
    return waitFor(() => $('.modal.export'), 'the export dialog');
  }
  // the dialog exports the piece on screen: its title says which (2026-10-27)
  const pressed = (re) => new RegExp(re.source, 'i').test($('#exp-title').textContent);
  const files = [];
  const realSave = RS.util.saveBlob;

  test('video: «Vídeo» shows the panel and the moving stage', async () => {
    RS.util.saveBlob = async (blob, name) => { files.push({ blob, name }); return true; };
    await mode('Vídeo');
    await vtab('Estilo');
    assertEqual($$('.video-panel .motion-card').length, RS.motion.STYLES.filter((s) => !s.test).length);
    // the two galleries open «Estilo»; «Sequência» opens with «Duração»
    assertEqual($$('.video-panel .group h3').map((h) => h.textContent.trim()).slice(0, 2), ['Receitas', 'Estilos']);
    await vtab('Sequência');
    assertEqual($$('.video-panel .group h3')[0].textContent.trim(), 'Duração');
    await vtab('Estilo');
    const c = await waitFor(() => $('.video-stage canvas[data-motion]'), 'the stage playing');
    const a = c.toDataURL();
    await sleep(400);
    assert(c.toDataURL() !== a, 'the stage does not move');
  });

  test('video: no inner tabs; the rail keeps the open section across pieces', async () => {
    assert(!$('.video-panel [role="tablist"]'), 'the video panel still has its own tabs');
    const end = await vtab('Sequência');
    assert(/Som/.test(end.textContent), 'no sound in «Sequência»');
    await mode('Imagem');
    // «Imagem» has no «Sequência»: its first section opens
    await waitFor(() => byText('.editor .rail [role="tab"]', /^\s*Oferta\s*$/).getAttribute('aria-selected') === 'true', '«Oferta» on «Imagem»');
    await mode('Vídeo');
    await vtab('Estilo');
    await mode('Imagem');
    await mode('Vídeo');
    await waitFor(() => $('.video-panel .video-section[data-section="estilo"]'), '«Estilo» kept');
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
    // the section opened again (Tijolo was picked with it open: that folded nothing)
    await vtab('Sequência');
    await vtab('Estilo');
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
    // the next time the section opens, the gallery holding the model opens and the other («Receitas», never folded by hand) names it
    await vtab('Sequência');
    await vtab('Estilo');
    await waitFor(() => state(gallery('Estilos')) === 'true' && state(gallery('Receitas')) === 'false', 'Estilos open, Receitas folded');
    assert(/Néon/.test(summary(gallery('Receitas'))), `the folded «Receitas» says «${summary(gallery('Receitas'))}»`);
    await H.settleAnimations(); // the tab's panel has arrived before the tap
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

  test('video: «Vídeo» in the piece switch starts with the image\'s texts', async () => {
    await mode('Imagem');
    assert(!$('.workspace .ws-convert'), '«Converter em vídeo» is back');
    await mode('Vídeo');
    await vtab('Sequência');
    const d = await ad();
    const f = await waitFor(() => $('#vt-headline'), 'the title field');
    assertEqual(f.value, d.texts['pt-PT'].headline);
    assert(!d.video.texts['pt-PT'], 'the image texts were copied into the video');
  });

  test('video: a text changed in «Textos» is saved for that language only and reaches the stage', async () => {
    await vtab('Sequência');
    type($('#vt-headline'), 'Pintores, venham já');
    let d = await ad((x) => x.video.texts['pt-PT'] && x.video.texts['pt-PT'].headline === 'Pintores, venham já');
    assert(d.texts['pt-PT'].headline !== 'Pintores, venham já', 'the image title changed too');
    assertEqual(prep(d, 'pt-PT').content.headline, 'Pintores, venham já');
    // a second language has its own texts
    $('.stage-top .locales .chip.add').click();
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
    await vtab('Sequência');
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
    await vtab('Sequência');
    const reset = await waitFor(() => $('#vt-headline').closest('.vt-field').querySelector('.vt-reset'), '«Repor da imagem» on the edited title');
    assert(/Repor do anúncio/.test(reset.textContent), reset.textContent);
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
    await vtab('Sequência');
    const eyes = (on) => ['benefits', 'highlights', 'positions'].forEach((k) => {
      const eye = $(`#vt-block-${k} .group-head .eye`);
      if ((eye.getAttribute('aria-pressed') === 'true') !== on) eye.click();
    });
    eyes(false);
    const d = await ad((x) => x.video.show.benefits === false && x.video.show.highlights === false && x.video.show.positions === false);
    const L = RS.motion.lengths(d, { locale: 'pt-PT' });
    const lost = L.options.filter((o) => !o.ok);
    assert(lost.length > 0, `every length can be filled: up to ${L.max} s`);
    await vtab('Sequência');
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
    await vtab('Sequência');
    eyes(true);
    await ad((x) => x.video.show.benefits === true && x.video.show.highlights === true && x.video.show.positions === true);
  });

  test('video: «Automática» shows its length', async () => {
    await vtab('Sequência');
    byText('.video-panel .lengths button', /Automática/).click();
    const d = await ad((x) => x.video.duration === 'auto');
    const L = RS.motion.lengths(d, { locale: 'pt-PT' });
    await waitFor(() => new RegExp(`Automática\\s*·\\s*${L.auto}\\s*s`).test(byText('.video-panel .lengths button', /Automática/).textContent), `«Automática · ${L.auto} s»`);
    await waitFor(() => $('.video-stage .ws-notes').textContent.includes(`· ${L.auto} s ·`), 'the stage at that length');
    // another model keeps «Automática»
    await vtab('Estilo');
    byText('.video-panel .motion-card', /Partidas/).click();
    await ad((x) => x.video.motion === 'partidas' && x.video.duration === 'auto');
    byText('.video-panel .motion-card', /Tijolo/).click();
    await ad((x) => x.video.motion === 'tijolo' && x.video.duration === 'auto');
  });

  test('video: «Contacto no fim» 4 s is saved', async () => {
    await vtab('Sequência');
    byText('.video-panel .seg button', /^\s*4 s\s*$/).click();
    await ad((d) => d.video.hold === 4);
  });

  test('video: «Cartaz animado» says its texts come from the image', async () => {
    await vtab('Estilo');
    byText('.video-panel .motion-card', /Cartaz animado/).click();
    await ad((d) => d.video.motion === 'poster');
    const panel = await vtab('Sequência');
    await waitFor(() => /O Cartaz animado mostra a imagem tal como está: mude os textos na imagem/.test(panel.textContent), 'the note');
    assert(!$('#vt-headline'), 'the video texts are offered for «Cartaz animado»');
  });

  test('video: the panel shows only what acts on the chosen recipe or style', async () => {
    const groups = async (tab) => { await vtab(tab); await settle(); return $$('.video-panel .group h3').map((h) => h.textContent.trim()); };
    const look = async () => (await groups('Estilo')).filter((g) => g !== 'Receitas' && g !== 'Estilos');
    // «Cartaz animado», chosen above: «Fotos» says it uses the image's photo
    assertEqual(await groups('Fotos'), []);
    assert(/O Cartaz animado usa a fotografia da imagem/.test($('.video-panel').textContent), '«Fotos» of «Cartaz animado» says nothing');
    assertEqual(await look(), ['Animação']);
    assert(!(await groups('Sequência')).includes('Contacto no fim'), '«Cartaz animado» offers «Contacto no fim»');
    await vtab('Estilo');
    byText('.video-panel .motion-card', /Tijolo/).click();
    await ad((d) => d.video.motion === 'tijolo');
    assertEqual(await groups('Fotos'), []);
    assert(/Este estilo não usa fotografias/.test($('.video-panel').textContent), 'Tijolo uses no photos but «Fotos» does not say so');
    assert((await groups('Sequência')).includes('Contacto no fim'), 'Tijolo without «Contacto no fim»');
    await vtab('Estilo');
    byText('.video-panel .motion-card', /Colagem/).click();
    await ad((d) => d.video.motion === 'colagem');
    // «Fotos» holds the photos; «Estilo» the galleries and the look; «Sequência» opens with «Duração»
    await waitFor(async () => JSON.stringify(await groups('Fotos')) === JSON.stringify(['Fotografias']), 'Colagem with «Fotografias» in «Fotos»');
    assertEqual(await look(), ['Cores', 'Letra']);
    assertEqual((await groups('Sequência'))[0], 'Duração');
    await vtab('Estilo');
  });

  test('video: «Escolher» photos keeps the picked ids', async () => {
    await vtab('Fotos');
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
      await vtab('Sequência');
      (await waitFor(() => byText('.video-stage button', /Ouvir/), '«Ouvir» on the stage')).click();
      await waitFor(() => calls.length === 1, 'the sound to start');
      (await waitFor(() => byText('.video-panel .lengths button', /^\s*6 s\s*$/), 'the 6 s length')).click();
      await waitFor(() => calls.length === 2, 'the sound to start again');
      assert(calls[0].stopped, 'the old sound kept playing');
      // «Ouvir» starts at the playhead: past the new 6 s end, the sound ends by itself
      const stop = byText('.video-stage button', /Parar/);
      if (stop) stop.click();
      await waitFor(() => calls[1].stopped, 'the sound to stop after «Parar» (or at the end)', 3000);
    } finally {
      RS.sound.preview = real;
    }
  });

  test('video: dragging the highlight colour redraws the gallery once, after the drag', async () => {
    const real = RS.motion.prepare;
    let lite = 0;
    RS.motion.prepare = (p, o) => { if (o && o.lite) lite++; return real(p, o); };
    try {
      await vtab('Estilo');
      const picker = await waitFor(() => $('.video-panel input[type="color"]'), 'the colour picker');
      // the gallery drawn for the section's opening: wait until no card is being prepared
      await waitFor(async () => { const n = lite; await sleep(500); return n === lite; }, 'the gallery to finish drawing', 20000);
      lite = 0;
      for (let i = 0; i < 10; i++) {
        picker.value = `#${(0x20a0f0 + i * 0x0a0a00).toString(16).slice(-6)}`;
        picker.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(20); // a drag: one colour every 20 ms
      }
      // the gallery above the colours follows only once the drag has settled
      assertEqual(lite, 0);
      await waitFor(() => lite > 0, 'the gallery to follow');
      await sleep(600); // longer than the gallery's settle time: no more redraws come
      const cards = RS.motion.STYLES.filter((s) => !s.test).length;
      assert(lite <= cards, `${lite} gallery redraws for one drag (${cards} cards)`);
    } finally {
      RS.motion.prepare = real;
    }
  });

  test('video: the panel speaks Portuguese', async () => {
    let txt = $('.editor .rail').textContent;
    for (const tab of ['Estilo', 'Sequência', 'Fotos']) txt += ` ${(await vtab(tab)).closest('.panel').textContent}`;
    for (const w of ['Style', 'Recipe', 'Duration', 'Sound', 'Colors', 'Colours', 'Font', 'Background', 'Photos', 'Listen', 'Music', 'Texts', 'Reset', 'Auto', 'Highlights', 'Benefits']) {
      assert(!new RegExp(`\\b${w}\\b`).test(txt), `English word «${w}»`);
    }
    for (const w of ['Receitas', 'Estilos', 'Duração', 'Automática', 'Língua', 'Título', 'Vantagens', 'Destaques', 'Vagas', 'Contactos', 'Botão e dica',
      'Frase final', 'Nome da empresa', 'Repor tudo do anúncio', 'Cores', 'Letra', 'Fotografias', 'Contacto no fim', 'Som']) {
      assert(txt.includes(w), `missing «${w}»`);
    }
  });

  test('video: «Exportar» opens the dialog on «Vídeo», without style, colours or sound', async () => {
    await exportDialog();
    assert(pressed(/Vídeo/), 'not on «Vídeo»');
    assert(!$('.modal.export .motion-picker'), 'the style gallery is still there');
    const legends = $$('.modal.export legend').map((l) => l.textContent.trim());
    for (const w of ['Estilo', 'Duração', 'Cores', 'Som']) assert(!legends.includes(w), `«${w}» is still in the dialog`);
    byText('.modal.export button', /Mudar o vídeo/).click();
    await waitFor(() => !$('.modal.export') && $('.video-stage'), 'back to «Vídeo»');
  });

  test('video: «Sem som» makes an MP4 without a sound track', async () => {
    await mode('Vídeo');
    await vtab('Sequência');
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
    await vtab('Sequência');
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
    await vtab('Sequência');
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
    await vtab('Sequência');
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
