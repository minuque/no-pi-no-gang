# Pi SDK 中文文档

> 来源: https://pi.dev/docs/latest/sdk
> 本文档翻译自 Pi 官方 SDK 文档，内容涵盖了 Pi 的编程接口、核心概念、配置选项及运行模式。

> pi 可以帮助你使用 SDK。让它为你的用例构建集成方案。

SDK 提供了对 Pi 智能体能力的编程接口。用于将 Pi 嵌入其他应用程序、构建自定义界面、或集成到自动化工作流中。

**示例用例：**

* 构建自定义 UI（Web、桌面、移动端）
* 将智能体能力集成到现有应用中
* 创建带有智能体推理的自动化流水线
* 构建可生成子智能体的自定义工具
* 以编程方式测试智能体行为

请参阅 [examples/sdk/](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk) 获取从最小到全功能控制的运行示例。

---

## 快速开始

```
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

// 设置凭据存储和模型注册表
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("当前目录下有哪些文件？");
```

## 安装

```
npm install @earendil-works/pi-coding-agent
```

SDK 已包含在主包中，无需额外安装。

## 核心概念

### createAgentSession()

用于创建单个 `AgentSession` 的主要工厂函数。

`createAgentSession()` 使用 `ResourceLoader` 来提供扩展、技能、提示模板、主题和上下文文件。如果你不提供，它会使用 `DefaultResourceLoader` 进行标准发现。

```
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

// 最小配置：使用 DefaultResourceLoader 的默认值
const { session } = await createAgentSession();

// 自定义：覆盖特定选项
const { session } = await createAgentSession({
  model: myModel,
  tools: ["read", "bash"],
  sessionManager: SessionManager.inMemory(),
});
```

### AgentSession

会话管理代理的生命周期、消息历史、模型状态、压缩和事件流。

```
interface AgentSession {
  // 发送提示并等待完成
  prompt(text: string, options?: PromptOptions): Promise<void>;

  // 在流式传输过程中排队消息
  steer(text: string): Promise<void>;
  followUp(text: string): Promise<void>;

  // 订阅事件（返回取消订阅函数）
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;

  // 会话信息
  sessionFile: string | undefined;
  sessionId: string;

  // 模型控制
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;

  // 状态访问
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;

  // 在当前会话文件内进行原地树导航
  navigateTree(targetId: string, options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string }): Promise<{ editorText?: string; cancelled: boolean }>;

  // 压缩
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;

  // 中止当前操作
  abort(): Promise<void>;

  // 清理
  dispose(): void;
}
```

会话替换 API（如 new-session、resume、fork 和 import）位于 `AgentSessionRuntime` 上，而非 `AgentSession`。

### createAgentSessionRuntime() 和 AgentSessionRuntime

当你需要替换当前会话并重建绑定 cwd 的运行时状态时，使用运行时 API。
这与内置的交互式、打印和 RPC 模式使用同一层。

`createAgentSessionRuntime()` 接收一个运行时工厂函数以及初始的 cwd/会话目标。工厂函数闭包持有进程全局固定输入，为有效 cwd 重建绑定 cwd 的服务，针对这些服务解析会话选项，并返回完整的运行时结果。

```
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});
```

`AgentSessionRuntime` 负责跨以下操作替换当前运行时：

* `newSession()`
* `switchSession()`
* `fork()`
* 通过 `fork(entryId, { position: "at" })` 进行克隆流程
* `importFromJsonl()`

重要行为：

* 上述操作后 `runtime.session` 会发生变化
* 事件订阅绑定到特定的 `AgentSession`，因此替换后需要重新订阅
* 如果使用扩展，需要对新会话再次调用 `runtime.session.bindExtensions(...)`
* 创建时通过 `runtime.diagnostics` 返回诊断信息
* 如果运行时创建或替换失败，该方法会抛出异常，由调用方决定如何处理

```
let session = runtime.session;
let unsubscribe = session.subscribe(() => {});

await runtime.newSession();

unsubscribe();
session = runtime.session;
unsubscribe = session.subscribe(() => {});
```

