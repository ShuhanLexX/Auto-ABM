"""RunPlan contract — one concrete run in an expanded experiment (F2).

An ExperimentConfig expands into N RunPlans (sweep combinations × replications);
each plan binds the exact parameters + seed used, so every run stays reproducible
and traceable back to its parameter combination (P1).
"""

from __future__ import annotations

from typing import Any

from abm_kernel.schemas.model_config import KernelBaseModel


class RunPlan(KernelBaseModel):
    run_id: str
    parameters: dict[str, Any]  # full effective params (fixed + this sweep combo)
    seed: int  # base_seed + replication_index
    replication_index: int
    combo_label: str  # human-readable combo key, e.g. "beta=0.1,gamma=0.05" or "baseline"


__all__ = ["RunPlan"]
