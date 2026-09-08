param(
    [Parameter(Mandatory=$true)][string]$ImagePath,
    [Parameter(Mandatory=$true)][string]$PrinterName
)

Add-Type -AssemblyName System.Drawing

$image = [System.Drawing.Image]::FromFile($ImagePath)
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName

if (-not $doc.PrinterSettings.IsValid) {
    Write-Error "Printer '$PrinterName' tidak ditemukan atau tidak valid."
    exit 1
}

# DrawImage ke e.PageBounds penuh — TIDAK ngatur ukuran kertas/margin di
# sini sama sekali, sengaja. Ukuran fisik (postcard/4x6, borderless)
# diambil dari default Printing Preferences yang sudah Anda set manual di
# Windows (lihat checkpoint sebelumnya) — script ini "dumb" by design.
$doc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.DrawImage($image, $e.PageBounds)
})

try {
    $doc.Print()
    Write-Output "OK"
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    $image.Dispose()
}