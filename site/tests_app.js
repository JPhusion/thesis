const PRESETS = [
  { name: "BCH(7,4,1)", m: 3, t: 1, prim: "0b1011" },
  { name: "BCH(15,7,2)", m: 4, t: 2, prim: "0b10011" },
  { name: "BCH(31,21,2)", m: 5, t: 2, prim: "0b100101" },
  { name: "BCH(31,16,3)", m: 5, t: 3, prim: "0b100101" },
  { name: "BCH(63,51,2)", m: 6, t: 2, prim: "0b1000011" },
  { name: "BCH(255,231,3)", m: 8, t: 3, prim: "0x11d" },
  { name: "BCH(511,484,3)", m: 9, t: 3, prim: "0x211" }
];

const BUILD_QUERY = new URL(import.meta.url).search;

const SERIES_COLORS = {
  raw: "#d96c54",
  decoded: "#0f8b73",
  success: "#b9851b"
};

const el = {
  status: document.getElementById("testStatus"),
  suiteTabBtn: document.getElementById("suiteTabBtn"),
  snrTabBtn: document.getElementById("snrTabBtn"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")],
  runParityBtn: document.getElementById("runParityBtn"),
  suiteBanner: document.getElementById("suiteBanner"),
  suiteBadge: document.getElementById("suiteBadge"),
  suiteHeadline: document.getElementById("suiteHeadline"),
  suiteProgressLabel: document.getElementById("suiteProgressLabel"),
  suiteProgressPct: document.getElementById("suiteProgressPct"),
  suiteProgressFill: document.getElementById("suiteProgressFill"),
  parityTotal: document.getElementById("parityTotal"),
  parityPass: document.getElementById("parityPass"),
  parityFail: document.getElementById("parityFail"),
  parityDuration: document.getElementById("parityDuration"),
  paritySummary: document.getElementById("paritySummary"),
  parityMeta: document.getElementById("parityMeta"),
  parityConfigBody: document.getElementById("parityConfigBody"),
  decodeConfigCards: document.getElementById("decodeConfigCards"),
  suiteLog: document.getElementById("suiteLog"),

  snrPreset: document.getElementById("snrPreset"),
  snrAdvanced: document.getElementById("snrAdvanced"),
  snrM: document.getElementById("snrM"),
  snrT: document.getElementById("snrT"),
  snrPrim: document.getElementById("snrPrim"),
  applySNRConfigBtn: document.getElementById("applySNRConfigBtn"),
  runSNRBtn: document.getElementById("runSNRBtn"),
  snrCfgMeta: document.getElementById("snrCfgMeta"),
  snrWarning: document.getElementById("snrWarning"),
  snrStart: document.getElementById("snrStart"),
  snrEnd: document.getElementById("snrEnd"),
  snrStep: document.getElementById("snrStep"),
  snrFrames: document.getElementById("snrFrames"),
  snrProgress: document.getElementById("snrProgress"),
  snrPointCount: document.getElementById("snrPointCount"),
  snrFrameCount: document.getElementById("snrFrameCount"),
  snrBestSuccess: document.getElementById("snrBestSuccess"),
  snrWorstRaw: document.getElementById("snrWorstRaw"),
  snrTableBody: document.getElementById("snrTableBody"),
  berChart: document.getElementById("berChart"),
  frameChart: document.getElementById("frameChart")
};

const state = {
  mod: null,
  testsMod: null,
  testLog: [],
  snrCfg: null,
  snrResults: [],
  activeTab: "suite",
  parityRunning: false,
  sweepRunning: false
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

function warningForM(m) {
  if (m > 8) {
    return "Huge warning: m > 8 can generate very heavy browser workloads. Use this only when you know the runtime cost.";
  }
  if (m > 6) {
    return "Warning: m > 6 may slow the Monte Carlo sweep. Computation remains exact.";
  }
  return "";
}

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

function bitsLsbToMsb(arr) {
  return [...arr].reverse().map((bit) => (bit ? "1" : "0")).join("");
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

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
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
  const safeTotal = Math.max(total, 1);
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
  el.paritySummary.textContent = detail;
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
  const xStep = xValues.length > 1
    ? Math.min(...xValues.slice(1).map((value, idx) => Math.abs(value - xValues[idx])).filter((value) => value > 0))
    : 1;

  let yMin;
  let yMax;

  if (options.logY) {
    const positives = allPoints.map((p) => p.y).filter((v) => v > 0);
    const minPositive = positives.length ? Math.min(...positives) : 1e-6;
    yMin = Math.pow(10, Math.floor(Math.log10(Math.min(minPositive, 1e-4))));
    yMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...positives, 1e-2))));
    if (yMax <= yMin) {
      yMax = yMin * 10;
    }
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
  const xTickDigits = xStep >= 1 ? 0 : xStep >= 0.1 ? 1 : xStep >= 0.01 ? 2 : 3;
  for (const x of xTickValues) {
    ctx.fillText(x.toFixed(xTickDigits), mapX(x), margin.top + plotH + 8);
  }

  for (const line of series) {
    if (!line.points.length) continue;
    ctx.strokeStyle = line.color;
    ctx.fillStyle = line.color;
    ctx.lineWidth = 2.6;
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
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#28445c";
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText(options.xLabel, margin.left + plotW / 2, height - 8);

  ctx.save();
  ctx.translate(14, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(options.yLabel, 0, 0);
  ctx.restore();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function summarizeSimpleTest(text, rc) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let summaryLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("[OK]") || lines[i].startsWith("[FAIL]")) {
      summaryLine = lines[i];
      break;
    }
  }
  if (!summaryLine) {
    return rc === 0 ? "Completed without a summary line." : "Failed without a parsed summary line.";
  }
  return summaryLine.replace(/^\[(OK|FAIL)\]\s*/, "");
}

