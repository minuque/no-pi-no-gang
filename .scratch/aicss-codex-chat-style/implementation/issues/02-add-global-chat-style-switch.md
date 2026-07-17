# 02 — 提供全局 ChatStyle 切换

**What to build:** 用户可从聊天区右上工具栏在 Claude 与 Codex 之间切换；该选择作为全局 UI 偏好即时影响所有 Session，并在刷新后恢复，同时绝不进入会话或 Agent 请求数据。

**Blocked by:** 01 — 建立双 Renderer 接缝并固化原型证据

**Status:** ready-for-agent

- [ ] 无既有偏好、升级用户及存储值无效时均使用 Claude，且不会仅因默认值写入持久化存储。
- [ ] 用户主动选择后持久化 `claude | codex`，当前及其他 Session 无需重载即可使用同一模式。
- [ ] 右上入口清楚显示当前模式，可用键盘操作，具有可访问名称、可见焦点与非颜色选中状态。
- [ ] 切换不丢失滚动锚点、输入草稿、附件、流式状态或当前 Session 数据。
- [ ] ChatStyle 不进入 Agent 请求、Session 元数据、JSONL、后端 API 或发布协议，相关自动化测试与快速验证通过。
