#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_PATH="${1:-${ROOT_DIR}/site/tests/vectors.json}"
TMP_C="$(mktemp /tmp/bch_vectors_XXXXXX.c)"
TMP_BIN="$(mktemp /tmp/bch_vectors_bin_XXXXXX)"

cleanup() {
    rm -f "${TMP_C}" "${TMP_BIN}"
}
trap cleanup EXIT

cat > "${TMP_C}" <<'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include "bch.h"

typedef struct {
    const char *name;
    int m;
    uint32_t prim_poly;
    int t;
} cfg_t;

static const cfg_t CFGS[] = {
    {"BCH(7,4,1)", 3, 0b1011u, 1},
    {"BCH(15,7,2)", 4, 0b10011u, 2},
    {"BCH(31,21,2)", 5, 0b100101u, 2},
};

static const char *MSGS[] = {"0", "1", "101", "1100101", "1001100110011001"};

static const int ERRS[][3] = {
    {-1, -1, -1},
    {0, -1, -1},
    {1, 3, -1},
    {0, 2, 4},
};

static void msb_to_lsb_fixed(const char *src, uint8_t *dst, int k) {
    memset(dst, 0, (size_t)k);
    int len = (int)strlen(src);
    for (int i = 0; i < k; i++) {
        int src_idx = len - 1 - i;
        char ch = (src_idx >= 0) ? src[src_idx] : '0';
        dst[i] = (ch == '1') ? 1u : 0u;
    }
}

static void print_bits_msb(const uint8_t *v, int n) {
    for (int i = n - 1; i >= 0; i--) putchar(v[i] ? '1' : '0');
}

int main(void) {
    printf("{\n  \"configs\": [\n");

    for (size_t ci = 0; ci < sizeof(CFGS) / sizeof(CFGS[0]); ci++) {
        bch_ctx_t bch;
        if (bch_init(&bch, CFGS[ci].m, CFGS[ci].prim_poly, CFGS[ci].t) != 0) {
            fprintf(stderr, "bch_init failed for cfg %zu\n", ci);
            return 1;
        }

        uint8_t *msg = (uint8_t *)calloc((size_t)bch.k, 1);
        uint8_t *cw = (uint8_t *)calloc((size_t)bch.n, 1);
        uint8_t *rx = (uint8_t *)calloc((size_t)bch.n, 1);
        if (!msg || !cw || !rx) return 1;

        printf("    {\n");
        printf("      \"name\": \"%s\",\n", CFGS[ci].name);
        printf("      \"m\": %d,\n", CFGS[ci].m);
        printf("      \"prim_poly\": %u,\n", CFGS[ci].prim_poly);
        printf("      \"t\": %d,\n", CFGS[ci].t);
        printf("      \"n\": %d,\n", bch.n);
        printf("      \"k\": %d,\n", bch.k);
        printf("      \"cases\": [\n");

        int first_case = 1;
        for (size_t mi = 0; mi < sizeof(MSGS) / sizeof(MSGS[0]); mi++) {
            msb_to_lsb_fixed(MSGS[mi], msg, bch.k);
            bch_encode_systematic(&bch, msg, cw);

            for (size_t ei = 0; ei < sizeof(ERRS) / sizeof(ERRS[0]); ei++) {
                memcpy(rx, cw, (size_t)bch.n);
                int injected = 0;
                for (int p = 0; p < 3; p++) {
                    int pos = ERRS[ei][p];
                    if (pos < 0) continue;
                    if (pos >= bch.n) continue;
                    rx[pos] ^= 1u;
                    injected++;
                }

                int out_errs = 0;
                int rc = bch_decode(&bch, rx, &out_errs);

                if (!first_case) printf(",\n");
                first_case = 0;
                printf("        {\n");
                printf("          \"msg_msb\": \"");
                print_bits_msb(msg, bch.k);
                printf("\",\n");
                printf("          \"errors\": [");
                int first_err = 1;
                for (int p = 0; p < 3; p++) {
                    int pos = ERRS[ei][p];
                    if (pos < 0 || pos >= bch.n) continue;
                    if (!first_err) printf(", ");
                    printf("%d", pos);
                    first_err = 0;
                }
                printf("],\n");
                printf("          \"cw_msb\": \"");
                print_bits_msb(cw, bch.n);
                printf("\",\n");
                printf("          \"corrected_msb\": \"");
                print_bits_msb(rx, bch.n);
                printf("\",\n");
                printf("          \"rc\": %d,\n", rc);
                printf("          \"out_errs\": %d,\n", out_errs);
                printf("          \"injected\": %d\n", injected);
                printf("        }");
            }
        }

        printf("\n      ]\n");
        printf("    }%s\n", (ci + 1 == sizeof(CFGS) / sizeof(CFGS[0])) ? "" : ",");

        free(msg);
        free(cw);
        free(rx);
        bch_free(&bch);
    }

    printf("  ]\n}\n");
    return 0;
}
EOF

cc -std=c11 -O2 -Wall -Wextra -I"${ROOT_DIR}/bch/include" \
  "${TMP_C}" \
  "${ROOT_DIR}/bch/src/gf.c" \
  "${ROOT_DIR}/bch/src/bch_gen.c" \
  "${ROOT_DIR}/bch/src/bch_encode.c" \
  "${ROOT_DIR}/bch/src/bch_trace.c" \
  "${ROOT_DIR}/bch/src/bch_syndrome.c" \
  "${ROOT_DIR}/bch/src/bch_bm.c" \
  "${ROOT_DIR}/bch/src/bch_chien.c" \
  "${ROOT_DIR}/bch/src/bch_decode.c" \
  -o "${TMP_BIN}"

mkdir -p "$(dirname "${OUT_PATH}")"
"${TMP_BIN}" > "${OUT_PATH}"
echo "Generated vectors at ${OUT_PATH}"
