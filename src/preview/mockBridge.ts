import {
  AGENT_ACTION_CATALOG,
  requiresApprovalForInvocation,
  type AgentActionType,
} from "@shared/types/agentActions";
import { APPROVED_APPLICATIONS } from "@shared/types/agentApprovedApps";
import { compareScreenCaptures, type DetectedUiElement, type ScreenCapture } from "@shared/types/screenVision";
import {
  actionKindExpectsVisibleChange,
  buildVisionActionPlan,
  resolveTargetCoordinates,
  validateVisionTarget,
  type VisionActionRequest,
  type VisionInteractionResult,
  type VisionPlanStep,
  type VisionTarget,
} from "@shared/types/visionActions";
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
  ScreenAnalyzeInput,
  ScreenCompareInput,
  ScreenGetCaptureInput,
  ScreenGetImageDataUrlInput,
  ScreenListCapturesInput,
  SettingsUpdateInput,
  TaskGetInput,
  VisionExecuteActionInput,
  VisionListInteractionsInput,
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
  buildCalculatorImage,
  buildExplorerImage,
  buildNotesImage,
  CALC_HEIGHT,
  CALC_WIDTH,
  createGenericCaptureImage,
  createSeedActivity,
  createSeedAgentActions,
  createSeedAgentStatus,
  createSeedApprovals,
  createSeedConversations,
  createSeedMemory,
  createSeedScreenCaptures,
  createSeedSettings,
  createSeedTasks,
  nextPreviewId,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
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
const screenCaptures: ScreenCapture[] = [];
let screenImages: Record<string, string> = {};
let screenPendingAnalysis: Record<string, { description: string; elements: DetectedUiElement[] }> = {};
const visionInteractions: VisionInteractionResult[] = [];

/**
 * Deliberately flaky demo target: the Calculator sample's "=" button
 * fails its first simulated click, then succeeds on a second attempt —
 * this is Sprint 5's "recovering from a failed action" Preview Mode
 * scenario. Nothing else is special-cased to fail.
 */
const FLAKY_ELEMENT_IDS = new Set(["btn-equals"]);
const flakyAttemptCounts: Record<string, number> = {};

// Mutable "current state" of the three sample apps, so a vision action
// that visibly changes one of them produces a genuinely different
// before/after screenshot + element set to compare, instead of a
// silently-identical one. Reset on reload along with everything else.
let calcDisplayValue = "42";
let notesFileMenuOpen = false;
let notesTypedLine: string | null = null;
let explorerExtraRow: string | null = null;

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

  const screenSeed = createSeedScreenCaptures();
  screenCaptures.push(...screenSeed.captures);
  screenImages = { ...screenSeed.images };
  screenPendingAnalysis = { ...screenSeed.pendingAnalysis };
}

/**
 * Creates a brand-new, never-analyzed ScreenCapture whenever a
 * `screen.captureScreenshot` / `screen.captureActiveWindow` action
 * "succeeds" in Preview Mode — mirrors the real backend hooking the same
 * two action types into `screenCaptureService.recordCapture()` (see
 * backend/agent/agentManager.ts#handleActionResult). The image is a
 * generic labeled placeholder (src/preview/mockData.ts#createGenericCaptureImage),
 * never implying a real screenshot was taken.
 */
