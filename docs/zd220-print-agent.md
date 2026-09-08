# Local Print Agent untuk Zebra ZD220 (fruit label — jalur ZPL)

Status: **rancangan / brief implementasi**. Belum ada kode agent di repo ini.

**Tujuan dokumen**: kamu punya Electron app *printer automation* (photo paper, "agent camera"
workflow). Dokumen ini menjelaskan cara **menambah HTTP server lokal** ke Electron app itu
supaya frontend dsmart (jalan di Chrome biasa) bisa mencetak fruit label ke **Zebra ZD220**
via **ZPL**, tanpa dialog print browser dan **tanpa konfirmasi tambahan** untuk operator.

Keputusan yang sudah diambil (lihat §0):

- **Pendekatan A** — Electron app membuka HTTP server di `127.0.0.1:9110`; dsmart tetap
  dibuka operator di **Chrome biasa** dan `fetch` ke server itu. (Bukan pendekatan
  "load dsmart di dalam BrowserWindow".)
- **Jalur ZPL**, bukan `window.print()`. Printer yang menyusun layout label.
- Frontend yang membuat ZPL; Electron app hanya meneruskan byte ke printer.

---

## 0. Kenapa Pendekatan A (bukan B)

| | A — HTTP server di Electron, dsmart di Chrome | B — dsmart di-load di BrowserWindow Electron |
| --- | --- | --- |
| Cara operator buka dsmart | **Chrome biasa, tidak berubah** | Wajib lewat Electron app |
| PC dipakai hal lain (email/Excel) | Cocok — tidak memaksa apa pun | Kurang cocok |
| Konfirmasi saat print | **Nol** (fetch → PowerShell → keluar) | Nol (IPC → PowerShell → keluar) |
| Kode baru di Electron | HTTP server + CORS (~100 baris) | Window lifecycle + preload bridge + guard |
| Ganti API print | Update server, app tetap | **Rilis ulang Electron app ke semua PC** |
| Satu app layani banyak web app | Ya | Tidak |
| Port terbuka di loopback | Ya (127.0.0.1 saja) | Tidak |

Karena operator pakai **Chrome biasa di PC multi-fungsi**, A menang. B baru masuk akal
kalau PC-nya dedicated kiosk dan boleh dikunci ke satu app.

Tujuan "nol konfirmasi saat print" tercapai di **kedua** pendekatan — `window.print()` dan
dialognya hilang di dua-duanya. Yang membedakan cuma cara buka dsmart & biaya maintenance.

---

## 1. Kondisi sekarang di dsmart

Jalur cetak di [`PrintFruitLabelModal.tsx`](../app/(workspace)/warehouse/intake/_components/PrintFruitLabelModal.tsx):

```
klik Print → window.print() → dialog browser → operator pilih printer + cek scale → Print lagi
```

Ditambah beban rendering: portal ke `<body>`, injeksi `@page { size: auto }`, dan blok
`@media print` di [`globals.css`](../app/globals.css) (baris ~211–297) yang memutar label
90° dengan `transform: rotate()` + `flex-shrink: 0` + CSS variable `--label-rotate-w/h`.
Komentar di kode itu sendiri mencatat *"every previous attempt kept finding a new ancestor
with a transform that hijacks position:fixed's containing block"* dan *"If the print comes
out upside-down/mirrored on your printer, flip the child rotation"* — orientasi hasil cetak
**tidak deterministik dari kode**.

Dengan ZPL + agent:

```
klik Print → POST ZPL ke http://127.0.0.1:9110/print → Electron app → PowerShell RAW → USB → label keluar
```

- ZD220 yang menyusun layout dari perintah `^XA … ^XZ`. Tidak ada render HTML.
- **Buang total** blok `@media print` khusus label + logika portal + `useEffect` injeksi `<style>`.
- Orientasi, posisi, kepekatan, ukuran → eksplisit di ZPL, identik di semua PC.
- Cepat (~beberapa ratus byte). Bisa baca status printer via `~HS` kalau mau.

`FruitLabel.tsx` **tetap dipakai** — hanya sebagai preview layar di modal. Berhenti jadi
target cetak.

### Trade-off yang harus diterima

| Plus | Minus |
| --- | --- |
| Hasil konsisten 100%, tajam, cepat | Menambah HTTP server ke Electron app (kode baru, ~100 baris) |
| Hapus seluruh kelas bug CSS print | Ubah desain label = ubah kode ZPL, bukan Tailwind |
| Tidak bergantung "default printer" OS | Perlu generator ZPL yang dikalibrasi ke printer fisik |
| Operator: 1 klik, tanpa dialog, tanpa konfirmasi | Electron app harus jalan (tray + auto-start) |
| 1 Electron app melayani dsmart + project lain | Saat dev tanpa printer perlu mock / dry-run |

---

## 2. Arsitektur (Pendekatan A)

