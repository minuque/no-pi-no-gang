# DESIGN.md — Pi Agent 设计语言

> v3 "VSCode Dark+" · 开发者工具美学 · 严谨克制

## 设计哲学

纯中性灰表面 + VSCode 蓝 accent + 零光效零渐变。

- **色板**: VSCode Dark+/Light+ 同源，中性灰 R=G=B，不偏蓝不暖
- **层级**: 纯靠亮度差区分三层表面 (editor → sidebar → tab)，不靠色调
- **Accent**: `#007acc` 仅状态栏/链接/按钮/选中态，全界面 ≤2 处可见
- **克制**: 无 glow、无渐变、无 `color-mix`，每种状态独立色值
- **反馈**: hover/active 瞬时切换，≤120ms，不拖动画

---

## 1. 色彩系统

### Dark Theme (默认)

| Token | 色值 | 映射/用途 |
|-------|------|----------|
| `--bg` | `#1a1a1c` | editor.background |
| `--surface` | `#222225` | sideBar.background |
| `--surface-raised` | `#2a2a2e` | tab.inactiveBackground |
| `--surface-deep` | `#121214` | activityBar.background |
| `--fg` | `#d4d4d4` | 主体文字 |
| `--fg-2` | `#c8c8c8` | 次要文字 |
| `--muted` | `#a8a8a8` | 三级/说明 |
| `--meta` | `#9a9a9a` | placeholder |
| `--accent` | `#007acc` | 链接/活动指示 |
| `--accent-hover` | `#0e639c` | button.background |
| `--accent-active` | `#094771` | activeSelectionBackground |
| `--accent-focus` | `#007fd4` | focusBorder |
| `--accent-soft` | `#094771` | 选中底 |
| `--accent-border` | `#264f78` | 选中/焦点边框 |
| `--success` | `#1d9e7a` | 终端亮绿 |
| `--warn` | `#cca700` | 编辑器警告 |
| `--danger` | `#f44747` | 终端亮红 |
| `--border` | `#353538` | 主分割线 |
| `--border-soft` | `#2a2a2d` | 弱分割 |
| `--border-muted` | `#222225` | 最弱 (同 surface) |

### Light Theme

冷调白底: R=G, B 偏多 2–9 通道，避免米黄/暖灰。Accent `#007acc` 跨主题不变。

| Token | Dark | Light |
|-------|------|-------|
| `--bg` | `#1a1a1c` | `#f8f9fb` |
| `--surface` | `#222225` | `#eff0f4` |
| `--surface-raised` | `#2a2a2e` | `#e5e6ec` |
| `--surface-deep` | `#121214` | `#dcdee5` |
| `--fg` | `#d4d4d4` | `#1e1e1e` |
| `--fg-2` | `#c8c8c8` | `#444444` |
| `--border` | `#353538` | `#c8c8cc` |
| `--accent` | `#007acc` | `#007acc` |
| `--success` | `#1d9e7a` | `#1a8d4a` |
| `--warn` | `#cca700` | `#a67c00` |
| `--danger` | `#f44747` | `#c7423e` |

---

## 2. 字体排版

**字体栈**: UI `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`；等宽 `"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace`。基准 15px，`antialiased` + `grayscale` 平滑。

| Token | 字号 | 用途 |
|-------|------|------|
| `--text-xs` | 11.5px | badge |
| `--text-sm` | 13px | 表格/次要列表 |
| `--text-base` | 14px | 表单/面板 |
| `--text-lg` | 15px | 聊天正文 |
| `--text-xl` | 18px | 次级标题 |
| `--text-2xl` | 22px | 面板标题 |
| `--text-3xl` | 26px | 页面主标题 |

**排版**: 行高 `1.6`(正文) / `1.3`(紧凑)，段落间距 14px，标题 weight 600，不用 700+，`tabular-nums` 数字对齐。

**Markdown 消息** (`.markdown-body`: 15px, line-height 1.65):

| 元素 | 规格 |
|------|------|
| h1–h4 | weight 600, 18px top / 6px bottom margin |
| h5–h6 | weight 600, `--text-muted` |
| 段落 | `0 0 14px`, `text-wrap: pretty` |
| 列表 | left-padding 1.5em, li 间距 4px |
| 引用块 | 左 `--accent-border` 3px solid, `--bg-subtle` 底, 圆角 6px |
| 内联代码 | `--bg-subtle` 底, 0.9em, 圆角 3px, padding 5px |
| 表格 | 13px, 圆角 6px, 斑马纹 `--bg-subtle` |
| 图片 | max-width 100%, 圆角 6px |
| 链接 | `--accent` 色, underline-offset 2px |
| 选中 | `--accent-soft` 底, 保持原文字色 |

---

## 3. 间距与布局

4px 基础单位:

