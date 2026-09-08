const { app, Tray, Menu, shell, clipboard } = require('electron');
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
const { startHttpServer } = require('./http-server');
const { openDsmartWindow } = require('./browser-window');
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
    tray = new Tray(path.join(__dirname, '../../assets/tray-icon.png'));
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

  const template = [
    { label: `Print agent: http://127.0.0.1:${port}${dryRun}`, enabled: false },
    { label: `Printer: ${printer}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Cek /health',
      click: () => shell.openExternal(`http://127.0.0.1:${port}/health`),
    },
    {
      label: 'Salin URL agent',
      click: () => clipboard.writeText(`http://127.0.0.1:${port}`),
    },
  ];

  if (store.get('embeddedBrowserEnabled')) {
    template.push({ label: 'Buka dsmart', click: () => openDsmartWindow() });
  }

  template.push({ type: 'separator' }, { label: 'Keluar', role: 'quit' });

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(`Print Agent — :${port}`);
}

app.whenReady().then(() => {
  // Auto-start saat login (§3.6). packaged build saja — saat dev jangan daftarkan.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  createTray();
  startHttpServer();
  openDsmartWindow(); // no-op kalau embeddedBrowserEnabled === false
});

// Jangan quit saat window ditutup — agent hidup di tray, HTTP server tetap
// melayani Chrome. Di macOS default-nya juga tidak quit; di sini eksplisit.
app.on('window-all-closed', (e) => e.preventDefault());

app.on('second-instance', () => {
  if (store.get('embeddedBrowserEnabled')) openDsmartWindow();
});
