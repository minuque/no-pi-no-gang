# ADR 0002：API 路由拆分——/api/agent/ 与 /api/sessions/

`/api/agent/` 管理**运行态**的 AgentSession（启动、命令、SSE 事件流），`/api/sessions/` 管理**持久化态**的会话文件（列表、详情、删改名、上下文读取）。两条路由物理分开，不混用。

## 原因

AgentSession 会和热更新共存续、跨请求保持；会话文件则是磁盘上的不可变日志。混用会导致同一个端点既需要处理运行时状态又需要处理静态数据，违反单一职责。

## 边界

| 路由 | 职责 | 示例 |
|------|------|------|
| `/api/agent/` | 创建/销毁/命令/实时事件 | POST `/api/agent/new`, GET `/api/agent/:id/events` |
| `/api/sessions/` | CRUD / 元数据 / 上下文读取 | GET `/api/sessions`, DELETE `/api/sessions/:id` |

- `/api/sessions/` 端点**不**启动 AgentSession（只读磁盘）；`/api/agent/` 端点才调用 `startAgentSession()`。
- 异常：`GET /api/agent/:id/events` 会在会话已持久化但未运行时按需恢复 AgentSession，但这是 SSE 端点独有的延迟启动策略，非通用模式。
