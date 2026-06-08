#include "gf.h"
#include <stdlib.h>

/* Optional, zero-overhead-when-off instrumentation. Define GF_PROFILE at
 * compile time to count field-operation calls (used by apps/profile_decode.c).
 * Normal builds never define it, so these macros compile away to nothing. */
#ifdef GF_PROFILE
unsigned long long gf_mul_count = 0ull;
unsigned long long gf_inv_count = 0ull;
#define GF_PROF_MUL() (gf_mul_count++)
#define GF_PROF_INV() (gf_inv_count++)
#else
#define GF_PROF_MUL() ((void)0)
#define GF_PROF_INV() ((void)0)
#endif

/* Bit-serial reference multiply. Used to build the log/antilog tables, and as a
 * fallback when a context has no tables (e.g. a manually-constructed gf_ctx_t). */
static uint16_t gf_mul_slow(const gf_ctx_t *ctx, uint16_t a, uint16_t b) {
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
        if (aa & top_bit) {
            aa ^= ctx->prim_poly; // reduce when x^m appears
        }
    }
    return (uint16_t)(r & field_mask);
}

int gf_build_tables(gf_ctx_t *ctx) {
    if (!ctx || ctx->m <= 0 || ctx->m >= 16) {
        return -1;
    }
    const int n = (1 << ctx->m) - 1;
    uint16_t *exp = (uint16_t *)malloc(sizeof(uint16_t) * (size_t)(2 * n));
    uint16_t *logt = (uint16_t *)malloc(sizeof(uint16_t) * (size_t)(n + 1));
    if (!exp || !logt) {
        free(exp);
        free(logt);
        return -1;
    }

    uint16_t x = 1u;
    for (int i = 0; i < n; i++) {
        exp[i] = x;          // alpha^i
        logt[x] = (uint16_t)i;
        x = gf_mul_slow(ctx, x, 0x2u);
    }
    for (int i = n; i < 2 * n; i++) {
        exp[i] = exp[i - n];  // wrap so exp[log a + log b] needs no modulo
    }
    logt[0] = 0u;             // unused sentinel; gf_mul handles the 0 operand explicitly

    ctx->n = n;
    ctx->exp = exp;
    ctx->logt = logt;
    return 0;
}

void gf_free_tables(gf_ctx_t *ctx) {
    if (!ctx) {
        return;
    }
    free(ctx->exp);
    free(ctx->logt);
    ctx->exp = NULL;
    ctx->logt = NULL;
    ctx->n = 0;
}

uint16_t gf_mul(const gf_ctx_t *ctx, uint16_t a, uint16_t b) {
    GF_PROF_MUL();
    if (ctx->exp) {
        if (a == 0u || b == 0u) {
            return 0u;
        }
        return ctx->exp[(int)ctx->logt[a] + (int)ctx->logt[b]];
    }
    return gf_mul_slow(ctx, a, b);
}

uint16_t gf_inv(const gf_ctx_t *ctx, uint16_t a) {
    GF_PROF_INV();
    const uint16_t aa = (uint16_t)((uint32_t)a & (((uint32_t)1u << ctx->m) - 1u));
    if (aa == 0u) {
        return 0;
    }
    if (ctx->exp) {
        return ctx->exp[ctx->n - (int)ctx->logt[aa]]; // alpha^(n - log a)
    }
    // Fallback: brute-force search.
    for (uint16_t cand = 1; cand <= (((uint32_t)1u << ctx->m) - 1u); cand++) {
        if (gf_mul_slow(ctx, aa, cand) == 1u) {
            return cand;
        }
    }
    return 0;
}

uint16_t gf_div(const gf_ctx_t *ctx, uint16_t a, uint16_t b) {
    if (ctx->exp) {
        if (a == 0u || b == 0u) {
            return 0u;
        }
        return ctx->exp[(int)ctx->logt[a] + (ctx->n - (int)ctx->logt[b])];
    }
    uint16_t inv_b = gf_inv(ctx, b);
    if (inv_b == 0u) {
        return 0;
    }
    return gf_mul(ctx, a, inv_b);
}
