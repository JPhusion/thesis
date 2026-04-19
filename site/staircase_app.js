const PRESETS = [
  {
    name: "SC[short BCH(14,10,1), 7 data blocks]",
    m: 4,
    t: 1,
    prim: "0b10011",
    dataBlocks: 7,
    windowSize: 3,
    maxIters: 3
  },
  {
    name: "SC[short BCH(30,20,2), 7 data blocks]",
    m: 5,
    t: 2,
    prim: "0b100101",
    dataBlocks: 7,
    windowSize: 3,
    maxIters: 3
  },
  {
    name: "SC[short BCH(62,50,2), 7 data blocks]",
    m: 6,
    t: 2,
    prim: "0b1000011",
    dataBlocks: 7,
    windowSize: 3,
    maxIters: 3
  }
];

const BUILD_QUERY = new URL(import.meta.url).search;

const TRACE = {
  STAGE_BEGIN: 1,
  BLOCK_BEGIN: 10,
  INFO_BIT: 11,
  ROW_BEGIN: 20,
  PARITY_WRITE: 21,
  ROW_END: 22,
  BLOCK_END: 23,
  STAGE_END: 30,

  DECODE_BEGIN: 100,
  WINDOW_BEGIN: 110,
  DECODE_ITER_BEGIN: 120,
  DECODE_ROW_BEGIN: 130,
  DECODE_FLIP: 131,
  DECODE_ROW_END: 132,
  DECODE_ITER_END: 140,
  WINDOW_LOCK: 150,
  DECODE_END: 160
};

const el = {
  status: document.getElementById("stairStatus"),
  warning: document.getElementById("stairWarning"),
  focusBtn: document.getElementById("stairFocusBtn"),
  configPanel: document.querySelector(".staircase-config-panel"),

  preset: document.getElementById("stairPreset"),
  advanced: document.getElementById("stairAdvanced"),
  dataBlocks: document.getElementById("stairDataBlocks"),
  windowSize: document.getElementById("stairWindowSize"),
  maxIters: document.getElementById("stairMaxIters"),
  m: document.getElementById("stairM"),
  t: document.getElementById("stairT"),
  prim: document.getElementById("stairPrim"),
  applyCfg: document.getElementById("applyStairCfg"),
  cfgMeta: document.getElementById("stairCfgMeta"),

  stepButtons: {
    input: document.getElementById("stairStepInput"),
    encode: document.getElementById("stairStepEncode"),
    errors: document.getElementById("stairStepErrors"),
    decode: document.getElementById("stairStepDecode")
  },
  screens: {
    input: document.getElementById("stair-screen-input"),
    encode: document.getElementById("stair-screen-encode"),
    errors: document.getElementById("stair-screen-errors"),
    decode: document.getElementById("stair-screen-decode")
  },

  msgBits: document.getElementById("stairMsgBits"),
  msgMeta: document.getElementById("stairMsgMeta"),
  infoPreview: document.getElementById("stairInfoPreview"),
  startEncode: document.getElementById("stairStartEncode"),

  encSpeed: document.getElementById("stairEncSpeed"),
  encBack: document.getElementById("stairEncBack"),
  encPlay: document.getElementById("stairEncPlay"),
  encPause: document.getElementById("stairEncPause"),
  encStep: document.getElementById("stairEncStep"),
  encReset: document.getElementById("stairEncReset"),
  encMeta: document.getElementById("stairEncMeta"),
  encPhase: document.getElementById("stairEncPhase"),
  encodeScene: document.getElementById("stairEncodeScene"),
  encNarrative: document.getElementById("stairEncNarrative"),
  rowMeta: document.getElementById("stairRowMeta"),
  rowDetail: document.getElementById("stairRowDetail"),

  errMeta: document.getElementById("stairErrMeta"),
  errCount: document.getElementById("stairErrCount"),
  errScene: document.getElementById("stairErrorScene"),
  errClear: document.getElementById("stairErrClear"),
  startDecode: document.getElementById("stairStartDecode"),

  decSpeed: document.getElementById("stairDecSpeed"),
  decBack: document.getElementById("stairDecBack"),
  decPlay: document.getElementById("stairDecPlay"),
  decPause: document.getElementById("stairDecPause"),
  decStep: document.getElementById("stairDecStep"),
  decReset: document.getElementById("stairDecReset"),
  decMeta: document.getElementById("stairDecMeta"),
  decPhase: document.getElementById("stairDecPhase"),
  decodeScene: document.getElementById("stairDecodeScene"),
  decNarrative: document.getElementById("stairDecNarrative"),
  decRowMeta: document.getElementById("stairDecRowMeta"),
  decRowDetail: document.getElementById("stairDecRowDetail")
};

const state = {
  mod: null,
  cfg: null,
  focusMode: true,
  screen: "input",
  maxUnlocked: 0,
  message: null,
  encoded: null,
  noisy: null,
  corrupted: null,
  decodeResult: null,
  encodeFrames: [],
  encodeFrameIdx: 0,
  encodeTimer: null,
  decodeFrames: [],
  decodeFrameIdx: 0,
  decodeTimer: null
};

function setStatus(msg) {
  el.status.textContent = msg;
}

function setWarning(msg) {
  if (!msg) {
    el.warning.classList.add("hidden");
    el.warning.textContent = "";
    return;
  }
  el.warning.textContent = msg;
  el.warning.classList.remove("hidden");
}

function setFocusMode(enabled) {
  state.focusMode = !!enabled;
  el.configPanel.classList.toggle("collapsed", state.focusMode);
  el.focusBtn.textContent = state.focusMode ? "Show Configuration" : "Hide Configuration";
}

function syncAdvancedState() {
  const manualEnabled = !!el.advanced.checked;
  [el.m, el.t, el.prim].forEach((input) => {
    input.disabled = !manualEnabled;
  });
}

