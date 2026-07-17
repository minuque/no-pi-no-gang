# 07 — 适配 Markdown 与图片内容

**What to build:** Codex 模式使用现有 Markdown AST 与真实图片数据呈现代码块、表格、任务列表和图片，同时保持语义、加载失败反馈与局部横向滚动。

**Blocked by:** 03 — 呈现 Codex 叙事流基础消息

**Status:** ready-for-agent

- [ ] fenced code、表格与任务列表沿用现有 Markdown 解析结果，只改变 Codex 模式的呈现，不推断 Comparison Table。
- [ ] 代码和表格仅自身横向滚动，不撑宽页面；长英文、中文与混合语言保持可读。
- [ ] 用户与 Agent 图片使用真实附件或内容块数据，并为替代文本和加载失败提供可读状态。
- [ ] heading、list、table、code 与 image 保持正确语义和键盘可达性，Claude 样式不受影响。
- [ ] 代码、表格、任务列表、图片成功与图片失败具有自动化测试，快速验证通过。
