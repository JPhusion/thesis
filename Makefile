.PHONY: all native-build native-test site-build site-serve site-deploy site-test

all: native-build

native-build:
	$(MAKE) -C bch all

native-test:
	$(MAKE) -C bch test

site-build:
	./scripts/site/build_wasm.sh
	./scripts/site/gen_vectors.sh

site-serve:
	python3 -m http.server 8080 --directory site

site-deploy: site-build
	./scripts/site/deploy_gh_pages.sh

site-test: site-build
	node ./site/tests/wasm_parity.mjs
