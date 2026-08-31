#!/usr/bin/env python3
"""Retired compatibility entry point for the unsafe historical rewriter."""

import sys


def main() -> int:
    print(
        "Historical briefing rewriting is disabled. "
        "Use reviewed corrections under docs/content-governance.md.",
        file=sys.stderr,
    )
    return 64


if __name__ == "__main__":
    raise SystemExit(main())
