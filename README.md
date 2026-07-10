<div align="center">

# no-pi-no-gang

<img src="public/pi-logo.svg" alt="pi logo" width="100" />

**[pi.dev](https://github.com/badlogic/pi-mono) Web UI**

<img src="https://img.shields.io/badge/version-0.0.7-blue" alt="version" />
<img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
<img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
<img src="https://img.shields.io/badge/React-19-149eca" alt="React 19" />

English | [Chinese](README_ZH.md)

</div>

## Overview

no-pi-no-gang is a local Web UI for [pi.dev](https://github.com/badlogic/pi-mono). It brings session browsing, real-time chat, branch navigation, a file workspace, model configuration, and skill management into one browser-based workbench.

The app follows pi's `.jsonl` session history and `AgentSession` execution model. It does not add a separate business database.

## Features

| Feature | Description |
| --- | --- |
| Session browsing | Group local pi sessions by working directory and inspect history, messages, and branch trees |
| Real-time chat | Stream replies, tool calls, thinking state, and compression state over SSE |
| Branch operations | Fork sessions, fork from file context, and navigate message branches |
| File workspace | Browse the active working directory, preview files, and insert file context |
| Model configuration | Manage providers, models, API keys, and OAuth login from the UI |
| Skill management | Search, install, and inspect local skill configuration |
| Run-state recovery | Detect running sessions after refresh and reconnect the event stream |
| Resizable layout | Dark-first three-column workspace with draggable sidebar and workspace panels |

## Quick Start

```bash
npm install
npm run dev
```

The default development server runs at `http://localhost:7777`.

For agent verification or parallel local work, use a separate port:

```bash
npx next dev -p 7788 --hostname 127.0.0.1
```

Production build:

```bash
npm run build
npm run start
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server through the watchdog |
| `npm run dev:raw` | Start Next dev directly on port 7777 |
| `npm run dev:light` | Start a lower-memory dev mode on port 7777 |
| `npm run build` | Build for production and generate the external modules manifest |
| `npm run start` | Start the production server on port 7777 |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint across the repository |
| `npm run test` | Run Vitest |
| `npm run format:check` | Check formatting with Prettier |
| `npm run lint:design` | Validate DESIGN.md |

## Verification

Run after changes:

```bash
npm run typecheck
npm run lint
```

Run before shipping:

```bash
npm run build
```

See [AGENTS.md](AGENTS.md) for repository-specific agent workflow and verification rules.

## Architecture

The browser owns interaction and display state. The Next.js API layer handles local file access, session history reads, command forwarding, and SSE. pi's `AgentSession` performs the actual agent work and keeps writing session history to the local pi data directory.

![Architecture Overview](docs/architecture.svg)

### Data Directory

```text
~/.pi/agent/
  sessions/<cwd>/<timestamp>_<uuid>.jsonl
  models.json
  settings.json
```

### Core Paths

| Path | Entry | Core module | Output |
| --- | --- | --- | --- |
| History read | `GET /api/sessions` | `lib/session-reader.ts` | Session lists, messages, branch context |
| Command send | `POST /api/agent/*` | `lib/session-bridge.ts`, `lib/pi/pi-command-dispatcher.ts` | Messages, forks, navigation, compression actions |
| Event stream | `GET /api/agent/[id]/events` | `lib/session-pool.ts`, `AgentSession.subscribe()` | SSE messages, tool calls, run state |
| Model config | `/api/models*`, `/api/models-config*` | pi model configuration read/write | Providers, models, authentication state |
| Skill config | `/api/skills*` | Skill search, install, and list APIs | Local skill lists and install results |
| File reads | `/api/files/[...path]` | Local path validation and file reads | Workspace file content |

## Project Structure

```text
app/api/              Next.js API routes
components/           Three-column UI, chat stream, config panels, workspace
hooks/                Frontend session state and event handling
lib/                  pi bridge, session reads, event normalization, shared types
lib/pi/               pi command dispatch
lib/types/            Message, session, and RPC types
docs/                 Architecture diagrams and supplementary docs
bin/                  npm CLI entry
public/               Static assets
scripts/              Dev watchdog and build helper scripts
tests/                Vitest tests
```

## Design Constraints

Visual and component changes must follow [DESIGN.md](DESIGN.md). Prefer existing CSS tokens and avoid one-off colors or styles that do not fit the current dark workbench.

## Related Docs

- [AGENTS.md](AGENTS.md): Collaboration, verification, and repository workflow rules
- [DESIGN.md](DESIGN.md): Design system and visual tokens
- [Pi_SDK.md](Pi_SDK.md): pi SDK interface reference
- [TODO.md](TODO.md): Task breakdown and priorities
- [docs/architecture.html](docs/architecture.html): Architecture documentation page

## Acknowledgments

This project is forked from [agegr/pi-web](https://github.com/agegr/pi-web). Thanks to the original author for the foundation.

## License

[MIT](LICENSE)
