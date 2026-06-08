CC = cc
CFLAGS = -std=c11 -Wall -Wextra -O2 -Iinclude -I../bch/include

BCH_SRC = ../bch/src/gf.c \
          ../bch/src/bch_gen.c \
          ../bch/src/bch_encode.c \
          ../bch/src/bch_trace.c \
          ../bch/src/bch_syndrome.c \
          ../bch/src/bch_bm.c \
          ../bch/src/bch_chien.c \
          ../bch/src/bch_decode.c

PRODUCT_SRC = src/product.c \
              src/product_trace.c

BCH_OBJ = $(patsubst ../bch/src/%.c,build/bch_%.o,$(BCH_SRC))
PRODUCT_OBJ = $(patsubst src/%.c,build/product_%.o,$(PRODUCT_SRC))
OBJ = $(BCH_OBJ) $(PRODUCT_OBJ)

# Rebuild all objects when any local or shared BCH header changes, so an
# incremental build never links mismatched struct layouts.
HEADERS = $(wildcard include/*.h) $(wildcard ../bch/include/*.h)
$(OBJ): $(HEADERS)

all: demo test_product_encode test_product_decode

demo: apps/demo.c $(OBJ)
	$(CC) $(CFLAGS) -o build_product_demo apps/demo.c $(OBJ)

snr_sweep: apps/snr_sweep.c $(OBJ)
	$(CC) $(CFLAGS) -o build_product_snr_sweep apps/snr_sweep.c $(OBJ) -lm

test_product_encode: tests/test_product_encode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_product_encode tests/test_product_encode.c $(OBJ)

test_product_decode: tests/test_product_decode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_product_decode tests/test_product_decode.c $(OBJ)

build:
	mkdir -p build

build/bch_%.o: ../bch/src/%.c | build
	$(CC) $(CFLAGS) -c $< -o $@

build/product_%.o: src/%.c | build
	$(CC) $(CFLAGS) -c $< -o $@

test: all
	./build_test_product_encode
	./build_test_product_decode

clean:
	rm -f build/*.o build_product_demo build_test_product_encode build_test_product_decode build_product_snr_sweep
