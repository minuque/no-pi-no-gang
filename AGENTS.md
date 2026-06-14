# AGENTS.md

## 快速开始

```bash
bun run dev   # 端口 7777
```

类型检查：`node_modules/.bin/tsc --noEmit`
代码检查：`node node_modules/next/dist/bin/next lint`

### 验收标准

提交前必须通过：

```bash
bun run build && bun run start
```

构建成功且服务可正常访问即为通过。开发期间优先用 `bun run dev`，避免频繁构建。

---

## 架构

```
┌──────────────┐      ┌────────────────────────┐      ┌──────────────────┐
│    浏览器     │      │     Next.js 服务端      │      │   AgentSession   │
│              │      │                        │      │    （进程内）     │
└──────┬───────┘      └───────────┬────────────┘      └────────┬─────────┘
       │                          │                            │
       │  [读取]  GET /sessions   │                            │
       │ ────────────────────────▶│  session-reader            │
       │                          │  parse + normalize         │
       │ ◀────────────────────────│                            │
       │          JSON            │                            │
       │                          │                            │
       │  [发送]  POST /agent     │                            │
       │ ────────────────────────▶│  rpc-manager               │
       │                          │  startRpcSession() ───────▶│  prompt()
       │                          │  session.send(cmd) ───────▶│  fork()
       │                          │                            │  navigate()
       │  [流式]  GET /events     │                            │
       │ ────────────────────────▶│  session.onEvent() ◀───────│  subscribe()
       │ ◀────────────────────────│                            │
       │        SSE stream        │                            │

持久层  ~/.pi/agent/
       ├── sessions/<cwd>/<ts>_<uuid>.jsonl   ← 会话文件（reader 读，AgentSession 读写）
       ├── settings.json                      ← 用户设置 & 默认模型
       └── models.json                        ← 可用模型列表
```