"""F1: built-in template models (grid SIR, Schelling) + template registry."""

from __future__ import annotations

from abm_kernel import build_model, simulate
from abm_kernel.models import (
    diffusion_model_config,
    opinion_model_config,
    public_goods_model_config,
    schelling_model_config,
    sir_model_config,
    social_influence_model_config,
    wildfire_model_config,
)
from abm_kernel.templates import (
    get_model_template,
    list_experiment_templates,
    list_model_templates,
)


def _history(cfg, seed: int, steps: int, params: dict | None = None):
    model = build_model(cfg, seed=seed, params=params)
    model.setup()
    for _ in range(steps):
        model.step()
    return model.history


# ---- grid environment + SIR ---------------------------------------------


def test_sir_grid_builds_and_places_agents() -> None:
    cfg = sir_model_config(width=10, height=10, population=60)
    model = build_model(cfg, seed=1)
    assert len(model.agents) == 60
    # every agent is placed on a distinct grid cell
    positions = {a.pos for a in model.agents}
    assert len(positions) == 60


def test_sir_grid_auto_expands_when_population_exceeds_capacity() -> None:
    cfg = sir_model_config(width=25, height=25, population=1000)
    model = build_model(cfg, seed=1)
    assert len(model.agents) == 1000
    assert model.grid.width * model.grid.height >= 1000
    positions = {a.pos for a in model.agents}
    assert len(positions) == 1000


def test_sir_grid_runs_and_is_deterministic() -> None:
    cfg = sir_model_config(width=12, height=12, population=80)
    assert _history(cfg, seed=5, steps=20) == _history(cfg, seed=5, steps=20)


def test_sir_grid_state_conserved() -> None:
    cfg = sir_model_config(width=12, height=12, population=80)
    history = _history(cfg, seed=5, steps=15)
    for row in history:
        assert row["susceptible"] + row["infected"] + row["recovered"] == 80


def test_sir_grid_epidemic_spreads() -> None:
    cfg = sir_model_config(width=15, height=15, population=180)
    history = _history(cfg, seed=3, steps=40)
    peak_infected = max(row["infected"] for row in history)
    # starts with default 5 infected; a spreading epidemic should exceed that
    assert peak_infected > 5


# ---- wildfire grid -------------------------------------------------------


def test_wildfire_grid_runs_and_is_deterministic() -> None:
    cfg = wildfire_model_config(width=25, height=25)
    assert _history(cfg, seed=11, steps=30) == _history(cfg, seed=11, steps=30)


def test_wildfire_grid_state_conserved() -> None:
    cfg = wildfire_model_config(width=20, height=20)
    history = _history(cfg, seed=4, steps=20)
    for row in history:
        assert row["tree"] + row["rock"] + row["burning"] + row["burned"] + row["empty"] == 400


def test_wildfire_starts_from_single_ignition_with_tree_and_rock_terrain() -> None:
    cfg = wildfire_model_config(width=30, height=30)
    model = build_model(
        cfg,
        seed=4,
        params={
            "fuel_density": 0.7,
            "rock_density": 0.1,
            "ignition_count": 1,
            "spot_fire_probability": 0.0,
        },
    )
    model.setup()
    states = [agent.state["state"] for agent in model.agents]
    assert states.count("burning") == 1
    assert states.count("tree") > 0
    assert states.count("rock") > 0


def test_wildfire_multi_point_ignition_is_spatially_dispersed() -> None:
    cfg = wildfire_model_config(width=30, height=30)
    model = build_model(
        cfg,
        seed=4,
        params={
            "fuel_density": 0.8,
            "rock_density": 0.05,
            "ignition_count": 5,
            "spot_fire_probability": 0.0,
        },
    )
    model.setup()
    burning_positions = [
        agent.pos
        for agent in model.agents
        if agent.state.get("state") == "burning" and agent.pos is not None
    ]
    assert len(burning_positions) == 5
    max_distance = max(
        abs(a[0] - b[0]) + abs(a[1] - b[1])
        for a in burning_positions
        for b in burning_positions
    )
    assert max_distance >= 20


def test_wildfire_spreads_and_burns_fuel() -> None:
    cfg = wildfire_model_config(width=30, height=30)
    history = _history(
        cfg,
        seed=2,
        steps=50,
        params={"fuel_density": 0.82, "spread_probability": 0.65, "wind_bias": 0.2},
    )
    assert max(row["burning"] for row in history) > history[0]["burning"]
    assert history[-1]["burned"] > history[0]["burned"]


# ---- Schelling + move_to_empty ------------------------------------------


def test_schelling_builds_with_empty_cells() -> None:
    cfg = schelling_model_config(width=10, height=10, population=80)
    model = build_model(cfg, seed=2)
    assert len(model.agents) == 80
    assert len(model.grid.empties) == 100 - 80


def test_schelling_runs_and_is_deterministic() -> None:
    cfg = schelling_model_config(width=12, height=12, population=100)
    assert _history(cfg, seed=8, steps=20) == _history(cfg, seed=8, steps=20)


