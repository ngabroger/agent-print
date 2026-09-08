const { contextBridge, ipcRenderer } = require('electron');

// contextIsolation: true + preload seperti ini = renderer TIDAK bisa akses
// Node.js API langsung, cuma lewat jembatan yang eksplisit didefinisikan
// di sini — praktik keamanan standar Electron, bukan opsional.
contextBridge.exposeInMainWorld('agent', {
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  afterLogin: () => ipcRenderer.invoke('auth:after-login'),
  listEvents: () => ipcRenderer.invoke('setup:list-events'),
  listPrinters: () => ipcRenderer.invoke('setup:list-printers'),
  completeSetup: (payload) => ipcRenderer.invoke('setup:complete', payload),
});