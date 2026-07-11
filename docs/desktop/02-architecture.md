# 架构设计

> 从 Electron host 到 CLI 子进程，桌面端的三层通信架构。

---

## 技术栈

### 前端

| 技术 | 版本 | 职责 |
|------|------|------|
| React | 18 | UI 框架 |
| Zustand | 5 | 状态管理 |
| Vite | 6 | 构建工具 |
| Tailwind CSS | 4 | 样式 |
| Shiki | 4 | 代码高亮 |
| Mermaid | 11 | 图表渲染 |
| marked + DOMPurify | - | Markdown 渲染 |
| react-diff-viewer | 4 | Diff 展示 |
| Lucide React | - | 图标 |

### 桌面层

| 技术 | 版本 | 职责 |
|------|------|------|
| Electron | - | 跨平台桌面 host，管理 Chromium renderer、窗口、IPC 和系统能力 |
| electron-builder | - | macOS/Windows/Linux 打包与 release artifact 生成 |
| electron-updater | - | 自动更新检查、下载与安装 |
| node-pty | - | Electron main 中的终端 PTY runtime |
| `desktop/src-tauri` 资源目录 | - | 历史资源位置，暂存 sidecar 二进制、图标和 preview agent；不再作为桌面 runtime |

### 服务端

| 技术 | 职责 |
|------|------|
| Bun | 运行时 + 构建工具 |
| Bun.serve | HTTP/WebSocket 服务器 |

### 字体

- **Inter** — 正文
- **Manrope** — 标题
- **JetBrains Mono** — 代码
- **Material Symbols Outlined** — 图标

---

## 三层架构

