"""P2-10: built-in case-study library is internally consistent and runnable."""

from __future__ import annotations

import pytest

from abm_kernel import build_model
from abm_kernel.cases import get_case, list_cases
from abm_kernel.templates import get_model_template


def test_cases_present() -> None:
    ids = {c.id for c in list_cases()}
    assert len(ids) == len(list_cases())  # ids unique
    assert "case_schelling_tipping" in ids


def test_get_case_unknown_returns_none() -> None:
    assert get_case("nope") is None


@pytest.mark.parametrize("case", list_cases(), ids=lambda c: c.id)
def test_case_design_matches_model_parameters(case) -> None:
    template = get_model_template(case.model_template_id)
    assert template is not None, f"{case.id} 引用了不存在的模型模板"
    config = template.build()
    param_ids = {p.id for p in config.parameters}
    for axis in case.design.sweep:
        assert axis.parameter_id in param_ids, f"{case.id} 扫描了不存在的参数 {axis.parameter_id}"


@pytest.mark.parametrize("case", list_cases(), ids=lambda c: c.id)
def test_case_model_runs(case) -> None:
    template = get_model_template(case.model_template_id)
    assert template is not None
    model = build_model(template.build(), seed=case.base_seed)
    model.setup()
    for _ in range(3):
        model.step()
    assert len(model.history) == 4  # tick 0..3


@pytest.mark.parametrize("case", list_cases(), ids=lambda c: c.id)
def test_case_has_narrative_and_findings(case) -> None:
    assert case.narrative_md.strip()
    assert case.expected_findings
    assert case.steps >= 1
    assert case.replications >= 1
