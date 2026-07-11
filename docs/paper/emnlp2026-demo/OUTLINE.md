# Auto-ABM — EMNLP 2026 Demo 论文大纲 v2（问题驱动 · 迭代版）

> 基于 Boss 反馈迭代：主线 = **自动化 ABM 科研工作流编排** + **机制图谱/可解释** + **深度实验自适应 UI**；叙事 = **问题驱动**；支持 **正向建模** 与 **逆向机制发现**。

---

## 0. 关键约束（不变）

- 截稿 **2026-07-10 AoE**；正文 **≤6 页** + 附录 **≤2 页**；**必须有评估 + demo 链接/安装包 + ≤2.5min 录屏**。
- 诚实红线：6 个 ABM 研究角色目前为 **role-conditioned orchestration**（Settings 展示 + 工具/提示分工）；底座有真 subagent 运行时，论文用 **agentic orchestration** 措辞，不谎称 6 agent 并行 spawn（除非走路 2 接线）。

---

## 1. 学术表述：怎么说「自动化 ABM 科研编排」

### 1.1 推荐主称谓（正文/标题里选一个做主 tag）

| 中文直觉 | 英文学术表述 | 出处/语境 | 建议用法 |
|---|---|---|---|
| 自动化 ABM 科研编排 | **simulation-centric ABM research workflow orchestration** | 自造但清晰；强调对象是一等 Simulation 而非代码仓库 | **正文首选** |
| 自动化科研 / AutoResearch | **AutoResearch** — workflow-level paradigm in which AI participates across ideation, experimentation, validation, and reporting (L0–L4 autonomy spectrum) | AutoResearch AI survey (2025/26) | Related Work 定位：我们在 **L2–L3**（人机协作 + 部分 AI-led 编排） |
| 智能体编排 | **agentic orchestration** / **multi-agent research orchestration** | AI-Researcher, Robin, emergentmind 综述 | 描述 harness：planner/modeler/validator/explainer 分工 |
| 闭环科研 | **closed-loop scientific workflow** / **iterative discovery loop** | Robin, The AI Scientist | 描述 propose→validate→run→explain→revise |
| 正向建模 | **forward mechanistic modeling** / **phenomenon-to-model synthesis** | ABM + ODD 传统 | 从现象/问题 → 机制假设 → 可跑 Simulation |
| 逆向发现 | **inverse mechanistic discovery** / **phenomenon-driven model search** | ModelSMC, CAMO（micro→macro） | 从目标现象/曲线 → 多机制候选 → 试跑筛选 |
| 可溯源解释 | **trace-grounded explanation** / **evidence-constrained NLG** | 本产品核心 | Contribution 2 |
| 编译式因果结构 | **schema-compiled causal mechanism graph** | 区别于 force-directed / LLM-drawn graph | Contribution 1 |
| 自适应实验 UI | **declarative experiment-view synthesis** / **adaptive deep-experiment workbench composition** | `abm_configure_experiment_view` | Contribution 3 |
| 减少幻觉 | **evidence validation gate** / **deterministic analysis–LLM citation split** | explainService | 设计原则，不单列 contribution |

### 1.2 推荐标题（按问题驱动叙事排序）

1. **Auto-ABM: Orchestrating Trace-Grounded Agent-Based Modeling Research from Phenomenon to Mechanism**
2. **Auto-ABM: A Simulation-Centric Workbench for Forward Modeling and Inverse Mechanism Discovery in ABM**
3. **Auto-ABM: Closing the ABM Research Loop with Agentic Orchestration, Causal Mechanism Graphs, and Adaptive Experiment UIs**

**一句话 thesis（摘要第一句）：**
> ABM researchers spend most of their time translating phenomena into runnable models, running experiments, and *explaining* emergent outcomes—yet no integrated system automates this **simulation-centric research loop** with **trace-grounded** fidelity; Auto-ABM closes that loop through **agentic workflow orchestration**, a **schema-compiled mechanism atlas**, and **adaptive deep-experiment workspaces**.

### 1.3 如何谨慎地说「第一个 / 没人做过」（避免被审稿人一句 related work 打穿）

