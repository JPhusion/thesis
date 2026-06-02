#!/usr/bin/env python3
import argparse
import copy
import csv
import math
import os
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FormatStrFormatter, LogLocator, MultipleLocator

ROOT = Path(__file__).resolve().parents[2]
BCH_RUNNER = ROOT / "bch" / "build_bch_snr_sweep"
PRODUCT_RUNNER = ROOT / "product" / "build_product_snr_sweep"
DEFAULT_OUT_DIR = ROOT / "artifacts" / "thesis-seminar-plots"
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

CONFIGS: List[Dict[str, object]] = [
    {
        "slug": "bch_255_awgn_ber",
        "family": "bch",
        "label": "BCH(255,231,3)",
        "title": "BCH(255, 231, 3) BER over BPSK/AWGN",
        "subtitle": "Hard-decision BCH bounded-distance decoding",
        "plot_xmin": 3.6,
        "plot_xmax": 4.8,
        "m": 8,
        "t": 3,
        "prim": "0x11d",
        "bits_per_frame": 255,
        "seed": 2552313,
    },
    {
        "slug": "product_255_awgn_ber",
        "family": "product",
        "label": "PC[BCH(255,231,3) x BCH(255,231,3)]",
        "title": "Square Product Code BER with BCH(255, 231, 3) Components",
        "subtitle": "Iterative hard-decision row/column decoding (12 iterations)",
        "plot_xmin": 3.6,
        "plot_xmax": 4.8,
        "row_m": 8,
        "row_t": 3,
        "row_prim": "0x11d",
        "col_m": 8,
        "col_t": 3,
        "col_prim": "0x11d",
        "max_iters": 12,
        "bits_per_frame": 255 * 255,
        "seed": 2552313,
    },
    {
        "slug": "bch_511_awgn_ber",
        "family": "bch",
        "label": "BCH(511,484,3)",
        "title": "BCH(511, 484, 3) BER over BPSK/AWGN",
        "subtitle": "Hard-decision BCH bounded-distance decoding",
        "plot_xmin": 4.5,
        "plot_xmax": 5.2,
        "m": 9,
        "t": 3,
        "prim": "0x211",
        "bits_per_frame": 511,
        "seed": 5114843,
    },
    {
        "slug": "product_511_awgn_ber",
        "family": "product",
        "label": "PC[BCH(511,484,3) x BCH(511,484,3)]",
        "title": "Square Product Code BER with BCH(511, 484, 3) Components",
        "subtitle": "Iterative hard-decision row/column decoding (12 iterations)",
        "plot_xmin": 4.5,
        "plot_xmax": 5.2,
        "row_m": 9,
        "row_t": 3,
        "row_prim": "0x211",
        "col_m": 9,
        "col_t": 3,
        "col_prim": "0x211",
        "max_iters": 12,
        "bits_per_frame": 511 * 511,
        "seed": 5114843,
    },
]


def selected_configs(product_max_iters: int) -> List[Dict[str, object]]:
    configs = [copy.deepcopy(cfg) for cfg in CONFIGS]
    for cfg in configs:
        if cfg["family"] == "product":
            cfg["max_iters"] = product_max_iters
            cfg["title"] = f"{cfg['title']} ({product_max_iters} iterations)"
            cfg["subtitle"] = f"Iterative hard-decision row/column decoding ({product_max_iters} iterations)"
    return configs


def build_runners() -> None:
    subprocess.run(["make", "-C", str(ROOT / "bch"), "snr_sweep"], check=True)
    subprocess.run(["make", "-C", str(ROOT / "product"), "snr_sweep"], check=True)


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


