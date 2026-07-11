"""Display state helpers shared by JSON and binary space snapshots.

The simulation canvas needs a stable, small palette. Categorical states already
provide that; continuous states need deterministic bins so changing float values
do not disappear from later frames.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from abm_kernel.base import KernelAgent
    from abm_kernel.schemas import AgentType, ModelConfig, StateVariable

NUMERIC_BIN_COUNT = 10


def primary_state_variable(agent_type: AgentType) -> StateVariable | None:
    """The state variable used to color an agent."""
    categorical = [sv for sv in agent_type.state_variables if sv.dtype == "categorical"]
    if categorical:
        return categorical[0]
    if agent_type.state_variables:
        return agent_type.state_variables[0]
    return None


def primary_state_field(agent_type: AgentType) -> str | None:
    state_var = primary_state_variable(agent_type)
    return None if state_var is None else state_var.name


def state_variables_by_agent_type(config: ModelConfig) -> dict[str, StateVariable | None]:
    return {agent_type.id: primary_state_variable(agent_type) for agent_type in config.agents}


def agent_state_label(agent: KernelAgent, state_var: StateVariable | None) -> str | None:
    if state_var is None:
        return None
    value = agent.state.get(state_var.name)
    if value is None:
        return None
    if state_var.dtype in ("float", "int"):
        numeric = _to_float(value)
        if numeric is not None:
            return numeric_bin_label_for_value(state_var, numeric)
    if state_var.dtype == "bool" and isinstance(value, bool):
        return "True" if value else "False"
    return str(value)


def build_state_palette(config: ModelConfig, extra_states: set[str | None] | None = None) -> list[str]:
    values: set[str] = set()
    for agent_type in config.agents:
        state_var = primary_state_variable(agent_type)
        if state_var is None:
            continue
        values.update(palette_values_for_state_var(state_var))
    if extra_states:
        values.update(str(state) for state in extra_states if state is not None)
    return sorted(values)


def palette_values_for_state_var(state_var: StateVariable) -> list[str]:
    if state_var.choices:
        return [str(choice) for choice in state_var.choices]
    if state_var.dtype == "bool":
        return ["False", "True"]
    if state_var.dtype in ("float", "int"):
        return [numeric_bin_label(state_var, i) for i in range(NUMERIC_BIN_COUNT)]
    return []


def numeric_bin_label_for_value(state_var: StateVariable, value: float) -> str:
    lo, hi = _numeric_range(state_var)
    if not math.isfinite(value):
        value = lo
    if hi <= lo:
        return _format_numeric_bin(state_var.name, lo, hi)
    clipped = min(max(value, lo), hi)
    ratio = (clipped - lo) / (hi - lo)
    index = min(NUMERIC_BIN_COUNT - 1, max(0, int(ratio * NUMERIC_BIN_COUNT)))
    return numeric_bin_label(state_var, index)


def numeric_bin_label(state_var: StateVariable, index: int) -> str:
    lo, hi = _numeric_range(state_var)
    if hi <= lo:
        return _format_numeric_bin(state_var.name, lo, hi)
    width = (hi - lo) / NUMERIC_BIN_COUNT
    start = lo + width * index
    end = hi if index >= NUMERIC_BIN_COUNT - 1 else start + width
    return _format_numeric_bin(state_var.name, start, end)


def _numeric_range(state_var: StateVariable) -> tuple[float, float]:
    if state_var.value_range is not None:
        lo, hi = state_var.value_range
        if math.isfinite(lo) and math.isfinite(hi):
            return (float(lo), float(hi))

    default = _to_float(state_var.default)
    if default is None:
        return (0.0, 1.0)
    if 0.0 <= default <= 1.0:
        return (0.0, 1.0)
    span = max(1.0, abs(default))
    return (default - span, default + span)


def _format_numeric_bin(name: str, start: float, end: float) -> str:
    span = abs(end - start)
    precision = 3 if span < 0.01 else 2 if span < 2 else 1 if span < 20 else 0
    return f"{name}: {start:.{precision}f}-{end:.{precision}f}"


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = [
    "NUMERIC_BIN_COUNT",
    "agent_state_label",
    "build_state_palette",
    "numeric_bin_label",
    "numeric_bin_label_for_value",
    "palette_values_for_state_var",
    "primary_state_field",
    "primary_state_variable",
    "state_variables_by_agent_type",
]
