# Auto-ABM 论文方法部分（Methods / System Description）结构方案

> 面向 **EMNLP 2026 System Demonstration**（正文 ≤6 页）。Demo 论文通常用 **System / System Description** 代替传统 NLP 论文的 Methods；本文档统一称为 **方法部分**，对应大纲中的 **§3 System + §4 Capabilities**（约 **2.7 页**）。
>
> 所有小节均基于当前仓库**已实现**能力；标注 ⚠️ 的为需谨慎表述或尚未完全接线项。

---

## 0. 方法部分在全文中的位置

```
§1 Introduction          (~0.9p)  问题、gap、contributions
§2 Related Work          (~0.65p) ABM 软件 + AI 自动化科研 + Table 1
§3–4 Methods / System    (~2.7p)  ← 本文档
§5 Evaluation            (~1.0p)
§6 Demo & Availability   (~0.5p)
Appendix                 (≤2p)   工具表、ODD 样例、API 清单
```

**方法部分要回答的审稿问题：**
- How does the system work?（架构与数据流）
- What is novel in the approach/technology?（三大创新如何落地）
- Who is the target audience?（研究者工作流如何映射到 UI/工具）

**贯穿方法部分的 5 条设计原则（每套方案开头 3–5 句复述）：**
1. **Simulation-first** — 一等对象：Project / Simulation / Model / Run / Trace / ODD
2. **Trace as source of truth** — `trace.jsonl` 是解释与归因的唯一定量事实源
3. **Deterministic core** — 运行、图谱编译、归因、反事实由确定性代码完成
4. **Evidence-constrained NLG** — LLM 只叙事与引用；`validateEvidence`  gate
5. **Adaptive composition** — 深度实验 UI 由 agent **声明式生成**，server **解析绑定**真实数据

---

## 1. 实现锚点速查（写方法时引用）

### 1.1 三层架构

| 层 | 路径 | 职责 |
|---|---|---|
| **Desktop 工作台** | `desktop/src/abm/` | `AbmWorkbench`、画布、机制图、ExplainInspector、ExperimentCanvas |
| **Server 编排层** | `src/server/abm/` | REST `/api/abm/*`、持久化、`explainService` / `attributionService`、内核桥 |
| **Python 内核** | `packages/abm-kernel/` | Mesa 3.x、`worker.py` stdio NDJSON、8 内置模板、`trace.jsonl` |

### 1.2 核心数据对象（方法 § 应用语）

| 对象 | 持久化 | 方法里怎么说 |
|---|---|---|
| `ModelConfig` | `simulation.json` + 版本号 | 声明式模型：agents / mechanisms / parameters / observers |
| `Run` | `run.json` + `trace.jsonl` | 绑定 seed、参数快照、model_version |
| `Trace` | JSONL 按 tick | `tick_metrics`, `mechanism_fired`, `event`, `space_snapshot` |
| `ODD` | `odd.json` 七部分 | 由 Model 派生、可编辑、与版本同步 |
| `MechanismGraph` | 按 model_version 缓存 | 内核 `mechanism_graph` 命令确定性编译 |
| `AbmExperimentViewSpec` | 内存 + `experimentViews` store | charts + controls + sweep 设计 |

### 1.3 Agent 工具（14 个，`src/tools/abm/index.ts`）

| 阶段 | 工具 | 作用 |
|---|---|---|
| 提案 | `abm_propose_simulations` | 批量机制互异草案 |
| 采纳 | `abm_adopt_simulation` | 映射内置模板 → 真实 `simId` |
| 校验 | `abm_validate_simulation` | 结构/ODD 一致性 |
| 编辑 | `abm_edit_model` | 补丁 ModelConfig（结构变更需权限） |
| 运行 | `abm_run` / `abm_stop_run` | 启动/停止内核 run |
| 解释 | `abm_explain_interval` | LLM 叙事 + 证据校验 |
| 归因 | `abm_attribute_interval` | 确定性归因 + 拐点 |
| 反事实 | `abm_counterfactual_run` | 同 seed 改参重跑 + 对比 |
| ODD | `abm_update_odd` | 增量合并 ODD |
| 结果画布 | `abm_configure_results` | 指标聚焦 |
| 深度实验 UI | `abm_configure_experiment_view` | 声明式实验面板 |
| 工作台 | `abm_control_workbench` | 切换视图 |
| 只读 | `abm_inspect_simulation` | 参数/指标 introspection |

