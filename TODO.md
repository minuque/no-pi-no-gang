# TODO.md

> 架构重构执行手册 —— 按 case 顺序执行，每个 case 独立 commit，commit msg 加 `[arch-refactor]` 前缀。

所有提取出的新文件，项目内部 import 路径以重命名后为准，旧文件同步删除。

---

## 准备工作

### Case 0：项目根目录创建 module 目录

```bash
# 新增目录
mkdir -p hooks              # 已有则跳过
mkdir -p components/chat-input
mkdir -p lib/events
```

**验收：** `ls` 确认目录存在。

---

## Case 1：rpc-manager → session-bridge 改名 + session-pool 壳

### 1a：rpc-manager.ts → session-bridge.ts

**怎么做：**
1. `git mv lib/rpc-manager.ts lib/session-bridge.ts`
2. 全文搜索 `from "@/lib/rpc-manager"` 或 `from "../lib/rpc-manager"` 改为 `from "@/lib/session-bridge"` 或对应相对路径
3. 搜索位置：`app/api/agent/[id]/route.ts`、`app/api/agent/[id]/events/route.ts`、`app/api/agent/new/route.ts`、`app/api/sessions/[id]/route.ts`

**新增测试：**
- 创建 `tests/session-bridge.test.ts`
- 测试 `AgentSessionWrapper` 构造函数：`wrapper.inner` 为传入的 session
- 测试 `isAlive()` 初始状态、`destroy()` 后为 false
- 测试 `getSnapshotState()` 返回字段完整性
- 测试 `onEvent` 订阅/取消订阅
- 测试 `send` 命令分发（mock piCommandHandlers）

**验收：**
```bash
pnpm test
pnpm typecheck
```

**Commit：**
```
git commit -m "[arch-refactor] rename rpc-manager.ts -> session-bridge.ts" -m "纯改名 + import 路径更新。行为零变更。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### 1b：新增 lib/session-pool.ts（shell）

**怎么做：**
```typescript
// lib/session-pool.ts
// 将 globalThis.__piSessions 的 Map 操作封装为有类型 API

// 当前只做 CRUD 壳，不做生命周期管理——生命周期仍在 session-bridge.ts 的 Handler 里

import type { AgentSessionWrapper } from "./session-bridge";

export class SessionPool {
  private registry = getRegistry(); // 复用 session-bridge 里的 registry

  start(sessionId: string, cwd: string, ...): Promise<AgentSessionWrapper> { ... }
  get(sessionId: string): AgentSessionWrapper | undefined { ... }
  destroy(sessionId: string): void { ... }
  exists(sessionId: string): boolean { ... }
  list(): AgentSessionWrapper[] { ... }
}
```

具体要求：
- 不修改 `session-bridge.ts` 的 `getRegistry()/getLocks()` 函数签名
- `AgentSessionWrapper` 类保持不动
- `start()` 直接调用 `startRpcSession()`（从 session-bridge.ts import）
- 其他 CRUD 方法包装 registry Map

**新增测试：** `tests/session-pool.test.ts`
- `get()` 返回 `undefined` 当 session 不存在
- `exists()` 返回 false 当未销毁
- `list()` 返回当前注册的所有 session

**验收：**
```bash
pnpm test
pnpm typecheck
```

**Commit：**
```
git commit -m "[arch-refactor] add session-pool.ts shell" -m "封装 globalThis registry CRUD 为有类型 API。只抽壳，不移入生命周期。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 2：事件类型系统

### 2a：新建 lib/events/event-types.ts

**怎么做：**
1. 定义全量 discriminated union：

```typescript
// lib/events/event-types.ts
// === Pi SDK 原始事件（由 Pi SDK AgentSession 发出）===
export type SdkEvent =
  | { type: "agent_start"; timestamp?: string }
  | { type: "agent_end"; timestamp?: string }
  | { type: "message_start"; message: Partial<AgentMessage> }
  | { type: "message_update"; message: Partial<AgentMessage> }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | { type: "tool_execution_end"; toolCallId: string; isError?: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; errorMessage?: string }
  | { type: "auto_retry_end" }
  | { type: "auto_compaction_start" }
  | { type: "auto_compaction_end"; aborted?: boolean; errorMessage?: string }
  | { type: "compaction_start" }
  | { type: "compaction_end"; aborted?: boolean; errorMessage?: string };

// === 投影层事件（由 ProjectionLayer 产出）===
export type ViewEvent =
  | { type: "view:permission_prompt"; requestId: string; surface: string; value: string; message: string; agentName?: string | null }
  | { type: "view:permission_decision"; requestId: string; approved: boolean; denialReason?: string }
  | { type: "view:turn_completed"; turnIndex: number; durationMs: number; tokenCount: number; spans: TraceSpan[] }
  | { type: "view:connection_status"; status: AgentEventStatus; sessionId: string };

// === Trace Span 类型 ===
export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  type: "turn" | "thinking" | "text" | "tool_call" | "tool_result";
  name: string;
  startTime: number;  // epoch ms
  endTime: number | null; // null = still running
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  durationMs?: number;
}

// === 联合类型 ===
export type AgentEvent = SdkEvent | ViewEvent;
```

