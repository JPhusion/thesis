#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "bch.h"

static int g_fail = 0;
static int g_skip = 0;

#define EXPECT_TRUE(expr) do { \
    if (!(expr)) { \
        g_fail++; \
        printf("[FAIL] %s:%d: %s\n", __FILE__, __LINE__, #expr); \
    } \
} while (0)

#define SKIP(msg) do { \
    g_skip++; \
    printf("[SKIP] %s\n", msg); \
} while (0)

/* Heuristic: if g(x) is still just 1 (deg 0), generator isn’t built yet */
static int generator_is_stub(const bch_ctx_t *bch) {
    return (bch->dg == 0 && bch->g && bch->g[0] == 1);
}

typedef struct {
    const char *name;
    int m;
    uint32_t prim_poly;
    int t;
    int expect_n;
    int expect_k;
    int expect_dg;
} encode_cfg_t;

static const encode_cfg_t g_cfgs[] = {
    {.name = "BCH(15,7,2)", .m = 4, .prim_poly = 0b10011u, .t = 2, .expect_n = 15, .expect_k = 7, .expect_dg = 8},
    {.name = "BCH(255,231,3)", .m = 8, .prim_poly = 0x11du, .t = 3, .expect_n = 255, .expect_k = 231, .expect_dg = 24},
    {.name = "BCH(511,484,3)", .m = 9, .prim_poly = 0x211u, .t = 3, .expect_n = 511, .expect_k = 484, .expect_dg = 27},
};

int main(void) {
    printf("Running test_encode...\n");

    for (size_t i = 0; i < sizeof(g_cfgs) / sizeof(g_cfgs[0]); i++) {
        const encode_cfg_t *cfg = &g_cfgs[i];
        bch_ctx_t bch;
        printf("  Testing %s\n", cfg->name);
        EXPECT_TRUE(bch_init(&bch, cfg->m, cfg->prim_poly, cfg->t) == 0);
        EXPECT_TRUE(bch.n == cfg->expect_n);
        EXPECT_TRUE(bch.k == cfg->expect_k);
        EXPECT_TRUE(bch.dg == cfg->expect_dg);

        if (generator_is_stub(&bch)) {
            SKIP("Generator polynomial not implemented yet (g(x)=1). Skipping real encoding assertions.");
            bch_free(&bch);
            continue;
        }

        EXPECT_TRUE(bch.k == bch.n - bch.dg);
        EXPECT_TRUE(bch.g[0] == 1);
        EXPECT_TRUE(bch.g[bch.dg] == 1);

        bch_free(&bch);
    }

    if (g_fail == 0) {
        printf("[OK] test_encode passed (%d skipped)\n", g_skip);
        return 0;
    } else {
        printf("[FAIL] test_encode failed: %d failures (%d skipped)\n", g_fail, g_skip);
        return 1;
    }
}
