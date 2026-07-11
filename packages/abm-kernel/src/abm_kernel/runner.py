"""Single-run + batch execution (data-contracts.md §6).

`run_model`/`simulate` cover the single deterministic Run that everything else
builds on; `expand` + `ExperimentRunner` (F2) turn an ExperimentConfig into N
reproducible runs (sweep combinations × replications).
"""

from __future__ import annotations

import itertools
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import uuid4

from abm_kernel.base import KernelModel
from abm_kernel.behavior import ModelBehavior
from abm_kernel.builder import build_model
from abm_kernel.errors import KernelError
from abm_kernel.results import summarize_metrics, write_results_csv
from abm_kernel.schemas import ExperimentConfig, ModelConfig, RunRecord
from abm_kernel.schemas.run_plan import RunPlan
from abm_kernel.schemas.space import SpaceSnapshot
from abm_kernel.space import build_space_snapshot
from abm_kernel.trace import TraceLevel, TraceWriter
from abm_kernel.util import now_iso
from abm_kernel.version import KERNEL_VERSION


class RunError(KernelError):
    """A simulation run failed."""


# progress(tick, total_steps, metrics) — invoked after each observed tick.
ProgressFn = Callable[[int, int, dict[str, float]], None]
# on_snapshot(snapshot) — invoked when a SpaceSnapshot frame is emitted (P2-5 canvas).
SnapshotFn = Callable[[SpaceSnapshot], None]
# on_run_done(index, total_runs, plan, record) — invoked after each run in a batch.
RunDoneFn = Callable[[int, int, RunPlan, RunRecord], None]

# Space kinds the kernel can snapshot today (M2.1): network + grid.
_SNAPSHOT_ENVS = frozenset({"network", "grid"})


def _latest_metrics(model: KernelModel) -> dict[str, float]:
    if not model.history:
        return {}
    return {key: value for key, value in model.history[-1].items() if key != "tick"}


def run_model(
    model: KernelModel,
    steps: int,
    trace: TraceWriter,
    collect_metrics: list[str] | None = None,
    *,
    run_id: str | None = None,
    experiment_id: str | None = None,
    progress: ProgressFn | None = None,
    space_sample_rate: int = 0,
    space_agent_cap: int | None = None,
    on_snapshot: SnapshotFn | None = None,
) -> RunRecord:
    """Run an already-built model for `steps` ticks, writing trace, returning a RunRecord.

    When `space_sample_rate > 0` (network/grid models), a SpaceSnapshot is emitted at
    tick 0 and every N ticks — written to the trace (replay) and pushed to `on_snapshot`
    (live canvas). Snapshots are display-only and never affect determinism (P1).
    """
    metrics = collect_metrics or [o.id for o in model.config.observers]
    model.trace = trace
    model.collect_metrics = metrics
    rid = run_id or uuid4().hex
    started = now_iso()
    # Snapshot the initial effective params: interventions mutate model.params
    # mid-run, so the RunRecord must record what the run STARTED with.
    initial_params = dict(model.params)
    interventions = getattr(model, "interventions", None) or None
    emit_space = space_sample_rate > 0 and model.config.environment.type in _SNAPSHOT_ENVS
    space_meta = (
        {"space_sample_rate": space_sample_rate, "space_agent_cap": space_agent_cap}
        if emit_space
        else {}
    )
    trace.meta(
        run_id=rid,
        model_id=model.config.id,
        model_version=model.config.version,
        kernel_version=KERNEL_VERSION,
        seed=model.kernel_seed,
        parameters=initial_params,
        steps=steps,
        started_at=started,
        **({"interventions": interventions} if interventions else {}),
        **space_meta,
    )
    for agent in model.agents:
        trace.agent_init(agent.unique_id, agent.agent_type_id, agent.state)

    def _emit_snapshot() -> None:
        if not emit_space:
            return
        snapshot = build_space_snapshot(model, agent_cap=space_agent_cap)
        trace.space_snapshot(snapshot.tick, {"space": snapshot.space, **snapshot.payload})
        if on_snapshot is not None:
            on_snapshot(snapshot)

    try:
        model.setup()
        if progress is not None:
            progress(0, steps, _latest_metrics(model))
        _emit_snapshot()
        for _ in range(steps):
            model.step()
            if progress is not None:
                progress(int(model.steps), steps, _latest_metrics(model))
            if emit_space:
                tick = int(model.steps)
                if tick % space_sample_rate == 0 or tick == steps:
                    _emit_snapshot()
    except Exception as exc:
        trace.end(tick=int(getattr(model, "steps", 0)), status="failed")
        raise RunError(f"运行失败 (run_id={rid}): {exc}") from exc
    trace.end(tick=steps, status="completed")
    return RunRecord(
        id=rid,
        experiment_id=experiment_id,
        model_id=model.config.id,
        model_version=model.config.version,
        kernel_version=KERNEL_VERSION,
        seed=model.kernel_seed,
        parameters=initial_params,
        steps=steps,
        interventions=interventions,
        status="completed",
        started_at=started,
        finished_at=now_iso(),
        trace_path=str(trace.path),
        metrics_summary=summarize_metrics(model.history, metrics),
    )