```
┌──────────────────────────── PC operator (Windows, terkontrol IT) ───────────────────────────┐
│                                                                                            │
│  Chrome                                  Electron app (photo-printer, +HTTP server, tray)   │
│  dsmart frontend                         ┌──────────────────────────────────────────────┐   │
│  ┌────────────────────────┐              │  src/main/http-server.js   ← BARU             │   │
│  │ PrintFruitLabelModal   │  POST /print │    GET  /health                              │   │
│  │  - preview: FruitLabel  │ ───────────▶ │    GET  /printers                            │   │
│  │  - klik Print           │  { zpl,      │    POST /print  { zpl, copies?, printer? }   │   │
│  │  - buildFruitZpl(...)   │    copies }   │        │                                     │   │
│  └────────────────────────┘ ◀─────────── │        ▼                                     │   │
│                              { jobId }    │  src/main/print-queue.js  ← REUSE            │   │
│                              / { error }  │        │  enqueue({ type: "zpl", data })     │   │
│                                           │        ▼                                     │   │
│                                           │  src/main/printer/                           │   │
│                                           │    windows-printer-adapter.js ← MODIFIKASI   │   │
│                                           │      → RAW spool via print-raw.ps1 (BARU)    │   │
│                                           │    mock-printer-adapter.js    ← REUSE (dev)  │   │
│                                           └───────────────────┬──────────────────────────┘   │
│                                                               │ USB (RAW)                    │
│                                                        ┌──────▼───────┐                      │
│                                                        │  Zebra ZD220 │                      │
│                                                        └──────────────┘                      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Poin desain:

1. **Server hanya listen di loopback** (`127.0.0.1:9110`), bukan `0.0.0.0`. Tak ada
   permukaan jaringan.
2. **Frontend yang membuat ZPL.** Electron app "bodoh": terima byte ZPL, masukkan ke
   `print-queue.js`, adapter tulis ke printer. Logika label tetap satu tempat (repo dsmart).
3. **Mixed content**: dsmart di `https://`, server di `http://127.0.0.1`. Chrome & Edge
   memperlakukan `http://127.0.0.1` & `http://localhost` sebagai *potentially trustworthy*
   (secure context) → `fetch` dari HTTPS ke loopback **tidak** kena blok mixed-content.
   (Firefox lebih ketat — untuk PC yang pakai Chrome, aman. Lihat §7.)
4. **CORS**: server WAJIB kirim `Access-Control-Allow-Origin` untuk origin dsmart +
   tangani preflight `OPTIONS`. Lihat §4.
5. **Reuse maksimum**: `print-queue.js`, `mock-printer-adapter.js`, `config-store.js`,
   pola adapter — semua dipakai apa adanya. Yang baru cuma HTTP server + jalur RAW ZPL di
   adapter Windows.

---

## 3. Yang perlu diubah di Electron app kamu

Struktur kamu sekarang (dari deskripsi):

```
src/
  main/
    index.js                     entrypoint / main process
    api-client.js
    reverb-client.js
    config-store.js              ← REUSE
    print-queue.js               ← REUSE
    printer/
      windows-printer-adapter.js ← MODIFIKASI (tambah jalur ZPL RAW)
      mock-printer-adapter.js    ← REUSE (dev / non-Windows)
      print-image.ps1            (tetap, untuk foto)
  preload/preload.js
  renderer/ (login/setup)        ← tak tersentuh
```

### 3.1 BARU — `src/main/http-server.js`

HTTP server loopback. Pakai `node:http` (nol dependency) atau `express`/`hono` kalau sudah
ada. Kira-kira:

```js
// src/main/http-server.js
const http = require("node:http");
const { enqueuePrintJob, listPrinters } = require("./print-queue");
const { getConfig } = require("./config-store");

const PORT = 9110;

function cors(res, origin, allowed) {
  const ok = allowed.includes("*") || allowed.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", ok ? origin || "*" : allowed[0] || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function startHttpServer() {
  const cfg = getConfig(); // { allowedOrigins: string[], defaultPrinter: string }
  const allowed = cfg.allowedOrigins ?? ["*"];

  const server = http.createServer(async (req, res) => {
    cors(res, req.headers.origin, allowed);
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    try {
      if (req.method === "GET" && req.url === "/health") {
        const printers = await listPrinters();
        return json(res, 200, {
          ok: true,
          version: require("../../package.json").version,
          defaultPrinter: cfg.defaultPrinter ?? printers[0] ?? null,
          printers,
        });
      }

      if (req.method === "GET" && req.url === "/printers") {
        return json(res, 200, { printers: await listPrinters() });
      }

      if (req.method === "POST" && req.url === "/print") {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (typeof body.zpl !== "string" || !body.zpl.trim()) {
          return json(res, 400, { error: "invalid_zpl", message: "field 'zpl' is required" });
        }
        const printer = body.printer || cfg.defaultPrinter;
        const jobId = await enqueuePrintJob({
          type: "zpl",
          data: body.zpl,
          copies: Number(body.copies) || 1,
          printer,
        });
        return json(res, 200, { jobId, printer });
      }

      json(res, 404, { error: "not_found", message: req.url });
    } catch (err) {
      json(res, 500, { error: "internal", message: String(err?.message ?? err) });
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[print-agent] listening on http://127.0.0.1:${PORT}`);
  });

  return server;
}