function sanitizeBitsInput(raw) {
  return raw.replace(/[^01]/g, "");
}

function parsePrim(raw) {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("0x")) return Number.parseInt(s.slice(2), 16);
  if (s.startsWith("0b")) return Number.parseInt(s.slice(2), 2);
  return Number.parseInt(s, 10);
}

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

function readDecodeStats(mod) {
  const base = mod._sw_decode_stats_ptr() >> 2;
  return {
    windowSize: mod.HEAP32[base],
    maxIters: mod.HEAP32[base + 1],
    windowsRun: mod.HEAP32[base + 2],
    iterationsRun: mod.HEAP32[base + 3],
    totalRowDecodes: mod.HEAP32[base + 4],
    totalRowFailures: mod.HEAP32[base + 5],
    totalRowChanges: mod.HEAP32[base + 6],
    lockedBlocks: mod.HEAP32[base + 7],
    finalValid: mod.HEAP32[base + 8]
  };
}

function blockBitIndex(cfg, block, row, col) {
  return block * cfg.blockBits + row * cfg.blockSize + col;
}

function orientationForBlock(block) {
  return (block % 2 === 0) ? "horizontal" : "vertical";
}

function buildInfoState(cfg, message) {
  const bits = new Uint8Array(cfg.stateBits);
  let cursor = 0;
  for (let block = 1; block <= cfg.dataBlocks; block++) {
    for (let row = 0; row < cfg.blockSize; row++) {
      for (let col = 0; col < cfg.infoCols; col++) {
        const bit = cursor < message.length ? (message[cursor] & 1) : 0;
        bits[blockBitIndex(cfg, block, row, col)] = bit;
        cursor += 1;
      }
    }
  }
  return bits;
}

function buildSeed(cfg, fill = 0) {
  return new Uint8Array(cfg.stateBits).fill(fill);
}

function buildVisibleSeed(cfg) {
  return buildSeed(cfg, 0);
}

function buildAllVisible(cfg) {
  return buildSeed(cfg, 1);
}

function buildBaseVisible(cfg, bitCount, revealAllInfo = false) {
  const visible = buildVisibleSeed(cfg);
  for (let row = 0; row < cfg.blockSize; row++) {
    for (let col = 0; col < cfg.blockSize; col++) {
      visible[blockBitIndex(cfg, 0, row, col)] = 1;
    }
  }
  let cursor = 0;
  for (let block = 1; block <= cfg.dataBlocks; block++) {
    for (let row = 0; row < cfg.blockSize; row++) {
      for (let col = 0; col < cfg.infoCols; col++) {
        if (revealAllInfo || cursor < bitCount) {
          visible[blockBitIndex(cfg, block, row, col)] = 1;
        }
        cursor += 1;
      }
    }
  }
  for (let block = cfg.dataBlocks + 1; block < cfg.totalBlocks; block++) {
    for (let row = 0; row < cfg.blockSize; row++) {
      for (let col = 0; col < cfg.infoCols; col++) {
        visible[blockBitIndex(cfg, block, row, col)] = 1;
      }
    }
  }
  return visible;
}

function makeFrame(bits, updates = {}) {
  return {
    bits: new Uint8Array(bits),
    visible: updates.visible ? new Uint8Array(updates.visible) : null,
    flashed: updates.flashed ? [...updates.flashed] : [],
    activeBlock: updates.activeBlock ?? null,
    activeRow: updates.activeRow ?? null,
    sourceBlock: updates.sourceBlock ?? null,
    sourceCol: updates.sourceCol ?? null,
    isTail: updates.isTail ?? false,
    phase: updates.phase || "",
    narrative: updates.narrative || "",
    lockedBlocks: updates.lockedBlocks ? new Uint8Array(updates.lockedBlocks) : null,
    windowStart: updates.windowStart ?? null,
    windowEnd: updates.windowEnd ?? null,
    outputBlock: updates.outputBlock ?? null,
    sourceLocked: updates.sourceLocked ?? false,
    corrupted: updates.corrupted ? new Uint8Array(updates.corrupted) : null,
    decodeMeta: updates.decodeMeta || null
  };
}

function traceEvents(mod) {
  const ptr = mod._sw_trace_ptr();
  const len = mod._sw_trace_len();
  const stride = mod._sw_trace_stride() >>> 2;
  const base = ptr >>> 2;
  const out = [];
  for (let i = 0; i < len; i++) {
    const off = base + i * stride;
    out.push({
      kind: mod.HEAPU32[off],
      a: mod.HEAP32[off + 1],
      b: mod.HEAP32[off + 2],
      u0: mod.HEAPU32[off + 3],
      u1: mod.HEAPU32[off + 4],
      u2: mod.HEAPU32[off + 5]
    });
  }
  return out;
}