```
┌─────────────────────────────────────┐
│         Electron Host (main/preload) │
│  ┌─────────────────────────────┐    │
│  │   Chromium Renderer         │    │  ← React 用户界面
│  └───────────┬─────────────────┘    │
│              │ HTTP + WebSocket      │
│  ┌───────────▼─────────────────┐    │
│  │   Server Sidecar (Bun)      │    │  ← API 服务 + 会话管理
│  │   Port: 动态分配             │    │
│  └───────────┬─────────────────┘    │
│              │ 子进程 spawn          │
│  ┌───────────▼─────────────────┐    │
│  │   CLI 子进程                 │    │  ← AI 对话 + 工具执行
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   Adapter Sidecar (可选)    │    │  ← Telegram/飞书接入
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 第一层：Electron Host

**职责**：窗口管理、Sidecar 进程编排、原生 API 桥接

核心文件位于 `desktop/electron/`，通过 preload 暴露 `window.desktopHost`，renderer 只调用 typed host contract，不直接调用 Electron IPC。

| 能力 | 说明 |
|------|------|
| `runtime.getServerUrl` | 前端获取 Server Sidecar 的 HTTP 地址 |
| `dialogs.open/save` | 系统文件/目录选择与保存对话框 |
| `shell.open/openPath` | 外链与本地路径打开，main 侧做 scheme/path allowlist |
| `updates.check/download/install` | electron-updater 检查、下载、安装与 relaunch |
| `terminal.*` | node-pty 会话创建、写入、resize、kill 和事件转发 |
| `preview.*` | WebContentsView 预览面板与 preview-agent message bridge |
| `appMode.*` | 默认/便携模式和 `CLAUDE_CONFIG_DIR` 启动语义 |

**状态管理**：

| 模块 | 说明 |
|------|------|
| `serverRuntime.ts` | server/adapters sidecar 生命周期、动态端口、日志和 env 注入 |
| `sidecarManager.ts` | sidecar 二进制定位、参数构造、子进程管理 |
| `windows.ts` | 窗口状态持久化、显示/聚焦、close-to-hide 生命周期 |
| `updater.ts` | 更新元数据归一化、下载进度和安装前状态校验 |

**启动流程**：

1. 应用启动时解析便携模式，必要时设置 `CLAUDE_CONFIG_DIR`。
2. 创建 `BrowserWindow` 并注入 preload host；dev 模式只允许 localhost renderer，packaged 模式加载 `app.asar/dist/index.html`。
3. renderer 调用 `runtime.getServerUrl()`，Electron host 启动 `claude-sidecar server --app-root ... --host 0.0.0.0 --port {dynamic}`。
4. server 健康检查通过后，React 继续加载设置、会话和 WebSocket。
5. 修改 IM adapter 配置后，renderer 调用 `adapters.restartSidecar()`，host 重启 `claude-sidecar adapters` 并注入 `ADAPTER_SERVER_URL`。

**退出处理**：窗口默认 close-to-hide；明确退出、更新安装或 app mode restart 前会停止 server/adapters sidecar。

**平台差异**：
- **macOS**：overlay titlebar + 自定义菜单（关于、设置 Cmd+,、编辑、窗口）
- **Windows**：`set_decorations(false)` 隐藏原生标题栏，前端自定义渲染 `TitleBar` + `WindowControls`

### 第二层：Server Sidecar

**职责**：HTTP REST API + WebSocket 网关 + 会话管理 + 协议代理

核心文件 `src/server/`（项目根目录），分层结构：

```
src/server/
├── index.ts              # 入口
├── server.ts             # HTTP 服务器
├── router.ts             # 路由注册
├── sessionManager.ts     # 会话管理器
├── api/                  # REST 路由层 (14 个模块)
├── services/             # 业务服务层 (14 个模块)
├── ws/                   # WebSocket 处理
├── proxy/                # API 代理（Anthropic/OpenAI 协议转换）
├── middleware/            # auth、cors、errorHandler
└── config/               # Provider 预设
```

### 第三层：CLI 子进程

**职责**：AI 对话核心、工具执行、Agent 编排

Server 为每个 Session spawn 一个 CLI 子进程，通过 stdin/stdout JSON 通信。

### Sidecar 构建

使用 Bun 编译为独立二进制（`desktop/scripts/build-sidecars.ts`）：

三种模式共用一个入口 `desktop/sidecars/claude-sidecar.ts`：
- `server` — 启动 HTTP/WS 服务
- `cli` — 启动 CLI 子进程
- `adapters` — 启动 IM 适配器（解析 `--feishu`/`--telegram` 参数，检查凭据后按需加载）

编译产物仍放置在 `desktop/src-tauri/binaries/`，作为历史稳定资源目录；Electron Builder 通过 `files` 和 `asarUnpack` 把它们打入 `app.asar.unpacked`。

---

## WebSocket 通信协议

### 连接地址

```
ws://127.0.0.1:{port}/ws/{sessionId}
```

前端通过 `WebSocketManager`（per-session 连接）管理，支持自动重连、消息队列缓冲、ping 心跳保活。

### 客户端 → 服务端

| type | 说明 |
|------|------|
| `user_message` | 用户消息（含 content, attachments） |
| `permission_response` | 权限审批（requestId, allowed, rule） |
| `set_permission_mode` | 切换权限模式 |
| `stop_generation` | 停止生成 |
| `ping` | 心跳 |

### 服务端 → 客户端

| type | 说明 |
|------|------|
| `connected` | 连接成功 |
| `status` | 状态变更（thinking/generating） |
| `content_start` / `content_delta` | 流式文本 |
| `thinking` | Extended Thinking |
| `tool_use_complete` | 工具调用就绪 |
| `tool_result` | 工具执行结果 |
| `permission_request` | 权限请求 |
| `message_complete` | 消息完成（含 Token 统计） |
| `error` | 错误通知 |
| `session_title_updated` | 标题更新 |
| `team_update` / `team_created` / `team_deleted` | 团队事件 |
| `task_update` | 任务变更 |
| `pong` | 心跳响应 |

### 连接管理

- **心跳**：30s 间隔 ping/pong
- **重连**：指数退避 `min(1000ms × 2^n, 30000ms)`，最多 10 次
- **缓冲**：未连接时消息暂存队列，恢复后自动发送

---

## HTTP API

### 会话

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/sessions` | 列表（支持 project/limit/offset 筛选） |
| `POST` | `/api/sessions` | 创建 |
| `GET` | `/api/sessions/:id/messages` | 历史消息 |
| `PATCH` | `/api/sessions/:id` | 重命名 |
| `DELETE` | `/api/sessions/:id` | 删除 |
| `GET` | `/api/sessions/:id/git-info` | Git 信息 |
| `GET` | `/api/sessions/:id/slash-commands` | 可用斜杠命令 |
| `GET` | `/api/sessions/recent-projects` | 最近项目 |

