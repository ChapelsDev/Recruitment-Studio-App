// Development tool: embeds a folder of photos into the app's photo library.
// Usage: node tools/build-photos.mjs "<folder with photos>" [--map map.json]
// The optional map ({ "file name or relative path": "category" | "skip" }) sorts
// loose photos into trades and leaves broken ones out.
//
// Put photos in sub-folders named after the trade (eletricista, pedreiro,
// cofragem, canalizador, pintor, ...). Photos at the top level, or in a folder
// with another name, go to "geral". Each photo is resized (1800 px long side,
// plus a 360 px thumbnail) with Windows' own System.Drawing, and written as a JS
// file with a data URL: images read from file:// would block the export.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
const mapArg = process.argv.indexOf('--map');
const MAP = mapArg > 0 ? JSON.parse(fs.readFileSync(process.argv[mapArg + 1], 'utf8')) : {};
if (!src || !fs.existsSync(src)) {
  console.error('Usage: node tools/build-photos.mjs "<folder with photos>"');
  process.exit(1);
}

// Folder name (lower case, no accents) -> trade photo category used by js/trades.js.
const ALIASES = {
  obras: ['obras', 'obra', 'construcao', 'construcao civil', 'empreiteiro', 'encarregado', 'construction'],
  pedreiro: ['pedreiro', 'pedreiros', 'masseiro', 'masseiros', 'alvenaria', 'bricklayer', 'maurer'],
  cofragem: ['cofragem', 'cofragista', 'cofragistas', 'carpinteiro cofragem', 'formwork', 'schaler'],
  ferro: ['ferro', 'armador', 'armadores', 'armador ferro', 'armador de ferro', 'steel fixer', 'eisenleger'],
  eletricista: ['eletricista', 'eletricistas', 'electricista', 'electrician', 'elektriker'],
  canalizador: ['canalizador', 'canalizadores', 'avac', 'plumber', 'sanitar'],
  pintor: ['pintor', 'pintores', 'estucador', 'painter', 'maler'],
  carpinteiro: ['carpinteiro', 'carpinteiros', 'marceneiro', 'carpenter', 'schreiner'],
  serralheiro: ['serralheiro', 'serralheiros', 'soldador', 'soldadores', 'welder', 'schweisser'],
  ladrilhador: ['ladrilhador', 'ladrilhadores', 'azulejo', 'tiler', 'plattenleger'],
  telhados: ['telhados', 'telhador', 'telhadores', 'coberturas', 'roofer', 'dachdecker'],
  maquinas: ['maquinas', 'manobrador', 'operador maquinas', 'gruista', 'grua', 'escavadora', 'machines'],
  pladur: ['pladur', 'montador pladur', 'tetos', 'teto falso', 'drywall', 'trockenbau'],
  servente: ['servente', 'serventes', 'ajudante', 'labourer'],
  tecnico: ['tecnico', 'tecnicos', 'engenheiro', 'engenharia', 'diretor de obra', 'engineer'],
};
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_-]+/g, ' ').trim();
function categoryOf(rel) {
  const mapped = MAP[rel.split(path.sep).join('/')] || MAP[path.basename(rel)];
  if (mapped) return mapped;
  const parts = rel.split(/[\\/]/);
  if (parts.length < 2) return 'geral';
  const folder = norm(parts[0]).replace(/^\d+\s*/, ''); // "02_carpinteiro_cofragem" -> "carpinteiro cofragem"
  for (const [cat, names] of Object.entries(ALIASES)) if (names.includes(folder)) return cat;
  const words = folder.split(/\s+/);
  for (const [cat, names] of Object.entries(ALIASES)) if (names.some((n) => !n.includes(' ') && words.includes(n))) return cat;
  return 'geral';
}

const exts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (exts.has(path.extname(e.name).toLowerCase())) files.push(p);
  }
})(src);
if (!files.length) { console.error('No photos found (jpg, png, webp).'); process.exit(1); }

