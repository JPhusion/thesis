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
    name: "PC[BCH(255,231,3) x BCH(255,231,3)]",
    row: { m: 8, t: 3, prim: "0x11d" },
    col: { m: 8, t: 3, prim: "0x11d" },
    maxIters: 4
  },
  {
    name: "PC[BCH(511,484,3) x BCH(511,484,3)]",
    row: { m: 9, t: 3, prim: "0x211" },
    col: { m: 9, t: 3, prim: "0x211" },
    maxIters: 4
  }
];

const BUILD_QUERY = new URL(import.meta.url).search;

const SERIES_COLORS = {
  raw: "#d96c54",
  decoded: "#0f8b73",
  success: "#b9851b"
};

const el = {
  status: document.getElementById("productTestStatus"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")],

  runSuiteBtn: document.getElementById("runProductSuiteBtn"),
  suiteBanner: document.getElementById("productSuiteBanner"),
  suiteBadge: document.getElementById("productSuiteBadge"),
  suiteHeadline: document.getElementById("productSuiteHeadline"),
  suiteSummary: document.getElementById("productSuiteSummary"),
  suiteProgressLabel: document.getElementById("productSuiteProgressLabel"),
  suiteProgressPct: document.getElementById("productSuiteProgressPct"),
  suiteProgressFill: document.getElementById("productSuiteProgressFill"),
  suiteTotal: document.getElementById("productSuiteTotal"),
  suitePass: document.getElementById("productSuitePass"),
  suiteFail: document.getElementById("productSuiteFail"),
  suiteDuration: document.getElementById("productSuiteDuration"),
  suiteMeta: document.getElementById("productSuiteMeta"),
  suiteBody: document.getElementById("productSuiteBody"),
  decodeCards: document.getElementById("productDecodeCards"),
  suiteLog: document.getElementById("productSuiteLog"),

  snrPreset: document.getElementById("productSnrPreset"),
  snrAdvanced: document.getElementById("productSnrAdvanced"),
  snrMaxIters: document.getElementById("productSnrMaxIters"),
  snrRowM: document.getElementById("productSnrRowM"),
  snrRowT: document.getElementById("productSnrRowT"),
  snrRowPrim: document.getElementById("productSnrRowPrim"),
  snrColM: document.getElementById("productSnrColM"),
  snrColT: document.getElementById("productSnrColT"),
  snrColPrim: document.getElementById("productSnrColPrim"),
  applySnrCfg: document.getElementById("applyProductSnrCfg"),
  runSnrBtn: document.getElementById("runProductSnrBtn"),
  snrCfgMeta: document.getElementById("productSnrCfgMeta"),
  snrWarning: document.getElementById("productSnrWarning"),
  snrStart: document.getElementById("productSnrStart"),
  snrEnd: document.getElementById("productSnrEnd"),
  snrStep: document.getElementById("productSnrStep"),
  snrFrames: document.getElementById("productSnrFrames"),
  snrProgress: document.getElementById("productSnrProgress"),
  snrPointCount: document.getElementById("productSnrPointCount"),
  snrFrameCount: document.getElementById("productSnrFrameCount"),
  snrBestSuccess: document.getElementById("productSnrBestSuccess"),
  snrWorstRaw: document.getElementById("productSnrWorstRaw"),
  snrTableBody: document.getElementById("productSnrTableBody"),
  berChart: document.getElementById("productBerChart"),
  frameChart: document.getElementById("productFrameChart")
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

function warningForMatrix(size) {
  if (size > 50000) {
    return "Huge warning: square product-code sweeps at this size can take a very long time in the browser.";
  }
  if (size > 400) {
    return "Warning: large product-code matrices can make the sweep noticeably slower in the browser.";
  }
  if (size > 225) {
    return "Warning: medium-sized product matrices are still exact, but the browser workload increases quickly.";
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

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

function parseProductDecodeOutput(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const configs = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cfgMatch = line.match(/^(PC\[[^\]]+\])\s+row=\(m=(\d+)\s+t=(\d+)\s+n=(\d+)\s+k=(\d+)\s+dg=(\d+)\s+poly=0x([0-9a-f]+)\)\s+col=\(m=(\d+)\s+t=(\d+)\s+n=(\d+)\s+k=(\d+)\s+dg=(\d+)\s+poly=0x([0-9a-f]+)\)$/i);
    if (cfgMatch) {
      current = {
        name: cfgMatch[1],
        row: { m: Number(cfgMatch[2]), t: Number(cfgMatch[3]), n: Number(cfgMatch[4]), k: Number(cfgMatch[5]), dg: Number(cfgMatch[6]), polyHex: cfgMatch[7].toLowerCase() },
        col: { m: Number(cfgMatch[8]), t: Number(cfgMatch[9]), n: Number(cfgMatch[10]), k: Number(cfgMatch[11]), dg: Number(cfgMatch[12]), polyHex: cfgMatch[13].toLowerCase() },
        infoRows: 0,
        infoCols: 0,
        codeRows: 0,
        codeCols: 0,
        maxIters: 0,
        messagesTested: 0,
        sections: [],
        diagnostic: null,
        status: "UNKNOWN"
      };
      configs.push(current);
      continue;
    }

    if (!current) continue;

    const dimsMatch = line.match(/^Info matrix:\s+(\d+)x(\d+)\s+Code matrix:\s+(\d+)x(\d+)\s+max_iters=(\d+)$/);
    if (dimsMatch) {
      current.infoRows = Number(dimsMatch[1]);
      current.infoCols = Number(dimsMatch[2]);
      current.codeRows = Number(dimsMatch[3]);
      current.codeCols = Number(dimsMatch[4]);
      current.maxIters = Number(dimsMatch[5]);
      continue;
    }

    const msgMatch = line.match(/^Messages tested:\s+(\d+)\s+\(([^)]+)\)$/);
    if (msgMatch) {
      current.messagesTested = Number(msgMatch[1]);
      current.messageMode = msgMatch[2];
      continue;
    }

    const sectionMatch = line.match(/^(Systematic mapping|No errors|Single-bit errors|Cooperative row pattern|Cooperative column pattern)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (sectionMatch) {
      current.sections.push({
        label: sectionMatch[1],
        total: Number(sectionMatch[2]),
        pass: Number(sectionMatch[3]),
        fail: Number(sectionMatch[4])
      });
      continue;
    }

    if (line === "Diagnostic rectangle (non-gating)") {
      const nextLine = lines[i + 1] ?? "";
      const diagMatch = nextLine.match(/^total=(\d+)\s+rc!=0=(\d+)\s+corrected_to_original=(\d+)\s+miscorrected_valid=(\d+)\s+still_invalid=(\d+)$/);
      if (diagMatch) {
        current.diagnostic = {
          total: Number(diagMatch[1]),
          rcFail: Number(diagMatch[2]),
          corrected: Number(diagMatch[3]),
          miscorrectedValid: Number(diagMatch[4]),
          stillInvalid: Number(diagMatch[5])
        };
        i += 1;
      }
      continue;
    }

    const statusMatch = line.match(/^(PASS|FAIL)\s+(PC\[[^\]]+\])/);
    if (statusMatch && current.name === statusMatch[2]) {
      current.status = statusMatch[1];
    }
  }

  return configs;
}

function renderSuiteRows(rows) {
  if (!rows.length) {
    el.suiteBody.innerHTML = `<tr><td colspan="4" class="empty-cell">No browser suite run yet.</td></tr>`;
    return;
  }
  el.suiteBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.rc}</td>
      <td class="${row.status === "PASS" ? "good-cell" : row.status === "FAIL" ? "bad-cell" : ""}">${row.status}</td>
      <td>${escapeHtml(row.detail)}</td>
    </tr>
  `).join("");
}

function renderDecodeCards(configs) {
  if (!configs.length) {
    el.decodeCards.innerHTML = `<div class="empty-cell">No decode breakdown yet.</div>`;
    return;
  }

  el.decodeCards.innerHTML = configs.map((cfg) => {
    const diag = cfg.diagnostic ?? { total: 0, rcFail: 0, corrected: 0, miscorrectedValid: 0, stillInvalid: 0 };
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
            <div class="decode-config-meta">info=${cfg.infoRows}x${cfg.infoCols}  code=${cfg.codeRows}x${cfg.codeCols}  max_iters=${cfg.maxIters}</div>
            <div class="decode-config-meta">row BCH(${cfg.row.n},${cfg.row.k},${cfg.row.t}) poly=0x${cfg.row.polyHex}  •  col BCH(${cfg.col.n},${cfg.col.k},${cfg.col.t}) poly=0x${cfg.col.polyHex}</div>
          </div>
          <span class="suite-badge ${cfg.status === "PASS" ? "pass" : cfg.status === "FAIL" ? "fail" : "idle"}">${cfg.status}</span>
        </div>

        <div class="decode-topline">
          <div class="decode-top-item">
            <span>Messages Tested</span>
            <strong>${formatCount(cfg.messagesTested)}</strong>
            <small>${escapeHtml(cfg.messageMode || "sampled")}</small>
          </div>
          <div class="decode-top-item">
            <span>Diagnostic Window</span>
            <strong>Rectangle stress pattern</strong>
            <small>non-gating</small>
          </div>
        </div>

        <div class="table-scroll">
          <table class="results-table">
            <thead>
              <tr><th>Section</th><th>Total</th><th>Pass</th><th>Fail</th></tr>
            </thead>
            <tbody>
              ${sectionRows}
            </tbody>
          </table>
        </div>

        <div class="diag-grid">
          <div class="diag-card"><span>Total Cases</span><strong>${formatCount(diag.total)}</strong></div>
          <div class="diag-card"><span>rc != 0</span><strong>${formatCount(diag.rcFail)}</strong></div>
          <div class="diag-card"><span>Corrected To Original</span><strong>${formatCount(diag.corrected)}</strong></div>
          <div class="diag-card"><span>Miscorrected Valid</span><strong>${formatCount(diag.miscorrectedValid)}</strong></div>
          <div class="diag-card"><span>Still Invalid</span><strong>${formatCount(diag.stillInvalid)}</strong></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderSuiteSnapshot(result) {
  el.suiteTotal.textContent = String(result.total);
  el.suitePass.textContent = String(result.pass);
  el.suiteFail.textContent = String(result.fail);
  el.suiteDuration.textContent = result.durationMs > 0 ? `${result.durationMs.toFixed(0)} ms` : "-";
  el.suiteMeta.textContent = `${result.rows.length} / ${result.total} tests finished`;
  renderSuiteRows(result.rows);
  renderDecodeCards(result.decodeConfigs);
  renderSuiteLog();
}

function renderSuiteSummary(result) {
  renderSuiteSnapshot(result);
  updateSuiteProgress(result.rows.length, result.total, "Run complete.");
  if (result.fail === 0) {
    setSuiteBanner("pass", "Native suite passed", "The exact make test browser run for product codes completed successfully.");
  } else {
    setSuiteBanner("fail", "Native suite failed", `There ${result.fail === 1 ? "was" : "were"} ${result.fail} failing browser test${result.fail === 1 ? "" : "s"}.`);
  }
  el.suiteDuration.textContent = `${result.durationMs.toFixed(0)} ms`;
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
  el.snrMaxIters.disabled = !adv;
  el.snrRowM.disabled = !adv;
  el.snrRowT.disabled = !adv;
  el.snrRowPrim.disabled = !adv;
  el.snrColM.disabled = !adv;
  el.snrColT.disabled = !adv;
  el.snrColPrim.disabled = !adv;
}

function applyPresetFields() {
  const preset = PRESETS[el.snrPreset.selectedIndex];
  if (!preset || el.snrAdvanced.checked) return;
  el.snrMaxIters.value = String(preset.maxIters);
  el.snrRowM.value = String(preset.row.m);
  el.snrRowT.value = String(preset.row.t);
  el.snrRowPrim.value = preset.row.prim;
  el.snrColM.value = String(preset.col.m);
  el.snrColT.value = String(preset.col.t);
  el.snrColPrim.value = preset.col.prim;
}

function initPresetUi() {
  el.snrPreset.innerHTML = PRESETS.map((preset) => `<option>${preset.name}</option>`).join("");
  el.snrPreset.value = PRESETS[0].name;
  applyPresetFields();
  toggleAdvancedFields();
}

function ensureModuleReady() {
  if (!state.mod) throw new Error("Product WASM module not loaded yet.");
}

function ensureTestsModuleReady() {
  if (!state.testsMod) throw new Error("Product browser test module not loaded yet.");
}

async function nextFrame() {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function loadWasmModule() {
  const wasmMod = await import(`./assets/product.js${BUILD_QUERY}`);
  const factory = wasmMod.default || wasmMod.ProductModule;
  if (!factory) throw new Error("No ProductModule export found.");
  state.mod = await factory();
}

async function loadTestsModule() {
  const wasmMod = await import(`./assets/product_tests.js${BUILD_QUERY}`);
  const factory = wasmMod.default || wasmMod.ProductTestsModule;
  if (!factory) throw new Error("No ProductTestsModule export found.");
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

function applySnrConfig() {
  ensureModuleReady();
  const rowM = Number.parseInt(el.snrRowM.value, 10);
  const rowT = Number.parseInt(el.snrRowT.value, 10);
  const rowPrim = parsePrim(el.snrRowPrim.value);
  const colM = Number.parseInt(el.snrColM.value, 10);
  const colT = Number.parseInt(el.snrColT.value, 10);
  const colPrim = parsePrim(el.snrColPrim.value);
  const maxIters = Number.parseInt(el.snrMaxIters.value, 10);

  if (![rowM, rowT, rowPrim, colM, colT, colPrim, maxIters].every(Number.isInteger)) {
    throw new Error("Invalid product SNR config values.");
  }

  const rc = state.mod._pw_init(rowM, rowPrim >>> 0, rowT, colM, colPrim >>> 0, colT);
  if (rc !== 0) {
    throw new Error("pw_init failed. Check the product-code component settings.");
  }

  state.snrCfg = {
    rowM,
    rowT,
    rowPrim: rowPrim >>> 0,
    colM,
    colT,
    colPrim: colPrim >>> 0,
    maxIters,
    rowN: state.mod._pw_get_row_n(),
    rowK: state.mod._pw_get_row_k(),
    colN: state.mod._pw_get_col_n(),
    colK: state.mod._pw_get_col_k(),
    infoRows: state.mod._pw_get_info_rows(),
    infoCols: state.mod._pw_get_info_cols(),
    codeRows: state.mod._pw_get_code_rows(),
    codeCols: state.mod._pw_get_code_cols(),
    msgBits: state.mod._pw_get_msg_bits(),
    cwBits: state.mod._pw_get_cw_bits()
  };

  el.snrCfgMeta.textContent = `${state.snrCfg.infoRows}x${state.snrCfg.infoCols} info  •  ${state.snrCfg.codeRows}x${state.snrCfg.codeCols} code  •  max_iters=${maxIters}`;
  setWarning(el.snrWarning, warningForMatrix(state.snrCfg.cwBits));
  setStatus("Product sweep config ready.");
  state.snrResults = [];
  renderSweepSummary();
}

async function runNativeSuite() {
  ensureTestsModuleReady();
  if (state.suiteRunning) return;

  state.suiteRunning = true;
  el.runSuiteBtn.disabled = true;
  setActiveTab("suite");
  const started = performance.now();
  const result = {
    total: 2,
    pass: 0,
    fail: 0,
    durationMs: 0,
    rows: [],
    decodeConfigs: [],
    rawLog: ""
  };
  const tests = [
    { name: "test_product_encode", symbol: "_pct_run_test_product_encode" },
    { name: "test_product_decode", symbol: "_pct_run_test_product_decode" }
  ];

  try {
    state.testLog.length = 0;
    renderSuiteLog();
    setSuiteBanner("running", "Running native suite", "Executing the browser WASM build of the native product-code tests.");
    updateSuiteProgress(0, tests.length, "Preparing test run...");
    renderSuiteSnapshot(result);
    await nextFrame();

    for (const test of tests) {
      const startLine = state.testLog.length;
      updateSuiteProgress(result.rows.length, tests.length, `Running ${test.name}...`);
      renderSuiteSnapshot(result);
      await nextFrame();

      const fn = state.testsMod[test.symbol];
      if (typeof fn !== "function") {
        throw new Error(`Missing exported test function ${test.symbol}`);
      }
      const rc = fn();
      const text = stripAnsi(state.testLog.slice(startLine).join("\n")).trim();
      const status = rc === 0 ? "PASS" : "FAIL";
      const detail = test.name === "test_product_decode"
        ? `${parseProductDecodeOutput(text).length} parameter sets parsed from native output`
        : summarizeSimpleTest(text, rc);

      if (status === "PASS") result.pass++;
      else result.fail++;

      result.rows.push({ name: test.name, rc, status, detail });
      if (test.name === "test_product_decode") {
        result.decodeConfigs = parseProductDecodeOutput(text);
      }
      result.durationMs = performance.now() - started;
      updateSuiteProgress(result.rows.length, tests.length, `${test.name} finished.`);
      renderSuiteSnapshot(result);
      await nextFrame();
    }
  } finally {
    result.durationMs = performance.now() - started;
    result.rawLog = stripAnsi(state.testLog.join("\n")).trim();
    renderSuiteSummary(result);
    state.suiteRunning = false;
    el.runSuiteBtn.disabled = false;
  }
}

async function runSnrSweep() {
  ensureModuleReady();
  if (!state.snrCfg) {
    applySnrConfig();
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
  if (!snrPoints.length) throw new Error("Sweep produced no SNR points.");

  state.sweepRunning = true;
  el.runSnrBtn.disabled = true;
  el.applySnrCfg.disabled = true;
  state.snrResults = [];
  renderSweepSummary();

  const cfg = state.snrCfg;
  const initRc = state.mod._pw_init(cfg.rowM, cfg.rowPrim >>> 0, cfg.rowT, cfg.colM, cfg.colPrim >>> 0, cfg.colT);
  if (initRc !== 0) {
    throw new Error("Failed to apply the selected sweep config.");
  }

  const rng = mulberry32((Date.now() ^ (cfg.codeRows << 8) ^ cfg.codeCols ^ cfg.maxIters) >>> 0);
  const gaussian = makeGaussian(rng);
  const rate = cfg.msgBits / cfg.cwBits;
  const msgPtr = mallocU8(state.mod, cfg.msgBits);
  const cwPtr = mallocU8(state.mod, cfg.cwBits);
  const rxPtr = mallocU8(state.mod, cfg.cwBits);

  try {
    for (let pointIdx = 0; pointIdx < snrPoints.length; pointIdx++) {
      const snrDb = snrPoints[pointIdx];
      const snrLinear = Math.pow(10, snrDb / 10);
      const sigma = Math.sqrt(1 / (2 * rate * snrLinear));
      let rawErrs = 0;
      let decodedErrs = 0;
      let successFrames = 0;

      for (let frame = 0; frame < frames; frame++) {
        const msg = randomBits(cfg.msgBits, rng);
        state.mod.HEAPU8.set(msg, msgPtr);
        const rcEnc = state.mod._pw_encode(msgPtr, cfg.msgBits, cwPtr, cfg.cwBits);
        if (rcEnc !== 0) {
          throw new Error(`pw_encode failed during sweep at ${snrDb.toFixed(1)} dB`);
        }

        const cw = readU8(state.mod, cwPtr, cfg.cwBits);
        const rx = new Uint8Array(cfg.cwBits);
        for (let bit = 0; bit < cfg.cwBits; bit++) {
          const symbol = bpskModulateBit(cw[bit]);
          const noisy = addAwgn(symbol, sigma, gaussian);
          rx[bit] = hardDemodulateBpsk(noisy);
          if (rx[bit] !== cw[bit]) rawErrs++;
        }

        state.mod.HEAPU8.set(rx, rxPtr);
        state.mod._pw_decode(rxPtr, cfg.cwBits, cfg.maxIters);
        const corrected = readU8(state.mod, rxPtr, cfg.cwBits);
        const frameErrs = countBitErrors(corrected, cw);
        decodedErrs += frameErrs;
        if (frameErrs === 0) successFrames++;

        if (frame % 16 === 15) {
          el.snrProgress.textContent = `Sweeping ${snrDb.toFixed(1)} dB: frame ${frame + 1}/${frames} (${pointIdx + 1}/${snrPoints.length} points).`;
          await nextFrame();
        }
      }

      state.snrResults.push({
        snrDb,
        rawBer: rawErrs / (cfg.cwBits * frames),
        decodedBer: decodedErrs / (cfg.cwBits * frames),
        successRate: successFrames / frames,
        frames
      });

      renderSweepSummary();
      el.snrProgress.textContent = `Completed ${pointIdx + 1}/${snrPoints.length} SNR points. Latest ${snrDb.toFixed(1)} dB, frame success ${formatPct(successFrames / frames)}.`;
      await nextFrame();
    }

    el.snrProgress.textContent = `Sweep complete across ${snrPoints.length} points and ${frames} frames/point.`;
  } finally {
    freeAll(state.mod, [msgPtr, cwPtr, rxPtr]);
    state.sweepRunning = false;
    el.runSnrBtn.disabled = false;
    el.applySnrCfg.disabled = false;
  }
}

function bindEvents() {
  for (const button of el.tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }
  el.snrPreset.addEventListener("change", applyPresetFields);
  el.snrAdvanced.addEventListener("change", () => {
    toggleAdvancedFields();
    applyPresetFields();
  });
  el.applySnrCfg.addEventListener("click", () => {
    try {
      applySnrConfig();
    } catch (err) {
      setStatus(`Config error: ${err.message}`);
    }
  });
  el.runSuiteBtn.addEventListener("click", () => {
    runNativeSuite().catch((err) => setStatus(`Suite error: ${err.message}`));
  });
  el.runSnrBtn.addEventListener("click", () => {
    runSnrSweep().catch((err) => {
      setStatus(`Sweep error: ${err.message}`);
      state.sweepRunning = false;
      el.runSnrBtn.disabled = false;
      el.applySnrCfg.disabled = false;
    });
  });
}

async function main() {
  setActiveTab("suite");
  initPresetUi();
  bindEvents();
  setSuiteBanner("idle", "Native suite ready", "Run the browser suite to execute the same tests as make test in product.");
  updateSuiteProgress(0, 2, "Awaiting run.");
  renderSuiteSnapshot({ total: 2, pass: 0, fail: 0, durationMs: 0, rows: [], decodeConfigs: [] });
  renderSuiteLog();
  renderSweepSummary();

  try {
    await Promise.all([loadWasmModule(), loadTestsModule()]);
    setStatus("Product-code WASM core and browser tests loaded.");
    applySnrConfig();
  } catch (err) {
    setStatus(`Load error: ${err.message}`);
    drawEmptyChart(el.berChart, "WASM modules failed to load.");
    drawEmptyChart(el.frameChart, "WASM modules failed to load.");
  }
}

main();
