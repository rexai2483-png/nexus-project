# NEXUS — AI Computer Operator

NEXUS is a Windows desktop application that lets users issue natural-language
instructions and have an AI operator interact with their computer through
controlled, observable automation.

**This repository currently contains the application foundation, the AI
intelligence layer (conversation and task planning), and a standalone Windows
Automation Agent capable of real, explicitly-approved actions.** NEXUS can
hold a context-aware conversation, classify what you're asking for, propose a
structured step-by-step plan for a human to review, and — through the
Windows Agent — actually launch approved apps, observe the screen, move the
mouse/type text, and perform limited sandboxed file operations, every one of
them validated, permission-checked, and (where required) gated behind an
explicit human approval. **The AI still never executes anything on its own**:
every agent action in this release is submitted explicitly through the UI,
not driven autonomously by the AI — see [Scope](#scope-of-this-release) below.

## Tech stack

| Layer           | Technology                         |
| --------------- | ----------------------------------- |
| Desktop shell   | Electron                            |
| UI              | React + TypeScript                  |
| Styling         | Tailwind CSS                        |
| Backend runtime | Node.js (inside the Electron main process) |
| Persistence     | SQLite via Prisma ORM               |
| AI provider     | Anthropic (Claude), via a provider-agnostic interface |
| Bundler         | Vite (renderer), `tsc` (main/preload/backend, and the agent) |
| Windows automation | `@nut-tree-fork/nut-js` (mouse/keyboard/screen/window), inside a standalone agent process |

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
                        system, conversations, agent actions, screen captures,
                        screen vision) — the only code that touches Prisma
  ai/                   AI provider communication, kept separate from orchestration:
    types.ts             Provider-agnostic AiProvider interface (chat + describeImage)
    providers/anthropic.ts  The only file that imports the Anthropic SDK
    providerFactory.ts    Reads env config, builds/validates the configured provider
    schema.ts              The structured-response JSON schema + runtime validator (chat)
    visionSchema.ts         Same pattern, for screen-vision structured responses
    systemPrompt.ts        NEXUS's system prompt
    conversationEngine.ts  Runs one turn against a provider, retries on invalid output
    visionEngine.ts         Same pattern, for one screen-vision analysis
    errors.ts               Normalized AiError type + provider-error mapping
  agent/                Owns the Windows Agent child process from the main-process side:
    agentClient.ts        Spawns the agent, speaks the authenticated local-socket
                           protocol (shared/types/agentProtocol.ts)
    agentManager.ts        Session lifecycle, approval gating, DB persistence —
                           the only caller of agentClient.ts

agent/                 Standalone Windows Agent process (plain Node, not Electron —
                        see "Windows Agent" below for why)
  index.ts              Entry point: reads env config, starts the IPC server
  paths.ts               Resolves + sandboxes the approved workspace/data directories
  ipc/server.ts          The authenticated local-socket server (Unix socket / Windows
                         named pipe), newline-delimited JSON protocol, emergency stop
  actions/registry.ts    Central action registry: validates params, enforces
                         timeouts, turns every result into a structured outcome
  actions/apps.ts         app.launch / app.isRunning / app.getActiveWindow
  actions/screen.ts       screen.captureScreenshot / screen.captureActiveWindow —
                         both attach capture timestamp + active-window metadata
  actions/input.ts        input.moveMouse / input.click / input.typeText /
                         input.sendShortcut + releaseAllInputs() for emergency stop
  actions/files.ts        fs.listDirectory / fs.readFileMetadata / fs.createFolder /
                         fs.createFile — sandboxed to the approved workspace only

prisma/
  schema.prisma        Database schema (see Database Foundation below)
  migrations/           One migration per schema change — never edited after the fact

shared/types/          Types shared by backend, renderer, AND the agent process
  agentActions.ts        The action catalog: types, params, permission levels,
                         timeouts, and per-invocation approval rules — the single
                         source of truth both the backend and the agent validate against
  agentProtocol.ts        The backend <-> agent wire protocol
  agentApprovedApps.ts     Hardcoded approved-application/shortcut catalogs
  screenVision.ts          Screen-understanding domain types (ScreenCapture,
                         DetectedUiElement, BoundingBox, ScreenComparisonResult)
                         plus the pure, deterministic `compareScreenCaptures()` —
                         shared verbatim by the backend and the Preview Mode mock

