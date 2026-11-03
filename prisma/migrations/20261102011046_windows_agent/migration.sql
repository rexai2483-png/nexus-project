-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN "haltedAt" DATETIME;
ALTER TABLE "AgentSession" ADD COLUMN "lastHeartbeatAt" DATETIME;

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "permissionLevel" TEXT NOT NULL DEFAULT 'LOW',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "screenshotPath" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "AgentAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "taskStepId" TEXT,
    "agentActionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ApprovalRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_taskStepId_fkey" FOREIGN KEY ("taskStepId") REFERENCES "TaskStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ApprovalRequest" ("description", "id", "requestedAt", "resolvedAt", "status", "taskId", "taskStepId", "title") SELECT "description", "id", "requestedAt", "resolvedAt", "status", "taskId", "taskStepId", "title" FROM "ApprovalRequest";
DROP TABLE "ApprovalRequest";
ALTER TABLE "new_ApprovalRequest" RENAME TO "ApprovalRequest";
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");
CREATE INDEX "ApprovalRequest_agentActionId_idx" ON "ApprovalRequest"("agentActionId");
CREATE TABLE "new_ExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "taskStepId" TEXT,
    "agentActionId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionLog_taskStepId_fkey" FOREIGN KEY ("taskStepId") REFERENCES "TaskStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionLog_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExecutionLog" ("createdAt", "id", "level", "message", "taskId", "taskStepId") SELECT "createdAt", "id", "level", "message", "taskId", "taskStepId" FROM "ExecutionLog";
DROP TABLE "ExecutionLog";
ALTER TABLE "new_ExecutionLog" RENAME TO "ExecutionLog";
CREATE INDEX "ExecutionLog_taskId_createdAt_idx" ON "ExecutionLog"("taskId", "createdAt");
CREATE INDEX "ExecutionLog_taskStepId_createdAt_idx" ON "ExecutionLog"("taskStepId", "createdAt");
CREATE INDEX "ExecutionLog_agentActionId_createdAt_idx" ON "ExecutionLog"("agentActionId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AgentAction_sessionId_idx" ON "AgentAction"("sessionId");

-- CreateIndex
CREATE INDEX "AgentAction_status_idx" ON "AgentAction"("status");

-- CreateIndex
CREATE INDEX "AgentAction_submittedAt_idx" ON "AgentAction"("submittedAt");
