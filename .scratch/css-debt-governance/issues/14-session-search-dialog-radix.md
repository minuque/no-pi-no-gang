# 14 — SessionSearchDialog 替换为 Radix Dialog

**What to build:** 会话搜索对话框的焦点管理、Escape、键盘交互由 `@radix-ui/react-dialog` 接管（焦点陷阱、关闭后焦点归还触发元素），外观与搜索/选择流程与现状一致。

**Blocked by:** 06 — 迁移批：session 分支/搜索/工具面板

**Status:** ready-for-agent

- [ ] 打开后焦点进入对话框且 Tab 在内部循环；关闭后焦点归还触发元素；Escape 关闭。
- [ ] 视觉逐像素复刻现有 token 样式（背景、边框、阴影、圆角、backdrop）。
- [ ] 打开 → 搜索 → 键盘选择会话全流程人工回归。
- [ ] `npm run verify:fast` 通过。