src/                   React renderer (Vite root)
  components/          Sidebar, cards, empty states, task detail view, chat UI
                        (FloatingAssistant — draggable, three visual states,
                        optional Electron always-on-top — ChatMessage,
                        TaskProposalCard, EmergencyStopButton,
                        PreviewModeBanner), BoundingBoxOverlay (renders detected
                        elements over a screenshot), ScreenObservationPanel
                        (floating-assistant screen panel)
  pages/                Overview, Tasks (master-detail plan viewer), Agent (Windows
                        Agent control panel), Activity, Memory, Settings, Screen
                        (Screen Understanding workspace)
  preview/              Browser Preview Mode's mock data + mock `NexusBridge`
                        implementation — see "Browser Preview Mode" below
  lib/nexusBridge.ts     Resolves the real Electron bridge or (dev-only) the
                        Preview Mode mock — the one place that decides which
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
- The AI never executes shell commands and never drives the Windows Agent on its
  own — it can only produce a plan for a human to review, or have a human
  explicitly submit one agent action at a time through the UI. A task classified
  **SENSITIVE** has every one of its steps forced into "requires approval" *on the
  server*, regardless of what the AI itself proposed — the AI's output is treated
  as untrusted input for that decision, not as the trust boundary.
- The Windows Agent runs as a separate, unprivileged, plain Node.js OS process —
  never as administrator, never inside Electron. See **Windows Agent** below for
  its full security model (authenticated IPC, action registry, approval gating,
  filesystem sandboxing, emergency stop).
- Screenshots are only ever captured through the same explicit, submitted-and-
  approved `AgentAction` flow as every other agent action — there is no
  background/timer-driven capture path, and the Agent page always shows a
  visible "capturing..." state while one is in flight. Screenshot bytes are
  written to disk by the agent and referenced from `ScreenCapture.imagePath`;
  they are never stored as database blobs and never sent to the renderer as a
  raw filesystem path. The renderer only ever receives image bytes through
  `screen:getImageDataUrl`, which reads a `data:` URL for an `imagePath` that
  is already a row the backend itself recorded — it cannot be used to read an
  arbitrary file, because it never accepts a path, only a known capture `id`.
  Sending a screenshot to the configured AI vision provider is a separate,
  explicit action (`screen:analyze`) — capturing a screenshot never implies an
  upload. Screenshot contents and any text the AI extracts from them are
  **never written to `SystemEvent`/activity logs** — only the capture id and
  provider/model name are; and the vision system prompt explicitly instructs
  the model to describe only what's visible and to ignore any instruction-like
  text that appears inside the image itself, so visual content can never
  override NEXUS's own rules.

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
  approval (every step, for a SENSITIVE task), and for every Windows Agent
  action whose parameters/context require sign-off (e.g. overwriting a file).
  Approving or denying one always resolves that exact row — never a whole
  task or session.
- `MemoryRecord` — durable context key/value store. `memory:list` is wired up
  (Memory Centre page), but nothing writes to this table yet, so a real run
  still shows a real, currently-empty state — only Preview Mode's in-memory
  mock populates it with sample records
- `AgentSession` — one run of the Windows Agent process, from start to
  stop/halt/disconnect, with heartbeat tracking
- `AgentAction` — one explicitly submitted, validated Windows Agent action —
  type, parameters, permission level, approval requirement, full lifecycle
  status, structured result, and (for screenshots) a stored file reference
- `ScreenCapture` — one authorized screenshot (full-desktop or active-window):
  capture type, a file-reference `imagePath` (never a DB blob), capture
  timestamp, active-window title/region at capture time, an optional link
  back to the `AgentAction` that produced it (`SetNull` on delete, so deleting
  an old action never orphans the capture into a dangling foreign key), and
  the AI vision analysis state (`NOT_REQUESTED` / `ANALYZING` / `ANALYZED` /
  `FAILED`), description, detected elements (`Json`), provider/model, and any
  analysis error. Screen comparisons are computed on demand from two existing
  rows via `compareScreenCaptures()` and are never persisted as their own table.
- `SystemEvent` — append-only system/security event log, shown in the Activity view;
  records AI replies, proposed tasks, AI request failures, and every Windows
  Agent connection/action/approval/emergency-stop event

SQLite has no native enum type, so enum-like fields are `String` columns; the
canonical list of allowed values for each lives in `shared/types/models.ts` as a
TypeScript union, and is documented with a comment above the corresponding field
in `schema.prisma`. `Task.risks` and `Task.requiredResources` use Prisma's `Json`
type (SQLite stores it as serialized text).

