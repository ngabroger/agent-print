const { app, Tray, Menu, shell, clipboard, ipcMain } = require('electron');
const path = require('path');

// Baca .env SEBELUM config-store di-require. Sertakan folder userData sebagai
// kandidat lokasi .env (di Windows: %APPDATA%\print-agent\.env) — berguna untuk
// build ter-package di mana folder install read-only. IT taruh .env di situ.
const { loadEnv } = require('./env');
try {
  loadEnv({ userDataDir: app.getPath('userData') });
} catch {
  loadEnv();
}

const store = require('./config-store');
const printQueue = require('./print-queue');
const { startHttpServer, isListening } = require('./http-server');
const { openDsmartWindow } = require('./browser-window');
const { openSettingsWindow, closeSettingsWindow } = require('./settings-window');
const { openHealthWindow, closeHealthWindow } = require('./health-window');
const { healthDetail } = require('./health');
const { initAutoUpdate, checkManually, getState: getUpdateState, promptInstall } = require('./auto-update');
const MockPrinterAdapter = require('./printer/mock-printer-adapter');
const WindowsPrinterAdapter = require('./printer/windows-printer-adapter');

/**
 * Print Agent — print agent ZPL loopback untuk dsmart
 * (docs/zd220-print-agent.md). Alur foto lama (Reverb / download ZIP / Sanctum)
 * dibuang; file lamanya disisihkan ke *.bak.
 *
 * Jalur kerja:
 *   HTTP server 127.0.0.1:<port>  →  print-queue.enqueuePrintJob({ type: 'zpl' })
 *   →  adapter.printRaw(zpl, { printer, copies })  →  ZD220
 */

let tray = null;

// Auto-pilih adapter dari OS — tanpa toggle manual. Ubuntu (dev) → Mock,
// Windows (real) → WindowsPrinterAdapter (Winspool RAW via print-raw.ps1).
const printerAdapter = process.platform === 'win32' ? new WindowsPrinterAdapter() : new MockPrinterAdapter();
printQueue.setPrinterAdapter(printerAdapter);
console.log(`[Agent] Printer adapter aktif: ${printerAdapter.constructor.name}`);

// Single instance — dua proses agent = dua listener di port yang sama = bentrok.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, '../../assets/tray-icon.ico'));
    refreshTrayMenu();
  } catch (err) {
    console.error('[Agent] Gagal load tray icon, app tetap jalan tanpa tray:', err.message);
  }
}

function refreshTrayMenu() {
  if (!tray) return;

  const port = Number(store.get('printAgentPort')) || 9110;
  const printer = store.get('defaultZplPrinter') || '(belum diset)';
  const dryRun = store.get('dryRun') ? ' [dryRun]' : '';
  const upd = getUpdateState();

  const template = [
    { label: `Print Agent v${app.getVersion()} — :${port}${dryRun}`, enabled: false },
    { label: `Printer: ${printer}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Status Agent…',
      click: () => openHealthWindow(),
    },
    {
      label: 'Salin URL agent',
      click: () => clipboard.writeText(`http://127.0.0.1:${port}`),
    },
  ];

  template.push({
    label: 'Pengaturan Printer…',
    click: () => openSettingsWindow(),
  });

  if (store.get('embeddedBrowserEnabled')) {
    template.push({ label: 'Buka dsmart', click: () => openDsmartWindow() });
  }

  // ── Update ──────────────────────────────────────────────
  template.push({ type: 'separator' });
  if (upd.summary) {
    template.push({ label: upd.summary, enabled: false });
  }
  if (upd.status === 'downloaded') {
    template.push({ label: 'Restart & pasang update sekarang', click: () => promptInstall() });
  } else {
    template.push({
      label: 'Cek update',
      enabled: upd.status !== 'checking' && upd.status !== 'downloading',
      click: () => checkManually(),
    });
  }

  template.push({ type: 'separator' }, { label: 'Keluar', role: 'quit' });

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(`Print Agent — :${port}`);
}

// ── IPC untuk window "Pengaturan Printer" ──────────────────────────────
// Semua channel di-whitelist di settings-preload.js. Pilihan printer disimpan
// ke key `defaultZplPrinter` (BUKAN default printer Windows) — dipakai
// print-queue saat job tidak menyertakan field "printer".

