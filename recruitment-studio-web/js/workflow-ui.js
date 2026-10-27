// UI for campaign organisation and translation review, shared by home/editor.
window.RS = window.RS || {};
RS.workflowUI = ({ Icon, ListEditor }) => {
  const { html, useState, useEffect, useRef } = window.htmPreact;
  const M = RS.model, W = RS.workflow;
  function Modal({ title, className, onClose, busy, children }) {
    const ref = useRef();
    useEffect(() => {
      const previous = document.activeElement;
      ref.current.focus();
      return () => { if (previous && previous.isConnected) previous.focus(); };
    }, []);
    const keyDown = (e) => {
      if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const els = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')].filter((el) => !el.closest('[hidden]'));
      const first = els[0], last = els[els.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    };
    return html`<div class="modal-back workflow-back" onMouseDown=${(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div class=${`modal workflow-modal ${className}`} role="dialog" aria-modal="true" aria-label=${title} tabIndex="-1" ref=${ref} onKeyDown=${keyDown}>
        <header class="modal-head"><h2>${title}</h2><button class="icon-btn" aria-label=${`Fechar ${title.toLowerCase()}`} disabled=${busy} onClick=${onClose}><${Icon} name="x" /></button></header>
        ${children}
      </div>
    </div>`;
  }
  function OrganizationDialog({ project, onSave, onClose }) {
    const [draft, setDraft] = useState(() => M.cleanOrganization(project.organization));
    const [tags, setTags] = useState(() => M.cleanOrganization(project.organization).tags.join(', '));
    const [campaigns, setCampaigns] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const pending = useRef(false);
    useEffect(() => { let live = true; RS.store.listProjects().then((rs) => { if (live) setCampaigns(W.facets(rs).campaigns); }).catch(() => {}); return () => { live = false; }; }, []);
    const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
    const save = async (e) => {
      e.preventDefault(); if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try { await onSave(M.cleanOrganization({ ...draft, tags: tags.split(',') })); onClose(); }
      catch (err) { setError(err.message || 'Não foi possível guardar. Tente de novo.'); }
      finally { pending.current = false; setBusy(false); }
    };
    return html`<${Modal} title="Organizar anúncio" className="organization" onClose=${onClose} busy=${busy}>
      <form onSubmit=${save}>
        <p class="workflow-intro">Agrupe este anúncio e acompanhe o seu estado. Estes dados são só para si.</p>
        <fieldset disabled=${busy} class="organization-fields">
          ${[['campaign', 'Campanha', 'Ex.: Recrutamento de verão'], ['client', 'Cliente / empresa', 'Ex.: Obras Norte'], ['location', 'Localização', 'Ex.: Lisboa']].map(([key, label, placeholder]) => html`<div class="field" key=${key}>
            <label for=${`org-${key}`}>${label}</label><input type="text" id=${`org-${key}`} value=${draft[key]} maxlength="120" placeholder=${placeholder} list=${key === 'campaign' ? 'campaign-options' : undefined} onInput=${(e) => set(key, e.target.value)} />
          </div>`)}
          <datalist id="campaign-options">${campaigns.map((v) => html`<option key=${v} value=${v} />`)}</datalist>
          <div class="field"><label for="org-tags">Etiquetas</label><input type="text" id="org-tags" value=${tags} onInput=${(e) => setTags(e.target.value)} placeholder="Ex.: urgente, pedreiros, Suíça" /><small class="field-hint">Separe por vírgulas. Até 12 etiquetas.</small></div>
          <div class="field"><label for="org-status">Estado</label><select id="org-status" value=${draft.status} onChange=${(e) => set('status', e.target.value)}>${Object.entries(M.STATUSES).map(([id, label]) => html`<option key=${id} value=${id}>${label}</option>`)}</select></div>
          <label class="check"><input type="checkbox" checked=${draft.favorite} onChange=${(e) => set('favorite', e.target.checked)} /> Favorito</label>
        </fieldset>
        ${error && html`<p class="workflow-error" role="alert">${error}</p>`}
        <footer class="workflow-actions"><button type="button" class="btn ghost" onClick=${onClose} disabled=${busy}>Cancelar</button><button class="btn primary" type="submit" disabled=${busy} aria-busy=${busy}>${busy ? 'A guardar…' : 'Guardar organização'}</button></footer>
      </form>
    <//>`;
  }
  function HomeFilters({ records, filters, onChange }) {
    const f = { ...W.DEFAULT_FILTERS, ...filters }, options = W.facets(records);
    const set = (key, value) => onChange({ ...f, [key]: value });
    const active = Object.keys(W.DEFAULT_FILTERS).some((k) => f[k] !== W.DEFAULT_FILTERS[k]);
    // the filters fold behind «Filtros» (the search stays out); how many are on shows on the button
    const on = ['campaign', 'status', 'tag', 'favorite'].filter((k) => f[k] !== W.DEFAULT_FILTERS[k]).length + (f.sort !== W.DEFAULT_FILTERS.sort ? 1 : 0);
    const [open, setOpen] = useState(false);
    return html`<section class="home-filters" aria-label="Pesquisar e filtrar anúncios">
      <div class="field home-search"><label for="project-search">Pesquisar anúncios</label><input id="project-search" type="search" value=${f.query} placeholder="Nome, cliente, profissão, localização…" onInput=${(e) => set('query', e.target.value)} /></div>
      <button class=${'btn ghost filters-toggle' + (on ? ' on' : '')} aria-expanded=${open} aria-controls="home-filter-fields" onClick=${() => setOpen(!open)}>
        <${Icon} name="sliders-horizontal" size=${16} /> Filtros${on ? ` (${on})` : ''}</button>
      ${active && html`<button class="btn link clear-filters" onClick=${() => onChange({ ...W.DEFAULT_FILTERS })}>Limpar filtros</button>`}
      <div class="home-filter-fields" id="home-filter-fields" hidden=${!open}>
      <div class="field"><label for="filter-campaign">Campanha</label><select id="filter-campaign" value=${f.campaign} onChange=${(e) => set('campaign', e.target.value)}><option value="">Todas as campanhas</option>${[...new Set([...options.campaigns, f.campaign].filter(Boolean))].map((v) => html`<option key=${v} value=${v}>${v}</option>`)}</select></div>
      <div class="field"><label for="filter-status">Estado</label><select id="filter-status" value=${f.status} onChange=${(e) => set('status', e.target.value)}><option value="">Todos os estados</option>${Object.entries(M.STATUSES).map(([id, label]) => html`<option key=${id} value=${id}>${label}</option>`)}</select></div>
      <div class="field"><label for="filter-tag">Etiqueta</label><select id="filter-tag" value=${f.tag} onChange=${(e) => set('tag', e.target.value)}><option value="">Todas as etiquetas</option>${[...new Set([...options.tags, f.tag].filter(Boolean))].map((v) => html`<option key=${v} value=${v}>${v}</option>`)}</select></div>
      <div class="field"><label for="filter-sort">Ordenar</label><select id="filter-sort" value=${f.sort} onChange=${(e) => set('sort', e.target.value)}><option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option><option value="name">Nome A–Z</option></select></div>
      <button class="btn ghost favorite-filter" aria-pressed=${f.favorite} onClick=${() => set('favorite', !f.favorite)}><${Icon} name="star" size=${16} /> Favoritos</button>
      </div>
    </section>`;
  }
  const STATUS = { reviewed: 'Revisto', stale: 'Original alterado', copied: 'Igual ao original', missing: 'Por traduzir', pending: 'Por rever' };
  function TranslationDialog({ project, update, initialLocale, onClose, onEditVideo }) {
    const targets = project.locales.filter((c) => W.sourceLocale(project, c));
    const [code, setCode] = useState(targets.includes(initialLocale) ? initialLocale : targets[0]);
    const [onlyPending, setOnlyPending] = useState(false);
    const [catalogue, setCatalogue] = useState(null), [phraseNotice, setPhraseNotice] = useState(''), [phraseError, setPhraseError] = useState('');
    const saving = useRef(false);
    useEffect(() => { let live = true; RS.store.getCatalog().then((c) => { if (live) setCatalogue(c); }).catch(() => {}); return () => { live = false; }; }, []);
    const rows = W.reviewRows(project, code), from = W.sourceLocale(project, code);
    const pending = rows.filter((r) => r.status !== 'reviewed').length;
    const shown = onlyPending ? rows.filter((r) => r.status !== 'reviewed') : rows;
    const edit = (key, value, coalesce) => update((p) => W.editTranslation(p, code, key, value), coalesce ? { coalesce: `translation:${code}:${coalesce}` } : {});
    const savePhrase = async (row) => {
      if (saving.current) return; saving.current = true; setPhraseError(''); setPhraseNotice('');
      try {
        const value = RS.reuse.capturePhrase(project, row.key, `${row.label}: ${row.source.slice(0, 60)}`);
        value.values = { [from]: row.source, [code]: row.target }; value.approved = { ...value.values };
        setCatalogue(await RS.store.updateCatalog((c) => {
          const existing = c.phrases.find((p) => p.field === row.key && p.client === value.client && p.trade === value.trade && p.values[from] === row.source && p.values[code] === row.target);
          if (existing) Object.assign(value, { id: existing.id, name: existing.name, values: { ...existing.values, ...value.values }, approved: { ...existing.approved, ...value.approved } });
          return RS.reuse.mutate(c, { type: 'save', kind: 'phrase', id: value.id, value });
        })); setPhraseNotice('Tradução guardada para este cliente e profissão.');
      } catch (e) { setPhraseError(e.message || 'Não foi possível guardar a tradução.'); }
      finally { saving.current = false; }
    };
    return html`<${Modal} title="Rever traduções" className="translations" onClose=${onClose}>
      <div class="translation-toolbar">
        <div class="field"><label for="review-locale">Tradução</label><select id="review-locale" value=${code} onChange=${(e) => setCode(e.target.value)}>${targets.map((c) => html`<option key=${c} value=${c}>${M.localeInfo(c).label}</option>`)}</select></div>
        <p role="status">${pending ? `${pending} ${pending === 1 ? 'bloco por rever' : 'blocos por rever'}` : 'Todos os blocos revistos'}</p>
        <label class="check"><input type="checkbox" checked=${onlyPending} onChange=${(e) => setOnlyPending(e.target.checked)} /> Só pendentes</label>
      </div>
      <p class="workflow-intro">Compare com ${M.localeInfo(from).label}, edite e marque cada bloco como revisto. Textos personalizados precisam de tradução manual. Pode confirmar uma omissão intencional.</p>
      ${phraseNotice && html`<p class="library-notice" role="status">${phraseNotice}</p>`}${phraseError && html`<p class="workflow-error" role="alert">${phraseError}</p>`}
      <div class="translation-rows">
        ${shown.map((row) => html`<section key=${`${code}:${row.key}`} class=${`translation-row ${row.status}`} data-review-field=${row.key}>
          <header><h3>${row.label}</h3><span class=${`review-status ${row.status}`}>${STATUS[row.status]}</span></header>
          <div class="translation-columns">
            <div class="translation-source"><span class="translation-label">Original · ${M.localeInfo(from).short}</span><p>${row.source || 'Sem texto'}</p></div>
            <div class="translation-target"><label class="translation-label" for=${row.list || row.key === 'video' ? undefined : `review-${row.key}`}>${M.localeInfo(code).label}</label>
              ${row.key === 'video' ? html`<p class="translation-video-text">${row.target || 'Sem texto'}</p><button class="btn ghost sm" onClick=${() => onEditVideo(code)}>Editar textos do vídeo</button>`
                : row.list ? html`<${ListEditor} items=${project.texts[code][row.key]} prefix=${`review-${code}-${row.key}`} coalesce=${row.key} itemLabel=${row.label} addLabel="Adicionar linha" placeholder="Tradução" onChange=${(items, group) => edit(row.key, items, group)} />`
                : html`<textarea id=${`review-${row.key}`} aria-label=${`${row.label} em ${M.localeInfo(code).label}`} rows=${row.key === 'caption' ? 6 : 2} value=${row.target} onInput=${(e) => edit(row.key, e.target.value, row.key)} />`}
              ${row.key === 'caption' && html`<small class="field-hint">Editar aqui guarda um texto personalizado para esta língua.</small>`}
              ${RS.reuse.suggestPhrases(catalogue, project, row.key, from, code, row.source).filter((p) => p.values[code] !== row.target).map((phrase) => html`<details class="phrase-suggestion" key=${phrase.id}><summary>Tradução guardada · ${phrase.name}</summary><p>${phrase.values[code]}</p><button class="btn sm" onClick=${() => update((p) => RS.reuse.applyPhrase(p, phrase, [code]))}>Usar esta tradução e rever</button></details>`)}
            </div>
          </div>
          <footer><button class="btn ghost sm" disabled=${row.status === 'reviewed'} onClick=${() => update((p) => W.markReviewed(p, code, row.key))}><${Icon} name="check" size=${15} /> ${row.status === 'reviewed' ? 'Revisto' : 'Marcar como revisto'}</button>
            ${row.status === 'reviewed' && RS.reuse.PHRASE_FIELDS[row.key] && row.source.trim() && row.target.trim() && html`<button class="btn ghost sm" onClick=${() => savePhrase(row)}>Guardar tradução aprovada</button>`}</footer>
        </section>`)}
        ${!shown.length && html`<p class="workflow-empty">Não há blocos pendentes nesta língua.</p>`}
      </div>
    <//>`;
  }
  // (the editor's management tools — Organizar, Marcas e modelos, Rever traduções,
  // Rever publicação — live in its ⋯ menu since 2026-10-27: app.js EditorMenu)
  return { Modal, OrganizationDialog, HomeFilters, TranslationDialog };
};
