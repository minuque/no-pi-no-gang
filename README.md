<div align="center">

# no-pi-no-gang

<img src="public/pi-logo.svg" alt="pi logo" width="100" />

**<a href="https://github.com/badlogic/pi-mono">pi.dev</a> Web UI**

<img src="https://img.shields.io/badge/version-0.0.1-blue" alt="version" />
<img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
<img src="https://img.shields.io/badge/Bun-≥1.0-fbf0df?logo=bun&logoColor=000" alt="Bun" />
<img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
<img src="https://img.shields.io/badge/React-19-149eca" alt="React 19" />

English | [中文](README_ZH.md)

</div>

## Overview

no-pi-no-gang is a Web UI for [pi.dev](https://github.com/badlogic/pi-mono) — a complete session experience in the browser, with graphical session browsing, a file workbench, and model configuration. It follows pi's `.jsonl` + `AgentSession` source-of-truth model, with no additional persistence layer.

## Features

| Capability | Description |
|---|---|
| Session Browsing | Aggregate local pi sessions by working directory, read message history and branch trees |
| Real-time Chat | SSE streaming responses, tool calls, thinking/compression state visualization |
| Fork / Branch | File-level fork + in-file message branch switching |
| Model Config | Switch models, configure tool sets, manage providers in the UI |
| Skill Management | Search, install, and inspect skill configurations |
| File Workbench | Sidebar file browser for working directory context |
| Run-state Recovery | Auto-detect and reconnect SSE after page refresh |

## Quick Start

```bash
# Local development
bun install
bun run dev                     # → http://localhost:7777

# Production build
bun run build
bun run start                   # → http://localhost:7777
```

## Architecture

no-pi-no-gang is a Web UI built on pi: the browser handles interaction, the Next.js API layer forwards commands, `AgentSession` runs agent logic, and `~/.pi/agent/` persists history to disk.

![Architecture Overview](docs/architecture.svg)

### Data Directory

Reuses pi's local data — no extra configuration needed:

```text
~/.pi/agent/
  sessions/<cwd>/<timestamp>_<uuid>.jsonl   # Session history
  models.json                                # Model configuration
  settings.json                              # User preferences
```

### Three Main Paths

| Path | Entry | Core | Output |
|---|---|---|---|
| History Read | `GET /api/sessions` | `session-reader.ts` scans & parses `.jsonl` | Session trees, message lists, branch context |
| Command Send | `POST /api/agent/*` | `rpc-manager.ts` manages `AgentSession` lifecycle | Prompt / fork / navigate actions |
| Event Stream | `GET /api/agent/[id]/events` | `session.subscribe()` + SSE | Streaming messages, tool calls, state changes |

### Module Boundaries

| Layer | Responsible for | Not responsible for |
|---|---|---|
| Browser UI | Display sessions, send commands, consume SSE | Direct `.jsonl` reads or agent logic execution |
| Next.js API | Validate requests, read local files, manage SSE | Persisting extra business databases |
| `session-reader.ts` | Read-only historical session parsing | Creating `AgentSession` |
| `rpc-manager.ts` | `AgentSession` lifecycle & command dispatch | Parsing session lists |
| `AgentSession` | Execute pi actions, write session facts | Managing Web UI state |

## Project Structure

```text
app/api/
  agent/          # New session, messages, Fork/Branch, compression, SSE
  sessions/       # Session list, detail, context
  files/          # Working directory file reads
  models/         # Available model list
  models-config/  # models.json read/write & testing
  auth/           # Provider, OAuth, API Key login
  skills/         # Skill search, install, and listing
components/       # Three-column UI, chat stream, session tree, file workbench
hooks/            # Frontend state machine & session event handling
lib/
  session-reader.ts  # .jsonl read, parse, normalize
  rpc-manager.ts     # AgentSession wrapper, lifecycle, command dispatch
  normalize.ts       # Message field compatibility & toolCall normalization
docs/             # Supplementary documentation
bin/              # npm CLI launcher
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Dev server at `localhost:7777` |
| `bun run build` | Production build |
| `bun run start` | Launch built output |
| `bun run lint` | ESLint full-repo check |
| `node_modules/.bin/tsc --noEmit` | Type check |

Pre-commit verification:

```bash
bun run build && bun run start
```

## Related Docs

- [ROADMAP.md](ROADMAP.md) — System architecture, data flow, iteration roadmap
- [TODO.md](TODO.md) — Priority-organized task packages
- [Pi_SDK.md](Pi_SDK.md) — pi SDK interface reference
- [AGENTS.md](AGENTS.md) — Collaboration, verification, and documentation conventions

## Acknowledgments

This project is forked from [agegr/pi-web](https://github.com/agegr/pi-web). Thanks to the original author for their outstanding contribution.

## License

[MIT](LICENSE)
