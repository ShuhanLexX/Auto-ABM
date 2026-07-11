# P1 实施计划 · 仿真工作区（Interface + 画布 + Trace）

> 上游：`../roadmap.md` P1、`../simulation-canvas.md`、`../architecture.md` §4、`../kernel-bridge.md` §5。
> **前置**：P0 已打通 run→指标曲线与独立 WS 通道。本阶段攻克**大规模实时渲染**与二进制帧链路。

**目标**：单 Simulation 工作区可交互——调参/Run/Reset/实时曲线；grid 与 network 大规模（≥1e4 agent）流畅渲染；Trace 时间轴擦洗与回放。

**架构**：内核产出二进制 snapshot（base64 内联起步）；server 经 `/ws/abm` 转发二进制帧；桌面 Worker 解码 → 分层渲染器（grid=ImageData，network=WebGL 实例化）；渲染节拍与仿真解耦 + 背压丢帧。

**技术栈**：Canvas2D `ImageData`、WebGL2/`regl`、Web Worker(`Transferable`)、二进制 `ArrayBuffer`/`DataView`。

**验证强度**：帧编解码纯函数单测 + 性能 HUD 基线 1 次 + 端到端冒烟；不跑 `verify`/coverage。

---

## 文件结构总览

```text
packages/abm-kernel/src/abm_kernel/space_binary.py   # 新增: snapshot -> 紧凑二进制 + delta + 调色板
packages/abm-kernel/src/abm_kernel/worker.py         # 改: snapshot_encoding=binary 时发 base64 帧
packages/abm-kernel/tests/test_space_binary.py       # 新增

src/server/abm/wsEvents.ts        # 改: 增 abm_meta(JSON, 首帧元数据); 二进制帧透传
src/server/abm/wsAbmHandler.ts    # 改: snapshot 帧 -> ws.send(ArrayBuffer); 元数据走 JSON
src/server/abm/abmRunService.ts   # 改: 透传 space_sample_rate/agent_cap, base64->bytes

desktop/src/abm/canvas/
  frameFormat.ts        # 新增: 二进制帧/元数据的编解码常量与类型 (与内核对齐)
  frameWorker.ts        # 新增: Web Worker, 解码+维护状态buffer+应用delta
  paletteLUT.ts         # 新增: state->颜色索引->RGBA
  GridRasterRenderer.ts # 新增: Canvas2D ImageData 栅格
  PointsGLRenderer.ts   # 新增: WebGL 实例化点 + 边批 + 相机
  SimulationCanvas.tsx  # 新增: 统一组件, 按 space 选渲染器 + 缩放/平移/拾取
  frameClock.ts         # 新增: rAF 渲染节拍 + 有界帧队列(丢帧)
desktop/src/abm/canvas/*.test.ts                      # 新增: 解码/调色板/delta 纯函数测试

desktop/src/abm/trace/
  TraceTimeline.tsx     # 新增: 时间轴擦洗 + 事件/机制标注
  traceClient.ts        # 新增: GET /api/abm/runs/:rid/trace?from=&to=
desktop/src/abm/stores/selectionStore.ts              # 新增: 画布<->Trace 联动选区
src/server/abm/api.ts   # 改: GET /api/abm/runs/:rid/trace 区间读 trace.jsonl
desktop/src/abm/AbmWorkbench.tsx                      # 改: 加 Interface/Canvas/Trace 三区
```

---

## Task 1：内核二进制 snapshot 编码

**Files**
- Create: `packages/abm-kernel/src/abm_kernel/space_binary.py`
- Modify: `packages/abm-kernel/src/abm_kernel/worker.py`
- Create: `packages/abm-kernel/tests/test_space_binary.py`

定义紧凑编码（与桌面 `frameFormat.ts` 必须字节对齐，见 `../simulation-canvas.md` §4）：

