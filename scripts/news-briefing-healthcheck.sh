#!/usr/bin/env bash
# Compatibility health check for the retired automated briefing workflow.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$SITE_DIR"
node scripts/audit-content-governance.mjs --source-only
