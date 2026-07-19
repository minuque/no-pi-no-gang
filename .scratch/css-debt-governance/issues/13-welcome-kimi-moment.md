# 13 — 欢迎区 KIMI 时刻（品牌标志 + 输入框形变）

**What to build:** 空状态欢迎区获得"有性格"且连续的体验：pi logo 从静态图片变为会动的小标志（待机微动效、随 Agent 状态联动），打字机文案保留；发送首条消息时，居中的输入框连续形变沉底 dock，而非布局跳切。

**Blocked by:** 11 — 动效词汇表与存量 keyframes 审计

**Status:** ready-for-agent

- [ ] pi logo 内联 SVG 化，待机/思考等状态有克制微动效，时长/缓动对齐动效词汇表。
- [ ] 存量 vt-* View Transitions 的覆盖范围盘点并记录结论于本票 Comments，能复用则不重复造轮。
- [ ] `motion` 以懒加载方式引入，仅用于欢迎区输入框 morph 与 logo 弹性，不进入首屏 chunk；用法约束写入 DESIGN.md"依赖使用约束"。
- [ ] 欢迎区 → 对话态的输入框过渡连续无形变跳变；`prefers-reduced-motion` 下退化为无动画切换。
- [ ] 各状态（待机/输入/发送/流式）人工回归；`npm run verify:fast` 通过。
