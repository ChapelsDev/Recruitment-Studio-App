// Video soundtrack: a beat with effects on the cuts, synthesised with WebAudio
// (no music rights involved), or the person's own file fitted to the video.
// The same schedule plays live in the preview and renders offline (48 kHz
// stereo) for the export, so both sound the same.
window.RS = window.RS || {};

RS.sound = (() => {
  const SR = 48000;
  const BEAT = 0.5;
  const NOTES = [55, 55, 43.65, 49]; // bass line, two beats per note
  const BAD_FILE = 'Não foi possível ler este ficheiro de som.';

  // Two seconds of noise, the same every time (seeded).
  const noiseCache = new WeakMap();
  function noise(ac) {
    let b = noiseCache.get(ac);
    if (!b) {
      b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = b.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
      noiseCache.set(ac, b);
    }
    return b;
  }

  // Sounds for timeline.events at t0 + t; events before `from` are left out
  // (a live preview that starts half-way). Returns the master gain.
  function schedule(ac, dest, timeline, t0, from = 0) {
    const out = ac.createDynamicsCompressor();
    out.connect(dest);
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(out);
    const nb = noise(ac);
    const bus = (pan) => {
      if (!ac.createStereoPanner) return master;
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      p.connect(master);
      return p;
    };
    const hatBus = bus(0.25), fxBus = bus(-0.15);
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const env = (g, at, peak, dur) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    };
    const kick = (at) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
      env(g, at, 0.9, 0.3); o.connect(g).connect(master); o.start(at); o.stop(at + 0.32);
    };
    const hat = (at) => {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = nb; f.type = 'highpass'; f.frequency.value = 7000;
      env(g, at, 0.16, 0.05); s.connect(f).connect(g).connect(hatBus); s.start(at, rand()); s.stop(at + 0.06);
    };
    const bass = (at, hz) => {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz; f.type = 'lowpass';
      f.frequency.setValueAtTime(900, at); f.frequency.exponentialRampToValueAtTime(180, at + 0.4);
      env(g, at, 0.32, 0.45); o.connect(f).connect(g).connect(master); o.start(at); o.stop(at + 0.5);
    };
    const whoosh = (at) => {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      const a0 = Math.max(0, at - 0.25);
      s.buffer = nb; f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, a0); f.frequency.exponentialRampToValueAtTime(3800, at + 0.12);
      g.gain.setValueAtTime(0.0001, a0); g.gain.exponentialRampToValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      s.connect(f).connect(g).connect(fxBus); s.start(a0, rand()); s.stop(at + 0.25);
    };
    const hit = (at) => {
      kick(at);
      const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      s.buffer = nb; f.type = 'lowpass'; f.frequency.value = 2200;
      env(g, at, 0.45, 0.35); s.connect(f).connect(g).connect(master); s.start(at, rand()); s.stop(at + 0.4);
    };
    const pop = (at, hz = 900) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(hz, at); o.frequency.exponentialRampToValueAtTime(hz * 1.6, at + 0.05);
      env(g, at, 0.25, 0.08); o.connect(g).connect(fxBus); o.start(at); o.stop(at + 0.1);
    };
    const riser = (at, dur) => {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = nb; s.loop = true; f.type = 'highpass';
      f.frequency.setValueAtTime(400, at); f.frequency.exponentialRampToValueAtTime(7000, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + dur); g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.05);
      s.connect(f).connect(g).connect(fxBus); s.start(at); s.stop(at + dur + 0.1);
    };

    // A plain timeline («Cartaz animado») is the beat alone, start to end.
    const plain = !!timeline.plain;
    const end = plain ? Infinity : timeline.scenes[timeline.scenes.length - 1].start;
    for (const e of timeline.events) {
      if (e.t < from - 1e-6) continue;
      const at = t0 + e.t;
      if (e.type === 'kick') {
        // The beat drops out under the riser, then comes back on the closing card.
        if (!(e.t >= end - 1.5 && e.t < end)) kick(at);
        hat(at + BEAT / 2);
        if (e.t < end - 1.5) bass(at, NOTES[Math.floor(Math.round(e.t / BEAT) / 2) % NOTES.length]);
      } else if (e.type === 'whoosh') whoosh(at);
      else if (e.type === 'hit') hit(at);
      else if (e.type === 'pop') pop(at);
      else if (e.type === 'riser') riser(at, 1.45);
    }
    if (!plain && end >= from) { hit(t0 + end); pop(t0 + end + 0.7, 1200); pop(t0 + end + 1.0, 700); }
    // A short fade at the very end: no click.
    const tail = t0 + Math.max(from, timeline.duration - 0.35);
    master.gain.setValueAtTime(0.8, tail);
    master.gain.linearRampToValueAtTime(0.0001, t0 + timeline.duration);
    return master;
  }

  // The video recipes' music: a list of events { t, kind, ...params } with
  // kinds kick, tone, noise and riser (each recipe writes its own), from
  // `from` seconds on, at t0 + t. Returns the master gain.
  function synth(ac, dest, events, t0, from = 0, duration = Infinity) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(dest);
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    const nb = noise(ac);
    const pan = (p) => { if (!p || !ac.createStereoPanner) return master; const s = ac.createStereoPanner(); s.pan.value = p; s.connect(master); return s; };
    const env = (g, at, peak, dur, attack = 0.004) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    };
    const K = {
      kick(e, at) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = e.wave || 'sine';
        o.frequency.setValueAtTime(e.f0 || 150, at); o.frequency.exponentialRampToValueAtTime(e.f1 || 45, at + (e.drop || 0.13));
        env(g, at, e.gain || 0.9, e.dur || 0.32);
        o.connect(g).connect(pan(e.pan)); o.start(at); o.stop(at + (e.dur || 0.32) + 0.02);
      },
      tone(e, at) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = e.wave || 'sine';
        o.frequency.setValueAtTime(e.hz || 440, at);
        if (e.hz1) o.frequency.exponentialRampToValueAtTime(e.hz1, at + (e.glide || e.dur || 0.2));
        let node = o;
        if (e.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(e.lp, at); if (e.lp1) f.frequency.exponentialRampToValueAtTime(e.lp1, at + (e.dur || 0.2)); node.connect(f); node = f; }
        env(g, at, e.gain || 0.3, e.dur || 0.2, e.attack || 0.004);
        node.connect(g).connect(pan(e.pan)); o.start(at); o.stop(at + (e.dur || 0.2) + 0.02);
      },
      noise(e, at) {
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = nb; f.type = e.filter || 'highpass'; f.frequency.value = e.f || 7000; f.Q.value = e.q || 0.8;
        env(g, at, e.gain || 0.2, e.dur || 0.06, e.attack || 0.002);
        s.connect(f).connect(g).connect(pan(e.pan)); s.start(at, (e.t * 7.31) % 1.5); s.stop(at + (e.dur || 0.06) + 0.02);
      },
      riser(e, at) {
        const dur = e.dur || 1.5, g = ac.createGain();
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(e.gain || 0.3, at + dur); g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.04);
        if (e.wave && e.wave !== 'noise') {
          const o = ac.createOscillator();
          o.type = e.wave; o.frequency.setValueAtTime(e.f0 || 200, at); o.frequency.exponentialRampToValueAtTime(e.f1 || 1600, at + dur);
          let node = o;
          if (e.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = e.lp; node.connect(f); node = f; }
          node.connect(g).connect(pan(e.pan)); o.start(at); o.stop(at + dur + 0.06);
        } else {
          const s = ac.createBufferSource(), f = ac.createBiquadFilter();
          s.buffer = nb; s.loop = true; f.type = 'bandpass'; f.Q.value = 2;
          f.frequency.setValueAtTime(e.f0 || 400, at); f.frequency.exponentialRampToValueAtTime(e.f1 || 7000, at + dur);
          s.connect(f).connect(g).connect(pan(e.pan)); s.start(at); s.stop(at + dur + 0.06);
        }
      },
    };
    for (const e of events) {
      if (e.t < from - 1e-6 || e.t >= duration || !K[e.kind]) continue;
      K[e.kind](e, t0 + e.t);
    }
    if (Number.isFinite(duration)) {
      master.gain.setValueAtTime(0.8, t0 + Math.max(from, duration - 0.04));
      master.gain.linearRampToValueAtTime(0.0001, t0 + duration);
    }
    return master;
  }
  // Peaks never above −1 dBFS (as with the person's own sound).
  function limit(buf) {
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
    if (peak > 0.891) for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); const k = 0.891 / peak; for (let i = 0; i < d.length; i++) d[i] *= k; }
    return buf;
  }

  // Exactly duration × sampleRate frames of stereo.
  async function renderGenerated(timeline, sampleRate = SR) {
    const ac = new OfflineAudioContext(2, Math.round(timeline.duration * sampleRate), sampleRate);
    if (Array.isArray(timeline.synth)) {
      synth(ac, ac.destination, timeline.synth, 0, 0, timeline.duration);
      return limit(await ac.startRendering());
    }
    schedule(ac, ac.destination, timeline, 0);
    return ac.startRendering();
  }

  async function decode(data, sampleRate = SR) {
    const ac = new OfflineAudioContext(2, sampleRate, sampleRate);
    try {
      return await ac.decodeAudioData(data.slice(0));
    } catch {
      throw new Error(BAD_FILE);
    }
  }

  // The person's file at exactly the video length: trimmed with a 1 s fade-out,
  // or followed by silence; 48 kHz stereo, peak at −1 dBFS.
  async function fitOwn(data, duration, sampleRate = SR) {
    const src = await decode(data, sampleRate);
    const ac = new OfflineAudioContext(2, Math.round(duration * sampleRate), sampleRate);
    const s = ac.createBufferSource();
    s.buffer = src;
    const g = ac.createGain();
    if (src.duration > duration) {
      const curve = new Float32Array(64).map((_, i) => Math.pow(1 - i / 63, 2));
      g.gain.setValueCurveAtTime(curve, Math.max(0, duration - 1), Math.min(1, duration));
    }
    s.connect(g).connect(ac.destination);
    s.start(0);
    const out = await ac.startRendering();
    let peak = 0;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    }
    if (peak > 1e-4) {
      const k = 0.891 / peak; // −1 dBFS
      for (let c = 0; c < out.numberOfChannels; c++) {
        const d = out.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= k;
      }
    }
    return out;
  }

  // Live sound for the preview, from `startAt` seconds into the video.
  // -> { time(): seconds into the video, stop() }
  let live = null;
  function context() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!live) live = new AC();
    if (live.state === 'suspended') live.resume().catch(() => {});
    return live;
  }
  function preview(source, startAt = 0) {
    const ac = context();
    const out = ac.createGain();
    out.connect(ac.destination);
    const t0 = ac.currentTime + 0.06 - startAt;
    let node = null;
    if (source && typeof source.getChannelData === 'function') {
      node = ac.createBufferSource();
      node.buffer = source;
      node.connect(out);
      node.start(t0 + startAt, startAt);
    } else if (source && Array.isArray(source.synth)) {
      synth(ac, out, source.synth, t0, startAt, source.duration);
    } else if (source && source.events) {
      schedule(ac, out, source, t0, startAt);
    }
    let stopped = false;
    return {
      time: () => ac.currentTime - t0,
      stop() {
        if (stopped) return;
        stopped = true;
        try { out.gain.setTargetAtTime(0, ac.currentTime, 0.015); } catch { /* already gone */ }
        setTimeout(() => {
          try { if (node) node.stop(); } catch { /* not started */ }
          out.disconnect();
        }, 120);
      },
    };
  }

  return { SR, schedule, synth, renderGenerated, decode, fitOwn, preview, BAD_FILE };
})();
