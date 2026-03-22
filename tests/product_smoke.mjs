import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..");
const wasmModulePath = path.resolve(root, "site", "assets", "product.js");

function mallocU8(mod, arr) {
  const ptr = mod._malloc(arr.length);
  mod.HEAPU8.set(arr, ptr);
  return ptr;
}

function readU8(mod, ptr, len) {
  return new Uint8Array(mod.HEAPU8.subarray(ptr, ptr + len));
}

function assert(condition, msg) {
  if (!condition) {
    throw new Error(msg);
  }
}

const CASES = [
  {
    name: "PC[BCH(7,4,1) x BCH(7,4,1)]",
    init: [3, 0b1011, 1, 3, 0b1011, 1],
    msg: Uint8Array.from([1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1]),
    flips: [0, 17],
    maxIters: 3
  },
  {
    name: "PC[BCH(15,7,2) x BCH(7,4,1)]",
    init: [4, 0b10011, 2, 3, 0b1011, 1],
    msg: Uint8Array.from({ length: 28 }, (_, i) => ((i * 5 + 3) & 1)),
    flips: [4, 73],
    maxIters: 3
  }
];

async function main() {
  let modFactory;
  try {
    ({ default: modFactory } = await import(pathToFileURL(wasmModulePath).href));
  } catch (err) {
    console.error("Failed to load product WASM module. Did you run `make site-build`?");
    console.error(err.message);
    process.exit(1);
  }

  const mod = await modFactory();
  assert(mod.HEAPU8 && mod.HEAP32, "WASM memory views missing.");

  for (const tc of CASES) {
    const rcInit = mod._pw_init(...tc.init);
    assert(rcInit === 0, `${tc.name}: init failed`);

    const msgBits = mod._pw_get_msg_bits();
    const cwBits = mod._pw_get_cw_bits();
    assert(msgBits === tc.msg.length, `${tc.name}: unexpected message size`);
    assert(cwBits > msgBits, `${tc.name}: codeword size should exceed message size`);

    const msgPtr = mallocU8(mod, tc.msg);
    const cwPtr = mod._malloc(cwBits);
    const rxPtr = mod._malloc(cwBits);
    const outMsgPtr = mod._malloc(msgBits);

    try {
      const rcEnc = mod._pw_encode(msgPtr, msgBits, cwPtr, cwBits);
      assert(rcEnc === 0, `${tc.name}: encode failed`);
      const cw = readU8(mod, cwPtr, cwBits);

      mod._pw_extract_message(cwPtr, cwBits, outMsgPtr, msgBits);
      const roundTripMsg = readU8(mod, outMsgPtr, msgBits);
      assert(roundTripMsg.every((bit, idx) => bit === tc.msg[idx]), `${tc.name}: systematic extraction mismatch`);

      const rx = new Uint8Array(cw);
      for (const flip of tc.flips) {
        rx[flip] ^= 1;
      }
      mod.HEAPU8.set(rx, rxPtr);

      const rcTraceEnc = mod._pw_encode_trace(msgPtr, msgBits, cwPtr, cwBits);
      assert(rcTraceEnc === 0, `${tc.name}: encode trace failed`);
      assert(mod._pw_trace_len() > 0, `${tc.name}: encode trace is empty`);

      const rcDec = mod._pw_decode(rxPtr, cwBits, tc.maxIters);
      assert(rcDec === 0, `${tc.name}: decode failed`);
      const corrected = readU8(mod, rxPtr, cwBits);
      assert(corrected.every((bit, idx) => bit === cw[idx]), `${tc.name}: corrected matrix mismatch`);

      mod.HEAPU8.set(rx, rxPtr);
      const rcTraceDec = mod._pw_decode_trace(rxPtr, cwBits, tc.maxIters);
      assert(rcTraceDec === 0, `${tc.name}: decode trace failed`);
      assert(mod._pw_trace_len() > 0, `${tc.name}: decode trace is empty`);

      const statsPtr = mod._pw_decode_stats_ptr();
      const stats = Array.from(mod.HEAP32.subarray(statsPtr >> 2, (statsPtr >> 2) + 8));
      const [maxIters, itersRun, rowFails, colFails, rowChanges, colChanges, finalRowsValid, finalColsValid] = stats;
      assert(maxIters === tc.maxIters, `${tc.name}: wrong max_iters in stats`);
      assert(itersRun === tc.maxIters, `${tc.name}: wrong iterations_run in stats`);
      assert(rowFails >= 0 && colFails >= 0, `${tc.name}: invalid failure counters`);
      assert(rowChanges >= 0 && colChanges >= 0, `${tc.name}: invalid change counters`);
      assert(finalRowsValid === mod._pw_get_code_rows(), `${tc.name}: final row validation mismatch`);
      assert(finalColsValid === mod._pw_get_code_cols(), `${tc.name}: final col validation mismatch`);
    } finally {
      mod._free(msgPtr);
      mod._free(cwPtr);
      mod._free(rxPtr);
      mod._free(outMsgPtr);
      mod._pw_free();
    }
  }

  console.log(`PASS product wasm smoke (${CASES.length} configs)`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
