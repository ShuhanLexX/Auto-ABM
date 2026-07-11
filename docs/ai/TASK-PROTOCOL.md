# Boss ↔ Agent 任务协议

## 角色

| 角色 | 职责 |
| --- | --- |
| **Boss（人类）** | 产品方向、优先级、范围取舍、验收、合并 |
| **Agent（你）** | 读规范、探代码、实现、验证、交接说明 |

Boss 指令可能简短、口语化；Agent 须**结构化理解**后再动手。

## 接到任务后的固定步骤

1. **读**：`docs/ai/INDEX.md` 顺序中与本任务相关的部分（至少 `PRODUCT-CONSTRAINTS` + `SURFACE-ROUTING`）。  
2. **解析任务**（内心或简短写出）：  
   - 目标对象：`Project` / `Simulation` / `Run` / …  
   - 工程面：`desktop` | `server` | `agent-loop` | …  
   - 是否在 MVP 内  
   - 验收标准（怎样算完成）  
3. **`git status --short`**：不覆盖他人未提交改动。  
4. **实现**：最小 diff；复用底座；每行变更能追溯到任务或测试。  
5. **验证**：按 `SURFACE-ROUTING` 与 `AGENTS.md` 跑窄门禁。  
6. **交接**（见下）。

## 必须请示 Boss 的情况

- 产品分叉：两种对象模型或交互都合理  
- 扩大/缩小 MVP 范围  
- 破坏性迁移、删除用户数据路径、修改 `core-requirements.md` 语义  
- 依赖新的大版本第三方库或新子系统  
- 底座能力大删改（IM、Teams 等）且非 ABM 所需  

**不要**为显而易见的小步（修 typo、补测试、按规范实现已定义 MVP 项）反复确认。

## 不必请示的情况

- 按 `core-requirements.md` 与 `docs/ai/*` 已定义内容实现  
- 选已有项目模式（store、API route、Vitest 夹具）  
- 跑文档规定的验证命令  
- 在约定目录新建 ABM 模块  

## 交接格式（每次任务结束）

```text
## 变更
- 文件列表（仅本次有意修改）

## 验证
- 已跑：…
- 未跑：…（及原因）

## 风险 / 回滚
- …

## 待 Boss 决定（若有）
- …
```

声称 **PR-ready / 可合并** 前须满足 `AGENTS.md` Feature Quality Contract；普通本地交接不必跑全量 `verify`。

## 指令歧义时

1. 优先符合 `core-requirements.md` 与 MVP 列表  
2. 仍歧义 → **一次**列出 2 个interpretation + 推荐项，请 Boss 择一  
3. 禁止静默选择偏离产品的方案  

## 与 Cursor Rules 的关系

`.cursor/rules/*.mdc` 是本协议的持久化摘要；冲突时以 `docs/ai/` 全文为准。
