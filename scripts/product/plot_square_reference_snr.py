#!/usr/bin/env python3
import argparse
import csv
import math
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "product" / "build_product_snr_sweep"
DEFAULT_JOBS = min(4, max(1, (os.cpu_count() or 1)))
Y_MIN = 1e-7
Y_MAX = 1e-1

CONFIGS: Dict[str, Dict[str, object]] = {
    "255": {
        "name": "PC[BCH(255,231,3) x BCH(255,231,3)]",
        "row_m": 8,
        "row_t": 3,
        "row_prim": "0x11d",
        "col_m": 8,
        "col_t": 3,
        "col_prim": "0x11d",
        "seed": 2552313,
        "slug": "pc_255_square",
        "title": "Square Product Code with BCH(255,231,3) Components",
    },
    "511": {
        "name": "PC[BCH(511,484,3) x BCH(511,484,3)]",
        "row_m": 9,
        "row_t": 3,
        "row_prim": "0x211",
        "col_m": 9,
        "col_t": 3,
        "col_prim": "0x211",
        "seed": 5114843,
        "slug": "pc_511_square",
        "title": "Square Product Code with BCH(511,484,3) Components",
    },
}


def build_runner() -> None:
    subprocess.run(["make", "-C", str(ROOT / "product"), "snr_sweep"], check=True)


def build_snr_points(start_db: float, end_db: float, step_db: float) -> List[float]:
    points: List[float] = []
    value = start_db
    while value <= end_db + 1e-9:
        points.append(round(value, 3))
        value += step_db
    return points


def out_dir_default(code: str, frames: int) -> Path:
    return ROOT / "artifacts" / "product_snr" / f"code_{code}_frames_{frames}"


def csv_path_for(cfg: Dict[str, object], out_dir: Path) -> Path:
    return out_dir / f"{cfg['slug']}.csv"


def svg_path_for(cfg: Dict[str, object], out_dir: Path) -> Path:
    return out_dir / f"{cfg['slug']}_ber.svg"


def run_point_job(cfg: Dict[str, object], args: argparse.Namespace, snr_db: float, out_csv: Path) -> Tuple[float, str]:
    cmd = [
        str(RUNNER),
        "--row-m", str(cfg["row_m"]),
        "--row-t", str(cfg["row_t"]),
        "--row-prim", str(cfg["row_prim"]),
        "--col-m", str(cfg["col_m"]),
        "--col-t", str(cfg["col_t"]),
        "--col-prim", str(cfg["col_prim"]),
        "--max-iters", str(args.max_iters),
        "--start-db", f"{snr_db:.3f}",
        "--end-db", f"{snr_db:.3f}",
        "--step-db", str(args.step_db),
        "--frames", str(args.frames),
        "--seed", str(int(cfg["seed"]) ^ int(round(snr_db * 1000))),
        "--label", str(cfg["name"]),
        "--out", str(out_csv),
    ]
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return snr_db, proc.stderr.strip()


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


def write_merged_csv(cfg: Dict[str, object], rows: List[Dict[str, float]], args: argparse.Namespace, out_csv: Path) -> None:
    with out_csv.open("w", newline="") as fp:
        fp.write(f"# label,{cfg['name']}\n")
        fp.write(f"# max_iters,{args.max_iters}\n")
        fp.write(f"# frames,{args.frames}\n")
        fp.write("snr_db,raw_ber,decoded_ber,frame_success,frames\n")
        writer = csv.writer(fp)
        for row in rows:
            writer.writerow([
                f"{row['snr_db']:.3f}",
                f"{row['raw_ber']:.12g}",
                f"{row['decoded_ber']:.12g}",
                f"{row['frame_success']:.12g}",
                int(row["frames"]),
            ])


def x_to_px(x: float, left: float, width: float, x_min: float, x_max: float) -> float:
    return left + (x - x_min) / (x_max - x_min) * width


def normalized_x_range(x_min: float, x_max: float) -> tuple[float, float]:
    if abs(x_max - x_min) < 1e-12:
        return x_min - 0.5, x_max + 0.5
    return x_min, x_max


def y_to_px(y: float, top: float, height: float) -> float:
    yy = max(Y_MIN, min(Y_MAX, y))
    ly = math.log10(yy)
    return top + (math.log10(Y_MAX) - ly) / (math.log10(Y_MAX) - math.log10(Y_MIN)) * height


