// Development tool: builds the folder to publish on a web server (installable on
// phones, offline after the first visit) and a ZIP of it.
// Usage: node tools/build-web.mjs
// Output: ../web-publicar/recruitment-studio/ and ../web-publicar/recruitment-studio-web.zip
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.resolve(appDir, '..', 'web-publicar');
const out = path.join(outRoot, 'recruitment-studio');
const zipPath = path.join(outRoot, 'recruitment-studio-web.zip');
const INCLUDE = ['index.html', 'manifest.webmanifest', 'assets', 'vendor', 'js', 'photos', 'licenses'];

if (!fs.existsSync(path.join(appDir, 'photos', 'library.js'))) {
  console.error('photos/library.js is missing: run tools/build-photos.mjs first.');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of INCLUDE) fs.cpSync(path.join(appDir, name), path.join(out, name), { recursive: true });

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(path.relative(out, p).split(path.sep).join('/'));
  }
})(out);
files.sort();

// Version = hash of every published file: any change gives phones a new cache.
const h = crypto.createHash('sha1');
for (const f of files) h.update(f).update(fs.readFileSync(path.join(out, f)));
const version = h.digest('hex').slice(0, 10);
const core = ['./', ...files.filter((f) => !f.startsWith('photos/full/') && !f.startsWith('licenses/')).map((f) => `./${f}`)];
let sw = fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'recruitment-studio-${version}';`)
  .replace(/const CORE = \[[\s\S]*?\];/, `const CORE = ${JSON.stringify(core, null, 2)};`);
fs.writeFileSync(path.join(out, 'sw.js'), sw);

// IIS: serve .webmanifest and never cache the service worker.
fs.writeFileSync(path.join(out, 'web.config'), `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".webmanifest" />
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
    </staticContent>
  </system.webServer>
  <location path="sw.js">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="DisableCache" />
      </staticContent>
    </system.webServer>
  </location>
</configuration>
`);
// Netlify / Cloudflare Pages: same two rules.
fs.writeFileSync(path.join(out, '_headers'), '/sw.js\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Content-Type: application/manifest+json\n');
fs.writeFileSync(path.join(out, 'LEIA-ME.txt'), [
  'Recruitment Studio - versao web instalavel',
  '',
  'Publique esta pasta num endereco https (obrigatorio para instalar no telemovel).',
  '- Servidor IIS: copie a pasta para o site; o web.config ja trata dos tipos de ficheiro.',
  '- Netlify: arraste esta pasta para https://app.netlify.com/drop',
  '',
  'No telemovel: abra o endereco e toque em "Instalar app" (Android) ou',
  'Partilhar > Adicionar ao ecra principal (iPhone). Depois da primeira abertura',
  'funciona sem rede. Para atualizar, volte a publicar a pasta gerada.',
  '',
].join('\r\n'));

// ZIP with 7-Zip (the house tool for packages).
const sevenZip = 'C:/Program Files/7-Zip/7z.exe';
fs.rmSync(zipPath, { force: true });
if (fs.existsSync(sevenZip)) execFileSync(sevenZip, ['a', '-tzip', '-mx=5', zipPath, '.'], { cwd: out, stdio: 'ignore' });

const size = files.reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
console.log(`Folder:  ${out}`);
console.log(`Files:   ${files.length + 4} (${(size / 1048576).toFixed(1)} MB), cache recruitment-studio-${version}`);
if (fs.existsSync(zipPath)) console.log(`ZIP:     ${zipPath} (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`);
