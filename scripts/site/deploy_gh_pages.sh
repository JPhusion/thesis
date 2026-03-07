#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="${ROOT_DIR}/site"
BRANCH="gh-pages"

if [[ ! -d "${SITE_DIR}" ]]; then
    echo "error: site directory not found at ${SITE_DIR}" >&2
    exit 1
fi

if ! command -v git >/dev/null 2>&1; then
    echo "error: git not found" >&2
    exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
    git -C "${ROOT_DIR}" worktree remove --force "${TMP_DIR}" >/dev/null 2>&1 || true
    rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Preparing ${BRANCH} worktree..."
if git -C "${ROOT_DIR}" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git -C "${ROOT_DIR}" worktree add "${TMP_DIR}" "${BRANCH}" >/dev/null
else
    git -C "${ROOT_DIR}" worktree add -B "${BRANCH}" "${TMP_DIR}" >/dev/null
fi

echo "Syncing /site to ${BRANCH}..."
find "${TMP_DIR}" -mindepth 1 -maxdepth 1 ! -name ".git" -exec rm -rf {} +
(cd "${SITE_DIR}" && tar cf - .) | (cd "${TMP_DIR}" && tar xf -)
touch "${TMP_DIR}/.nojekyll"

git -C "${TMP_DIR}" add -A
if git -C "${TMP_DIR}" diff --cached --quiet; then
    echo "No changes to deploy."
    exit 0
fi

SOURCE_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
git -C "${TMP_DIR}" commit -m "Deploy site from ${SOURCE_SHA}" >/dev/null
git -C "${TMP_DIR}" push origin "${BRANCH}"

echo "Deployment pushed to origin/${BRANCH}"
