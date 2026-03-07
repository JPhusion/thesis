#include "bch.h"
#include <stdlib.h>
#include <string.h>

int bch_init(bch_ctx_t *bch, int m, uint32_t prim_poly, int t) {
    memset(bch, 0, sizeof(*bch));

    if (m <= 1 || m >= 16 || t <= 0) {
        return -1;
    }

    bch->m = m;
    bch->t = t;
    bch->n = (1 << m) - 1;
    bch->prim_poly = prim_poly;
    bch->gf.m = m;
    bch->gf.prim_poly = prim_poly;

    // Sanity check: if 2t >= n, we can't have a valid code.
    if (2 * t >= bch->n) {
        return -1;
    }

    uint16_t *alpha_pow = (uint16_t *)calloc((size_t)bch->n, sizeof(uint16_t));
    uint8_t *in_union = (uint8_t *)calloc((size_t)bch->n, 1);
    uint16_t *poly = (uint16_t *)calloc((size_t)(bch->n + 1), sizeof(uint16_t));
    uint16_t *tmp = (uint16_t *)calloc((size_t)(bch->n + 1), sizeof(uint16_t));
    if (!alpha_pow || !in_union || !poly || !tmp) {
        free(alpha_pow);
        free(in_union);
        free(poly);
        free(tmp);
        return -1;
    }

    alpha_pow[0] = 1u;
    for (int e = 1; e < bch->n; e++) {
        alpha_pow[e] = gf_mul(&bch->gf, alpha_pow[e - 1], 0x2u);
    }

    for (int i = 1; i <= 2 * t; i++) {
        int e = i % bch->n;
        while (!in_union[e]) {
            in_union[e] = 1;
            e = (2 * e) % bch->n;
        }
    }

    int dg = 0;
    poly[0] = 1u;

    for (int e = 1; e < bch->n; e++) {
        if (!in_union[e]) {
            continue;
        }

        const uint16_t root = alpha_pow[e];
        memset(tmp, 0, (size_t)(bch->n + 1) * sizeof(uint16_t));

        for (int k = 0; k <= dg; k++) {
            tmp[k] ^= gf_mul(&bch->gf, poly[k], root);
            tmp[k + 1] ^= poly[k];
        }

        memcpy(poly, tmp, (size_t)(bch->n + 1) * sizeof(uint16_t));
        dg++;
    }

    bch->g = (uint8_t *)calloc((size_t)(dg + 1), 1);
    if (!bch->g) {
        free(alpha_pow);
        free(in_union);
        free(poly);
        free(tmp);
        return -1;
    }

    for (int j = 0; j <= dg; j++) {
        if (!(poly[j] == 0u || poly[j] == 1u)) {
            free(alpha_pow);
            free(in_union);
            free(poly);
            free(tmp);
            bch_free(bch);
            return -1;
        }
        bch->g[j] = (uint8_t)poly[j];
    }

    bch->dg = dg;
    bch->k = bch->n - dg;

    free(alpha_pow);
    free(in_union);
    free(poly);
    free(tmp);

    return 0;
}

void bch_free(bch_ctx_t *bch) {
    free(bch->g);
    bch->g = NULL;
}
