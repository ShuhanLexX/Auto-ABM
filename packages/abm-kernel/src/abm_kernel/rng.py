"""Deterministic seed derivation (constitution P1).

The model RNG is seeded by Mesa from a single integer; auxiliary random sources
(e.g. network generation) derive an independent but deterministic sub-seed from it
so that one source's draws do not shift another's stream.
"""

from __future__ import annotations

import hashlib

GRAPH_SALT = 1


def derive_seed(seed: int, salt: int) -> int:
    """Deterministically derive a 32-bit sub-seed from (seed, salt) using SHA-256."""
    digest = hashlib.sha256(f"{seed}:{salt}".encode()).digest()
    return int.from_bytes(digest[:4], "big")
