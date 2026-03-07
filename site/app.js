const PRESETS = [
  { name: "BCH(7,4,1)", m: 3, t: 1, prim: "0b1011" },
  { name: "BCH(15,7,2)", m: 4, t: 2, prim: "0b10011" },
  { name: "BCH(31,21,2)", m: 5, t: 2, prim: "0b100101" },
  { name: "BCH(31,16,3)", m: 5, t: 3, prim: "0b100101" },
  { name: "BCH(63,51,2)", m: 6, t: 2, prim: "0b1000011" }
];

const TRACE = {
  STAGE_ENCODE_BEGIN: 1,
  STAGE_ENCODE_END: 2,
  ENCODE_STEP: 10,
  STAGE_DECODE_BEGIN: 100,
  STAGE_SYNDROME: 110,
  STAGE_BM_ITER: 120,
  BM_ITER_BEGIN: 121,
  BM_TERM: 122,
  BM_UPDATE: 123,
  BM_COEFF: 124,
  STAGE_CHIEN_EVAL: 130,
  STAGE_CORRECT_FLIP: 140,
  STAGE_DECODE_END: 150
};

const SCREENS = ["compose", "encode", "channel", "decode"];

const el = {
  status: document.getElementById("status"),
  warning: document.getElementById("warning"),
  focusModeBtn: document.getElementById("focusModeBtn"),

  preset: document.getElementById("preset"),
  advanced: document.getElementById("advanced"),
  m: document.getElementById("m"),
  t: document.getElementById("t"),
  prim: document.getElementById("prim"),
  applyCfg: document.getElementById("applyCfg"),
  cfgMeta: document.getElementById("cfgMeta"),

  stepButtons: {
    compose: document.getElementById("stepCompose"),
    encode: document.getElementById("stepEncode"),
    channel: document.getElementById("stepChannel"),
    decode: document.getElementById("stepDecode")
  },
  screenNodes: {
    compose: document.getElementById("screen-compose"),
    encode: document.getElementById("screen-encode"),
    channel: document.getElementById("screen-channel"),
    decode: document.getElementById("screen-decode")
  },

  msgBits: document.getElementById("msgBits"),
  msgHint: document.getElementById("msgHint"),
  messagePreview: document.getElementById("messagePreview"),
  startEncodeBtn: document.getElementById("startEncodeBtn"),

  encSpeed: document.getElementById("encSpeed"),
  encBackBtn: document.getElementById("encBackBtn"),
  encPlayBtn: document.getElementById("encPlayBtn"),
  encPauseBtn: document.getElementById("encPauseBtn"),
  encStepBtn: document.getElementById("encStepBtn"),
  encResetBtn: document.getElementById("encResetBtn"),
  encFrameMeta: document.getElementById("encFrameMeta"),
  encInputMeta: document.getElementById("encInputMeta"),
  encRegMeta: document.getElementById("encRegMeta"),
  encInputLane: document.getElementById("encInputLane"),
  encRegLane: document.getElementById("encRegLane"),
  encPulse: document.getElementById("encPulse"),
  encNarrative: document.getElementById("encNarrative"),
  toChannelBtn: document.getElementById("toChannelBtn"),
  fxLayer: document.getElementById("fxLayer"),

  channelLane: document.getElementById("channelLane"),
  channelMeta: document.getElementById("channelMeta"),
  clearErrorsBtn: document.getElementById("clearErrorsBtn"),
  runDecodeBtn: document.getElementById("runDecodeBtn"),
  errorMeta: document.getElementById("errorMeta"),

  decMode: document.getElementById("decMode"),
  decSpeed: document.getElementById("decSpeed"),
  decBackBtn: document.getElementById("decBackBtn"),
  decPlayBtn: document.getElementById("decPlayBtn"),
  decPauseBtn: document.getElementById("decPauseBtn"),
  decStepBtn: document.getElementById("decStepBtn"),
  decRestartBtn: document.getElementById("decRestartBtn"),
  decFrameMeta: document.getElementById("decFrameMeta"),
  decStageMeta: document.getElementById("decStageMeta"),
  traceNotice: document.getElementById("traceNotice"),
  rxLane: document.getElementById("rxLane"),
  correctedLane: document.getElementById("correctedLane"),
  syndromeGrid: document.getElementById("syndromeGrid"),
  lambdaLane: document.getElementById("lambdaLane"),
  lambdaMeta: document.getElementById("lambdaMeta"),
  chienLane: document.getElementById("chienLane"),
  chienMeta: document.getElementById("chienMeta"),
  decNarrative: document.getElementById("decNarrative"),
  decodeResult: document.getElementById("decodeResult"),
  cardRx: document.getElementById("cardRx"),
  cardCorrected: document.getElementById("cardCorrected"),
  cardSyndrome: document.getElementById("cardSyndrome"),
  cardLambda: document.getElementById("cardLambda"),
  cardChien: document.getElementById("cardChien"),

  outMsg: document.getElementById("outMsg"),
  outCw: document.getElementById("outCw"),
  outRx: document.getElementById("outRx"),
  outCorrected: document.getElementById("outCorrected"),
  outDecodedMsg: document.getElementById("outDecodedMsg"),
  decodeMeta: document.getElementById("decodeMeta")
};

const state = {
  mod: null,
  cfg: null,
  screen: "compose",
  maxUnlocked: 0,
  focusMode: true,

  message: null,
  cw: null,
  errorPos: new Set(),
  rx: null,
  correctedFinal: null,

  encodeEvents: [],
  decodeEvents: [],

  encodeInputDisplay: [],
  encodeFrames: [],
  encodeIdx: 0,
  encTimer: null,

  decodeFrames: [],
  decodeIdx: 0,
  decodeApplied: -1,
  decTimer: null,
  decodeViz: null,

  decodeSummary: null
};

const MAX_ANIM_SPEED = 10;
const DEFAULT_ANIM_SPEED = Math.max(1, Math.round(MAX_ANIM_SPEED / 3));

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

function setTraceNotice(msg) {
  if (!msg) {
    el.traceNotice.classList.add("hidden");
    el.traceNotice.textContent = "";
    return;
  }
  el.traceNotice.textContent = msg;
  el.traceNotice.classList.remove("hidden");
}

function setDecodeStage(stage) {
  if (!el.decStageMeta) return;

  const cardMap = {
    start: [el.cardRx],
    syndrome: [el.cardSyndrome],
    bm: [el.cardLambda],
    chien: [el.cardChien],
    correction: [el.cardCorrected, el.cardChien],
    done: [el.cardCorrected]
  };

  const labelMap = {
    start: "Stage: start",
    syndrome: "Stage: syndrome",
    bm: "Stage: berlekamp-massey",
    chien: "Stage: chien search",
    correction: "Stage: correction",
    done: "Stage: done",
    idle: "Stage: idle"
  };

  const allCards = [el.cardRx, el.cardCorrected, el.cardSyndrome, el.cardLambda, el.cardChien];
  for (const card of allCards) {
    if (card) card.classList.remove("active-stage");
  }
  const activeCards = cardMap[stage] || [];
  for (const card of activeCards) {
    if (card) card.classList.add("active-stage");
  }

  el.decStageMeta.textContent = labelMap[stage] || labelMap.idle;
}

