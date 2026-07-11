"""build_mechanism_graph — derive a MechanismGraph from a ModelConfig (P2-1).

Deterministic and grounded: every edge corresponds to a *real* reference in the
config — a structural link (an agent's `behavior_refs` / owned state variables) or a
literal text reference (a parameter id / state value mentioned in a mechanism's
trigger/effect text). The kernel never invents causal links (constitution P2).
"""

from __future__ import annotations

import re

from abm_kernel.schemas import ModelConfig
from abm_kernel.schemas.mechanism_graph import GraphEdge, GraphNode, MechanismGraph

# Minimum token length for literal-reference matching (avoids single-char noise
# like a categorical choice "a"/"b"). Parameter/observer ids are matched as-is.
_MIN_TOKEN = 2


def _mentions(text: str, token: str) -> bool:
    """True if `token` appears in `text` not glued to other ASCII word chars.

    Chinese characters count as separators, so "beta" matches in "以 beta 概率" but
    not inside "betatron"; this keeps latin-id matching precise in mixed-language text.
    """
    if not token:
        return False
    pattern = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(token)}(?![A-Za-z0-9_])")
    return bool(pattern.search(text))


def _agent_node_id(agent_id: str) -> str:
    return f"agent:{agent_id}"


def _state_node_id(agent_id: str, state_name: str) -> str:
    return f"state:{agent_id}.{state_name}"


def _mechanism_node_id(mechanism_id: str) -> str:
    return f"mechanism:{mechanism_id}"


def _param_node_id(param_id: str) -> str:
    return f"param:{param_id}"


def _observer_node_id(observer_id: str) -> str:
    return f"observer:{observer_id}"


def build_mechanism_graph(config: ModelConfig) -> MechanismGraph:
    """Derive the causal-path graph for a model (deterministic; data-contracts §16)."""
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    # ---- nodes (stable order: agents → their states → mechanisms → params → observers)
    for agent in config.agents:
        nodes.append(
            GraphNode(
                id=_agent_node_id(agent.id),
                kind="agent_type",
                label=agent.name,
                ref_id=agent.id,
                description=agent.description,
            )
        )
        for sv in agent.state_variables:
            nodes.append(
                GraphNode(
                    id=_state_node_id(agent.id, sv.name),
                    kind="state_variable",
                    label=sv.name,
                    ref_id=f"{agent.id}.{sv.name}",
                    description=sv.description,
                )
            )
    for mech in config.mechanisms:
        nodes.append(
            GraphNode(
                id=_mechanism_node_id(mech.id),
                kind="mechanism",
                label=mech.name,
                ref_id=mech.id,
                description=mech.description or mech.effect,
            )
        )
    for param in config.parameters:
        nodes.append(
            GraphNode(
                id=_param_node_id(param.id),
                kind="parameter",
                label=param.name,
                ref_id=param.id,
                description=param.description,
            )
        )
    for obs in config.observers:
        nodes.append(
            GraphNode(
                id=_observer_node_id(obs.id),
                kind="observer",
                label=obs.name,
                ref_id=obs.id,
                description=obs.description,
            )
        )

    mechanism_ids = {m.id for m in config.mechanisms}

    # ---- structural edges: agent -> state (has_state); agent -> mechanism (runs)
    for agent in config.agents:
        for sv in agent.state_variables:
            edges.append(
                GraphEdge(
                    source=_agent_node_id(agent.id),
                    target=_state_node_id(agent.id, sv.name),
                    kind="structural",
                    relation="has_state",
                )
            )
        for ref in agent.behavior_refs:
            if ref in mechanism_ids:
                edges.append(
                    GraphEdge(
                        source=_agent_node_id(agent.id),
                        target=_mechanism_node_id(ref),
                        kind="structural",
                        relation="runs",
                    )
                )

    # ---- reference edges from mechanism trigger/effect/description text
    for mech in config.mechanisms:
        text = " ".join(filter(None, [mech.trigger, mech.effect, mech.description]))
        # parameter -> mechanism (controls)
        for param in config.parameters:
            if _mentions(text, param.id):
                edges.append(
                    GraphEdge(
                        source=_param_node_id(param.id),
                        target=_mechanism_node_id(mech.id),
                        kind="reference",
                        relation="controls",
                    )
                )
        # mechanism -> state (writes): state var name or one of its (len>=2) choices
        for agent in config.agents:
            for sv in agent.state_variables:
                tokens = [sv.name, *[c for c in (sv.choices or []) if len(c) >= _MIN_TOKEN]]
                if any(_mentions(text, tok) for tok in tokens):
                    edges.append(
                        GraphEdge(
                            source=_mechanism_node_id(mech.id),
                            target=_state_node_id(agent.id, sv.name),
                            kind="reference",
                            relation="writes",
                        )
                    )

    # ---- observed edges: state -> observer when an observer id/name matches the
    # state variable name or one of its (len>=2) choices.
    for agent in config.agents:
        for sv in agent.state_variables:
            obs_tokens = {sv.name, *[c for c in (sv.choices or []) if len(c) >= _MIN_TOKEN]}
            for obs in config.observers:
                if obs.id in obs_tokens or obs.name in obs_tokens:
                    edges.append(
                        GraphEdge(
                            source=_state_node_id(agent.id, sv.name),
                            target=_observer_node_id(obs.id),
                            kind="reference",
                            relation="observed",
                        )
                    )

    return MechanismGraph(
        model_id=config.id,
        model_version=config.version,
        nodes=nodes,
        edges=edges,
    )


__all__ = ["build_mechanism_graph"]
