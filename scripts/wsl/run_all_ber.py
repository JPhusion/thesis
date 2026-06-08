#!/usr/bin/env python3
import argparse
import copy
import csv
import json
import math
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FormatStrFormatter, LogLocator, MultipleLocator

ROOT = Path(__file__).resolve().parents[2]
IS_WINDOWS = os.name == "nt"


def native_executable(path: Path) -> Path:
    if IS_WINDOWS:
        return path.with_suffix(".exe")
    return path


BCH_RUNNER = native_executable(ROOT / "bch" / "build_bch_snr_sweep")
PRODUCT_RUNNER = native_executable(ROOT / "product" / "build_product_snr_sweep")
STAIRCASE_RUNNER = native_executable(ROOT / "staircase" / "build_staircase_snr_sweep")
DEFAULT_OUT_ROOT = ROOT / "artifacts" / "wsl-ber-runs"
DEFAULT_JOBS = max(1, (os.cpu_count() or 1))

plt.rcParams.update(
    {
        "font.family": "serif",
        "font.serif": ["Times New Roman", "Times", "DejaVu Serif"],
        "axes.titlesize": 14,
        "axes.titleweight": "bold",
        "axes.labelsize": 16,
        "axes.edgecolor": "#444444",
        "axes.linewidth": 0.8,
        "xtick.labelsize": 11,
        "ytick.labelsize": 11,
        "legend.fontsize": 12,
        "figure.dpi": 160,
        "savefig.dpi": 320,
        "savefig.facecolor": "white",
    }
)

GRAPH_CONFIGS: Dict[str, Dict[str, object]] = {
    "bch_255": {
        "slug": "bch_255_awgn_ber",
        "family": "bch",
        "label": "BCH(255,231,3)",
        "title": "BCH(255, 231, 3) BER over BPSK/AWGN",
        "subtitle": "Hard-decision BCH bounded-distance decoding",
        "plot_xmin": 3.6,
        "plot_xmax": 4.8,
        "plot_ymin": 1e-7,
        "plot_ymax": 1e-1,
        "m": 8,
        "t": 3,
        "prim": "0x11d",
        "seed": 2552313,
    },
    "bch_511": {
        "slug": "bch_511_awgn_ber",
        "family": "bch",
        "label": "BCH(511,484,3)",
        "title": "BCH(511, 484, 3) BER over BPSK/AWGN",
        "subtitle": "Hard-decision BCH bounded-distance decoding",
        "plot_xmin": 4.5,
        "plot_xmax": 5.2,
        "plot_ymin": 1e-7,
        "plot_ymax": 1e-2,
        "m": 9,
        "t": 3,
        "prim": "0x211",
        "seed": 5114843,
    },
    "product_255": {
        "slug": "product_255_awgn_ber",
        "family": "product",
        "label": "PC[BCH(255,231,3) x BCH(255,231,3)]",
        "title": "Square Product Code BER with BCH(255, 231, 3) Components",
        "subtitle": "Iterative hard-decision row/column decoding (12 iterations)",
        "plot_xmin": 3.6,
        "plot_xmax": 4.8,
        "plot_ymin": 1e-7,
        "plot_ymax": 1e-1,
        "row_m": 8,
        "row_t": 3,
        "row_prim": "0x11d",
        "col_m": 8,
        "col_t": 3,
        "col_prim": "0x11d",
        "max_iters": 12,
        "seed": 2552313,
    },
    "product_511": {
        "slug": "product_511_awgn_ber",
        "family": "product",
        "label": "PC[BCH(511,484,3) x BCH(511,484,3)]",
        "title": "Square Product Code BER with BCH(511, 484, 3) Components",
        "subtitle": "Iterative hard-decision row/column decoding (12 iterations)",
        "plot_xmin": 4.5,
        "plot_xmax": 5.2,
        "plot_ymin": 1e-7,
        "plot_ymax": 1e-2,
        "row_m": 9,
        "row_t": 3,
        "row_prim": "0x211",
        "col_m": 9,
        "col_t": 3,
        "col_prim": "0x211",
        "max_iters": 12,
        "seed": 5114843,
    },
    "staircase_254": {
        "slug": "staircase_short_254_awgn_ber",
        "family": "staircase",
        "label": "SC[short BCH(254,230,3)]",
        "title": "Staircase BER with short BCH(254, 230, 3) Component",
        "subtitle": "Paper-style windowed hard-decision staircase decoding (window 7, 12 iterations)",
        "plot_xmin": 3.6,
        "plot_xmax": 4.8,
        "plot_ymin": 1e-7,
        "plot_ymax": 1e-1,
        "sweep_start_db": 3.6,
        "sweep_end_db": 4.8,
        "m": 8,
        "t": 3,
        "prim": "0x11d",
        "data_blocks": 100,
        "window_size": 7,
        "max_iters": 12,
        "seed": 25423037,
    },
    "staircase_510": {
        "slug": "staircase_short_510_awgn_ber",
        "family": "staircase",
        "label": "SC[short BCH(510,483,3)]",
        "title": "Staircase BER with short BCH(510, 483, 3) Component",
        "subtitle": "Paper-style windowed hard-decision staircase decoding (window 7, 12 iterations)",
        "plot_xmin": 4.5,
        "plot_xmax": 5.2,
        "plot_ymin": 1e-7,
        "plot_ymax": 1e-2,
        "sweep_start_db": 4.5,
        "sweep_end_db": 5.2,
        "m": 9,
        "t": 3,
        "prim": "0x211",
        "data_blocks": 100,
        "window_size": 7,
        "max_iters": 12,
        "seed": 51048337,
    },
    "staircase_62": {
        "slug": "staircase_short_62_awgn_ber",
        "family": "staircase",
        "label": "SC[short BCH(62,50,2), 7 data blocks]",
        "title": "Terminated Staircase Code BER with short BCH(62, 50, 2) Component",
        "subtitle": "Windowed hard-decision staircase decoding",
        "plot_xmin": 0.0,
        "plot_xmax": 6.0,
        "m": 6,
        "t": 2,
        "prim": "0b1000011",
        "data_blocks": 7,
        "window_size": 3,
        "max_iters": 3,
        "seed": 625027,
    },
}


