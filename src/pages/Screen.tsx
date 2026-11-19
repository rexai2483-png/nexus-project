import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { StatusDot } from "../components/StatusDot";
import { BoundingBoxOverlay } from "../components/BoundingBoxOverlay";
import type { ScreenCapture, ScreenComparisonResult } from "@shared/types/screenVision";

const POLL_INTERVAL_MS = 4000;

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

const SOURCE_BADGE_CLASS: Record<string, string> = {
  ACCESSIBILITY: "bg-nexus-success/15 text-nexus-success",
  AI_VISUAL: "bg-nexus-accent/15 text-nexus-accent",
};

const SOURCE_LABEL: Record<string, string> = {
  ACCESSIBILITY: "Accessibility",
  AI_VISUAL: "AI estimate",
};

const ANALYSIS_LABEL: Record<ScreenCapture["analysisStatus"], string> = {
  NOT_REQUESTED: "Not analyzed",
  PENDING: "Analyzing…",
  ANALYZED: "Analyzed",
  FAILED: "Analysis failed",
};

export function Screen() {
  const [captures, setCaptures] = useState<ScreenCapture[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<ScreenComparisonResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([
        window.nexus.screen.listCaptures({ limit: 50 }),
        window.nexus.agent.getStatus(),
      ]);
      setCaptures(list);
      setConnected(status.connectionState === "CONNECTED");
      setListError(null);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Unable to load screen captures.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const selected = captures.find((capture) => capture.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedElementId(null);
    if (!selected) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    setImageError(null);
    window.nexus.screen
      .getImageDataUrl({ captureId: selected.id })
      .then((result) => {
        if (!cancelled) setImageUrl(result.dataUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setImageError(err instanceof Error ? err.message : "Unable to load this screenshot.");
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the selected capture identity changes, not on every poll tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function capture(actionType: "screen.captureScreenshot" | "screen.captureActiveWindow", label: string) {
    setBusyAction(label);
    try {
      await window.nexus.agent.submitAction({ actionType, parameters: {} });
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : `"${label}" failed.`);
    } finally {
      setBusyAction(null);
    }
  }

  async function analyze() {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const updated = await window.nexus.screen.analyze({ captureId: selected.id });
      setCaptures((prev) => prev.map((capture) => (capture.id === updated.id ? updated : capture)));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runComparison() {
    if (!beforeId || !afterId) return;
    setComparing(true);
    setCompareError(null);
    try {
      const result = await window.nexus.screen.compare({ beforeCaptureId: beforeId, afterCaptureId: afterId });
      setComparison(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setComparing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Screen"
        description="What NEXUS has observed on screen — every capture is explicit and reviewable, nothing is captured silently or continuously."
      />

      <Card title="Capture" subtitle="Each button submits one explicit, approved Windows Agent action." className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusDot tone={connected ? "success" : "neutral"} label={connected ? "Agent connected" : "Agent not connected"} />
          <button
            type="button"
            disabled={!connected || busyAction !== null}
            onClick={() => void capture("screen.captureScreenshot", "fullScreen")}
            className="rounded-md border border-nexus-border px-3 py-1.5 text-xs text-nexus-text-muted transition-colors hover:text-nexus-text disabled:opacity-40"
          >
            {busyAction === "fullScreen" ? "Capturing…" : "Capture full screen"}
          </button>
          <button
            type="button"
            disabled={!connected || busyAction !== null}
            onClick={() => void capture("screen.captureActiveWindow", "activeWindow")}
            className="rounded-md border border-nexus-border px-3 py-1.5 text-xs text-nexus-text-muted transition-colors hover:text-nexus-text disabled:opacity-40"
          >
            {busyAction === "activeWindow" ? "Capturing…" : "Capture active window"}
          </button>
          {!connected ? (
            <span className="text-xs text-nexus-text-faint">Start the Windows Agent on the Agent page to capture.</span>
          ) : null}
        </div>
        {listError ? <p className="mt-2 text-xs text-nexus-danger">{listError}</p> : null}
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        </Card>
      ) : captures.length === 0 ? (
        <Card>
          <EmptyState
            title="No screen captures yet"
            description="Use a Capture button above (or the Agent page's Screen quick actions) to take an authorized screenshot."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="p-0">
            <ul className="divide-y divide-nexus-border">
              {captures.map((capture) => {
                const isSelected = capture.id === selectedId;
                return (
                  <li key={capture.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(capture.id)}
                      className={[
                        "block w-full px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-nexus-accent-muted" : "hover:bg-nexus-surface-raised",
                      ].join(" ")}
                    >
                      <p className="truncate text-sm text-nexus-text">
                        {capture.activeWindowTitle ?? (capture.captureType === "FULL_SCREEN" ? "Full desktop" : "Active window")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-nexus-text-faint">
                        <span>{formatTime(capture.capturedAt)}</span>
                        <span>{ANALYSIS_LABEL[capture.analysisStatus]}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="space-y-4">
            <Card>
              {!selected ? (
                <EmptyState title="Select a capture" description="Choose a screenshot from the list to inspect it." />
              ) : (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-medium text-nexus-text">
                        {selected.activeWindowTitle ?? (selected.captureType === "FULL_SCREEN" ? "Full desktop" : "Active window")}
                      </h3>
                      <p className="mt-1 text-xs text-nexus-text-faint">
                        Captured {formatTime(selected.capturedAt)} ·{" "}
                        {selected.captureType === "FULL_SCREEN" ? "Full screen" : "Active window only"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={analyzing}
                      onClick={() => void analyze()}
                      className="rounded-md bg-nexus-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {analyzing
                        ? "Analyzing…"
                        : selected.analysisStatus === "ANALYZED"
                          ? "Re-analyze with AI Vision"
                          : "Analyze with AI Vision"}
                    </button>
                  </div>

                  {selected.analysisStatus === "FAILED" && selected.analysisError ? (
                    <p className="mt-3 rounded-md border border-nexus-danger/40 bg-nexus-danger/10 px-3 py-2 text-xs text-nexus-danger">
                      {selected.analysisError}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    {imageError ? (
                      <p className="text-sm text-nexus-danger">{imageError}</p>
                    ) : imageUrl ? (
                      <BoundingBoxOverlay
                        imageUrl={imageUrl}
                        elements={selected.visionElements}
                        selectedElementId={selectedElementId}
                        onSelectElement={setSelectedElementId}
                      />
                    ) : (
                      <p className="text-sm text-nexus-text-faint">Loading screenshot…</p>
                    )}
                  </div>

                  {selected.visionDescription ? (
                    <div className="mt-4 rounded-md border border-nexus-border bg-nexus-bg p-3">
                      <p className="text-[11px] uppercase tracking-wide text-nexus-text-faint">AI visual description</p>
                      <p className="mt-1 text-sm text-nexus-text-muted">{selected.visionDescription}</p>
                      <p className="mt-2 text-[11px] text-nexus-text-faint">
                        {selected.visionProvider} · {selected.visionModel} ·{" "}
                        {selected.analyzedAt ? formatTime(selected.analyzedAt) : ""}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
                      Detected elements · {selected.visionElements.length}
                    </p>
                    {selected.visionElements.length === 0 ? (
                      <p className="text-xs text-nexus-text-faint">
                        No elements detected yet — analyze this capture to estimate on-screen elements.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {selected.visionElements.map((element) => (
                          <li key={element.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedElementId(element.id)}
                              className={[
                                "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                element.id === selectedElementId
                                  ? "border-nexus-accent bg-nexus-accent-muted"
                                  : "border-nexus-border hover:bg-nexus-surface-raised",
                              ].join(" ")}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span
                                  className={["shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide", SOURCE_BADGE_CLASS[element.source]].join(" ")}
                                >
                                  {SOURCE_LABEL[element.source]}
                                </span>
                                <span className="truncate text-nexus-text">
                                  {element.type}
                                  {element.label ? `: ${element.label}` : ""}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs text-nexus-text-faint">
                                {element.interactive ? "Interactive" : "Static"} · {Math.round(element.confidence * 100)}%
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </Card>

            <Card title="Compare two captures" subtitle="A deterministic diff of already-detected elements — no new AI call.">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-nexus-text-muted">
                  Before
                  <select
                    value={beforeId}
                    onChange={(e) => setBeforeId(e.target.value)}
                    className="mt-1 block rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text"
                  >
                    <option value="">Select…</option>
                    {captures.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatTime(c.capturedAt)} — {c.activeWindowTitle ?? c.captureType}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-nexus-text-muted">
                  After
                  <select
                    value={afterId}
                    onChange={(e) => setAfterId(e.target.value)}
                    className="mt-1 block rounded border border-nexus-border bg-nexus-bg px-2 py-1.5 text-xs text-nexus-text"
                  >
                    <option value="">Select…</option>
                    {captures.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatTime(c.capturedAt)} — {c.activeWindowTitle ?? c.captureType}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!beforeId || !afterId || comparing}
                  onClick={() => void runComparison()}
                  className="rounded-md bg-nexus-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  {comparing ? "Comparing…" : "Compare"}
                </button>
              </div>

              {compareError ? <p className="mt-3 text-xs text-nexus-danger">{compareError}</p> : null}

              {comparison ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-nexus-text">{comparison.summary}</p>
                  {comparison.possibleTransition ? (
                    <p className="text-xs text-nexus-warning">Possible application/view transition detected.</p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-nexus-text-faint">
                        New · {comparison.addedElements.length}
                      </p>
                      <ul className="space-y-1 text-xs text-nexus-text-muted">
                        {comparison.addedElements.map((el) => (
                          <li key={el.id}>
                            {el.type}
                            {el.label ? `: ${el.label}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-nexus-text-faint">
                        Removed · {comparison.removedElements.length}
                      </p>
                      <ul className="space-y-1 text-xs text-nexus-text-muted">
                        {comparison.removedElements.map((el) => (
                          <li key={el.id}>
                            {el.type}
                            {el.label ? `: ${el.label}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-nexus-text-faint">
                        Changed · {comparison.changedElements.length}
                      </p>
                      <ul className="space-y-1 text-xs text-nexus-text-muted">
                        {comparison.changedElements.map(({ after }) => (
                          <li key={after.id}>
                            {after.type}
                            {after.label ? `: ${after.label}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
