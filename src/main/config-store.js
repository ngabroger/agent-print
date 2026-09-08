const Store = require('electron-store');
const { loadEnv, envStr, envInt, envBool, envList } = require('./env');

/**
 * Sumber setting agent (docs/zd220-print-agent.md):
 *
 *   .env  →  "sumber kebenaran", gampang diedit, satu file untuk semua setting.
 *   electron-store  →  fallback + persist antar-update installer.
 *
 * Urutan menang: .env  >  nilai tersimpan di electron-store  >  default bawaan.
 * .env dibaca sekali saat modul ini di-load. Lihat env.js untuk lokasi file
 * yang dicari (cwd/.env, <app>/.env, dst).
 */

loadEnv();

const DEFAULTS = {
  // ── HTTP server loopback (§2, §3.1) ────────────────────────────────
  printAgentPort: 9110,

  // Nama printer PERSIS dari `Get-Printer` (mis. "ZDesigner ZD220-203dpi ZPL").
  defaultZplPrinter: null,

  // Origin yang boleh fetch ke server (CORS, §4). ["*"] = izinkan semua.
  allowedOrigins: ['*'],

  // dryRun true → adapter TIDAK menyentuh printer, cuma tulis .zpl ke temp.
  dryRun: false,

  // ── BrowserWindow opsional untuk dsmart (§3.8) ─────────────────────
  embeddedBrowserEnabled: false,
  embeddedBrowserUrl: '',
  embeddedBrowserKiosk: false,
};

const store = new Store({
  name: 'print-agent-config',
  defaults: DEFAULTS,
});

/**
 * Override dari .env. Nama env var sengaja sejajar dengan yang dipakai
 * frontend dsmart (lihat docs/dsmart-frontend.env.example) supaya satu
 * konsep, satu penamaan.
 */
const ENV_OVERRIDES = {
  printAgentPort: envInt('PRINT_AGENT_PORT'),
  defaultZplPrinter: envStr('PRINT_AGENT_DEFAULT_PRINTER'),
  allowedOrigins: envList('PRINT_AGENT_ALLOWED_ORIGINS'),
  dryRun: envBool('PRINT_AGENT_DRY_RUN'),
  embeddedBrowserEnabled: envBool('PRINT_AGENT_EMBEDDED_BROWSER'),
  embeddedBrowserUrl: envStr('PRINT_AGENT_EMBEDDED_BROWSER_URL'),
  embeddedBrowserKiosk: envBool('PRINT_AGENT_EMBEDDED_BROWSER_KIOSK'),
};

for (const [key, value] of Object.entries(ENV_OVERRIDES)) {
  if (value !== undefined) store.set(key, value);
}

module.exports = store;