module.exports = { startHttpServer };
```

Panggil dari `src/main/index.js` saat app ready:

```js
const { startHttpServer } = require("./http-server");
app.whenReady().then(() => {
  // ... window setup foto kamu yang sekarang ...
  startHttpServer();
});
```

### 3.2 MODIFIKASI — `src/main/print-queue.js`

Queue kamu sekarang kemungkinan cuma menangani job "image". Tambahkan cabang untuk `type: "zpl"`:

```js
// di dalam pemroses job:
if (job.type === "zpl") {
  return adapter.printRaw(job.data, { printer: job.printer, copies: job.copies });
}
// job.type === "image" → jalur foto yang sudah ada (print-image.ps1)
```

Ekspor juga `listPrinters()` (dipakai `/health` & `/printers`). Kalau belum ada:

```js
// Windows: enumerasi printer terpasang
async function listPrinters() {
  const out = await runPowerShell(`Get-Printer | Select-Object -ExpandProperty Name`);
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
```

### 3.3 MODIFIKASI — `src/main/printer/windows-printer-adapter.js`

Tambah method `printRaw(zpl, { printer, copies })`. Jangan lewat driver rendering —
kirim **byte mentah** ke antrian printer. Cara paling kompatibel: PowerShell RAW spool.

**BARU — `src/main/printer/print-raw.ps1`**:

```powershell
# print-raw.ps1  — kirim byte mentah (ZPL) ke printer bernama, via Windows spooler RAW.
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath   # file berisi ZPL (latin-1)
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DOCINFOA { public string pDocName; public string pOutputFile; public string pDataType; }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);

  public static void Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      var di = new DOCINFOA { pDocName = "dsmart-label", pDataType = "RAW" };
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter failed");
      StartPagePrinter(h);
      int written;
      WritePrinter(h, bytes, bytes.Length, out written);
      EndPagePrinter(h);
      EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@

# ZPL = latin-1 / ANSI, JANGAN utf-8
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinter]::Send($PrinterName, $bytes)
Write-Output "OK"
```

`windows-printer-adapter.js`:

```js
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function printRaw(zpl, { printer, copies = 1 }) {
  if (!printer) throw new Error("printer_not_found: no printer name given");

  // ^PQ<n> untuk copies — sisipkan sebelum ^XZ jika belum ada.
  let payload = zpl;
  if (copies > 1 && !/\^PQ\d+/.test(payload)) {
    payload = payload.replace(/\^XZ\s*$/, `^PQ${copies}\n^XZ`);
  }

  // Tulis file sementara sebagai latin-1.
  const tmp = path.join(os.tmpdir(), `dsmart-zpl-${Date.now()}.txt`);
  await fs.writeFile(tmp, Buffer.from(payload, "latin1"));

  const ps1 = path.join(__dirname, "print-raw.ps1");
  try {
    await new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-PrinterName", printer, "-FilePath", tmp],
        (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)),
      );
    });
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

module.exports = { /* ...yang sudah ada... */ printRaw };
```

### 3.4 MODIFIKASI — `src/main/printer/mock-printer-adapter.js`

Tambah `printRaw(zpl, opts)` yang menulis ZPL ke file / console, tidak ke printer.
Dipakai saat dev di laptop (non-Windows) atau `PRINT_DRY_RUN=1`.

```js
async function printRaw(zpl, opts) {
  const dir = path.join(os.tmpdir(), "dsmart-mock-labels");
  await fs.mkdir(dir, { recursive: true });
  const f = path.join(dir, `label-${Date.now()}.zpl`);
  await fs.writeFile(f, zpl);
  console.log(`[mock] printRaw → ${f}`, opts);
  return f;
}
```

### 3.5 MODIFIKASI — `src/main/config-store.js`

Tambah field:

```jsonc
{
  "printAgent": {
    "port": 9110,
    "defaultPrinter": "ZDesigner ZD220-203dpi ZPL",   // nama persis dari Get-Printer
    "allowedOrigins": ["https://app.dsmart.co", "http://localhost:3000"],
    "dryRun": false
  }
}
```

Expose lewat `getConfig()` yang sudah ada.

### 3.6 Tray + auto-start

Electron app harus hidup di background:

- Tambahkan **Tray icon** (kalau belum) dengan menu: "Print agent: running on :9110",
  "Buka log", "Keluar".
- Jangan `app.quit()` saat semua window ditutup:
  ```js
  app.on("window-all-closed", (e) => { /* jangan quit di Windows — tetap di tray */ });
  ```
- **Auto-start saat login**: `app.setLoginItemSettings({ openAtLogin: true })`, atau
  installer (nsis/squirrel) yang set registry `Run`.

### 3.7 Checklist ringkas perubahan (Electron app)

- [ ] BARU `src/main/http-server.js` — loopback `:9110`, route `/health` `/printers` `/print`, CORS + `OPTIONS`
- [ ] `index.js` — panggil `startHttpServer()` saat ready; jangan quit saat window ditutup; tray
- [ ] `print-queue.js` — cabang `type: "zpl"` → `adapter.printRaw()`; ekspor `listPrinters()`
- [ ] `windows-printer-adapter.js` — method `printRaw(zpl, { printer, copies })`
- [ ] BARU `src/main/printer/print-raw.ps1` — Winspool RAW write
- [ ] `mock-printer-adapter.js` — `printRaw()` tulis ke file (dev)
- [ ] `config-store.js` — blok `printAgent` (port, defaultPrinter, allowedOrigins, dryRun)
- [ ] `app.setLoginItemSettings({ openAtLogin: true })` / installer auto-start
- [ ] Encoding: `Buffer.from(zpl, "latin1")` — **bukan** utf8
- [ ] Installer: pilih default printer saat setup; whitelist di antivirus

---

## 4. Kontrak API (yang dipakai frontend dsmart)

Base URL: `http://127.0.0.1:9110` (= `NEXT_PUBLIC_PRINT_AGENT_URL`).