@dataclass
class GraphStatus:
    name: str
    cfg: Dict[str, object]
    total_points: int
    status: str = "pending"
    completed_points: int = 0   # points that reached the decoded-error target
    capped_points: int = 0      # points finalized by a frame/time/budget cutoff instead
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    last_snr_db: Optional[float] = None
    sweep_index: int = 0        # current round-robin sweep number (1-based)
    sweep_done: int = 0         # batches completed in the current sweep
    sweep_total: int = 0        # batches submitted in the current sweep
    in_flight: List[float] = field(default_factory=list)  # SNRs still being worked this sweep
    estimated_total_seconds: Optional[float] = None
    actual_elapsed_seconds: float = 0.0
    calibration_elapsed_seconds: Optional[float] = None
    point_logs: List[str] = field(default_factory=list)
    files: List[Path] = field(default_factory=list)
    adaptive_note: Optional[str] = None
    last_plot_refresh_at: float = 0.0


def build_runners() -> None:
    if IS_WINDOWS:
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "windows" / "build_native_runners.py"),
            ],
            check=True,
        )
        return
    subprocess.run(["make", "-C", str(ROOT / "bch"), "snr_sweep"], check=True)
    subprocess.run(["make", "-C", str(ROOT / "product"), "snr_sweep"], check=True)
    subprocess.run(["make", "-C", str(ROOT / "staircase"), "snr_sweep"], check=True)


def build_snr_points(start_db: float, end_db: float, step_db: float) -> List[float]:
    points: List[float] = []
    value = start_db
    while value <= end_db + 1e-9:
        points.append(round(value, 3))
        value += step_db
    return points


def round_snr_key(snr_db: float) -> float:
    return round(snr_db, 3)


def load_csv(path: Path) -> List[Dict[str, float]]:
    rows: List[Dict[str, float]] = []
    # Optional absolute-count columns emitted by the native sweeps; carried through
    # when present so callers can accumulate exact counts across batches.
    count_keys = ("raw_errors", "decoded_errors", "payload_bits", "success_frames")
    with path.open(newline="") as fp:
        reader = csv.DictReader(line for line in fp if not line.startswith("#"))
        for row in reader:
            parsed = {
                "snr_db": float(row["snr_db"]),
                "raw_ber": float(row["raw_ber"]),
                "decoded_ber": float(row["decoded_ber"]),
                "frame_success": float(row["frame_success"]),
                "frames": float(row["frames"]),
            }
            for key in count_keys:
                if row.get(key) not in (None, ""):
                    parsed[key] = float(row[key])
            rows.append(parsed)
    return rows


def choose_waterfall_refinement(
    rows: List[Dict[str, float]],
    coarse_points: List[float],
    start_db: float,
    end_db: float,
    coarse_step_db: float,
    fine_step_db: float,
    span_steps: int,
) -> Tuple[List[float], Optional[str]]:
    if fine_step_db >= coarse_step_db or len(rows) < 2:
        return [], None

    best: Optional[Tuple[float, int, str]] = None
    for key in ("decoded_ber", "raw_ber"):
        local_best: Optional[Tuple[float, int, str]] = None
        for i in range(len(rows) - 1):
            x0 = rows[i]["snr_db"]
            x1 = rows[i + 1]["snr_db"]
            y0 = rows[i][key]
            y1 = rows[i + 1][key]
            if x1 <= x0 or y0 <= 0.0 or y1 <= 0.0:
                continue
            drop_per_db = (math.log10(y0) - math.log10(y1)) / (x1 - x0)
            if drop_per_db <= 0.0:
                continue
            candidate = (drop_per_db, i, key)
            if local_best is None or candidate[0] > local_best[0]:
                local_best = candidate
        if local_best is not None:
            best = local_best
            if key == "decoded_ber":
                break

    if best is None:
        return [], None

    _, center_index, series_key = best
    left_index = max(0, center_index - span_steps)
    right_index = min(len(rows) - 1, center_index + 1 + span_steps)
    left_db = max(start_db, rows[left_index]["snr_db"])
    right_db = min(end_db, rows[right_index]["snr_db"])

    coarse_keys = {round_snr_key(point) for point in coarse_points}
    fine_points = [
        point
        for point in build_snr_points(left_db, right_db, fine_step_db)
        if round_snr_key(point) not in coarse_keys
    ]

    if not fine_points:
        return [], None

    note = (
        f"adaptive refinement on {series_key} waterfall: "
        f"{left_db:.2f}-{right_db:.2f} dB at {fine_step_db:.2f} dB spacing"
    )
    return fine_points, note


def positive_series(rows: List[Dict[str, float]], key: str) -> Tuple[List[float], List[float]]:
    xs: List[float] = []
    ys: List[float] = []
    for row in rows:
        value = row[key]
        if value > 0.0:
            xs.append(row["snr_db"])
            ys.append(value)
    return xs, ys


