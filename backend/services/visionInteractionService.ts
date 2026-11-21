import { randomUUID } from "node:crypto";
import * as agentManager from "../agent/agentManager";
import * as activityService from "./activityService";
import * as screenCaptureService from "./screenCaptureService";
import * as screenVisionService from "./screenVisionService";
import { AGENT_ACTION_CATALOG, type AgentActionType } from "../../shared/types/agentActions";
import { compareScreenCaptures } from "../../shared/types/screenVision";
import {
  actionKindExpectsVisibleChange,
  buildVisionActionPlan,
  resolveTargetCoordinates,
  SAFE_TO_AUTO_RETRY_ACTION_TYPES,
  validateVisionTarget,
  type VisionActionRequest,
  type VisionInteractionResult,
  type VisionInteractionStatus,
  type VisionInteractionStep,
  type VisionPlanStep,
  type VisionTarget,
} from "../../shared/types/visionActions";
import type { AgentAction } from "../../shared/types/models";
import type { ScreenCapture } from "../../shared/types/screenVision";

/**
 * Connects Sprint 4's screen understanding to Sprint 2's Windows Agent:
 * the Observe → Act → Verify loop described in the Sprint 5 brief.
 *
 * This module does NOT execute anything on its own. Every action it
 * takes is one call to `agentManager.submitAction()` — the exact same
 * validated, approval-gated entry point the Agent page's quick actions
 * use — so a vision-guided click is subject to the identical action
 * registry checks, permission levels, and approval rules as any other
 * agent action. This module only decides WHICH underlying action(s) to
 * submit (via the shared, pure `buildVisionActionPlan`) and WHETHER the
 * result looks like it actually did something (via a deterministic
 * before/after comparison) — it never bypasses, duplicates, or
 * second-guesses agentManager's own gating.
 *
 * "Preserve action history": every underlying step is a real,
 * durably-persisted `AgentAction` row exactly like before — nothing here
 * is lost on restart. The higher-level `VisionInteractionResult` grouping
 * (which step belongs to which user-facing interaction, and the
 * before/after/comparison around it) is kept in-memory only, the same
 * way agentManager's own session/approval bookkeeping is — see the
 * module doc-comment in backend/agent/agentManager.ts. A restart loses
 * the grouping/history view, never the underlying actions themselves.
 */