function parseDecodeOutput(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const configs = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cfgMatch = line.match(/^(BCH\([^)]+\))\s+m=(\d+)\s+t=(\d+)\s+n=(\d+)\s+k=(\d+)\s+dg=(\d+)\s+poly=0x([0-9a-f]+)$/i);
    if (cfgMatch) {
      current = {
        name: cfgMatch[1],
        m: Number(cfgMatch[2]),
        t: Number(cfgMatch[3]),
        n: Number(cfgMatch[4]),
        k: Number(cfgMatch[5]),
        dg: Number(cfgMatch[6]),
        polyHex: cfgMatch[7].toLowerCase(),
        messagesTested: 0,
        messagesTotal: 0,
        messageMode: "",
        sections: [],
        diagnostic: null,
        status: "UNKNOWN"
      };
      configs.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const messagesMatch = line.match(/^Messages tested:\s+(\d+)\/(\d+)\s+\(([^)]+)\)$/);
    if (messagesMatch) {
      current.messagesTested = Number(messagesMatch[1]);
      current.messagesTotal = Number(messagesMatch[2]);
      current.messageMode = messagesMatch[3];
      continue;
    }

    const sectionMatch = line.match(/^(Systematic mapping|\d+-bit errors)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (sectionMatch) {
      current.sections.push({
        label: sectionMatch[1],
        total: Number(sectionMatch[2]),
        pass: Number(sectionMatch[3]),
        fail: Number(sectionMatch[4])
      });
      continue;
    }

    const diagHeaderMatch = line.match(/^Diagnostic \(non-gating\) for (\d+)-bit errors$/);
    if (diagHeaderMatch) {
      const nextLine = lines[i + 1] ?? "";
      const diagValueMatch = nextLine.match(/^total=(\d+)\s+rc!=0=(\d+)\s+corrected_to_original=(\d+)\s+miscorrected=(\d+)$/);
      if (diagValueMatch) {
        current.diagnostic = {
          errors: Number(diagHeaderMatch[1]),
          total: Number(diagValueMatch[1]),
          rcFail: Number(diagValueMatch[2]),
          corrected: Number(diagValueMatch[3]),
          miscorrected: Number(diagValueMatch[4])
        };
        i += 1;
      }
      continue;
    }

    const statusMatch = line.match(/^(PASS|FAIL)\s+(BCH\([^)]+\))/);
    if (statusMatch && statusMatch[2] === current.name) {
      current.status = statusMatch[1];
    }
  }

  return configs;
}

