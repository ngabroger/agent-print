# build/ — resource untuk electron-builder

File di folder ini dipakai `electron-builder` saat membuat installer. **Semua opsional** —
build tetap jalan tanpa file ini (pakai default bawaan Electron).

| File | Fungsi | Kalau tidak ada |
| --- | --- | --- |
| `icon.ico` | Ikon aplikasi (exe, shortcut, Add/Remove Programs). Format `.ico`, idealnya 256×256. | Pakai ikon Electron default |
| `installerIcon.ico` | Ikon file `PrintAgent-Setup-x.x.x.exe` | Pakai `icon.ico`, lalu default |
| `uninstallerIcon.ico` | Ikon uninstaller | Pakai `icon.ico`, lalu default |

Cara bikin `.ico` dari PNG: https://www.icoconverter.com atau ImageMagick:

```
magick convert icon-256.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
```

Folder ini tidak berisi `icon.ico` sekarang — tambahkan sendiri kalau mau branding.
