# 工程面路由（ABM 能力落点）

任务开始时声明 **changed surface**（与 `AGENTS.md` 一致），并按下表判断 ABM 相关工作主要落在哪。

| Surface | 路径（典型） | ABM 相关职责 |
| --- | --- | --- |
| `desktop` | `desktop/src/` | 三栏布局、仿真工作区、Interface/画布/Trace/ODD 面板、`@` 引用 UI、实验图表 |
| `server` | `src/server/` | ABM REST/WS、Run 调度、Trace 存储与查询、草案生成 API、复现包导出 |
| `agent-loop` | `src/tools/`、会话执行链 | 自然语言 → 草案/改 Model/解释请求的工具与提示边界 |
| `provider/runtime` | 提供商代理、模型选择 | 解释/草案生成的模型路由（复用底座） |
| `native` | `desktop/electron/` | 仅当打包、侧车、本地仿真进程需要时 |
| `adapter` | `adapters/` | ABM MVP 通常**不碰** |
| `docs` | `docs/` | 仅 Boss 要求更新用户文档时 |
| `release` | `release-notes/`、CI | 版本发布时 |

## 横切关注点

| 关注点 | 首选落点 | 备注 |
| --- | --- | --- |
| ABM 领域类型与校验 | `src/server/abm/` 或共享 `src/abm/types` | 前后端共用类型避免漂移 |
| 仿真执行与 Trace 产出 | `src/server/abm/` + runtime 子模块 | 确定性 Run；完整 Trace |
| 对话绑定 Simulation | `desktop` store + `server` 会话元数据 | 默认当前 Simulation；`@` 显式指定 |
| 持久化 / 迁移 | `server` + `check:persistence-upgrade` | 新 JSON 形状必须可升级 |
| 可解释性请求 | `server` 组 Trace 上下文 → `agent-loop` | 输入必须含 Trace 片段与 ODD 引用 |

## 验证路由（ABM 增量）

在 `AGENTS.md` 通用路由之上：

| 改动 | 最低验证 |
| --- | --- |
| ABM UI | `bun run check:desktop` + 相关 Vitest |
| ABM API / Run / Trace | `bun run check:server` + 请求形状测试 |
| 跨桌面+服务+会话 | 窄 E2E 或 agent-browser smoke |
| 持久化形状 | `bun run check:persistence-upgrade` |

PR 级门禁仍用 `bun run verify`；日常迭代用窄测试，不默认跑全量。

## 探索代码时

1. 先 `rg` 目标对象名（`Simulation`、`Trace`、`ODD`）——可能尚未存在。  
2. 不存在则按 `FORK-CONTEXT.md` 命名空间**新建**，勿塞进无关 `chatStore` 逻辑深处。  
3. 复用模式：对照现有 `desktop/src/api/`、`src/server/api/` 注册方式与 store 模式。
