"""P2-1: MechanismGraph derivation — deterministic, grounded in real config refs."""

from __future__ import annotations

from abm_kernel import build_mechanism_graph
from abm_kernel.models import rumor_model_config, schelling_model_config


def _edge_set(graph: object) -> set[tuple[str, str, str]]:
    return {(e.source, e.target, e.relation) for e in graph.edges}  # type: ignore[attr-defined]


def test_graph_is_deterministic() -> None:
    # Topology (nodes + edges, incl. order) is deterministic; generated_at is a timestamp.
    cfg = rumor_model_config()
    g1 = build_mechanism_graph(cfg)
    g2 = build_mechanism_graph(cfg)
    assert g1.model_dump(exclude={"generated_at"}) == g2.model_dump(exclude={"generated_at"})


def test_rumor_nodes_cover_all_config_objects() -> None:
    cfg = rumor_model_config()
    graph = build_mechanism_graph(cfg)
    by_kind: dict[str, int] = {}
    for node in graph.nodes:
        by_kind[node.kind] = by_kind.get(node.kind, 0) + 1
    assert by_kind["agent_type"] == len(cfg.agents)
    assert by_kind["mechanism"] == len(cfg.mechanisms)
    assert by_kind["parameter"] == len(cfg.parameters)
    assert by_kind["observer"] == len(cfg.observers)
    assert by_kind["state_variable"] == sum(len(a.state_variables) for a in cfg.agents)


def test_rumor_key_edges_present() -> None:
    graph = build_mechanism_graph(rumor_model_config())
    edges = _edge_set(graph)
    # structural: person owns its state, runs the agent-level mechanisms
    assert ("agent:person", "state:person.state", "has_state") in edges
    assert ("agent:person", "mechanism:spread", "runs") in edges
    assert ("agent:person", "mechanism:recover", "runs") in edges
    # reference: beta controls spread (literal "beta" in spread effect)
    assert ("param:beta", "mechanism:spread", "controls") in edges
    assert ("param:gamma", "mechanism:recover", "controls") in edges
    assert ("param:debunk_rate", "mechanism:intervention", "controls") in edges
    # writes: spread effect mentions the state value "susceptible"
    assert ("mechanism:spread", "state:person.state", "writes") in edges
    # observed: the state's choices match observer ids
    assert ("state:person.state", "observer:infected", "observed") in edges


def test_no_false_edges_for_unrelated_param() -> None:
    graph = build_mechanism_graph(rumor_model_config())
    edges = _edge_set(graph)
    # initial_infected only drives the seed mechanism, never spread.
    assert ("param:initial_infected", "mechanism:spread", "controls") not in edges
    assert ("param:initial_infected", "mechanism:seed_infection", "controls") in edges


def test_schelling_graph_avoids_single_char_choice_noise() -> None:
    # group choices are "a"/"b" (len 1) → must NOT create writes/observed edges.
    graph = build_mechanism_graph(schelling_model_config())
    edges = _edge_set(graph)
    assert ("agent:resident", "mechanism:relocate", "runs") in edges
    assert ("param:tolerance", "mechanism:relocate", "controls") in edges
    assert not any(rel == "observed" for _, _, rel in edges)
