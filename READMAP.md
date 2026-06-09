# READMAP

由远到近理解 pi-web：架构 → 通信 → 数据 → 状态 → UI。

---

## 1. 项目定位

pi-web 是 [pi 编程智能体](https://github.com/badlogic/pi-mono) 的 Web 界面。它本身不实现智能体逻辑——智能体由 `@earendil-works/pi-coding-agent` 提供，pi-web 负责：

- 在浏览器中**展示**本地 `.jsonl` 会话文件
- 通过**进程内 RPC** 驱动 AgentSession，将事件**流式转发**到浏览器
- 提供**会话管理** UI（分叉、分支、压缩等）

```
┌──────────────┐      ┌────────────────────────┐      ┌──────────────────┐
│    浏览器     │      │     Next.js 服务端      │      │   AgentSession   │
│              │      │                        │      │    （进程内）     │
└──────┬───────┘      └───────────┬────────────┘      └────────┬─────────┘
       │                          │                            │
       │  [读取]  GET /sessions   │                            │
       │ ────────────────────────▶│  session-reader            │
       │                          │  parse + normalize         │
       │ ◀────────────────────────│                            │
       │          JSON            │                            │
       │                          │                            │
       │  [发送]  POST /agent     │                            │
       │ ────────────────────────▶│  rpc-manager               │
       │                          │  startRpcSession() ───────▶│  prompt()
       │                          │  session.send(cmd) ───────▶│  fork()
       │                          │                            │  navigate()
       │  [流式]  GET /events     │                            │
       │ ────────────────────────▶│  session.onEvent() ◀───────│  subscribe()
       │ ◀────────────────────────│                            │
       │        SSE stream        │                            │

持久层  ~/.pi/agent/
       ├── sessions/<cwd>/<ts>_<uuid>.jsonl   ← 会话文件（reader 读，AgentSession 读写）
       ├── settings.json                      ← 用户设置 & 默认模型
       └── models.json                        ← 可用模型列表
```

入口文件：
- `bin/pi-web.js` — CLI 入口，spawn Next.js
- `app/layout.tsx` → `app/page.tsx` → `components/AppShell.tsx` — Web 骨架

---

## 2. 数据模型：.jsonl → UI

### 2.1 存储格式

pi 把每个会话存为一个 `.jsonl` 文件，一行一条 entry：

```
~/.pi/agent/sessions/<编码后的工作目录>/<时间戳>_<uuid>.jsonl
```

每条 entry 的结构由 `lib/pi-types.ts` 定义（pi 原生格式）。

### 2.2 类型层次

```
lib/pi-types.ts        pi 原生类型（.jsonl entry 结构）
     │
     ▼
lib/types.ts           前端 UI 类型（Message、ToolCallContent 等）
     │
     ▼
lib/normalize.ts       字段名适配层
```

**关键适配**：pi 存的是 `{type:"toolCall", id, name, arguments}`，UI 组件用的是 `{toolCallId, toolName, input}`。`normalizeToolCalls()` 在数据入口统一转换。

### 2.3 读取链路

```
.jsonl 文件
  → session-reader.ts（纯函数，逐行 parse + normalize → Message[]）
  → API route 返回 JSON
  → ChatWindow 消费 Message[]
```

`session-reader.ts` 是**只读**路径——不创建 AgentSession，不产生副作用。只有「发送消息」才会触发 AgentSession 创建。

---

## 3. RPC 通信层

### 3.1 核心：rpc-manager.ts

```
lib/rpc-manager.ts
  └─ globalThis.__piSessions: Map<sessionId, AgentSessionWrapper>
  └─ globalThis.__piStartLocks: Map<sessionId, Promise>   // 防并发重复创建
```

设计要点：
- 每个会话 ID 一个 `AgentSessionWrapper`，存在 `globalThis` 上——**不能用模块级 Map**，因为 Next.js 热重载会重置模块变量但 `globalThis` 存活。
- 空闲 10 分钟自动销毁。
- 并发 `startRpcSession()` 共享同一个启动 Promise，避免重复创建。

### 3.2 API 路由

```
会话读写
  GET    /api/sessions             列表（按工作目录分组）
  GET    /api/sessions/[id]        单个会话内容
  DELETE /api/sessions/[id]        删除会话
  PATCH  /api/sessions/[id]        更新 parentSession 关联
  POST   /api/sessions/new         创建新会话

Agent 交互
  POST   /api/agent/[id]           发送命令（prompt / fork / interrupt）
  GET    /api/agent/[id]           查询状态（isStreaming / thinkingLevel / isCompacting）
  GET    /api/agent/[id]/events    SSE 事件流
  POST   /api/agent/new           验证工作目录 + 创建新 AgentSession

配置
  GET    /api/models               可用模型列表
  GET    /api/home                 用户主目录
  POST   /api/models-config        编辑 models.json
  GET    /api/files/[...path]      读取工作目录文件
```

### 3.3 SSE 事件流

`api/agent/[id]/events` 维持长连接，AgentSession 通过 `session.subscribe()` 推送事件。前端 `useAgentSession` hook 解析事件并更新消息列表。

---

## 4. 状态管理

### 4.1 useAgentSession（hooks/useAgentSession.ts）

最复杂的 hook，管理 Agent 交互的完整状态机：

```
handleSend()
  → POST /api/agent/[id]
  → 打开 SSE 连接
  → handleAgentEvent() 逐条处理事件
     ├─ assistant_message → 追加/更新流式消息
     ├─ tool_call        → 追加工具调用块
     ├─ tool_result      → 关联到对应 toolCall
     ├─ agent_end        → fire-and-forget loadSession() 全量刷新
     └─ compaction_*     → 同步 isCompacting 状态
```

**关键竞态**：`agent_end` 中 `loadSession()` 是异步的，直接 `setMessages()` 会与下一次 `handleSend` 竞态导致消息丢失。用 `loadGenRef` 版本计数器守卫——gen 不匹配则丢弃结果。

### 4.2 其他 hooks

| Hook | 职责 |
|---|---|
| `useChatScroll` | 自动跟底 vs 手动上滚检测 |
| `useTheme` | 深色/浅色模式 |
| `useAudio` | 消息通知音效 |
| `useDragDrop` | 文件拖拽上传 |

---

## 5. UI 组件

### 5.1 骨架

```
AppShell
├── SessionSidebar         左侧边栏
│   ├── WorkspacePanel     工作区列表
│   ├── WorkspaceTree      文件树
│   └── SessionList        会话列表（含 fork 树）
├── ChatWindow             主聊天区
│   ├── MessageView[]      消息列表（Virtuoso 虚拟滚动）
│   ├── ChatInput          输入框
│   └── ChatMinimap        右侧缩略导航
├── ModelsConfig           模型配置面板
├── SkillsConfig           技能配置面板
└── ToolPanel              工具开关面板
```

### 5.2 ChatWindow（components/ChatWindow.tsx）

最复杂的组件，两个核心问题：

**滚动性能**：`atBottomStateChange` 回调中直接 `setState` 会导致每次像素滚动触发全量重渲染。用 ref 守卫只做 `true↔false` 转换。

**滚动源冲突**：`useEffect` 依赖 streaming 对象（~60fps 变化）导致 effect 高频重建并与用户手动滚动竞争。改用**单一 rAF 循环**（仅依赖 `agentRunning`），每帧从 ref 读取状态。

### 5.3 MessageView（components/MessageView.tsx）

消息渲染入口，按类型分发：
- `UserMessage` → `UserMessageView`（含 Fork 按钮、编辑重发）
- `AssistantMessage` → Markdown 渲染 + ToolCall 折叠组
- `ToolCall` → `ToolCallsGroup`（可折叠工具调用组，支持跨消息合并）

---

## 6. 关键陷阱

1. **Fork 后必须销毁 wrapper** — `fork()` 原地修改 `sessionId`，不销毁会导致下次请求拿到已 fork 的状态
2. **两种分支不同** — Fork（新 `.jsonl` 文件）vs 会话内分支（同一文件 `navigate_tree`）
3. **ToolCall 字段规范化** — 在 `session-reader`（文件加载）和 `handleAgentEvent`（流式传输）**两处**都要调用 `normalizeToolCalls()`
4. **`agent_end` 竞态** — `loadGenRef` 版本计数器，见 §4.1
5. **Virtuoso 滚动** — ref 守卫 + rAF 循环，见 §5.2
6. **`globalThis` 必须** — 不能用模块级变量存 AgentSession，Next.js 热重载会重置
7. **压缩事件双版本** — pi 新版发 `compaction_start/end`，旧版发 `auto_compaction_start/end`，两套都要处理