def test_schelling_segregation_increases() -> None:
    cfg = schelling_model_config(width=20, height=20, population=300)
    history = _history(cfg, seed=4, steps=30)
    # segregation (mean same-group neighbor fraction) should rise from start to end
    assert history[-1]["segregation"] >= history[0]["segregation"]


def test_schelling_simulate_writes_outputs(tmp_path) -> None:
    cfg = schelling_model_config(width=12, height=12, population=100)
    record = simulate(cfg, seed=6, steps=15, output_dir=tmp_path)
    assert record.status == "completed"
    assert set(record.metrics_summary) == {"segregation", "unhappy"}


# ---- P2-16 opinion dynamics ---------------------------------------------


def test_opinion_runs_and_is_deterministic() -> None:
    cfg = opinion_model_config(population=80, network_p=0.08)
    assert _history(cfg, seed=7, steps=20) == _history(cfg, seed=7, steps=20)


def test_opinion_high_confidence_drives_consensus() -> None:
    cfg = opinion_model_config(population=120, network_p=0.1)
    history = _history(cfg, seed=3, steps=60, params={"confidence_threshold": 1.0})
    # With full confidence everyone influences everyone → variance collapses.
    assert history[-1]["opinion_variance"] < history[0]["opinion_variance"]


def test_agent_overrides_apply_before_initial_observation() -> None:
    cfg = opinion_model_config(population=12, network_p=0.2)
    cfg.initialization.agent_overrides = {0: {"opinion": 0.99}}
    model = build_model(cfg, seed=4)
    model.setup()

    target = next(
        agent
        for agent in model.agents
        if model._agent_display_index[int(agent.unique_id)] == 0
    )
    assert target.state["opinion"] == 0.99


# ---- P2-16 innovation diffusion -----------------------------------------


def test_diffusion_runs_and_is_deterministic() -> None:
    cfg = diffusion_model_config(population=100)
    assert _history(cfg, seed=2, steps=25) == _history(cfg, seed=2, steps=25)


def test_diffusion_is_monotonic_and_spreads() -> None:
    cfg = diffusion_model_config(population=150)
    history = _history(cfg, seed=5, steps=40)
    adopters = [row["adopters"] for row in history]
    assert all(b >= a for a, b in zip(adopters, adopters[1:], strict=False))  # monotonic
    assert adopters[-1] > adopters[0]  # diffusion happened


# ---- P2-16 public goods game --------------------------------------------


def test_public_goods_runs_and_is_deterministic() -> None:
    cfg = public_goods_model_config(population=120)
    assert _history(cfg, seed=9, steps=20) == _history(cfg, seed=9, steps=20)


def test_public_goods_cooperation_rate_bounded() -> None:
    cfg = public_goods_model_config(population=120)
    history = _history(cfg, seed=4, steps=20)
    for row in history:
        assert 0.0 <= row["cooperation_rate"] <= 1.0


# ---- P2-16 social influence threshold -----------------------------------


def test_social_influence_runs_and_is_deterministic() -> None:
    cfg = social_influence_model_config(population=100)
    assert _history(cfg, seed=6, steps=20) == _history(cfg, seed=6, steps=20)


def test_social_influence_is_monotonic() -> None:
    cfg = social_influence_model_config(population=150)
    history = _history(cfg, seed=1, steps=30, params={"mean_threshold": 0.15})
    active = [row["active"] for row in history]
    assert all(b >= a for a, b in zip(active, active[1:], strict=False))  # cascades only grow
    assert active[-1] >= active[0]


# ---- template registry ---------------------------------------------------


def test_model_template_registry_has_three() -> None:
    templates = list_model_templates()
    ids = {t.id for t in templates}
    assert {"reference_rumor", "template_sir_grid", "template_schelling"} <= ids


def test_model_template_registry_has_phase2_models() -> None:
    ids = {t.id for t in list_model_templates()}
    assert {
        "template_opinion_dynamics",
        "template_innovation_diffusion",
        "template_public_goods",
        "template_social_influence",
        "template_wildfire_grid",
    } <= ids


def test_all_model_templates_build_and_run() -> None:
    for template in list_model_templates():
        cfg = template.build()
        history = _history(cfg, seed=1, steps=4)
        assert len(history) == 5  # tick 0..4


def test_model_template_build_is_runnable() -> None:
    template = get_model_template("template_sir_grid")
    assert template is not None
    cfg = template.build()
    record_history = _history(cfg, seed=1, steps=5)
    assert len(record_history) == 6  # tick 0..5


def test_experiment_templates_present() -> None:
    ids = {t.id for t in list_experiment_templates()}
    assert {"param_sensitivity", "intervention_compare", "seed_robustness"} <= ids


def test_experiment_template_builds_design_from_model() -> None:
    cfg = sir_model_config()
    sweep_tpl = get_model_template("template_sir_grid")
    assert sweep_tpl is not None
    from abm_kernel.templates import get_experiment_template

    sensitivity = get_experiment_template("param_sensitivity")
    assert sensitivity is not None
    design = sensitivity.build_design(cfg)
    assert design.type == "single_sweep"
    assert len(design.sweep) == 1
    assert len(design.sweep[0].values) >= 2
