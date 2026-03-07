#include "bch_trace.h"
#include <stdlib.h>
#include <string.h>

static void trace_append(bch_trace_t *tr, uint32_t kind, int32_t a, int32_t b, uint32_t u0, uint32_t u1, uint32_t u2) {
    if (!tr) {
        return;
    }

    if (tr->len == tr->cap) {
        size_t new_cap = (tr->cap == 0) ? 256u : (tr->cap * 2u);
        bch_trace_event_t *grown = (bch_trace_event_t *)realloc(tr->events, new_cap * sizeof(*grown));
        if (!grown) {
            tr->truncated = 1;
            return;
        }
        tr->events = grown;
        tr->cap = new_cap;
    }

    tr->events[tr->len].kind = kind;
    tr->events[tr->len].a = a;
    tr->events[tr->len].b = b;
    tr->events[tr->len].u0 = u0;
    tr->events[tr->len].u1 = u1;
    tr->events[tr->len].u2 = u2;
    tr->len++;
}

static uint32_t pack_bits32(const uint8_t *v, int nbits) {
    uint32_t out = 0u;
    const int limit = (nbits < 32) ? nbits : 32;
    for (int i = 0; i < limit; i++) {
        if (v[i] & 1u) {
            out |= (uint32_t)1u << i;
        }
    }
    return out;
}

static uint32_t pack_u16_coeffs32(const uint16_t *v, int ncoeff) {
    uint32_t out = 0u;
    const int limit = (ncoeff < 32) ? ncoeff : 32;
    for (int i = 0; i < limit; i++) {
        if (v[i] != 0u) {
            out |= (uint32_t)1u << i;
        }
    }
    return out;
}

static void lfsr_step_trace(const uint8_t *g, int dg, uint8_t *reg, uint8_t in_bit, uint8_t *out_top) {
    const uint8_t top = reg[dg - 1] & 1u;
    if (out_top) {
        *out_top = top;
    }

    for (int j = dg - 1; j > 0; j--) {
        reg[j] = reg[j - 1] & 1u;
    }
    reg[0] = in_bit & 1u;

    if (top) {
        for (int j = 0; j < dg; j++) {
            if (g[j] & 1u) {
                reg[j] ^= 1u;
            }
        }
    }
}

void bch_trace_init(bch_trace_t *tr, size_t cap) {
    if (!tr) {
        return;
    }
    tr->events = NULL;
    tr->len = 0;
    tr->cap = 0;
    tr->truncated = 0;
    if (cap > 0) {
        tr->events = (bch_trace_event_t *)calloc(cap, sizeof(*tr->events));
        if (tr->events) {
            tr->cap = cap;
        } else {
            tr->truncated = 1;
        }
    }
}

void bch_trace_reset(bch_trace_t *tr) {
    if (!tr) {
        return;
    }
    tr->len = 0;
    tr->truncated = 0;
}

void bch_trace_free(bch_trace_t *tr) {
    if (!tr) {
        return;
    }
    free(tr->events);
    tr->events = NULL;
    tr->len = 0;
    tr->cap = 0;
    tr->truncated = 0;
}

int bch_encode_systematic_trace(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw, bch_trace_t *trace) {
    if (!bch || !msg || !cw) {
        return -1;
    }

    const int n = bch->n;
    const int k = bch->k;
    const int dg = bch->dg;
    const uint8_t *g = bch->g;

    memset(cw, 0, (size_t)n);
    for (int i = 0; i < k; i++) {
        cw[dg + i] = msg[i] & 1u;
    }

    trace_append(trace, BCH_TRACE_STAGE_ENCODE_BEGIN, k, dg, 0u, 0u, 0u);

    if (dg <= 0) {
        trace_append(trace, BCH_TRACE_STAGE_ENCODE_END, 0, 0, 0u, 0u, 0u);
        return 0;
    }

    uint8_t *reg = (uint8_t *)calloc((size_t)dg, 1);
    if (!reg) {
        return -1;
    }

    int step = 0;
    for (int i = k - 1; i >= 0; i--) {
        uint8_t top = 0u;
        uint8_t in_bit = msg[i] & 1u;
        lfsr_step_trace(g, dg, reg, in_bit, &top);
        trace_append(trace, BCH_TRACE_ENCODE_STEP, step, in_bit, (uint32_t)top, pack_bits32(reg, dg), (uint32_t)dg);
        step++;
    }
    for (int z = 0; z < dg; z++) {
        uint8_t top = 0u;
        lfsr_step_trace(g, dg, reg, 0u, &top);
        trace_append(trace, BCH_TRACE_ENCODE_STEP, step, 0, (uint32_t)top, pack_bits32(reg, dg), (uint32_t)dg);
        step++;
    }

    for (int j = 0; j < dg; j++) {
        cw[j] = reg[j] & 1u;
    }
    trace_append(trace, BCH_TRACE_STAGE_ENCODE_END, step, 0, pack_bits32(cw, dg), (uint32_t)dg, 0u);

    free(reg);
    return 0;
}

