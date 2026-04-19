# WSL Simulation Quickstart

This repo now includes a native Linux/WSL BER pipeline for:

- `BCH(255,231,3)`
- `PC[BCH(255,231,3) x BCH(255,231,3)]`
- `SC[short BCH(254,230,3), 7 data blocks]`
- `BCH(511,484,3)`
- `PC[BCH(511,484,3) x BCH(511,484,3)]`
- `SC[short BCH(510,483,3), 7 data blocks]`

The script builds the native C runners, runs the BER sweeps, writes CSVs, and generates `png`, `pdf`, and `svg` plots.

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

The runner shows a live status table with:

- current graph
- completed SNR points
- latest SNR point finished
- ETA for each graph
- predicted finish time for each graph

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
  --frames 500 \
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

## Notes

- The ETA values are calibrated up front using a short warm-up pass, then refined as the real run progresses.
- The staircase graph uses the current native staircase implementation in `staircase/`.
- The staircase sweep is configured to match the paper's window size and iteration count, but it still uses this repo's current hard-decision staircase decoder. It does not implement iBDD-SR, AD, or genie-aided ideal iBDD from the paper.
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
