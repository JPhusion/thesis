const PRESETS = [
  {
    name: "PC[BCH(7,4,1) x BCH(7,4,1)]",
    row: { m: 3, t: 1, prim: "0b1011" },
    col: { m: 3, t: 1, prim: "0b1011" },
    maxIters: 3
  },
  {
    name: "PC[BCH(15,7,2) x BCH(7,4,1)]",
    row: { m: 4, t: 2, prim: "0b10011" },
    col: { m: 3, t: 1, prim: "0b1011" },
    maxIters: 3
  },
  {
    name: "PC[BCH(15,7,2) x BCH(15,7,2)]",
    row: { m: 4, t: 2, prim: "0b10011" },
    col: { m: 4, t: 2, prim: "0b10011" },
    maxIters: 4
  },
  {
    name: "PC[BCH(255,231,3) x BCH(7,4,1)]",
    row: { m: 8, t: 3, prim: "0x11d" },
    col: { m: 3, t: 1, prim: "0b1011" },
    maxIters: 4
  },
  {
    name: "PC[BCH(511,484,3) x BCH(7,4,1)]",
    row: { m: 9, t: 3, prim: "0x211" },
    col: { m: 3, t: 1, prim: "0b1011" },
    maxIters: 4
  }
];

const BUILD_QUERY = new URL(import.meta.url).search;
const MAX_ANIM_SPEED = 10;
const DEFAULT_ANIM_SPEED = MAX_ANIM_SPEED;

const TRACE = {
  STAGE_ENCODE_BEGIN: 1,
  INFO_BIT: 10,
  ROW_BEGIN: 20,
  ROW_WRITE: 21,
  ROW_END: 22,
  COL_BEGIN: 30,
  COL_WRITE: 31,
  COL_END: 32,
  STAGE_ENCODE_END: 40,

  STAGE_DECODE_BEGIN: 100,
  ITER_BEGIN: 110,
  ROW_PASS_BEGIN: 120,
  ROW_PASS_FLIP: 121,
  ROW_PASS_END: 122,
  COL_PASS_BEGIN: 130,
  COL_PASS_FLIP: 131,
  COL_PASS_END: 132,
  ITER_END: 140,
  STAGE_DECODE_END: 150
};

const SCREENS = ["input", "encode", "channel", "decode"];

const el = {
  status: document.getElementById("productStatus"),
  warning: document.getElementById("productWarning"),
  focusBtn: document.getElementById("productFocusBtn"),
  configPanel: document.querySelector(".product-config-panel"),

  preset: document.getElementById("productPreset"),
  advanced: document.getElementById("productAdvanced"),
  maxIters: document.getElementById("productMaxIters"),
  rowM: document.getElementById("rowM"),
  rowT: document.getElementById("rowT"),
  rowPrim: document.getElementById("rowPrim"),
  colM: document.getElementById("colM"),
  colT: document.getElementById("colT"),
  colPrim: document.getElementById("colPrim"),
  applyCfg: document.getElementById("applyProductCfg"),
  cfgMeta: document.getElementById("productCfgMeta"),

  stepButtons: {
    input: document.getElementById("productStepInput"),
    encode: document.getElementById("productStepEncode"),
    channel: document.getElementById("productStepChannel"),
    decode: document.getElementById("productStepDecode")
  },
  screens: {
    input: document.getElementById("product-screen-input"),
    encode: document.getElementById("product-screen-encode"),
    channel: document.getElementById("product-screen-channel"),
    decode: document.getElementById("product-screen-decode")
  },

  msgBits: document.getElementById("productMsgBits"),
  msgMeta: document.getElementById("productMsgMeta"),
  infoPreview: document.getElementById("productInfoPreview"),
  startEncode: document.getElementById("productStartEncode"),

  encSpeed: document.getElementById("productEncSpeed"),
  encBack: document.getElementById("productEncBack"),
  encPlay: document.getElementById("productEncPlay"),
  encPause: document.getElementById("productEncPause"),
  encStep: document.getElementById("productEncStep"),
  encReset: document.getElementById("productEncReset"),
  encMeta: document.getElementById("productEncMeta"),
  encPhase: document.getElementById("productEncPhase"),
  encMatrix: document.getElementById("productEncMatrix"),
  encNarrative: document.getElementById("productEncNarrative"),
  toChannel: document.getElementById("productToChannel"),

  channelMatrix: document.getElementById("productChannelMatrix"),
  channelMeta: document.getElementById("productChannelMeta"),
  maskMatrix: document.getElementById("productMaskMatrix"),
  maskBits: document.getElementById("productMaskBits"),
  maskMeta: document.getElementById("productMaskMeta"),
  clearErrors: document.getElementById("productClearErrors"),
  runDecode: document.getElementById("productRunDecode"),
  errorMeta: document.getElementById("productErrorMeta"),

  decSpeed: document.getElementById("productDecSpeed"),
  decBack: document.getElementById("productDecBack"),
  decPlay: document.getElementById("productDecPlay"),
  decPause: document.getElementById("productDecPause"),
  decStep: document.getElementById("productDecStep"),
  decReset: document.getElementById("productDecReset"),
  decMeta: document.getElementById("productDecMeta"),
  decodeStage: document.getElementById("productDecodeStage"),
  decodeMatrix: document.getElementById("productDecodeMatrix"),
  iterState: document.getElementById("productIterState"),
  passSummary: document.getElementById("productPassSummary"),
  decodedMsg: document.getElementById("productDecodedMsg"),
  decodeResult: document.getElementById("productDecodeResult"),
  decNarrative: document.getElementById("productDecNarrative")
};

