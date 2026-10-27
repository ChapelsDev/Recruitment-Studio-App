// Interface: several trades, the WhatsApp number and message, QR mode, brand.
// The cases share one app session and run in order.
(() => {
  const { $, $$, byText, idle, waitFor, settle, type, saved } = window.H;
  const tab = async (label) => {
    byText('.rail button', new RegExp(label)).click();
    await waitFor(() => $(`.panel[aria-label="${label}"]`), `the ${label} panel`);
  };
  const GENERATED = 'Olá! Vi o anúncio para pedreiro e servente e tenho interesse.';

  test('gallery: choosing two trades creates an ad with both', async () => {
    (await waitFor(() => $('.new-card') && idle() && $('.new-card'), 'home')).click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
    byText('.gal-top .tchip', /Pedreiros e masseiros/).click();
    await settle();
    byText('.gal-top .tchip', /^\s*Serventes/).click();
    await waitFor(() => $$('.gal-top .tchip.on').length === 2, 'two trades chosen');
    $$('.tpl-card')[0].click();
    await waitFor(() => $('.editor') && idle(), 'editor');
    const p = await saved((d) => d.trades.length === 2);
    assertEqual(p.trades, ['pedreiro', 'servente']);
  });

  test('sections: the rail reads Texto, Contactos, Imagens, Aspeto, then Vídeo and Definições', async () => {
    assertEqual($$('.editor .rail button').map((b) => b.textContent.trim()), ['Texto', 'Contactos', 'Imagens', 'Aspeto', 'Vídeo', 'Definições']);
  });

  test('photos: «Deste anúncio» lists the photos of both trades', async () => {
    await tab('Imagens');
    const chip = await waitFor(() => byText('.library .tchip', /Deste anúncio/), '«Deste anúncio»');
    assertEqual(chip.getAttribute('aria-checked'), 'true');
    const expected = RS.PHOTO_LIBRARY.items.filter((i) => i.cat === 'pedreiro' || i.cat === 'servente').length;
    assertEqual($$('.library .lib-item').length, expected, 'photos listed');
  });

  const groupTitles = () => $$('.panel .group-toggle').map((t) => t.textContent.trim());
  test('contacts: «Contactos» holds the WhatsApp, the other contacts and the QR; «Texto» none of them', async () => {
    await tab('Texto');
    assert(!$('#f-contact-wa') && !$('.panel input[id^="f-contact-"]') && !$('.panel .qr-mode'), 'contacts are still in «Texto»');
    assertEqual(groupTitles(), ['Profissões do anúncio', 'Título', 'Vantagens', 'Vagas', 'Salário e vagas (opcional)', 'Selo']);
    await tab('Contactos');
    assertEqual($('.panel .panel-head h2').textContent.trim(), 'Contactos');
    assertEqual(groupTitles(), ['O seu WhatsApp', 'Outros contactos', 'Código QR']);
    const [wa, others, qr] = $$('.panel .group');
    for (const sel of ['#f-contact-wa', 'select[name="wa-country"]', 'label.switch input', '#f-wa-message', '#f-wa-reset']) assert(wa.querySelector(sel), `«O seu WhatsApp» has no ${sel}`);
    assert(others.querySelector('input[id^="f-contact-"]:not(#f-contact-wa)') && others.querySelector('.add-row'), '«Outros contactos» has no list');
    assert(qr.querySelector('.seg [role="radio"]') && qr.querySelector('.eye.mini'), '«Código QR» has no choice or no eye');
    // the eye of «Outros contactos» shows and hides the contacts on the poster
    const eye = () => $$('.panel .group')[1].querySelector('.group-head .eye');
    assert(eye(), '«Outros contactos» has no eye');
    eye().click();
    await saved((d) => d.show.contacts === false);
    eye().click();
    await saved((d) => d.show.contacts === true);
  });

  test('number: typing it in «Contactos» shows the WhatsApp pill on the poster', async () => {
    await tab('Contactos');
    type(await waitFor(() => $('#f-contact-wa'), 'number field'), '912345678');
    const p = await saved((d) => d.whatsapp && d.whatsapp.number === '912345678');
    assertEqual(p.whatsapp, { country: '351', number: '912345678' });
    const keys = RS.engine.renderToCanvas(p, { scale: 0.2, mode: 'editor' }).regions.map((r) => r.key);
    assert(keys.includes('contact:wa'), 'no pill');
  });

  test('poster: a tap on its WhatsApp button opens «Contactos» at the number', async () => {
    await tab('Texto');
    const p = await saved((d) => d.whatsapp && d.whatsapp.number === '912345678');
    const reg = RS.engine.renderToCanvas(p, { scale: 0.2, mode: 'editor' }).regions.find((r) => r.key === 'contact:wa');
    assert(reg, 'no pill');
    const canvas = await waitFor(() => $('.workspace canvas.poster'), 'the poster');
    const fmt = RS.model.FORMATS[p.format], r = canvas.getBoundingClientRect();
    const at = { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true,
      clientX: r.left + ((reg.x + reg.w / 2) / fmt.w) * r.width, clientY: r.top + ((reg.y + reg.h / 2) / fmt.h) * r.height };
    canvas.setPointerCapture = () => {}; // a made-up pointer cannot be captured
    try {
      canvas.dispatchEvent(new PointerEvent('pointerdown', at));
      canvas.dispatchEvent(new PointerEvent('pointerup', at));
    } finally { delete canvas.setPointerCapture; }
    await waitFor(() => $('.panel[aria-label="Contactos"]'), 'the Contactos panel');
    await waitFor(() => document.activeElement && document.activeElement.id === 'f-contact-wa', 'the number in focus', 3000);
  });

  test('message: editing it changes the WhatsApp link', async () => {
    type($('#f-wa-message'), 'Olá, quero trabalhar!');
    const p = await saved((d) => d.texts['pt-PT'].waMessage === 'Olá, quero trabalhar!');
    assert(RS.contact.adLink(p, 'pt-PT').includes(encodeURIComponent('Olá, quero trabalhar!')), 'link without the edited message');
  });

  test('message: «Repor» brings back the generated text', async () => {
    $('#f-wa-reset').click();
    const p = await saved((d) => d.texts['pt-PT'].waMessage === '');
    assertEqual(p.texts['pt-PT'].waMessage, '');
    await waitFor(() => $('#f-wa-message').value === GENERATED, 'the generated text in the field');
  });

  test('message: clearing it leaves the field empty while writing', async () => {
    const field = () => $('#f-wa-message');
    field().focus();
    type(field(), '');
    await settle();
    assertEqual(field().value, '', 'the generated text came back while writing');
    type(field(), 'O');
    await settle();
    type(field(), '');
    await settle();
    assertEqual(field().value, '', 'the generated text came back after a backspace');
    field().blur();
    await settle();
    assertEqual(field().value, GENERATED, 'an empty field shows the generated text once left');
    const p = await saved((d) => d.texts['pt-PT'].waMessage === '');
    assertEqual(p.texts['pt-PT'].waMessage, '');
  });

  test('brand: saving keeps the number and the default message for new ads', async () => {
    await tab('Aspeto');
    byText('.panel button', /Abrir biblioteca pessoal/).click();
    type(await waitFor(() => $('#f-brand-wa-template'), 'default message field'), 'Olá! Interessa-me a vaga de {profissões}.');
    await settle(); // a person's click is a later task: the panel has re-rendered by then
    byText('.library-save button', /Guardar marca/).click();
    await waitFor(() => $('.library-notice'), 'saved brand');
    const created = $$('.library-card').find((c) => c.textContent.includes('Usar por omissão'));
    if (created) [...created.querySelectorAll('button')].find((b) => b.textContent.includes('Usar por omissão')).click();
    const brand = await waitFor(async () => {
      const b = await RS.store.getMeta('brand');
      return b && b.waTemplates && b.waTemplates['pt-PT'] ? b : null;
    }, 'the brand to be saved');
    assertEqual(brand.whatsapp, { country: '351', number: '912345678' });
    assertEqual(brand.waTemplates['pt-PT'], 'Olá! Interessa-me a vaga de {profissões}.');
    $('.reuse-dialog .modal-head button').click();
    await waitFor(() => !$('.reuse-dialog'), 'library closed');
  });

  test('aspeto: «Modelo» comes first, folded, naming the template, and a template chosen there applies', async () => {
    await tab('Aspeto');
    assertEqual($('.panel .panel-head h2').textContent.trim(), 'Aspeto');
    assertEqual(groupTitles(), ['Modelo', 'Cores da marca', 'Letra', 'Tamanhos', 'Marcas e modelos pessoais']);
    const g = $('.panel .group'), toggle = g.querySelector('.group-toggle');
    assertEqual(toggle.getAttribute('aria-expanded'), 'false', '«Modelo» starts open');
    const before = await saved();
    assertEqual(g.querySelector('.group-summary') && g.querySelector('.group-summary').textContent.trim(), RS.templates.get(before.template).name);
    toggle.click();
    const minis = await waitFor(() => $$('.panel .tpl-mini').length === RS.templates.list.length && $$('.panel .tpl-mini'), 'the templates');
    await waitFor(() => minis.every((b) => b.querySelector('canvas.poster-thumb')), 'the thumbnails once the block is open');
    const i = minis.findIndex((b) => b.getAttribute('aria-pressed') !== 'true');
    const tpl = RS.templates.list[i];
    assertEqual(minis[i].querySelector(':scope > span').textContent.trim(), tpl.name);
    minis[i].click();
    await saved((d) => d.template === tpl.id);
    toggle.click();
    await waitFor(() => g.querySelector('.group-summary') && g.querySelector('.group-summary').textContent.trim() === tpl.name, 'the summary to name the new template');
  });

  test('old ad with a QR link opens in «Link» mode', async () => {
    const raw = RS.model.newProject(RS.templates.get('faixa'), { trade: 'pintor' });
    delete raw.trades; delete raw.qrMode; delete raw.whatsapp; delete raw.waTemplates;
    raw.texts['pt-PT'].qr = 'https://exemplo.pt/vagas';
    delete raw.texts['pt-PT'].waMessage;
    raw.name = 'Anúncio antigo';
    await RS.store.putProject(raw);
    $('.topbar .btn.ghost').click();
    await waitFor(() => $('.home') && idle() && $('.proj-open[aria-label="Abrir Anúncio antigo"]'), 'home with the old ad');
    $('.proj-open[aria-label="Abrir Anúncio antigo"]').click();
    await waitFor(() => $('.editor') && idle(), 'editor of the old ad');
    await tab('Contactos');
    const link = await waitFor(() => byText('.panel .seg button', /^\s*Link\s*$/), '«Link» button');
    assertEqual(link.getAttribute('aria-checked'), 'true');
    assertEqual($('#f-qr').value, 'https://exemplo.pt/vagas');
  });
})();
