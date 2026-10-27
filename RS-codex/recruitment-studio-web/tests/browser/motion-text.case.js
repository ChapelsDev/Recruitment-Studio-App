// The person's words in the video: none lost, each page and group on screen
// long enough to read.
(() => {
  const LONG_KICKER = 'Estamos a recrutar para obras na Suíça, na Alemanha e em Portugal com início já';
  const LONG_POS = [
    'Operador(a) de máquinas de construção com experiência mínima de 2 anos',
    'Técnico(a) de manutenção industrial com carta de condução e disponibilidade para deslocações ao estrangeiro',
  ];
  const LONG_HEAD = 'Procuramos pedreiros, serventes, cofragistas e armadores de ferro com experiência para obras na Suíça e em Portugal já';
  function project(motion, kind) {
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    const t = p.texts['pt-PT'];
    p.video.motion = motion;
    p.video.bg = RS.motion.styleOf(motion).bgModes[0];
    t.kicker = LONG_KICKER;
    t.headline = LONG_HEAD;
    if (kind === 'ten') t.positions = Array.from({ length: 10 }, (_, i) => RS.model.item(`Posição número ${i + 1} com experiência`));
    else t.positions = [...LONG_POS, 'Servente'].map((x) => RS.model.item(x));
    t.contacts = [RS.model.iconItem('mail', 'recrutamento.internacional.obras@empresa-de-construcao-exemplo.pt')];
    p.whatsapp = null;
    return p;
  }
  // Every character of the person's text, in order (spaces and the hyphens of
  // a line break inside a word aside), is in the layouts' lines.
  const squash = (s) => String(s).toLocaleUpperCase('pt-PT').replace(/[\s-]+/g, '');
  const linesOf = (layouts) => layouts.flatMap((L) => L.lines).join(' ');
  const missing = (src, text) => (squash(text).includes(squash(src)) ? [] : [src]);

  test('motion: no word of a long position, kicker or contact is lost', () => {
    for (const motion of ['limpo', 'neon', 'impacto']) {
      for (const format of ['story', 'square']) {
        const P = RS.motion.prepare(project(motion), { format, locale: 'pt-PT', photos: { hero: null, cards: [] } });
        const i = P.timeline.scenes.findIndex((s) => s.kind === 'wall');
        if (i >= 0) {
          const text = linesOf(P.scenes[i].groups.flat());
          for (const pos of LONG_POS) assertEqual(missing(pos, text), [], `${motion} ${format}: wall lost words of «${pos}»`);
        }
        const hook = P.scenes[0];
        assertEqual(missing(LONG_KICKER, linesOf([hook.kicker])), [], `${motion} ${format}: kicker lost words`);
        assertEqual(missing(LONG_HEAD, linesOf(hook.head)), [], `${motion} ${format}: headline lost words`);
        const end = P.scenes[P.scenes.length - 1];
        const endText = linesOf(end.items.filter((it) => it.L).map((it) => it.L));
        assertEqual(missing(P.contacts[0], endText), [], `${motion} ${format}: contact lost words`);
      }
    }
  });

  test('motion: each headline page and each wall group gets at least 1 s', () => {
    for (const motion of ['neon', 'limpo', 'impacto']) {
      for (const format of ['story', 'portrait', 'square']) {
        const P = RS.motion.prepare(project(motion, 'ten'), { format, locale: 'pt-PT', photos: { hero: null, cards: [] } });
        const hook = P.timeline.scenes[0];
        assert((hook.end - hook.start) / P.scenes[0].head.length >= 1, `${motion} ${format}: ${P.scenes[0].head.length} pages in ${hook.end - hook.start} s`);
        const i = P.timeline.scenes.findIndex((s) => s.kind === 'wall');
        if (i >= 0) {
          const s = P.timeline.scenes[i];
          assert((s.end - s.start) / P.scenes[i].groups.length >= 1, `${motion} ${format}: ${P.scenes[i].groups.length} groups in ${s.end - s.start} s`);
        }
      }
    }
  });
})();
