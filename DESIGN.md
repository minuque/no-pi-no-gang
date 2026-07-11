---
version: alpha
name: Pi Agent — YouTube Dark
 description: >
  YouTube 网页端深色设计语言：深黑底 #0f0f0f、大圆角 8–18px、Roboto 字体、
  卡片阴影与 hover 抬升。Accent 保留原项目蓝色 #007acc。
colors:
  # ── Surface hierarchy (dark theme default) ──
  bg: "#0f0f0f"
  surface: "#1a1a1a"
  surface-raised: "#212121"
  surface-deep: "#0f0f0f"
  # ── Foreground scale ──
  fg: "#f1f1f1"
  fg-2: "#e6e6e6"
  muted: "#aaaaaa"
  meta: "#717171"
  # ── Accent (retained project blue) ──
  accent: "#007acc"
  accent-hover: "#0e639c"
  accent-active: "#094771"
  accent-focus: "#007fd4"
  accent-soft: "#094771"
  accent-border: "#264f78"
  accent-on: "#ffffff"
  # ── Borders ──
  border: "#303030"
  border-soft: "#1f1f1f"
  border-muted: "#181818"
  # ── Semantic ──
  success: "#2ba640"
  warn: "#f9a825"
  danger: "#ff4d4f"
  # ── Component-specific ──
  topnav-bg: "#0f0f0f"
  sidebar-bg: "#1a1a1a"
  sidebar-expanded-bg: "#1a1a1a"
  chatlist-bg: "#1a1a1a"
  chatlist-item-hover: "#212121"
  chatlist-item-active: "rgba(255,255,255,0.15)"
  msg-user-bg: "#212121"
  msg-user-hover-bg: "#2a2a2a"
  code-bg: "#141414"
  code-gutter: "#181818"
  input-area-bg: "#0f0f0f"
  input-bg: "#212121"
  input-border: "#303030"
  input-placeholder: "#717171"
  btn-primary-bg: "#007acc"
  btn-primary-hover-bg: "#0e639c"
  btn-primary-fg: "#ffffff"
  scrollbar-thumb: "#4a4a4a"
  scrollbar-hover: "#606060"
  selection-bg: "#264f78"
  badge-bg: "#212121"
  badge-fg: "#f1f1f1"
  tps-high-bg: "#0e2a3d"
  tps-mid-bg: "#0d2f29"
  tps-low-bg: "#332a0d"
  tooltip-bg: "#212121"
  dropdown-bg: "#212121"
  dropdown-hover: "rgba(255,255,255,0.1)"
  modal-bg: "#212121"
  modal-backdrop: "rgba(0,0,0,0.6)"
  tab-active-bg: "#0f0f0f"
  tab-inactive-bg: "#212121"
  tab-hover-bg: "#1a1a1a"
  link: "#4dabf7"
  link-hover: "#74c0fc"
  error-fg: "#ff8787"
  error-bg: "#3a1212"
  warn-fg: "#ffd43b"
  warn-bg: "#332a0d"
  info-fg: "#74c0fc"
  info-bg: "#0a2540"
  icon-default: "rgba(255,255,255,0.55)"
  icon-hover: "rgba(255,255,255,0.87)"
  icon-active: "#ffffff"
  icon-active-accent: "#007acc"
  toolbar-hover: "#212121"
  # ── Background aliases ──
  bg-panel: "#1a1a1a"
  bg-hover: "#212121"
  bg-selected: "rgba(255,255,255,0.15)"
  bg-subtle: "rgba(255,255,255,0.05)"
  # ── Semantic primary ──
  primary: "#007acc"
typography:
  body:
    fontFamily: 'Roboto, "YouTube Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace'
    fontSize: 14px
    lineHeight: 1.5
  h1:
    fontFamily: 'Roboto, "YouTube Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
    fontSize: 1.35em
    fontWeight: 600
  h2:
    fontFamily: 'Roboto, "YouTube Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
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
  sm: 8px
  md: 12px
  lg: 18px
  pill: 9999px
  msg: 18px
  code: 12px
  input: 8px
  btn: 8px
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
  msg-padding: 14px 18px
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
    padding: 14px 18px
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
    backgroundColor: "{colors.surface-raised}"
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
    rounded: "{rounded.md}"
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

视觉语言：**YouTube 网页端深色设计语言 · 深黑底 · 大圆角 · Roboto 字体 · 卡片阴影 · hover 抬升**。

