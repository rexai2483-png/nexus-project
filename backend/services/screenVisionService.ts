import fs from "node:fs/promises";
import path from "node:path";
import { createAiProvider } from "../ai/providerFactory";
import { runVisionAnalysis } from "../ai/visionEngine";
import { toAiError, AiError } from "../ai/errors";
import * as screenCaptureService from "./screenCaptureService";
import { recordSystemEvent } from "./activityService";
import { compareScreenCaptures } from "../../shared/types/screenVision";
import type { AiProvider } from "../ai/types";
import type { ScreenCapture, ScreenComparisonResult } from "../../shared/types/screenVision";

const MEDIA_TYPE_BY_EXTENSION: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * Sends one already-captured screenshot to the configured cloud vision
 * provider and persists the result. This is the ONLY place a screenshot's
 * bytes leave the local machine, and it only ever runs when a user
 * explicitly calls `screen:analyze` (see electron/ipc/handlers.ts) — a
 * capture sitting in the database is never analyzed automatically.
 *
 * Deliberately resolves (never throws) for every failure mode the sprint
 * calls out — missing provider config, unsupported file type, a missing
 * file on disk, or any provider-side error/timeout — recording the
 * failure on the capture row instead, exactly like
 * conversationService.sendMessage does for chat failures. The one thing
 * this never does is log the image bytes or the extracted description —
 * every recordSystemEvent call below mentions only the capture id and
 * provider/model name.
 */
export async function analyzeCapture(
  captureId: string,
  /** Test-only seam, same pattern as conversationService.sendMessage. */
  deps?: { provider?: AiProvider },
): Promise<ScreenCapture> {
  const capture = await screenCaptureService.getCapture(captureId);
  if (!capture) {
    throw new Error(`Screen capture "${captureId}" was not found.`);
  }

  let provider: AiProvider;
  try {
    provider = deps?.provider ?? createAiProvider();
  } catch (err) {
    const aiError = toAiError(err);
    await recordSystemEvent({ type: "WARNING", source: "AGENT", message: `Screen analysis skipped: ${aiError.message}` });
    return screenCaptureService.saveAnalysisFailure(captureId, aiError.message);
  }

  const imagePath = await screenCaptureService.getImagePath(captureId);
  if (!imagePath) {
    return screenCaptureService.saveAnalysisFailure(captureId, "This capture has no stored image reference.");
  }

  const mediaType = MEDIA_TYPE_BY_EXTENSION[path.extname(imagePath).toLowerCase()];
  if (!mediaType) {
    const aiError = new AiError(
      "UNSUPPORTED_FORMAT",
      `Unsupported image format "${path.extname(imagePath) || "unknown"}" — expected PNG, JPEG, GIF, or WebP.`,
    );
    await recordSystemEvent({ type: "WARNING", source: "AGENT", message: `Screen analysis skipped: ${aiError.message}` });
    return screenCaptureService.saveAnalysisFailure(captureId, aiError.message);
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(imagePath);
  } catch {
    const message = "The screenshot file could not be read — it may have been moved or deleted.";
    await recordSystemEvent({ type: "ERROR", source: "AGENT", message: `Screen analysis failed for capture ${captureId}: ${message}` });
    return screenCaptureService.saveAnalysisFailure(captureId, message);
  }

  await screenCaptureService.markAnalyzing(captureId);
  // Mentions only the capture id and that an upload happened — never the
  // image bytes, the description, or any text the model later extracts.
  await recordSystemEvent({
    type: "INFO",
    source: "AGENT",
    message: `Sending screen capture ${captureId} to ${provider.name} for AI visual analysis.`,
  });

  try {
    const analysis = await runVisionAnalysis(
      provider,
      { base64: bytes.toString("base64"), mediaType },
      { activeWindowTitle: capture.activeWindowTitle },
    );
    const updated = await screenCaptureService.saveAnalysisResult(captureId, {
      description: analysis.description,
      elements: analysis.elements,
      provider: provider.name,
      model: provider.model,
    });
    await recordSystemEvent({ type: "INFO", source: "AGENT", message: `Screen capture ${captureId} analyzed successfully.` });
    return updated;
  } catch (err) {
    const aiError = toAiError(err);
    await recordSystemEvent({ type: "ERROR", source: "AGENT", message: `Screen analysis failed for capture ${captureId}: ${aiError.message}` });
    return screenCaptureService.saveAnalysisFailure(captureId, aiError.message);
  }
}

/**
 * Deterministic comparison of two existing captures — see
 * shared/types/screenVision.ts#compareScreenCaptures for the actual
 * diff. No AI call, no new row; this is a read-only, computed-on-request
 * view over data that's already there.
 */
export async function compareCaptures(beforeCaptureId: string, afterCaptureId: string): Promise<ScreenComparisonResult> {
  const [before, after] = await Promise.all([
    screenCaptureService.getCapture(beforeCaptureId),
    screenCaptureService.getCapture(afterCaptureId),
  ]);
  if (!before || !after) {
    throw new Error("Both captures must exist to compare them.");
  }
  return compareScreenCaptures(before, after);
}
