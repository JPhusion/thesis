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
BCH_RUNNER = ROOT / "bch" / "build_bch_snr_sweep"
PRODUCT_RUNNER = ROOT / "product" / "build_product_snr_sweep"
STAIRCASE_RUNNER = ROOT / "staircase" / "build_staircase_snr_sweep"
DEFAULT_OUT_ROOT = ROOT / "artifacts" / "wsl-ber-runs"
DEFAULT_JOBS = min(8, max(1, (os.cpu_count() or 1)))

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
        "plot_xmin": 0.0,
        "plot_xmax": 6.0,
        "m": 8,
        "t": 3,
        "prim": "0x11d",
        "seed": 2552313,
    },
    "product_255": {
        "slug": "product_255_awgn_ber",
        "family": "product",
        "label": "PC[BCH(255,231,3) x BCH(255,231,3)]",
        "title": "Square Product Code BER with BCH(255, 231, 3) Components",
        "subtitle": "Iterative hard-decision row/column decoding",
        "plot_xmin": 0.0,
        "plot_xmax": 6.0,
        "row_m": 8,
        "row_t": 3,
        "row_prim": "0x11d",
        "col_m": 8,
        "col_t": 3,
        "col_prim": "0x11d",
        "max_iters": 4,
        "seed": 2552313,
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
    completed_points: int = 0
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    last_snr_db: Optional[float] = None
    estimated_total_seconds: Optional[float] = None
    actual_elapsed_seconds: float = 0.0
    calibration_elapsed_seconds: Optional[float] = None
    point_logs: List[str] = field(default_factory=list)
    files: List[Path] = field(default_factory=list)


def build_runners() -> None:
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


def load_csv(path: Path) -> List[Dict[str, float]]:
    rows: List[Dict[str, float]] = []
    with path.open(newline="") as fp:
        reader = csv.DictReader(line for line in fp if not line.startswith("#"))
        for row in reader:
            rows.append(
                {
                    "snr_db": float(row["snr_db"]),
                    "raw_ber": float(row["raw_ber"]),
                    "decoded_ber": float(row["decoded_ber"]),
                    "frame_success": float(row["frame_success"]),
                    "frames": float(row["frames"]),
                }
            )
    return rows


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

    min_y = min(all_positive)
    max_y = max(max(all_positive), 1e-2)
    y_min = min(1e-7, 10 ** math.floor(math.log10(min_y)))
    y_max = max(1e-1, 10 ** math.ceil(math.log10(max_y)))

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
    ax.set_xlim(float(cfg.get("plot_xmin", start_db)), float(cfg.get("plot_xmax", end_db)))
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


def write_merged_csv(cfg: Dict[str, object], rows: List[Dict[str, float]], args: argparse.Namespace, out_csv: Path) -> None:
    with out_csv.open("w", newline="") as fp:
        fp.write(f"# label,{cfg['label']}\n")
        fp.write(f"# family,{cfg['family']}\n")
        fp.write(f"# title,{cfg['title']}\n")
        fp.write(f"# subtitle,{cfg['subtitle']}\n")
        fp.write("# channel,BPSK modulation + AWGN + hard demodulation\n")
        fp.write(f"# frames,{args.frames}\n")
        fp.write(f"# start_db,{args.start_db}\n")
        fp.write(f"# end_db,{args.end_db}\n")
        fp.write(f"# step_db,{args.step_db}\n")
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


def make_point_command(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, frames: int, out_csv: Path, seed: int) -> List[str]:
    family = str(cfg["family"])
    if family == "bch":
        return [
            str(BCH_RUNNER),
            "--m", str(cfg["m"]),
            "--t", str(cfg["t"]),
            "--prim", str(cfg["prim"]),
            "--start-db", f"{snr_db:.3f}",
            "--end-db", f"{snr_db:.3f}",
            "--step-db", str(args.step_db),
            "--frames", str(frames),
            "--seed", str(seed),
            "--label", str(cfg["label"]),
            "--out", str(out_csv),
        ]
    if family == "product":
        return [
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
            "--frames", str(frames),
            "--seed", str(seed),
            "--label", str(cfg["label"]),
            "--out", str(out_csv),
        ]
    if family == "staircase":
        return [
            str(STAIRCASE_RUNNER),
            "--m", str(cfg["m"]),
            "--t", str(cfg["t"]),
            "--prim", str(cfg["prim"]),
            "--data-blocks", str(cfg["data_blocks"]),
            "--window", str(cfg["window_size"]),
            "--max-iters", str(cfg["max_iters"]),
            "--start-db", f"{snr_db:.3f}",
            "--end-db", f"{snr_db:.3f}",
            "--step-db", str(args.step_db),
            "--frames", str(frames),
            "--seed", str(seed),
            "--label", str(cfg["label"]),
            "--out", str(out_csv),
        ]
    raise ValueError(f"Unsupported family: {family}")


def run_point_job(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, frames: int, out_csv: Path) -> Tuple[float, str]:
    seed = int(cfg["seed"]) ^ int(round(snr_db * 1000.0))
    cmd = make_point_command(cfg, args, snr_db, frames, out_csv, seed)
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return snr_db, proc.stderr.strip()


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
    if status.status == "running" and status.completed_points > 0 and status.started_at is not None:
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
                "total_points": status.total_points,
                "last_snr_db": status.last_snr_db,
                "estimated_total_seconds": total_seconds_for_status(status, now),
                "predicted_start": datetime.fromtimestamp(start_at).isoformat() if start_at else None,
                "predicted_finish": datetime.fromtimestamp(finish_at).isoformat() if finish_at else None,
                "actual_elapsed_seconds": status.actual_elapsed_seconds,
                "files": [str(path) for path in status.files],
            }
            for status, start_at, finish_at in schedule
        ],
    }
    (out_dir / "progress.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


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
        f"{'Graph':24} {'Status':10} {'Points':11} {'Last':8} {'ETA':10} {'Finish':8}",
        "-" * 80,
    ]
    for status, _start_at, finish_at in schedule:
        eta = None
        if finish_at is not None:
            eta = finish_at - now
        lines.append(
            f"{status.name:24} "
            f"{status.status:10} "
            f"{status.completed_points:3d}/{status.total_points:<7d} "
            f"{('-' if status.last_snr_db is None else f'{status.last_snr_db:.1f}dB'):8} "
            f"{format_duration(eta):10} "
            f"{format_finish(finish_at):8}"
        )
    if sys.stdout.isatty():
        sys.stdout.write("\033[2J\033[H")
    sys.stdout.write("\n".join(lines) + "\n")
    sys.stdout.flush()
    write_progress_json(out_dir, statuses, suite_start)


