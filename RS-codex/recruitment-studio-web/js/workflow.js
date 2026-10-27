// Campaign organisation, translation review and export checks. No network calls.
window.RS = window.RS || {};
RS.workflow = (() => {
  const M = RS.model;
  const DEFAULT_FILTERS = { query: '', campaign: '', status: '', tag: '', favorite: false, sort: 'recent' };
  function selectProjects(records, filters = {}) {
    const f = { ...DEFAULT_FILTERS, ...filters }, terms = M.foldText(f.query).split(/\s+/).filter(Boolean);
    return records.filter((r) => {
      if (r.deletedAt) return false;
      const p = r.data, o = M.cleanOrganization(p.organization);
      if (f.campaign && o.campaign !== f.campaign || f.status && o.status !== f.status || f.tag && !o.tags.includes(f.tag) || f.favorite && !o.favorite) return false;
      const content = Object.values(p.texts || {}).flatMap((t) => [t.headline, t.intro, ...(t.benefits || []).map((x) => x.text), ...(t.positions || []).map((x) => x.text)]);
      const haystack = M.foldText([p.name, o.campaign, o.client, o.location, ...o.tags, ...content].join(' '));
      return terms.every((term) => haystack.includes(term));
    }).sort((a, b) => f.sort === 'name' ? (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id)
      : (f.sort === 'oldest' ? 1 : -1) * ((a.updatedAt || 0) - (b.updatedAt || 0)) || a.id.localeCompare(b.id));
  }
  function facets(records) {
    const orgs = records.filter((r) => !r.deletedAt).map((r) => M.cleanOrganization(r.data.organization));
    const unique = (v) => [...new Set(v.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    return { campaigns: unique(orgs.map((o) => o.campaign)), tags: unique(orgs.flatMap((o) => o.tags)) };
  }

  const FIELDS = [
    ['kicker', 'Chamada'], ['headline', 'Título principal'], ['intro', 'Introdução'],
    ['benefits', 'Vantagens', true], ['positionsTitle', 'Título das vagas'], ['positions', 'Vagas', true],
    ['badge', 'Selo'], ['contacts', 'Contactos', true], ['qr', 'Link do QR'], ['waMessage', 'Mensagem do WhatsApp'],
    ['caption', 'Texto da publicação'], ['video', 'Textos do vídeo'],
  ];
  function reviewValue(p, code, key) {
    if (key === 'caption') return M.publicationText(p, code);
    if (key === 'video') {
      const vt = p.video && p.video.texts || {};
      // An unmodified video follows the image, already reviewed field by field.
      if (!Object.values(vt).some((v) => Object.keys(v).length) || !RS.motionTimeline) return '';
      const c = RS.motionTimeline.content(p, code);
      const lines = [c.kicker, c.headline, c.intro, ...c.benefits,
        ...c.highlights.map((v) => [v.value, v.label].filter(Boolean).join(' ')), c.positionsTitle, ...c.positions,
        ...c.contacts, c.message, c.contact && c.contact.cta, c.contact && c.contact.hint, c.closing, c.brandName];
      const style = RS.motion && RS.motion.styleOf(p.video.motion);
      const recipe = style && style.recipe;
      for (const [key, defaults] of Object.entries(recipe && recipe.labels || {})) lines.push(c.labelFor(recipe.id, key, defaults));
      return lines.filter(Boolean).join('\n');
    }
    if (key === 'waMessage') return RS.contact.adMessage(p, code);
    const value = p.texts[code][key];
    return Array.isArray(value) ? value.map((x) => x.text).join('\n') : value || '';
  }
  function sourceLocale(p, code) {
    const r = p.translationReview && p.translationReview[code];
    if (r && r.source !== code && p.locales.includes(r.source)) return r.source;
    return p.locales[0] !== code ? p.locales[0] : null;
  }
  function reviewRows(p, code) {
    const from = sourceLocale(p, code);
    if (!from) return [];
    const record = p.translationReview && p.translationReview[code];
    return FIELDS.map(([key, label, list]) => {
      const source = reviewValue(p, from, key), target = reviewValue(p, code, key);
      const kept = record && record.source === from && record.fields && record.fields[key];
      let status = 'pending';
      if (kept && kept.source !== source) status = 'stale';
      else if (kept && kept.reviewed && kept.target === target) status = 'reviewed';
      else if (source.trim() && !target.trim()) status = 'missing';
      else if (source.trim() && source === target) status = 'copied';
      return { key, label, list: !!list, source, target, status, from };
    }).filter((row) => row.source.trim() || row.target.trim() || row.status === 'stale');
  }
  function seedReview(p, code, from) {
    p.translationReview = { ...(p.translationReview || {}), [code]: { source: from, fields: {} } };
    for (const row of reviewRows(p, code)) p.translationReview[code].fields[row.key] = { source: row.source, target: row.target, reviewed: false };
  }
  function markReviewed(p, code, key) {
    const row = reviewRows(p, code).find((r) => r.key === key);
    if (!row) return;
    const record = p.translationReview && p.translationReview[code];
    p.translationReview = { ...(p.translationReview || {}), [code]: { source: row.from,
      fields: { ...(record && record.source === row.from ? record.fields : {}), [key]: { source: row.source, target: row.target, reviewed: true } } } };
  }
  function editTranslation(p, code, key, value) {
    if (key === 'caption') M.setPublicationText(p, code, value);
    else if (key !== 'video') p.texts[code][key] = value;
  }

  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function publicationSignature(project, locale) {
    const p = M.normalize(project);
    return JSON.stringify({ texts: p.texts[locale], caption: M.publicationText(p, locale), offer: p.offer, brand: p.brand, style: p.style, show: p.show,
      photo: p.photo, logo: p.logo, template: p.template, whatsapp: p.whatsapp, message: RS.contact.adMessage(p, locale), qrMode: p.qrMode,
      carousel: p.carousel.locales[locale], video: { ...p.video, cover: p.video.cover[locale], texts: p.video.texts[locale] } });
  }
  function setPublished(plan, project, locale, channel, published, today = localDate()) {
    const previous = plan.entries[locale]?.[channel] || {};
    plan.entries[locale] = { ...(plan.entries[locale] || {}), [channel]: { ...previous, published,
      date: published ? previous.date || today : '', signature: published ? publicationSignature(project, locale) : '' } };
  }
  function rebasePublication(before, after) {
    for (const locale of after.locales) {
      const old = publicationSignature(before, locale), next = publicationSignature(after, locale);
      for (const e of Object.values(after.publication?.entries?.[locale] || {})) if (e.published && e.signature === old) e.signature = next;
    }
    return after;
  }
  function publicationTasks(records, today = localDate()) {
    const tasks = { publish: [], review: [], close: [] };
    for (const r of records) {
      const p = r.data; if (r.deletedAt || p.deletedAt || p.organization?.status === 'closed') continue;
      const plan = M.cleanPublication(p.publication, p.locales), missing = [], stale = [];
      if (!plan.plannedDate && !plan.closeDate && !Object.keys(plan.entries).length) continue;
      for (const l of p.locales) {
        const signature = publicationSignature(p, l);
        for (const c of plan.channels) {
          const entry = plan.entries[l]?.[c], label = `${M.localeInfo(l).short} · ${M.CHANNELS[c]}`;
          if (!entry?.published) missing.push(label);
          else if (entry.signature !== signature) stale.push(label);
        }
      }
      const row = (date, details) => ({ id: r.id, name: p.name, date, due: !!date && date <= today, details });
      if (plan.plannedDate && (!plan.channels.length || missing.length)) tasks.publish.push(row(plan.plannedDate, missing.length ? missing : ['Escolher os canais']));
      if (stale.length) tasks.review.push(row('', stale));
      if (plan.closeDate) tasks.close.push(row(plan.closeDate, ['Confirmar encerramento e retirar as publicações']));
    }
    for (const list of Object.values(tasks)) list.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt'));
    return tasks;
  }
  const validURL = (s) => /^(?:https?:\/\/)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i.test(s.trim());
  const usableContact = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) || validURL(s)
    || (/^[+\d\s().-]+$/.test(s.trim()) && s.replace(/\D/g, '').length >= 8 && s.replace(/\D/g, '').length <= 15);
  const contactKey = (v) => /^[+\d\s().-]+$/.test(v.trim()) ? v.replace(/\D/g, '') : M.foldText(v.trim());
  let samples;
  function exampleContact(v) {
    if (!samples) {
      const texts = [...Object.values(M.SAMPLES).map((fn) => fn()), ...M.LOCALES.map((l) => RS.trades.textsFor(['obras'], l.code))];
      samples = new Set(texts.flatMap((t) => t.contacts.map((x) => contactKey(x.text))));
    }
    return samples.has(contactKey(v)) || /(?:@|\b)(?:aempresa|example)\./i.test(v);
  }
  // Rendering reports are provided by the caller so unit tests can exercise
  // checks independently of canvas and the expensive video preparation.
  function preflight(p, { kind = 'image', combos = [], reports = [] } = {}) {
    const out = [], isVideo = kind === 'video' && p.video.motion !== 'poster';
    const add = (id, text, action) => out.push({ id, kind: 'warn', text, ...action });
    if (!combos.length) return out;
    if (!p.photo && !isVideo) add('photo', 'Sem fotografia: será usada a ilustração do modelo.', { field: 'photo', locale: combos[0].l });
    for (const code of [...new Set(combos.map((c) => c.l))]) {
      const label = M.localeInfo(code).short, t = p.texts[code], show = p.show;
      const captionState = M.captionStatus(p, code);
      if (['stale', 'unverified'].includes(captionState)) add(`caption:${code}`, `${label}: ${captionState === 'stale' ? 'a oferta ou os contactos mudaram depois da edição do texto da publicação' : 'o texto personalizado da publicação ainda não foi confirmado com os dados atuais'}. Reveja-o antes de publicar.`, { locale: code, caption: true });
      const c = isVideo ? RS.motionTimeline.content(p, code) : null;
      const ownContacts = c ? c.contacts : show.contacts ? t.contacts.map((x) => x.text) : [];
      const wa = c ? c.contact && c.contact.display : show.contacts && (show.waCta || show.qr && p.qrMode === 'whatsapp') && RS.contact.adLink(p, code) ? RS.contact.display(p.whatsapp.country, p.whatsapp.number) : '';
      const qr = !c && show.contacts && show.qr && p.qrMode === 'link' ? t.qr : '';
      const candidates = [...ownContacts, wa, qr].filter((v) => typeof v === 'string' && v.trim());
      const target = { locale: code, field: 'contact:wa', ...(c ? { videoTab: 'textos' } : {}) };
      if (p.whatsapp && p.whatsapp.number.trim() && !RS.contact.digits(p.whatsapp.country, p.whatsapp.number)) {
        add(`whatsapp:${code}`, `${label}: o número do WhatsApp está incompleto.`, { locale: code, field: 'contact:wa' });
      }
      const sample = t.contacts.find((it) => exampleContact(it.text));
      if (candidates.some(exampleContact)) add(`example:${code}`, `${label}: ainda há contactos de exemplo. Substitua-os pelos seus.`, { ...target, field: sample ? `contact:${sample.id}` : 'contact:wa' });
      if (!candidates.some((s) => usableContact(s) && !exampleContact(s))) add(`contact:${code}`, `${label}: não há um contacto utilizável visível. Confirme telefone, email ou link.`, target);
      if (qr && !validURL(qr)) add(`qr:${code}`, `${label}: o link do QR parece incompleto.`, { locale: code, field: 'qr' });
      if (!(c ? c.headline : t.headline).trim()) add(`headline:${code}`, `${label}: falta o título do anúncio.`, { locale: code, field: 'headline', ...(c ? { videoTab: 'textos' } : {}) });
      const pending = reviewRows(p, code).filter((r) => r.status !== 'reviewed' && (isVideo || r.key !== 'video'));
      if (pending.length) add(`translation:${code}`, `${label}: ${pending.length} ${pending.length === 1 ? 'bloco por rever' : 'blocos por rever'} na tradução${pending.some((r) => r.status === 'stale') ? ', com alterações no original' : ''}.`, { locale: code, review: true });
    }
    for (const { l, f, report, prepared } of reports) {
      const name = `${M.FORMATS[f].label} · ${M.localeInfo(l).short}`;
      const minSize = kind === 'video' ? prepared?.minTextSize || report?.minTextSize : report?.minTextSize;
      if (minSize > 0 && minSize < 26) add(`legibility:${l}:${f}`, `${name}: há texto com ${Math.round(minSize)} px no ficheiro (cerca de ${(minSize / 3).toFixed(1)} px a 360 px de largura). Confirme a leitura ou aumente o texto.`, { locale: l, format: f, ...(isVideo ? { videoTab: 'textos' } : { field: 'headline' }) });
      if (report && report.shrink < 0.7) add(`small:${l}:${f}`, `${name}: o texto ficou pequeno (${Math.round(report.shrink * 100)}%). Encurte-o ou ajuste o aspeto.`, { locale: l, format: f, field: 'headline' });
      if (report && report.photoUpscale > 1.6) add(`resolution:${l}:${f}`, `${name}: a fotografia tem pouca resolução.`, { locale: l, format: f, field: 'photo' });
      if (prepared && isVideo) {
        const lost = RS.motion.leftOut(prepared);
        const count = (n, one, many) => n ? `${n} ${n === 1 ? one : many}` : '';
        const parts = [count(lost.benefits, 'vantagem', 'vantagens'), count(lost.positions, 'vaga', 'vagas'), count(lost.highlights, 'destaque', 'destaques'),
          (lost.intro || !prepared.style.recipe && prepared.content.intro) && 'a introdução', lost.chat && 'a conversa',
          (lost.closing || !prepared.style.recipe && prepared.content.closing) && 'a frase final'].filter(Boolean);
        if (parts.length) add(`omitted:${l}:${f}`, `${name}: o vídeo não inclui ${parts.join(', ')}. Reveja o modelo, a duração ou os textos.`, { locale: l, format: f, videoTab: 'modelo' });
      }
    }
    return out;
  }
  return { DEFAULT_FILTERS, selectProjects, facets, FIELDS, sourceLocale, reviewRows, seedReview, markReviewed, editTranslation, preflight, validURL, usableContact, exampleContact, localDate, publicationSignature, setPublished, rebasePublication, publicationTasks };
})();
