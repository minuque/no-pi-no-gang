# no-pi-no-gang

<p align="center">
  <img src="public/pi-logo-on-dark.svg" alt="pi logo" width="120" />
</p>

<p align="center">
  <strong><a href="https://github.com/badlogic/pi-mono">pi.dev</a> WebUI</strong>
  <br />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.0.1-blue" alt="version 0.0.1" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license" />
  <img src="https://img.shields.io/badge/Bun-≥1.0-fbf0df?logo=bun&logoColor=000" alt="Bun" />
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-149eca" alt="React 19" />
</p>

## 项目定位

no-pi-no-gang 是 [pi.dev](https://github.com/badlogic/pi-mono) 的 Web UI——在浏览器中提供 pi 的完整会话体验，并附带图形化的会话浏览、文件工作台和模型配置。

- **极简内核**：沿用 pi 的 `.jsonl` + `AgentSession` 事实源模型，不引入额外持久层
- **界面可扩展**：会话、模型、工具、技能均通过 UI 配置，不锁定供应商

**核心事实源：**

| 事实源 | 存储内容 |
|---|---|
| `~/.pi/agent/sessions/**/*.jsonl` | 历史消息、分支树、工具调用、压缩记录 |
| `AgentSession`（运行时） | 当前智能体活动态、事件流 |
| 本地工作目录 | 文件浏览、上下文定位、任务执行范围 |
| `~/.pi/agent/models.json` / `settings.json` | 模型供应商、认证、用户偏好 |

## 功能

| 能力 | 说明 |
|---|---|
| 会话浏览 | 按工作目录聚合本地 pi 会话，读取历史消息和分支树 |
| 实时对话 | 通过 SSE 接收 `AgentSession` 事件，展示流式响应、工具调用和运行状态 |
| Fork / Branch | 支持文件级 Fork 新会话，也支持同一会话文件内切换消息分支 |
| 执行流审计 | 展示工具调用、上下文压缩、思考状态、错误态和完成状态 |
| 模型与工具配置 | 在界面中切换模型、配置工具集、管理模型供应商配置 |
| 技能管理 | 搜索、安装和查看可用技能配置 |
| 文件工作台 | 侧边栏浏览工作目录文件，辅助追溯消息与文件上下文 |
| 运行态恢复 | 页面刷新后检查会话运行状态，仍在运行时自动重连 SSE |

## 快速开始

### 本地开发

```bash
bun install
bun run dev
```

默认访问地址：

```text
http://localhost:7777
```

开发期间不要运行 `next build`。如需验证代码，优先使用类型检查和 lint。

### 命令行启动

发布包包含 `no-pi-no-gang` 可执行入口。安装后可用：

```bash
npx @minuque/no-pi-no-gang
```

CLI 默认端口是 `30141`，可通过参数覆盖：

```bash
npx @minuque/no-pi-no-gang --port 7777
npx @minuque/no-pi-no-gang --hostname 127.0.0.1 --port 7777
```

## 配置与数据

no-pi-no-gang 复用 pi 智能体的本地数据目录：

```text
~/.pi/agent/
  sessions/<cwd>/<timestamp>_<uuid>.jsonl
  settings.json
  models.json
```

常见配置入口：

| 文件 / API | 用途 |
|---|---|
| `~/.pi/agent/sessions/**.jsonl` | 会话历史、消息树、工具调用与压缩记录 |
| `~/.pi/agent/models.json` | 模型供应商和可用模型配置 |
| `app/api/models-config` | 读取和写入模型配置 |
| `app/api/auth/*` | 登录、登出、API Key 和 OAuth provider 状态 |
| `app/api/default-cwd` | 创建默认工作目录 `~/pi-cwd-YYYYMMDD` |

## 架构概览

no-pi-no-gang 是 pi 智能体的 Web 外壳：浏览器负责交互，Next.js API 负责读取本地数据和转发命令，真正的智能体运行在进程内 `AgentSession`，历史事实落在 `~/.pi/agent/`。

![架构总览](docs/architecture.svg) 

> 交互式版本 by `architecture-diagram`：[docs/architecture.html](docs/architecture.html)

### 三条主链路

| 链路 | 入口 | 服务端核心 | 输出 |
|---|---|---|---|
| 历史读取 | `GET /api/sessions` | `session-reader.ts` 扫描并解析 `.jsonl` | 会话树、消息列表、分支上下文 |
| 命令发送 | `POST /api/agent/new` / `POST /api/agent/[id]` | `rpc-manager.ts` 创建或复用 `AgentSession` | `prompt()`、`fork()`、`navigate()` 等运行态动作 |
| 事件流 | `GET /api/agent/[id]/events` | `session.subscribe()` + SSE route | 流式消息、工具调用、思考态、压缩态、完成态 |

### 模块边界

| 层级 | 职责 | 不负责 |
|---|---|---|
| 浏览器 UI | 展示会话、发送命令、消费 SSE、管理局部交互状态 | 直接读写 `.jsonl` 或执行智能体逻辑 |
| Next.js API | 校验请求、读取本地文件、管理 SSE 连接、调用服务端核心模块 | 保存额外业务数据库 |
| `session-reader.ts` | 只读解析历史会话，做字段兼容和工具调用规范化 | 创建 `AgentSession` 或产生运行副作用 |
| `rpc-manager.ts` | 维护进程内 `AgentSession`、启动锁、空闲清理和命令分发 | 解析历史会话列表 |
| `AgentSession` | 执行 pi 智能体动作并写入会话事实 | 管理 Web UI 状态 |
| `~/.pi/agent/` | 保存会话、模型、用户设置和默认工作目录信息 | 承担服务端缓存或派生视图 |

架构路线见 [ROADMAP.md](ROADMAP.md)。

## 项目结构

```text
app/
  api/
    agent/          # 新建会话、发送消息、Fork、Branch、压缩、SSE
    sessions/       # 会话列表、会话详情、上下文读取
    files/          # 工作目录文件读取
    models/         # 可用模型列表
    models-config/  # models.json 读写与测试
    auth/           # provider、OAuth、API Key 登录状态
    skills/         # 技能搜索、安装和列表
components/         # 三栏 UI、聊天流、会话树、文件工作台
hooks/              # 前端状态机与会话事件处理
lib/
  session-reader.ts # .jsonl 读取、解析、规范化
  rpc-manager.ts    # AgentSession 包装、生命周期和命令分发
  normalize.ts      # 消息字段兼容和 toolCall 规范化
docs/               # 通信流程等补充文档
bin/                # npm CLI 启动入口
```

## 开发脚本

| 命令 | 说明 |
|---|---|
| `bun run dev` | 启动 Next.js 开发服务，端口 `7777` |
| `bun run dev:light` | 低内存开发模式，绑定 `127.0.0.1:7777` |
| `node_modules/.bin/tsc --noEmit` | 类型检查 |
| `node node_modules/next/dist/bin/next lint` | Next lint |
| `bun run lint` | ESLint 全仓检查 |
| `bun run build` | 生产构建（Turbopack） |
| `bun run start` | 启动已构建产物，端口 `7777` |

### 验收标准

提交前必须通过：

```bash
bun run build && bun run start
```

构建成功且服务可正常访问即为通过。开发期间避免频繁构建，优先用 `bun run dev`。

## 相关文档

- [ROADMAP.md](ROADMAP.md)：由远到近的系统架构、数据流和状态说明
- [TODO.md](TODO.md)：按权重组织的任务包和后续迭代边界
- [Pi_SDK.md](Pi_SDK.md)：pi SDK 相关接口说明
- [AGENTS.md](AGENTS.md)：本仓库的协作、验证和文档约束

## 贡献与验证

提交前必须通过验收标准：

```bash
bun run build && bun run start
```

变更相关验证：

```bash
node_modules/.bin/tsc --noEmit
node node_modules/next/dist/bin/next lint
```

文档类修改建议额外检查：

```bash
git diff --check -- README.md
```

修改原则：

- 保持 `.jsonl`、`AgentSession`、工作目录三类事实源语义清晰。
- 区分文件级 Fork 和同文件内 Branch，不混用术语。
- 只改当前任务需要的范围，不顺手重构无关模块。
- 新增行为要能从 API、状态机或文档入口追溯到验证方式。

## License

[MIT](LICENSE)
