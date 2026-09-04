# Auto-ABM Product Demo Script

**Format:** 1080p desktop walkthrough with English narration and on-screen captions
**Duration:** about 2:33
**Purpose:** show how Auto-ABM connects a research question, a runnable simulation, trace-grounded evidence, and reproducible experimentation.

## Storyboard

| Time | Product moment | On-screen message |
| --- | --- | --- |
| 0:00–0:04 | White product card with matched narration and subtitle. | Auto-ABM is an AI-native workbench for agent-based modeling. |
| 0:04–0:11 | White workflow card with matched narration and subtitle. | It keeps questions, simulations, evidence, and experiments in one connected workflow. |
| 0:11–0:19 | Open the case library: four curated ABM examples are shown, then opened in one shared workbench. | The case library ships curated ABM examples, ready to import. Each case opens in the same workbench with one click. |
| 0:19–0:39 | Start from a platform-rumor question in plain language. | Turn a research question into runnable simulation options. |
| 0:39–1:04 | Compare proposed mechanisms, adopt one, and open the simulation workbench. | The simulation, not a code repository, is the core research object. |
| 1:04–1:29 | Run the network model and inspect its curves, agents, and trace-backed attribution. | Every explanation is linked to real run evidence. |
| 1:29–1:59 | Configure intervention timing and robustness experiments with multiple seeds. | Explore parameters and compare runs without leaving the workbench. |
| 1:59–2:21 | Reuse the workflow in a wildfire case and inspect the resulting simulation. | The same research loop works across agent-based modeling domains. |
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