```python
# space_binary.py
# 元数据(一次): palette(state->index), network: node 坐标Float32 + 边Uint32; grid: width/height
# 每帧: header(kind:u8, tick:u32, count:u32) + 负载
#   grid 全量:   Uint8 state[width*height]
#   points 全量: Uint8 state[N]   (坐标在元数据)
#   delta:       (index:u32, state:u8)*count
import struct
KIND_GRID_FULL, KIND_POINTS_FULL, KIND_DELTA = 1, 2, 3

def encode_full_points(tick: int, states: list[int]) -> bytes:
    head = struct.pack("<BII", KIND_POINTS_FULL, tick, len(states))
    return head + bytes(states)  # 每 state 一个字节(已映射为索引)

def encode_delta(tick: int, changes: list[tuple[int, int]]) -> bytes:
    head = struct.pack("<BII", KIND_DELTA, tick, len(changes))
    body = b"".join(struct.pack("<IB", idx, st) for idx, st in changes)
    return head + body
# encode_full_grid 同理; build_meta(model) 产出调色板/坐标/边
```

`worker.py`：当 `snapshot_encoding=='binary'`，把上面 bytes 经 base64 内联帧发出（`../kernel-bridge.md` §5：stdout 难发裸二进制，P1 用 base64，量极大再换旁路管道）：

```python
import base64
def on_snapshot_binary(s, prev_states, palette):
    raw = build_binary_frame(s, prev_states, palette)  # 选 full/delta
    _emit({"frame": "snapshot", "run_id": rid, "tick": s.tick, "encoding": "b64", "b64": base64.b64encode(raw).decode()})
# run 开始先发一次 {"frame":"meta", "palette":..., "layout":...}
```

- [ ] 写 `space_binary.py`（full + delta + meta）；状态值→索引映射稳定（排序后定序）。
- [ ] `worker.py` 接 `snapshot_encoding`、首帧发 `meta`、后续发 `snapshot(b64)`；delta 优先、变化比例高回退 full。
- [ ] 测试：编码→（在 Python 内）解码 round-trip 一致；delta 应用后等于 full。
- [ ] `uv run pytest tests/test_space_binary.py -q` → PASS。
- [ ] 提交：`feat(kernel): binary snapshot encoding (+delta, palette, layout)`。

---

## Task 2：server 透传二进制帧

**Files**
- Modify: `src/server/abm/wsEvents.ts`、`src/server/abm/wsAbmHandler.ts`、`src/server/abm/abmRunService.ts`

- `abmRunService`：收到 `frame:'meta'` → 缓存并以 JSON `abm_meta` 下发；收到 `frame:'snapshot'(b64)` → `Buffer.from(b64,'base64')` → 经回调以**二进制**下发。
- `wsAbmHandler`：`abm_meta`/`abm_tick`/`abm_run_*` → `ws.send(JSON.stringify)`；snapshot bytes → `ws.send(arrayBuffer)`。
- `wsEvents.ts`：加 `{ type:'abm_meta', runId, palette, layout? }`。

- [ ] 改三文件；确认二进制与 JSON 在同一 socket 共存（客户端按 `typeof data` 分流）。
- [ ] 提交：`feat(server/abm): relay binary snapshot frames over /ws/abm`。

---

## Task 3：桌面帧格式 + Worker 解码（纯函数优先）

**Files**
- Create: `desktop/src/abm/canvas/frameFormat.ts`、`paletteLUT.ts`、`frameWorker.ts`
- Create: `desktop/src/abm/canvas/frameFormat.test.ts`、`paletteLUT.test.ts`

`frameFormat.ts`：与 `space_binary.py` 同常量（`KIND_*`）+ `decodeFrame(buf: ArrayBuffer): { kind, tick, ... }` + `applyDelta(state: Uint8Array, deltas)`。这些是**纯函数**，先写测试。

```ts
// frameFormat.test.ts
it('decodes a points-full frame', () => {
  const buf = makePointsFull(5, [0, 1, 2, 1])      // 测试辅助构造
  const f = decodeFrame(buf)
  expect(f.kind).toBe(KIND_POINTS_FULL); expect(f.tick).toBe(5)
  expect(Array.from(f.state)).toEqual([0, 1, 2, 1])
})
it('applies delta onto state buffer', () => {
  const s = new Uint8Array([0, 0, 0, 0]); applyDelta(s, [[1, 3], [3, 2]])
  expect(Array.from(s)).toEqual([0, 3, 0, 2])
})
```