### 1.4 关键 Server 端点（方法可放附录表）

- Run：`POST .../runs`, `GET .../trace`, `GET .../explain`, `GET .../attribution`, `GET .../changepoints`, `GET .../counterfactual`, `GET .../compare/:id`
- Model：`GET .../mechanism-graph`, `PATCH .../model`, `GET .../odd`, `POST .../export`
- Experiment：`POST .../experiments`, `POST /api/abm/viz/resolve`

### 1.5 诚实边界（方法部分脚注/一句带过）

| 能力 | 写法 |
|---|---|
| 6 个研究智能体角色 | **Role-conditioned orchestration**；Settings 展示 + 工具/提示分工；⚠️ 非 6 路并行 spawn（除非接 subagent 路 2） |
| 25 案例库 | **8 可执行模板** + 精选教学叙事 |
| AI 生成 `mechanisms.py` | `loader.py` 存在；⚠️ 未接入生产 run |
| 探索模式搜索树 | 内核有 `search_tree.py`；⚠️ 无 desktop UI |
| `TraceTimeline` | 已实现；⚠️ 未挂主工作台 |

---

## 2. 五套方法部分结构方案

---

### 方案 A（推荐）：**总览 → 三支柱 → 实现要点**

> **组织逻辑**：先给 Fig.1 全景，再按三个 contribution 展开，最后收束数据流与反幻觉机制。与 Introduction 的 3 bullet **一一对应**，审稿人最不容易迷路。

**页预算：§3 1.0p + §4 1.7p ≈ 2.7p**

```
§3 System Overview                                    [0.5p + Fig.1]
  3.1 Design principles & object model              [0.25p]
  3.2 Three-tier architecture                       [0.25p]
      Desktop ↔ Server ↔ Python kernel (NDJSON)
  3.3 End-to-end data flow                          [Fig.1 主体]
      NL intent → tools → run → trace → {viz, explain, export}

§4 Methods by Contribution                          [2.2p + Fig.2]
  4.1 Workflow Orchestration                        [0.7p]
      4.1.1 Role-specialized agent team (6 roles)
      4.1.2 Tool harness & abmCard protocol
      4.1.3 Operating modes (research / dialogue / autonomous)
      4.1.4 Forward & inverse research paths
  4.2 Mechanism Atlas & Trace-Grounded Explanation  [0.8p + 小图]
      4.2.1 Schema-compiled causal DAG
      4.2.2 Deterministic analytics (attribution, changepoints, counterfactual)
      4.2.3 Evidence-constrained NLG pipeline
      4.2.4 Cross-view linkage (chart ↔ graph ↔ inspector ↔ chat)
  4.3 Adaptive Deep-Experiment Workspace           [0.5p]
      4.3.1 Declarative experiment-view synthesis
      4.3.2 VizSpec resolution (no fabricated data)
      4.3.3 Batch experiment execution
  4.4 Supporting subsystems (compact)               [0.2p → 附录]
      Kernel, ODD, persistence, reproduction export
```

#### 各小节写什么（要点清单）

**§3.1 Design principles**
- 五原则各 1 句；强调 ABM 科研对象是 Simulation 不是 repo
- 可放小表：原则 → 实现机制（如 Trace as truth → `attributionService` + `validateEvidence`）

**§3.2 Three-tier architecture**
- Desktop：React 工作台 + 独立 `/ws/abm/:runId` 二进制帧
- Server：Bun，`kernelProcess.ts` spawn Python，`abmStore.fs.ts` 持久化
- Kernel：Mesa `KernelModel`，stdio NDJSON `run` / `experiment` / `mechanism_graph`

