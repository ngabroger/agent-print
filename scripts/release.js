#!/usr/bin/env node
/*
 * Rilis satu langkah untuk Print Agent — auto-update via GitHub Releases.
 * Versi Node murni: jalan di CMD, PowerShell, atau bash — tanpa perlu bash.
 *
 *   node scripts/release.js [patch|minor|major|<versi>]     (default: patch)
 *   npm run release:auto -- minor
 *
 * Langkah:
 *   1. cek prasyarat (git bersih, branch, GH_TOKEN)
 *   2. npm version <bump>            -> naikkan versi + commit + tag vX.Y.Z
 *   3. npm run release              -> build + upload ke GitHub (draft)
 *   4. git push + git push --tags
 *   5. publish draft (gh CLI kalau ada; kalau tidak, kasih link)
 * Kalau langkah 3/4 gagal, bump versi lokal di-rollback.
 */
'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN_BRANCH = 'master';
const REPO = 'ngabroger/agent-print';

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  grn: (s) => `\x1b[32m${s}\x1b[0m`,
  ylw: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const step = (s) => console.log(c.grn('> ') + s);
const warn = (s) => console.log(c.ylw('! ') + s);
function die(s) {
  console.error(c.red('x ' + s));
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}
function shInherit(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}
function has(cmd) {
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  const r = spawnSync(probe, { shell: true, stdio: 'ignore' });
  return r.status === 0;
}

const BUMP = process.argv[2] || 'patch';
const VALID = ['patch', 'minor', 'major'];
if (!VALID.includes(BUMP) && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(BUMP)) {
  die(`Argumen tidak valid: "${BUMP}". Pakai patch | minor | major | X.Y.Z`);
}

// ── 1. prasyarat ─────────────────────────────────────────────────────────
step('Cek prasyarat');

if (!process.env.GH_TOKEN) {
  die('GH_TOKEN belum di-set.\n' +
    '   CMD:         set GH_TOKEN=ghp_xxx\n' +
    '   PowerShell:  $env:GH_TOKEN = "ghp_xxx"\n' +
    '   Permanen:    setx GH_TOKEN "ghp_xxx"  (lalu buka terminal baru)');
}

try {
  sh('git rev-parse --is-inside-work-tree');
} catch {
  die('Bukan di dalam repo git.');
}

const branch = sh('git branch --show-current');
if (branch !== MAIN_BRANCH) {
  warn(`Kamu di branch '${branch}', bukan '${MAIN_BRANCH}'.`);
  const ans = prompt(`Lanjut rilis dari '${branch}'? [y/N] `);
  if (ans.toLowerCase() !== 'y') die('Dibatalkan.');
}

const dirty = sh('git status --porcelain');
if (dirty) {
  console.log(dirty);
  die('Working tree tidak bersih. Commit / stash dulu sebelum rilis.');
}

step('Ambil tag terbaru dari remote');
try {
  sh('git fetch --tags --quiet origin');
} catch {
  warn('git fetch gagal — lanjut dengan tag lokal.');
}

let haveGh = false;
if (has('gh')) {
  const r = spawnSync('gh auth status', { shell: true, stdio: 'ignore' });
  haveGh = r.status === 0;
}
if (haveGh) step('gh CLI terdeteksi & login — draft akan di-publish otomatis.');
else warn('gh CLI tidak ada / belum login — draft harus di-publish manual di akhir.');

const oldVersion = require(path.join(ROOT, 'package.json')).version;

// ── 2. bump versi ────────────────────────────────────────────────────────
step(`Naikkan versi (dari ${oldVersion}, bump: ${BUMP})`);
const newVersionRaw = sh(`npm version ${BUMP} -m "chore(release): v%s"`);
const newVersion = newVersionRaw.replace(/^v/, '').split('\n').pop().replace(/^v/, '');
const tag = `v${newVersion}`;
step(`Versi baru: ${newVersion}  (tag ${tag})`);

function rollback() {
  warn('Gagal — membatalkan bump versi lokal…');
  try { sh(`git tag -d ${tag}`); } catch {}
  try { sh('git reset --hard HEAD~1'); } catch {}
  warn(`Sudah di-rollback ke ${oldVersion}. Tidak ada yang ter-push.`);
}

// ── 3. build + upload ────────────────────────────────────────────────────
try {
  step('Build installer + upload ke GitHub Releases (draft)');
  shInherit('npm run release');

  // ── 4. push ──────────────────────────────────────────────────────────
  step('Push commit + tag ke origin');
  shInherit(`git push origin ${branch}`);
  shInherit(`git push origin ${tag}`);
} catch (err) {
  rollback();
  die('Rilis dibatalkan karena error di atas.');
}

// ── 5. publish draft ────────────────────────────────────────────────────
if (haveGh) {
  step(`Publish release ${tag}`);
  try {
    shInherit(`gh release edit ${tag} --repo ${REPO} --draft=false --latest`);
    console.log('\n' + c.grn(`v ${newVersion} selesai & ter-publish.`));
  } catch {
    warn('gh release edit gagal — publish manual di halaman Releases.');
  }
} else {
  console.log('\n' + c.grn('v Build ter-upload sebagai DRAFT.'));
  console.log('  Langkah terakhir (manual): buka link ini, Edit -> Publish release:');
  console.log('  ' + c.dim(`https://github.com/${REPO}/releases`));
}

console.log('\nPengguna akan dapat update ini dalam <= 6 jam (atau saat agent restart).');

// ── util: prompt sinkron sederhana ─────────────────────────────────────
function prompt(q) {
  process.stdout.write(q);
  try {
    const fs = require('fs');
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(0, buf, 0, 1024, null);
    return buf.toString('utf8', 0, n).trim();
  } catch {
    return '';
  }
}