Schema changes since the initial migration are additive — the original
`20261031..._init` migration is untouched; `20261101..._ai_conversation_engine`
added the conversation/task-planning columns, `20261102..._windows_agent`
added `AgentAction` plus the `AgentSession`/`ExecutionLog`/`ApprovalRequest`
extensions, and `20261118..._screen_understanding` added the `ScreenCapture`
table and its relation to `AgentAction`, all on top of it.

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

The same `AiProvider` interface also exposes `describeImage()`, used for screen
understanding (see below) — it is the same Anthropic adapter, the same forced
tool-call/validate/retry-once pattern (`visionSchema.ts`/`visionEngine.ts`), and
the same server-side-only credential handling; no second AI architecture was
introduced. Vision-specific failure modes (an unsupported image format, a
request timeout) map onto the same `AiErrorCode` union (`UNSUPPORTED_FORMAT`,
`TIMEOUT`) the chat path already used for connection/rate-limit/auth errors.

## Windows Agent

The Windows Agent is a **separate, standalone Node.js process** — not Electron,
not a renderer, not running as administrator — that the backend spawns and
talks to over an authenticated local socket (a Unix domain socket on
Linux/macOS, a Windows named pipe on win32), using Node's built-in `net`
module and a newline-delimited JSON protocol
(`shared/types/agentProtocol.ts`). It never runs as an unrestricted admin
process and the main Electron app never grants it elevated privileges.

**Why a separate process?** It keeps native automation libraries (and any
future native-module risk) out of the Electron main process entirely, and it
means an agent crash, hang, or emergency stop can never take the dashboard
down with it.

**Lifecycle.** The backend generates a random per-launch auth token
(`crypto.randomBytes`), spawns the agent with it plus the socket path in
environment variables, and the agent refuses every message until the first
one is a valid `auth`. The backend pings a heartbeat every 5s; a dropped
connection on a still-alive process is retried automatically a few times
before the session is marked ended — a crashed process requires starting a
new session.

**Action registry.** Every capability (`shared/types/agentActions.ts`) has a
declared type, parameter schema, permission level (`LOW` / `ELEVATED` /
`SENSITIVE`), timeout, cancellability, and structured result shape. Both the
backend (before dispatch) and the agent (before execution) validate against
the same catalog — defense in depth. Nothing the AI generates is ever
executed as a shell command or arbitrary code; only these explicitly
registered, parameter-validated actions can run, and only ones a human
explicitly submitted through the UI.

**Approval gating.** `requiresApprovalForInvocation()` decides per
*invocation* (actual parameters + the last known active-window title), not
per action type — the same `fs.createFile` call needs no approval when
creating a new file but always needs one when `overwrite: true`. Approving or
denying applies to that exact `AgentAction` row only.

**Emergency STOP.** One button, reachable from both the Agent page and the
floating assistant (`EmergencyStopButton`), reachable at all times. It stops
the agent from accepting new actions, cancels every cancellable in-flight
action (`AbortController` per action), releases any held mouse buttons/
modifier keys, and reports exactly which actions completed vs. were
interrupted. The agent process then exits — a brand-new process is required
to do anything else, which is the literal "explicit restart" the spec calls for.

**Filesystem sandboxing.** All file actions resolve through
`agent/paths.ts#resolveWorkspacePath()`, which rejects (not just flags) any
path that would escape the approved workspace root (`~/NEXUS Workspace` by
default on a real Windows machine, via `app.getPath("documents")`). There is
no delete and no bulk modification in this release — only list, read
metadata, create folder, create file (overwrite gated behind approval).

### Running the agent locally

Nothing extra to install — `npm install` already pulled in
`@nut-tree-fork/nut-js`, and `npm run build` compiles the agent alongside the
renderer/electron bundles into `dist-agent/`. From the Agent page in the app,
click **Start Agent**; the backend spawns `dist-agent/agent/index.js` and
connects automatically. No separate command is needed — it is not meant to be
run by hand, but you can smoke-test the compiled process directly:

```bash
npm run build:agent
NEXUS_AGENT_SOCKET_PATH=/tmp/nexus-agent-test.sock \
NEXUS_AGENT_TOKEN=test-token \
node dist-agent/agent/index.js
```

It will print `NEXUS_AGENT_READY ...` once listening; connect with any
newline-delimited-JSON socket client and send `{"type":"auth","token":"test-token"}`
first.

