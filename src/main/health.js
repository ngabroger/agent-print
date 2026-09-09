const os = require('os');
const store = require('./config-store');
const printQueue = require('./print-queue');
const pkg = require('../../package.json');

/**
 * Kumpulan status agent — dipakai dua tempat:
 *   - GET /health (http-server.js)  → bentuk ringkas, kompatibel versi lama
 *   - IPC 'health:load' (index.js)  → bentuk lengkap untuk window "Status Agent"
 *
 * Tidak menyimpan state; tiap panggilan menghitung ulang.
 */

const startedAt = Date.now();

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}h ${h}j ${m}m`;
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m ${s % 60}d`;
  return `${s}d`;
}

/** Bentuk ringkas untuk GET /health (jangan ubah field lama). */
async function healthSummary() {
  const printers = await printQueue.listPrinters();
  return {
    ok: true,
    version: pkg.version,
    defaultPrinter: store.get('defaultZplPrinter') ?? printers[0] ?? null,
    dryRun: Boolean(store.get('dryRun')),
    printers,
  };
}

/**
 * Bentuk lengkap untuk window Status.
 * @param {{ port?: number, serverListening?: boolean, updateState?: object }} ctx
 */
async function healthDetail(ctx = {}) {
  const port = ctx.port || Number(store.get('printAgentPort')) || 9110;
  const selected = store.get('defaultZplPrinter') || null;

  let printers = [];
  let printersError = null;
  try {
    printers = await printQueue.listPrintersDetailed();
  } catch (err) {
    printersError = String(err?.message || err);
  }

  const selectedInfo = selected
    ? printers.find((p) => p.name === selected) || { name: selected, status: 'offline', rawStatus: 'tidak terdeteksi', missing: true }
    : null;

  // Checklist ala "kesehatan" — tiap item: ok | warn | err
  const checks = [];

  checks.push({
    id: 'server',
    label: 'HTTP server loopback',
    level: ctx.serverListening === false ? 'err' : 'ok',
    detail: ctx.serverListening === false ? 'tidak listen' : `127.0.0.1:${port}`,
  });

  checks.push({
    id: 'adapter',
    label: 'Adapter printer',
    level: process.platform === 'win32' ? 'ok' : 'warn',
    detail: process.platform === 'win32' ? 'Windows (Winspool RAW)' : `Mock (${process.platform}) — tidak mencetak fisik`,
  });

  if (printersError) {
    checks.push({ id: 'printers', label: 'Enumerasi printer', level: 'err', detail: printersError });
  } else {
    checks.push({
      id: 'printers',
      label: 'Printer terpasang',
      level: printers.length ? 'ok' : 'warn',
      detail: printers.length ? `${printers.length} terdeteksi` : 'tidak ada printer',
    });
  }

  if (!selected) {
    checks.push({
      id: 'selected',
      label: 'Printer tujuan',
      level: 'warn',
      detail: 'belum dipilih — job tanpa "printer" akan ditolak',
    });
  } else if (selectedInfo?.missing) {
    checks.push({ id: 'selected', label: 'Printer tujuan', level: 'err', detail: `"${selected}" tidak terdeteksi` });
  } else if (selectedInfo?.status === 'offline' || selectedInfo?.status === 'error') {
    checks.push({ id: 'selected', label: 'Printer tujuan', level: 'warn', detail: `"${selected}" — status ${selectedInfo.status}` });
  } else {
    checks.push({ id: 'selected', label: 'Printer tujuan', level: 'ok', detail: selected });
  }

  if (store.get('dryRun')) {
    checks.push({ id: 'dryrun', label: 'Dry-run', level: 'warn', detail: 'AKTIF — ZPL tidak dikirim ke printer fisik' });
  }

  const upd = ctx.updateState;
  if (upd && upd.summary) {
    const level = upd.status === 'error' ? 'warn' : upd.status === 'downloaded' ? 'warn' : 'ok';
    checks.push({ id: 'update', label: 'Auto-update', level, detail: upd.summary.replace(/^Update:\s*/, '') });
  }

  const worst = checks.some((c) => c.level === 'err')
    ? 'err'
    : checks.some((c) => c.level === 'warn')
      ? 'warn'
      : 'ok';

  return {
    overall: worst, // ok | warn | err
    agent: {
      version: pkg.version,
      port,
      url: `http://127.0.0.1:${port}`,
      platform: `${os.type()} ${os.release()}`,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      uptime: fmtUptime(Date.now() - startedAt),
      startedAt: new Date(startedAt).toISOString(),
      dryRun: Boolean(store.get('dryRun')),
      serverListening: ctx.serverListening !== false,
    },
    selectedPrinter: selected,
    selectedPrinterStatus: selectedInfo ? (selectedInfo.missing ? 'missing' : selectedInfo.status) : null,
    printers,
    printersError,
    checks,
    update: upd || null,
  };
}

module.exports = { healthSummary, healthDetail };
