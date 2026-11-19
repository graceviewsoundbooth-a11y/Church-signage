# Builds the Church Signage TV app.
# Run from a normal PowerShell window:  powershell -ExecutionPolicy Bypass -File build.ps1
#   (no switches)  a test build:            ..\dist\graceview-tv.apk
#   -Release       the signed build for TVs: ..\dist\church-signage.apk  (needs make-signing-key.ps1 once)
# Add -Test to run the unit tests first (the build stops if any fail).
param([switch]$Test, [switch]$Release)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# Build tools live in %LOCALAPPDATA%, unless that path has a space (e.g. a Windows user named
# "GV Soundbooth 1"): the Android SDK and Gradle's batch files break on spaces, so use C:\GraceviewTools.
$base = $env:LOCALAPPDATA
if ($base -match ' ') {
    $base = 'C:\GraceviewTools'
    $env:GRADLE_USER_HOME = Join-Path $base 'gradle-home'
}
$tools = Join-Path $base 'graceview-tools'
$sdk = Join-Path $base 'Android\Sdk'
$out = Join-Path $base 'graceview-build'
$env:GRACEVIEW_BUILD_DIR = $out

# Java 17 (installed earlier into graceview-tools\jdk)
$jdk = Get-ChildItem (Join-Path $tools 'jdk') -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | Select-Object -First 1
if (-not $jdk) { throw "Java not found in $tools\jdk" }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdk

# Gradle 8.11.1 (downloaded once)
$gradleDir = Join-Path $tools 'gradle-8.11.1'
if (-not (Test-Path (Join-Path $gradleDir 'bin\gradle.bat'))) {
    Write-Host 'Downloading Gradle 8.11.1...'
    $zip = Join-Path $tools 'gradle.zip'
    curl.exe -fL --retry 5 --retry-delay 3 -o $zip 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip'
    if ($LASTEXITCODE -ne 0) { throw 'Gradle download failed. Is github.com reachable from this network?' }
    Expand-Archive $zip $tools -Force
    Remove-Item $zip
}

# local.properties: keep the API key and any lab.url (another dashboard), make sure sdk.dir is set
$lp = Join-Path $here 'local.properties'
$key = ''
$keep = @()
if (Test-Path $lp) {
    $m = Select-String -Path $lp -Pattern '^google\.apiKey=(.*)$' | Select-Object -First 1
    if ($m) { $key = $m.Matches[0].Groups[1].Value.Trim() }
    $keep = @(Get-Content $lp | Where-Object { $_ -match '^lab\.url=' })
}
$sdkEsc = $sdk.Replace('\', '\\').Replace(':', '\:')
Set-Content -Encoding ascii $lp (@("sdk.dir=$sdkEsc", "google.apiKey=$key") + $keep)
if (-not $key) { Write-Warning 'google.apiKey is empty in local.properties. The app will build but show "API key is missing".' }

Push-Location $here
try {
    $build = if ($Release) { ':app:assembleRelease' } else { ':app:assembleDebug' }
    if ($Release -and -not (Test-Path (Join-Path $env:LOCALAPPDATA 'church-signage-keys\signing.properties')) -and -not $env:CS_SIGNING_PROPS) {
        throw 'No signing key. Run make-signing-key.ps1 once (and back up the folder it makes).'
    }
    $tasks = if ($Test) { @(':core:test', ':app:testDebugUnitTest', $build) } else { @($build) }
    & (Join-Path $gradleDir 'bin\gradle.bat') --no-daemon --project-cache-dir (Join-Path $out '.gradle') @tasks
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
} finally { Pop-Location }

$dist = Join-Path (Split-Path $here) 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
if ($Release) {
    $apk = Join-Path $out 'app\outputs\apk\release\app-release.apk'
    $name = 'church-signage.apk'
} else {
    $apk = Join-Path $out 'app\outputs\apk\debug\app-debug.apk'
    $name = 'graceview-tv.apk'
}
Copy-Item $apk (Join-Path $dist $name) -Force
Write-Host ''
Write-Host "Built: $(Join-Path $dist $name)" -ForegroundColor Green