## Screen Understanding

Lets NEXUS capture, inspect, and understand what's currently on the Windows
desktop — observation only, never a way for the AI to act on what it sees.

**Capture.** Two `LOW`-permission, no-approval-required agent actions:
`screen.captureScreenshot` (full desktop) and `screen.captureActiveWindow`
(just the foreground window's region, via nut-js's `getActiveWindow()`).
Both are only ever triggered by an explicit human action — a button on the
Agent page, the Screen workspace, or the floating assistant's screen panel —
never on a timer and never silently; the UI shows a visible "capturing..."
state while the action is in flight. Every successful capture writes a PNG
to disk and records one `ScreenCapture` row (`backend/agent/agentManager.ts`
does this automatically as part of the normal `AgentAction` completion path —
no separate "save" step) with its capture timestamp and, when the agent could
read it, the active window's title and region at the moment of capture.

**Cloud vision analysis.** A capture's "Analyze with AI Vision" action
(`screen:analyze` → `backend/services/screenVisionService.ts`) sends the
image to the configured Anthropic model via `describeImage()` and asks for a
structured description plus a list of detected elements (type, label,
bounding box, confidence, whether it looks interactive). The vision system
prompt (`backend/ai/visionEngine.ts`) explicitly tells the model to report
only what is visible, never claim an action happened, and never follow any
instruction-like text that appears inside the screenshot itself — screenshot
content is treated as untrusted input, the same way AI chat output is treated
as untrusted for approval decisions. Analysis never happens implicitly: it is
its own explicit, separate action from capturing. Failures (no provider
configured, an unsupported image extension, an unreadable file, a provider
timeout/API error) resolve the capture to `FAILED` with a human-readable
`analysisError` instead of throwing — the workspace always has something
sensible to show.

**UI element understanding.** `DetectedUiElement` distinguishes **where an
element came from**: `ACCESSIBILITY` for the one element
`screenCaptureService.recordCapture()` can derive directly from the agent's
own active-window metadata (no AI involved, confidence `1`), versus
`AI_VISUAL` for everything the vision model estimated from pixels (its
reported confidence, always `< 1`). Re-analyzing a capture preserves its
`ACCESSIBILITY` elements and only replaces the `AI_VISUAL` ones. The Screen
workspace renders both kinds over the screenshot (`BoundingBoxOverlay.tsx`,
percentage-positioned so it holds up at any zoom level) with a different
border color per source, and labels them accordingly in the elements list —
never shown as equivalent or indistinguishable.

**Screen change detection.** `shared/types/screenVision.ts#compareScreenCaptures()`
is a small, pure, deterministic function (no AI call) that matches elements
between two captures by `source:type:label`, and reports which are new,
removed, or changed (moved by more than a few pixels, or flipped
interactive/non-interactive), plus a `possibleTransition` flag/reason derived
from the active-window title changing or a large drop in matched elements.
Being deterministic and shared, it produces identical results whether it's
comparing two real captures or two Preview Mode samples, and it only ever
reports differences actually present in the two elements lists — never a
change it can't support from the captures themselves.

**Dashboard.** The **Screen** workspace (`src/pages/Screen.tsx`) lists recent
captures, shows the selected one's screenshot with its bounding-box overlay,
active application, capture time, AI description, and detected elements, and
has a separate "Compare two captures" panel. The floating assistant's 👁
panel (`ScreenObservationPanel.tsx`) surfaces the latest capture and a
"Capture screen now" shortcut, and links into the full workspace.

## Browser Preview Mode

A development-only mode that makes the full visual experience explorable
from the Vite dev server's browser URL, without Electron, a database, an AI
key, or a Windows Agent.

**How it activates.** `src/lib/nexusBridge.ts` installs a mock
`NexusBridge` (`src/preview/mockBridge.ts`) onto `window.nexus` if, and only
if, both are true: `import.meta.env.DEV` (a Vite production build hard-codes
this to `false`, and the install call is unreachable dead code once that's
folded — verified by inspecting the production bundle) and no real Electron
preload bridge is already present (Electron always wins; this never
overwrites a real bridge). Every page, the Tasks master-detail view, and the
floating assistant call the exact same `window.nexus.*` methods either way —
none of them know or care whether they're talking to Electron's IPC bridge or
the mock, which is what makes the whole dashboard explorable unmodified.