`frameWorker.ts`：Web Worker。持有 `state: Uint8Array` + 元数据；`onmessage`：二进制→`decodeFrame`→full 替换/delta 应用→把最新 `state`（`Transferable` 复制或共享）`postMessage` 给主线程渲染器。

- [ ] 写 `frameFormat.ts`/`paletteLUT.ts` + 测试 → PASS（`cd desktop && bun run test src/abm/canvas`）。
- [ ] 写 `frameWorker.ts`。
- [ ] 提交：`feat(desktop/abm): binary frame decode + worker`。

---

## Task 4：Grid 栅格渲染器（ImageData）

**Files**
- Create: `desktop/src/abm/canvas/GridRasterRenderer.ts`

NetLogo patch 法：离屏 canvas 尺寸 = 网格，`state→palette→RGBA` 写入 `ImageData`，`putImageData`，再 `drawImage` 放大到显示 canvas，`imageSmoothingEnabled=false`。

```ts
export class GridRasterRenderer {
  constructor(private display: HTMLCanvasElement, private w: number, private h: number) {}
  private off = new OffscreenCanvas(this.w, this.h)
  private img = new ImageData(this.w, this.h)
  render(state: Uint8Array, lut: Uint32Array /*index->RGBA*/) {
    const px = new Uint32Array(this.img.data.buffer)
    for (let i = 0; i < state.length; i++) px[i] = lut[state[i]]
    this.off.getContext('2d')!.putImageData(this.img, 0, 0)
    const ctx = this.display.getContext('2d')!; ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.off, 0, 0, this.display.width, this.display.height)
  }
}
```

- [ ] 写渲染器；跑通 grid 1e4（100×100）。
- [ ] 提交：`feat(desktop/abm): grid raster renderer`。

---

## Task 5：Network/点云 WebGL 实例化渲染器

**Files**
- Create: `desktop/src/abm/canvas/PointsGLRenderer.ts`
- 评估依赖：优先 `regl`（薄）；如不引库则裸 WebGL2 `drawArraysInstanced`。新增依赖按 `AGENTS.md`（最简必要）。

要点：节点坐标来自 `abm_meta.layout`（一次上传为 buffer）；每帧只更新 per-instance `state` 属性；颜色在 shader 内由 `state→palette` LUT 取（uniform sampler 或 uniform 数组）。边用 `LINES` 批一次性画。相机用正交投影 uniform，支持缩放/平移；视口裁剪。

- [ ] 写渲染器：实例化点 + 边批 + 相机 uniform。
- [ ] 跑通 network 1e4 节点 / 5e4 边。
- [ ] 提交：`feat(desktop/abm): webgl instanced points/network renderer`。

---

## Task 6：渲染节拍解耦 + 背压丢帧

**Files**
- Create: `desktop/src/abm/canvas/frameClock.ts`、`desktop/src/abm/canvas/SimulationCanvas.tsx`

`frameClock.ts`：维护「最新待渲染状态」单槽（或 ≤2 帧有界队列）；`requestAnimationFrame` 只渲染最新；Worker 推帧快于 rAF 时丢中间帧（展示是采样，丢帧不改 Run，P1）。
`SimulationCanvas.tsx`：按 `abm_meta.space` 选 `GridRasterRenderer`/`PointsGLRenderer`；接 `abmSocket` 二进制帧→Worker→frameClock→render；缩放/平移/点选交互；超阈值（如 >5e4）提示开启 `agent_cap`/heatmap。

- [ ] 写 `frameClock.ts`（含「快推慢渲丢帧」单测：推 10 帧只渲最后 1 帧的最新态）。
- [ ] 写 `SimulationCanvas.tsx`，接入 socket→worker→render 全链路。
- [ ] 提交：`feat(desktop/abm): decoupled render clock + simulation canvas`。

---

## Task 7：Trace 时间轴 + 区间读取 + 回放

