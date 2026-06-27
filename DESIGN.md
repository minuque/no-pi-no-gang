# DESIGN.md — Pi Agent 设计语言

> v3 "VSCode Dark+" · 开发者工具美学 · 严谨克制

## 设计哲学

```
纯中性灰表面 + VSCode 蓝 accent + 零光效零渐变
```

- **色板来源**: VSCode Dark+ / Light+ 同源色板，纯中性灰 (R=G=B)，不偏蓝不偏暖
- **层级区分**: 只用亮度差，不靠色调——VSCode 三层表面系统 (editor / sidebar / tab)
- **Accent 策略**: 蓝色 `#007acc` 仅出现在状态栏、链接、按钮、选中态，全界面最多 2 处可见
- **克制**: 无发光 (glow)、无渐变、无 `color-mix` 运算；每种状态用独立色值
- **即时反馈**: VSCode 美学——hover/active 瞬时切换，无 CSS 过渡动画 (仅保留极短 motion 给微交互)

---

## 1. 色彩系统

### 1.1 Dark Theme (默认)

**表面三层** — 亮度递增 8 点/层：

| Token | 色值 | 映射 |
|-------|------|------|
| `--bg` | `#1a1a1c` | editor.background — 主工作区 |
| `--surface` | `#222225` | sideBar.background — 面板/卡片 |
| `--surface-raised` | `#2a2a2e` | tab.inactiveBackground — 弹窗/hover |
| `--surface-deep` | `#121214` | activityBar.background — 图标列 |

**文字四级** — 纯中性灰阶梯：

| Token | 色值 | 用途 |
|-------|------|------|
| `--fg` | `#d4d4d4` | 主体文字 |
| `--fg-2` | `#c8c8c8` | 次要文字 |
| `--muted` | `#a8a8a8` | 三级/说明文字 |
| `--meta` | `#9a9a9a` | 装饰性/placeholder |

**Accent 蓝系** — VSCode 原生色值，不运算：

| Token | 色值 | 场景 |
|-------|------|------|
| `--accent` | `#007acc` | 状态栏 / 链接 / 活动指示 |
| `--accent-hover` | `#0e639c` | button.background |
| `--accent-active` | `#094771` | list.activeSelectionBackground |
| `--accent-focus` | `#007fd4` | focusBorder |
| `--accent-soft` | `#094771` | 列表中深蓝选中底 |
| `--accent-border` | `#264f78` | 选中/焦点边框 |

**语义色** — 终端 ANSI + 编辑器诊断色：

| Token | 色值 | 来源 |
|-------|------|------|
| `--success` | `#1d9e7a` | 终端亮绿 (稍加深) |
| `--warn` | `#cca700` | 编辑器警告波浪线 |
| `--danger` | `#f44747` | 终端亮红 / 编辑器错误 |

**边框两级**:

| Token | 色值 | 用途 |
|-------|------|------|
| `--border` | `#353538` | 主要分割线 |
| `--border-soft` | `#2a2a2d` | 弱分割 |
| `--border-muted` | `#222225` | 最弱分割 (同 surface) |

### 1.2 Light Theme

**冷调白底** — R=G, B 偏多 2–8 通道：

| Token | Dark | Light |
|-------|------|-------|
| `--bg` | `#1a1a1c` | `#f8f9fb` (R=248 G=249 B=251) |
| `--surface` | `#222225` | `#eff0f4` (B+5) |
| `--surface-raised` | `#2a2a2e` | `#e5e6ec` (B+7) |
| `--surface-deep` | `#121214` | `#dcdee5` (B+9) |
| `--fg` | `#d4d4d4` | `#1e1e1e` |
| `--fg-2` | `#c8c8c8` | `#444444` |
| `--border` | `#353538` | `#c8c8cc` |
| `--accent` | `#007acc` | `#007acc` (跨主题不变) |
| `--success` | `#1d9e7a` | `#1a8d4a` |
| `--warn` | `#cca700` | `#a67c00` |
| `--danger` | `#f44747` | `#c7423e` |

**设计要点**:
- 所有中性灰轻微冷偏 (B 通道 +2~+9)，避免米黄/暖灰/奶油底色
- Accent 蓝跨主题同值 (`#007acc`)，换肤无突变
- 文字/边框保持纯中性 (R=G=B) 确保可读性

---

## 2. 字体排版

### 2.1 字体栈

```
UI 文字: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
等宽:   "JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace
```

- 基准字号: **15px** (比 VSCode 编辑器大 1px，适配 Web 视距)
- 等宽字体启用 `tabular-nums` 数字对齐
- 字体平滑: `antialiased` (WebKit) + `grayscale` (Firefox)

