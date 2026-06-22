# TODO.md

## 背景语义

当前排期按"先稳当前 harness，再抽 runtime，再接业务能力"组织。

- no-pi-no-gang 的目标是基于 pi SDK 的 **Agent Harness + Task Runtime**，不是单纯 Web 外壳。
- pi SDK 继续负责 `AgentSession`、模型调用、会话写入和 agent loop。
- no-pi-no-gang 负责运行时、可观测性、审批、审计、业务能力编排。
- 公司业务模块优先通过 MCP 接入，朝"业务能力可插拔"演进。
- `.jsonl` 是会话事实源，TaskSession 是运行事实源，业务数据库是业务事实源。
- agent 不直接写业务数据库；写操作通过受治理的 MCP tool 调用业务 API。

核心原则：不要把业务 API 细节塞进 prompt 或 UI。先抽象 Capability Gateway，再把业务模块注册为可治理的 resources / prompts / tools。

---

## 版本排期总览

| 版本 | 主题 | 目标 | 发布标准 |
|---|---|---|---|
| v0.0.1 | 当前语义收敛 | 会话、分支、SSE、工具调用、文件上下文可解释 | 用户能判断当前在哪个 session / branch / runtime state |
| v0.0.2 | Task Runtime 过渡层 | 在现有 Next 进程内先建立 TaskSession 模型和事件序号 | ChatWindow 卸载不等于 task 消失；只读浏览不启动 AgentSession |
| v0.0.3 | Runtime 独立化 | 把运行态从 Next API route 中剥离到 agentd / worker | 多任务并行、互切、重连、取消互不串线 |
| v0.0.4 | Capability Gateway MVP | 建立 MCP client adapter、capability registry、只读业务模块 | 能通过 MCP resource 读取业务上下文，且有审计 |
| v0.0.5 | 审批型写操作 | write tool 进入 policy / approval / idempotency 流程 | 用户确认后才能写业务系统，重复提交可控 |
| v0.0.6+ | 业务 workflow 与验证 | 沉淀公司业务流程、测试、追踪、回归验证 | 业务 workflow 可复用、可审计、可回归 |

---

## v0.0.1 — 当前语义收敛

目标：不急着引入业务模块，先把当前 UI harness 的事实表达讲清楚。用户不用读源码，也能看懂会话、分支、上下文、工具调用、模型和文件之间的关系。

### Must

- [x] **会话节点元数据补缺**：`SessionInfo` 已有 `parentSessionId`、`cwd`、`modified`；继续补 `model`、`orphaned`、`hasCompaction`，并把 live `isStreaming` 从 agent state 合并到节点展示。
- [ ] **Fork / Branch 文案统一**：Fork 明确是"创建新 `.jsonl` 会话文件"；Branch 明确是"同一 `.jsonl` 内路径切换"。
- [ ] **分支切换状态同步**：消息列表、`entryIds`、leaf、BranchNavigator 来自同一次 `buildSessionContext()`。
- [x] **Chat 状态表达补齐**：当前已有输入区运行提示；继续补齐 `streaming`、`compacting`、`thinkingLevel`、SSE 连接、readonly / destroyed 状态的统一展示。
- [x] **SSE 断线状态区分**：区分"正在重连 / 会话已销毁 / 当前只读浏览"。
- [x] **Agent 状态展示补缺**：进入会话时已通过 `includeState` 读取 live state；继续把 `exists/running`、`isStreaming`、`isCompacting`、`thinkingLevel`、最后更新时间映射到明确 UI 状态。

### Should

- [x] **消息锚点补齐**：assistant 消息已有 entry / leaf / branch 锚点；继续覆盖 user / toolResult，并显式标记是否在当前路径上。
- [x] **Tool call 失败展示**：优先展示结构化错误，无可读错误时提供展开入口。
- [ ] **连续 tool call 合并规则**：保留原始消息边界和 `entryId` 归属，不跨消息合并。
- [x] **Context Stack**：右侧工作台展示手动打开文件、最近 tool call 文件、当前会话引用文件。
- [ ] **消息到文件单向跳转**：点击消息高亮相关文件。
- [ ] **文件错误态**：明确展示 cwd 外、已删除、不可读、二进制不支持。

### Done / 保持

- [x] 会话树父子关系：`SessionSidebar.buildSessionTree()` 已按 `parentSessionId` 嵌套展示 Fork 谱系。
- [x] Fork 后旧 wrapper 串线修复：`rpc-manager` 的 `fork` 分支已在生成新 session 后调用 `this.destroy()`。
- [x] 分支入口下沉到左侧。
- [x] Tool call 摘要统一，文件加载和流式事件两处都经 `normalizeToolCalls()`。
- [x] 同时兼容 `compaction_start/end` 和 `auto_compaction_start/end`。
- [x] 无工具模式显示，不阻止普通发送。
- [x] ToolPanel 预设：已有 `none` / `default` / `full`，ChatInput 已显示无工具模式。
- [x] ModelsConfig 保存反馈：已有 saving / saved / error 三种状态。
- [x] SkillsConfig 状态区分：已有加载错误、保存错误、安装错误、空列表状态。
- [x] 进入会话时基础 Agent 状态读取：`useAgentSession.loadSession(..., includeState=true)` 已读取 live state 并在 streaming 时重连 SSE。
- [x] `agent_end` 后 `loadSession()` 保留版本守卫。
- [x] 文件 API 保持 cwd 边界检查。

