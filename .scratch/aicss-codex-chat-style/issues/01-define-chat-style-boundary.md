# 界定 ChatStyle 的产品边界

Type: grilling
Status: resolved
Blocked by:

## Question

ChatStyle 是 Agent/Session 能力，还是纯 UI 呈现偏好？它应影响哪些界面区域？

## Answer

ChatStyle 是纯 UI 呈现偏好，不是 Agent 模式，也不写入 Session。它覆盖消息区、输入区、思考状态和工具状态；侧栏、Workspace 与其他工作台外壳保持不变。Claude 与 Codex 共用同一 Session、AgentEvent 和命令链。

## Comments

- 2026-07-17：用户确认完整聊天面切换，不影响侧栏与工作区。
