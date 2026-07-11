# P3 实施计划 · 实验 + 复现

> 上游：`../roadmap.md` P3、`../architecture.md` §2/§5、`../conversation-ux.md` §5。
> **前置**：P0–P2 已有 run/canvas/trace/对话/解释。本阶段闭合 MVP：单参扫描 + 结果图表 + 复现包导出。

**目标**：`@Simulation` 单参扫描 → 多 Run → 结果图表（VizSpec 渲染，数据来自真实 RunRecord）；导出自包含复现包（Model + ODD + 实验 + seed + 结果），干净环境可重跑得一致指标。

**架构**：复用内核 `ExperimentRunner`/`expand`（已有）经 worker 批量跑；server 持久化实验与逐 Run 进度；桌面 VizSpec 白名单渲染器（AI 只发 spec，server 解析数据）；复现包为打包目录/zip。

**技术栈**：内核实验运行、WS 进度、声明式图表渲染（轻量图库或自绘）、zip 打包。

**验证强度**：实验展开/排序单测 + VizSpec 解析单测 + 导入重跑一致性冒烟；不跑 `verify`/coverage。

---

## 文件结构总览

```text
packages/abm-kernel/src/abm_kernel/worker.py     # 改: 支持 cmd:'experiment' (批量 expand+run, 逐 run 进度帧)
src/server/abm/
  experimentService.ts   # 新增: ExperimentConfig 持久化 + 启动批量 + 进度分发
  vizService.ts          # 新增: 解析 VizSpec.data_ref -> 真实结果列 (run/experiment/trace)
  exportService.ts       # 新增: 组装复现包 (config+odd+experiment+runs+results) -> 目录/zip
  api.ts                 # 改: experiments / viz / export 路由
  wsEvents.ts            # 改: abm_experiment_progress

desktop/src/abm/
  components/ExperimentPanel.tsx  # 新增: @Simulation 单参扫描配置 + 进度列表
  components/ResultsChart.tsx     # 新增: VizSpec 白名单渲染器
  components/ExportDialog.tsx     # 新增: 复现包导出(研究模式审批)
  api/abmClient.ts                # 改: 实验/viz/export 调用
  stores/abmStore.ts              # 改: experiments 状态
desktop/src/abm/**/*.test.tsx      # 新增
```

---

## Task 1：内核批量实验命令

**Files**
- Modify: `packages/abm-kernel/src/abm_kernel/worker.py`
- Create: `packages/abm-kernel/tests/test_worker_experiment.py`

复用现成 `runner.expand(ExperimentConfig)` + `ExperimentRunner.run(..., on_run_done=)`。worker 加命令：

```python
def _experiment(cmd):
    from abm_kernel.runner import ExperimentRunner
    from abm_kernel.schemas import parse_experiment_config, parse_model_config
    exp = parse_experiment_config(cmd["experiment"]); config = parse_model_config(cmd["config"])
    eid = cmd["experiment_id"]
    plans = ExperimentRunner().expand(exp)
    _emit({"frame": "experiment_meta", "experiment_id": eid, "total": len(plans)})
    def on_done(i, total, plan, record):
        _emit({"frame": "run_done", "experiment_id": eid, "index": i, "total": total, "record": record.model_dump()})
    ExperimentRunner().run(exp, config, cmd["output_dir"], plans=plans, on_run_done=on_done)
    _emit({"frame": "experiment_done", "experiment_id": eid})
# main(): elif cmd["cmd"] == "experiment": _experiment(cmd)
```

- [ ] 加 `experiment` 命令 + 进度帧。
- [ ] 测试：2 值扫描 × 2 重复 → 4 个 `run_done` + `experiment_done`；失败 run 不中断（内核已支持）。
- [ ] `uv run pytest tests/test_worker_experiment.py -q` → PASS。
- [ ] 提交：`feat(kernel): worker experiment command (sweep + progress)`。

---

## Task 2：server 实验服务

**Files**
- Create: `src/server/abm/experimentService.ts`
- Modify: `src/server/abm/wsEvents.ts`、`src/server/abm/api.ts`、`src/server/abm/kernelProcess.ts`

`experimentService`：持久化 `ExperimentConfig`（`architecture.md` §5 布局）；`startExperiment` 经 `kernelProcess` 发 `experiment` 命令；逐 `run_done` 帧 → 落 RunRecord + WS `abm_experiment_progress`。
`wsEvents.ts`：`{ type:'abm_experiment_progress', experimentId, index, total, runId, state }`。
`api.ts`：`POST /api/abm/simulations/:sid/experiments`（启动）、`GET /api/abm/experiments/:eid`（含其 runs 汇总）。

- [ ] 写服务 + endpoint + 进度消息；`kernelProcess` 支持 experiment 帧透传。
- [ ] 单测（stub worker 发 4 个 run_done → 服务汇总 4 条 RunRecord）。
- [ ] 提交：`feat(server/abm): experiment service + progress`。

---

## Task 3：VizSpec 数据解析（AI 不直出数据）

**Files**
- Create: `src/server/abm/vizService.ts`
- Modify: `src/server/abm/api.ts`

按内核 `schemas/viz.py` 契约：AI 发 `VizSpec`（图表类型 + `data_ref` + encodings），**server 解析真实数据**。`vizService.resolve(spec)`：按 `data_ref.source`（run/experiment/trace）+ `id` + 可选 `slice` 读真实结果（RunRecord.metrics_summary / 多 run / trace 区间），用 `missing_fields(spec, columns)` 校验 encoding 字段存在，返回 `{ columns, rows }`。字段不存在 → 拒绝（不渲染伪造）。

