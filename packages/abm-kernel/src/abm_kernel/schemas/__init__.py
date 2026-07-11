"""Auto-ABM data contracts (Pydantic v2) — single source of truth.

Mirror of docs/architecture/data-contracts.md. The backend `schemas/` re-exports
from here so frontend TS types derive from one definition (constitution E4).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from abm_kernel.errors import ConfigError
from abm_kernel.schemas.artifact import Artifact, ReproManifest
from abm_kernel.schemas.experiment import (
    ExperimentConfig,
    ExperimentDesign,
    SweepAxis,
)
from abm_kernel.schemas.mechanism_graph import (
    MECHANISM_GRAPH_SCHEMA_VERSION,
    GraphEdge,
    GraphNode,
    MechanismGraph,
    MechanismGraphView,
)
from abm_kernel.schemas.model_config import (
    SCHEMA_VERSION,
    AgentType,
    Environment,
    Initialization,
    KernelBaseModel,
    Mechanism,
    ModelConfig,
    Observer,
    Parameter,
    StateVariable,
)
from abm_kernel.schemas.phenomenon import (
    MechanismComparisonStudy,
    MechanismHypothesis,
    MetricFit,
    PhenomenonFit,
    PhenomenonMetric,
    TargetPhenomenon,
)
from abm_kernel.schemas.run import Intervention, RunRecord
from abm_kernel.schemas.search_tree import (
    SEARCH_TREE_SCHEMA_VERSION,
    SearchNode,
    SearchNodeKind,
    SearchNodeStatus,
    SearchTree,
)
from abm_kernel.schemas.space import SpaceKind, SpaceSnapshot
from abm_kernel.schemas.viz import (
    VIZ_SPEC_SCHEMA_VERSION,
    VizAgg,
    VizChart,
    VizDataRef,
    VizEncoding,
    VizRole,
    VizSource,
    VizSpec,
    missing_fields,
)


def parse_model_config(data: dict[str, Any]) -> ModelConfig:
    """Validate a raw dict into a ModelConfig, re-raising as ConfigError (clear errors)."""
    try:
        return ModelConfig.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"非法 ModelConfig:\n{exc}") from exc


def load_model_config(path: str | Path) -> ModelConfig:
    """Load and validate a model_config.json from disk."""
    raw = Path(path).read_text(encoding="utf-8")
    try:
        return ModelConfig.model_validate_json(raw)
    except ValidationError as exc:
        raise ConfigError(f"非法 ModelConfig ({path}):\n{exc}") from exc


def parse_experiment_config(data: dict[str, Any]) -> ExperimentConfig:
    """Validate a raw dict into an ExperimentConfig, re-raising as ConfigError."""
    try:
        return ExperimentConfig.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"非法 ExperimentConfig:\n{exc}") from exc


def parse_target_phenomenon(data: dict[str, Any]) -> TargetPhenomenon:
    """Validate a raw dict into a TargetPhenomenon, re-raising as ConfigError."""
    try:
        return TargetPhenomenon.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"非法 TargetPhenomenon:\n{exc}") from exc


def parse_study(data: dict[str, Any]) -> MechanismComparisonStudy:
    """Validate a raw dict into a MechanismComparisonStudy, re-raising as ConfigError."""
    try:
        return MechanismComparisonStudy.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"非法 MechanismComparisonStudy:\n{exc}") from exc


def parse_search_tree(data: dict[str, Any]) -> SearchTree:
    """Validate a raw dict into a SearchTree, re-raising as ConfigError."""
    try:
        return SearchTree.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"非法 SearchTree:\n{exc}") from exc


def parse_viz_spec(data: dict[str, Any]) -> VizSpec:
    """Validate a raw dict into a VizSpec (chart whitelist + bindings) as ConfigError."""
    try:
        return VizSpec.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(f"非法 VizSpec:\n{exc}") from exc


def dump_json(model: KernelBaseModel, path: str | Path) -> None:
    """Serialize a contract model to a JSON file (UTF-8, indented)."""
    payload = json.loads(model.model_dump_json())
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


__all__ = [
    "MECHANISM_GRAPH_SCHEMA_VERSION",
    "SCHEMA_VERSION",
    "AgentType",
    "Artifact",
    "Environment",
    "ExperimentConfig",
    "ExperimentDesign",
    "GraphEdge",
    "GraphNode",
    "Initialization",
    "KernelBaseModel",
    "Mechanism",
    "MechanismComparisonStudy",
    "MechanismGraph",
    "MechanismGraphView",
    "MechanismHypothesis",
    "MetricFit",
    "ModelConfig",
    "Observer",
    "Parameter",
    "PhenomenonFit",
    "PhenomenonMetric",
    "ReproManifest",
    "Intervention",
    "RunRecord",
    "SEARCH_TREE_SCHEMA_VERSION",
    "SearchNode",
    "SearchNodeKind",
    "SearchNodeStatus",
    "SearchTree",
    "SpaceKind",
    "SpaceSnapshot",
    "StateVariable",
    "SweepAxis",
    "TargetPhenomenon",
    "VIZ_SPEC_SCHEMA_VERSION",
    "VizAgg",
    "VizChart",
    "VizDataRef",
    "VizEncoding",
    "VizRole",
    "VizSource",
    "VizSpec",
    "dump_json",
    "load_model_config",
    "missing_fields",
    "parse_experiment_config",
    "parse_model_config",
    "parse_search_tree",
    "parse_study",
    "parse_target_phenomenon",
    "parse_viz_spec",
]
