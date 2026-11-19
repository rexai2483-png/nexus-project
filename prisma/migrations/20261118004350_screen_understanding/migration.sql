-- CreateTable
CREATE TABLE "ScreenCapture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "captureType" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeWindowTitle" TEXT,
    "activeWindowRegion" JSONB,
    "agentActionId" TEXT,
    "analysisStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "visionDescription" TEXT,
    "visionElements" JSONB,
    "visionProvider" TEXT,
    "visionModel" TEXT,
    "analysisError" TEXT,
    "analyzedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScreenCapture_agentActionId_fkey" FOREIGN KEY ("agentActionId") REFERENCES "AgentAction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScreenCapture_capturedAt_idx" ON "ScreenCapture"("capturedAt");

-- CreateIndex
CREATE INDEX "ScreenCapture_agentActionId_idx" ON "ScreenCapture"("agentActionId");