def simulate(
    config: ModelConfig,
    *,
    seed: int,
    steps: int,
    output_dir: str | Path,
    params: dict[str, Any] | None = None,
    behavior: ModelBehavior | None = None,
    trace_level: TraceLevel = "key",
    collect_metrics: list[str] | None = None,
    run_id: str | None = None,
    experiment_id: str | None = None,
    progress: ProgressFn | None = None,
    space_sample_rate: int = 0,
    space_agent_cap: int | None = None,
    on_snapshot: SnapshotFn | None = None,
    interventions: list[dict[str, Any]] | None = None,
) -> RunRecord:
    """End-to-end single run: build → run → write trace.jsonl + results CSV.

    Lays out files under `output_dir` per project-structure.md (one trace per run).
    `interventions` schedule deterministic parameter changes at fixed ticks.
    """
    out = Path(output_dir)
    rid = run_id or uuid4().hex
    metrics = collect_metrics or [o.id for o in config.observers]
    trace_path = out / "trace" / f"{rid}.jsonl"
    result_path = out / "results" / "raw" / f"{rid}.csv"

    model = build_model(config, seed, params, behavior, interventions)
    with TraceWriter(trace_path, level=trace_level) as trace:
        record = run_model(
            model,
            steps,
            trace,
            metrics,
            run_id=rid,
            experiment_id=experiment_id,
            progress=progress,
            space_sample_rate=space_sample_rate,
            space_agent_cap=space_agent_cap,
            on_snapshot=on_snapshot,
        )
    write_results_csv(model.history, result_path, metrics)
    record.result_path = str(result_path)
    return record


# ---- F2: batch experiments -----------------------------------------------


def _combo_label(combo: dict[str, Any]) -> str:
    """Human-readable key for a sweep combination (stable order)."""
    if not combo:
        return "baseline"
    return ",".join(f"{k}={combo[k]}" for k in sorted(combo))


def expand(exp: ExperimentConfig) -> list[RunPlan]:
    """Expand an ExperimentConfig into concrete RunPlans (combos × replications).

    seed = base_seed + replication_index (shared across combos so differences are
    attributable to parameters, not seed — P1 fair comparison).
    """
    axes = exp.design.sweep
    if axes:
        value_lists = [[(ax.parameter_id, v) for v in ax.values] for ax in axes]
        combos = [dict(items) for items in itertools.product(*value_lists)]
    else:
        combos = [{}]

    plans: list[RunPlan] = []
    for combo in combos:
        label = _combo_label(combo)
        for rep in range(exp.replications):
            plans.append(
                RunPlan(
                    run_id=uuid4().hex,
                    parameters={**exp.design.fixed_parameters, **combo},
                    seed=exp.base_seed + rep,
                    replication_index=rep,
                    combo_label=label,
                )
            )
    return plans


class ExperimentRunner:
    """Expand an ExperimentConfig and run every plan sequentially (deterministic)."""

    def expand(self, exp: ExperimentConfig) -> list[RunPlan]:
        return expand(exp)

    def run(
        self,
        exp: ExperimentConfig,
        model_config: ModelConfig,
        output_dir: str | Path,
        *,
        behavior: ModelBehavior | None = None,
        plans: list[RunPlan] | None = None,
        on_run_done: RunDoneFn | None = None,
    ) -> list[RunRecord]:
        """Run all plans for an experiment; a failed run is recorded, not fatal.

        Pass `plans` to re-run a specific subset (e.g. retry only failed runs).
        """
        run_plans = plans if plans is not None else self.expand(exp)
        total = len(run_plans)
        records: list[RunRecord] = []
        for index, plan in enumerate(run_plans):
            record = self._run_one(exp, model_config, output_dir, plan, behavior)
            records.append(record)
            if on_run_done is not None:
                on_run_done(index, total, plan, record)
        return records

    def _run_one(
        self,
        exp: ExperimentConfig,
        model_config: ModelConfig,
        output_dir: str | Path,
        plan: RunPlan,
        behavior: ModelBehavior | None,
    ) -> RunRecord:
        try:
            return simulate(
                model_config,
                seed=plan.seed,
                steps=exp.steps,
                output_dir=output_dir,
                params=plan.parameters,
                behavior=behavior,
                trace_level=exp.trace_level,
                collect_metrics=exp.collect_metrics,
                run_id=plan.run_id,
                experiment_id=exp.id,
            )
        except Exception as exc:  # a single failed run must not abort the batch
            return RunRecord(
                id=plan.run_id,
                experiment_id=exp.id,
                model_id=model_config.id,
                model_version=model_config.version,
                kernel_version=KERNEL_VERSION,
                seed=plan.seed,
                parameters=plan.parameters,
                steps=exp.steps,
                status="failed",
                error={"type": type(exc).__name__, "message": str(exc)},
            )
