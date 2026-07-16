# AGENTS.md

## 包分层与发布单元

本仓是单一 CLI 产品的 monorepo，**发布单元是根包** `@minuque/no-pi-no-gang`，通过 `npm publish` 从根包打出包含所有子包产物的 tarball。apps/packages 下的子包全部 `private`、版本 0.0.0，是**内部拆分**，不独立发版。

- `packages/agent-protocol` — 纯协议类型/常量，被 runtime-pi、agent-host 共享。
- `packages/runtime-pi` — pi SDK 适配层；持有 `@earendil-works/pi-*` 依赖。
- `apps/agent-host` — HTTP 后端进程，web 通过 BFF 代理与之通信。
- `apps/web` — Next.js 前端，产物 bundle 进 `.next`，运行时外部依赖仅 `next` 本体。
- `apps/cli` — 进程入口，spawn agent-host + web；通过运行时符号链接 (`ensureWorkspaceLinks`) 接入内部包。

因此根包 `dependencies` 只保留**发布运行时刚需**（当前为 `next` + 两个 `@earendil-works/pi-*`）：web 的前端依赖由 web 包自行声明，不得提升到根包。改根包依赖或子包运行时 import 后，必须跑 `npm run pack:smoke` 确认 tarball 安装后可正常启动——这是"根包发布"模式的核心约束。

## 验收标准

### 每次改动后（快速循环，<10s）

```
npm run verify:fast  # 类型、Lint（零 warning）、单元测试
```

### 低复杂度小任务

不影响发布链路的低复杂度小变动，只需运行 `npm run verify:fast`，无需运行冒烟测试。

### 提交前（最终闸门）

```
npm run verify  # 格式、设计规范、快速检查、Turbopack 生产构建及 postbuild
```

### 发布前（发布闸门）

```
npm run verify:release  # 完整检查、生产 E2E、npm tarball 安装及 CLI smoke
```

## UI / 设计系统规则

所有视觉与组件改动必须遵循 [DESIGN.md](DESIGN.md)。
做改动前请先检查 DESIGN.md 是否已覆盖对应组件/状态，并优先复用现有 CSS token，避免新增一次性颜色。