### 提示与消息排队

`PromptOptions` 控制提示词展开、流式输出时的排队行为以及提示词预检通知：

```
interface PromptOptions {
  expandPromptTemplates?: boolean;
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";
  source?: InputSource;
  preflightResult?: (success: boolean) => void;
}
```

`preflightResult` 在每次调用 `prompt()` 时被调用一次：

* `true` — 提示词被接受、排队或立即处理
* `false` — 提示词预检在接受前拒绝

它在 `prompt()` 解析前触发。`prompt()` 仍然只在完整接受的运行完成后才解析，包括重试。接受后的失败通过正常的事件和消息流报告，而不是通过 `preflightResult(false)`。

`prompt()` 方法处理提示词模板、扩展命令和消息发送：

```
// 基本提示词（非流式输出时）
await session.prompt("What files are here?");

// 带图片
await session.prompt("What's in this image?", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }]
});

// 流式输出期间：必须指定如何排队消息
await session.prompt("Stop and do this instead", { streamingBehavior: "steer" });
await session.prompt("After you're done, also check X", { streamingBehavior: "followUp" });
```

**行为：**

* **扩展命令**（如 `/mycommand`）：立即执行，即使在流式输出过程中也如此。它们通过 `pi.sendMessage()` 自行管理 LLM 交互。
* **基于文件的提示词模板**（来自 `.md` 文件）：在发送或排队前展开为其内容。
* **流式输出期间未指定 `streamingBehavior`**：抛出错误。请直接使用 `steer()` 或 `followUp()`，或指定相应选项。
* **`preflightResult(true)`**：表示提示词已被接受、排队或立即处理。
* **`preflightResult(false)`**：表示预检在接受前已拒绝。

流式输出期间的显式排队：

```
// 在当前助手轮次完成工具调用后，排队发送一条转向消息
await session.steer("New instruction");

// 等待代理完成（仅在代理停止时发送）
await session.followUp("After you're done, also do this");
```

`steer()` 和 `followUp()` 都会展开基于文件的提示词模板，但会在扩展命令上报错（扩展命令不能被排队）。

### 代理与代理状态

`Agent` 类（来自 `@earendil-works/pi-agent-core`）处理核心的 LLM 交互。通过 `session.agent` 访问它。

```
// 访问当前状态
const state = session.agent.state;

// state.messages: AgentMessage[] - 对话历史
// state.model: Model - 当前模型
// state.thinkingLevel: ThinkingLevel - 当前思考级别
// state.systemPrompt: string - 系统提示词
// state.tools: AgentTool[] - 可用工具
// state.streamingMessage?: AgentMessage - 当前部分生成的助手消息
// state.errorMessage?: string - 最新的助手错误

// 替换消息（用于分叉或恢复）
session.agent.state.messages = messages; // 复制顶层数组

// 替换工具
session.agent.state.tools = tools; // 复制顶层数组

// 等待代理完成处理
await session.agent.waitForIdle();
```

### 事件

订阅事件以接收流式输出和生命周期通知。

