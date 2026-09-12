# ============================================================================
#  ui-probe.ps1 - headless Edge UI self-check (ASCII only, safe for PS 5.1)
#  Usage:  & .\tools\ui-probe.ps1 -Port 5173
#  Reads the JSON probe report that the app writes when opened with ?probe=1
# ============================================================================
param([int]$Port = 5173)

$ErrorActionPreference = "Stop"

$edgeCandidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge not found; cannot run UI probe" }

$base = "http://127.0.0.1:$Port/"
$scenarios = @(
  @{ name = "main-dark";            url = "?probe=1" },
  @{ name = "main-light";           url = "?probe=1&theme=light-minimal" },
  @{ name = "queue-drag";           url = "?probe=1&tab=queue" },
  @{ name = "playlist";             url = "?probe=1&tab=playlist" },
  @{ name = "settings";             url = "?probe=1&tab=settings" },
  @{ name = "player-classic";       url = "?probe=1&view=player&pv=classic&playing=1" },
  @{ name = "player-immersive";     url = "?probe=1&view=player&pv=immersive&playing=1" },
  @{ name = "player-minimal";       url = "?probe=1&view=player&pv=minimal&playing=1" },
  @{ name = "cover-dark-immersive"; url = "?probe=1&theme=cover-dark&view=player&pv=immersive&playing=1" },
  @{ name = "search-filter";        url = "?probe=1&query=chen" },
  @{ name = "scanning-overlay";     url = "?probe=1&scan=1" }
)

$fail = 0
foreach ($s in $scenarios) {
  $tmp = Join-Path $env:TEMP ("mp-probe-" + [guid]::NewGuid().ToString("N") + ".html")
  # Edge writes unrelated warnings to stderr; do not treat that as a failure
  $ErrorActionPreference = "Continue"
  & $edge --headless=new --disable-gpu --no-first-run --no-default-browser-check `
    --window-size=1440,900 --virtual-time-budget=4000 `
    --user-data-dir="$env:TEMP\mp-edge-probe" --dump-dom "$base$($s.url)" 2>$null |
    Set-Content -Encoding UTF8 -Path $tmp
  $ErrorActionPreference = "Stop"

  $raw = Get-Content -Raw -Path $tmp
  Remove-Item $tmp -ErrorAction SilentlyContinue

  $m = [regex]::Match($raw, '<pre id="probe-report">([\s\S]*?)</pre>')
  if (-not $m.Success) {
    Write-Output ("[?? ] {0}  <== no probe report (page error?)" -f $s.name)
    $fail++
    continue
  }

  $json = $m.Groups[1].Value -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&'
  try { $r = $json | ConvertFrom-Json } catch {
    Write-Output ("[?? ] {0}  <== report parse failed" -f $s.name)
    $fail++
    continue
  }

  if ($r.ok) {
    Write-Output ("[OK ] {0}" -f $s.name)
    Write-Output ("        theme={0} viewport={1}x{2} rows={3} backdrop={4}" -f `
        $r.theme, $r.viewport.vw, $r.viewport.vh, $r.info.trackRows, $r.info.backdropFilter)
  } else {
    Write-Output ("[!! ] {0}" -f $s.name)
    foreach ($i in $r.issues) { Write-Output ("        - {0}" -f $i) }
    $fail++
  }
}

Write-Output ""
if ($fail -eq 0) { Write-Output ("UI probe PASSED ({0} scenarios)" -f $scenarios.Count) }
else { Write-Output ("UI probe FAILED: {0} of {1} scenarios" -f $fail, $scenarios.Count) }
exit $fail
