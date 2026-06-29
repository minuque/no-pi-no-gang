# TODO.md

项目：`minuque/no-pi-no-gang`

基于 Pi SDK 做一个 **可观测、透明、可扩展的 Agent Workbench**。

核心判断：

```txt
Pi SDK 负责：
- AgentSession
- Agent loop
- SessionManager / .jsonl
- ModelRegistry
- Tool system
- Extension lifecycle
- compaction
- event streaming

no-pi-no-gang 负责：
- Web Workbench
- Session / Branch / Workspace UI
- Execution observability
- Tool call inspector
- Policy / Approval
- Extension bridge
- Timeline / Replay / Audit
```

不要重复抽象：

```txt
不要做：
- 通用 AgentRuntimeAdapter
- ModelProviderAdapter
- ToolSystemAdapter
- 自己实现 agent loop
- 自己维护另一套 message history
```

应该做：

```txt
Pi SDK
  ↓
Official Extension Hooks
  ↓
Pi Extension Bridge
  ↓
WorkbenchEvent / PolicyEvent
  ↓
Event Buffer / Timeline
  ↓
Web UI
```

当前代码里的隐含分层：

```txt
session-reader.ts
  = .jsonl 只读投影层

rpc-manager.ts
  = AgentSession 生命周期 + command dispatch

normalize.ts
  = Pi message/toolCall 到 UI 字段兼容层

useAgentSession.ts
  = 当前过重的前端状态机，需要拆分
```

建议重构目录：

```txt
lib/pi/
  pi-session-controller.ts
  pi-session-registry.ts
  pi-command-dispatcher.ts
  pi-session-factory.ts
  pi-extension-bridge.ts
  pi-compat.ts

lib/projection/
  pi-session-projector.ts
  pi-context-projector.ts
  pi-event-projector.ts
  pi-message-normalizer.ts

lib/workbench/
  workbench-event.ts
  event-buffer.ts
  timeline-builder.ts
  policy-event.ts

hooks/
  usePiSessionData.ts
  usePiEventStream.ts
  usePiAgentController.ts
  useAgentSession.ts
```

`useAgentSession.ts` 拆分目标：

```txt
usePiSessionData
  - loadSession
  - loadContext
  - branch context

usePiEventStream
  - EventSource
  - reconnect
  - destroyed / readonly
  - lastEventSeq

usePiAgentController
  - send
  - command
  - abort
  - fork
  - compact
  - steer / followUp

useAgentSession
  - 只做组合 facade
```

最关键的新抽象不是 Runtime，而是事件投影：

```ts
type WorkbenchEvent =
  | { type: "run_started"; sessionId: string }
  | { type: "assistant_delta"; message: unknown }
  | { type: "message_completed"; message: unknown }
  | { type: "tool_started"; toolCallId: string; toolName: string; input?: unknown }
  | { type: "tool_updated"; toolCallId: string; update: unknown }
  | { type: "tool_finished"; toolCallId: string; result?: unknown; isError?: boolean }
  | { type: "compaction_started" }
  | { type: "compaction_finished"; errorMessage?: string }
  | { type: "retry_started"; attempt: number; maxAttempts: number; errorMessage?: string }
  | { type: "retry_finished" }
  | { type: "run_finished" }
  | { type: "run_failed"; error: string };
```

服务端事件 envelope：

```ts
interface WorkbenchEventEnvelope {
  seq: number;
  sessionId: string;
  timestamp: string;
  event: WorkbenchEvent;
}
```

事件链路：

```txt
Pi AgentSessionEvent
  ↓
pi-event-projector.ts
  ↓
WorkbenchEventEnvelope
  ↓
event-buffer.ts
  ↓
SSE ?after=seq
  ↓
Timeline / Tool Inspector / Metrics
```

SSE 建议：

```txt
短期：
- 保留当前 /api/agent/[id]/events 自动 ensure session 的行为

后续：
- POST /api/agent/[id]/resume  显式恢复 AgentSession
- GET  /api/agent/[id]/events?after=seq  只订阅已有 live session 并补事件
```

Extension 是干涉 agent loop 的正式入口，不要 fork Pi agent loop。

优先使用这些 hook：

```txt
input
  - Web 专属命令
  - shortcut
  - 非 LLM 操作

before_agent_start
  - 注入 workspace context
  - 注入 policy/capability context
  - 修改 system prompt

context
  - 每轮 LLM 前动态上下文注入
  - memory / RAG / sensitive filtering

tool_call
  - 写操作审批
  - path protection
  - dangerous command block
  - tool input mutation
  - audit start

tool_result
  - 脱敏
  - 摘要
  - 错误归一化
  - audit finish
```

Pi Extension Bridge 目标：

```txt
Pi extension hook
  ↓
policy decision / observability event
  ↓
WorkbenchEvent / PolicyEvent
  ↓
Web approval UI / audit / timeline
```

当前代码中直接改 Pi 内部 state 的逻辑要收口到 `pi-compat.ts`：

```txt
- DeepSeek xhigh thinkingLevel compat
- no-tools mode clear systemPrompt
```

短期最高优先级：

```txt
1. 拆 useAgentSession.ts
2. 抽 pi-event-projector.ts
3. 加 seq + memory ring buffer
4. SSE 支持 after=seq 补事件
5. 做 Timeline / Tool Call Inspector
6. 把 Pi 内部 state hack 收口到 pi-compat.ts
7. 建 pi-extension-bridge.ts，先接 tool_call / tool_result
```