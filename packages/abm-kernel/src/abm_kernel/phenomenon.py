"""Deterministic fit-score engine for inverse mechanism discovery (M2.2).

Pure functions, no IO: given a metric's real run results and a PhenomenonMetric
criterion, compute a smooth fit score in [0,1] (1 = criterion satisfied, decaying
as the observed value deviates). fit_score is always derived from real results and
is traceable to the observed statistic (P1/P2) — AI never supplies it.

target grammar (see docs/architecture/data-contracts.md §9):
  - scalar comparison on a statistic: ">0.7" ">=0.7" "<0.3" "<=0.3" "=0.5" "~0.5"
  - peak tick:                        "peak@tick~30" "peak@tick<30" "peak@tick>30"
"""

from __future__ import annotations

from typing import Literal, NamedTuple

from abm_kernel.errors import ConfigError
from abm_kernel.schemas.phenomenon import (
    MetricFit,
    PhenomenonFit,
    PhenomenonMetric,
    TargetPhenomenon,
)

_SCALAR_OPS = (">=", "<=", "~", ">", "<", "=")  # 2-char ops first (longest match)
_PEAK_PREFIX = "peak@tick"
# statistic name -> RunRecord.metrics_summary key
_STAT_KEY = {"final": "final", "peak": "max", "min": "min", "mean": "mean"}

_TargetKind = Literal["scalar", "peak_tick"]


class _TargetSpec(NamedTuple):
    kind: _TargetKind
    op: str  # one of _SCALAR_OPS (peak_tick uses ~ / < / >)
    value: float


def parse_target(target: str) -> _TargetSpec:
    """Parse a PhenomenonMetric.target string into a structured spec (raises ConfigError)."""
    raw = target.strip()
    if not raw:
        raise ConfigError("PhenomenonMetric.target 不能为空")

    if raw.startswith(_PEAK_PREFIX):
        rest = raw[len(_PEAK_PREFIX) :].strip()
        op = next((o for o in ("~", "<=", ">=", "<", ">", "=") if rest.startswith(o)), None)
        if op is None:
            raise ConfigError(f"非法 peak@tick 判据(缺操作符): {target!r}")
        if op not in ("~", "<", ">"):
            raise ConfigError(f"peak@tick 仅支持 ~ / < / >: {target!r}")
        return _TargetSpec("peak_tick", op, _to_number(rest[len(op) :], target))

    op = next((o for o in _SCALAR_OPS if raw.startswith(o)), None)
    if op is None:
        raise ConfigError(f"非法判据(需以 > >= < <= = ~ 开头, 或 peak@tick…): {target!r}")
    return _TargetSpec("scalar", op, _to_number(raw[len(op) :], target))


def _to_number(text: str, target: str) -> float:
    try:
        return float(text.strip())
    except ValueError as exc:
        raise ConfigError(f"判据数值非法: {target!r}") from exc


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def _argmax_tick(series: list[dict[str, float]] | None, metric_id: str) -> float | None:
    """First tick at which `metric_id` attains its maximum (deterministic)."""
    if not series:
        return None
    best_tick: float | None = None
    best_val: float | None = None
    for row in series:
        if metric_id not in row or "tick" not in row:
            continue
        val = float(row[metric_id])
        if best_val is None or val > best_val:
            best_val = val
            best_tick = float(row["tick"])
    return best_tick


def _scalar_score(
    observed: float, spec: _TargetSpec, tolerance: float | None
) -> tuple[bool, float]:
    value = spec.value
    scale = tolerance if tolerance is not None else max(abs(value) * 0.5, 1.0)
    if spec.op in (">", ">="):
        satisfied = observed > value if spec.op == ">" else observed >= value
        score = 1.0 if observed >= value else _clamp01(1.0 - (value - observed) / scale)
    elif spec.op in ("<", "<="):
        satisfied = observed < value if spec.op == "<" else observed <= value
        score = 1.0 if observed <= value else _clamp01(1.0 - (observed - value) / scale)
    else:  # "=" exact-ish / "~" approximate — both score by distance, differ in tolerance
        dist = abs(observed - value)
        score = _clamp01(1.0 - dist / scale)
        satisfied = dist <= (tolerance if tolerance is not None else scale)
    return satisfied, score


def _peak_tick_score(
    observed_tick: float, spec: _TargetSpec, tolerance: float | None
) -> tuple[bool, float]:
    target_tick = spec.value
    scale = tolerance if tolerance is not None else max(abs(target_tick) * 0.25, 1.0)
    if spec.op == "~":
        dist = abs(observed_tick - target_tick)
        return dist <= scale, _clamp01(1.0 - dist / scale)
    if spec.op == "<":
        satisfied = observed_tick < target_tick
        score = 1.0 if satisfied else _clamp01(1.0 - (observed_tick - target_tick) / scale)
        return satisfied, score
    # ">"
    satisfied = observed_tick > target_tick
    score = 1.0 if satisfied else _clamp01(1.0 - (target_tick - observed_tick) / scale)
    return satisfied, score


def evaluate_metric(
    metric: PhenomenonMetric,
    *,
    summary: dict[str, dict[str, float]],
    series: list[dict[str, float]] | None = None,
) -> MetricFit:
    """Score one PhenomenonMetric against real run results.

    `summary` is a RunRecord.metrics_summary ({metric: {final,max,min,mean}}); `series`
    is the per-tick history (needed only for peak@tick targets). A missing metric/series
    yields observed=None, score=0, satisfied=False — never fabricated (P2).
    """
    spec = parse_target(metric.target)

    if spec.kind == "peak_tick":
        observed = _argmax_tick(series, metric.metric_id)
        if observed is None:
            return MetricFit(
                metric_id=metric.metric_id,
                statistic="peak@tick",
                target=metric.target,
                observed=None,
                satisfied=False,
                score=0.0,
            )
        satisfied, score = _peak_tick_score(observed, spec, metric.tolerance)
        return MetricFit(
            metric_id=metric.metric_id,
            statistic="peak@tick",
            target=metric.target,
            observed=observed,
            satisfied=satisfied,
            score=score,
        )

    stat_value = summary.get(metric.metric_id, {}).get(_STAT_KEY[metric.statistic])
    if stat_value is None:
        return MetricFit(
            metric_id=metric.metric_id,
            statistic=metric.statistic,
            target=metric.target,
            observed=None,
            satisfied=False,
            score=0.0,
        )
    satisfied, score = _scalar_score(float(stat_value), spec, metric.tolerance)
    return MetricFit(
        metric_id=metric.metric_id,
        statistic=metric.statistic,
        target=metric.target,
        observed=float(stat_value),
        satisfied=satisfied,
        score=score,
    )


def evaluate_phenomenon(
    target: TargetPhenomenon,
    *,
    summary: dict[str, dict[str, float]],
    series: list[dict[str, float]] | None = None,
) -> PhenomenonFit:
    """Weighted aggregate of per-metric fit: fit_score = Σ(w_i·score_i)/Σw_i ∈ [0,1]."""
    breakdown = [
        evaluate_metric(metric, summary=summary, series=series) for metric in target.metrics
    ]
    total_weight = sum(metric.weight for metric in target.metrics)
    weighted = sum(
        fit.score * metric.weight for fit, metric in zip(breakdown, target.metrics, strict=True)
    )
    fit_score = _clamp01(weighted / total_weight) if total_weight > 0 else 0.0
    return PhenomenonFit(fit_score=fit_score, breakdown=breakdown)


__all__ = ["evaluate_metric", "evaluate_phenomenon", "parse_target"]
