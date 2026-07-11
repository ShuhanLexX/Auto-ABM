# Auto-ABM — 2:10 Demo 视频脚本（学术产品片版）

> 对应论文大纲：[OUTLINE.md](./OUTLINE.md)  
> 形式：**1080p 桌面录屏 + 少量非录屏产品镜头 + 英文解说**（EMNLP 国际审稿）；中文字幕可选。  
> 总时长：**130 秒（2:10）**，比原 2:30 压缩约 20 秒。  
> 视觉气质：**高级、简约、克制、科技产品宣传片**；黑白灰为主，Auto-ABM 品牌色只用于高亮 Trace / Run / Mechanism 等核心对象。  
> 叙事策略：**10 秒产品化非录屏开场 → 10 秒四宫格广度 → 一镜到底科研闭环 → 探索模式与案例库收尾**。

---

## 1. 流程细化（导演视角）

### 1.1 三幕结构

| 幕 | 时间 | 时长 | 目标 | 观众应记住的一句话 |
|---|---:|---:|---|---|
| **第一幕：定位与广度** | 0:00–0:28 | 28s | 学术问题、产品定位、模板广度 | "Auto-ABM turns ABM research into a simulation-first workflow." |
| **第二幕：深度闭环** | 0:28–1:50 | 82s | 一镜到底展示研究模式完整科研链路 | "Every model, run, trace, explanation, and export is linked." |
| **第三幕：自主与生态** | 1:50–2:10 | 20s | 自主探索 + 案例库 + 落版 | "The workbench scales from guided research to autonomous discovery." |

### 1.2 素材组织原则

| 素材 | 建议用法 | 剪辑要求 |
|---|---|---|
| **非录屏产品镜头** | 0:08–0:18，用极简动态图展示 `Question → Simulation → Run → Trace → Explanation → Experiment → Export` | 不展示代码，不放复杂架构图；像 Apple / OpenAI 风格的对象流动画，白字黑底，少量线条。 |
| **四宫格 Montage** | 0:18–0:28，只保留 **10 秒** | 四段录屏并排同时出现，不再顺序播放 20 秒；每格 10 秒内有轻微速度变化或局部 zoom。 |
| **研究模式一镜到底** | 0:28–1:50，作为正片主素材 | 可从长录屏中剪成连续感强的 jump cut；保留鼠标路径和关键点击，等待时间加速。 |
| **自主探索模式** | 1:50–2:02 | 快速展示从输入目标现象到结论报告；只保留最能证明自动试跑、排序、run_id 的片段。 |
| **案例库 / 生态** | 2:02–2:08 | 横滑或快速 filter；展示多类案例卡。 |
| **落版** | 2:08–2:10 | Demo URL + EMNLP 2026 System Demonstration。 |

### 1.3 节奏与转场

| 技巧 | 时间 | 说明 |
|---|---:|---|
| **黑底标题卡** | 0:00–0:08 | 产品名 + 一句定位；无鼠标；环境音乐渐入。 |
| **非录屏对象流动画** | 0:08–0:18 | 10 秒展示学术闭环和商业产品感；不要像论文幻灯片。 |
| **四宫格 Montage** | 0:18–0:28 | 四个录屏文件并排同时展示；每格角标 2–3 个词。 |
| **提案生成快进** | 0:36–0:45 | 3× 或跳切；保留「输入 → 草案卡 → Adopt」三拍。 |
| **运行/调参/选智能体** | 0:45–1:02 | 画布和曲线要清楚，鼠标点选智能体正常速。 |
| **解释与机制图谱** | 1:02–1:20 | 重点保留刷选区间、AttributionCard、机制图谱高亮；数字处 0.5s zoom。 |
| **深度实验与导出** | 1:20–1:38 | 输入实验意图 → 自动配置 Deep Experiment → batch → export。 |
| **模型版本 / ODD / 仿真管理** | 1:38–1:50 | 三个细节快切，但每个都要能看懂对象名。 |
| **探索模式** | 1:50–2:02 | 主体 5×；最后 2 秒正常速停在结论与 run_id。 |
| **案例库 + 落版** | 2:02–2:10 | 产品生态感，不解释太多。 |

### 1.4 主线案例选定（录制前固定）

