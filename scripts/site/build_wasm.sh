#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/site/assets"
LOCAL_CACHE_DIR="${ROOT_DIR}/.plot-cache"
EM_CACHE_DIR="${ROOT_DIR}/.emcache"

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
mkdir -p "${LOCAL_CACHE_DIR}/fontconfig" "${LOCAL_CACHE_DIR}/matplotlib" "${EM_CACHE_DIR}"

COMMON_FLAGS=(
    -std=c11
    -O3
    -sWASM=1
    -sALLOW_MEMORY_GROWTH=1
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sENVIRONMENT=web,worker,node
)

run_emcc() {
    local out_file="$1"
    shift
    if head -n 1 "${EMCC_BIN}" | grep -Eq 'sh|bash'; then
        EM_CACHE="${EM_CACHE_DIR}" XDG_CACHE_HOME="${LOCAL_CACHE_DIR}" FC_CACHEDIR="${LOCAL_CACHE_DIR}/fontconfig" EMSDK_PYTHON="${EMCC_PYTHON}" "${EMCC_BIN}" "$@" -o "${out_file}"
    else
        EM_CACHE="${EM_CACHE_DIR}" XDG_CACHE_HOME="${LOCAL_CACHE_DIR}" FC_CACHEDIR="${LOCAL_CACHE_DIR}/fontconfig" "${EMCC_PYTHON}" "${EMCC_BIN}" "$@" -o "${out_file}"
    fi
}

BCH_CORE_SRC=(
    "${ROOT_DIR}/bch/src/gf.c"
    "${ROOT_DIR}/bch/src/bch_gen.c"
    "${ROOT_DIR}/bch/src/bch_encode.c"
    "${ROOT_DIR}/bch/src/bch_trace.c"
    "${ROOT_DIR}/bch/src/bch_syndrome.c"
    "${ROOT_DIR}/bch/src/bch_bm.c"
    "${ROOT_DIR}/bch/src/bch_chien.c"
    "${ROOT_DIR}/bch/src/bch_decode.c"
)

PRODUCT_CORE_SRC=(
    "${ROOT_DIR}/bch/src/gf.c"
    "${ROOT_DIR}/bch/src/bch_gen.c"
    "${ROOT_DIR}/bch/src/bch_encode.c"
    "${ROOT_DIR}/bch/src/bch_syndrome.c"
    "${ROOT_DIR}/bch/src/bch_bm.c"
    "${ROOT_DIR}/bch/src/bch_chien.c"
    "${ROOT_DIR}/bch/src/bch_decode.c"
    "${ROOT_DIR}/product/src/product.c"
    "${ROOT_DIR}/product/src/product_trace.c"
)

STAIRCASE_CORE_SRC=(
    "${ROOT_DIR}/bch/src/gf.c"
    "${ROOT_DIR}/bch/src/bch_gen.c"
    "${ROOT_DIR}/bch/src/bch_encode.c"
    "${ROOT_DIR}/bch/src/bch_syndrome.c"
    "${ROOT_DIR}/bch/src/bch_bm.c"
    "${ROOT_DIR}/bch/src/bch_chien.c"
    "${ROOT_DIR}/bch/src/bch_decode.c"
    "${ROOT_DIR}/staircase/src/staircase.c"
    "${ROOT_DIR}/staircase/src/staircase_trace.c"
)

BCH_FLAGS=(
    -I"${ROOT_DIR}/bch/include"
    -sEXPORT_NAME=BCHModule
    -sEXPORTED_FUNCTIONS='["_malloc","_free","_bchw_init","_bchw_free","_bchw_get_n","_bchw_get_k","_bchw_get_t","_bchw_get_dg","_bchw_get_g_ptr","_bchw_encode","_bchw_decode","_bchw_encode_trace","_bchw_decode_trace","_bchw_trace_ptr","_bchw_trace_len","_bchw_trace_stride","_bchw_trace_truncated","_bchw_trace_clear"]'
    -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP32","HEAPU32"]'
)

BCH_TEST_FLAGS=(
    -I"${ROOT_DIR}/bch/include"
    -I"${ROOT_DIR}/bch/tests"
    -sEXPORT_NAME=BCHTestsModule
    -sEXPORTED_FUNCTIONS='["_bcht_run_test_gf","_bcht_run_test_encode","_bcht_run_test_decode"]'
)

PRODUCT_FLAGS=(
    -I"${ROOT_DIR}/bch/include"
    -I"${ROOT_DIR}/product/include"
    -sEXPORT_NAME=ProductModule
    -sEXPORTED_FUNCTIONS='["_malloc","_free","_pw_init","_pw_free","_pw_get_row_n","_pw_get_row_k","_pw_get_row_t","_pw_get_row_dg","_pw_get_col_n","_pw_get_col_k","_pw_get_col_t","_pw_get_col_dg","_pw_get_info_rows","_pw_get_info_cols","_pw_get_code_rows","_pw_get_code_cols","_pw_get_msg_bits","_pw_get_cw_bits","_pw_encode","_pw_extract_message","_pw_decode","_pw_encode_trace","_pw_decode_trace","_pw_trace_ptr","_pw_trace_len","_pw_trace_stride","_pw_trace_truncated","_pw_trace_clear","_pw_decode_stats_ptr"]'
    -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP32","HEAPU32"]'
)

