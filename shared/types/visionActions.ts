/**
 * Shared types for vision-guided computer interaction (Sprint 5).
 *
 * This is the layer that connects screen understanding
 * (shared/types/screenVision.ts) to the Windows Agent's existing action
 * registry (shared/types/agentActions.ts). It does NOT introduce a new
 * execution mechanism — every "vision action" below ultimately compiles
 * down to one or more already-existing `AgentActionType` invocations
 * (input.moveMouse / input.click / input.typeText / input.sendShortcut /
 * input.scroll), submitted through the exact same
 * `backend/agent/agentManager.ts#submitAction` path, validated against
 * the same catalog, and subject to the same approval gating as any other
 * agent action.
 *
 * Mirrors the split used elsewhere in shared/types/: domain types plus
 * pure, deterministic helper functions (no I/O, no AI call), safe for
 * both the backend (backend/services/visionInteractionService.ts) and
 * the renderer (including Browser Preview Mode's mock bridge) to import
 * and get IDENTICAL behavior from.
 */

import type { AgentActionType } from "./agentActions";
import type { AgentActionStatus } from "./models";
import type { BoundingBox, ScreenCapture, ScreenComparisonResult, UiElementSource } from "./screenVision";

/** What the user wants NEXUS to do to one specific, previously-identified UI element. */
export type VisionActionKind = "moveMouse" | "click" | "selectMenuItem" | "typeText" | "scroll" | "pressKey";

/**
 * A reference to one specific detected element from one specific capture —
 * never a bare (x, y). Carrying the capture id + its own timestamp is what
 * lets `validateVisionTarget` reject a target once the screen has moved on,
 * instead of blindly reusing coordinates from an outdated screenshot.
 */
export interface VisionTarget {
  captureId: string;
  elementId: string;
  type: string;
  label: string | null;
  boundingBox: BoundingBox;
  source: UiElementSource;
  confidence: number;
  /** The capture's own `capturedAt`, duplicated here so freshness can be checked without a second lookup. */
  capturedAt: string;
}

export interface VisionActionRequest {
  actionKind: VisionActionKind;
  target: VisionTarget;
  /** Required for "typeText". */
  text?: string;
  /** Required for "pressKey" — reuses the existing approved-shortcut catalog, e.g. "enter" | "tab" | "escape". */
  key?: string;
  /** Used for "scroll" (default "down"). */
  direction?: "up" | "down" | "left" | "right";
  /** Used for "scroll" (default 3 "steps"). */
  amount?: number;
  /** Used for "click" (default "left"). */
  button?: "left" | "right";
  /** Used for "typeText" — click the target to focus it first (default true). Set false if it's already focused. */
  focusFirst?: boolean;
  /**
   * Opt-in: also run a cloud AI vision analysis on the "after" screenshot
   * before verifying (default false). Without this, verification only
   * trusts signals NEXUS already has for free — active-window title, and
   * element differences when BOTH the before and after captures already
   * happened to be analyzed — so it never sends an extra screenshot to an
   * AI provider just because an action ran. Needs an AI provider
   * configured; if analysis fails or isn't configured, verification still
   * falls back to the deterministic-only signals instead of erroring.
   */
  verifyWithVision?: boolean;
}

export type VisionInteractionStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "UNCERTAIN"
  | "FAILED"
  | "AWAITING_APPROVAL"
  | "REJECTED"
  | "INVALID_TARGET";

export interface VisionInteractionStep {
  agentActionId: string;
  actionType: AgentActionType;
  label: string;
  status: AgentActionStatus;
  errorMessage: string | null;
}

/**
 * The full record of one observe-act-verify cycle: the target that was
 * acted on, every underlying agent action it took to do it, the
 * before/after screenshots, and the deterministic comparison between them
 * that NEXUS's verification verdict is actually based on — never a bare
 * "success" with nothing behind it.
 */
export interface VisionInteractionResult {
  id: string;
  status: VisionInteractionStatus;
  actionKind: VisionActionKind;
  target: VisionTarget;
  steps: VisionInteractionStep[];
  beforeCaptureId: string | null;
  afterCaptureId: string | null;
  comparison: ScreenComparisonResult | null;
  /** Set only while status is AWAITING_APPROVAL. */
  approvalRequestId: string | null;
  message: string;
  startedAt: string;
  completedAt: string | null;
}

/**
 * A target older than this is rejected outright, even if it's still
 * technically the latest capture — generous enough that a human
 * reviewing a screenshot before deciding what to click on isn't rushed,
 * but short enough that NEXUS never acts on a screen state that's
 * realistically likely to have moved on.
 */
export const MAX_TARGET_AGE_MS = 10 * 60 * 1000;

/**
 * "Reject stale or invalid screen coordinates." A target is only valid to
 * act on when its capture is the MOST RECENT one NEXUS has (nothing newer
 * has been observed since), it isn't too old in absolute terms, and it
 * isn't the whole-window accessibility element (which has no clickable
 * meaning of its own — act on a specific element inside it instead).
 */