2. 导入到的文件：
   - `lib/agent-event-reducer.ts` — 将 `AgentEvent` 接口替换为 import（依赖向下兼容，当前代码用 `{ type: string; [key: string]: unknown }` 也匹配）
   - `hooks/useAgentSession.ts` — 替换 `interface AgentEvent { ... }` 本地定义
   - `lib/session-bridge.ts` — 替换本地 `interface AgentEvent`

**新增测试：** `tests/event-types.test.ts`
- 每个 SdkEvent 类型创建对象，确认 `type` 字段正确
- 每个 ViewEvent 类型创建对象，确认 `type` 字段正确
- `AgentEvent` 是可辨识联合，switch 能收窄类型

**验收：**
```bash
pnpm test
pnpm typecheck     # 确保引入后原有代码类型推断一致
```

**Commit：**
```
git commit -m "[arch-refactor] add typed event system (SdkEvent + ViewEvent + TraceSpan)" -m "lib/events/event-types.ts 一处定义，全量类型化替代 event.xxx as string。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 3：Hook 拆分 — useTransport

### 3a：新建 hooks/useTransport.ts

**怎么做：**
从 `useAgentSession` 中提取以下逻辑：
- `eventSourceRef` 管理
- `connectEvents(sid)` — SSE onopen/onmessage/onerror
- `loadSession(sid, showLoading?, includeState?)` — HTTP GET `/api/sessions/[id]`
- `loadContext(sid, leafId)` — HTTP GET `/api/sessions/[id]/context`
- 状态：`eventStatus`、`loading`、`error`、`sessionExists`、`sessionDestroyed`

**不应放在此 hook 的：**
- messages 管理
- agent 状态（running/streaming/compacting）
- agentEventReducer

**接口设计：**

```typescript
// hooks/useTransport.ts
export function useTransport(sessionId: string | null): {
  // 状态
  loading: boolean;
  error: string | null;
  loadingError: string | null;
  eventStatus: AgentEventStatus;
  sessionExists: boolean;
  sessionDestroyed: boolean;
  agentLastUpdated: string | null;
  
  // 方法
  connectEvents: () => void;
  disconnectEvents: () => void;
  loadSession: (showLoading?: boolean, includeState?: boolean) => Promise<{ sessionData: SessionData; agentState?: ... } | null>;
  loadContext: (leafId: string | null) => Promise<void>;
  sendAgentCommand: <T>(command: Record<string, unknown>) => Promise<T>;
  
  // 事件回调注册（由 useAgentState 消费）
  onEventRef: React.MutableRefObject<((event: AgentEvent) => void) | null>;
}
```

**新增测试：** 非 UI 逻辑可测试部分：
- `tests/hooks/useTransport.test.ts`
  - `sendAgentCommand` 在 `sessionId` 为 null 时抛错
  - 状态正确性纯函数测试（无网络 mock 时跳过有网络的部分）

**验收：**
```bash
pnpm test
pnpm typecheck
```

### 3b：更新 useAgentSession import

**怎么做：**
1. 删掉 `useAgentSession` 中已提取的代码
2. 改为调用 `useTransport`
3. `eventSourceRef` 不再在 `useAgentSession` 中声明，由 `useTransport` 管理
4. 暴露 `onEventRef` 让 `useAgentState` 注册 handler

### 3c：更新 ChatWindow

**怎么做：**
`ChatWindow` 不再透传 `eventSourceRef` 等 transport 细节

**Commit：**
```
git commit -m "[arch-refactor] extract useTransport hook" -m "SSE/HTTP 通信从 useAgentSession 拆出。覆盖 connectEvents/loadSession/loadContext/sendAgentCommand。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 4：Hook 拆分 — useAgentState

### 4a：新建 hooks/useAgentState.ts