def run_point_job(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, out_csv: Path) -> Tuple[float, str]:
    seed = int(cfg["seed"]) ^ int(round(snr_db * 1000.0))

    if cfg["family"] == "bch":
        cmd = [
            str(BCH_RUNNER),
            "--m",
            str(cfg["m"]),
            "--t",
            str(cfg["t"]),
            "--prim",
            str(cfg["prim"]),
            "--start-db",
            f"{snr_db:.3f}",
            "--end-db",
            f"{snr_db:.3f}",
            "--step-db",
            str(args.step_db),
            "--target-errors",
            str(args.target_errors),
            "--seed",
            str(seed),
            "--label",
            str(cfg["label"]),
            "--out",
            str(out_csv),
        ]
        if args.max_frames_per_point > 0:
            cmd.extend(["--max-frames", str(args.max_frames_per_point)])
    else:
        cmd = [
            str(PRODUCT_RUNNER),
            "--row-m",
            str(cfg["row_m"]),
            "--row-t",
            str(cfg["row_t"]),
            "--row-prim",
            str(cfg["row_prim"]),
            "--col-m",
            str(cfg["col_m"]),
            "--col-t",
            str(cfg["col_t"]),
            "--col-prim",
            str(cfg["col_prim"]),
            "--max-iters",
            str(cfg["max_iters"]),
            "--start-db",
            f"{snr_db:.3f}",
            "--end-db",
            f"{snr_db:.3f}",
            "--step-db",
            str(args.step_db),
            "--target-errors",
            str(args.target_errors),
            "--seed",
            str(seed),
            "--label",
            str(cfg["label"]),
            "--out",
            str(out_csv),
        ]
        if args.max_frames_per_point > 0:
            cmd.extend(["--max-frames", str(args.max_frames_per_point)])

    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return snr_db, proc.stderr.strip()


def write_merged_csv(cfg: Dict[str, object], rows: List[Dict[str, float]], args: argparse.Namespace, out_csv: Path) -> None:
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


def positive_series(rows: List[Dict[str, float]], key: str) -> Tuple[List[float], List[float]]:
    xs: List[float] = []
    ys: List[float] = []
    for row in rows:
        value = row[key]
        if value > 0.0:
            xs.append(row["snr_db"])
            ys.append(value)
    return xs, ys


def make_plot(cfg: Dict[str, object], rows: List[Dict[str, float]], out_base: Path) -> None:
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
    ax.set_xlim(float(cfg["plot_xmin"]), float(cfg["plot_xmax"]))
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


def render_existing_plots(args: argparse.Namespace) -> None:
    generated: List[Path] = []
    timings: Dict[str, float] = {}
    for cfg in selected_configs(args.product_max_iters):
        csv_path = args.out_dir / f"{cfg['slug']}.csv"
        if not csv_path.exists():
            raise FileNotFoundError(f"Missing existing CSV for plot-only render: {csv_path}")
        rows = load_csv(csv_path)
        plot_base = args.out_dir / str(cfg["slug"])
        t0 = time.perf_counter()
        make_plot(cfg, rows, plot_base)
        timings[str(cfg["slug"])] = time.perf_counter() - t0
        generated.extend(
            [
                csv_path,
                plot_base.with_suffix(".png"),
                plot_base.with_suffix(".pdf"),
                plot_base.with_suffix(".svg"),
            ]
        )
        print(
            f"Re-rendered plots from {csv_path} -> "
            f"{plot_base.with_suffix('.png')}, {plot_base.with_suffix('.pdf')}, {plot_base.with_suffix('.svg')}"
        )
    write_manifest(args.out_dir, generated, args, timings)
    print(f"Re-rendered existing thesis seminar plots under {args.out_dir}")


