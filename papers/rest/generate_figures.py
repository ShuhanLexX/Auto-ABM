from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Rectangle


ROOT = Path(__file__).resolve().parent
FIG_DIR = ROOT / "figures"

BLUE = "#1f5fbf"
TEAL = "#0f766e"
ORANGE = "#c95f00"
GREEN = "#2f855a"
GRAY = "#4b5563"
LIGHT = "#f8fafc"
BORDER = "#1f2937"


def setup_ax(width: float, height: float):
  fig, ax = plt.subplots(figsize=(width, height), dpi=220)
  ax.set_xlim(0, 1)
  ax.set_ylim(0, 1)
  ax.axis("off")
  fig.patch.set_facecolor("white")
  ax.set_facecolor("white")
  return fig, ax


def box(ax, x, y, w, h, title, body=None, color=BLUE, fill="#ffffff", lw=1.4, fs=9):
  patch = FancyBboxPatch(
    (x, y),
    w,
    h,
    boxstyle="round,pad=0.008,rounding_size=0.012",
    linewidth=lw,
    edgecolor=color,
    facecolor=fill,
  )
  ax.add_patch(patch)
  ax.text(
    x + w / 2,
    y + h - 0.022,
    title,
    ha="center",
    va="top",
    fontsize=fs,
    fontweight="bold",
    color=color,
  )
  if body:
    ax.text(
      x + 0.018,
      y + h - 0.058,
      body,
      ha="left",
      va="top",
      fontsize=fs - 1.4,
      color=BORDER,
      linespacing=1.16,
    )
  return patch


def arrow(ax, start, end, color=GRAY, lw=1.2, style="-|>", rad=0):
  ax.add_patch(
    FancyArrowPatch(
      start,
      end,
      arrowstyle=style,
      mutation_scale=10,
      linewidth=lw,
      color=color,
      connectionstyle=f"arc3,rad={rad}",
    )
  )


def label(ax, x, y, text, color=GRAY, fs=8, weight="normal", ha="center"):
  ax.text(x, y, text, color=color, fontsize=fs, fontweight=weight, ha=ha, va="center")


