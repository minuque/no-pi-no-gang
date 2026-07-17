# 确定真实事件到 AICSS 模式的映射

Type: research
Status: resolved
Blocked by: 01

## Question

现有数据模型能真实驱动哪些 AICSS 对话模式，哪些模式必须排除或降级？

## Answer

显式 AssistantContentBlock 只有 text、image、thinking、toolCall；ToolResultMessage 提供成功、失败和输出。代码块、表格和任务列表只能通过现有 Markdown AST 呈现。Web Search、File Diff、Image Generation 仅在工具名与真实输入/结果明确匹配时使用专用呈现；未知或第三方工具使用通用 Activity 卡。当前没有结构化 citation 数据，不实现引用组件；Comparison Table 不从普通表格内容推断。

## Comments

- 2026-07-17：依据 CodeGraph 对 MessageView、AssistantMessageView、MessageToolBlock 与 message-types 的检查。
- 2026-07-17：用户确认只接真实事件，并接受未知工具通用降级。
