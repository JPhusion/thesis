#include "product_trace.h"

#include <stdlib.h>

static void trace_append(product_trace_t *tr, uint32_t kind, int32_t a, int32_t b, uint32_t u0, uint32_t u1, uint32_t u2) {
    if (!tr) {
        return;
    }

    if (tr->len == tr->cap) {
        const size_t new_cap = (tr->cap == 0) ? 256u : (tr->cap * 2u);
        product_trace_event_t *grown = (product_trace_event_t *)realloc(tr->events, new_cap * sizeof(*grown));
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

typedef struct {
    product_trace_t *trace;
} product_trace_user_t;

static void encode_stage_begin(void *user, int info_rows, int info_cols, int code_rows, int code_cols) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_STAGE_ENCODE_BEGIN, info_rows, info_cols, (uint32_t)code_rows, (uint32_t)code_cols, 0u);
}

static void encode_info_bit(void *user, int row, int col, uint8_t bit) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_INFO_BIT, row, col, (uint32_t)(bit & 1u), 0u, 0u);
}

static void encode_row_begin(void *user, int row) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ROW_BEGIN, row, 0, 0u, 0u, 0u);
}

static void encode_row_write(void *user, int row, int col, uint8_t bit) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ROW_WRITE, row, col, (uint32_t)(bit & 1u), 0u, 0u);
}

static void encode_row_end(void *user, int row) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ROW_END, row, 0, 0u, 0u, 0u);
}

static void encode_col_begin(void *user, int col) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_COL_BEGIN, col, 0, 0u, 0u, 0u);
}

static void encode_col_write(void *user, int row, int col, uint8_t bit) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_COL_WRITE, row, col, (uint32_t)(bit & 1u), 0u, 0u);
}

static void encode_col_end(void *user, int col) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_COL_END, col, 0, 0u, 0u, 0u);
}

static void encode_stage_end(void *user, int rc) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_STAGE_ENCODE_END, rc, 0, 0u, 0u, 0u);
}

static void decode_stage_begin(void *user, int code_rows, int code_cols, int max_iters) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_STAGE_DECODE_BEGIN, code_rows, code_cols, (uint32_t)max_iters, 0u, 0u);
}

static void decode_iter_begin(void *user, int iter) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ITER_BEGIN, iter, 0, 0u, 0u, 0u);
}

static void decode_row_begin(void *user, int iter, int row) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ROW_PASS_BEGIN, iter, row, 0u, 0u, 0u);
}

static void decode_row_flip(void *user, int iter, int row, int col, uint8_t before, uint8_t after) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ROW_PASS_FLIP, row, col, (uint32_t)iter, (uint32_t)(before & 1u), (uint32_t)(after & 1u));
}

static void decode_row_end(void *user, int iter, int row, int rc, int errs, int changes) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ROW_PASS_END, iter, row, (uint32_t)rc, (uint32_t)errs, (uint32_t)changes);
}

static void decode_col_begin(void *user, int iter, int col) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_COL_PASS_BEGIN, iter, col, 0u, 0u, 0u);
}

static void decode_col_flip(void *user, int iter, int row, int col, uint8_t before, uint8_t after) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_COL_PASS_FLIP, row, col, (uint32_t)iter, (uint32_t)(before & 1u), (uint32_t)(after & 1u));
}

static void decode_col_end(void *user, int iter, int col, int rc, int errs, int changes) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_COL_PASS_END, iter, col, (uint32_t)rc, (uint32_t)errs, (uint32_t)changes);
}

static void decode_iter_end(void *user, int iter, int row_failures, int col_failures, int row_changes, int col_changes) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_ITER_END, iter, row_failures, (uint32_t)col_failures, (uint32_t)row_changes, (uint32_t)col_changes);
}

static void decode_stage_end(void *user, int rc, int rows_valid, int cols_valid) {
    product_trace_user_t *u = (product_trace_user_t *)user;
    trace_append(u->trace, PRODUCT_TRACE_STAGE_DECODE_END, rc, rows_valid, (uint32_t)cols_valid, 0u, 0u);
}

void product_trace_init(product_trace_t *tr, size_t cap) {
    if (!tr) {
        return;
    }
    tr->events = NULL;
    tr->len = 0;
    tr->cap = 0;
    tr->truncated = 0;
    if (cap > 0) {
        tr->events = (product_trace_event_t *)calloc(cap, sizeof(*tr->events));
        if (tr->events) {
            tr->cap = cap;
        } else {
            tr->truncated = 1;
        }
    }
}

void product_trace_reset(product_trace_t *tr) {
    if (!tr) {
        return;
    }
    tr->len = 0;
    tr->truncated = 0;
}

void product_trace_free(product_trace_t *tr) {
    if (!tr) {
        return;
    }
    free(tr->events);
    tr->events = NULL;
    tr->len = 0;
    tr->cap = 0;
    tr->truncated = 0;
}

int product_encode_trace(const product_ctx_t *pc, const uint8_t *msg, uint8_t *cw, product_trace_t *trace) {
    if (!pc || !msg || !cw || !trace) {
        return -1;
    }

    product_trace_user_t user = {.trace = trace};
    product_encode_hooks_t hooks = {
        .stage_begin = encode_stage_begin,
        .info_bit = encode_info_bit,
        .row_begin = encode_row_begin,
        .row_write = encode_row_write,
        .row_end = encode_row_end,
        .col_begin = encode_col_begin,
        .col_write = encode_col_write,
        .col_end = encode_col_end,
        .stage_end = encode_stage_end,
        .user = &user,
    };
    return product_encode_systematic_ex(pc, msg, cw, &hooks);
}

int product_decode_trace(product_ctx_t *pc, uint8_t *rx, int max_iters, product_decode_stats_t *stats, product_trace_t *trace) {
    if (!pc || !rx || !trace) {
        return -1;
    }

    product_trace_user_t user = {.trace = trace};
    product_decode_hooks_t hooks = {
        .stage_begin = decode_stage_begin,
        .iter_begin = decode_iter_begin,
        .row_begin = decode_row_begin,
        .row_flip = decode_row_flip,
        .row_end = decode_row_end,
        .col_begin = decode_col_begin,
        .col_flip = decode_col_flip,
        .col_end = decode_col_end,
        .iter_end = decode_iter_end,
        .stage_end = decode_stage_end,
        .user = &user,
    };
    return product_decode_iterative_ex(pc, rx, max_iters, stats, &hooks);
}
