$ErrorActionPreference = "Stop"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$htmlPath = "C:\Users\Ken Ryzen\Downloads\copiloto-porteria\copiloto-porteria\REPORTE_DOORMAN_COPILOTO.html"
$pdfPath = "C:\Users\Ken Ryzen\Downloads\copiloto-porteria\copiloto-porteria\REPORTE_DOORMAN_COPILOTO.pdf"

$htmlUri = "file:///" + ($htmlPath -replace '\\', '/')

if (Test-Path $pdfPath) {
    Remove-Item -Force $pdfPath
}

Write-Host "Compiling PDF with Edge..."
$process = Start-Process -FilePath $edge -ArgumentList "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=`"$pdfPath`"", "`"$htmlUri`"" -PassThru -Wait
Start-Sleep -Seconds 2

if (Test-Path $pdfPath) {
    $item = Get-Item $pdfPath
    Write-Host "PDF generated successfully: $($item.FullName) ($($item.Length) bytes, LastWrite: $($item.LastWriteTime))"
} else {
    Write-Error "PDF compilation failed: $pdfPath does not exist"
}
