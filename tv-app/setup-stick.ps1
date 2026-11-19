<#
.SYNOPSIS
  One-time setup for a Church Signage TV stick (Fire TV or Google TV) over Wi-Fi ADB.

.DESCRIPTION
  Connects to the stick, installs or updates the app, and grants what the scheduler and
  launcher need: display over other apps, device admin (sleep), exact alarms, no battery
  limits, screensaver and display sleep off, and on Google TV the Home-button service.
  Prints a summary of what worked. Safe to run again; it only changes what's needed.

  Sets up Church Signage 2.0 (app ID org.graceview.signage.lab) unless -Pkg says otherwise.
  The app it sets up becomes the TV's home: the other version's Home-button service is
  turned off, so 1.0 and 2.0 never fight over the Home button. To switch a TV back to 1.0:
    powershell -ExecutionPolicy Bypass -File setup-stick.ps1 -Ip 192.168.1.50 -Pkg org.graceview.tv -SkipInstall
  2.0 TVs pair with the code on screen (Screens > + Add a screen on the dashboard).

.EXAMPLE
  Church Signage 2.0 on a Google TV (after wireless debugging is paired):
    powershell -ExecutionPolicy Bypass -File setup-stick.ps1 -Ip 192.168.1.60 -Port 41235

.EXAMPLE
  Fire TV (ADB debugging on, port 5555):
    powershell -ExecutionPolicy Bypass -File setup-stick.ps1 -Ip 192.168.1.50

.EXAMPLE
  Google TV wireless debugging (first time, with the pairing code shown on the TV):
    powershell -ExecutionPolicy Bypass -File setup-stick.ps1 -Ip 192.168.1.60 -Port 41235 -PairPort 37099 -PairCode 123456

.EXAMPLE
  Green Room (asks for the Planning Center token):
    powershell -ExecutionPolicy Bypass -File setup-stick.ps1 -Ip 192.168.0.182 -Device "Green Room" -PlanningCenter

.EXAMPLE
  Emulator or USB:
    powershell -ExecutionPolicy Bypass -File setup-stick.ps1 -Serial emulator-5554
#>
param(
    [string]$Ip,
    [int]$Port = 5555,
    [int]$PairPort = 0,
    [string]$PairCode,
    [string]$Serial,
    [string]$Apk,
    [switch]$SkipInstall,
    # The TV's name from the Devices tab (e.g. "Lobby"). Skips the "Which TV is this?" picker.
    [string]$Device,
    # Google TV only: also disable the stock launcher so Home always lands on Graceview.
    # An OTA update may turn it back on; just run the script again.
    [switch]$DisableStockLauncher,
    # 1.0 Green Room TVs: ask for the Planning Center personal access token (application ID and
    # secret) and store it encrypted on the stick. It is typed here, never read from a file.
    # (2.0 TVs get it from the dashboard: Settings > Green Room.)
    [switch]$PlanningCenter,
    # Which app: org.graceview.signage.lab (Church Signage 2.0, the default) or org.graceview.tv (1.0).
    [ValidateSet('org.graceview.signage.lab', 'org.graceview.tv')]
    [string]$Pkg = 'org.graceview.signage.lab'
)

# Continue, not Stop: adb writes normal progress to stderr, which PowerShell 5.1 treats as errors.
$ErrorActionPreference = 'Continue'
# Both apps are built from the same code, so their parts keep the code's names (org.graceview.tv.…)
# under each app's own ID: a part is "<app ID>/org.graceview.tv.<part>".
$Ns = 'org.graceview.tv'
$Is2 = $Pkg -eq 'org.graceview.signage.lab'
$Other = if ($Is2) { 'org.graceview.tv' } else { 'org.graceview.signage.lab' }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Apk) {
    $Apk = if ($Is2) { Join-Path (Split-Path $here) 'dist\church-signage.apk' } else { Join-Path (Split-Path $here) 'dist\graceview-tv.apk' }
}

