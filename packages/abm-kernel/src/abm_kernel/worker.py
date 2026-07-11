"""stdio NDJSON worker — the kernel side of the server kernel-bridge (P0).

Reads one JSON command per stdin line, streams one JSON frame per stdout line:

    run_meta -> tick* (-> snapshot*) -> run_done | error

The server (`src/server/abm/kernelProcess.ts`) spawns this module, writes a
`run` command, consumes the NDJSON frames, and persists the final `RunRecord`.
Snapshots stay JSON in P0 (binary frame channel is P1).

`run` command shape (see docs/ai/impl/kernel-bridge.md):
    {"cmd": "run", "run_id", "config", "seed", "steps", "output_dir",
     "params"?, "trace_level"?, "space_sample_rate"?, "space_agent_cap"?,
     "interventions"?: [{"at_tick", "params", "note"?}]}
"""

from __future__ import annotations

import base64
import json
import sys
from typing import Any

# Importing the built-in model package registers each model's behavior in the
# behavior registry, so build_model can resolve fixed ModelConfigs (SIR, rumor,
# …) by id without an explicit behavior. Without this import a fixed-config run
# would fail with BuildError. (P2 adds AI-generated behavior loading.)
import abm_kernel.models as _models
from abm_kernel.mechanism_graph import build_mechanism_graph
from abm_kernel.runner import ExperimentRunner, simulate
from abm_kernel.schemas import parse_experiment_config, parse_model_config
from abm_kernel.space_binary import FrameEncoder, build_network_meta, build_palette

# Built-in fixed ModelConfigs the server can materialize by name (P0: no natural
# language). Python stays the single source of truth — the server never hand-
# writes a ModelConfig, it asks the kernel via the `dump_config` command.
_BUILTIN_CONFIGS = {
    "rumor": _models.rumor_model_config,
    "sir": _models.sir_model_config,
    "schelling": _models.schelling_model_config,
    "diffusion": _models.diffusion_model_config,
    "opinion": _models.opinion_model_config,
    "public_goods": _models.public_goods_model_config,
    "social_influence": _models.social_influence_model_config,
    "wildfire": _models.wildfire_model_config,
}


