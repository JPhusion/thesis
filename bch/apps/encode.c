#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "bch.h"

static int parse_bits(const char *s, uint8_t *out, int nbits) {
    int len = (int)strlen(s);
    if (len != nbits) return -1;
    for (int i = 0; i < nbits; i++) {
        if (s[i] == '0') out[i] = 0;
        else if (s[i] == '1') out[i] = 1;
        else return -1;
    }
    return 0;
}

static void print_bits(const uint8_t *v, int nbits) {
    for (int i = 0; i < nbits; i++) putchar(v[i] ? '1' : '0');
    putchar('\n');
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <7-bit message>\nExample: %s 1011001\n", argv[0], argv[0]);
        return 1;
    }

    bch_ctx_t bch;
    // Stage 1 hardcode: BCH(15,7,2) uses m=4, t=2, primitive poly can stay 0b10011 for now
    if (bch_init(&bch, 4, 0b10011, 2) != 0) {
        fprintf(stderr, "bch_init failed (expected m=4,t=2 stage).\n");
        return 1;
    }

    uint8_t msg[7] = {0};
    if (parse_bits(argv[1], msg, bch.k) != 0) {
        fprintf(stderr, "Message must be exactly %d bits of 0/1.\n", bch.k);
        bch_free(&bch);
        return 1;
    }

    uint8_t *cw = (uint8_t*)calloc((size_t)bch.n, 1);
    bch_encode_systematic(&bch, msg, cw);

    printf("msg   : ");
    print_bits(msg, bch.k);

    printf("parity: ");
    print_bits(cw, bch.dg);

    printf("cw    : ");
    print_bits(cw, bch.n);

    free(cw);
    bch_free(&bch);
    return 0;
}
