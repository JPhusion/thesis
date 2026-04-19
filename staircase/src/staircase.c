#include "staircase.h"

#include <stdlib.h>
#include <string.h>

static int bit_is_binary(const uint8_t *v, int n) {
    for (int i = 0; i < n; i++) {
        if ((v[i] & ~1u) != 0u) {
            return 0;
        }
    }
    return 1;
}

static int state_idx(const staircase_ctx_t *sc, int block, int row, int col) {
    return block * sc->block_bits + row * sc->block_size + col;
}

static int shortened_encode_row(const staircase_ctx_t *sc,
                                const uint8_t *short_msg,
                                uint8_t *full_msg,
                                uint8_t *full_cw) {
    memset(full_msg, 0, (size_t)sc->prim_k);
    memcpy(full_msg, short_msg, (size_t)sc->k);
    return bch_encode_systematic_ex(&sc->bch, full_msg, full_cw, NULL, NULL);
}

static int shortened_codeword_valid(const staircase_ctx_t *sc,
                                    const uint8_t *short_msg,
                                    const uint8_t *parity,
                                    uint8_t *full_cw,
                                    uint16_t *S) {
    memset(full_cw, 0, (size_t)sc->prim_n);
    for (int i = 0; i < sc->parity_cols; i++) {
        full_cw[i] = parity[i] & 1u;
    }
    for (int i = 0; i < sc->k; i++) {
        full_cw[sc->dg + i] = short_msg[i] & 1u;
    }
    full_cw[sc->prim_n - 1] = 0u;
    bch_compute_syndromes(&sc->bch, full_cw, S);
    for (int i = 1; i <= 2 * sc->t; i++) {
        if (S[i] != 0u) {
            return 0;
        }
    }
    return 1;
}

static int shortened_decode_row(staircase_ctx_t *sc,
                                uint8_t *short_cw,
                                int *out_errs,
                                uint8_t *full_cw,
                                uint16_t *S,
                                uint16_t *lambda_poly,
                                int *err_pos) {
    memset(full_cw, 0, (size_t)sc->prim_n);
    for (int i = 0; i < sc->parity_cols; i++) {
        full_cw[i] = short_cw[i] & 1u;
    }
    for (int i = 0; i < sc->k; i++) {
        full_cw[sc->dg + i] = short_cw[sc->parity_cols + i] & 1u;
    }
    full_cw[sc->prim_n - 1] = 0u;

    const int rc = bch_decode_with_scratch(&sc->bch, full_cw, out_errs, S, lambda_poly, err_pos);
    if (rc != 0) {
        return rc;
    }

    for (int i = 0; i < sc->parity_cols; i++) {
        short_cw[i] = full_cw[i] & 1u;
    }
    for (int i = 0; i < sc->k; i++) {
        short_cw[sc->parity_cols + i] = full_cw[sc->dg + i] & 1u;
    }
    return 0;
}

int staircase_init(staircase_ctx_t *sc, int m, uint32_t prim_poly, int t, int data_blocks) {
    if (!sc || data_blocks < 1) {
        return -1;
    }

    memset(sc, 0, sizeof(*sc));
    if (bch_init(&sc->bch, m, prim_poly, t) != 0) {
        return -1;
    }

    sc->m = m;
    sc->t = t;
    sc->prim_poly = prim_poly;
    sc->prim_n = sc->bch.n;
    sc->prim_k = sc->bch.k;
    sc->prim_dg = sc->bch.dg;

    sc->n = sc->prim_n - 1;
    sc->k = sc->prim_k - 1;
    sc->dg = sc->prim_dg;
    sc->parity_cols = sc->dg;

    if ((sc->n & 1) != 0 || sc->k <= 0 || sc->parity_cols <= 0) {
        staircase_free(sc);
        return -1;
    }

    sc->block_size = sc->n / 2;
    sc->info_cols = sc->k - sc->block_size;
    if (sc->info_cols <= 0) {
        staircase_free(sc);
        return -1;
    }

    sc->data_blocks = data_blocks;
    sc->total_blocks = data_blocks + 3;
    sc->block_bits = sc->block_size * sc->block_size;
    sc->msg_bits = sc->data_blocks * sc->block_size * sc->info_cols;
    sc->state_bits = sc->total_blocks * sc->block_bits;
    sc->stored_bits = (sc->total_blocks - 1) * sc->block_bits;
    return 0;
}