export function validateVisionTarget(
  target: VisionTarget,
  latestCaptureId: string | null,
  nowMs: number,
): { ok: true } | { ok: false; reason: string } {
  if (!latestCaptureId) {
    return { ok: false, reason: "No screen capture is available yet — capture the screen before acting on it." };
  }
  if (target.captureId !== latestCaptureId) {
    return {
      ok: false,
      reason: "A newer screen capture is available. Re-identify the target from the latest capture before acting — coordinates from an older screenshot are never reused.",
    };
  }
  const capturedAtMs = new Date(target.capturedAt).getTime();
  if (!Number.isFinite(capturedAtMs)) {
    return { ok: false, reason: "This target's capture timestamp is invalid." };
  }
  const ageMs = nowMs - capturedAtMs;
  if (ageMs > MAX_TARGET_AGE_MS) {
    return { ok: false, reason: "This screen capture is too old to act on safely — capture the screen again." };
  }
  if (target.type.trim().toLowerCase() === "window") {
    return { ok: false, reason: "The whole-window region isn't an actionable target — pick a specific detected element inside it." };
  }
  return { ok: true };
}

/**
 * Resolves a target's bounding box into one absolute screen coordinate
 * (its center point). An ACTIVE_WINDOW capture's image only covers the
 * focused window's region, so an element's bounding box inside it is
 * relative to that region, not the full desktop — it needs the window's
 * own on-screen offset added back in. A FULL_SCREEN capture's image IS
 * the full desktop, so its bounding boxes are already absolute.
 */
export function resolveTargetCoordinates(
  boundingBox: BoundingBox,
  capture: Pick<ScreenCapture, "captureType" | "activeWindowRegion">,
): { x: number; y: number } {
  const centerX = boundingBox.left + boundingBox.width / 2;
  const centerY = boundingBox.top + boundingBox.height / 2;
  if (capture.captureType === "ACTIVE_WINDOW" && capture.activeWindowRegion) {
    return {
      x: Math.round(capture.activeWindowRegion.left + centerX),
      y: Math.round(capture.activeWindowRegion.top + centerY),
    };
  }
  return { x: Math.round(centerX), y: Math.round(centerY) };
}

export interface VisionPlanStep {
  actionType: AgentActionType;
  parameters: Record<string, unknown>;
  label: string;
}

/**
 * Translates one high-level vision action into the ordered list of
 * already-existing, already-validated `AgentActionType` invocations it
 * takes to actually do it. This is the ONLY place that mapping lives —
 * both backend/services/visionInteractionService.ts and the Preview Mode
 * mock bridge call this one function, so "what clicking a button actually
 * does" can never silently drift between the real and simulated paths.
 *
 * "typeText" clicks the target first by default (to focus it) — pass
 * `focusFirst: false` if the caller already knows it's focused.
 */
export function buildVisionActionPlan(
  request: VisionActionRequest,
  coordinates: { x: number; y: number },
): VisionPlanStep[] {
  switch (request.actionKind) {
    case "moveMouse":
      return [{ actionType: "input.moveMouse", parameters: { x: coordinates.x, y: coordinates.y }, label: "Move pointer to target" }];
    case "click":
      return [
        {
          actionType: "input.click",
          parameters: { x: coordinates.x, y: coordinates.y, button: request.button ?? "left" },
          label: "Click target",
        },
      ];
    case "selectMenuItem":
      return [
        {
          actionType: "input.click",
          parameters: { x: coordinates.x, y: coordinates.y, button: "left" },
          label: "Select menu item",
        },
      ];
    case "scroll":
      return [
        {
          actionType: "input.scroll",
          parameters: { x: coordinates.x, y: coordinates.y, direction: request.direction ?? "down", amount: request.amount ?? 3 },
          label: `Scroll ${request.direction ?? "down"}`,
        },
      ];
    case "pressKey": {
      const key = request.key ?? "enter";
      return [{ actionType: "input.sendShortcut", parameters: { shortcut: key }, label: `Press "${key}"` }];
    }
    case "typeText": {
      const plan: VisionPlanStep[] = [];
      if (request.focusFirst !== false) {
        plan.push({
          actionType: "input.click",
          parameters: { x: coordinates.x, y: coordinates.y, button: "left" },
          label: "Focus target field",
        });
      }
      plan.push({ actionType: "input.typeText", parameters: { text: request.text ?? "" }, label: "Type text" });
      return plan;
    }
    default:
      return [];
  }
}

/** Action kinds that are expected to visibly change the screen — worth re-capturing and comparing to verify. "moveMouse" deliberately isn't: a pointer moving is the entire expected outcome, nothing else should be claimed about it. */
export function actionKindExpectsVisibleChange(actionKind: VisionActionKind): boolean {
  return actionKind !== "moveMouse";
}

/** Underlying action types safe to retry automatically exactly once on failure — purely positional/non-destructive, so retrying can never double a real-world consequence (unlike a click, a type, or a shortcut). */
export const SAFE_TO_AUTO_RETRY_ACTION_TYPES: ReadonlySet<AgentActionType> = new Set(["input.moveMouse", "input.scroll"]);
