"""Scheduled interventions: deterministic mid-run parameter changes.

Interventions are model-agnostic — the opinion model has no built-in
intervention mechanism, so these tests prove the generic kernel hook alone makes
a trajectory bend at the intervention tick.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from abm_kernel import build_model, simulate
from abm_kernel.models import opinion_model_config


def _opinion_history(
    seed: int,
    steps: int,
    *,
    params: dict[str, Any] | None = None,
    interventions: list[dict[str, Any]] | None = None,
) -> list[dict[str, float]]:
    model = build_model(
        opinion_model_config(population=120),
        seed=seed,
        params=params,
        interventions=interventions,
    )
    model.setup()
    for _ in range(steps):
        model.step()
    return model.history


def test_intervention_diverges_only_at_and_after_tick() -> None:
    tick = 15
    steps = 30
    base = _opinion_history(7, steps, params={"confidence_threshold": 0.3})
    treated = _opinion_history(
        7,
        steps,
        params={"confidence_threshold": 0.3},
        interventions=[{"at_tick": tick, "params": {"confidence_threshold": 1.0}}],
    )
    # Identical RNG stream + params before the intervention -> identical history.
    for i in range(tick):
        assert base[i] == treated[i], f"tick {i} diverged before the intervention"
    # The change must produce a visible effect at/after the intervention tick.
    assert any(base[i] != treated[i] for i in range(tick, steps + 1))


def test_intervention_is_deterministic() -> None:
    interventions = [{"at_tick": 8, "params": {"convergence_rate": 0.5}}]
    first = _opinion_history(3, 20, interventions=interventions)
    second = _opinion_history(3, 20, interventions=interventions)
    assert first == second


def test_intervention_normalization_drops_invalid_entries() -> None:
    model = build_model(
        opinion_model_config(population=30),
        seed=1,
        interventions=[
            {"at_tick": 0, "params": {"confidence_threshold": 0.9}},  # tick 0 never fires
            {"at_tick": 3, "params": {}},  # empty patch
            {"at_tick": 5},  # missing params
            "nonsense",  # not a dict
            {"at_tick": 7, "params": {"convergence_rate": 0.5}},  # kept
            {"at_tick": 7, "params": {"confidence_threshold": 0.8}},  # merged into tick 7
        ],
    )
    assert model.interventions == [
        {"at_tick": 7, "params": {"convergence_rate": 0.5, "confidence_threshold": 0.8}}
    ]


def test_run_record_and_trace_capture_intervention(tmp_path: Path) -> None:
    interventions = [{"at_tick": 5, "params": {"confidence_threshold": 0.9}}]
    record = simulate(
        opinion_model_config(population=60),
        seed=2,
        steps=12,
        output_dir=tmp_path,
        params={"confidence_threshold": 0.3},
        interventions=interventions,
        trace_level="full",
    )

    assert record.interventions is not None
    assert record.interventions[0].at_tick == 5
    assert record.interventions[0].params["confidence_threshold"] == 0.9
    # RunRecord.parameters is the INITIAL effective config, not the post-change value.
    assert record.parameters["confidence_threshold"] == 0.3

    events = [
        json.loads(line)
        for line in Path(record.trace_path).read_text(encoding="utf-8").splitlines()
    ]
    applied = [
        e for e in events if e.get("kind") == "event" and e.get("name") == "intervention_applied"
    ]
    assert applied, "expected an intervention_applied trace event"
    assert applied[0]["tick"] == 5
    assert applied[0]["changed"]["confidence_threshold"] == 0.9

    # run_meta records the interventions for reproducibility.
    meta = next(e for e in events if e.get("kind") == "run_meta")
    assert meta["interventions"][0]["at_tick"] == 5