const MAX_HISTORY = 50;
const interactionHistory: VisionInteractionResult[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function pushHistory(interaction: VisionInteractionResult): void {
  interactionHistory.unshift(interaction);
  if (interactionHistory.length > MAX_HISTORY) interactionHistory.length = MAX_HISTORY;
}

/** Polled by the Screen workspace and the floating assistant's screen panel — "the same task orchestrator" the brief calls for. */
export function listInteractions(limit = 20): VisionInteractionResult[] {
  return interactionHistory.slice(0, Math.min(limit, MAX_HISTORY));
}

function settlementTimeoutMsFor(actionType: AgentActionType): number {
  const definition = AGENT_ACTION_CATALOG[actionType];
  return (definition?.timeoutMs ?? 10_000) + 5_000;
}

function finalize(interaction: VisionInteractionResult, status: VisionInteractionStatus, message: string): void {
  interaction.status = status;
  interaction.message = message;
  interaction.completedAt = nowIso();
}

function hasAiVisualElements(capture: ScreenCapture): boolean {
  return capture.visionElements.some((element) => element.source === "AI_VISUAL");
}

/**
 * One planned step (e.g. "click the target") submitted, awaited, and — for
 * the two positional-only action types that can never double a real-world
 * consequence — retried exactly once if it fails outright. Mutates
 * `interaction.steps` with the outcome as it goes, so a caller polling
 * `listInteractions()` mid-run sees the step list grow live.
 */
async function runPlanStep(
  interaction: VisionInteractionResult,
  planStep: VisionPlanStep,
  targetLabel: string | null,
): Promise<"SUCCEEDED" | "FAILED" | "AWAITING_APPROVAL"> {
  let agentAction: AgentAction;
  try {
    agentAction = await agentManager.submitAction(planStep.actionType, planStep.parameters, { targetLabel });
  } catch (err) {
    interaction.steps.push({
      agentActionId: "",
      actionType: planStep.actionType,
      label: planStep.label,
      status: "FAILED",
      errorMessage: err instanceof Error ? err.message : "Could not submit this action.",
    });
    return "FAILED";
  }

  const stepRecord: VisionInteractionStep = {
    agentActionId: agentAction.id,
    actionType: planStep.actionType,
    label: planStep.label,
    status: agentAction.status,
    errorMessage: agentAction.errorMessage,
  };
  interaction.steps.push(stepRecord);

  if (agentAction.status === "AWAITING_APPROVAL") {
    interaction.approvalRequestId = agentAction.approvalRequestId;
    return "AWAITING_APPROVAL";
  }

  let settled = await agentManager.waitForActionSettlement(agentAction.id, settlementTimeoutMsFor(planStep.actionType));

  if ((!settled || settled.status !== "SUCCEEDED") && SAFE_TO_AUTO_RETRY_ACTION_TYPES.has(planStep.actionType)) {
    await activityService.recordSystemEvent({
      type: "WARNING",
      source: "AGENT",
      message: `Vision interaction step "${planStep.label}" did not succeed on the first attempt — retrying once (a purely positional action, so retrying cannot double a real-world consequence).`,
    });
    try {
      const retryAction = await agentManager.submitAction(planStep.actionType, planStep.parameters, { targetLabel });
      stepRecord.agentActionId = retryAction.id;
      settled = await agentManager.waitForActionSettlement(retryAction.id, settlementTimeoutMsFor(planStep.actionType));
    } catch (err) {
      stepRecord.status = "FAILED";
      stepRecord.errorMessage = err instanceof Error ? err.message : "The retry could not be submitted.";
      return "FAILED";
    }
  }

  if (!settled) {
    stepRecord.status = "FAILED";
    stepRecord.errorMessage = "Timed out waiting for this step to finish.";
    return "FAILED";
  }

  stepRecord.status = settled.status;
  stepRecord.errorMessage = settled.errorMessage;
  return settled.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
}

/** Best-effort re-capture used purely for diagnosis after a failed step — "capture the latest screen, determine whether the interface changed unexpectedly." Never throws; a failure here never masks the original error. */
async function recordDiagnosticCapture(interaction: VisionInteractionResult, beforeCapture: ScreenCapture): Promise<void> {
  try {
    const captureType = beforeCapture.captureType === "ACTIVE_WINDOW" ? "screen.captureActiveWindow" : "screen.captureScreenshot";
    const action = await agentManager.submitAction(captureType, {});
    if (action.status === "AWAITING_APPROVAL") return; // never happens for these LOW actions, but guard anyway
    const settled = await agentManager.waitForActionSettlement(action.id, settlementTimeoutMsFor(captureType));
    if (settled?.status === "SUCCEEDED") {
      const capture = await screenCaptureService.getCaptureByActionId(action.id);
      if (capture) {
        interaction.afterCaptureId = capture.id;
        interaction.comparison = compareScreenCaptures(beforeCapture, capture);
      }
    }
  } catch {
    // best-effort only
  }
}

/**
 * Captures the resulting screen and classifies the outcome. Deliberately
 * conservative: an AI_VISUAL-element diff is only trusted when BOTH the
 * before and after captures were already analyzed (comparing an analyzed
 * capture against a freshly-unanalyzed one would make "nothing detected
 * yet" look exactly like "everything disappeared," which is false, not a
 * real observation) — so by default this never claims success based on
 * elements it can't actually compare, and never triggers a surprise AI
 * vision call on every single click. Passing `verifyWithVision: true`
 * (and having a provider configured) opts into analyzing the after-shot
 * first, for a richer, AI-grounded comparison when that's wanted.
 */
async function verifyOutcome(interaction: VisionInteractionResult, request: VisionActionRequest, beforeCapture: ScreenCapture): Promise<void> {
  const captureType = beforeCapture.captureType === "ACTIVE_WINDOW" ? "screen.captureActiveWindow" : "screen.captureScreenshot";

  let verifyAction: AgentAction;
  try {
    verifyAction = await agentManager.submitAction(captureType, {});
  } catch (err) {
    finalize(
      interaction,
      "UNCERTAIN",
      `The action was sent, but NEXUS could not capture the screen afterward to verify the result (${err instanceof Error ? err.message : "unknown error"}).`,
    );
    return;
  }
  interaction.steps.push({
    agentActionId: verifyAction.id,
    actionType: captureType,
    label: "Capture resulting screen",
    status: verifyAction.status,
    errorMessage: null,
  });

  const settled = await agentManager.waitForActionSettlement(verifyAction.id, settlementTimeoutMsFor(captureType));
  if (!settled || settled.status !== "SUCCEEDED") {
    finalize(interaction, "UNCERTAIN", "The action was sent, but NEXUS could not capture the screen afterward to verify the result.");
    return;
  }

  let afterCapture = await screenCaptureService.getCaptureByActionId(verifyAction.id);
  if (!afterCapture) {
    finalize(interaction, "UNCERTAIN", "The verification screenshot was captured, but its record could not be found.");
    return;
  }

  if (request.verifyWithVision) {
    const analyzed = await screenVisionService.analyzeCapture(afterCapture.id).catch(() => null);
    if (analyzed && analyzed.analysisStatus === "ANALYZED") afterCapture = analyzed;
  }

  interaction.afterCaptureId = afterCapture.id;
  const comparison = compareScreenCaptures(beforeCapture, afterCapture);
  interaction.comparison = comparison;

  const titleChanged =
    Boolean(beforeCapture.activeWindowTitle) &&
    Boolean(afterCapture.activeWindowTitle) &&
    beforeCapture.activeWindowTitle !== afterCapture.activeWindowTitle;

  const bothAnalyzed = hasAiVisualElements(beforeCapture) && hasAiVisualElements(afterCapture);
  const elementsChanged =
    bothAnalyzed && (comparison.addedElements.length > 0 || comparison.removedElements.length > 0 || comparison.changedElements.length > 0);

  if (titleChanged || elementsChanged) {
    finalize(interaction, "SUCCEEDED", `Verified: ${comparison.summary}`);
  } else if (bothAnalyzed) {
    finalize(
      interaction,
      "UNCERTAIN",
      "The action completed, but NEXUS could not detect any visible change on screen afterward — it may not have had an effect.",
    );
  } else {
    finalize(
      interaction,
      "UNCERTAIN",
      "The action completed and a new screenshot was captured, but it hasn't been analyzed yet, so NEXUS can't confirm whether anything changed beyond the active window title. Analyze the new capture in the Screen workspace, or retry with vision verification enabled.",
    );
  }
}

async function runInteraction(interaction: VisionInteractionResult, request: VisionActionRequest): Promise<void> {
  const latest = await screenCaptureService.listCaptures(1);
  const latestCaptureId = latest[0]?.id ?? null;

  // `request.target` is renderer-supplied and, while it's normally just an
  // echo of data the renderer itself received from `screen:getCapture`, a
  // compromised/buggy renderer could send ANY values for it. So resolve
  // the real capture + element by id FIRST, and validate freshness/safety
  // against NEXUS's own stored data (capturedAt, type, boundingBox) —
  // never against the client's claims about them. This is what actually
  // enforces "reject stale or invalid screen coordinates" and "the
  // whole-window region isn't an actionable target," rather than a check
  // a client could talk its way around by lying about those two fields.
  const beforeCapture = await screenCaptureService.getCapture(request.target.captureId);
  if (!beforeCapture) {
    finalize(interaction, "INVALID_TARGET", "The referenced screen capture no longer exists.");
    return;
  }
  interaction.beforeCaptureId = beforeCapture.id;

  const element = beforeCapture.visionElements.find((candidate) => candidate.id === request.target.elementId);
  if (!element) {
    finalize(interaction, "INVALID_TARGET", "The identified element could not be found in that capture anymore.");
    return;
  }

  const canonicalTarget: VisionTarget = {
    captureId: beforeCapture.id,
    elementId: element.id,
    type: element.type,
    label: element.label,
    boundingBox: element.boundingBox,
    source: element.source,
    confidence: element.confidence,
    capturedAt: beforeCapture.capturedAt,
  };
  // Every surface that displays "what NEXUS acted on" (action history,
  // the floating assistant's screen panel) should show this
  // backend-verified target, not whatever the request claimed.
  interaction.target = canonicalTarget;

  const freshness = validateVisionTarget(canonicalTarget, latestCaptureId, Date.now());
  if (!freshness.ok) {
    finalize(interaction, "INVALID_TARGET", freshness.reason);
    return;
  }

  const coordinates = resolveTargetCoordinates(element.boundingBox, beforeCapture);
  const plan = buildVisionActionPlan(request, coordinates);
  if (plan.length === 0) {
    finalize(interaction, "FAILED", `"${request.actionKind}" is not a supported vision action.`);
    return;
  }

  for (const planStep of plan) {
    const outcome = await runPlanStep(interaction, planStep, element.label);
    if (outcome === "AWAITING_APPROVAL") {
      interaction.status = "AWAITING_APPROVAL";
      interaction.message = `"${planStep.label}" requires your approval before it will run. Approve or deny it on the Agent page — this interaction won't auto-verify until you re-run it.`;
      interaction.completedAt = nowIso();
      return;
    }
    if (outcome !== "SUCCEEDED") {
      await recordDiagnosticCapture(interaction, beforeCapture);
      finalize(
        interaction,
        "FAILED",
        `"${planStep.label}" failed${interaction.steps[interaction.steps.length - 1]?.errorMessage ? `: ${interaction.steps[interaction.steps.length - 1].errorMessage}` : "."}`,
      );
      return;
    }
  }

  if (!actionKindExpectsVisibleChange(request.actionKind)) {
    finalize(interaction, "SUCCEEDED", "The pointer was moved to the target. Moving the pointer has no expected visual change to verify.");
    return;
  }

  await verifyOutcome(interaction, request, beforeCapture);
}

/**
 * The single entry point: runs one full observe→act→verify cycle for one
 * user-identified target and returns the final (or, if a step needed
 * approval, the paused) result. Never throws — every failure mode
 * resolves to a structured `VisionInteractionResult` instead, the same
 * "never throws" convention as screenVisionService.analyzeCapture().
 */
export async function executeVisionAction(request: VisionActionRequest): Promise<VisionInteractionResult> {
  const interaction: VisionInteractionResult = {
    id: randomUUID(),
    status: "RUNNING",
    actionKind: request.actionKind,
    target: request.target,
    steps: [],
    beforeCaptureId: null,
    afterCaptureId: null,
    comparison: null,
    approvalRequestId: null,
    message: "Validating target…",
    startedAt: nowIso(),
    completedAt: null,
  };
  pushHistory(interaction);

  try {
    await runInteraction(interaction, request);
  } catch (err) {
    finalize(interaction, "FAILED", err instanceof Error ? err.message : "The interaction failed unexpectedly.");
  }

  return interaction;
}
