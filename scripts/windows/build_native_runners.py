#!/usr/bin/env python3
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[2]
IS_WINDOWS = os.name == "nt"


def executable_name(stem: str) -> str:
    return stem + (".exe" if IS_WINDOWS else "")


def default_compiler() -> List[str]:
    env_compiler = os.environ.get("ZIG_EXE") or os.environ.get("ZIG")
    if env_compiler:
        compiler = Path(env_compiler)
        if compiler.name.lower().startswith("zig"):
            return [str(compiler), "cc"]
        return [str(compiler)]

    if IS_WINDOWS:
        zig_candidates = sorted((ROOT / ".tools" / "zig").glob("**/zig.exe"))
        if zig_candidates:
            return [str(zig_candidates[-1]), "cc"]
        raise SystemExit(
            "No Zig compiler found under .tools/zig. Run scripts/windows/bootstrap_windows_env.ps1 first."
        )

    for name in ("cc", "clang", "gcc"):
        found = shutil.which(name)
        if found:
            return [found]
    raise SystemExit("No C compiler found. Install cc/clang/gcc or pass --cc.")


def normalize_compiler(raw: str) -> List[str]:
    compiler = Path(raw)
    if compiler.name.lower().startswith("zig"):
        return [str(compiler), "cc"]
    return [str(compiler)]


def compile_target(cc_cmd: List[str], output: Path, includes: List[str], sources: List[str]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = (
        cc_cmd
        + [
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-O2",
            "-o",
            str(output),
        ]
        + includes
        + sources
        + ["-lm"]
    )
    print(f"[build] {output.relative_to(ROOT)}")
    subprocess.run(cmd, check=True, cwd=ROOT)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the native BER sweep runners without make.")
    parser.add_argument("--cc", help="Compiler executable to use. On Windows, pass zig.exe or let the script auto-detect it.")
    args = parser.parse_args()

    cc_cmd = normalize_compiler(args.cc) if args.cc else default_compiler()

    bch_sources = [
        "bch/apps/snr_sweep.c",
        "bch/src/gf.c",
        "bch/src/bch_gen.c",
        "bch/src/bch_encode.c",
        "bch/src/bch_trace.c",
        "bch/src/bch_syndrome.c",
        "bch/src/bch_bm.c",
        "bch/src/bch_chien.c",
        "bch/src/bch_decode.c",
    ]
    product_sources = [
        "product/apps/snr_sweep.c",
        "bch/src/gf.c",
        "bch/src/bch_gen.c",
        "bch/src/bch_encode.c",
        "bch/src/bch_trace.c",
        "bch/src/bch_syndrome.c",
        "bch/src/bch_bm.c",
        "bch/src/bch_chien.c",
        "bch/src/bch_decode.c",
        "product/src/product.c",
        "product/src/product_trace.c",
    ]
    staircase_sources = [
        "staircase/apps/snr_sweep.c",
        "bch/src/gf.c",
        "bch/src/bch_gen.c",
        "bch/src/bch_encode.c",
        "bch/src/bch_syndrome.c",
        "bch/src/bch_bm.c",
        "bch/src/bch_chien.c",
        "bch/src/bch_decode.c",
        "staircase/src/staircase.c",
        "staircase/src/staircase_trace.c",
    ]

    compile_target(
        cc_cmd,
        ROOT / "bch" / executable_name("build_bch_snr_sweep"),
        ["-Ibch/include"],
        bch_sources,
    )
    compile_target(
        cc_cmd,
        ROOT / "product" / executable_name("build_product_snr_sweep"),
        ["-Iproduct/include", "-Ibch/include"],
        product_sources,
    )
    compile_target(
        cc_cmd,
        ROOT / "staircase" / executable_name("build_staircase_snr_sweep"),
        ["-Istaircase/include", "-Ibch/include"],
        staircase_sources,
    )

    print("\nNative BER runners are ready.")


if __name__ == "__main__":
    main()