def polyline(points: List[tuple[float, float]], color: str, dashed: bool = False) -> str:
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    dash = ' stroke-dasharray="8 5"' if dashed else ""
    return f'<polyline fill="none" stroke="{color}" stroke-width="2.4"{dash} points="{pts}" />'


def circle_points(points: List[tuple[float, float]], color: str) -> str:
    return "\n".join(
        f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.8" fill="white" stroke="{color}" stroke-width="1.2" />'
        for x, y in points
    )


def draw_panel(title: str, rows: List[Dict[str, float]], x_min: float, x_max: float) -> str:
    width = 640
    height = 560
    x0 = 10
    y0 = 10
    x_min, x_max = normalized_x_range(x_min, x_max)
    left = x0 + 62
    top = y0 + 28
    plot_w = width - 82
    plot_h = height - 62

    svg = []
    svg.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{width:.1f}" height="{height:.1f}" rx="14" fill="white" stroke="#cdd8e6" />')
    svg.append(f'<text x="{x0 + 18:.1f}" y="{y0 + 22:.1f}" font-size="18" font-weight="700" fill="#243b53">{title}</text>')

    for tick in [10 ** p for p in range(-7, 0)]:
        y = y_to_px(tick, top, plot_h)
        svg.append(f'<line x1="{left:.2f}" y1="{y:.2f}" x2="{left + plot_w:.2f}" y2="{y:.2f}" stroke="#dfe7f1" stroke-width="1" />')
        svg.append(f'<text x="{left - 10:.2f}" y="{y + 4:.2f}" text-anchor="end" font-size="11" fill="#5a6b7d">1e{int(math.log10(tick))}</text>')

    for decade in range(-7, -1):
        for m in [2, 3, 4, 5, 6, 7, 8, 9]:
            tick = m * (10 ** decade)
            if tick >= Y_MAX:
                continue
            y = y_to_px(tick, top, plot_h)
            svg.append(f'<line x1="{left:.2f}" y1="{y:.2f}" x2="{left + plot_w:.2f}" y2="{y:.2f}" stroke="#eef3f8" stroke-width="1" />')

    tick = x_min
    while tick <= x_max + 1e-9:
        x = x_to_px(tick, left, plot_w, x_min, x_max)
        svg.append(f'<line x1="{x:.2f}" y1="{top:.2f}" x2="{x:.2f}" y2="{top + plot_h:.2f}" stroke="#e7edf5" stroke-width="1" />')
        svg.append(f'<text x="{x:.2f}" y="{top + plot_h + 20:.2f}" text-anchor="middle" font-size="11" fill="#5a6b7d">{tick:.1f}</text>')
        tick = round(tick + 0.5, 10)

    svg.append(f'<rect x="{left:.2f}" y="{top:.2f}" width="{plot_w:.2f}" height="{plot_h:.2f}" fill="none" stroke="#b7c7d8" stroke-width="1.2" />')
    svg.append(f'<text x="{left + plot_w / 2:.2f}" y="{top + plot_h + 42:.2f}" text-anchor="middle" font-size="13" fill="#334e68">Eb/N0 (dB)</text>')
    svg.append(f'<text x="{x0 + 20:.2f}" y="{top + plot_h / 2:.2f}" transform="rotate(-90 {x0 + 20:.2f},{top + plot_h / 2:.2f})" text-anchor="middle" font-size="13" fill="#334e68">BER</text>')

    decoded_pts = [(x_to_px(r["snr_db"], left, plot_w, x_min, x_max), y_to_px(r["decoded_ber"], top, plot_h)) for r in rows]
    raw_pts = [(x_to_px(r["snr_db"], left, plot_w, x_min, x_max), y_to_px(r["raw_ber"], top, plot_h)) for r in rows]
    svg.append(polyline(raw_pts, "#d96c54", dashed=True))
    svg.append(circle_points(raw_pts, "#d96c54"))
    svg.append(polyline(decoded_pts, "#0f8b73"))
    svg.append(circle_points(decoded_pts, "#0f8b73"))

    legend_x = left + 14
    legend_y = top + 14
    svg.append(f'<rect x="{legend_x - 10:.2f}" y="{legend_y - 16:.2f}" width="156" height="52" fill="rgba(255,255,255,0.92)" stroke="#b7c7d8" />')
    svg.append(f'<line x1="{legend_x:.2f}" y1="{legend_y:.2f}" x2="{legend_x + 24:.2f}" y2="{legend_y:.2f}" stroke="#0f8b73" stroke-width="2.4" />')
    svg.append(f'<text x="{legend_x + 30:.2f}" y="{legend_y + 4:.2f}" font-size="12" fill="#243b53">Decoded BER (iBDD PC)</text>')
    svg.append(f'<line x1="{legend_x:.2f}" y1="{legend_y + 20:.2f}" x2="{legend_x + 24:.2f}" y2="{legend_y + 20:.2f}" stroke="#d96c54" stroke-width="2.4" stroke-dasharray="8 5" />')
    svg.append(f'<text x="{legend_x + 30:.2f}" y="{legend_y + 24:.2f}" font-size="12" fill="#243b53">Raw BER</text>')
    return "\n".join(svg)