def calibrate_graph(cfg: Dict[str, object], args: argparse.Namespace, out_dir: Path, cal_frames: int) -> float:
    cal_dir = out_dir / "_calibration"
    cal_dir.mkdir(parents=True, exist_ok=True)
    out_csv = cal_dir / f"{cfg['slug']}_calibration.csv"
    if out_csv.exists():
        out_csv.unlink()
    t0 = time.perf_counter()
    run_point_job(cfg, args, args.start_db, cal_frames, out_csv)
    elapsed = time.perf_counter() - t0
    return elapsed


def run_case(cfg: Dict[str, object], args: argparse.Namespace, out_dir: Path, status: GraphStatus, suite_start: float) -> None:
    parts_dir = out_dir / f"_{cfg['slug']}_parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    points = build_snr_points(args.start_db, args.end_db, args.step_db)
    jobs = min(max(1, args.jobs), len(points))
    rows: List[Dict[str, float]] = []
    t0 = time.perf_counter()
    status.status = "running"
    status.started_at = time.time()
    render_status(out_dir, STATUSES, suite_start)

    with ThreadPoolExecutor(max_workers=jobs) as pool:
        future_map = {}
        for snr_db in points:
            out_csv = parts_dir / f"snr_{snr_db:05.2f}.csv"
            future = pool.submit(run_point_job, cfg, args, snr_db, args.frames, out_csv)
            future_map[future] = (snr_db, out_csv)

        while future_map:
            done, _ = wait(list(future_map.keys()), timeout=1.0, return_when=FIRST_COMPLETED)
            if not done:
                render_status(out_dir, STATUSES, suite_start)
                continue

            for future in done:
                snr_db, out_csv = future_map.pop(future)
                point_db, stderr_text = future.result()
                status.last_snr_db = point_db
                status.completed_points += 1
                if stderr_text:
                    status.point_logs.extend(line for line in stderr_text.splitlines() if line.strip())
                point_rows = load_csv(out_csv)
                if len(point_rows) != 1:
                    raise RuntimeError(f"Expected exactly one CSV row for {point_db:.3f} dB, got {len(point_rows)}")
                rows.extend(point_rows)
                status.actual_elapsed_seconds = time.perf_counter() - t0
                render_status(out_dir, STATUSES, suite_start)

    rows.sort(key=lambda row: row["snr_db"])
    csv_path = out_dir / f"{cfg['slug']}.csv"
    plot_base = out_dir / str(cfg["slug"])
    write_merged_csv(cfg, rows, args, csv_path)
    make_plot(cfg, rows, plot_base, args.start_db, args.end_db)
    status.files.extend(
        [
            csv_path,
            plot_base.with_suffix(".png"),
            plot_base.with_suffix(".pdf"),
            plot_base.with_suffix(".svg"),
        ]
    )
    status.actual_elapsed_seconds = time.perf_counter() - t0
    status.status = "done"
    status.finished_at = time.time()
    render_status(out_dir, STATUSES, suite_start)


