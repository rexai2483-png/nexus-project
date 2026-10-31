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

export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type AgentSessionStatus = "ACTIVE" | "IDLE" | "ENDED";

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

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStep {
  id: string;
  taskId: string;
  order: number;
  description: string;
  status: TaskStepStatus;
  createdAt: string;
  updatedAt: string;
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
