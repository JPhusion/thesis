#include "bch.h"
#include <stdlib.h>
#include <string.h>

int bch_init(bch_ctx_t *bch, int m, uint32_t prim_poly, int t) {
    memset(bch, 0, sizeof(*bch));
    bch->m = m;
    bch->t = t;
    bch->n = (1 << m) - 1;
    bch->prim_poly = prim_poly;
    bch->gf.m = m;
    bch->gf.prim_poly = prim_poly;

    // TODO: build generator polynomial g(x) for BCH(t)
    // For now: placeholder g(x)=1 (deg 0) so k=n (not a real BCH yet)
    bch->dg = 8;
    bch->k = bch->n - bch->dg;
    bch->g = (uint8_t*)calloc((size_t)(bch->dg + 1), 1);
    if (!bch->g) return -1;

    bch->g[0] = 1;
    bch->g[4] = 1;
    bch->g[6] = 1;
    bch->g[7] = 1;
    bch->g[8] = 1;
    return 0;
}

void bch_free(bch_ctx_t *bch) {
    free(bch->g);
    bch->g = NULL;
}
