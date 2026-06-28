# CONTEXT.md — no-pi-no-gang 领域词汇表

> 只定义术语，不含实现细节。实现决策放 `docs/adr/`。

---

## 核心实体

### Conversation File（会话文件 / `.jsonl` 文件）

pi SDK 持久化的**会话事实源**，一行一条 `SessionEntry`，存于 `~/.pi/agent/sessions/<cwd>/<ts>_<uuid>.jsonl`。

- 是事实源（Source of Truth），不是缓存
- 只记录对话历史、工具调用结果摘要——**不**记录业务实体状态
- 文件内 entry 以 `id` / `parentId` 构成树结构

**别名陷阱**：文档中"会话"有时指这个文件，有时指运行中的 AgentRuntime。见下方"AgentRuntime"。

### AgentRuntime（运行中的 Agent）

pi SDK `AgentSession` 对象——正在执行 agent loop 的**进程内运行时实例**。

- 是"活的"，有生命周期：创建 → streaming → idle → destroyed
- 一个 Conversation File 同一时刻最多被一个 AgentRuntime 持有
- 当前由 `AgentSessionWrapper`（`rpc-manager.ts`）封装管理
- v0.0.2 后由 `TaskSession` 抽象接管

**与 Conversation File 的关系**：Runtime 读取 File 获取历史，将新 turn 写入 File。二者是"运行态"与"持久态"的关系，不是同一个东西。

### TaskSession（v0.0.2+ 规划中）

一个 AgentRuntime 的**治理包装**，增加事件序号、状态机、重连/恢复能力。

- 生命周期独立于 UI 组件（ChatWindow 可以卸载，Task 继续跑）
- 目标状态：`running | idle | failed | compacting | waiting_approval | readonly`

### Entry（条目 / 会话条目）

Conversation File 中的一行/一条记录。类型包括：
- `message` — 用户输入、模型输出、工具结果
- `compaction` — 自动压缩摘要
- `branch_summary` — 分支摘要
- `model_change` / `thinking_level_change` — 配置变更
- `label` — 标签/书签
- `session_info` — 命名

### Message（消息）

`SessionEntry` 中 `type === "message"` 的条目。角色：
- `user` — 用户输入
- `assistant` — 模型输出（含文本、思考块、工具调用）
- `toolResult` — 工具执行结果
- `custom` — 自定义消息

---

## 导航与分支

### Fork（分叉 / 创建新会话文件）

**创建新的 `.jsonl` 文件**，以原会话的某个 entry 为起点。

- 对应 pi SDK 操作：`AgentSession.fork(entryId)` → 生成新 `sessionId` + 新文件
- Fork 后原会话和新会话是**两个独立文件**，各自有自己的 agent loop
- Sidebar 中 Fork 谱系树展示 `parentSessionId` 关系

**约束**：Fork 后必须销毁原 AgentSessionWrapper（它已被原地修改 sessionId）。

### Branch Point（分支点）

同一 Conversation File 内，某个 entry 有**多个子 entry** 的位置。

- 用户可以在分支点选择不同的回复路径
- 这是 `.jsonl` 树结构的自然结果，不是显式操作

### Navigate（路径切换 / 会话内导航）

在同一 Conversation File 内，将活跃路径从当前 leaf 切换到另一个 entry。

- 对应 pi SDK 操作：`AgentSession.navigate(targetEntryId)`
- **不创建新文件**，只改变"当前 active leaf"
- 对应 `navigate_tree` 命令类型

### Active Leaf（当前活跃叶节点）

会话树中当前选中的路径末端 entry。所有发送的新消息都作为该 entry 的子节点。

- 对应 `activeLeafId`、`branchActiveLeafId`
- Context 解析（`buildSessionContext`）以 Active Leaf 为锚点回溯路径

### Entry Tree（会话内条目树）

一个 Conversation File 内所有 entry 以 `parentId` 构成的树结构。

