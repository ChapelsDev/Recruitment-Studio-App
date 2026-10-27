// Sound: the generated music, the person's own file fitted to the video,
// audio assets kept by housekeeping.
(() => {
  const SR = 48000;
  const rms = (buf, from, to) => {
    let s = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = Math.max(0, Math.floor(from * buf.sampleRate)); i < Math.min(d.length, Math.floor(to * buf.sampleRate)); i++) { s += d[i] * d[i]; n++; }
    }
    return n ? Math.sqrt(s / n) : 0;
  };
  const { toneWav } = window.H;
  function timeline(duration) {
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
    p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '30' };
    p.whatsapp = { country: '351', number: '912345678' };
    const c = RS.motionTimeline.content(p, 'pt-PT');
    c.photos = 6;
    return RS.motionTimeline.build(c, { duration, scenes: RS.motion.styleOf('neon').scenes });
  }

  test('sound: the generated music is 15 s of stereo, louder on every cut', async () => {
    const tl = timeline(15);
    const buf = await RS.sound.renderGenerated(tl);
    assertEqual(buf.length, 720000);
    assertEqual(buf.numberOfChannels, 2);
    assertEqual(buf.sampleRate, SR);
    assert(rms(buf, 0, 15) > 0.02, 'silent');
    const windows = [];
    for (let t = 0; t < 15; t += 0.1) windows.push(rms(buf, t, t + 0.1));
    const median = [...windows].sort((a, b) => a - b)[Math.floor(windows.length / 2)];
    for (const c of tl.cuts) assert(rms(buf, c - 0.05, c + 0.05) > median, `quiet at the cut ${c} s`);
  });

  test('sound: an own 3 s mono 44.1 kHz file fitted to 10 s is 10 s of stereo, silent after 3 s', async () => {
    const buf = await RS.sound.fitOwn(await toneWav(3), 10);
    assertEqual(buf.length, 480000);
    assertEqual(buf.numberOfChannels, 2);
    assert(rms(buf, 0.2, 2.5) > 0.1, 'the tone is missing');
    assert(rms(buf, 3.2, 10) < 0.001, 'not silent after the file ends');
  });

  test('sound: a 20 s file fitted to 10 s ends with a fade', async () => {
    const buf = await RS.sound.fitOwn(await toneWav(20), 10);
    assertEqual(buf.length, 480000);
    const start = rms(buf, 0.1, 0.2), end = rms(buf, 9.9, 10);
    assert(end < start * 0.05, `no fade: ${end.toFixed(4)} vs ${start.toFixed(4)}`);
    let peak = 0;
    for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    assert(peak > 0.85 && peak < 0.9, `peak ${peak.toFixed(3)} is not about −1 dBFS`);
  });

  test('sound: a file that is not sound is refused with a clear message', async () => {
    let msg = null;
    try { await RS.sound.fitOwn(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer, 10); } catch (err) { msg = err.message; }
    assertEqual(msg, 'Não foi possível ler este ficheiro de som.');
  });

  test('sound: importAudio keeps the file; housekeeping keeps the sound an ad uses', async () => {
    const file = new File([await toneWav(3)], 'musica.wav', { type: 'audio/wav' });
    const a = await RS.assets.importAudio(file);
    assert(a.id && Math.abs(a.duration - 3) < 0.05, `bad import ${JSON.stringify(a)}`);
    assertEqual(a.name, 'musica.wav');
    const stray = await RS.assets.importAudio(new File([await toneWav(1)], 'outra.wav', { type: 'audio/wav' }));
    const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro'] });
    p.video.sound = 'own'; p.video.ownSound = a.id;
    await RS.store.putProject(p);
    await RS.store.housekeeping();
    assert(await RS.store.getAsset(a.id), 'the sound in use was removed');
    assert(!(await RS.store.getAsset(stray.id)), 'an unused sound was kept');
    const data = await RS.assets.audioData(a.id);
    assert(data.byteLength > 1000, 'no audio data');
  });

  test('sound: an own sound is decoded and fitted once per length, then reused', async () => {
    const a = await RS.assets.importAudio(new File([await toneWav(4)], 'uma-vez.wav', { type: 'audio/wav' }));
    const real = RS.sound.fitOwn;
    let calls = 0;
    RS.sound.fitOwn = (...args) => { calls++; return real(...args); };
    try {
      const b1 = await RS.assets.fittedSound(a.id, 6);
      const b2 = await RS.assets.fittedSound(a.id, 6);
      assert(b1 === b2, 'not the same buffer');
      assertEqual(calls, 1);
      await RS.assets.fittedSound(a.id, 10);
      assertEqual(calls, 2);
    } finally {
      RS.sound.fitOwn = real;
    }
  });

  test('sound: preview plays and stops', async () => {
    const pv = RS.sound.preview(timeline(6), 0);
    await new Promise((r) => setTimeout(r, 150));
    assert(typeof pv.time() === 'number', 'no clock');
    pv.stop();
  });
})();
