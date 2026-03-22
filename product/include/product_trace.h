#ifndef PRODUCT_TRACE_H
#define PRODUCT_TRACE_H

#include <stddef.h>
#include <stdint.h>
#include "product.h"

typedef struct {
    uint32_t kind;
    int32_t a;
    int32_t b;
    uint32_t u0;
    uint32_t u1;
    uint32_t u2;
} product_trace_event_t;

typedef struct {
    product_trace_event_t *events;
    size_t len;
    size_t cap;
    int truncated;
} product_trace_t;

enum {
    PRODUCT_TRACE_STAGE_ENCODE_BEGIN = 1,
    PRODUCT_TRACE_INFO_BIT = 10,
    PRODUCT_TRACE_ROW_BEGIN = 20,
    PRODUCT_TRACE_ROW_WRITE = 21,
    PRODUCT_TRACE_ROW_END = 22,
    PRODUCT_TRACE_COL_BEGIN = 30,
    PRODUCT_TRACE_COL_WRITE = 31,
    PRODUCT_TRACE_COL_END = 32,
    PRODUCT_TRACE_STAGE_ENCODE_END = 40,

    PRODUCT_TRACE_STAGE_DECODE_BEGIN = 100,
    PRODUCT_TRACE_ITER_BEGIN = 110,
    PRODUCT_TRACE_ROW_PASS_BEGIN = 120,
    PRODUCT_TRACE_ROW_PASS_FLIP = 121,
    PRODUCT_TRACE_ROW_PASS_END = 122,
    PRODUCT_TRACE_COL_PASS_BEGIN = 130,
    PRODUCT_TRACE_COL_PASS_FLIP = 131,
    PRODUCT_TRACE_COL_PASS_END = 132,
    PRODUCT_TRACE_ITER_END = 140,
    PRODUCT_TRACE_STAGE_DECODE_END = 150
};

void product_trace_init(product_trace_t *tr, size_t cap);
void product_trace_reset(product_trace_t *tr);
void product_trace_free(product_trace_t *tr);

int product_encode_trace(const product_ctx_t *pc, const uint8_t *msg, uint8_t *cw, product_trace_t *trace);
int product_decode_trace(product_ctx_t *pc, uint8_t *rx, int max_iters, product_decode_stats_t *stats, product_trace_t *trace);

#endif
