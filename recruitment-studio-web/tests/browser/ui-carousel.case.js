// Interface: the «Carrossel» piece (2026-10-27), drawn for real.
(() => {
  const { $, $$, byText, waitFor, idle } = window.H;
  const tap = async (fn, what) => (await waitFor(fn, what, 6000)).click();
  const piece = (name) => () => byText('.topbar [aria-label="Peça"] [role="radio"]', new RegExp(`^\\s*${name}\\s*$`));
  const chip = (label) => () => byText('.carousel-stage .cs-formats [role="radio"]', new RegExp(`^\\s*${label}\\s*$`));
  const main = () => $('.carousel-stage .cs-main');
  const painted = (c) => {
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 29) if (d[i + 3] > 0 && (d[i] + d[i + 1] + d[i + 2]) > 30) n++;
    return n;
  };

  test('carousel: «Carrossel» draws the first slide; › and the dots move; «3:4» changes the format', async () => {
    await waitFor(() => ($('.home') || $('.editor') || $('.gallery')) && idle(), 'the app', 20000);
    await H.goHome();
    // an ad of its own (this case may run alone): «Novo anúncio», the first template
    await tap(() => $('.new-ad') && idle() && $('.new-ad'), '«Novo anúncio» on the home');
    await tap(() => idle() && $$('.tpl-card')[0], 'the first template');
    await waitFor(() => $('.editor') && idle(), 'the editor');
    await tap(piece('Carrossel'), 'the «Carrossel» piece');
    const first = await waitFor(() => { const c = main(); return c && c.width > 50 && c.dataset.index === '0' && c; }, 'the first slide', 6000);
    assert(painted(first) > 20, 'the first slide is empty');
    await tap(() => $('.carousel-stage [aria-label="Diapositivo seguinte"]'), 'the › button');
    await waitFor(() => main().dataset.index === '1', 'the second slide');
    assertEqual($$('.carousel-stage .cs-dot')[1].getAttribute('aria-current'), 'true');
    await tap(chip('3:4'), 'the 3:4 chip');
    await waitFor(() => { const c = main(); return c && Math.abs(c.width / c.height - 1080 / 1440) < 0.02; }, 'a 3:4 slide', 6000);
    await tap(chip('4:5'), 'the 4:5 chip');
    await waitFor(() => { const c = main(); return c && Math.abs(c.width / c.height - 1080 / 1350) < 0.02; }, 'back to 4:5', 6000);
    await tap(piece('Imagem'), 'the «Imagem» piece');
    await waitFor(() => $('.workspace canvas.poster'), 'the poster again');
  });

  test('carousel: a tap on the cover headline opens «Sequência» at the carousel headline; two quick style changes end on the last', async () => {
    await waitFor(() => $('.editor') && idle(), 'the editor');
    await tap(piece('Carrossel'), 'the «Carrossel» piece');
    // the cover in a style's own drawing (not the poster), on its first slide
    await tap(() => byText('.rail [role="tab"]', /^\s*Estilo\s*$/), 'the Estilo tab');
    await tap(() => $('.cstyle-card[data-style="apresentacao"]'), 'the Apresentação card');
    const c = await waitFor(() => { const m = main(); return m && m.dataset.style === 'apresentacao' && m.dataset.index === '0' && m; }, 'Apresentação on the stage', 8000);
    const saved = await H.saved((d) => d.carousel && d.carousel.style === 'apresentacao');
    const P = RS.slides.prepare(RS.model.normalize(saved), { format: 'portrait', locale: 'pt-PT', images: {}, photos: { hero: null, cards: [], full: [] } });
    const boxes = [];
    RS.slides.render(document.createElement('canvas').getContext('2d'), P, 0, { scale: 1, boxes });
    const head = boxes.find((b) => RS.slides.hit(P, 0, b.x + b.w / 2, b.y + b.h / 2) === 'headline');
    assert(head, 'no headline on the cover');
    const r = c.getBoundingClientRect();
    const at = { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: r.left + ((head.x + head.w / 2) / P.fmt.w) * r.width, clientY: r.top + ((head.y + head.h / 2) / P.fmt.h) * r.height };
    c.dispatchEvent(new PointerEvent('pointerdown', at)); c.dispatchEvent(new PointerEvent('pointerup', at));
    await waitFor(() => document.activeElement && document.activeElement.id === 'vt-headline' && document.activeElement.closest('.cseq-panel'), 'the carousel headline field in focus', 5000);
    // two quick style changes: the stage ends on the last one
    await tap(() => byText('.rail [role="tab"]', /^\s*Estilo\s*$/), 'the Estilo tab again');
    (await waitFor(() => $('.cstyle-card[data-style="numeros"]'), 'Números')).click();
    (await waitFor(() => $('.cstyle-card[data-style="contrato"]'), 'Contrato')).click();
    await waitFor(() => main() && main().dataset.style === 'contrato' && $('.carousel-stage').dataset.style === 'contrato', 'the stage on Contrato', 8000);
  });

  test('carousel: a tap on a benefit or a position opens «Sequência» with that row\'s field in focus', async () => {
    await waitFor(() => $('.editor') && idle(), 'the editor');
    await tap(piece('Carrossel'), 'the «Carrossel» piece');
    await tap(() => byText('.rail [role="tab"]', /^\s*Estilo\s*$/), 'the Estilo tab');
    await tap(() => $('.cstyle-card[data-style="apresentacao"]'), 'the Apresentação card');
    const saved = await H.saved((d) => d.carousel && d.carousel.style === 'apresentacao');
    const P = RS.slides.prepare(RS.model.normalize(saved), { format: 'portrait', locale: 'pt-PT', images: {}, photos: { hero: null, cards: [], full: [] } });
    for (const [kind, list] of [['benefit', 'benefits'], ['position', 'positions']]) {
      let found = null;
      for (let j = 0; j < P.slides.length && !found; j++) {
        const boxes = [];
        RS.slides.render(document.createElement('canvas').getContext('2d'), P, j, { scale: 1, boxes });
        for (const b of boxes) {
          const key = RS.slides.hit(P, j, b.x + b.w / 2, b.y + b.h / 2);
          if (key && key.startsWith(`${kind}:`)) { found = { j, b, id: key.slice(kind.length + 1) }; break; }
        }
      }
      assert(found, `no ${kind} on any slide`);
      await tap(() => $$('.carousel-stage .cs-dot')[found.j], `the dot of slide ${found.j + 1}`);
      const c = await waitFor(() => { const m = main(); return m && m.dataset.style === 'apresentacao' && m.dataset.index === String(found.j) && m; }, `slide ${found.j + 1} on the stage`, 8000);
      const r = c.getBoundingClientRect();
      const at = { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: r.left + ((found.b.x + found.b.w / 2) / P.fmt.w) * r.width, clientY: r.top + ((found.b.y + found.b.h / 2) / P.fmt.h) * r.height };
      c.dispatchEvent(new PointerEvent('pointerdown', at)); c.dispatchEvent(new PointerEvent('pointerup', at));
      await waitFor(() => document.activeElement && document.activeElement.id === `vt-${list}-${found.id}` && document.activeElement.closest('.cseq-panel'), `the ${kind} row «vt-${list}-${found.id}» in focus`, 5000);
    }
  });

  test('carousel: «Fotos» › «Enquadrar» keeps the carousel\'s own point (the video\'s stays) and the slides use it', async () => {
    await waitFor(() => $('.editor') && idle(), 'the editor');
    await tap(piece('Carrossel'), 'the «Carrossel» piece');
    await tap(() => byText('.rail [role="tab"]', /^\s*Estilo\s*$/), 'the Estilo tab');
    await tap(() => $('.cstyle-card[data-style="notificacoes"]'), 'Notificações');
    await waitFor(() => main() && main().dataset.style === 'notificacoes', 'Notificações on the stage', 8000);
    await tap(() => byText('.rail [role="tab"]', /^\s*Fotos\s*$/), 'the Fotos tab');
    const item = await waitFor(() => $('.carousel-panel .vf-item'), 'the carousel\'s photo with «Enquadrar»', 20000);
    const id = item.dataset.photoId;
    const before = (await H.saved()).video;
    item.click();
    const dot = await waitFor(() => $('.modal.frame-sheet .frame-dot'), 'the framing dialog');
    dot.focus();
    for (let i = 0; i < 4; i++) dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    dot.blur();
    const d = await H.saved((x) => x.carousel && x.carousel.photos && x.carousel.photos.focus && x.carousel.photos.focus[id]);
    assertEqual(JSON.stringify(d.video.photos.focus || {}), JSON.stringify(before.photos.focus || {}), 'the video\'s points changed');
    byText('.modal.frame-sheet button', /Feito/).click();
    await waitFor(() => !$('.modal.frame-sheet'), 'the dialog to close');
    // the slides draw with that point
    const p = RS.model.normalize(d);
    const images = { photo: p.photo ? await RS.assets.load(p.photo.asset) : null, logo: null };
    const full = await RS.slides.photos(p, images);
    const P = RS.slides.prepare(p, { format: 'portrait', locale: p.locale, images, photos: { hero: null, cards: [], full } });
    const img = full.find((x) => RS.motion.photoIdOf(x) === id);
    assert(img, 'the framed photo is not among the carousel\'s photos');
    const f = P.focusOf(img), want = d.carousel.photos.focus[id];
    assert(Math.abs(f.x - want.x) < 1e-6 && Math.abs(f.y - want.y) < 1e-6, `the slides use ${JSON.stringify(f)}, not ${JSON.stringify(want)}`);
  });

  // the entries of a stored (uncompressed) ZIP, as U.zip writes them
  function unzip(buf) {
    const v = new DataView(buf), out = [];
    for (let at = 0; v.getUint32(at, true) === 0x04034b50;) {
      const size = v.getUint32(at + 18, true), n = v.getUint16(at + 26, true), extra = v.getUint16(at + 28, true);
      const name = new TextDecoder().decode(new Uint8Array(buf, at + 30, n));
      out.push({ name, bytes: new Uint8Array(buf, at + 30 + n + extra, size) });
      at += 30 + n + extra + size;
    }
    return out;
  }
  const pixels = async (source, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(source, 0, 0);
    return g.getImageData(0, 0, w, h).data;
  };

  test('carousel: «Exportar» › «Instagram carrossel» saves a ZIP of 1080 × 1350 slides for PT and FR, slide 1 as the stage draws it; TikTok is 1080 × 1920', async () => {
    await waitFor(() => $('.editor') && idle(), 'the editor');
    // a second language
    if (!$$('.stage-top .locales .chip-main').some((b) => /FR/.test(b.textContent))) {
      $('.stage-top .locales .chip.add').click();
      (await waitFor(() => byText('.locales .menu [role="menuitem"]', /Français/), 'French in the menu')).click();
      await H.saved((d) => d.locales.includes('fr'));
    }
    await tap(piece('Carrossel'), 'the «Carrossel» piece');
    await waitFor(() => main() && main().width > 50, 'the carousel on the stage');
    const real = RS.util.saveBlob;
    const saved = [];
    RS.util.saveBlob = async (blob, name) => { saved.push({ blob, name }); return true; };
    try {
      const exportZip = async (destination) => {
        byText('.topbar .btn', /^\s*Exportar\s*$/).click();
        await waitFor(() => $('.modal.export') && /Exportar carrossel/.test($('#exp-title').textContent), 'the carousel export');
        (await waitFor(() => byText('.modal.export [aria-label="Para onde?"] [role="radio"]', destination), destination.source)).click();
        // both languages (the dialog starts with the one being edited)
        const langs = [...$$('.modal.export fieldset')].find((f) => /Línguas/.test(f.querySelector('legend').textContent));
        for (const box of langs.querySelectorAll('input[type="checkbox"]')) if (!box.checked) box.click();
        await waitFor(() => [...langs.querySelectorAll('input[type="checkbox"]')].every((b) => b.checked), 'PT and FR chosen');
        const n = saved.length;
        (await waitFor(() => { const b = byText('.modal.export .export-actions button', /Descarregar carrossel/); return b && !b.disabled && b; }, 'Descarregar')).click();
        await waitFor(() => saved.length > n, 'the ZIP', 60000);
        await waitFor(() => !$('.modal.export'), 'the dialog to close', 8000);
        return unzip(await saved[saved.length - 1].blob.arrayBuffer());
      };
      const entries = await exportZip(/Instagram carrossel/);
      const d = RS.model.normalize(await H.saved());
      const c = RS.model.cleanCarousel(d.carousel, d);
      assertEqual(c.format, 'portrait');
      const pngs = (l) => entries.filter((e) => e.name.startsWith(`${l}/carrossel/`) && e.name.endsWith('.png'));
      assert(pngs('pt-PT').length >= 2 && pngs('pt-PT').length === pngs('fr').length, `PT ${pngs('pt-PT').length}, FR ${pngs('fr').length}`);
      assertEqual(pngs('pt-PT')[0].name, 'pt-PT/carrossel/01.png');
      assert(entries.some((e) => e.name === 'fr/publicacao.txt'), 'no FR publication text');
      for (const e of [...pngs('pt-PT'), ...pngs('fr')]) {
        const bmp = await createImageBitmap(new Blob([e.bytes], { type: 'image/png' }));
        assert(bmp.width === 1080 && bmp.height === 1350, `${e.name}: ${bmp.width} × ${bmp.height}`);
      }
      // slide 1 = the carousel drawn as the stage draws it (same photos, same images)
      const images = { photo: d.photo ? await RS.assets.load(d.photo.asset) : null, logo: d.logo ? await RS.assets.load(d.logo.asset) : null };
      const full = await RS.slides.photos(d, images);
      const P = RS.slides.prepare(d, { format: 'portrait', locale: 'pt-PT', images, photos: { hero: null, cards: [], full } });
      assertEqual(pngs('pt-PT').length, P.slides.length);
      const want = document.createElement('canvas'); want.width = 1080; want.height = 1350;
      RS.slides.render(want.getContext('2d'), P, 0, { scale: 1 });
      const a = await pixels(await createImageBitmap(new Blob([pngs('pt-PT')[0].bytes], { type: 'image/png' })), 1080, 1350), b = await pixels(want, 1080, 1350);
      let off = 0;
      for (let i = 0; i < a.length; i += 4 * 7) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) off++;
      assertEqual(off, 0, `${off} sampled pixels differ from the stage's drawing`);
      // TikTok: 9:16
      const tiktok = await exportZip(/TikTok/);
      const first = tiktok.find((e) => e.name === 'pt-PT/carrossel/01.png');
      const bmp = await createImageBitmap(new Blob([first.bytes], { type: 'image/png' }));
      assert(bmp.width === 1080 && bmp.height === 1920, `TikTok: ${bmp.width} × ${bmp.height}`);
    } finally { RS.util.saveBlob = real; }
  });
})();
