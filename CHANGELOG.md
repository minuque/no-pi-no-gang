# Changelog

本文件记录项目所有值得注意的变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 分类。

## [Unreleased]

### Changed

- **lib/types** 按域拆分为三个独立模块：`message-types.ts`（消息内容块）、`session-types.ts`（持久化结构）、`rpc-types.ts`（传输状态 + UI 树）。原 `lib/types.ts` 保留为 barrel re-export，现有导入路径不破坏。
- **lib/pi/pi-command-dispatcher.ts** 从 `lib/rpc-manager.ts` 的 `send()` 抽取 17 个独立命令 handler + `piCommandHandlers` dispatch table。`send()` 由 250 行 switch 降为查表分发。
- **app/api/skills/search/route.ts** 解析逻辑迁移到 `parser.ts`，路由只做协调。
- **lib/npx.ts** 导出 `findNpxCli` 供测试使用。

### Added

- **测试基础设施**：新增 `vitest.config.ts` + `package.json` 的 `test` 脚本（`vitest run`）。
- **`tests/` 目录**：4 个测试文件 16 个测试用例，覆盖 `dedupeSlashCommands`、`getProjectResourceLoaderOptions`、`findNpxCli`、`formatInstalls`/`parseInstallCount`/`parseSearchOutput`、类型结构验证。
- **app/api/skills/search/parser.ts** skills search CLI 输出解析器，纯函数模块，可独立测试。
- **.claude/skills/check-changelog/** 根据 diff 自动分类变更并更新 CHANGELOG 的 skill。
- **CHANGELOG.md** 项目变更日志，Keep a Changelog 格式 + Conventional Commits 分类。

## [0.0.7] - 2026-07-02

### Added
- 侧边栏 Header 优化的三点菜单 + SSE 状态灯
- 客户端 i18n（中/英），通过 `next-intl` 实现
- 选中文本右下角「添加到对话」按钮
- View Transitions API 集成（Settings 面板动画 + CSS 配方）
- DESIGN.md 设计语言文档

### Changed
- 重构 MessageView 消息布局（BlockLine 统一连线 + 独立 ToolCallBlock）
- UI 审计改进：字体/阴影/交互/代码质量/欢迎页
- 统一文档中版本号、端口说明，完善 TODO.md 事件类型和分阶段计划
- 新增 dev-watchdog 内存监控 + prebuild 重命名

### Fixed
- 选中代码块文本后选区高亮丢失
- SSE 状态重复推送导致 AppShell 无限重渲染
- dev 缓存策略优化

### Performance
- Vercel React Best Practices 审计修复（9 项）
