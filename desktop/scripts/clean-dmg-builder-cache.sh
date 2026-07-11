#!/usr/bin/env bash

set -euo pipefail

CACHE_ROOT="${ELECTRON_BUILDER_CACHE:-${HOME}/Library/Caches/electron-builder}"
DMG_CACHE_DIR="${CACHE_ROOT}/dmg-builder@1.2.0"

has_files() {
  local dir="$1"
  find "${dir}" -mindepth 1 \( -type f -o -type l \) -print -quit 2>/dev/null | grep -q .
}

if [[ ! -d "${DMG_CACHE_DIR}" ]]; then
  exit 0
fi

while IFS= read -r bundle_dir; do
  if [[ -d "${bundle_dir}" ]] && ! has_files "${bundle_dir}"; then
    echo "[clean-dmg-builder-cache] Removing empty cache dir: ${bundle_dir}"
    rm -rf "${bundle_dir}"
  fi
done < <(find "${DMG_CACHE_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'dmgbuild-bundle-*' 2>/dev/null)

if ! has_files "${DMG_CACHE_DIR}"; then
  echo "[clean-dmg-builder-cache] Removing empty release cache: ${DMG_CACHE_DIR}"
  rm -rf "${DMG_CACHE_DIR}"
fi
