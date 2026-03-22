#include <stdint.h>

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#define main product_test_decode_main
#include "test_product_decode.c"
#undef main

EMSCRIPTEN_KEEPALIVE
int pct_run_test_product_decode(void) {
    g_fail_examples = 0;
    return product_test_decode_main();
}