static int berlekamp_massey_trace(const bch_ctx_t *bch, const uint16_t *S, uint16_t *lambda_poly, int *out_L, bch_trace_t *trace) {
    const int t = bch->t;
    const int ns = 2 * t;
    const gf_ctx_t *gf = &bch->gf;

    uint16_t *C = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *B = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *T = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    if (!C || !B || !T) {
        free(C);
        free(B);
        free(T);
        return -1;
    }

    C[0] = 1u;
    B[0] = 1u;

    int L = 0;
    int m = 1;
    uint16_t b = 1u;

    for (int n = 0; n < ns; n++) {
        uint16_t d = S[n + 1];
        for (int i = 1; i <= L; i++) {
            if (C[i] != 0u && S[n + 1 - i] != 0u) {
                d ^= gf_mul(gf, C[i], S[n + 1 - i]);
            }
        }

        trace_append(trace, BCH_TRACE_STAGE_BM_ITER, n, L, d, (uint32_t)m, pack_u16_coeffs32(C, t + 1));

        if (d == 0u) {
            m++;
            continue;
        }

        memcpy(T, C, (size_t)(ns + 1) * sizeof(uint16_t));
        const uint16_t scale = gf_div(gf, d, b);

        for (int i = 0; i + m <= ns; i++) {
            if (B[i] != 0u) {
                C[i + m] ^= gf_mul(gf, scale, B[i]);
            }
        }

        if (2 * L <= n) {
            L = n + 1 - L;
            memcpy(B, T, (size_t)(ns + 1) * sizeof(uint16_t));
            b = d;
            m = 1;
        } else {
            m++;
        }
    }

    memset(lambda_poly, 0, (size_t)(t + 1) * sizeof(uint16_t));
    for (int i = 0; i <= t && i <= ns; i++) {
        lambda_poly[i] = C[i];
    }
    *out_L = L;

    free(C);
    free(B);
    free(T);
    return (L > t) ? -1 : 0;
}

static uint16_t gf_pow_alpha_signed(const gf_ctx_t *gf, int e) {
    const int n = (1 << gf->m) - 1;
    int ee = e % n;
    if (ee < 0) {
        ee += n;
    }

    uint16_t r = 1u;
    for (int i = 0; i < ee; i++) {
        r = gf_mul(gf, r, 0x2u);
    }
    return r;
}

static int chien_search_trace(const bch_ctx_t *bch, const uint16_t *lambda_poly, int L, int *err_pos, bch_trace_t *trace) {
    if (L < 0 || L > bch->t) {
        return -1;
    }

    int found = 0;
    for (int pos = 0; pos < bch->n; pos++) {
        uint16_t x = gf_pow_alpha_signed(&bch->gf, -pos);
        uint16_t acc = 0u;
        for (int i = L; i >= 0; i--) {
            acc = gf_mul(&bch->gf, acc, x);
            acc ^= lambda_poly[i];
        }

        trace_append(trace, BCH_TRACE_STAGE_CHIEN_EVAL, pos, L, acc, x, 0u);

        if (acc == 0u) {
            if (found >= L) {
                return -1;
            }
            err_pos[found++] = pos;
        }
    }
    return (found == L) ? found : -1;
}

int bch_decode_trace(bch_ctx_t *bch, uint8_t *rx, int *out_errs, bch_trace_t *trace) {
    if (!bch || !rx || !out_errs) {
        return -1;
    }

    const int t = bch->t;
    const int ns = 2 * t;
    *out_errs = 0;

    trace_append(trace, BCH_TRACE_STAGE_DECODE_BEGIN, bch->n, bch->k, (uint32_t)bch->t, (uint32_t)bch->dg, 0u);

    uint16_t *S = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    uint16_t *lambda_poly = (uint16_t *)calloc((size_t)(t + 1), sizeof(uint16_t));
    int *err_pos = (int *)calloc((size_t)t, sizeof(int));
    if (!S || !lambda_poly || !err_pos) {
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    bch_compute_syndromes(bch, rx, S);
    for (int i = 1; i <= ns; i++) {
        trace_append(trace, BCH_TRACE_STAGE_SYNDROME, i, 0, S[i], 0u, 0u);
    }

    int all_zero = 1;
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            all_zero = 0;
            break;
        }
    }
    if (all_zero) {
        trace_append(trace, BCH_TRACE_STAGE_DECODE_END, 0, 0, 0u, 0u, 0u);
        free(S);
        free(lambda_poly);
        free(err_pos);
        return 0;
    }

    int L = 0;
    if (berlekamp_massey_trace(bch, S, lambda_poly, &L, trace) != 0) {
        trace_append(trace, BCH_TRACE_STAGE_DECODE_END, -1, 0, 0u, 0u, 0u);
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    int found = chien_search_trace(bch, lambda_poly, L, err_pos, trace);
    if (found < 0) {
        trace_append(trace, BCH_TRACE_STAGE_DECODE_END, -1, 0, 0u, 0u, 0u);
        free(S);
        free(lambda_poly);
        free(err_pos);
        return -1;
    }

    for (int i = 0; i < found; i++) {
        int p = err_pos[i];
        if (p < 0 || p >= bch->n) {
            trace_append(trace, BCH_TRACE_STAGE_DECODE_END, -1, found, 0u, 0u, 0u);
            free(S);
            free(lambda_poly);
            free(err_pos);
            return -1;
        }
        rx[p] ^= 1u;
        trace_append(trace, BCH_TRACE_STAGE_CORRECT_FLIP, p, i, 0u, 0u, 0u);
    }

    bch_compute_syndromes(bch, rx, S);
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            trace_append(trace, BCH_TRACE_STAGE_DECODE_END, -1, found, S[i], 0u, 0u);
            free(S);
            free(lambda_poly);
            free(err_pos);
            return -1;
        }
    }

    *out_errs = found;
    trace_append(trace, BCH_TRACE_STAGE_DECODE_END, 0, found, 0u, 0u, 0u);

    free(S);
    free(lambda_poly);
    free(err_pos);
    return 0;
}