**§3.3 Data flow（Fig.1）**
- 画清：**forward**（propose→adopt→validate→run）与 **inverse**（多草案→试跑→对比→fork）共用同一 trace 层
- 标注 card 协议：`tool_result` → `parseAbmCard` → 工作台联动

**§4.1 Workflow Orchestration**
- 6 角色表：id / when / checks（来自 `researchAssets.ts`）
- 14 工具按阶段分组（见 §1.3 表）
- 三模式：`allowedAbmTools()` 在 dialogue 剥离 mutating tools
- Forward：提案卡含 mechanismSummary、ODD excerpt、可选 trial sparkline
- Inverse：同一 `propose` 从目标现象出发；autonomous 模式 staged prompt（⚠️ 不写全自动搜索树 UI）
- Harness：Skills + MCP 扩展点一句；subagent 底座一句

**§4.2 Mechanism Atlas & Explanation**
- **编译**：`mechanism_graph.py` 从 `ModelConfig` 抽 param→mechanism→state→observer 边；**不**由 LLM 画
- **动画**：Trigger = `mechanism_fired` 计数；Attribution = `buildAttribution` signed flow
- **确定性分析**：归因 coverage/residual；`detectChangepoints` MAD 斜率；`counterfactualService` 同 seed 分叉 tick
- **NLG**：`buildExplainContext` 切片 → LLM → `validateEvidence` → `speculative` 标记
- **联动**：`explainFocus` store 连接 `MetricChart` / `ExplainInspector` / `MechanismGraphPanel` / chat cards

**§4.3 Adaptive Deep-Experiment**
- Agent 调 `abm_configure_experiment_view` 输出 `AbmExperimentViewSpec`
- `ExperimentCanvas` 动态渲染 charts（line/multi_line/bar/scatter）+ controls（sweep/fixed）
- `POST /api/abm/viz/resolve`：server 拒绝伪造列绑定
- `experimentService` 批量 sweep + WS 进度

**§4.4 Supporting（正文 2–3 bullet，细节放附录）**
- **Kernel**：config-driven Mesa 封装；8 templates；JSONL trace levels
- **ODD**：`oddService` 七部分 derive + 增量 merge
- **Export**：`exportService` reproduction package + manifest
- **Canvas**：Grid `ImageData` + Network WebGL instancing；worker 解码二进制帧

**配图**
- Fig.1：§3.3 全景架构（必）
- Fig.2：§4 工作台标注截图（对话|画布|图谱|Inspector|深度实验）
- 可选 Fig.3（小）：explain pipeline 或 mechanism graph 双模式

**优点**：与 contribution 对齐；三大创新权重清晰。  
**缺点**：workflow 与 explain 分节，读者需来回对照 Fig.1。

---

### 方案 B：**生命周期驱动（Research Lifecycle）**

> **组织逻辑**：按 ABM 研究者真实阶段写方法，每阶段写「输入→处理→输出→工具/API」。与问题驱动 Introduction **同构**，motivation 连贯性最强。

**页预算：§3 0.4p 总览 + §4 2.3p 分阶段**

```
§3 System Overview                                    [0.4p + 简版 Fig.1]
  3.1 Object model (Simulation-centric)
  3.2 Architecture sketch

§4 Research Lifecycle Methods                         [2.3p]
  4.1 Conceptualization & Model Drafting              [0.45p]
      NL → propose_simulations → proposal_batch cards
      adopt → template mapping → ModelConfig + ODD draft
  4.2 Validation & Revision                         [0.35p]
      validate_simulation; edit_model + permission gate
      ODD sync on model version bump
  4.3 Execution & Observation                         [0.45p]
      abm_run → kernel worker → trace.jsonl
      Real-time canvas (WS binary) + metric charts
  4.4 Experimentation                                 [0.4p]
      configure_experiment_view → adaptive UI
      sweep / replications / viz resolve
  4.5 Explanation & Mechanism Understanding           [0.5p + Fig.2]
      Interval brush → attribution / changepoints
      Mechanism graph compile + overlay modes
      explain_interval + evidence validation
      counterfactual_run + trajectory compare
  4.6 Documentation & Reproducibility                 [0.15p]
      ODD export; reproduction package
```

