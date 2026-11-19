import type {
  AgentAction,
  AgentActionStatus,
  AgentStatusSnapshot,
  ApprovalRequest,
  ConversationDetail,
  MemoryRecord,
  SystemEvent,
  TaskDetail,
  TaskStepStatus,
  UserSettings,
} from "@shared/types/models";
import type { DetectedUiElement, ScreenCapture } from "@shared/types/screenVision";

/**
 * Sample data for NEXUS's browser Preview Mode (see src/preview/mockBridge.ts).
 *
 * Everything here is clearly fabricated — plausible-looking tasks,
 * activity, conversations, and memory so every dashboard section has
 * something real to render when there is no Electron backend to talk
 * to. None of this is persisted, none of it reaches a database, and it
 * must never be mistaken for a real user's data (see the Preview Mode
 * banner in src/components/PreviewModeBanner.tsx, which is the actual
 * safeguard against that — this file just supplies content).
 */

const NOW = new Date();

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60);
}

function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

let idCounter = 0;
/** Deterministic, collision-free ids for seed data — no `Date.now()`/`Math.random()` needed. */
export function nextPreviewId(prefix: string): string {
  idCounter += 1;
  return `preview-${prefix}-${idCounter}`;
}

export function createSeedTasks(): TaskDetail[] {
  const tasks: TaskDetail[] = [
    {
      id: nextPreviewId("task"),
      title: "Organize Downloads folder by file type",
      description: "Sort loose files in Downloads into Documents, Images, and Archives subfolders.",
      instruction: "Can you tidy up my Downloads folder? It's a mess of screenshots and PDFs.",
      objective: "Downloads only contains organized subfolders, nothing loose at the top level.",
      risks: ["A file already open elsewhere could fail to move."],
      requiredResources: ["File Explorer"],
      completionCriteria: "No loose files remain directly inside Downloads.",
      sensitive: false,
      status: "RUNNING",
      conversationId: null,
      createdAt: hoursAgo(3),
      updatedAt: minutesAgo(6),
      stepCount: 4,
      pendingApprovalCount: 0,
      steps: [
        step(1, "Scan Downloads and group files by extension.", false, "COMPLETED"),
        step(2, "Create Documents, Images, and Archives subfolders.", false, "COMPLETED"),
        step(3, "Move matching files into each subfolder.", false, "RUNNING"),
        step(4, "Report a summary of what moved.", false, "PENDING"),
      ],
      approvalRequests: [],
    },
    {
      id: nextPreviewId("task"),
      title: "Draft a weekly status update email",
      description: "Compose a short status email summarizing this week's completed tasks.",
      instruction: "Write a quick status update email for my team covering what NEXUS did this week.",
      objective: "A clear, ready-to-send draft covering this week's completed and in-progress work.",
      risks: ["Typing into a mail client window always requires approval before anything is sent."],
      requiredResources: ["Default mail client"],
      completionCriteria: "Draft is composed and visible in the mail client, unsent.",
      sensitive: true,
      status: "PENDING",
      conversationId: null,
      createdAt: hoursAgo(20),
      updatedAt: hoursAgo(20),
      stepCount: 3,
      pendingApprovalCount: 1,
      steps: [
        step(1, "Summarize this week's completed tasks from Activity.", false, "PENDING"),
        step(2, "Open the default mail client and start a new message.", false, "PENDING"),
        step(3, "Type the drafted summary into the message body.", true, "PENDING"),
      ],
      approvalRequests: [],
    },
    {
      id: nextPreviewId("task"),
      title: "Set up a \"Reports\" workspace folder",
      description: "Create a Reports folder with a starter welcome note.",
      instruction: "Create a folder called Reports and add a short welcome note inside it.",
      objective: "A Reports folder exists with one starter text file inside it.",
      risks: [],
      requiredResources: ["File Explorer"],
      completionCriteria: "Reports/welcome.txt exists with placeholder content.",
      sensitive: false,
      status: "COMPLETED",
      conversationId: null,
      createdAt: daysAgo(1),
      updatedAt: hoursAgo(22),
      stepCount: 2,
      pendingApprovalCount: 0,
      steps: [
        step(1, "Create the Reports folder in the approved workspace.", false, "COMPLETED"),
        step(2, "Create welcome.txt inside it with a short note.", false, "COMPLETED"),
      ],
      approvalRequests: [],
    },
    {
      id: nextPreviewId("task"),
      title: "Take a screenshot of the current desktop",
      description: "Capture the current screen for reference.",
      instruction: "Grab a screenshot of what's on screen right now.",
      objective: "A screenshot is captured and saved for review.",
      risks: [],
      requiredResources: [],
      completionCriteria: "A screenshot file exists and its path is reported back.",
      sensitive: false,
      status: "FAILED",
      conversationId: null,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
      stepCount: 1,
      pendingApprovalCount: 0,
      steps: [step(1, "Capture the screen.", false, "FAILED")],
      approvalRequests: [],
    },
    {
      id: nextPreviewId("task"),
      title: "Check whether Calculator is already running",
      description: "Quick status check before launching a fresh instance.",
      instruction: "Is Calculator already open?",
      objective: "Report whether Calculator currently has a running process.",
      risks: [],
      requiredResources: ["Calculator"],
      completionCriteria: "A yes/no answer is reported back.",
      sensitive: false,
      status: "CANCELLED",
      conversationId: null,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
      stepCount: 1,
      pendingApprovalCount: 0,
      steps: [step(1, "Check for a running Calculator process.", false, "SKIPPED")],
      approvalRequests: [],
    },
  ];

  for (const task of tasks) {
    for (const taskStep of task.steps) {
      taskStep.taskId = task.id;
    }
  }
  return tasks;

  function step(
    order: number,
    description: string,
    requiresApproval: boolean,
    status: TaskStepStatus,
  ) {
    return {
      id: nextPreviewId("step"),
      taskId: "",
      order,
      description,
      requiresApproval,
      status,
      createdAt: daysAgo(1),
      updatedAt: hoursAgo(1),
    };
  }
}