function clearDecodeOutcome() {
  if (!el.decodeResult) return;
  el.decodeResult.classList.add("hidden");
  el.decodeResult.classList.remove("success", "fail");
  el.decodeResult.textContent = "";
  if (el.outDecodedMsg) {
    el.outDecodedMsg.textContent = "-";
  }
}

function updateDecodeOutcome(corrected, rc) {
  if (!state.cfg || !state.message || !corrected || !el.decodeResult) {
    clearDecodeOutcome();
    return;
  }

  const decoded = corrected.slice(state.cfg.dg, state.cfg.dg + state.cfg.k);
  const decodedMsgMsb = lsbToMsbString(decoded);
  const originalMsgMsb = lsbToMsbString(state.message);
  const matches = decodedMsgMsb === originalMsgMsb;

  el.outDecodedMsg.textContent = decodedMsgMsb;
  el.decodeResult.classList.remove("hidden", "success", "fail");
  el.decodeResult.classList.add(matches ? "success" : "fail");
  el.decodeResult.textContent = matches
    ? `Decode SUCCESS: decoded message matches input (${decodedMsgMsb}). rc=${rc}`
    : `Decode FAIL: decoded message (${decodedMsgMsb}) != input (${originalMsgMsb}). rc=${rc}`;
}

function setFocusMode(enabled) {
  state.focusMode = !!enabled;
  document.body.classList.toggle("focus-mode", state.focusMode);
  if (el.focusModeBtn) {
    el.focusModeBtn.textContent = state.focusMode ? "Exit Focus" : "Focus Mode";
  }
}

function getStreamBitNode(lane, stepIdx) {
  return lane ? lane.querySelector(`.bit[data-step="${stepIdx}"]`) : null;
}

function getCodewordBitNode(lane, lsbIdx) {
  return lane ? lane.querySelector(`.bit[data-lsb="${lsbIdx}"]`) : null;
}

function getLaneMidNode(lane) {
  if (!lane) return null;
  const nodes = lane.querySelectorAll(".bit");
  if (!nodes.length) return lane;
  return nodes[Math.floor(nodes.length / 2)];
}