#### 各阶段「方法四件套」模板（每节按此写，省篇幅）

每小节固定 4 句型（demo 论文极有效）：
1. **Input**：用户/agent 提供什么（NL、@ref、刷选区间）
2. **Process**：哪个组件确定性处理、哪个调 LLM
3. **Output**：产生什么对象（Run、Trace、card、view spec）
4. **Grounding**：数字/图从哪来（trace / kernel / 校验 gate）

**§4.1 示例要点**
- Input：研究问题或目标现象（正向/逆向同一入口）
- Process：`propose` 生成 5–10 互异草案；`adopt` 经 `inferTemplateFromProposal` 映射 8 模板之一
- Output：`simId`、初始 `ModelConfig`、`odd.json` 草稿
- Grounding：trial sparkline 仅当真实 `runId` 存在（`abmCardEnvelope` 注释）

**§4.5 示例要点（全文高潮，可多 0.1p）**
- 区分 **Analysis path**（确定性）vs **Narration path**（LLM + validate）
- 机制图谱金句：compiled from schema, animated by trace

**配图**
- Fig.1：lifecycle 环形/横向流程图（阶段编号 4.1–4.6）
- Fig.2：§4.5 解释阶段 UI 截图

**优点**：读者跟着科研故事走；正向/逆向自然融入 §4.1。  
**缺点**：三大创新被拆进多节，需在 §3 或 §4.5 用小表 **「阶段 × 创新组件」** 回扣 contribution。

---

### 方案 C：**数据契约中心（Trace-Centric Contract）**

> **组织逻辑**：以 `trace.jsonl` 为枢纽，先定义契约，再写各子系统如何**读/写/引用** trace。适合强调 **grounding / 可复现** 的 NLP 审稿人。

**页预算：§3 0.5p + §4 2.2p**

```
§3 Trace-Centric Design                               [0.5p]
  3.1 Core schemas (ModelConfig, RunRecord, TraceRecord)
  3.2 Single source of truth principle
  3.3 Architecture overview (thin)

§4 Subsystems Grounded in Trace                       [2.2p]
  4.1 Simulation Engine & Trace Emission              [0.4p]
      Mesa kernel; worker NDJSON; trace levels (off/key/full)
  4.2 Persistence & Versioning                        [0.25p]
      Run binds seed + params + model_version
  4.3 Deterministic Trace Analytics                   [0.5p]
      mechanism activity; attribution; changepoints; counterfactual compare
  4.4 Schema-Compiled Mechanism Graph                 [0.35p]
      Compile from ModelConfig; overlay trace analytics
  4.5 Evidence-Constrained Language Interface         [0.45p]
      14 tools; abmCard types; explain validate gate; modes
  4.6 Presentation Layer                              [0.25p]
      Canvas WS; ExperimentCanvas; export package
```

#### 写作要点

- 开篇放 **Table：Trace record kinds → consumer subsystem**（正文或附录）
- 强调：**LLM 不在 4.3/4.4 路径上**；只在 4.5 且输出过 `validateEvidence`
- `AbmCard` union 类型列表压缩成附录表（正文只举 explanation + attribution 两例）

**配图**
- Fig.1：Trace 为中心的 hub-spoke 图（内核写、server 分析、desktop 展示、LLM 只读引用）
- Fig.2：validateEvidence 流程（context slice → LLM → cite check → speculative）

**优点**：NLP「接地」味最浓；反幻觉论证最硬。  
**缺点**：工作流编排与自适应 UI 显得像附属；需在 §4.5 用半页写清 agent orchestration。

---

### 方案 D：**分层技术栈（Bottom-Up Stack）**

> **组织逻辑**：经典系统论文「自底向上」：内核 → 桥接 → 服务 → agent → UI。适合审稿人想快速定位**实现深度**。

**页预算：§3 0.3p + §4 2.4p**

