// Project data: languages, formats, fonts, palettes, sample content.
window.RS = window.RS || {};

RS.model = (() => {
  const { uid, clone } = RS.util;

  const LOCALES = [
    { code: 'pt-PT', label: 'Português', short: 'PT' },
    { code: 'de-CH', label: 'Deutsch (Schweiz)', short: 'DE-CH' },
    { code: 'de-DE', label: 'Deutsch (Deutschland)', short: 'DE' },
    { code: 'fr', label: 'Français', short: 'FR' },
    { code: 'it', label: 'Italiano', short: 'IT' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'es', label: 'Español', short: 'ES' },
  ];
  const localeInfo = (code) => LOCALES.find((l) => l.code === code) || LOCALES[0];

  // Stock labels swapped automatically when a language is added.
  const STOCK = {
    kicker: { 'pt-PT': 'Estamos a recrutar', 'de-CH': 'Wir suchen', 'de-DE': 'Wir suchen', fr: 'Nous recrutons', it: 'Cerchiamo', en: "We're hiring", es: 'Buscamos' },
    positionsTitle: { 'pt-PT': 'Procuramos:', 'de-CH': 'Gesucht werden:', 'de-DE': 'Gesucht werden:', fr: 'Postes recherchés :', it: 'Posizioni aperte:', en: 'Open positions:', es: 'Vacantes:' },
    apply: { 'pt-PT': 'Candidate-se já', 'de-CH': 'Jetzt bewerben', 'de-DE': 'Jetzt bewerben', fr: 'Postulez dès maintenant', it: 'Candidati ora', en: 'Apply now', es: 'Postúlate ya' },
    // «Fala comigo» (RS.contact): the message a candidate sends, with {profissões}
    // replaced by the ad's trades; the general one when there are more than three.
    waMsg: {
      'pt-PT': 'Olá! Vi o anúncio para {profissões} e tenho interesse.',
      'de-CH': 'Hallo! Ich habe die Anzeige für {profissões} gesehen und bin interessiert.',
      'de-DE': 'Hallo! Ich habe die Anzeige für {profissões} gesehen und bin interessiert.',
      fr: 'Bonjour ! J’ai vu l’annonce pour {profissões} et je suis intéressé.',
      it: 'Ciao! Ho visto l’annuncio per {profissões} e sono interessato.',
      en: 'Hi! I saw the ad for {profissões} and I’m interested.',
      es: '¡Hola! He visto el anuncio para {profissões} y me interesa.',
    },
    waMsgAny: {
      'pt-PT': 'Olá! Vi o vosso anúncio de emprego e tenho interesse.',
      'de-CH': 'Hallo! Ich habe eure Stellenanzeige gesehen und bin interessiert.',
      'de-DE': 'Hallo! Ich habe eure Stellenanzeige gesehen und bin interessiert.',
      fr: 'Bonjour ! J’ai vu votre offre d’emploi et je suis intéressé.',
      it: 'Ciao! Ho visto il vostro annuncio di lavoro e sono interessato.',
      en: 'Hi! I saw your job ad and I’m interested.',
      es: '¡Hola! He visto vuestra oferta de empleo y me interesa.',
    },
    waMeet: { 'pt-PT': 'Olá, falámos agora há pouco.', 'de-CH': 'Hallo, wir haben gerade gesprochen.', 'de-DE': 'Hallo, wir haben gerade gesprochen.', fr: 'Bonjour, on vient de se parler.', it: 'Ciao, ci siamo appena parlati.', en: 'Hi, we just spoke.', es: 'Hola, acabamos de hablar.' },
    waCta: { 'pt-PT': 'Manda mensagem', 'de-CH': 'Schreib mir', 'de-DE': 'Schreib mir', fr: 'Écris-moi', it: 'Scrivimi', en: 'Message me', es: 'Escríbeme' },
    scanHint: { 'pt-PT': 'Aponta a câmara', 'de-CH': 'Mit der Kamera scannen', 'de-DE': 'Mit der Kamera scannen', fr: 'Scanne avec l’appareil photo', it: 'Inquadra con la fotocamera', en: 'Scan with your camera', es: 'Escanea con la cámara' },
    waCaption: { 'pt-PT': 'Fala comigo no WhatsApp', 'de-CH': 'Schreib mir auf WhatsApp', 'de-DE': 'Schreib mir auf WhatsApp', fr: 'Écris-moi sur WhatsApp', it: 'Scrivimi su WhatsApp', en: 'Message me on WhatsApp', es: 'Escríbeme por WhatsApp' },
    // Offer (video and post text): the salary period and the word for vacancies.
    period: {
      hour: { 'pt-PT': 'por hora', 'de-CH': 'pro Stunde', 'de-DE': 'pro Stunde', fr: 'par heure', it: 'all’ora', en: 'per hour', es: 'por hora' },
      day: { 'pt-PT': 'por dia', 'de-CH': 'pro Tag', 'de-DE': 'pro Tag', fr: 'par jour', it: 'al giorno', en: 'per day', es: 'por día' },
      week: { 'pt-PT': 'por semana', 'de-CH': 'pro Woche', 'de-DE': 'pro Woche', fr: 'par semaine', it: 'a settimana', en: 'per week', es: 'por semana' },
      month: { 'pt-PT': 'por mês', 'de-CH': 'pro Monat', 'de-DE': 'pro Monat', fr: 'par mois', it: 'al mese', en: 'per month', es: 'al mes' },
    },
    vacancies: { 'pt-PT': 'vagas', 'de-CH': 'Stellen', 'de-DE': 'Stellen', fr: 'postes', it: 'posti', en: 'vacancies', es: 'vacantes' },
    vacancy: { 'pt-PT': 'vaga', 'de-CH': 'Stelle', 'de-DE': 'Stelle', fr: 'poste', it: 'posto', en: 'vacancy', es: 'vacante' },
  };

  const FORMATS = {
    square: { id: 'square', w: 1080, h: 1080, label: 'Quadrado', hint: 'Feed 1:1', icon: 'square' },
    portrait: { id: 'portrait', w: 1080, h: 1350, label: 'Retrato', hint: 'Feed 4:5 · recomendado', icon: 'rectangle-vertical' },
    story: { id: 'story', w: 1080, h: 1920, label: 'Story', hint: 'Stories e Reels 9:16', icon: 'smartphone' },
  };
  const FORMAT_ORDER = ['square', 'portrait', 'story'];

  // Font pairings. `head` = headline, `sub` = kicker/box titles, `body`, `strong`.
  const FONTS = {
    modern: {
      label: 'Moderna', sample: 'Condensada forte',
      head: { family: 'Barlow Condensed', weight: 700 }, headLH: 0.96, headTrack: 0,
      sub: { family: 'Barlow Condensed', weight: 700 }, subTrack: 0.04,
      body: { family: 'Barlow', weight: 500 }, strong: { family: 'Barlow', weight: 700 }, bodyLH: 1.22,
    },
    impact: {
      label: 'Impacto', sample: 'Cartaz pesado',
      head: { family: 'Anton', weight: 400 }, headLH: 1.04, headTrack: 0.005,
      sub: { family: 'Barlow Condensed', weight: 700 }, subTrack: 0.05,
      body: { family: 'Barlow', weight: 500 }, strong: { family: 'Barlow', weight: 700 }, bodyLH: 1.22,
    },
    geometric: {
      label: 'Geométrica', sample: 'Larga e limpa',
      head: { family: 'Montserrat', weight: 800 }, headLH: 1.02, headTrack: -0.01,
      sub: { family: 'Montserrat', weight: 700 }, subTrack: 0.06,
      body: { family: 'Montserrat', weight: 500 }, strong: { family: 'Montserrat', weight: 700 }, bodyLH: 1.26,
    },
    elegant: {
      label: 'Elegante', sample: 'Serifa editorial',
      head: { family: 'DM Serif Display', weight: 400 }, headLH: 1.02, headTrack: 0,
      sub: { family: 'DM Sans', weight: 700 }, subTrack: 0.06,
      body: { family: 'DM Sans', weight: 500 }, strong: { family: 'DM Sans', weight: 700 }, bodyLH: 1.26,
    },
  };

  // Brand colour pairs (primary + accent).
  const PALETTES = [
    { id: 'navy', name: 'Marinho e céu', primary: '#0B2E6B', accent: '#2AA3F0' },
    { id: 'graphite', name: 'Grafite e laranja', primary: '#1E2329', accent: '#FF6B1A' },
    { id: 'forest', name: 'Floresta e lima', primary: '#0F3D2E', accent: '#8CC63F' },
    { id: 'wine', name: 'Bordeaux e ouro', primary: '#5B1530', accent: '#E3A82B' },
    { id: 'petrol', name: 'Petróleo e coral', primary: '#0F4C5C', accent: '#FF7A59' },
    { id: 'signal', name: 'Preto e amarelo', primary: '#141414', accent: '#FFC400' },
    { id: 'royal', name: 'Royal e sol', primary: '#1A3FB8', accent: '#FFD23F' },
    { id: 'plum', name: 'Ameixa e rosa', primary: '#3B1E6E', accent: '#F2547D' },
  ];

  const item = (text) => ({ id: uid(), text });
  const iconItem = (icon, text) => ({ id: uid(), icon, text });

  // Sample content per sector, used when a template is picked for a new poster.
  const SAMPLES = {
    construction: () => ({
      kicker: 'Estamos a recrutar',
      headline: 'Pedreiros, cofragistas e serventes',
      intro: 'Tem experiência em obra e procura um novo desafio?',
      benefits: [
        iconItem('coins', 'Remuneração muito acima da média'),
        iconItem('alarm-clock', 'Início imediato'),
        iconItem('car', 'Carta de condução B é uma vantagem'),
        iconItem('handshake', 'Contratos de longa duração'),
        iconItem('map-pin', 'Região de St. Gallen, Kreuzlingen e Schaffhausen'),
      ],
      positionsTitle: 'Procuramos:',
      positions: [item('Pedreiro com experiência'), item('Cofragista'), item('Servente de obra'), item('Ajudante de construção')],
      contacts: [iconItem('phone', '+41 71 000 00 00'), iconItem('mail', 'emprego@aempresa.ch')],
      badge: 'Início imediato',
    }),
    logistics: () => ({
      kicker: 'Estamos a recrutar',
      headline: 'Motoristas de pesados e operadores de armazém',
      intro: 'Procura estabilidade e um salário acima da média?',
      benefits: [
        iconItem('hand-coins', 'Salário competitivo e prémios mensais'),
        iconItem('clock', 'Horários fixos, fins de semana livres'),
        iconItem('truck', 'Frota moderna e bem cuidada'),
        iconItem('graduation-cap', 'Formação paga e progressão'),
        iconItem('map-pin', 'Lisboa, Setúbal e Santarém'),
      ],
      positionsTitle: 'Vagas abertas:',
      positions: [item('Motorista categoria C+E'), item('Operador de empilhador'), item('Preparador de encomendas')],
      contacts: [iconItem('phone', '+351 210 000 000'), iconItem('mail', 'recrutamento@aempresa.pt')],
      badge: '20 vagas',
    }),
    hospitality: () => ({
      kicker: 'Estamos a recrutar',
      headline: 'Cozinheiros e empregados de mesa',
      intro: 'Junte-se a uma equipa que gosta de servir bem.',
      benefits: [
        iconItem('utensils', 'Refeições incluídas'),
        iconItem('house', 'Alojamento disponível'),
        iconItem('sun', 'Contrato para a época de verão'),
        iconItem('coins', 'Gorjetas e bónus mensais'),
      ],
      positionsTitle: 'Procuramos:',
      positions: [item('Cozinheiro(a)'), item('Ajudante de cozinha'), item('Empregado(a) de mesa'), item('Empregado(a) de bar')],
      contacts: [iconItem('message-circle', '+351 910 000 000'), iconItem('mail', 'vagas@aempresa.pt')],
      badge: 'Início em maio',
    }),
    industry: () => ({
      kicker: 'Oportunidade',
      headline: 'Operadores de produção',
      intro: 'Trabalho por turnos numa fábrica moderna, com contrato direto.',
      benefits: [
        iconItem('coins', 'Subsídio de turno e de alimentação'),
        iconItem('bus', 'Transporte da empresa'),
        iconItem('shield-check', 'Seguro de saúde'),
        iconItem('trending-up', 'Progressão na carreira'),
      ],
      positionsTitle: 'Vagas:',
      positions: [item('Operador(a) de linha'), item('Técnico(a) de manutenção'), item('Chefe de turno')],
      contacts: [iconItem('phone', '+351 220 000 000'), iconItem('mail', 'rh@aempresa.pt')],
      badge: 'Contrato direto',
    }),
    metal: () => ({
      kicker: 'Precisa-se',
      headline: 'Soldadores e serralheiros',
      intro: 'Projetos estáveis em França e na Suíça, com tudo tratado por nós.',
      benefits: [
        iconItem('swiss-franc', 'Até 32 CHF por hora'),
        iconItem('house', 'Alojamento pago'),
        iconItem('plane', 'Viagem incluída'),
        iconItem('handshake', 'Missões longas, com renovação'),
      ],
      positionsTitle: 'Perfis:',
      positions: [item('Soldador MIG/MAG'), item('Soldador TIG'), item('Serralheiro civil')],
      contacts: [iconItem('phone', '+351 930 000 000'), iconItem('mail', 'jobs@aempresa.com')],
      badge: 'Saída imediata',
    }),
    office: () => ({
      kicker: 'Junte-se a nós',
      headline: 'Assistente administrativo(a)',
      intro: 'Para uma empresa de engenharia em crescimento, no centro do Porto.',
      benefits: [
        iconItem('briefcase', 'Contrato sem termo'),
        iconItem('clock', 'Horário flexível e teletrabalho parcial'),
        iconItem('graduation-cap', 'Formação contínua'),
        iconItem('heart-handshake', 'Equipa próxima e bom ambiente'),
      ],
      positionsTitle: 'Requisitos:',
      positions: [item('12.º ano ou licenciatura'), item('Inglês fluente'), item('Excel avançado')],
      contacts: [iconItem('mail', 'carreiras@aempresa.pt'), iconItem('link', 'aempresa.pt/carreiras')],
      badge: 'Vaga aberta',
    }),
  };

  // waCta: the green «Manda mensagem» pill (drawn only when the ad has a valid number).
  const DEFAULT_SHOW = { logo: true, kicker: true, intro: true, benefits: true, positions: true, contacts: true, badge: true, qr: true, waCta: true };
  const DEFAULT_FX = { b: 1, c: 1, s: 1 };
  // Video ads: length (6 / 10 / 15 s); motion style ('poster' = the animated
  // poster, whose own style is 'dynamic' | 'soft'; the others are RS.motion
  // styles); colours, background, font and sound of the motion styles.
  // The video recipes (RS.motion, js/recipes/) come first in the gallery.
  const RECIPES = ['tijolo', 'pixel', 'planta', 'apresentacao', 'colagem', 'numeros', 'partidas', 'notificacoes', 'grua', 'contrato', 'cracha', 'fita', 'esteira'];
  const MOTIONS = [...RECIPES, 'poster', 'neon', 'obra', 'limpo', 'cinema', 'impacto', 'curto'];
  // duration: seconds, or 'auto' («Automática»: the time the information needs,
  // 10–30 s). show: the video's eyes (null = follow the image's own eye).
  // texts: the video's own texts per language; a missing key follows the
  // image (lists follow it item by item, see mergeList). hold: seconds the
  // contact card stays still; photos: the trades' photos or up to eight the
  // person picks (library ids or «As minhas» asset ids), and focus: per photo
  // id (library, «As minhas» or the ad's photo asset) the point «Enquadrar»
  // keeps in the centre, { x, y } from 0 to 1 (left out when there is none).
  const DURATIONS = [6, 10, 15, 20, 25, 30];
  const DEFAULT_VIDEO_SHOW = { kicker: null, intro: null, benefits: null, highlights: null, positions: null, chat: true, contacts: null, closing: false, qr: true };
  const DEFAULT_VIDEO = {
    duration: 'auto', style: 'dynamic', motion: 'neon', colors: 'style', accent: null, bg: 'dark', font: null, sound: 'generated', ownSound: null,
    show: DEFAULT_VIDEO_SHOW, texts: {}, hold: 2, photos: { mode: 'trades', ids: [] },
  };
  const MAX_VIDEO_PHOTOS = 8;
  const ids = (list) => (Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x) : []);
  function cleanVideoShow(show) {
    const s = show && typeof show === 'object' ? show : {};
    const out = { ...DEFAULT_VIDEO_SHOW };
    for (const k of Object.keys(DEFAULT_VIDEO_SHOW)) if (typeof s[k] === 'boolean') out[k] = s[k];
    return out;
  }
  // The video's own texts: strings, lists ({ edits, added, order }) and the
  // models' labels, per language of the ad; anything else is dropped.
  const VIDEO_TEXT_KEYS = ['kicker', 'headline', 'intro', 'positionsTitle', 'message', 'cta', 'hint', 'closing', 'brandName'];
  const VIDEO_LIST_KEYS = ['benefits', 'highlights', 'positions', 'contacts'];
  const MAX_VIDEO_TEXT = 400, MAX_VIDEO_ITEMS = 40;
  const vstr = (x) => (typeof x === 'string' ? x.slice(0, MAX_VIDEO_TEXT) : undefined);
  function cleanVideoList(o, highlights) {
    if (!o || typeof o !== 'object') return undefined;
    const edits = {};
    for (const [id, e] of Object.entries(o.edits && typeof o.edits === 'object' ? o.edits : {})) {
      if (e === null) edits[id] = null;
      else if (highlights && e && typeof e === 'object') {
        const h = {};
        if (typeof e.value === 'string') h.value = vstr(e.value);
        if (typeof e.label === 'string') h.label = vstr(e.label);
        if (Object.keys(h).length) edits[id] = h;
      } else if (!highlights && typeof e === 'string') edits[id] = vstr(e);
    }
    const added = (Array.isArray(o.added) ? o.added : []).filter((x) => x && typeof x.id === 'string' && x.id).slice(0, MAX_VIDEO_ITEMS)
      .map((x) => (highlights
        ? { id: x.id, role: 'own', value: vstr(x.value) || '', label: vstr(x.label) || '' }
        : { id: x.id, text: vstr(x.text) || '', ...(typeof x.icon === 'string' ? { icon: x.icon } : {}) }));
    return { edits, added, order: Array.isArray(o.order) ? ids(o.order) : null };
  }
  function cleanVideoTexts(texts, locales) {
    const src = texts && typeof texts === 'object' ? texts : {};
    const out = {};
    for (const code of locales || []) {
      const t = src[code];
      if (!t || typeof t !== 'object') continue;
      const v = {};
      for (const k of VIDEO_TEXT_KEYS) { const x = vstr(t[k]); if (x !== undefined) v[k] = x; }
      for (const k of VIDEO_LIST_KEYS) { const l = cleanVideoList(t[k], k === 'highlights'); if (l) v[k] = l; }
      if (t.model && typeof t.model === 'object') {
        const m = {};
        for (const [id, labels] of Object.entries(t.model)) {
          if (!labels || typeof labels !== 'object') continue;
          const l = {};
          for (const [k, x] of Object.entries(labels)) if (typeof x === 'string') l[k] = x.slice(0, MAX_VIDEO_TEXT);
          if (Object.keys(l).length) m[id] = l;
        }
        if (Object.keys(m).length) v.model = m;
      }
      if (Object.keys(v).length) out[code] = v;
    }
    return out;
  }
  // A list of the video: the image's items in the image's order with the
  // person's edits (null removes an item), then the items he added; `order`
  // (ids) reorders them, and an item it does not name stays right after the
  // item it followed. Edits of items gone from the image are ignored.
  // Every item says where it comes from: from 'image' | 'own', edited.
  function mergeList(imageItems, override) {
    const o = override || {};
    const edits = o.edits || {};
    const out = [];
    for (const it of imageItems || []) {
      if (!it) continue;
      if (Object.prototype.hasOwnProperty.call(edits, it.id)) {
        const e = edits[it.id];
        if (e === null) continue;
        out.push(typeof e === 'string' ? { ...it, text: e, from: 'image', edited: true } : { ...it, ...e, from: 'image', edited: true });
      } else out.push({ ...it, from: 'image', edited: false });
    }
    for (const it of o.added || []) out.push({ ...it, from: 'own', edited: false });
    if (!Array.isArray(o.order) || !o.order.length) return out;
    const rank = new Map(o.order.map((id, i) => [id, i]));
    const result = out.filter((x) => rank.has(x.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
    out.forEach((x, k) => {
      if (rank.has(x.id)) return;
      let at = 0;
      for (let j = k - 1; j >= 0; j--) { const i = result.indexOf(out[j]); if (i >= 0) { at = i + 1; break; } }
      result.splice(at, 0, x);
    });
    return result;
  }
  // Drops the video's edits of image items that are gone (deleted on the image,
  // or replaced by «Usar os textos prontos») and the texts of languages the ad
  // no longer has; a list left with nothing follows the image again. The
  // highlights' salary, vacancies and badge come and go with the offer, so
  // their edits stay. Changes `p` and returns it.
  function pruneVideoTexts(p) {
    const v = p.video;
    if (!v || !v.texts) return p;
    const out = {};
    for (const code of p.locales || []) {
      const t = v.texts[code];
      if (!t) continue;
      const img = (p.texts || {})[code] || {};
      const cur = { ...t };
      for (const k of VIDEO_LIST_KEYS) {
        const l = cur[k];
        if (!l) continue;
        const known = new Set(k === 'highlights' ? ['salary', 'vacancies', 'badge'] : (img[k] || []).map((x) => x.id));
        const edits = {};
        for (const [id, e] of Object.entries(l.edits || {})) if (known.has(id)) edits[id] = e;
        const added = l.added || [];
        for (const x of added) known.add(x.id);
        const order = Array.isArray(l.order) ? l.order.filter((id) => known.has(id)) : [];
        if (Object.keys(edits).length || added.length || order.length) cur[k] = { edits, added, order: order.length ? order : null };
        else delete cur[k];
      }
      if (Object.keys(cur).length) out[code] = cur;
    }
    v.texts = out;
    return p;
  }
  // The ticked benefits of a language (the 2026-10-20 «O que entra»). Each
  // language has its own items: a choice made in another language takes the
  // same places in the list.
  function pickBenefits(project, items, chosen) {
    if (!chosen.length) return [];
    const own = items.filter((x) => chosen.includes(x.id));
    if (own.length) return own;
    for (const code of project.locales || []) {
      const list = ((project.texts[code] || {}).benefits || []).filter((x) => String(x.text || '').trim());
      if (list.some((x) => chosen.includes(x.id))) return items.filter((_, i) => list[i] && chosen.includes(list[i].id));
    }
    return items;
  }
  // Ads saved with `include` (2026-10-20) keep the same video.
  function migrateInclude(p, inc, show, texts) {
    if (inc.offer === false) show.highlights = false;
    if (inc.positions === false) show.positions = false;
    if (inc.chat === false) show.chat = false;
    if (inc.qr === false) show.qr = false;
    if (!Array.isArray(inc.benefits)) return;
    const chosen = ids(inc.benefits);
    for (const code of p.locales) {
      const items = ((p.texts[code] || {}).benefits || []).filter((x) => String(x.text || '').trim());
      const keep = pickBenefits(p, items, chosen);
      const edits = {};
      for (const x of items) if (!keep.includes(x)) edits[x.id] = null;
      if (Object.keys(edits).length) texts[code] = { ...(texts[code] || {}), benefits: { edits, added: [], order: null } };
    }
  }
  const MAX_FOCUS = 64;
  const unit = (n) => Math.min(1, Math.max(0, n));
  const point = (f) => (f && typeof f === 'object' && Number.isFinite(f.x) && Number.isFinite(f.y) ? { x: unit(f.x), y: unit(f.y) } : null);
  function cleanFocus(focus) {
    if (!focus || typeof focus !== 'object' || Array.isArray(focus)) return null;
    const out = {};
    for (const [id, f] of Object.entries(focus)) {
      const pt = id && point(f);
      if (pt && Object.keys(out).length < MAX_FOCUS) out[id] = pt;
    }
    return Object.keys(out).length ? out : null;
  }
  function cleanPhotos(ph) {
    const chosen = ph && ph.mode === 'chosen' ? ids(ph.ids).slice(0, MAX_VIDEO_PHOTOS) : [];
    const out = chosen.length ? { mode: 'chosen', ids: chosen } : { mode: 'trades', ids: [] };
    const focus = cleanFocus(ph && ph.focus);
    return focus ? { ...out, focus } : out;
  }
  // The point of a video photo that the video keeps in the centre: the one the
  // person chose («Enquadrar»), else the ad's own framing (its photo), a library
  // photo's (upright ones are framed higher: item.fy), else a little above the middle.
  function videoPhotoFocus(project, id, item) {
    const ph = project && project.video && project.video.photos;
    const own = ph && ph.focus && point(ph.focus[id]);
    if (own) return own;
    const p = project && project.photo;
    if (p && p.asset && p.asset === id) return { x: unit(Number.isFinite(p.fx) ? p.fx : 0.5), y: unit(Number.isFinite(p.fy) ? p.fy : 0.5) };
    if (item && Number.isFinite(item.fy)) return { x: 0.5, y: unit(item.fy) };
    return { x: 0.5, y: 0.4 };
  }
  // Sets (or with null clears: back to the default) the point of one photo.
  function setVideoPhotoFocus(project, id, f) {
    const v = project.video = { ...DEFAULT_VIDEO, ...(project.video || {}) };
    const ph = { ...(v.photos || DEFAULT_VIDEO.photos) };
    const focus = { ...(ph.focus || {}) };
    const pt = point(f);
    if (pt) focus[id] = pt; else delete focus[id];
    if (Object.keys(focus).length) ph.focus = focus; else delete ph.focus;
    v.photos = ph;
    return project;
  }
  // Ads saved before the motion styles keep their animated poster video, silent
  // as it was exported then.
  const LEGACY_VIDEO = { ...DEFAULT_VIDEO, duration: 10, motion: 'poster', sound: 'none' };
  // The template's sample company (replaced by the person's own name).
  const DEFAULT_BRAND = { name: 'A sua empresa', tagline: 'Recrutamento e seleção' };
  // Offer shown in the video and the post text (not on the still posters).
  const DEFAULT_OFFER = { salary: '', currency: '€', period: 'month', vacancies: '' };
  const CURRENCIES = ['€', 'CHF', '£'];
  const PERIODS = ['hour', 'day', 'week', 'month'];

  const knownTrades = (ids) => (Array.isArray(ids) ? ids : []).filter((id, i, all) => RS.trades.get(id) && all.indexOf(id) === i);

  // opts.trades (or opts.trade) picks construction-trade presets (RS.trades), the
  // first being the main one; otherwise the template's own trade, then its
  // legacy sample sector.
  function newProject(template, opts = {}) {
    const now = Date.now();
    let trades = knownTrades(opts.trades || (opts.trade ? [opts.trade] : []));
    if (!trades.length) trades = knownTrades(template.trade ? [template.trade] : []);
    const texts = trades.length
      ? RS.trades.textsFor(trades, 'pt-PT')
      : { ...(SAMPLES[template.sample] ? SAMPLES[template.sample]() : SAMPLES.construction()), qr: '' };
    texts.waMessage = '';
    const d = template.defaults;
    return {
      v: 1,
      id: uid(),
      name: texts.headline,
      trade: trades[0] || null,
      trades,
      whatsapp: null,
      waTemplates: {},
      qrMode: 'whatsapp',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      template: template.id,
      format: opts.format || 'portrait',
      locales: ['pt-PT'],
      locale: 'pt-PT',
      texts: { 'pt-PT': texts },
      show: { ...DEFAULT_SHOW, ...(d.show || {}) },
      brand: { ...DEFAULT_BRAND },
      style: {
        primary: d.primary, accent: d.accent, bg: d.bg, text: d.text,
        customColors: false,
        fonts: d.fonts, upper: d.upper,
        textScale: 1, headScale: 1, logoScale: 1, logoTone: 'auto',
      },
      photo: null,
      logo: null,
      video: clone(DEFAULT_VIDEO),
      offer: { ...DEFAULT_OFFER },
    };
  }

  // Applies a template to an existing project: layout and surfaces change,
  // the person's text, images and (custom) brand colours stay.
  function applyTemplate(project, template) {
    const p = clone(project);
    const d = template.defaults;
    p.template = template.id;
    p.style.bg = d.bg;
    p.style.text = d.text;
    if (!p.style.customColors) {
      p.style.primary = d.primary;
      p.style.accent = d.accent;
      p.style.fonts = d.fonts;
      p.style.upper = d.upper;
    }
    return p;
  }

  // Sets the ad's trades (main first); the texts stay as they are, and a
  // generated WhatsApp message follows the new trades by itself.
  function setTrades(project, ids) {
    const p = clone(project);
    p.trades = knownTrades(ids);
    p.trade = p.trades[0] || null;
    return p;
  }

  // Adds a language by copying the texts of `from`, swapping stock labels.
  // The WhatsApp message of the new language starts generated (in that language).
  function addLocale(project, code, from) {
    const p = clone(project);
    if (p.locales.includes(code)) return p;
    const src = RS.trades.translate(clone(p.texts[from] || p.texts[p.locales[0]]), p.trades || p.trade, from, code);
    src.waMessage = '';
    for (const list of ['benefits', 'positions', 'contacts']) {
      src[list] = (src[list] || []).map((it) => ({ ...it, id: uid() }));
    }
    for (const key of ['kicker', 'positionsTitle']) {
      const stock = STOCK[key];
      if (src[key] && src[key].trim() === (stock[from] || '').trim()) src[key] = stock[code] || src[key];
    }
    p.texts[code] = src;
    p.locales.push(code);
    p.locale = code;
    return p;
  }

  // Languages of the ad that have ready texts for its trades (RS.trades).
  const readyTextLocales = (project) => project.locales.filter((code) => RS.trades.langOf(code));
  // «Usar os textos prontos»: the trades' texts in every language that has
  // them; the contacts, the QR link and the WhatsApp message stay, and the
  // other languages keep the person's own texts.
  function applyTradeTexts(project) {
    const p = clone(project);
    for (const code of readyTextLocales(p)) {
      const keep = p.texts[code];
      const nt = RS.trades.textsFor(p.trades, code);
      nt.contacts = keep.contacts;
      nt.qr = keep.qr || '';
      nt.waMessage = keep.waMessage || '';
      p.texts[code] = nt;
    }
    if (p.nameAuto !== false && p.texts[p.locales[0]]) p.name = p.texts[p.locales[0]].headline;
    return pruneVideoTexts(p);
  }

  function removeLocale(project, code) {
    const p = clone(project);
    if (p.locales.length <= 1) return p;
    p.locales = p.locales.filter((c) => c !== code);
    delete p.texts[code];
    if (p.locale === code) p.locale = p.locales[0];
    return p;
  }

  // The offer's pieces in the ad's language: amount "1900 €" / "CHF 5200" /
  // "€18", the period label, the vacancies count and its word ('' when empty).
  function offerParts(project, locale) {
    const o = project.offer || DEFAULT_OFFER;
    const salary = (o.salary || '').trim();
    const count = (o.vacancies || '').trim();
    const currency = o.currency || '€';
    const amount = !salary ? '' : currency === '€' && locale !== 'en' ? `${salary} €` : currency === 'CHF' ? `CHF ${salary}` : `${currency}${salary}`;
    const per = STOCK.period[o.period] || STOCK.period.month;
    const word = count === '1' ? STOCK.vacancy : STOCK.vacancies;
    return { salary, currency, amount, period: per[locale] || per['pt-PT'], count, word: word[locale] || word['pt-PT'] };
  }

  // "1900 € por mês · 30 vagas" in the ad's language; null without an offer.
  function offerText(project, locale) {
    const o = offerParts(project, locale);
    const parts = [];
    if (o.salary) parts.push(`${o.amount} ${o.period}`);
    if (o.count) parts.push(`${o.count} ${o.word}`);
    return parts.length ? parts.join(' · ') : null;
  }

  // Post caption for Facebook/Instagram, built from the visible fields.
  function caption(project, locale) {
    const t = project.texts[locale] || {};
    const show = project.show;
    const lines = [];
    const head = [show.kicker && t.kicker, t.headline].filter(Boolean).join(': ');
    if (head) lines.push(head.replace(/\s*\n\s*/g, ' '));
    const offer = offerText(project, locale);
    if (offer) lines.push(offer);
    if (show.intro && t.intro) lines.push('', t.intro);
    if (show.benefits && t.benefits && t.benefits.length) {
      lines.push('');
      for (const b of t.benefits) if (b.text.trim()) lines.push(`✅ ${b.text.trim()}`);
    }
    if (show.positions && t.positions && t.positions.length) {
      lines.push('', t.positionsTitle || STOCK.positionsTitle[locale] || '');
      for (const it of t.positions) if (it.text.trim()) lines.push(`• ${it.text.trim()}`);
    }
    // A contact holding the WhatsApp number is listed once, with the link below.
    const own = RS.contact && project.whatsapp ? RS.contact.digits(project.whatsapp.country, project.whatsapp.number) : null;
    const listed = (t.contacts || []).filter((c) => c.text.trim() && !(own && RS.contact.digits(project.whatsapp.country, c.text) === own));
    if (show.contacts && listed.length) {
      lines.push('', `${STOCK.apply[locale] || STOCK.apply['pt-PT']}:`);
      for (const c of listed) lines.push(`${c.icon === 'mail' || c.icon === 'at-sign' ? '✉️' : c.icon === 'link' || c.icon === 'globe' ? '🌐' : '📞'} ${c.text.trim()}`);
    }
    if (show.qr && t.qr && t.qr.trim() && project.qrMode === 'link') lines.push(`🔗 ${t.qr.trim()}`);
    // «Fala comigo»: the link people tap on Facebook and WhatsApp, and the number.
    const wa = RS.contact && RS.contact.adLink(project, locale);
    if (wa) {
      const w = project.whatsapp;
      lines.push('', `💬 ${STOCK.waCaption[locale] || STOCK.waCaption['pt-PT']}: ${wa}`, `📞 ${RS.contact.display(w.country, w.number)}`);
    }
    lines.push('', RS.trades.hashtagsFor(project.trades || (project.trade ? [project.trade] : []), locale));
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Normalises a project read from storage or a file (older or partial data).
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.texts || !raw.locales) throw new Error('not a project');
    const p = clone(raw);
    p.v = 1;
    p.show = { ...DEFAULT_SHOW, ...(p.show || {}) };
    p.brand = { name: '', tagline: '', ...(p.brand || {}) };
    p.style = { textScale: 1, headScale: 1, logoScale: 1, logoTone: 'auto', customColors: false, ...(p.style || {}) };
    if (!FONTS[p.style.fonts]) p.style.fonts = 'modern';
    if (!FORMATS[p.format]) p.format = 'portrait';
    p.locales = p.locales.filter((c) => LOCALES.some((l) => l.code === c) && p.texts[c]);
    if (!p.locales.length) throw new Error('no languages');
    if (!p.locales.includes(p.locale)) p.locale = p.locales[0];
    for (const code of p.locales) {
      const t = p.texts[code];
      for (const k of ['kicker', 'headline', 'intro', 'positionsTitle', 'badge', 'qr', 'waMessage']) t[k] = typeof t[k] === 'string' ? t[k] : '';
      for (const k of ['benefits', 'positions', 'contacts']) t[k] = Array.isArray(t[k]) ? t[k].filter((x) => x && typeof x.text === 'string').map((x) => ({ id: x.id || uid(), key: x.key, icon: x.icon, text: x.text })) : [];
    }
    // Several trades per ad (main first); old ads had one `trade`.
    p.trades = knownTrades(Array.isArray(p.trades) ? p.trades : (p.trade ? [p.trade] : []));
    p.trade = p.trades[0] || null;
    // «Fala comigo»: number, default message wording copied from the brand, QR mode.
    const w = p.whatsapp;
    p.whatsapp = w && typeof w.country === 'string' && typeof w.number === 'string' ? { country: w.country, number: w.number } : null;
    p.waTemplates = Object.fromEntries(Object.entries(p.waTemplates && typeof p.waTemplates === 'object' ? p.waTemplates : {}).filter(([, v]) => typeof v === 'string'));
    if (p.qrMode !== 'whatsapp' && p.qrMode !== 'link') {
      p.qrMode = p.locales.some((code) => p.texts[code].qr.trim()) ? 'link' : 'whatsapp';
    }
    if (p.photo && !p.photo.asset) p.photo = null;
    if (p.photo) p.photo = { zoom: 1, fx: 0.5, fy: 0.5, flip: false, ...p.photo, adj: { ...DEFAULT_FX, ...(p.photo.adj || {}) } };
    if (p.logo && !p.logo.asset) p.logo = null;
    const v = p.video || {};
    const base = MOTIONS.includes(v.motion) ? DEFAULT_VIDEO : LEGACY_VIDEO;
    const motion = MOTIONS.includes(v.motion) ? v.motion : 'poster';
    const sound = ['generated', 'own', 'none'].includes(v.sound) ? v.sound : base.sound;
    const ownSound = typeof v.ownSound === 'string' && v.ownSound ? v.ownSound : null;
    const vshow = cleanVideoShow(v.show);
    const vtexts = cleanVideoTexts(v.texts, p.locales);
    if (v.include && typeof v.include === 'object') migrateInclude(p, v.include, vshow, vtexts);
    p.video = {
      duration: motion === 'curto' ? 6 : DURATIONS.includes(v.duration) || v.duration === 'auto' ? v.duration : base === DEFAULT_VIDEO ? 15 : base.duration,
      style: v.style === 'soft' ? 'soft' : 'dynamic',
      motion,
      // 'style', 'brand' (the ad's colours) or a ready palette's id.
      colors: v.colors === 'brand' || PALETTES.some((pl) => pl.id === v.colors) ? v.colors : 'style',
      accent: typeof v.accent === 'string' && /^#[0-9a-f]{6}$/i.test(v.accent) ? v.accent : null,
      bg: v.bg === 'light' ? 'light' : 'dark',
      font: FONTS[v.font] ? v.font : null,
      sound: sound === 'own' && !ownSound ? 'generated' : sound,
      ownSound,
      show: vshow,
      texts: vtexts,
      hold: v.hold === 4 ? 4 : 2,
      photos: cleanPhotos(v.photos),
    };
    const o = p.offer && typeof p.offer === 'object' ? p.offer : {};
    p.offer = {
      salary: typeof o.salary === 'string' ? o.salary : '',
      currency: CURRENCIES.includes(o.currency) ? o.currency : DEFAULT_OFFER.currency,
      period: PERIODS.includes(o.period) ? o.period : DEFAULT_OFFER.period,
      vacancies: typeof o.vacancies === 'string' ? o.vacancies : '',
    };
    return pruneVideoTexts(p);
  }

  return {
    LOCALES, localeInfo, STOCK, FORMATS, FORMAT_ORDER, FONTS, PALETTES, SAMPLES, DEFAULT_SHOW, DEFAULT_FX, DEFAULT_VIDEO, DEFAULT_VIDEO_SHOW, DURATIONS, RECIPES, MAX_VIDEO_PHOTOS,
    mergeList, cleanVideoTexts, cleanVideoShow, pruneVideoTexts, pickBenefits, videoPhotoFocus, setVideoPhotoFocus,
    MOTIONS, DEFAULT_OFFER, CURRENCIES, PERIODS,
    DEFAULT_BRAND, newProject, applyTemplate, setTrades, addLocale, removeLocale, readyTextLocales, applyTradeTexts,
    caption, offerParts, offerText, normalize, item, iconItem,
  };
})();
