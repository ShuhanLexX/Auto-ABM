# AutoABM

<p align="center">
  <img src="docs/images/app-icon.png" alt="AutoABM" width="200">
</p>

<div align="center">

**AI 原生的 ABM 科研工作台**

[![English](https://img.shields.io/badge/🇺🇸_English-Available-green)](README.en.md)
[![Release](https://img.shields.io/github/v/release/ShuhanLexX/Auto-ABM)](https://github.com/ShuhanLexX/Auto-ABM/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

AutoABM 是面向社会科学与复杂系统研究的 **Agent-Based Modeling（ABM）桌面工作台**：以仿真（Simulation）、运行（Run）、轨迹（Trace）与 ODD 为一等对象，结合大模型完成建模、实验与可溯源解释。

下载最新 Windows 安装包： [Releases](https://github.com/ShuhanLexX/Auto-ABM/releases)

---

## 核心能力

- **仿真工作区**：Interface 调参、空间/网络画布、指标曲线、Trace 时间线
- **研究 / 对话模式**：研究模式可改模型与跑实验；对话模式只读解释
- **证据链解释**：区间解释与机制归因必须引用真实 Trace；无证据标为推测
- **实验与复现**：单参扫描、干预对比、复现包导出（含 ODD）
- **本地内核**：Python Mesa 仿真内核经 sidecar 运行，结果可复现（seed + 参数 + 版本）
- **桌面应用**：Electron 工作台，开箱即用

---

## 快速开始

### 下载安装（推荐）

1. 打开 [Releases](https://github.com/ShuhanLexX/Auto-ABM/releases)
2. 下载 `AutoABM-*-win-x64.exe`
3. 安装并启动 AutoABM

### 从源码开发

```bash
bun install
cp .env.example .env

# 本地 API / 运行时
SERVER_PORT=3456 bun run src/server/index.ts

# 桌面前端
cd desktop && bun install && bun run dev
```

更多见 [环境变量](docs/guide/env-vars.md) 与 [贡献指南](CONTRIBUTING.md)。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript / Python |
| 桌面 | Electron + React + Vite |
| 仿真内核 | Mesa（`packages/abm-kernel`） |
| 本地运行时 | [Bun](https://bun.sh) |
| 状态管理 | Zustand |

---

## 项目结构

| 目录 | 说明 |
|------|------|
| `desktop/` | Electron + React 桌面工作台 |
| `src/server/abm/` | ABM API、Run / Trace、持久化 |
| `packages/abm-kernel/` | Python Mesa 仿真内核 |
| `src/` | 本地运行时与 Agent 能力 |
| `docs/` | 产品与工程文档 |
| `release-notes/` | 版本说明 |

产品需求见 [`core-requirements.md`](./core-requirements.md)。

---

## 许可证

MIT License © [ShuhanLexX](https://github.com/ShuhanLexX) — 详见 [LICENSE](LICENSE)。
