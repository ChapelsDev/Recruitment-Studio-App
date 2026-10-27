import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(release, '..', '..', 'web-publicar', 'recruitment-studio');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:18973').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400).end(); }
});
server.listen(18973, '127.0.0.1', async () => {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(release, 'pacote-manifesto.json'), 'utf8'));
    for (const f of manifest) {
      const response = await fetch('http://127.0.0.1:18973/' + f.path.split('/').map(encodeURIComponent).join('/'));
      assert.equal(response.status, 200, f.path);
      assert.equal(crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), f.sha256, f.path);
    }
    const result = { checkedAt: new Date().toISOString(), origin: 'http://127.0.0.1:18973', root, filesServedWithMatchingSHA256: manifest.length, pid: process.pid };
    fs.writeFileSync(path.join(release, 'verificacao-http.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } catch (e) { console.error(e); server.close(); process.exitCode = 1; }
});
