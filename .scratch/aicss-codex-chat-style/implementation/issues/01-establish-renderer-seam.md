# 01 — 建立双 Renderer 接缝并固化原型证据

**What to build:** 在不改变 Claude 聊天外观与行为的前提下，为同一标准化消息视图建立可选择的 Claude/Codex Renderer 接缝，并先把一次性原型完整保存在 throwaway branch，记录分支指针与选择 A「叙事流」的依据。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 原型代码在产品实现开始前已完整保存到 throwaway branch，票据记录可追溯的分支指针与 A 胜出原因。
- [ ] 同一消息、工具结果、流式状态与输入控制数据可传给独立 Renderer，且不复制 AgentSession、AgentEvent 或 PiCommand 状态。
- [ ] Claude Renderer 仍是唯一默认路径，现有结构、视觉、快捷键与交互保持不变。
- [ ] Codex 聊天区需要的作用域 token 与双模式边界先写入设计契约，不修改全局主题 token。
- [ ] 新接缝具有覆盖默认 Claude 路径与 Renderer 选择的自动化测试，快速验证通过。
