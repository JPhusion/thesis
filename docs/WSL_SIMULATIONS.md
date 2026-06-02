# WSL Simulation Quickstart

If you need to run the same BER suite natively on Windows instead, use [docs/WINDOWS_SIMULATIONS.md](./WINDOWS_SIMULATIONS.md).

This repo now includes a native Linux/WSL BER pipeline for:

- `BCH(255,231,3)`
- `PC[BCH(255,231,3) x BCH(255,231,3)]`
- `SC[short BCH(254,230,3)]`
- `BCH(511,484,3)`
- `PC[BCH(511,484,3) x BCH(511,484,3)]`
- `SC[short BCH(510,483,3)]`

The script builds the native C runners, runs the BER sweeps, writes CSVs, and generates `png`, `pdf`, and `svg` plots. The same `run_all_ber.py` driver also runs on native Windows (see [docs/WINDOWS_SIMULATIONS.md](./WINDOWS_SIMULATIONS.md)) — only the launcher differs.

The current BER defaults use:

- stop condition: `300` decoded bit errors per SNR point (run until reached, with an optional frame cap)
- max frame cap: unlimited by default
- scheduling: round-robin in batches of `10` frames per point per sweep (`--batch-frames`), across all CPU cores (`--jobs`)
- product-code decoding: `12` iterations
- staircase decoding: window `7`, `12` iterations; `terminated` mode at `100` data blocks by default (`--staircase-mode`)

## 1. Install WSL

From an elevated Windows PowerShell:

```powershell
wsl --install -d Ubuntu-24.04
```

Reboot if Windows asks you to, then open Ubuntu.

## 2. Clone the repo inside Linux

Inside WSL:

```bash
cd ~
git clone <your-repo-url> thesis
cd thesis
```

## 3. Read the instructions

- Root overview: [README.md](../README.md)
- This WSL guide: [docs/WSL_SIMULATIONS.md](./WSL_SIMULATIONS.md)

## 4. Run the setup + simulation script

Recommended first run:

```bash
./scripts/wsl/run_all_ber.sh --bootstrap
```

That command will:

1. install Ubuntu packages needed for native builds and plotting
2. create a local Python virtual environment
3. install `matplotlib`
4. build the native BER runners
5. calibrate the graphs
6. run the full BER sweeps
7. generate CSV + `png/pdf/svg` plots

## 5. Wait for the results

The runner shows a live status block per graph, e.g.:

```text
Overall: 9/21 SNR points complete  |  Elapsed: 05:43

staircase_254   [  coarse  ] complete 9/13   sweep #3 (5/8 this sweep)   ETA 02:09 -> 22:15:10
    working on: 4.40, 4.50, 4.60, 4.70 dB
staircase_510   [ pending  ] complete 0/8
```

- **status** — `pending` -> `calibrating` -> `coarse` -> `fine` (waterfall refinement) -> `done`.
- **complete X/Y** — SNR points that have reached the decoded-error target. Points stopped early by a frame cap or budget instead show as `(N capped)`, so "complete" means only the points that actually hit the target.
- **sweep #N (done/total this sweep)** — the round-robin sweep counter and progress through the current sweep. Each sweep gives one batch (`--batch-frames`) to every point still short of its target.
- **working on** — the SNR point(s) being simulated right now.
- **ETA -> Finish** — estimated time remaining and predicted clock finish for that graph.

Graphs run one at a time; within a graph all CPU cores are used (see the core-saturation note below).

While the suite is running, it also updates each graph's merged CSV and plot files in place so you can inspect intermediate results before the whole suite finishes. The same fields are mirrored in `progress.json`.

It also writes a machine-readable progress file:

```text
artifacts/wsl-ber-runs/latest/progress.json
```

The final outputs go under a timestamped run directory, with `latest` pointing to the newest one:

```text
artifacts/wsl-ber-runs/latest/
```

That directory contains:

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

