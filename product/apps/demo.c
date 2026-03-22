#include <stdio.h>
#include <stdlib.h>

#include "product.h"

static void print_matrix(const product_ctx_t *pc, const uint8_t *m) {
    for (int r = 0; r < pc->code_rows; r++) {
        for (int c = 0; c < pc->code_cols; c++) {
            printf("%u", (unsigned)(m[r * pc->code_cols + c] & 1u));
            if (c + 1 != pc->code_cols) {
                putchar(' ');
            }
        }
        putchar('\n');
    }
}

int main(void) {
    product_ctx_t pc;
    if (product_init(&pc, 3, 0b1011u, 1, 3, 0b1011u, 1) != 0) {
        fprintf(stderr, "product_init failed\n");
        return 1;
    }

    uint8_t *msg = (uint8_t *)calloc((size_t)pc.msg_bits, 1);
    uint8_t *cw = (uint8_t *)calloc((size_t)pc.cw_bits, 1);
    if (!msg || !cw) {
        fprintf(stderr, "allocation failed\n");
        free(msg);
        free(cw);
        product_free(&pc);
        return 1;
    }

    for (int i = 0; i < pc.msg_bits; i++) {
        msg[i] = (uint8_t)(i & 1u);
    }

    if (product_encode_systematic(&pc, msg, cw) != 0) {
        fprintf(stderr, "product_encode_systematic failed\n");
        free(msg);
        free(cw);
        product_free(&pc);
        return 1;
    }

    printf("Product code demo (%d x %d matrix, %d message bits)\n", pc.code_rows, pc.code_cols, pc.msg_bits);
    print_matrix(&pc, cw);

    free(msg);
    free(cw);
    product_free(&pc);
    return 0;
}
