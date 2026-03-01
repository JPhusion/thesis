#include "bch.h"
#include <string.h>

// Build a bitmask from g[] where g[j]=1 sets bit j (degree j).
// Requires dg <= 15 for uint16_t mask (fine for BCH(15,7,2) stage).
static uint16_t gen_mask_from_g(const uint8_t *g, int dg) {
    uint16_t mask = 0;
    for (int j = 0; j <= dg; j++) {
        if (g[j] & 1) {
            mask |= (uint16_t)(1u << j);
        }
    }
    return mask;
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

    // Compute remainder of x^dg m(x) / g(x) by streaming bits (polynomial division)
    // We must feed bits from highest degree down to lowest: m_{k-1} ... m_0
    uint16_t reg = 0;
    const uint16_t g_mask = gen_mask_from_g(g, dg);
    const uint16_t top_bit = (uint16_t)(1u << dg); // bit representing x^dg

    for (int i = k - 1; i >= 0; i--) {
        uint16_t mbit = (uint16_t)(msg[i] & 1u);

        // Multiply current remainder by x, then add next message bit
        reg = (uint16_t)((reg << 1) | mbit);

        // If degree reached dg, subtract (XOR) generator to reduce
        if (reg & top_bit) {
            reg ^= g_mask;
        }
    }

    // reg now holds remainder (degree < dg) in its low dg bits.
    // Write it into parity positions cw[0..dg-1]
    for (int j = 0; j < dg; j++) {
        cw[j] = (uint8_t)((reg >> j) & 1u);
    }
}
