/* Renderer window "Status Agent". Tanpa akses Node — lewat window.healthApi
 * (health-preload.js). CSP: script-src 'self'. */

const $ = (s) => document.querySelector(s);
const els = {
  beacon: $('#beacon'),
  heroTitle: $('#heroTitle'),
  heroLine: $('#heroLine'),
  autoref: $('#autoref'),
  refresh: $('#refresh'),
  checks: $('#checks'),
  info: $('#info'),
  printers: $('#printers'),
  prCount: $('#prCount'),
  settings: $('#settings'),
  raw: $('#raw'),
  test: $('#test'),
  toast: $('#toast'),
};

let refreshTimer = null;

// ── toast ─────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, kind) {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.className = 'show' + (kind ? ' ' + kind : '');
  toastTimer = setTimeout(() => { els.toast.className = ''; }, 2600);
}

async function withBusy(btn, fn) {
  btn.classList.add('busy');
  btn.disabled = true;
  try { return await fn(); }
  finally { btn.classList.remove('busy'); btn.disabled = false; }
}

const OVERALL = {
  ok:   { title: 'Semua sehat', cls: 'ok' },
  warn: { title: 'Perlu perhatian', cls: 'warn' },
  err:  { title: 'Ada masalah', cls: 'err' },
};

const ICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── render ────────────────────────────────────────────────
function render(d) {
  const o = OVERALL[d.overall] || OVERALL.warn;
  els.beacon.className = 'beacon ' + o.cls;
  els.beacon.innerHTML = `<span class="ring"></span>${ICON[d.overall] || ICON.warn}`;
  els.heroTitle.textContent = o.title;

  const a = d.agent;
  const bits = [`v${a.version}`, a.url];
  if (a.dryRun) bits.push('dry-run');
  els.heroLine.innerHTML = bits.map((b, i) => (i === 1 ? `<b>${esc(b)}</b>` : esc(b))).join(' · ');

  // checks
  els.checks.innerHTML = '';
  d.checks.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'check ' + c.level;
    li.style.animationDelay = (i * 35) + 'ms';
    li.innerHTML = `
      <span class="mark">${ICON[c.level] || ICON.warn}</span>
      <div class="c-body">
        <div class="c-label">${esc(c.label)}</div>
        <div class="c-detail" title="${esc(c.detail)}">${esc(c.detail)}</div>
      </div>`;
    els.checks.appendChild(li);
  });

  // runtime info
  const cells = [
    ['Versi', a.version, false],
    ['Uptime', a.uptime, false],
    ['Port', String(a.port), true],
    ['Arsitektur', a.arch, false],
    ['Platform', a.platform, false],
    ['Electron', a.electron, true],
    ['Node', a.node, true],
    ['Server', a.serverListening ? 'listening' : 'mati', false],
  ];
  els.info.innerHTML = cells.map(([k, v, mono]) =>
    `<div class="cell"><div class="k">${esc(k)}</div><div class="v ${mono ? 'mono' : ''}">${esc(v)}</div></div>`
  ).join('') +
  `<div class="cell wide link" id="urlCell" title="Salin URL agent">
     <div class="k">URL agent — klik untuk salin</div>
     <div class="v mono">${esc(a.url)}</div>
   </div>`;
  const urlCell = $('#urlCell');
  if (urlCell) urlCell.addEventListener('click', async () => {
    try { await window.healthApi.copyUrl(); toast('URL disalin', 'ok'); }
    catch { toast('Gagal menyalin', 'err'); }
  });

  // printers
  els.prCount.textContent = d.printers.length ? `(${d.printers.length})` : '';
  els.printers.innerHTML = '';
  if (d.printersError) {
    els.printers.innerHTML = `<li class="empty">Gagal membaca printer: ${esc(d.printersError)}</li>`;
  } else if (!d.printers.length) {
    els.printers.innerHTML = `<li class="empty">Tidak ada printer terdeteksi.</li>`;
  } else {
    for (const p of d.printers) {
      const li = document.createElement('li');
      li.className = 'pr';
      const isSel = p.name === d.selectedPrinter;
      const tags = [];
      if (isSel) tags.push('<span class="tag">Tujuan</span>');
      if (p.isDefault) tags.push('<span class="tag def">Default OS</span>');
      li.innerHTML = `
        <span class="dot ${p.status || 'unknown'}" title="${esc(p.rawStatus || p.status || '')}"></span>
        <span class="pn" title="${esc(p.name)}">${esc(p.name)}</span>
        ${tags.join('')}`;
      els.printers.appendChild(li);
    }
  }

  els.test.disabled = !d.selectedPrinter;
  els.test.title = d.selectedPrinter ? `Tes cetak ke "${d.selectedPrinter}"` : 'Belum ada printer tujuan';
}

async function load() {
  return withBusy(els.refresh, async () => {
    try {
      const d = await window.healthApi.load();
      render(d);
      els.autoref.hidden = false;
    } catch (err) {
      els.beacon.className = 'beacon err';
      els.beacon.innerHTML = `<span class="ring"></span>${ICON.err}`;
      els.heroTitle.textContent = 'Tidak bisa membaca status';
      els.heroLine.textContent = String(err.message || err);
      toast('Gagal memuat: ' + err.message, 'err');
    }
  });
}

// ── actions ───────────────────────────────────────────────
els.refresh.addEventListener('click', load);
els.settings.addEventListener('click', () => window.healthApi.openSettings());
els.raw.addEventListener('click', () => window.healthApi.openRawJson());
els.test.addEventListener('click', () => withBusy(els.test, async () => {
  try {
    const r = await window.healthApi.testPrint();
    toast(`Label uji terkirim ke "${r.printer}".`, 'ok');
  } catch (err) {
    toast('Tes cetak gagal: ' + err.message, 'err');
  }
}));

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); load(); }
  if (e.key === 'Escape') window.healthApi.close();
});

// auto-refresh tiap 5 dtk selama window terbuka
refreshTimer = setInterval(load, 5000);
window.addEventListener('beforeunload', () => clearInterval(refreshTimer));

load();