def draw_method_framework():
  fig, ax = setup_ax(15, 8.4)
  label(ax, 0.02, 0.965, "A. Role-mediated simulation workflow", BORDER, 11, "bold", "left")

  roles = [
    ("Hypothesis\nagent", "mechanism\nfamilies", BLUE),
    ("Modeling\nagent", "formal\nspec", TEAL),
    ("Execution\nagent", "seeded\nruns", GREEN),
    ("Evidence\nagent", "trace\nanalytics", ORANGE),
    ("Experiment\nagent", "sweeps and\ninterventions", BLUE),
    ("Documentation\nagent", "ODD and\nexport", TEAL),
  ]
  x0 = 0.055
  for i, (title, body, color) in enumerate(roles):
    x = x0 + i * 0.145
    box(ax, x, 0.80, 0.118, 0.115, title, body, color=color, fill="#fbfdff", fs=8.4)
    if i < len(roles) - 1:
      arrow(ax, (x + 0.118, 0.855), (x + 0.145, 0.855), color="#64748b", lw=0.9)

  box(
    ax,
    0.045,
    0.56,
    0.15,
    0.15,
    "Research intent",
    "phenomenon\nconstraints\nquestion type",
    color=BLUE,
    fill="#f8fbff",
  )
  box(
    ax,
    0.255,
    0.47,
    0.27,
    0.28,
    "Versioned simulation object",
    "model assumptions\nagent types and states\nparameters and seeds\nODD description\nruns, experiments, exports",
    color=TEAL,
    fill="#f7fffd",
    fs=9.2,
  )
  box(
    ax,
    0.585,
    0.54,
    0.13,
    0.18,
    "Mesa kernel",
    "deterministic\nexecution\nbatch runs",
    color=GREEN,
    fill="#f8fff9",
  )
  box(
    ax,
    0.765,
    0.43,
    0.18,
    0.34,
    "Trace ledger",
    "run metadata\nmetric series\nevents\nmechanism firings\nspatial snapshots\ntermination state",
    color=ORANGE,
    fill="#fffaf5",
    fs=9.2,
  )

  arrow(ax, (0.195, 0.635), (0.255, 0.635), color=BLUE, lw=1.5)
  arrow(ax, (0.525, 0.61), (0.585, 0.63), color=TEAL, lw=1.5)
  arrow(ax, (0.715, 0.63), (0.765, 0.61), color=GREEN, lw=1.5)
  arrow(ax, (0.390, 0.80), (0.390, 0.75), color="#64748b", lw=1.0)
  arrow(ax, (0.680, 0.80), (0.660, 0.72), color="#64748b", lw=1.0)
  arrow(ax, (0.830, 0.80), (0.850, 0.77), color="#64748b", lw=1.0)

  consumers = [
    (0.07, 0.19, "Mechanism atlas", "schema-derived graph\nstates, mechanisms,\nobservables", TEAL),
    (0.30, 0.19, "Trace-grounded\nexplanation", "evidence packet\ncitation audit\nnarrative", BLUE),
    (0.53, 0.19, "Experiment\nworkspace", "sweeps\ninterventions\nresolved charts", ORANGE),
    (0.76, 0.19, "Reproducible\nexport", "specification\nODD, runs, seeds\nmanifest", GREEN),
  ]
  for x, y, title, body, color in consumers:
    box(ax, x, y, 0.18, 0.16, title, body, color=color, fill="#ffffff", fs=8.8)
    arrow(ax, (0.855, 0.43), (x + 0.09, y + 0.16), color=color, lw=1.0, rad=0.08)

  box(
    ax,
    0.07,
    0.055,
    0.86,
    0.075,
    "Integrity boundary",
    "specification validation  |  human approval for structural changes  |  evidence citations  |  provenance manifest",
    color=BORDER,
    fill=LIGHT,
    lw=1.1,
    fs=8.8,
  )
  fig.savefig(FIG_DIR / "fig-method-framework.png", bbox_inches="tight", pad_inches=0.05)
  plt.close(fig)


def draw_explain_pipeline():
  fig, ax = setup_ax(8.3, 5.5)
  label(ax, 0.03, 0.955, "B. Trace-grounded explanation", BORDER, 10.5, "bold", "left")

  box(ax, 0.035, 0.41, 0.18, 0.30, "Trace interval", "ticks t1..t2\nmetric window\nevents", BLUE, "#f8fbff", fs=8.8)
  for i in range(7):
    x = 0.065 + i * 0.018
    h = [0.05, 0.08, 0.12, 0.17, 0.13, 0.10, 0.07][i]
    ax.add_patch(Rectangle((x, 0.445), 0.010, h, facecolor=BLUE, alpha=0.6, linewidth=0))

  box(
    ax,
    0.28,
    0.62,
    0.38,
    0.24,
    "Deterministic analytics",
    "mechanism activity\nstate-transition attribution\nchangepoints\ncounterfactual deltas",
    ORANGE,
    "#fffaf5",
  )
  box(
    ax,
    0.28,
    0.26,
    0.38,
    0.24,
    "Language narrator",
    "receives only selected evidence\nand aligned ODD passages\nmarks speculation explicitly",
    TEAL,
    "#f7fffd",
  )
  box(ax, 0.72, 0.48, 0.16, 0.22, "Citation audit", "ticks\nvalues\nevents\nmechanisms", BLUE, "#f8fbff", fs=8.8)
  box(ax, 0.77, 0.16, 0.17, 0.20, "Explanation", "text + citations\nsame interval\nsame run", GREEN, "#f8fff9", fs=8.8)

  arrow(ax, (0.215, 0.57), (0.28, 0.72), color=ORANGE, lw=1.4)
  arrow(ax, (0.215, 0.52), (0.28, 0.38), color=TEAL, lw=1.4)
  arrow(ax, (0.66, 0.72), (0.72, 0.61), color=ORANGE, lw=1.2)
  arrow(ax, (0.66, 0.38), (0.72, 0.55), color=TEAL, lw=1.2)
  arrow(ax, (0.80, 0.48), (0.84, 0.36), color=GREEN, lw=1.4)

  label(ax, 0.50, 0.555, "no free-form measurements", GRAY, 7.8)
  label(ax, 0.84, 0.435, "reject or flag unsupported claims", GRAY, 7.4)
  fig.savefig(FIG_DIR / "fig-explain-pipeline.png", bbox_inches="tight", pad_inches=0.05)
  plt.close(fig)