export function createSeedActivity(): SystemEvent[] {
  return [
    { id: nextPreviewId("evt"), type: "INFO", source: "APP", message: "NEXUS Preview Mode started — showing sample data only.", createdAt: minutesAgo(1) },
    { id: nextPreviewId("evt"), type: "INFO", source: "TASK", message: 'Step 3 of "Organize Downloads folder by file type" started.', createdAt: minutesAgo(6) },
    { id: nextPreviewId("evt"), type: "INFO", source: "TASK", message: 'Step 2 of "Organize Downloads folder by file type" completed.', createdAt: minutesAgo(32) },
    { id: nextPreviewId("evt"), type: "WARNING", source: "AGENT", message: "Windows Agent heartbeat delayed by 4s.", createdAt: hoursAgo(1) },
    { id: nextPreviewId("evt"), type: "INFO", source: "TASK", message: 'Step 1 of "Organize Downloads folder by file type" completed.', createdAt: hoursAgo(2) },
    { id: nextPreviewId("evt"), type: "INFO", source: "TASK", message: '"Organize Downloads folder by file type" was proposed.', createdAt: hoursAgo(3) },
    { id: nextPreviewId("evt"), type: "WARNING", source: "TASK", message: '"Draft a weekly status update email" is awaiting approval before it can continue.', createdAt: hoursAgo(20) },
    { id: nextPreviewId("evt"), type: "INFO", source: "AGENT", message: "Windows Agent session started.", createdAt: hoursAgo(21) },
    { id: nextPreviewId("evt"), type: "INFO", source: "TASK", message: '"Set up a Reports workspace folder" completed successfully.', createdAt: hoursAgo(22) },
    { id: nextPreviewId("evt"), type: "SECURITY", source: "AGENT", message: "Emergency STOP activated by the user.", createdAt: daysAgo(1) },
    { id: nextPreviewId("evt"), type: "ERROR", source: "AGENT", message: 'Action "screen.captureScreenshot" failed: permission denied by the OS.', createdAt: daysAgo(2) },
    { id: nextPreviewId("evt"), type: "INFO", source: "DATABASE", message: "Local database connected.", createdAt: daysAgo(3) },
    { id: nextPreviewId("evt"), type: "INFO", source: "APP", message: "NEXUS backend started.", createdAt: daysAgo(3) },
  ];
}

