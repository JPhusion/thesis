#include "bch.h"
#include <stdlib.h>

int bch_decode_ex(bch_ctx_t *bch, uint8_t *rx, int *out_errs, const bch_decode_hooks_t *hooks) {
    if (!bch || !rx || !out_errs) {
        return -1;
    }

    const int t = bch->t;
    const int ns = 2 * t;
    *out_errs = 0;
    void *user = hooks ? hooks->user : NULL;

    if (hooks && hooks->stage_begin) {
        hooks->stage_begin(user, bch->n, bch->k, bch->t, bch->dg);
    }

    uint16_t *S = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *lambda_poly = (uint16_t *)calloc((size_t)(t + 1), sizeof(uint16_t));
    int *err_pos = (int *)calloc((size_t)t, sizeof(int));
    if (!S || !lambda_poly || !err_pos) {
        free(S);
        free(lambda_poly);
        free(err_pos);
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1, 0, 0u);
        }
        return -1;
    }

    bch_compute_syndromes(bch, rx, S);
    if (hooks && hooks->syndrome) {
        for (int i = 1; i <= ns; i++) {
            hooks->syndrome(user, i, S[i]);
        }
    }

    int all_zero = 1;
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            all_zero = 0;
            break;
        }
    }
    if (all_zero) {
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, 0, 0, 0u);
        }
        free(S);
        free(lambda_poly);
        free(err_pos);
        return 0;
    }

    int L = 0;
    if (bch_berlekamp_massey_ex(bch, S, lambda_poly, &L, hooks ? hooks->bm_hooks : NULL, user) != 0) {
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1, 0, 0u);
        }
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    int found = bch_chien_search_ex(bch, lambda_poly, L, err_pos, hooks ? hooks->chien_eval : NULL, user);
    if (found < 0) {
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1, 0, 0u);
        }
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    for (int i = 0; i < found; i++) {
        int p = err_pos[i];
        if (p < 0 || p >= bch->n) {
            if (hooks && hooks->stage_end) {
                hooks->stage_end(user, -1, found, 0u);
            }
            free(S);
            free(lambda_poly);
            free(err_pos);
            return -1;
        }
        rx[p] ^= 1u;
        if (hooks && hooks->flip) {
            hooks->flip(user, p, i);
        }
    }

    // Quick check that all the errors have been removed
    bch_compute_syndromes(bch, rx, S);
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            if (hooks && hooks->stage_end) {
                hooks->stage_end(user, -1, found, S[i]);
            }
            free(S);
            free(lambda_poly);
            free(err_pos);
            return -1;
        }
    }

    *out_errs = found;
    if (hooks && hooks->stage_end) {
        hooks->stage_end(user, 0, found, 0u);
    }

    free(S);
    free(lambda_poly);
    free(err_pos);
    return 0;
}

int bch_decode(bch_ctx_t *bch, uint8_t *rx, int *out_errs) {
    return bch_decode_ex(bch, rx, out_errs, NULL);
}
