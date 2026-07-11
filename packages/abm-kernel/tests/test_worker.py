"""stdio NDJSON worker round-trip + determinism (P0 Task 2).

Spawns the real worker as a subprocess (the same contract the server's
kernelProcess.ts uses) and asserts the frame sequence, the persisted
RunRecord, and that the same seed reproduces an identical tick stream.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
from pathlib import Path

from abm_kernel.models import rumor_model_config, sir_model_config
from abm_kernel.space_binary import KIND_GRID_FULL, decode_frame

# Kernel source root, so the spawned worker resolves `abm_kernel.*` via
# PYTHONPATH — the same launch contract the server's kernelProcess.ts uses.
_SRC = str(Path(__file__).resolve().parents[1] / "src")


def _cfg() -> dict:
    # Reuse the kernel's built-in fixed ModelConfig (registry resolves behavior).
    return rumor_model_config(population=40).model_dump(mode="json")


def _run_worker(cmd: dict) -> list[dict]:
    env = {**os.environ, "PYTHONPATH": _SRC}
    proc = subprocess.run(
        [sys.executable, "-m", "abm_kernel.worker"],
        input=json.dumps(cmd) + "\n",
        text=True,
        capture_output=True,
        env=env,
    )
    assert proc.returncode == 0, proc.stderr
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def test_worker_run_emits_frames_and_persists_record(tmp_path: Path) -> None:
    cmd = {
        "cmd": "run",
        "run_id": "r1",
        "config": _cfg(),
        "seed": 7,
        "steps": 5,
        "output_dir": str(tmp_path),
        "trace_level": "key",
    }
    frames = _run_worker(cmd)
    kinds = [f["frame"] for f in frames]

    assert kinds[0] == "run_meta"
    assert kinds[-1] == "run_done"
    assert "tick" in kinds
    # progress fires at tick 0 then once per step → steps + 1 tick frames.
    assert kinds.count("tick") == 6

    done = frames[-1]["record"]
    assert done["seed"] == 7
    assert done["status"] == "completed"
    assert Path(done["trace_path"]).exists()
    assert Path(done["result_path"]).exists()


def test_worker_same_seed_is_deterministic(tmp_path: Path) -> None:
    def metrics_series(run_id: str, out: Path) -> list[dict]:
        frames = _run_worker(
            {
                "cmd": "run",
                "run_id": run_id,
                "config": _cfg(),
                "seed": 42,
                "steps": 8,
                "output_dir": str(out),
                "trace_level": "key",
            }
        )
        return [f["metrics"] for f in frames if f["frame"] == "tick"]

    assert metrics_series("a", tmp_path / "a") == metrics_series("b", tmp_path / "b")


def test_worker_dump_config_returns_builtin_config() -> None:
    frames = _run_worker({"cmd": "dump_config", "name": "sir"})
    assert frames[-1]["frame"] == "config"
    assert frames[-1]["config"].get("id")


def test_worker_dump_config_returns_wildfire_config() -> None:
    frames = _run_worker({"cmd": "dump_config", "name": "wildfire"})
    assert frames[-1]["frame"] == "config"
    assert frames[-1]["config"]["id"] == "template_wildfire_grid"
    assert {p["id"] for p in frames[-1]["config"]["parameters"]} >= {
        "fuel_density",
        "spread_probability",
        "ignition_count",
    }


def test_worker_mechanism_graph_returns_derived_graph() -> None:
    frames = _run_worker({"cmd": "mechanism_graph", "config": _cfg()})
    assert frames[-1]["frame"] == "mechanism_graph"
    graph = frames[-1]["graph"]
    node_ids = {n["id"] for n in graph["nodes"]}
    assert "agent:person" in node_ids
    assert "mechanism:spread" in node_ids
    edges = {(e["source"], e["target"], e["relation"]) for e in graph["edges"]}
    assert ("agent:person", "mechanism:spread", "runs") in edges


def test_worker_mechanism_graph_bad_config_errors() -> None:
    frames = _run_worker({"cmd": "mechanism_graph", "config": {"id": "x"}})
    assert frames[-1]["frame"] == "error"


def test_worker_dump_config_unknown_name_errors() -> None:
    frames = _run_worker({"cmd": "dump_config", "name": "does-not-exist"})
    assert frames[-1]["frame"] == "error"
    assert frames[-1]["type"] == "UnknownTemplate"


def test_worker_binary_encoding_emits_meta_then_binary_snapshots(tmp_path: Path) -> None:
    frames = _run_worker(
        {
            "cmd": "run",
            "run_id": "bin",
            "config": sir_model_config(width=8, height=8, population=20).model_dump(mode="json"),
            "seed": 3,
            "steps": 4,
            "output_dir": str(tmp_path),
            "trace_level": "key",
            "space_sample_rate": 1,
            "snapshot_encoding": "binary",
        }
    )
    kinds = [f["frame"] for f in frames]
    assert "meta" in kinds
    meta = next(f for f in frames if f["frame"] == "meta")
    assert meta["space"] == "grid"
    assert meta["palette"] == ["infected", "recovered", "susceptible"]
    assert meta["grid"] == {"width": 8, "height": 8}

    snapshots = [f for f in frames if f["frame"] == "snapshot"]
    assert snapshots, "expected at least one binary snapshot frame"
    assert all(s["encoding"] == "b64" for s in snapshots)
    first = decode_frame(base64.b64decode(snapshots[0]["b64"]))
    assert first["kind"] == KIND_GRID_FULL
    assert len(first["state"]) == 64  # width*height full grid


def test_worker_bad_config_emits_error_not_crash(tmp_path: Path) -> None:
    frames = _run_worker(
        {
            "cmd": "run",
            "run_id": "bad",
            "config": {"id": "does-not-exist", "name": "x", "version": "1"},
            "seed": 1,
            "steps": 2,
            "output_dir": str(tmp_path),
        }
    )
    assert frames[-1]["frame"] == "error"
    assert frames[-1]["run_id"] == "bad"