function buildEncodeFrames(cfg, initialBits, trace) {
  const bits = new Uint8Array(initialBits);
  const visible = buildBaseVisible(cfg, cfg.msgBits, true);
  const frames = [makeFrame(bits, {
    visible,
    phase: "Preloaded staircase",
    narrative: "B0 starts as the all-zero block. Payload information and zero-input tail data are already visible. Parity stays blank until each row writes it."
  })];

  let activeBlock = null;
  let activeRow = null;
  let sourceBlock = null;
  let sourceCol = null;
  let isTail = false;

  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    switch (ev.kind) {
      case TRACE.BLOCK_BEGIN:
        activeBlock = ev.a;
        activeRow = null;
        sourceBlock = activeBlock - 1;
        sourceCol = null;
        isTail = !!ev.b;
        frames.push(makeFrame(bits, {
          visible,
          activeBlock,
          sourceBlock,
          phase: isTail ? `Tail block B${activeBlock}` : `Data block B${activeBlock}`,
          narrative: isTail
            ? `B${activeBlock} takes zero new payload input. Its rows still generate parity from the inherited staircase constraint to flush the chain.`
            : activeBlock === 1
              ? `Start encoding B1 from the known zero boundary block B0.`
              : `Start encoding B${activeBlock}. Each row combines a source column from B${activeBlock - 1} with the row's information bits.`,
          isTail
        }));
        break;
      case TRACE.ROW_BEGIN:
        activeBlock = ev.a;
        activeRow = ev.b;
        sourceBlock = activeBlock - 1;
        sourceCol = activeRow;
        if (sourceBlock === 0) {
          for (let c = 0; c < cfg.blockSize; c++) {
            visible[blockBitIndex(cfg, sourceBlock, sourceCol, c)] = 1;
          }
        } else {
          for (let r = 0; r < cfg.blockSize; r++) {
            visible[blockBitIndex(cfg, sourceBlock, r, sourceCol)] = 1;
          }
        }
        for (let c = 0; c < cfg.infoCols; c++) {
          visible[blockBitIndex(cfg, activeBlock, activeRow, c)] = 1;
        }
        frames.push(makeFrame(bits, {
          visible,
          activeBlock,
          activeRow,
          sourceBlock,
          sourceCol,
          phase: `Encoding row ${activeRow + 1} of B${activeBlock}`,
          narrative: sourceBlock === 0
            ? `Use row ${sourceCol + 1} from B0 as the inherited half for the first staircase codeword.`
            : `Use column ${sourceCol + 1} from B${sourceBlock}<sup>T</sup> as the inherited half for this staircase codeword.`,
          isTail
        }));
        break;
      case TRACE.PARITY_WRITE: {
        const block = ev.a;
        const row = ev.b;
        const flashed = [];
        while (i < trace.length && trace[i].kind === TRACE.PARITY_WRITE && trace[i].a === block && trace[i].b === row) {
          const pev = trace[i];
          const col = pev.u0;
          const bit = pev.u1 & 1;
          bits[blockBitIndex(cfg, block, row, col)] = bit;
          visible[blockBitIndex(cfg, block, row, col)] = 1;
          flashed.push({ block, row, col });
          i += 1;
        }
        i -= 1;
        frames.push(makeFrame(bits, {
          visible,
          activeBlock: block,
          activeRow: row,
          sourceBlock: block - 1,
          sourceCol: row,
          flashed,
          phase: `Writing parity for row ${row + 1} in B${block}`,
          narrative: `The parity strip for row ${row + 1} of B${block} lands together as one BCH write.`,
          isTail: block > cfg.dataBlocks
        }));
        break;
      }
      case TRACE.ROW_END:
        frames.push(makeFrame(bits, {
          visible,
          activeBlock: ev.a,
          activeRow: ev.b,
          sourceBlock: ev.a - 1,
          sourceCol: ev.b,
          phase: `Row ${ev.b + 1} complete in B${ev.a}`,
          narrative: ev.a === 1
            ? `Row ${ev.b + 1} of B1 now completes one shortened BCH codeword across [B0 | B1].`
            : `Row ${ev.b + 1} of B${ev.a} now completes one shortened BCH codeword across [B${ev.a - 1}<sup>T</sup> | B${ev.a}].`,
          isTail: ev.a > cfg.dataBlocks
        }));
        break;
      case TRACE.BLOCK_END:
        frames.push(makeFrame(bits, {
          visible,
          activeBlock: ev.a,
          sourceBlock: ev.a - 1,
          phase: `Block B${ev.a} complete`,
          narrative: `Finished B${ev.a}. The next staircase block will inherit it through the transpose rule.`,
          isTail: ev.a > cfg.dataBlocks
        }));
        break;
      case TRACE.STAGE_END:
        frames.push(makeFrame(bits, {
          visible,
          phase: ev.a === 0 ? "Encoding complete" : "Encoding failed",
          narrative: ev.a === 0
            ? "The terminated staircase is complete. The two tail blocks carry zero-input tail parity."
            : "Encoding failed."
        }));
        break;
      default:
        break;
    }
  }

  return frames;
}