**Files**
- Create: `desktop/src/abm/trace/traceClient.ts`、`desktop/src/abm/trace/TraceTimeline.tsx`、`desktop/src/abm/stores/selectionStore.ts`
- Modify: `src/server/abm/api.ts`（`GET /api/abm/runs/:rid/trace?from=&to=`）

server：按行读 `traces/<rid>.jsonl`，按 tick 过滤返回 `tick_metrics`/`event`/`mechanism_fired`/`space_snapshot`（回放用最近 snapshot）。
`TraceTimeline`：时间轴擦洗（拖动 tick）→ `selectionStore.setTick` → 画布 seek 到该 tick 最近 snapshot 帧重绘（replay 复用同渲染器）；事件/机制触发在轴上打点。
`selectionStore`：`{ runId, tick, selectedAgentIds }`，协调 canvas↔trace（为 P2 解释联动预留）。

- [ ] server 加 trace 区间 endpoint（行式读取，勿全量载入大文件）。
- [ ] 写 timeline + selectionStore + 回放 seek。
- [ ] 提交：`feat(desktop/abm): trace timeline scrub + replay + selection store`。

---

## Task 8：Interface 升级 + 工作区三区布局

**Files**
- Modify: `desktop/src/abm/AbmWorkbench.tsx`、`desktop/src/abm/components/RunPanel.tsx`

把 P0 的最简 RunPanel 扩成 Interface（参数滑块/输入、seed/步数、Run/Reset、`space_sample_rate`/`agent_cap` 控件），工作区布局：Interface + 画布 + Trace + 指标曲线（致密工具型 UI，沿用 design token）。

- [ ] 升级 Interface 控件 + 三区布局。
- [ ] 提交：`feat(desktop/abm): interactive interface + workspace layout`。

---

## Task 9（可选，建议）：常驻 worker 降启动延迟

**Files**
- Modify: `packages/abm-kernel/src/abm_kernel/worker.py`、`src/server/abm/kernelProcess.ts`、`abmRunService.ts`

把「一次性 spawn」升级为「per-simulation 常驻进程」，连续 Run/Reset 不重启进程（`../kernel-bridge.md` §2 模式 B）。若 P1 交互延迟可接受可后置到 P3。

- [ ] worker 支持多条 `run`/`stop` 命令循环；service 复用进程。
- [ ] 提交：`perf(kernel): persistent worker for interactive runs`。

---

## P1 验收（含性能基线，`../simulation-canvas.md` §7）

- [ ] grid 1e4 cell：60fps，主线程每帧 <4ms（性能 HUD 读数）。
- [ ] network 1e4 节点 / 5e4 边：≥30fps 平移缩放流畅；1e5 节点可用并自动建议 `agent_cap`/heatmap。
- [ ] delta 帧（1e4 节点 1% 变化）<1KB/帧（WS 帧大小日志）。
- [ ] 渲染落后时丢帧而 Run 结果不变；同 seed 两次 Run `metrics_summary` 一致。
- [ ] Trace 擦洗能 seek 到任意 tick 最近 snapshot 并正确重绘。

## P1 验证（已调低）

- 内核：`uv run pytest tests/test_space_binary.py -q`
- desktop 纯函数：`cd desktop && bun run test src/abm/canvas`（解码/调色板/delta/丢帧）
- 端到端 + 性能 HUD：用内置「生成 N agent 基准 ModelConfig」手测一次，记录 fps/帧大小
- 不跑 `verify`/coverage；`bun run check:desktop` 仅在本阶段收尾跑一次确认构建通过。

## 风险与回滚

- **WebGL 兼容/上下文丢失**：`PointsGLRenderer` 处理 `webglcontextlost`；无 WebGL2 时降级（grid 仍可用；network 退化为抽样 Canvas2D 点）。
- **base64 帧 CPU 开销**：极大规模（>1e5 高频）再切旁路二进制管道（`../kernel-bridge.md` §5），接口不变。
- 回滚：canvas/trace 为新增模块，删除即恢复 P0 状态。
