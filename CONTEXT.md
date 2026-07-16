# Pi Agent — 领域语言

这是一个 AI 编码代理客户端的领域语言。项目的核心概念层层递进：**持久化会话文件**记录代理与用户的对话历史，**内存 AgentSession** 封装运行中的代理进程，**UI 层**通过事件流和 API 与之通信。

## 语言

### 核心概念

**AgentSession**:
Pi SDK 创建的运行中代理实例。通过 `AgentSessionWrapper` 包装后注册到全局 `SessionRegistry`，拥有事件订阅、命令派发和空闲销毁生命周期。
_Avoid_: Agent, Session（单用时产生歧义）

**AgentSessionWrapper**:
`AgentSessionLike` 的本地包装器，添加了多路事件监听（`onEvent`）、空闲计时器→自动销毁、命令派发（`send()`）以及 `_alive` 标志。
_Avoid_: SessionWrapper

**AgentHost**:
独立后端进程边界，负责运行时协议、Agent Runtime 生命周期、MCP 连接和事件发布。Web 通过 HTTP/SSE 与其通信。
_Avoid_: AgentPool（当指进程或服务边界时）

**AgentPool**:
AgentHost 内部管理运行中 Agent Runtime 实例的集合，负责实例注册、查找与销毁，不代表进程边界。
_Avoid_: AgentHost

**Session**:
磁盘上的 `.jsonl` 文件，记录一次完整的代理对话。由 Pi SDK 的 `SessionManager` 管理，包含头部、Entry 树和叶子指针。
_Avoid_: Conversation, Chat

**SessionEntry**:
会话文件中的一条不可变记录。类型包括 `message`、`thinking_level_change`、`model_change`、`compaction`、`branch_summary`、`custom`、`custom_message`、`label`、`session_info`。每条 Entry 有唯一 ID 和父 ID 形成树结构。

**SessionRegistry**:
全局 `Map<string, AgentSessionWrapper>`，跨热更新（HMR）保留。通过 `getRegistry()` 访问。
_Avoid_: SessionPool（SessionPool 是它的门面类）

**SessionLocks**:
全局 `Map<string, Promise>`，协调同一会话 ID 上的并发启动，避免重复创建底层 AgentSession。

### 消息与事件

**AgentMessage**:
对话中的一条消息。角色（`role`）决定类型：`user`（用户输入）、`assistant`（代理回复，含 content blocks）、`toolResult`（工具执行结果）、`custom`（自定义消息）。其中 `AssistantMessage` 携带 `usage` 信息。

**AssistantContentBlock**:
Assistant 消息的内容单元。类型：`text`、`image`、`thinking`、`toolCall`。

**AgentEvent**:
运行中 AgentSession 发出的实时事件。分为两类——**SdkEvent**（agent_start/end、message_start/update/end、tool_execution_start/end、auto_retry、auto_compaction、compaction）和 **ViewEvent**（permission_prompt/decision、turn_completed、connection_status）。
_Avoid_: SdkEvent（当泛指时）

**StreamAction**:
流式消息 reducer 的动作。类型：`start`、`update`、`end`、`reset`。由 `useAgentState` 内的 `streamReducer` 消费。

### 会话操作

**Fork**:
从已有会话的某个 Entry 点创建分支会话。生成新的 `.jsonl` 同级文件。通过 `handleFork` 命令处理。
_Avoid_: Branch（当指向具体操作时）

**Compaction**:
将对话历史早期部分折叠为摘要以节省 token。可自动触发（`auto_compaction`）或手动触发（`compact` 命令）。压缩后的内容替换为一条 `compaction` 类型的 Entry。

**SessionContext**:
从会话文件中的 Entry 树投射出的只读视图：消息数组（`messages`）+ Entry ID 列表（`entryIds`）+ 元数据。

**ToolSet**:
代理可用的工具集合。核心工具：read、bash、edit、write、grep、find、ls。通过 `ToolPreset`（`none` / `default` / `full`）选择。

**PiCommand**:
通过 `AgentSessionWrapper.send()` 派发给 Pi SDK 的命令。类型对应命令处理器：`prompt`、`abort`、`fork`、`set_model`、`compact`、`steer`、`follow_up`、`get_tools`、`set_tools`、`set_thinking_level`、`set_auto_compaction`、`set_auto_retry`、`get_commands`、`command`、`abort_compaction`、`navigate_tree`。
_Avoid_: Command（会产生歧义）

### UI 与通信

**SessionConnection**:
客户端与 AgentSession 之间的实时通信抽象。SSE 从 `/api/agent/:id/events` 接收实时事件，REST 发送命令和读取会话数据。由 `useSessionConnection` hook 管理。
_Avoid_: Transport, WebSocket

**AgentEventStatus**:
UI 与会话 AgentSession 之间的连接状态枚举：`idle`、`connecting`、`connected`、`reconnecting`、`readonly`、`destroyed`。

**AgentPhase**:
代理当前的执行阶段：`waiting_model`（等待模型响应）、`running_tools`（执行工具调用）、`running_skill`（运行 skill）、`running_command`（运行 slash 命令）。

**Workspace**:
工作区面板中可见的文件系统区域。包含文件树、文件预览和路径路由校验。

**Skill**:
通过 `resourceLoader` 注册的扩展能力。在对话中以 `skill:<name>` 形式调用。区别于「领域语言 skillset」——此处指 Pi 内核的扩展机制。
