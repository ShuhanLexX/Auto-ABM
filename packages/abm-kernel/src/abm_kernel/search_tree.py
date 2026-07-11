"""Deterministic search-tree projection for process visualization (M2.3 / P2-3).

Pure functions, no IO: project a *real* search (an inverse-mechanism study, or a
parameter-sweep experiment via candidates assembled by the backend from real
aggregation) into a SearchTree. Node scores/status are taken from real results and
are never fabricated (P1/P2). `prune_below` only flips the display status of already
evaluated low-scoring children — it never deletes nodes or rewrites scores.
"""

from __future__ import annotations

from typing import NamedTuple
from uuid import uuid4

from abm_kernel.schemas.phenomenon import MechanismComparisonStudy
from abm_kernel.schemas.search_tree import (
    SearchNode,
    SearchNodeKind,
    SearchNodeStatus,
    SearchTree,
)

ROOT_ID = "root"

# Map a hypothesis status (phenomenon.py) onto a search-node status.
_HYP_STATUS: dict[str, SearchNodeStatus] = {
    "completed": "done",
    "failed": "failed",
    "pending": "pending",
}


class SearchCandidate(NamedTuple):
    """One real candidate scheme to hang under the root (already evaluated or not)."""

    id: str
    label: str
    score: float | None = None
    status: SearchNodeStatus = "pending"
    run_ids: tuple[str, ...] = ()
    payload: dict[str, object] | None = None


def _sort_key(candidate: SearchCandidate) -> tuple[bool, float]:
    """Highest score first; unscored (None) candidates sink to the bottom (stable)."""
    return (candidate.score is None, -(candidate.score or 0.0))


def _root_status(children: list[SearchNode]) -> SearchNodeStatus:
    """Summarize the root from its children (deterministic)."""
    statuses = {c.status for c in children}
    if "running" in statuses:
        return "running"
    if "done" in statuses:
        return "done"
    if statuses and statuses <= {"failed"}:
        return "failed"
    return "pending"


def build_search_tree(
    objective: str,
    *,
    kind: SearchNodeKind,
    source_id: str,
    candidates: list[SearchCandidate],
    tree_id: str | None = None,
    created_at: str = "",
) -> SearchTree:
    """Build a one-level SearchTree: a root + one child per real candidate.

    Children are ordered by score descending (None last) for a stable, reproducible
    layout. The root's score mirrors the best child so the tree can highlight the
    leading branch. No fabrication: scores/status/run_ids pass through unchanged.
    """
    ordered = sorted(candidates, key=_sort_key)
    children = [
        SearchNode(
            id=c.id,
            parent_id=ROOT_ID,
            kind=kind,
            label=c.label,
            payload=dict(c.payload or {}),
            status=c.status,
            score=c.score,
            run_ids=list(c.run_ids),
        )
        for c in ordered
    ]
    scored = [c.score for c in children if c.score is not None]
    root = SearchNode(
        id=ROOT_ID,
        parent_id=None,
        kind=kind,
        label=objective,
        payload={},
        status=_root_status(children),
        score=max(scored) if scored else None,
        run_ids=[],
    )
    return SearchTree(
        id=tree_id or uuid4().hex,
        objective=objective,
        kind=kind,
        source_id=source_id,
        nodes=[root, *children],
        created_at=created_at,
    )


def build_study_search_tree(
    study: MechanismComparisonStudy, *, tree_id: str | None = None
) -> SearchTree:
    """Project an inverse-mechanism study into a mechanism search tree (real fit scores)."""
    candidates = [
        SearchCandidate(
            id=h.id,
            label=h.name,
            score=h.fit_score,
            status=_HYP_STATUS.get(h.status, "pending"),
            run_ids=(h.run_id,) if h.run_id else (),
            payload={
                "rationale": h.rationale,
                "name": h.name,
                **({"error": h.error} if h.error else {}),
            },
        )
        for h in study.hypotheses
    ]
    return build_search_tree(
        study.target.name or study.name,
        kind="mechanism",
        source_id=study.id,
        candidates=candidates,
        tree_id=tree_id or f"st_{study.id}",
        created_at=study.created_at,
    )


def prune_below(tree: SearchTree, threshold: float) -> SearchTree:
    """Mark already-evaluated children scoring below `threshold` as ``pruned``.

    Only ``done`` children with a real score are affected (display status only); the
    root, failed/pending/unevaluated nodes, and every score are left untouched (P2).
    """
    pruned = [
        node.model_copy(update={"status": "pruned"})
        if (
            node.parent_id is not None
            and node.status == "done"
            and node.score is not None
            and node.score < threshold
        )
        else node
        for node in tree.nodes
    ]
    return tree.model_copy(update={"nodes": pruned})


__all__ = [
    "ROOT_ID",
    "SearchCandidate",
    "build_search_tree",
    "build_study_search_tree",
    "prune_below",
]
