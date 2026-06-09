# TODO — pi-web 聊天体验打磨

对齐 Claude Desktop 最新版 Chat 体验，仅列 Web 前端自身改进点。

---

## 高优先级 — 直接影响日常使用

- [x] **多行输入** — Shift+Enter 换行，Enter 发送，对齐 Claude Desktop。`ChatInput.tsx`
- [x] **输入历史回溯** — 空输入框按 ↑/↓ 导航本次会话已发送的消息。`ChatInput.tsx`
- [x] **滚动到底按钮** — 视口不在底部时，输入框上方居中浮现 ↓ 按钮，点击回到底部。`ChatWindow.tsx` + `useAgentSession.ts`
- [x] **重新生成** — 最后一条 assistant 消息 hover 显示 Retry 按钮，用同一 prompt 重新请求。`ChatWindow.tsx` + `MessageView.tsx`
- [x] **编辑后重发** — 用户消息 hover 显示 Edit 按钮，原地编辑后重新发送。`ChatWindow.tsx` + `MessageView.tsx`

## 中优先级 — 显著提升效率

- [ ] **Esc 停止** — 键盘 Esc 等同点 Stop 按钮，对齐 Claude Desktop
- [ ] **操作按钮常驻** — copy/fork/edit 按钮只在 hover 时显示，改为始终可见
- [ ] **会话搜索** — 侧边栏顶部加搜索框，按标题模糊过滤会话，对齐 Claude Desktop
- [ ] **消息入场动画** — 新消息从下方淡入（fade-in-up），当前只对 streaming chunk 有动画，整块消息出现无过渡
- [ ] **Tool call 展开过渡** — expand/collapse 瞬间切换，加 height/opacity transition
- [ ] **Thinking 指示器** — 当前 pulse 文字太简陋，改为三跳点 `...` 动画，对齐 Claude Desktop

## 低优先级 — 锦上添花

- [ ] **代码块复制增强** — 增加"不含行号复制"选项
- [ ] **图片查看器** — 当前只能看原图，加缩放/旋转
- [ ] **字号调节** — 聊天消息字号独立可调
- [ ] **会话项显示模型名** — 侧边栏会话旁标注模型简称，一眼辨识
- [ ] **Placeholder 轮换** — 输入框 placeholder 从固定 "Message…" 改为轮换快捷提示

## UI 视觉打磨

- [x] **输入区精简** — 移除 Tools/Compact/Sound 控件，重构底部栏。左下 Attach，右下 Model + Thinking + Usage donut gauge
- [x] **模型选择器位置** — **跳过。**底部栏右下角保留模型选择器作为交互入口
- [x] **消息视觉层级** — **跳过。**User 气泡 + Assistant 纯文本的当前方案暂不动
- [x] **消息间距呼吸感** — `marginBottom: 16` → `24`
- [x] **Tool call 视觉轻量化** — 默认折叠单行，去绿/红色统一灰色边框，展开后保留卡片内容，fadeInUp 入场动画
- [x] **Thinking 块动态边框** — streaming 中左边框 3px pulsing，完成后回 1px 灰框。展开 fadeInUp 入场
- [x] **Minimap 尺寸** — **跳过。**36px 保持不变
- [x] **空状态品质感** — **跳过。**当前文字 + typewriter 暂不动
- [x] **滚动条抖动** — html/body `scrollbar-gutter: stable`，ChatWindow `scrollbar-width: none` 避免与 minimap 重叠
- [x] **暗色代码对比度** — **跳过。**暂不调整 vscDarkPlus
- [x] **过渡动画统一** — tool call / thinking 展开用 `@keyframes fadeInUp` 200ms ease 入场动画
- [x] **Usage limits donut gauge** — Claude Desktop 风格双层 donut + 智能变色 + 悬浮卡片式进度条
- [x] **Markdown 内容间距** — p/ul/ol/table 底部间距 `8px` → `16px`
- [ ] **皮影戏 π 点阵背景** — `PiCoworkBackground.tsx`：40px 固定网格暗色点阵 + 大尺寸 π 字符镂空透光，暗幕遮罩 + 呼吸动画。仅 `PiLoading.tsx` 加载界面使用；`ChatWindow.tsx` 聊天界面已移除（效果不理想）

---

# TODO — WorkspacePanel 重构（Reasonix 风格右侧面板）

将文件树从左侧 SessionSidebar 迁移到右侧，做成 Reasonix 风格的分屏 WorkspacePanel。
**左侧只保留会话列表。**

## 架构概览

```
右侧面板 (WorkspacePanel)
├── 头部: 切换按钮 | 搜索框 | 刷新
├── 左: WorkspaceTree (文件树，可拖拽调整宽度)
│   ├── 按需加载子目录 (同现有 fetchEntries)
│   ├── 展开状态持久化 localStorage (key = cwd)
│   ├── 搜索: 扁平化匹配，隐藏树结构
│   ├── 右键菜单: 复制路径 / 插入引用到聊天
│   └── 拖拽文件到 ChatInput → @path/to/file
└── 右: WorkspacePreview (预览区)
    ├── Breadcrumb 导航 (workspace > src > components > Foo.tsx)
    ├── 代码高亮 (复用 SyntaxHighlighter)
    ├── Markdown 渲染 (复用 react-markdown)
    └── 图片/音频/PDF/DOCX (复用现有 FileViewer 逻辑)
```

## 文件变更清单

### 新建

