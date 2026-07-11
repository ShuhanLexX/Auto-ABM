"""P2-5: SpaceSnapshot emission — network/grid shape, determinism, no metric drift."""

from __future__ import annotations

import json
from pathlib import Path

from abm_kernel import build_model, build_space_snapshot, simulate
from abm_kernel.models import rumor_model_config, schelling_model_config


def test_network_snapshot_shape() -> None:
    model = build_model(rumor_model_config(population=40), seed=1)
    model.setup()
    snap = build_space_snapshot(model)
    assert snap.space == "network"
    assert len(snap.payload["nodes"]) == 40
    assert all(set(n) == {"id", "state"} for n in snap.payload["nodes"])
    # tick-0 states are the seeded mix of susceptible/infected.
    states = {n["state"] for n in snap.payload["nodes"]}
    assert states <= {"susceptible", "infected", "recovered"}
    assert isinstance(snap.payload["edges"], list)


def test_grid_snapshot_shape() -> None:
    model = build_model(schelling_model_config(width=10, height=10, population=60), seed=2)
    model.setup()
    snap = build_space_snapshot(model)
    assert snap.space == "grid"
    assert snap.payload["width"] == 10 and snap.payload["height"] == 10
    assert len(snap.payload["cells"]) == 60
    assert all({"x", "y", "state"} == set(c) for c in snap.payload["cells"])
    assert {c["state"] for c in snap.payload["cells"]} <= {"a", "b"}


def test_snapshot_is_deterministic() -> None:
    def frame(seed: int) -> dict:
        model = build_model(rumor_model_config(population=50), seed=seed)
        model.setup()
        for _ in range(5):
            model.step()
        return build_space_snapshot(model).model_dump()

    assert frame(7) == frame(7)


def test_agent_cap_truncates_nodes() -> None:
    model = build_model(rumor_model_config(population=80), seed=3)
    model.setup()
    snap = build_space_snapshot(model, agent_cap=20)
    assert len(snap.payload["nodes"]) == 20
    node_ids = {n["id"] for n in snap.payload["nodes"]}
    # edges are filtered to included nodes only.
    assert all(a in node_ids and b in node_ids for a, b in snap.payload["edges"])


def test_emitting_snapshots_does_not_change_metrics(tmp_path: Path) -> None:
    cfg = rumor_model_config(population=60)
    plain = simulate(cfg, seed=11, steps=20, output_dir=tmp_path / "plain")
    withss = simulate(cfg, seed=11, steps=20, output_dir=tmp_path / "snap", space_sample_rate=5)
    assert plain.metrics_summary == withss.metrics_summary


def test_trace_records_space_snapshots(tmp_path: Path) -> None:
    cfg = rumor_model_config(population=40)
    record = simulate(cfg, seed=1, steps=20, output_dir=tmp_path, space_sample_rate=5)
    lines = Path(record.trace_path or "").read_text(encoding="utf-8").splitlines()
    meta = json.loads(lines[0])
    assert meta["space_sample_rate"] == 5
    snaps = [json.loads(line) for line in lines if json.loads(line)["kind"] == "space_snapshot"]
    # tick 0, 5, 10, 15, 20 → 5 frames
    assert [s["tick"] for s in snaps] == [0, 5, 10, 15, 20]
    assert snaps[0]["snapshot"]["space"] == "network"
