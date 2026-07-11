"""Raw result CSV writing and metric summarization (no pandas — kernel stays light)."""

from __future__ import annotations

import csv
from pathlib import Path


def write_results_csv(
    history: list[dict[str, float]], path: str | Path, metric_ids: list[str]
) -> None:
    """Write the per-tick metric time series as a CSV (tick + one column per metric)."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["tick", *metric_ids])
        for row in history:
            writer.writerow([row.get("tick"), *[row.get(m, "") for m in metric_ids]])


def summarize_metrics(
    history: list[dict[str, float]], metric_ids: list[str]
) -> dict[str, dict[str, float]]:
    """Compute {metric: {final, max, min, mean}} over the run history."""
    summary: dict[str, dict[str, float]] = {}
    for metric in metric_ids:
        values = [float(row[metric]) for row in history if metric in row]
        if values:
            summary[metric] = {
                "final": values[-1],
                "max": max(values),
                "min": min(values),
                "mean": sum(values) / len(values),
            }
    return summary
