#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "bch.h"

static int parse_bits_msb_first(const char *s, uint8_t *out_lsb_first, int nbits) {
    int len = (int)strlen(s);
    if (len != nbits) return -1;

    for (int i = 0; i < nbits; i++) {
        char ch = s[i];
        uint8_t bit;
        if (ch == '0') bit = 0;
        else if (ch == '1') bit = 1;
        else return -1;

        // s[0] is MSB -> store into highest degree index (nbits-1)
        out_lsb_first[nbits - 1 - i] = bit;
    }
    return 0;
}

static void print_bits_msb_first(const uint8_t *v_lsb_first, int nbits) {
    for (int i = nbits - 1; i >= 0; i--) putchar(v_lsb_first[i] ? '1' : '0');
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "Usage: %s <7-bit message (MSB-first)>\nExample: %s 1011001\n", argv[0], argv[0]);
        return 1;
    }

    bch_ctx_t bch;
    // Stage 1: BCH(15,7,2) hardcoded in bch_init; prim_poly argument unused for now but keep consistent.
    if (bch_init(&bch, 4, 0b10011, 2) != 0) {
        fprintf(stderr, "bch_init failed (expected stage-1 m=4,t=2).\n");
        return 1;
    }

    uint8_t msg[7] = {0};
    if (parse_bits_msb_first(argv[1], msg, bch.k) != 0) {
        fprintf(stderr, "Message must be exactly %d bits of 0/1 (MSB-first).\n", bch.k);
        bch_free(&bch);
        return 1;
    }

    uint8_t *cw = (uint8_t*)calloc((size_t)bch.n, 1);
    if (!cw) {
        fprintf(stderr, "calloc failed.\n");
        bch_free(&bch);
        return 1;
    }

    bch_encode_systematic(&bch, msg, cw);

    // Internal layout is parity(0..dg-1) then message(dg..n-1),
    // but human-friendly print is message|parity (MSB-first within each block).
    printf("msg     : ");
    print_bits_msb_first(msg, bch.k);
    putchar('\n');

    printf("cw(m|p) : ");

    // Print message part cw[dg..n-1] MSB-first (highest index first)
    for (int i = bch.n - 1; i >= bch.dg; i--) putchar(cw[i] ? '1' : '0');

    putchar('|');

    // Print parity part cw[0..dg-1] MSB-first (dg-1 down to 0)
    for (int i = bch.dg - 1; i >= 0; i--) putchar(cw[i] ? '1' : '0');

    putchar('\n');

    free(cw);
    bch_free(&bch);
    return 0;
}
