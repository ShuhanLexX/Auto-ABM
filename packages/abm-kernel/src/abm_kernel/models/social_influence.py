"""Template model: Granovetter threshold model of social influence (complex contagion).

Each agent carries a personal activation ``threshold`` (drawn around
``mean_threshold``). A still-inactive agent activates only when the *fraction* of
its neighbors that are already active meets or exceeds its own threshold. Unlike
simple contagion (innovation diffusion), a single active contact is rarely enough —
behavior spreads in cascades that can stall, which is the hallmark of complex
contagion. Activation is monotonic.
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

MODEL_ID = "template_social_influence"


# ---- mechanisms ----------------------------------------------------------


def _assign_thresholds(model: KernelModel) -> None:
    """Init: draw each agent's threshold uniformly in [0, 2*mean] (clamped to [0,1])."""
    mean = float(model.params["mean_threshold"])
    for agent in model.agents:
        raw = model.random.uniform(0.0, 2.0 * mean)
        model.change_state(agent, "threshold", round(min(1.0, raw), 6))


def _seed_active(model: KernelModel) -> None:
    """Init: activate `initial_active` random agents to start cascades."""
    count = int(model.params["initial_active"])
    agents = list(model.agents)
    for agent in model.random.sample(agents, min(count, len(agents))):
        model.change_state(agent, "active", True)


def _maybe_activate(model: KernelModel) -> None:
    """Step (model-level, synchronous): activate agents meeting their threshold."""
    to_activate: list[KernelAgent] = []
    for agent in model.agents:
        if agent.state["active"]:
            continue
        neighbors = model.neighbors(agent)
        if not neighbors:
            continue
        active_frac = sum(1 for n in neighbors if n.state["active"]) / len(neighbors)
        if active_frac >= float(agent.state["threshold"]):
            to_activate.append(agent)
    for agent in to_activate:
        model.change_state(agent, "active", True)


# ---- observers -----------------------------------------------------------


def _active(model: KernelModel) -> float:
    return float(sum(1 for a in model.agents if a.state["active"]))


def _inactive(model: KernelModel) -> float:
    return float(sum(1 for a in model.agents if not a.state["active"]))


def _active_rate(model: KernelModel) -> float:
    agents = list(model.agents)
    return _active(model) / len(agents) if agents else 0.0


# ---- config + behavior ---------------------------------------------------


def social_influence_model_config(*, population: int = 150) -> ModelConfig:
    """Return the Granovetter threshold social-influence ModelConfig (network)."""
    return ModelConfig(
        id=MODEL_ID,
        name="社交影响阈值模型 (complex contagion)",
        description="Granovetter 阈值模型：个体仅当激活邻居比例达到自身阈值才激活，"
        "行为以级联方式扩散并可能停滞。",
        version="1.0.0",
        agents=[
            AgentType(
                id="person",
                name="个体",
                description="具个人阈值、可被社交影响激活的个体。",
                state_variables=[
                    StateVariable(
                        name="active",
                        dtype="bool",
                        default=False,
                        description="是否已采纳行为/被激活",
                    ),
                    StateVariable(
                        name="threshold",
                        dtype="float",
                        default=0.3,
                        value_range=(0.0, 1.0),
                        description="激活所需的活跃邻居比例阈值",
                    ),
                ],
                behavior_refs=[],
            )
        ],
        environment=Environment(
            type="network",
            config={"kind": "watts_strogatz", "params": {"k": 6, "p": 0.1}},
        ),
        mechanisms=[
            Mechanism(
                id="assign_thresholds",
                name="阈值分配",
                trigger="初始化",
                effect="在 mean_threshold 附近为每个个体抽取阈值",
                code_ref="_assign_thresholds",
            ),
            Mechanism(
                id="seed_active",
                name="初始激活播种",
                trigger="初始化",
                effect="随机激活 initial_active 个个体",
                code_ref="_seed_active",
            ),
            Mechanism(
                id="maybe_activate",
                name="阈值激活",
                trigger="每步 (模型级，同步)",
                effect="活跃邻居比例达阈值的个体被激活",
                code_ref="_maybe_activate",
            ),
        ],
        parameters=[
            Parameter(
                id="mean_threshold",
                name="平均阈值",
                dtype="float",
                default=0.25,
                min=0.0,
                max=1.0,
                step=0.05,
                scope="experiment",
                description="个人阈值分布的中心",
            ),
            Parameter(
                id="initial_active",
                name="初始激活数",
                dtype="int",
                default=5,
                min=1,
                max=1000,
                step=1,
                scope="experiment",
            ),
        ],
        observers=[
            Observer(id="active", name="激活数", dtype="int"),
            Observer(id="inactive", name="未激活数", dtype="int"),
            Observer(id="active_rate", name="激活率", dtype="float"),
        ],
        initialization=Initialization(
            agent_counts={"person": population},
            notes="全员初始未激活，按 mean_threshold 抽取阈值并播种 initial_active 个激活者。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("assign_thresholds", _assign_thresholds, level="model", phase="init")
    behavior.add_mechanism("seed_active", _seed_active, level="model", phase="init")
    behavior.add_mechanism("maybe_activate", _maybe_activate, level="model", phase="step")
    behavior.add_observer("active", _active)
    behavior.add_observer("inactive", _inactive)
    behavior.add_observer("active_rate", _active_rate)
    return behavior


SOCIAL_INFLUENCE_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, SOCIAL_INFLUENCE_BEHAVIOR)
