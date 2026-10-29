// Interface: a number typed in «Mostrar QR» on the home screen (no brand yet)
// is kept as the brand's number and reaches new ads, without blanking the
// template's company name and tagline. Runs first, on an empty profile.
(() => {
  const { $, $$, byText, idle, waitFor, settle, type, saved } = window.H;

  test('home «Mostrar QR» keeps the number; new ads get it and keep the company name', async () => {
    await waitFor(() => $('.home') && idle() && $('.new-ad'), 'home');
    byText('.home-top button', /Mostrar QR/).click();
    type(await waitFor(() => $('.meet #meet-number'), 'the number field'), '914000222');
    await settle();
    byText('.meet button', /^\s*Mostrar QR\s*$/).click();
    await waitFor(() => $('.meet .meet-qr'), 'the QR');
    $('.meet .meet-close').click();
    await waitFor(() => !$('.meet'), 'the overlay to close', 3000);
    const brand = await waitFor(async () => RS.store.getMeta('brand'), 'the brand');
    assertEqual(brand.whatsapp, { country: '351', number: '914000222' });
    $('.new-ad').click();
    await waitFor(() => $$('.tpl-card').length && idle(), 'gallery');
    $$('.tpl-card')[0].click();
    await waitFor(() => $('.editor') && idle(), 'editor');
    const p = await saved();
    assertEqual(p.whatsapp, { country: '351', number: '914000222' }, 'number not in the new ad');
    assertEqual(p.brand.name, 'A sua empresa', 'company name blanked');
    $('.topbar .btn.ghost').click();
    await waitFor(() => $('.home') && idle(), 'home again');
  });
})();
