# Rilis & Auto-Update — Print Agent

Auto-update lewat **GitHub Releases** + `electron-updater`.
Repo `ngabroger/agent-print` **publik**, jadi PC pengguna **tidak butuh token** apa pun.

---

## Cara kerja di sisi pengguna

1. Agent start → tunggu 10 dtk → cek release terbaru di GitHub. Ulang tiap 6 jam.
2. Kalau ada versi lebih baru → **unduh otomatis di background** (tanpa ganggu).
3. Selesai unduh → menu tray berubah:
   `Update 0.2.0 siap — restart untuk pasang`
   + item `Restart & pasang update sekarang`.
4. Update terpasang saat:
   - pengguna klik item tray itu, **atau**
   - pengguna keluar / PC di-restart (NSIS pasang saat app quit).
5. Config `%APPDATA%\print-agent\.env` **tidak tersentuh** — pilihan printer/port aman.

Menu tray `Cek update` = cek manual (kasih dialog kalau sudah terbaru).

> Di dev (`npm start`, belum ter-package) auto-update **no-op** — aman.

---

## Cara rilis versi baru (kamu / maintainer)

### Cara cepat — satu perintah

Set token dulu (sekali per sesi terminal — atau `setx` sekali untuk permanen):

```cmd
:: Command Prompt
set GH_TOKEN=ghp_xxxxxxxx
```
```powershell
# PowerShell
$env:GH_TOKEN = "ghp_xxxxxxxx"
```

Lalu:

```cmd
npm run release:auto              :: default: bump patch
npm run release:auto -- minor     :: atau: minor / major / 1.2.3
```

`scripts/release.js` (Node murni — jalan di CMD / PowerShell / bash, tidak
perlu `bash`) menjalankan semua langkah di bawah otomatis:
cek prasyarat → `npm version` → build → upload → `git push` → publish draft
(publish otomatis kalau `gh` CLI login; kalau tidak, dikasih link manual).
Kalau build/upload/push gagal, bump versi lokal di-rollback.

---

### Cara manual (langkah per langkah)

### 1. Naikkan versi

```powershell
npm version patch     # 0.1.0 -> 0.1.1   (atau: minor / major)
```

`npm version` meng-commit bump + bikin git tag `v0.1.1`.

### 2. Siapkan GitHub token (sekali saja)

Buat **Personal Access Token (classic)** di
<https://github.com/settings/tokens> — scope **`repo`** cukup.
Simpan sebagai env var di mesin build:

```powershell
$env:GH_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxx"
```

(atau taruh permanen: `setx GH_TOKEN "ghp_..."` lalu buka PowerShell baru)

### 3. Build + upload ke Releases

```powershell
npm run release
```

Ini menjalankan `electron-builder --publish always`:
build `.exe` → bikin `latest.yml` + `.blockmap` → **upload ketiganya** ke
GitHub Release dengan tag `v<versi>` (dibuat sebagai **draft**).

### 4. Publish release-nya

Buka <https://github.com/ngabroger/agent-print/releases> → edit draft →
tulis catatan rilis → **Publish release**.

Selesai. Semua agent yang online akan menarik update ini dalam ≤ 6 jam
(atau langsung, saat mereka di-restart berikutnya).

### 5. (opsional) push tag

```powershell
git push && git push --tags
```

---

## File yang WAJIB ada di tiap GitHub Release

`electron-builder --publish` mengurus ini otomatis, tapi kalau upload manual:

| File | Fungsi |
| --- | --- |
| `PrintAgent-Setup-<versi>.exe` | installer |
| `PrintAgent-Setup-<versi>.exe.blockmap` | diff unduhan (hemat bandwidth) |
| `latest.yml` | **feed** — electron-updater baca ini untuk tahu versi terbaru |

Kalau `latest.yml` tidak ada di release, auto-update tidak akan jalan.

---

## Distribusi awal (PC yang belum punya agent sama sekali)

Auto-update hanya untuk PC yang **sudah** ter-install. Untuk pasang pertama kali,
tetap kirim `dist\PrintAgent-Setup-<versi>-bundle.zip` (lihat `BUILD.md`).
Setelah itu PC tersebut ikut jalur auto-update.

---

## Troubleshooting

| Gejala | Sebab | Fix |
| --- | --- | --- |
| Tray: `Update: gagal cek` terus | Belum ada release di GitHub, atau PC tak ada internet | Buat minimal 1 release; cek koneksi & firewall ke `github.com` / `objects.githubusercontent.com` |
| `npm run release` gagal `GitHub Personal Access Token is not set` | `GH_TOKEN` belum di-set di shell | `$env:GH_TOKEN = "..."` lalu ulang |
| Update ke-unduh tapi tak terpasang | NSIS `perMachine` butuh admin | Item tray `Restart & pasang` memicu UAC; setujui. Atau restart PC. |
| Versi di GitHub sama dengan yang ter-install | Lupa `npm version` | Bump dulu, baru `npm run release` |
| Mau paksa cek sekarang | — | Menu tray → `Cek update` |
