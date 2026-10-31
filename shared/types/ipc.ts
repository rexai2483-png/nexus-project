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
  ApprovalRequest,
  SystemEvent,
  SystemStatus,
  Task,
  UserSettings,
} from "./models";

export const IpcChannels = {
  SystemGetStatus: "system:getStatus",
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  TasksList: "tasks:list",
  ActivityList: "activity:list",
  ApprovalsListPending: "approvals:listPending",
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

/** Request payload type for each IPC channel. `void` = no arguments. */
export interface IpcRequestMap {
  [IpcChannels.SystemGetStatus]: void;
  [IpcChannels.SettingsGet]: void;
  [IpcChannels.SettingsUpdate]: SettingsUpdateInput;
  [IpcChannels.TasksList]: void;
  [IpcChannels.ActivityList]: ActivityListInput | void;
  [IpcChannels.ApprovalsListPending]: void;
}

/** Response payload type for each IPC channel. */
export interface IpcResponseMap {
  [IpcChannels.SystemGetStatus]: SystemStatus;
  [IpcChannels.SettingsGet]: UserSettings;
  [IpcChannels.SettingsUpdate]: UserSettings;
  [IpcChannels.TasksList]: Task[];
  [IpcChannels.ActivityList]: SystemEvent[];
  [IpcChannels.ApprovalsListPending]: ApprovalRequest[];
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
  };
  activity: {
    list: (input?: ActivityListInput) => Promise<SystemEvent[]>;
  };
  approvals: {
    listPending: () => Promise<ApprovalRequest[]>;
  };
}
