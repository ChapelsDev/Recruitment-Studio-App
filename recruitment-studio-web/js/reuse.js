// Personal library: snapshots, not links to mutable ads.
window.RS = window.RS || {};
RS.reuse = (() => {
  const U = RS.util, M = RS.model;
  const PHRASE_FIELDS = { kicker: 'Chamada', headline: 'Título principal', intro: 'Introdução', benefits: 'Vantagens', positionsTitle: 'Título das vagas', positions: 'Vagas', badge: 'Selo', caption: 'Texto da publicação' };
  function cleanPhrase(value = {}) {
    const values = Object.fromEntries(M.LOCALES.filter((l) => typeof value.values?.[l.code] === 'string').map((l) => [l.code, value.values[l.code].trim().slice(0, 20000)]));
    return { id: value.id || U.uid(), name: String(value.name || '').trim().slice(0, 120), field: PHRASE_FIELDS[value.field] ? value.field : 'benefits',
      client: String(value.client || '').trim().slice(0, 120), trade: RS.trades.get(value.trade)?.id || '', values,
      approved: Object.fromEntries(Object.keys(values).filter((l) => values[l] && value.approved?.[l] === values[l]).map((l) => [l, values[l]])), savedAt: Number(value.savedAt) || 0 };
  }
  function capturePhrase(project, field, name) {
    const values = Object.fromEntries(project.locales.map((code) => {
      const value = field === 'caption' ? M.publicationText(project, code) : project.texts[code][field];
      return [code, Array.isArray(value) ? value.map((v) => v.text).join('\n') : value || ''];
    }));
    return cleanPhrase({ field, name: name || PHRASE_FIELDS[field], client: project.organization?.client, trade: project.trade, values });
  }
  function phraseContext(phrase, project) {
    return (!phrase.client || M.foldText(phrase.client) === M.foldText(project.organization?.client)) && (!phrase.trade || project.trades?.includes(phrase.trade));
  }
  function suggestPhrases(catalogue, project, field, from, to, source) {
    if (!String(source || '').trim()) return [];
    return (catalogue?.phrases || []).filter((p) => p.field === field && phraseContext(p, project)
      && p.values[from] === String(source).trim() && p.approved[from] === p.values[from] && p.values[to] && p.approved[to] === p.values[to]);
  }
  function applyPhrase(project, phrase, locales) {
    const value = cleanPhrase(phrase);
    for (const code of locales) {
      if (!project.locales.includes(code) || !value.values[code] || value.approved[code] !== value.values[code]) continue;
      const text = value.values[code], key = value.field;
      if (key === 'caption') M.setPublicationText(project, code, text);
      else project.texts[code][key] = ['benefits', 'positions'].includes(key) ? text.split('\n').map((v) => v.trim()).filter(Boolean).map((v) => key === 'benefits' ? M.iconItem('check', v) : M.item(v)) : text;
      // Reuse supplies wording, not an approval for a different offer/context.
      for (const review of Object.values(project.translationReview || {})) if (review.fields?.[key]) review.fields[key].reviewed = false;
    }
  }
  function catalog(value, legacy) {
    if (value && value.v === 1) return { ...U.clone(value), phrases: (value.phrases || []).map(cleanPhrase) };
    const brands = legacy ? [{ ...U.clone(legacy), id: 'legacy-brand', label: legacy.name || 'A minha marca' }] : [];
    return { v: 1, brands, templates: [], phrases: [], defaultBrandId: brands[0]?.id || null };
  }
  const defaultBrand = (c) => c.brands.find((b) => b.id === c.defaultBrandId) || null;
  function captureBrand(project, label, id = U.uid()) {
    const p = M.normalize(project);
    if (p.whatsapp?.number?.trim() && !RS.contact.digits(p.whatsapp.country, p.whatsapp.number)) throw new Error('Complete ou retire o número do WhatsApp em Contactos antes de guardar a marca.');
    return { id, label: label.trim().slice(0, 120), name: p.brand.name, tagline: p.brand.tagline,
      logo: p.logo?.asset || null, primary: p.style.primary, accent: p.style.accent,
      fonts: p.style.fonts, upper: p.style.upper, bg: p.style.bg, text: p.style.text, contacts: U.clone(p.texts[p.locale].contacts),
      contactsByLocale: Object.fromEntries(p.locales.map((l) => [l, U.clone(p.texts[l].contacts)])),
      whatsapp: U.clone(p.whatsapp), waTemplates: U.clone(p.waTemplates), savedAt: Date.now() };
  }
  function applyBrand(project, brand) {
    const p = U.clone(project);
    if (!brand) return p;
    if (brand.savedAt) {
      p.brand = { name: brand.name || '', tagline: brand.tagline || '' };
      p.logo = brand.logo ? { asset: brand.logo } : null;
      if (brand.primary && brand.accent) Object.assign(p.style, { primary: brand.primary, accent: brand.accent, customColors: true });
      if (M.FONTS[brand.fonts]) p.style.fonts = brand.fonts;
      for (const key of ['bg', 'text']) if (/^#[0-9a-f]{6}$/i.test(brand[key] || '')) p.style[key] = brand[key];
      if (typeof brand.upper === 'boolean') p.style.upper = brand.upper;
      for (const l of p.locales) p.texts[l].contacts = (brand.contactsByLocale?.[l] || brand.contacts || []).map((c) => M.iconItem(c.icon, c.text));
      // A different company's empty contact must not keep the previous company's number.
      p.whatsapp = U.clone(brand.whatsapp || null);
      p.waTemplates = U.clone(brand.waTemplates || {});
      for (const l of p.locales) {
        p.texts[l].qr = ''; p.texts[l].waMessage = '';
        const vt = p.video?.texts?.[l];
        if (vt) for (const key of ['contacts', 'message', 'brandName']) delete vt[key];
      }
      p.qrMode = 'whatsapp';
    } else if (brand.whatsapp) p.whatsapp = U.clone(brand.whatsapp);
    return p;
  }
  function captureTemplate(project, name, thumb, id = U.uid()) {
    const p = M.normalize(project);
    p.organization = M.cleanOrganization(); p.publication = M.cleanPublication(); p.deletedAt = null;
    return { id, name: name.trim().slice(0, 120), project: p, thumb: thumb || null, savedAt: Date.now() };
  }
  function instantiate(template) {
    const p = M.normalize(template.project);
    p.id = U.uid(); p.name = template.name; p.createdAt = p.updatedAt = Date.now(); p.deletedAt = null;
    p.organization = M.cleanOrganization(); p.publication = M.cleanPublication();
    return p;
  }
  function mutate(c, action) {
    const list = action.kind === 'phrase' ? (c.phrases ||= []) : action.kind === 'template' ? c.templates : c.brands;
    const index = list.findIndex((v) => v.id === action.id);
    if (action.type === 'save') {
      if (!action.value || !(action.value.label || action.value.name || '').trim()) throw new Error('Escreva um nome.');
      if (action.replace && index < 0) throw new Error('Este item já foi removido. Guarde uma nova cópia.');
      const value = action.kind === 'phrase' ? cleanPhrase({ ...action.value, savedAt: Date.now() }) : U.clone(action.value);
      if (index < 0) list.push(value); else list[index] = value;
      if (action.kind === 'brand' && !c.defaultBrandId) c.defaultBrandId = action.value.id;
    } else if (action.type === 'rename') {
      if (index < 0) throw new Error('Este item já foi removido.');
      const name = String(action.name || '').trim().slice(0, 120);
      if (!name) throw new Error('Escreva um nome.');
      list[index][action.kind === 'brand' ? 'label' : 'name'] = name;
    } else if (action.type === 'remove') {
      if (index >= 0) list.splice(index, 1);
      if (action.kind === 'brand' && c.defaultBrandId === action.id) c.defaultBrandId = c.brands[0]?.id || null;
    } else if (action.type === 'default') {
      if (index < 0) throw new Error('Esta marca já foi removida.');
      c.defaultBrandId = action.id;
    }
    return c;
  }
  return { catalog, defaultBrand, captureBrand, applyBrand, captureTemplate, instantiate, mutate, PHRASE_FIELDS, cleanPhrase, capturePhrase, phraseContext, suggestPhrases, applyPhrase };
})();