### 2.2 字号阶梯

| Token | 字号 | 用途 |
|-------|------|------|
| `--text-xs` | 11.5px | 辅助标注 / badge |
| `--text-sm` | 13px | 表格 / 次要列表 |
| `--text-base` | 14px | 表单 / 面板文字 |
| `--text-lg` | 15px | 聊天消息正文 |
| `--text-xl` | 18px | 次级标题 |
| `--text-2xl` | 22px | 面板标题 |
| `--text-3xl` | 26px | 页面主标题 |

### 2.3 排版节奏

- 行高: `--leading-body: 1.6`, `--leading-tight: 1.3`
- 段落间距: `14px` (消息正文)
- 标题字重: **600** (semibold)，无 700+
- 字母间距: 保持默认 (`--tracking-display: 0`)，不额外调节

### 2.4 Markdown 消息排版

```css
.markdown-body { font-size: 15px; line-height: 1.65; }
```

| 元素 | 规格 |
|------|------|
| h1–h4 | 600 weight，18px top / 6px bottom margin |
| h5–h6 | 600 weight，颜色降为 `--text-muted` |
| 段落 | 0 0 14px, `text-wrap: pretty` |
| 列表 | left padding 1.5em，li 间距 4px |
| 引用块 | 左 accent-border 3px 实线，`--bg-subtle` 底，右 6px 圆角 |
| 内联代码 | `--bg-subtle` 底，0.9em 字号，3px 圆角，5px 内边距 |
| 表格 | 13px 字号，圆角 6px，斑马纹 `--bg-subtle` |
| 图片 | max-width 100%，圆角 6px |
| 链接 | `--accent` 色，下划线 offset 2px |
| 文字选中 | `--accent-soft` 底，保持原文字色 |

---

## 3. 间距与布局

### 3.1 间距单位

