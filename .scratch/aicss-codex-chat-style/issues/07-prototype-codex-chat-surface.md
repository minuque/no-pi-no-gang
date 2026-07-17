# 原型验证 Codex 聊天面

Type: prototype
Status: resolved
Blocked by: 01, 03, 04, 05, 06

## Question

在真实消息 fixture 下，什么样的 Codex 聊天面密度、层级、动画与响应式行为，既能形成清晰的新风格，又不损害长对话、工具密集场景和可访问性？

## Answer

选择 A「叙事流」作为实现基线：单列内容流、用户消息右对齐气泡、Agent 无气泡正文，thinking 与 tool activity 按事件顺序内联，File Diff 紧随对应 edit/write 活动，输入区固定在内容列底部。保留 A 的宽松正文节奏，不引入 B 的常驻执行侧栏或 C 的终端式元数据标签。

## Comments

- 原型必须覆盖：空闲、等待模型、流式推理、已完成推理、工具运行、工具成功、工具失败、edit/write diff、流式正文、代码块、表格、任务列表、图片、窄屏、暗色、亮色、reduced motion。
- 原型只使用现有消息 fixture，不接入或修改真实 AgentSession。
- 2026-07-17：已建立开发专用路由 `/prototype/codex-chat?variant=a`，通过底部切换器或左右方向键比较 A 叙事流、B 执行台账、C 紧凑转录。
- 2026-07-17：运行命令为 `npm run dev --workspace @no-pi-no-gang/web`；原型在 production 返回 404。
- 2026-07-17：`npm run verify` 通过；Chrome 已验证三版桌面视觉、左右键切换、交互语义与 320/768/1024/1440px 无横向溢出，修复了表格重复 key 告警；此时等待用户选型。
- 2026-07-17：用户选择 A「叙事流」。原型答案已固化；完整原型保留到实现任务创建 throwaway branch 时再捕获，禁止把原型代码直接晋升为生产实现。
