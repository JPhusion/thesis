#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/site/assets"

if ! command -v emcc >/dev/null 2>&1; then
    echo "error: emcc not found. Install Emscripten first." >&2
    echo "hint: https://emscripten.org/docs/getting_started/downloads.html" >&2
    exit 1
fi

pick_python_310_plus() {
    local candidate
    for candidate in "${PYTHON:-}" python3.13 python3.12 python3.11 python3.10 python3 /opt/homebrew/bin/python3 /usr/bin/python3; do
        if [[ -z "${candidate}" ]]; then
            continue
        fi
        if ! command -v "${candidate}" >/dev/null 2>&1; then
            continue
        fi
        if "${candidate}" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
        then
            command -v "${candidate}"
            return 0
        fi
    done
    return 1
}

EMCC_BIN="$(command -v emcc)"
EMCC_PYTHON="$(pick_python_310_plus || true)"
if [[ -z "${EMCC_PYTHON}" ]]; then
    echo "error: could not find python >= 3.10 for emcc." >&2
    echo "hint: install python 3.10+ and ensure it is on PATH." >&2
    exit 1
fi

mkdir -p "${OUT_DIR}"

EMCC_FLAGS=(
    -std=c11
    -O3
    -I"${ROOT_DIR}/bch/include"
    -sWASM=1
    -sALLOW_MEMORY_GROWTH=1
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=BCHModule
    -sENVIRONMENT=web,worker,node
    -sEXPORTED_FUNCTIONS='["_malloc","_free","_bchw_init","_bchw_free","_bchw_get_n","_bchw_get_k","_bchw_get_t","_bchw_get_dg","_bchw_get_g_ptr","_bchw_encode","_bchw_decode","_bchw_encode_trace","_bchw_decode_trace","_bchw_trace_ptr","_bchw_trace_len","_bchw_trace_stride","_bchw_trace_truncated","_bchw_trace_clear"]'
    -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP32","HEAPU32"]'
)

SRC=(
    "${ROOT_DIR}/bch/src/gf.c"
    "${ROOT_DIR}/bch/src/bch_gen.c"
    "${ROOT_DIR}/bch/src/bch_encode.c"
    "${ROOT_DIR}/bch/src/bch_trace.c"
    "${ROOT_DIR}/bch/src/bch_syndrome.c"
    "${ROOT_DIR}/bch/src/bch_bm.c"
    "${ROOT_DIR}/bch/src/bch_chien.c"
    "${ROOT_DIR}/bch/src/bch_decode.c"
    "${ROOT_DIR}/bch/src/bch_wasm.c"
)

echo "Building BCH WASM module..."
if head -n 1 "${EMCC_BIN}" | grep -Eq 'sh|bash'; then
    EMSDK_PYTHON="${EMCC_PYTHON}" "${EMCC_BIN}" "${SRC[@]}" "${EMCC_FLAGS[@]}" -o "${OUT_DIR}/bch.js"
else
    "${EMCC_PYTHON}" "${EMCC_BIN}" "${SRC[@]}" "${EMCC_FLAGS[@]}" -o "${OUT_DIR}/bch.js"
fi
echo "WASM build complete:"
echo "  ${OUT_DIR}/bch.js"
echo "  ${OUT_DIR}/bch.wasm"
