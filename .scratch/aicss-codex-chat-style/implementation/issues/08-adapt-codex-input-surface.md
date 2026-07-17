# 08 — 适配 Codex 输入区呈现

**What to build:** Codex 模式可重排输入区的模型、思考级别、工具预设、附件和发送操作，但发送、中止、重试、命令、快捷键、cwd 与附件限制继续使用现有控制行为。

**Blocked by:** 02 — 提供全局 ChatStyle 切换

**Status:** ready-for-agent

- [ ] Claude 与 Codex 输入区共享同一草稿、附件、命令和发送控制状态，切换时不重置任何输入数据。
- [ ] sending、streaming、disabled、abort 与 retry 行为在两种模式下完全一致。
- [ ] slash command、模型、思考级别、工具预设、cwd 和附件操作保持现有语义与快捷键。
- [ ] textarea 聚焦时左右方向键只移动光标，不触发 ChatStyle 或任何原型方案切换。
- [ ] 320px 下控件可换行且主要操作可达，键盘顺序、可访问名称和可见焦点完整，相关测试与快速验证通过。
