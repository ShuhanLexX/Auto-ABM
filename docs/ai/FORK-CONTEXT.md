# 工程上下文：平台能力与 Auto-ABM 产品域

## 产品定位

| | **平台能力层** | **Auto-ABM 产品** |
| --- | --- | --- |
| 定位 | 本地 Agent 运行时、会话、工具与桌面壳 | ABM 科研工作台（仿真 + 可溯源解释） |
| 用户操作对象 | 会话、工具、配置 | Project、Simulation、Run、Trace、ODD、Experiment |
| 主界面重心 | 对话与工作台壳 | 对话 + **仿真工作区**（Interface / 画布 / Trace / ODD） |
| 对话角色 | 通用 Agent 交互 | 建模、实验、解释、导出；结论落在仿真对象上 |

## 应复用的平台能力

- **Agent 循环**：`src/tools/`、`agent-loop`、工具编排与权限确认流  
- **本地服务**：`src/server/` API / WebSocket  
- **桌面壳**：`desktop/` 布局、会话、多标签、状态管理  
- **对话与 @ 引用机制**：可扩展为 `@Simulation`、`@Run` 等  
- **提供商 / 模型路由**：`provider/runtime`  
- **质量门禁**：`AGENTS.md` 中的 `check:*` / `verify`  

## 不属于 ABM MVP 的主路径

- 以代码仓库为中心的 IDE 体验（文件树为主、终端为主）  
- IM 适配器、Computer Use、Teams 多 Agent——除非明确要求，否则不纳入 ABM 迭代  
- 分布式仿真、3D/GIS、Word/LaTeX 生态  

## 产品域目录约定

核心对象见 `core-requirements.md`：`Project` → `Simulation` → `Model` / `ODD` / `Run` / `Trace` / `Experiment`。

- 新 ABM 领域模块优先放在命名空间清晰的目录：  
  - `desktop/src/abm/` — 仿真工作区 UI  
  - `src/server/abm/` — ABM API、运行编排、持久化  
  - `packages/abm-kernel/` — 仿真内核  
- 扩展平台能力为 ABM 服务；勿复制一套平行聊天栈。  
- 平台功能**仅在为 ABM 服务时**修改；无关清理/重命名不做。  

## 判断一句话

改动是否让用户更容易完成「建仿真 → 跑实验 → 看 Trace → 得可溯源解释」？是则做，否则默认不做。