The staircase presets above are aligned to the paper settings from Figures 5 and 6 of `1902.03575v2`:

- shortened BCH component codes `(254,230,3)` and `(510,483,3)`
- window size `7`
- total hard-decision iterations `12`
- x-axis ranges `3.6–4.8 dB` and `4.5–5.2 dB`

## Common options

Run the suite with explicit settings:

```bash
./scripts/wsl/run_all_ber.sh \
  --target-errors 300 \
  --max-frames-per-point 0 \
  --start-db 0 \
  --end-db 6 \
  --step-db 0.1 \
  --jobs 8
```

Change the graph set:

```bash
./scripts/wsl/run_all_ber.sh --graphs bch_255,product_255,staircase_254,bch_511,product_511,staircase_510
```

Reuse existing binaries if you already built them:

```bash
./scripts/wsl/run_all_ber.sh --skip-build
```

### Scheduling and budgets

The suite sweeps the whole SNR range in rounds, simulating a batch of frames per
point per round and dropping points once they hit `--target-errors`:

```bash
./scripts/wsl/run_all_ber.sh \
  --batch-frames 10 \          # frames per point per sweep (smaller = shorter, more frequent updates)
  --time-budget-seconds 1800 \ # per-graph wall-clock cap (0 = unlimited)
  --frame-budget 0             # per-graph total-frame cap (0 = unlimited)
```

When a budget is hit, remaining points are finalised with whatever data they have, so the
curve stays complete (just noisier at the tail). Disable waterfall refinement with
`--no-adaptive-waterfall`.

### Staircase mode (paper replication)

The staircase graphs default to `terminated` mode with `100` data blocks. For a faithful
match to the paper (the *iBDD (staircase)* curve in Figs 5/6), use `streaming` mode — a
continuous sliding-window chain at the exact asymptotic rate (`0.811` for the 254
component, `0.894` for the 510):

```bash
./scripts/wsl/run_all_ber.sh \
  --graphs staircase_254,staircase_510 --staircase-mode streaming \
  --target-errors 300 --batch-frames 50 --time-budget-seconds 3600
```

- The staircase graphs pin their own sweep/plot ranges (254: 3.6–4.8 dB, 510: 4.5–5.2 dB).
- In `terminated` mode, raise `--staircase-data-blocks` (e.g. `200`) to push the effective rate
  closer to the asymptote; `0` keeps the per-graph default.
- The 510 component is heavy (255×255-bit blocks); reaching BER `1e-6` there needs a generous budget.

## Notes

- By default the runner uses all available logical CPU cores (`--jobs`).
- **Core saturation:** when fewer SNR points remain than cores (the slow high-SNR tail), each
  remaining point is split into multiple concurrent sub-batches so all cores stay busy instead
  of idling. The CPU is maxed throughout a graph, not just during the bulk.
- Each SNR point runs until the decoder has accumulated `300` decoded bit errors by default;
  pass `--max-frames-per-point N` for a safety cutoff on very clean points.
- By default the runner does a two-stage sweep:
  - coarse sweep at your requested `step_db`
  - automatic denser refinement around the steepest waterfall region using `0.02 dB` spacing
- The ETA values are calibrated up front using a short warm-up pass, then refined as the real run progresses.
- The staircase graph uses the current native staircase implementation in `staircase/`.
- The staircase sweep matches the paper's window size (`7`) and iteration count (`12`). To also
  match its code rate, use `--staircase-mode streaming` or raise `--staircase-data-blocks`. It still
  uses this repo's hard-decision staircase decoder — it does not implement iBDD-SR, AD, or genie-aided ideal iBDD from the paper.
- The channel model is native C for all three families:
  - BPSK modulation
  - AWGN
  - hard demodulation

## If you only want to bootstrap once

You can split setup and execution:

```bash
./scripts/wsl/bootstrap_wsl_env.sh
./scripts/wsl/run_all_ber.sh
```
