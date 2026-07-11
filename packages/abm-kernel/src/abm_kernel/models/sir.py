"""Template model: spatial SIR epidemic on a grid.

A classic susceptible/infected/recovered epidemic where infection spreads to
Moore-neighborhood cells. Exercises the kernel `grid` environment and serves as
a second built-in template alongside the network rumor model.
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

MODEL_ID = "template_sir_grid"


# ---- mechanisms ----------------------------------------------------------


def _seed_infection(model: KernelModel) -> None:
    """Init: randomly seed `initial_infected` residents as infected."""
    count = int(model.params["initial_infected"])
    agents = list(model.agents)
    for agent in model.random.sample(agents, min(count, len(agents))):
        model.change_state(agent, "state", "infected")


def _infect(agent: KernelAgent, model: KernelModel) -> None:
    """Step: an infected resident infects susceptible neighbors with prob beta."""
    if agent.state["state"] != "infected":
        return
    beta = float(model.params["beta"])
    for neighbor in model.neighbors(agent):
        if neighbor.state["state"] == "susceptible" and model.random.random() < beta:
            model.change_state(neighbor, "state", "infected")


def _recover(agent: KernelAgent, model: KernelModel) -> None:
    """Step: an infected resident recovers (immune) with prob gamma."""
    if agent.state["state"] != "infected":
        return
    if model.random.random() < float(model.params["gamma"]):
        model.change_state(agent, "state", "recovered")


# ---- observers -----------------------------------------------------------


def _count_state(model: KernelModel, value: str) -> float:
    return float(sum(1 for agent in model.agents if agent.state.get("state") == value))


def _susceptible(model: KernelModel) -> float:
    return _count_state(model, "susceptible")


def _infected(model: KernelModel) -> float:
    return _count_state(model, "infected")


def _recovered(model: KernelModel) -> float:
    return _count_state(model, "recovered")


# ---- config + behavior ---------------------------------------------------


def sir_model_config(*, width: int = 25, height: int = 25, population: int = 400) -> ModelConfig:
    """Return the spatial SIR ModelConfig on a torus grid."""
    return ModelConfig(
        id=MODEL_ID,
        name="空间 SIR 流行病 (grid)",
        description="网格上的易感/感染/康复流行病模型，感染向 Moore 邻域扩散。",
        version="1.0.0",
        agents=[
            AgentType(
                id="resident",
                name="居民",
                description="网格上的居民，持 S/I/R 三态之一。",
                state_variables=[
                    StateVariable(
                        name="state",
                        dtype="categorical",
                        default="susceptible",
                        choices=["susceptible", "infected", "recovered"],
                        description="易感 / 感染 / 康复（免疫）",
                    )
                ],
                behavior_refs=["infect", "recover"],
            )
        ],
        environment=Environment(
            type="grid",
            config={"width": width, "height": height, "torus": True, "moore": True},
        ),
        mechanisms=[
            Mechanism(
                id="seed_infection",
                name="初始感染播种",
                trigger="初始化",
                effect="随机将 initial_infected 个居民置为 infected",
                code_ref="_seed_infection",
            ),
            Mechanism(
                id="infect",
                name="邻域传染",
                trigger="每步：infected 居民",
                effect="以 beta 概率感染 Moore 邻域内 susceptible 居民",
                code_ref="_infect",
            ),
            Mechanism(
                id="recover",
                name="康复免疫",
                trigger="每步：infected 居民",
                effect="以 gamma 概率转为 recovered",
                code_ref="_recover",
            ),
        ],
        parameters=[
            Parameter(
                id="beta",
                name="传染概率",
                dtype="float",
                default=0.25,
                min=0.0,
                max=1.0,
                step=0.01,
                scope="experiment",
            ),
            Parameter(
                id="gamma",
                name="康复概率",
                dtype="float",
                default=0.08,
                min=0.0,
                max=1.0,
                step=0.01,
                scope="experiment",
            ),
            Parameter(
                id="initial_infected",
                name="初始感染数",
                dtype="int",
                default=5,
                min=1,
                max=1000,
                step=1,
            ),
        ],
        observers=[
            Observer(id="susceptible", name="易感数", dtype="int"),
            Observer(id="infected", name="感染数", dtype="int"),
            Observer(id="recovered", name="康复数", dtype="int"),
        ],
        initialization=Initialization(
            agent_counts={"resident": population},
            notes="居民随机铺在网格上，全员初始 susceptible，随机播种 initial_infected 个。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("seed_infection", _seed_infection, level="model", phase="init")
    behavior.add_mechanism("infect", _infect, level="agent", phase="step")
    behavior.add_mechanism("recover", _recover, level="agent", phase="step")
    behavior.add_observer("susceptible", _susceptible)
    behavior.add_observer("infected", _infected)
    behavior.add_observer("recovered", _recovered)
    return behavior


SIR_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, SIR_BEHAVIOR)
