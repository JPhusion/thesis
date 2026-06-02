#include <errno.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "staircase.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct {
    int m;
    uint32_t prim_poly;
    int t;
    int data_blocks;
    int window_size;
    int max_iters;
    double start_db;
    double end_db;
    double step_db;
    int target_errors;
    int max_frames;
    int streaming;
    uint64_t seed;
    const char *out_path;
    const char *label;
} sweep_cfg_t;

typedef struct {
    uint64_t state;
    int has_spare;
    double spare;
} rng_t;

static uint64_t splitmix64_next(uint64_t *state) {
    uint64_t z = (*state += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}

static void rng_init(rng_t *rng, uint64_t seed) {
    rng->state = seed;
    rng->has_spare = 0;
    rng->spare = 0.0;
}

static double rng_uniform(rng_t *rng) {
    const uint64_t x = splitmix64_next(&rng->state);
    return ((x >> 11) * (1.0 / 9007199254740992.0));
}

static double rng_gaussian(rng_t *rng) {
    if (rng->has_spare) {
        rng->has_spare = 0;
        return rng->spare;
    }

    double u1 = rng_uniform(rng);
    double u2 = rng_uniform(rng);
    if (u1 < 1e-12) {
        u1 = 1e-12;
    }

    const double mag = sqrt(-2.0 * log(u1));
    const double theta = 2.0 * M_PI * u2;
    rng->spare = mag * sin(theta);
    rng->has_spare = 1;
    return mag * cos(theta);
}

static void random_bits(uint8_t *dst, int len, rng_t *rng) {
    for (int i = 0; i < len; i++) {
        dst[i] = (rng_uniform(rng) >= 0.5) ? 1u : 0u;
    }
}

static uint32_t parse_u32(const char *s) {
    if (!s) {
        return 0u;
    }
    if ((s[0] == '0') && (s[1] == 'x' || s[1] == 'X')) {
        return (uint32_t)strtoul(s + 2, NULL, 16);
    }
    if ((s[0] == '0') && (s[1] == 'b' || s[1] == 'B')) {
        uint32_t v = 0u;
        for (const char *p = s + 2; *p; p++) {
            v = (v << 1) | (uint32_t)(*p == '1');
        }
        return v;
    }
    return (uint32_t)strtoul(s, NULL, 10);
}

static int parse_int_arg(const char *value, int *out) {
    char *end = NULL;
    long v = strtol(value, &end, 10);
    if (!value || !*value || (end && *end)) {
        return -1;
    }
    *out = (int)v;
    return 0;
}

static int parse_double_arg(const char *value, double *out) {
    char *end = NULL;
    double v = strtod(value, &end);
    if (!value || !*value || (end && *end)) {
        return -1;
    }
    *out = v;
    return 0;
}

static int parse_u64_arg(const char *value, uint64_t *out) {
    char *end = NULL;
    unsigned long long v = strtoull(value, &end, 10);
    if (!value || !*value || (end && *end)) {
        return -1;
    }
    *out = (uint64_t)v;
    return 0;
}

static int count_bit_errors(const uint8_t *a, const uint8_t *b, int len) {
    int errs = 0;
    for (int i = 0; i < len; i++) {
        if ((a[i] & 1u) != (b[i] & 1u)) {
            errs++;
        }
    }
    return errs;
}

static void usage(const char *argv0) {
    fprintf(stderr,
            "Usage: %s --m M --t T --prim POLY --data-blocks N [--window W] [--max-iters I] \\\n"
            "          [--start-db X] [--end-db Y] [--step-db D] [--target-errors N] [--max-frames N] [--seed S] \\\n"
            "          [--label NAME] --out FILE.csv\n",
            argv0);
}

static int parse_args(int argc, char **argv, sweep_cfg_t *cfg) {
    *cfg = (sweep_cfg_t){
        .m = 6,
        .prim_poly = 0b1000011u,
        .t = 2,
        .data_blocks = 7,
        .window_size = 3,
        .max_iters = 3,
        .start_db = 0.0,
        .end_db = 6.0,
        .step_db = 0.1,
        .target_errors = 300,
        .max_frames = 0,
        .streaming = 0,
        .seed = 0x57A1CADE12345678ULL,
        .out_path = NULL,
        .label = "staircase"
    };

    for (int i = 1; i < argc; i++) {
        const char *arg = argv[i];
        if (strcmp(arg, "--m") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->m) != 0) return -1;
        } else if (strcmp(arg, "--t") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->t) != 0) return -1;
        } else if (strcmp(arg, "--prim") == 0 && i + 1 < argc) {
            cfg->prim_poly = parse_u32(argv[++i]);
        } else if (strcmp(arg, "--data-blocks") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->data_blocks) != 0) return -1;
        } else if (strcmp(arg, "--window") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->window_size) != 0) return -1;
        } else if (strcmp(arg, "--max-iters") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->max_iters) != 0) return -1;
        } else if (strcmp(arg, "--start-db") == 0 && i + 1 < argc) {
            if (parse_double_arg(argv[++i], &cfg->start_db) != 0) return -1;
        } else if (strcmp(arg, "--end-db") == 0 && i + 1 < argc) {
            if (parse_double_arg(argv[++i], &cfg->end_db) != 0) return -1;
        } else if (strcmp(arg, "--step-db") == 0 && i + 1 < argc) {
            if (parse_double_arg(argv[++i], &cfg->step_db) != 0) return -1;
        } else if (strcmp(arg, "--target-errors") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->target_errors) != 0) return -1;
        } else if ((strcmp(arg, "--max-frames") == 0 || strcmp(arg, "--frames") == 0) && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->max_frames) != 0) return -1;
        } else if (strcmp(arg, "--streaming") == 0) {
            cfg->streaming = 1;
        } else if (strcmp(arg, "--mode") == 0 && i + 1 < argc) {
            const char *mode = argv[++i];
            if (strcmp(mode, "streaming") == 0) {
                cfg->streaming = 1;
            } else if (strcmp(mode, "terminated") == 0) {
                cfg->streaming = 0;
            } else {
                fprintf(stderr, "Unknown --mode: %s (use terminated|streaming)\n", mode);
                return -1;
            }
        } else if (strcmp(arg, "--seed") == 0 && i + 1 < argc) {
            if (parse_u64_arg(argv[++i], &cfg->seed) != 0) return -1;
        } else if (strcmp(arg, "--out") == 0 && i + 1 < argc) {
            cfg->out_path = argv[++i];
        } else if (strcmp(arg, "--label") == 0 && i + 1 < argc) {
            cfg->label = argv[++i];
        } else if (strcmp(arg, "--help") == 0 || strcmp(arg, "-h") == 0) {
            usage(argv[0]);
            exit(0);
        } else {
            fprintf(stderr, "Unknown or incomplete arg: %s\n", arg);
            return -1;
        }
    }

    if (!cfg->out_path || cfg->target_errors <= 0 || cfg->max_frames < 0 || cfg->step_db <= 0.0 || cfg->data_blocks <= 0 || cfg->window_size <= 0 || cfg->max_iters <= 0) {
        return -1;
    }
    return 0;
}

