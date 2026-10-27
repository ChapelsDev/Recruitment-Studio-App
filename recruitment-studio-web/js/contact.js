// «Fala comigo»: the recruiter's WhatsApp number, the message a candidate sends
// (pre-written, editable, never with a code in it) and the wa.me links used by
// the QR, the poster pill, the post text and «Mostrar QR».
window.RS = window.RS || {};

RS.contact = (() => {
  const COUNTRIES = [
    { code: '351', label: 'Portugal +351' },
    { code: '41', label: 'Suíça +41' },
    { code: '49', label: 'Alemanha +49' },
    { code: '33', label: 'França +33' },
    { code: '352', label: 'Luxemburgo +352' },
    { code: '34', label: 'Espanha +34' },
    { code: '39', label: 'Itália +39' },
    { code: '44', label: 'Reino Unido +44' },
  ];
  const AND = { 'pt-PT': 'e', 'de-CH': 'und', 'de-DE': 'und', fr: 'et', it: 'e', en: 'and', es: 'y' };

  // A number copied with its country code but without "+" ("351 912 345 678")
  // must not get the code twice. Where national numbers have one length (after
  // the trunk 0), code + that length means it is already international;
  // German and Luxembourg numbers never begin with their code; Italian mobiles
  // can begin with 39, so Italy is never guessed.
  const NATIONAL_LENGTH = { '351': 9, '41': 9, '33': 9, '34': 9, '44': 10 };
  const NEVER_NATIONAL = { '49': true, '352': true };
  function typedWithCode(cc, d) {
    if (!cc || !d.startsWith(cc)) return false;
    return NATIONAL_LENGTH[cc] ? d.length === cc.length + NATIONAL_LENGTH[cc] : !!NEVER_NATIONAL[cc];
  }

  // International digits without "+", or null when the number cannot be used.
  // "+…" (also "(+…)") and "00…" are already international; otherwise one
  // leading 0 (trunk prefix) is dropped, except in Italy where it belongs to
  // the number.
  function digits(country, number) {
    const raw = String(number || '').trim().replace(/^\(\s*/, '');
    const cc = String(country || '');
    let d = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) { /* already international */ }
    else if (d.startsWith('00')) d = d.slice(2);
    else if (typedWithCode(cc, d)) { /* already international, without "+" */ }
    else {
      if (cc !== '39' && d.startsWith('0')) d = d.slice(1);
      d = cc + d;
    }
    return d.length >= 8 && d.length <= 15 ? d : null;
  }

  // The country code the digits start with: the chosen one, else the code the
  // person typed («+41 …» with Portugal chosen), longest codes first.
  const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  function display(country, number) {
    const d = digits(country, number);
    if (!d) return '';
    const known = BY_LENGTH.find((c) => d.startsWith(c.code));
    const cc = country && d.startsWith(country) ? country : known ? known.code : '';
    const national = d.slice(cc.length).replace(/(\d{3})(?=\d)/g, '$1 ');
    return cc ? `+${cc} ${national}` : `+${national}`;
  }

  const waLink = (d, message) => `https://wa.me/${d}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

  function joinList(items, locale) {
    if (items.length < 2) return items[0] || '';
    return `${items.slice(0, -1).join(', ')} ${AND[locale] || AND['pt-PT']} ${items[items.length - 1]}`;
  }

  function defaultMessage(tradeIds, locale, template) {
    const S = RS.model.STOCK;
    const names = RS.trades.nouns(tradeIds || [], locale);
    if (!names.length || names.length > 3) return S.waMsgAny[locale] || S.waMsgAny['pt-PT'];
    // {profissões}, also typed without the tilde or with capitals.
    return (template || S.waMsg[locale] || S.waMsg['pt-PT']).replace(/\{profiss[õoÕO]es\}/gi, () => joinList(names, locale));
  }

  function adMessage(project, locale) {
    const own = project.texts && project.texts[locale] && project.texts[locale].waMessage;
    if (own && own.trim()) return own;
    return defaultMessage(project.trades, locale, (project.waTemplates || {})[locale]);
  }

  function adLink(project, locale) {
    const w = project.whatsapp;
    const d = w && digits(w.country, w.number);
    return d ? waLink(d, adMessage(project, locale)) : null;
  }

  function meetLink(country, number, locale) {
    const d = digits(country, number);
    const S = RS.model.STOCK;
    return d ? waLink(d, S.waMeet[locale] || S.waMeet['pt-PT']) : null;
  }

  return { COUNTRIES, digits, display, waLink, defaultMessage, adMessage, adLink, meetLink };
})();
