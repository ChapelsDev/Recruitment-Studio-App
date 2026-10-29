// Export: where each piece goes (destinations), the carousel's files (its slides
// drawn by RS.slides) and the all-or-nothing campaign package («Pacote completo»).
window.RS = window.RS || {};
RS.production = (() => {
  const M = RS.model, U = RS.util;
  const PARTS = { feed: 'Feed · 1080 × 1350', story: 'Story · 1080 × 1920', video: 'Vídeo · 9:16, com o som escolhido', cover: 'Capa estática do Reel · 9:16', carousel: 'Carrossel numerado', text: 'Texto da publicação por língua', project: 'Projeto portátil com imagens e som' };
  // «Para onde?»: each piece starts from where it goes; the destination picks the
  // format(s) ('piece': the carousel's own format). note: shown when chosen;
  // minSlides: fewer slides than this get a warning.
  const DESTINATIONS = {
    image: [
      { id: 'feed', label: 'Feed Instagram/Facebook', formats: ['portrait'] },
      { id: 'stories', label: 'Stories / Estado do WhatsApp', formats: ['story'] },
      { id: 'square', label: 'Quadrado', formats: ['square'] },
    ],
    carousel: [
      { id: 'instagram', label: 'Instagram carrossel', formats: ['piece'] },
      { id: 'facebook', label: 'Facebook', formats: ['portrait'], note: 'No Facebook, várias fotografias publicam-se em grelha; o carrossel que desliza precisa de um link por cartão.' },
      { id: 'tiktok', label: 'TikTok (fotografias)', formats: ['story'], minSlides: 4 },
      { id: 'stories', label: 'Stories / Estado do WhatsApp', formats: ['story'] },
    ],
    video: [
      { id: 'reels', label: 'Reels / Stories / TikTok / Estado do WhatsApp', formats: ['story'] },
      { id: 'feed', label: 'Feed', formats: ['portrait'] },
      { id: 'square', label: 'Quadrado', formats: ['square'] },
    ],
  };
  // What to say about a destination for this many slides (images and videos: one each).
  function destinationNotes(piece, id, slides = 1) {
    const d = (DESTINATIONS[piece] || []).find((x) => x.id === id);
    if (!d) return [];
    const notes = d.note ? [d.note] : [];
    if (d.minSlides && slides < d.minSlides) notes.push(`O TikTok pede pelo menos ${d.minSlides} imagens.`);
    return notes;
  }
  function settings(project, value = project.delivery || {}) {
    return {
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
  const png = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Não foi possível criar a imagem.')), 'image/png'));
  const encode = (canvas, type) => (type === 'jpg' ? new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Não foi possível criar a imagem.')), 'image/jpeg', 0.93)) : png(canvas));
  // One slide at full size, drawn exactly as the stage draws it.
  async function slideBlob(P, index, type = 'png') {
    const c = document.createElement('canvas'); c.width = P.fmt.w; c.height = P.fmt.h;
    RS.slides.render(c.getContext('2d'), P, index, { scale: 1 });
    return encode(c, type);
  }
  // The carousel's photos (its style's own choice), as the stage uses them.
  const carouselPhotos = (project, images) => (RS.slides && RS.slides.photos ? RS.slides.photos(project, images) : Promise.resolve([]));
  // The carousel of each language: <locale>/carrossel/01.png … (from 01, two
  // digits) and <locale>/publicacao.txt. format: the carousel's own when omitted.
  async function carouselFiles(project, o = {}) {
    const p = M.normalize(project), c = M.cleanCarousel(p.carousel, p);
    const { locales = [p.locale], format = c.format, type = 'png', images = {}, onProgress = () => {}, signal } = o;
    const draw = o.slideBlob || slideBlob;
    const full = o.photos || await carouselPhotos(p, images); check(signal);
    const files = [], counts = {};
    const ext = type === 'jpg' ? 'jpg' : 'png';
    for (const locale of locales) {
      check(signal);
      const P = RS.slides.prepare(p, { format, locale, images, photos: { hero: null, cards: [], full } });
      counts[locale] = P.slides.length;
      for (let i = 0; i < P.slides.length; i++) {
        onProgress(`${M.localeInfo(locale).short} · diapositivo ${i + 1}/${P.slides.length}`, (i + 1) / P.slides.length);
        if (o.yieldUI) await o.yieldUI();
        check(signal);
        const blob = await draw(P, i, ext); check(signal);
        files.push({ name: `${locale}/carrossel/${String(i + 1).padStart(2, '0')}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      files.push({ name: `${locale}/publicacao.txt`, bytes: new TextEncoder().encode(M.publicationText(p, locale)) });
    }
    files.counts = counts;
    return files;
  }
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
    const messages = kinds.flatMap((kind) => RS.workflow.preflight(project, { kind, combos: o.locales.map((l) => ({ l, f: kind === 'video' ? 'story' : 'portrait' })) }))
      .filter((c) => c.id !== 'photo' || campaign && (o.parts.feed || o.parts.story || o.parts.cover));
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
    const carouselFormat = M.cleanCarousel(p.carousel, p).format;
    const slides = {}, covers = {}, preparedVideos = new Map();
    const carouselFull = parts.carousel ? await (services.carouselPhotos || carouselPhotos)(p, images) : [];
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
        // the same files as «Exportar» › Carrossel (the text is added below with the other parts)
        const own = await carouselFiles(p, { locales: [locale], format: carouselFormat, images, photos: carouselFull, signal, onProgress, yieldUI, slideBlob: services.slideBlob });
        slides[locale] = own.counts[locale];
        for (const f of own) if (f.name.includes('/carrossel/')) await add(f.name, new Blob([f.bytes]));
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
    const manifest = { v: 2, project: p.name, createdAt: new Date().toISOString(), locales: o.locales, parts, carouselFormat, carouselStyle: M.carouselRecipe(p),
      slides, covers, files: files.map((f) => ({ name: f.name, bytes: f.bytes.length })), warnings };
    await add('manifesto.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    await add('LEIA-ME.txt', new Blob(['Recruitment Studio — ' + p.name + '\n\nUma pasta por língua. Carrosséis: publicar pela ordem numérica.\npublicacao.txt contém exatamente o texto guardado nessa língua.\nA capa usa o fotograma e a chamada escolhidos para essa língua, ou a composição estática quando não foi escolhida uma capa. O manifesto regista a origem e o instante.\nO vídeo usa o estilo, duração e som do editor; a extensão indica o formato efetivamente criado.\nprojeto.anuncio permite continuar a editar noutro aparelho.\nConfirme contactos, traduções e a pré-visualização antes de publicar.\n', warnings.length ? '\nAvisos:\n' + warnings.map((w) => '- ' + w).join('\n') : ''], { type: 'text/plain;charset=utf-8' }));
    check(signal); onProgress('A preparar o ZIP…'); await yieldUI(); check(signal);
    return { blob: U.zip(files), files, manifest, name: `${U.slug(p.name)}-${campaign ? 'campanha' : 'carrossel'}.zip` };
  }
  return { PARTS, DESTINATIONS, destinationNotes, settings, wrap, frameTime, videoMoments, renderVideoCover, png, checks, carouselFiles, packageFiles };
})();
