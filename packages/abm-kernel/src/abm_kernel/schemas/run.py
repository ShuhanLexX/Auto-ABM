"""RunRecord contract — see docs/architecture/data-contracts.md §3."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from abm_kernel.schemas.model_config import KernelBaseModel


class Intervention(KernelBaseModel):
    """A scheduled parameter change applied at a fixed tick during a run.

    Deterministic by construction: same seed + params + version + interventions
    always reproduce the run. The change takes effect at the start of tick
    `at_tick` (before that tick's mechanisms), so the metric curve bends there.
    """

    at_tick: int  # 生效 tick (>=1)；tick 0 为初始观测，不触发
    params: dict[str, Any] = Field(default_factory=dict)  # 该 tick 起覆盖的参数
    note: str | None = None  # 可选说明（如“启动辟谣”）


class RunRecord(KernelBaseModel):
    id: str  # run_id
    experiment_id: str | None = None  # 单次仿真可为 None
    model_id: str
    model_version: str
    kernel_version: str
    seed: int  # P1 必记
    parameters: dict[str, Any]  # 本次完整生效参数 (含 sweep 取值)
    steps: int
    interventions: list[Intervention] | None = None  # 干预实验：计划内定点参数变更
    status: Literal["pending", "running", "completed", "failed"]
    started_at: str | None = None
    finished_at: str | None = None
    result_path: str | None = None  # raw 结果文件
    trace_path: str | None = None  # 对应 trace.jsonl
    metrics_summary: dict[str, dict[str, float]] = Field(default_factory=dict)
    error: dict[str, Any] | None = None  # {type, message, traceback_ref}


__all__ = ["Intervention", "RunRecord"]
