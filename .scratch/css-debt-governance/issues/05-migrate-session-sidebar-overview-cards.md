# 05 — 迁移批：session 侧栏/概览/卡片

**What to build:** 会话侧栏、会话概览面板、会话卡片、目录分组区（约 84 处内联样式）按试点范式完成 className 化，视觉与迁移前一致。

**Blocked by:** 04 — 迁移批：chat/input

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含选中/hover、重命名状态）。
- [ ] `npm run verify:fast` 通过。
