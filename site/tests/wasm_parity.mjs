import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");

const wasmModulePath = path.resolve(root, "site", "assets", "bch.js");
const vectorsPath = path.resolve(root, "site", "tests", "vectors.json");

function bitsMsbToLsb(str) {
  const n = str.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    if (ch !== "0" && ch !== "1") {
      throw new Error(`Invalid bit '${ch}' in "${str}"`);
    }
    out[n - 1 - i] = ch === "1" ? 1 : 0;
  }
  return out;
}

function bitsLsbToMsb(u8) {
  return [...u8].reverse().map((v) => (v ? "1" : "0")).join("");
}

function mallocU8(mod, arr) {
  const ptr = mod._malloc(arr.length);
  mod.HEAPU8.set(arr, ptr);
  return ptr;
}

async function main() {
  let modFactory;
  try {
    ({ default: modFactory } = await import(pathToFileURL(wasmModulePath).href));
  } catch (err) {
    console.error("Failed to load WASM module. Did you run `make site-build`?");
    console.error(err.message);
    process.exit(1);
  }

  const vectors = JSON.parse(await readFile(vectorsPath, "utf8"));
  const mod = await modFactory();
  if (!mod.HEAPU8 || !mod.HEAP32) {
    console.error("WASM memory views missing. Rebuild with the latest scripts via `make site-build`.");
    process.exit(1);
  }

  let total = 0;
  let fails = 0;

  for (const cfg of vectors.configs) {
    const initRc = mod._bchw_init(cfg.m, cfg.prim_poly >>> 0, cfg.t);
    if (initRc !== 0) {
      console.error(`INIT FAIL ${cfg.name}`);
      fails++;
      continue;
    }

    for (const tc of cfg.cases) {
      total++;

      const msg = bitsMsbToLsb(tc.msg_msb);
      const msgPtr = mallocU8(mod, msg);
      const cwPtr = mod._malloc(cfg.n);
      const rxPtr = mod._malloc(cfg.n);
      const errsPtr = mod._malloc(4);

      try {
        const rcEnc = mod._bchw_encode(msgPtr, cfg.k, cwPtr, cfg.n);
        const cw = new Uint8Array(mod.HEAPU8.subarray(cwPtr, cwPtr + cfg.n));
        const cwMsb = bitsLsbToMsb(cw);

        let ok = (rcEnc === 0 && cwMsb === tc.cw_msb);
        if (!ok) {
          console.error(`ENC FAIL ${cfg.name} msg=${tc.msg_msb} rc=${rcEnc}`);
          fails++;
          continue;
        }

        const rx = new Uint8Array(cw);
        for (const p of tc.errors) {
          if (Number.isInteger(p) && p >= 0 && p < rx.length) {
            rx[p] ^= 1;
          }
        }
        mod.HEAPU8.set(rx, rxPtr);

        const rcDec = mod._bchw_decode(rxPtr, cfg.n, errsPtr);
        const outErrs = mod.HEAP32[errsPtr >> 2];
        const corrected = new Uint8Array(mod.HEAPU8.subarray(rxPtr, rxPtr + cfg.n));
        const correctedMsb = bitsLsbToMsb(corrected);

        ok = (rcDec === tc.rc && outErrs === tc.out_errs && correctedMsb === tc.corrected_msb);
        if (!ok) {
          console.error(
            `DEC FAIL ${cfg.name} msg=${tc.msg_msb} rc=${rcDec}/${tc.rc} errs=${outErrs}/${tc.out_errs}`
          );
          fails++;
          continue;
        }
      } finally {
        mod._free(msgPtr);
        mod._free(cwPtr);
        mod._free(rxPtr);
        mod._free(errsPtr);
      }
    }
  }

  mod._bchw_free();

  if (fails === 0) {
    console.log(`PASS wasm parity (${total} cases)`);
    return;
  }

  console.error(`FAIL wasm parity: ${fails}/${total} failed`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
