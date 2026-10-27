// Shared helpers of the video recipes (RS.motionKit) and the recipes' music
// (RS.sound with timeline.synth).
(() => {
  const K = () => RS.motionKit;

  test('kit: spring reaches 1 and never overshoots; expo ends at 1', () => {
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const v = K().spring(i / 100);
      assert(v >= prev - 1e-9 && v <= 1, `spring ${v} at ${i}`);
      prev = v;
    }
    assertEqual(K().spring(1), 1);
    assertEqual(K().expoOut(1), 1);
    assertEqual(K().expoIn(0), 0);
  });

  test('kit: fit keeps a 40-letter word and stays inside the width', () => {
    const P = { minTextSize: Infinity, locale: 'de-DE' };
    const word = 'Bauarbeiterunterkunftsverwaltungsgesellschaft';
    const L = K().fit(P, `${word} gesucht`, { font: { family: 'Anton', weight: 400 }, maxSize: 200, minSize: 40, maxW: 920, maxLines: 3 });
    assert(L.lines.join('').replace(/-/g, '').includes(word), `word lost: ${L.lines.join(' | ')}`);
    assert(L.w <= 921, `too wide ${L.w}`);
    assert(P.minTextSize >= 40, `min size ${P.minTextSize}`);
  });

  test('kit: zones of the three formats', () => {
    const z = K().zones(RS.model.FORMATS.story);
    assertEqual([z.top, z.bottom], [298, 1592]);
    const q = K().zones(RS.model.FORMATS.square);
    assertEqual([q.top, q.bottom], [56, 1024]);
    const p = K().zones(RS.model.FORMATS.portrait);
    assertEqual([p.top, p.bottom, p.cy], [56, 1294, 675]);
  });

  test('kit: chatDraw types the ad\'s message and records what is typed', () => {
    const message = 'Olá! Vi o anúncio para pedreiro e tenho interesse.';
    const P = { locale: 'pt-PT', minTextSize: Infinity, content: { message, brandName: 'Obras Lda', contact: { display: '+351 912 345 678' } } };
    const S = { x: 100, y: 330, w: 880, h: 1220, radius: 64, font: { family: 'Barlow', weight: 600 }, fontStrong: { family: 'Barlow', weight: 700 },
      colors: { screen: '#EEEEEE', head: '#111111', headInk: '#FFFFFF', field: '#FFFFFF', fieldInk: '#111111', bubble: '#25D366', bubbleInk: '#062B14', send: '#25D366', sendInk: '#062B14' } };
    const L = K().chatLayout(P, S);
    const c = document.createElement('canvas'); c.width = 540; c.height = 960;
    const ctx = c.getContext('2d');
    const R = { ctx, scale: 0.5, boxes: [], recording: true };
    R.rec = K().recorder(R);
    ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    K().chatDraw(R, L, 1.0, { type0: 0.5, type1: 1.3, send: 1.4 });
    const typing = R.boxes.find((b) => b.tag === 'chat-typing');
    assert(typing, `no typing box: ${R.boxes.map((b) => b.tag).join(', ')}`);
    assert(typing.text.length > 5 && message.startsWith(typing.text), `typed «${typing.text}»`);
    assert(R.boxes.some((b) => b.tag === 'chat-number' && b.text === '+351 912 345 678'), 'number in the header');
  });

  test('kit: a moving layer records no text', () => {
    const c = document.createElement('canvas'); c.width = 270; c.height = 480;
    const R = { ctx: c.getContext('2d'), scale: 0.25, boxes: [], recording: true };
    R.rec = K().recorder(R);
    R.ctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    const L = K().line({ minTextSize: Infinity }, 'Pedreiros', { font: { family: 'Anton', weight: 400 }, size: 120 });
    K().blurred(R, 4000, () => K().text(R, L, 100, 500, '#fff', 'left', 0, 'moving'));
    assertEqual(R.boxes.length, 0);
    K().text(R, L, 100, 500, '#fff', 'left', 0, 'still');
    assertEqual(R.boxes.map((b) => [b.tag, b.text]), [['still', 'Pedreiros']]);
  });

  test('sound: recipe music is rendered at the video length with peaks ≤ −1 dBFS', async () => {
    const synth = [];
    for (let b = 0; b < 30; b++) synth.push({ t: b * 0.5, kind: 'kick', gain: 1.5 });
    synth.push({ t: 10, kind: 'riser', dur: 2, f0: 300, f1: 5000, gain: 0.3 }, { t: 3, kind: 'tone', hz: 440, dur: 0.2, gain: 0.3 }, { t: 4, kind: 'noise', f: 2000, dur: 0.1, gain: 0.3 });
    const buf = await RS.sound.renderGenerated({ duration: 15, synth, scenes: [], events: [] });
    assertEqual(buf.length, 15 * 48000);
    let peak = 0;
    for (let ch = 0; ch < 2; ch++) for (const v of buf.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
    assert(peak <= 0.8915 && peak > 0.3, `peak ${peak}`);
  });

  test('sound: the live preview of recipe music starts where asked', () => {
    const pv = RS.sound.preview({ duration: 15, synth: [{ t: 1, kind: 'kick' }, { t: 9, kind: 'kick' }], scenes: [], events: [] }, 8);
    assert(pv.time() > 7.8 && pv.time() < 8.2, `time ${pv.time()}`);
    pv.stop();
  });
})();
