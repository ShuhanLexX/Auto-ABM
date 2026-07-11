# 架构与数据契约

> 总纲见 `../IMPLEMENTATION.md`。本文定义三个子系统的边界、数据契约、WS 协议扩展与持久化布局。

## 1. 子系统与职责

| 子系统 | 路径 | 职责 | 复用锚点（现有底座） |
| --- | --- | --- | --- |
| 内核 | `packages/abm-kernel/` | 确定性仿真、Trace、RunRecord、SpaceSnapshot、实验/对比/现象评估 | 已存在，复用为引擎；新增 stdio worker 入口（`kernel-bridge.md`） |
| 服务端 | `src/server/abm/` | `/api/abm/*` REST、运行编排（拉起内核）、Trace 存取、WS 帧广播、持久化 | `router.ts` 注册、`api/computer-use.ts`(Python spawn)、`conversationService`(长进程流)、`ws/events.ts`+`sendToSession`、`recoverableJsonFile`/原子写、`persistentStorageMigrations.ts` |
| 桌面端 | `desktop/src/abm/` | 仿真工作区 UI、ABM API client、ABM store、提案/解释组件 | `api/client.ts`、`api/websocket.ts`、`chatStore`+`MessageBlock`、workbench panel（`workspacePanelStore`） |

**铁律**：内核零 Web 依赖（保持 `packages/abm-kernel/AGENTS.md` 约定）；server 不重写仿真逻辑；desktop 不直接连内核（一律经 server）。

## 2. 数据契约（单一事实源 = 内核 Python schema）

下列契约已在内核实现，**TS 侧只镜像、不分叉**。改契约先改 Python schema 再同步 TS。

| 契约 | 定义位置 | 要点 |
| --- | --- | --- |
| `ModelConfig` | `abm_kernel/schemas/model_config.py` | 结构：agents/state/environment/parameters/observers/mechanisms；改结构 → `version` 递增 |
| `RunRecord` | `abm_kernel/schemas/run.py` | `seed`+`parameters`+`model_version`+`kernel_version`+`trace_path`+`metrics_summary`（复现根） |
| Trace 行协议 | `abm_kernel/trace.py` | JSONL：`run_meta`→ `tick_metrics`/`event`/`mechanism_fired`/`space_snapshot`/`agent_init`/`agent_delta` →`run_end`；`level` ∈ off/key/full |
| `SpaceSnapshot` | `abm_kernel/schemas/space.py` | 展示派生；network(`nodes`/`edges`) + grid(`width/height/cells`)；`sample_rate`/`agent_cap` 降采样 |
| `VizSpec` | `abm_kernel/schemas/viz.py` | 声明式图表白名单；AI 只发 spec，数据由 server 按 `data_ref` 解析（禁止 AI 直出数据） |
| 实验/对比/现象 | `runner.py`/`comparison.py`/`phenomenon.py` | `ExperimentConfig`→N RunPlan；假设排序按真实 RunRecord 打分 |

### TS 镜像约定

- 放 `src/server/abm/types.ts`（server 权威）+ 必要时 `desktop/src/abm/types.ts` 复用导出，避免前后端漂移。
- 镜像类型加注释指回 Python 源文件，例：`// mirror of abm_kernel/schemas/run.py::RunRecord`。
- 校验：进入内核前的入参（ModelConfig/ExperimentConfig）在 server 侧做基本形状校验；深校验交给内核（Pydantic）并把错误透传。

## 3. REST：`/api/abm/*`

注册方式（照搬 `src/server/router.ts` 的 `switch(resource)`）：

```ts
// src/server/router.ts
case 'abm':
  return handleAbmApi(req, url, segments) // segments: ['api','abm', sub, ...]
```

handler 形态照搬 `src/server/api/sessions.ts`（`handleXxxApi(req,url,segments)` + `ApiError`/`errorResponse`）。建议子资源：

| 方法 + 路径 | 用途 |
| --- | --- |
| `GET/POST /api/abm/projects` · `.../projects/:id` | 课题 CRUD |
| `GET/POST /api/abm/projects/:id/simulations` · `.../simulations/:sid` | 仿真 CRUD、fork |
| `POST /api/abm/simulations/:sid/runs` | 启动一次 Run（异步，返回 `run_id`），WS 推流 |
| `GET /api/abm/runs/:rid` · `.../runs/:rid/trace?from=&to=` | RunRecord、Trace 区间（解释/回放用） |
| `POST /api/abm/simulations/:sid/experiments` · `GET .../experiments/:eid` | 单参扫描等 |
| `POST /api/abm/runs/:rid/viz`（解析 `VizSpec`→真实数据） | 图表数据 |
| `POST /api/abm/simulations/:sid/export` | 复现包导出 |
| `GET /api/abm/runs/:rid/explain?from=&to=`（或经 agent-loop 工具） | 区间解释上下文 |

**命名避坑**：底座已有 `/api/traces`（LLM 调用日志），ABM 仿真 Trace 一律走 `/api/abm/.../trace`，勿混。

## 4. WebSocket：独立 ABM 通道（已定）

**决策（怎么仿真流畅怎么来）**：ABM 用**独立的二进制 WS 通道 `/ws/abm/:runId`**，与聊天 `/ws/:sessionId` 分开。原因：上万 agent 的 snapshot 帧流量大、频率高，若与对话流式共用一条 socket 会互相抢占、互相卡顿；独立通道让仿真帧不被聊天阻塞，也便于单独设 `binaryType='arraybuffer'`、背压与丢帧策略。

