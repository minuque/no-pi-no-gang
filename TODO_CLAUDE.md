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
- [ ] **Loading 动画升级** — `PiLoading.tsx`：π 符号呼吸 + 双环旋转 + 轨道数字粒子 + 点阵背景，替换原简陋 "Loading session..." 文本