| Token | 值 | Token | 值 |
|-------|-----|-------|-----|
| `--space-1` | 4px | `--space-5` | 20px |
| `--space-2` | 8px | `--space-6` | 24px (`--ui-msg-gap`) |
| `--space-3` | 12px | `--space-8` | 32px |
| `--space-4` | 16px | `--space-12` | 48px |
| | | `--space-20` | 80px |

**布局**: 三栏 — 侧栏 (180–480px) → 聊天区 (≥320px) → 文件面板 (≥300px, 默认 42vw)。聊天区不设 max-width (VSCode 不居中)，拖拽柄 12px，面板宽度 localStorage 持久化。

| Token | 值 |
|-------|-----|
| `--nav-collapsed` | 48px |
| `--nav-expanded` | 240px |
| `--chat-list` | 280px |
| `--content-max` | 820px |

---

## 4. 圆角

VSCode 式克制:

| Token | 值 | 场景 |
|-------|-----|------|
| `--radius-sm` | 2px | 输入框/按钮 |
| `--radius-md` | 4px | 下拉 |
| `--radius-lg` | 6px | 消息气泡/表格/面板 |
| `--radius-pill` | 9999px | badge (极少用) |

**例外**: 消息气泡 `--ui-msg-radius: 12px`，代码块 0 圆角。

---

## 5. 阴影与层级

主靠色值分层，几乎不用阴影:

| Token | Dark | Light | 场景 |
|-------|------|-------|------|
| `--elev-flat` | none | none | 默认 |
| `--elev-ring` | `0 0 0 1px var(--border)` | 同 | 边框替代阴影 |
| `--elev-raised` | `0 2px 8px rgba(0,0,0,0.36)` | `0 2px 8px rgba(0,0,0,0.08)` | 弹窗/下拉 |
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.25)` | `0 1px 2px rgba(0,0,8,0.04)` | |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` | `0 1px 3px rgba(0,0,8,0.06)` | |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.45)` | `0 4px 12px rgba(0,0,8,0.08)` | |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.55)` | `0 8px 24px rgba(0,0,8,0.12)` | |

**Z-index**: `0 → dropdown(100) → sidebar(200) → overlay(500) → modal(1000) → toast(2000) → debug(99999)`

**焦点环**: 1px solid `--accent-focus`，不 blur。

---

## 6. 组件美学

