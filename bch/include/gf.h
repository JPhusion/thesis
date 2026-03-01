#ifndef GF_H
#define GF_H

#include <stdint.h>

typedef struct {
    int m;              // field degree
    uint32_t prim_poly; // primitive/irreducible polynomial bits (includes x^m term)
} gf_ctx_t;

static inline uint16_t gf_add(uint16_t a, uint16_t b) { return (uint16_t)(a ^ b); }
static inline uint16_t gf_sub(uint16_t a, uint16_t b) { return (uint16_t)(a ^ b); }

uint16_t gf_mul(const gf_ctx_t *ctx, uint16_t a, uint16_t b);
uint16_t gf_div(const gf_ctx_t *ctx, uint16_t a, uint16_t b); // later
uint16_t gf_inv(const gf_ctx_t *ctx, uint16_t a);             // later

#endif
