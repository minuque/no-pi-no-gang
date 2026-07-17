# 确定 Codex 状态流

Type: grilling
Status: resolved
Blocked by: 03

## Question

Codex renderer 如何呈现推理、工具执行、流式正文、完成态与失败态？

## Answer

- 推理进行时展开；完成后折叠为 `Thought for Ns` 摘要，可再次展开。
- 工具运行时展开；成功后折叠成摘要；失败保持展开。
- edit/write 在有真实输入与结果时展示 File Diff；其他已识别工具展示对应活动行。
- 用户消息使用气泡；Agent 回复使用无气泡正文。
- 流式正文显示光标；完成后转为静态 Markdown。
- Code Block、Data Table 与 Markdown task list 使用 Codex 视觉适配；无结构化数据的组件不出现。

## Comments

- 2026-07-17：用户逐项确认状态流。
