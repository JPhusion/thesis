#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "product.h"

typedef struct {
    const char *name;
    int row_m;
    uint32_t row_poly;
    int row_t;
    int col_m;
    uint32_t col_poly;
    int col_t;
} cfg_t;

static int g_fail = 0;

#define EXPECT_TRUE(expr) do { \
    if (!(expr)) { \
        g_fail++; \
        printf("[FAIL] %s:%d: %s\n", __FILE__, __LINE__, #expr); \
    } \
} while (0)

static const cfg_t g_cfgs[] = {
    {.name = "PC[BCH(7,4,1) x BCH(7,4,1)]", .row_m = 3, .row_poly = 0b1011u, .row_t = 1, .col_m = 3, .col_poly = 0b1011u, .col_t = 1},
    {.name = "PC[BCH(15,7,2) x BCH(7,4,1)]", .row_m = 4, .row_poly = 0b10011u, .row_t = 2, .col_m = 3, .col_poly = 0b1011u, .col_t = 1},
    {.name = "PC[BCH(15,7,2) x BCH(15,7,2)]", .row_m = 4, .row_poly = 0b10011u, .row_t = 2, .col_m = 4, .col_poly = 0b10011u, .col_t = 2},
    {.name = "PC[BCH(255,231,3) x BCH(255,231,3)]", .row_m = 8, .row_poly = 0x11du, .row_t = 3, .col_m = 8, .col_poly = 0x11du, .col_t = 3},
    {.name = "PC[BCH(511,484,3) x BCH(511,484,3)]", .row_m = 9, .row_poly = 0x211u, .row_t = 3, .col_m = 9, .col_poly = 0x211u, .col_t = 3},
};

static void fill_msg_pattern(uint8_t *msg, int len, int pattern_id) {
    for (int i = 0; i < len; i++) {
        switch (pattern_id) {
        case 0:
            msg[i] = 0u;
            break;
        case 1:
            msg[i] = 1u;
            break;
        case 2:
            msg[i] = (uint8_t)(i & 1u);
            break;
        case 3:
            msg[i] = (uint8_t)((i + 1) & 1u);
            break;
        default:
            msg[i] = (uint8_t)(((unsigned)i * 5u + (unsigned)pattern_id * 3u) & 1u);
            break;
        }
    }
}

static int run_cfg(const cfg_t *cfg) {
    product_ctx_t pc;
    int rc = product_init(&pc, cfg->row_m, cfg->row_poly, cfg->row_t, cfg->col_m, cfg->col_poly, cfg->col_t);
    EXPECT_TRUE(rc == 0);
    if (rc != 0) {
        return 1;
    }

    printf("Testing %s\n", cfg->name);
    printf("  dims: info=%dx%d code=%dx%d msg_bits=%d cw_bits=%d\n",
           pc.info_rows, pc.info_cols, pc.code_rows, pc.code_cols, pc.msg_bits, pc.cw_bits);

    EXPECT_TRUE(pc.info_rows == pc.col_k);
    EXPECT_TRUE(pc.info_cols == pc.row_k);
    EXPECT_TRUE(pc.code_rows == pc.col_n);
    EXPECT_TRUE(pc.code_cols == pc.row_n);
    EXPECT_TRUE(pc.msg_bits == pc.info_rows * pc.info_cols);
    EXPECT_TRUE(pc.cw_bits == pc.code_rows * pc.code_cols);

    uint8_t *msg = (uint8_t *)calloc((size_t)pc.msg_bits, 1);
    uint8_t *cw = (uint8_t *)calloc((size_t)pc.cw_bits, 1);
    uint8_t *extracted = (uint8_t *)calloc((size_t)pc.msg_bits, 1);
    if (!msg || !cw || !extracted) {
        printf("[FAIL] allocation failed\n");
        free(msg);
        free(cw);
        free(extracted);
        product_free(&pc);
        return 1;
    }

    for (int pattern = 0; pattern < 6; pattern++) {
        fill_msg_pattern(msg, pc.msg_bits, pattern);
        rc = product_encode_systematic(&pc, msg, cw);
        EXPECT_TRUE(rc == 0);
        if (rc != 0) {
            continue;
        }

        product_extract_message(&pc, cw, extracted);
        EXPECT_TRUE(memcmp(msg, extracted, (size_t)pc.msg_bits) == 0);
        EXPECT_TRUE(product_validate_rows(&pc, cw) == 1);
        EXPECT_TRUE(product_validate_cols(&pc, cw) == 1);
    }

    free(msg);
    free(cw);
    free(extracted);
    product_free(&pc);
    return 0;
}

int main(void) {
    printf("Running test_product_encode...\n");
    const int ncfg = (int)(sizeof(g_cfgs) / sizeof(g_cfgs[0]));
    for (int i = 0; i < ncfg; i++) {
        run_cfg(&g_cfgs[i]);
    }

    if (g_fail == 0) {
        printf("[OK] test_product_encode passed\n");
        return 0;
    }
    printf("[FAIL] test_product_encode failed: %d failures\n", g_fail);
    return 1;
}
