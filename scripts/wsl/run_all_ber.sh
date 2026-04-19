#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="${ROOT}/.venv-ber-suite"
BOOTSTRAP=0
CACHE_ROOT="${ROOT}/.cache"

if [[ "${1:-}" == "--bootstrap" ]]; then
  BOOTSTRAP=1
  shift
fi

if (( BOOTSTRAP )); then
  "${ROOT}/scripts/wsl/bootstrap_wsl_env.sh"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is missing. Run ${ROOT}/scripts/wsl/bootstrap_wsl_env.sh first."
  exit 1
fi

if [[ ! -x "${VENV}/bin/python" ]]; then
  echo "Virtual environment not found at ${VENV}."
  echo "Run ${ROOT}/scripts/wsl/bootstrap_wsl_env.sh first, or rerun this script with --bootstrap."
  exit 1
fi

mkdir -p "${CACHE_ROOT}/matplotlib" "${CACHE_ROOT}/fontconfig"
export MPLCONFIGDIR="${CACHE_ROOT}/matplotlib"
export XDG_CACHE_HOME="${CACHE_ROOT}"

exec "${VENV}/bin/python" "${ROOT}/scripts/wsl/run_all_ber.py" "$@"