### `GET /health`

```jsonc
// 200
{
  "ok": true,
  "version": "1.2.0",
  "defaultPrinter": "ZDesigner ZD220-203dpi ZPL",
  "printers": ["ZDesigner ZD220-203dpi ZPL", "Microsoft Print to PDF"]
}
```

Frontend pakai ini untuk badge "Printer siap / tidak terhubung" & enable/disable tombol Print.

### `GET /printers`

```jsonc
// 200
{ "printers": ["ZDesigner ZD220-203dpi ZPL", "Microsoft Print to PDF"] }
```

### `POST /print`

Request:

```jsonc
{
  "zpl": "^XA ... ^XZ",       // wajib
  "copies": 1,                 // opsional, default 1
  "printer": "ZDesigner ..."   // opsional, default = defaultPrinter (config-store)
}
```

Response:

```jsonc
// 200 — job masuk antrian & dikirim ke spooler
{ "jobId": "a1b2c3", "printer": "ZDesigner ZD220-203dpi ZPL" }

// 400 — body invalid
{ "error": "invalid_zpl", "message": "field 'zpl' is required" }

// 404 — nama printer tidak ada
{ "error": "printer_not_found", "message": "no printer named 'X'" }

// 503 — printer offline / media out (kalau adapter cek ~HS)
{ "error": "printer_offline", "message": "media out" }

// 500 — kegagalan tak terduga
{ "error": "internal", "message": "..." }
```

> RAW spooling itu "fire and forget" — 200 = **masuk antrian**, bukan **kertas sudah
> keluar**. Untuk MVP, perlakukan 200 sebagai sukses; operator melihat labelnya keluar.

### CORS (semua response + preflight `OPTIONS`)

```
Access-Control-Allow-Origin: https://app.dsmart.co
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 600
```

Kalau server benar-benar hanya loopback & tanpa data sensitif, `Access-Control-Allow-Origin: *`
juga boleh — allowlist lebih rapi.

---

## 5. Generator ZPL untuk FruitLabel (di repo dsmart)

### 5.1 Spesifikasi fisik

Dari [`FruitLabel.tsx`](../app/(workspace)/warehouse/intake/_components/FruitLabel.tsx) & komentarnya:

| Properti | Nilai |
| --- | --- |
| Stock | Roll lebar **21 mm**, tiap label panjang **110 mm**, dicetak **portrait** |
| Orientasi konten | Ditulis landscape 110×21 di layar, **diputar 90°** saat cetak |
| Warna | Cetak **hitam saja** di atas stiker kuning pre-printed — tanpa background fill |
| DPI ZD220 | **203 dpi** = **8 dots/mm** |
| Lebar cetak | 21 mm × 8 = **168 dots** |
| Panjang label | 110 mm × 8 = **880 dots** |

Isi (urutan baca, dari komentar file): **weight → grade → fruit code (prefix + F-sequence
di baris sendiri) → variant + brand → QR (encode fruit code)**.

### 5.2 Orientasi di ZPL

Desain **langsung dalam koordinat portrait 168×880** (label seperti keluar dari printer).
Tanpa `^FWR` / rotasi global — `^FO` = posisi fisik apa adanya, paling gampang di-debug.
Kalau hasil upside-down (tergantung arah feed roll) → tambah `^POI` di awal, **bukan**
memutar tiap elemen. Ini pengganti bersih untuk "flip rotate(90deg) → rotate(-90deg)" di
`globals.css` sekarang.

### 5.3 Encoding

- Kirim ZPL sebagai **latin-1**, bukan UTF-8 (ditangani adapter: `Buffer.from(zpl, "latin1")`).
- Non-ASCII di data: brand default `"DURÉE"` (É), nama varian bebas.
  - **Transliterasi ke ASCII** di generator (`É`→`E`) — `sanitizeField()` di bawah.
  - Font bawaan ZD220 (A–H) terbatas glyph, jadi transliterasi lebih aman daripada `^CI28`.