const state = {
  mod: null,
  cfg: null,
  screen: "input",
  maxUnlocked: 0,
  focusMode: true,

  message: null,
  cw: null,
  errorMask: null,
  rx: null,
  corrected: null,
  decodeStats: null,

  encodeFrames: [],
  encodeIdx: 0,
  encTimer: null,

  decodeFrames: [],
  decodeIdx: 0,
  decTimer: null
};

function setStatus(msg) {
  el.status.textContent = msg;
}

function setFocusMode(enabled) {
  state.focusMode = !!enabled;
  if (el.configPanel) {
    el.configPanel.classList.toggle("collapsed", state.focusMode);
  }
  if (el.focusBtn) {
    el.focusBtn.textContent = state.focusMode ? "Show Configuration" : "Hide Configuration";
  }
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

function toSigned32(value) {
  return value | 0;
}

function sanitizeBitsInput(raw) {
  return raw.replace(/[^01]/g, "");
}

function idx(cols, row, col) {
  return row * cols + col;
}

function internalRowToDisplay(row) {
  return state.cfg ? (state.cfg.codeRows - 1 - row) : row;
}

function internalColToDisplay(col) {
  return state.cfg ? (state.cfg.codeCols - 1 - col) : col;
}

function displayIndexToInternal(displayIndex) {
  const displayRow = Math.floor(displayIndex / state.cfg.codeCols);
  const displayCol = displayIndex % state.cfg.codeCols;
  const internalRow = state.cfg.codeRows - 1 - displayRow;
  const internalCol = state.cfg.codeCols - 1 - displayCol;
  return idx(state.cfg.codeCols, internalRow, internalCol);
}

function internalIndexToDisplay(internalIndex) {
  const internalRow = Math.floor(internalIndex / state.cfg.codeCols);
  const internalCol = internalIndex % state.cfg.codeCols;
  return idx(state.cfg.codeCols, internalRowToDisplay(internalRow), internalColToDisplay(internalCol));
}

function toDisplayOrder(values) {
  if (!state.cfg) {
    return Array.from(values);
  }
  const out = new Array(state.cfg.cwBits).fill(null);
  for (let i = 0; i < values.length; i++) {
    out[internalIndexToDisplay(i)] = values[i];
  }
  return out;
}

function toDisplayIndices(indices) {
  return (indices || []).map((index) => internalIndexToDisplay(index));
}

function messageWarning(cfg) {
  if (!cfg) return "";
  if (cfg.cwBits > 3000) {
    return "Warning: this is a very large product-code matrix for the full visualizer. The BCH component math is exact, but the animation will be much denser than the smaller presets.";
  }
  if (cfg.cwBits > 400) {
    return "Warning: this matrix is large. Visual playback stays exact, but browser animation will be denser.";
  }
  if (cfg.cwBits > 225) {
    return "Warning: larger matrices can make the animation busy. The decoder still uses the exact C implementation.";
  }
  return "";
}

function speedToDelay(value) {
  const speed = Number(value);
  return Math.max(40, 590 - speed * 50);
}

function decodeSpeedToDelay(value) {
  return Math.round(speedToDelay(value) / 0.75);
}

function resetTimer(which) {
  const key = which === "encode" ? "encTimer" : "decTimer";
  if (state[key]) {
    window.clearTimeout(state[key]);
    state[key] = null;
  }
}

function setScreen(name) {
  state.screen = name;
  const activeIdx = SCREENS.indexOf(name);
  for (const screenName of SCREENS) {
    const active = screenName === name;
    el.screens[screenName].classList.toggle("active", active);
    el.stepButtons[screenName].classList.toggle("active", active);
  }
  for (let i = 0; i < SCREENS.length; i++) {
    const unlocked = i <= state.maxUnlocked;
    el.stepButtons[SCREENS[i]].disabled = !unlocked;
  }
  if (activeIdx > state.maxUnlocked) {
    state.maxUnlocked = activeIdx;
  }
}

function resetDownstream(fromScreen) {
  const fromIdx = SCREENS.indexOf(fromScreen);
  if (fromIdx < 1) {
    state.encodeFrames = [];
    state.encodeIdx = 0;
    state.cw = null;
  }
  if (fromIdx < 2) {
    state.errorMask = state.cfg ? new Uint8Array(state.cfg.cwBits) : null;
    state.rx = null;
  }
  if (fromIdx < 3) {
    state.decodeFrames = [];
    state.decodeIdx = 0;
    state.corrected = null;
    state.decodeStats = null;
  }
  state.maxUnlocked = fromIdx;
  setScreen(SCREENS[Math.max(0, fromIdx)]);
}

function toggleAdvancedFields() {
  const adv = el.advanced.checked;
  el.rowM.disabled = !adv;
  el.rowT.disabled = !adv;
  el.rowPrim.disabled = !adv;
  el.colM.disabled = !adv;
  el.colT.disabled = !adv;
  el.colPrim.disabled = !adv;
  el.maxIters.disabled = !adv;
}

function applyPresetFields() {
  const preset = PRESETS[el.preset.selectedIndex];
  if (!preset || el.advanced.checked) return;
  el.rowM.value = String(preset.row.m);
  el.rowT.value = String(preset.row.t);
  el.rowPrim.value = preset.row.prim;
  el.colM.value = String(preset.col.m);
  el.colT.value = String(preset.col.t);
  el.colPrim.value = preset.col.prim;
  el.maxIters.value = String(preset.maxIters);
}

function initPresetUi() {
  el.preset.innerHTML = PRESETS.map((preset) => `<option>${preset.name}</option>`).join("");
  el.preset.value = PRESETS[0].name;
  el.encSpeed.value = String(DEFAULT_ANIM_SPEED);
  el.decSpeed.value = String(DEFAULT_ANIM_SPEED);
  applyPresetFields();
  toggleAdvancedFields();
}

function ensureModuleReady() {
  if (!state.mod) {
    throw new Error("Product WASM module not loaded yet.");
  }
}

function cloneFrameMatrix(values) {
  return values.map((value) => (value == null ? null : Number(value)));
}

function buildMetaRows(entries) {
  return entries.map((entry) => `
    <div class="meta-row">
      <span>${entry.label}</span>
      <strong>${entry.value}</strong>
    </div>
  `).join("");
}

function renderMatrix(container, values, rows, cols, options = {}) {
  if (!container) return;
  const activeRow = options.activeRow ?? null;
  const activeCol = options.activeCol ?? null;
  const changed = new Set(options.changed || []);
  const clickable = Boolean(options.onCellClick);
  container.classList.toggle("clickable-matrix", clickable);
  container.style.setProperty("--matrix-cols", String(cols));

  const html = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = idx(cols, r, c);
      const value = values[index];
      const classes = ["matrix-cell"];
      if (options.cfg) {
        if (r < options.cfg.infoRows && c < options.cfg.infoCols) classes.push("info-region");
        else if (r < options.cfg.infoRows) classes.push("row-parity-region");
        else classes.push("col-parity-region");
      }
      if (value == null) classes.push("empty-cell");
      if (activeRow === r) classes.push("active-row");
      if (activeCol === c) classes.push("active-col");
      if (changed.has(index)) classes.push("corrected-cell");
      if (options.maskValues && options.maskValues[index]) classes.push("mask-on");
      if (options.reference && value != null && options.reference[index] != null && value !== options.reference[index]) classes.push("error-cell");
      const tag = clickable ? "button" : "div";
      const attrs = clickable ? `type="button" data-index="${index}"` : "";
      html.push(`<${tag} class="${classes.join(" ")}" ${attrs}><span>${value == null ? "·" : value}</span></${tag}>`);
    }
  }
  container.innerHTML = html.join("");

  if (clickable && typeof options.onCellClick === "function") {
    container.querySelectorAll("button[data-index]").forEach((button) => {
      button.addEventListener("click", () => {
        options.onCellClick(Number(button.dataset.index));
      });
    });
  }
}

