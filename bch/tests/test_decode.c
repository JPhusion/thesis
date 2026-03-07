#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "bch.h"

#define C_RESET "\x1b[0m"
#define C_RED   "\x1b[31m"
#define C_GREEN "\x1b[32m"
#define C_CYAN  "\x1b[36m"
#define C_BOLD  "\x1b[1m"

typedef struct {
    int m;
    uint32_t prim_poly;
    int t;
    unsigned long long msg_budget;
    const char *name;
} code_cfg_t;

typedef struct {
    unsigned long total;
    unsigned long pass;
    unsigned long fail;
} bucket_t;

typedef struct {
    unsigned long total;
    unsigned long rc_fail;
    unsigned long corrected_to_original;
    unsigned long miscorrected;
} over_t_bucket_t;

typedef void (*comb_cb_t)(const int *pos, int e, void *user);

typedef struct {
    bch_ctx_t *bch;
    const uint8_t *cw;
    uint8_t *rx;
    unsigned long long msg_idx;
    bucket_t *bucket;
} correctable_case_ctx_t;

typedef struct {
    bch_ctx_t *bch;
    const uint8_t *cw;
    uint8_t *rx;
    over_t_bucket_t *bucket;
} over_t_case_ctx_t;

static const code_cfg_t g_cfgs[] = {
    // Exhaustive for all messages and <=t patterns.
    {.m = 3, .prim_poly = 0b1011u,   .t = 1, .msg_budget = 0,   .name = "BCH(7,4,1)"},
    {.m = 4, .prim_poly = 0b10011u,  .t = 2, .msg_budget = 0,   .name = "BCH(15,7,2)"},
    // Sampled messages, exhaustive <=t error patterns per sampled message.
    {.m = 5, .prim_poly = 0b100101u, .t = 2, .msg_budget = 256, .name = "BCH(31,?,2)"},
    {.m = 5, .prim_poly = 0b100101u, .t = 3, .msg_budget = 128, .name = "BCH(31,?,3)"},
    {.m = 6, .prim_poly = 0b1000011u,.t = 2, .msg_budget = 64,  .name = "BCH(63,?,2)"},
};

static int g_fail_examples = 0;

static void print_hr(void) {
    printf("----------------------------------------------------------------\n");
}

static void msg_from_index(unsigned long long idx, int k, uint8_t *msg) {
    for (int i = 0; i < k; i++) {
        msg[i] = (uint8_t)((idx >> i) & 1u);
    }
}

static unsigned long long sampled_msg_index(unsigned long long s, unsigned long long total_msgs) {
    // total_msgs = 2^k (power of two), so odd-step progression is duplicate-free
    // for the first total_msgs samples.
    const unsigned long long mask = total_msgs - 1ull;
    const unsigned long long base = 0x9e3779b97f4a7c15ull;
    const unsigned long long step = 0xd1342543de82ef95ull; // odd
    return (base + s * step) & mask;
}

static void format_positions(const int *pos, int e, char *buf, size_t sz) {
    size_t used = 0;
    if (sz == 0) {
        return;
    }

    used += (size_t)snprintf(buf + used, sz - used, "{");
    for (int i = 0; i < e; i++) {
        used += (size_t)snprintf(buf + used, (used < sz) ? (sz - used) : 0, "%s%d", (i == 0) ? "" : ",", pos[i]);
    }
    (void)snprintf(buf + used, (used < sz) ? (sz - used) : 0, "}");
}

static void report_correctable_failure(unsigned long long msg_idx, const int *pos, int e, int rc, int errs, int cw_match) {
    if (g_fail_examples >= 20) {
        return;
    }
    char pbuf[96];
    format_positions(pos, e, pbuf, sizeof(pbuf));
    printf("  %sFAIL%s msg=%llu e=%d pos=%s rc=%d errs=%d corrected=%s\n",
           C_RED, C_RESET, msg_idx, e, pbuf, rc, errs, cw_match ? "yes" : "no");
    g_fail_examples++;
}

static void enum_combinations_rec(int n, int e, int start, int depth, int *pos, comb_cb_t cb, void *user) {
    if (depth == e) {
        cb(pos, e, user);
        return;
    }

    for (int i = start; i <= n - (e - depth); i++) {
        pos[depth] = i;
        enum_combinations_rec(n, e, i + 1, depth + 1, pos, cb, user);
    }
}

static void enum_combinations(int n, int e, int *pos, comb_cb_t cb, void *user) {
    if (e == 0) {
        cb(pos, 0, user);
        return;
    }
    enum_combinations_rec(n, e, 0, 0, pos, cb, user);
}

