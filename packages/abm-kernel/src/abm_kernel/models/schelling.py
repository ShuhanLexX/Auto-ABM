"""Template model: Schelling segregation on a grid.

Residents of two groups relocate to a random empty cell when the fraction of
same-group neighbors falls below their tolerance. Exercises the kernel `grid`
environment plus the deterministic `move_to_empty` relocation helper.
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

MODEL_ID = "template_schelling"


# ---- helpers -------------------------------------------------------------


def _same_fraction(agent: KernelAgent, model: KernelModel) -> float | None:
    """Fraction of neighbors sharing this agent's group; None if no neighbors."""
    neighbors = model.neighbors(agent)
    if not neighbors:
        return None
    same = sum(1 for n in neighbors if n.state["group"] == agent.state["group"])
    return same / len(neighbors)


# ---- mechanisms ----------------------------------------------------------


def _assign_groups(model: KernelModel) -> None:
    """Init: assign half the residents to group 'b' (rest stay 'a')."""
    agents = list(model.agents)
    half = len(agents) // 2
    for agent in model.random.sample(agents, half):
        model.change_state(agent, "group", "b")


def _relocate(agent: KernelAgent, model: KernelModel) -> None:
    """Step: if the same-group neighbor fraction is below tolerance, relocate."""
    frac = _same_fraction(agent, model)
    if frac is None:
        return
    if frac < float(model.params["tolerance"]):
        model.move_to_empty(agent)


# ---- observers -----------------------------------------------------------


def _segregation(model: KernelModel) -> float:
    """Mean same-group neighbor fraction across residents that have neighbors."""
    fractions = [f for a in model.agents if (f := _same_fraction(a, model)) is not None]
    if not fractions:
        return 0.0
    return sum(fractions) / len(fractions)


def _unhappy(model: KernelModel) -> float:
    """Count of residents whose same-group fraction is below tolerance."""
    tolerance = float(model.params["tolerance"])
    count = 0
    for agent in model.agents:
        frac = _same_fraction(agent, model)
        if frac is not None and frac < tolerance:
            count += 1
    return float(count)


# ---- config + behavior ---------------------------------------------------


def schelling_model_config(
    *, width: int = 20, height: int = 20, population: int = 320
) -> ModelConfig:
    """Return the Schelling segregation ModelConfig (two groups on a torus grid)."""
    return ModelConfig(
        id=MODEL_ID,
        name="Schelling 隔离模型 (grid)",
        description="两群体居民在网格上按同类邻居比例迁移，涌现空间隔离。",
        version="1.0.0",
        agents=[
            AgentType(
                id="resident",
                name="居民",
                description="属于 a / b 两群体之一的居民。",
                state_variables=[
                    StateVariable(
                        name="group",
                        dtype="categorical",
                        default="a",
                        choices=["a", "b"],
                        description="所属群体",
                    )
                ],
                behavior_refs=["relocate"],
            )
        ],
        environment=Environment(
            type="grid",
            config={"width": width, "height": height, "torus": True, "moore": True},
        ),
        mechanisms=[
            Mechanism(
                id="assign_groups",
                name="群体分配",
                trigger="初始化",
                effect="随机将半数居民分到群体 b",
                code_ref="_assign_groups",
            ),
            Mechanism(
                id="relocate",
                name="不满意迁移",
                trigger="每步：每个居民",
                effect="同类邻居比例低于 tolerance 时迁到随机空格",
                code_ref="_relocate",
            ),
        ],
        parameters=[
            Parameter(
                id="tolerance",
                name="同类容忍阈值",
                dtype="float",
                default=0.4,
                min=0.0,
                max=1.0,
                step=0.05,
                scope="experiment",
                description="同类邻居比例低于此值则迁移",
            ),
        ],
        observers=[
            Observer(id="segregation", name="平均同类比例", dtype="float"),
            Observer(id="unhappy", name="不满意居民数", dtype="int"),
        ],
        initialization=Initialization(
            agent_counts={"resident": population},
            notes="居民随机铺在网格上，半数 a 半数 b，留白格用于迁移。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("assign_groups", _assign_groups, level="model", phase="init")
    behavior.add_mechanism("relocate", _relocate, level="agent", phase="step")
    behavior.add_observer("segregation", _segregation)
    behavior.add_observer("unhappy", _unhappy)
    return behavior


SCHELLING_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, SCHELLING_BEHAVIOR)
