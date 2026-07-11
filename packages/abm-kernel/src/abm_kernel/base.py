"""Kernel base classes — standardized ABM model/agent on top of Mesa 3.x.

KernelModel is built declaratively from a ModelConfig plus a ModelBehavior:
the config describes structure (agent types, state, environment, parameters,
observers, mechanisms); the behavior supplies the callables. This keeps a single
standard contract for both the in-tree reference model and AI-generated models.
"""

from __future__ import annotations

import math
from typing import Any

import networkx as nx
from mesa import Agent, Model
from mesa.space import NetworkGrid, SingleGrid

from abm_kernel.behavior import ModelBehavior
from abm_kernel.errors import BuildError, MechanismError
from abm_kernel.rng import GRAPH_SALT, derive_seed
from abm_kernel.schemas import AgentType, ModelConfig
from abm_kernel.trace import TraceWriter
from abm_kernel.version import KERNEL_VERSION


class ABMAgent(Agent):
    """Legacy placeholder base — kept for backward compatibility."""


class ABMModel(Model):
    """Legacy placeholder base — kept for backward compatibility."""

    def __init__(self, seed: int | None = None) -> None:
        super().__init__(rng=seed)


class KernelAgent(Agent):
    """A standardized agent: typed by agent_type_id, state held in a dict."""

    def __init__(self, model: KernelModel, agent_type_id: str, state: dict[str, Any]) -> None:
        super().__init__(model)
        self.agent_type_id = agent_type_id
        self.state: dict[str, Any] = dict(state)

    @property
    def id(self) -> int:
        """Stable per-agent identifier (alias of Mesa's ``unique_id``).

        Generated model code very often reaches for ``agent.id``; Mesa only
        exposes ``unique_id``. We alias it so authored mechanisms don't crash
        at run time. Read-only and deterministic for a given seed.
        """
        return int(self.unique_id)

    def step(self) -> None:
        """Run this agent's step mechanisms (dispatched by the model)."""
        model: KernelModel = self.model
        model.run_agent_step(self)


