import { ipcMain } from "electron";
import { IpcChannels } from "../../shared/types/ipc";
import {
  settingsService,
  taskService,
  activityService,
  approvalService,
  systemService,
} from "../../backend";

/**
 * Registers every IPC handler the renderer is allowed to call.
 *
 * This is the only place `ipcMain.handle` is used. The renderer has no
 * other way to reach the backend — see electron/preload.ts for the
 * matching `contextBridge` surface, and shared/types/ipc.ts for the
 * typed contract both sides implement.
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.SystemGetStatus, () => systemService.getSystemStatus());

  ipcMain.handle(IpcChannels.SettingsGet, () => settingsService.getSettings());

  ipcMain.handle(IpcChannels.SettingsUpdate, (_event, input) =>
    settingsService.updateSettings(input),
  );

  ipcMain.handle(IpcChannels.TasksList, () => taskService.listTasks());

  ipcMain.handle(IpcChannels.ActivityList, (_event, input) =>
    activityService.listActivity(input ?? undefined),
  );

  ipcMain.handle(IpcChannels.ApprovalsListPending, () =>
    approvalService.listPendingApprovals(),
  );
}
