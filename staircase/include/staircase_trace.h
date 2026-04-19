#ifndef STAIRCASE_TRACE_H
#define STAIRCASE_TRACE_H

#include <stddef.h>
#include <stdint.h>

#include "staircase.h"

typedef struct {
    uint32_t kind;
    int32_t a;
    int32_t b;
    uint32_t u0;
    uint32_t u1;
    uint32_t u2;
} staircase_trace_event_t;

typedef struct {
    staircase_trace_event_t *events;
    size_t len;
    size_t cap;
    int truncated;
} staircase_trace_t;

enum {
    STAIR_TRACE_STAGE_BEGIN = 1,
    STAIR_TRACE_BLOCK_BEGIN = 10,
    STAIR_TRACE_INFO_BIT = 11,
    STAIR_TRACE_ROW_BEGIN = 20,
    STAIR_TRACE_PARITY_WRITE = 21,
    STAIR_TRACE_ROW_END = 22,
    STAIR_TRACE_BLOCK_END = 23,
    STAIR_TRACE_STAGE_END = 30,

    STAIR_TRACE_DECODE_BEGIN = 100,
    STAIR_TRACE_WINDOW_BEGIN = 110,
    STAIR_TRACE_DECODE_ITER_BEGIN = 120,
    STAIR_TRACE_DECODE_ROW_BEGIN = 130,
    STAIR_TRACE_DECODE_FLIP = 131,
    STAIR_TRACE_DECODE_ROW_END = 132,
    STAIR_TRACE_DECODE_ITER_END = 140,
    STAIR_TRACE_WINDOW_LOCK = 150,
    STAIR_TRACE_DECODE_END = 160
};

void staircase_trace_init(staircase_trace_t *tr, size_t cap);
void staircase_trace_reset(staircase_trace_t *tr);
void staircase_trace_free(staircase_trace_t *tr);

int staircase_encode_trace(const staircase_ctx_t *sc, const uint8_t *msg, uint8_t *state, staircase_trace_t *trace);
int staircase_decode_trace(staircase_ctx_t *sc, uint8_t *state, int window_size, int max_iters, staircase_decode_stats_t *stats, staircase_trace_t *trace);

#endif
