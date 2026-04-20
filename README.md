## BCH Web Lab

This repository contains a native C BCH implementation (`bch/`) and a static browser lab (`site/`) that runs the same C core through WebAssembly.

### BER workflow

If you want the native BER curves for:

- BCH
- Product code
- Staircase code

use one of these guides:

- [docs/WINDOWS_SIMULATIONS.md](docs/WINDOWS_SIMULATIONS.md)
- [docs/WSL_SIMULATIONS.md](docs/WSL_SIMULATIONS.md)
- [docs/WSL_CLOUDFLARE_SSH.md](docs/WSL_CLOUDFLARE_SSH.md)

Quickstart after cloning inside WSL:

```bash
./scripts/wsl/run_all_ber.sh --bootstrap
```

That will install Linux dependencies, create the plotting environment, build the native sweep runners, run the simulations, and generate CSV + `png/pdf/svg` plots with live progress and ETA reporting.

Quickstart on native Windows PowerShell:

```powershell
.\scripts\windows\run_all_ber.ps1 -Bootstrap
```

### Native workflow

```bash
make
```

Run the full native test suite:

```bash
make native-test
```

### Web workflow

Build WASM assets from the latest C sources:

```bash
make site-build
```

`site-build` requires Emscripten (`emcc`) to be installed and on `PATH`.

Preview locally:

```bash
make site-serve
```

Run scripted WASM parity checks against native-generated vectors:

```bash
make site-test
```

Deploy `/site` to the `gh-pages` branch:

```bash
make site-deploy
```

### Native BER suite from Linux / WSL

Run the default BCH + product + staircase BER suite:

```bash
make ber-suite
```

First-time Linux/WSL setup + run:

```bash
make ber-suite-bootstrap
```

### Notes

- `site/` is the canonical static web source.
- `scripts/site/build_wasm.sh` compiles `bch/src/*.c` into `site/assets/bch.js` and `site/assets/bch.wasm`.
- `scripts/site/deploy_gh_pages.sh` publishes site artifacts to `gh-pages`.