```
session.subscribe((event) => {
  switch (event.type) {
    // 来自助手的流式文本
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        // 思考输出（如果启用了思考）
      }
      break;

    // 工具执行
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_update":
      // 流式工具输出
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.isError ? "error" : "success"}`);
      break;

    // 消息生命周期
    case "message_start":
      // 新消息开始
      break;
    case "message_end":
      // 消息完成
      break;

    // 代理生命周期
    case "agent_start":
      // 代理开始处理提示词
      break;
    case "agent_end":
      // 代理完成（event.messages 包含新消息）
      break;

    // 轮次生命周期（一次 LLM 响应 + 工具调用）
    case "turn_start":
      break;
    case "turn_end":
      // event.message: 助手的响应
      // event.toolResults: 本轮次的工具结果
      break;

    // 会话事件（排队、压缩、重试）
    case "queue_update":
      console.log(event.steering, event.followUp);
      break;
    case "compaction_start":
    case "compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
      break;
  }
});
```

## 选项参考

### 目录

```
const { session } = await createAgentSession({
  // DefaultResourceLoader 发现的工作目录
  cwd: process.cwd(), // 默认值

  // 全局配置目录
  agentDir: "~/.pi/agent", // 默认值（展开 ~）
});
```

`cwd` 被 `DefaultResourceLoader` 用于：

* 项目扩展（`.pi/extensions/`）
* 项目技能：
  + `.pi/skills/`
  + `cwd` 及其祖先目录中的 `.agents/skills/`（向上直到 git 仓库根目录，不在仓库中则到文件系统根目录）
* 项目提示词（`.pi/prompts/`）
* 上下文文件（从 `cwd` 向上查找的 `AGENTS.md`）
* 会话目录命名

`agentDir` 被 `DefaultResourceLoader` 用于：

* 全局扩展（`extensions/`）
* 全局技能：
  + `agentDir` 下的 `skills/`（例如 `~/.pi/agent/skills/`）
  + `~/.agents/skills/`
* 全局提示词（`prompts/`）
* 全局上下文文件（`AGENTS.md`）
* 设置（`settings.json`）
* 自定义模型（`models.json`）
* 凭据（`auth.json`）
* 会话（`sessions/`）

当你传入自定义的 `ResourceLoader` 时，`cwd` 和 `agentDir` 不再控制资源发现。它们仍然影响会话命名和工具路径解析。

### 模型

```
import { getModel } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// 查找特定的内置模型（不检查 API 密钥是否存在）
const opus = getModel("anthropic", "claude-opus-4-5");
if (!opus) throw new Error("Model not found");

// 按 provider/id 查找任何模型，包括 models.json 中的自定义模型
//（不检查 API 密钥是否存在）
const customModel = modelRegistry.find("my-provider", "my-model");

// 仅获取已配置有效 API 密钥的模型
const available = await modelRegistry.getAvailable();

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium", // off, minimal, low, medium, high, xhigh

  // 用于循环切换的模型（交互模式下按 Ctrl+P）
  scopedModels: [
    { model: opus, thinkingLevel: "high" },
    { model: haiku, thinkingLevel: "off" },
  ],

  authStorage,
  modelRegistry,
});
```

如果未提供模型：

1. 尝试从会话恢复（如果是继续会话）
2. 使用设置中的默认模型
3. 回退到第一个可用的模型

> 参见 [examples/sdk/02-custom-model.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/02-custom-model.ts)

### API 密钥和 OAuth

API 密钥解析优先级（由 AuthStorage 处理）：

1. 运行时覆盖（通过 `setRuntimeApiKey`，不持久化）
2. `auth.json` 中存储的凭据（API 密钥或 OAuth 令牌）
3. 环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
4. 回退解析器（用于 `models.json` 中的自定义提供商密钥）

```
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

// 默认：使用 ~/.pi/agent/auth.json 和 ~/.pi/agent/models.json
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

// 运行时 API 密钥覆盖（不写入磁盘）
authStorage.setRuntimeApiKey("anthropic", "sk-my-temp-key");

// 自定义凭据存储位置
const customAuth = AuthStorage.create("/my/app/auth.json");
const customRegistry = ModelRegistry.create(customAuth, "/my/app/models.json");

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage: customAuth,
  modelRegistry: customRegistry,
});

// 不使用自定义 models.json（仅内置模型）
const simpleRegistry = ModelRegistry.inMemory(authStorage);
```

> 参见 [examples/sdk/09-api-keys-and-oauth.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/09-api-keys-and-oauth.ts)

### 系统提示词

使用 `ResourceLoader` 覆盖系统提示词：

```
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a helpful assistant.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/03-custom-prompt.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/03-custom-prompt.ts)

### 工具

指定要启用的内置工具：

* 内置工具名称：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`
* 默认内置工具：`read`、`bash`、`edit`、`write`
* `noTools: "all"` 禁用所有工具
* `noTools: "builtin"` 禁用默认内置工具，同时保持扩展和自定义工具启用
* `excludeTools` 在应用 `tools` 白名单后，禁用特定的内置、扩展或自定义工具名称

`edit` 工具返回 `details.diff` 供 Pi 的 TUI 显示，以及 `details.patch` 作为标准统一补丁供 SDK 使用者使用。

```
import { createAgentSession } from "@earendil-works/pi-coding-agent";

