# TODO_CODEX.md

## 背景语义

Pi Agent Web 的改进方向不是照搬 Codex Desktop，而是强化自身设计哲学：

- 会话即文件：`.jsonl` 是可读、可重建、可迁移的事实源。
- 上下文可追溯：用户应能理解当前消息、工具调用、文件引用与分支位置之间的关系。
- 分支可解释：必须明确区分文件级 Fork 与同文件内 navigate_tree 分支。
- 工具可控：工具预设、禁用工具、压缩状态、流式状态都应在 UI 中可见、可解释。

后续 AI 修改时，不要把这些 TODO 理解为单纯 UI 美化。目标是让用户更清楚地理解：

1. 我现在在哪个会话/分支上？
2. 这条回答来自哪些上下文与工具调用？
3. 当前文件树和聊天流之间有什么关系？

## 执行追踪总览

- [ ] 左侧会话管理：会话谱系、cwd 过滤、节点状态、Fork 来源、孤立状态说明。
- [ ] 中间 Chat：上下文锚点、Fork/Branch 语义区分、Tool call 摘要、compaction 时间线、SSE 状态、无工具模式提示。
- [ ] 右侧文件树：会话引用文件标记、Context Stack、消息-文件双向关联、FileViewer 视图切换、文件错误态。

## 1. 左侧会话管理：从“会话列表”升级为“会话谱系”

### 语义目标

左侧不只是历史聊天入口，而是任务演化图。用户需要看到会话之间的父子关系、fork 来源、当前项目范围和异常会话状态。

### 可能涉及模块

- `components/SessionSidebar.tsx`
- `components/AppShell.tsx`
- `lib/session-reader.ts`
- `app/api/sessions/route.ts`
- `app/api/sessions/[id]/route.ts`
- `lib/types.ts`

### 待办项

- [ ] 默认以父子树展示会话，突出 `parentSession` 形成的谱系关系。
- [ ] 增加“只看当前 cwd / 按 cwd 分组 / 全部会话”的切换。
- [ ] 每个会话节点显示必要状态：
  - [ ] 模型名称
  - [ ] cwd 简写
  - [ ] 最近更新时间
  - [ ] 是否孤立 `orphaned`
  - [ ] 是否仍在 streaming
  - [ ] 是否发生过 compaction
- [ ] Fork 子会话显示来源语义，例如“从某条用户消息 fork”，而不只是缩进。
- [ ] 孤立会话继续保留不可点击策略，但状态说明更明确。

### 执行注意

- 不要重写整个侧边栏结构；优先复用现有会话树数据。
- 如果 API 当前没有足够元数据，先补最小字段，不要引入复杂索引层。
- `parentSession` 只是显示元数据，不要把它误当成聊天上下文来源。

### 验证点

- 有父子关系的会话能正确嵌套显示。
- 孤立会话仍不可点击，且有明确状态。
- 当前项目过滤不会隐藏当前打开会话。
- 删除或重新关联会话后，树结构仍正确刷新。

## 2. 中间 Chat：从“聊天流”升级为“可审计执行流”

### 语义目标

Chat 区应保持顺滑阅读，但必须让用户知道当前回答处在哪条推理路径上，以及工具调用、压缩、分支切换如何影响上下文。

### 可能涉及模块

- `components/ChatWindow.tsx`
- `components/MessageView.tsx`
- `components/BranchNavigator.tsx`
- `components/ChatInput.tsx`
- `components/ToolPanel.tsx`
- `lib/normalize.ts`
- `lib/types.ts`
- `app/api/agent/[id]/route.ts`
- `app/api/agent/[id]/events/route.ts`
- `app/api/sessions/[id]/context/route.ts`

### 待办项

- [ ] 在消息附近提供轻量上下文锚点：
  - [ ] entryId
  - [ ] leafId / branch 信息
  - [ ] 是否为当前路径上的消息
- [ ] 明确区分两个操作：
  - [ ] Fork：创建新的独立 `.jsonl` 会话文件。
  - [ ] Continue / BranchNavigator：同一个文件内调用 `navigate_tree` 切换分支。