def make_plot(cfg: Dict[str, object], rows: List[Dict[str, float]], out_base: Path, start_db: float, end_db: float) -> None:
    raw_snr, raw_plot = positive_series(rows, "raw_ber")
    decoded_snr, decoded_plot = positive_series(rows, "decoded_ber")
    all_positive = raw_plot + decoded_plot
    if not all_positive:
        raise RuntimeError(f"No positive BER points available to plot for {cfg['label']}")

    x_min = float(cfg.get("plot_xmin", start_db))
    x_max = float(cfg.get("plot_xmax", end_db))

    # If the preset x-window does not overlap the swept SNR range at all, the
    # curated zoom is meaningless for this run (e.g. a short smoke sweep), so
    # fall back to the actual swept range instead of drawing an empty window.
    all_snr = raw_snr + decoded_snr
    if all_snr and not any(x_min - 1e-9 <= snr <= x_max + 1e-9 for snr in all_snr):
        x_min = min(start_db, min(all_snr))
        x_max = max(end_db, max(all_snr))

    # Only data that falls inside the visible x-window may set the y-limits;
    # otherwise a preset window can clip every visible point and leave a blank
    # graph (e.g. a curve that never reaches its preset y-ceiling in-window).
    visible = [
        y
        for snr_list, y_list in ((raw_snr, raw_plot), (decoded_snr, decoded_plot))
        for snr, y in zip(snr_list, y_list)
        if x_min - 1e-9 <= snr <= x_max + 1e-9
    ]
    extents = visible or all_positive

    min_y = min(extents)
    max_y = max(max(extents), 1e-2)
    # Preset limits act as hints but are widened so in-window data is never clipped.
    y_min = min(float(cfg.get("plot_ymin", 1e-7)), 10 ** math.floor(math.log10(min_y)))
    y_max = max(float(cfg.get("plot_ymax", 1e-1)), 10 ** math.ceil(math.log10(max_y)))

    fig, ax = plt.subplots(figsize=(7.2, 6.1), constrained_layout=True)
    ax.set_facecolor("white")
    ax.plot(
        raw_snr,
        raw_plot,
        color="#c41e3a",
        linestyle="-",
        linewidth=1.5,
        marker="s",
        markersize=5.0,
        markerfacecolor="white",
        markeredgewidth=1.0,
        label="Raw BER",
        zorder=3,
    )
    ax.plot(
        decoded_snr,
        decoded_plot,
        color="#1f77d0",
        linestyle="-",
        linewidth=1.5,
        marker="o",
        markersize=5.0,
        markerfacecolor="white",
        markeredgewidth=1.0,
        label="Decoded BER",
        zorder=4,
    )

    ax.set_title(cfg["title"], pad=8)
    ax.set_xlabel(r"$E_b/N_0$ (dB)")
    ax.set_ylabel("BER")
    ax.set_xlim(x_min, x_max)
    ax.set_ylim(y_min, y_max)
    ax.set_yscale("log")
    ax.xaxis.set_major_locator(MultipleLocator(0.2))
    ax.xaxis.set_minor_locator(MultipleLocator(0.1))
    ax.xaxis.set_major_formatter(FormatStrFormatter("%.1f"))
    ax.yaxis.set_major_locator(LogLocator(base=10.0))
    ax.yaxis.set_minor_locator(LogLocator(base=10.0, subs=tuple(range(2, 10))))
    ax.grid(which="major", color="#d9d9d9", linewidth=0.8, alpha=0.8)
    ax.grid(which="minor", color="#ededed", linewidth=0.5, alpha=0.9)

    legend = ax.legend(
        loc="lower left",
        frameon=True,
        fancybox=False,
        framealpha=1.0,
        borderpad=0.4,
        handlelength=1.6,
        handletextpad=0.45,
        labelspacing=0.35,
    )
    legend.get_frame().set_edgecolor("#666666")
    legend.get_frame().set_linewidth(0.8)
    legend.get_frame().set_facecolor("white")

    fig.savefig(out_base.with_suffix(".png"), dpi=360)
    fig.savefig(out_base.with_suffix(".pdf"))
    fig.savefig(out_base.with_suffix(".svg"))
    plt.close(fig)


def write_merged_csv(
    cfg: Dict[str, object],
    rows: List[Dict[str, float]],
    args: argparse.Namespace,
    out_csv: Path,
    adaptive_note: Optional[str] = None,
) -> None:
    with out_csv.open("w", newline="") as fp:
        fp.write(f"# label,{cfg['label']}\n")
        fp.write(f"# family,{cfg['family']}\n")
        fp.write(f"# title,{cfg['title']}\n")
        fp.write(f"# subtitle,{cfg['subtitle']}\n")
        fp.write("# channel,BPSK modulation + AWGN + hard demodulation\n")
        fp.write("# stop_condition,decoded_bit_errors_target\n")
        fp.write(f"# target_errors,{args.target_errors}\n")
        fp.write(f"# max_frames_per_point,{args.max_frames_per_point}\n")
        fp.write(f"# start_db,{args.start_db}\n")
        fp.write(f"# end_db,{args.end_db}\n")
        fp.write(f"# step_db,{args.step_db}\n")
        fp.write(f"# adaptive_waterfall,{str(args.adaptive_waterfall).lower()}\n")
        fp.write(f"# adaptive_fine_step,{args.adaptive_fine_step}\n")
        fp.write(f"# adaptive_span_steps,{args.adaptive_span_steps}\n")
        if adaptive_note:
            fp.write(f"# adaptive_note,{adaptive_note}\n")
        if cfg["family"] == "product":
            fp.write(f"# max_iters,{cfg['max_iters']}\n")
        if cfg["family"] == "staircase":
            fp.write(f"# data_blocks,{cfg['data_blocks']}\n")
            fp.write(f"# window_size,{cfg['window_size']}\n")
            fp.write(f"# max_iters,{cfg['max_iters']}\n")
        fp.write("snr_db,raw_ber,decoded_ber,frame_success,frames\n")
        writer = csv.writer(fp)
        for row in rows:
            writer.writerow(
                [
                    f"{row['snr_db']:.3f}",
                    f"{row['raw_ber']:.12g}",
                    f"{row['decoded_ber']:.12g}",
                    f"{row['frame_success']:.12g}",
                    int(row["frames"]),
                ]
            )