- **色板**: 背景 #0f0f0f，surface #1a1a1a，raised #212121，前景 #f1f1f1
- **层级**: 靠亮度差 + 阴影区分，surface/raised/deep 三层
- **Accent**: `#007acc` 保留原项目蓝色，用于主要 action + 选中态
- **字体**: Roboto 用于 UI，JetBrains Mono 用于代码
- **圆角**: 按钮/输入框 8px，卡片/下拉 12px，消息气泡 18px
- **阴影**: 卡片使用 `0 4px 12px rgba(0,0,0,0.5)`，hover 抬升
- **反馈**: hover 200ms，active scale(0.98)
- **布局**: 顶部 Header 56px → 左侧 collapsible sidebar (72px/240px) → 主内容区

## Colors

### Dark Theme (默认)

| CSS Token | 色值 | 用途 |
|-----------|------|------|
| `--bg` | `#0f0f0f` | 主背景 / chat 区 |
| `--surface` | `#1a1a1a` | 侧栏 / 面板 / 卡片 |
| `--surface-raised` | `#212121` | hover / 抬起 / 输入框 |
| `--surface-deep` | `#0f0f0f` | 顶部 header |
| `--fg` | `#f1f1f1` | 主体文字 |
| `--fg-2` | `#e6e6e6` | 次要文字 |
| `--muted` | `#aaaaaa` | 三级/说明 |
| `--meta` | `#717171` | placeholder |
| `--accent` | `#007acc` | 按钮 / 链接 / 选中态 |
| `--accent-hover` | `#0e639c` | 按钮 hover |
| `--accent-active` | `#094771` | 选中背景 |
| `--accent-focus` | `#007fd4` | focusBorder |
| `--success` | `#2ba640` | 成功 |
| `--warn` | `#f9a825` | 警告 |
| `--danger` | `#ff4d4f` | 错误 |
| `--border` | `#303030` | 面板分割线 |

### Light Theme

YouTube 浅色对应：背景 `#ffffff`，surface `#f9f9f9`，raised `#f1f1f1`，前景 `#0f0f0f`。
Accent 仍为 `#007acc`。详见 `app/theme/tokens-light.css`。

## Typography

**字体栈**: UI `Roboto, "YouTube Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`；等宽 `"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace`。基准 15px，`antialiased` + `grayscale` 平滑。

**字号体系**: `text-xs` 11.5px → `text-sm` 13px → `text-base` 14px → `text-lg` 15px → `text-xl` 18px → `text-2xl` 22px → `text-3xl` 26px。

**排版规则**: 行高 1.6 (正文) / 1.3 (紧凑)，段落间距 14px，标题 weight 600，`tabular-nums` 数字对齐，大标题 `-0.01em` 字间距。

**Markdown 消息** (`.markdown-body`: 15px, line-height 1.65):
- h1–h4: weight 600, 18px top / 6px bottom margin
- 段落: `0 0 14px`, `text-wrap: pretty`
- 列表: left-padding 1.5em, li 间距 4px
- 引用块: 左 `--accent-border` 3px solid + `--bg-subtle` 底 + 圆角 8px
- 内联代码: `--bg-subtle` 底, 0.9em, 圆角 4px, padding 5px
- 表格: 13px, 斑马纹, 圆角 12px
- 链接: `--accent` 色, underline-offset 2px

## Layout

4px 基础单位间距系统：4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 80px。

**布局**: 顶部 Header 56px → 左侧 collapsible sidebar（收缩 72px / 展开 240px）→ 主内容区（chat + workspace）。拖拽柄 12px，面板宽度 localStorage 持久化。

## Elevation & Depth

主要靠色值分层，配合阴影表达提升：
- `--elev-flat`: none (默认)
- `--elev-ring`: `0 0 0 1px var(--border)` (边框替代阴影)
- `--elev-raised`: `0 4px 12px rgba(0,0,0,0.5)` dark / `0 4px 12px rgba(0,0,0,0.08)` light (卡片/弹窗/下拉)

**Z-index**: `0 → dropdown(100) → sidebar(200) → overlay(500) → modal(1000) → toast(2000) → debug(99999)`

**焦点环**: 2px solid `--accent-focus`。

## Shapes

YouTube 式大圆角：
- `--radius-sm`: 8px (输入框/按钮/小标签)
- `--radius-md`: 12px (下拉/卡片/代码块/表格)
- `--radius-lg`: 18px (消息气泡/大面板)
- `--radius-pill`: 9999px (badge, 极少用)

