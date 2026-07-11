# P0 实施计划 · 内核桥 + 领域骨架

> 上游：`../roadmap.md` P0、`../architecture.md`、`../kernel-bridge.md`。本文是可执行任务清单。
> **执行约定**：每个 Task 自成可提交单元；步骤用 `- [ ]`。先用内核自带固定 ModelConfig（如 SIR/Schelling），**本阶段不接自然语言**。

**目标**：给定固定 `ModelConfig`，桌面点 Run → server 拉起 Python 内核 → 跑出确定性 Run → 桌面看到实时指标曲线 → `RunRecord` + `trace.jsonl` 落盘且可复现。

**架构**：内核新增 stdio NDJSON `worker.py`；server 新增 `src/server/abm/`（spawn + 流式 + REST + 独立 WS 通道 + 持久化）；桌面新增 `desktop/src/abm/`（store + api + socket + 最简 UI）。

**技术栈**：Python(Mesa/pydantic)、Bun(`Bun.spawn`/`Bun.serve`)、React/Zustand、WS(JSON 控制)。

**验证强度（已按要求调低）**：每阶段聚焦 1 条端到端冒烟 + 关键纯函数单测；不在 P0 跑 `bun run verify`/coverage。

---

## 文件结构总览

```text
packages/abm-kernel/src/abm_kernel/worker.py        # 新增: stdio NDJSON 入口
packages/abm-kernel/tests/test_worker.py            # 新增: 往返测试
packages/abm-kernel/pyproject.toml                  # 改: [project.scripts] 暴露 worker

src/server/abm/
  types.ts            # 新增: ModelConfig/RunRecord/帧 的 TS 镜像
  storagePaths.ts     # 新增: ~/.claude/cc-haha/abm 路径
  abmStore.fs.ts      # 新增: 项目/仿真/run 读写 (原子写/可恢复读)
  kernelProcess.ts    # 新增: 单个内核子进程封装 (spawn + NDJSON 解析)
  abmRunService.ts    # 新增: run 生命周期 + 帧分发
  wsEvents.ts         # 新增: ABM WS 控制消息类型
  wsAbmHandler.ts     # 新增: /ws/abm/:runId Bun WS handler
  api.ts              # 新增: handleAbmApi(req,url,segments)
src/server/router.ts  # 改: case 'abm'
src/server/index.ts   # 改: /ws/abm/:runId upgrade 分支 + 关闭时清理内核
src/server/abm/__tests__/abmRunService.test.ts      # 新增: 用 stub worker

desktop/src/abm/
  types.ts            # 新增: 镜像 server wsEvents + RunRecord
  api/abmClient.ts    # 新增: REST 调用 (复用 api/client.ts)
  api/abmSocket.ts    # 新增: /ws/abm WS 管理 (binaryType=arraybuffer)
  stores/abmStore.ts  # 新增: run 状态 + 指标序列
  components/RunPanel.tsx        # 新增: Run/Reset + 参数最简表单
  components/MetricChart.tsx     # 新增: 实时曲线
  AbmWorkbench.tsx              # 新增: 工作区容器 (P0 只放 RunPanel+MetricChart)
desktop/src/abm/stores/abmStore.test.ts             # 新增
```

---

## Task 0：脚手架与命名空间

**Files**
- Create: `src/server/abm/.keep`、`desktop/src/abm/.keep`（占位，确保目录与 import 路径成立）

- [ ] 建立 `src/server/abm/` 与 `desktop/src/abm/` 目录。
- [ ] 确认 `packages/abm-kernel` 可本地运行：`cd packages/abm-kernel && uv sync --all-extras && uv run pytest`（应已通过）。

---

## Task 1：内核 stdio worker（NDJSON）

**Files**
- Create: `packages/abm-kernel/src/abm_kernel/worker.py`
- Modify: `packages/abm-kernel/pyproject.toml`（`[project.scripts]`）

把现有 `simulate(... progress=, on_snapshot=)` 串成「读 stdin 命令 → 写 stdout 帧」。P0 snapshot 用 JSON（二进制留到 P1）。

