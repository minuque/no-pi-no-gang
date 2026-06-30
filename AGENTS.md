# AGENTS.md

## 验收标准

提交前必须通过：

类型检查：`node_modules/.bin/tsc --noEmit`
代码检查：`node node_modules/next/dist/bin/next lint`
Dev 验证：使用 dev 模式并固定 7788 端口（项目的默认 dev 端口为 7777，验收时改用 7788 避免冲突）：`node node_modules/next/dist/bin/next dev -p 7788 --hostname 127.0.0.1`

## Agent skills

### Issue tracker

GitHub Issues (`gh` CLI)，不 triage 外部 PR。See `docs/agents/issue-tracker.md`.

### Triage labels

默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文：`CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.

### 设计约束

UI 设计语言与组件美学规范，详见 [`DESIGN.md`](./DESIGN.md)。所有 UI 改动必须遵守其中列出的设计约束（色彩、字体、圆角、阴影、动画、Token 使用等）。
