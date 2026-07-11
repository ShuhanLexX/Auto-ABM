"""Static validation of AI-generated mechanisms against the runtime API whitelist."""

from __future__ import annotations

import inspect

from abm_kernel import validate_mechanisms_source
from abm_kernel.models import rumor

_PREAMBLE = "from abm_kernel.behavior import ModelBehavior\n\n"


def _wrap(body: str) -> str:
    """Wrap a mechanism body in a build_behavior module shell."""
    return _PREAMBLE + body


def test_reference_model_passes() -> None:
    """The in-tree gold-standard mechanisms must never trip the validator."""
    source = inspect.getsource(rumor)
    assert validate_mechanisms_source(source) == []


def test_clean_generated_sample_passes() -> None:
    source = _wrap(
        "def spread(agent, model):\n"
        "    if agent.state['state'] != 'infected':\n"
        "        return\n"
        "    beta = float(model.params['beta'])\n"
        "    for nb in model.neighbors(agent):\n"
        "        if model.random.random() < beta:\n"
        "            model.change_state(nb, 'state', 'infected')\n"
        "\n"
        "def tick0(model):\n"
        "    if model.steps == 0 and model.trace:\n"
        "        model.trace.event(model.steps, 'start')\n"
        "\n"
        "def infected(model):\n"
        "    return float(sum(1 for a in model.agents if a.state['state'] == 'infected'))\n"
        "\n"
        "def build_behavior():\n"
        "    return ModelBehavior()\n"
    )
    assert validate_mechanisms_source(source) == []


def test_current_step_rejected() -> None:
    """The exact failure the user hit: `model.current_step` does not exist."""
    source = _wrap("def step(agent, model):\n    if model.current_step > 5:\n        pass\n")
    issues = validate_mechanisms_source(source)
    assert any("current_step" in i for i in issues)
    assert any("model.steps" in i for i in issues)


def test_schedule_rejected() -> None:
    source = _wrap("def step(model):\n    n = model.schedule.steps\n")
    assert any("schedule" in i for i in validate_mechanisms_source(source))


def test_agents_call_rejected() -> None:
    source = _wrap("def step(model):\n    for a in model.agents('person'):\n        pass\n")
    assert any("model.agents" in i for i in validate_mechanisms_source(source))


def test_global_random_import_rejected() -> None:
    source = "import random\n" + _wrap("def step(model):\n    random.random()\n")
    assert any("model.random" in i for i in validate_mechanisms_source(source))


def test_from_random_import_rejected() -> None:
    source = "from random import random\n" + _wrap("def step(model):\n    random()\n")
    assert any("model.random" in i for i in validate_mechanisms_source(source))


def test_syntax_error_reported() -> None:
    issues = validate_mechanisms_source("def broken(:\n")
    assert len(issues) == 1
    assert "语法错误" in issues[0]


# ---- undefined-name detection (the run_id=8df226bb class of bug) ---------


def test_undefined_loop_variable_rejected() -> None:
    """Real failure: fn(agent, model) references `a` (should be `agent`) on a late branch.

    Imports cleanly, runs until the intervention branch fires, then NameError. A blocklist
    can't catch this — scope analysis must.
    """
    source = _wrap(
        "def debunk(agent, model):\n"
        "    if model.steps < model.params['start']:\n"
        "        return\n"
        "    if model.trace:\n"
        "        model.trace.event(model.steps, 'd', detail=f'agent {a.unique_id}')\n"
        "\n"
        "def build_behavior():\n"
        "    return ModelBehavior()\n"
    )
    issues = validate_mechanisms_source(source)
    assert any("未定义" in i and "`a`" in i and "第 7 行" in i for i in issues)


def test_closure_name_resolves() -> None:
    """A nested function may read names bound in the enclosing build_behavior scope."""
    source = _wrap(
        "def build_behavior():\n"
        "    threshold = 5\n"
        "    def obs(model):\n"
        "        return float(model.steps > threshold)\n"
        "    b = ModelBehavior()\n"
        "    b.add_observer('s', obs)\n"
        "    return b\n"
    )
    assert validate_mechanisms_source(source) == []


def test_comprehension_target_resolves() -> None:
    """Comprehension loop variables are in scope for the comprehension body (no false flag)."""
    source = _wrap(
        "def obs(model):\n"
        "    return sum(1 for a in model.agents if a.state['s'] == 'i')\n"
        "\n"
        "def build_behavior():\n"
        "    return ModelBehavior()\n"
    )
    assert validate_mechanisms_source(source) == []
