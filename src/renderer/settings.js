/* Renderer window Settings. Tidak ada akses Node — semua lewat window.settingsApi
 * (lihat settings-preload.js). CSP melarang inline script, jadi file terpisah. */

const $ = (id) => document.getElementById(id);
const selectEl = $('printer');
const statusEl = $('status');
const hintEl = $('hint');

let currentPrinter = null;

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.className = kind || '';
}

function fillOptions(printers, selected) {
  selectEl.innerHTML = '';

  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— tidak diset (job wajib kirim nama printer) —';
  selectEl.appendChild(none);

  for (const name of printers) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }

  // Printer tersimpan mungkin sudah dicabut — tetap tampilkan agar tidak "hilang".
  if (selected && !printers.includes(selected)) {
    const opt = document.createElement('option');
    opt.value = selected;
    opt.textContent = `${selected} (tidak terdeteksi)`;
    selectEl.appendChild(opt);
  }

  selectEl.value = selected || '';
}

async function load() {
  setStatus('Memuat…');
  selectEl.disabled = true;
  try {
    const { printers, selectedPrinter } = await window.settingsApi.load();
    currentPrinter = selectedPrinter || null;
    fillOptions(printers, currentPrinter);
    hintEl.textContent = printers.length
      ? `${printers.length} printer terpasang (sumber: Get-Printer).`
      : 'Tidak ada printer terdeteksi. Pasang printer di Windows lalu klik ↻.';
    setStatus('');
  } catch (err) {
    setStatus(`Gagal memuat: ${err.message}`, 'err');
  } finally {
    selectEl.disabled = false;
  }
}

$('refresh').addEventListener('click', load);

$('save').addEventListener('click', async () => {
  const name = selectEl.value || null;
  setStatus('Menyimpan…');
  try {
    await window.settingsApi.setPrinter(name);
    currentPrinter = name;
    setStatus(name ? `Tersimpan: ${name}` : 'Tersimpan: (tidak diset)', 'ok');
  } catch (err) {
    setStatus(`Gagal menyimpan: ${err.message}`, 'err');
  }
});

$('test').addEventListener('click', async () => {
  const name = selectEl.value || null;
  if (!name) {
    setStatus('Pilih printer dulu untuk tes cetak.', 'err');
    return;
  }
  setStatus('Mengirim label uji…');
  try {
    await window.settingsApi.testPrint(name);
    setStatus(`Label uji terkirim ke "${name}".`, 'ok');
  } catch (err) {
    setStatus(`Tes cetak gagal: ${err.message}`, 'err');
  }
});

$('cancel').addEventListener('click', () => window.settingsApi.close());

load();
