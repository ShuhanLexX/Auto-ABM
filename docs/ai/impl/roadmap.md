# 实现路线图（4 阶段）

> 总纲见 `../IMPLEMENTATION.md`。原则：**每阶段一个可演示的端到端切片**，先打通单 Simulation 闭环，再叠加解释与实验。阶段之间可串行交付，阶段内任务可并行。
> 本文是**方向与验收**；**逐任务可执行计划**见 `plans/`：
> [`plans/P0-foundation.md`](./plans/P0-foundation.md) ·
> [`plans/P1-workspace-canvas.md`](./plans/P1-workspace-canvas.md) ·
> [`plans/P2-conversation-explain.md`](./plans/P2-conversation-explain.md) ·
> [`plans/P3-experiment-repro.md`](./plans/P3-experiment-repro.md)

## 阶段速览

| 阶段 | 主题 | 一句话验收 |
| --- | --- | --- |
| P0 | 内核桥 + 领域骨架 | 给定固定 ModelConfig，server 拉起内核跑出确定性 Run，桌面看到指标曲线并可复现 |
| P1 | 仿真工作区（Interface + 画布 + Trace） | 调参/Run/Reset/实时曲线；grid+network 大规模流畅；Trace 擦洗回放 |
| P2 | 对话驱动 + 证据链解释 | 一批草案→采纳；`@Simulation` 改模型（结构审批）；区间解释+机制归因（带证据卡）；对话模式只读 |
| P3 | 实验 + 复现 | `@Simulation` 单参扫描→结果图表；复现包导出（含 ODD） |

完成 P0–P3 即覆盖 `core-requirements.md` §7 的 MVP 1–6。

---

## P0 · 内核桥 + 领域骨架

**目标**：打通 `kernel ↔ server ↔ desktop` 三段链路与持久化；此阶段可不接自然语言，用内置/固定 ModelConfig（如内核自带 SIR/Schelling）验证管道。

**交付物**
- 内核：`abm_kernel/worker.py` stdio NDJSON 入口（`kernel-bridge.md` §3），`[project.scripts]` 暴露可执行；NDJSON 往返测试。
- server：`src/server/abm/`（`AbmRunService` + 路径/类型 + TS 镜像类型）、`/api/abm/{simulations,runs}` 最小集、`router.ts` 注册 `case 'abm'`；WS `abm_tick`/`abm_run_status`/`abm_run_done`（JSON）。
- 持久化：`~/.claude/cc-haha/abm/` 布局（`architecture.md` §5）、原子写/可恢复读、首版 migration + `schemaVersion`。
- desktop：`desktop/src/abm/`（`abmStore` + `api/abm.ts`）、最简 Run 触发 + 指标曲线、ABM 工作区面板挂载点（复用 workbench panel）。
- 运行时冒烟：干净环境探测/拉起 Python 内核成功，失败给明确缺失项（`kernel-bridge.md` §7）。

**验收**
- 同一 `seed`+参数两次 Run，`metrics_summary` 完全一致（确定性 P1）。
- trace.jsonl 落在约定路径，含 `run_meta`→`tick_metrics`→`run_end`。
- 桌面实时显示指标曲线，Run 完成得到可读 `RunRecord`。

**验证**：`uv run pytest`（内核）、`bun run check:server` + 请求形状/spawn 用例、`bun run check:persistence-upgrade`、`bun run check:desktop`。

---

## P1 · 仿真工作区（Interface + 画布 + Trace）

**目标**：单 Simulation 工作区可交互；**攻克大规模实时渲染**（产品最高难点）。

**交付物**
- Interface：滑块/输入（参数）、seed/步数、Run/Reset、实时曲线（吃 `abm_tick`）。
- 画布（`simulation-canvas.md`）：帧格式 + Worker 解码（纯函数先单测）→ `GridRasterRenderer`（ImageData）→ `PointsGLRenderer`（WebGL 实例化 + 边批 + 布局缓存）→ 节拍解耦/背压丢帧 → 缩放/平移/拾取 → 超阈值 heatmap 兜底。
- 二进制帧链路：内核二进制 snapshot（base64 内联起步，量大转旁路管道）→ server WS 二进制 → Worker。
- Trace 面板：时间轴擦洗、事件/机制触发标注、刷选区间（为 P2 解释铺路）；replay 复用画布渲染器。
- selection store：画布 ↔ Trace 联动基础。

