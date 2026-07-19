# 02 — 试点迁移与范式沉淀

**What to build:** AssistantMessageView 与 ModelsConfig 两个组件的全部静态样式改为 className 表达，迁移前后视觉像素一致；同时沉淀一份迁移范式（off-scale 处理、CSS 类拆解、条件样式拼法），供后续所有批次复制。

**Blocked by:** 01 — Tailwind 刻度映射进 @theme

**Status:** ready-for-agent

- [ ] 两文件 `style={{}}` 仅剩运行时动态值；任意值语法仅用于一次性 off-scale 值（三级避让：刻度类 → @theme/命名类 → 任意值兜底）。
- [ ] 组件专属 CSS 类（如 .message-action-button 联动样式）按"接触即迁"处理，因内联样式消失而失去理由的 `!important` 清除。
- [ ] 条件样式统一为 className 条件拼接，不再存在 style 三元表达式。
- [ ] 迁移前后同屏人工比对无视觉差异（含 hover/active 状态）。
- [ ] 范式要点记录进 spec.md 或 DESIGN.md；`npm run verify:fast` 通过。
