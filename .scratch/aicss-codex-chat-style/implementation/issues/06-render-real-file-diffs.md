# 06 — 为 edit/write 呈现真实 File Diff

**What to build:** 当 edit/write Activity 具有真实 diff 数据时，在对应活动后紧随展示 File Diff；数据不完整时安全回退到通用 Activity，不从普通文本猜测差异。

**Blocked by:** 05 — 呈现通用工具 Activity

**Status:** ready-for-agent

- [ ] 只有已确认的 edit/write 工具及真实 diff 数据组合才进入专用 File Diff 呈现。
- [ ] 缺少、无效或无法识别的 diff 数据不会生成虚假差异，并保持通用 Activity 可读。
- [ ] 文件路径、增删行及错误信息使用真实结果，长路径和长行只在 Diff 内部横向滚动。
- [ ] File Diff 的状态、语义与颜色提示具有非颜色替代，键盘与 200% 缩放下内容可达。
- [ ] 有效 diff、缺失 diff、长路径、长行与失败结果具有自动化测试，快速验证通过。
