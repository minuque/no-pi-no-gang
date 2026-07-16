# no-pi-no-gang

no-pi-no-gang 是 [pi.dev](https://github.com/badlogic/pi-mono) 的本地 Agent 工作台，在一个浏览器界面中提供会话浏览、实时对话、分支导航、文件工作台、模型配置和技能管理。

仓库采用唯一的 Monorepo 生产架构：CLI 监督 Web 与 AgentHost 两个进程，Web 负责交互和展示，AgentHost 独占智能体运行时执行。Pi 的 `.jsonl` 历史仍是持久化事实源，不引入额外业务数据库。

## 功能

| 能力          | 说明                                                     |
| ------------- | -------------------------------------------------------- |
| 会话浏览      | 按工作目录聚合本地 Pi Session，读取历史消息和分支树      |
| 实时对话      | 通过 SSE 展示回复、工具调用、思考状态和压缩状态          |
| 分支操作      | Fork Session、从文件上下文 Fork、切换 SessionRecord 分支 |
| 文件工作台    | 浏览工作目录、预览文件、插入文件上下文                   |
| 模型配置      | 管理供应商、模型、API Key 和 OAuth 登录                  |
| 技能管理      | 搜索、安装和查看本地技能配置                             |
| 运行态恢复    | 刷新后检测活动 Session 并重连 RuntimeEvent 流            |
| 可调布局      | 深色三栏工作台，可拖动会话栏和工作区面板                 |

## 快速开始

```bash
npm install
npm run build
```

源码开发时，在两个终端分别启动 AgentHost 与 Web：

```bash
npm run agent-host
npm run dev
```

Web 默认使用 `http://localhost:7777`，AgentHost 默认监听 `http://127.0.0.1:7789`。发布包中的 `no-pi-no-gang` CLI 是生产入口，负责监督两个进程。

## 脚本

| 命令                     | 说明                                                |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | 在 7777 端口启动 Web 开发服务                       |
| `npm run agent-host`     | 在 7789 端口启动已构建的 AgentHost                  |
| `npm run build`          | 构建协议、运行时适配器、AgentHost、CLI 和 Web       |
| `npm run typecheck`      | 检查所有 workspace 的 TypeScript 类型               |
| `npm run lint`           | 检查整个 Monorepo 的 ESLint                         |
| `npm run test`           | 运行 Web 与 CLI 的 Vitest 测试                      |
| `npm run verify:fast`    | 运行类型、Lint 和单元测试                           |
| `npm run verify`         | 运行格式、设计、快速检查与生产构建                  |
| `npm run verify:release` | 运行完整检查、生产 E2E 与安装后 npm 包 smoke test   |

仓库协作和验收规则见 [AGENTS.md](AGENTS.md)。

## 架构

```text
浏览器
  │ HTTP + SSE
  ▼
Web（Next.js UI 与 BFF）
  │ AgentHost 协议
  ▼
AgentHost ── AgentPool ── RuntimeAdapter ── Pi SDK
  │                              │
  └── RuntimeEvent 事件流        └── SessionRecord JSONL
```

- **AgentHost** 是运行时创建、命令、Session 修改、工具状态、并发控制和运行时事件交付的唯一所有者。
- **AgentPool** 位于 AgentHost 内，管理活动运行时句柄、按 Session 串行化、活动 Turn、空闲回收和关闭。
- **Web** 管理浏览器交互与展示状态。Next.js 路由只作为 BFF：校验浏览器请求、代理 AgentHost，并提供文件预览等 Web 专属本地资源。
- **CLI** 先启动 AgentHost，健康检查通过后再启动 Web，传递配置，并统一终止两个进程树。
- **RuntimeAdapter** 隔离 AgentHost 与具体运行时；`runtime-pi` 是 Pi 的实现。

### 统一术语

| 术语            | 含义                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `AgentHost`     | 独立服务，拥有运行时执行并暴露版本化 Host API                        |
| `AgentPool`     | AgentHost 内管理活动运行时句柄及其生命周期的组件                     |
| `Session`       | 由 Session ID 标识的持久化对话聚合                                   |
| `Turn`          | Session 内从一次 prompt 到完成的一轮执行                              |
| `SessionRecord` | 不可变持久化记录，用于重建消息、上下文和分支树                       |
| `RuntimeEvent`  | 执行期间产生、经 AgentHost 事件流交付的运行时无关事件                |

### 核心链路

| 链路             | 入口                                | 所有者                            | 输出                                  |
| ---------------- | ----------------------------------- | --------------------------------- | ------------------------------------- |
| Session 读取     | `GET /api/sessions*`                | AgentHost，经 Web BFF             | Session 摘要、记录、分支树、上下文    |
| Session 修改     | `PATCH/DELETE/POST /api/sessions*`  | AgentHost 与 RuntimeAdapter       | 重命名、删除、Fork、上下文导航        |
| 运行时命令       | `POST /api/agent/*`                 | AgentHost 与 AgentPool            | prompt、abort、压缩、模型和工具状态   |
| RuntimeEvent 流  | `GET /api/agent/[id]/events`        | AgentHost EventBus，经 Web BFF    | SSE 事件与活动 Turn 状态              |
| 文件预览         | `/api/files/[...path]`              | Web BFF                           | 工作区文件内容                        |

### 数据目录

```text
~/.pi/agent/
  sessions/<cwd>/<timestamp>_<uuid>.jsonl
  models.json
  settings.json
```

## 项目结构

```text
apps/
  cli/              生产入口与双进程监督器
  agent-host/       运行时所有权、AgentPool、HTTP API、事件、工具、工作区
  web/              Next.js UI 与面向浏览器的 BFF
packages/
  agent-protocol/   运行时无关契约与统一术语
  runtime-pi/       Pi RuntimeAdapter 与 SessionRecord 持久化映射
docs/adr/           已接受的架构决策
scripts/            构建、发布与 npm 包 smoke test
tests/              跨 workspace Vitest 测试
```

## 设计约束

所有视觉和组件改动必须遵循 [DESIGN.md](DESIGN.md)，优先复用现有 CSS token，避免一次性颜色和样式。

## 相关文档

- [AGENTS.md](AGENTS.md)：协作、验收和仓库工作流
- [DESIGN.md](DESIGN.md)：设计系统与视觉 token
- [Pi_SDK.md](Pi_SDK.md)：Pi SDK 接口参考
- [ROADMAP.md](ROADMAP.md)：产品与架构方向
- [docs/adr/](docs/adr/)：已接受的架构决策

## 致谢

本项目 fork 自 [agegr/pi-web](https://github.com/agegr/pi-web)，感谢原作者奠定基础。

## License

[MIT](LICENSE)
