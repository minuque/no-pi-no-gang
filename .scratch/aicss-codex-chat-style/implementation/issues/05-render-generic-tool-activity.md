# 05 — 呈现通用工具 Activity

**What to build:** Codex 模式把真实 toolCall 与 ToolResult 配对成内联 Activity；运行时展开，成功后折叠，失败时保持展开，并让未知或第三方工具安全降级为通用活动。

**Blocked by:** 03 — 呈现 Codex 叙事流基础消息

**Status:** ready-for-agent

- [ ] Activity 严格保留真实 block 顺序，并使用既有工具结果配对逻辑，不复制或改写事件状态。
- [ ] 运行、成功、失败均显示真实工具名、状态与可用输入摘要；失败详情保持展开且可读。
- [ ] 仅有真实时间数据时显示持续时间，未知或第三方工具始终使用通用 Activity。
- [ ] 展开控件具备 `aria-expanded`、可见焦点、非颜色状态文本，并在 reduced motion 下停止非必要动画。
- [ ] 已识别工具、未知工具、缺少结果、成功和失败场景具有自动化测试，快速验证通过。
