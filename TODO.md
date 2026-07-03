# TODO.md

> 已完成变更记录在 [`CHANGELOG.md`](./CHANGELOG.md)。

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

建议重构目录（目标结构，不必首次全部建，按阶段增量引入）：

```txt
lib/pi/
  pi-session-controller.ts    // Phase 3: AgentSession 治理包装
  pi-session-registry.ts      // Phase 3: 全局 registry（从 rpc-manager.ts 抽出）
  pi-command-dispatcher.ts    // Phase 3: 命令路由（从 rpc-manager.ts 抽出）
  pi-session-factory.ts       // Phase 3: 创建/恢复/重连
  pi-extension-bridge.ts      // Phase 3: 接 Pi extension hooks
  pi-compat.ts                // Phase 2: Pi 内部 state hack 收口

lib/projection/
  pi-session-projector.ts     // Phase 2: 从 .jsonl 到 UI 模型
  pi-context-projector.ts     // Phase 2: 分支上下文投影
  pi-event-projector.ts       // Phase 1: Pi 事件 → WorkbenchEvent 映射
  pi-message-normalizer.ts    // 现有 normalize.ts 搬迁，Phase 1

lib/workbench/
  workbench-event.ts          // Phase 1: 事件类型定义
  event-buffer.ts             // Phase 1: 内存 ring buffer + seq
  timeline-builder.ts         // Phase 2: Timeline 面板数据构建
  policy-event.ts             // Phase 3: Policy/Approval 事件定义

hooks/
  usePiSessionData.ts         // Phase 2: useAgentSession → loadSession/loadContext
  usePiEventStream.ts         // Phase 2: SSE 连接/重连/seq
  usePiAgentController.ts     // Phase 2: send/command/fork/compact
  useAgentSession.ts          // Phase 2: facade
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
  // ----- Tool execution (observability) -----
  | { type: "tool_started"; toolCallId: string; toolName: string; input?: unknown }
  | { type: "tool_updated"; toolCallId: string; update: unknown }
  | { type: "tool_finished"; toolCallId: string; result?: unknown; isError?: boolean }
  // ----- Compaction -----
  | { type: "compaction_started"; reason?: "manual" | "threshold" | "overflow" }
  | { type: "compaction_finished"; aborted?: boolean; willRetry?: boolean; errorMessage?: string }
  // ----- Auto-retry -----
  | { type: "retry_started"; attempt: number; maxAttempts: number; errorMessage?: string }
  | { type: "retry_finished"; success?: boolean; finalError?: string }
  // ----- Queue / run state -----
  | { type: "run_finished" }
  | { type: "run_failed"; error: string }
  | { type: "queue_update"; steering: string[]; followUp: string[] }
  // ----- Config change -----
  | { type: "thinking_level_changed"; level: string }
  | { type: "session_info_changed"; name: string | undefined };
```

服务端事件 envelope（`raw` 兜底确保向前兼容）：

```ts
interface WorkbenchEventEnvelope {
  seq: number;
  sessionId: string;
  timestamp: string;
  event: WorkbenchEvent;
  /** 当 event type 不在 WorkbenchEvent union 中时保留原始 Pi 事件 */
  raw?: unknown;
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

> **重要区分**：`tool_call`（extension hook）和 `tool_execution_start`（observability event）不同。
> - `tool_call` 是 Pi extension hook，工具执行**前**触发，可拦截/修改参数/阻断——适合 Policy / Approval。
> - `tool_execution_start / update / end` 是 Pi 的 observability 事件，仅报告工具执行状态——适合 Timeline / Inspector。
> WorkbenchEvent 中的 `tool_started / tool_finished` 映射的是 observability 侧，不要混入 policy 逻辑。

Pi Extension Bridge 目标：

```txt
Pi extension hook (拦截/修改)
  ↓
policy decision / observability event
  ↓
WorkbenchEvent / PolicyEvent
  ↓
Web approval UI / audit / timeline

Observability event (仅报告)
  ↓
pi-event-projector.ts
  ↓
WorkbenchEvent + envelope
  ↓
SSE → Timeline / Tool Inspector
```

当前代码中直接改 Pi 内部 state 的逻辑要收口到 `pi-compat.ts`：

```txt
- DeepSeek xhigh thinkingLevel compat
- no-tools mode clear systemPrompt
```

> **注意**：event-buffer + `after=seq` 只能解决 SSE 断线期间的**实时补偿**，不等同于 Audit / Replay。
> 真正的 Replay 需要从 `.jsonl` 重建或写入额外 audit log，属于后续 Milestone，不在首批范围内。

## 实施阶段

完成备注（2026-07-03）：
- 已完成类型域拆分：`lib/types.ts` 保持 barrel 兼容，新增 session/message/rpc 类型模块。
- 已完成 RPC 命令路由抽取：`lib/pi/pi-command-dispatcher.ts` 承载 17 个 handler，`send()` 改为查表分发。
- 已完成 Vitest 测试底座：新增 `vitest.config.ts`、`test` 脚本，覆盖 types、npx、pi-resources、skills search parser。

```txt
Phase 1 — 事件底座
  1. 抽 pi-event-projector.ts（Pi 事件 → WorkbenchEvent 映射）
  2. 加 seq + event-buffer（内存 ring buffer）
  3. SSE 支持 ?after=seq 补事件
  ✅ 完成标志：SSE 断线重连后自动补齐缺失事件

Phase 2 — 观测 UI
  4. 拆 useAgentSession.ts（usePiSessionData / usePiEventStream / usePiAgentController + facade）
  5. 做 Timeline / Tool Call Inspector
  ✅ 完成标志：Timeline 面板展示完整事件流水，Tool Inspector 展示每次 tool call 的入参/结果

Phase 3 — 治理适配
  6. 把 Pi 内部 state hack 收口到 pi-compat.ts
  7. 建 pi-extension-bridge.ts，先接 tool_call → PolicyEvent，tool_execution → WorkbenchEvent
  8. Policy / Approval 审批流 UI
  ✅ 完成标志：写操作可经过审批流程，所有 Pi 内部 hack 集中在 pi-compat.ts 中
```
