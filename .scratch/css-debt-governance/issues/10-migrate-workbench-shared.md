# 10 — 迁移批：workbench/shared（迁移批收官）

**What to build:** AppShell、PreviewDialog、LocaleSwitcher 等工作台与共享组件（约 30 处内联样式）按试点范式完成 className 化，视觉与迁移前一致。本批完成后，全部迁移批次收官：全库 `style={{}}` 应仅剩运行时动态值。

**Blocked by:** 09 — 迁移批：workspace

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含顶部导航、预览对话框）。
- [ ] 全库扫描记录 `style={{}}` 剩余数量与位置，作为票 16 终验基线。
- [ ] `npm run verify:fast` 通过。
