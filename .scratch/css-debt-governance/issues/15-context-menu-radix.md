# 15 — ContextMenu 替换为 Radix ContextMenu

**What to build:** 工作区右键菜单的键盘行为由 `@radix-ui/react-context-menu` 接管（方向键导航、typeahead、Escape/点击外部关闭、禁用态），菜单项与外观与现状一致。

**Blocked by:** 09 — 迁移批：workspace

**Status:** ready-for-agent

- [ ] 方向键/Home/End 导航与类型前导搜索（typeahead）行为正确；禁用项不可触发。
- [ ] Escape 与点击外部关闭；关闭后焦点处理符合 Radix 默认。
- [ ] 视觉逐像素复刻现有 token 样式（背景、hover、边框、阴影）。
- [ ] 文件树右键菜单全流程人工回归。
- [ ] `npm run verify:fast` 通过。
