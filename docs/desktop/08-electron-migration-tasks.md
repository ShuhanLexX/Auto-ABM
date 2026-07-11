# Electron 迁移任务清单

> **For agentic workers:** 按任务顺序执行。每个任务完成后先跑该任务列出的核对命令，再进入下一任务。不要跳过打包壳 smoke，也不要把浏览器/Vite smoke 当作 Electron 壳验收�?

**目标�?* 将桌面端 host runtime �?Tauri 2 迁移�?Electron，同时保�?React 层、server/sidecar、自动更新、系统交互、通知、构建发布和 Computer Use 能力可用�?
**架构�?* 先抽�?`desktopHost` contract，再并行实现 Tauri �?Electron，最后切换构建发布链路。保留本�?Bun server + REST/WebSocket 边界，不把会话、聊天、workspace、team 业务协议改成 Electron IPC�?
**技术栈�?* React 18、Vite、Zustand、Bun、Electron、electron-builder/electron-updater、现�?sidecar、现有质量门禁�?

---

## 当前同步状�?

**执行记录�?026-06-01）：**

- 已按本地 `main` 重新同步当前迁移工作区：当前分支 `feat/electron-migration-main-sync-2392` 已快进到本地 `main` 的最新提交后再恢�?Electron 迁移改动�?
- 已在当前工作区内解决同步冲突，重点文件包�?`desktop/package.json`、`desktop/scripts/build-macos-arm64.sh`、`desktop/src-tauri/resources/preview-agent.js`、`desktop/src/components/workspace/WorkspaceFileOpenWith.test.tsx`、`desktop/src/lib/previewEvents.ts` �?`desktop/src/lib/previewEvents.test.ts`�?
- 冲突解决后已重建 preview agent，并运行 targeted tests �?Electron package dir 构建；后续迭代均基于同步后的本地 `main`�?
- packaged Electron renderer 使用 `file://.../app.asar/dist/index.html`，真实模�?smoke 暴露�?H5 token mode �?WebSocket 会因 `Origin: file://` 被拒绝；已在 server CORS/H5 access policy 中把 `file://` 纳入本地桌面可信来源，并补回归测试�?

---

## Phase 0：迁移前基线

### 1. 冻结当前 Tauri 行为基线

**涉及文件�?*

- 只读：`desktop/src/**`
- 只读：`desktop/src-tauri/**`
- 只读：`scripts/quality-gate/**`

**步骤�?*

- [x] 运行 `git status --short`，确认当前工作区是否有无关改动�?
- [x] 运行 `bun run check:policy`�?
- [x] 运行 `bun run check:desktop`�?
- [x] 运行 `bun run check:server`�?
- [x] 运行 `bun run check:coverage`�?
- [ ] �?live provider 时运�?`bun run quality:gate --mode baseline --allow-live --provider-model <provider:model[:label]>`�?
- [x] 记录 quality report 路径和失败项；失败时先修现有基线，不进入迁移�?

**执行记录�?026-05-31）：**

- `bun run check:policy` 通过�?
- `bun run check:desktop` 通过；首次缺�?desktop 依赖，已�?`desktop/` 执行 `bun install` 后复跑通过�?
- `bun run check:server` 通过�?
- `bun run check:coverage` 初次运行未通过；归因后�?`adapters/` 执行 `bun install` 修复 `grammy` 缺包环境问题，并补足 changed-line 覆盖率�?
- 后续 `bun run check:coverage` 复跑曾因本机 WeChat 占用随机端口 `24023` 导致 `src/server/__tests__/h5-access-auth.test.ts` 超时；已把该测试的随机端口选择改为先探测可绑定端口�?
- 最�?`bun run check:coverage` 通过；report �?`artifacts/coverage/2026-05-31T13-15-40-522Z/coverage-report.md`，summary �?`passed=5 failed=0`，changed-lines coverage �?`90.67% (204/225)`�?

**通过标准�?* 现有 Tauri 主干�?desktop/server/coverage/baseline 状态可复现�?
**阻断条件�?* 当前主干已有红灯且未归因�?

---

## Phase 1：Host Adapter Contract

### 2. 新增 host adapter 类型�?browser fallback

**创建�?*

- `desktop/src/lib/desktopHost/types.ts`
- `desktop/src/lib/desktopHost/browserHost.ts`
- `desktop/src/lib/desktopHost/index.ts`
- `desktop/src/lib/desktopHost/contract.test.ts`

**步骤�?*

- [x] 定义 `DesktopHost` 接口，至少覆�?`runtime/server URL`、`updates`、`notifications`、`dialogs`、`shell`、`window`、`terminal`、`preview`、`appMode`�?
- [x] �?`browserHost` 中保�?H5/browser fallback：没有桌面能力时返回明确错误�?no-op�?
- [x] �?contract test 中固定每个方法的 payload 和错误语义�?
- [x] 运行 `cd desktop && bun run test -- src/lib/desktopHost/contract.test.ts --run`�?

**执行记录�?026-05-31）：**

- 新增 `desktop/src/lib/desktopHost/types.ts`、`browserHost.ts`、`index.ts`、`contract.test.ts`�?
- 先运�?contract test 得到预期红灯（缺�?`browserHost` 模块），补实现后 `desktopHost/contract.test.ts` 6 tests 通过�?

**通过标准�?* host adapter 类型能表达当前所�?Tauri command/plugin 能力�?
**阻断条件�?* 仍需�?renderer 直接 import Tauri API 才能表达某个能力�?

### 3. 实现 Tauri host adapter

**创建�?*

- `desktop/src/lib/desktopHost/tauriHost.ts`

**修改�?*

- `desktop/src/lib/desktopRuntime.ts`
- `desktop/src/api/terminal.ts`
- `desktop/src/stores/updateStore.ts`
- `desktop/src/lib/desktopNotifications.ts`
- `desktop/src/lib/previewBridge.ts`
- `desktop/src/lib/previewEvents.ts`
- `desktop/src/lib/appZoom.ts`
- `desktop/src/stores/adapterStore.ts`
- `desktop/src/stores/settingsStore.ts`
- dialog/shell 调用组件：`DirectoryPicker.tsx`、`Sidebar.tsx`、`Settings.tsx`、`TerminalSettings.tsx`、`ComputerUseSettings.tsx`、`WorkspaceFileOpenWith.tsx`、聊天链接打开组件

**步骤�?*

- [x] �?`@tauri-apps/api/core.invoke` 包进 `tauriHost.commands.invoke` 或具体方法�?
- [x] �?Tauri `listen` 包进 `desktopHost.events`�?
- [x] �?dialog/shell/window/update/notification 调用全部迁到 `tauriHost`�?
- [x] 运行 `rg "@tauri-apps|__TAURI_INTERNALS__|window\\.__TAURI__|from '@tauri" desktop/src`�?
- [x] 确认生产代码只在 `desktop/src/lib/desktopHost/tauriHost.ts` 命中�?
- [x] 运行 `bun run check:desktop`�?

**通过标准�?* renderer 业务文件不再知道 Tauri API�?
**阻断条件�?* 任一 store/component 仍直接动�?import `@tauri-apps/*`�?

**当前进度�?026-05-31）：**

- 新增 `desktop/src/lib/desktopHost/tauriHost.ts`，先迁入 `get_server_url` 运行时调用�?
- `desktop/src/lib/desktopRuntime.ts` 已改为通过 `desktopHost` 选择 Electron preload host、Tauri host �?browser fallback；新增回归测试确�?`window.desktopHost` 优先�?H5/browser fallback�?
- 已迁�?`desktop/src/api/terminal.ts`、`desktop/src/lib/previewBridge.ts`、`desktop/src/lib/previewEvents.ts`、`desktop/src/lib/appZoom.ts`、`desktop/src/lib/desktopNotifications.ts`、`desktop/src/stores/updateStore.ts`、`desktop/src/stores/adapterStore.ts`、`desktop/src/stores/settingsStore.ts` �?runtime/terminal/preview/zoom/notification/update/adapter restart/app mode 调用�?`desktopHost`�?
- `desktopHost` 现在覆盖 `app.getVersion`、`commands.invoke`、`events.listen`、`webview.onDragDropEvent`、`dialogs.open/save`、`shell.open`、`notifications.permission/request/send/onAction`、`window.minimize/toggleMaximize/close/startDragging/focus/requestAttention/isMaximized/onResized/onNativeMenuNavigate`、`updates.check/prepare/cancel/relaunch` �?Tauri 能力�?
- 已运�?focused tests：`desktopRuntime.test.ts`、`desktopHost/contract.test.ts`、`terminal.test.ts`、`previewBridge.test.ts`、`previewEvents.test.ts`、`appZoom.test.ts`、`desktopNotifications.test.ts`、`updateStore.test.ts`、`adapterStore.test.ts`、`settingsStore.test.ts`、`AppShell.test.tsx`、`WindowControls.test.tsx`、`ComputerUseSettings.test.tsx` 全部通过�?
- 继续迁移�?dialog/shell/window/menu 组件层、file drop webview、official login/open-with 等打开路径：`DirectoryPicker`、`composerAttachments`、`TerminalSettings`、`ComputerUseSettings`、`Settings`、`Sidebar`、`TabBar`、`WindowControls`、`AppShell`、`WorkspaceFileOpenWith`、`AssistantMessage`、`AssistantOutputTargetCard`、`CurrentTurnChangeCard`�?
- 2026-05-31 扫描结果：业�?renderer 生产代码不再直接 import `@tauri-apps/*`；剩�?Tauri 命中�?`desktopHost` 自身、runtime detection 类型声明和测�?mock。生产路径排�?`desktopHost` 后扫描为空：`rg -n "@tauri-apps|__TAURI_INTERNALS__|window\\.__TAURI__|from '@tauri" desktop/src --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/lib/desktopHost/**' --glob '!src-tauri/**'`�?
- `bun run check:desktop` 通过：desktop `tsc --noEmit`、Vitest 全量 146 test files / 1127 tests passed，production build 成功；现�?React `act(...)` warnings 仍为非阻断输出�?

---

## Phase 2：Electron 最小壳

### 4. 新增 Electron main/preload 骨架

**创建�?*

- `desktop/electron/main.ts`
- `desktop/electron/preload.ts`
- `desktop/electron/ipc/channels.ts`
- `desktop/electron/ipc/capabilities.ts`
- `desktop/electron/tsconfig.json`

**修改�?*

- `desktop/package.json`
- �?`package.json`

**步骤�?*

- [x] 新增 `electron:dev`、`electron:build`、`check:electron` 脚本�?
- [x] `BrowserWindow` 使用 preload，保�?`contextIsolation`，不启用 renderer Node�?
- [x] preload 暴露 `window.desktopHost`，不暴露通用 `ipcRenderer`�?
- [x] `capabilities.ts` 枚举允许�?IPC channel �?payload validator�?
- [x] 运行 `bun run check:electron`�?

**执行记录�?026-05-31）：**

- 新增 `desktop/electron/main.ts`、`preload.ts`、`ipc/channels.ts`、`ipc/capabilities.ts`、`ipc/capabilities.test.ts`、`electron/tsconfig.json`、`scripts/electron-dev.ts`�?
- `BrowserWindow` 配置�?`preload + contextIsolation: true + nodeIntegration: false + sandbox: true`；preload 只通过 `contextBridge.exposeInMainWorld('desktopHost', ...)` 暴露 typed host contract�?
- `check:electron` 通过：Electron IPC validator 测试 3/3 通过，`electron-dist/main.cjs` �?`electron-dist/preload.cjs` 构建成功�?
- `electron:build` 通过：renderer `desktop/dist` �?Electron CJS entrypoints 均构建成功�?
- 短时 Electron 启动 smoke 已尝试；当前机器首次运行 `electron` 会触�?Electron binary 下载，下载未在本轮完成，因此真实窗口启动验证保留到下一�?runtime/server bridge smoke�?

