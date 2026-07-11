"""M2.2: deterministic fit-score engine — scoring is grounded, smooth, not fabricated."""

from __future__ import annotations

import pytest

from abm_kernel import evaluate_metric, evaluate_phenomenon, parse_target
from abm_kernel.errors import ConfigError
from abm_kernel.schemas import PhenomenonMetric, TargetPhenomenon

_SUMMARY = {"infected": {"final": 0.8, "max": 0.9, "min": 0.0, "mean": 0.5}}
_SERIES = [
    {"tick": 0, "infected": 3.0},
    {"tick": 1, "infected": 5.0},
    {"tick": 2, "infected": 9.0},
    {"tick": 3, "infected": 4.0},
]


def test_parse_target_valid_and_invalid() -> None:
    assert parse_target(">0.7").op == ">"
    assert parse_target(">=0.7").op == ">="
    assert parse_target("~0.5").value == 0.5
    spec = parse_target("peak@tick~30")
    assert spec.kind == "peak_tick" and spec.op == "~" and spec.value == 30.0
    for bad in ["", "0.7", "bimodal", "peak@tick=5", "<abc"]:
        with pytest.raises(ConfigError):
            parse_target(bad)


def test_scalar_satisfied_scores_one() -> None:
    fit = evaluate_metric(PhenomenonMetric(metric_id="infected", target=">0.7"), summary=_SUMMARY)
    assert fit.observed == 0.8
    assert fit.satisfied is True
    assert fit.score == 1.0


def test_scalar_unsatisfied_decays_smoothly() -> None:
    # observed 0.8 below threshold 0.9; scale = max(0.9*0.5, 1) = 1.0 → 1-(0.9-0.8)/1.0
    fit = evaluate_metric(PhenomenonMetric(metric_id="infected", target=">0.9"), summary=_SUMMARY)
    assert fit.satisfied is False
    assert fit.score == pytest.approx(0.9)


def test_less_than_and_tolerance() -> None:
    fit = evaluate_metric(
        PhenomenonMetric(metric_id="infected", target="<0.5", tolerance=0.1), summary=_SUMMARY
    )
    # observed 0.8 > 0.5 → unsatisfied; scale=0.1 → 1-(0.8-0.5)/0.1 < 0 → clamped to 0
    assert fit.satisfied is False
    assert fit.score == 0.0


def test_approx_within_tolerance() -> None:
    fit = evaluate_metric(
        PhenomenonMetric(metric_id="infected", target="~0.85", tolerance=0.1), summary=_SUMMARY
    )
    assert fit.satisfied is True  # |0.8-0.85| = 0.05 <= 0.1
    assert fit.score == pytest.approx(0.5)  # 1 - 0.05/0.1


def test_peak_tick_uses_series_argmax() -> None:
    hit = evaluate_metric(
        PhenomenonMetric(metric_id="infected", target="peak@tick~2"), summary={}, series=_SERIES
    )
    assert hit.observed == 2.0
    assert hit.satisfied is True and hit.score == 1.0

    miss = evaluate_metric(
        PhenomenonMetric(metric_id="infected", target="peak@tick~10"), summary={}, series=_SERIES
    )
    assert miss.observed == 2.0  # argmax tick is real; only the criterion misses
    assert miss.satisfied is False
    assert 0.0 <= miss.score < 1.0


def test_missing_metric_is_not_fabricated() -> None:
    fit = evaluate_metric(PhenomenonMetric(metric_id="ghost", target=">0.1"), summary=_SUMMARY)
    assert fit.observed is None
    assert fit.satisfied is False
    assert fit.score == 0.0


def test_peak_tick_without_series_is_not_fabricated() -> None:
    fit = evaluate_metric(
        PhenomenonMetric(metric_id="infected", target="peak@tick~2"), summary=_SUMMARY, series=None
    )
    assert fit.observed is None
    assert fit.score == 0.0


def test_weighted_aggregate_and_determinism() -> None:
    target = TargetPhenomenon(
        id="ph",
        name="高峰且高终值",
        metrics=[
            PhenomenonMetric(metric_id="infected", target=">0.7", weight=3.0),  # score 1.0
            PhenomenonMetric(metric_id="infected", target=">0.9", weight=1.0),  # score 0.9
        ],
    )
    fit1 = evaluate_phenomenon(target, summary=_SUMMARY)
    fit2 = evaluate_phenomenon(target, summary=_SUMMARY)
    # (3*1.0 + 1*0.9) / 4 = 0.975
    assert fit1.fit_score == pytest.approx(0.975)
    assert fit1.model_dump() == fit2.model_dump()
    assert all(0.0 <= m.score <= 1.0 for m in fit1.breakdown)
