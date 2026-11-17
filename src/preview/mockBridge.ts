import {
  AGENT_ACTION_CATALOG,
  requiresApprovalForInvocation,
  type AgentActionType,
} from "@shared/types/agentActions";
import { APPROVED_APPLICATIONS } from "@shared/types/agentApprovedApps";
import type {
  ActivityListInput,
  AgentCancelActionInput,
  AgentListActionsInput,
  AgentSubmitActionInput,
  ApprovalsDecideInput,
  ConversationCreateInput,
  ConversationGetInput,
  MessageSendInput,
  NexusBridge,
  SettingsUpdateInput,
  TaskGetInput,
} from "@shared/types/ipc";
import type {
  AgentAction,
  ApprovalRequest,
  Conversation,
  ConversationDetail,
  Message,
  MemoryRecord,
  SendMessageResult,
  SystemEvent,
  Task,
  TaskDetail,
} from "@shared/types/models";
import {
  createSeedActivity,
  createSeedAgentActions,
  createSeedAgentStatus,
  createSeedApprovals,
  createSeedConversations,
  createSeedMemory,
  createSeedSettings,
  createSeedTasks,
  nextPreviewId,
} from "./mockData";

/**
 * Preview Mode's mock backend.
 *
 * Implements the exact same `NexusBridge` contract as electron/preload.ts
 * so every page and the floating assistant work completely unmodified —
 * see src/lib/nexusBridge.ts, which installs this in place of
 * `window.nexus` only when there is no real Electron bridge AND the app
 * is running in a Vite dev build (`import.meta.env.DEV`).
 *
 * Everything below is local, in-memory, and reset on reload. Nothing
 * here reaches the database, the AI provider, or the Windows Agent —
 * there is no code path from this file to `backend/` or `agent/`.
 * "Submitting an action" just mutates this module's own state after a
 * short simulated delay; it never touches a real computer.
 */

const START_TIME = Date.now();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// In-memory store
//
// The arrays below start empty and are only filled in by `ensureSeeded()`,
// called on first real use (from `createMockNexusBridge()` or the
// preview-only memory helpers). Preview Mode's install site
// (src/lib/nexusBridge.ts) never runs in a production build, and neither
// does `ensureSeeded()` — so none of this sample data is even
// constructed, let alone shown, outside a dev build.
// ---------------------------------------------------------------------------

const tasks: TaskDetail[] = [];
const activity: SystemEvent[] = [];
const conversations: ConversationDetail[] = [];
const memory: MemoryRecord[] = [];
let settings = createSeedSettings();
let agentStatus = createSeedAgentStatus();
const agentActions: AgentAction[] = [];
const approvals: ApprovalRequest[] = [];

let seeded = false;
function ensureSeeded(): void {
  if (seeded) return;
  seeded = true;
  tasks.push(...createSeedTasks());
  activity.push(...createSeedActivity());
  conversations.push(
    ...createSeedConversations(tasks.find((t) => t.title.startsWith('Set up a "Reports"'))?.id ?? null),
  );
  memory.push(...createSeedMemory());
  agentActions.push(...createSeedAgentActions());
  approvals.push(...createSeedApprovals(tasks));
}

function recordActivity(event: Pick<SystemEvent, "type" | "source" | "message">): void {
  activity.unshift({ id: nextPreviewId("evt"), createdAt: nowIso(), ...event });
}

/** Task-scoped approvals live in the flat `approvals` store, not on the
 *  task object itself — this is the one place that joins them back, so
 *  `approvals.decide()` updating the flat store is immediately reflected
 *  in both `tasks.list()` and `tasks.get()` without any extra bookkeeping. */
function approvalsForTask(taskId: string): ApprovalRequest[] {
  return approvals.filter((a) => a.taskId === taskId);
}

function toTaskSummary(task: TaskDetail): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    instruction: task.instruction,
    objective: task.objective,
    risks: task.risks,
    requiredResources: task.requiredResources,
    completionCriteria: task.completionCriteria,
    sensitive: task.sensitive,
    status: task.status,
    conversationId: task.conversationId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    stepCount: task.steps.length,
    pendingApprovalCount: approvalsForTask(task.id).filter((a) => a.status === "PENDING").length,
  };
}