void staircase_free(staircase_ctx_t *sc) {
    if (!sc) {
        return;
    }
    bch_free(&sc->bch);
    memset(sc, 0, sizeof(*sc));
}

void staircase_decode_stats_reset(staircase_decode_stats_t *stats) {
    if (!stats) {
        return;
    }
    memset(stats, 0, sizeof(*stats));
}

int staircase_encode_terminated_ex(const staircase_ctx_t *sc, const uint8_t *msg, uint8_t *state, const staircase_encode_hooks_t *hooks) {
    if (!sc || !msg || !state) {
        return -1;
    }
    if (!bit_is_binary(msg, sc->msg_bits)) {
        return -1;
    }

    void *user = hooks ? hooks->user : NULL;
    if (hooks && hooks->stage_begin) {
        hooks->stage_begin(user, sc->block_size, sc->info_cols, sc->parity_cols, sc->data_blocks, sc->total_blocks);
    }

    memset(state, 0, (size_t)sc->state_bits);

    uint8_t *short_msg = (uint8_t *)calloc((size_t)sc->k, 1);
    uint8_t *full_msg = (uint8_t *)calloc((size_t)sc->prim_k, 1);
    uint8_t *full_cw = (uint8_t *)calloc((size_t)sc->prim_n, 1);
    if (!short_msg || !full_msg || !full_cw) {
        free(short_msg);
        free(full_msg);
        free(full_cw);
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1);
        }
        return -1;
    }

    int msg_cursor = 0;
    for (int block = 1; block < sc->total_blocks; block++) {
        const int is_tail = (block > sc->data_blocks);
        if (hooks && hooks->block_begin) {
            hooks->block_begin(user, block, is_tail);
        }

        for (int row = 0; row < sc->block_size; row++) {
            for (int col = 0; col < sc->info_cols; col++) {
                uint8_t bit = 0u;
                if (!is_tail) {
                    bit = msg[msg_cursor++] & 1u;
                }
                state[state_idx(sc, block, row, col)] = bit;
                if (hooks && hooks->info_bit) {
                    hooks->info_bit(user, block, row, col, bit);
                }
            }
        }

        for (int row = 0; row < sc->block_size; row++) {
            if (hooks && hooks->row_begin) {
                hooks->row_begin(user, block, row);
            }

            for (int r = 0; r < sc->block_size; r++) {
                short_msg[r] = state[state_idx(sc, block - 1, r, row)] & 1u;
            }
            for (int c = 0; c < sc->info_cols; c++) {
                short_msg[sc->block_size + c] = state[state_idx(sc, block, row, c)] & 1u;
            }

            if (shortened_encode_row(sc, short_msg, full_msg, full_cw) != 0) {
                free(short_msg);
                free(full_msg);
                free(full_cw);
                if (hooks && hooks->stage_end) {
                    hooks->stage_end(user, -1);
                }
                return -1;
            }

            for (int p = 0; p < sc->parity_cols; p++) {
                const int col = sc->info_cols + p;
                const uint8_t bit = full_cw[p] & 1u;
                state[state_idx(sc, block, row, col)] = bit;
                if (hooks && hooks->parity_write) {
                    hooks->parity_write(user, block, row, col, bit);
                }
            }

            if (hooks && hooks->row_end) {
                hooks->row_end(user, block, row);
            }
        }

        if (hooks && hooks->block_end) {
            hooks->block_end(user, block);
        }
    }

    free(short_msg);
    free(full_msg);
    free(full_cw);

    if (hooks && hooks->stage_end) {
        hooks->stage_end(user, 0);
    }
    return 0;
}

int staircase_encode_terminated(const staircase_ctx_t *sc, const uint8_t *msg, uint8_t *state) {
    return staircase_encode_terminated_ex(sc, msg, state, NULL);
}