function renderSuiteRows(rows) {
  if (!rows.length) {
    el.parityConfigBody.innerHTML = `<tr><td colspan="4" class="empty-cell">No browser suite run yet.</td></tr>`;
    return;
  }

  el.parityConfigBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.rc}</td>
      <td class="${row.status === "PASS" ? "good-cell" : row.status === "FAIL" ? "bad-cell" : ""}">${row.status}</td>
      <td>${escapeHtml(row.detail)}</td>
    </tr>
  `).join("");
}

function renderDecodeConfigCards(configs) {
  if (!configs.length) {
    el.decodeConfigCards.innerHTML = `<div class="empty-cell">No decode breakdown yet.</div>`;
    return;
  }

  el.decodeConfigCards.innerHTML = configs.map((cfg) => {
    const diag = cfg.diagnostic ?? {
      errors: 0,
      total: 0,
      rcFail: 0,
      corrected: 0,
      miscorrected: 0
    };

    const sectionRows = cfg.sections.map((section) => `
      <tr>
        <td>${escapeHtml(section.label)}</td>
        <td>${formatCount(section.total)}</td>
        <td class="${section.fail === 0 ? "good-cell" : ""}">${formatCount(section.pass)}</td>
        <td class="${section.fail === 0 ? "" : "bad-cell"}">${formatCount(section.fail)}</td>
      </tr>
    `).join("");

    return `
      <article class="decode-config-card">
        <div class="decode-config-head">
          <div>
            <h3>${escapeHtml(cfg.name)}</h3>
            <div class="decode-config-meta">n=${cfg.n}  k=${cfg.k}  dg=${cfg.dg}  m=${cfg.m}  t=${cfg.t}  poly=0x${cfg.polyHex}</div>
          </div>
          <span class="suite-badge ${cfg.status === "PASS" ? "pass" : cfg.status === "FAIL" ? "fail" : "idle"}">${cfg.status}</span>
        </div>

        <div class="decode-topline">
          <div class="decode-top-item">
            <span>Messages Tested</span>
            <strong>${formatCount(cfg.messagesTested)} / ${formatCount(cfg.messagesTotal)}</strong>
            <small>${escapeHtml(cfg.messageMode)}</small>
          </div>
          <div class="decode-top-item">
            <span>Diagnostic Window</span>
            <strong>${diag.errors}-bit errors</strong>
            <small>non-gating</small>
          </div>
        </div>

        <div class="table-scroll">
          <table class="results-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Total</th>
                <th>Pass</th>
                <th>Fail</th>
              </tr>
            </thead>
            <tbody>
              ${sectionRows}
            </tbody>
          </table>
        </div>

        <div class="diag-grid">
          <div class="diag-card">
            <span>Total Cases</span>
            <strong>${formatCount(diag.total)}</strong>
          </div>
          <div class="diag-card">
            <span>rc != 0</span>
            <strong>${formatCount(diag.rcFail)}</strong>
          </div>
          <div class="diag-card">
            <span>Corrected To Original</span>
            <strong>${formatCount(diag.corrected)}</strong>
          </div>
          <div class="diag-card">
            <span>Miscorrected</span>
            <strong>${formatCount(diag.miscorrected)}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderSuiteSnapshot(result) {
  el.parityTotal.textContent = String(result.total);
  el.parityPass.textContent = String(result.pass);
  el.parityFail.textContent = String(result.fail);
  el.parityDuration.textContent = result.durationMs > 0 ? `${result.durationMs.toFixed(0)} ms` : "-";
  el.parityMeta.textContent = `${result.suiteRows.length} / ${result.total} tests finished`;
  renderSuiteRows(result.suiteRows);
  renderDecodeConfigCards(result.decodeConfigs);
  renderSuiteLog();
}

