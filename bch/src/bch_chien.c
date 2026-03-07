#include "bch.h"

static uint16_t gf_pow_alpha(const gf_ctx_t *gf, int e) {
    const int n = (1 << gf->m) - 1;
    int ee = e % n;
    if (ee < 0) {
        ee += n;
    }

    uint16_t r = 1u;
    for (int i = 0; i < ee; i++) {
        r = gf_mul(gf, r, 0x2u); // alpha = x
    }
    return r;
}

int bch_chien_search(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos) {
    if (!bch || !lambda_poly || !err_pos || L < 0 || L > bch->t) {
        return -1;
    }

    const int n = bch->n;
    int found = 0;

    if (L == 0) {
        return 0;
    }

    for (int pos = 0; pos < n; pos++) {
        const uint16_t x = gf_pow_alpha(&bch->gf, -pos); // x = alpha^{-pos}
        uint16_t acc = 0u;

        // Horner evaluation of lambda_poly(x) from highest degree down.
        for (int i = L; i >= 0; i--) {
            acc = gf_mul(&bch->gf, acc, x);
            acc ^= lambda_poly[i];
        }

        if (acc == 0u) {
            if (found >= L) {
                return -1;
            }
            err_pos[found++] = pos;
        }
    }

    if (found != L) {
        return -1;
    }

    return found;
}
