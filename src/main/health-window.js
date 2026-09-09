const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Window "Status Agent" — dibuka dari menu tray. Tampilan senada window
 * Pengaturan Printer. Data via IPC 'health:load' (handler di index.js).
 */

let win = null;

function openHealthWindow() {
  if (win && !win.isDestroyed()) {
    win.focus();
    return win;
  }

  win = new BrowserWindow({
    width: 520,
    height: 600,
    minWidth: 460,
    minHeight: 460,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Status Agent',
    icon: path.join(__dirname, '../../assets/tray-icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#1a1b1e',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/health-preload.js'),
    },
  });

  win.once('ready-to-show', () => win.show());
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/health.html'));

  win.on('closed', () => {
    win = null;
  });

  return win;
}

function closeHealthWindow() {
  if (win && !win.isDestroyed()) win.close();
}

module.exports = { openHealthWindow, closeHealthWindow };
