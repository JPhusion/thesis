const PRESETS = [
  {
    name: "SC[short BCH(254,230,3), paper Fig. 5 settings]",
    m: 8,
    t: 3,
    prim: "0x11d",
    dataBlocks: 7,
    windowSize: 7,
    maxIters: 12,
    startDb: 3.6,
    endDb: 4.8,
    stepDb: 0.1
  },
  {
    name: "SC[short BCH(510,483,3), paper Fig. 6 settings]",
    m: 9,
    t: 3,
    prim: "0x211",
    dataBlocks: 7,
    windowSize: 7,
    maxIters: 12,
    startDb: 4.5,
    endDb: 5.2,
    stepDb: 0.1
  },
  {
    name: "SC[short BCH(62,50,2), 7 data blocks]",
    m: 6,
    t: 2,
    prim: "0b1000011",
    dataBlocks: 7,
    windowSize: 3,
    maxIters: 3,
    startDb: 0.0,
    endDb: 6.0,
    stepDb: 0.1
  },
  {
    name: "SC[short BCH(30,20,2), 7 data blocks]",
    m: 5,
    t: 2,
    prim: "0b100101",
    dataBlocks: 7,
    windowSize: 3,
    maxIters: 3,
    startDb: 0.0,
    endDb: 6.0,
    stepDb: 0.1
  },
  {
    name: "SC[short BCH(14,10,1), 7 data blocks]",
    m: 4,
    t: 1,
    prim: "0b10011",
    dataBlocks: 7,
    windowSize: 3,
    maxIters: 3,
    startDb: 0.0,
    endDb: 6.0,
    stepDb: 0.1
  }
];

const BUILD_QUERY = new URL(import.meta.url).search;

const SERIES_COLORS = {
  raw: "#d96c54",
  decoded: "#0f8b73",
  success: "#b9851b"
};

const el = {
  status: document.getElementById("staircaseTestStatus"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")],

  runSuiteBtn: document.getElementById("runStaircaseSuiteBtn"),
  suiteBanner: document.getElementById("staircaseSuiteBanner"),
  suiteBadge: document.getElementById("staircaseSuiteBadge"),
  suiteHeadline: document.getElementById("staircaseSuiteHeadline"),
  suiteSummary: document.getElementById("staircaseSuiteSummary"),
  suiteProgressLabel: document.getElementById("staircaseSuiteProgressLabel"),
  suiteProgressPct: document.getElementById("staircaseSuiteProgressPct"),
  suiteProgressFill: document.getElementById("staircaseSuiteProgressFill"),
  suiteTotal: document.getElementById("staircaseSuiteTotal"),
  suitePass: document.getElementById("staircaseSuitePass"),
  suiteFail: document.getElementById("staircaseSuiteFail"),
  suiteDuration: document.getElementById("staircaseSuiteDuration"),
  suiteMeta: document.getElementById("staircaseSuiteMeta"),
  suiteBody: document.getElementById("staircaseSuiteBody"),
  decodeCards: document.getElementById("staircaseDecodeCards"),
  suiteLog: document.getElementById("staircaseSuiteLog"),

  snrPreset: document.getElementById("stairSnrPreset"),
  snrAdvanced: document.getElementById("stairSnrAdvanced"),
  snrDataBlocks: document.getElementById("stairSnrDataBlocks"),
  snrWindow: document.getElementById("stairSnrWindow"),
  snrMaxIters: document.getElementById("stairSnrMaxIters"),
  snrM: document.getElementById("stairSnrM"),
  snrT: document.getElementById("stairSnrT"),
  snrPrim: document.getElementById("stairSnrPrim"),
  applySnrCfg: document.getElementById("applyStairSnrCfg"),
  runSnrBtn: document.getElementById("runStairSnrBtn"),
  snrCfgMeta: document.getElementById("stairSnrCfgMeta"),
  snrWarning: document.getElementById("stairSnrWarning"),
  snrStart: document.getElementById("stairSnrStart"),
  snrEnd: document.getElementById("stairSnrEnd"),
  snrStep: document.getElementById("stairSnrStep"),
  snrFrames: document.getElementById("stairSnrFrames"),
  snrProgress: document.getElementById("stairSnrProgress"),
  snrPointCount: document.getElementById("stairSnrPointCount"),
  snrFrameCount: document.getElementById("stairSnrFrameCount"),
  snrBestSuccess: document.getElementById("stairSnrBestSuccess"),
  snrWorstRaw: document.getElementById("stairSnrWorstRaw"),
  snrTableBody: document.getElementById("stairSnrTableBody"),
  berChart: document.getElementById("stairBerChart"),
  frameChart: document.getElementById("stairFrameChart")
};

const state = {
  mod: null,
  testsMod: null,
  activeTab: "suite",
  testLog: [],
  suiteRunning: false,
  sweepRunning: false,
  snrCfg: null,
  snrResults: []
};

function setStatus(msg) {
  el.status.textContent = msg;
}

function setWarning(node, msg) {
  if (!node) return;
  if (!msg) {
    node.classList.add("hidden");
    node.textContent = "";
    return;
  }
  node.textContent = msg;
  node.classList.remove("hidden");
}

function parsePrim(raw) {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("0x")) return Number.parseInt(s.slice(2), 16);
  if (s.startsWith("0b")) return Number.parseInt(s.slice(2), 2);
  return Number.parseInt(s, 10);
}