- **通道建立**：`src/server/index.ts` 在 `/ws/:sessionId` 旁加分支识别 `/ws/abm/:runId`，`WebSocketData.channel='abm'`，交由新模块 `src/server/ws/abmHandler.ts`。鉴权复用现有逻辑（H5 `?token=` / Bearer / 本地放行，见 `index.ts` 与 `middleware/auth.ts`）。
- **桌面侧**：新建 `desktop/src/abm/api/abmSocket.ts`（仿 `desktop/src/api/websocket.ts` 的 `WebSocketManager`），连接前设 `ws.binaryType='arraybuffer'`；`onmessage` 按 `typeof data` 分流：`string`→JSON 控制，`ArrayBuffer`→帧（转 Worker 解码，`simulation-canvas.md` §4）。
- **同一通道双类消息**：
  - **JSON 控制**（小、低频）：`{type:'abm_run_status', runId, state, tick, totalSteps}`、`{type:'abm_tick', runId, tick, metrics}`（实时曲线）、`{type:'abm_run_done', runId, recordRef}`、`{type:'abm_error', runId, message}`、`{type:'abm_meta', runId, palette, layout?}`（首帧元数据）。
  - **二进制帧**（大、高频）：snapshot 帧（`simulation-canvas.md` §4 格式）。
- **类型定义**：ABM WS 协议放 `src/server/abm/wsEvents.ts`（不混进底座 `ws/events.ts`），桌面镜像到 `desktop/src/abm/types.ts`。
- **状态消费**：独立 `desktop/src/abm/stores/abmStore.ts`，**不**污染 `chatStore`。
- **解释流式**走聊天通道（复用 `content_delta`/`streamingText`，见 `conversation-ux.md` §4）——解释是对话内的文本叙述，量小，归对话通道更自然；只有仿真帧/指标走 ABM 通道。

> 备选（仅记录，不采用）：复用 session socket 实现最省事，但帧流量会和聊天抢带宽/主线程，违背「流畅优先」，故弃。

## 5. 持久化布局

根目录沿用 `CLAUDE_CONFIG_DIR || ~/.claude`，ABM 命名空间 `cc-haha/abm/`：

```text
~/.claude/cc-haha/abm/
  projects.json                      # 项目索引（轻量元数据）
  projects/<projectId>/
    project.json                     # research_question / 设置
    simulations/<simId>/
      simulation.json                # 当前 Model 指针、Interface 状态
      model/<version>/config.json    # ModelConfig 版本化
      model/<version>/odd.json       # ODD 七部分（与 model 版本一一对应）
      runs/<runId>.json              # RunRecord
      traces/<runId>.jsonl           # 内核 TraceWriter 输出（直接复用）
      experiments/<expId>.json
    artifacts/<artifactId>.*         # 图表/报告/复现包
```

落地要求：

- **写**：原子写（temp+rename，见 `persistentStorageMigrations.ts::writeJsonFile`）；**读**：`recoverableJsonFile.readRecoverableJsonFile`（损坏隔离+默认值）。
- **trace.jsonl 直接用内核产物**：内核 `simulate(output_dir=...)` 已按 `trace/<rid>.jsonl` 落盘，server 指定 `output_dir` 指向上面布局即可，避免二次拷贝。
- **迁移**：新增/变更 JSON 形状 → 在 `persistentStorageMigrations.ts`（或新建 `abmStorageMigrations.ts` 由其调用）注册 forward migration + `schemaVersion` 字段；写旧夹具测试；过 `bun run check:persistence-upgrade`。
- **受保护状态**：勿触碰 `~/.claude/projects/**/*.jsonl`（聊天 transcript）、OAuth、MCP 等（`AGENTS.md` 保护清单）。ABM 数据自成 `cc-haha/abm/` 子树。

## 6. 端到端数据流（一次 Run）

```text
desktop: POST /api/abm/simulations/:sid/runs {seed,steps,params,space_sample_rate}
  → server AbmRunService: 解析 ModelConfig+behavior → 拉起/复用内核子进程
      → 发送 NDJSON 命令 run{...}（kernel-bridge.md）
  ← 内核流式: tick_metrics / space_snapshot(二进制) / mechanism_fired / run_done
  → server: tick→WS abm_tick(JSON); snapshot→WS 二进制帧; 落盘 trace.jsonl + RunRecord
desktop: abmStore 收 JSON 更新曲线/状态; Worker 解码二进制帧 → 画布渲染
完成: run_done → RunRecord 持久化 → 解释/实验/导出皆基于该 run_id
```

## 7. 确定性与展示分离（务必遵守）

- 复现判定 = `seed + parameters + model_version + kernel_version`（`RunRecord`）。
- `SpaceSnapshot` 是**展示派生**，不消耗 RNG、不进复现判定（见 `space.py`/`trace.py` 注释）。画布降采样/丢帧/插值**永远不能**改变 Run 结果。
- 解释只能引用真实 Trace 行；server 组装解释上下文 = 读 `traces/<runId>.jsonl` 的对应 tick 区间，连同 ODD/机制图引用一起喂给 LLM（见 `conversation-ux.md` §4）。

## 8. 验证

| 改动 | 命令 |
| --- | --- |
| 内核 | `cd packages/abm-kernel && uv run pytest && uv run mypy src && uv run ruff check .` |
| server ABM API/Run/Trace | `bun run check:server` + `src/server/__tests__/` 请求形状测试 |
| 持久化形状 | `bun run check:persistence-upgrade` |
| desktop ABM UI | `bun run check:desktop` + Vitest |
| 跨三段链路 | 窄 E2E / agent-browser smoke（先用固定 ModelConfig 跑通） |