### 消息气泡
- **用户**: `--user-bg` (#2c2c30) 底, 无可见边框, `0 1px 3px rgba(0,0,0,0.22)`, 右对齐 max-width 85%, 圆角 12px, padding 12px 16px
- **Agent**: 主底色纯文本, 左侧 2px `--accent` solid, 无底/无边框
- **工具调用**: `--tool-bg` (#222225) 底, 左 accent 条纹; error 用独立 danger 底+边框
- **间隔**: `--ui-msg-gap: 24px`

### 代码块
背景 `#161618`, 边框 1px solid `--border`, 行号列 `#1e1e20`, 左 2px `--accent` solid stripe, 圆角 0, JetBrains Mono + `tabular-nums`。

### 输入框
常态 `#2a2a2e` / 1px solid `#404045`; 聚焦 1px solid `--accent-focus` + `0 0 0 3px rgba(0,127,212,0.22)`; 流式中光环变红 `rgba(244,71,71,0.22)`; 圆角 0; placeholder `#767676`。

### 按钮
- **主按钮**: `#0e639c` 底 / `#ffffff` 字, hover `#1177bb`, 圆角 0
- **次按钮**: 透明底 / 1px solid `--border`, 字 `--fg`, 圆角 0
- **图标按钮**: 透明底, hover `#2a2a2e`, 28–32px, 过渡 `background 0.12s, color 0.12s`

### 侧栏图标 (ActivityBar)
| 状态 | Dark | Light |
|------|------|-------|
| 未激活 | `rgba(255,255,255,0.48)` | `rgba(0,0,0,0.38)` |
| Hover | `rgba(255,255,255,0.72)` | `rgba(0,0,0,0.6)` |
| 激活 | `#ffffff` | `#1e1e1e` |
| 备选蓝 | `--accent` | `--accent` |

尺寸 20px。

### 对话列表项
- Hover: `#2a2a2e`
- 激活: `#094771` (深蓝底)
- 失焦选中: `#37373d`

### 文件树
- 条目 hover: `--bg-hover` (rgba 白 4% 暗底); 选中: `--bg-selected`
- 图标: 纯 SVG 线描, `--text-dim`, 14px; 文件夹 SVG 空心↔实心切换
- 支持: TS/TSX/JS/JSX/PY/JSON/CSS/SCSS/HTML/MD/YAML/TOML/SH/Rust/Go/SQL/GQL/TF/Dockerfile/ENV/Git/Lock/DOC/PDF/Config

### 滚动条
4px thin, thumb `#3a3a3e` 圆角 2px, hover `#4a4a50`, track 透明。

### Thinking Level 标签
独立色: off→`--text-dim`, minimal→`#6b7280`, low→`#60a5fa`, medium→`#a78bfa`, high→`#f472b6`, xhigh→`#fb923c`。显示: 6px 色点 + 等宽 level 名 + 三态按钮。

### TPS 速率 Badge
≥50 t/s→深蓝底+accent 蓝字, 20–50→深绿底+success 绿字, <20→深琥珀底+warn 琥珀字。无发光无渐变。

### 模态/设置面板
底 `#2a2a2e` (dark) / `#ffffff` (light), 遮罩 `rgba(0,0,0,0.5)` / `rgba(0,0,0,0.28)`, 1px solid `--border`, `--elev-raised`。

### Tooltip/Popover
底 `--ui-tooltip-bg`, 字 `--fg`, 边框 1px solid `#353538`, `--elev-raised`。

### Tab 切换
激活: `#1a1a1c` 底 + 顶部 accent 边线; 非激活: `#2a2a2e`; Hover: `#2e2e32`。

### 下拉/Context Menu
底 `#2a2a2e` dark / `#ffffff` light, hover `#094771` / `#dbe8f7`, 边框 `#353538` / `#c8c8cc`, `--elev-raised`。

### 表单校验
| 状态 | 前景 (dark/light) | 底色 (dark/light) |
|------|-------------------|-------------------|
| Error | `#f44747` / `#d1242f` | `#5a1d1d` / `#fde7e9` |
| Warn | `#cca700` / `#946800` | `#4d3f00` / `#fff3cd` |
| Info | `#3794ff` / `#006ab1` | `#063b5e` / `#e8f4fd` |

### Badge/Pill
底 `#333` / `#c4c4c4`, 字 `#ffffff` / `#333333`。极少使用。

---

## 7. 动画

### 微交互
| Token | 值 | 场景 |
|-------|-----|------|
| `--motion-fast` | 80ms | hover 切换 |
| `--motion-base` | 120ms | 组件进出 |
| `--ease-standard` | ease-out | 统一缓动 |

常用: `background 0.12s ease`, `transform 0.1s`。

### 主题切换
Chrome/Edge 111+ 用 View Transitions API (280ms crossfade); Firefox/Safari fallback 圆形 wipe (340ms 扩展 + 280ms overlap)。`prefers-reduced-motion` 时强制 0s。

### View Transitions (设置面板)
全局 `experimental.viewTransition: true`:

| Transition | 效果 |
|------------|------|
| `.vt-fade-out` / `.vt-fade-in` | 淡入淡出 280ms |
| `.vt-slide-down` / `.vt-slide-up` | 垂直滑入 300ms cubic-bezier |
| `.vt-scale-out` / `.vt-scale-in` | 缩放 250ms |
| `.vt-nav-forward` | 前进: left→right |
| `.vt-nav-back` | 后退: right→left |
| `.vt-morph` | 共享元素过渡 (position morph + blur) |
| `settings-overlay` | 设置面板 scale + fade |
| `workspace-panel` | 文件面板 slide + fade |

### 骨架屏
SessionLoading: 7 行错位 shimmer (延时 0.06s/行递增), 2.2s ease-in-out infinite 高光扫描。

### 消息入场
`sl-msg-enter`: 0.4s ease, translateY(16px) + opacity 0→1, 每行延时 0.06s 递增。

### NProgress
`showSpinner: false`, speed 400ms, trickleSpeed 200ms, minimum 0.08, 颜色继承 accent。

### 全局关键帧
`fade-in` / `fade-in-up` / `spin` / `pulse` / `codex-status-enter` / `codex-status-dot` / `codex-status-breathe` / `drop-zone-in` / `drop-ripple` / `saved-pop` / `saved-check-draw`。

---

## 8. 文件类型图标

纯 SVG 线描, 14px, `--text-dim`:
- **Label 型**: TS · TSX · JS · JSX · PY · {} · CSS · SC · HTM · YML · TOM · RS · GO · SQL · GQL · TF · DOC · PDF · LOCK
- **SVG 描画型**: MD (M↓) · SH (>) · Dockerfile (容器) · ENV (钥匙) · Git (分支) · Config (齿轮)

按扩展名匹配，未匹配回退通用图标。

---

## 9. 设计约束

1. 无 glow / 无渐变 / 无 `color-mix` — 每种状态独立色值
2. Accent 蓝 ≤2 处可见 — 主要 action + 选中态
3. 圆角 ≤6px — 代码块/输入框 0, 消息气泡例外 12px
4. 过渡 ≤120ms — hover/active 瞬时切换
5. 中性灰 R=G=B — 不偏蓝不暖
6. 焦点环 1px solid `--accent-focus` — 不 blur
7. 字体 weight ≤600 — 不用 700+
8. 行高 ≥1.5 — 消息正文
9. 等宽数字 `tabular-nums`
10. 滚动条 4px thin + 透明 track

**新组件开发**: ①优先复用 `--ui-*` token ②新色从 VSCode 原生色板取 ③dark/light 双主题同步 ④引 CSS 变量不写死 inline style ⑤交互态全定义。
