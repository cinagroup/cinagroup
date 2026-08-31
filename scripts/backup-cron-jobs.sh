#!/usr/bin/env bash
# Local-only OpenClaw schedule backup. Repository mutation is prohibited here.

set -euo pipefail

BACKUP_DIR="/root/.openclaw/workspace/cron-backups"
SOURCE_FILE="/root/.openclaw/cron/jobs.json"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"
cp "$SOURCE_FILE" "$BACKUP_DIR/jobs.$TIMESTAMP.json"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'jobs.*.json' -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +31 \
  | cut -d' ' -f2- \
  | xargs -r rm -f

echo "[$TIMESTAMP] Local schedule backup complete"