**通过标准�?* Electron 壳能启动并加�?Vite/dev �?`desktop/dist`�?
**阻断条件�?* renderer 需�?Node API �?Electron API 才能工作�?

### 5. 实现 Electron runtime/server bridge

**创建�?*

- `desktop/electron/services/sidecarManager.ts`
- `desktop/electron/services/serverRuntime.ts`

**步骤�?*

- [x] 复刻 `start_server_sidecar`：保留动态端口、host、config、startup log、超时错误�?
- [x] 复刻 adapter sidecar 启动�?`restart_adapters_sidecar`�?
- [x] 保留 `CLAUDE_CONFIG_DIR`、`AUTOABM_APP_PORTABLE_DIR`、`ADAPTER_SERVER_URL` 注入�?
- [x] 提供 `get_server_url` 等价 IPC�?
- [x] 确认 renderer 仍通过 `desktop/src/api/client.ts` �?WebSocket manager 访问会话/聊天/workspace/team，不新增这些业务�?IPC handler�?
- [x] 运行 `bun run check:electron`�?
- [x] 打开 Electron dev app，确认首页能连上 local server�?

**执行记录�?026-05-31）：**

- 新增 `desktop/electron/services/sidecarManager.ts` �?`serverRuntime.ts`；Electron main �?ready 阶段启动 server sidecar，`runtime.getServerUrl()` 通过 IPC 返回动�?loopback URL�?
- `sidecarManager` 复用现有 `desktop/src-tauri/binaries/claude-sidecar-<triple>`，server 参数保持 `server --app-root <path> --host 0.0.0.0 --port <dynamic>`，adapter 参数保持 `adapters --app-root <path> --feishu/--telegram/--wechat/--dingtalk`�?
- 环境变量保留 `CLAUDE_CONFIG_DIR`、`XDG_CACHE_HOME`、`CLAUDE_H5_AUTO_PUBLIC_URL`、`CLAUDE_H5_DIST_DIR`；adapter 注入 `ADAPTER_SERVER_URL=ws://<dynamic>`�?
- headless smoke 通过：`bun run build:sidecars` 后用 `ElectronServerRuntime` 启动 server，`GET /health` 返回 200，随�?`stopAll()` 停止 server/adapters 子进程�?
- 2026-06-01 Electron dev 壳已�?Computer Use 多轮复测：renderer 加载 `localhost:1420/`，main process 自动启动 local server/sidecar，首页、设置页和会话页均可通过 server API/WebSocket 工作�?

**通过标准�?* Electron app 不依赖外部手动启�?server�?
**阻断条件�?* 需要用户先运行 `SERVER_PORT=... bun run src/server/index.ts` 才能使用桌面端，或迁移方案开始绕�?local server 直接重写 session/chat IPC�?

---

## Phase 3：系统能力迁�?

### 6. 迁移文件选择、保存、外链打开

**创建/修改�?*

- `desktop/electron/services/dialogs.ts`
- `desktop/electron/services/shell.ts`
- `desktop/src/lib/desktopHost/electronHost.ts`

**步骤�?*

- [x] `openFile`、`openDirectory`、`saveFile` 映射�?Electron dialog�?
- [x] `openExternal` 限制 URL scheme，`openPath` 限制为明确来自文件选择�?workspace 的路径�?
- [x] 更新 adapter contract tests�?
- [x] 运行 `bun run check:desktop && bun run check:electron`�?
- [x] 手动 smoke：选择工作目录、选择附件、选择 Python 路径、打开外链�?

**执行记录�?026-05-31）：**

- 新增 `desktop/electron/services/dialogs.ts` �?`shell.ts`；dialog options 映射�?Electron `showOpenDialog/showSaveDialog`，shell URL 只允�?`http: / https: / mailto:`�?
- `DesktopHost.shell` 拆分�?`open(url)` �?`openPath(path)`；workspace/open-with 本地文件路径改走 `openPath`，普通网�?OAuth/通知设置等外链继续走 `open`�?
- 新增 `desktop/src/lib/desktopHost/electronHost.ts`，preload 改为复用�?typed host factory；IPC payload �?preload 进入 `ipcRenderer.invoke` 前先校验�?
- Focused tests 通过：`electron/services/shell.test.ts`、`dialogs.test.ts`、`electronHost.test.ts`、`desktopHost/contract.test.ts`、`WorkspaceFileOpenWith.test.tsx`�?
- `bun run check:electron` 通过�?6 tests passed，Electron main/preload 构建成功�?
- `bun run check:desktop` 通过，现�?React/Tauri 主干未被 `openPath` contract 破坏�?
- 2026-06-01 Electron dev �?Computer Use 复测附件选择：点�?composer `添加文件或图片` 打开 macOS 原生 `打开` 面板，选择 `/Users/nanmi/autoabm-cua-attachment-smoke.txt` 后回到应用，composer 显示 `autoabm-cua-attachment-smoke.txt` 附件 chip�?
- 2026-06-01 Electron dev �?Computer Use 复测 Python 路径选择：在 Computer Use 设置中点�?`选择` 打开 macOS 原生 `选择 Python 解释器` 面板，选择 `/Users/nanmi/autoabm-cua-python3-smoke` 后应用解析并保存�?`/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14`；随后恢复自动检测，`/api/computer-use/authorized-apps` 返回 `pythonPath: null`�?
- 2026-06-01 Electron dev �?Computer Use 复测外链：点击关于页 GitHub 项目卡片后，系统浏览�?Google Chrome 被拉到前台，地址栏为 `github.com/SocialAI-X/Auto-ABM`；Electron renderer 仍停留在 `localhost:1420/`，未在应用内导航外链�?

**通过标准�?* 所有原 `plugin-dialog` �?`plugin-shell` 用户路径可用�?
**阻断条件�?* 任一路径绕过 preload 或接受未校验目标�?

### 7. 迁移窗口、托盘、菜单和单实�?

**创建/修改�?*

- `desktop/electron/services/windows.ts`
- `desktop/electron/services/tray.ts`
- `desktop/electron/services/menu.ts`
- `desktop/electron/services/singleInstance.ts`

**步骤�?*

- [x] 实现 minimize/toggleMaximize/close/startDragging�?
- [x] 实现关闭隐藏到托盘、托�?show/quit�?
- [x] 实现 macOS About/Settings 菜单并发�?`native-menu-navigate` 等价事件�?
- [x] 实现窗口位置/尺寸持久化和 monitor 可见性保护�?
- [x] 实现 `app.requestSingleInstanceLock()`，第二实例显示主窗口�?
- [x] 运行 `bun run check:electron`�?
- [ ] 打包 app smoke：关闭窗口、托盘恢复、菜单打开设置页、重启后窗口仍可见�?

**执行记录�?026-05-31）：**

- 新增 `desktop/electron/services/windows.ts`、`tray.ts`、`menu.ts`、`singleInstance.ts`�?
- Electron main 现在启动前申�?single-instance lock；重复启动会 show/focus 主窗口�?
- 主窗口关闭默认隐藏到托盘，托盘菜单提�?`Show AutoABM` �?`Quit AutoABM`；显�?quit 才停�?sidecar 并退出�?
- 窗口位置/尺寸/maximized 状态写�?`window-state.json`，优先使�?`CLAUDE_CONFIG_DIR`，恢复前会验证尺寸和 display/workArea 可见性�?
- 原生菜单发�?`desktop:window:native-menu-navigate`，保�?renderer 现有 settings/about 路由入口�?
- Electron 先不声明自定�?Windows chrome 能力：`windowControls=false`，renderer 不渲染自定义窗口按钮，也不会把空�?tab/sidebar 区当成可拖拽窗口区域；后续若启用 frameless window，需要同时实现真实拖拽�?
- `bun run check:electron` 通过�?6 tests passed，Electron main/preload 构建成功�?
- 2026-06-01 Electron dev �?Computer Use 复测窗口关闭/恢复：点�?macOS 关闭按钮�?Electron 进程仍在 `list_apps` 中保�?running，主窗口消失；通过 macOS app activation 路径重新激活同一 Electron app 后，Computer Use 再次看到 `AutoABM` 主窗口和 `localhost:1420/` renderer。Computer Use 当前不能稳定枚举 Dock，因此本轮验证的是与 Dock 点击等价�?app activation/show 主窗口路径�?
- 2026-06-01 packaged app Computer Use 复测菜单与窗口生命周期：�?`desktop/build-artifacts/electron/mac-arm64/AutoABM.app` 隔离实例中，通过 macOS app menu 点击 `Settings...` �?renderer 打开设置页；点击关闭按钮�?Computer Use 返回 `noWindowsAvailable`，System Events 显示同一 PID `count=0` 且进程仍存活；随后用 app activation 恢复，Computer Use 再次读取�?`AutoABM` 设置页窗口。继续通过 app menu `Quit` 退出后，隔离配置写�?`window-state.json`；用同一 `CLAUDE_CONFIG_DIR` �?`--user-data-dir` 重启，Computer Use 成功读取�?PID �?packaged `file://.../app.asar/dist/index.html` 主窗口，System Events 显示 `count=1 names=AutoABM`。该轮覆�?packaged 菜单打开设置、关闭隐藏、activation 恢复和重启后窗口仍可见；真实 tray 图标点击仍需后续实机/可枚�?tray 环境复验�?

**通过标准�?* macOS/Windows/Linux 主窗口生命周期等价�?
**阻断条件�?* 关闭行为会误退出或窗口状态可能恢复到屏幕外�?

### 8. 迁移通知

**创建/修改�?*

- `desktop/electron/services/notifications.ts`
- `desktop/src/lib/desktopNotifications.ts`
- `desktop/src/lib/desktopHost/contract.test.ts`

**步骤�?*

- [x] 实现权限状态、请求权限、发送通知�?
- [x] 实现通知点击回跳并传�?target�?
- [x] Windows 保留打开系统通知设置入口�?
- [x] macOS �?Electron `Notification` 无法满足权限/点击语义，保�?native bridge 或补原生模块�?
- [x] 运行 `bun run check:electron`�?
- [x] 运行 `bun run check:desktop`�?
- [ ] 打包 app smoke：发送通知、点击通知、跳回目�?session�?

**执行记录�?026-05-31）：**

- 新增 `desktop/electron/services/notifications.ts`，使�?Electron main-process `Notification` 发送系统通知并监�?`click`�?
- 通知点击通过 `desktop:notification:action` 发�?`{ id, extra, target, action: 'click' }`，renderer 继续复用现有 `installDesktopNotificationClickListener` target 解析和导航�?
- Electron `commandInvoke` 兼容现有 renderer �?legacy 通知入口：`macos_notification_permission_state`、`macos_request_notification_permission`、`macos_send_notification`、`plugin:notification|is_permission_granted`、`plugin:notification|request_permission`�?
- Windows 通知设置入口通过 allowlisted `ms-settings:notifications` 打开；macOS 系统通知设置 URL 仍限制在 allowlist�?
- 参�?Electron 官方 Notification 文档：main process 使用 `new Notification(...).show()`，点击通过 `notification.on('click', ...)` 处理；Electron 没有独立的桌面通知 request-permission API，因�?Electron host �?`Notification.isSupported()` 映射�?host permission state�?
- `bun run check:electron` 通过�?2 tests passed，Electron main/preload 构建成功�?
- `bun run check:desktop` 通过�?41 test files / 1103 tests passed，production build 成功；现�?React `act(...)` warnings 仍为非阻断输出�?

**执行记录�?026-06-01）：**