**怎么做：**
从 `useAgentSession` 提取：
- `agentEventReducer` 引用 + `applyAgentEventState`
- `agentEventStateRef` 管理
- `streamReducer`（`StreamingState`）
- `messages`/`agentRunning`/`agentStateRunning`/`agentStateStreaming`/`agentStateCompacting`/`agentPhase`/`eventStatus`/`retryInfo`/`isCompacting`/`compactError`
- `settersRef` 逻辑
- `mergeToolCallMessages` 调用
- `deriveContextUsage` 计算

**接口设计：**

```typescript
export function useAgentState(): {
  // 响应式状态
  messages: AgentMessage[];
  agentRunning: boolean;
  agentPhase: AgentPhase;
  retryInfo: ...;
  isCompacting: boolean;
  compactError: string | null;
  streamState: StreamingState;
  contextUsage: ContextUsageState | null;
  sessionStats: { tokens: {...}; cost?: number } | null;
  
  // 状态设置方法
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>;
  setIsCompacting: React.Dispatch<React.SetStateAction<boolean>>;
  setCompactError: React.Dispatch<React.SetStateAction<string | null>>;
  setContextUsage: React.Dispatch<React.SetStateAction<ContextUsageState | null>>;
  dispatch: React.Dispatch<StreamAction>;
  
  // 事件处理
  handleAgentEventRef: React.MutableRefObject<((event: AgentEvent) => void) | null>;
  
  // Reducer+Ref（供 useSessionActions 组合时需要同步写）
  agentEventStateRef: React.MutableRefObject<AgentEventState>;
  applyAgentEventState: (next: AgentEventState | ((prev: AgentEventState) => AgentEventState)) => void;
}
```

**新增测试：** 
- `tests/hooks/useAgentState.test.ts`
  - `sessionStats` 在空消息时返回 null
  - `sessionStats` 在 assistant 消息有 usage 时正确累加
  - `deriveContextUsage` 纯函数逻辑

**验收：**
```bash
pnpm test
pnpm typecheck
```

**Commit：**
```
git commit -m "[arch-refactor] extract useAgentState hook" -m "状态管理 + reducer 从 useAgentSession 拆出。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 5：Hook 拆分 — useSessionCreator

### 5a：新建 hooks/useSessionCreator.ts

**怎么做：**
从 `useAgentSession` 提取"创建新 session"逻辑：
- `handleSend` 中的 `isNew && newSessionCwd` 分支
- `handleCommand` 中的对应分支
- `POST /api/agent/new` fetch 逻辑
- `toolNames` 拼装（`PRESET_NONE/PRESET_DEFAULT/PRESET_FULL` 动态 import）
- `thinkingLevel`/`model` 选择

**接口设计：**

```typescript
export function useSessionCreator(): {
  createSession: (params: {
    cwd: string;
    message: string;
    toolPreset: "none" | "default" | "full";
    thinkingLevel: string;
    model?: { provider: string; modelId: string } | null;
    images?: AttachedImage[];
    commandName?: string;  // 如果是斜杠命令
  }) => Promise<{ sessionId: string }>;
  
  creating: boolean;
  error: string | null;
}
```

**新增测试：**
- `tests/hooks/useSessionCreator.test.ts`
  - 请求体组装验证（模拟 POST /api/agent/new，验证 body JSON 字段完整性）
  - `commandName` 存在时 `type: "command"` 否则 `type: "prompt"`

**验收：**
```bash
pnpm test
pnpm typecheck
```

**Commit：**
```
git commit -m "[arch-refactor] extract useSessionCreator hook" -m "新建 session 逻辑从 useAgentSession 拆出。覆盖 POST /api/agent/new 调用。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 6：Hook 拆分 — useModelList

### 6a：新建 hooks/useModelList.ts

**怎么做：**
从 `useAgentSession` 提取：
- `GET /api/models` fetch
- `modelNames`/`modelList`/`modelThinkingLevels`/`modelThinkingLevelMaps` 状态
- `newSessionModel` 选择逻辑

**接口设计：**

```typescript
export function useModelList(opts?: {
  isNew?: boolean;
  onDefaultModel?: (model: { provider: string; modelId: string }) => void;
  refreshKey?: number;
}): {
  modelNames: Record<string, string>;
  modelList: Array<{ id: string; name: string; provider: string; contextWindow?: number }>;
  modelThinkingLevels: Record<string, string[]>;
  modelThinkingLevelMaps: Record<string, Record<string, string | null>>;
  newSessionModel: { provider: string; modelId: string } | null;
  setNewSessionModel: (model: { provider: string; modelId: string } | null) => void;
}
```

