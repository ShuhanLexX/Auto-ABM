"""ModelBehavior — the runtime implementation a model author supplies.

A ModelConfig is declarative; the matching behavior provides the callables:
  - mechanisms: agent/model-level functions, run at init or each step
  - observers:  functions computing a metric value from the model state

The reference model registers an in-tree behavior; AI-generated models register
their generated mechanisms here later (constitution P3 — standard kernel contract).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

# Agent-level: fn(agent, model) -> None ; Model-level: fn(model) -> None
MechanismFn = Callable[..., None]
# Observer: fn(model) -> number
ObserverFn = Callable[..., float]

MechanismLevel = Literal["agent", "model"]
MechanismPhase = Literal["init", "step"]


@dataclass(slots=True)
class MechanismSpec:
    """One registered mechanism: its callable plus where/when it runs."""

    id: str
    fn: MechanismFn
    level: MechanismLevel = "agent"
    phase: MechanismPhase = "step"


@dataclass(slots=True)
class ModelBehavior:
    """Bundle of mechanism + observer implementations for one model."""

    mechanisms: dict[str, MechanismSpec] = field(default_factory=dict)
    observers: dict[str, ObserverFn] = field(default_factory=dict)

    def add_mechanism(
        self,
        mechanism_id: str,
        fn: MechanismFn,
        *,
        level: MechanismLevel = "agent",
        phase: MechanismPhase = "step",
    ) -> ModelBehavior:
        """Register a mechanism; returns self for chaining."""
        self.mechanisms[mechanism_id] = MechanismSpec(
            id=mechanism_id, fn=fn, level=level, phase=phase
        )
        return self

    def add_observer(self, observer_id: str, fn: ObserverFn) -> ModelBehavior:
        """Register an observer; returns self for chaining."""
        self.observers[observer_id] = fn
        return self


_BEHAVIORS: dict[str, ModelBehavior] = {}


def register_behavior(model_id: str, behavior: ModelBehavior) -> None:
    """Register a behavior under a ModelConfig.id so build_model can resolve it."""
    _BEHAVIORS[model_id] = behavior


def get_behavior(model_id: str) -> ModelBehavior | None:
    """Return the registered behavior for model_id, or None."""
    return _BEHAVIORS.get(model_id)


def registered_behaviors() -> dict[str, ModelBehavior]:
    """Return a snapshot of the behavior registry (model_id -> behavior).

    Used by the builder to structurally resolve a behavior for a config whose id
    is not itself registered (e.g. an adopted proposal that keeps a template's
    mechanism/observer structure but is given a fresh model id)."""
    return dict(_BEHAVIORS)
