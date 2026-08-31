#!/usr/bin/env bash
# RETIRED: historical briefings are immutable, unverified archive records.

set -euo pipefail

cat >&2 <<'MESSAGE'
Bulk regeneration is disabled.

Rewriting historical claims with generated text would destroy provenance. The
archive remains available only at its original detail URLs, is excluded from
public indexes, and may be corrected solely through an explicit reviewed
correction record. See docs/content-governance.md.
MESSAGE

exit 64
