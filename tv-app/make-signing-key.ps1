<#
.SYNOPSIS
  Makes the release signing key for the Church Signage TV app. Run once, ever.

.DESCRIPTION
  Android only installs an update over an app signed with the same key. So this key signs
  every release from now on: if it's lost, every TV has to uninstall the app (and be paired
  again) to take the next update. It's kept outside the project, never in git:
    %LOCALAPPDATA%\church-signage-keys\church-signage-release.jks   the key
    %LOCALAPPDATA%\church-signage-keys\signing.properties           where it is, and its password
  Back up that whole folder somewhere private and safe (a password manager's file storage, or a
  private Drive folder only the Owner can open). Then build with:  build.ps1 -Release
  Refuses to run if a key already exists, so it can't replace one by accident.
#>
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'church-signage-keys'
$jks = Join-Path $dir 'church-signage-release.jks'
$props = Join-Path $dir 'signing.properties'
if ((Test-Path $jks) -or (Test-Path $props)) {
    throw "A signing key already exists in $dir. Keep using it. (To really start over, move that folder away first.)"
}

$base = $env:LOCALAPPDATA
if ($base -match ' ') { $base = 'C:\GraceviewTools' }
$jdk = Get-ChildItem (Join-Path $base 'graceview-tools\jdk') -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | Select-Object -First 1
if (-not $jdk) { throw 'Java not found. Run build.ps1 once first.' }
$keytool = Join-Path $jdk.FullName 'bin\keytool.exe'

New-Item -ItemType Directory -Force $dir | Out-Null
# A long random password (letters and digits, so it needs no escaping). Never shown; it's in signing.properties.
$chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$pw = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

# PKCS12 keystores use one password for the store and the key. Valid about 27 years.
# keytool reports progress on stderr, which 'Stop' would treat as a failure; check the exit code instead.
$ErrorActionPreference = 'Continue'
& $keytool -genkeypair -noprompt -keystore $jks -storetype PKCS12 -alias church-signage `
    -keyalg RSA -keysize 4096 -validity 10000 -storepass $pw -keypass $pw `
    -dname 'CN=Church Signage, O=Church Signage' 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $jks)) { throw 'keytool failed to make the key.' }

$jksFwd = $jks.Replace('\', '/')
Set-Content -Encoding ascii $props @(
    '# Church Signage release signing. Private: never commit, never share. Back up with the .jks file.',
    "storeFile=$jksFwd",
    "storePassword=$pw",
    'keyAlias=church-signage',
    "keyPassword=$pw"
)
$pw = $null
Write-Host "Made the signing key in $dir" -ForegroundColor Green
Write-Host 'Back up that whole folder somewhere private and safe now. Losing it means every TV has to reinstall to update.' -ForegroundColor Yellow
