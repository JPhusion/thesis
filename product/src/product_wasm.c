#include <stddef.h>
#include <stdint.h>

#include "product.h"
#include "product_trace.h"

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

static product_ctx_t g_ctx;
static int g_ctx_valid = 0;
static product_trace_t g_trace;
static int g_trace_ready = 0;
static product_decode_stats_t g_stats;

static void ensure_trace_ready(void) {
    if (!g_trace_ready) {
        product_trace_init(&g_trace, 4096u);
        g_trace_ready = 1;
    }
}

EMSCRIPTEN_KEEPALIVE
int pw_init(int row_m, uint32_t row_prim_poly, int row_t,
            int col_m, uint32_t col_prim_poly, int col_t) {
    if (g_ctx_valid) {
        product_free(&g_ctx);
        g_ctx_valid = 0;
    }

    ensure_trace_ready();
    product_trace_reset(&g_trace);
    product_decode_stats_reset(&g_stats);

    int rc = product_init(&g_ctx, row_m, row_prim_poly, row_t, col_m, col_prim_poly, col_t);
    if (rc == 0) {
        g_ctx_valid = 1;
    }
    return rc;
}

EMSCRIPTEN_KEEPALIVE
void pw_free(void) {
    if (g_ctx_valid) {
        product_free(&g_ctx);
        g_ctx_valid = 0;
    }
    if (g_trace_ready) {
        product_trace_free(&g_trace);
        g_trace_ready = 0;
    }
    product_decode_stats_reset(&g_stats);
}

#define PW_GETTER(name, field) \
EMSCRIPTEN_KEEPALIVE \
int name(void) { \
    return g_ctx_valid ? g_ctx.field : -1; \
}

PW_GETTER(pw_get_row_n, row_n)
PW_GETTER(pw_get_row_k, row_k)
PW_GETTER(pw_get_row_t, row_t)
PW_GETTER(pw_get_row_dg, row_dg)
PW_GETTER(pw_get_col_n, col_n)
PW_GETTER(pw_get_col_k, col_k)
PW_GETTER(pw_get_col_t, col_t)
PW_GETTER(pw_get_col_dg, col_dg)
PW_GETTER(pw_get_info_rows, info_rows)
PW_GETTER(pw_get_info_cols, info_cols)
PW_GETTER(pw_get_code_rows, code_rows)
PW_GETTER(pw_get_code_cols, code_cols)
PW_GETTER(pw_get_msg_bits, msg_bits)
PW_GETTER(pw_get_cw_bits, cw_bits)

#undef PW_GETTER

EMSCRIPTEN_KEEPALIVE
int pw_encode(const uint8_t *msg, int msg_len, uint8_t *cw, int cw_len) {
    if (!g_ctx_valid || !msg || !cw) {
        return -1;
    }
    if (msg_len != g_ctx.msg_bits || cw_len != g_ctx.cw_bits) {
        return -1;
    }
    return product_encode_systematic(&g_ctx, msg, cw);
}

EMSCRIPTEN_KEEPALIVE
void pw_extract_message(const uint8_t *cw, int cw_len, uint8_t *msg, int msg_len) {
    if (!g_ctx_valid || !cw || !msg) {
        return;
    }
    if (cw_len != g_ctx.cw_bits || msg_len != g_ctx.msg_bits) {
        return;
    }
    product_extract_message(&g_ctx, cw, msg);
}

EMSCRIPTEN_KEEPALIVE
int pw_decode(uint8_t *rx, int rx_len, int max_iters) {
    if (!g_ctx_valid || !rx) {
        return -1;
    }
    if (rx_len != g_ctx.cw_bits) {
        return -1;
    }
    product_decode_stats_reset(&g_stats);
    return product_decode_iterative(&g_ctx, rx, max_iters, &g_stats);
}

EMSCRIPTEN_KEEPALIVE
int pw_encode_trace(const uint8_t *msg, int msg_len, uint8_t *cw, int cw_len) {
    if (!g_ctx_valid || !msg || !cw) {
        return -1;
    }
    if (msg_len != g_ctx.msg_bits || cw_len != g_ctx.cw_bits) {
        return -1;
    }
    ensure_trace_ready();
    product_trace_reset(&g_trace);
    return product_encode_trace(&g_ctx, msg, cw, &g_trace);
}

EMSCRIPTEN_KEEPALIVE
int pw_decode_trace(uint8_t *rx, int rx_len, int max_iters) {
    if (!g_ctx_valid || !rx) {
        return -1;
    }
    if (rx_len != g_ctx.cw_bits) {
        return -1;
    }
    ensure_trace_ready();
    product_trace_reset(&g_trace);
    product_decode_stats_reset(&g_stats);
    return product_decode_trace(&g_ctx, rx, max_iters, &g_stats, &g_trace);
}

EMSCRIPTEN_KEEPALIVE
uintptr_t pw_trace_ptr(void) {
    if (!g_trace_ready || !g_trace.events) {
        return (uintptr_t)0u;
    }
    return (uintptr_t)g_trace.events;
}

EMSCRIPTEN_KEEPALIVE
int pw_trace_len(void) {
    return g_trace_ready ? (int)g_trace.len : 0;
}

EMSCRIPTEN_KEEPALIVE
int pw_trace_stride(void) {
    return (int)sizeof(product_trace_event_t);
}

EMSCRIPTEN_KEEPALIVE
int pw_trace_truncated(void) {
    return g_trace_ready ? g_trace.truncated : 0;
}

EMSCRIPTEN_KEEPALIVE
void pw_trace_clear(void) {
    if (g_trace_ready) {
        product_trace_reset(&g_trace);
    }
}

EMSCRIPTEN_KEEPALIVE
uintptr_t pw_decode_stats_ptr(void) {
    return (uintptr_t)&g_stats;
}
