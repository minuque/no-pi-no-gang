# Codex Chat Style

Status: ready for tickets

## Destination

形成一份可直接交给实现阶段的双聊天呈现规格：现有 Claude 风格零回归，新增 Codex 风格，并仅消费项目已有真实事件。

## Notes

- 领域：Agent 对话 UI，不改变 AgentSession、Session、AgentEvent 或 PiCommand 语义。
- 规划依据：`DESIGN.md`、`CONTEXT.md`、AICSS 组件目录、现有 chat renderer。
- 规划技能：wayfinder、grilling、domain-modeling；视觉问题先做 prototype。
- 实现约束：只改交互与 UI；共用状态、事件和命令链；不得复制 AICSS 受限源码。
- 本地图只做决策与规格收口，不执行产品代码改动。

## Decisions so far

- [界定 ChatStyle 的产品边界](issues/01-define-chat-style-boundary.md) — ChatStyle 是全局聊天呈现模式，覆盖完整聊天面但不影响工作台外壳。
- [确定切换入口与默认策略](issues/02-choose-switch-and-persistence.md) — 右上工具栏提供 Claude/Codex 二态切换，默认 Claude，并持久化全局偏好。
- [确定真实事件到 AICSS 模式的映射](issues/03-map-real-events.md) — 仅映射真实 block、tool result 与 Markdown AST，不伪造引用或工具状态。
- [确定 Codex 状态流](issues/04-define-codex-state-flow.md) — 推理、工具、流式正文和失败态采用明确的展开、折叠与完成规则。
- [确定双 renderer 架构](issues/05-choose-renderer-architecture.md) — 共用 ChatWindow 控制层，保留 Claude renderer，新增隔离的 Codex renderer。
- [确定 AICSS 复用边界](issues/06-set-aicss-reuse-boundary.md) — 借鉴交互模式并按项目 token 原创适配，不复制受限源码。
- [原型验证 Codex 聊天面](issues/07-prototype-codex-chat-surface.md) — 选择 A「叙事流」作为实现基线。
- [冻结视觉与交互验收规格](issues/08-freeze-visual-acceptance-spec.md) — 最终验收基线已写入 [`spec.md`](spec.md)。

## Not yet specified

- 无。实现阶段不得重新打开已锁定的产品边界；遇到技术约束时按 `spec.md` 的降级规则处理。

## Out of scope

- 新增或修改 AgentHost、AgentSession、AgentEvent、PiCommand、工具能力或会话文件格式。
- 为匹配 AICSS 而伪造 Web Search、引用、Comparison Table 等项目没有结构化数据的状态。
- 改造侧栏、Workspace、全局工作台布局或全局主题 token。
- 改写现有 Claude renderer 的视觉与交互。
- 复制 AICSS 付费或受限组件源码。