- [ ] Tool call 默认折叠，但摘要必须可扫读：
  - [ ] 工具名
  - [ ] 状态
  - [ ] 简短输入摘要
  - [ ] 简短结果摘要
  - [ ] 失败原因
- [ ] compaction 事件进入时间线，而不是只表现为按钮禁用或 spinner。
- [ ] 页面刷新后 SSE 重连时，Chat 顶部明确显示：
  - [ ] 当前是否 streaming
  - [ ] 当前是否 compacting
  - [ ] thinkingLevel
- [ ] 工具完全禁用时，ChatInput 或状态区清楚显示当前是无工具模式。

### 执行注意

- 不要把调试信息堆满主聊天流；默认轻量展示，展开后才显示细节。
- ToolCall 字段必须经过 `normalizeToolCalls()`，不要直接假设文件字段与 UI 类型一致。
- 同时兼容新版 `compaction_start` / `compaction_end` 和旧版 `auto_compaction_start` / `auto_compaction_end`。

### 验证点

- Fork 后原会话再次请求不会复用已被 fork 改写内部状态的 wrapper。
- 同文件内分支切换后，消息、entryIds、BranchNavigator 状态一致。
- streaming 中刷新页面可以自动重连。
- compaction 开始和结束状态能正确恢复。
- 无工具模式下新会话仍能发送消息。

## 3. 右侧文件树：从“文件浏览器”升级为“上下文工作台”

### 语义目标

右侧文件区不只是打开文件，而是展示 agent 实际使用过、用户正在查看、以及当前会话上下文相关的文件集合。

### 可能涉及模块

- `components/FileExplorer.tsx`
- `components/FileViewer.tsx`
- `components/TabBar.tsx`
- `components/SessionSidebar.tsx`
- `components/ChatWindow.tsx`
- `components/MessageView.tsx`
- `app/api/files/[...path]/route.ts`
- `lib/types.ts`

### 待办项

- [ ] 文件树中标记本轮或当前会话实际引用过的文件。
- [ ] 增加“Context Stack”概念，至少包含：
  - [ ] 用户手动打开的文件
  - [ ] 最近 tool call 涉及的文件
  - [ ] 当前会话上下文相关文件
- [ ] Chat 消息与文件标签建立双向关联：
  - [ ] 点击消息可高亮相关文件。
  - [ ] 点击文件可看到相关消息或最近 tool call。
- [ ] FileViewer 支持基础视图切换：
  - [ ] 当前内容
  - [ ] diff
  - [ ] agent 引用片段
- [ ] 对 cwd 外文件、已删除文件、不可读文件给明确状态，不要静默失败。

### 执行注意

- 先做只读关联和状态标记，不要一开始实现复杂 diff 编辑器。
- 如果 tool call 结果中没有结构化文件信息，只做保守解析或等待后端补字段，不要用脆弱字符串规则大改。
- 文件 API 必须继续防止越权读取。

### 验证点

- 打开文件标签不会破坏 Chat 标签。
- 删除或不可读文件在 FileViewer 中有明确错误态。
- 当前会话引用文件的标记不会误标全项目文件。
- 切换会话后，Context Stack 能随会话更新。

## 推荐实施顺序

1. 先做左侧会话谱系增强，解决“我在哪个任务演化路径上”的问题。
2. 再做中间 Chat 的 Fork / Branch / compaction / streaming 语义澄清。
3. 最后做右侧 Context Stack 与消息-文件关联。

理由：当前最大语义风险不是文件树功能少，而是用户容易混淆文件级 Fork、会话内分支和当前上下文位置。

## 总体验收标准

- 用户不用读源码，也能看懂当前会话、分支、上下文和文件之间的关系。
- AI 后续接手时能从本文件直接定位相关模块、理解语义边界、知道验证点。
- 改动保持手术式：优先补状态、元数据和轻量交互，不做无关重构。
