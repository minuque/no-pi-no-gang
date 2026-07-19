# 07 — 迁移批：settings 模型/供应商/表单

**What to build:** 设置区的供应商详情、模型详情、表单字段、供应商选择器、API Key、思考档位映射编辑等组件（约 93 处内联样式）按试点范式完成 className 化，视觉与迁移前一致。

**Blocked by:** 06 — 迁移批：session 分支/搜索/工具面板

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含表单 focus/错误状态）。
- [ ] `npm run verify:fast` 通过。