// 只读模式
const { session } = await createAgentSession({
  tools: ["read", "grep", "find", "ls"],
});

// 选择特定工具
const { session } = await createAgentSession({
  tools: ["read", "bash", "grep"],
});

// 禁用一个工具，同时保持其他工具可用
const { session } = await createAgentSession({
  excludeTools: ["ask_question"],
});
```

#### 自定义 cwd 的工具

当你传入自定义的 `cwd` 时，`createAgentSession()` 会为该 cwd 构建选定的内置工具。

```
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const cwd = "/path/to/project";

// 为自定义 cwd 使用默认工具
const { session } = await createAgentSession({
  cwd,
  sessionManager: SessionManager.inMemory(cwd),
});

// 或为自定义 cwd 选择特定工具
const { session } = await createAgentSession({
  cwd,
  tools: ["read", "bash", "grep"],
  sessionManager: SessionManager.inMemory(cwd),
});
```

> 参见 [examples/sdk/05-tools.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/05-tools.ts)

### 自定义工具

```
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";

// 内联自定义工具
const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});

// 直接传递自定义工具
const { session } = await createAgentSession({
  customTools: [myTool],
});
```

使用 `defineTool()` 进行独立定义，并以数组形式传递，如 `customTools: [myTool]`。内联方式 `pi.registerTool({ ... })` 已经能正确推断参数类型。

通过 `customTools` 传入的自定义工具与扩展注册的工具合并。由 ResourceLoader 加载的扩展也可以通过 `pi.registerTool()` 注册工具。

如果你传入了 `tools` 参数，请包含你想要启用的每个自定义或扩展工具名称，例如 `tools: ["read", "bash", "my_tool"]`。

> 参见 [examples/sdk/05-tools.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/05-tools.ts)

### 扩展

扩展由 `ResourceLoader` 加载。`DefaultResourceLoader` 从 `~/.pi/agent/extensions/`、`.pi/extensions/` 和 settings.json 扩展源中发现扩展。

```
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/path/to/my-extension.ts"],
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("[Inline Extension] Agent starting");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

扩展可以注册工具、订阅事件、添加命令等。完整 API 请参见 [extensions.md](/docs/latest/extensions)。

**事件总线：** 扩展可以通过 `pi.events` 通信。如果需要在外部触发或监听事件，可将共享的 `eventBus` 传递给 `DefaultResourceLoader`：

```
import { createEventBus, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const eventBus = createEventBus();
const loader = new DefaultResourceLoader({
  eventBus,
});
await loader.reload();

eventBus.on("my-extension:status", (data) => console.log(data));
```

> 参见 [examples/sdk/06-extensions.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/06-extensions.ts) 和 [docs/extensions.md](/docs/latest/extensions)

### 技能

```
import {
  createAgentSession,
  DefaultResourceLoader,
  type Skill,
} from "@earendil-works/pi-coding-agent";

const customSkill: Skill = {
  name: "my-skill",
  description: "Custom instructions",
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to",
  source: "custom",
};

const loader = new DefaultResourceLoader({
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/04-skills.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/04-skills.ts)

### 上下文文件

```
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/AGENTS.md", content: "# Guidelines\n\n- Be concise" },
    ],
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/07-context-files.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/07-context-files.ts)

### 斜杠命令

```
import {
  createAgentSession,
  DefaultResourceLoader,
  type PromptTemplate,
} from "@earendil-works/pi-coding-agent";

const customCommand: PromptTemplate = {
  name: "deploy",
  description: "Deploy the application",
  source: "(custom)",
  content: "# Deploy\n\n1. Build\n2. Test\n3. Deploy",
};

const loader = new DefaultResourceLoader({
  promptsOverride: (current) => ({
    prompts: [...current.prompts, customCommand],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参见 [examples/sdk/08-prompt-templates.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/08-prompt-templates.ts)

### 会话管理

会话使用树形结构，通过 `id`/`parentId` 关联，支持原地分支。

```
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// 内存模式（不持久化）
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

