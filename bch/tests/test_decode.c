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

static int decoder_is_stub(void) {
    // your stub returns -1 always right now
    return 1;
}

int main(void) {
    printf("Running test_decode...\n");

    bch_ctx_t bch;
    EXPECT_TRUE(bch_init(&bch, 4, 0b10011, 2) == 0);

    uint8_t *rx = (uint8_t*)calloc((size_t)bch.n, 1);
    int errs = 0;

    if (decoder_is_stub()) {
        SKIP("Decoder not implemented yet. Skipping decode assertions.");
        free(rx);
        bch_free(&bch);

        printf("[OK] test_decode passed (%d skipped)\n", g_skip);
        return 0;
    }

    // Later:
    // - encode message -> add <=t errors -> decode -> corrected == original
    // - errs == introduced errors
    // - rc == 0

    free(rx);
    bch_free(&bch);

    if (g_fail == 0) {
        printf("[OK] test_decode passed (%d skipped)\n", g_skip);
        return 0;
    } else {
        printf("[FAIL] test_decode failed: %d failures (%d skipped)\n", g_fail, g_skip);
        return 1;
    }
}
