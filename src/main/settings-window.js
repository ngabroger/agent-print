const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Window "Pengaturan Printer" — dibuka dari menu tray. Fungsinya hanya memilih
 * printer ZPL tujuan (bukan default printer Windows) dan menyimpannya ke
 * config-store lewat IPC. Handler-nya di index.js (ipcMain.handle('settings:*')).
 */

let win = null;

function openSettingsWindow() {
  if (win && !win.isDestroyed()) {
    win.focus();
    return win;
  }

  win = new BrowserWindow({
    width: 520,
    height: 560,
    minWidth: 460,
    minHeight: 440,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Pengaturan Printer',
    icon: path.join(__dirname, '../../assets/tray-icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#1a1b1e',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/settings-preload.js'),
    },
  });

  // Hindari flash putih saat load — tampilkan setelah siap.
  win.once('ready-to-show', () => win.show());

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/settings.html'));

  win.on('closed', () => {
    win = null;
  });

  return win;
}

function closeSettingsWindow() {
  if (win && !win.isDestroyed()) win.close();
}

module.exports = { openSettingsWindow, closeSettingsWindow };
