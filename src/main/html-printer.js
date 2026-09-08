const { BrowserWindow } = require('electron');

/**
 * Jalur cetak HTML (bukan ZPL). Dipakai route POST /print-html.
 *
 * ZPL loopback (print-raw.ps1) mengirim byte mentah ke Winspool RAW — printer
 * yang menyusun layout. Untuk label yang di-render dari HTML/CSS kita butuh
 * mesin render: BrowserWindow tak terlihat → webContents.print({ silent }).
 *
 * Printer TIDAK diambil dari default OS kecuali benar-benar tidak ada pilihan:
 *   body.printer  >  store.defaultZplPrinter (pilihan menu Settings)  >  isDefault
 *
 * BrowserWindow.print tidak boleh dijalankan paralel — dikunci lewat `busy`.
 */

let busy = Promise.resolve();

/**
 * @param {string} html  dokumen HTML lengkap (punya <style>/@page sendiri)
 * @param {{ printer?: string, copies?: number, pageSize?: {width:number,height:number}, landscape?: boolean, marginsType?: string }} opts
 * @returns {Promise<{ printer: string }>}
 */
async function printHtml(html, opts = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('invalid_html: field "html" is required');
  }

  // Serialisasi: job HTML berikutnya menunggu yang sekarang selesai.
  const run = busy.then(() => doPrint(html, opts), () => doPrint(html, opts));
  busy = run.catch(() => {}); // rantai tetap hidup walau job ini gagal
  return run;
}

async function doPrint(html, opts) {
  const {
    printer,
    copies = 1,
    // pageSize custom WAJIB mikron: 1mm = 1000 mikron. Default 21mm x 110mm
    // (samakan dengan @page di HTML label). null → pakai default printer.
    pageSize = { width: 21000, height: 110000 },
    landscape = false,
    marginsType = 'none',
  } = opts;

  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: true },
  });

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Beri layout/font sekejap untuk settle sebelum snapshot cetak.
    await new Promise((r) => setTimeout(r, 50));

    const printers = await win.webContents.getPrintersAsync();
    const deviceName =
      (printer && printer.trim()) ||
      require('./config-store').get('defaultZplPrinter') ||
      printers.find((p) => p.isDefault)?.name;

    if (!deviceName) {
      throw new Error('printer_not_found: no printer available (set one in Settings)');
    }
    if (printers.length && !printers.some((p) => p.name === deviceName)) {
      throw new Error(`printer_not_found: "${deviceName}" is not installed`);
    }

    const printOptions = {
      silent: true, // tanpa ini dialog print OS muncul
      deviceName,
      copies: Number(copies) || 1,
      margins: { marginType: marginsType }, // margin default OS bisa memotong label kecil
      landscape, // rotasi label diurus CSS, bukan flag ini
    };
    if (pageSize) printOptions.pageSize = pageSize;

    await new Promise((resolve, reject) => {
      win.webContents.print(printOptions, (success, errorType) => {
        if (success) resolve();
        else reject(new Error(errorType || 'print_failed'));
      });
    });

    console.log(`[HtmlPrint] → "${deviceName}" (${printOptions.copies}x) OK.`);
    return { printer: deviceName };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { printHtml };
