// Development tool: captures the two screenshots the install sheets show (Android
// and Chrome/Edge read them from manifest.webmanifest):
//   assets/screenshots/phone.png  1080 × 1920 (narrow)  — the editor on a phone
//   assets/screenshots/wide.png   1920 × 1080 (wide)    — the editor on a computer
// A sample ad (a library photo, Portuguese texts) is made in a fresh Edge profile.
// Usage: node tools/build-screenshots.mjs   (EDGE_PATH=... for another browser)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(appDir, 'assets', 'screenshots');
const edge = process.env.EDGE_PATH || [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((p) => fs.existsSync(p));
if (!edge) { console.error('Microsoft Edge not found (set EDGE_PATH).'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = [
  { name: 'phone.png', width: 360, height: 640, scale: 3, mobile: true },
  { name: 'wide.png', width: 1280, height: 720, scale: 1.5, mobile: false },
];

fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-shots-'));
const port = 9900 + Math.floor(Math.random() * 40);
const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,900',
  '--allow-file-access-from-files', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Edge did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result.value;
  };
  const until = async (expr, what, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return; await sleep(150); } throw new Error(`timed out: ${what}`); };
  for (const shot of SHOTS) {
    await send('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: shot.scale, mobile: shot.mobile });
    await send('Page.navigate', { url: pathToFileURL(path.join(appDir, 'index.html')).href });
    await until('!!(window.RS && RS.store && RS.library && RS.assets)', 'the app');
    // the sample ad, once: light theme, no opening animation
    await ev(`(async () => {
      sessionStorage.setItem('rs-intro', '1');
      localStorage.setItem('rs-appearance', JSON.stringify({ theme: 'light', haptics: true }));
      await RS.store.open();
      if ((await RS.store.listProjects()).length) return true;
      const p = RS.model.newProject(RS.templates.get('diagonal'), { trades: ['pedreiro', 'servente'] });
      p.name = 'Pedreiros e serventes';
      p.whatsapp = { country: '351', number: '912345678' };
      p.offer = { salary: '1900', currency: '€', period: 'month', vacancies: '12' };
      const lib = await RS.library.index();
      const cat = RS.trades.get('pedreiro').photo;
      const it = lib.items.find((x) => x.cat === cat) || lib.items[0];
      if (it) {
        const a = await RS.assets.importFile(await RS.library.fileFor(it.id), 'photo');
        p.photo = { asset: a.id, zoom: 1, fx: 0.5, fy: a.h > a.w * 1.3 ? 0.36 : 0.5, flip: false, adj: { ...RS.model.DEFAULT_FX } };
      }
      await RS.store.putProject(p);
      return true;
    })()`);
    await send('Page.reload');
    await sleep(800);
    await until(`!!document.querySelector('.proj-open')`, 'the ad on the home screen');
    await ev(`document.querySelector('.proj-open').click()`);
    await until(`!!document.querySelector('.editor .poster')`, 'the editor');
    await sleep(2500);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, shot.name), Buffer.from(r.result.data, 'base64'));
    console.log(`${shot.name}  ${shot.width * shot.scale}×${shot.height * shot.scale}`);
  }
  ws.close();
} finally {
  proc.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
}
