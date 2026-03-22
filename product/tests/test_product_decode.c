#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "product.h"

#define C_RESET "\x1b[0m"
#define C_RED   "\x1b[31m"
#define C_GREEN "\x1b[32m"
#define C_CYAN  "\x1b[36m"
#define C_BOLD  "\x1b[1m"

typedef struct {
    int row_m;
    uint32_t row_poly;
    int row_t;
    int col_m;
    uint32_t col_poly;
    int col_t;
    int max_iters;
    unsigned long long msg_budget;
    const char *name;
} product_cfg_t;

typedef struct {
    unsigned long total;
    unsigned long pass;
    unsigned long fail;
} bucket_t;

typedef struct {
    unsigned long total;
    unsigned long rc_fail;
    unsigned long corrected_to_original;
    unsigned long miscorrected_valid;
    unsigned long still_invalid;
} diag_bucket_t;

static const product_cfg_t g_cfgs[] = {
    {.row_m = 3, .row_poly = 0b1011u, .row_t = 1, .col_m = 3, .col_poly = 0b1011u, .col_t = 1, .max_iters = 3, .msg_budget = 128, .name = "PC[BCH(7,4,1) x BCH(7,4,1)]"},
    {.row_m = 4, .row_poly = 0b10011u, .row_t = 2, .col_m = 3, .col_poly = 0b1011u, .col_t = 1, .max_iters = 3, .msg_budget = 64, .name = "PC[BCH(15,7,2) x BCH(7,4,1)]"},
    {.row_m = 4, .row_poly = 0b10011u, .row_t = 2, .col_m = 4, .col_poly = 0b10011u, .col_t = 2, .max_iters = 4, .msg_budget = 32, .name = "PC[BCH(15,7,2) x BCH(15,7,2)]"},
};

static int g_fail_examples = 0;

static void print_hr(void) {
    printf("--------------------------------------------------------------------------------\n");
}

static uint64_t mix64(uint64_t x) {
    x ^= x >> 30;
    x *= 0xbf58476d1ce4e5b9ULL;
    x ^= x >> 27;
    x *= 0x94d049bb133111ebULL;
    x ^= x >> 31;
    return x;
}

static void sampled_message(unsigned long long sample_idx, int nbits, uint8_t *msg) {
    uint64_t state = mix64(0x9e3779b97f4a7c15ULL ^ sample_idx);
    for (int i = 0; i < nbits; i++) {
        state = mix64(state + (uint64_t)i + 0xd1342543de82ef95ULL);
        msg[i] = (uint8_t)(state & 1u);
    }
}

static void print_bucket_row(const char *label, const bucket_t *b) {
    printf("%-28s %10lu %10lu %10lu\n", label, b->total, b->pass, b->fail);
}

static void report_failure(unsigned long long sample_idx,
                           const char *label,
                           int rc,
                           const product_decode_stats_t *stats,
                           int exact,
                           int code_rows,
                           int code_cols) {
    if (g_fail_examples >= 16) {
        return;
    }
    printf("  %sFAIL%s sample=%llu section=%s rc=%d exact=%s rows_valid=%d/%d cols_valid=%d/%d\n",
           C_RED,
           C_RESET,
           sample_idx,
           label,
           rc,
           exact ? "yes" : "no",
           stats->final_rows_valid,
           code_rows,
           stats->final_cols_valid,
           code_cols);
    g_fail_examples++;
}

static int run_decode_case(product_ctx_t *pc,
                           const uint8_t *cw,
                           uint8_t *rx,
                           int max_iters,
                           const int *flip_pos,
                           int nflips,
                           product_decode_stats_t *stats,
                           int *out_exact) {
    memcpy(rx, cw, (size_t)pc->cw_bits);
    for (int i = 0; i < nflips; i++) {
        int pos = flip_pos[i];
        if (pos < 0 || pos >= pc->cw_bits) {
            return -1;
        }
        rx[pos] ^= 1u;
    }

    int rc = product_decode_iterative(pc, rx, max_iters, stats);
    *out_exact = (memcmp(rx, cw, (size_t)pc->cw_bits) == 0);
    return rc;
}

static int matrix_pos(const product_ctx_t *pc, int row, int col) {
    return row * pc->code_cols + col;
}

