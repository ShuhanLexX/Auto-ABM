# 产品约束（Agent 决策护栏）

浓缩自 `core-requirements.md`。编码前对照；有歧义时回到全文。

## 一等对象

用户心智中的实体（实现须可持久化、可引用、可溯源）：

`Project` → `Simulation` → (`Model`, `ODD`, `Interface`, `Runs[]`, `Experiments[]`)  
旁路：`Conversations[]`、`Artifacts[]`

- **Simulation**：稳定身份；可 fork；可被 `@` 引用。  
- **Model**：可执行；结构变更 → 版本递增。  
- **ODD**：与 Model 版本绑定；七部分；Model 变更触发增量同步。  
- **Run**：绑定 seed、参数快照、Model 版本 → 产出 **Trace**。  
- **Trace**：可解释性的数据根（tick 指标、事件、`mechanism_fired`）。  

## 交互铁律

1. **结论落在对象上**：对话是入口；解释、图表、报告必须链到 Simulation / Run / Trace / ODD。  
2. **证据链**：解释须引用 Trace/指标；无证据标「推测」；**禁止编造**运行结果或吻合度。  
3. **仿真工作区为中心**：Interface、画布、Trace 擦洗、ODD 对照——MVP 先打通**单个 Simulation** 闭环。  
4. **非 IDE 形态**：默认不引导用户写 Mesa/改仓库；代码与文件按需展开。  

## 三种模式

| 模式 | Agent 行为 |
| --- | --- |
| 研究模式（默认） | 可改 Model/跑实验；结构变更、大规模批量、覆盖结果、导出复现包 → **须用户确认** |
| 对话模式 | 只读问答；不产生变更 |
| 探索模式 | 无人值守多方案试跑；报告数值必须来自真实 `run_id`（MVP 可后置） |

## MVP 边界（做）

1. 单 Simulation 工作区（Interface + 画布 + Trace + ODD 只读/基础编辑）  
2. 一批 Simulation 草案 → 择一采纳  
3. 区间解释 + 机制归因（可解释性最小闭环）  
4. `@Simulation` 单参扫描  
5. 研究模式 + 对话模式  
6. 复现包导出（含 ODD）  

## MVP 边界（不做）

- 探索模式全流程、反事实增强、多 Simulation 对比树（列后续，不偷跑）  
- 代码/终端中心 IDE、分布式仿真、3D/GIS、Word/LaTeX  

## 非功能（与功能同等优先）

- **可复现**：seed、参数、Model 版本全记录  
- **可解释**：见证据链铁律  
- **真实性**：探索模式亦禁止伪造  
- **轻量**：工作区信息密度高、操作路径短  

## 实现时的禁止项

- 用自由文本替代 Trace 结构做「解释」  
- 在 UI 主路径突出 git diff / 文件树而弱化仿真区  
- 为 ABM 对象发明与上文不一致的命名或层级（除非 Boss 修订 `core-requirements.md`）  
- 未经确认覆盖用户 ODD 手写段落（应增量合并并标冲突）  