# --- Find adb ---------------------------------------------------------------
$adb = $null
$candidates = @("$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", 'C:\GraceviewTools\Android\Sdk\platform-tools\adb.exe')
if ($env:ANDROID_HOME) { $candidates += "$env:ANDROID_HOME\platform-tools\adb.exe" }
foreach ($c in $candidates) {
    if (Test-Path $c) { $adb = $c; break }
}
if (-not $adb) { $cmd = Get-Command adb -ErrorAction SilentlyContinue; if ($cmd) { $adb = $cmd.Source } }
if (-not $adb) { throw 'adb not found. Install Android platform-tools (winget install Google.PlatformTools).' }

$results = New-Object System.Collections.ArrayList
function Note($step, $ok, $detail) {
    [void]$results.Add([pscustomobject]@{ Step = $step; Result = $(if ($ok) { 'OK' } else { 'FAILED' }); Detail = $detail })
    $color = 'Green'; if (-not $ok) { $color = 'Yellow' }
    Write-Host ("  [{0}] {1} {2}" -f $(if ($ok) { 'ok' } else { '!!' }), $step, $detail) -ForegroundColor $color
}

# --- Connect ----------------------------------------------------------------
if (-not $Serial) {
    if (-not $Ip) { throw 'Give -Ip (the stick''s IP address) or -Serial.' }
    if ($PairPort -gt 0) {
        if (-not $PairCode) { throw 'Give -PairCode with -PairPort.' }
        Write-Host "Pairing with $Ip`:$PairPort ..."
        & $adb pair "$Ip`:$PairPort" $PairCode
    }
    $Serial = "$Ip`:$Port"
    Write-Host "Connecting to $Serial ..."
    & $adb connect $Serial | Out-Host
}

function A { & $adb -s $Serial @args 2>&1 | ForEach-Object { "$_" } }
function Sh { param([string]$cmd) (A shell $cmd) -join "`n" }

Write-Host 'Waiting for the stick. If the TV asks "Allow USB debugging?", choose Always allow, then OK.' -ForegroundColor Cyan
$state = ''
for ($i = 0; $i -lt 60; $i++) {
    $state = ((A get-state) -join ' ').Trim()
    if ($state -eq 'device') { break }
    Start-Sleep 2
}
if ($state -ne 'device') { throw "Stick not ready (state: $state). Check ADB debugging is on and the IP is right." }

$fire = (Sh 'pm list features') -match 'amazon.hardware.fire_tv'
$sdk = [int]((Sh 'getprop ro.build.version.sdk').Trim())
$model = (Sh 'getprop ro.product.model').Trim()
$platformName = 'Google TV / Android TV'; if ($fire) { $platformName = 'Fire TV' }
Write-Host ("Connected: {0} ({1}, Android API {2})" -f $model, $platformName, $sdk) -ForegroundColor Cyan

# --- Install ----------------------------------------------------------------
if (-not $SkipInstall) {
    if (-not (Test-Path $Apk)) { throw "APK not found: $Apk (run build.ps1 first)" }
    $out = (A install -r $Apk) -join ' '
    Note 'Install app' ($out -match 'Success') ($out.Trim())
}
$installed = (Sh "pm list packages $Pkg") -match $Pkg
if (-not $installed) { throw 'The app is not installed on the stick.' }

# --- Permissions ------------------------------------------------------------
$out = Sh "appops set $Pkg SYSTEM_ALERT_WINDOW allow"
$check = Sh "appops get $Pkg SYSTEM_ALERT_WINDOW"
Note 'Display over other apps' ($check -match 'allow') ($check.Trim())

if ($sdk -ge 31) {
    $null = Sh "appops set $Pkg SCHEDULE_EXACT_ALARM allow"
    Note 'Exact alarms' $true 'allowed (API 31+)'
} else {
    Note 'Exact alarms' $true 'not needed below API 31'
}