**可以说：**
- "To our knowledge, **no prior system integrates** NL-driven ABM workflow orchestration, deterministic Mesa execution, ODD-aligned documentation, trace-grounded explanation, and reproducible export **in a single simulation-first workbench**."
- "Existing tools automate **fragments** (NetLogo-MCP: model I/O; SAGE: code generation; CAMO: post-hoc causal discovery in LLM-agent sims)—not the **full ABM research lifecycle**."

**不要说：**
- "第一个 ABM 软件" / "第一个 LLM+ABM"（NetLogo-GPT/MCP/SAGE/Mesa-LLM 都存在）
- "完全自主、无需人类"（探索模式尚未全流程无人值守）

---

## 2. 问题驱动叙事骨架（**推荐正文结构 · 方案③+ 升级版**）

### 2.1 研究者时间花在哪（§1 The Problem，~1 页）

ABM 的核心价值是**解释社会现象**（涌现、反馈、干预），但科研流程被工程摩擦吞噬：

| 阶段 | 研究者实际在做什么 | 痛点 |
|---|---|---|
| **概念化** | 读文献、写 ODD、画机制图、定参数 | NL→可跑模型门槛高；机制图与代码易脱节 |
| **实现** | 写 NetLogo/Mesa/Python、调试 | 非程序员被挡在门外；LLM 生成代码难验证 |
| **实验** | 扫描参数、多种子、干预/反事实 | 实验 UI 固定；换研究问题就要改 Interface |
| **解释** | 对曲线拐点写「为什么」 | LLM 会**编造** tick/机制；缺 micro→macro 证据链 |
| **发表/复现** | 整理图表、写方法、打包数据 | Run/seed/版本散落；难一键复现 |

**Gap 句（论文 punchline）：**
> General coding agents and NetLogo-AI bridges automate *code* or *chat*, but **not** the ABM research loop where **Simulation, Trace, and ODD**—not repositories—are the primary objects of inquiry.

引出两个科学方向：**正向**（问题→机制→现象）与**逆向**（目标现象→机制竞争→解释）。

### 2.2 设计原则（§2，~0.5 页 + Table 1）

1. **Simulation-first**：操作对象是 Simulation/Run/Trace/ODD，不是文件树。
2. **Trace as source of truth**：所有解释数字来自 `trace.jsonl`；LLM 只引用、不计算。
3. **Deterministic where it matters**：运行、归因、图谱编译、反事实 — 可复现进 figure。
4. **Role-specialized agentic orchestration**：生成、审核、实验、解释分工；共享工具层。
5. **Adaptive UI, not static IDE**：深度实验面板由 agent 按实验意图**声明式生成**。

**Table 1**：vs NetLogo / NetLogo-MCP / NetLogo-GPT / SAGE / CAMO / Mesa-LLM / 通用 coding agent。

### 2.3 系统总览（§3，~1.25 页 + Fig.1）

三层 + 双向流：

```
[Research Intent: NL / phenomenon / @refs]
        ↓ agentic orchestration (6 roles + 14 tools + skills/MCP)
[Harness: permissions · cards · modes · validate gate]
        ↓ NDJSON subprocess
[Mesa Kernel: ModelConfig · 8 templates · trace.jsonl · mechanism_graph]
        ↓
┌───────────────┬────────────────┬─────────────────────┐
│ Mechanism     │ Explain        │ Adaptive Deep-Exp   │
│ Atlas (编译DAG)│ Workbench      │ Workspace (声明式UI) │
└───────────────┴────────────────┴─────────────────────┘
        ↓ export reproduction package (ODD + runs + manifest)
```

**Fig.1** = 上式；标注 **forward path**（propose→adopt→run）与 **inverse path**（多草案→试跑→对比→fork）。

### 2.4 三大创新块（§4，~1.5 页 + Fig.2/3）

#### 创新 A — ABM Research Workflow Orchestration（你的「自动化编排」主线）

