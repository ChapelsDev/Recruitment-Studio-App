import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(release, '..', '..');
const source = path.join(workspace, 'recruitment-studio-web');
const output = path.join(workspace, 'web-publicar', 'recruitment-studio');
const json = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walk(root, dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const f = path.join(dir, e.name);
    assert(!e.isSymbolicLink(), `Ligacao inesperada: ${f}`);
    return e.isDirectory() ? walk(root, f) : [path.relative(root, f).replaceAll('\\', '/')];
  }).sort();
}
const before = json(path.join(release, 'aplicacao-validada-v25-manifesto.json'));
assert.deepEqual(walk(source), before.map(f => f.path).sort(), 'A lista de ficheiros da origem mudou');
for (const f of before) assert.equal(hash(path.join(source, f.path)), f.sha256, `A origem mudou: ${f.path}`);
const roots = ['index.html', 'manifest.webmanifest', 'assets', 'vendor', 'js', 'photos', 'licenses'];
const copied = walk(source).filter(f => roots.some(r => f === r || f.startsWith(r + '/')));
const generated = ['sw.js', 'web.config', '_headers', 'LEIA-ME.txt'];
const files = walk(output);
assert.deepEqual(files, [...copied, ...generated].sort(), 'Conteudo inesperado na distribuicao');
for (const f of files) assert(!/(^|\/)(tests|evidence|node_modules|tools|\.git)(\/|$)|(^|\/)package(-lock)?\.json$|\.(test|spec)\./i.test(f), `Ficheiro de desenvolvimento: ${f}`);
for (const f of copied) assert.equal(hash(path.join(output, f)), hash(path.join(source, f)), `Copia alterada: ${f}`);

const contentHash = crypto.createHash('sha1');
for (const f of copied) contentHash.update(f).update(fs.readFileSync(path.join(output, f)));
const version = `recruitment-studio-${contentHash.digest('hex').slice(0, 10)}`;
const sw = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
assert.equal(sw.match(/const CACHE = '([^']+)';/)[1], version);
const core = JSON.parse(sw.match(/const CORE = (\[[\s\S]*?\]);/)[1]);
const normalizeSW = s => s.replace(/const CACHE = '[^']*';/, 'const CACHE = VERSION;').replace(/const CORE = \[[\s\S]*?\];/, 'const CORE = FILES;');
assert.equal(normalizeSW(sw), normalizeSW(fs.readFileSync(path.join(source, 'sw.js'), 'utf8')), 'Logica do service worker alterada');
const references = new Set(['sw.js']);
function requireLocal(ref, owner) {
  if (!ref || ref.startsWith('#') || /^(data:|blob:)/.test(ref)) return;
  assert(!/^(https?:)?\/\//.test(ref), `Dependencia remota: ${owner}: ${ref}`);
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  const resolved = path.resolve(output, path.dirname(owner), clean);
  assert(resolved === output || resolved.startsWith(output + path.sep), `Referencia fora do pacote: ${ref}`);
  assert(fs.existsSync(resolved), `Referencia em falta: ${owner}: ${ref}`);
  references.add(path.relative(output, resolved).replaceAll('\\', '/') || '.');
}
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) requireLocal(m[1], 'index.html');
for (const f of files.filter(f => f.endsWith('.css'))) {
  const css = fs.readFileSync(path.join(output, f), 'utf8');
  for (const m of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) requireLocal(m[1], f);
}
const manifest = json(path.join(output, 'manifest.webmanifest'));
for (const ref of [manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map(i => i.src), ...manifest.screenshots.map(i => i.src)]) requireLocal(ref, 'manifest.webmanifest');
assert.equal(new Set(core).size, core.length, 'Duplicados no CORE');
for (const ref of core) requireLocal(ref, 'sw.js');
for (const f of copied.filter(f => !f.startsWith('photos/full/') && !f.startsWith('licenses/'))) assert(core.includes('./' + f), `Recurso ausente do CORE: ${f}`);
const library = fs.readFileSync(path.join(output, 'photos/library.js'), 'utf8');
const photos = [...new Set([...library.matchAll(/"id"\s*:\s*"([a-zA-Z0-9_-]+)"/g)].map(m => `photos/full/${m[1]}.js`))];
for (const f of photos) requireLocal('./' + f, 'index.html');
assert.deepEqual(files.filter(f => f.startsWith('photos/full/')), [...photos].sort(), 'Fotografias sem correspondencia com a biblioteca');
const scripts = files.filter(f => f.endsWith('.js'));
for (const f of scripts) new vm.Script(fs.readFileSync(path.join(output, f), 'utf8'), { filename: f });
const fileManifest = files.map(f => ({ path: f, bytes: fs.statSync(path.join(output, f)).size, sha256: hash(path.join(output, f)) }));
fs.writeFileSync(path.join(release, 'pacote-manifesto.json'), JSON.stringify(fileManifest, null, 2) + '\n');
const result = {
  checkedAt: new Date().toISOString(), timezone: 'Europe/Lisbon', source, output, version,
  sourceFilesUnchanged: before.length, files: files.length, bytes: fileManifest.reduce((s, f) => s + f.bytes, 0),
  copiedFilesByteIdentical: copied.length, generatedFiles: generated, coreResources: core.length,
  photos: photos.length, localReferencesChecked: references.size, javaScriptSyntaxChecked: scripts.length,
  developmentFilesExcluded: true, serviceWorkerLogicUnchanged: true,
  previousValidation: { tests: 237, passed: 237, repeatedNow: false, evidence: 'tests/evidence/2026-10-26/unit-final.log' },
  browserDataBackup: { status: 'pending', reason: 'Instalacao habitual e perfil nao identificados. Windows e PWA podem ter bibliotecas independentes.' }
};
fs.writeFileSync(path.join(release, 'VERIFICACAO.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
