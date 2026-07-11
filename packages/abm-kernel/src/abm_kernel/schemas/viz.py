"""VizSpec contract — see docs/architecture/data-contracts.md §11 (P2-4).

Generative UI: the AI emits a *declarative* chart spec (chart type + data bindings),
and a single frontend whitelist renderer draws it. The AI never emits data; the
backend resolves real tabular data per `data_ref` (constitution P2). This module
only defines the structure + pure whitelist validation — no IO, no data.
"""

from __future__ import annotations

from typing import Literal
from uuid import uuid4

from pydantic import Field, field_validator

from abm_kernel.schemas.model_config import KernelBaseModel
from abm_kernel.util import now_iso

VIZ_SPEC_SCHEMA_VERSION = "1"

# Controlled whitelist — the renderer draws only these; model scripts are never executed.
VizChart = Literal["line", "bar", "scatter", "box", "histogram", "heatmap", "area", "pie"]
VizRole = Literal["x", "y", "series", "color", "size", "facet"]
VizAgg = Literal["none", "mean", "sum", "count", "min", "max"]
VizSource = Literal["run", "experiment", "trace"]


class VizEncoding(KernelBaseModel):
    """Bind one real data column to a visual role (x/y/series/...)."""

    field: str  # must exist in the real resolved columns (validated by the backend)
    role: VizRole
    agg: VizAgg = "none"

    @field_validator("field")
    @classmethod
    def _field_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("VizEncoding.field 不能为空")
        return v


class VizDataRef(KernelBaseModel):
    """Pointer to real in-system data (never inline data); resolved by the backend."""

    source: VizSource
    id: str
    slice: dict[str, object] | None = None  # optional tick range / filter (resolved server-side)

    @field_validator("id")
    @classmethod
    def _id_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("VizDataRef.id 不能为空")
        return v


class VizSpec(KernelBaseModel):
    """A declarative, whitelist-constrained chart specification (no data, no code)."""

    schema_version: str = VIZ_SPEC_SCHEMA_VERSION
    id: str = Field(default_factory=lambda: uuid4().hex)
    chart: VizChart
    title: str = ""
    caption: str = ""  # references real results only — never fabricated (P2)
    data_ref: VizDataRef
    encodings: list[VizEncoding] = Field(default_factory=list)
    options: dict[str, object] = Field(default_factory=dict)  # controlled style keys; no code
    rationale: str = ""
    created_at: str = Field(default_factory=now_iso)

    @field_validator("encodings")
    @classmethod
    def _encodings_non_empty(cls, v: list[VizEncoding]) -> list[VizEncoding]:
        if not v:
            raise ValueError("VizSpec.encodings 不能为空")
        return v


def missing_fields(spec: VizSpec, columns: list[str]) -> list[str]:
    """Pure check: encoding fields that are absent from the real resolved columns.

    Empty result ⇒ every binding maps to a real column (renderable, honest). The
    backend uses this to reject specs that bind to non-existent data (P2).
    """
    known = set(columns)
    return [e.field for e in spec.encodings if e.field not in known]


__all__ = [
    "VIZ_SPEC_SCHEMA_VERSION",
    "VizAgg",
    "VizChart",
    "VizDataRef",
    "VizEncoding",
    "VizRole",
    "VizSource",
    "VizSpec",
    "missing_fields",
]
