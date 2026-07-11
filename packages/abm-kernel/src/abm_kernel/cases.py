"""Built-in case-study library (P2-10).

A CaseStudy bundles a built-in model template, a recommended batch-experiment
design, and a research narrative (background + the established scientific finding
of that model class). Instantiating a case sets up a real, runnable project; the
user then runs the included experiment to reproduce the result with real data.

Honesty (P2): narratives describe the *established qualitative behaviour* of these
classic models — they never fabricate the numbers of a run that has not happened.
Concrete results come from running the bundled experiment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from abm_kernel.schemas import ExperimentDesign, SweepAxis


@dataclass(frozen=True, slots=True)
class CaseStudy:
    """A curated, ready-to-run study built on a model template."""

    id: str
    name: str
    summary: str
    model_template_id: str
    experiment_name: str
    design: ExperimentDesign
    steps: int
    narrative_md: str
    expected_findings: list[str]
    replications: int = 1
    base_seed: int = 42
    tags: list[str] = field(default_factory=list)
    difficulty: Literal["intro", "core", "advanced"] = "core"


_CASES: list[CaseStudy] = [
    CaseStudy(
        id="case_schelling_tipping",
        name="Schelling：微小偏好如何放大为隔离",
        summary="扫描容忍阈值，观察温和的个体同类偏好如何涌现出强烈的空间隔离。",
        model_template_id="template_schelling",
        experiment_name="容忍阈值敏感性",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[SweepAxis(parameter_id="tolerance", values=[0.2, 0.3, 0.4, 0.5, 0.6, 0.7])],
        ),
        steps=40,
        replications=3,
        narrative_md=(
            "# Schelling 隔离模型\n\n"
            "Thomas Schelling (1971) 提出：即使个体只有**温和**的同类偏好，"
            "整体也会涌现出强烈的居住隔离。本案例扫描容忍阈值 `tolerance`，"
            "用平均同类邻居比例 (`segregation`) 度量隔离程度。\n\n"
            "## 怎么读结果\n"
            "运行随附实验后，对比不同 `tolerance` 下的 `segregation` 终值曲线，"
            "观察隔离如何随阈值升高而加剧，以及是否存在临界点。"
        ),
        expected_findings=[
            "容忍阈值越高，最终隔离程度 (segregation) 越强。",
            "即便阈值远低于 0.5（即多数人愿与异类为邻），系统仍会自发隔离。",
            "存在一个区间，隔离程度对阈值变化尤为敏感（临界放大）。",
        ],
        tags=["segregation", "classic", "grid"],
        difficulty="intro",
    ),
    CaseStudy(
        id="case_sir_epidemic",
        name="SIR：传染率决定疫情规模与峰值",
        summary="扫描网格 SIR 的传染概率 beta，观察疫情峰值与总感染规模的变化。",
        model_template_id="template_sir_grid",
        experiment_name="传染率敏感性",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[SweepAxis(parameter_id="beta", values=[0.1, 0.2, 0.3, 0.4, 0.5])],
        ),
        steps=60,
        replications=3,
        narrative_md=(
            "# 空间 SIR 流行病\n\n"
            "经典 SIR 模型刻画易感→感染→康复的疫情动力学。本案例在网格上扫描"
            "传染概率 `beta`，考察其对感染峰值 (`infected` 峰值) 与最终康复规模"
            "(`recovered` 终值) 的影响。\n\n"
            "## 怎么读结果\n"
            "对比不同 `beta` 下的感染曲线：传染率越高，峰值越早越高、最终波及越广。"
        ),
        expected_findings=[
            "beta 越高，感染峰值越高且到达更早。",
            "存在传播阈值：beta 过低时疫情很快熄灭，难以形成大规模流行。",
            "最终康复规模随 beta 升高而增大，逼近总人口。",
        ],
        tags=["epidemic", "SIR", "grid"],
        difficulty="intro",
    ),
    CaseStudy(
        id="case_rumor_intervention",
        name="谣言传播：辟谣干预的时机与力度",
        summary="扫描辟谣转化率，评估干预力度对谣言最终波及范围的抑制作用。",
        model_template_id="reference_rumor",
        experiment_name="辟谣力度敏感性",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[SweepAxis(parameter_id="debunk_rate", values=[0.0, 0.05, 0.1, 0.2, 0.4])],
        ),
        steps=80,
        replications=3,
        narrative_md=(
            "# 谣言传播 + 辟谣干预\n\n"
            "网络上的 SIR 类谣言传播：个体在易感/已信谣/已辟谣三态间转移，"
            "干预期后以 `debunk_rate` 将传谣者转为辟谣态。本案例扫描辟谣力度，"
            "考察其对最终消退规模 (`recovered`) 与感染峰值的影响。\n\n"
            "## 怎么读结果\n"
            "对比有无/不同强度辟谣下的感染曲线，评估干预能否显著压低峰值与总波及。"
        ),
        expected_findings=[
            "辟谣力度越大，感染峰值越低、谣言消退越快。",
            "存在边际递减：力度足够后继续加大的额外收益变小。",
            "零干预 (debunk_rate=0) 作为对照，凸显干预的净效果。",
        ],
        tags=["network", "intervention", "SIR"],
        difficulty="core",
    ),
    CaseStudy(
        id="case_opinion_consensus",
        name="意见动力学：信任阈值下的共识与分裂",
        summary="扫描有限信任阈值，观察社会意见走向共识、极化还是碎片化。",
        model_template_id="template_opinion_dynamics",
        experiment_name="信任阈值敏感性",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[
                SweepAxis(parameter_id="confidence_threshold", values=[0.1, 0.2, 0.3, 0.5, 0.8])
            ],
        ),
        steps=60,
        replications=3,
        narrative_md=(
            "# 有限信任意见动力学\n\n"
            "Deffuant 等提出的有限信任模型：个体只与意见相近者相互影响。"
            "本案例扫描信任阈值 `confidence_threshold`，用意见方差 (`opinion_variance`) "
            "与簇数 (`clusters`) 度量共识程度。\n\n"
            "## 怎么读结果\n"
            "阈值大→趋于单一共识（方差小、簇少）；阈值小→碎片化为多个意见簇。"
        ),
        expected_findings=[
            "信任阈值越大，越趋向全局共识（意见方差下降、簇数减少）。",
            "阈值很小时，社会碎片化为多个互不影响的意见簇。",
            "中间阈值附近可能出现两极/多极分化。",
        ],
        tags=["opinion", "consensus", "network"],
        difficulty="core",
    ),
    CaseStudy(
        id="case_innovation_diffusion",
        name="创新扩散：外部广告 vs 邻里模仿",
        summary="网格对比创新系数与模仿系数，解析 S 形采纳曲线的两股驱动力。",
        model_template_id="template_innovation_diffusion",
        experiment_name="创新×模仿系数网格",
        design=ExperimentDesign(
            type="grid",
            sweep=[
                SweepAxis(parameter_id="innovation_p", values=[0.005, 0.02]),
                SweepAxis(parameter_id="imitation_q", values=[0.2, 0.5, 0.8]),
            ],
        ),
        steps=50,
        replications=3,
        narrative_md=(
            "# 创新扩散 (Bass 模型)\n\n"
            "Bass 模型把采纳分解为**外部影响**（广告/媒体，系数 p）与**内部影响**"
            "（口碑模仿，系数 q）。本案例做 p×q 网格对比，解析两股力量如何"
            "共同塑造 S 形采纳曲线。\n\n"
            "## 怎么读结果\n"
            "对比各组合的采纳率 (`adoption_rate`) 曲线：q 主导扩散速度与拐点，"
            "p 决定早期能否起步。"
        ),
        expected_findings=[
            "模仿系数 q 越大，采纳曲线越陡、拐点越早（口碑驱动）。",
            "创新系数 p 决定早期启动，p 过小时扩散迟迟难以起步。",
            "高 q + 适度 p 组合给出最快的整体扩散。",
        ],
        tags=["diffusion", "adoption", "network"],
        difficulty="core",
    ),
    CaseStudy(
        id="case_public_goods",
        name="公共品博弈：合作何时能存活",
        summary="扫描池金放大系数，定位合作从崩塌到存活的临界点。",
        model_template_id="template_public_goods",
        experiment_name="放大系数敏感性",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[SweepAxis(parameter_id="multiplication_factor", values=[1.5, 2.5, 3.5, 5.0])],
        ),
        steps=50,
        replications=3,
        narrative_md=(
            "# 公共品博弈\n\n"
            "公共品博弈刻画个体理性与集体利益的张力：合作者出资、池金放大后均分，"
            "背叛者搭便车。本案例扫描放大系数 `multiplication_factor`，用合作率"
            "(`cooperation_rate`) 考察合作的存活与崩塌。\n\n"
            "## 怎么读结果\n"
            "放大系数低时合作崩塌；超过某临界值后合作得以维持甚至扩张。"
        ),
        expected_findings=[
            "放大系数过低时合作率趋于崩塌（背叛占优）。",
            "存在临界放大系数，越过后合作可在网络上维持。",
            "网络结构（局部聚集）有助于合作者抱团存活。",
        ],
        tags=["game-theory", "cooperation", "network"],
        difficulty="advanced",
    ),
]


def list_cases() -> list[CaseStudy]:
    """Return the built-in case studies."""
    return list(_CASES)


def get_case(case_id: str) -> CaseStudy | None:
    """Return a case study by id, or None."""
    return next((c for c in _CASES if c.id == case_id), None)
