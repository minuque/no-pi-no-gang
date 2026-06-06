# TODO — pi-web 聊天体验打磨

对齐 Claude Desktop 最新版 Chat 体验，仅列 Web 前端自身改进点。

---

## 高优先级 — 直接影响日常使用

- [ ] **多行输入** — 目前 Enter 直接发送，无法输入多行。改为 Enter 发送、Shift+Enter 换行，对齐 Claude Desktop
- [ ] **输入历史回溯** — 空输入框按 ↑/↓ 导航本次会话已发送的消息，对齐 Claude Desktop
- [ ] **流式光标** — streaming 时消息末尾闪烁块状光标 ▍，结束后消失。Claude Desktop 流式体验的核心视觉锚点，目前缺失
- [ ] **滚动到底按钮** — streaming 中用户上滚查看历史时，右下角浮现 ↓ 按钮；点击回到底部并恢复自动跟随。对齐 Claude Desktop
- [ ] **重新生成** — 最后一条 assistant 消息旁显示重试按钮，用同一 prompt 重新请求。区别于 fork（新会话）和 navigate_tree（分支内回退）
- [ ] **编辑后重发** — 用户消息 hover 出现编辑按钮，原地编辑后重新发送。对齐 Claude Desktop

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

- [ ] **输入区精简** — 底部栏控件过多（模型 / thinking / tools / compact / sound），收进弹出菜单，只保留常用项。对齐 Claude Desktop 极简输入区
- [ ] **模型选择器位置** — 从底部栏上移到输入框上方，更显眼，对齐 Claude Desktop
- [ ] **消息视觉层级** — User 有气泡背景，Assistant 无背景纯文本，层次不均衡。给 Assistant 加轻微背景或增大区分度
- [ ] **消息间距呼吸感** — 连续 assistant 块（文本 → tool call → result → 文本）之间间距偏紧
- [ ] **Thinking 块动态边框** — 当前朴素灰框，streaming 中加 pulsing 左边框或渐变动画
- [ ] **Minimap 尺寸** — 当前 36px 太窄、节点太小难点击，加宽到 44px + 节点增大 + hover tooltip 更醒目
- [ ] **空状态品质感** — 首页仅文字 + typewriter，加 pi logo 图形和背景图案
- [ ] **滚动条抖动** — `scrollbar-width:none` 导致有无滚动条时宽度跳变，改用 `scrollbar-gutter: stable`
- [ ] **暗色代码对比度** — vscDarkPlus 在暗色背景上部分 token 颜色偏暗
- [ ] **过渡动画统一** — 部分交互有 transition（按钮 hover），部分没有（tool call / thinking 展开），统一加 150-200ms ease