- 新增 `desktop/electron/services/notificationSmoke.ts`，提供显式环境变量触发的 Electron 通知 smoke hook：设�?`AUTOABM_ELECTRON_NOTIFICATION_SMOKE_SESSION_ID=<session-id>` 后，main process 会延迟发送带 `{ type: 'session', sessionId }` target 的真�?Electron `Notification`。默认不启用，不影响正常启动和生产行为�?
- 新增 `desktop/electron/services/notificationSmoke.test.ts`，锁定默认不发送、target payload 透传�?delay clamp；`cd desktop && bun test electron/services/notificationSmoke.test.ts electron/services/notifications.test.ts electron/services/windows.test.ts` 通过�?6 tests passed�?
- Computer Use 真实 OS 点击复测：带 smoke env 启动 Electron dev 壳并关闭主窗口后，Electron �?running；但本机 Computer Use �?`/System/Library/CoreServices/NotificationCenter.app` �?`SystemUIServer` 均返�?`timeoutReached`，无法稳定枚举或点击 macOS 通知横幅。重�?`get_app_state(Electron)` 会触�?app activation 并恢复窗口，因此不能作为“点击通知回跳”的证据。该项保持未完成，需在可操作 Notification Center/横幅�?macOS 会话或签�?packaged app 上复验�?
- 2026-06-01 通知点击二次复测：用 `AUTOABM_ELECTRON_NOTIFICATION_SMOKE_DELAY_MS=30000` 启动 Electron dev 壳，Computer Use 确认主窗口可见后点击 macOS close button，Electron 无主窗口且进程保�?running；等待通知触发后，Computer Use �?`SystemUIServer` �?Notification Center �?`timeoutReached`，前�?Chrome 截图/AX 树也没有出现可点击通知横幅。真�?OS 通知点击回跳仍未验收通过�?
- 2026-06-01 通知 smoke 可审计化：新�?`AUTOABM_ELECTRON_NOTIFICATION_SMOKE_LOG=<path>`，仅在显�?smoke env 下把 scheduled/sent/action/send_failed 写入 JSONL，方便真�?macOS/Windows runner 点击通知后确�?Electron main 是否收到 OS click。`cd desktop && bun test electron/services/notificationSmoke.test.ts electron/services/notifications.test.ts electron/services/windows.test.ts` 通过 17 tests，`cd desktop && bun run check:electron` 通过 85 tests�?
- 2026-06-01 packaged 通知 smoke 复测：重新运�?`CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 后，用隔离配置启�?packaged app，并设置 `AUTOABM_ELECTRON_NOTIFICATION_SMOKE_LOG=/tmp/.../notification-smoke.jsonl`。Computer Use 确认 packaged `file://.../app.asar/dist/index.html` 主窗口可见；JSONL 记录 `scheduled` �?`sent:true`，证�?Electron main 已向系统发出真实通知。但 Computer Use 仍无法读�?`SystemUIServer` �?`NotificationCenter.app`（均 `timeoutReached`），日志也未出现 `action`，所以“点击通知回到目标 session”仍未完成�?
- 2026-06-01 通知点击当前态再复测：用 canonical packaged app 启动隔离通知 smoke，设�?`AUTOABM_ELECTRON_NOTIFICATION_SMOKE_SESSION_ID=notification-click-smoke-session`、`AUTOABM_ELECTRON_NOTIFICATION_SMOKE_DELAY_MS=8000` �?JSONL log；Computer Use 关闭主窗口后 app 留在后台，JSONL 记录 `scheduled` �?`sent:true`。Computer Use �?`/System/Library/CoreServices/UserNotificationCenter.app/` 返回安全策略拒绝，对 `NotificationCenter.app` �?`timeoutReached`，所以仍无法执行真实 OS 通知点击。为后续实机复验，通知 smoke 日志已扩展记�?`lifecycle: close|failed`，可区分通知发出后被系统关闭、发送失败和用户点击；`cd desktop && bun test electron/services/notificationSmoke.test.ts electron/services/notifications.test.ts` 通过 10 tests，`cd desktop && bun run check:electron` 通过 90 tests�?

**通过标准�?* 通知提示、权限、点击回跳都能在真实打包 app 里证明�?
**阻断条件�?* 只在 unit test �?mock 成功，未走系统通知�?

### 9. 迁移自动更新

**创建/修改�?*

- `desktop/electron/services/updater.ts`
- `desktop/src/stores/updateStore.ts`
- `desktop/package.json`
- `.github/workflows/release-desktop.yml`

**步骤�?*

- [x] 选定 `electron-builder` + `electron-updater`，不要用 Electron 内置 updater 覆盖 Linux�?
- [x] 保留 `check -> download -> progress -> install -> relaunch` 状态机�?
- [x] `install` 前调�?sidecar manager 停止 server/adapters，失败后恢复可重试状态�?
- [x] 建立 mock update feed 测试�?
- [x] macOS 签名/zip metadata、Windows NSIS metadata、Linux AppImage/deb update 策略写入 Electron build metadata�?
- [x] 运行 `bun run check:electron`�?
- [x] 运行 `bun run check:desktop`�?
- [x] release workflow 切换�?Electron builder，并在打包前验证签名/notarization/update metadata secrets 是否配置齐全�?

**通过标准�?* 自动更新全链路有 unit、mock feed、打包产物证据�?
**阻断条件�?* 只能检查到新版本，不能安全安装�?relaunch�?

**执行记录�?026-05-31）：**

- 新增运行时依�?`electron-updater@6.8.3` 和打包依�?`electron-builder@26.8.1`�?
- 新增 `desktop/electron/services/updater.ts`；`autoDownload=false`，`checkForUpdates()` 只返�?metadata，`downloadUpdate()` �?electron-updater `download-progress` 转成现有 `DesktopUpdateDownloadEvent`，`relaunch()` 阶段调用 `quitAndInstall(false, true)`�?
- 扩展 Electron IPC：`desktop:update:download`、`desktop:update:install` �?`desktop:update:download-event`�?
- `desktop/src/lib/desktopHost/electronHost.ts` �?Electron update metadata 包装成现�?`DesktopUpdate` 对象，renderer `updateStore` 不需要改状态机�?
- `desktop/package.json` 已加�?Electron builder metadata：`appId=com.claude-code-haha.desktop`、GitHub publish �?`SocialAI-X/Auto-ABM`、macOS `dmg/zip`、Windows `nsis`、Linux `AppImage/deb`；packaged runtime 使用 `asar=true`，并通过 `asarUnpack` 保留 `node-pty` �?sidecar binaries�?
- `bun run check:electron` 通过�?6 tests passed，Electron main/preload 构建成功�?
- `bun run check:desktop` 通过：desktop `tsc --noEmit`、Vitest 全量 146 test files / 1127 tests passed，production build 成功�?

**执行记录�?026-06-01）：**

- 完整 macOS Electron Builder release packaging 暴露出两个自动更新发布问题：平台�?`publish: ["github"]` 会在 worktree/CI 中触�?git remote 自动探测并导�?update info 生成崩溃；默认含空格 artifact name 会让 `latest-mac.yml` 指向 `AutoABM-...`，但实际上传文件�?`AutoABM-...`�?
- 已修�?`desktop/package.json`：保留顶层显�?GitHub publish 元数据，并移�?mac/win/linux 平台�?publish 覆盖；新增统一无空�?`artifactName`，避�?update metadata 与上�?asset 文件名漂移�?
- 已增�?`scripts/quality-gate/package-smoke/index.ts`：当存在 `latest-mac.yml` / `latest.yml` / `latest-linux.yml` 时，会解�?`url` / `path` 并确认引用的 artifact 文件实际存在；当发布 archive 存在�?update metadata 缺失时会失败�?
- 已新增回归测试：`scripts/pr/release-workflow.test.ts` 防止 Electron Builder 再依�?git remote autodetection；`scripts/quality-gate/package-smoke/index.test.ts` 会捕�?`latest-mac.yml` 指向缺失 asset 的情况�?
- 2026-06-01 packaged app updater 缺失 channel metadata 修复：本地打�?app 启动�?electron-updater 可访�?GitHub release，但当前 release 缺少 `latest-mac.yml` 时会�?`ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`。该错误现在仅在 message 指向 `latest*.yml` 时降级为“无更新”，继续保留其它 updater 错误抛出；`cd desktop && bun test electron/services/updater.test.ts` 通过 7 tests，`cd desktop && bun run check:electron` 通过 84 tests�?
- 2026-06-01 packaged app 当前态复验：重新运行 `cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 后，�?`desktop/build-artifacts/electron/mac-arm64/AutoABM.app` 以隔�?`CLAUDE_CONFIG_DIR` / `--user-data-dir` 启动；Computer Use 确认主窗口加�?`file://.../app.asar/dist/index.html`，sidecar 自动启动，未出现 Safe Storage 钥匙串弹窗，日志未再出现 `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND` IPC handler 崩错。纯 `--dir` 包缺�?`app-update.yml` 的提示仍按无更新处理，不代表 signed release update feed 已验收�?
- 当前本机 `.dmg` 构建仍受 macOS DiskImages/hdiutil 状态阻塞：`hdiutil: create failed - 操作超时`，且当前 worktree 下残留的临时读写 disk image 无法正常 detach；这属于本机磁盘镜像服务阻塞，不应被 package-smoke 或浏览器 smoke 替代为发布通过�?

### 10. 迁移 PTY 终端

**创建/修改�?*

- `desktop/electron/services/terminal.ts`
- `desktop/src/api/terminal.ts`

**步骤�?*

- [x] 明确 PTY 实现：保�?Rust sidecar command 或引�?Node PTY 方案�?
- [x] 实现 spawn/write/resize/kill �?output/exit event�?
- [x] 保留 terminal shell 配置读写语义�?
- [x] 运行 `bun run check:desktop && bun run check:electron`�?
- [x] 打包 app smoke：打开终端、输入命令；resize/kill 需随完�?packaged smoke 继续复验�?

**通过标准�?* 终端交互和事件流等价�?
**阻断条件�?* Windows shell 或自定义 shell path 行为不明确�?

**执行记录�?026-05-31）：**

