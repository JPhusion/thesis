#include "bch.h"
#include <stdlib.h>

void bch_compute_syndromes(const bch_ctx_t *bch, const uint8_t *rx, uint16_t *S);
int bch_berlekamp_massey(const bch_ctx_t *bch, const uint16_t *S, uint16_t *lambda_poly, int *out_L);
int bch_chien_search(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos);

int bch_decode(bch_ctx_t *bch, uint8_t *rx, int *out_errs) {
    if (!bch || !rx || !out_errs) {
        return -1;
    }

    const int t = bch->t;
    const int ns = 2 * t;
    *out_errs = 0;

    uint16_t *S = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *lambda_poly = (uint16_t *)calloc((size_t)(t + 1), sizeof(uint16_t));
    int *err_pos = (int *)calloc((size_t)t, sizeof(int));
    if (!S || !lambda_poly || !err_pos) {
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    bch_compute_syndromes(bch, rx, S);

    int all_zero = 1;
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            all_zero = 0;
            break;
        }
    }
    if (all_zero) {
        free(S);
        free(lambda_poly);
        free(err_pos);
        return 0;
    }

    int L = 0;
    if (bch_berlekamp_massey(bch, S, lambda_poly, &L) != 0) {
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    int found = bch_chien_search(bch, lambda_poly, L, err_pos);
    if (found < 0) {
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    for (int i = 0; i < found; i++) {
        int p = err_pos[i];
        if (p < 0 || p >= bch->n) {
            free(S);
            free(lambda_poly);
            free(err_pos);
            return -1;
        }
        rx[p] ^= 1u;
    }

    // Quick check that all the errors have been removed
    bch_compute_syndromes(bch, rx, S);
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            free(S);
            free(lambda_poly);
            free(err_pos);
            return -1;
        }
    }

    *out_errs = found;

    free(S);
    free(lambda_poly);
    free(err_pos);
    return 0;
}