function renderParitySummary(result) {
  renderSuiteSnapshot(result);
  updateSuiteProgress(result.suiteRows.length, result.total, "Run complete.");
  if (result.fail === 0) {
    setSuiteBanner("pass", "Native suite passed", "The exact make test browser run completed successfully.");
  } else {
    setSuiteBanner("fail", "Native suite failed", `There ${result.fail === 1 ? "was" : "were"} ${result.fail} failing browser test${result.fail === 1 ? "" : "s"}.`);
  }
  el.parityDuration.textContent = `${result.durationMs.toFixed(0)} ms`;
}

function renderSweepSummary() {
  const rows = state.snrResults;
  if (!rows.length) {
    el.snrPointCount.textContent = "-";
    el.snrFrameCount.textContent = "-";
    el.snrBestSuccess.textContent = "-";
    el.snrWorstRaw.textContent = "-";
    el.snrTableBody.innerHTML = `<tr><td colspan="5" class="empty-cell">No sweep run yet.</td></tr>`;
    drawEmptyChart(el.berChart, "Run an SNR sweep to plot BER.");
    drawEmptyChart(el.frameChart, "Run an SNR sweep to plot frame success.");
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
      <td class="${row.successRate > 0.8 ? "good-cell" : ""}">${formatPct(row.successRate)}</td>
      <td>${row.frames}</td>
    </tr>
  `).join("");

  drawLineChart(el.berChart, [
    { color: SERIES_COLORS.raw, points: rows.map((row) => ({ x: row.snrDb, y: row.rawBer })) },
    { color: SERIES_COLORS.decoded, points: rows.map((row) => ({ x: row.snrDb, y: row.decodedBer })) }
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

function toggleAdvancedFields() {
  const adv = el.snrAdvanced.checked;
  el.snrM.disabled = !adv;
  el.snrT.disabled = !adv;
  el.snrPrim.disabled = !adv;
}

function applyPresetFields() {
  const preset = PRESETS[el.snrPreset.selectedIndex];
  if (!preset || el.snrAdvanced.checked) return;
  el.snrM.value = String(preset.m);
  el.snrT.value = String(preset.t);
  el.snrPrim.value = preset.prim;
}

function initPresetUi() {
  el.snrPreset.innerHTML = PRESETS.map((preset) => `<option>${preset.name}</option>`).join("");
  el.snrPreset.value = PRESETS[1].name;
  applyPresetFields();
  toggleAdvancedFields();
}

function ensureModuleReady() {
  if (!state.mod) {
    throw new Error("WASM module not loaded yet.");
  }
}

function ensureTestsModuleReady() {
  if (!state.testsMod) {
    throw new Error("Browser test module not loaded yet.");
  }
}

async function nextFrame() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function loadWasmModule() {
  const wasmMod = await import(`./assets/bch.js${BUILD_QUERY}`);
  const factory = wasmMod.default || wasmMod.BCHModule;
  if (!factory) {
    throw new Error("No BCHModule export found.");
  }
  state.mod = await factory();
}

async function loadTestsModule() {
  const wasmMod = await import(`./assets/bch_tests.js${BUILD_QUERY}`);
  const factory = wasmMod.default || wasmMod.BCHTestsModule;
  if (!factory) {
    throw new Error("No BCHTestsModule export found.");
  }
  state.testsMod = await factory({
    print: (line) => {
      state.testLog.push(String(line));
      renderSuiteLog();
    },
    printErr: (line) => {
      state.testLog.push(String(line));
      renderSuiteLog();
    }
  });
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGaussian(rng) {
  return function gaussian() {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}

function buildSnrPoints(start, end, step) {
  const points = [];
  const dir = end >= start ? 1 : -1;
  const safeStep = Math.abs(step) * dir;
  if (safeStep === 0) return points;

  for (let value = start; dir > 0 ? value <= end + 1e-9 : value >= end - 1e-9; value += safeStep) {
    points.push(Number(value.toFixed(3)));
  }
  return points;
}

function randomBits(len, rng) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = rng() >= 0.5 ? 1 : 0;
  }
  return out;
}

function countBitErrors(a, b) {
  let errs = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) errs++;
  }
  return errs;
}

function bpskModulateBit(bit) {
  return bit ? -1 : 1;
}

function addAwgn(symbol, sigma, gaussian) {
  return symbol + sigma * gaussian();
}

function hardDemodulateBpsk(sample) {
  return sample < 0 ? 1 : 0;
}

function applySNRConfig() {
  ensureModuleReady();

  const m = Number.parseInt(el.snrM.value, 10);
  const t = Number.parseInt(el.snrT.value, 10);
  const prim = parsePrim(el.snrPrim.value);

  if (!Number.isInteger(m) || !Number.isInteger(t) || !Number.isInteger(prim)) {
    throw new Error("Invalid SNR config values.");
  }

  if (m > 8) {
    const ok = window.confirm("m > 8 can be very slow in browser sweeps. Continue only if you know what you are doing.");
    if (!ok) {
      throw new Error("Config apply cancelled.");
    }
  }

  const rc = state.mod._bchw_init(m, prim >>> 0, t);
  if (rc !== 0) {
    throw new Error("bchw_init failed. Check m, t, and primitive polynomial.");
  }

  state.snrCfg = {
    m,
    t,
    prim: prim >>> 0,
    n: state.mod._bchw_get_n(),
    k: state.mod._bchw_get_k(),
    dg: state.mod._bchw_get_dg()
  };

  el.snrCfgMeta.textContent = `n=${state.snrCfg.n}  k=${state.snrCfg.k}  dg=${state.snrCfg.dg}  m=${m}  t=${t}  poly=0x${state.snrCfg.prim.toString(16)}`;
  setWarning(el.snrWarning, warningForM(m));
  setStatus("SNR config ready.");
  state.snrResults = [];
  renderSweepSummary();
}

async function runParitySuite() {
  ensureTestsModuleReady();
  if (state.parityRunning) return;

  state.parityRunning = true;
  el.runParityBtn.disabled = true;
  setActiveTab("suite");
  const started = performance.now();

  const summary = {
    total: 3,
    pass: 0,
    fail: 0,
    durationMs: 0,
    suiteRows: [],
    decodeConfigs: [],
    rawLog: ""
  };
  const tests = [
    { name: "test_gf", symbol: "_bcht_run_test_gf" },
    { name: "test_encode", symbol: "_bcht_run_test_encode" },
    { name: "test_decode", symbol: "_bcht_run_test_decode" }
  ];

  try {
    state.testLog.length = 0;
    renderSuiteLog();
    setSuiteBanner("running", "Running native suite", "Executing the browser WASM build of test_gf, test_encode, and test_decode.");
    updateSuiteProgress(0, tests.length, "Preparing test run...");
    renderSuiteSnapshot(summary);
    await nextFrame();

    for (const test of tests) {
      const startLine = state.testLog.length;
      updateSuiteProgress(summary.suiteRows.length, tests.length, `Running ${test.name}...`);
      setSuiteBanner("running", "Running native suite", `${test.name} is executing in browser WASM. The decode stage can take a few seconds.`);
      renderSuiteSnapshot(summary);
      await nextFrame();

      const fn = state.testsMod[test.symbol];
      if (typeof fn !== "function") {
        throw new Error(`Missing exported test function ${test.symbol}`);
      }
      const rc = fn();
      const text = stripAnsi(state.testLog.slice(startLine).join("\n")).trim();
      const status = rc === 0 ? "PASS" : "FAIL";
      const decodeConfigs = test.name === "test_decode" ? parseDecodeOutput(text) : [];
      const detail = test.name === "test_decode"
        ? `${decodeConfigs.length} parameter sets parsed from native output`
        : summarizeSimpleTest(text, rc);

      if (status === "PASS") summary.pass++;
      else summary.fail++;

      summary.suiteRows.push({
        name: test.name,
        rc,
        status,
        detail
      });

      if (test.name === "test_decode") {
        summary.decodeConfigs = decodeConfigs;
      }

      summary.durationMs = performance.now() - started;
      updateSuiteProgress(summary.suiteRows.length, tests.length, `${test.name} finished.`);
      renderSuiteSnapshot(summary);
      await nextFrame();
    }
  } finally {
    summary.durationMs = performance.now() - started;
    summary.rawLog = stripAnsi(state.testLog.join("\n")).trim();
    renderParitySummary(summary);
    state.parityRunning = false;
    el.runParityBtn.disabled = false;
  }
}

async function runSNRSweep() {
  ensureModuleReady();
  if (!state.snrCfg) {
    applySNRConfig();
  }
  if (!state.snrCfg || state.sweepRunning) return;
  setActiveTab("snr");

  const start = Number.parseFloat(el.snrStart.value);
  const end = Number.parseFloat(el.snrEnd.value);
  const step = Number.parseFloat(el.snrStep.value);
  const frames = Number.parseInt(el.snrFrames.value, 10);

  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || !Number.isInteger(frames) || frames <= 0) {
    throw new Error("Invalid sweep parameters.");
  }

  const snrPoints = buildSnrPoints(start, end, step);
  if (!snrPoints.length) {
    throw new Error("Sweep produced no SNR points.");
  }

  state.sweepRunning = true;
  el.runSNRBtn.disabled = true;
  el.applySNRConfigBtn.disabled = true;
  state.snrResults = [];
  renderSweepSummary();

  const cfg = state.snrCfg;
  const initRc = state.mod._bchw_init(cfg.m, cfg.prim >>> 0, cfg.t);
  if (initRc !== 0) {
    throw new Error("Failed to apply the selected sweep config.");
  }
  state.snrCfg = {
    ...cfg,
    n: state.mod._bchw_get_n(),
    k: state.mod._bchw_get_k(),
    dg: state.mod._bchw_get_dg()
  };
  const activeCfg = state.snrCfg;
  const rate = activeCfg.k / activeCfg.n;
  const rng = mulberry32((Date.now() ^ (activeCfg.n << 8) ^ activeCfg.t) >>> 0);
  const gaussian = makeGaussian(rng);

  const msgPtr = mallocU8(state.mod, activeCfg.k);
  const cwPtr = mallocU8(state.mod, activeCfg.n);
  const rxPtr = mallocU8(state.mod, activeCfg.n);
  const errsPtr = state.mod._malloc(4);

  try {
    for (let pointIdx = 0; pointIdx < snrPoints.length; pointIdx++) {
      const snrDb = snrPoints[pointIdx];
      const snrLinear = Math.pow(10, snrDb / 10);
      const sigma = Math.sqrt(1 / (2 * rate * snrLinear));
      let rawErrs = 0;
      let decodedErrs = 0;
      let successFrames = 0;

      for (let frame = 0; frame < frames; frame++) {
        const msg = randomBits(activeCfg.k, rng);
        state.mod.HEAPU8.set(msg, msgPtr);

        const rcEnc = state.mod._bchw_encode(msgPtr, activeCfg.k, cwPtr, activeCfg.n);
        if (rcEnc !== 0) {
          throw new Error(`bchw_encode failed during sweep at ${snrDb.toFixed(1)} dB`);
        }

        const cw = readU8(state.mod, cwPtr, activeCfg.n);
        const rx = new Uint8Array(activeCfg.n);

        for (let bit = 0; bit < activeCfg.n; bit++) {
          const symbol = bpskModulateBit(cw[bit]);
          const noisy = addAwgn(symbol, sigma, gaussian);
          rx[bit] = hardDemodulateBpsk(noisy);
          if (rx[bit] !== cw[bit]) rawErrs++;
        }

        state.mod.HEAPU8.set(rx, rxPtr);
        state.mod._bchw_decode(rxPtr, activeCfg.n, errsPtr);

        const corrected = readU8(state.mod, rxPtr, activeCfg.n);
        const frameErrs = countBitErrors(corrected, cw);
        decodedErrs += frameErrs;
        if (frameErrs === 0) {
          successFrames++;
        }

        if (frame % 16 === 15) {
          el.snrProgress.textContent = `Sweeping ${snrDb.toFixed(1)} dB: frame ${frame + 1}/${frames} (${pointIdx + 1}/${snrPoints.length} points).`;
          await nextFrame();
        }
      }

      state.snrResults.push({
        snrDb,
        rawBer: rawErrs / (activeCfg.n * frames),
        decodedBer: decodedErrs / (activeCfg.n * frames),
        successRate: successFrames / frames,
        frames
      });

      renderSweepSummary();
      el.snrProgress.textContent = `Completed ${pointIdx + 1}/${snrPoints.length} SNR points. Latest ${snrDb.toFixed(1)} dB, frame success ${formatPct(successFrames / frames)}.`;
      await nextFrame();
    }

    el.snrProgress.textContent = `Sweep complete across ${snrPoints.length} points and ${frames} frames/point.`;
  } finally {
    freeAll(state.mod, [msgPtr, cwPtr, rxPtr, errsPtr]);
    state.sweepRunning = false;
    el.runSNRBtn.disabled = false;
    el.applySNRConfigBtn.disabled = false;
  }
}

function bindEvents() {
  for (const button of el.tabButtons) {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  }

  el.snrPreset.addEventListener("change", applyPresetFields);
  el.snrAdvanced.addEventListener("change", () => {
    toggleAdvancedFields();
    applyPresetFields();
  });

  el.applySNRConfigBtn.addEventListener("click", () => {
    try {
      applySNRConfig();
    } catch (err) {
      setStatus(`Config error: ${err.message}`);
    }
  });

  el.runParityBtn.addEventListener("click", () => {
    runParitySuite().catch((err) => {
      setStatus(`Suite error: ${err.message}`);
    });
  });

  el.runSNRBtn.addEventListener("click", () => {
    runSNRSweep().catch((err) => {
      setStatus(`Sweep error: ${err.message}`);
      state.sweepRunning = false;
      el.runSNRBtn.disabled = false;
      el.applySNRConfigBtn.disabled = false;
    });
  });
}

async function main() {
  setActiveTab("suite");
  initPresetUi();
  bindEvents();
  setSuiteBanner("idle", "Native suite ready", "Run the browser suite to execute the same tests as make test in bch.");
  updateSuiteProgress(0, 3, "Awaiting run.");
  renderSuiteSnapshot({
    total: 3,
    pass: 0,
    fail: 0,
    durationMs: 0,
    suiteRows: [],
    decodeConfigs: []
  });
  renderSuiteLog();
  renderSweepSummary();

  try {
    await Promise.all([loadWasmModule(), loadTestsModule()]);
    setStatus("WASM core and browser test suite loaded.");
    applySNRConfig();
  } catch (err) {
    setStatus(`Load error: ${err.message}`);
    drawEmptyChart(el.berChart, "WASM modules failed to load.");
    drawEmptyChart(el.frameChart, "WASM modules failed to load.");
  }
}

main();
