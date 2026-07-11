# 实现规范总入口（Auto-ABM 二次开发）

> **受众**：Cursor / 编码 Agent。本文是把 `core-requirements.md` 的产品需求落到**现有底座代码**上的实现总纲。
> 产品「做什么」看 `core-requirements.md` + `docs/ai/PRODUCT-CONSTRAINTS.md`；本文及 `impl/*` 说明「怎么改这个仓库」。

## 实现文档地图

| 文档 | 何时读 |
| --- | --- |
| 本文 | 任何 ABM 开发任务开始前：系统全貌、子系统边界、跨切面契约、阶段划分 |
| [`impl/architecture.md`](./impl/architecture.md) | 设计/改 ABM 数据流、API、持久化、WS 协议 |
| [`impl/kernel-bridge.md`](./impl/kernel-bridge.md) | 让 server 调用 `packages/abm-kernel`（Python 子进程 + 流式帧） |
| [`impl/simulation-canvas.md`](./impl/simulation-canvas.md) | 实现/优化仿真画布（**大规模实时渲染**，最高优先难点） |
| [`impl/conversation-ux.md`](./impl/conversation-ux.md) | 提案卡、审批/采纳、中间过程、证据链解释、`@` 引用、模式 |
| [`impl/roadmap.md`](./impl/roadmap.md) | 阶段计划、每阶段交付物/验收/验证/明确不做项 |

冲突顺序沿用 `docs/ai/INDEX.md`：Boss 指令 → `core-requirements.md` → `docs/ai/*` → `AGENTS.md` → 底座现状。

## 系统全貌（目标态）

三个子系统，沿命名空间隔离（`docs/ai/FORK-CONTEXT.md`）：

