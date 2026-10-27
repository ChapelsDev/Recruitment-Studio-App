// Interface: «Salário e vagas (opcional)» in Texto keeps the offer in the ad.
// Runs after ui-meet.case.js (the editor of «Anúncio antigo» is open).
(() => {
  const { $, byText, waitFor, type, pick, saved } = window.H;

  test('offer: salary, period and vacancies are kept and reach the post text', async () => {
    if ($('.modal.export')) {
      $('.modal.export .modal-head .icon-btn').click();
      await waitFor(() => !$('.modal.export'), 'export dialog to close', 3000);
    }
    byText('.rail button', /^\s*Oferta\s*$/).click();
    type(await waitFor(() => $('#f-offer-salary'), 'salary field'), '1900');
    pick($('#f-offer-currency'), '€');
    pick($('#f-offer-period'), 'week');
    type($('#f-offer-vacancies'), '30');
    const ad = await saved((d) => d.offer.vacancies === '30' && d.offer.period === 'week', 'Anúncio antigo');
    // 2026-10-27: a new ad shows its offer sheet on the image too
    assertEqual(ad.offer, { salary: '1900', currency: '€', period: 'week', vacancies: '30', location: '', startDate: '', visibility: { image: true, video: true, carousel: true, caption: true } });
    assert(RS.model.caption(ad, 'pt-PT').includes('1900 € por semana · 30 vagas'), 'offer not in the post text');
  });
})();
