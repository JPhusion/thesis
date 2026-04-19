#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="${ROOT}/.venv-ber-suite"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This bootstrap script is intended for Linux/WSL."
  exit 1
fi

if [[ -f /proc/version ]] && ! grep -qiE "microsoft|wsl" /proc/version; then
  echo "Warning: this does not look like WSL. Continuing anyway because Linux is supported."
fi

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "[1/4] Installing Ubuntu/WSL packages..."
${SUDO} apt-get update
${SUDO} apt-get install -y \
  build-essential \
  make \
  python3 \
  python3-venv \
  python3-pip \
  git \
  curl \
  ca-certificates \
  pkg-config \
  openssh-server

echo "[2/4] Creating Python virtual environment at ${VENV}..."
if [[ ! -x "${VENV}/bin/python" ]]; then
  python3 -m venv "${VENV}"
fi

echo "[3/4] Installing Python plotting dependencies..."
"${VENV}/bin/python" -m pip install --upgrade pip
"${VENV}/bin/python" -m pip install matplotlib

echo "[4/4] Environment bootstrap complete."
echo
echo "Next step:"
echo "  ${ROOT}/scripts/wsl/run_all_ber.sh"
