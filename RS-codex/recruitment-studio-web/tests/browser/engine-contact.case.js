// Engine: the green WhatsApp pill and the QR built from the ad's WhatsApp link.
(() => {
  const M = RS.model, E = RS.engine, T = RS.templates;
  const ad = (tpl, fmt, number) => {
    const p = M.newProject(tpl, { format: fmt, trades: ['pedreiro'] });
    if (number) p.whatsapp = { country: '351', number };
    return p;
  };
  const keys = (p, fmt) => E.renderToCanvas(p, { format: fmt, scale: 0.25, mode: 'editor' }).regions.map((r) => r.key);

  test('pill: every template and format shows the WhatsApp pill when there is a number', () => {
    for (const tpl of T.list) for (const fmt of M.FORMAT_ORDER) {
      assert(keys(ad(tpl, fmt, '912345678'), fmt).includes('contact:wa'), `${tpl.id}/${fmt} has no contact:wa`);
    }
  });

  test('pill: hidden when «Botão WhatsApp no anúncio» is off', () => {
    const p = ad(T.list[0], 'portrait', '912345678');
    p.show.waCta = false;
    assert(!keys(p, 'portrait').includes('contact:wa'));
  });

  test('pill: without a number the poster is exactly as before', () => {
    for (const tpl of T.list) for (const fmt of M.FORMAT_ORDER) {
      const p = ad(tpl, fmt, null);
      // The browser's first draw of a layout can differ by a few antialiased
      // pixels; compare from the second render on.
      E.renderToCanvas(p, { format: fmt, scale: 0.2, mode: 'export' });
      const a = E.renderToCanvas(p, { format: fmt, scale: 0.2, mode: 'export' });
      assert(!a.regions.some((r) => r.key === 'contact:wa'), `${tpl.id}/${fmt} drew a pill without a number`);
      const q = JSON.parse(JSON.stringify(p));
      q.show.waCta = false;
      const b = E.renderToCanvas(q, { format: fmt, scale: 0.2, mode: 'export' });
      assert(a.canvas.toDataURL() === b.canvas.toDataURL(), `${tpl.id}/${fmt} pixels changed without a number`);
    }
  });

  test('pill: a contact with the same number is not shown twice', () => {
    for (const tpl of T.list) for (const fmt of M.FORMAT_ORDER) {
      const p = ad(tpl, fmt, '912345678');
      p.texts['pt-PT'].contacts[0].text = '+351 912 345 678';
      const id = p.texts['pt-PT'].contacts[0].id;
      const k = keys(p, fmt);
      assert(k.includes('contact:wa') && !k.includes(`contact:${id}`), `${tpl.id}/${fmt} shows the number twice`);
      p.show.waCta = false;
      assert(keys(p, fmt).includes(`contact:${id}`), `${tpl.id}/${fmt} hid the contact without the pill`);
    }
  });

  test('pill: never covers the QR and stays on the poster (every template, format and font)', () => {
    const cut = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
    const bad = [];
    for (const tpl of T.list) for (const fmt of M.FORMAT_ORDER) for (const font of Object.keys(M.FONTS)) {
      for (const [country, number] of [['351', '912345678'], ['352', '621234567'], ['49', '1512345678901']]) {
        const p = ad(tpl, fmt, number);
        p.whatsapp.country = country;
        p.style.fonts = font;
        const r = E.renderToCanvas(p, { format: fmt, scale: 0.2, mode: 'export' });
        const where = `${tpl.id}/${fmt}/${font}/+${country}`;
        const qr = r.regions.find((g) => g.key === 'qr');
        const pill = r.regions.find((g) => g.key === 'contact:wa');
        if (!qr || !pill) { bad.push(`${where} lacks ${qr ? 'the pill' : 'the QR'}`); continue; }
        for (const g of r.regions) if (g.key.startsWith('contact:') && cut(g, qr)) bad.push(`${where} ${g.key} over the QR`);
        if (pill.x < 0 || pill.y < 0 || pill.x + pill.w > r.width + 0.5 || pill.y + pill.h > r.height + 0.5) bad.push(`${where} pill off the poster`);
      }
    }
    assert(!bad.length, `${bad.length}: ${bad.slice(0, 12).join('; ')}`);
  });

  // LONG (a template's own sample) fits a full row at 0.6 of its size; HUGE does not
  // even there (as the main contact of a narrow story it then fits that row, below the QR)
  test('contacts: a long contact beside the QR keeps 0.6 of its size, else takes a full row below it (narrow templates)', () => {
    const LONG = 'recrutamento@aempresa.pt', HUGE = 'recrutamento.obras@construcoes-exemplo.pt', SHORT = 'rh@x.pt';
    let moved = 0;
    const cut = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
    // the size each text is drawn at (poster units, from the canvas calls), over the stack's own scale
    const drawn = (p, fmt) => {
      const f = M.FORMATS[fmt];
      const c = document.createElement('canvas'); c.width = Math.round(f.w * 0.2); c.height = Math.round(f.h * 0.2);
      const ctx = c.getContext('2d'), real = ctx.fillText, sizes = {};
      ctx.fillText = function (text, ...rest) { const m = /([\d.]+)px/.exec(this.font); if (m) sizes[text] = parseFloat(m[1]); return real.call(this, text, ...rest); };
      const r = E.render(ctx, p, { format: fmt, scale: 0.2, mode: 'export' });
      return { ...r, size: (text) => sizes[text] / r.report.shrink };
    };
    const bad = [];
    for (const id of ['diagonal', 'divisao', 'faisca', 'noite']) for (const fmt of M.FORMAT_ORDER) {
      for (const [mode, number] of [['whatsapp', '912345678'], ['link', null]]) for (const at of [0, 1]) {
        const make = (text) => {
          const p = ad(T.get(id), fmt, number);
          p.qrMode = mode;
          if (mode === 'link') p.texts['pt-PT'].qr = 'https://exemplo.pt/vagas';
          p.texts['pt-PT'].contacts = [M.iconItem('phone', '+351 213 456 789'), M.iconItem('mail', 'rh@aempresa.pt')];
          p.texts['pt-PT'].contacts[at] = M.iconItem('mail', text);
          return p;
        };
        const ref = drawn(make(SHORT), fmt);
        for (const text of [LONG, HUGE]) {
          const where = `${id}/${fmt}/${mode}/${at ? 'second' : 'main'}/${text === LONG ? 'long' : 'huge'}`;
          const p = make(text), r = drawn(p, fmt);
          const qr = r.regions.find((g) => g.key === 'qr');
          const row = r.regions.find((g) => g.key === `contact:${p.texts['pt-PT'].contacts[at].id}`);
          if (!qr || !row) { bad.push(`${where} has no ${qr ? 'contact' : 'QR'}`); continue; }
          for (const g of r.regions) if (g.key.startsWith('contact:') && cut(g, qr)) bad.push(`${where} ${g.key} over the QR`);
          const k = r.size(text) / ref.size(SHORT);
          const below = row.y >= qr.y + qr.h - 0.5;
          if (below && text === LONG) moved++;
          if (k < 0.58 && (text === LONG || !below)) bad.push(`${where} drawn at ${Math.round(k * 100)}%${below ? ' below the QR' : ' beside the QR'}`);
        }
      }
    }
    assert(!bad.length, `${bad.length}: ${bad.slice(0, 14).join('; ')}`);
    assert(moved > 0, 'no long contact went below the QR: nothing tested');
  });

  test('QR: WhatsApp mode encodes the ad link', () => {
    const p = ad(T.list[0], 'portrait', '912345678');
    p.qrMode = 'whatsapp';
    const R = { show: p.show, t: p.texts['pt-PT'], project: p, locale: 'pt-PT' };
    assertEqual(E.qrText(R), RS.contact.adLink(p, 'pt-PT'));
  });

  test('QR: link mode keeps the link the person typed', () => {
    const p = ad(T.list[0], 'portrait', '912345678');
    p.qrMode = 'link';
    p.texts['pt-PT'].qr = 'https://x.pt';
    const R = { show: p.show, t: p.texts['pt-PT'], project: p, locale: 'pt-PT' };
    assertEqual(E.qrText(R), 'https://x.pt');
  });

  test('QR: WhatsApp mode without a number shows no QR', () => {
    const p = ad(T.list[0], 'portrait', null);
    const R = { show: p.show, t: p.texts['pt-PT'], project: p, locale: 'pt-PT' };
    assertEqual(E.qrText(R), '');
  });
})();