```python
# worker.py — 逐行读 stdin JSON 命令, 逐行写 stdout JSON 帧
import sys, json
from abm_kernel.runner import simulate
from abm_kernel.schemas import parse_model_config

def _emit(obj): sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n"); sys.stdout.flush()

def _run(cmd):
    rid = cmd["run_id"]
    config = parse_model_config(cmd["config"])
    _emit({"frame": "run_meta", "run_id": rid, "seed": cmd["seed"], "steps": cmd["steps"]})
    def progress(tick, total, metrics): _emit({"frame": "tick", "run_id": rid, "tick": tick, "metrics": metrics})
    def on_snapshot(s): _emit({"frame": "snapshot", "run_id": rid, "tick": s.tick, "space": s.space, "encoding": "json", "payload": s.payload})
    try:
        record = simulate(config, seed=cmd["seed"], steps=cmd["steps"], output_dir=cmd["output_dir"],
                          params=cmd.get("params"), trace_level=cmd.get("trace_level", "key"),
                          run_id=rid, progress=progress,
                          space_sample_rate=cmd.get("space_sample_rate", 0),
                          space_agent_cap=cmd.get("space_agent_cap"), on_snapshot=on_snapshot)
        _emit({"frame": "run_done", "run_id": rid, "record": record.model_dump()})
    except Exception as exc:  # 单 run 失败不杀进程
        _emit({"frame": "error", "run_id": rid, "type": type(exc).__name__, "message": str(exc)})

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        cmd = json.loads(line)
        if cmd.get("cmd") == "run": _run(cmd)
        elif cmd.get("cmd") == "shutdown": break

if __name__ == "__main__": main()
```

> 注：`behavior` 解析（自定义机制）P0 先依赖内核内置/注册式 behavior；自然语言生成机制在 P2。若固定 ModelConfig 需要 behavior，用 `loader.load_behavior_from_file` 或内置注册，命令里加 `behavior_ref`。

```toml
# pyproject.toml 追加
[project.scripts]
abm-kernel-worker = "abm_kernel.worker:main"
```

- [ ] 写 `worker.py`。
- [ ] `pyproject.toml` 加 `[project.scripts]`，`uv sync` 后确认 `uv run abm-kernel-worker` 能启动（等待 stdin）。
- [ ] 提交：`feat(kernel): add stdio NDJSON worker entry`。

---

## Task 2：内核 worker 往返测试（确定性）

**Files**
- Create: `packages/abm-kernel/tests/test_worker.py`

```python
import json, subprocess, sys, tempfile
from pathlib import Path

def _cfg():  # 复用内核测试里已有的最小可运行 ModelConfig 构造法
    from tests.helpers import minimal_sir_config  # 若无则内联一个最小 config dict
    return minimal_sir_config()

def test_worker_run_emits_frames_and_is_deterministic(tmp_path):
    cmd = {"cmd": "run", "run_id": "r1", "config": _cfg(), "seed": 7, "steps": 5,
           "output_dir": str(tmp_path), "trace_level": "key"}
    proc = subprocess.run([sys.executable, "-m", "abm_kernel.worker"],
                          input=json.dumps(cmd) + "\n", text=True, capture_output=True)
    frames = [json.loads(l) for l in proc.stdout.splitlines() if l.strip()]
    kinds = [f["frame"] for f in frames]
    assert kinds[0] == "run_meta" and kinds[-1] == "run_done"
    assert "tick" in kinds
    done = frames[-1]["record"]
    assert done["seed"] == 7 and done["status"] == "completed"
```

- [ ] 写测试（如内核已有 config fixture 优先复用；否则内联最小 config）。
- [ ] 运行：`cd packages/abm-kernel && uv run pytest tests/test_worker.py -q` → PASS。
- [ ] 提交：`test(kernel): worker NDJSON round-trip`。

---

## Task 3：server 端持久化骨架

**Files**
- Create: `src/server/abm/storagePaths.ts`、`src/server/abm/types.ts`、`src/server/abm/abmStore.fs.ts`

`types.ts`：镜像内核 schema（注释指回 Python 源），P0 只需 `ModelConfig`(可宽松 `Record`)、`RunRecord`、`AbmSimulation`、`AbmProject`。

