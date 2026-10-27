// Development tool: packs assets/app.ico from the icon PNGs (rendered by
// tools/build-icons.mjs from assets/brand/*.svg) and compiles "Recruitment Studio.exe"
// (a tiny launcher that opens the app in its own Edge window) with the C# compiler
// that ships with Windows (.NET Framework 4).
// Usage: node tools/build-icons.mjs && node tools/build-launcher.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = path.join(appDir, 'assets', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

// ---------------------------------------------------------------- icon PNGs (from tools/build-icons.mjs)
const missing = [16, 24, 32, 48, 64, 128, 256].map((s) => path.join(iconsDir, `icon-${s}.png`)).filter((p) => !fs.existsSync(p));
if (missing.length) { console.error(`Missing ${missing.join(', ')}: run tools/build-icons.mjs first.`); process.exit(1); }

// ---------------------------------------------------------------- app.ico (PNG entries)
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = icoSizes.map((s) => fs.readFileSync(path.join(iconsDir, `icon-${s}.png`)));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const e = 6 + i * 16, s = icoSizes[i];
  header.writeUInt8(s >= 256 ? 0 : s, e); header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png.length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
const icoPath = path.join(appDir, 'assets', 'app.ico');
fs.writeFileSync(icoPath, Buffer.concat([header, ...pngs]));

// ---------------------------------------------------------------- launcher .exe
const cs = `using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Recruitment Studio")]
[assembly: AssemblyProduct("Recruitment Studio")]
[assembly: AssemblyDescription("Anúncios de recrutamento para Facebook e Instagram")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

static class Program {
  [STAThread]
  static void Main() {
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string index = Path.Combine(dir, "index.html");
    if (!File.Exists(index)) {
      MessageBox.Show("Não encontrei o ficheiro index.html junto a este programa. Mantenha o programa dentro da pasta da aplicação.", "Recruitment Studio", MessageBoxButtons.OK, MessageBoxIcon.Warning);
      return;
    }
    string url = new Uri(index).AbsoluteUri;
    string browser = FindBrowser();
    try {
      if (browser != null) Process.Start(new ProcessStartInfo(browser, "--app=\\"" + url + "\\" --window-size=1440,900") { UseShellExecute = false });
      else Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    } catch (Exception ex) {
      MessageBox.Show("Não foi possível abrir o Recruitment Studio: " + ex.Message, "Recruitment Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
  }

  static string FindBrowser() {
    Environment.SpecialFolder[] roots = { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.LocalApplicationData };
    foreach (Environment.SpecialFolder f in roots) {
      string root = Environment.GetFolderPath(f);
      if (string.IsNullOrEmpty(root)) continue;
      string edge = Path.Combine(root, "Microsoft", "Edge", "Application", "msedge.exe");
      if (File.Exists(edge)) return edge;
    }
    foreach (string exe in new[] { "msedge.exe", "chrome.exe" }) {
      string p = AppPath(Registry.LocalMachine, exe) ?? AppPath(Registry.CurrentUser, exe);
      if (p != null && File.Exists(p)) return p;
    }
    return null;
  }

  static string AppPath(RegistryKey hive, string exe) {
    string key = string.Join(((char)92).ToString(), new[] { "SOFTWARE", "Microsoft", "Windows", "CurrentVersion", "App Paths", exe });
    using (RegistryKey k = hive.OpenSubKey(key)) {
      return k == null ? null : k.GetValue(null) as string;
    }
  }
}
`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-launcher-'));
const csPath = path.join(tmp, 'RecruitmentStudio.cs');
fs.writeFileSync(csPath, '\uFEFF' + cs, 'utf8');
const csc = ['Framework64', 'Framework'].map((f) => path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET', f, 'v4.0.30319', 'csc.exe')).find((p) => fs.existsSync(p));
if (!csc) { console.error('C# compiler not found (.NET Framework 4).'); process.exit(1); }
const exePath = path.join(appDir, 'Recruitment Studio.exe');
execFileSync(csc, ['/nologo', '/target:winexe', '/optimize+', '/codepage:65001', `/win32icon:${icoPath}`, `/out:${exePath}`, '/r:System.Windows.Forms.dll', csPath], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Icons: ${iconsDir}`);
console.log(`Icon:  ${icoPath} (${fs.statSync(icoPath).size} bytes)`);
console.log(`Exe:   ${exePath} (${fs.statSync(exePath).size} bytes)`);