**What it looks like.** A persistent amber "PREVIEW MODE" banner spans the
top of the window the entire time it's active (`PreviewModeBanner.tsx`) plus
a small badge in the sidebar — it is never silent and never dismissible.

**What it provides** (`src/preview/mockData.ts` + `mockBridge.ts`), all
local, in-memory, and reset on reload:

- Sample tasks across every status (planned, running with real per-step
  progress, completed, failed, cancelled), including one sensitive task with
  a pending approval
- Sample activity events, approvals, a demo conversation, and memory records
  across all four categories
- A simple keyword-based conversation engine — not a real AI call — that can
  propose new sample tasks or answer questions, so you can try sending
  messages and creating tasks live
- A simulated Windows Agent session: start/stop, submit quick actions
  (reusing the exact same `AGENT_ACTION_CATALOG` / `requiresApprovalForInvocation`
  rules as the real backend, so e.g. submitting an unapproved app ID fails
  the same way), approval gating, and Emergency STOP
- A preview-only memory management UI (add/delete records) in the Memory
  Centre — gated behind Preview Mode and never part of the real
  `NexusBridge` contract, so it can't be mistaken for a real persistence path
- Three clearly-sample `ScreenCapture`s for the Screen Understanding workspace
  (an already-analyzed "NEXUS Notes" full-desktop capture, an already-analyzed
  "Calculator" active-window capture, and a not-yet-analyzed "File Explorer"
  capture) — generated inline as labeled SVG images (never a real screenshot),
  with hand-authored sample `DetectedUiElement`s for both the `ACCESSIBILITY`
  and `AI_VISUAL` sources so bounding-box rendering is demonstrable. You can
  open each sample, inspect/hover its detected elements, trigger "Analyze with
  AI Vision" on the unanalyzed one (returns an instant canned result, clearly
  tagged `visionProvider: "Preview Mode simulated-vision"` rather than a real
  provider name), and compare the two already-analyzed samples — they were
  deliberately authored with different active windows and element sets, so
  the comparison surfaces real, non-trivial added/removed elements and a
  `possibleTransition`, using the exact same `compareScreenCaptures()`
  function the real backend calls. Submitting either real capture action
  (`screen.captureScreenshot` / `screen.captureActiveWindow`) in Preview Mode
  also adds one brand-new, generic, equally-labeled sample capture, the same
  way the simulated agent already handles every other action.

**What it will never do:** claim a real application opened, a real file was
created, or a real screenshot was taken — simulated action results are
tagged `preview: true` and worded accordingly; present a sample screenshot or
its detected elements as a live observation; call anything in `agent/` or
`backend/`; or activate outside a dev build.

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
Electron once both are ready. DevTools open automatically. Using `pnpm`
instead of `npm`? Run `pnpm dev` — it's the same script (`concurrently`
with `npm:`-prefixed sub-commands), it just needs to be invoked through
`pnpm` so those sub-commands resolve with the right package manager too.

> Running `npm run dev:renderer` (or `pnpm dev:renderer`) on its own starts
> only the Vite dev server — no Electron process, no preload bridge, no real
> backend. `window.nexus` is genuinely `undefined` there, so NEXUS
> automatically activates **Browser Preview Mode**: a mock `NexusBridge`
> backed by realistic sample data, so the entire dashboard is explorable and
> interactive without Electron. See **Browser Preview Mode** below. For a
> real backend (live AI, Windows Agent, database), use `npm run dev` /
> `pnpm dev` (or a full `npm run build && npm start`) instead.

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
| `npm run dev`            | Full development mode (renderer + main + agent, all watched) |
| `npm run build`          | Production build of renderer, main/preload/backend, and the agent |
| `npm run build:agent`    | Compile just the standalone Windows Agent process       |
| `npm start`              | Run the production build                              |
| `npm run typecheck`      | Type-check the renderer, electron/backend, and agent projects |
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
- A standalone Windows Agent process with authenticated local IPC, a
  validated action registry (app launch/detect, active-window query,
  screenshot capture, mouse/keyboard, sandboxed file ops), per-invocation
  approval gating, live status/action history on a dedicated Agent page, and
  a working Emergency STOP reachable from both the dashboard and the
  floating assistant
- Acting on an `ApprovalRequest` (approve/deny) now does something real for
  agent actions: approving forwards the exact action for execution, denying
  marks it `REJECTED` — task-step approvals remain display-only pending a
  task execution engine
