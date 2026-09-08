/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Bungkus hasil `npm run dist` jadi satu .zip siap kirim ke IT:
 *
 *   dist/PrintAgent-Setup-<versi>-bundle.zip
 *   ├── PrintAgent-Setup-<versi>.exe   ← installer NSIS
 *   ├── .env.example                   ← contoh konfigurasi
 *   └── BACA-DULU.txt                  ← langkah pasang singkat
 *
 * Jalan otomatis lewat `npm run dist` (script "dist" memanggil ini setelah
 * electron-builder). Bisa juga manual: `node scripts/pack-installer-zip.js`.
 */

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = pkg.version;

const installerName = `PrintAgent-Setup-${VERSION}.exe`;
const installerPath = path.join(DIST, installerName);
const envExamplePath = path.join(ROOT, '.env.example');
const outZip = path.join(DIST, `PrintAgent-Setup-${VERSION}-bundle.zip`);

function fail(msg) {
  console.error(`[pack-zip] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(installerPath)) {
  fail(`Installer tidak ditemukan: ${installerPath}\n         Jalankan "npm run dist" dulu (atau "npx electron-builder --win --x64").`);
}
if (!fs.existsSync(envExamplePath)) {
  fail(`.env.example tidak ditemukan di root repo — dibutuhkan untuk bundle.`);
}

const readme = `Print Agent ${VERSION} — paket installer
==========================================

Isi paket:
  - ${installerName}   installer (butuh hak admin)
  - .env.example       contoh file konfigurasi
  - BACA-DULU.txt      file ini

LANGKAH PASANG
--------------
1. Jalankan ${installerName}, ikuti wizard.
   (SmartScreen "Unknown publisher" untuk internal -> More info -> Run anyway.)

2. Buat file konfigurasi di:
     %APPDATA%\\print-agent\\.env
   (%APPDATA% = C:\\Users\\<user>\\AppData\\Roaming)
   Salin isi .env.example, sesuaikan minimal:
     PRINT_AGENT_PORT=9110
     PRINT_AGENT_ALLOWED_ORIGINS=https://app.dsmart.co,http://localhost:3000
   Nama printer TIDAK perlu diisi di sini kalau dipilih lewat menu tray
   "Pengaturan Printer..." (tidak memakai default printer Windows).

3. Jalankan "Print Agent" dari Start Menu. Ikon muncul di system tray.
   Klik kanan ikon -> "Pengaturan Printer..." untuk memilih printer ZPL.

4. Verifikasi: buka http://127.0.0.1:9110/health -> JSON { "ok": true }.

5. Agent auto-start pada login berikutnya.

6. Whitelist "Print Agent.exe" di antivirus/firewall bila loopback listener di-flag.

Ganti setting: edit %APPDATA%\\print-agent\\.env, keluar dari agent lewat tray,
jalankan lagi. Tidak perlu install ulang.

Detail lengkap: lihat BUILD.md di repo.
`;

const output = fs.createWriteStream(outZip);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const mb = (archive.pointer() / 1024 / 1024).toFixed(1);
  console.log(`[pack-zip] OK -> ${path.relative(ROOT, outZip)} (${mb} MB)`);
});
archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn('[pack-zip] warning:', err.message);
  else throw err;
});
archive.on('error', (err) => fail(err.message));

archive.pipe(output);
archive.file(installerPath, { name: installerName });
archive.file(envExamplePath, { name: '.env.example' });
archive.append(readme.replace(/\n/g, '\r\n'), { name: 'BACA-DULU.txt' });
archive.finalize();