def write_manifest(out_dir: Path, args: argparse.Namespace, statuses: List[GraphStatus]) -> None:
    manifest = out_dir / "README.txt"
    lines = [
        "WSL/Linux BER simulation bundle generated from native C simulations.",
        "",
        "Channel: BPSK modulation + AWGN + hard demodulation",
        f"Sweep: {args.start_db:.2f} to {args.end_db:.2f} dB in {args.step_db:.2f} dB steps",
        f"Frames per point: {args.frames}",
        f"Parallel jobs per graph: {args.jobs}",
        f"Calibration frames: {args.calibration_frames}",
        "",
        "Graphs:",
    ]
    for status in statuses:
        lines.append(f"- {status.name}: {status.cfg['label']}")
        lines.append(f"  elapsed: {status.actual_elapsed_seconds:.1f}s")
        if status.calibration_elapsed_seconds is not None:
            lines.append(f"  calibration: {status.calibration_elapsed_seconds:.2f}s")
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
    if path:
        path.mkdir(parents=True, exist_ok=True)
        return path
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = DEFAULT_OUT_ROOT / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    latest = DEFAULT_OUT_ROOT / "latest"
    if latest.exists() or latest.is_symlink():
        latest.unlink()
    latest.symlink_to(out_dir.name)
    return out_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Run native BCH/product/staircase BER simulations from WSL/Linux with live ETA reporting.")
    parser.add_argument("--start-db", type=float, default=0.0)
    parser.add_argument("--end-db", type=float, default=6.0)
    parser.add_argument("--step-db", type=float, default=0.1)
    parser.add_argument("--frames", type=int, default=500)
    parser.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    parser.add_argument("--graphs", type=str, default="bch_255,product_255,staircase_62", help="Comma-separated graph keys.")
    parser.add_argument("--calibration-frames", type=int, default=4)
    parser.add_argument("--out-dir", type=Path, default=None)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    if args.frames <= 0:
        raise SystemExit("frames must be positive")
    if args.step_db <= 0:
        raise SystemExit("step-db must be positive")
    if args.jobs <= 0:
        raise SystemExit("jobs must be positive")
    if args.calibration_frames <= 0:
        raise SystemExit("calibration-frames must be positive")

    out_dir = ensure_out_dir(args.out_dir)

    if not args.skip_build:
        build_runners()

    configs = parse_graphs(args.graphs)
    points = build_snr_points(args.start_db, args.end_db, args.step_db)

    global STATUSES
    STATUSES = [GraphStatus(name=str(cfg["key"]), cfg=cfg, total_points=len(points)) for cfg in configs]
    suite_start = time.time()
    render_status(out_dir, STATUSES, suite_start)

    for status in STATUSES:
        status.status = "calibrating"
        render_status(out_dir, STATUSES, suite_start)
        elapsed = calibrate_graph(status.cfg, args, out_dir, args.calibration_frames)
        status.calibration_elapsed_seconds = elapsed
        status.estimated_total_seconds = elapsed * (args.frames / args.calibration_frames) * (len(points) / max(1, min(args.jobs, len(points))))
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
