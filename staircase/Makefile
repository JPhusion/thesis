CC = cc
CFLAGS = -std=c11 -Wall -Wextra -O2 -Iinclude -I../bch/include

BCH_SRC = ../bch/src/gf.c \
          ../bch/src/bch_gen.c \
          ../bch/src/bch_encode.c \
          ../bch/src/bch_syndrome.c \
          ../bch/src/bch_bm.c \
          ../bch/src/bch_chien.c \
          ../bch/src/bch_decode.c

STAIR_SRC = src/staircase.c \
            src/staircase_trace.c

BCH_OBJ = $(patsubst ../bch/src/%.c,build/bch_%.o,$(BCH_SRC))
STAIR_OBJ = $(patsubst src/%.c,build/staircase_%.o,$(STAIR_SRC))
OBJ = $(BCH_OBJ) $(STAIR_OBJ)

# Rebuild all objects when any local or shared BCH header changes, so an
# incremental build never links mismatched struct layouts.
HEADERS = $(wildcard include/*.h) $(wildcard ../bch/include/*.h)
$(OBJ): $(HEADERS)

all: demo test_staircase_encode test_staircase_decode snr_sweep

demo: apps/demo.c $(OBJ)
	$(CC) $(CFLAGS) -o build_staircase_demo apps/demo.c $(OBJ)

test_staircase_encode: tests/test_staircase_encode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_staircase_encode tests/test_staircase_encode.c $(OBJ)

test_staircase_decode: tests/test_staircase_decode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_staircase_decode tests/test_staircase_decode.c $(OBJ)

snr_sweep: apps/snr_sweep.c $(OBJ)
	$(CC) $(CFLAGS) -o build_staircase_snr_sweep apps/snr_sweep.c $(OBJ) -lm

build:
	mkdir -p build

build/bch_%.o: ../bch/src/%.c | build
	$(CC) $(CFLAGS) -c $< -o $@

build/staircase_%.o: src/%.c | build
	$(CC) $(CFLAGS) -c $< -o $@

test: all
	./build_test_staircase_encode
	./build_test_staircase_decode

clean:
	rm -f build/*.o build_staircase_demo build_test_staircase_encode build_test_staircase_decode build_staircase_snr_sweep