static int run_sweep(const sweep_cfg_t *cfg) {
    staircase_ctx_t sc;
    if (staircase_init(&sc, cfg->m, cfg->prim_poly, cfg->t, cfg->data_blocks) != 0) {
        fprintf(stderr, "staircase_init failed\n");
        return 1;
    }

    FILE *fp = fopen(cfg->out_path, "w");
    if (!fp) {
        fprintf(stderr, "Failed to open %s: %s\n", cfg->out_path, strerror(errno));
        staircase_free(&sc);
        return 1;
    }

    fprintf(fp, "# label,%s\n", cfg->label);
    fprintf(fp, "# staircase,short_bch,%d,%d,%d,0x%x\n", sc.n, sc.k, sc.t, sc.prim_poly);
    fprintf(fp, "# block_size,%d\n", sc.block_size);
    fprintf(fp, "# info_cols,%d\n", sc.info_cols);
    fprintf(fp, "# parity_cols,%d\n", sc.parity_cols);
    fprintf(fp, "# data_blocks,%d\n", sc.data_blocks);
    fprintf(fp, "# total_blocks,%d\n", sc.total_blocks);
    fprintf(fp, "# window,%d\n", cfg->window_size);
    fprintf(fp, "# max_iters,%d\n", cfg->max_iters);
    fprintf(fp, "# target_errors,%d\n", cfg->target_errors);
    fprintf(fp, "# max_frames,%d\n", cfg->max_frames);
    fprintf(fp, "snr_db,raw_ber,decoded_ber,frame_success,frames,raw_errors,decoded_errors,payload_bits,success_frames\n");

    uint8_t *msg = (uint8_t *)calloc((size_t)sc.msg_bits, 1);
    uint8_t *tx_state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    uint8_t *rx_state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    uint8_t *stored = (uint8_t *)calloc((size_t)sc.stored_bits, 1);
    uint8_t *rx_stored = (uint8_t *)calloc((size_t)sc.stored_bits, 1);
    uint8_t *decoded_stored = (uint8_t *)calloc((size_t)sc.stored_bits, 1);
    if (!msg || !tx_state || !rx_state || !stored || !rx_stored || !decoded_stored) {
        fprintf(stderr, "Allocation failed for sweep buffers\n");
        free(msg);
        free(tx_state);
        free(rx_state);
        free(stored);
        free(rx_stored);
        free(decoded_stored);
        fclose(fp);
        staircase_free(&sc);
        return 1;
    }

    const double rate = (double)sc.msg_bits / (double)sc.stored_bits;
    const int point_count = (int)floor(((cfg->end_db - cfg->start_db) / cfg->step_db) + 0.5) + 1;
    rng_t rng;
    rng_init(&rng, cfg->seed ^ ((uint64_t)sc.block_size << 32) ^ (uint64_t)sc.data_blocks);

    const clock_t t0 = clock();
    for (int point = 0; point < point_count; point++) {
        const double snr_db = cfg->start_db + cfg->step_db * (double)point;
        const double snr_linear = pow(10.0, snr_db / 10.0);
        const double sigma = sqrt(1.0 / (2.0 * rate * snr_linear));
        unsigned long long raw_errs = 0ull;
        unsigned long long decoded_errs = 0ull;
        unsigned long long success_frames = 0ull;
        unsigned long long frames_run = 0ull;

        while (decoded_errs < (unsigned long long)cfg->target_errors) {
            staircase_decode_stats_t stats;
            random_bits(msg, sc.msg_bits, &rng);
            if (staircase_encode_terminated(&sc, msg, tx_state) != 0) {
                fprintf(stderr, "staircase_encode_terminated failed at %.2f dB\n", snr_db);
                free(msg); free(tx_state); free(rx_state); free(stored); free(rx_stored); free(decoded_stored);
                fclose(fp); staircase_free(&sc);
                return 1;
            }

            staircase_extract_stored(&sc, tx_state, stored);

            for (int bit = 0; bit < sc.stored_bits; bit++) {
                const double symbol = stored[bit] ? -1.0 : 1.0;
                const double noisy = symbol + sigma * rng_gaussian(&rng);
                rx_stored[bit] = (noisy < 0.0) ? 1u : 0u;
                if (rx_stored[bit] != stored[bit]) {
                    raw_errs++;
                }
            }

            staircase_import_stored(&sc, rx_stored, rx_state);
            (void)staircase_decode_windowed(&sc, rx_state, cfg->window_size, cfg->max_iters, &stats);
            staircase_extract_stored(&sc, rx_state, decoded_stored);

            const int frame_errs = count_bit_errors(decoded_stored, stored, sc.stored_bits);
            decoded_errs += (unsigned long long)frame_errs;
            frames_run++;
            if (frame_errs == 0) {
                success_frames++;
            }
            if (cfg->max_frames > 0 && frames_run >= (unsigned long long)cfg->max_frames) {
                break;
            }
        }

        const double raw_ber = (double)raw_errs / ((double)sc.stored_bits * (double)frames_run);
        const double decoded_ber = (double)decoded_errs / ((double)sc.stored_bits * (double)frames_run);
        const double frame_success = (double)success_frames / (double)frames_run;
        const unsigned long long payload_bits = (unsigned long long)sc.stored_bits * frames_run;
        fprintf(fp, "%.3f,%.12g,%.12g,%.12g,%llu,%llu,%llu,%llu,%llu\n", snr_db, raw_ber, decoded_ber, frame_success, frames_run, raw_errs, decoded_errs, payload_bits, success_frames);
        fflush(fp);

        const double elapsed = (double)(clock() - t0) / (double)CLOCKS_PER_SEC;
        fprintf(stderr,
                "[%s] %2d/%d  Eb/N0=%.1f dB  raw=%.6g  decoded=%.6g  success=%.2f%%  frames=%llu  elapsed=%.1fs\n",
                cfg->label,
                point + 1,
                point_count,
                snr_db,
                raw_ber,
                decoded_ber,
                frame_success * 100.0,
                frames_run,
                elapsed);
    }

    free(msg);
    free(tx_state);
    free(rx_state);
    free(stored);
    free(rx_stored);
    free(decoded_stored);
    fclose(fp);
    staircase_free(&sc);
    return 0;
}