**例外**: 消息气泡 18px，顶部 header 按钮 9999px (圆形 icon button)。

## Components

### 顶部 Header
- 高度 56px，背景 `--bg`，底部 1px `--border`
- 左侧：菜单按钮 + Logo + 标题
- 右侧：主题切换、workspace 面板切换等操作
- 按钮为 40px 圆形 icon button，hover 背景 `--surface-raised`

### 侧边栏 (Sidebar)
- 收缩 72px，展开 240px，背景 `--surface`
- 菜单项：8px 圆角，hover 背景 `--surface-raised`
- 底部 settings 按钮：40px 高，8px 圆角

### 消息气泡
- **用户**: `--surface-raised` 底，无可见边框，右对齐 max-width 82%，圆角 18px，padding 10px 14px，阴影 `0 2px 6px rgba(0,0,0,0.28)`
- **Agent**: 主底色纯文本，左侧 2px `--accent` solid
- **工具调用**: `--surface` 底，左 accent 条纹
- **间隔**: 16px

### 代码块
- 背景 `#141414`，边框 1px solid `--border`，行号列 `#181818`，左 2px accent stripe，圆角 12px

### 输入框
- 常态 `--surface-raised` / 1px solid `--border` / 圆角 8px
- 聚焦 1px solid `--accent-focus` + `0 0 0 3px rgba(0,127,212,0.22)`
- 流式中光环变红

### 按钮
- **主按钮**: `--accent` 底 / `#ffffff` 字，hover `--accent-hover`，圆角 8px
- **次按钮**: `--surface-raised` 底 / 1px solid `--border`，圆角 8px
- **图标按钮**: 透明底，hover `--surface-raised`，40×40px 圆形

### 侧栏图标
- 未激活 rgba(255,255,255,0.55) → Hover rgba(255,255,255,0.87) → 激活 #ffffff
- 尺寸 20px

### 对话列表项
- Hover `--surface-raised` → 激活 `rgba(255,255,255,0.15)`

### 文件树
- 条目 hover: `--surface-raised`
- 选中: `--bg-selected`
- 图标纯 SVG 线描，`--text-dim`，14px

### 滚动条
- 8px thin, thumb `--ui-scrollbar-thumb` 圆角 4px, hover `--ui-scrollbar-hover`, track 透明

### Thinking Level 标签
独立色: off→`--text-dim`, minimal→`#6b7280`, low→`#60a5fa`, medium→`#a78bfa`, high→`#f472b6`, xhigh→`#fb923c`。

### TPS 速率 Badge
≥50 t/s→深蓝底+accent 蓝字, 20–50→深绿底+success 绿字, <20→深琥珀底+warn 琥珀字。

### 模态/设置面板
- 底 `--surface-raised` (dark) / `#ffffff` (light), 遮罩 `rgba(0,0,0,0.6)` / `rgba(0,0,0,0.28)`。
- 圆角 12px

### Tab 切换
- 激活: `--bg` 底 + 顶部 accent 边线
- 非激活: `--surface-raised`
- Hover: `--surface`

### 表单校验
Error: `#ff8787` fg / `#3a1212` bg; Warn: `#ffd43b` fg / `#332a0d` bg; Info: `#74c0fc` fg / `#0a2540` bg。

### 动画
- `--motion-fast`: 120ms
- `--motion-base`: 200ms
- `--ease-standard`: cubic-bezier(0.4, 0, 0.2, 1)
- 主题切换: View Transitions API 280ms crossfade
- 消息入场: 0.4s ease, translateY(16px) + opacity
- 按钮 active: scale(0.98)
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
1. 优先复用 `--ui-*` CSS token 和 `--surface-*` / `--bg-*` 别名
2. 新色从 YouTube 色板取
3. Dark/Light 双主题同步提供变量
4. 引用 CSS 变量，不写死 inline style
5. 交互态 (hover/active/focus/disabled) 全定义，使用 120-200ms transition
6. 卡片/面板使用阴影表达层级
7. 圆角按组件级别：按钮/输入 8px，卡片/下拉 12px，消息气泡 18px

**Don't:**
1. 不使用 glow
2. 不使用 0 圆角（代码块/输入框/按钮统一 8px 起步）
3. 不使用 700+ 字体 weight
4. 焦点环不要 blur
5. 不要写死色值，必须引用 CSS 变量