`api.ts`：`POST /api/abm/viz/resolve`（body=VizSpec）→ `{ spec, data }`。

- [ ] 写 `vizService` + endpoint；单测：data_ref 解析 + 越界字段拒绝。
- [ ] 提交：`feat(server/abm): vizspec data resolution (whitelist, real data only)`。

---

## Task 4：结果图表渲染器（前端白名单）

**Files**
- Create: `desktop/src/abm/components/ResultsChart.tsx`

渲染白名单图表（`line/bar/scatter/box/histogram/heatmap/area/pie`，对齐 `viz.py::VizChart`）。输入 = server 返回的 `{ spec, data }`；前端只按 encodings 把**真实列**绑到视觉通道；不执行任何 spec 内代码。可引轻量图库（如已有图表依赖优先复用；否则最简自绘 line/bar）。

- [ ] 写渲染器（先支持 line/bar/scatter，覆盖 MVP）。
- [ ] 测试：给定 spec+data 渲染出对应通道；缺数据时显示空态而非编造。
- [ ] 提交：`feat(desktop/abm): vizspec whitelist results chart`。

---

## Task 5：实验面板（@Simulation 单参扫描）

**Files**
- Create: `desktop/src/abm/components/ExperimentPanel.tsx`
- Modify: `desktop/src/abm/api/abmClient.ts`、`desktop/src/abm/stores/abmStore.ts`

`ExperimentPanel`：选参数 + 取值列表 + 重复数 + 步数 → `abmClient.startExperiment` → 进度列表（吃 `abm_experiment_progress`）→ 完成后用 `ResultsChart` 横向对比同一指标。失败 Run 标记不中断。可由对话 `@Simulation 扫描X` 触发（复用 P2 `@` 引用 → `abm_run_experiment` 工具）。

- [ ] 写面板 + 进度 + 结果对比；接 store。
- [ ] 测试：进度累积、失败标记、结果图来自真实 RunRecord。
- [ ] 提交：`feat(desktop/abm): experiment panel (single-param sweep)`。

---

## Task 6：复现包导出（研究模式审批）

**Files**
- Create: `src/server/abm/exportService.ts`、`desktop/src/abm/components/ExportDialog.tsx`
- Modify: `src/server/abm/api.ts`

`exportService.buildPackage(simId, opts)`：组装自包含目录 → zip：`model/config.json`(+version)、`odd.md`(ODD 导出 Markdown)、`experiments/*.json`、`runs/*.json`(RunRecord)、`results/*`、`traces/*.jsonl`(可选)、`manifest.json`（含 `kernel_version`、seeds、参数，复用内核 `ReproManifest` 概念）。
`api.ts`：`POST /api/abm/simulations/:sid/export` → 包路径/下载。
`ExportDialog`：研究模式导出前确认（`../conversation-ux.md` §3 审批边界）。

- [ ] 写导出服务（zip 用 Bun/Node 现成能力）+ 对话框。
- [ ] 单测：包内含必要文件 + manifest 字段齐全。
- [ ] 提交：`feat(abm): reproducible package export (incl ODD)`。

---

## Task 7：导入重跑一致性（复现验证）

**Files**
- Create: `src/server/abm/__tests__/repro.test.ts`

复现包的价值在于可重跑得一致结果（确定性 P1）。测试：从导出的 `manifest.json`(seed+params+config) 经 worker 重跑 → `metrics_summary` 与包内原 RunRecord 一致。

- [ ] 写重跑一致性测试（可用 stub 之外的真实内核小步数）。
- [ ] `bun test src/server/abm/__tests__/repro.test.ts` → PASS。
- [ ] 提交：`test(abm): reproduction package re-run consistency`。

---

## P3 验收

- [ ] `@Simulation 扫描<参数>` → 多 Run 跑完，结果图表横向对比同一指标，数据全来自真实 RunRecord。
- [ ] 失败 Run 标记但不中断批次。
- [ ] VizSpec 绑定不存在的列 → 拒绝渲染（不编造）。
- [ ] 导出复现包自包含；在干净环境按 manifest 重跑得到一致 `metrics_summary`。
- [ ] 导出走研究模式确认。

## P3 验证（已调低）

- 内核：`uv run pytest tests/test_worker_experiment.py -q`
- server：`bun test src/server/abm`（实验/viz/export/repro）
- desktop：`cd desktop && bun run test src/abm`（实验面板/图表）
- 收尾各跑一次 `bun run check:server`、`bun run check:desktop`、`bun run check:persistence-upgrade`（导出/实验形状）。
- **MVP 收官**：此时若要对外称「可发布」，再按 `AGENTS.md` 跑 `bun run verify`（仅此节点需要）。

## 风险与回滚

- **批量耗时/资源**：大扫描串行跑（内核 `ExperimentRunner` 顺序确定性）；UI 给进度与取消；必要时限制并发=1 保确定性。
- **复现包体积**：trace.jsonl 可选包含（默认含 key 级）；大 trace 提示按需裁剪。
- 回滚：实验/viz/export 为新增模块，移除即回 P2；不影响单 Run 闭环。

---

## MVP 完成判定（P0–P3 全绿 = `core-requirements.md` §7 MVP 1–6）

1. 从问题得到可运行 Simulation 与 ODD（P2）✔
2. Interface/画布交互理解结果（P1）✔
3. Trace 区间带证据链机制解释（P2）✔
4. 至少一次参数/干预实验（P3）✔
5. 导出可校验复现包（P3）✔
6. 研究模式 + 对话模式（P2）✔
