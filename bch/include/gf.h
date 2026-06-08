#ifndef GF_H
#define GF_H

#include <stdint.h>

typedef struct {
    int m;              // field degree
    uint32_t prim_poly; // primitive/irreducible polynomial bits (includes x^m term)

    // Log/antilog lookup tables (built by gf_build_tables, freed by gf_free_tables).
    // exp has length 2*n so exp[log[a]+log[b]] needs no modulo; log has length n+1.
    // When tables are present, gf_mul/gf_inv/gf_div are O(1) lookups; when NULL
    // they fall back to the bit-serial reference implementation.
    int n;              // 2^m - 1
    uint16_t *exp;      // exp[i] = alpha^(i mod n), i in [0, 2n-2]
    uint16_t *logt;     // logt[x] = discrete log of x (x != 0)
} gf_ctx_t;

static inline uint16_t gf_add(uint16_t a, uint16_t b) { return (uint16_t)(a ^ b); }
static inline uint16_t gf_sub(uint16_t a, uint16_t b) { return (uint16_t)(a ^ b); }

int  gf_build_tables(gf_ctx_t *ctx); // fills exp/logt from m,prim_poly; 0 on success
void gf_free_tables(gf_ctx_t *ctx);

uint16_t gf_mul(const gf_ctx_t *ctx, uint16_t a, uint16_t b);
uint16_t gf_div(const gf_ctx_t *ctx, uint16_t a, uint16_t b);
uint16_t gf_inv(const gf_ctx_t *ctx, uint16_t a);

#endif
