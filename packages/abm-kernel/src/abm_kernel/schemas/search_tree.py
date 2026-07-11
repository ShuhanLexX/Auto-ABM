"""SearchTree contract — see docs/architecture/data-contracts.md §12 (P2-3).

A process-visualization tree deterministically projected from a *real* search that
already happened in the system (an inverse-mechanism study or a parameter-sweep
experiment). Node scores/status come from real evaluation results and nodes link
to real Runs; the kernel never fabricates branches or scores (constitution P2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from abm_kernel.schemas.model_config import KernelBaseModel
from abm_kernel.util import now_iso

SEARCH_TREE_SCHEMA_VERSION = "1"

SearchNodeKind = Literal["mechanism", "parameter", "simulation", "plan"]
SearchNodeStatus = Literal["pending", "running", "done", "pruned", "failed"]


class SearchNode(KernelBaseModel):
    id: str
    parent_id: str | None = None
    kind: SearchNodeKind
    label: str
    payload: dict[str, object] = Field(default_factory=dict)  # candidate detail (name/rationale)
    status: SearchNodeStatus = "pending"
    score: float | None = None  # real evaluation score (None = not evaluated; never faked)
    run_ids: list[str] = Field(default_factory=list)  # linked real Runs (traceable, P1/P2)


class SearchTree(KernelBaseModel):
    schema_version: str = SEARCH_TREE_SCHEMA_VERSION
    id: str
    objective: str  # natural-language search goal
    kind: SearchNodeKind  # search-object type (= the child nodes' kind)
    source_id: str  # the real entity it was projected from (study_id / experiment_id)
    nodes: list[SearchNode] = Field(default_factory=list)  # nodes[0] = root
    created_at: str = Field(default_factory=now_iso)


__all__ = [
    "SEARCH_TREE_SCHEMA_VERSION",
    "SearchNode",
    "SearchNodeKind",
    "SearchNodeStatus",
    "SearchTree",
]
