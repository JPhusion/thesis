#include <stdint.h>

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#define main bch_test_encode_main
#include "test_encode.c"
#undef main

EMSCRIPTEN_KEEPALIVE
int bcht_run_test_encode(void) {
    g_fail = 0;
    g_skip = 0;
    return bch_test_encode_main();
}
