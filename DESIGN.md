---
version: alpha
name: Pi Agent — VSCode Dark+
description: >
  Developer-tool aesthetic built on the VSCode Dark+ color system.
  Pure neutral-gray surfaces with a single blue accent (#007acc).
  No glow, no gradients, no color-mix — every state gets its own hex value.
colors:
  # ── Surface hierarchy (dark theme default) ──
  bg: "#1a1a1c"
  surface: "#222225"
  surface-raised: "#2a2a2e"
  surface-deep: "#121214"
  # ── Foreground scale ──
  fg: "#d4d4d4"
  fg-2: "#c8c8c8"
  muted: "#a8a8a8"
  meta: "#9a9a9a"
  # ── Accent (VSCode blue) ──
  accent: "#007acc"
  accent-hover: "#0e639c"
  accent-active: "#094771"
  accent-focus: "#007fd4"
  accent-soft: "#094771"
  accent-border: "#264f78"
  accent-on: "#ffffff"
  # ── Borders ──
  border: "#353538"
  border-soft: "#2a2a2d"
  border-muted: "#222225"
  # ── Semantic ──
  success: "#1d9e7a"
  warn: "#cca700"
  danger: "#f44747"
  # ── Component-specific ──
  topnav-bg: "#1e1e20"
  sidebar-bg: "#121214"
  sidebar-expanded-bg: "#222225"
  chatlist-bg: "#222225"
  chatlist-item-hover: "#2a2a2e"
  chatlist-item-active: "#094771"
  msg-user-bg: "#2c2c30"
  msg-user-hover-bg: "#323236"
  code-bg: "#161618"
  code-gutter: "#1e1e20"
  input-area-bg: "#1e1e20"
  input-bg: "#2a2a2e"
  input-border: "#404045"
  input-placeholder: "#767676"
  btn-primary-bg: "#0e639c"
  btn-primary-hover-bg: "#1177bb"
  btn-primary-fg: "#ffffff"
  scrollbar-thumb: "#3a3a3e"
  scrollbar-hover: "#4a4a50"
  selection-bg: "#264f78"
  badge-bg: "#333333"
  badge-fg: "#ffffff"
  tps-high-bg: "#0e2a3d"
  tps-mid-bg: "#0d2f29"
  tps-low-bg: "#332a0d"
  tooltip-bg: "#2a2a2e"
  dropdown-bg: "#2a2a2e"
  dropdown-hover: "#094771"
  modal-bg: "#2a2a2e"
  modal-backdrop: "rgba(0,0,0,0.5)"
  tab-active-bg: "#1a1a1c"
  tab-inactive-bg: "#2a2a2e"
  tab-hover-bg: "#2e2e32"
  link: "#3794ff"
  link-hover: "#3794ff"
  error-fg: "#f77c7c"
  error-bg: "#5a1d1d"
  warn-fg: "#d6b200"
  warn-bg: "#4d3f00"
  info-fg: "#5eaaff"
  info-bg: "#063b5e"
  icon-default: "rgba(255,255,255,0.48)"
  icon-hover: "rgba(255,255,255,0.72)"
  icon-active: "#ffffff"
  icon-active-accent: "#007acc"
  toolbar-hover: "#2a2a2e"
  # ── Background aliases ──
  bg-panel: "#222225"
  bg-hover: "#2a2a2e"
  bg-selected: "#2d3035"
  bg-subtle: "rgba(255,255,255,0.05)"
  # ── Semantic primary ──
  primary: "#007acc"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace'
    fontSize: 14px
    lineHeight: 1.5
  h1:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: 1.35em
    fontWeight: 600
  h2:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: 1.18em
    fontWeight: 600
  text-xs:
    fontSize: 11.5px
  text-sm:
    fontSize: 13px
  text-base:
    fontSize: 14px
  text-lg:
    fontSize: 15px
  text-xl:
    fontSize: 18px
  text-2xl:
    fontSize: 22px
  text-3xl:
    fontSize: 26px
rounded:
  sm: 2px
  md: 4px
  lg: 6px
  pill: 9999px
  msg: 12px
  code: 0px
  input: 0px
  btn: 0px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  12: 48px
  20: 80px
  msg-gap: 24px
  msg-padding: 12px 16px
  paragraph-gap: 14px
components:
  # ── 表面层级 ──
  surface-base:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
  surface-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
  surface-raised-panel:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.fg}"
  surface-deep-panel:
    backgroundColor: "{colors.surface-deep}"
    textColor: "{colors.fg}"
  # ── 文字层级 ──
  text-primary:
    textColor: "{colors.fg}"
  text-secondary:
    textColor: "{colors.fg-2}"
  text-muted:
    textColor: "{colors.muted}"
  text-meta:
    textColor: "{colors.meta}"
  # ── Accent 状态 ──
  accent-default:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
  accent-hover-state:
    backgroundColor: "{colors.accent-hover}"
  accent-active-state:
    backgroundColor: "{colors.accent-active}"
  accent-focus-indicator:
    backgroundColor: "{colors.accent-focus}"
  accent-soft-bg:
    backgroundColor: "{colors.accent-soft}"
  accent-border-line:
    backgroundColor: "{colors.accent-border}"
  # ── 边框 ──
  divider:
    backgroundColor: "{colors.border}"
  divider-soft:
    backgroundColor: "{colors.border-soft}"
  divider-muted:
    backgroundColor: "{colors.border-muted}"
  # ── 语义色 ──
  status-success:
    backgroundColor: "{colors.success}"
  status-warn:
    backgroundColor: "{colors.warn}"
  status-danger:
    backgroundColor: "{colors.danger}"
  # ── 顶部导航 ──
  topnav:
    backgroundColor: "{colors.topnav-bg}"
  # ── 侧栏 ──
  sidebar:
    backgroundColor: "{colors.sidebar-bg}"
    textColor: "{colors.fg}"
  sidebar-expanded:
    backgroundColor: "{colors.sidebar-expanded-bg}"
  sidebar-icon:
    backgroundColor: "{colors.icon-default}"
  sidebar-icon-hover:
    backgroundColor: "{colors.icon-hover}"
  sidebar-icon-active:
    backgroundColor: "{colors.icon-active}"
  sidebar-icon-active-accent:
    backgroundColor: "{colors.icon-active-accent}"
  # ── 对话列表 ──
  chatlist:
    backgroundColor: "{colors.chatlist-bg}"
  chatlist-item-hover:
    backgroundColor: "{colors.chatlist-item-hover}"
  chatlist-item-active:
    backgroundColor: "{colors.chatlist-item-active}"
  # ── 消息气泡 ──
  msg-bubble-user:
    backgroundColor: "{colors.msg-user-bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.msg}"
    padding: 12px 16px
  msg-bubble-user-hover:
    backgroundColor: "{colors.msg-user-hover-bg}"
  msg-bubble-agent:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
  # ── 代码块 ──
  code-block:
    backgroundColor: "{colors.code-bg}"
    rounded: "{rounded.code}"
  code-block-gutter:
    backgroundColor: "{colors.code-gutter}"
  # ── 输入框 ──
  input-area:
    backgroundColor: "{colors.input-area-bg}"
  input-field:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.input}"
  input-field-border:
    backgroundColor: "{colors.input-border}"
  input-placeholder:
    backgroundColor: "{colors.input-placeholder}"
  # ── 按钮 ──
  button-primary:
    backgroundColor: "{colors.btn-primary-bg}"
    textColor: "{colors.btn-primary-fg}"
    rounded: "{rounded.btn}"
  button-primary-hover:
    backgroundColor: "{colors.btn-primary-hover-bg}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.fg}"
    rounded: "{rounded.btn}"
  # ── 链接 ──
  link:
    backgroundColor: "{colors.link}"
  link-hover:
    backgroundColor: "{colors.link-hover}"
  # ── 滚动条 ──
  scrollbar:
    backgroundColor: "{colors.scrollbar-thumb}"
  scrollbar-hover:
    backgroundColor: "{colors.scrollbar-hover}"
  # ── 选中文字 ──
  selection:
    backgroundColor: "{colors.selection-bg}"
  # ── 工具栏 ──
  toolbar-button-hover:
    backgroundColor: "{colors.toolbar-hover}"
  # ── 弹窗/下拉/模态 ──
  dropdown:
    backgroundColor: "{colors.dropdown-bg}"
    rounded: "{rounded.md}"
  dropdown-item-hover:
    backgroundColor: "{colors.dropdown-hover}"
  modal:
    backgroundColor: "{colors.modal-bg}"
    rounded: "{rounded.lg}"
  modal-backdrop:
    backgroundColor: "{colors.modal-backdrop}"
  tooltip:
    backgroundColor: "{colors.tooltip-bg}"
  # ── Tab 切换 ──
  tab-active:
    backgroundColor: "{colors.tab-active-bg}"
  tab-inactive:
    backgroundColor: "{colors.tab-inactive-bg}"
  tab-hover:
    backgroundColor: "{colors.tab-hover-bg}"
  # ── Badge ──
  badge:
    backgroundColor: "{colors.badge-bg}"
    textColor: "{colors.badge-fg}"
    rounded: "{rounded.pill}"
  # ── TPS 速率 Badge ──
  tps-badge-high:
    backgroundColor: "{colors.tps-high-bg}"
  tps-badge-mid:
    backgroundColor: "{colors.tps-mid-bg}"
  tps-badge-low:
    backgroundColor: "{colors.tps-low-bg}"
  # ── 表单校验 ──
  form-error:
    backgroundColor: "{colors.error-bg}"
    textColor: "{colors.error-fg}"
  form-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-fg}"
  form-info:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.info-fg}"
  # ── 背景别名（兼容旧组件） ──
  panel:
    backgroundColor: "{colors.bg-panel}"
  panel-hover:
    backgroundColor: "{colors.bg-hover}"
  panel-selected:
    backgroundColor: "{colors.bg-selected}"
  panel-subtle:
    backgroundColor: "{colors.bg-subtle}"