**写什么：**
- 6 角色：clarifier → modeler → **validator（审核）** → experimenter → explainer → odd-writer
- 14 ABM 工具 + **abmCard 协议**（工具结果 ↔ 工作台 UI 同步）
- 三模式：**research**（人机协作+确认）、**dialogue**（只读 Q&A）、**autonomous**（探索：多方案自动试跑筛选）
- **正向**：`abm_propose_simulations` → 5–10 机制互异草案 + ODD 摘要 → adopt → edit/validate
- **逆向**：同一工具链从**目标现象**出发（如「找能 repro 级联临界的现象」）→ 多 Simulation 竞争 → 指标/曲线对比（探索模式叙事；搜索树 UI 未挂载则写 pipeline 不写 UI）
- Harness 扩展：**Skills**（ODD/敏感性/反事实/复现审查）+ **MCP**（文献/文件/版本）+ **subagent** 底座

**不写什么：** 25 个独立引擎；AI 任意生成 mechanisms.py（未接线）。

#### 创新 B — Living Causal Mechanism Atlas + Trace-Grounded Explain Workbench

**机制图谱：**
- 从 `ModelConfig` **确定性编译** DAG（param→agent→mechanism→state→observer）
- 双模式：**Trigger heat**（trace firing）/ **Attribution**（区间 signed flow，绿增红减）
- 与 ExplainInspector、曲线刷选、对话 `@interval` 联动

**可解释工作台：**
- 确定性：归因分解（coverage/residual）、拐点（MAD 斜率）、反事实（同 seed 分叉 tick）
- LLM：`validateEvidence` 校验引用；unsupported → `speculative`
- Demo 金句：*"The graph is not drawn by the LLM—it is compiled from the Mesa kernel schema, then animated with real trace evidence."*

#### 创新 C — Adaptive Deep-Experiment Workspace（深度实验 + 自适应 UI）

**写什么：**
- Agent 调用 `abm_configure_experiment_view` 输出 **AbmExperimentViewSpec**（charts + controls + sweep design）
- `ExperimentCanvas` **按 spec 动态渲染**参数面板与结果图（line / multi_line / bar / scatter）
- 支持：单因素扫描、多种子 ensemble、干预/反事实、敏感性、理论探索（tool prompt 已定义）
- **VizSpec 由 server resolve** — AI 只声明绑定，**不注入假数据**
- 与 `@Simulation` 引用、结果包导出联动

**Fig.2**：全景标注（对话 | 画布 | 机制图 | ExplainInspector | 深度实验面板）。

### 2.5 支撑能力清单（§4 末尾或附录，正文用 bullet 带过）

**Boss 已列 + 补充（按「论文价值」排序）：**

| 类别 | 能力 | 论文一句 |
|---|---|---|
| **编排** | 研究/对话/自主探索三模式 | Mode-gated mutability: dialogue strips write tools |
| **反幻觉** | validator 工具 + explain 引用校验 + speculative 标记 | Dual gate: structural validate + evidence validate |
| **交互** | 仿真画布 WebGL/Canvas2D + 结果画布 + 刷选/@引用进对话 | Selection-linked `@Run` / interval refs |
| **复现** | export reproduction package（model+ODD+runs+manifest） | One-click reproducibility bundle |
| **文档** | ODD 七部分自动派生、与 Model 版本同步 | ODD as publishable semantic layer |
| **内核** | Mesa 3.x  declarative ModelConfig + behavior registry + JSONL trace | Kernel refactor: config-driven, trace-native |
| **Harness** | 14 tools, skills, MCP, subagent, permission dialog | Extensible agentic harness on coding-agent base |
| **草案** | 批量 Simulation 提案 + 可选低步数试跑 sparkline | Competitive mechanism hypotheses at proposal time |
| **版本** | Model 结构变更递增版本 + ODD 增量合并 | Versioned simulations for paper figures |
| **实验** | 单参 sweep + WS 进度 + Declarative viz | Batch experiments with live progress |
| **跨视图** | 曲线↔图谱↔Inspector↔聊天卡片数字一致 | Cross-surface evidentiary consistency |
| **案例** | 8 可执行模板 × ~25  curated 叙事（Case Library） | Pedagogical case narratives over shared templates |
| **权限** | 结构编辑/导出等需确认（research mode） | Human-in-the-loop for structural mutations |

