#include "bch.h"
#include <stdlib.h>
#include <string.h>

// One LFSR step for polynomial division by monic g(x) of degree dg.
// reg[j] stores coefficient of x^j in current remainder, j in [0..dg-1].
static void lfsr_step(const uint8_t *g, int dg, uint8_t *reg, uint8_t in_bit, uint8_t *out_top) {
    const uint8_t top = reg[dg - 1] & 1u;
    if (out_top) {
        *out_top = top;
    }

    for (int j = dg - 1; j > 0; j--) {
        reg[j] = reg[j - 1] & 1u;
    }
    reg[0] = in_bit & 1u;

    if (top) {
        for (int j = 0; j < dg; j++) {
            if (g[j] & 1u) {
                reg[j] ^= 1u;
            }
        }
    }
}

int bch_encode_systematic_ex(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw, bch_encode_step_cb_t step_cb, void *user) {
    if (!bch || !msg || !cw || !bch->g || bch->n <= 0 || bch->k < 0 || bch->dg < 0) {
        return -1;
    }

    const int n  = bch->n;
    const int k  = bch->k;
    const int dg = bch->dg;
    const uint8_t *g = bch->g;

    // Start codeword with message in the high part (systematic form)
    memset(cw, 0, (size_t)n);
    for (int i = 0; i < k; i++) {
        cw[dg + i] = msg[i] & 1;     // msg[0] -> x^0, placed at x^dg
    }

    if (dg <= 0) {
        return 0;
    }

    // Hardware-style division:
    // feed message bits high->low, then feed dg zeros to realize x^dg m(x) / g(x).
    uint8_t *reg = (uint8_t *)calloc((size_t)dg, 1);
    if (!reg) {
        return -1;
    }

    int step = 0;
    for (int i = k - 1; i >= 0; i--) {
        uint8_t top = 0u;
        uint8_t in_bit = msg[i] & 1u;
        lfsr_step(g, dg, reg, in_bit, &top);
        if (step_cb) {
            step_cb(user, step, in_bit, top, reg, dg);
        }
        step++;
    }
    for (int z = 0; z < dg; z++) {
        uint8_t top = 0u;
        lfsr_step(g, dg, reg, 0u, &top);
        if (step_cb) {
            step_cb(user, step, 0u, top, reg, dg);
        }
        step++;
    }

    // reg now holds remainder coefficients (low->high degree).
    for (int j = 0; j < dg; j++) {
        cw[j] = reg[j] & 1u;
    }

    free(reg);
    return 0;
}

void bch_encode_systematic(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw) {
    (void)bch_encode_systematic_ex(bch, msg, cw, NULL, NULL);
}