- `^` dan `~` = command prefix ZPL — **wajib dihapus/diganti** dari data.

### 5.4 Sketsa layout (portrait 168 × 880 dots, 203 dpi)

```
        x=0 ............................. x=168
 y=0   ┌───────────────────────────────────┐
       │  [QR — encode fruitCode]          │  ~140 dots, kiri-atas
 y=175 │  2.4 KG           ← weight, besar  │
 y=270 │  ┌──┐  A          ← grade kotak    │
       │  └──┘                              │
 y=290 │  IPSRES0102B0401  ← prefix (wrap)  │
       │  20                               │
 y=~342│  F00016           ← F-sequence     │
 y=420 │  Musang King      ← variant        │
 y=472 │  DUREE            ← brand          │
       │            ⋮ (sisa panjang label) │
 y=880 └───────────────────────────────────┘
```

Angka = **titik awal, bukan final** — wajib dikalibrasi ke label fisik (§8).

### 5.5 Kode generator — `lib/hardware/zd220Label.ts`

```ts
// lib/hardware/zd220Label.ts
//
// Bangun ZPL untuk fruit label ZD220 (203 dpi / 8 dots per mm).
// Stock: roll 21mm, label 110mm, portrait. Cetak hitam saja.
// Koordinat di sini = koordinat PORTRAIT apa adanya (label seperti keluar
// dari printer) — lihat docs/zd220-print-agent.md §5.2.

export interface FruitZplInput {
  fruitCode: string;
  variantName: string;
  grade: string;
  weightKg: number;
  brandName?: string;
}

const DOTS_PER_MM = 8; // ZD220 @ 203 dpi
const LABEL_W = 21 * DOTS_PER_MM; // 168
const LABEL_H = 110 * DOTS_PER_MM; // 880

// Sama seperti splitFruitCode() di FruitLabel.tsx — pisahkan trailing "F<number>".
function splitFruitCode(code: string): { prefix: string; sequence: string } {
  const m = code.match(/F\d+$/);
  if (!m || m.index == null) return { prefix: code, sequence: "" };
  return { prefix: code.slice(0, m.index), sequence: m[0] };
}

// Buang karakter perusak ZPL, transliterasi non-ASCII ("DURÉE" → "DUREE").
function sanitizeField(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakritik
    .replace(/[\^~]/g, " ") // ^ ~ = prefix command ZPL
    .replace(/[^\x20-\x7e]/g, "") // ASCII printable saja
    .trim();
}

function wrap(s: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars));
  return out;
}

export function buildFruitZpl(input: FruitZplInput): string {
  const brand = sanitizeField(input.brandName ?? "DURÉE");
  const variant = sanitizeField(input.variantName);
  const grade = sanitizeField(input.grade);
  const { prefix, sequence } = splitFruitCode(sanitizeField(input.fruitCode));
  const weight = String(input.weightKg);
  const qrData = input.fruitCode.replace(/[\^~]/g, ""); // fruit code normalnya sudah ASCII

  const prefixWrapped = wrap(prefix, 16);
  const prefixLines = prefixWrapped
    .map((line, i) => `^FO16,${290 + i * 26}^A0N,20,20^FD${line}^FS`)
    .join("\n");
  const seqY = 290 + prefixWrapped.length * 26 + 6;

  return [
    "^XA",
    "^CI28",
    `^PW${LABEL_W}`,
    `^LL${LABEL_H}`,
    "^LH0,0",
    "^LS0",
    "^PON", // orientasi normal (portrait apa adanya); ganti ^POI kalau upside-down

    // QR — encode fruit code, kiri-atas
    "^FO12,12",
    "^BQN,2,4", // model 2, magnification 4 (~100 dots); naikkan ke 5 kalau perlu
    `^FDLA,${qrData}^FS`,

    // Weight
    `^FO12,175^A0N,60,60^FD${weight}^FS`,
    `^FO12,240^A0N,22,22^FDKG^FS`,

    // Grade dalam kotak
    "^FO12,270^GB48,48,3^FS",
    `^FO24,282^A0N,30,30^FD${grade}^FS`,

    // Fruit code: prefix (wrap) + F-sequence baris sendiri
    prefixLines,
    sequence ? `^FO16,${seqY}^A0N,24,24^FD${sequence}^FS` : "",

    // Variant + brand
    `^FO12,420^A0N,26,26^FB${LABEL_W - 24},2,0,L^FD${variant}^FS`,
    `^FO12,472^A0N,24,24^FD${brand}^FS`,

    "^PQ1",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}
```

> `^FO` / ukuran font = **angka awal**. Kalibrasi (§8) menggesernya. Simpan hasil
> kalibrasi sebagai konstanta di file ini.

### 5.6 Validasi tanpa printer

Paste output `buildFruitZpl()` ke **Labelary** (`labelary.com/viewer.html`) — set **8 dpmm**,
ukuran **21mm × 110mm** — lihat render sebelum menyentuh printer fisik.

---

## 6. Perubahan di frontend dsmart

### 6.1 BARU — `lib/hardware/printAgent.ts`

