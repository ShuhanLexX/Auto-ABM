# AI 文档索引

> **受众**：Cursor / 编码 Agent。**人类（Boss）** 定方向与验收；实现细节以代码与本文档体系为准。

## 阅读顺序

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| 1 | [`core-requirements.md`](https://github.com/ShuhanLexX/Auto-ABM/blob/main/core-requirements.md) | 产品对象、交互、MVP 范围、不可违背原则 |
| 2 | [`FORK-CONTEXT.md`](./FORK-CONTEXT.md) | 底座 vs 目标产品；什么复用、什么新建 |
| 3 | [`PRODUCT-CONSTRAINTS.md`](./PRODUCT-CONSTRAINTS.md) | 编码时的决策护栏（浓缩版） |
| 4 | [`SURFACE-ROUTING.md`](./SURFACE-ROUTING.md) | ABM 能力应落在哪个工程面 |
| 5 | [`TASK-PROTOCOL.md`](./TASK-PROTOCOL.md) | 如何理解 Boss 任务、何时上报、如何交接 |
| 6 | [`AGENTS.md`](https://github.com/ShuhanLexX/Auto-ABM/blob/main/AGENTS.md) | 工程契约：验证、持久化、风格、提交流程 |

## 实现规范（动手改代码前读）

| 文档 | 用途 |
| --- | --- |
| [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) | 实现总入口：系统全貌、子系统边界、跨切面契约、阶段总览 |
| [`impl/architecture.md`](./impl/architecture.md) | 三子系统、数据契约（=内核 schema）、REST/WS、持久化 |
| [`impl/kernel-bridge.md`](./impl/kernel-bridge.md) | server 经子进程驱动 `packages/abm-kernel`（NDJSON 流式） |
| [`impl/simulation-canvas.md`](./impl/simulation-canvas.md) | 大规模实时画布（NetLogo 式栅格 + WebGL + 二进制帧） |
| [`impl/conversation-ux.md`](./impl/conversation-ux.md) | 提案卡、审批/采纳、中间过程、证据链解释、`@` 引用、模式 |
| [`impl/roadmap.md`](./impl/roadmap.md) | 4 阶段计划：交付物/验收/验证/明确不做 |
| [`impl/plans/P0-foundation.md`](./impl/plans/P0-foundation.md) | P0 逐任务可执行计划：内核桥 + 领域骨架 |
| [`impl/plans/P1-workspace-canvas.md`](./impl/plans/P1-workspace-canvas.md) | P1 逐任务：Interface + 大规模画布 + Trace |
| [`impl/plans/P2-conversation-explain.md`](./impl/plans/P2-conversation-explain.md) | P2 逐任务：提案卡 + 审批 + 证据链解释 |
| [`impl/plans/P3-experiment-repro.md`](./impl/plans/P3-experiment-repro.md) | P3 逐任务：单参扫描 + 图表 + 复现包 |

## 不读什么

| 路径 | 原因 |
| --- | --- |
| `docs/agent/`、`docs/memory/`、`docs/skills/` | **底座**多 Agent / 记忆 / Skills 实现文档，非 ABM 产品规范 |
| `docs/desktop/`、`docs/guide/` | 面向终端用户与贡献者的人类文档 |
| `docs/ui-clone/` | 历史 UI 克隆参考，非 ABM 规范 |
| `README.md` | 人类项目介绍；产品细节以 `core-requirements.md` 为准 |

## 冲突裁决

1. Boss 当次指令  
2. `core-requirements.md`  
3. `docs/ai/PRODUCT-CONSTRAINTS.md`  
4. `AGENTS.md` 工程契约  
5. 底座遗留文档与代码现状  

实现方案未定时：**先对齐对象与验收标准**，再写代码；勿自行扩大 MVP。
