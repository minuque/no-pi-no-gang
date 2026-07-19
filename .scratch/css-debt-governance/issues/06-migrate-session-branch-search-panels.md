# 06 — 迁移批：session 分支/搜索/工具面板

**What to build:** 分支树、分支导航、会话搜索对话框、工具面板（约 67 处内联样式）按试点范式完成 className 化，视觉与迁移前一致；SessionSearchDialog 的样式收敛为后续 Radix 替换（票 14）铺平道路。

**Blocked by:** 05 — 迁移批：session 侧栏/概览/卡片

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含对话框打开态、分支高亮）。
- [ ] `npm run verify:fast` 通过。
