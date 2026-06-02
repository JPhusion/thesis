# Windows Simulation Quickstart

This repo now includes a **native Windows BER pipeline** for:

- `BCH(255,231,3)`
- `PC[BCH(255,231,3) x BCH(255,231,3)]`
- `SC[short BCH(254,230,3)]`
- `BCH(511,484,3)`
- `PC[BCH(511,484,3) x BCH(511,484,3)]`
- `SC[short BCH(510,483,3)]`

It uses the same native C sweep programs and the same Python orchestration/progress reporting as the Linux path, but with a **portable Zig C compiler** downloaded into the repo so you do not need WSL or `make`. Every feature of the Linux/WSL path — round-robin scheduling, per-graph time/frame budgets, and the terminated/streaming staircase modes — is available here through the PowerShell wrapper.

The current BER defaults use:

- stop condition: `300` decoded bit errors per SNR point (run until reached, with an optional frame cap)
- max frame cap: unlimited by default
- scheduling: round-robin in batches of `10` frames per point per round (`-BatchFrames`), using all CPU cores (`-Jobs`)
- product-code decoding: `12` iterations
- staircase decoding: window `7`, `12` iterations; `terminated` mode at `100` data blocks by default

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

The runner shows a live status block per graph, e.g.:

```text
Overall: 9/21 SNR points complete  |  Elapsed: 05:43

staircase_254   [  coarse  ] complete 9/13   sweep #3 (5/8 this sweep)   ETA 02:09 -> 22:15:10
    working on: 4.40, 4.50, 4.60, 4.70 dB
staircase_510   [ pending  ] complete 0/8
```

- **status** — `pending` -> `calibrating` -> `coarse` -> `fine` (waterfall refinement) -> `done`.
- **complete X/Y** — SNR points that reached the decoded-error target. Points stopped early by a frame cap or budget show as `(N capped)`, so "complete" means only the points that actually hit the target.
- **sweep #N (done/total this sweep)** — the round-robin sweep counter and progress through the current sweep (one batch of `-BatchFrames` per point still short of its target).
- **working on** — the SNR point(s) being simulated right now.
- **ETA -> Finish** — estimated remaining time and predicted clock finish for that graph.

Graphs run one at a time; within a graph all CPU cores are used, and the slow high-SNR tail is split across cores so nothing idles.

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
  -TargetErrors 300 `
  -MaxFrames 0 `
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

### Scheduling and budgets

The suite sweeps the whole SNR range in rounds, simulating a batch of frames per
point per round and dropping points once they hit `-TargetErrors`. You can tune the
batch size and bound the runtime per graph:

```powershell
.\scripts\windows\run_all_ber.ps1 `
  -BatchFrames 50 `          # frames per point per round (bigger = less overhead)
  -TimeBudgetSeconds 1800 `  # per-graph wall-clock cap (0 = unlimited)
  -FrameBudget 0             # per-graph total-frame cap (0 = unlimited)
```

When a budget is hit, the remaining points are finalised with whatever data they have,
so the curve stays complete (just noisier at the tail). Disable adaptive refinement with
`-NoAdaptiveWaterfall`.

### Staircase mode (paper replication)

The staircase graphs default to **terminated** mode with `100` data blocks. For a faithful
match to the paper (Sheikh et al., arXiv:1902.03575, Figs 5/6 — the *iBDD (staircase)* curve),
use **streaming** mode, which simulates a continuous sliding-window chain at the exact
asymptotic rate (`0.811` for the 254 component, `0.894` for the 510):

```powershell
.\scripts\windows\run_all_ber.ps1 `
  -Graphs "staircase_254,staircase_510" `
  -StaircaseMode streaming `
  -TargetErrors 300 -BatchFrames 50 -TimeBudgetSeconds 3600
```

- The staircase graphs pin their own sweep/plot ranges (254: 3.6–4.8 dB, 510: 4.5–5.2 dB),
  so `-StartDb`/`-EndDb` don't need to be set for them.
- In `terminated` mode, raise `-StaircaseDataBlocks` (e.g. `200`) to push the effective rate
  closer to the asymptote; `-StaircaseDataBlocks 0` keeps the per-graph default.
- The 510 component is heavy (255×255-bit blocks); reaching BER `1e-6` there needs a generous
  time budget, and the deep tail will be coarse.

## Notes

- The channel model is still the native C implementation for all three families:
  - BPSK modulation
  - AWGN
  - hard demodulation
- Each SNR point now runs until the decoder has accumulated `300` decoded bit errors by default.
- If you want a safety cutoff for very clean points, set `-MaxFrames` to a positive integer.
- By default the runner uses all available logical CPU cores (`-Jobs`).
- **Core saturation:** when fewer SNR points remain than cores (the slow high-SNR tail), each
  remaining point is split into multiple concurrent sub-batches so all cores stay busy instead
  of idling. The CPU is maxed throughout a graph, not just during the bulk.
- By default the runner does a two-stage sweep:
  - coarse sweep at your requested `StepDb`
  - automatic denser refinement around the steepest waterfall region using `0.02 dB` spacing
- The ETA values are calibrated first, then refined while the run is in progress.
- The staircase sweep uses the current native staircase decoder in this repo (hard-decision windowed iBDD).
- The paper-aligned staircase presets match the paper's window size (`7`) and iteration count (`12`). To also match its code rate, use `-StaircaseMode streaming` (continuous chain) or raise `-StaircaseDataBlocks` in terminated mode — see "Staircase mode (paper replication)" above.

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
