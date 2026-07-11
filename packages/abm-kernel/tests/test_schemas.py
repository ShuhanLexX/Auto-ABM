"""A1: data-contract schemas — validation, clear errors, JSON round-trip."""

from __future__ import annotations

import pytest

from abm_kernel.errors import ConfigError
from abm_kernel.schemas import (
    AgentType,
    Environment,
    ExperimentConfig,
    ExperimentDesign,
    Initialization,
    Mechanism,
    ModelConfig,
    Observer,
    Parameter,
    StateVariable,
    SweepAxis,
    parse_experiment_config,
    parse_model_config,
)


def _valid_model_config() -> ModelConfig:
    return ModelConfig(
        id="rumor_min",
        name="Minimal Rumor",
        version="1.0.0",
        agents=[
            AgentType(
                id="person",
                name="Person",
                state_variables=[
                    StateVariable(
                        name="state",
                        dtype="categorical",
                        default="susceptible",
                        choices=["susceptible", "infected", "recovered"],
                    )
                ],
                behavior_refs=["spread"],
            )
        ],
        environment=Environment(
            type="network", config={"kind": "erdos_renyi", "params": {"n": 50, "p": 0.1}}
        ),
        mechanisms=[Mechanism(id="spread", name="Spread")],
        parameters=[
            Parameter(id="beta", name="Beta", dtype="float", default=0.1, min=0.0, max=1.0)
        ],
        observers=[Observer(id="infected", name="Infected", dtype="int")],
        initialization=Initialization(agent_counts={"person": 50}),
    )


def test_model_config_json_roundtrip() -> None:
    cfg = _valid_model_config()
    restored = ModelConfig.model_validate_json(cfg.model_dump_json())
    assert restored == cfg
    assert restored.kernel_version == cfg.kernel_version
    assert restored.schema_version == "1"


def test_invalid_snake_case_id_rejected() -> None:
    with pytest.raises(ValueError):
        AgentType(id="Person", name="Person")


def test_unknown_field_forbidden() -> None:
    data = _valid_model_config().model_dump()
    data["totally_unknown"] = 1
    with pytest.raises(ConfigError):
        parse_model_config(data)


def test_behavior_ref_must_resolve() -> None:
    data = _valid_model_config().model_dump()
    data["agents"][0]["behavior_refs"] = ["does_not_exist"]
    with pytest.raises(ConfigError):
        parse_model_config(data)


def test_agent_counts_key_must_be_known_agent() -> None:
    data = _valid_model_config().model_dump()
    data["initialization"]["agent_counts"] = {"ghost": 10}
    with pytest.raises(ConfigError):
        parse_model_config(data)


def test_duplicate_mechanism_id_rejected() -> None:
    data = _valid_model_config().model_dump()
    data["mechanisms"].append({"id": "spread", "name": "Spread again"})
    with pytest.raises(ConfigError):
        parse_model_config(data)


def test_experiment_config_roundtrip_and_axis_rules() -> None:
    exp = ExperimentConfig(
        id="exp1",
        name="Beta sweep",
        model_id="rumor_min",
        model_version="1.0.0",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[SweepAxis(parameter_id="beta", values=[0.1, 0.2, 0.3])],
        ),
        replications=3,
        base_seed=42,
        steps=100,
        collect_metrics=["infected"],
    )
    assert exp == ExperimentConfig.model_validate_json(exp.model_dump_json())


def test_single_sweep_requires_exactly_one_axis() -> None:
    with pytest.raises(ConfigError):
        parse_experiment_config(
            {
                "id": "exp_bad",
                "name": "bad",
                "model_id": "m",
                "model_version": "1",
                "design": {"type": "single_sweep", "sweep": []},
                "base_seed": 1,
                "steps": 10,
                "collect_metrics": ["infected"],
            }
        )
