/**
 * Shared types for NEXUS's screen observation/understanding layer
 * (Sprint 4). Mirrors the split used by shared/types/agentActions.ts:
 * domain types plus a pure helper function, safe for both the backend
 * and the renderer (including Preview Mode's mock bridge) to import.
 *
 * A `ScreenCapture` always stores a FILE REFERENCE (`imagePath`), never
 * image bytes — the renderer never learns that path directly either; it
 * only ever gets pixel data back as a data URL through a dedicated,
 * capture-id-scoped IPC channel (`screen:getImageDataUrl`). See
 * backend/services/screenCaptureService.ts and electron/ipc/handlers.ts.
 */

export type ScreenCaptureType = "FULL_SCREEN" | "ACTIVE_WINDOW";

export type ScreenAnalysisStatus = "NOT_REQUESTED" | "PENDING" | "ANALYZED" | "FAILED";

/**
 * "ACCESSIBILITY" elements come from real OS/window metadata NEXUS
 * actually read (today: the active window's title + region, via the
 * same nut-js call `app.getActiveWindow` already uses). "AI_VISUAL"
 * elements are a cloud vision model's best estimate from pixels alone —
 * lower-trust, approximate coordinates, never to be confused with the
 * former. Every detected element carries this flag so the UI (and
 * anything downstream) can tell them apart at a glance.
 */
export type UiElementSource = "ACCESSIBILITY" | "AI_VISUAL";

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DetectedUiElement {
  /** Stable only within one capture's element list — not across captures. */
  id: string;
  source: UiElementSource;
  /** Free text: e.g. "window" (accessibility) or "button" / "menu" / "textField" (AI-estimated). */
  type: string;
  label: string | null;
  boundingBox: BoundingBox;
  /** 0..1. Always 1 for accessibility elements (they're not estimated). */
  confidence: number;
  interactive: boolean;
}

export interface ScreenCapture {
  id: string;
  captureType: ScreenCaptureType;
  capturedAt: string;
  activeWindowTitle: string | null;
  activeWindowRegion: BoundingBox | null;
  agentActionId: string | null;
  analysisStatus: ScreenAnalysisStatus;
  visionDescription: string | null;
  visionElements: DetectedUiElement[];
  visionProvider: string | null;
  visionModel: string | null;
  analysisError: string | null;
  analyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenComparisonResult {
  beforeCaptureId: string;
  afterCaptureId: string;
  addedElements: DetectedUiElement[];
  removedElements: DetectedUiElement[];
  changedElements: Array<{ before: DetectedUiElement; after: DetectedUiElement }>;
  /** True when the two captures look like genuinely different application states, not just minor movement. */
  possibleTransition: boolean;
  transitionReason: string | null;
  summary: string;
}

const MOVEMENT_THRESHOLD_PX = 4;
/** Below this fraction of before-elements still present in after, treat it as a likely view/app transition. */
const LOW_OVERLAP_RATIO = 0.2;

function elementKey(element: DetectedUiElement): string {
  return `${element.source}:${element.type.trim().toLowerCase()}:${(element.label ?? "").trim().toLowerCase()}`;
}

function boundingBoxMoved(a: BoundingBox, b: BoundingBox): boolean {
  return (
    Math.abs(a.left - b.left) > MOVEMENT_THRESHOLD_PX ||
    Math.abs(a.top - b.top) > MOVEMENT_THRESHOLD_PX ||
    Math.abs(a.width - b.width) > MOVEMENT_THRESHOLD_PX ||
    Math.abs(a.height - b.height) > MOVEMENT_THRESHOLD_PX
  );
}

/**
 * Deterministically diffs two already-analyzed captures' structured
 * element lists — no additional AI call. Elements are matched by
 * (source, type, label); anything not matched is reported as added or
 * removed, never as "changed" by guesswork, so every reported
 * difference is traceable to the two capture's own extracted data
 * ("do not claim changes that cannot be supported by the captured
 * images"). Pure and side-effect-free so both the real backend
 * (backend/services/screenVisionService.ts) and Preview Mode's mock
 * bridge (src/preview/mockBridge.ts) share this one implementation.
 */
export function compareScreenCaptures(before: ScreenCapture, after: ScreenCapture): ScreenComparisonResult {
  const beforeByKey = new Map(before.visionElements.map((element) => [elementKey(element), element]));
  const afterByKey = new Map(after.visionElements.map((element) => [elementKey(element), element]));

  const addedElements: DetectedUiElement[] = [];
  const changedElements: Array<{ before: DetectedUiElement; after: DetectedUiElement }> = [];

  for (const [key, afterElement] of afterByKey) {
    const beforeElement = beforeByKey.get(key);
    if (!beforeElement) {
      addedElements.push(afterElement);
      continue;
    }
    if (boundingBoxMoved(beforeElement.boundingBox, afterElement.boundingBox) || beforeElement.interactive !== afterElement.interactive) {
      changedElements.push({ before: beforeElement, after: afterElement });
    }
  }

  const removedElements: DetectedUiElement[] = [];
  for (const [key, beforeElement] of beforeByKey) {
    if (!afterByKey.has(key)) removedElements.push(beforeElement);
  }

  const titleChanged =
    Boolean(before.activeWindowTitle) && Boolean(after.activeWindowTitle) && before.activeWindowTitle !== after.activeWindowTitle;
  const overlapCount = [...afterByKey.keys()].filter((key) => beforeByKey.has(key)).length;
  const lowOverlap = beforeByKey.size > 0 && overlapCount / beforeByKey.size < LOW_OVERLAP_RATIO;

  const possibleTransition = titleChanged || lowOverlap;
  const transitionReason = titleChanged
    ? `The active window changed from "${before.activeWindowTitle}" to "${after.activeWindowTitle}".`
    : lowOverlap
      ? "Most previously visible elements are no longer present — this looks like a different screen or application state."
      : null;

  const parts: string[] = [];
  if (addedElements.length > 0) parts.push(`${addedElements.length} new element(s)`);
  if (removedElements.length > 0) parts.push(`${removedElements.length} removed`);
  if (changedElements.length > 0) parts.push(`${changedElements.length} changed`);
  const summary =
    parts.length > 0
      ? `${parts.join(", ")}.${transitionReason ? ` ${transitionReason}` : ""}`
      : transitionReason ?? "No detected differences between these two captures.";

  return {
    beforeCaptureId: before.id,
    afterCaptureId: after.id,
    addedElements,
    removedElements,
    changedElements,
    possibleTransition,
    transitionReason,
    summary,
  };
}