for (let i = files.length - 1; i >= 0; i--) {
  const rel = path.relative(src, files[i]);
  if (categoryOf(rel) === 'skip') { console.log(`  left out (map): ${rel}`); files.splice(i, 1); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-photos-'));
const jobs = files.map((f, i) => {
  const hash = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
  const cat = categoryOf(path.relative(src, f));
  return { src: f, cat, id: `${cat}-${hash}`, full: path.join(tmp, `${i}-full.jpg`), thumb: path.join(tmp, `${i}-thumb.jpg`) };
});
const jobsPath = path.join(tmp, 'jobs.json');
const resultPath = path.join(tmp, 'result.json');
fs.writeFileSync(jobsPath, JSON.stringify(jobs.map(({ src: s, full, thumb }) => ({ src: s, full, thumb }))));

const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$jobs = Get-Content -LiteralPath ${JSON.stringify(jobsPath)} -Raw -Encoding UTF8 | ConvertFrom-Json
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Save-Resized($img, $max, $file, $q) {
  $k = [Math]::Min(1.0, $max / [Math]::Max($img.Width, $img.Height))
  $w = [int][Math]::Round($img.Width * $k); $h = [int][Math]::Round($img.Height * $k)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  $g.DrawImage($img, 0, 0, $w, $h)
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$q)
  $bmp.Save($file, $codec, $ep)
  $g.Dispose(); $bmp.Dispose()
  return @{ w = $w; h = $h }
}
$out = @()
foreach ($j in $jobs) {
  try {
    $img = [System.Drawing.Image]::FromFile($j.src)
    if ($img.PropertyIdList -contains 274) {
      switch ([int]$img.GetPropertyItem(274).Value[0]) { 3 { $img.RotateFlip('Rotate180FlipNone') } 6 { $img.RotateFlip('Rotate90FlipNone') } 8 { $img.RotateFlip('Rotate270FlipNone') } }
    }
    $f = Save-Resized $img 1800 $j.full 84
    $null = Save-Resized $img 360 $j.thumb 74
    $img.Dispose()
    $out += @{ ok = $true; w = $f.w; h = $f.h }
  } catch { $out += @{ ok = $false; err = $_.Exception.Message } }
}
ConvertTo-Json -InputObject $out -Depth 3 | Set-Content -LiteralPath ${JSON.stringify(resultPath)} -Encoding UTF8
`;
console.log(`Processing ${files.length} photo(s)...`);
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
const results = JSON.parse(fs.readFileSync(resultPath, 'utf8').replace(/^﻿/, ''));

const photosDir = path.join(appDir, 'photos');
const fullDir = path.join(photosDir, 'full');
fs.mkdirSync(fullDir, { recursive: true });
const items = [];
const seen = new Set();
jobs.forEach((j, i) => {
  const r = results[i];
  if (!r || !r.ok) { console.warn(`  skipped ${path.relative(src, j.src)}: ${r ? r.err : 'no result'}`); return; }
  if (seen.has(j.id)) return; // the same photo twice
  seen.add(j.id);
  const b64 = (p) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
  fs.writeFileSync(path.join(fullDir, `${j.id}.js`), `RS.photoData(${JSON.stringify(j.id)},${JSON.stringify(b64(j.full))});\n`);
  // Upright photos: faces sit in the top third, so frame higher by default.
  items.push({ id: j.id, cat: j.cat, w: r.w, h: r.h, fy: r.h > r.w * 1.3 ? 0.36 : 0.5, thumb: b64(j.thumb) });
});
for (const f of fs.readdirSync(fullDir)) if (!seen.has(f.replace(/\.js$/, ''))) fs.unlinkSync(path.join(fullDir, f));
items.sort((a, b) => a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id));
fs.writeFileSync(path.join(photosDir, 'library.js'),
  '// Generated by tools/build-photos.mjs - do not edit.\nwindow.RS = window.RS || {};\n' +
  `RS.PHOTO_LIBRARY = ${JSON.stringify({ builtAt: new Date().toISOString(), items })};\n`);
fs.rmSync(tmp, { recursive: true, force: true });

const byCat = {};
for (const it of items) byCat[it.cat] = (byCat[it.cat] || 0) + 1;
const size = fs.readdirSync(fullDir).reduce((a, f) => a + fs.statSync(path.join(fullDir, f)).size, 0);
console.log(`Library: ${items.length} photos, ${(size / 1048576).toFixed(1)} MB`);
for (const [c, n] of Object.entries(byCat)) console.log(`  ${c.padEnd(14)} ${n}`);
