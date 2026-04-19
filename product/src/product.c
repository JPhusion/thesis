#include "product.h"

#include <stdlib.h>
#include <string.h>

static int matrix_idx(int width, int row, int col) {
    return row * width + col;
}

static int bit_is_binary(const uint8_t *v, int n) {
    for (int i = 0; i < n; i++) {
        if ((v[i] & ~1u) != 0u) {
            return 0;
        }
    }
    return 1;
}

static int syndromes_all_zero(const uint16_t *S, int ns) {
    for (int i = 1; i <= ns; i++) {
        if (S[i] != 0u) {
            return 0;
        }
    }
    return 1;
}

static int count_valid_rows_internal(const product_ctx_t *pc, const uint8_t *cw) {
    if (!pc || !cw) {
        return 0;
    }

    const int ns = 2 * pc->row_t;
    uint8_t *row = (uint8_t *)calloc((size_t)pc->row_n, 1);
    uint16_t *S = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    if (!row || !S) {
        free(row);
        free(S);
        return -1;
    }

    int valid = 0;
    for (int r = 0; r < pc->code_rows; r++) {
        memcpy(row, cw + matrix_idx(pc->code_cols, r, 0), (size_t)pc->row_n);
        bch_compute_syndromes(&pc->row_bch, row, S);
        if (syndromes_all_zero(S, ns)) {
            valid++;
        }
    }

    free(row);
    free(S);
    return valid;
}

static int count_valid_cols_internal(const product_ctx_t *pc, const uint8_t *cw) {
    if (!pc || !cw) {
        return 0;
    }

    const int ns = 2 * pc->col_t;
    uint8_t *col = (uint8_t *)calloc((size_t)pc->col_n, 1);
    uint16_t *S = (uint16_t *)calloc((size_t)(ns + 1), sizeof(uint16_t));
    if (!col || !S) {
        free(col);
        free(S);
        return -1;
    }

    int valid = 0;
    for (int c = 0; c < pc->code_cols; c++) {
        for (int r = 0; r < pc->code_rows; r++) {
            col[r] = cw[matrix_idx(pc->code_cols, r, c)] & 1u;
        }
        bch_compute_syndromes(&pc->col_bch, col, S);
        if (syndromes_all_zero(S, ns)) {
            valid++;
        }
    }

    free(col);
    free(S);
    return valid;
}

int product_init(product_ctx_t *pc,
                 int row_m, uint32_t row_prim_poly, int row_t,
                 int col_m, uint32_t col_prim_poly, int col_t) {
    if (!pc) {
        return -1;
    }

    memset(pc, 0, sizeof(*pc));

    if (bch_init(&pc->row_bch, row_m, row_prim_poly, row_t) != 0) {
        return -1;
    }
    if (bch_init(&pc->col_bch, col_m, col_prim_poly, col_t) != 0) {
        bch_free(&pc->row_bch);
        memset(&pc->row_bch, 0, sizeof(pc->row_bch));
        return -1;
    }

    pc->row_m = row_m;
    pc->row_t = row_t;
    pc->row_n = pc->row_bch.n;
    pc->row_k = pc->row_bch.k;
    pc->row_dg = pc->row_bch.dg;
    pc->row_prim_poly = row_prim_poly;

    pc->col_m = col_m;
    pc->col_t = col_t;
    pc->col_n = pc->col_bch.n;
    pc->col_k = pc->col_bch.k;
    pc->col_dg = pc->col_bch.dg;
    pc->col_prim_poly = col_prim_poly;

    pc->info_rows = pc->col_k;
    pc->info_cols = pc->row_k;
    pc->code_rows = pc->col_n;
    pc->code_cols = pc->row_n;
    pc->msg_bits = pc->info_rows * pc->info_cols;
    pc->cw_bits = pc->code_rows * pc->code_cols;
    return 0;
}

void product_free(product_ctx_t *pc) {
    if (!pc) {
        return;
    }
    bch_free(&pc->row_bch);
    bch_free(&pc->col_bch);
    memset(pc, 0, sizeof(*pc));
}

void product_decode_stats_reset(product_decode_stats_t *stats) {
    if (!stats) {
        return;
    }
    memset(stats, 0, sizeof(*stats));
}

