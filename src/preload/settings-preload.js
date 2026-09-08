const { contextBridge, ipcRenderer } = require('electron');

/**
 * Jembatan aman untuk window Settings (docs/zd220-print-agent.md §3.8).
 * contextIsolation ON — renderer tidak menyentuh Node langsung, cuma lewat
 * channel yang di-whitelist di sini. Semua handler ada di ipcMain (index.js).
 */
contextBridge.exposeInMainWorld('settingsApi', {
  // Ambil daftar printer terpasang + printer yang sedang dipilih agent.
  load: () => ipcRenderer.invoke('settings:load'),

  // Simpan printer pilihan. name = string persis dari Get-Printer, atau null
  // untuk mengosongkan (agent akan menolak job yang tidak menyertakan "printer").
  setPrinter: (name) => ipcRenderer.invoke('settings:set-printer', name),

  // Kirim label uji ke printer yang dipilih (tanpa lewat HTTP server).
  testPrint: (name) => ipcRenderer.invoke('settings:test-print', name),

  // Tutup window Settings.
  close: () => ipcRenderer.invoke('settings:close'),
});