def draw_eval_protocol():
  fig, ax = setup_ax(15, 8.4)
  label(ax, 0.02, 0.965, "C. Evaluation protocol: tasks, artifacts, and scores", BORDER, 11, "bold", "left")

  tasks = [
    ("Schelling", "grid", "segregation"),
    ("SIR spread", "network", "contagion"),
    ("Rumor moderation", "network", "intervention"),
    ("Threshold cascade", "network", "collective action"),
    ("Innovation diffusion", "population", "adoption"),
    ("Bounded opinion", "population", "polarization"),
    ("Public goods", "groups", "cooperation"),
    ("Forest fire", "grid", "spatial spread"),
  ]
  artifacts = ["Model", "Run", "Explain", "Sweep", "Export"]

  ax.text(0.06, 0.86, "Task family", fontsize=8.5, fontweight="bold", color=BORDER, ha="left")
  for j, art in enumerate(artifacts):
    ax.text(0.34 + j * 0.075, 0.86, art, fontsize=8.2, fontweight="bold", color=BORDER, ha="center")
  ax.text(0.76, 0.86, "Space", fontsize=8.5, fontweight="bold", color=BORDER, ha="center")
  ax.text(0.87, 0.86, "Phenomenon", fontsize=8.5, fontweight="bold", color=BORDER, ha="center")

  y0 = 0.79
  for i, (task, space, phenomenon) in enumerate(tasks):
    y = y0 - i * 0.066
    row_color = "#f8fafc" if i % 2 == 0 else "#ffffff"
    ax.add_patch(Rectangle((0.045, y - 0.030), 0.90, 0.056, facecolor=row_color, edgecolor="#e5e7eb", linewidth=0.6))
    ax.text(0.06, y, task, fontsize=8.3, color=BORDER, ha="left", va="center")
    for j in range(len(artifacts)):
      color = [BLUE, GREEN, ORANGE, TEAL, GRAY][j]
      ax.scatter([0.34 + j * 0.075], [y], s=72, color=color, edgecolor="white", linewidth=0.7)
    ax.text(0.76, y, space, fontsize=8.0, color=GRAY, ha="center", va="center")
    ax.text(0.87, y, phenomenon, fontsize=8.0, color=GRAY, ha="center", va="center")

  box(
    ax,
    0.055,
    0.035,
    0.28,
    0.16,
    "Compared workflows",
    "Direct Python prompting\nNetLogo-style generation\nGeneral coding harness\nAuto-ABM",
    BLUE,
    "#f8fbff",
  )
  box(
    ax,
    0.37,
    0.035,
    0.27,
    0.16,
    "Scoring dimensions",
    "executable success\nmodel and phenomenon quality\nevidence grounding\nexperiment design\nreproduction completeness",
    TEAL,
    "#f7fffd",
  )
  box(
    ax,
    0.68,
    0.035,
    0.25,
    0.16,
    "Scoring procedure",
    "five-point rubrics\nLLM-judge ensemble\ntrace verification\nartifact checklist",
    ORANGE,
    "#fffaf5",
  )
  fig.savefig(FIG_DIR / "fig-eval-protocol.png", bbox_inches="tight", pad_inches=0.05)
  plt.close(fig)