int product_encode_systematic_ex(const product_ctx_t *pc, const uint8_t *msg, uint8_t *cw, const product_encode_hooks_t *hooks) {
    if (!pc || !msg || !cw) {
        return -1;
    }
    if (pc->msg_bits <= 0 || pc->cw_bits <= 0) {
        return -1;
    }
    if (!bit_is_binary(msg, pc->msg_bits)) {
        return -1;
    }

    void *user = hooks ? hooks->user : NULL;
    if (hooks && hooks->stage_begin) {
        hooks->stage_begin(user, pc->info_rows, pc->info_cols, pc->code_rows, pc->code_cols);
    }

    uint8_t *info_row = (uint8_t *)calloc((size_t)pc->info_cols, 1);
    uint8_t *row_cw = (uint8_t *)calloc((size_t)pc->code_cols, 1);
    uint8_t *col_msg = (uint8_t *)calloc((size_t)pc->info_rows, 1);
    uint8_t *col_cw = (uint8_t *)calloc((size_t)pc->code_rows, 1);
    uint8_t *intermediate = (uint8_t *)calloc((size_t)(pc->info_rows * pc->code_cols), 1);
    if (!info_row || !row_cw || !col_msg || !col_cw || !intermediate) {
        free(info_row);
        free(row_cw);
        free(col_msg);
        free(col_cw);
        free(intermediate);
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1);
        }
        return -1;
    }

    memset(cw, 0, (size_t)pc->cw_bits);

    for (int r = 0; r < pc->info_rows; r++) {
        if (hooks && hooks->row_begin) {
            hooks->row_begin(user, r);
        }

        for (int c = 0; c < pc->info_cols; c++) {
            const uint8_t bit = msg[matrix_idx(pc->info_cols, r, c)] & 1u;
            info_row[c] = bit;
            if (hooks && hooks->info_bit) {
                hooks->info_bit(user, r, c, bit);
            }
        }

        if (bch_encode_systematic_ex(&pc->row_bch, info_row, row_cw, NULL, NULL) != 0) {
            free(info_row);
            free(row_cw);
            free(col_msg);
            free(col_cw);
            free(intermediate);
            if (hooks && hooks->stage_end) {
                hooks->stage_end(user, -1);
            }
            return -1;
        }

        for (int c = 0; c < pc->code_cols; c++) {
            intermediate[matrix_idx(pc->code_cols, r, c)] = row_cw[c] & 1u;
            if (hooks && hooks->row_write) {
                hooks->row_write(user, r, c, row_cw[c] & 1u);
            }
        }
        if (hooks && hooks->row_end) {
            hooks->row_end(user, r);
        }
    }

    for (int c = 0; c < pc->code_cols; c++) {
        if (hooks && hooks->col_begin) {
            hooks->col_begin(user, c);
        }
        for (int r = 0; r < pc->info_rows; r++) {
            col_msg[r] = intermediate[matrix_idx(pc->code_cols, r, c)] & 1u;
        }
        if (bch_encode_systematic_ex(&pc->col_bch, col_msg, col_cw, NULL, NULL) != 0) {
            free(info_row);
            free(row_cw);
            free(col_msg);
            free(col_cw);
            free(intermediate);
            if (hooks && hooks->stage_end) {
                hooks->stage_end(user, -1);
            }
            return -1;
        }
        for (int r = 0; r < pc->code_rows; r++) {
            cw[matrix_idx(pc->code_cols, r, c)] = col_cw[r] & 1u;
            if (hooks && hooks->col_write) {
                hooks->col_write(user, r, c, col_cw[r] & 1u);
            }
        }
        if (hooks && hooks->col_end) {
            hooks->col_end(user, c);
        }
    }

    free(info_row);
    free(row_cw);
    free(col_msg);
    free(col_cw);
    free(intermediate);

    if (hooks && hooks->stage_end) {
        hooks->stage_end(user, 0);
    }
    return 0;
}

int product_encode_systematic(const product_ctx_t *pc, const uint8_t *msg, uint8_t *cw) {
    return product_encode_systematic_ex(pc, msg, cw, NULL);
}

void product_extract_message(const product_ctx_t *pc, const uint8_t *cw, uint8_t *msg) {
    if (!pc || !cw || !msg) {
        return;
    }

    for (int r = 0; r < pc->info_rows; r++) {
        for (int c = 0; c < pc->info_cols; c++) {
            msg[matrix_idx(pc->info_cols, r, c)] = cw[matrix_idx(pc->code_cols, pc->col_dg + r, pc->row_dg + c)] & 1u;
        }
    }
}

int product_validate_rows(const product_ctx_t *pc, const uint8_t *cw) {
    const int valid = count_valid_rows_internal(pc, cw);
    return valid == pc->code_rows;
}

int product_validate_cols(const product_ctx_t *pc, const uint8_t *cw) {
    const int valid = count_valid_cols_internal(pc, cw);
    return valid == pc->code_cols;
}

