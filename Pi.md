# PI架构深度解析 - 视频内容汇总

> 原视频：*PI Architecture EXPLAINED | Agent Loop, Tools, TUI and More*  
> B站 YouDub 翻译：【必看】PI架构深度解析｜Agent循环、工具调用、TUI与更多  
> 频道：63号炼金工坊 | 作者：Mario Zechner (badlogic) | 版本：v0.73.0 | License：MIT

---

## 一、Pi 的核心理念：极简内核

Pi 刻意不包含的功能：

| 不包含 | 原因 |
|--------|------|
| ❌ MCP | CLI 工具 + Skills 足够，扩展可自行添加 |
| ❌ 子代理 (Sub-agents) | 用 tmux 开多个 Pi 实例，或通过扩展构建 |
| ❌ 权限弹窗 | 放容器里跑，或扩展自定义确认流程 |
| ❌ Plan 模式 | 计划写到文件里 |
| ❌ 内置 Todo | 作者认为会干扰模型判断 |

---

## 二、四层架构

```
pi-coding-agent (应用层)
    ↓
pi-agent-core (Agent 运行时)  ← 418 行核心循环
    ↓
pi-ai (统一 LLM API)  ← 26 个供应商 / 10 套 API 实现
    ↓
pi-tui (终端 UI 引擎)  ← 差分渲染，60fps
```

### 2.1 pi-ai：统一多供应商 LLM API

- 26 个供应商：Anthropic、OpenAI、Google Gemini、DeepSeek、Groq、xAI、OpenRouter、Bedrock、Mistral、小米MiMo 等
- 10 套底层 API 实现
- 统一流式/非流式接口、工具调用、Token 成本追踪

### 2.2 pi-agent-core：Agent 运行时

- 418 行核心循环
- 支持并行工具执行（默认并发，可切换为顺序）
- **Steering 消息**：不打断当前回合，实时插入指令
- **Follow-up 消息**：等 Agent 停下后才交付
- 20+ 生命周期事件，全面可观测

### 2.3 pi-tui：差分渲染终端 UI

- 只重绘变化的单元格，零闪烁
- 16ms 节流（~60fps）
- 支持 Kitty 图形协议（终端内显示图片）
- 硬件光标支持（APC 转义序列，IME 定位）

### 2.4 pi-coding-agent：四种运行模式

| 模式 | 用途 |
|------|------|
| TUI | 全功能终端界面 |
| Print (`-p`) | 单次脚本执行，纯 stdout |
| RPC | JSONL 协议，适合 IDE/工具集成 |
| SDK | 作为库嵌入其他 Node.js 应用 |

---

## 三、7 个核心工具

| 工具 | 分类 | 亮点 |
|------|------|------|
| `read` | 文件读取 | 可配置最大行数/字节数，截断提示 |
| `bash` | 命令执行 | 流式输出，进程树清理，10MB 上限+临时文件回退 |
| `edit` | 精确编辑 | 多编辑一次调用，非重叠验证，反向顺序应用，模糊匹配回退 |
| `write` | 文件写入 | 整个文件写入，自动创建父目录 |
| `grep` | 内容搜索 | 正则内容搜索 |
| `find` | 文件查找 | 文件名模式查找 |
| `ls` | 目录列表 | 目录内容列表 |

### edit 工具的精妙设计（核心亮点）

- 不是 diff/补丁模式，而是 oldText → newText 精确替换
- 单次调用支持多个不相交编辑
- 从文件底部往上应用（反向顺序），保持行号稳定
- 精确匹配失败 → 模糊匹配回退（处理 Unicode 引号、特殊空格等）
- 唯一性验证：oldText 必须恰好出现一次

### bash 工具的安全设计

- 独立进程树，中断时整个树被杀死，不留孤儿进程
- 输出超出 10MB → 写入 `/tmp/pi-bash-*.log` 并告知模型路径
- 扩展可拦截命令（`BashSpawnHook`）

---

## 四、树形 JSONL 会话系统（v3）

Pi 最独特的设计之一：**单个 JSONL 文件内嵌树结构**。

```
会话文件 (.jsonl)
├── 用户消息 (id: abc, parent: null)
│   ├── AI回复 (id: def, parent: abc)
│   │   └── 工具结果 (id: ghi, parent: def)
│   └── 🔀 分支点 → AI另一条回复 (id: jkl, parent: abc)
├── 压缩记录 (type: compaction)
├── 标签 (type: label: "重要节点")
└── 模型切换 (type: model_change)
```

核心能力：
- `/tree` 命令：可视浏览、搜索、折叠/展开会话树
- **原地分支**：跳转到任意点 fork，不创建新文件
- **自动压缩**：Token 接近上限时 LLM 自己总结旧消息
- **标签/书签**：标记关键节点快速跳转

---

## 五、扩展系统

扩展通过 **jiti**（TypeScript 运行时执行器）加载，可 hook 20+ 生命周期事件。