// 新建持久化会话
const { session: persisted } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd()),
});

// 继续最近的会话
const { session: continued, modelFallbackMessage } = await createAgentSession({
  sessionManager: SessionManager.continueRecent(process.cwd()),
});
if (modelFallbackMessage) {
  console.log("Note:", modelFallbackMessage);
}

// 打开指定文件
const { session: opened } = await createAgentSession({
  sessionManager: SessionManager.open("/path/to/session.jsonl"),
});

// 列出会话
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// 用于 /new、/resume、/fork、/clone 和导入流程的会话替换 API
const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

// 将会话替换为新的空白会话
await runtime.newSession();

// 将会话替换为另一个已保存的会话
await runtime.switchSession("/path/to/session.jsonl");

// 从指定的用户条目分叉会话
await runtime.fork("entry-id");

// 在指定条目的位置克隆当前路径
await runtime.fork("entry-id", { position: "at" });
```

**SessionManager 树形 API：**

```
const sm = SessionManager.open("/path/to/session.jsonl");

// 会话列表
const currentProjectSessions = await SessionManager.list(process.cwd());
const allSessions = await SessionManager.listAll(process.cwd());

// 树遍历
const entries = sm.getEntries();        // 所有条目（不含头部）
const tree = sm.getTree();              // 完整树结构
const path = sm.getPath();              // 从根节点到当前叶节点的路径
const leaf = sm.getLeafEntry();         // 当前叶节点条目
const entry = sm.getEntry(id);          // 根据 ID 获取条目
const children = sm.getChildren(id);    // 条目的直接子节点

// 标签
const label = sm.getLabel(id);          // 获取条目标签
sm.appendLabelChange(id, "checkpoint"); // 设置标签

// 分支
sm.branch(entryId);                     // 将叶节点移到更早的条目
sm.branchWithSummary(id, "Summary...");  // 带上下文摘要的分支
sm.createBranchedSession(leafId);       // 将路径导出到新文件
```

> 参见 [examples/sdk/11-sessions.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/11-sessions.ts) 和 [Session Format](/docs/latest/session-format)

### 设置管理

```
import { createAgentSession, SettingsManager, SessionManager } from "@earendil-works/pi-coding-agent";

// 默认：从文件加载（全局 + 项目合并）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create(),
});

// 带覆盖
const settingsManager = SettingsManager.create();
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});
const { session } = await createAgentSession({ settingsManager });

// 内存模式（无文件 I/O，用于测试）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  sessionManager: SessionManager.inMemory(),
});

// 自定义目录
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create("/custom/cwd", "/custom/agent"),
});
```

**静态工厂方法：**

* `SettingsManager.create(cwd?, agentDir?)` - 从文件加载
* `SettingsManager.inMemory(settings?)` - 无文件 I/O

**项目特定设置：**

设置从两个位置加载并合并：

1. 全局：`~/.pi/agent/settings.json`
2. 项目：`<cwd>/.pi/settings.json`

项目设置覆盖全局设置。嵌套对象合并键值。设置器默认修改全局设置。

**持久化和错误处理语义：**

* 设置 getter/setter 对内存状态为同步操作。
* 设置器异步排队进行持久化写入。
* 在需要持久化边界时调用 `await settingsManager.flush()`（例如，进程退出前或测试中断言文件内容之前）。
* `SettingsManager` 不会打印设置 I/O 错误。使用 `settingsManager.drainErrors()` 获取错误并在应用层处理。

> 参见 [examples/sdk/10-settings.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/sdk/10-settings.ts)

## ResourceLoader

使用 `DefaultResourceLoader` 来发现扩展、技能、提示词、主题和上下文文件。

```
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
});
await loader.reload();

const extensions = loader.getExtensions();
const skills = loader.getSkills();
const prompts = loader.getPrompts();
const themes = loader.getThemes();
const contextFiles = loader.getAgentsFiles().agentsFiles;
```

## 返回值

`createAgentSession()` 返回：

```
interface CreateAgentSessionResult {
  // 会话
  session: AgentSession;

