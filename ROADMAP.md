# ROADMAP — no-pi-no-gang

> 项目目标：可观测、完全透明、轻量、开发者友好且可扩展的 **Pi Agent Workbench**。
> 基于 [Pi SDK](https://pi.dev/docs/latest/sdk)。
>
> 本文件记录产品策略、交互设计、架构、可视化和治理方向的所有已决策项。
> 决策日期：2026-07-05

---

## 1. Product Taste：产品定位

**一句话：** Pi 的本地 Agent 控制台 / 工作台，不是通用聊天应用。

### 核心场景

| 场景 | 优先级 |
|------|--------|
| 查看历史 session / branch / fork / clone | P0 |
| 随时观察 agent 当前在做什么 | P0 |
| 控制危险操作（审批） | P0 |
| 恢复中断运行 | P1 |
| 审计 agent 做过什么 | P0 |

### 不做

- ❌ 多人协作平台
- ❌ 通用 Prompt 管理器
- ❌ 另一个 ChatGPT Clone
- ❌ 自研 Agent Runtime
- ❌ DAG 图可视化

### Session 实体模型（基于 Pi SDK 语义）

| 概念 | SDK 映射 | 用户操作 | UI 标识 |
|------|----------|----------|---------|
| Session | 一个 JSONL 文件 | 点击/新建 | ChatList 中的一行 |
| Branch | `sessionManager.branch(entryId)` — 原地移叶指针 | 翻到旧消息，"从这里继续" | 同一 Session 内 breadcrumb |
| Fork | `runtime.fork(entryId)` — 新 session 文件 | "以此为基础开新会话" | tag badge `← fork of ...` |
| Clone | `createBranchedSession()` / `fork(position:"at")` | Fork 的变体 | tag badge（同 Fork） |

- 所有 Branch/Fork/Clone 的溯源关系只通过 tag badge 标识，不做 DAG 图
- 历史列表：flat session list，不渲染 entry tree
- 每个 Session 内用 breadcrumb 表示当前位置

---

## 2. Interaction Taste：交互体验

**调性：** VSCode / Codex / Claude 的混合体 —— 快、清楚、少打扰、状态明确、有适当交互动画。

### 三栏布局（稳态）

```
┌────ActivityBar 48px────┬────ChatList────┬────Chat────┬──Right Panel──┐
│                        │  可调 180-480px │  min 320px  │  min 300px    │
│   ❚ Session list       │  上层：近期 7天  │  对话消息流  │  Overview Tab  │
│   ❚ Settings           │  下层：按 cwd   │             │  Turn 卡片列表  │
│   ❚ ...                │  归档          │             │                │
└────────────────────────┴────────────────┴─────────────┴────────────────┘
```

- **ChatList（SessionSidebar）：** 双层 —— 上层近期会话（最近 7 天有更新），下层按 cwd 归档树
- **ChatList 右键菜单：** 重命名 + 删除会话（已有，复用）
- **右侧 Panel：** Session Overview 概览，Turn 卡片列表（耗时/工具数/token），点击弹出 Trace Dialog
- 面板宽度 localStorage 持久化

### 输入区

- **智能输入框**，不是纯终端
- MVP 智能只做一项：**敲 `/` → dropdown 列出 slash commands / skills / extension commands**
- 不做 `@` 文件引用、不做复杂的自动补全
- 保持 multiline，不限制单行

### 快捷键体系

**暂缓。** 后续再定。

### 验收标准

- 用户不需要猜 agent 是否还活着
- 用户能知道当前消息属于哪个 branch
- 用户能从 UI 理解"这次运行发生了什么"

---

## 3. Observability Taste：可观测性

**架构模式：** 双通道 SSE（B1）

```
Pi SDK Event → Projection Layer ─┬─ raw stream: text_delta, thinking_delta (实时)
                                  └─ view events: turn_completed, trace_span, permission_prompt (投影后)
```

### Trace 数据模型

```
Trace (一次 agent_start → agent_end)
 └── Span: Turn (LLM call)
       ├── Sub-span: thinking block (duration)
       ├── Sub-span: text block
       └── Sub-span: tool_call
             └── Sub-span: tool_result (duration, exit_code, isError)
```

- 时序从 Pi SDK 事件在投影层重建
- 不在 session 文件中额外持久化 —— messages[] 是持久化形态，trace 在运行中构造，用于实时+事后展示

### UI 展示

- **右侧 Panel Overview Tab：** Turn 卡片列表（每轮耗时、工具数、token）
- **点击卡片 → 弹出 Trace Dialog：** 展开该 Turn 内的 thinking + toolCalls + toolResults 时序详情
- **数据源：** 投影层从 messages[] 实时重建，零额外存储

### 历史 Session 支持

- **全覆盖**，但有损：
  - 有：每条 AssistantMessage 的 content blocks + ToolResultMessage 的 `isError`
  - 有：turn 分组（按 message 顺序和 role 交替重建）
  - 无：运行时毫秒级 timing（仅流式运行时 `_duration` 有值）
  - 无：retry 细节
- 对审计场景（"哪个 tool 返回了错误"），完全够用

### 不做

- ❌ OpenTelemetry 导出
- ❌ 跨进程 trace
- ❌ 第三方 trace 后端
- ❌ Inspector ↔ Chat 滚动联动（暂缓）

---

## 4. Governance Taste：治理与审批

### 技术方案

- 使用社区扩展 `@gotgenes/pi-permission-system`（已上 npm）
- 写 `permission-ui-bridge` Extension（B 方案，`pi.events` 桥接）

### 架构

```
Pi Extension Event Bus (pi.events)
  → permissions:ui_prompt          ← permissions:rpc:prompt:reply:xxx
  ↕
permission-ui-bridge extension
  → 自定义事件 bridge:permission_prompt（推 SSE）
  ← 前端 decision → bridge:permission_decision（回写 RPC reply）
  ↕
AgentSessionWrapper (SSE 推 + HTTP API 收)
  ↕
前端 → 审批 Modal
```

### 审批 Modal UX

参考 Claude Code，支持：

| 操作 | 行为 |
|------|------|
| Approve once | 放行这一次 |
| Approve for session | 本会话内同 pattern 不再弹 |
| Deny | 拒绝，可附理由 |
| 理由 | 流入 `permissions:decision` 的 `denialReason`，可追溯 |

### 配置

- 当前：`~/.pi/agent/extensions/pi-permission-system/config.json`（全局）+ 项目级覆盖
- 未来：Agent 配置 UI 里可嵌入规则编辑器（Post-MVP）

### 工具预览（Tool Input Formatter）

- 为 `write`/`edit` 注册预览摘要（"将写入 file.ts，+12/-3 行" 而非 JSON dump）
- 通过 `registerToolInputFormatter` 实现

---

## 5. Architecture Taste：架构边界

### 分层

```
浏览器 (厚 UI)
  ↑ SSE (双通道 — raw stream + view events)
Projection Layer (Node.js，增量建设)
AgentSessionWrapper + 扩展系统 (permission-ui-bridge 等)
Pi SDK (不 fork, 不修改)
```

### 开发原则

- **薄 Web UI，厚投影层** — 前端只负责渲染和交互，状态加工在投影层做
- **尊重 Pi SDK，不 fork Runtime** — 所有 loop 变更通过 Extension API 实现
- **增量引入投影层** — permission-ui-bridge 是第一个投影层实践；其余观测事件的投影逐步从 `agent-event-reducer` 搬过来
- **当前 controller/command dispatcher 不做大重构** — 但新功能走投影层

### 权限系统集成路径

1. Install `@gotgenes/pi-permission-system`
2. 写 `permission-ui-bridge` 扩展 → 注册到 `extensionFactories`
3. Wrapper 监听 bridge:permission_prompt → 推 SSE
4. 前端弹 Modal → 审批 → POST API → bridge:permission_decision
5. `registerToolInputFormatter` 为 write/edit 注册预览

---

## 6. Visual Taste：视觉语言

**已定（DESIGN.md）。** VSCode Dark Modern 同源色板：

- 中性灰表面（R=G=B），蓝色单 accent `#007acc`
- 零光效零渐变，每种状态独立色值
- 圆角克制（≤6px，消息气泡例外 12px）
- 过渡 ≤120ms
- 字重 ≤600

Dark/Light 双主题同步提供，`View Transitions API` 280ms crossfade 切换。

### TODO 提示

- 所有组件使用 CSS token（`--ui-*`），不从零定义新色
- 新色从 VSCode 原生色板取
- 交互态（hover/active/focus/disabled）全定义

---

## 决策状态快照

| 领域 | 已决 | 暂缓 | 待定 |
|------|------|------|------|
| 产品定位 | Session/Branch/Fork 语义、不做 DAG、不做社交 | — | — |
| 交互 | 三栏布局、双层 ChatList、输入区 slash 补全 | 快捷键 | 审批 Modal 具体视觉稿 |
| 可观测 | 双通道 SSE、Trace Span 模型、右侧 Overview+Dialog | Inspector↔Chat 联动 | — |
| 治理 | pi-permission-system、bridge 扩展、Approve Once/ForSession/Deny+理由 | — | UI 规则编辑器 |
| 架构 | 厚投影层增量建设、不 fork SDK | controller 重构 | 投影层事件类型定义 |
| 视觉 | VSCode Dark Modern（DESIGN.md） | — | — |