```
§3 Overview & Design Goals                            [0.3p]

§4 System Stack                                       [2.4p]
  4.1 ABM Kernel Layer                                [0.45p]
      ModelConfig; behavior registry; 8 templates
      trace.jsonl; mechanism_graph derivation
  4.2 Kernel Bridge & Run Service                     [0.35p]
      worker.py NDJSON protocol; kernelProcess.ts
      abmRunService; wsAbmHandler binary frames
  4.3 Server Services                                 [0.5p]
      explainService; attributionService; counterfactualService
      mechanismGraphService; experimentService; exportService; oddService
  4.4 Agent Harness & Tooling                         [0.45p]
      14 tools; permissions; abmCard envelope
      modes; skills/MCP/subagent extensibility
  4.5 Desktop Workbench                               [0.45p + Fig.2]
      AbmWorkbench views; SimulationCanvas; MechanismGraphPanel
      ExplainInspector; ExperimentCanvas; chat cards
  4.6 Cross-Cutting: ODD & Reproducibility            [0.2p]
```

#### 写作要点

- §4.1 写 Mesa 二次封装价值：声明式 config、mechanism-aware `change_state`、统一 observer
- §4.2 写 NDJSON 命令表（`run`/`experiment`/`mechanism_graph`/`shutdown`）— 放附录
- §4.3 每个 service **一行职责 + 输入输出类型**（紧凑）
- §4.5 按工作台 6 视图列表：`run | results | agents | model | odd | simulations`

**配图**
- Fig.1：五层 stack 图
- Fig.2：工作台截图

**优点**：实现清晰、利于附录放 API/协议表；工程审稿友好。  
**缺点**：科学叙事弱；不像「ABM 科研方法」而像技术报告——Introduction 必须补强 motivation。

---

### 方案 E：**混合式（A + B 精简版，投稿默认推荐）**

> **组织逻辑**：§3 用方案 A 的 **Overview + Fig.1**；§4 前半用方案 B 的 **lifecycle 简表** 带读者走一遍；§4 后半用方案 A 的 **三支柱深描** 回扣创新。兼顾故事性与 contribution 清晰度。

**页预算：§3 0.55p + §4 2.15p**

```
§3 System Overview                                    [0.55p + Fig.1]
  3.1 Principles & simulation-centric object model
  3.2 Architecture (Desktop–Server–Kernel)
  3.3 Forward & inverse paths on a shared trace layer

§4 Methods                                            [2.15p + Fig.2]
  4.1 Lifecycle-at-a-Glance                           [0.25p + Table 2]
      一行表：Stage → Tools → Artifacts → Grounding
  4.2 Pillar I — Workflow Orchestration               [0.55p]
      (同方案 A §4.1，压缩 0.15p)
  4.3 Pillar II — Mechanism Atlas & Explanation       [0.65p]
      (同方案 A §4.2)
  4.4 Pillar III — Adaptive Deep Experimentation      [0.4p]
      (同方案 A §4.3)
  4.5 Integrity Mechanisms                            [0.3p]
      Dual gates: validate_simulation + validateEvidence
      Mode gating; permission on structural edits; speculative labeling
```

#### Table 2 草案（Lifecycle-at-a-Glance，占 0.25p）

| Stage | Agent tools (examples) | Artifacts | Grounding |
|---|---|---|---|
| Draft | `propose`, `adopt` | proposals, `simId`, ODD draft | optional real trial run |
| Validate | `validate`, `edit` | issues list, model_version | schema + ODD sync rules |
| Run | `run`, `stop` | `trace.jsonl`, snapshots | deterministic kernel |
| Experiment | `configure_experiment_view` | view spec, experiment runs | viz resolve on server |
| Explain | `attribute`, `explain`, `counterfactual` | attribution card, narrative | trace analytics + cite check |
| Publish | `update_odd`, export API | ODD md, repro package | manifest + seeds |

**优点**：Introduction / Related Work / Methods / Evaluation **叙事一致**；Table 2 省 0.3p 流程描述。  
**缺点**：需严格控制 §4.2–4.4 字数，避免超页。

---

## 3. 五方案对比与选用建议

