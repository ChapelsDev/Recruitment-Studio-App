// Development tool: renders the «Balão a entrar» icon masters (assets/brand/*.svg)
// into every PNG the app and its installs use, in Microsoft Edge without a window
// and on a transparent background:
//   assets/icons/icon-{16,24,32,48}.png      from icon-small.svg (bigger dots, less cut)
//   assets/icons/icon-{64,…,512}.png         from icon.svg
//   assets/icons/maskable-512.png            from icon-maskable.svg (Android's round mask)
// Then run tools/build-launcher.mjs: it packs assets/app.ico from these PNGs.
// Usage: node tools/build-icons.mjs   (EDGE_PATH=... for another browser)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(appDir, 'assets', 'brand');
const out = path.join(appDir, 'assets', 'icons');
const JOBS = [
  ...[16, 24, 32, 48].map((s) => ({ svg: 'icon-small.svg', size: s, name: `icon-${s}.png` })),
  ...[64, 128, 180, 192, 256, 512].map((s) => ({ svg: 'icon.svg', size: s, name: `icon-${s}.png` })),
  { svg: 'icon-maskable.svg', size: 512, name: 'maskable-512.png' },
];
const edge = process.env.EDGE_PATH || [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((p) => fs.existsSync(p));
if (!edge) { console.error('Microsoft Edge not found (set EDGE_PATH).'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-icons-'));
// one page with the image; each size is the same SVG drawn at that size
const page = path.join(tmp, 'icon.html');
fs.writeFileSync(page, '<!doctype html><html><body style="margin:0;background:transparent"><img id="i" style="display:block" alt=""></body></html>');
const port = 9850 + Math.floor(Math.random() * 100);
const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
  '--allow-file-access-from-files', '--hide-scrollbars', pathToFileURL(page).href], { stdio: 'ignore' });
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Edge did not open the icon page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result.value;
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const job of JOBS) {
    await send('Emulation.setDeviceMetricsOverride', { width: job.size, height: job.size, deviceScaleFactor: 1, mobile: false });
    const src = pathToFileURL(path.join(brand, job.svg)).href;
    const ok = await ev(`new Promise((done) => { const i = document.getElementById('i'); i.onload = () => done(true); i.onerror = () => done(false);
      i.style.width = i.style.height = '${job.size}px'; i.src = ${JSON.stringify(src)} + '#' + ${job.size}; })`);
    if (!ok) throw new Error(`could not draw ${job.svg}`);
    await sleep(60);
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 } });
    fs.writeFileSync(path.join(out, job.name), Buffer.from(shot.result.data, 'base64'));
    console.log(`${job.name}  ${job.size}×${job.size}  from ${job.svg}`);
  }
  ws.close();
} finally {
  proc.kill();
  await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* still locked */ }
}
console.log(`Icons: ${out} (now run tools/build-launcher.mjs for app.ico and the .exe)`);
