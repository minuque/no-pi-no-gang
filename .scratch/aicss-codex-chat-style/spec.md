# Codex Chat Style Specification

Status: ready for tickets
Prototype verdict: A — Narrative stream

## Outcome

在不改变 AgentSession、AgentEvent、PiCommand、工具能力和会话文件格式的前提下，保留现有 Claude 聊天面，并新增 Codex 聊天呈现模式。两种模式消费同一标准化消息 view model，共用发送、中止、附件、命令、模型、思考级别和工具结果配对逻辑。

## Product contract

- `ChatStyle` 仅是全局 UI 偏好，取值为 `claude | codex`，不写入 Session。
- 默认值为 `claude`；只有用户主动切换后才持久化。
- 切换入口位于聊天区右上工具栏，显示 Claude/Codex 二态；切换后当前及其他 Session 立即重绘。
- 切换范围覆盖消息区、输入区、thinking 与 tool activity；侧栏、Workspace、工作台布局和全局主题不变。
- Claude renderer 的结构、视觉与交互保持原样；不得通过共享 CSS 选择器造成外观漂移。

## Selected visual model

A「叙事流」是唯一生产基线：

- 单列内容流，桌面原型基线宽度为 780px；实现时在 `DESIGN.md` 定义聊天区作用域 token，不在组件内散落该值。
- 用户消息为右对齐气泡；Agent 输出为无气泡正文。
- thinking、tool activity、File Diff 与正文严格按真实事件顺序内联，不建立常驻执行侧栏。
- 已完成活动保持低视觉权重，正文是最终阅读焦点；失败活动保持显著但不使用独立全屏错误面板。
- 输入区贴合内容列底部，沿用现有输入行为，只允许视觉重排。
- 不引入 B 的执行台账侧栏，不引入 C 的终端式 USER/CODEX 元数据标签。

## Real event mapping

| Real input | Codex presentation | Fallback |
| --- | --- | --- |
| user text/image | 右对齐消息气泡；图片沿用真实附件数据 | 未知 block 使用现有安全降级 |
| thinking block | 可折叠 thinking 行 | 无持续时间时不伪造秒数 |
| text block | 无气泡 Markdown 正文 | 流式阶段保留文本与光标 |
| toolCall + result | Activity 行与真实结果详情 | 未识别工具使用通用 Activity |
| edit/write + diff 数据 | Activity 后紧随 File Diff | 缺少真实 diff 时回退通用 Activity |
| Markdown fenced code | Codex 代码块适配 | 沿用现有 Markdown AST |
| Markdown table/task list | Codex 表格与任务列表适配 | 不推断 Comparison Table |
| image block/result | 图片内容块 | 加载失败显示可读失败态 |

不得从普通文本猜测 Web Search、Citation、Comparison Table、File Diff 或 Image Generation。当前没有结构化 citation 数据，因此不实现引用组件。

## State behavior

### Conversation

- 空闲：显示可输入状态，不展示虚构活动。
- 等待模型：显示真实 waiting phase，输入保留中止能力。
- 流式正文：正文原位增长并显示光标；完成后光标消失，Markdown 保持同一布局。
- 长对话：历史内容不因 streaming 状态整体重排；自动滚动沿用现有规则。

### Thinking

- 运行中默认展开，状态文案为 `Thinking`，具有非颜色状态标识。
- 完成后默认折叠，摘要为 `Thought for Ns`；仅在真实持续时间存在时显示秒数，否则显示 `Thought`。
- 用户可再次展开；展开状态只属于当前渲染，不写入 Session。

### Tools

- 运行中默认展开并显示真实工具名与输入摘要。
- 成功后默认折叠为活动摘要；持续时间仅来自真实时间数据。
- 失败后保持展开，显示错误详情与可恢复上下文。
- 未知或第三方工具始终使用通用 Activity，不因名称相似而套专用组件。
- edit/write 仅在有真实 diff 时展示 File Diff；Diff 必须支持长路径、长行和水平滚动。

## Input contract

- Codex 输入区可重排模型、思考级别、工具预设、附件与发送按钮。
- 快捷键、slash command、附件限制、发送、中止、重试、cwd 与模型切换语义完全复用现有控制层。
- textarea 聚焦时左右方向键不得触发任何聊天样式或原型切换。
- sending/streaming 时的 disabled、abort 与 retry 状态必须与 Claude 路径一致。

## Responsive contract

- 320px：单列、无水平页面溢出；活动详情可截断但工具名与状态必须可读；输入控件可换行。
- 768px：保持单列叙事流；不出现 B 式侧栏。
- 1024px 与 1440px：内容列居中，行长不随窗口无限增长；右上 ChatStyle 入口保持可达。
- 代码、表格与 Diff 只允许自身横向滚动，不得撑宽页面。
- 长路径、长英文、中文、混合语言和 200% 浏览器缩放不得遮挡主要操作。

## Theme and motion

- 暗色与亮色均只使用现有语义 token；新增值必须先作为 Codex 聊天区作用域 token 写入 `DESIGN.md`。
- 不修改全局主题 token，不使用 raw color、inline style 或一次性视觉值。
- 动画仅表达展开、状态变化与流式光标，使用现有 motion token。
- `prefers-reduced-motion: reduce` 下停止脉冲、闪烁和位移动画，但保留非颜色状态文案。

## Accessibility

- thinking 与 activity 使用原生 button，暴露 `aria-expanded`；状态不可只靠颜色表达。
- 所有图标按钮有可访问名称；失败、运行、完成状态有可读文本。
- 键盘顺序与视觉顺序一致；所有交互均有可见 focus。
- 使用语义 heading、list、table、code、image alt；保持页面 heading 层级。
- 暗色与亮色均达到 WCAG 2.1 AA；320px 与 200% 缩放无内容丢失。
- streaming 更新不得抢夺焦点；必要的状态播报使用克制的 live region，避免逐 token 播报。

## Screenshot matrix

实现验收必须保存同一 fixture 的暗色与亮色截图，至少覆盖：

1. 空闲与等待模型。
2. 流式 thinking 与已完成折叠 thinking。
3. 工具运行、成功折叠、失败展开。
4. edit/write File Diff。
5. 流式正文与完成 Markdown。
6. 代码块、表格、任务列表和图片。
7. 320、768、1024、1440px。
8. reduced motion。
9. Claude 模式同 fixture 的回归基线。

## Claude zero-regression gate

- 默认启动、无已有偏好和升级后的用户均进入 Claude。
- Claude 消息、thinking、工具、Markdown、输入区与快捷键截图不变。
- 切换到 Codex 再切回 Claude 后，消息数据、scroll anchor、输入草稿、附件和 streaming 状态不丢失。
- ChatStyle 不进入 Agent 请求、Session 元数据、JSONL 或后端 API。

## Verification gate

实现完成后必须通过：

```powershell
npm run verify:fast
npm run verify
```

并在 Chrome 中完成控制台清洁、键盘流、全部截图矩阵和 Claude 零回归检查。若改动根包依赖或发布运行时 import，追加 `npm run verify:release`。

## Prototype disposition

- 当前 `/prototype/codex-chat?variant=a|b|c` 是一次性证据，不是生产实现。
- 开始实现时先把完整原型捕获到 throwaway branch，并在实现票中记录分支指针与 A 胜出的原因。
- 生产组件必须按正式错误处理、测试和可维护性标准重写 A；不得直接复制原型组件。
- 主实现完成后，从主分支删除原型路由、B/C 方案和 variant switcher。
