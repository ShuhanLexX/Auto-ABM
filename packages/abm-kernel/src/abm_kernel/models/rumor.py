"""Reference model: rumor spread + debunking intervention (SIR-like on a network).

This is the M1.1 reference use case (requirements.md 场景一/二/三). It exercises every
kernel feature — declarative config, deterministic RNG, observers, mechanisms, trace —
and serves as the baseline that AI-generated models are compared against.
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

MODEL_ID = "reference_rumor"


# ---- mechanisms ----------------------------------------------------------


def _seed_infection(model: KernelModel) -> None:
    """Init: randomly seed `initial_infected` agents as infected."""
    count = int(model.params["initial_infected"])
    agents = list(model.agents)
    for agent in model.random.sample(agents, min(count, len(agents))):
        model.change_state(agent, "state", "infected")


def _spread(agent: KernelAgent, model: KernelModel) -> None:
    """Step: an infected agent infects each susceptible neighbor with prob beta."""
    if agent.state["state"] != "infected":
        return
    beta = float(model.params["beta"])
    for neighbor in model.neighbors(agent):
        if neighbor.state["state"] == "susceptible" and model.random.random() < beta:
            model.change_state(neighbor, "state", "infected")


def _recover(agent: KernelAgent, model: KernelModel) -> None:
    """Step: an infected agent naturally stops believing with prob gamma."""
    if agent.state["state"] != "infected":
        return
    if model.random.random() < float(model.params["gamma"]):
        model.change_state(agent, "state", "recovered")


def _intervention(model: KernelModel) -> None:
    """Step (model-level): after intervention_start, debunking recovers infected agents."""
    start = int(model.params["intervention_start"])
    if model.steps < start:
        return
    if model.steps == start and model.trace is not None:
        model.trace.event(model.steps, "intervention_started", detail="辟谣干预启动")
    rate = float(model.params["debunk_rate"])
    for agent in list(model.agents):
        if agent.state["state"] == "infected" and model.random.random() < rate:
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


def rumor_model_config(*, population: int = 100, network_p: float = 0.06) -> ModelConfig:
    """Return the reference rumor ModelConfig (Erdos-Renyi social graph)."""
    return ModelConfig(
        id=MODEL_ID,
        name="谣言传播 + 辟谣干预 (SIR on network)",
        description="社交网络上的谣言传播与辟谣干预参考模型，作为内核/契约自洽基线。",
        version="1.0.0",
        agents=[
            AgentType(
                id="person",
                name="个体",
                description="社交网络中的个体，持 S/I/R 三态之一。",
                state_variables=[
                    StateVariable(
                        name="state",
                        dtype="categorical",
                        default="susceptible",
                        choices=["susceptible", "infected", "recovered"],
                        description="易感 / 已信谣传播 / 已辟谣或消退",
                    )
                ],
                behavior_refs=["spread", "recover"],
            )
        ],
        environment=Environment(
            type="network",
            config={"kind": "erdos_renyi", "params": {"p": network_p}},
        ),
        mechanisms=[
            Mechanism(
                id="seed_infection",
                name="初始感染播种",
                trigger="初始化",
                effect="随机将 initial_infected 个个体置为 infected",
                code_ref="_seed_infection",
            ),
            Mechanism(
                id="spread",
                name="谣言传播",
                trigger="每步：infected 个体",
                effect="以 beta 概率感染 susceptible 邻居",
                code_ref="_spread",
            ),
            Mechanism(
                id="recover",
                name="自然消退",
                trigger="每步：infected 个体",
                effect="以 gamma 概率转为 recovered",
                code_ref="_recover",
            ),
            Mechanism(
                id="intervention",
                name="辟谣干预",
                trigger="step >= intervention_start",
                effect="以 debunk_rate 使 infected 转为 recovered",
                code_ref="_intervention",
            ),
        ],
        parameters=[
            Parameter(
                id="beta",
                name="传播概率",
                dtype="float",
                default=0.08,
                min=0.0,
                max=1.0,
                step=0.01,
            ),
            Parameter(
                id="gamma",
                name="自然消退概率",
                dtype="float",
                default=0.02,
                min=0.0,
                max=1.0,
                step=0.01,
            ),
            Parameter(
                id="debunk_rate",
                name="辟谣转化率",
                dtype="float",
                default=0.10,
                min=0.0,
                max=1.0,
                step=0.01,
                scope="experiment",
            ),
            Parameter(
                id="intervention_start",
                name="干预起始步",
                dtype="int",
                default=30,
                min=0,
                max=500,
                step=1,
                scope="experiment",
            ),
            Parameter(
                id="initial_infected",
                name="初始感染数",
                dtype="int",
                default=3,
                min=1,
                max=1000,
                step=1,
            ),
        ],
        observers=[
            Observer(id="susceptible", name="易感数", dtype="int"),
            Observer(id="infected", name="感染数", dtype="int"),
            Observer(id="recovered", name="消退数", dtype="int"),
        ],
        initialization=Initialization(
            agent_counts={"person": population},
            notes="全员初始 susceptible，随机播种 initial_infected 个 infected。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("seed_infection", _seed_infection, level="model", phase="init")
    behavior.add_mechanism("spread", _spread, level="agent", phase="step")
    behavior.add_mechanism("recover", _recover, level="agent", phase="step")
    behavior.add_mechanism("intervention", _intervention, level="model", phase="step")
    behavior.add_observer("susceptible", _susceptible)
    behavior.add_observer("infected", _infected)
    behavior.add_observer("recovered", _recovered)
    return behavior


RUMOR_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, RUMOR_BEHAVIOR)
