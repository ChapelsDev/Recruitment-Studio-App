// Interface of the carousel piece: the piece switch (Imagem · Carrossel ·
// Vídeo), the carousel prepared from the ad (RS.slides) and its stage — the
// current slide large with its neighbours, arrows, dots, swipe, the formats.
window.RS = window.RS || {};
RS.carouselUI = ({ Icon, queueThumb, afterPaint, Group, VideoTexts, PhotoLibrary, VideoPhotos, FramePhoto, FocusThumb, BodyLayer }) => {
  const { html, useState, useEffect, useRef } = window.htmPreact;
  const M = RS.model;
  const FORMAT_LABEL = { portrait: '4:5', square: '1:1', feed34: '3:4', story: '9:16' };
  const PIECES = [['image', 'Imagem', 'image'], ['carousel', 'Carrossel', 'layers'], ['video', 'Vídeo', 'video']];
  const carouselOf = (p) => (p.carousel && p.carousel.v === 2 ? p.carousel : M.cleanCarousel(p.carousel, p));

  function PieceSwitch({ mode, onChange }) {
    return html`<div class="seg mode-switch piece-switch" role="radiogroup" aria-label="Peça">
      ${PIECES.map(([id, label, icon]) => html`<button key=${id} type="button" role="radio" aria-checked=${mode === id} class=${mode === id ? 'on' : ''}
        aria-label=${label} onClick=${() => { if (mode !== id) onChange(id); }}><${Icon} name=${icon} size=${16} /><span class="hide-sm">${label}</span></button>`)}
    </div>`;
  }

  // Everything the carousel reads from the ad: prepared again only when this changes.
  const carouselKey = (p) => JSON.stringify([carouselOf(p), p.texts, p.offer, p.whatsapp, p.waTemplates, p.brand, p.logo, p.photo, p.style, p.show,
    p.locales, p.locale, p.trades, p.template, p.video && { motion: p.video.motion, show: p.video.show, texts: p.video.texts }]);
  // Photos only for the styles that use them (Notificações' wallpaper): the trades' or the chosen ones.
  const photoSets = new Map();
  function carouselPhotos(project, images) {
    const c = carouselOf(project);
    const def = RS.motion.styleOf(M.carouselRecipe({ ...project, carousel: c })).recipe;
    if (!def || !def.photos) return Promise.resolve([]);
    // (asked again once the ad's own photo has loaded: it is one of the set)
    const key = JSON.stringify([c.style, c.photos, project.trades, project.photo && project.photo.asset, !!(images && images.photo)]);
    if (!photoSets.has(key)) {
      if (photoSets.size > 6) photoSets.clear();
      photoSets.set(key, RS.slides.photos({ ...project, carousel: c }, images));
    }
    return photoSets.get(key);
  }
  // The carousel prepared after the frame (a tap is answered first); the stage
  // keeps the last carousel until the new one is ready (no flash per key).
  function useCarousel(project, images, on) {
    const [prep, setPrep] = useState(null);
    // (worked out only while the carousel is on screen)
    const key = on ? carouselKey(project) : '';
    useEffect(() => {
      if (!on || !RS.slides || !RS.motion.styleOf(M.carouselRecipe({ ...project, carousel: carouselOf(project) })).recipe) return undefined;
      let live = true;
      (async () => {
        await afterPaint();
        const full = await carouselPhotos(project, images);
        if (!live) return;
        const p = { ...project, carousel: carouselOf(project) };
        const P = RS.slides.prepare(p, { format: p.carousel.format, locale: p.locale, images: images || {}, photos: { hero: null, cards: [], full } });
        P.carouselStyle = p.carousel.style;
        if (live) setPrep({ key, P });
      })().catch((err) => console.error(err));
      return () => { live = false; };
    }, [on, key, images]);
    return prep ? prep.P : null;
  }

  const slideName = (s) => (s.kind === 'X' ? 'Diapositivo de texto' : M.CAROUSEL_BLOCK_LABELS[s.kind] || '');
  function drawSlide(canvas, P, index, width) {
    if (!canvas || !P || !P.slides[index]) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = width / P.fmt.w;
    canvas.width = Math.round(P.fmt.w * k * dpr);
    canvas.height = Math.round(P.fmt.h * k * dpr);
    // its size on screen in CSS pixels (the bitmap has the device's pixels)
    canvas.style.width = `${Math.round(width)}px`;
    canvas.style.height = `${Math.round(width * P.fmt.h / P.fmt.w)}px`;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    RS.slides.render(ctx, P, index, { scale: k * dpr });
    canvas.dataset.style = P.carouselStyle || '';
    canvas.dataset.index = String(index);
  }

  function CarouselStage({ project, update, P, mobile, onField, topRight, tools, deal = false }) {
    const c = carouselOf(project);
    const [at, setAt] = useState(0);
    // «Balão» (Ilustrativo, from the image piece): the poster deals its slides, once
    const [dealing, setDealing] = useState(deal);
    useEffect(() => { if (!dealing) return undefined; const t = setTimeout(() => setDealing(false), 1000); return () => clearTimeout(t); }, [dealing]);
    const n = P ? P.slides.length : 0;
    const i = Math.min(at, Math.max(0, n - 1));
    const wrap = useRef(), main = useRef(), prev = useRef(), next = useRef(), press = useRef(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    useEffect(() => {
      const el = wrap.current;
      if (!el) return undefined;
      const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
      measure();
      const ro = window.ResizeObserver ? new ResizeObserver(measure) : null;
      if (ro) ro.observe(el);
      return () => { if (ro) ro.disconnect(); };
    }, []);
    const fmt = M.FORMATS[c.format] || M.FORMATS.portrait;
    // the current slide fits the stage; the neighbours peek at two thirds of it
    // (once measured the height is real, even a small one: the slide never runs out of the stage)
    const tall = box.w ? box.h : 600;
    const mainW = Math.max(mobile ? 40 : 120, Math.min(box.w * (mobile ? 0.86 : 0.56) || 320, (tall - (mobile ? 12 : 40)) * fmt.w / fmt.h));
    const sideW = Math.round(mainW * 0.62);
    useEffect(() => {
      if (!P) return undefined;
      drawSlide(main.current, P, i, mainW);
      const jobs = [[prev, i - 1], [next, i + 1]].map(([ref, j]) => {
        const job = {};
        queueThumb(job, () => { if (j >= 0 && j < n) drawSlide(ref.current, P, j, sideW); });
        return job;
      });
      return () => jobs.forEach((j) => queueThumb.cancel && queueThumb.cancel(j));
    }, [P, i, mainW, sideW, n]);
    const go = (j) => setAt(Math.max(0, Math.min(n - 1, j)));
    const setFormat = (f) => update((p) => { p.carousel = { ...carouselOf(p), format: f }; });
    // the press keeps the pointer (a finger leaving the slide still ends the swipe);
    // a press the browser cancels is neither a swipe nor a tap
    const down = (e) => {
      press.current = { x: e.clientX, y: e.clientY };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the browser no longer tracks */ }
    };
    const cancel = () => { press.current = null; };
    const up = (e) => {
      const s = press.current; press.current = null;
      if (!s || !P) return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); return; }
      const r = main.current.getBoundingClientRect();
      if (!r.width) return;
      const key = RS.slides.hit(P, i, ((e.clientX - r.left) / r.width) * P.fmt.w, ((e.clientY - r.top) / r.height) * P.fmt.h);
      if (key && onField) onField(key, P.slides[i]);
    };
    const s = P && P.slides[i];
    return html`<div class=${'carousel-stage' + (dealing ? ' dealing' : '')} data-style=${P ? P.carouselStyle : ''}
      onAnimationEnd=${(e) => { if (dealing && e.target.classList.contains('cs-next')) setDealing(false); }}>
      <div class=${'cs-head stage-top' + (mobile ? ' tools-row' : '')}>
        <div class="seg small cs-formats" role="radiogroup" aria-label="Formato do carrossel">
          ${M.CAROUSEL_FORMATS.map((f) => html`<button key=${f} type="button" role="radio" aria-checked=${c.format === f} class=${c.format === f ? 'on' : ''}
            title=${`${M.FORMATS[f].w} × ${M.FORMATS[f].h}`} onClick=${() => setFormat(f)}>${FORMAT_LABEL[f]}</button>`)}
        </div>
        ${P && P.slidePlan && P.slidePlan.few && html`<span class="cs-note" role="status">O Instagram pede pelo menos 2 diapositivos.</span>`}
        <div class="stage-right">${topRight}${tools}</div>
      </div>
      <div class="cs-track" ref=${wrap} tabIndex="0" aria-roledescription="carrossel" aria-label=${s ? `Diapositivo ${i + 1} de ${n}: ${slideName(s)}` : 'Carrossel'}
        onKeyDown=${(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); } }}>
        <canvas ref=${prev} class=${'cs-side cs-prev' + (i > 0 ? '' : ' cs-none')} aria-hidden="true" onClick=${() => go(i - 1)}></canvas>
        <canvas ref=${main} class="cs-main" data-style=${P ? P.carouselStyle : ''} role="img" aria-label=${s ? `Diapositivo ${i + 1}: ${slideName(s)}` : 'A preparar o carrossel…'}
          onPointerDown=${down} onPointerUp=${up} onPointerCancel=${cancel}></canvas>
        <canvas ref=${next} class=${'cs-side cs-next' + (i < n - 1 ? '' : ' cs-none')} aria-hidden="true" onClick=${() => go(i + 1)}></canvas>
        ${!P && html`<span class="cs-wait" role="status">A preparar o carrossel…</span>`}
        ${mobile && html`<button type="button" class="sr-only" aria-label="Diapositivo anterior" disabled=${i <= 0} onClick=${() => go(i - 1)}></button>
          <button type="button" class="sr-only" aria-label="Diapositivo seguinte" disabled=${i >= n - 1} onClick=${() => go(i + 1)}></button>`}
        ${mobile && html`<span class="cs-count cs-badge" aria-live="polite"
          style=${`top:${Math.max(Math.max(0, (box.h - mainW * fmt.h / fmt.w) / 2) + 8, 52)}px;right:${Math.max(0, (box.w - mainW) / 2) + 8}px`}>${n ? html`<strong>${String(i + 1).padStart(2, '0')}</strong> / ${String(n).padStart(2, '0')}` : ''}</span>`}
      </div>
      ${!mobile && html`<div class="cs-nav">
        <button type="button" class="icon-btn" aria-label="Diapositivo anterior" disabled=${i <= 0} onClick=${() => go(i - 1)}><${Icon} name="chevron-left" /></button>
        <span class="cs-count">${n ? html`<strong>${String(i + 1).padStart(2, '0')}</strong> / ${String(n).padStart(2, '0')} · ${slideName(s)}` : ''}</span>
        <button type="button" class="icon-btn" aria-label="Diapositivo seguinte" disabled=${i >= n - 1} onClick=${() => go(i + 1)}><${Icon} name="chevron-right" /></button>
      </div>
      <div class="cs-dots" role="group" aria-label="Diapositivos">
        ${(P ? P.slides : []).map((x, j) => html`<button key=${j} type="button" class=${'cs-dot' + (j === i ? ' on' : '')} aria-label=${`Diapositivo ${j + 1}: ${slideName(x)}`}
          aria-current=${j === i ? 'true' : undefined} onClick=${() => go(j)}></button>`)}
      </div>`}
    </div>`;
  }

  // ---------------------------------------------------------------- «Estilo»
  const STYLE_CARDS = ['ad', ...M.CAROUSEL_STYLE_IDS];
  const styleName = (id) => (id === 'ad' ? 'Do anúncio' : RS.motion.styleOf(id).recipe ? RS.motion.styleOf(id).name : id);
  const setCarousel = (update, patch, coalesce) => update((p) => { p.carousel = { ...carouselOf(p), ...patch }; }, coalesce ? { coalesce } : {});
  // a style's real cover for this ad, drawn after the frame, one card at a time
  // (width: its size on screen; the gallery's «Começar por» draws it larger);
  // a photo style's card shows the ad's photos, as its slides will
  function StyleCover({ project, images, style, width = 112 }) {
    const ref = useRef();
    const key = carouselKey({ ...project, carousel: { ...carouselOf(project), style } });
    useEffect(() => {
      if (!RS.slides) return undefined;
      const job = {};
      let live = true;
      queueThumb(job, () => {
        if (!ref.current) return;
        const q = { ...project, carousel: { ...carouselOf(project), style, cover: style === 'ad' ? 'poster' : 'style', format: 'portrait' } };
        if (!RS.motion.styleOf(M.carouselRecipe(q)).recipe) return;
        carouselPhotos(q, images).then((full) => {
          if (!live || !ref.current) return;
          const P = RS.slides.prepare(q, { format: 'portrait', locale: q.locale, images: images || {}, photos: { hero: null, cards: [], full }, lite: true });
          drawSlide(ref.current, P, 0, width);
        }).catch((err) => console.error(err));
      });
      return () => { live = false; if (queueThumb.cancel) queueThumb.cancel(job); };
    }, [style, key, images, width]);
    return html`<canvas ref=${ref} class="cstyle-cover" aria-hidden="true"></canvas>`;
  }
  const seg = (items, value, onPick, aria) => html`<div class="seg small" role="radiogroup" aria-label=${aria}>
    ${items.map(([v, l, dis]) => html`<button key=${v} type="button" role="radio" aria-checked=${value === v} class=${value === v ? 'on' : ''} disabled=${!!dis}
      onClick=${() => onPick(v)}>${l}</button>`)}</div>`;
  function CarouselStylePanel({ project, update, images, hasPhotos }) {
    const c = carouselOf(project);
    const recommended = M.recommendCarousel(project, project.locale, { photos: hasPhotos });
    const recipe = RS.motion.styleOf(M.carouselRecipe({ ...project, carousel: c }));
    const modes = (recipe.recipe && recipe.bgModes) || ['dark'];
    const in34 = c.format === 'feed34';
    const cover = M.carouselCover({ ...project, carousel: c });
    return html`<div class="panel-inner carousel-panel cstyle-panel">
      <div class="panel-head"><h2>Estilo</h2></div>
      <${Group} title="Estilos" where="carrossel" fold="carousel:styles">
        <div class="cstyle-grid" role="radiogroup" aria-label="Estilo do carrossel">
          ${STYLE_CARDS.map((id) => html`<button key=${id} type="button" role="radio" aria-checked=${c.style === id} data-style=${id}
            class=${'cstyle-card' + (c.style === id ? ' on' : '')} onClick=${() => { if (c.style !== id) setCarousel(update, { style: id, bg: null }); }}>
            <${StyleCover} project=${project} images=${images} style=${id} />
            <span class="cstyle-name">${styleName(id)}</span>
            ${recommended.includes(id) && html`<span class="cstyle-rec">Recomendado</span>`}
          </button>`)}
        </div>
      <//>
      <${Group} title="Capa" where="carrossel" fold="carousel:cover">
        ${seg([['style', 'Capa: do estilo'], ['poster', 'Capa: cartaz do anúncio', in34]], cover, (v) => setCarousel(update, { cover: v, style: v === 'style' && c.style === 'ad' ? M.carouselRecipe(project) : c.style }), 'Capa do carrossel')}
        ${in34 && html`<p class="group-hint">«Capa: cartaz do anúncio» — Indisponível em 3:4: o cartaz não tem formato 3:4.</p>`}
      <//>
      <${Group} title="Cores" where="carrossel" fold="carousel:colors">
        ${seg([['style', 'Do estilo'], ['brand', 'Da marca']], c.colors === 'style' || c.colors === 'brand' ? c.colors : null, (v) => setCarousel(update, { colors: v }), 'Cores do carrossel')}
        <div class="palettes video-palettes" role="radiogroup" aria-label="Paletas prontas">
          ${M.PALETTES.map((pl) => html`<button key=${pl.id} type="button" role="radio" aria-checked=${c.colors === pl.id} class=${'palette' + (c.colors === pl.id ? ' on' : '')}
            title=${pl.name} aria-label=${`Paleta ${pl.name}`} onClick=${() => setCarousel(update, { colors: pl.id })}>
            <span style=${`background:${pl.primary}`}></span><span style=${`background:${pl.accent}`}></span></button>`)}
        </div>
        <label class="field cstyle-accent">Cor de destaque <input type="color" value=${c.accent || '#ff7b35'} onInput=${(e) => setCarousel(update, { accent: e.target.value }, 'carousel:accent')} /></label>
        ${c.accent && html`<button type="button" class="btn link sm" onClick=${() => setCarousel(update, { accent: null })}>Repor a cor de destaque</button>`}
      <//>
      <${Group} title="Letra e fundo" where="carrossel" fold="carousel:type">
        ${seg([['', 'Do estilo'], ...Object.entries(M.FONTS).map(([k, f]) => [k, f.label])], c.font || '', (v) => setCarousel(update, { font: v || null }), 'Letra do carrossel')}
        ${modes.length > 1 && seg(modes.map((m) => [m, m === 'light' ? 'Claro' : 'Escuro']), c.bg || modes[0], (v) => setCarousel(update, { bg: v }), 'Fundo do carrossel')}
      <//>
    </div>`;
  }

  // ---------------------------------------------------------------- «Sequência»
  // the texts each block shows («Textos do vídeo» blocks, for the carousel)
  const ONLY = { H: ['kicker', 'headline'], I: ['intro'], D: ['highlights'], M: ['benefits'], L: ['positions'], V: ['brand'], C: ['chat'], F: ['closing'], K: ['contacts', 'button', 'brand'] };
  function CarouselSequencePanel({ project, update, focus }) {
    const c = carouselOf(project);
    const plan = RS.slides ? RS.slides.plan({ ...project, carousel: c }, project.locale) : { blocks: [], left: [], few: false };
    const keys = plan.blocks.map((b) => b.key);
    const [open, setOpen] = useState(() => (focus && focus.block) || null);
    const drag = useRef(null);
    useEffect(() => {
      if (!focus) return undefined;
      setOpen(focus.block);
      const t = setTimeout(() => { const el = focus.field && document.getElementById(focus.field); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); } }, 80);
      return () => clearTimeout(t);
    }, [focus]);
    const style = RS.motion.styleOf(M.carouselRecipe({ ...project, carousel: c }));
    const move = (key, to) => {
      const list = keys.filter((k) => k !== key);
      list.splice(Math.max(0, Math.min(list.length, to)), 0, key);
      setCarousel(update, { blocks: { ...c.blocks, order: list } });
    };
    // the row's eye is the block's only eye here: showing a block the image
    // hides turns its eye on in the carousel alone (project.carousel.show)
    const toggle = (key) => {
      const b = plan.blocks.find((x) => x.key === key);
      if (!b || !b.hidden) { setCarousel(update, { blocks: { ...c.blocks, hidden: [...c.blocks.hidden, key] } }); return; }
      const patch = { blocks: { ...c.blocks, hidden: c.blocks.hidden.filter((k) => k !== key) } };
      if (b.eye && !RS.motionTimeline.eye({ ...project, carousel: c }, b.eye, 'carousel')) patch.show = { ...(c.show || {}), [b.eye]: true };
      setCarousel(update, patch);
    };
    const addText = () => {
      const id = RS.util.uid();
      const order = [...keys.filter((k) => k !== 'K'), `x:${id}`, ...(keys.includes('K') ? ['K'] : [])];
      setCarousel(update, { extra: [...c.extra, { id }], blocks: { ...c.blocks, order } });
      setOpen(`x:${id}`);
    };
    const setExtra = (id, v) => update((p) => {
      const o = carouselOf(p), code = p.locale;
      const texts = { ...(o.texts || {}) }, cur = { ...(texts[code] || {}) };
      cur.extra = { ...(cur.extra || {}), [id]: v };
      texts[code] = cur;
      p.carousel = { ...o, texts };
    }, { coalesce: `cx:${id}` });
    const removeExtra = (id) => update((p) => {
      const o = carouselOf(p);
      const texts = Object.fromEntries(Object.entries(o.texts || {}).map(([code, t]) => { const e = { ...((t && t.extra) || {}) }; delete e[id]; return [code, { ...t, extra: e }]; }));
      p.carousel = { ...o, extra: o.extra.filter((x) => x.id !== id), texts, blocks: { order: (o.blocks.order || []).filter((k) => k !== `x:${id}`), hidden: o.blocks.hidden.filter((k) => k !== `x:${id}`) } };
    });
    const extraText = (id) => ((((c.texts || {})[project.locale] || {}).extra) || {})[id] || '';
    const rowAt = (e) => { const el = document.elementFromPoint && document.elementFromPoint(e.clientX, e.clientY); const row = el && el.closest && el.closest('.cseq-row'); return row ? keys.indexOf(row.dataset.key) : -1; };
    return html`<div class="panel-inner carousel-panel cseq-panel">
      <div class="panel-head"><h2>Sequência</h2></div>
      ${plan.few && html`<p class="video-note"><${Icon} name="info" size=${15} /> <span>O Instagram pede pelo menos 2 diapositivos: mostre mais um bloco ou acrescente um diapositivo de texto.</span></p>`}
      ${plan.left.length > 0 && html`<p class="video-note"><${Icon} name="info" size=${15} /> <span>Fica de fora (máximo de 20 diapositivos): ${plan.left.map((l) => `${l.count} em «${l.label}»`).join(', ')}.</span></p>`}
      <ol class="cseq-list">
        ${plan.blocks.map((b, i) => {
          const x = b.key.startsWith('x:'), id = x ? b.key.slice(2) : null, isOpen = open === b.key;
          return html`<li key=${b.key} class=${'cseq-row' + (b.hidden ? ' hidden-block' : '') + (isOpen ? ' open' : '')} data-key=${b.key}>
            <div class="cseq-head">
              <button type="button" class="icon-btn cseq-handle" aria-label=${`Mover «${b.label}» (Alt + setas)`} title="Arraste, ou Alt + ↑/↓"
                onKeyDown=${(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(b.key, i + (e.key === 'ArrowUp' ? -1 : 1)); } }}
                onPointerDown=${(e) => { drag.current = { key: b.key }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* a made-up pointer */ } }}
                onPointerUp=${(e) => { const d = drag.current; drag.current = null; if (!d) return; const to = rowAt(e); if (to >= 0 && to !== i) move(d.key, to); }}>
                <${Icon} name="grip-vertical" size=${16} /></button>
              <button type="button" class="cseq-open" aria-expanded=${isOpen} onClick=${() => setOpen(isOpen ? null : b.key)}>
                <span class="cseq-label">${b.label}</span>${b.pages > 1 && html`<span class="cseq-count">${b.pages} diapositivos</span>`}</button>
              <button type="button" class="eye cseq-eye" aria-pressed=${!b.hidden} aria-label=${b.hidden ? `Mostrar «${b.label}»` : `Ocultar «${b.label}»`} onClick=${() => toggle(b.key)}>
                <${Icon} name=${b.hidden ? 'eye-off' : 'eye'} size=${17} /></button>
            </div>
            ${isOpen && html`<div class="cseq-body">
              ${x ? html`<label class="field" for=${`cx-${id}`}>Texto do diapositivo · ${M.localeInfo(project.locale).short}</label>
                <textarea id=${`cx-${id}`} value=${extraText(id)} onInput=${(e) => setExtra(id, e.target.value)} placeholder="Ex.: Começa já na segunda-feira"></textarea>
                <button type="button" class="btn link sm danger-text" onClick=${() => removeExtra(id)}>Retirar este diapositivo</button>`
              : html`<${VideoTexts} project=${project} update=${update} style=${style} piece="carousel" only=${ONLY[b.kind] || []} />`}
            </div>`}
          </li>`;
        })}
      </ol>
      <button type="button" class="btn ghost sm" onClick=${addText}><${Icon} name="plus" size=${15} /> Acrescentar diapositivo de texto</button>
    </div>`;
  }

  // ---------------------------------------------------------------- «Fotos»
  // the carousel's photos as it uses them, each with «Enquadrar» (the video's dialog,
  // writing carousel.photos.focus)
  function CarouselFraming({ project, update, images }) {
    const [list, setList] = useState(null); // [{ id, img }]
    const [open, setOpen] = useState(null);
    const c = carouselOf(project);
    const key = JSON.stringify([c.style, c.photos.mode, c.photos.ids, project.trades, project.photo && project.photo.asset]);
    useEffect(() => {
      let live = true;
      carouselPhotos(project, images).then((imgs) => {
        if (!live) return;
        const out = [];
        for (const img of imgs || []) { const id = img && RS.motion.photoIdOf(img); if (id && !out.some((x) => x.id === id)) out.push({ id, img }); }
        setList(out);
      }).catch(() => { if (live) setList([]); });
      return () => { live = false; };
    }, [key, images]);
    if (!list || !list.length || !FramePhoto) return null;
    const view = M.carouselFocusView(project);
    return html`<div class="video-framing">
      <p class="vf-head">No carrossel: toque numa fotografia para a enquadrar.</p>
      <div class="vf-grid">${list.map((it, i) => html`<button key=${it.id} type="button" class="vf-item" data-photo-id=${it.id}
          aria-label=${`Enquadrar a fotografia ${i + 1} do carrossel`} onClick=${() => setOpen(it)}>
          <${FocusThumb} img=${it.img} focus=${RS.motion.photoFocus(view, it.img) || { x: 0.5, y: 0.4 }} />
          <span class="vf-label"><${Icon} name="crosshair" size=${14} /> Enquadrar</span></button>`)}</div>
      ${open && html`<${BodyLayer}><${FramePhoto} key=${open.id} project=${project} update=${update} photo=${open} piece="carousel" onClose=${() => setOpen(null)} /><//>`}
    </div>`;
  }
  // «Fotos»: the style's photos — the trades' or chosen (library and «As minhas»,
  // as many as the style takes; the video's picker) — and their framing
  function CarouselPhotosPanel({ project, update, images, onStyle }) {
    const c = carouselOf(project);
    const recipe = RS.motion.styleOf(M.carouselRecipe({ ...project, carousel: c }));
    const takes = (recipe.recipe && recipe.recipe.photos) || 0;
    const [choosing, setChoosing] = useState(c.photos.mode === 'chosen');
    const setIds = (ids) => setCarousel(update, { photos: { mode: ids.length ? 'chosen' : 'trades', ids, focus: c.photos.focus || {} } });
    return html`<div class="panel-inner carousel-panel cphoto-panel">
      <div class="panel-head"><h2>Fotos</h2></div>
      ${!takes ? html`<p class="video-note"><${Icon} name="info" size=${15} /> <span>Este estilo não usa fotografias. <button type="button" class="btn link sm" onClick=${onStyle}>Mudar de estilo</button></span></p>`
      : html`<${Group} title=${takes === 1 ? 'Fundo' : 'Fotografias'} where="carrossel" fold="carousel:photos">
          ${seg([['trades', 'Das funções do anúncio'], ['chosen', 'Escolher']], choosing ? 'chosen' : 'trades', (v) => {
            setChoosing(v === 'chosen');
            if (v === 'trades') setCarousel(update, { photos: { mode: 'trades', ids: [], focus: c.photos.focus || {} } });
          }, 'Fotografias do carrossel')}
          ${takes === 1 && html`<p class="group-hint">Sem fotografia, o fundo é o desenho da profissão.</p>`}
          <${CarouselFraming} project=${project} update=${update} images=${images} />
          ${choosing && VideoPhotos && html`<${VideoPhotos} project=${project} ids=${c.photos.mode === 'chosen' ? c.photos.ids : []} max=${takes} where="carrossel" onChange=${setIds} />`}
        <//>`}
    </div>`;
  }

  return { PieceSwitch, CarouselStage, useCarousel, carouselOf, carouselPhotos, FORMAT_LABEL, CarouselStylePanel, CarouselSequencePanel, CarouselPhotosPanel, StyleCover, styleName, drawSlide };
};
