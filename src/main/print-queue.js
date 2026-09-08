const crypto = require('crypto');
const store = require('./config-store');

/**
 * Antrian print ZPL — 1 job at a time (docs/zd220-print-agent.md §2).
 * Electron app "bodoh": terima byte ZPL dari HTTP server, teruskan ke adapter.
 * Logika label (buildFruitZpl dsb) ada di repo dsmart, bukan di sini.
 */

const queue = [];
let processing = false;
let printerAdapter = null;

function setPrinterAdapter(adapter) {
  printerAdapter = adapter;
}

/**
 * @param {{ type: 'zpl', data: string, copies?: number, printer?: string }} job
 * @returns {Promise<string>} jobId — 200 dari POST /print berarti job MASUK ANTRIAN,
 *   bukan berarti kertas sudah keluar (RAW spooling = fire and forget, §4).
 */
function enqueuePrintJob(job) {
  if (!job || job.type !== 'zpl') {
    return Promise.reject(new Error('invalid_job: only { type: "zpl" } supported'));
  }
  if (typeof job.data !== 'string' || !job.data.trim()) {
    return Promise.reject(new Error('invalid_zpl: field "data" is required'));
  }

  const jobId = crypto.randomBytes(4).toString('hex');
  const printer = job.printer || store.get('defaultZplPrinter');
  const copies = Number(job.copies) || 1;

  return new Promise((resolve, reject) => {
    queue.push({ jobId, zpl: job.data, printer, copies, resolve, reject });
    processNext();
  });
}

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;
  const job = queue.shift();

  try {
    if (!printerAdapter) throw new Error('internal: printer adapter not set');
    if (!job.printer) throw new Error('printer_not_found: no printer configured (set defaultZplPrinter or pass "printer")');

    if (store.get('dryRun') && typeof printerAdapter.printRaw === 'function') {
      console.log(`[Queue] dryRun — job ${job.jobId} tidak dikirim ke printer.`);
    }

    await printerAdapter.printRaw(job.zpl, { printer: job.printer, copies: job.copies });
    console.log(`[Queue] Job ${job.jobId} → "${job.printer}" (${job.copies}x) OK.`);
    job.resolve(job.jobId);
  } catch (err) {
    console.error(`[Queue] Job ${job.jobId} gagal:`, err.message);
    job.reject(err);
  } finally {
    processing = false;
    processNext();
  }
}

/**
 * Daftar printer terpasang (GET /health & GET /printers).
 */
async function listPrinters() {
  if (!printerAdapter || typeof printerAdapter.listPrinters !== 'function') return [];
  try {
    return await printerAdapter.listPrinters();
  } catch (err) {
    console.error('[Queue] listPrinters gagal:', err.message);
    return [];
  }
}

module.exports = { setPrinterAdapter, enqueuePrintJob, listPrinters };
