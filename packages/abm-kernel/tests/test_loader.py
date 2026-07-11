"""Tests for loading a ModelBehavior from generated mechanisms.py (ADR-0003 contract)."""

from __future__ import annotations

from pathlib import Path

import pytest

from abm_kernel.builder import build_model
from abm_kernel.errors import BuildError, MechanismError
from abm_kernel.loader import load_behavior_from_file
from abm_kernel.models.rumor import rumor_model_config

# A functional generated file: implements the rumor config's mechanism/observer ids.
GENERATED_OK = """
from abm_kernel.behavior import ModelBehavior


def _seed(model):
    count = int(model.params["initial_infected"])
    agents = list(model.agents)
    for a in model.random.sample(agents, min(count, len(agents))):
        model.change_state(a, "state", "infected")


def _spread(agent, model):
    if agent.state["state"] != "infected":
        return
    beta = float(model.params["beta"])
    for nb in model.neighbors(agent):
        if nb.state["state"] == "susceptible" and model.random.random() < beta:
            model.change_state(nb, "state", "infected")


def _recover(agent, model):
    if agent.state["state"] == "infected" and model.random.random() < float(model.params["gamma"]):
        model.change_state(agent, "state", "recovered")


def _intervention(model):
    return None


def _count(model, value):
    return float(sum(1 for a in model.agents if a.state.get("state") == value))


def build_behavior():
    b = ModelBehavior()
    b.add_mechanism("seed_infection", _seed, level="model", phase="init")
    b.add_mechanism("spread", _spread)
    b.add_mechanism("recover", _recover)
    b.add_mechanism("intervention", _intervention, level="model", phase="step")
    b.add_observer("susceptible", lambda m: _count(m, "susceptible"))
    b.add_observer("infected", lambda m: _count(m, "infected"))
    b.add_observer("recovered", lambda m: _count(m, "recovered"))
    return b
"""


def _write(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def test_load_validates_and_runs(tmp_path: Path) -> None:
    """A valid generated file loads, covers the config, and runs through the kernel."""
    config = rumor_model_config(population=40, network_p=0.1)
    mech_file = _write(tmp_path / "mechanisms.py", GENERATED_OK)

    behavior = load_behavior_from_file(mech_file, config)
    assert set(behavior.mechanisms) >= {m.id for m in config.mechanisms}
    assert set(behavior.observers) >= {o.id for o in config.observers}

    model = build_model(config, seed=7, behavior=behavior)
    model.setup()
    for _ in range(5):
        model.step()

    assert len(model.history) == 6  # tick 0 + 5 steps
    total = sum(config.initialization.agent_counts.values())
    for row in model.history:
        assert row["susceptible"] + row["infected"] + row["recovered"] == total


def test_missing_file_raises(tmp_path: Path) -> None:
    config = rumor_model_config()
    with pytest.raises(BuildError):
        load_behavior_from_file(tmp_path / "nope.py", config)


def test_missing_build_behavior_raises(tmp_path: Path) -> None:
    config = rumor_model_config()
    mech_file = _write(tmp_path / "mechanisms.py", "x = 1\n")
    with pytest.raises(BuildError):
        load_behavior_from_file(mech_file, config)


def test_incomplete_coverage_raises(tmp_path: Path) -> None:
    config = rumor_model_config()
    partial = (
        "from abm_kernel.behavior import ModelBehavior\n\n"
        "def build_behavior():\n"
        "    b = ModelBehavior()\n"
        "    b.add_mechanism('spread', lambda agent, model: None)\n"
        "    return b\n"
    )
    mech_file = _write(tmp_path / "mechanisms.py", partial)
    with pytest.raises(MechanismError):
        load_behavior_from_file(mech_file, config)
