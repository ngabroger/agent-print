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
    width: 480,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Pengaturan Printer',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/settings-preload.js'),
    },
  });

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