function toConversationSummary(conversation: ConversationDetail): Conversation {
  const { messages, ...rest } = conversation;
  return rest;
}

// ---------------------------------------------------------------------------
// Agent action simulation — reuses the SAME shared catalog/approval rules
// the real backend uses, so "submit an invalid action" behaves the same
// way here as it does against the real Windows Agent.
// ---------------------------------------------------------------------------

function simulateActionResult(type: AgentActionType, parameters: Record<string, unknown>): { ok: true; result: unknown } | { ok: false; code: string; message: string } {
  switch (type) {
    case "app.launch":
    case "app.isRunning": {
      const appId = typeof parameters.appId === "string" ? parameters.appId : "";
      const app = APPROVED_APPLICATIONS.find((a) => a.id === appId);
      if (!app) {
        return { ok: false, code: "VALIDATION_ERROR", message: `"${appId}" is not an approved application.` };
      }
      return type === "app.launch"
        ? { ok: true, result: { preview: true, launched: true, appId: app.id } }
        : { ok: true, result: { preview: true, running: true, appId: app.id } };
    }
    case "app.getActiveWindow":
      return { ok: true, result: { preview: true, title: "Preview Window — sample.txt", bounds: { x: 120, y: 90, width: 800, height: 600 } } };
    case "screen.captureScreenshot":
      return { ok: true, result: { preview: true, screenshotPath: null, note: "Preview Mode — no real screenshot was captured." } };
    case "input.moveMouse":
      return { ok: true, result: { preview: true, x: parameters.x, y: parameters.y } };
    case "input.click":
      return { ok: true, result: { preview: true, x: parameters.x, y: parameters.y, button: parameters.button ?? "left" } };
    case "input.typeText": {
      const text = typeof parameters.text === "string" ? parameters.text : "";
      return { ok: true, result: { preview: true, charactersTyped: text.length } };
    }
    case "input.sendShortcut":
      return { ok: true, result: { preview: true, shortcut: parameters.shortcut } };
    case "fs.listDirectory":
      return { ok: true, result: { preview: true, entries: ["Reports/", "notes.txt", "sample-image.png"] } };
    case "fs.readFileMetadata":
      return { ok: true, result: { preview: true, sizeBytes: 2048, modifiedAt: nowIso() } };
    case "fs.createFolder":
      return { ok: true, result: { preview: true, created: true, path: parameters.path } };
    case "fs.createFile":
      return { ok: true, result: { preview: true, created: true, path: parameters.path } };
    default:
      return { ok: true, result: { preview: true } };
  }
}

async function runSimulatedAction(action: AgentAction): Promise<void> {
  action.status = "RUNNING";
  action.startedAt = nowIso();
  agentStatus.activeActionCount += 1;

  await delay(500 + Math.min(action.id.length * 7, 500));

  const outcome = simulateActionResult(action.type as AgentActionType, action.parameters);
  action.completedAt = nowIso();
  agentStatus.activeActionCount = Math.max(0, agentStatus.activeActionCount - 1);

  if (outcome.ok) {
    action.status = "SUCCEEDED";
    action.result = outcome.result;
    recordActivity({ type: "INFO", source: "AGENT", message: `(Preview) Action "${action.type}" completed successfully.` });
  } else {
    action.status = "FAILED";
    action.errorCode = outcome.code;
    action.errorMessage = outcome.message;
    recordActivity({ type: "ERROR", source: "AGENT", message: `(Preview) Action "${action.type}" failed: ${outcome.message}` });
  }
}

// ---------------------------------------------------------------------------
// Conversation engine — simple keyword heuristics, not a real AI call.
// ---------------------------------------------------------------------------

const TASK_VERBS = /\b(create|open|launch|organize|clean|write|draft|schedule|set ?up|find|move|delete|rename|install|close|save|send|capture|screenshot|remind|check)\b/i;
const QUESTION_WORDS = /^(what|who|why|how|when|where|can you|could you|is |are |do you|does)\b/i;

