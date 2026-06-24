# CLAUDE.md

## 快速开始

类型检查：`node_modules/.bin/tsc --noEmit`
代码检查：`node node_modules/next/dist/bin/next lint`

### 验收标准

提交前必须通过：

```bash
bun run build
```

## Agent skills

### Issue tracker

GitHub Issues (`gh` CLI)，不 triage 外部 PR。See `docs/agents/issue-tracker.md`.

### Triage labels

默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文：`CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.