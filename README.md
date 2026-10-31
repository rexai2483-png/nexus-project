# NEXUS — AI Computer Operator

NEXUS is a Windows desktop application that will let users issue natural-language
instructions and have an AI operator interact with their computer through
controlled, observable automation.

**This repository currently contains only the project foundation.** There is no
AI reasoning, no AI provider integration, and no computer automation
(mouse/keyboard/screen capture/shell execution) implemented yet — see
[Scope](#scope-of-this-release) below.

## Tech stack

| Layer           | Technology                         |
| --------------- | ----------------------------------- |
| Desktop shell   | Electron                            |
| UI              | React + TypeScript                  |
| Styling         | Tailwind CSS                        |
| Backend runtime | Node.js (inside the Electron main process) |
| Persistence     | SQLite via Prisma ORM               |
| Bundler         | Vite (renderer), `tsc` (main/preload/backend) |

## Architecture

```
electron/            Electron main process + secure preload bridge
  main.ts             App lifecycle, window creation, CSP, IPC/backend bootstrap
  preload.ts           contextBridge: exposes window.nexus — the ONLY API the UI can call
  ipc/handlers.ts      ipcMain.handle registrations, one per channel in shared/types/ipc.ts

backend/              Node.js backend foundation (runs inside the main process)
  db/client.ts         Prisma client + SQLite connection resolution
  services/            One module per domain (settings, tasks, activity, approvals, system)

prisma/
  schema.prisma        Database schema (see Database Foundation below)

shared/types/          Types shared by backend and renderer (models + IPC contract)

src/                   React renderer (Vite root)
  components/          Sidebar, cards, empty states, floating assistant placeholder
  pages/                Overview, Tasks, Activity, Memory, Settings
  App.tsx, main.tsx     App shell and entry point
```

The renderer never imports Node.js, Prisma, or Electron internals — it only talks
to `window.nexus`, a typed object exposed by `electron/preload.ts`. Every method on
it maps to one `ipcMain.handle` channel defined in `shared/types/ipc.ts` and
implemented in `electron/ipc/handlers.ts`, which in turn calls a `backend/services/*`
module. That module is the only code that touches Prisma.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the
  renderer's `BrowserWindow`.
- The preload script exposes a single, narrow, strictly-typed bridge
  (`window.nexus`) via `contextBridge.exposeInMainWorld` — no `ipcRenderer`,
  `require`, filesystem, or shell access reaches the renderer.
- A Content-Security-Policy is applied to every response.
- External links/navigations are opened in the OS browser, never inside the app;
  new `BrowserWindow`/webview creation from renderer content is denied outright.
- No secrets or API keys are stored as database rows — the schema has no table
  for them, and none of the services write credential-shaped data.

## Database foundation

`prisma/schema.prisma` models the following, with IDs, relations, timestamps, and
indexes:

- `UserSettings` — single local settings row
- `Conversation` / `Message` — conversation history
- `Task` / `TaskStep` — task structure (no execution engine yet)
- `ExecutionLog` — append-only log tied to a task/step
- `ApprovalRequest` — human-in-the-loop approval gate (none are created yet)
- `MemoryRecord` — durable context key/value store
- `AgentSession` — a run of the (not yet implemented) agent loop
- `SystemEvent` — append-only system/security event log, shown in the Activity view

SQLite has no native enum type, so enum-like fields are `String` columns; the
canonical list of allowed values for each lives in `shared/types/models.ts` as a
TypeScript union, and is documented with a comment above the corresponding field
in `schema.prisma`.

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Windows 10/11 to run the packaged desktop experience (the renderer/backend code
  is cross-platform and was developed/verified on Linux in this environment)

### Setup

```bash
npm install                 # installs dependencies and runs `prisma generate`
cp .env.example .env         # DATABASE_URL points at prisma/dev.db by default
npm run prisma:migrate       # creates prisma/dev.db and applies the initial migration
```

### Run in development

```bash
npm run dev
```

This starts the Vite dev server (renderer, port 5173), compiles
`electron/`, `backend/`, and `shared/` with `tsc --watch`, and launches
Electron once both are ready. DevTools open automatically.

### Type-check

```bash
npm run typecheck
```

### Production build

```bash
npm run build      # vite build (renderer) + tsc (electron/backend)
npm start           # launches the built app
```

## Available scripts

| Script                  | Purpose                                              |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Full development mode (renderer + main + watch)       |
| `npm run build`          | Production build of renderer and main/preload/backend |
| `npm start`              | Run the production build                              |
| `npm run typecheck`      | Type-check renderer and electron/backend projects      |
| `npm run prisma:generate`| Regenerate the Prisma client                           |
| `npm run prisma:migrate` | Create/apply local SQLite migrations                   |
| `npm run prisma:studio`  | Open Prisma Studio against the local database          |

## Scope of this release

Implemented: Electron shell, secure preload/IPC bridge, React dashboard shell,
Node.js backend foundation, SQLite/Prisma schema, dev/build tooling.

Explicitly **not** implemented yet (by design, for a later phase):

- Any cloud AI integration or AI provider API calls
- Mouse/keyboard automation
- Screen capture
- Arbitrary PowerShell or shell execution
- Autonomous task execution

The dashboard reflects this honestly: Tasks, Activity, and Memory show real
(currently empty) data from the local database rather than simulated content.
