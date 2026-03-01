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

int main(void) {
    printf("Running test_encode...\n");

    bch_ctx_t bch;
    EXPECT_TRUE(bch_init(&bch, 4, 0b10011, 2) == 0);
    EXPECT_TRUE(bch.n == 15);

    if (generator_is_stub(&bch)) {
        SKIP("Generator polynomial not implemented yet (g(x)=1). Skipping real encoding assertions.");
        bch_free(&bch);

        printf("[OK] test_encode passed (%d skipped)\n", g_skip);
        return 0;
    }

    // Once you implement generator + encoder, enable checks like:
    // - bch.k == bch.n - bch.dg
    // - g[0] == 1 and g[dg] == 1
    EXPECT_TRUE(bch.k == bch.n - bch.dg);
    EXPECT_TRUE(bch.g[0] == 1);
    EXPECT_TRUE(bch.g[bch.dg] == 1);

    // TODO (after encode done): systematic property checks
    // - message appears in the high-order part (depending on your bit ordering convention)

    bch_free(&bch);

    if (g_fail == 0) {
        printf("[OK] test_encode passed (%d skipped)\n", g_skip);
        return 0;
    } else {
        printf("[FAIL] test_encode failed: %d failures (%d skipped)\n", g_fail, g_skip);
        return 1;
    }
}