function buildDecodeFrames(cfg, initialBits, trace, corruptedMask, summary) {
  const bits = new Uint8Array(initialBits);
  const visible = buildAllVisible(cfg);
  const lockedBlocks = new Uint8Array(cfg.totalBlocks);
  const frames = [makeFrame(bits, {
    visible,
    corrupted: corruptedMask,
    lockedBlocks,
    phase: "Received staircase",
    narrative: `Start with the received staircase state. The decode window will span ${cfg.windowSize} stored blocks and lock one completed block each time it slides.`
  })];

  let windowStart = null;
  let windowEnd = null;
  let outputBlock = null;
  let activeBlock = null;
  let activeRow = null;
  let sourceBlock = null;
  let sourceCol = null;
  let sourceLocked = false;
  let currentWindowIdx = null;
  let currentIter = null;

  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    switch (ev.kind) {
      case TRACE.WINDOW_BEGIN:
        currentWindowIdx = ev.a;
        outputBlock = ev.b;
        windowStart = ev.u0;
        windowEnd = ev.u1;
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          windowStart,
          windowEnd,
          outputBlock,
          phase: `Window ${currentWindowIdx + 1}: B${windowStart}..B${windowEnd}`,
          narrative: `Open decode window ${currentWindowIdx + 1}. B${outputBlock} is the block that will be output and locked when this window finishes.`
        }));
        break;
      case TRACE.DECODE_ITER_BEGIN:
        currentWindowIdx = ev.a;
        currentIter = ev.b;
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          windowStart,
          windowEnd,
          outputBlock,
          phase: `Window ${currentWindowIdx + 1}, iteration ${currentIter + 1}`,
          narrative: `Sweep left-to-right across the active staircase window for iteration ${currentIter + 1}.`,
          decodeMeta: { iter: currentIter + 1 }
        }));
        break;
      case TRACE.DECODE_ROW_BEGIN:
        activeBlock = ev.a;
        activeRow = ev.b;
        sourceBlock = activeBlock - 1;
        sourceCol = activeRow;
        currentWindowIdx = ev.u0;
        currentIter = ev.u1;
        sourceLocked = !!ev.u2;
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          activeBlock,
          activeRow,
          sourceBlock,
          sourceCol,
          sourceLocked,
          windowStart,
          windowEnd,
          outputBlock,
          phase: `Decoding row ${activeRow + 1} of B${activeBlock}`,
          narrative: sourceBlock === 0
            ? `Decode [B0 | B1] using the fixed zero boundary on the left.`
            : sourceLocked
              ? `Decode row ${activeRow + 1} of B${activeBlock} using the already locked source column from B${sourceBlock}.`
              : `Decode row ${activeRow + 1} of B${activeBlock} against source column ${sourceCol + 1} from B${sourceBlock}.`,
          decodeMeta: { iter: currentIter + 1 }
        }));
        break;
      case TRACE.DECODE_FLIP: {
        const block = ev.a;
        const packedRC = ev.u1;
        const flashed = [];
        while (i < trace.length && trace[i].kind === TRACE.DECODE_FLIP && trace[i].a === block) {
          const fev = trace[i];
          const target = fev.b;
          const rc2 = fev.u1;
          const row2 = rc2 >>> 16;
          const col2 = rc2 & 0xffff;
          const after2 = fev.u2 & 1;
          bits[blockBitIndex(cfg, target, row2, col2)] = after2;
          corruptedMask[blockBitIndex(cfg, target, row2, col2)] = 0;
          flashed.push({ block: target, row: row2, col: col2 });
          i += 1;
        }
        i -= 1;
        const decodedRow = activeRow != null ? activeRow : (packedRC >>> 16);
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          activeBlock: block,
          activeRow: decodedRow,
          sourceBlock: block - 1,
          sourceCol: decodedRow,
          sourceLocked,
          windowStart,
          windowEnd,
          outputBlock,
          flashed,
          phase: `Corrections applied in B${block}`,
          narrative: `The bounded-distance decoder flipped the highlighted bits for row ${decodedRow + 1} of B${block}.`,
          decodeMeta: { iter: currentIter + 1 }
        }));
        break;
      }
      case TRACE.DECODE_ROW_END: {
        const packedWI = ev.u0;
        const iter = packedWI & 0xffff;
        const packedRcErrs = ev.u1;
        const rc = (packedRcErrs >>> 16) << 16 >> 16;
        const errs = packedRcErrs & 0xffff;
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          activeBlock: ev.a,
          activeRow: ev.b,
          sourceBlock: ev.a - 1,
          sourceCol: ev.b,
          sourceLocked,
          windowStart,
          windowEnd,
          outputBlock,
          phase: `Row ${ev.b + 1} complete in B${ev.a}`,
          narrative: rc === 0
            ? `Row ${ev.b + 1} of B${ev.a} decoded successfully${errs >= 0 ? ` with ${errs} error${errs === 1 ? "" : "s"} located.` : "."}`
            : `Row ${ev.b + 1} of B${ev.a} could not be corrected in this iteration.`,
          decodeMeta: { iter: iter + 1, changes: ev.u2 }
        }));
        break;
      }
      case TRACE.DECODE_ITER_END:
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          windowStart,
          windowEnd,
          outputBlock,
          phase: `Window ${ev.a + 1}, iteration ${ev.b + 1} complete`,
          narrative: `${ev.u0} row decodes failed and ${ev.u1} bit changes were applied in this iteration.`,
          decodeMeta: { iter: ev.b + 1 }
        }));
        break;
      case TRACE.WINDOW_LOCK:
        lockedBlocks[ev.b] = 1;
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          windowStart,
          windowEnd,
          outputBlock: ev.b,
          phase: `Block B${ev.b} locked`,
          narrative: `B${ev.b} is now output and locked. The decode window slides right for the next block.`
        }));
        break;
      case TRACE.DECODE_END:
        frames.push(makeFrame(bits, {
          visible,
          corrupted: corruptedMask,
          lockedBlocks,
          phase: ev.a === 0 ? "Decode complete" : "Decode finished with residual syndromes",
          narrative: ev.a === 0
            ? `The staircase validates after decoding. ${summary?.messageMatch ? "The recovered message matches the original input." : "The recovered message differs from the original input."}`
            : "The staircase decoder finished, but the final state did not validate cleanly."
        }));
        break;
      default:
        break;
    }
  }

  return frames;
}

function blockCellSize(blockSize, totalBlocks = 5) {
  if (totalBlocks >= 10) {
    if (blockSize <= 8) return 22;
    if (blockSize <= 16) return 15;
  }
  if (blockSize <= 8) return 28;
  if (blockSize <= 16) return 20;
  if (blockSize <= 24) return 14;
  return 10;
}