function warningForScene(cfg) {
  if (!cfg) return "";
  if (cfg.blockSize > 31 || cfg.totalBlocks > 10) {
    return "Warning: this staircase is valid, but the browser sweep may take noticeably longer.";
  }
  return "";
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

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function formatRatio(v) {
  if (!Number.isFinite(v)) return "-";
  if (v === 0) return "0";
  if (v >= 0.01) return v.toFixed(4);
  return v.toExponential(2);
}

function formatPct(v) {
  if (!Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "-";
}

function setActiveTab(tab) {
  state.activeTab = tab;
  for (const button of el.tabButtons) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of el.tabPanels) {
    const active = panel.dataset.tabPanel === tab;
    panel.classList.toggle("hidden-panel", !active);
    panel.hidden = !active;
  }
}

function updateSuiteProgress(completed, total, label) {
  const safeTotal = Math.max(1, total);
  const pct = Math.max(0, Math.min(100, (completed / safeTotal) * 100));
  el.suiteProgressLabel.textContent = label;
  el.suiteProgressPct.textContent = `${Math.round(pct)}%`;
  el.suiteProgressFill.style.width = `${pct}%`;
}

function setSuiteBanner(mode, headline, detail) {
  el.suiteBanner.className = `suite-banner ${mode}`;
  el.suiteBadge.className = `suite-badge ${mode}`;
  el.suiteBadge.textContent = mode.toUpperCase();
  el.suiteHeadline.textContent = headline;
  el.suiteSummary.textContent = detail;
}

function renderSuiteLog() {
  const text = stripAnsi(state.testLog.join("\n")).trim();
  el.suiteLog.textContent = text || "No browser suite run yet.";
  el.suiteLog.scrollTop = el.suiteLog.scrollHeight;
}

function drawEmptyChart(canvas, message) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#c8d6e5";
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.fillStyle = "#4f6173";
  ctx.font = '14px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawLineChart(canvas, series, options) {
  if (!canvas) return;
  if (!series.length || !series.some((line) => line.points.length)) {
    drawEmptyChart(canvas, "No data yet.");
    return;
  }

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillRect(0, 0, width, height);

  const margin = { left: 62, right: 18, top: 18, bottom: 40 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const allPoints = series.flatMap((line) => line.points);
  const xValues = [...new Set(allPoints.map((p) => p.x))].sort((a, b) => a - b);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);

  let yMin;
  let yMax;
  if (options.logY) {
    const positives = allPoints.map((p) => p.y).filter((v) => v > 0);
    const minPositive = positives.length ? Math.min(...positives) : 1e-6;
    yMin = Math.pow(10, Math.floor(Math.log10(Math.min(minPositive, 1e-4))));
    yMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...positives, 1e-2))));
    if (yMax <= yMin) yMax = yMin * 10;
  } else {
    yMin = options.yMin ?? 0;
    yMax = options.yMax ?? Math.max(1, ...allPoints.map((p) => p.y));
  }

  const mapX = (x) => {
    if (xMax === xMin) return margin.left + plotW / 2;
    return margin.left + ((x - xMin) / (xMax - xMin)) * plotW;
  };
  const mapY = (y) => {
    if (options.logY) {
      const safe = Math.max(y, yMin);
      const t = (Math.log10(safe) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin));
      return margin.top + plotH - t * plotH;
    }
    const t = (y - yMin) / (yMax - yMin || 1);
    return margin.top + plotH - t * plotH;
  };

  ctx.strokeStyle = "#d1dbe7";
  ctx.lineWidth = 1;
  const maxXTicks = Math.max(4, Math.floor(plotW / 72));
  const xTickStride = Math.max(1, Math.ceil(xValues.length / maxXTicks));
  const xTickValues = xValues.filter((_, idx) => idx % xTickStride === 0);
  if (xTickValues[xTickValues.length - 1] !== xValues[xValues.length - 1]) {
    xTickValues.push(xValues[xValues.length - 1]);
  }
  for (const tick of xTickValues) {
    const x = mapX(tick);
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + plotH);
    ctx.stroke();
  }

  const yTicks = options.logY
    ? (() => {
        const ticks = [];
        const start = Math.log10(yMin);
        const end = Math.log10(yMax);
        for (let exp = Math.ceil(start); exp <= Math.floor(end); exp++) {
          ticks.push(Math.pow(10, exp));
        }
        return ticks;
      })()
    : [0, 0.25, 0.5, 0.75, 1];

  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillStyle = "#3f617e";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of yTicks) {
    const y = mapY(tick);
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + plotW, y);
    ctx.stroke();
    ctx.fillText(options.logY ? tick.toExponential(0) : tick.toFixed(2), margin.left - 8, y);
  }

  ctx.strokeStyle = "#8ea6bb";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of xTickValues) {
    ctx.fillText(tick.toFixed(1), mapX(tick), margin.top + plotH + 8);
  }

  ctx.fillStyle = "#294760";
  ctx.font = '13px "IBM Plex Mono", monospace';
  ctx.save();
  ctx.translate(14, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(options.yLabel, 0, 0);
  ctx.restore();
  ctx.fillText(options.xLabel, margin.left + plotW / 2, height - 8);

  for (const line of series) {
    if (!line.points.length) continue;
    ctx.strokeStyle = line.color;
    ctx.fillStyle = line.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    line.points.forEach((point, idx) => {
      const x = mapX(point.x);
      const y = mapY(point.y);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    for (const point of line.points) {
      const x = mapX(point.x);
      const y = mapY(point.y);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function buildSnrPoints(start, end, step) {
  const points = [];
  const safeStep = Math.max(step, 0.0001);
  if (end < start) return points;
  for (let value = start; value <= end + safeStep * 0.25; value += safeStep) {
    points.push(Number(value.toFixed(6)));
  }
  return points;
}

function bitsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function renderDecodeCards(cards) {
  if (!cards.length) {
    el.decodeCards.innerHTML = `<div class="empty-cell">No decode breakdown yet.</div>`;
    return;
  }
  el.decodeCards.innerHTML = cards.map((card) => `
    <article class="decode-config-card">
      <div class="decode-config-head">
        <div>
          <h3>${card.title}</h3>
          <div class="decode-config-meta">${card.meta}</div>
        </div>
      </div>
      <div class="decode-topline">
        ${card.top.map((item) => `
          <div class="decode-top-item">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </div>
        `).join("")}
      </div>
      <div class="diag-grid">
        ${card.cases.map((item) => `
          <div class="diag-card">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function parseDecodeLog(rawLog) {
  const lines = stripAnsi(rawLog).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const configLine = lines.find((line) => line.startsWith("CONFIG staircase "));
  if (!configLine) return [];
  const cleanLine = lines.find((line) => line.startsWith("CASE clean_decode "));
  const singleLine = lines.find((line) => line.startsWith("CASE single_bit_errors "));
  const configMatch = configLine.match(/short BCH\((\d+),(\d+),(\d+)\) data_blocks=(\d+) window=(\d+) max_iters=(\d+) stored_bits=(\d+)/);
  if (!configMatch) return [];
  const cleanMatch = cleanLine?.match(/rc=(-?\d+) final_valid=(\d+) locked=(\d+)/);
  const singleMatch = singleLine?.match(/total=(\d+) pass=(\d+) fail=(\d+)/);
  return [{
    title: `short BCH(${configMatch[1]},${configMatch[2]},${configMatch[3]}) staircase decode`,
    meta: `data blocks=${configMatch[4]} • window=${configMatch[5]} • max iters=${configMatch[6]}`,
    top: [
      { label: "Stored Bits", value: configMatch[7] },
      { label: "Clean Decode rc", value: cleanMatch ? cleanMatch[1] : "-" },
      { label: "Final Valid", value: cleanMatch ? cleanMatch[2] : "-" },
      { label: "Locked Blocks", value: cleanMatch ? cleanMatch[3] : "-" }
    ],
    cases: [
      { label: "Single-bit total", value: singleMatch ? singleMatch[1] : "-" },
      { label: "Single-bit pass", value: singleMatch ? singleMatch[2] : "-" },
      { label: "Single-bit fail", value: singleMatch ? singleMatch[3] : "-" }
    ]
  }];
}

function renderSnrSummary() {
  const rows = state.snrResults;
  if (!rows.length) {
    el.snrPointCount.textContent = "-";
    el.snrFrameCount.textContent = "-";
    el.snrBestSuccess.textContent = "-";
    el.snrWorstRaw.textContent = "-";
    el.snrTableBody.innerHTML = `<tr><td colspan="5" class="empty-cell">No sweep run yet.</td></tr>`;
    drawEmptyChart(el.berChart, "No sweep data yet.");
    drawEmptyChart(el.frameChart, "No sweep data yet.");
    return;
  }

  el.snrPointCount.textContent = String(rows.length);
  el.snrFrameCount.textContent = String(rows.reduce((sum, row) => sum + row.frames, 0));
  el.snrBestSuccess.textContent = formatPct(Math.max(...rows.map((row) => row.successRate)));
  el.snrWorstRaw.textContent = formatRatio(Math.max(...rows.map((row) => row.rawBer)));
  el.snrTableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.snrDb.toFixed(1)} dB</td>
      <td>${formatRatio(row.rawBer)}</td>
      <td>${formatRatio(row.decodedBer)}</td>
      <td>${formatPct(row.successRate)}</td>
      <td>${row.frames}</td>
    </tr>
  `).join("");

  drawLineChart(el.berChart, [
    { color: SERIES_COLORS.raw, points: rows.filter((row) => row.rawBer > 0).map((row) => ({ x: row.snrDb, y: row.rawBer })) },
    { color: SERIES_COLORS.decoded, points: rows.filter((row) => row.decodedBer > 0).map((row) => ({ x: row.snrDb, y: row.decodedBer })) }
  ], {
    xLabel: "Eb/N0 (dB)",
    yLabel: "BER",
    logY: true
  });

  drawLineChart(el.frameChart, [
    { color: SERIES_COLORS.success, points: rows.map((row) => ({ x: row.snrDb, y: row.successRate })) }
  ], {
    xLabel: "Eb/N0 (dB)",
    yLabel: "Frame Success",
    yMin: 0,
    yMax: 1,
    logY: false
  });
}

function updateSuiteUI(results, durationMs) {
  const passCount = results.filter((row) => row.rc === 0).length;
  const failCount = results.length - passCount;
  el.suiteTotal.textContent = String(results.length);
  el.suitePass.textContent = String(passCount);
  el.suiteFail.textContent = String(failCount);
  el.suiteDuration.textContent = `${(durationMs / 1000).toFixed(2)} s`;
  el.suiteMeta.textContent = `${passCount} / ${results.length} tests finished`;
  el.suiteBody.innerHTML = results.map((row) => `
    <tr>
      <td>${row.name}</td>
      <td>${row.rc}</td>
      <td class="${row.rc === 0 ? "good-cell" : "bad-cell"}">${row.rc === 0 ? "PASS" : "FAIL"}</td>
      <td>${row.detail}</td>
    </tr>
  `).join("");

  const allPassed = failCount === 0;
  setSuiteBanner(allPassed ? "pass" : "fail", allPassed ? "Native suite passed" : "Native suite found failures", `${passCount} passed, ${failCount} failed.`);
}

function captureModuleOutput() {
  state.testLog = [];
  return {
    print(text) {
      state.testLog.push(String(text));
      renderSuiteLog();
    },
    printErr(text) {
      state.testLog.push(String(text));
      renderSuiteLog();
    }
  };
}

function syncSnrAdvancedState() {
  const adv = !!el.snrAdvanced.checked;
  [el.snrDataBlocks, el.snrWindow, el.snrMaxIters, el.snrM, el.snrT, el.snrPrim].forEach((node) => {
    node.disabled = !adv;
  });
}

function applyPresetFields() {
  const preset = PRESETS[el.snrPreset.selectedIndex];
  if (!preset || el.snrAdvanced.checked) return;
  el.snrDataBlocks.value = String(preset.dataBlocks);
  el.snrWindow.value = String(preset.windowSize);
  el.snrMaxIters.value = String(preset.maxIters);
  el.snrM.value = String(preset.m);
  el.snrT.value = String(preset.t);
  el.snrPrim.value = preset.prim;
  el.snrStart.value = String(preset.startDb);
  el.snrEnd.value = String(preset.endDb);
  el.snrStep.value = String(preset.stepDb);
}

async function loadModules() {
  const wasmMod = await import(`./assets/staircase.js${BUILD_QUERY}`);
  const testsWasmMod = await import(`./assets/staircase_tests.js${BUILD_QUERY}`);
  const capture = captureModuleOutput();
  const modFactory = wasmMod.default || wasmMod.StaircaseModule;
  const testsFactory = testsWasmMod.default || testsWasmMod.StaircaseTestsModule;
  state.mod = await modFactory({
    print() {},
    printErr() {}
  });
  state.testsMod = await testsFactory(capture);
}

async function runNativeSuite() {
  if (!state.testsMod || state.suiteRunning) return;
  state.suiteRunning = true;
  setActiveTab("suite");
  state.testLog = [];
  renderSuiteLog();
  setSuiteBanner("running", "Suite running", "Executing the staircase native tests in WASM.");
  updateSuiteProgress(0, 2, "Starting staircase native suite...");
  el.runSuiteBtn.disabled = true;

  const started = performance.now();
  const cases = [
    { name: "test_staircase_encode", fn: () => state.testsMod._sct_run_test_staircase_encode() },
    { name: "test_staircase_decode", fn: () => state.testsMod._sct_run_test_staircase_decode() }
  ];

  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    updateSuiteProgress(i, cases.length, `Running ${item.name}...`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rc = item.fn();
    const raw = stripAnsi(state.testLog.join("\n"));
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    const detail = lines[lines.length - 1] || (rc === 0 ? "PASS" : "FAIL");
    results.push({ name: item.name, rc, detail });
  }

  const durationMs = performance.now() - started;
  updateSuiteProgress(cases.length, cases.length, "Suite complete.");
  updateSuiteUI(results, durationMs);
  renderDecodeCards(parseDecodeLog(state.testLog.join("\n")));
  state.suiteRunning = false;
  el.runSuiteBtn.disabled = false;
}

function fillRandomBits(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.random() < 0.5 ? 0 : 1;
  }
}

async function applySnrConfig() {
  if (!state.mod) return;
  const dataBlocks = Number.parseInt(el.snrDataBlocks.value, 10);
  const windowSize = Number.parseInt(el.snrWindow.value, 10);
  const maxIters = Number.parseInt(el.snrMaxIters.value, 10);
  const m = Number.parseInt(el.snrM.value, 10);
  const t = Number.parseInt(el.snrT.value, 10);
  const prim = parsePrim(el.snrPrim.value);
  if (![dataBlocks, windowSize, maxIters, m, t, prim].every(Number.isInteger)) {
    throw new Error("Invalid staircase sweep config.");
  }
  const rc = state.mod._sw_init(m, prim, t, dataBlocks);
  if (rc !== 0) {
    throw new Error("Invalid staircase configuration for sweep.");
  }
  state.snrCfg = {
    dataBlocks,
    windowSize,
    maxIters,
    m,
    t,
    prim,
    componentN: state.mod._sw_get_component_n(),
    componentK: state.mod._sw_get_component_k(),
    blockSize: state.mod._sw_get_block_size(),
    infoCols: state.mod._sw_get_info_cols(),
    totalBlocks: state.mod._sw_get_total_blocks(),
    msgBits: state.mod._sw_get_msg_bits(),
    stateBits: state.mod._sw_get_state_bits(),
    storedBits: state.mod._sw_get_stored_bits()
  };
  el.snrCfgMeta.textContent = `short BCH(${state.snrCfg.componentN},${state.snrCfg.componentK},${t}) • ${state.snrCfg.dataBlocks} data blocks • window=${windowSize} • max_iters=${maxIters}`;
  setWarning(el.snrWarning, warningForScene(state.snrCfg));
  state.snrResults = [];
  renderSnrSummary();
}

async function runSnrSweep() {
  if (!state.mod || !state.snrCfg || state.sweepRunning) return;
  state.sweepRunning = true;
  el.runSnrBtn.disabled = true;
  setActiveTab("snr");

  const start = Number.parseFloat(el.snrStart.value);
  const end = Number.parseFloat(el.snrEnd.value);
  const step = Number.parseFloat(el.snrStep.value);
  const frames = Number.parseInt(el.snrFrames.value, 10);
  const snrPoints = buildSnrPoints(start, end, step);
  const cfg = state.snrCfg;
  const rate = cfg.msgBits / cfg.storedBits;
  state.snrResults = [];
  renderSnrSummary();

  const msg = new Uint8Array(cfg.msgBits);
  const stateBuf = new Uint8Array(cfg.stateBits);
  const stored = new Uint8Array(cfg.storedBits);
  const noisyStored = new Uint8Array(cfg.storedBits);
  const decodedStored = new Uint8Array(cfg.storedBits);

  const msgPtr = mallocU8(state.mod, cfg.msgBits);
  const statePtr = mallocU8(state.mod, cfg.stateBits);
  const storedPtr = mallocU8(state.mod, cfg.storedBits);
  const noisyStoredPtr = mallocU8(state.mod, cfg.storedBits);
  const decodedStoredPtr = mallocU8(state.mod, cfg.storedBits);
  try {
    for (let pointIdx = 0; pointIdx < snrPoints.length; pointIdx++) {
      const snrDb = snrPoints[pointIdx];
      const snrLinear = Math.pow(10, snrDb / 10);
      const sigma = Math.sqrt(1 / (2 * rate * snrLinear));
      let rawErrors = 0;
      let decodedErrors = 0;
      let successFrames = 0;

      for (let frame = 0; frame < frames; frame++) {
        fillRandomBits(msg);
        state.mod.HEAPU8.set(msg, msgPtr);
        const encRc = state.mod._sw_encode(msgPtr, cfg.msgBits, statePtr, cfg.stateBits);
        if (encRc !== 0) {
          throw new Error(`sw_encode failed during sweep at ${snrDb.toFixed(1)} dB`);
        }

        state.mod._sw_extract_stored(statePtr, cfg.stateBits, storedPtr, cfg.storedBits);
        stored.set(readU8(state.mod, storedPtr, cfg.storedBits));

        for (let i = 0; i < cfg.storedBits; i++) {
          const tx = stored[i] === 0 ? 1 : -1;
          const noisy = tx + sigma * randn();
          noisyStored[i] = noisy < 0 ? 1 : 0;
          if (noisyStored[i] !== stored[i]) rawErrors++;
        }

        state.mod.HEAPU8.set(noisyStored, noisyStoredPtr);
        state.mod._sw_import_stored(noisyStoredPtr, cfg.storedBits, statePtr, cfg.stateBits);
        state.mod._sw_decode(statePtr, cfg.stateBits, cfg.windowSize, cfg.maxIters);
        state.mod._sw_extract_stored(statePtr, cfg.stateBits, decodedStoredPtr, cfg.storedBits);
        decodedStored.set(readU8(state.mod, decodedStoredPtr, cfg.storedBits));

        let frameMatches = true;
        for (let i = 0; i < cfg.storedBits; i++) {
          if (decodedStored[i] !== stored[i]) {
            decodedErrors++;
            frameMatches = false;
          }
        }
        if (frameMatches) successFrames++;

        if ((frame & 7) === 0) {
          el.snrProgress.textContent = `Sweeping ${snrDb.toFixed(1)} dB: frame ${frame + 1}/${frames} (${pointIdx + 1}/${snrPoints.length} points).`;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      state.snrResults.push({
        snrDb,
        rawBer: rawErrors / (cfg.storedBits * frames),
        decodedBer: decodedErrors / (cfg.storedBits * frames),
        successRate: successFrames / frames,
        frames
      });
      renderSnrSummary();
      el.snrProgress.textContent = `Completed ${pointIdx + 1}/${snrPoints.length} SNR points. Latest ${snrDb.toFixed(1)} dB, frame success ${formatPct(successFrames / frames)}.`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    el.snrProgress.textContent = `Sweep complete across ${snrPoints.length} points and ${frames} frames/point.`;
  } finally {
    freeAll(state.mod, [msgPtr, statePtr, storedPtr, noisyStoredPtr, decodedStoredPtr]);
    state.sweepRunning = false;
    el.runSnrBtn.disabled = false;
  }
}

function bindEvents() {
  for (const button of el.tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }
  el.runSuiteBtn.addEventListener("click", runNativeSuite);
  el.snrPreset.addEventListener("change", applyPresetFields);
  el.snrAdvanced.addEventListener("change", () => {
    syncSnrAdvancedState();
    applyPresetFields();
  });
  el.applySnrCfg.addEventListener("click", async () => {
    try {
      await applySnrConfig();
    } catch (err) {
      setWarning(el.snrWarning, err.message);
    }
  });
  el.runSnrBtn.addEventListener("click", async () => {
    try {
      if (!state.snrCfg) await applySnrConfig();
      await runSnrSweep();
    } catch (err) {
      console.error(err);
      setWarning(el.snrWarning, err.message);
      state.sweepRunning = false;
      el.runSnrBtn.disabled = false;
    }
  });
}

async function init() {
  try {
    PRESETS.forEach((preset) => {
      const opt = document.createElement("option");
      opt.textContent = preset.name;
      el.snrPreset.appendChild(opt);
    });
    bindEvents();
    syncSnrAdvancedState();
    applyPresetFields();
    await loadModules();
    await applySnrConfig();
    setStatus("Staircase verification lab ready.");
    renderSnrSummary();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load staircase-code assets.");
    setWarning(el.snrWarning, "Build assets first with `make site-build` so site/assets/staircase*.js exist.");
  }
}

init();