### 2.6 评估（§5，~1 页）

不变：**E1** 8 模型经典现象复现 · **E2** 归因自洽 + 引用校验 vs raw LLM · **E3** Table 1 · **E4** 小模型成本（确定性工具 offload LLM）。

**可加（贴合新叙事）：**
- **E6 自适应 UI 有效性**：N 个实验意图 → agent 生成的 view spec 中 metric/param id **合法率**（`abm_inspect_simulation` 可验证）
- **E7 审核/validate 抓错率**（若走路 2 接 subagent）：故意注入坏 config，validator 检出率

### 2.7 可用性 & 结论（§6，~0.25 页）

安装包链接、license、2.5min 录屏链接、ethics（仿真社会现象的解释责任）。

---

## 3. 正文 6 页预算（问题驱动定稿版）

| § | 页 | 内容 |
|---|---|---|
| 1 Introduction | 0.9 | 问题+gap+forward/inverse+3 contributions |
| 2 Related Work & Principles | 0.6 | Table 1 + AutoResearch L2–L3 定位 |
| 3 System | 1.2 | Fig.1 + orchestration + kernel + modes |
| 4 Capabilities | 1.5 | A 编排 + B 图谱/解释 + C 自适应实验 + Fig.2 |
| 5 Evaluation | 1.0 | Table 2,3 + E4 (+E6 可选) |
| 6 Demo & Availability | 0.5 |  walkthrough 要点 + 链接 + 结论 |
| Appendix ≤2p | — | ODD 样例、复现细节、工具/agent 表、额外截图 |

---

## 4. 三套 2.5 分钟（150 秒）录屏方案

> 格式建议：**1080p 录屏 + 英文解说**（EMNLP 国际审稿）；中文字幕可选。每套含时间轴、画面、解说词要点。

---

### 录屏方案 A（推荐）：**单故事线 · 问题→正向建模→解释→深度实验**

**形式**：一镜到底桌面录屏，鼠标路径刻意慢；关键数字 zoom 0.5s。

| 时间 | 画面 | 解说（英）要点 |
|---|---|---|
| 0:00–0:18 | 黑底文字：*"ABM research is about explaining social phenomena—but researchers lose weeks to coding, fixed UIs, and ungrounded AI explanations."* | Hook：时间花在工程而非解释 |
| 0:18–0:28 | Auto-ABM 主界面全景 | "Auto-ABM is a simulation-centric workbench that orchestrates the full ABM research loop." |
| 0:28–0:48 | 对话输入：*"Study rumor debunking on a social network"* → 提案卡片 5 个 → 采纳一个 | Forward modeling: NL → competing mechanism drafts → adopt |
| 0:48–1:05 | Run → 画布网络动画 + 曲线上升 | "Deterministic Mesa kernel; every run emits a full trace." |
| 1:05–1:28 | 曲线拐点 → 刷选区间 → **ExplainInspector** 归因 (+6, 86% coverage) | "Quantitative attribution is computed from trace—not hallucinated." |
| 1:28–1:48 | 点「机制图谱」→ 传播机制节点变绿；切 attribution 模式 | "The causal graph is compiled from the kernel schema, animated by real evidence." |
| 1:48–2:05 | 对话：*"Why did infected rise here?"* → **AttributionCard** 数字与 UI 一致 | "The LLM can only cite validated trace facts." |
| 2:05–2:25 | 切 **深度实验** → agent 生成自定义 sweep 面板 → 跑一组 → 导出复现包 | "Adaptive experiment UI + one-click reproduction package." |
| 2:25–2:30 | End card: title + demo URL | — |

**优点**：最贴问题驱动论文；一条线讲清三大创新。**缺点**：探索/逆向展示弱。

---

### 录屏方案 B：**双向流 · Forward vs Inverse 分屏**

**形式**：左半屏正向（谣言建模），右半屏逆向（「 reproduce Granovetter cascade」→ 多草案 → 选 threshold 模型）。