function renderScene(container, cfg, bits, frame, options = {}) {
  container.innerHTML = "";
  if (!cfg) return;

  const scroller = document.createElement("div");
  scroller.className = "staircase-scene";

  const cellSize = blockCellSize(cfg.blockSize, cfg.totalBlocks);
  const cellGap = 3;
  const blockPad = 6;
  const blockBorder = 2;
  const pairGap = Math.max(4, Math.round(cellSize * 0.18));
  const blockExtent = (cfg.blockSize * cellSize) + ((cfg.blockSize - 1) * cellGap) + (blockPad * 2) + blockBorder;
  const preview = !!options.preview;
  const rowCount = Math.ceil(cfg.totalBlocks / 2);
  scroller.style.gap = `${pairGap}px`;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const row = document.createElement("div");
    row.className = "stair-pair-row";
    row.style.gap = `${pairGap}px`;
    row.style.marginLeft = `${rowIndex * (blockExtent + pairGap)}px`;

    for (let slot = 0; slot < 2; slot++) {
      const block = rowIndex * 2 + slot;
      if (block >= cfg.totalBlocks) continue;

      const wrap = document.createElement("div");
      wrap.className = "stair-block-wrap";

      const orientation = orientationForBlock(block);
      const matrix = document.createElement("div");
      matrix.className = `stair-bit-block ${orientation}`;
      matrix.style.setProperty("--block-cols", String(cfg.blockSize));
      matrix.style.setProperty("--block-rows", String(cfg.blockSize));
      matrix.style.setProperty("--cell-size", `${cellSize}px`);
      if (preview) matrix.classList.add("preview");
      if (block > cfg.dataBlocks) matrix.classList.add("tail");
      if (frame?.activeBlock === block) matrix.classList.add("active");
      if (block === 0) matrix.classList.add("zero-block");
      if (frame?.lockedBlocks?.[block]) matrix.classList.add("locked");
      if (frame?.windowStart != null && block >= frame.windowStart && block <= frame.windowEnd) matrix.classList.add("window");
      if (frame?.outputBlock === block) matrix.classList.add("output");

      for (let visualRow = 0; visualRow < cfg.blockSize; visualRow++) {
        for (let visualCol = 0; visualCol < cfg.blockSize; visualCol++) {
          const actualRow = orientation === "horizontal" ? visualCol : visualRow;
          const actualCol = orientation === "horizontal" ? visualRow : visualCol;

          const cell = document.createElement("div");
          cell.className = "stair-bit";
          if (block === 0) {
            cell.classList.add("zero");
          } else if (actualCol < cfg.infoCols) {
            cell.classList.add("info");
          } else {
            cell.classList.add("parity");
          }
          if (block > cfg.dataBlocks) {
            cell.classList.add("tail-cell");
          }
          if (frame?.activeBlock === block && frame?.activeRow === actualRow) {
            cell.classList.add("active-row");
          }
          const sourceMatches = frame?.sourceBlock === block && (
            block === 0
              ? frame.sourceCol === actualCol
              : frame.sourceCol === actualCol
          );
          if (sourceMatches) {
            cell.classList.add("source-col");
          }
          if ((frame?.flashed || []).some((flash) => flash.block === block && flash.row === actualRow && flash.col === actualCol)) {
            cell.classList.add("flashed");
          }
          if (frame?.corrupted?.[blockBitIndex(cfg, block, actualRow, actualCol)]) {
            cell.classList.add("corrupted");
          }
          if (block !== 0) {
            if (orientation === "vertical" && actualCol === cfg.infoCols - 1) {
              cell.classList.add("boundary-vertical");
            }
            if (orientation === "horizontal" && actualCol === cfg.infoCols - 1) {
              cell.classList.add("boundary-horizontal");
            }
          }
          const idx = blockBitIndex(cfg, block, actualRow, actualCol);
          const isVisible = !frame?.visible || !!frame.visible[idx];
          if (!isVisible) {
            cell.classList.add("blank");
            cell.textContent = "";
          } else {
            cell.textContent = bits[idx] ? "1" : "0";
          }
          if (options.onToggle && block > 0) {
            cell.classList.add("injectable");
            cell.addEventListener("click", () => options.onToggle(block, actualRow, actualCol));
          }
          matrix.appendChild(cell);
        }
      }

      wrap.appendChild(matrix);

      const hasBlockUnder = slot === 1 && rowIndex < rowCount - 1;
      const labelStack = document.createElement("div");
      labelStack.className = `stair-block-label-stack ${hasBlockUnder ? "side" : "below"}`;

      const label = document.createElement("div");
      label.className = "stair-block-name";
      label.textContent = `B${block}`;
      labelStack.appendChild(label);

      if (block > cfg.dataBlocks) {
        const tailTag = document.createElement("div");
        tailTag.className = "stair-tail-tag";
        tailTag.textContent = "Tail block";
        labelStack.appendChild(tailTag);
      }

      wrap.appendChild(labelStack);
      row.appendChild(wrap);
    }

    scroller.appendChild(row);
  }

  container.appendChild(scroller);
}

function fillMetaStack(node, items) {
  node.innerHTML = "";
  for (const item of items) {
    const div = document.createElement("div");
    div.className = "meta";
    div.innerHTML = item;
    node.appendChild(div);
  }
}

