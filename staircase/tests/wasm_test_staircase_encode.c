#define main staircase_test_encode_main
#include "test_staircase_encode.c"
#undef main

#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

EMSCRIPTEN_KEEPALIVE
int sct_run_test_staircase_encode(void) {
    return staircase_test_encode_main();
}
