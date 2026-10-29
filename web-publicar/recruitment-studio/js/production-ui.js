window.RS = window.RS || {};
RS.productionUI = ({ Icon, Modal, PhotoLibrary, confirmDialog, toast, makeThumb, videoPhotos, afterPaint }) => {
  const { html, useState, useEffect, useRef, useMemo } = window.htmPreact;
  const S = RS.store, R = RS.reuse, P = RS.production, M = RS.model, U = RS.util;
  function VideoTimeline({ prepared, position, onSeek, inputId, label = 'Instante da pré-visualização do vídeo', disabled = false }) {
    const moments = P.videoMoments(prepared), duration = prepared?.timeline.duration || 0;
    const max = prepared ? P.frameTime(prepared, duration) : 1;
    const current = Math.max(0, Math.min(position, max)), locked = disabled || !prepared;
    const active = moments.findLastIndex((m) => m.time <= current + .01);
    const timestamp = (time) => `${String(Math.floor(time / 60)).padStart(2, '0')}:${(time % 60).toFixed(1).padStart(4, '0')}`;
    const previous = [...moments].reverse().find((m) => m.time < current - .05);
    const next = moments.find((m) => m.time > current + .05);
    return html`<div class="video-timeline" role="group" aria-label="Navegação temporal do vídeo">
      <div class="timeline-heading"><span><${Icon} name="video" size=${14} /> Linha temporal</span><span class="timeline-clock"><strong>${timestamp(current)}</strong><span> / ${timestamp(duration)}</span></span></div>
      <label class="video-scrubber"><span class="sr-only">${label}</span><input id=${inputId} class="timeline-range" type="range" aria-label=${label} aria-valuetext=${`${current.toFixed(1)} de ${duration} segundos`} min="0" max=${max} step=${1 / 30} value=${current} disabled=${locked} style=${`--progress:${max ? current / max * 100 : 0}%`} onInput=${(e) => onSeek(Number(e.target.value))} /></label>
      <div class="timeline-navigation">
        <button class="timeline-step" type="button" disabled=${locked || current <= 0} aria-label="Momento anterior" title="Momento anterior" onClick=${() => onSeek(previous?.time || 0)}><${Icon} name="chevron-left" size=${17} /></button>
        <div class="timeline-moments" role="group" aria-label="Momentos do vídeo">${moments.map((m, i) => html`<button key=${`${i}:${m.time}`} class=${`timeline-moment${active === i ? ' on' : ''}`} type="button" aria-current=${active === i ? 'step' : undefined} aria-label=${`${m.label}, ${m.time.toFixed(1)} segundos`} disabled=${locked} onClick=${() => onSeek(m.time)}><span class="moment-time">${timestamp(m.time)}</span><span>${m.label.replace(/^\d+\. /, '')}</span></button>`)}</div>
        <button class="timeline-step" type="button" disabled=${locked || !next} aria-label="Momento seguinte" title="Momento seguinte" onClick=${() => onSeek(next.time)}><${Icon} name="chevron-right" size=${17} /></button>
      </div>
    </div>`;
  }
  function FormatComparison({ project, images, update, onEdit, onClose }) {
    return html`<${Modal} title="Comparar formatos" onClose=${onClose} className="format-comparison">
      <p>Compare a mesma língua nos três formatos. Cada enquadramento é guardado apenas neste formato; as cores e o espelho da fotografia são comuns.</p>
      <div class="format-grid">${M.FORMAT_ORDER.map((format) => html`<${FormatPreview} key=${format} project=${project} images=${images} format=${format} update=${update} onEdit=${onEdit} />`)}</div>
    <//>`;
  }
  function FormatPreview({ project, images, format, update, onEdit }) {
    const ref = useRef(), [report, setReport] = useState(null), [error, setError] = useState('');
    const fmt = M.FORMATS[format], photo = M.photoForFormat(project.photo, format);
    useEffect(() => {
      try {
        const canvas = ref.current; canvas.width = 324; canvas.height = Math.round(fmt.h * .3);
        setReport(RS.engine.render(canvas.getContext('2d'), project, { format, images, scale: .3, mode: 'export' }).report); setError('');
      } catch (e) { setError(e.message || 'Não foi possível desenhar este formato.'); }
    }, [project, images, format]);
    const change = (key, value) => update((p) => M.setPhotoFrame(p, format, { [key]: Number(value) }), { coalesce: `frame-${format}-${key}` });
    return html`<section class="format-card" aria-label=${fmt.label}>
      <h3>${fmt.label} · ${fmt.w} × ${fmt.h}</h3><div class="format-canvas"><canvas ref=${ref} role="img" aria-label=${`Anúncio em ${fmt.label}`} /></div>
      ${error && html`<p role="alert">${error}</p>`}
      ${report?.minTextSize > 0 && html`<p class=${report.minTextSize < 26 ? 'workflow-error' : 'field-hint'}>Texto mais pequeno: ${Math.round(report.minTextSize)} px · cerca de ${(report.minTextSize / 3).toFixed(1)} px a 360 px de largura.</p>`}
      ${report?.photoUpscale > 1.6 && html`<p class="workflow-error">Fotografia com pouca resolução neste formato.</p>`}
      ${photo && html`<fieldset><legend>Enquadramento · ${project.photo.frames?.[format] ? 'próprio' : 'original'}</legend>
        ${[['zoom', 'Aproximar', 1, 3], ['fx', 'Posição horizontal', 0, 1], ['fy', 'Posição vertical', 0, 1]].map(([key, label, min, max]) => html`<label class="frame-range" for=${`frame-${format}-${key}`}>${label}<input id=${`frame-${format}-${key}`} type="range" min=${min} max=${max} step="0.01" value=${photo[key]} onInput=${(e) => change(key, e.target.value)} /></label>`)}
        <button class="btn ghost sm" disabled=${!project.photo.frames?.[format]} onClick=${() => update((p) => M.setPhotoFrame(p, format, null))}>Usar enquadramento original</button>
        <button class="btn ghost sm" onClick=${() => update((p) => { for (const f of M.FORMAT_ORDER) M.setPhotoFrame(p, f, photo); })}>Aplicar aos três formatos</button>
      </fieldset>`}
      <button class="btn sm" onClick=${() => onEdit(format)}>Editar ${fmt.label}</button>
    </section>`;
  }
  function BackupDialog({ onRestore, onClose }) {
    const [info, setInfo] = useState(null), [history, setHistory] = useState(true), [trash, setTrash] = useState(true);
    const [preview, setPreview] = useState(null), [mode, setMode] = useState('copy');
    const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const running = useRef(false), B = RS.backup;
    const refresh = async () => setInfo(await B.storageInfo());
    useEffect(() => { let live = true; B.storageInfo().then((v) => { if (live) setInfo(v); }).catch((e) => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
    const run = async (label, fn) => {
      if (running.current) return; running.current = true; setBusy(label); setError(''); setNotice('');
      try { await afterPaint(); await fn(); } catch (e) { setError(e.message || 'Não foi possível concluir.'); }
      finally { running.current = false; setBusy(''); }
    };
    const save = () => run('A preparar a cópia…', async () => {
      const blob = await B.create({ history, trash, onProgress: setBusy });
      setBusy('A guardar o ficheiro…');
      if (await U.saveBlob(blob, `recruitment-studio-${new Date().toISOString().slice(0, 10)}.rsbackup`, [{ description: 'Cópia global Recruitment Studio', accept: { 'application/json': ['.rsbackup'] } }])) {
        setNotice('Cópia preparada. Confirme que o ficheiro ficou guardado numa pasta segura.');
        await S.setMeta('lastBackup', { at: Date.now(), history, trash }); await refresh(); setPreview(null);
      }
    });
    const open = () => run('A ler e verificar a cópia…', async () => {
      const f = await U.pickFile('.rsbackup,application/json'); if (!f) return;
      setPreview(null); setMode('copy'); setPreview(await B.inspect(f));
    });
    const restore = () => run('A restaurar a cópia…', async () => {
      const result = await B.restore(preview, mode); setPreview(null);
      await onRestore(); await refresh();
      setNotice(`Restauro concluído: ${result.projects} anúncios, ${result.brands} marcas e ${result.templates} modelos. Os restantes dados foram mantidos.`);
    });
    const size = (n) => n == null ? 'indisponível' : `${(n / 1024 / 1024).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} MB`;
    return html`<${Modal} title="Cópias de segurança" className="backup-dialog" onClose=${onClose} busy=${!!busy}>
      <div class="library-body backup-body">
        <p>Guarde toda a biblioteca num ficheiro .rsbackup: anúncios, marcas, modelos, imagens e áudio. Pode levá-lo para outro aparelho.</p>
        ${info && html`<section class="backup-storage" aria-label="Armazenamento">
          <p><strong>Última cópia preparada:</strong> ${info.last ? new Date(info.last.at).toLocaleString('pt-PT') : 'ainda nenhuma neste navegador'}</p>
          <p>Espaço utilizado: ${size(info.usage)}. Limite aproximado: ${size(info.quota)}.</p>
          <p>${!info.available ? 'Apenas nesta sessão: o navegador não permite guardar dados.' : info.persisted === true ? 'O navegador concedeu armazenamento persistente. Mantenha também uma cópia em ficheiro.' : info.persisted === false ? 'O navegador pode libertar estes dados quando faltar espaço.' : 'Este navegador não informa se os dados estão protegidos contra limpeza automática.'}</p>
          ${info.available && info.persisted === false && html`<button class="btn ghost sm" disabled=${!!busy} onClick=${() => run('A pedir proteção dos dados…', async () => { const v = await B.requestPersistence(); setInfo(v); setNotice(v.persisted ? 'Proteção concedida pelo navegador.' : 'O navegador não concedeu proteção. Continue a guardar cópias em ficheiro.'); })}>Pedir proteção dos dados</button>`}
        </section>`}
        <fieldset disabled=${!!busy} class="production-options"><legend>Criar uma cópia</legend>
          <label class="check"><input type="checkbox" checked=${history} onChange=${(e) => setHistory(e.target.checked)} />Incluir histórico de versões</label>
          <label class="check"><input type="checkbox" checked=${trash} onChange=${(e) => setTrash(e.target.checked)} />Incluir anúncios na reciclagem</label>
          <div class="row-btns"><button class="btn primary" onClick=${save}><${Icon} name="save" />Guardar cópia global</button><button class="btn ghost" onClick=${open}><${Icon} name="folder-open" />Abrir cópia para restaurar</button></div>
        </fieldset>
        ${preview && html`<section class="backup-preview" aria-label="Pré-visualização do restauro">
          <h3>Rever antes de restaurar</h3><p>Cópia de ${new Date(preview.archive.savedAt).toLocaleString('pt-PT')}: ${preview.rows.length} itens e ${preview.media.length} recursos.</p>
          <p>${preview.archive.options?.history ? 'Inclui versões anteriores.' : 'Sem histórico na cópia.'} ${preview.archive.projects.some((r) => r.deletedAt) ? 'Os anúncios na reciclagem terão um novo prazo de 30 dias.' : ''}</p>
          <div class="field"><label for="backup-mode">Como restaurar</label><select id="backup-mode" value=${mode} disabled=${!!busy} onChange=${(e) => setMode(e.target.value)}><option value="copy">Adicionar como cópias independentes</option><option value="replace">Substituir itens com o mesmo identificador</option></select></div>
          <p class="field-hint">${mode === 'copy' ? 'Tudo é adicionado. Os itens existentes mantêm-se.' : 'Só os itens assinalados serão substituídos. A versão anterior de cada anúncio fica no histórico. Marcas e modelos correspondentes serão substituídos; guarde uma cópia atual primeiro se os quiser conservar.'}</p>
          <ul class="backup-items">${preview.rows.map((r) => html`<li key=${`${r.kind}:${r.id}`}><span>${r.kind} · ${r.name}</span><strong>${mode === 'replace' && r.exists ? 'Substituir' : 'Adicionar'}</strong></li>`)}</ul>
          <button class="btn primary" disabled=${!!busy || !info?.available} onClick=${restore}>${mode === 'copy' ? 'Adicionar os itens da cópia' : 'Restaurar e substituir correspondências'}</button>
        </section>`}
        ${busy && html`<p role="status">${busy}</p>`}${error && html`<p class="workflow-error" role="alert">${error}</p>`}${notice && html`<p class="library-notice" role="status">${notice}</p>`}
      </div>
    <//>`;
  }
  function ReuseDialog({ project, images, update, onChange, onUse, onClose }) {
    const [catalog, setCatalog] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const [kind, setKind] = useState('brand'), [name, setName] = useState(project?.brand?.name || ''), [rename, setRename] = useState(null);
    const [waTemplate, setWaTemplate] = useState(project?.waTemplates?.[project?.locale] || '');
    // follows the ad's language or message when they change — not on opening, where
    // a late effect would wipe what was typed right after the dialog appeared
    const shownTemplate = useRef(`${project?.locale}|${project?.waTemplates?.[project?.locale] || ''}`);
    useEffect(() => {
      const now = `${project?.locale}|${project?.waTemplates?.[project?.locale] || ''}`;
      if (now === shownTemplate.current) return;
      shownTemplate.current = now;
      setWaTemplate(project?.waTemplates?.[project?.locale] || '');
    }, [project?.locale, project?.waTemplates?.[project?.locale]]);
    const pending = useRef(false);
    const received = (c) => { setCatalog(c); onChange(R.defaultBrand(c)); };
    useEffect(() => { let live = true; S.getCatalog().then((c) => { if (live) setCatalog(c); }).catch((e) => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
    const run = async (fn) => {
      if (pending.current) return; pending.current = true; setBusy(true); setError(''); setNotice('');
      try { await fn(); } catch (e) { setError(e.message || 'Não foi possível guardar.'); }
      finally { pending.current = false; setBusy(false); }
    };
    const save = (targetKind = kind, previous) => run(async () => {
      const label = previous ? (previous.label || previous.name) : name.trim();
      if (!label) throw new Error('Escreva um nome.');
      if (previous && !await confirmDialog({ title: `Atualizar «${label}»?`, body: 'A versão guardada na biblioteca será substituída pelo anúncio atual. Os anúncios já criados mantêm-se.', confirm: 'Atualizar' })) return;
      await afterPaint();
      let value;
      if (targetKind === 'brand') {
        const p = U.clone(project);
        if (waTemplate.trim()) p.waTemplates[p.locale] = waTemplate.trim(); else delete p.waTemplates[p.locale];
        value = R.captureBrand(p, label, previous?.id);
      }
      else {
        const p = U.clone(project), [lib, mine] = await Promise.all([RS.library.index(), RS.library.userItems()]);
        if (p.video.photos.mode !== 'chosen') p.video.photos.snapshot = { ...RS.motion.photoPlan(p, lib.items, mine), key: M.photoSelectionKey(p) };
        value = R.captureTemplate(p, label, await makeThumb(p, images), previous?.id);
      }
      received(await S.changeCatalog({ type: 'save', kind: targetKind, id: value.id, value, replace: !!previous }));
      setNotice(targetKind === 'brand' ? 'Marca guardada com logótipo, cores, fontes e contactos.' : 'Modelo guardado com textos, imagens e vídeo.');
    });
    const remove = (k, item) => run(async () => {
      if (!await confirmDialog({ title: `Remover «${item.label || item.name}»?`, body: 'Sai da biblioteca pessoal. Os anúncios criados a partir deste item mantêm-se.', confirm: 'Remover', danger: true })) return;
      received(await S.changeCatalog({ type: 'remove', kind: k, id: item.id })); setNotice('Item removido da biblioteca.');
    });
    const apply = (id) => run(async () => {
      const c = await S.getCatalog(), brand = c.brands.find((b) => b.id === id);
      if (!brand) throw new Error('Esta marca já foi removida.');
      update((p) => Object.assign(p, R.applyBrand(p, brand)));
      setNotice('Marca aplicada. Pode desfazer com Ctrl+Z.');
    });
    return html`<${Modal} title="Marcas e modelos pessoais" className="reuse-dialog" onClose=${onClose} busy=${busy}>
      <div class="library-body">
        <p class="workflow-intro">A sua biblioteca neste aparelho. Escolha uma marca por empresa e guarde anúncios como ponto de partida.</p>
        ${project && html`<form class="library-save" onSubmit=${(e) => { e.preventDefault(); save(); }}>
          <h3>Guardar a partir deste anúncio</h3><fieldset disabled=${busy}>
            <div class="field"><label for="reuse-kind">O que guardar</label><select id="reuse-kind" value=${kind} onChange=${(e) => { setKind(e.target.value); setName(e.target.value === 'brand' ? project.brand.name : project.name); }}><option value="brand">Marca: identidade e contactos</option><option value="template">Modelo: anúncio completo</option></select></div>
            <div class="field"><label for="reuse-name">Nome na biblioteca</label><input id="reuse-name" value=${name} maxLength="120" required onInput=${(e) => setName(e.target.value)} /></div>
            <button class="btn primary" type="submit" disabled=${!name.trim() || !catalog}>Guardar ${kind === 'brand' ? 'marca' : 'modelo'}</button>
          </fieldset>
          ${kind === 'brand' && html`<div class="field brand-message"><label for="f-brand-wa-template">Mensagem do WhatsApp por omissão · ${M.localeInfo(project.locale).short}</label><textarea id="f-brand-wa-template" value=${waTemplate} disabled=${busy} onInput=${(e) => setWaTemplate(e.target.value)} placeholder=${M.STOCK.waMsg[project.locale]}></textarea><small class="field-hint">Para novos anúncios nesta língua. {profissões} é substituído pelas funções do anúncio. Vazio usa a mensagem da app.</small></div>`}
          <p class="field-hint">${kind === 'brand' ? 'Logótipo, nome, cores, fontes, contactos por língua e WhatsApp. Os textos da oferta ficam nos modelos.' : 'Inclui as línguas, textos da publicação, fotografias e definições do vídeo. Novos anúncios começam sem campanha, em rascunho.'}</p>
        </form>`}
        ${error && html`<p class="workflow-error" role="alert">${error}</p>`}${notice && html`<p class="library-notice" role="status">${notice}</p>`}
        ${!catalog && !error && html`<p role="status">A abrir a biblioteca…</p>`}
        ${catalog && ['brand', 'template'].map((k) => html`<section class="library-section" key=${k}><h3>${k === 'brand' ? 'Marcas' : 'Modelos pessoais'} <span class="muted">${(k === 'brand' ? catalog.brands : catalog.templates).length}</span></h3>
          ${!(k === 'brand' ? catalog.brands : catalog.templates).length && html`<p class="field-hint">${project ? 'Guarde o primeiro item com o formulário acima.' : 'Abra um anúncio e escolha «Marcas e modelos» para o guardar aqui.'}</p>`}
          <div class="library-grid">${(k === 'brand' ? catalog.brands : catalog.templates).map((item) => html`<article class="library-card" key=${item.id}>
            ${k === 'brand' ? html`<div class="brand-swatches" aria-hidden="true"><i style=${{ background: item.primary || '#222' }}></i><i style=${{ background: item.accent || '#f25c05' }}></i></div>` : item.thumb && html`<img class="library-thumb" src=${item.thumb} alt="" />`}
            ${rename?.id === item.id ? html`<form class="library-rename" onSubmit=${(e) => { e.preventDefault(); run(async () => { received(await S.changeCatalog({ type: 'rename', kind: k, id: item.id, name: rename.name })); setRename(null); }); }}>
              <input aria-label="Novo nome" value=${rename.name} required maxLength="120" disabled=${busy} onInput=${(e) => setRename({ ...rename, name: e.target.value })} /><button class="btn ghost sm" disabled=${busy}>Guardar nome</button><button type="button" class="btn link sm" disabled=${busy} onClick=${() => setRename(null)}>Cancelar</button></form>` : html`<h4>${item.label || item.name}</h4>`}
            <p class="field-hint">${k === 'brand' ? (catalog.defaultBrandId === item.id ? 'Marca por omissão para novos anúncios' : item.name || 'Marca guardada') : `${item.project.locales.map((l) => M.localeInfo(l).short).join(' · ')} · ${RS.templates.get(item.project.template).name}`}</p>
            <div class="row-btns">
              ${k === 'brand' && project && html`<button class="btn primary sm" disabled=${busy} onClick=${() => apply(item.id)}>Aplicar marca</button>`}
              ${k === 'brand' && catalog.defaultBrandId !== item.id && html`<button class="btn ghost sm" disabled=${busy} onClick=${() => run(async () => received(await S.changeCatalog({ type: 'default', kind: k, id: item.id })))}>Usar por omissão</button>`}
              ${k === 'template' && onUse && html`<button class="btn primary sm" disabled=${busy} onClick=${() => run(async () => { const c = await S.getCatalog(), t = c.templates.find((v) => v.id === item.id); if (!t) throw new Error('Este modelo já foi removido.'); await onUse(R.instantiate(t)); })}>Criar anúncio</button>`}
              ${project && html`<button class="btn ghost sm" disabled=${busy} onClick=${() => save(k, item)}>Atualizar com este anúncio</button>`}
              <button class="btn link sm" disabled=${busy} onClick=${() => setRename({ id: item.id, name: item.label || item.name })}>Mudar nome</button>
              <button class="btn link sm danger-text" disabled=${busy} onClick=${() => remove(k, item)}>Remover</button>
            </div>
          </article>`)}</div>
        </section>`)}
      </div>
    <//>`;
  }
  function VideoCoverDialog({ project, update, images, prepared, initialTime, onClose }) {
    const saved = project.video.cover?.[project.locale];
    const [movie, setMovie] = useState(null), [time, setTime] = useState(saved?.time ?? initialTime ?? 0);
    const [title, setTitle] = useState(saved?.title || ''), [placement, setPlacement] = useState(saved?.placement || 'bottom');
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const ref = useRef(), running = useRef(false);
    useEffect(() => {
      let live = true;
      (async () => {
        await afterPaint();
        const photos = prepared?.fmt?.id === 'story' ? null : await videoPhotos(project, images);
        const next = prepared?.fmt?.id === 'story' ? prepared : RS.motion.prepare(project, { format: 'story', locale: project.locale, images, photos });
        if (live) { setMovie(next); setTime((v) => P.frameTime(next, v)); }
      })().catch((e) => { if (live) setError(e.message); });
      return () => { live = false; };
    }, []);
    useEffect(() => {
      if (!movie || !ref.current) return;
      try { ref.current.replaceChildren(P.renderVideoCover(project, movie, { time, title, placement }, .35)); setError(''); }
      catch (e) { setError(e.message); }
    }, [movie, time, title, placement]);
    const apply = () => update((p) => { p.video.cover = { ...p.video.cover, [project.locale]: { time: P.frameTime(movie, time), title, placement } }; });
    const download = async () => {
      if (!movie || running.current) return; running.current = true; setBusy(true); setError('');
      try {
        const blob = await P.png(P.renderVideoCover(project, movie, { time, title, placement }));
        if (await U.saveBlob(blob, `${U.slug(project.name)}-capa-${project.locale}.png`, [{ description: 'Capa PNG', accept: { 'image/png': ['.png'] } }])) { apply(); setNotice('Capa preparada e escolhida para esta língua.'); }
      } catch (e) { setError(e.message); }
      finally { running.current = false; setBusy(false); }
    };
    return html`<${Modal} title="Capa do vídeo" className="video-cover-dialog" onClose=${onClose} busy=${busy}>
      <div class="video-cover-body"><div ref=${ref} class="video-cover-preview" role="img" aria-label="Pré-visualização da capa em 9:16"></div><div class="video-cover-fields">
        <p>Escolha um fotograma real em 9:16 para ${M.localeInfo(project.locale).label}. A chamada só aparece na capa.</p>
        ${!movie && !error && html`<p role="status">A preparar o vídeo…</p>`}
        <fieldset disabled=${busy || !movie}><legend>Fotograma e chamada</legend>
          <${VideoTimeline} prepared=${movie} position=${time} onSeek=${(value) => setTime(P.frameTime(movie, value))} inputId="cover-time" label="Instante da capa do vídeo" disabled=${busy} />
          <label for="cover-title">Chamada curta (opcional)<input id="cover-title" type="text" maxLength="80" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="Ex.: Estamos a recrutar em Lausanne" /></label>
          <label for="cover-placement">Posição da chamada<select id="cover-placement" value=${placement} onChange=${(e) => setPlacement(e.target.value)}><option value="bottom">Em baixo</option><option value="top">Em cima</option></select></label>
          <div class="row-btns"><button class="btn primary" onClick=${() => { apply(); onClose(); }}>Guardar capa</button><button class="btn ghost" onClick=${download}>Descarregar capa PNG</button></div>
          ${saved && html`<button class="btn link sm" onClick=${() => { update((p) => { delete p.video.cover[project.locale]; }); onClose(); }}>Voltar à capa automática</button>`}
        </fieldset>
        <p class="field-hint">A campanha ZIP usa esta capa. Se mudar o estilo, a duração ou os textos do vídeo, confirme novamente o fotograma.</p>
        ${error && html`<p class="workflow-error" role="alert">${error}</p>`}${notice && html`<p class="library-notice" role="status">${notice}</p>`}
      </div></div>
    <//>`;
  }
  // «Pacote completo»: every piece of the campaign in one ZIP, a folder per language
  // (the carousel in its own format and style, the video as chosen in the editor).
  function ProductionDialog({ project, update, images, onClose }) {
    const [options, setOptions] = useState(() => P.settings(project));
    const [busy, setBusy] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(''), [support, setSupport] = useState(null);
    const abort = useRef(), running = useRef(false);
    useEffect(() => { let live = true; RS.video.support().then((v) => { if (live) setSupport(v); }).catch(() => { if (live) setSupport({ method: null }); }); return () => { live = false; abort.current?.abort(); }; }, []);
    const configure = (next) => { setOptions(next); setSuccess(''); update((p) => { p.delivery = U.clone(next); }); };
    const checks = useMemo(() => P.checks(project, { ...options, mode: 'campaign' }), [project, options]);
    const carousel = M.cleanCarousel(project.carousel, project);
    const download = async () => {
      if (running.current) return; running.current = true; abort.current = new AbortController(); setError(''); setSuccess(''); setBusy('A preparar…');
      try {
        await afterPaint();
        const result = await P.packageFiles(project, { ...options, mode: 'campaign' }, { images, videoPhotos, signal: abort.current.signal, onProgress: setBusy, yieldUI: afterPaint });
        if (abort.current.signal.aborted) return;
        setSaving(true); setBusy('A guardar o ZIP…');
        const saved = await U.saveBlob(result.blob, result.name, [{ description: 'Pacote ZIP', accept: { 'application/zip': ['.zip'] } }]);
        if (saved) { setSuccess(`ZIP guardado: ${result.files.length} ficheiros. Uma pasta por língua.${result.manifest.warnings.length ? ` ${result.manifest.warnings.length} avisos no manifesto e no LEIA-ME.` : ''}`); toast('Pacote preparado e guardado.'); }
      } catch (e) { if (e.name === 'AbortError') setSuccess('Exportação cancelada.'); else setError(e.message || 'Não foi possível criar o pacote.'); }
      finally { running.current = false; abort.current = null; setBusy(''); setSaving(false); }
    };
    const blocked = !options.locales.length || !Object.values(options.parts).some(Boolean) || options.parts.video && !support?.method;
    return html`<${Modal} title="Pacote completo" className="production-dialog" onClose=${onClose} busy=${!!busy}>
      <div class="production-body"><div class="production-controls">
        <p class="field-hint">Todas as peças numa pasta por língua. O carrossel segue o seu estilo e formato (${M.FORMATS[carousel.format].label}); o vídeo, o estilo, a duração, os textos e o som escolhidos no editor.</p>
        <fieldset disabled=${!!busy} class="production-options">
          <h3>Línguas a exportar</h3><div class="production-languages">${project.locales.map((l) => html`<label class="check" key=${l}><input type="checkbox" checked=${options.locales.includes(l)} onChange=${() => configure({ ...options, locales: options.locales.includes(l) ? options.locales.filter((v) => v !== l) : [...options.locales, l] })} />${M.localeInfo(l).label}</label>`)}</div>
          <h3>Peças do pacote</h3>${Object.entries(P.PARTS).map(([key, label]) => html`<label class="check" key=${key}><input type="checkbox" checked=${options.parts[key]} onChange=${() => configure({ ...options, parts: { ...options.parts, [key]: !options.parts[key] } })} />${label}</label>`)}
        </fieldset>
        ${options.parts.video && support && !support.method && html`<p class="workflow-error" role="alert">Este navegador não cria vídeo. Desmarque essa peça ou abra a app num navegador com suporte de vídeo.</p>`}
        <p class="field-hint">Confirme contactos e traduções antes de publicar. O ZIP inclui um manifesto dos ficheiros e instruções.</p>
        ${checks.length > 0 && html`<details class="production-checks"><summary>${checks.length} ${checks.length === 1 ? 'ponto a confirmar' : 'pontos a confirmar'}</summary><ul>${checks.map((c) => html`<li key=${c.text}>${c.text}</li>`)}</ul></details>`}
        ${error && html`<p class="workflow-error" role="alert">${error}</p>`}${success && html`<p class="library-notice" role="status">${success}</p>`}
        <div class="production-actions"><button class="btn primary" disabled=${!!busy || blocked} onClick=${download}><${Icon} name="download" />${busy ? saving ? 'A guardar o ZIP…' : 'A criar o pacote…' : 'Descarregar pacote ZIP'}</button>${busy && !saving && html`<button class="btn ghost" onClick=${() => abort.current?.abort()}>Cancelar exportação</button>`}</div>
        ${busy && html`<p class="production-progress" role="status" aria-live="polite">${busy}</p>`}
      </div></div>
    <//>`;
  }
  return { ReuseDialog, ProductionDialog, BackupDialog, VideoCoverDialog, FormatComparison, VideoTimeline };
};
