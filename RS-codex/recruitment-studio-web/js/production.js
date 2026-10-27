// Automatic carousel composition and all-or-nothing campaign packages.
window.RS = window.RS || {};
RS.production = (() => {
  const M = RS.model, U = RS.util;
  const PARTS = { feed: 'Feed · 1080 × 1350', story: 'Story · 1080 × 1920', video: 'Vídeo · 9:16, com o som escolhido', cover: 'Capa estática do Reel · 9:16', carousel: 'Carrossel numerado', text: 'Texto da publicação por língua', project: 'Projeto portátil com imagens e som' };
  const TITLES = {
    'pt-PT': ['A oportunidade', 'O que oferecemos', 'Fale connosco'], en: ['The opportunity', 'What we offer', 'Get in touch'],
    fr: ['Votre opportunité', 'Ce que nous offrons', 'Contactez-nous'], es: ['La oportunidad', 'Qué ofrecemos', 'Contacta con nosotros'],
    it: ['La tua opportunità', 'Cosa offriamo', 'Contattaci'], 'de-CH': ['Deine Chance', 'Das bieten wir', 'Kontaktiere uns'], 'de-DE': ['Deine Chance', 'Das bieten wir', 'Kontaktiere uns'],
  };
  const DIRECTIONS = {
    editorial: { label: 'Editorial', description: 'Fotografia ampla, títulos de cartaz e ritmo de revista.' },
    blueprint: { label: 'Projeto', description: 'Pranchas técnicas, cotas gráficas e ilustrações de ofício.' },
    signal: { label: 'Sinalética', description: 'Cor afirmativa, recortes e sinais que orientam o olhar.' },
    workshop: { label: 'Oficina', description: 'Blocos de matéria, fotografia em faixa e tipografia monumental.' },
    collage: { label: 'Colagem', description: 'Fotografias recortadas, sobreposições e notas gráficas.' },
    atelier: { label: 'Atelier', description: 'Margens generosas, pranchas fotográficas e desenho a traço.' },
  };
  const TEMPLATE_DIRECTION = { diagonal: 'editorial', divisao: 'editorial', editorial: 'editorial', planta: 'blueprint', cartao: 'blueprint',
    sinal: 'signal', estaleiro: 'signal', betao: 'workshop', noite: 'workshop', faixa: 'collage', faisca: 'collage', moldura: 'atelier' };
  // An identity belongs to the ad, not to a render, language or keystroke. A new
  // variation is explicit; editing a contact never shuffles the composition.
  function artDirection(project) {
    const chosen = project.carousel?.style;
    const id = DIRECTIONS[chosen] ? chosen : TEMPLATE_DIRECTION[project.template] || 'editorial';
    const trades = project.trades?.length ? project.trades : [project.trade || 'obras'];
    const trade = trades[0], variation = Math.max(0, Math.trunc(Number(project.carousel?.variation) || 0));
    let identity = 2166136261;
    for (const char of `${project.id || ''}|${project.template}|${trades.join(',')}`) identity = Math.imul(identity ^ char.charCodeAt(0), 16777619) >>> 0;
    const seed = (identity + Math.imul(variation, 0x9e3779b9)) >>> 0;
    return { id, ...DIRECTIONS[id], trade, trades, seed, variation, variant: (identity % 3 + variation) % 3,
      motifLabel: RS.carouselArt?.label(trade) || RS.trades?.get(trade)?.label || 'Construção' };
  }
  function settings(project, value = project.delivery || {}) {
    return { format: value.format === 'square' ? 'square' : 'portrait',
      locales: Array.isArray(value.locales) ? project.locales.filter((l) => value.locales.includes(l)) : [...project.locales],
      parts: Object.fromEntries(Object.keys(PARTS).map((k) => [k, value.parts?.[k] !== false])) };
  }
  // Keep every word, including long URLs and explicit newlines. No ellipsis in
  // publication content: overflowing lines continue on the next slide.
  function wrap(text, measure, width) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (measure(line ? `${line} ${word}` : word) <= width) { line = line ? `${line} ${word}` : word; continue; }
        if (line) lines.push(line);
        line = '';
        for (const char of Array.from(word)) {
          if (line && measure(line + char) > width) { lines.push(line); line = ''; }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  // Geometry is shared by preview and export. Drawings own a real region;
  // copy is never laid over ornament and long copy always continues on a page.
  function composeSlide(slide, fmt, measure, qr = '', project = {}) {
    const art = artDirection(project), family = art.id, H = fmt.h;
    const cover = slide.kind === 'cover', hero = slide.layout === 'hero';
    const list = ['benefits', 'positions'].includes(slide.kind) && slide.layout === 'text';
    const headScale = U.clamp(project.style?.headScale || 1, .6, 1.4), textScale = U.clamp(project.style?.textScale || 1, .7, 1.3);
    let bodyX = 84, bodyWidth = 912, start = 190, bottom = qr ? H - 450 : H - 162;
    let photoRect = null, artRect = null, photoShape = 'rect', titleWidth = 710;
    if (hero) {
      if (family === 'blueprint') {
        const left = art.variant === 2; bodyX = left ? 448 : 84;
        photoRect = { x: left ? 84 : 680, y: 200, w: 316, h: H - 362 };
        bodyWidth = 548; titleWidth = 548; start = 250;
      } else if (family === 'workshop') {
        const split = .55 + art.variant * .025;
        photoRect = { x: 0, y: Math.round(H * split), w: 1080, h: H - Math.round(H * split) - 132 };
        start = 205; bottom = photoRect.y - 44; titleWidth = 820;
      } else if (family === 'atelier') {
        const left = art.variant !== 2;
        photoRect = { x: left ? 84 : 504, y: 172, w: 492, h: Math.round(H * (.39 + art.variant * .015)) };
        artRect = { x: left ? 620 : 108, y: 202, w: 352, h: Math.round(H * .36) };
        start = photoRect.y + photoRect.h + 42;
      } else if (family === 'collage') {
        photoRect = { x: 324 + art.variant * 18, y: 174, w: 672 - art.variant * 18, h: Math.round(H * (.39 + art.variant * .02)) };
        artRect = { x: 70, y: 204, w: 300, h: Math.round(H * .35) };
        photoShape = 'cut'; start = photoRect.y + photoRect.h + 40;
      } else {
        photoRect = { x: 0, y: 150, w: 1080, h: Math.round(H * (.39 + art.variant * .025)) };
        if (family === 'signal') { photoRect = { x: 84, y: 174, w: 912, h: Math.round(H * (.35 + art.variant * .025)) }; photoShape = 'cut'; }
        start = photoRect.y + photoRect.h + 40;
      }
    } else if (slide.layout === 'side') {
      bodyWidth = 548; titleWidth = 548;
      const left = ['atelier', 'collage'].includes(family) ? art.variant !== 1 : art.variant === 2;
      bodyX = left ? 448 : 84;
      photoRect = { x: left ? 84 : 680, y: 184, w: 316, h: H - (qr ? 634 : 346) };
      if (family === 'collage' || family === 'signal') photoShape = 'cut';
    } else if (slide.layout === 'bottom') {
      photoRect = { x: 84, y: H - 410, w: qr ? 612 : 912, h: 250 };
      bottom = photoRect.y - 40;
    } else {
      artRect = { x: 840, y: 170, w: 156, h: 132 };
    }
    const hasPhoto = slide.photo !== false && !!(slide.photo || project.photo);
    const wideTechnicalCover = hero && family === 'blueprint' && (!hasPhoto || String(slide.text).split(/\s+/).some((word) => word.length <= 30 && measure(word, 52, true) > bodyWidth));
    if (wideTechnicalCover) {
      photoRect = { x: 84, y: 174, w: 912, h: Math.round(H * .38) };
      bodyX = 84; bodyWidth = 912; titleWidth = 710; start = photoRect.y + photoRect.h + 40; artRect = null;
    }
    // A manually assigned QR may also appear on a cover; the QR region wins.
    if (qr) {
      bottom = Math.min(bottom, H - 450);
      if (photoRect && slide.layout !== 'bottom' && photoRect.y + photoRect.h > H - 450) photoRect.h = Math.max(0, H - 450 - photoRect.y);
      if (hero && start > bottom - 160) { start = 184; photoRect = null; artRect = null; }
    }
    let titleSize = (cover ? 30 : family === 'atelier' ? 66 : 76) * (cover ? 1 : headScale), titleLines, top;
    const minSize = Math.round((cover ? (bodyWidth < 600 ? 72 : 86) : slide.kind === 'intro' ? 54 : list ? 43 : 48) * (cover ? 1 : textScale));
    let size = minSize, lineHeight = Math.ceil(size * (cover ? 1.06 : 1.25));
    const gridList = list && ['editorial', 'collage', 'atelier'].includes(family) && bodyWidth === 912;
    const minimumBody = list ? gridList ? 2 * (78 + Math.ceil(43 * textScale * 1.24) + 24) + 28 : 25 + Math.ceil(43 * textScale * 1.24) + 24 : cover ? Math.ceil(lineHeight * headScale) : lineHeight;
    do {
      titleLines = slide.title.trim() ? wrap(slide.title, (s) => measure(s, titleSize, !cover), titleWidth) : [];
      top = start + titleLines.length * Math.ceil(titleSize * 1.15) + (titleLines.length ? 32 : 0);
      if (top + minimumBody <= bottom || titleSize <= 20) break;
      titleSize -= 2;
    } while (true);
    // Exceptionally long user titles still get room: move the text zone up and
    // remove that page's photo before ever letting text run into its footer.
    if (top + minimumBody > bottom) {
      start = 174; photoRect = null; artRect = null; bottom = qr ? H - 450 : H - 162;
      top = start + titleLines.length * Math.ceil(titleSize * 1.15) + 32;
    }
    if (artRect && !hero && top < artRect.y + artRect.h + 6) artRect = null;
    const base = { ...slide, art, titleLines, titleSize, titleTop: start, titleX: bodyX, titleWidth,
      bodyWidth, bodyX, photoRect, photoShape, artRect, format: fmt.id,
      qrX: slide.layout === 'bottom' ? 756 : 744, qrRect: qr ? { x: slide.layout === 'bottom' ? 756 : 744, y: H - 390, w: 230, h: 230 } : null };
    if (list) {
      const words = String(slide.text).split(/\s+/).filter((word) => word.length <= 30 && !/[\/@]/.test(word));
      const grid = gridList && !words.some((word) => measure(word, Math.round(43 * textScale), false) > 390);
      const cols = grid ? 2 : 1, gap = grid ? 28 : 22, cardWidth = (bodyWidth - gap * (cols - 1)) / cols;
      const numberSpace = grid ? 0 : 78, textWidth = cardWidth - 52 - numberSpace;
      const items = String(slide.text).split(/\n\s*\n/).filter((s) => s.trim()), fragments = [];
      const insetTop = grid ? 78 : 25, minCardHeight = insetTop + Math.ceil(43 * textScale * 1.24) + 24;
      const rowsPerPage = Math.max(1, Math.min(grid ? 2 : 4, Math.max(1, items.length), Math.floor((bottom - top + gap) / (minCardHeight + gap))));
      const cardHeight = (bottom - top - gap * (rowsPerPage - 1)) / rowsPerPage;
      size = Math.round((grid ? 62 : 58) * textScale);
      const floor = Math.round(43 * textScale);
      while (size > floor && (words.some((word) => measure(word, size, false) > textWidth) || items.some((text) => wrap(text, (s) => measure(s, size, false), textWidth).length * Math.ceil(size * 1.24) > cardHeight - insetTop - 24))) size = Math.max(floor, size - 2);
      while (size > 40 && words.some((word) => measure(word, size, false) > textWidth)) size--;
      lineHeight = Math.ceil(size * 1.24);
      const capacity = Math.max(1, Math.floor((cardHeight - insetTop - 24) / lineHeight));
      items.forEach((text, number) => {
        const lines = wrap(text, (s) => measure(s, size, false), textWidth);
        for (let i = 0; i < lines.length; i += capacity) fragments.push({ number: number + 1, lines: lines.slice(i, i + capacity), continuation: i > 0 });
      });
      if (!fragments.length) fragments.push({ number: 1, lines: [''] });
      const perPage = cols * rowsPerPage, pageSpan = Math.ceil(fragments.length / Math.ceil(fragments.length / perPage)), pages = [];
      for (let i = 0; i < fragments.length; i += pageSpan) {
        const group = fragments.slice(i, i + pageSpan), localRows = Math.ceil(group.length / cols);
        const localHeight = (bottom - top - gap * (localRows - 1)) / localRows;
        const itemCards = group.map((item, k) => {
          const x = bodyX + k % cols * (cardWidth + gap), y = top + Math.floor(k / cols) * (localHeight + gap);
          return { ...item, x, y, w: cardWidth, h: localHeight, size, lineHeight, textX: x + 26 + numberSpace, textY: y + insetTop, textWidth };
        });
        pages.push({ ...base, lines: group.flatMap((item, k) => [...(k ? [''] : []), ...item.lines]), size, lineHeight, top,
          itemCards, grid, cards: true, qr: '', part: pages.length });
      }
      if (qr) pages.at(-1).qr = qr;
      return pages;
    }
    const maxSize = Math.round((cover ? (bodyWidth < 600 ? 132 : 220) : slide.kind === 'intro' ? 78 : 62) * (cover ? 1 : textScale));
    for (let candidate = maxSize; candidate >= minSize; candidate -= 2) {
      const height = Math.ceil(candidate * (cover ? 1.06 : 1.25));
      if (wrap(slide.text, (s) => measure(s, candidate, cover), bodyWidth).length * height <= bottom - top) { size = candidate; lineHeight = height; break; }
    }
    if (cover) { size = Math.round(size * headScale); lineHeight = Math.ceil(size * 1.06); }
    // Ordinary words should stay whole, especially in the narrow technical
    // cover. Only truly long tokens (URLs, identifiers) need character wrapping.
    const words = String(slide.text).split(/\s+/).filter((word) => word.length <= 30 && !/[\/@]/.test(word));
    while (size > (cover ? 52 : 40) && words.some((word) => measure(word, size, cover) > bodyWidth)) size--;
    lineHeight = Math.ceil(size * (cover ? 1.06 : 1.25));
    const lines = wrap(slide.text, (s) => measure(s, size, cover), bodyWidth), capacity = Math.max(1, Math.floor((bottom - top) / lineHeight)), pages = [];
    for (let i = 0; i < lines.length; i += capacity) {
      const rows = lines.slice(i, i + capacity), final = i + capacity >= lines.length;
      const offset = slide.kind === 'intro' ? Math.min(95, Math.max(0, (bottom - top - rows.length * lineHeight) / 2)) : 0;
      const pageTop = top + offset;
      const free = bottom - pageTop - rows.length * lineHeight;
      let drawing = artRect;
      if (hero && family === 'blueprint' && free > 220) drawing = { x: bodyX, y: pageTop + rows.length * lineHeight + 36, w: 360, h: Math.min(free - 36, 340) };
      if (!hero && !photoRect && free > 250 && ['intro', 'contact'].includes(slide.kind)) drawing = { x: bodyX + (art.variant === 1 ? 0 : bodyWidth - 330), y: pageTop + rows.length * lineHeight + 24, w: 330, h: Math.min(330, free - 24) };
      pages.push({ ...base, titleTop: start + offset, lines: rows, size, lineHeight, top: pageTop, artRect: drawing,
        qr: final ? qr : '', cards: false, part: pages.length });
    }
    return pages;
  }
  function automaticPlan(project, locale, format = 'portrait', measure) {
    if (!project.locales.includes(locale)) throw new Error('Escolha uma língua deste anúncio.');
    const fmt = M.FORMATS[format === 'square' ? 'square' : 'portrait'];
    const fonts = M.FONTS[project.style.fonts] || M.FONTS.modern;
    if (!measure) {
      const ctx = document.createElement('canvas').getContext('2d');
      measure = (text, size, head) => { RS.engine.setFont(ctx, head ? fonts.head : fonts.body, size); return ctx.measureText(text).width; };
    }
    const t = project.texts[locale], show = project.show, labels = TITLES[locale] || TITLES['pt-PT'], pages = [];
    const qr = RS.engine?.qrText ? RS.engine.qrText({ project, locale, t, show }) : '';
    function section(kind, title, values) {
      const content = values.filter((v) => typeof v === 'string' && v.trim());
      if (!content.length) return;
      const layout = kind === 'cover' ? 'hero' : kind === 'intro' && project.photo ? 'side'
        : kind === 'contact' && !qr && project.photo ? 'bottom' : 'text';
      pages.push(...composeSlide({ kind, title, text: content.join('\n\n'), layout, locale }, fmt, measure, kind === 'contact' ? qr : '', project));
    }
    const kicker = show.kicker ? t.kicker : '';
    const longKicker = kicker.includes('\n') || measure(kicker, 32, false) > 912;
    section('cover', longKicker ? '' : kicker, [project.style.upper ? t.headline.toLocaleUpperCase(locale) : t.headline], 88);
    const repeatsBadge = [t.headline, show.intro && t.intro, ...(show.benefits ? t.benefits.map((v) => v.text) : []), ...(show.positions ? t.positions.map((v) => v.text) : [])].some((v) => v && v.trim() === t.badge.trim());
    section('intro', labels[0], [longKicker ? kicker : '', show.intro ? t.intro : '', M.offerText(project, locale, 'carousel') || '', show.badge && !repeatsBadge ? t.badge : '']);
    section('benefits', labels[1], show.benefits ? t.benefits.map((v) => v.text) : []);
    section('positions', M.STOCK.positionsTitle[locale], show.positions ? [t.positionsTitle !== M.STOCK.positionsTitle[locale] ? t.positionsTitle : '', ...t.positions.map((v) => v.text)] : []);
    if (show.contacts) {
      const wa = show.waCta !== false && project.whatsapp && RS.contact.display(project.whatsapp.country, project.whatsapp.number);
      section('contact', labels[2], [M.STOCK.apply[locale], ...t.contacts.map((v) => v.text), wa ? `${M.STOCK.waCaption[locale]}\n${wa}` : '']);
      pages.filter((p) => p.kind === 'contact').slice(0, -1).forEach((p) => { p.qr = ''; });
    }
    if (!pages.length) throw new Error('O anúncio não tem conteúdo visível para o carrossel.');
    return pages.map((p, i) => ({ ...p, index: i + 1, total: pages.length }));
  }
  const carouselSource = (p, locale) => JSON.stringify([p.texts[locale], p.offer, p.show, p.whatsapp, p.qrMode]);
  const authored = (p, locale) => p.carousel?.locales?.[locale] || null;
  function personalize(p, locale, format = 'portrait', measure) {
    const pages = automaticPlan(p, locale, format, measure);
    p.carousel = M.cleanCarousel(p.carousel, p.locales);
    p.carousel.locales[locale] = { source: carouselSource(p, locale), slides: pages.map((s) => ({
      id: U.uid(), kind: s.kind, title: s.title, text: s.lines.join('\n'), hidden: false, qr: !!s.qr,
      photo: null, layout: s.layout })) };
  }
  function changeSlide(p, locale, action) {
    const list = authored(p, locale)?.slides;
    if (!list) throw new Error('Personalize primeiro o carrossel desta língua.');
    if (action.type === 'add') { list.push({ id: U.uid(), title: 'Nova página', text: '', kind: 'intro', layout: 'text', photo: null, qr: false, hidden: false }); return; }
    const at = list.findIndex((s) => s.id === action.id), s = list[at];
    if (!s) throw new Error('Este diapositivo já não existe.');
    if (action.type === 'patch') Object.assign(s, Object.fromEntries(Object.entries(action.patch || {}).filter(([k]) => ['title', 'text', 'layout', 'photo', 'hidden', 'qr'].includes(k))));
    if (action.type === 'move') { list.splice(at, 1); list.splice(U.clamp(at + action.delta, 0, list.length), 0, s); }
    if (action.type === 'split') {
      let split = Number(action.at);
      if (!Number.isInteger(split) || split <= 0 || split >= s.text.length) throw new Error('Coloque o cursor entre duas partes do texto para dividir.');
      if (/[\uDC00-\uDFFF]/.test(s.text[split]) && /[\uD800-\uDBFF]/.test(s.text[split - 1])) split++;
      const right = s.text.slice(split).trim(), left = s.text.slice(0, split).trim();
      if (!left || !right) throw new Error('A divisão precisa de texto nas duas páginas.');
      const next = { ...U.clone(s), id: U.uid(), text: right };
      s.text = left; s.qr = false; list.splice(at + 1, 0, next);
    }
    if (action.type === 'join') {
      const next = list[at + 1];
      if (!next || s.hidden || next.hidden) throw new Error('Mostre os dois diapositivos antes de os juntar.');
      s.text = [s.text, next.title !== s.title ? next.title : '', next.text].filter(Boolean).join('\n\n');
      s.qr = s.qr || next.qr; list.splice(at + 1, 1);
    }
    p.carousel = M.cleanCarousel(p.carousel, p.locales);
  }
  function plan(project, locale, format = 'portrait', measure) {
    if (!project.locales.includes(locale)) throw new Error('Escolha uma língua deste anúncio.');
    const manual = authored(project, locale);
    if (!manual) return automaticPlan(project, locale, format, measure);
    const fmt = M.FORMATS[format === 'square' ? 'square' : 'portrait'], fonts = M.FONTS[project.style.fonts] || M.FONTS.modern;
    if (!measure) { const ctx = document.createElement('canvas').getContext('2d'); measure = (text, size, head) => { RS.engine.setFont(ctx, head ? fonts.head : fonts.body, size); return ctx.measureText(text).width; }; }
    const pages = [], qr = RS.engine?.qrText ? RS.engine.qrText({ project, locale, t: project.texts[locale], show: project.show }) : '';
    for (const slide of manual.slides.filter((s) => !s.hidden)) {
      if (!slide.text.trim() && !slide.title.trim()) throw new Error('Há um diapositivo vazio. Escreva conteúdo ou oculte-o.');
      pages.push(...composeSlide({ ...slide, slideId: slide.id, locale }, fmt, measure, slide.qr ? qr : '', project));
    }
    if (!pages.length) throw new Error('Mostre pelo menos um diapositivo para exportar.');
    return pages.map((p, i) => ({ ...p, index: i + 1, total: pages.length }));
  }
  async function slideImages(project, page, images = {}) {
    const ref = page.photo === false ? null : page.photo || project.photo;
    if (!ref?.asset || (page.layout === 'text')) return { ...images, photo: null };
    const photo = ref.asset === project.photo?.asset && images.photo ? images.photo : await RS.assets.load(ref.asset);
    if (!photo) throw new Error('Falta a fotografia de um diapositivo. Escolha-a de novo antes de exportar.');
    return { ...images, photo };
  }
  function renderSlide(project, page, images = {}, scale = 1) {
    const E = RS.engine, fmt = M.FORMATS[page.format], fonts = M.FONTS[project.style.fonts] || M.FONTS.modern;
    const art = page.art || artDirection(project), family = art.id, H = fmt.h, cover = page.kind === 'cover';
    const c = document.createElement('canvas'); c.width = Math.round(fmt.w * scale); c.height = Math.round(H * scale);
    const ctx = c.getContext('2d'); ctx.scale(scale, scale);
    const primary = U.normHex(project.style.primary), accent = U.normHex(project.style.accent), paper = U.normHex(project.style.bg || '#F5F3EE');
    let tone = 'paper';
    if (cover && ['blueprint', 'workshop'].includes(family) || page.kind === 'positions' && family !== 'atelier' || page.kind === 'benefits' && family === 'editorial' || page.kind === 'contact' && ['editorial', 'blueprint', 'collage'].includes(family)) tone = 'primary';
    if (cover && family === 'signal' || page.kind === 'benefits' && family === 'collage' || page.kind === 'contact' && ['signal', 'workshop'].includes(family)) tone = 'accent';
    const bg = tone === 'primary' ? primary : tone === 'accent' ? accent : paper;
    const ink = U.ensureContrast(tone === 'paper' ? project.style.text : U.onColor(bg), bg, 7), dark = U.isDark(bg);
    const signal = U.ensureContrast(accent, bg, 3), quiet = U.mix(ink, bg, .40), faint = U.rgba(ink, .16);
    const rect = (x, y, w, h, color, radius = 0) => { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); };
    const path = (points, color, fill = false, width = 2) => {
      ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (fill) { ctx.closePath(); ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
    };
    const line = (text, x, y, size, font, color, width = 912) => {
      E.setFont(ctx, font, size); while (ctx.measureText(text).width > width && size > 16) E.setFont(ctx, font, --size);
      ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.fillText(text, x, y, width);
    };
    const circle = (x, y, r, color, fill = true, width = 2) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = width; fill ? ctx.fill() : ctx.stroke(); };
    const arrow = (x, y, color, length = 36) => path([[x, y], [x + length, y], [x + length - 14, y - 14], [x + length, y], [x + length - 14, y + 14]], color, false, 3);
    const drawing = (r, color = ink, fill = bg, mode = 'line', seed = art.seed) => {
      if (!r || r.w <= 0 || r.h <= 0) return;
      RS.carouselArt?.draw(ctx, { trade: art.trades[(page.index - 1) % art.trades.length] || art.trade, ...r, ink: color, accent: U.ensureContrast(accent, fill, 2.5), paper: fill, seed, mode });
    };
    rect(0, 0, 1080, H, bg);
    // Each family has its own page furniture and pacing. Details stay in the
    // margins and reserved drawing fields, leaving the reading surface clear.
    if (family === 'blueprint') {
      ctx.save(); ctx.strokeStyle = U.rgba(ink, .055); ctx.lineWidth = 1;
      for (let x = 28 + art.variant * 8; x < 1080; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }
      ctx.restore();
      for (const [x, y] of [[52, 146], [1028, 146], [52, H - 132], [1028, H - 132]]) { path([[x - 12, y], [x + 12, y]], signal); path([[x, y - 12], [x, y + 12]], signal); }
      path([[52, 162], [52, H - 150]], faint); path([[1028, 162], [1028, H - 150]], faint);
    } else if (family === 'signal') {
      rect(0, 0, 25, H, primary);
      ctx.save(); ctx.beginPath(); ctx.rect(0, H - 400, 25, 350); ctx.clip();
      for (let y = H - 420; y < H; y += 50) path([[0, y], [25, y + 25], [25, y + 49], [0, y + 24]], accent, true);
      ctx.restore();
      path([[1020, 172], [1020, 222], [970, 222]], ink, false, 5);
    } else if (family === 'workshop') {
      rect(0, 0, 1080, 12, accent); rect(34, 174, 8, 86, signal);
      for (let y = 292; y < H - 160; y += 24) path([[34, y], [42, y]], faint);
    } else if (family === 'collage') {
      path([[22, 164], [42, 174], [28, 188], [48, 198], [34, 214]], signal, false, 3);
      rect(1016, H - 310, 28, 146, signal);
      for (let x = 84; x < 280; x += 12) rect(x, H - 116, x % 24 === 0 ? 4 : 1, 14, ink);
    } else if (family === 'atelier') {
      path([[52, 152], [52, H - 130], [1028, H - 130], [1028, 152]], faint);
      circle(996, 150, 3, signal);
    } else {
      rect(0, 0, 1080, 10, accent); path([[36, 174], [36, H - 164]], faint);
    }
    const photoRect = page.photoRect;
    if (photoRect && photoRect.h > 0) {
      const clip = (g) => {
        g.beginPath();
        if (page.photoShape === 'cut') { const cut = 42 + art.variant * 16; g.moveTo(photoRect.x + cut, photoRect.y); g.lineTo(photoRect.x + photoRect.w, photoRect.y); g.lineTo(photoRect.x + photoRect.w, photoRect.y + photoRect.h - cut); g.lineTo(photoRect.x + photoRect.w - cut, photoRect.y + photoRect.h); g.lineTo(photoRect.x, photoRect.y + photoRect.h); g.lineTo(photoRect.x, photoRect.y + cut); g.closePath(); }
        else g.rect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
      };
      if (family === 'collage') rect(photoRect.x - 12, photoRect.y + 16, photoRect.w + 24, photoRect.h + 8, U.mix(primary, bg, .85));
      if (images.photo && page.photo !== false) {
        E.photo({ ctx, project: { ...project, photo: page.photo || project.photo }, fmt, images: { photo: images.photo }, report: { photoUpscale: 0 }, scale, hit() {} }, photoRect, clip);
      } else {
        ctx.save(); clip(ctx); ctx.clip();
        const field = tone === 'primary' ? U.mix(primary, paper, .08) : U.mix(accent, paper, .87);
        rect(photoRect.x, photoRect.y, photoRect.w, photoRect.h, field);
        drawing({ x: photoRect.x + 20, y: photoRect.y + 16, w: photoRect.w - 40, h: photoRect.h - 32 }, U.ensureContrast(primary, field, 7), field, 'solid'); ctx.restore();
      }
      if (family === 'blueprint') {
        const r = photoRect; path([[r.x - 12, r.y], [r.x - 26, r.y], [r.x - 26, r.y + r.h], [r.x - 12, r.y + r.h]], signal);
        for (let y = r.y; y <= r.y + r.h; y += 48) path([[r.x - 30, y], [r.x - 22, y]], signal);
      }
      if (family === 'atelier') path([[photoRect.x - 10, photoRect.y - 10], [photoRect.x + photoRect.w + 10, photoRect.y - 10], [photoRect.x + photoRect.w + 10, photoRect.y + photoRect.h + 10]], signal, false, 1);
      if (family === 'collage') {
        ctx.save(); ctx.translate(photoRect.x + 60 + art.variant * 70, photoRect.y - 6); ctx.rotate(-.08); rect(-32, -11, 144, 30, U.rgba(accent, .88)); ctx.restore();
      }
      // A small original drawing accompanies photography on the wide covers.
      if (cover && images.photo && page.photo !== false && !page.artRect && ['editorial', 'signal', 'workshop'].includes(family)) {
        const r = { x: photoRect.x + photoRect.w - 230, y: photoRect.y + photoRect.h - 220, w: 196, h: 196 };
        rect(r.x - 8, r.y - 8, r.w + 16, r.h + 16, paper);
        drawing(r, U.ensureContrast(primary, paper, 7), paper, 'line');
      }
    }
    if (!cover || !photoRect || images.photo && page.photo !== false) drawing(page.artRect, ink, bg, family === 'collage' ? 'solid' : 'line');
    // Brand settings use the same source/tint/crop rules as the image editor.
    if (project.show.logo) {
      const logoScale = U.clamp(project.style.logoScale || 1, .5, 1.8);
      if (images.logo) {
        const img = images.logo, k = Math.min(300 * logoScale / img.width, Math.min(70, 56 * logoScale) / img.height);
        const tone = project.style.logoTone || 'auto';
        const plate = tone === 'white' ? U.ensureContrast(primary, '#FFFFFF', 7) : tone === 'dark' || tone === 'original' ? '#FFFFFF' : bg;
        if (plate !== bg) rect(72, 38, img.width * k + 24, img.height * k + 24, plate, 4);
        ctx.drawImage(E.logoSource ? E.logoSource(img, plate, tone) : img, 84, 50, img.width * k, img.height * k);
      } else line(project.brand.name || '', 84, 63, 28 * logoScale, fonts.strong || fonts.body, ink, 600);
    }
    const folio = String(page.index).padStart(2, '0'), total = String(page.total).padStart(2, '0');
    line(folio, 882, 49, 44, fonts.head, ink, 70); line('/ ' + total, 949, 65, 23, fonts.body, quiet, 68);
    if (family !== 'workshop') path([[84, 132], [996, 132]], faint, false, family === 'atelier' ? 1 : 2);
    const tx = page.titleX ?? page.bodyX ?? 84;
    if (family === 'blueprint') path([[tx, page.titleTop - 14], [tx + 36, page.titleTop - 14]], signal, false, 3);
    else if (family === 'signal') rect(tx, page.titleTop - 18, 48, 6, ink);
    else if (family === 'editorial') circle(tx + 4, page.titleTop - 13, 4, signal);
    page.titleLines.forEach((text, i) => line(text, tx, page.titleTop + i * Math.ceil(page.titleSize * 1.15), page.titleSize, cover ? fonts.strong || fonts.body : fonts.head, ink, page.titleWidth || 912));
    if (page.itemCards) {
      page.itemCards.forEach((card) => {
        const { x, y, w, h } = card;
        const face = family === 'collage' ? paper : U.mix(bg, ink, dark ? .055 : .025), cardInk = family === 'collage' ? U.ensureContrast(project.style.text, paper, 7) : ink;
        if (family === 'collage') { rect(x + 6, y + 7, w, h, U.rgba(primary, .17)); rect(x, y, w, h, face); }
        else if (family === 'blueprint') { rect(x, y, w, h, face); path([[x, y + h], [x, y], [x + w, y], [x + w, y + h], [x, y + h]], faint); }
        else if (family === 'workshop') { rect(x, y, w, h, face); rect(x, y, 5, h, signal); }
        else { path([[x, y], [x + w, y]], U.rgba(cardInk, .32), false, family === 'signal' ? 4 : 1); }
        const number = String(card.number).padStart(2, '0'), nx = x + 26, ny = y + (page.grid ? 20 : 23);
        line(number, nx, ny, page.grid ? 36 : 40, fonts.head, U.ensureContrast(accent, face, 3), 68);
        if (page.grid) arrow(x + w - 62, y + 38, U.ensureContrast(accent, face, 3), 28);
        E.setFont(ctx, fonts.body, card.size); ctx.fillStyle = cardInk; ctx.textBaseline = 'top';
        card.lines.forEach((text, i) => ctx.fillText(text, card.textX, card.textY + i * card.lineHeight));
      });
    } else {
      if (page.kind === 'contact') path([[page.bodyX, page.top - 18], [page.bodyX + Math.min(360, page.bodyWidth), page.top - 18]], signal, false, 3);
      E.setFont(ctx, cover ? fonts.head : fonts.body, page.size); ctx.fillStyle = ink; ctx.textBaseline = 'top';
      page.lines.forEach((text, i) => ctx.fillText(text, page.bodyX, page.top + i * page.lineHeight));
    }
    if (page.qr) {
      const y = H - 410, r = page.qrRect || { x: 744, y: H - 390, w: 230, h: 230 };
      if (page.layout !== 'bottom') {
        const qbg = U.isDark(bg) ? paper : primary, qink = U.ensureContrast(U.onColor(qbg), qbg, 7);
        rect(84, y, 912, 270, qbg, family === 'atelier' ? 0 : 6);
        const locale = page.locale || project.locale;
        line(M.STOCK.scanHint[locale] || M.STOCK.scanHint['pt-PT'], 116, y + 45, 38, fonts.head, qink, 570);
        line(M.STOCK.apply[locale] || M.STOCK.apply['pt-PT'], 116, y + 103, 30, fonts.body, qink, 570);
        arrow(116, y + 201, U.ensureContrast(accent, qbg, 3), 60);
      }
      E.drawQR({ ctx, theme: { primary }, hit() {} }, page.qr, r.x, r.y, r.w);
    }
    // Shared folio connects the sequence; the current page is a real position,
    // never an invented statistic or label that could be mistaken for the offer.
    if (family !== 'collage') path([[84, H - 114], [996, H - 114]], faint);
    if (project.show.logo) line(project.brand.tagline || '', 84, H - 83, 23, fonts.body, quiet, 770);
    arrow(950, H - 67, ink);
    const gap = page.total <= 30 ? 7 : 0, width = (912 - gap * (page.total - 1)) / page.total;
    for (let i = 0; i < page.total; i++) rect(84 + i * (width + gap), H - 31, width, i === page.index - 1 ? 5 : 2, i < page.index ? signal : faint);
    return c;
  }
  const png = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Não foi possível criar a imagem.')), 'image/png'));
  // Match the actual 30 fps export grid, including the final encoded frame.
  const frameTime = (prepared, time) => U.clamp(Math.round((Number.isFinite(Number(time)) ? Number(time) : 0) * 30), 0, Math.max(0, Math.ceil((prepared?.timeline?.duration || 0) * 30) - 1)) / 30;
  function videoMoments(prepared) {
    const labels = { H: 'Abertura', I: 'Introdução', M: 'Vantagens', V: 'Fotografia', D: 'Destaques', L: 'Vagas', C: 'WhatsApp', K: 'Contactos', O: 'Fecho', F: 'Frase final',
      hook: 'Abertura', fan: 'Fotografias', benefit: 'Vantagem', benefitLong: 'Vantagem', counter: 'Oferta', sphere: 'Fotografias', wall: 'Vagas', tunnel: 'Fotografias', end: 'Contactos' };
    return (prepared?.acts || prepared?.timeline?.scenes || []).filter((s) => s.end > s.start).map((s, i) => ({ time: frameTime(prepared, s.start), label: `${i + 1}. ${labels[s.kind] || 'Momento'}`, end: s.end }));
  }
  function renderVideoCover(project, prepared, options, scale = 1) {
    if (!prepared || prepared.fmt?.id !== 'story') throw new Error('Prepare o vídeo em 9:16 para escolher a capa.');
    const c = document.createElement('canvas'); c.width = Math.round(1080 * scale); c.height = Math.round(1920 * scale);
    const ctx = c.getContext('2d'), time = frameTime(prepared, options.time), title = String(options.title || '').slice(0, 80).trim();
    RS.motion.render(ctx, prepared, { t: time, scale });
    if (title) {
      ctx.save(); ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const font = (M.FONTS[project.video.font || project.style.fonts] || M.FONTS.modern).head;
      let size = 64, lines;
      do { RS.engine.setFont(ctx, font, size); lines = wrap(title, (s) => ctx.measureText(s).width, 880); if (lines.length <= 3 || size <= 32) break; size--; } while (true);
      const lineHeight = Math.ceil(size * 1.2), h = lines.length * lineHeight + 56, y = options.placement === 'top' ? 270 : 1640 - h;
      ctx.fillStyle = 'rgba(0,0,0,0.82)'; RS.engine.roundRect(ctx, 72, y, 936, h, 20); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      lines.forEach((line, i) => ctx.fillText(line, 540, y + 28 + i * lineHeight)); ctx.restore();
    }
    return c;
  }
  function check(signal) { if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError'); }
  function checks(project, options) {
    if (!RS.workflow) return [];
    const o = settings(project, options), campaign = options.mode === 'campaign', kinds = [];
    if (!campaign || ['feed', 'story', 'cover', 'carousel', 'text'].some((k) => o.parts[k])) kinds.push('image');
    if (campaign && o.parts.video) kinds.push('video');
    const messages = kinds.flatMap((kind) => RS.workflow.preflight(project, { kind, combos: o.locales.map((l) => ({ l, f: kind === 'video' ? 'story' : o.format })) }))
      .filter((c) => c.id !== 'photo' || campaign && (o.parts.feed || o.parts.story || o.parts.cover));
    for (const locale of o.locales) if (authored(project, locale) && authored(project, locale).source !== carouselSource(project, locale)) messages.push({ text: `${M.localeInfo(locale).short}: o carrossel personalizado pode conter dados antigos. Reveja as páginas após alterar a oferta ou os contactos.` });
    return [...new Map(messages.map((c) => [c.text, c])).values()];
  }
  async function packageFiles(project, options, services = {}) {
    const p = M.normalize(project), o = settings(p, options), campaign = options.mode === 'campaign';
    const { signal, images = {}, videoPhotos, onProgress = () => {}, yieldUI = () => new Promise((r) => setTimeout(r, 0)) } = services;
    const files = [], warnings = checks(p, options).map((c) => c.text), parts = campaign ? o.parts : { carousel: true, text: true };
    if (!o.locales.length) throw new Error('Escolha pelo menos uma língua.');
    if (!Object.values(parts).some(Boolean)) throw new Error('Escolha pelo menos uma peça.');
    if (parts.video && !(await RS.video.support()).method) throw new Error('Este navegador não cria vídeo. Desmarque o vídeo ou use outro navegador.');
    let bytes = 0;
    async function add(name, blob) {
      check(signal); const data = new Uint8Array(await blob.arrayBuffer()); check(signal);
      bytes += data.length;
      if (bytes > 768 * 1024 * 1024) throw new Error('O pacote excede 768 MB. Exporte menos línguas ou peças de cada vez.');
      files.push({ name, bytes: data });
    }
    function noteReports(kind, locale, format, detail) {
      if (!RS.workflow) return;
      for (const c of RS.workflow.preflight(p, { kind, combos: [{ l: locale, f: format }], reports: [{ l: locale, f: format, ...detail }] })) if (!warnings.includes(c.text)) warnings.push(c.text);
    }
    const imageBlob = services.imageBlob || (async (format, locale) => {
      const rendered = RS.engine.renderToCanvas(p, { format, locale, images });
      noteReports('image', locale, format, { report: rendered.report });
      return png(rendered.canvas);
    });
    const slideBlob = services.slideBlob || (async (page) => png(renderSlide(p, page, await slideImages(p, page, images))));
    const plans = {}, covers = {}, preparedVideos = new Map();
    async function motionFor(locale) {
      if (!preparedVideos.has(locale)) {
        const photos = p.video.motion === 'poster' ? { hero: null, cards: [] } : await videoPhotos(p, images); check(signal);
        preparedVideos.set(locale, RS.motion.prepare(p, { format: 'story', locale, images, photos }));
      }
      return preparedVideos.get(locale);
    }
    for (const locale of o.locales) {
      check(signal);
      for (const [key, format] of [['feed', 'portrait'], ['story', 'story'], ['cover', 'story']]) if (parts[key]) {
        onProgress(`${M.localeInfo(locale).short} · ${PARTS[key]}`); await yieldUI(); check(signal);
        const cover = key === 'cover' && p.video.cover?.[locale];
        if (cover) {
          const prepared = await motionFor(locale), selected = { ...cover, time: frameTime(prepared, cover.time) };
          if (Math.abs(selected.time - cover.time) > 1 / 30) warnings.push(`${M.localeInfo(locale).short}: o instante da capa foi ajustado à duração atual. Reveja o fotograma.`);
          covers[locale] = { type: 'frame', ...selected };
          await add(`${locale}/${key}.png`, services.coverBlob ? await services.coverBlob(p, prepared, selected) : await png(renderVideoCover(p, prepared, selected)));
        } else { if (key === 'cover') covers[locale] = { type: 'poster' }; await add(`${locale}/${key}.png`, await imageBlob(format, locale)); }
      }
      if (parts.carousel) {
        plans[locale] = plan(p, locale, o.format, services.measure);
        for (const page of plans[locale]) {
          onProgress(`${M.localeInfo(locale).short} · diapositivo ${page.index}/${page.total}`); await yieldUI(); check(signal);
          await add(`${locale}/carrossel/${String(page.index).padStart(3, '0')}.png`, await slideBlob(page, locale));
        }
      }
      if (parts.text) await add(`${locale}/publicacao.txt`, new Blob([M.publicationText(p, locale)], { type: 'text/plain;charset=utf-8' }));
      if (parts.video) {
        onProgress(`${M.localeInfo(locale).short} · A preparar vídeo…`); await yieldUI(); check(signal);
        const vid = p.video, prepared = await motionFor(locale);
        noteReports('video', locale, 'story', { prepared });
        const audio = vid.sound === 'generated' ? await RS.sound.renderGenerated(prepared.timeline) : vid.sound === 'own' ? await RS.assets.fittedSound(vid.ownSound, prepared.timeline.duration) : null;
        check(signal);
        const blob = await RS.video.create(p, { format: 'story', locale, images, duration: prepared.timeline.duration, style: vid.style, signal, audio,
          frame: (ctx, t) => RS.motion.render(ctx, prepared, { t, scale: 1 }), onProgress: (x) => onProgress(`${M.localeInfo(locale).short} · Vídeo ${Math.round(x * 100)}%`) });
        if (blob.silent && vid.sound !== 'none') throw new Error('O vídeo ficou sem o som escolhido. Escolha «Sem som» no editor ou use um navegador com suporte de áudio.');
        await add(`${locale}/video.${RS.video.extOf(blob)}`, blob);
      }
    }
    if (parts.project) { onProgress('A incluir o projeto portátil…'); await yieldUI(); check(signal); await add('projeto.anuncio', await RS.assets.exportProjectFile(p)); }
    const manifest = { v: 1, project: p.name, createdAt: new Date().toISOString(), locales: o.locales, parts, carouselFormat: o.format,
      slides: Object.fromEntries(Object.entries(plans).map(([l, pages]) => [l, pages.length])), covers, files: files.map((f) => ({ name: f.name, bytes: f.bytes.length })), warnings };
    await add('manifesto.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    await add('LEIA-ME.txt', new Blob(['Recruitment Studio — ' + p.name + '\n\nUma pasta por língua. Carrosséis: publicar pela ordem numérica.\npublicacao.txt contém exatamente o texto guardado nessa língua.\nA capa usa o fotograma e a chamada escolhidos para essa língua, ou a composição estática quando não foi escolhida uma capa. O manifesto regista a origem e o instante.\nO vídeo usa o estilo, duração e som do editor; a extensão indica o formato efetivamente criado.\nprojeto.anuncio permite continuar a editar noutro aparelho.\nConfirme contactos, traduções e a pré-visualização antes de publicar.\n', warnings.length ? '\nAvisos:\n' + warnings.map((w) => '- ' + w).join('\n') : ''], { type: 'text/plain;charset=utf-8' }));
    check(signal); onProgress('A preparar o ZIP…'); await yieldUI(); check(signal);
    return { blob: U.zip(files), files, manifest, name: `${U.slug(p.name)}-${campaign ? 'campanha' : 'carrossel'}.zip` };
  }
  return { PARTS, settings, artDirection, wrap, plan, renderSlide, slideImages, personalize, changeSlide, authored, carouselSource, frameTime, videoMoments, renderVideoCover, png, checks, packageFiles };
})();