function recordSimulatedScreenCapture(actionType: "screen.captureScreenshot" | "screen.captureActiveWindow"): ScreenCapture {
  const id = nextPreviewId("capture");
  const isWindowCapture = actionType === "screen.captureActiveWindow";
  const title = isWindowCapture ? "Notepad - Untitled" : "Desktop";
  const width = isWindowCapture ? 640 : 1280;
  const height = isWindowCapture ? 480 : 800;
  const region = { left: 0, top: 0, width, height };

  const capture: ScreenCapture = {
    id,
    captureType: isWindowCapture ? "ACTIVE_WINDOW" : "FULL_SCREEN",
    capturedAt: nowIso(),
    activeWindowTitle: title,
    activeWindowRegion: region,
    agentActionId: null,
    analysisStatus: "NOT_REQUESTED",
    visionDescription: null,
    visionElements: [
      { id: "accessibility-window", source: "ACCESSIBILITY", type: "window", label: title, boundingBox: region, confidence: 1, interactive: true },
    ],
    visionProvider: null,
    visionModel: null,
    analysisError: null,
    analyzedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  screenCaptures.unshift(capture);
  screenImages[id] = createGenericCaptureImage(title, width, height);
  return capture;
}

function recordActivity(event: Pick<SystemEvent, "type" | "source" | "message">): void {
  activity.unshift({ id: nextPreviewId("evt"), createdAt: nowIso(), ...event });
}

// ---------------------------------------------------------------------------
// Vision-guided interaction simulation (Sprint 5).
//
// Mirrors backend/services/visionInteractionService.ts's observe-act-verify
// loop using the exact same shared, pure helpers
// (buildVisionActionPlan / resolveTargetCoordinates / validateVisionTarget /
// compareScreenCaptures) so a vision action rejects a stale target,
// requires approval for a sensitive-looking element, and classifies its
// outcome the same way here as it would against the real backend. Every
// underlying step is recorded as a real mock AgentAction, so it shows up
// on the Agent page exactly like any other quick action.
// ---------------------------------------------------------------------------

function latestCaptureId(): string | null {
  if (screenCaptures.length === 0) return null;
  return [...screenCaptures].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0].id;
}

function pushVisionInteraction(interaction: VisionInteractionResult): void {
  visionInteractions.unshift(interaction);
  if (visionInteractions.length > 50) visionInteractions.length = 50;
}

/** Simulates one underlying agent action for a vision interaction step — same approval/validation rules as `agent.submitAction`, just resolved synchronously instead of via the agent-session simulation's own delayed queue. */
async function simulateVisionStep(
  planStep: VisionPlanStep,
  targetLabel: string | null,
  targetElementId: string,
): Promise<AgentAction> {
  const requiresApproval = requiresApprovalForInvocation(planStep.actionType, planStep.parameters, {
    activeWindowTitle: null,
    targetLabel,
  });

  const action: AgentAction = {
    id: nextPreviewId("action"),
    sessionId: agentStatus.sessionId ?? nextPreviewId("session"),
    type: planStep.actionType,
    parameters: planStep.parameters,
    permissionLevel: AGENT_ACTION_CATALOG[planStep.actionType].permissionLevel,
    requiresApproval,
    status: requiresApproval ? "AWAITING_APPROVAL" : "RUNNING",
    approvalRequestId: null,
    result: null,
    errorCode: null,
    errorMessage: null,
    screenshotPath: null,
    submittedAt: nowIso(),
    startedAt: requiresApproval ? null : nowIso(),
    completedAt: null,
  };
  agentActions.unshift(action);

  if (requiresApproval) {
    const approval: ApprovalRequest = {
      id: nextPreviewId("approval"),
      taskId: null,
      taskStepId: null,
      agentActionId: action.id,
      title: `Approve: ${AGENT_ACTION_CATALOG[planStep.actionType].label}`,
      description: `${planStep.label} — targets an element labeled "${targetLabel}", which looks consequential, so it needs your approval.`,
      status: "PENDING",
      requestedAt: nowIso(),
      resolvedAt: null,
    };
    action.approvalRequestId = approval.id;
    approvals.unshift(approval);
    recordActivity({ type: "INFO", source: "AGENT", message: `(Preview) Vision action "${planStep.label}" is awaiting approval.` });
    return action;
  }

  await delay(400);

  const isFlaky = FLAKY_ELEMENT_IDS.has(targetElementId);
  const attempt = (flakyAttemptCounts[targetElementId] ?? 0) + 1;
  flakyAttemptCounts[targetElementId] = attempt;

  if (isFlaky && attempt === 1) {
    action.status = "FAILED";
    action.errorCode = "EXECUTION_ERROR";
    action.errorMessage = "(Preview) Simulated failure: the equals button did not respond to the first click.";
    action.completedAt = nowIso();
    recordActivity({ type: "ERROR", source: "AGENT", message: `(Preview) Action "${planStep.actionType}" failed: ${action.errorMessage}` });
    return action;
  }

  action.status = "SUCCEEDED";
  action.result = { preview: true, ...planStep.parameters };
  action.completedAt = nowIso();
  recordActivity({ type: "INFO", source: "AGENT", message: `(Preview) Action "${planStep.actionType}" completed successfully.` });
  return action;
}