class KernelModel(Model):
    """A standardized model built from a ModelConfig + ModelBehavior."""

    def __init__(
        self,
        config: ModelConfig,
        behavior: ModelBehavior,
        seed: int,
        params: dict[str, Any] | None = None,
        interventions: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(rng=seed)
        self.config = config
        self.behavior = behavior
        self.kernel_seed = seed
        self.kernel_version = KERNEL_VERSION

        defaults = {p.id: p.default for p in config.parameters}
        self.params: dict[str, Any] = {**defaults, **(params or {})}

        # Scheduled interventions: parameter changes applied at fixed ticks. Kept
        # deterministic (same seed + params + interventions reproduce the run) and
        # normalized to {tick -> merged param patch}. `self.interventions` keeps a
        # sorted, record-friendly copy for the RunRecord.
        self._interventions_by_tick: dict[int, dict[str, Any]] = {}
        for item in interventions or []:
            if not isinstance(item, dict):
                continue
            try:
                at_tick = int(item.get("at_tick"))
            except (TypeError, ValueError):
                continue
            patch = item.get("params")
            if at_tick < 1 or not isinstance(patch, dict) or not patch:
                continue
            merged = self._interventions_by_tick.setdefault(at_tick, {})
            merged.update(patch)
        self.interventions: list[dict[str, Any]] = [
            {"at_tick": tick, "params": dict(patch)}
            for tick, patch in sorted(self._interventions_by_tick.items())
        ]

        self.trace: TraceWriter | None = None
        self.collect_metrics: list[str] = [o.id for o in config.observers]
        self.history: list[dict[str, float]] = []
        # The mechanism currently executing — lets change_state attribute each state
        # change to the mechanism that caused it (grounded mechanism_fired, P2).
        self._active_mechanism: str | None = None

        self._agent_types: dict[str, AgentType] = {a.id: a for a in config.agents}
        self._agent_display_index: dict[int, int] = {}
        self._env_type = config.environment.type
        self.graph: Any = None
        self.grid: Any = None
        self._grid_moore: bool = True

        self._model_step_mechanisms = [
            spec
            for spec in behavior.mechanisms.values()
            if spec.level == "model" and spec.phase == "step"
        ]
        self._init_mechanisms = [
            spec for spec in behavior.mechanisms.values() if spec.phase == "init"
        ]

        self._build_environment()
        self._build_agents()

    # ---- construction ----------------------------------------------------

    def _build_environment(self) -> None:
        if self._env_type == "none":
            return
        if self._env_type == "network":
            self.graph = self._build_graph()
            self.grid = NetworkGrid(self.graph)
            return
        if self._env_type == "grid":
            self.grid = self._build_grid()
            return
        raise BuildError(
            f"环境类型 {self._env_type!r} MVP 暂未支持（当前支持 none / network / grid）"
        )

    def _build_grid(self) -> SingleGrid:
        cfg = self.config.environment.config
        requested_width = max(1, int(cfg.get("width", 20)))
        requested_height = max(1, int(cfg.get("height", 20)))
        torus = bool(cfg.get("torus", True))
        total = sum(self.config.initialization.agent_counts.values())
        width, height = self._grid_size_for_capacity(
            requested_width,
            requested_height,
            total,
        )
        self._grid_moore = bool(cfg.get("moore", True))
        return SingleGrid(width, height, torus)

    @staticmethod
    def _grid_size_for_capacity(width: int, height: int, total: int) -> tuple[int, int]:
        if total <= width * height:
            return width, height

        aspect_ratio = width / height
        next_width = max(width, math.ceil(math.sqrt(total * aspect_ratio)))
        next_height = max(height, math.ceil(total / next_width))

        while next_width * next_height < total:
            current_ratio = next_width / next_height
            if current_ratio <= aspect_ratio:
                next_width += 1
            else:
                next_height += 1

        return next_width, next_height

    def _build_graph(self) -> nx.Graph:
        cfg = self.config.environment.config
        kind = cfg.get("kind", "erdos_renyi")
        params = cfg.get("params", {})
        n = sum(self.config.initialization.agent_counts.values())
        gseed = derive_seed(self.kernel_seed, GRAPH_SALT)
        if kind == "erdos_renyi":
            if "p" not in params:
                raise BuildError("erdos_renyi 网络缺少参数 params.p（连边概率）")
            return nx.erdos_renyi_graph(n=n, p=float(params["p"]), seed=gseed)
        if kind == "barabasi_albert":
            if "m" not in params:
                raise BuildError("barabasi_albert 网络缺少参数 params.m（每条新边连接数）")
            return nx.barabasi_albert_graph(n=n, m=int(params["m"]), seed=gseed)
        if kind == "watts_strogatz":
            if "k" not in params or "p" not in params:
                raise BuildError("watts_strogatz 网络缺少参数 params.k / params.p")
            return nx.watts_strogatz_graph(
                n=n, k=int(params["k"]), p=float(params["p"]), seed=gseed
            )
        if kind == "complete":
            return nx.complete_graph(n)
        raise BuildError(f"未知网络类型 network.kind={kind!r}")

    def _build_agents(self) -> None:
        node_iter = iter(self.graph.nodes()) if self._env_type == "network" else None
        cell_iter = iter(self._shuffled_cells()) if self._env_type == "grid" else None
        created_index = 0
        for agent_type in self.config.agents:
            count = self.config.initialization.agent_counts.get(agent_type.id, 0)
            defaults = {sv.name: sv.default for sv in agent_type.state_variables}
            for _ in range(count):
                agent = KernelAgent(self, agent_type.id, defaults)
                display_index = created_index
                if node_iter is not None:
                    node = next(node_iter)
                    self.grid.place_agent(agent, node)
                    if isinstance(node, int):
                        display_index = node
                elif cell_iter is not None:
                    cell = next(cell_iter)
                    self.grid.place_agent(agent, cell)
                    display_index = int(cell[1]) * int(self.grid.width) + int(cell[0])
                self._agent_display_index[int(agent.unique_id)] = display_index
                created_index += 1

    def _shuffled_cells(self) -> list[tuple[int, int]]:
        """Deterministic shuffled cell list for grid placement (P1: uses model.random)."""
        cells = [(x, y) for x in range(self.grid.width) for y in range(self.grid.height)]
        self.random.shuffle(cells)
        return cells

    # ---- runtime helpers -------------------------------------------------

    def neighbors(self, agent: KernelAgent) -> list[KernelAgent]:
        """Return neighboring agents per the environment topology."""
        if self._env_type == "network":
            return list(self.grid.get_neighbors(agent.pos, include_center=False))
        if self._env_type == "grid":
            return list(
                self.grid.get_neighbors(agent.pos, moore=self._grid_moore, include_center=False)
            )
        return []

    def move_to_empty(self, agent: KernelAgent) -> bool:
        """Move an agent to a deterministically chosen empty grid cell (P1).

        Returns True if moved, False if the grid is full. No-op for non-grid envs.
        """
        if self._env_type != "grid":
            return False
        empties = sorted(self.grid.empties)
        if not empties:
            return False
        new_pos = self.random.choice(empties)
        self.grid.move_agent(agent, new_pos)
        return True

    def change_state(self, agent: KernelAgent, key: str, value: Any) -> None:
        """Mutate an agent state field and record the delta into the trace.

        When called from within a mechanism, also record a grounded `mechanism_fired`
        attributing this state change to that mechanism (P2: mechanism graph ↔ Trace).
        The record carries the state transition (key/old/new) so macro metric deltas
        can be decomposed into signed per-mechanism flows without agent-level trace.
        """
        old = agent.state.get(key)
        agent.state[key] = value
        if self.trace is not None:
            self.trace.agent_delta(
                self.steps, agent.unique_id, agent.agent_type_id, {key: [old, value]}
            )
            if self._active_mechanism is not None:
                self.trace.mechanism_fired(
                    self.steps,
                    self._active_mechanism,
                    agent_ids=[agent.unique_id],
                    agent_type=agent.agent_type_id,
                    key=key,
                    old=old,
                    new=value,
                )

    def run_agent_step(self, agent: KernelAgent) -> None:
        """Run the agent-level step mechanisms referenced by the agent's type."""
        agent_type = self._agent_types[agent.agent_type_id]
        for mechanism_id in agent_type.behavior_refs:
            spec = self.behavior.mechanisms.get(mechanism_id)
            if spec is None:
                raise MechanismError(
                    f"AgentType {agent.agent_type_id!r} 引用了未注册机制 {mechanism_id!r}"
                )
            if spec.phase == "step" and spec.level == "agent":
                self._active_mechanism = mechanism_id
                try:
                    spec.fn(agent, self)
                finally:
                    self._active_mechanism = None

    # ---- lifecycle -------------------------------------------------------

    def setup(self) -> None:
        """Run init mechanisms once, then record the tick-0 observation."""
        for spec in self._init_mechanisms:
            self._active_mechanism = spec.id
            try:
                if spec.level == "model":
                    spec.fn(self)
                else:
                    for agent in list(self.agents):
                        spec.fn(agent, self)
            finally:
                self._active_mechanism = None
        self._apply_agent_overrides()
        self.observe(0)

    def _apply_agent_overrides(self) -> None:
        overrides = self.config.initialization.agent_overrides
        if not overrides:
            return
        state_keys_by_type = {
            agent_type.id: {state_variable.name for state_variable in agent_type.state_variables}
            for agent_type in self.config.agents
        }
        for agent in self.agents:
            display_index = self._agent_display_index.get(int(agent.unique_id))
            if display_index is None:
                continue
            patch = overrides.get(display_index)
            if not patch:
                continue
            allowed = state_keys_by_type.get(agent.agent_type_id, set())
            for key, value in patch.items():
                if key in allowed:
                    self.change_state(agent, key, value)

    def _apply_interventions(self, tick: int) -> None:
        """Merge any scheduled parameter changes for this tick before it runs."""
        patch = self._interventions_by_tick.get(tick)
        if not patch:
            return
        self.params.update(patch)
        if self.trace is not None:
            self.trace.event(tick, "intervention_applied", changed=dict(patch))

    def step(self) -> None:
        """One tick: model-level step mechanisms, agent steps, then observe."""
        tick = self.steps
        self._apply_interventions(tick)
        for spec in self._model_step_mechanisms:
            self._active_mechanism = spec.id
            try:
                spec.fn(self)
            finally:
                self._active_mechanism = None
        self.agents.shuffle_do("step")
        self.observe(tick)

    def observe(self, tick: int) -> None:
        """Compute and record the configured metrics for this tick."""
        metrics: dict[str, float] = {}
        for observer_id in self.collect_metrics:
            fn = self.behavior.observers.get(observer_id)
            if fn is None:
                raise MechanismError(f"Observer {observer_id!r} 未在 behavior 中注册")
            metrics[observer_id] = fn(self)
        self.history.append({"tick": tick, **metrics})
        if self.trace is not None:
            self.trace.tick_metrics(tick, metrics)