function launchFx(fromEl, toEl, tone = "") {
  if (!el.fxLayer || !fromEl || !toEl) return;

  const hostRect = el.fxLayer.getBoundingClientRect();
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  if (!hostRect.width || !hostRect.height) return;

  const startX = fromRect.left + fromRect.width * 0.5 - hostRect.left;
  const startY = fromRect.top + fromRect.height * 0.5 - hostRect.top;
  const endX = toRect.left + toRect.width * 0.5 - hostRect.left;
  const endY = toRect.top + toRect.height * 0.5 - hostRect.top;

  const dot = document.createElement("div");
  dot.className = "fx-dot";
  if (tone) dot.classList.add(tone);

  dot.style.left = `${startX - 5}px`;
  dot.style.top = `${startY - 5}px`;
  el.fxLayer.appendChild(dot);

  const controlX = (startX + endX) * 0.5;
  const controlY = Math.min(startY, endY) - 42;

  const anim = dot.animate([
    { transform: "translate(0px, 0px) scale(0.8)", opacity: 0.0, offset: 0 },
    {
      transform: `translate(${(controlX - startX) * 0.55}px, ${(controlY - startY) * 0.55}px) scale(1.1)`,
      opacity: 1.0,
      offset: 0.45
    },
    { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.75)`, opacity: 0.0, offset: 1 }
  ], {
    duration: 640,
    easing: "cubic-bezier(0.2, 0.88, 0.22, 1)"
  });

  anim.onfinish = () => {
    dot.remove();
  };
}

function sanitizeBits(raw) {
  return raw.replace(/[^01]/g, "");
}

function parsePrim(raw) {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("0x")) return Number.parseInt(s.slice(2), 16);
  if (s.startsWith("0b")) return Number.parseInt(s.slice(2), 2);
  return Number.parseInt(s, 10);
}

function warningForM(m) {
  if (m > 8) {
    return "Huge warning: m > 8 can generate extremely heavy visual traces. Only do this if you know what you're doing.";
  }
  if (m > 6) {
    return "Warning: m > 6 may slow cycle-level animation. Computation remains exact.";
  }
  return "";
}

function msbStringToLsbBits(msb, expectedLen) {
  const s = msb.trim();
  if (s.length !== expectedLen) {
    throw new Error(`Message length must be exactly ${expectedLen} bits.`);
  }
  const out = new Uint8Array(expectedLen);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "0" && ch !== "1") {
      throw new Error("Message must contain only 0/1.");
    }
    out[expectedLen - 1 - i] = ch === "1" ? 1 : 0;
  }
  return out;
}

function lsbToMsbString(bits) {
  return [...bits].reverse().map((v) => (v ? "1" : "0")).join("");
}

function bitsFromMask(mask, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = (mask >>> i) & 1;
  }
  return out;
}

function unpackU16Pair(word) {
  return {
    hi: (word >>> 16) & 0xffff,
    lo: word & 0xffff
  };
}

function formatCoeffVector(vec) {
  if (!vec || !vec.length) return "[]";

  let top = vec.length - 1;
  while (top > 0 && vec[top] === 0) {
    top -= 1;
  }

  const trimmed = vec.slice(0, top + 1);
  const maxShown = 12;
  const shown = trimmed.slice(0, maxShown).map((v) => `0x${v.toString(16)}`);
  if (trimmed.length > maxShown) {
    shown.push("...");
  }
  return `[${shown.join(", ")}]`;
}

function buildBmCoeffState(rows) {
  if (!rows.length) {
    return { C: [], B: [], T: [] };
  }

  let maxIdx = 0;
  for (const row of rows) {
    if (row.b > maxIdx) maxIdx = row.b;
  }

  const C = new Array(maxIdx + 1).fill(0);
  const B = new Array(maxIdx + 1).fill(0);
  const T = new Array(maxIdx + 1).fill(0);

  for (const row of rows) {
    C[row.b] = row.u0 >>> 0;
    B[row.b] = row.u1 >>> 0;
    T[row.b] = row.u2 >>> 0;
  }

  return { C, B, T };
}

function mallocU8(arrOrLen) {
  const len = typeof arrOrLen === "number" ? arrOrLen : arrOrLen.length;
  const ptr = state.mod._malloc(len);
  if (typeof arrOrLen !== "number") {
    state.mod.HEAPU8.set(arrOrLen, ptr);
  }
  return ptr;
}

function writeU8(ptr, arr) {
  state.mod.HEAPU8.set(arr, ptr);
}

function readU8(ptr, len) {
  return new Uint8Array(state.mod.HEAPU8.subarray(ptr, ptr + len));
}

function readI32(ptr) {
  return state.mod.HEAP32[ptr >> 2];
}

function freeAll(ptrs) {
  for (const p of ptrs) {
    if (p) state.mod._free(p);
  }
}

function readTraceEvents() {
  const len = state.mod._bchw_trace_len();
  const ptr = state.mod._bchw_trace_ptr();
  const stride = state.mod._bchw_trace_stride();
  if (!ptr || len <= 0 || stride <= 0) {
    return [];
  }

  const words = stride >> 2;
  const base = ptr >> 2;
  const out = [];
  for (let i = 0; i < len; i++) {
    const off = base + i * words;
    out.push({
      kind: state.mod.HEAPU32[off],
      a: state.mod.HEAP32[off + 1],
      b: state.mod.HEAP32[off + 2],
      u0: state.mod.HEAPU32[off + 3],
      u1: state.mod.HEAPU32[off + 4],
      u2: state.mod.HEAPU32[off + 5]
    });
  }
  return out;
}

function ensureWasmReady() {
  if (!state.mod) {
    throw new Error("WASM module not loaded. Run `make site-build` first.");
  }
  if (!state.mod.HEAPU8 || !state.mod.HEAP32 || !state.mod.HEAPU32) {
    throw new Error("WASM memory views missing. Rebuild assets with `make site-build`.");
  }
}

function screenIndex(name) {
  return SCREENS.indexOf(name);
}

function pauseEncode() {
  if (state.encTimer) {
    window.clearInterval(state.encTimer);
    state.encTimer = null;
  }
}

function pauseDecode() {
  if (state.decTimer) {
    window.clearInterval(state.decTimer);
    state.decTimer = null;
  }
}

function pauseAllAnimation() {
  pauseEncode();
  pauseDecode();
}

function updateStepperUi() {
  for (const name of SCREENS) {
    const btn = el.stepButtons[name];
    if (!btn) continue;
    btn.disabled = screenIndex(name) > state.maxUnlocked;
    btn.classList.toggle("active", state.screen === name);
  }
}

function showScreen(name) {
  if (screenIndex(name) > state.maxUnlocked) {
    return;
  }
  state.screen = name;
  for (const screenName of SCREENS) {
    const node = el.screenNodes[screenName];
    node.classList.toggle("active", screenName === name);
  }
  pauseAllAnimation();
  updateStepperUi();
}

function unlockScreen(name) {
  state.maxUnlocked = Math.max(state.maxUnlocked, screenIndex(name));
  updateStepperUi();
}

function resetUnlockedScreens() {
  state.maxUnlocked = 0;
  updateStepperUi();
}

function toggleAdvancedFields() {
  const adv = el.advanced.checked;
  el.m.disabled = !adv;
  el.t.disabled = !adv;
  el.prim.disabled = !adv;
}

function applyPresetToInputs() {
  const p = PRESETS[el.preset.selectedIndex];
  if (!p) return;
  if (!el.advanced.checked) {
    el.m.value = p.m;
    el.t.value = p.t;
    el.prim.value = p.prim;
  }
}

function initPresetUi() {
  el.preset.innerHTML = PRESETS.map((p) => `<option>${p.name}</option>`).join("");
  el.preset.value = PRESETS[1].name;
  applyPresetToInputs();
  toggleAdvancedFields();
}

function updateCfgMeta() {
  if (!state.cfg) {
    el.cfgMeta.textContent = "-";
    return;
  }
  const c = state.cfg;
  el.cfgMeta.textContent = `n=${c.n}  k=${c.k}  t=${c.t}  dg=${c.dg}  m=${c.m}  poly=0x${c.prim.toString(16)}`;
}

function makeBitNode(bit, indexLabel) {
  const node = document.createElement("div");
  node.className = `bit ${bit ? "one" : "zero"}`;

  const bitValue = document.createElement("span");
  bitValue.className = "bit-value";
  bitValue.textContent = bit ? "1" : "0";

  const index = document.createElement("span");
  index.className = "bit-index";
  index.textContent = String(indexLabel);

  node.appendChild(bitValue);
  node.appendChild(index);
  return node;
}

function renderStreamLane(container, bitsDisplay, opts = {}) {
  container.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (let i = 0; i < bitsDisplay.length; i++) {
    const bit = bitsDisplay[i] ? 1 : 0;
    const node = makeBitNode(bit, i);
    node.dataset.step = String(i);
    if (opts.flushFrom !== undefined && i >= opts.flushFrom) node.classList.add("flush");
    if (opts.activeIndex === i) node.classList.add("active");
    if (opts.doneUntil !== undefined && i < opts.doneUntil) node.classList.add("done");
    frag.appendChild(node);
  }

  container.appendChild(frag);
}

function renderCodewordLane(container, bitsLsb, opts = {}) {
  container.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (let di = 0; di < bitsLsb.length; di++) {
    const lsbIdx = bitsLsb.length - 1 - di;
    const bit = bitsLsb[lsbIdx] ? 1 : 0;
    const node = makeBitNode(bit, lsbIdx);
    node.dataset.lsb = String(lsbIdx);

    if (opts.activeLsb === lsbIdx) node.classList.add("active");
    if (opts.scanLsb === lsbIdx) node.classList.add("scanning");
    if (opts.errorSet && opts.errorSet.has(lsbIdx)) node.classList.add("error");
    if (opts.correctedSet && opts.correctedSet.has(lsbIdx)) node.classList.add("corrected");
    if (opts.rootSet && opts.rootSet.has(lsbIdx)) node.classList.add("root");

    if (opts.clickable) {
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
    }

    frag.appendChild(node);
  }

  container.appendChild(frag);
}

function renderMessagePreview() {
  if (!state.cfg) {
    el.messagePreview.innerHTML = "";
    el.msgHint.textContent = "-";
    return;
  }

  let cleaned = sanitizeBits(el.msgBits.value);
  if (cleaned.length > state.cfg.k) {
    cleaned = cleaned.slice(0, state.cfg.k);
  }
  if (cleaned !== el.msgBits.value) {
    el.msgBits.value = cleaned;
  }

  const padded = cleaned.padStart(state.cfg.k, "0");
  const previewLsb = msbStringToLsbBits(padded, state.cfg.k);
  renderCodewordLane(el.messagePreview, previewLsb);
  el.msgHint.textContent = `${cleaned.length}/${state.cfg.k} bits`;
}

function animatePulse(bit) {
  el.encPulse.textContent = bit ? "1" : "0";
  el.encPulse.classList.remove("one", "zero", "launch");
  el.encPulse.classList.add(bit ? "one" : "zero");
  void el.encPulse.offsetWidth;
  el.encPulse.classList.add("launch");
}

function clearDownstreamState() {
  state.message = null;
  state.cw = null;
  state.errorPos.clear();
  state.rx = null;
  state.correctedFinal = null;
  state.encodeEvents = [];
  state.decodeEvents = [];
  state.encodeFrames = [];
  state.decodeFrames = [];
  state.decodeSummary = null;
  state.decodeViz = null;
  state.decodeApplied = -1;
  state.encodeIdx = 0;
  state.decodeIdx = 0;

  pauseAllAnimation();
  resetUnlockedScreens();
  showScreen("compose");

  el.channelLane.innerHTML = "";
  el.channelMeta.textContent = "-";
  el.errorMeta.textContent = "No injected errors.";

  el.encInputLane.innerHTML = "";
  el.encRegLane.innerHTML = "";
  el.encFrameMeta.textContent = "Frame -";
  el.encInputMeta.textContent = "-";
  el.encRegMeta.textContent = "-";
  el.encNarrative.textContent = "Run the animation to inspect each shift/XOR cycle.";

  el.rxLane.innerHTML = "";
  el.correctedLane.innerHTML = "";
  el.syndromeGrid.innerHTML = "";
  el.lambdaLane.innerHTML = "";
  el.lambdaMeta.textContent = "Awaiting BM iterations.";
  el.chienLane.innerHTML = "";
  el.chienMeta.textContent = "Awaiting Chien search.";
  el.decNarrative.textContent = "Run decode to visualize syndrome, BM, Chien, and correction stages.";
  el.decFrameMeta.textContent = "Frame -";
  setDecodeStage("idle");
  setTraceNotice("");
  clearDecodeOutcome();

  el.outMsg.textContent = "-";
  el.outCw.textContent = "-";
  el.outRx.textContent = "-";
  el.outCorrected.textContent = "-";
  el.outDecodedMsg.textContent = "-";
  el.decodeMeta.textContent = "";
}

function applyConfig() {
  ensureWasmReady();

  const m = Number.parseInt(el.m.value, 10);
  const t = Number.parseInt(el.t.value, 10);
  const prim = parsePrim(el.prim.value);

  if (!Number.isInteger(m) || !Number.isInteger(t) || !Number.isInteger(prim)) {
    throw new Error("Invalid config values.");
  }

  if (m > 8) {
    const ok = window.confirm("m > 8 can be very slow in browser animation. Continue only if you know what you are doing.");
    if (!ok) {
      throw new Error("Config apply cancelled.");
    }
  }

  const rc = state.mod._bchw_init(m, prim >>> 0, t);
  if (rc !== 0) {
    throw new Error("bchw_init failed. Check m/t/primitive polynomial.");
  }

  const n = state.mod._bchw_get_n();
  const k = state.mod._bchw_get_k();
  const dg = state.mod._bchw_get_dg();

  state.cfg = { m, t, prim: prim >>> 0, n, k, dg };
  updateCfgMeta();
  setWarning(warningForM(m));
  setStatus("WASM ready.");

  el.msgBits.value = "0".repeat(k);
  el.msgBits.maxLength = String(k);

  clearDownstreamState();
  renderMessagePreview();

  const zeroRx = new Uint8Array(n);
  renderCodewordLane(el.rxLane, zeroRx);
  renderCodewordLane(el.correctedLane, zeroRx);
  renderCodewordLane(el.chienLane, zeroRx);

  const lambdaZero = new Uint8Array(t + 1);
  lambdaZero[0] = 1;
  renderCodewordLane(el.lambdaLane, lambdaZero);
  renderSyndromeCards(new Array(2 * t + 1).fill(null));
}

function getMessageStrict() {
  if (!state.cfg) {
    throw new Error("Apply a configuration first.");
  }

  const cleaned = sanitizeBits(el.msgBits.value.trim());
  if (cleaned !== el.msgBits.value.trim()) {
    el.msgBits.value = cleaned;
  }
  return msbStringToLsbBits(cleaned, state.cfg.k);
}

function buildEncodeFrames(events) {
  const out = [];
  const steps = events.filter((e) => e.kind === TRACE.ENCODE_STEP);

  out.push({
    type: "start",
    title: "Encode Start",
    text: "Starting with parity register cleared to all zeros."
  });

  for (const e of steps) {
    out.push({
      type: "step",
      step: e.a,
      inBit: e.b,
      top: e.u0,
      regMask: e.u1,
      regLen: e.u2,
      title: `Cycle ${e.a + 1}`,
      text: `Input bit ${e.b}, previous top tap ${e.u0}.`
    });
  }

  const end = events.find((e) => e.kind === TRACE.STAGE_ENCODE_END);
  if (end) {
    out.push({
      type: "end",
      step: end.a,
      parityMask: end.u0,
      dg: end.u1,
      title: "Encode Complete",
      text: "Parity bits are ready and prepended to the message bits."
    });
  }

  return out;
}

function renderEncodeFrame() {
  if (!state.encodeFrames.length || !state.cfg) {
    el.encFrameMeta.textContent = "Frame -";
    return;
  }

  const idx = Math.max(0, Math.min(state.encodeIdx, state.encodeFrames.length - 1));
  state.encodeIdx = idx;
  const frame = state.encodeFrames[idx];

  const totalFrames = state.encodeFrames.length;
  el.encFrameMeta.textContent = `Frame ${idx + 1}/${totalFrames} - ${frame.title}`;

  if (frame.type === "start") {
    renderStreamLane(el.encInputLane, state.encodeInputDisplay, {
      flushFrom: state.cfg.k,
      doneUntil: 0
    });
    renderCodewordLane(el.encRegLane, new Uint8Array(state.cfg.dg));
    el.encInputMeta.textContent = `message=${state.cfg.k} bits + flush=${state.cfg.dg} bits`;
    el.encRegMeta.textContent = `reg_len=${state.cfg.dg}`;
    el.encNarrative.textContent = frame.text;
    return;
  }

  if (frame.type === "end") {
    const parityBits = bitsFromMask(frame.parityMask, frame.dg);
    renderStreamLane(el.encInputLane, state.encodeInputDisplay, {
      flushFrom: state.cfg.k,
      doneUntil: state.encodeInputDisplay.length
    });
    renderCodewordLane(el.encRegLane, parityBits);
    el.encInputMeta.textContent = `all ${state.encodeInputDisplay.length} cycles complete`;
    el.encRegMeta.textContent = `parity(low<=32)=0x${frame.parityMask.toString(16)}`;
    el.encNarrative.textContent = frame.text;
    return;
  }

  renderStreamLane(el.encInputLane, state.encodeInputDisplay, {
    activeIndex: frame.step,
    doneUntil: frame.step,
    flushFrom: state.cfg.k
  });

  const regBits = bitsFromMask(frame.regMask, frame.regLen);
  renderCodewordLane(el.encRegLane, regBits, {
    activeLsb: frame.top ? frame.regLen - 1 : undefined
  });

  el.encInputMeta.textContent = `cycle=${frame.step + 1}/${state.encodeInputDisplay.length}`;
  el.encRegMeta.textContent = `top=${frame.top}  reg(low<=32)=0x${frame.regMask.toString(16)}`;

  const phase = frame.step < state.cfg.k ? "message" : "flush";
  el.encNarrative.textContent = frame.step < state.cfg.k
    ? `Cycle ${frame.step + 1}: message bit ${frame.inBit} enters the LFSR. Top tap was ${frame.top}, so ${frame.top ? "tap XORs are applied" : "no tap XOR this cycle"}.`
    : `Cycle ${frame.step + 1}: zero flush bit enters to push out final parity. Top tap was ${frame.top}.`;

  const fromNode = getStreamBitNode(el.encInputLane, frame.step);
  const toNode = getLaneMidNode(el.encRegLane);
  launchFx(fromNode, toNode, frame.top ? "blue" : "");

  animatePulse(frame.inBit);
  el.encPulse.title = `${phase} phase`;
}

function encodeStepForward() {
  if (!state.encodeFrames.length) return;
  if (state.encodeIdx >= state.encodeFrames.length - 1) return;
  state.encodeIdx += 1;
  renderEncodeFrame();
}

function encodeStepBackward() {
  if (!state.encodeFrames.length) return;
  if (state.encodeIdx <= 0) return;
  state.encodeIdx -= 1;
  renderEncodeFrame();
}

function resetEncodePlayback() {
  pauseEncode();
  state.encodeIdx = 0;
  renderEncodeFrame();
}

function playEncode() {
  if (!state.encodeFrames.length) return;
  pauseEncode();

  const speed = Number.parseInt(el.encSpeed.value, 10) || DEFAULT_ANIM_SPEED;
  const interval = Math.max(35, Math.floor(900 / speed));

  state.encTimer = window.setInterval(() => {
    if (state.encodeIdx >= state.encodeFrames.length - 1) {
      pauseEncode();
      return;
    }
    encodeStepForward();
  }, interval);
}

function buildRxFromChannel() {
  if (!state.cw) return null;
  const rx = new Uint8Array(state.cw);
  for (const p of state.errorPos) {
    rx[p] ^= 1;
  }
  return rx;
}

function renderChannelLane() {
  if (!state.cw) {
    el.channelLane.innerHTML = "";
    el.channelMeta.textContent = "-";
    el.errorMeta.textContent = "Encode a message first.";
    return;
  }

  clearDecodeOutcome();

  renderCodewordLane(el.channelLane, state.cw, {
    clickable: true,
    errorSet: state.errorPos
  });

  el.channelMeta.textContent = `n=${state.cfg.n}, click any bit index to flip`;

  const sorted = [...state.errorPos].sort((a, b) => a - b);
  el.errorMeta.textContent = sorted.length
    ? `Injected error positions (LSB index): ${sorted.join(", ")}`
    : "No injected errors.";

  const rx = buildRxFromChannel();
  state.rx = rx;
  el.outRx.textContent = rx ? lsbToMsbString(rx) : "-";
}

function startEncode() {
  ensureWasmReady();
  if (!state.cfg) {
    throw new Error("Apply configuration first.");
  }

  const msg = getMessageStrict();
  const msgPtr = mallocU8(msg);
  const cwPtr = mallocU8(state.cfg.n);

  try {
    const rcEnc = state.mod._bchw_encode_trace(msgPtr, state.cfg.k, cwPtr, state.cfg.n);
    if (rcEnc !== 0) {
      throw new Error(`encode trace failed (rc=${rcEnc})`);
    }

    const events = readTraceEvents();
    const cw = readU8(cwPtr, state.cfg.n);

    state.message = msg;
    state.cw = cw;
    state.errorPos.clear();
    state.rx = new Uint8Array(cw);
    state.correctedFinal = null;
    state.encodeEvents = events;
    state.decodeEvents = [];
    state.decodeFrames = [];
    state.decodeSummary = null;
    state.decodeViz = null;
    state.decodeApplied = -1;

    state.encodeInputDisplay = [...msg].reverse().concat(new Array(state.cfg.dg).fill(0));
    state.encodeFrames = buildEncodeFrames(events);
    state.encodeIdx = 0;

    el.outMsg.textContent = lsbToMsbString(msg);
    el.outCw.textContent = lsbToMsbString(cw);
    el.outRx.textContent = lsbToMsbString(cw);
    el.outCorrected.textContent = "-";
    el.decodeMeta.textContent = "";

    unlockScreen("encode");
    unlockScreen("channel");
    showScreen("encode");

    renderEncodeFrame();
    renderChannelLane();
    playEncode();
  } finally {
    freeAll([msgPtr, cwPtr]);
  }
}

function collectDecodeEventBuckets(events) {
  return {
    syndrome: events.filter((e) => e.kind === TRACE.STAGE_SYNDROME),
    bmIter: events.filter((e) => e.kind === TRACE.STAGE_BM_ITER),
    bmIterBegin: events.filter((e) => e.kind === TRACE.BM_ITER_BEGIN),
    bmTerm: events.filter((e) => e.kind === TRACE.BM_TERM),
    bmUpdate: events.filter((e) => e.kind === TRACE.BM_UPDATE),
    bmCoeff: events.filter((e) => e.kind === TRACE.BM_COEFF),
    chien: events.filter((e) => e.kind === TRACE.STAGE_CHIEN_EVAL),
    flips: events.filter((e) => e.kind === TRACE.STAGE_CORRECT_FLIP),
    end: [...events].reverse().find((e) => e.kind === TRACE.STAGE_DECODE_END)
  };
}

function buildBmCycleFrames(events) {
  const frames = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    if (ev.kind === TRACE.BM_ITER_BEGIN) {
      frames.push({
        type: "bm_iter_begin",
        title: `BM Iter n=${ev.a} begin`,
        text: `n=${ev.a}, L=${ev.b}, m=${ev.u1}, b=0x${ev.u2.toString(16)}, d_init=0x${ev.u0.toString(16)}.`,
        event: ev
      });
      continue;
    }

    if (ev.kind === TRACE.BM_TERM) {
      const pair = unpackU16Pair(ev.u2 >>> 0);
      const syndIdx = ev.a + 1 - ev.b;
      frames.push({
        type: "bm_term",
        title: `BM Term n=${ev.a}, i=${ev.b}`,
        text: `Check i=${ev.b}: C[i]=0x${ev.u0.toString(16)}, S[${syndIdx}]=0x${ev.u1.toString(16)}, prod=0x${pair.hi.toString(16)}, d->0x${pair.lo.toString(16)}.`,
        event: ev,
        prod: pair.hi,
        dAfter: pair.lo,
        syndIdx
      });
      continue;
    }

    if (ev.kind === TRACE.BM_UPDATE) {
      const pair = unpackU16Pair(ev.u2 >>> 0);
      frames.push({
        type: "bm_update",
        title: `BM Update n=${ev.a}`,
        text: `Update: old L=${ev.b}, new L=${ev.u0}, m=${ev.u1}, b=0x${pair.hi.toString(16)}, scale=d/b=0x${pair.lo.toString(16)}.`,
        event: ev,
        bField: pair.hi,
        scale: pair.lo
      });
      continue;
    }

    if (ev.kind === TRACE.STAGE_BM_ITER) {
      const coeffRows = [];
      let j = i + 1;
      while (j < events.length && events[j].kind === TRACE.BM_COEFF && events[j].a === ev.a) {
        coeffRows.push(events[j]);
        j += 1;
      }

      const coeffState = buildBmCoeffState(coeffRows);
      const coeffText = coeffRows.length
        ? ` C=${formatCoeffVector(coeffState.C)} B=${formatCoeffVector(coeffState.B)} T=${formatCoeffVector(coeffState.T)}`
        : "";

      frames.push({
        type: "bm_iter_end",
        title: `BM Iter n=${ev.a} end`,
        text: `Iteration end: L=${ev.b}, m=${ev.u1}, d=0x${ev.u0.toString(16)}, lambda_mask=0x${ev.u2.toString(16)}.${coeffText}`,
        event: ev,
        coeffState
      });

      i = j - 1;
    }
  }

  return frames;
}

function sampleChienEvents(chienEvents) {
  if (!state.cfg) return { sampled: chienEvents, note: "" };

  if (state.cfg.m <= 8) {
    return { sampled: chienEvents, note: "" };
  }

  const limit = 1200;
  if (chienEvents.length <= limit) {
    return { sampled: chienEvents, note: "" };
  }

  const stride = Math.ceil(chienEvents.length / limit);
  const sampled = chienEvents.filter((_, idx) => idx % stride === 0);
  const tail = chienEvents[chienEvents.length - 1];
  if (sampled[sampled.length - 1] !== tail) {
    sampled.push(tail);
  }

  return {
    sampled,
    note: `Chien frames auto-throttled for responsiveness: ${chienEvents.length} -> ${sampled.length}. Computation remains exact.`
  };
}

function buildDecodeFrames(mode, events) {
  const buckets = collectDecodeEventBuckets(events);
  const bmCycleFrames = buildBmCycleFrames(events);
  const frames = [];

  frames.push({
    type: "start",
    title: "Decode Start",
    text: "Decoder starts from received bits and computes syndromes."
  });

  if (mode === "stage") {
    frames.push({
      type: "syndrome_batch",
      title: "Syndrome Stage",
      text: `Computed ${buckets.syndrome.length} syndrome values S1..S${buckets.syndrome.length}.`,
      events: buckets.syndrome
    });

    if (buckets.bmIter.length) {
      const lastBm = buckets.bmIter[buckets.bmIter.length - 1];
      const bmIterEnds = bmCycleFrames.filter((f) => f.type === "bm_iter_end");
      const lastIterEnd = bmIterEnds.length ? bmIterEnds[bmIterEnds.length - 1] : null;
      const termChecks = buckets.bmTerm.length;
      const updates = buckets.bmUpdate.length;
      const coeffSummary = lastIterEnd
        ? ` C=${formatCoeffVector(lastIterEnd.coeffState.C)} B=${formatCoeffVector(lastIterEnd.coeffState.B)} T=${formatCoeffVector(lastIterEnd.coeffState.T)}`
        : "";

      frames.push({
        type: "bm_batch",
        title: "Berlekamp-Massey Stage",
        text: `BM iterations=${buckets.bmIter.length}, term checks=${termChecks}, updates=${updates}. Final L=${lastBm.b}, d=0x${lastBm.u0.toString(16)}.${coeffSummary}`,
        event: lastBm,
        coeffState: lastIterEnd ? lastIterEnd.coeffState : null
      });
    }

    if (buckets.chien.length) {
      const roots = buckets.chien.filter((e) => e.u0 === 0).map((e) => e.a);
      frames.push({
        type: "chien_batch",
        title: "Chien Search Stage",
        text: roots.length
          ? `Scanned ${buckets.chien.length} positions; root candidates at ${roots.join(", ")}.`
          : `Scanned ${buckets.chien.length} positions; no root candidates found.`,
        roots,
        lastPos: buckets.chien[buckets.chien.length - 1].a
      });
    }

    for (const flip of buckets.flips) {
      frames.push({
        type: "flip",
        title: "Correction",
        text: `Flipping bit position ${flip.a}.`,
        event: flip
      });
    }

    if (buckets.end) {
      frames.push({
        type: "end",
        title: "Decode End",
        text: `Decode finished with rc=${buckets.end.a}, corrected_errs=${buckets.end.b}.`,
        event: buckets.end
      });
    }

    setTraceNotice("");
    return frames;
  }

  for (const s of buckets.syndrome) {
    frames.push({
      type: "syndrome",
      title: `Syndrome S${s.a}`,
      text: `S${s.a} = 0x${s.u0.toString(16)}`,
      event: s
    });
  }

  for (const b of bmCycleFrames) {
    frames.push(b);
  }

  const sampledChien = sampleChienEvents(buckets.chien);
  setTraceNotice(sampledChien.note);
  for (const c of sampledChien.sampled) {
    frames.push({
      type: "chien",
      title: `Chien pos=${c.a}`,
      text: `eval=0x${c.u0.toString(16)}, x=0x${c.u1.toString(16)}`,
      event: c
    });
  }

  for (const flip of buckets.flips) {
    frames.push({
      type: "flip",
      title: "Correction",
      text: `Flipping bit position ${flip.a}.`,
      event: flip
    });
  }

  if (buckets.end) {
    frames.push({
      type: "end",
      title: "Decode End",
      text: `Decode finished with rc=${buckets.end.a}, corrected_errs=${buckets.end.b}.`,
      event: buckets.end
    });
  }

  return frames;
}

function renderSyndromeCards(values) {
  const count = state.cfg ? 2 * state.cfg.t : 0;
  const cards = [];
  for (let i = 1; i <= count; i++) {
    const v = values[i];
    cards.push(`
      <div class="syndrome-card">
        <span>S${i}</span>
        <strong>${v === null || v === undefined ? "--" : `0x${v.toString(16)}`}</strong>
      </div>
    `);
  }
  el.syndromeGrid.innerHTML = cards.join("");
}

function resetDecodeVisualization() {
  if (!state.cfg) return;

  const rx = state.rx ? new Uint8Array(state.rx) : new Uint8Array(state.cfg.n);
  state.decodeViz = {
    corrected: rx,
    correctedSet: new Set(),
    syndrome: new Array(2 * state.cfg.t + 1).fill(null),
    lambdaMask: 1,
    lambdaN: null,
    lambdaL: 0,
    lambdaM: null,
    lambdaB: null,
    lambdaD: null,
    lambdaScale: null,
    lambdaOldL: null,
    lambdaNewL: null,
    lambdaC: null,
    lambdaBPoly: null,
    lambdaT: null,
    chienPos: null,
    rootSet: new Set(),
    narrative: "Decoder initialized.",
    chienText: "Awaiting Chien search."
  };

  renderDecodeVisuals();
  setDecodeStage("idle");
  state.decodeApplied = -1;
}

function renderDecodeVisuals() {
  if (!state.cfg || !state.decodeViz) return;

  const viz = state.decodeViz;
  const rxBits = state.rx ? state.rx : new Uint8Array(state.cfg.n);

  renderCodewordLane(el.rxLane, rxBits, { errorSet: state.errorPos });
  renderCodewordLane(el.correctedLane, viz.corrected, { correctedSet: viz.correctedSet });
  renderSyndromeCards(viz.syndrome);

  const lambdaBits = bitsFromMask(viz.lambdaMask, state.cfg.t + 1);
  renderCodewordLane(el.lambdaLane, lambdaBits);
  if (viz.lambdaD === null) {
    el.lambdaMeta.textContent = "Awaiting BM iterations.";
  } else {
    const parts = [
      `n=${viz.lambdaN === null ? "-" : viz.lambdaN}`,
      `L=${viz.lambdaL}`,
      `m=${viz.lambdaM === null ? "-" : viz.lambdaM}`,
      `b=${viz.lambdaB === null ? "-" : `0x${viz.lambdaB.toString(16)}`}`,
      `d=0x${viz.lambdaD.toString(16)}`,
      `lambda_mask(low<=32)=0x${viz.lambdaMask.toString(16)}`
    ];

    if (viz.lambdaOldL !== null || viz.lambdaNewL !== null) {
      parts.push(`L update ${viz.lambdaOldL ?? "-"} -> ${viz.lambdaNewL ?? "-"}`);
    }
    if (viz.lambdaScale !== null) {
      parts.push(`scale=0x${viz.lambdaScale.toString(16)}`);
    }
    if (viz.lambdaC) {
      parts.push(`C=${formatCoeffVector(viz.lambdaC)}`);
    }
    if (viz.lambdaBPoly) {
      parts.push(`B=${formatCoeffVector(viz.lambdaBPoly)}`);
    }
    if (viz.lambdaT) {
      parts.push(`T=${formatCoeffVector(viz.lambdaT)}`);
    }

    el.lambdaMeta.textContent = parts.join(" | ");
  }

  renderCodewordLane(el.chienLane, rxBits, {
    scanLsb: viz.chienPos,
    rootSet: viz.rootSet
  });
  el.chienMeta.textContent = viz.chienText;
  el.decNarrative.textContent = viz.narrative;
}

function applyDecodeFrame(frame) {
  if (!state.decodeViz) return;
  const viz = state.decodeViz;
  let fxPos = null;
  let fxTone = "";

  switch (frame.type) {
    case "start":
      setDecodeStage("start");
      viz.narrative = frame.text;
      viz.chienText = "Awaiting Chien search.";
      break;

    case "syndrome": {
      setDecodeStage("syndrome");
      const ev = frame.event;
      viz.syndrome[ev.a] = ev.u0;
      viz.narrative = `Syndrome pass: S${ev.a} = 0x${ev.u0.toString(16)}.`;
      break;
    }

    case "syndrome_batch":
      setDecodeStage("syndrome");
      for (const ev of frame.events) {
        viz.syndrome[ev.a] = ev.u0;
      }
      viz.narrative = frame.text;
      break;

    case "bm_iter_begin": {
      setDecodeStage("bm");
      const ev = frame.event;
      viz.lambdaN = ev.a;
      viz.lambdaL = ev.b;
      viz.lambdaD = ev.u0;
      viz.lambdaM = ev.u1;
      viz.lambdaB = ev.u2;
      viz.lambdaScale = null;
      viz.lambdaOldL = null;
      viz.lambdaNewL = null;
      viz.narrative = frame.text;
      break;
    }

    case "bm_term": {
      setDecodeStage("bm");
      const ev = frame.event;
      viz.lambdaN = ev.a;
      viz.lambdaD = frame.dAfter;
      viz.narrative = frame.text;
      break;
    }

    case "bm_update": {
      setDecodeStage("bm");
      const ev = frame.event;
      viz.lambdaN = ev.a;
      viz.lambdaOldL = ev.b;
      viz.lambdaNewL = ev.u0;
      viz.lambdaL = ev.u0;
      viz.lambdaM = ev.u1;
      viz.lambdaB = frame.bField;
      viz.lambdaScale = frame.scale;
      viz.narrative = frame.text;
      break;
    }

    case "bm_iter_end": {
      setDecodeStage("bm");
      const ev = frame.event;
      viz.lambdaN = ev.a;
      viz.lambdaMask = ev.u2;
      viz.lambdaL = ev.b;
      viz.lambdaM = ev.u1;
      viz.lambdaD = ev.u0;
      viz.lambdaOldL = null;
      viz.lambdaNewL = null;
      viz.lambdaC = frame.coeffState.C;
      viz.lambdaBPoly = frame.coeffState.B;
      viz.lambdaT = frame.coeffState.T;
      viz.narrative = frame.text;
      break;
    }

    case "bm_batch": {
      setDecodeStage("bm");
      const ev = frame.event;
      viz.lambdaN = ev.a;
      viz.lambdaMask = ev.u2;
      viz.lambdaL = ev.b;
      viz.lambdaD = ev.u0;
      viz.lambdaM = ev.u1;
      viz.lambdaOldL = null;
      viz.lambdaNewL = null;
      if (frame.coeffState) {
        viz.lambdaC = frame.coeffState.C;
        viz.lambdaBPoly = frame.coeffState.B;
        viz.lambdaT = frame.coeffState.T;
      }
      viz.narrative = frame.text;
      break;
    }

    case "chien": {
      setDecodeStage("chien");
      const ev = frame.event;
      viz.chienPos = ev.a;
      viz.chienText = `Scanning pos=${ev.a}, eval=0x${ev.u0.toString(16)}, x=0x${ev.u1.toString(16)}.`;
      if (ev.u0 === 0) {
        viz.rootSet.add(ev.a);
        viz.narrative = `Chien found a root candidate at position ${ev.a}.`;
        fxPos = ev.a;
        fxTone = "blue";
      } else {
        viz.narrative = `Chien evaluating position ${ev.a}.`;
      }
      break;
    }

    case "chien_batch":
      setDecodeStage("chien");
      viz.chienPos = frame.lastPos;
      for (const pos of frame.roots) {
        viz.rootSet.add(pos);
      }
      viz.chienText = frame.text;
      viz.narrative = frame.text;
      break;

    case "flip": {
      setDecodeStage("correction");
      const ev = frame.event;
      viz.corrected[ev.a] ^= 1;
      viz.correctedSet.add(ev.a);
      viz.rootSet.add(ev.a);
      viz.chienPos = ev.a;
      viz.chienText = `Applying correction at bit position ${ev.a}.`;
      viz.narrative = frame.text;
      fxPos = ev.a;
      fxTone = "red";
      break;
    }

    case "end":
      setDecodeStage("done");
      viz.narrative = frame.text;
      viz.chienText = `Decode complete: rc=${frame.event.a}, corrected_errs=${frame.event.b}.`;
      break;

    default:
      break;
  }

  renderDecodeVisuals();
  if (fxPos !== null) {
    const fromNode = getCodewordBitNode(el.chienLane, fxPos);
    const toNode = getCodewordBitNode(el.correctedLane, fxPos);
    launchFx(fromNode, toNode || el.correctedLane, fxTone);
  }
}

function seekDecodeFrame(targetIdx) {
  if (!state.decodeFrames.length) {
    el.decFrameMeta.textContent = "Frame -";
    return;
  }

  const idx = Math.max(0, Math.min(targetIdx, state.decodeFrames.length - 1));

  if (idx <= state.decodeApplied) {
    resetDecodeVisualization();
  }

  while (state.decodeApplied < idx) {
    state.decodeApplied += 1;
    applyDecodeFrame(state.decodeFrames[state.decodeApplied]);
  }

  state.decodeIdx = idx;
  const frame = state.decodeFrames[state.decodeIdx];
  el.decFrameMeta.textContent = `Frame ${state.decodeIdx + 1}/${state.decodeFrames.length} - ${frame.title}`;
}

function decodeStepForward() {
  if (!state.decodeFrames.length) return;
  if (state.decodeIdx >= state.decodeFrames.length - 1) return;
  seekDecodeFrame(state.decodeIdx + 1);
}

function decodeStepBackward() {
  if (!state.decodeFrames.length) return;
  if (state.decodeIdx <= 0) {
    seekDecodeFrame(0);
    return;
  }
  seekDecodeFrame(state.decodeIdx - 1);
}

function playDecode() {
  if (!state.decodeFrames.length) return;
  pauseDecode();

  const speed = Number.parseInt(el.decSpeed.value, 10) || DEFAULT_ANIM_SPEED;
  const interval = Math.max(35, Math.floor(900 / speed));

  state.decTimer = window.setInterval(() => {
    if (state.decodeIdx >= state.decodeFrames.length - 1) {
      pauseDecode();
      return;
    }
    decodeStepForward();
  }, interval);
}

function restartDecodePlayback() {
  pauseDecode();
  resetDecodeVisualization();
  seekDecodeFrame(0);
}

function runDecode() {
  ensureWasmReady();
  if (!state.cw || !state.cfg) {
    throw new Error("Encode first so codeword bits exist.");
  }

  const rx = buildRxFromChannel();
  if (!rx) {
    throw new Error("No received word available.");
  }

  const rxPtr = mallocU8(rx);
  const errsPtr = state.mod._malloc(4);

  try {
    const rcDec = state.mod._bchw_decode_trace(rxPtr, state.cfg.n, errsPtr);
    const decodeEvents = readTraceEvents();
    const corrected = readU8(rxPtr, state.cfg.n);
    const outErrs = readI32(errsPtr);

    state.rx = rx;
    state.correctedFinal = corrected;
    state.decodeEvents = decodeEvents;

    state.decodeSummary = {
      rc: rcDec,
      outErrs,
      injected: [...state.errorPos].sort((a, b) => a - b)
    };

    state.decodeFrames = buildDecodeFrames(el.decMode.value, decodeEvents);
    state.decodeIdx = 0;

    el.outRx.textContent = lsbToMsbString(rx);
    el.outCorrected.textContent = lsbToMsbString(corrected);
    updateDecodeOutcome(corrected, rcDec);
    el.decodeMeta.textContent = `rc=${rcDec}  out_errs=${outErrs}  injected=${state.decodeSummary.injected.length} (${state.decodeSummary.injected.join(", ") || "none"})`;

    unlockScreen("decode");
    showScreen("decode");

    restartDecodePlayback();
    playDecode();
  } finally {
    freeAll([rxPtr, errsPtr]);
  }
}

function rebuildDecodeFramesForMode() {
  if (!state.decodeEvents.length) {
    return;
  }
  state.decodeFrames = buildDecodeFrames(el.decMode.value, state.decodeEvents);
  state.decodeIdx = 0;
  restartDecodePlayback();
}

function maybeInvalidatePipelineOnMessageEdit() {
  if (!state.message) return;
  const current = sanitizeBits(el.msgBits.value.trim());
  const prev = lsbToMsbString(state.message);
  if (current !== prev) {
    clearDownstreamState();
  }
}

async function loadWasmModule() {
  try {
    const wasmMod = await import("./assets/bch.js");
    const factory = wasmMod.default || wasmMod.BCHModule;
    if (!factory) {
      throw new Error("No BCHModule export found.");
    }
    state.mod = await factory();
    setStatus("WASM module loaded.");
  } catch (err) {
    setStatus(`WASM load failed: ${err.message}`);
    setWarning("Build assets first with `make site-build` so site/assets/bch.js and bch.wasm exist.");
    throw err;
  }
}

function bindEvents() {
  if (el.focusModeBtn) {
    el.focusModeBtn.addEventListener("click", () => {
      setFocusMode(!state.focusMode);
    });
  }

  el.preset.addEventListener("change", () => {
    applyPresetToInputs();
  });

  el.advanced.addEventListener("change", () => {
    toggleAdvancedFields();
    applyPresetToInputs();
  });

  el.applyCfg.addEventListener("click", () => {
    try {
      applyConfig();
    } catch (err) {
      setStatus(`Config error: ${err.message}`);
    }
  });

  for (const name of SCREENS) {
    const btn = el.stepButtons[name];
    btn.addEventListener("click", () => {
      showScreen(name);
    });
  }

  el.msgBits.addEventListener("input", () => {
    maybeInvalidatePipelineOnMessageEdit();
    renderMessagePreview();
  });

  el.startEncodeBtn.addEventListener("click", () => {
    try {
      startEncode();
    } catch (err) {
      setStatus(`Encode error: ${err.message}`);
    }
  });

  el.encBackBtn.addEventListener("click", () => {
    pauseEncode();
    encodeStepBackward();
  });
  el.encPlayBtn.addEventListener("click", playEncode);
  el.encPauseBtn.addEventListener("click", pauseEncode);
  el.encStepBtn.addEventListener("click", () => {
    pauseEncode();
    encodeStepForward();
  });
  el.encResetBtn.addEventListener("click", resetEncodePlayback);

  el.toChannelBtn.addEventListener("click", () => {
    if (!state.cw) {
      setStatus("Encode first.");
      return;
    }
    showScreen("channel");
  });

  el.channelLane.addEventListener("click", (ev) => {
    const node = ev.target.closest(".bit[data-lsb]");
    if (!node || !state.cw) {
      return;
    }
    const fromNode = node;
    const pos = Number.parseInt(node.dataset.lsb, 10);
    if (!Number.isInteger(pos)) return;

    const wasSet = state.errorPos.has(pos);
    if (state.errorPos.has(pos)) {
      state.errorPos.delete(pos);
    } else {
      state.errorPos.add(pos);
    }

    renderChannelLane();
    launchFx(fromNode, el.runDecodeBtn, wasSet ? "blue" : "red");
  });

  el.channelLane.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const node = ev.target.closest(".bit[data-lsb]");
    if (!node) return;
    ev.preventDefault();
    node.click();
  });

  el.clearErrorsBtn.addEventListener("click", () => {
    state.errorPos.clear();
    renderChannelLane();
  });

  el.runDecodeBtn.addEventListener("click", () => {
    try {
      runDecode();
    } catch (err) {
      setStatus(`Decode error: ${err.message}`);
    }
  });

  el.decMode.addEventListener("change", rebuildDecodeFramesForMode);

  el.decBackBtn.addEventListener("click", () => {
    pauseDecode();
    decodeStepBackward();
  });
  el.decPlayBtn.addEventListener("click", playDecode);
  el.decPauseBtn.addEventListener("click", pauseDecode);
  el.decStepBtn.addEventListener("click", () => {
    pauseDecode();
    decodeStepForward();
  });
  el.decRestartBtn.addEventListener("click", restartDecodePlayback);
}

function initPlaybackDefaults() {
  if (el.encSpeed) {
    el.encSpeed.min = "1";
    el.encSpeed.max = String(MAX_ANIM_SPEED);
    el.encSpeed.value = String(DEFAULT_ANIM_SPEED);
  }
  if (el.decSpeed) {
    el.decSpeed.min = "1";
    el.decSpeed.max = String(MAX_ANIM_SPEED);
    el.decSpeed.value = String(DEFAULT_ANIM_SPEED);
  }
  if (el.decMode) {
    el.decMode.value = "cycle";
  }
}

async function main() {
  initPlaybackDefaults();
  initPresetUi();
  bindEvents();
  updateStepperUi();
  setFocusMode(state.focusMode);
  showScreen("compose");

  try {
    await loadWasmModule();
    applyConfig();
  } catch (_) {
    // status already set
  }
}

main();