function draftTaskFromInstruction(instruction: string): Omit<TaskDetail, "id" | "createdAt" | "updatedAt"> {
  const lower = instruction.toLowerCase();
  let steps: Array<{ description: string; requiresApproval: boolean }>;
  let title: string;

  if (/(folder|downloads|files|organi[sz]e)/.test(lower)) {
    title = "Organize files as requested";
    steps = [
      { description: "Scan the relevant folder and group files.", requiresApproval: false },
      { description: "Create destination subfolders as needed.", requiresApproval: false },
      { description: "Move files into place and report a summary.", requiresApproval: false },
    ];
  } else if (/(screenshot|capture)/.test(lower)) {
    title = "Capture a screenshot";
    steps = [{ description: "Capture the current screen.", requiresApproval: false }];
  } else if (/(email|message|draft|mail|send)/.test(lower)) {
    title = "Draft a message for review";
    steps = [
      { description: "Open the relevant application.", requiresApproval: false },
      { description: "Type the drafted content.", requiresApproval: true },
    ];
  } else {
    title = instruction.length > 60 ? `${instruction.slice(0, 57)}…` : instruction;
    steps = [
      { description: "Review the current state relevant to this request.", requiresApproval: false },
      { description: "Perform the requested action.", requiresApproval: false },
      { description: "Confirm completion and report back.", requiresApproval: false },
    ];
  }

  return {
    title,
    description: null,
    instruction,
    objective: `Successfully complete: "${instruction}"`,
    risks: steps.some((s) => s.requiresApproval) ? ["One or more steps need your approval before NEXUS continues."] : [],
    requiredResources: [],
    completionCriteria: null,
    sensitive: steps.some((s) => s.requiresApproval),
    status: "PENDING",
    conversationId: null,
    stepCount: steps.length,
    pendingApprovalCount: steps.filter((s) => s.requiresApproval).length,
    steps: steps.map((s, index) => ({
      id: nextPreviewId("step"),
      taskId: "",
      order: index + 1,
      description: s.description,
      requiresApproval: s.requiresApproval,
      status: "PENDING",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })),
    approvalRequests: [],
  };
}

function createAssistantReply(conversationId: string, userContent: string): { message: Message; task: Task | null } {
  const trimmed = userContent.trim();

  if (trimmed.length < 4) {
    return {
      message: {
        id: nextPreviewId("msg"),
        conversationId,
        role: "ASSISTANT",
        content: "Could you tell me a bit more about what you'd like me to do?",
        intent: "CLARIFICATION",
        taskId: null,
        createdAt: nowIso(),
      },
      task: null,
    };
  }

  if (TASK_VERBS.test(trimmed)) {
    const draft = draftTaskFromInstruction(trimmed);
    const task: TaskDetail = { id: nextPreviewId("task"), createdAt: nowIso(), updatedAt: nowIso(), ...draft };
    for (const s of task.steps) s.taskId = task.id;
    tasks.unshift(task);
    recordActivity({ type: "INFO", source: "TASK", message: `"${task.title}" was proposed.` });

    return {
      message: {
        id: nextPreviewId("msg"),
        conversationId,
        role: "ASSISTANT",
        content: `Here's a plan for that — ${task.steps.length} step${task.steps.length === 1 ? "" : "s"}, planned but not started.`,
        intent: "TASK",
        taskId: task.id,
        createdAt: nowIso(),
      },
      task: toTaskSummary(task),
    };
  }

  if (QUESTION_WORDS.test(trimmed) || trimmed.endsWith("?")) {
    return {
      message: {
        id: nextPreviewId("msg"),
        conversationId,
        role: "ASSISTANT",
        content:
          "I can chat, and when you describe something you'd like done on this computer I'll propose a step-by-step plan for your review — nothing runs without approval for anything sensitive. (You're viewing Preview Mode, so this reply is simulated, not a real AI call.)",
        intent: "CONVERSATION",
        taskId: null,
        createdAt: nowIso(),
      },
      task: null,
    };
  }

  return {
    message: {
      id: nextPreviewId("msg"),
      conversationId,
      role: "ASSISTANT",
      content: "Got it. Let me know if you'd like me to turn that into a plan, or ask me anything else.",
      intent: "CONVERSATION",
      taskId: null,
      createdAt: nowIso(),
    },
    task: null,
  };
}

