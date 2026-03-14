#include <stdint.h>

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

#define main bch_test_decode_main
#include "test_decode.c"
#undef main

EMSCRIPTEN_KEEPALIVE
int bcht_run_test_decode(void) {
    g_fail_examples = 0;
    return bch_test_decode_main();
}