- 已选择 Node PTY 方案：新增运行时依赖 `node-pty@1.1.0`，Electron main process 负责 `pty.spawn()`，renderer 只通过 preload IPC 发�?spawn/write/resize/kill。Context7 `/microsoft/node-pty` 文档确认主进程集成方式为 `spawn` + `onData`/`onExit` + `write`/`resize`/`kill`�?
- 新增 `desktop/electron/services/terminal.ts`，保�?Tauri 终端语义：`CLAUDE_CONFIG_DIR/terminal-config.json` 优先，其�?Electron `userData/terminal-config.json`；继续读�?`~/.claude/settings.json` �?`desktopTerminal` Windows shell 配置；保�?Windows `bash_path`、`COMSPEC`、POSIX `SHELL`、`/bin/zsh`/`/bin/bash` 默认 shell 选择�?
- `terminal_spawn` 等价实现最小尺寸限制：`cols >= 20`、`rows >= 8`；默�?cwd 仍按 `cwd -> CLAUDE_CONFIG_DIR -> HOME/USERPROFILE -> process.cwd()`；环境变量合�?login shell env，并强制 UTF-8 locale，补�?`TERM=xterm-256color` �?`COLORTERM=truecolor`�?
- `desktop/electron/main.ts` 已注�?`desktop:terminal:*` IPC：`spawn/write/resize/kill/get-bash-path/set-bash-path`，并通过 `desktop:terminal:output`、`desktop:terminal:exit` 事件回传现有 renderer payload�?
- `desktop/electron/ipc/capabilities.ts` 收紧 `terminalSpawn` payload 校验，避�?renderer 传入非数字尺寸或非字符串 cwd/shell�?
- 新增 `desktop/electron/services/terminal.test.ts`，覆盖配置路径、bash path 持久化、Windows shell 解析、UTF-8 env、spawn event 转发、write/resize/kill、exit �?session 清理�?
- packaged macOS `node-pty` 直接�?`.app/Contents/Resources/app.asar.unpacked` 执行会在 `spawn-helper` 上触�?`posix_spawnp failed`；已改为打包时先执行 `prepare:node-pty` 修正 helper executable bit，并�?packaged macOS runtime �?`node-pty` 复制�?Electron `userData/native/node-pty-<platform>-<arch>-<version>` 后加载，避免嵌套 app bundle 资源执行限制�?
- `bun run check:electron` 通过�?8 tests passed，Electron main/preload/preview-preload 构建成功�?
- `bun run check:desktop` 通过：desktop `tsc --noEmit`、Vitest 全量 146 test files / 1127 tests passed，production build 成功�?
- `CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 通过并产�?unpacked macOS `.app`；Computer Use packaged smoke 通过：启�?`AutoABM.app`，点击“打开终端”后显示 `运行�?/bin/zsh`，在终端输入 `printf electron-terminal-ok` 并看到输�?`electron-terminal-ok`。终�?resize/close kill 仍需在完�?packaged smoke 中补齐�?

### 11. 迁移预览面板

**创建/修改�?*

- `desktop/electron/services/preview.ts`
- `desktop/src/lib/previewBridge.ts`
- `desktop/src/lib/previewEvents.ts`

**步骤�?*

- [x] 使用 `WebContentsView`，不要用已弃用的 `BrowserView`�?
- [x] 保留 `http/https` URL 白名单�?
- [x] 保留 preview agent 注入�?JSON 消息校验�?
- [x] 实现 open/navigate/setBounds/setVisible/close/eval/message�?
- [x] 运行 `bun run check:desktop && bun run check:electron`�?
- [x] 打包 app smoke：打开 workbench/browser panel，导�?URL，完�?preview/screenshot 回填 smoke�?

**通过标准�?* 预览面板功能等价且安全边界保留�?
**阻断条件�?* 允许 `file:` �?`javascript:` URL 进入 preview�?

**执行记录�?026-05-31）：**

- Context7 `/electron/electron` 文档确认当前 API 使用 `WebContentsView` + `contentView.addChildView()` + `setBounds()` + `webContents.loadURL()`，不再新�?`BrowserView`�?
- 新增 `desktop/electron/services/preview.ts`，使�?`WebContentsView` 实现 `open/navigate/setBounds/setVisible/close/eval`，继续拒绝空 URL、`file:`、`javascript:` 等非 `http/https` URL�?
- 新增 `desktop/electron/preview-preload.ts`，只暴露 `window.__DESKTOP_PREVIEW_POST__(raw)`；外部页面无法拿�?Node/Electron API，只能把 JSON 字符串发�?main process�?
- `desktop/src/preview-agent/index.ts` 改为调用通用 `__DESKTOP_PREVIEW_POST__`；Tauri 端在 `desktop/src-tauri/src/webview_panel.rs` 创建 child webview 时先注入该函数，再注�?preview agent；Electron 端由 preview preload 注入同名函数�?
- Electron main process 增加内部 channel `desktop:preview:message-from-view`，只接受当前 preview `webContents` 发出�?raw JSON；校�?JSON 后通过 `desktop:preview:event` 转发�?React�?
- `desktop/package.json` �?`build:electron` 增加 `preview-preload.cjs` 构建，Electron builder files 增加 `src-tauri/resources/preview-agent.js`，保�?packaged app 能读取注入脚本�?
- 新增 `desktop/electron/services/preview.test.ts`，覆�?URL 白名单、bounds 规范化、child view 复用、load 后注�?preview agent、JSON event 转发、close 清理�?
- `bun run build:preview-agent` 已重�?`desktop/src-tauri/resources/preview-agent.js`�?
- `bun run check:electron` 通过�?9 tests passed，Electron main/preload/preview-preload 构建成功�?
- `bun run check:desktop` 通过：desktop `tsc --noEmit`、Vitest 全量 146 test files / 1127 tests passed，production build 成功�?
- 2026-06-01 Computer Use packaged smoke 覆盖 preview/workbench：临�?packaged app 中打开 browser panel，导�?`https://example.com/` 成功，并完成 screenshot 回填 composer；完�?preview event 回归继续�?`desktop/electron/services/preview.test.ts` 覆盖�?

### 12. 迁移 app mode、portable config �?zoom

**创建/修改�?*

- `desktop/electron/services/appMode.ts`
- `desktop/electron/services/zoom.ts`
- `desktop/src/stores/settingsStore.ts`
- `desktop/src/lib/appZoom.ts`

**步骤�?*

- [x] 保留 `get_app_mode`、`set_app_mode`、`detect_portable_dir` 返回形状�?
- [x] 保留同时写系统默认配置目录和 portable 目录的语义�?
- [x] zoom 继续 clamp �?`0.5..2.0`�?
- [x] 运行 `bun run check:persistence-upgrade`�?
- [x] 运行 `bun run check:desktop && bun run check:electron`�?

**通过标准�?* 老配置可升级，unknown fields 保留�?
**阻断条件�?* 写入 `~/.claude/settings.json` 或受保护配置路径�?

**执行记录�?026-05-31）：**

- 新增 `desktop/electron/services/appMode.ts`，复�?Tauri `app-mode.json` 语义：启动时�?`external CLAUDE_CONFIG_DIR -> default portable app-mode.json -> system app-mode.json -> default portable data auto-detect` 判定是否设置 `CLAUDE_CONFIG_DIR`�?
- Electron `app.whenReady()` 后、server sidecar 启动前调�?`applyStartupPortableMode(app)`，保�?sidecar、window state、terminal config 都能看到 portable env；同时设�?`AUTOABM_APP_PORTABLE_DIR=1` �?`WEBVIEW2_USER_DATA_FOLDER=<portable>/EBWebView`�?
- `desktop:app-mode:get` 返回现有 renderer 形状：`mode`、`portableDir`、`defaultPortableDir`、`activeConfigDir`、`configDirSource`；`configDirSource` 区分 `system`、外部环境变�?`environment`、应用切换产生的 `portable`�?
- `desktop:app-mode:set` 在当�?active config、目�?portable dir、系统默�?`userData` 三处写入 `app-mode.json`，不�?`~/.claude/settings.json`，也不移�?删除已有数据�?
- `desktop:app-mode:restart` 现在 `relaunch()` 后立�?`quit()`，与设置页“切换后重启”的语义一致；`prepareRestart` 继续先停�?server/adapters�?
- 新增 `desktop/electron/services/zoom.ts`，native zoom 统一 clamp �?`0.5..2.0`，避�?Electron IPC 绕过 renderer 侧限制�?
- 新增 `appMode.test.ts` �?`zoom.test.ts`，覆�?portable 数据探测、启动模式解析、env 设置、返回形状、三�?app-mode 写入、zoom clamp�?
- `bun run check:electron` 通过�?6 tests passed，Electron main/preload/preview-preload 构建成功�?
- `bun run check:persistence-upgrade` 通过：server persistence 6 tests passed，desktop localStorage migration 8 tests passed�?
- `bun run check:desktop` 通过：desktop `tsc --noEmit`、Vitest 全量 146 test files / 1127 tests passed，production build 成功�?

---

## Phase 4：Build、CI、Release

### 13. 替换本地构建脚本

**修改�?*

- `desktop/package.json`
- `package.json`
- `desktop/scripts/build-macos-arm64.sh`
- `desktop/scripts/build-windows-x64.ps1`

**步骤�?*

- [x] 保留 `desktop build` 作为 renderer build�?
- [x] 保留 `build:sidecars`�?
- [x] 新增 Electron package 脚本，输出到 `desktop/build-artifacts/<platform>`�?
- [x] `check:native` 替换�?Electron main/preload/package config check，或新增 `check:electron` 并让 `quality:gate` 使用它�?
- [x] 运行 `bun run check:desktop && bun run check:electron`�?

**通过标准�?* 本地 macOS/Windows 构建命令产出可启�?app�?
**阻断条件�?* sidecar 没有被打进产物或产物启动后仍读开发路径�?

**执行记录�?026-05-31）：**

