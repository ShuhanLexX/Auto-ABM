# Auto-ABM Product Demo Script

**Format:** 1080p desktop walkthrough with English narration and on-screen captions
**Duration:** about 2:46
**Purpose:** show how Auto-ABM connects a research question, a runnable simulation, trace-grounded evidence, and reproducible experimentation.

## Storyboard

| Time | Product moment | On-screen message |
| --- | --- | --- |
| 0:00–0:08 | Introduce Auto-ABM as a simulation-first workbench. | From a research question to a reproducible study. |
| 0:08–0:16 | Show the connected product loop: Question → Simulation → Run → Trace → Experiment → Reproduce. | Make models runnable. Keep conclusions linked to evidence. |
| 0:16–0:24 | Explain the three connected product objects. | A versioned Simulation, evidence-bearing Runs + Traces, and contextual Experiments. |
| 0:24–0:45 | Start from a platform-rumor question in plain language. | Turn a research question into runnable simulation options. |
| 0:45–1:10 | Compare proposed mechanisms, adopt one, and open the simulation workbench. | The simulation, not a code repository, is the core research object. |
| 1:10–1:35 | Run the network model and inspect its curves, agents, and trace-backed attribution. | Every explanation is linked to real run evidence. |
| 1:35–2:05 | Configure intervention timing and robustness experiments with multiple seeds. | Explore parameters and compare runs without leaving the workbench. |
| 2:05–2:35 | Reuse the workflow in a wildfire case and inspect the resulting simulation. | The same research loop works across agent-based modeling domains. |
| 2:35–2:40 | Show autonomous exploration, where candidate mechanisms are evaluated against real runs. | Search, test, and report findings that remain linked to run records. |
| 2:40–2:46 | Product close. | Auto-ABM — From question to simulation. From evidence to discovery. |

## Closing slate

```text
Auto-ABM
From question to simulation. From evidence to discovery.
github.com/ShuhanLexX/Auto-ABM
```

## Rendering

Run `bun run render:product-demo` from this directory. The script composes the product opening, venue-free walkthrough footage, and product close, then writes the website asset to `docs/public/launch/v2/autoabm-product-demo.mp4`.