/**
 * Produces the "after" screenshot for one of the three sample apps,
 * regenerating its image + elements when the acted-on element is one of
 * the handful specially wired up for a visible change (a calculator
 * digit/equals button, the Notes "File" menu or document body, the File
 * Explorer "New Folder" button) — anything else reuses the SAME image and
 * elements as `before`, which is an honest simulation too: not every
 * click has a detectable visual effect, and the comparison correctly
 * reports "no change" (UNCERTAIN) rather than fabricating one.
 */
function simulateVerificationCapture(before: ScreenCapture, element: DetectedUiElement, request: VisionActionRequest): ScreenCapture {
  let image =
    screenImages[before.id] ??
    createGenericCaptureImage(
      before.activeWindowTitle ?? "Desktop",
      before.captureType === "ACTIVE_WINDOW" ? CALC_WIDTH : SAMPLE_WIDTH,
      before.captureType === "ACTIVE_WINDOW" ? CALC_HEIGHT : SAMPLE_HEIGHT,
    );
  let elements = before.visionElements;

  if (before.activeWindowTitle === "Calculator" && /^btn-(7|8|9|equals)$/.test(element.id)) {
    calcDisplayValue = element.id === "btn-equals" ? "0" : calcDisplayValue === "42" ? element.label ?? "" : `${calcDisplayValue}${element.label ?? ""}`;
    image = buildCalculatorImage(calcDisplayValue);
    elements = elements.map((e) => (e.id === "display" ? { ...e, label: calcDisplayValue } : e));
  } else if (before.activeWindowTitle === "NEXUS Notes - Untitled.txt" && element.id === "menu-file") {
    notesFileMenuOpen = true;
    image = buildNotesImage({ showFileMenu: true, typedLine: notesTypedLine ?? undefined });
    elements = [
      ...elements,
      { id: "menu-item-new", source: "AI_VISUAL", type: "menuItem", label: "New", boundingBox: { left: 24, top: 38, width: 90, height: 18 }, confidence: 0.85, interactive: true },
      { id: "menu-item-open", source: "AI_VISUAL", type: "menuItem", label: "Open", boundingBox: { left: 24, top: 60, width: 90, height: 18 }, confidence: 0.85, interactive: true },
      { id: "menu-item-save", source: "AI_VISUAL", type: "menuItem", label: "Save", boundingBox: { left: 24, top: 82, width: 90, height: 18 }, confidence: 0.85, interactive: true },
      { id: "menu-item-exit", source: "AI_VISUAL", type: "menuItem", label: "Exit", boundingBox: { left: 24, top: 104, width: 90, height: 18 }, confidence: 0.85, interactive: true },
    ];
  } else if (before.activeWindowTitle === "NEXUS Notes - Untitled.txt" && element.id === "body" && request.actionKind === "typeText") {
    notesTypedLine = request.text ?? "";
    image = buildNotesImage({ showFileMenu: notesFileMenuOpen, typedLine: notesTypedLine });
    elements = [
      ...elements,
      { id: "typed-line", source: "AI_VISUAL", type: "text", label: notesTypedLine, boundingBox: { left: 276, top: 180, width: 700, height: 20 }, confidence: 0.9, interactive: false },
    ];
  } else if (before.activeWindowTitle === "File Explorer - Documents" && element.id === "btn-new-folder") {
    explorerExtraRow = "New folder";
    image = buildExplorerImage(explorerExtraRow);
    elements = [
      ...elements.map((e) =>
        e.type === "listItem" ? { ...e, boundingBox: { ...e.boundingBox, top: e.boundingBox.top + 56 } } : e,
      ),
      { id: "row-new-folder", source: "AI_VISUAL", type: "listItem", label: "New folder", boundingBox: { left: 24, top: 110, width: 1232, height: 48 }, confidence: 0.9, interactive: true },
    ];
  }

  const capture: ScreenCapture = {
    id: nextPreviewId("capture"),
    captureType: before.captureType,
    capturedAt: nowIso(),
    activeWindowTitle: before.activeWindowTitle,
    activeWindowRegion: before.activeWindowRegion,
    agentActionId: null,
    analysisStatus: "ANALYZED",
    visionDescription: before.visionDescription,
    visionElements: elements,
    visionProvider: "Preview Mode",
    visionModel: "simulated-vision",
    analysisError: null,
    analyzedAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  screenCaptures.unshift(capture);
  screenImages[capture.id] = image;
  return capture;
}

async function simulateVisionInteraction(request: VisionActionRequest): Promise<VisionInteractionResult> {
  const interaction: VisionInteractionResult = {
    id: nextPreviewId("interaction"),
    status: "RUNNING",
    actionKind: request.actionKind,
    target: request.target,
    steps: [],
    beforeCaptureId: null,
    afterCaptureId: null,
    comparison: null,
    approvalRequestId: null,
    message: "Validating target…",
    startedAt: nowIso(),
    completedAt: null,
  };
  pushVisionInteraction(interaction);

  // Mirrors backend/services/visionInteractionService.ts: resolve the real
  // capture + element by id FIRST, then validate freshness/safety against
  // that resolved data (capturedAt/type/boundingBox) rather than whatever
  // the request claims about them — kept consistent with the real
  // backend's trust boundary even though Preview Mode's own in-memory
  // state isn't a real security boundary.
  const before = screenCaptures.find((c) => c.id === request.target.captureId);
  if (!before) {
    interaction.status = "INVALID_TARGET";
    interaction.message = "The referenced screen capture no longer exists.";
    interaction.completedAt = nowIso();
    return interaction;
  }
  interaction.beforeCaptureId = before.id;

  const element = before.visionElements.find((candidate) => candidate.id === request.target.elementId);
  if (!element) {
    interaction.status = "INVALID_TARGET";
    interaction.message = "The identified element could not be found in that capture anymore.";
    interaction.completedAt = nowIso();
    return interaction;
  }

  const canonicalTarget: VisionTarget = {
    captureId: before.id,
    elementId: element.id,
    type: element.type,
    label: element.label,
    boundingBox: element.boundingBox,
    source: element.source,
    confidence: element.confidence,
    capturedAt: before.capturedAt,
  };
  interaction.target = canonicalTarget;

  const freshness = validateVisionTarget(canonicalTarget, latestCaptureId(), Date.now());
  if (!freshness.ok) {
    interaction.status = "INVALID_TARGET";
    interaction.message = freshness.reason;
    interaction.completedAt = nowIso();
    return interaction;
  }

  const coordinates = resolveTargetCoordinates(element.boundingBox, before);
  const plan = buildVisionActionPlan(request, coordinates);

  for (const planStep of plan) {
    const action = await simulateVisionStep(planStep, element.label, element.id);
    interaction.steps.push({
      agentActionId: action.id,
      actionType: planStep.actionType,
      label: planStep.label,
      status: action.status,
      errorMessage: action.errorMessage,
    });
    if (action.status === "AWAITING_APPROVAL") {
      interaction.status = "AWAITING_APPROVAL";
      interaction.approvalRequestId = action.approvalRequestId;
      interaction.message = `"${planStep.label}" requires your approval before it will run (Preview Mode). Approve or deny it on the Agent page.`;
      interaction.completedAt = nowIso();
      return interaction;
    }
    if (action.status !== "SUCCEEDED") {
      interaction.status = "FAILED";
      interaction.message = `"${planStep.label}" failed: ${action.errorMessage ?? "unknown error"}.`;
      interaction.completedAt = nowIso();
      return interaction;
    }
  }

  if (!actionKindExpectsVisibleChange(request.actionKind)) {
    interaction.status = "SUCCEEDED";
    interaction.message = "The pointer was moved to the target. Moving the pointer has no expected visual change to verify.";
    interaction.completedAt = nowIso();
    return interaction;
  }

  const after = simulateVerificationCapture(before, element, request);
  interaction.afterCaptureId = after.id;
  const comparison = compareScreenCaptures(before, after);
  interaction.comparison = comparison;

  const titleChanged = Boolean(before.activeWindowTitle) && Boolean(after.activeWindowTitle) && before.activeWindowTitle !== after.activeWindowTitle;
  const changed =
    titleChanged || comparison.addedElements.length > 0 || comparison.removedElements.length > 0 || comparison.changedElements.length > 0;

  interaction.status = changed ? "SUCCEEDED" : "UNCERTAIN";
  interaction.message = changed
    ? `Verified: ${comparison.summary}`
    : "The action completed, but NEXUS could not detect any visible change on screen afterward (Preview Mode simulation).";
  interaction.completedAt = nowIso();

  recordActivity({
    type: "INFO",
    source: "AGENT",
    message: `(Preview) Vision interaction "${request.actionKind}" on "${element.label ?? element.type}" completed: ${interaction.status}.`,
  });

  return interaction;
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
    case "screen.captureActiveWindow":
      // The actual ScreenCapture row is created separately by
      // recordSimulatedScreenCapture() — see runSimulatedAction() below —
      // mirroring how the real backend's agentManager hooks into these
      // two action types' success, not their result payload shape.
      return { ok: true, result: { preview: true, captured: true } };
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
    case "input.scroll":
      return { ok: true, result: { preview: true, direction: parameters.direction, amount: parameters.amount ?? 3 } };
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
    if (action.type === "screen.captureScreenshot" || action.type === "screen.captureActiveWindow") {
      const capture = recordSimulatedScreenCapture(action.type);
      recordActivity({
        type: "INFO",
        source: "AGENT",
        message: `(Preview) Simulated ${capture.captureType === "FULL_SCREEN" ? "full screen" : "active window"} capture recorded.`,
      });
    }
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
    screen: {
      async listCaptures(input?: ScreenListCapturesInput) {
        const limit = input?.limit ?? 20;
        return [...screenCaptures].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, limit);
      },
      async getCapture(input: ScreenGetCaptureInput) {
        const found = screenCaptures.find((c) => c.id === input.captureId);
        if (!found) throw new Error(`Screen capture "${input.captureId}" was not found.`);
        return found;
      },
      async getImageDataUrl(input: ScreenGetImageDataUrlInput) {
        const dataUrl = screenImages[input.captureId];
        if (!dataUrl) throw new Error(`Screen capture "${input.captureId}" was not found.`);
        return { dataUrl };
      },
      async analyze(input: ScreenAnalyzeInput) {
        const capture = screenCaptures.find((c) => c.id === input.captureId);
        if (!capture) throw new Error(`Screen capture "${input.captureId}" was not found.`);

        capture.analysisStatus = "PENDING";
        // Simulate the same AI "thinking" latency as a real vision call.
        await delay(700);

        const accessibilityElements = capture.visionElements.filter((element) => element.source === "ACCESSIBILITY");
        const canned = screenPendingAnalysis[capture.id];
        if (canned) {
          capture.visionDescription = canned.description;
          capture.visionElements = [...accessibilityElements, ...canned.elements.filter((element) => element.source !== "ACCESSIBILITY")];
        } else if (!capture.visionDescription) {
          capture.visionDescription = `(Preview) Simulated visual analysis of "${capture.activeWindowTitle ?? "this capture"}" — no distinct elements beyond the window itself could be estimated.`;
        }
        capture.analysisStatus = "ANALYZED";
        capture.visionProvider = "Preview Mode";
        capture.visionModel = "simulated-vision";
        capture.analyzedAt = nowIso();
        capture.analysisError = null;

        recordActivity({
          type: "INFO",
          source: "AGENT",
          message: `(Preview) Simulated AI visual analysis completed for capture ${capture.id}.`,
        });
        return capture;
      },
      async compare(input: ScreenCompareInput) {
        const before = screenCaptures.find((c) => c.id === input.beforeCaptureId);
        const after = screenCaptures.find((c) => c.id === input.afterCaptureId);
        if (!before || !after) throw new Error("Both captures must exist to compare them.");
        return compareScreenCaptures(before, after);
      },
    },
    vision: {
      async executeAction(input: VisionExecuteActionInput) {
        return simulateVisionInteraction(input);
      },
      async listInteractions(input?: VisionListInteractionsInput) {
        const limit = input?.limit ?? 20;
        return visionInteractions.slice(0, limit);
      },
    },
  };
}
