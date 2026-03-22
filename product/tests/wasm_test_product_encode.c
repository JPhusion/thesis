#include <stdint.h>

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#define main product_test_encode_main
#include "test_product_encode.c"
#undef main

EMSCRIPTEN_KEEPALIVE
int pct_run_test_product_encode(void) {
    g_fail = 0;
    return product_test_encode_main();
}