def write_manifest(out_dir: Path, generated: List[Path], args: argparse.Namespace, timings: Dict[str, float]) -> None:
    manifest = out_dir / "README.txt"
    lines = [
        "Thesis seminar BER plots generated from native C simulations.",
        "",
        "Channel: BPSK modulation + AWGN + hard demodulation",
        f"Sweep: {args.start_db:.1f} to {args.end_db:.1f} dB in {args.step_db:.1f} dB steps",
        f"Target decoded bit errors per point: {args.target_errors}",
        f"Max frames per point: {args.max_frames_per_point if args.max_frames_per_point > 0 else 'unlimited'}",
        f"Parallel jobs per case: {args.jobs}",
        f"Product iterations: {args.product_max_iters}",
        "",
        "Per-graph elapsed time (seconds):",
    ]
    lines.extend(f"- {slug}: {seconds:.1f}s" for slug, seconds in timings.items())
    lines.extend(
        [
            "",
        "Generated files:",
        ]
    )
    lines.extend(f"- {path.name}" for path in sorted(generated, key=lambda path: path.name))
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_case(cfg: Dict[str, object], args: argparse.Namespace, out_dir: Path) -> Tuple[List[Path], float]:
    parts_dir = out_dir / f"_{cfg['slug']}_parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    points = build_snr_points(args.start_db, args.end_db, args.step_db)
    jobs = min(max(1, args.jobs), len(points))
    rows: List[Dict[str, float]] = []
    t0 = time.perf_counter()

    print(
        f"Running {cfg['label']} ({cfg['family']}) across {len(points)} SNR points "
        f"until {args.target_errors} decoded bit errors/point using {jobs} parallel jobs"
    )
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        future_map = {}
        for snr_db in points:
            out_csv = parts_dir / f"snr_{snr_db:05.2f}.csv"
            future = pool.submit(run_point_job, cfg, args, snr_db, out_csv)
            future_map[future] = (snr_db, out_csv)

        for future in as_completed(future_map):
            _snr_db, out_csv = future_map[future]
            point_db, stderr_text = future.result()
            if stderr_text:
                print(stderr_text)
            point_rows = load_csv(out_csv)
            if len(point_rows) != 1:
                raise RuntimeError(f"Expected exactly one CSV row for {point_db:.1f} dB, got {len(point_rows)}")
            rows.extend(point_rows)

    rows.sort(key=lambda row: row["snr_db"])
    csv_path = out_dir / f"{cfg['slug']}.csv"
    plot_base = out_dir / str(cfg["slug"])
    write_merged_csv(cfg, rows, args, csv_path)
    make_plot(cfg, rows, plot_base)
    print(f"Saved CSV to {csv_path}")
    print(
        f"Saved plots to {plot_base.with_suffix('.png')}, "
        f"{plot_base.with_suffix('.pdf')}, and {plot_base.with_suffix('.svg')}"
    )
    return (
        [
            csv_path,
            plot_base.with_suffix(".png"),
            plot_base.with_suffix(".pdf"),
            plot_base.with_suffix(".svg"),
        ],
        time.perf_counter() - t0,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate thesis-ready BER plots for BCH and product codes over BPSK/AWGN.")
    parser.add_argument("--start-db", type=float, default=0.0)
    parser.add_argument("--end-db", type=float, default=6.0)
    parser.add_argument("--step-db", type=float, default=0.1)
    parser.add_argument("--target-errors", type=int, default=300)
    parser.add_argument("--max-frames-per-point", "--frames", dest="max_frames_per_point", type=int, default=0)
    parser.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--product-max-iters", type=int, default=12)
    parser.add_argument("--plot-only", action="store_true", help="Regenerate plots from existing merged CSVs without rerunning any simulations.")
    args = parser.parse_args()

    if args.target_errors <= 0:
        raise SystemExit("target-errors must be positive")
    if args.max_frames_per_point < 0:
        raise SystemExit("max-frames-per-point must be non-negative")
    if args.step_db <= 0.0:
        raise SystemExit("step-db must be positive")
    if args.product_max_iters <= 0:
        raise SystemExit("product-max-iters must be positive")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.plot_only:
        render_existing_plots(args)
        return

    build_runners()

    generated: List[Path] = []
    timings: Dict[str, float] = {}
    for cfg in selected_configs(args.product_max_iters):
        case_files, elapsed = run_case(cfg, args, args.out_dir)
        generated.extend(case_files)
        timings[str(cfg["slug"])] = elapsed

    write_manifest(args.out_dir, generated, args, timings)
    print(f"All thesis seminar plots saved under {args.out_dir}")


if __name__ == "__main__":
    main()