def _emit(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _binary_snapshot_handler(rid: str, config: Any, seed: int) -> Any:
    """Build an on_snapshot callback that emits a one-time `meta` frame then
    compact base64 binary snapshot frames (P1, see space_binary.py)."""
    holder: dict[str, FrameEncoder] = {}

    def on_snapshot(snapshot: Any) -> None:
        encoder = holder.get("enc")
        if encoder is None:
            payload = snapshot.payload
            if snapshot.space == "grid":
                extra = {c.get("state") for c in payload.get("cells", [])}
                palette = build_palette(config, extra)
                width = int(payload["width"])
                height = int(payload["height"])
                encoder = FrameEncoder("grid", palette, width=width, height=height)
                _emit(
                    {
                        "frame": "meta",
                        "run_id": rid,
                        "space": "grid",
                        "palette": palette,
                        "grid": {"width": width, "height": height},
                    }
                )
            else:
                nodes = payload.get("nodes", [])
                node_ids = [n["id"] for n in nodes]
                edges = payload.get("edges", [])
                extra = {n.get("state") for n in nodes}
                palette = build_palette(config, extra)
                encoder = FrameEncoder("network", palette)
                _emit(
                    {
                        "frame": "meta",
                        "run_id": rid,
                        "space": "network",
                        "palette": palette,
                        "network": build_network_meta(node_ids, edges, seed=seed),
                    }
                )
            holder["enc"] = encoder
        raw = encoder.encode(snapshot)
        _emit(
            {
                "frame": "snapshot",
                "run_id": rid,
                "tick": snapshot.tick,
                "encoding": "b64",
                "b64": base64.b64encode(raw).decode("ascii"),
            }
        )

    return on_snapshot


def _run(cmd: dict[str, Any]) -> None:
    rid = cmd["run_id"]
    try:
        config = parse_model_config(cmd["config"])
        _emit({"frame": "run_meta", "run_id": rid, "seed": cmd["seed"], "steps": cmd["steps"]})

        def progress(tick: int, total: int, metrics: dict[str, float]) -> None:
            _emit({"frame": "tick", "run_id": rid, "tick": tick, "metrics": metrics})

        def on_snapshot_json(snapshot: Any) -> None:
            _emit(
                {
                    "frame": "snapshot",
                    "run_id": rid,
                    "tick": snapshot.tick,
                    "space": snapshot.space,
                    "encoding": "json",
                    "payload": snapshot.payload,
                }
            )

        on_snapshot = (
            _binary_snapshot_handler(rid, config, cmd["seed"])
            if cmd.get("snapshot_encoding") == "binary"
            else on_snapshot_json
        )

        record = simulate(
            config,
            seed=cmd["seed"],
            steps=cmd["steps"],
            output_dir=cmd["output_dir"],
            params=cmd.get("params"),
            trace_level=cmd.get("trace_level", "key"),
            run_id=rid,
            progress=progress,
            space_sample_rate=cmd.get("space_sample_rate", 0),
            space_agent_cap=cmd.get("space_agent_cap"),
            on_snapshot=on_snapshot,
            interventions=cmd.get("interventions"),
        )
        _emit({"frame": "run_done", "run_id": rid, "record": record.model_dump(mode="json")})
    except Exception as exc:  # one failed run must not kill the worker process
        _emit(
            {
                "frame": "error",
                "run_id": rid,
                "type": type(exc).__name__,
                "message": str(exc),
            }
        )


def _experiment(cmd: dict[str, Any]) -> None:
    """Run a batch experiment (sweep × replications) streaming per-run progress.

    Reuses the kernel's `ExperimentRunner` (expand → run, deterministic + a
    single failed run is recorded, not fatal). Frame sequence:

        experiment_meta -> run_done* -> experiment_done | error

    Each `run_done` carries the full RunRecord (status completed|failed) plus the
    batch index/total, so the server can persist every RunRecord and report
    progress without re-deriving it.
    """
    eid = cmd.get("experiment_id")
    try:
        exp = parse_experiment_config(cmd["experiment"])
        config = parse_model_config(cmd["config"])
        runner = ExperimentRunner()
        plans = runner.expand(exp)
        _emit({"frame": "experiment_meta", "experiment_id": eid, "total": len(plans)})

        def on_done(index: int, total: int, _plan: Any, record: Any) -> None:
            _emit(
                {
                    "frame": "run_done",
                    "experiment_id": eid,
                    "index": index,
                    "total": total,
                    "record": record.model_dump(mode="json"),
                }
            )

        runner.run(exp, config, cmd["output_dir"], plans=plans, on_run_done=on_done)
        _emit({"frame": "experiment_done", "experiment_id": eid})
    except Exception as exc:  # parse/setup failure — surface, don't crash the worker
        _emit(
            {
                "frame": "error",
                "experiment_id": eid,
                "run_id": None,
                "type": type(exc).__name__,
                "message": str(exc),
            }
        )


def _dump_config(cmd: dict[str, Any]) -> None:
    name = cmd.get("name")
    builder = _BUILTIN_CONFIGS.get(name) if isinstance(name, str) else None
    if builder is None:
        _emit(
            {
                "frame": "error",
                "run_id": None,
                "type": "UnknownTemplate",
                "message": f"unknown built-in config: {name!r}",
            }
        )
        return
    try:
        config = builder().model_dump(mode="json")
        _emit({"frame": "config", "name": name, "config": config})
    except Exception as exc:
        _emit({"frame": "error", "run_id": None, "type": type(exc).__name__, "message": str(exc)})


def _mechanism_graph(cmd: dict[str, Any]) -> None:
    """Derive the deterministic MechanismGraph for a ModelConfig (P2, contracts §16).

    Python stays authoritative for the graph topology — the server never
    re-derives edges in TS, it asks the kernel via this command.
    """
    try:
        config = parse_model_config(cmd["config"])
        graph = build_mechanism_graph(config)
        _emit({"frame": "mechanism_graph", "graph": graph.model_dump(mode="json")})
    except Exception as exc:
        _emit({"frame": "error", "run_id": None, "type": type(exc).__name__, "message": str(exc)})


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as exc:
            _emit(
                {"frame": "error", "run_id": None, "type": "JSONDecodeError", "message": str(exc)}
            )
            continue
        action = cmd.get("cmd")
        if action == "run":
            _run(cmd)
        elif action == "experiment":
            _experiment(cmd)
        elif action == "dump_config":
            _dump_config(cmd)
        elif action == "mechanism_graph":
            _mechanism_graph(cmd)
        elif action == "shutdown":
            break


if __name__ == "__main__":
    main()
