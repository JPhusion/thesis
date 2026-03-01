#ifndef BCH_H
#define BCH_H

#include <stdint.h>
#include "gf.h"

typedef struct {
    int m;
    int t;
    int n;          // 2^m - 1 (primitive BCH)
    int k;          // n - deg(g)
    int dg;         // deg(g)
    uint32_t prim_poly;

    // generator polynomial over GF(2), coefficients low->high degree
    // allocated by bch_init, freed by bch_free
    uint8_t *g;

    gf_ctx_t gf;
} bch_ctx_t;

int  bch_init(bch_ctx_t *bch, int m, uint32_t prim_poly, int t);
void bch_free(bch_ctx_t *bch);

void bch_encode_systematic(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw);
int  bch_decode(bch_ctx_t *bch, uint8_t *rx, int *out_errs); // later

#endif
