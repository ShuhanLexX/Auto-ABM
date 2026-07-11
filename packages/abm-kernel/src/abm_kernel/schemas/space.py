"""SpaceSnapshot contract — see docs/architecture/data-contracts.md §10.

A derived, display-only snapshot of the model's spatial state at one tick (the data
behind the NetLogo-style simulation canvas, P2-5). It does NOT take part in
reproducibility judgement (that is parameters + seed + model version, P1).

M2.1 implements `network` and `grid`; `continuous`/`heatmap` fields are reserved.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from abm_kernel.schemas.model_config import KernelBaseModel

SpaceKind = Literal["grid", "network", "continuous", "heatmap"]


class SpaceSnapshot(KernelBaseModel):
    space: SpaceKind
    tick: int
    # network: {"nodes":[{"id","state"}], "edges":[[a,b],...]}
    # grid:    {"width","height","cells":[{"x","y","state"}]}  (occupied cells only)
    payload: dict[str, Any] = Field(default_factory=dict)
    sample_rate: int = 1  # one frame per N ticks (downsampling recorded in run_meta)
    agent_cap: int | None = None  # large-scale cap (sampled; recorded in run_meta)


__all__ = ["SpaceKind", "SpaceSnapshot"]
