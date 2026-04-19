#include <stdio.h>
#include <stdlib.h>

#include "staircase.h"

static void print_block(const staircase_ctx_t *sc, const uint8_t *state, int block) {
    printf("B%d\n", block);
    const uint8_t *base = state + block * sc->block_bits;
    for (int r = 0; r < sc->block_size; r++) {
        for (int c = 0; c < sc->block_size; c++) {
            putchar(base[r * sc->block_size + c] ? '1' : '0');
        }
        putchar('\n');
    }
}

int main(void) {
    staircase_ctx_t sc;
    if (staircase_init(&sc, 4, 0b10011u, 1, 2) != 0) {
        fprintf(stderr, "staircase_init failed\n");
        return 1;
    }

    uint8_t *msg = (uint8_t *)calloc((size_t)sc.msg_bits, 1);
    uint8_t *state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    if (!msg || !state) {
        fprintf(stderr, "alloc failed\n");
        free(msg);
        free(state);
        staircase_free(&sc);
        return 1;
    }

    for (int i = 0; i < sc.msg_bits; i++) {
        msg[i] = (uint8_t)(i & 1u);
    }

    if (staircase_encode_terminated(&sc, msg, state) != 0) {
        fprintf(stderr, "encode failed\n");
        free(msg);
        free(state);
        staircase_free(&sc);
        return 1;
    }

    for (int block = 0; block < sc.total_blocks; block++) {
        print_block(&sc, state, block);
        putchar('\n');
    }

    free(msg);
    free(state);
    staircase_free(&sc);
    return 0;
}
