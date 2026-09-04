# Auto-ABM Product Demo Script

**Format:** 1080p desktop walkthrough with English narration and on-screen captions
**Duration:** about 2:33
**Purpose:** show how Auto-ABM connects a research question, a runnable simulation, trace-grounded evidence, and reproducible experimentation.

## Storyboard

| Time | Product moment | On-screen message |
| --- | --- | --- |
| 0:00–0:04 | White product card with matched narration and subtitle. | Auto-ABM is an AI-native workbench for agent-based modeling. |
| 0:04–0:11 | White workflow card with matched narration and subtitle. | It keeps questions, simulations, evidence, and experiments in one connected workflow. |
| 0:11–0:31 | Start from a platform-rumor question in plain language. | Turn a research question into runnable simulation options. |
| 0:31–0:56 | Compare proposed mechanisms, adopt one, and open the simulation workbench. | The simulation, not a code repository, is the core research object. |
| 0:56–1:21 | Run the network model and inspect its curves, agents, and trace-backed attribution. | Every explanation is linked to real run evidence. |
| 1:21–1:51 | Configure intervention timing and robustness experiments with multiple seeds. | Explore parameters and compare runs without leaving the workbench. |
| 1:51–2:21 | Reuse the workflow in a wildfire case and inspect the resulting simulation. | The same research loop works across agent-based modeling domains. |
| 2:21–2:27 | Show autonomous exploration, where candidate mechanisms are evaluated against real runs. | Search, test, and report findings that remain linked to run records. |
| 2:27–2:33 | Product close. | Auto-ABM — From question to simulation. From evidence to discovery. |

## Closing slate

```text
Auto-ABM
From question to simulation. From evidence to discovery.
github.com/ShuhanLexX/Auto-ABM
```

## Rendering

Run `bun run render:product-demo` from this directory. The script composes the subtitle-matched introductory narration with the venue-free opening, walkthrough footage, and product close, then writes the website asset to `docs/public/launch/v2/autoabm-product-demo.mp4`.
