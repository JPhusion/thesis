$ErrorActionPreference = "Stop"

param(
    [switch]$Bootstrap,
    [switch]$SkipBuild,
    [int]$Frames = 500,
    [int]$Jobs = 4,
    [double]$StartDb = 0.0,
    [double]$EndDb = 6.0,
    [double]$StepDb = 0.1,
    [int]$CalibrationFrames = 4,
    [string]$Graphs = "bch_255,product_255,staircase_254,bch_511,product_511,staircase_510",
    [string]$OutDir = ""
)

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$BootstrapScript = Join-Path $Root "scripts\windows\bootstrap_windows_env.ps1"
$VenvPython = Join-Path $Root ".venv-ber-windows\Scripts\python.exe"
$CacheRoot = Join-Path $Root ".cache\windows-ber"

if ($Bootstrap -or -not (Test-Path $VenvPython)) {
    & $BootstrapScript
}

if (-not (Test-Path $VenvPython)) {
    throw "Python virtual environment was not created successfully."
}

New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $CacheRoot "matplotlib") | Out-Null

$env:PYTHONUTF8 = "1"
$env:MPLCONFIGDIR = Join-Path $CacheRoot "matplotlib"

$zigCandidates = Get-ChildItem -Path (Join-Path $Root ".tools\zig") -Filter "zig.exe" -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName
if ($zigCandidates.Count -gt 0) {
    $env:ZIG_EXE = $zigCandidates[-1].FullName
}

$argsList = @(
    (Join-Path $Root "scripts\wsl\run_all_ber.py"),
    "--frames", $Frames,
    "--jobs", $Jobs,
    "--start-db", $StartDb,
    "--end-db", $EndDb,
    "--step-db", $StepDb,
    "--graphs", $Graphs,
    "--calibration-frames", $CalibrationFrames
)

if ($SkipBuild) {
    $argsList += "--skip-build"
}

if ($OutDir -ne "") {
    $argsList += @("--out-dir", $OutDir)
}

& $VenvPython @argsList