```ts
// src/server/abm/types.ts — mirror of packages/abm-kernel/src/abm_kernel/schemas/*
export interface RunRecord {            // mirror run.py::RunRecord
  id: string; model_id: string; model_version: string; kernel_version: string
  seed: number; parameters: Record<string, unknown>; steps: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at?: string; finished_at?: string
  trace_path?: string; result_path?: string
  metrics_summary: Record<string, Record<string, number>>
  error?: { type: string; message: string } | null
}
export interface AbmSimulation { id: string; projectId: string; name: string; modelVersion: string; interface: { seed: number; steps: number; params: Record<string, unknown> }; createdAt: string }
export interface AbmProject { id: string; name: string; researchQuestion?: string; createdAt: string }
export const ABM_STORAGE_VERSION = 1
```

`storagePaths.ts`：基于 `CLAUDE_CONFIG_DIR || ~/.claude`，按 `../architecture.md` §5 布局给出路径 helper（`projectsIndexFile()`, `simulationDir(pid,sid)`, `runFile(pid,sid,rid)`, `traceDir(...)`）。

`abmStore.fs.ts`：用底座现成 helper —— 写用 `persistentStorageMigrations.ts::writeJsonFile`（原子写）模式，读用 `services/recoverableJsonFile.ts::readRecoverableJsonFile`。函数：`createProject/getProject/listProjects/createSimulation/getSimulation/putRunRecord/getRunRecord`。每个写入对象带 `schemaVersion: ABM_STORAGE_VERSION`。

- [ ] 写三个文件；读写复用底座 helper（勿自造 fs 逻辑）。
- [ ] 在 `src/server/services/persistentStorageMigrations.ts` 注册一个 no-op/初始化 ABM 迁移占位（建目录、写 `schemaVersion`），保证 `check:persistence-upgrade` 认得 ABM 子树。
- [ ] 提交：`feat(server/abm): storage paths + json persistence skeleton`。

---

## Task 4：单内核进程封装

**Files**
- Create: `src/server/abm/kernelProcess.ts`

封装一个内核子进程：`Bun.spawn` + 写 stdin 命令 + 逐行解析 stdout NDJSON 帧 → 回调。运行时探测复用 `src/server/api/computer-use-python.ts`（`detectPythonRuntime`）。

```ts
// src/server/abm/kernelProcess.ts
import { detectPythonRuntime } from '../api/computer-use-python'

export type KernelFrame =
  | { frame: 'run_meta'; run_id: string; seed: number; steps: number }
  | { frame: 'tick'; run_id: string; tick: number; metrics: Record<string, number> }
  | { frame: 'snapshot'; run_id: string; tick: number; space: string; encoding: string; payload: unknown }
  | { frame: 'run_done'; run_id: string; record: import('./types').RunRecord }
  | { frame: 'error'; run_id: string; type: string; message: string }

export async function runKernel(cmd: object, onFrame: (f: KernelFrame) => void): Promise<void> {
  const py = await detectPythonRuntime()
  const proc = Bun.spawn([py.command, '-m', 'abm_kernel.worker'], {
    cwd: 'packages/abm-kernel', // 或解析到打包后的内核路径
    env: { ...process.env, PYTHONPATH: 'packages/abm-kernel/src' },
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  })
  proc.stdin.write(JSON.stringify(cmd) + '\n'); proc.stdin.write(JSON.stringify({ cmd: 'shutdown' }) + '\n'); proc.stdin.flush()
  const reader = proc.stdout.getReader(); const dec = new TextDecoder(); let buf = ''
  for (;;) {
    const { value, done } = await reader.read(); if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
      if (line) onFrame(JSON.parse(line) as KernelFrame)
    }
  }
  await proc.exited
}
```

- [ ] 写 `kernelProcess.ts`（NDJSON 行缓冲解析照搬 `conversationService` 的 reader 思路）。
- [ ] 提交：`feat(server/abm): kernel subprocess wrapper`。

---

## Task 5：AbmRunService（生命周期 + 帧分发）

**Files**
- Create: `src/server/abm/abmRunService.ts`

```ts
// 单例 (照搬底座 service 单例模式)
class AbmRunService {
  private listeners = new Map<string, Set<(f: KernelFrame) => void>>() // runId -> sinks
  onFrame(runId: string, cb: (f: KernelFrame) => void) { /* add/remove */ }
  async startRun(p: { projectId: string; simId: string; runId: string; config: object; seed: number; steps: number; params?: object; spaceSampleRate?: number }) {
    const outputDir = traceDir(p.projectId, p.simId) // server 决定落盘位置 = architecture §5
    await putRunRecord(/* pending */)
    void runKernel({ cmd: 'run', run_id: p.runId, config: p.config, seed: p.seed, steps: p.steps,
                     params: p.params, output_dir: outputDir, space_sample_rate: p.spaceSampleRate ?? 0 },
      (f) => { this.dispatch(p.runId, f); if (f.frame === 'run_done') void putRunRecord(f.record) })
  }
}
export const abmRunService = new AbmRunService()
```

