"""Template model: public-goods game with imitation on a network.

Each round every agent plays a public-goods game in the group formed by itself and
its neighbors: cooperators pay ``cost`` into each group they belong to, the pot is
multiplied by ``multiplication_factor`` and split equally among group members.
Agents then synchronously update strategy by imitating a random neighbor via the
Fermi rule (probability rises with the neighbor's payoff advantage and
``selection_strength``). Demonstrates the tension between individual incentive and
collective benefit — cooperation survives only when the multiplication factor is
high enough relative to group size.
"""

from __future__ import annotations

import math

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

MODEL_ID = "template_public_goods"


# ---- mechanisms ----------------------------------------------------------


def _assign_strategies(model: KernelModel) -> None:
    """Init: make ``initial_coop_rate`` of agents cooperators (rest defect)."""
    agents = list(model.agents)
    n_coop = round(float(model.params["initial_coop_rate"]) * len(agents))
    for agent in model.random.sample(agents, n_coop):
        model.change_state(agent, "strategy", "cooperate")


def _play_round(model: KernelModel) -> None:
    """Step: compute each agent's payoff from the public-goods groups it joins."""
    cost = float(model.params["cost"])
    factor = float(model.params["multiplication_factor"])
    for agent in model.agents:
        group = [agent, *model.neighbors(agent)]
        contributors = sum(1 for m in group if m.state["strategy"] == "cooperate")
        share = contributors * cost * factor / len(group)
        own_cost = cost if agent.state["strategy"] == "cooperate" else 0.0
        model.change_state(agent, "payoff", round(share - own_cost, 6))


def _update_strategies(model: KernelModel) -> None:
    """Step: synchronous Fermi imitation of a random neighbor's strategy."""
    k = float(model.params["selection_strength"])
    new_strategies: list[tuple[KernelAgent, str]] = []
    for agent in model.agents:
        neighbors = model.neighbors(agent)
        if not neighbors:
            continue
        other = model.random.choice(neighbors)
        diff = float(other.state["payoff"]) - float(agent.state["payoff"])
        prob = 1.0 / (1.0 + math.exp(-diff / k)) if k > 0 else (1.0 if diff > 0 else 0.0)
        if model.random.random() < prob and other.state["strategy"] != agent.state["strategy"]:
            new_strategies.append((agent, str(other.state["strategy"])))
    for agent, strategy in new_strategies:
        model.change_state(agent, "strategy", strategy)


# ---- observers -----------------------------------------------------------


def _cooperation_rate(model: KernelModel) -> float:
    agents = list(model.agents)
    if not agents:
        return 0.0
    return sum(1 for a in agents if a.state["strategy"] == "cooperate") / len(agents)


def _mean_payoff(model: KernelModel) -> float:
    payoffs = [float(a.state["payoff"]) for a in model.agents]
    return sum(payoffs) / len(payoffs) if payoffs else 0.0


# ---- config + behavior ---------------------------------------------------


def public_goods_model_config(*, population: int = 200) -> ModelConfig:
    """Return the public-goods game ModelConfig (cooperation on a network)."""
    return ModelConfig(
        id=MODEL_ID,
        name="公共品博弈 (network)",
        description="网络上的公共品博弈：合作者出资、池金放大后均分，"
        "个体经 Fermi 规则模仿高收益邻居，考察合作的涌现与崩塌。",
        version="1.0.0",
        agents=[
            AgentType(
                id="player",
                name="参与者",
                description="采取合作 / 背叛策略的博弈参与者。",
                state_variables=[
                    StateVariable(
                        name="strategy",
                        dtype="categorical",
                        default="defect",
                        choices=["cooperate", "defect"],
                        description="当前博弈策略",
                    ),
                    StateVariable(
                        name="payoff",
                        dtype="float",
                        default=0.0,
                        description="上一轮收益",
                    ),
                ],
                behavior_refs=[],
            )
        ],
        environment=Environment(
            type="network",
            config={"kind": "watts_strogatz", "params": {"k": 4, "p": 0.1}},
        ),
        mechanisms=[
            Mechanism(
                id="assign_strategies",
                name="初始策略分配",
                trigger="初始化",
                effect="按 initial_coop_rate 比例随机指定合作者",
                code_ref="_assign_strategies",
            ),
            Mechanism(
                id="play_round",
                name="公共品对局",
                trigger="每步 (模型级)",
                effect="按邻域群体计算每个参与者的收益",
                code_ref="_play_round",
            ),
            Mechanism(
                id="update_strategies",
                name="策略模仿更新",
                trigger="每步 (模型级，同步)",
                effect="经 Fermi 规则按收益差模仿随机邻居策略",
                code_ref="_update_strategies",
            ),
        ],
        parameters=[
            Parameter(
                id="multiplication_factor",
                name="池金放大系数",
                dtype="float",
                default=3.0,
                min=1.0,
                max=8.0,
                step=0.5,
                scope="experiment",
                description="合作出资汇集后的放大倍数",
            ),
            Parameter(
                id="cost",
                name="合作出资",
                dtype="float",
                default=1.0,
                min=0.1,
                max=5.0,
                step=0.1,
            ),
            Parameter(
                id="selection_strength",
                name="选择强度 (K)",
                dtype="float",
                default=0.5,
                min=0.05,
                max=2.0,
                step=0.05,
                description="Fermi 模仿对收益差的敏感度",
            ),
            Parameter(
                id="initial_coop_rate",
                name="初始合作比例",
                dtype="float",
                default=0.5,
                min=0.0,
                max=1.0,
                step=0.05,
            ),
        ],
        observers=[
            Observer(id="cooperation_rate", name="合作率", dtype="float"),
            Observer(id="mean_payoff", name="平均收益", dtype="float"),
        ],
        initialization=Initialization(
            agent_counts={"player": population},
            notes="按 initial_coop_rate 随机分配合作者，其余背叛。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism("assign_strategies", _assign_strategies, level="model", phase="init")
    behavior.add_mechanism("play_round", _play_round, level="model", phase="step")
    behavior.add_mechanism("update_strategies", _update_strategies, level="model", phase="step")
    behavior.add_observer("cooperation_rate", _cooperation_rate)
    behavior.add_observer("mean_payoff", _mean_payoff)
    return behavior


PUBLIC_GOODS_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, PUBLIC_GOODS_BEHAVIOR)