function renderRowDetail(targetMeta, targetDetail, cfg, frame) {
  targetMeta.innerHTML = "";
  targetDetail.innerHTML = "";
  if (!cfg || !frame || frame.activeBlock == null || frame.activeRow == null) {
    targetMeta.innerHTML = '<div class="meta">No active row yet.</div>';
    return;
  }

  const meta = [
    `Current block: B${frame.activeBlock}`,
    `Row: ${frame.activeRow + 1} / ${cfg.blockSize}`,
    frame.sourceBlock === 0
      ? `Source row: ${frame.sourceCol + 1} from B0`
      : `Source column: ${frame.sourceCol + 1} from B${frame.sourceBlock}`,
    frame.isTail ? "Zero-input tail row" : "Payload row"
  ];
  if (frame.windowStart != null) {
    meta.push(`Window: B${frame.windowStart}..B${frame.windowEnd}`);
  }
  if (frame.sourceLocked) {
    meta.push("Source block already locked");
  }
  if (frame.decodeMeta?.iter) {
    meta.push(`Iteration ${frame.decodeMeta.iter}`);
  }
  fillMetaStack(targetMeta, meta);

  const makeSegment = (label, segmentBits, tone, shown = null) => {
    const seg = document.createElement("div");
    seg.className = `stair-segment ${tone}`;
    const head = document.createElement("div");
    head.className = "stair-segment-label";
    head.textContent = label;
    const strip = document.createElement("div");
    strip.className = "bit-strip";
    for (let i = 0; i < segmentBits.length; i++) {
      const chip = document.createElement("span");
      chip.className = `bit-chip ${tone}`;
      const isShown = !shown || !!shown[i];
      chip.textContent = isShown ? (segmentBits[i] ? "1" : "0") : "";
      if (!isShown) chip.classList.add("blank");
      strip.appendChild(chip);
    }
    seg.append(head, strip);
    return seg;
  };

  const sourceBits = [];
  const infoBits = [];
  const parityBits = [];
  const sourceShown = [];
  const infoShown = [];
  const parityShown = [];

  if (frame.sourceBlock === 0) {
    for (let c = 0; c < cfg.blockSize; c++) {
      const idx = blockBitIndex(cfg, frame.sourceBlock, frame.sourceCol, c);
      sourceBits.push(frame.bits[idx] & 1);
      sourceShown.push(frame.visible ? !!frame.visible[idx] : true);
    }
  } else {
    for (let r = 0; r < cfg.blockSize; r++) {
      const idx = blockBitIndex(cfg, frame.sourceBlock, r, frame.sourceCol);
      sourceBits.push(frame.bits[idx] & 1);
      sourceShown.push(frame.visible ? !!frame.visible[idx] : true);
    }
  }
  for (let c = 0; c < cfg.infoCols; c++) {
    const idx = blockBitIndex(cfg, frame.activeBlock, frame.activeRow, c);
    infoBits.push(frame.bits[idx] & 1);
    infoShown.push(frame.visible ? !!frame.visible[idx] : true);
  }
  for (let c = cfg.infoCols; c < cfg.blockSize; c++) {
    const idx = blockBitIndex(cfg, frame.activeBlock, frame.activeRow, c);
    parityBits.push(frame.bits[idx] & 1);
    parityShown.push(frame.visible ? !!frame.visible[idx] : true);
  }

  targetDetail.append(
    makeSegment(
      frame.sourceBlock === 0
        ? `B0 row ${frame.sourceCol + 1}`
        : `B${frame.sourceBlock} column ${frame.sourceCol + 1}`,
      sourceBits,
      "source",
      sourceShown
    ),
    makeSegment(`row info in B${frame.activeBlock}`, infoBits, "info", infoShown),
    makeSegment(`parity in B${frame.activeBlock}`, parityBits, "parity", parityShown)
  );
}

function renderInputPreview() {
  if (!state.cfg) return;
  const bits = buildInfoState(state.cfg, state.message || new Uint8Array(0));
  const visible = buildBaseVisible(state.cfg, state.message ? state.message.length : 0, false);
  renderScene(
    el.infoPreview,
    state.cfg,
    bits,
    makeFrame(bits, { visible }),
    { preview: true }
  );
}

function updateInputMeta() {
  if (!state.cfg) return;
  const current = state.message ? state.message.length : 0;
  el.msgMeta.textContent = `${current}/${state.cfg.msgBits} bits • ${state.cfg.dataBlocks} data blocks • ${state.cfg.infoCols} info cols per row`;
}

function updateErrorScene() {
  if (!state.cfg || !state.noisy) return;
  const count = state.corrupted ? state.corrupted.reduce((sum, bit) => sum + bit, 0) : 0;
  el.errMeta.textContent = `Stored blocks B1..B${state.cfg.totalBlocks - 1} are transmitted. Flip any stored cell before decoding.`;
  el.errCount.textContent = `${count} flipped bit${count === 1 ? "" : "s"}`;
  renderScene(el.errScene, state.cfg, state.noisy, makeFrame(state.noisy, {
    visible: buildAllVisible(state.cfg),
    corrupted: state.corrupted
  }), {
    onToggle(block, row, col) {
      const idx = blockBitIndex(state.cfg, block, row, col);
      if (block === 0) return;
      state.noisy[idx] ^= 1;
      state.corrupted[idx] = state.encoded && state.noisy[idx] !== state.encoded[idx] ? 1 : 0;
      updateErrorScene();
    }
  });
}

function setScreen(screen) {
  state.screen = screen;
  const unlock = {
    input: true,
    encode: state.maxUnlocked >= 1,
    errors: state.maxUnlocked >= 2,
    decode: state.maxUnlocked >= 3
  };
  for (const [name, node] of Object.entries(el.screens)) {
    node.classList.toggle("active", name === screen);
    el.stepButtons[name].classList.toggle("active", name === screen);
    el.stepButtons[name].disabled = !unlock[name];
  }
}

function stopPlayback(which) {
  const key = which === "decode" ? "decodeTimer" : "encodeTimer";
  if (state[key]) {
    clearTimeout(state[key]);
    state[key] = null;
  }
}

function playbackDelay(which) {
  const slider = which === "decode" ? el.decSpeed : el.encSpeed;
  const speed = Number(slider.value || 1);
  const baseDelay = Math.max(30, 280 - speed * 22);
  const scale = which === "decode" ? 0.5 : 0.25;
  return Math.max(30, Math.round(baseDelay * scale));
}

function renderEncodeFrame() {
  const frame = state.encodeFrames[state.encodeFrameIdx];
  if (!frame) return;
  renderScene(el.encodeScene, state.cfg, frame.bits, frame);
  renderRowDetail(el.rowMeta, el.rowDetail, state.cfg, frame);
  el.encMeta.textContent = `Frame ${state.encodeFrameIdx + 1}/${state.encodeFrames.length}`;
  el.encPhase.textContent = frame.phase || "Encoding trace";
  el.encNarrative.innerHTML = frame.narrative || "";
}