PRODUCT_TEST_FLAGS=(
    -I"${ROOT_DIR}/bch/include"
    -I"${ROOT_DIR}/product/include"
    -I"${ROOT_DIR}/product/tests"
    -sEXPORT_NAME=ProductTestsModule
    -sEXPORTED_FUNCTIONS='["_pct_run_test_product_encode","_pct_run_test_product_decode"]'
)

STAIRCASE_FLAGS=(
    -I"${ROOT_DIR}/bch/include"
    -I"${ROOT_DIR}/staircase/include"
    -sEXPORT_NAME=StaircaseModule
    -sEXPORTED_FUNCTIONS='["_malloc","_free","_sw_init","_sw_free","_sw_get_component_n","_sw_get_component_k","_sw_get_component_dg","_sw_get_block_size","_sw_get_info_cols","_sw_get_parity_cols","_sw_get_data_blocks","_sw_get_total_blocks","_sw_get_msg_bits","_sw_get_state_bits","_sw_get_stored_bits","_sw_encode","_sw_extract_message","_sw_extract_stored","_sw_import_stored","_sw_decode","_sw_encode_trace","_sw_decode_trace","_sw_validate","_sw_trace_ptr","_sw_trace_len","_sw_trace_stride","_sw_trace_truncated","_sw_trace_clear","_sw_decode_stats_ptr"]'
    -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP32","HEAPU32"]'
)

STAIRCASE_TEST_FLAGS=(
    -I"${ROOT_DIR}/bch/include"
    -I"${ROOT_DIR}/staircase/include"
    -I"${ROOT_DIR}/staircase/tests"
    -sEXPORT_NAME=StaircaseTestsModule
    -sEXPORTED_FUNCTIONS='["_sct_run_test_staircase_encode","_sct_run_test_staircase_decode"]'
)

echo "Building BCH WASM module..."
run_emcc "${OUT_DIR}/bch.js" \
    "${BCH_CORE_SRC[@]}" \
    "${ROOT_DIR}/bch/src/bch_wasm.c" \
    "${COMMON_FLAGS[@]}" \
    "${BCH_FLAGS[@]}"
echo "  ${OUT_DIR}/bch.js"
echo "  ${OUT_DIR}/bch.wasm"

echo "Building BCH browser test module..."
run_emcc "${OUT_DIR}/bch_tests.js" \
    "${BCH_CORE_SRC[@]}" \
    "${ROOT_DIR}/bch/tests/wasm_test_gf.c" \
    "${ROOT_DIR}/bch/tests/wasm_test_encode.c" \
    "${ROOT_DIR}/bch/tests/wasm_test_decode.c" \
    "${COMMON_FLAGS[@]}" \
    "${BCH_TEST_FLAGS[@]}"
echo "  ${OUT_DIR}/bch_tests.js"
echo "  ${OUT_DIR}/bch_tests.wasm"

echo "Building product-code WASM module..."
run_emcc "${OUT_DIR}/product.js" \
    "${PRODUCT_CORE_SRC[@]}" \
    "${ROOT_DIR}/product/src/product_wasm.c" \
    "${COMMON_FLAGS[@]}" \
    "${PRODUCT_FLAGS[@]}"
echo "  ${OUT_DIR}/product.js"
echo "  ${OUT_DIR}/product.wasm"

echo "Building product-code browser test module..."
run_emcc "${OUT_DIR}/product_tests.js" \
    "${PRODUCT_CORE_SRC[@]}" \
    "${ROOT_DIR}/product/tests/wasm_test_product_encode.c" \
    "${ROOT_DIR}/product/tests/wasm_test_product_decode.c" \
    "${COMMON_FLAGS[@]}" \
    "${PRODUCT_TEST_FLAGS[@]}"
echo "  ${OUT_DIR}/product_tests.js"
echo "  ${OUT_DIR}/product_tests.wasm"

echo "Building staircase-code WASM module..."
run_emcc "${OUT_DIR}/staircase.js" \
    "${STAIRCASE_CORE_SRC[@]}" \
    "${ROOT_DIR}/staircase/src/staircase_wasm.c" \
    "${COMMON_FLAGS[@]}" \
    "${STAIRCASE_FLAGS[@]}"
echo "  ${OUT_DIR}/staircase.js"
echo "  ${OUT_DIR}/staircase.wasm"

echo "Building staircase-code browser test module..."
run_emcc "${OUT_DIR}/staircase_tests.js" \
    "${STAIRCASE_CORE_SRC[@]}" \
    "${ROOT_DIR}/staircase/tests/wasm_test_staircase_encode.c" \
    "${ROOT_DIR}/staircase/tests/wasm_test_staircase_decode.c" \
    "${COMMON_FLAGS[@]}" \
    "${STAIRCASE_TEST_FLAGS[@]}"
echo "  ${OUT_DIR}/staircase_tests.js"
echo "  ${OUT_DIR}/staircase_tests.wasm"
