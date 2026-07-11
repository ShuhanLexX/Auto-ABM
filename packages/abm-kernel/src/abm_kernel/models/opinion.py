"""Template model: bounded-confidence opinion dynamics (Deffuant) on a network.

Each agent holds a continuous opinion in [0, 1]. On every step an agent meets one
random neighbor; if their opinions are within ``confidence_threshold`` they move
toward each other by ``convergence_rate`` times the gap. Tight thresholds yield
consensus, loose ones fragment into opinion clusters — a classic social-influence
result. Exercises the network environment with continuous state variables.
"""

from __future__ import annotations

from abm_kernel.base import KernelAgent, KernelModel
from abm_kernel.behavior import ModelBehavior, register_behavior
from abm_kernel.schemas import (
    AgentType,
    Environment,
    Initialization,
    Mechanism,
    ModelConfig,
    Observer,
    Parameter,
    StateVariable,
)

MODEL_ID = "template_opinion_dynamics"


# ---- mechanisms ----------------------------------------------------------


def _assign_opinions(model: KernelModel) -> None:
    """Init: give every agent a uniform-random opinion in [0, 1]."""
    for agent in model.agents:
        model.change_state(agent, "opinion", round(model.random.random(), 6))


def _interact(agent: KernelAgent, model: KernelModel) -> None:
    """Step: meet a random neighbor; if within confidence, converge opinions."""
    neighbors = model.neighbors(agent)
    if not neighbors:
        return
    other = model.random.choice(neighbors)
    gap = other.state["opinion"] - agent.state["opinion"]
    if abs(gap) >= float(model.params["confidence_threshold"]):
        return
    rate = float(model.params["convergence_rate"])
    model.change_state(agent, "opinion", round(agent.state["opinion"] + rate * gap, 6))
    model.change_state(other, "opinion", round(other.state["opinion"] - rate * gap, 6))


# ---- observers -----------------------------------------------------------


def _opinions(model: KernelModel) -> list[float]:
    return [float(a.state["opinion"]) for a in model.agents]


def _opinion_mean(model: KernelModel) -> float:
    values = _opinions(model)
    return sum(values) / len(values) if values else 0.0


def _opinion_variance(model: KernelModel) -> float:
    values = _opinions(model)
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


def _clusters(model: KernelModel) -> float:
    """Distinct opinion clusters (opinions binned to 0.05 width)."""
    bins = {round(v / 0.05) for v in _opinions(model)}
    return float(len(bins))


# ---- config + behavior ---------------------------------------------------


def opinion_model_config(*, population: int = 120, network_p: float = 0.06) -> ModelConfig:
    """Return the bounded-confidence opinion-dynamics ModelConfig (network)."""
    return ModelConfig(
        id=MODEL_ID,
        name="意见动力学 (bounded confidence)",
        description="社交网络上的有限信任意见动力学：相近意见才相互影响并收敛，"
        "信任阈值决定走向共识或分裂。",
        version="1.0.0",
        agents=[
            AgentType(
                id="person",
                name="个体",
                description="持有 [0,1] 连续意见值的个体。",
                state_variables=[
                    StateVariable(
                        name="opinion",
                        dtype="float",
                        default=0.5,
                        value_range=(0.0, 1.0),
                        description="个体的连续意见值",
                    )
                ],
                behavior_refs=["interact"],
            )
        ],
        environment=Environment(
            type="network",
            config={"kind": "erdos_renyi", "params": {"p": network_p}},
        ),
        mechanisms=[
            Mechanism(
                id="assign_opinions",
                name="初始意见分配",
                trigger="初始化",
                effect="为每个个体赋 [0,1] 均匀随机意见",
                code_ref="_assign_opinions",
            ),
            Mechanism(
                id="interact",
                name="有限信任互动",
                trigger="每步：每个个体",
                effect="与随机邻居互动，意见差小于阈值则相互收敛",
                code_ref="_interact",
            ),
        ],
        parameters=[
            Parameter(
                id="confidence_threshold",
                name="信任阈值",
                dtype="float",
                default=0.3,
                min=0.0,
                max=1.0,
                step=0.05,
                scope="experiment",
                description="意见差小于此值才相互影响",
            ),
            Parameter(
                id="convergence_rate",
                name="收敛速率",
                dtype="float",
                default=0.3,
                min=0.0,
                max=0.5,
                step=0.05,
                description="每次互动向对方靠拢的比例",
            ),
        ],
        observers=[
            Observer(id="opinion_mean", name="平均意见", dtype="float"),
            Observer(id="opinion_variance", name="意见方差", dtype="float"),
            Observer(id="clusters", name="意见簇数", dtype="int"),
        ],
        initialization=Initialization(
            agent_counts={"person": population},
            notes="每个个体初始意见为 [0,1] 均匀随机。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("assign_opinions", _assign_opinions, level="model", phase="init")
    behavior.add_mechanism("interact", _interact, level="agent", phase="step")
    behavior.add_observer("opinion_mean", _opinion_mean)
    behavior.add_observer("opinion_variance", _opinion_variance)
    behavior.add_observer("clusters", _clusters)
    return behavior


OPINION_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, OPINION_BEHAVIOR)
