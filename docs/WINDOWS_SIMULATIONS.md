# Windows Simulation Quickstart

This repo now includes a **native Windows BER pipeline** for:

- `BCH(255,231,3)`
- `PC[BCH(255,231,3) x BCH(255,231,3)]`
- `SC[short BCH(254,230,3), 7 data blocks]`
- `BCH(511,484,3)`
- `PC[BCH(511,484,3) x BCH(511,484,3)]`
- `SC[short BCH(510,483,3), 7 data blocks]`

It uses the same native C sweep programs and the same Python orchestration/progress reporting as the Linux path, but with a **portable Zig C compiler** downloaded into the repo so you do not need WSL or `make`.

## 1. Install Python 3

You need a normal Windows Python 3 install that provides either:

- `py -3`
- or `python`

Check in PowerShell:

```powershell
py -3 --version
```

If that does not work, try:

```powershell
python --version
```

## 2. Clone the repo

From PowerShell:

```powershell
git clone <your-repo-url> thesis
cd thesis
```

## 3. Read the instructions

- Root overview: [README.md](../README.md)
- Windows guide: [docs/WINDOWS_SIMULATIONS.md](./WINDOWS_SIMULATIONS.md)
- WSL guide, if you ever need it later: [docs/WSL_SIMULATIONS.md](./WSL_SIMULATIONS.md)

## 4. Bootstrap the Windows environment

From PowerShell, in the repo root:

```powershell
.\scripts\windows\bootstrap_windows_env.ps1
```

That script will:

1. download a portable Zig compiler into `.tools/zig`
2. create a local Python virtual environment in `.venv-ber-windows`
3. install `matplotlib`
4. build the native BER sweep executables:
   - `bch/build_bch_snr_sweep.exe`
   - `product/build_product_snr_sweep.exe`
   - `staircase/build_staircase_snr_sweep.exe`

## 5. Run the simulations

Default run:

```powershell
.\scripts\windows\run_all_ber.ps1
```

First-time one-shot setup + run:

```powershell
.\scripts\windows\run_all_ber.ps1 -Bootstrap
```

## 6. Wait for the results

The runner shows a live table with:

- current graph
- completed SNR points
- latest finished SNR point
- ETA for each graph
- predicted finish time for each graph

While the suite is running, it also updates each graph's merged CSV and plot files in place so you can inspect intermediate results before the whole suite finishes.

It also writes a machine-readable progress file:

```text
artifacts/wsl-ber-runs/latest/progress.json
```

It also writes:

```text
artifacts/wsl-ber-runs/latest.txt
```

with the full path of the latest run directory. If Windows allows a directory junction, you will also get:

```text
artifacts/wsl-ber-runs/latest/
```

The final outputs include:

- merged CSV files
- `png` plots
- `pdf` plots
- `svg` plots
- a run manifest `README.txt`

## Default graph set

By default the script runs:

```text
bch_255,product_255,staircase_254,bch_511,product_511,staircase_510
```

## Common options

Run the suite with explicit settings:

```powershell
.\scripts\windows\run_all_ber.ps1 `
  -Frames 500 `
  -StartDb 0 `
  -EndDb 6 `
  -StepDb 0.1 `
  -Jobs 8
```

Change the graph set:

```powershell
.\scripts\windows\run_all_ber.ps1 -Graphs "bch_255,product_255,staircase_254"
```

Reuse existing binaries if you already bootstrapped once:

```powershell
.\scripts\windows\run_all_ber.ps1 -SkipBuild
```

Write outputs to a custom directory:

```powershell
.\scripts\windows\run_all_ber.ps1 -OutDir "C:\temp\ber-run"
```

## Notes

- The channel model is still the native C implementation for all three families:
  - BPSK modulation
  - AWGN
  - hard demodulation
- By default the runner uses all available logical CPU cores.
- By default the runner does a two-stage sweep:
  - coarse sweep at your requested `StepDb`
  - automatic denser refinement around the steepest waterfall region using `0.02 dB` spacing
- The ETA values are calibrated first, then refined while the run is in progress.
- The staircase sweep uses the current native staircase decoder in this repo.
- The paper-aligned staircase presets match the paper's window size and total iteration count, but they still use this repo's hard-decision staircase decoder.

## Troubleshooting

### PowerShell blocks the script

If PowerShell refuses to run the script, start PowerShell as your normal user and run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then rerun the bootstrap or run script.

### Python is not found

Install Python 3, then confirm one of these works:

```powershell
py -3 --version
python --version
```

### Zig download failed

Make sure the machine has internet access. The bootstrap script downloads Zig from:

```text
https://ziglang.org/download/
```

### I only want to rebuild the C runners

```powershell
.\.venv-ber-windows\Scripts\python.exe .\scripts\windows\build_native_runners.py
```
