import { ipcMain } from "electron";
import { IpcChannels } from "../../shared/types/ipc";
import {
  settingsService,
  taskService,
  activityService,
  approvalService,
  systemService,
  conversationService,
  agentManager,
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
}
