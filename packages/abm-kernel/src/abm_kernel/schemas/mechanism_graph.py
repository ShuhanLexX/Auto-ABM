"""MechanismGraph contract — see docs/architecture/data-contracts.md §16.

A causal-path graph deterministically derived from a ModelConfig (P2-1). Edges only
connect *real* references found in the config (structural links and literal text
references); the kernel never invents causal links (constitution P2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from abm_kernel.schemas.model_config import KernelBaseModel
from abm_kernel.util import now_iso

MECHANISM_GRAPH_SCHEMA_VERSION = "1"

NodeKind = Literal["agent_type", "state_variable", "mechanism", "parameter", "observer"]
EdgeKind = Literal["structural", "reference"]
EdgeRelation = Literal["has_state", "runs", "controls", "writes", "observed"]


class GraphNode(KernelBaseModel):
    id: str  # e.g. "agent:person" / "state:person.state" / "mechanism:spread"
    kind: NodeKind
    label: str
    ref_id: str  # source id in ModelConfig (mechanism.id / parameter.id / ...)
    description: str = ""


class GraphEdge(KernelBaseModel):
    source: str  # GraphNode.id
    target: str  # GraphNode.id
    kind: EdgeKind  # structural = hard config ref; reference = literal text mention
    relation: EdgeRelation


class MechanismGraph(KernelBaseModel):
    schema_version: str = MECHANISM_GRAPH_SCHEMA_VERSION
    model_id: str
    model_version: str
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    generated_at: str = Field(default_factory=now_iso)


class MechanismGraphView(KernelBaseModel):
    """Front-end edit overlay — never mutates the derived topology / ModelConfig."""

    label_overrides: dict[str, str] = Field(default_factory=dict)
    description_overrides: dict[str, str] = Field(default_factory=dict)
    hidden: list[str] = Field(default_factory=list)


__all__ = [
    "MECHANISM_GRAPH_SCHEMA_VERSION",
    "GraphEdge",
    "GraphNode",
    "MechanismGraph",
    "MechanismGraphView",
]