| 时间 | 画面 | 解说要点 |
|---|---|---|
| 0:00–0:15 | 标题卡：Forward vs Inverse ABM Research | |
| 0:15–0:55 | **左**：问题→提案→SIR/rumor run→解释 | Forward: phenomenon → model → explanation |
| 0:55–1:35 | **右**：目标现象描述→5 草案→试跑 sparkline/曲线对比→采纳 social_influence | Inverse: target phenomenon → mechanism search |
| 1:35–2:05 | **全屏**：机制图谱 + ExplainInspector（用右侧采纳模型的拐点） | Shared explainability layer |
| 2:05–2:25 | 深度实验自适应 UI + export | Same orchestration powers both directions |
| 2:25–2:30 | End card | |

**优点**：差异化最强，直接打「正向+逆向」故事。**缺点**：剪辑/分屏难度高，150 秒略赶。

---

### 录屏方案 C：**三支柱快切 Montage（视觉冲击）**

**形式**：每支柱 ~45 秒，转场用 1 秒黑场 + 支柱标题。

| 时间 | 支柱 | 画面 |
|---|---|---|
| 0:00–0:45 | **Orchestration** | 6 agent 角色 Settings 卡一闪 → 对话 propose→validate→adopt→三模式切换 |
| 0:45–1:30 | **Mechanism Atlas + Explain** | 图谱编译静态图→heatmap→attribution 变绿；Inspector+聊天卡片 |
| 1:30–2:15 | **Adaptive Deep Experiment** | 用户说 sensitivity scan → 面板自动生成 → multi_line 图 → counterfactual overlay |
| 2:15–2:30 | Wrap | Fig.1 动画图 + URL |

**优点**：三大创新平均曝光；适合 reviewer 快速扫。**缺点**：故事连贯性弱，problem 铺垫少。

---

### 录屏方案 D：**对比开场 · NetLogo 痛点 → Auto-ABM（适合 Related Work 叙事）**

| 时间 | 画面 | 解说要点 |
|---|---|---|
| 0:00–0:25 | 静态 slide：NetLogo / NetLogo-MCP 能做什么、缺什么（无 ODD、无 trace-grounded explain、固定 UI） | Table 1  verbally |
| 0:25–1:40 | 同方案 A 的 core demo（压缩版） | "Auto-ABM closes these gaps…" |
| 1:40–2:20 | E2 一闪：raw LLM 编造 tick vs Auto-ABM speculative 标记 | Evaluation teaser |
| 2:20–2:30 | End | |

**优点**：对比清晰。**缺点**：前 25 秒无产品画面，风险 reviewer 没耐心。

---

### 录屏方案 E（稳妥保底）：**90 秒 Core + 60 秒 Appendix 式加速**

| 时间 | 内容 |
|---|---|
| 0:00–1:30 | 严格按 Fig.3 四步（跑→刷选归因→图谱→对话一致）— 与正文 Fig.3 1:1 对应 |
| 1:30–2:10 | 2x 速：深度实验 UI 生成 + export + 三模式 3 秒各 |
| 2:10–2:30 | 贡献 bullet + URL |

**优点**：与论文 figure 完全一致，制作最快。**缺点**：像 feature list，motivation 弱。

---

## 5. 录屏方案选择建议

| 若你优先… | 选 |
|---|---|
| 与问题驱动论文 **Narrative 一致** | **A（推荐）** 或 **E（赶时间）** |
| 突出 **正向+逆向** 差异化 | **B** |
| 三大创新 **均衡曝光** | **C** |
| Related Work / 对比 **一眼懂** | **D** |

**制作清单：**
1. 预先跑好 rumor + social_influence 两条 simulation，seed 固定。
2. 归因区间、数字（+6, 86%）提前确认与论文 Table 一致。
3. 英文解说预写逐字稿 ≈ 220–250 words（150 秒）。
4. 结尾 5 秒必须显示 **demo 安装包 URL**（今年 hard requirement）。

---

## 6. 下一步

1. 定录屏方案（A/B/C/D/E）。
2. 按 §2 骨架写英文段落草稿（可先中文要点再译）。
3. 画 Fig.1（含 forward/inverse 双箭头）。
4. 跑 E1/E2/E4（+ 可选 E6 view-spec 合法率）。