---

## Overview

Pi Agent 的视觉语言：**VSCode Dark+ 同源色板 · 纯中性灰表面 · 蓝色单 accent · 零光效零渐变**。

- **色板**: VSCode Dark+/Light+ 同源，中性灰 R=G=B，不偏蓝不暖
- **层级**: 纯靠亮度差区分三层表面 (editor → sidebar → tab)，不靠色调
- **Accent**: `#007acc` 仅状态栏/链接/按钮/选中态，全界面 ≤2 处可见
- **克制**: 无 glow、无渐变、无 `color-mix`，每种状态独立色值
- **反馈**: hover/active 瞬时切换，≤120ms，不拖动画
- **布局**: 三栏 — ActivityBar 48px → ChatList 280px → 聊天区 剩余宽度 (max 820px) → 文件面板 (默认 42vw)

## Colors

### Dark Theme (默认)

色彩系统完全映射 VSCode Dark+ 原生色板：

| CSS Token | 色值 | VSCode 映射 |
|-----------|------|------------|
| `--bg` | `#1a1a1c` | editor.background |
| `--surface` | `#222225` | sideBar.background |
| `--surface-raised` | `#2a2a2e` | tab.inactiveBackground |
| `--surface-deep` | `#121214` | activityBar.background |
| `--fg` | `#d4d4d4` | editor.foreground |
| `--fg-2` | `#c8c8c8` | 次要文字 |
| `--muted` | `#a8a8a8` | 三级/说明 |
| `--meta` | `#9a9a9a` | placeholder |
| `--accent` | `#007acc` | statusBar.background |
| `--accent-hover` | `#0e639c` | button.background |
| `--accent-active` | `#094771` | list.activeSelectionBackground |
| `--accent-focus` | `#007fd4` | focusBorder |
| `--success` | `#1d9e7a` | terminal ANSI bright green |
| `--warn` | `#cca700` | editorWarning.foreground |
| `--danger` | `#f44747` | editorError.foreground |
| `--border` | `#353538` | panel.border |