- [x] **`components/ContextMenu.tsx`** — 通用右键菜单组件
  - 定位: `position: fixed` 跟随鼠标
  - 点击外部 / Esc 关闭
  - 支持分隔线和快捷键提示
  - API: `<ContextMenu items={[...]} point={{x,y}} onClose={...} />`

- [x] **`components/WorkspaceTree.tsx`** — 文件树组件
  - 从 `FileExplorer.tsx` 提取 TreeNode + fetchEntries
  - 新增: 展开状态持久化 — `localStorage.setItem('pi-expanded-dirs:' + cwd, JSON.stringify([...set]))`
  - 新增: 搜索框 — 输入后扁平化匹配，隐藏树 (`flattened.map` 渲染)
  - 新增: 右键菜单 — 文件: 复制路径/插入引用; 文件夹: 复制路径/插入引用
  - 新增: 拖拽 — `draggable` + `onDragStart` set `text/plain` + 自定义 data
  - 移除: hover mention 按钮 (改为右键 + 拖拽)
  - 缩进: 保持纯 padding，不加引导线

- [x] **`components/WorkspacePreview.tsx`** — 预览区组件
  - Breadcrumb: `root > dir > ... > file`，各级可点击跳转目录
  - 空状态: "Select a file to preview"
  - 文件内容: 复用 FileViewer 的 TextFileViewer/ImageViewer/AudioViewer/DocumentViewer 渲染逻辑
  - 提取共享渲染函数到 `lib/file-preview.tsx` 以便 WorkspacePreview 和 FileViewer 共用

- [x] **`components/WorkspacePanel.tsx`** — 面板壳组件
  - Props: `open`, `cwd`, `onClose`, `onAddToChat?`
  - 布局: 头部栏 + `display:flex` 左右分屏
  - 拖拽调整树宽度: pointer events (复用 AppShell 现有 drag 逻辑)
  - 树最小宽度 180px，最大 340px，默认 240px
  - 持久化树宽度到 localStorage: `pi-workspace-tree-width`

### 修改

- [x] **`components/AppShell.tsx`** — 替换右侧面板内容
  - 移除: `fileTabs` / `activeFileTabId` / `TabBar` / `FileViewer` 相关代码
  - 移除: `handleOpenFile` / `handleCloseFileTab`
  - 新增: `<WorkspacePanel>` 替代现有 `<TabBar> + <FileViewer>`
  - 面板开关逻辑保持不变 (右上角 toggle 按钮)
  - `onAddToChat` → 调用 `chatInputRef.current?.insertText(...)`
  - 保留 `rightPanelWidth` 拖拽调整

- [x] **`components/SessionSidebar.tsx`** — 移除 FileExplorer 部分
  - 移除: `<FileExplorer>` 及其 wrapper（Explorer 折叠区）
  - 移除相关 props: `onOpenFile`, `explorerRefreshKey`, `onAtMention`, `explorerRefreshDone`
  - 移除 session 列表下方的边界线和折叠按钮
  - Session 列表改为 `flex: 1` 占满剩余空间（去掉文件树后的高度分配）

- [x] **`components/ChatInput.tsx`** — 添加文件拖放接收
  - `onDrop`: 读 `event.dataTransfer.getData("text/plain")`，调用 `insertText(...)` 插入引用
  - `onDragOver`: `event.preventDefault()` + 视觉反馈（边框/背景高亮）
  - 支持 `application/x-pi-file-path` 自定义 MIME type

### 可选删除

- [x] **`components/FileExplorer.tsx`** — 已删除（零引用）

- [x] **`components/TabBar.tsx`** — 已删除（零引用）

### 不变

- `components/FileViewer.tsx` — 保留不动（Agent 消息中的文件引用仍用它渲染）
- `components/FileIcons.tsx` — 保留不动（WorkspaceTree 复用）
- `app/api/files/[...path]/route.ts` — 保留不动（API 不变）
- `lib/file-paths.ts` — 保留不动

## 实施顺序

1. 创建 `ContextMenu.tsx`（被 WorkspaceTree 依赖）
2. 创建 `WorkspaceTree.tsx`（独立可测试）
3. 创建 `WorkspacePreview.tsx`
4. 创建 `WorkspacePanel.tsx`（组装 Tree + Preview）
5. 修改 `ChatInput.tsx`（添加 drop handler）
6. 修改 `SessionSidebar.tsx`（移除 FileExplorer）
7. 修改 `AppShell.tsx`（接入 WorkspacePanel，移除 TabBar/FileViewer）
8. 删除废弃代码（FileExplorer.tsx, TabBar.tsx）

## 技术要点

### 展开状态持久化
```ts
const STORAGE_PREFIX = "pi-expanded-dirs:";
function loadExpanded(cwd: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cwd);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveExpanded(cwd: string, set: Set<string>) {
  try { localStorage.setItem(STORAGE_PREFIX + cwd, JSON.stringify([...set])); } catch {}
}
```

### 搜索扁平化
```ts
// 递归收集所有已加载的 entry → [{path, entry}]
// filter → path.toLowerCase().includes(q)
// 搜索结果渲染为扁平行（显示完整路径），不显示树结构
```

### 拖拽 MIME type
```ts
// dragStart: 同时设置 "text/plain" 和自定义 "application/x-pi-file-path"
event.dataTransfer.setData("text/plain", relativePath);
event.dataTransfer.setData("application/x-pi-file-path", absolutePath);
```

### 右键菜单
```ts
// 文件: Copy Relative Path / Copy Absolute Path / Insert Reference to Chat
// 文件夹: Copy Path / Insert Reference to Chat
// 空白处: Refresh
```