int staircase_validate(const staircase_ctx_t *sc, const uint8_t *state) {
    if (!sc || !state) {
        return -1;
    }

    uint8_t *short_msg = (uint8_t *)calloc((size_t)sc->k, 1);
    uint8_t *parity = (uint8_t *)calloc((size_t)sc->parity_cols, 1);
    uint8_t *full_cw = (uint8_t *)calloc((size_t)sc->prim_n, 1);
    uint16_t *S = (uint16_t *)calloc((size_t)(2 * sc->t + 1), sizeof(uint16_t));
    if (!short_msg || !parity || !full_cw || !S) {
        free(short_msg);
        free(parity);
        free(full_cw);
        free(S);
        return -1;
    }

    int ok = 1;
    for (int block = 1; block < sc->total_blocks && ok; block++) {
        for (int row = 0; row < sc->block_size; row++) {
            for (int r = 0; r < sc->block_size; r++) {
                short_msg[r] = state[state_idx(sc, block - 1, r, row)] & 1u;
            }
            for (int c = 0; c < sc->info_cols; c++) {
                short_msg[sc->block_size + c] = state[state_idx(sc, block, row, c)] & 1u;
            }
            for (int p = 0; p < sc->parity_cols; p++) {
                parity[p] = state[state_idx(sc, block, row, sc->info_cols + p)] & 1u;
            }
            if (!shortened_codeword_valid(sc, short_msg, parity, full_cw, S)) {
                ok = 0;
                break;
            }
        }
    }

    free(short_msg);
    free(parity);
    free(full_cw);
    free(S);
    return ok;
}

int staircase_decode_windowed_ex(staircase_ctx_t *sc, uint8_t *state, int window_size, int max_iters, staircase_decode_stats_t *stats, const staircase_decode_hooks_t *hooks) {
    if (!sc || !state || window_size < 1 || max_iters < 0) {
        return -1;
    }
    if (!bit_is_binary(state, sc->state_bits)) {
        return -1;
    }

    staircase_decode_stats_t local_stats;
    if (!stats) {
        stats = &local_stats;
    }
    staircase_decode_stats_reset(stats);
    stats->window_size = window_size;
    stats->max_iters = max_iters;

    void *user = hooks ? hooks->user : NULL;
    if (hooks && hooks->stage_begin) {
        hooks->stage_begin(user, sc->total_blocks, sc->block_size, sc->info_cols, sc->parity_cols, window_size, max_iters);
    }

    uint8_t *short_cw = (uint8_t *)calloc((size_t)sc->n, 1);
    uint8_t *full_cw = (uint8_t *)calloc((size_t)sc->prim_n, 1);
    uint16_t *S = (uint16_t *)calloc((size_t)(2 * sc->t + 1), sizeof(uint16_t));
    uint16_t *lambda_poly = (uint16_t *)calloc((size_t)(sc->t + 1), sizeof(uint16_t));
    int *err_pos = (int *)calloc((size_t)sc->t, sizeof(int));
    if (!short_cw || !full_cw || !S || !lambda_poly || !err_pos) {
        free(short_cw);
        free(full_cw);
        free(S);
        free(lambda_poly);
        free(err_pos);
        if (hooks && hooks->stage_end) {
            hooks->stage_end(user, -1, 0, 0);
        }
        return -1;
    }

    int locked_upto = 0;
    for (int output_block = 1; output_block < sc->total_blocks; output_block++) {
        const int window_idx = output_block - 1;
        const int end_block = output_block + window_size - 1 < sc->total_blocks
            ? output_block + window_size - 1
            : sc->total_blocks - 1;
        stats->windows_run = window_idx + 1;

        if (hooks && hooks->window_begin) {
            hooks->window_begin(user, window_idx, output_block, output_block, end_block);
        }

        for (int iter = 0; iter < max_iters; iter++) {
            int iter_failures = 0;
            int iter_changes = 0;
            stats->iterations_run++;

            if (hooks && hooks->iter_begin) {
                hooks->iter_begin(user, window_idx, iter);
            }

            for (int block = output_block; block <= end_block; block++) {
                const int source_locked = (block - 1) <= locked_upto;
                for (int row = 0; row < sc->block_size; row++) {
                    if (hooks && hooks->row_begin) {
                        hooks->row_begin(user, window_idx, iter, block, row, source_locked);
                    }

                    for (int p = 0; p < sc->parity_cols; p++) {
                        short_cw[p] = state[state_idx(sc, block, row, sc->info_cols + p)] & 1u;
                    }
                    for (int r = 0; r < sc->block_size; r++) {
                        short_cw[sc->parity_cols + r] = (block == 1)
                            ? 0u
                            : (state[state_idx(sc, block - 1, r, row)] & 1u);
                    }
                    for (int c = 0; c < sc->info_cols; c++) {
                        short_cw[sc->parity_cols + sc->block_size + c] = state[state_idx(sc, block, row, c)] & 1u;
                    }

                    int errs = -1;
                    int rc = shortened_decode_row(sc, short_cw, &errs, full_cw, S, lambda_poly, err_pos);
                    int changes = 0;
                    stats->total_row_decodes++;

                    if (rc == 0) {
                        if (block > 1 && !source_locked) {
                            for (int r = 0; r < sc->block_size; r++) {
                                const int idx = state_idx(sc, block - 1, r, row);
                                const uint8_t before = state[idx] & 1u;
                                const uint8_t after = short_cw[sc->parity_cols + r] & 1u;
                                if (before != after) {
                                    state[idx] = after;
                                    changes++;
                                    if (hooks && hooks->flip) {
                                        hooks->flip(user, window_idx, iter, block, block - 1, r, row, before, after);
                                    }
                                }
                            }
                        }

                        for (int c = 0; c < sc->info_cols; c++) {
                            const int idx = state_idx(sc, block, row, c);
                            const uint8_t before = state[idx] & 1u;
                            const uint8_t after = short_cw[sc->parity_cols + sc->block_size + c] & 1u;
                            if (before != after) {
                                state[idx] = after;
                                changes++;
                                if (hooks && hooks->flip) {
                                    hooks->flip(user, window_idx, iter, block, block, row, c, before, after);
                                }
                            }
                        }
                        for (int p = 0; p < sc->parity_cols; p++) {
                            const int col = sc->info_cols + p;
                            const int idx = state_idx(sc, block, row, col);
                            const uint8_t before = state[idx] & 1u;
                            const uint8_t after = short_cw[p] & 1u;
                            if (before != after) {
                                state[idx] = after;
                                changes++;
                                if (hooks && hooks->flip) {
                                    hooks->flip(user, window_idx, iter, block, block, row, col, before, after);
                                }
                            }
                        }
                    } else {
                        iter_failures++;
                        stats->total_row_failures++;
                    }

                    iter_changes += changes;
                    stats->total_row_changes += changes;
                    if (hooks && hooks->row_end) {
                        hooks->row_end(user, window_idx, iter, block, row, rc, errs, changes);
                    }
                }
            }

            if (hooks && hooks->iter_end) {
                hooks->iter_end(user, window_idx, iter, iter_failures, iter_changes);
            }
        }

        locked_upto = output_block;
        stats->locked_blocks = locked_upto;
        if (hooks && hooks->window_lock) {
            hooks->window_lock(user, window_idx, output_block);
        }
    }

    stats->final_valid = staircase_validate(sc, state);

    free(short_cw);
    free(full_cw);
    free(S);
    free(lambda_poly);
    free(err_pos);

    const int rc = (stats->final_valid == 1) ? 0 : -1;
    if (hooks && hooks->stage_end) {
        hooks->stage_end(user, rc, stats->final_valid, stats->locked_blocks);
    }
    return rc;
}