### 验收

- Fork 后原会话再次请求不会串到新 wrapper。
- streaming 中刷新页面可以自动重连，或明确显示不可重连原因。
- 只读打开历史会话不会创建 AgentSession。
- 用户能从 UI 文案区分 Fork 和 Branch。

---

## v0.0.2 — Task Runtime 过渡层

目标：先不急着拆独立进程，在现有 Next 进程内建立 TaskSession 抽象，让 UI 和运行态解耦，为后续 agentd 做铺垫。

### Must

- [ ] **TaskSession 数据模型**：`taskId`、`piSessionId`、`sessionFile`、`cwd`、`status`、`startedAt`、`updatedAt`、`lastEventSeq`、`lastError`。
- [ ] **Task registry 过渡层**：在 `globalThis.__piSessions` 外包装 task registry，前端按 task 状态显示运行中会话。
- [ ] **事件序号**：所有 agent event 带单调 `seq`，前端记录 `lastEventSeq`。
- [ ] **事件回放 MVP**：内存 ring buffer 支持切回会话时补齐缺失事件，再接 live SSE。
- [ ] **API 语义拆分**：发送消息负责启动或恢复 task；`GET /events` 只订阅已有 task，不隐式创建 AgentSession。
- [ ] **运行状态语言统一**：`running`、`idle`、`failed`、`compacting`、`waiting_approval`、`readonly` 在 API 和 UI 中语义一致。
- [ ] **pi SDK extension bridge**：当前 `bindExtensions()` 已绑定 abort / shutdown；继续抽成统一 bridge，为 preflight、tool policy、context injection 留入口。

### Should

- [ ] **运行事实源存储草案**：明确 task state / task events 的本地存储位置，不混入 `.jsonl` 会话事实源。
- [ ] **多 task 状态展示**：左侧会话树和顶部状态条能显示多个运行中 task。
- [ ] **Route runtime 声明**：涉及 pi SDK、文件系统、长连接的 route 显式声明 `runtime = "nodejs"`。
- [ ] **ChatWindow 生命周期解耦**：切走会话或卸载组件不终止 task，切回通过 `lastEventSeq` 续接。

### 验收

- 同一会话并发发送不会创建多个 wrapper。
- ChatWindow remount 不丢 task 状态。
- 切走 streaming 会话不会 abort；切回能补齐事件。
- 空闲销毁后允许从文件态继续，发送消息时再创建 AgentSession。

---

## v0.0.3 — Runtime 独立化

目标：把 AgentSession 运行态从 Next API route 中剥离到独立 agentd / worker。Next 退回控制面和 UI 后端。

### Must

- [ ] **agentd 进程**：task registry 和 `AgentSessionWrapper` 搬出 Next API route。
- [ ] **Worker 隔离**：每个进行中会话独立 task runtime，优先评估 `child_process.fork()`。
- [ ] **Task command protocol**：Next 通过本地 IPC / HTTP 向 agentd 发送 `create`、`resume`、`cancel`、`status`、`subscribe`。
- [ ] **持久 task event store**：从内存 ring buffer 升级为 `task-events/<taskId>.jsonl` 或等价轻量存储。
- [ ] **取消与 shutdown 语义**：abort、worker exit、user cancel、idle cleanup 有明确状态和审计记录。

### Should

- [ ] **agentd 健康检查**：UI 能区分 agentd 未启动、task 不存在、task 已失败、task 已完成。
- [ ] **worker 崩溃恢复**：可从 `.jsonl` 和 task event store 恢复到只读态或可继续态。
- [ ] **资源限制**：并发 task 上限、空闲超时、长工具调用超时。

### 验收

- 同时启动两个会话任务，状态、事件、abort 互不串线。
- Next.js 热重载不影响运行中 task。
- agentd 重启后，历史 task 至少可解释地恢复为 readonly / failed / resumable。

---

## v0.0.4 — Capability Gateway MVP

目标：先接 MCP 的只读能力，证明业务能力可插拔，同时不开放业务写操作。

### Must

- [ ] **CapabilityModule manifest**：定义 `id`、`displayName`、`version`、`mcpServer`、`scopes`、`resources`、`prompts`、`tools`、`policy`。
- [ ] **Capability Registry**：加载、启停、查询业务模块；支持按 cwd / workspace / user scope 生效。
- [ ] **MCP Client Adapter**：统一封装 MCP server 连接、`resources/read`、`prompts/get`、`tools/call`、取消和错误映射。
- [ ] **只读业务模块样例**：接一个 read-only MCP module，用 resources 查询业务数据，不开放写操作。
- [ ] **只读审计**：记录 `taskId`、`sessionId`、resource、query 摘要、结果摘要、错误。
- [ ] **敏感字段脱敏**：token、密钥、客户隐私、内部 URL 默认屏蔽或摘要化。