export function createSeedConversations(taskIdForProposal: string | null): ConversationDetail[] {
  const conversationId = nextPreviewId("conv");
  return [
    {
      id: conversationId,
      title: "Getting started with NEXUS",
      createdAt: hoursAgo(21),
      updatedAt: hoursAgo(20),
      messages: [
        {
          id: nextPreviewId("msg"),
          conversationId,
          role: "USER",
          content: "What can you help me with?",
          intent: null,
          taskId: null,
          createdAt: hoursAgo(21),
        },
        {
          id: nextPreviewId("msg"),
          conversationId,
          role: "ASSISTANT",
          content:
            "I can hold a conversation, and when you describe something you'd like done on this computer, I'll propose a step-by-step plan for you to review — nothing runs until you approve the steps that need it.",
          intent: "CONVERSATION",
          taskId: null,
          createdAt: hoursAgo(21),
        },
        {
          id: nextPreviewId("msg"),
          conversationId,
          role: "USER",
          content: "Create a folder called Reports and add a short welcome note inside it.",
          intent: null,
          taskId: null,
          createdAt: hoursAgo(20),
        },
        {
          id: nextPreviewId("msg"),
          conversationId,
          role: "ASSISTANT",
          content: "Here's a plan for that — two small steps, nothing sensitive.",
          intent: "TASK",
          taskId: taskIdForProposal,
          createdAt: hoursAgo(20),
        },
      ],
    },
  ];
}

export function createSeedMemory(): MemoryRecord[] {
  return [
    { id: nextPreviewId("mem"), type: "PREFERENCE", key: "theme", value: "Prefers the dark theme.", createdAt: daysAgo(5), updatedAt: daysAgo(1) },
    { id: nextPreviewId("mem"), type: "PREFERENCE", key: "default-browser", value: "Prefers links to open in Chrome.", createdAt: daysAgo(5), updatedAt: daysAgo(5) },
    { id: nextPreviewId("mem"), type: "FACT", key: "workspace-root", value: "Approved workspace root is the user's Documents\\NEXUS folder.", createdAt: daysAgo(4), updatedAt: daysAgo(4) },
    { id: nextPreviewId("mem"), type: "FACT", key: "timezone", value: "User is in the America/New_York timezone.", createdAt: daysAgo(4), updatedAt: daysAgo(4) },
    { id: nextPreviewId("mem"), type: "CONTEXT", key: "current-focus", value: "Currently polishing the NEXUS dashboard and floating assistant (Sprint 3).", createdAt: hoursAgo(5), updatedAt: hoursAgo(1) },
    { id: nextPreviewId("mem"), type: "CONTEXT", key: "recent-topic", value: "Last asked about organizing the Downloads folder.", createdAt: hoursAgo(3), updatedAt: hoursAgo(3) },
    { id: nextPreviewId("mem"), type: "SKILL", key: "approved-apps", value: "Can operate Notepad, Calculator, File Explorer, and Paint.", createdAt: daysAgo(6), updatedAt: daysAgo(6) },
    { id: nextPreviewId("mem"), type: "SKILL", key: "approved-shortcuts", value: "Can send Save, Copy, Paste, Select All, and Undo shortcuts.", createdAt: daysAgo(6), updatedAt: daysAgo(6) },
  ];
}

export function createSeedSettings(): UserSettings {
  return {
    id: "preview",
    theme: "dark",
    launchOnStartup: false,
    telemetryEnabled: false,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(1),
  };
}