ipcMain.handle('settings:load', async () => {
  const printers = await printQueue.listPrintersDetailed();
  const port = Number(store.get('printAgentPort')) || 9110;
  return {
    printers, // [{ name, status, rawStatus, isDefault, type, portName }]
    selectedPrinter: store.get('defaultZplPrinter') || null,
    agent: {
      port,
      url: `http://127.0.0.1:${port}`,
      dryRun: Boolean(store.get('dryRun')),
      platform: process.platform,
      version: app.getVersion(),
    },
  };
});

ipcMain.handle('settings:set-printer', (_evt, name) => {
  const value = typeof name === 'string' && name.trim() ? name.trim() : null;
  store.set('defaultZplPrinter', value);
  console.log(`[Agent] Printer tujuan diubah lewat Settings → ${value ?? '(tidak diset)'}`);
  refreshTrayMenu();
  return { ok: true, selectedPrinter: value };
});

ipcMain.handle('settings:set-dry-run', (_evt, on) => {
  const value = Boolean(on);
  store.set('dryRun', value);
  console.log(`[Agent] dryRun diubah lewat Settings → ${value}`);
  refreshTrayMenu();
  return { ok: true, dryRun: value };
});

ipcMain.handle('settings:test-print', async (_evt, name) => {
  const printer = typeof name === 'string' && name.trim() ? name.trim() : store.get('defaultZplPrinter');
  if (!printer) throw new Error('Belum ada printer yang dipilih.');

  // Label uji ZPL kecil — teks + timestamp. Printer yang menyusun layout.
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const zpl = `^XA^CI28^PW400^LL200^FO30,30^A0N,28,28^FDPrint Agent - tes cetak^FS^FO30,80^A0N,24,24^FD${printer}^FS^FO30,130^A0N,22,22^FD${stamp}^FS^XZ`;

  await printQueue.enqueuePrintJob({ type: 'zpl', data: zpl, copies: 1, printer });
  return { ok: true, printer };
});

ipcMain.handle('settings:close', () => {
  closeSettingsWindow();
  return { ok: true };
});

// ── IPC untuk window "Status Agent" ───────────────────────────────────
function sendTestLabel(printer) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const zpl = `^XA^CI28^PW400^LL200^FO30,30^A0N,28,28^FDPrint Agent - tes cetak^FS^FO30,80^A0N,24,24^FD${printer}^FS^FO30,130^A0N,22,22^FD${stamp}^FS^XZ`;
  return printQueue.enqueuePrintJob({ type: 'zpl', data: zpl, copies: 1, printer });
}

ipcMain.handle('health:load', () =>
  healthDetail({
    port: Number(store.get('printAgentPort')) || 9110,
    serverListening: isListening(),
    updateState: getUpdateState(),
  })
);

ipcMain.handle('health:test-print', async () => {
  const printer = store.get('defaultZplPrinter');
  if (!printer) throw new Error('Belum ada printer tujuan — set di Pengaturan Printer.');
  await sendTestLabel(printer);
  return { ok: true, printer };
});

ipcMain.handle('health:open-raw', () => {
  const port = Number(store.get('printAgentPort')) || 9110;
  shell.openExternal(`http://127.0.0.1:${port}/health`);
  return { ok: true };
});

ipcMain.handle('health:copy-url', () => {
  const port = Number(store.get('printAgentPort')) || 9110;
  clipboard.writeText(`http://127.0.0.1:${port}`);
  return { ok: true };
});

ipcMain.handle('health:open-settings', () => {
  openSettingsWindow();
  return { ok: true };
});

ipcMain.handle('health:close', () => {
  closeHealthWindow();
  return { ok: true };
});

app.whenReady().then(() => {
  // Auto-start saat login (§3.6). packaged build saja — saat dev jangan daftarkan.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  createTray();
  startHttpServer();
  openDsmartWindow(); // no-op kalau embeddedBrowserEnabled === false

  // Auto-update dari GitHub Releases — refresh menu tray tiap status berubah.
  initAutoUpdate({ onStateChange: refreshTrayMenu });
});

// Jangan quit saat window ditutup — agent hidup di tray, HTTP server tetap
// melayani Chrome. Di macOS default-nya juga tidak quit; di sini eksplisit.
app.on('window-all-closed', (e) => e.preventDefault());

app.on('second-instance', () => {
  if (store.get('embeddedBrowserEnabled')) openDsmartWindow();
});
