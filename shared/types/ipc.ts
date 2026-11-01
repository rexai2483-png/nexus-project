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

import type {
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
  ConversationsList: "conversations:list",
  ConversationsCreate: "conversations:create",
  ConversationsGet: "conversations:get",
  MessagesSend: "messages:send",
  AiGetStatus: "ai:getStatus",
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

/** Request payload type for each IPC channel. `void` = no arguments. */
export interface IpcRequestMap {
  [IpcChannels.SystemGetStatus]: void;
  [IpcChannels.SettingsGet]: void;
  [IpcChannels.SettingsUpdate]: SettingsUpdateInput;
  [IpcChannels.TasksList]: void;
  [IpcChannels.TasksGet]: TaskGetInput;
  [IpcChannels.ActivityList]: ActivityListInput | void;
  [IpcChannels.ApprovalsListPending]: void;
  [IpcChannels.ConversationsList]: void;
  [IpcChannels.ConversationsCreate]: ConversationCreateInput | void;
  [IpcChannels.ConversationsGet]: ConversationGetInput;
  [IpcChannels.MessagesSend]: MessageSendInput;
  [IpcChannels.AiGetStatus]: void;
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
  [IpcChannels.ConversationsList]: Conversation[];
  [IpcChannels.ConversationsCreate]: Conversation;
  [IpcChannels.ConversationsGet]: ConversationDetail;
  [IpcChannels.MessagesSend]: SendMessageResult;
  [IpcChannels.AiGetStatus]: AiStatus;
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
}
