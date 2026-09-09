const { contextBridge, ipcRenderer } = require('electron');

/**
 * Jembatan aman untuk window "Status Agent". contextIsolation ON.
 * Semua handler di ipcMain (index.js).
 */
contextBridge.exposeInMainWorld('healthApi', {
  // Snapshot status lengkap agent (checks, printer, info runtime, update).
  load: () => ipcRenderer.invoke('health:load'),

  // Kirim label uji ke printer tujuan yang tersimpan.
  testPrint: () => ipcRenderer.invoke('health:test-print'),

  // Buka /health JSON mentah di browser.
  openRawJson: () => ipcRenderer.invoke('health:open-raw'),

  // Salin URL agent ke clipboard.
  copyUrl: () => ipcRenderer.invoke('health:copy-url'),

  // Buka window Pengaturan Printer.
  openSettings: () => ipcRenderer.invoke('health:open-settings'),

  close: () => ipcRenderer.invoke('health:close'),
});