| 项 | 选定值 | 理由 |
|---|---|---|
| 研究问题 | 平台谣言辟谣干预（`rumor` 模板） | 与论文方案 A 一致；网络画布视觉冲击强。 |
| 采纳草案 | 「接触传播 + 早期辟谣干预」机制摘要的卡片 | 机制清晰、曲线有拐点、适合归因演示。 |
| 固定 seed | `42` | 与论文评估数字对齐。 |
| 刷选区间 | tick **30–50**（infected 上升段） | 提前确认归因 coverage ≥ 80%。 |
| 深度实验 1 | 辟谣干预时点扫描 | 触发自适应 sweep 面板。 |
| 深度实验 2 | 辟谣力度稳健性 / 多随机种子 ensemble | 更贴合当前 `debunk_rate`、`infected`、replications 的稳定能力。 |
| 模型修订 | 创建 v2：调整社交网络连接结构或恢复参数 | 产生 Model v2，版本列表可见；避免正片里临场新增未验证机制。 |
| 探索模式 | 阈值级联（`social_influence`） | 与主线谣言区分，体现逆向机制发现。 |

### 1.5 四宫格 Montage 推荐组合

> 注意：四宫格从原 20 秒压缩为 **10 秒**，四段视频同时出现，不需要逐个播满 5 秒。

| 格子 | 内容 | 角标文字（英） | 视觉重点 |
|---|---|---|---|
| 左上 | Schelling 城市隔离 | Urban segregation | 网格由混杂变成清晰斑块。 |
| 右上 | 平台谣言传播 | Network rumor spread | hub 附近先爆发，再向外围扩散。 |
| 左下 | 阈值级联与集体动员 | Threshold cascades | 双社区之间跨桥后突然翻转。 |
| 右下 | 山火燃料斑块蔓延 | Spatial disaster spread | 风向驱动的斜向火线和空间前沿。 |

---

## 2. 分镜脚本（时间轴 + 画面 + 解说）

> **解说栏**：英文为录音逐字稿；括号内为中文理解辅助。  
> 建议全片英文解说约 **200 words**；留足 UI 呼吸与音乐段落。

### 【第一幕】定位与广度 · 0:00–0:28

#### Shot 1 — 标题卡 · 0:00–0:08

| 项目 | 内容 |
|---|---|
| **画面** | 黑底；`Auto-ABM` 字样居中淡入；下一行小字。 |

**屏幕文字（英）**
```text
Auto-ABM
A simulation-first workbench for agent-based modeling research
```

**屏幕文字（中）**
```text
Auto-ABM
以仿真为一等对象的 ABM 科研工作台
```

| **解说 EN** | *(no voice-over; ambient fade-in music only)* |
|---|---|
| **解说 中** | *（无解说，仅背景音乐渐入）* |

#### Shot 2 — 非录屏产品镜头：科研闭环对象流 · 0:08–0:18

| 项目 | 内容 |
|---|---|
| **画面** | 黑底极简动态图：`Research Question` → `Simulation` → `Run` → `Trace` → `Explanation` → `Experiment` → `Reproduction Package`。节点逐个点亮，Trace 节点有细线连接到 Explanation。 |
| **风格** | 不做复杂图，不做 PowerPoint 感；像产品发布会里的 capability animation。 |

**屏幕文字（英）**
```text
Not a coding IDE.
A research loop where simulations, traces, and ODD documents are first-class objects.
```

| **解说 EN** | "ABM researchers need more than code generation: they need runnable models, trace-grounded explanations, experiments, and reproducible artifacts in one loop." |
|---|---|
| **解说 中** | ABM 研究者需要的不只是代码生成，而是把可运行模型、Trace 证据解释、实验与复现产物放进同一个闭环。 |

#### Shot 3 — 四宫格 Montage · 0:18–0:28

| 项目 | 内容 |
|---|---|
| **画面** | 四个录屏素材同时进入，0.3 秒叠化；角标依次淡入；最后 0.5 秒整体缩回到 Auto-ABM 主界面。 |
| **加速** | 各格可 1.5×–2×，但不要快到看不出涌现过程。 |

| **解说 EN** | "Across classic ABM domains, Auto-ABM keeps the same workflow: propose mechanisms, run simulations, inspect traces, and explain emergence." |
|---|---|
| **解说 中** | 面向不同经典 ABM 领域，Auto-ABM 保持同一套工作流：提出机制、运行仿真、检查 Trace，并解释涌现现象。 |

---

### 【第二幕】深度闭环 · 0:28–1:50

#### Shot 4 — 研究模式入口 · 0:28–0:36

| 项目 | 内容 |
|---|---|
| **画面** | 主界面全景：左项目导航、中对话、右仿真工作区；模式为 **Research Mode**。 |
| **操作** | 鼠标停在输入框；开始输入主研究问题。 |

