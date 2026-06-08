/* profile_decode.c — micro-benchmark for the BCH decode hot path.
 *
 * Measures, per code (BCH(255,231,3) and BCH(511,484,3)):
 *   - ns/op of each decode stage (syndromes, Berlekamp-Massey, Chien) and a full decode
 *   - ns/op of the GF primitives gf_mul and gf_inv in isolation
 *   - full-decode ns/op as a function of injected error weight (0..t and uncorrectable)
 * and, when built with -DGF_PROFILE, the gf_mul / gf_inv call counts per op.
 *
 * Each measurement auto-scales its iteration count to ~TARGET_S seconds of wall
 * time, so cheap ops (gf_mul) and expensive ops (a 511 Chien decode) both get a
 * stable estimate without hard-coding rep counts.
 *
 * Build (timing):  cc -std=c11 -O2 -Ibch/include -o profile_timed  bch/apps/profile_decode.c bch/src/{gf,bch_gen,bch_encode,bch_syndrome,bch_bm,bch_chien,bch_decode}.c -lm
 * Build (counts):  add -DGF_PROFILE -o profile_counts
 * Output CSV (argv[1] or stdout): code,category,item,ns_per_op,gf_mul,gf_inv
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "bch.h"

#ifdef GF_PROFILE
extern unsigned long long gf_mul_count;
extern unsigned long long gf_inv_count;
#define HAVE_COUNTS 1
#else
static unsigned long long gf_mul_count = 0ull;
static unsigned long long gf_inv_count = 0ull;
#define HAVE_COUNTS 0
#endif

#define TARGET_S 0.25
#define MIN_REPS 8

static uint64_t sm_state = 0x123456789abcdef0ULL;
static uint64_t sm_next(void) {
    uint64_t z = (sm_state += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}
static double now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1e9 + (double)ts.tv_nsec;
}

/* Run `stmt` until ~TARGET_S elapsed; write ns/iteration into out_ns. */
#define TIME_BLOCK(stmt, out_ns)                                       \
    do {                                                               \
        long _r = 0; double _t0 = now_ns(), _el = 0.0;                 \
        do { stmt; _r++; _el = now_ns() - _t0; }                       \
        while (_el < TARGET_S * 1e9 || _r < MIN_REPS);                 \
        (out_ns) = _el / (double)_r;                                   \
    } while (0)

static void inject(uint8_t *rx, int n, int w) {
    for (int i = 0; i < w; i++) rx[(int)(sm_next() % (uint64_t)n)] ^= 1u;
}

