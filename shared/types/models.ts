/**
 * Shared domain types for NEXUS.
 *
 * These are plain, serializable TypeScript types mirroring the Prisma
 * schema (prisma/schema.prisma). They are consumed by both the backend
 * (Node/Electron main process) and the renderer (React UI) so the two
 * sides agree on shapes without the renderer ever importing
 * `@prisma/client` or Node-only code directly.
 *
 * SQLite has no native enum type, so the Prisma schema models these as
 * `String` columns. The string-literal unions below are the source of
 * truth for the allowed values on each field.
 */

export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type TaskStepStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";

/**
 * The AI's classification of what a user instruction is asking for.
 * Set on the ASSISTANT message that replies to it.
 */
export type MessageIntent = "CONVERSATION" | "TASK" | "CLARIFICATION" | "SENSITIVE";

export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type AgentSessionStatus = "ACTIVE" | "IDLE" | "HALTED" | "ENDED";

export type AgentActionStatus =
  | "PENDING"
  | "AWAITING_APPROVAL"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REJECTED";

export type AgentConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export type SystemEventType = "INFO" | "WARNING" | "ERROR" | "SECURITY";

export type SystemEventSource =
  | "APP"
  | "DATABASE"
  | "IPC"
  | "TASK"
  | "AGENT";

export type MemoryRecordType = "FACT" | "PREFERENCE" | "CONTEXT" | "SKILL";

export interface UserSettings {
  id: string;
  theme: "dark" | "light" | "system";
  launchOnStartup: boolean;
  telemetryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Set on an ASSISTANT message once the AI has classified the turn. */
  intent: MessageIntent | null;
  /** Set when this message is the one that proposed `taskId`. */
  taskId: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  /** The user's original natural-language instruction. */
  instruction: string | null;
  /** AI-determined objective — what success looks like. */
  objective: string | null;
  /** Risks the AI identified while planning. */
  risks: string[];
  /** Applications/resources the AI identified as required. */
  requiredResources: string[];
  /** How NEXUS would know the task is complete. */
  completionCriteria: string | null;
  /** True when the AI (or a server-side safety override) flagged this as sensitive. */
  sensitive: boolean;
  status: TaskStatus;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  pendingApprovalCount: number;
}

export interface TaskStep {
  id: string;
  taskId: string;
  order: number;
  description: string;
  requiresApproval: boolean;
  status: TaskStepStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Task {
  steps: TaskStep[];
  approvalRequests: ApprovalRequest[];
}

export interface ExecutionLog {
  id: string;
  taskId: string | null;
  taskStepId: string | null;
  level: LogLevel;
  message: string;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  taskId: string | null;
  taskStepId: string | null;
  agentActionId: string | null;
  title: string;
  description: string;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt: string | null;
}

export interface MemoryRecord {
  id: string;
  type: MemoryRecordType;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSession {
  id: string;
  status: AgentSessionStatus;
  startedAt: string;
  endedAt: string | null;
  haltedAt: string | null;
  lastHeartbeatAt: string | null;
}

export interface AgentAction {
  id: string;
  sessionId: string;
  type: string;
  parameters: Record<string, unknown>;
  permissionLevel: "LOW" | "ELEVATED" | "SENSITIVE";
  requiresApproval: boolean;
  status: AgentActionStatus;
  approvalRequestId: string | null;
  result: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  screenshotPath: string | null;
  submittedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Live connection/session info reported by `agent:getStatus`. */
export interface AgentStatusSnapshot {
  connectionState: AgentConnectionState;
  sessionId: string | null;
  sessionStatus: AgentSessionStatus | null;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  haltedUntilRestart: boolean;
  activeActionCount: number;
  platform: string | null;
}

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  source: SystemEventSource;
  message: string;
  createdAt: string;
}

export interface SystemStatus {
  platform: string;
  arch: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  uptimeSeconds: number;
  dbConnected: boolean;
}

/**
 * Why a `messages.send` call did not produce an AI reply. Never includes
 * credentials or raw provider errors — see backend/ai/errors.ts for the
 * full-detail version kept server-side.
 */
export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

export interface AiErrorInfo {
  code: AiErrorCode;
  message: string;
}

/** Whether an AI provider is configured, without ever exposing the key itself. */
export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string;
}

export interface SendMessageResult {
  userMessage: Message;
  /** Null when the AI call failed — see `error`. The user's message is still saved. */
  assistantMessage: Message | null;
  /** Non-null when the assistant message proposed a new task. */
  task: Task | null;
  error: AiErrorInfo | null;
}
