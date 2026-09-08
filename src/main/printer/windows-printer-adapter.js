const { execFile } = require('child_process');
const path = require('path');

class WindowsPrinterAdapter {
  async print(files, printerName) {
    for (const file of files) {
      await this.printOne(file, printerName);
    }
  }

  printOne(filePath, printerName) {
    const scriptPath = path.join(__dirname, 'print-image.ps1');

    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass', // cuma untuk eksekusi ini, gak ubah policy sistem
          '-File', scriptPath,
          '-ImagePath', filePath,
          '-PrinterName', printerName,
        ],
        { windowsHide: true, timeout: 30000 }, // windowsHide — gak ada jendela PowerShell kekedip muncul
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          if (stdout.trim() !== 'OK') return reject(new Error(stdout.trim() || 'Print gagal, output tidak dikenali.'));
          resolve();
        }
      );
    });
  }
}

module.exports = WindowsPrinterAdapter;