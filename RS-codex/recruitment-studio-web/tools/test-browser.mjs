// Development tool: runs the browser tests in Microsoft Edge without a window and
// prints the results. Each page runs in its own fresh profile (empty storage):
//   tests/browser/run.html     engine, model and video cases (no app.js)
//   tests/browser/run-recipes.html  the video models (recipes), frame by frame
//   tests/browser/run-ui.html  the whole app, driven through its interface
//   tests/browser/run-mobile.html  the app on a small phone (a 360 × 740 window)
// Exit code 0 when everything passes.
// Usage: node tools/test-browser.mjs [page.html ...]   (EDGE_PATH=... for another browser;
// TEST_GREP=text runs only the cases whose name contains it)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['run.html', 'run-recipes.html', 'run-ui.html', 'run-mobile.html'];
const edge = process.env.EDGE_PATH || [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((p) => fs.existsSync(p));
if (!edge) { console.error('Microsoft Edge not found (set EDGE_PATH).'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPage(file) {
  const page = pathToFileURL(path.join(appDir, 'tests', 'browser', file)).href + (process.env.TEST_GREP ? `?grep=${encodeURIComponent(process.env.TEST_GREP)}` : '');
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-tests-'));
  // a phone page opens blank, gets the phone's screen (headless windows stay wider than
  // about 500 px) and then loads, so the app starts at that size
  const phone = /mobile/.test(file);
  // no first-run or sync pages: a signed-in Windows account made Edge open
  // edge://sync-confirmation-dialog, which pushed the test tab into the background
  const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1366,900',
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-features=msImplicitSignin,msEdgeSyncConsent',
    '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', phone ? 'about:blank' : page], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && (phone ? t.url === 'about:blank' : t.url.startsWith('file:'))); } catch { /* not up yet */ }
    }
    if (!target) throw new Error(`Edge did not open ${file}`);
    // any edge:// page that still opened is closed, and the test tab is brought to the front
    const closeEdgePages = async () => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const stray = list.filter((t) => t.type === 'page' && t.url.startsWith('edge://'));
        for (const t of stray) await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
        // only when one was there: activating the tab again and again disturbed the cases' timing
        if (stray.length) await fetch(`http://127.0.0.1:${port}/json/activate/${target.id}`).catch(() => {});
      } catch { /* the browser went away */ }
    };
    await closeEdgePages();
    const edgeWatch = setInterval(closeEdgePages, 2000);
    proc.on('exit', () => clearInterval(edgeWatch));
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0;
    const pending = new Map();
    const pageErrors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') pageErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    };
    const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    await send('Runtime.enable');
    if (phone) {
      await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
      await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // :focus as in a window in use
      await send('Page.navigate', { url: page });
    }
    let results = null;
    for (let i = 0; i < 6000 && !results; i++) { // up to 25 minutes: the video models are checked frame by frame
      const r = await send('Runtime.evaluate', { expression: 'window.__testsDone ? JSON.stringify(window.__results) : null', returnByValue: true });
      if (r.result && r.result.value) results = JSON.parse(r.result.value);
      else await sleep(250);
    }
    ws.close();
    if (!results) throw new Error(`timed out waiting for the tests in ${file}`);
    return { results, pageErrors };
  } finally {
    proc.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked: the OS temp cleaner removes it */ }
  }
}

let passed = 0, failed = 0;
try {
  for (const file of pages) {
    const { results, pageErrors } = await runPage(file);
    for (const r of results) {
      console.log(r.ok ? `PASS ${r.name}` : `FAIL ${r.name}: ${r.error}`);
      if (r.ok) passed++; else failed++;
    }
    for (const e of pageErrors) { console.log(`PAGE ERROR (${file}) ${e}`); failed++; }
  }
} catch (err) {
  console.error(String((err && err.message) || err));
  failed++;
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
