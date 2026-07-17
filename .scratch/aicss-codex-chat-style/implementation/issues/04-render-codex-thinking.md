# 04 — 呈现 Codex Thinking 状态

**What to build:** Codex 模式按真实 thinking block 呈现运行中与完成态：运行时展开，完成后折叠为 Thought 摘要，并允许用户再次展开查看内容。

**Blocked by:** 03 — 呈现 Codex 叙事流基础消息

**Status:** ready-for-agent

- [ ] 运行中的 thinking 默认展开并显示 `Thinking` 与非颜色运行标识，完成后默认折叠。
- [ ] 仅有真实持续时间时显示 `Thought for Ns`，否则显示 `Thought`，不得推断或伪造秒数。
- [ ] 展开状态仅属于当前渲染，不写入 Session，流式更新不抢夺焦点。
- [ ] 展开控件使用原生 button，提供 `aria-expanded`、可见焦点和 reduced-motion 降级。
- [ ] 运行、完成、有无时长及键盘展开场景具有自动化测试，快速验证通过。