### Should

- [ ] **Capability UI**：展示启用的业务模块、scope、连接状态、只读 / 可写能力。
- [ ] **业务上下文注入**：通过 pi SDK extension 注入经治理的业务上下文，不把业务 API 细节写入 prompt。
- [ ] **MCP server 错误映射**：连接失败、权限不足、schema 错误、超时有可恢复提示。

### 验收

- agent 能通过 MCP resource 查询业务上下文。
- 只读调用可在 MessageView / AuditView 中追溯。
- MCP server 断开不会导致 agent runtime 崩溃。
- `.jsonl` 不写入未脱敏的敏感 payload。

---

## v0.0.5 — 审批型写操作

目标：开放低风险、可幂等、可审计的业务写 tool。写操作必须经过 Policy + Approval Gateway。

### Must

- [ ] **Policy + Approval Gateway**：按 tool 风险等级决定 allow / deny / require_approval。
- [ ] **Approval UI 最小闭环**：展示待执行工具、参数摘要、风险说明、确认 / 拒绝。
- [ ] **写操作幂等 key**：写 tool 强制提供 idempotency key，失败重试不产生重复业务实体。
- [ ] **业务审计记录**：记录 `taskId`、`sessionId`、`toolName`、input 摘要、output 摘要、审批状态、幂等 key、错误。
- [ ] **业务结果标准化**：MCP tool result 映射成统一 `ToolResult` / audit record，不把原始敏感 payload 全量写入 `.jsonl`。

### Should

- [ ] **计划先行**：高风险写操作先生成计划 / diff / 审批说明，再允许执行。
- [ ] **拒绝后的 agent 续作**：用户拒绝 tool 后，agent 能拿到结构化拒绝原因继续对话。
- [ ] **权限模型**：按 user / workspace / module scope 控制 tool 可用性。

### 验收

- 未确认的写 tool 不会触达业务 API。
- 重复点击确认不会创建重复业务实体。
- 审计记录能回答"谁在什么 task 中批准了什么操作，结果是什么"。

---

## v0.0.6+ — 业务 workflow 与验证体系

目标：在稳定的 runtime 和 capability 基础上沉淀公司业务流程，并补齐自动化验证。

### Added

- [ ] **业务 workflow 模板**：项目巡检、需求澄清、发布检查、工单生成等 prompt / resource / tool 组合。
- [ ] **Capability Gateway 测试**：只读 resource、审批型 write tool、拒绝执行、MCP server 断开。
- [ ] **审计快照测试**：敏感字段脱敏、幂等 key、approval state、tool result 摘要。
- [ ] **状态机回归用例**：会话树、Fork、Branch、SSE、compaction、ToolCall、task reconnect。
- [ ] **`normalizeToolCalls()` 单元测试**：覆盖文件加载和流式事件两种来源。
- [ ] **`useAgentSession` 竞态回归用例**。

### Changed

- [ ] TODO / ROADMAP / HTML 架构图保持同步。
- [ ] 建立发布前手动验证清单：生产构建、启动、核心链路、MCP 模块、审批写操作。

### 验收

- 一个业务 workflow 能完整经历 read context、plan、approval、write、audit。
- 关键 runtime / capability 变更有自动化或明确手动验证步骤。

---

## 权重规则

- 90-100：P0，核心语义、运行时边界、业务安全。
- 75-89：P1，可理解性、可靠性、审批审计。
- 60-74：P2，配置、错误态、操作体验。
- 40-59：P3，维护、诊断、测试增强。

## 特性总览

| 特性 | W | P | v0.0.1 | v0.0.2 | v0.0.3 | v0.0.4 | v0.0.5 | v0.0.6+ |
|---|---|---|---|---|---|---|---|---|
| 会话谱系与 cwd 视角 | 100 | P0 | ● | | | | | |
| Fork / Branch 语义 | 95 | P0 | ● | | | | | |
| Chat 执行流可审计 | 92 | P0 | ● | ● | | | | |
| Agent 生命周期可靠性 | 90 | P0 | ● | ● | ● | | | |
| TaskSession 过渡抽象 | 98 | P0 | | ● | | | | |
| agentd / worker runtime | 96 | P0 | | | ● | | | |
| pi SDK extension 编排 | 90 | P0 | | ● | ● | ● | | |
| MCP 只读业务能力 | 94 | P0 | | | | ● | | |
| 审批型写操作 | 92 | P0 | | | | | ● | |
| 业务审计与脱敏 | 88 | P1 | | | | ● | ● | ● |
| 模型 / 工具 / 技能配置 | 68 | P2 | ● | | | | | |
| 可观测性与回归验证 | 55 | P3 | | | | | | ● |
