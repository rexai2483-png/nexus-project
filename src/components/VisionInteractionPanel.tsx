import { useCallback, useEffect, useState } from "react";
import type { DetectedUiElement, ScreenCapture } from "@shared/types/screenVision";
import type { VisionActionKind, VisionInteractionResult, VisionTarget } from "@shared/types/visionActions";

interface VisionInteractionPanelProps {
  capture: ScreenCapture;
  element: DetectedUiElement;
  /** Whether `capture` is the most recent capture NEXUS has — acting on anything older is rejected server-side too, but disabling it here gives a clearer reason than a thrown error. */
  isLatestCapture: boolean;
  onInteractionSettled: () => void;
}

const ACTION_KIND_LABEL: Record<VisionActionKind, string> = {
  moveMouse: "Move pointer here",
  click: "Click",
  selectMenuItem: "Select menu item",
  typeText: "Type text into this field",
  scroll: "Scroll",
  pressKey: "Press a key",
};

const STATUS_TONE: Record<VisionInteractionResult["status"], string> = {
  RUNNING: "bg-nexus-text-faint/15 text-nexus-text-faint",
  SUCCEEDED: "bg-nexus-success/15 text-nexus-success",
  UNCERTAIN: "bg-nexus-warning/15 text-nexus-warning",
  FAILED: "bg-nexus-danger/15 text-nexus-danger",
  AWAITING_APPROVAL: "bg-nexus-warning/15 text-nexus-warning",
  REJECTED: "bg-nexus-danger/15 text-nexus-danger",
  INVALID_TARGET: "bg-nexus-danger/15 text-nexus-danger",
};

function defaultActionKindFor(type: string): VisionActionKind {
  const normalized = type.trim().toLowerCase();
  if (normalized === "textfield" || normalized === "field") return "typeText";
  if (normalized === "menu" || normalized === "menuitem") return "selectMenuItem";
  return "click";
}

function toTarget(capture: ScreenCapture, element: DetectedUiElement): VisionTarget {
  return {
    captureId: capture.id,
    elementId: element.id,
    type: element.type,
    label: element.label,
    boundingBox: element.boundingBox,
    source: element.source,
    confidence: element.confidence,
    capturedAt: capture.capturedAt,
  };
}

/**
 * The Observe→Act→Verify UI for one already-identified target: pick what
 * to do, submit it, and watch the same `VisionInteractionResult` the
 * backend orchestrator maintains fill in live (steps, approval, the
 * before/after comparison) by polling `vision.listInteractions()` — the
 * same channel the floating assistant's screen panel polls, so both stay
 * in sync with the one orchestrator.
 */
