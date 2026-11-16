# Builds the Graceview Event Screen server (CLAUDE.md, "Event Screen").
# Output: ..\dist\GraceviewEventServer\ (GraceviewEventServer.exe with its own Java runtime) and
# ..\dist\GraceviewEventServer.zip. It runs on the vMix PC; other computers open it in a browser.
# Run from a normal PowerShell window:  powershell -ExecutionPolicy Bypass -File build-web.ps1
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

Push-Location $here
try {
    $tasks = @()
    if ($Test) { $tasks += ':core:test' }
    $tasks += ':web:installDist'
    & $gradle --no-daemon --project-cache-dir (Join-Path $out '.gradle') @tasks
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
} finally { Pop-Location }

# The exe icon: the Event Screen desktop app's (made from the TV app's icon by build-desktop.ps1).
$ico = Join-Path $here 'desktop\icon.ico'

# jpackage: an app folder with its own Java runtime and no console window.
$lib = Join-Path $out 'web\install\web\lib'
$stage = Join-Path $out 'web\jpackage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
$modules = 'java.base,java.desktop,java.logging,java.management,java.naming,java.net.http,java.sql,java.xml,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.zipfs'
$version = (Get-Date).ToString('yyyy.M.d')
& (Join-Path $jdk.FullName 'bin\jpackage.exe') --type app-image --name GraceviewEventServer `
    --input $lib --main-jar web.jar --main-class org.graceview.tv.web.MainKt `
    --java-options '-Dfile.encoding=UTF-8' --add-modules $modules `
    --icon $ico --app-version $version --vendor Graceview --description 'Graceview Event Screen server' `
    --dest $stage
if ($LASTEXITCODE -ne 0) { throw "jpackage failed ($LASTEXITCODE)" }

$dist = Join-Path (Split-Path $here) 'dist'
$target = Join-Path $dist 'GraceviewEventServer'
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Copy-Item (Join-Path $stage 'GraceviewEventServer') $target -Recurse
Copy-Item (Join-Path $here 'web\README.txt') $target
$zipOut = Join-Path $dist 'GraceviewEventServer.zip'
if (Test-Path $zipOut) { Remove-Item $zipOut }
Compress-Archive -Path $target -DestinationPath $zipOut
Write-Host ''
Write-Host "Built: $target\GraceviewEventServer.exe" -ForegroundColor Green
Write-Host "Zip:   $zipOut" -ForegroundColor Green
