# Tauri 迁移 Electron 调研索引

> 日期：2026-05-31
> 范围：桌面端壳层从 Tauri 2 迁移到 Electron，React/Vite 渲染层尽量复用。
> 状态：调研与迁移方案，不是最终实现说明。

## 结论

迁移方向可行，但不能按“把 Tauri 项目换成 Electron 模板”处理。当前桌面端把 Tauri 2 当作完整 host runtime 使用：它负责自动更新、系统通知、文件选择、外链打开、窗口/托盘/菜单、子进程 sidecar、PTY 终端、子 WebView 预览面板、应用模式配置、窗口状态持久化和权限白名单。React 页面主体可以复用，但必须先把 `desktop/src` 里的 `@tauri-apps/*` 直接调用收敛为一层 `desktopHost` adapter，然后再并行保留 Tauri 实现和新增 Electron 实现。

推荐目标架构是：

```text
desktop/src React renderer
  -> desktop/src/lib/desktopHost/* typed host adapter
  -> Tauri implementation during transition
  -> Electron preload contextBridge implementation
  -> Electron main process services
       - sidecar manager
       - updater service
       - notification service
       - dialog/open service
       - window/tray/menu service
       - terminal/pty service
       - preview WebContentsView service
```

这样可以让前端继续用同一套 Zustand store、API client、WebSocket 和组件测试，同时把高风险系统能力迁移压缩到 adapter contract 和 Electron main/preload 层。不要把本地 Bun server 合并进 Electron main，也不要把 renderer 从 HTTP/WebSocket 改成全 IPC；现有 `desktop/src/api/*`、`chatStore`、`workspacePanelStore`、`teamStore` 已经围绕 local server contract 做了重连、去重、流式 flush 和多客户端观察，这些成熟行为应作为迁移边界保留。

## 外部依据

本次调研以官方文档和 GitHub issue 为准，Twitter/X 搜索结果信噪比较低，未作为决策依据。