**新增测试：**
- `tests/hooks/useModelList.test.ts`
  - `isNew && modelList.length > 0` 时自动选择 defaultModel
  - 数据格式转换验证

**验收：**
```bash
pnpm test
pnpm typecheck
```

**Commit：**
```
git commit -m "[arch-refactor] extract useModelList hook" -m "模型列表加载逻辑从 useAgentSession 拆出。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 7：Hook 拆分 — useSessionActions

### 7a：新建 hooks/useSessionActions.ts

**怎么做：**
从 `useAgentSession` 提取：
- 所有 `handle*` 方法（send/command/abort/fork/navigate/leafChange/modelChange/compact/steer/followUp/abortCompaction/thinkingLevelChange/toolPresetChange/fetchCommands）
- 这些方法编排 `transport` + `creator` + `agentState`

**接口设计：**

```typescript
export function useSessionActions(actions: {
  transport: ReturnType<typeof useTransport>;
  creator: ReturnType<typeof useSessionCreator>;
  agentState: ReturnType<typeof useAgentState>;
  modelList: ReturnType<typeof useModelList>;
  session: SessionInfo | null;
  isNew: boolean;
  newSessionCwd: string | null;
  newSessionModel: ...;
  toolPreset: ...;
  thinkingLevel: ...;
  commands: SlashCommandItem[];
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  onAgentEnd?: () => void;
}): {
  handleSend: (message: string, images?: AttachedImage[]) => Promise<void>;
  handleCommand: (commandName: string, message: string, images?: AttachedImage[]) => Promise<void>;
  handleAbort: () => Promise<void>;
  handleFork: (entryId: string) => Promise<void>;
  handleNavigate: (entryId: string) => Promise<void>;
  handleLeafChange: (leafId: string | null) => Promise<void>;
  handleModelChange: (provider: string, modelId: string) => Promise<void>;
  handleCompact: () => Promise<void>;
  handleSteer: (message: string, images?: AttachedImage[]) => Promise<void>;
  handleFollowUp: (message: string, images?: AttachedImage[]) => Promise<void>;
  handleAbortCompaction: () => Promise<void>;
  handleThinkingLevelChange: (level: ThinkingLevelOption) => Promise<void>;
  handleToolPresetChange: (preset: "none" | "default" | "full") => Promise<void>;
  fetchCommands: (cwd: string) => Promise<void>;
  commands: SlashCommandItem[];
  forkingEntryId: string | null;
  agentLastUpdated: string | null;
}
```

注意：
- `handleSend` 内部判断 `isNew ? creator.createSession(...) : transport.sendAgentCommand(...)`
- `handleCommand` 内部判断同上
- `handleAgentEventRef` 的注册在 transport 的 `onEventRef` 和 agentState 的 `handleAgentEventRef` 之间连接

**新增测试：**
- `tests/hooks/useSessionActions.test.ts`
  - `handleSend` 在 session 为空时调用 `creator.createSession`
  - `handleSend` 在 session 存在时调用 `transport.sendAgentCommand`
  - `handleAbort` 时调用 `transport.sendAgentCommand({ type: "abort" })`
  - 斜杠命令匹配时走 `handleCommand` 分支

**验收：**
```bash
pnpm test
pnpm typecheck
```

**Commit：**
```
git commit -m "[arch-refactor] extract useSessionActions hook" -m "所有 handle* 方法从 useAgentSession 拆出。编排 transport/creator/agentState 三个子 hook。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 8：useAgentSession 组合入口

### 8a：重写 hooks/useAgentSession.ts

**怎么做：**
将 1328 行压缩为组合入口：

```typescript
export function useAgentSession(opts: UseAgentSessionOptions) {
  const { session, newSessionCwd, ... } = opts;
  const isNew = session === null && newSessionCwd !== null;
  
  const creator = useSessionCreator();
  const transport = useTransport(session?.id ?? null);
  const agentState = useAgentState();
  const modelList = useModelList({ isNew, ... });
  
  const actions = useSessionActions({
    transport, creator, agentState, modelList,
    session, isNew, newSessionCwd,
    ...
  });
  
  // 连接 transport 事件到 agentState
  transport.onEventRef.current = agentState.handleAgentEventRef.current;
  
  // effects: load session on mount
  useEffect(() => { ... }, [session]);
  
  return {
    data, loading, error, messages, streamState,
    ...transport, ...agentState, ...actions, ...modelList,
  };
}
```