**验收（含性能基线，`simulation-canvas.md` §7）**
- grid 1e4 cell 60fps；network 1e4 节点/5e4 边 ≥30fps 平移缩放流畅；1e5 节点可用并自动建议 `agent_cap`/heatmap。
- delta 帧（1e4 节点 1% 变化）< 1KB/帧；渲染慢时丢帧而 Run 结果不变。
- Trace 擦洗能 seek 到任意 tick 的最近 snapshot 并正确重绘。

**验证**：`bun run check:desktop` + 帧解码单测 + 性能 HUD 基线；agent-browser smoke 跑大规模基准 ModelConfig。

---

## P2 · 对话驱动 + 证据链解释

**目标**：自然语言进入闭环；交付可解释性最小闭环（区间解释 + 机制归因）。

**交付物**（`conversation-ux.md`）
- ABM agent 工具集：`abm_propose_simulations`/`abm_edit_model`/`abm_run`/`abm_explain_interval`/`abm_update_odd`。
- 提案卡批次：`abm_proposal_batch` 分支 + `ProposalBatch` 组件；采纳/对比/丢弃；试跑数值必来自真实 `run_id`。
- 审批流：结构变更/危险操作走 `permission_request`（含 Model diff/ODD 影响预览）；采纳类走卡片动作 + REST。
- 解释：server `abm_explain` 读 Trace 切片 + ODD 引用 → LLM 受限引用 → `abm_explanation` 证据卡（可点 chip 联动 Trace/画布/ODD）；无证据标「推测」；越界引用被拒。
- 对话模式：只读，禁用 mutating 工具。
- `@Simulation/@Run/@Experiment/Trace 区间` 引用接入组合器与 agent-loop 上下文。
- ODD：由 Model 自动派生七部分草稿；`abm_update_odd` 增量合并、冲突标注、不覆盖手写段。

**验收**
- 一句需求 → 一批草案卡 → 采纳一个 → 生成可运行 Simulation + ODD 草稿。
- 刷选 Trace 区间 → 得到带可点击证据（tick/指标/事件/机制 id）的解释；点证据联动三处。
- 结构变更前出现审批；对话模式无法触发写操作。

**验证**：`bun run check:desktop`（组件/联动/禁写）+ `bun run check:server`（explain 真实性、引用越界拒绝）+ agent-browser smoke 走「需求→采纳→解释」。

---

## P3 · 实验 + 复现

**目标**：完成实验与可校验复现包，闭合 MVP。

**交付物**
- `@Simulation` 单参扫描：`abm_run_experiment` → 内核 `ExperimentConfig`→N RunPlan（`runner.py` 已有）；逐 Run 进度、失败不中断。
- 结果图表：`VizSpec` 声明式渲染器（前端白名单），数据由 server 按 `data_ref` 解析真实结果（AI 不直出数据，`architecture.md` §2）。
- 复现包导出：自包含（ModelConfig + ODD + 实验 + seed + 结果），走研究模式审批；ODD 导出 Markdown。

**验收**
- 对一个参数扫描出多 Run，结果图表来自真实 RunRecord；横向对比同一指标。
- 导出复现包在干净环境可重跑得到一致指标（确定性 P1）。

**验证**：`bun run check:server` + `bun run check:desktop` + `bun run check:persistence-upgrade`（导出/导入形状）；PR 级再 `bun run verify`。

---

## 明确不做（MVP 阶段，列后续）

来自 `core-requirements.md` §7，避免 Agent 偷跑扩范围：
- 探索模式无人值守全流程（自动多方案试跑+剪枝+搜索树报告）——内核 `search_tree.py`/`comparison.py` 已备底层能力，但**产品流程后置**。
- 反事实分支、异常自动标注、证据卡增强。
- 多 Simulation 对比搜索树 UI、ODD 与实验章节联动自动撰写。
- 代码/终端中心 IDE 形态、数据驱动校准、分布式仿真、3D/GIS、Word/LaTeX 生态。

需要做以上任一，先回 `docs/ai/TASK-PROTOCOL.md` 请示 Boss 调整 MVP 范围。

## 跨阶段始终守

确定性可复现、证据链可解释、真实性、审批边界、持久化兼容、命名空间隔离 —— 见 `../IMPLEMENTATION.md`「跨切面契约」。每阶段交接按 `docs/ai/TASK-PROTOCOL.md` 格式（变更文件 / 已跑未跑验证 / 风险回滚 / 待 Boss 决定）。
