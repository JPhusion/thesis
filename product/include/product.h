#ifndef PRODUCT_H
#define PRODUCT_H

#include <stdint.h>
#include "bch.h"

typedef struct {
    int row_m;
    int row_t;
    int row_n;
    int row_k;
    int row_dg;
    uint32_t row_prim_poly;

    int col_m;
    int col_t;
    int col_n;
    int col_k;
    int col_dg;
    uint32_t col_prim_poly;

    int info_rows;
    int info_cols;
    int code_rows;
    int code_cols;
    int msg_bits;
    int cw_bits;

    bch_ctx_t row_bch;
    bch_ctx_t col_bch;
} product_ctx_t;

typedef struct {
    int max_iters;
    int iterations_run;
    int total_row_failures;
    int total_col_failures;
    int total_row_changes;
    int total_col_changes;
    int final_rows_valid;
    int final_cols_valid;
} product_decode_stats_t;

typedef struct {
    void (*stage_begin)(void *user, int info_rows, int info_cols, int code_rows, int code_cols);
    void (*info_bit)(void *user, int row, int col, uint8_t bit);
    void (*row_begin)(void *user, int row);
    void (*row_write)(void *user, int row, int col, uint8_t bit);
    void (*row_end)(void *user, int row);
    void (*col_begin)(void *user, int col);
    void (*col_write)(void *user, int row, int col, uint8_t bit);
    void (*col_end)(void *user, int col);
    void (*stage_end)(void *user, int rc);
    void *user;
} product_encode_hooks_t;

typedef struct {
    void (*stage_begin)(void *user, int code_rows, int code_cols, int max_iters);
    void (*iter_begin)(void *user, int iter);
    void (*row_begin)(void *user, int iter, int row);
    void (*row_flip)(void *user, int iter, int row, int col, uint8_t before, uint8_t after);
    void (*row_end)(void *user, int iter, int row, int rc, int errs, int changes);
    void (*col_begin)(void *user, int iter, int col);
    void (*col_flip)(void *user, int iter, int row, int col, uint8_t before, uint8_t after);
    void (*col_end)(void *user, int iter, int col, int rc, int errs, int changes);
    void (*iter_end)(void *user, int iter, int row_failures, int col_failures, int row_changes, int col_changes);
    void (*stage_end)(void *user, int rc, int rows_valid, int cols_valid);
    void *user;
} product_decode_hooks_t;

int product_init(product_ctx_t *pc,
                 int row_m, uint32_t row_prim_poly, int row_t,
                 int col_m, uint32_t col_prim_poly, int col_t);
void product_free(product_ctx_t *pc);
void product_decode_stats_reset(product_decode_stats_t *stats);

int product_encode_systematic(const product_ctx_t *pc, const uint8_t *msg, uint8_t *cw);
int product_encode_systematic_ex(const product_ctx_t *pc, const uint8_t *msg, uint8_t *cw, const product_encode_hooks_t *hooks);
void product_extract_message(const product_ctx_t *pc, const uint8_t *cw, uint8_t *msg);

int product_validate_rows(const product_ctx_t *pc, const uint8_t *cw);
int product_validate_cols(const product_ctx_t *pc, const uint8_t *cw);

int product_decode_iterative(product_ctx_t *pc, uint8_t *rx, int max_iters, product_decode_stats_t *stats);
int product_decode_iterative_ex(product_ctx_t *pc, uint8_t *rx, int max_iters, product_decode_stats_t *stats, const product_decode_hooks_t *hooks);

#endif