### 模型与提供商

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET/PUT` | `/api/models/current` | 当前模型 |
| `GET` | `/api/models` | 可用模型列表 |
| `GET/PUT` | `/api/effort` | Effort 级别 |
| `GET/POST/PUT/DELETE` | `/api/providers` | 提供商 CRUD |
| `POST` | `/api/providers/:id/activate` | 激活 |
| `POST` | `/api/providers/:id/test` | 测试连接 |
| `GET` | `/api/providers/presets` | 预设列表 |

### 定时任务

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET/POST/PUT/DELETE` | `/api/scheduled-tasks` | 任务 CRUD |
| `POST` | `/api/scheduled-tasks/:id/run` | 手动运行 |
| `GET` | `/api/scheduled-tasks/runs` | 运行记录 |

### 其他

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/teams` | Agent 团队 |
| `GET` | `/api/teams/:name/members/:agentId/transcript` | 成员转录 |
| `GET` | `/api/agents` | Agent 定义 |
| `GET` | `/api/skills` | 技能列表 |
| `GET/PUT` | `/api/adapters` | 适配器配置 |
| `GET/PUT` | `/api/settings/user` | 用户设置 |
| `GET/PUT` | `/api/permissions/mode` | 权限模式 |
| `GET` | `/api/tasks/lists` | CLI 任务清单 |
| `GET` | `/health` | 健康检查 |

---

## 状态管理

使用 Zustand，按领域拆分为 12 个 Store：

| Store | 核心状态 |
|-------|----------|
| `chatStore` | per-session 消息、流式状态、权限请求、Token 统计 |
| `sessionStore` | 会话列表、activeSessionId、项目筛选 |
| `tabStore` | 标签页顺序（localStorage 持久化） |
| `settingsStore` | 权限模式、当前模型、effort、语言 |
| `providerStore` | Provider 列表、activeId |
| `uiStore` | 主题、侧边栏、activeView、Toast、设置标签页 |
| `taskStore` | 定时任务、运行记录 |
| `teamStore` | 团队列表、成员转录轮询 |
| `agentStore` | Agent 定义列表 |
| `skillStore` | 技能元数据、详情 |
| `adapterStore` | 适配器配置、配对码 |
| `cliTaskStore` | per-session CLI 任务追踪 |

### 数据流

```
用户操作 → Component → Store → API/WebSocket → Server → Store → Component 重渲染
```

### 持久化

| 数据 | 存储 |
|------|------|
| 标签页状态 | `localStorage` |
| 语言偏好 | `localStorage` |
| 会话数据 | Server JSONL (`~/.claude/sessions/`) |
| 设置 | Server API |
| 适配器配置 | `~/.claude/adapters.json` |

---

## 协议代理层

Server 内置代理层（`src/server/proxy/`），统一不同 AI 提供商的 API 格式。

### 支持格式

| 格式 | 典型提供商 |
|------|-----------|
| `anthropic` | Anthropic、OpenRouter、MiniMax |
| `openai_chat` | OpenAI、DeepSeek、Ollama |
| `openai_responses` | OpenAI Responses API |

### 模型映射

每个 Provider 配置 4 个模型槽位：`main`、`haiku`、`sonnet`、`opus`，前端按槽位名调用，代理层自动映射为实际模型名。

---

## 适配器架构

适配器系统让 Telegram/飞书等 IM 平台接入 Claude Code。

```
IM 平台 → Adapter 进程 → HTTP + WebSocket → Server → CLI
```

### 共享模块 `adapters/common/`

| 模块 | 职责 |
|------|------|
| `config.ts` | 配置加载（env > JSON > 默认值） |
| `ws-bridge.ts` | WebSocket 桥接（心跳、重连、消息路由） |
| `pairing.ts` | 用户配对（6 位安全码、速率限制） |
| `session-store.ts` | Chat → Session 映射持久化 |
| `message-buffer.ts` | 流式缓冲（500ms / 200 字符阈值） |
| `message-dedup.ts` | 消息去重 |
| `chat-queue.ts` | 同一 Chat 消息串行队列 |
| `http-client.ts` | HTTP 客户端 |

### 分片限制

- Telegram: 4000 字符/消息
- 飞书: 30000 字符/消息

---

## 项目目录结构

```
desktop/
├── src/                              # React 前端
│   ├── api/                         #   API 客户端 (15 个模块)
│   ├── components/
│   │   ├── layout/                  #   AppShell, Sidebar, TabBar, TitleBar,
│   │   │                            #   WindowControls, StatusBar, ContentRouter,
│   │   │                            #   ProjectFilter
│   │   ├── chat/                    #   ChatInput, MessageList, AssistantMessage,
│   │   │                            #   ToolCallBlock, ToolCallGroup, ThinkingBlock,
│   │   │                            #   PermissionDialog, CodeViewer, DiffViewer,
│   │   │                            #   ImageGalleryModal, StreamingIndicator ...
│   │   ├── shared/                  #   Button, Modal, Toast, Spinner,
│   │   │                            #   UpdateChecker, DirectoryPicker ...
│   │   ├── controls/                #   ModelSelector, PermissionModeSelector
│   │   ├── markdown/                #   MarkdownRenderer, MermaidRenderer
│   │   ├── skills/                  #   SkillList, SkillDetail
│   │   ├── tasks/                   #   TaskList, TaskRow, NewTaskModal,
│   │   │                            #   DayOfWeekPicker, PromptEditor ...
│   │   └── teams/                   #   TeamStatusBar
│   ├── pages/                       #   ActiveSession, EmptySession, Settings,
│   │                                #   AdapterSettings, AgentTeams, ScheduledTasks,
│   │                                #   ComputerUseSettings, ToolInspection ...
│   ├── stores/                      #   12 个 Zustand store
│   ├── types/                       #   TypeScript 类型 (9 个模块)
│   ├── hooks/                       #   useKeyboardShortcuts
│   ├── i18n/                        #   中/英 国际化
│   ├── config/                      #   providerPresets, spinnerVerbs
│   └── lib/                         #   desktopRuntime, cronDescribe, parseRunOutput
├── src-tauri/
│   ├── binaries/                    #   Electron 打包使用的 sidecar 二进制
│   ├── resources/preview-agent.js   #   预览页面注入脚本
│   ├── src/main.rs                  #   历史 Tauri 入口，非当前 runtime
│   ├── src/lib.rs                   #   历史 Tauri host，非当前 runtime
│   ├── Cargo.toml
│   └── tauri.conf.json
├── electron/
│   ├── main.ts                      #   Electron main 入口
│   ├── preload.ts                   #   renderer host bridge
│   ├── preview-preload.ts           #   preview WebContentsView bridge
│   ├── ipc/                         #   channel registry + payload validators
│   └── services/                    #   dialogs, shell, updater, terminal, preview ...
├── sidecars/
│   └── claude-sidecar.ts            #   统一入口 (server/cli/adapters)
└── scripts/
    ├── build-sidecars.ts
    ├── build-macos-arm64.sh
    └── build-windows-x64.ps1

src/server/                           # 服务端（项目根目录）
├── api/                             #   REST 路由 (14 个模块)
├── services/                        #   业务服务 (14 个模块)
├── ws/                              #   WebSocket 处理
├── proxy/                           #   协议代理转换
├── middleware/                      #   auth, cors, errorHandler
└── config/                          #   Provider 预设

adapters/                             # IM 适配器
├── common/                          #   共享模块 (8 个)
├── telegram/                        #   Telegram Bot
└── feishu/                          #   飞书 Bot
```
