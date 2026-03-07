#include "bch.h"
#include <stdlib.h>
#include <string.h>

// Compute error-locator polynomial Lambda(x), returned in lambda_poly[].
int bch_berlekamp_massey(const bch_ctx_t *bch, const uint16_t *S, uint16_t *lambda_poly, int *out_L) {
    const int t = bch->t;
    const int ns = 2 * t;
    const gf_ctx_t *gf = &bch->gf;

    uint16_t *C = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *B = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *T = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    if (!C || !B || !T) {
        free(C);
        free(B);
        free(T);
        return -1;
    }

    C[0] = 1u;
    B[0] = 1u;

    int L = 0;
    int m = 1;
    uint16_t b = 1u;

    for (int n = 0; n < ns; n++) {
        uint16_t d = S[n + 1];
        for (int i = 1; i <= L; i++) {
            if (C[i] != 0u && S[n + 1 - i] != 0u) {
                d ^= gf_mul(gf, C[i], S[n + 1 - i]);
            }
        }

        if (d == 0u) {
            m++;
            continue;
        }

        memcpy(T, C, (size_t)(ns + 1) * sizeof(uint16_t));
        const uint16_t scale = gf_div(gf, d, b);

        for (int i = 0; i + m <= ns; i++) {
            if (B[i] != 0u) {
                C[i + m] ^= gf_mul(gf, scale, B[i]);
            }
        }

        if (2 * L <= n) {
            L = n + 1 - L;
            memcpy(B, T, (size_t)(ns + 1) * sizeof(uint16_t));
            b = d;
            m = 1;
        } else {
            m++;
        }
    }

    memset(lambda_poly, 0, (size_t)(t + 1) * sizeof(uint16_t));
    for (int i = 0; i <= t && i <= ns; i++) {
        lambda_poly[i] = C[i];
    }

    *out_L = L;

    free(C);
    free(B);
    free(T);

    if (L > t) {
        return -1;
    }
    return 0;
}
