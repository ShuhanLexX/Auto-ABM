# Auto-ABM Product Demo Script

**Format:** 1080p desktop walkthrough with English narration and on-screen captions
**Duration:** about 2:32
**Purpose:** show how Auto-ABM connects a research question, a runnable simulation, trace-grounded evidence, and reproducible experimentation.

## Storyboard

| Time | Product moment | On-screen message |
| --- | --- | --- |
| 0:00–0:05 | Introduce Auto-ABM as a simulation-first workbench with the original product narration. | A simulation-first workbench for agent-based modeling. |
| 0:05–0:10 | Show the connected product loop: Question → Simulation → Run → Trace → Experiment → Reproduce. | Make models runnable. Keep conclusions linked to evidence. |
| 0:10–0:30 | Start from a platform-rumor question in plain language. | Turn a research question into runnable simulation options. |
| 0:30–0:55 | Compare proposed mechanisms, adopt one, and open the simulation workbench. | The simulation, not a code repository, is the core research object. |
| 0:55–1:20 | Run the network model and inspect its curves, agents, and trace-backed attribution. | Every explanation is linked to real run evidence. |
| 1:20–1:50 | Configure intervention timing and robustness experiments with multiple seeds. | Explore parameters and compare runs without leaving the workbench. |
| 1:50–2:20 | Reuse the workflow in a wildfire case and inspect the resulting simulation. | The same research loop works across agent-based modeling domains. |
| 2:20–2:26 | Show autonomous exploration, where candidate mechanisms are evaluated against real runs. | Search, test, and report findings that remain linked to run records. |
| 2:26–2:32 | Product close. | Auto-ABM — From question to simulation. From evidence to discovery. |

## Closing slate

```text
Auto-ABM
From question to simulation. From evidence to discovery.
github.com/ShuhanLexX/Auto-ABM
```

## Rendering

Run `bun run render:product-demo` from this directory. The script composes the original product narration with the venue-free opening, walkthrough footage, and product close, then writes the website asset to `docs/public/launch/v2/autoabm-product-demo.mp4`.
