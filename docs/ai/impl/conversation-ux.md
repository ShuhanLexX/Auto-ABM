# 对话驱动交互：提案 · 审批 · 中间过程 · 证据链解释

> 总纲见 `../IMPLEMENTATION.md`。本文把「对话是意图入口、结论落在仿真对象上」落到现有聊天栈，并设计科研流程所需的密集人工审批点。

## 0. 复用锚点（现有底座，勿重造）

| 现有能力 | 文件 | ABM 复用方式 |
| --- | --- | --- |
| 流式文本组装 | `chatStore.handleServerMessage`（`streamingText` 50ms 节流）→ `AssistantMessage` | 解释/叙述直接复用，不改协议 |
| 消息渲染分发 | `desktop/src/components/chat/MessageList.tsx::MessageBlock`（union switch） | 新增 ABM 分支 |
| 富卡片范式 | `PlanModePreview.tsx::PlanPreviewCard`、`AskUserQuestion.tsx`、`PermissionDialog.tsx` | 提案卡/解释卡的结构母版 |
| 工具中间过程 | `ToolCallGroup.tsx` / `ToolCallBlock.tsx`（分组、嵌套、流式状态） | ABM agent 工具直接以工具卡呈现 |
| 审批回传 | `chatStore.respondToPermission` → WS `permission_response` | 结构变更/危险操作审批 |
| 结构化追问 | `AskUserQuestion`（多问、可选项、自由文本） | 建模澄清、方案取舍 |
| 产物 chip | `AssistantOutputTargetCard.tsx` | 证据卡可点击 chip 母版 |
| `@` 上下文 | `workspaceChatContextStore` + 组合器 | 扩展为 `@Simulation/@Run/@Experiment/Trace 区间` |

**集成路径只有两处 switch**：`chatStore.handleServerMessage`（消息→状态）与 `MessageBlock`（状态→组件）。ABM 走「扩 union + 加组件」，不复制聊天栈。状态建议进**独立 `desktop/src/abm/stores/abmStore.ts`**，聊天 store 只持有「内联卡片所需的最小引用」。

## 1. ABM Agent 工具（中间过程的来源）

agent-loop 暴露一组 ABM 工具（`src/tools/` 或 server 侧能力），每个工具调用天然在对话里以 `ToolCallBlock` 显示「正在做什么」：

| 工具 | 作用 | 渲染 |
| --- | --- | --- |
| `abm_propose_simulations` | 生成一批草案 | → 提案卡批次（§2） |
| `abm_edit_model` | 改机制/参数/初始化（结构变更递增版本） | 工具卡 + 结构变更走审批（§3） |
| `abm_run` | 跑一次确定性 Run | 工具卡 + 实时状态（`abm_run_status`/`abm_tick`） |
| `abm_run_experiment` | 单参扫描等 | 工具卡 + 进度 |
| `abm_explain_interval` | 区间解释（读 Trace） | → 解释证据卡（§4） |
| `abm_update_odd` | 同步/编辑 ODD 章节 | 工具卡 + 冲突标注 |

中间过程 UX 直接吃 `ToolCallGroup` 的分组/嵌套/流式自动展开能力；长 Run 的进度用 §5 的事件驱动状态条。

## 2. 提案卡（一批 Simulation 草案 → 采纳）

需求：用户提需求后给 5–10 个草案，每个含一句话机制摘要、关键参数与预期宏观行为、ODD Purpose/Process 摘要、可选低步数试跑结果（`core-requirements.md` §3.4 / §5.1）。

实现：
- 新增 `UIMessage` 分支 `abm_proposal_batch`（`desktop/src/types/chat.ts` 镜像 server 消息），payload = `proposals: AbmProposal[]`，每项含 `{ id, mechanism_summary, key_params, expected_macro, odd_excerpt, trial?: {run_id, sparkline_metric} }`。
- 组件 `desktop/src/abm/components/ProposalBatch.tsx`：卡片网格/横向卡列，单卡以 `PlanPreviewCard` 结构为母版（标题+图标+正文+脚注操作条）。
- 每卡操作：**采纳为 Simulation** / **对比** / **丢弃**；多选「对比」进结果对比视图。
- 试跑数值（若有）必须来自真实 `run_id`（探索模式自动试跑），卡上标注；无试跑则只显示预期，不可伪造曲线。
- 采纳 = 调 `/api/abm/.../simulations`（或确认型工具），落库为正式 Simulation；未采纳存草稿/丢弃。

## 3. 审批 / 采纳流（研究流程的核心）

研究模式下须确认：改 Model **结构**、大规模批量、覆盖结果、导出复现包（`core-requirements.md` §4）。两种机制按场景选：

