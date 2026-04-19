#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script must be run inside your WSL Linux distro."
  exit 1
fi

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "[1/5] Installing OpenSSH server..."
${SUDO} apt-get update
${SUDO} apt-get install -y openssh-server

echo "[2/5] Enabling systemd in /etc/wsl.conf if needed..."
${SUDO} mkdir -p /etc
if [[ ! -f /etc/wsl.conf ]] || ! grep -q "systemd=true" /etc/wsl.conf; then
  cat <<'EOF' | ${SUDO} tee /etc/wsl.conf >/dev/null
[boot]
systemd=true
EOF
  echo "Updated /etc/wsl.conf with systemd=true."
  echo "After this script finishes, run 'wsl --shutdown' from Windows PowerShell, then reopen WSL once."
fi

echo "[3/5] Writing hardened sshd config include..."
${SUDO} mkdir -p /etc/ssh/sshd_config.d
cat <<'EOF' | ${SUDO} tee /etc/ssh/sshd_config.d/99-wsl-cloudflare.conf >/dev/null
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
X11Forwarding no
AllowTcpForwarding yes
GatewayPorts no
ClientAliveInterval 120
ClientAliveCountMax 2
EOF

echo "[4/5] Preparing ~/.ssh directory..."
mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"
touch "${HOME}/.ssh/authorized_keys"
chmod 600 "${HOME}/.ssh/authorized_keys"

echo "[5/5] Starting and enabling ssh..."
if command -v systemctl >/dev/null 2>&1; then
  ${SUDO} systemctl enable --now ssh
  ${SUDO} systemctl status ssh --no-pager || true
else
  echo "systemctl is not available yet. Restart WSL after enabling systemd, then run:"
  echo "  sudo systemctl enable --now ssh"
fi

echo
echo "WSL SSH setup is complete."
echo "Next: follow docs/WSL_CLOUDFLARE_SSH.md to expose this Linux sshd through Cloudflare."
