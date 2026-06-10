---
title: pi-web 架构路线图
date: 2026-06-10
tags:
  - architecture
  - roadmap
  - pi-web
aliases:
  - ROADMAP
  - 架构文档
---

# ROADMAP

> [!abstract] 阅读路线
> 由远到近理解 pi-web：**架构 → 持久层 → API/通信 → 数据流 → 状态 → UI**。
> 首选深读 §2（四层架构图）和 §5（三条数据流），其余章节按需查阅。

---

## 1. 项目定位

pi-web 是 [pi 编程智能体](https://github.com/badlogic/pi-mono) 的 Web 界面。它本身不实现智能体逻辑——智能体由 `@earendil-works/pi-coding-agent` 提供，pi-web 负责：

- 在浏览器中 ==展示== 本地 `.jsonl` 会话文件
- 通过 ==进程内 RPC== 驱动 AgentSession，将事件 ==流式转发== 到浏览器
- 提供 ==会话管理== UI（分叉、分支、压缩等）

> [!note] 核心约束
> pi-web **不实现智能体逻辑**。所有 AI 能力来自进程内 `AgentSession`，pi-web 只是它的 Web 外壳。

---

## 2. 架构总览

### 2.1 四层架构

```mermaid
flowchart TB
    %% ═══════════════════════════════════════════
    %% 第一层：浏览器 UI
    %% ═══════════════════════════════════════════
    subgraph Browser["🖥 浏览器"]
        direction LR
        page["page.tsx"] --> shell["AppShell.tsx"]
        shell --> sidebar["SessionSidebar<br/>会话列表"]
        shell --> chat["ChatWindow<br/>消息 + 输入"]
        shell --> ws["WorkspacePanel<br/>文件树 + 预览"]
    end

    %% ═══════════════════════════════════════════
    %% 第二层：Next.js 服务端
    %% ═══════════════════════════════════════════
    subgraph Next["⚙️ Next.js 服务端 :7777"]
        direction TB
        subgraph Routes["app/api/"]
            r_sessions["/api/sessions<br/>会话 CRUD"]
            r_agent["/api/agent<br/>命令 + 状态"]
            r_events["/api/agent/[id]/events<br/>SSE 长连接"]
            r_files["/api/files<br/>目录文件读取"]
        end
        subgraph Lib["lib/"]
            reader["session-reader.ts<br/>解析 .jsonl → Message[]"]
            rpc["rpc-manager.ts<br/>AgentSession 生命周期"]
            normalize["normalize.ts<br/>字段适配"]
            types["types.ts + pi-types.ts<br/>类型定义"]
        end
        Routes --> Lib
    end

    %% ═══════════════════════════════════════════
    %% 第三层：AgentSession 进程
    %% ═══════════════════════════════════════════
    subgraph Agent["🤖 AgentSession (进程内)"]
        direction LR
        prompt["prompt()"]
        fork_fn["fork()"]
        navigate["navigate()"]
        subscribe["subscribe()"]
    end

    %% ═══════════════════════════════════════════
    %% 第四层：磁盘持久层
    %% ═══════════════════════════════════════════
    subgraph Disk["💾 ~/.pi/agent/"]
        direction LR
        jsonl["sessions/[cwd]/[ts]_[uuid].jsonl"]
        settings["settings.json"]
        models["models.json"]
    end

    %% ── ① 浏览流（只读） ──
    sidebar -->|"① GET /api/sessions"| r_sessions
    r_sessions --> reader
    reader -->|"listAllSessions()"| jsonl
    reader -->|"buildSessionContext()"| jsonl

    %% ── ② 对话流（写） ──
    chat -->|"② POST /api/agent/new"| r_agent
    r_agent --> rpc
    rpc -->|"startRpcSession()"| prompt
    rpc -->|"send(cmd)"| fork_fn
    rpc -->|"send(cmd)"| navigate

    %% ── ③ 事件流（SSE） ──
    chat -.->|"③ GET /api/agent/[id]/events"| r_events
    r_events -.->|"SSE 长连接"| subscribe
    subscribe -.->|"推送事件"| r_events
    r_events -.->|"EventSource"| chat

    %% ── 文件读取 ──
    ws -->|"GET /api/files"| r_files

    %% ── 持久化 ──
    Agent -->|"读写"| jsonl
    Agent -->|"读"| settings
    Agent -->|"读"| models
```

### 2.2 三条数据流

| 流 | 协议 | 方向 | 核心模块 | 触发者 |
|---|---|---|---|---|
| ① 浏览流 | HTTP GET | 服务端→浏览器 | `session-reader.ts` | `SessionSidebar`, `BranchNavigator` |
| ② 对话流 | HTTP POST | 浏览器→服务端→Agent | `rpc-manager.ts` | `ChatInput` |
| ③ 事件流 | SSE | Agent→服务端→浏览器 | `rpc-manager.ts` + `useAgentSession` | `ChatWindow` |

### 2.3 文件地图

```
pi-web/
├── bin/pi-web.js              CLI 入口，spawn Next.js
├── app/
│   ├── layout.tsx             RootLayout
│   ├── page.tsx               Home → AppShell
│   ├── globals.css            全局样式 + CSS 变量
│   └── api/                   路由处理器
│       ├── sessions/          会话 CRUD
│       ├── agent/             RPC 代理 + SSE
│       ├── files/             文件系统读取
│       ├── models/            模型配置
│       └── skills/            技能列表
├── components/                UI 组件
│   ├── AppShell.tsx           布局骨架
│   ├── ChatWindow.tsx         聊天主区（最复杂）
│   ├── ChatInput.tsx          输入框 + 文件拖拽
│   ├── MessageView.tsx        消息渲染入口
│   ├── SessionSidebar.tsx     左侧会话列表
│   ├── WorkspacePanel.tsx     右侧工作区面板
│   ├── WorkspaceTree.tsx      文件树组件
│   └── ...
├── hooks/
│   ├── useAgentSession.ts     核心状态机（最复杂 hook）
│   ├── useChatScroll.ts       虚拟滚动
│   └── useTheme.ts            主题切换
└── lib/
    ├── session-reader.ts      文件解析器（只读路径核心）
    ├── rpc-manager.ts         AgentSession 生命周期
    ├── types.ts               UI 类型定义
    ├── pi-types.ts            pi 原生类型
    ├── normalize.ts           字段适配
    └── ...
```

---

## 3. 持久层与数据模型

### 3.1 存储格式

pi 把每个会话存为一个 `.jsonl` 文件，一行一条 entry：

```
~/.pi/agent/sessions/<编码后的工作目录>/<时间戳>_<uuid>.jsonl
```

每条 entry 的结构由 `lib/pi-types.ts` 定义（pi 原生格式）。

### 3.2 类型层次

```
lib/pi-types.ts        pi 原生类型（.jsonl entry 结构）
     │
     ▼
lib/types.ts           前端 UI 类型（Message、ToolCallContent 等）
     │
     ▼
lib/normalize.ts       字段名适配层
```

> [!important] 关键适配
> pi 存的是 `{type:"toolCall", id, name, arguments}`，UI 组件用的是 `{toolCallId, toolName, input}`。`normalizeToolCalls()` 在数据入口统一转换。

### 3.3 会话读取器

```mermaid
flowchart LR
    A[".jsonl 文件"] --> B["session-reader.ts<br/>逐行 parse"]
    B --> C["normalizeToolCalls()"]
    C --> D["Message[]"]
    D --> E["API route JSON"]
    E --> F["ChatWindow 消费"]
```

> [!tip] 只读路径
> `session-reader.ts` 不创建 AgentSession，不产生副作用。只有「发送消息」才会触发 AgentSession 创建。

---

## 4. API 与通信层

### 4.1 核心：rpc-manager.ts

```
lib/rpc-manager.ts
  └─ globalThis.__piSessions: Map<sessionId, AgentSessionWrapper>
  └─ globalThis.__piStartLocks: Map<sessionId, Promise>   // 防并发重复创建
```

> [!warning] globalThis 必须
> 不能用模块级 Map 存 AgentSession——Next.js 热重载会重置模块变量但 `globalThis` 存活。
> 每个会话 ID 一个 `AgentSessionWrapper`，空闲 10 分钟自动销毁。
> 并发 `startRpcSession()` 共享同一个启动 Promise，避免重复创建。

### 4.2 API 路由

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

### 4.3 SSE 事件流

`api/agent/[id]/events` 维持长连接，AgentSession 通过 `session.subscribe()` 推送事件。前端 `useAgentSession` hook 解析事件并更新消息列表。

```mermaid
flowchart TD
    %% ── 三层 SSE 管线 ──
    subgraph Browser["🖥 浏览器"]
        ES["EventSource"]
        H["handleAgentEvent()"]
        R["streamReducer()"]
    end
    subgraph Server["⚙️ Next.js 服务端"]
        API["/api/agent/[id]/events"]
        S["session.subscribe()"]
    end
    subgraph Agent["🤖 AgentSession"]
        P["prompt()"]
    end

    %% 连接建立
    ES -->|"SSE 连接"| API
    API --> S
    %% 事件推送
    P -->|"推送事件"| S
    S -->|"event"| API
    API -->|"SSE message"| ES
    %% 前端消费
    ES -->|"parse"| H
    H -->|"dispatch"| R
    R -->|"setMessages"| UI["MessageView 渲染"]
```

---

## 5. 数据流全景

pi-web 有三条独立的数据流路径，交汇于 `.jsonl` 文件和 `session-reader.ts`。

### 5.1 浏览流（只读）

```mermaid
flowchart LR
    %% 会话列表
    A["SessionSidebar"] -->|"GET /api/sessions"| B["listAllSessions()"]
    B -->|"扫描"| C["~/.pi/agent/sessions/*.jsonl"]
    C --> D["返回 SessionTreeNode[]"]

    %% 上下文加载
    E["BranchNavigator"] -->|"GET /api/sessions/[id]/context"| F["buildSessionContext()"]
    F -->|"读取"| C
    F --> G["返回压缩上下文 JSON"]
```

> [!tip] 纯文件读取
> ==不创建 AgentSession==，`session-reader.ts` 是这条路径的核心。

### 5.2 对话流（写 + 流式）

```mermaid
flowchart TD
    %% 发送路径
    A["ChatInput"] --> B["ChatWindow"]
    B --> C["useAgentSession.handleSend()"]
    C -->|"POST /api/agent/new"| D["startRpcSession()"]
    D --> E["AgentSessionWrapper"]
    E --> F["AgentSession.prompt()"]

    %% SSE 接收路径（并行）
    C -->|"connectEvents()"| G["GET /api/agent/[id]/events"]
    G -->|"SSE"| H["handleAgentEvent()"]
    H -->|"dispatch"| I["streamReducer()"]
    I -->|"setMessages"| J["MessageView"]
```

**rpc-manager.ts** 管理进程内 AgentSession 生命周期。前端 `useAgentSession` hook 解析 SSE 事件并逐条更新消息列表。

### 5.3 导航流（分支）

```mermaid
flowchart LR
    subgraph Fork["Fork — 新文件"]
        A["BranchNavigator"] -->|"POST /api/agent/[id]"| B["getRpcSession()"]
        B --> C["AgentSession.fork()"]
        C --> D["新 .jsonl 文件"]
        D --> E["更新 SessionTreeNode 树"]
    end

    subgraph Nav["会话内导航 — 同一文件 navigate_tree"]
        F["BranchNavigator"] -->|"PATCH /api/sessions/[id]"| G["resolveSessionPath()"]
        G --> H["AgentSession.navigate()"]
    end
```

> [!info] 两种分支
> Fork 创建 ==新 `.jsonl` 文件==，会话内导航在同一文件内跳转（`navigate_tree`）。详见 §8.2。

---

## 6. 状态管理

### 6.1 useAgentSession（hooks/useAgentSession.ts）

最复杂的 hook，管理 Agent 交互的完整状态机：

```mermaid
flowchart TD
    SEND["handleSend()"] --> POST["POST /api/agent/[id]"]
    POST --> SSE["打开 SSE 连接"]
    SSE --> EVT["handleAgentEvent() 逐条处理"]

    %% 五种事件类型，五种状态分支
    EVT --> AM["assistant_message<br/>→ 追加/更新流式消息"]
    EVT --> TC["tool_call<br/>→ 追加工具调用块"]
    EVT --> TR["tool_result<br/>→ 关联到对应 toolCall"]
    EVT --> AE["agent_end<br/>→ fire-and-forget loadSession()"]
    EVT --> CP["compaction_*<br/>→ 同步 isCompacting 状态"]
```

> [!warning] 关键竞态
> `agent_end` 中 `loadSession()` 是异步的，直接 `setMessages()` 会与下一次 `handleSend` 竞态导致消息丢失。用 ==`loadGenRef` 版本计数器==守卫——gen 不匹配则丢弃结果。

### 6.2 其他 hooks

| Hook | 职责 |
|---|---|
| `useChatScroll` | 自动跟底 vs 手动上滚检测 |
| `useTheme` | 深色/浅色模式 |
| `useAudio` | 消息通知音效 |
| `useDragDrop` | 文件拖拽上传 |

---

## 7. UI 组件

### 7.1 骨架

```
AppShell
├── SessionSidebar         左侧边栏
│   ├── WorkspacePanel     工作区面板
│   │   └── WorkspaceTree  文件树（cwd 确定即挂载，不等面板打开）
│   └── SessionList        会话列表（含 fork 树）
├── ChatWindow             主聊天区
│   ├── MessageView[]      消息列表（Virtuoso 虚拟滚动）
│   ├── ChatInput          输入框
│   └── ChatMinimap        右侧缩略导航
├── ModelsConfig           模型配置面板
├── SkillsConfig           技能配置面板
└── ToolPanel              工具开关面板
```

### 7.2 ChatWindow（components/ChatWindow.tsx）

最复杂的组件，两个核心问题：

> [!bug] 滚动性能
> `atBottomStateChange` 回调中直接 `setState` 会导致每次像素滚动触发全量重渲染。用 ref 守卫只做 `true↔false` 转换。

> [!tip] 滚动源冲突
> `useEffect` 依赖 streaming 对象（~60fps 变化）导致 effect 高频重建并与用户手动滚动竞争。改用 ==单一 rAF 循环==（仅依赖 `agentRunning`），每帧从 ref 读取状态。

### 7.3 组件挂载时序

```mermaid
sequenceDiagram
    participant U as 用户
    participant AS as AppShell
    participant SS as SessionSidebar
    participant WP as WorkspacePanel
    participant WT as WorkspaceTree
    participant API as /api/files

    U->>SS: 点击会话
    SS->>AS: handleSelectSession(session)
    AS->>AS: setSelectedSession(session)
    Note over AS: cwd = session.cwd 可用
    AS->>WP: cwd 传入（不等 open）
    WP->>WT: 挂载 WorkspaceTree
    WT->>API: fetchEntries(cwd)
    API-->>WT: 文件列表 JSON
    Note over WT: 数据就绪，等待用户打开面板
    U->>AS: 点击打开右侧面板
    AS->>WP: open=true
    Note over WP: 文件树已渲染，即刻可见
```

### 7.4 MessageView（components/MessageView.tsx）

消息渲染入口，按类型分发：
- `UserMessage` → `UserMessageView`（含 Fork 按钮、编辑重发）
- `AssistantMessage` → Markdown 渲染 + ToolCall 折叠组
- `ToolCall` → `ToolCallsGroup`（可折叠工具调用组，支持跨消息合并）

---

## 8. 关键陷阱

> [!danger] 1. Fork 后必须销毁 wrapper
> `fork()` 原地修改 `sessionId`，不销毁会导致下次请求拿到已 fork 的状态。

> [!warning] 2. 两种分支不同
> Fork（==新 `.jsonl` 文件==）vs 会话内分支（==同一文件 `navigate_tree`==），见 §5.3。

> [!important] 3. ToolCall 字段规范化 — 两处都要调用
> 在 `session-reader`（文件加载）和 `handleAgentEvent`（流式传输）==两处==都要调用 `normalizeToolCalls()`。

> [!warning] 4. `agent_end` 竞态
> `loadGenRef` 版本计数器，见 §6.1。

> [!bug] 5. Virtuoso 滚动
> ref 守卫 + rAF 循环，见 §7.2。

> [!warning] 6. `globalThis` 必须
> 不能用模块级变量存 AgentSession，Next.js 热重载会重置，见 §4.1。

> [!info] 7. 压缩事件双版本
> pi 新版发 `compaction_start/end`，旧版发 `auto_compaction_start/end`，两套都要处理。