static unsigned long long choose_bounded(int n, int k, unsigned long long limit) {
    if (k < 0 || k > n) {
        return 0;
    }
    if (k == 0 || k == n) {
        return 1;
    }
    if (k > n - k) {
        k = n - k;
    }

    unsigned long long r = 1;
    for (int i = 1; i <= k; i++) {
        unsigned long long num = (unsigned long long)(n - k + i);
        if (r > (limit / num)) {
            return limit + 1;
        }
        r = (r * num) / (unsigned long long)i;
        if (r > limit) {
            return limit + 1;
        }
    }
    return r;
}

static void run_correctable_case(const int *pos, int e, void *user) {
    correctable_case_ctx_t *ctx = (correctable_case_ctx_t *)user;
    const int n = ctx->bch->n;

    memcpy(ctx->rx, ctx->cw, (size_t)n);
    for (int i = 0; i < e; i++) {
        ctx->rx[pos[i]] ^= 1u;
    }

    int errs = -1;
    int rc = bch_decode(ctx->bch, ctx->rx, &errs);
    int cw_match = (memcmp(ctx->rx, ctx->cw, (size_t)n) == 0);

    ctx->bucket->total++;
    if (rc == 0 && errs == e && cw_match) {
        ctx->bucket->pass++;
    } else {
        ctx->bucket->fail++;
        report_correctable_failure(ctx->msg_idx, pos, e, rc, errs, cw_match);
    }
}

static void run_over_t_case(const int *pos, int e, void *user) {
    over_t_case_ctx_t *ctx = (over_t_case_ctx_t *)user;
    const int n = ctx->bch->n;

    memcpy(ctx->rx, ctx->cw, (size_t)n);
    for (int i = 0; i < e; i++) {
        ctx->rx[pos[i]] ^= 1u;
    }

    int errs = -1;
    int rc = bch_decode(ctx->bch, ctx->rx, &errs);

    ctx->bucket->total++;
    if (rc != 0) {
        ctx->bucket->rc_fail++;
        return;
    }

    if (memcmp(ctx->rx, ctx->cw, (size_t)n) == 0) {
        ctx->bucket->corrected_to_original++;
    } else {
        ctx->bucket->miscorrected++;
    }
}

static void print_bucket_row(const char *label, const bucket_t *b) {
    printf("%-24s %10lu %10lu %10lu\n", label, b->total, b->pass, b->fail);
}

