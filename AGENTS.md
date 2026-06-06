# Pi Agent Web - 开发笔记

## 快速开始

```bash
npm run dev   # 端口 3030
```

类型检查：`node_modules/.bin/tsc --noEmit`
代码检查：`node node_modules/next/dist/bin/next lint`
**开发期间切勿运行 `next build`**——会污染 `.next/` 目录并导致 `npm run dev` 崩坏。

---

## 架构

```
浏览器                   Next.js 服务端               AgentSession（进程内）
  │                        │                               │
  ├─ GET /api/sessions ────▶ 读取 ~/.pi/agent/sessions/    │
  ├─ GET /api/sessions/[id] 直接读取 .jsonl 文件            │
  │                        │                               │
  ├─ 发送消息 ─────────────▶ POST /api/agent/[id]          │
  │                        │   startRpcSession() ─────────▶│ createAgentSession()
  │                        │   session.send(cmd) ─────────▶│ session.prompt()
  │                        │                               │
  ├─ SSE 连接 ─────────────▶ GET /api/agent/[id]/events    │
  │                        │   session.onEvent() ◀─────────│ session.subscribe()
  │◀── data: {...} ─────────│                               │
```

**浏览会话**（只读）：通过 `lib/session-reader.ts` 直接读取 `.jsonl` 文件——不创建 AgentSession。
**发送消息**：`lib/rpc-manager.ts` 中的 `startRpcSession()` 在进程内创建 AgentSession。

---

## 文件地图

```
app/api/
  sessions/route.ts               GET  列出所有会话
  sessions/[id]/route.ts          GET/PATCH/DELETE 会话
  sessions/[id]/context/route.ts  GET ?leafId= — 获取指定叶子节点的上下文
  sessions/new/route.ts           返回 410（已废弃）
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId? }
  agent/[id]/route.ts             GET 状态 | POST 任意命令
  agent/[id]/events/route.ts      GET SSE 流
  files/[...path]/route.ts        GET 获取文件内容给查看器
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/POST — 读写 ~/.pi/agent/models.json

lib/
  rpc-manager.ts      AgentSessionWrapper + 注册表 + startRpcSession
  session-reader.ts   解析 .jsonl；getModelNameMap/getModelList/getDefaultModel
  types.ts            共享的 TypeScript 类型
  normalize.ts        normalizeToolCalls() — 文件格式与我们的类型之间存在字段名不匹配
  system-prompt-off.ts  所有工具禁用时的最小化系统提示

components/
  AppShell.tsx        布局 + URL 状态 + 标签页管理
  SessionSidebar.tsx  会话树 + FileExplorer
  ChatWindow.tsx      消息 + 流式传输 + SSE + fork/navigate 逻辑
  ChatInput.tsx       输入栏 + 模型/思考/工具/压缩控件
  MessageView.tsx     渲染单条消息（user/assistant/toolCall/toolResult）
  BranchNavigator.tsx 会话内分支切换器
  ChatMinimap.tsx     消息列表旁的滚动缩略图
  ToolPanel.tsx       导出 PRESET_NONE/DEFAULT/FULL + getPresetFromTools
  ModelsConfig.tsx    编辑 models.json 的弹窗（从侧边栏底部打开）
  FileExplorer.tsx    侧边栏内的文件树
  FileViewer.tsx      标签页中的文件内容
  TabBar.tsx          标签栏（Chat + 已打开的文件标签页）
```

---

## 关键设计决策与陷阱

### AgentSession 生命周期（`lib/rpc-manager.ts`）
- 每个会话 ID 一个 `AgentSessionWrapper`，以键值对形式存储在 `globalThis.__piSessions` 中
- `globalThis` 在 Next.js 热重载后依然存活；普通的模块级 Map 则会被重置
- 空闲超时：10 分钟。并发的 `startRpcSession()` 调用共享同一个启动 Promise（`globalThis.__piStartLocks`）

### Fork 后必须立即销毁 wrapper
`AgentSession.fork()` **会原地修改 wrapper 的内部状态**——fork 之后，`inner.sessionId` 变成了*新*会话的 ID。如果 wrapper 仍以旧 ID 保留在注册表中，下一次请求会得到已经 fork 过的状态，后续 fork 会生成损坏的 `parentSession` 链路。

**修复方式**：`send("fork")` 捕获 `newSessionId`，然后在返回之前调用 `this.destroy()`。原始会话的下一次请求会从原始文件中重新加载一个干净的 AgentSession。

### 两种分支 - 不要混淆
- **Fork**（用户消息上的 Fork 按钮）：创建一个新的独立 `.jsonl` 文件。通过 `parentSession` 头字段在侧边栏树中显示为子节点。
- **会话内分支**（Continue 按钮 / BranchNavigator）：在同一个文件内调用 `navigate_tree`。多个条目共享相同的 `parentId`。在它们之间切换调用 `/api/sessions/[id]/context?leafId=`。

### 会话文件可以完全重写
头部的 `parentSession` **仅是显示元数据**——对聊天内容没有任何影响。可以安全地用 `writeFileSync` 覆盖整个文件（pi 在迁移过程中会自行执行此操作）。用于删除时级联重新关联子节点。

### ToolCall 字段规范化
Pi 将 toolCall 块存储为 `{type:"toolCall", id, name, arguments}`，但 `ToolCallContent` 使用的是 `{toolCallId, toolName, input}`。`lib/normalize.ts` 中的 `normalizeToolCalls()` 处理这种差异——在 `session-reader.ts`（文件加载）和 `ChatWindow.handleAgentEvent()`（流式传输）中均会调用。

### 新会话的工具预设
工具名称在会话创建时传入（`POST /api/agent/new` → `toolNames[]`）。对于已有会话，活跃的预设会在挂载时通过 `get_tools` → `getPresetFromTools()` 推断得出。当工具完全禁用时（`toolNames = []`），`rpc-manager.ts` 通过 `system-prompt-off.ts` + `DefaultResourceLoader` 注入一个最小化系统提示。

### 新会话的模型默认值
`GET /api/models` 返回从 `~/.pi/agent/settings.json` 读取的 `defaultModel`。`ChatWindow` 在挂载时会为新会话预选该模型。

### 页面刷新中途 SSE 重连
在 `ChatWindow` 挂载时，调用 `GET /api/agent/[id]`。如果 `state.isStreaming === true`，SSE 会自动重连。`thinkingLevel` 和 `isCompacting` 也从该响应中同步。

### 压缩 SSE 事件
新版 pi 发出 `compaction_start` / `compaction_end`；旧版发出 `auto_compaction_start` / `auto_compaction_end`。`handleAgentEvent` 同时接受这两组事件以保持 `isCompacting` 同步。手动压缩是一个阻塞式 POST——在响应返回之前按钮保持禁用。

### 孤立会话
首行无法解析为有效头部的会话在 API 响应中标记为 `orphaned: true`——在侧边栏中显示"不完整"徽章且不可点击。

---

## Pi 会话文件格式

位置：`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"zenmux","modelId":"claude-sonnet-4-6","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"自定义名称"}
```

`SessionContext` 中的 `entryIds[]` 是与 `messages[]` 平行的数组——将每条显示的消息映射回其 `.jsonl` 条目 ID，用于 fork 和 navigate_tree 调用。

---

## CSS 变量（`app/globals.css`）

```
--bg --bg-panel --bg-hover --bg-selected --border
--text --text-muted --text-dim
--accent --user-bg --tool-bg
--font-mono
```
