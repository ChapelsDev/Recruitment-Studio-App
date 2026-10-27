// Ready-made texts per construction trade, in pt / de / fr / en.
// Benefits come from a shared phrase book so a poster made from a preset can be
// translated automatically when a language is added (only untouched texts change).
window.RS = window.RS || {};

RS.trades = (() => {
  const { uid } = RS.util;

  // Locale code -> phrase language. Languages without an entry copy the source text.
  const LANG = { 'pt-PT': 'pt', 'de-CH': 'de', 'de-DE': 'de', fr: 'fr', en: 'en' };
  const langOf = (locale) => LANG[locale] || null;

  const P = {
    pay: { icon: 'coins', pt: 'Remuneração acima da média', de: 'Sehr gute Entlöhnung', fr: 'Très bon salaire', en: 'Above-average pay' },
    start: { icon: 'alarm-clock', pt: 'Início imediato', de: 'Sofortiger Start möglich', fr: 'Début immédiat', en: 'Immediate start' },
    license: { icon: 'car', pt: 'Carta de condução B é uma vantagem', de: 'Führerschein Kat. B von Vorteil', fr: 'Permis B, un atout', en: 'Driving licence B is a plus' },
    longterm: { icon: 'handshake', pt: 'Contratos de longa duração', de: 'Langfristige Einsätze / Try & Hire möglich', fr: 'Missions de longue durée', en: 'Long-term contracts' },
    housing: { icon: 'house', pt: 'Alojamento garantido', de: 'Unterkunft wird organisiert', fr: 'Logement assuré', en: 'Accommodation provided' },
    overtime: { icon: 'clock', pt: 'Horas extra pagas', de: 'Überstunden werden bezahlt', fr: 'Heures supplémentaires payées', en: 'Paid overtime' },
    tools: { icon: 'hard-hat', pt: 'Ferramentas e EPI fornecidos', de: 'Werkzeug und Schutzausrüstung gestellt', fr: 'Outils et EPI fournis', en: 'Tools and safety gear provided' },
    meals: { icon: 'utensils', pt: 'Subsídio de alimentação', de: 'Verpflegungszulage', fr: 'Indemnité de repas', en: 'Meal allowance' },
    transport: { icon: 'bus', pt: 'Transporte para a obra', de: 'Transport zur Baustelle', fr: 'Transport jusqu’au chantier', en: 'Transport to site' },
    training: { icon: 'graduation-cap', pt: 'Formação e progressão', de: 'Weiterbildung und Aufstieg', fr: 'Formation et évolution', en: 'Training and career growth' },
    insurance: { icon: 'shield-check', pt: 'Seguro de acidentes de trabalho', de: 'Unfallversicherung inklusive', fr: 'Assurance accidents incluse', en: 'Accident insurance included' },
    travel: { icon: 'plane', pt: 'Viagem paga', de: 'Reisekosten werden übernommen', fr: 'Voyage payé', en: 'Travel paid' },
    region: { icon: 'map-pin', pt: 'Obras na sua região', de: 'Einsätze in Ihrer Region', fr: 'Chantiers dans votre région', en: 'Jobs in your area' },
    ontime: { icon: 'wallet', pt: 'Salário sempre a horas', de: 'Pünktliche Lohnzahlung', fr: 'Salaire versé à temps', en: 'Always paid on time' },
  };

  const KICKER = { pt: 'Estamos a recrutar', de: 'Wir suchen', fr: 'Nous recrutons', en: "We're hiring" };
  const POS_TITLE = { pt: 'Procuramos:', de: 'Gesucht werden:', fr: 'Postes recherchés :', en: 'Open positions:' };
  const INTRO = {
    site: { pt: 'Tem experiência em obra e procura um novo desafio?', de: 'Du hast Erfahrung auf dem Bau und suchst eine neue Herausforderung?', fr: 'Vous avez de l’expérience sur les chantiers et cherchez un nouveau défi ?', en: 'Experienced on building sites and ready for a new challenge?' },
    craft: { pt: 'É profissional do ofício e quer ganhar mais?', de: 'Du bist Profi in deinem Handwerk und willst mehr verdienen?', fr: 'Vous êtes un pro du métier et voulez gagner plus ?', en: 'A pro at your trade and want to earn more?' },
    stable: { pt: 'Procura um projeto estável com boas condições?', de: 'Du suchst ein stabiles Projekt mit guten Konditionen?', fr: 'Vous cherchez un projet stable avec de bonnes conditions ?', en: 'Looking for a stable project with good conditions?' },
  };
  const BADGE = {
    now: { pt: 'Início imediato', de: 'Sofort-Start', fr: 'Début immédiat', en: 'Start now' },
    pay: { pt: 'Bom salário', de: 'Top Lohn', fr: 'Bon salaire', en: 'Top pay' },
    open: { pt: 'Vagas abertas', de: 'Jetzt bewerben', fr: 'Postulez', en: 'Apply now' },
  };
  const helper = { pt: 'Ajudante', de: 'Hilfskraft', fr: 'Aide', en: 'Helper' };
  const CONTACTS = {
    pt: [['phone', '+351 900 000 000'], ['mail', 'emprego@aempresa.pt']],
    de: [['phone', '+41 71 000 00 00'], ['mail', 'jobs@aempresa.ch']],
    fr: [['phone', '+41 22 000 00 00'], ['mail', 'emplois@aempresa.ch']],
    en: [['phone', '+44 20 0000 0000'], ['mail', 'jobs@acompany.com']],
  };
  const HASH = { pt: '#emprego #obras #construcaocivil #recrutamento', de: '#jobs #bau #stellenangebot #baustelle', fr: '#emploi #chantier #construction #recrutement', en: '#jobs #construction #hiring #building' };

  const t = (pt, de, fr, en) => ({ pt, de, fr, en });
  const LIST = [
    { id: 'obras', label: 'Obras gerais', icon: 'hard-hat', photo: 'obras', tag: t('#construcao', '#bauarbeiter', '#batiment', '#construction'),
      headline: t('Oficiais e encarregados de construção civil', 'Bauarbeiter und Vorarbeiter', 'Ouvriers et chefs d’équipe du bâtiment', 'Construction workers and foremen'),
      intro: INTRO.site, benefits: ['pay', 'start', 'license', 'longterm', 'region'], badge: BADGE.now,
      positions: [t('Encarregado de obra', 'Vorarbeiter Bau', 'Chef d’équipe', 'Site foreman'), t('Oficial de construção civil', 'Facharbeiter A', 'Ouvrier qualifié', 'Skilled construction worker'), t('Servente de obra', 'Hilfsarbeiter Bau', 'Manœuvre', 'Construction labourer')] },
    { id: 'pedreiro', label: 'Pedreiros e masseiros', icon: 'construction', photo: 'pedreiro', tag: t('#pedreiro', '#maurer', '#macon', '#bricklayer'),
      headline: t('Pedreiros, masseiros e serventes', 'Maurer und Bauarbeiter', 'Maçons et manœuvres', 'Bricklayers and labourers'),
      intro: INTRO.site, benefits: ['pay', 'start', 'tools', 'longterm', 'region'], badge: BADGE.now,
      positions: [t('Pedreiro com experiência', 'Maurer EFZ / Facharbeiter A', 'Maçon CFC', 'Experienced bricklayer'), t('Masseiro', 'Bauarbeiter Mörtel & Material', 'Manœuvre mortier', 'Mortar mixer'), t('Servente de obra', 'Hilfsarbeiter Bau', 'Aide-maçon', 'Labourer')] },
    { id: 'cofragem', label: 'Cofragistas', icon: 'hammer', photo: 'cofragem', tag: t('#cofragista', '#schaler', '#coffreur', '#formwork'),
      headline: t('Cofragistas e carpinteiros de cofragem', 'Schaler und Schalungsbauer', 'Coffreurs et charpentiers coffreurs', 'Formworkers and formwork carpenters'),
      intro: INTRO.site, benefits: ['pay', 'start', 'overtime', 'longterm', 'region'], badge: BADGE.now,
      positions: [t('Cofragista', 'Schaler', 'Coffreur', 'Formworker'), t('Carpinteiro de cofragem', 'Schalungszimmermann', 'Charpentier coffreur', 'Formwork carpenter'), helper] },
    { id: 'ferro', label: 'Armadores de ferro', icon: 'construction', photo: 'ferro', tag: t('#armadordeferro', '#eisenleger', '#ferrailleur', '#steelfixer'),
      headline: t('Armadores de ferro', 'Eisenleger', 'Ferrailleurs', 'Steel fixers'),
      intro: INTRO.craft, benefits: ['pay', 'overtime', 'tools', 'longterm', 'region'], badge: BADGE.pay,
      positions: [t('Armador de ferro', 'Eisenleger', 'Ferrailleur', 'Steel fixer'), t('Ajudante de armador', 'Hilfseisenleger', 'Aide-ferrailleur', 'Steel fixer’s mate')] },
    { id: 'eletricista', label: 'Eletricistas', icon: 'zap', photo: 'eletricista', tag: t('#eletricista', '#elektriker', '#electricien', '#electrician'),
      headline: t('Eletricistas de obra e manutenção', 'Elektroinstallateure', 'Électriciens', 'Electricians'),
      intro: INTRO.craft, benefits: ['pay', 'start', 'training', 'license', 'region'], badge: BADGE.open,
      positions: [t('Eletricista de 1.ª', 'Elektroinstallateur EFZ', 'Électricien CFC', 'Qualified electrician'), t('Montador de quadros elétricos', 'Schaltanlagenmonteur', 'Monteur de tableaux', 'Panel fitter'), t('Ajudante de eletricista', 'Elektro-Hilfsmonteur', 'Aide-électricien', 'Electrician’s mate')] },
    { id: 'canalizador', label: 'Canalizadores e AVAC', icon: 'droplets', photo: 'canalizador', tag: t('#canalizador', '#sanitaer', '#plombier', '#plumber'),
      headline: t('Canalizadores e técnicos AVAC', 'Sanitär- und Heizungsinstallateure', 'Plombiers et chauffagistes', 'Plumbers and HVAC technicians'),
      intro: INTRO.craft, benefits: ['pay', 'license', 'tools', 'longterm', 'region'], badge: BADGE.open,
      positions: [t('Canalizador', 'Sanitärinstallateur EFZ', 'Installateur sanitaire', 'Plumber'), t('Técnico AVAC', 'Heizungsinstallateur', 'Technicien CVC', 'HVAC technician'), helper] },
    { id: 'pintor', label: 'Pintores e estucadores', icon: 'paint-roller', photo: 'pintor', tag: t('#pintor', '#maler', '#peintre', '#painter'),
      headline: t('Pintores e estucadores', 'Maler und Gipser', 'Peintres et plâtriers', 'Painters and plasterers'),
      intro: INTRO.craft, benefits: ['pay', 'start', 'transport', 'longterm', 'region'], badge: BADGE.now,
      positions: [t('Pintor de construção civil', 'Maler EFZ', 'Peintre en bâtiment', 'Building painter'), t('Estucador', 'Gipser', 'Plâtrier', 'Plasterer'), helper] },
    { id: 'carpinteiro', label: 'Carpinteiros', icon: 'ruler', photo: 'carpinteiro', tag: t('#carpinteiro', '#schreiner', '#menuisier', '#carpenter'),
      headline: t('Carpinteiros e marceneiros', 'Zimmerleute und Schreiner', 'Charpentiers et menuisiers', 'Carpenters and joiners'),
      intro: INTRO.craft, benefits: ['pay', 'tools', 'training', 'longterm', 'region'], badge: BADGE.open,
      positions: [t('Carpinteiro de limpos', 'Schreiner EFZ', 'Menuisier', 'Joiner'), t('Carpinteiro de toscos', 'Zimmermann', 'Charpentier', 'Rough carpenter'), t('Montador de cozinhas', 'Küchenmonteur', 'Monteur de cuisines', 'Kitchen fitter')] },
    { id: 'serralheiro', label: 'Serralheiros e soldadores', icon: 'flame', photo: 'serralheiro', tag: t('#soldador', '#schweisser', '#soudeur', '#welder'),
      headline: t('Serralheiros e soldadores', 'Metallbauer und Schweisser', 'Serruriers et soudeurs', 'Metalworkers and welders'),
      intro: INTRO.stable, benefits: ['pay', 'overtime', 'travel', 'housing', 'longterm'], badge: BADGE.pay,
      positions: [t('Serralheiro civil', 'Metallbauer EFZ', 'Serrurier', 'Metal fabricator'), t('Soldador MIG/MAG', 'Schweisser MIG/MAG', 'Soudeur MIG/MAG', 'MIG/MAG welder'), t('Soldador TIG', 'Schweisser WIG', 'Soudeur TIG', 'TIG welder')] },
    { id: 'ladrilhador', label: 'Ladrilhadores', icon: 'pencil-ruler', photo: 'ladrilhador', tag: t('#ladrilhador', '#plattenleger', '#carreleur', '#tiler'),
      headline: t('Ladrilhadores e assentadores', 'Plattenleger', 'Carreleurs', 'Tilers'),
      intro: INTRO.craft, benefits: ['pay', 'start', 'tools', 'longterm', 'region'], badge: BADGE.now,
      positions: [t('Ladrilhador', 'Plattenleger EFZ', 'Carreleur', 'Tiler'), t('Assentador de pedra', 'Steinleger', 'Poseur de pierre', 'Stone layer'), helper] },
    { id: 'telhados', label: 'Telhadores', icon: 'house', photo: 'telhados', tag: t('#telhados', '#dachdecker', '#couvreur', '#roofer'),
      headline: t('Telhadores e montadores de coberturas', 'Dachdecker', 'Couvreurs', 'Roofers'),
      intro: INTRO.craft, benefits: ['pay', 'insurance', 'tools', 'longterm', 'region'], badge: BADGE.open,
      positions: [t('Telhador', 'Dachdecker EFZ', 'Couvreur', 'Roofer'), t('Montador de painel sandwich', 'Fassaden- und Paneelmonteur', 'Monteur de panneaux', 'Cladding installer'), helper] },
    { id: 'maquinas', label: 'Máquinas e gruas', icon: 'truck', photo: 'maquinas', tag: t('#manobrador', '#baumaschinenfuehrer', '#machiniste', '#plantoperator'),
      headline: t('Manobradores de máquinas e gruistas', 'Baumaschinenführer und Kranführer', 'Machinistes et grutiers', 'Plant operators and crane drivers'),
      intro: INTRO.stable, benefits: ['pay', 'overtime', 'license', 'longterm', 'region'], badge: BADGE.pay,
      positions: [t('Manobrador de giratória', 'Baggerführer', 'Conducteur de pelle', 'Excavator operator'), t('Gruista', 'Kranführer', 'Grutier', 'Crane operator'), t('Motorista de pesados', 'LKW-Fahrer Kat. C', 'Chauffeur poids lourd', 'HGV driver')] },
    { id: 'pladur', label: 'Pladur e tetos', icon: 'layers', photo: 'pladur', tag: t('#pladur', '#trockenbau', '#plaquiste', '#drywall'),
      headline: t('Montadores de pladur e tetos falsos', 'Trockenbauer', 'Plaquistes', 'Drywall installers'),
      intro: INTRO.craft, benefits: ['pay', 'start', 'tools', 'longterm', 'region'], badge: BADGE.now,
      positions: [t('Montador de pladur', 'Trockenbaumonteur', 'Plaquiste', 'Drywall fitter'), t('Montador de tetos falsos', 'Deckenmonteur', 'Monteur de faux plafonds', 'Ceiling fitter'), helper] },
    { id: 'servente', label: 'Serventes', icon: 'users', photo: 'servente', tag: t('#servente', '#hilfsarbeiter', '#manoeuvre', '#labourer'),
      headline: t('Serventes e ajudantes de obra', 'Hilfsarbeiter Bau', 'Manœuvres de chantier', 'Construction labourers'),
      intro: INTRO.site, benefits: ['pay', 'start', 'transport', 'housing', 'longterm'], badge: BADGE.now,
      positions: [t('Servente de obra', 'Hilfsarbeiter', 'Manœuvre', 'Labourer'), t('Ajudante de pedreiro', 'Maurerhilfe', 'Aide-maçon', 'Bricklayer’s mate'), t('Ajudante de armazém de obra', 'Magazinhilfe Baustelle', 'Aide-magasinier chantier', 'Site store helper')] },
    { id: 'tecnico', label: 'Técnicos de obra', icon: 'pencil-ruler', photo: 'tecnico', tag: t('#engenharia', '#bauleiter', '#conducteurdetravaux', '#sitemanager'),
      headline: t('Técnicos e engenheiros de obra', 'Bauleiter und Bautechniker', 'Conducteurs de travaux', 'Site managers and engineers'),
      intro: INTRO.stable, benefits: ['pay', 'training', 'license', 'longterm', 'region'], badge: BADGE.open,
      positions: [t('Diretor de obra', 'Bauleiter', 'Conducteur de travaux', 'Site manager'), t('Medidor-orçamentista', 'Kalkulator Bau', 'Métreur', 'Quantity surveyor'), t('Técnico de segurança', 'Sicherheitsbeauftragter', 'Technicien sécurité', 'Safety officer')] },
  ];
  const byId = Object.fromEntries(LIST.map((x) => [x.id, x]));

  // One person of each trade, singular, as used inside a sentence ("Vi o anúncio
  // para pedreiro"), for the pre-written WhatsApp message. Covers it and es too.
  const NOUN = {
    obras: { pt: 'trabalhador de obra', de: 'Bauarbeiter', fr: 'ouvrier du bâtiment', it: 'operaio edile', en: 'construction worker', es: 'obrero de la construcción' },
    pedreiro: { pt: 'pedreiro', de: 'Maurer', fr: 'maçon', it: 'muratore', en: 'bricklayer', es: 'albañil' },
    cofragem: { pt: 'cofragista', de: 'Schaler', fr: 'coffreur', it: 'carpentiere edile', en: 'formworker', es: 'encofrador' },
    ferro: { pt: 'armador de ferro', de: 'Eisenleger', fr: 'ferrailleur', it: 'ferraiolo', en: 'steel fixer', es: 'ferrallista' },
    eletricista: { pt: 'eletricista', de: 'Elektriker', fr: 'électricien', it: 'elettricista', en: 'electrician', es: 'electricista' },
    canalizador: { pt: 'canalizador', de: 'Sanitärinstallateur', fr: 'plombier', it: 'idraulico', en: 'plumber', es: 'fontanero' },
    pintor: { pt: 'pintor', de: 'Maler', fr: 'peintre', it: 'pittore edile', en: 'painter', es: 'pintor' },
    carpinteiro: { pt: 'carpinteiro', de: 'Schreiner', fr: 'menuisier', it: 'falegname', en: 'carpenter', es: 'carpintero' },
    serralheiro: { pt: 'serralheiro', de: 'Metallbauer', fr: 'serrurier', it: 'fabbro', en: 'metalworker', es: 'cerrajero' },
    ladrilhador: { pt: 'ladrilhador', de: 'Plattenleger', fr: 'carreleur', it: 'piastrellista', en: 'tiler', es: 'alicatador' },
    telhados: { pt: 'telhador', de: 'Dachdecker', fr: 'couvreur', it: 'copritetto', en: 'roofer', es: 'techador' },
    maquinas: { pt: 'manobrador de máquinas', de: 'Baumaschinenführer', fr: 'machiniste', it: 'operatore di macchine', en: 'plant operator', es: 'operador de maquinaria' },
    pladur: { pt: 'montador de pladur', de: 'Trockenbauer', fr: 'plaquiste', it: 'cartongessista', en: 'drywall installer', es: 'instalador de pladur' },
    servente: { pt: 'servente', de: 'Hilfsarbeiter', fr: 'manœuvre', it: 'manovale', en: 'labourer', es: 'peón' },
    tecnico: { pt: 'técnico de obra', de: 'Bauleiter', fr: 'conducteur de travaux', it: 'tecnico di cantiere', en: 'site manager', es: 'técnico de obra' },
  };
  const NOUN_LANG = { 'pt-PT': 'pt', 'de-CH': 'de', 'de-DE': 'de', fr: 'fr', it: 'it', en: 'en', es: 'es' };

  const pick = (obj, lang) => (obj ? obj[lang] || obj.pt : '');
  const known = (ids) => (Array.isArray(ids) ? ids : [ids]).filter((id) => byId[id]);

  function nouns(tradeIds, locale) {
    const lang = NOUN_LANG[locale] || 'pt';
    return known(tradeIds).map((id) => NOUN[id][lang] || NOUN[id].pt);
  }

  // Texts for a new poster in one language: those of the first trade, with the
  // positions of every trade (no repeats). Position keys say which trade they
  // came from ("pos:<trade>:<index>") so a later translation finds them.
  function textsFor(tradeIds, locale) {
    const ids = known(tradeIds);
    const tr = byId[ids[0]] || LIST[0];
    const lang = langOf(locale) || 'pt';
    const positions = [];
    for (const id of ids.length ? ids : [tr.id]) {
      byId[id].positions.forEach((p, i) => {
        const text = p[lang];
        if (!positions.some((x) => x.text.trim() === text.trim())) positions.push({ id: uid(), key: `pos:${id}:${i}`, text });
      });
    }
    return {
      kicker: KICKER[lang],
      headline: pick(tr.headline, lang),
      intro: pick(tr.intro, lang),
      benefits: tr.benefits.map((k) => ({ id: uid(), key: k, icon: P[k].icon, text: P[k][lang] })),
      positionsTitle: POS_TITLE[lang],
      positions,
      contacts: CONTACTS[lang].map(([icon, text]) => ({ id: uid(), icon, text })),
      badge: pick(tr.badge, lang),
      qr: '',
    };
  }
  const texts = (id, locale) => textsFor([id], locale);

  // Copies `src` texts (in locale `from`) to locale `to`: every text still equal to
  // the preset (or to a stock label) is replaced by its translation. `tradeIds` is
  // the ad's trade list (or one id); old "pos<i>" keys mean the first trade.
  function translate(src, tradeIds, from, to) {
    const a = langOf(from), b = langOf(to);
    if (!a || !b || a === b) return src;
    const out = JSON.parse(JSON.stringify(src));
    const same = (x, y) => String(x || '').trim() === String(y || '').trim();
    const swap = (field, table) => { if (table && same(out[field], table[a])) out[field] = table[b]; };
    swap('kicker', KICKER);
    swap('positionsTitle', POS_TITLE);
    const main = byId[known(tradeIds)[0]];
    if (main) {
      swap('headline', main.headline);
      swap('intro', main.intro);
      swap('badge', main.badge);
    }
    for (const it of out.positions || []) {
      const key = it.key || '';
      const multi = /^pos:([a-z]+):(\d+)$/.exec(key);
      const old = /^pos(\d+)$/.exec(key);
      const p = multi ? byId[multi[1]] && byId[multi[1]].positions[+multi[2]] : old && main ? main.positions[+old[1]] : null;
      if (p && same(it.text, p[a])) it.text = p[b];
    }
    for (const it of out.benefits || []) {
      const ph = P[it.key];
      if (ph && same(it.text, ph[a])) it.text = ph[b];
    }
    return out;
  }

  function hashtagsFor(tradeIds, locale) {
    const lang = langOf(locale) || 'pt';
    const tags = [HASH[lang] || HASH.pt, ...known(tradeIds).map((id) => pick(byId[id].tag, lang))].join(' ').split(' ').filter(Boolean);
    return [...new Set(tags)].join(' ');
  }
  const hashtags = (tradeId, locale) => hashtagsFor([tradeId], locale);

  return { list: LIST, get: (id) => byId[id] || null, nouns, texts, textsFor, translate, hashtags, hashtagsFor, langOf, PHRASES: P };
})();
