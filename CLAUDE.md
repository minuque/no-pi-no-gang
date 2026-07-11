# AGENTS.md

## 验收标准

### 每次改动后（快速循环，<10s）

```
node_modules/.bin/tsc --noEmit          # 零 error
node node_modules/next/dist/bin/next lint  # 零 error + warning
```
### 提交前（最终闸门）

```
node node_modules/next/dist/bin/next build  # 生产构建，捕获 dev 模式遗漏的 SSR/动态 import 错误
```

## UI / 设计系统规则

所有视觉与组件改动必须遵循 [DESIGN.md](DESIGN.md)。
做改动前请先检查 DESIGN.md 是否已覆盖对应组件/状态，并优先复用现有 CSS token，避免新增一次性颜色。

## Agent skills

### Issue tracker

Issues tracked as GitHub issues on `minuque/no-pi-no-gang`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five‑role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single‑context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
