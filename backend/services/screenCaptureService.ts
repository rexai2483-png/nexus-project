import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client";
import type {
  BoundingBox,
  DetectedUiElement,
  ScreenAnalysisStatus,
  ScreenCapture,
  ScreenCaptureType,
} from "../../shared/types/screenVision";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface ScreenCaptureRow {
  id: string;
  captureType: string;
  imagePath: string;
  capturedAt: Date;
  activeWindowTitle: string | null;
  activeWindowRegion: unknown;
  agentActionId: string | null;
  analysisStatus: string;
  visionDescription: string | null;
  visionElements: unknown;
  visionProvider: string | null;
  visionModel: string | null;
  analysisError: string | null;
  analyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(row: ScreenCaptureRow): ScreenCapture {
  return {
    id: row.id,
    captureType: row.captureType as ScreenCaptureType,
    capturedAt: row.capturedAt.toISOString(),
    activeWindowTitle: row.activeWindowTitle,
    activeWindowRegion: (row.activeWindowRegion as BoundingBox | null) ?? null,
    agentActionId: row.agentActionId,
    analysisStatus: row.analysisStatus as ScreenAnalysisStatus,
    visionDescription: row.visionDescription,
    visionElements: (row.visionElements as DetectedUiElement[] | null) ?? [],
    visionProvider: row.visionProvider,
    visionModel: row.visionModel,
    analysisError: row.analysisError,
    analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Persists a new, already-captured screenshot. The ONE accessibility
 * element representing the active window (when window metadata was
 * available at capture time) is recorded immediately — it came from a
 * real OS call, not an estimate, so it doesn't need to wait on (or
 * depend on) a cloud vision call at all. Called only from
 * backend/agent/agentManager.ts right after a `screen.captureScreenshot`
 * / `screen.captureActiveWindow` action succeeds — there is no other
 * way a ScreenCapture row gets created, matching "never capture
 * screenshots silently": every row traces back to one explicit,
 * approved AgentAction.
 */
export async function recordCapture(input: {
  agentActionId: string | null;
  captureType: ScreenCaptureType;
  imagePath: string;
  capturedAt: string;
  activeWindowTitle: string | null;
  activeWindowRegion: BoundingBox | null;
}): Promise<ScreenCapture> {
  const accessibilityElements: DetectedUiElement[] =
    input.activeWindowTitle && input.activeWindowRegion
      ? [
          {
            id: "accessibility-window",
            source: "ACCESSIBILITY",
            type: "window",
            label: input.activeWindowTitle,
            boundingBox: input.activeWindowRegion,
            confidence: 1,
            interactive: true,
          },
        ]
      : [];

  const row = await prisma.screenCapture.create({
    data: {
      captureType: input.captureType,
      imagePath: input.imagePath,
      capturedAt: new Date(input.capturedAt),
      activeWindowTitle: input.activeWindowTitle,
      activeWindowRegion: (input.activeWindowRegion as object | null) ?? undefined,
      agentActionId: input.agentActionId,
      visionElements: accessibilityElements as unknown as object,
    },
  });
  return toDto(row);
}

export async function listCaptures(limit = DEFAULT_LIMIT): Promise<ScreenCapture[]> {
  const rows = await prisma.screenCapture.findMany({
    orderBy: { capturedAt: "desc" },
    take: Math.min(limit, MAX_LIMIT),
  });
  return rows.map(toDto);
}

export async function getCapture(id: string): Promise<ScreenCapture | null> {
  const row = await prisma.screenCapture.findUnique({ where: { id } });
  return row ? toDto(row) : null;
}

/**
 * Looks a capture up by the exact `AgentAction` that produced it — used by
 * backend/services/visionInteractionService.ts's verification step to find
 * the screenshot it just asked the agent to take, without racing a
 * `listCaptures(1)` call against any other capture that might be recorded
 * around the same time.
 */
export async function getCaptureByActionId(agentActionId: string): Promise<ScreenCapture | null> {
  const row = await prisma.screenCapture.findFirst({
    where: { agentActionId },
    orderBy: { capturedAt: "desc" },
  });
  return row ? toDto(row) : null;
}

/** Internal — only backend/services/screenVisionService.ts needs the raw file path, and never passes it to the renderer. */
export async function getImagePath(id: string): Promise<string | null> {
  const row = await prisma.screenCapture.findUnique({ where: { id }, select: { imagePath: true } });
  return row?.imagePath ?? null;
}

export async function markAnalyzing(id: string): Promise<void> {
  await prisma.screenCapture.update({ where: { id }, data: { analysisStatus: "PENDING", analysisError: null } });
}

/**
 * Merges newly analyzed AI_VISUAL elements in alongside whatever
 * ACCESSIBILITY elements this capture already had — analysis never
 * discards the accessibility-sourced window element, it only adds to it.
 */
export async function saveAnalysisResult(
  id: string,
  input: { description: string; elements: DetectedUiElement[]; provider: string; model: string },
): Promise<ScreenCapture> {
  const existing = await getCapture(id);
  const accessibilityElements = (existing?.visionElements ?? []).filter((element) => element.source === "ACCESSIBILITY");

  const row = await prisma.screenCapture.update({
    where: { id },
    data: {
      analysisStatus: "ANALYZED",
      visionDescription: input.description,
      visionElements: [...accessibilityElements, ...input.elements] as object,
      visionProvider: input.provider,
      visionModel: input.model,
      analysisError: null,
      analyzedAt: new Date(),
    },
  });
  return toDto(row);
}

export async function saveAnalysisFailure(id: string, message: string): Promise<ScreenCapture> {
  const row = await prisma.screenCapture.update({
    where: { id },
    data: { analysisStatus: "FAILED", analysisError: message },
  });
  return toDto(row);
}

const DATA_URL_MEDIA_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * The ONLY path by which image bytes reach the renderer. The renderer
 * never learns `imagePath` itself — it only ever passes a `captureId`
 * it already knows about (from `screen:listCaptures` / `screen:getCapture`),
 * so this can't be used as an arbitrary-file-read oracle: it only ever
 * reads a path NEXUS itself already recorded as a real screenshot.
 */
export async function getImageDataUrl(id: string): Promise<string | null> {
  const row = await prisma.screenCapture.findUnique({ where: { id }, select: { imagePath: true } });
  if (!row) return null;
  const mediaType = DATA_URL_MEDIA_TYPE[path.extname(row.imagePath).toLowerCase()] ?? "application/octet-stream";
  const bytes = await fs.readFile(row.imagePath);
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}
