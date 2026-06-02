.PHONY: all native-build native-test site-build site-serve site-deploy site-test product-square-plot product-square-plots thesis-seminar-plots ber-suite ber-suite-bootstrap

CODE ?= all
TARGET_ERRORS ?= 300
MAX_FRAMES ?= 0
CALIBRATION_ERRORS ?= 12
JOBS ?= $(shell getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || python3 -c 'import os; print(os.cpu_count() or 1)' 2>/dev/null || echo 4)
START_DB ?= 0
END_DB ?= 6
STEP_DB ?= 0.1
PLOT_VENV ?= $(CURDIR)/.venv-thesis-plots
PLOT_PYTHON ?= $(PLOT_VENV)/bin/python
BOOTSTRAP_PYTHON ?= /opt/homebrew/bin/python3

all: native-build

native-build:
	$(MAKE) -C bch all
	$(MAKE) -C product all
	$(MAKE) -C staircase all

native-test:
	$(MAKE) -C bch test
	$(MAKE) -C product test
	$(MAKE) -C staircase test

site-build:
	./scripts/site/build_wasm.sh
	./scripts/site/gen_vectors.sh

site-serve:
	python3 -m http.server 8080 --directory site

site-deploy: site-build
	./scripts/site/deploy_gh_pages.sh

site-test: site-build
	node ./site/tests/wasm_parity.mjs
	node ./site/tests/product_smoke.mjs
	node ./site/tests/staircase_smoke.mjs

product-square-plot:
	python3 ./scripts/product/plot_square_reference_snr.py --code $(CODE) --target-errors $(TARGET_ERRORS) --max-frames $(MAX_FRAMES) --jobs $(JOBS) --start-db $(START_DB) --end-db $(END_DB) --step-db $(STEP_DB)

product-square-plots: product-square-plot

$(PLOT_PYTHON):
	$(BOOTSTRAP_PYTHON) -m venv $(PLOT_VENV)
	$(PLOT_PYTHON) -m pip install --upgrade pip matplotlib

thesis-seminar-plots: $(PLOT_PYTHON)
	$(PLOT_PYTHON) ./scripts/thesis/generate_seminar_plots.py --start-db $(START_DB) --end-db $(END_DB) --step-db $(STEP_DB) --target-errors $(TARGET_ERRORS) --max-frames-per-point $(MAX_FRAMES) --jobs $(JOBS) --out-dir ./artifacts/thesis-seminar-plots

ber-suite:
	./scripts/wsl/run_all_ber.sh --target-errors $(TARGET_ERRORS) --max-frames-per-point $(MAX_FRAMES) --calibration-errors $(CALIBRATION_ERRORS) --jobs $(JOBS) --start-db $(START_DB) --end-db $(END_DB) --step-db $(STEP_DB)

ber-suite-bootstrap:
	./scripts/wsl/run_all_ber.sh --bootstrap --target-errors $(TARGET_ERRORS) --max-frames-per-point $(MAX_FRAMES) --calibration-errors $(CALIBRATION_ERRORS) --jobs $(JOBS) --start-db $(START_DB) --end-db $(END_DB) --step-db $(STEP_DB)