/* ---- Continuous (streaming) staircase simulation ------------------------- *
 * Mirrors the paper's sliding-window decoder: a long chain of m x m blocks is
 * streamed through a window of W blocks decoded for `iters` iterations; the
 * leftmost block is finalized (its BER measured) and the window slides on by
 * one block. This yields the asymptotic staircase rate (info_cols/block_size)
 * with O(1) memory in the chain length, unlike the terminated whole-array sim.
 */

typedef struct {
    int m;          /* block_size */
    int ic;         /* info_cols */
    int pc;         /* parity_cols (== dg) */
    int dg;
    int prim_n;
    int prim_k;
    size_t blk;     /* m*m bits per block */
} stream_dims_t;

/* Encode one fresh block: random info columns, then BCH parity per row using
 * `prev_tx` (the transmitted previous block) as the coupled column source.
 * Then pass through BPSK+AWGN into rx_blk, counting raw channel errors. */
static void stream_make_block(staircase_ctx_t *sc, const stream_dims_t *d,
                              const uint8_t *prev_tx, uint8_t *tx_blk, uint8_t *rx_blk,
                              unsigned long long *raw_cnt, double sigma, rng_t *rng,
                              uint8_t *full_msg, uint8_t *full_cw) {
    const int m = d->m, ic = d->ic, pc = d->pc;
    for (int r = 0; r < m; r++) {
        for (int c = 0; c < ic; c++) {
            tx_blk[r * m + c] = (rng_uniform(rng) >= 0.5) ? 1u : 0u;
        }
    }
    for (int r = 0; r < m; r++) {
        memset(full_msg, 0, (size_t)d->prim_k);
        for (int i = 0; i < m; i++) {
            full_msg[i] = prev_tx[i * m + r] & 1u;        /* previous block column r */
        }
        for (int c = 0; c < ic; c++) {
            full_msg[m + c] = tx_blk[r * m + c] & 1u;     /* this block's info */
        }
        bch_encode_systematic_ex(&sc->bch, full_msg, full_cw, NULL, NULL);
        for (int p = 0; p < pc; p++) {
            tx_blk[r * m + ic + p] = full_cw[p] & 1u;     /* systematic parity */
        }
    }
    unsigned long long errs = 0ull;
    for (size_t idx = 0; idx < d->blk; idx++) {
        const double symbol = tx_blk[idx] ? -1.0 : 1.0;
        const double noisy = symbol + sigma * rng_gaussian(rng);
        rx_blk[idx] = (noisy < 0.0) ? 1u : 0u;
        if (rx_blk[idx] != tx_blk[idx]) {
            errs++;
        }
    }
    *raw_cnt = errs;
}