**ExtensionAPI 提供的接口：**
- `pi.on(event, handler)` — 订阅事件
- `pi.registerTool(tool)` — 注册 LLM 可调用工具
- `pi.registerCommand(name, options)` — 注册 slash 命令
- `pi.registerShortcut(keyId, options)` — 键盘快捷键
- `pi.registerProvider(name, config)` — 注册自定义 LLM 供应商

**Pi Packages（Pip）：**
- 通过 `pi install npm:xxx` 或 `pi install git:xxx` 安装
- 共享扩展、Skills、提示模板、主题
- 真正的生态体系

---

## 六、与传统 Agent 对比

| 特性 | Pi Mono | Claude Code |
|------|---------|-------------|
| 语言 | TypeScript | TypeScript (Bun) |
| 工具协议 | JSON Function Calling (TypeBox) | MCP |
| 编辑方式 | **精确文本替换** | Diff |
| 会话格式 | **树形 JSONL** | 专有格式 |
| TUI | 差分渲染（仅重绘变化单元格） | React/Ink |
| 运行模式 | **4 种** | 1 种 |
| Web UI | ✅ Lit 组件 + JS REPL | ❌ |
| 包系统 | ✅ Pi Packages | ❌ |
| 模型数 | 26 供应商 (10 API) | Anthropic 仅 |
| License | **MIT** | 专有 |
| 权限系统 | ❌ 通过扩展实现 | ✅ 内置 |
| MCP 支持 | ❌ 刻意不含 | ✅ 核心特性 |
| 子代理 | ❌ 通过扩展实现 | ✅ 内置 |

---

## 七、优势与劣势

### 优势
- 极简哲学：只给必须的，其余通过扩展/Packages 按需添加
- 树形会话：单文件管理复杂对话分支
- 四种运行模式：最灵活的部署选择
- 精确文本编辑：非重叠编辑，模糊匹配，多编辑一次调用
- 26 供应商覆盖：真正多模型无关
- 差分 TUI：最高效的终端渲染方案
- Pi Packages：npm/git 安装的共享生态
- 并行工具执行（默认）
- Web UI：Lit 组件 + 沙盒 iframe + JS REPL

### 劣势
- 无内置权限：必须通过扩展或容器
- 无 MCP 互操作：需自定义扩展
- 无子代理：不能原生委派
- 仅 7 个核心工具：相比 Claude Code 40+ 较少
- 较小生态
- 学习曲线：扩展优先意味着更多前期工作
- Node.js 依赖

---

## 八、核心观点

1. **少即是多**：418 行 Agent 循环跑赢上千行的框架
2. **扩展优先**：只给锋利的刀，按你的方式构建一切
3. **树形会话**：单文件管理复杂对话分支
4. **差分 TUI**：最高效的终端渲染
5. **Pi 适合谁**：喜欢极简、可控、开源透明的开发者，愿意自己动手打造工作流

---

# 停止给Claude写提示词，改用Karpathy的方法 - 视频内容汇总

> 原视频：*Stop Prompting Claude. Use Karpathy's Method Instead.*  
> 作者：Austin Marchese | 发布日期：2026-06-09  
> B站 YouDub 翻译 | 频道：63号炼金工坊

---

## 一、核心主题

多数人对 Claude 的提示词使用方式有误。Andrej Karpathy 提出了一套三层方法，能将 AI 开发效率提升 10 倍。

---

## 二、三层方法

### 🥇 第一层：需求规范（Spec）

**问题**：AI 缺乏上下文感知能力，直接写提示词效果不佳。

**三步制定规范**：
1. **明确目标** — 清晰定义你想要什么
2. **敏捷迭代** — 快速试错、持续调整
3. **精准表述** — 最终生成贴合实际需求的规范

> 关键是先花时间把需求规范写清楚，而非上来就写提示词。

### 🥈 第二层：验证器（Verifier）

**Karpathy 的"动物 vs 幽灵"类比**：AI 本质是统计模型——不是真正理解，而是模式匹配。

**验证三要点**：
1. **提前设定评估标准** — 先定义什么叫"好"
2. **用第二个 AI 模型做评审** — 让另一个模型检查输出质量
3. **引入外部信号辅助验证** — 如测试用例、实际运行结果等

> 强调反馈循环对持续提升输出质量至关重要。

### 🥉 第三层：工作环境（Environment）

将 AI 工作环境类比为"工作坊"，搭建高效环境的四个步骤：
1. **配置 `claude.md` 文件** — 设定项目全局上下文和规范
2. **构建 LLM 知识库** — 沉淀领域知识供 AI 调用
3. **积累自定义技能** — 形成可复用的工作流和能力
4. **设置 AI 操作权限规则** — 明确 AI 能做什么、不能做什么

---

## 三、AI 时代的核心观点

> **"你可以外包思考，但不能外包理解。"**

AI 可以帮你执行和产出，但你对问题的深层理解永远不能丢。

---

## 四、一句话总结

不要上来就写提示词，而是先写清楚需求规范 → 建立验证反馈机制 → 搭好稳定的工作环境，这才是高效使用 Claude 的正确姿势。
