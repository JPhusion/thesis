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
int  bch_decode(bch_ctx_t *bch, uint8_t *rx, int *out_errs);

// Decoder stage APIs (also used by web/WASM wrappers).
void bch_compute_syndromes(const bch_ctx_t *bch, const uint8_t *rx, uint16_t *S);
int  bch_berlekamp_massey(const bch_ctx_t *bch, const uint16_t *S, uint16_t *lambda_poly, int *out_L);
int  bch_chien_search(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos);

#endif
