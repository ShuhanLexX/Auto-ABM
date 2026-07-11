"""Kernel exception hierarchy.

Coding standard: errors are explicit and carry context — never swallow (no empty except).
"""

from __future__ import annotations


class KernelError(Exception):
    """Base class for all abm-kernel errors."""


class ConfigError(KernelError):
    """A ModelConfig / ExperimentConfig is structurally invalid."""


class BuildError(KernelError):
    """A model cannot be built from its config + behavior."""


class MechanismError(KernelError):
    """A referenced mechanism / observer cannot be resolved or raised while running."""


class TraceError(KernelError):
    """Trace writing / serialization failed."""