static int run_cfg(const product_cfg_t *cfg) {
    product_ctx_t pc;
    if (product_init(&pc, cfg->row_m, cfg->row_poly, cfg->row_t, cfg->col_m, cfg->col_poly, cfg->col_t) != 0) {
        printf("%sFAIL%s %s: product_init failed\n", C_RED, C_RESET, cfg->name);
        return 1;
    }

    uint8_t *msg = (uint8_t *)calloc((size_t)pc.msg_bits, 1);
    uint8_t *cw = (uint8_t *)calloc((size_t)pc.cw_bits, 1);
    uint8_t *rx = (uint8_t *)calloc((size_t)pc.cw_bits, 1);
    uint8_t *decoded_msg = (uint8_t *)calloc((size_t)pc.msg_bits, 1);
    if (!msg || !cw || !rx || !decoded_msg) {
        printf("%sFAIL%s %s: allocation failed\n", C_RED, C_RESET, cfg->name);
        free(msg);
        free(cw);
        free(rx);
        free(decoded_msg);
        product_free(&pc);
        return 1;
    }

    bucket_t systematic = {0, 0, 0};
    bucket_t clean = {0, 0, 0};
    bucket_t single = {0, 0, 0};
    bucket_t coop_row = {0, 0, 0};
    bucket_t coop_col = {0, 0, 0};
    diag_bucket_t diag = {0, 0, 0, 0, 0};

    for (unsigned long long s = 0; s < cfg->msg_budget; s++) {
        sampled_message(s, pc.msg_bits, msg);
        if (product_encode_systematic(&pc, msg, cw) != 0) {
            systematic.fail++;
            clean.fail++;
            continue;
        }

        systematic.total++;
        product_extract_message(&pc, cw, decoded_msg);
        if (memcmp(msg, decoded_msg, (size_t)pc.msg_bits) == 0) {
            systematic.pass++;
        } else {
            systematic.fail++;
        }

        clean.total++;
        product_decode_stats_t stats;
        int exact = 0;
        int rc = run_decode_case(&pc, cw, rx, cfg->max_iters, NULL, 0, &stats, &exact);
        if (rc == 0 && exact) {
            clean.pass++;
        } else {
            clean.fail++;
            report_failure(s, "No errors", rc, &stats, exact, pc.code_rows, pc.code_cols);
        }

        for (int pos = 0; pos < pc.cw_bits; pos++) {
            int flips[1] = {pos};
            single.total++;
            rc = run_decode_case(&pc, cw, rx, cfg->max_iters, flips, 1, &stats, &exact);
            if (rc == 0 && exact) {
                single.pass++;
            } else {
                single.fail++;
                report_failure(s, "Single-bit errors", rc, &stats, exact, pc.code_rows, pc.code_cols);
            }
        }

        if (pc.code_cols >= 2) {
            const int row = (int)(s % (unsigned long long)pc.code_rows);
            const int c0 = (int)((s * 3ull) % (unsigned long long)pc.code_cols);
            const int c1 = (c0 + 1 + (int)(s % (unsigned long long)(pc.code_cols - 1))) % pc.code_cols;
            int flips[2] = {
                matrix_pos(&pc, row, c0),
                matrix_pos(&pc, row, c1)
            };
            coop_row.total++;
            rc = run_decode_case(&pc, cw, rx, cfg->max_iters, flips, 2, &stats, &exact);
            if (rc == 0 && exact) {
                coop_row.pass++;
            } else {
                coop_row.fail++;
                report_failure(s, "Cooperative row pattern", rc, &stats, exact, pc.code_rows, pc.code_cols);
            }
        }

        if (pc.code_rows >= 2) {
            const int col = (int)(s % (unsigned long long)pc.code_cols);
            const int r0 = (int)((s * 5ull) % (unsigned long long)pc.code_rows);
            const int r1 = (r0 + 1 + (int)(s % (unsigned long long)(pc.code_rows - 1))) % pc.code_rows;
            int flips[2] = {
                matrix_pos(&pc, r0, col),
                matrix_pos(&pc, r1, col)
            };
            coop_col.total++;
            rc = run_decode_case(&pc, cw, rx, cfg->max_iters, flips, 2, &stats, &exact);
            if (rc == 0 && exact) {
                coop_col.pass++;
            } else {
                coop_col.fail++;
                report_failure(s, "Cooperative column pattern", rc, &stats, exact, pc.code_rows, pc.code_cols);
            }
        }

        if ((pc.col_t + 1) <= pc.code_rows && (pc.row_t + 1) <= pc.code_cols) {
            int nflips = 0;
            int *flips = (int *)calloc((size_t)((pc.col_t + 1) * (pc.row_t + 1)), sizeof(int));
            if (!flips) {
                continue;
            }
            for (int r = 0; r <= pc.col_t; r++) {
                for (int c = 0; c <= pc.row_t; c++) {
                    flips[nflips++] = matrix_pos(&pc, r, c);
                }
            }
            diag.total++;
            rc = run_decode_case(&pc, cw, rx, cfg->max_iters, flips, nflips, &stats, &exact);
            if (rc != 0) {
                diag.rc_fail++;
            } else if (exact) {
                diag.corrected_to_original++;
            } else if (stats.final_rows_valid == pc.code_rows && stats.final_cols_valid == pc.code_cols) {
                diag.miscorrected_valid++;
            } else {
                diag.still_invalid++;
            }
            free(flips);
        }
    }

    const unsigned long total_fail = systematic.fail + clean.fail + single.fail + coop_row.fail + coop_col.fail;
    print_hr();
    printf("%s%s%s  row=(m=%d t=%d n=%d k=%d dg=%d poly=0x%x)  col=(m=%d t=%d n=%d k=%d dg=%d poly=0x%x)\n",
           C_BOLD,
           cfg->name,
           C_RESET,
           pc.row_m,
           pc.row_t,
           pc.row_n,
           pc.row_k,
           pc.row_dg,
           pc.row_prim_poly,
           pc.col_m,
           pc.col_t,
           pc.col_n,
           pc.col_k,
           pc.col_dg,
           pc.col_prim_poly);
    printf("Info matrix: %dx%d   Code matrix: %dx%d   max_iters=%d\n",
           pc.info_rows, pc.info_cols, pc.code_rows, pc.code_cols, cfg->max_iters);
    printf("Messages tested: %llu (sampled, deterministic)\n", cfg->msg_budget);
    print_hr();
    printf("%-28s %10s %10s %10s\n", "Section", "Total", "Pass", "Fail");
    print_bucket_row("Systematic mapping", &systematic);
    print_bucket_row("No errors", &clean);
    print_bucket_row("Single-bit errors", &single);
    print_bucket_row("Cooperative row pattern", &coop_row);
    print_bucket_row("Cooperative column pattern", &coop_col);
    print_hr();
    if (diag.total > 0) {
        printf("%sDiagnostic rectangle (non-gating)%s\n", C_BOLD, C_RESET);
        printf("  total=%lu  rc!=0=%lu  corrected_to_original=%lu  miscorrected_valid=%lu  still_invalid=%lu\n",
               diag.total,
               diag.rc_fail,
               diag.corrected_to_original,
               diag.miscorrected_valid,
               diag.still_invalid);
        print_hr();
    }

    free(msg);
    free(cw);
    free(rx);
    free(decoded_msg);
    product_free(&pc);

    if (total_fail == 0) {
        printf("%sPASS%s %s (all gated cases passed)\n", C_GREEN, C_RESET, cfg->name);
        return 0;
    }
    printf("%sFAIL%s %s: %lu failing checks\n", C_RED, C_RESET, cfg->name, total_fail);
    return 1;
}

int main(void) {
    printf("%s%sRunning test_product_decode (iterative BCH product-code end-to-end)%s\n", C_BOLD, C_CYAN, C_RESET);

    int fails = 0;
    const int ncfg = (int)(sizeof(g_cfgs) / sizeof(g_cfgs[0]));
    for (int i = 0; i < ncfg; i++) {
        fails += run_cfg(&g_cfgs[i]);
    }

    print_hr();
    if (fails == 0) {
        printf("%sPASS%s test_product_decode passed for all parameter sets\n", C_GREEN, C_RESET);
        return 0;
    }
    printf("%sFAIL%s test_product_decode had %d failing parameter set(s)\n", C_RED, C_RESET, fails);
    if (g_fail_examples > 0) {
        printf("Displayed up to %d failing case examples above.\n", g_fail_examples);
    }
    return 1;
}
