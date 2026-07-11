# P2 实施计划 · 对话驱动 + 证据链解释

> 上游：`../roadmap.md` P2、`../conversation-ux.md`、`../architecture.md` §3。
> **前置**：P0/P1 已有 run/canvas/trace。本阶段让**自然语言进入闭环**，并交付可解释性最小闭环（区间解释 + 机制归因）。

**目标**：一句需求 → 一批 Simulation 草案 → 采纳一个 → 生成可运行 Model + ODD；`@Simulation` 改模型（结构变更走审批）；刷选 Trace 区间 → 带可点击证据的解释（联动 Trace/画布/ODD）；对话模式只读。

**架构**：复用现有聊天栈（`chatStore` + `MessageBlock` switch + `PermissionDialog`/`AskUserQuestion`）；新增 ABM agent 工具 + 两类新 `UIMessage`（提案卡批 / 解释卡）；解释由 server 读真实 Trace 切片喂 LLM，强制只引证据。

**技术栈**：现有 agent-loop/工具、WS `content_delta` 流式、React 卡片组件、Trace JSONL 切片读取。

**验证强度**：组件单测 + 解释真实性单测 + 1 次 agent-browser 冒烟；不跑 `verify`/coverage。

---

## 文件结构总览

```text
src/tools/abm/                      # ABM agent 工具 (沿底座 tools 注册方式)
  proposeSimulations.ts  editModel.ts  run.ts  explainInterval.ts  updateOdd.ts
src/server/abm/
  oddService.ts          # 新增: 由 ModelConfig 派生 ODD 七部分 + 增量合并
  explainService.ts      # 新增: 读 trace 切片 + 组装解释上下文 + 引用校验
  api.ts                 # 改: GET /api/abm/runs/:rid/explain; ODD/draft 路由
  modelVersioning.ts     # 新增: 结构变更 -> version 递增

desktop/src/types/chat.ts                    # 改: UIMessage 增 abm_proposal_batch | abm_explanation
desktop/src/stores/chatStore.ts              # 改: handleServerMessage 映射两类新消息(最小)
desktop/src/components/chat/MessageList.tsx   # 改: MessageBlock switch 增两分支
desktop/src/abm/components/ProposalBatch.tsx  # 新增: 草案卡批 (母版 PlanPreviewCard)
desktop/src/abm/components/ProposalCard.tsx   # 新增
desktop/src/abm/components/ExplanationCard.tsx# 新增: 解释 + 证据 chip 联动
desktop/src/abm/components/ModelDiffPreview.tsx# 新增: 结构变更审批预览
desktop/src/abm/components/OddPanel.tsx        # 新增: ODD 七部分对照
desktop/src/abm/composer/abmReferences.ts     # 新增: @Simulation/@Run/@Experiment/Trace 区间
desktop/src/abm/stores/abmStore.ts            # 改: 草案/采纳/当前激活 Simulation
desktop/src/abm/**/*.test.tsx                  # 新增
```

---

## Task 1：ODD 派生与版本

**Files**
- Create: `src/server/abm/oddService.ts`、`src/server/abm/modelVersioning.ts`

`oddService`：`deriveOdd(config: ModelConfig): Odd`（七部分：Purpose/Entities/Process/DesignConcepts/Initialization/Input/Submodels，从 config 字段映射）；`mergeOdd(prev, derived): { odd, conflicts }`（保留用户手写段，冲突标 `needsReview`，**不覆盖**）。
`modelVersioning`：`bumpIfStructural(prev, next): version`（agents/mechanisms/environment 变 → 递增；仅参数默认值变不递增）。

- [ ] 写两服务 + 单测（结构变更→version 递增；ODD 合并保留手写段并标冲突）。
- [ ] 提交：`feat(server/abm): ODD derivation + model versioning`。

---

## Task 2：解释服务（证据链，真实性硬约束）

**Files**
- Create: `src/server/abm/explainService.ts`
- Modify: `src/server/abm/api.ts`

