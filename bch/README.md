# BCH (C) — encoder/decoder (work-in-progress)

This repo implements a **binary primitive BCH** encoder/decoder intended for FPGA-oriented architecture work.

## Scope
- Field: GF(2^m) with bitwise polynomial arithmetic and reduction (no log/antilog tables).
- Code family: **primitive narrow-sense BCH** by default:
  - Length: n = 2^m - 1
  - Roots: α^1 .. α^(2t)
- Encoder: **systematic** encoding (message bits preserved).
- Decoder: syndrome computation → Berlekamp–Massey → Chien search → bit flip.

## Folder layout
- `include/` public headers
- `src/` implementation split by stage
- `tests/` tiny executables for unit testing each stage
- `apps/` demo executable

## Build
```bash
cmake -S . -B build
cmake --build build -j