function renderInfoPreview() {
  if (!state.cfg) {
    el.msgMeta.textContent = "Apply a config first.";
    el.infoPreview.innerHTML = "";
    return;
  }
  const bits = sanitizeBitsInput(el.msgBits.value).slice(0, state.cfg.msgBits);
  const values = new Array(state.cfg.msgBits).fill(null);
  for (let i = 0; i < bits.length; i++) {
    values[i] = bits[i] === "1" ? 1 : 0;
  }
  el.msgMeta.textContent = `${bits.length}/${state.cfg.msgBits} bits  •  ${state.cfg.infoRows}x${state.cfg.infoCols} row-major information block`;
  renderMatrix(el.infoPreview, values, state.cfg.infoRows, state.cfg.infoCols, {});
}

function parseFullMessage() {
  if (!state.cfg) {
    throw new Error("Apply a product-code config first.");
  }
  const bits = sanitizeBitsInput(el.msgBits.value);
  if (bits.length !== state.cfg.msgBits) {
    throw new Error(`Expected exactly ${state.cfg.msgBits} message bits for the ${state.cfg.infoRows}x${state.cfg.infoCols} information block.`);
  }
  return Uint8Array.from(bits, (ch) => (ch === "1" ? 1 : 0));
}

function readTraceEvents() {
  const ptr = state.mod._pw_trace_ptr();
  const len = state.mod._pw_trace_len();
  const strideInts = state.mod._pw_trace_stride() >> 2;
  const base = ptr >> 2;
  const events = [];
  for (let i = 0; i < len; i++) {
    const off = base + i * strideInts;
    events.push({
      kind: state.mod.HEAPU32[off],
      a: state.mod.HEAP32[off + 1],
      b: state.mod.HEAP32[off + 2],
      u0: state.mod.HEAPU32[off + 3],
      u1: state.mod.HEAPU32[off + 4],
      u2: state.mod.HEAPU32[off + 5]
    });
  }
  return events;
}