```ts
// explainService.ts
export interface Evidence { tick: number; metric?: string; value?: number; event?: string; mechanism_id?: string }
export interface ExplainContext { runId: string; from: number; to: number
  metrics: { tick: number; metrics: Record<string, number> }[]
  events: { tick: number; name: string }[]
  mechanisms: { tick: number; mechanism_id: string; agent_ids?: number[] }[]
  oddRefs: { section: string; text: string }[] }

export function buildExplainContext(runId: string, from: number, to: number): ExplainContext // 读 traces/<runId>.jsonl 区间
export function validateEvidence(ctx: ExplainContext, ev: Evidence[]): { ok: Evidence[]; rejected: Evidence[] } // 引用必须存在于 ctx, 否则拒绝
```

`api.ts`：`GET /api/abm/runs/:rid/explain?from=&to=` 返回 `ExplainContext`（供 agent-loop 工具消费）。解释文本生成在工具里（Task 3），但**证据校验在 server**：LLM 给的 evidence 必须经 `validateEvidence` 过滤，越界引用丢弃或标「推测」。

- [ ] 写 `explainService` + endpoint；行式读取 trace 区间（勿全量）。
- [ ] 单测：`validateEvidence` 对越界 tick/不存在 mechanism_id 判 rejected。
- [ ] 提交：`feat(server/abm): evidence-grounded explain context + validation`。

---

## Task 3：ABM agent 工具集

**Files**
- Create: `src/tools/abm/proposeSimulations.ts`、`editModel.ts`、`run.ts`、`explainInterval.ts`、`updateOdd.ts`（按底座 `src/tools/` 现有工具注册法）

| 工具 | 行为 | 关键点 |
| --- | --- | --- |
| `abm_propose_simulations` | LLM 产 5–10 草案（机制摘要/参数/预期/ODD摘要） | 输出结构化 → 触发 `abm_proposal_batch` 消息；探索模式可附低步数试跑(真实 run_id) |
| `abm_edit_model` | 改机制/参数/初始化 | 结构变更 → `modelVersioning` 递增 + **审批**(Task 5)；同步 `oddService.mergeOdd` |
| `abm_run` | 跑确定性 Run | 复用 P0 `abmRunService`；状态走 `/ws/abm` |
| `abm_explain_interval` | 区间解释 | 调 `explainService.buildExplainContext` → LLM 受限引用 → 经 `validateEvidence` → `abm_explanation` 消息 |
| `abm_update_odd` | 编辑 ODD 章节 | 增量合并、冲突标注、不覆盖手写 |

- [ ] 实现五工具；`abm_explain_interval` 的 prompt 明确「只能引用所给 ExplainContext，无依据标推测」。
- [ ] 单测/夹具测试工具的输入输出形状（mock LLM）。
- [ ] 提交：`feat(agent-loop): ABM tools (propose/edit/run/explain/odd)`。

---

## Task 4：提案卡批（草案 → 采纳）

**Files**
- Modify: `desktop/src/types/chat.ts`、`desktop/src/stores/chatStore.ts`、`desktop/src/components/chat/MessageList.tsx`
- Create: `desktop/src/abm/components/ProposalBatch.tsx`、`ProposalCard.tsx`

`chat.ts`：`UIMessage` 加 `{ type:'abm_proposal_batch'; proposals: AbmProposal[] }`；`AbmProposal = { id, mechanismSummary, keyParams, expectedMacro, oddExcerpt, trial?: { runId, sparkline } }`。
`chatStore.handleServerMessage`：把 server/工具产出的提案消息映射到该 UIMessage（最小改动）。
`MessageBlock`：加 `case 'abm_proposal_batch' → <ProposalBatch/>`。
`ProposalCard`：母版 `PlanPreviewCard`（标题+图标+正文+脚注操作条）；操作：采纳/对比/丢弃。采纳 → `abmClient.createSimulationFromProposal` → 设为当前激活 Simulation。试跑曲线仅在 `trial.runId` 存在时显示（真实，否则不画）。

- [ ] 改三处 + 写两组件 + 测试（渲染 N 卡、采纳回调、无 trial 不画曲线）。
- [ ] 提交：`feat(desktop/abm): proposal batch cards + adopt flow`。

---

## Task 5：结构变更审批

**Files**
- Create: `desktop/src/abm/components/ModelDiffPreview.tsx`
- 复用：`PermissionDialog` 链路（`chatStore.respondToPermission` → WS `permission_response`）

