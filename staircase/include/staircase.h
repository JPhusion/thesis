#ifndef STAIRCASE_H
#define STAIRCASE_H

#include <stdint.h>
#include "bch.h"

typedef struct {
    int m;
    int t;
    uint32_t prim_poly;

    int prim_n;
    int prim_k;
    int prim_dg;

    int n;
    int k;
    int dg;

    int block_size;
    int info_cols;
    int parity_cols;

    int data_blocks;
    int total_blocks;
    int block_bits;
    int msg_bits;
    int state_bits;
    int stored_bits;

    bch_ctx_t bch;
} staircase_ctx_t;

typedef struct {
    int window_size;
    int max_iters;
    int windows_run;
    int iterations_run;
    int total_row_decodes;
    int total_row_failures;
    int total_row_changes;
    int locked_blocks;
    int final_valid;
} staircase_decode_stats_t;

typedef struct {
    void (*stage_begin)(void *user, int block_size, int info_cols, int parity_cols, int data_blocks, int total_blocks);
    void (*block_begin)(void *user, int block, int is_tail);
    void (*info_bit)(void *user, int block, int row, int col, uint8_t bit);
    void (*row_begin)(void *user, int block, int row);
    void (*parity_write)(void *user, int block, int row, int col, uint8_t bit);
    void (*row_end)(void *user, int block, int row);
    void (*block_end)(void *user, int block);
    void (*stage_end)(void *user, int rc);
    void *user;
} staircase_encode_hooks_t;

typedef struct {
    void (*stage_begin)(void *user, int total_blocks, int block_size, int info_cols, int parity_cols, int window_size, int max_iters);
    void (*window_begin)(void *user, int window_idx, int output_block, int start_block, int end_block);
    void (*iter_begin)(void *user, int window_idx, int iter);
    void (*row_begin)(void *user, int window_idx, int iter, int block, int row, int source_locked);
    void (*flip)(void *user, int window_idx, int iter, int block, int target_block, int row, int col, uint8_t before, uint8_t after);
    void (*row_end)(void *user, int window_idx, int iter, int block, int row, int rc, int errs, int changes);
    void (*iter_end)(void *user, int window_idx, int iter, int row_failures, int row_changes);
    void (*window_lock)(void *user, int window_idx, int block);
    void (*stage_end)(void *user, int rc, int final_valid, int locked_blocks);
    void *user;
} staircase_decode_hooks_t;

int staircase_init(staircase_ctx_t *sc, int m, uint32_t prim_poly, int t, int data_blocks);
void staircase_free(staircase_ctx_t *sc);
void staircase_decode_stats_reset(staircase_decode_stats_t *stats);

int staircase_encode_terminated(const staircase_ctx_t *sc, const uint8_t *msg, uint8_t *state);
int staircase_encode_terminated_ex(const staircase_ctx_t *sc, const uint8_t *msg, uint8_t *state, const staircase_encode_hooks_t *hooks);
int staircase_validate(const staircase_ctx_t *sc, const uint8_t *state);
int staircase_decode_windowed(staircase_ctx_t *sc, uint8_t *state, int window_size, int max_iters, staircase_decode_stats_t *stats);
int staircase_decode_windowed_ex(staircase_ctx_t *sc, uint8_t *state, int window_size, int max_iters, staircase_decode_stats_t *stats, const staircase_decode_hooks_t *hooks);
void staircase_extract_message(const staircase_ctx_t *sc, const uint8_t *state, uint8_t *msg);
void staircase_extract_stored(const staircase_ctx_t *sc, const uint8_t *state, uint8_t *stored);
void staircase_import_stored(const staircase_ctx_t *sc, const uint8_t *stored, uint8_t *state);

#endif
