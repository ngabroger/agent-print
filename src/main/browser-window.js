const { BrowserWindow, shell } = require('electron');
const store = require('./config-store');

/**
 * BrowserWindow OPSIONAL untuk dsmart (docs/zd220-print-agent.md §3.8) —
 * "Chrome terkurung". Halaman yang dimuat di sini tetap fetch ke
 * http://127.0.0.1:<port>/print seperti Chrome biasa. TIDAK ada preload
 * untuk print, TIDAK ada ipcMain.handle('print'). Kalau HTTP server dibuang
 * dan diganti IPC, itu Pendekatan B murni — bukan ini.
 *
 * No-op kalau embeddedBrowserEnabled === false → perilaku identik dengan
 * agent tanpa window.
 */

let dsmartWindow = null;

function openDsmartWindow() {
  if (!store.get('embeddedBrowserEnabled')) return null;

  const url = store.get('embeddedBrowserUrl');
  if (!url) {
    console.warn('[print-agent] embeddedBrowserEnabled=true tapi embeddedBrowserUrl kosong — window tidak dibuka.');
    return null;
  }

  if (dsmartWindow && !dsmartWindow.isDestroyed()) {
    dsmartWindow.focus();
    return dsmartWindow;
  }

  dsmartWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: Boolean(store.get('embeddedBrowserKiosk')),
    icon: require('path').join(__dirname, '../../assets/tray-icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      // default aman: context isolation on, node integration off, webSecurity on.
      // Tidak ada preload print — halaman pakai fetch ke loopback seperti biasa.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dsmartWindow.loadURL(url);

  // Link "buka di tab baru" → browser OS, bukan window Electron liar.
  dsmartWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  dsmartWindow.on('closed', () => {
    dsmartWindow = null;
  });

  return dsmartWindow;
}

module.exports = { openDsmartWindow };
