# 01 — Tailwind 刻度映射进 @theme

**What to build:** 全库使用 Tailwind 语义类时，`rounded-sm/md/lg` 与 `text-xs`~`text-3xl` 的渲染值等于 DESIGN.md 设计刻度（圆角 8/12/18px；字号 11.5/13/14/15/18/22/26px），dark/light 两主题表现一致，后续微调只需同步更新 DESIGN.md 与 @theme。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] @theme 中以硬编码值覆盖 radius 与字号刻度（不得 var() 自引用，同名变量会失效），并注释标明与 DESIGN.md 的同步关系。
- [ ] 渲染验证：`rounded-sm`=8px、`rounded-md`=12px、`rounded-lg`=18px；`text-xs`=11.5px、`text-sm`=13px、`text-base`=14px、`text-lg`=15px。
- [ ] tokens-dark.css 与 tokens-light.css 的 radius/字号 token 值核对一致，不一致处修齐。
- [ ] DESIGN.md 增补"Tailwind 刻度 = 设计刻度"注记。
- [ ] `npm run verify:fast` 通过。