int staircase_decode_windowed(staircase_ctx_t *sc, uint8_t *state, int window_size, int max_iters, staircase_decode_stats_t *stats) {
    return staircase_decode_windowed_ex(sc, state, window_size, max_iters, stats, NULL);
}

void staircase_extract_message(const staircase_ctx_t *sc, const uint8_t *state, uint8_t *msg) {
    if (!sc || !state || !msg) {
        return;
    }

    int cursor = 0;
    for (int block = 1; block <= sc->data_blocks; block++) {
        for (int row = 0; row < sc->block_size; row++) {
            for (int col = 0; col < sc->info_cols; col++) {
                msg[cursor++] = state[state_idx(sc, block, row, col)] & 1u;
            }
        }
    }
}

void staircase_extract_stored(const staircase_ctx_t *sc, const uint8_t *state, uint8_t *stored) {
    if (!sc || !state || !stored) {
        return;
    }
    memcpy(stored, state + sc->block_bits, (size_t)sc->stored_bits);
}

void staircase_import_stored(const staircase_ctx_t *sc, const uint8_t *stored, uint8_t *state) {
    if (!sc || !stored || !state) {
        return;
    }
    memset(state, 0, (size_t)sc->state_bits);
    memcpy(state + sc->block_bits, stored, (size_t)sc->stored_bits);
}
