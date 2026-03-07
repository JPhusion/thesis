## BCH Web Lab

This repository contains a native C BCH implementation (`bch/`) and a static browser lab (`site/`) that runs the same C core through WebAssembly.

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

### Notes

- `site/` is the canonical static web source.
- `scripts/site/build_wasm.sh` compiles `bch/src/*.c` into `site/assets/bch.js` and `site/assets/bch.wasm`.
- `scripts/site/deploy_gh_pages.sh` publishes site artifacts to `gh-pages`.
