/* Renderer window "Pengaturan Printer".
 * Tanpa akses Node — semua lewat window.settingsApi (settings-preload.js).
 * CSP: script-src 'self' → tidak ada inline handler, semua di file ini. */

const $ = (s) => document.querySelector(s);

const els = {
  list: $('#plist'),
  search: $('#search'),
  count: $('#count'),
  refresh: $('#refresh'),
  save: $('#save'),
  test: $('#test'),
  drybox: $('#drybox'),
  agentDot: $('#agentDot'),
  agentText: $('#agentText'),
  toast: $('#toast'),
};

const state = {
  printers: [],        // [{ name, status, rawStatus, isDefault, type, portName }]
  savedPrinter: null,  // tersimpan di agent
  picked: null,        // pilihan di UI (belum tentu tersimpan)
  dryRun: false,
  agent: null,
  filter: '',
};

// ── toast ─────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, kind) {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.className = 'show' + (kind ? ' ' + kind : '');
  toastTimer = setTimeout(() => { els.toast.className = ''; }, 2600);
}

// ── tombol dengan spinner ─────────────────────────────────
async function withBusy(btn, fn) {
  btn.classList.add('busy');
  btn.disabled = true;
  try {
    return await fn();
  } finally {
    btn.classList.remove('busy');
    btn.disabled = false;
    syncDirty();
  }
}

const STATUS_LABEL = {
  ready: 'Siap',
  offline: 'Offline',
  error: 'Bermasalah',
  unknown: 'Status —',
};

// ── render daftar ─────────────────────────────────────────
function render() {
  const q = state.filter.trim().toLowerCase();
  const rows = state.printers.filter((p) => !q || p.name.toLowerCase().includes(q));

  els.list.innerHTML = '';

  // opsi "tidak diset"
  if (!q) els.list.appendChild(noneRow());

  if (rows.length === 0 && q) {
    els.list.appendChild(emptyRow(`Tidak ada printer cocok dengan “${state.filter}”.`));
  } else if (state.printers.length === 0) {
    els.list.appendChild(emptyRow('Tidak ada printer terdeteksi. Pasang printer di Windows lalu klik ↻.'));
  }

  for (const p of rows) els.list.appendChild(printerRow(p));

  const n = state.printers.length;
  els.count.textContent = n ? `${n} printer` : '';
  syncDirty();
}

function noneRow() {
  const li = document.createElement('li');
  li.className = 'pcard none-opt' + (state.picked === null ? ' selected' : '');
  li.innerHTML = `
    <span class="radio"></span>
    <div class="info"><div class="name">— tidak diset —</div>
    <div class="meta">Job yang tidak menyebut printer akan ditolak</div></div>`;
  li.addEventListener('click', () => { state.picked = null; render(); });
  return li;
}

function printerRow(p) {
  const li = document.createElement('li');
  const selected = state.picked === p.name;
  li.className = 'pcard' + (selected ? ' selected' : '');

  const meta = [p.type, p.portName].filter(Boolean).join(' · ') || p.rawStatus || '';

  const badges = [];
  if (state.savedPrinter === p.name) badges.push('<span class="badge chosen">Tersimpan</span>');
  if (p.isDefault) badges.push('<span class="badge default">Default OS</span>');
  badges.push(`<span class="badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>`);

  li.innerHTML = `
    <span class="radio"></span>
    <div class="info">
      <div class="name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
      ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
    </div>
    <div class="badges">${badges.join('')}</div>`;

  li.addEventListener('click', () => { state.picked = p.name; render(); });
  li.addEventListener('dblclick', () => doSave());
  return li;
}

function emptyRow(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.innerHTML = `
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
    <div>${escapeHtml(text)}</div>`;
  return li;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// tombol Simpan hanya aktif kalau pilihan berbeda dari yang tersimpan
function syncDirty() {
  const dirty = state.picked !== state.savedPrinter;
  els.save.disabled = !dirty || els.save.classList.contains('busy');
  els.save.textContent = dirty ? 'Simpan' : 'Tersimpan ✓';
  // spinner span ikut kebuang oleh textContent — pasang lagi
  if (!els.save.querySelector('.spin')) {
    const s = document.createElement('span');
    s.className = 'spin';
    els.save.prepend(s);
  }
  els.test.disabled = state.picked === null || els.test.classList.contains('busy');
}

// ── agent status pill ─────────────────────────────────────
function renderAgent() {
  const a = state.agent;
  if (!a) return;
  els.agentDot.className = 'dot live';
  const dry = state.dryRun ? ' · dry-run' : '';
  els.agentText.textContent = `:${a.port}${dry}`;
  els.agentText.title = `${a.url}  (v${a.version}, ${a.platform})`;

  els.drybox.classList.toggle('on', state.dryRun);
}

// ── actions ───────────────────────────────────────────────
async function load() {
  return withBusy(els.refresh, async () => {
    try {
      const res = await window.settingsApi.load();
      state.printers = Array.isArray(res.printers) ? res.printers : [];
      state.savedPrinter = res.selectedPrinter || null;
      state.picked = state.savedPrinter;
      state.agent = res.agent || null;
      state.dryRun = Boolean(res.agent && res.agent.dryRun);

      // printer tersimpan tapi sudah dicabut → tetap tampilkan sebagai baris hantu
      if (state.savedPrinter && !state.printers.some((p) => p.name === state.savedPrinter)) {
        state.printers.push({
          name: state.savedPrinter, status: 'offline', rawStatus: 'tidak terdeteksi',
          isDefault: false, type: '', portName: '',
        });
      }

      renderAgent();
      render();
    } catch (err) {
      els.agentDot.className = 'dot down';
      els.agentText.textContent = 'agent error';
      toast('Gagal memuat: ' + err.message, 'err');
    }
  });
}

async function doSave() {
  if (state.picked === state.savedPrinter) return;
  return withBusy(els.save, async () => {
    try {
      await window.settingsApi.setPrinter(state.picked);
      state.savedPrinter = state.picked;
      render();
      toast(state.picked ? `Tersimpan: ${state.picked}` : 'Printer dikosongkan', 'ok');
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message, 'err');
    }
  });
}

async function doTest() {
  if (state.picked === null) { toast('Pilih printer dulu.', 'err'); return; }
  return withBusy(els.test, async () => {
    try {
      await window.settingsApi.testPrint(state.picked);
      toast(`Label uji terkirim ke "${state.picked}".`, 'ok');
    } catch (err) {
      toast('Tes cetak gagal: ' + err.message, 'err');
    }
  });
}

async function toggleDryRun() {
  const next = !state.dryRun;
  state.dryRun = next;
  renderAgent();
  try {
    await window.settingsApi.setDryRun(next);
    toast(next ? 'Dry-run aktif — tidak mencetak ke fisik' : 'Dry-run mati', 'ok');
  } catch (err) {
    state.dryRun = !next;
    renderAgent();
    toast('Gagal ubah dry-run: ' + err.message, 'err');
  }
}

// ── wiring ────────────────────────────────────────────────
els.search.addEventListener('input', () => { state.filter = els.search.value; render(); });
els.refresh.addEventListener('click', load);
els.save.addEventListener('click', doSave);
els.test.addEventListener('click', doTest);
els.drybox.addEventListener('click', toggleDryRun);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); load(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
  if (e.key === 'Escape') window.settingsApi.close();
});

load();
