#include <stdint.h>
#include <stddef.h>
#include "bch.h"
#include "bch_trace.h"

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

static bch_ctx_t g_ctx;
static int g_ctx_valid = 0;
static bch_trace_t g_trace;
static int g_trace_ready = 0;

static void ensure_trace_ready(void) {
    if (!g_trace_ready) {
        bch_trace_init(&g_trace, 4096u);
        g_trace_ready = 1;
    }
}

EMSCRIPTEN_KEEPALIVE
int bchw_init(int m, uint32_t prim_poly, int t) {
    if (g_ctx_valid) {
        bch_free(&g_ctx);
        g_ctx_valid = 0;
    }

    ensure_trace_ready();
    bch_trace_reset(&g_trace);

    int rc = bch_init(&g_ctx, m, prim_poly, t);
    if (rc == 0) {
        g_ctx_valid = 1;
    }
    return rc;
}

EMSCRIPTEN_KEEPALIVE
void bchw_free(void) {
    if (g_ctx_valid) {
        bch_free(&g_ctx);
        g_ctx_valid = 0;
    }
    if (g_trace_ready) {
        bch_trace_free(&g_trace);
        g_trace_ready = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
int bchw_get_n(void) {
    return g_ctx_valid ? g_ctx.n : -1;
}

EMSCRIPTEN_KEEPALIVE
int bchw_get_k(void) {
    return g_ctx_valid ? g_ctx.k : -1;
}

EMSCRIPTEN_KEEPALIVE
int bchw_get_t(void) {
    return g_ctx_valid ? g_ctx.t : -1;
}

EMSCRIPTEN_KEEPALIVE
int bchw_get_dg(void) {
    return g_ctx_valid ? g_ctx.dg : -1;
}

EMSCRIPTEN_KEEPALIVE
const uint8_t *bchw_get_g_ptr(void) {
    if (!g_ctx_valid || !g_ctx.g) {
        return NULL;
    }
    return g_ctx.g;
}

EMSCRIPTEN_KEEPALIVE
int bchw_encode(const uint8_t *msg, int msg_len, uint8_t *cw, int cw_len) {
    if (!g_ctx_valid || !msg || !cw) {
        return -1;
    }
    if (msg_len != g_ctx.k || cw_len != g_ctx.n) {
        return -1;
    }

    bch_encode_systematic(&g_ctx, msg, cw);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int bchw_decode(uint8_t *rx, int rx_len, int *out_errs) {
    if (!g_ctx_valid || !rx || !out_errs) {
        return -1;
    }
    if (rx_len != g_ctx.n) {
        return -1;
    }
    return bch_decode(&g_ctx, rx, out_errs);
}

EMSCRIPTEN_KEEPALIVE
int bchw_encode_trace(const uint8_t *msg, int msg_len, uint8_t *cw, int cw_len) {
    if (!g_ctx_valid || !msg || !cw) {
        return -1;
    }
    if (msg_len != g_ctx.k || cw_len != g_ctx.n) {
        return -1;
    }

    ensure_trace_ready();
    bch_trace_reset(&g_trace);
    return bch_encode_systematic_trace(&g_ctx, msg, cw, &g_trace);
}

EMSCRIPTEN_KEEPALIVE
int bchw_decode_trace(uint8_t *rx, int rx_len, int *out_errs) {
    if (!g_ctx_valid || !rx || !out_errs) {
        return -1;
    }
    if (rx_len != g_ctx.n) {
        return -1;
    }

    ensure_trace_ready();
    bch_trace_reset(&g_trace);
    return bch_decode_trace(&g_ctx, rx, out_errs, &g_trace);
}

EMSCRIPTEN_KEEPALIVE
uintptr_t bchw_trace_ptr(void) {
    if (!g_trace_ready || !g_trace.events) {
        return (uintptr_t)0u;
    }
    return (uintptr_t)g_trace.events;
}

EMSCRIPTEN_KEEPALIVE
int bchw_trace_len(void) {
    if (!g_trace_ready) {
        return 0;
    }
    return (int)g_trace.len;
}

EMSCRIPTEN_KEEPALIVE
int bchw_trace_stride(void) {
    return (int)sizeof(bch_trace_event_t);
}

EMSCRIPTEN_KEEPALIVE
int bchw_trace_truncated(void) {
    if (!g_trace_ready) {
        return 0;
    }
    return g_trace.truncated;
}

EMSCRIPTEN_KEEPALIVE
void bchw_trace_clear(void) {
    if (g_trace_ready) {
        bch_trace_reset(&g_trace);
    }
}
