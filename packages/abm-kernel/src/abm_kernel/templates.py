"""Built-in template registry (F1).

Model templates wrap a ModelConfig factory so a project can be created from a
known-good model in one click. Experiment templates describe a batch design that
the backend instantiates against a chosen model (consumed by F2 ExperimentRunner).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from abm_kernel.models.diffusion import diffusion_model_config
from abm_kernel.models.opinion import opinion_model_config
from abm_kernel.models.public_goods import public_goods_model_config
from abm_kernel.models.rumor import rumor_model_config
from abm_kernel.models.schelling import schelling_model_config
from abm_kernel.models.sir import sir_model_config
from abm_kernel.models.social_influence import social_influence_model_config
from abm_kernel.models.wildfire import wildfire_model_config
from abm_kernel.schemas import ExperimentDesign, ModelConfig, SweepAxis


@dataclass(frozen=True, slots=True)
class ModelTemplate:
    """A built-in model a user can instantiate into a project."""

    id: str
    name: str
    summary: str
    tags: list[str]
    factory: Callable[[], ModelConfig]

    def build(self) -> ModelConfig:
        return self.factory()


@dataclass(frozen=True, slots=True)
class ExperimentTemplate:
    """A reusable batch-experiment design applied to a model's parameters."""

    id: str
    name: str
    summary: str
    design_type: str  # "single_sweep" | "grid" | "fixed"
    replications: int = 1
    # Builds a design from the experiment-scoped parameters of a model.
    build_design: Callable[[ModelConfig], ExperimentDesign] = field(repr=False, default=None)  # type: ignore[assignment]


_MODEL_TEMPLATES: list[ModelTemplate] = [
    ModelTemplate(
        id="reference_rumor",
        name="谣言传播 + 辟谣干预 (network)",
        summary="社交网络（Erdős–Rényi）上的 SIR 类谣言传播与辟谣干预参考模型。",
        tags=["network", "SIR", "intervention"],
        factory=rumor_model_config,
    ),
    ModelTemplate(
        id="template_sir_grid",
        name="空间 SIR 流行病 (grid)",
        summary="网格上的易感/感染/康复流行病，感染向 Moore 邻域扩散。",
        tags=["grid", "SIR", "epidemic"],
        factory=sir_model_config,
    ),
    ModelTemplate(
        id="template_schelling",
        name="Schelling 隔离模型 (grid)",
        summary="两群体按同类邻居比例迁移，涌现空间隔离。",
        tags=["grid", "segregation", "classic"],
        factory=schelling_model_config,
    ),
    ModelTemplate(
        id="template_wildfire_grid",
        name="山火蔓延 (forest fire grid)",
        summary="斑块燃料在网格上被邻近火点、风向与飞火点燃，形成火线、燃尽区和残余燃料。",
        tags=["grid", "wildfire", "forest-fire", "spatial"],
        factory=wildfire_model_config,
    ),
    ModelTemplate(
        id="template_opinion_dynamics",
        name="意见动力学 (bounded confidence)",
        summary="有限信任意见动力学：相近意见才相互影响，阈值决定共识或分裂。",
        tags=["network", "opinion", "consensus"],
        factory=opinion_model_config,
    ),
    ModelTemplate(
        id="template_innovation_diffusion",
        name="创新扩散 (Bass / 简单传染)",
        summary="外部影响叠加邻居模仿驱动采纳，形成 S 形扩散曲线。",
        tags=["network", "diffusion", "adoption"],
        factory=diffusion_model_config,
    ),
    ModelTemplate(
        id="template_public_goods",
        name="公共品博弈 (network)",
        summary="合作出资放大后均分，Fermi 模仿下考察合作的涌现与崩塌。",
        tags=["network", "game-theory", "cooperation"],
        factory=public_goods_model_config,
    ),
    ModelTemplate(
        id="template_social_influence",
        name="社交影响阈值模型 (complex contagion)",
        summary="Granovetter 阈值模型：活跃邻居比例达阈值才激活，行为级联扩散。",
        tags=["network", "threshold", "cascade"],
        factory=social_influence_model_config,
    ),
]


def _experiment_scoped_numeric(config: ModelConfig) -> list[str]:
    return [
        p.id for p in config.parameters if p.scope == "experiment" and p.dtype in ("int", "float")
    ]


def _sweep_values(config: ModelConfig, param_id: str, n: int = 4) -> list[float]:
    """Build n evenly spaced sweep values within a parameter's [min, max]."""
    param = next(p for p in config.parameters if p.id == param_id)
    lo = float(param.min if param.min is not None else 0.0)
    hi = float(param.max if param.max is not None else lo + 1.0)
    if param.dtype == "int":
        lo, hi = float(int(lo)), float(int(hi))
    span = hi - lo
    raw = [lo + span * i / (n - 1) for i in range(n)]
    if param.dtype == "int":
        return sorted({float(round(v)) for v in raw})
    return [round(v, 4) for v in raw]


def _param_sensitivity_design(config: ModelConfig) -> ExperimentDesign:
    params = _experiment_scoped_numeric(config)
    if not params:
        raise ValueError("模型没有 experiment 作用域的数值参数，无法做敏感性扫描")
    pid = params[0]
    return ExperimentDesign(
        type="single_sweep",
        sweep=[SweepAxis(parameter_id=pid, values=_sweep_values(config, pid))],
    )


def _intervention_compare_design(config: ModelConfig) -> ExperimentDesign:
    params = _experiment_scoped_numeric(config)
    if not params:
        raise ValueError("模型没有 experiment 作用域的数值参数，无法做对比网格")
    axes = [
        SweepAxis(parameter_id=pid, values=_sweep_values(config, pid, n=3)) for pid in params[:2]
    ]
    return ExperimentDesign(type="grid", sweep=axes)


def _seed_robustness_design(config: ModelConfig) -> ExperimentDesign:
    return ExperimentDesign(type="fixed")


_EXPERIMENT_TEMPLATES: list[ExperimentTemplate] = [
    ExperimentTemplate(
        id="param_sensitivity",
        name="参数敏感性",
        summary="对单个关键参数做扫描，观察指标随参数的变化。",
        design_type="single_sweep",
        replications=1,
        build_design=_param_sensitivity_design,
    ),
    ExperimentTemplate(
        id="intervention_compare",
        name="干预/策略对比",
        summary="对 1~2 个参数做网格对比，比较不同设置下的结果。",
        design_type="grid",
        replications=1,
        build_design=_intervention_compare_design,
    ),
    ExperimentTemplate(
        id="seed_robustness",
        name="多随机种子稳健性",
        summary="固定参数、多随机种子重复，检验结果稳健性。",
        design_type="fixed",
        replications=10,
        build_design=_seed_robustness_design,
    ),
]


def list_model_templates() -> list[ModelTemplate]:
    """Return the built-in model templates."""
    return list(_MODEL_TEMPLATES)


def get_model_template(template_id: str) -> ModelTemplate | None:
    """Return a model template by id, or None."""
    return next((t for t in _MODEL_TEMPLATES if t.id == template_id), None)


def list_experiment_templates() -> list[ExperimentTemplate]:
    """Return the built-in experiment templates."""
    return list(_EXPERIMENT_TEMPLATES)


def get_experiment_template(template_id: str) -> ExperimentTemplate | None:
    """Return an experiment template by id, or None."""
    return next((t for t in _EXPERIMENT_TEMPLATES if t.id == template_id), None)
