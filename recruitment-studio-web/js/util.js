// Small shared helpers: ids, colours, files, zip.
window.RS = window.RS || {};

RS.util = (() => {
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---------------------------------------------------------------- colour
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const toHex = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  const rgbToHex = ({ r, g, b }) => `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  const isHex = (v) => /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(v || '').trim());
  const normHex = (v) => rgbToHex(hexToRgb(v));

  function mix(a, b, t) {
    const x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
  }
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  const isDark = (hex) => luminance(hex) < 0.22;
  // Text colour that reads on a background: white or a deep ink.
  const onColor = (bg, dark = '#111827') => (contrast(bg, '#FFFFFF') >= contrast(bg, dark) ? '#FFFFFF' : dark);
  // Push `fg` towards black or white until it reaches `min` contrast on `bg`.
  function ensureContrast(fg, bg, min = 3) {
    if (contrast(fg, bg) >= min) return normHex(fg);
    const target = isDark(bg) ? '#FFFFFF' : '#000000';
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const c = mix(fg, target, t);
      if (contrast(c, bg) >= min) return c;
    }
    return target;
  }
  function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---------------------------------------------------------------- text
  function slug(text) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'anuncio';
  }
  const rtf = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' });
  function relativeTime(ts) {
    const diff = (ts - Date.now()) / 1000;
    const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month']];
    let unit = 'year', div = 31557600;
    for (let i = 0; i < steps.length; i++) {
      if (Math.abs(diff) < steps[i][0]) { unit = steps[i][1]; div = i ? steps[i - 1][0] : 1; break; }
    }
    if (unit === 'second') return 'agora mesmo';
    return rtf.format(Math.round(diff / div), unit);
  }

  // ---------------------------------------------------------------- files
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  async function dataURLToBlob(url) {
    const res = await fetch(url);
    return res.blob();
  }

  // Saves through the system "Save as" dialog when available, else a download.
  // Returns false when the person cancelled the dialog.
  async function saveBlob(blob, name, types) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
        // Any other failure (policy, permissions): fall back to a download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.name = 'file'; input.accept = accept;
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }

  // ---------------------------------------------------------------- zip (STORE)
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  // files: [{ name, bytes: Uint8Array }] -> Blob (application/zip, no compression;
  // PNG/JPG are already compressed).
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.bytes);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true); local.setUint32(18, f.bytes.length, true); local.setUint32(22, f.bytes.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(local.buffer, name, f.bytes);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, f.bytes.length, true); cd.setUint32(24, f.bytes.length, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(cd.buffer, name);
      offset += 30 + name.length + f.bytes.length;
    }
    const cdSize = central.reduce((s, p) => s + (p.byteLength || p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  function debounce(fn, ms) {
    let t;
    const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    d.flush = (...args) => { clearTimeout(t); fn(...args); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  return {
    uid, clamp, clone, hexToRgb, rgbToHex, isHex, normHex, mix, luminance, contrast, isDark, onColor,
    ensureContrast, rgba, slug, relativeTime, blobToDataURL, dataURLToBlob, saveBlob, pickFile, zip, debounce,
  };
})();