export function createSeedAgentStatus(): AgentStatusSnapshot {
  return {
    connectionState: "DISCONNECTED",
    sessionId: null,
    sessionStatus: null,
    startedAt: null,
    lastHeartbeatAt: null,
    haltedUntilRestart: false,
    activeActionCount: 0,
    platform: null,
  };
}

export function createSeedAgentActions(): AgentAction[] {
  const seeded: Array<[string, AgentActionStatus, number]> = [
    ["app.launch", "SUCCEEDED", 190],
    ["screen.captureScreenshot", "SUCCEEDED", 185],
    ["fs.createFolder", "SUCCEEDED", 120],
  ];
  return seeded.map(([type, status, minsAgo]) => ({
    id: nextPreviewId("action"),
    sessionId: nextPreviewId("session"),
    type,
    parameters: {},
    permissionLevel: "LOW",
    requiresApproval: false,
    status,
    approvalRequestId: null,
    result: { preview: true, note: "Simulated result from a past Preview Mode session." },
    errorCode: null,
    errorMessage: null,
    screenshotPath: null,
    submittedAt: minutesAgo(minsAgo),
    startedAt: minutesAgo(minsAgo),
    completedAt: minutesAgo(minsAgo - 1),
  }));
}

// ---------------------------------------------------------------------------
// Screen Understanding (Sprint 4) sample data.
//
// Preview Mode has no real screenshots to show — there is no Electron, no
// filesystem, no Windows Agent. Rather than fake a photographic
// screenshot, each sample "capture" below is a small inline SVG mockup of
// a plausible desktop window, clearly a drawing rather than a real photo,
// with element bounding boxes authored to actually line up with what's
// drawn — so the bounding-box overlay and comparison features have
// something real (if fabricated) to demonstrate. ASCII-only text so
// `btoa()` doesn't choke on non-Latin1 characters.
// ---------------------------------------------------------------------------

function svgDataUrl(width: number, height: number, body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    body +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function windowChrome(width: number, height: number, title: string): string {
  return (
    `<rect width="${width}" height="${height}" fill="#15171c" stroke="#24262e" stroke-width="2"/>` +
    `<rect width="${width}" height="34" fill="#1c1e25"/>` +
    `<circle cx="18" cy="17" r="5" fill="#e0616b"/><circle cx="36" cy="17" r="5" fill="#d9a441"/><circle cx="54" cy="17" r="5" fill="#4caf7d"/>` +
    `<text x="${width / 2}" y="22" font-family="sans-serif" font-size="13" fill="#8b8d97" text-anchor="middle">${title}</text>`
  );
}

function sampleButton(x: number, y: number, w: number, h: number, label: string): string {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2a3a56" stroke="#5b8def"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2 + 4}" font-family="sans-serif" font-size="12" fill="#e6e7ea" text-anchor="middle">${label}</text>`
  );
}

const SAMPLE_WIDTH = 1280;
const SAMPLE_HEIGHT = 800;
const CALC_WIDTH = 360;
const CALC_HEIGHT = 520;

/**
 * A generic, clearly-labeled placeholder image for a capture created on
 * demand (e.g. clicking "Capture full screen" in Preview Mode) rather
 * than one of the three pre-authored samples below — used by
 * src/preview/mockBridge.ts's `recordSimulatedScreenCapture()`.
 */
export function createGenericCaptureImage(title: string, width: number, height: number): string {
  return svgDataUrl(
    width,
    height,
    windowChrome(width, height, title) +
      `<text x="${width / 2}" y="${height / 2}" font-family="sans-serif" font-size="15" fill="#5b5d66" text-anchor="middle">` +
      `Simulated capture - Preview Mode, not a real screenshot</text>`,
  );
}

