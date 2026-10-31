import { contextBridge, ipcRenderer } from "electron";
import type {
  ActivityListInput,
  IpcChannel,
  NexusBridge,
  SettingsUpdateInput,
} from "../shared/types/ipc";

/**
 * Secure preload bridge.
 *
 * Runs with `contextIsolation: true` and `nodeIntegration: false` (see
 * electron/main.ts). It exposes exactly one global, `window.nexus`, shaped
 * by the `NexusBridge` type in shared/types/ipc.ts. Every call is routed
 * through `ipcRenderer.invoke` to a channel the main process explicitly
 * registered in electron/ipc/handlers.ts.
 *
 * The renderer gets no reference to `ipcRenderer`, `require`, `process`,
 * the filesystem, or a shell — only these specific, typed async methods.
 *
 * The channel names below are intentionally duplicated as literals
 * (instead of importing the `IpcChannels` value from shared/types/ipc)
 * because Electron's sandboxed preload module loader cannot resolve a
 * `require()` of an arbitrary project-relative file outside node_modules.
 * `IpcChannel` keeps this list type-checked against the same source of
 * truth at compile time, so the two can't silently drift.
 */
const Channels = {
  SystemGetStatus: "system:getStatus",
  SettingsGet: "settings:get",
  SettingsUpdate: "settings:update",
  TasksList: "tasks:list",
  ActivityList: "activity:list",
  ApprovalsListPending: "approvals:listPending",
} as const satisfies Record<string, IpcChannel>;

const nexusBridge: NexusBridge = {
  system: {
    getStatus: () => ipcRenderer.invoke(Channels.SystemGetStatus),
  },
  settings: {
    get: () => ipcRenderer.invoke(Channels.SettingsGet),
    update: (input: SettingsUpdateInput) =>
      ipcRenderer.invoke(Channels.SettingsUpdate, input),
  },
  tasks: {
    list: () => ipcRenderer.invoke(Channels.TasksList),
  },
  activity: {
    list: (input?: ActivityListInput) =>
      ipcRenderer.invoke(Channels.ActivityList, input),
  },
  approvals: {
    listPending: () => ipcRenderer.invoke(Channels.ApprovalsListPending),
  },
};

contextBridge.exposeInMainWorld("nexus", nexusBridge);
