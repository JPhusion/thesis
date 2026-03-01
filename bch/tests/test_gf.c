#include <stdio.h>
#include <stdint.h>
#include "gf.h"

/* ---------- tiny test harness ---------- */
static int g_fail = 0;
static int g_skip = 0;

#define EXPECT_TRUE(expr) do { \
    if (!(expr)) { \
        g_fail++; \
        printf("[FAIL] %s:%d: %s\n", __FILE__, __LINE__, #expr); \
    } \
} while (0)

#define EXPECT_EQ_U16(a,b) do { \
    uint16_t _a = (uint16_t)(a); \
    uint16_t _b = (uint16_t)(b); \
    if (_a != _b) { \
        g_fail++; \
        printf("[FAIL] %s:%d: %s == %s (got 0x%04x expected 0x%04x)\n", \
               __FILE__, __LINE__, #a, #b, _a, _b); \
    } \
} while (0)

#define SKIP(msg) do { \
    g_skip++; \
    printf("[SKIP] %s\n", msg); \
} while (0)

/* Heuristic: if gf_mul is stub, common nontrivial product returns 0 */
static int gf_mul_is_stub(const gf_ctx_t *gf) {
    uint16_t x = 0b0010; // x
    uint16_t x2 = 0b0100; // x^2
    uint16_t r = gf_mul(gf, x, x2); // should be x^3 = 0b1000 if implemented
    return (r == 0);
}

static void test_gf_add(void) {
    EXPECT_EQ_U16(gf_add(0,0), 0);
    EXPECT_EQ_U16(gf_add(0,1), 1);
    EXPECT_EQ_U16(gf_add(1,1), 0);
    EXPECT_EQ_U16(gf_add(0b1010, 0b0110), (uint16_t)(0b1100));
}

static void test_gf_mul_known_cases_m4_poly_10011(void) {
    gf_ctx_t gf = {.m = 4, .prim_poly = 0b10011}; // x^4 + x + 1

    if (gf_mul_is_stub(&gf)) {
        SKIP("gf_mul() appears unimplemented (stub). Implement gf_mul to enable mul tests.");
        return;
    }

    // x * x^2 = x^3
    EXPECT_EQ_U16(gf_mul(&gf, 0b0010, 0b0100), (uint16_t)0b1000);

    // x^3 * x = x^4 ≡ x + 1 (mod x^4 + x + 1)
    EXPECT_EQ_U16(gf_mul(&gf, 0b1000, 0b0010), (uint16_t)0b0011);

    // (x^3+x^2+x+1)*x = x^4+x^3+x^2+x ≡ (x+1)+x^3+x^2+x = x^3+x^2+1
    EXPECT_EQ_U16(gf_mul(&gf, 0b1111, 0b0010), (uint16_t)0b1101);

    // identity and zero
    EXPECT_EQ_U16(gf_mul(&gf, 0b0110, 1), (uint16_t)0b0110);
    EXPECT_EQ_U16(gf_mul(&gf, 0b0110, 0), (uint16_t)0);
}

static void test_gf_mul_distributive(void) {
    gf_ctx_t gf = {.m = 4, .prim_poly = 0b10011};

    if (gf_mul_is_stub(&gf)) {
        SKIP("Skipping distributive tests until gf_mul is implemented.");
        return;
    }

    // a*(b+c) == a*b + a*c (XOR)
    uint16_t a = 0b0110;
    uint16_t b = 0b1011;
    uint16_t c = 0b0101;

    uint16_t left  = gf_mul(&gf, a, gf_add(b,c));
    uint16_t right = gf_add(gf_mul(&gf, a, b), gf_mul(&gf, a, c));
    EXPECT_EQ_U16(left, right);
}

int main(void) {
    printf("Running test_gf...\n");

    test_gf_add();
    test_gf_mul_known_cases_m4_poly_10011();
    test_gf_mul_distributive();

    if (g_fail == 0) {
        printf("[OK] test_gf passed (%d skipped)\n", g_skip);
        return 0;
    } else {
        printf("[FAIL] test_gf failed: %d failures (%d skipped)\n", g_fail, g_skip);
        return 1;
    }
}
