"""Kernel base class smoke tests."""

from abm_kernel import ABMAgent, ABMModel, build_model
from abm_kernel.models import rumor_model_config


class _EchoAgent(ABMAgent):
    pass


class _EchoModel(ABMModel):
    def __init__(self, seed: int = 42) -> None:
        super().__init__(seed=seed)
        self.register_agent(_EchoAgent(self))


def test_model_instantiates_with_seed() -> None:
    model = _EchoModel(seed=7)
    assert model.random is not None
    assert len(model.agents) == 1


def test_deterministic_random_with_same_seed() -> None:
    a = _EchoModel(seed=99)
    b = _EchoModel(seed=99)
    assert a.random.random() == b.random.random()


def test_kernel_agent_id_aliases_unique_id() -> None:
    """Generated model code commonly uses ``agent.id``; it must not crash.

    Regression: a live run failed with "'KernelAgent' object has no attribute
    'id'" because Mesa only exposes ``unique_id``. ``id`` now aliases it.
    """
    model = build_model(rumor_model_config(population=12), seed=42)
    agents = list(model.agents)
    assert agents, "expected agents to be built"
    for agent in agents:
        assert agent.id == agent.unique_id
