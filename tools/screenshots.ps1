# ============================================================================
#  screenshots.ps1 - capture UI screenshots into docs/screenshots (ASCII only)
#  Usage: & .\tools\screenshots.ps1 [-Port 5173]
# ============================================================================
param([int]$Port = 5173)

$edgeCandidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge not found" }

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "docs\screenshots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outDir = (Resolve-Path $outDir).Path
$base = "http://127.0.0.1:$Port/"

$shots = @(
  @{ n = "01-main-dark";        w = 1440; h = 900; u = "?probe=0" },
  @{ n = "02-main-light";       w = 1440; h = 900; u = "?theme=light-minimal" },
  @{ n = "03-queue";            w = 1440; h = 900; u = "?tab=queue" },
  @{ n = "04-playlist";         w = 1440; h = 900; u = "?tab=playlist" },
  @{ n = "05-settings-folders"; w = 1440; h = 1100; u = "?tab=settings" },
  @{ n = "06-player-classic";   w = 1440; h = 900; u = "?view=player&pv=classic&playing=1" },
  @{ n = "07-player-immersive"; w = 1440; h = 900; u = "?view=player&pv=immersive&playing=1" },
  @{ n = "08-player-minimal";   w = 1440; h = 900; u = "?view=player&pv=minimal&playing=1" },
  @{ n = "09-player-light";     w = 1440; h = 900; u = "?theme=light-minimal&view=player&pv=classic&playing=1" },
  @{ n = "10-cover-dark";       w = 1440; h = 900; u = "?theme=cover-dark&view=player&pv=immersive&playing=1" },
  @{ n = "11-min-window";       w = 1000; h = 680; u = "?probe=0" }
)

$fail = 0
foreach ($s in $shots) {
  $target = Join-Path $outDir "$($s.n).png"
  $ErrorActionPreference = "Continue"
  & $edge --headless=new --disable-gpu --no-first-run --no-default-browser-check `
    --disable-extensions --disable-component-extensions-with-background-pages `
    --hide-scrollbars --window-size=$($s.w),$($s.h) --virtual-time-budget=5000 `
    --user-data-dir="$env:TEMP\mp-edge-shot" `
    --screenshot="$target" "$base$($s.u)" 2>$null | Out-Null
  $ErrorActionPreference = "Stop"

  if (Test-Path $target) {
    $len = (Get-Item $target).Length
    if ($len -lt 20000) { Write-Output ("[!! ] {0}  suspiciously small ({1} bytes)" -f $s.n, $len); $fail++ }
    else { Write-Output ("[OK ] {0}  {1} bytes  {2}x{3}" -f $s.n, $len, $s.w, $s.h) }
  } else {
    Write-Output ("[!! ] {0}  not created" -f $s.n)
    $fail++
  }
}

Write-Output ""
Write-Output ("screenshots: {0} files in {1} (failures: {2})" -f $shots.Count, $outDir, $fail)
exit $fail