**预期行数：** ~100 行（不含 import）

**验收：**
```bash
pnpm test
pnpm typecheck
pnpm lint
# 手动测试：新 session、已有 session、fork、branch、切换 session、SSE 连接
```

**Commit：**
```
git commit -m "[arch-refactor] rewrite useAgentSession as composition entry" -m "从 1328 行简化为 ~100 行组合入口。行为覆盖测试通过。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 9：ChatInput 拆分为子组件

### 9a：新建 components/chat-input/ChatInputArea.tsx

**怎么做：**
从 `ChatInput.tsx` 提取：
- 文本输入区（textarea/div）
- 图片粘贴/拖拽/预览
- 占位符文本
- Enter/Ctrl+Enter 处理

```typescript
interface ChatInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  images: AttachedImage[];
  onRemoveImage: (index: number) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**验收：** 类型检查通过，手动测试图片粘贴

### 9b：新建 components/chat-input/CommandPalette.tsx

**怎么做：**
从 `ChatInput.tsx` 提取：
- 敲 `/` 触发补全 dropdown
- 命令列表过滤（`SlashCommandItem[]`）
- 方向键导航 + Enter 选中
- 命令来源标签（EXT/PROMPT/SKILL）

**新增测试：** `tests/components/CommandPalette.test.ts`
- `/` 后在空命令时显示所有命令
- 输入 `/sk` 过滤到匹配命令
- 点击命令项触发回调

### 9c：新建 components/chat-input/InputToolbar.tsx

**怎么做：**
从 `ChatInput.tsx` 提取：
- Model 选择器
- Thinking Level 选择器
- Tool Preset 选择器
- CWD 选择器/切换
- 换行/发送切换按钮

### 9d：新建 components/chat-input/InputStatusBar.tsx

**怎么做：**
从 `ChatInput.tsx` 提取：
- Agent 状态指示（retry badge）
- Context usage 指示
- Agent phase 文本

### 9e：重写 components/chat-input/ChatInput.tsx

**怎么做：**
将原 2056 行压缩为组合骨架：

```typescript
export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(props) {
  return (
    <div className="chat-input-container">
      <CommandPalette ... />
      <ChatInputArea ... />
      <InputToolbar ... />
      <InputStatusBar ... />
    </div>
  );
});
```

**预期行数：** ~100 行

### 9f：删除旧文件

`git rm components/ChatInput.tsx`，改为 `components/chat-input/ChatInput.tsx`。

**更新所有 import：**
- `ChatWindow.tsx` 中的 `@/components/ChatInput` → `@/components/chat-input`
- `AppShell.tsx` 类似的引用

**新增测试：** `tests/components/ChatInput.test.ts`
- 组件渲染不报错
- 子组件 prop 透传正确（通过 mock child component 验证）

**验收：**
```bash
pnpm test
pnpm typecheck
pnpm lint
# 手动测试：输入/发送/图片/命令补全/工具栏全部交互
```

**Commit：**
```
git commit -m "[arch-refactor] split ChatInput into 4 sub-components" -m "ChatInputArea + CommandPalette + InputToolbar + InputStatusBar from 2056 lines to ~700 total." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 10：拖拽 Hook + AppShell 清理

### 10a：新建 hooks/useResizablePanel.ts

**怎么做：**
从 `AppShell.tsx` 提取两套拖拽逻辑，合并为一个 hook：

```typescript
export function useResizablePanel(options: {
  minWidth: number;
  maxWidth: (viewportWidth: number, reservedLeft: number, reservedRight: number) => number;
  storageKey: string;
  defaultWidth?: number;
  edgeHandleInset?: number;
}): {
  panelRef: React.RefObject<HTMLDivElement>;
  handleRef: React.RefObject<HTMLDivElement>;
  width: number;
  onPointerDown: (e: React.PointerEvent) => void;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}
