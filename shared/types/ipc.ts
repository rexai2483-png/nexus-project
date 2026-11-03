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
  SendMessageResult,
  SystemEvent,
  SystemStatus,
  Task,
  TaskDetail,
  UserSettings,
} from "./models";

export const IpcChannels = {
  SystemGetStatus: "system:getStatus",
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
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

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

/** Request payload type for each IPC channel. `void` = no arguments. */
export interface IpcRequestMap {
  [IpcChannels.SystemGetStatus]: void;
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
}

/** Response payload type for each IPC channel. */
export interface IpcResponseMap {
  [IpcChannels.SystemGetStatus]: SystemStatus;
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
}

/**
 * The shape of the API exposed on `window.nexus` by the preload script.
 * Kept in sync with electron/preload.ts by hand — both import this type.
 */
export interface NexusBridge {
  system: {
    getStatus: () => Promise<SystemStatus>;
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
}
