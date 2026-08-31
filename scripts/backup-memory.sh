#!/usr/bin/env bash
# Local-only OpenClaw memory backup. Remote sync belongs in a dedicated backup service.

set -euo pipefail

WORKSPACE_DIR="/root/.openclaw/workspace"
BACKUP_DIR="$WORKSPACE_DIR/memory-backups"
TIMESTAMP="$(date +%Y-%m-%d-%H-%M-%S)"
TARGET_DIR="$BACKUP_DIR/memory-$TIMESTAMP"

mkdir -p "$TARGET_DIR"
cp -r "$WORKSPACE_DIR/memory" "$TARGET_DIR/memory"

for filename in MEMORY.md AGENTS.md SOUL.md USER.md TOOLS.md; do
  if [[ -f "$WORKSPACE_DIR/$filename" ]]; then
    cp "$WORKSPACE_DIR/$filename" "$TARGET_DIR/$filename"
  fi
done

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'memory-*' -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +31 \
  | cut -d' ' -f2- \
  | xargs -r rm -rf

echo "Local memory backup complete: $TARGET_DIR"