/* Decode one component row of `blk` using `src_blk` (column source). On a
 * successful BDD, write corrected info+parity back into `blk`, and the column
 * correction back into `src_wb` when it is writable (interior window blocks). */
static void stream_decode_row(staircase_ctx_t *sc, const stream_dims_t *d,
                              uint8_t *blk, const uint8_t *src_blk, int r,
                              uint8_t *src_wb, uint8_t *full_cw,
                              uint16_t *S, uint16_t *lambda, int *err_pos) {
    const int m = d->m, ic = d->ic, pc = d->pc, dg = d->dg, prim_n = d->prim_n;
    memset(full_cw, 0, (size_t)prim_n);
    for (int p = 0; p < pc; p++) {
        full_cw[p] = blk[r * m + ic + p] & 1u;
    }
    for (int i = 0; i < m; i++) {
        full_cw[dg + i] = src_blk[i * m + r] & 1u;
    }
    for (int c = 0; c < ic; c++) {
        full_cw[dg + m + c] = blk[r * m + c] & 1u;
    }
    full_cw[prim_n - 1] = 0u;

    int errs = -1;
    if (bch_decode_with_scratch(&sc->bch, full_cw, &errs, S, lambda, err_pos) != 0) {
        return;
    }
    for (int c = 0; c < ic; c++) {
        blk[r * m + c] = full_cw[dg + m + c] & 1u;
    }
    for (int p = 0; p < pc; p++) {
        blk[r * m + ic + p] = full_cw[p] & 1u;
    }
    if (src_wb) {
        for (int i = 0; i < m; i++) {
            src_wb[i * m + r] = full_cw[dg + i] & 1u;
        }
    }
}