| 方案 | 叙事主轴 | 与 Intro 契合 | 创新可见度 | 实现深度 | 6页友好 | 推荐场景 |
|---|---|---|---|---|---|---|
| **A 三支柱** | Contribution | 高 | **最高** | 中 | 高 | contribution 已敲定、审稿人偏系统创新 |
| **B 生命周期** | 科研流程 | **最高** | 中 | 中 | 中 | 问题驱动 Intro、强调 forward/inverse |
| **C Trace 契约** | Grounding | 中 | 中（偏解释） | 中高 | 高 | 强调 NLP faithfulness / 反幻觉 |
| **D 技术栈** | 工程分层 | 低 | 低 | **最高** | 中 | 附录厚、主文短；或系统 track 味 |
| **E 混合** | 流程+支柱 | **高** | 高 | 中 | **最高** | **默认投稿推荐** |

**若只选一版写正文：选方案 E。**  
若 Boss 坚持问题驱动到极致：用 **方案 B 为主干**，把方案 A 的 §4.2–4.3 合并进 **§4.5 Explanation & Mechanism** 一节（会挤，需砍 §4.6 到附录）。

---

## 4. 方法部分配图与附录分工

### 4.1 正文图（方法部分）

| 图 | 方案 | 内容 |
|---|---|---|
| **Fig.1** | 全部 | 架构 + trace 枢纽 + forward/inverse；方案 C 用 hub-spoke，方案 D 用五层 stack |
| **Fig.2** | 全部 | 工作台全景标注（方案 B 放在 §4.5 解释阶段） |
| **Fig.3**（可选） | A/C/E | Explain pipeline 或 mechanism graph 双模式示意 |

### 4.2 建议放附录（≤2p，不占方法正文）

- **Table A**：14 工具完整列表（name / mutating / card type）
- **Table B**：REST API 端点摘要
- **Table C**：NDJSON worker 命令与帧类型
- **Table D**：`trace.jsonl` record kinds
- **Table E**：6 研究智能体角色 + 10 Skills + 4 推荐 MCP（各一行）
- **Fig. A1**：ODD 七部分样例截图
- **Fig. A2**：reproduction package 目录结构

---

## 5. 方法部分英文章节标题草案（方案 E）

```text
3  System Overview
4  Methods
  4.1  Research Lifecycle at a Glance
  4.2  Workflow Orchestration
  4.3  Living Causal Mechanism Atlas and Trace-Grounded Explanation
  4.4  Adaptive Deep-Experiment Workspace
  4.5  Integrity Mechanisms and Operating Modes
```

**§4.2 英文首句模板：**
> Auto-ABM orchestrates simulation-centric ABM research through a role-specialized agent harness: fourteen typed tools mutate or query shared simulation state, while an `abmCard` envelope synchronizes tool outputs with the desktop workbench.

**§4.3 英文首句模板：**
> Mechanistic understanding is split into a deterministic layer—schema-compiled causal graphs and trace-derived attribution—and an evidence-constrained language layer that may narrate but not invent tick-level facts.

---

## 6. 与评估章节的接口（方法里预埋一句，§5 展开）

| 方法小节 | 评估挂点 |
|---|---|
| §4.1 Forward/inverse + 8 templates | **E1** 经典现象复现 |
| §4.3 validateEvidence + attribution | **E2** 忠实度/幻觉率 |
| §4.4 view spec + viz resolve | **E6** metric/param 合法率 |
| §4.2 validate_simulation | **E7** 审核抓错率（若接 subagent） |
| §4.2 小模型只引用 trace 数字 | **E4** token 成本 |

---

## 7. 下一步落笔顺序（选定方案后）

1. 定方案（建议 **E** 或 **B**）。
2. 画 **Fig.1**（按选定方案的图类型）。
3. 填 **Table 2 Lifecycle**（方案 B/E）。
4. 写 §4.3（机制图+解释，最差异化，优先起草）。
5. 写 §4.2（编排）与 §4.4（深度实验）。
6. 附录 Table A–E 与正文交叉引用。

---

## 8. 变更记录

| 日期 | 说明 |
|---|---|
| 2026-07-07 | 初版：五套方法结构 + 实现锚点 + 方案 E 推荐 |