function renderDecodeFrame() {
  const frame = state.decodeFrames[state.decodeFrameIdx];
  if (!frame) return;
  renderScene(el.decodeScene, state.cfg, frame.bits, frame);
  renderRowDetail(el.decRowMeta, el.decRowDetail, state.cfg, frame);
  el.decMeta.textContent = `Frame ${state.decodeFrameIdx + 1}/${state.decodeFrames.length}`;
  el.decPhase.textContent = frame.phase || "Decode trace";
  el.decNarrative.innerHTML = frame.narrative || "";
}

function playFrames(which) {
  stopPlayback(which);
  const framesKey = which === "decode" ? "decodeFrames" : "encodeFrames";
  const idxKey = which === "decode" ? "decodeFrameIdx" : "encodeFrameIdx";
  const render = which === "decode" ? renderDecodeFrame : renderEncodeFrame;
  const timerKey = which === "decode" ? "decodeTimer" : "encodeTimer";
  const tick = () => {
    if (state[idxKey] >= state[framesKey].length - 1) {
      stopPlayback(which);
      return;
    }
    state[idxKey] += 1;
    render();
    state[timerKey] = setTimeout(tick, playbackDelay(which));
  };
  state[timerKey] = setTimeout(tick, playbackDelay(which));
}

function resetView(which) {
  stopPlayback(which);
  if (which === "decode") {
    state.decodeFrameIdx = 0;
    renderDecodeFrame();
  } else {
    state.encodeFrameIdx = 0;
    renderEncodeFrame();
  }
}

function updateCfgMeta() {
  if (!state.cfg) return;
  el.cfgMeta.textContent = `shortened BCH(${state.cfg.componentN},${state.cfg.componentK},${state.cfg.t}) • block ${state.cfg.blockSize}x${state.cfg.blockSize} • info cols ${state.cfg.infoCols} • total blocks ${state.cfg.totalBlocks}`;
}

function clampMessageInput() {
  if (!state.cfg) return;
  const clean = sanitizeBitsInput(el.msgBits.value).slice(0, state.cfg.msgBits);
  el.msgBits.value = clean;
  state.message = Uint8Array.from(clean, (ch) => (ch === "1" ? 1 : 0));
  updateInputMeta();
  renderInputPreview();
}

function resetWorkflow() {
  stopPlayback("encode");
  stopPlayback("decode");
  state.maxUnlocked = 0;
  state.encodeFrames = [];
  state.encodeFrameIdx = 0;
  state.decodeFrames = [];
  state.decodeFrameIdx = 0;
  state.encoded = null;
  state.noisy = null;
  state.corrupted = null;
  state.decodeResult = null;
  setScreen("input");
  renderInputPreview();
}

async function applyConfig() {
  if (!state.mod) return;
  setWarning("");

  const m = Number(el.m.value);
  const t = Number(el.t.value);
  const dataBlocks = Number(el.dataBlocks.value);
  const windowSize = Number(el.windowSize.value);
  const maxIters = Number(el.maxIters.value);
  const prim = parsePrim(el.prim.value);
  if (![m, t, dataBlocks, windowSize, maxIters, prim].every(Number.isInteger)) {
    setWarning("Enter valid BCH and staircase parameters first.");
    return;
  }

  const rc = state.mod._sw_init(m, prim, t, dataBlocks);
  if (rc !== 0) {
    setWarning("That staircase configuration is invalid. Staircase encoding needs a shortened-even BCH component with rate above 1/2.");
    return;
  }

  state.cfg = {
    m,
    t,
    prim,
    dataBlocks,
    windowSize,
    maxIters,
    componentN: state.mod._sw_get_component_n(),
    componentK: state.mod._sw_get_component_k(),
    componentDg: state.mod._sw_get_component_dg(),
    blockSize: state.mod._sw_get_block_size(),
    infoCols: state.mod._sw_get_info_cols(),
    parityCols: state.mod._sw_get_parity_cols(),
    totalBlocks: state.mod._sw_get_total_blocks(),
    msgBits: state.mod._sw_get_msg_bits(),
    stateBits: state.mod._sw_get_state_bits(),
    storedBits: state.mod._sw_get_stored_bits(),
    blockBits: state.mod._sw_get_block_size() ** 2
  };

  if (windowSize > state.cfg.totalBlocks - 1) {
    setWarning("Decode window is wider than the stored staircase chain. Reduce the window size.");
    return;
  }

  el.msgBits.maxLength = state.cfg.msgBits;
  el.msgBits.placeholder = `Enter exactly ${state.cfg.msgBits} bits`;
  state.message = new Uint8Array(0);
  el.msgBits.value = "";
  updateCfgMeta();
  updateInputMeta();
  resetWorkflow();
  setStatus(`Staircase ready: shortened BCH(${state.cfg.componentN},${state.cfg.componentK},${state.cfg.t}), ${state.cfg.dataBlocks} payload blocks, window ${state.cfg.windowSize}.`);
}

function syncPresetToForm(preset) {
  el.m.value = String(preset.m);
  el.t.value = String(preset.t);
  el.prim.value = preset.prim;
  el.dataBlocks.value = String(preset.dataBlocks);
  el.windowSize.value = String(preset.windowSize);
  el.maxIters.value = String(preset.maxIters);
}

