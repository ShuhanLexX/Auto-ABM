# Figure Generation Notes

The paper now uses two image-model figures for the main method illustrations and
matplotlib-generated figures for the experiment design/results views.

## Image-model figures

Generated with the built-in Codex `image_gen` tool and copied into
`papers/rest/figures/`:

- `fig-method-framework-ai.png`: academic conference figure for the Auto-ABM method architecture. Prompt focus: a central versioned simulation object, six research roles, deterministic Mesa kernel, trace ledger, and downstream research outputs.
- `fig-mechanism-atlas-ai.png`: mechanism atlas and trace-grounded explanation figure. Prompt focus: trace window, mechanism graph, attribution links, checked explanation, and evidence-check gate.

Source outputs remain under:

```text
C:\Users\Administrator\.codex\generated_images\019f4c5e-7e8e-7353-a25e-a6ec334209fa\
```

## Script-generated figures

Run from `papers/rest/`:

```bash
python generate_figures.py
```

The script writes the following files under `papers/rest/figures/`:

- `fig-eval-protocol.png`: appendix protocol figure covering task families, required artifacts, workflows, score dimensions, and the five-point judging procedure.
- `fig-eval-dashboard.png`: main-text draft-results dashboard generated from `draft_results.csv`.

Older script-generated method figures are retained for comparison but are no
longer referenced by `main.tex`:

- `fig-method-framework.png`
- `fig-explain-pipeline.png`

The experimental values are placeholders for layout and paper-shaping only.
Regenerate `fig-eval-dashboard.png` after controlled evaluation data replace
`draft_results.csv`.
