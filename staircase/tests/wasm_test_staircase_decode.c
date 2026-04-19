#define main staircase_test_decode_main
#include "test_staircase_decode.c"
#undef main

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

EMSCRIPTEN_KEEPALIVE
int sct_run_test_staircase_decode(void) {
    return staircase_test_decode_main();
}