def draw_eval_dashboard():
  data = pd.read_csv(ROOT / "draft_results.csv")

  colors = {
    "Direct Python prompting": "#6b7280",
    "NetLogo generation": "#4b5563",
    "General coding harness": "#2563eb",
    "Auto-ABM": TEAL,
  }

  fig, axes = plt.subplots(3, 1, figsize=(6.2, 8.2), dpi=240)
  fig.patch.set_facecolor("white")

  metrics = [
    ("executability_1_to_5", "Exec."),
    ("model_quality_1_to_5", "Model"),
    ("mechanism_validity_1_to_5", "Mechanism"),
    ("evidence_grounding_1_to_5", "Evidence"),
    ("experiment_quality_1_to_5", "Experiment"),
    ("reproducibility_1_to_5", "Repro."),
  ]
  x = range(len(metrics))
  width = 0.16
  for idx, row in data.iterrows():
    offset = (idx - 1.5) * width
    vals = [row[m[0]] for m in metrics]
    axes[0].bar([p + offset for p in x], vals, width=width, color=colors[row["workflow"]], label=row["workflow"])
  axes[0].set_xticks(list(x))
  axes[0].set_xticklabels([m[1] for m in metrics], fontsize=8)
  axes[0].set_ylim(1, 5)
  axes[0].set_ylabel("Mean score (1-5)")
  axes[0].set_title("Scored research dimensions", fontsize=10.5, fontweight="bold")
  axes[0].grid(axis="y", alpha=0.25)

  order = data.sort_values("overall_1_to_5", ascending=True)
  y = range(len(order))
  axes[1].barh(y, order["overall_1_to_5"], color=[colors[w] for w in order["workflow"]], alpha=0.95)
  axes[1].set_yticks(list(y))
  axes[1].set_yticklabels(
    [w.replace(" prompting", "").replace("General coding ", "") for w in order["workflow"]],
    fontsize=8,
  )
  axes[1].set_xlim(1, 5)
  axes[1].set_xlabel("Overall mean score (1-5)")
  axes[1].set_title("Overall score by workflow", fontsize=10.5, fontweight="bold")
  for i, (_, row) in enumerate(order.iterrows()):
    axes[1].text(row["overall_1_to_5"] + 0.05, i, f"{row['overall_1_to_5']:.2f}", fontsize=7.4, va="center", color=GRAY)
  axes[1].grid(axis="x", alpha=0.25)

  for _, row in data.iterrows():
    axes[2].scatter(
      row["evidence_grounding_1_to_5"],
      row["reproducibility_1_to_5"],
      s=row["overall_1_to_5"] * 85,
      color=colors[row["workflow"]],
      edgecolor="white",
      linewidth=0.8,
      alpha=0.95,
    )
    short = row["workflow"].replace(" prompting", "").replace("General coding ", "")
    axes[2].text(row["evidence_grounding_1_to_5"] + 0.04, row["reproducibility_1_to_5"], short, fontsize=7.8, va="center")
  axes[2].set_xlim(2.0, 4.9)
  axes[2].set_ylim(1.8, 4.9)
  axes[2].set_xlabel("Evidence grounding score")
  axes[2].set_ylabel("Reproduction score")
  axes[2].set_title("Evidence and reproducibility", fontsize=10.5, fontweight="bold")
  axes[2].grid(alpha=0.25)

  handles, labels_ = axes[0].get_legend_handles_labels()
  fig.legend(handles, labels_, loc="lower center", ncol=2, frameon=False, fontsize=8)
  fig.tight_layout(rect=(0, 0.10, 1, 1))
  fig.savefig(FIG_DIR / "fig-eval-dashboard.png", bbox_inches="tight", pad_inches=0.05)
  plt.close(fig)


def main():
  FIG_DIR.mkdir(parents=True, exist_ok=True)
  draw_method_framework()
  draw_explain_pipeline()
  draw_eval_protocol()
  draw_eval_dashboard()


if __name__ == "__main__":
  main()
