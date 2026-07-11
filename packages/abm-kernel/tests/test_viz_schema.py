"""P2-4: VizSpec schema — whitelist + binding validation; AI never emits data (P2)."""

from __future__ import annotations

import pytest

from abm_kernel import ConfigError, VizSpec, missing_fields, parse_viz_spec


def _spec_dict(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "v1",
        "chart": "line",
        "title": "感染随时间",
        "data_ref": {"source": "run", "id": "run-123"},
        "encodings": [
            {"field": "tick", "role": "x"},
            {"field": "infected", "role": "y"},
        ],
    }
    base.update(over)
    return base


def test_valid_spec_parses_and_keeps_bindings() -> None:
    spec = parse_viz_spec(_spec_dict())
    assert spec.chart == "line"
    assert spec.data_ref.source == "run"
    assert [e.field for e in spec.encodings] == ["tick", "infected"]


def test_non_whitelisted_chart_is_rejected() -> None:
    with pytest.raises(ConfigError):
        parse_viz_spec(_spec_dict(chart="sankey"))


def test_empty_encodings_is_rejected() -> None:
    with pytest.raises(ConfigError):
        parse_viz_spec(_spec_dict(encodings=[]))


def test_missing_data_ref_id_is_rejected() -> None:
    with pytest.raises(ConfigError):
        parse_viz_spec(_spec_dict(data_ref={"source": "run", "id": ""}))


def test_unknown_data_ref_source_is_rejected() -> None:
    with pytest.raises(ConfigError):
        parse_viz_spec(_spec_dict(data_ref={"source": "database", "id": "x"}))


def test_missing_fields_flags_bindings_absent_from_real_columns() -> None:
    spec = parse_viz_spec(_spec_dict())
    # `infected` is not a real column → flagged; the backend rejects such specs (P2).
    assert missing_fields(spec, ["tick", "susceptible"]) == ["infected"]
    assert missing_fields(spec, ["tick", "infected"]) == []


def test_roundtrip_is_deterministic() -> None:
    spec = VizSpec.model_validate(_spec_dict())
    again = VizSpec.model_validate(spec.model_dump())
    assert again.model_dump() == spec.model_dump()