```ts
// lib/hardware/printAgent.ts
//
// Klien tipis untuk local print agent (docs/zd220-print-agent.md).
// Agent = HTTP server loopback yang ditanam di Electron photo-printer app.
// Halaman HTTPS boleh fetch ke http://127.0.0.1 (loopback = secure context di Chrome/Edge).

const AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? "http://127.0.0.1:9110";

export interface AgentHealth {
  ok: boolean;
  version: string;
  defaultPrinter: string | null;
  printers: string[];
}

export class PrintAgentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function getAgentHealth(signal?: AbortSignal): Promise<AgentHealth> {
  const res = await fetch(`${AGENT_URL}/health`, { signal });
  if (!res.ok) throw new PrintAgentError("unreachable", `agent /health ${res.status}`);
  return res.json();
}

export async function printZpl(
  zpl: string,
  opts: { copies?: number; printer?: string } = {},
): Promise<{ jobId: string }> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zpl, ...opts }),
    });
  } catch {
    throw new PrintAgentError("unreachable", "Print agent tidak merespons. Pastikan aplikasi printer berjalan.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PrintAgentError(data.error ?? "unknown", data.message ?? `agent /print ${res.status}`);
  }
  return data;
}
```

### 6.2 `.env` frontend

```
NEXT_PUBLIC_PRINT_AGENT_URL=http://127.0.0.1:9110
```

Kalau tidak diset → default `http://127.0.0.1:9110`.

### 6.3 Rombak `PrintFruitLabelModal.tsx`

**Buang** `window.print()`, portal ke `<body>`, `useEffect` injeksi `<style>`, `mounted`
gate, ketergantungan `.label-print` / `.label-print-rotate`. Ganti dengan panggil agent:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import ClientButton from "@/components/ClientButton";
import Modal, { ModalCancelButton } from "@/components/Modal";
import FruitLabel, { type FruitLabelProps } from "./FruitLabel";
import { buildFruitZpl } from "@/lib/hardware/zd220Label";
import { printZpl, getAgentHealth, PrintAgentError } from "@/lib/hardware/printAgent";
import { useToast } from "@/components/provider/ToastProvider";

interface PrintFruitLabelModalProps extends Omit<FruitLabelProps, "brandName" | "brandTagline"> {
  onClose: () => void;
}

export default function PrintFruitLabelModal({ onClose, ...labelProps }: PrintFruitLabelModalProps) {
  const { showToast } = useToast();
  const [agentOk, setAgentOk] = useState<boolean | null>(null); // null = belum dicek
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    getAgentHealth(ctrl.signal)
      .then((h) => setAgentOk(h.ok))
      .catch(() => setAgentOk(false));
    return () => ctrl.abort();
  }, []);

  async function handlePrint() {
    setIsPrinting(true);
    try {
      const zpl = buildFruitZpl({
        fruitCode: labelProps.fruitCode,
        variantName: labelProps.variantName,
        grade: labelProps.grade,
        weightKg: labelProps.weightKg,
      });
      await printZpl(zpl, { copies: 1 });
      showToast("success", "Label terkirim ke printer.");
      onClose();
    } catch (err) {
      const msg =
        err instanceof PrintAgentError && err.code === "unreachable"
          ? "Aplikasi printer tidak berjalan. Hubungi IT."
          : err instanceof PrintAgentError
            ? `Gagal cetak: ${err.message}`
            : "Gagal cetak label.";
      showToast("error", msg);
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <Modal
      title="Print Fruit Label"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <ModalCancelButton onClick={onClose}>Skip</ModalCancelButton>
          <ClientButton
            onClick={handlePrint}
            disabled={agentOk === false || isPrinting}
            className="flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" />
            {isPrinting ? "Mencetak…" : "Print"}
          </ClientButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2 overflow-x-auto rounded-xl border-2 border-dashed border-(--color-dashed) px-4 py-6">
        <p className="text-xs text-ink-tertiary">Label preview</p>
        <FruitLabel {...labelProps} />
      </div>

      <p className="mt-3 text-center text-xs">
        {agentOk === null && <span className="text-ink-faint">Mengecek printer…</span>}
        {agentOk === true && <span className="text-emerald-600">● Printer siap</span>}
        {agentOk === false && (
          <span className="text-red-600">● Aplikasi printer tidak terhubung — hubungi IT</span>
        )}
      </p>
    </Modal>
  );
}
```

### 6.4 `globals.css`

Blok `@media print` (baris ~211–297) melayani **fruit + basket + output** label. Kalau
baru fruit yang pindah ke agent, **biarkan** blok itu (basket/output masih pakai) — cukup
`PrintFruitLabelModal` tidak lagi menambahkan `.label-print`. Beri komentar bahwa fruit
label sudah tidak memakainya. Hapus seluruh blok hanya setelah **ketiganya** pindah.

### 6.5 Basket & output label (menyusul)

`PrintBasketLabelModal.tsx` (120×20 mm) & `PrintOutputLabelModal.tsx` ikut pola sama: bikin
`buildBasketZpl()` / `buildOutputZpl()` di `lib/hardware/`, panggil `printZpl`. Sekali
`printAgent.ts` + HTTP server ada, tiap label baru hanya butuh satu fungsi generator.

### 6.6 Development tanpa printer

- Jalankan Electron app di laptop dengan `PRINT_DRY_RUN=1` / config `dryRun: true` →
  `mock-printer-adapter.printRaw()` menulis `.zpl` ke temp folder, tidak ke printer.
- Atau mock 20-baris (Express/Hono) yang balas `200 { jobId: "mock" }` untuk `/print` dan
  `{ ok: true, ... }` untuk `/health`. Set `NEXT_PUBLIC_PRINT_AGENT_URL` ke situ.
- Preview `FruitLabel` di modal tetap render normal — UI tetap bisa dikembangkan.
- Validasi ZPL: Labelary (§5.6).

---

## 7. Catatan browser / OS

| Hal | Status |
| --- | --- |
| HTTPS page → `fetch` ke `http://127.0.0.1` | **OK di Chrome & Edge** (loopback = secure context, bukan mixed-content) |
| Firefox | Loopback TIDAK otomatis secure context. Kalau perlu: server pakai HTTPS + cert lokal (mkcert). Untuk sekarang standarkan Chrome/Edge. |
| CORS | Server WAJIB kirim `Access-Control-Allow-*` + handle `OPTIONS`, jika tidak `fetch` gagal |
| Antivirus / firewall | Loopback listener kadang di-flag. IT whitelist executable Electron app. |
| Windows RAW spooling | Butuh driver Zebra ZDesigner ATAU "Generic / Text Only" terpasang. ZDesigner disarankan. |
| Multi-printer per PC | `printer` di body `/print` memilih; kosong → `defaultPrinter` dari config-store |
| ZD220 firmware terkunci | Sebagian unit retail membatasi ZPL. Tes dini (§12 langkah 1): kirim `^XA^FO50,50^A0N,40,40^FDTEST^FS^XZ` via `printRaw`. Kalau tak keluar → cek varian/firmware. |
| Electron app ditutup operator | Print mati. Frontend badge "tidak terhubung" + tombol disabled. Mitigasi: jangan quit saat window ditutup, hidup di tray (§3.6). |

