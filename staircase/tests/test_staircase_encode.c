#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "staircase.h"

static int all_zero(const uint8_t *v, int n) {
    for (int i = 0; i < n; i++) {
        if (v[i] != 0u) {
            return 0;
        }
    }
    return 1;
}

int main(void) {
    staircase_ctx_t sc;
    if (staircase_init(&sc, 4, 0b10011u, 1, 2) != 0) {
        fprintf(stderr, "staircase_init failed\n");
        return 1;
    }

    if (sc.n != 14 || sc.k != 10 || sc.block_size != 7 || sc.info_cols != 3 || sc.total_blocks != 5) {
        fprintf(stderr, "unexpected staircase geometry: n=%d k=%d block=%d info=%d total=%d\n",
                sc.n, sc.k, sc.block_size, sc.info_cols, sc.total_blocks);
        staircase_free(&sc);
        return 1;
    }

    uint8_t *msg = (uint8_t *)calloc((size_t)sc.msg_bits, 1);
    uint8_t *state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    uint8_t *zero_state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    if (!msg || !state || !zero_state) {
        fprintf(stderr, "alloc failed\n");
        free(msg);
        free(state);
        free(zero_state);
        staircase_free(&sc);
        return 1;
    }

    for (int i = 0; i < sc.msg_bits; i++) {
        msg[i] = (uint8_t)((i * 3 + 1) & 1u);
    }

    if (staircase_encode_terminated(&sc, msg, state) != 0) {
        fprintf(stderr, "encode failed\n");
        free(msg);
        free(state);
        free(zero_state);
        staircase_free(&sc);
        return 1;
    }

    if (staircase_validate(&sc, state) != 1) {
        fprintf(stderr, "encoded staircase failed validation\n");
        free(msg);
        free(state);
        free(zero_state);
        staircase_free(&sc);
        return 1;
    }

    if (!all_zero(state, sc.block_bits)) {
        fprintf(stderr, "B0 should remain all zero\n");
        free(msg);
        free(state);
        free(zero_state);
        staircase_free(&sc);
        return 1;
    }

    memset(msg, 0, (size_t)sc.msg_bits);
    if (staircase_encode_terminated(&sc, msg, zero_state) != 0) {
        fprintf(stderr, "zero encode failed\n");
        free(msg);
        free(state);
        free(zero_state);
        staircase_free(&sc);
        return 1;
    }
    if (!all_zero(zero_state, sc.state_bits)) {
        fprintf(stderr, "zero message should encode to all-zero terminated state\n");
        free(msg);
        free(state);
        free(zero_state);
        staircase_free(&sc);
        return 1;
    }

    printf("PASS staircase encode: shortened BCH(%d,%d,%d) -> block=%d info_cols=%d data_blocks=%d\n",
           sc.n, sc.k, sc.t, sc.block_size, sc.info_cols, sc.data_blocks);

    free(msg);
    free(state);
    free(zero_state);
    staircase_free(&sc);
    return 0;
}