- **A. 工具阻塞式审批（推荐用于结构变更/危险操作）**：ABM 工具在执行前触发 `permission_request`（带 ABM 专用 `toolName`/描述与 diff 预览），UI 用 `PermissionDialog`（或其 ABM 变体，含 Model diff/ODD 影响预览），用户 Allow/Deny/「本会话允许」→ `respondToPermission`。这天然复用现有权限链与审计。
- **B. 卡片显式动作（推荐用于采纳/选择，无需阻塞 agent）**：如提案采纳、方案选择，走卡片按钮 → REST，不必占用权限通道。

模式映射（ABM 产品模式 → 底座能力）：
| 产品模式 | 行为 | 实现 |
| --- | --- | --- |
| 研究模式（默认） | 结构变更/批量/覆盖/导出须确认 | 机制 A + 卡片确认；可对照 `permissionMode='default'` |
| 对话模式 | 只读问答，不产生变更 | 禁用一切 mutating 工具（仅 `abm_explain_*`/查询）；UI 隐藏写操作 |
| 探索模式（后续） | 无人值守自动推进 | 放宽逐步确认，但报告须链 `run_id`；MVP 后置 |

> ODD 手写段落保护：`abm_update_odd` 增量合并、冲突标出待复核，**不静默覆盖**用户手写内容（`core-requirements.md` §2）。

## 4. 证据链解释（产品亮点，最高可解释性要求）

入口：Trace 刷选区间、曲线拐点、画布点选、对话 `@Run`、ODD 段落旁「用本次运行解释」（`core-requirements.md` §5.3）。

数据流（**禁止自由发挥**）：
```text
用户刷选 Trace 区间 [t0,t1] on run_id
  → server abm_explain: 读 traces/<run_id>.jsonl 切片(tick_metrics/event/mechanism_fired[/agent_delta])
      + 关联 ODD/机制图节点引用
  → 作为结构化上下文喂 LLM（agent-loop），要求其只引用所给证据
  ← 解释 + 证据列表(每条: {tick, metric?, value?, event?, mechanism_id?})
desktop: 渲染解释卡, 每条证据为可点击 chip → 联动(Trace seek / 画布高亮 / ODD 跳转)
```

实现：
- 叙述文本走现有流式（复用 `streamingText`/`content_delta`）。
- 结构化证据走新分支 `abm_explanation`（`UIMessage`），组件 `desktop/src/abm/components/ExplanationCard.tsx`：正文 + 证据 chip 列表（母版 `AssistantOutputTargetCard`）。
- **无证据 → 标「推测」**徽章（产品硬约束 P2）；server 端校验：引用的 `tick/mechanism_id` 必须存在于该 run 的 Trace，否则拒绝/降级为推测。
- 联动经 §0 的 selection store：chip 点击 → 设置 selection → Trace 面板 seek + 画布 `canvas` 高亮对应 agent/边 + ODD 面板滚动到相关 Submodel/Process。
- 机制归因：直接利用内核已落的 `mechanism_fired`（`base.py::change_state` 在机制执行期自动归因），解释「为何此时加速/逆转」时引用之，真实可溯。

## 5. 长任务的实时反馈（Run / 实验）

- server 把内核 `tick`/`run_status`/`run_done` 帧转 WS JSON（`architecture.md` §4）；桌面 `abmStore` 消费。
- 对话内用一个轻量状态条/工具卡展示进度（复用 `StreamingIndicator`/`ToolCallGroup` 的流式状态范式；底座已有未用的 `task_update` 槽位可参考，但建议用 ABM 专用消息，语义更清晰）。
- 实验批量：逐 Run 进度（内核 `on_run_done` 回调）→ 卡片进度列表；失败 Run 标记但不中断批次（内核 `ExperimentRunner` 已支持）。

## 6. `@` 引用扩展

- 组合器支持 `@Simulation` / `@Run` / `@Experiment` 与「Trace 已刷选区间」，作为结构化上下文附在 `user_message`（扩展 `workspaceChatContextStore` 的引用类型，而非塞进纯文本）。
- 默认绑定「当前激活 Simulation」；`@` 显式覆盖（`core-requirements.md` §3.2 / §5.7）。
- server 收到带 ABM 引用的消息时，把对应对象的精简上下文（ModelConfig 摘要 / RunRecord / Trace 区间）注入 agent-loop。

## 7. 验证

- 组件：Vitest/Testing Library，照 `chatBlocks.test.tsx`/`MessageList.test.tsx`：提案卡渲染与采纳回调、解释卡证据 chip 联动、审批回传 payload、对话模式禁写。
- 解释真实性：单测 server explain「引用越界 tick/mechanism → 拒绝或标推测」。
- 可见流程：`bun run check:desktop` + 必要时 agent-browser smoke。
