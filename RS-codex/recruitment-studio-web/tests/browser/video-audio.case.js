// MP4 with sound: AAC track via WebCodecs, real-time recording when AAC is
// missing, a silent file (and a flag) when neither works; cancel.
(() => {
  const { bytesOf, findBytes: find } = window.H;
  const durationOf = (blob) => new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => reject(new Error('the video does not open'));
    v.src = URL.createObjectURL(blob);
  });
  async function audioLevel(blob) {
    const ac = new OfflineAudioContext(2, 48000, 48000);
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    let s = 0, n = 0;
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 7) { s += d[i] * d[i]; n++; }
    return Math.sqrt(s / n);
  }
  function neon() {
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.video.motion = 'neon'; p.video.duration = 6;
    p.whatsapp = { country: '351', number: '912345678' };
    return p;
  }
  async function make(o = {}) {
    const p = neon();
    const P = RS.motion.prepare(p, { format: 'story', locale: 'pt-PT', photos: { hero: null, cards: [] } });
    const audio = o.audio === undefined ? await RS.sound.renderGenerated(P.timeline) : o.audio;
    return RS.video.create(p, {
      format: 'story', locale: 'pt-PT', duration: 6, style: 'dynamic',
      frame: (ctx, t) => RS.motion.render(ctx, P, { t, scale: 1 }), audio, onProgress: o.onProgress, signal: o.signal,
    });
  }
  async function without(names, fn) {
    const saved = names.map((n) => window[n]);
    names.forEach((n) => { window[n] = undefined; });
    try { return await fn(); } finally { names.forEach((n, i) => { window[n] = saved[i]; }); }
  }

  test('video: support() says whether AAC can be encoded', async () => {
    const s = await RS.video.support();
    assertEqual(typeof s.aac, 'boolean');
  });

  test('video: a 6 s Néon video with generated sound has an AAC track and plays 6 s', async () => {
    const blob = await make();
    const b = await bytesOf(blob);
    assertEqual(String.fromCharCode(...b.slice(4, 8)), 'ftyp');
    assert(find(b, 'moov') > 0 && find(b, 'moov') < find(b, 'mdat'), 'moov is not before mdat');
    assert(find(b, 'soun') > 0, 'no sound track');
    assert(!blob.silent, 'marked silent');
    const d = await durationOf(blob);
    assert(Math.abs(d - 6) < 0.15, `plays ${d} s`);
    assert((await audioLevel(blob)) > 0.01, 'the sound track is silent');
  });

  test('video: with audio null there is no sound track', async () => {
    const blob = await make({ audio: null });
    assert(find(await bytesOf(blob), 'soun') < 0, 'a sound track without sound');
  });

  test('video: without AAC in WebCodecs, the real-time recording keeps the sound', async () => {
    const blob = await without(['AudioEncoder'], () => make());
    assert(!blob.silent, 'marked silent');
    assert((await audioLevel(blob)) > 0.01, 'no sound in the recording');
  });

  test('video: with no way to add sound, the MP4 is silent and says so', async () => {
    const blob = await without(['AudioEncoder', 'MediaRecorder'], () => make());
    assertEqual(blob.silent, true);
    assert(find(await bytesOf(blob), 'soun') < 0, 'a sound track appeared');
    assertEqual(blob.type, 'video/mp4');
  });

  test('video: cancelling half-way rejects with AbortError and gives no file', async () => {
    const ctl = new AbortController();
    let result = null, error = null;
    try {
      result = await make({ signal: ctl.signal, onProgress: (p) => { if (p >= 0.5) ctl.abort(); } });
    } catch (err) { error = err; }
    assertEqual(result, null);
    assertEqual(error && error.name, 'AbortError');
  });
})();
