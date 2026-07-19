# 11 — 动效词汇表与存量 keyframes 审计

**What to build:** DESIGN.md 新增"动效"章节：统一的时长/缓动档位与"Agent 状态 → 动效"映射表；globals.css 存量 24 个 keyframes 按词汇表审计收敛，动效从此有规范可依。

**Blocked by:** 10 — 迁移批：workbench/shared（迁移批收官）

**Status:** ready-for-agent

- [ ] 时长档位、缓动曲线写入 DESIGN.md，与既有 `--motion-fast/--motion-base/--ease-standard` token 对齐或取代之。
- [ ] 六态映射表写入 DESIGN.md：思考=呼吸脉冲；工具=块内指示；流式=文字不动只留光标/末尾指示；状态切换=连续过渡；完成=一次性 settle；错误=零动效走色彩/图标。两原则（动效=信号、同一时刻最多一个活跃焦点）一并记录。
- [ ] 24 个存量 keyframes 逐一审计：保留者对齐时长/缓动档位，删除者无引用残留；审计结论记录于本票 Comments。
- [ ] `prefers-reduced-motion` 覆盖所有保留动效。
- [ ] 各页面人工回归无视觉破损；`npm run verify:fast` 通过。
