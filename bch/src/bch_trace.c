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

static uint32_t pack_u16_pair(uint16_t hi, uint16_t lo) {
    return ((uint32_t)hi << 16) | (uint32_t)lo;
}

typedef struct {
    bch_trace_t *trace;
    int last_step;
} encode_trace_user_t;

static void trace_encode_step(void *user, int step, uint8_t in_bit, uint8_t top, const uint8_t *reg, int reg_len) {
    encode_trace_user_t *u = (encode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_ENCODE_STEP, step, (int32_t)in_bit, (uint32_t)top, pack_bits32(reg, reg_len), (uint32_t)reg_len);
    u->last_step = step;
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
    if (!bch || !msg || !cw || !bch->g) {
        return -1;
    }

    trace_append(trace, BCH_TRACE_STAGE_ENCODE_BEGIN, bch->k, bch->dg, 0u, 0u, 0u);

    encode_trace_user_t user = {
        .trace = trace,
        .last_step = -1
    };

    int rc = bch_encode_systematic_ex(bch, msg, cw, trace_encode_step, &user);
    if (rc != 0) {
        return rc;
    }

    const int total_steps = user.last_step + 1;
    trace_append(trace, BCH_TRACE_STAGE_ENCODE_END, total_steps, 0, pack_bits32(cw, bch->dg), (uint32_t)bch->dg, 0u);
    return 0;
}

typedef struct {
    const bch_ctx_t *bch;
    bch_trace_t *trace;
} decode_trace_user_t;

static void trace_stage_begin(void *user, int n, int k, int t, int dg) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_STAGE_DECODE_BEGIN, n, k, (uint32_t)t, (uint32_t)dg, 0u);
}

static void trace_syndrome(void *user, int idx, uint16_t value) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_STAGE_SYNDROME, idx, 0, value, 0u, 0u);
}

static void trace_bm_iter_begin(void *user, int n, int L, int m, uint16_t b, uint16_t d_init) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_BM_ITER_BEGIN, n, L, d_init, (uint32_t)m, (uint32_t)b);
}

static void trace_bm_term(void *user, int n, int i, uint16_t C_i, uint16_t S_term, uint16_t prod, uint16_t d_after) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_BM_TERM, n, i, (uint32_t)C_i, (uint32_t)S_term, pack_u16_pair(prod, d_after));
}

static void trace_bm_update(void *user, int n, int old_L, int new_L, int m, uint16_t b, uint16_t scale) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_BM_UPDATE, n, old_L, (uint32_t)new_L, (uint32_t)m, pack_u16_pair(b, scale));
}

static void trace_bm_iter_end(void *user, int n, int L, int m, uint16_t b, uint16_t d, const uint16_t *C, const uint16_t *B, const uint16_t *T, int ns) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_STAGE_BM_ITER, n, L, d, (uint32_t)m, pack_u16_coeffs32(C, u->bch->t + 1));

    const int coeff_count = ns + 1;
    for (int i = 0; i < coeff_count; i++) {
        trace_append(u->trace, BCH_TRACE_BM_COEFF, n, i, (uint32_t)C[i], (uint32_t)B[i], (uint32_t)T[i]);
    }
    (void)b;
}

static void trace_chien_eval(void *user, int pos, int L, uint16_t x, uint16_t acc) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_STAGE_CHIEN_EVAL, pos, L, acc, x, 0u);
}

static void trace_flip(void *user, int pos, int ordinal) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_STAGE_CORRECT_FLIP, pos, ordinal, 0u, 0u, 0u);
}

static void trace_stage_end(void *user, int rc, int errs, uint16_t detail) {
    decode_trace_user_t *u = (decode_trace_user_t *)user;
    trace_append(u->trace, BCH_TRACE_STAGE_DECODE_END, rc, errs, detail, 0u, 0u);
}

int bch_decode_trace(bch_ctx_t *bch, uint8_t *rx, int *out_errs, bch_trace_t *trace) {
    if (!bch || !rx || !out_errs) {
        return -1;
    }

    decode_trace_user_t user = {
        .bch = bch,
        .trace = trace
    };

    bch_bm_hooks_t bm_hooks = {
        .iter_begin = trace_bm_iter_begin,
        .term = trace_bm_term,
        .iter_end = trace_bm_iter_end,
        .update = trace_bm_update
    };

    bch_decode_hooks_t hooks = {
        .stage_begin = trace_stage_begin,
        .syndrome = trace_syndrome,
        .bm_hooks = &bm_hooks,
        .chien_eval = trace_chien_eval,
        .flip = trace_flip,
        .stage_end = trace_stage_end,
        .user = &user
    };

    return bch_decode_ex(bch, rx, out_errs, &hooks);
}
