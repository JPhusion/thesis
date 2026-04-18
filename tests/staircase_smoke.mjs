import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const wasmModulePath = path.resolve(root, "site", "assets", "staircase.js");

function mallocU8(mod, arrOrLen) {
  const len = typeof arrOrLen === "number" ? arrOrLen : arrOrLen.length;
  const ptr = mod._malloc(len);
  if (typeof arrOrLen !== "number") {
    mod.HEAPU8.set(arrOrLen, ptr);
  }
  return ptr;
}

function readU8(mod, ptr, len) {
  return new Uint8Array(mod.HEAPU8.subarray(ptr, ptr + len));
}

function freeAll(mod, ptrs) {
  for (const ptr of ptrs) {
    if (ptr) mod._free(ptr);
  }
}

async function loadModule() {
  let modFactory;
  try {
    ({ default: modFactory } = await import(pathToFileURL(wasmModulePath).href));
  } catch {
    console.error("Failed to load staircase WASM module. Did you run `make site-build`?");
    process.exit(1);
  }

  return modFactory({
    locateFile(file) {
      return path.resolve(path.dirname(wasmModulePath), file);
    },
    print() {},
    printErr() {}
  });
}

async function main() {
  const mod = await loadModule();
  const rc = mod._sw_init(4, 0b10011, 1, 2);
  if (rc !== 0) {
    throw new Error(`sw_init failed: ${rc}`);
  }

  const msgBits = mod._sw_get_msg_bits();
  const stateBits = mod._sw_get_state_bits();
  const storedBits = mod._sw_get_stored_bits();
  const msg = new Uint8Array(msgBits);
  for (let i = 0; i < msg.length; i++) {
    msg[i] = (i * 5 + 1) & 1;
  }

  const msgPtr = mallocU8(mod, msg);
  const statePtr = mallocU8(mod, stateBits);
  const storedPtr = mallocU8(mod, storedBits);
  const decodedPtr = mallocU8(mod, msgBits);
  try {
    const encRc = mod._sw_encode(msgPtr, msgBits, statePtr, stateBits);
    if (encRc !== 0) {
      throw new Error(`sw_encode failed: ${encRc}`);
    }

    const valid = mod._sw_validate(statePtr, stateBits);
    if (valid !== 1) {
      throw new Error(`sw_validate returned ${valid}`);
    }

    const state = readU8(mod, statePtr, stateBits);
    const blockBits = mod._sw_get_block_size() ** 2;
    const b0 = state.subarray(0, blockBits);
    if (b0.some((bit) => bit !== 0)) {
      throw new Error("B0 is not all zero");
    }

    mod._sw_extract_stored(statePtr, stateBits, storedPtr, storedBits);
    const stored = readU8(mod, storedPtr, storedBits);
    stored[7] ^= 1;
    mod.HEAPU8.set(stored, storedPtr);
    mod._sw_import_stored(storedPtr, storedBits, statePtr, stateBits);

    const decRc = mod._sw_decode(statePtr, stateBits, 3, 3);
    if (decRc !== 0) {
      throw new Error(`sw_decode failed: ${decRc}`);
    }
    mod._sw_extract_message(statePtr, stateBits, decodedPtr, msgBits);
    const decoded = readU8(mod, decodedPtr, msgBits);
    if (decoded.some((bit, idx) => bit !== msg[idx])) {
      throw new Error("decoded message does not match original");
    }
  } finally {
    freeAll(mod, [msgPtr, statePtr, storedPtr, decodedPtr]);
    mod._sw_free();
  }

  console.log("PASS staircase wasm smoke");
}

main().catch((err) => {
  console.error(`FAIL staircase wasm smoke: ${err.message}`);
  process.exit(1);
});
