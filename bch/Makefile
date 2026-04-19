CC = cc
CFLAGS = -std=c11 -Wall -Wextra -O2 -Iinclude

SRC = src/gf.c \
      src/bch_gen.c \
      src/bch_encode.c \
      src/bch_trace.c \
      src/bch_syndrome.c \
      src/bch_bm.c \
      src/bch_chien.c \
      src/bch_decode.c

OBJ = $(SRC:.c=.o)

all: demo encode test_gf test_encode test_decode snr_sweep

demo: apps/demo.c $(OBJ)
	$(CC) $(CFLAGS) -o build_demo apps/demo.c $(OBJ)

encode: apps/encode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_encode apps/encode.c $(OBJ)

test_gf: tests/test_gf.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_gf tests/test_gf.c $(OBJ)

test_encode: tests/test_encode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_encode tests/test_encode.c $(OBJ)

test_decode: tests/test_decode.c $(OBJ)
	$(CC) $(CFLAGS) -o build_test_decode tests/test_decode.c $(OBJ)

snr_sweep: apps/snr_sweep.c $(OBJ)
	$(CC) $(CFLAGS) -o build_bch_snr_sweep apps/snr_sweep.c $(OBJ) -lm

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

test: all
	./build_test_gf
	./build_test_encode
	./build_test_decode

clean:
	rm -f $(OBJ) build_demo build_test_gf build_test_encode build_test_decode build_bch_snr_sweep