机制 A（工具阻塞式，`../conversation-ux.md` §3）：`abm_edit_model` 在执行结构变更前触发 `permission_request`（`toolName:'abm_edit_model'`，input 含 model diff + ODD 影响）。UI 在 `PermissionDialog` 内渲染 `ModelDiffPreview`（旧→新机制/参数/版本 diff）。用户 Allow/Deny → 现有回传链路。研究模式必弹；对话模式禁触发。

- [ ] 写 `ModelDiffPreview`；在 `PermissionDialog` 按 `toolName` 分支渲染 ABM diff。
- [ ] 测试：结构变更出审批、payload 正确、对话模式禁写。
- [ ] 提交：`feat(desktop/abm): structural change approval with model diff`。

---

## Task 6：解释卡 + 三处联动

**Files**
- Modify: `desktop/src/types/chat.ts`、`MessageList.tsx`、`desktop/src/abm/stores/selectionStore.ts`
- Create: `desktop/src/abm/components/ExplanationCard.tsx`

`chat.ts`：`UIMessage` 加 `{ type:'abm_explanation'; text: string; evidence: Evidence[]; speculative?: boolean }`。叙述文本仍走现有流式（`content_delta`/`streamingText`）；结构化证据走该消息。
`ExplanationCard`：正文 + 证据 chip 列表（母版 `AssistantOutputTargetCard`）。chip 点击 → `selectionStore.set({ runId, tick, agentIds })` → Trace 面板 seek + 画布高亮对应 agent/边 + `OddPanel` 滚到相关 Submodel/Process。无证据条目（`speculative`）显示「推测」徽章。

- [ ] 加 UIMessage 分支 + `ExplanationCard`；接 `selectionStore` 联动（P1 已建）。
- [ ] 测试：证据 chip 点击触发 selection；speculative 显示推测徽章。
- [ ] 提交：`feat(desktop/abm): explanation card with evidence linkage`。

---

## Task 7：`@` 引用 + 对话模式 + ODD 面板

**Files**
- Create: `desktop/src/abm/composer/abmReferences.ts`、`desktop/src/abm/components/OddPanel.tsx`
- Modify: 组合器（复用 `workspaceChatContextStore` 引用机制）、`abmStore`（当前激活 Simulation）

`abmReferences`：扩展组合器支持 `@Simulation/@Run/@Experiment` 与「Trace 已刷选区间」，作为结构化上下文附在 `user_message`（非纯文本）。默认绑定当前激活 Simulation；`@` 覆盖。
对话模式：UI 隐藏写操作；工具层禁用 mutating 工具（仅 `abm_explain_*`/查询）。
`OddPanel`：展示 ODD 七部分，支持解释联动滚动 + 段落旁「用本次运行解释」入口。

- [ ] 写 `abmReferences` + `OddPanel`；对话模式禁写（UI + 工具双重）。
- [ ] 测试：@ 引用注入上下文形状；对话模式无写工具。
- [ ] 提交：`feat(desktop/abm): @references, dialogue mode, ODD panel`。

---

## P2 验收

- [ ] 输入一句需求 → 出一批草案卡 → 采纳一个 → 得到可运行 Simulation + ODD 草稿。
- [ ] `@Simulation` 改机制结构 → 出审批（带 diff）→ 同意后 version 递增、ODD 同步、手写段不丢。
- [ ] 刷选 Trace 区间 → 得到带可点击证据（tick/指标/事件/机制 id）的解释；点证据三处联动。
- [ ] 解释引用越界 → 被拒或标「推测」（真实性 P2）。
- [ ] 对话模式无法触发任何写操作。

## P2 验证（已调低）

- server：`bun test src/server/abm`（explain 真实性、ODD 合并、版本）
- desktop：`cd desktop && bun run test src/abm`（提案/审批/解释/对话模式）
- agent-browser 冒烟 1 次：「需求→采纳→改模型审批→区间解释」
- 收尾跑一次 `bun run check:desktop` + `bun run check:server`；不跑 `verify`/coverage。

## 风险与回滚

- **机制代码安全**：`abm_edit_model` 生成的机制经 `abm_kernel/validate.py::validate_mechanisms_source`，优先注册式/模板，避免任意 `exec`；高风险纳入审批。
- **解释幻觉**：硬靠 `validateEvidence` 兜底——LLM 越界引用一律降级；宁可标推测不可伪造。
- 回滚：两类 UIMessage 分支 + ABM 组件/工具为新增，移除即回 P1。
