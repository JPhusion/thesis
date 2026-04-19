#include <stddef.h>
#include <stdint.h>

#include "staircase.h"
#include "staircase_trace.h"

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

static staircase_ctx_t g_ctx;
static int g_ctx_valid = 0;
static staircase_trace_t g_trace;
static int g_trace_ready = 0;
static staircase_decode_stats_t g_stats;

static void ensure_trace_ready(void) {
    if (!g_trace_ready) {
        staircase_trace_init(&g_trace, 4096u);
        g_trace_ready = 1;
    }
}

EMSCRIPTEN_KEEPALIVE
int sw_init(int m, uint32_t prim_poly, int t, int data_blocks) {
    if (g_ctx_valid) {
        staircase_free(&g_ctx);
        g_ctx_valid = 0;
    }
    ensure_trace_ready();
    staircase_trace_reset(&g_trace);
    staircase_decode_stats_reset(&g_stats);
    int rc = staircase_init(&g_ctx, m, prim_poly, t, data_blocks);
    if (rc == 0) {
        g_ctx_valid = 1;
    }
    return rc;
}

EMSCRIPTEN_KEEPALIVE
void sw_free(void) {
    if (g_ctx_valid) {
        staircase_free(&g_ctx);
        g_ctx_valid = 0;
    }
    if (g_trace_ready) {
        staircase_trace_free(&g_trace);
        g_trace_ready = 0;
    }
    staircase_decode_stats_reset(&g_stats);
}

#define SW_GETTER(name, field) \
EMSCRIPTEN_KEEPALIVE \
int name(void) { \
    return g_ctx_valid ? g_ctx.field : -1; \
}

SW_GETTER(sw_get_component_n, n)
SW_GETTER(sw_get_component_k, k)
SW_GETTER(sw_get_component_dg, dg)
SW_GETTER(sw_get_block_size, block_size)
SW_GETTER(sw_get_info_cols, info_cols)
SW_GETTER(sw_get_parity_cols, parity_cols)
SW_GETTER(sw_get_data_blocks, data_blocks)
SW_GETTER(sw_get_total_blocks, total_blocks)
SW_GETTER(sw_get_msg_bits, msg_bits)
SW_GETTER(sw_get_state_bits, state_bits)
SW_GETTER(sw_get_stored_bits, stored_bits)

#undef SW_GETTER

EMSCRIPTEN_KEEPALIVE
int sw_encode(const uint8_t *msg, int msg_len, uint8_t *state, int state_len) {
    if (!g_ctx_valid || !msg || !state) {
        return -1;
    }
    if (msg_len != g_ctx.msg_bits || state_len != g_ctx.state_bits) {
        return -1;
    }
    return staircase_encode_terminated(&g_ctx, msg, state);
}

EMSCRIPTEN_KEEPALIVE
void sw_extract_message(const uint8_t *state, int state_len, uint8_t *msg, int msg_len) {
    if (!g_ctx_valid || !state || !msg) {
        return;
    }
    if (state_len != g_ctx.state_bits || msg_len != g_ctx.msg_bits) {
        return;
    }
    staircase_extract_message(&g_ctx, state, msg);
}

EMSCRIPTEN_KEEPALIVE
void sw_extract_stored(const uint8_t *state, int state_len, uint8_t *stored, int stored_len) {
    if (!g_ctx_valid || !state || !stored) {
        return;
    }
    if (state_len != g_ctx.state_bits || stored_len != g_ctx.stored_bits) {
        return;
    }
    staircase_extract_stored(&g_ctx, state, stored);
}

EMSCRIPTEN_KEEPALIVE
void sw_import_stored(const uint8_t *stored, int stored_len, uint8_t *state, int state_len) {
    if (!g_ctx_valid || !stored || !state) {
        return;
    }
    if (stored_len != g_ctx.stored_bits || state_len != g_ctx.state_bits) {
        return;
    }
    staircase_import_stored(&g_ctx, stored, state);
}

EMSCRIPTEN_KEEPALIVE
int sw_decode(uint8_t *state, int state_len, int window_size, int max_iters) {
    if (!g_ctx_valid || !state || state_len != g_ctx.state_bits) {
        return -1;
    }
    staircase_decode_stats_reset(&g_stats);
    return staircase_decode_windowed(&g_ctx, state, window_size, max_iters, &g_stats);
}

EMSCRIPTEN_KEEPALIVE
int sw_encode_trace(const uint8_t *msg, int msg_len, uint8_t *state, int state_len) {
    if (!g_ctx_valid || !msg || !state) {
        return -1;
    }
    if (msg_len != g_ctx.msg_bits || state_len != g_ctx.state_bits) {
        return -1;
    }
    ensure_trace_ready();
    staircase_trace_reset(&g_trace);
    return staircase_encode_trace(&g_ctx, msg, state, &g_trace);
}

EMSCRIPTEN_KEEPALIVE
int sw_decode_trace(uint8_t *state, int state_len, int window_size, int max_iters) {
    if (!g_ctx_valid || !state || state_len != g_ctx.state_bits) {
        return -1;
    }
    ensure_trace_ready();
    staircase_trace_reset(&g_trace);
    staircase_decode_stats_reset(&g_stats);
    return staircase_decode_trace(&g_ctx, state, window_size, max_iters, &g_stats, &g_trace);
}

EMSCRIPTEN_KEEPALIVE
int sw_validate(const uint8_t *state, int state_len) {
    if (!g_ctx_valid || !state || state_len != g_ctx.state_bits) {
        return -1;
    }
    return staircase_validate(&g_ctx, state);
}

EMSCRIPTEN_KEEPALIVE
uintptr_t sw_trace_ptr(void) {
    if (!g_trace_ready || !g_trace.events) {
        return (uintptr_t)0u;
    }
    return (uintptr_t)g_trace.events;
}

EMSCRIPTEN_KEEPALIVE
int sw_trace_len(void) {
    return g_trace_ready ? (int)g_trace.len : 0;
}

EMSCRIPTEN_KEEPALIVE
int sw_trace_stride(void) {
    return (int)sizeof(staircase_trace_event_t);
}

EMSCRIPTEN_KEEPALIVE
int sw_trace_truncated(void) {
    return g_trace_ready ? g_trace.truncated : 0;
}

EMSCRIPTEN_KEEPALIVE
void sw_trace_clear(void) {
    if (g_trace_ready) {
        staircase_trace_reset(&g_trace);
    }
}

EMSCRIPTEN_KEEPALIVE
uintptr_t sw_decode_stats_ptr(void) {
    return (uintptr_t)&g_stats;
}
