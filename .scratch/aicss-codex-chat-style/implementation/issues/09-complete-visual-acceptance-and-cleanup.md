# 09 — 完成视觉验收与原型清理

**What to build:** 对完整 Codex 聊天面完成亮暗主题、响应式、reduced motion、无障碍和 Claude 零回归验收；保存规格要求的截图证据，删除主实现中的一次性原型入口与未选方案。

**Blocked by:** 04 — 呈现 Codex Thinking 状态；06 — 为 edit/write 呈现真实 File Diff；07 — 适配 Markdown 与图片内容；08 — 适配 Codex 输入区呈现

**Status:** ready-for-agent

- [ ] 同一 fixture 覆盖空闲、等待、流式与完成正文、thinking、工具运行/成功/失败、File Diff、Markdown 和图片，并保存亮暗主题截图。
- [ ] 320、768、1024、1440px 与 200% 缩放无页面横向溢出、遮挡或不可达主要操作。
- [ ] reduced motion、键盘流、可见焦点、状态文本、live region 与 WCAG 2.1 AA 要求通过实际检查。
- [ ] Claude 同 fixture 回归基线不变，Claude/Codex 往返切换不丢消息、滚动锚点、草稿、附件或流式状态。
- [ ] 控制台无新增警告或错误；一次性原型路由、B/C 方案和 variant switcher 已从主实现删除。
- [ ] 快速验证与最终验证全部通过；仅在发布运行时依赖或 import 发生变化时追加发布验证。