- [ ] 写服务：`startRun`、`onFrame`、内部 `dispatch`；`run_done`/`error` 落盘 RunRecord。
- [ ] 在 `src/server/index.ts` 的关闭流程（`stopServerRuntimeForShutdown`）注册 kill 活跃内核进程（类比 `conversationService.stopAllSessionsAndWait`）。
- [ ] 提交：`feat(server/abm): AbmRunService run lifecycle + frame fanout`。

---

## Task 6：ABM WS 通道 `/ws/abm/:runId`

**Files**
- Create: `src/server/abm/wsEvents.ts`、`src/server/abm/wsAbmHandler.ts`
- Modify: `src/server/index.ts`

```ts
// wsEvents.ts — ABM 控制消息 (P0 全 JSON; 二进制帧 P1)
export type AbmServerMessage =
  | { type: 'abm_run_status'; runId: string; state: 'running' | 'completed' | 'failed'; tick?: number; totalSteps?: number }
  | { type: 'abm_tick'; runId: string; tick: number; metrics: Record<string, number> }
  | { type: 'abm_run_done'; runId: string; record: RunRecord }
  | { type: 'abm_error'; runId: string; message: string }
```

`wsAbmHandler.ts`：Bun WS handler（`open/message/close`）。`open` 时按 `runId` 订阅 `abmRunService.onFrame`，把 KernelFrame 映射成 `AbmServerMessage` 用 `ws.send(JSON.stringify(...))`；`close` 退订。

`index.ts`：在现有 `/ws/:sessionId` upgrade 前加分支：path 匹配 `^/ws/abm/([\w-]{1,64})$` → `server.upgrade(req, { data: { channel: 'abm', runId } })`，websocket handler 路由到 `wsAbmHandler`。鉴权复用现成判断。

- [ ] 写 `wsEvents.ts`、`wsAbmHandler.ts`。
- [ ] 改 `index.ts`：upgrade 分支 + websocket 顶层按 `data.channel` 分流到 `wsAbmHandler`。
- [ ] 提交：`feat(server/abm): dedicated /ws/abm channel`。

---

## Task 7：REST `/api/abm/*`（最小集）

**Files**
- Create: `src/server/abm/api.ts`
- Modify: `src/server/router.ts`

```ts
// api.ts — handleAbmApi(req,url,segments); segments=['api','abm',sub,...]
// P0 路由:
//   POST /api/abm/projects                 -> createProject
//   GET  /api/abm/projects                 -> listProjects
//   POST /api/abm/projects/:pid/simulations-> createSimulation (P0 可塞固定 ModelConfig)
//   POST /api/abm/simulations/:sid/runs    -> 生成 runId, abmRunService.startRun, 返回 { runId }
//   GET  /api/abm/runs/:rid                 -> getRunRecord
```

用 `ApiError`/`errorResponse`（`middleware/errorHandler.ts`）。`router.ts` 加 `case 'abm': return handleAbmApi(req,url,segments)`。

- [ ] 写 `api.ts`，方法/子资源分派照搬 `src/server/api/sessions.ts`。
- [ ] `router.ts` 注册 `case 'abm'`。
- [ ] 提交：`feat(server/abm): minimal /api/abm REST`。

---

## Task 8：server 集成测试（stub worker）

**Files**
- Create: `src/server/abm/__tests__/abmRunService.test.ts`、`src/server/abm/__tests__/stubWorker.ts`

`stubWorker.ts`：一个 Bun/Node 脚本，读 stdin 命令后输出固定 NDJSON 帧序列（run_meta→tick×3→run_done），让测试不依赖真实 Python。`kernelProcess` 留一个可注入的命令覆盖（env `ABM_KERNEL_CMD`）以便指向 stub。

- [ ] `kernelProcess.ts` 支持 `process.env.ABM_KERNEL_CMD` 覆盖默认 `python -m abm_kernel.worker`。
- [ ] 写 stub + 测试：`startRun` → 收到 `tick` 与 `run_done`，RunRecord 落盘。
- [ ] 运行：`bun test src/server/abm` → PASS。
- [ ] 提交：`test(server/abm): run service with stub worker`。

