# 03 — 迁移批：chat 消息组件

**What to build:** 消息渲染区组件（用户/助手消息视图、工具调用块、Markdown/思考块、消息导航等，约 100 处内联样式）按试点范式完成 className 化，视觉与迁移前一致。

**Blocked by:** 02 — 试点迁移与范式沉淀

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含流式、hover、工具展开状态）。
- [ ] `npm run verify:fast` 通过。
