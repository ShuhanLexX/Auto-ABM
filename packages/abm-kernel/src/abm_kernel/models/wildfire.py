"""Template model: wildfire spread on a patch grid.

Each patch is a lightweight agent occupying one cell. Tree patches ignite from
burning neighbours, rocks act as non-burnable terrain, then burning patches
become burned; sparse trees create irregular fire fronts.
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

MODEL_ID = "template_wildfire_grid"


def _count_state(model: KernelModel, value: str) -> int:
    return sum(1 for agent in model.agents if agent.state.get("state") == value)


def _burnable(state: object) -> bool:
    return state == "tree" or state == "fuel"


def _seed_fuel_and_ignition(model: KernelModel) -> None:
    """Init: create trees/rocks/empty terrain and ignite a deterministic point."""
    fuel_density = float(model.params["fuel_density"])
    rock_density = float(model.params.get("rock_density", 0.08))
    ignition_count = int(model.params["ignition_count"])
    agents = list(model.agents)

    tree_density = max(0.0, min(1.0, fuel_density))
    rock_density = max(0.0, min(1.0 - tree_density, rock_density))
    tree_agents = []
    for agent in agents:
        draw = model.random.random()
        if draw < rock_density:
            model.change_state(agent, "state", "rock")
        elif draw < rock_density + tree_density:
            model.change_state(agent, "state", "tree")
            tree_agents.append(agent)
        else:
            model.change_state(agent, "state", "empty")

    if not tree_agents:
        return

    width = int(model.config.environment.config.get("width", 80))
    height = int(model.config.environment.config.get("height", 80))
    target_x = max(0, width // 8)
    target_y = max(0, height // 2)
    candidates = sorted(
        tree_agents,
        key=lambda agent: (
            (agent.pos[0] - target_x) ** 2 + (agent.pos[1] - target_y) ** 2,
            agent.unique_id,
        ),
    )
    for agent in _select_initial_ignitions(
        candidates,
        min(max(0, ignition_count), len(candidates)),
    ):
        model.change_state(agent, "state", "burning")


def _select_initial_ignitions(candidates: list[KernelAgent], count: int) -> list[KernelAgent]:
    """Pick one clear origin, or several dispersed origins for burst scenarios."""
    if count <= 0:
        return []
    selected = candidates[:1]
    remaining = candidates[1:]
    while len(selected) < count and remaining:
        next_agent = max(
            remaining,
            key=lambda agent: (
                min(
                    (agent.pos[0] - chosen.pos[0]) ** 2 + (agent.pos[1] - chosen.pos[1]) ** 2
                    for chosen in selected
                ),
                -agent.unique_id,
            ),
        )
        selected.append(next_agent)
        remaining.remove(next_agent)
    return selected


def _advance_fire(model: KernelModel) -> None:
    """Step: burning cells burn out; fuel ignites from neighbours and spotting."""
    current = {agent.unique_id: agent.state.get("state") for agent in model.agents}
    burning_exists = any(state == "burning" for state in current.values())
    spread_probability = float(model.params["spread_probability"])
    wind_bias = float(model.params["wind_bias"])
    spot_probability = float(model.params["spot_fire_probability"])

    changes: list[tuple[KernelAgent, str]] = []
    for agent in list(model.agents):
        state = current[agent.unique_id]
        if state == "burning":
            changes.append((agent, "burned"))
            continue
        if state == "burned":
            continue
        if not _burnable(state):
            continue

        burning_neighbors = [
            neighbor
            for neighbor in model.neighbors(agent)
            if current[neighbor.unique_id] == "burning"
        ]
        ignite_probability = 0.0
        if burning_neighbors:
            ignite_probability = 1 - (1 - spread_probability) ** len(burning_neighbors)
            x, _y = agent.pos
            downwind = any(neighbor.pos[0] < x for neighbor in burning_neighbors)
            if downwind:
                ignite_probability = min(1.0, ignite_probability + wind_bias)
        elif burning_exists:
            ignite_probability = spot_probability

        if ignite_probability > 0 and model.random.random() < ignite_probability:
            changes.append((agent, "burning"))

    for agent, state in changes:
        model.change_state(agent, "state", state)


def _regrow_fuel(model: KernelModel) -> None:
    """Step: burned cells can regrow as fuel in long-horizon scenarios."""
    regrowth_rate = float(model.params["regrowth_rate_per_tick"])
    if regrowth_rate <= 0:
        return
    for agent in list(model.agents):
        if agent.state.get("state") == "burned" and model.random.random() < regrowth_rate:
            model.change_state(agent, "state", "tree")


def _fuel(model: KernelModel) -> float:
    return float(_count_state(model, "tree") + _count_state(model, "fuel"))


def _tree(model: KernelModel) -> float:
    return float(_count_state(model, "tree") + _count_state(model, "fuel"))


def _rock(model: KernelModel) -> float:
    return float(_count_state(model, "rock"))


def _burning(model: KernelModel) -> float:
    return float(_count_state(model, "burning"))


def _burned(model: KernelModel) -> float:
    return float(_count_state(model, "burned"))


def _empty(model: KernelModel) -> float:
    return float(_count_state(model, "empty"))


def _burned_rate(model: KernelModel) -> float:
    total = len(model.agents)
    return 0.0 if total == 0 else _count_state(model, "burned") / total


def wildfire_model_config(*, width: int = 80, height: int = 80) -> ModelConfig:
    """Return a patch-based wildfire model on a fixed grid."""
    population = width * height
    return ModelConfig(
        id=MODEL_ID,
        name="山火蔓延 (single-ignition terrain grid)",
        description="树木、岩石和空地组成空间网格；火从一个初始点出发，沿可燃树木蔓延并留下燃尽区。",
        version="1.0.0",
        agents=[
            AgentType(
                id="patch",
                name="地块",
                description="每个网格单元代表一个可燃或已燃地块。",
                state_variables=[
                    StateVariable(
                        name="state",
                        dtype="categorical",
                        default="tree",
                        choices=["empty", "tree", "rock", "burning", "burned"],
                        description="空地 / 树木 / 岩石 / 燃烧中 / 已燃尽",
                    )
                ],
                behavior_refs=[],
            )
        ],
        environment=Environment(
            type="grid",
            config={"width": width, "height": height, "torus": False, "moore": True},
        ),
        mechanisms=[
            Mechanism(
                id="seed_fuel_and_ignition",
                name="地形分布与初始火点",
                trigger="初始化",
                effect="按 fuel_density 与 rock_density 生成树木、岩石和空地，并在一个确定位置播种 ignition_count 个火点",
                code_ref="_seed_fuel_and_ignition",
            ),
            Mechanism(
                id="advance_fire_front",
                name="火线推进",
                trigger="每步：全局同步更新",
                effect="燃烧地块转为 burned，树木地块按邻近火点、风向偏置和可选飞火概率被点燃",
                code_ref="_advance_fire",
            ),
            Mechanism(
                id="fuel_regrowth",
                name="燃料再生",
                trigger="每步：已燃尽地块",
                effect="以 regrowth_rate_per_tick 概率从 burned 重新变为 tree，用于长期恢复情景",
                code_ref="_regrow_fuel",
            ),
        ],
        parameters=[
            Parameter(
                id="fuel_density",
                name="燃料密度",
                dtype="float",
                default=0.72,
                min=0.1,
                max=1.0,
                step=0.01,
                scope="experiment",
                description="初始有燃料的地块比例，决定火线是否能连通。",
            ),
            Parameter(
                id="rock_density",
                name="岩石密度",
                dtype="float",
                default=0.08,
                min=0.0,
                max=0.35,
                step=0.01,
                scope="experiment",
                description="初始化为不可燃岩石障碍的地块比例。",
            ),
            Parameter(
                id="spread_probability",
                name="邻域点燃概率",
                dtype="float",
                default=0.34,
                min=0.0,
                max=1.0,
                step=0.01,
                scope="experiment",
                description="燃烧邻居点燃燃料地块的基础概率。",
            ),
            Parameter(
                id="wind_bias",
                name="风向助燃强度",
                dtype="float",
                default=0.18,
                min=0.0,
                max=0.6,
                step=0.01,
                scope="experiment",
                description="火从左向右扩散时的额外点燃概率。",
            ),
            Parameter(
                id="spot_fire_probability",
                name="飞火概率",
                dtype="float",
                default=0.0,
                min=0.0,
                max=0.05,
                step=0.0005,
                scope="experiment",
                description="无邻近火点时远距离新火点出现的概率；单点起火实验应保持为 0。",
            ),
            Parameter(
                id="regrowth_rate_per_tick",
                name="燃料再生率",
                dtype="float",
                default=0.0,
                min=0.0,
                max=0.08,
                step=0.001,
                scope="experiment",
                description="已燃尽地块每 tick 重新长成燃料的概率。",
            ),
            Parameter(
                id="ignition_count",
                name="初始火点数",
                dtype="int",
                default=1,
                min=1,
                max=50,
                step=1,
                scope="experiment",
                description="初始化时播种的火点数量。",
            ),
        ],
        observers=[
            Observer(id="tree", name="树木地块", dtype="int"),
            Observer(id="rock", name="岩石地块", dtype="int"),
            Observer(id="fuel", name="可燃地块", dtype="int"),
            Observer(id="burning", name="燃烧地块", dtype="int"),
            Observer(id="burned", name="已燃尽地块", dtype="int"),
            Observer(id="empty", name="空地", dtype="int"),
            Observer(id="burned_rate", name="燃尽比例", dtype="float"),
        ],
        initialization=Initialization(
            agent_counts={"patch": population},
            notes="每个网格单元都是一个地块；初始化按树木/岩石密度生成地形，并在单一点附近播种初始火点。",
        ),
    )


def _build_behavior() -> ModelBehavior:
    behavior = ModelBehavior()
    behavior.add_mechanism(
        "seed_fuel_and_ignition",
        _seed_fuel_and_ignition,
        level="model",
        phase="init",
    )
    behavior.add_mechanism("advance_fire_front", _advance_fire, level="model", phase="step")
    behavior.add_mechanism("fuel_regrowth", _regrow_fuel, level="model", phase="step")
    behavior.add_observer("tree", _tree)
    behavior.add_observer("rock", _rock)
    behavior.add_observer("fuel", _fuel)
    behavior.add_observer("burning", _burning)
    behavior.add_observer("burned", _burned)
    behavior.add_observer("empty", _empty)
    behavior.add_observer("burned_rate", _burned_rate)
    return behavior


WILDFIRE_BEHAVIOR = _build_behavior()
register_behavior(MODEL_ID, WILDFIRE_BEHAVIOR)
