# no-pi-no-gang

no-pi-no-gang is a local agent workbench for [pi.dev](https://github.com/badlogic/pi-mono). It combines session browsing, real-time chat, branch navigation, a file workspace, model configuration, and skill management in one browser UI.

The repository is a monorepo with one production architecture: the CLI supervises the Web app and AgentHost, the Web app handles interaction and presentation, and AgentHost owns all agent runtime execution. Pi's `.jsonl` history remains the durable source of truth; no separate business database is introduced.

## Features

| Feature             | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Session browsing    | Group local pi sessions by working directory and inspect history, messages, and branch trees |
| Real-time chat      | Stream replies, tool calls, thinking state, and compaction state over SSE                    |
| Branch operations   | Fork sessions, fork from file context, and navigate SessionRecord branches                   |
| File workspace      | Browse the active working directory, preview files, and insert file context                  |
| Model configuration | Manage providers, models, API keys, and OAuth login from the UI                              |
| Skill management    | Search, install, and inspect local skill configuration                                       |
| Run-state recovery  | Detect active Sessions after refresh and reconnect the RuntimeEvent stream                   |
| Resizable layout    | Dark-first three-column workspace with draggable sidebar and workspace panels                |

## Quick Start

```bash
npm install
npm run build
```

For source development, run AgentHost and the Web app in separate terminals:

```bash
npm run agent-host
npm run dev
```

The Web app uses `http://localhost:7777`; AgentHost listens on `http://127.0.0.1:7789` by default. The published `no-pi-no-gang` CLI is the production entry point and supervises both processes.

## Scripts

| Command                  | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `npm run dev`            | Start the Web development server on port 7777                           |
| `npm run agent-host`     | Start the built AgentHost process on port 7789                          |
| `npm run build`          | Build protocol, runtime adapter, AgentHost, CLI, and Web workspaces     |
| `npm run typecheck`      | Type-check all workspaces                                               |
| `npm run lint`           | Run ESLint across the monorepo                                          |
| `npm run test`           | Run Web and CLI Vitest suites                                           |
| `npm run verify:fast`    | Run type checking, linting, and unit tests                              |
| `npm run verify`         | Run formatting, design, fast checks, and the production build          |
| `npm run verify:release` | Run the full checks, production E2E suite, and installed-package smoke |

See [AGENTS.md](AGENTS.md) for repository-specific workflow and verification rules.

## Architecture

```text
Browser
  │ HTTP + SSE
  ▼
Web (Next.js UI and BFF)
  │ AgentHost protocol
  ▼
AgentHost ── AgentPool ── RuntimeAdapter ── Pi SDK
  │                              │
  └── RuntimeEvent stream        └── SessionRecord JSONL
```

- **AgentHost** is the only owner of runtime creation, commands, Session mutation, tool state, concurrency, and runtime event delivery.
- **AgentPool** lives inside AgentHost and owns active runtime handles, per-Session serialization, active Turns, idle cleanup, and shutdown.
- **Web** owns browser interaction and display state. Its Next.js routes are a BFF: they validate browser requests, proxy AgentHost, and serve Web-only local resources such as file previews.
- **CLI** starts AgentHost before Web, waits for health, forwards configuration, and terminates both process trees together.
- **RuntimeAdapter** is the boundary between AgentHost and a concrete runtime. `runtime-pi` is the pi implementation.

### Shared Terminology

| Term             | Meaning                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `AgentHost`      | Independent service that owns runtime execution and exposes the versioned host API        |
| `AgentPool`      | AgentHost component that owns active runtime handles and their lifecycle                  |
| `Session`        | Durable conversation aggregate identified by a session ID                                |
| `Turn`           | One prompt-to-completion execution within a Session                                      |
| `SessionRecord`  | Immutable persisted record used to reconstruct messages, context, and the branch tree     |
| `RuntimeEvent`   | Runtime-neutral event emitted during execution and delivered through the AgentHost stream |

### Core Paths

| Path               | Entry                                  | Owner                             | Output                                      |
| ------------------ | -------------------------------------- | --------------------------------- | ------------------------------------------- |
| Session read       | `GET /api/sessions*`                   | AgentHost through the Web BFF     | Session summaries, records, tree, context   |
| Session mutation   | `PATCH/DELETE/POST /api/sessions*`     | AgentHost and RuntimeAdapter      | Rename, delete, fork, context navigation    |
| Runtime command    | `POST /api/agent/*`                    | AgentHost and AgentPool           | Prompt, abort, compaction, model, tool state |
| RuntimeEvent stream | `GET /api/agent/[id]/events`           | AgentHost EventBus through Web BFF | SSE events and active Turn state            |
| File preview       | `/api/files/[...path]`                 | Web BFF                           | Workspace file content                      |

### Data Directory

```text
~/.pi/agent/
  sessions/<cwd>/<timestamp>_<uuid>.jsonl
  models.json
  settings.json
```

## Project Structure

```text
apps/
  cli/              Production entry point and dual-process supervisor
  agent-host/       Runtime ownership, AgentPool, HTTP API, events, tools, workspaces
  web/              Next.js UI and browser-facing BFF
packages/
  agent-protocol/   Runtime-neutral contracts and shared terminology
  runtime-pi/       Pi RuntimeAdapter and SessionRecord persistence mapping
docs/adr/           Accepted architecture decisions
scripts/            Build, release, and package smoke helpers
tests/              Cross-workspace Vitest tests
```

## Design Constraints

Visual and component changes must follow [DESIGN.md](DESIGN.md). Prefer existing CSS tokens and avoid one-off colors or styles that do not fit the current dark workbench.

## Related Docs

- [AGENTS.md](AGENTS.md): collaboration, verification, and repository workflow rules
- [DESIGN.md](DESIGN.md): design system and visual tokens
- [Pi_SDK.md](Pi_SDK.md): pi SDK interface reference
- [ROADMAP.md](ROADMAP.md): product and architecture direction
- [docs/adr/](docs/adr/): accepted architecture decisions

## Acknowledgments

This project is forked from [agegr/pi-web](https://github.com/agegr/pi-web). Thanks to the original author for the foundation.

## License

[MIT](LICENSE)