---

## Task 9：桌面 store + api + socket

**Files**
- Create: `desktop/src/abm/types.ts`、`desktop/src/abm/api/abmClient.ts`、`desktop/src/abm/api/abmSocket.ts`、`desktop/src/abm/stores/abmStore.ts`
- Create: `desktop/src/abm/stores/abmStore.test.ts`

`types.ts`：镜像 `src/server/abm/wsEvents.ts` + `RunRecord`。
`abmClient.ts`：用 `desktop/src/api/client.ts` 的 `api.post/get` 包 `createSimulation`、`startRun`、`getRun`。
`abmSocket.ts`：仿 `desktop/src/api/websocket.ts`，`connect(runId)` 设 `ws.binaryType='arraybuffer'`，`onmessage` 按 `typeof data`（P0 只有 string）解析 `AbmServerMessage`，回调进 store。
`abmStore.ts`（Zustand）：`runs: Record<runId, { state, ticks: {tick,metrics}[], record? }>`；action `startRun`、`ingest(msg)`。

```ts
// abmStore.test.ts 关键断言
it('ingests tick frames into a series', () => {
  const s = useAbmStore.getState()
  s.ingest({ type: 'abm_tick', runId: 'r1', tick: 1, metrics: { infected: 0.1 } })
  s.ingest({ type: 'abm_tick', runId: 'r1', tick: 2, metrics: { infected: 0.2 } })
  expect(useAbmStore.getState().runs['r1'].ticks).toHaveLength(2)
})
```

- [ ] 写四个文件 + store 单测。
- [ ] 运行：`cd desktop && bun run test src/abm` → PASS。
- [ ] 提交：`feat(desktop/abm): store, api client, ws socket`。

---

## Task 10：桌面最简工作区 UI

**Files**
- Create: `desktop/src/abm/components/RunPanel.tsx`、`desktop/src/abm/components/MetricChart.tsx`、`desktop/src/abm/AbmWorkbench.tsx`
- Modify: 挂载点（复用 workbench panel 或临时加一个路由/标签，最小侵入）

`RunPanel`：seed/steps 输入 + Run 按钮 → `abmClient.startRun` → `abmSocket.connect(runId)`。
`MetricChart`：读 `abmStore.runs[runId].ticks`，画一条折线（P0 可用 SVG/canvas 折线，先不引图库）。
`AbmWorkbench`：左 RunPanel，右 MetricChart。挂载到一个可达入口（不破坏现有布局）。

- [ ] 写组件，沿用现有设计 token（`desktop/src/theme/globals.css` 变量）。
- [ ] 提交：`feat(desktop/abm): minimal run panel + live metric chart`。

---

## P0 验收（端到端冒烟）

- [ ] 启动 server（`SERVER_PORT=3456 bun run src/server/index.ts`）+ 桌面 dev。
- [ ] 点 Run（固定 ModelConfig）→ 指标曲线实时增长 → 完成显示 RunRecord。
- [ ] `~/.claude/cc-haha/abm/.../runs/<rid>.json` 与 `.../traces/<rid>.jsonl` 存在。
- [ ] 同 seed+参数跑两次，`metrics_summary` 完全一致（确定性 P1）。
- [ ] 干净环境冒烟：无 Python 时 `startRun` 返回明确「缺 Python/依赖」错误，不崩 server。

## P0 验证（已调低）

- 内核：`cd packages/abm-kernel && uv run pytest tests/test_worker.py -q`
- server：`bun test src/server/abm`（stub worker）
- desktop：`cd desktop && bun run test src/abm`
- 手动端到端冒烟（上面验收）一次即可；**P0 不跑** `bun run verify`/coverage。
- 持久化：`bun run check:persistence-upgrade`（因新增 ABM 子树迁移占位）。

## 风险与回滚

- **Python 运行时**：开发机需可用 Python+`uv sync` 后的内核环境；打包分发留到 P1/native。回滚=删 `src/server/abm`、`desktop/src/abm`、`router.ts`/`index.ts` 两处分支与内核 `worker.py`，互不影响底座。
- **behavior 来源**：P0 固定 ModelConfig 若需自定义机制，先用内置/注册式，勿提前做任意代码执行（留 P2 + 审批）。
