# 04 — 迁移批：chat/input

**What to build:** 聊天输入框及左右工具栏（约 76 处内联样式）按试点范式完成 className 化，视觉与迁移前一致；为后续玻璃（输入区）与形变（欢迎区）打好地基。

**Blocked by:** 03 — 迁移批：chat 消息组件

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含 focus ring、streaming 状态、工具栏展开）。
- [ ] `npm run verify:fast` 通过。
