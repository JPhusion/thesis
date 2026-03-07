#include "bch.h"

static uint16_t gf_pow_alpha(const gf_ctx_t *gf, int e) {
    uint16_t r = 1u;
    for (int i = 0; i < e; i++) {
        r = gf_mul(gf, r, 0x2u); // alpha = x
    }
    return r;
}

void bch_compute_syndromes(const bch_ctx_t *bch, const uint8_t *rx, uint16_t *S) {
    const int n = bch->n;
    const int ns = 2 * bch->t;

    S[0] = 0u;
    for (int i = 1; i <= ns; i++) {
        const uint16_t alpha_i = gf_pow_alpha(&bch->gf, i);
        uint16_t acc = 0u;

        // Horner form: multiply current value by x, then add next coefficient
        // evaluate r(x) = sum_j rx[j] x^j at x = alpha^i
        for (int j = n - 1; j >= 0; j--) {
            acc = gf_mul(&bch->gf, acc, alpha_i);
            if (rx[j] & 1u) {
                acc ^= 1u;
            }
        }

        S[i] = acc;
    }
}
