"""F2: ExperimentRunner.expand + run (sweep / grid / replications, retry)."""

from __future__ import annotations

from abm_kernel import ExperimentConfig, ExperimentRunner, expand
from abm_kernel.models import rumor_model_config
from abm_kernel.schemas import ExperimentDesign, SweepAxis


def _sweep_config() -> ExperimentConfig:
    return ExperimentConfig(
        id="exp_sweep",
        name="beta sweep",
        model_id="reference_rumor",
        model_version="1.0.0",
        design=ExperimentDesign(
            type="single_sweep",
            sweep=[SweepAxis(parameter_id="beta", values=[0.05, 0.1, 0.2])],
        ),
        replications=2,
        base_seed=100,
        steps=10,
        collect_metrics=["susceptible", "infected", "recovered"],
        trace_level="off",
    )


def _grid_config() -> ExperimentConfig:
    return ExperimentConfig(
        id="exp_grid",
        name="beta x gamma",
        model_id="reference_rumor",
        model_version="1.0.0",
        design=ExperimentDesign(
            type="grid",
            sweep=[
                SweepAxis(parameter_id="beta", values=[0.05, 0.1]),
                SweepAxis(parameter_id="gamma", values=[0.01, 0.03]),
            ],
        ),
        replications=1,
        base_seed=7,
        steps=8,
        collect_metrics=["infected"],
    )


def test_expand_single_sweep_counts_and_seeds() -> None:
    plans = expand(_sweep_config())
    assert len(plans) == 3 * 2  # 3 values x 2 replications
    seeds = {p.seed for p in plans}
    assert seeds == {100, 101}  # base_seed + replication_index
    # each combo carries its swept value
    betas = {p.parameters["beta"] for p in plans}
    assert betas == {0.05, 0.1, 0.2}


def test_expand_grid_cartesian_product() -> None:
    plans = expand(_grid_config())
    assert len(plans) == 2 * 2 * 1
    combos = {(p.parameters["beta"], p.parameters["gamma"]) for p in plans}
    assert combos == {(0.05, 0.01), (0.05, 0.03), (0.1, 0.01), (0.1, 0.03)}


def test_expand_fixed_design_single_baseline() -> None:
    cfg = ExperimentConfig(
        id="exp_fixed",
        name="robustness",
        model_id="reference_rumor",
        model_version="1.0.0",
        design=ExperimentDesign(type="fixed"),
        replications=4,
        base_seed=0,
        steps=5,
        collect_metrics=["infected"],
    )
    plans = expand(cfg)
    assert len(plans) == 4
    assert {p.combo_label for p in plans} == {"baseline"}
    assert {p.seed for p in plans} == {0, 1, 2, 3}


def test_runner_runs_all_plans(tmp_path) -> None:
    exp = _sweep_config()
    model_cfg = rumor_model_config(population=40)
    progress: list[int] = []
    records = ExperimentRunner().run(
        exp,
        model_cfg,
        tmp_path,
        on_run_done=lambda i, total, plan, rec: progress.append(i),
    )
    assert len(records) == 6
    assert all(r.status == "completed" for r in records)
    assert all(r.experiment_id == "exp_sweep" for r in records)
    assert progress == [0, 1, 2, 3, 4, 5]


def test_runner_records_failure_without_aborting(tmp_path) -> None:
    """A bad parameter combo fails its run but the batch keeps going."""
    exp = ExperimentConfig(
        id="exp_bad",
        name="bad sweep",
        model_id="reference_rumor",
        model_version="1.0.0",
        design=ExperimentDesign(
            type="single_sweep",
            # an out-of-range/garbage value for initial_infected forces a failure path
            sweep=[SweepAxis(parameter_id="initial_infected", values=["not_an_int", 3])],
        ),
        replications=1,
        base_seed=1,
        steps=5,
        collect_metrics=["infected"],
    )
    model_cfg = rumor_model_config(population=30)
    records = ExperimentRunner().run(exp, model_cfg, tmp_path)
    assert len(records) == 2
    statuses = {r.status for r in records}
    assert "failed" in statuses
    assert "completed" in statuses
    failed = next(r for r in records if r.status == "failed")
    assert failed.error is not None


def test_runner_reproducible(tmp_path) -> None:
    exp = _grid_config()
    model_cfg = rumor_model_config(population=40)
    r1 = ExperimentRunner().run(exp, model_cfg, tmp_path / "a")
    r2 = ExperimentRunner().run(exp, model_cfg, tmp_path / "b")
    s1 = [r.metrics_summary for r in r1]
    s2 = [r.metrics_summary for r in r2]
    assert s1 == s2
