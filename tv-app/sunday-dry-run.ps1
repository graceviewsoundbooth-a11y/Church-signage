# Sunday dry run: steps the TVs through a Sunday with the debug clock and screenshots each step.
# Run it after every new build, from the church computer:
#   powershell -ExecutionPolicy Bypass -File android\sunday-dry-run.ps1
#   powershell -ExecutionPolicy Bypass -File android\sunday-dry-run.ps1 -StartStream      (also tests Live)
#   powershell -ExecutionPolicy Bypass -File android\sunday-dry-run.ps1 -Times 18:00,19:00,21:00 -Date 2026-11-19
# It writes a folder of screenshots plus index.html (one row per time, one column per TV) and opens it.
# At the end every TV goes back to the real clock and its real schedule.
param(
    [string[]]$Devices = @('Lobby=192.168.0.142', 'Coffee Spot=192.168.0.125', 'Green Room=192.168.0.182'),
    [string]$Date = '',                      # yyyy-MM-dd; default: the next Sunday
    [string[]]$Times = @('07:20', '07:30', '10:00', '10:30', '12:00', '13:00'),
    [int]$WaitSeconds = 25,                   # time for each TV to switch (Live needs ~15 s to connect)
    [switch]$StartStream                      # start vMix's stream for the run (stopped again at the end)
)
# 'Continue': in Windows PowerShell, adb messages on stderr (e.g. "device offline") would
# otherwise stop the script. Real problems are checked and thrown below.
$ErrorActionPreference = 'Continue'
$base = $env:LOCALAPPDATA; if ($base -match ' ') { $base = 'C:\GraceviewTools' }
$adb = Join-Path $base 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb not found at $adb (run setup-dev.ps1 first)" }

if (-not $Date) {
    $d = (Get-Date).Date.AddDays(1); while ($d.DayOfWeek -ne 'Sunday') { $d = $d.AddDays(1) }
    $Date = $d.ToString('yyyy-MM-dd')
}
$out = Join-Path 'C:\Graceview\dry-runs' ((Get-Date -Format 'yyyy-MM-dd_HHmm') + "_for_$Date")
New-Item -ItemType Directory -Force $out | Out-Null

$tvs = @()
foreach ($entry in $Devices) {
    $name, $ip = $entry.Split('=', 2)
    $serial = "${ip}:5555"
    & $adb connect $serial 2>$null | Out-Null
    $state = (& $adb -s $serial get-state 2>$null) -join ''
    if ($state -ne 'device') { Write-Warning "$name ($ip) isn't reachable ($state); skipping it."; continue }
    $tvs += [pscustomobject]@{ Name = $name; Serial = $serial; File = ($name -replace '\W', '') }
}
if (-not $tvs) { throw 'No TVs answered.' }

$streamStarted = $false
if ($StartStream) {
    try {
        $x = [xml](Invoke-WebRequest 'http://127.0.0.1:8088/api/' -UseBasicParsing -TimeoutSec 5).Content
        if ($x.vmix.SelectSingleNode('streaming').InnerText -ne 'True') {
            Invoke-WebRequest 'http://127.0.0.1:8088/api/?Function=StartStreaming' -UseBasicParsing | Out-Null
            $streamStarted = $true; Write-Host 'Started the vMix stream for the test.'; Start-Sleep 8
        }
    } catch { Write-Warning "vMix didn't answer on port 8088; Live steps will show 'Connecting'." }
}

$rows = @()
try {
    foreach ($t in $Times) {
        $fake = "${Date}T${t}:00"
        Write-Host "== $Date $t" -ForegroundColor Cyan
        foreach ($tv in $tvs) {
            & $adb -s $tv.Serial shell am start -n org.graceview.tv/.MainActivity --es fakeNow $fake --ez applyNow true | Out-Null
        }
        Start-Sleep $WaitSeconds
        $cells = @()
        foreach ($tv in $tvs) {
            $png = "$($t.Replace(':',''))_$($tv.File).png"
            cmd /c "`"$adb`" -s $($tv.Serial) exec-out screencap -p > `"$out\$png`""
            # The mode the app saved (debug builds allow run-as); the log is a fallback, it rolls over.
            $prefs = (& $adb -s $tv.Serial shell run-as org.graceview.tv cat shared_prefs/graceview.xml 2>$null) -join "`n"
            $mode = if ($prefs -match 'name="appliedMode">(\w+)<') { $Matches[1] } else { '' }
            if (-not $mode) {
                $applied = (& $adb -s $tv.Serial logcat -d -s Signage:I 2>$null | Select-String 'Applied' | Select-Object -Last 1)
                $mode = if ($applied) { ($applied.Line -replace '.*Applied ', '') -replace ' theme=.*', '' } else { '?' }
            }
            $awake = ((& $adb -s $tv.Serial shell dumpsys power 2>$null) -join "`n") -match 'mWakefulness=Awake'
            Write-Host ("   {0,-12} {1}{2}" -f $tv.Name, $mode, $(if (-not $awake) { '  (asleep)' } else { '' }))
            $cells += "<td><img src='$png'><div>$($tv.Name): $mode$(if (-not $awake) { ' (asleep)' })</div></td>"
        }
        $rows += "<tr><th>$t</th>$($cells -join '')</tr>"
    }
} finally {
    foreach ($tv in $tvs) { & $adb -s $tv.Serial shell am start -n org.graceview.tv/.MainActivity --ez clearFake true --ez applyNow true | Out-Null }
    Write-Host 'TVs are back on the real clock.'
    if ($streamStarted) { Invoke-WebRequest 'http://127.0.0.1:8088/api/?Function=StopStreaming' -UseBasicParsing | Out-Null; Write-Host 'Stopped the vMix stream.' }
}

$head = ($tvs | ForEach-Object { "<th>$($_.Name)</th>" }) -join ''
@"
<!doctype html><meta charset=utf-8><title>Sunday dry run $Date</title>
<style>body{font-family:Segoe UI,sans-serif;background:#111;color:#eee;margin:16px}
table{border-collapse:collapse}td,th{padding:6px;vertical-align:top}img{width:420px;display:block;border:1px solid #333}
th{text-align:left}div{font-size:14px;margin-top:4px}</style>
<h1>Dry run for $Date</h1><p>Made $(Get-Date -Format 'MMM d h:mm tt'). Each picture is what that TV showed at that time on the test clock.</p>
<table><tr><th></th>$head</tr>$($rows -join "`n")</table>
"@ | Set-Content -Encoding UTF8 (Join-Path $out 'index.html')
Write-Host "Done: $out\index.html" -ForegroundColor Green
Start-Process (Join-Path $out 'index.html')