$out = Sh "dumpsys deviceidle whitelist +$Pkg"
Note 'No battery limits' ($out -notmatch 'rror') ($out.Trim())

$admin = "$Pkg/$Ns.system.AdminReceiver"
$out = Sh "dpm set-active-admin $admin"
$admins = Sh 'dumpsys device_policy'
Note 'Device admin (sleep for Off)' (($out -match 'Success') -or ($admins -match [regex]::Escape($admin))) ($out.Trim())

if (-not $fire) {
    # This app's Home-button service on; the other version's off (only one app may take Home).
    $svc = "$Pkg/$Ns.system.HomeKeyService"
    $otherSvc = "$Other/$Ns.system.HomeKeyService"
    $current = (Sh 'settings get secure enabled_accessibility_services').Trim()
    $list = @()
    if ($current -and $current -ne 'null') { $list = @($current -split ':' | Where-Object { $_ -and $_ -ne $otherSvc -and $_ -ne $svc }) }
    $list += $svc
    $null = Sh ("settings put secure enabled_accessibility_services {0}" -f ($list -join ':'))
    $null = Sh 'settings put secure accessibility_enabled 1'
    Start-Sleep 2
    $now = (Sh 'settings get secure enabled_accessibility_services').Trim()
    Note 'Home button service' (($now -split ':') -contains $svc) 'accessibility service enabled'
    if ($current -split ':' -contains $otherSvc) {
        Note 'Other version''s Home button' (-not (($now -split ':') -contains $otherSvc)) "turned off for $Other"
    }
    # And the TV's default home app, for the cases the Home-button service doesn't cover (after a restart).
    $out = Sh "cmd package set-home-activity $Pkg/$Ns.HomeAlias"
    Note 'Default home app' ($out -notmatch 'rror|nknown') ($(if ($out.Trim()) { $out.Trim() } else { "set to $Pkg" }))

    if ($DisableStockLauncher) {
        foreach ($l in @('com.google.android.apps.tv.launcherx', 'com.google.android.tvlauncher')) {
            if ((Sh "pm list packages $l") -match $l) {
                $out = Sh "pm disable-user --user 0 $l"
                Note "Disable stock launcher ($l)" ($out -match 'disabled') ($out.Trim())
            }
        }
    }
} else {
    Note 'Home button service' $true 'skipped on Fire TV (Fire always sends Home to Amazon)'
}

# --- HDMI-CEC: let the stick turn the TV off at night and on in the morning -----
# Android 11 and older (Fire OS 7/8, Shield): Settings.Global keys.
# Android 12+: the HDMI CEC config, set through `cmd hdmi_control cec_setting`.
# Only keys the device already has are changed; each result is reported.
$globalCec = @(
    @('hdmi_control_enabled', '1', 'CEC on'),
    @('hdmi_control_auto_device_off_enabled', '1', 'turn TV off when the stick sleeps'),
    @('hdmi_one_touch_play_enabled', '1', 'turn TV on and switch input when the stick wakes'),
    @('hdmi_control_send_active_source_enabled', '1', 'tell the TV this input is active')
)
$existing = Sh 'settings list global'
foreach ($c in $globalCec) {
    if ($c[0] -eq 'hdmi_control_enabled' -or $existing -match ("(?m)^{0}=" -f [regex]::Escape($c[0]))) {
        $null = Sh ("settings put global {0} {1}" -f $c[0], $c[1])
        $v = (Sh ("settings get global {0}" -f $c[0])).Trim()
        Note ("CEC: {0}" -f $c[2]) ($v -eq $c[1]) ("global/{0} now {1}" -f $c[0], $v)
    }
}
if ($sdk -ge 31) {
    foreach ($c in @(@('hdmi_cec_enabled', '1'), @('power_control_mode', 'to_tv'))) {
        $null = Sh ("cmd hdmi_control cec_setting set {0} {1}" -f $c[0], $c[1])
        $v = (Sh ("cmd hdmi_control cec_setting get {0}" -f $c[0])).Trim()
        Note ("CEC: {0}" -f $c[0]) ($v -match [regex]::Escape($c[1])) ("now $v")
    }
}
Write-Host '  Also turn on CEC on the TV itself (Anynet+, Bravia Sync, SimpLink, EasyLink...).' -ForegroundColor Cyan