- `desktop/package.json` 保留 `build` �?renderer build，新�?调整 `electron:build`、`electron:package`、`electron:package:dir`，并�?`build:electron` 扩展�?main/preload/preview-preload 三个 bundle�?
- Electron builder 配置包含 `dist/**`、`electron-dist/**`、`src-tauri/binaries/**`、`src-tauri/resources/preview-agent.js` �?`node_modules/node-pty/**`；`electron-updater` 已打�?main bundle，`node-pty` 保持外部原生模块并通过 `asarUnpack` 解包�?
- `check:native` 已从 Tauri `cargo check` 改为 `build:sidecars + check:electron`；`quality:gate` native lane 描述同步�?Electron host/package checks�?
- `desktop/scripts/build-macos-arm64.sh` 改为 Electron Builder：构�?sidecar、renderer、Electron bundles，执�?`electron-builder --mac dmg zip --arm64 --publish never`，输出复制到 `desktop/build-artifacts/macos-arm64`�?
- `desktop/scripts/build-windows-x64.ps1` 改为 Electron Builder：导�?MSVC 环境，构�?sidecar、renderer、Electron bundles，执�?`electron-builder --win nsis --x64 --publish never`，输出复制到 `desktop/build-artifacts/windows-x64`�?
- `desktop/scripts/build-macos-arm64.sh` 支持 `MAC_TARGETS` 覆盖 Electron Builder macOS target，默认仍�?`dmg zip`；本�?DiskImages 异常时可�?`MAC_TARGETS=zip` 单独验证 zip/update metadata 链路。脚本会对当�?worktree �?stale Electron Builder 临时 DMG 挂载 fail fast，成功复�?canonical artifacts 后默认运�?package-smoke�?
- `desktop/scripts/build-windows-x64.ps1` 会把 installer、update metadata、blockmap �?`win-unpacked` 复制�?canonical `desktop/build-artifacts/windows-x64`；成功复制后默认运行 `bun run test:package-smoke --platform windows --package-kind release --artifacts-dir desktop/build-artifacts/windows-x64`，可�?`SKIP_PACKAGE_SMOKE=1` 跳过静态验包�?
- `desktop/scripts/build-linux.sh` 支持 `LINUX_ARCH=x64|arm64` �?`LINUX_TARGETS` 覆盖，默认构�?AppImage/deb x64；脚本会复制 `.AppImage`、`.deb`、`latest-linux.yml`、blockmap �?`linux-unpacked` �?canonical `desktop/build-artifacts/linux-<arch>`，并默认运行 `bun run test:package-smoke --platform linux --package-kind release --artifacts-dir desktop/build-artifacts/linux-<arch>`�?
- `node-pty` 原生模块验证：`bunx electron ./tmp-electron-node-pty-smoke.cjs` �?Electron 42.3.0 runtime 下成功输�?`node-pty spawn type: function`�?
- `electron-builder install-app-deps` 在本�?`@electron/rebuild` node-gyp worker 上空转无输出；由�?`node-pty` Electron runtime smoke 已通过，默认配置设�?`npmRebuild=false`，脚本保�?`REBUILD_NATIVE=1` 作为 runner/调试开关�?
- packaged `.app` 首轮 smoke 暴露两个打包差异：Vite 默认绝对 `/assets/...` �?`file://` 下加载失败，已通过 `vite.config.ts base: './'`、`publicAssetPath()` 和字�?URL 改造修复；`asar=false` 的全�?unpacked resources 会触�?macOS assessment `Too many open files`，已切换�?`asar=true` + `asarUnpack`�?
- `CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 通过并产�?`desktop/build-artifacts/electron/mac-arm64/AutoABM.app`；`codesign --verify --deep --strict --verbose=2` 通过；packaged app 启动�?sidecar �?`app.asar.unpacked/src-tauri/binaries/claude-sidecar-aarch64-apple-darwin` 运行，renderer �?`app.asar/dist/index.html` 加载�?
- `bun run check:native` 通过：sidecar build 成功，Electron host 56 tests passed，main/preload/preview-preload 构建成功�?
- 2026-06-01 已把 `check:native` 扩展�?`build:sidecars + check:electron + electron:package:dir + test:package-smoke:current`；最新复跑通过：Electron 77 tests passed，Electron `--dir` 产出 `desktop/build-artifacts/electron/mac-arm64/AutoABM.app`，当前平�?macOS package-smoke PASS�?
- `bun run check:desktop` 通过：desktop `tsc --noEmit`、Vitest 全量 146 test files / 1127 tests passed，production build 成功�?
- 生产 React 直接 Tauri 扫描无输出：`rg -n "@tauri-apps|__TAURI_INTERNALS__|window\\.__TAURI__|from '@tauri" desktop/src --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/lib/desktopHost/**' --glob '!src-tauri/**'`�?

### 14. 替换 CI workflow

**修改�?*

- `.github/workflows/build-desktop-dev.yml`
- `.github/workflows/release-desktop.yml`
- `.github/workflows/pr-quality.yml`
- `scripts/quality-gate/modes.ts`
- `scripts/pr/change-policy.ts`
- `scripts/pr/check-pr.ts`

**步骤�?*

- [x] 移除 `tauri-apps/tauri-action@v0`�?
- [x] 移除 Linux WebKitGTK/Rust/Tauri 专用依赖，保�?Electron/Linux 打包需要的依赖�?
- [x] 配置 macOS arm64/x64、Windows x64、Linux x64/arm64 matrix�?
- [x] 配置 signing/notarization/update metadata secrets�?
- [x] �?PR/change policy 识别 `desktop/electron/**` �?Electron build config�?
- [x] 运行 `bun run check:policy`�?

**通过标准�?* CI lane 名称、触发条件和产物路径都更新为 Electron�?
**阻断条件�?* PR �?Electron host 文件但不会触发桌�?原生检查�?

**执行记录�?026-05-31）：**

- `.github/workflows/build-desktop-dev.yml` 改为 Electron Builder matrix：macOS arm64/x64、Windows x64、Linux x64/arm64；每�?job 安装 Bun/Node、构�?sidecars、构�?renderer/Electron bundles、运�?`electron-builder` 并上�?`desktop/build-artifacts/electron` 产物�?
- `.github/workflows/release-desktop.yml` 移除 `tauri-apps/tauri-action@v0`，改�?`electron-builder --publish never` 生成产物，再�?`softprops/action-gh-release@v2` 上传 release assets�?
- Linux CI 依赖删除 WebKitGTK/Rust/Tauri 专用包，仅保�?Electron packaging �?AppImage 需要的基础构建工具�?`libfuse2`�?
- PR `desktop-native-checks` 不再安装 Rust toolchain �?Rust cache；`desktop/scripts/build-sidecars.ts` 改为�?`process.platform` / `process.arch` 推导 host triple，避�?Electron `check:native` 继续依赖 `rustc -vV`�?
- sidecar build target env 已改�?`SIDECAR_TARGET_TRIPLE`；`build-sidecars.ts` 暂时兼容�?`TAURI_ENV_TARGET_TRIPLE`，但 CI 和平台脚本不再使�?Tauri 命名�?
- `scripts/pr/change-policy.ts` �?`desktop/electron/tsconfig.json`、Electron macOS/Windows build scripts 纳入 native/release paths；`scripts/quality-gate/modes.ts` �?`scripts/pr/impact-report.ts` 文案�?Tauri native 改为 Electron host/package�?
- `bun run check:policy` 通过�?4 tests passed，quarantine review 0 expired�?

### 15. 替换 release 脚本

**修改�?*

- `scripts/release.ts`
- `scripts/pr/release-workflow.test.ts`

**步骤�?*

- [x] 版本来源�?`desktop/src-tauri/tauri.conf.json` 改为 Electron package/build config�?
- [x] 删除 `Cargo.toml`/`Cargo.lock` release 更新�?
- [x] 保留 release note 校验、commit、tag 流程�?
- [x] 运行 `bun run scripts/release.ts <next-version> --dry`�?
- [x] 运行 `bun test scripts/pr/release-workflow.test.ts`�?

**通过标准�?* dry run 显示的版本文件全部属�?Electron 发布链�?
**阻断条件�?* release 仍依�?Tauri 版本文件�?

**执行记录�?026-05-31）：**

- `scripts/release.ts` 当前版本来源改为 `desktop/package.json`，版本更新文件只保留 `desktop/package.json`�?
- release 脚本不再更新 `desktop/src-tauri/tauri.conf.json`、`Cargo.toml` �?`Cargo.lock`，也不再运行 `cargo generate-lockfile`�?
- Git commit/tag 流程仍保�?release notes 校验、`git add desktop/package.json release-notes/vX.Y.Z.md`、commit、annotated tag�?
- `bun run scripts/release.ts patch --dry` 通过，显�?`0.3.1 -> 0.3.2`，只会更�?`desktop/package.json` �?`release-notes/v0.3.2.md`�?
- `bun test scripts/pr/release-workflow.test.ts scripts/pr/change-policy.test.ts` 通过�?1 tests passed�?

---

## Phase 5：最终验�?

### 16. Electron packaged smoke

**步骤�?*

- [ ] macOS：构�?`.app/.dmg`，启�?app，验证聊天、附件、通知、托盘、更�?mock、终端、预览面板�?
- [ ] Windows：构�?NSIS 安装器，安装后启�?app，验�?sidecar 文件锁和更新前停进程�?
- [ ] Linux：构�?deb/AppImage，验证启动、tray、通知、更新策略�?
- [x] 运行 `bun run test:package-smoke --platform macos` 作为包结构预检；Windows/Linux 待对应平台产物�?

**通过标准�?* 每个平台至少一个真实发布格式完�?smoke�?
**阻断条件�?* 只有 dev build �?Vite 页面通过�?

**执行记录�?026-05-31）：**

- macOS unpacked `.app` smoke 已完成一部分：`CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 成功，Computer Use 启动 packaged app 后主界面正常渲染，server sidecar 正常启动，终端面板可打开并执�?`printf electron-terminal-ok`�?
- Review 后重新运�?`cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 成功；`bun run test:package-smoke --platform macos` 通过，确认当�?`.app` 结构、`app.asar`、unpacked sidecar、unpacked `node-pty` native module �?`spawn-helper` 存在�?
- 因本机已有正�?`/Applications/AutoABM.app` 实例持有单实例锁，Computer Use 最�?smoke 使用同一构建输出重新打包临时 `AutoABM Smoke.app`（仅临时 appId/productName 不同）执行：packaged renderer �?`app.asar/dist/index.html` 加载，sidecar 自动启动，终端执�?`electron-terminal-ok`，系统目录选择器可打开，preview WebContentsView 可导�?`https://example.com/`，截图可回填 composer�?
- 注意：`test:package-smoke` �?bundle-structure/static-artifact preflight，不启动 GUI，也不替�?Computer Use 或实�?smoke�?
- 2026-06-01 同步本地 `main` 后重新运�?`cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 成功，产�?`desktop/build-artifacts/electron/mac-arm64/AutoABM.app`�?
- 2026-06-01 使用 Computer Use 操作真实 packaged app，并把本�?autoabm provider/model 配置复制到隔离临�?`CLAUDE_CONFIG_DIR`：模型选择器显�?`gpt-5.5 Sub2API-ChatGPT`，系统目录选择器选中 `/private/tmp/autoabm-electron-real-fixed-sRFUeO/project`�?
- 真实模型 smoke 会话 `e0d7abc2-27db-4ff1-9954-7923f6c3385e` 通过：packaged renderer �?`file://.../app.asar/dist/index.html` 加载，server sidecar 建立 WebSocket，CLI subprocess 使用 `--model gpt-5.5` 启动，模型读�?`package.json` �?`src/greeting.ts` 后经权限审批执行 `bun test`，结果为 `1 pass / 0 fail`，最终回复“测试通过。”�?
- 2026-06-01 重跑 `SKIP_INSTALL=1 SIGN_BUILD=0 desktop/scripts/build-macos-arm64.sh`：修复平台级 publish 后曾产出 `.app/.zip/.dmg/latest-mac.yml`，但 `latest-mac.yml` 与实际含空格 asset 文件名不一致；加入稳定 `artifactName` 后，清理�?disk image 挂载前本�?DiskImages/hdiutil �?`.dmg` 创建阶段超时，zip-only Electron Builder 也曾在本�?7za 子进程处失败�?
- 2026-06-01 清理�?Tauri/Electron disk image 挂载后，`MAC_TARGETS=zip SKIP_INSTALL=1 SIGN_BUILD=0 desktop/scripts/build-macos-arm64.sh` 通过，canonical `desktop/build-artifacts/macos-arm64` 产出 `.app`、`AutoABM-0.3.2-arm64.zip`、`.zip.blockmap` �?`latest-mac.yml`；脚本自动运�?`bun run test:package-smoke --platform macos --artifacts-dir desktop/build-artifacts/macos-arm64` �?PASS，确�?`latest-mac.yml` 引用真实 zip �?packaged resources �?`app-update.yml`�?
- 2026-06-01 `.dmg` target 最新复验通过：后续默�?`SKIP_INSTALL=1 SIGN_BUILD=0 desktop/scripts/build-macos-arm64.sh` 已完�?`dmg zip` target，canonical `desktop/build-artifacts/macos-arm64` 包含 `.app`、`.dmg`、`.zip`、blockmap �?`latest-mac.yml`，脚本自�?release package-smoke PASS。Gatekeeper/signed/notarized launch 仍保�?release blocker�?
- 2026-06-01 macOS build script hardening：默�?`dmg zip` target 在当�?worktree 检测到 stale Electron Builder `.temp...dmg` 挂载时会提前失败并给�?`MAC_TARGETS=zip` 替代路径，避免继续进入会卡死�?DiskImages detach/create 分支�?
- 2026-06-01 Windows build script hardening：canonical 输出现在保留 `win-unpacked` �?package-smoke 检�?`app.asar`、`app-update.yml`、unpacked sidecar �?`node-pty` 原生模块；脚本默认在 Windows runner 上执�?canonical package-smoke，但本机 macOS 未执�?NSIS 真实构建/安装�?
- 2026-06-01 Linux build script hardening：新�?`desktop/scripts/build-linux.sh` �?`build:linux-x64` / `build:linux-arm64` scripts，canonical 输出现在保留 AppImage/deb、`latest-linux.yml` �?`linux-unpacked` �?package-smoke 检查；本机 macOS 不能执行 Linux 真实构建/安装�?
- 2026-06-01 Linux package-smoke 区分开发目录包和发布包：`electron-builder --dir` 只产�?`linux-unpacked` 时仍检�?`app.asar`、sidecar �?`node-pty` 并通过 `check:native`；AppImage/deb 发布产物存在时继续要�?`latest-linux.yml` �?`app-update.yml`�?
- 2026-06-01 Linux arm64 updater metadata 修复：`build-linux.sh` 现在复制 `latest-linux*.yml`，避�?arm64 Electron Builder 产出 `latest-linux-arm64.yml` �?canonical `linux-arm64` 目录丢失 update metadata；`package-smoke` 同步识别 `latest-linux.yml` �?`latest-linux-arm64.yml`，并检�?metadata 引用�?AppImage/deb artifact 是否真实存在�?
- 2026-06-01 package-smoke 增加显式 `--package-kind dir|release`：`check:native` 使用 `dir + desktop/build-artifacts/electron`，发�?dev packaging workflow 和平�?release 脚本使用 `release + 精确 artifacts-dir`，避免旧 installer/metadata 污染本轮验包�?
- 2026-06-01 Gatekeeper 诊断加固：`--require-macos-gatekeeper` �?`spctl` 失败时，package-smoke 会同时记�?`codesign --verify --deep --strict --verbose=2`、`codesign -dv --verbose=4` �?`xcrun stapler validate` 摘要，方便区分未签名、签名链、bundle 格式�?notarization ticket 问题�?
- 2026-06-01 SubAgent Review 修复：release workflow 在打包矩阵前新增 `bun run verify` �?live 预检；`quality:gate --mode release` 会包�?PR checks，并�?`desktop-package-smoke:<platform>` 改为 `--package-kind release --artifacts-dir desktop/build-artifacts/<platform-arch>`，避免验到旧�?`--dir` 包�?
- 2026-06-01 多架�?metadata 风险收敛：release workflow 上传前会�?`latest*.yml` 改名为带 matrix label 后缀的唯一 asset，避�?GitHub Release 中同�?metadata 互相覆盖或上传失败；matrix 全部通过后由 `scripts/release-update-metadata.ts` 重新发布标准 updater channel metadata。macOS 会把 x64/arm64 zip entries 合并�?`latest-mac.yml`，Linux 会恢�?`latest-linux.yml` / `latest-linux-arm64.yml`，Windows 会恢�?`latest.yml`。完整自动更�?release 仍需�?signed/notarized artifact 上复验�?
- 2026-06-01 signing/notarization secrets preflight：release workflow 新增�?matrix `signing-preflight` job，在任何平台 artifact 上传前检�?`MACOS_CERTIFICATE`、`MACOS_CERTIFICATE_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`、`WINDOWS_CERTIFICATE` �?`WINDOWS_CERTIFICATE_PASSWORD`。缺失时�?GitHub Actions error 早停，避免部�?matrix leg 先发�?partial release。真�?Developer ID signing/notarization 仍需�?CI secrets 存在时复验�?
- 2026-06-01 native/package 当前态复验：`bun run check:native` 通过，完�?sidecar 构建�?ad-hoc signing、`check:electron` 83 tests、desktop production build、`electron-builder --dir`，并运行 `bun run test:package-smoke --platform macos --package-kind dir --artifacts-dir desktop/build-artifacts/electron` PASS。该证据只覆�?directory-only unpacked app bundle 结构、`app.asar`、sidecar、`node-pty` �?`spawn-helper`，不替代 `.dmg`、Gatekeeper �?signed release smoke�?
- 2026-06-01 DMG 当前态复验：默认 `SKIP_INSTALL=1 SIGN_BUILD=0 desktop/scripts/build-macos-arm64.sh` 已通过，canonical `desktop/build-artifacts/macos-arm64` 恢复 `.app`、`.dmg`、`.dmg.blockmap`、`.zip`、`.zip.blockmap`、`latest-mac.yml`，并�?release package-smoke PASS�?
- 2026-06-01 跨平�?package-smoke 当前态复验：`bun test scripts/quality-gate/package-smoke/index.test.ts scripts/pr/release-workflow.test.ts scripts/release-update-metadata.test.ts` 通过 26 tests，覆�?Windows canonical output、Linux x64/arm64 update metadata、release workflow Gatekeeper/signing preflight �?metadata republish；`bun run test:package-smoke --platform macos --package-kind release --artifacts-dir desktop/build-artifacts/macos-arm64` PASS，确认当�?macOS zip/update canonical artifact set 仍完整�?
- 本轮尚未完成 `.dmg` 安装包、通知点击、signed/notarized Gatekeeper launch、Windows NSIS �?Linux AppImage/deb 的真实发布格�?smoke，因此本阶段保持未完成。附件选择、目录选择、外链、终端和 preview 已有 dev �?unpacked packaged Computer Use 证据，但还不能替代最�?signed release artifact 的全量验收�?

### 17. Release gate

**步骤�?*

- [x] 运行 `bun run verify`�?
- [x] �?live provider 时运�?`bun run quality:gate --mode release --allow-live --provider-model <provider:model[:label]>`�?
- [x] 检�?quality report �?pass/fail/skip�?
- [x] 记录 coverage report 路径�?

**通过标准�?* PR/release 门禁通过，coverage 未退化�?
**阻断条件�?* 任一 release 必需 lane 失败�?

**执行记录�?026-06-01）：**

- `bun run verify` 通过：最新为 `artifacts/quality-runs/2026-05-31T21-42-57-279Z/report.md`，`passed=9 failed=0 skipped=1`�?
- 首次重跑完整 `release --allow-live` 后，�?agent-browser/Vite blocker 已消失；唯一失败�?coverage �?`h5-access-auth.test.ts` 随机端口撞到本机 WeChat �?`127.0.0.1:24023`�?
- 已把 `h5-access-auth.test.ts` 端口选择改成 OS 分配 ephemeral port；focused `bun test src/server/__tests__/h5-access-auth.test.ts` 通过，`bun run check:coverage` 最新通过：`artifacts/coverage/2026-05-31T21-46-15-873Z/coverage-report.md`，`passed=5 failed=0`�?
- 历史 `bun run quality:gate --mode release --allow-live --provider-model sub2api-chatgpt:main:sub2api-chatgpt-main` 曾通过：`artifacts/quality-runs/2026-05-31T20-29-45-758Z/report.md`，`passed=15 failed=0 skipped=0`。SubAgent Review �?release gate 已收窄为必须检�?canonical release artifact，当前仍需�?signed/notarized artifact 与可�?Computer Use 桌面会话上重新跑完整 release gate�?

### 18. Computer Use 全面测试

**步骤�?*

- [x] 用真实打�?app 运行 Computer Use 设置流程�?
- [x] 验证 Python 路径选择、权限授权、屏幕录�?辅助功能授权提示、授权应用列表�?
- [x] 验证点击、输入、滚动、系统快捷键、剪贴板�?
- [ ] 验证通知点击回到目标会话�?
- [ ] macOS �?Windows 至少各完成一次；Linux 如能力降级，写入 release note 和已知限制�?

**通过标准�?* Computer Use 在真�?Electron app 中完成端到端操作�?
**阻断条件�?* 只用浏览�?Vite �?mock 路径证明�?

**验证清单�?* 迁移收口使用 `docs/desktop/09-electron-migration-validation-checklist.md`，其中区分自动化证据、macOS Computer Use smoke、Windows 待实机和 Linux 待实机�?

**执行记录�?026-06-01）：**

- 尝试继续 Computer Use GUI 验收时，Computer Use 工具层对 `list_apps` �?`get_app_state(Finder)` 均返�?`NSOSStatusErrorDomain Code=-600 procNotFound`。该结果说明当前 macOS 自动化桥未拿到可用进程，不是 Electron app 单点问题；剩余附件、Python 路径、外链、Dock/tray、通知点击和完�?update feed 验收保持未完成�?
- 2026-06-01 后续复测 Computer Use 仍返回同一 `procNotFound`，这是连续第二个 goal turn 复现；目标仍可在代码和发布门禁层继续推进，因此暂不标�?goal blocked�?
- 2026-06-01 再次复测�?Computer Use `list_apps` 已恢复，�?`get_app_state(Electron)` �?Electron dev 壳超时，`get_app_state(Finder)` �?`cgWindowNotFound`；系�?`screencapture` 同时返回 `could not create image from display`。这说明当前桌面会话没有可用截图/窗口捕获能力，Computer Use 交互验收仍不能推进�?
- 2026-06-01 continuation 复测：Computer Use `list_apps` 仍可列应用，`get_app_state(Finder)` 仍为 `cgWindowNotFound`，`screencapture` 仍失败为 `could not create image from display`；当前仍不能完成附件、Python 路径、外链、Dock/tray、通知点击�?GUI 验收�?
- 2026-06-01 packaged app 启动�?macOS `AppleSystemPolicy` 拦截：`spctl -a -t execute desktop/build-artifacts/electron/mac-arm64/AutoABM.app` �?`bundle format unrecognized, invalid, or unsuitable`，系统日志显�?ad-hoc/unknown-chain app 被终止。本轮已新增 `bun run test:package-smoke --platform macos --require-macos-gatekeeper` 作为可�?release-readiness 检查；当前该检查失败，release-ready 需�?Developer ID signing/notarization 或真实签名产物复验�?
- 2026-06-01 release workflow 已补强：macOS release artifact 上传前强制运�?`bun run test:package-smoke --platform macos --require-macos-gatekeeper`，防止未通过 macOS 启动策略�?`.app/.dmg/.zip` 被发布；dev build 仍保留结构型 package-smoke�?
- 2026-06-01 修复 Electron dev launcher 代理问题：`electron:dev` 默认 renderer URL 改为 `http://localhost:1420`，并对当前进程、Vite �?Electron 子进程补�?`NO_PROXY/no_proxy=localhost,127.0.0.1,::1`，避免本机代理把 localhost renderer 等待请求打成 502�?
- 2026-06-01 主窗口显示逻辑加固：创�?`BrowserWindow` 后立�?`show/focus`，renderer load 完成后再�?`show/focus`，避免隐藏窗口在 load 等待期间被托�?单实�?Computer Use 路径视为无窗口�?
- 2026-06-01 SubAgent gap follow-up：renderer 生产代码不再�?`isTauriRuntime()` 判断通用桌面能力，新�?`isDesktopRuntime()`，更新弹窗、附�?native picker、设�?app mode、移动布局分支均识�?Electron/Tauri desktop host�?
- 2026-06-01 Electron updater proxy contract 已补齐：renderer 传入�?`{ proxy }` 会进�?Electron main，检查更新前应用�?Electron `app/session` proxy；切回系统代理时会清理手动代理，避免更新检查继续沿用旧 proxy�?
- 2026-06-01 package-smoke 增加发布型包�?installed updater metadata 检查：�?artifact set �?`.zip/.dmg/latest-mac.yml`、Windows installer/latest.yml �?Linux package/latest-linux.yml 时，安装�?resources 目录必须包含 `app-update.yml`；纯 `--dir` 开发包会记�?note 但不失败�?
- 2026-06-01 真实 provider smoke 使用本机 `~/.claude/autoabm/providers.json` selector `sub2api-chatgpt:main:sub2api-chatgpt-main` 通过：`artifacts/quality-runs/2026-05-31T21-28-07-154Z/report.md`，`passed=1 failed=0 skipped=0`。该路径复用 autoabm provider 配置，不�?`QUALITY_GATE_PROVIDER_*` 明文 env-only 分支�?
- 2026-06-01 `check:native` 已补上打包后验包：根脚本现在会在 Electron `--dir` 打包后运�?`test:package-smoke:current`。最�?`bun run check:native` 通过，package-smoke notes 明确当前�?`--dir` macOS artifact set 不强�?`app-update.yml`，也不代�?GUI 启动�?Gatekeeper approval�?
- 2026-06-01 final-definition 复测：Computer Use `list_apps` 正常，但 `get_app_state(Finder)` 仍返�?`cgWindowNotFound`；系�?`screencapture -x /tmp/autoabm-cua-retake-final.png` 仍失败为 `could not create image from display`。当前机器继续不能承载真�?GUI 操作验收�?
- 2026-06-01 cross-platform-script 复测：Computer Use `list_apps` 正常且可�?`/Applications/AutoABM.app`，`get_app_state(Finder)` 仍为 `cgWindowNotFound`，`get_app_state(AutoABM)` 返回 `remoteConnection`，系�?`screencapture -x /tmp/autoabm-computer-use-check.png` 仍失败为 `could not create image from display`。当前仍不能完成点击、输入、附件选择、托盘恢复、通知点击�?GUI 验收�?
- 2026-06-01 package-kind 复测：Computer Use `list_apps` 正常且显�?`/Applications/AutoABM.app` 正在运行，`get_app_state(AutoABM)` �?`get_app_state(Finder)` 均返�?`cgWindowNotFound`，系�?`screencapture -x /tmp/autoabm-computer-use-check-2.png` 仍失败为 `could not create image from display`。当前机器仍不能承载真实 GUI 操作验收�?
- 2026-06-01 Gatekeeper 诊断加固：release-readiness package-smoke �?`spctl` 失败时会补充 `codesign` verify/details 摘要，后�?signed/notarized artifact 的失败可以直接从 quality log 判断是签名链、bundle 格式还是 notarization policy 问题�?
- 2026-06-01 Gatekeeper 诊断复验：当�?ad-hoc `.app` 仍被 `spctl` 拒绝�?`bundle format unrecognized, invalid, or unsuitable`，但 package-smoke 已输�?`codesign verification exited with status 0` �?bundle identifier/signature detail 摘要，证明诊断链路可用；release blocker 仍是 Developer ID signing/notarization 或真实签名产物复验�?
- 2026-06-01 Gatekeeper 诊断�?Computer Use 复测：`list_apps` 可见运行中的 `/Applications/AutoABM.app`，但 `get_app_state(AutoABM)` �?`get_app_state(Finder)` 均仍�?`cgWindowNotFound`，系�?`screencapture -x /tmp/autoabm-computer-use-check-3.png` 仍失败为 `could not create image from display`。当前机器继续无法执行点击、输入、文件选择器、托�?通知�?GUI 验收�?
- 2026-06-01 Security/Runtime Review 修复：Electron 移除�?renderer 可调用的 `previewEval` 任意 JS 注入通道，预览截�?元素选择改走结构�?`preview.message`；`shell.openPath` 改为只允许已存在的普通文�?目录，并拒绝 `.app`、脚�?安装�?Windows 可执行扩展和 POSIX executable 文件；Electron 暂不声明自定�?window controls，避�?Windows 原生标题栏与自定义标题栏双渲染�?
- 2026-06-01 release metadata 合并�?Computer Use 复测：`list_apps` 可见运行中的 `/Applications/AutoABM.app`，但 `get_app_state(AutoABM)` �?`get_app_state(Finder)` 均仍�?`cgWindowNotFound`，系�?`screencapture -x /tmp/autoabm-computer-use-check-4.png` 仍失败为 `could not create image from display`。当前机器继续无法执行点击、输入、文件选择器、托�?通知�?GUI 验收�?
- 2026-06-01 mock update feed UI 流程补强：`UpdateChecker` 集成测试通过 Electron `desktopHost` mock update feed 驱动真实 `updateStore`，覆�?check/download/install/relaunch 状态流、下载完成弹窗、点击安装后 prompt 退出。signed/release feed 仍需真实 signed/notarized artifact 复验�?
- 2026-06-01 mock update feed UI 补强�?Computer Use 复测：`list_apps` 可见运行中的 `/Applications/AutoABM.app`，但 `get_app_state(AutoABM)` �?`get_app_state(Finder)` 均仍�?`cgWindowNotFound`，系�?`screencapture -x /tmp/autoabm-computer-use-check-5.png` 仍失败为 `could not create image from display`。当前机器继续无法执行点击、输入、文件选择器、托�?通知�?GUI 验收�?
- 2026-06-01 macOS Keychain 弹窗修复：用户截图显�?Electron/Chromium 反复请求 `claude-code-desktop Safe Storage`。原因是 Chromium profile safe storage 会访�?macOS Keychain；本项目 OAuth token 已走 sidecar file-backed storage，不依赖 Chromium cookie/password store。Electron main 现在在启动早期对 macOS 设置 `use-mock-keychain`，并�?`ModelSelector` 的官�?OAuth status 从挂载即请求改为 runtime 下拉打开时按需请求一次，避免启动/重渲染时反复触发敏感存储路径。验证：`cd desktop && bun run test -- --run src/components/controls/ModelSelector.test.tsx electron/services/keychain.test.ts` 12 tests passed；`cd desktop && bun run check:electron` 80 tests passed 并完�?main/preload bundle�?
- 2026-06-01 Keychain 修复�?Computer Use 复测：`bun run electron:dev` 启动当前 Electron dev 壳，`get_app_state(Electron)` 成功返回 `localhost:1420/` 主界面和模型选择�?`gpt-5.5 Sub2API-ChatGPT`；截�?AX 树中未再出现 `claude-code-desktop Safe Storage` 钥匙串授权弹窗。随后已终止 dev Electron/Vite 进程�?
- 2026-06-01 Keychain 当前态复验：`cd desktop && bun run test -- --run electron/services/keychain.test.ts src/components/controls/ModelSelector.test.tsx` 通过 12 tests；`cd desktop && bun run check:electron` 通过 83 tests 并完�?Electron main/preload/preview-preload bundle。Computer Use `get_app_state(Electron)` 返回 `AutoABM` 主窗口和 `localhost:1420/` renderer，未出现 Safe Storage 钥匙串授权弹窗�?
- 2026-06-01 原生附件文件选择补强：Electron dialog IPC 改为使用当前 `BrowserWindow` 作为 parent window，composer 打开原生选择器前先关�?plus 菜单，避免无 owner sheet 返回后菜单状态残留。验证：`bun test electron/services/dialogs.test.ts` 3 tests passed；`bun run test -- --run src/lib/composerAttachments.test.ts src/components/chat/ChatInput.test.tsx src/pages/EmptySession.test.tsx` 33 tests passed；`bun run check:electron` 80 tests passed；Computer Use �?Electron dev 壳中成功选择 `/Users/nanmi/autoabm-cua-attachment-smoke.txt` 并显示附�?chip，未出现 Safe Storage 弹窗�?
- 2026-06-01 packaged updater 噪音修复：Electron updater service �?packaged `app-update.yml` 缺失时直接返回“无更新”，并将 electron-updater 内置 logger 设为 `null`，避免目录包�?GitHub release 暂缺 `latest-mac.yml` 时在启动日志里打�?404 stack；非 metadata 错误仍会抛出。验证：`cd desktop && bun test electron/services/updater.test.ts electron/services/singleInstance.test.ts` 13 tests passed；`cd desktop && bun run check:electron` 89 tests passed�?
- 2026-06-01 single-instance 验证绕过：新增显�?`AUTOABM_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK=1` 供本地验证启动同 bundle �?worktree/canonical app，不影响默认生产单实例行为，避免需要杀掉用户正在使用的 `/Applications/AutoABM.app`�?
- 2026-06-01 canonical macOS release Computer Use 复测：`SKIP_INSTALL=1 SIGN_BUILD=0 desktop/scripts/build-macos-arm64.sh` 通过默认 `dmg zip`，release package-smoke PASS；用隔离配置�?`AUTOABM_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK=1` 启动 `desktop/build-artifacts/macos-arm64/AutoABM.app`，server sidecar 启动，Computer Use `get_app_state` 成功读取 `AutoABM` 主窗口和 packaged renderer。启动日志没�?`app-update.yml` �?`latest-mac.yml` updater stack�?
- 2026-06-01 canonical packaged 系统交互复测：在同一�?`desktop/build-artifacts/macos-arm64/AutoABM.app` 隔离实例中，Computer Use 确认项目选择器已选中系统原生目录选择结果 `/private/tmp/autoabm-electron-real-fixed-sRFUeO/project`；点�?`打开终端` 后终端面板显�?`运行�?/bin/zsh / /tmp/autoabm-canonical-cua-flow.xTxSmt/claude-config`，输�?`printf 'canonical-terminal-ok\n'; pwd` 后画面可�?`canonical-terminal-ok` 和实际工作目录输出。该轮未出现 `claude-code-desktop Safe Storage` 钥匙串弹窗�?
- 2026-06-01 canonical packaged Computer Use 设置流程复测：用隔离 `CLAUDE_CONFIG_DIR` 启动 `desktop/build-artifacts/macos-arm64/AutoABM.app`，Computer Use 打开设置页后进入 `Computer Use` tab。首次状态请求曾�?30s timeout 显示 `Failed to check status`，点�?`重试` 后页面正常显�?Python 3.14.5、venv 未创建、依赖未安装。通过页面 `安装环境` 按钮完成真实 server/setup 链路，随�?UI 显示 venv 已就绪、依赖包已安装、辅助功能权限已授权、屏幕录制权限未授权；`curl /api/computer-use/status` 返回 `venv.created=true`、`dependencies.installed=true`、`permissions.accessibility=true`、`permissions.screenRecording=false`。点�?`打开屏幕录制设置` �?Computer Use 成功读取 macOS 系统设置窗口 `录屏与系统录音`，并看到 `AutoABM` 权限项�?
- 2026-06-01 canonical packaged Computer Use 授权应用复测：复用隔�?packaged app，Computer Use 在设置页搜索 `Terminal`，应用列表返�?`Terminal / com.apple.Terminal`；点击该项后 UI 显示 check 状态，隔离配置 `autoabm/computer-use-config.json` �?`GET /api/computer-use/authorized-apps` 均返�?`authorizedApps[0].bundleId=com.apple.Terminal`，`grantFlags.clipboardRead=true`、`grantFlags.clipboardWrite=true`、`grantFlags.systemKeyCombos=true`。该轮覆盖了真实 UI 点击、输入、滚动、应用枚举和授权配置持久化�?
- 2026-06-01 notarization 诊断复验：`bun test scripts/quality-gate/package-smoke/index.test.ts` 15 tests passed；`bun run test:package-smoke --platform macos --package-kind release --artifacts-dir desktop/build-artifacts/macos-arm64 --require-macos-gatekeeper` 预期失败，但输出现在同时包含 `spctl`、`codesign` �?`notarization ticket validation` 诊断，当�?ad-hoc app 被分类为没有 stapled notarization ticket�?
- 2026-06-01 Gatekeeper 当前态复跑：`bun run test:package-smoke --platform macos --package-kind release --artifacts-dir desktop/build-artifacts/macos-arm64` 通过，确�?release artifact 结构、`latest-mac.yml` 引用 zip、`app-update.yml`、sidecar �?`node-pty` 完整；追�?`--require-macos-gatekeeper` 后仍失败，`codesign` verify/details 通过�?`spctl` 返回 `bundle format unrecognized, invalid, or unsuitable`，`stapler` 返回 `does not have a ticket stapled to it`。package-smoke 现已�?`spctl` �?`Too many open files` 时用 raised file descriptor limit 自动重试，避免该临时诊断掩盖真实 Gatekeeper 结果。release-ready 仍需�?Developer ID signing/notarization 或真实签名产物复验�?
- 2026-06-01 Gatekeeper 诊断补强�?Computer Use 复测：用隔离 `CLAUDE_CONFIG_DIR` �?`--user-data-dir` 启动 `desktop/build-artifacts/electron/mac-arm64/AutoABM.app`，Computer Use 成功读取 `AutoABM` 主窗口和 packaged `file://.../app.asar/dist/index.html` renderer，证�?package-smoke 诊断补强未破�?packaged app 运行路径�?
- 2026-06-01 release gate 口径收紧：`quality:gate --mode release` 的当前平�?`desktop-package-smoke:macos` lane 现在会追�?`--require-macos-gatekeeper`，与 GitHub release workflow 上传�?Gatekeeper 检查保持一致。验证：`bun test scripts/quality-gate/runner.test.ts scripts/quality-gate/package-smoke/index.test.ts scripts/pr/release-workflow.test.ts` 通过 39 tests；`bun run quality:gate --mode release --dry-run --only 'desktop-package-smoke:*'` 报告命令包含 `--require-macos-gatekeeper`；实际运�?`bun run quality:gate --mode release --only 'desktop-package-smoke:*'` 失败�?Gatekeeper，报告为 `artifacts/quality-runs/2026-06-01T12-16-06-442Z/report.md`�?
- 2026-06-01 当前 release provider smoke 复验：`bun run quality:gate --mode release --allow-live --only 'provider-smoke:*' --provider-model sub2api-chatgpt:main:sub2api-chatgpt-main` 通过，报告为 `artifacts/quality-runs/2026-06-01T12-18-47-144Z/report.md`；随后用 Computer Use 启动隔离 packaged app，成功读�?`AutoABM` 主窗口和 packaged `file://.../app.asar/dist/index.html` renderer�?
- 2026-06-01 governance gate 复验：`bun run check:policy` 通过 77 tests，并执行 `check:quarantine`，覆�?release workflow、quality gate runner、provider/desktop smoke、change policy、quality contract �?quarantine governance。随后用 Computer Use 再次启动隔离 packaged app；首次读取遇�?ScreenCaptureKit stream error，但 System Events 显示同一 PID �?`AutoABM` 窗口，重试后 Computer Use 成功读取 packaged `file://.../app.asar/dist/index.html` renderer�?
- 2026-06-01 本地 `main` 同步后复验：已把本地 `main` 最�?10 个提交的非重叠改动应用到当前迁移工作区，并手动合�?`ChatInput.tsx` / `previewEvents.ts` / `previewEvents.test.ts` 中的 append prefill �?Electron `desktopHost.preview` 改造。验证：`cd desktop && bun run test -- --run src/components/chat/ChatInput.test.tsx src/lib/previewEvents.test.ts` 通过 24 tests；`bun test src/cli/__tests__/structuredIO.test.ts src/services/api/withRetry.test.ts src/utils/__tests__/imageResizer.test.ts src/utils/shell/powershellDetection.test.ts src/server/__tests__/providers.test.ts src/server/__tests__/conversation-service.test.ts src/server/__tests__/conversation-attachments.test.ts src/server/__tests__/websocket-handler.test.ts` 通过 124 tests；`cd adapters && bun test feishu/__tests__/streaming-card.test.ts` 通过 36 tests；`cd desktop && bun run check:electron` 通过 94 tests；`CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 重新生成 packaged dir；`bun run test:package-smoke --platform macos --package-kind dir --artifacts-dir desktop/build-artifacts/electron` 通过；Computer Use 成功读取新打包的 `desktop/build-artifacts/electron/mac-arm64/AutoABM.app` 主窗口和 packaged renderer�?
- 2026-06-01 release update blockmap 验证补强：`package-smoke` �?release 模式现在强制检�?macOS `.zip/.dmg.blockmap`、Windows `.exe.blockmap` �?Linux `.AppImage.blockmap`，避免只�?channel metadata 和安装包但缺�?electron-updater 差分更新文件。验证：`bun test scripts/quality-gate/package-smoke/index.test.ts` 通过 17 tests；`bun run test:package-smoke --platform macos --package-kind release --artifacts-dir desktop/build-artifacts/macos-arm64` 通过，并确认当前 macOS release artifact set �?`.dmg.blockmap` �?`.zip.blockmap`�?
- 2026-06-01 packaged update smoke 补强：新�?`AUTOABM_ELECTRON_UPDATE_SMOKE_VERSION` 驱动�?Electron main updater stub，仅在显�?smoke env 下启用；`app-update.yml` 缺失不会阻断�?smoke stub，生�?`electron-updater` 仍保持缺�?metadata �?no-op。验证：`cd desktop && bun run check:electron` 通过 94 tests；`CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 生成新的 packaged dir；复制为唯一 bundle id �?smoke app 后，packaged renderer `file://.../app.asar/dist/index.html` 通过 preload 调用 `desktopHost.updates.check/download/prepareInstall/install/relaunch`，JSONL 记录 `check`、`download-start`、`download-finish`、`quit-and-install`。同�?Computer Use `list_apps` 可见唯一 smoke app，但 `get_app_state` 对该 app 仍超时，故真实“点击安装”仍不能声明通过�?
- 2026-06-01 packaged window smoke 诊断：新�?`AUTOABM_ELECTRON_WINDOW_SMOKE_LOG`，main process �?`after-create`、`after-initial-show`、`did-finish-load` �?`after-final-show` 写入窗口快照。早前同一 packaged dir 启动日志显示 Electron `BrowserWindow` �?`visible:true`，bounds �?`1280x820`，URL �?packaged `file://.../app.asar/dist/index.html`，但 System Events 曾读取到 `windows count=0` �?Computer Use `get_app_state` 超时；随后用完整 `.app` 路径复测，Computer Use 成功读取 `AutoABM` 主窗口和 packaged renderer，System Events 返回 `front=true count=1 names=AutoABM`。当前结论是之前的卡点在 macOS AX/窗口捕获状态波动，不是 renderer、server、更�?preload smoke 或关闭智能体流程�?
- 2026-06-01 packaged notification click 复测：直接执�?app binary �?smoke env 未进入最�?Electron app 进程，改�?`launchctl setenv` + `open -n ... --args --user-data-dir=<tmp>` 后，packaged app �?`AUTOABM_ELECTRON_NOTIFICATION_SMOKE_LOG` 正常写入 `scheduled` �?`sent:true`。Computer Use �?`/System/Library/CoreServices/NotificationCenter.app` �?`SystemUIServer` 仍返�?`timeoutReached`，Finder 状态读取返�?ScreenCaptureKit stream error，JSONL 未出�?`action`；因此“点击通知回到目标 session”仍保持未完成�?
- 2026-06-01 通知点击再次复测：用 `launchctl setenv` 启动 worktree packaged app 后，JSONL 正常写入 `scheduled` �?`sent:true`，但 Computer Use 对该 worktree app 连续返回 ScreenCaptureKit stream error；`list_apps` 能看�?worktree app running。随后复制当�?packaged app 为唯一 bundle id smoke app �?ad-hoc 重签名，LaunchServices 能注册该 smoke app，但应用立即退出，系统日志显示 appDeath；因此本轮仍不能把真�?OS 通知点击回跳勾选为完成�?
- 2026-06-01 当前全量桌面/服务端门禁复验：`cd desktop && bun run check:desktop` 通过 desktop lint�?51 �?Vitest 文件�?199 个测试和 production build；`bun run check:server` 通过 88 files / 969 tests。通知真实点击、signed/notarized Gatekeeper、Windows/Linux 实机 release smoke 仍保持未完成项�?
- 2026-06-01 通知点击 renderer ack 补强：新�?Electron `desktop:notification:action-ack` IPC，renderer 处理通知 action 并打开目标 session 后，会把 `{ target, payload }` 写入 `AUTOABM_ELECTRON_NOTIFICATION_SMOKE_LOG` �?`renderer_ack` 事件。该补强不模�?OS 点击，只让后续可点击通知�?macOS/Windows runner 能证�?main action 已进�?UI 导航链路。验证：focused notification/desktopHost tests 42 passed；`cd desktop && bun run check:electron` 通过 97 tests；`CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:package:dir` 重新生成 packaged dir；`bun run test:package-smoke --platform macos --package-kind dir --artifacts-dir desktop/build-artifacts/electron` PASS�?
- 2026-06-01 renderer ack 补强�?Computer Use 复测：用隔离 `CLAUDE_CONFIG_DIR`、隔�?`--user-data-dir` �?notification smoke env 启动当前 worktree packaged app 时，Computer Use 首次 `get_app_state` 返回 `timeoutReached`，直接执行也曾退�?137。随后用隔离 `CLAUDE_CONFIG_DIR` / `--user-data-dir` 重新直接运行同一 `.app` 后保持运行，Computer Use 成功读取 `AutoABM` 主窗口，renderer URL 为当�?worktree �?packaged `file://.../app.asar/dist/index.html`；点击设置入口后进入 packaged 设置页。该轮确认当�?Electron build 可被 Computer Use 读取和交互；`spctl -a -t execute desktop/build-artifacts/electron/mac-arm64/AutoABM.app` 仍返�?`bundle format unrecognized, invalid, or unsuitable`，`codesign --verify --deep --strict` 通过，因此真�?OS 通知点击�?signed/notarized launch 仍未完成�?
- 2026-06-01 packaged synthetic notification action 复测：新增显�?smoke-only 开�?`AUTOABM_ELECTRON_NOTIFICATION_SMOKE_TRIGGER_ACTION=1`，只在测试环境中�?main process 对刚发送的通知 action 触发同一�?renderer ack 链路。用 `launchctl setenv` + `open -n desktop/build-artifacts/electron/mac-arm64/AutoABM.app --args --user-data-dir=<tmp>` 启动当前 worktree packaged app 后，Computer Use 成功读取 `AutoABM`，renderer URL �?`file:///Users/nanmi/.codex/worktrees/2392/claude-code-haha/desktop/build-artifacts/electron/mac-arm64/Claude%20Code%20Haha.app/Contents/Resources/app.asar/dist/index.html`；JSONL 记录 `scheduled`、`sent:true`、`synthetic_action` �?`renderer_ack`。该 synthetic action 仅证�?packaged main -> renderer action -> ack 链路，不替代真实 OS 通知点击；真实“点击通知后回到目�?session”仍未完成�?

---

## Review 收口记录

### 2026-05-31 SubAgent Review

- [x] Security Review：收�?packaged renderer entry，packaged app 不再接受 `ELECTRON_RENDERER_URL`；dev 模式只允�?local HTTP renderer�?
- [x] Security Review：preview bridge 增加大小上限、事�?allowlist、字�?schema、`data:image/*` 校验，外部页面不能向 host 注入无限大或未知事件�?
- [x] Security Review：packaged macOS `node-pty` runtime cache 增加 manifest 校验、tamper 后重建、cache/helper 权限收紧�?
- [x] Code Review：macOS “打开通知设置”改�?native command �?allowlisted system settings URL�?
- [x] Code Review：Electron `preview.message()` 改为转发�?injected preview bridge，不�?silent no-op�?
- [x] Code Review：dev/release desktop workflows �?Electron builder 后运�?`test:package-smoke`，避免上传缺�?sidecar �?`node-pty` 关键资源的产物�?
- [x] Verification Review：新�?`docs/desktop/09-electron-migration-validation-checklist.md`，明�?`package-smoke` 只是结构预检，最终完成仍需要真�?packaged app + Computer Use/实机 smoke�?
- [x] Release gate follow-up：`desktop-smoke:agent-browser-chat:*` 保留�?baseline/browser confidence lane，不再作�?release 必需 lane；release mode 新增 `desktop-package-smoke:<platform>`，用当前平台 Electron packaged artifact 结构检查配�?Computer Use 真实 app 验收，避免用浏览�?Vite open 结果代表桌面构建可用性�?

---

## 最终完成定�?

- [x] `desktop/src` 生产代码不再直接依赖 `@tauri-apps/*`�?
- [x] Electron main/preload IPC �?capability registry �?payload validation�?
- [x] 本地 Bun server + REST/WebSocket contract 保留，renderer 没有�?session/chat/workspace/team 主链改成 IPC�?
- [x] 自动更新、通知、文件选择、外链打开、窗�?托盘/菜单、sidecar、terminal、preview、app mode、zoom 全部有测试或 smoke 证据�?
- [ ] macOS、Windows、Linux 发布产物可构建并启动�?
- [x] `bun run verify` 通过�?
- [x] release gate 通过，或 live provider blocker 被明确记录�?
- [ ] Computer Use 对真实打�?app 完成全面测试�?

**最终定义复核（2026-06-01）：**

- 生产 Tauri 边界扫描通过：`rg -n "@tauri-apps|__TAURI_INTERNALS__|window\\.__TAURI__|from ['\\\"]@tauri" desktop/src --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/lib/desktopHost/**' --glob '!src-tauri/**'` 无输出�?
- Electron IPC 复核通过：`desktop/electron/ipc/capabilities.ts` 为每�?`ELECTRON_IPC_CHANNELS` channel 定义 validator，`desktop/electron/main.ts` �?`registerHandler()` 在进�?handler 前执�?`isElectronIpcChannel()` �?`validateElectronIpcPayload()`；renderer `electronHost` 也在 preload bridge 调用前执行相�?payload validation�?
- REST/WebSocket 主干复核通过：session/workspace/team 仍在 `desktop/src/api/sessions.ts`、`desktop/src/api/teams.ts`、`desktop/src/api/websocket.ts` 调用 `/api/**` �?`/ws/:sessionId`；Electron IPC 命中仅覆�?host/system 能力、terminal �?preview，不承载 chat/session/workspace/team 主业务�?
- 系统能力证据复核通过：Electron service/API tests 覆盖 updater、notifications、dialogs、shell、windows/tray/menu/single-instance、sidecar、terminal、preview、app mode、zoom；macOS `.dmg/.zip/latest-mac.yml` canonical release artifact set 已通过 `package-smoke`，canonical `.app` 已通过 Computer Use 窗口可见�?smoke；完整完成仍�?signed/notarized Gatekeeper、通知真实点击、Windows/Linux 实机发布格式 smoke 阻塞�?