### Light Theme

冷调白底 (R=G, B 偏多 2–9 通道)，accent `#007acc` 跨主题不变。详见 `app/theme/tokens-light.css`。

## Typography

**字体栈**: UI `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`；等宽 `"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace`。基准 15px，`antialiased` + `grayscale` 平滑。

**字号体系**: `text-xs` 11.5px → `text-sm` 13px → `text-base` 14px → `text-lg` 15px → `text-xl` 18px → `text-2xl` 22px → `text-3xl` 26px。

**排版规则**: 行高 1.6 (正文) / 1.3 (紧凑)，段落间距 14px，标题 weight 600 (不用 700+)，`tabular-nums` 数字对齐。

**Markdown 消息** (`.markdown-body`: 15px, line-height 1.65):
- h1–h4: weight 600, 18px top / 6px bottom margin
- 段落: `0 0 14px`, `text-wrap: pretty`
- 列表: left-padding 1.5em, li 间距 4px
- 引用块: 左 `--accent-border` 3px solid + `--bg-subtle` 底 + 圆角 6px
- 内联代码: `--bg-subtle` 底, 0.9em, 圆角 3px, padding 5px
- 表格: 13px, 斑马纹, 圆角 6px
- 链接: `--accent` 色, underline-offset 2px

## Layout

4px 基础单位间距系统：4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 80px。

**三栏布局**: 侧栏 (48px 收起 / 240px 展开) → 对话列表 (280px) → 聊天区 (≥320px, max 820px) → 文件面板 (默认 42vw)。拖拽柄 12px，面板宽度 localStorage 持久化。

## Elevation & Depth

主靠色值分层，几乎不用阴影：
- `--elev-flat`: none (默认)
- `--elev-ring`: `0 0 0 1px var(--border)` (边框替代阴影)
- `--elev-raised`: `0 2px 8px rgba(0,0,0,0.36)` dark / `0 2px 8px rgba(0,0,0,0.08)` light (弹窗/下拉)

