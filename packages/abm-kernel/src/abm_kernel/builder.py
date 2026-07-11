"""build_model — construct a KernelModel from a ModelConfig (data-contracts.md §6)."""

from __future__ import annotations

from typing import Any

from abm_kernel.base import KernelModel
from abm_kernel.behavior import ModelBehavior, get_behavior, registered_behaviors
from abm_kernel.errors import BuildError
from abm_kernel.schemas import ModelConfig


def _match_behavior_by_structure(config: ModelConfig) -> ModelBehavior | None:
    """Resolve a behavior for a config whose id is not registered.

    Adopting a proposal gives the model a fresh id (so it is tracked separately
    from its base template) but only tweaks parameters/description — the runtime
    mechanisms and observers are still the template's. Match the registered
    behavior that *covers* every mechanism and observer id the config declares;
    a genuinely novel config (no covering behavior) still resolves to None so the
    caller raises a clear BuildError instead of running the wrong code.
    """
    mechanism_ids = {mechanism.id for mechanism in config.mechanisms}
    observer_ids = {observer.id for observer in config.observers}
    if not mechanism_ids and not observer_ids:
        return None
    best: ModelBehavior | None = None
    best_extra: int | None = None
    for behavior in registered_behaviors().values():
        provided_mechanisms = set(behavior.mechanisms)
        provided_observers = set(behavior.observers)
        if mechanism_ids <= provided_mechanisms and observer_ids <= provided_observers:
            # Prefer the most specific behavior (fewest ids beyond what's declared)
            # so a template with an exactly matching surface wins over a superset.
            extra = len(provided_mechanisms - mechanism_ids) + len(provided_observers - observer_ids)
            if best_extra is None or extra < best_extra:
                best, best_extra = behavior, extra
    return best


def build_model(
    config: ModelConfig,
    seed: int,
    params: dict[str, Any] | None = None,
    behavior: ModelBehavior | None = None,
    interventions: list[dict[str, Any]] | None = None,
) -> KernelModel:
    """Build a runnable model instance.

    `behavior` may be passed explicitly (preferred for tests / AI-generated code);
    otherwise it is resolved from the behavior registry by `config.id`, falling
    back to a structural match for adopted/duplicated configs (fresh id, same
    template structure). `interventions` schedule deterministic parameter changes
    at fixed ticks.
    """
    resolved = behavior or get_behavior(config.id) or _match_behavior_by_structure(config)
    if resolved is None:
        raise BuildError(
            f"未找到模型 {config.id!r} 的 behavior；请显式传入或先 register_behavior()"
        )
    return KernelModel(config, resolved, seed, params, interventions)