function pushEncodeFrame(frames, matrix, payload) {
  frames.push({
    matrix: cloneFrameMatrix(matrix),
    activeRow: payload.activeRow ?? null,
    activeCol: payload.activeCol ?? null,
    changed: payload.changed ?? [],
    narrative: payload.narrative,
    phase: payload.phase,
    meta: payload.meta
  });
}

function buildEncodeFrames(events) {
  const frames = [];
  const matrix = new Array(state.cfg.cwBits).fill(null);

  if (state.message) {
    for (let r = 0; r < state.cfg.infoRows; r++) {
      for (let c = 0; c < state.cfg.infoCols; c++) {
        const internalRow = state.cfg.colDg + r;
        const internalCol = state.cfg.rowDg + c;
        matrix[idx(state.cfg.codeCols, internalRow, internalCol)] = state.message[idx(state.cfg.infoCols, r, c)] & 1;
      }
    }
  }

  pushEncodeFrame(frames, matrix, {
    narrative: "The information block is already placed in the top-left of the displayed matrix. Row encoding will now append parity on the right, then column encoding will append parity underneath.",
    phase: "Information block loaded",
    meta: "Frame 0"
  });

  for (const ev of events) {
    switch (ev.kind) {
      case TRACE.INFO_BIT:
        break;
      case TRACE.ROW_BEGIN: {
        const row = internalRowToDisplay(state.cfg.colDg + ev.a);
        pushEncodeFrame(frames, matrix, {
          activeRow: row,
          narrative: `Encoding row ${row}. The message bits are already fixed in place, so this pass only needs to append the row parity cells on the right.`,
          phase: "Row encoding",
          meta: `Row ${row} begin`
        });
        break;
      }
      case TRACE.ROW_WRITE: {
        const internalRow = state.cfg.colDg + ev.a;
        const internalCol = ev.b;
        if (internalCol >= state.cfg.rowDg) {
          break;
        }
        const index = idx(state.cfg.codeCols, internalRow, internalCol);
        const row = internalRowToDisplay(internalRow);
        const col = internalColToDisplay(internalCol);
        matrix[index] = ev.u0 & 1;
        pushEncodeFrame(frames, matrix, {
          activeRow: row,
          changed: [internalIndexToDisplay(index)],
          narrative: `Row ${row} parity cell (${row}, ${col}) was written on the right side of the message block.`,
          phase: "Row encoding",
          meta: `Row ${row}, col ${col}`
        });
        break;
      }
      case TRACE.COL_BEGIN: {
        const col = internalColToDisplay(ev.a);
        pushEncodeFrame(frames, matrix, {
          activeCol: col,
          narrative: `Encoding column ${col}. The column BCH component now adds the vertical parity rows.`,
          phase: "Column encoding",
          meta: `Column ${col} begin`
        });
        break;
      }
      case TRACE.COL_WRITE: {
        const internalRow = ev.a;
        const internalCol = ev.b;
        if (internalRow >= state.cfg.colDg) {
          break;
        }
        const index = idx(state.cfg.codeCols, internalRow, internalCol);
        const row = internalRowToDisplay(internalRow);
        const col = internalColToDisplay(internalCol);
        matrix[index] = ev.u0 & 1;
        pushEncodeFrame(frames, matrix, {
          activeCol: col,
          changed: [internalIndexToDisplay(index)],
          narrative: `Column ${col} parity cell (${row}, ${col}) was written underneath the already encoded upper block.`,
          phase: "Column encoding",
          meta: `Column ${col}, row ${row}`
        });
        break;
      }
      case TRACE.STAGE_ENCODE_END: {
        pushEncodeFrame(frames, matrix, {
          narrative: "Product-code construction complete. The full transmitted matrix is now ready for channel errors.",
          phase: "Encode complete",
          meta: "Final matrix"
        });
        break;
      }
      default:
        break;
    }
  }

  return frames;
}

function pushDecodeFrame(frames, matrix, payload) {
  frames.push({
    matrix: cloneFrameMatrix(matrix),
    activeRow: payload.activeRow ?? null,
    activeCol: payload.activeCol ?? null,
    changed: payload.changed ?? [],
    iteration: payload.iteration ?? null,
    phase: payload.phase,
    detail: payload.detail,
    narrative: payload.narrative
  });
}

