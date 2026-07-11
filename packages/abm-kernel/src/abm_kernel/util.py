"""Shared kernel utilities (no external/Web dependencies)."""

from __future__ import annotations

import re
from datetime import UTC, datetime

_SNAKE_CASE = re.compile(r"^[a-z][a-z0-9_]*$")


def now_iso() -> str:
    """Current UTC time as an ISO8601 string (coding-standards: ISO8601 UTC)."""
    return datetime.now(UTC).isoformat()


def is_snake_case(value: str) -> bool:
    """True when value is a lowercase snake_case identifier."""
    return bool(_SNAKE_CASE.match(value))
