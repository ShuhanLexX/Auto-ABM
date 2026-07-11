"""Behavior resolution for adopted/duplicated configs.

Adopting a proposal gives the model a fresh `config.id` (tracked separately from
its base template) while keeping the template's mechanism/observer structure. The
kernel registers behaviors by the template id, so `build_model` must fall back to
a structural match — otherwise an adopted model fails with
"未找到模型 ... 的 behavior" even though its runtime is a known template.
"""

from __future__ import annotations

import pytest

from abm_kernel import build_model, simulate
from abm_kernel.errors import BuildError
from abm_kernel.models import sir_model_config


def test_adopted_config_resolves_template_behavior_by_structure() -> None:
    adopted = sir_model_config(population=80).model_copy(
        update={"id": "sir_rumor_seir_debunk_mixing"}
    )

    model = build_model(adopted, seed=42)  # id unregistered -> structural fallback
    model.setup()
    for _ in range(5):
        model.step()

    row = model.history[0]
    assert row["susceptible"] + row["infected"] + row["recovered"] == 80


def test_adopted_config_runs_end_to_end(tmp_path) -> None:
    adopted = sir_model_config(population=60).model_copy(update={"id": "adopted_sir_variant"})

    record = simulate(adopted, seed=3, steps=10, output_dir=tmp_path)

    assert record.status == "completed"
    assert record.model_id == "adopted_sir_variant"


def test_novel_mechanisms_without_a_behavior_still_fail() -> None:
    base = sir_model_config()
    novel = base.model_copy(
        update={
            "id": "totally_novel_model",
            "mechanisms": [m.model_copy(update={"id": f"novel_{m.id}"}) for m in base.mechanisms],
            "observers": [o.model_copy(update={"id": f"novel_{o.id}"}) for o in base.observers],
        }
    )

    with pytest.raises(BuildError):
        build_model(novel, seed=1)
