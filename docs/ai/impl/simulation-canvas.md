# 仿真画布：大规模实时渲染

> 总纲见 `../IMPLEMENTATION.md`。这是本产品**最高优先的工程难点**：上万 agent 的网格/网络要在浏览器里实时流畅显示。本文给出可落地的渲染架构。

## 0. 结论先行

- **不要**用 DOM/SVG/每 agent 一个组件（千级即崩）。
- **grid** → Canvas2D `ImageData` 栅格 blit（即 NetLogo 的 patch 渲染法），单次 `putImageData`，百万 cell 仍轻松。
- **network / continuous / 超大规模点云** → **WebGL 实例化绘制**（一次 draw call 画全部点），`regl` 或裸 WebGL2 `drawArraysInstanced`。
- 把**仿真节拍**与**渲染节拍**解耦；大帧走**二进制 + Web Worker 解码**；只传**状态字节**，坐标/边只传一次。
- 三道阀门控规模：内核 `sample_rate`（隔帧）/`agent_cap`（抽样）+ 客户端聚合（heatmap 分箱）。

## 1. NetLogo 怎么做（借鉴点）

NetLogo 的 View 是**原生即时模式栅格**：世界 = 固定网格，patch 画进一张离屏位图（每 patch 一个色块），turtle 作为图元画在其上，整屏 blit；没有「每个 agent 一个保留对象」的场景图；3D 用 OpenGL（JOGL）。

**迁移到浏览器的等价物**：
| NetLogo | 浏览器等价 |
| --- | --- |
| patch 位图 blit | Canvas2D `ImageData` + `putImageData`（grid） |
| turtle 图元批绘 | WebGL 实例化（network/continuous） |
| 原生 OpenGL | WebGL2 / WebGPU（后者后续可选） |
| 桌面进程直接持有状态 | 内核子进程算、二进制帧传、Worker 持有 typed array |

核心思想一致：**别为每个 agent 建保留对象；用紧凑数组 + 一次性批量绘制。**

## 2. 渲染分层（按 `SpaceSnapshot.space` 选择）

桌面组件 `desktop/src/abm/canvas/`，统一对外接口 `SimulationCanvas`，内部按空间类型选渲染器：

| 空间 | 渲染器 | 规模目标 | 关键技术 |
| --- | --- | --- | --- |
| `grid` | `GridRasterRenderer`（Canvas2D ImageData） | 1e3–1e6 cell | 状态→调色板→像素；`putImageData` 到离屏 canvas（尺寸=网格），CSS/drawImage 放大，`imageSmoothingEnabled=false` |
| `network` | `PointsGLRenderer`（WebGL 实例化） | 1e3–1e5+ 节点 | 节点=实例化四边形/圆点；边=`LINES` 批；布局**一次算好**缓存；每帧只更状态属性 |
| `continuous` | `PointsGLRenderer` | 1e3–1e6 | 同上，坐标来自连续位置（保留字段，MVP 后置） |
| 超阈值（任意） | `HeatmapRenderer` | 任意 | 服务端/Worker 分箱聚合成密度图，画成 grid 栅格 |

> 接口隔离：`SimulationCanvas` 只认「帧缓冲（typed arrays）+ 空间元数据」，不认 WS/内核细节，便于单测与替换实现。

### 库选型（保持依赖克制）

- grid 不需要库（原生 Canvas2D）。
- WebGL 层推荐 **`regl`**（薄封装、可控）或裸 WebGL2；**不**默认引入重型场景图（three.js）做 2D 点云。
- 大型网络力导向布局如需 GPU：可评估 `@cosmograph/cosmograph`（仓库已有对应 skill），但作为**可选增强**，非 MVP 默认依赖。新增依赖按 `AGENTS.md` 走（最简、必要才加）。

## 3. 渲染节拍与仿真解耦（流畅的关键）

```text
内核(尽力跑) ──帧──> server ──WS──> Worker(解码,持有最新状态buffer) ──transfer──> 渲染(rAF)
```

- 内核按 `space_sample_rate` 隔 N tick 才发一帧 snapshot（已内建，见 `runner.py`）；指标 `tick` 帧轻量可每 tick 发。
- 渲染用 `requestAnimationFrame`，**只画「当前最新状态」**；不追求每个 tick 都画。两帧之间可选线性插值（位置）或直接保持。
- **背压/丢帧**：客户端维护有界帧队列（如最近 1–2 帧）；落后就丢中间帧（展示本就是采样，丢帧不影响 Run，P1）。绝不因渲染慢而阻塞内核/WS。
- 区分 **live** 与 **replay**：replay 从 `trace.jsonl` 的 `space_snapshot` 行读，走同一渲染器与帧格式；时间轴擦洗 = seek 到目标 tick 的最近帧。

## 4. 帧传输协议（二进制，紧凑）

目标：每帧载荷 ≈ O(变化的 agent 数) 字节，而非整图 JSON。

