# Build `.exe` — Print Agent

Installer NSIS untuk Windows x64. **Build harus dijalankan di Windows** (electron-builder
untuk target Windows paling lancar di Windows; cross-build dari Linux rapuh).

---

## 1. Prasyarat (mesin build, Windows)

- Node.js LTS (18/20) + npm
- Repo ini ter-clone
- Koneksi internet (electron-builder unduh Electron + NSIS sekali, lalu di-cache)

## 2. Sekali setup

```powershell
cd path\to\print-agent
npm install
```

`electron-builder` sudah masuk `devDependencies` — `npm install` menariknya.

(Opsional) taruh `build\icon.ico` (256×256) untuk branding — lihat `build\README.md`.
Tanpa itu, installer pakai ikon Electron default.

## 3. Build

```powershell
npm run dist
```

Output: **`dist\PrintAgent-Setup-0.1.0.exe`** (+ file `latest.yml`, `*.blockmap` untuk
auto-update kalau nanti dipakai).

Uji unpack tanpa bikin installer (lebih cepat saat iterasi):

```powershell
npm run pack        # → dist\win-unpacked\Print Agent.exe
```

## 4. Yang masuk ke installer

| Item | Dari | Catatan |
| --- | --- | --- |
| Kode agent | `src/**` (kecuali `*.bak`) | di-bundle ke `app.asar` |
| `assets/tray-icon.ico` | `assets/**` | ikon tray (salinan `build/icon.ico`) |
| `print-raw.ps1` | `asarUnpack` | di-unpack ke `app.asar.unpacked\...` supaya PowerShell bisa `-File` |
| `.env.example` | `extraResources` | disalin ke `resources\.env.example` sebagai contoh |

`.env` asli **tidak** ikut — diisi per-PC saat deploy (langkah 6).

## 5. Setelan NSIS (di `package.json` → `build.nsis`)

| Opsi | Nilai | Efek |
| --- | --- | --- |
| `oneClick` | `false` | Installer beneran (ada wizard), bukan langsung install diam-diam |
| `perMachine` | `true` | Install ke `C:\Program Files\Print Agent`, butuh admin, berlaku semua user |
| `allowToChangeInstallationDirectory` | `true` | User boleh ganti folder install |
| `createStartMenuShortcut` | `true` | Shortcut "Print Agent" di Start Menu |
| `createDesktopShortcut` | `false` | Tidak bikin shortcut desktop |
| `runAfterFinish` | `true` | Agent langsung jalan setelah install selesai |

Auto-start saat login diatur **oleh agent sendiri** (`app.setLoginItemSettings({ openAtLogin:
true })` di `src/main/index.js`, hanya saat `app.isPackaged`) — bukan oleh NSIS. Jadi begitu
`.exe` pernah dijalankan sekali, dia mendaftarkan diri ke startup.

## 6. Deploy per-PC (IT)

1. Jalankan `PrintAgent-Setup-0.1.0.exe` (butuh admin). Ikuti wizard.
2. Buat file konfigurasi:
   ```
   %APPDATA%\print-agent\.env
   ```
   (`%APPDATA%` = `C:\Users\<user>\AppData\Roaming`). Contоh minimal:
   ```
   PRINT_AGENT_PORT=9110
   PRINT_AGENT_DEFAULT_PRINTER=ZDesigner ZD220-203dpi ZPL
   PRINT_AGENT_ALLOWED_ORIGINS=https://app.dsmart.co,http://localhost:3000
   PRINT_AGENT_DRY_RUN=false
   ```
   - `PRINT_AGENT_DEFAULT_PRINTER` = hasil persis `Get-Printer | Select Name`.
   - Contoh lengkap: `resources\.env.example` di folder install.
3. Jalankan "Print Agent" dari Start Menu (atau sudah jalan kalau `runAfterFinish`).
   Ikon muncul di **system tray**.
4. Verifikasi: buka Chrome → `http://127.0.0.1:9110/health` → JSON `ok: true`.
5. Agent akan **auto-start** di login berikutnya.
6. Whitelist `Print Agent.exe` di antivirus/firewall (loopback listener kadang di-flag).

Ganti setting (port, printer, dll): edit `%APPDATA%\print-agent\.env`, lalu keluar dari
agent via tray → jalankan lagi. Tidak perlu install ulang.

## 7. Uninstall

Control Panel → Programs → **Print Agent** → Uninstall. Ini **tidak** menghapus
`%APPDATA%\print-agent\` (config + setting tersimpan). Hapus manual kalau mau bersih total.

## 8. Distribusi ke banyak PC

`PrintAgent-Setup-x.x.x.exe` bisa dipush lewat MDM / GPO / script IT. `.env` per-PC bisa
ikut di-push ke `%APPDATA%\print-agent\.env` oleh script yang sama.

## 9. Troubleshooting build

| Gejala | Sebab | Fix |
| --- | --- | --- |
| `cannot find module electron-builder` | belum `npm install` | `npm install` |
| build lama sekali pertama kali | unduh Electron + NSIS | normal, sekali saja (di-cache di `%LOCALAPPDATA%\electron-builder\Cache`) |
| Agent jalan tapi print gagal `ENOENT ... print-raw.ps1` | `asarUnpack` tidak kena | pastikan `build.asarUnpack` di `package.json` berisi `src/main/printer/*.ps1`, rebuild |
| Tray icon tidak muncul | `assets/**` tidak ke-bundle | pastikan `build.files` berisi `assets/**/*` |
| Windows SmartScreen "Unknown publisher" | installer belum di-sign | untuk internal boleh "Run anyway"; untuk publik perlu code-signing cert (di luar scope dokumen ini) |
