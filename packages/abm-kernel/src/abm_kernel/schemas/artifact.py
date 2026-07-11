"""Artifact & ReproManifest contracts — see docs/architecture/data-contracts.md §5."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from abm_kernel.schemas.model_config import KernelBaseModel
from abm_kernel.util import now_iso


class Artifact(KernelBaseModel):
    id: str
    kind: Literal["figure", "odd", "report", "mechanism_graph", "csv", "json", "repro_package"]
    path: str
    source_run_ids: list[str] = Field(default_factory=list)  # 可追溯到哪些 Run (P1/P2)
    created_at: str = Field(default_factory=now_iso)


class ReproManifest(KernelBaseModel):
    schema_version: str
    project_id: str
    auto_abm_version: str
    kernel_version: str
    created_at: str = Field(default_factory=now_iso)
    includes: list[str] = Field(default_factory=list)  # 打包的相对路径
    checksums: dict[str, str] = Field(default_factory=dict)  # 路径 -> 哈希


__all__ = ["Artifact", "ReproManifest"]