async function startEncode() {
  if (!state.cfg || !state.mod) return;
  clampMessageInput();
  if (!state.message || state.message.length !== state.cfg.msgBits) {
    setWarning(`Enter exactly ${state.cfg.msgBits} bits before encoding.`);
    return;
  }

  const msgPtr = mallocU8(state.mod, state.message);
  const statePtr = mallocU8(state.mod, state.cfg.stateBits);
  try {
    const rc = state.mod._sw_encode_trace(msgPtr, state.cfg.msgBits, statePtr, state.cfg.stateBits);
    if (rc !== 0) {
      setWarning("Staircase encoding failed.");
      return;
    }

    state.encoded = readU8(state.mod, statePtr, state.cfg.stateBits);
    const valid = state.mod._sw_validate(statePtr, state.cfg.stateBits);
    if (valid !== 1) {
      setWarning("The generated staircase did not validate cleanly.");
      return;
    }

    const trace = traceEvents(state.mod);
    const preloaded = buildInfoState(state.cfg, state.message);
    state.encodeFrames = buildEncodeFrames(state.cfg, preloaded, trace);
    state.encodeFrameIdx = 0;
    state.noisy = new Uint8Array(state.encoded);
    state.corrupted = new Uint8Array(state.cfg.stateBits);
    state.maxUnlocked = 2;
    setScreen("encode");
    renderEncodeFrame();
    updateErrorScene();
    playFrames("encode");
  } finally {
    freeAll(state.mod, [msgPtr, statePtr]);
  }
}

function clearErrors() {
  if (!state.encoded || !state.cfg) return;
  state.noisy = new Uint8Array(state.encoded);
  state.corrupted = new Uint8Array(state.cfg.stateBits);
  updateErrorScene();
}

async function startDecode() {
  if (!state.cfg || !state.mod || !state.noisy) return;
  const statePtr = mallocU8(state.mod, state.noisy);
  const msgPtr = mallocU8(state.mod, state.cfg.msgBits);
  try {
    const rc = state.mod._sw_decode_trace(statePtr, state.cfg.stateBits, state.cfg.windowSize, state.cfg.maxIters);
    const decoded = readU8(state.mod, statePtr, state.cfg.stateBits);
    state.mod._sw_extract_message(statePtr, state.cfg.stateBits, msgPtr, state.cfg.msgBits);
    const decodedMsg = readU8(state.mod, msgPtr, state.cfg.msgBits);
    const stats = readDecodeStats(state.mod);
    const trace = traceEvents(state.mod);
    const noisySeed = new Uint8Array(state.noisy);
    const corrupted = new Uint8Array(state.corrupted);
    const messageMatch = state.message && decodedMsg.length === state.message.length && decodedMsg.every((bit, idx) => bit === state.message[idx]);
    state.decodeResult = { rc, decoded, decodedMsg, stats, messageMatch };
    state.decodeFrames = buildDecodeFrames(state.cfg, noisySeed, trace, corrupted, { messageMatch });
    state.decodeFrameIdx = 0;
    state.maxUnlocked = 3;
    setScreen("decode");
    renderDecodeFrame();
    playFrames("decode");
  } finally {
    freeAll(state.mod, [statePtr, msgPtr]);
  }
}

function bindEvents() {
  el.focusBtn.addEventListener("click", () => setFocusMode(!state.focusMode));
  el.preset.addEventListener("change", async () => {
    syncPresetToForm(PRESETS[Number(el.preset.value)]);
    await applyConfig();
  });
  el.advanced.addEventListener("change", () => {
    syncAdvancedState();
  });
  el.applyCfg.addEventListener("click", applyConfig);
  el.msgBits.addEventListener("input", clampMessageInput);
  el.startEncode.addEventListener("click", startEncode);

  el.errClear.addEventListener("click", clearErrors);
  el.startDecode.addEventListener("click", startDecode);

  el.encPlay.addEventListener("click", () => playFrames("encode"));
  el.encPause.addEventListener("click", () => stopPlayback("encode"));
  el.encStep.addEventListener("click", () => {
    stopPlayback("encode");
    if (state.encodeFrameIdx < state.encodeFrames.length - 1) {
      state.encodeFrameIdx += 1;
      renderEncodeFrame();
    }
  });
  el.encBack.addEventListener("click", () => {
    stopPlayback("encode");
    if (state.encodeFrameIdx > 0) {
      state.encodeFrameIdx -= 1;
      renderEncodeFrame();
    }
  });
  el.encReset.addEventListener("click", () => resetView("encode"));

  el.decPlay.addEventListener("click", () => playFrames("decode"));
  el.decPause.addEventListener("click", () => stopPlayback("decode"));
  el.decStep.addEventListener("click", () => {
    stopPlayback("decode");
    if (state.decodeFrameIdx < state.decodeFrames.length - 1) {
      state.decodeFrameIdx += 1;
      renderDecodeFrame();
    }
  });
  el.decBack.addEventListener("click", () => {
    stopPlayback("decode");
    if (state.decodeFrameIdx > 0) {
      state.decodeFrameIdx -= 1;
      renderDecodeFrame();
    }
  });
  el.decReset.addEventListener("click", () => resetView("decode"));

  for (const [name, button] of Object.entries(el.stepButtons)) {
    button.addEventListener("click", () => {
      if (!button.disabled) {
        setScreen(name);
        if (name === "encode") renderEncodeFrame();
        if (name === "errors") updateErrorScene();
        if (name === "decode") renderDecodeFrame();
      }
    });
  }
}

async function loadModule() {
  const wasmMod = await import(`./assets/staircase.js${BUILD_QUERY}`);
  const factory = wasmMod.default || wasmMod.StaircaseModule;
  return factory({
    print() {},
    printErr() {}
  });
}

async function init() {
  try {
    PRESETS.forEach((preset, index) => {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = preset.name;
      el.preset.appendChild(opt);
    });
    syncPresetToForm(PRESETS[0]);
    bindEvents();
    setFocusMode(true);
    syncAdvancedState();

    state.mod = await loadModule();
    await applyConfig();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load staircase-code assets.");
    setWarning("Build assets first with `make site-build` so site/assets/staircase.js and staircase.wasm exist.");
  }
}

init();