def update_status_files(status: GraphStatus, *paths: Path) -> None:
    known = {path for path in status.files}
    for path in paths:
        if path.exists() and path not in known:
            status.files.append(path)
            known.add(path)


def write_live_outputs(
    cfg: Dict[str, object],
    args: argparse.Namespace,
    out_dir: Path,
    status: GraphStatus,
    rows_by_snr: Dict[float, Dict[str, float]],
    force_plot: bool = False,
) -> None:
    rows = sorted(rows_by_snr.values(), key=lambda row: row["snr_db"])
    if not rows:
        return

    csv_path = out_dir / f"{cfg['slug']}.csv"
    plot_base = out_dir / str(cfg["slug"])
    write_merged_csv(cfg, rows, args, csv_path, status.adaptive_note)
    update_status_files(status, csv_path)

    now = time.time()
    should_plot = force_plot or (status.last_plot_refresh_at == 0.0) or (
        now - status.last_plot_refresh_at >= args.live_plot_interval_seconds
    )
    if should_plot:
        try:
            make_plot(cfg, rows, plot_base, args.start_db, args.end_db)
        except RuntimeError:
            pass
        else:
            status.last_plot_refresh_at = now
            update_status_files(
                status,
                plot_base.with_suffix(".png"),
                plot_base.with_suffix(".pdf"),
                plot_base.with_suffix(".svg"),
            )

    write_manifest(out_dir, args, STATUSES)


def make_point_command(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, target_errors: int, out_csv: Path, seed: int, max_frames: Optional[int] = None) -> List[str]:
    family = str(cfg["family"])
    frame_cap = args.max_frames_per_point if max_frames is None else max_frames
    if family == "bch":
        cmd = [
            str(BCH_RUNNER),
            "--m", str(cfg["m"]),
            "--t", str(cfg["t"]),
            "--prim", str(cfg["prim"]),
            "--start-db", f"{snr_db:.3f}",
            "--end-db", f"{snr_db:.3f}",
            "--step-db", str(args.step_db),
            "--target-errors", str(target_errors),
            "--seed", str(seed),
            "--label", str(cfg["label"]),
            "--out", str(out_csv),
        ]
        if frame_cap > 0:
            cmd.extend(["--max-frames", str(frame_cap)])
        return cmd
    if family == "product":
        cmd = [
            str(PRODUCT_RUNNER),
            "--row-m", str(cfg["row_m"]),
            "--row-t", str(cfg["row_t"]),
            "--row-prim", str(cfg["row_prim"]),
            "--col-m", str(cfg["col_m"]),
            "--col-t", str(cfg["col_t"]),
            "--col-prim", str(cfg["col_prim"]),
            "--max-iters", str(cfg["max_iters"]),
            "--start-db", f"{snr_db:.3f}",
            "--end-db", f"{snr_db:.3f}",
            "--step-db", str(args.step_db),
            "--target-errors", str(target_errors),
            "--seed", str(seed),
            "--label", str(cfg["label"]),
            "--out", str(out_csv),
        ]
        if frame_cap > 0:
            cmd.extend(["--max-frames", str(frame_cap)])
        return cmd
    if family == "staircase":
        # In streaming mode the chain is generated on the fly at the asymptotic
        # rate, so data_blocks is irrelevant; in terminated mode a larger
        # data_blocks raises the effective rate toward that asymptote.
        data_blocks = args.staircase_data_blocks if args.staircase_data_blocks > 0 else int(cfg["data_blocks"])
        cmd = [
            str(STAIRCASE_RUNNER),
            "--m", str(cfg["m"]),
            "--t", str(cfg["t"]),
            "--prim", str(cfg["prim"]),
            "--data-blocks", str(data_blocks),
            "--window", str(cfg["window_size"]),
            "--max-iters", str(cfg["max_iters"]),
            "--start-db", f"{snr_db:.3f}",
            "--end-db", f"{snr_db:.3f}",
            "--step-db", str(args.step_db),
            "--target-errors", str(target_errors),
            "--seed", str(seed),
            "--label", str(cfg["label"]),
            "--out", str(out_csv),
        ]
        if args.staircase_mode == "streaming":
            cmd.append("--streaming")
        if frame_cap > 0:
            cmd.extend(["--max-frames", str(frame_cap)])
        return cmd
    raise ValueError(f"Unsupported family: {family}")


def run_point_job(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, target_errors: int, out_csv: Path) -> Tuple[float, str]:
    seed = int(cfg["seed"]) ^ int(round(snr_db * 1000.0))
    cmd = make_point_command(cfg, args, snr_db, target_errors, out_csv, seed)
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return snr_db, proc.stderr.strip()


# Large per-point error target so a fixed-size batch always runs exactly its frame
# count (the native sweep stops on the frame cap, never on the error target).
_BATCH_ERROR_SENTINEL = 1_000_000_000