// ---------------------------------------------------------------------------
// Preview-only extras — NOT part of the NexusBridge contract. Memory.tsx
// imports these directly and only calls them when isPreviewModeActive().
// ---------------------------------------------------------------------------

export function previewAddMemoryRecord(input: { type: MemoryRecord["type"]; key: string; value: string }): MemoryRecord {
  ensureSeeded();
  const record: MemoryRecord = {
    id: nextPreviewId("mem"),
    type: input.type,
    key: input.key,
    value: input.value,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  memory.unshift(record);
  return record;
}

export function previewDeleteMemoryRecord(id: string): void {
  ensureSeeded();
  const index = memory.findIndex((m) => m.id === id);
  if (index !== -1) memory.splice(index, 1);
}

// ---------------------------------------------------------------------------
// The bridge itself
// ---------------------------------------------------------------------------

export function createMockNexusBridge(): NexusBridge {
  ensureSeeded();
  return {
    system: {
      async getStatus() {
        return {
          platform: "Preview Mode (browser)",
          arch: "n/a",
          appVersion: "0.1.0",
          electronVersion: "not running — Preview Mode",
          nodeVersion: "not running — Preview Mode",
          chromeVersion: "n/a",
          uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
          dbConnected: false,
        };
      },
      async setAlwaysOnTop() {
        // Electron-only feature; no real window to pin in a browser tab.
        return { enabled: false };
      },
    },
    settings: {
      async get() {
        return settings;
      },
      async update(input: SettingsUpdateInput) {
        settings = { ...settings, ...input, updatedAt: nowIso() };
        return settings;
      },
    },
    tasks: {
      async list() {
        return tasks.map(toTaskSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async get(input: TaskGetInput) {
        const found = tasks.find((t) => t.id === input.taskId);
        if (!found) throw new Error(`Task "${input.taskId}" was not found.`);
        return { ...found, approvalRequests: approvalsForTask(found.id) };
      },
    },
    activity: {
      async list(input?: ActivityListInput) {
        const limit = input?.limit ?? 50;
        return activity.slice(0, limit);
      },
    },
    approvals: {
      async listPending() {
        return approvals.filter((a) => a.status === "PENDING");
      },
      async decide(input: ApprovalsDecideInput) {
        const approval = approvals.find((a) => a.id === input.approvalRequestId);
        if (!approval) throw new Error(`Approval "${input.approvalRequestId}" was not found.`);
        approval.status = input.decision;
        approval.resolvedAt = nowIso();

        if (approval.agentActionId) {
          const action = agentActions.find((a) => a.id === approval.agentActionId);
          if (action) {
            if (input.decision === "APPROVED") {
              void runSimulatedAction(action);
            } else {
              action.status = "REJECTED";
              action.errorMessage = "The user denied this action.";
            }
          }
        }
        recordActivity({
          type: input.decision === "APPROVED" ? "INFO" : "WARNING",
          source: "AGENT",
          message: `(Preview) Approval ${input.decision.toLowerCase()} for "${approval.title}".`,
        });
        return approval;
      },
    },
    conversations: {
      async list() {
        return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(toConversationSummary);
      },
      async create(input?: ConversationCreateInput) {
        const conversation: ConversationDetail = {
          id: nextPreviewId("conv"),
          title: input?.title ?? "New conversation",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          messages: [],
        };
        conversations.unshift(conversation);
        return toConversationSummary(conversation);
      },
      async get(input: ConversationGetInput) {
        const found = conversations.find((c) => c.id === input.conversationId);
        if (!found) throw new Error(`Conversation "${input.conversationId}" was not found.`);
        return found;
      },
    },
    messages: {
      async send(input: MessageSendInput): Promise<SendMessageResult> {
        const conversation = conversations.find((c) => c.id === input.conversationId);
        if (!conversation) throw new Error(`Conversation "${input.conversationId}" was not found.`);

        const userMessage: Message = {
          id: nextPreviewId("msg"),
          conversationId: input.conversationId,
          role: "USER",
          content: input.content,
          intent: null,
          taskId: null,
          createdAt: nowIso(),
        };
        conversation.messages.push(userMessage);
        if (conversation.messages.length === 1) {
          conversation.title = input.content.length > 48 ? `${input.content.slice(0, 45)}…` : input.content;
        }

        // Simulate AI "thinking" latency so the UI's loading state is exercised too.
        await delay(650);

        const { message: assistantMessage, task } = createAssistantReply(input.conversationId, input.content);
        conversation.messages.push(assistantMessage);
        conversation.updatedAt = nowIso();

        return { userMessage, assistantMessage, task, error: null };
      },
    },
    ai: {
      async getStatus() {
        return { configured: true, provider: "Preview Mode", model: "simulated — no real AI call" };
      },
    },
    agent: {
      async getStatus() {
        return agentStatus;
      },
      async start() {
        agentStatus = {
          connectionState: "CONNECTED",
          sessionId: nextPreviewId("session"),
          sessionStatus: "ACTIVE",
          startedAt: nowIso(),
          lastHeartbeatAt: nowIso(),
          haltedUntilRestart: false,
          activeActionCount: 0,
          platform: "Preview Mode",
        };
        recordActivity({ type: "INFO", source: "AGENT", message: "(Preview) Simulated agent session started." });
        return agentStatus;
      },
      async stop() {
        agentStatus = { ...agentStatus, connectionState: "DISCONNECTED", sessionStatus: "ENDED" };
        recordActivity({ type: "INFO", source: "AGENT", message: "(Preview) Simulated agent session stopped." });
        return agentStatus;
      },
      async emergencyStop() {
        agentStatus = {
          ...agentStatus,
          connectionState: "DISCONNECTED",
          sessionStatus: "HALTED",
          haltedUntilRestart: true,
          activeActionCount: 0,
        };
        recordActivity({ type: "SECURITY", source: "AGENT", message: "(Preview) Simulated emergency STOP activated." });
        return agentStatus;
      },
      async listActions(input?: AgentListActionsInput) {
        const limit = input?.limit ?? 30;
        return [...agentActions].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, limit);
      },
      async submitAction(input: AgentSubmitActionInput) {
        if (agentStatus.connectionState !== "CONNECTED") {
          throw new Error("The (preview) Windows Agent is not connected. Start the agent before submitting actions.");
        }
        if (agentStatus.haltedUntilRestart) {
          throw new Error("The (preview) Windows Agent is halted after an emergency stop and requires an explicit restart.");
        }
        const definition = AGENT_ACTION_CATALOG[input.actionType];
        if (!definition) {
          throw new Error(`"${input.actionType}" is not a registered action type.`);
        }

        const requiresApproval = requiresApprovalForInvocation(input.actionType, input.parameters);
        const action: AgentAction = {
          id: nextPreviewId("action"),
          sessionId: agentStatus.sessionId ?? nextPreviewId("session"),
          type: input.actionType,
          parameters: input.parameters,
          permissionLevel: definition.permissionLevel,
          requiresApproval,
          status: requiresApproval ? "AWAITING_APPROVAL" : "PENDING",
          approvalRequestId: null,
          result: null,
          errorCode: null,
          errorMessage: null,
          screenshotPath: null,
          submittedAt: nowIso(),
          startedAt: null,
          completedAt: null,
        };
        agentActions.unshift(action);

        if (requiresApproval) {
          const approval: ApprovalRequest = {
            id: nextPreviewId("approval"),
            taskId: null,
            taskStepId: null,
            agentActionId: action.id,
            title: `Approve: ${definition.label}`,
            description: `Run "${definition.label}" with the submitted parameters.`,
            status: "PENDING",
            requestedAt: nowIso(),
            resolvedAt: null,
          };
          action.approvalRequestId = approval.id;
          approvals.unshift(approval);
          recordActivity({ type: "INFO", source: "AGENT", message: `(Preview) Action "${definition.label}" is awaiting approval.` });
        } else {
          void runSimulatedAction(action);
        }

        return action;
      },
      async cancelAction(input: AgentCancelActionInput) {
        const action = agentActions.find((a) => a.id === input.actionId);
        if (action && (action.status === "RUNNING" || action.status === "PENDING" || action.status === "AWAITING_APPROVAL")) {
          action.status = "CANCELLED";
        }
      },
    },
    memory: {
      async list() {
        return [...memory].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
    },
  };
}
