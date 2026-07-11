# AutoABM

<p align="center">
  <img src="docs/images/app-icon.png" alt="AutoABM" width="200">
</p>

<div align="center">

**AI-native ABM research workbench**

[![中文](https://img.shields.io/badge/🇨🇳_中文-Available-blue)](README.md)
[![Release](https://img.shields.io/github/v/release/ShuhanLexX/Auto-ABM)](https://github.com/ShuhanLexX/Auto-ABM/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

AutoABM is a desktop **Agent-Based Modeling (ABM)** workbench for social science and complex systems research. Simulations, runs, traces, and ODD docs are first-class objects; large language models help with modeling, experiments, and evidence-grounded explanation.

Download the latest Windows installer from [Releases](https://github.com/ShuhanLexX/Auto-ABM/releases).

---

## Highlights

- **Simulation workbench**: Interface controls, spatial/network canvas, metric charts, Trace timeline
- **Research / conversation modes**: edit and run in research mode; read-only explanation in conversation mode
- **Evidence-grounded explain**: interval and mechanism attribution must cite real Trace data
- **Experiments & reproducibility**: parameter sweeps, interventions, exportable reproduction packages (incl. ODD)
- **Local kernel**: Python Mesa sidecar for deterministic, seed-reproducible runs
- **Desktop app**: Electron workbench, ready to install

---

## Quick start

### Install (recommended)

1. Open [Releases](https://github.com/ShuhanLexX/Auto-ABM/releases)
2. Download `AutoABM-*-win-x64.exe`
3. Install and launch AutoABM

### Develop from source

```bash
bun install
cp .env.example .env

SERVER_PORT=3456 bun run src/server/index.ts

cd desktop && bun install && bun run dev
```

See [env vars](docs/guide/env-vars.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Stack

| Area | Tech |
|------|------|
| Languages | TypeScript / Python |
| Desktop | Electron + React + Vite |
| Simulation | Mesa (`packages/abm-kernel`) |
| Runtime | [Bun](https://bun.sh) |
| State | Zustand |

---

## Layout

| Path | Role |
|------|------|
| `desktop/` | Electron + React workbench |
| `src/server/abm/` | ABM API, Run / Trace, persistence |
| `packages/abm-kernel/` | Python Mesa kernel |
| `src/` | Local runtime and agent capabilities |
| `docs/` | Product and engineering docs |
| `release-notes/` | Release notes |

Product requirements: [`core-requirements.md`](./core-requirements.md).

---

## License

MIT License © [ShuhanLexX](https://github.com/ShuhanLexX) — see [LICENSE](LICENSE).