- A polished, completed dashboard: Overview now surfaces agent/AI status and
  quick actions, Settings now surfaces AI provider status, a read-only
  permissions/catalog reference, and an agent-configuration summary, Memory
  is wired to the real (currently-empty) `MemoryRecord` table with a
  category-filtered master-detail UI, and Activity gained type filters
- The floating assistant is draggable, persists its position, shows a
  distinct "working" state with real per-step progress when a task is
  running, and (in Electron only) can pin the NEXUS window always-on-top
- Screen understanding: authorized full-desktop/active-window screenshot
  capture with timestamp + active-window metadata, cloud AI vision analysis
  (structured description + detected elements), accessibility-vs-AI-estimated
  element provenance, deterministic screen-change comparison, and a dedicated
  Screen workspace plus a floating-assistant screen panel — see the dedicated
  section above
- Browser Preview Mode — see the dedicated section above

Explicitly **not** implemented yet (by design, for a later phase):

- Autonomous, AI-driven computer use — the AI still only proposes plans; every
  Windows Agent action in this release is submitted explicitly by a human
  through the UI, and the backend remains the sole authorization boundary
- File deletion or bulk file modification (the agent can only list, read
  metadata, create folders, and create/overwrite-with-approval files)
- Autonomous *task* execution — a `Task`'s steps are still "planned, not
  started"; only the separate, explicit Agent-page quick actions actually run
- Any AI-driven interaction with what's on screen — screen understanding in
  this release is strictly observation: capture, describe, detect elements,
  and compare. There is no path from a vision result back into
  `input.moveMouse`/`input.click`/`input.typeText`, and no continuous or
  scheduled capture of any kind

The dashboard reflects this honestly: when running against the real backend
(`npm run dev` / `npm start`), Memory still shows a real, currently-empty
state, and nothing in Tasks, Agent, or Activity is simulated — it is exactly
what's in the local database and what the agent actually reported. The one
exception is Browser Preview Mode (`npm run dev:renderer` alone), which is
clearly and persistently labeled as such and never shares a code path with
the real Electron bridge — see **Browser Preview Mode** above.

## Known limitations (Windows Agent)

- Developed and tested in this sandbox on **Linux** (no Windows 10/11 machine
  available) using Xvfb + a minimal X11 window manager as a stand-in desktop.
  `app.launch`/`app.isRunning` target Windows executables
  (`notepad.exe`, etc.) by design and will genuinely fail with `ENOENT` on any
  non-Windows host — that failure path itself was verified end-to-end; the
  successful-launch path has not been run against a real Windows desktop.
- `app.getActiveWindow` relies on the X11 `_NET_ACTIVE_WINDOW` property on
  Linux, which only exists once a window manager is running; with none
  present (the sandbox's default state) the underlying native call throws an
  uncatchable X protocol error that crashes the agent process. This is a
  Linux/X11-only testing artifact — Windows always has an active-window
  concept via the shell — but it means this one action is the least portable
  part of the implementation and is worth a defensive look before any future
  Linux dev-mode support is promised.
- `@nut-tree-fork/nut-js` pulls in `jimp` → `file-type`, which has an open,
  unfixed moderate-severity advisory (GHSA-5v7r-6r5c-r473, an ASF-parsing
  infinite loop/DoS). It is not exploitable through anything NEXUS does with
  the library (screenshots are PNG-encoded, never parsed as untrusted input),
  but `npm audit` will keep flagging it until upstream ships a fix.
- Window titles/regions reported by `app.getActiveWindow` depend on the
  desktop environment actually publishing them; on this sandbox's fluxbox
  window manager, titles frequently came back empty even for a real window.
  `screen.captureActiveWindow` shares this dependency — on a host with no
  active-window concept it fails with a clear error rather than capturing
  something misleading.
- Screen understanding's vision path (`describeImage()` calling the real
  Anthropic API) was verified by type-checking and by an end-to-end run
  against the Preview Mode mock (which exercises the same request/response
  shapes and error-mapping code), but not against the live Anthropic API
  itself — this sandbox has no configured API key. Likewise,
  `screenCaptureService`/`screenVisionService`'s actual database-backed
  bodies could not be exercised inside the full Electron runtime in this
  sandbox; they were verified via `tsc`, via a standalone script that
  constructs a `PrismaClient` directly against the same schema (bypassing
  `backend/db/client.ts`, which imports Electron's `app` unconditionally —
  a pre-existing constraint, not introduced this sprint), and via the
  Preview Mode mock exercising equivalent logic.
