#!/usr/bin/env bash
# RETIRED: the former job generated unsourced news and published it directly.

set -euo pipefail

cat >&2 <<'MESSAGE'
This automated news publisher is retired and intentionally fails closed.

New journal entries must provide reviewable sources, use an explicit content
status, pass editorial review, and be published through the normal pull-request
workflow. See docs/content-governance.md.
MESSAGE

exit 64