export interface ScreenCaptureSeed {
  captures: ScreenCapture[];
  /** captureId -> sample image data URL. Kept separate from `ScreenCapture` itself (which never carries image bytes, matching the real type) — the mock's `screen.getImageDataUrl()` looks here instead of reading a file. */
  images: Record<string, string>;
  /** Canned analysis results for captures seeded as NOT_REQUESTED, keyed by capture id — the mock's `screen.analyze()` looks here instead of calling anything. */
  pendingAnalysis: Record<string, { description: string; elements: DetectedUiElement[] }>;
}

export function createSeedScreenCaptures(): ScreenCaptureSeed {
  // --- Capture A: "NEXUS Notes" text editor, already analyzed. ---
  const notesId = nextPreviewId("capture");
  const notesImage = svgDataUrl(
    SAMPLE_WIDTH,
    SAMPLE_HEIGHT,
    windowChrome(SAMPLE_WIDTH, SAMPLE_HEIGHT, "NEXUS Notes - Untitled.txt (sample mockup, not a real screenshot)") +
      sampleButton(24, 50, 90, 32, "Open") +
      sampleButton(124, 50, 90, 32, "Save") +
      `<text x="24" y="38" font-family="sans-serif" font-size="12" fill="#5b5d66">File  Edit  View</text>` +
      `<rect x="24" y="100" width="220" height="660" fill="#121317" stroke="#24262e"/>` +
      `<text x="36" y="126" font-family="sans-serif" font-size="12" fill="#8b8d97">Notes</text>` +
      `<text x="36" y="150" font-family="sans-serif" font-size="12" fill="#8b8d97">Todo</text>` +
      `<text x="36" y="174" font-family="sans-serif" font-size="12" fill="#8b8d97">Ideas</text>` +
      `<rect x="260" y="100" width="996" height="660" fill="#0b0c0f" stroke="#24262e"/>` +
      `<text x="276" y="128" font-family="sans-serif" font-size="13" fill="#e6e7ea">Sprint 4 notes:</text>` +
      `<text x="276" y="150" font-family="sans-serif" font-size="13" fill="#8b8d97">- Screen capture</text>` +
      `<text x="276" y="172" font-family="sans-serif" font-size="13" fill="#8b8d97">- Vision analysis</text>` +
      `<text x="24" y="774" font-family="sans-serif" font-size="11" fill="#5b5d66">Word count: 128</text>`,
  );
  const notesElements: DetectedUiElement[] = [
    {
      id: "window",
      source: "ACCESSIBILITY",
      type: "window",
      label: "NEXUS Notes - Untitled.txt",
      boundingBox: { left: 0, top: 0, width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT },
      confidence: 1,
      interactive: true,
    },
    { id: "btn-open", source: "AI_VISUAL", type: "button", label: "Open", boundingBox: { left: 24, top: 50, width: 90, height: 32 }, confidence: 0.95, interactive: true },
    { id: "btn-save", source: "AI_VISUAL", type: "button", label: "Save", boundingBox: { left: 124, top: 50, width: 90, height: 32 }, confidence: 0.94, interactive: true },
    { id: "menu-file", source: "AI_VISUAL", type: "menu", label: "File", boundingBox: { left: 24, top: 28, width: 40, height: 18 }, confidence: 0.82, interactive: true },
    { id: "sidebar", source: "AI_VISUAL", type: "list", label: "Notes / Todo / Ideas", boundingBox: { left: 24, top: 100, width: 220, height: 660 }, confidence: 0.85, interactive: true },
    { id: "body", source: "AI_VISUAL", type: "textField", label: "Document body", boundingBox: { left: 260, top: 100, width: 996, height: 660 }, confidence: 0.88, interactive: true },
    { id: "word-count", source: "AI_VISUAL", type: "text", label: "Word count: 128", boundingBox: { left: 24, top: 760, width: 160, height: 20 }, confidence: 0.8, interactive: false },
  ];

  // --- Capture B: "Calculator", a different app - also analyzed, used to demonstrate comparison/transition detection. ---
  const calcId = nextPreviewId("capture");
  const calcImage = svgDataUrl(
    CALC_WIDTH,
    CALC_HEIGHT,
    windowChrome(CALC_WIDTH, CALC_HEIGHT, "Calculator (sample mockup)") +
      `<rect x="20" y="50" width="320" height="60" fill="#0b0c0f" stroke="#24262e"/>` +
      `<text x="330" y="90" font-family="sans-serif" font-size="28" fill="#e6e7ea" text-anchor="end">42</text>` +
      sampleButton(20, 140, 70, 60, "7") +
      sampleButton(100, 140, 70, 60, "8") +
      sampleButton(180, 140, 70, 60, "9") +
      sampleButton(260, 140, 70, 200, "="),
  );
  const calcElements: DetectedUiElement[] = [
    {
      id: "window",
      source: "ACCESSIBILITY",
      type: "window",
      label: "Calculator",
      boundingBox: { left: 0, top: 0, width: CALC_WIDTH, height: CALC_HEIGHT },
      confidence: 1,
      interactive: true,
    },
    { id: "display", source: "AI_VISUAL", type: "text", label: "42", boundingBox: { left: 20, top: 50, width: 320, height: 60 }, confidence: 0.9, interactive: false },
    { id: "btn-7", source: "AI_VISUAL", type: "button", label: "7", boundingBox: { left: 20, top: 140, width: 70, height: 60 }, confidence: 0.93, interactive: true },
    { id: "btn-8", source: "AI_VISUAL", type: "button", label: "8", boundingBox: { left: 100, top: 140, width: 70, height: 60 }, confidence: 0.93, interactive: true },
    { id: "btn-9", source: "AI_VISUAL", type: "button", label: "9", boundingBox: { left: 180, top: 140, width: 70, height: 60 }, confidence: 0.93, interactive: true },
    { id: "btn-equals", source: "AI_VISUAL", type: "button", label: "=", boundingBox: { left: 260, top: 140, width: 70, height: 200 }, confidence: 0.9, interactive: true },
  ];

  // --- Capture C: "File Explorer", not analyzed yet - demonstrates the explicit "Analyze with AI Vision" action. ---
  const explorerId = nextPreviewId("capture");
  const explorerImage = svgDataUrl(
    SAMPLE_WIDTH,
    SAMPLE_HEIGHT,
    windowChrome(SAMPLE_WIDTH, SAMPLE_HEIGHT, "File Explorer - Documents (sample mockup, not a real screenshot)") +
      sampleButton(24, 50, 140, 32, "New Folder") +
      `<rect x="24" y="110" width="1232" height="48" fill="#121317" stroke="#24262e"/>` +
      `<text x="40" y="140" font-family="sans-serif" font-size="13" fill="#e6e7ea">Report.docx</text>` +
      `<rect x="24" y="166" width="1232" height="48" fill="#121317" stroke="#24262e"/>` +
      `<text x="40" y="196" font-family="sans-serif" font-size="13" fill="#e6e7ea">Notes.txt</text>` +
      `<rect x="24" y="222" width="1232" height="48" fill="#121317" stroke="#24262e"/>` +
      `<text x="40" y="252" font-family="sans-serif" font-size="13" fill="#e6e7ea">Budget.xlsx</text>`,
  );
  const explorerAccessibilityElement: DetectedUiElement = {
    id: "window",
    source: "ACCESSIBILITY",
    type: "window",
    label: "File Explorer - Documents",
    boundingBox: { left: 0, top: 0, width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT },
    confidence: 1,
    interactive: true,
  };
  const explorerAnalyzedElements: DetectedUiElement[] = [
    explorerAccessibilityElement,
    { id: "btn-new-folder", source: "AI_VISUAL", type: "button", label: "New Folder", boundingBox: { left: 24, top: 50, width: 140, height: 32 }, confidence: 0.92, interactive: true },
    { id: "row-report", source: "AI_VISUAL", type: "listItem", label: "Report.docx", boundingBox: { left: 24, top: 110, width: 1232, height: 48 }, confidence: 0.87, interactive: true },
    { id: "row-notes", source: "AI_VISUAL", type: "listItem", label: "Notes.txt", boundingBox: { left: 24, top: 166, width: 1232, height: 48 }, confidence: 0.87, interactive: true },
    { id: "row-budget", source: "AI_VISUAL", type: "listItem", label: "Budget.xlsx", boundingBox: { left: 24, top: 222, width: 1232, height: 48 }, confidence: 0.87, interactive: true },
  ];

  const captures: ScreenCapture[] = [
    {
      id: explorerId,
      captureType: "FULL_SCREEN",
      capturedAt: minutesAgo(2),
      activeWindowTitle: "File Explorer - Documents",
      activeWindowRegion: { left: 0, top: 0, width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT },
      agentActionId: null,
      analysisStatus: "NOT_REQUESTED",
      visionDescription: null,
      visionElements: [explorerAccessibilityElement],
      visionProvider: null,
      visionModel: null,
      analysisError: null,
      analyzedAt: null,
      createdAt: minutesAgo(2),
      updatedAt: minutesAgo(2),
    },
    {
      id: calcId,
      captureType: "ACTIVE_WINDOW",
      capturedAt: minutesAgo(30),
      activeWindowTitle: "Calculator",
      activeWindowRegion: { left: 0, top: 0, width: CALC_WIDTH, height: CALC_HEIGHT },
      agentActionId: null,
      analysisStatus: "ANALYZED",
      visionDescription:
        "A Calculator window is open, showing \"42\" on its display and a row of numeric buttons including 7, 8, and 9, plus a tall equals button.",
      visionElements: calcElements,
      visionProvider: "Preview Mode",
      visionModel: "simulated-vision",
      analysisError: null,
      analyzedAt: minutesAgo(29),
      createdAt: minutesAgo(30),
      updatedAt: minutesAgo(29),
    },
    {
      id: notesId,
      captureType: "FULL_SCREEN",
      capturedAt: hoursAgo(1),
      activeWindowTitle: "NEXUS Notes - Untitled.txt",
      activeWindowRegion: { left: 0, top: 0, width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT },
      agentActionId: null,
      analysisStatus: "ANALYZED",
      visionDescription:
        "A text editor window titled \"NEXUS Notes - Untitled.txt\" is open, showing a toolbar with Open and Save buttons, a File menu, a sidebar listing Notes/Todo/Ideas, and a large document body. A word count is shown at the bottom left.",
      visionElements: notesElements,
      visionProvider: "Preview Mode",
      visionModel: "simulated-vision",
      analysisError: null,
      analyzedAt: hoursAgo(1),
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
    },
  ];

  return {
    captures,
    images: {
      [explorerId]: explorerImage,
      [calcId]: calcImage,
      [notesId]: notesImage,
    },
    pendingAnalysis: {
      [explorerId]: {
        description:
          "A File Explorer window titled \"File Explorer - Documents\" is open, showing a New Folder button and a list of files: Report.docx, Notes.txt, and Budget.xlsx.",
        elements: explorerAnalyzedElements,
      },
    },
  };
}

export function createSeedApprovals(tasks: TaskDetail[]): ApprovalRequest[] {
  const emailTask = tasks.find((t) => t.title.startsWith("Draft a weekly"));
  if (!emailTask) return [];
  const sensitiveStep = emailTask.steps.find((s) => s.requiresApproval);
  const approval: ApprovalRequest = {
    id: nextPreviewId("approval"),
    taskId: emailTask.id,
    taskStepId: sensitiveStep?.id ?? null,
    agentActionId: null,
    title: "Approve: Type drafted summary into mail client",
    description: "Typing into a window that looks like a mail client always requires approval before it happens.",
    status: "PENDING",
    requestedAt: emailTask.createdAt,
    resolvedAt: null,
  };
  return [approval];
}
