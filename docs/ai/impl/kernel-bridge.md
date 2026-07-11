# 内核桥：server ↔ packages/abm-kernel

> 总纲见 `../IMPLEMENTATION.md`，数据流见 `architecture.md` §6。本文定义 server 如何驱动 Python 内核并取得流式结果。

## 1. 为什么是子进程

`packages/abm-kernel` 是 Python（Mesa + networkx + pydantic），无法在 Bun 内直接调用。复用而非重写 → **server 用 `Bun.spawn` 拉起 Python 进程**，模式照搬：

- Python 探测/调用：`src/server/api/computer-use.ts` + `computer-use-python.ts`（`detectPythonRuntime`、跨平台候选、venv）。
- 长进程 + 流式 pub/sub：`src/server/services/conversationService.ts`（stdout reader loop、`onOutput` 回调、`proc.exited`、优雅关闭）。

## 2. 进程模型

两种粒度，按需选择（MVP 用 A，实验批量用 B）：

- **A. 一次性运行（per-run spawn）**：每次 Run 拉起一个进程，跑完退出。简单、隔离好；适合 MVP 单 Run。
- **B. 常驻 worker（per-simulation）**：一个进程常驻，接收多条 `run`/`step`/`stop` 命令。省去 Mesa import 与建图开销；适合交互式调参（连续点 Run/Reset）与实验扫描。

> 建议：P0 先做 A 打通；P1 交互式 Interface 升级为 B（复用进程，降低每次 Run 启动延迟）。两者共用同一 NDJSON 协议（§3）。

进程管理要点（照搬 `conversationService`）：

- 用 `Map<simId|runId, KernelProc>` 跟踪；`AbmRunService` 暴露 `startRun/stopRun/onFrame`。
- server 关闭时 kill 全部内核进程（在 `stopServerRuntimeForShutdown()` 注册，类比 `stopAllSessionsAndWait`）。
- 单进程崩溃只失败对应 Run，不影响 server（错误转 `RunRecord.status='failed'`）。

## 3. NDJSON 控制协议（stdin 命令 ↓ / stdout 帧 ↑）

新增内核入口 `packages/abm-kernel/src/abm_kernel/worker.py`（+ `[project.scripts]` 或 `python -m abm_kernel.worker`）。**逐行 JSON**；轻量帧走 stdout JSON，重量 snapshot 可选二进制（§5）。

**命令（server → 内核，stdin 每行一条）**

```jsonc
{"cmd":"run","run_id":"...","config":{...ModelConfig...},"behavior_ref":"...",
 "seed":42,"steps":200,"params":{...},"collect_metrics":[...],
 "trace_level":"key","output_dir":"<abm/.../runs dir>",
 "space_sample_rate":5,"space_agent_cap":20000,"snapshot_encoding":"binary"}
{"cmd":"stop","run_id":"..."}      // 协作式中断
{"cmd":"shutdown"}                  // 仅常驻 worker
```

**帧（内核 → server，stdout 每行一条 JSON；二进制帧见 §5）**

```jsonc
{"frame":"run_meta","run_id":"...","seed":42,"steps":200,"kernel_version":"...","space":{"sample_rate":5,"agent_cap":20000}}
{"frame":"tick","run_id":"...","tick":12,"metrics":{"infected":0.31,...}}
{"frame":"mechanism_fired","run_id":"...","tick":12,"mechanism_id":"infect","agent_ids":[...]} // 可按需聚合/抽样
{"frame":"snapshot","run_id":"...","tick":10,"space":"grid","encoding":"json","payload":{...}}  // 或二进制
{"frame":"run_done","run_id":"...","record":{...RunRecord...}}
{"frame":"error","run_id":"...","type":"...","message":"...","traceback_ref":"..."}
{"frame":"log","level":"info","message":"..."}   // 诊断, 不入业务流
```

`worker.py` 实现 = 薄封装 `runner.run_model`：把 `progress` 回调→`tick` 帧、`on_snapshot` 回调→`snapshot` 帧、返回的 `RunRecord`→`run_done` 帧。Trace 落盘仍由内核 `TraceWriter` 完成（server 给定 `output_dir`）。