# --- Screensaver and display sleep -------------------------------------------
# Several keys; which ones exist varies by device. Each is reported.
$settings = @(
    @('secure', 'screensaver_enabled', '0'),
    @('secure', 'screensaver_activate_on_sleep', '0'),
    @('secure', 'screensaver_activate_on_dock', '0'),
    @('system', 'screen_off_timeout', '2147483647'),
    @('secure', 'sleep_timeout', '-1'),
    @('secure', 'attentive_timeout', '-1')
)
foreach ($s in $settings) {
    $null = Sh ("settings put {0} {1} {2}" -f $s[0], $s[1], $s[2])
    $v = (Sh ("settings get {0} {1}" -f $s[0], $s[1])).Trim()
    Note ("{0}/{1}" -f $s[0], $s[1]) ($v -eq $s[2]) ("now $v")
}
Note 'Stay awake' $true 'the app also holds the screen on while signage shows'

# --- Planning Center token (Green Room) -----------------------------------------
if ($PlanningCenter -and $Is2) {
    Note 'Planning Center token' $true '2.0 TVs get it from the dashboard (Settings > Green Room); nothing to do here'
} elseif ($PlanningCenter) {
    Write-Host 'Planning Center personal access token (from api.planningcenteronline.com/oauth/applications, a view-only Services user).' -ForegroundColor Cyan
    $appId = Read-Host 'Application ID'
    $secure = Read-Host 'Secret' -AsSecureString
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    if ($appId -notmatch '^[A-Za-z0-9_\-]+$' -or $secret -notmatch '^[A-Za-z0-9_\-]+$') {
        Note 'Planning Center token' $false 'not saved: the ID and secret should be letters and numbers only'
    } else {
        # Only the adb shell may send this broadcast (the receiver requires android.permission.DUMP).
        $out = Sh ("am broadcast -n $Pkg/$Ns.system.TokenReceiver --es pcoAppId {0} --es pcoSecret {1}" -f $appId.Trim(), $secret.Trim())
        Note 'Planning Center token' ($out -match 'result=1') 'stored encrypted on the stick'
    }
    $secret = $null; $appId = $null
}

# --- Start the app ----------------------------------------------------------
if ($Is2) {
    $null = Sh "am start -n $Pkg/$Ns.MainActivity"
    Note 'Start app' $true 'pair it: type the code on the TV into Screens > + Add a screen'
} elseif ($Device) {
    $null = Sh ("am start -n $Pkg/$Ns.MainActivity --es setDevice '{0}'" -f $Device.Replace("'", ''))
    Start-Sleep 3
    $saved = Sh "run-as $Pkg cat shared_prefs/graceview.xml"
    Note 'Start app as TV name' ($saved -match [regex]::Escape(">$Device<")) "set to $Device"
} else {
    $null = Sh "am start -n $Pkg/$Ns.MainActivity"
    Note 'Start app' $true 'pick this TV in "Which TV is this?" if it asks'
}

Write-Host ''
Write-Host 'Summary' -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-Host
$failed = @($results | Where-Object { $_.Result -ne 'OK' })
if ($failed.Count -eq 0) { Write-Host 'All set.' -ForegroundColor Green }
else { Write-Host "$($failed.Count) step(s) didn't take. Send this summary to whoever maintains the app." -ForegroundColor Yellow }
if ($fire) {
    Write-Host 'Fire TV: also check Settings > Display & Sounds > Screen saver and set "Start time" to Never if it still appears.' -ForegroundColor Cyan
}
