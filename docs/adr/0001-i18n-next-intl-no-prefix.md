# ADR-0001: 国际化方案 — next-intl 纯客户端

**日期**: 2026-06-28
**状态**: accepted

---

## 背景

项目目前所有 UI 字符串硬编码英文，需要支持中英双语切换。项目是类 IDE 桌面应用（单页 CSR、query param 管理 session 状态），不是内容站点。

## 决策

### 1. 使用 next-intl（纯客户端模式）

选择 `next-intl`（`@amannn/next-intl`）但 **只用其客户端 API**，不走 middleware/server plugin 路线。

**为什么纯客户端而非 server-side**：
- 项目是纯 CSR 应用（`app/page.tsx` 标记 `"use client"`，无 SSR）
- next-intl 的 middleware/plugin 管道为 SSR/SSG 设计，在 CSR 下徒增复杂度
- next-intl 4.13.0 + Next.js 16 + Turbopack 组合下 `localePrefix: 'never'` 存在已知 bug（middleware 仍改写 URL 导致 404）
- 客户端方案无需 middleware、无需 next.config plugin、无路由耦合

**实现**：
- `I18nProvider` 组件在 layout 层包裹所有 children
- 动态 import 当前 locale 的 JSON（`import(\`../messages/${locale}.json\`)`），只打包用户使用的语言
- 检测优先级：`localStorage("pi-locale")` → `navigator.language` → `"en"`

**代价**：无。动态 import 确保只有激活的语言文件进入 bundle。

### 2. 不用 URL 前缀

URL 结构不变（始终 `/?session=abc`）。语言是用户偏好，不是内容变体。

### 3. localStorage 持久化语言选择

- 用户手动切换时写 `localStorage("pi-locale")`
- 同时写同名 cookie（供 API 路由将来读取）
- 切换后 `window.location.reload()` 使新语言生效

### 4. 开发者技术术语不翻译

以下类别保持英文原文：
- 配置面板字段：`Base URL`、`API Key`、`Model ID`、`Provider`
- 命令源标签：`EXT`、`CMD`、`SKILL`
- 文件扩展名图标：`TS`、`JS`、`PY` 等
- 工具/Agent 相关术语：`tool`、`skill`、`model`、`command`
- 第三方组件文本：`nprogress` 加载条、`sonner` toast

### 5. 翻译文件按组件 namespace 组织

```
messages/
├── en.json    # { "AppShell": {...}, "SessionSidebar": {...}, ... }
└── zh.json    # 同上结构
```

## 替代方案

### next-intl server-side 方案
- 被放弃：Next.js 16 proxy 下 `localePrefix: 'never'` bug 导致 `/` 被 rewrite 到 `/zh`，404
- workaround（手动删 rewrite header）脆弱，不采纳

### react-i18next
- 更通用但 API 不如 next-intl 简洁
- 放弃理由：next-intl 的 `useTranslations` + ICU 更顺手

### 自定义轻量方案
- 体积最小（~0.5KB）
- 放弃理由：~8KB next-intl 换来 ICU 复数/格式化 + 类型安全，值得

## 影响

- `components/I18nProvider.tsx` — 新增，客户端 Provider
- `components/LocaleSwitcher.tsx` — 语言切换按钮
- `app/layout.tsx` — 用 `I18nProvider` 包裹，保持同步组件
- `messages/en.json` + `messages/zh.json` — 翻译文件
- 所有组件用 `useTranslations()` 替代硬编码英文字符串
- **无** middleware、proxy、next.config plugin 改动