@dataclass
class PointAccumulator:
    """Running totals for one SNR point across many round-robin batches."""

    snr_db: float
    raw_errors: int = 0
    decoded_errors: int = 0
    payload_bits: int = 0
    frames: int = 0
    success_frames: int = 0
    rounds: int = 0
    done: bool = False

    def add(self, counts: Dict[str, int]) -> None:
        self.raw_errors += counts["raw_errors"]
        self.decoded_errors += counts["decoded_errors"]
        self.payload_bits += counts["payload_bits"]
        self.frames += counts["frames"]
        self.success_frames += counts["success_frames"]
        self.rounds += 1

    def as_row(self) -> Optional[Dict[str, float]]:
        if self.frames <= 0 or self.payload_bits <= 0:
            return None
        return {
            "snr_db": self.snr_db,
            "raw_ber": self.raw_errors / self.payload_bits,
            "decoded_ber": self.decoded_errors / self.payload_bits,
            "frame_success": self.success_frames / self.frames,
            "frames": float(self.frames),
        }


def read_point_counts(path: Path) -> Dict[str, int]:
    """Parse the single data row of a native sweep CSV into absolute counts.

    Falls back to deriving counts from the BER columns if a legacy binary
    without the count columns is used."""
    rows = load_csv(path)
    if len(rows) != 1:
        raise RuntimeError(f"Expected exactly one CSV row in {path}, got {len(rows)}")
    row = rows[0]
    frames = int(round(row["frames"]))
    if "payload_bits" in row:
        return {
            "raw_errors": int(round(row["raw_errors"])),
            "decoded_errors": int(round(row["decoded_errors"])),
            "payload_bits": int(round(row["payload_bits"])),
            "frames": frames,
            "success_frames": int(round(row.get("success_frames", row["frame_success"] * frames))),
        }
    raise RuntimeError(
        f"{path} lacks absolute-count columns; rebuild the native sweeps "
        "(make -C <family> snr_sweep) to enable round-robin accumulation."
    )


def run_batch_job(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, batch_frames: int, round_index: int, seq: int, out_csv: Path) -> Tuple[float, Dict[str, int], str]:
    # Distinct seed per (point, round, sub-batch) so concurrent batches of the
    # same point never replay the same frames.
    seed = (
        int(cfg["seed"])
        ^ int(round(snr_db * 1000.0))
        ^ ((round_index + 1) * 0x9E3779B1)
        ^ ((seq + 1) * 0x85EBCA77)
    ) & 0xFFFFFFFFFFFFFFFF
    cmd = make_point_command(cfg, args, snr_db, _BATCH_ERROR_SENTINEL, out_csv, seed, max_frames=batch_frames)
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return snr_db, read_point_counts(out_csv), proc.stderr.strip()


def format_duration(seconds: Optional[float]) -> str:
    if seconds is None or not math.isfinite(seconds):
        return "-"
    seconds = max(0, int(round(seconds)))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def format_finish(ts: Optional[float]) -> str:
    if ts is None or not math.isfinite(ts):
        return "-"
    return datetime.fromtimestamp(ts).strftime("%H:%M:%S")


def total_seconds_for_status(status: GraphStatus, now: float) -> Optional[float]:
    if status.status == "done":
        return status.actual_elapsed_seconds
    if status.status in ("running", "coarse", "fine") and status.completed_points > 0 and status.started_at is not None:
        elapsed = now - status.started_at
        return elapsed / status.completed_points * status.total_points
    return status.estimated_total_seconds


def compute_schedule(statuses: List[GraphStatus], suite_start: float) -> List[Tuple[GraphStatus, Optional[float], Optional[float]]]:
    now = time.time()
    cursor = suite_start
    result = []
    for status in statuses:
        total = total_seconds_for_status(status, now)
        if status.status == "running" and status.started_at is not None:
            start_at = status.started_at
            finish_at = start_at + total if total is not None else None
            cursor = finish_at if finish_at is not None else cursor
        elif status.status == "done" and status.finished_at is not None and status.started_at is not None:
            start_at = status.started_at
            finish_at = status.finished_at
            cursor = finish_at
        else:
            start_at = cursor
            finish_at = cursor + total if total is not None else None
            cursor = finish_at if finish_at is not None else cursor
        result.append((status, start_at, finish_at))
    return result


