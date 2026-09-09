const { app, dialog } = require('electron');

/**
 * Auto-update via GitHub Releases (electron-updater).
 *
 * Feed: build.publish di package.json → github ngabroger/agent-print (repo publik,
 * jadi PC pengguna TIDAK butuh token). electron-updater membaca latest.yml +
 * PrintAgent-Setup-<versi>.exe + .blockmap yang di-upload ke release.
 *
 * Alur:
 *   start  → cek release  → kalau ada versi lebih baru, download di background
 *          → selesai download → tandai "siap", update tray menu
 *   user   → keluar/restart agent  → installer jalan otomatis (NSIS)
 *          → atau klik "Restart & pasang update" di tray
 *
 * Dev (app tidak ter-package) → seluruh modul jadi no-op.
 */

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  // electron-updater belum ter-install (mis. dev environment minimal)
}

const state = {
  status: 'idle',   // idle | checking | available | downloading | downloaded | uptodate | error
  info: null,       // { version } dari release
  progress: 0,      // 0..100 saat downloading
  error: null,
};

let onChange = () => {};
let timer = null;

function summary() {
  switch (state.status) {
    case 'checking': return 'Update: memeriksa…';
    case 'available': return `Update ${state.info?.version || ''}: mengunduh…`;
    case 'downloading': return `Update: mengunduh ${state.progress}%`;
    case 'downloaded': return `Update ${state.info?.version || ''} siap — restart untuk pasang`;
    case 'uptodate': return 'Update: versi terbaru';
    case 'error': return 'Update: gagal cek';
    default: return null;
  }
}

function set(patch) {
  Object.assign(state, patch);
  try { onChange(); } catch { /* tray belum siap */ }
}

/**
 * @param {{ onStateChange?: () => void }} opts
 */
function initAutoUpdate(opts = {}) {
  onChange = opts.onStateChange || onChange;

  if (!autoUpdater || !app.isPackaged) {
    console.log('[Update] dinonaktifkan (dev / electron-updater tidak ada).');
    return;
  }

  autoUpdater.autoDownload = true;          // begitu ketemu, langsung unduh
  autoUpdater.autoInstallOnAppQuit = true;  // pasang saat agent ditutup
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => set({ status: 'available', info }));
  autoUpdater.on('update-not-available', () => set({ status: 'uptodate' }));
  autoUpdater.on('download-progress', (p) =>
    set({ status: 'downloading', progress: Math.round(p.percent) })
  );
  autoUpdater.on('update-downloaded', (info) => set({ status: 'downloaded', info }));
  autoUpdater.on('error', (err) => {
    set({ status: 'error', error: String(err?.message || err) });
    console.error('[Update] error:', err?.message || err);
  });

  // Cek saat start (jeda 10 dtk supaya tidak rebutan resource dengan boot),
  // lalu ulang tiap 6 jam.
  setTimeout(check, 10_000);
  timer = setInterval(check, 6 * 60 * 60 * 1000);
}

function check() {
  if (!autoUpdater || !app.isPackaged) return;
  if (state.status === 'downloading' || state.status === 'downloaded') return;
  autoUpdater.checkForUpdates().catch((err) => {
    set({ status: 'error', error: String(err?.message || err) });
  });
}

/** Cek manual dari menu tray — kasih feedback dialog kalau sudah terbaru. */
async function checkManually() {
  if (!autoUpdater || !app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update',
      message: 'Auto-update hanya aktif pada versi ter-install.',
    });
    return;
  }
  if (state.status === 'downloaded') return promptInstall();

  set({ status: 'checking', error: null });
  try {
    const res = await autoUpdater.checkForUpdates();
    const remote = res?.updateInfo?.version;
    if (remote && remote !== app.getVersion()) {
      // event 'update-available' + download sudah jalan otomatis
      return;
    }
    set({ status: 'uptodate' });
    dialog.showMessageBox({
      type: 'info',
      title: 'Update',
      message: `Sudah versi terbaru (${app.getVersion()}).`,
    });
  } catch (err) {
    set({ status: 'error', error: String(err?.message || err) });
    dialog.showMessageBox({
      type: 'error',
      title: 'Update gagal',
      message: 'Tidak bisa memeriksa update.',
      detail: String(err?.message || err),
    });
  }
}

/** Pasang sekarang: keluar dari app lalu jalankan installer. */
function quitAndInstall() {
  if (!autoUpdater || state.status !== 'downloaded') return;
  setImmediate(() => autoUpdater.quitAndInstall());
}

async function promptInstall() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Restart & pasang', 'Nanti'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update siap',
    message: `Print Agent ${state.info?.version || ''} sudah diunduh.`,
    detail: 'Agent akan ditutup sebentar lalu terbuka lagi otomatis.',
  });
  if (response === 0) quitAndInstall();
}

function log(msg) {
  console.log('[Update]', msg);
}

function getState() {
  return { ...state, summary: summary() };
}

module.exports = { initAutoUpdate, checkManually, quitAndInstall, promptInstall, getState };
