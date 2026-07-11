"""ExperimentConfig contract — see docs/architecture/data-contracts.md §2."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from abm_kernel.schemas.model_config import SCHEMA_VERSION, KernelBaseModel


class SweepAxis(KernelBaseModel):
    parameter_id: str  # 必须存在于 ModelConfig.parameters
    values: list[Any]

    @field_validator("values")
    @classmethod
    def _non_empty(cls, v: list[Any]) -> list[Any]:
        if not v:
            raise ValueError("SweepAxis.values 不能为空")
        return v


class ExperimentDesign(KernelBaseModel):
    type: Literal["fixed", "single_sweep", "grid"]
    sweep: list[SweepAxis] = Field(default_factory=list)  # single_sweep=1轴; grid=多轴(MVP≤2)
    fixed_parameters: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_axes(self) -> ExperimentDesign:
        n = len(self.sweep)
        if self.type == "fixed" and n != 0:
            raise ValueError("design.type=fixed 不应包含 sweep 轴")
        if self.type == "single_sweep" and n != 1:
            raise ValueError("design.type=single_sweep 必须且仅有 1 个 sweep 轴")
        if self.type == "grid" and not (1 <= n <= 2):
            raise ValueError("design.type=grid 的 sweep 轴数 MVP 限制为 1~2")
        return self


class ExperimentConfig(KernelBaseModel):
    schema_version: str = SCHEMA_VERSION
    id: str
    name: str
    description: str = ""
    model_id: str
    model_version: str  # 绑定具体模型版本 (P1)
    design: ExperimentDesign
    replications: int = 1  # 每个参数组合的重复次数 (多种子)
    base_seed: int  # seed = base_seed + replication_index
    steps: int  # 每个 Run 的 tick 数
    collect_metrics: list[str]  # Observer.id 列表
    trace_level: Literal["off", "key", "full"] = "key"

    @field_validator("replications")
    @classmethod
    def _at_least_one_rep(cls, v: int) -> int:
        if v < 1:
            raise ValueError("replications 必须 >= 1")
        return v

    @field_validator("steps")
    @classmethod
    def _positive_steps(cls, v: int) -> int:
        if v < 1:
            raise ValueError("steps 必须 >= 1")
        return v


__all__ = ["ExperimentConfig", "ExperimentDesign", "SweepAxis"]
