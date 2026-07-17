# AGENTS.md

## 验收标准

### 每次代码变更改动后，文档类除外

```Shell
npm run verify:fast  # 类型、Lint（零 warning）、单元测试
```

### 低复杂度小任务

不影响发布链路的低复杂度小变动，只需运行 `npm run verify:fast`，无需运行冒烟测试。

### 提交前（最终闸门）

```Shell
npm run verify  # 格式、设计规范、快速检查、Turbopack 生产构建及 postbuild
```

### 发布前（发布闸门）

```Shell
npm run verify:release  # 完整检查、生产 E2E、npm tarball 安装及 CLI smoke
```

## UI / 设计系统规则

所有视觉与组件改动必须遵循 [DESIGN.md](DESIGN.md)。
做改动前请先检查 DESIGN.md 是否已覆盖对应组件/状态，并优先复用现有 CSS token，避免新增一次性颜色。

## Agent skills

### Issue tracker

Issues tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five‑role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single‑context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
