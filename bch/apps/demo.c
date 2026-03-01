#include <stdio.h>
#include <stdlib.h>
#include "bch.h"

int main(void) {
    bch_ctx_t bch;
    if (bch_init(&bch, 4, 0b10011, 2) != 0) return 1;

    printf("BCH stub init: m=%d t=%d n=%d k=%d dg=%d\n", bch.m, bch.t, bch.n, bch.k, bch.dg);

    bch_free(&bch);
    return 0;
}