```

- drag state 管理（`dragStateRef`）
- PointerEvent 处理（start/move/end）
- localStorage 持久化
- CSS transition 临时禁用/恢复

**新增测试：** `tests/hooks/useResizablePanel.test.ts`
- 初始 width 等于 defaultWidth
- `setOpen(false)` → `isOpen === false`
- localStorage 读写逻辑（mock Storage）

### 10b：AppShell 清理

**怎么做：**
1. 删掉内联的 `handleDragStart/Move/End`、`handleRightDragStart/Move/End`
2. 删掉 `dragState`、`rightDragState` 两个 ref
3. 删掉 `sidebarWidth`/`rightPanelWidth` 的 `useEffect` + localStorage 持久化
4. 替换为两处 `useResizablePanel` 调用

**预期效果：** AppShell 从 987 行降到 ~800 行

**验收：**
```bash
pnpm typecheck
# 手动测试：左/右侧栏拖拽调节宽度、刷新后宽度保持
```

**Commit：**
```
git commit -m "[arch-refactor] extract useResizablePanel hook, clean AppShell" -m "两套内联拖拽逻辑统一为 hook。AppShell 从 987 降至 ~800 行。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 11：类型系统中的 as string 消灭

### 11a：修复 reducer 中的 as 转换

**怎么做：**
`lib/agent-event-reducer.ts` 中所有 `event.xxx as string` / `event.xxx as number` 替换为类型守卫：

```typescript
// 改前
const id = event.toolCallId as string;
const name = event.toolName as string;

// 改后
const id = "toolCallId" in event ? String(event.toolCallId) : "";
const name = "toolName" in event ? String(event.toolName) : "";
```

搜索 `event.` 后的 `as` 类型断言，预估 10-15 处。

### 11b：修复 useSessionActions 中的 as 转换

**怎么做：**
`handleSend`/`handleCommand` 中 `dispatch({ type: "start" })` 等处的类型需要更新为 `StreamAction` 联合类型。把 `streamReducer` 定义的 `StreamAction` 类型移到 `lib/events/event-types.ts` 共享。

**新增测试：** 无需新增，现有 reducer 测试覆盖类型断言路径
- 跑 `pnpm typecheck` 确认零 `as` 类型警告

**验收：**
```bash
pnpm typecheck --noEmit  # 必须零 error
pnpm test
```

**Commit：**
```
git commit -m "[arch-refactor] remove unsafe type assertions in event handling" -m "统一使用事件类型系统，消灭 event.xxx as string 模式。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Case 12：补充缺失的单元测试

### 12a：normalize.ts 测试

**新增测试：** `tests/normalize.test.ts`
- `normalizeToolCalls` 转换 SSE-format toolCall（`id`/`name`/`arguments` → `toolCallId`/`toolName`/`input`）
- `normalizeToolCalls` 保留已标准化的 toolCall
- `normalizeToolCalls` 不影响非 toolCall block
- `normalizeToolCalls` 在 content 为空数组时返回原消息

### 12b：session-bridge.ts 测试（见 Case 1a）

### 12c：session-pool.ts 测试（见 Case 1b）

### 12d：event-types.ts 测试（见 Case 2a）

### 12e：hooks 测试（见 Cases 3-7）

### 验收（全量）

```bash
pnpm test           # 全部通过
pnpm typecheck      # 零 error
pnpm lint           # 零 error + warning
```

**Commit（放在最后）：**
```
git commit -m "[arch-refactor] add missing unit tests" -m "normalize + session-bridge + session-pool + event-types + hooks coverage。" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 执行顺序总结

| 序号 | Case | 文件 | 预估工时 |
|------|------|------|---------|
| 0 | 建目录 | - | 1min |
| 1a | session-bridge 改名 + import 更新 | 5 个文件 | 15min |
| 1b | session-pool shell | 2 个文件 | 20min |
| 2a | 事件类型系统 | 3 个文件 | 30min |
| 3a | useTransport hook | 3 个文件 | 45min |
| 4a | useAgentState hook | 3 个文件 | 45min |
| 5a | useSessionCreator hook | 2 个文件 | 30min |
| 6a | useModelList hook | 2 个文件 | 20min |
| 7a | useSessionActions hook | 2 个文件 | 45min |
| 8a | useAgentSession 组合 | 1 个文件 | 20min |
| 9a-9f | ChatInput 拆分 | 9 个文件 | 60min |
| 10a-10b | useResizablePanel + AppShell | 3 个文件 | 30min |
| 11a-11b | as string 消灭 | 3 个文件 | 20min |
| 12a-12e | 补充测试 | 10 个文件 | 30min |

> **总预估：** ~6-7 小时纯编码时间。按每 case 一 commit，共约 14 个 commits。
> 每个 case 完成必须 `pnpm test && pnpm typecheck && pnpm lint` 通过再 commit。
> 全部完成后跑一次 `pnpm build` 做生产构建验证。
