/**
 * Strictly-typed IPC contract between the Electron main process and the
 * React renderer.
 *
 * The renderer NEVER touches Node.js, the filesystem, or a shell. It can
 * only call the narrow set of methods exposed on `window.nexus` by
 * electron/preload.ts, which in turn invoke one of the channels below
 * through `ipcRenderer.invoke`. The main process is the only place that
 * ever calls the backend / Prisma.
 *
 * Adding a new capability means: add a channel here, implement its
 * handler in electron/ipc/handlers.ts, and expose a method for it in
 * electron/preload.ts. Nothing else may bypass this contract.
 */

import type { AgentActionType } from "./agentActions";
import type {
  AgentAction,
  AgentStatusSnapshot,
  AiStatus,
  ApprovalRequest,
  Conversation,
  ConversationDetail,
  MemoryRecord,
  SendMessageResult,
  SystemEvent,
  SystemStatus,
  Task,
  TaskDetail,
  UserSettings,
} from "./models";
import type { ScreenCapture, ScreenComparisonResult } from "./screenVision";
import type { VisionActionRequest, VisionInteractionResult } from "./visionActions";

export const IpcChannels = {
  SystemGetStatus: "system:getStatus",
  SystemSetAlwaysOnTop: "system:setAlwaysOnTop",
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  TasksList: "tasks:list",
  TasksGet: "tasks:get",
  ActivityList: "activity:list",
  ApprovalsListPending: "approvals:listPending",
  ApprovalsDecide: "approvals:decide",
  ConversationsList: "conversations:list",
  ConversationsCreate: "conversations:create",
  ConversationsGet: "conversations:get",
  MessagesSend: "messages:send",
  AiGetStatus: "ai:getStatus",
  AgentGetStatus: "agent:getStatus",
  AgentStart: "agent:start",
  AgentStop: "agent:stop",
  AgentEmergencyStop: "agent:emergencyStop",
  AgentListActions: "agent:listActions",
  AgentSubmitAction: "agent:submitAction",
  AgentCancelAction: "agent:cancelAction",
  MemoryList: "memory:list",
  ScreenListCaptures: "screen:listCaptures",
  ScreenGetCapture: "screen:getCapture",
  ScreenGetImageDataUrl: "screen:getImageDataUrl",
  ScreenAnalyze: "screen:analyze",
  ScreenCompare: "screen:compare",
  VisionExecuteAction: "vision:executeAction",
  VisionListInteractions: "vision:listInteractions",
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface SystemSetAlwaysOnTopInput {
  enabled: boolean;
}

export interface SystemAlwaysOnTopResult {
  enabled: boolean;
}

export interface SettingsUpdateInput {
  theme?: UserSettings["theme"];
  launchOnStartup?: boolean;
  telemetryEnabled?: boolean;
}

export interface ActivityListInput {
  limit?: number;
}

export interface TaskGetInput {
  taskId: string;
}

export interface ConversationCreateInput {
  title?: string;
}

export interface ConversationGetInput {
  conversationId: string;
}

export interface MessageSendInput {
  conversationId: string;
  content: string;
}

export interface ApprovalsDecideInput {
  approvalRequestId: string;
  decision: "APPROVED" | "DENIED";
}

export interface AgentListActionsInput {
  limit?: number;
}

export interface AgentSubmitActionInput {
  actionType: AgentActionType;
  parameters: Record<string, unknown>;
}

export interface AgentCancelActionInput {
  actionId: string;
}

export interface ScreenListCapturesInput {
  limit?: number;
}

export interface ScreenGetCaptureInput {
  captureId: string;
}

export interface ScreenGetImageDataUrlInput {
  captureId: string;
}

export interface ScreenAnalyzeInput {
  captureId: string;
}

export interface ScreenCompareInput {
  beforeCaptureId: string;
  afterCaptureId: string;
}

export type VisionExecuteActionInput = VisionActionRequest;

export interface VisionListInteractionsInput {
  limit?: number;
}

/** Request payload type for each IPC channel. `void` = no arguments. */
export interface IpcRequestMap {
  [IpcChannels.SystemGetStatus]: void;
  [IpcChannels.SystemSetAlwaysOnTop]: SystemSetAlwaysOnTopInput;
  [IpcChannels.SettingsGet]: void;
  [IpcChannels.SettingsUpdate]: SettingsUpdateInput;
  [IpcChannels.TasksList]: void;
  [IpcChannels.TasksGet]: TaskGetInput;
  [IpcChannels.ActivityList]: ActivityListInput | void;
  [IpcChannels.ApprovalsListPending]: void;
  [IpcChannels.ApprovalsDecide]: ApprovalsDecideInput;
  [IpcChannels.ConversationsList]: void;
  [IpcChannels.ConversationsCreate]: ConversationCreateInput | void;
  [IpcChannels.ConversationsGet]: ConversationGetInput;
  [IpcChannels.MessagesSend]: MessageSendInput;
  [IpcChannels.AiGetStatus]: void;
  [IpcChannels.AgentGetStatus]: void;
  [IpcChannels.AgentStart]: void;
  [IpcChannels.AgentStop]: void;
  [IpcChannels.AgentEmergencyStop]: void;
  [IpcChannels.AgentListActions]: AgentListActionsInput | void;
  [IpcChannels.AgentSubmitAction]: AgentSubmitActionInput;
  [IpcChannels.AgentCancelAction]: AgentCancelActionInput;
  [IpcChannels.MemoryList]: void;
  [IpcChannels.ScreenListCaptures]: ScreenListCapturesInput | void;
  [IpcChannels.ScreenGetCapture]: ScreenGetCaptureInput;
  [IpcChannels.ScreenGetImageDataUrl]: ScreenGetImageDataUrlInput;
  [IpcChannels.ScreenAnalyze]: ScreenAnalyzeInput;
  [IpcChannels.ScreenCompare]: ScreenCompareInput;
  [IpcChannels.VisionExecuteAction]: VisionExecuteActionInput;
  [IpcChannels.VisionListInteractions]: VisionListInteractionsInput | void;
}

/** Response payload type for each IPC channel. */
export interface IpcResponseMap {
  [IpcChannels.SystemGetStatus]: SystemStatus;
  [IpcChannels.SystemSetAlwaysOnTop]: SystemAlwaysOnTopResult;
  [IpcChannels.SettingsGet]: UserSettings;
  [IpcChannels.SettingsUpdate]: UserSettings;
  [IpcChannels.TasksList]: Task[];
  [IpcChannels.TasksGet]: TaskDetail;
  [IpcChannels.ActivityList]: SystemEvent[];
  [IpcChannels.ApprovalsListPending]: ApprovalRequest[];
  [IpcChannels.ApprovalsDecide]: ApprovalRequest;
  [IpcChannels.ConversationsList]: Conversation[];
  [IpcChannels.ConversationsCreate]: Conversation;
  [IpcChannels.ConversationsGet]: ConversationDetail;
  [IpcChannels.MessagesSend]: SendMessageResult;
  [IpcChannels.AiGetStatus]: AiStatus;
  [IpcChannels.AgentGetStatus]: AgentStatusSnapshot;
  [IpcChannels.AgentStart]: AgentStatusSnapshot;
  [IpcChannels.AgentStop]: AgentStatusSnapshot;
  [IpcChannels.AgentEmergencyStop]: AgentStatusSnapshot;
  [IpcChannels.AgentListActions]: AgentAction[];
  [IpcChannels.AgentSubmitAction]: AgentAction;
  [IpcChannels.AgentCancelAction]: void;
  [IpcChannels.MemoryList]: MemoryRecord[];
  [IpcChannels.ScreenListCaptures]: ScreenCapture[];
  [IpcChannels.ScreenGetCapture]: ScreenCapture;
  [IpcChannels.ScreenGetImageDataUrl]: { dataUrl: string };
  [IpcChannels.ScreenAnalyze]: ScreenCapture;
  [IpcChannels.ScreenCompare]: ScreenComparisonResult;
  [IpcChannels.VisionExecuteAction]: VisionInteractionResult;
  [IpcChannels.VisionListInteractions]: VisionInteractionResult[];
}

/**
 * The shape of the API exposed on `window.nexus` by the preload script.
 * Kept in sync with electron/preload.ts by hand — both import this type.
 */
export interface NexusBridge {
  system: {
    getStatus: () => Promise<SystemStatus>;
    /** Electron-only: pins/unpins the main window above other windows. */
    setAlwaysOnTop: (input: SystemSetAlwaysOnTopInput) => Promise<SystemAlwaysOnTopResult>;
  };
  settings: {
    get: () => Promise<UserSettings>;
    update: (input: SettingsUpdateInput) => Promise<UserSettings>;
  };
  tasks: {
    list: () => Promise<Task[]>;
    get: (input: TaskGetInput) => Promise<TaskDetail>;
  };
  activity: {
    list: (input?: ActivityListInput) => Promise<SystemEvent[]>;
  };
  approvals: {
    listPending: () => Promise<ApprovalRequest[]>;
    decide: (input: ApprovalsDecideInput) => Promise<ApprovalRequest>;
  };
  conversations: {
    list: () => Promise<Conversation[]>;
    create: (input?: ConversationCreateInput) => Promise<Conversation>;
    get: (input: ConversationGetInput) => Promise<ConversationDetail>;
  };
  messages: {
    send: (input: MessageSendInput) => Promise<SendMessageResult>;
  };
  ai: {
    getStatus: () => Promise<AiStatus>;
  };
  agent: {
    getStatus: () => Promise<AgentStatusSnapshot>;
    start: () => Promise<AgentStatusSnapshot>;
    stop: () => Promise<AgentStatusSnapshot>;
    emergencyStop: () => Promise<AgentStatusSnapshot>;
    listActions: (input?: AgentListActionsInput) => Promise<AgentAction[]>;
    submitAction: (input: AgentSubmitActionInput) => Promise<AgentAction>;
    cancelAction: (input: AgentCancelActionInput) => Promise<void>;
  };
  memory: {
    list: () => Promise<MemoryRecord[]>;
  };
  screen: {
    listCaptures: (input?: ScreenListCapturesInput) => Promise<ScreenCapture[]>;
    getCapture: (input: ScreenGetCaptureInput) => Promise<ScreenCapture>;
    /** Resolves to a `data:` URL — the only way image bytes ever reach the renderer. */
    getImageDataUrl: (input: ScreenGetImageDataUrlInput) => Promise<{ dataUrl: string }>;
    analyze: (input: ScreenAnalyzeInput) => Promise<ScreenCapture>;
    compare: (input: ScreenCompareInput) => Promise<ScreenComparisonResult>;
  };
  vision: {
    /** Runs one full observe→act→verify cycle for one previously-identified target. Never rejects for an expected outcome (failure/uncertainty/awaiting approval) — see `VisionInteractionResult.status`. */
    executeAction: (input: VisionExecuteActionInput) => Promise<VisionInteractionResult>;
    listInteractions: (input?: VisionListInteractionsInput) => Promise<VisionInteractionResult[]>;
  };
}