def write_svg(cfg: Dict[str, object], rows: List[Dict[str, float]], args: argparse.Namespace, out_path: Path) -> None:
    panel = draw_panel(str(cfg["title"]), rows, args.start_db, args.end_db)
    header = f'Product-Code BER Sweep, {args.start_db:.1f} to {args.end_db:.1f} dB, step {args.step_db:.1f} dB, {args.frames} frames/point'
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="660" height="610" viewBox="0 0 660 610">',
        '<rect width="100%" height="100%" fill="#f5f7fb" />',
        f'<text x="330" y="18" text-anchor="middle" font-size="16" font-weight="700" fill="#102a43">{header}</text>',
        panel,
        '</svg>'
    ]
    out_path.write_text("\n".join(svg), encoding="utf-8")


def run_code(cfg: Dict[str, object], args: argparse.Namespace, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = out_dir / f"_{cfg['slug']}_parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    points = build_snr_points(args.start_db, args.end_db, args.step_db)
    jobs = min(max(1, args.jobs), len(points))

    rows: List[Dict[str, float]] = []
    print(f"Running {cfg['name']} across {len(points)} SNR points with {args.frames} frames/point using {jobs} parallel jobs")
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        future_map = {}
        for snr_db in points:
            out_csv = parts_dir / f"snr_{snr_db:05.2f}.csv"
            future = pool.submit(run_point_job, cfg, args, snr_db, out_csv)
            future_map[future] = (snr_db, out_csv)

        for future in as_completed(future_map):
            snr_db, out_csv = future_map[future]
            point_db, stderr_text = future.result()
            if stderr_text:
                print(stderr_text)
            point_rows = load_csv(out_csv)
            if len(point_rows) != 1:
                raise RuntimeError(f"Expected exactly one CSV row for {point_db:.1f} dB, got {len(point_rows)}")
            rows.extend(point_rows)

    rows.sort(key=lambda row: row["snr_db"])
    merged_csv = csv_path_for(cfg, out_dir)
    write_merged_csv(cfg, rows, args, merged_csv)
    write_svg(cfg, rows, args, svg_path_for(cfg, out_dir))
    print(f"Saved merged CSV to {merged_csv}")
    print(f"Saved SVG plot to {svg_path_for(cfg, out_dir)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate square product-code BER reference plots.")
    parser.add_argument("--code", choices=["255", "511", "all"], default="all")
    parser.add_argument("--start-db", type=float, default=0.0)
    parser.add_argument("--end-db", type=float, default=6.0)
    parser.add_argument("--step-db", type=float, default=0.1)
    parser.add_argument("--frames", type=int, default=500)
    parser.add_argument("--max-iters", type=int, default=4)
    parser.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args()

    if args.step_db <= 0 or args.frames <= 0 or args.jobs <= 0:
        raise SystemExit("step-db, frames, and jobs must be positive")

    build_runner()

    codes = [args.code] if args.code != "all" else ["255", "511"]
    for code in codes:
        cfg = CONFIGS[code]
        target_out_dir = args.out_dir if args.out_dir is not None and len(codes) == 1 else out_dir_default(code, args.frames)
        run_code(cfg, args, target_out_dir)


if __name__ == "__main__":
    main()
