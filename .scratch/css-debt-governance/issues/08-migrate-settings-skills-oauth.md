# 08 — 迁移批：settings 技能/OAuth

**What to build:** 技能面板、技能配置、OAuth 详情组件（约 89 处内联样式）按试点范式完成 className 化，视觉与迁移前一致。

**Blocked by:** 07 — 迁移批：settings 模型/供应商/表单

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异。
- [ ] `npm run verify:fast` 通过。
