# 12 — 轻玻璃：顶部导航与输入区

**What to build:** 顶部导航与输入区获得轻玻璃质感（backdrop-blur + 高 alpha 半透明底色 + 1px 极淡边框），滚动时内容从表面下方穿过且文字保持可读；弹层、侧栏等其余表面保持实色。

**Blocked by:** 10 — 迁移批：workbench/shared（迁移批收官）

**Status:** ready-for-agent

- [ ] glass 相关 token 新增于 DESIGN.md 的 topnav/input 分组下，dark/light 两主题均有值（alpha 约 0.7~0.85）。
- [ ] 仅顶部导航与输入区两处使用 backdrop-blur；dropdown/tooltip/modal/侧栏确认保持实色。
- [ ] 玻璃区域文字对比度人工检查达标（含滚动内容穿过时）。
- [ ] 相关规范同步进 DESIGN.md"玻璃"章节（配方 + 禁用范围）。
- [ ] `npm run verify:fast` 通过。
