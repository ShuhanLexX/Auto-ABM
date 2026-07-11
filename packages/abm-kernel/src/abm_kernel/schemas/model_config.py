"""ModelConfig contract — see docs/architecture/data-contracts.md §1.

Pydantic v2 是数据 schema 的唯一真源；字段名与契约文档严格一致。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from abm_kernel.util import is_snake_case, now_iso
from abm_kernel.version import KERNEL_VERSION

SCHEMA_VERSION = "1"


class KernelBaseModel(BaseModel):
    """Shared base: forbid unknown fields (clear errors) and allow `model_*` fields."""

    model_config = ConfigDict(extra="forbid", protected_namespaces=())


def _require_snake(value: str, field: str) -> str:
    if not is_snake_case(value):
        raise ValueError(f"{field} 必须为小写蛇形 (snake_case): {value!r}")
    return value


def _require_unique(ids: list[str], field: str) -> None:
    seen: set[str] = set()
    dupes: set[str] = set()
    for i in ids:
        if i in seen:
            dupes.add(i)
        seen.add(i)
    if dupes:
        raise ValueError(f"{field} 存在重复 id: {sorted(dupes)}")


class StateVariable(KernelBaseModel):
    name: str
    dtype: Literal["bool", "int", "float", "str", "categorical"]
    default: Any
    choices: list[str] | None = None
    value_range: tuple[float, float] | None = None
    description: str = ""

    @field_validator("name")
    @classmethod
    def _check_name(cls, v: str) -> str:
        return _require_snake(v, "StateVariable.name")


class AgentType(KernelBaseModel):
    id: str
    name: str
    description: str = ""
    state_variables: list[StateVariable] = Field(default_factory=list)
    behavior_refs: list[str] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _check_id(cls, v: str) -> str:
        return _require_snake(v, "AgentType.id")


class Environment(KernelBaseModel):
    type: Literal["none", "grid", "network", "continuous"]
    # grid: {width,height,torus}; network: {kind,params}; continuous: {width,height}
    # network.kind ∈ {erdos_renyi, barabasi_albert, watts_strogatz, complete, custom}
    config: dict[str, Any] = Field(default_factory=dict)


class Mechanism(KernelBaseModel):
    id: str
    name: str
    description: str = ""  # 人类可读机制说明 (供机制图/ODD)
    trigger: str = ""  # 何时触发
    effect: str = ""  # 产生什么影响
    code_ref: str | None = None  # 对应 mechanisms.py / behavior 中的函数名

    @field_validator("id")
    @classmethod
    def _check_id(cls, v: str) -> str:
        return _require_snake(v, "Mechanism.id")


class Parameter(KernelBaseModel):
    id: str
    name: str
    dtype: Literal["int", "float", "bool", "categorical"]
    default: Any
    min: float | None = None  # 数值型驱动滑块
    max: float | None = None
    step: float | None = None
    choices: list[str] | None = None
    scope: Literal["model", "experiment"] = "model"
    description: str = ""

    @field_validator("id")
    @classmethod
    def _check_id(cls, v: str) -> str:
        return _require_snake(v, "Parameter.id")


class Observer(KernelBaseModel):
    id: str
    name: str
    level: Literal["macro", "micro"] = "macro"
    dtype: Literal["int", "float"] = "float"
    description: str = ""

    @field_validator("id")
    @classmethod
    def _check_id(cls, v: str) -> str:
        return _require_snake(v, "Observer.id")


class Initialization(KernelBaseModel):
    agent_counts: dict[str, int]  # {agent_type_id: 数量}
    agent_overrides: dict[int, dict[str, Any]] = Field(default_factory=dict)
    # display_index -> {state_variable_name: initial_value}; applied after init
    # mechanisms so row-level workbench edits can override template seeding.
    notes: str = ""  # 初始状态分布说明

    @field_validator("agent_counts")
    @classmethod
    def _non_negative(cls, v: dict[str, int]) -> dict[str, int]:
        for key, count in v.items():
            if count < 0:
                raise ValueError(f"agent_counts[{key!r}] 不能为负: {count}")
        return v


class ModelConfig(KernelBaseModel):
    schema_version: str = SCHEMA_VERSION
    id: str
    name: str
    description: str = ""
    version: str  # 模型版本 (改结构必变, P1 复现依赖)
    agents: list[AgentType]
    environment: Environment
    mechanisms: list[Mechanism] = Field(default_factory=list)
    parameters: list[Parameter] = Field(default_factory=list)
    observers: list[Observer] = Field(default_factory=list)
    initialization: Initialization
    kernel_version: str = KERNEL_VERSION
    created_at: str = Field(default_factory=now_iso)

    @field_validator("id")
    @classmethod
    def _check_id(cls, v: str) -> str:
        return _require_snake(v, "ModelConfig.id")

    @model_validator(mode="after")
    def _check_references(self) -> ModelConfig:
        agent_ids = [a.id for a in self.agents]
        _require_unique(agent_ids, "agents")
        _require_unique([m.id for m in self.mechanisms], "mechanisms")
        _require_unique([p.id for p in self.parameters], "parameters")
        _require_unique([o.id for o in self.observers], "observers")

        mechanism_ids = {m.id for m in self.mechanisms}
        for agent in self.agents:
            for ref in agent.behavior_refs:
                if ref not in mechanism_ids:
                    raise ValueError(
                        f"AgentType {agent.id!r} 的 behavior_ref {ref!r} 未定义于 mechanisms"
                    )

        agent_id_set = set(agent_ids)
        for type_id in self.initialization.agent_counts:
            if type_id not in agent_id_set:
                raise ValueError(
                    f"initialization.agent_counts 键 {type_id!r} 不是已定义的 AgentType.id"
                )
        return self


__all__ = [
    "SCHEMA_VERSION",
    "AgentType",
    "Environment",
    "Initialization",
    "KernelBaseModel",
    "Mechanism",
    "ModelConfig",
    "Observer",
    "Parameter",
    "StateVariable",
]