function buildDecodeFrames(events, rxStart) {
  const frames = [];
  const matrix = Array.from(rxStart);
  pushDecodeFrame(frames, matrix, {
    phase: "Received matrix",
    detail: "Injected channel errors are shown in red.",
    narrative: "The decoder starts from the received matrix and alternates full row and full column passes."
  });

  for (const ev of events) {
    switch (ev.kind) {
      case TRACE.ITER_BEGIN:
        pushDecodeFrame(frames, matrix, {
          iteration: ev.a + 1,
          phase: "Iteration begin",
          detail: `Iteration ${ev.a + 1} begins.` ,
          narrative: `Starting iteration ${ev.a + 1} of the fixed row-then-column decoding schedule.`
        });
        break;
      case TRACE.ROW_PASS_BEGIN:
        pushDecodeFrame(frames, matrix, {
          iteration: ev.a + 1,
          activeRow: internalRowToDisplay(ev.b),
          phase: "Row pass",
          detail: `Checking row ${internalRowToDisplay(ev.b)}.`,
          narrative: `Row decoder is running on row ${internalRowToDisplay(ev.b)}. If it corrects cells, they flip immediately in the matrix.`
        });
        break;
      case TRACE.ROW_PASS_FLIP: {
        const row = internalRowToDisplay(ev.a);
        const col = internalColToDisplay(ev.b);
        const iteration = ev.u0 + 1;
        const after = ev.u2 & 1;
        const index = idx(state.cfg.codeCols, ev.a, ev.b);
        matrix[index] = after;
        pushDecodeFrame(frames, matrix, {
          iteration,
          activeRow: row,
          changed: [internalIndexToDisplay(index)],
          phase: "Row correction",
          detail: `Row ${row} corrected cell (${row}, ${col}).`,
          narrative: `The row BCH decoder flipped cell (${row}, ${col}) during iteration ${iteration}.`
        });
        break;
      }
      case TRACE.ROW_PASS_END: {
        const iteration = ev.a + 1;
        const row = internalRowToDisplay(ev.b);
        const rc = toSigned32(ev.u0);
        const errs = toSigned32(ev.u1);
        const changes = toSigned32(ev.u2);
        pushDecodeFrame(frames, matrix, {
          iteration,
          activeRow: row,
          phase: "Row result",
          detail: rc === 0
            ? `Row ${row} decode succeeded. reported_errs=${errs}, changed_cells=${changes}.`
            : `Row ${row} decode failed. The row was left unchanged for this pass.`,
          narrative: rc === 0
            ? `Row ${row} finished successfully.`
            : `Row ${row} could not be corrected by the row BCH component in this pass.`
        });
        break;
      }
      case TRACE.COL_PASS_BEGIN:
        pushDecodeFrame(frames, matrix, {
          iteration: ev.a + 1,
          activeCol: internalColToDisplay(ev.b),
          phase: "Column pass",
          detail: `Checking column ${internalColToDisplay(ev.b)}.`,
          narrative: `Column decoder is now running on column ${internalColToDisplay(ev.b)}.`
        });
        break;
      case TRACE.COL_PASS_FLIP: {
        const row = internalRowToDisplay(ev.a);
        const col = internalColToDisplay(ev.b);
        const iteration = ev.u0 + 1;
        const after = ev.u2 & 1;
        const index = idx(state.cfg.codeCols, ev.a, ev.b);
        matrix[index] = after;
        pushDecodeFrame(frames, matrix, {
          iteration,
          activeCol: col,
          changed: [internalIndexToDisplay(index)],
          phase: "Column correction",
          detail: `Column ${col} corrected cell (${row}, ${col}).`,
          narrative: `The column BCH decoder flipped cell (${row}, ${col}) during iteration ${iteration}.`
        });
        break;
      }
      case TRACE.COL_PASS_END: {
        const iteration = ev.a + 1;
        const col = internalColToDisplay(ev.b);
        const rc = toSigned32(ev.u0);
        const errs = toSigned32(ev.u1);
        const changes = toSigned32(ev.u2);
        pushDecodeFrame(frames, matrix, {
          iteration,
          activeCol: col,
          phase: "Column result",
          detail: rc === 0
            ? `Column ${col} decode succeeded. reported_errs=${errs}, changed_cells=${changes}.`
            : `Column ${col} decode failed. The column was left unchanged for this pass.`,
          narrative: rc === 0
            ? `Column ${col} finished successfully.`
            : `Column ${col} could not be corrected by the column BCH component in this pass.`
        });
        break;
      }
      case TRACE.ITER_END:
        pushDecodeFrame(frames, matrix, {
          iteration: ev.a + 1,
          phase: "Iteration summary",
          detail: `row_failures=${ev.b}, col_failures=${ev.u0}, row_changes=${ev.u1}, col_changes=${ev.u2}`,
          narrative: `Iteration ${ev.a + 1} complete. The decoder now advances to the next scheduled row/column cycle.`
        });
        break;
      case TRACE.STAGE_DECODE_END: {
        const rc = toSigned32(ev.a);
        pushDecodeFrame(frames, matrix, {
          phase: "Decode complete",
          detail: rc === 0
            ? `All rows and columns validate after the fixed iteration budget.`
            : `The matrix is still invalid after the fixed iteration budget.`,
          narrative: rc === 0
            ? `Iterative decoding finished with a valid product-code matrix.`
            : `Iterative decoding stopped after the configured number of iterations without reaching a fully valid matrix.`
        });
        break;
      }
      default:
        break;
    }
  }

  return frames;
}

