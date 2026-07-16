# ADR 0002：AgentHost API 按 Runtime 与 Session 资源分区

## 状态

已接受。

## 决策

AgentHost 是 Runtime 与 Session 操作的唯一服务端所有者。版本化 Host API 按资源语义分区：

| AgentHost 路径 | 职责 | 示例 |
| -------------- | ---- | ---- |
| `/v1/runtimes*` | 创建或恢复活动运行时、执行命令、管理 Turn、发布 RuntimeEvent | `POST /v1/runtimes`, `POST /v1/runtimes/:id/command`, `GET /v1/runtimes/:id/events` |
| `/v1/sessions*` | 读取或修改持久化 Session 与 SessionRecord | `GET /v1/sessions/:id`, `PATCH /v1/sessions/:id`, `POST /v1/sessions/:id/forks` |

浏览器继续调用 `/api/agent/*` 与 `/api/sessions/*`。这些 Next.js 路由是 Web BFF 的稳定浏览器接口，只负责请求校验、响应适配和 AgentHost 代理，不拥有运行时或 Session 生命周期。

## 原因

Runtime 是可启动、可终止并产生 Turn 与 RuntimeEvent 的活动资源；Session 是由 SessionRecord 组成的持久化资源。两者需要不同的并发与生命周期规则，但必须由同一个 AgentHost 所有，才能保证命令、分支、重命名、删除与活动 Turn 之间的一致性。

## 边界规则

- AgentPool 只存在于 AgentHost 进程。
- Session 修改由 AgentHost 串行化；活动 Turn 与冲突修改返回明确冲突。
- RuntimeEvent 由 AgentHost EventBus 发布，并通过 SSE 支持断线重连。
- Web BFF 不直接创建 RuntimeAdapter，也不直接操作 Pi Session 文件。
- 文件预览等纯 Web 本地资源可以保留在 Web BFF，但不获得运行时所有权。

## 结果

Host API 可以独立演进和测试；浏览器 API 保持面向 UI 的形状；所有运行时与 Session 写入仍经过同一条 Monorepo 实现路径。
