# 09 — 迁移批：workspace

**What to build:** 工作区文件树、树节点、预览面板、目录内容、ContextMenu（约 62 处内联样式）按试点范式完成 className 化，视觉与迁移前一致；ContextMenu 的样式收敛为后续 Radix 替换（票 15）铺平道路。

**Blocked by:** 08 — 迁移批：settings 技能/OAuth

**Status:** ready-for-agent

- [ ] 批次内组件 `style={{}}` 仅剩运行时动态值。
- [ ] 批次专属 globals.css 类拆解或明确归档为全局模式；关联 `!important` 清除。
- [ ] 迁移前后同屏人工比对无视觉差异（含树节点展开、右键菜单）。
- [ ] `npm run verify:fast` 通过。