int main(int argc, char **argv) {
    FILE *out = stdout;
    if (argc > 1) { out = fopen(argv[1], "w"); if (!out) { perror("fopen"); return 1; } }
    fprintf(out, "code,category,item,ns_per_op,gf_mul,gf_inv\n");

    struct { const char *name; int m; uint32_t prim; int t; } codes[] = {
        {"BCH(255,231,3)", 8, 0x11d, 3},
        {"BCH(511,484,3)", 9, 0x211, 3},
    };

    volatile int sink = 0;

    for (int c = 0; c < 2; c++) {
        bch_ctx_t bch;
        if (bch_init(&bch, codes[c].m, codes[c].prim, codes[c].t) != 0) {
            fprintf(stderr, "bch_init failed for %s\n", codes[c].name); return 1;
        }
        const int n = bch.n, k = bch.k, t = bch.t;

        uint8_t *msg = calloc((size_t)k, 1), *cw = calloc((size_t)n, 1);
        uint8_t *rx = calloc((size_t)n, 1), *tmpl = calloc((size_t)n, 1);
        uint16_t *S = calloc((size_t)(2 * t + 1), sizeof(uint16_t));
        uint16_t *lambda = calloc((size_t)(t + 1), sizeof(uint16_t));
        int *err_pos = calloc((size_t)t, sizeof(int));
        for (int i = 0; i < k; i++) msg[i] = (uint8_t)(sm_next() & 1u);
        bch_encode_systematic(&bch, msg, cw);

        /* ---- full-decode ns vs error weight (memcpy cost subtracted) ---- */
        int weights[] = {0, 1, 2, 3, t + 3};
        for (int wi = 0; wi < 5; wi++) {
            int w = weights[wi];
            memcpy(tmpl, cw, (size_t)n);
            inject(tmpl, n, w);

            double ns_copy = 0.0, ns_both = 0.0;
            TIME_BLOCK({ memcpy(rx, tmpl, (size_t)n); sink ^= rx[0]; }, ns_copy);
            TIME_BLOCK({ memcpy(rx, tmpl, (size_t)n); int e = 0;
                         sink ^= bch_decode_with_scratch(&bch, rx, &e, S, lambda, err_pos) ^ e; }, ns_both);
            double ns_dec = ns_both - ns_copy; if (ns_dec < 0) ns_dec = ns_both;

            unsigned long long mc = 0, ic = 0;
#if HAVE_COUNTS
            memcpy(rx, tmpl, (size_t)n); int e = 0; gf_mul_count = 0; gf_inv_count = 0;
            bch_decode_with_scratch(&bch, rx, &e, S, lambda, err_pos);
            mc = gf_mul_count; ic = gf_inv_count;
#endif
            char item[24]; snprintf(item, sizeof(item), "weight_%d", w);
            fprintf(out, "\"%s\",decode_by_weight,%s,%.3f,%llu,%llu\n", codes[c].name, item, ns_dec, mc, ic);
        }

        /* representative 3-error received word for stage breakdown */
        memcpy(tmpl, cw, (size_t)n); inject(tmpl, n, 3);

        double ns; unsigned long long mc, ic;

        /* syndromes */
        TIME_BLOCK({ bch_compute_syndromes(&bch, tmpl, S); sink ^= S[1]; }, ns);
        mc = ic = 0;
#if HAVE_COUNTS
        gf_mul_count = 0; gf_inv_count = 0; bch_compute_syndromes(&bch, tmpl, S); mc = gf_mul_count; ic = gf_inv_count;
#endif
        fprintf(out, "\"%s\",stage,syndromes,%.3f,%llu,%llu\n", codes[c].name, ns, mc, ic);

        bch_compute_syndromes(&bch, tmpl, S);
        int L = 0; bch_berlekamp_massey(&bch, S, lambda, &L);

        /* Berlekamp-Massey */
        TIME_BLOCK({ int Lr = 0; bch_berlekamp_massey(&bch, S, lambda, &Lr); sink ^= Lr; }, ns);
        mc = ic = 0;
#if HAVE_COUNTS
        gf_mul_count = 0; gf_inv_count = 0; { int Lr = 0; bch_berlekamp_massey(&bch, S, lambda, &Lr); } mc = gf_mul_count; ic = gf_inv_count;
#endif
        fprintf(out, "\"%s\",stage,berlekamp_massey,%.3f,%llu,%llu\n", codes[c].name, ns, mc, ic);

        /* Chien search */
        TIME_BLOCK({ sink ^= bch_chien_search(&bch, lambda, L, err_pos); }, ns);
        mc = ic = 0;
#if HAVE_COUNTS
        gf_mul_count = 0; gf_inv_count = 0; bch_chien_search(&bch, lambda, L, err_pos); mc = gf_mul_count; ic = gf_inv_count;
#endif
        fprintf(out, "\"%s\",stage,chien_search,%.3f,%llu,%llu\n", codes[c].name, ns, mc, ic);

        /* GF primitives */
        {
            uint16_t acc = 1; long i = 0;
            TIME_BLOCK({ acc = gf_mul(&bch.gf, (uint16_t)(acc | 1u), (uint16_t)(i++ * 2654435761u)); }, ns);
            sink ^= acc;
            fprintf(out, "\"%s\",gf_primitive,gf_mul,%.4f,%d,%d\n", codes[c].name, ns, HAVE_COUNTS, 0);
        }
        {
            uint16_t acc = 0; int field = (1 << bch.m) - 1; long i = 0;
            TIME_BLOCK({ acc ^= gf_inv(&bch.gf, (uint16_t)((i++ % field) + 1)); }, ns);
            sink ^= acc;
            mc = 0;
#if HAVE_COUNTS
            gf_mul_count = 0; (void)gf_inv(&bch.gf, 5); mc = gf_mul_count;
#endif
            fprintf(out, "\"%s\",gf_primitive,gf_inv,%.4f,%llu,%d\n", codes[c].name, ns, mc, HAVE_COUNTS);
        }

        free(msg); free(cw); free(rx); free(tmpl); free(S); free(lambda); free(err_pos);
        bch_free(&bch);
    }
    (void)sink;
    if (out != stdout) fclose(out);
    return 0;
}
