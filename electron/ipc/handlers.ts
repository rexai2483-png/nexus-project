import { BrowserWindow, ipcMain } from "electron";
import { IpcChannels } from "../../shared/types/ipc";
import {
  settingsService,
  taskService,
  activityService,
  approvalService,
  systemService,
  conversationService,
  agentManager,
  memoryService,
  screenCaptureService,
  screenVisionService,
  getAiStatus,
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

  // Pins/unpins whichever window actually sent the request — there is
  // only ever one NEXUS window today, but resolving it from the event's
  // sender (rather than a module-level reference) keeps this handler
  // correct if that ever changes.
  ipcMain.handle(IpcChannels.SystemSetAlwaysOnTop, (event, input) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setAlwaysOnTop(input.enabled);
    return { enabled: win?.isAlwaysOnTop() ?? false };
  });

  ipcMain.handle(IpcChannels.SettingsGet, () => settingsService.getSettings());

  ipcMain.handle(IpcChannels.SettingsUpdate, (_event, input) =>
    settingsService.updateSettings(input),
  );

  ipcMain.handle(IpcChannels.TasksList, () => taskService.listTasks());

  ipcMain.handle(IpcChannels.TasksGet, async (_event, input) => {
    const task = await taskService.getTask(input.taskId);
    if (!task) throw new Error(`Task "${input.taskId}" was not found.`);
    return task;
  });

  ipcMain.handle(IpcChannels.ActivityList, (_event, input) =>
    activityService.listActivity(input ?? undefined),
  );

  ipcMain.handle(IpcChannels.ApprovalsListPending, () =>
    approvalService.listPendingApprovals(),
  );

  ipcMain.handle(IpcChannels.ConversationsList, () => conversationService.listConversations());

  ipcMain.handle(IpcChannels.ConversationsCreate, (_event, input) =>
    conversationService.createConversation(input ?? undefined),
  );

  ipcMain.handle(IpcChannels.ConversationsGet, async (_event, input) => {
    const conversation = await conversationService.getConversation(input.conversationId);
    if (!conversation) throw new Error(`Conversation "${input.conversationId}" was not found.`);
    return conversation;
  });

  ipcMain.handle(IpcChannels.MessagesSend, (_event, input) =>
    conversationService.sendMessage(input),
  );

  ipcMain.handle(IpcChannels.AiGetStatus, () => getAiStatus());

  ipcMain.handle(IpcChannels.ApprovalsDecide, (_event, input) =>
    agentManager.decideApproval(input.approvalRequestId, input.decision),
  );

  ipcMain.handle(IpcChannels.AgentGetStatus, () => agentManager.getAgentStatus());
  ipcMain.handle(IpcChannels.AgentStart, () => agentManager.startAgentSession());
  ipcMain.handle(IpcChannels.AgentStop, () => agentManager.stopAgentSession());
  ipcMain.handle(IpcChannels.AgentEmergencyStop, () => agentManager.emergencyStop());
  ipcMain.handle(IpcChannels.AgentListActions, (_event, input) =>
    agentManager.listRecentActions(input?.limit),
  );
  ipcMain.handle(IpcChannels.AgentSubmitAction, (_event, input) =>
    agentManager.submitAction(input.actionType, input.parameters),
  );
  ipcMain.handle(IpcChannels.AgentCancelAction, (_event, input) =>
    agentManager.cancelAction(input.actionId),
  );

  ipcMain.handle(IpcChannels.MemoryList, () => memoryService.listMemoryRecords());

  ipcMain.handle(IpcChannels.ScreenListCaptures, (_event, input) =>
    screenCaptureService.listCaptures(input?.limit),
  );
  ipcMain.handle(IpcChannels.ScreenGetCapture, async (_event, input) => {
    const capture = await screenCaptureService.getCapture(input.captureId);
    if (!capture) throw new Error(`Screen capture "${input.captureId}" was not found.`);
    return capture;
  });
  ipcMain.handle(IpcChannels.ScreenGetImageDataUrl, async (_event, input) => {
    const dataUrl = await screenCaptureService.getImageDataUrl(input.captureId);
    if (!dataUrl) throw new Error(`Screen capture "${input.captureId}" was not found.`);
    return { dataUrl };
  });
  ipcMain.handle(IpcChannels.ScreenAnalyze, (_event, input) =>
    screenVisionService.analyzeCapture(input.captureId),
  );
  ipcMain.handle(IpcChannels.ScreenCompare, (_event, input) =>
    screenVisionService.compareCaptures(input.beforeCaptureId, input.afterCaptureId),
  );
}
