#include "gf.h"

uint16_t gf_mul(const gf_ctx_t *ctx, uint16_t a, uint16_t b) {
    const uint32_t top_bit = (uint32_t)1u << ctx->m;      // x^m
    const uint32_t field_mask = top_bit - 1u;             // keep degrees [0..m-1]
    uint32_t aa = (uint32_t)a & field_mask;
    uint32_t bb = (uint32_t)b & field_mask;
    uint32_t r = 0;

    while (bb != 0u) {
        if (bb & 1u) {
            r ^= aa;
        }

        bb >>= 1;
        aa <<= 1;

        // If x^m appears, reduce by primitive polynomial.
        if (aa & top_bit) {
            aa ^= ctx->prim_poly;
        }
    }

    return (uint16_t)(r & field_mask);
}

uint16_t gf_inv(const gf_ctx_t *ctx, uint16_t a) {
    const uint32_t top_bit = (uint32_t)1u << ctx->m;
    const uint32_t field_mask = top_bit - 1u;
    const uint16_t aa = (uint16_t)((uint32_t)a & field_mask);

    if (aa == 0u) {
        return 0;
    }

    for (uint16_t cand = 1; cand <= field_mask; cand++) {
        if (gf_mul(ctx, aa, cand) == 1u) {
            return cand;
        }
    }

    // If we get here, something has gone very wrong...
    return 0;
}

uint16_t gf_div(const gf_ctx_t *ctx, uint16_t a, uint16_t b) {
    uint16_t inv_b = gf_inv(ctx, b);
    if (inv_b == 0u) {
        return 0;
    }
    return gf_mul(ctx, a, inv_b);
}