static int run_cfg(const code_cfg_t *cfg) {
    bch_ctx_t bch;
    if (bch_init(&bch, cfg->m, cfg->prim_poly, cfg->t) != 0) {
        printf("%sFAIL%s %s: bch_init failed (m=%d t=%d poly=0x%x)\n",
               C_RED, C_RESET, cfg->name, cfg->m, cfg->t, cfg->prim_poly);
        return 1;
    }

    if (bch.k < 0 || bch.k >= 63) {
        printf("%sFAIL%s %s: unsupported k=%d for test harness\n", C_RED, C_RESET, cfg->name, bch.k);
        bch_free(&bch);
        return 1;
    }

    const unsigned long long total_msgs = 1ull << bch.k;
    const unsigned long long msg_count = (cfg->msg_budget == 0 || cfg->msg_budget >= total_msgs) ? total_msgs : cfg->msg_budget;
    const int sampled = (msg_count != total_msgs);

    uint8_t *msg = (uint8_t *)calloc((size_t)bch.k, 1);
    uint8_t *cw = (uint8_t *)calloc((size_t)bch.n, 1);
    uint8_t *rx = (uint8_t *)calloc((size_t)bch.n, 1);
    int *pos = (int *)calloc((size_t)(bch.t + 2), sizeof(int));
    bucket_t *correctable = (bucket_t *)calloc((size_t)(bch.t + 1), sizeof(bucket_t));
    bucket_t systematic = {0, 0, 0};
    over_t_bucket_t over_t = {0, 0, 0, 0};

    if (!msg || !cw || !rx || !pos || !correctable) {
        printf("%sFAIL%s %s: allocation failed\n", C_RED, C_RESET, cfg->name);
        free(msg);
        free(cw);
        free(rx);
        free(pos);
        free(correctable);
        bch_free(&bch);
        return 1;
    }

    correctable_case_ctx_t corr_ctx = {
        .bch = &bch,
        .cw = cw,
        .rx = rx,
        .msg_idx = 0,
        .bucket = NULL
    };

    for (unsigned long long s = 0; s < msg_count; s++) {
        unsigned long long msg_idx = sampled ? sampled_msg_index(s, total_msgs) : s;
        msg_from_index(msg_idx, bch.k, msg);
        bch_encode_systematic(&bch, msg, cw);

        systematic.total++;
        int sys_ok = 1;
        for (int i = 0; i < bch.k; i++) {
            if ((cw[bch.dg + i] & 1u) != (msg[i] & 1u)) {
                sys_ok = 0;
                break;
            }
        }
        if (sys_ok) {
            systematic.pass++;
        } else {
            systematic.fail++;
        }

        corr_ctx.msg_idx = msg_idx;
        for (int e = 0; e <= bch.t; e++) {
            corr_ctx.bucket = &correctable[e];
            enum_combinations(bch.n, e, pos, run_correctable_case, &corr_ctx);
        }
    }

    const int over_e = bch.t + 1;
    if (over_e <= bch.n) {
        const unsigned long long diag_case_budget = 250000ull;
        const unsigned long long combos = choose_bounded(bch.n, over_e, diag_case_budget);
        if (combos > 0 && combos <= diag_case_budget) {
            unsigned long long diag_msgs = msg_count;
            if (diag_msgs > (diag_case_budget / combos)) {
                diag_msgs = diag_case_budget / combos;
            }

            over_t_case_ctx_t over_ctx = {
                .bch = &bch,
                .cw = cw,
                .rx = rx,
                .bucket = &over_t
            };

            for (unsigned long long s = 0; s < diag_msgs; s++) {
                unsigned long long msg_idx = sampled ? sampled_msg_index(s, total_msgs) : s;
                msg_from_index(msg_idx, bch.k, msg);
                bch_encode_systematic(&bch, msg, cw);
                enum_combinations(bch.n, over_e, pos, run_over_t_case, &over_ctx);
            }
        }
    }

    unsigned long total_fail = systematic.fail;
    print_hr();
    printf("%s%s%s  m=%d t=%d n=%d k=%d dg=%d poly=0x%x\n",
           C_BOLD, cfg->name, C_RESET, cfg->m, cfg->t, bch.n, bch.k, bch.dg, cfg->prim_poly);
    printf("Messages tested: %llu/%llu (%s)\n",
           msg_count, total_msgs, sampled ? "sampled" : "exhaustive");
    print_hr();
    printf("%-24s %10s %10s %10s\n", "Section", "Total", "Pass", "Fail");
    print_bucket_row("Systematic mapping", &systematic);

    for (int e = 0; e <= bch.t; e++) {
        char label[40];
        (void)snprintf(label, sizeof(label), "%d-bit errors", e);
        print_bucket_row(label, &correctable[e]);
        total_fail += correctable[e].fail;
    }
    print_hr();

    if (over_t.total > 0) {
        printf("%sDiagnostic (non-gating) for %d-bit errors%s\n", C_BOLD, over_e, C_RESET);
        printf("  total=%lu  rc!=0=%lu  corrected_to_original=%lu  miscorrected=%lu\n",
               over_t.total, over_t.rc_fail, over_t.corrected_to_original, over_t.miscorrected);
        print_hr();
    }

    free(msg);
    free(cw);
    free(rx);
    free(pos);
    free(correctable);
    bch_free(&bch);

    if (total_fail == 0) {
        printf("%sPASS%s %s (all <=t cases passed)\n", C_GREEN, C_RESET, cfg->name);
        return 0;
    }

    printf("%sFAIL%s %s: %lu failing checks\n", C_RED, C_RESET, cfg->name, total_fail);
    return 1;
}

int main(void) {
    printf("%s%sRunning test_decode (multi-parameter end-to-end BCH)%s\n", C_BOLD, C_CYAN, C_RESET);

    int fails = 0;
    const int ncfg = (int)(sizeof(g_cfgs) / sizeof(g_cfgs[0]));
    for (int i = 0; i < ncfg; i++) {
        fails += run_cfg(&g_cfgs[i]);
    }

    print_hr();
    if (fails == 0) {
        printf("%sPASS%s test_decode passed for all parameter sets\n", C_GREEN, C_RESET);
        return 0;
    }

    printf("%sFAIL%s test_decode had %d failing parameter set(s)\n", C_RED, C_RESET, fails);
    if (g_fail_examples > 0) {
        printf("Displayed up to %d failing case examples above.\n", g_fail_examples);
    }
    return 1;
}