function applyConfig() {
  ensureModuleReady();
  const rowM = Number.parseInt(el.rowM.value, 10);
  const rowT = Number.parseInt(el.rowT.value, 10);
  const colM = Number.parseInt(el.colM.value, 10);
  const colT = Number.parseInt(el.colT.value, 10);
  const rowPrim = parsePrim(el.rowPrim.value);
  const colPrim = parsePrim(el.colPrim.value);
  const maxIters = Number.parseInt(el.maxIters.value, 10);

  if (![rowM, rowT, colM, colT, rowPrim, colPrim, maxIters].every(Number.isInteger)) {
    throw new Error("Invalid product-code configuration values.");
  }

  const rc = state.mod._pw_init(rowM, rowPrim >>> 0, rowT, colM, colPrim >>> 0, colT);
  if (rc !== 0) {
    throw new Error("pw_init failed. Check the row/column BCH parameters and primitive polynomials.");
  }

  state.cfg = {
    rowM,
    rowT,
    rowPrim: rowPrim >>> 0,
    rowN: state.mod._pw_get_row_n(),
    rowK: state.mod._pw_get_row_k(),
    rowDg: state.mod._pw_get_row_dg(),
    colM,
    colT,
    colPrim: colPrim >>> 0,
    colN: state.mod._pw_get_col_n(),
    colK: state.mod._pw_get_col_k(),
    colDg: state.mod._pw_get_col_dg(),
    infoRows: state.mod._pw_get_info_rows(),
    infoCols: state.mod._pw_get_info_cols(),
    codeRows: state.mod._pw_get_code_rows(),
    codeCols: state.mod._pw_get_code_cols(),
    msgBits: state.mod._pw_get_msg_bits(),
    cwBits: state.mod._pw_get_cw_bits(),
    maxIters
  };

  const currentBits = sanitizeBitsInput(el.msgBits.value);
  if (currentBits.length !== state.cfg.msgBits) {
    el.msgBits.value = "0".repeat(state.cfg.msgBits);
  } else {
    el.msgBits.value = currentBits;
  }
  el.msgBits.maxLength = state.cfg.msgBits;
  el.msgBits.placeholder = `Enter exactly ${state.cfg.msgBits} bits`;

  el.cfgMeta.textContent = `${state.cfg.infoRows}x${state.cfg.infoCols} info  •  ${state.cfg.codeRows}x${state.cfg.codeCols} code  •  row BCH(${state.cfg.rowN},${state.cfg.rowK},${state.cfg.rowT})  •  col BCH(${state.cfg.colN},${state.cfg.colK},${state.cfg.colT})`;
  setWarning(messageWarning(state.cfg));
  renderInfoPreview();
  state.message = null;
  state.cw = null;
  state.errorMask = new Uint8Array(state.cfg.cwBits);
  state.rx = null;
  state.corrected = null;
  state.decodeStats = null;
  state.encodeFrames = [];
  state.decodeFrames = [];
  state.maxUnlocked = 0;
  setScreen("input");
  setStatus("Product-code config ready.");
}

function renderEncodeFrame() {
  if (!state.encodeFrames.length) return;
  const frame = state.encodeFrames[state.encodeIdx];
  el.encMeta.textContent = `Frame ${state.encodeIdx + 1}/${state.encodeFrames.length}`;
  el.encPhase.textContent = frame.phase;
  el.encNarrative.textContent = frame.narrative;
  renderMatrix(el.encMatrix, toDisplayOrder(frame.matrix), state.cfg.codeRows, state.cfg.codeCols, {
    cfg: state.cfg,
    activeRow: frame.activeRow,
    activeCol: frame.activeCol,
    changed: frame.changed
  });
}

function renderChannel() {
  if (!state.cfg || !state.cw) return;
  const rx = new Uint8Array(state.cw);
  for (let i = 0; i < rx.length; i++) {
    if (state.errorMask[i]) {
      rx[i] ^= 1;
    }
  }
  state.rx = rx;
  el.channelMeta.textContent = `${state.cfg.codeRows}x${state.cfg.codeCols} encoded matrix`;
  renderMatrix(el.channelMatrix, toDisplayOrder(Array.from(rx)), state.cfg.codeRows, state.cfg.codeCols, {
    cfg: state.cfg,
    reference: toDisplayOrder(state.cw),
    onCellClick: (displayIndex) => {
      state.errorMask[displayIndexToInternal(displayIndex)] ^= 1;
      renderChannel();
    }
  });
  const displayMask = toDisplayOrder(Array.from(state.errorMask));
  renderMatrix(el.maskMatrix, displayMask, state.cfg.codeRows, state.cfg.codeCols, {
    maskValues: displayMask
  });
  el.maskBits.textContent = displayMask.join("") || "-";
  const positions = [];
  for (let i = 0; i < displayMask.length; i++) {
    if (displayMask[i]) positions.push(i);
  }
  el.errorMeta.textContent = positions.length
    ? `${positions.length} flipped cells at displayed row-major indices {${positions.join(", ")}}`
    : "No injected errors.";
}

