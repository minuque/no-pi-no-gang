# 16 — 闸门与收官

**What to build:** 设计规范与工具链收口，防止 CSS 债务再生：lint 闸门挡住新增内联样式，DESIGN.md 完成去 YouTube 化并收齐全部新章节。

**Blocked by:** 12 — 轻玻璃：顶部导航与输入区；13 — 欢迎区 KIMI 时刻；14 — SessionSearchDialog 替换为 Radix Dialog；15 — ContextMenu 替换为 Radix ContextMenu

**Status:** ready-for-agent

- [ ] eslint 规则禁止新增静态 style prop（动态值场景需显式豁免注释）；规则选型与误报处理记录于本票 Comments。
- [ ] 全库 `style={{}}` 剩余 < 50 处，且逐一确认为运行时动态值。
- [ ] globals.css 收敛为 token 三件套（@theme/dark/light）+ reset + keyframes + 少数全局模式。
- [ ] DESIGN.md 去除"YouTube Dark"定位并改名（YouTube/KIMI 参照降为注记），动效词汇表、玻璃规范、依赖使用约束（motion 限欢迎区/品牌时刻；Radix 限替换清单+触发式）三章齐备。
- [ ] CLAUDE.md 增补"新代码一律 Tailwind"。
- [ ] `npm run verify` 通过（提交前闸门）。
