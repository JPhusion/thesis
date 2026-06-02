#include <errno.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "bch.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct {
    int m;
    uint32_t prim_poly;
    int t;
    double start_db;
    double end_db;
    double step_db;
    int target_errors;
    int max_frames;
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

static double bpsk_modulate_bit(uint8_t bit) {
    return bit ? -1.0 : 1.0;
}

static uint8_t hard_demodulate_bpsk(double sample) {
    return (sample < 0.0) ? 1u : 0u;
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

static void usage(const char *argv0) {
    fprintf(stderr,
            "Usage: %s --m M --t T --prim POLY [--start-db X] [--end-db Y] [--step-db D] \\\n"
            "          [--target-errors N] [--max-frames N] [--seed S] [--label NAME] --out FILE.csv\n",
            argv0);
}

static int parse_args(int argc, char **argv, sweep_cfg_t *cfg) {
    *cfg = (sweep_cfg_t){
        .m = 8,
        .prim_poly = 0x11du,
        .t = 3,
        .start_db = 0.0,
        .end_db = 6.0,
        .step_db = 0.1,
        .target_errors = 300,
        .max_frames = 0,
        .seed = 0xBC0DE12345678ULL,
        .out_path = NULL,
        .label = "bch"
    };

    for (int i = 1; i < argc; i++) {
        const char *arg = argv[i];
        if (strcmp(arg, "--m") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->m) != 0) return -1;
        } else if (strcmp(arg, "--t") == 0 && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->t) != 0) return -1;
        } else if (strcmp(arg, "--prim") == 0 && i + 1 < argc) {
            cfg->prim_poly = parse_u32(argv[++i]);
        } else if (strcmp(arg, "--start-db") == 0 && i + 1 < argc) {
            if (parse_double_arg(argv[++i], &cfg->start_db) != 0) return -1;
        } else if (strcmp(arg, "--end-db") == 0 && i + 1 < argc) {
            if (parse_double_arg(argv[++i], &cfg->end_db) != 0) return -1;
        } else if (strcmp(arg, "--step-db") == 0 && i + 1 < argc) {
            if (parse_double_arg(argv[++i], &cfg->step_db) != 0) return -1;
        } else if ((strcmp(arg, "--target-errors") == 0) && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->target_errors) != 0) return -1;
        } else if ((strcmp(arg, "--max-frames") == 0 || strcmp(arg, "--frames") == 0) && i + 1 < argc) {
            if (parse_int_arg(argv[++i], &cfg->max_frames) != 0) return -1;
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

    if (!cfg->out_path || cfg->target_errors <= 0 || cfg->max_frames < 0 || cfg->step_db <= 0.0) {
        return -1;
    }
    return 0;
}

static int run_sweep(const sweep_cfg_t *cfg) {
    bch_ctx_t bch;
    if (bch_init(&bch, cfg->m, cfg->prim_poly, cfg->t) != 0) {
        fprintf(stderr, "bch_init failed\n");
        return 1;
    }

    FILE *fp = fopen(cfg->out_path, "w");
    if (!fp) {
        fprintf(stderr, "Failed to open %s: %s\n", cfg->out_path, strerror(errno));
        bch_free(&bch);
        return 1;
    }

    fprintf(fp, "# label,%s\n", cfg->label);
    fprintf(fp, "# bch,%d,%d,%d,0x%x\n", bch.n, bch.k, bch.t, bch.prim_poly);
    fprintf(fp, "# target_errors,%d\n", cfg->target_errors);
    fprintf(fp, "# max_frames,%d\n", cfg->max_frames);
    fprintf(fp, "snr_db,raw_ber,decoded_ber,frame_success,frames,raw_errors,decoded_errors,payload_bits,success_frames\n");

    uint8_t *msg = (uint8_t *)calloc((size_t)bch.k, 1);
    uint8_t *cw = (uint8_t *)calloc((size_t)bch.n, 1);
    uint8_t *rx = (uint8_t *)calloc((size_t)bch.n, 1);
    if (!msg || !cw || !rx) {
        fprintf(stderr, "Allocation failed for sweep buffers\n");
        free(msg);
        free(cw);
        free(rx);
        fclose(fp);
        bch_free(&bch);
        return 1;
    }

    const double rate = (double)bch.k / (double)bch.n;
    const int point_count = (int)floor(((cfg->end_db - cfg->start_db) / cfg->step_db) + 0.5) + 1;
    rng_t rng;
    rng_init(&rng, cfg->seed ^ ((uint64_t)bch.n << 32) ^ (uint64_t)bch.k);

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
            int decode_errs = 0;
            random_bits(msg, bch.k, &rng);
            bch_encode_systematic(&bch, msg, cw);

            for (int bit = 0; bit < bch.n; bit++) {
                const double symbol = bpsk_modulate_bit(cw[bit]);
                const double noisy = symbol + sigma * rng_gaussian(&rng);
                rx[bit] = hard_demodulate_bpsk(noisy);
                if (rx[bit] != cw[bit]) {
                    raw_errs++;
                }
            }

            (void)bch_decode(&bch, rx, &decode_errs);
            const int frame_errs = count_bit_errors(rx, cw, bch.n);
            decoded_errs += (unsigned long long)frame_errs;
            frames_run++;
            if (frame_errs == 0) {
                success_frames++;
            }
            if (cfg->max_frames > 0 && frames_run >= (unsigned long long)cfg->max_frames) {
                break;
            }
        }

        const double raw_ber = (double)raw_errs / ((double)bch.n * (double)frames_run);
        const double decoded_ber = (double)decoded_errs / ((double)bch.n * (double)frames_run);
        const double frame_success = (double)success_frames / (double)frames_run;
        const unsigned long long payload_bits = (unsigned long long)bch.n * frames_run;
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
    free(cw);
    free(rx);
    fclose(fp);
    bch_free(&bch);
    return 0;
}

int main(int argc, char **argv) {
    sweep_cfg_t cfg;
    if (parse_args(argc, argv, &cfg) != 0) {
        usage(argv[0]);
        return 1;
    }
    return run_sweep(&cfg);
}
