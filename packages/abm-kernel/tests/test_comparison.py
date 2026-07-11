"""M2.2: mechanism-comparison expansion (shared seeds) + ranking by real fit."""

from __future__ import annotations

from abm_kernel import HypothesisRun, expand_comparison, rank_hypotheses
from abm_kernel.models import rumor_model_config
from abm_kernel.schemas import (
    MechanismComparisonStudy,
    MechanismHypothesis,
    PhenomenonMetric,
    TargetPhenomenon,
)


def _hypotheses() -> list[MechanismHypothesis]:
    cfg = rumor_model_config()
    return [
        MechanismHypothesis(id="h_high", name="强传播", config=cfg),
        MechanismHypothesis(id="h_low", name="弱传播", config=cfg),
        MechanismHypothesis(id="h_broken", name="跑挂变体", config=cfg),
    ]


def _study() -> MechanismComparisonStudy:
    return MechanismComparisonStudy(
        id="study_1",
        project_id="proj",
        name="谣言峰值现象",
        target=TargetPhenomenon(
            id="ph",
            name="高终值感染",
            metrics=[PhenomenonMetric(metric_id="infected", target=">10")],
        ),
        hypotheses=_hypotheses(),
        base_seed=42,
        replications=2,
    )


def test_expand_shares_seed_across_variants() -> None:
    plans = expand_comparison(_hypotheses(), base_seed=42, replications=2)
    assert len(plans) == 3 * 2  # variants × replications
    seeds_by_rep: dict[int, set[int]] = {}
    for cp in plans:
        seeds_by_rep.setdefault(cp.plan.replication_index, set()).add(cp.plan.seed)
    # all variants share one seed per replication index (fair comparison, P1)
    assert seeds_by_rep == {0: {42}, 1: {43}}
    assert {cp.hypothesis_id for cp in plans} == {"h_high", "h_low", "h_broken"}
    assert all(cp.plan.combo_label == cp.hypothesis_id for cp in plans)


def test_rank_orders_by_real_fit_and_failed_last() -> None:
    study = _study()
    runs = [
        HypothesisRun("h_high", "run_high", "completed", {"infected": {"final": 25.0}}, []),
        HypothesisRun("h_low", "run_low", "completed", {"infected": {"final": 5.0}}, []),
        HypothesisRun("h_broken", "run_broken", "failed", {}, [], error="boom"),
    ]
    ranked = rank_hypotheses(study, runs)
    order = [h.id for h in ranked.hypotheses]
    assert order == ["h_high", "h_low", "h_broken"]
    top = ranked.hypotheses[0]
    assert top.fit_score == 1.0  # final 25 > 10 → satisfied
    assert top.run_id == "run_high" and top.status == "completed"
    broken = ranked.hypotheses[-1]
    assert broken.fit_score is None and broken.status == "failed" and broken.error == "boom"
    assert ranked.status == "completed"


def test_rank_averages_replications() -> None:
    study = _study()
    runs = [
        HypothesisRun("h_high", "r0", "completed", {"infected": {"final": 30.0}}, []),
        HypothesisRun("h_high", "r1", "completed", {"infected": {"final": 10.0}}, []),
    ]
    ranked = rank_hypotheses(study, runs)
    top = next(h for h in ranked.hypotheses if h.id == "h_high")
    # mean(final) = 20 > 10 → satisfied; observed reflects the averaged statistic
    assert top.fit.breakdown[0].observed == 20.0
    assert top.fit_score == 1.0


def test_rank_is_deterministic() -> None:
    study = _study()
    runs = [
        HypothesisRun("h_high", "a", "completed", {"infected": {"final": 25.0}}, []),
        HypothesisRun("h_low", "b", "completed", {"infected": {"final": 5.0}}, []),
        HypothesisRun("h_broken", "c", "failed", {}, []),
    ]
    first = rank_hypotheses(study, runs).model_dump()
    second = rank_hypotheses(study, runs).model_dump()
    assert first == second
