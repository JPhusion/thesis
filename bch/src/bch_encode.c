#include "bch.h"
#include <stdlib.h>
#include <string.h>

// One LFSR step for polynomial division by monic g(x) of degree dg.
// reg[j] stores coefficient of x^j in current remainder, j in [0..dg-1].
static void lfsr_step(const uint8_t *g, int dg, uint8_t *reg, uint8_t in_bit) {
    const uint8_t top = reg[dg - 1] & 1u;

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

void bch_encode_systematic(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw) {
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
        return;
    }

    // Hardware-style division:
    // feed message bits high->low, then feed dg zeros to realize x^dg m(x) / g(x).
    uint8_t *reg = (uint8_t *)calloc((size_t)dg, 1);
    if (!reg) {
        return;
    }

    for (int i = k - 1; i >= 0; i--) {
        lfsr_step(g, dg, reg, msg[i] & 1u);
    }
    for (int z = 0; z < dg; z++) {
        lfsr_step(g, dg, reg, 0u);
    }

    // reg now holds remainder coefficients (low->high degree).
    for (int j = 0; j < dg; j++) {
        cw[j] = reg[j] & 1u;
    }

    free(reg);
}
