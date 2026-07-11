"""Mechanism-comparison orchestration helpers for inverse discovery (M2.2).

`expand_comparison` turns N candidate hypotheses into concrete RunPlans (variant ×
replications) sharing seeds across variants so differences are attributable to the
*mechanism*, not the RNG (P1 fair comparison). `rank_hypotheses` scores each variant
against the target phenomenon using real RunRecords and orders them by fit_score.
"""

from __future__ import annotations

from typing import NamedTuple
from uuid import uuid4

from abm_kernel.phenomenon import evaluate_phenomenon
from abm_kernel.schemas.phenomenon import MechanismComparisonStudy, MechanismHypothesis
from abm_kernel.schemas.run_plan import RunPlan


class ComparisonPlan(NamedTuple):
    """A RunPlan tagged with the hypothesis it belongs to."""

    hypothesis_id: str
    plan: RunPlan


class HypothesisRun(NamedTuple):
    """Real result of running one hypothesis variant (one replication)."""

    hypothesis_id: str
    run_id: str
    status: str  # "completed" | "failed"
    summary: dict[str, dict[str, float]]  # RunRecord.metrics_summary
    series: list[dict[str, float]]  # per-tick history (for peak@tick targets)
    error: str = ""


def expand_comparison(
    hypotheses: list[MechanismHypothesis],
    *,
    base_seed: int,
    replications: int,
) -> list[ComparisonPlan]:
    """Expand hypotheses into RunPlans (variant × replications), sharing seeds.

    seed = base_seed + replication_index, identical across variants for the same
    replication so any metric difference is due to the mechanism (P1).
    """
    if replications < 1:
        raise ValueError("replications 必须 >= 1")
    plans: list[ComparisonPlan] = []
    for hypothesis in hypotheses:
        for rep in range(replications):
            plans.append(
                ComparisonPlan(
                    hypothesis_id=hypothesis.id,
                    plan=RunPlan(
                        run_id=uuid4().hex,
                        parameters={},  # variants differ by config, not param sweep
                        seed=base_seed + rep,
                        replication_index=rep,
                        combo_label=hypothesis.id,
                    ),
                )
            )
    return plans


def _mean_summary(
    summaries: list[dict[str, dict[str, float]]],
) -> dict[str, dict[str, float]]:
    """Average each metric's stats across replications (deterministic)."""
    if not summaries:
        return {}
    metrics = sorted({m for s in summaries for m in s})
    merged: dict[str, dict[str, float]] = {}
    for metric in metrics:
        present = [s[metric] for s in summaries if metric in s]
        if not present:
            continue
        stat_keys = sorted({k for stats in present for k in stats})
        merged[metric] = {
            key: sum(stats.get(key, 0.0) for stats in present) / len(present) for key in stat_keys
        }
    return merged


def rank_hypotheses(
    study: MechanismComparisonStudy,
    runs: list[HypothesisRun],
) -> MechanismComparisonStudy:
    """Score every hypothesis against the target by real results, ordered by fit_score.

    Replications are averaged (summary mean; the first completed run's series is used
    for peak@tick targets). Failed/unrun hypotheses get fit_score=None and sort last.
    """
    by_hypothesis: dict[str, list[HypothesisRun]] = {}
    for run in runs:
        by_hypothesis.setdefault(run.hypothesis_id, []).append(run)

    ranked: list[MechanismHypothesis] = []
    for hypothesis in study.hypotheses:
        hruns = by_hypothesis.get(hypothesis.id, [])
        completed = [r for r in hruns if r.status == "completed"]
        if completed:
            summary = _mean_summary([r.summary for r in completed])
            fit = evaluate_phenomenon(study.target, summary=summary, series=completed[0].series)
            ranked.append(
                hypothesis.model_copy(
                    update={
                        "run_id": completed[0].run_id,
                        "status": "completed",
                        "error": "",
                        "fit": fit,
                        "fit_score": fit.fit_score,
                    }
                )
            )
        else:
            failed = next((r for r in hruns if r.status == "failed"), None)
            ranked.append(
                hypothesis.model_copy(
                    update={
                        "run_id": failed.run_id if failed else None,
                        "status": "failed" if failed else "pending",
                        "error": failed.error if failed else "",
                        "fit": None,
                        "fit_score": None,
                    }
                )
            )

    ranked.sort(key=lambda h: (h.fit_score is None, -(h.fit_score or 0.0)))
    return study.model_copy(update={"hypotheses": ranked, "status": "completed"})


__all__ = [
    "ComparisonPlan",
    "HypothesisRun",
    "expand_comparison",
    "rank_hypotheses",
]