function extractMessageFromMatrix(matrix) {
  const out = new Uint8Array(state.cfg.msgBits);
  let cursor = 0;
  for (let r = 0; r < state.cfg.infoRows; r++) {
    for (let c = 0; c < state.cfg.infoCols; c++) {
      out[cursor++] = matrix[idx(state.cfg.codeCols, state.cfg.colDg + r, state.cfg.rowDg + c)] & 1;
    }
  }
  return out;
}

function formatMessageMatrix(bits) {
  const lines = [];
  for (let r = 0; r < state.cfg.infoRows; r++) {
    lines.push(Array.from(bits.slice(r * state.cfg.infoCols, (r + 1) * state.cfg.infoCols)).join(" "));
  }
  return lines.join("\n");
}

function renderDecodeOutcome(finalMatrix) {
  const decodedMsg = extractMessageFromMatrix(finalMatrix);
  el.decodedMsg.textContent = formatMessageMatrix(decodedMsg);
  const matches = state.message && decodedMsg.every((bit, index) => bit === state.message[index]);
  el.decodeResult.classList.remove("hidden", "success", "fail");
  el.decodeResult.classList.add(matches ? "success" : "fail");
  el.decodeResult.textContent = matches
    ? "Decoded message matches the original information matrix."
    : "Decoded matrix does not match the original information matrix.";
}

function renderDecodeFrame() {
  if (!state.decodeFrames.length) return;
  const frame = state.decodeFrames[state.decodeIdx];
  el.decMeta.textContent = `Frame ${state.decodeIdx + 1}/${state.decodeFrames.length}`;
  el.decodeStage.textContent = frame.phase;
  el.passSummary.textContent = frame.detail || "-";
  el.decNarrative.textContent = frame.narrative;
  el.iterState.innerHTML = buildMetaRows([
    { label: "Iteration", value: frame.iteration ?? "-" },
    { label: "Phase", value: frame.phase },
    { label: "Rows valid", value: state.decodeStats ? `${state.decodeStats.finalRowsValid}/${state.cfg.codeRows}` : "-" },
    { label: "Cols valid", value: state.decodeStats ? `${state.decodeStats.finalColsValid}/${state.cfg.codeCols}` : "-" }
  ]);
  renderMatrix(el.decodeMatrix, toDisplayOrder(frame.matrix), state.cfg.codeRows, state.cfg.codeCols, {
    cfg: state.cfg,
    reference: toDisplayOrder(state.cw),
    activeRow: frame.activeRow,
    activeCol: frame.activeCol,
    changed: frame.changed
  });
  if (state.decodeIdx === state.decodeFrames.length - 1) {
    renderDecodeOutcome(frame.matrix);
  } else {
    el.decodeResult.classList.add("hidden");
  }
}

function encodeStep(direction) {
  if (!state.encodeFrames.length) return;
  state.encodeIdx = Math.max(0, Math.min(state.encodeFrames.length - 1, state.encodeIdx + direction));
  renderEncodeFrame();
}

function decodeStep(direction) {
  if (!state.decodeFrames.length) return;
  state.decodeIdx = Math.max(0, Math.min(state.decodeFrames.length - 1, state.decodeIdx + direction));
  renderDecodeFrame();
}

function playEncode() {
  resetTimer("encode");
  const tick = () => {
    if (state.encodeIdx >= state.encodeFrames.length - 1) {
      resetTimer("encode");
      return;
    }
    state.encodeIdx += 1;
    renderEncodeFrame();
    state.encTimer = window.setTimeout(tick, speedToDelay(el.encSpeed.value));
  };
  state.encTimer = window.setTimeout(tick, speedToDelay(el.encSpeed.value));
}

function playDecode() {
  resetTimer("decode");
  const tick = () => {
    if (state.decodeIdx >= state.decodeFrames.length - 1) {
      resetTimer("decode");
      return;
    }
    state.decodeIdx += 1;
    renderDecodeFrame();
    state.decTimer = window.setTimeout(tick, decodeSpeedToDelay(el.decSpeed.value));
  };
  state.decTimer = window.setTimeout(tick, decodeSpeedToDelay(el.decSpeed.value));
}

async function startEncodeFlow() {
  ensureModuleReady();
  if (!state.cfg) {
    applyConfig();
  }

  const message = parseFullMessage();
  const msgPtr = mallocU8(state.mod, message);
  const cwPtr = state.mod._malloc(state.cfg.cwBits);

  try {
    state.mod._pw_trace_clear();
    const rc = state.mod._pw_encode_trace(msgPtr, state.cfg.msgBits, cwPtr, state.cfg.cwBits);
    if (rc !== 0) {
      throw new Error("pw_encode_trace failed.");
    }
    state.message = new Uint8Array(message);
    state.cw = readU8(state.mod, cwPtr, state.cfg.cwBits);
    state.errorMask = new Uint8Array(state.cfg.cwBits);
    state.encodeFrames = buildEncodeFrames(readTraceEvents());
    state.encodeIdx = 0;
    state.maxUnlocked = 1;
    setScreen("encode");
    renderEncodeFrame();
    playEncode();
    setStatus("Product-code construction trace ready.");
  } finally {
    freeAll(state.mod, [msgPtr, cwPtr]);
  }
}