---

## 8. Kalibrasi (wajib, sekali per model label)

1. Instal ZD220 + driver ZDesigner (203 dpi / ZPL). Catat nama printer (`GET /printers`).
2. **Auto-calibrate media**: tahan tombol feed saat power-on, atau Zebra Setup Utilities —
   supaya sensor gap tahu panjang 110 mm.
3. Kirim ZPL kalibrasi (kotak penuh + garis tepi):
   ```
   ^XA^PW168^LL880^LH0,0
   ^FO0,0^GB168,880,2^FS
   ^FO0,0^GB168,20,20^FS
   ^FO0,860^GB168,20,20^FS
   ^XZ
   ```
   Cek: kotak pas di tepi, tidak terpotong, tidak melenceng antar-label.
4. Kirim output `buildFruitZpl()` dengan data contoh. Ukur pergeseran, sesuaikan `^FO`.
5. Kalau seluruh cetakan bergeser konsisten → pakai `^LS` (left shift) / `^LT` (top) / `^LH`
   untuk offset global, jangan geser tiap `^FO`.
6. QR kekecilan/kegedean → ubah magnification di `^BQN,2,<mag>` (4 atau 5).
7. Hasil upside-down (tergantung arah feed roll) → tambah `^POI` di awal, **bukan** memutar
   tiap elemen.
8. Simpan angka final sebagai konstanta di `lib/hardware/zd220Label.ts` + catat di sini.

Kepekatan (buram / terlalu tebal): `^MD<0..30>` atau `~SD<0..30>` (darkness), kecepatan
`^PR<2..6>` (lebih lambat = lebih tajam). Nilai awal: `^MD10`, `^PR3`.

---

## 9. Cara pakai — operator (frontend dsmart)

Setelah Electron app ter-deploy IT, dari sisi operator **tidak ada langkah baru** — malah
lebih sedikit. Dsmart tetap dibuka di **Chrome seperti biasa**.

### Alur normal (intake fruit)

1. Grading fruit seperti biasa → klik **"Save & Print Label"**.
2. Modal **Print Fruit Label** muncul: preview label + badge **"● Printer siap"**.
3. Klik **Print**.
4. Label langsung keluar dari ZD220. Toast **"Label terkirim ke printer."** Modal tutup.
5. Lanjut scan/grade fruit berikutnya.

**Tidak ada** dialog print browser. **Tidak ada** pilih printer. **Tidak ada** cek
margin/scale. **Tidak ada** konfirmasi.

### Kalau printer / app bermasalah

