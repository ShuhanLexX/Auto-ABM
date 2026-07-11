"""A2–A7: build, determinism, observers, trace, single run, reference model."""

from __future__ import annotations

import json
from pathlib import Path

from abm_kernel import build_model, simulate
from abm_kernel.models import rumor_model_config


def _run_history(seed: int, steps: int = 40, population: int = 80) -> list[dict[str, float]]:
    model = build_model(rumor_model_config(population=population), seed=seed)
    model.setup()
    for _ in range(steps):
        model.step()
    return model.history


def test_build_model_from_reference_config() -> None:
    cfg = rumor_model_config(population=60)
    model = build_model(cfg, seed=42)  # behavior resolved from registry
    assert len(model.agents) == 60
    assert model.graph.number_of_nodes() == 60


def test_determinism_same_seed_identical(  # A3
) -> None:
    assert _run_history(seed=7) == _run_history(seed=7)


def test_different_seed_changes_result() -> None:  # A3
    assert _run_history(seed=1) != _run_history(seed=2)


def test_state_conservation_each_tick() -> None:  # A4
    history = _run_history(seed=5, steps=50, population=100)
    assert history[0]["tick"] == 0
    for row in history:
        assert row["susceptible"] + row["infected"] + row["recovered"] == 100


def test_initial_infection_seeded() -> None:
    history = _run_history(seed=9, steps=1, population=100)
    # initial_infected default = 3 → tick 0 has exactly 3 infected
    assert history[0]["infected"] == 3.0


def test_simulate_writes_trace_and_csv(tmp_path: Path) -> None:  # A5 + A6 + A7
    cfg = rumor_model_config(population=50)
    record = simulate(cfg, seed=3, steps=30, output_dir=tmp_path, trace_level="full")

    assert record.status == "completed"
    assert record.seed == 3
    assert record.kernel_version
    assert set(record.metrics_summary) == {"susceptible", "infected", "recovered"}

    trace_path = Path(record.trace_path or "")
    result_path = Path(record.result_path or "")
    assert trace_path.exists()
    assert result_path.exists()

    lines = trace_path.read_text(encoding="utf-8").splitlines()
    first = json.loads(lines[0])
    last = json.loads(lines[-1])
    assert first["kind"] == "run_meta"
    assert first["seed"] == 3
    assert last["kind"] == "run_end"
    assert last["status"] == "completed"

    kinds = {json.loads(line)["kind"] for line in lines}
    assert {"run_meta", "tick_metrics", "run_end"} <= kinds
    assert "agent_delta" in kinds  # trace_level=full
    assert "event" in kinds  # intervention_started at tick 30

    # agent_init: one record per agent, all susceptible at construction (F4 roster).
    inits = [json.loads(line) for line in lines if json.loads(line)["kind"] == "agent_init"]
    assert len(inits) == 50  # population
    assert {i["agent_type"] for i in inits} == {"person"}
    assert all(i["state"] == {"state": "susceptible"} for i in inits)

    csv_lines = result_path.read_text(encoding="utf-8").splitlines()
    assert csv_lines[0] == "tick,susceptible,infected,recovered"
    assert len(csv_lines) == 1 + 31  # header + ticks 0..30


def test_mechanism_fired_records_state_transition(tmp_path: Path) -> None:
    """mechanism_fired carries key/old/new so metric deltas decompose per mechanism (P2)."""
    cfg = rumor_model_config(population=60)
    record = simulate(cfg, seed=13, steps=25, output_dir=tmp_path, trace_level="key")
    lines = Path(record.trace_path or "").read_text(encoding="utf-8").splitlines()
    fired = [json.loads(line) for line in lines if json.loads(line)["kind"] == "mechanism_fired"]
    assert fired, "expected mechanism_fired records at trace_level=key"
    for rec in fired:
        assert rec["key"] == "state"
        assert "old" in rec and "new" in rec
        assert rec["agent_type"] == "person"
    spread = [rec for rec in fired if rec["mechanism_id"] == "spread"]
    assert spread, "the rumor spread mechanism should fire with seed=13"
    assert all(rec["new"] == "infected" for rec in spread)
    # signed flow sanity: spread-attributed infections match the trace exactly
    assert all(rec["old"] == "susceptible" for rec in spread)


def test_agent_init_only_at_full_level(tmp_path: Path) -> None:
    cfg = rumor_model_config(population=30)
    record = simulate(cfg, seed=1, steps=5, output_dir=tmp_path, trace_level="key")
    lines = Path(record.trace_path or "").read_text(encoding="utf-8").splitlines()
    kinds = {json.loads(line)["kind"] for line in lines}
    assert "agent_init" not in kinds  # level=key omits agent-level records
    assert "agent_delta" not in kinds


def test_reproducible_runs_match_on_disk(tmp_path: Path) -> None:  # P1 end-to-end
    cfg = rumor_model_config(population=70)
    r1 = simulate(cfg, seed=11, steps=35, output_dir=tmp_path / "a")
    r2 = simulate(cfg, seed=11, steps=35, output_dir=tmp_path / "b")
    assert r1.metrics_summary == r2.metrics_summary
