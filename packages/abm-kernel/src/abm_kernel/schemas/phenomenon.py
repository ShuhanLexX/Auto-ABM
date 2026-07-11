"""Inverse-research contracts — see docs/architecture/data-contracts.md §9.

These back the "phenomenon → mechanism" paradigm (M2.2): a research-relevant
macro phenomenon is expressed as computable criteria (TargetPhenomenon), several
candidate mechanism variants (MechanismHypothesis, each an inline ModelConfig) are
run with shared seeds, and each is scored against the phenomenon by *real* results
(PhenomenonFit). fit_score is never fabricated by AI (P1/P2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from abm_kernel.schemas.model_config import SCHEMA_VERSION, KernelBaseModel, ModelConfig

PhenomenonStatistic = Literal["final", "peak", "min", "mean"]
HypothesisStatus = Literal["pending", "completed", "failed"]
# "partial" = ran, but ≥1 variant failed (the rest still scored against real results).
StudyStatus = Literal["pending", "running", "completed", "partial", "failed"]


class PhenomenonMetric(KernelBaseModel):
    metric_id: str  # 引用 Observer.id
    target: str  # 判据, 见 phenomenon.parse_target / data-contracts §9
    statistic: PhenomenonStatistic = "final"  # 取该指标的哪个统计量
    weight: float = 1.0  # 加权聚合权重 (>0)
    tolerance: float | None = None  # 近似/衰减尺度 (可空, 缺省按阈值推断)

    @field_validator("weight")
    @classmethod
    def _positive_weight(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("PhenomenonMetric.weight 必须 > 0")
        return v

    @field_validator("tolerance")
    @classmethod
    def _positive_tolerance(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("PhenomenonMetric.tolerance 必须 > 0 (或留空)")
        return v


class TargetPhenomenon(KernelBaseModel):
    id: str
    name: str
    description: str = ""  # 自然语言现象描述 (可来自文献/经验数据)
    metrics: list[PhenomenonMetric]  # 可计算的判定特征 (非空)
    source: str = ""  # 文献引用/数据来源 (可空; 不做数据校准)

    @field_validator("metrics")
    @classmethod
    def _non_empty(cls, v: list[PhenomenonMetric]) -> list[PhenomenonMetric]:
        if not v:
            raise ValueError("TargetPhenomenon.metrics 不能为空")
        return v


class MetricFit(KernelBaseModel):
    """Per-metric fit breakdown — traceable to the real observed statistic."""

    metric_id: str
    statistic: str
    target: str
    observed: float | None  # 真实实测统计量 (无结果=None, 不编造)
    satisfied: bool  # 是否满足判据
    score: float  # 该指标平滑得分 [0,1]


class PhenomenonFit(KernelBaseModel):
    fit_score: float  # Σ(w_i·score_i)/Σw_i, 范围 [0,1]
    breakdown: list[MetricFit]


class MechanismHypothesis(KernelBaseModel):
    """A candidate mechanism hypothesis = one inline ModelConfig variant."""

    id: str
    name: str
    rationale: str = ""  # 为何提出该假设 (真实 rationale, AI 或人工; 不编造)
    config: ModelConfig  # 内联变体 (自包含于 study, 不占用项目级单模型槽位)
    code_files: dict[str, str] = Field(default_factory=dict)  # 变体可选生成代码 (执行走 P4)
    run_id: str | None = None  # 运行后绑定的真实 Run (可追溯)
    status: HypothesisStatus = "pending"
    error: str = ""  # 变体跑挂时的错误 (不阻断其余变体)
    fit_score: float | None = None  # 与 TargetPhenomenon 的吻合度 (0~1; 由真实结果计算)
    fit: PhenomenonFit | None = None  # fit 拆解 (per-metric observed vs target)


class MechanismComparisonStudy(KernelBaseModel):
    """One inverse-research study: target phenomenon + candidate hypotheses + ranking."""

    schema_version: str = SCHEMA_VERSION
    id: str
    project_id: str
    name: str
    target: TargetPhenomenon
    hypotheses: list[MechanismHypothesis]  # 跑后按 fit_score 降序 (None 垫底)
    base_seed: int = 42  # 同 replication_index 跨假设共享 seed (公平)
    steps: int = 100
    replications: int = 1  # 每假设重复次数 (多种子稳健)
    status: StudyStatus = "pending"
    created_at: str = ""

    @field_validator("hypotheses")
    @classmethod
    def _non_empty(cls, v: list[MechanismHypothesis]) -> list[MechanismHypothesis]:
        if not v:
            raise ValueError("MechanismComparisonStudy.hypotheses 不能为空")
        return v


__all__ = [
    "HypothesisStatus",
    "MechanismComparisonStudy",
    "MechanismHypothesis",
    "MetricFit",
    "PhenomenonFit",
    "PhenomenonMetric",
    "PhenomenonStatistic",
    "StudyStatus",
    "TargetPhenomenon",
]