基于 **4px** 基础单位：

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-1` | 4px | 紧凑内边距 / 图标间距 |
| `--space-2` | 8px | 组件内间距 / gap |
| `--space-3` | 12px | 面板 padding |
| `--space-4` | 16px | 消息 padding / 区块间距 |
| `--space-5` | 20px | 大间距 |
| `--space-6` | 24px | 消息间隔 (`--ui-msg-gap`) |
| `--space-8` | 32px | 区块间隔 |
| `--space-12` | 48px | 页面级间隔 |
| `--space-20` | 80px | 超大留白 |

### 3.2 布局约束 (VSCode 比例感)

| Token | 值 | 说明 |
|-------|-----|------|
| `--nav-collapsed` | 48px | 最小侧栏宽 |
| `--nav-expanded` | 240px | 展开侧栏参考 |
| `--chat-list` | 280px | 对话列表宽 |
| `--content-max` | 820px | 聊天内容最大宽 (不居中) |

**三栏布局**: 侧栏 (180–480px 可拖拽) → 聊天区 (≥320px) → 文件面板 (≥300px, 默认 42vw 可拖拽)

- 聊天区不设 max-width —— VSCode 从不居中
- 两条拖拽柄宽 12px，`is-dragging` 全局 body class 禁选中
- 面板宽度持久化到 localStorage

---

## 4. 圆角

VSCode 几乎不圆角。工具型克制：

| Token | 值 | 场景 |
|-------|-----|------|
| `--radius-sm` | 2px | 输入框 / 按钮 (VSCode 原生) |
| `--radius-md` | 4px | 下拉 / 部分按钮 |
| `--radius-lg` | 6px | 消息气泡 / 表格 / 图片 / 面板 |
| `--radius-pill` | 9999px | badge / chip (极少用) |

**例外**: 消息气泡 `--ui-msg-radius: 12px`，代码块 `0` 圆角。

---

## 5. 阴影与层级

VSCode 主要靠色值分层层级，几乎不用阴影：

| Token | 值 | 场景 |
|-------|-----|------|
| `--elev-flat` | none | 默认 |
| `--elev-ring` | `0 0 0 1px var(--border)` | 边框替代阴影 |
| `--elev-raised` | `0 2px 8px rgba(0,0,0,0.36)` | 弹窗/下拉 (dark) |
| `--elev-raised` | `0 2px 8px rgba(0,0,0,0.08)` | 弹窗/下拉 (light) |

Z-index 比例尺: `0 → dropdown(100) → sidebar(200) → overlay(500) → modal(1000) → toast(2000) → debug(99999)`

焦点环: **1px solid `--accent-focus`**，不 blur，VSCode focusBorder 风格。

---

## 6. 组件美学

### 6.1 消息气泡

```
用户消息:  --ui-msg-user-bg (#2c2c30) 底色
           无可见边框
           微阴影 (0 1px 3px rgba(0,0,0,0.22))
           右对齐，max-width 85%
           圆角 12px，padding 12px 16px

Agent 消息: 主底色上方纯文本
            左侧 2px accent 实线 (--accent #007acc)
            无底色 / 无边框

工具调用:  --tool-bg (#222225) 底色
           左 accent 色条纹
           结构化错误用独立 error box (danger 底 + 边框)

间隔:      --ui-msg-gap: 24px
```

### 6.2 代码块

```
背景:     --ui-code-bg (#161618) — 略深于主底
边框:     1px solid --border
行号列:   --ui-code-gutter (#1e1e20) — 再深一级
左装饰:   2px solid --accent (accent stripe)
圆角:     0 (VSCode 原生)
字体:     JetBrains Mono, tabular-nums
```

### 6.3 输入框

```
常态:     --ui-input-bg (#2a2a2e)，1px solid #404045
聚焦:     1px solid --accent-focus (#007fd4)
          焦点光环 0 0 0 3px rgba(0,127,212,0.22)
流式中:   光环变红 0 0 0 3px rgba(244,71,71,0.22)
圆角:     0
Placeholder: #767676
```

### 6.4 按钮

```
主按钮:   背景 #0e639c，文字 #ffffff
          Hover: #1177bb
          无圆角 (VSCode 原生)

次按钮:   透明底，1px solid --border
          文字 --fg
          无圆角

图标按钮:  透明底
          Hover: --ui-toolbar-hover (#2a2a2e)
          尺寸 28–32px
          过渡: background 0.12s, color 0.12s
```

### 6.5 侧栏图标 (ActivityBar 风格)

```
未激活:   rgba(255,255,255,0.48) — 白色半透 (dark)
          rgba(0,0,0,0.38) — 黑色半透 (light)
Hover:    rgba(255,255,255,0.72) / rgba(0,0,0,0.6)
激活:     #ffffff (dark) / #1e1e1e (light)
备选蓝:   --accent (#007acc)
尺寸:     20px
```

### 6.6 对话列表项

```
Hover:     --ui-chatlist-item-hover (#2a2a2e)
激活选中:   --ui-chatlist-item-active (#094771) — 深蓝底
失焦选中:   #37373d (VSCode list.inactiveSelectionBackground)
```

### 6.7 文件树

```
条目 hover:  --bg-hover (rgba 白色 4% 暗底)
条目选中:    --bg-selected
文件图标:    纯 SVG 线描，色值 --text-dim
            尺寸 14px
            支持 TS/TSX/JS/JSX/PY/JSON/CSS/SCSS/HTML/MD/YAML/TOML/
            SH/Rust/Go/SQL/GQL/TF/Dockerfile/ENV/Git/Lock/DOC/PDF/Config
目录图标:    文件夹 SVG (空心→实心切换)
```

### 6.8 滚动条

```
宽度:      4px (thin)
Thumb:     --ui-scrollbar-thumb (#3a3a3e)，圆角 2px
Hover:     --ui-scrollbar-hover (#4a4a50)
Track:     透明
```

### 6.9 Thinking Level 标签

```
各 level 独立色:
  off      → --text-dim
  minimal  → #6b7280 (灰)
  low      → #60a5fa (浅蓝)
  medium   → #a78bfa (紫)
  high     → #f472b6 (粉)
  xhigh    → #fb923c (橙)
显示为: 6px 色点 + 等宽 level 名 + Default/Disabled/Custom 三态按钮
```

### 6.10 TPS 速率 Badge (流式速度)

```
≥50 t/s → 深蓝底 (#0e2a3d) + accent 蓝字
20–50   → 深绿底 (#0d2f29) + success 绿字
<20     → 深琥珀底 (#332a0d) + warn 琥珀字
无发光，无渐变 — 深色微染底 + 语义色前景
```

### 6.11 模态 / 设置面板

```
背景:    --ui-modal-bg (#2a2a2e dark / #ffffff light)
遮罩:    --ui-modal-backdrop (rgba 0,0,0,0.5 dark / 0.28 light)
边框:    1px solid --border
阴影:    --elev-raised
```

### 6.12 Tooltip / Popover

```
背景:    --ui-tooltip-bg
文字:    --fg
边框:    1px solid #353538
阴影:    --elev-raised
```

### 6.13 Tab 切换

```
激活 Tab:  --ui-tab-active-bg (#1a1a1c)
          顶部 accent 色边线
非激活:   --ui-tab-inactive-bg (#2a2a2e)
Hover:    --ui-tab-hover-bg (#2e2e32)
```

### 6.14 下拉菜单 / Context Menu

```
背景:    --ui-dropdown-bg (#2a2a2e dark / #ffffff light)
         --ui-dropdown-hover (#094771 dark / #dbe8f7 light)
边框:    1px solid #353538 (dark) / #c8c8cc (light)
阴影:    --elev-raised
```

### 6.15 表单校验状态

```
Error:   --ui-error-fg (#f44747 dark / #d1242f light)  前景
         --ui-error-bg (#5a1d1d dark / #fde7e9 light)  底色
Warn:    --ui-warn-fg (#cca700 dark / #946800 light)
         --ui-warn-bg (#4d3f00 dark / #fff3cd light)
Info:    --ui-info-fg (#3794ff dark / #006ab1 light)
         --ui-info-bg (#063b5e dark / #e8f4fd light)
```

### 6.16 Badge / Pill

```
背景:    --ui-badge-bg (#333 dark / #c4c4c4 light)
文字:    --ui-badge-fg (#ffffff dark / #333333 light)
极少使用 — VSCode 几乎不出现 badge。
```

---

## 7. 动画与过渡

### 7.1 微交互 (极短)

| Token | 值 | 场景 |
|-------|-----|------|
| `--motion-fast` | 80ms | hover 状态切换 |
| `--motion-base` | 120ms | 组件进出 |
| `--ease-standard` | ease-out | 统一缓动 |

常用过渡: `background 0.12s ease`, `background 0.12s, color 0.12s`, `transform 0.1s`

### 7.2 主题切换

| 浏览器 | 方案 |
|--------|------|
| Chrome/Edge 111+ | View Transitions API — 原生 280ms crossfade |
| Firefox/Safari | 圆形 wipe 动画 — 340ms 扩展 + 280ms 溶解重叠 (80ms overlap) |

实现细节:
- Chrome: `document.startViewTransition()` + `.theme-switching` class 触发过渡
- Fallback: 动态创建 overlay div，从点击坐标 (或屏幕中心) 圆形展开，material-standard easing
- Light → Dark: overlay 色 `#1a1a1c`; Dark → Light: `#f8f9fb`

### 7.3 View Transitions (设置面板)

全局启用 `experimental.viewTransition: true`。

| Transition Class | 效果 |
|-----------------|------|
| `.vt-fade-out` / `.vt-fade-in` | 淡入淡出 (280ms) |
| `.vt-slide-down` / `.vt-slide-up` | 垂直滑入 (300ms cubic-bezier) |
| `.vt-scale-out` / `.vt-scale-in` | 缩放 (250ms) |
| `.vt-nav-forward` | 前进导航: old 左滑出 + new 右滑入 |
| `.vt-nav-back` | 后退导航: old 右滑出 + new 左滑入 |
| `.vt-morph` | 共享元素过渡 (position morph + via-blur) |
| `settings-overlay` | Settings 面板 enter/exit: scale + fade |
| `workspace-panel` | 文件面板: slide + fade |

`prefers-reduced-motion` 时所有 VT 动画 duration 强制为 0s。

### 7.4 骨架屏 / 加载态

```
SessionLoading:
  ┌──────────────────────────────┐
  │ ┌────┐                       │ ← avatar circle (shimmer)
  │ │    │ ┌──────────────────┐  │ ← 短行
  │ └────┘ │ ░░░░░░░░░░░░░░░░ │  │
  │        └──────────────────┘  │
  │ ┌─────────────────────────┐  │ ← 长行
  │ │ ░░░░░░░░░░░░░░░░░░░░░░░ │  │
  │ └─────────────────────────┘  │
  │ ┌────────────────────┐       │ ← 中行
  │ │ ░░░░░░░░░░░░░░░░░░ │       │
  │ └────────────────────┘       │
  └──────────────────────────────┘
  7 行错位 shimmer，延时 0.06s/行 递增
  shimmer: 2.2s ease-in-out infinite 从左到右高光扫描
```

### 7.5 消息入场动画

```
消息列表: sl-msg-enter — 0.4s ease forwards
          从下 16px + opacity 0 → 原位 + opacity 1
          每行延时 0.06s 递增 (共 7 行)
```

### 7.6 NProgress 加载条

```
配置:  showSpinner: false
       speed: 400ms
       trickleSpeed: 200ms
       minimum: 0.08
触发:  ChatWindow loading 状态变化 → NProgress.start() / .done()
颜色:  自动从 accent 继承 (通过 CSS 覆盖)
```

### 7.7 已定义关键帧 (全局可用)

| 动画名 | 效果 |
|--------|------|
| `fade-in` | opacity 0→1 |
| `fade-in-up` | 上移 8px + 淡入 |
| `spin` | 360° 旋转 (loading spinner) |
| `pulse` | 缩放 1→1.05→1 |
| `codex-status-enter` | 状态指示器入场 (scale + fade) |
| `codex-status-dot` | 状态点脉冲 |
| `codex-status-breathe` | 状态指示器呼吸 |
| `drop-zone-in` | 拖放区入场 |
| `drop-ripple` | 拖放波纹 |
| `saved-pop` | 保存成功弹跳 |
| `saved-check-draw` | 保存勾描边 |

---

## 8. 文件类型图标

纯 SVG 线描风格，统一 14px，色值 `--text-dim`：

```
Label 型 (文字标签):  TS · TSX · JS · JSX · PY · {} · CSS · SC · HTM · YML · TOM · RS · GO · SQL · GQL · TF · DOC · PDF · LOCK
SVG 描画型:           MD (M↓) · SH (>) · Dockerfile (容器) · ENV (钥匙) · Git (分支) · Config (齿轮)
```

分辨率规则: 根据文件扩展名匹配图标，未匹配回退到通用文件图标。

---

## 9. 设计 Token 速查

### 通用语义 Token (组件引用)

这些是代码中实际使用的变量名，映射到 VSCode 原生色：

| Token | Dark 值 | Light 值 | 用途 |
|-------|---------|----------|------|
| `--bg` | `#1a1a1c` | `#f8f9fb` | 主背景 |
| `--bg-panel` | `#222225` | `#eff0f4` | 面板/卡片底 |
| `--bg-hover` | `#2a2a2e` | `#e5e6ec` | hover 状态 |
| `--bg-selected` | `#2d3035` | `#dbe8f7` | 选中态 |
| `--bg-subtle` | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.03)` | 微妙底色 |
| `--text` | `#d4d4d4` | `#1e1e1e` | 主文字 |
| `--text-muted` | `#c8c8c8` | `#444444` | 次要文字 |
| `--text-dim` | `#a8a8a8` | `#6e6e6e` | 三级/提示 |
| `--border` | `#353538` | `#c8c8cc` | 主边框 |
| `--accent` | `#007acc` | `#007acc` | 主强调色 |
| `--accent-hover` | `#0e639c` | `#106ebe` | 悬停强调 |
| `--accent-soft` | `#094771` | `#e8f4fd` | 淡强调底 |
| `--accent-border` | `#264f78` | `#add6ff` | 强调边框 |
| `--user-bg` | `#2c2c30` | `#e8e9f0` | 用户消息气泡 |
| `--assistant-bg` | `#1a1a1c` | `#f8f9fb` | 助手消息 (同主底) |
| `--tool-bg` | `#222225` | `#eff0f4` | 工具调用底 |
| `--danger` | `#f44747` | `#c7423e` | 错误/危险 |
| `--success` | `#1d9e7a` | `#1a8d4a` | 成功 |
| `--warn` | `#cca700` | `#a67c00` | 警告 |

### 阴影层级

| Token | Dark | Light |
|-------|------|-------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.25)` | `0 1px 2px rgba(0,0,8,0.04)` |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` | `0 1px 3px rgba(0,0,8,0.06)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.45)` | `0 4px 12px rgba(0,0,8,0.08)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.55)` | `0 8px 24px rgba(0,0,8,0.12)` |

---

## 10. 设计约束

### 务必遵守

1. **无 glow / 无渐变 / 无 color-mix** — 每种状态用独立色值
2. **Accent 蓝色最多 2 处可见** — 主要 action + 选中态标识
3. **圆角 ≤ 6px** — 代码块/输入框 0 圆角，消息气泡例外 (12px)
4. **过渡 ≤ 120ms** — hover/active 瞬时切换，不拖动画
5. **中性灰 R=G=B** — 不偏蓝不偏暖
6. **焦点环: 1px solid accent-focus** — 不 blur
7. **字体 weight ≤ 600** — 不用 700/800/900
8. **行高 ≥ 1.5** — 消息正文保持舒适阅读
9. **等宽数字** — 所有数字启用 `tabular-nums`
10. **滚动条 4px** — thin + 透明 track

### 新组件开发流程

1. 优先复用现有 `--ui-*` token，不新建色值
2. 需要新色值时，从 VSCode Dark+ / Light+ 原生色板取值
3. dark/light 双主题必须同步定义
4. 避免内联 `style` 写死色值 — 引 CSS 变量
5. 交互态 (hover/active/focus/disabled) 全部定义