def write_progress_json(out_dir: Path, statuses: List[GraphStatus], suite_start: float) -> None:
    now = time.time()
    schedule = compute_schedule(statuses, suite_start)
    payload = {
        "updated_at": datetime.fromtimestamp(now).isoformat(),
        "elapsed_seconds": now - suite_start,
        "graphs": [
            {
                "name": status.name,
                "label": status.cfg["label"],
                "status": status.status,
                "completed_points": status.completed_points,
                "capped_points": status.capped_points,
                "total_points": status.total_points,
                "sweep_index": status.sweep_index,
                "sweep_done": status.sweep_done,
                "sweep_total": status.sweep_total,
                "in_flight_snr_db": status.in_flight,
                "last_snr_db": status.last_snr_db,
                "estimated_total_seconds": total_seconds_for_status(status, now),
                "predicted_start": datetime.fromtimestamp(start_at).isoformat() if start_at else None,
                "predicted_finish": datetime.fromtimestamp(finish_at).isoformat() if finish_at else None,
                "actual_elapsed_seconds": status.actual_elapsed_seconds,
                "files": [str(path) for path in status.files],
                "adaptive_note": status.adaptive_note,
            }
            for status, start_at, finish_at in schedule
        ],
    }
    (out_dir / "progress.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def format_in_flight(snrs: List[float], limit: int = 6) -> str:
    if not snrs:
        return "-"
    shown = ", ".join(f"{snr:.2f}" for snr in snrs[:limit])
    extra = len(snrs) - limit
    if extra > 0:
        shown += f"  (+{extra} more)"
    return f"{shown} dB"


def render_status(out_dir: Path, statuses: List[GraphStatus], suite_start: float) -> None:
    now = time.time()
    schedule = compute_schedule(statuses, suite_start)
    overall_done = sum(status.completed_points for status in statuses)
    overall_total = sum(status.total_points for status in statuses)
    lines = [
        "BER Simulation Suite",
        f"Output: {out_dir}",
        f"Updated: {datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S')}",
        f"Overall: {overall_done}/{overall_total} SNR points complete  |  Elapsed: {format_duration(now - suite_start)}",
        "",
    ]
    for status, _start_at, finish_at in schedule:
        eta = (finish_at - now) if finish_at is not None else None

        complete = f"complete {status.completed_points}/{status.total_points}"
        if status.capped_points:
            complete += f" ({status.capped_points} capped)"

        if status.status in ("coarse", "fine") and status.sweep_index > 0:
            sweep = f"sweep #{status.sweep_index} ({status.sweep_done}/{status.sweep_total} this sweep)"
        else:
            sweep = ""

        eta_str = f"ETA {format_duration(eta)} -> {format_finish(finish_at)}" if eta is not None else ""

        headline = f"{status.name:22} [{status.status:^10}] {complete:24}"
        if sweep:
            headline += f"  {sweep:30}"
        if eta_str:
            headline += f"  {eta_str}"
        lines.append(headline.rstrip())

        if status.in_flight:
            lines.append(f"    working on: {format_in_flight(status.in_flight)}")

    if sys.stdout.isatty():
        sys.stdout.write("\033[2J\033[H")
    sys.stdout.write("\n".join(lines) + "\n")
    sys.stdout.flush()
    write_progress_json(out_dir, statuses, suite_start)


def calibrate_graph(cfg: Dict[str, object], args: argparse.Namespace, out_dir: Path, cal_target_errors: int) -> float:
    cal_dir = out_dir / "_calibration"
    cal_dir.mkdir(parents=True, exist_ok=True)
    out_csv = cal_dir / f"{cfg['slug']}_calibration.csv"
    if out_csv.exists():
        out_csv.unlink()
    cal_snr = float(cfg.get("sweep_start_db", args.start_db))
    t0 = time.perf_counter()
    run_point_job(cfg, args, cal_snr, cal_target_errors, out_csv)
    elapsed = time.perf_counter() - t0
    return elapsed


def run_case(cfg: Dict[str, object], args: argparse.Namespace, out_dir: Path, status: GraphStatus, suite_start: float) -> None:
    parts_dir = out_dir / f"_{cfg['slug']}_parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    # A graph may pin its own sweep window (e.g. matching a paper figure);
    # otherwise it uses the global --start-db/--end-db range.
    sweep_start = float(cfg.get("sweep_start_db", args.start_db))
    sweep_end = float(cfg.get("sweep_end_db", args.end_db))
    coarse_points = build_snr_points(sweep_start, sweep_end, args.step_db)
    accums: Dict[float, PointAccumulator] = {}
    graph_frames = 0
    t0 = time.perf_counter()
    status.status = "coarse"
    status.started_at = time.time()
    render_status(out_dir, STATUSES, suite_start)

    def rows_by_snr() -> Dict[float, Dict[str, float]]:
        rows: Dict[float, Dict[str, float]] = {}
        for key, acc in accums.items():
            row = acc.as_row()
            if row is not None:
                rows[key] = row
        return rows

    def budget_exhausted() -> bool:
        if args.time_budget_seconds > 0 and (time.perf_counter() - t0) >= args.time_budget_seconds:
            return True
        if args.frame_budget > 0 and graph_frames >= args.frame_budget:
            return True
        return False

    def point_done(acc: PointAccumulator) -> bool:
        if acc.decoded_errors >= args.target_errors:
            return True
        if args.max_frames_per_point > 0 and acc.frames >= args.max_frames_per_point:
            return True
        return False

    def run_round_robin(points: List[float], stage_name: str) -> None:
        nonlocal graph_frames
        for snr_db in points:
            accums.setdefault(round_snr_key(snr_db), PointAccumulator(snr_db=round_snr_key(snr_db)))
        if not points:
            return

        status.status = stage_name
        render_status(out_dir, STATUSES, suite_start)

        round_index = 0
        # Sweep the whole range each round; a point drops out once it reaches the
        # error target / frame cap, so later rounds concentrate on the slow
        # (high-SNR) points. Stops early if the per-graph budget is hit.
        while True:
            active = [
                accums[round_snr_key(p)]
                for p in points
                if not accums[round_snr_key(p)].done and not point_done(accums[round_snr_key(p)])
            ]
            if not active or budget_exhausted():
                break

            round_index += 1
            jobs = max(1, args.jobs)
            # Saturate cores even when few points remain: give each active point
            # enough concurrent sub-batches that all `jobs` workers stay busy.
            per_point = max(1, -(-jobs // len(active)))  # ceil(jobs / active)
            batches = [(acc, seq) for acc in active for seq in range(per_point)]
            remaining_per_snr = {acc.snr_db: per_point for acc in active}

            status.sweep_index = round_index
            status.sweep_total = len(batches)
            status.sweep_done = 0
            status.in_flight = sorted(acc.snr_db for acc in active)
            render_status(out_dir, STATUSES, suite_start)

            with ThreadPoolExecutor(max_workers=min(jobs, len(batches))) as pool:
                future_map = {}
                for acc, seq in batches:
                    out_csv = parts_dir / f"{stage_name}_snr_{acc.snr_db:06.3f}_s{seq}.csv"
                    future = pool.submit(
                        run_batch_job, cfg, args, acc.snr_db, args.batch_frames, round_index - 1, seq, out_csv
                    )
                    future_map[future] = acc

                while future_map:
                    done, _ = wait(list(future_map.keys()), timeout=1.0, return_when=FIRST_COMPLETED)
                    if not done:
                        render_status(out_dir, STATUSES, suite_start)
                        continue
                    for future in done:
                        acc = future_map.pop(future)
                        snr_db, counts, stderr_text = future.result()
                        acc.add(counts)
                        graph_frames += counts["frames"]
                        status.last_snr_db = snr_db
                        status.sweep_done += 1
                        remaining_per_snr[snr_db] -= 1
                        if remaining_per_snr[snr_db] <= 0 and snr_db in status.in_flight:
                            status.in_flight.remove(snr_db)
                        if stderr_text:
                            status.point_logs.extend(line for line in stderr_text.splitlines() if line.strip())
                        if not acc.done and point_done(acc):
                            acc.done = True
                            # "Complete" means the error target was actually reached;
                            # a point stopped only by a frame cap is "capped", not complete.
                            if acc.decoded_errors >= args.target_errors:
                                status.completed_points += 1
                            else:
                                status.capped_points += 1
                        status.actual_elapsed_seconds = time.perf_counter() - t0
                        write_live_outputs(cfg, args, out_dir, status, rows_by_snr())
                        render_status(out_dir, STATUSES, suite_start)

        # Budget cutoff: any point still short of its target is finalized with
        # whatever data it has so the curve stays complete (just noisier there).
        status.in_flight = []
        for p in points:
            acc = accums[round_snr_key(p)]
            if not acc.done:
                acc.done = True
                if acc.decoded_errors >= args.target_errors:
                    status.completed_points += 1
                else:
                    status.capped_points += 1

    run_round_robin(coarse_points, "coarse")

    if args.adaptive_waterfall and not budget_exhausted():
        coarse_rows = sorted(rows_by_snr().values(), key=lambda row: row["snr_db"])
        fine_points, adaptive_note = choose_waterfall_refinement(
            coarse_rows,
            coarse_points,
            sweep_start,
            sweep_end,
            args.step_db,
            args.adaptive_fine_step,
            args.adaptive_span_steps,
        )
        if fine_points:
            status.adaptive_note = adaptive_note
            status.point_logs.append(adaptive_note)
            status.total_points += len(fine_points)
            if status.completed_points > 0:
                status.estimated_total_seconds = (
                    status.actual_elapsed_seconds / status.completed_points
                ) * status.total_points
            render_status(out_dir, STATUSES, suite_start)
            run_round_robin(fine_points, "fine")

    write_live_outputs(cfg, args, out_dir, status, rows_by_snr(), force_plot=True)
    status.actual_elapsed_seconds = time.perf_counter() - t0
    status.status = "done"
    status.finished_at = time.time()
    render_status(out_dir, STATUSES, suite_start)


def write_manifest(out_dir: Path, args: argparse.Namespace, statuses: List[GraphStatus]) -> None:
    manifest = out_dir / "README.txt"
    lines = [
        "Native BER simulation bundle generated from native C simulations.",
        "",
        "Channel: BPSK modulation + AWGN + hard demodulation",
        f"Sweep: {args.start_db:.2f} to {args.end_db:.2f} dB in {args.step_db:.2f} dB steps",
        f"Target decoded bit errors per point: {args.target_errors}",
        f"Max frames per point: {args.max_frames_per_point if args.max_frames_per_point > 0 else 'unlimited'}",
        f"Parallel jobs per graph: {args.jobs}",
        f"Calibration target decoded bit errors: {args.calibration_errors}",
        "",
        "Graphs:",
    ]
    for status in statuses:
        lines.append(f"- {status.name}: {status.cfg['label']}")
        lines.append(f"  elapsed: {status.actual_elapsed_seconds:.1f}s")
        if status.calibration_elapsed_seconds is not None:
            lines.append(f"  calibration: {status.calibration_elapsed_seconds:.2f}s")
        if status.adaptive_note:
            lines.append(f"  adaptive: {status.adaptive_note}")
        lines.append(f"  files: {', '.join(path.name for path in status.files)}")
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_graphs(raw: str) -> List[Dict[str, object]]:
    keys = [item.strip() for item in raw.split(",") if item.strip()]
    missing = [key for key in keys if key not in GRAPH_CONFIGS]
    if missing:
        raise SystemExit(f"Unknown graph keys: {', '.join(missing)}")
    configs = []
    for key in keys:
        cfg = copy.deepcopy(GRAPH_CONFIGS[key])
        cfg["key"] = key
        configs.append(cfg)
    return configs


def ensure_out_dir(path: Optional[Path]) -> Path:
    def refresh_latest_pointer(latest: Path, target: Path) -> None:
        (DEFAULT_OUT_ROOT / "latest.txt").write_text(str(target) + "\n", encoding="utf-8")

        if latest.exists() or latest.is_symlink():
            # `latest` is a junction (Windows, created via mklink /J) or a symlink
            # (POSIX) pointing at the previous run. Remove the pointer itself without
            # recursing into the run it targets. shutil.rmtree refuses to run on a
            # link/junction, so try unlink (POSIX symlink / file), then os.rmdir
            # (Windows junction / dir symlink / empty dir), then rmtree as a last
            # resort for a real non-empty directory.
            try:
                latest.unlink()
            except (OSError, PermissionError):
                try:
                    os.rmdir(latest)
                except OSError:
                    shutil.rmtree(latest, ignore_errors=True)

        if IS_WINDOWS:
            try:
                subprocess.run(
                    [
                        "cmd",
                        "/c",
                        "mklink",
                        "/J",
                        str(latest),
                        str(target),
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return
            except (FileNotFoundError, subprocess.CalledProcessError):
                pass

            return

        latest.symlink_to(target.name)

    if path:
        path.mkdir(parents=True, exist_ok=True)
        return path
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = DEFAULT_OUT_ROOT / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    latest = DEFAULT_OUT_ROOT / "latest"
    refresh_latest_pointer(latest, out_dir)
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Run native BCH/product/staircase BER simulations with live ETA reporting.")
    parser.add_argument("--start-db", type=float, default=0.0)
    parser.add_argument("--end-db", type=float, default=6.0)
    parser.add_argument("--step-db", type=float, default=0.1)
    parser.add_argument("--target-errors", type=int, default=300, help="Stop each SNR point once this many decoded bit errors have been observed.")
    parser.add_argument("--max-frames-per-point", "--frames", dest="max_frames_per_point", type=int, default=0, help="Optional safety cap on frames per SNR point. Use 0 for no cap.")
    parser.add_argument("--staircase-mode", choices=("terminated", "streaming"), default="terminated", help="Staircase simulation mode. 'terminated': finite chain of --staircase-data-blocks (rate approaches the asymptote as blocks grow). 'streaming': continuous sliding-window chain at the exact asymptotic rate (matches the paper).")
    parser.add_argument("--staircase-data-blocks", type=int, default=0, help="Override the per-graph data_blocks for terminated staircase runs (0 = use the config value). Ignored in streaming mode.")
    parser.add_argument("--batch-frames", type=int, default=10, help="Frames simulated per SNR point per batch. Smaller = shorter sweeps / smoother live curve; larger = less per-batch process overhead.")
    parser.add_argument("--time-budget-seconds", type=float, default=0.0, help="Optional per-graph wall-clock budget. When exceeded, remaining points are finalized with whatever data they have. 0 = unlimited.")
    parser.add_argument("--frame-budget", type=int, default=0, help="Optional per-graph cap on total frames across all SNR points. 0 = unlimited.")
    parser.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    parser.add_argument("--graphs", type=str, default="bch_255,product_255,staircase_254,bch_511,product_511,staircase_510", help="Comma-separated graph keys.")
    parser.add_argument("--calibration-errors", "--calibration-frames", dest="calibration_errors", type=int, default=12, help="Smaller decoded-error target used for ETA calibration.")
    parser.add_argument("--adaptive-fine-step", type=float, default=0.02, help="Fine SNR step used for automatic waterfall refinement.")
    parser.add_argument("--adaptive-span-steps", type=int, default=2, help="How many coarse steps to extend on each side of the detected waterfall interval.")
    parser.add_argument("--adaptive-waterfall", dest="adaptive_waterfall", action="store_true", help="Automatically refine the steepest waterfall region with denser SNR points.")
    parser.add_argument("--no-adaptive-waterfall", dest="adaptive_waterfall", action="store_false", help="Disable automatic waterfall refinement.")
    parser.add_argument("--live-plot-interval-seconds", type=float, default=5.0, help="Minimum time between live plot refreshes while a graph is still running.")
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--skip-build", action="store_true")
    parser.set_defaults(adaptive_waterfall=True)
    args = parser.parse_args()

    if args.target_errors <= 0:
        raise SystemExit("target-errors must be positive")
    if args.max_frames_per_point < 0:
        raise SystemExit("max-frames-per-point must be non-negative")
    if args.step_db <= 0:
        raise SystemExit("step-db must be positive")
    if args.jobs <= 0:
        raise SystemExit("jobs must be positive")
    if args.calibration_errors <= 0:
        raise SystemExit("calibration-errors must be positive")
    if args.adaptive_fine_step <= 0:
        raise SystemExit("adaptive-fine-step must be positive")
    if args.adaptive_span_steps < 0:
        raise SystemExit("adaptive-span-steps must be non-negative")
    if args.live_plot_interval_seconds < 0:
        raise SystemExit("live-plot-interval-seconds must be non-negative")

    out_dir = ensure_out_dir(args.out_dir)

    if not args.skip_build:
        build_runners()

    configs = parse_graphs(args.graphs)

    def graph_point_count(cfg: Dict[str, object]) -> int:
        start = float(cfg.get("sweep_start_db", args.start_db))
        end = float(cfg.get("sweep_end_db", args.end_db))
        return len(build_snr_points(start, end, args.step_db))

    global STATUSES
    STATUSES = [GraphStatus(name=str(cfg["key"]), cfg=cfg, total_points=graph_point_count(cfg)) for cfg in configs]
    suite_start = time.time()
    render_status(out_dir, STATUSES, suite_start)

    for status in STATUSES:
        status.status = "calibrating"
        render_status(out_dir, STATUSES, suite_start)
        elapsed = calibrate_graph(status.cfg, args, out_dir, args.calibration_errors)
        status.calibration_elapsed_seconds = elapsed
        n_points = status.total_points
        status.estimated_total_seconds = elapsed * (args.target_errors / args.calibration_errors) * (n_points / max(1, min(args.jobs, n_points)))
        status.status = "pending"
        render_status(out_dir, STATUSES, suite_start)

    for status in STATUSES:
        run_case(status.cfg, args, out_dir, status, suite_start)

    write_manifest(out_dir, args, STATUSES)
    render_status(out_dir, STATUSES, suite_start)
    print(f"\nAll BER simulations complete. Results are in {out_dir}")


STATUSES: List[GraphStatus] = []


if __name__ == "__main__":
    main()
