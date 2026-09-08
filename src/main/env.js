const fs = require('fs');
const path = require('path');

/**
 * Loader .env minimal — nol dependency (tidak pakai dotenv).
 *
 * Urutan baca (yang ketemu duluan menang), semua opsional:
 *   1. process.env.PRINT_AGENT_ENV_FILE  (path eksplisit)
 *   2. <cwd>/.env
 *   3. <folder app>/.env                 (di samping package.json — mode dev)
 *   4. <userData>/.env                   (build .exe: %APPDATA%\print-agent\.env)
 *
 * Nilai yang SUDAH ada di process.env tidak ditimpa — jadi bisa override
 * lewat environment variable OS kalau perlu.
 *
 * Format: KEY=VALUE per baris. `#` = komentar. Kutip "..." / '...' opsional
 * dan akan dilepas. Baris tanpa `=` diabaikan.
 */

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function candidatePaths(opts) {
  const list = [];
  if (process.env.PRINT_AGENT_ENV_FILE) list.push(process.env.PRINT_AGENT_ENV_FILE);
  list.push(path.join(process.cwd(), '.env'));
  list.push(path.join(__dirname, '..', '..', '.env'));
  if (opts.userDataDir) list.push(path.join(opts.userDataDir, '.env'));
  return list;
}

let loaded = null;

/**
 * @param {{ userDataDir?: string }} [opts]
 * @returns {{ path: string|null, values: Record<string,string> }}
 */
function loadEnv(opts = {}) {
  if (loaded) return loaded;

  for (const p of candidatePaths(opts)) {
    try {
      if (!p || !fs.existsSync(p)) continue;
      const values = parseEnv(fs.readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(values)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
      loaded = { path: p, values };
      console.log(`[Agent] .env dibaca dari ${p}`);
      return loaded;
    } catch (err) {
      console.error(`[Agent] Gagal baca .env di ${p}:`, err.message);
    }
  }

  loaded = { path: null, values: {} };
  return loaded;
}

// Helper baca + cast, dipakai config-store.
function envStr(key) {
  const v = process.env[key];
  return v === undefined || v === '' ? undefined : v;
}

function envInt(key) {
  const v = envStr(key);
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

function envBool(key) {
  const v = envStr(key);
  if (v === undefined) return undefined;
  return /^(1|true|yes|on)$/i.test(v);
}

function envList(key) {
  const v = envStr(key);
  if (v === undefined) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { loadEnv, envStr, envInt, envBool, envList };