```text
┌─────────────────────────── desktop (React/Electron) ───────────────────────────┐
│  对话区 (复用 chatStore/WS)         仿真工作区 desktop/src/abm/                   │
│   · 提案卡 / 审批 / 解释证据卡        · Interface(参数/seed/步数/实时曲线)         │
│   · @Simulation @Run @Experiment     · 画布(grid/network, WebGL+ImageData)        │
│                                       · Trace 时间轴 / ODD 对照 / 结果图表        │
└───────────────▲───────────────────────────────▲────────────────────────────────┘
        对话通道 │ /ws/:sessionId (JSON 流式)       │ /ws/abm/:runId (JSON 控制 + 二进制帧)
┌───────────────┴───────────────────────────────┴────────────────────────────────┐
│  server (Bun.serve)   src/server/abm/                                            │
│   · /api/abm/* REST(项目/仿真/运行/实验)   · 独立 ABM WS 通道 (abmHandler)        │
│   · AbmRunService: 拉起内核子进程, 流式转发 tick/snapshot                        │
│   · 持久化 ~/.claude/cc-haha/abm/ (JSON + trace.jsonl)                            │
└───────────────────────────────▲─────────────────────────────────────────────────┘
                                 │ NDJSON over stdio (命令↓ / 帧↑)
┌────────────────────────────────┴────────────────────────────────────────────────┐
│  packages/abm-kernel (Python, Mesa)  — 复用为仿真引擎                             │
│   simulate()/run_model(progress=, on_snapshot=) → trace.jsonl + RunRecord        │
│   + 新增 stdio worker 入口 (kernel-bridge.md)                                     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**关键决策（已定，除非 Boss 推翻）**

1. **内核复用 Python，不重写**：`packages/abm-kernel` 已是确定性 Mesa 引擎，含 Trace/RunRecord/SpaceSnapshot/VizSpec 契约。server 以**子进程 + NDJSON** 调用，模式照搬 `src/server/api/computer-use.ts`（Python spawn）+ `conversationService`（长进程流式）。
2. **数据契约以内核 Python schema 为准**：`packages/abm-kernel/src/abm_kernel/schemas/*` + `trace.py` 是单一事实源。TS 侧只镜像类型，**不另立分叉定义**。
3. **画布分层渲染**：grid 走 Canvas2D `ImageData`（即 NetLogo patch 栅格法），network/continuous/超大规模走 **WebGL 实例化**；大规模 snapshot 走 **二进制帧 + Web Worker 解码**，渲染节流与仿真解耦。详见 `impl/simulation-canvas.md`。
4. **对话复用现有栈**：流式文本、工具卡、审批走现有 `chatStore` + `MessageBlock` switch + `PermissionDialog`/`AskUserQuestion`；ABM 只新增 union 分支与组件，不复制平行聊天栈。
5. **仿真帧走独立 WS 通道 `/ws/abm/:runId`**（流畅优先）：上万 agent 的二进制帧不与聊天共用 socket，避免互相抢占卡顿。仅解释文本走对话通道。详见 `impl/architecture.md` §4。

## 跨切面契约（所有阶段都必须守）

| 契约 | 落地要求 |
| --- | --- |
| **确定性可复现 (P1)** | Run 必记 `seed`+参数快照+`model_version`+`kernel_version`；snapshot 为展示派生、**不**参与复现判定；复现包自包含 |
| **证据链可解释 (P2)** | 解释响应字段必须可点击溯源（`tick`/指标值/`event`/`mechanism_id`）；无证据标「推测」；server 组装解释上下文时**必须**带真实 Trace 切片，禁止用自由文本伪造 |
| **真实性** | 任何指标/排序/吻合度只能来自真实 `run_id`；探索模式同样禁止编造 |
| **审批边界** | 研究模式下：改 Model 结构、大规模批量、覆盖结果、导出复现包 → 走审批流（`conversation-ux.md`）；对话模式只读 |
| **持久化兼容** | 新 JSON 形状 → forward migration + 旧夹具测试 + `bun run check:persistence-upgrade`；写盘用原子写/可恢复读（`architecture.md`） |
| **命名空间隔离** | 新代码进 `desktop/src/abm/`、`src/server/abm/`；不把 ABM 逻辑塞进 `chatStore` 深处或无关底座文件 |

## 阶段总览（详见 `impl/roadmap.md`）

> 原则：每阶段都是**可演示的端到端切片**，先打通单 Simulation 闭环，再加解释与实验。「分阶段但不过细」。

| 阶段 | 主题 | 端到端能力 |
| --- | --- | --- |
| **P0 地基** | 内核桥 + 领域骨架 | 自然语言外，先用固定 ModelConfig：server 拉起内核跑一次确定性 Run，桌面看到指标曲线。打通 kernel↔server↔desktop 三段链路与持久化。 |
| **P1 仿真工作区** | Interface + **画布** + Trace | 调参/Run/Reset/实时曲线；grid+network 大规模流畅渲染；Trace 时间轴擦洗与回放。 |
| **P2 对话驱动 + 解释** | 提案卡 + 审批 + 证据链 | 一批 Simulation 草案→采纳；`@Simulation` 改模型（结构变更审批）；刷选 Trace 区间→区间叙事+机制归因（带证据卡）；对话模式只读。 |
| **P3 实验 + 复现** | 单参扫描 + 导出 | `@Simulation` 单参扫描→结果图表（VizSpec 渲染）；复现包导出（含 ODD）。 |

**MVP 之外（先不做，列后续）**：探索模式无人值守全流程、反事实/异常增强、多 Simulation 对比搜索树、3D/GIS/分布式。见 `core-requirements.md` §7。

## 开干前自检

1. 读本文 + `impl/` 中与任务相关的 1-2 篇 + `docs/ai/PRODUCT-CONSTRAINTS.md`。
2. 声明 surface（`desktop`/`server`/`agent-loop`）与目标对象，确认在 MVP 内（`roadmap.md`）。
3. `git status --short`；复用底座模式（见各 impl 文档「复用锚点」表，含真实文件路径）。
4. 窄验证（`docs/ai/SURFACE-ROUTING.md`）；按 `TASK-PROTOCOL.md` 交接。
