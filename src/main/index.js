const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const store = require('./config-store');
const api = require('./api-client');
const reverb = require('./reverb-client');
const printQueue = require('./print-queue');
const MockPrinterAdapter = require('./printer/mock-printer-adapter');
const WindowsPrinterAdapter = require('./printer/windows-printer-adapter');

let tray = null;
let authWindow = null;
let setupWindow = null;

// Auto-pilih adapter dari OS — gak perlu toggle manual. Di Ubuntu (dev)
// otomatis Mock, di Windows (real) otomatis WindowsPrinterAdapter.
const printerAdapter = process.platform === 'win32' ? new WindowsPrinterAdapter() : new MockPrinterAdapter();
printQueue.setPrinterAdapter(printerAdapter);
console.log(`[Agent] Printer adapter aktif: ${printerAdapter.constructor.name}`);

function createAuthWindow() {
  authWindow = new BrowserWindow({
    width: 380,
    height: 420,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  authWindow.loadFile(path.join(__dirname, '../renderer/login.html'));
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 420,
    height: 480,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(path.join(__dirname, '../renderer/setup.html'));
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

  const isReady = Boolean(store.get('token') && store.get('stationId'));
  const label = isReady
    ? `Terhubung — ${store.get('eventName') ?? 'event'} (${store.get('printerName')})`
    : 'Belum disetup';

  const menu = Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    {
      label: 'Setup ulang',
      click: () => {
        reverb.disconnect();
        store.clear();
        createAuthWindow();
      },
    },
    { label: 'Keluar', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(isReady ? 'SnapSnap Print Agent — terhubung' : 'SnapSnap Print Agent — belum disetup');
}

// ── Engine (listener Reverb + heartbeat) ────────────────────────────────

function startEngine() {
  reverb.connect((data) => {
    console.log('[Engine] Print request baru diterima:', data.print_request_id);
    printQueue.enqueue(data);
  });

  setInterval(() => {
    api.heartbeat().catch((err) => console.error('[Heartbeat] Gagal:', err.message));
  }, 30000);
}

app.whenReady().then(() => {
  createTray();

  if (store.get('token') && store.get('stationId')) {
    startEngine();
  } else {
    createAuthWindow();
  }
});

app.on('window-all-closed', (e) => e.preventDefault());

// ── IPC handlers ─────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (_event, { email, password }) => {
  await api.login(email, password);
  return true;
});

ipcMain.handle('auth:after-login', async () => {
  authWindow?.close();
  createSetupWindow();
});

ipcMain.handle('setup:list-events', async () => api.fetchActiveEvents());

ipcMain.handle('setup:list-printers', async () => {
  return setupWindow.webContents.getPrintersAsync();
});

ipcMain.handle('setup:complete', async (_event, { eventId, eventName, printerName }) => {
  const station = await api.registerStation({
    eventId,
    name: os.hostname(),
    printerName,
  });
  store.set('eventName', eventName);
  refreshTrayMenu();
  setupWindow?.close();
  startEngine();
  return station;
});