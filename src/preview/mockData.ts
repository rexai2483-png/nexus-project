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