  // 扩展结果（用于运行时设置）
  extensionsResult: LoadExtensionsResult;

  // 会话模型无法恢复时的警告
  modelFallbackMessage?: string;
}

interface LoadExtensionsResult {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
  runtime: ExtensionRuntime;
}
```

## 完整示例

```
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

// 设置认证存储（自定义路径）
const authStorage = AuthStorage.create("/custom/agent/auth.json");

// 运行时 API 密钥覆盖（不持久化）
if (process.env.MY_KEY) {
  authStorage.setRuntimeApiKey("anthropic", process.env.MY_KEY);
}

// 模型注册表（不使用自定义 models.json）
const modelRegistry = ModelRegistry.create(authStorage);

// 内联工具
const statusTool = defineTool({
  name: "status",
  label: "Status",
  description: "Get system status",
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: "text", text: `Uptime: ${process.uptime()}s` }],
    details: {},
  }),
});

const model = getModel("anthropic", "claude-opus-4-5");
if (!model) throw new Error("Model not found");

// 内存设置（带覆盖）
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 2 },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/custom/agent",
  settingsManager,
  systemPromptOverride: () => "You are a minimal assistant. Be concise.",
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/custom/agent",

  model,
  thinkingLevel: "off",
  authStorage,
  modelRegistry,

  tools: ["read", "bash", "status"],
  customTools: [statusTool],
  resourceLoader: loader,

  sessionManager: SessionManager.inMemory(),
  settingsManager,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Get status and list files.");
```

## 运行模式

SDK 导出了用于在 `createAgentSession()` 之上构建自定义界面的运行模式工具：

### InteractiveMode

完整 TUI 交互模式，包含编辑器、聊天历史和所有内置命令：

```
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

const mode = new InteractiveMode(runtime, {
  migratedProviders: [],
  modelFallbackMessage: undefined,
  initialMessage: "Hello",
  initialImages: [],
  initialMessages: [],
});

await mode.run();
```

### runPrintMode

单次模式：发送提示词，输出结果，退出：

```
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runPrintMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runPrintMode(runtime, {
  mode: "text",
  initialMessage: "Hello",
  initialImages: [],
  messages: ["Follow up"],
});
```

### runRpcMode

JSON-RPC 模式，用于子进程集成：

```
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runRpcMode,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};
const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await runRpcMode(runtime);
```

JSON 协议请参见 [RPC 文档](/docs/latest/rpc)。

## RPC 模式替代方案

对于不使用 SDK 构建的子进程集成，可直接使用 CLI：

```
pi --mode rpc --no-session
```

JSON 协议请参见 [RPC 文档](/docs/latest/rpc)。

以下情况推荐使用 SDK：

* 你需要类型安全
* 你在同一个 Node.js 进程中
* 你需要直接访问 agent 状态
* 你想以编程方式自定义工具/扩展

以下情况推荐使用 RPC 模式：

* 你从其他语言集成
* 你需要进程隔离
* 你正在构建语言无关的客户端

## 导出

主入口导出：

```
// 工厂函数
createAgentSession
createAgentSessionRuntime
AgentSessionRuntime

// 认证与模型
AuthStorage
ModelRegistry

// 资源加载
DefaultResourceLoader
type ResourceLoader
createEventBus

// 辅助工具
defineTool
getAgentDir
getPackageDir
getReadmePath
getDocsPath
getExamplesPath

// 会话管理
SessionManager
SettingsManager

// 工具工厂函数
createCodingTools
createReadOnlyTools
createReadTool, createBashTool, createEditTool, createWriteTool
createGrepTool, createFindTool, createLsTool

// 类型
type CreateAgentSessionOptions
type CreateAgentSessionResult
type ExtensionFactory
type ExtensionAPI
type ToolDefinition
type Skill
type PromptTemplate
type Tool
```

关于扩展类型，完整 API 请参见 [extensions.md](/docs/latest/extensions)。
