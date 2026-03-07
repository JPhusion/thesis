#ifndef BCH_TRACE_H
#define BCH_TRACE_H

#include <stddef.h>
#include <stdint.h>
#include "bch.h"

typedef struct {
    uint32_t kind;
    int32_t a;
    int32_t b;
    uint32_t u0;
    uint32_t u1;
    uint32_t u2;
} bch_trace_event_t;

typedef struct {
    bch_trace_event_t *events;
    size_t len;
    size_t cap;
    int truncated;
} bch_trace_t;

enum {
    BCH_TRACE_STAGE_ENCODE_BEGIN = 1,
    BCH_TRACE_STAGE_ENCODE_END = 2,
    BCH_TRACE_ENCODE_STEP = 10,

    BCH_TRACE_STAGE_DECODE_BEGIN = 100,
    BCH_TRACE_STAGE_SYNDROME = 110,
    BCH_TRACE_STAGE_BM_ITER = 120,
    BCH_TRACE_STAGE_CHIEN_EVAL = 130,
    BCH_TRACE_STAGE_CORRECT_FLIP = 140,
    BCH_TRACE_STAGE_DECODE_END = 150
};

void bch_trace_init(bch_trace_t *tr, size_t cap);
void bch_trace_reset(bch_trace_t *tr);
void bch_trace_free(bch_trace_t *tr);

int bch_encode_systematic_trace(const bch_ctx_t *bch, const uint8_t *msg, uint8_t *cw, bch_trace_t *trace);
int bch_decode_trace(bch_ctx_t *bch, uint8_t *rx, int *out_errs, bch_trace_t *trace);

#endif
