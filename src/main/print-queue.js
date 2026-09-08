const path = require('path');
const os = require('os');
const fs = require('fs');
const unzipper = require('unzipper');
const api = require('./api-client');
const store = require('./config-store');

const queue = [];
let processing = false;
let printerAdapter = null; // di-set Langkah F — sebelum itu, cuma log (aman buat develop di Ubuntu)

function setPrinterAdapter(adapter) {
  printerAdapter = adapter;
}

function enqueue(job) {
  queue.push(job);
  processNext();
}

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;
  const job = queue.shift();

  try {
    await handleJob(job);
  } catch (err) {
    console.error(`[Queue] Gagal proses print request #${job.print_request_id}:`, err.message);
  } finally {
    processing = false;
    processNext(); // 1 job at a time — job berikutnya baru diambil setelah ini kelar
  }
}

async function handleJob(job) {
  const printRequestId = job.print_request_id;

  try {
    await api.claimPrintRequest(printRequestId);
    console.log(`[Queue] Menang klaim print request #${printRequestId}.`);
  } catch (err) {
    console.log(`[Queue] Kalah klaim print request #${printRequestId}, skip.`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `print-${printRequestId}-`));
  const zipPath = path.join(tmpDir, 'photos.zip');

  await api.downloadZip(printRequestId, zipPath);

  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: tmpDir })).promise();

  const files = fs.readdirSync(tmpDir)
    .filter((f) => f !== 'photos.zip')
    .map((f) => path.join(tmpDir, f));

  if (files.length === 0) {
    await api.reportStatus(printRequestId, 'failed', 'ZIP kosong / gagal extract.');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  await api.reportStatus(printRequestId, 'processing');

  try {
    if (printerAdapter) {
      await printerAdapter.print(files, store.get('printerName'));
    } else {
      console.log(`[Queue] (stub, adapter belum dipasang) Akan print ${files.length} file:`, files);
    }
    await api.reportStatus(printRequestId, 'done');
    console.log(`[Queue] Print request #${printRequestId} selesai.`);
  } catch (err) {
    await api.reportStatus(printRequestId, 'failed', err.message);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { enqueue, setPrinterAdapter };