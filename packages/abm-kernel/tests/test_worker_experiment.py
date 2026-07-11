"""stdio worker `experiment` command — batch sweep + per-run progress (P3 Task 1).

Spawns the real worker as a subprocess (the same contract the server's
experimentService uses) and asserts the experiment frame sequence: one
`experiment_meta` (with the plan total), one `run_done` per expanded run, and
a terminal `experiment_done`. A failing parameter combo is recorded as a failed
RunRecord without aborting the batch.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from abm_kernel.models import rumor_model_config

# Kernel source root so the spawned worker resolves `abm_kernel.*` via PYTHONPATH.
_SRC = str(Path(__file__).resolve().parents[1] / "src")


def _cfg() -> dict:
    return rumor_model_config(population=40).model_dump(mode="json")


def _experiment(sweep_values: list, output_dir: Path, *, replications: int = 2) -> dict:
    return {
        "id": "exp_1",
        "name": "beta sweep",
        "model_id": "reference_rumor",
        "model_version": "1.0.0",
        "design": {
            "type": "single_sweep",
            "sweep": [{"parameter_id": "beta", "values": sweep_values}],
        },
        "replications": replications,
        "base_seed": 100,
        "steps": 5,
        "collect_metrics": ["susceptible", "infected", "recovered"],
        "trace_level": "off",
    }


def _run_worker(cmd: dict) -> list[dict]:
    env = {**os.environ, "PYTHONPATH": _SRC}
    proc = subprocess.run(
        [sys.executable, "-m", "abm_kernel.worker"],
        input=json.dumps(cmd) + "\n" + json.dumps({"cmd": "shutdown"}) + "\n",
        text=True,
        capture_output=True,
        env=env,
    )
    assert proc.returncode == 0, proc.stderr
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def test_experiment_emits_meta_run_done_per_plan_and_done(tmp_path: Path) -> None:
    frames = _run_worker(
        {
            "cmd": "experiment",
            "experiment_id": "exp_1",
            "experiment": _experiment([0.1, 0.2], tmp_path, replications=2),
            "config": _cfg(),
            "output_dir": str(tmp_path),
        }
    )
    kinds = [f["frame"] for f in frames]

    assert kinds[0] == "experiment_meta"
    assert kinds[-1] == "experiment_done"

    meta = frames[0]
    assert meta["experiment_id"] == "exp_1"
    assert meta["total"] == 4  # 2 sweep values × 2 replications

    run_done = [f for f in frames if f["frame"] == "run_done"]
    assert len(run_done) == 4
    assert {f["index"] for f in run_done} == {0, 1, 2, 3}
    assert all(f["total"] == 4 for f in run_done)
    assert all(f["record"]["status"] == "completed" for f in run_done)
    assert all(f["record"]["experiment_id"] == "exp_1" for f in run_done)


def test_experiment_failed_run_does_not_abort_batch(tmp_path: Path) -> None:
    # A garbage sweep value forces one run to fail; the batch must still finish.
    frames = _run_worker(
        {
            "cmd": "experiment",
            "experiment_id": "exp_bad",
            "experiment": {
                "id": "exp_bad",
                "name": "bad sweep",
                "model_id": "reference_rumor",
                "model_version": "1.0.0",
                "design": {
                    "type": "single_sweep",
                    "sweep": [{"parameter_id": "initial_infected", "values": ["not_an_int", 3]}],
                },
                "replications": 1,
                "base_seed": 1,
                "steps": 5,
                "collect_metrics": ["infected"],
                "trace_level": "off",
            },
            "config": _cfg(),
            "output_dir": str(tmp_path),
        }
    )
    kinds = [f["frame"] for f in frames]
    assert kinds[-1] == "experiment_done"

    run_done = [f for f in frames if f["frame"] == "run_done"]
    statuses = {f["record"]["status"] for f in run_done}
    assert "failed" in statuses
    assert "completed" in statuses


def test_experiment_bad_config_emits_error_not_crash(tmp_path: Path) -> None:
    frames = _run_worker(
        {
            "cmd": "experiment",
            "experiment_id": "exp_err",
            "experiment": {"id": "x", "name": "broken"},  # missing required fields
            "config": _cfg(),
            "output_dir": str(tmp_path),
        }
    )
    assert frames[-1]["frame"] == "error"
    assert frames[-1]["experiment_id"] == "exp_err"
