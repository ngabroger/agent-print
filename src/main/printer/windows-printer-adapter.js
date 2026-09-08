const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

/**
 * Adapter Windows untuk jalur ZPL RAW (docs/zd220-print-agent.md §3.3).
 * Byte ZPL dikirim mentah ke antrian printer lewat print-raw.ps1 (Winspool RAW),
 * BUKAN lewat driver rendering. Printer (ZD220) yang menyusun layout.
 */

// Saat ter-package, __dirname ada di dalam app.asar (archive virtual) —
// PowerShell tidak bisa -File dari situ. electron-builder meng-unpack *.ps1
// ke app.asar.unpacked/... via "asarUnpack" di package.json; di sini kita
// arahkan path-nya ke sana. Mode dev: path apa adanya.
const PS_DIR = __dirname.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

class WindowsPrinterAdapter {
  /**
   * @param {string} zpl  perintah ZPL lengkap "^XA ... ^XZ"
   * @param {{ printer?: string, copies?: number }} opts
   */
  async printRaw(zpl, { printer, copies = 1 } = {}) {
    if (!printer) throw new Error('printer_not_found: no printer name given');
    if (typeof zpl !== 'string' || !zpl.trim()) throw new Error('invalid_zpl: empty ZPL');

    // ^PQ<n> untuk copies — sisipkan sebelum ^XZ kalau belum ada di payload.
    let payload = zpl;
    if (copies > 1 && !/\^PQ\d+/.test(payload)) {
      payload = payload.replace(/\^XZ\s*$/, `^PQ${copies}\n^XZ`);
    }

    // File sementara ditulis sebagai latin-1 — ZPL bukan UTF-8.
    const tmp = path.join(os.tmpdir(), `dsmart-zpl-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    await fs.writeFile(tmp, Buffer.from(payload, 'latin1'));

    const scriptPath = path.join(PS_DIR, 'print-raw.ps1');
    try {
      await new Promise((resolve, reject) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath,
            '-PrinterName', printer,
            '-FilePath', tmp,
          ],
          { windowsHide: true, timeout: 30000 },
          (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            if (stdout.trim() !== 'OK') {
              return reject(new Error(stdout.trim() || 'Print gagal, output tidak dikenali.'));
            }
            resolve();
          }
        );
      });
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }

  /**
   * Enumerasi printer terpasang (dipakai GET /health & GET /printers).
   */
  async listPrinters() {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
        { windowsHide: true, timeout: 15000 },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve(
            stdout
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }
      );
    });
  }
}

module.exports = WindowsPrinterAdapter;