async function startDecodeFlow() {
  ensureModuleReady();
  if (!state.cfg || !state.cw) {
    throw new Error("Construct the product code before decoding.");
  }

  const rx = new Uint8Array(state.cw);
  for (let i = 0; i < rx.length; i++) {
    if (state.errorMask[i]) rx[i] ^= 1;
  }

  const rxPtr = mallocU8(state.mod, rx);
  try {
    state.mod._pw_trace_clear();
    const rc = state.mod._pw_decode_trace(rxPtr, state.cfg.cwBits, state.cfg.maxIters);
    state.corrected = readU8(state.mod, rxPtr, state.cfg.cwBits);
    const statsPtr = state.mod._pw_decode_stats_ptr() >> 2;
    state.decodeStats = {
      maxIters: state.mod.HEAP32[statsPtr],
      iterationsRun: state.mod.HEAP32[statsPtr + 1],
      totalRowFailures: state.mod.HEAP32[statsPtr + 2],
      totalColFailures: state.mod.HEAP32[statsPtr + 3],
      totalRowChanges: state.mod.HEAP32[statsPtr + 4],
      totalColChanges: state.mod.HEAP32[statsPtr + 5],
      finalRowsValid: state.mod.HEAP32[statsPtr + 6],
      finalColsValid: state.mod.HEAP32[statsPtr + 7],
      rc
    };
    state.decodeFrames = buildDecodeFrames(readTraceEvents(), rx);
    state.decodeIdx = 0;
    state.maxUnlocked = 3;
    setScreen("decode");
    renderDecodeFrame();
    playDecode();
    setStatus(rc === 0 ? "Iterative decode trace ready." : "Iterative decode finished without a fully valid matrix.");
  } finally {
    freeAll(state.mod, [rxPtr]);
  }
}

async function loadModule() {
  const wasmMod = await import(`./assets/product.js${BUILD_QUERY}`);
  const factory = wasmMod.default || wasmMod.ProductModule;
  if (!factory) {
    throw new Error("No ProductModule export found.");
  }
  state.mod = await factory();
}

function bindEvents() {
  el.preset.addEventListener("change", applyPresetFields);
  el.advanced.addEventListener("change", () => {
    toggleAdvancedFields();
    applyPresetFields();
  });
  el.applyCfg.addEventListener("click", () => {
    try {
      applyConfig();
    } catch (err) {
      setStatus(`Config error: ${err.message}`);
    }
  });
  el.msgBits.addEventListener("input", () => {
    const maxBits = state.cfg ? state.cfg.msgBits : Number.POSITIVE_INFINITY;
    el.msgBits.value = sanitizeBitsInput(el.msgBits.value).slice(0, maxBits);
    renderInfoPreview();
    resetDownstream("input");
  });
  el.startEncode.addEventListener("click", () => {
    startEncodeFlow().catch((err) => setStatus(`Encode error: ${err.message}`));
  });
  el.toChannel.addEventListener("click", () => {
    state.maxUnlocked = Math.max(state.maxUnlocked, 2);
    setScreen("channel");
    renderChannel();
  });
  el.clearErrors.addEventListener("click", () => {
    if (state.errorMask) {
      state.errorMask.fill(0);
      renderChannel();
    }
  });
  el.runDecode.addEventListener("click", () => {
    startDecodeFlow().catch((err) => setStatus(`Decode error: ${err.message}`));
  });

  el.encBack.addEventListener("click", () => encodeStep(-1));
  el.encStep.addEventListener("click", () => encodeStep(1));
  el.encReset.addEventListener("click", () => {
    resetTimer("encode");
    state.encodeIdx = 0;
    renderEncodeFrame();
  });
  el.encPlay.addEventListener("click", playEncode);
  el.encPause.addEventListener("click", () => resetTimer("encode"));

  el.decBack.addEventListener("click", () => decodeStep(-1));
  el.decStep.addEventListener("click", () => decodeStep(1));
  el.decReset.addEventListener("click", () => {
    resetTimer("decode");
    state.decodeIdx = 0;
    renderDecodeFrame();
  });
  el.decPlay.addEventListener("click", playDecode);
  el.decPause.addEventListener("click", () => resetTimer("decode"));

  for (const screenName of SCREENS) {
    el.stepButtons[screenName].addEventListener("click", () => {
      const idxScreen = SCREENS.indexOf(screenName);
      if (idxScreen <= state.maxUnlocked) {
        setScreen(screenName);
        if (screenName === "channel") renderChannel();
        if (screenName === "encode") renderEncodeFrame();
        if (screenName === "decode") renderDecodeFrame();
      }
    });
  }

  el.focusBtn.addEventListener("click", () => {
    setFocusMode(!state.focusMode);
  });
}

async function main() {
  initPresetUi();
  bindEvents();
  setFocusMode(state.focusMode);
  try {
    await loadModule();
    setStatus("Product-code WASM ready.");
    applyConfig();
  } catch (err) {
    setStatus(`Load error: ${err.message}`);
  }
}

main();