- 对应类型：`EntryTreeNode`（`lib/types.ts:175`）
- 这是**文件内**的树——不要与 Fork 谱系树混淆

### Fork Lineage（Fork 谱系 / 跨会话树）

多个 Conversation File 之间通过 `parentSessionId` 构成的**跨文件**父子关系。

- 对应类型：`ForkTreeNode`（`SessionSidebar.tsx:86`）
- 展示"谁 Fork 自谁"，与 Entry Tree 是完全不同的维度

---

## 运行时状态

### Agent State（Agent 运行状态）

一个 AgentRuntime 的实时状态快照，来自 `SessionNodeAgentState`：
- `exists` — Runtime 是否已创建
- `running` — 是否在运行 agent loop
- `isStreaming` — 是否正在流式输出
- `isCompacting` — 是否正在执行自动压缩
- `thinkingLevel` — 当前思考深度

### SSE Stream（事件流）

从 AgentRuntime → Next.js → 浏览器的事件推送通道。

- 连接断开后需要重连；重连时从 `lastEventSeq`（v0.0.2+）补齐缺失事件
- 只读浏览历史会话时**不创建** SSE 连接和 AgentRuntime

### Stream Reducer（流式事件归并器）

前端 `useAgentSession` 中的状态机，按事件类型分发处理：
- `assistant_message` → 追加/更新流式消息块
- `tool_call` → 追加工具调用块
- `tool_result` → 关联到对应 toolCall
- `agent_end` → 从文件重新加载确保一致性
- `compaction_*` → 同步压缩状态
- `auto_compaction_*` → 旧版 pi 兼容

---

## 能力层（v0.0.4+）

### Capability Module（业务能力模块）

以 MCP server 形式接入的业务能力单元，含：
- `resources` — 只读业务上下文
- `prompts` — 业务流程模板
- `tools` — 可执行动作
- `policy` — 权限、审批、脱敏规则

### Capability Gateway（能力网关）

pi SDK extension 与 MCP server 之间的治理层：
- 注册/发现业务模块
- 按 risk level 路由到 Policy + Approval
- 审计所有能力调用

### Approval Gateway（审批网关）

写操作的必经路径：allow / deny / require_approval。

### Idempotency Key（幂等键）

写操作强制携带的幂等标识，防止重复提交创建重复业务实体。

---

## 容易混淆的术语对

| 术语 A | 术语 B | 区别 |
|--------|--------|------|
| Conversation File | AgentRuntime | 持久态 vs 运行态 |
| Fork | Navigate | 跨文件（新 `.jsonl`）vs 同文件内 n（同 `.jsonl` 内切路径） |
| Entry Tree (`EntryTreeNode`) | Fork Lineage (`ForkTreeNode`) | 文件内 entry 树 vs 跨文件 Fork 谱系 |
| AgentRuntime | TaskSession | 当前的类 vs v0.0.2 的治理抽象 |
| `entryId` | `activeLeafId` | 任意 entry 的 ID vs 当前活跃路径的末端 entry ID |
| `compaction` | `auto_compaction` | pi 新版事件名 vs 旧版事件名（语义相同） |
| Agent State | Task Status | 实时标志位（`isStreaming`等）vs 状态机状态（`running/idle/failed`等） |

---

## 命名约定

- **不要**用 "Session" 不加限定词——说 "Conversation File" 或 "AgentRuntime" 或 "TaskSession"
- **不要**用 "Branch" 指 Navigate——说 "Navigate" 或 "路径切换"
- **不要**用 "Fork" 指 Navigate——Fork 永远是创建新文件
- v0.0.2 引入 TaskSession 后，现有 `AgentSessionWrapper` 相关的 "session" 应逐步迁移为 "task"

### 会话文件侧栏（Conversation File sidebar）

用于浏览、筛选和选择 Conversation File 的导航区域。它呈现的是持久化会话文件及其项目归属，不代表 AgentRuntime、TaskSession 或正在运行的 agent loop。