int product_decode_iterative_ex(product_ctx_t *pc, uint8_t *rx, int max_iters, product_decode_stats_t *stats, const product_decode_hooks_t *hooks) {
    if (!pc || !rx || max_iters < 0) {
        return -1;
    }

    if (!bit_is_binary(rx, pc->cw_bits)) {
        return -1;
    }

    product_decode_stats_t local_stats;
    if (!stats) {
        stats = &local_stats;
    }
    product_decode_stats_reset(stats);
    stats->max_iters = max_iters;

    void *user = hooks ? hooks->user : NULL;
    if (hooks && hooks->stage_begin) {
        hooks->stage_begin(user, pc->code_rows, pc->code_cols, max_iters);
    }

    uint8_t *work = (uint8_t *)calloc((size_t)pc->cw_bits, 1);
    uint8_t *row = (uint8_t *)calloc((size_t)pc->code_cols, 1);
    uint8_t *col = (uint8_t *)calloc((size_t)pc->code_rows, 1);
    uint16_t *row_S = (uint16_t *)calloc((size_t)(2 * pc->row_t + 1), sizeof(uint16_t));
    uint16_t *row_lambda = (uint16_t *)calloc((size_t)(pc->row_t + 1), sizeof(uint16_t));
    int *row_err_pos = (int *)calloc((size_t)pc->row_t, sizeof(int));
    uint16_t *col_S = (uint16_t *)calloc((size_t)(2 * pc->col_t + 1), sizeof(uint16_t));
    uint16_t *col_lambda = (uint16_t *)calloc((size_t)(pc->col_t + 1), sizeof(uint16_t));
    int *col_err_pos = (int *)calloc((size_t)pc->col_t, sizeof(int));
    if (!work || !row || !col || !row_S || !row_lambda || !row_err_pos || !col_S || !col_lambda || !col_err_pos) {
        free(work);
        free(row);
        free(col);
        free(row_S);
        free(row_lambda);
        free(row_err_pos);
        free(col_S);
        free(col_lambda);
        free(col_err_pos);
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1, 0, 0);
        }
        return -1;
    }

    memcpy(work, rx, (size_t)pc->cw_bits);

    for (int iter = 0; iter < max_iters; iter++) {
        int iter_row_failures = 0;
        int iter_col_failures = 0;
        int iter_row_changes = 0;
        int iter_col_changes = 0;
        stats->iterations_run = iter + 1;

        if (hooks && hooks->iter_begin) {
            hooks->iter_begin(user, iter);
        }

        for (int r = 0; r < pc->code_rows; r++) {
            if (hooks && hooks->row_begin) {
                hooks->row_begin(user, iter, r);
            }
            memcpy(row, work + matrix_idx(pc->code_cols, r, 0), (size_t)pc->code_cols);
            int errs = -1;
            int rc = bch_decode_with_scratch(&pc->row_bch, row, &errs, row_S, row_lambda, row_err_pos);
            int changes = 0;
            if (rc == 0) {
                for (int c = 0; c < pc->code_cols; c++) {
                    const uint8_t before = work[matrix_idx(pc->code_cols, r, c)] & 1u;
                    const uint8_t after = row[c] & 1u;
                    if (before != after) {
                        work[matrix_idx(pc->code_cols, r, c)] = after;
                        changes++;
                        if (hooks && hooks->row_flip) {
                            hooks->row_flip(user, iter, r, c, before, after);
                        }
                    }
                }
            } else {
                iter_row_failures++;
                stats->total_row_failures++;
            }
            iter_row_changes += changes;
            stats->total_row_changes += changes;
            if (hooks && hooks->row_end) {
                hooks->row_end(user, iter, r, rc, errs, changes);
            }
        }

        for (int c = 0; c < pc->code_cols; c++) {
            if (hooks && hooks->col_begin) {
                hooks->col_begin(user, iter, c);
            }
            for (int r = 0; r < pc->code_rows; r++) {
                col[r] = work[matrix_idx(pc->code_cols, r, c)] & 1u;
            }
            int errs = -1;
            int rc = bch_decode_with_scratch(&pc->col_bch, col, &errs, col_S, col_lambda, col_err_pos);
            int changes = 0;
            if (rc == 0) {
                for (int r = 0; r < pc->code_rows; r++) {
                    const uint8_t before = work[matrix_idx(pc->code_cols, r, c)] & 1u;
                    const uint8_t after = col[r] & 1u;
                    if (before != after) {
                        work[matrix_idx(pc->code_cols, r, c)] = after;
                        changes++;
                        if (hooks && hooks->col_flip) {
                            hooks->col_flip(user, iter, r, c, before, after);
                        }
                    }
                }
            } else {
                iter_col_failures++;
                stats->total_col_failures++;
            }
            iter_col_changes += changes;
            stats->total_col_changes += changes;
            if (hooks && hooks->col_end) {
                hooks->col_end(user, iter, c, rc, errs, changes);
            }
        }

        if (hooks && hooks->iter_end) {
            hooks->iter_end(user, iter, iter_row_failures, iter_col_failures, iter_row_changes, iter_col_changes);
        }
    }

    memcpy(rx, work, (size_t)pc->cw_bits);
    const int valid_rows = count_valid_rows_internal(pc, work);
    const int valid_cols = count_valid_cols_internal(pc, work);
    stats->final_rows_valid = (valid_rows < 0) ? 0 : valid_rows;
    stats->final_cols_valid = (valid_cols < 0) ? 0 : valid_cols;

    free(work);
    free(row);
    free(col);
    free(row_S);
    free(row_lambda);
    free(row_err_pos);
    free(col_S);
    free(col_lambda);
    free(col_err_pos);

    const int success = (valid_rows == pc->code_rows && valid_cols == pc->code_cols) ? 0 : -1;
    if (hooks && hooks->stage_end) {
        hooks->stage_end(user, success, stats->final_rows_valid, stats->final_cols_valid);
    }
    return success;
}

int product_decode_iterative(product_ctx_t *pc, uint8_t *rx, int max_iters, product_decode_stats_t *stats) {
    return product_decode_iterative_ex(pc, rx, max_iters, stats, NULL);
}