export function VisionInteractionPanel({ capture, element, isLatestCapture, onInteractionSettled }: VisionInteractionPanelProps) {
  const [actionKind, setActionKind] = useState<VisionActionKind>(defaultActionKindFor(element.type));
  const [text, setText] = useState("");
  const [key, setKey] = useState("enter");
  const [direction, setDirection] = useState<"up" | "down" | "left" | "right">("down");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<VisionInteractionResult | null>(null);
  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(null);
  const [afterImageUrl, setAfterImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setActionKind(defaultActionKindFor(element.type));
    setInteraction(null);
    setSubmitError(null);
  }, [element.id]);

  // While the current interaction is still in progress, poll for its
  // live-updating state — mirrors the Agent/Screen pages' existing
  // polling pattern rather than introducing a push channel.
  useEffect(() => {
    if (!interaction || interaction.completedAt) return;
    const timer = setInterval(() => {
      void window.nexus.vision.listInteractions({ limit: 5 }).then((list) => {
        const match = list.find((item) => item.id === interaction.id);
        if (match) setInteraction(match);
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [interaction]);

  useEffect(() => {
    if (interaction?.completedAt) onInteractionSettled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction?.completedAt]);

  useEffect(() => {
    setBeforeImageUrl(null);
    setAfterImageUrl(null);
    if (!interaction) return;
    if (interaction.beforeCaptureId) {
      void window.nexus.screen
        .getImageDataUrl({ captureId: interaction.beforeCaptureId })
        .then((r) => setBeforeImageUrl(r.dataUrl))
        .catch(() => undefined);
    }
    if (interaction.afterCaptureId) {
      void window.nexus.screen
        .getImageDataUrl({ captureId: interaction.afterCaptureId })
        .then((r) => setAfterImageUrl(r.dataUrl))
        .catch(() => undefined);
    }
  }, [interaction?.beforeCaptureId, interaction?.afterCaptureId]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await window.nexus.vision.executeAction({
        actionKind,
        target: toTarget(capture, element),
        text: actionKind === "typeText" ? text : undefined,
        key: actionKind === "pressKey" ? key : undefined,
        direction: actionKind === "scroll" ? direction : undefined,
      });
      setInteraction(result);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not start this interaction.");
    } finally {
      setSubmitting(false);
    }
  }, [actionKind, capture, element, text, key, direction]);

  return (
    <div className="mt-4 rounded-md border border-nexus-border bg-nexus-bg p-3">
      <p className="text-[11px] uppercase tracking-wide text-nexus-text-faint">
        Act on: {element.type}
        {element.label ? ` "${element.label}"` : ""}
      </p>

      {!isLatestCapture ? (
        <p className="mt-2 text-xs text-nexus-warning">
          A newer screen capture exists. Re-identify this target from the latest capture before acting — NEXUS never reuses coordinates from an outdated screenshot.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select
            value={actionKind}
            onChange={(e) => setActionKind(e.target.value as VisionActionKind)}
            className="rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text"
          >
            {(Object.keys(ACTION_KIND_LABEL) as VisionActionKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {ACTION_KIND_LABEL[kind]}
              </option>
            ))}
          </select>

          {actionKind === "typeText" ? (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Text to type"
              className="min-w-[140px] flex-1 rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text"
            />
          ) : null}

          {actionKind === "pressKey" ? (
            <select value={key} onChange={(e) => setKey(e.target.value)} className="rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text">
              {["enter", "tab", "escape", "backspace", "arrowUp", "arrowDown", "arrowLeft", "arrowRight", "space"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          ) : null}

          {actionKind === "scroll" ? (
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "up" | "down" | "left" | "right")}
              className="rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text"
            >
              {(["up", "down", "left", "right"] as const).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            disabled={submitting || (interaction !== null && !interaction.completedAt)}
            onClick={() => void submit()}
            className="rounded-md bg-nexus-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {submitting || (interaction !== null && !interaction.completedAt) ? "Running…" : "Execute"}
          </button>
        </div>
      )}

      {submitError ? <p className="mt-2 text-xs text-nexus-danger">{submitError}</p> : null}

      {interaction ? (
        <div className="mt-3 space-y-2 border-t border-nexus-border pt-3">
          <div className="flex items-center gap-2">
            <span className={["rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide", STATUS_TONE[interaction.status]].join(" ")}>
              {interaction.status}
            </span>
            <p className="text-xs text-nexus-text-muted">{interaction.message}</p>
          </div>

          {interaction.steps.length > 0 ? (
            <ul className="space-y-1 text-[11px] text-nexus-text-faint">
              {interaction.steps.map((step, index) => (
                <li key={`${step.agentActionId || "step"}-${index}`}>
                  {step.label} — <span className="text-nexus-text">{step.status}</span>
                  {step.errorMessage ? ` (${step.errorMessage})` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          {interaction.approvalRequestId ? (
            <p className="text-xs text-nexus-warning">Waiting on the pending approval — decide it from the Agent page.</p>
          ) : null}

          {beforeImageUrl || afterImageUrl ? (
            <div className="flex gap-3">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-nexus-text-faint">Before</p>
                {beforeImageUrl ? (
                  <img src={beforeImageUrl} alt="Before" className="h-20 w-32 rounded border border-nexus-border object-cover" />
                ) : (
                  <div className="h-20 w-32 rounded border border-nexus-border bg-nexus-surface" />
                )}
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-nexus-text-faint">After (verification)</p>
                {afterImageUrl ? (
                  <img src={afterImageUrl} alt="After" className="h-20 w-32 rounded border border-nexus-border object-cover" />
                ) : (
                  <div className="h-20 w-32 rounded border border-nexus-border bg-nexus-surface" />
                )}
              </div>
            </div>
          ) : null}

          {interaction.comparison ? (
            <div className="text-[11px] text-nexus-text-faint">
              <p>{interaction.comparison.summary}</p>
              {interaction.comparison.possibleTransition ? <p className="text-nexus-warning">Possible application/view transition.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
