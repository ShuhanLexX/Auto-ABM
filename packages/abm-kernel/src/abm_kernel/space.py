"""build_space_snapshot — derive a SpaceSnapshot from a live KernelModel (P2-5).

Display-only, deterministic given the model state. Does not consume the RNG and is
not part of reproducibility judgement (P1). Supports network + grid (M2.1); other
space kinds raise so callers fail loudly rather than emitting wrong shapes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from abm_kernel.schemas.space import SpaceSnapshot
from abm_kernel.space_state import agent_state_label, state_variables_by_agent_type

if TYPE_CHECKING:
    from abm_kernel.base import KernelAgent, KernelModel
    from abm_kernel.schemas import StateVariable


def build_space_snapshot(model: KernelModel, *, agent_cap: int | None = None) -> SpaceSnapshot:
    """Build a SpaceSnapshot for the model's current tick (network / grid only)."""
    env_type = model.config.environment.type
    tick = int(model.steps)
    state_vars = state_variables_by_agent_type(model.config)

    if env_type == "network":
        payload = _network_payload(model, state_vars, agent_cap)
        return SpaceSnapshot(space="network", tick=tick, payload=payload, agent_cap=agent_cap)
    if env_type == "grid":
        payload = _grid_payload(model, state_vars, agent_cap)
        return SpaceSnapshot(space="grid", tick=tick, payload=payload, agent_cap=agent_cap)
    raise ValueError(
        f"build_space_snapshot 暂不支持环境类型 {env_type!r}（M2.1 仅 network / grid）"
    )


def _network_payload(
    model: KernelModel, state_vars: dict[str, StateVariable | None], agent_cap: int | None
) -> dict[str, Any]:
    # node id -> primary state (sorted by node id for deterministic frames)
    state_by_node: dict[Any, str | None] = {}
    for agent in model.agents:
        state_by_node[agent.pos] = agent_state_label(agent, state_vars.get(agent.agent_type_id))

    node_ids = sorted(model.graph.nodes())
    if agent_cap is not None and len(node_ids) > agent_cap:
        node_ids = node_ids[:agent_cap]
    included = set(node_ids)

    nodes = [{"id": n, "state": state_by_node.get(n)} for n in node_ids]
    edges = [[a, b] for a, b in model.graph.edges() if a in included and b in included]
    return {"nodes": nodes, "edges": edges}


def _grid_payload(
    model: KernelModel, state_vars: dict[str, StateVariable | None], agent_cap: int | None
) -> dict[str, Any]:
    cells: list[dict[str, Any]] = []
    for agent in model.agents:
        x, y = agent.pos
        cells.append(
            {
                "x": int(x),
                "y": int(y),
                "state": agent_state_label(agent, state_vars.get(agent.agent_type_id)),
            }
        )
    # Deterministic order (row-major) regardless of agent iteration order.
    cells.sort(key=lambda c: (c["x"], c["y"]))
    if agent_cap is not None and len(cells) > agent_cap:
        cells = cells[:agent_cap]
    return {"width": int(model.grid.width), "height": int(model.grid.height), "cells": cells}


__all__ = ["build_space_snapshot"]
