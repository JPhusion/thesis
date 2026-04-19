#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "staircase.h"

static int bits_equal(const uint8_t *a, const uint8_t *b, int n) {
    for (int i = 0; i < n; i++) {
        if ((a[i] & 1u) != (b[i] & 1u)) {
            return 0;
        }
    }
    return 1;
}

static void fill_pattern(uint8_t *msg, int n) {
    for (int i = 0; i < n; i++) {
        msg[i] = (uint8_t)(((i * 5) + 3) & 1u);
    }
}

int main(void) {
    staircase_ctx_t sc;
    if (staircase_init(&sc, 4, 0b10011u, 1, 3) != 0) {
        fprintf(stderr, "staircase_init failed\n");
        return 1;
    }

    uint8_t *msg = (uint8_t *)calloc((size_t)sc.msg_bits, 1);
    uint8_t *state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    uint8_t *stored = (uint8_t *)calloc((size_t)sc.stored_bits, 1);
    uint8_t *rx_state = (uint8_t *)calloc((size_t)sc.state_bits, 1);
    uint8_t *decoded_msg = (uint8_t *)calloc((size_t)sc.msg_bits, 1);
    uint8_t *work_stored = (uint8_t *)calloc((size_t)sc.stored_bits, 1);
    if (!msg || !state || !stored || !rx_state || !decoded_msg || !work_stored) {
        fprintf(stderr, "alloc failed\n");
        free(msg);
        free(state);
        free(stored);
        free(rx_state);
        free(decoded_msg);
        free(work_stored);
        staircase_free(&sc);
        return 1;
    }

    fill_pattern(msg, sc.msg_bits);
    if (staircase_encode_terminated(&sc, msg, state) != 0) {
        fprintf(stderr, "encode failed\n");
        goto fail;
    }
    if (staircase_validate(&sc, state) != 1) {
        fprintf(stderr, "encoded state failed validation\n");
        goto fail;
    }

    staircase_extract_stored(&sc, state, stored);

    staircase_import_stored(&sc, stored, rx_state);
    staircase_decode_stats_t stats;
    if (staircase_decode_windowed(&sc, rx_state, 3, 3, &stats) != 0) {
        fprintf(stderr, "clean decode failed\n");
        goto fail;
    }
    if (stats.final_valid != 1 || stats.locked_blocks != sc.total_blocks - 1) {
        fprintf(stderr, "unexpected clean decode stats: valid=%d locked=%d\n", stats.final_valid, stats.locked_blocks);
        goto fail;
    }
    staircase_extract_message(&sc, rx_state, decoded_msg);
    if (!bits_equal(msg, decoded_msg, sc.msg_bits)) {
        fprintf(stderr, "clean decode did not preserve the message\n");
        goto fail;
    }

    int single_bit_pass = 0;
    for (int bit = 0; bit < sc.stored_bits; bit++) {
        memcpy(work_stored, stored, (size_t)sc.stored_bits);
        work_stored[bit] ^= 1u;
        staircase_import_stored(&sc, work_stored, rx_state);
        if (staircase_decode_windowed(&sc, rx_state, 3, 3, &stats) != 0) {
            fprintf(stderr, "single-bit decode failed at stored bit %d\n", bit);
            goto fail;
        }
        if (stats.final_valid != 1) {
            fprintf(stderr, "single-bit decode invalid at stored bit %d\n", bit);
            goto fail;
        }
        staircase_extract_message(&sc, rx_state, decoded_msg);
        if (!bits_equal(msg, decoded_msg, sc.msg_bits)) {
            fprintf(stderr, "single-bit decode changed message at stored bit %d\n", bit);
            goto fail;
        }
        single_bit_pass++;
    }

    printf("CONFIG staircase short BCH(%d,%d,%d) data_blocks=%d window=%d max_iters=%d stored_bits=%d\n",
           sc.n, sc.k, sc.t, sc.data_blocks, 3, 3, sc.stored_bits);
    printf("CASE clean_decode rc=0 final_valid=%d locked=%d\n", stats.final_valid, stats.locked_blocks);
    printf("CASE single_bit_errors total=%d pass=%d fail=0\n", sc.stored_bits, single_bit_pass);
    printf("PASS staircase decode\n");

    free(msg);
    free(state);
    free(stored);
    free(rx_state);
    free(decoded_msg);
    free(work_stored);
    staircase_free(&sc);
    return 0;

fail:
    free(msg);
    free(state);
    free(stored);
    free(rx_state);
    free(decoded_msg);
    free(work_stored);
    staircase_free(&sc);
    return 1;
}
