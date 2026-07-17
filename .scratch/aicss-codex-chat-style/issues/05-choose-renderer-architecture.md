# 确定双 renderer 架构

Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

如何新增 Codex 风格，同时最大限度避免 Claude 路径回归和业务逻辑分叉？

## Answer

ChatWindow、会话 hook、事件 reducer、输入命令与工具结果配对逻辑保持共享。现有消息组件作为 Claude renderer 保留；新增 Codex renderer 消费同一标准化 view model。输入区只允许视觉布局差异，快捷键、命令菜单、附件、发送与中止语义共用。`DESIGN.md` 增加双聊天模式契约，Codex token 仅作用于聊天区，不修改全局主题 token。

## Comments

- 2026-07-17：用户确认独立 renderer、共享控制层与输入行为边界。
