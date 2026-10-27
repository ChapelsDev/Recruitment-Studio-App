// Development-only contact sheet using the production planner and renderer.
// All projects are ephemeral. This fixture never writes application storage.
(async () => {
  const M = RS.model, P = RS.production, TR = RS.trades, E = RS.engine;
  const $ = (id) => document.getElementById(id), host = $('pages'), status = $('status');
  const families = ['editorial', 'blueprint', 'signal', 'workshop', 'collage', 'atelier'];
  const labels = { cover: 'Capa', intro: 'Oportunidade', benefits: 'Vantagens', positions: 'Vagas', contact: 'Contacto' };
  const headlines = {
    obras: ['Construção civil', 'Métiers du bâtiment'], pedreiro: ['Pedreiros', 'Maçons'], cofragem: ['Cofragistas', 'Coffreurs'],
    ferro: ['Armadores de ferro', 'Ferrailleurs'], eletricista: ['Eletricistas', 'Électriciens'], canalizador: ['Canalizadores', 'Plombiers'],
    pintor: ['Pintores', 'Peintres'], carpinteiro: ['Carpinteiros', 'Menuisiers'], serralheiro: ['Serralheiros', 'Serruriers'],
    ladrilhador: ['Ladrilhadores', 'Carreleurs'], telhados: ['Telhadores', 'Couvreurs'], maquinas: ['Manobradores', 'Machinistes'],
    pladur: ['Montadores de pladur', 'Plaquistes'], servente: ['Serventes de obra', 'Manœuvres'], tecnico: ['Técnicos de obra', 'Chefs de chantier'],
  };
  function option(value, label) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
  Object.entries(M.CAROUSEL_STYLES).forEach(([value, label]) => $('style').append(option(value, label)));
  TR.list.forEach((trade) => $('trade').append(option(trade.id, trade.label)));
  Object.entries(M.FONTS).forEach(([value, font]) => $('font').append(option(value, font.label)));
  $('trade').value = 'pedreiro'; $('style').value = 'editorial';

  const images = new Map();
  const [, library] = await Promise.all([E.loadFonts(), RS.library.index()]);
  function photograph(trade) {
    const category = TR.get(trade)?.photo, item = library.items.find((item) => item.cat === category);
    if (!item) return Promise.resolve(null);
    if (!images.has(item.id)) {
      const request = RS.library.full(item.id).then(async (src) => {
        const image = new Image(); image.src = src; await image.decode(); return { image, item };
      });
      images.set(item.id, request);
      request.catch(() => images.delete(item.id));
    }
    return images.get(item.id);
  }
  function selection() {
    return { view: $('view').value, style: $('style').value, trade: $('trade').value, format: $('format').value,
      palette: $('palette').value, font: $('font').value, locale: $('locale').value,
      variation: Math.max(0, Math.min(999, Math.trunc(Number($('variation').value) || 0))), photo: $('photo').checked, qr: $('qr').checked };
  }
  function makeProject(options, loaded, style = options.style) {
    const template = RS.templates.list.find((template) => template.trade === options.trade) || RS.templates.list[0];
    const p = M.addLocale(M.newProject(template, { trades: [options.trade] }), 'fr', 'pt-PT');
    p.id = `visual-review-${options.trade}`; p.locale = options.locale;
    p.brand = { name: 'OBRA / EQUIPA', tagline: options.locale === 'fr' ? 'Le savoir-faire nous rassemble.' : 'O talento constrói o futuro.' };
    const palette = M.PALETTES.find((palette) => palette.id === options.palette);
    Object.assign(p.style, { primary: palette.primary, accent: palette.accent, bg: '#F5F1E8', text: '#202521', fonts: options.font,
      upper: options.font !== 'elegant', textScale: 1, headScale: 1, customColors: true });
    p.carousel = M.cleanCarousel({ style, variation: options.variation }, p.locales);
    p.show.badge = false; p.show.qr = options.qr; p.qrMode = 'custom';
    for (const locale of p.locales) {
      const french = locale === 'fr', t = TR.textsFor([options.trade], locale);
      t.kicker = french ? 'Votre talent a sa place.' : 'O seu talento tem lugar.';
      t.headline = headlines[options.trade][french ? 1 : 0];
      t.intro = french ? 'Votre métier. Notre prochain projet.' : 'O seu ofício. O nosso próximo projeto.';
      t.benefits = (french ? ['Contrat durable', 'Équipe engagée', 'Formation continue', 'Chantiers locaux'] : ['Contrato estável', 'Equipa próxima', 'Formação contínua', 'Obras na região']).map(M.item);
      t.positionsTitle = M.STOCK.positionsTitle[locale];
      t.positions = t.positions.slice(0, 3);
      if (t.positions.length < 3) t.positions.push(M.item(french ? 'Aide de chantier' : 'Ajudante de obra'));
      t.contacts = [M.iconItem('mail', 'equipa@example.com')];
      t.qr = 'https://example.com/candidatura'; p.texts[locale] = t;
    }
    p.photo = loaded ? { asset: loaded.item.id, zoom: 1, fx: .5, fy: .4, flip: false, adj: { b: 1, c: 1, s: 1 } } : null;
    return p;
  }
  let revision = 0;
  async function draw() {
    const current = ++revision, options = selection();
    status.dataset.state = 'loading'; status.textContent = 'A compor o carrossel…'; host.setAttribute('aria-busy', 'true');
    $('style').disabled = options.view === 'compare';
    try {
      let loaded = null, warning = '';
      if (options.photo) {
        try { loaded = await photograph(options.trade); if (!loaded) warning = 'Sem fotografia desta profissão na biblioteca; composição ilustrada.'; }
        catch (error) { warning = `Fotografia indisponível; composição ilustrada. ${error.message}`; }
      }
      // Late image loads from previous choices never replace the latest view.
      if (current !== revision) return;
      const fragment = document.createDocumentFragment(), rendered = [];
      const styles = options.view === 'compare' ? families : [options.style];
      for (const style of styles) {
        const p = makeProject(options, loaded, style), pages = P.plan(p, options.locale, options.format), art = P.artDirection(p);
        for (const page of options.view === 'compare' ? pages.slice(0, 1) : pages) {
          const figure = document.createElement('figure'), caption = document.createElement('figcaption');
          const title = document.createElement('strong'), detail = document.createElement('span');
          const canvas = P.renderSlide(p, page, { photo: loaded?.image || null }, 640 / 1080);
          canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${art.label} · ${art.motifLabel} · ${labels[page.kind]} · ${page.index} de ${page.total}`);
          title.textContent = options.view === 'compare' ? art.label : `${String(page.index).padStart(2, '0')} · ${labels[page.kind]}`;
          detail.textContent = options.view === 'compare' ? art.motifLabel : art.label;
          caption.append(title, detail); figure.append(canvas, caption); fragment.append(figure);
          rendered.push({ family: art.id, kind: page.kind, index: page.index });
        }
      }
      if (current !== revision) return;
      host.classList.toggle('comparison', options.view === 'compare');
      host.style.setProperty('--columns', Math.min(rendered.length, 6)); host.replaceChildren(fragment);
      const description = options.view === 'compare' ? 'Seis direções de arte · mesma profissão, fotografia, paleta e fonte.' : `${rendered.length} páginas · ${P.artDirection(makeProject(options, loaded)).description}`;
      status.textContent = `${description} ${options.format === 'square' ? '1080 × 1080' : '1080 × 1350'} · ${loaded ? 'Fotografia da biblioteca.' : 'Desenho vetorial.'}${warning ? ` ${warning}` : ''}`;
      status.dataset.state = 'ready'; host.dataset.trade = options.trade; host.dataset.view = options.view;
      host.dataset.family = options.view === 'compare' ? 'all' : rendered[0]?.family || ''; host.dataset.renderRevision = String(current);
    } catch (error) {
      if (current !== revision) return;
      status.textContent = error.stack || error.message; status.dataset.state = 'error';
    } finally { if (current === revision) host.setAttribute('aria-busy', 'false'); }
  }
  let proofUrl = '';
  $('export-proof').addEventListener('click', async () => {
    const button = $('export-proof'), link = $('proof-download'); button.disabled = true; link.hidden = true;
    try {
      const options = selection(), loaded = options.photo ? await photograph(options.trade) : null;
      const p = makeProject(options, loaded);
      p.name = `Revisão ${options.trade} ${options.style} ${options.format}`;
      const result = await P.packageFiles(p, { mode: 'carousel', format: options.format, locales: [options.locale] }, { images: { photo: loaded?.image || null }, yieldUI: () => new Promise((resolve) => requestAnimationFrame(resolve)) });
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      proofUrl = URL.createObjectURL(result.blob); link.href = proofUrl; link.download = result.name; link.hidden = false;
      link.textContent = `Descarregar ZIP de revisão (${result.files.length} ficheiros)`;
    } catch (error) { status.textContent = error.message; status.dataset.state = 'error'; }
    finally { button.disabled = false; }
  });
  $('controls').addEventListener('submit', (event) => event.preventDefault());
  $('controls').addEventListener('change', draw);
  await draw();
})().catch((error) => {
  const status = document.getElementById('status'); status.textContent = error.stack || error.message; status.dataset.state = 'error';
  document.getElementById('pages').setAttribute('aria-busy', 'false');
});
