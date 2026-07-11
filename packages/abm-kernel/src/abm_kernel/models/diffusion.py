"""Template model: innovation diffusion (Bass-style simple contagion) on a network.

A non-adopter adopts each step with probability ``innovation_p`` (external
influence: ads, mass media) plus ``imitation_q`` times the fraction of its
neighbors who have already adopted (internal word-of-mouth). Adoption is
monotonic — once adopted, always adopted — producing the classic S-shaped
diffusion curve. Contrast with the social-influence threshold model (complex
contagion), where adoption needs a *fraction* of neighbors, not independent
contacts.
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

MODEL_ID = "template_innovation_diffusion"


# ---- mechanisms ----------------------------------------------------------


def _seed_adopters(model: KernelModel) -> None:
    """Init: mark `initial_adopters` random agents as early adopters."""
    count = int(model.params["initial_adopters"])
    agents = list(model.agents)
    for agent in model.random.sample(agents, min(count, len(agents))):
        model.change_state(agent, "adopted", True)


def _adopt(agent: KernelAgent, model: KernelModel) -> None:
    """Step: a non-adopter adopts via external + imitation pressure."""
    if agent.state["adopted"]:
        return
    neighbors = model.neighbors(agent)
    adopter_frac = (
        sum(1 for n in neighbors if n.state["adopted"]) / len(neighbors) if neighbors else 0.0
    )
    p = float(model.params["innovation_p"])
    q = float(model.params["imitation_q"])
    if model.random.random() < min(1.0, p + q * adopter_frac):
        model.change_state(agent, "adopted", True)


# ---- observers -----------------------------------------------------------


def _adopters(model: KernelModel) -> float:
    return float(sum(1 for a in model.agents if a.state["adopted"]))


def _non_adopters(model: KernelModel) -> float:
    return float(sum(1 for a in model.agents if not a.state["adopted"]))


def _adoption_rate(model: KernelModel) -> float:
    agents = list(model.agents)
    return _adopters(model) / len(agents) if agents else 0.0


# ---- config + behavior ---------------------------------------------------


def diffusion_model_config(*, population: int = 150, network_p: float = 0.05) -> ModelConfig:
    """Return the innovation-diffusion ModelConfig (Bass-style on a network)."""
    return ModelConfig(
        id=MODEL_ID,
        name="创新扩散 (Bass / 简单传染)",
        description="社交网络上的创新采纳：外部影响(广告)叠加邻居模仿驱动采纳，形成 S 形扩散曲线。",
        version="1.0.0",
        agents=[
            AgentType(
                id="person",
                name="个体",
                description="尚未采纳 / 已采纳创新的个体。",
                state_variables=[
                    StateVariable(
                        name="adopted",
                        dtype="bool",
                        default=False,
                        description="是否已采纳创新",
                    )
                ],
                behavior_refs=["adopt"],
            )
        ],
        environment=Environment(
            type="network",
            config={"kind": "barabasi_albert", "params": {"m": 3}},
        ),
        mechanisms=[
            Mechanism(
                id="seed_adopters",
                name="早期采纳者播种",
                trigger="初始化",
                effect="随机将 initial_adopters 个个体置为已采纳",
                code_ref="_seed_adopters",
            ),
            Mechanism(
                id="adopt",
                name="创新采纳",
                trigger="每步：未采纳个体",
                effect="以 innovation_p + imitation_q×邻居采纳比例 的概率采纳",
                code_ref="_adopt",
            ),
        ],
        parameters=[
            Parameter(
                id="innovation_p",
                name="创新系数 (外部影响)",
                dtype="float",
                default=0.01,
                min=0.0,
                max=0.2,
                step=0.005,
                scope="experiment",
                description="不受邻居影响时的自发采纳概率",
            ),
            Parameter(
                id="imitation_q",
                name="模仿系数 (内部影响)",
                dtype="float",
                default=0.4,
                min=0.0,
                max=1.0,
                step=0.05,
                scope="experiment",
                description="邻居采纳比例对采纳概率的权重",
            ),
            Parameter(
                id="initial_adopters",
                name="初始采纳数",
                dtype="int",
                default=3,
                min=1,
                max=1000,
                step=1,
            ),
        ],
        observers=[
            Observer(id="adopters", name="采纳数", dtype="int"),
            Observer(id="non_adopters", name="未采纳数", dtype="int"),
            Observer(id="adoption_rate", name="采纳率", dtype="float"),
        ],
        initialization=Initialization(
            agent_counts={"person": population},
            notes="全员初始未采纳，随机播种 initial_adopters 个早期采纳者。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("seed_adopters", _seed_adopters, level="model", phase="init")
    behavior.add_mechanism("adopt", _adopt, level="agent", phase="step")
    behavior.add_observer("adopters", _adopters)
    behavior.add_observer("non_adopters", _non_adopters)
    behavior.add_observer("adoption_rate", _adoption_rate)
    return behavior


DIFFUSION_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, DIFFUSION_BEHAVIOR)
