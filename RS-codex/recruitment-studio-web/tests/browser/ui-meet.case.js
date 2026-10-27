// Interface: «Mostrar QR» (face to face) and «Copiar link do WhatsApp».
// Runs after ui-contact.case.js in the same app session: the brand has the
// number 912345678 and the editor shows «Anúncio antigo» (no number).
(() => {
  const { $, byText, idle, waitFor, settle, type, saved } = window.H;
  const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  async function openOldAd() {
    await waitFor(() => $('.home') && idle() && $('.proj-open[aria-label="Abrir Anúncio antigo"]'), 'home with the old ad');
    $('.proj-open[aria-label="Abrir Anúncio antigo"]').click();
    await waitFor(() => $('.editor') && idle(), 'editor of the old ad');
  }
  async function openExport() {
    byText('.topbar .btn', /^\s*Exportar\s*$/).click();
    return waitFor(() => $('.modal.export'), 'export dialog');
  }

  test('home: «Mostrar QR» shows the brand number as a WhatsApp QR', async () => {
    $('.topbar .btn.ghost').click();
    await waitFor(() => $('.home') && idle(), 'home');
    byText('.home-top button', /Mostrar QR/).click();
    const qr = await waitFor(() => $('.meet .meet-qr'), 'the QR');
    assertEqual(qr.dataset.link, RS.contact.meetLink('351', '912345678', 'pt-PT'));
    assert(/Aponta a câmara/.test($('.meet').textContent), 'no «Aponta a câmara»');
  });

  test('home: the language chip changes the message; Escape closes', async () => {
    byText('.meet .tchip', /^\s*DE-CH\s*$/).click();
    await waitFor(() => $('.meet .meet-qr').dataset.link === RS.contact.meetLink('351', '912345678', 'de-CH'), 'the German message');
    assert(/Mit der Kamera scannen/.test($('.meet').textContent), 'hint not in German');
    key('Escape');
    await waitFor(() => !$('.meet'), 'the overlay to close', 3000);
  });

  test('export: without a number there is no «Copiar link do WhatsApp»', async () => {
    await openOldAd();
    await openExport();
    assert(!byText('.modal.export button', /Copiar link do WhatsApp/), 'button shown without a number');
    $('.modal.export .modal-head .icon-btn').click();
    await waitFor(() => !$('.modal.export'), 'export dialog to close', 3000);
  });

  test('editor: «Mostrar QR» without a number asks for it, then shows the QR', async () => {
    $('.topbar button[aria-label="Mostrar QR"]').click();
    const field = await waitFor(() => $('.meet #meet-number'), 'the number field');
    assert(!$('.meet .meet-qr'), 'QR shown without a number');
    type(field, '913000111');
    await settle();
    byText('.meet button', /^\s*Mostrar QR\s*$/).click();
    const qr = await waitFor(() => $('.meet .meet-qr'), 'the QR');
    assertEqual(qr.dataset.link, RS.contact.meetLink('351', '913000111', 'pt-PT'));
    const ad = await saved((d) => d.whatsapp && d.whatsapp.number === '913000111', 'Anúncio antigo');
    assertEqual(ad.whatsapp, { country: '351', number: '913000111' }, 'number not kept in the ad');
    $('.meet .meet-close').click();
    await waitFor(() => !$('.meet'), 'the overlay to close', 3000);
  });

  test('export: «Copiar link do WhatsApp» copies the ad link of the post language', async () => {
    let copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copied = t; } } });
    await openExport();
    (await waitFor(() => byText('.modal.export button', /Copiar link do WhatsApp/), 'the button')).click();
    await waitFor(() => copied, 'the copy');
    const ad = await saved(() => true, 'Anúncio antigo');
    assertEqual(copied, RS.contact.adLink(ad, 'pt-PT'));
  });
})();
