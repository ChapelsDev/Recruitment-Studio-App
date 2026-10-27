// Video ads (MP4) for Reels and Stories: each frame is drawn (the animated
// poster by default, or a motion style through o.frame) and encoded with
// WebCodecs H.264 into an MP4 (vendor/mp4-muxer.js), with the soundtrack as an
// AAC track. Frames are produced as fast as the machine allows, so none is
// ever dropped. Browsers without WebCodecs H.264 — or, when there is sound,
// without AAC — fall back to MediaRecorder, which records in real time; if
// sound cannot be added at all, the MP4 is silent and blob.silent says so.
window.RS = window.RS || {};

RS.video = (() => {
  const M = RS.model, E = RS.engine;
  const FPS = 30;
  const BITRATE = 8e6;
  const AUDIO_BITRATE = 128000;
  // H.264 High, Main and Baseline at level 4.0 (enough for 1080 × 1920 at 30 fps).
  const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];

  async function encoderConfig(w, h) {
    if (!window.VideoEncoder || !window.VideoFrame || !window.Mp4Muxer) return null;
    for (const codec of CODECS) {
      for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
        const cfg = { codec, width: w, height: h, bitrate: BITRATE, framerate: FPS, hardwareAcceleration, avc: { format: 'avc' } };
        try {
          if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
        } catch { /* try the next one */ }
      }
    }
    return null;
  }
  async function aacConfig(sampleRate = 48000) {
    if (!window.AudioEncoder || !window.AudioData) return null;
    const cfg = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: AUDIO_BITRATE };
    try {
      return (await AudioEncoder.isConfigSupported(cfg)).supported ? cfg : null;
    } catch {
      return null;
    }
  }
  function recorderType(withAudio) {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    if (withAudio && !(window.AudioContext && AudioContext.prototype.createMediaStreamDestination)) return null;
    const types = withAudio
      ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus']
      : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  }
  let supportP = null;
  // -> { method: 'webcodecs' | 'recorder' | null, mp4, aac }
  function support() {
    if (!supportP) {
      supportP = (async () => {
        const aac = !!(await aacConfig());
        if (await encoderConfig(1080, 1920)) return { method: 'webcodecs', mp4: true, aac };
        const type = recorderType(false);
        if (type) return { method: 'recorder', mp4: type.startsWith('video/mp4'), type, aac };
        return { method: null, mp4: false, aac };
      })();
    }
    return supportP;
  }

  // Lets the page paint the progress (rAF) without stalling in a background tab (timeout).
  const breathe = () => new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 60);
  });
  const nextTask = () => new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
  const cancelled = () => new DOMException('Cancelado', 'AbortError');
  const silent = (blob) => { blob.silent = true; return blob; };

  function frameCanvas(fmt) {
    const canvas = document.createElement('canvas');
    canvas.width = fmt.w;
    canvas.height = fmt.h;
    return { canvas, ctx: canvas.getContext('2d', { alpha: false }) };
  }
  // The animated poster: one state per video and the same ctx for every frame
  // (the engine caches the layout).
  function posterFrame(fmt, project, o) {
    const A = E.animState({ duration: o.duration, style: o.style });
    return (ctx, t) => {
      A.t = t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = project.style.bg || '#FFFFFF';
      ctx.fillRect(0, 0, fmt.w, fmt.h);
      E.render(ctx, project, { format: fmt.id, locale: o.locale, images: o.images || {}, scale: 1, mode: 'export', anim: A });
    };
  }

  // o: { format, locale, images, duration, style, frame(ctx, t)?, audio (AudioBuffer)?,
  //      onProgress(0..1), signal } -> Blob (video/mp4, or video/webm on old browsers)
  async function create(project, o) {
    const s = await support();
    if (s.method === 'webcodecs') {
      if (o.audio && !(await aacConfig(o.audio.sampleRate))) {
        const type = recorderType(true);
        if (type) return withRecorder(project, o, type);
        return silent(await withCodecs(project, { ...o, audio: null }));
      }
      return withCodecs(project, o);
    }
    if (s.method === 'recorder') {
      const type = (o.audio && recorderType(true)) || s.type;
      const blob = await withRecorder(project, { ...o, audio: o.audio && recorderType(true) ? o.audio : null }, type);
      return o.audio && !recorderType(true) ? silent(blob) : blob;
    }
    throw new Error('Este navegador não consegue criar vídeo. Use o Microsoft Edge ou o Google Chrome atualizados.');
  }

  // The soundtrack in 1024-frame pieces through the AAC encoder into the muxer.
  async function encodeAudio(muxer, buffer, cfg, signal) {
    let failure = null;
    const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (err) => { failure = err; } });
    enc.configure(cfg);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
    const N = 1024;
    try {
      for (let i = 0; i < buffer.length; i += N) {
        if (signal && signal.aborted) throw cancelled();
        if (failure) throw failure;
        const n = Math.min(N, buffer.length - i);
        const data = new Float32Array(n * 2);
        data.set(left.subarray(i, i + n), 0);
        data.set(right.subarray(i, i + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / buffer.sampleRate) * 1e6), data });
        enc.encode(ad);
        ad.close();
        while (enc.encodeQueueSize > 32) await nextTask();
      }
      await enc.flush();
      if (failure) throw failure;
    } finally {
      if (enc.state !== 'closed') enc.close();
    }
  }

  async function withCodecs(project, o) {
    const fmt = M.FORMATS[o.format];
    const cfg = await encoderConfig(fmt.w, fmt.h);
    if (!cfg) return withRecorder(project, o, recorderType(!!o.audio) || recorderType(false));
    const acfg = o.audio ? await aacConfig(o.audio.sampleRate) : null;
    const { canvas, ctx } = frameCanvas(fmt);
    const draw = o.frame || posterFrame(fmt, project, o);
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: fmt.w, height: fmt.h, frameRate: FPS },
      audio: acfg ? { codec: 'aac', numberOfChannels: 2, sampleRate: acfg.sampleRate } : undefined,
      fastStart: 'in-memory', // index at the start of the file, as Instagram prefers
      firstTimestampBehavior: 'offset',
    });
    if (acfg) await encodeAudio(muxer, o.audio, acfg, o.signal);
    let failure = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => { failure = err; },
    });
    encoder.configure(cfg);
    const total = Math.round(o.duration * FPS);
    let lastBreath = performance.now();
    try {
      for (let i = 0; i < total; i++) {
        if (o.signal && o.signal.aborted) throw cancelled();
        if (failure) throw failure;
        draw(ctx, i / FPS);
        const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
        encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 4) await nextTask();
        if (performance.now() - lastBreath > 90) {
          if (o.onProgress) o.onProgress(((i + 1) / total) * 0.97);
          await breathe();
          lastBreath = performance.now();
        }
      }
      await encoder.flush();
      if (failure) throw failure;
      muxer.finalize();
    } finally {
      if (encoder.state !== 'closed') encoder.close();
    }
    if (o.onProgress) o.onProgress(1);
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    return o.audio && !acfg ? silent(blob) : blob;
  }

  // Real-time recording: takes as long as the video itself. The soundtrack is
  // played into the recording through a MediaStream audio destination.
  async function withRecorder(project, o, type) {
    if (!type) throw new Error('Este navegador não consegue criar vídeo. Use o Microsoft Edge ou o Google Chrome atualizados.');
    const fmt = M.FORMATS[o.format];
    const { canvas, ctx } = frameCanvas(fmt);
    const draw = o.frame || posterFrame(fmt, project, o);
    const tracks = canvas.captureStream(FPS).getVideoTracks();
    let ac = null, src = null;
    if (o.audio && /mp4a|opus/.test(type)) {
      try {
        ac = new AudioContext({ sampleRate: o.audio.sampleRate });
        const dest = ac.createMediaStreamDestination();
        src = ac.createBufferSource();
        src.buffer = o.audio;
        src.connect(dest);
        tracks.push(...dest.stream.getAudioTracks());
      } catch {
        ac = null; src = null;
      }
    }
    const stream = new MediaStream(tracks);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: BITRATE, audioBitsPerSecond: AUDIO_BITRATE });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const stopped = new Promise((resolve) => { rec.onstop = resolve; });
    draw(ctx, 0);
    rec.start(250);
    if (src) { await ac.resume().catch(() => {}); src.start(); }
    const t0 = performance.now();
    try {
      await new Promise((resolve, reject) => {
        const tick = () => {
          if (o.signal && o.signal.aborted) { reject(cancelled()); return; }
          const t = (performance.now() - t0) / 1000;
          if (t >= o.duration) { resolve(); return; }
          draw(ctx, t);
          if (o.onProgress) o.onProgress(t / o.duration);
          setTimeout(tick, 1000 / FPS); // a timer, not rAF: keeps going in a background tab
        };
        tick();
      });
    } finally {
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      stream.getTracks().forEach((tr) => tr.stop());
      if (src) { try { src.stop(); } catch { /* ended */ } }
      if (ac) ac.close().catch(() => {});
    }
    if (o.onProgress) o.onProgress(1);
    const blob = new Blob(parts, { type: type.split(';')[0] });
    return o.audio && !src ? silent(blob) : blob;
  }

  const extOf = (blob) => (blob.type === 'video/webm' ? 'webm' : 'mp4');

  return { FPS, support, create, extOf };
})();