server 侧解析：照搬 `conversationService` 的 stdout NDJSON reader；按 `frame` 分流 → 控制帧转 WS JSON（`abm_tick`/`abm_run_status`/`abm_run_done`），snapshot 转 WS 二进制帧，`run_done`/`error` 落盘并结算。

## 4. 行为/机制代码的安全边界

`ModelConfig` 描述结构，机制可执行代码来自 `ModelBehavior`（`abm_kernel/behavior.py` 注册表）/ `loader.load_behavior_from_file`。AI 生成机制时：

- 优先**注册式机制**（白名单 `register_behavior`）或受控模板（`abm_kernel/templates.py`），而非任意 `exec`。
- 用 `abm_kernel/validate.py::validate_mechanisms_source` 做静态校验（已存在）。
- 内核进程应在**受限工作目录**运行，环境变量最小化（参考 computer-use 的 `getPythonCommandEnv`）。任意代码执行属高风险，纳入研究模式审批（`conversation-ux.md`）。

## 5. 大规模 snapshot 的二进制编码（可选但推荐）

JSON 化上万 agent 每帧过重。允许内核直接产出二进制 snapshot 帧（详见 `simulation-canvas.md` §4 的帧格式）：

- stdout 难发裸二进制（与 NDJSON 混流）→ 两种做法：
  1. **旁路文件/管道**：snapshot 二进制写入独立 fd（`Bun.spawn` 可加额外管道）或临时 ring 文件，stdout 只发 `{"frame":"snapshot","ref":...}` 指针；server 读后转 WS。
  2. **base64 内联**（实现最简，CPU 略高）：`{"frame":"snapshot","tick":...,"b64":"..."}`，server 解码后转 WS 二进制。MVP 可先用此法，量大再换旁路管道。
- 内核内可加 **delta snapshot**（只发自上帧变化的 cell/node 状态）与 **network 布局预计算**（首帧发坐标，后续只发状态字节）——见 `simulation-canvas.md` §3/§4。

## 6. 允许的内核改动（Boss 已授权优化权限）

可改 `packages/abm-kernel`，但守住其 `AGENTS.md` 约定（零 Web 依赖、Pydantic v2、随机必显式传种子 P1）：

- ✅ 新增 `worker.py` stdio 入口与 NDJSON 帧（本质是把现有回调串起来）。
- ✅ 新增二进制 snapshot 编码、delta snapshot、network 布局预计算 helper（展示派生，不碰 RNG）。
- ✅ 性能：snapshot 构建避免全量重算、`agent_cap`/`sample_rate` 生效路径优化。
- ✅ 补 `[project.scripts]` 暴露 `abm-kernel-worker`，便于 server spawn。
- ⚠️ 改 Trace/RunRecord/SpaceSnapshot/VizSpec **结构** → 视为数据契约变更：先改 Python schema，同步 `architecture.md` §2 的 TS 镜像与本仓库引用，并跑内核测试。
- ❌ 不引入 Web/网络依赖；不破坏确定性（任何随机必经 `model.random`/显式 seed）。

## 7. 打包与运行时

- 开发：server 通过 `uv run --project packages/abm-kernel abm-kernel-worker`（或激活的 venv 内 `python -m abm_kernel.worker`）。运行时探测照搬 `computer-use-python.ts`。
- 打包（Electron）：内核需随包分发的 Python 运行时/venv。沿用 computer-use 的 `~/.claude/.runtime` venv 思路，或专用 `~/.claude/cc-haha/abm/venv`；首次运行按需 `uv sync`。`native` 打包改动走 `bun run check:native`。
- 这是真实的跨语言运行时依赖：**P0 验收必须包含「在干净环境探测/拉起内核成功」的冒烟**，失败要给出明确缺失项（缺 Python / 缺依赖）。

## 8. 验证

- 内核：`cd packages/abm-kernel && uv run pytest`（含新 `worker.py` 的 NDJSON 往返测试：喂 `run` 命令 → 断言帧序列与确定性）。
- server：`bun run check:server` + `AbmRunService` 的 spawn/stream/cancel/crash 用例（可对一个 echo/stub worker 脚本做单测，避免每次起真内核）。
