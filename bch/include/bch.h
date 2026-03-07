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

typedef void (*bch_encode_step_cb_t)(void *user, int step, uint8_t in_bit, uint8_t top, const uint8_t *reg, int reg_len);

void bch_encode_systematic(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw);
int  bch_encode_systematic_ex(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw, bch_encode_step_cb_t step_cb, void *user);
int  bch_decode(bch_ctx_t *bch, uint8_t *rx, int *out_errs);

typedef struct {
    void (*iter_begin)(void *user, int n, int L, int m, uint16_t b, uint16_t d_init);
    void (*term)(void *user, int n, int i, uint16_t C_i, uint16_t S_term, uint16_t prod, uint16_t d_after);
    void (*iter_end)(void *user, int n, int L, int m, uint16_t b, uint16_t d, const uint16_t *C, const uint16_t *B, const uint16_t *T, int ns);
    void (*update)(void *user, int n, int old_L, int new_L, int m, uint16_t b, uint16_t scale);
} bch_bm_hooks_t;

typedef struct {
    void (*stage_begin)(void *user, int n, int k, int t, int dg);
    void (*syndrome)(void *user, int idx, uint16_t value);
    const bch_bm_hooks_t *bm_hooks;
    void (*chien_eval)(void *user, int pos, int L, uint16_t x, uint16_t acc);
    void (*flip)(void *user, int pos, int ordinal);
    void (*stage_end)(void *user, int rc, int errs, uint16_t detail);
    void *user;
} bch_decode_hooks_t;

int  bch_decode_ex(bch_ctx_t *bch, uint8_t *rx, int *out_errs, const bch_decode_hooks_t *hooks);

// Decoder stage APIs (also used by web/WASM wrappers).
void bch_compute_syndromes(const bch_ctx_t *bch, const uint8_t *rx, uint16_t *S);
int  bch_berlekamp_massey(const bch_ctx_t *bch, const uint16_t *S, uint16_t *lambda_poly, int *out_L);
int  bch_berlekamp_massey_ex(const bch_ctx_t *bch, const uint16_t *S, uint16_t *lambda_poly, int *out_L, const bch_bm_hooks_t *hooks, void *user);
int  bch_chien_search(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos);
int  bch_chien_search_ex(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos, void (*eval_cb)(void *user, int pos, int L, uint16_t x, uint16_t acc), void *user);

#endif