static int run_sweep_streaming(const sweep_cfg_t *cfg) {
    staircase_ctx_t sc;
    if (staircase_init(&sc, cfg->m, cfg->prim_poly, cfg->t, cfg->data_blocks) != 0) {
        fprintf(stderr, "staircase_init failed\n");
        return 1;
    }

    FILE *fp = fopen(cfg->out_path, "w");
    if (!fp) {
        fprintf(stderr, "Failed to open %s: %s\n", cfg->out_path, strerror(errno));
        staircase_free(&sc);
        return 1;
    }

    stream_dims_t d = {
        .m = sc.block_size,
        .ic = sc.info_cols,
        .pc = sc.parity_cols,
        .dg = sc.dg,
        .prim_n = sc.prim_n,
        .prim_k = sc.prim_k,
        .blk = (size_t)sc.block_size * (size_t)sc.block_size,
    };
    const int W = cfg->window_size;
    const double rate = (double)sc.info_cols / (double)sc.block_size;  /* asymptotic */

    fprintf(fp, "# label,%s\n", cfg->label);
    fprintf(fp, "# staircase,short_bch,%d,%d,%d,0x%x\n", sc.n, sc.k, sc.t, sc.prim_poly);
    fprintf(fp, "# mode,streaming\n");
    fprintf(fp, "# block_size,%d\n", sc.block_size);
    fprintf(fp, "# info_cols,%d\n", sc.info_cols);
    fprintf(fp, "# parity_cols,%d\n", sc.parity_cols);
    fprintf(fp, "# window,%d\n", cfg->window_size);
    fprintf(fp, "# max_iters,%d\n", cfg->max_iters);
    fprintf(fp, "# rate,%.6f\n", rate);
    fprintf(fp, "# target_errors,%d\n", cfg->target_errors);
    fprintf(fp, "# max_frames,%d\n", cfg->max_frames);
    fprintf(fp, "snr_db,raw_ber,decoded_ber,frame_success,frames,raw_errors,decoded_errors,payload_bits,success_frames\n");

    uint8_t *win = (uint8_t *)calloc((size_t)W * d.blk, 1);
    uint8_t *txw = (uint8_t *)calloc((size_t)W * d.blk, 1);
    uint8_t *enc_prev = (uint8_t *)calloc(d.blk, 1);
    uint8_t *prev_decoded = (uint8_t *)calloc(d.blk, 1);
    unsigned long long *raw_cnt = (unsigned long long *)calloc((size_t)W, sizeof(unsigned long long));
    uint8_t *full_msg = (uint8_t *)calloc((size_t)sc.prim_k, 1);
    uint8_t *full_cw = (uint8_t *)calloc((size_t)sc.prim_n, 1);
    uint16_t *S = (uint16_t *)calloc((size_t)(2 * sc.t + 1), sizeof(uint16_t));
    uint16_t *lambda = (uint16_t *)calloc((size_t)(sc.t + 1), sizeof(uint16_t));
    int *err_pos = (int *)calloc((size_t)sc.t, sizeof(int));
    if (!win || !txw || !enc_prev || !prev_decoded || !raw_cnt || !full_msg || !full_cw || !S || !lambda || !err_pos) {
        fprintf(stderr, "Allocation failed for streaming buffers\n");
        free(win); free(txw); free(enc_prev); free(prev_decoded); free(raw_cnt);
        free(full_msg); free(full_cw); free(S); free(lambda); free(err_pos);
        fclose(fp); staircase_free(&sc);
        return 1;
    }

    const int point_count = (int)floor(((cfg->end_db - cfg->start_db) / cfg->step_db) + 0.5) + 1;
    rng_t rng;
    rng_init(&rng, cfg->seed ^ ((uint64_t)sc.block_size << 32) ^ (uint64_t)W);

    const clock_t t0 = clock();
    for (int point = 0; point < point_count; point++) {
        const double snr_db = cfg->start_db + cfg->step_db * (double)point;
        const double snr_linear = pow(10.0, snr_db / 10.0);
        const double sigma = sqrt(1.0 / (2.0 * rate * snr_linear));

        /* Warm up the window with the first W blocks (anchored by the zero block). */
        memset(enc_prev, 0, d.blk);
        memset(prev_decoded, 0, d.blk);
        for (int s = 0; s < W; s++) {
            stream_make_block(&sc, &d, enc_prev, txw + (size_t)s * d.blk, win + (size_t)s * d.blk,
                              &raw_cnt[s], sigma, &rng, full_msg, full_cw);
            memcpy(enc_prev, txw + (size_t)s * d.blk, d.blk);
        }

        unsigned long long raw_errs = 0ull, decoded_errs = 0ull, success_blocks = 0ull, emitted = 0ull;
        while (decoded_errs < (unsigned long long)cfg->target_errors) {
            for (int iter = 0; iter < cfg->max_iters; iter++) {
                for (int s = 0; s < W; s++) {
                    const uint8_t *src = (s == 0) ? prev_decoded : (win + (size_t)(s - 1) * d.blk);
                    uint8_t *src_wb = (s == 0) ? NULL : (win + (size_t)(s - 1) * d.blk);
                    uint8_t *blk = win + (size_t)s * d.blk;
                    for (int r = 0; r < d.m; r++) {
                        stream_decode_row(&sc, &d, blk, src, r, src_wb, full_cw, S, lambda, err_pos);
                    }
                }
            }

            /* Finalize the leftmost block. */
            const int derr = count_bit_errors(win, txw, (int)d.blk);
            decoded_errs += (unsigned long long)derr;
            raw_errs += raw_cnt[0];
            emitted++;
            if (derr == 0) {
                success_blocks++;
            }
            memcpy(prev_decoded, win, d.blk);

            if (cfg->max_frames > 0 && emitted >= (unsigned long long)cfg->max_frames) {
                break;
            }

            /* Slide the window left by one and stream in a fresh right-edge block. */
            memmove(win, win + d.blk, (size_t)(W - 1) * d.blk);
            memmove(txw, txw + d.blk, (size_t)(W - 1) * d.blk);
            for (int s = 0; s < W - 1; s++) {
                raw_cnt[s] = raw_cnt[s + 1];
            }
            stream_make_block(&sc, &d, enc_prev, txw + (size_t)(W - 1) * d.blk, win + (size_t)(W - 1) * d.blk,
                              &raw_cnt[W - 1], sigma, &rng, full_msg, full_cw);
            memcpy(enc_prev, txw + (size_t)(W - 1) * d.blk, d.blk);
        }

        const unsigned long long payload_bits = d.blk * emitted;
        const double raw_ber = (double)raw_errs / (double)payload_bits;
        const double decoded_ber = (double)decoded_errs / (double)payload_bits;
        const double frame_success = (double)success_blocks / (double)emitted;
        fprintf(fp, "%.3f,%.12g,%.12g,%.12g,%llu,%llu,%llu,%llu,%llu\n",
                snr_db, raw_ber, decoded_ber, frame_success, emitted, raw_errs, decoded_errs, payload_bits, success_blocks);
        fflush(fp);

        const double elapsed = (double)(clock() - t0) / (double)CLOCKS_PER_SEC;
        fprintf(stderr,
                "[%s] %2d/%d  Eb/N0=%.1f dB  raw=%.6g  decoded=%.6g  success=%.2f%%  blocks=%llu  elapsed=%.1fs\n",
                cfg->label, point + 1, point_count, snr_db, raw_ber, decoded_ber,
                frame_success * 100.0, emitted, elapsed);
    }

    free(win); free(txw); free(enc_prev); free(prev_decoded); free(raw_cnt);
    free(full_msg); free(full_cw); free(S); free(lambda); free(err_pos);
    fclose(fp);
    staircase_free(&sc);
    return 0;
}

int main(int argc, char **argv) {
    sweep_cfg_t cfg;
    if (parse_args(argc, argv, &cfg) != 0) {
        usage(argv[0]);
        return 1;
    }
    return cfg.streaming ? run_sweep_streaming(&cfg) : run_sweep(&cfg);
}