**一次性元数据（run 开始时，JSON 或首个二进制元帧）**
- 调色板：状态值 → 颜色索引（`SpaceSnapshot` 用 primary categorical state 着色，见 `space.py`）。
- network：节点坐标 `Float32Array(x,y * N)`（布局算一次，缓存）、边 `Uint32Array(a,b * E)`。
- grid：`width`/`height`。

**每帧（二进制 ArrayBuffer）**
```text
[header] kind:u8, tick:u32, count:u32
grid 全量:   Uint8 state[width*height]            // 每 cell 一个状态字节(空=保留值)
grid delta:  (index:u32, state:u8) * count        // 仅变化 cell
points 全量: Uint8 state[N]                        // 坐标已在元数据, 每帧只发状态
points delta:(nodeIndex:u32, state:u8) * count     // 仅变化节点
```
- 颜色在渲染端由 `state→palette` LUT 决定；**不传颜色，只传状态字节**。
- delta 优先（多数 ABM 每 tick 仅少量 agent 变化，如 SIR 感染）；变化比例高时回退全量。
- 内核如何产出二进制见 `kernel-bridge.md` §5（旁路管道或 base64 内联）。server→桌面用 WS 二进制帧（`architecture.md` §4）。

**Web Worker**：`desktop/src/abm/canvas/frameWorker.ts` 负责：接收 ArrayBuffer → 应用 delta 到常驻状态 buffer → 把状态 buffer（或可直接上传 GPU 的 typed array）`postMessage`（用 `Transferable` 零拷贝）给渲染器。解码与主线程渲染分离，避免卡 UI。进一步可用 `OffscreenCanvas` 把渲染也搬进 Worker。

## 5. 三道规模阀门（诚实降采样）

1. **`sample_rate`**（时间）：隔 N tick 一帧（内核 `run_meta` 记录）。
2. **`agent_cap`**（空间抽样）：超过上限按确定性顺序截断（内核 `build_space_snapshot` 已实现）。UI 必须显示「显示 N/总 M 的抽样」，不可冒充全量（真实性 P2）。
3. **聚合/heatmap**（视觉）：超大规模时把点云分箱成密度图渲染（grid 栅格法画），保留宏观态势。

阀门是**展示层**手段：永不改变 `RunRecord`/Trace（复现判定只认 seed+参数+版本，`architecture.md` §7）。

## 6. 交互（缩放/平移/选取/联动）

- 缩放平移：grid 用 canvas transform；WebGL 用相机 uniform（投影矩阵），视口裁剪（cull）只画可见区。
- 拾取：WebGL 点选用「ID 颜色离屏拾取」或 CPU 空间索引（网格分桶）。grid 拾取由像素坐标反算 cell。
- **联动**（产品亮点）：画布点选 agent/边 → 触发解释或高亮其 Trace 事件；解释证据卡点 tick → 画布跳到该帧并高亮相关 agent（`conversation-ux.md` §4）。联动用一个轻量 selection store（`desktop/src/abm/stores/`）协调画布 ↔ Trace ↔ 解释，勿耦合进 chatStore。

## 7. 性能预算与验收基线

把性能写成可测目标（`roadmap.md` P1 验收）：

| 规模 | 目标 |
| --- | --- |
| grid 1e4 cell | 60fps 渲染，主线程每帧 < 4ms |
| network 1e4 节点 / 5e4 边 | ≥ 30fps 平移缩放流畅；每帧上传/绘制 < 8ms |
| network 1e5 节点 | 可用（≥ 15fps）+ 自动建议开启 `agent_cap`/heatmap |
| 帧载荷（delta，1e4 节点，1% 变化） | < 1KB/帧 |

测法：内置可生成 N agent 的基准 ModelConfig + 帧计数/`performance.now()` HUD（dev 开关）。回归用 headless 渲染计时或对帧解码做单测（纯函数：buffer→state）。

## 8. 实施顺序（与 roadmap P1 对齐）

1. 定帧格式 + Worker 解码（纯函数，先单测）。
2. `GridRasterRenderer`（ImageData）跑通 SIR/Schelling grid 1e4。
3. `PointsGLRenderer`（regl 实例化）跑通 network 1e4，加边批绘与布局缓存。
4. 节拍解耦 + 背压丢帧 + replay（接 Trace 时间轴）。
5. 缩放/平移/拾取/联动；超阈值 heatmap 兜底。
6. 性能 HUD + 基线回归。

## 9. 反模式（禁止）

- ❌ 每 agent 一个 React 组件 / SVG 节点 / DOM。
- ❌ 每 tick 整张 snapshot JSON 全量过 WS。
- ❌ 在主线程同步解码大帧 + 立即重绘（卡 UI）。
- ❌ 用降采样/丢帧的「显示结果」当作 Run 结论（必须基于真实 Trace）。
- ❌ 为「以后可能要 3D/GIS」提前引重型 3D 引擎（YAGNI；MVP 不做 3D，见 `core-requirements.md`）。