| **解说 EN** | "In research mode, the conversation is the entry point, but the durable objects are simulations, runs, traces, and ODD descriptions." |
|---|---|
| **解说 中** | 在研究模式里，对话是入口，但真正沉淀下来的是 Simulation、Run、Trace 和 ODD 文档。 |

#### Shot 5 — 输入问题 → 提案 → 采纳 · 0:36–0:45

| 项目 | 内容 |
|---|---|
| **画面** | 输入主研究问题；提案卡片出现；鼠标点选「谣言传播 + 早期辟谣干预」→ **Adopt**。 |
| **加速** | 卡片生成阶段 3× 或跳切；Adopt 点击正常速。 |
| **输入** | 见 [§3.1 主研究问题](#31-主研究问题研究模式)。 |

| **解说 EN** | "Here, a focused rumor-debunking question becomes adoptable simulation drafts. We choose a network model with spread, recovery, and early moderation." |
|---|---|
| **解说 中** | 这里，一个聚焦的谣言辟谣问题被转换为可采纳的仿真草案。我们选择包含传播、恢复与早期治理的网络模型。 |

#### Shot 6 — 运行、调参、选中智能体 · 0:45–1:02

| 项目 | 内容 |
|---|---|
| **画面** | 工作台展开：Interface、Run、网络画布、曲线；点击 **Run**；调整传播/治理相关参数后再次运行；点击画布中一个智能体查看状态。 |
| **剪辑** | 第一次 Run 可轻微加速；点击智能体和状态面板正常速。 |

| **解说 EN** | "The Mesa kernel runs deterministically. You can tune intervention levers, inspect individual agents, and keep macro curves synchronized with the spatial view." |
|---|---|
| **解说 中** | Mesa 内核确定性运行；你可以调节干预变量、查看个体智能体，并让宏观曲线与空间画布保持同步。 |

#### Shot 7 — 刷选区间 + Trace 归因解释 · 1:02–1:12

| 项目 | 内容 |
|---|---|
| **画面** | 在曲线/Trace 上刷选 tick 30–50；对话输入区间解释问题；AttributionCard 出现，显示 coverage 与关键机制贡献。 |
| **操作** | 对 coverage / contribution 数字做 0.5 秒局部 zoom。 |
| **输入** | 见 [§3.2 区间解释](#32-区间解释研究模式)。 |

| **解说 EN** | "When we brush a growth interval, attribution is computed from trace records, not invented by the language model." |
|---|---|
| **解说 中** | 当我们刷选增长区间时，归因来自 Trace 记录计算，而不是由语言模型编造。 |

#### Shot 8 — 机制图谱联动 · 1:12–1:20

| 项目 | 内容 |
|---|---|
| **画面** | 切到 **Mechanism Atlas**；Trigger heat 模式节点变亮；切到 Attribution 模式，边和节点显示正负贡献。 |
| **操作** | 与 Shot 7 的同一区间保持高亮一致。 |

| **解说 EN** | "The mechanism atlas is compiled from the model schema and animated with the same evidence behind the explanation card." |
|---|---|
| **解说 中** | 机制图谱由模型 schema 编译而来，并由解释卡背后的同一份证据驱动。 |

#### Shot 9 — 深度实验 ①：干预时点扫描 · 1:20–1:30

| 项目 | 内容 |
|---|---|
| **画面** | 对话输入深度实验需求；切到 **Deep Experiment** 面板；自动生成 sweep 控件和 line chart；点击 Run batch；出现结果曲线。 |
| **输入** | 见 [§3.3 深度实验 ①](#33-深度实验--干预时点扫描)。 |

| **解说 EN** | "For deeper analysis, Auto-ABM synthesizes an experiment workspace from intent, then binds charts to real batch runs." |
|---|---|
| **解说 中** | 对于更深入的分析，Auto-ABM 根据实验意图生成实验工作台，并把图表绑定到真实批量运行。 |

#### Shot 10 — 深度实验 ② + 导出复现包 · 1:30–1:38

| 项目 | 内容 |
|---|---|
| **画面** | 输入稳健性/辟谣力度比较需求；实验面板变为 multi-line 或多次重复结果；点击 **Export reproduction package**。 |
| **输入** | 见 [§3.4 深度实验 ②](#34-深度实验--稳健性--辟谣力度)。 |

| **解说 EN** | "A robustness study reuses the same real-run pipeline, and the final package preserves the model, ODD, seeds, runs, and results." |
|---|---|
| **解说 中** | 稳健性研究复用同一条真实运行管线；最终复现包保留模型、ODD、种子、运行与结果。 |

#### Shot 11 — 模型修订与版本化 · 1:38–1:44

| 项目 | 内容 |
|---|---|
| **画面** | 对话输入模型修订；Permission 确认；接受后仿真管理中出现 **Model v2**。 |
| **输入** | 见 [§3.5 模型结构修订](#35-模型结构修订)。 |

| **解说 EN** | "Natural-language model revisions are reviewed, versioned, and kept traceable." |
|---|---|
| **解说 中** | 自然语言模型修订会被审核、版本化，并保持可追溯。 |

#### Shot 12 — ODD / 智能体 / 仿真管理快切 · 1:44–1:50

| 项目 | 内容 |
|---|---|
| **画面 A** | ODD 七部分文档，Process ↔ 机制图谱跳转。 |
| **画面 B** | 智能体面板，查看某个智能体状态/行为绑定。 |
| **画面 C** | 仿真管理，v1 / v2、Run 列表、实验记录。 |

| **解说 EN** | "ODD documentation, agent inspection, and simulation management stay aligned with the live model." |
|---|---|
| **解说 中** | ODD 文档、智能体查看与仿真管理始终与当前模型保持一致。 |

---

### 【第三幕】自主与生态 · 1:50–2:10

#### Shot 13 — 自主探索模式 · 1:50–2:02

| 项目 | 内容 |
|---|---|
| **画面** | 切换 **Autonomous / Exploration Mode**；输入目标现象；自动提案 → 试跑 sparkline → 排序 → 报告；最后停在报告里的 `run_id` 与结论。 |
| **加速** | 主体 5×；最后 2 秒正常速。 |
| **输入** | 见 [§3.6 自主探索模式](#36-自主探索模式)。 |

| **解说 EN** | "In exploration mode, the system searches for mechanisms that reproduce a target phenomenon, ranking claims only when they link back to real run IDs." |
|---|---|
| **解说 中** | 探索模式会搜索能复现目标现象的机制；只有能链接到真实 run_id 的结果才进入排序和报告。 |

#### Shot 14 — 案例库 + 落版 · 2:02–2:10

| 项目 | 内容 |
|---|---|
| **画面** | 打开 **Case Library**；横滑展示多分类案例卡；2:08 切黑场落版。 |

**落版文字（英）**
```text
Auto-ABM
Demo & Install: <your-demo-url>
EMNLP 2026 System Demonstration
```

| **解说 EN** | "A curated case library makes the same workflow ready to import, run, and extend." |
|---|---|
| **解说 中** | 精选案例库让同一套工作流可以被导入、运行并扩展。 |

---

## 3. 演示输入文案（优化版）

> 录制原则：输入文案要像研究者提出问题，而不是像工程师配置智能体数量。  
> **不要在正片输入里设置智能体数量、网格尺寸、节点数量等规模参数**；规模感交给预置模板、UI 参数和画面呈现。

### 3.1 主研究问题（研究模式）

**主选**
```text
On a social network, study whether early debunking lowers the peak of a platform rumor.
```
**中文**：在社交网络上研究早期辟谣是否能降低平台谣言传播峰值。

**备用 A**
```text
Model a platform rumor and test how debunking timing changes the infected curve.
```
**中文**：建模一个平台谣言，并测试辟谣时机如何改变 infected 曲线。

**备用 B**
```text
Build a runnable rumor-spread simulation with recovery and a debunking intervention.
```
**中文**：构建一个可运行的谣言传播仿真，包含恢复过程和辟谣干预。

**备用 C**
```text
I want to see how early versus late moderation changes rumor spread on a contact network.
```
**中文**：我想看看早期治理与晚期治理如何改变接触网络上的谣言传播。

### 3.2 区间解释（研究模式）

**主选**（刷选 tick 30–50 后发送）
```text
@Run Explain the selected rise in the infected curve using trace evidence.
```
**中文**：@本次运行 用 Trace 证据解释我选中的 infected 曲线上升区间。

**备用 A**
```text
@Run Which mechanisms contributed most during this selected interval?
```
**中文**：@本次运行 这个选中区间里哪些机制贡献最大？

**备用 B**
```text
What changed during this interval? Use the run trace, not general intuition.
```
**中文**：这个区间里发生了什么变化？请使用本次运行 Trace，而不是泛泛解释。

**备用 C**
```text
Summarize this selected segment as a trace-grounded explanation.
```
**中文**：把这个选中的片段总结成基于 Trace 的解释。

### 3.3 深度实验 ① — 干预时点扫描

**主选**
```text
@Simulation Sweep debunking start time and show how it changes the infected peak.
```
**中文**：@当前仿真 围绕辟谣开始时机运行深度实验，展示更早或更晚干预如何改变感染峰值。

**备用 A**
```text
Compare early, middle, and late debunking with the same infected metric.
```
**中文**：用同一个 infected 指标比较早期、中期和晚期辟谣。

**备用 B**
```text
Show a simple sensitivity sweep for intervention_start.
```
**中文**：展示一个针对 intervention_start 的简单敏感性扫描。

**备用 C**
```text
Create an experiment view for debunking timing versus peak infected.
```
**中文**：创建一个实验视图，比较辟谣时机与感染峰值。

### 3.4 深度实验 ② — 稳健性 + 辟谣力度

**主选**
```text
@Simulation Repeat the debunking-rate sweep across several random seeds and show infected trajectories.
```
**中文**：@当前仿真 在多个随机种子下重复辟谣力度扫描，并展示 infected 轨迹。

**备用 A**
```text
Run a robustness check for low, medium, and high debunking rates over repeated runs.
```
**中文**：对低、中、高辟谣力度做重复运行的稳健性检查。

**备用 B**
```text
Run a robustness batch for early versus late intervention and plot the trajectory envelope.
```
**中文**：为早期与晚期干预运行稳健性批次，并绘制轨迹包络。

**备用 C**
```text
Check whether the main debunking result holds across repeated runs.
```
**中文**：检查主要辟谣结果在多次重复运行中是否仍然成立。

### 3.5 模型结构修订

**主选**
```text
@Simulation Create a v2 branch with a denser contact network and update the ODD description.
```
**中文**：@当前仿真 创建一个 v2 分支，使用更密集的接触网络，并更新 ODD 描述。

**备用 A**
```text
Increase the recovery probability slightly and validate the updated simulation.
```
**中文**：略微提高恢复概率，并校验更新后的仿真。

**备用 B**
```text
Create a comparison run that delays the intervention and keep the result linked to this simulation.
```
**中文**：创建一个延迟干预的对比运行，并将结果链接到当前仿真。

**备用 C**
```text
Update the model notes and ODD so the intervention assumptions are explicit.
```
**中文**：更新模型说明和 ODD，让干预假设更明确。

### 3.6 自主探索模式

**主选**
```text
Find a threshold-cascade model where a small initial push can trigger broad activation near a tipping point.
```
**中文**：寻找能复现 Granovetter 式阈值级联的机制模型：只有接近临界点时，小的初始推动才会导致全局激活。

**备用 A**
```text
Explore which threshold settings generate a sharp adoption S-curve, then rank the runs by trace-backed fit.
```
**中文**：自主探索哪些机制能生成陡峭的采纳 S 曲线，并按 Trace 支撑的拟合程度排序候选方案。

**备用 B**
```text
Discover models where mild local preferences can still produce strong spatial segregation, and report the best-supported explanation.
```
**中文**：发现哪些模型能让轻微局部偏好仍然产生强空间隔离，并报告证据最充分的解释。

**备用 C**
```text
Target phenomenon: a small active group triggers a broad threshold cascade. Propose, trial-run, and rank candidate models.
```
**中文**：目标现象：一个小的活跃群体触发大范围阈值级联；提案、试跑并排序候选模型。

### 3.7 四宫格预录提示词（不进正片也可用于生成素材）

> 四宫格素材可以提前录制，不需要在正片完整展示输入过程。以下提示词强调现象，不设置智能体数量。

| 格子 | 建议输入（英） | 录制时应追求的视觉差异 |
|---|---|---|
| Schelling | `Create a Schelling-style segregation simulation where mild neighborhood preference gradually forms visible spatial clusters.` | 颜色块要大、边界要清楚，呈现从混杂到分区的过程。 |
| Rumor | `Build a rumor diffusion model where a few central accounts trigger rapid contact-based spread before moderation begins.` | 先从中心节点爆发，再向外围多圈层扩散。 |
| Cascade | `Create a threshold cascade model where activation crosses a bridge between communities and then flips the second community abruptly.` | 与谣言网络拉开差别，重点是跨社区临界翻转。 |
| Wildfire | `Create a wildfire spread simulation with heterogeneous fuel patches, wind-driven directionality, and visible firebreak effects.` | 做出明显空间前沿、风偏、绕开低燃料区或防火带。 |

---

## 4. 录制素材到成片的剪辑表

| 成片段落 | 使用素材 | 目标时长 | 剪辑说明 |
|---|---|---:|---|
| 标题卡 | 新做非录屏 | 8s | 黑底、品牌名、无解说。 |
| 对象流动画 | 新做非录屏 | 10s | 展示科研闭环，不录桌面。 |
| 四宫格 | 4 个录屏文件 | 10s | 四个视频并排同时播放；角标 + 轻微 zoom。 |
| 研究模式主线 | 一镜到底录屏 | 82s | 从长录屏中剪掉等待、加载、重复操作；保留连续感。 |
| 自主探索 | 探索模式录屏 | 12s | 5× 快进 + 报告正常速停顿。 |
| 案例库 | 案例库/其他功能录屏 | 6s | 只展示广度，不展开讲解。 |
| 落版 | 新做非录屏 | 2s | URL 必须清楚可读。 |

---

## 5. 录制前检查清单

- [ ] 主案例 `rumor-platform-moderation` 已预跑，seed=42，归因区间 30–50 数字与 UI 一致。
- [ ] 四宫格 Montage 四段素材已单独录好，并能并排压缩到 10 秒仍看得出差异。
- [ ] 研究模式长录屏覆盖：输入问题、生成方案、选择方案、跑实验、调参重跑、点选智能体、刷选结果区间、区间对话、跳到机制图谱、深度实验、导出、查看智能体、ODD、仿真管理、切换版本。
- [ ] 探索模式 `social_influence` / threshold cascade 已跑通，报告含真实 `run_id`。
- [ ] 深度实验 ①② 各预演一次，确认 UI spec 合法，实验能运行，并能绑定真实结果图。
- [ ] Model v2 优化指令已测，仿真管理版本列表可见。
- [ ] 案例库可打开，至少展示 6 张卡，覆盖不同 model family / category。
- [ ] 非录屏对象流动画已导出为 1080p，字体和产品名与桌面 UI 风格一致。
- [ ] 落版 URL 已填入论文与录屏；结尾可读且无遮挡。
- [ ] 英文解说预读 ≤ 130 秒；音乐不压过关键词 `trace`, `ODD`, `reproducible`。

---

## 6. 与 OUTLINE 方案对照

| OUTLINE 方案 | 本脚本对应 |
|---|---|
| **A（单故事线）** | 第二幕 Shot 4–12 是主线核心。 |
| **B（正向+逆向）** | 正向 = 谣言研究模式；逆向 = Shot 13 探索模式。 |
| **C（三支柱 Montage）** | Shot 2 对象流 + Shot 7–10 的解释/图谱/深度实验。 |
| **商业产品片风格** | Shot 1–2 与 Shot 14 落版承担；中段仍保持学术证据链。 |

**推荐论文截帧**：优先取 **Shot 7–8**（Trace 归因 + 机制图谱）与 **Shot 9–10**（自适应深度实验 UI + 导出）。

---

## 7. 解说全文汇总（英文，可直接录音）

```text
ABM researchers need more than code generation: they need runnable models, trace-grounded explanations, experiments, and reproducible artifacts in one loop.

Across classic ABM domains, Auto-ABM keeps the same workflow: propose mechanisms, run simulations, inspect traces, and explain emergence.

In research mode, the conversation is the entry point, but the durable objects are simulations, runs, traces, and ODD descriptions.

Here, a focused rumor-debunking question becomes adoptable simulation drafts. We choose a network model with spread, recovery, and early moderation.

The Mesa kernel runs deterministically. You can tune intervention levers, inspect individual agents, and keep macro curves synchronized with the spatial view.

When we brush a growth interval, attribution is computed from trace records, not invented by the language model.

The mechanism atlas is compiled from the model schema and animated with the same evidence behind the explanation card.

For deeper analysis, Auto-ABM synthesizes an experiment workspace from intent, then binds charts to real batch runs.

A robustness study reuses the same real-run pipeline, and the final package preserves the model, ODD, seeds, runs, and results.

Natural-language model revisions are reviewed, versioned, and kept traceable.

ODD documentation, agent inspection, and simulation management stay aligned with the live model.

In exploration mode, the system searches for mechanisms that reproduce a target phenomenon, ranking claims only when they link back to real run IDs.

A curated case library makes the same workflow ready to import, run, and extend.
```

**Word count**: ~205 words。按 130 秒约 1.58 words/s；其中 0:00–0:08 无解说，实际朗读更从容。