- Tauri README 明确 Tauri 通过 WRY 使用系统 WebView：macOS/iOS 是 WKWebView，Windows 是 WebView2，Linux 是 WebKitGTK；同时 Tauri 提供 bundler、自更新、托盘和原生通知等桌面能力。参考：[tauri-apps/tauri](https://github.com/tauri-apps/tauri)。
- Tauri 2 updater 插件使用 endpoint/static JSON 和 capability permission；危险命令默认阻断，必须在 capabilities 里放行。参考：[Tauri Updater](https://v2.tauri.app/plugin/updater/)。
- Tauri capability 是按 window/webview 授权的权限集合，权限名使用 `plugin:permission` 形式。参考：[Tauri Capability](https://v2.tauri.app/reference/acl/capability/)。
- Electron 推荐使用 preload + `contextBridge`，不要把 `ipcRenderer` 原样暴露给 renderer；`contextIsolation` 从 Electron 12 起默认启用。参考：[Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 与 [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)。
- Electron 内置 `autoUpdater` 不支持 Linux；如果要覆盖 macOS/Windows/Linux，更适合用 `electron-builder` + `electron-updater`。参考：[Electron autoUpdater](https://www.electronjs.org/docs/api/auto-updater/) 与 [electron-builder Auto Update](https://www.electron.build/docs/features/auto-update)。
- Electron `BrowserView` 已弃用，应使用 `WebContentsView` 承载内嵌浏览器/预览面板。参考：[Electron BrowserView](https://www.electronjs.org/docs/latest/api/browser-view)。
- Tauri 社区 issue 里也能看到系统 WebView 的真实世界差异，例如 macOS WebView 特定异常和 WebKit memory/performance 争议。参考：[tauri #13141](https://github.com/tauri-apps/tauri/issues/13141)、[tauri #5889](https://github.com/tauri-apps/tauri/issues/5889)。

## 本仓库现状

### 桌面三层

- React/Vite renderer：`desktop/src`。
- Tauri host：`desktop/src-tauri`。
- 本地 server/CLI sidecar：`desktop/sidecars/claude-sidecar.ts` 打包成 `desktop/src-tauri/binaries/claude-sidecar-*`，再由 Tauri host 启动。

迁移后仍应保留这个三层关系，只把中间 host 从 Tauri 改成 Electron：

- React renderer 继续调用 `desktop/src/api/client.ts`、`sessionsApi`、`teamsApi`、WebSocket manager。
- Electron main 负责启动和监管 local server sidecar。
- renderer 通过 `getServerUrl` 得到 local server URL，而不是直接通过 IPC 读写会话数据。

关键入口：

- `desktop/src-tauri/src/lib.rs` 注册 Tauri plugins、commands、tray/menu、sidecar、terminal、update 准备、通知 bridge、窗口生命周期。
- `desktop/src-tauri/capabilities/default.json` 声明 Tauri 2 权限。
- `desktop/src-tauri/tauri.conf.json` 声明窗口、CSP、updater、bundle、externalBin、icons。
- `desktop/src/lib/desktopRuntime.ts` 解析 Tauri runtime 并获取 local server URL。
- `desktop/src/stores/updateStore.ts` 管理自动更新状态机。
- `desktop/src/lib/desktopNotifications.ts` 管理通知权限、发送、点击回跳和系统设置入口。
- `desktop/src/api/terminal.ts` 通过 Tauri command + event 管理 PTY。
- `desktop/src/lib/previewBridge.ts` 和 `desktop/src-tauri/src/webview_panel.rs` 管理内嵌预览 WebView。

### 当前性能背景

`SCROLL_PERF_INVESTIGATION.md` 的关键判断是：卡顿主要来自 macOS Tauri 使用 WKWebView，而 Electron 固定 Chromium/Blink。已合并的 `content-visibility:auto` 是 WebKit 侧缓解方案，但如果目标是接近 CodeX/官方 Claude Code 的一致滚动性能，Electron 是合理方向。迁移收益是可控渲染栈和跨平台一致性；成本是安装体积、内存、签名更新链路和安全边界全部要重建。

## Tauri 2 能力盘点与 Electron 对照

| 能力 | 当前 Tauri 位置 | Electron 目标 | 迁移风险 |
| --- | --- | --- | --- |
| 自动更新 | `tauri.conf.json` `plugins.updater`、`updateStore.ts`、`prepare_for_update_install`、`tauri.release-ci.json` | `electron-builder` + `electron-updater`，main process 暴露 `check/download/install/relaunch` IPC | 签名、feed metadata、Windows sidecar 文件锁、Linux update 支持不能照搬 |
| 通知 | `tauri-plugin-notification`、`desktopNotifications.ts`、`macos_notifications.m` | Electron `Notification` + main process click routing，必要时保留 macOS native bridge | macOS 权限状态和点击回跳语义必须回归测试 |
| 文件/目录选择 | `@tauri-apps/plugin-dialog.open/save` | `dialog.showOpenDialog/showSaveDialog` | 从 Tauri capability 变成自管 IPC 白名单，路径和 options 要验证 |
| 外链/系统打开 | `@tauri-apps/plugin-shell.open` | `shell.openExternal/openPath` | 必须限制 URL scheme，避免 renderer 任意打开危险目标 |
| sidecar | Tauri shell plugin + `start_server_sidecar` / `spawn_and_track_adapters_sidecar` | Electron main `child_process.spawn` + sidecar manager | 动态端口、启动日志、adapter 重启、Windows kill 逻辑必须等价 |
| PTY 终端 | Rust `portable-pty` commands + Tauri events | Electron main 继续用 Node/Rust sidecar/原生模块之一提供 PTY | 如果从 Rust 移到 Node，shell 解析和 Windows 行为会变 |
| 窗口/托盘/菜单 | `setup_system_tray`、macOS `MenuBuilder`、`RunEvent` | `BrowserWindow`、`Tray`、`Menu`、`app` lifecycle | 关闭隐藏到托盘、macOS reopen、窗口位置恢复必须逐平台验证 |
| 窗口控制/拖拽 | `getCurrentWindow().minimize/toggleMaximize/close/startDragging` | preload bridge 到 `BrowserWindow` actions | 自定义标题栏和拖拽区域需要真实窗口 smoke |
| 子 WebView 预览 | Tauri `WebviewBuilder.add_child` + `preview_*` commands | `WebContentsView`，renderer 只发 typed IPC | `BrowserView` 已弃用，URL 白名单和消息 JSON 校验必须保留 |
| 单实例 | `tauri_plugin_single_instance` | `app.requestSingleInstanceLock()` | 第二实例参数、显示主窗口、协议启动要补测试 |
| app mode / portable config | `get_app_mode`、`set_app_mode`、`detect_portable_dir`、`CLAUDE_CONFIG_DIR` | main process config service | 这是持久化形状变更，要跑 persistence upgrade gate |
| zoom | `set_app_zoom` | `webContents.setZoomFactor` | 范围 clamp 和设置页行为要保持 |
| 权限模型 | `capabilities/default.json` | 自定义 IPC capability registry | 这是安全边界，不能让 renderer 直接拿 Node/Electron API |

## React 可复用边界

可复用：

- `desktop/src/components/**` 中大部分聊天、设置、任务、workspace、markdown、browser UI。
- `desktop/src/stores/**` 的业务状态机，前提是依赖 host 能力的 store 改成调用 adapter。
- `desktop/src/api/**` 的 HTTP/WebSocket client。
- `desktop/scripts/build-preview-agent.ts`、`desktop/scripts/build-sidecars.ts` 的 sidecar 编译逻辑。
- `scripts/quality-gate/**` 的报告和 lane 框架。

必须抽象：

- runtime 探测：`isTauriRuntime()` 需要替换为 `getDesktopHostKind()`，支持 `browser`、`tauri`、`electron`。
- command 调用：`invoke('...')` 改为 typed host methods。
- event 订阅：Tauri `listen(...)` 改为 typed `desktopHost.events.on(...)`。
- shell/dialog/notification/update/window/preview/terminal：全部通过 adapter 暴露。

不应复用为最终形态：

- `desktop/src-tauri/**` 的 Tauri 配置和 Rust host crate。
- Tauri capability JSON。Electron 需要等价的 IPC allowlist，但不是同一格式。
- `tauri-apps/tauri-action` 和 `tauri build` CI 步骤。

必须避免的重写：

- 不重写 `desktop/src/api/websocket.ts` 的重连、退避、ping 和 pending queue。
- 不重写 `chatStore` 的历史加载去重和 streaming flush。
- 不重写 workspace 请求的 latest-request 防陈旧覆盖。
- 不把 session/team/workspace API 从 HTTP/WS 改成 Electron IPC。

## 推荐迁移路径

### 1. 冻结基线

先在现有 Tauri 实现上跑并记录：

```bash
bun run check:policy
bun run check:desktop
bun run check:server
bun run check:coverage
bun run quality:gate --mode baseline --allow-live --provider-model <provider:model[:label]>
```

目的不是证明迁移完成，而是固定“现有能力本来是什么状态”。

### 2. 新增 host adapter，但 Tauri 仍是唯一实现

新建建议路径：

- `desktop/src/lib/desktopHost/types.ts`
- `desktop/src/lib/desktopHost/index.ts`
- `desktop/src/lib/desktopHost/tauriHost.ts`
- `desktop/src/lib/desktopHost/browserHost.ts`
- `desktop/src/lib/desktopHost/__tests__/contract.test.ts`

先把 renderer 中直接 import `@tauri-apps/*` 的位置迁走。完成标准：

```bash
rg "@tauri-apps|invoke\\(|getCurrentWindow" desktop/src
```

生产代码中除 `desktopHost/tauriHost.ts` 外不应再命中。

### 3. 增加 Electron 壳

建议新增：

- `desktop/electron/main.ts`
- `desktop/electron/preload.ts`
- `desktop/electron/services/sidecarManager.ts`
- `desktop/electron/services/updater.ts`
- `desktop/electron/services/notifications.ts`
- `desktop/electron/services/dialogs.ts`
- `desktop/electron/services/windows.ts`
- `desktop/electron/services/preview.ts`
- `desktop/electron/ipc/capabilities.ts`

renderer 通过 preload 暴露的 `window.desktopHost` 调用，不直接使用 Electron API。

### 4. 构建与发布改造

保留 Vite build、sidecar build、质量门禁骨架，替换 Tauri build：

- `check:native` 改名或重定义为 Electron main/preload compile + package config check。
- 新增 `check:electron`。
- `release-desktop.yml` 从 `tauri-action` 迁到 `electron-builder` 的 macOS/Windows/Linux matrix。
- `scripts/release.ts` 从更新 `tauri.conf.json` / `Cargo.toml` 改为更新 Electron package/build config。

### 5. 逐能力迁移和验收

每迁移一个能力都要满足三层证据：

1. contract/unit test 通过；
2. Electron main/preload 实现测试通过；
3. 打包 app smoke 通过。

不要等到全部迁移完才第一次打开 Electron app。

## 安全设计要求

Electron 迁移最大的安全风险不是 Electron 本身，而是从 Tauri 声明式 capability 退化成“renderer 想要什么就 IPC 什么”。必须建立等价能力层：

- renderer 不暴露 Node.js、`ipcRenderer`、`shell`、`dialog`、`child_process`。
- preload 只暴露固定函数，不暴露通用 invoke/send。
- IPC channel 必须枚举，payload 用 schema 校验。
- shell open 只允许 `https:`, `http:`, `mailto:` 和明确需要的本地 path 打开场景。
- child process 只允许 sidecar 和 PTY 服务，参数白名单要保留 Tauri capability 中的约束。
- preview URL 继续只允许 `http/https`。
- 更新安装前必须停止 sidecar，失败后恢复可重试状态。

## 文档索引

- 具体执行任务见：[Electron 迁移任务清单](./08-electron-migration-tasks.md)。
- 当前桌面架构见：[桌面端架构设计](./02-architecture.md)。
- 当前安装构建见：[安装与构建](./04-installation.md)。
- 性能背景见本地文档：`SCROLL_PERF_INVESTIGATION.md`。
