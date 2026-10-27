// Interface details: the WhatsApp contact hint, the brand number, aborted
// screen transitions, what a short video leaves out, durations between styles,
// the chosen highlight colour, a sound that is gone.
// Runs after ui-video.case.js: the editor of «Anúncio antigo» is open (in
// «Imagem») and its WhatsApp number is 913000111.
(() => {
  const { sleep, $, $$, byText, idle, waitFor, settle, type, saved, toneWav } = window.H;
  const ad = (check) => saved(check, 'Anúncio antigo');
  const tab = async (label) => {
    byText('.rail button', new RegExp(label)).click();
    await waitFor(() => $(`.panel[aria-label="${label}"]`), `the ${label} panel`);
  };
  async function openVideo() {
    await waitFor(() => !$('.modal-back.closing'), 'the dialog to finish closing', 3000);
    if ($('.modal.export')) await closeDialog();
    const b = byText('.topbar [aria-label="Peça"] [role="radio"]', /Vídeo/);
    if (b.getAttribute('aria-checked') !== 'true') b.click();
    await waitFor(() => $('.video-stage'), 'the video stage');
    return vtab('Estilo');
  }
  // A section of the rail on «Vídeo» (2026-10-27): «Estilo», «Sequência», «Fotos».
  const SECTION = { Estilo: 'estilo', 'Sequência': 'sequencia', Fotos: 'fotos' };
  async function vtab(name) {
    const b = byText('.editor .rail [role="tab"]', new RegExp(`^\\s*${name}\\s*$`));
    if (b.getAttribute('aria-selected') !== 'true') b.click();
    return waitFor(() => $(`.video-panel .video-section[data-section="${SECTION[name]}"]`), `the ${name} section`);
  }
  const pickStyle = async (name) => {
    await vtab('Estilo');
    byText('.video-panel .motion-card', new RegExp(name)).click();
    await waitFor(() => byText('.video-panel .motion-card.on', new RegExp(name)), `${name} chosen`);
  };
  async function closeDialog() {
    $('.modal.export .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal.export'), 'the dialog to close', 3000);
  }

  test('contacts: a contact with the WhatsApp number says it shows once, on the green button', async () => {
    await tab('Contactos');
    const field = await waitFor(() => $$('input[id^="f-contact-"]').find((el) => el.id !== 'f-contact-wa'), 'a contact field');
    type(field, '913 000 111');
    await waitFor(() => byText('.panel .field-hint', /mesmo número do WhatsApp/), 'the hint');
    type(field, 'emprego@exemplo.pt');
    await waitFor(() => !byText('.panel .field-hint', /mesmo número do WhatsApp/), 'the hint to go');
  });

  test('brand: an incomplete number does not replace the brand\'s number', async () => {
    type($('#f-contact-wa'), '12');
    await ad((d) => d.whatsapp && d.whatsapp.number === '12');
    await tab('Estilo');
    // Codex: brands live in «Marcas e modelos» (the catalog)
    const before = await RS.store.getCatalog();
    byText('.panel button', /Abrir biblioteca pessoal/).click();
    await waitFor(() => $('.library-save button:not(:disabled)'), 'library loaded');
    byText('.library-save button', /Guardar marca/).click();
    await waitFor(() => byText('.reuse-dialog [role="alert"]', /Complete ou retire/), 'incomplete number rejected');
    const after = await RS.store.getCatalog();
    assertEqual(after.brands.length, before.brands.length);
    assertEqual(RS.reuse.defaultBrand(after).whatsapp, { country: '351', number: '912345678' });
    $('.reuse-dialog .modal-head button').click();
    await waitFor(() => !$('.reuse-dialog'), 'library closed');
    await tab('Contactos');
    type($('#f-contact-wa'), '913000111');
    await ad((d) => d.whatsapp.number === '913000111');
  });

  test('navigation: a screen change the browser aborts is not an error', async () => {
    const real = document.startViewTransition;
    const errors = [];
    const onError = (e) => { errors.push(String(e.reason)); e.preventDefault(); };
    window.addEventListener('unhandledrejection', onError);
    document.startViewTransition = (cb) => {
      const aborted = () => Promise.reject(new DOMException('Transition was aborted because of invalid state', 'InvalidStateError'));
      const done = Promise.resolve().then(cb);
      return { updateCallbackDone: done.then(aborted), ready: aborted(), finished: aborted(), skipTransition() {} };
    };
    try {
      $('.topbar .btn.ghost').click();
      await waitFor(() => $('.home') && idle() && $('.proj-open[aria-label="Abrir Anúncio antigo"]'), 'home');
      $('.proj-open[aria-label="Abrir Anúncio antigo"]').click();
      await waitFor(() => $('.editor') && idle(), 'the editor again');
      await settle();
      assertEqual(errors, []);
    } finally {
      document.startViewTransition = real;
      window.removeEventListener('unhandledrejection', onError);
    }
  });

  test('video: the panel says what a short video leaves out', async () => {
    await openVideo();
    await pickStyle('Curto');
    await vtab('Sequência'); // the note sits with the length
    const note = await waitFor(() => byText('.video-panel .video-note', /fica(m)? de fora/), 'the note');
    assert(/vantage(m|ns)/.test(note.textContent), `no word about the benefits: ${note.textContent}`);
  });

  test('video: back from Curto, Néon gets its own length again', async () => {
    await pickStyle('Néon');
    const v = (await ad((d) => d.video.motion === 'neon')).video;
    assertEqual(v.duration, 15);
  });

  test('video: «Cor de destaque» shows the colour chosen, and says when it is adjusted', async () => {
    await pickStyle('Limpo');
    await ad((d) => d.video.motion === 'limpo');
    await vtab('Estilo');
    type($('#f-video-accent'), '#FFF200');
    await ad((d) => d.video.accent === '#FFF200');
    await waitFor(() => $('#f-video-accent').value.toUpperCase() === '#FFF200', 'the chosen colour in the field');
    await settle();
    assertEqual($('#f-video-accent').value.toUpperCase(), '#FFF200');
    assert(byText('.video-panel .field-hint', /para se ler bem/), 'no word about the adjustment');
  });

  test('video: the left-out note names the closing line and every block it leaves out', async () => {
    await pickStyle('Tijolo');
    await vtab('Sequência');
    byText('.video-panel .lengths button', /^\s*10 s\s*$/).click();
    await ad((d) => d.video.motion === 'tijolo' && d.video.duration === 10);
    await vtab('Sequência');
    type($('#vt-closing'), 'Começa já na segunda-feira');
    const d = await ad((x) => x.video.show.closing === true && x.video.texts['pt-PT'] && x.video.texts['pt-PT'].closing === 'Começa já na segunda-feira');
    const lost = RS.motion.leftOut(RS.motion.prepare(d, { format: 'story', locale: 'pt-PT', images: {}, photos: { hero: null, cards: [] } }));
    assert(lost.closing, `the closing line fits in 10 s: ${JSON.stringify(lost)}`);
    await vtab('Sequência');
    const t = (await waitFor(() => byText('.video-panel .video-note', /de fora/), 'the note')).textContent;
    assert(/a frase final/.test(t), t);
    if (lost.intro) assert(/a introdução/.test(t), t);
    if (lost.chat) assert(/a conversa no WhatsApp/.test(t), t);
    if (lost.highlights) assert(new RegExp(`${lost.highlights} destaques?`).test(t), t);
    if (lost.positions) assert(new RegExp(`${lost.positions} vagas? da lista`).test(t), t);
    assert(!/o salário e as vagas/.test(t), t);
  });

  test('video: «Textos» offers only the blocks a style shows', async () => {
    await pickStyle('Néon');
    await vtab('Sequência');
    for (const k of ['intro', 'closing', 'chat']) assert(!$(`#vt-block-${k}`), `«${k}» is offered for Néon`);
    const roles = $$('#vt-block-highlights .vt-origin').map((s) => s.textContent.trim());
    assert(roles.length && roles.every((r) => r === 'Salário' || r === 'Vagas'), roles.join(', '));
    assert(!$('#vt-block-highlights .vt-add'), 'Néon offers highlights of his own');
    assert(/mostra o salário e as vagas/.test($('#vt-block-highlights').textContent), 'no word on what the style shows');
    await pickStyle('Tijolo');
    await vtab('Sequência');
    for (const k of ['intro', 'closing', 'chat']) assert($(`#vt-block-${k}`), `«${k}» is missing for Tijolo`);
  });

  test('video: at 30 s, too much to show asks for fewer lines, not a longer video', async () => {
    await pickStyle('Tijolo');
    await vtab('Sequência');
    const addRows = async (kind, texts) => {
      for (const s of texts) {
        const rows = () => $$(`#vt-block-${kind} .vt-row`);
        const n = rows().length;
        $(`#vt-block-${kind} .vt-add`).click();
        const row = await waitFor(() => rows().length === n + 1 && rows()[n], `a new row in ${kind}`);
        type(row.querySelector('input'), s);
      }
    };
    await addRows('benefits', ['Seguro de saúde', 'Prémio de assiduidade', 'Refeições pagas', 'Formação paga', 'Fardamento', 'Horário fixo', 'Fins de semana livres', 'Carrinha da empresa']);
    await addRows('positions', ['Pintor de interiores', 'Pintor de fachadas', 'Estucador', 'Ajudante de pintor', 'Pintor industrial', 'Encarregado de pintura', 'Lixador', 'Aplicador de capoto']);
    await ad((x) => { const v = x.video.texts['pt-PT'] || {}; return v.benefits && v.benefits.added.length === 8 && v.positions && v.positions.added.length === 8; });
    await vtab('Sequência');
    byText('.video-panel .lengths button', /^\s*30 s\s*$/).click();
    await ad((x) => x.video.duration === 30);
    const note = await waitFor(() => byText('.video-panel .video-note', /de fora/), 'the note');
    assert(!/duração maior/.test(note.textContent), note.textContent);
    assert(/Tire algumas linhas dos textos/.test(note.textContent), note.textContent);
    // tidy up for the next cases
    await vtab('Sequência');
    $('.video-panel .vt-reset-all').click();
    await ad((x) => !x.video.texts['pt-PT']);
  });

  const eyes = async (on) => {
    await vtab('Sequência');
    for (const k of ['benefits', 'highlights', 'positions']) {
      const eye = $(`#vt-block-${k} .group-head .eye`);
      if ((eye.getAttribute('aria-pressed') === 'true') !== on) eye.click();
    }
    return ad((x) => ['benefits', 'highlights', 'positions'].every((k) => x.video.show[k] === on));
  };
  const prepOf = (d, locale = 'pt-PT') => RS.motion.prepare(d, { format: 'story', locale, images: {}, photos: { hero: null, cards: [] } });

  test('video: each section of the rail opens one panel named after it', async () => {
    await openVideo();
    for (const name of ['Oferta', 'Contactos', 'Fotos', 'Estilo', 'Sequência']) {
      byText('.editor .rail [role="tab"]', new RegExp(`^\\s*${name}\\s*$`)).click();
      await waitFor(() => $$('.editor .panel[role="tabpanel"]').length === 1 && $(`.editor .panel[aria-label="${name}"]`), `the ${name} panel`);
      assertEqual($$('.editor .rail [aria-selected="true"]').length, 1, 'two sections look chosen');
      assert($('.video-stage'), `«${name}» took the video off the stage`);
    }
  });

  test('video: a length the texts no longer fill says once how long the video is', async () => {
    await pickStyle('Tijolo');
    const L = RS.motion.lengths(await ad(), { locale: 'pt-PT' });
    const pick = L.options.filter((o) => o.value !== 'auto' && o.ok && o.value >= 20).pop();
    assert(pick, `no length of 20 s or more to pick: ${JSON.stringify(L.options)}`);
    await vtab('Sequência');
    byText('.video-panel .lengths button', new RegExp(`^\\s*${pick.value} s\\s*$`)).click();
    await ad((x) => x.video.duration === pick.value);
    const d = await eyes(false);
    assert(!RS.motion.lengths(d, { locale: 'pt-PT' }).options.find((o) => o.value === pick.value).ok, `${pick.value} s is still filled`);
    await vtab('Sequência');
    const n = prepOf(d).timeline.duration;
    const note = await waitFor(() => byText('.video-panel .video-note', /chega aos/), 'the note');
    assert(new RegExp(`Com estes textos o vídeo só chega aos ${n} s\\.`).test(note.textContent), note.textContent);
    assert(!/fica com/.test(note.textContent), note.textContent);
    await eyes(true);
  });

  test('video: a text left blank says so', async () => {
    await pickStyle('Partidas');
    await vtab('Sequência');
    type($('#vt-model-board'), '');
    const board = await waitFor(() => $('#vt-model-board').closest('.vt-field').querySelector('.vt-blank'), 'the note on the blank word');
    assert(/não mostra esta palavra/.test(board.textContent), board.textContent);
    type($('#vt-kicker'), '');
    await waitFor(() => $('#vt-kicker').closest('.vt-field').querySelector('.vt-blank'), 'the note on the blank kicker');
    $('.video-panel .vt-reset-all').click();
    await ad((x) => !x.video.texts['pt-PT']);
  });

  test('video: typing the ad\'s name with «Estilo» open does not redraw the gallery', async () => {
    await vtab('Estilo');
    // the gallery fills in card by card (one per task): wait until every card is drawn
    await waitFor(() => $$('.video-panel .motion-card').length && $$('.video-panel .motion-card').every((c) => c.querySelector('canvas')), 'the gallery filled in', 20000);
    await sleep(400);
    const input = $('.name-input');
    const real = RS.motion.prepare;
    let lite = 0;
    RS.motion.prepare = (p, o) => { if (o && o.lite) lite++; return real(p, o); };
    try {
      for (const s of ['Anúncio antigo x', 'Anúncio antigo xy']) { type(input, s); await sleep(450); }
      await sleep(400);
      assertEqual(lite, 0);
    } finally {
      RS.motion.prepare = real;
      type(input, 'Anúncio antigo');
      await ad((d) => d.name === 'Anúncio antigo');
    }
  });

  test('video: a style\'s lengths are measured with the photos the stage uses', async () => {
    const realL = RS.motion.lengths, realP = RS.motion.prepare;
    let lastO = null, lastP = null;
    RS.motion.lengths = (p, o) => { lastO = o; return realL(p, o); };
    RS.motion.prepare = (p, o) => { const P = realP(p, o); if (!(o && o.lite)) lastP = P; return P; };
    try {
      await pickStyle('Néon');
      await vtab('Sequência'); // the lengths are measured where they are shown
      await waitFor(() => lastO && lastP && lastP.style.id === 'neon' && lastO.photos === lastP.content.photos, 'the lengths measured with the stage\'s photos', 5000);
    } finally {
      RS.motion.lengths = realL;
      RS.motion.prepare = realP;
    }
  });

  test('video: a length another language cannot fill is named for that language', async () => {
    await pickStyle('Tijolo');
    await vtab('Sequência');
    byText('.video-panel .texts-locales button', /^\s*FR\s*$/).click();
    await ad((x) => x.locale === 'fr');
    for (const k of ['benefits', 'highlights', 'positions']) {
      const left = () => $$(`#vt-block-${k} .vt-row:not(.removed) .vt-remove`);
      for (let n = left().length; n > 0; n--) {
        left()[0].click();
        await waitFor(() => left().length < n, 'the row to be taken out');
      }
    }
    byText('.video-panel .texts-locales button', /^\s*PT\s*$/).click();
    const d = await ad((x) => x.locale === 'pt-PT' && x.video.texts.fr && x.video.texts.fr.benefits);
    const pt = RS.motion.lengths(d, { locale: 'pt-PT' }).options.filter((o) => o.value !== 'auto' && o.ok).pop();
    assert(pt.value > 10, `Portuguese fills only ${pt.value} s`);
    const fr = RS.motion.lengths(d, { locale: 'fr' }).options.find((o) => o.value === pt.value);
    assert(!fr.ok, `French still fills ${pt.value} s`);
    await vtab('Sequência');
    byText('.video-panel .lengths button', new RegExp(`^\\s*${pt.value} s\\s*$`)).click();
    await ad((x) => x.video.duration === pt.value);
    const note = await waitFor(() => $('.video-panel .length-other'), 'the note on French');
    assert(/FR/.test(note.textContent) && new RegExp(`${fr.missing} vantage`).test(note.textContent), note.textContent);
    // French follows its image again
    await vtab('Sequência');
    byText('.video-panel .texts-locales button', /^\s*FR\s*$/).click();
    await ad((x) => x.locale === 'fr');
    $('.video-panel .vt-reset-all').click();
    byText('.video-panel .texts-locales button', /^\s*PT\s*$/).click();
    await ad((x) => x.locale === 'pt-PT' && !x.video.texts.fr);
  });

  test('video: deleting on the image an item edited for the video leaves nothing to reset', async () => {
    await vtab('Sequência');
    type($('#vt-block-benefits .vt-row input'), 'Mudada só no vídeo');
    await ad((x) => x.video.texts['pt-PT'] && x.video.texts['pt-PT'].benefits);
    await waitFor(() => !$('.video-panel .vt-reset-all').disabled, '«Repor tudo da imagem» on');
    await tab('Oferta');
    $$('.panel button[aria-label^="Remover vantagem"]')[0].click();
    await ad((x) => !x.video.texts['pt-PT']);
    await openVideo();
    await vtab('Sequência');
    assert($('.video-panel .vt-reset-all').disabled, '«Repor tudo da imagem» is still on with nothing to reset');
  });

  test('export: a sound that is gone gives a clear message', async () => {
    const realPick = RS.util.pickFile;
    RS.util.pickFile = async () => new File([await toneWav(2)], 'vai-desaparecer.wav', { type: 'audio/wav' });
    try {
      await vtab('Sequência');
      byText('.video-panel .seg button', /Um som meu/).click(); // the sound chosen before comes back
      (await waitFor(() => byText('.video-panel .sound-file button', /Trocar/), '«Trocar»')).click();
      await waitFor(() => /vai-desaparecer\.wav/.test($('.video-panel').textContent), 'the file name');
    } finally {
      RS.util.pickFile = realPick;
    }
    const id = (await ad((d) => d.video.sound === 'own' && d.video.ownSound)).video.ownSound;
    await RS.store.putAsset({ id, blob: new Blob(['x']), kind: 'photo', type: 'image/png' }); // the sound is gone
    byText('.topbar .btn', /^\s*Exportar\s*$/).click();
    (await waitFor(() => byText('.modal.export .export-actions button', /Criar vídeo/), 'the export dialog')).click();
    const toast = await waitFor(() => byText('.toast', /som/), 'a message', 30000);
    assert(/Escolha-o de novo|Música da app/.test(toast.textContent), `not a clear message: ${toast.textContent}`);
    assert(!byText('.toast', /Não foi possível criar o vídeo/), 'the generic message');
    await closeDialog();
  });
})();
