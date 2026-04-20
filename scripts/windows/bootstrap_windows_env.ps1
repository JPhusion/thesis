$ErrorActionPreference = "Stop"

param(
    [string]$ZigVersion = "0.13.0"
)

function Get-PythonCommand {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return @("py", "-3")
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return @("python")
    }
    throw "Python 3 was not found. Install Python 3 first, then rerun this script."
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ToolsRoot = Join-Path $Root ".tools"
$ZigRoot = Join-Path $ToolsRoot "zig"
$ZigFolder = Join-Path $ZigRoot "zig-windows-x86_64-$ZigVersion"
$ZigExe = Join-Path $ZigFolder "zig.exe"
$DownloadZip = Join-Path $ZigRoot "zig-windows-x86_64-$ZigVersion.zip"
$Venv = Join-Path $Root ".venv-ber-windows"
$VenvPython = Join-Path $Venv "Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
New-Item -ItemType Directory -Force -Path $ZigRoot | Out-Null

if (-not (Test-Path $ZigExe)) {
    $zigUrl = "https://ziglang.org/download/$ZigVersion/zig-windows-x86_64-$ZigVersion.zip"
    Write-Host "Downloading Zig $ZigVersion..."
    Invoke-WebRequest -Uri $zigUrl -OutFile $DownloadZip
    if (Test-Path $ZigFolder) {
        Remove-Item -Recurse -Force $ZigFolder
    }
    Expand-Archive -LiteralPath $DownloadZip -DestinationPath $ZigRoot -Force
}

$pythonCmd = Get-PythonCommand
if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating Python virtual environment..."
    if ($pythonCmd.Length -gt 1) {
        & $pythonCmd[0] @($pythonCmd[1..($pythonCmd.Length - 1)]) -m venv $Venv
    } else {
        & $pythonCmd[0] -m venv $Venv
    }
}

Write-Host "Installing plotting dependencies..."
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install matplotlib

Write-Host "Building native BER runners..."
$env:ZIG_EXE = $ZigExe
& $VenvPython (Join-Path $Root "scripts\windows\build_native_runners.py")

Write-Host ""
Write-Host "Windows BER environment is ready."
Write-Host "Run:"
Write-Host "  .\\scripts\\windows\\run_all_ber.ps1"
