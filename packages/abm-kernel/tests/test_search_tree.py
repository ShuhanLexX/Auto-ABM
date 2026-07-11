"""P2-3: SearchTree projection — deterministic, grounded in real study/candidate data."""

from __future__ import annotations

from abm_kernel import (
    SearchCandidate,
    build_search_tree,
    build_study_search_tree,
    prune_below,
)
from abm_kernel.models import rumor_model_config
from abm_kernel.schemas import (
    MechanismComparisonStudy,
    MechanismHypothesis,
    PhenomenonFit,
    PhenomenonMetric,
    TargetPhenomenon,
    parse_search_tree,
)
from abm_kernel.search_tree import ROOT_ID


def _study() -> MechanismComparisonStudy:
    cfg = rumor_model_config(population=20)
    target = TargetPhenomenon(
        id="t",
        name="高最终感染率",
        metrics=[PhenomenonMetric(metric_id="infected", target=">0.7")],
    )
    return MechanismComparisonStudy(
        id="study_x",
        project_id="p1",
        name="消融对比",
        target=target,
        hypotheses=[
            MechanismHypothesis(
                id="with_mech",
                name="含机制",
                config=cfg,
                run_id="run_a",
                status="completed",
                fit_score=0.9,
                fit=PhenomenonFit(fit_score=0.9, breakdown=[]),
            ),
            MechanismHypothesis(
                id="no_mech",
                name="无机制",
                config=cfg,
                run_id="run_b",
                status="completed",
                fit_score=0.2,
                fit=PhenomenonFit(fit_score=0.2, breakdown=[]),
            ),
            MechanismHypothesis(
                id="broken",
                name="跑挂变体",
                config=cfg,
                status="failed",
                error="boom",
            ),
        ],
        created_at="2026-06-28T00:00:00Z",
    )


def test_study_tree_orders_by_fit_and_links_runs() -> None:
    tree = build_study_search_tree(_study())
    assert tree.kind == "mechanism"
    assert tree.source_id == "study_x"
    root = tree.nodes[0]
    assert root.id == ROOT_ID and root.parent_id is None
    # Root score mirrors the best child; objective comes from the target phenomenon.
    assert root.score == 0.9
    assert tree.objective == "高最终感染率"

    children = tree.nodes[1:]
    # Ordered by score desc, unscored (failed) last.
    assert [c.id for c in children] == ["with_mech", "no_mech", "broken"]
    assert children[0].run_ids == ["run_a"]
    assert children[0].status == "done"
    assert children[2].status == "failed"
    assert children[2].score is None
    assert children[2].run_ids == []


def test_study_tree_is_deterministic() -> None:
    a = build_study_search_tree(_study())
    b = build_study_search_tree(_study())
    assert a.model_dump() == b.model_dump()


def test_prune_below_only_flips_evaluated_low_children() -> None:
    tree = prune_below(build_study_search_tree(_study()), 0.5)
    by_id = {n.id: n for n in tree.nodes}
    assert by_id["with_mech"].status == "done"  # above threshold, kept
    assert by_id["no_mech"].status == "pruned"  # below threshold, flipped
    assert by_id["broken"].status == "failed"  # failed/unevaluated never pruned
    assert by_id[ROOT_ID].status != "pruned"  # root untouched
    # Scores are never rewritten by pruning (P2).
    assert by_id["no_mech"].score == 0.2


def test_build_search_tree_unscored_sink_and_roundtrip() -> None:
    tree = build_search_tree(
        "参数搜索",
        kind="parameter",
        source_id="exp_1",
        candidates=[
            SearchCandidate(id="c1", label="a", score=0.3, status="done", run_ids=("r1",)),
            SearchCandidate(id="c2", label="b", score=None, status="pending"),
            SearchCandidate(id="c3", label="c", score=0.8, status="done", run_ids=("r3",)),
        ],
        tree_id="tree_1",
    )
    children = tree.nodes[1:]
    assert [c.id for c in children] == ["c3", "c1", "c2"]  # 0.8, 0.3, then None
    # Contract round-trip stays stable.
    assert parse_search_tree(tree.model_dump()).model_dump() == tree.model_dump()
