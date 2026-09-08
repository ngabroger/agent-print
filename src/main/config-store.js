const Store = require('electron-store');

/**
 * Persisted ke folder userData OS (di Windows: %APPDATA%/snapsnap-print-agent)
 * — bukan browser localStorage, ini file JSON biasa di disk, aman dipakai
 * di Electron main process.
 *
 * Agent ini murni print agent ZPL loopback untuk dsmart (lihat
 * docs/zd220-print-agent.md). Config-nya flat, tanpa nested object.
 */
const store = new Store({
  name: 'camera-print-agent-config',
  defaults: {
    // ── HTTP server loopback (§2, §3.1) ────────────────────────────────
    // Server hanya listen di 127.0.0.1 — tidak ada permukaan jaringan.
    printAgentPort: 9110,

    // Nama printer PERSIS dari `Get-Printer` (mis. "ZDesigner ZD220-203dpi ZPL").
    // Dipakai kalau body POST /print tidak menyertakan "printer".
    defaultZplPrinter: null,

    // Origin yang boleh fetch ke server (CORS, §4). ["*"] = izinkan semua —
    // aman untuk loopback tanpa data sensitif. Perketat ke domain dsmart
    // kalau mau: ["https://app.dsmart.co", "http://localhost:3000"].
    allowedOrigins: ['*'],

    // dryRun true → adapter TIDAK menyentuh printer, cuma tulis .zpl ke temp.
    // Berguna saat dev di mesin tanpa printer. Di non-Windows selalu efektif
    // dry-run karena adapter yang aktif = MockPrinterAdapter.
    dryRun: false,

    // ── BrowserWindow opsional untuk dsmart (§3.8) ─────────────────────
    // "Chrome terkurung" — tetap fetch ke :9110, TANPA preload/IPC print.
    // Aktifkan hanya untuk PC kiosk. Default: nonaktif → perilaku identik
    // dengan agent tanpa window.
    embeddedBrowserEnabled: false,
    embeddedBrowserUrl: '',
    embeddedBrowserKiosk: false,
  },
});

module.exports = store;
