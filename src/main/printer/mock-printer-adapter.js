const fs = require('fs/promises');
const os = require('os');
const path = require('path');

/**
 * Adapter dev (non-Windows, atau dryRun). printRaw() menulis ZPL ke file di
 * temp folder, tidak menyentuh printer. listPrinters() balikan printer dummy
 * supaya UI frontend tetap bisa dikembangkan tanpa hardware.
 */
class MockPrinterAdapter {
  async printRaw(zpl, opts = {}) {
    const dir = path.join(os.tmpdir(), 'dsmart-mock-labels');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `label-${Date.now()}.zpl`);
    await fs.writeFile(file, zpl);
    console.log(`[MockPrinter] printRaw → ${file}`, opts);
    await new Promise((r) => setTimeout(r, 200));
    return file;
  }

  async listPrinters() {
    return ['Mock ZD220 (dev)', 'Microsoft Print to PDF'];
  }
}

module.exports = MockPrinterAdapter;
