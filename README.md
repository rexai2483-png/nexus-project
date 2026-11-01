# NEXUS — AI Computer Operator

NEXUS is a Windows desktop application that lets users issue natural-language
instructions and have an AI operator interact with their computer through
controlled, observable automation.

**This repository currently contains the application foundation plus the first
AI intelligence layer: conversation and task planning.** NEXUS can hold a
context-aware conversation, classify what you're asking for, and — for
computer tasks — propose a structured, step-by-step plan for a human to
review. **It does not execute anything yet**: no mouse/keyboard automation, no
screen capture, no shell execution — see [Scope](#scope-of-this-release) below.

## Tech stack

| Layer           | Technology                         |
| --------------- | ----------------------------------- |
| Desktop shell   | Electron                            |
| UI              | React + TypeScript                  |
| Styling         | Tailwind CSS                        |
| Backend runtime | Node.js (inside the Electron main process) |
| Persistence     | SQLite via Prisma ORM               |
| AI provider     | Anthropic (Claude), via a provider-agnostic interface |
| Bundler         | Vite (renderer), `tsc` (main/preload/backend) |

## Architecture

```
electron/            Electron main process + secure preload bridge
  main.ts             App lifecycle, window creation, CSP, IPC/backend bootstrap
  preload.ts           contextBridge: exposes window.nexus — the ONLY API the UI can call
  ipc/handlers.ts      ipcMain.handle registrations, one per channel in shared/types/ipc.ts

backend/              Node.js backend foundation (runs inside the main process)
  db/client.ts         Prisma client + SQLite connection resolution
  db/migrate.ts         Fallback migration runner for a fresh packaged-app database
  services/            One module per domain (settings, tasks, activity, approvals,
                        system, conversations) — the only code that touches Prisma
  ai/                   AI provider communication, kept separate from orchestration:
    types.ts             Provider-agnostic AiProvider interface
    providers/anthropic.ts  The only file that imports the Anthropic SDK
    providerFactory.ts    Reads env config, builds/validates the configured provider
    schema.ts              The structured-response JSON schema + runtime validator
    systemPrompt.ts        NEXUS's system prompt
    conversationEngine.ts  Runs one turn against a provider, retries on invalid output
    errors.ts               Normalized AiError type + provider-error mapping

prisma/
  schema.prisma        Database schema (see Database Foundation below)
  migrations/           One migration per schema change — never edited after the fact

shared/types/          Types shared by backend and renderer (models + IPC contract)

src/                   React renderer (Vite root)
  components/          Sidebar, cards, empty states, task detail view, chat UI
                        (FloatingAssistant, ChatMessage, TaskProposalCard)
  pages/                Overview, Tasks (master-detail plan viewer), Activity, Memory, Settings
  App.tsx, main.tsx     App shell and entry point
```

The renderer never imports Node.js, Prisma, Electron, or an AI SDK — it only talks
to `window.nexus`, a typed object exposed by `electron/preload.ts`. Every method on
it maps to one `ipcMain.handle` channel defined in `shared/types/ipc.ts` and
implemented in `electron/ipc/handlers.ts`, which in turn calls a `backend/services/*`
module. `backend/services/conversationService.ts` is the only place that calls into
`backend/ai/*` — AI provider communication and task/conversation persistence are
deliberately separate modules.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the
  renderer's `BrowserWindow`.
- The preload script exposes a single, narrow, strictly-typed bridge
  (`window.nexus`) via `contextBridge.exposeInMainWorld` — no `ipcRenderer`,
  `require`, filesystem, or shell access reaches the renderer.
- A Content-Security-Policy is applied to every response.
- External links/navigations are opened in the OS browser, never inside the app;
  new `BrowserWindow`/webview creation from renderer content is denied outright.
- No secrets or API keys are stored as database rows or sent to the renderer — the
  AI API key lives only in `.env`, is read only by `backend/ai/providerFactory.ts`
  in the main process, and `ai:getStatus` only ever reports whether a key is
  *present*, never its value.
- The AI never executes shell commands, controls the mouse/keyboard, or captures
  the screen — it can only produce a plan for a human to review. A task classified
  **SENSITIVE** has every one of its steps forced into "requires approval" *on the
  server*, regardless of what the AI itself proposed — the AI's output is treated
  as untrusted input for that decision, not as the trust boundary.

## Database foundation

`prisma/schema.prisma` models the following, with IDs, relations, timestamps, and
indexes:

- `UserSettings` — single local settings row
- `Conversation` / `Message` — persistent conversation history. A `Message` carries
  an optional AI-assigned `intent` (`CONVERSATION` / `TASK` / `CLARIFICATION` /
  `SENSITIVE`) and an optional `taskId` when it proposed a task.
- `Task` / `TaskStep` — AI-generated plans: objective, original instruction, risks,
  required resources, completion criteria, and ordered steps. Every task created
  this sprint is `PENDING` ("planned, not started") — there is no execution engine.
- `ExecutionLog` — append-only log tied to a task/step (not populated yet — nothing executes)
- `ApprovalRequest` — a real row is created for every task step that requires
  approval (every step, for a SENSITIVE task)
- `MemoryRecord` — durable context key/value store (not populated yet)
- `AgentSession` — a run of the (not yet implemented) execution agent loop
- `SystemEvent` — append-only system/security event log, shown in the Activity view;
  now also records AI replies, proposed tasks, and AI request failures

SQLite has no native enum type, so enum-like fields are `String` columns; the
canonical list of allowed values for each lives in `shared/types/models.ts` as a
TypeScript union, and is documented with a comment above the corresponding field
in `schema.prisma`. `Task.risks` and `Task.requiredResources` use Prisma's `Json`
type (SQLite stores it as serialized text).

Schema changes since the initial migration are additive — the original
`20261031..._init` migration is untouched; a new
`20261101..._ai_conversation_engine` migration adds the conversation/task-planning
columns and relations on top of it.

## AI provider configuration

NEXUS talks to exactly one configured cloud AI provider at a time, through the
`AiProvider` interface in `backend/ai/types.ts`. Only **Anthropic (Claude)** is
implemented right now (`backend/ai/providers/anthropic.ts`); adding another
provider means writing a sibling adapter file and wiring it into
`backend/ai/providerFactory.ts` — no other code changes.

1. Get an API key from <https://console.anthropic.com/>.
2. In your `.env` (copied from `.env.example`), set:
   ```
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   AI_MODEL=claude-sonnet-5
   ```
3. Restart NEXUS (`npm run dev` / `npm start`).

Without a key configured, the rest of the app works normally — dashboard,
database, conversation UI — but sending a chat message returns a clear
"AI not configured" error (`ai:getStatus` / the error surfaced in the assistant
panel) instead of a reply, and the user's message is still saved.

Every AI response is forced through a structured tool call (not parsed from free
text) and re-validated at runtime in `backend/ai/schema.ts` before anything is
persisted or shown; a response that still fails validation gets one retry with a
corrective instruction before NEXUS reports an error.

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Windows 10/11 to run the packaged desktop experience (the renderer/backend code
  is cross-platform and was developed/verified on Linux in this environment)
- An Anthropic API key if you want actual AI replies (optional — see above)

### Setup

```bash
npm install                 # installs dependencies and runs `prisma generate`
cp .env.example .env         # DATABASE_URL points at prisma/dev.db by default
npm run prisma:migrate       # creates prisma/dev.db and applies all migrations
```

Then add your `ANTHROPIC_API_KEY` to `.env` if you want real AI replies (optional).

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

Implemented so far:

- Electron shell, secure preload/IPC bridge, React dashboard shell
- Node.js backend foundation, SQLite/Prisma schema, dev/build tooling
- A provider-agnostic AI layer with a working Anthropic adapter
- Persistent, context-aware conversations with loading/error states
- AI classification of each message (conversation / task / clarification / sensitive)
- Structured, validated task-plan generation, persisted as Task + TaskSteps +
  ApprovalRequests and shown in a master-detail Tasks workspace
- A real assistant chat panel (not a placeholder) wired to all of the above

Explicitly **not** implemented yet (by design, for a later phase):

- Mouse/keyboard automation
- Screen capture
- Arbitrary PowerShell or shell execution
- Autonomous task execution — every task this sprint produces is "planned, not
  started," and the UI never implies otherwise
- Acting on an `ApprovalRequest` (approve/deny) — requests are created and
  displayed; there is nothing to approve *into* yet, since nothing executes

The dashboard reflects this honestly: Memory still shows a real, currently-empty
state, and nothing in Tasks or Activity is simulated — it is exactly what's in the
local database.