**Z-index**: `0 → dropdown(100) → sidebar(200) → overlay(500) → modal(1000) → toast(2000) → debug(99999)`

**焦点环**: 1px solid `--accent-focus`，不 blur。

## Shapes

VSCode 式克制圆角：
- `--radius-sm`: 2px (输入框/按钮)
- `--radius-md`: 4px (下拉)
- `--radius-lg`: 6px (消息气泡/表格/面板)
- `--radius-pill`: 9999px (badge, 极少用)

**例外**: 消息气泡 12px，代码块/输入框/按钮 0 圆角。

## Components

### 消息气泡
- **用户**: `#2c2c30` 底, 无可见边框, 右对齐 max-width 85%, 圆角 12px, padding 12px 16px
- **Agent**: 主底色纯文本, 左侧 2px `--accent` solid
- **工具调用**: `#222225` 底, 左 accent 条纹
- **间隔**: 24px

### 代码块
背景 `#161618`, 边框 1px solid `--border`, 行号列 `#1e1e20`, 左 2px accent stripe, JetBrains Mono + `tabular-nums`。

### 输入框
常态 `#2a2a2e` / 1px solid `#404045`; 聚焦 1px solid `--accent-focus` + `0 0 0 3px rgba(0,127,212,0.22)`; 流式中光环变红。

### 按钮
- **主按钮**: `#0e639c` 底 / `#ffffff` 字, hover `#1177bb`
- **次按钮**: 透明底 / 1px solid `--border`
- **图标按钮**: 透明底, hover `#2a2a2e`, 28–32px

### 侧栏图标 (ActivityBar)
未激活 rgba(255,255,255,0.48) → Hover rgba(255,255,255,0.72) → 激活 #ffffff → 备选蓝 `--accent`。尺寸 20px。

### 对话列表项
Hover `#2a2a2e` → 激活 `#094771` (深蓝底) → 失焦选中 `#37373d`。

### 文件树
条目 hover: rgba 白 4% 暗底; 选中: `--bg-selected`。图标纯 SVG 线描, `--text-dim`, 14px。

### 滚动条
4px thin, thumb `#3a3a3e` 圆角 2px, hover `#4a4a50`, track 透明。

### Thinking Level 标签
独立色: off→`--text-dim`, minimal→`#6b7280`, low→`#60a5fa`, medium→`#a78bfa`, high→`#f472b6`, xhigh→`#fb923c`。

### TPS 速率 Badge
≥50 t/s→深蓝底+accent 蓝字, 20–50→深绿底+success 绿字, <20→深琥珀底+warn 琥珀字。

### 模态/设置面板
底 `#2a2a2e` (dark) / `#ffffff` (light), 遮罩 `rgba(0,0,0,0.5)` / `rgba(0,0,0,0.28)`。

### Tab 切换
激活: `#1a1a1c` 底 + 顶部 accent 边线; 非激活: `#2a2a2e`; Hover: `#2e2e32`。

### 表单校验
Error: `#f77c7c` fg / `#5a1d1d` bg; Warn: `#d6b200` fg / `#4d3f00` bg; Info: `#5eaaff` fg / `#063b5e` bg。

### 动画
- `--motion-fast`: 80ms (hover 切换)
- `--motion-base`: 120ms (组件进出)
- `--ease-standard`: ease-out
- 主题切换: View Transitions API 280ms crossfade
- 消息入场: 0.4s ease, translateY(16px) + opacity
- NProgress: speed 400ms, trickleSpeed 200ms, minimum 0.08

### View Transitions
全局 `experimental.viewTransition: true`:
- `.vt-fade-out` / `.vt-fade-in`: 淡入淡出 280ms
- `.vt-slide-down` / `.vt-slide-up`: 垂直滑入 300ms
- `.vt-nav-forward` / `.vt-nav-back`: 方向导航
- `settings-overlay`: scale + fade
- `workspace-panel`: slide + fade

## Do's and Don'ts

**Do:**
1. 优先复用 `--ui-*` CSS token，不从零定义新色
2. 新色从 VSCode 原生色板取
3. Dark/Light 双主题同步提供变量
4. 引用 CSS 变量，不写死 inline style
5. 交互态 (hover/active/focus/disabled) 全定义

**Don't:**
1. 不用 glow / 渐变 / `color-mix` — 每种状态独立色值
2. Accent 蓝 ≤2 处可见 — 主要 action + 选中态
3. 圆角 ≤6px (消息气泡例外 12px)
4. 过渡 ≤120ms
5. 字体 weight ≤600 (不用 700+)
6. 中性灰必须 R=G=B
7. 焦点环 1px solid，不 blur
