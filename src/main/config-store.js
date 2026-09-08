const Store = require('electron-store');

/**
 * Persisted ke folder userData OS (di Windows: %APPDATA%/snapsnap-print-agent)
 * — bukan browser localStorage, ini file JSON biasa di disk, aman dipakai
 * di Electron main process.
 */
const store = new Store({
  name: 'camera-print-agent-config',
  defaults: {
    apiBaseUrl: 'https://snapsnap.app/api/admin',
    token: null,
    stationId: null,
    eventId: null,
    eventName: null,
    printerName: null,

    // Nilai ini HARUS sama persis dengan .env backend (REVERB_APP_KEY,
    // REVERB_HOST, REVERB_PORT, REVERB_SCHEME). Kalau beda, koneksi
    // Reverb akan gagal auth diam-diam (gak ada error jelas, cuma
    // never-connect). Cek nilai asli di server sebelum lanjut checkpoint.
    reverbKey: '08e50acad80c8a5d052ae8cda2e3af853a16b94a',
    reverbHost: 'snapsnap.app',
    reverbPort: 443,
    reverbScheme: 'https',
    authEndpoint: 'https://snapsnap.app/api/admin/broadcasting/auth',
  },
});

module.exports = store;