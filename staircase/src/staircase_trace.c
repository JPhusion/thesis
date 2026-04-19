#include "staircase_trace.h"

#include <stdlib.h>

typedef struct {
    staircase_trace_t *trace;
} trace_user_t;

static void trace_append(staircase_trace_t *tr, uint32_t kind, int32_t a, int32_t b, uint32_t u0, uint32_t u1, uint32_t u2) {
    if (!tr) {
        return;
    }
    if (tr->len == tr->cap) {
        const size_t new_cap = (tr->cap == 0) ? 256u : (tr->cap * 2u);
        staircase_trace_event_t *grown = (staircase_trace_event_t *)realloc(tr->events, new_cap * sizeof(*grown));
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

static void on_stage_begin(void *user, int block_size, int info_cols, int parity_cols, int data_blocks, int total_blocks) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_STAGE_BEGIN, block_size, info_cols, (uint32_t)parity_cols, (uint32_t)data_blocks, (uint32_t)total_blocks);
}

static void on_block_begin(void *user, int block, int is_tail) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_BLOCK_BEGIN, block, is_tail, 0u, 0u, 0u);
}

static void on_info_bit(void *user, int block, int row, int col, uint8_t bit) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_INFO_BIT, block, row, (uint32_t)col, (uint32_t)(bit & 1u), 0u);
}

static void on_row_begin(void *user, int block, int row) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_ROW_BEGIN, block, row, 0u, 0u, 0u);
}

static void on_parity_write(void *user, int block, int row, int col, uint8_t bit) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_PARITY_WRITE, block, row, (uint32_t)col, (uint32_t)(bit & 1u), 0u);
}

static void on_row_end(void *user, int block, int row) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_ROW_END, block, row, 0u, 0u, 0u);
}

static void on_block_end(void *user, int block) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_BLOCK_END, block, 0, 0u, 0u, 0u);
}

static void on_stage_end(void *user, int rc) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_STAGE_END, rc, 0, 0u, 0u, 0u);
}

static void decode_stage_begin(void *user, int total_blocks, int block_size, int info_cols, int parity_cols, int window_size, int max_iters) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_BEGIN, total_blocks, block_size, (uint32_t)info_cols, (uint32_t)parity_cols, (uint32_t)((window_size << 16) | (max_iters & 0xffff)));
}

static void decode_window_begin(void *user, int window_idx, int output_block, int start_block, int end_block) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_WINDOW_BEGIN, window_idx, output_block, (uint32_t)start_block, (uint32_t)end_block, 0u);
}

static void decode_iter_begin(void *user, int window_idx, int iter) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_ITER_BEGIN, window_idx, iter, 0u, 0u, 0u);
}

static void decode_row_begin(void *user, int window_idx, int iter, int block, int row, int source_locked) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_ROW_BEGIN, block, row, (uint32_t)window_idx, (uint32_t)iter, (uint32_t)source_locked);
}

static void decode_flip(void *user, int window_idx, int iter, int block, int target_block, int row, int col, uint8_t before, uint8_t after) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_FLIP, block, target_block, (uint32_t)((window_idx << 16) | (iter & 0xffff)), (uint32_t)((row << 16) | (col & 0xffff)), (uint32_t)(((before & 1u) << 1) | (after & 1u)));
}

static void decode_row_end(void *user, int window_idx, int iter, int block, int row, int rc, int errs, int changes) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_ROW_END, block, row, (uint32_t)((window_idx << 16) | (iter & 0xffff)), (uint32_t)((rc & 0xffff) << 16 | (errs & 0xffff)), (uint32_t)changes);
}

static void decode_iter_end(void *user, int window_idx, int iter, int row_failures, int row_changes) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_ITER_END, window_idx, iter, (uint32_t)row_failures, (uint32_t)row_changes, 0u);
}

static void decode_window_lock(void *user, int window_idx, int block) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_WINDOW_LOCK, window_idx, block, 0u, 0u, 0u);
}

static void decode_stage_end(void *user, int rc, int final_valid, int locked_blocks) {
    trace_user_t *u = (trace_user_t *)user;
    trace_append(u->trace, STAIR_TRACE_DECODE_END, rc, final_valid, (uint32_t)locked_blocks, 0u, 0u);
}

void staircase_trace_init(staircase_trace_t *tr, size_t cap) {
    if (!tr) {
        return;
    }
    tr->events = NULL;
    tr->len = 0;
    tr->cap = 0;
    tr->truncated = 0;
    if (cap > 0) {
        tr->events = (staircase_trace_event_t *)calloc(cap, sizeof(*tr->events));
        if (tr->events) {
            tr->cap = cap;
        } else {
            tr->truncated = 1;
        }
    }
}

void staircase_trace_reset(staircase_trace_t *tr) {
    if (!tr) {
        return;
    }
    tr->len = 0;
    tr->truncated = 0;
}

void staircase_trace_free(staircase_trace_t *tr) {
    if (!tr) {
        return;
    }
    free(tr->events);
    tr->events = NULL;
    tr->len = 0;
    tr->cap = 0;
    tr->truncated = 0;
}

int staircase_encode_trace(const staircase_ctx_t *sc, const uint8_t *msg, uint8_t *state, staircase_trace_t *trace) {
    if (!sc || !msg || !state || !trace) {
        return -1;
    }

    trace_user_t user = {.trace = trace};
    staircase_encode_hooks_t hooks = {
        .stage_begin = on_stage_begin,
        .block_begin = on_block_begin,
        .info_bit = on_info_bit,
        .row_begin = on_row_begin,
        .parity_write = on_parity_write,
        .row_end = on_row_end,
        .block_end = on_block_end,
        .stage_end = on_stage_end,
        .user = &user,
    };
    return staircase_encode_terminated_ex(sc, msg, state, &hooks);
}

int staircase_decode_trace(staircase_ctx_t *sc, uint8_t *state, int window_size, int max_iters, staircase_decode_stats_t *stats, staircase_trace_t *trace) {
    if (!sc || !state || !trace) {
        return -1;
    }

    trace_user_t user = {.trace = trace};
    staircase_decode_hooks_t hooks = {
        .stage_begin = decode_stage_begin,
        .window_begin = decode_window_begin,
        .iter_begin = decode_iter_begin,
        .row_begin = decode_row_begin,
        .flip = decode_flip,
        .row_end = decode_row_end,
        .iter_end = decode_iter_end,
        .window_lock = decode_window_lock,
        .stage_end = decode_stage_end,
        .user = &user,
    };
    return staircase_decode_windowed_ex(sc, state, window_size, max_iters, stats, &hooks);
}