| Yang dilihat operator | Artinya | Tindakan |
| --- | --- | --- |
| Badge **"● Aplikasi printer tidak terhubung — hubungi IT"**, tombol Print disabled | Electron app mati / belum jalan | Klik **Skip**, lapor IT. Data fruit **sudah tersimpan** — cetak ulang nanti dari histori |
| Toast **"Gagal cetak: media out"** | Label habis | Ganti roll, klik Print lagi |
| Toast **"Gagal cetak: ..."** lain | Error printer (head terbuka, dll) | Betulkan, klik Print lagi |
| Tombol jadi **"Mencetak…"** lalu kembali tanpa toast sukses | Kemungkinan timeout | Cek printer fisik; jangan spam klik (bisa dobel) |

Poin penting untuk operator: **simpan fruit dan cetak label itu terpisah.** Kalau cetak
gagal, grading tetap tersimpan — tekan **Skip**, lanjut kerja, cetak ulang belakangan.

### Reprint (opsional, kalau ditambahkan)

Di halaman histori intake, tombol **"Print ulang label"** per fruit → panggil `buildFruitZpl()`
+ `printZpl()` yang sama. Tak butuh perubahan agent.

---

## 10. Cara pakai — IT (deploy per PC)

1. Instal **driver Zebra ZDesigner** untuk ZD220 (203 dpi / ZPL). Catat nama printer persis
   (mis. `ZDesigner ZD220-203dpi ZPL`).
2. **Auto-calibrate media** (§8 langkah 2).
3. Instal **Electron photo-printer app** (versi dengan HTTP server):
   - Auto-start saat login sudah aktif (`setLoginItemSettings` / installer).
   - Isi config (`config-store`): `printAgent.defaultPrinter` = nama dari langkah 1,
     `printAgent.allowedOrigins` = `["https://<domain dsmart>"]`, `port` = 9110.
   - App muncul di **tray**, tidak menutup saat window-nya di-close.
4. Whitelist executable app di antivirus/firewall (loopback listener).
5. Verifikasi:
   - Chrome buka `http://127.0.0.1:9110/health` → JSON `ok: true`.
   - Buka dsmart → intake → grade fruit dummy → Print → label keluar.
6. Ganti unit ZD220 → cukup update `printAgent.defaultPrinter` kalau namanya berubah.

Distribusi ke banyak PC: paket lewat MDM / GPO / script IT yang sudah dipakai untuk app foto.

---

## 11. Ringkasan file yang disentuh

### Electron photo-printer app

| File | Aksi |
| --- | --- |
| `src/main/http-server.js` | **BARU** — loopback `:9110`, `/health` `/printers` `/print`, CORS + `OPTIONS` |
| `src/main/index.js` | Panggil `startHttpServer()`; jangan quit saat window ditutup; tray icon |
| `src/main/print-queue.js` | Cabang `type: "zpl"` → `adapter.printRaw()`; ekspor `listPrinters()` |
| `src/main/printer/windows-printer-adapter.js` | Method `printRaw(zpl, { printer, copies })` |
| `src/main/printer/print-raw.ps1` | **BARU** — Winspool RAW write |
| `src/main/printer/mock-printer-adapter.js` | `printRaw()` tulis ZPL ke file (dev) |
| `src/main/config-store.js` | Blok `printAgent` (port, defaultPrinter, allowedOrigins, dryRun) |
| installer / `index.js` | `setLoginItemSettings({ openAtLogin: true })` |

### Repo dsmart (frontend)

| File | Aksi |
| --- | --- |
| `lib/hardware/zd220Label.ts` | **BARU** — `buildFruitZpl()` |
| `lib/hardware/printAgent.ts` | **BARU** — klien HTTP ke agent |
| `app/(workspace)/warehouse/intake/_components/PrintFruitLabelModal.tsx` | Rombak — buang portal/`window.print()`, panggil agent, badge status |
| `.env` | Tambah `NEXT_PUBLIC_PRINT_AGENT_URL` |
| `app/globals.css` | Biarkan blok `@media print` selama basket/output belum pindah; komentari fruit label tak lagi memakainya |
| `app/(workspace)/warehouse/baskets/_components/PrintBasketLabelModal.tsx` | Menyusul — `buildBasketZpl()` |
| `app/(workspace)/warehouse/local-process/_components/PrintOutputLabelModal.tsx` | Menyusul — `buildOutputZpl()` |

---

## 12. Urutan pengerjaan yang disarankan

1. **Spike transport** (½ hari): dari Electron app, panggil `printRaw("^XA^FO50,50^A0N,40,40^FDTEST^FS^XZ", { printer })`
   via `print-raw.ps1`. Pastikan label keluar dari ZD220. Ini membuktikan firmware ZD220 terima ZPL.
2. **`http-server.js` + `/health` `/printers` `/print` + CORS** (½ hari), wiring di `index.js` + tray.
3. **`zd220Label.ts` + validasi di Labelary** (½ hari) — belum ke printer.
4. **Kalibrasi ke label fisik** (§8) (½–1 hari, iteratif).
5. **Rombak `PrintFruitLabelModal` + `printAgent.ts`** (½ hari).
6. **Uji end-to-end** di 1 PC → **installer + rollout IT**.
7. Basket & output label menyusul (masing-masing ~2 jam sekali pola mapan).
