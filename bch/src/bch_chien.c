#include "bch.h"
#include <stddef.h>

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
    return bch_chien_search_ex(bch, lambda_poly, L, err_pos, NULL, NULL);
}

int bch_chien_search_ex(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos, void (*eval_cb)(void *user, int pos, int L, uint16_t x, uint16_t acc), void *user) {
    if (!bch || !lambda_poly || !err_pos || L < 0 || L > bch->t) {
        return -1;
    }

    const int n = bch->n;
    int found = 0;

    if (L == 0) {
        return 0;
    }
    if (L >= 64) {
        return -1; // far beyond any t used here; keeps the scratch arrays fixed-size
    }

    // Incremental Chien search. Evaluating lambda(x) at x = alpha^{-pos} for
    // pos = 0..n-1 is the same polynomial sampled at a geometric sequence, so we
    // keep a running term per coefficient instead of recomputing alpha^{-pos}:
    //
    //   lambda(alpha^{-pos}) = sum_i lambda_i (alpha^{-i})^{pos} = sum_i gamma_i
    //
    // with gamma_i advanced by gamma_i *= alpha^{-i} each step. This drops the
    // search from O(n^2) field multiplies (the old per-position gf_pow_alpha) to
    // O(n*L), with identical roots/output.
    uint16_t step[64];   // step[i] = alpha^{-i}
    uint16_t gamma[64];  // gamma[i] = lambda_i * (alpha^{-i})^{pos}
    const uint16_t a_inv = gf_pow_alpha(&bch->gf, -1); // alpha^{-1}, computed once
    uint16_t s = 1u;
    for (int i = 0; i <= L; i++) {
        step[i] = s;
        gamma[i] = lambda_poly[i];
        s = gf_mul(&bch->gf, s, a_inv);
    }
    uint16_t x = 1u; // alpha^{-pos}, maintained only for the trace hook

    for (int pos = 0; pos < n; pos++) {
        uint16_t acc = 0u;
        for (int i = 0; i <= L; i++) {
            acc ^= gamma[i];
        }

        if (eval_cb) {
            eval_cb(user, pos, L, x, acc);
        }

        if (acc == 0u) {
            if (found >= L) {
                return -1;
            }
            err_pos[found++] = pos;
        }

        // Advance every term to the next position (gamma[0] is multiplied by 1).
        for (int i = 1; i <= L; i++) {
            gamma[i] = gf_mul(&bch->gf, gamma[i], step[i]);
        }
        x = gf_mul(&bch->gf, x, a_inv);
    }

    if (found != L) {
        return -1;
    }

    return found;
}
