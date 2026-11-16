# Builds the Graceview Event Screen desktop app (CLAUDE.md, "Event Screen desktop app").
# Output: ..\dist\GraceviewEventScreen\ (run GraceviewEventScreen.exe) and ..\dist\GraceviewEventScreen.zip.
# The folder has its own Java runtime and VLC's libraries, so the event PC needs nothing installed.
# Run from a normal PowerShell window:  powershell -ExecutionPolicy Bypass -File build-desktop.ps1
# Add -Test to run the shared unit tests first.
param([switch]$Test)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# Same tool locations as build.ps1 (C:\GraceviewTools when the user name has a space).
$base = $env:LOCALAPPDATA
if ($base -match ' ') {
    $base = 'C:\GraceviewTools'
    $env:GRADLE_USER_HOME = Join-Path $base 'gradle-home'
}
$tools = Join-Path $base 'graceview-tools'
$out = Join-Path $base 'graceview-build'
$env:GRACEVIEW_BUILD_DIR = $out
$env:ANDROID_HOME = Join-Path $base 'Android\Sdk'
$jdk = Get-ChildItem (Join-Path $tools 'jdk') -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | Select-Object -First 1
if (-not $jdk) { throw "Java not found in $tools\jdk. Run build.ps1 once first." }
$env:JAVA_HOME = $jdk.FullName
$gradle = Join-Path $tools 'gradle-8.11.1\bin\gradle.bat'
if (-not (Test-Path $gradle)) { throw 'Gradle not found. Run build.ps1 once first.' }

# VLC 3.0.21 (64-bit, portable zip from videolan.org): libvlc, libvlccore and the plugins go into the app.
$vlcVersion = '3.0.21'
$vlcDir = Join-Path $base "vlc\vlc-$vlcVersion"
if (-not (Test-Path (Join-Path $vlcDir 'libvlc.dll'))) {
    Write-Host "Downloading VLC $vlcVersion..."
    $zip = Join-Path $base 'vlc\vlc.zip'
    New-Item -ItemType Directory -Force (Split-Path $zip) | Out-Null
    curl.exe -fL --retry 5 -o $zip "https://get.videolan.org/vlc/$vlcVersion/win64/vlc-$vlcVersion-win64.zip"
    if ($LASTEXITCODE -ne 0) { throw 'VLC download failed.' }
    Expand-Archive $zip (Split-Path $zip) -Force
    Remove-Item $zip
}
$sig = Get-AuthenticodeSignature (Join-Path $vlcDir 'libvlc.dll')
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=VideoLAN') { throw "libvlc.dll isn't signed by VideoLAN ($($sig.Status))." }

$bundle = Join-Path $here 'desktop\vlc-bundle\common\vlc'
if (-not (Test-Path (Join-Path $bundle 'libvlc.dll'))) {
    Write-Host 'Copying VLC libraries...'
    New-Item -ItemType Directory -Force $bundle | Out-Null
    Copy-Item (Join-Path $vlcDir 'libvlc.dll'), (Join-Path $vlcDir 'libvlccore.dll') $bundle
    Copy-Item (Join-Path $vlcDir 'plugins') $bundle -Recurse
}

# The window and taskbar icon, made once from the TV app's icon.
$ico = Join-Path $here 'desktop\icon.ico'
if (-not (Test-Path $ico)) {
    Add-Type -AssemblyName System.Drawing
    $png = [System.Drawing.Image]::FromFile((Join-Path $here 'app\src\main\res\drawable-nodpi\icon.png'))
    $bmp = New-Object System.Drawing.Bitmap $png, 256, 256
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $fs = [System.IO.File]::Create($ico)
    $w = New-Object System.IO.BinaryWriter $fs
    $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)
    $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$bytes.Length); $w.Write([uint32]22)
    $w.Write($bytes); $w.Close(); $png.Dispose(); $bmp.Dispose()
}

Push-Location $here
try {
    $tasks = @()
    if ($Test) { $tasks += ':core:test' }
    $tasks += ':desktop:createDistributable'
    & $gradle --no-daemon --project-cache-dir (Join-Path $out '.gradle') @tasks
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
} finally { Pop-Location }

$app = Join-Path $out 'desktop\compose\binaries\main\app\GraceviewEventScreen'
$dist = Join-Path (Split-Path $here) 'dist'
$target = Join-Path $dist 'GraceviewEventScreen'
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Copy-Item $app $target -Recurse
$zipOut = Join-Path $dist 'GraceviewEventScreen.zip'
if (Test-Path $zipOut) { Remove-Item $zipOut }
Compress-Archive -Path $target -DestinationPath $zipOut
Write-Host ''
Write-Host "Built: $target\GraceviewEventScreen.exe" -ForegroundColor Green
Write-Host "Zip:   $zipOut" -ForegroundColor Green
