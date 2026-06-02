param(
    [switch]$Bootstrap,
    [switch]$SkipBuild,
    [Alias("Frames")]
    [int]$MaxFrames = 0,
    [int]$TargetErrors = 300,
    [int]$Jobs = [Environment]::ProcessorCount,
    [double]$StartDb = 0.0,
    [double]$EndDb = 6.0,
    [double]$StepDb = 0.1,
    [Alias("CalibrationFrames")]
    [int]$CalibrationErrors = 12,
    [string]$Graphs = "bch_255,product_255,staircase_254,bch_511,product_511,staircase_510",
    [ValidateSet("terminated", "streaming")]
    [string]$StaircaseMode = "terminated",
    [int]$StaircaseDataBlocks = 0,
    [int]$BatchFrames = 10,
    [double]$TimeBudgetSeconds = 0.0,
    [int]$FrameBudget = 0,
    [switch]$NoAdaptiveWaterfall,
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"

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

# Format doubles with an invariant (period) decimal separator so non-US locales
# don't emit "4,5" and break argument parsing on the Python side.
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$startStr = $StartDb.ToString($inv)
$endStr = $EndDb.ToString($inv)
$stepStr = $StepDb.ToString($inv)
$timeBudgetStr = $TimeBudgetSeconds.ToString($inv)

$argsList = @(
    (Join-Path $Root "scripts\wsl\run_all_ber.py"),
    "--target-errors", $TargetErrors,
    "--max-frames-per-point", $MaxFrames,
    "--jobs", $Jobs,
    "--start-db", $startStr,
    "--end-db", $endStr,
    "--step-db", $stepStr,
    "--graphs", $Graphs,
    "--calibration-errors", $CalibrationErrors,
    "--staircase-mode", $StaircaseMode,
    "--staircase-data-blocks", $StaircaseDataBlocks,
    "--batch-frames", $BatchFrames,
    "--time-budget-seconds", $timeBudgetStr,
    "--frame-budget", $FrameBudget
)

if ($SkipBuild) {
    $argsList += "--skip-build"
}

if ($NoAdaptiveWaterfall) {
    $argsList += "--no-adaptive-waterfall"
}

if ($OutDir -ne "") {
    $argsList += @("--out-dir", $OutDir)
}

& $VenvPython @argsList
