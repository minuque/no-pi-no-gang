# AGENTS.md

## 快速开始

```bash
npm run dev   # 端口 7777
```
**开发期间切勿运行 `next build`**——会污染 `.next/` 目录并导致 `npm run dev` 崩坏。

类型检查：`node_modules/.bin/tsc --noEmit`
代码检查：`node node_modules/next/dist/bin/next lint`

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

**浏览会话**（只读）：通过 `lib/session-reader.ts` 直接读取 `.jsonl` 文件——不创建 AgentSession。
**发送消息**：`lib/rpc-manager.ts` 中的 `startRpcSession()` 在进程内创建 AgentSession。

---


